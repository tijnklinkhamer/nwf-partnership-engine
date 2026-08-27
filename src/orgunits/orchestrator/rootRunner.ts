/**
 * THE BOUNDED DISCOVERY ORCHESTRATOR FOR ONE ROOT.
 *
 * trusted root -> robots bootstrap -> sitemap discovery -> root-page
 * bootstrap -> bounded deterministic frontier -> robots-governed page
 * requests -> safe same-domain redirect continuation -> safe anchor
 * discovery -> Track A/Track B scheduling -> page evidence -> candidate
 * scoring -> append-only candidate persistence -> explicit root outcome.
 *
 * EVERY NETWORK REQUEST GOES THROUGH `authoriseAndFetchPage` (robots.ts),
 * the one production caller of the one gateway. This module owns no socket,
 * calls no fetch primitive of its own, and imports no
 * node:net/tls/http/https/dns - it decides
 * WHICH URL to request next, WHETHER a host may still be reached (host cap,
 * circuit breaker), and HOW LONG to wait before reaching it (pacing).
 *
 * ONE ROOT, ONE CALL. Two independent roots for the same organisation (an
 * ECHE claim and an FR-register claim, say) are two separate calls with
 * separate state - nothing here shares a frontier, a circuit breaker or a
 * robots cache across roots, so a failure on one root cannot suppress or
 * rewrite the other (spec "root independence").
 */
import type pg from 'pg';
import { authoriseAndFetchPage, createRobotsCache, type RobotsCache } from '../web/robots.js';
import { resolveRoot, WebGatewayRefusal, type RootAuthorityRef } from '../web/authority.js';
import { checkHostAdmissible } from '../web/hostPolicy.js';
import { checkRootScope, validateRequestUrl, type ValidatedUrl } from '../web/url.js';
import { hasBinaryFileExtension, hasCartActionQueryParam } from '../signals/packs/universal.js';
import { rawPathname } from '../signals/tree.js';
import type { WebAttemptResult, WebTransport } from '../web/gateway.js';
import { extractDiscoveryAnchors, resolveAnchorHref } from './anchors.js';
import {
  createHostCircuitBreaker,
  type HostCircuitBreaker,
  type TransientFailureKind,
} from './circuitBreaker.js';
import { realClock, type Clock } from './clock.js';
import {
  MAX_HOSTS_PER_ROOT,
  MAX_PAGE_ATTEMPTS_PER_ROOT,
  MAX_REDIRECT_CONTINUATION_HOPS,
  MIN_HOST_PACING_SECONDS,
  TRACK_B_FLOOR,
} from './constants.js';
import { createFrontier, type Frontier } from './frontier.js';
import { RequestBudget, TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON } from './requestBudget.js';
import { deriveEligiblePage, persistCollectedPages, type CollectedPage } from './pageCollection.js';
import { scoreAndPersistCandidates, type PersistedCandidateSummary } from './candidates.js';
import {
  conventionalSitemapUrl,
  discoverSitemapUrls,
  type SitemapFetchOutcome,
} from '../sitemap.js';

const TRANSIENT_ERROR_KINDS: ReadonlySet<string> = new Set([
  'CONNECT_TIMEOUT',
  'READ_TIMEOUT',
  'CONNECTION_REFUSED',
  'CONNECTION_RESET',
  'TLS_FAILURE',
]);

export type RootTerminalReason =
  | 'INVALID_ROOT_AUTHORITY'
  | 'ROOT_REQUEST_REFUSED'
  | 'CROSS_DOMAIN_REDIRECT_REQUIRES_PROMOTION'
  | 'ROBOTS_BLOCKED_ROOT'
  | 'ROBOTS_UNREADABLE_ROOT'
  | 'PAGE_BUDGET_EXHAUSTED'
  | typeof TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON
  | 'ALL_REMAINING_HOSTS_INADMISSIBLE'
  | 'NO_ELIGIBLE_HTML'
  | 'COMPLETED_WITH_CANDIDATES'
  | 'COMPLETED_WITH_NO_PROMISING_CANDIDATES';

export interface RootSummary {
  readonly rootKey: string | null;
  readonly terminalReason: RootTerminalReason;
  readonly totalRequests: number;
  readonly pageAttempts: number;
  readonly robotsRequests: number;
  readonly sitemapRequests: number;
  readonly sitemapUrlsAccepted: number;
  readonly hostsUsed: readonly string[];
  readonly frontierUrlsObserved: number;
  readonly pagesWithEvidence: number;
  readonly candidateEvaluations: number;
  readonly trackASelected: number;
  readonly trackBSelected: number;
  readonly circuitOpenHosts: readonly string[];
  readonly candidates: readonly PersistedCandidateSummary[];
  /**
   * The `WebGatewayRefusal.reason` that ended this root's acquisition early
   * (e.g. `HOST_IS_SERVICE_SUBDOMAIN`), when `terminalReason` is
   * `ROOT_REQUEST_REFUSED`. Null otherwise. This root's OWN operational
   * outcome, never a run-level infrastructure failure - see
   * `runOrganisationDiscovery`, which still fails the whole run on anything
   * that is NOT a `WebGatewayRefusal`.
   */
  readonly refusalDetail: string | null;
}

export interface RootRunnerDeps {
  transport?: WebTransport;
  clock?: Clock;
}

/** Per-host sequential pacing, using an injectable clock (production: real timers; tests: `createFakeClock()`). */
class HostPacer {
  private readonly lastTurnAt = new Map<string, number>();
  constructor(private readonly clock: Clock) {}

  async waitForSlot(host: string, minDelaySeconds: number): Promise<void> {
    const key = host.toLowerCase();
    const last = this.lastTurnAt.get(key);
    if (last !== undefined) {
      const minMs = minDelaySeconds * 1000;
      const elapsed = this.clock.now() - last;
      if (elapsed < minMs) await this.clock.sleep(minMs - elapsed);
    }
    this.lastTurnAt.set(key, this.clock.now());
  }
}

function invalidAuthoritySummary(): RootSummary {
  return {
    rootKey: null,
    terminalReason: 'INVALID_ROOT_AUTHORITY',
    totalRequests: 0,
    pageAttempts: 0,
    robotsRequests: 0,
    sitemapRequests: 0,
    sitemapUrlsAccepted: 0,
    hostsUsed: [],
    frontierUrlsObserved: 0,
    pagesWithEvidence: 0,
    candidateEvaluations: 0,
    trackASelected: 0,
    trackBSelected: 0,
    circuitOpenHosts: [],
    candidates: [],
    refusalDetail: null,
  };
}

/**
 * Runs bounded discovery for ONE root and returns its explicit outcome. Never
 * silently returns "0 pages" without a terminal reason explaining why (spec
 * "no silent zero").
 */
export async function runRootAcquisition(
  pool: pg.Pool,
  runId: string,
  root: RootAuthorityRef,
  deps: RootRunnerDeps = {},
): Promise<RootSummary> {
  const transport = deps.transport;
  const clock = deps.clock ?? realClock;

  let resolved;
  try {
    resolved = await resolveRoot(pool, root);
  } catch (error) {
    if (error instanceof WebGatewayRefusal) return invalidAuthoritySummary();
    throw error;
  }
  const rootUrl: ValidatedUrl = resolved.rootUrl;
  const rootKey = resolved.rootKey;

  const cache: RobotsCache = createRobotsCache();
  const circuitBreaker: HostCircuitBreaker = createHostCircuitBreaker();
  const pacer = new HostPacer(clock);
  const frontier: Frontier = createFrontier();
  const hostsUsed = new Set<string>();
  const hostCrawlDelay = new Map<string, number>();
  // Every URL this root has already attempted (root bootstrap, frontier pick,
  // or a followed redirect target) - keyed on the exact requested-URL string,
  // which is the same identity `executeWebAttempt` itself keys a duplicate
  // refusal on (gateway.ts's `findExistingAttempt`). The frontier's own
  // admission dedup only knows about URLs discovered THROUGH it, so it alone
  // cannot prevent a redirect chain, or a self-linking anchor, from
  // re-offering the ROOT's own URL or an earlier redirect hop's target - both
  // reachable outside frontier.add(). Checked and populated HERE, before any
  // pacing wait or gateway call, so a revisit is a graceful skip (the same
  // "not fetched, loop continues" treatment as BLOCKED/HOST_CAP/CIRCUIT_OPEN)
  // rather than an uncaught WebGatewayRefusal('DUPLICATE_ATTEMPT') escaping
  // runRootAcquisition and turning one root's entirely ordinary redirect loop
  // into the whole run's FAILED completion (see the dedicated redirect-loop
  // test for the scenario this closes).
  const attemptedUrls = new Set<string>();
  const collectedPages: CollectedPage[] = [];

  const budget = new RequestBudget();
  let pageAttempts = 0;
  let robotsRequests = 0;
  let sitemapRequests = 0;
  let sitemapUrlsAccepted = 0;
  let trackASelected = 0;
  let trackBSelected = 0;

  let budgetStopReason:
    'PAGE_BUDGET_EXHAUSTED' | typeof TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON | null = null;
  let allHostsInadmissibleStop = false;
  let rootRobotsBlockedDecision: 'DISALLOWED' | 'ROBOTS_UNREADABLE' | null = null;
  let rootCrossDomainRedirectStopped = false;
  // A WebGatewayRefusal that escaped the ordinary control-flow paths below
  // (attemptUrl's BLOCKED/HOST_CAP/CIRCUIT_OPEN/ALREADY_ATTEMPTED/
  // BUDGET_EXCEEDED statuses handle every EXPECTED refusal without throwing) -
  // e.g. an approved root, or its site-policy bootstrap request, whose host
  // itself carries a service-subdomain label. Caught around steps 1-3 below
  // and turned into this root's own explicit terminal outcome, so ONE root's
  // unusual refusal cannot suppress or rewrite an organisation's OTHER
  // independent root (the shadow-validation "root suppression" defect: an
  // http root's own site-policy bootstrap request refused itself as a scheme
  // downgrade - fixed at its source in url.ts's checkRootScope - and the SAME
  // escape path could reach here from any other WebGatewayRefusal, so the
  // isolation is general, not specific to that one cause). Anything that is
  // NOT a WebGatewayRefusal (a genuine infrastructure failure: a lost
  // database connection, a programming defect) is deliberately RE-THROWN
  // below, never caught here - it must still fail the whole run, honestly,
  // exactly as it did before this correction.
  let rootRequestRefusal: WebGatewayRefusal | null = null;

  // ------------------------------------------------------------- trust gates

  function admissibleUrl(candidateUrl: string): boolean {
    const validated = validateRequestUrl(candidateUrl);
    if (!validated.ok) return false;
    const scope = checkRootScope(rootUrl, validated.value);
    if (!scope.ok) return false;
    const hostVerdict = checkHostAdmissible(
      validated.value.hostname,
      validated.value.registrableDomain,
    );
    if (!hostVerdict.ok) return false;
    if (hasBinaryFileExtension(rawPathname(validated.value.url))) return false;
    // Shadow validation Pass B: a state-mutating WooCommerce cart action is
    // refused BEFORE any request, for every discovery method this gate
    // covers (anchors, sitemap entries, safe redirect targets) - see
    // hasCartActionQueryParam's own doc comment.
    if (hasCartActionQueryParam(validated.value.url)) return false;
    return true;
  }

  function isHostCurrentlyAdmissible(hostname: string): boolean {
    const key = hostname.toLowerCase();
    if (circuitBreaker.isOpen(key)) return false;
    if (!hostsUsed.has(key) && hostsUsed.size >= MAX_HOSTS_PER_ROOT) return false;
    return true;
  }

  // -------------------------------------------------------- the one attempt

  type AttemptStatus =
    | { status: 'FETCHED'; result: WebAttemptResult; robotsFetched: boolean }
    | { status: 'BLOCKED'; decision: 'DISALLOWED' | 'ROBOTS_UNREADABLE'; robotsFetched: boolean }
    | { status: 'HOST_CAP' }
    | { status: 'CIRCUIT_OPEN' }
    | { status: 'ALREADY_ATTEMPTED' }
    | { status: 'BUDGET_EXCEEDED' };

  async function attemptUrl(
    url: string,
    discoveryMethod: 'ROOT' | 'LINK' | 'SITEMAP',
    discoveryParentUrl: string | null,
    budgetClass: 'page' | 'sitemap',
  ): Promise<AttemptStatus> {
    let hostname: string;
    let scheme: string;
    try {
      const parsed = new URL(url);
      hostname = parsed.hostname.toLowerCase();
      scheme = parsed.protocol;
    } catch {
      return { status: 'BUDGET_EXCEEDED' };
    }

    // A revisit of an already-attempted URL (a redirect loop, or a page that
    // anchors back to itself or to the root) is refused HERE, gracefully,
    // rather than reaching the gateway's own DUPLICATE_ATTEMPT refusal - see
    // the comment on `attemptedUrls` above.
    if (attemptedUrls.has(url)) return { status: 'ALREADY_ATTEMPTED' };

    if (!hostsUsed.has(hostname) && hostsUsed.size >= MAX_HOSTS_PER_ROOT)
      return { status: 'HOST_CAP' };
    if (circuitBreaker.isOpen(hostname)) return { status: 'CIRCUIT_OPEN' };

    const needsRobots = cache.get(runId, scheme, hostname) === undefined;
    const predictedCost = (needsRobots ? 1 : 0) + 1;
    // Checked BEFORE any pacing wait and before authoriseAndFetchPage below -
    // refusal here means zero network activity for this attempt, and the
    // primitive itself (requestBudget.ts) is what a dedicated unit test
    // drives to and past its ceiling directly.
    if (!budget.canAfford(predictedCost)) return { status: 'BUDGET_EXCEEDED' };
    if (budgetClass === 'page' && pageAttempts >= MAX_PAGE_ATTEMPTS_PER_ROOT) {
      return { status: 'BUDGET_EXCEEDED' };
    }

    attemptedUrls.add(url);

    const delay = hostCrawlDelay.get(hostname) ?? MIN_HOST_PACING_SECONDS;
    await pacer.waitForSlot(hostname, delay);

    const result = await authoriseAndFetchPage(
      pool,
      cache,
      { runId, root, targetUrl: url, attemptNo: 1, discoveryMethod, discoveryParentUrl },
      transport,
    );

    hostsUsed.add(hostname);
    const robotsFetched = result.robots.robotsFetch.fetchResult !== null;
    if (robotsFetched) {
      budget.consume(1);
      robotsRequests += 1;
    }
    if (result.robots.effectiveCrawlDelaySeconds !== null) {
      hostCrawlDelay.set(
        hostname,
        Math.max(MIN_HOST_PACING_SECONDS, result.robots.effectiveCrawlDelaySeconds),
      );
    } else if (!hostCrawlDelay.has(hostname)) {
      hostCrawlDelay.set(hostname, MIN_HOST_PACING_SECONDS);
    }

    if (result.kind === 'BLOCKED') {
      const decision = result.robots.authorisation.decision;
      return {
        status: 'BLOCKED',
        decision: decision === 'DISALLOWED' ? 'DISALLOWED' : 'ROBOTS_UNREADABLE',
        robotsFetched,
      };
    }

    budget.consume(1);
    if (budgetClass === 'page') pageAttempts += 1;
    else sitemapRequests += 1;

    updateCircuitBreaker(hostname, result.fetch);
    return { status: 'FETCHED', result: result.fetch, robotsFetched };
  }

  function updateCircuitBreaker(hostname: string, fetch: WebAttemptResult): void {
    if (fetch.errorKind === null) {
      circuitBreaker.recordSuccess(hostname);
    } else if (fetch.errorKind === 'DNS_FAILURE') {
      circuitBreaker.recordTerminalFailure(hostname, 'DNS_FAILURE');
    } else if (fetch.errorKind === 'BLOCKED_BY_POLICY') {
      // Reached only for an ACTUALLY attempted request (robots DISALLOWED
      // never reaches the gateway at all - see robots.ts), so this means the
      // gateway itself refused every resolved address as forbidden: a
      // host-terminal fact, not a page-level one.
      circuitBreaker.recordTerminalFailure(hostname, 'HOST_ADDRESS_FORBIDDEN');
    } else if (TRANSIENT_ERROR_KINDS.has(fetch.errorKind ?? '')) {
      circuitBreaker.recordTransientFailure(hostname, fetch.errorKind as TransientFailureKind);
    } else {
      // RESPONSE_TOO_LARGE / OTHER / no error (any HTTP status): page-level,
      // never evidence the host itself is dead.
      circuitBreaker.recordPageLevelIssue(hostname);
    }
  }

  // ------------------------------------------------ evidence + anchor intake

  function ingestFetchedPage(fetch: WebAttemptResult): void {
    const derived = deriveEligiblePage(fetch, rootKey, new URL(fetch.requestedUrl).hostname);
    if (derived.outcome !== 'ELIGIBLE') return;
    collectedPages.push(derived.page);

    for (const anchor of extractDiscoveryAnchors(derived.decodedHtml)) {
      const resolution = resolveAnchorHref(fetch.requestedUrl, anchor.hrefRaw);
      if (!resolution.ok) continue;
      if (!admissibleUrl(resolution.url)) continue;
      frontier.add(resolution.url, 'LINK', fetch.requestedUrl, anchor.text);
    }
  }

  /**
   * Follows a SAFE, same-domain redirect chain up to the hop cap. Stops
   * (without following) on any cross-domain hop, recording it.
   *
   * EXACT HOP SEMANTICS (pinned here because no ADR prose stated it before
   * this correction pass, and "off by one" is exactly the kind of thing that
   * silently drifts): the caller passes `hopsRemaining = MAX_REDIRECT_CONTINUATION_HOPS`
   * (5) for the FIRST redirect a root or an ordinary page attempt produces.
   * Each hop this function decides to follow consumes exactly one gateway
   * attempt and recurses with `hopsRemaining - 1`. `hopsRemaining <= 0` is
   * checked BEFORE that hop's target is ever attempted, so a chain of six
   * redirect responses (root -> 1 -> 2 -> 3 -> 4 -> 5 -> 6) has its first FIVE
   * hops followed (root->1, 1->2, 2->3, 3->4, 4->5) and the SIXTH target
   * (5's redirect to 6) refused before any DNS lookup or gateway call for it
   * - "five redirect responses may be continued, the sixth target is
   * refused", never a sixth hop actually attempted. See the dedicated
   * redirect-hop-cap integration test.
   */
  async function followRedirectIfSafe(
    fetch: WebAttemptResult,
    hopsRemaining: number,
  ): Promise<void> {
    const redirect = fetch.redirect;
    if (redirect === null) return;
    if (redirect.targetMalformed || redirect.toUrlResolved === null) return;
    if (redirect.registrableDomainChanged === true) {
      rootCrossDomainRedirectStopped = true;
      return;
    }
    if (redirect.schemeDowngraded === true) return;
    if (hopsRemaining <= 0) return;
    if (!admissibleUrl(redirect.toUrlResolved)) return;

    const targetHost = new URL(redirect.toUrlResolved).hostname.toLowerCase();
    if (!isHostCurrentlyAdmissible(targetHost)) return;
    if (pageAttempts >= MAX_PAGE_ATTEMPTS_PER_ROOT) return;

    const attempt = await attemptUrl(redirect.toUrlResolved, 'LINK', fetch.requestedUrl, 'page');
    if (attempt.status === 'FETCHED') {
      ingestFetchedPage(attempt.result);
      await followRedirectIfSafe(attempt.result, hopsRemaining - 1);
    }
  }

  try {
    // -------------------------------------------------------------- 1. robots + root bootstrap

    const rootHost = rootUrl.hostname;
    const rootAttempt = await attemptUrl(rootUrl.url, 'ROOT', null, 'page');

    if (rootAttempt.status === 'FETCHED') {
      ingestFetchedPage(rootAttempt.result);
      await followRedirectIfSafe(rootAttempt.result, MAX_REDIRECT_CONTINUATION_HOPS);
    } else if (rootAttempt.status === 'BLOCKED') {
      rootRobotsBlockedDecision = rootAttempt.decision;
    }

    // ------------------------------------------------------------- 2. sitemap discovery

    // Sitemap: directives, read from the policy cached while evaluating the
    // root host above (the site policy file is fetched at most once per host
    // per run - robots.ts's own RobotsCache - so this is a cache read, not a
    // new request).
    const cachedRootPolicy = cache.get(runId, rootUrl.scheme, rootHost);
    const evaluatedSitemapDirectives =
      cachedRootPolicy === undefined ? [] : (await cachedRootPolicy).sitemapUrls;
    const seedUrls =
      evaluatedSitemapDirectives.length > 0
        ? evaluatedSitemapDirectives
            .map((raw) => resolveSitemapDirective(raw, rootUrl.url))
            .filter((u): u is string => u !== null)
        : [conventionalSitemapUrl(rootUrl.url)];

    const fetchSitemapDocument = async (url: string): Promise<SitemapFetchOutcome> => {
      const hostname = (() => {
        try {
          return new URL(url).hostname.toLowerCase();
        } catch {
          return '';
        }
      })();
      if (!isHostCurrentlyAdmissible(hostname)) return { ok: false };
      const attempt = await attemptUrl(url, 'SITEMAP', null, 'sitemap');
      if (attempt.status !== 'FETCHED' || attempt.result.body === null) return { ok: false };
      if (
        attempt.result.httpStatus === null ||
        attempt.result.httpStatus < 200 ||
        attempt.result.httpStatus >= 300
      ) {
        return { ok: false };
      }
      return {
        ok: true,
        body: attempt.result.body.toString('utf-8'),
        contentType: attempt.result.contentType,
      };
    };

    const sitemapResult = await discoverSitemapUrls(seedUrls, admissibleUrl, fetchSitemapDocument);
    for (const { url } of sitemapResult.pageUrls) {
      if (!admissibleUrl(url)) continue;
      const admission = frontier.add(url, 'SITEMAP', null, null);
      if (admission.ok) sitemapUrlsAccepted += 1;
    }

    // -------------------------------------------------------------- 3. main loop

    while (true) {
      if (pageAttempts >= MAX_PAGE_ATTEMPTS_PER_ROOT) {
        budgetStopReason = 'PAGE_BUDGET_EXHAUSTED';
        break;
      }
      if (!budget.canAfford(1)) {
        budgetStopReason = TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON;
        break;
      }
      const next = frontier.pickNext(trackBSelected, TRACK_B_FLOOR, isHostCurrentlyAdmissible);
      if (next === null) {
        if (frontier.size > 0) allHostsInadmissibleStop = true;
        break;
      }

      const attempt = await attemptUrl(
        next.url,
        next.discoveryMethod,
        next.discoveryParentUrl,
        'page',
      );
      if (attempt.status === 'FETCHED') {
        const trackAScore = next.score.tracks.find((t) => t.track === 'A')?.score ?? 0;
        const trackBScore = next.score.tracks.find((t) => t.track === 'B')?.score ?? 0;
        if (trackAScore > 0) trackASelected += 1;
        if (trackBScore > 0) trackBSelected += 1;
        ingestFetchedPage(attempt.result);
        await followRedirectIfSafe(attempt.result, MAX_REDIRECT_CONTINUATION_HOPS);
      } else if (attempt.status === 'BUDGET_EXCEEDED') {
        budgetStopReason =
          pageAttempts >= MAX_PAGE_ATTEMPTS_PER_ROOT
            ? 'PAGE_BUDGET_EXHAUSTED'
            : TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON;
        break;
      }
      // BLOCKED / HOST_CAP / CIRCUIT_OPEN / ALREADY_ATTEMPTED: this URL is simply not fetched; loop continues to the next frontier entry.
    }
  } catch (error) {
    if (!(error instanceof WebGatewayRefusal)) throw error;
    rootRequestRefusal = error;
  }

  // -------------------------------------------------------------- 4. persist evidence + candidates

  const persistResult = await persistCollectedPages(pool, collectedPages);
  const persistedPages = persistResult.pages;
  const candidateInputs = persistedPages.map((page) => ({
    pageEvidenceId: page.id,
    rootKey: page.rootKey,
    url: page.url,
    title: page.title,
    headings: page.headings,
  }));
  const candidates = await scoreAndPersistCandidates(pool, runId, candidateInputs);

  // A page-evidence persistence failure is NOT a root-level operational
  // outcome - it is thrown here, AFTER candidates were scored and persisted
  // for every page that DID succeed, so this root keeps the maximum evidence
  // it legitimately gathered rather than losing it to one bad row. Thrown
  // outside the try/catch above (so it is never mistaken for a
  // WebGatewayRefusal): it propagates to runOrganisationDiscovery and fails
  // the whole run, honestly, exactly like any other infrastructure failure.
  if (persistResult.failures.length > 0) {
    const first = persistResult.failures[0]!;
    throw new Error(
      `page evidence persistence failed for ${persistResult.failures.length} of ` +
        `${collectedPages.length} collected page(s) under root ${rootKey}; first failure at ` +
        `${first.url}: ${first.message}`,
    );
  }

  // -------------------------------------------------------------- 5. terminal reason

  let terminalReason: RootTerminalReason;
  if (rootRequestRefusal !== null) {
    terminalReason = 'ROOT_REQUEST_REFUSED';
  } else if (budgetStopReason !== null) {
    terminalReason = budgetStopReason;
  } else if (allHostsInadmissibleStop) {
    terminalReason = 'ALL_REMAINING_HOSTS_INADMISSIBLE';
  } else if (collectedPages.length === 0) {
    if (rootRobotsBlockedDecision === 'DISALLOWED') terminalReason = 'ROBOTS_BLOCKED_ROOT';
    else if (rootRobotsBlockedDecision === 'ROBOTS_UNREADABLE')
      terminalReason = 'ROBOTS_UNREADABLE_ROOT';
    else if (rootCrossDomainRedirectStopped)
      terminalReason = 'CROSS_DOMAIN_REDIRECT_REQUIRES_PROMOTION';
    else terminalReason = 'NO_ELIGIBLE_HTML';
  } else {
    const anyPromising = candidates.some((c) => c.score > 0);
    terminalReason = anyPromising
      ? 'COMPLETED_WITH_CANDIDATES'
      : 'COMPLETED_WITH_NO_PROMISING_CANDIDATES';
  }

  return {
    rootKey,
    terminalReason,
    totalRequests: budget.totalConsumed,
    pageAttempts,
    robotsRequests,
    sitemapRequests,
    sitemapUrlsAccepted,
    hostsUsed: [...hostsUsed].sort(),
    frontierUrlsObserved: frontier.totalObserved,
    pagesWithEvidence: persistedPages.length,
    candidateEvaluations: candidates.length,
    trackASelected,
    trackBSelected,
    circuitOpenHosts: circuitBreaker.openHosts(),
    candidates,
    refusalDetail: rootRequestRefusal?.reason ?? null,
  };
}

/** Resolves a `Sitemap:` directive value (which need not be absolute) against the root's site-policy-file URL. */
function resolveSitemapDirective(raw: string, rootUrlString: string): string | null {
  try {
    return new URL(raw, rootUrlString).toString();
  } catch {
    return null;
  }
}

/**
 * B1.1 OFFLINE FRONTIER REPLAY - A PURE MODEL OF ONE ROOT'S ACQUISITION LOOP.
 *
 * Drives a frontier (the production v8 `Frontier`, or the test-only
 * `FrozenV7Frontier`) over a SYNTHETIC site with the same control flow as
 * `runRootAcquisition` (`src/orgunits/orchestrator/rootRunner.ts`), so the
 * two scheduling policies can be compared under identical sites, admission
 * gates and budgets. Nothing here opens a socket, a database connection or a
 * file, reads the clock or draws a random number.
 *
 * WHAT IS MIRRORED FROM rootRunner.ts, EXACTLY:
 *   - root bootstrap as a 'page' attempt, then ONE sitemap request, then the
 *     main loop;
 *   - the frozen budgets: 35 page attempts, 60 total requests, 8 hosts and the
 *     Track B floor of 8, imported from `constants.ts`, never restated;
 *   - the worst-case site-policy cost prediction (3 + 1 for an uncached host)
 *     before an attempt, and the per-host site-policy request charged once;
 *   - BLOCKED (site policy disallows) consumes no page attempt;
 *   - a frontier pick is removed whatever its outcome - no retry;
 *   - the Track A/B selected counters advance on FETCHED only, on the picked
 *     entry's frontier scores, exactly as the main loop does;
 *   - safe same-domain redirects are attempted directly (never through the
 *     frontier) up to `MAX_REDIRECT_CONTINUATION_HOPS`;
 *   - the real admission gates: `validateRequestUrl`, `checkRootScope`,
 *     `checkHostAdmissible`, the binary-extension refusal, and the anchor cap;
 *   - the real `HostCircuitBreaker`.
 *
 * WHAT IS SIMPLIFIED, AND WHY IT DOES NOT FAVOUR EITHER POLICY:
 *   - every site-policy file resolves in ONE request (no continuation, no
 *     transport retry) - a per-host constant, identical under v7 and v8;
 *   - every host has the same synthetic site-policy allow/disallow prefixes;
 *   - pacing is not modelled: it changes wall-clock, never order;
 *   - page evidence and candidate persistence are not modelled: B1.1 changes
 *     neither.
 */
import { hasBinaryFileExtension } from '../../../orgunits/signals/packs/universal.js';
import { rawPathname } from '../../../orgunits/signals/tree.js';
import {
  MAX_DISCOVERED_ANCHORS_PER_PAGE,
  MAX_HOSTS_PER_ROOT,
  MAX_PAGE_ATTEMPTS_PER_ROOT,
  MAX_REDIRECT_CONTINUATION_HOPS,
  MAX_TOTAL_REQUESTS_PER_ROOT,
  TRACK_B_FLOOR,
} from '../../../orgunits/orchestrator/constants.js';
import { createHostCircuitBreaker } from '../../../orgunits/orchestrator/circuitBreaker.js';
import type {
  FrontierAdmission,
  FrontierDiscoveryMethod,
  FrontierEntry,
} from '../../../orgunits/orchestrator/frontier.js';
import { checkHostAdmissible } from '../../../orgunits/web/hostPolicy.js';
import { checkRootScope, validateRequestUrl } from '../../../orgunits/web/url.js';

export interface FrontierLike {
  add(
    url: string,
    discoveryMethod: FrontierDiscoveryMethod,
    discoveryParentUrl: string | null,
    anchorText: string | null,
  ): FrontierAdmission;
  pickNext(
    trackBSelected: number,
    trackBFloor: number,
    isHostAdmissible: (hostname: string) => boolean,
  ): FrontierEntry | null;
  readonly size: number;
}

export interface SyntheticLink {
  readonly href: string;
  readonly text: string | null;
}

export type PageBehaviour =
  | { readonly kind: 'HTML'; readonly links?: readonly SyntheticLink[] }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'REDIRECT'; readonly to: string }
  | { readonly kind: 'TIMEOUT' }
  | { readonly kind: 'DNS_FAILURE' };

export interface SyntheticSite {
  readonly id: string;
  readonly description: string;
  readonly root: string;
  /** URLs listed by the site's one sitemap document, in document order. */
  readonly sitemap: readonly string[];
  /** Any URL absent here answers 404. */
  readonly pages: Readonly<Record<string, PageBehaviour>>;
  /** Path prefixes the site policy disallows, on every host. */
  readonly disallowPrefixes?: readonly string[];
  /** The labelled synthetic targets. Relevance is a SYNTHETIC label, not a real-world finding. */
  readonly relevant: readonly string[];
  /** The subset of `relevant` whose loss must be investigated (Gate 4). */
  readonly highRelevance: readonly string[];
  /** Off-domain URLs a page links to that must never be discovered or requested. */
  readonly outOfScope?: readonly string[];
}

export type PickStatus =
  | 'FETCHED_HTML'
  | 'FETCHED_NOT_FOUND'
  | 'FETCHED_REDIRECT'
  | 'FETCHED_TRANSPORT_FAILURE'
  | 'BLOCKED'
  | 'ALREADY_ATTEMPTED'
  | 'HOST_CAP'
  | 'CIRCUIT_OPEN'
  | 'BUDGET_EXCEEDED';

export interface PickRecord {
  readonly url: string;
  readonly status: PickStatus;
  readonly trackBSelectedBefore: number;
  /** Every pending entry whose host was admissible at pick time, recorded only when asked. */
  readonly eligiblePool?: readonly FrontierEntry[] | undefined;
}

export interface ReplayResult {
  readonly picks: readonly PickRecord[];
  /** Every page-class attempt in issue order: root, frontier picks, redirect continuations. */
  readonly attemptedPages: readonly string[];
  readonly fetchedHtml: readonly string[];
  /** Every URL that reached frontier admission, plus the root and any redirect target. */
  readonly discovered: ReadonlySet<string>;
  readonly pageAttempts: number;
  readonly totalRequests: number;
  readonly robotsRequests: number;
  readonly sitemapRequests: number;
  readonly hostsUsed: readonly string[];
  readonly trackASelected: number;
  readonly trackBSelected: number;
  readonly stopReason:
    | 'PAGE_BUDGET_EXHAUSTED'
    | 'TOTAL_REQUEST_BUDGET_EXHAUSTED'
    | 'FRONTIER_EXHAUSTED'
    | 'ALL_HOSTS_INADMISSIBLE';
}

export interface ReplayOptions {
  /** Record each pick's eligible pool (for per-pick priority checks). Off by default: memory. */
  readonly recordPools?: boolean;
  /** Reorder the sitemap before admission - the insertion-order permutation tests. */
  readonly sitemapOrder?: (urls: readonly string[]) => readonly string[];
  /** Reorder each page's links before admission - the insertion-order permutation tests. */
  readonly linkOrder?: (links: readonly SyntheticLink[]) => readonly SyntheticLink[];
}

const TRANSIENT = new Set<PageBehaviour['kind']>(['TIMEOUT']);

export function replaySite(
  site: SyntheticSite,
  frontier: FrontierLike,
  options: ReplayOptions = {},
): ReplayResult {
  const rootValidation = validateRequestUrl(site.root);
  if (!rootValidation.ok) throw new Error(`fixture ${site.id}: invalid root ${site.root}`);
  const rootUrl = rootValidation.value;

  const circuitBreaker = createHostCircuitBreaker();
  const hostsUsed = new Set<string>();
  const policyResolved = new Set<string>();
  const attemptedUrls = new Set<string>();
  const pending = new Map<string, FrontierEntry>();
  const discovered = new Set<string>();
  const picks: PickRecord[] = [];
  const attemptedPages: string[] = [];
  const fetchedHtml: string[] = [];

  let totalRequests = 0;
  let pageAttempts = 0;
  let robotsRequests = 0;
  let sitemapRequests = 0;
  let trackASelected = 0;
  let trackBSelected = 0;

  const canAfford = (n: number): boolean => totalRequests + n <= MAX_TOTAL_REQUESTS_PER_ROOT;

  function admissibleUrl(candidate: string): boolean {
    const validated = validateRequestUrl(candidate);
    if (!validated.ok) return false;
    if (!checkRootScope(rootUrl, validated.value).ok) return false;
    if (!checkHostAdmissible(validated.value.hostname, validated.value.registrableDomain).ok) {
      return false;
    }
    if (hasBinaryFileExtension(rawPathname(validated.value.url))) return false;
    return true;
  }

  function isHostCurrentlyAdmissible(hostname: string): boolean {
    const key = hostname.toLowerCase();
    if (circuitBreaker.isOpen(key)) return false;
    if (!hostsUsed.has(key) && hostsUsed.size >= MAX_HOSTS_PER_ROOT) return false;
    return true;
  }

  function offer(
    url: string,
    method: FrontierDiscoveryMethod,
    parent: string | null,
    text: string | null,
  ): void {
    discovered.add(url);
    const admission = frontier.add(url, method, parent, text);
    if (admission.ok) pending.set(url, admission.entry);
  }

  type Attempt =
    | { status: 'FETCHED'; behaviour: PageBehaviour }
    | { status: 'BLOCKED' | 'ALREADY_ATTEMPTED' | 'HOST_CAP' | 'CIRCUIT_OPEN' | 'BUDGET_EXCEEDED' };

  function attemptUrl(url: string, budgetClass: 'page' | 'sitemap'): Attempt {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (attemptedUrls.has(url)) return { status: 'ALREADY_ATTEMPTED' };
    if (!hostsUsed.has(hostname) && hostsUsed.size >= MAX_HOSTS_PER_ROOT) {
      return { status: 'HOST_CAP' };
    }
    if (circuitBreaker.isOpen(hostname)) return { status: 'CIRCUIT_OPEN' };

    const needsPolicy = !policyResolved.has(hostname);
    const predictedCost = (needsPolicy ? 3 : 0) + 1;
    if (!canAfford(predictedCost)) return { status: 'BUDGET_EXCEEDED' };
    if (budgetClass === 'page' && pageAttempts >= MAX_PAGE_ATTEMPTS_PER_ROOT) {
      return { status: 'BUDGET_EXCEEDED' };
    }

    attemptedUrls.add(url);
    hostsUsed.add(hostname);
    if (needsPolicy) {
      policyResolved.add(hostname);
      totalRequests += 1;
      robotsRequests += 1;
    }

    const path = parsed.pathname;
    if ((site.disallowPrefixes ?? []).some((prefix) => path.startsWith(prefix))) {
      return { status: 'BLOCKED' };
    }

    totalRequests += 1;
    if (budgetClass === 'page') {
      pageAttempts += 1;
      attemptedPages.push(url);
    } else {
      sitemapRequests += 1;
    }

    const behaviour: PageBehaviour = site.pages[url] ?? { kind: 'NOT_FOUND' };
    if (behaviour.kind === 'DNS_FAILURE') {
      circuitBreaker.recordTerminalFailure(hostname, 'DNS_FAILURE');
    } else if (TRANSIENT.has(behaviour.kind)) {
      circuitBreaker.recordTransientFailure(hostname, 'CONNECT_TIMEOUT');
    } else {
      circuitBreaker.recordSuccess(hostname);
    }
    return { status: 'FETCHED', behaviour };
  }

  function ingest(url: string, behaviour: PageBehaviour): void {
    if (behaviour.kind !== 'HTML') return;
    fetchedHtml.push(url);
    const ordered = options.linkOrder
      ? options.linkOrder(behaviour.links ?? [])
      : (behaviour.links ?? []);
    let admitted = 0;
    for (const link of ordered) {
      let resolved: string;
      try {
        resolved = new URL(link.href, url).toString();
      } catch {
        continue;
      }
      resolved = resolved.replace(/#.*$/, '');
      if (!admissibleUrl(resolved)) continue;
      if (admitted >= MAX_DISCOVERED_ANCHORS_PER_PAGE) break;
      admitted += 1;
      offer(resolved, 'LINK', url, link.text);
    }
  }

  function followRedirect(behaviour: PageBehaviour, from: string, hopsRemaining: number): void {
    if (behaviour.kind !== 'REDIRECT') return;
    let target: string;
    try {
      target = new URL(behaviour.to, from).toString();
    } catch {
      return;
    }
    const targetValidation = validateRequestUrl(target);
    if (!targetValidation.ok) return;
    if (targetValidation.value.registrableDomain !== rootUrl.registrableDomain) return;
    if (hopsRemaining <= 0) return;
    if (!admissibleUrl(target)) return;
    if (!isHostCurrentlyAdmissible(targetValidation.value.hostname)) return;
    if (pageAttempts >= MAX_PAGE_ATTEMPTS_PER_ROOT) return;
    discovered.add(target);
    const attempt = attemptUrl(target, 'page');
    if (attempt.status === 'FETCHED') {
      ingest(target, attempt.behaviour);
      followRedirect(attempt.behaviour, target, hopsRemaining - 1);
    }
  }

  // 1. root bootstrap
  discovered.add(rootUrl.url);
  const rootAttempt = attemptUrl(rootUrl.url, 'page');
  if (rootAttempt.status === 'FETCHED') {
    ingest(rootUrl.url, rootAttempt.behaviour);
    followRedirect(rootAttempt.behaviour, rootUrl.url, MAX_REDIRECT_CONTINUATION_HOPS);
  }

  // 2. one sitemap document
  const sitemapUrl = new URL('/sitemap.xml', rootUrl.url).toString();
  const sitemapAttempt = attemptUrl(sitemapUrl, 'sitemap');
  if (sitemapAttempt.status === 'FETCHED' && site.sitemap.length > 0) {
    const ordered = options.sitemapOrder ? options.sitemapOrder(site.sitemap) : site.sitemap;
    for (const url of ordered) {
      if (!admissibleUrl(url)) continue;
      offer(url, 'SITEMAP', null, null);
    }
  }

  // 3. main loop
  let stopReason: ReplayResult['stopReason'] = 'FRONTIER_EXHAUSTED';
  while (true) {
    if (pageAttempts >= MAX_PAGE_ATTEMPTS_PER_ROOT) {
      stopReason = 'PAGE_BUDGET_EXHAUSTED';
      break;
    }
    if (!canAfford(1)) {
      stopReason = 'TOTAL_REQUEST_BUDGET_EXHAUSTED';
      break;
    }
    const pool = options.recordPools
      ? [...pending.values()].filter((e) => isHostCurrentlyAdmissible(new URL(e.url).hostname))
      : undefined;
    const trackBSelectedBefore = trackBSelected;
    const next = frontier.pickNext(trackBSelected, TRACK_B_FLOOR, isHostCurrentlyAdmissible);
    if (next === null) {
      if (frontier.size > 0) stopReason = 'ALL_HOSTS_INADMISSIBLE';
      break;
    }
    pending.delete(next.url);

    const attempt = attemptUrl(next.url, 'page');
    let status: PickStatus;
    if (attempt.status === 'FETCHED') {
      const a = next.score.tracks.find((t) => t.track === 'A')?.score ?? 0;
      const b = next.score.tracks.find((t) => t.track === 'B')?.score ?? 0;
      if (a > 0) trackASelected += 1;
      if (b > 0) trackBSelected += 1;
      status =
        attempt.behaviour.kind === 'HTML'
          ? 'FETCHED_HTML'
          : attempt.behaviour.kind === 'REDIRECT'
            ? 'FETCHED_REDIRECT'
            : attempt.behaviour.kind === 'NOT_FOUND'
              ? 'FETCHED_NOT_FOUND'
              : 'FETCHED_TRANSPORT_FAILURE';
      picks.push({ url: next.url, status, trackBSelectedBefore, eligiblePool: pool });
      ingest(next.url, attempt.behaviour);
      followRedirect(attempt.behaviour, next.url, MAX_REDIRECT_CONTINUATION_HOPS);
      continue;
    }
    picks.push({ url: next.url, status: attempt.status, trackBSelectedBefore, eligiblePool: pool });
    if (attempt.status === 'BUDGET_EXCEEDED') {
      stopReason =
        pageAttempts >= MAX_PAGE_ATTEMPTS_PER_ROOT
          ? 'PAGE_BUDGET_EXHAUSTED'
          : 'TOTAL_REQUEST_BUDGET_EXHAUSTED';
      break;
    }
  }

  return {
    picks,
    attemptedPages,
    fetchedHtml,
    discovered,
    pageAttempts,
    totalRequests,
    robotsRequests,
    sitemapRequests,
    hostsUsed: [...hostsUsed].sort(),
    trackASelected,
    trackBSelected,
    stopReason,
  };
}

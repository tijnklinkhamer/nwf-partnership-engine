/**
 * ROBOTS ORCHESTRATION: fetch robots.txt THROUGH the gateway, evaluate it,
 * and authorise ONE ordinary page against the result.
 *
 * OWNS NO SOCKET. Every byte this module ever sees came from
 * `executeWebAttempt` (gateway.ts) - the same one socket owner every other
 * Phase 2B module answers to. This file only decides WHICH authority to
 * present to that function and WHAT the response meant.
 *
 * THE BOOTSTRAP PROBLEM, SOLVED NARROWLY
 *
 *   Evaluating a host's policy requires reading robots.txt, and reading
 *   robots.txt is itself a gateway request that needs an authority. The one
 *   bypass this module uses - `RobotsAuthorisation.forRobotsTxtBootstrap` -
 *   is scoped to exactly that one URL (robotsAuthority.ts "THE SCOPING
 *   PROBLEM") and produces nothing but `NOT_APPLICABLE`. There is no
 *   `skipRobots`, `ignoreRobots` or `forceAllowed` flag anywhere in this file:
 *   the only bypass is this one, exact-path-scoped exception, exactly once
 *   per host per run.
 *
 * ROBOTS.TXT FETCHED ONCE PER HOST PER RUN
 *
 *   `RobotsCache` is an explicit value the caller creates and threads through
 *   - never a module-level singleton. A module-level cache would leak across
 *   runs (and across unrelated test files sharing one process), which is
 *   exactly what "no global cross-run cache" forbids. Identity is
 *   `(runId, scheme, hostname)`: two hosts under the same registrable domain
 *   (`www.example.edu`, `international.example.edu`) evaluate INDEPENDENTLY,
 *   because robots.txt is a per-ORIGIN policy, never a per-registrable-domain
 *   one - fetching `www.example.edu/robots.txt` once does not authorise
 *   anything on `international.example.edu`.
 *
 * THE REDIRECT POSTURE, AS NARROWED BY ADR 0012 AND WIDENED BY ADR 0013
 *
 *   The GATEWAY still follows nothing. Every request this module makes is one
 *   GET against one explicitly authorised URL, and `executeWebAttempt` has no
 *   redirect-following code path at all. What ADR 0012 added is one
 *   SEPARATELY AUTHORISED SECOND REQUEST, decided HERE, after the first
 *   request's redirect facts were already derived and persisted - the same
 *   architectural shape ADR 0008 uses for ordinary pages: the gateway observes
 *   one request; orchestration decides whether another, independently
 *   validated one is permitted.
 *
 *   ADR 0013 ("Option C-lite") moved exactly one line of that boundary. The
 *   permission now covers ONE hop, to the SAME REGISTRABLE DOMAIN's own
 *   `/robots.txt`, under the same scheme or an http -> https upgrade, and
 *   nothing else (`continuationTargetFor`). A `www.` label gained or dropped
 *   inside one registrable domain is therefore continuable, where ADR 0012
 *   refused it.
 *
 *   WHY THAT IS NOT A RETURN TO FOLLOW-AND-PROCEED. RFC 9309 s2.3.1.2 states
 *   that a robots.txt reached through redirects - explicitly including
 *   redirects across authorities - MUST be "fetched, parsed, and its rules
 *   followed in the context of the INITIAL authority". That is precisely what
 *   this module does: the bytes retrieved from the redirect target govern the
 *   ORIGIN THAT WAS ASKED, for this resolution. ADR 0012 s3 refused a host
 *   change partly on the premise that a policy from another origin cannot
 *   govern the original one; ADR 0013 supersedes that premise, and that
 *   premise only. The redirect target is a POLICY RETRIEVAL ENDPOINT, never
 *   new crawl authority: nothing here promotes it, makes it a root, rewrites
 *   a website claim or changes organisation identity.
 *
 *   AND THE TARGET ORIGIN'S OWN CACHE ENTRY IS NOT WRITTEN. A same-hostname
 *   scheme upgrade still memoises its target origin, because the bytes
 *   literally ARE that origin's own policy file read from that origin's own
 *   URL. A HOST-CHANGING continuation does not, because they are not: they
 *   are the initial authority's policy, retrieved elsewhere. If this run
 *   later needs to crawl the target host, that host resolves its own policy
 *   through its own origin semantics - one more robots request, honestly
 *   charged.
 *
 *   Outside that shape, nothing moved: a 3xx leaves the policy unread and
 *   `EvaluatedRobotsPolicy.unavailable('REDIRECTED')` records that honestly -
 *   `ROBOTS_UNREADABLE` on every ordinary page this run subsequently attempts
 *   against that host. See robotsPolicy.ts for why that mapping is truthful
 *   under the landed taxonomy, with no migration required.
 *
 * WHAT THIS MODULE IS NOT
 *
 *   Not a frontier: `authoriseAndFetchPage` takes ONE target URL and returns.
 *   It does not read links, does not consult a sitemap, does not recurse, and
 *   does not retry. A caller that wants a second page calls this function
 *   again with a second URL - the robots cache is what makes that cheap for a
 *   repeat host, not an internal loop.
 *
 * PURE ORCHESTRATION. The only network activity anywhere in this file is
 * mediated entirely through `executeWebAttempt`.
 */
import type pg from 'pg';
import {
  executeWebAttempt,
  nodeWebTransport,
  type WebAttemptResult,
  type WebTransport,
} from './gateway.js';
import type { RootAuthorityRef } from './authority.js';
import { MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS, RESEARCH_USER_AGENT } from './policy.js';
import { RobotsAuthorisation } from './robotsAuthority.js';
import { EvaluatedRobotsPolicy } from './robotsPolicy.js';
import { validateRequestUrl } from './url.js';

/**
 * The PRODUCT token robots.txt `User-agent:` groups are matched against.
 *
 * Derived from `RESEARCH_USER_AGENT` - the SAME identity the gateway sends on
 * the wire, centralised in `policy.ts` - rather than declared as a second
 * literal: there is exactly one string this repository calls its own
 * identity, and this is a computed VIEW of it, not a second copy that could
 * drift.
 *
 * TWO THINGS ARE STRIPPED, NOT ONE, and both are load-bearing:
 *
 *   1. The parenthetical `(+https://newwavefluent.com/)` comment - a site's
 *      robots.txt names a product token, never the full User-Agent header
 *      text with its trailing comment.
 *   2. The `/1.0` version suffix - RFC 9309 s2.2.1's product-token grammar is
 *      `1*(%x2D / %x5F / %x41-5A / %x61-7A)`: hyphen, underscore and ASCII
 *      letters ONLY. No digits, no slash. `NWFPartnershipEngine-Research/1.0`
 *      is NOT a valid product-token under that grammar - it took stripping
 *      only the comment, in an earlier draft of this file, to notice the
 *      remaining `/1.0` was still wrong; `isRfc9309ProductToken` now pins the
 *      full contract by direct test so that regression cannot recur silently.
 *
 * The result, `NWFPartnershipEngine-Research`, is grammar-valid AND remains a
 * literal substring of `RESEARCH_USER_AGENT` - the two identities agree on
 * what this worker is called, just at two different specificities.
 */
export const ROBOTS_USER_AGENT_TOKEN = RESEARCH_USER_AGENT.replace(/\s*\([^)]*\)\s*$/, '').replace(
  /\/[0-9][0-9A-Za-z.-]*$/,
  '',
);

/**
 * An explicit, RUN-SCOPED cache of evaluated robots policies.
 *
 * Created fresh per run by the caller (`createRobotsCache()`) and threaded
 * through every call in that run. Never a module-level Map: that would be
 * exactly the "global cross-run cache" the design forbids, and would leak one
 * test's or one run's policy into an unrelated one sharing the same process.
 */
export class RobotsCache {
  private readonly entries = new Map<string, Promise<EvaluatedRobotsPolicy>>();
  private readonly policyRequestsByUrl = new Map<string, number>();

  /** `(runId, scheme, hostname)` - the exact policy-origin identity. */
  private key(runId: string, scheme: string, hostname: string): string {
    return `${runId}|${scheme}|${hostname.toLowerCase()}`;
  }

  /**
   * The `attemptNo` the NEXT site-policy request for this exact URL must
   * carry, counting from 1.
   *
   * WHY A COUNTER EXISTS AT ALL, AND WHY IT IS NOT A LOOPHOLE.
   *
   *   A gateway attempt's identity is `(run, root, url, policy version,
   *   attempt no)`, and a repeat of an identity already recorded is refused -
   *   by THROWING - as `DUPLICATE_ATTEMPT`. Rule 18 names the sanctioned
   *   answer: "a retry is the caller passing `attemptNo + 1`". This is that,
   *   and nothing more: it never suppresses a row, never reuses one, and
   *   never lets one request masquerade as another. Every request still gets
   *   its own observation.
   *
   * WHAT MADE IT NECESSARY (ADR 0013 s6).
   *
   *   A host-changing continuation fetches `example.edu/robots.txt` and does
   *   NOT memoise the result under the `example.edu` origin, because those
   *   bytes are the INITIAL authority's policy, not independently the target
   *   host's own. So when this run later needs to crawl `example.edu` for
   *   real, that origin correctly resolves its own policy - by requesting the
   *   IDENTICAL URL a second time. Under a fixed `attemptNo: 1` that second,
   *   genuinely different act would collide with the first one's identity and
   *   throw, ending the whole root.
   *
   *   The alternative - memoising the redirected bytes under the target
   *   origin - is exactly the policy-authority contamination ADR 0013 s6
   *   refuses. So the two requests are recorded as what they are: two
   *   attempts at one URL, made for two different reasons.
   *
   * IT IS BOUNDED. At most one bootstrap per origin per run (the cache above)
   * plus at most one continuation per origin, and every request is charged to
   * the run's total-request budget regardless. There is no path here that
   * loops.
   *
   * IN THE ORDINARY CASE THIS ALWAYS ANSWERS 1, so nothing about a site that
   * does not exhibit the host-changing shape is affected.
   */
  nextPolicyAttemptNo(runId: string, url: string): number {
    const key = `${runId}|${url}`;
    const next = (this.policyRequestsByUrl.get(key) ?? 0) + 1;
    this.policyRequestsByUrl.set(key, next);
    return next;
  }

  get(runId: string, scheme: string, hostname: string): Promise<EvaluatedRobotsPolicy> | undefined {
    return this.entries.get(this.key(runId, scheme, hostname));
  }

  set(
    runId: string,
    scheme: string,
    hostname: string,
    policy: Promise<EvaluatedRobotsPolicy>,
  ): void {
    this.entries.set(this.key(runId, scheme, hostname), policy);
  }
}

export function createRobotsCache(): RobotsCache {
  return new RobotsCache();
}

/**
 * Whether ONE HOST-CHANGING site-policy continuation may be issued to this
 * exact URL.
 *
 * ADR 0013 s8. Option B's continuation could never introduce a hostname, so
 * the distinct-host ceiling (`MAX_HOSTS_PER_ROOT`) was structurally untouched
 * by it. Option C-lite's can, so the decision belongs to the layer that
 * actually keeps that ledger - the orchestrator - and is asked here rather
 * than guessed. A robots request gets NO exemption from the host cap: if the
 * ceiling is reached, the continuation is not issued and the policy stays
 * unread.
 *
 * This module deliberately holds no host ledger of its own. It is a
 * single-page seam (see "WHAT THIS MODULE IS NOT" above) and inventing one
 * here would be a second, drifting copy of the orchestrator's accounting.
 */
export type HostChangingContinuationAdmission = (continuationUrl: string) => boolean;

/**
 * FAIL CLOSED. A caller that keeps no host ledger cannot honestly charge a
 * new hostname, so it gets exactly ADR 0012's behaviour: same-registrable-
 * domain continuations that DO change host are refused, and the
 * already-authorised same-hostname shapes are unaffected.
 */
const REFUSE_HOST_CHANGING_CONTINUATION: HostChangingContinuationAdmission = () => false;

export interface RobotsFetchContext {
  runId: string;
  root: RootAuthorityRef;
  /** The ORDINARY page's URL. Its scheme and hostname determine the robots.txt origin. */
  targetUrl: string;
  /**
   * Consulted ONLY for a continuation that changes hostname, and only after
   * `continuationTargetFor` has already admitted the target on every other
   * ground. Absent means refuse - see
   * `REFUSE_HOST_CHANGING_CONTINUATION`.
   */
  admitHostChangingContinuation?: HostChangingContinuationAdmission | undefined;
}

/**
 * The result of fetching robots.txt, when this call actually performed a
 * fetch rather than reusing the cache.
 */
export interface RobotsFetchOutcome {
  policy: EvaluatedRobotsPolicy;
  /**
   * The DECISIVE fetch - the one whose response the policy was derived from.
   * Null when the cache served this call, so no request was made.
   *
   * Under an ADR 0012 continuation this is the SECOND request, not the first:
   * the first one's only contribution was a redirect target.
   */
  fetchResult: WebAttemptResult | null;
  /**
   * EVERY gateway attempt this call made, in order - 0 (cache hit), 1
   * (ordinary case) or 2 (one ADR 0012 continuation).
   *
   * A COUNT, not a boolean, because a continuation is a REAL gateway request
   * and the caller's request budget must charge for it. `fetchResult !== null`
   * used to be a sufficient proxy for "one request happened"; once a second
   * one became possible that proxy would have silently under-charged the
   * 60-request ceiling by exactly the requests this repair added.
   */
  attempts: readonly WebAttemptResult[];
}

/**
 * ONE CONTINUABLE ROBOTS.TXT REDIRECT, AND WHERE IT GOES.
 *
 * PURE. Returns the continuation, or null to fail closed. This is the whole
 * of ADR 0013's Option-C-lite boundary, in one place, so that "what may be
 * continued" is reviewable as a single predicate rather than inferred from
 * control flow.
 *
 * IT RETURNS THE HOST-CHANGE FACT ALONGSIDE THE URL, because two callers need
 * it and neither may recompute it: `getRobotsPolicy` must ask the
 * orchestrator for a distinct-host slot before issuing a host-changing
 * continuation, and must NOT memoise the resulting policy under a changed
 * target origin. A caller deriving "did the host change?" by parsing the two
 * URLs again would be a second implementation of the one comparison that
 * matters here.
 *
 * EVERY CONDITION IS NECESSARY, and each one refuses a shape that was
 * explicitly considered and NOT authorised:
 *
 *   1. The gateway derived usable redirect facts at all. `targetMalformed`
 *      already covers an unparsable Location, a non-http(s) scheme AND a
 *      credential-bearing target (redirect.ts treats userinfo as malformed on
 *      purpose, so that stripping-and-requesting is structurally impossible),
 *      which is why there is no separate credential branch below: it would be
 *      a second implementation of a decision redirect.ts already made.
 *   2. BOTH URLs pass `validateRequestUrl` - the gateway's own URL gate,
 *      called here rather than re-expressed. It is what refuses userinfo, an
 *      IP literal, a fragment, a non-http(s) scheme, an empty label, a host
 *      outside the ICANN public suffix set and ANY explicit port including a
 *      default one, and it is what computes the registrable domain from the
 *      single `tldts` implementation this repository has. Calling it here is
 *      not belt-and-braces: a target the gateway would REFUSE must never be
 *      minted an authority, because a gateway refusal THROWS and would turn
 *      an ordinary redirect into a failed root.
 *   3. The target's request path is exactly `/robots.txt` - which is path AND
 *      query together, so a query-bearing target is refused by the same
 *      comparison. A policy file that redirects to `/other-path` is not
 *      canonicalising its policy URL, and whatever is there is not this
 *      host's robots.txt.
 *   4. The target is in the SAME REGISTRABLE DOMAIN. THIS IS THE ADR 0013
 *      LINE, and it is the one thing that moved: ADR 0012 required the
 *      hostname to be byte-identical. A cross-registrable-domain target is
 *      still refused outright, which is why this repository remains stricter
 *      than RFC 9309 s2.3.1.2's "even across authorities".
 *   5. The scheme is unchanged, or upgraded http -> https. A downgrade is
 *      refused.
 *   6. The target is not the URL just requested. A self-redirect offers no
 *      new bytes, and continuing to it would reach the gateway's own
 *      DUPLICATE_ATTEMPT refusal - a refusal that would then be recorded as
 *      though this module had tried something meaningful. Compared on the
 *      SERIALISED forms, so two spellings of one URL are one URL.
 *
 * Root scope, host policy, DNS, address classification and TLS are NOT
 * checked here, deliberately. They are the gateway's, they run independently
 * for the second request exactly as they did for the first, and duplicating
 * them here would create a second, drifting implementation of a trust
 * boundary that has exactly one. The HOST BUDGET is not checked here either:
 * it is the orchestrator's ledger, asked through
 * `admitHostChangingContinuation`.
 */
export interface RobotsContinuation {
  /** The exact URL a second, independently validated gateway request may ask for. */
  readonly url: string;
  /** True when that URL's hostname differs from the one just requested. */
  readonly hostChanged: boolean;
}

export function continuationTargetFor(
  requestedRobotsUrl: string,
  result: WebAttemptResult,
): RobotsContinuation | null {
  const facts = result.redirect;
  if (facts === null || facts.targetMalformed || facts.toUrlResolved === null) return null;

  const origin = validateRequestUrl(requestedRobotsUrl);
  const target = validateRequestUrl(facts.toUrlResolved);
  if (!origin.ok || !target.ok) return null;

  if (target.value.requestPath !== '/robots.txt') return null;
  if (target.value.registrableDomain !== origin.value.registrableDomain) return null;

  const sameScheme = target.value.scheme === origin.value.scheme;
  const upgraded = origin.value.scheme === 'http:' && target.value.scheme === 'https:';
  if (!sameScheme && !upgraded) return null;

  if (target.value.url === origin.value.url) return null;

  return { url: target.value.url, hostChanged: target.value.hostname !== origin.value.hostname };
}

/**
 * Gets (fetching if not cached) the evaluated robots policy for the origin
 * implied by `targetUrl`.
 *
 * ONE GET at most, mediated entirely through `executeWebAttempt`, using the
 * bootstrap authority scoped to exactly that one `/robots.txt` URL. Every
 * fetch outcome maps onto one of `EvaluatedRobotsPolicy`'s honest factories:
 *
 *   200/2xx, non-empty body -> parsed via EvaluatedRobotsPolicy.fromBody
 *   2xx, empty/whitespace body -> noRestrictions()   (empty body: no rules)
 *   404, or any other 4xx     -> noRestrictions()    (RFC 9309 s2.3.1.3)
 *   3xx (never followed)      -> unavailable('REDIRECTED')
 *   5xx                       -> unavailable('SERVER_ERROR')
 *   transport/DNS/TLS failure -> unavailable('FETCH_FAILED')
 *   a body this parser cannot read as text -> unavailable('UNPARSEABLE')
 */
export async function getRobotsPolicy(
  pool: pg.Pool,
  cache: RobotsCache,
  context: RobotsFetchContext,
  transport: WebTransport = nodeWebTransport,
): Promise<RobotsFetchOutcome> {
  const target = new URL(context.targetUrl);
  const scheme = target.protocol;
  const hostname = target.hostname;
  const admitHostChangingContinuation =
    context.admitHostChangingContinuation ?? REFUSE_HOST_CHANGING_CONTINUATION;

  const cached = cache.get(context.runId, scheme, hostname);
  // A cache hit makes ZERO gateway requests, so it charges the caller's
  // request budget nothing - `attempts` is empty, not "one, unknown".
  if (cached !== undefined) return { policy: await cached, fetchResult: null, attempts: [] };

  const robotsUrl = `${scheme}//${hostname}/robots.txt`;

  /**
   * ONE robots.txt GET, through the one gateway, under a freshly minted
   * authority scoped to exactly this URL.
   *
   * A LOCAL FUNCTION CALLED TWICE, not two call sites. The continuation must
   * NOT reuse the first authority: `RobotsAuthorisation` is URL-scoped and
   * `executeWebAttempt` refuses a byte-for-byte mismatch
   * (ROBOTS_AUTHORISATION_SCOPE_MISMATCH), so presenting the original
   * authority for the redirected URL would be refused - correctly. Minting a
   * new bootstrap authority for the new URL is the only honest way to make
   * the second request, and it keeps the unforgeable, exact-scope invariant
   * intact for both.
   */
  const fetchRobotsDocument = (url: string): Promise<WebAttemptResult> =>
    executeWebAttempt(
      pool,
      {
        runId: context.runId,
        root: context.root,
        requestedUrl: url,
        // Normally 1. It is 2 only when this run already requested this exact
        // policy URL for a DIFFERENT origin's resolution - see
        // `RobotsCache.nextPolicyAttemptNo`.
        attemptNo: cache.nextPolicyAttemptNo(context.runId, url),
        discoveryMethod: 'ROBOTS',
        discoveryParentUrl: null,
        robots: RobotsAuthorisation.forRobotsTxtBootstrap(url),
      },
      transport,
    );

  // A holder rather than a bare outer variable: the fetch results are produced
  // INSIDE the cached promise (so a concurrent second caller for the same
  // host awaits the same in-flight request rather than racing a second one),
  // but this function still needs to hand them back to ITS OWN caller once,
  // without re-deriving them from the (memoised) policy.
  const observed: { attempts: WebAttemptResult[] } = { attempts: [] };
  // A self-reference the continuation needs before this function's own
  // `cache.set` below has run. Assigned immediately after the IIFE is
  // constructed, which is BEFORE the IIFE resumes from its first `await` - so
  // it is always non-null by the time the loop below reads it.
  const resolution: { promise: Promise<EvaluatedRobotsPolicy> | null } = { promise: null };
  const pending: Promise<EvaluatedRobotsPolicy> = (async () => {
    let requestedUrl = robotsUrl;
    let result = await fetchRobotsDocument(requestedUrl);
    observed.attempts.push(result);

    // THE ADR 0012 CONTINUATION, AND ITS BOUND.
    //
    // The loop is bounded by the policy constant so that the declared bound
    // is the ACTUAL bound rather than a number a comment claims. It runs at
    // most once, and `continuationTargetFor` returns null for everything
    // outside the narrow same-host shape - so for every host that does not
    // exhibit it, this is byte-for-byte the v1 behaviour: one request, then
    // the honest mapping below.
    //
    // THE CHAIN IS PROVABLY AT MOST TWO REQUESTS EVEN IF THAT CONSTANT WERE
    // RAISED, which is why there is no visited-URL set here. A continuation
    // may not change host and may not change scheme except http -> https, and
    // may not target the URL just requested. From an https robots URL the
    // only admissible target is therefore the identical URL, which condition
    // 6 refuses; from an http one it is the https form, from which the same
    // argument applies. A cycle has nowhere to go.
    for (let hop = 0; hop < MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS; hop += 1) {
      const continuation = continuationTargetFor(requestedUrl, result);
      if (continuation === null) break;

      // THE HOST BUDGET IS ASKED BEFORE THE REQUEST, AND ONLY WHEN THE HOST
      // ACTUALLY CHANGES (ADR 0013 s8). A same-hostname continuation reaches
      // no new host and consumes no distinct-host slot, so it is not asked -
      // that is byte-for-byte the ADR 0012 path. A host-CHANGING one is a
      // second hostname under this root, and the orchestrator's ledger is the
      // only place that can say whether another one is affordable. It answers
      // no -> the policy stays unread, exactly as any other refusal here.
      if (continuation.hostChanged && !admitHostChangingContinuation(continuation.url)) break;

      requestedUrl = continuation.url;

      // THE SAME-HOSTNAME CONTINUATION'S OWN ORIGIN IS MEMOISED TOO, BEFORE
      // THE REQUEST - AND A HOST-CHANGING ONE'S IS NOT.
      //
      // For the same hostname this is not a convenience but a correctness
      // requirement, found by the orchestrator's own budget test. The cache
      // is keyed per ORIGIN, so `http://host` and `https://host` are
      // different entries. Without this, an http root that upgrades would
      // fetch `https://host/robots.txt` here and then, the first time an
      // https page on that host was authorised, fetch THE IDENTICAL URL again
      // - which the gateway refuses outright as a DUPLICATE_ATTEMPT (same
      // run, root, URL, policy version and attempt number), turning an
      // ordinary canonicalising site into a refused root. It is also the
      // per-origin-honest thing to do: the bytes about to be read ARE that
      // origin's own policy file, read from that origin's own URL.
      //
      // FOR A HOST-CHANGING CONTINUATION IT WOULD BE A LIE (ADR 0013 s6).
      // Under RFC 9309 s2.3.1.2 the bytes fetched from
      // `example.edu/robots.txt` after `www.example.edu/robots.txt`
      // redirected are the policy governing `www.example.edu` FOR THIS
      // LOOKUP. They are not independently `example.edu`'s own policy: nobody
      // asked `example.edu` for its policy, and its server was never given
      // the chance to answer that question with a different document, a 404
      // or a Disallow. Caching them under `example.edu` would let a later
      // ordinary page on that host be authorised by a policy that host never
      // published for itself - policy-authority contamination, and precisely
      // the follow-and-proceed posture this repository still refuses. So if
      // this run later needs `example.edu`, it resolves that origin's policy
      // through its own origin semantics: one more robots request, honestly
      // charged to the budget.
      const target = new URL(requestedUrl);
      const memo = resolution.promise;
      if (
        !continuation.hostChanged &&
        memo !== null &&
        cache.get(context.runId, target.protocol, target.hostname) === undefined
      )
        cache.set(context.runId, target.protocol, target.hostname, memo);

      result = await fetchRobotsDocument(requestedUrl);
      observed.attempts.push(result);
    }

    // The LAST response is the decisive one, mapped by exactly the same
    // honest function as an uncontinued fetch - so a continuation that itself
    // answers 3xx is `REDIRECTED`, a 5xx is `SERVER_ERROR`, a 4xx is
    // `noRestrictions`, and a transport failure is `FETCH_FAILED`, with no
    // special case anywhere for having been reached by a continuation.
    return evaluateRobotsFetch(result);
  })();
  resolution.promise = pending;

  // The promise itself is cached BEFORE it settles, so two ordinary pages on
  // the same host requested concurrently within one run still fetch
  // robots.txt only once - and, under a continuation, the WHOLE two-request
  // resolution is that one in-flight computation. A concurrent caller
  // therefore cannot observe the intermediate "redirected, unread" state or
  // duplicate the continuation: it awaits the same promise and receives
  // whatever single policy that resolution settled on.
  cache.set(context.runId, scheme, hostname, pending);
  const policy = await pending;
  return {
    policy,
    fetchResult: observed.attempts.at(-1) ?? null,
    attempts: observed.attempts,
  };
}

function evaluateRobotsFetch(result: WebAttemptResult): EvaluatedRobotsPolicy {
  if (result.errorKind !== null) {
    return EvaluatedRobotsPolicy.unavailable('FETCH_FAILED');
  }
  const status = result.httpStatus;
  if (status === null) {
    /* c8 ignore next -- the gateway's outcome contract guarantees one of status/errorKind */
    return EvaluatedRobotsPolicy.unavailable('FETCH_FAILED');
  }
  if (status >= 300 && status < 400) {
    return EvaluatedRobotsPolicy.unavailable('REDIRECTED');
  }
  if (status === 404 || (status >= 400 && status < 500)) {
    return EvaluatedRobotsPolicy.noRestrictions();
  }
  if (status >= 500) {
    return EvaluatedRobotsPolicy.unavailable('SERVER_ERROR');
  }
  // 2xx.
  if (result.body === null) {
    return EvaluatedRobotsPolicy.noRestrictions();
  }
  try {
    const text = result.body.toString('utf-8');
    return EvaluatedRobotsPolicy.fromBody(text);
  } catch {
    /* c8 ignore next -- Buffer#toString('utf-8') does not throw */
    return EvaluatedRobotsPolicy.unavailable('UNPARSEABLE');
  }
}

export interface OrdinaryPageAuthorisation {
  authorisation: RobotsAuthorisation;
  /** Informational only - nothing in this module sleeps because of it. */
  effectiveCrawlDelaySeconds: number | null;
  robotsFetch: RobotsFetchOutcome;
}

/**
 * Authorises ONE ordinary page request against the host's evaluated policy,
 * fetching robots.txt first only if this run has not already done so for
 * this host.
 *
 * Does not itself fetch the page - see `authoriseAndFetchPage` for the
 * composition that does, and ADR 0006 for why the two are kept separable.
 */
export async function authoriseOrdinaryPage(
  pool: pg.Pool,
  cache: RobotsCache,
  context: RobotsFetchContext,
  transport: WebTransport = nodeWebTransport,
): Promise<OrdinaryPageAuthorisation> {
  const robotsFetch = await getRobotsPolicy(pool, cache, context, transport);
  const authorisation = RobotsAuthorisation.forEvaluatedPolicy(
    robotsFetch.policy,
    context.targetUrl,
    ROBOTS_USER_AGENT_TOKEN,
  );
  return {
    authorisation,
    effectiveCrawlDelaySeconds: robotsFetch.policy.crawlDelaySecondsFor(ROBOTS_USER_AGENT_TOKEN),
    robotsFetch,
  };
}

export interface SinglePageAttemptInput {
  runId: string;
  root: RootAuthorityRef;
  targetUrl: string;
  attemptNo: number;
  /**
   * Widened in Phase 2B-1E (ADR "sitemap behaviour") to also accept SITEMAP
   * (a sitemap document fetch, or an ordinary page discovered from one) and
   * WELL_KNOWN_PATH (the conventional sitemap-index fallback probe) - the
   * two further `discovery_method` values migration 0007 already reserved.
   * This remains the ONE production caller of `executeWebAttempt`; widening
   * the type does not add a second call site.
   */
  discoveryMethod: 'ROOT' | 'LINK' | 'SITEMAP' | 'WELL_KNOWN_PATH';
  discoveryParentUrl: string | null;
  /**
   * Passed straight through to the site-policy resolution (ADR 0013 s8).
   * `undefined` means a host-changing continuation is refused, so a caller
   * that keeps no distinct-host ledger cannot spend a slot it is not
   * counting. Declared as an explicit `| undefined` rather than as a purely
   * optional property because `exactOptionalPropertyTypes` is on and this
   * value is forwarded verbatim by `authoriseAndFetchPage`.
   */
  admitHostChangingContinuation?: HostChangingContinuationAdmission | undefined;
}

export type SinglePageAttemptResult =
  /** Covers BOTH a positive Disallow match and an unreadable policy - see `robots.authorisation.decision` for which. */
  | { kind: 'BLOCKED'; robots: OrdinaryPageAuthorisation }
  | { kind: 'FETCHED'; robots: OrdinaryPageAuthorisation; fetch: WebAttemptResult };

/**
 * THE PRODUCTION SINGLE-PAGE SEAM: evaluate robots for one host, then fetch
 * ONE target page if (and only if) the policy allows it.
 *
 * BOUNDED TO ONE PAGE. This function takes exactly one `targetUrl` and
 * returns after at most two gateway attempts (robots.txt, then the page) -
 * one if the host's policy was already cached this run, zero page attempts if
 * disallowed. It reads no link from the response, follows nothing, and does
 * not loop. It is the composition point a later, still-unbuilt orchestration
 * layer (frontier, CLI, batch runner - none of which exist here) is expected
 * to call once per page it has already decided to visit; it is not that
 * layer itself.
 *
 * REQUEST-COUNT INVARIANT (uncached host, this call only):
 *   allowed target   -> 1 robots request + 1 page request
 *   disallowed target -> 1 robots request + 0 page requests
 * REQUEST-COUNT INVARIANT (host already cached this run):
 *   allowed target   -> 0 robots requests + 1 page request
 *   disallowed target -> 0 robots requests + 0 page requests
 *
 * Charset resolution, extraction and redaction are the caller's job (see
 * `persistPageEvidence` in `pageEvidence.ts`) - this function's contract ends
 * at "here is the fetch result, and here is whether robots permitted it".
 */
export async function authoriseAndFetchPage(
  pool: pg.Pool,
  cache: RobotsCache,
  input: SinglePageAttemptInput,
  transport: WebTransport = nodeWebTransport,
): Promise<SinglePageAttemptResult> {
  const robots = await authoriseOrdinaryPage(
    pool,
    cache,
    {
      runId: input.runId,
      root: input.root,
      targetUrl: input.targetUrl,
      admitHostChangingContinuation: input.admitHostChangingContinuation,
    },
    transport,
  );

  // BOTH a positive Disallow match AND an unreadable policy stop the ordinary
  // request - robotsPolicy.ts's own contract (s12/s17's "conservative"
  // posture): "we were told no" and "we do not know" are recorded under
  // different, honest `robots_decision` values, but neither is a request this
  // orchestration will make. The GATEWAY's own check (gateway.ts) special-cases
  // only DISALLOWED, because a direct gateway caller may have a policy this
  // orchestration never evaluated; this is the layer that actually decided
  // ROBOTS_UNREADABLE means "do not attempt it".
  if (
    robots.authorisation.decision === 'DISALLOWED' ||
    robots.authorisation.decision === 'ROBOTS_UNREADABLE'
  ) {
    return { kind: 'BLOCKED', robots };
  }

  const fetchResult = await executeWebAttempt(
    pool,
    {
      runId: input.runId,
      root: input.root,
      requestedUrl: input.targetUrl,
      attemptNo: input.attemptNo,
      discoveryMethod: input.discoveryMethod,
      discoveryParentUrl: input.discoveryParentUrl,
      robots: robots.authorisation,
    },
    transport,
  );
  return { kind: 'FETCHED', robots, fetch: fetchResult };
}

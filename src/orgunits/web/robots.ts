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
 * THE REDIRECT POSTURE
 *
 *   robots.txt is fetched exactly like any other request: ONE GET, no
 *   redirect followed. A 3xx response therefore leaves the policy unread, and
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
import { RESEARCH_USER_AGENT } from './policy.js';
import { RobotsAuthorisation } from './robotsAuthority.js';
import { EvaluatedRobotsPolicy } from './robotsPolicy.js';

/**
 * The PRODUCT token robots.txt `User-agent:` groups are matched against.
 *
 * Derived from `RESEARCH_USER_AGENT` - the SAME identity the gateway sends on
 * the wire, centralised in `policy.ts` - rather than declared as a second
 * literal: there is exactly one string this repository calls its own
 * identity, and this is a computed VIEW of it, not a second copy that could
 * drift. The parenthetical `(+https://newwavefluent.com/)` comment is
 * stripped because a site's robots.txt names a product token
 * (`NWFPartnershipEngine-Research/1.0`), never the full User-Agent header
 * text with its trailing comment - matching against the unstripped string
 * would silently fail to match a group any real site would have intended to
 * cover.
 */
export const ROBOTS_USER_AGENT_TOKEN = RESEARCH_USER_AGENT.replace(/\s*\([^)]*\)\s*$/, '');

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

  /** `(runId, scheme, hostname)` - the exact policy-origin identity. */
  private key(runId: string, scheme: string, hostname: string): string {
    return `${runId}|${scheme}|${hostname.toLowerCase()}`;
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

export interface RobotsFetchContext {
  runId: string;
  root: RootAuthorityRef;
  /** The ORDINARY page's URL. Its scheme and hostname determine the robots.txt origin. */
  targetUrl: string;
}

/**
 * The result of fetching robots.txt, when this call actually performed a
 * fetch rather than reusing the cache.
 */
export interface RobotsFetchOutcome {
  policy: EvaluatedRobotsPolicy;
  /** Null when the cache served this call - no request was made. */
  fetchResult: WebAttemptResult | null;
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

  const cached = cache.get(context.runId, scheme, hostname);
  if (cached !== undefined) return { policy: await cached, fetchResult: null };

  const robotsUrl = `${scheme}//${hostname}/robots.txt`;
  // A holder rather than a bare outer variable: the fetch result is produced
  // INSIDE the cached promise (so a concurrent second caller for the same
  // host awaits the same in-flight request rather than racing a second one),
  // but this function still needs to hand it back to ITS OWN caller once,
  // without re-deriving it from the (memoised) policy.
  const observed: { result: WebAttemptResult | null } = { result: null };
  const pending: Promise<EvaluatedRobotsPolicy> = (async () => {
    const result = await executeWebAttempt(
      pool,
      {
        runId: context.runId,
        root: context.root,
        requestedUrl: robotsUrl,
        attemptNo: 1,
        discoveryMethod: 'ROBOTS',
        discoveryParentUrl: null,
        robots: RobotsAuthorisation.forRobotsTxtBootstrap(robotsUrl),
      },
      transport,
    );
    observed.result = result;
    return evaluateRobotsFetch(result);
  })();

  // The promise itself is cached BEFORE it settles, so two ordinary pages on
  // the same host requested concurrently within one run still fetch
  // robots.txt only once.
  cache.set(context.runId, scheme, hostname, pending);
  const policy = await pending;
  return { policy, fetchResult: observed.result };
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
  discoveryMethod: 'ROOT' | 'LINK';
  discoveryParentUrl: string | null;
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
    { runId: input.runId, root: input.root, targetUrl: input.targetUrl },
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

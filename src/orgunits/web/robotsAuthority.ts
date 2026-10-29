/**
 * WHO IS ALLOWED TO SAY THAT A SITE'S OWN RULES PERMIT A REQUEST.
 *
 * `orgunit_fetch_observations.robots_decision` is `NOT NULL` and its taxonomy
 * has no "we did not check" member: every one of ALLOWED, NO_ROBOTS_FILE,
 * ROBOTS_UNREADABLE and NOT_APPLICABLE is a POSITIVE CLAIM about what the
 * site's own policy file said, or about which request is exempt from it.
 * DISALLOWED is a positive claim too.
 *
 * WHY THIS MODULE EXISTS
 *
 *   The first draft of the gateway took `robotsDecision` as an ordinary input.
 *   Any caller could therefore have written ALLOWED without anything ever
 *   having read the site's rules, and the result would have been a row that
 *   looks authoritative in PostgreSQL while being nothing but an assertion made
 *   by application code. Evidence that the writer can choose freely is not
 *   evidence.
 *
 * THE GUARANTEE IS LAYERED, and no single layer is trusted on its own:
 *
 *   1. TYPE - `executeWebAttempt` accepts `RobotsAuthorisation`, never a bare
 *      string, so a decision cannot be passed as data.
 *   2. RUNTIME BRAND - the class carries a genuinely private `#sealed` field
 *      and its constructors are private. No object literal, no structural
 *      cast and no `as unknown as` can produce a value that passes
 *      `isAuthorisation`.
 *   3. SCOPE - every production authority names the EXACT URL it authorises
 *      (`scopedToUrl`), and the gateway refuses to honour one presented for a
 *      different URL. See "THE SCOPING PROBLEM" below.
 *   4. RUNTIME ENVIRONMENT - the test-only constructor refuses to run outside
 *      a test runner.
 *   5. FIREWALL - `phase2b.firewall.test.ts` asserts that no production file
 *      calls the test-only constructor, and pins the exact set of files
 *      permitted to call the production factories.
 *
 * THE SCOPING PROBLEM, AND WHY 2B-1c NEEDED TO SOLVE IT
 *
 *   2B-1b removed the capability entirely: no production constructor existed,
 *   so there was nothing to misuse. 2B-1c's whole job is to ADD one, which
 *   reopens a question 2B-1b never had to answer: once a caller CAN obtain a
 *   real `RobotsAuthorisation` - say, the bootstrap authority that is allowed
 *   to fetch `/robots.txt` itself, decision `NOT_APPLICABLE` - what stops it
 *   presenting THAT SAME authority for a request to `/international/` and
 *   having the gateway treat "we are fetching the policy file" as "the policy
 *   permits this ordinary page"? Nothing in the gateway's brand check would
 *   catch that: `NOT_APPLICABLE` is not `DISALLOWED`, so the gateway's only
 *   existing robots check (refuse a socket on `DISALLOWED`) would wave it
 *   through.
 *
 *   The fix is `scopedToUrl`. EVERY production authority - the robots.txt
 *   bootstrap one and the ordinary-page one alike - carries the exact URL it
 *   was minted for, and `executeWebAttempt` refuses outright when the
 *   requested URL does not match it byte-for-byte. A bootstrap authority can
 *   therefore authorise nothing but the one `/robots.txt` fetch it names, and
 *   an ordinary-page authority (itself derived from evaluating a policy
 *   against ONE specific path) can authorise nothing but that one page. There
 *   is no scope wide enough to reuse across two different URLs.
 *
 *   `forTestsOnly` is the one exception: tests legitimately need to exercise
 *   the gateway against an arbitrary URL without first standing up a real
 *   robots fetch, so its authority is UNSCOPED (`scopedToUrl: null`) and the
 *   gateway skips the match for an unscoped authority. That is safe only
 *   because `forTestsOnly` itself is unreachable in production (guard 4).
 *
 * WHAT 2B-1c ADDED, NAMED EXACTLY
 *
 *   `forRobotsTxtBootstrap` - authorises fetching ONE host's `/robots.txt`
 *   (under whatever scheme was asked for) and nothing else. Always
 *   `NOT_APPLICABLE`: the request that retrieves the policy file is not
 *   itself subject to that file's rules.
 *
 *   `forEvaluatedPolicy` - authorises fetching ONE ordinary page, derived by
 *   actually evaluating an `EvaluatedRobotsPolicy` (robotsPolicy.ts) - itself
 *   an opaque, unforgeable value producible only by parsing bytes a real
 *   robots.txt fetch returned, or by naming one of the few honest fetch
 *   outcomes that module itself recognises - against that page's exact path.
 *
 *   Neither accepts a bare decision string. There is still no
 *   `createRobotsAuthorisation('ALLOWED')`-shaped API anywhere in this file.
 *
 * WHAT THE v7 TRAILING-SLASH REPAIR ADDED, AND WHY IT IS A THIRD FACTORY
 * RATHER THAN A WIDER FIRST ONE (ADR 0016)
 *
 *   `forRobotsTxtRedirectContinuation` - authorises ONE robots-policy request
 *   made BECAUSE a canonical robots.txt fetch answered 3xx. It accepts a bare
 *   path of exactly `/robots.txt` OR exactly `/robots.txt/`, and nothing else.
 *   Also always `NOT_APPLICABLE`, for the same reason the bootstrap is: this
 *   is still the request that RETRIEVES the policy file.
 *
 *   THE OBVIOUS ONE-LINE FIX WAS REFUSED. Widening
 *   `forRobotsTxtBootstrap` to admit `/robots.txt/` would have been three
 *   characters of code, and it would have moved the trust boundary in the
 *   wrong place: INITIAL site-policy discovery would then have TWO admissible
 *   starting points, and a caller could decide, on its own authority, to
 *   begin at `/robots.txt/` on a host that never redirected there. The two
 *   acts are different - "where policy discovery may START" and "where a
 *   host's own 3xx may send it" - so they get different factories, and the
 *   distinction is mechanically provable from which factory a call site
 *   names rather than from a comment about intent.
 *
 *   IT IS NOT AN ORDINARY-PAGE CAPABILITY EITHER. Its scope is one URL whose
 *   path is one of exactly two literals, so it can authorise no page: there
 *   is no institution page at `/robots.txt` or `/robots.txt/` that this
 *   authority could wave through, and `scopedToUrl` refuses every other URL
 *   byte-for-byte regardless.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { EvaluatedRobotsPolicy } from './robotsPolicy.js';
import type { RobotsDecision } from './observations.js';

/**
 * One site-policy verdict, together with the proof that something was entitled
 * to state it, and the exact URL that proof covers.
 *
 * The value is deliberately not a plain object. A plain object is data, and
 * data is exactly what a caller can invent.
 */
export class RobotsAuthorisation {
  /**
   * The runtime brand.
   *
   * A genuinely private field, not a symbol and not a marker property: it
   * cannot be read off an existing instance, cannot be copied onto a literal,
   * and cannot be produced by a type assertion. `#sealed in value` is therefore
   * a real capability check rather than a shape check.
   */
  readonly #sealed = true;

  readonly decision: RobotsDecision;

  /** The matched rule, when a reader derived one. Capped by the schema at 512 characters. */
  readonly rule: string | null;

  /**
   * The exact URL this authority covers, or `null` for the unscoped test seam.
   *
   * `executeWebAttempt` requires this to equal the validated requested URL
   * byte-for-byte whenever it is non-null. See "THE SCOPING PROBLEM" above.
   */
  readonly scopedToUrl: string | null;

  private constructor(decision: RobotsDecision, rule: string | null, scopedToUrl: string | null) {
    this.decision = decision;
    this.rule = rule;
    this.scopedToUrl = scopedToUrl;
  }

  /** True only for a value this class actually constructed. */
  static isAuthorisation(value: unknown): value is RobotsAuthorisation {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /**
   * Authorises fetching robots.txt itself, and nothing else.
   *
   * `url` must be exactly `${scheme}://${hostname}/robots.txt` - no query, no
   * fragment, no other path. That is what makes this a BOOTSTRAP authority
   * rather than a general bypass: it is unforgeable in the same way every
   * other production authority is (brand-checked, URL-scoped), and its scope
   * happens to name the one resource a host's policy cannot itself govern.
   *
   * Always `NOT_APPLICABLE`, per the schema's own column comment: the request
   * that retrieves the policy file is not subject to that file's rules,
   * regardless of what that request eventually returns (200, 404, 5xx, a
   * redirect this gateway will not follow - all of it is recorded on the
   * fetch observation's `http_status`/`error_kind`, never folded into this
   * decision).
   */
  static forRobotsTxtBootstrap(url: string): RobotsAuthorisation {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`forRobotsTxtBootstrap: "${url}" does not parse as a URL.`);
    }
    if (parsed.pathname !== '/robots.txt' || parsed.search !== '' || parsed.hash !== '') {
      throw new Error(
        `forRobotsTxtBootstrap: "${url}" is not a bare robots.txt URL. This authority is ` +
          `path-scoped to exactly "/robots.txt" with no query or fragment, and cannot be ` +
          `minted for anything else - that scoping is what stops it authorising an ordinary ` +
          `page request.`,
      );
    }
    return new RobotsAuthorisation('NOT_APPLICABLE', null, parsed.toString());
  }

  /**
   * THE ONLY TWO REQUEST PATHS A ROBOTS REDIRECT CONTINUATION MAY TARGET.
   *
   * An explicit two-member list, not a pattern. A regular expression, a
   * prefix test or a trailing-slash normaliser would each admit an OPEN SET
   * whose members nobody enumerated - `/robots.txt//`, `/robots.txt/index`,
   * `/robots.txt/anything` - and the whole value of this factory is that the
   * set it admits can be read off the source in one line.
   */
  static readonly CONTINUATION_PATHS: readonly string[] = Object.freeze([
    '/robots.txt',
    '/robots.txt/',
  ]);

  /**
   * Authorises ONE robots-policy request issued BECAUSE a canonical
   * robots.txt fetch answered a redirect, and nothing else.
   *
   * WHAT THIS EXISTS FOR (ADR 0016). Generation-1 acquisition met an origin
   * that answers `GET /robots.txt` with a same-origin `301` to
   * `/robots.txt/`. Under `orgunit-fetch-policy-v6` that target was refused
   * by the continuation predicate's exact-path test, the policy was
   * therefore genuinely unread, and every page on that root was
   * `ROBOTS_UNREADABLE` - a capability limit of this repository, not a
   * transport failure of the institution.
   *
   * `url` must be a bare policy URL whose path is exactly `/robots.txt` or
   * exactly `/robots.txt/`, with no query and no fragment. Every other
   * pathname is refused, `/robots.txt//` and `/robots.txt/index` included:
   * the admissible set is the two literals in `CONTINUATION_PATHS` and is not
   * computed from the requested URL.
   *
   * ALWAYS `NOT_APPLICABLE`, exactly as the bootstrap is, and for exactly the
   * same reason the schema's own column comment gives: the request that
   * retrieves the policy file is not itself subject to that file's rules.
   * Whatever the second response turns out to be - 200, 404, 5xx, another
   * redirect this gateway still will not follow - is recorded on the fetch
   * observation's own `http_status`/`error_kind` and is never folded into
   * this decision.
   *
   * IT IS NOT A WIDER BOOTSTRAP. `forRobotsTxtBootstrap` still accepts only
   * the canonical `/robots.txt`, so site-policy discovery can still START in
   * exactly one place per origin. This factory is reachable only from the
   * redirect-continuation path in `robots.ts`, whose target was produced by
   * `continuationTargetFor` from a real `Location` the host itself sent.
   */
  static forRobotsTxtRedirectContinuation(url: string): RobotsAuthorisation {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`forRobotsTxtRedirectContinuation: "${url}" does not parse as a URL.`);
    }
    if (
      !RobotsAuthorisation.CONTINUATION_PATHS.includes(parsed.pathname) ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      throw new Error(
        `forRobotsTxtRedirectContinuation: "${url}" is not a bare robots.txt policy URL. This ` +
          `authority is path-scoped to exactly "/robots.txt" or exactly "/robots.txt/" with no ` +
          `query or fragment. It authorises a REDIRECTED policy retrieval and nothing else - it ` +
          `is not a wider bootstrap and cannot be minted for an ordinary page.`,
      );
    }
    return new RobotsAuthorisation('NOT_APPLICABLE', null, parsed.toString());
  }

  /**
   * Authorises fetching ONE ordinary page, by actually evaluating a real
   * policy against its exact path.
   *
   * `policy` must be a genuine `EvaluatedRobotsPolicy` - checked by ITS OWN
   * brand via `EvaluatedRobotsPolicy.isEvaluatedPolicy`, not re-implemented
   * here - so this factory cannot be driven by a hand-built
   * `{ decision, rule }` object either. `url` becomes this authority's scope:
   * it authorises this page and no other.
   */
  static forEvaluatedPolicy(
    policy: EvaluatedRobotsPolicy,
    url: string,
    userAgentToken: string,
  ): RobotsAuthorisation {
    if (!EvaluatedRobotsPolicy.isEvaluatedPolicy(policy)) {
      throw new Error(
        'forEvaluatedPolicy: policy is not an EvaluatedRobotsPolicy this build produced. ' +
          "An ordinary page's robots verdict must be traceable to bytes a real robots.txt " +
          'fetch returned (or to one of the few honest fetch outcomes robotsPolicy.ts names), ' +
          'never to a hand-built result.',
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`forEvaluatedPolicy: "${url}" does not parse as a URL.`);
    }
    const { decision, rule } = policy.evaluate(userAgentToken, parsed.pathname + parsed.search);
    return new RobotsAuthorisation(decision, rule, parsed.toString());
  }

  /**
   * THE ONLY UNSCOPED CONSTRUCTOR, and it does not exist in production.
   *
   * Guarded on the test runner rather than on a convention, so that
   * "production cannot manufacture a robots verdict out of thin air" is a
   * property of the running process instead of a promise about who imports
   * what. A build that shipped this file and called this method would throw
   * on the first call, loudly, before any socket existed.
   *
   * Tests need it because the gateway's SECURITY path - scope, address
   * classification, pinning, caps, evidence - must stay exercised against
   * arbitrary URLs without first standing up a real robots fetch for every
   * case. Unscoped (`scopedToUrl: null`) is safe only because this method
   * itself is unreachable in production.
   */
  static forTestsOnly(decision: RobotsDecision, rule: string | null = null): RobotsAuthorisation {
    if (process.env['VITEST'] !== 'true') {
      throw new Error(
        'RobotsAuthorisation.forTestsOnly is a TEST SEAM and is unavailable outside vitest. ' +
          'Production code must derive a verdict from an actual robots.txt evaluation via ' +
          'forEvaluatedPolicy, the robots.txt bootstrap via forRobotsTxtBootstrap, or a ' +
          'host-issued policy redirect via forRobotsTxtRedirectContinuation.',
      );
    }
    return new RobotsAuthorisation(decision, rule, null);
  }
}

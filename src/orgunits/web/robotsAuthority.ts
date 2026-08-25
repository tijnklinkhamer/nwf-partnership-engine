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
 *   2B-1b holds no reader that could DERIVE such a verdict, and building one
 *   here would be pulling 2B-1c forward. So the capability is REMOVED instead:
 *   in this build there is no production construction path at all, and
 *   therefore no production caller that can perform a live institution-content
 *   request. That is deliberately safer than storing a fabricated provenance,
 *   and it is the state ADR 0005 s8 now records.
 *
 * THE GUARANTEE IS LAYERED, and no single layer is trusted on its own:
 *
 *   1. TYPE - `executeWebAttempt` accepts `RobotsAuthorisation`, never a bare
 *      string, so a decision cannot be passed as data.
 *   2. RUNTIME BRAND - the class carries a genuinely private `#sealed` field
 *      and its constructor is private. No object literal, no structural cast
 *      and no `as unknown as` can produce a value that passes `isAuthorisation`.
 *   3. RUNTIME ENVIRONMENT - the one constructor that exists refuses to run
 *      outside a test runner. Outside vitest it THROWS, so the capability is
 *      absent from a built artifact rather than merely undocumented.
 *   4. FIREWALL - `phase2b.firewall.test.ts` asserts that no production file
 *      references that constructor and that no production file calls
 *      `executeWebAttempt` at all.
 *
 * WHAT 2B-1c CHANGES: it adds the reader, and with it the FIRST production
 * constructor - one that can only produce a verdict it actually derived from
 * the site's own published policy. That is a deliberate, reviewed widening of
 * exactly this file, in the same shape as ADR 0004 s18's socket widening.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import type { RobotsDecision } from './observations.js';

/**
 * One site-policy verdict, together with the proof that something was entitled
 * to state it.
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

  private constructor(decision: RobotsDecision, rule: string | null) {
    this.decision = decision;
    this.rule = rule;
  }

  /** True only for a value this class actually constructed. */
  static isAuthorisation(value: unknown): value is RobotsAuthorisation {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /**
   * THE ONLY CONSTRUCTOR IN THIS BUILD, and it does not exist in production.
   *
   * Guarded on the test runner rather than on a convention, so that "production
   * cannot manufacture a robots verdict" is a property of the running process
   * instead of a promise about who imports what. A build that shipped this file
   * and called this method would throw on the first call, loudly, before any
   * socket existed - which is the correct outcome while no reader exists.
   *
   * Tests need it because the gateway's SECURITY path - scope, address
   * classification, pinning, caps, evidence - must stay exercised in full. A
   * gateway that could not be driven end to end would be a gateway nobody
   * verified.
   */
  static forTestsOnly(decision: RobotsDecision, rule: string | null = null): RobotsAuthorisation {
    if (process.env['VITEST'] !== 'true') {
      throw new Error(
        'RobotsAuthorisation.forTestsOnly is a TEST SEAM and is unavailable outside vitest. ' +
          "Phase 2B-1b holds no reader of a site's own policy, so no honest verdict can be " +
          'produced here; a production authority arrives with the reader in Phase 2B-1c.',
      );
    }
    return new RobotsAuthorisation(decision, rule);
  }
}

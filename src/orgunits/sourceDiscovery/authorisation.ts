/**
 * REL L2 / U1 - WHO IS ALLOWED TO RUN A LIVE SOURCE-DISCOVERY SEARCH: nobody,
 * in this build.
 *
 * A live web search through the owner's Claude Max subscription is an
 * EXTERNAL action this repository is not authorised to take (OWNER directive
 * 2026-10-26: no live network call, no live Agent SDK call). The adapter that
 * WOULD take it exists, so its shape can be reviewed and tested against a fake
 * SDK - but it requires this capability, and this capability has NO
 * production constructor.
 *
 * The pattern is `RobotsAuthorisation` (web/robotsAuthority.ts):
 *
 *   1. TYPE - `ClaudeMaxWebSearchProvider` accepts a `SourceDiscoveryAuthorisation`,
 *      never a flag or a string.
 *   2. RUNTIME BRAND - a genuinely private `#sealed` field and a private
 *      constructor: no object literal, structural cast or `as unknown as`
 *      passes `isAuthorisation`.
 *   3. RUNTIME ENVIRONMENT - the ONLY constructor, `sealedForVitest`, throws
 *      outside vitest.
 *   4. FIREWALL - `relL2SourceDiscovery.firewall.test.ts` asserts that no
 *      production file calls `sealedForVitest`, that no CLI file imports this
 *      module or the adapter, and that this file declares no other factory.
 *
 * Granting live search later is a separately authorised phase that adds a
 * reviewed production factory here - a visible, firewall-breaking edit.
 *
 * PURE. No socket, no database, no filesystem, no clock; reads one
 * environment marker only to REFUSE.
 */
export class SourceDiscoveryAuthorisation {
  readonly #sealed = true;

  /** What the authority covers. Tests name their own scope; nothing reads it as permission. */
  readonly scope: string;

  private constructor(scope: string) {
    this.scope = scope;
  }

  /** True only for a value this class actually constructed. */
  static isAuthorisation(value: unknown): value is SourceDiscoveryAuthorisation {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /** THE ONLY CONSTRUCTOR, and it does not exist in production. */
  static sealedForVitest(scope: string): SourceDiscoveryAuthorisation {
    if (process.env['VITEST'] !== 'true') {
      throw new Error(
        'SourceDiscoveryAuthorisation.sealedForVitest is a TEST SEAM and is unavailable outside ' +
          'vitest. Live source-discovery search is not authorised in this build: there is no ' +
          'production constructor for this capability.',
      );
    }
    return new SourceDiscoveryAuthorisation(scope);
  }
}

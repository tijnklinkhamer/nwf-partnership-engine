/**
 * WW E-SD / ADR 0027 D1 - THE CLOSED MODEL ALLOWLIST FOR LIVE SOURCE-DISCOVERY
 * SEARCH. Exact ids, no aliases, no date suffixes.
 *
 * Mirrors migration 0022's `source_discovery_grants_model_chk` value for
 * value: a grant can name no other model, and `prepareLiveSearch` refuses any
 * other in the ADR 0010 pre-flight. The same reviewed ids as the classifier's
 * own list (`classify/provider/allowedModels.ts`), kept SEPARATE on purpose:
 * this namespace imports nothing from `classify/` but the eight ADR 0027 D3
 * authentication modules. Like that file, this is an exact-path exemption of
 * `phase1a.firewall.test.ts`: an allowlist must name what it allows.
 *
 * PURE. No socket, no database, no filesystem, no environment, no clock.
 */
export const SOURCE_DISCOVERY_ALLOWED_MODELS: readonly string[] = Object.freeze([
  'claude-haiku-4-5',
  'claude-opus-5',
  'claude-sonnet-5',
]);

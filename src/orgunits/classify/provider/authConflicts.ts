/**
 * THE CANONICAL CONFLICTING-AUTH VARIABLE LIST — the PAYG guard's
 * forbidden-name constant, copied EXACTLY from the preserved Phase 2B-2C
 * Claude Max runtime design (§6), never reconstructed from memory.
 *
 * Every name below is an environment variable that, if present in the
 * orchestration process environment, could route classifier inference OFF
 * the owner's Claude subscription — onto the Console PAYG API, a
 * bearer-token gateway, Bedrock, Vertex, Foundry, a WIF/profile-selected
 * credential, or a custom endpoint. The documented Claude Code credential
 * precedence order puts several of these ABOVE the subscription OAuth
 * token, so their mere presence is fatal: the run is REFUSED, never
 * sanitised (design §6: "Refusal, not sanitisation, is deliberate: silently
 * dropping a stray key would hide a misconfigured operator environment").
 *
 * THIS FILE IS THE ONE PLACE PRODUCTION CODE MAY NAME THESE VARIABLES.
 * `phase1a.firewall.test.ts` bans the API-key identifier everywhere else in
 * source, with an exact-file exemption for this constant — a guard must
 * NAME what it refuses. Nothing here (or anywhere) READS these variables as
 * a credential; `findConflictingAuthVariables` only reports their presence
 * so the pre-flight can fail closed.
 *
 * The guard blocks NOTHING else: no pattern-matching over unrelated
 * variables, exactly the 14 names the design approved.
 *
 * PURE. No network, no database, no filesystem, no clock, and no
 * `process.env` read of its own — callers supply the environment object.
 */

/**
 * The setup-token environment credential, PROHIBITED for runtime v1
 * (ADR 0010). It was the original Max-runtime credential (ADR 0009 §2.1);
 * live smoke evidence plus upstream reports (anthropics/claude-code#65320,
 * anthropics/claude-code-action#1614) showed `claude setup-token` output
 * passing local auth-status checks and then failing every real inference
 * with `401 OAuth access token is invalid`. The runtime therefore FAILS
 * CLOSED on its mere presence: it is never preferred, never fallen back
 * from, and never forwarded. The supported credential is the stored
 * subscription OAuth login inside the dedicated classifier profile
 * (`profile.ts`), owned and refreshed by Claude Code itself.
 */
export const PROHIBITED_SETUP_TOKEN_VARIABLE = 'CLAUDE_CODE_OAUTH_TOKEN';

/**
 * The canonical 14-variable forbidden list (design §6), verbatim.
 * Order follows the design's own table: cloud-provider routing first
 * (precedence rank 1), then the direct credentials, then profile/federation
 * selectors, then base-URL/companion routing overrides.
 */
export const FORBIDDEN_AUTH_VARIABLES = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_PROFILE',
  'ANTHROPIC_FEDERATION_RULE_ID',
  'ANTHROPIC_ORGANIZATION_ID',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_BEDROCK_BASE_URL',
  'ANTHROPIC_VERTEX_BASE_URL',
  'ANTHROPIC_FOUNDRY_BASE_URL',
  'ANTHROPIC_FOUNDRY_API_KEY',
  'ANTHROPIC_FOUNDRY_AUTH_TOKEN',
] as const;

export type ForbiddenAuthVariable = (typeof FORBIDDEN_AUTH_VARIABLES)[number];

/**
 * Every forbidden variable PRESENT in the supplied environment, in the
 * canonical list's order. Presence means the key is defined at all — an
 * empty-string value still signals a misconfigured environment and still
 * fails closed. Returns NAMES only; never a value, never a length, never
 * any derivative of a value.
 */
export function findConflictingAuthVariables(
  env: Readonly<Record<string, string | undefined>>,
): readonly ForbiddenAuthVariable[] {
  return FORBIDDEN_AUTH_VARIABLES.filter((name) => env[name] !== undefined);
}

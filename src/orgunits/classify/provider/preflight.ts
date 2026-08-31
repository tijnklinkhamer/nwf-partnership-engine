/**
 * THE DETERMINISTIC MAX-ONLY PRE-FLIGHT (Phase 2B-2C Max-runtime design §7).
 *
 * PURE AND NETWORK-FREE, by contract: this function makes ZERO network
 * calls, ZERO model calls, opens no socket, touches no filesystem and reads
 * no `process.env` of its own — the caller supplies the environment object,
 * which is what makes every check unit-testable with a plain map.
 *
 * Ordered checks, each fatal on its own:
 *
 *   1. `CLAUDE_CODE_OAUTH_TOKEN` present and plausibly token-shaped:
 *      non-empty and containing no whitespace. The VALUE is never logged,
 *      never echoed, never measured — no failure detail includes it or its
 *      length (design §7 step 1).
 *   2. every canonical forbidden conflicting-auth variable ABSENT
 *      (`authConflicts.ts`, the design-§6 14-name list). Presence of ANY of
 *      them refuses the run outright — the conflict is REPORTED BY NAME and
 *      never sanitised away (design §6; spec: "FAIL, DO NOT SANITIZE").
 *      A valid token does not rescue a conflicted environment: the checks
 *      compound, and conflicts dominate.
 *   3. the requested model id is a member of the closed allowlist
 *      (design §7 step 5, §15) — arbitrary strings never reach a provider.
 *   4. the bounded run configuration is internally valid (`maxTurns`, when
 *      present, is a positive integer within the small approved bound).
 *
 * A failure carries a deterministic `kind` and a bounded, operator-facing
 * `detail` naming WHAT failed (variable NAMES, never values). The provider
 * maps any pre-flight failure onto the provider-neutral `AUTH_FAILURE`
 * outcome with zero SDK-runner invocations; the exported function is also
 * available to a future orchestration/CLI layer that wants to refuse
 * row-lessly before a call row is ever inserted (design §19 step 3).
 */
import {
  CLAUDE_MAX_OAUTH_TOKEN_VARIABLE,
  findConflictingAuthVariables,
  type ForbiddenAuthVariable,
} from './authConflicts.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from './allowedModels.js';
import type { ClassifierRunConfig } from '../providerContract.js';

/** The largest `maxTurns` a classifier call may request. A tool-less call needs headroom only for the SDK's internal structured-output re-prompt (design §15: small, named). */
export const MAX_CLASSIFIER_MAX_TURNS = 8;

export type PreflightFailureKind =
  | 'MISSING_OAUTH_TOKEN'
  | 'MALFORMED_OAUTH_TOKEN'
  | 'CONFLICTING_AUTH_VARIABLES'
  | 'MODEL_NOT_ALLOWED'
  | 'INVALID_RUN_CONFIG';

export type PreflightResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly kind: PreflightFailureKind;
      /** Bounded, operator-facing. Names variables/fields, NEVER their values. */
      readonly detail: string;
      /** Present only for CONFLICTING_AUTH_VARIABLES: the offending NAMES. */
      readonly conflictingVariables?: readonly ForbiddenAuthVariable[];
    };

export interface PreflightInput {
  /** The orchestration-process environment (a plain object in tests; a `process.env` snapshot in production). */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly modelId: string;
  readonly runConfig: ClassifierRunConfig;
  /** The closed model allowlist. Defaults to the code-owned constant; tests may inject fake ids through the provider's explicit seam. */
  readonly allowedModels?: readonly string[];
}

export function runClassifierPreflight(input: PreflightInput): PreflightResult {
  // 2 first in SEVERITY but checked alongside 1: a conflicted environment is
  // refused even when the token is also missing or malformed, because the
  // conflict is the finding the operator must fix FIRST — it is the one that
  // could route inference off the subscription.
  const conflicts = findConflictingAuthVariables(input.env);
  if (conflicts.length > 0) {
    return {
      ok: false,
      kind: 'CONFLICTING_AUTH_VARIABLES',
      conflictingVariables: conflicts,
      detail:
        `refused: conflicting authentication/provider-routing variable(s) present: ` +
        `${conflicts.join(', ')}. The classifier runtime is Max-subscription-only; ` +
        `remove these from the environment and re-run. They are never silently dropped.`,
    };
  }

  const token = input.env[CLAUDE_MAX_OAUTH_TOKEN_VARIABLE];
  if (token === undefined || token.length === 0) {
    return {
      ok: false,
      kind: 'MISSING_OAUTH_TOKEN',
      detail:
        `refused: ${CLAUDE_MAX_OAUTH_TOKEN_VARIABLE} is not set. Provision it with ` +
        `\`claude setup-token\` (an operator action outside this engine) and export it.`,
    };
  }
  if (/\s/.test(token)) {
    return {
      ok: false,
      kind: 'MALFORMED_OAUTH_TOKEN',
      detail:
        `refused: ${CLAUDE_MAX_OAUTH_TOKEN_VARIABLE} is not token-shaped ` +
        `(it contains whitespace). Its value was not read further and is not included here.`,
    };
  }

  const allowedModels = input.allowedModels ?? ORGUNIT_CLASSIFIER_ALLOWED_MODELS;
  if (!allowedModels.includes(input.modelId)) {
    return {
      ok: false,
      kind: 'MODEL_NOT_ALLOWED',
      detail:
        `refused: model id ${JSON.stringify(input.modelId)} is not in the closed ` +
        `classifier model allowlist. Allowed: ${allowedModels.join(', ')}.`,
    };
  }

  const maxTurns = input.runConfig.maxTurns;
  if (maxTurns !== undefined) {
    if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > MAX_CLASSIFIER_MAX_TURNS) {
      return {
        ok: false,
        kind: 'INVALID_RUN_CONFIG',
        detail:
          `refused: runConfig.maxTurns must be an integer between 1 and ` +
          `${MAX_CLASSIFIER_MAX_TURNS}; received ${JSON.stringify(maxTurns)}.`,
      };
    }
  }

  return { ok: true };
}

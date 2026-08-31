/**
 * THE DETERMINISTIC MAX-ONLY PRE-FLIGHT (ADR 0010 §13, superseding the
 * design-§7 setup-token shape recorded in ADR 0009).
 *
 * PURE AND NETWORK-FREE, by contract: this function makes ZERO network
 * calls, ZERO model calls, opens no socket, touches no filesystem and reads
 * no `process.env` of its own — the caller supplies the environment object,
 * which is what makes every check unit-testable with a plain map. The two
 * NON-pure preflight stages — the names-only profile-hygiene readdir and
 * the request-free auth-status subprocess — live in `profileHygiene.ts`
 * and `authStatusRunner.ts`/`authStatus.ts`, and run AFTER this function
 * passes.
 *
 * Ordered checks, each fatal on its own:
 *
 *   1. every canonical forbidden conflicting-auth variable ABSENT
 *      (`authConflicts.ts`, the 14-name list). Presence of ANY of them
 *      refuses the run outright — the conflict is REPORTED BY NAME and
 *      never sanitised away. Conflicts dominate every other finding.
 *   2. the prohibited setup-token variable ABSENT. `CLAUDE_CODE_OAUTH_TOKEN`
 *      was the ADR 0009 credential; verified upstream failures
 *      (anthropics/claude-code#65320, anthropics/claude-code-action#1614,
 *      reproduced by this repository's own live smoke) made it unreliable,
 *      so runtime v1 FAILS CLOSED on its presence rather than silently
 *      preferring it or falling back after a 401. Its VALUE is never
 *      logged, echoed or measured.
 *   3. the dedicated classifier profile directory resolves and is
 *      permitted (`profile.ts`): configured or derivable, absolute, not
 *      the repository root or inside it, not the ordinary `<home>/.claude`
 *      profile, not the home directory.
 *   4. the requested model id is a member of the closed allowlist —
 *      arbitrary strings never reach a provider.
 *   5. the bounded run configuration is internally valid (`maxTurns`, when
 *      present, is a positive integer within the small approved bound).
 *
 * A failure carries a deterministic `kind` and a bounded, operator-facing
 * `detail` naming WHAT failed (variable NAMES, never values). The provider
 * maps any pre-flight failure onto the provider-neutral `AUTH_FAILURE`
 * outcome with zero SDK-runner invocations; the exported function is also
 * available to a future orchestration/CLI layer that wants to refuse
 * row-lessly before a call row is ever inserted.
 */
import {
  PROHIBITED_SETUP_TOKEN_VARIABLE,
  findConflictingAuthVariables,
  type ForbiddenAuthVariable,
} from './authConflicts.js';
import { resolveClassifierProfileDir, type ProfileDirFailureKind } from './profile.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from './allowedModels.js';
import type { ClassifierRunConfig } from '../providerContract.js';

/** The largest `maxTurns` a classifier call may request. A tool-less call needs headroom only for the SDK's internal structured-output re-prompt (small, named). */
export const MAX_CLASSIFIER_MAX_TURNS = 8;

export type PreflightFailureKind =
  | 'CONFLICTING_AUTH_VARIABLES'
  | 'SETUP_TOKEN_PRESENT'
  | ProfileDirFailureKind
  | 'MODEL_NOT_ALLOWED'
  | 'INVALID_RUN_CONFIG';

export type PreflightResult =
  | {
      readonly ok: true;
      /** The resolved dedicated classifier profile directory. */
      readonly profileDir: string;
    }
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
  /** The repository root the orchestration process runs from. */
  readonly repoRoot: string;
  readonly modelId: string;
  readonly runConfig: ClassifierRunConfig;
  /** The closed model allowlist. Defaults to the code-owned constant; tests may inject fake ids through the provider's explicit seam. */
  readonly allowedModels?: readonly string[];
}

export function runClassifierPreflight(input: PreflightInput): PreflightResult {
  // Conflicts first, in SEVERITY order: a conflicted environment is refused
  // before anything else is even examined, because a conflicting variable is
  // the one finding that could route inference off the subscription.
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

  if (input.env[PROHIBITED_SETUP_TOKEN_VARIABLE] !== undefined) {
    return {
      ok: false,
      kind: 'SETUP_TOKEN_PRESENT',
      detail:
        `refused: ${PROHIBITED_SETUP_TOKEN_VARIABLE} is set. The setup-token mechanism is ` +
        `prohibited for classifier runtime v1: setup-token credentials pass local status ` +
        `checks but fail real inference upstream (ADR 0010). Unset it and use the ` +
        `dedicated stored-login classifier profile instead. Its value was not read ` +
        `further and is not included here.`,
    };
  }

  const profile = resolveClassifierProfileDir({ env: input.env, repoRoot: input.repoRoot });
  if (!profile.ok) {
    return { ok: false, kind: profile.kind, detail: profile.detail };
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

  return { ok: true, profileDir: profile.profileDir };
}

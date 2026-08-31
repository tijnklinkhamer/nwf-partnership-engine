/**
 * CENTRALIZED SDK-FAILURE → PROVIDER-NEUTRAL OUTCOME MAPPING (Phase 2B-2C
 * Max-runtime design §§9, 21). ONE narrow module holds every recognition
 * rule; nothing anywhere else in the repository string-matches a provider
 * error (spec: "centralize detection in one narrow function").
 *
 * HONESTY ABOUT WHAT IS HEURISTIC. The exact error shape the SDK surfaces
 * for each failure class is NOT a documented stable contract:
 *
 *   - USAGE-LIMIT recognition is the strongest currently supportable: it
 *     matches against `USAGE_LIMIT_ERROR_PREFIXES`, the SDK's OWN exported
 *     list of "a usage limit was genuinely reached" message prefixes
 *     (re-exported through the single SDK import site,
 *     `agentSdkRunner.ts`). Anthropic's vocabulary, not ours — but the
 *     upstream export is marked @alpha, so this mapping is expected to be
 *     re-verified against the first authorised live smoke call and the
 *     2B-2E shadow evidence, and updated HERE and only here.
 *   - AUTH recognition is a small, named marker list (below) — heuristic,
 *     honestly so. A missed auth error degrades to PROVIDER_TRANSIENT and
 *     fails after bounded retries; it can never route anywhere else,
 *     because no non-subscription credential exists in either process.
 *   - An UNRECOGNISED failure maps to PROVIDER_TRANSIENT (design §9: "an
 *     unrecognisable error maps to PROVIDER_TRANSIENT or OTHER" — the
 *     provider-neutral taxonomy has no OTHER, and transient is the only
 *     member whose consequence, a bounded retry then FAILED, is safe to be
 *     wrong about). Unknown errors are NEVER labelled
 *     USAGE_LIMIT_EXHAUSTED: exhaustion is claimed only on the SDK's own
 *     prefix vocabulary.
 *
 * Mapping uncertainty can only ever mislabel a failure — it can never
 * route to a paid path, because none exists in-process (design §9).
 *
 * The `detail` strings returned here are FIXED, bounded descriptions that
 * name the recognised category — never raw provider text, never a stack
 * trace, never a credential (the landed `providerContract.ts` outcome
 * contract). The provider additionally scrubs the OAuth token value from
 * every detail string as defense in depth before returning it.
 *
 * PURE logic. The only import is the prefix constant re-exported by the
 * runner seam; no network, no database, no filesystem, no clock.
 */
import type { ClassifierProviderOutcomeKind } from '../providerContract.js';
import { USAGE_LIMIT_ERROR_PREFIXES, type AgentSdkRunResult } from './agentSdkRunner.js';

/** A classified failure (or success) of one SDK run attempt. */
export type ClassifiedAttempt =
  | { readonly kind: 'OK'; readonly structuredOutput: unknown }
  | {
      readonly kind: Exclude<ClassifierProviderOutcomeKind, 'OK'>;
      readonly detail: string;
    };

/**
 * Auth-failure markers, lowercase. Small and named on purpose: a guard this
 * heuristic must be reviewable at a glance and updatable from live smoke
 * evidence in one place.
 */
export const AUTH_FAILURE_MARKERS: readonly string[] = [
  'authentication_error',
  'authentication failed',
  'invalid api key',
  'oauth token has expired',
  'oauth token is invalid',
  'oauth token revoked',
  'please run /login',
  'unauthorized',
];

/** Timeout markers, lowercase, plus the SDK's AbortError name checked separately. */
export const TIMEOUT_MARKERS: readonly string[] = ['timed out', 'timeout'];

function matchesUsageLimit(text: string): boolean {
  return USAGE_LIMIT_ERROR_PREFIXES.some((prefix) => text.includes(prefix));
}

function matchesAuthFailure(lowerText: string): boolean {
  return AUTH_FAILURE_MARKERS.some((m) => lowerText.includes(m)) || /\b401\b/.test(lowerText);
}

function matchesTimeout(lowerText: string): boolean {
  return TIMEOUT_MARKERS.some((m) => lowerText.includes(m));
}

/**
 * Classifies a NORMALIZED terminal run result (the runner returned; the SDK
 * stream ended in a result message).
 */
export function classifyRunResult(result: AgentSdkRunResult): ClassifiedAttempt {
  const errorText = [result.resultText ?? '', ...result.errors].join('\n');
  const lower = errorText.toLowerCase();

  if (result.subtype === 'success' && !result.isError) {
    if (result.stopReason === 'refusal') {
      return {
        kind: 'PROVIDER_REFUSAL',
        detail: 'provider refusal: the model declined this request (stop_reason refusal).',
      };
    }
    if (result.structuredOutput !== undefined) {
      return { kind: 'OK', structuredOutput: result.structuredOutput };
    }
    // Documented SDK case: subtype success WITHOUT a structured_output value.
    // Never treated as an empty success, never salvaged from result text.
    return {
      kind: 'STRUCTURED_OUTPUT_FAILED',
      detail:
        'structured output failed: the SDK reported success but delivered no structured_output value.',
    };
  }

  // Error-shaped results: recognise the operationally primary classes first,
  // from the SDK's own vocabulary where one exists.
  if (matchesUsageLimit(errorText)) {
    return {
      kind: 'USAGE_LIMIT_EXHAUSTED',
      detail:
        'subscription usage limit reached (recognised via the SDK usage-limit message vocabulary). ' +
        'No retry, no fallback; re-run deliberately after the limit resets.',
    };
  }
  if (matchesAuthFailure(lower)) {
    return {
      kind: 'AUTH_FAILURE',
      detail:
        'authentication failure reported by the provider runtime. ' +
        'Re-mint the subscription token with `claude setup-token` (operator action).',
    };
  }
  if (result.stopReason === 'refusal') {
    return {
      kind: 'PROVIDER_REFUSAL',
      detail: 'provider refusal: the model declined this request (stop_reason refusal).',
    };
  }
  if (result.subtype === 'error_max_structured_output_retries') {
    return {
      kind: 'STRUCTURED_OUTPUT_FAILED',
      detail: 'structured output failed: the SDK exhausted its internal structured-output retries.',
    };
  }
  if (matchesTimeout(lower)) {
    return { kind: 'TIMEOUT', detail: 'the provider runtime reported a timeout.' };
  }
  if (result.subtype === 'error_max_turns' || result.subtype === 'error_max_budget_usd') {
    return {
      kind: 'STRUCTURED_OUTPUT_FAILED',
      detail: `structured output failed: the run terminated (${result.subtype}) without a structured result.`,
    };
  }
  // Unrecognised error-shaped result (`error_during_execution`, or a success
  // subtype flagged is_error with unrecognised text): transient, bounded-retryable.
  return {
    kind: 'PROVIDER_TRANSIENT',
    detail:
      'transient or unrecognised provider failure (mapped PROVIDER_TRANSIENT; see outcomeMapping.ts).',
  };
}

/**
 * Classifies a failure the runner THREW (transport-level: spawn failure,
 * connection reset, abort) rather than returned.
 */
export function classifyThrownFailure(error: unknown): ClassifiedAttempt {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (name === 'AbortError' || matchesTimeout(lower)) {
    return { kind: 'TIMEOUT', detail: 'the provider invocation timed out or was aborted.' };
  }
  if (matchesUsageLimit(message)) {
    return {
      kind: 'USAGE_LIMIT_EXHAUSTED',
      detail:
        'subscription usage limit reached (recognised via the SDK usage-limit message vocabulary). ' +
        'No retry, no fallback; re-run deliberately after the limit resets.',
    };
  }
  if (matchesAuthFailure(lower)) {
    return {
      kind: 'AUTH_FAILURE',
      detail:
        'authentication failure reported by the provider runtime. ' +
        'Re-mint the subscription token with `claude setup-token` (operator action).',
    };
  }
  return {
    kind: 'PROVIDER_TRANSIENT',
    detail:
      'transient or unrecognised provider transport failure (mapped PROVIDER_TRANSIENT; see outcomeMapping.ts).',
  };
}

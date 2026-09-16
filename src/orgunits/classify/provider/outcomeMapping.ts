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
 *   - DETERMINISTIC STRUCTURED-OUTPUT/REQUEST-SCHEMA REJECTION (2B-2C3C,
 *     from the 2026-09-01 2B-2C3B smoke): `matchesStructuredOutputSchemaFailure`
 *     recognises the Messages API rejecting the SDK's OWN injected
 *     structured-output tool schema — observed as `API Error: 4xx` naming
 *     `input_schema` (`tools.0.custom.input_schema.type: Input should be
 *     'object'`). Retrying an unmodified request against this failure can
 *     never succeed, so it maps to `STRUCTURED_OUTPUT_FAILED`, never
 *     `PROVIDER_TRANSIENT` — and it is deliberately narrow (requires BOTH
 *     an `API Error: 4xx`-shaped code AND an `input_schema` mention) so an
 *     unrelated 4xx (a bad model id, a rate limit) is never swept in.
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
 * THE LIVENESS BOUNDARY (2D2B-2): the runner's own `AgentSdkTimeoutError`
 * is recognised as `TIMEOUT` BY CLASS, before any text heuristic, and a
 * provider whose total budget is spent before an attempt can start reports
 * the same terminal `TIMEOUT` through `classifyTotalBudgetExhausted`. Both
 * details are fixed text: the error's diagnostics (stderr tail, progress
 * trace) are NEVER copied into a detail, which is the string that can reach
 * a persisted `error_summary`.
 *
 * PURE logic. The only imports are the prefix constant and the timeout
 * error class from the runner seam; no network, no database, no
 * filesystem, no clock.
 */
import type { ClassifierProviderOutcomeKind } from '../providerContract.js';
import {
  AgentSdkTimeoutError,
  USAGE_LIMIT_ERROR_PREFIXES,
  type AgentSdkRunResult,
} from './agentSdkRunner.js';

/**
 * 2D2C-F0Z: the CLOSED, machine-readable reason behind a non-OK outcome.
 *
 * Five structurally different SDK conditions used to collapse into the single
 * enum member `STRUCTURED_OUTPUT_FAILED`, with the distinction surviving only
 * as English prose inside `outcomeDetail`. Recovery-1's PAIR_3_V4 batch-09 is
 * the worked example: it was `error_max_turns` under `maxTurns: 3` with 4,518
 * output tokens — a TURN-BUDGET exhaustion, which reading as "the model could
 * not produce the schema" would be a plain attribution error.
 *
 * This code is REPORTING ONLY. No control-flow branch reads it; the enum
 * member alone still decides stop/continue, exactly as before.
 */
export const PROVIDER_OUTCOME_REASON_CODES = [
  // STRUCTURED_OUTPUT_FAILED, disambiguated
  'SUCCESS_WITHOUT_STRUCTURED_OUTPUT',
  'SDK_STRUCTURED_OUTPUT_RETRIES_EXHAUSTED',
  'MAX_TURNS_EXHAUSTED',
  'MAX_BUDGET_USD_EXHAUSTED',
  'REQUEST_SCHEMA_REJECTED',
  // TIMEOUT, disambiguated
  'LIVENESS_DEADLINE_EXCEEDED',
  'TOTAL_BUDGET_EXHAUSTED',
  'PROVIDER_REPORTED_TIMEOUT',
  'ABORTED',
  // everything else
  'USAGE_LIMIT_REACHED',
  'AUTH_FAILURE_REPORTED',
  'PRE_FLIGHT_REFUSAL',
  'MODEL_REFUSAL',
  'UNRECOGNISED_ERROR',
] as const;

export type ProviderOutcomeReasonCode = (typeof PROVIDER_OUTCOME_REASON_CODES)[number];

/** A classified failure (or success) of one SDK run attempt. */
export type ClassifiedAttempt =
  | { readonly kind: 'OK'; readonly structuredOutput: unknown }
  | {
      readonly kind: Exclude<ClassifierProviderOutcomeKind, 'OK'>;
      readonly detail: string;
      /** Required: every non-OK classification names its reason in machine-readable form. */
      readonly reasonCode: ProviderOutcomeReasonCode;
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

/**
 * Narrow, evidence-based markers for the deterministic structured-output/
 * request-schema rejection the 2B-2C3B smoke observed. Both an `API Error:
 * 4xx`-shaped code AND a mention of `input_schema` are required — matching
 * only the actually-observed failure class, never a blanket "every 4xx".
 */
export const STRUCTURED_OUTPUT_SCHEMA_ERROR_MARKERS: readonly string[] = ['input_schema'];

function matchesUsageLimit(text: string): boolean {
  return USAGE_LIMIT_ERROR_PREFIXES.some((prefix) => text.includes(prefix));
}

function matchesAuthFailure(lowerText: string): boolean {
  return AUTH_FAILURE_MARKERS.some((m) => lowerText.includes(m)) || /\b401\b/.test(lowerText);
}

function matchesTimeout(lowerText: string): boolean {
  return TIMEOUT_MARKERS.some((m) => lowerText.includes(m));
}

function matchesStructuredOutputSchemaFailure(lowerText: string): boolean {
  return (
    /\bapi error:\s*4\d\d\b/.test(lowerText) &&
    STRUCTURED_OUTPUT_SCHEMA_ERROR_MARKERS.some((m) => lowerText.includes(m))
  );
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
        reasonCode: 'MODEL_REFUSAL',
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
      reasonCode: 'SUCCESS_WITHOUT_STRUCTURED_OUTPUT',
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
      reasonCode: 'USAGE_LIMIT_REACHED',
    };
  }
  if (matchesAuthFailure(lower)) {
    return {
      kind: 'AUTH_FAILURE',
      detail:
        'authentication failure reported by the provider runtime. ' +
        'Re-mint the subscription token with `claude setup-token` (operator action).',
      reasonCode: 'AUTH_FAILURE_REPORTED',
    };
  }
  if (result.stopReason === 'refusal') {
    return {
      kind: 'PROVIDER_REFUSAL',
      detail: 'provider refusal: the model declined this request (stop_reason refusal).',
      reasonCode: 'MODEL_REFUSAL',
    };
  }

  // 2D2C-F0Z ORDERING CORRECTION. Every EXPLICIT SDK subtype is tested before
  // the `matchesTimeout` TEXT heuristic, because the heuristic matches the
  // bare substring "timeout" anywhere in the error text. Previously
  // `matchesTimeout` ran first, so an `error_max_turns` result whose text
  // merely MENTIONED a timeout was classified TIMEOUT - and under C1 a
  // TIMEOUT and a STRUCTURED_OUTPUT_FAILED now travel different paths, so a
  // structural fact must never lose to a substring.
  if (result.subtype === 'error_max_structured_output_retries') {
    return {
      kind: 'STRUCTURED_OUTPUT_FAILED',
      detail: 'structured output failed: the SDK exhausted its internal structured-output retries.',
      reasonCode: 'SDK_STRUCTURED_OUTPUT_RETRIES_EXHAUSTED',
    };
  }
  if (result.subtype === 'error_max_turns') {
    return {
      kind: 'STRUCTURED_OUTPUT_FAILED',
      detail: `structured output failed: the run terminated (${result.subtype}) without a structured result.`,
      reasonCode: 'MAX_TURNS_EXHAUSTED',
    };
  }
  if (result.subtype === 'error_max_budget_usd') {
    return {
      kind: 'STRUCTURED_OUTPUT_FAILED',
      detail: `structured output failed: the run terminated (${result.subtype}) without a structured result.`,
      reasonCode: 'MAX_BUDGET_USD_EXHAUSTED',
    };
  }
  if (matchesStructuredOutputSchemaFailure(lower)) {
    return {
      kind: 'STRUCTURED_OUTPUT_FAILED',
      detail:
        'structured output failed: the provider rejected the request structured-output ' +
        'schema (deterministic HTTP 4xx naming input_schema; never retried).',
      reasonCode: 'REQUEST_SCHEMA_REJECTED',
    };
  }
  if (matchesTimeout(lower)) {
    return {
      kind: 'TIMEOUT',
      detail: 'the provider runtime reported a timeout.',
      reasonCode: 'PROVIDER_REPORTED_TIMEOUT',
    };
  }
  // Unrecognised error-shaped result (`error_during_execution`, or a success
  // subtype flagged is_error with unrecognised text): transient, bounded-retryable.
  return {
    kind: 'PROVIDER_TRANSIENT',
    detail:
      'transient or unrecognised provider failure (mapped PROVIDER_TRANSIENT; see outcomeMapping.ts).',
    reasonCode: 'UNRECOGNISED_ERROR',
  };
}

/**
 * Classifies a failure the runner THREW (transport-level: spawn failure,
 * connection reset, abort) rather than returned.
 */
export function classifyThrownFailure(error: unknown): ClassifiedAttempt {
  if (error instanceof AgentSdkTimeoutError) {
    return {
      kind: 'TIMEOUT',
      detail:
        'the provider invocation exceeded its liveness deadline and was aborted and closed ' +
        '(TIMEOUT; terminal, never retried).',
      reasonCode: 'LIVENESS_DEADLINE_EXCEEDED',
    };
  }
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (name === 'AbortError' || matchesTimeout(lower)) {
    return {
      kind: 'TIMEOUT',
      detail: 'the provider invocation timed out or was aborted.',
      reasonCode: name === 'AbortError' ? 'ABORTED' : 'PROVIDER_REPORTED_TIMEOUT',
    };
  }
  if (matchesUsageLimit(message)) {
    return {
      kind: 'USAGE_LIMIT_EXHAUSTED',
      detail:
        'subscription usage limit reached (recognised via the SDK usage-limit message vocabulary). ' +
        'No retry, no fallback; re-run deliberately after the limit resets.',
      reasonCode: 'USAGE_LIMIT_REACHED',
    };
  }
  if (matchesAuthFailure(lower)) {
    return {
      kind: 'AUTH_FAILURE',
      detail:
        'authentication failure reported by the provider runtime. ' +
        'Re-mint the subscription token with `claude setup-token` (operator action).',
      reasonCode: 'AUTH_FAILURE_REPORTED',
    };
  }
  if (matchesStructuredOutputSchemaFailure(lower)) {
    return {
      kind: 'STRUCTURED_OUTPUT_FAILED',
      detail:
        'structured output failed: the provider rejected the request structured-output ' +
        'schema (deterministic HTTP 4xx naming input_schema; never retried).',
      reasonCode: 'REQUEST_SCHEMA_REJECTED',
    };
  }
  return {
    kind: 'PROVIDER_TRANSIENT',
    detail:
      'transient or unrecognised provider transport failure (mapped PROVIDER_TRANSIENT; see outcomeMapping.ts).',
    reasonCode: 'UNRECOGNISED_ERROR',
  };
}

/**
 * The terminal outcome when the provider's total call budget is spent
 * before another runner attempt could begin. No runner was invoked for it.
 */
export function classifyTotalBudgetExhausted(): ClassifiedAttempt {
  return {
    kind: 'TIMEOUT',
    detail:
      'the classifier call total time budget was exhausted before another provider attempt ' +
      'could begin (TIMEOUT; terminal, never retried).',
    reasonCode: 'TOTAL_BUDGET_EXHAUSTED',
  };
}

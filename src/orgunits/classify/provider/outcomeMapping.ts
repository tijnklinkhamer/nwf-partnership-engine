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
  AGENT_SDK_ATTEMPT_FAILURE_STAGES,
  AgentSdkAttemptError,
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
  // CLASSIFIER_PROVIDER_FAILURE_DIAGNOSTICS_V1: the runner's diagnostics
  // wrapper is TRANSPARENT here - the ORIGINAL thrown value is classified
  // exactly as it was before the wrapper existed.
  if (error instanceof AgentSdkAttemptError) return classifyThrownFailure(error.cause);
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

// ---------------------------------------------------------------------------
// CLASSIFIER_PROVIDER_FAILURE_DIAGNOSTICS_V1 — the closed per-attempt witness.
//
// B4-4 (2026-10-08) persisted FAILED / PROVIDER_TRANSIENT with only the fixed
// "transient or unrecognised provider failure" detail: up to three SDK
// attempts ran, and nothing durable said what any of them looked like. The
// witness below is the STRUCTURE of one attempt — closed vocabulary and
// integers only — derived HERE, in the one mapping authority, so that no
// other module ever inspects provider text. Raw text (result text, error
// strings, exception messages) is READ here only to derive a closed value
// and is NEVER copied into a witness.
//
// SOURCES, deliberately narrow: the normalized run result (including the
// SDK-declared structural fields `api_error_status`, `terminal_reason`, the
// assistant `error` union and `api_retry` counts), and the runner's TYPED
// failure classes. The runner's bounded stderr/progress snapshot is NOT a
// source: the landed firewall keeps it out of anything persistable, and this
// module still never reads it.
//
// REPORTING ONLY, exactly like the reason code: nothing branches on a
// witness, and deriving one can never change an attempt's classification.
// ---------------------------------------------------------------------------

/** How one provider attempt ended, structurally. */
export const PROVIDER_ATTEMPT_SHAPES = [
  /** The runner returned a normalized terminal result message. */
  'RESULT',
  /** The runner threw. */
  'THROWN',
  /** The total budget was spent before this attempt could start; no runner call. */
  'NOT_STARTED',
] as const;
export type ProviderAttemptShape = (typeof PROVIDER_ATTEMPT_SHAPES)[number];

/** Why a THROWN attempt threw, from the runner's own typed failures — never from prose. */
export const PROVIDER_THROWN_FAILURE_CLASSES = [
  'LIVENESS_TIMEOUT',
  ...AGENT_SDK_ATTEMPT_FAILURE_STAGES,
  /** A throw that did not come through the runner's typed failures (a fake, or a future runner). */
  'UNTYPED_THROW',
] as const;
export type ProviderThrownFailureClass = (typeof PROVIDER_THROWN_FAILURE_CLASSES)[number];

/** The result subtypes the pinned SDK declares; anything else is `OTHER`. */
const RESULT_SUBTYPES: ReadonlySet<string> = new Set([
  'success',
  'error_during_execution',
  'error_max_turns',
  'error_max_budget_usd',
  'error_max_structured_output_retries',
]);

/** Messages API stop reasons; anything else (non-null) is `OTHER`. */
const STOP_REASONS: ReadonlySet<string> = new Set([
  'end_turn',
  'max_tokens',
  'stop_sequence',
  'tool_use',
  'pause_turn',
  'refusal',
  'model_context_window_exceeded',
]);

/** The pinned SDK's `TerminalReason` union (sdk.d.ts, 0.3.251); anything else is `OTHER`. */
const TERMINAL_REASONS: ReadonlySet<string> = new Set([
  'blocking_limit',
  'rapid_refill_breaker',
  'prompt_too_long',
  'image_error',
  'model_error',
  'api_error',
  'malformed_tool_use_exhausted',
  'aborted_streaming',
  'aborted_tools',
  'stop_hook_prevented',
  'hook_stopped',
  'tool_deferred',
  'max_turns',
  'background_requested',
  'completed',
  'budget_exhausted',
  'structured_output_retry_exhausted',
  'tool_deferred_unavailable',
  'turn_setup_failed',
]);

/** The pinned SDK's `SDKAssistantMessageError` union (sdk.d.ts, 0.3.251); anything else is `OTHER`. */
const ASSISTANT_ERRORS: ReadonlySet<string> = new Set([
  'authentication_failed',
  'oauth_org_not_allowed',
  'account_on_hold',
  'billing_error',
  'rate_limit',
  'overloaded',
  'invalid_request',
  'model_not_found',
  'server_error',
  'unknown',
  'max_output_tokens',
]);

/**
 * The `errorClass` own-property values the pinned SDK's transport attaches to
 * a process/spawn failure. NOT part of the SDK's declared types — read
 * best-effort, validated against this closed list, else `OTHER`.
 */
const TRANSPORT_ERROR_CLASSES: ReadonlySet<string> = new Set([
  'process_exited_nonzero',
  'process_killed_by_signal',
  'executable_launch_failed',
  'spawn_failed',
]);

/** Error names that may be reported verbatim — anything else is `OTHER`. */
const THROWN_NAMES: ReadonlySet<string> = new Set([
  'Error',
  'AbortError',
  'TypeError',
  'RangeError',
  'ReferenceError',
]);

/**
 * Closed markers recognised in bounded text (result/error text, a thrown
 * message). Each reuses an EXISTING recogniser in this module, so a marker
 * can never disagree with the classification rules above.
 */
export const PROVIDER_TEXT_MARKERS = [
  'USAGE_LIMIT',
  'AUTH',
  'TIMEOUT',
  'REQUEST_SCHEMA',
  'API_ERROR_STATUS',
  'PROCESS_EXIT',
  /** The CLI's `[ede_diagnostic]` prefix on an `error_during_execution` with no valid terminal message. */
  'EDE_DIAGNOSTIC',
] as const;
export type ProviderTextMarker = (typeof PROVIDER_TEXT_MARKERS)[number];

/** `API Error: NNN` — the CLI's own prefix for an HTTP error from the Messages API. */
const API_ERROR_STATUS_PATTERN = /\bapi error:\s*([1-5]\d\d)\b/i;
/** `... exited with code N` — the SDK transport's wording for a non-zero child exit. */
const PROCESS_EXIT_CODE_PATTERN = /\bexited with code (\d{1,3})\b/i;

function textMarkers(text: string): ProviderTextMarker[] {
  if (text.length === 0) return [];
  const lower = text.toLowerCase();
  const markers: ProviderTextMarker[] = [];
  if (matchesUsageLimit(text)) markers.push('USAGE_LIMIT');
  if (matchesAuthFailure(lower)) markers.push('AUTH');
  if (matchesTimeout(lower)) markers.push('TIMEOUT');
  if (matchesStructuredOutputSchemaFailure(lower)) markers.push('REQUEST_SCHEMA');
  if (API_ERROR_STATUS_PATTERN.test(text)) markers.push('API_ERROR_STATUS');
  if (PROCESS_EXIT_CODE_PATTERN.test(text)) markers.push('PROCESS_EXIT');
  if (lower.includes('[ede_diagnostic]')) markers.push('EDE_DIAGNOSTIC');
  return markers;
}

/** An HTTP status, as an integer 100..599, or null. */
function httpStatusOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : null;
}

/** The FIRST `API Error: NNN` status in `text`, as an integer — never the surrounding text. */
function apiErrorStatusInText(text: string): number | null {
  const match = API_ERROR_STATUS_PATTERN.exec(text);
  return match === null ? null : Number(match[1]);
}

/** A process exit code, as an integer 0..255, or null. */
function exitCodeOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255
    ? value
    : null;
}

/** The child's exit code from the SDK's `exited with code N` wording, or null. */
function exitCodeInText(text: string): number | null {
  const match = PROCESS_EXIT_CODE_PATTERN.exec(text);
  return match === null ? null : exitCodeOf(Number(match[1]));
}

const closedOrOther = (set: ReadonlySet<string>, value: unknown): string | null =>
  typeof value === 'string' ? (set.has(value) ? value : 'OTHER') : null;

const countOf = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** One provider attempt, reduced to structure. Every string is a closed-list member. */
export interface ProviderAttemptWitness {
  /** 1-based attempt ordinal within ONE `classify()` call. */
  readonly ordinal: number;
  readonly shape: ProviderAttemptShape;
  readonly outcome: ClassifierProviderOutcomeKind;
  readonly reasonCode: ProviderOutcomeReasonCode | null;
  /** Wall time of the attempt on the provider's injected clock, whole ms. */
  readonly elapsedMs: number;
  // ---- RESULT shape only (null / empty otherwise) ----
  readonly resultSubtype: string | null;
  readonly resultIsError: boolean | null;
  readonly stopReason: string | null;
  /** SDK `TerminalReason` member, `OTHER`, or null when the result carried none. */
  readonly terminalReason: string | null;
  /** The last assistant message's SDK `SDKAssistantMessageError` member, `OTHER`, or null. */
  readonly assistantError: string | null;
  /** `system/api_retry` messages observed before the result; null when not reported. */
  readonly apiRetryCount: number | null;
  readonly lastApiRetryErrorStatus: number | null;
  readonly resultErrorCount: number | null;
  readonly resultTextPresent: boolean | null;
  readonly modelReported: boolean | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  /** Closed markers found in the result text and error strings. */
  readonly resultMarkers: readonly ProviderTextMarker[];
  // ---- THROWN shape only (null / empty otherwise) ----
  readonly thrownClass: ProviderThrownFailureClass | null;
  /** The ORIGINAL thrown value's `name`, only when it is one of a closed set; else `OTHER`. */
  readonly thrownName: string | null;
  /** The SDK transport's `errorClass` own property, validated; else `OTHER`/null. */
  readonly transportErrorClass: string | null;
  readonly thrownMarkers: readonly ProviderTextMarker[];
  // ---- RESULT or THROWN ----
  /** The HTTP status of the API error: the result's structural `api_error_status` first, else `API Error: NNN` text. */
  readonly apiErrorStatus: number | null;
  /** Child exit code: the transport's `exitCode` own property first, else `exited with code N` text. */
  readonly processExitCode: number | null;
}

function reasonCodeOf(classified: ClassifiedAttempt): ProviderOutcomeReasonCode | null {
  return classified.kind === 'OK' ? null : classified.reasonCode;
}

const EMPTY_RESULT_FIELDS = {
  resultSubtype: null,
  resultIsError: null,
  stopReason: null,
  terminalReason: null,
  assistantError: null,
  apiRetryCount: null,
  lastApiRetryErrorStatus: null,
  resultErrorCount: null,
  resultTextPresent: null,
  modelReported: null,
  inputTokens: null,
  outputTokens: null,
  resultMarkers: [],
} as const;

const EMPTY_THROWN_FIELDS = {
  thrownClass: null,
  thrownName: null,
  transportErrorClass: null,
  thrownMarkers: [],
} as const;

const wholeMs = (value: number): number => countOf(Math.round(value)) ?? 0;

/** The witness of an attempt whose runner RETURNED `result`, classified as `classified`. */
export function witnessReturnedAttempt(input: {
  readonly ordinal: number;
  readonly elapsedMs: number;
  readonly result: AgentSdkRunResult;
  readonly classified: ClassifiedAttempt;
}): ProviderAttemptWitness {
  const { result } = input;
  // A genuine success's text is the MODEL'S ANSWER, not an error report:
  // nothing is derived from it.
  const text =
    input.classified.kind === 'OK' ? '' : [result.resultText ?? '', ...result.errors].join('\n');
  return Object.freeze({
    ordinal: input.ordinal,
    shape: 'RESULT',
    outcome: input.classified.kind,
    reasonCode: reasonCodeOf(input.classified),
    elapsedMs: wholeMs(input.elapsedMs),
    resultSubtype: closedOrOther(RESULT_SUBTYPES, result.subtype),
    resultIsError: result.isError === true,
    stopReason: closedOrOther(STOP_REASONS, result.stopReason),
    terminalReason: closedOrOther(TERMINAL_REASONS, result.terminalReason),
    assistantError: closedOrOther(ASSISTANT_ERRORS, result.assistantError),
    apiRetryCount: countOf(result.apiRetryCount),
    lastApiRetryErrorStatus: httpStatusOf(result.lastApiRetryErrorStatus),
    resultErrorCount: Array.isArray(result.errors) ? result.errors.length : 0,
    resultTextPresent: typeof result.resultText === 'string' && result.resultText.length > 0,
    modelReported: result.responseModelId !== null,
    inputTokens: countOf(result.inputTokens),
    outputTokens: countOf(result.outputTokens),
    resultMarkers: Object.freeze(textMarkers(text)),
    ...EMPTY_THROWN_FIELDS,
    apiErrorStatus: httpStatusOf(result.apiErrorStatus) ?? apiErrorStatusInText(text),
    processExitCode: exitCodeInText(text),
  });
}

/** The witness of an attempt whose runner THREW `error`, classified as `classified`. */
export function witnessThrownAttempt(input: {
  readonly ordinal: number;
  readonly elapsedMs: number;
  readonly error: unknown;
  readonly classified: ClassifiedAttempt;
}): ProviderAttemptWitness {
  let thrownClass: ProviderThrownFailureClass;
  let original: unknown;
  if (input.error instanceof AgentSdkTimeoutError) {
    thrownClass = 'LIVENESS_TIMEOUT';
    original = input.error;
  } else if (input.error instanceof AgentSdkAttemptError) {
    thrownClass = input.error.failureStage;
    original = input.error.cause;
  } else {
    thrownClass = 'UNTYPED_THROW';
    original = input.error;
  }
  const timeout = thrownClass === 'LIVENESS_TIMEOUT';
  const name = original instanceof Error ? original.name : null;
  const message = original instanceof Error ? original.message : String(original);
  // Own properties the SDK transport attaches to a process failure; undeclared, so read defensively.
  const own = (original !== null && typeof original === 'object' ? original : {}) as {
    readonly exitCode?: unknown;
    readonly errorClass?: unknown;
  };
  return Object.freeze({
    ordinal: input.ordinal,
    shape: 'THROWN',
    outcome: input.classified.kind,
    reasonCode: reasonCodeOf(input.classified),
    elapsedMs: wholeMs(input.elapsedMs),
    ...EMPTY_RESULT_FIELDS,
    thrownClass,
    thrownName: name === null ? 'NON_ERROR' : THROWN_NAMES.has(name) ? name : 'OTHER',
    transportErrorClass: timeout ? null : closedOrOther(TRANSPORT_ERROR_CLASSES, own.errorClass),
    // The liveness boundary's OWN message is fixed text; nothing is derived from it.
    thrownMarkers: Object.freeze(timeout ? [] : textMarkers(message)),
    apiErrorStatus: timeout ? null : apiErrorStatusInText(message),
    processExitCode: timeout ? null : (exitCodeOf(own.exitCode) ?? exitCodeInText(message)),
  });
}

/** The witness of an attempt the total budget prevented from starting. */
export function witnessNotStartedAttempt(input: {
  readonly ordinal: number;
  readonly classified: ClassifiedAttempt;
}): ProviderAttemptWitness {
  return Object.freeze({
    ordinal: input.ordinal,
    shape: 'NOT_STARTED',
    outcome: input.classified.kind,
    reasonCode: reasonCodeOf(input.classified),
    elapsedMs: 0,
    ...EMPTY_RESULT_FIELDS,
    ...EMPTY_THROWN_FIELDS,
    apiErrorStatus: null,
    processExitCode: null,
  });
}

/**
 * A witness's normalized SHAPE: every field except the ordinal and the
 * timing. Two attempts with equal shape keys failed "the same way".
 */
export function attemptShapeKey(witness: ProviderAttemptWitness): string {
  const { ordinal: _ordinal, elapsedMs: _elapsedMs, ...shape } = witness;
  return JSON.stringify(shape);
}

/** The version tag of the rendered diagnostic, so a reader can tell formats apart. */
export const PROVIDER_FAILURE_DIAGNOSTIC_VERSION = 'provider-diag-v1';

const flag = (value: boolean | null): string => (value === null ? '-' : value ? '1' : '0');
const num = (value: number | null): string => (value === null ? '-' : String(value));
const list = (values: readonly string[]): string => (values.length === 0 ? '-' : values.join('+'));

function renderAttempt(witness: ProviderAttemptWitness): string {
  const parts = [
    `#${witness.ordinal} ${witness.shape}`,
    `${witness.outcome}/${witness.reasonCode ?? '-'}`,
  ];
  if (witness.shape === 'RESULT') {
    parts.push(
      `subtype=${witness.resultSubtype ?? '-'}`,
      `isError=${flag(witness.resultIsError)}`,
      `stop=${witness.stopReason ?? '-'}`,
      `terminal=${witness.terminalReason ?? '-'}`,
      `assistantError=${witness.assistantError ?? '-'}`,
      `apiRetries=${num(witness.apiRetryCount)}/${num(witness.lastApiRetryErrorStatus)}`,
      `errors=${num(witness.resultErrorCount)}`,
      `text=${flag(witness.resultTextPresent)}`,
      `model=${flag(witness.modelReported)}`,
      `tokens=${num(witness.inputTokens)}/${num(witness.outputTokens)}`,
      `markers=${list(witness.resultMarkers)}`,
    );
  } else if (witness.shape === 'THROWN') {
    parts.push(
      `class=${witness.thrownClass ?? '-'}`,
      `name=${witness.thrownName ?? '-'}`,
      `transport=${witness.transportErrorClass ?? '-'}`,
      `markers=${list(witness.thrownMarkers)}`,
    );
  }
  if (witness.shape !== 'NOT_STARTED') {
    parts.push(`api=${num(witness.apiErrorStatus)}`, `exit=${num(witness.processExitCode)}`);
  }
  parts.push(`ms=${witness.elapsedMs}`);
  return parts.join(' ');
}

/**
 * Renders a call's attempt witnesses as ONE bounded line built ONLY from
 * closed-list members and integers — the durable form, appended to the
 * outcome detail and so to the existing `error_summary` column. Three
 * attempts render well under 1,500 characters; the provider's
 * 2,000-character bound still applies on top.
 *
 * `sameShape=1` when every attempt has the same shape key; `finalDiffers=1`
 * when the final attempt's shape matches NO earlier attempt.
 */
export function renderProviderFailureDiagnostic(
  witnesses: readonly ProviderAttemptWitness[],
): string {
  const keys = witnesses.map(attemptShapeKey);
  const last = keys[keys.length - 1];
  const allSame = keys.length > 0 && keys.every((key) => key === keys[0]);
  const finalDiffers = keys.length > 1 && keys.slice(0, -1).every((key) => key !== last);
  return (
    `[${PROVIDER_FAILURE_DIAGNOSTIC_VERSION} attempts=${witnesses.length} ` +
    `sameShape=${allSame ? 1 : 0} finalDiffers=${finalDiffers ? 1 : 0}; ` +
    `${witnesses.map(renderAttempt).join('; ')}]`
  );
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

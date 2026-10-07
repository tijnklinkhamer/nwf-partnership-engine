/**
 * THE CLASSIFIER OPERATOR MACHINE CONTRACT, V1
 * (CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_V1).
 *
 * The ONE place that defines what a machine caller - a future Operator
 * backend invoking `nwf-pe orgunits classify ... --json` as a process - gets
 * back. Every handled outcome of the four classifier operations (the
 * classification action and the `runs` / `calls` / `show` reads) is one
 * envelope:
 *
 *   {
 *     contractVersion: 'nwf-pe.classifier-operator.v1',
 *     operation:  CLASSIFY | CLASSIFY_RUNS | CLASSIFY_CALLS | CLASSIFY_SHOW | UNRESOLVED,
 *     outcome:    SUCCEEDED | REFUSED | NOT_FOUND | NOT_COMPLETED | FAILED,
 *     code:       one stable code below,
 *     exitCode:   0 | 1,
 *     data:       the operation's landed payload, or null,
 *     reason:     a bounded, code-specific object, or null
 *   }
 *
 * WHAT IS DERIVED, NOT CHOSEN. A producer picks a CODE. The outcome is that
 * code's fixed outcome, and the process exit status is that outcome's fixed
 * exit status, both from the tables below - so human and machine rendering
 * can never disagree about whether an operation succeeded.
 *
 * WHAT IT IS NOT. Not a server, not a transport, not a schema validator, and
 * not a new classifier capability. It holds no database access, no provider,
 * no environment read and no clock. It re-implements no classifier
 * semantics: the payloads in `data` are exactly the landed action report and
 * read models; this module only wraps them and names the outcome.
 *
 * DISCLOSURE. `reason` carries identifiers, enum values, counts and option
 * NAMES only - never an exception message, a stack, page text, prompt text,
 * a serialized batch, provider output, an environment value, a profile path
 * or a credential. An unexpected exception becomes `INTERNAL_ERROR` with a
 * stage and a write-possibility flag and nothing else.
 */
import {
  MalformedSignalError,
  MissingResponseShaError,
  OrganisationNotFoundError,
  OrganisationRunMismatchError,
  PayloadBoundExceededError,
  ResearchRunNotFoundError,
  RunNotCompletedError,
  UnexpectedTrackValueError,
} from './errors.js';

/** A caller MUST reject any envelope whose `contractVersion` is not exactly this. */
export const CLASSIFIER_OPERATOR_CONTRACT_VERSION = 'nwf-pe.classifier-operator.v1';

export const CLASSIFIER_OPERATOR_OPERATIONS = [
  'CLASSIFY',
  'CLASSIFY_RUNS',
  'CLASSIFY_CALLS',
  'CLASSIFY_SHOW',
  /** The invocation never resolved to one of the four (unknown read, CLI usage). */
  'UNRESOLVED',
] as const;
export type ClassifierOperatorOperation = (typeof CLASSIFIER_OPERATOR_OPERATIONS)[number];

/** Outcome -> process exit status. The only place exit semantics are decided. */
export const CLASSIFIER_OPERATOR_EXIT_CODES = Object.freeze({
  /** The operation did what was asked. */
  SUCCEEDED: 0,
  /** Refused before any provider call or classifier write. */
  REFUSED: 1,
  /** The exact organisation, research run or call does not exist. */
  NOT_FOUND: 1,
  /** Execution ran and its rows are persisted as written, but not every batch COMPLETED. */
  NOT_COMPLETED: 1,
  /** An unexpected failure; see `reason.classifierWritesMayHaveOccurred`. */
  FAILED: 1,
} as const);
export type ClassifierOperatorOutcome = keyof typeof CLASSIFIER_OPERATOR_EXIT_CODES;

/** Code -> its one fixed outcome. Codes are stable: V1 never renames or re-meanings one. */
export const CLASSIFIER_OPERATOR_CODES = Object.freeze({
  // The classification action, DRY_RUN.
  DRY_RUN_EXECUTION_PERMITTED: 'SUCCEEDED',
  DRY_RUN_NO_CANDIDATES: 'SUCCEEDED',
  DRY_RUN_EXECUTION_NOT_PERMITTED: 'REFUSED',
  // The classification action, EXECUTE.
  EXECUTE_COMPLETED: 'SUCCEEDED',
  EXECUTE_NO_CANDIDATES: 'SUCCEEDED',
  EXECUTE_NOT_COMPLETED: 'NOT_COMPLETED',
  ATTEMPT_ALREADY_EXISTS_NON_COMPLETED: 'REFUSED',
  RUNTIME_RESULT_MISMATCH: 'FAILED',
  // Action gates before execution (both modes).
  PREFLIGHT_REFUSED: 'REFUSED',
  RESEARCH_RUN_NOT_COMPLETED: 'REFUSED',
  RESEARCH_RUN_NOT_FOUND: 'NOT_FOUND',
  CLASSIFIER_ASSEMBLY_REFUSED: 'REFUSED',
  // Reads.
  READ_SUCCEEDED: 'SUCCEEDED',
  CALL_NOT_FOUND: 'NOT_FOUND',
  UNKNOWN_READ_SUBCOMMAND: 'REFUSED',
  UNEXPECTED_POSITIONAL: 'REFUSED',
  OPTION_NOT_ACCEPTED: 'REFUSED',
  // Shared.
  ORGANISATION_NOT_FOUND: 'NOT_FOUND',
  INVALID_ARGUMENT: 'REFUSED',
  CLI_USAGE_REJECTED: 'REFUSED',
  INTERNAL_ERROR: 'FAILED',
} as const satisfies Record<string, ClassifierOperatorOutcome>);
export type ClassifierOperatorCode = keyof typeof CLASSIFIER_OPERATOR_CODES;

/** The closed set of typed classifier-assembly refusals the landed assembler raises. */
export const CLASSIFIER_ASSEMBLY_REFUSAL_CODES = [
  'RUN_NOT_COMPLETED',
  'ORGANISATION_RUN_MISMATCH',
  'UNEXPECTED_TRACK_VALUE',
  'MISSING_RESPONSE_SHA',
  'PAYLOAD_BOUND_EXCEEDED',
  'MALFORMED_SIGNAL',
] as const;
export type ClassifierAssemblyRefusalCode = (typeof CLASSIFIER_ASSEMBLY_REFUSAL_CODES)[number];

/** Every argument the four operations take, by CLI spelling. */
export type ClassifierOperatorArgument =
  'organisation-id' | 'run-id' | 'model' | 'attempt' | 'call-id' | 'limit';

/** The bounded, code-specific `reason` objects. Ids, enums, counts and option names only. */
export type ClassifierOperatorReason =
  | {
      readonly kind: 'INVALID_ARGUMENT';
      readonly argument: ClassifierOperatorArgument;
      readonly problem: 'MISSING' | 'MALFORMED';
    }
  | {
      readonly kind: 'PREFLIGHT_REFUSED';
      readonly preflightKind: string;
      /** The landed preflight's bounded detail: names variables/fields, never their values. */
      readonly detail: string;
    }
  | {
      readonly kind: 'RESEARCH_RUN_NOT_COMPLETED';
      readonly runId: string;
      readonly researchRunStatus: 'FAILED' | 'ABORTED' | 'NO_COMPLETION_RECORDED';
      readonly researchRunErrorKind: string | null;
    }
  | { readonly kind: 'RESEARCH_RUN_NOT_FOUND'; readonly runId: string }
  | { readonly kind: 'ORGANISATION_NOT_FOUND'; readonly organisationId: string }
  | { readonly kind: 'CALL_NOT_FOUND'; readonly callId: string }
  | {
      readonly kind: 'CLASSIFIER_ASSEMBLY_REFUSED';
      readonly assemblyRefusalCode: ClassifierAssemblyRefusalCode;
    }
  | {
      readonly kind: 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED';
      readonly attemptNo: number;
      readonly batches: readonly {
        readonly batchIndex: number;
        readonly persistedState: string;
        readonly existingCallId: string | null;
        readonly existingErrorKind: string | null;
      }[];
    }
  | {
      readonly kind: 'DRY_RUN_EXECUTION_NOT_PERMITTED';
      readonly blockedBy: readonly ('PREFLIGHT_REFUSED' | 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED')[];
    }
  | {
      readonly kind: 'RUNTIME_RESULT_MISMATCH';
      readonly plannedBatchCount: number;
      readonly returnedBatchCount: number;
      readonly classifierWritesMayHaveOccurred: true;
    }
  | {
      readonly kind: 'UNKNOWN_READ_SUBCOMMAND';
      readonly acceptedSubcommands: readonly string[];
    }
  | { readonly kind: 'UNEXPECTED_POSITIONAL'; readonly subcommand: string }
  | {
      readonly kind: 'OPTION_NOT_ACCEPTED';
      readonly refusedOptions: readonly string[];
      readonly acceptedOptions: readonly string[];
    }
  | { readonly kind: 'CLI_USAGE_REJECTED' }
  | {
      readonly kind: 'INTERNAL_ERROR';
      readonly stage: 'BEFORE_EXECUTION' | 'DURING_EXECUTION';
      readonly classifierWritesMayHaveOccurred: boolean;
    };

export interface ClassifierOperatorEnvelope<Data = unknown> {
  readonly contractVersion: typeof CLASSIFIER_OPERATOR_CONTRACT_VERSION;
  readonly operation: ClassifierOperatorOperation;
  readonly outcome: ClassifierOperatorOutcome;
  readonly code: ClassifierOperatorCode;
  readonly exitCode: 0 | 1;
  readonly data: Data | null;
  readonly reason: ClassifierOperatorReason | null;
}

/** PURE: a code's process exit status, via its fixed outcome. */
export function classifierOperatorExitCode(code: ClassifierOperatorCode): 0 | 1 {
  return CLASSIFIER_OPERATOR_EXIT_CODES[CLASSIFIER_OPERATOR_CODES[code]];
}

/** PURE: the one envelope constructor. Outcome and exit status are derived from `code`. */
export function buildClassifierOperatorEnvelope<Data>(
  operation: ClassifierOperatorOperation,
  code: ClassifierOperatorCode,
  parts: { readonly data?: Data | null; readonly reason?: ClassifierOperatorReason | null } = {},
): ClassifierOperatorEnvelope<Data> {
  return {
    contractVersion: CLASSIFIER_OPERATOR_CONTRACT_VERSION,
    operation,
    outcome: CLASSIFIER_OPERATOR_CODES[code],
    code,
    exitCode: classifierOperatorExitCode(code),
    data: parts.data ?? null,
    reason: parts.reason ?? null,
  };
}

/** PURE: exactly one JSON document and one trailing newline - the whole of machine stdout. */
export function renderClassifierOperatorEnvelope(envelope: ClassifierOperatorEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/**
 * PURE: the contract's reading of an exception raised while planning one
 * classification (assembly + identity inspection, before any write). A typed
 * landed refusal maps onto its stable code; anything else is NOT a refusal
 * and returns null, so the caller reports `INTERNAL_ERROR` rather than
 * inventing a category. The exception's message is never read.
 */
export function classifierPlanFailure(error: unknown): {
  readonly code: ClassifierOperatorCode;
  readonly reason: ClassifierOperatorReason;
} | null {
  if (error instanceof OrganisationNotFoundError) {
    return {
      code: 'ORGANISATION_NOT_FOUND',
      reason: { kind: 'ORGANISATION_NOT_FOUND', organisationId: error.organisationId },
    };
  }
  if (error instanceof ResearchRunNotFoundError) {
    return {
      code: 'RESEARCH_RUN_NOT_FOUND',
      reason: { kind: 'RESEARCH_RUN_NOT_FOUND', runId: error.runId },
    };
  }
  if (
    error instanceof RunNotCompletedError ||
    error instanceof OrganisationRunMismatchError ||
    error instanceof UnexpectedTrackValueError ||
    error instanceof MissingResponseShaError ||
    error instanceof PayloadBoundExceededError ||
    error instanceof MalformedSignalError
  ) {
    return {
      code: 'CLASSIFIER_ASSEMBLY_REFUSED',
      reason: { kind: 'CLASSIFIER_ASSEMBLY_REFUSED', assemblyRefusalCode: error.code },
    };
  }
  return null;
}

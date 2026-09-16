/**
 * PHASE 2B-2D2C-F1 — THE STOP DECISION, as one pure function over what the
 * parent observed (the Tier-2 harness result) and what the child left
 * behind (its artifacts, re-read and re-hashed by the parent).
 *
 * The order of the checks is the design:
 *
 *   1. Tier-2 harness verdicts that R2B §12 and R3 §5 declare stop-worthy:
 *      `CHILD_EXITED_UNCONFIRMED` (grace verdict) and
 *      `SUPPRESSED_EXPIRED_TARGET_IDENTITY` (hard-kill disposition). Checked
 *      first, whatever else happened.
 *   2. The watchdog fired (`TIMED_OUT_KILLED`) without a Tier-1 TIMEOUT
 *      having been recorded by the child before it: that is Tier 1 NOT
 *      firing, and it is `TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT` — never
 *      concealed as a normal timeout.
 *   3. Child-side stop conditions the child itself determined and wrote
 *      (`ISOLATION_VIOLATION`, `CORPUS_CONFIG_OR_HASH_DRIFT`,
 *      `RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION`), read from its preflight
 *      or failure record.
 *   4. Artifact integrity: a child that ended without a hash-valid result
 *      record, or whose OK outcome lacks a hash-valid raw checkpoint or
 *      validation record, is `BATCH_ARTIFACT_MISSING_OR_CORRUPT` when
 *      something was persisted and `UNRECONCILED_PROVIDER_FAILURE` when the
 *      child recorded a thrown failure or nothing at all.
 *   5. Reconciled provider outcomes: `USAGE_LIMIT_EXHAUSTED` →
 *      `USAGE_LIMIT_INTERRUPTION`; an OK whose reported model id differs
 *      from the requested one → `UNEXPECTED_RESPONSE_MODEL_ID`; a Tier-1
 *      `TIMEOUT` with its diagnostics persisted → the freeze's decision-rule
 *      halt (`TIER1_TIMEOUT_DECISION_RULE`, NOT one of the ten stop
 *      conditions, labelled as such); every other non-OK outcome with a
 *      persisted diagnostic record is RECONCILED, recorded, and the
 *      experiment continues to the next batch (the acceptance rule will
 *      refuse a decision on incomplete coverage).
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import {
  MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
  NON_TERMINAL_PROVIDER_OUTCOMES,
  RELIABILITY_SEMANTICS_V2,
  type EvaluationOutcomeClass,
  type StopConditionId,
} from './constants.js';

/** What the parent saw from the Tier-2 harness, reduced to the fields the decision reads. */
export interface Tier2Observation {
  readonly outcome: 'COMPLETED' | 'TIMED_OUT_KILLED';
  readonly gracePhaseVerdict:
    | 'SHUTDOWN_CONFIRMED'
    | 'CHILD_EXITED_UNCONFIRMED'
    | 'ACKNOWLEDGED_NOT_EXITED'
    | 'NO_SHUTDOWN_RESPONSE'
    | null;
  readonly hardKillDisposition: 'NOT_REQUIRED' | 'EXECUTED' | 'SUPPRESSED_EXPIRED_TARGET_IDENTITY';
  readonly exitCode: number | null;
  readonly signal: string | null;
}

/** The child's artifacts as the parent re-read them (each already hash-verified or reported failed). */
export interface ChildArtifactObservation {
  readonly preflight:
    | {
        readonly present: true;
        readonly valid: true;
        readonly stopCondition: StopConditionId | null;
      }
    | { readonly present: true; readonly valid: false }
    | { readonly present: false };
  readonly failure:
    | {
        readonly present: true;
        readonly valid: boolean;
        readonly stopCondition: StopConditionId | null;
      }
    | { readonly present: false };
  readonly result:
    | {
        readonly present: true;
        readonly valid: true;
        readonly providerOutcome:
          | 'OK'
          | 'USAGE_LIMIT_EXHAUSTED'
          | 'AUTH_FAILURE'
          | 'PROVIDER_TRANSIENT'
          | 'PROVIDER_REFUSAL'
          | 'STRUCTURED_OUTPUT_FAILED'
          | 'TIMEOUT';
        readonly providerReportedModelId: string | null;
        readonly rawCheckpointPersistedBeforeValidation: boolean | null;
        readonly childStopCondition: StopConditionId | null;
      }
    | { readonly present: true; readonly valid: false }
    | { readonly present: false };
  readonly rawCheckpoint:
    { readonly present: true; readonly valid: boolean } | { readonly present: false };
  readonly validation:
    { readonly present: true; readonly valid: boolean } | { readonly present: false };
  readonly providerOutcome:
    { readonly present: true; readonly valid: boolean } | { readonly present: false };
  readonly tier1Diagnostics:
    { readonly present: true; readonly valid: boolean } | { readonly present: false };
}

/**
 * `TIER1_TIMEOUT_DECISION_RULE` is RETAINED, never removed: Recovery-1's
 * `experiment-stop.json` records carry it and must keep parsing and meaning
 * exactly what they meant. Under v2 semantics it is no longer PRODUCED for a
 * reconciled TIMEOUT; `TIER1_TIMEOUT_CEILING_REACHED` is produced instead,
 * once a replicate exceeds `MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE`.
 */
export type HaltKind =
  'STOP_CONDITION' | 'TIER1_TIMEOUT_DECISION_RULE' | 'TIER1_TIMEOUT_CEILING_REACHED';

export type StopDecision =
  | {
      readonly stop: false;
      readonly stopCondition: null;
      readonly haltKind: null;
      readonly detail: string;
      readonly evaluationOutcomeClass: EvaluationOutcomeClass;
    }
  | {
      readonly stop: true;
      readonly stopCondition: StopConditionId;
      readonly haltKind: 'STOP_CONDITION';
      readonly detail: string;
      readonly evaluationOutcomeClass: EvaluationOutcomeClass;
    }
  | {
      readonly stop: true;
      readonly stopCondition: null;
      readonly haltKind: 'TIER1_TIMEOUT_DECISION_RULE' | 'TIER1_TIMEOUT_CEILING_REACHED';
      readonly detail: string;
      readonly evaluationOutcomeClass: EvaluationOutcomeClass;
    };

export interface StopDecisionInput {
  readonly tier2: Tier2Observation;
  readonly artifacts: ChildArtifactObservation;
  readonly requestedModelId: string;
  /**
   * 2D2C-F0Z: how many NON-TERMINAL Tier-1 TIMEOUTs this replicate has
   * already recorded, BEFORE this evaluation. Absent means 0, which
   * reproduces the caller that does not track it.
   */
  readonly priorNonTerminalTimeouts?: number;
  /**
   * 2D2C-F0Z: the semantics this run executes under. Absent means the
   * historical v1 rule, so every pre-F0Z caller - and every replay of a
   * Recovery-1 observation - behaves exactly as it did.
   */
  readonly reliabilitySemanticsVersion?: string;
}

const stop = (
  stopCondition: StopConditionId,
  detail: string,
  evaluationOutcomeClass: EvaluationOutcomeClass,
): StopDecision => ({
  stop: true,
  stopCondition,
  haltKind: 'STOP_CONDITION',
  detail,
  evaluationOutcomeClass,
});

export function deriveStopDecision(input: StopDecisionInput): StopDecision {
  const { tier2, artifacts } = input;

  // 1. Unconfirmed harness terminations — stop-worthy, whatever else happened.
  if (tier2.hardKillDisposition === 'SUPPRESSED_EXPIRED_TARGET_IDENTITY') {
    return stop(
      'SUPPRESSED_EXPIRED_TARGET_IDENTITY',
      'the Tier-2 hard stage was required but suppressed because the direct child had already exited; an unconfirmed harness termination.',
      'AMBIGUOUS_CHILD_TERMINATION',
    );
  }
  if (tier2.gracePhaseVerdict === 'CHILD_EXITED_UNCONFIRMED') {
    return stop(
      'CHILD_EXITED_UNCONFIRMED',
      'the child exited during the Tier-2 grace phase without acknowledging shutdown; an unconfirmed harness termination.',
      'AMBIGUOUS_CHILD_TERMINATION',
    );
  }

  // 2. The watchdog fired. Did Tier 1 record a TIMEOUT first?
  if (tier2.outcome === 'TIMED_OUT_KILLED') {
    const tier1TimeoutRecorded =
      artifacts.result.present &&
      artifacts.result.valid &&
      artifacts.result.providerOutcome === 'TIMEOUT';
    if (!tier1TimeoutRecorded) {
      return stop(
        'TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT',
        `the Tier-2 watchdog expired (grace verdict ${tier2.gracePhaseVerdict ?? 'null'}, hard kill ${tier2.hardKillDisposition}) ` +
          'while no Tier-1 TIMEOUT had been recorded: Tier 1 did not fire. This triggers the 2D2B-2b decision.',
        'TIER2_LIVENESS_FAILURE',
      );
    }
    // Tier 1 fired and recorded, yet the child outlived the watchdog: still an unclean end.
    return stop(
      'UNRECONCILED_PROVIDER_FAILURE',
      'a Tier-1 TIMEOUT was recorded but the child did not exit before the Tier-2 watchdog; the attempt is not reconciled to a clean child end.',
      'TIER2_LIVENESS_FAILURE',
    );
  }

  // 3. Child-determined stop conditions.
  if (
    artifacts.preflight.present &&
    artifacts.preflight.valid &&
    artifacts.preflight.stopCondition !== null
  ) {
    return stop(
      artifacts.preflight.stopCondition,
      'the child preflight recorded a stop condition before any provider construction.',
      'AUTH_OR_PRE_INFERENCE_FAILURE',
    );
  }
  if (artifacts.failure.present) {
    if (artifacts.failure.valid && artifacts.failure.stopCondition !== null) {
      return stop(
        artifacts.failure.stopCondition,
        'the child recorded a stop condition in its failure record.',
        'AUTH_OR_PRE_INFERENCE_FAILURE',
      );
    }
    return stop(
      'UNRECONCILED_PROVIDER_FAILURE',
      'the child recorded a thrown failure; no provider outcome is reconciled to this attempt.',
      'AMBIGUOUS_CHILD_TERMINATION',
    );
  }

  // 4. Artifact integrity.
  if (!artifacts.result.present) {
    const anythingPersisted =
      artifacts.rawCheckpoint.present ||
      artifacts.validation.present ||
      artifacts.providerOutcome.present ||
      artifacts.tier1Diagnostics.present;
    if (anythingPersisted) {
      return stop(
        'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
        'the child persisted partial artifacts but no result record; the attempt is incomplete.',
        'AMBIGUOUS_CHILD_TERMINATION',
      );
    }
    if (artifacts.preflight.present && !artifacts.preflight.valid) {
      return stop(
        'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
        'the child preflight record is corrupt.',
        'AMBIGUOUS_CHILD_TERMINATION',
      );
    }
    return stop(
      'UNRECONCILED_PROVIDER_FAILURE',
      `the child ended (exit ${tier2.exitCode ?? 'null'}, signal ${tier2.signal ?? 'null'}) with no result and no failure record.`,
      'AMBIGUOUS_CHILD_TERMINATION',
    );
  }
  if (!artifacts.result.valid) {
    return stop(
      'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
      'the child result record fails its own recorded hash or shape.',
      'AMBIGUOUS_CHILD_TERMINATION',
    );
  }
  const result = artifacts.result;
  if (result.childStopCondition !== null) {
    return stop(
      result.childStopCondition,
      'the child result carries a stop condition.',
      'AUTH_OR_PRE_INFERENCE_FAILURE',
    );
  }
  if (!artifacts.providerOutcome.present || !artifacts.providerOutcome.valid) {
    return stop(
      'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
      'the provider outcome record is missing or corrupt.',
      'AMBIGUOUS_CHILD_TERMINATION',
    );
  }
  if (result.providerOutcome === 'OK') {
    if (
      !artifacts.rawCheckpoint.present ||
      result.rawCheckpointPersistedBeforeValidation !== true
    ) {
      return stop(
        'RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION',
        'the provider returned rawOutput but no raw-output checkpoint was durably persisted before validation.',
        'AMBIGUOUS_CHILD_TERMINATION',
      );
    }
    if (!artifacts.rawCheckpoint.valid) {
      return stop(
        'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
        'the raw-output checkpoint fails its own recorded hash.',
        'AMBIGUOUS_CHILD_TERMINATION',
      );
    }
    if (!artifacts.validation.present || !artifacts.validation.valid) {
      return stop(
        'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
        'the validation record is missing or corrupt.',
        'AMBIGUOUS_CHILD_TERMINATION',
      );
    }
    if (result.providerReportedModelId !== input.requestedModelId) {
      return stop(
        'UNEXPECTED_RESPONSE_MODEL_ID',
        `the provider reported model ${JSON.stringify(result.providerReportedModelId)}; requested ${JSON.stringify(input.requestedModelId)}.`,
        'AUTH_OR_PRE_INFERENCE_FAILURE',
      );
    }
    return {
      stop: false,
      stopCondition: null,
      haltKind: null,
      detail: 'OK outcome reconciled: raw checkpoint, validation and model id all recorded.',
      evaluationOutcomeClass: 'VALIDATED_SEMANTIC_RESULT',
    };
  }

  // 5. Non-OK, reconciled outcomes.
  if (result.providerOutcome === 'USAGE_LIMIT_EXHAUSTED') {
    return stop(
      'USAGE_LIMIT_INTERRUPTION',
      'the provider reported subscription usage-limit exhaustion; the experiment stops (a later authorised continuation is idempotent by input identity).',
      'AUTH_OR_PRE_INFERENCE_FAILURE',
    );
  }
  if (result.providerOutcome === 'TIMEOUT') {
    // A TIMEOUT without its diagnostics is not a reconciled timeout at all:
    // it is an evaluation we cannot describe. Unchanged, and FAIL CLOSED.
    if (!artifacts.tier1Diagnostics.present || !artifacts.tier1Diagnostics.valid) {
      return stop(
        'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
        'a Tier-1 TIMEOUT was recorded without a valid diagnostics record.',
        'AMBIGUOUS_CHILD_TERMINATION',
      );
    }
    // v1 (Recovery-1, and any caller that names no version): unchanged.
    if (input.reliabilitySemanticsVersion !== RELIABILITY_SEMANTICS_V2) {
      return {
        stop: true,
        stopCondition: null,
        haltKind: 'TIER1_TIMEOUT_DECISION_RULE',
        detail:
          'Tier 1 returned TIMEOUT before Tier 2 fired; the diagnostics are recorded and the experiment stops per the frozen ' +
          'decision rule. Continuation is an operator-authorised attemptNo + 1. This is not one of the ten stop conditions.',
        evaluationOutcomeClass: 'PROVIDER_TIMEOUT_NON_TERMINAL',
      };
    }
    // v2 (2D2C-F0Z C1): a CONFIRMED timeout whose evidence is complete closes
    // this evaluation durably and the next frozen one proceeds. Its own items
    // are observed-INVALID; no semantic verdict is fabricated for them, and
    // the batch is never re-run - no retry beyond the frozen contract exists.
    const priorTimeouts = input.priorNonTerminalTimeouts ?? 0;
    if (priorTimeouts >= MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE) {
      return {
        stop: true,
        stopCondition: null,
        haltKind: 'TIER1_TIMEOUT_CEILING_REACHED',
        detail:
          `this replicate has already recorded ${priorTimeouts} non-terminal Tier-1 TIMEOUTs, reaching the ` +
          `MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE bound of ${MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE}; the experiment stops rather than ` +
          'continuing to spend a frozen plan against an apparently unhealthy runtime. The bound is an explicitly uncalibrated mechanical safety limit.',
        evaluationOutcomeClass: 'PROVIDER_TIMEOUT_NON_TERMINAL',
      };
    }
    return {
      stop: false,
      stopCondition: null,
      haltKind: null,
      detail:
        'Tier 1 returned TIMEOUT before Tier 2 fired and its diagnostics are recorded; under RELIABILITY_SEMANTICS_V2 this ' +
        "evaluation closes durably, THIS batch's items are INVALID provider-timeout observations, and the next frozen logical " +
        'evaluation proceeds. No verdict is fabricated and this batch is never re-run.',
      evaluationOutcomeClass: 'PROVIDER_TIMEOUT_NON_TERMINAL',
    };
  }
  // Every remaining non-OK outcome. The continue-set is an ALLOW-LIST, and it
  // is exactly the set the forward scorer admits as an observed INVALID
  // observation. Before F0Z this branch continued on ANY unrecognised non-OK
  // outcome - AUTH_FAILURE, PROVIDER_REFUSAL and PROVIDER_TRANSIENT included -
  // none of which any scorer admits, so such a run was silently unscoreable.
  // Those are control-plane or ambiguous failures, never observations, and
  // conflating them with a semantic INVALID is exactly the defect F0Z exists
  // to remove. They now FAIL CLOSED.
  if (!(NON_TERMINAL_PROVIDER_OUTCOMES as readonly string[]).includes(result.providerOutcome)) {
    return stop(
      'UNRECONCILED_PROVIDER_FAILURE',
      `non-OK outcome ${result.providerOutcome} is not an admitted non-terminal observation ` +
        `(admitted: ${NON_TERMINAL_PROVIDER_OUTCOMES.join(', ')}); the experiment stops rather than record a ` +
        'control-plane failure as though it were a semantic observation.',
      'AUTH_OR_PRE_INFERENCE_FAILURE',
    );
  }
  return {
    stop: false,
    stopCondition: null,
    haltKind: null,
    detail: `non-OK outcome ${result.providerOutcome} reconciled to this attempt with a persisted diagnostic record; the batch is not completed and the experiment continues.`,
    evaluationOutcomeClass: 'STRUCTURED_OUTPUT_FAILED_NON_TERMINAL',
  };
}

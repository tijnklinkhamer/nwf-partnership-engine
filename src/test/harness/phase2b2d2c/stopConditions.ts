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
import type { StopConditionId } from './constants.js';

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

export type HaltKind = 'STOP_CONDITION' | 'TIER1_TIMEOUT_DECISION_RULE';

export type StopDecision =
  | {
      readonly stop: false;
      readonly stopCondition: null;
      readonly haltKind: null;
      readonly detail: string;
    }
  | {
      readonly stop: true;
      readonly stopCondition: StopConditionId;
      readonly haltKind: 'STOP_CONDITION';
      readonly detail: string;
    }
  | {
      readonly stop: true;
      readonly stopCondition: null;
      readonly haltKind: 'TIER1_TIMEOUT_DECISION_RULE';
      readonly detail: string;
    };

export interface StopDecisionInput {
  readonly tier2: Tier2Observation;
  readonly artifacts: ChildArtifactObservation;
  readonly requestedModelId: string;
}

const stop = (stopCondition: StopConditionId, detail: string): StopDecision => ({
  stop: true,
  stopCondition,
  haltKind: 'STOP_CONDITION',
  detail,
});

export function deriveStopDecision(input: StopDecisionInput): StopDecision {
  const { tier2, artifacts } = input;

  // 1. Unconfirmed harness terminations — stop-worthy, whatever else happened.
  if (tier2.hardKillDisposition === 'SUPPRESSED_EXPIRED_TARGET_IDENTITY') {
    return stop(
      'SUPPRESSED_EXPIRED_TARGET_IDENTITY',
      'the Tier-2 hard stage was required but suppressed because the direct child had already exited; an unconfirmed harness termination.',
    );
  }
  if (tier2.gracePhaseVerdict === 'CHILD_EXITED_UNCONFIRMED') {
    return stop(
      'CHILD_EXITED_UNCONFIRMED',
      'the child exited during the Tier-2 grace phase without acknowledging shutdown; an unconfirmed harness termination.',
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
      );
    }
    // Tier 1 fired and recorded, yet the child outlived the watchdog: still an unclean end.
    return stop(
      'UNRECONCILED_PROVIDER_FAILURE',
      'a Tier-1 TIMEOUT was recorded but the child did not exit before the Tier-2 watchdog; the attempt is not reconciled to a clean child end.',
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
    );
  }
  if (artifacts.failure.present) {
    if (artifacts.failure.valid && artifacts.failure.stopCondition !== null) {
      return stop(
        artifacts.failure.stopCondition,
        'the child recorded a stop condition in its failure record.',
      );
    }
    return stop(
      'UNRECONCILED_PROVIDER_FAILURE',
      'the child recorded a thrown failure; no provider outcome is reconciled to this attempt.',
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
      );
    }
    if (artifacts.preflight.present && !artifacts.preflight.valid) {
      return stop('BATCH_ARTIFACT_MISSING_OR_CORRUPT', 'the child preflight record is corrupt.');
    }
    return stop(
      'UNRECONCILED_PROVIDER_FAILURE',
      `the child ended (exit ${tier2.exitCode ?? 'null'}, signal ${tier2.signal ?? 'null'}) with no result and no failure record.`,
    );
  }
  if (!artifacts.result.valid) {
    return stop(
      'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
      'the child result record fails its own recorded hash or shape.',
    );
  }
  const result = artifacts.result;
  if (result.childStopCondition !== null) {
    return stop(result.childStopCondition, 'the child result carries a stop condition.');
  }
  if (!artifacts.providerOutcome.present || !artifacts.providerOutcome.valid) {
    return stop(
      'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
      'the provider outcome record is missing or corrupt.',
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
      );
    }
    if (!artifacts.rawCheckpoint.valid) {
      return stop(
        'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
        'the raw-output checkpoint fails its own recorded hash.',
      );
    }
    if (!artifacts.validation.present || !artifacts.validation.valid) {
      return stop(
        'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
        'the validation record is missing or corrupt.',
      );
    }
    if (result.providerReportedModelId !== input.requestedModelId) {
      return stop(
        'UNEXPECTED_RESPONSE_MODEL_ID',
        `the provider reported model ${JSON.stringify(result.providerReportedModelId)}; requested ${JSON.stringify(input.requestedModelId)}.`,
      );
    }
    return {
      stop: false,
      stopCondition: null,
      haltKind: null,
      detail: 'OK outcome reconciled: raw checkpoint, validation and model id all recorded.',
    };
  }

  // 5. Non-OK, reconciled outcomes.
  if (result.providerOutcome === 'USAGE_LIMIT_EXHAUSTED') {
    return stop(
      'USAGE_LIMIT_INTERRUPTION',
      'the provider reported subscription usage-limit exhaustion; the experiment stops (a later authorised continuation is idempotent by input identity).',
    );
  }
  if (result.providerOutcome === 'TIMEOUT') {
    if (!artifacts.tier1Diagnostics.present || !artifacts.tier1Diagnostics.valid) {
      return stop(
        'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
        'a Tier-1 TIMEOUT was recorded without a valid diagnostics record.',
      );
    }
    return {
      stop: true,
      stopCondition: null,
      haltKind: 'TIER1_TIMEOUT_DECISION_RULE',
      detail:
        'Tier 1 returned TIMEOUT before Tier 2 fired; the diagnostics are recorded and the experiment stops per the frozen ' +
        'decision rule. Continuation is an operator-authorised attemptNo + 1. This is not one of the ten stop conditions.',
    };
  }
  return {
    stop: false,
    stopCondition: null,
    haltKind: null,
    detail: `non-OK outcome ${result.providerOutcome} reconciled to this attempt with a persisted diagnostic record; the batch is not completed and the experiment continues.`,
  };
}

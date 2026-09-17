/**
 * PHASE 2B-2D2C-F4 — THE EXECUTABLE PER-SLOT V6 RUNNER PLAN.
 *
 * Turns ONE approved final-V6 slot into exactly the `RunnerPlan` shape
 * `coordinator.ts`'s `runExperiment` consumes, from the already-verified
 * study context (`v6StudyContextF4.ts`) and nothing else. No value here is
 * typed by hand, inferred from a filename, or copied from a V4/V5 plan: the
 * order, V6 prompt identity and V6 `finalInputSha256` come from the approved
 * F2 plan; the batch context and canonical assembly identity come from the
 * inherited F0O batch at the SAME position, and the two are cross-checked.
 *
 * PURE. No network, no database, no filesystem, no clock, no provider.
 */
import {
  EXPECTED_CORPUS_ITEM_COUNT,
  FROZEN_RUN_CONFIG,
  RELIABILITY_SEMANTICS_V2,
} from '../constants.js';
import type { RunnerEvaluation, RunnerPlan } from '../coordinator.js';
import { F2_FREEZE_VERSION } from '../f2/freezeF2.js';
import { F2_SLOTS, type F2SlotIdentity } from '../f2/studyPlanCoreF2.js';
import {
  F4StudyContextError,
  F4_STUDY_ID,
  F4_V6_SLOT_ATTEMPT_NO,
  f2EvaluationsOfSlot,
  type F4V6StudyContext,
} from './v6StudyContextF4.js';

/** The version of the executable per-slot plan this module derives. */
export const F4_V6_SLOT_RUNNER_PLAN_VERSION = 'phase2b-2d2c-f4-v6-slot-runner-plan-v1';

/**
 * THE F4 RUNNER-PLAN TYPE. Structurally a `RunnerPlan` — which is exactly
 * what makes `runExperiment` reusable byte-for-byte — plus the identities
 * that say which approved study and slot it belongs to. It is NOT an
 * `Attempt3ExecutionPlan` or `Attempt4ExecutionPlan`, carries no historical
 * attempt number, and schedules exactly `PROMPT_V6_CANONICAL`.
 */
export interface F4V6SlotRunnerPlan extends RunnerPlan {
  readonly planVersion: typeof F4_V6_SLOT_RUNNER_PLAN_VERSION;
  readonly studyId: typeof F4_STUDY_ID;
  readonly slot: F2SlotIdentity;
  readonly attemptNo: typeof F4_V6_SLOT_ATTEMPT_NO;
  readonly f2PlanSha256: string;
  readonly f2OwnerFreezeApprovalRawSha256: string;
  readonly inheritedPlanSha256: string;
  readonly reliabilitySemanticsVersion: typeof RELIABILITY_SEMANTICS_V2;
  readonly evaluations: readonly RunnerEvaluation[];
}

/**
 * Derives ONE slot's executable plan. Every evaluation pairs the approved F2
 * plan entry (slot, order, V6 prompt identity, V6 final input) with the SAME
 * ordinal's inherited F0O batch (context, assembly identity), and refuses if
 * the two disagree on anything they share.
 */
export function buildF4V6SlotRunnerPlan(
  context: F4V6StudyContext,
  slotId: string,
): F4V6SlotRunnerPlan {
  const slot = F2_SLOTS.find((candidate) => candidate.slotId === slotId);
  if (slot === undefined) {
    throw new F4StudyContextError('UNKNOWN_SLOT', `"${slotId}" is not a frozen final-V6 slot.`);
  }
  const planned = f2EvaluationsOfSlot(context, slotId);
  const evaluations: RunnerEvaluation[] = planned.map((evaluation, index) => {
    const inherited = context.f0oPlan.evaluations[index];
    if (
      inherited === undefined ||
      inherited.logicalBatchOrdinal !== evaluation.logicalBatchOrdinal ||
      evaluation.sequenceWithinReplicate !== index + 1 ||
      inherited.assemblyInputSha256 !== evaluation.assemblyInputSha256 ||
      inherited.organisationId !== evaluation.organisationId ||
      inherited.echeRowKey !== evaluation.echeRowKey ||
      inherited.serializedBatchUtf8Bytes !== evaluation.serializedBatchUtf8Bytes ||
      JSON.stringify(inherited.orderedGoldIds) !== JSON.stringify(evaluation.orderedGoldIds) ||
      JSON.stringify(inherited.orderedDocIndices) !== JSON.stringify(evaluation.orderedDocIndices)
    ) {
      throw new F4StudyContextError(
        'STUDY_PLAN_IDENTITY',
        `${slotId} evaluation ${index + 1} disagrees with the inherited batch at the same position.`,
      );
    }
    return {
      sequence: evaluation.sequenceWithinReplicate,
      variantName: evaluation.variantName,
      variantLabel: evaluation.variantLabel,
      variantOrder: 1,
      variantGitCommit: evaluation.variantGitCommit,
      promptVersion: evaluation.promptVersion,
      promptSha256: evaluation.promptSha256,
      logicalBatchOrdinal: evaluation.logicalBatchOrdinal,
      organisationId: evaluation.organisationId,
      echeRowKey: evaluation.echeRowKey,
      orderedGoldIds: evaluation.orderedGoldIds,
      orderedDocIndices: evaluation.orderedDocIndices,
      batchContext: inherited.batchContext,
      serializedBatchUtf8Bytes: evaluation.serializedBatchUtf8Bytes,
      assemblyInputSha256: evaluation.assemblyInputSha256,
      canonicalSerializedInputSha256: inherited.canonicalSerializedInputSha256,
      finalInputSha256: evaluation.finalInputSha256,
    };
  });
  const documents = evaluations.reduce((total, e) => total + e.orderedDocIndices.length, 0);
  if (documents !== EXPECTED_CORPUS_ITEM_COUNT) {
    throw new F4StudyContextError(
      'STUDY_PLAN_IDENTITY',
      `${slotId} covers ${documents} documents; ${EXPECTED_CORPUS_ITEM_COUNT} are frozen.`,
    );
  }
  return {
    planVersion: F4_V6_SLOT_RUNNER_PLAN_VERSION,
    studyId: F4_STUDY_ID,
    slot,
    attemptNo: F4_V6_SLOT_ATTEMPT_NO,
    freezeVersion: F2_FREEZE_VERSION,
    freezeConfigRawSha256: context.f2FreezeRawSha256,
    requestedModelId: context.requestedModelId,
    runConfig: FROZEN_RUN_CONFIG,
    outputSchemaVersion: context.outputSchemaVersion,
    plannedLogicalEvaluations: evaluations.length,
    evaluations,
    f2PlanSha256: context.f2PlanSha256,
    f2OwnerFreezeApprovalRawSha256: context.f2OwnerFreezeApprovalRawSha256,
    inheritedPlanSha256: context.f2Plan.inheritedFromPlanSha256,
    reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
  };
}

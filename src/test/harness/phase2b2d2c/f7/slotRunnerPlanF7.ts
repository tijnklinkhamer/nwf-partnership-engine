/**
 * PHASE 2B-2D2C-F7 — THE EXECUTABLE PER-SLOT F6 RESTART RUNNER PLAN.
 *
 * An F6 slot re-runs the approved F2 plan's twelve V6 logical evaluations
 * with only the slot identity replaced. So this module derives NO semantic
 * call identity of its own: it asks F4's own `buildF4V6SlotRunnerPlan` for the
 * approved F2 slot at the SAME sequence, and takes that plan's evaluations
 * verbatim. It then cross-checks every one of them, field for field, against
 * the approved F6 plan's evaluation for this F6 slot at the same position —
 * logical ordinal, document membership, organisation grouping, assembly
 * identity, V6 final identity, prompt and runtime — and refuses any
 * disagreement.
 *
 * What differs from the F4 plan is exactly the study-level identity: the F6
 * study id, the F6 slot, the F6 freeze (whose bytes the child is handed), and
 * the F6 plan and owner-approval identities.
 *
 * PURE. No network, no database, no filesystem, no clock, no provider.
 */
import { EXPECTED_CORPUS_ITEM_COUNT, RELIABILITY_SEMANTICS_V2 } from '../constants.js';
import type { RunnerEvaluation, RunnerPlan } from '../coordinator.js';
import { F2_SLOTS, type F2SlotIdentity } from '../f2/studyPlanCoreF2.js';
import { buildF4V6SlotRunnerPlan } from '../f4/v6SlotRunnerPlanF4.js';
import { F4_V6_SLOT_ATTEMPT_NO } from '../f4/v6StudyContextF4.js';
import { F6_STUDY_ID, resolveF6Slot } from '../f6/studyPlanCoreF6.js';
import {
  f7EvaluationsOfSlot,
  F7StudyContextError,
  type F7RestartStudyContext,
} from './restartStudyContextF7.js';

export const F7_RESTART_SLOT_RUNNER_PLAN_VERSION = 'phase2b-2d2c-f7-v6-restart-slot-runner-plan-v1';

/**
 * Structurally a `RunnerPlan` — which is what makes `runExperiment` reusable
 * byte for byte — plus the identities naming the F6 study and slot.
 */
export interface F7RestartSlotRunnerPlan extends RunnerPlan {
  readonly planVersion: typeof F7_RESTART_SLOT_RUNNER_PLAN_VERSION;
  readonly studyId: typeof F6_STUDY_ID;
  readonly slot: F2SlotIdentity;
  /** The approved F2 slot at the same sequence whose evaluations this slot re-runs. */
  readonly sourceF2SlotId: string;
  readonly attemptNo: typeof F4_V6_SLOT_ATTEMPT_NO;
  readonly f6PlanSha256: string;
  readonly f6OwnerFreezeApprovalRawSha256: string;
  readonly f2PlanSha256: string;
  readonly reliabilitySemanticsVersion: typeof RELIABILITY_SEMANTICS_V2;
  readonly evaluations: readonly RunnerEvaluation[];
}

export function buildF7RestartSlotRunnerPlan(
  context: F7RestartStudyContext,
  slotId: string,
): F7RestartSlotRunnerPlan {
  const slot = resolveF6Slot(slotId);
  const sourceSlot = F2_SLOTS[slot.sequence - 1];
  if (sourceSlot === undefined || sourceSlot.replicateNumber !== slot.replicateNumber) {
    throw new F7StudyContextError(
      'UNKNOWN_SLOT',
      `${slotId} has no approved F2 slot at sequence ${slot.sequence}.`,
    );
  }
  const source = buildF4V6SlotRunnerPlan(context.f4, sourceSlot.slotId);
  const planned = f7EvaluationsOfSlot(context, slotId);
  if (planned.length !== source.evaluations.length) {
    throw new F7StudyContextError(
      'STUDY_PLAN_IDENTITY',
      `${slotId} schedules ${planned.length} evaluations; the approved F2 slot ${sourceSlot.slotId} schedules ${source.evaluations.length}.`,
    );
  }
  source.evaluations.forEach((evaluation, index) => {
    const f6 = planned[index]!;
    if (
      f6.slotId !== slot.slotId ||
      f6.replicateNumber !== slot.replicateNumber ||
      f6.sequenceWithinReplicate !== evaluation.sequence ||
      f6.logicalBatchOrdinal !== evaluation.logicalBatchOrdinal ||
      f6.variantName !== evaluation.variantName ||
      f6.variantLabel !== evaluation.variantLabel ||
      f6.variantGitCommit !== evaluation.variantGitCommit ||
      f6.promptVersion !== evaluation.promptVersion ||
      f6.promptSha256 !== evaluation.promptSha256 ||
      f6.organisationId !== evaluation.organisationId ||
      f6.echeRowKey !== evaluation.echeRowKey ||
      f6.serializedBatchUtf8Bytes !== evaluation.serializedBatchUtf8Bytes ||
      f6.assemblyInputSha256 !== evaluation.assemblyInputSha256 ||
      f6.finalInputSha256 !== evaluation.finalInputSha256 ||
      JSON.stringify(f6.orderedGoldIds) !== JSON.stringify(evaluation.orderedGoldIds) ||
      JSON.stringify(f6.orderedDocIndices) !== JSON.stringify(evaluation.orderedDocIndices)
    ) {
      throw new F7StudyContextError(
        'STUDY_PLAN_IDENTITY',
        `${slotId} evaluation ${index + 1} disagrees with the approved F2 slot ${sourceSlot.slotId} at the same position.`,
      );
    }
  });
  const documents = source.evaluations.reduce((total, e) => total + e.orderedDocIndices.length, 0);
  if (documents !== EXPECTED_CORPUS_ITEM_COUNT) {
    throw new F7StudyContextError(
      'STUDY_PLAN_IDENTITY',
      `${slotId} covers ${documents} documents; ${EXPECTED_CORPUS_ITEM_COUNT} are frozen.`,
    );
  }
  return {
    planVersion: F7_RESTART_SLOT_RUNNER_PLAN_VERSION,
    studyId: F6_STUDY_ID,
    slot,
    sourceF2SlotId: sourceSlot.slotId,
    attemptNo: F4_V6_SLOT_ATTEMPT_NO,
    freezeVersion: context.f6Freeze.version,
    freezeConfigRawSha256: context.f6FreezeRawSha256,
    requestedModelId: source.requestedModelId,
    runConfig: source.runConfig,
    outputSchemaVersion: source.outputSchemaVersion,
    plannedLogicalEvaluations: source.plannedLogicalEvaluations,
    evaluations: source.evaluations,
    f6PlanSha256: context.f6PlanSha256,
    f6OwnerFreezeApprovalRawSha256: context.f6OwnerFreezeApprovalRawSha256,
    f2PlanSha256: context.f4.f2PlanSha256,
    reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
  };
}

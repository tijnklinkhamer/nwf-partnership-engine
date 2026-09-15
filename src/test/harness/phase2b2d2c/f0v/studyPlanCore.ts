/**
 * PHASE 2B-2D2C-F0V — the SHARED CORE for deriving a REPLICATION STUDY plan
 * (10 slots: 5 fresh V4 replications + 5 fresh V5 replications, frozen
 * pair order) from the two ALREADY-FROZEN, ALREADY-APPROVED per-attempt
 * plans (F0I's attempt-3/PROMPT_V4_CANONICAL plan and F0O's
 * attempt-4/PROMPT_V5_CANONICAL plan).
 *
 * This module invents NO new corpus, batch, document or identity. Every one
 * of the 120 planned logical evaluations (10 slots x 12 frozen batches) is
 * copied, field for field, from the corresponding already-verified
 * `Attempt3PlannedEvaluation` (V4) or `Attempt4PlannedEvaluation` (V5) — the
 * replication study reuses the identical frozen batch composition and
 * document order every time (F0U S3 item 8: `assemblyInputSha256`,
 * `goldIds`, `docIndices`, `corpusLineNumbers` are pinned identically
 * between F0I and F0O), because what varies between a replication and the
 * historical run is the model's own sampling behaviour, never the input.
 *
 * PURE. No network, no database, no clock, no filesystem, no Git, no
 * provider call, no SDK, no inference. No execution lock, no CLI, no
 * output-root creation, no authorisation-candidate creation exist here or
 * anywhere in this module's transitive graph.
 */
import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../constants.js';

export function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The two, and only two, prompt variants this study ever schedules. Never V1/V2/V3/V6. */
export type StudyVariantName = 'PROMPT_V4_CANONICAL' | 'PROMPT_V5_CANONICAL';

/**
 * A minimal structural shape covering both `Attempt3PlannedEvaluation` (V4)
 * and `Attempt4PlannedEvaluation` (V5) — this module reads only these
 * fields from either; it does not need to import (and does not import) the
 * production-execution surface of either attempt's freeze core.
 */
export interface SourcePlannedEvaluation {
  readonly logicalBatchOrdinal: number;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly orderedGoldIds: readonly string[];
  readonly orderedDocIndices: readonly number[];
  readonly assemblyInputSha256: string;
  readonly finalInputSha256: string;
  readonly callCeiling: {
    readonly originalRequests: 1;
    readonly maxEligibleRejectedDocuments: number;
    readonly maxRepairRequests: number;
    readonly maxProviderRequests: number;
    readonly maxAdapterAttempts: number;
  };
}

export interface SourceExecutionPlan {
  readonly evaluations: readonly SourcePlannedEvaluation[];
  readonly callCeilingTotals: {
    readonly logicalEvaluations: number;
    readonly originalRequests: number;
    readonly documents: number;
    readonly maxRepairRequests: number;
    readonly maxProviderRequests: number;
    readonly maxAdapterAttempts: number;
  };
}

/**
 * The ten frozen study slots, in the frozen execution order (F0U S6,
 * restated exactly by the owner's F0V instruction S5): alternating pair
 * start, V4 leading pairs 1/3/5, V5 leading pairs 2/4. No randomisation;
 * this array is never reordered after any result exists.
 */
export interface StudySlotIdentity {
  readonly sequence: number;
  readonly slotId: string;
  readonly pairNumber: number;
  readonly variantName: StudyVariantName;
  /** Directory name ONLY, relative to the future study root — never created by this module. */
  readonly futureOutputRootName: string;
}

export const F0V_N_PER_PROMPT = 5;
export const F0V_TOTAL_SLOTS = 10;

export const F0V_SLOTS: readonly StudySlotIdentity[] = Object.freeze([
  {
    sequence: 1,
    slotId: 'PAIR_1_V4',
    pairNumber: 1,
    variantName: 'PROMPT_V4_CANONICAL',
    futureOutputRootName: 'pair-1-v4',
  },
  {
    sequence: 2,
    slotId: 'PAIR_1_V5',
    pairNumber: 1,
    variantName: 'PROMPT_V5_CANONICAL',
    futureOutputRootName: 'pair-1-v5',
  },
  {
    sequence: 3,
    slotId: 'PAIR_2_V5',
    pairNumber: 2,
    variantName: 'PROMPT_V5_CANONICAL',
    futureOutputRootName: 'pair-2-v5',
  },
  {
    sequence: 4,
    slotId: 'PAIR_2_V4',
    pairNumber: 2,
    variantName: 'PROMPT_V4_CANONICAL',
    futureOutputRootName: 'pair-2-v4',
  },
  {
    sequence: 5,
    slotId: 'PAIR_3_V4',
    pairNumber: 3,
    variantName: 'PROMPT_V4_CANONICAL',
    futureOutputRootName: 'pair-3-v4',
  },
  {
    sequence: 6,
    slotId: 'PAIR_3_V5',
    pairNumber: 3,
    variantName: 'PROMPT_V5_CANONICAL',
    futureOutputRootName: 'pair-3-v5',
  },
  {
    sequence: 7,
    slotId: 'PAIR_4_V5',
    pairNumber: 4,
    variantName: 'PROMPT_V5_CANONICAL',
    futureOutputRootName: 'pair-4-v5',
  },
  {
    sequence: 8,
    slotId: 'PAIR_4_V4',
    pairNumber: 4,
    variantName: 'PROMPT_V4_CANONICAL',
    futureOutputRootName: 'pair-4-v4',
  },
  {
    sequence: 9,
    slotId: 'PAIR_5_V4',
    pairNumber: 5,
    variantName: 'PROMPT_V4_CANONICAL',
    futureOutputRootName: 'pair-5-v4',
  },
  {
    sequence: 10,
    slotId: 'PAIR_5_V5',
    pairNumber: 5,
    variantName: 'PROMPT_V5_CANONICAL',
    futureOutputRootName: 'pair-5-v5',
  },
]) satisfies readonly StudySlotIdentity[];

export class StudyPlanError extends Error {
  override readonly name = 'StudyPlanError';
  constructor(
    readonly reason: 'SOURCE_PLAN_SHAPE_MISMATCH' | 'CEILING_DISAGREEMENT',
    message: string,
  ) {
    super(message);
  }
}

export interface StudyPlannedEvaluation {
  readonly studySequence: number;
  readonly slotId: string;
  readonly pairNumber: number;
  readonly slotSequence: number;
  readonly futureOutputRootName: string;
  readonly variantName: StudyVariantName;
  readonly logicalBatchOrdinal: number;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly orderedGoldIds: readonly string[];
  readonly orderedDocIndices: readonly number[];
  readonly assemblyInputSha256: string;
  readonly finalInputSha256: string;
  readonly callCeiling: SourcePlannedEvaluation['callCeiling'];
}

export interface ReplicationStudyPlan {
  readonly studyId: 'REPLICATION_V4_V5_N5';
  readonly nPerPrompt: 5;
  readonly totalSlots: 10;
  readonly slots: readonly StudySlotIdentity[];
  readonly plannedLogicalEvaluations: number;
  readonly evaluations: readonly StudyPlannedEvaluation[];
}

function assertSourcePlanShape(
  label: 'V4' | 'V5',
  plan: SourceExecutionPlan,
): asserts plan is SourceExecutionPlan {
  if (plan.evaluations.length !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT) {
    throw new StudyPlanError(
      'SOURCE_PLAN_SHAPE_MISMATCH',
      `${label} source plan holds ${plan.evaluations.length} evaluations; ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT} are frozen.`,
    );
  }
  for (const [index, evaluation] of plan.evaluations.entries()) {
    if (evaluation.logicalBatchOrdinal !== index + 1) {
      throw new StudyPlanError(
        'SOURCE_PLAN_SHAPE_MISMATCH',
        `${label} source plan evaluation at index ${index} carries ordinal ${evaluation.logicalBatchOrdinal}, expected ${index + 1}.`,
      );
    }
  }
}

/**
 * Builds the 120-evaluation replication-study plan: for each of the 10
 * frozen slots (in frozen order), the 12 frozen batches of that slot's
 * variant, copied verbatim from the already-verified F0I (V4) / F0O (V5)
 * execution plans. Invents nothing; reads only `evaluations` from each
 * source plan.
 */
export function buildReplicationStudyPlan(
  f0iPlan: SourceExecutionPlan,
  f0oPlan: SourceExecutionPlan,
): ReplicationStudyPlan {
  assertSourcePlanShape('V4', f0iPlan);
  assertSourcePlanShape('V5', f0oPlan);
  const evaluations: StudyPlannedEvaluation[] = [];
  let studySequence = 0;
  for (const slot of F0V_SLOTS) {
    const sourcePlan = slot.variantName === 'PROMPT_V4_CANONICAL' ? f0iPlan : f0oPlan;
    for (const batch of sourcePlan.evaluations) {
      studySequence += 1;
      evaluations.push({
        studySequence,
        slotId: slot.slotId,
        pairNumber: slot.pairNumber,
        slotSequence: slot.sequence,
        futureOutputRootName: slot.futureOutputRootName,
        variantName: slot.variantName,
        logicalBatchOrdinal: batch.logicalBatchOrdinal,
        organisationId: batch.organisationId,
        echeRowKey: batch.echeRowKey,
        orderedGoldIds: batch.orderedGoldIds,
        orderedDocIndices: batch.orderedDocIndices,
        assemblyInputSha256: batch.assemblyInputSha256,
        finalInputSha256: batch.finalInputSha256,
        callCeiling: batch.callCeiling,
      });
    }
  }
  return {
    studyId: 'REPLICATION_V4_V5_N5',
    nPerPrompt: F0V_N_PER_PROMPT,
    totalSlots: F0V_TOTAL_SLOTS,
    slots: F0V_SLOTS,
    plannedLogicalEvaluations: evaluations.length,
    evaluations,
  };
}

/** Stable identity of a replication-study plan: SHA-256 of its canonical serialization. */
export function studyPlanSha256(plan: ReplicationStudyPlan): string {
  return sha256Hex(canonicalStringify(plan));
}

/**
 * True iff: exactly 10 slots in the frozen order/pairing/variant shape,
 * each carrying exactly its variant's 12 batches in ordinal order, and the
 * variant sequence matches F0V_SLOTS exactly (V4/V5/V5/V4/V4/V5/V5/V4/V4/V5)
 * — i.e. no reordering, no substitution, no V1/V2/V3/V6 anywhere.
 */
export function studyPlanOrderIsFrozen(plan: ReplicationStudyPlan): boolean {
  if (plan.slots.length !== F0V_TOTAL_SLOTS) return false;
  for (const [index, slot] of plan.slots.entries()) {
    const expected = F0V_SLOTS[index];
    if (
      expected === undefined ||
      slot.sequence !== expected.sequence ||
      slot.slotId !== expected.slotId ||
      slot.pairNumber !== expected.pairNumber ||
      slot.variantName !== expected.variantName ||
      slot.futureOutputRootName !== expected.futureOutputRootName
    ) {
      return false;
    }
  }
  if (plan.evaluations.length !== F0V_TOTAL_SLOTS * EXPECTED_LOGICAL_BATCHES_PER_VARIANT)
    return false;
  let studySequence = 0;
  for (const slot of F0V_SLOTS) {
    for (let ordinal = 1; ordinal <= EXPECTED_LOGICAL_BATCHES_PER_VARIANT; ordinal += 1) {
      studySequence += 1;
      const evaluation = plan.evaluations[studySequence - 1];
      if (
        evaluation === undefined ||
        evaluation.studySequence !== studySequence ||
        evaluation.slotId !== slot.slotId ||
        evaluation.slotSequence !== slot.sequence ||
        evaluation.pairNumber !== slot.pairNumber ||
        evaluation.variantName !== slot.variantName ||
        evaluation.logicalBatchOrdinal !== ordinal
      ) {
        return false;
      }
    }
  }
  return true;
}

/** True iff all 10 future output-root names are distinct — no slot may share an empirical namespace with another. */
export function futureOutputRootsAreDistinct(slots: readonly StudySlotIdentity[]): boolean {
  return new Set(slots.map((slot) => slot.futureOutputRootName)).size === slots.length;
}

export interface CallCeilingTotalsLike {
  readonly maxProviderRequests: number;
  readonly maxAdapterAttempts: number;
}

export interface StudyCeilingTotals {
  readonly perRunMaxProviderRequests: number;
  readonly perRunMaxAdapterAttempts: number;
  readonly totalSlots: number;
  readonly fullStudyMaxProviderRequests: number;
  readonly fullStudyMaxAdapterAttempts: number;
}

/**
 * The full-study ceiling, derived by SUMMING each of the 10 slots' own
 * per-run ceiling — never by multiplying a single per-run figure by 10 as a
 * bare literal. Requires the V4 (F0I) and V5 (F0O) per-run ceilings to
 * agree (they do: both variants schedule the identical 49-document,
 * 12-batch structure, F0V audit S4) and refuses to derive a figure if they
 * ever diverge.
 */
export function deriveStudyCeilings(
  f0iCeilingTotals: CallCeilingTotalsLike,
  f0oCeilingTotals: CallCeilingTotalsLike,
  slots: readonly StudySlotIdentity[] = F0V_SLOTS,
): StudyCeilingTotals {
  if (
    f0iCeilingTotals.maxProviderRequests !== f0oCeilingTotals.maxProviderRequests ||
    f0iCeilingTotals.maxAdapterAttempts !== f0oCeilingTotals.maxAdapterAttempts
  ) {
    throw new StudyPlanError(
      'CEILING_DISAGREEMENT',
      `V4 per-run ceiling (${f0iCeilingTotals.maxProviderRequests}/${f0iCeilingTotals.maxAdapterAttempts}) disagrees with V5's (${f0oCeilingTotals.maxProviderRequests}/${f0oCeilingTotals.maxAdapterAttempts}); a full-study ceiling cannot be derived from disagreeing per-run figures.`,
    );
  }
  let fullStudyMaxProviderRequests = 0;
  let fullStudyMaxAdapterAttempts = 0;
  for (const slot of slots) {
    const totals = slot.variantName === 'PROMPT_V4_CANONICAL' ? f0iCeilingTotals : f0oCeilingTotals;
    fullStudyMaxProviderRequests += totals.maxProviderRequests;
    fullStudyMaxAdapterAttempts += totals.maxAdapterAttempts;
  }
  return {
    perRunMaxProviderRequests: f0iCeilingTotals.maxProviderRequests,
    perRunMaxAdapterAttempts: f0iCeilingTotals.maxAdapterAttempts,
    totalSlots: slots.length,
    fullStudyMaxProviderRequests,
    fullStudyMaxAdapterAttempts,
  };
}

/** `<studyRoot>/<slot.futureOutputRootName>` — never created by this module; naming only. */
export function futureOutputRootPathOf(studyRoot: string, slot: StudySlotIdentity): string {
  return `${studyRoot}/${slot.futureOutputRootName}`;
}

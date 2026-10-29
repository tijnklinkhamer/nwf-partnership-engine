/**
 * PHASE 2B-2D2C-F2 — THE FINAL V6 N=5 DEV STUDY PLAN.
 *
 * Five fresh V6 replicates over the canonical 49-item DEVELOPMENT corpus,
 * each running the SAME frozen batch partition and order as the historical
 * attempt-4 (V5) plan: twelve logical evaluations, organisation-grouped,
 * sequential, concurrency 1.
 *
 * WHY THE BATCH PARTITION IS INHERITED RATHER THAN RE-DERIVED
 *
 *   The historical execution context is multi-document batching, and F0U's
 *   clarification is explicit that the effect of sibling documents inside a
 *   batch is part of what is being measured. Re-partitioning would change the
 *   estimand, so the partition, the order and every `assemblyInputSha256` are
 *   copied from the attempt-4 plan VERBATIM and checked, never recomputed.
 *
 * WHAT IS GENUINELY NEW, AND ONLY THIS
 *
 *   `finalInputSha256`. That identity folds in the prompt version, so a V6
 *   batch is a different call identity from the byte-identical V5 batch even
 *   though its assembled input is the same. It is COMPUTED here by the
 *   production `computeFinalInputSha256`, from the inherited
 *   `assemblyInputSha256` plus the V6 prompt version and the production
 *   output-schema version — never copied from a V5 plan, and never invented.
 *
 * THIS IS NOT A PAIRED COMPARISON. The V4/V5 question is closed. The question
 * here is absolute: does V6 reproducibly satisfy the frozen DEV gates?
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 * Creates no directory and authorises nothing.
 */
import { createHash } from 'node:crypto';
import { computeFinalInputSha256 } from '../../../../orgunits/classify/finalIdentity.js';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { EXPECTED_CORPUS_ITEM_COUNT, EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../constants.js';
import type {
  Attempt4ExecutionPlan,
  Attempt4PlannedEvaluation,
  CallCeiling,
} from '../f0o/attempt4FreezeCore.js';

export function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class F2StudyPlanError extends Error {
  override readonly name = 'F2StudyPlanError';
  declare readonly reason: F2StudyPlanErrorReason;
  constructor(reason: F2StudyPlanErrorReason, message: string) {
    super(message);
    Object.defineProperty(this, 'reason', { value: reason, enumerable: true });
  }
}

export type F2StudyPlanErrorReason =
  'SOURCE_PLAN_SHAPE' | 'SLOT_IDENTITY' | 'CEILING_DISAGREEMENT' | 'PROMPT_IDENTITY';

/** The ONE variant this study schedules. There is no comparator arm. */
export const F2_VARIANT_NAME = 'PROMPT_V6_CANONICAL' as const;
export const F2_VARIANT_LABEL = 'PROMPT_V6_CANDIDATE' as const;

/** N, frozen BEFORE any inference. Never adaptive, never 4, never 6. */
export const F2_N_REPLICATES = 5;

export interface F2SlotIdentity {
  readonly sequence: number;
  readonly slotId: string;
  readonly replicateNumber: number;
  readonly variantName: typeof F2_VARIANT_NAME;
  readonly futureOutputRootName: string;
}

/**
 * The five frozen slots, in their frozen order. There is no interleaving to
 * decide here — a single-arm study has no pairing — so the order is simply
 * 1..5 and is never randomised, reordered or replaced once any result exists.
 */
export const F2_SLOTS: readonly F2SlotIdentity[] = Object.freeze(
  Array.from({ length: F2_N_REPLICATES }, (_, index) => {
    const replicateNumber = index + 1;
    return Object.freeze({
      sequence: replicateNumber,
      slotId: `V6_REP_${replicateNumber}`,
      replicateNumber,
      variantName: F2_VARIANT_NAME,
      futureOutputRootName: `v6-rep-${replicateNumber}`,
    });
  }),
);

/** The V6 prompt identity a plan is built against. Supplied by the caller, verified here. */
export interface F2PromptIdentity {
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly runtimeCommit: string;
  readonly outputSchemaVersion: string;
}

export interface F2PlannedEvaluation {
  readonly slotId: string;
  readonly replicateNumber: number;
  /** 1..12 within the replicate. */
  readonly sequenceWithinReplicate: number;
  /** 1..60 across the whole study, in execution order. */
  readonly studySequence: number;
  readonly variantName: typeof F2_VARIANT_NAME;
  readonly variantLabel: typeof F2_VARIANT_LABEL;
  readonly variantGitCommit: string;
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly logicalBatchOrdinal: number;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly orderedGoldIds: readonly string[];
  readonly orderedDocIndices: readonly number[];
  readonly serializedBatchUtf8Bytes: number;
  /** INHERITED from the attempt-4 plan, verbatim. */
  readonly assemblyInputSha256: string;
  /** COMPUTED for V6 from the inherited assembly hash. */
  readonly finalInputSha256: string;
  readonly callCeiling: CallCeiling;
}

export interface F2StudyCeilings {
  readonly perRunLogicalEvaluations: number;
  readonly perRunOriginalRequests: number;
  readonly perRunDocuments: number;
  readonly perRunMaxRepairRequests: number;
  readonly perRunMaxProviderRequests: number;
  readonly perRunMaxAdapterAttempts: number;
  readonly totalSlots: number;
  readonly fullStudyLogicalEvaluations: number;
  readonly fullStudyMaxProviderRequests: number;
  readonly fullStudyMaxAdapterAttempts: number;
}

export interface F2StudyPlan {
  readonly variantName: typeof F2_VARIANT_NAME;
  readonly promptIdentity: F2PromptIdentity;
  readonly slots: readonly F2SlotIdentity[];
  readonly evaluations: readonly F2PlannedEvaluation[];
  readonly ceilings: F2StudyCeilings;
  /** The attempt-4 plan the batch partition and assembly identities were inherited from. */
  readonly inheritedFromPlanSha256: string;
}

/**
 * Derives the whole study's request ceilings by SUMMING each slot's own
 * per-run totals — never by multiplying a per-run figure by five.
 *
 * The per-run figures themselves come from the source plan's own
 * `deriveCallCeiling` results, one per logical batch, so the arithmetic is
 * the architecture's and not this file's: one original request per logical
 * evaluation, at most one ADR-0011 repair request per document, and each
 * provider request attemptable `1 + maxTransientRetries` times.
 */
export function deriveF2StudyCeilings(
  perLogicalEvaluation: readonly CallCeiling[],
  slots: readonly F2SlotIdentity[] = F2_SLOTS,
): F2StudyCeilings {
  if (perLogicalEvaluation.length !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT) {
    throw new F2StudyPlanError(
      'SOURCE_PLAN_SHAPE',
      `a run holds ${perLogicalEvaluation.length} logical evaluations; ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT} are frozen.`,
    );
  }
  if (slots.length !== F2_N_REPLICATES) {
    throw new F2StudyPlanError(
      'SLOT_IDENTITY',
      `the study holds ${slots.length} slots; ${F2_N_REPLICATES} are frozen.`,
    );
  }

  let perRunOriginalRequests = 0;
  let perRunDocuments = 0;
  let perRunMaxRepairRequests = 0;
  let perRunMaxProviderRequests = 0;
  let perRunMaxAdapterAttempts = 0;
  for (const ceiling of perLogicalEvaluation) {
    perRunOriginalRequests += ceiling.originalRequests;
    perRunDocuments += ceiling.maxEligibleRejectedDocuments;
    perRunMaxRepairRequests += ceiling.maxRepairRequests;
    perRunMaxProviderRequests += ceiling.maxProviderRequests;
    perRunMaxAdapterAttempts += ceiling.maxAdapterAttempts;
  }

  if (perRunDocuments !== EXPECTED_CORPUS_ITEM_COUNT) {
    throw new F2StudyPlanError(
      'SOURCE_PLAN_SHAPE',
      `a run covers ${perRunDocuments} documents; ${EXPECTED_CORPUS_ITEM_COUNT} are frozen.`,
    );
  }

  // Summed over the slots, never multiplied. With one variant every slot's
  // per-run total is identical, but the sum is what is recorded, so a future
  // study with differing slots stays correct without editing this function.
  let fullStudyLogicalEvaluations = 0;
  let fullStudyMaxProviderRequests = 0;
  let fullStudyMaxAdapterAttempts = 0;
  for (const _slot of slots) {
    fullStudyLogicalEvaluations += EXPECTED_LOGICAL_BATCHES_PER_VARIANT;
    fullStudyMaxProviderRequests += perRunMaxProviderRequests;
    fullStudyMaxAdapterAttempts += perRunMaxAdapterAttempts;
  }

  return {
    perRunLogicalEvaluations: EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
    perRunOriginalRequests,
    perRunDocuments,
    perRunMaxRepairRequests,
    perRunMaxProviderRequests,
    perRunMaxAdapterAttempts,
    totalSlots: slots.length,
    fullStudyLogicalEvaluations,
    fullStudyMaxProviderRequests,
    fullStudyMaxAdapterAttempts,
  };
}

/**
 * Builds the five-replicate V6 study plan from the frozen attempt-4 plan's
 * batch partition and the V6 prompt identity.
 *
 * Refuses, rather than repairs: a source plan that is not exactly twelve
 * evaluations; a prompt identity that is not V6; and any batch whose
 * inherited `assemblyInputSha256` is not a 64-hex value.
 */
export function buildF2StudyPlan(
  source: Attempt4ExecutionPlan,
  sourcePlanSha256: string,
  prompt: F2PromptIdentity,
  slots: readonly F2SlotIdentity[] = F2_SLOTS,
): F2StudyPlan {
  if (prompt.promptVersion !== 'orgunit-classifier-prompt-v6') {
    throw new F2StudyPlanError(
      'PROMPT_IDENTITY',
      `this study schedules only V6; received ${prompt.promptVersion}.`,
    );
  }
  if (!/^[0-9a-f]{64}$/.test(prompt.promptSha256)) {
    throw new F2StudyPlanError('PROMPT_IDENTITY', 'the V6 prompt SHA-256 is not a 64-hex value.');
  }
  const sourceEvaluations: readonly Attempt4PlannedEvaluation[] = source.evaluations;
  if (sourceEvaluations.length !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT) {
    throw new F2StudyPlanError(
      'SOURCE_PLAN_SHAPE',
      `the source plan holds ${sourceEvaluations.length} evaluations; ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT} are frozen.`,
    );
  }
  if (slots.length !== F2_N_REPLICATES) {
    throw new F2StudyPlanError(
      'SLOT_IDENTITY',
      `the study holds ${slots.length} slots; ${F2_N_REPLICATES} are frozen.`,
    );
  }
  const slotIds = new Set(slots.map((slot) => slot.slotId));
  const roots = new Set(slots.map((slot) => slot.futureOutputRootName));
  if (slotIds.size !== slots.length || roots.size !== slots.length) {
    throw new F2StudyPlanError('SLOT_IDENTITY', 'slot ids and output roots must be distinct.');
  }

  const evaluations: F2PlannedEvaluation[] = [];
  for (const slot of slots) {
    sourceEvaluations.forEach((batch, index) => {
      if (!/^[0-9a-f]{64}$/.test(batch.assemblyInputSha256)) {
        throw new F2StudyPlanError(
          'SOURCE_PLAN_SHAPE',
          `batch ${batch.logicalBatchOrdinal}: assemblyInputSha256 is not a 64-hex value.`,
        );
      }
      evaluations.push({
        slotId: slot.slotId,
        replicateNumber: slot.replicateNumber,
        sequenceWithinReplicate: index + 1,
        studySequence: (slot.sequence - 1) * EXPECTED_LOGICAL_BATCHES_PER_VARIANT + index + 1,
        variantName: F2_VARIANT_NAME,
        variantLabel: F2_VARIANT_LABEL,
        variantGitCommit: prompt.runtimeCommit,
        promptVersion: prompt.promptVersion,
        promptSha256: prompt.promptSha256,
        logicalBatchOrdinal: batch.logicalBatchOrdinal,
        organisationId: batch.organisationId,
        echeRowKey: batch.echeRowKey,
        orderedGoldIds: batch.orderedGoldIds,
        orderedDocIndices: batch.orderedDocIndices,
        serializedBatchUtf8Bytes: batch.serializedBatchUtf8Bytes,
        // INHERITED verbatim - the assembled input is byte-identical to the
        // attempt-4 one, which is what keeps the batch partition comparable.
        assemblyInputSha256: batch.assemblyInputSha256,
        // COMPUTED - the call identity folds in the prompt version, so a V6
        // call is a different identity from the V5 call over the same bytes.
        finalInputSha256: computeFinalInputSha256({
          assemblyInputSha256: batch.assemblyInputSha256,
          promptVersion: prompt.promptVersion,
          outputSchemaVersion: prompt.outputSchemaVersion,
        }),
        callCeiling: batch.callCeiling,
      });
    });
  }

  const ceilings = deriveF2StudyCeilings(
    sourceEvaluations.map((batch) => batch.callCeiling),
    slots,
  );
  if (evaluations.length !== ceilings.fullStudyLogicalEvaluations) {
    throw new F2StudyPlanError(
      'SOURCE_PLAN_SHAPE',
      `the plan holds ${evaluations.length} evaluations; the ceiling derives ${ceilings.fullStudyLogicalEvaluations}.`,
    );
  }

  return {
    variantName: F2_VARIANT_NAME,
    promptIdentity: prompt,
    slots,
    evaluations,
    ceilings,
    inheritedFromPlanSha256: sourcePlanSha256,
  };
}

/** The plan's own deterministic identity, over its canonical serialization. */
export function f2StudyPlanSha256(plan: F2StudyPlan): string {
  return sha256Hex(
    canonicalStringify({
      variantName: plan.variantName,
      promptIdentity: plan.promptIdentity,
      slots: plan.slots,
      evaluations: plan.evaluations,
      ceilings: plan.ceilings,
      inheritedFromPlanSha256: plan.inheritedFromPlanSha256,
    }),
  );
}

/** True when the plan runs its five slots in frozen order, twelve evaluations each, 1..60 without a gap. */
export function f2PlanOrderIsFrozen(plan: F2StudyPlan): boolean {
  if (plan.evaluations.length !== F2_N_REPLICATES * EXPECTED_LOGICAL_BATCHES_PER_VARIANT) {
    return false;
  }
  return plan.evaluations.every((evaluation, index) => {
    const slot = plan.slots[Math.floor(index / EXPECTED_LOGICAL_BATCHES_PER_VARIANT)];
    return (
      slot !== undefined &&
      evaluation.slotId === slot.slotId &&
      evaluation.studySequence === index + 1 &&
      evaluation.sequenceWithinReplicate === (index % EXPECTED_LOGICAL_BATCHES_PER_VARIANT) + 1 &&
      evaluation.logicalBatchOrdinal === (index % EXPECTED_LOGICAL_BATCHES_PER_VARIANT) + 1
    );
  });
}

/** The absolute path a slot's future output root would occupy under a study root. Creates nothing. */
export function f2OutputRootPathOf(studyRoot: string, slot: F2SlotIdentity): string {
  return `${studyRoot}/${slot.futureOutputRootName}`;
}

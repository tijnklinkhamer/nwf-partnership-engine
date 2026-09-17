/**
 * PHASE 2B-2D2C-F6 — THE FRESH FINAL-V6 N=5 RESTART STUDY PLAN.
 *
 * F5 could no longer answer its frozen 5/5 question after host sleep
 * interrupted it (see `f5ClosureF6.ts`). F6 is a NEW study, not F5 recovery:
 * a new study id, five new slot ids, new study and control roots — and the
 * IDENTICAL twelve frozen V6 logical evaluations per replicate.
 *
 * WHY THE PLAN IS DERIVED FROM THE APPROVED F2 PLAN, TWICE.
 *
 *   1. REMAP: every F6 evaluation is the approved F2 plan's evaluation at the
 *      same position with only the slot id replaced. Nothing semantic can
 *      differ, because nothing semantic is recomputed.
 *   2. REBUILD: the same plan is built independently through F2's own
 *      `buildF2StudyPlan` with the F6 slots, from the inherited attempt-4 plan
 *      and the V6 prompt identity.
 *
 *   The two must agree field for field. The F2 plan itself must hash to the
 *   owner-approved `PROPOSED_F2_PLAN_SHA256`, and all five F2 replicates must
 *   carry the same twelve evaluations, so "the same twelve frozen F2 V6
 *   logical evaluations" is proven, not stated.
 *
 * F5 IS NOT COUNTED. The F6 slot ids and output-root names are disjoint from
 * F5's, and `resolveF6Slot` refuses every F5 slot id.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 * Creates no directory and authorises nothing.
 */
import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../constants.js';
import type { F0OExecutionPlan } from '../f0o/freezeF0O.js';
import { PROPOSED_F2_PLAN_SHA256 } from '../f2/freezeF2.js';
import {
  buildF2StudyPlan,
  f2PlanOrderIsFrozen,
  f2StudyPlanSha256,
  F2_N_REPLICATES,
  F2_SLOTS,
  F2_VARIANT_NAME,
  type F2PlannedEvaluation,
  type F2PromptIdentity,
  type F2SlotIdentity,
  type F2StudyPlan,
} from '../f2/studyPlanCoreF2.js';

export const F6_STUDY_ID = 'FINAL_V6_DEV_N5_RESTART_1';
export const F6_FREEZE_REVISION = 'F6_FINAL_V6_N5_FRESH_RESTART_AFTER_HOST_SLEEP';
export const F6_PLAN_VERSION = 'phase2b-2d2c-f6-v6-restart-study-plan-v1';

export const F6_STUDY_ROOT =
  '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/v6-final-n5-restart-1';
export const F6_CONTROL_ROOT =
  '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/v6-final-n5-restart-1-control';

export type F6StudyPlanErrorReason =
  | 'SOURCE_PLAN_IDENTITY'
  | 'SOURCE_REPLICATES_DIFFER'
  | 'SLOT_IDENTITY'
  | 'REMAP_REBUILD_DISAGREEMENT'
  | 'UNKNOWN_SLOT';

export class F6StudyPlanError extends Error {
  override readonly name = 'F6StudyPlanError';
  declare readonly reason: F6StudyPlanErrorReason;
  constructor(reason: F6StudyPlanErrorReason, message: string) {
    super(message);
    Object.defineProperty(this, 'reason', { value: reason, enumerable: true });
  }
}

/**
 * The five fresh F6 slots, in frozen order. Structurally `F2SlotIdentity`
 * (same variant, same shape) so F2's own plan builder can schedule them, but
 * every id and output-root name is new.
 */
export const F6_SLOTS: readonly F2SlotIdentity[] = Object.freeze(
  Array.from({ length: F2_N_REPLICATES }, (_, index) => {
    const replicateNumber = index + 1;
    return Object.freeze({
      sequence: replicateNumber,
      slotId: `V6_RESTART_${replicateNumber}`,
      replicateNumber,
      variantName: F2_VARIANT_NAME,
      futureOutputRootName: `v6-restart-${replicateNumber}`,
    });
  }),
);

export interface F6StudyPlan {
  readonly planVersion: typeof F6_PLAN_VERSION;
  readonly studyId: typeof F6_STUDY_ID;
  readonly freezeRevision: typeof F6_FREEZE_REVISION;
  /** The owner-approved F2 plan whose twelve evaluations every F6 replicate re-runs. */
  readonly sourceF2PlanSha256: string;
  /** The F2-shaped plan over the F6 slots (60 evaluations, five slots x twelve). */
  readonly plan: F2StudyPlan;
}

/** A planned evaluation's canonical identity with the named slot-positional fields removed. */
function identityWithout(
  evaluation: F2PlannedEvaluation,
  omit: readonly (keyof F2PlannedEvaluation)[],
): string {
  const rest: Record<string, unknown> = { ...evaluation };
  for (const key of omit) delete rest[key];
  return canonicalStringify(rest);
}

/** Refuses (throws) any slot id that is not one of the five F6 slots — every F5 slot id included. */
export function resolveF6Slot(slotId: string): F2SlotIdentity {
  const slot = F6_SLOTS.find((candidate) => candidate.slotId === slotId);
  if (slot === undefined) {
    throw new F6StudyPlanError(
      'UNKNOWN_SLOT',
      `"${slotId}" is not one of the ${F2_N_REPLICATES} fresh F6 restart slots ` +
        `(${F6_SLOTS.map((s) => s.slotId).join(', ')}).`,
    );
  }
  return slot;
}

/**
 * Builds the F6 plan from the approved F2 plan, by remap AND by independent
 * rebuild, and refuses any disagreement. `f2Plan` must be the approved plan;
 * `inheritedPlan` / `inheritedPlanSha256` / `prompt` are the same inputs the
 * approved F2 plan was built from.
 */
export function buildF6StudyPlan(
  f2Plan: F2StudyPlan,
  inheritedPlan: F0OExecutionPlan,
  inheritedPlanSha256: string,
  prompt: F2PromptIdentity,
): F6StudyPlan {
  const sourceF2PlanSha256 = f2StudyPlanSha256(f2Plan);
  if (sourceF2PlanSha256 !== PROPOSED_F2_PLAN_SHA256 || !f2PlanOrderIsFrozen(f2Plan)) {
    throw new F6StudyPlanError(
      'SOURCE_PLAN_IDENTITY',
      `the source plan hashes to ${sourceF2PlanSha256}; only the owner-approved F2 plan ${PROPOSED_F2_PLAN_SHA256} may be restarted.`,
    );
  }

  const idsF6 = new Set(F6_SLOTS.map((slot) => slot.slotId));
  const rootsF6 = new Set(F6_SLOTS.map((slot) => slot.futureOutputRootName));
  for (const slot of F2_SLOTS) {
    if (idsF6.has(slot.slotId) || rootsF6.has(slot.futureOutputRootName)) {
      throw new F6StudyPlanError('SLOT_IDENTITY', `F6 reuses the F5 slot identity ${slot.slotId}.`);
    }
  }

  // All five approved replicates must carry the SAME twelve evaluations; the
  // first replicate is then the template every F6 replicate re-runs.
  const template = f2Plan.evaluations.slice(0, EXPECTED_LOGICAL_BATCHES_PER_VARIANT);
  f2Plan.evaluations.forEach((evaluation, index) => {
    const expected = template[index % EXPECTED_LOGICAL_BATCHES_PER_VARIANT]!;
    const positional = ['slotId', 'replicateNumber', 'studySequence'] as const;
    if (identityWithout(evaluation, positional) !== identityWithout(expected, positional)) {
      throw new F6StudyPlanError(
        'SOURCE_REPLICATES_DIFFER',
        `approved F2 evaluation ${index + 1} differs from replicate 1 at the same position.`,
      );
    }
  });

  // 1. REMAP.
  const remapped: F2PlannedEvaluation[] = f2Plan.evaluations.map((evaluation, index) => {
    const slot = F6_SLOTS[Math.floor(index / EXPECTED_LOGICAL_BATCHES_PER_VARIANT)]!;
    return { ...evaluation, slotId: slot.slotId };
  });

  // 2. REBUILD, through F2's own builder.
  const rebuilt = buildF2StudyPlan(inheritedPlan, inheritedPlanSha256, prompt, F6_SLOTS);
  if (rebuilt.evaluations.length !== remapped.length) {
    throw new F6StudyPlanError(
      'REMAP_REBUILD_DISAGREEMENT',
      `the rebuild schedules ${rebuilt.evaluations.length} evaluations; the remap ${remapped.length}.`,
    );
  }
  rebuilt.evaluations.forEach((evaluation, index) => {
    const other = remapped[index]!;
    if (
      canonicalStringify(evaluation) !== canonicalStringify(other) ||
      identityWithout(evaluation, ['slotId']) !==
        identityWithout(f2Plan.evaluations[index]!, ['slotId'])
    ) {
      throw new F6StudyPlanError(
        'REMAP_REBUILD_DISAGREEMENT',
        `F6 evaluation ${index + 1} differs between the remapped approved plan and the independent rebuild.`,
      );
    }
  });
  if (
    canonicalStringify(rebuilt.ceilings) !== canonicalStringify(f2Plan.ceilings) ||
    canonicalStringify(rebuilt.promptIdentity) !== canonicalStringify(f2Plan.promptIdentity) ||
    rebuilt.inheritedFromPlanSha256 !== f2Plan.inheritedFromPlanSha256 ||
    !f2PlanOrderIsFrozen(rebuilt)
  ) {
    throw new F6StudyPlanError(
      'REMAP_REBUILD_DISAGREEMENT',
      'the rebuilt F6 plan differs from the approved F2 plan in ceilings, prompt identity, inheritance or order.',
    );
  }

  return {
    planVersion: F6_PLAN_VERSION,
    studyId: F6_STUDY_ID,
    freezeRevision: F6_FREEZE_REVISION,
    sourceF2PlanSha256,
    plan: rebuilt,
  };
}

/** The F6 plan's own deterministic identity, over its canonical serialization. */
export function f6StudyPlanSha256(plan: F6StudyPlan): string {
  return createHash('sha256')
    .update(
      canonicalStringify({
        planVersion: plan.planVersion,
        studyId: plan.studyId,
        freezeRevision: plan.freezeRevision,
        sourceF2PlanSha256: plan.sourceF2PlanSha256,
        f2ShapedPlanSha256: f2StudyPlanSha256(plan.plan),
        variantName: plan.plan.variantName,
        promptIdentity: plan.plan.promptIdentity,
        slots: plan.plan.slots,
        evaluations: plan.plan.evaluations,
        ceilings: plan.plan.ceilings,
        inheritedFromPlanSha256: plan.plan.inheritedFromPlanSha256,
      }),
    )
    .digest('hex');
}

/** The absolute path a slot's future output root would occupy under the F6 study root. Creates nothing. */
export function f6OutputRootPathOf(slot: F2SlotIdentity): string {
  return `${F6_STUDY_ROOT}/${resolveF6Slot(slot.slotId).futureOutputRootName}`;
}

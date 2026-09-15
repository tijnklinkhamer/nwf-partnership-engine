/**
 * PHASE 2B-2D2C-F0W — THE TWO-LAYER SLOT IDENTITY BRIDGE.
 *
 * The owner's brief named this "load-bearing": a replication-study slot is
 * NOT a new semantic attempt 5..14, and it must never be mistaken for one at
 * the child-dispatch boundary `childMain.ts` already enforces. The resolution
 * is structural, not a new manifest field:
 *
 *   - the OUTER identity (what this module adds) is the slot itself —
 *     `slotId`, `sequence`, `pairNumber`, `variantName`, and the slot's own
 *     distinct future output root. This is what a per-slot authorisation
 *     binds and what governs WHETHER a run may start.
 *   - the INNER identity (unchanged, reused byte-for-byte) is exactly the
 *     historical F0I (attempt 3, V4) or F0O (attempt 4, V5) freeze, plan and
 *     `attemptNo` — the very same values `childMain.ts`'s
 *     `resolveChildFreeze`/`freezeFamilyOf` already resolve by hash. A
 *     replication run for PAIR_3_V4 dispatches a `PROMPT_V4_CANONICAL`
 *     child claiming `attemptNo: 3` against the F0I freeze hash — EXACTLY
 *     what attempt 3 itself dispatched — and nothing under
 *     `src/test/harness/phase2b2d2c/childMain.ts`,
 *     `f0c/freezeFamily.ts` or either variant-root verifier needs to change,
 *     or does change, for this study to run.
 *
 * Collision safety comes from the OUTER layer alone: `attemptDirectoryOf`
 * (`artifacts.ts`) is keyed by `(outputRoot, variantName, ordinal, attemptNo)`,
 * and every one of the five V4 slots uses a DIFFERENT `outputRoot` (its own
 * `futureOutputRootName` under the frozen study root) while reusing the
 * identical `attemptNo: 3`. Five independent write-once namespaces, one per
 * slot, never one shared namespace keyed by a fabricated attempt number.
 *
 * This module invents no batch, corpus, identity or root. It reads only the
 * ALREADY-VERIFIED `Attempt3ExecutionPlan` (F0I) / `Attempt4ExecutionPlan`
 * (F0O) the caller built via `buildF0IExecutionPlan`/`buildF0OExecutionPlan`,
 * and returns it, byte-identical, alongside the slot's own output root and
 * the historical attempt number — never a transformed copy.
 *
 * PURE. No network, no database, no clock, no filesystem, no execution:
 * nothing here calls `runExperiment`, constructs a `ChildLauncher`, or
 * resolves a variant runtime ROOT PATH (that remains an operator-supplied
 * value, exactly as it is for attempts 3 and 4 today).
 */
import {
  ATTEMPT_3_NO,
  F0I_FREEZE_PATH,
  F0I_VARIANT,
  PROPOSED_F0I_FREEZE_RAW_SHA256,
  PROPOSED_F0I_PLAN_SHA256,
  type F0IExecutionPlan,
} from '../f0i/freezeF0I.js';
import {
  ATTEMPT_4_NO,
  F0O_FREEZE_PATH,
  F0O_VARIANT,
  PROPOSED_F0O_FREEZE_RAW_SHA256,
  PROPOSED_F0O_PLAN_SHA256,
  type F0OExecutionPlan,
} from '../f0o/freezeF0O.js';
import { F0V_STUDY_ROOT } from '../f0v/freezeF0V.js';
import {
  futureOutputRootPathOf,
  type StudySlotIdentity,
  type StudyVariantName,
} from '../f0v/studyPlanCore.js';

export class SlotExecutionPlanError extends Error {
  override readonly name = 'SlotExecutionPlanError';
  constructor(
    readonly reason: 'SOURCE_PLAN_VARIANT_MISMATCH',
    message: string,
  ) {
    super(message);
  }
}

/** The frozen historical identity a slot's variant reuses, unchanged. */
export interface SlotHistoricalIdentity {
  readonly historicalAttemptNo: 3 | 4;
  readonly historicalFreezePath: string;
  readonly historicalFreezeRawSha256: string;
  readonly historicalPlanSha256: string;
  readonly runtimeCommit: string;
  readonly promptVersion: string;
  readonly promptSha256: string;
}

export function historicalIdentityOf(variantName: StudyVariantName): SlotHistoricalIdentity {
  if (variantName === 'PROMPT_V4_CANONICAL') {
    return {
      historicalAttemptNo: ATTEMPT_3_NO,
      historicalFreezePath: F0I_FREEZE_PATH,
      historicalFreezeRawSha256: PROPOSED_F0I_FREEZE_RAW_SHA256,
      historicalPlanSha256: PROPOSED_F0I_PLAN_SHA256,
      runtimeCommit: F0I_VARIANT.gitCommit,
      promptVersion: F0I_VARIANT.promptVersion,
      promptSha256: F0I_VARIANT.runtimePromptSha256,
    };
  }
  return {
    historicalAttemptNo: ATTEMPT_4_NO,
    historicalFreezePath: F0O_FREEZE_PATH,
    historicalFreezeRawSha256: PROPOSED_F0O_FREEZE_RAW_SHA256,
    historicalPlanSha256: PROPOSED_F0O_PLAN_SHA256,
    runtimeCommit: F0O_VARIANT.gitCommit,
    promptVersion: F0O_VARIANT.promptVersion,
    promptSha256: F0O_VARIANT.runtimePromptSha256,
  };
}

/**
 * Everything `runExperiment` (`coordinator.ts`) needs to run ONE slot, minus
 * the operator-supplied seams (launcher, clock, variant runtime root path,
 * classifier config dir, parent environment, authorisation). The `plan` is
 * the historical F0I/F0O plan, returned exactly as given — never rebuilt,
 * relabelled or filtered.
 */
export interface SlotExecutionPlanTemplate {
  readonly slot: StudySlotIdentity;
  readonly plan: F0IExecutionPlan | F0OExecutionPlan;
  readonly freezePath: string;
  readonly freezeConfigRawSha256: string;
  readonly outputRoot: string;
  readonly attemptNo: 3 | 4;
}

/**
 * Builds the execution-plan template for ONE slot. `f0iPlan`/`f0oPlan` must
 * already have been built (and therefore already hash-verified) by
 * `buildF0IExecutionPlan`/`buildF0OExecutionPlan`; this function does not
 * re-derive them and does not accept raw freeze bytes.
 */
export function buildSlotExecutionPlanTemplate(
  slot: StudySlotIdentity,
  f0iPlan: F0IExecutionPlan,
  f0oPlan: F0OExecutionPlan,
  studyRoot: string = F0V_STUDY_ROOT,
): SlotExecutionPlanTemplate {
  const plan = slot.variantName === 'PROMPT_V4_CANONICAL' ? f0iPlan : f0oPlan;
  if (plan.evaluations[0]?.variantName !== slot.variantName) {
    throw new SlotExecutionPlanError(
      'SOURCE_PLAN_VARIANT_MISMATCH',
      `slot ${slot.slotId} schedules ${slot.variantName}, but the supplied source plan schedules ${plan.evaluations[0]?.variantName ?? '<empty>'}.`,
    );
  }
  const identity = historicalIdentityOf(slot.variantName);
  return {
    slot,
    plan,
    freezePath: identity.historicalFreezePath,
    freezeConfigRawSha256: plan.freezeConfigRawSha256,
    outputRoot: futureOutputRootPathOf(studyRoot, slot),
    attemptNo: identity.historicalAttemptNo,
  };
}

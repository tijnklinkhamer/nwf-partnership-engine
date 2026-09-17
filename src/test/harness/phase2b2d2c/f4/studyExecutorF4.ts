/**
 * PHASE 2B-2D2C-F4 — THE FINAL-V6 STUDY EXECUTOR.
 *
 * The ONE execution path for the approved final V6 N=5 DEV study. It is the
 * F0X study executor's shape, rebuilt over the F3 execution-control authority
 * and the F4 V6 plan, and it performs, in this order and fail-closed:
 *
 *   1. STUDY_CONTEXT — the approved F2 freeze, the owner freeze-approval
 *      record and the inherited F0O freeze are read from the runner
 *      repository and cross-verified by exact hash (`v6StudyContextF4.ts`);
 *      all five slot plans and the canonical ABSOLUTE child freeze path are
 *      derived from them.
 *   2. EXECUTION_BUILD — the checked-out HEAD is a full commit and the
 *      working tree is clean. (Every candidate and the study approval are
 *      then compared against THAT head by the F3 gates themselves.)
 *   3. ALL_FIVE_PREFLIGHT — F3's `runF3AllFivePreflight`, unmodified: all five
 *      candidates (hash + bytes), the ONE study approval, all five output
 *      roots and "before slot 1", together.
 *   A refusal at 1–3 writes NOTHING and launches nothing.
 *   4. The F4 study manifest, once.
 *   5. For each frozen slot, in order, never skipped, never reordered:
 *        a. F3's `evaluateF3ComposedSlotExecutionDecision`, unmodified —
 *           sequencing, candidate, study approval, approval-names-this-exact-
 *           candidate-and-bytes, execution-build equality, output root,
 *           consumption. A refusal is recorded and PAUSES the study.
 *        b. F2 PLAN BINDING — the granted candidate names the very F2 plan,
 *           prompt and integrated runtime this plan was derived from, and the
 *           slot's plan is exactly the approved one.
 *        c. The F4 outer-slot identity record (spends the candidate).
 *        d. SEMANTIC DISPATCH — `runExperiment` (`coordinator.ts`, reused
 *           byte-for-byte) over the slot's twelve frozen V6 evaluations, each
 *           child carrying the study binding it re-proves before any provider
 *           exists.
 *        e. Progression follows the slot's OWN preserved evidence, read fresh
 *           (`classifySlotEvidence`): only a durably-closed Class C slot
 *           advances; anything else pauses. The study never stops early
 *           because results look good or bad — a Class C slot that ended
 *           STOPPED is still a terminal replicate and the next slot runs.
 *   6. The study terminal record, once.
 *
 * WHAT A CALLER CANNOT CHOOSE. There is no study-root, output-root, slot,
 * start-slot, skip-slot, slot-order, variant, prompt or freeze parameter: the
 * study root is the frozen F2 root, the slots and their order are the frozen
 * F2 slots, and the plan is derived from the approved bytes. `runExperiment`
 * is reached from exactly one place below, with an `ExperimentInput` built
 * only from a GRANTED F3 composed decision and the approved plan.
 *
 * AUTH-STATUS stays exactly where it was: inside the production provider the
 * child constructs AFTER its own preflight, as the pre-inference check F0X and
 * Recovery-1 used. This module has no auth path, no credential source and no
 * environment read of its own; the parent environment is passed through the
 * coordinator's existing allowlisted child-environment builder.
 *
 * NO SCORING, NO GOLD, NO HOLDOUT: this module and everything it imports read
 * no gold label, no adjudication and no HOLDOUT file; scoring is a separate,
 * separately-authorised step after all five slots are terminal.
 */
import { isAbsolute, join } from 'node:path';
import type { OutputRootProbes as SlotOutputRootProbes } from '../artifacts.js';
import { RELIABILITY_SEMANTICS_V2 } from '../constants.js';
import {
  runExperiment,
  type ChildLauncher,
  type ExperimentInput,
  type ExperimentResult,
} from '../coordinator.js';
import { F0O_FREEZE_PATH } from '../f0o/freezeF0O.js';
import {
  classifySlotEvidence,
  inclusionClassOf,
  type SlotEvidenceClassification,
  type SlotEvidenceProbes,
  type SlotInclusionClass,
} from '../f0w/sequencing.js';
import {
  writeSlotTransition,
  writeStudyTerminal,
  STUDY_RECORD_VERSION,
  type SlotTransitionEventKind,
} from '../f0x/studyRecords.js';
import { F2_STUDY_ROOT, V6_PROMPT_VERSION } from '../f2/freezeF2.js';
import { F2_VARIANT_NAME, type F2SlotIdentity } from '../f2/studyPlanCoreF2.js';
import {
  runF3AllFivePreflight,
  type F3AllFivePreflightDecision,
} from '../f3/allFivePreflightF3.js';
import {
  evaluateF3ComposedSlotExecutionDecision,
  type F3ComposedSlotExecutionDecision,
  type F3ComposedSlotExecutionGrant,
} from '../f3/composedExecutionDecisionF3.js';
import { loadF3SlotRegistry, type F3SlotRegistry } from '../f3/slotRegistryF3.js';
import {
  F4_OUTER_SLOT_IDENTITY_VERSION,
  F4_STUDY_RECORD_VERSION,
  writeF4OuterSlotIdentity,
  writeF4StudyManifest,
} from './studyRecordsF4.js';
import { buildF4V6SlotRunnerPlan, type F4V6SlotRunnerPlan } from './v6SlotRunnerPlanF4.js';
import {
  F4_CHILD_STUDY_BINDING_VERSION,
  F4_STUDY_CONTEXT_PATHS,
  F4_STUDY_ID,
  loadF4V6StudyContext,
  type F4ChildStudyBinding,
  type F4V6StudyContext,
} from './v6StudyContextF4.js';

export interface F4StudyExecutorClock {
  readonly nowUtc: () => Date;
}

export interface F4StudyExecutorInput {
  /** Absolute root of the runner repository at the execution build; the approved bytes are read from here. */
  readonly runnerRepoRoot: string;
  readonly candidatePathForSlot: (slotId: string) => string | null;
  readonly studyApprovalPath: string | null;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  /** The ACTUAL checked-out HEAD of the runner repository (production: `git rev-parse HEAD`). */
  readonly currentHead: () => string;
  /** True iff the runner repository's tracked working tree is clean (production: `git status --porcelain` empty). */
  readonly workingTreeClean: () => boolean;
  readonly alreadyConsumed: (authorisationSha256: string, outputRoot: string) => boolean;
  readonly sequencingProbes: SlotEvidenceProbes;
  readonly outputRootProbes: SlotOutputRootProbes;
  readonly forbiddenOutputRootContainers: readonly string[];
  /** The operator-supplied V6 runtime root; the child verifies it against the approved V6 identity. */
  readonly v6Root: string;
  readonly classifierConfigDir: string;
  readonly parentEnv: Readonly<Record<string, string | undefined>>;
  readonly platform: 'posix' | 'win32';
  readonly launcher: ChildLauncher;
  readonly clock: F4StudyExecutorClock;
}

export type F4BlockedStage = 'STUDY_CONTEXT' | 'EXECUTION_BUILD' | 'ALL_FIVE_PREFLIGHT';

export interface F4CompletedSlot {
  readonly slotId: string;
  readonly experiment: ExperimentResult;
  readonly classification: SlotEvidenceClassification;
}

export type F4StudyExecutionOutcome =
  | {
      readonly status: 'BLOCKED_BEFORE_START';
      readonly stage: F4BlockedStage;
      readonly detail: string;
      readonly preflight: F3AllFivePreflightDecision | null;
      /** Always zero: nothing before a granted preflight can launch a child. */
      readonly childrenLaunched: 0;
    }
  | {
      readonly status: 'PAUSED';
      readonly pauseKind: 'GATE_REFUSAL' | 'PLAN_BINDING_REFUSAL';
      readonly completedSlots: readonly F4CompletedSlot[];
      readonly pausedAtSlot: string;
      readonly detail: string;
      readonly composed: F3ComposedSlotExecutionDecision;
    }
  | {
      readonly status: 'PAUSED';
      readonly pauseKind: 'POST_EXECUTION_EVIDENCE';
      readonly completedSlots: readonly F4CompletedSlot[];
      readonly pausedAtSlot: string;
      readonly detail: string;
      readonly inclusionClass: SlotInclusionClass;
      readonly classification: SlotEvidenceClassification;
      readonly experiment: ExperimentResult;
    }
  | {
      readonly status: 'COMPLETED_ALL_SLOTS';
      readonly completedSlots: readonly F4CompletedSlot[];
    };

function blocked(
  stage: F4BlockedStage,
  detail: string,
  preflight: F3AllFivePreflightDecision | null = null,
): F4StudyExecutionOutcome & { readonly status: 'BLOCKED_BEFORE_START' } {
  return { status: 'BLOCKED_BEFORE_START', stage, detail, preflight, childrenLaunched: 0 };
}

/**
 * THE F2 PLAN BINDING of a granted slot: the candidate the owner approved was
 * issued against exactly the plan, prompt and runtime this executor derived,
 * and the slot the gates granted is exactly the slot this plan schedules.
 * Returns the problem, or null.
 */
export function f4PlanBindingProblem(
  grant: F3ComposedSlotExecutionGrant,
  plan: F4V6SlotRunnerPlan,
  context: F4V6StudyContext,
): string | null {
  const problems: string[] = [];
  const { authorisation } = grant;
  if (grant.slot.slotId !== plan.slot.slotId) problems.push('slotId');
  if (authorisation.f2FreezeRawSha256 !== context.f2FreezeRawSha256)
    problems.push('f2FreezeRawSha256');
  if (authorisation.f2PlanSha256 !== context.f2PlanSha256) problems.push('f2PlanSha256');
  if (authorisation.f2OwnerFreezeApprovalRawSha256 !== context.f2OwnerFreezeApprovalRawSha256) {
    problems.push('f2OwnerFreezeApprovalRawSha256');
  }
  if (
    authorisation.integratedRuntimeCommit !== context.f2Freeze.lineages.integratedRuntime.commit
  ) {
    problems.push('integratedRuntimeCommit');
  }
  if (authorisation.promptVersion !== V6_PROMPT_VERSION) problems.push('promptVersion');
  if (authorisation.promptSha256 !== context.f2Freeze.lineages.semanticSource.promptSha256) {
    problems.push('promptSha256');
  }
  if (authorisation.reliabilitySemanticsVersion !== plan.reliabilitySemanticsVersion) {
    problems.push('reliabilitySemanticsVersion');
  }
  if (authorisation.requestedModelId !== plan.requestedModelId) problems.push('requestedModelId');
  if (authorisation.maxLogicalEvaluations !== plan.evaluations.length) {
    problems.push('maxLogicalEvaluations');
  }
  if (
    plan.evaluations.some(
      (evaluation, index) =>
        evaluation.variantName !== F2_VARIANT_NAME ||
        evaluation.logicalBatchOrdinal !== authorisation.frozenLogicalBatchOrdinals[index],
    )
  ) {
    problems.push('frozenLogicalBatchOrdinals');
  }
  return problems.length === 0
    ? null
    : `the granted candidate for ${grant.slot.slotId} disagrees with the approved F2 plan on: ${problems.join(', ')}.`;
}

function transitionEventForRefusal(
  decision: F3ComposedSlotExecutionDecision & { readonly granted: false },
): SlotTransitionEventKind {
  if (decision.failedGate === 'SEQUENCING' && decision.refusal === 'PRIOR_SLOT_PAUSED_CLASS_B') {
    return 'SLOT_PAUSED_CLASS_B';
  }
  if (
    decision.failedGate === 'SEQUENCING' &&
    decision.refusal === 'PRIOR_SLOT_AMBIGUOUS_EVIDENCE'
  ) {
    return 'SLOT_AMBIGUOUS';
  }
  return 'SLOT_REFUSED_BEFORE_GRANT';
}

/**
 * The ONLY construction of an `ExperimentInput` for a V6 slot. Module-private:
 * it requires a GRANTED composed decision and the approved plan, and nothing
 * outside this module can call it.
 */
function experimentInputOf(
  input: F4StudyExecutorInput,
  grant: F3ComposedSlotExecutionGrant,
  plan: F4V6SlotRunnerPlan,
  childFreezePath: string,
  binding: F4ChildStudyBinding,
): ExperimentInput {
  return {
    plan,
    freezePath: childFreezePath,
    outputRoot: grant.outputRoot,
    attemptNo: plan.attemptNo,
    authorisation: grant.authorisation,
    authorisationSha256: grant.authorisationSha256,
    variantRoots: { [F2_VARIANT_NAME]: input.v6Root },
    classifierConfigDir: input.classifierConfigDir,
    parentEnv: input.parentEnv,
    platform: input.platform,
    launcher: input.launcher,
    clock: input.clock,
    childStudyBinding: binding,
  };
}

export type F4PreStartInput = Pick<
  F4StudyExecutorInput,
  | 'runnerRepoRoot'
  | 'candidatePathForSlot'
  | 'studyApprovalPath'
  | 'readFile'
  | 'sha256'
  | 'currentHead'
  | 'workingTreeClean'
  | 'alreadyConsumed'
  | 'sequencingProbes'
  | 'outputRootProbes'
  | 'forbiddenOutputRootContainers'
> & { readonly nowUtc: () => Date };

export type F4PreStartDecision =
  | (F4StudyExecutionOutcome & { readonly status: 'BLOCKED_BEFORE_START' })
  | {
      readonly status: 'READY';
      readonly head: string;
      readonly childFreezePath: string;
      readonly context: F4V6StudyContext;
      readonly registry: F3SlotRegistry;
      readonly plans: ReadonlyMap<string, F4V6SlotRunnerPlan>;
      readonly preflight: F3AllFivePreflightDecision & { readonly granted: true };
    };

/**
 * Stages 1–3 — STUDY_CONTEXT, EXECUTION_BUILD, ALL_FIVE_PREFLIGHT — and
 * NOTHING else. WRITE-FREE and LAUNCH-FREE by construction: it takes no
 * launcher, writes no record and consumes no candidate, which is what lets the
 * CLI's preflight-only mode call it directly and never the executor.
 */
export function runF4PreStartChecks(input: F4PreStartInput): F4PreStartDecision {
  // 1. STUDY_CONTEXT.
  if (!isAbsolute(input.runnerRepoRoot)) {
    return blocked('STUDY_CONTEXT', 'the runner repository root must be an absolute path.');
  }
  const childFreezePath = join(input.runnerRepoRoot, F4_STUDY_CONTEXT_PATHS.f2Freeze);
  let context: F4V6StudyContext;
  let registry: F3SlotRegistry;
  let plans: ReadonlyMap<string, F4V6SlotRunnerPlan>;
  try {
    const f2FreezeBytes = input.readFile(childFreezePath);
    context = loadF4V6StudyContext({
      f2FreezeBytes,
      f2OwnerFreezeApprovalBytes: input.readFile(
        join(input.runnerRepoRoot, F4_STUDY_CONTEXT_PATHS.f2OwnerFreezeApproval),
      ),
      f0oFreezeBytes: input.readFile(join(input.runnerRepoRoot, F0O_FREEZE_PATH)),
    });
    registry = loadF3SlotRegistry(f2FreezeBytes);
    plans = new Map(
      registry.slots.map((slot) => [slot.slotId, buildF4V6SlotRunnerPlan(context, slot.slotId)]),
    );
  } catch (error) {
    return blocked(
      'STUDY_CONTEXT',
      `the approved study could not be verified: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
    );
  }

  // 2. EXECUTION_BUILD.
  const head = input.currentHead();
  if (!/^[0-9a-f]{40}$/.test(head)) {
    return blocked(
      'EXECUTION_BUILD',
      `the checked-out HEAD ${JSON.stringify(head)} is not a full commit.`,
    );
  }
  if (!input.workingTreeClean()) {
    return blocked(
      'EXECUTION_BUILD',
      `the runner repository at ${head} has uncommitted changes; only an exact committed execution build may run.`,
    );
  }

  // 3. ALL_FIVE_PREFLIGHT — F3, unmodified.
  const preflight = runF3AllFivePreflight({
    registry,
    candidatePathForSlot: input.candidatePathForSlot,
    studyApprovalPath: input.studyApprovalPath,
    readFile: input.readFile,
    sha256: input.sha256,
    nowUtc: input.nowUtc,
    currentHead: input.currentHead,
    alreadyConsumed: input.alreadyConsumed,
    sequencingProbes: input.sequencingProbes,
    outputRootProbes: input.outputRootProbes,
    forbiddenOutputRootContainers: input.forbiddenOutputRootContainers,
  });
  if (!preflight.granted) {
    return blocked('ALL_FIVE_PREFLIGHT', preflight.reason, preflight);
  }
  return { status: 'READY', head, childFreezePath, context, registry, plans, preflight };
}

/**
 * Runs the whole five-slot final-V6 study, from a fresh ("before slot 1")
 * state, once, in frozen order.
 */
export async function runF4V6StudyExecution(
  input: F4StudyExecutorInput,
): Promise<F4StudyExecutionOutcome> {
  const studyRoot = F2_STUDY_ROOT;

  // 1–3. A refusal writes NOTHING and launches nothing.
  const ready = runF4PreStartChecks({ ...input, nowUtc: input.clock.nowUtc });
  if (ready.status !== 'READY') return ready;
  const { head, childFreezePath, context, registry, plans, preflight } = ready;

  // 4. The study manifest, once.
  writeF4StudyManifest(studyRoot, {
    recordVersion: F4_STUDY_RECORD_VERSION,
    studyId: F4_STUDY_ID,
    f2FreezeRawSha256: context.f2FreezeRawSha256,
    f2PlanSha256: context.f2PlanSha256,
    f2OwnerFreezeApprovalRawSha256: context.f2OwnerFreezeApprovalRawSha256,
    reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    promptVersion: V6_PROMPT_VERSION,
    promptSha256: context.f2Freeze.lineages.semanticSource.promptSha256,
    integratedRuntimeCommit: context.f2Freeze.lineages.integratedRuntime.commit,
    executionBuildCommit: head,
    studyExecutionApprovalSha256: preflight.approvalSha256,
    candidateSet: preflight.slots.map((slot) => ({
      slotId: slot.slotId,
      sequence: slot.sequence,
      candidateAuthorisationSha256: slot.candidateAuthorisationSha256 as string,
      candidateAuthorisationBytes: slot.candidateAuthorisationBytes as number,
    })),
    startedAtUtc: input.clock.nowUtc().toISOString(),
  });

  const completedSlots: F4CompletedSlot[] = [];
  const pause = (
    slot: F2SlotIdentity,
    ordinal: number,
    event: SlotTransitionEventKind,
    reason: string,
  ): void => {
    writeSlotTransition(studyRoot, ordinal, {
      recordVersion: STUDY_RECORD_VERSION,
      slotId: slot.slotId,
      sequence: slot.sequence,
      event,
      detail: reason,
      atUtc: input.clock.nowUtc().toISOString(),
    });
    writeStudyTerminal(studyRoot, {
      recordVersion: STUDY_RECORD_VERSION,
      outcome: 'PAUSED',
      pauseReason: reason,
      blockingSlotId: slot.slotId,
      slotsCompleted: completedSlots.length,
      completedAtUtc: input.clock.nowUtc().toISOString(),
    });
  };

  // 5. Every frozen slot, in frozen order.
  for (const [index, slot] of registry.slots.entries()) {
    const ordinal = index + 1;
    const plan = plans.get(slot.slotId)!;

    // 5a. F3's composed decision, re-evaluated LIVE for this slot.
    const decision = evaluateF3ComposedSlotExecutionDecision({
      targetSlotId: slot.slotId,
      registry,
      authorisationPath: input.candidatePathForSlot(slot.slotId),
      studyApprovalPath: input.studyApprovalPath,
      readFile: input.readFile,
      sha256: input.sha256,
      nowUtc: input.clock.nowUtc,
      currentHead: input.currentHead,
      alreadyConsumed: input.alreadyConsumed,
      sequencingProbes: input.sequencingProbes,
      outputRootProbes: input.outputRootProbes,
      forbiddenOutputRootContainers: input.forbiddenOutputRootContainers,
    });
    if (!decision.granted) {
      const reason = `${decision.failedGate}/${decision.refusal}: ${decision.detail}`;
      pause(slot, ordinal, transitionEventForRefusal(decision), reason);
      return {
        status: 'PAUSED',
        pauseKind: 'GATE_REFUSAL',
        completedSlots,
        pausedAtSlot: slot.slotId,
        detail: reason,
        composed: decision,
      };
    }

    // 5b. F2 plan binding.
    const bindingProblem = f4PlanBindingProblem(decision, plan, context);
    if (bindingProblem !== null) {
      pause(slot, ordinal, 'SLOT_REFUSED_BEFORE_GRANT', `F2_PLAN_BINDING: ${bindingProblem}`);
      return {
        status: 'PAUSED',
        pauseKind: 'PLAN_BINDING_REFUSAL',
        completedSlots,
        pausedAtSlot: slot.slotId,
        detail: bindingProblem,
        composed: decision,
      };
    }

    writeSlotTransition(studyRoot, ordinal, {
      recordVersion: STUDY_RECORD_VERSION,
      slotId: slot.slotId,
      sequence: slot.sequence,
      event: 'SLOT_GRANTED',
      detail: `candidate ${decision.authorisationSha256} (${decision.authorisationBytes} bytes) granted under study approval ${decision.approvalSha256} at execution build ${decision.executionBuildCommit}.`,
      atUtc: input.clock.nowUtc().toISOString(),
    });

    const binding: F4ChildStudyBinding = {
      bindingVersion: F4_CHILD_STUDY_BINDING_VERSION,
      studyId: F4_STUDY_ID,
      f2FreezeRawSha256: context.f2FreezeRawSha256,
      f2PlanSha256: context.f2PlanSha256,
      f2OwnerFreezeApprovalRawSha256: context.f2OwnerFreezeApprovalRawSha256,
      f2OwnerFreezeApprovalRawBytes: context.f2OwnerFreezeApprovalRawBytes,
      reliabilitySemanticsVersion: plan.reliabilitySemanticsVersion,
      slotId: slot.slotId,
      replicateNumber: slot.replicateNumber,
      executionBuildCommit: decision.executionBuildCommit,
      candidateAuthorisationSha256: decision.authorisationSha256,
      studyExecutionApprovalSha256: decision.approvalSha256,
    };

    // 5c. The outer identity: its durable write spends this slot's candidate.
    writeF4OuterSlotIdentity({
      recordVersion: F4_OUTER_SLOT_IDENTITY_VERSION,
      studyId: F4_STUDY_ID,
      slotId: slot.slotId,
      sequence: slot.sequence,
      replicateNumber: slot.replicateNumber,
      variantName: F2_VARIANT_NAME,
      attemptNo: plan.attemptNo,
      f2FreezeRawSha256: context.f2FreezeRawSha256,
      f2PlanSha256: context.f2PlanSha256,
      f2OwnerFreezeApprovalRawSha256: context.f2OwnerFreezeApprovalRawSha256,
      reliabilitySemanticsVersion: plan.reliabilitySemanticsVersion,
      runtimeCommit: decision.authorisation.integratedRuntimeCommit,
      promptSha256: decision.authorisation.promptSha256,
      executionBuildCommit: decision.executionBuildCommit,
      candidateAuthorisationSha256: decision.authorisationSha256,
      candidateAuthorisationBytes: decision.authorisationBytes,
      studyExecutionApprovalSha256: decision.approvalSha256,
      plannedFinalInputSha256: plan.evaluations.map((evaluation) => evaluation.finalInputSha256),
      childStudyBinding: binding,
      outputRoot: decision.outputRoot,
      consumedAtUtc: input.clock.nowUtc().toISOString(),
    });

    // 5d. Semantic dispatch.
    const experiment = await runExperiment(
      experimentInputOf(input, decision, plan, childFreezePath, binding),
    );

    // 5e. The slot's own evidence decides progression — never the return alone.
    const classification = classifySlotEvidence(decision.outputRoot, input.sequencingProbes);
    const inclusionClass = inclusionClassOf(classification);
    const summary = `experiment status ${experiment.status}; ${experiment.evaluationsEndedWithoutStop} of ${experiment.evaluationsStarted} evaluations ended without a stop.`;
    if (
      inclusionClass !== 'CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED' ||
      !classification.durablyClosed
    ) {
      const reason =
        inclusionClass === 'CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED'
          ? `POST_EXECUTION/${inclusionClass}_NOT_DURABLY_CLOSED: ${classification.detail} ${summary}`
          : `POST_EXECUTION/${inclusionClass}: ${classification.detail} ${summary}`;
      pause(
        slot,
        ordinal,
        inclusionClass === 'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL'
          ? 'SLOT_PAUSED_CLASS_B'
          : 'SLOT_AMBIGUOUS',
        reason,
      );
      return {
        status: 'PAUSED',
        pauseKind: 'POST_EXECUTION_EVIDENCE',
        completedSlots,
        pausedAtSlot: slot.slotId,
        detail: reason,
        inclusionClass,
        classification,
        experiment,
      };
    }
    writeSlotTransition(studyRoot, ordinal, {
      recordVersion: STUDY_RECORD_VERSION,
      slotId: slot.slotId,
      sequence: slot.sequence,
      event: 'SLOT_COMPLETED_CLASS_C',
      detail: `${classification.detail} ${summary}`,
      atUtc: input.clock.nowUtc().toISOString(),
    });
    completedSlots.push({ slotId: slot.slotId, experiment, classification });
  }

  // 6. The terminal record, once.
  writeStudyTerminal(studyRoot, {
    recordVersion: STUDY_RECORD_VERSION,
    outcome: 'COMPLETED_ALL_SLOTS',
    pauseReason: null,
    blockingSlotId: null,
    slotsCompleted: completedSlots.length,
    completedAtUtc: input.clock.nowUtc().toISOString(),
  });
  return { status: 'COMPLETED_ALL_SLOTS', completedSlots };
}

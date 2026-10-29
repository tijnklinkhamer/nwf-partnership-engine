/**
 * PHASE 2B-2D2C-F7 — THE F6 RESTART STUDY EXECUTOR.
 *
 * The ONE execution path for the owner-approved fresh V6 N=5 restart study.
 * It is the F4 executor (`f4/studyExecutorF4.ts`) with exactly the F6
 * differences and nothing else, performing, in this order and fail-closed:
 *
 *   0. HOST_AWAKE — the frozen host-awake preflight, as a gate
 *      (`hostAwakeGateF7.ts`): darwin, a caffeinate idle-sleep assertion on
 *      behalf of this process or an ancestor, the lid not observed CLOSED, and
 *      the operator's explicit LID_OPEN_REQUIRED confirmation.
 *   1. STUDY_CONTEXT — the F6 freeze, the F6 owner freeze approval, the F2
 *      freeze and approval and the inherited F0O freeze, cross-verified by
 *      exact hash (`restartStudyContextF7.ts`); all five F6 slot plans and the
 *      canonical ABSOLUTE F6 child freeze path are derived from them.
 *   2. EXECUTION_BUILD — HEAD is a full commit and the tree is clean.
 *   3. ALL_FIVE_PREFLIGHT — all five F6 candidates, the ONE study approval,
 *      all five output roots and "before slot 1", together.
 *   A refusal at 0–3 writes NOTHING and launches nothing.
 *   4. The F7 study manifest, once, carrying the stage-0 host-awake decision.
 *   5. For each frozen F6 slot, in order, never skipped, never reordered:
 *        a. the composed six-gate decision, live;
 *        b. F6 PLAN BINDING — the granted candidate names exactly the F6
 *           freeze, plan and owner approval, prompt, runtime and model this
 *           plan was derived from;
 *        c. HOST_AWAKE again, immediately before consumption — a refusal
 *           pauses the study with the candidate UNSPENT;
 *        d. the F7 outer-slot identity record (spends the candidate);
 *        e. SEMANTIC DISPATCH — `runExperiment` (`coordinator.ts`, unchanged)
 *           over the slot's twelve frozen V6 evaluations, each child carrying
 *           the F6 restart binding it re-proves before any provider exists;
 *        f. progression follows the slot's OWN preserved evidence: only a
 *           durably-closed Class C slot advances; a Class C slot that ended
 *           STOPPED is still a terminal replicate and the next slot runs.
 *   6. The study terminal record, once.
 *
 * WHAT A CALLER CANNOT CHOOSE: no study root, output root, slot, start slot,
 * skip, order, variant, prompt, freeze or plan input exists. The host-awake
 * gate reads nothing semantic and alters nothing a granted run does.
 *
 * NO SCORING, NO GOLD, NO HOLDOUT, and no auth path of its own: auth-status
 * stays inside the production provider the child constructs after its own
 * preflight, exactly as in F4.
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
  STUDY_RECORD_VERSION,
  writeSlotTransition,
  writeStudyTerminal,
  type SlotTransitionEventKind,
} from '../f0x/studyRecords.js';
import { F2_APPROVAL_RECORD_PATH, F2_FREEZE_PATH, V6_PROMPT_VERSION } from '../f2/freezeF2.js';
import { F2_VARIANT_NAME, type F2SlotIdentity } from '../f2/studyPlanCoreF2.js';
import type { HostAwakeObservations } from '../f6/hostAwakePreflightF6.js';
import { F6_STUDY_ID } from '../f6/studyPlanCoreF6.js';
import {
  evaluateF7ComposedSlotExecutionDecision,
  f7SlotRegistryOf,
  runF7AllFivePreflight,
  type F7AllFivePreflightDecision,
  type F7ComposedSlotExecutionDecision,
  type F7ComposedSlotExecutionGrant,
  type F7SlotRegistry,
} from './executionGatesF7.js';
import {
  describeF7HostAwakeRefusal,
  evaluateF7HostAwakeGate,
  type F7HostAwakeGateDecision,
} from './hostAwakeGateF7.js';
import {
  F7_CHILD_STUDY_BINDING_VERSION,
  F7_RESTART_FREEZE_FAMILY,
  F7_STUDY_CONTEXT_PATHS,
  loadF7RestartStudyContext,
  type F7ChildStudyBinding,
  type F7RestartStudyContext,
} from './restartStudyContextF7.js';
import { buildF7RestartSlotRunnerPlan, type F7RestartSlotRunnerPlan } from './slotRunnerPlanF7.js';
import {
  F7_OUTER_SLOT_IDENTITY_VERSION,
  F7_STUDY_RECORD_VERSION,
  writeF7OuterSlotIdentity,
  writeF7StudyManifest,
} from './studyRecordsF7.js';
import { F7_STUDY_ROOT } from './studyRootsF7.js';

export interface F7StudyExecutorClock {
  readonly nowUtc: () => Date;
}

export interface F7StudyExecutorInput {
  /** Absolute root of the runner repository at the execution build; the approved bytes are read from here. */
  readonly runnerRepoRoot: string;
  readonly candidatePathForSlot: (slotId: string) => string | null;
  readonly studyApprovalPath: string | null;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly currentHead: () => string;
  readonly workingTreeClean: () => boolean;
  readonly alreadyConsumed: (authorisationSha256: string, outputRoot: string) => boolean;
  readonly sequencingProbes: SlotEvidenceProbes;
  readonly outputRootProbes: SlotOutputRootProbes;
  readonly forbiddenOutputRootContainers: readonly string[];
  /** Read-only host observation (production: `observeHostForF7`). Called before slot 1 and before each consumption. */
  readonly observeHost: () => HostAwakeObservations;
  /** The operator's explicit statement of the frozen precondition; only `LID_OPEN_REQUIRED` is accepted. */
  readonly operatorLidOpenConfirmation: string | null;
  readonly v6Root: string;
  readonly classifierConfigDir: string;
  readonly parentEnv: Readonly<Record<string, string | undefined>>;
  readonly platform: 'posix' | 'win32';
  readonly launcher: ChildLauncher;
  readonly clock: F7StudyExecutorClock;
}

export type F7BlockedStage =
  'HOST_AWAKE' | 'STUDY_CONTEXT' | 'EXECUTION_BUILD' | 'ALL_FIVE_PREFLIGHT';

export interface F7CompletedSlot {
  readonly slotId: string;
  readonly experiment: ExperimentResult;
  readonly classification: SlotEvidenceClassification;
}

export type F7StudyExecutionOutcome =
  | {
      readonly status: 'BLOCKED_BEFORE_START';
      readonly stage: F7BlockedStage;
      readonly detail: string;
      readonly hostAwake: F7HostAwakeGateDecision | null;
      readonly preflight: F7AllFivePreflightDecision | null;
      /** Always zero: nothing before a granted preflight can launch a child. */
      readonly childrenLaunched: 0;
    }
  | {
      readonly status: 'PAUSED';
      readonly pauseKind: 'GATE_REFUSAL' | 'PLAN_BINDING_REFUSAL';
      readonly completedSlots: readonly F7CompletedSlot[];
      readonly pausedAtSlot: string;
      readonly detail: string;
      readonly composed: F7ComposedSlotExecutionDecision;
    }
  | {
      readonly status: 'PAUSED';
      readonly pauseKind: 'HOST_AWAKE_REFUSAL';
      readonly completedSlots: readonly F7CompletedSlot[];
      readonly pausedAtSlot: string;
      readonly detail: string;
      readonly hostAwake: F7HostAwakeGateDecision;
    }
  | {
      readonly status: 'PAUSED';
      readonly pauseKind: 'POST_EXECUTION_EVIDENCE';
      readonly completedSlots: readonly F7CompletedSlot[];
      readonly pausedAtSlot: string;
      readonly detail: string;
      readonly inclusionClass: SlotInclusionClass;
      readonly classification: SlotEvidenceClassification;
      readonly experiment: ExperimentResult;
    }
  | {
      readonly status: 'COMPLETED_ALL_SLOTS';
      readonly completedSlots: readonly F7CompletedSlot[];
    };

type F7Blocked = F7StudyExecutionOutcome & { readonly status: 'BLOCKED_BEFORE_START' };

function blocked(
  stage: F7BlockedStage,
  detail: string,
  preflight: F7AllFivePreflightDecision | null = null,
  hostAwake: F7HostAwakeGateDecision | null = null,
): F7Blocked {
  return {
    status: 'BLOCKED_BEFORE_START',
    stage,
    detail,
    hostAwake,
    preflight,
    childrenLaunched: 0,
  };
}

/**
 * THE F6 PLAN BINDING of a granted slot: the candidate was issued against
 * exactly the F6 freeze, plan and owner approval, prompt, runtime and model
 * this executor derived, and for exactly the slot this plan schedules.
 */
export function f7PlanBindingProblem(
  grant: F7ComposedSlotExecutionGrant,
  plan: F7RestartSlotRunnerPlan,
  context: F7RestartStudyContext,
): string | null {
  const problems: string[] = [];
  const { authorisation } = grant;
  const f2 = context.f4.f2Freeze;
  if (grant.slot.slotId !== plan.slot.slotId) problems.push('slotId');
  if (authorisation.f6FreezeRawSha256 !== context.f6FreezeRawSha256) {
    problems.push('f6FreezeRawSha256');
  }
  if (authorisation.f6PlanSha256 !== context.f6PlanSha256) problems.push('f6PlanSha256');
  if (authorisation.f6OwnerFreezeApprovalRawSha256 !== context.f6OwnerFreezeApprovalRawSha256) {
    problems.push('f6OwnerFreezeApprovalRawSha256');
  }
  if (authorisation.f2FreezeRawSha256 !== context.f4.f2FreezeRawSha256) {
    problems.push('f2FreezeRawSha256');
  }
  if (authorisation.f2PlanSha256 !== context.f4.f2PlanSha256) problems.push('f2PlanSha256');
  if (authorisation.integratedRuntimeCommit !== f2.lineages.integratedRuntime.commit) {
    problems.push('integratedRuntimeCommit');
  }
  if (authorisation.promptVersion !== V6_PROMPT_VERSION) problems.push('promptVersion');
  if (authorisation.promptSha256 !== f2.lineages.semanticSource.promptSha256) {
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
    : `the granted candidate for ${grant.slot.slotId} disagrees with the approved F6 plan on: ${problems.join(', ')}.`;
}

function transitionEventForRefusal(
  decision: F7ComposedSlotExecutionDecision & { readonly granted: false },
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
 * The ONLY construction of an `ExperimentInput` for an F6 slot. Module-private:
 * it requires a GRANTED composed decision and the approved plan.
 */
function experimentInputOf(
  input: F7StudyExecutorInput,
  grant: F7ComposedSlotExecutionGrant,
  plan: F7RestartSlotRunnerPlan,
  childFreezePath: string,
  binding: F7ChildStudyBinding,
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

export type F7PreStartInput = Pick<
  F7StudyExecutorInput,
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

export type F7PreStartDecision =
  | F7Blocked
  | {
      readonly status: 'READY';
      readonly head: string;
      readonly childFreezePath: string;
      readonly context: F7RestartStudyContext;
      readonly registry: F7SlotRegistry;
      readonly plans: ReadonlyMap<string, F7RestartSlotRunnerPlan>;
      readonly preflight: F7AllFivePreflightDecision & { readonly granted: true };
    };

/**
 * Stages 1–3 — STUDY_CONTEXT, EXECUTION_BUILD, ALL_FIVE_PREFLIGHT — and
 * NOTHING else. WRITE-FREE and LAUNCH-FREE by construction, which is what lets
 * the CLI's default preview call it directly and never the executor.
 */
export function runF7PreStartChecks(input: F7PreStartInput): F7PreStartDecision {
  // 1. STUDY_CONTEXT.
  if (!isAbsolute(input.runnerRepoRoot)) {
    return blocked('STUDY_CONTEXT', 'the runner repository root must be an absolute path.');
  }
  const childFreezePath = join(input.runnerRepoRoot, F7_STUDY_CONTEXT_PATHS.f6Freeze);
  let context: F7RestartStudyContext;
  let registry: F7SlotRegistry;
  let plans: ReadonlyMap<string, F7RestartSlotRunnerPlan>;
  try {
    context = loadF7RestartStudyContext({
      f6FreezeBytes: input.readFile(childFreezePath),
      f6OwnerFreezeApprovalBytes: input.readFile(
        join(input.runnerRepoRoot, F7_STUDY_CONTEXT_PATHS.f6OwnerFreezeApproval),
      ),
      f2FreezeBytes: input.readFile(join(input.runnerRepoRoot, F2_FREEZE_PATH)),
      f2OwnerFreezeApprovalBytes: input.readFile(
        join(input.runnerRepoRoot, F2_APPROVAL_RECORD_PATH),
      ),
      f0oFreezeBytes: input.readFile(join(input.runnerRepoRoot, F0O_FREEZE_PATH)),
    });
    registry = f7SlotRegistryOf(context.f4.requestedModelId);
    plans = new Map(
      registry.slots.map((slot) => [
        slot.slotId,
        buildF7RestartSlotRunnerPlan(context, slot.slotId),
      ]),
    );
  } catch (error) {
    return blocked(
      'STUDY_CONTEXT',
      `the approved F6 restart study could not be verified: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
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

  // 3. ALL_FIVE_PREFLIGHT.
  const preflight = runF7AllFivePreflight({
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

/** Runs the whole five-slot F6 restart study, from a fresh ("before slot 1") state, once, in frozen order. */
export async function runF7RestartStudyExecution(
  input: F7StudyExecutorInput,
): Promise<F7StudyExecutionOutcome> {
  const studyRoot = F7_STUDY_ROOT;

  // 0. HOST_AWAKE — before anything is verified, consumed or launched.
  const hostAtStart = evaluateF7HostAwakeGate(
    input.observeHost(),
    input.operatorLidOpenConfirmation,
  );
  if (!hostAtStart.granted) {
    return blocked('HOST_AWAKE', describeF7HostAwakeRefusal(hostAtStart), null, hostAtStart);
  }

  // 1–3. A refusal writes NOTHING and launches nothing.
  const ready = runF7PreStartChecks({ ...input, nowUtc: input.clock.nowUtc });
  if (ready.status !== 'READY') return { ...ready, hostAwake: hostAtStart };
  const { head, childFreezePath, context, registry, plans, preflight } = ready;
  const f2 = context.f4.f2Freeze;

  // 4. The study manifest, once.
  writeF7StudyManifest(studyRoot, {
    recordVersion: F7_STUDY_RECORD_VERSION,
    studyId: F6_STUDY_ID,
    f6FreezeRawSha256: context.f6FreezeRawSha256,
    f6PlanSha256: context.f6PlanSha256,
    f6OwnerFreezeApprovalRawSha256: context.f6OwnerFreezeApprovalRawSha256,
    f2FreezeRawSha256: context.f4.f2FreezeRawSha256,
    f2PlanSha256: context.f4.f2PlanSha256,
    reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    promptVersion: V6_PROMPT_VERSION,
    promptSha256: f2.lineages.semanticSource.promptSha256,
    integratedRuntimeCommit: f2.lineages.integratedRuntime.commit,
    executionBuildCommit: head,
    studyExecutionApprovalSha256: preflight.approvalSha256,
    candidateSet: preflight.slots.map((slot) => ({
      slotId: slot.slotId,
      sequence: slot.sequence,
      candidateAuthorisationSha256: slot.candidateAuthorisationSha256 as string,
      candidateAuthorisationBytes: slot.candidateAuthorisationBytes as number,
    })),
    hostAwakeAtStudyStart: hostAtStart,
    f5PooledWithF6: false,
    startedAtUtc: input.clock.nowUtc().toISOString(),
  });

  const completedSlots: F7CompletedSlot[] = [];
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

  // 5. Every frozen F6 slot, in frozen order.
  for (const [index, slot] of registry.slots.entries()) {
    const ordinal = index + 1;
    const plan = plans.get(slot.slotId)!;

    // 5a. The composed decision, re-evaluated LIVE for this slot.
    const decision = evaluateF7ComposedSlotExecutionDecision({
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

    // 5b. F6 plan binding.
    const bindingProblem = f7PlanBindingProblem(decision, plan, context);
    if (bindingProblem !== null) {
      pause(slot, ordinal, 'SLOT_REFUSED_BEFORE_GRANT', `F6_PLAN_BINDING: ${bindingProblem}`);
      return {
        status: 'PAUSED',
        pauseKind: 'PLAN_BINDING_REFUSAL',
        completedSlots,
        pausedAtSlot: slot.slotId,
        detail: bindingProblem,
        composed: decision,
      };
    }

    // 5c. HOST_AWAKE again, immediately before this slot's candidate is spent.
    const hostBeforeSlot = evaluateF7HostAwakeGate(
      input.observeHost(),
      input.operatorLidOpenConfirmation,
    );
    if (!hostBeforeSlot.granted) {
      const reason = describeF7HostAwakeRefusal(hostBeforeSlot);
      pause(slot, ordinal, 'SLOT_REFUSED_BEFORE_GRANT', reason);
      return {
        status: 'PAUSED',
        pauseKind: 'HOST_AWAKE_REFUSAL',
        completedSlots,
        pausedAtSlot: slot.slotId,
        detail: reason,
        hostAwake: hostBeforeSlot,
      };
    }

    writeSlotTransition(studyRoot, ordinal, {
      recordVersion: STUDY_RECORD_VERSION,
      slotId: slot.slotId,
      sequence: slot.sequence,
      event: 'SLOT_GRANTED',
      detail: `candidate ${decision.authorisationSha256} (${decision.authorisationBytes} bytes) granted under study approval ${decision.approvalSha256} at execution build ${decision.executionBuildCommit}; host-awake gate passed (lid ${hostBeforeSlot.lidState}, power ${hostBeforeSlot.record.powerSource}).`,
      atUtc: input.clock.nowUtc().toISOString(),
    });

    const binding: F7ChildStudyBinding = {
      bindingFamily: F7_RESTART_FREEZE_FAMILY,
      bindingVersion: F7_CHILD_STUDY_BINDING_VERSION,
      studyId: F6_STUDY_ID,
      f6FreezeRawSha256: context.f6FreezeRawSha256,
      f6FreezeRawBytes: context.f6FreezeRawBytes,
      f6PlanSha256: context.f6PlanSha256,
      f6OwnerFreezeApprovalRawSha256: context.f6OwnerFreezeApprovalRawSha256,
      f6OwnerFreezeApprovalRawBytes: context.f6OwnerFreezeApprovalRawBytes,
      f2FreezeRawSha256: context.f4.f2FreezeRawSha256,
      f2PlanSha256: context.f4.f2PlanSha256,
      promptVersion: f2.lineages.semanticSource.promptVersion,
      promptSha256: f2.lineages.semanticSource.promptSha256,
      integratedRuntimeCommit: f2.lineages.integratedRuntime.commit,
      reliabilitySemanticsVersion: plan.reliabilitySemanticsVersion,
      corpusContentSha256: f2.corpus.derivedCorpusContentSha256,
      requestedModelId: plan.requestedModelId,
      agentSdkVersion: decision.authorisation.agentSdkVersion,
      maxTurns: plan.runConfig.maxTurns,
      slotId: slot.slotId,
      replicateNumber: slot.replicateNumber,
      executionBuildCommit: decision.executionBuildCommit,
      candidateAuthorisationSha256: decision.authorisationSha256,
      studyExecutionApprovalSha256: decision.approvalSha256,
    };

    // 5d. The outer identity: its durable write spends this slot's candidate.
    writeF7OuterSlotIdentity({
      recordVersion: F7_OUTER_SLOT_IDENTITY_VERSION,
      studyId: F6_STUDY_ID,
      slotId: slot.slotId,
      sequence: slot.sequence,
      replicateNumber: slot.replicateNumber,
      sourceF2SlotId: plan.sourceF2SlotId,
      variantName: F2_VARIANT_NAME,
      attemptNo: plan.attemptNo,
      f6FreezeRawSha256: context.f6FreezeRawSha256,
      f6PlanSha256: context.f6PlanSha256,
      f6OwnerFreezeApprovalRawSha256: context.f6OwnerFreezeApprovalRawSha256,
      reliabilitySemanticsVersion: plan.reliabilitySemanticsVersion,
      runtimeCommit: decision.authorisation.integratedRuntimeCommit,
      promptSha256: decision.authorisation.promptSha256,
      executionBuildCommit: decision.executionBuildCommit,
      candidateAuthorisationSha256: decision.authorisationSha256,
      candidateAuthorisationBytes: decision.authorisationBytes,
      studyExecutionApprovalSha256: decision.approvalSha256,
      plannedFinalInputSha256: plan.evaluations.map((evaluation) => evaluation.finalInputSha256),
      childStudyBinding: binding,
      hostAwakeBeforeConsumption: hostBeforeSlot,
      outputRoot: decision.outputRoot,
      consumedAtUtc: input.clock.nowUtc().toISOString(),
    });

    // 5e. Semantic dispatch.
    const experiment = await runExperiment(
      experimentInputOf(input, decision, plan, childFreezePath, binding),
    );

    // 5f. The slot's own evidence decides progression — never the return alone.
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

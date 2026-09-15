/**
 * PHASE 2B-2D2C-F0X — THE STUDY EXECUTOR.
 *
 * ONE call runs the whole ten-slot replication study, in frozen order,
 * automatically advancing across ordinary successful slots and pausing —
 * never crashing, never silently retrying — the moment any slot is not
 * cleanly eligible. This is the "single STUDY execution command, not ten
 * manually-triggered semantic commands" the owner's brief requires.
 *
 * Sequence, per invocation:
 *
 *   1. `runAllTenPreflight` — ALL ten candidates, the ONE study approval,
 *      and ALL ten output roots verified TOGETHER, before slot 1 is
 *      touched. A refusal here writes ONE `BLOCKED_BEFORE_START` terminal
 *      record and launches nothing, ever.
 *   2. `writeStudyManifest` — the study-wide identity, written once.
 *   3. For each of the ten frozen slots, in order:
 *        a. `evaluateComposedSlotExecutionDecision` — the four-gate
 *           composed decision (sequencing + candidate + approval +
 *           output root). A refusal here is NEVER a crash: it is recorded
 *           as a transition, the study terminal record is written
 *           (`PAUSED`), and this function returns — no exception, no
 *           partial write beyond what the composed decision itself
 *           already refused before.
 *        b. `writeOuterSlotIdentity` — the durable outer-layer record,
 *           write-once, BEFORE `runExperiment` is ever called. This is the
 *           "as late as possible before semantic execution, but before any
 *           provider construction" placement the brief asks for.
 *        c. `runExperiment` (`coordinator.ts`, UNMODIFIED) — the existing
 *           Tier-2 machinery. It writes its OWN authorisation-consumption
 *           marker as its first act, then runs the frozen 12 logical
 *           evaluations through the injected launcher.
 *        d. Whatever `runExperiment` returns (`COMPLETED_ALL_PLANNED` or
 *           `STOPPED`), the slot's own evidence is DURABLY CLOSED by
 *           construction (`coordinator.ts` always writes
 *           `EXPERIMENT_COMPLETION` or `EXPERIMENT_STOP` before
 *           returning) — so this is Class C, and the loop advances.
 *   4. `writeStudyTerminal` — written exactly once, whichever way the loop
 *      ends: all ten slots closed, or a pause.
 *
 * This module reuses `runExperiment` BYTE-FOR-BYTE: it builds the exact
 * `ExperimentInput` shape `cliF0O.ts` already builds for a live attempt,
 * differing only in WHICH slot's template, output root and variant-root
 * map it supplies. `childMain.ts`, `f0c/freezeFamily.ts`, both variant-root
 * verifiers and `coordinator.ts` itself are untouched by this module.
 *
 * A genuine process crash (uncaught exception, OOM, SIGKILL) is, by
 * definition, not something this function can observe or react to in the
 * SAME run — nothing here retries across an invocation boundary. What
 * this module guarantees is the OTHER half: composed-decision gate 1
 * (sequencing) reads the filesystem fresh on every call, so a RESTARTED
 * invocation immediately sees whatever the crash left behind and refuses
 * to proceed past it — recovery is never automatic.
 */
import type { F0IExecutionPlan } from '../f0i/freezeF0I.js';
import type { F0OExecutionPlan } from '../f0o/freezeF0O.js';
import { buildSlotExecutionPlanTemplate } from '../f0w/slotExecutionPlan.js';
import type { StudySlotRegistry } from '../f0w/slotRegistry.js';
import type { SlotEvidenceProbes } from '../f0w/sequencing.js';
import type { OutputRootProbes as SlotOutputRootProbes } from '../artifacts.js';
import { runExperiment, type ChildLauncher, type ExperimentResult } from '../coordinator.js';
import { F0V_STUDY_ROOT } from '../f0v/freezeF0V.js';
import type { StudySlotIdentity } from '../f0v/studyPlanCore.js';
import { runAllTenPreflight, type AllTenPreflightDecision } from './allTenPreflight.js';
import {
  evaluateComposedSlotExecutionDecision,
  type ComposedSlotExecutionDecision,
} from './composedExecutionDecision.js';
import {
  OUTER_SLOT_IDENTITY_VERSION,
  writeOuterSlotIdentity,
  type OuterSlotIdentityRecord,
} from './outerSlotIdentity.js';
import {
  STUDY_RECORD_VERSION,
  writeSlotTransition,
  writeStudyManifest,
  writeStudyTerminal,
  type SlotTransitionEventKind,
} from './studyRecords.js';

export interface StudyExecutorClock {
  readonly nowUtc: () => Date;
}

export interface StudyExecutorInput {
  readonly registry: StudySlotRegistry;
  readonly f0iPlan: F0IExecutionPlan;
  readonly f0oPlan: F0OExecutionPlan;
  readonly executionIntegrationCommit: string;
  readonly candidatePathForSlot: (slotId: string) => string | null;
  readonly studyApprovalPath: string | null;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly currentHead: () => string;
  readonly alreadyConsumed: (authorisationSha256: string) => boolean;
  readonly sequencingProbes: SlotEvidenceProbes;
  readonly outputRootProbes: SlotOutputRootProbes;
  readonly forbiddenOutputRootContainers: readonly string[];
  readonly studyRoot?: string;
  readonly v4Root: string;
  readonly v5Root: string;
  readonly classifierConfigDir: string;
  readonly parentEnv: Readonly<Record<string, string | undefined>>;
  readonly platform: 'posix' | 'win32';
  readonly launcher: ChildLauncher;
  readonly clock: StudyExecutorClock;
}

export interface CompletedSlotOutcome {
  readonly slot: StudySlotIdentity;
  readonly experiment: ExperimentResult;
}

export type StudyExecutionOutcome =
  | {
      readonly status: 'BLOCKED_BEFORE_START';
      readonly preflight: AllTenPreflightDecision & { readonly granted: false };
    }
  | {
      readonly status: 'PAUSED';
      readonly completedSlots: readonly CompletedSlotOutcome[];
      readonly pausedAtSlot: string;
      readonly failedGate: ComposedSlotExecutionDecision & { readonly granted: false };
    }
  | {
      readonly status: 'COMPLETED_ALL_SLOTS';
      readonly completedSlots: readonly CompletedSlotOutcome[];
    };

function variantRootsFor(
  slot: StudySlotIdentity,
  v4Root: string,
  v5Root: string,
): Readonly<Record<string, string>> {
  return slot.variantName === 'PROMPT_V4_CANONICAL'
    ? { PROMPT_V4_CANONICAL: v4Root }
    : { PROMPT_V5_CANONICAL: v5Root };
}

function transitionEventForRefusal(
  decision: ComposedSlotExecutionDecision & { readonly granted: false },
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
 * Runs the whole ten-slot study, from a fresh ("before slot 1") state,
 * once. Never called with `--skip-slot`/`--start-at`/any slot-order
 * override — there is none: the loop always walks `registry.slots` in
 * their own frozen order.
 */
export async function runReplicationStudyExecution(
  input: StudyExecutorInput,
): Promise<StudyExecutionOutcome> {
  const studyRoot = input.studyRoot ?? F0V_STUDY_ROOT;
  const startedAtUtc = input.clock.nowUtc().toISOString();

  const preflight = runAllTenPreflight({
    registry: input.registry,
    candidatePathForSlot: input.candidatePathForSlot,
    studyApprovalPath: input.studyApprovalPath,
    readFile: input.readFile,
    sha256: input.sha256,
    nowUtc: input.clock.nowUtc,
    currentHead: input.currentHead,
    alreadyConsumed: input.alreadyConsumed,
    sequencingProbes: input.sequencingProbes,
    outputRootProbes: input.outputRootProbes,
    forbiddenOutputRootContainers: input.forbiddenOutputRootContainers,
    studyRoot,
  });
  if (!preflight.granted) {
    writeStudyTerminal(studyRoot, {
      recordVersion: STUDY_RECORD_VERSION,
      outcome: 'BLOCKED_BEFORE_START',
      pauseReason: preflight.reason,
      blockingSlotId: null,
      slotsCompleted: 0,
      completedAtUtc: input.clock.nowUtc().toISOString(),
    });
    return { status: 'BLOCKED_BEFORE_START', preflight };
  }

  writeStudyManifest(studyRoot, {
    recordVersion: STUDY_RECORD_VERSION,
    studyId: 'REPLICATION_V4_V5_N5',
    f0vFreezeRawSha256: input.registry.f0vFreezeRawSha256,
    f0vApprovalRecordRawSha256: preflight.approval.f0vApprovalRecordRawSha256,
    f0vPlanSha256: preflight.approval.f0vPlanSha256,
    f0uMethodologyRawSha256: preflight.approval.f0uMethodologyRawSha256,
    executionIntegrationCommit: input.executionIntegrationCommit,
    studyExecutionApprovalSha256: preflight.approvalSha256,
    candidateSet: preflight.slots.map((slot) => ({
      slotId: slot.slotId,
      sequence: slot.sequence,
      candidateAuthorisationSha256: slot.candidateAuthorisationSha256 as string,
    })),
    startedAtUtc,
  });

  const completedSlots: CompletedSlotOutcome[] = [];

  for (const [index, slot] of input.registry.slots.entries()) {
    const ordinal = index + 1;
    const decision = evaluateComposedSlotExecutionDecision({
      targetSlotId: slot.slotId,
      registry: input.registry,
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
      studyRoot,
    });

    if (!decision.granted) {
      writeSlotTransition(studyRoot, ordinal, {
        recordVersion: STUDY_RECORD_VERSION,
        slotId: slot.slotId,
        sequence: slot.sequence,
        event: transitionEventForRefusal(decision),
        detail: `${decision.failedGate}/${decision.refusal}: ${decision.detail}`,
        atUtc: input.clock.nowUtc().toISOString(),
      });
      writeStudyTerminal(studyRoot, {
        recordVersion: STUDY_RECORD_VERSION,
        outcome: 'PAUSED',
        pauseReason: `${decision.failedGate}/${decision.refusal}: ${decision.detail}`,
        blockingSlotId: slot.slotId,
        slotsCompleted: completedSlots.length,
        completedAtUtc: input.clock.nowUtc().toISOString(),
      });
      return { status: 'PAUSED', completedSlots, pausedAtSlot: slot.slotId, failedGate: decision };
    }

    writeSlotTransition(studyRoot, ordinal, {
      recordVersion: STUDY_RECORD_VERSION,
      slotId: slot.slotId,
      sequence: slot.sequence,
      event: 'SLOT_GRANTED',
      detail: `candidate ${decision.authorisationSha256} granted under study approval ${decision.approvalSha256}.`,
      atUtc: input.clock.nowUtc().toISOString(),
    });

    const template = buildSlotExecutionPlanTemplate(slot, input.f0iPlan, input.f0oPlan, studyRoot);
    const identity: OuterSlotIdentityRecord = {
      recordVersion: OUTER_SLOT_IDENTITY_VERSION,
      studyId: 'REPLICATION_V4_V5_N5',
      f0vFreezeRawSha256: decision.approval.f0vFreezeRawSha256,
      f0vApprovalRecordRawSha256: decision.approval.f0vApprovalRecordRawSha256,
      f0vPlanSha256: decision.approval.f0vPlanSha256,
      f0uMethodologyRawSha256: decision.approval.f0uMethodologyRawSha256,
      executionIntegrationCommit: decision.approval.executionIntegrationCommit,
      slotId: slot.slotId,
      sequence: slot.sequence,
      pairNumber: slot.pairNumber,
      variantName: slot.variantName,
      sourceHistoricalAttemptNo: decision.historicalAttemptNo,
      sourceHistoricalFreezeRawSha256: decision.authorisation.sourceHistoricalFreezeRawSha256,
      sourceHistoricalPlanSha256: decision.authorisation.sourceHistoricalPlanSha256,
      runtimeCommit: decision.authorisation.runtimeCommit,
      promptSha256: decision.authorisation.promptSha256,
      candidateAuthorisationSha256: decision.authorisationSha256,
      studyExecutionApprovalSha256: decision.approvalSha256,
      outputRoot: decision.outputRoot,
      consumedAtUtc: input.clock.nowUtc().toISOString(),
    };
    // Write-once, BEFORE runExperiment: a crash between here and the
    // child-manifest write for logical evaluation 1 leaves exactly this
    // record plus (once runExperiment starts) its own authorisation marker
    // — Class B evidence, never silently retried.
    writeOuterSlotIdentity(identity);

    const experiment = await runExperiment({
      plan: template.plan,
      freezePath: template.freezePath,
      outputRoot: template.outputRoot,
      attemptNo: template.attemptNo,
      authorisation: decision.authorisation,
      authorisationSha256: decision.authorisationSha256,
      variantRoots: variantRootsFor(slot, input.v4Root, input.v5Root),
      classifierConfigDir: input.classifierConfigDir,
      parentEnv: input.parentEnv,
      platform: input.platform,
      launcher: input.launcher,
      clock: input.clock,
    });

    // Whatever the outcome, `runExperiment` always wrote a terminal
    // record (EXPERIMENT_COMPLETION or EXPERIMENT_STOP) before returning
    // — the slot is durably closed, Class C, and the loop advances.
    writeSlotTransition(studyRoot, ordinal, {
      recordVersion: STUDY_RECORD_VERSION,
      slotId: slot.slotId,
      sequence: slot.sequence,
      event: 'SLOT_COMPLETED_CLASS_C',
      detail: `experiment status ${experiment.status}; ${experiment.evaluationsEndedWithoutStop} of ${experiment.evaluationsStarted} evaluations ended without a stop.`,
      atUtc: input.clock.nowUtc().toISOString(),
    });
    completedSlots.push({ slot, experiment });
  }

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

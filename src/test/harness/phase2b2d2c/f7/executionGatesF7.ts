/**
 * PHASE 2B-2D2C-F7 — THE F6 RESTART EXECUTION GATES.
 *
 * The F3 all-five preflight (`f3/allFivePreflightF3.ts`) and composed slot
 * decision (`f3/composedExecutionDecisionF3.ts`), rebuilt over the F6 slots
 * and the F7 authority, with the SAME gate order, short-circuit rule and
 * refusal vocabulary:
 *
 *   ALL-FIVE PREFLIGHT — all five candidates, the ONE study approval, all five
 *   output roots and "before slot 1", together, before anything is touched.
 *
 *   COMPOSED DECISION, per slot, live —
 *     1. SEQUENCING (F3's gate, reused verbatim over the F6 slots),
 *     2. SLOT_AUTHORISATION (`slotAuthorisationF7.ts`),
 *     3. STUDY_APPROVAL (`studyExecutionApprovalF7.ts`),
 *     4. APPROVAL_CANDIDATE_MISMATCH — the approval names this exact candidate
 *        hash AND byte length, both from the SAME single read,
 *     5. EXECUTION_BUILD — candidate build == approval build == HEAD,
 *     6. OUTPUT_ROOT (`f0w/outputRootReadiness.ts`, reused verbatim).
 *
 * Only the authority-specific evaluators are new; sequencing, evidence
 * classification and output-root validation are the proven F0W/F3 ones.
 *
 * PURE aside from the injected probes. No network, no database, no clock, no
 * child process, no provider.
 */
import type { OutputRootProbes as SlotOutputRootProbes } from '../artifacts.js';
import { validateSlotOutputRootForExecution } from '../f0w/outputRootReadiness.js';
import { classifySlotEvidence, type SlotEvidenceProbes } from '../f0w/sequencing.js';
import type { F2SlotIdentity } from '../f2/studyPlanCoreF2.js';
import { evaluateF3SequencingGate } from '../f3/sequencingF3.js';
import { F6_SLOTS, resolveF6Slot } from '../f6/studyPlanCoreF6.js';
import {
  evaluateF7SlotExecutionLock,
  f7OutputRootOf,
  type F7SlotExecutionAuthorisation,
} from './slotAuthorisationF7.js';
import {
  evaluateF7StudyExecutionApproval,
  type F7StudyExecutionApproval,
  type F7StudyExecutionApprovalRefusal,
} from './studyExecutionApprovalF7.js';

/** The five frozen F6 slots and the model id the approved freeze names. */
export interface F7SlotRegistry {
  readonly slots: readonly F2SlotIdentity[];
  readonly requestedModelId: string;
  resolveSlot(slotId: string): F2SlotIdentity;
}

export function f7SlotRegistryOf(requestedModelId: string): F7SlotRegistry {
  return { slots: F6_SLOTS, requestedModelId, resolveSlot: resolveF6Slot };
}

interface F7GateProbes {
  readonly registry: F7SlotRegistry;
  readonly studyApprovalPath: string | null;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly nowUtc: () => Date;
  readonly currentHead: () => string;
  readonly alreadyConsumed: (authorisationSha256: string, outputRoot: string) => boolean;
  readonly sequencingProbes: SlotEvidenceProbes;
  readonly outputRootProbes: SlotOutputRootProbes;
  readonly forbiddenOutputRootContainers: readonly string[];
}

// ---------------------------------------------------------------------------
// All-five preflight.
// ---------------------------------------------------------------------------

export interface F7PreflightSlotResult {
  readonly slotId: string;
  readonly sequence: number;
  readonly outputRoot: string;
  readonly candidateGranted: boolean;
  readonly candidateAuthorisationSha256: string | null;
  readonly candidateAuthorisationBytes: number | null;
  readonly outputRootValid: boolean;
  readonly listedInApproval: boolean;
  readonly hasNoPriorEvidence: boolean;
  readonly studyApprovalRefusal: F7StudyExecutionApprovalRefusal | null;
  readonly problems: readonly string[];
}

export interface F7AllFivePreflightInput extends F7GateProbes {
  readonly candidatePathForSlot: (slotId: string) => string | null;
}

export type F7AllFivePreflightDecision =
  | {
      readonly granted: true;
      readonly approval: F7StudyExecutionApproval;
      readonly approvalSha256: string;
      readonly slots: readonly F7PreflightSlotResult[];
    }
  | {
      readonly granted: false;
      readonly reason: string;
      readonly slots: readonly F7PreflightSlotResult[];
    };

export function runF7AllFivePreflight(input: F7AllFivePreflightInput): F7AllFivePreflightDecision {
  const studyApproval = evaluateF7StudyExecutionApproval({
    approvalPath: input.studyApprovalPath,
    readFile: input.readFile,
    sha256: input.sha256,
    nowUtc: input.nowUtc,
    currentHead: input.currentHead,
    slots: input.registry.slots,
  });

  const slotResults: F7PreflightSlotResult[] = input.registry.slots.map((slot) => {
    const problems: string[] = [];
    const outputRoot = f7OutputRootOf(slot);
    const lock = evaluateF7SlotExecutionLock({
      authorisationPath: input.candidatePathForSlot(slot.slotId),
      expected: { slotId: slot.slotId, outputRoot },
      readFile: input.readFile,
      sha256: input.sha256,
      alreadyConsumed: input.alreadyConsumed,
      nowUtc: input.nowUtc,
      currentHead: input.currentHead,
      expectedRequestedModelId: input.registry.requestedModelId,
      resolveSlot: (slotId) => input.registry.resolveSlot(slotId),
    });
    if (!lock.granted) problems.push(`candidate: ${lock.refusal} — ${lock.detail}`);

    const outputRootDecision = validateSlotOutputRootForExecution(
      outputRoot,
      input.forbiddenOutputRootContainers,
      input.outputRootProbes,
    );
    if (!outputRootDecision.ok) {
      problems.push(`output root: ${outputRootDecision.refusal} — ${outputRootDecision.detail}`);
    }

    let listedInApproval = false;
    if (studyApproval.granted && lock.granted) {
      const entry = studyApproval.approval.slots.find((e) => e.slotId === slot.slotId);
      if (entry === undefined || entry.candidateAuthorisationSha256 !== lock.authorisationSha256) {
        problems.push('the study approval does not list this exact candidate for this slot.');
      } else if (entry.candidateAuthorisationBytes !== lock.authorisationBytes) {
        problems.push(
          `APPROVAL_CANDIDATE_BYTES_MISMATCH: the study approval lists byte length ` +
            `${entry.candidateAuthorisationBytes}; the candidate file read as ${lock.authorisationBytes} bytes.`,
        );
      } else {
        listedInApproval = true;
      }
    } else if (!studyApproval.granted) {
      problems.push(`study approval: ${studyApproval.refusal} — ${studyApproval.detail}`);
    }

    const evidence = classifySlotEvidence(outputRoot, input.sequencingProbes);
    const hasNoPriorEvidence = evidence.disposition === 'NO_EVIDENCE';
    if (!hasNoPriorEvidence) {
      problems.push(
        `sequencing: slot already holds evidence (${evidence.disposition}) — the study is not "before slot 1".`,
      );
    }

    return {
      slotId: slot.slotId,
      sequence: slot.sequence,
      outputRoot,
      candidateGranted: lock.granted,
      candidateAuthorisationSha256: lock.granted ? lock.authorisationSha256 : null,
      candidateAuthorisationBytes: lock.granted ? lock.authorisationBytes : null,
      outputRootValid: outputRootDecision.ok,
      listedInApproval,
      hasNoPriorEvidence,
      studyApprovalRefusal: studyApproval.granted ? null : studyApproval.refusal,
      problems,
    };
  });

  const failing = slotResults.filter((result) => result.problems.length > 0);
  if (!studyApproval.granted || failing.length > 0) {
    return {
      granted: false,
      reason: !studyApproval.granted
        ? `study approval refused: ${studyApproval.refusal}`
        : `${failing.length} of ${slotResults.length} slots failed preflight.`,
      slots: slotResults,
    };
  }
  return {
    granted: true,
    approval: studyApproval.approval,
    approvalSha256: studyApproval.approvalSha256,
    slots: slotResults,
  };
}

// ---------------------------------------------------------------------------
// The composed per-slot decision.
// ---------------------------------------------------------------------------

export type F7ComposedGateName =
  | 'SEQUENCING'
  | 'SLOT_AUTHORISATION'
  | 'STUDY_APPROVAL'
  | 'APPROVAL_CANDIDATE_MISMATCH'
  | 'EXECUTION_BUILD'
  | 'OUTPUT_ROOT';

export interface F7ComposedSlotExecutionGrant {
  readonly granted: true;
  readonly slot: F2SlotIdentity;
  readonly authorisation: F7SlotExecutionAuthorisation;
  readonly authorisationSha256: string;
  readonly authorisationBytes: number;
  readonly approval: F7StudyExecutionApproval;
  readonly approvalSha256: string;
  readonly outputRoot: string;
  readonly executionBuildCommit: string;
}

export interface F7ComposedSlotExecutionRefusal {
  readonly granted: false;
  readonly failedGate: F7ComposedGateName;
  readonly refusal: string;
  readonly detail: string;
}

export type F7ComposedSlotExecutionDecision =
  F7ComposedSlotExecutionGrant | F7ComposedSlotExecutionRefusal;

export interface F7ComposedSlotExecutionInput extends F7GateProbes {
  readonly targetSlotId: string;
  readonly authorisationPath: string | null;
}

export function evaluateF7ComposedSlotExecutionDecision(
  input: F7ComposedSlotExecutionInput,
): F7ComposedSlotExecutionDecision {
  const refused = (
    failedGate: F7ComposedGateName,
    refusal: string,
    detail: string,
  ): F7ComposedSlotExecutionRefusal => ({ granted: false, failedGate, refusal, detail });

  // Gate 1: sequencing.
  const sequencing = evaluateF3SequencingGate(
    input.targetSlotId,
    f7OutputRootOf,
    input.sequencingProbes,
    input.registry.slots,
  );
  if (!sequencing.eligible) {
    return refused('SEQUENCING', sequencing.refusal, sequencing.detail);
  }
  const slot = sequencing.slot;
  const expectedOutputRoot = f7OutputRootOf(slot);

  // Gate 2: the per-slot candidate, evaluated LIVE.
  const slotLock = evaluateF7SlotExecutionLock({
    authorisationPath: input.authorisationPath,
    expected: { slotId: slot.slotId, outputRoot: expectedOutputRoot },
    readFile: input.readFile,
    sha256: input.sha256,
    alreadyConsumed: input.alreadyConsumed,
    nowUtc: input.nowUtc,
    currentHead: input.currentHead,
    expectedRequestedModelId: input.registry.requestedModelId,
    resolveSlot: (slotId) => input.registry.resolveSlot(slotId),
  });
  if (!slotLock.granted) {
    return refused('SLOT_AUTHORISATION', slotLock.refusal, slotLock.detail);
  }

  // Gate 3: the study-level approval, current and issued for this build.
  const studyApproval = evaluateF7StudyExecutionApproval({
    approvalPath: input.studyApprovalPath,
    readFile: input.readFile,
    sha256: input.sha256,
    nowUtc: input.nowUtc,
    currentHead: input.currentHead,
    slots: input.registry.slots,
  });
  if (!studyApproval.granted) {
    return refused('STUDY_APPROVAL', studyApproval.refusal, studyApproval.detail);
  }

  // Gate 4: the approval names this exact candidate hash and byte length.
  const entry = studyApproval.approval.slots.find((e) => e.slotId === slot.slotId);
  if (entry === undefined || entry.candidateAuthorisationSha256 !== slotLock.authorisationSha256) {
    return refused(
      'APPROVAL_CANDIDATE_MISMATCH',
      'APPROVAL_DOES_NOT_LIST_THIS_CANDIDATE',
      `the study approval does not name candidate ${slotLock.authorisationSha256} for slot ${slot.slotId}.`,
    );
  }
  if (entry.candidateAuthorisationBytes !== slotLock.authorisationBytes) {
    return refused(
      'APPROVAL_CANDIDATE_MISMATCH',
      'APPROVAL_CANDIDATE_BYTES_MISMATCH',
      `the study approval names byte length ${entry.candidateAuthorisationBytes} for slot ${slot.slotId}; ` +
        `the candidate file read as ${slotLock.authorisationBytes} bytes.`,
    );
  }

  // Gate 5: candidate build, approval build and HEAD are one value.
  const head = input.currentHead();
  const candidateBuild = slotLock.authorisation.executionBuildCommit;
  const approvalBuild = studyApproval.approval.executionBuildCommit;
  if (candidateBuild !== approvalBuild || candidateBuild !== head) {
    return refused(
      'EXECUTION_BUILD',
      'EXECUTION_BUILD_DISAGREEMENT',
      `the candidate binds build ${candidateBuild}, the study approval binds ${approvalBuild}, and the checked-out HEAD is ${head}.`,
    );
  }

  // Gate 6: the slot's own output root.
  const outputRootDecision = validateSlotOutputRootForExecution(
    expectedOutputRoot,
    input.forbiddenOutputRootContainers,
    input.outputRootProbes,
  );
  if (!outputRootDecision.ok) {
    return refused('OUTPUT_ROOT', outputRootDecision.refusal, outputRootDecision.detail);
  }

  return {
    granted: true,
    slot,
    authorisation: slotLock.authorisation,
    authorisationSha256: slotLock.authorisationSha256,
    authorisationBytes: slotLock.authorisationBytes,
    approval: studyApproval.approval,
    approvalSha256: studyApproval.approvalSha256,
    outputRoot: outputRootDecision.outputRoot,
    executionBuildCommit: head,
  };
}

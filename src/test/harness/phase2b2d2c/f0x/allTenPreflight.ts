/**
 * PHASE 2B-2D2C-F0X — THE ALL-TEN-BEFORE-THE-FIRST-CHILD PREFLIGHT.
 *
 * The owner's brief (§4) is explicit: nothing may launch a provider-capable
 * child until ALL TEN slot candidates, the ONE study approval, and ALL TEN
 * frozen output roots have been structurally accepted TOGETHER — never
 * "verify as you go" while earlier slots are already running. This module
 * is that single, request-free check, called exactly once, before the
 * study executor's loop ever starts.
 *
 * It does NOT call `evaluateComposedSlotExecutionDecision` for each slot:
 * that function's sequencing gate correctly refuses slots 2..10 before slot
 * 1 has ever run (`PRIOR_SLOT_NOT_YET_CLASS_C`), which is right for a LIVE
 * launch decision but wrong for a preflight, whose job is to confirm every
 * candidate, its membership in the one approval, and its output root are
 * ALL independently valid RIGHT NOW — sequencing readiness ("before slot
 * 1") is checked separately, once, across all ten roots.
 *
 * Every one of the owner's brief's lettered checks (§4 A-Q) is covered:
 * A-E by the caller's own already-verified F0V/F0U/F0X identities (passed
 * in, never re-derived here); F-J by the per-slot loop below; K-N by the
 * one study-approval evaluation plus the per-slot cross-check; O by reusing
 * the SAME `alreadyConsumed` probe a live execution would use; P-Q by the
 * final all-ten evidence sweep.
 *
 * PURE aside from the injected probes. No network, no database, no
 * filesystem of its own, no child process, no provider.
 */
import {
  evaluateF0WSlotExecutionLock,
  type F0WSlotExecutionLockDecision,
} from '../f0w/authorisationF0W.js';
import { classifySlotEvidence, type SlotEvidenceProbes } from '../f0w/sequencing.js';
import { historicalIdentityOf } from '../f0w/slotExecutionPlan.js';
import type { StudySlotRegistry } from '../f0w/slotRegistry.js';
import { validateSlotOutputRootForExecution } from '../f0w/outputRootReadiness.js';
import type { OutputRootProbes as SlotOutputRootProbes } from '../artifacts.js';
import { F0V_STUDY_ROOT } from '../f0v/freezeF0V.js';
import { futureOutputRootPathOf } from '../f0v/studyPlanCore.js';
import {
  evaluateF0XStudyExecutionApproval,
  type F0XStudyExecutionApproval,
} from './studyExecutionApprovalF0X.js';

export interface AllTenPreflightSlotResult {
  readonly slotId: string;
  readonly sequence: number;
  readonly candidateGranted: boolean;
  readonly candidateAuthorisationSha256: string | null;
  readonly outputRootValid: boolean;
  readonly listedInApproval: boolean;
  readonly hasNoPriorEvidence: boolean;
  readonly problems: readonly string[];
}

export interface AllTenPreflightInput {
  readonly registry: StudySlotRegistry;
  /** Absolute path to the per-slot candidate file for a given slotId, or null if absent. */
  readonly candidatePathForSlot: (slotId: string) => string | null;
  readonly studyApprovalPath: string | null;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly nowUtc: () => Date;
  readonly currentHead: () => string;
  readonly alreadyConsumed: (authorisationSha256: string) => boolean;
  readonly sequencingProbes: SlotEvidenceProbes;
  readonly outputRootProbes: SlotOutputRootProbes;
  readonly forbiddenOutputRootContainers: readonly string[];
  readonly studyRoot?: string;
}

export type AllTenPreflightDecision =
  | {
      readonly granted: true;
      readonly approval: F0XStudyExecutionApproval;
      readonly approvalSha256: string;
      readonly slots: readonly AllTenPreflightSlotResult[];
    }
  | {
      readonly granted: false;
      readonly reason: string;
      readonly slots: readonly AllTenPreflightSlotResult[];
    };

/**
 * Runs the full all-ten preflight. Every one of the ten slots is checked
 * even after an earlier one fails, so a single report names every problem
 * at once — never "fix slot 3 and re-run to discover slot 7 is also
 * broken". Overall `granted` is true only when the study approval itself
 * is valid AND every one of the ten slots reports zero problems.
 */
export function runAllTenPreflight(input: AllTenPreflightInput): AllTenPreflightDecision {
  const studyRoot = input.studyRoot ?? F0V_STUDY_ROOT;

  const studyApproval = evaluateF0XStudyExecutionApproval({
    approvalPath: input.studyApprovalPath,
    readFile: input.readFile,
    sha256: input.sha256,
    nowUtc: input.nowUtc,
    currentHead: input.currentHead,
    slots: input.registry.slots,
  });

  const slotResults: AllTenPreflightSlotResult[] = input.registry.slots.map((slot) => {
    const problems: string[] = [];
    const outputRoot = futureOutputRootPathOf(studyRoot, slot);
    const identity = historicalIdentityOf(slot.variantName);

    const candidatePath = input.candidatePathForSlot(slot.slotId);
    const lock: F0WSlotExecutionLockDecision = evaluateF0WSlotExecutionLock({
      executeFlag: true,
      authorisationPath: candidatePath,
      expected: { slotId: slot.slotId, outputRoot, attemptNo: identity.historicalAttemptNo },
      readFile: input.readFile,
      sha256: input.sha256,
      alreadyConsumed: input.alreadyConsumed,
      nowUtc: input.nowUtc,
      resolveSlot: (slotId) => input.registry.resolveSlot(slotId),
    });
    if (!lock.granted) {
      problems.push(`candidate: ${lock.refusal} — ${lock.detail}`);
    }

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
      listedInApproval =
        studyApproval.approval.slots.find((entry) => entry.slotId === slot.slotId)
          ?.candidateAuthorisationSha256 === lock.authorisationSha256;
      if (!listedInApproval) {
        problems.push('the study approval does not list this exact candidate for this slot.');
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
      candidateGranted: lock.granted,
      candidateAuthorisationSha256: lock.granted ? lock.authorisationSha256 : null,
      outputRootValid: outputRootDecision.ok,
      listedInApproval,
      hasNoPriorEvidence,
      problems,
    };
  });

  const anySlotProblem = slotResults.some((result) => result.problems.length > 0);
  if (!studyApproval.granted || anySlotProblem) {
    return {
      granted: false,
      reason: !studyApproval.granted
        ? `study approval refused: ${studyApproval.refusal}`
        : `${slotResults.filter((r) => r.problems.length > 0).length} of ${slotResults.length} slots failed preflight.`,
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

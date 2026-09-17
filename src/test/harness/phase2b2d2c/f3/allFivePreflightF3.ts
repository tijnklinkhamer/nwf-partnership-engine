/**
 * PHASE 2B-2D2C-F3 — THE ALL-FIVE-BEFORE-THE-FIRST-CHILD PREFLIGHT.
 *
 * The F0X analogue (`f0x/allTenPreflight.ts`), rebuilt over the approved F2
 * study. Nothing may launch a provider-capable child until ALL FIVE slot
 * candidates, the ONE study approval, and ALL FIVE frozen output roots have
 * been structurally accepted TOGETHER — never "verify as you go" while an
 * earlier slot is already running.
 *
 * Like its ancestor, it does NOT call the composed per-slot decision for
 * each slot: that function's sequencing gate correctly refuses slots 2..5
 * before slot 1 has ever run (`PRIOR_SLOT_NOT_YET_CLASS_C`), which is right
 * for a LIVE launch decision but wrong for a preflight, whose job is to
 * confirm every candidate, its membership in the one approval, and its
 * output root are ALL independently valid right now. "Before slot 1" is
 * checked separately, once, across all five roots.
 *
 * Every slot is checked even after an earlier one fails, so one report names
 * every problem at once. The study approval is evaluated FIRST and its
 * refusal is recorded against every slot, which is what makes
 * `studyApprovalPath: null` report, per slot, exactly the fact the owner
 * asked to see: the candidates alone authorise nothing.
 *
 * PURE aside from the injected probes. No network, no database, no
 * filesystem of its own, no child process, no provider.
 */
import { classifySlotEvidence, type SlotEvidenceProbes } from '../f0w/sequencing.js';
import { validateSlotOutputRootForExecution } from '../f0w/outputRootReadiness.js';
import type { OutputRootProbes as SlotOutputRootProbes } from '../artifacts.js';
import { F2_STUDY_ROOT } from '../f2/freezeF2.js';
import { f2OutputRootPathOf } from '../f2/studyPlanCoreF2.js';
import {
  evaluateF3SlotExecutionLock,
  type F3SlotExecutionLockDecision,
} from './authorisationF3.js';
import type { F3SlotRegistry } from './slotRegistryF3.js';
import {
  evaluateF3StudyExecutionApproval,
  type F3StudyExecutionApproval,
  type F3StudyExecutionApprovalRefusal,
} from './studyExecutionApprovalF3.js';

export interface F3PreflightSlotResult {
  readonly slotId: string;
  readonly sequence: number;
  readonly outputRoot: string;
  readonly candidateGranted: boolean;
  readonly candidateAuthorisationSha256: string | null;
  readonly candidateAuthorisationBytes: number | null;
  readonly outputRootValid: boolean;
  readonly listedInApproval: boolean;
  readonly hasNoPriorEvidence: boolean;
  /** The study-approval gate's own refusal for this slot, or null when the approval granted. */
  readonly studyApprovalRefusal: F3StudyExecutionApprovalRefusal | null;
  readonly problems: readonly string[];
}

export interface F3AllFivePreflightInput {
  readonly registry: F3SlotRegistry;
  /** Absolute path to the per-slot candidate file for a given slotId, or null if absent. */
  readonly candidatePathForSlot: (slotId: string) => string | null;
  readonly studyApprovalPath: string | null;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly nowUtc: () => Date;
  readonly currentHead: () => string;
  readonly alreadyConsumed: (authorisationSha256: string, outputRoot: string) => boolean;
  readonly sequencingProbes: SlotEvidenceProbes;
  readonly outputRootProbes: SlotOutputRootProbes;
  readonly forbiddenOutputRootContainers: readonly string[];
  readonly studyRoot?: string;
}

export type F3AllFivePreflightDecision =
  | {
      readonly granted: true;
      readonly approval: F3StudyExecutionApproval;
      readonly approvalSha256: string;
      readonly slots: readonly F3PreflightSlotResult[];
    }
  | {
      readonly granted: false;
      readonly reason: string;
      readonly slots: readonly F3PreflightSlotResult[];
    };

/**
 * Runs the full all-five preflight. Overall `granted` is true only when the
 * study approval itself is valid AND every one of the five slots reports
 * zero problems.
 */
export function runF3AllFivePreflight(input: F3AllFivePreflightInput): F3AllFivePreflightDecision {
  const studyRoot = input.studyRoot ?? F2_STUDY_ROOT;

  const studyApproval = evaluateF3StudyExecutionApproval({
    approvalPath: input.studyApprovalPath,
    readFile: input.readFile,
    sha256: input.sha256,
    nowUtc: input.nowUtc,
    currentHead: input.currentHead,
    slots: input.registry.slots,
  });

  const slotResults: F3PreflightSlotResult[] = input.registry.slots.map((slot) => {
    const problems: string[] = [];
    const outputRoot = f2OutputRootPathOf(studyRoot, slot);

    const lock: F3SlotExecutionLockDecision = evaluateF3SlotExecutionLock({
      executeFlag: true,
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
      const entry = studyApproval.approval.slots.find(
        (slotEntry) => slotEntry.slotId === slot.slotId,
      );
      if (entry === undefined || entry.candidateAuthorisationSha256 !== lock.authorisationSha256) {
        problems.push('the study approval does not list this exact candidate for this slot.');
      } else if (entry.candidateAuthorisationBytes !== lock.authorisationBytes) {
        problems.push(
          `APPROVAL_CANDIDATE_BYTES_MISMATCH: the study approval lists byte length ` +
            `${entry.candidateAuthorisationBytes} for this slot's candidate; the candidate file ` +
            `actually read as ${lock.authorisationBytes} bytes.`,
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

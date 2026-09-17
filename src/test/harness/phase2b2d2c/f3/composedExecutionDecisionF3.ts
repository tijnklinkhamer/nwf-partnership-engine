/**
 * PHASE 2B-2D2C-F3 — THE COMPOSED FINAL-V6 SLOT-EXECUTION DECISION.
 *
 * The F0X composed decision (`f0x/composedExecutionDecision.ts`), rebuilt
 * over the approved F2 study, with the SAME gate order, the SAME
 * short-circuit-on-first-refusal rule and the SAME refusal vocabulary. No
 * F0X gate is weakened; one is added (gate 5).
 *
 *   1. SEQUENCING — every prior frozen slot is Class C and durably closed,
 *      and this slot itself holds no evidence yet (`sequencingF3.ts`, which
 *      reuses F0W's own evidence walk verbatim).
 *   2. SLOT_AUTHORISATION — a valid, current, unconsumed per-slot candidate
 *      naming exactly this slot, and binding the build that is running right
 *      now (`authorisationF3.ts`).
 *   3. STUDY_APPROVAL — a valid, current study-level approval issued for
 *      that same build (`studyExecutionApprovalF3.ts`). WITH NO APPROVAL ON
 *      DISK THIS GATE REFUSES, which is exactly why five materialised
 *      candidates cannot, by themselves, execute anything.
 *   4. APPROVAL_CANDIDATE_MISMATCH — the approval's own entry for this slot
 *      names the EXACT candidate hash gate 2 granted AND the EXACT byte
 *      length gate 2 read it at. Both values come from the SAME single read,
 *      so there is no TOCTOU split.
 *   5. EXECUTION_BUILD — the candidate's build, the approval's build and the
 *      actually checked-out HEAD are all one value. Gates 2 and 3 each
 *      already compare their own document against HEAD; this gate closes the
 *      remaining pair, so a candidate and an approval naming two DIFFERENT
 *      builds can never both be current at once.
 *   6. OUTPUT_ROOT — this slot's own frozen output root already exists, is
 *      real, symlink-free, outside every forbidden container, and is the ONE
 *      it appears at (`f0w/outputRootReadiness.ts`, reused verbatim).
 *
 * This module re-implements none of the six checks: it calls each exactly
 * once, in this order, and short-circuits on the first refusal — fail-closed,
 * never partially granted.
 *
 * PURE aside from the injected probes. No network, no database, no
 * filesystem of its own, no clock of its own, no child process, no provider.
 */
import { validateSlotOutputRootForExecution } from '../f0w/outputRootReadiness.js';
import type { SlotEvidenceProbes } from '../f0w/sequencing.js';
import type { OutputRootDecision, OutputRootProbes as SlotOutputRootProbes } from '../artifacts.js';
import { F2_STUDY_ROOT } from '../f2/freezeF2.js';
import { f2OutputRootPathOf, type F2SlotIdentity } from '../f2/studyPlanCoreF2.js';
import {
  evaluateF3SlotExecutionLock,
  type F3SlotExecutionAuthorisation,
  type F3SlotExecutionLockDecision,
} from './authorisationF3.js';
import { evaluateF3SequencingGate, type F3SequencingDecision } from './sequencingF3.js';
import type { F3SlotRegistry } from './slotRegistryF3.js';
import {
  evaluateF3StudyExecutionApproval,
  type F3StudyExecutionApproval,
  type F3StudyExecutionApprovalDecision,
} from './studyExecutionApprovalF3.js';

export type F3ComposedGateName =
  | 'SEQUENCING'
  | 'SLOT_AUTHORISATION'
  | 'STUDY_APPROVAL'
  | 'APPROVAL_CANDIDATE_MISMATCH'
  | 'EXECUTION_BUILD'
  | 'OUTPUT_ROOT';

export type F3ApprovalCandidateMismatchRefusal =
  'APPROVAL_DOES_NOT_LIST_THIS_CANDIDATE' | 'APPROVAL_CANDIDATE_BYTES_MISMATCH';

export interface F3ComposedSlotExecutionGrant {
  readonly granted: true;
  readonly slot: F2SlotIdentity;
  readonly authorisation: F3SlotExecutionAuthorisation;
  readonly authorisationSha256: string;
  readonly authorisationBytes: number;
  readonly approval: F3StudyExecutionApproval;
  readonly approvalSha256: string;
  readonly outputRoot: string;
  readonly executionBuildCommit: string;
}

export interface F3ComposedSlotExecutionRefusal {
  readonly granted: false;
  readonly failedGate: F3ComposedGateName;
  readonly refusal: string;
  readonly detail: string;
}

export type F3ComposedSlotExecutionDecision =
  F3ComposedSlotExecutionGrant | F3ComposedSlotExecutionRefusal;

export interface F3ComposedSlotExecutionInput {
  readonly targetSlotId: string;
  readonly registry: F3SlotRegistry;
  readonly authorisationPath: string | null;
  readonly studyApprovalPath: string | null;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly nowUtc: () => Date;
  readonly currentHead: () => string;
  readonly alreadyConsumed: (authorisationSha256: string, outputRoot: string) => boolean;
  readonly sequencingProbes: SlotEvidenceProbes;
  readonly outputRootProbes: SlotOutputRootProbes;
  readonly forbiddenOutputRootContainers: readonly string[];
  /** Defaults to the frozen F2 study root; a caller never chooses a different one for a real run. */
  readonly studyRoot?: string;
}

/**
 * Evaluates all six gates for ONE named slot and composes them. Each gate is
 * evaluated exactly once; the first refusal short-circuits the rest (cheaper
 * checks first: sequencing needs only directory listings, before two file
 * reads and a filesystem stat).
 */
export function evaluateF3ComposedSlotExecutionDecision(
  input: F3ComposedSlotExecutionInput,
): F3ComposedSlotExecutionDecision {
  const studyRoot = input.studyRoot ?? F2_STUDY_ROOT;
  const outputRootOfSlot = (slot: F2SlotIdentity): string => f2OutputRootPathOf(studyRoot, slot);

  // Gate 1: sequencing.
  const sequencing: F3SequencingDecision = evaluateF3SequencingGate(
    input.targetSlotId,
    outputRootOfSlot,
    input.sequencingProbes,
    input.registry.slots,
  );
  if (!sequencing.eligible) {
    return {
      granted: false,
      failedGate: 'SEQUENCING',
      refusal: sequencing.refusal,
      detail: sequencing.detail,
    };
  }
  const slot = sequencing.slot;
  const expectedOutputRoot = outputRootOfSlot(slot);

  // Gate 2: per-slot candidate authorisation, evaluated LIVE.
  const slotLock: F3SlotExecutionLockDecision = evaluateF3SlotExecutionLock({
    executeFlag: true,
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
    return {
      granted: false,
      failedGate: 'SLOT_AUTHORISATION',
      refusal: slotLock.refusal,
      detail: slotLock.detail,
    };
  }

  // Gate 3: study-level approval, current and issued for this build.
  const studyApproval: F3StudyExecutionApprovalDecision = evaluateF3StudyExecutionApproval({
    approvalPath: input.studyApprovalPath,
    readFile: input.readFile,
    sha256: input.sha256,
    nowUtc: input.nowUtc,
    currentHead: input.currentHead,
    slots: input.registry.slots,
  });
  if (!studyApproval.granted) {
    return {
      granted: false,
      failedGate: 'STUDY_APPROVAL',
      refusal: studyApproval.refusal,
      detail: studyApproval.detail,
    };
  }

  // Gate 4a: the approval's OWN entry for this slot names the EXACT candidate
  // hash gate 2 just granted — never a different candidate for the same slot,
  // and never a candidate meant for a different slot.
  const approvalEntry = studyApproval.approval.slots.find((entry) => entry.slotId === slot.slotId);
  if (
    approvalEntry === undefined ||
    approvalEntry.candidateAuthorisationSha256 !== slotLock.authorisationSha256
  ) {
    return {
      granted: false,
      failedGate: 'APPROVAL_CANDIDATE_MISMATCH',
      refusal: 'APPROVAL_DOES_NOT_LIST_THIS_CANDIDATE',
      detail: `the study approval does not name candidate ${slotLock.authorisationSha256} for slot ${slot.slotId}.`,
    };
  }
  // Gate 4b: the approval's listed BYTE LENGTH for this exact candidate must
  // also match — never just the hash. Both values come from the ONE buffer
  // `evaluateF3SlotExecutionLock` read, so no second read could observe a
  // different version of the file.
  if (approvalEntry.candidateAuthorisationBytes !== slotLock.authorisationBytes) {
    return {
      granted: false,
      failedGate: 'APPROVAL_CANDIDATE_MISMATCH',
      refusal: 'APPROVAL_CANDIDATE_BYTES_MISMATCH',
      detail:
        `the study approval names candidate ${slotLock.authorisationSha256} for slot ${slot.slotId} ` +
        `with byte length ${approvalEntry.candidateAuthorisationBytes}; the candidate file actually read ` +
        `as ${slotLock.authorisationBytes} bytes.`,
    };
  }

  // Gate 5: candidate build, approval build and checked-out HEAD are ONE
  // value. Gates 2 and 3 each compared their own document against HEAD, so
  // reaching here already implies agreement; this gate states the invariant
  // explicitly rather than leaving it to be re-derived by a reader, and
  // refuses rather than assuming if a future edit ever loosens either gate.
  const head = input.currentHead();
  const candidateBuild = slotLock.authorisation.executionBuildCommit;
  const approvalBuild = studyApproval.approval.executionBuildCommit;
  if (candidateBuild !== approvalBuild || candidateBuild !== head) {
    return {
      granted: false,
      failedGate: 'EXECUTION_BUILD',
      refusal: 'EXECUTION_BUILD_DISAGREEMENT',
      detail:
        `the candidate binds build ${candidateBuild}, the study approval binds ${approvalBuild}, ` +
        `and the checked-out HEAD is ${head}; all three must be one value.`,
    };
  }

  // Gate 6: the slot's own output root exists, is real, symlink-free, and
  // outside every forbidden container.
  const outputRootDecision: OutputRootDecision = validateSlotOutputRootForExecution(
    expectedOutputRoot,
    input.forbiddenOutputRootContainers,
    input.outputRootProbes,
  );
  if (!outputRootDecision.ok) {
    return {
      granted: false,
      failedGate: 'OUTPUT_ROOT',
      refusal: outputRootDecision.refusal,
      detail: outputRootDecision.detail,
    };
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

/**
 * PHASE 2B-2D2C-F0X — THE COMPOSED SLOT-EXECUTION DECISION.
 *
 * The owner's brief is explicit: a `GRANTED` from the per-slot lock alone
 * is not sufficient, and neither is a `GRANTED` from the study-level
 * approval alone. A real slot launch requires FOUR independent things to
 * agree, SIMULTANEOUSLY, for the SAME slot:
 *
 *   1. SEQUENCING — every prior frozen slot is Class C and durably closed,
 *      and this slot itself holds no evidence yet (`sequencing.ts`,
 *      already landed in F0W, unmodified).
 *   2. PER-SLOT CANDIDATE — a valid, current, unconsumed per-slot
 *      authorisation naming exactly this slot (`authorisationF0W.ts`'s
 *      `evaluateF0WSlotExecutionLock`, unmodified, called LIVE with
 *      `executeFlag: true` for the first time anywhere in this lineage —
 *      F0W only ever called its verify-only wrapper).
 *   3. STUDY APPROVAL — a valid, current study-level approval whose own
 *      slot entry names EXACTLY the per-slot candidate's own hash
 *      (`studyExecutionApprovalF0X.ts`'s `evaluateF0XStudyExecutionApproval`
 *      plus `approvalListsCandidate` from F0W, unmodified), issued for the
 *      BUILD that is running right now.
 *   4. OUTPUT ROOT — this slot's own frozen output root already exists,
 *      is real, symlink-free, outside every forbidden container, and is
 *      the ONE it appears at (`outputRootReadiness.ts`'s
 *      `validateSlotOutputRootForExecution`, unmodified).
 *
 * This module does not re-implement any of the four checks: it calls each
 * exactly once, in this order, and short-circuits on the first refusal —
 * fail-closed, never partially granted. It writes nothing, launches
 * nothing and never returns `granted: true` for a slot whose historical
 * variant identity (V4/V5) disagrees between the candidate and the
 * approval, because both individually already refuse that (the candidate
 * via `historicalIdentityOf`, the approval via frozen-slot-order
 * cross-checking) — this module additionally re-confirms the two GRANTED
 * decisions name the identical `slotId` and the identical candidate hash,
 * so a caller can never accidentally pair a slot-4 candidate with a
 * study approval entry meant for slot 7. F0X CORRECTIVE CLOSURE: gate 3
 * additionally requires the approval's own `candidateAuthorisationBytes`
 * for this slot to equal the exact byte length gate 2 read the candidate
 * at — a matching SHA-256 alone is not sufficient, and both values come
 * from the SAME single read (no second file read, no TOCTOU split).
 *
 * PURE aside from the injected probes. No network, no database, no
 * filesystem of its own, no clock of its own, no child process.
 */
import {
  evaluateF0WSlotExecutionLock,
  type F0WSlotExecutionAuthorisation,
  type F0WSlotExecutionLockDecision,
} from '../f0w/authorisationF0W.js';
import { evaluateSequencingGate, type SequencingDecision } from '../f0w/sequencing.js';
import { type StudySlotRegistry } from '../f0w/slotRegistry.js';
import { historicalIdentityOf } from '../f0w/slotExecutionPlan.js';
import { type F0WStudyExecutionApprovalSlotSchema } from '../f0w/studyExecutionApproval.js';
import { validateSlotOutputRootForExecution } from '../f0w/outputRootReadiness.js';
import { F0V_STUDY_ROOT } from '../f0v/freezeF0V.js';
import { futureOutputRootPathOf, type StudySlotIdentity } from '../f0v/studyPlanCore.js';
import type { OutputRootDecision, OutputRootProbes as SlotOutputRootProbes } from '../artifacts.js';
import type { SlotEvidenceProbes } from '../f0w/sequencing.js';
import {
  evaluateF0XStudyExecutionApproval,
  type F0XStudyExecutionApproval,
  type F0XStudyExecutionApprovalDecision,
} from './studyExecutionApprovalF0X.js';
import type { z } from 'zod';

export type ComposedGateName =
  | 'SEQUENCING'
  | 'SLOT_AUTHORISATION'
  | 'STUDY_APPROVAL'
  | 'APPROVAL_CANDIDATE_MISMATCH'
  | 'OUTPUT_ROOT';

/**
 * Refusal codes under the `APPROVAL_CANDIDATE_MISMATCH` gate specifically.
 * `APPROVAL_CANDIDATE_BYTES_MISMATCH` fires when the approval's listed hash
 * DOES match (so a caller who checked only the hash would proceed) but its
 * separately-listed `candidateAuthorisationBytes` does not match the exact
 * byte length gate 2 read the candidate at — never a second, independent
 * read of the file, only the length gate 2 already measured.
 */
export type ApprovalCandidateMismatchRefusal =
  'APPROVAL_DOES_NOT_LIST_THIS_CANDIDATE' | 'APPROVAL_CANDIDATE_BYTES_MISMATCH';

export interface ComposedSlotExecutionGrant {
  readonly granted: true;
  readonly slot: StudySlotIdentity;
  readonly authorisation: F0WSlotExecutionAuthorisation;
  readonly authorisationSha256: string;
  readonly approval: F0XStudyExecutionApproval;
  readonly approvalSha256: string;
  readonly outputRoot: string;
  readonly historicalAttemptNo: 3 | 4;
}

export interface ComposedSlotExecutionRefusal {
  readonly granted: false;
  readonly failedGate: ComposedGateName;
  readonly refusal: string;
  readonly detail: string;
}

export type ComposedSlotExecutionDecision =
  ComposedSlotExecutionGrant | ComposedSlotExecutionRefusal;

export interface ComposedSlotExecutionInput {
  readonly targetSlotId: string;
  readonly registry: StudySlotRegistry;
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
  readonly studyRoot?: string;
}

function outputRootOfSlot(slot: StudySlotIdentity, studyRoot: string): string {
  return futureOutputRootPathOf(studyRoot, slot);
}

/**
 * Evaluates all four gates for ONE named slot and composes them. Each gate
 * is evaluated exactly once; the first refusal short-circuits the rest
 * (cheaper checks first: sequencing needs only directory listings, before
 * two file reads and a filesystem stat).
 */
export function evaluateComposedSlotExecutionDecision(
  input: ComposedSlotExecutionInput,
): ComposedSlotExecutionDecision {
  const studyRoot = input.studyRoot ?? F0V_STUDY_ROOT;

  // Gate 1: sequencing.
  const sequencing: SequencingDecision = evaluateSequencingGate(
    input.targetSlotId,
    (slot) => outputRootOfSlot(slot, studyRoot),
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
  const expectedOutputRoot = outputRootOfSlot(slot, studyRoot);
  const identity = historicalIdentityOf(slot.variantName);

  // Gate 2: per-slot candidate authorisation, evaluated LIVE.
  const slotLock: F0WSlotExecutionLockDecision = evaluateF0WSlotExecutionLock({
    executeFlag: true,
    authorisationPath: input.authorisationPath,
    expected: {
      slotId: slot.slotId,
      outputRoot: expectedOutputRoot,
      attemptNo: identity.historicalAttemptNo,
    },
    readFile: input.readFile,
    sha256: input.sha256,
    alreadyConsumed: input.alreadyConsumed,
    nowUtc: input.nowUtc,
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
  const studyApproval: F0XStudyExecutionApprovalDecision = evaluateF0XStudyExecutionApproval({
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

  // Gate 3a: the approval's OWN entry for this slot must name the EXACT
  // candidate hash gate 2 just granted — never a different candidate for
  // the same slot, and never a candidate meant for a different slot. The
  // same one-line lookup F0W's `approvalListsCandidate` performs, inlined
  // here because that helper is typed against F0W's own (superseded)
  // approval shape, not the F0X-superseding one this module evaluates.
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
  // Gate 3b: the approval's listed BYTE LENGTH for this exact candidate must
  // also match — never just the hash. Both the hash (gate 2) and this length
  // check are read from the ONE buffer `evaluateF0WSlotExecutionLock` read
  // the candidate file into; there is no second, independent read here that
  // could observe a different version of the file (no TOCTOU split).
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

  // Gate 4: the slot's own output root exists, is real, symlink-free, and
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
    approval: studyApproval.approval,
    approvalSha256: studyApproval.approvalSha256,
    outputRoot: outputRootDecision.outputRoot,
    historicalAttemptNo: identity.historicalAttemptNo,
  };
}

/** Re-exported for callers that need the raw slot-entry shape without importing f0w directly. */
export type StudyApprovalSlotEntry = z.infer<typeof F0WStudyExecutionApprovalSlotSchema>;

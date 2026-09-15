/**
 * PHASE 2B-2D2C-F0W — THE FUTURE STUDY-LEVEL EXECUTION-APPROVAL SCHEMA.
 *
 * F0V's `futureAuthorisationModel` (`freezeF0V.ts`, restated by the owner's
 * brief §8) requires ONE owner decision, naming all TEN exact candidate
 * SHA-256s together, before the first replication provider call — never ten
 * separate approvals, which would let a study effectively adapt its stopping
 * point one slot at a time. This module provides the SCHEMA and a
 * VERIFICATION-ONLY candidate check for that future record. It creates
 * nothing: no approval record exists yet, and this module has no code path
 * that writes one, consumes one, or authorises a single slot on its own —
 * the per-slot lock (`authorisationF0W.ts`) is a SEPARATE, additional gate a
 * real execution path would eventually require alongside this one.
 *
 * Every slot listed must match the frozen registry (`slotRegistry.ts`)
 * exactly, in the frozen order — never a caller-supplied order — and all ten
 * candidate hashes and all ten output roots must be pairwise distinct.
 *
 * Pure aside from the injected reader, hasher, clock and slot registry. No
 * network, no database, no filesystem of its own.
 */
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import {
  F0U_METHODOLOGY_RAW_SHA256,
  F0V_APPROVAL_RECORD_RAW_SHA256,
  F0V_STUDY_ROOT,
  PROPOSED_F0V_FREEZE_RAW_SHA256,
  PROPOSED_F0V_PLAN_SHA256,
} from '../f0v/freezeF0V.js';
import {
  F0V_SLOTS,
  F0V_TOTAL_SLOTS,
  futureOutputRootPathOf,
  type StudySlotIdentity,
} from '../f0v/studyPlanCore.js';

export const F0W_STUDY_EXECUTION_APPROVAL_VERSION = 'phase2b-2d2c-f0w-study-execution-approval-v1';

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const UtcInstant = z.iso.datetime({ offset: false });

export const F0WStudyExecutionApprovalSlotSchema = z.strictObject({
  slotId: z.string().min(1),
  sequence: z.int().min(1).max(F0V_TOTAL_SLOTS),
  variantName: z.enum(['PROMPT_V4_CANONICAL', 'PROMPT_V5_CANONICAL']),
  candidateAuthorisationSha256: Sha256,
  candidateAuthorisationBytes: z.int().min(1),
  outputRoot: z.string().min(1),
});

export const F0WStudyExecutionApprovalSchema = z.strictObject({
  approvalVersion: z.literal(F0W_STUDY_EXECUTION_APPROVAL_VERSION),
  scope: z.literal('DEVELOPMENT_ONLY'),
  studyId: z.literal('REPLICATION_V4_V5_N5'),
  f0vFreezeRawSha256: z.literal(PROPOSED_F0V_FREEZE_RAW_SHA256),
  f0vPlanSha256: z.literal(PROPOSED_F0V_PLAN_SHA256),
  f0vApprovalRecordRawSha256: Sha256,
  f0uMethodologyRawSha256: z.literal(F0U_METHODOLOGY_RAW_SHA256),
  slots: z.array(F0WStudyExecutionApprovalSlotSchema).length(F0V_TOTAL_SLOTS),
  issuedAtUtc: UtcInstant,
  validUntilUtc: UtcInstant,
  operatorApprovalStatement: z.string().min(1),
});

export type F0WStudyExecutionApproval = z.infer<typeof F0WStudyExecutionApprovalSchema>;

/** Deterministic from the candidate's OWN listed slots — never from a hand-typed duplicate. */
export function buildF0WStudyExecutionApprovalStatement(
  slots: readonly Pick<
    z.infer<typeof F0WStudyExecutionApprovalSlotSchema>,
    'slotId' | 'candidateAuthorisationSha256'
  >[],
): string {
  const listing = slots
    .map((slot) => `${slot.slotId}=${slot.candidateAuthorisationSha256}`)
    .join(', ');
  return (
    'I APPROVE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF THE V4/V5 N=5 REPLICATION STUDY ' +
    `(STUDY REPLICATION_V4_V5_N5, ${F0V_TOTAL_SLOTS} SLOTS) AGAINST THE APPROVED F0V FREEZE ` +
    `${PROPOSED_F0V_FREEZE_RAW_SHA256} WITH DERIVED PLAN ${PROPOSED_F0V_PLAN_SHA256}, ` +
    `F0V OWNER-APPROVAL RECORD ${F0V_APPROVAL_RECORD_RAW_SHA256 ?? '<NO F0V APPROVAL RECORD IS PINNED; NOTHING IS AUTHORISABLE>'}, ` +
    `F0U METHODOLOGY ${F0U_METHODOLOGY_RAW_SHA256}. ` +
    `THIS APPROVAL NAMES EXACTLY THESE ${F0V_TOTAL_SLOTS} CANDIDATE AUTHORISATIONS, ONE PER SLOT, ` +
    `AND NO OTHER: ${listing}. NO ADAPTIVE STOPPING: NO SLOT MAY BE ADDED, REMOVED OR REPLACED ` +
    'WITHOUT A NEW APPROVAL NAMING ALL TEN HASHES AGAIN.'
  );
}

/**
 * True iff `approval` names EXACTLY `candidateAuthorisationSha256` for
 * `slotId` — the check a future per-slot execution lock would add on top of
 * `authorisationF0W.ts`'s own checks once a study execution approval can
 * exist. This function makes no execution decision itself; it is a pure
 * lookup a caller combines with its own gate.
 */
export function approvalListsCandidate(
  approval: F0WStudyExecutionApproval,
  slotId: string,
  candidateAuthorisationSha256: string,
): boolean {
  const listed = approval.slots.find((slot) => slot.slotId === slotId);
  return (
    listed !== undefined && listed.candidateAuthorisationSha256 === candidateAuthorisationSha256
  );
}

export type F0WStudyExecutionApprovalRefusal =
  | 'APPROVAL_PATH_ABSENT'
  | 'APPROVAL_PATH_NOT_ABSOLUTE'
  | 'APPROVAL_UNREADABLE'
  | 'APPROVAL_MALFORMED'
  | 'FREEZE_APPROVAL_RECORD_MISMATCH'
  | 'APPROVAL_SLOT_ORDER_MISMATCH'
  | 'APPROVAL_SLOT_FIELD_MISMATCH'
  | 'APPROVAL_DUPLICATE_CANDIDATE_HASH'
  | 'APPROVAL_DUPLICATE_OUTPUT_ROOT'
  | 'APPROVAL_STATEMENT_MISMATCH'
  | 'APPROVAL_EXPIRED'
  | 'APPROVAL_NOT_YET_VALID';

export type F0WStudyExecutionApprovalDecision =
  | {
      readonly granted: true;
      readonly approval: F0WStudyExecutionApproval;
      readonly approvalSha256: string;
    }
  | {
      readonly granted: false;
      readonly refusal: F0WStudyExecutionApprovalRefusal;
      readonly detail: string;
    };

export interface F0WStudyExecutionApprovalCandidateInput {
  readonly approvalPath: string | null;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly nowUtc: () => Date;
  readonly slots?: readonly StudySlotIdentity[];
}

/**
 * VERIFICATION ONLY. There is no execution branch here, no consumption
 * marker, and no code path in this module (or anywhere in F0W) that this
 * decision unlocks — it answers exactly one question: "would this exact
 * byte sequence be structurally acceptable as the study-level execution
 * approval, if the owner issued it?"
 */
export function verifyF0WStudyExecutionApprovalCandidate(
  input: F0WStudyExecutionApprovalCandidateInput,
): F0WStudyExecutionApprovalDecision {
  const frozenSlots = input.slots ?? F0V_SLOTS;
  if (input.approvalPath === null) {
    return {
      granted: false,
      refusal: 'APPROVAL_PATH_ABSENT',
      detail: 'an approval path is required.',
    };
  }
  if (!isAbsolute(input.approvalPath)) {
    return {
      granted: false,
      refusal: 'APPROVAL_PATH_NOT_ABSOLUTE',
      detail:
        'the approval path must be absolute; a relative path would depend on the working directory.',
    };
  }
  let bytes: Buffer;
  try {
    bytes = input.readFile(input.approvalPath);
  } catch (error) {
    return {
      granted: false,
      refusal: 'APPROVAL_UNREADABLE',
      detail: `the approval file could not be read (${error instanceof Error ? error.message : String(error)}).`,
    };
  }
  const approvalSha256 = input.sha256(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return {
      granted: false,
      refusal: 'APPROVAL_MALFORMED',
      detail: 'the approval file is not valid JSON.',
    };
  }
  const result = F0WStudyExecutionApprovalSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      granted: false,
      refusal: 'APPROVAL_MALFORMED',
      detail: `the approval does not match the closed study-approval schema at ${first ? first.path.join('.') || '<root>' : '<unknown>'}: ${first?.message ?? 'unknown'}.`,
    };
  }
  const approval = result.data;
  if (
    F0V_APPROVAL_RECORD_RAW_SHA256 === null ||
    approval.f0vApprovalRecordRawSha256 !== F0V_APPROVAL_RECORD_RAW_SHA256
  ) {
    return {
      granted: false,
      refusal: 'FREEZE_APPROVAL_RECORD_MISMATCH',
      detail: `the approval names f0vApprovalRecordRawSha256 ${approval.f0vApprovalRecordRawSha256}; the pinned F0V approval record is ${F0V_APPROVAL_RECORD_RAW_SHA256 ?? '<none pinned>'}.`,
    };
  }
  for (const [index, slot] of approval.slots.entries()) {
    const expected = frozenSlots[index];
    if (
      expected === undefined ||
      slot.sequence !== expected.sequence ||
      slot.slotId !== expected.slotId ||
      slot.variantName !== expected.variantName
    ) {
      return {
        granted: false,
        refusal: 'APPROVAL_SLOT_ORDER_MISMATCH',
        detail: `slots[${index}] does not match the frozen slot at that position.`,
      };
    }
    if (slot.outputRoot !== futureOutputRootPathOf(F0V_STUDY_ROOT, expected)) {
      return {
        granted: false,
        refusal: 'APPROVAL_SLOT_FIELD_MISMATCH',
        detail: `slots[${index}] (${slot.slotId}) names an output root that is not the frozen root for that slot.`,
      };
    }
  }
  const hashes = approval.slots.map((slot) => slot.candidateAuthorisationSha256);
  if (new Set(hashes).size !== hashes.length) {
    return {
      granted: false,
      refusal: 'APPROVAL_DUPLICATE_CANDIDATE_HASH',
      detail: 'two or more slots name the identical candidate authorisation hash.',
    };
  }
  const roots = approval.slots.map((slot) => slot.outputRoot);
  if (new Set(roots).size !== roots.length) {
    return {
      granted: false,
      refusal: 'APPROVAL_DUPLICATE_OUTPUT_ROOT',
      detail: 'two or more slots name the identical output root.',
    };
  }
  const expectedStatement = buildF0WStudyExecutionApprovalStatement(approval.slots);
  if (approval.operatorApprovalStatement !== expectedStatement) {
    return {
      granted: false,
      refusal: 'APPROVAL_STATEMENT_MISMATCH',
      detail:
        'the operator approval statement does not match the one this build derives from the listed slots.',
    };
  }
  const now = input.nowUtc().getTime();
  const issuedAt = Date.parse(approval.issuedAtUtc);
  const validUntil = Date.parse(approval.validUntilUtc);
  if (now < issuedAt) {
    return {
      granted: false,
      refusal: 'APPROVAL_NOT_YET_VALID',
      detail: 'the approval is not yet valid.',
    };
  }
  if (now > validUntil) {
    return {
      granted: false,
      refusal: 'APPROVAL_EXPIRED',
      detail: 'the approval validity window has passed.',
    };
  }
  return { granted: true, approval, approvalSha256 };
}

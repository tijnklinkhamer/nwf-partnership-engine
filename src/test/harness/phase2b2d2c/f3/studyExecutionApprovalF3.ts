/**
 * PHASE 2B-2D2C-F3 — THE STUDY-LEVEL FINAL-V6 EXECUTION-APPROVAL CONTRACT.
 *
 * The exact F0X analogue (`f0x/studyExecutionApprovalF0X.ts`), rebuilt over
 * the approved F2 study: ONE owner decision, naming all five candidates by
 * exact SHA-256 AND exact byte length, in frozen order, bound to one
 * already-committed execution build.
 *
 * THIS MODULE IMPLEMENTS THE SCHEMA AND ITS EVALUATOR. IT CREATES NO
 * APPROVAL. The F3 materialisation task deliberately does NOT produce a real
 * study-level approval file: the absence of one is what keeps real execution
 * impossible while the five candidates sit on disk awaiting owner review.
 * Everything here is exercised with synthetic bytes only.
 *
 * The self-reference problem — a commit cannot know its own SHA while it is
 * being written — is resolved exactly as F0X resolved it:
 * `executionBuildCommit` is never a literal pinned by this build. A real
 * approval supplies whatever exact, already-committed F3 HEAD the
 * materialisation phase named, and the evaluator checks that value,
 * request-free, against the CURRENTLY CHECKED-OUT HEAD through an injected
 * probe.
 *
 * WHY A NEW VERSION RATHER THAN F0X'S. `F0XStudyExecutionApprovalSchema` is
 * pinned to `REPLICATION_V4_V5_N5`, the F0V freeze/plan/methodology hashes
 * and exactly ten slots. None of those is true here. Superseding rather than
 * widening keeps the audited historical schema byte-identical, exactly as
 * every prior version in this lineage did.
 *
 * Pure aside from the injected reader, hasher, clock and HEAD probe. No
 * network, no database, no filesystem of its own.
 */
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { RELIABILITY_SEMANTICS_V2 } from '../constants.js';
import { F0X_RECOVERY_1_STUDY_EXECUTION_APPROVAL_VERSION } from '../f0x/recovery1Authority.js';
import { F0X_STUDY_EXECUTION_APPROVAL_VERSION } from '../f0x/studyExecutionApprovalF0X.js';
import { F0W_STUDY_EXECUTION_APPROVAL_VERSION } from '../f0w/studyExecutionApproval.js';
import {
  F2_APPROVAL_RECORD_RAW_BYTES,
  F2_APPROVAL_RECORD_RAW_SHA256,
  F2_STUDY_ROOT,
  PROPOSED_F2_FREEZE_RAW_BYTES,
  PROPOSED_F2_FREEZE_RAW_SHA256,
  PROPOSED_F2_PLAN_SHA256,
  V6_PROMPT_SHA256,
} from '../f2/freezeF2.js';
import {
  F2_N_REPLICATES,
  F2_SLOTS,
  F2_VARIANT_NAME,
  f2OutputRootPathOf,
  type F2SlotIdentity,
} from '../f2/studyPlanCoreF2.js';
import { F3_STUDY_ID } from './authorisationF3.js';

export const F3_STUDY_EXECUTION_APPROVAL_VERSION = 'phase2b-2d2c-f3-v6-study-execution-approval-v1';

/** Every superseded study-level approval version this evaluator names and refuses BY VALUE. */
export const SUPERSEDED_STUDY_APPROVAL_VERSIONS: readonly string[] = Object.freeze([
  F0W_STUDY_EXECUTION_APPROVAL_VERSION,
  F0X_STUDY_EXECUTION_APPROVAL_VERSION,
  F0X_RECOVERY_1_STUDY_EXECUTION_APPROVAL_VERSION,
]);

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
const UtcInstant = z.iso.datetime({ offset: false });

export const F3StudyApprovalSlotSchema = z.strictObject({
  slotId: z.string().min(1),
  sequence: z.int().min(1).max(F2_N_REPLICATES),
  variantName: z.literal(F2_VARIANT_NAME),
  candidateAuthorisationSha256: Sha256,
  candidateAuthorisationBytes: z.int().positive(),
  outputRoot: z.string().min(1),
});

export type F3StudyApprovalSlotEntry = z.infer<typeof F3StudyApprovalSlotSchema>;

export const F3StudyExecutionApprovalSchema = z.strictObject({
  approvalVersion: z.literal(F3_STUDY_EXECUTION_APPROVAL_VERSION),
  scope: z.literal('DEVELOPMENT_ONLY'),
  studyId: z.literal(F3_STUDY_ID),
  f2FreezeRawSha256: z.literal(PROPOSED_F2_FREEZE_RAW_SHA256),
  f2FreezeRawBytes: z.literal(PROPOSED_F2_FREEZE_RAW_BYTES),
  f2PlanSha256: z.literal(PROPOSED_F2_PLAN_SHA256),
  f2OwnerFreezeApprovalRawSha256: z.literal(F2_APPROVAL_RECORD_RAW_SHA256),
  f2OwnerFreezeApprovalRawBytes: z.literal(F2_APPROVAL_RECORD_RAW_BYTES),
  promptSha256: z.literal(V6_PROMPT_SHA256),
  reliabilitySemanticsVersion: z.literal(RELIABILITY_SEMANTICS_V2),
  /** The exact, already-committed F3 execution-control build this approval authorises. */
  executionBuildCommit: GitSha,
  slots: z.array(F3StudyApprovalSlotSchema).length(F2_N_REPLICATES),
  issuedAtUtc: UtcInstant,
  validUntilUtc: UtcInstant,
  operatorApprovalStatement: z.string().min(1),
});

export type F3StudyExecutionApproval = z.infer<typeof F3StudyExecutionApprovalSchema>;

/**
 * Deterministic from the approval's OWN listed slots and its OWN claimed
 * build — never a hand-typed duplicate. Both the hash AND the byte length of
 * every candidate appear in the statement, so an approval whose prose says
 * one thing and whose structured entries say another cannot exist.
 */
export function buildF3StudyExecutionApprovalStatement(
  executionBuildCommit: string,
  slots: readonly Pick<
    F3StudyApprovalSlotEntry,
    'slotId' | 'candidateAuthorisationSha256' | 'candidateAuthorisationBytes'
  >[],
): string {
  const listing = slots
    .map(
      (slot) =>
        `${slot.slotId}=${slot.candidateAuthorisationSha256}/${slot.candidateAuthorisationBytes}`,
    )
    .join(', ');
  return (
    'I APPROVE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF THE FINAL V6 N=5 DEV STUDY ' +
    `(STUDY ${F3_STUDY_ID}, ${F2_N_REPLICATES} SLOTS, ONE ARM ${F2_VARIANT_NAME}) ` +
    `AGAINST THE OWNER-APPROVED F2 FREEZE ${PROPOSED_F2_FREEZE_RAW_SHA256} (${PROPOSED_F2_FREEZE_RAW_BYTES} BYTES) ` +
    `WITH DERIVED PLAN ${PROPOSED_F2_PLAN_SHA256}, ` +
    `OWNER FREEZE-APPROVAL RECORD ${F2_APPROVAL_RECORD_RAW_SHA256} (${F2_APPROVAL_RECORD_RAW_BYTES} BYTES), ` +
    `V6 PROMPT SHA-256 ${V6_PROMPT_SHA256}, RELIABILITY SEMANTICS ${RELIABILITY_SEMANTICS_V2}, ` +
    `EXECUTED ONLY BY F3 EXECUTION-CONTROL BUILD ${executionBuildCommit}. ` +
    `THIS APPROVAL NAMES EXACTLY THESE ${F2_N_REPLICATES} CANDIDATE AUTHORISATIONS, ONE PER SLOT, ` +
    `AND NO OTHER: ${listing}. ` +
    `NO SLOT MAY BE ADDED, REMOVED, REPLACED OR RERUN WITHOUT A NEW APPROVAL NAMING ALL ${F2_N_REPLICATES} ` +
    'HASHES AND BYTE LENGTHS AGAIN. NO ADAPTIVE STOPPING. NO HOLDOUT. ' +
    'NO PROMPT, GOLD LABEL OR THRESHOLD MODIFICATION. ' +
    `SCORING REMAINS SEPARATELY AUTHORISED AND MAY BEGIN ONLY AFTER ALL ${F2_N_REPLICATES} SLOTS ARE TERMINAL.`
  );
}

export type F3StudyExecutionApprovalRefusal =
  | 'APPROVAL_PATH_ABSENT'
  | 'APPROVAL_PATH_NOT_ABSOLUTE'
  | 'APPROVAL_UNREADABLE'
  | 'SUPERSEDED_APPROVAL_PRESENTED'
  | 'APPROVAL_MALFORMED'
  | 'APPROVAL_SLOT_ORDER_MISMATCH'
  | 'APPROVAL_SLOT_FIELD_MISMATCH'
  | 'APPROVAL_DUPLICATE_CANDIDATE_HASH'
  | 'APPROVAL_DUPLICATE_OUTPUT_ROOT'
  | 'APPROVAL_STATEMENT_MISMATCH'
  | 'APPROVAL_EXPIRED'
  | 'APPROVAL_NOT_YET_VALID'
  | 'EXECUTION_BUILD_MISMATCH';

export type F3StudyExecutionApprovalDecision =
  | {
      readonly granted: true;
      readonly approval: F3StudyExecutionApproval;
      readonly approvalSha256: string;
    }
  | {
      readonly granted: false;
      readonly refusal: F3StudyExecutionApprovalRefusal;
      readonly detail: string;
    };

export interface F3StudyExecutionApprovalInput {
  readonly approvalPath: string | null;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly nowUtc: () => Date;
  /** The ACTUAL currently checked-out HEAD, request-free (production: `git rev-parse HEAD`). */
  readonly currentHead: () => string;
  readonly slots?: readonly F2SlotIdentity[];
}

/**
 * Evaluates a study execution-approval against the closed F3 schema, the
 * frozen slot registry/order, and the ACTUAL checked-out HEAD. A
 * `granted: true` means exactly "this approval is structurally valid,
 * current, and issued for the BUILD that is running right now" — nothing
 * more; it is one of five gates a slot launch requires.
 *
 * A NULL path is the normal state today and refuses with
 * `APPROVAL_PATH_ABSENT`: no real F3 study-level approval exists.
 */
export function evaluateF3StudyExecutionApproval(
  input: F3StudyExecutionApprovalInput,
): F3StudyExecutionApprovalDecision {
  const frozenSlots = input.slots ?? F2_SLOTS;
  if (input.approvalPath === null) {
    return {
      granted: false,
      refusal: 'APPROVAL_PATH_ABSENT',
      detail:
        'an approval path is required; no F3 study-level owner execution approval exists, so nothing is executable.',
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
  const version = (parsed as { approvalVersion?: unknown } | null)?.approvalVersion;
  if (typeof version === 'string' && SUPERSEDED_STUDY_APPROVAL_VERSIONS.includes(version)) {
    return {
      granted: false,
      refusal: 'SUPERSEDED_APPROVAL_PRESENTED',
      detail: `the file is a superseded study approval (${version}); the final-V6 study requires ${F3_STUDY_EXECUTION_APPROVAL_VERSION}.`,
    };
  }
  const result = F3StudyExecutionApprovalSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      granted: false,
      refusal: 'APPROVAL_MALFORMED',
      detail: `the approval does not match the closed F3 study-approval schema at ${first ? first.path.join('.') || '<root>' : '<unknown>'}: ${first?.message ?? 'unknown'}.`,
    };
  }
  const approval = result.data;
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
    if (slot.outputRoot !== f2OutputRootPathOf(F2_STUDY_ROOT, expected)) {
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
  const expectedStatement = buildF3StudyExecutionApprovalStatement(
    approval.executionBuildCommit,
    approval.slots,
  );
  if (approval.operatorApprovalStatement !== expectedStatement) {
    return {
      granted: false,
      refusal: 'APPROVAL_STATEMENT_MISMATCH',
      detail:
        'the operator approval statement does not match the one this build derives from the listed slots and execution build.',
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
  const actualHead = input.currentHead();
  if (approval.executionBuildCommit !== actualHead) {
    return {
      granted: false,
      refusal: 'EXECUTION_BUILD_MISMATCH',
      detail: `the approval authorises execution build ${approval.executionBuildCommit}; the checked-out HEAD is ${actualHead}.`,
    };
  }
  return { granted: true, approval, approvalSha256 };
}

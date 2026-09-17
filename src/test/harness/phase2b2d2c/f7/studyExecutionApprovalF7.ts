/**
 * PHASE 2B-2D2C-F7 — THE STUDY-LEVEL F6 RESTART EXECUTION-APPROVAL CONTRACT.
 *
 * The F3 contract (`f3/studyExecutionApprovalF3.ts`) rebuilt over the F6
 * restart study: ONE owner decision naming all five F6 candidates by exact
 * SHA-256 AND byte length, in frozen order, bound to one already-committed
 * F7 execution build, and to the F6 freeze, plan, owner approval and
 * host-awake contract.
 *
 * THIS MODULE IMPLEMENTS THE SCHEMA AND ITS EVALUATOR. IT CREATES NO
 * APPROVAL. Its absence on disk is what keeps the F6 candidates inert.
 *
 * Every earlier study-approval version (F3's, which F5 ran under, included) is
 * refused by value, and every approval is scanned for any F5 identity before
 * the schema runs.
 *
 * Pure aside from the injected reader, hasher, clock and HEAD probe.
 */
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { RELIABILITY_SEMANTICS_V2 } from '../constants.js';
import { V6_PROMPT_SHA256 } from '../f2/freezeF2.js';
import { F2_N_REPLICATES, F2_VARIANT_NAME, type F2SlotIdentity } from '../f2/studyPlanCoreF2.js';
import {
  F3_STUDY_EXECUTION_APPROVAL_VERSION,
  SUPERSEDED_STUDY_APPROVAL_VERSIONS,
} from '../f3/studyExecutionApprovalF3.js';
import {
  F6_APPROVAL_RECORD_RAW_BYTES,
  F6_APPROVAL_RECORD_RAW_SHA256,
  PROPOSED_F6_FREEZE_RAW_BYTES,
  PROPOSED_F6_FREEZE_RAW_SHA256,
  PROPOSED_F6_PLAN_SHA256,
} from '../f6/freezeF6.js';
import { F6_HOST_AWAKE_CONTRACT_VERSION, LID_OPEN_REQUIRED } from '../f6/hostAwakePreflightF6.js';
import { priorStudyIdentityProblems } from '../f6/priorStudyIdentityF6.js';
import { F6_SLOTS, F6_STUDY_ID } from '../f6/studyPlanCoreF6.js';
import { f7OutputRootOf } from './slotAuthorisationF7.js';

export const F7_STUDY_EXECUTION_APPROVAL_VERSION =
  'phase2b-2d2c-f7-v6-restart-study-execution-approval-v1';

export const F7_SUPERSEDED_STUDY_APPROVAL_VERSIONS: readonly string[] = Object.freeze([
  ...SUPERSEDED_STUDY_APPROVAL_VERSIONS,
  F3_STUDY_EXECUTION_APPROVAL_VERSION,
]);

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
const UtcInstant = z.iso.datetime({ offset: false });

export const F7StudyApprovalSlotSchema = z.strictObject({
  slotId: z.string().min(1),
  sequence: z.int().min(1).max(F2_N_REPLICATES),
  variantName: z.literal(F2_VARIANT_NAME),
  candidateAuthorisationSha256: Sha256,
  candidateAuthorisationBytes: z.int().positive(),
  outputRoot: z.string().min(1),
});

export type F7StudyApprovalSlotEntry = z.infer<typeof F7StudyApprovalSlotSchema>;

export const F7StudyExecutionApprovalSchema = z.strictObject({
  approvalVersion: z.literal(F7_STUDY_EXECUTION_APPROVAL_VERSION),
  scope: z.literal('DEVELOPMENT_ONLY'),
  studyId: z.literal(F6_STUDY_ID),
  f6FreezeRawSha256: z.literal(PROPOSED_F6_FREEZE_RAW_SHA256),
  f6FreezeRawBytes: z.literal(PROPOSED_F6_FREEZE_RAW_BYTES),
  f6PlanSha256: z.literal(PROPOSED_F6_PLAN_SHA256),
  f6OwnerFreezeApprovalRawSha256: z.literal(F6_APPROVAL_RECORD_RAW_SHA256),
  f6OwnerFreezeApprovalRawBytes: z.literal(F6_APPROVAL_RECORD_RAW_BYTES),
  promptSha256: z.literal(V6_PROMPT_SHA256),
  reliabilitySemanticsVersion: z.literal(RELIABILITY_SEMANTICS_V2),
  hostAwakeContractVersion: z.literal(F6_HOST_AWAKE_CONTRACT_VERSION),
  lidRule: z.literal(LID_OPEN_REQUIRED),
  executionBuildCommit: GitSha,
  slots: z.array(F7StudyApprovalSlotSchema).length(F2_N_REPLICATES),
  issuedAtUtc: UtcInstant,
  validUntilUtc: UtcInstant,
  operatorApprovalStatement: z.string().min(1),
});

export type F7StudyExecutionApproval = z.infer<typeof F7StudyExecutionApprovalSchema>;

/** Deterministic from the approval's OWN listed slots and build — never a hand-typed duplicate. */
export function buildF7StudyExecutionApprovalStatement(
  executionBuildCommit: string,
  slots: readonly Pick<
    F7StudyApprovalSlotEntry,
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
    'I APPROVE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF THE FRESH F6 V6 N=5 RESTART DEV STUDY ' +
    `(STUDY ${F6_STUDY_ID}, ${F2_N_REPLICATES} SLOTS, ONE ARM ${F2_VARIANT_NAME}) ` +
    `AGAINST THE OWNER-APPROVED F6 RESTART FREEZE ${PROPOSED_F6_FREEZE_RAW_SHA256} (${PROPOSED_F6_FREEZE_RAW_BYTES} BYTES) ` +
    `WITH DERIVED PLAN ${PROPOSED_F6_PLAN_SHA256}, ` +
    `F6 OWNER FREEZE-APPROVAL RECORD ${F6_APPROVAL_RECORD_RAW_SHA256} (${F6_APPROVAL_RECORD_RAW_BYTES} BYTES), ` +
    `V6 PROMPT SHA-256 ${V6_PROMPT_SHA256}, RELIABILITY SEMANTICS ${RELIABILITY_SEMANTICS_V2}, ` +
    `HOST-AWAKE CONTRACT ${F6_HOST_AWAKE_CONTRACT_VERSION} (${LID_OPEN_REQUIRED}), ` +
    `EXECUTED ONLY BY F7 EXECUTION BUILD ${executionBuildCommit}. ` +
    `THIS APPROVAL NAMES EXACTLY THESE ${F2_N_REPLICATES} CANDIDATE AUTHORISATIONS, ONE PER SLOT, ` +
    `AND NO OTHER: ${listing}. ` +
    `NO SLOT MAY BE ADDED, REMOVED, REPLACED OR RERUN WITHOUT A NEW APPROVAL NAMING ALL ${F2_N_REPLICATES} ` +
    'HASHES AND BYTE LENGTHS AGAIN. NO ADAPTIVE STOPPING. NO POOLING WITH F5. NO HOLDOUT. ' +
    'NO PROMPT, GOLD LABEL OR THRESHOLD MODIFICATION. ' +
    `SCORING REMAINS SEPARATELY AUTHORISED AND MAY BEGIN ONLY AFTER ALL ${F2_N_REPLICATES} SLOTS ARE TERMINAL.`
  );
}

export type F7StudyExecutionApprovalRefusal =
  | 'APPROVAL_PATH_ABSENT'
  | 'APPROVAL_PATH_NOT_ABSOLUTE'
  | 'APPROVAL_UNREADABLE'
  | 'SUPERSEDED_APPROVAL_PRESENTED'
  | 'PRIOR_STUDY_IDENTITY_PRESENTED'
  | 'APPROVAL_MALFORMED'
  | 'APPROVAL_SLOT_ORDER_MISMATCH'
  | 'APPROVAL_SLOT_FIELD_MISMATCH'
  | 'APPROVAL_DUPLICATE_CANDIDATE_HASH'
  | 'APPROVAL_DUPLICATE_OUTPUT_ROOT'
  | 'APPROVAL_STATEMENT_MISMATCH'
  | 'APPROVAL_EXPIRED'
  | 'APPROVAL_NOT_YET_VALID'
  | 'EXECUTION_BUILD_MISMATCH';

export type F7StudyExecutionApprovalDecision =
  | {
      readonly granted: true;
      readonly approval: F7StudyExecutionApproval;
      readonly approvalSha256: string;
    }
  | {
      readonly granted: false;
      readonly refusal: F7StudyExecutionApprovalRefusal;
      readonly detail: string;
    };

export interface F7StudyExecutionApprovalInput {
  readonly approvalPath: string | null;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly nowUtc: () => Date;
  readonly currentHead: () => string;
  readonly slots?: readonly F2SlotIdentity[];
}

const refuse = (
  refusal: F7StudyExecutionApprovalRefusal,
  detail: string,
): F7StudyExecutionApprovalDecision => ({ granted: false, refusal, detail });

/**
 * A NULL path is the normal state and refuses with `APPROVAL_PATH_ABSENT`: no
 * F6 study-level execution approval exists, so nothing is executable.
 */
export function evaluateF7StudyExecutionApproval(
  input: F7StudyExecutionApprovalInput,
): F7StudyExecutionApprovalDecision {
  const frozenSlots = input.slots ?? F6_SLOTS;
  if (input.approvalPath === null) {
    return refuse(
      'APPROVAL_PATH_ABSENT',
      'an approval path is required; no F6 study-level owner execution approval exists, so nothing is executable.',
    );
  }
  if (!isAbsolute(input.approvalPath)) {
    return refuse('APPROVAL_PATH_NOT_ABSOLUTE', 'the approval path must be absolute.');
  }
  let bytes: Buffer;
  try {
    bytes = input.readFile(input.approvalPath);
  } catch (error) {
    return refuse(
      'APPROVAL_UNREADABLE',
      `the approval file could not be read (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  const approvalSha256 = input.sha256(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return refuse('APPROVAL_MALFORMED', 'the approval file is not valid JSON.');
  }
  const version = (parsed as { approvalVersion?: unknown } | null)?.approvalVersion;
  if (typeof version === 'string' && F7_SUPERSEDED_STUDY_APPROVAL_VERSIONS.includes(version)) {
    return refuse(
      'SUPERSEDED_APPROVAL_PRESENTED',
      `the file is a superseded study approval (${version}); the F6 restart study requires ${F7_STUDY_EXECUTION_APPROVAL_VERSION}.`,
    );
  }
  const prior = priorStudyIdentityProblems(parsed);
  if (prior.length > 0) {
    return refuse(
      'PRIOR_STUDY_IDENTITY_PRESENTED',
      `the approval cannot be an F6 authority: ${prior.join('; ')}.`,
    );
  }
  const result = F7StudyExecutionApprovalSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return refuse(
      'APPROVAL_MALFORMED',
      `the approval does not match the closed F6 restart study-approval schema at ${first ? first.path.join('.') || '<root>' : '<unknown>'}: ${first?.message ?? 'unknown'}.`,
    );
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
      return refuse(
        'APPROVAL_SLOT_ORDER_MISMATCH',
        `slots[${index}] does not match the frozen F6 slot at that position.`,
      );
    }
    if (slot.outputRoot !== f7OutputRootOf(expected)) {
      return refuse(
        'APPROVAL_SLOT_FIELD_MISMATCH',
        `slots[${index}] (${slot.slotId}) names an output root that is not the frozen F6 root for that slot.`,
      );
    }
  }
  const hashes = approval.slots.map((slot) => slot.candidateAuthorisationSha256);
  if (new Set(hashes).size !== hashes.length) {
    return refuse(
      'APPROVAL_DUPLICATE_CANDIDATE_HASH',
      'two or more slots name the identical candidate authorisation hash.',
    );
  }
  const roots = approval.slots.map((slot) => slot.outputRoot);
  if (new Set(roots).size !== roots.length) {
    return refuse(
      'APPROVAL_DUPLICATE_OUTPUT_ROOT',
      'two or more slots name the identical output root.',
    );
  }
  if (
    approval.operatorApprovalStatement !==
    buildF7StudyExecutionApprovalStatement(approval.executionBuildCommit, approval.slots)
  ) {
    return refuse(
      'APPROVAL_STATEMENT_MISMATCH',
      'the operator approval statement does not match the one this build derives from the listed slots and execution build.',
    );
  }
  const now = input.nowUtc().getTime();
  if (now < Date.parse(approval.issuedAtUtc)) {
    return refuse('APPROVAL_NOT_YET_VALID', 'the approval is not yet valid.');
  }
  if (now > Date.parse(approval.validUntilUtc)) {
    return refuse('APPROVAL_EXPIRED', 'the approval validity window has passed.');
  }
  const actualHead = input.currentHead();
  if (approval.executionBuildCommit !== actualHead) {
    return refuse(
      'EXECUTION_BUILD_MISMATCH',
      `the approval authorises execution build ${approval.executionBuildCommit}; the checked-out HEAD is ${actualHead}.`,
    );
  }
  return { granted: true, approval, approvalSha256 };
}

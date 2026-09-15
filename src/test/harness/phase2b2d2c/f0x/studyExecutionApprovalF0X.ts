/**
 * PHASE 2B-2D2C-F0X — THE STUDY-LEVEL EXECUTION-APPROVAL CONTRACT, BOUND TO
 * AN EXECUTION BUILD.
 *
 * F0W's `studyExecutionApproval.ts` (`F0WStudyExecutionApprovalSchema`)
 * named every study-wide identity a real approval must bind EXCEPT the one
 * thing F0W could not yet name: which BUILD of the execution code the
 * approval authorises to actually consume the ten candidates. This module
 * is F0W's schema plus exactly one new field —
 * `executionIntegrationCommit`, the exact 40-character Git SHA of the F0X
 * commit whose executor the approval authorises — under a NEW version
 * literal (`phase2b-2d2c-f0x-study-execution-approval-v1`). F0W's own
 * schema and version string are UNCHANGED: this is a SUPERSEDING schema,
 * not an edit to an already-audited one, exactly as every prior
 * attempt-authorisation version in this lineage (ATTEMPT_1/2/3/4,
 * F0W_SLOT_AUTHORISATION) superseded rather than mutated its predecessor.
 *
 * The self-reference problem the owner's brief names — a commit cannot
 * know its own SHA while it is being written — is resolved the way the
 * brief itself directs: `executionIntegrationCommit` is never a literal
 * pinned by this build. A real approval supplies whatever exact,
 * already-committed F0X HEAD the future materialisation phase names, and
 * `verifyExecutionHeadMatches` checks that value, request-free, against
 * the CURRENTLY CHECKED-OUT HEAD at execution time through an injected
 * probe (production: `git rev-parse HEAD` with a fixed argument vector, no
 * shell, `-C <repoRoot>`). A mismatch refuses before anything else runs.
 *
 * This module creates no approval and grants nothing by itself.
 * `evaluateF0XStudyExecutionApproval` is the SAME evaluation the readiness
 * CLI uses to check a candidate file and the real executor uses as ONE of
 * its four composed gates (`composedExecutionDecision.ts`) — a `granted:
 * true` here is never, on its own, sufficient to execute anything; see
 * that module's docstring.
 *
 * Pure aside from the injected reader, hasher, clock and HEAD probe. No
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
import { F0WStudyExecutionApprovalSlotSchema } from '../f0w/studyExecutionApproval.js';

export const F0X_STUDY_EXECUTION_APPROVAL_VERSION = 'phase2b-2d2c-f0x-study-execution-approval-v1';

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
const UtcInstant = z.iso.datetime({ offset: false });

export const F0XStudyExecutionApprovalSchema = z.strictObject({
  approvalVersion: z.literal(F0X_STUDY_EXECUTION_APPROVAL_VERSION),
  scope: z.literal('DEVELOPMENT_ONLY'),
  studyId: z.literal('REPLICATION_V4_V5_N5'),
  f0vFreezeRawSha256: z.literal(PROPOSED_F0V_FREEZE_RAW_SHA256),
  f0vPlanSha256: z.literal(PROPOSED_F0V_PLAN_SHA256),
  f0vApprovalRecordRawSha256: Sha256,
  f0uMethodologyRawSha256: z.literal(F0U_METHODOLOGY_RAW_SHA256),
  /** The exact, already-committed F0X HEAD this approval authorises. Never a literal this build can pin on itself. */
  executionIntegrationCommit: GitSha,
  slots: z.array(F0WStudyExecutionApprovalSlotSchema).length(F0V_TOTAL_SLOTS),
  issuedAtUtc: UtcInstant,
  validUntilUtc: UtcInstant,
  operatorApprovalStatement: z.string().min(1),
});

export type F0XStudyExecutionApproval = z.infer<typeof F0XStudyExecutionApprovalSchema>;

/** Deterministic from the candidate's OWN listed slots and its OWN claimed build — never a hand-typed duplicate. */
export function buildF0XStudyExecutionApprovalStatement(
  executionIntegrationCommit: string,
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
    `F0U METHODOLOGY ${F0U_METHODOLOGY_RAW_SHA256}, ` +
    `EXECUTED ONLY BY F0X EXECUTION-INTEGRATION BUILD ${executionIntegrationCommit}. ` +
    `THIS APPROVAL NAMES EXACTLY THESE ${F0V_TOTAL_SLOTS} CANDIDATE AUTHORISATIONS, ONE PER SLOT, ` +
    `AND NO OTHER: ${listing}. NO ADAPTIVE STOPPING: NO SLOT MAY BE ADDED, REMOVED OR REPLACED ` +
    'WITHOUT A NEW APPROVAL NAMING ALL TEN HASHES AGAIN.'
  );
}

export type F0XStudyExecutionApprovalRefusal =
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
  | 'APPROVAL_NOT_YET_VALID'
  | 'EXECUTION_HEAD_MISMATCH';

export type F0XStudyExecutionApprovalDecision =
  | {
      readonly granted: true;
      readonly approval: F0XStudyExecutionApproval;
      readonly approvalSha256: string;
    }
  | {
      readonly granted: false;
      readonly refusal: F0XStudyExecutionApprovalRefusal;
      readonly detail: string;
    };

export interface F0XStudyExecutionApprovalInput {
  readonly approvalPath: string | null;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly nowUtc: () => Date;
  /** The ACTUAL currently checked-out HEAD, request-free (production: `git rev-parse HEAD`). */
  readonly currentHead: () => string;
  readonly slots?: readonly StudySlotIdentity[];
}

/**
 * Evaluates a study execution-approval candidate against the closed F0X
 * schema, the frozen slot registry/order, and the ACTUAL checked-out HEAD.
 * This is the SAME evaluation for a plan-only readiness check and for the
 * real executor's own composed gate — there is no separate "live" variant
 * and no separate "verify-only" variant, because unlike F0W's schema (which
 * had no execution path to feed), this one is consumed for real by
 * `composedExecutionDecision.ts`. A `granted: true` here means exactly
 * "this exact approval is structurally valid, current, and issued for the
 * BUILD that is running right now" — nothing more; it is one of four gates
 * a slot launch requires.
 */
export function evaluateF0XStudyExecutionApproval(
  input: F0XStudyExecutionApprovalInput,
): F0XStudyExecutionApprovalDecision {
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
  const result = F0XStudyExecutionApprovalSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      granted: false,
      refusal: 'APPROVAL_MALFORMED',
      detail: `the approval does not match the closed F0X study-approval schema at ${first ? first.path.join('.') || '<root>' : '<unknown>'}: ${first?.message ?? 'unknown'}.`,
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
  const expectedStatement = buildF0XStudyExecutionApprovalStatement(
    approval.executionIntegrationCommit,
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
  if (approval.executionIntegrationCommit !== actualHead) {
    return {
      granted: false,
      refusal: 'EXECUTION_HEAD_MISMATCH',
      detail: `the approval authorises execution build ${approval.executionIntegrationCommit}; the checked-out HEAD is ${actualHead}.`,
    };
  }
  return { granted: true, approval, approvalSha256 };
}

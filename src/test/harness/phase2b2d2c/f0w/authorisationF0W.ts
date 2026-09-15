/**
 * PHASE 2B-2D2C-F0W — THE PER-SLOT REPLICATION EXECUTION LOCK.
 *
 * Modelled directly on `f0o/authorisationF0O.ts` (the attempt-4 lock): a
 * versioned, `z.strictObject`-closed schema pinning every study-wide
 * identity as a literal, an authorisation statement recomputed byte-for-byte
 * from the SAME pinned identities the schema checks, and an
 * evaluate/verify-candidate-only pair. The one structural difference from
 * every prior lock in this lineage is that TEN valid authorisations exist
 * simultaneously — one per slot — so the fields that vary between them
 * (`slotId`, `sequence`, `pairNumber`, `variantName`, the source historical
 * freeze/plan/runtime/prompt identity, `historicalAttemptNo`, `outputRoot`)
 * cannot be pinned as schema literals the way F0O pinned its single V5
 * variant. Instead: the schema pins everything STUDY-WIDE (the F0V/F0U
 * hashes, the ceilings, the ordinals, the prohibitions), and the evaluator
 * looks the claimed `slotId` up in the injected, request-free slot registry
 * (`slotRegistry.ts`) and cross-checks EVERY per-slot field against what the
 * registry — never the candidate's own say-so — derives for that slot.
 *
 * "A candidate for one slot must never validate for another slot" is
 * therefore enforced twice: the caller supplies `expected.slotId` (exactly
 * as F0O's caller supplies `expected.outputRoot`/`expected.attemptNo`), and
 * the candidate's own claimed identity is independently re-derived from the
 * registry and compared field for field. A V4 candidate can never validate
 * for a V5 slot (and vice versa) because `historicalIdentityOf` returns a
 * completely different `runtimeCommit`/`promptSha256`/`historicalAttemptNo`
 * for the two variants, and any candidate whose fields do not match ALL of
 * them is refused.
 *
 * No production constructor exists for a GRANTED decision outside this
 * evaluator, there is no environment-variable or flag bypass, and this
 * module creates no candidate, no output root and no consumption marker of
 * its own — `verifyF0WSlotAuthorisationCandidate` is verification only, with
 * no execution branch, exactly like `verifyAttempt4AuthorisationCandidate`.
 *
 * Pure aside from the injected reader, hasher, clock and slot resolver. No
 * network, no database, no filesystem of its own.
 */
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../../../orgunits/classify/repair.js';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../constants.js';
import {
  ATTEMPT4_AUTHORISATION_VERSION,
  ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT4_MAX_PROVIDER_REQUESTS,
  ATTEMPT_1_AUTHORISATION_VERSION,
  ATTEMPT_2_AUTHORISATION_VERSION,
  ATTEMPT_3_AUTHORISATION_VERSION,
} from '../f0o/authorisationF0O.js';
import {
  F0U_METHODOLOGY_RAW_SHA256,
  F0V_APPROVAL_RECORD_RAW_SHA256,
  F0V_STUDY_ROOT,
  PROPOSED_F0V_FREEZE_RAW_SHA256,
  PROPOSED_F0V_PLAN_SHA256,
} from '../f0v/freezeF0V.js';
import {
  F0V_TOTAL_SLOTS,
  futureOutputRootPathOf,
  type StudySlotIdentity,
} from '../f0v/studyPlanCore.js';
import { historicalIdentityOf } from './slotExecutionPlan.js';
import { SlotRegistryError } from './slotRegistry.js';

export const F0W_SLOT_AUTHORISATION_VERSION = 'phase2b-2d2c-f0w-replication-slot-authorisation-v1';

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
const UtcInstant = z.iso.datetime({ offset: false });

export const F0WProhibitionsSchema = z.strictObject({
  holdout: z.literal('NONE'),
  goldLabelChanges: z.literal('NONE'),
  thresholdChanges: z.literal('NONE'),
  promptChanges: z.literal('NONE'),
  databaseWrites: z.literal('NONE'),
  migrationWrites: z.literal('NONE'),
  v6OrFutureVariantScheduling: z.literal('NONE'),
  otherSlotExecution: z.literal('NONE'),
});

export const F0WSlotAuthorisationSchema = z.strictObject({
  authorisationVersion: z.literal(F0W_SLOT_AUTHORISATION_VERSION),
  scope: z.literal('DEVELOPMENT_ONLY'),
  studyId: z.literal('REPLICATION_V4_V5_N5'),
  f0vFreezeRawSha256: z.literal(PROPOSED_F0V_FREEZE_RAW_SHA256),
  f0vPlanSha256: z.literal(PROPOSED_F0V_PLAN_SHA256),
  f0vApprovalRecordRawSha256: Sha256,
  f0uMethodologyRawSha256: z.literal(F0U_METHODOLOGY_RAW_SHA256),
  slotId: z.string().min(1),
  sequence: z.int().min(1).max(F0V_TOTAL_SLOTS),
  pairNumber: z.int().min(1).max(5),
  variantName: z.enum(['PROMPT_V4_CANONICAL', 'PROMPT_V5_CANONICAL']),
  sourceHistoricalFreezeRawSha256: Sha256,
  sourceHistoricalPlanSha256: Sha256,
  runtimeCommit: GitSha,
  promptVersion: z.string().min(1),
  promptSha256: Sha256,
  historicalAttemptNo: z.union([z.literal(3), z.literal(4)]),
  maxLogicalEvaluations: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
  frozenLogicalBatchOrdinals: z
    .array(z.int())
    .length(EXPECTED_LOGICAL_BATCHES_PER_VARIANT)
    .refine((ordinals) => ordinals.every((ordinal, index) => ordinal === index + 1), {
      message: `frozenLogicalBatchOrdinals must be exactly [1, 2, ..., ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT}] in order.`,
    }),
  maxProviderRequests: z.literal(ATTEMPT4_MAX_PROVIDER_REQUESTS),
  maxAdapterAttempts: z.literal(ATTEMPT4_MAX_ADAPTER_ATTEMPTS),
  repairPolicy: z.strictObject({
    enabled: z.literal(true),
    maxRoundsPerLogicalEvaluation: z.literal(1),
    minimumRemainingBudgetMs: z.literal(REPAIR_MINIMUM_REMAINING_BUDGET_MS),
  }),
  prohibitions: F0WProhibitionsSchema,
  outputRoot: z.string().min(1),
  issuedAtUtc: UtcInstant,
  validUntilUtc: UtcInstant,
  operatorAuthorisationStatement: z.string().min(1),
});

export type F0WSlotExecutionAuthorisation = z.infer<typeof F0WSlotAuthorisationSchema>;

/**
 * The one unmistakable owner statement for a given slot. Every identity in
 * it is a literal pin from this module's imports or from
 * `historicalIdentityOf` — never a hand-typed duplicate. While no F0V
 * approval record is pinned the statement is deliberately unissuable.
 */
export function buildF0WSlotAuthorisationStatement(slot: StudySlotIdentity): string {
  const identity = historicalIdentityOf(slot.variantName);
  return (
    `I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF REPLICATION-STUDY SLOT ${slot.slotId} ` +
    `(SEQUENCE ${slot.sequence} OF ${F0V_TOTAL_SLOTS}, PAIR ${slot.pairNumber}, VARIANT ${slot.variantName}): ` +
    `AT MOST ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT} LOGICAL EVALUATIONS (FROZEN ORDINALS 1..${EXPECTED_LOGICAL_BATCHES_PER_VARIANT}), ` +
    `REUSING THE HISTORICAL ATTEMPT ${identity.historicalAttemptNo} FREEZE AND PLAN UNCHANGED. ` +
    `AGAINST THE APPROVED F0V FREEZE ${PROPOSED_F0V_FREEZE_RAW_SHA256} WITH DERIVED PLAN ${PROPOSED_F0V_PLAN_SHA256}, ` +
    `F0V OWNER-APPROVAL RECORD ${F0V_APPROVAL_RECORD_RAW_SHA256 ?? '<NO F0V APPROVAL RECORD IS PINNED; NOTHING IS AUTHORISABLE>'}, ` +
    `F0U METHODOLOGY ${F0U_METHODOLOGY_RAW_SHA256}, ` +
    `RUNTIME ${identity.runtimeCommit}, PROMPT SHA-256 ${identity.promptSha256}, ` +
    `AT THE FROZEN OUTPUT ROOT ${futureOutputRootPathOf(F0V_STUDY_ROOT, slot)}. ` +
    'REPAIR POLICY ENABLED (ONE ROUND PER LOGICAL EVALUATION, 120000 MS USABLE-WINDOW FLOOR), ' +
    `AT MOST ${ATTEMPT4_MAX_PROVIDER_REQUESTS} PROVIDER REQUESTS AND AT MOST ${ATTEMPT4_MAX_ADAPTER_ATTEMPTS} ADAPTER ATTEMPTS. ` +
    'NO HOLDOUT. NO GOLD LABEL, THRESHOLD OR PROMPT CHANGE. NO DATABASE OR MIGRATION WRITE. ' +
    'NO V6 OR FUTURE-VARIANT SCHEDULING. NO EXECUTION OF ANY OTHER SLOT UNDER THIS AUTHORISATION.'
  );
}

export type F0WSlotExecutionLockRefusal =
  | 'EXECUTE_FLAG_ABSENT'
  | 'AUTHORISATION_PATH_ABSENT'
  | 'AUTHORISATION_PATH_NOT_ABSOLUTE'
  | 'AUTHORISATION_UNREADABLE'
  | 'ATTEMPT_1_AUTHORISATION_PRESENTED'
  | 'ATTEMPT_2_AUTHORISATION_PRESENTED'
  | 'ATTEMPT_3_AUTHORISATION_PRESENTED'
  | 'ATTEMPT_4_AUTHORISATION_PRESENTED'
  | 'AUTHORISATION_MALFORMED'
  | 'AUTHORISATION_SLOT_UNKNOWN'
  | 'AUTHORISATION_SLOT_MISMATCH'
  | 'AUTHORISATION_SLOT_FIELD_MISMATCH'
  | 'FREEZE_APPROVAL_RECORD_MISMATCH'
  | 'AUTHORISATION_STATEMENT_MISMATCH'
  | 'AUTHORISATION_EXPIRED'
  | 'AUTHORISATION_NOT_YET_VALID'
  | 'AUTHORISATION_OUTPUT_ROOT_MISMATCH'
  | 'AUTHORISATION_ATTEMPT_MISMATCH'
  | 'AUTHORISATION_ALREADY_CONSUMED';

export type F0WSlotExecutionLockDecision =
  | {
      readonly granted: true;
      readonly authorisation: F0WSlotExecutionAuthorisation;
      readonly slot: StudySlotIdentity;
      /** SHA-256 of the exact authorisation bytes — the identity a consumption marker records. */
      readonly authorisationSha256: string;
    }
  | {
      readonly granted: false;
      readonly refusal: F0WSlotExecutionLockRefusal;
      readonly detail: string;
    };

export interface F0WSlotExecutionLockInput {
  readonly executeFlag: boolean;
  readonly authorisationPath: string | null;
  /** What the runner itself verified and will use for THIS invocation. */
  readonly expected: {
    readonly slotId: string;
    readonly outputRoot: string;
    readonly attemptNo: number;
  };
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly alreadyConsumed: (authorisationSha256: string) => boolean;
  readonly nowUtc: () => Date;
  /** Resolves a slotId against the frozen F0V registry; throws SlotRegistryError on an unknown id. */
  readonly resolveSlot: (slotId: string) => StudySlotIdentity;
}

const refuse = (
  refusal: F0WSlotExecutionLockRefusal,
  detail: string,
): F0WSlotExecutionLockDecision => ({ granted: false, refusal, detail });

/**
 * Evaluates the per-slot replication execution lock. A caller that presents
 * only one half, a prior-attempt lock's authorisation, a candidate whose
 * claimed slot fields do not match what the frozen registry derives for its
 * OWN `slotId`, a candidate for a DIFFERENT slot than the one this
 * invocation expects, or any value the closed schema does not accept never
 * reaches a granted decision.
 */
export function evaluateF0WSlotExecutionLock(
  input: F0WSlotExecutionLockInput,
): F0WSlotExecutionLockDecision {
  if (!input.executeFlag) {
    return refuse('EXECUTE_FLAG_ABSENT', 'execution requires the explicit --execute flag.');
  }
  if (input.authorisationPath === null) {
    return refuse(
      'AUTHORISATION_PATH_ABSENT',
      'execution requires an explicit --authorisation <absolute path>; --execute alone enables nothing.',
    );
  }
  if (!isAbsolute(input.authorisationPath)) {
    return refuse(
      'AUTHORISATION_PATH_NOT_ABSOLUTE',
      'the authorisation path must be absolute; a relative path would depend on the working directory.',
    );
  }
  let bytes: Buffer;
  try {
    bytes = input.readFile(input.authorisationPath);
  } catch (error) {
    return refuse(
      'AUTHORISATION_UNREADABLE',
      `the authorisation file could not be read (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  const authorisationSha256 = input.sha256(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return refuse('AUTHORISATION_MALFORMED', 'the authorisation file is not valid JSON.');
  }
  const version = (parsed as { authorisationVersion?: unknown } | null)?.authorisationVersion;
  if (version === ATTEMPT_1_AUTHORISATION_VERSION) {
    return refuse(
      'ATTEMPT_1_AUTHORISATION_PRESENTED',
      `the file is an attempt-1 authorisation (${ATTEMPT_1_AUTHORISATION_VERSION}); a replication slot requires ${F0W_SLOT_AUTHORISATION_VERSION}.`,
    );
  }
  if (version === ATTEMPT_2_AUTHORISATION_VERSION) {
    return refuse(
      'ATTEMPT_2_AUTHORISATION_PRESENTED',
      `the file is an attempt-2 authorisation (${ATTEMPT_2_AUTHORISATION_VERSION}); a replication slot requires ${F0W_SLOT_AUTHORISATION_VERSION}.`,
    );
  }
  if (version === ATTEMPT_3_AUTHORISATION_VERSION) {
    return refuse(
      'ATTEMPT_3_AUTHORISATION_PRESENTED',
      `the file is an attempt-3 authorisation (${ATTEMPT_3_AUTHORISATION_VERSION}); a replication slot requires ${F0W_SLOT_AUTHORISATION_VERSION}.`,
    );
  }
  if (version === ATTEMPT4_AUTHORISATION_VERSION) {
    return refuse(
      'ATTEMPT_4_AUTHORISATION_PRESENTED',
      `the file is an attempt-4 authorisation (${ATTEMPT4_AUTHORISATION_VERSION}); a replication slot requires ${F0W_SLOT_AUTHORISATION_VERSION}.`,
    );
  }
  const result = F0WSlotAuthorisationSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return refuse(
      'AUTHORISATION_MALFORMED',
      `the authorisation does not match the closed replication-slot schema at ` +
        `${first ? first.path.join('.') || '<root>' : '<unknown>'}: ${first?.message ?? 'unknown'}.`,
    );
  }
  const authorisation = result.data;
  if (authorisation.slotId !== input.expected.slotId) {
    return refuse(
      'AUTHORISATION_SLOT_MISMATCH',
      `the authorisation names slot ${authorisation.slotId}; this invocation expects ${input.expected.slotId}.`,
    );
  }
  let slot: StudySlotIdentity;
  try {
    slot = input.resolveSlot(authorisation.slotId);
  } catch (error) {
    if (error instanceof SlotRegistryError) {
      return refuse('AUTHORISATION_SLOT_UNKNOWN', error.message);
    }
    throw error;
  }
  const identity = historicalIdentityOf(slot.variantName);
  const fieldMismatches: string[] = [];
  if (authorisation.sequence !== slot.sequence) fieldMismatches.push('sequence');
  if (authorisation.pairNumber !== slot.pairNumber) fieldMismatches.push('pairNumber');
  if (authorisation.variantName !== slot.variantName) fieldMismatches.push('variantName');
  if (authorisation.sourceHistoricalFreezeRawSha256 !== identity.historicalFreezeRawSha256) {
    fieldMismatches.push('sourceHistoricalFreezeRawSha256');
  }
  if (authorisation.sourceHistoricalPlanSha256 !== identity.historicalPlanSha256) {
    fieldMismatches.push('sourceHistoricalPlanSha256');
  }
  if (authorisation.runtimeCommit !== identity.runtimeCommit) fieldMismatches.push('runtimeCommit');
  if (authorisation.promptVersion !== identity.promptVersion) fieldMismatches.push('promptVersion');
  if (authorisation.promptSha256 !== identity.promptSha256) fieldMismatches.push('promptSha256');
  if (authorisation.historicalAttemptNo !== identity.historicalAttemptNo) {
    fieldMismatches.push('historicalAttemptNo');
  }
  if (fieldMismatches.length > 0) {
    return refuse(
      'AUTHORISATION_SLOT_FIELD_MISMATCH',
      `the authorisation's own claims for slot ${slot.slotId} disagree with the frozen registry on: ${fieldMismatches.join(', ')}.`,
    );
  }
  if (
    F0V_APPROVAL_RECORD_RAW_SHA256 === null ||
    authorisation.f0vApprovalRecordRawSha256 !== F0V_APPROVAL_RECORD_RAW_SHA256
  ) {
    return refuse(
      'FREEZE_APPROVAL_RECORD_MISMATCH',
      `the authorisation names f0vApprovalRecordRawSha256 ${authorisation.f0vApprovalRecordRawSha256}; the pinned F0V approval record is ${F0V_APPROVAL_RECORD_RAW_SHA256 ?? '<none pinned>'}.`,
    );
  }
  const expectedStatement = buildF0WSlotAuthorisationStatement(slot);
  if (authorisation.operatorAuthorisationStatement !== expectedStatement) {
    return refuse(
      'AUTHORISATION_STATEMENT_MISMATCH',
      'the operator authorisation statement does not match the one this build derives for the named slot.',
    );
  }
  const now = input.nowUtc().getTime();
  const issuedAt = Date.parse(authorisation.issuedAtUtc);
  const validUntil = Date.parse(authorisation.validUntilUtc);
  if (!(validUntil > issuedAt)) {
    return refuse('AUTHORISATION_MALFORMED', 'validUntilUtc must be after issuedAtUtc.');
  }
  if (now < issuedAt) {
    return refuse('AUTHORISATION_NOT_YET_VALID', 'the authorisation is not yet valid.');
  }
  if (now > validUntil) {
    return refuse('AUTHORISATION_EXPIRED', 'the authorisation validity window has passed.');
  }
  const expectedOutputRoot = futureOutputRootPathOf(F0V_STUDY_ROOT, slot);
  if (
    authorisation.outputRoot !== expectedOutputRoot ||
    authorisation.outputRoot !== input.expected.outputRoot
  ) {
    return refuse(
      'AUTHORISATION_OUTPUT_ROOT_MISMATCH',
      `the authorised output root is not the frozen root for ${slot.slotId}, or not the output root supplied to this invocation.`,
    );
  }
  if (authorisation.historicalAttemptNo !== input.expected.attemptNo) {
    return refuse(
      'AUTHORISATION_ATTEMPT_MISMATCH',
      `the authorised historical attempt number (${authorisation.historicalAttemptNo}) is not the one this invocation expects (${input.expected.attemptNo}).`,
    );
  }
  if (input.alreadyConsumed(authorisationSha256)) {
    return refuse(
      'AUTHORISATION_ALREADY_CONSUMED',
      'this exact authorisation was already consumed under the output root; a re-attempt needs a new authorisation.',
    );
  }
  return { granted: true, authorisation, slot, authorisationSha256 };
}

/**
 * VERIFICATION ONLY. Evaluates every check of the per-slot lock against a
 * CANDIDATE authorisation file exactly as the (still nonexistent) execution
 * path would, and returns the decision. It grants nothing: its only caller
 * is the plan-only readiness CLI, which has no execution branch, constructs
 * no provider, launches no child and writes no marker. A `granted: true`
 * here means "this exact byte sequence WOULD be accepted if the owner
 * issued it and presented it with --execute"; it never means that it has
 * been.
 */
export function verifyF0WSlotAuthorisationCandidate(
  input: Omit<F0WSlotExecutionLockInput, 'executeFlag'>,
): F0WSlotExecutionLockDecision {
  return evaluateF0WSlotExecutionLock({ ...input, executeFlag: true });
}

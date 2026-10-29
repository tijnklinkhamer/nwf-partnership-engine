/**
 * PHASE 2B-2D2C-F0X RECOVERY-1 — THE RECOVERY CANDIDATE LOCK AND THE RECOVERY
 * STUDY APPROVAL.
 *
 * Two SUPERSEDING closed schemas, never edits of the audited F0W/F0X ones:
 *
 *   - a recovery slot candidate is the F0W per-slot candidate with every
 *     frozen field unchanged, a NEW version literal, `outputRoot` under the
 *     overlay's recovery root, and a `recoveryOf` block binding its failed
 *     slot, spent candidate, failed child preflight, failed slot tree, the
 *     failed study tree/inventory/erratum/approval identities and the Class B
 *     disposition — exactly as the overlay maps them;
 *   - a recovery study approval is the F0X study approval with a NEW version
 *     literal, ten recovery output roots, and a `recovery` block binding the
 *     overlay hash, the corrected implementation commit, the failed study
 *     identities, all ten spent hashes and the recovery namespace.
 *
 * An original (spent) candidate can never pass: its bytes hash into the
 * overlay's spent set (refused before parsing), its version literal is the F0W
 * one (refused), and its output root is the failed root (refused). A recovery
 * approval listing any spent hash is refused. Every check the F0W lock and the
 * F0X approval make is made here too, in the same order.
 *
 * `createRecovery1Authority` packages both, with the overlay's recovery root
 * and the study-level request-free preflight (`recovery1Preflight.ts`), as a
 * `StudyAuthority` the unchanged F0X preflight, composed gate and executor
 * consume.
 *
 * PURE aside from the injected reader, hasher, clock, HEAD probe and
 * preflight. No network, no database, no filesystem of its own.
 */
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  ATTEMPT4_AUTHORISATION_VERSION,
  ATTEMPT_1_AUTHORISATION_VERSION,
  ATTEMPT_2_AUTHORISATION_VERSION,
  ATTEMPT_3_AUTHORISATION_VERSION,
} from '../f0o/authorisationF0O.js';
import { F0V_APPROVAL_RECORD_RAW_SHA256, F0V_STUDY_ROOT } from '../f0v/freezeF0V.js';
import {
  F0V_SLOTS,
  F0V_TOTAL_SLOTS,
  futureOutputRootPathOf,
  type StudySlotIdentity,
} from '../f0v/studyPlanCore.js';
import {
  buildF0WSlotAuthorisationStatement,
  F0W_SLOT_AUTHORISATION_VERSION,
  F0WSlotAuthorisationSchema,
  type F0WSlotExecutionLockInput,
} from '../f0w/authorisationF0W.js';
import { historicalIdentityOf } from '../f0w/slotExecutionPlan.js';
import { SlotRegistryError } from '../f0w/slotRegistry.js';
import {
  buildF0XStudyExecutionApprovalStatement,
  F0X_STUDY_EXECUTION_APPROVAL_VERSION,
  F0XStudyExecutionApprovalSchema,
  type F0XStudyExecutionApprovalInput,
} from './studyExecutionApprovalF0X.js';
import {
  CLASS_B_DISPOSITION,
  recovery1MappingFor,
  recovery1SpentCandidateHashes,
  type Recovery1Binding,
} from './recovery1Overlay.js';
import type {
  SlotAuthorisationCore,
  StudyApprovalDecision,
  StudyAuthority,
  StudySlotLockDecision,
} from './studyAuthority.js';

export const F0X_RECOVERY_1_SLOT_AUTHORISATION_VERSION =
  'phase2b-2d2c-f0x-recovery-1-slot-authorisation-v1';
export const F0X_RECOVERY_1_STUDY_EXECUTION_APPROVAL_VERSION =
  'phase2b-2d2c-f0x-recovery-1-study-execution-approval-v1';

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);

// ---------------------------------------------------------------------------
// Recovery slot candidate.
// ---------------------------------------------------------------------------

export const Recovery1RecoveryOfSchema = z.strictObject({
  recoveryId: z.literal('F0X_RECOVERY_1'),
  overlayRawSha256: Sha256,
  failedStudyRoot: z.string().min(1),
  failedSlotId: z.string().min(1),
  failedSequence: z.int().min(1).max(F0V_TOTAL_SLOTS),
  failedOutputRoot: z.string().min(1),
  spentCandidateAuthorisationSha256: Sha256,
  failedChildPreflightFileSha256: Sha256,
  failedChildPreflightRecordSha256: Sha256,
  failedSlotTreeSha256: Sha256,
  failedStudyTreeSha256: Sha256,
  failedStudyInventoryRawSha256: Sha256,
  failedStudyErratumRawSha256: Sha256,
  failedStudyExecutionApprovalSha256: Sha256,
  failedDisposition: z.literal(CLASS_B_DISPOSITION),
  failedSlotCountsTowardN: z.literal(false),
});

export type Recovery1RecoveryOf = z.infer<typeof Recovery1RecoveryOfSchema>;

export const F0XRecovery1SlotAuthorisationSchema = z.strictObject({
  ...F0WSlotAuthorisationSchema.shape,
  authorisationVersion: z.literal(F0X_RECOVERY_1_SLOT_AUTHORISATION_VERSION),
  recoveryOf: Recovery1RecoveryOfSchema,
});

export type F0XRecovery1SlotAuthorisation = z.infer<typeof F0XRecovery1SlotAuthorisationSchema>;

/** The exact `recoveryOf` block the overlay derives for a slot — never the candidate's own say-so. */
export function expectedRecoveryOf(
  binding: Recovery1Binding,
  slot: StudySlotIdentity,
): Recovery1RecoveryOf {
  const mapping = recovery1MappingFor(binding, slot.slotId);
  const failed = binding.overlay.failedStudy;
  return {
    recoveryId: 'F0X_RECOVERY_1',
    overlayRawSha256: binding.overlayRawSha256,
    failedStudyRoot: failed.studyRoot,
    failedSlotId: mapping.slotId,
    failedSequence: mapping.sequence,
    failedOutputRoot: mapping.failedOutputRoot,
    spentCandidateAuthorisationSha256: mapping.spentCandidateAuthorisationSha256,
    failedChildPreflightFileSha256: mapping.failedChildPreflightFileSha256,
    failedChildPreflightRecordSha256: mapping.failedChildPreflightRecordSha256,
    failedSlotTreeSha256: mapping.failedSlotTreeSha256,
    failedStudyTreeSha256: failed.wholeStudyTree.treeSha256,
    failedStudyInventoryRawSha256: failed.inventoryRawSha256,
    failedStudyErratumRawSha256: failed.erratumRawSha256,
    failedStudyExecutionApprovalSha256: failed.studyExecutionApprovalSha256,
    failedDisposition: CLASS_B_DISPOSITION,
    failedSlotCountsTowardN: false,
  };
}

/**
 * The F0W statement for the slot (every frozen identity, ceiling and
 * prohibition, byte for byte), with its frozen-output-root clause replaced by
 * the recovery root and a recovery-1 disclosure appended.
 */
export function buildF0XRecovery1SlotAuthorisationStatement(
  slot: StudySlotIdentity,
  binding: Recovery1Binding,
): string {
  const base = buildF0WSlotAuthorisationStatement(slot);
  const frozenClause = `AT THE FROZEN OUTPUT ROOT ${futureOutputRootPathOf(F0V_STUDY_ROOT, slot)}. `;
  if (!base.includes(frozenClause)) {
    throw new Error(
      `the F0W statement for ${slot.slotId} no longer carries its frozen output-root clause.`,
    );
  }
  const mapping = recovery1MappingFor(binding, slot.slotId);
  const recoveryClause = `AT THE RECOVERY-1 OUTPUT ROOT ${mapping.recoveryOutputRoot}. `;
  return (
    base.replace(frozenClause, () => recoveryClause) +
    ` RECOVERY-1 (OUTPUT LOCATION ONLY; F0V SEMANTIC DESIGN UNCHANGED) UNDER OVERLAY ${binding.overlayRawSha256}` +
    ` OF FAILED ZERO-INFERENCE SLOT ROOT ${mapping.failedOutputRoot}, WHOSE SPENT CANDIDATE ${mapping.spentCandidateAuthorisationSha256}` +
    ` IS CLASS B AND COUNTS ZERO TOWARD N=5.`
  );
}

const refuseLock = (refusal: string, detail: string): StudySlotLockDecision => ({
  granted: false,
  refusal,
  detail,
});

/** The recovery-1 per-slot lock: every F0W check, plus spent-set, version, `recoveryOf` and recovery-root checks. */
export function evaluateF0XRecovery1SlotExecutionLock(
  binding: Recovery1Binding,
  input: F0WSlotExecutionLockInput,
): StudySlotLockDecision {
  if (!input.executeFlag) {
    return refuseLock('EXECUTE_FLAG_ABSENT', 'execution requires the explicit --execute flag.');
  }
  if (input.authorisationPath === null) {
    return refuseLock('AUTHORISATION_PATH_ABSENT', 'a recovery-1 slot candidate path is required.');
  }
  if (!isAbsolute(input.authorisationPath)) {
    return refuseLock(
      'AUTHORISATION_PATH_NOT_ABSOLUTE',
      'the authorisation path must be absolute; a relative path would depend on the working directory.',
    );
  }
  let bytes: Buffer;
  try {
    bytes = input.readFile(input.authorisationPath);
  } catch (error) {
    return refuseLock(
      'AUTHORISATION_UNREADABLE',
      `the authorisation file could not be read (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  const authorisationSha256 = input.sha256(bytes);
  if (recovery1SpentCandidateHashes(binding).includes(authorisationSha256)) {
    return refuseLock(
      'SPENT_CANDIDATE_PRESENTED',
      `candidate ${authorisationSha256} is one of the ten candidates the failed zero-inference study already spent; it is never reusable.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return refuseLock('AUTHORISATION_MALFORMED', 'the authorisation file is not valid JSON.');
  }
  const version = (parsed as { authorisationVersion?: unknown } | null)?.authorisationVersion;
  for (const [prior, refusal] of [
    [ATTEMPT_1_AUTHORISATION_VERSION, 'ATTEMPT_1_AUTHORISATION_PRESENTED'],
    [ATTEMPT_2_AUTHORISATION_VERSION, 'ATTEMPT_2_AUTHORISATION_PRESENTED'],
    [ATTEMPT_3_AUTHORISATION_VERSION, 'ATTEMPT_3_AUTHORISATION_PRESENTED'],
    [ATTEMPT4_AUTHORISATION_VERSION, 'ATTEMPT_4_AUTHORISATION_PRESENTED'],
    [F0W_SLOT_AUTHORISATION_VERSION, 'NON_RECOVERY_SLOT_AUTHORISATION_PRESENTED'],
  ] as const) {
    if (version === prior) {
      return refuseLock(
        refusal,
        `the file is a ${prior} authorisation; a recovery-1 slot requires ${F0X_RECOVERY_1_SLOT_AUTHORISATION_VERSION}.`,
      );
    }
  }
  const result = F0XRecovery1SlotAuthorisationSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return refuseLock(
      'AUTHORISATION_MALFORMED',
      `the authorisation does not match the closed recovery-1 slot schema at ${first ? first.path.join('.') || '<root>' : '<unknown>'}: ${first?.message ?? 'unknown'}.`,
    );
  }
  const authorisation = result.data;
  if (authorisation.slotId !== input.expected.slotId) {
    return refuseLock(
      'AUTHORISATION_SLOT_MISMATCH',
      `the authorisation names slot ${authorisation.slotId}; this invocation expects ${input.expected.slotId}.`,
    );
  }
  let slot: StudySlotIdentity;
  try {
    slot = input.resolveSlot(authorisation.slotId);
  } catch (error) {
    if (error instanceof SlotRegistryError)
      return refuseLock('AUTHORISATION_SLOT_UNKNOWN', error.message);
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
    return refuseLock(
      'AUTHORISATION_SLOT_FIELD_MISMATCH',
      `the authorisation's own claims for slot ${slot.slotId} disagree with the frozen registry on: ${fieldMismatches.join(', ')}.`,
    );
  }
  if (
    F0V_APPROVAL_RECORD_RAW_SHA256 === null ||
    authorisation.f0vApprovalRecordRawSha256 !== F0V_APPROVAL_RECORD_RAW_SHA256
  ) {
    return refuseLock(
      'FREEZE_APPROVAL_RECORD_MISMATCH',
      `the authorisation names f0vApprovalRecordRawSha256 ${authorisation.f0vApprovalRecordRawSha256}; the pinned F0V approval record is ${F0V_APPROVAL_RECORD_RAW_SHA256 ?? '<none pinned>'}.`,
    );
  }
  if (
    canonicalStringify(authorisation.recoveryOf) !==
    canonicalStringify(expectedRecoveryOf(binding, slot))
  ) {
    return refuseLock(
      'RECOVERY_OF_MISMATCH',
      `the candidate's recoveryOf block does not bind exactly the failed slot, spent candidate, failed preflight, failed study identities and Class B disposition the recovery-1 overlay maps to ${slot.slotId}.`,
    );
  }
  if (
    authorisation.operatorAuthorisationStatement !==
    buildF0XRecovery1SlotAuthorisationStatement(slot, binding)
  ) {
    return refuseLock(
      'AUTHORISATION_STATEMENT_MISMATCH',
      'the operator authorisation statement does not match the recovery-1 statement this build derives for the named slot.',
    );
  }
  const now = input.nowUtc().getTime();
  const issuedAt = Date.parse(authorisation.issuedAtUtc);
  const validUntil = Date.parse(authorisation.validUntilUtc);
  if (!(validUntil > issuedAt)) {
    return refuseLock('AUTHORISATION_MALFORMED', 'validUntilUtc must be after issuedAtUtc.');
  }
  if (now < issuedAt)
    return refuseLock('AUTHORISATION_NOT_YET_VALID', 'the authorisation is not yet valid.');
  if (now > validUntil) {
    return refuseLock('AUTHORISATION_EXPIRED', 'the authorisation validity window has passed.');
  }
  const recoveryOutputRoot = recovery1MappingFor(binding, slot.slotId).recoveryOutputRoot;
  if (
    authorisation.outputRoot !== recoveryOutputRoot ||
    authorisation.outputRoot !== input.expected.outputRoot
  ) {
    return refuseLock(
      'AUTHORISATION_OUTPUT_ROOT_MISMATCH',
      `the authorised output root is not the recovery-1 root for ${slot.slotId}, or not the output root supplied to this invocation.`,
    );
  }
  if (authorisation.historicalAttemptNo !== input.expected.attemptNo) {
    return refuseLock(
      'AUTHORISATION_ATTEMPT_MISMATCH',
      `the authorised historical attempt number (${authorisation.historicalAttemptNo}) is not the one this invocation expects (${input.expected.attemptNo}).`,
    );
  }
  if (input.alreadyConsumed(authorisationSha256, input.expected.outputRoot)) {
    return refuseLock(
      'AUTHORISATION_ALREADY_CONSUMED',
      'this exact authorisation was already consumed under the output root; a re-attempt needs a new authorisation.',
    );
  }
  return {
    granted: true,
    authorisation,
    slot,
    authorisationSha256,
    authorisationBytes: bytes.length,
  };
}

// ---------------------------------------------------------------------------
// Recovery study approval.
// ---------------------------------------------------------------------------

export const Recovery1ApprovalBindingSchema = z.strictObject({
  recoveryId: z.literal('F0X_RECOVERY_1'),
  overlayRawSha256: Sha256,
  correctedImplementationCommit: GitSha,
  failedStudyRoot: z.string().min(1),
  failedControlRoot: z.string().min(1),
  failedStudyTreeSha256: Sha256,
  failedStudyInventoryRawSha256: Sha256,
  failedStudyErratumRawSha256: Sha256,
  failedStudyExecutionApprovalSha256: Sha256,
  spentCandidateAuthorisationSha256s: z.array(Sha256).length(F0V_TOTAL_SLOTS),
  recoveryStudyRoot: z.string().min(1),
  recoveryControlDir: z.string().min(1),
  failedSlotsCountTowardN: z.literal(0),
  outputLocationOnlyDeviation: z.literal(true),
});

export type Recovery1ApprovalBinding = z.infer<typeof Recovery1ApprovalBindingSchema>;

export const F0XRecovery1StudyExecutionApprovalSchema = z.strictObject({
  ...F0XStudyExecutionApprovalSchema.shape,
  approvalVersion: z.literal(F0X_RECOVERY_1_STUDY_EXECUTION_APPROVAL_VERSION),
  recovery: Recovery1ApprovalBindingSchema,
});

export type F0XRecovery1StudyExecutionApproval = z.infer<
  typeof F0XRecovery1StudyExecutionApprovalSchema
>;

export function expectedRecovery1ApprovalBinding(
  binding: Recovery1Binding,
): Recovery1ApprovalBinding {
  const { overlay } = binding;
  return {
    recoveryId: 'F0X_RECOVERY_1',
    overlayRawSha256: binding.overlayRawSha256,
    correctedImplementationCommit: overlay.correctedExecution.correctedImplementationCommit,
    failedStudyRoot: overlay.failedStudy.studyRoot,
    failedControlRoot: overlay.failedStudy.controlRoot,
    failedStudyTreeSha256: overlay.failedStudy.wholeStudyTree.treeSha256,
    failedStudyInventoryRawSha256: overlay.failedStudy.inventoryRawSha256,
    failedStudyErratumRawSha256: overlay.failedStudy.erratumRawSha256,
    failedStudyExecutionApprovalSha256: overlay.failedStudy.studyExecutionApprovalSha256,
    spentCandidateAuthorisationSha256s: [...recovery1SpentCandidateHashes(binding)],
    recoveryStudyRoot: overlay.recoveryNamespace.studyRoot,
    recoveryControlDir: overlay.recoveryNamespace.controlDir,
    failedSlotsCountTowardN: 0,
    outputLocationOnlyDeviation: true,
  };
}

/** The F0X study statement for the listed candidates and build, with the recovery-1 disclosure appended. */
export function buildF0XRecovery1StudyApprovalStatement(
  executionIntegrationCommit: string,
  slots: Parameters<typeof buildF0XStudyExecutionApprovalStatement>[1],
  binding: Recovery1Binding,
): string {
  const failed = binding.overlay.failedStudy;
  const recovery = binding.overlay.recoveryNamespace;
  return (
    buildF0XStudyExecutionApprovalStatement(executionIntegrationCommit, slots) +
    ` RECOVERY-1 UNDER OVERLAY ${binding.overlayRawSha256}: THE ONLY DEVIATION FROM THE FROZEN F0V STUDY IS THE OUTPUT LOCATION` +
    ` (RECOVERY STUDY ROOT ${recovery.studyRoot}, CONTROL DIRECTORY ${recovery.controlDir}).` +
    ` THE FAILED ZERO-INFERENCE STUDY ${failed.studyRoot} (TREE ${failed.wholeStudyTree.treeSha256},` +
    ` INVENTORY ${failed.inventoryRawSha256}, ERRATUM ${failed.erratumRawSha256},` +
    ` APPROVAL ${failed.studyExecutionApprovalSha256}) STAYS READ-ONLY; ITS TEN CLASS B SLOTS COUNT ZERO TOWARD N=5` +
    ` AND ITS TEN SPENT CANDIDATES ARE NEVER REUSABLE. EXECUTION BUILD MUST DESCEND FROM CORRECTED COMMIT` +
    ` ${binding.overlay.correctedExecution.correctedImplementationCommit}.`
  );
}

const refuseApproval = (refusal: string, detail: string): StudyApprovalDecision => ({
  granted: false,
  refusal,
  detail,
});

/** The recovery-1 study approval: every F0X approval check against the recovery roots, plus the recovery binding and spent-set checks. */
export function evaluateF0XRecovery1StudyExecutionApproval(
  binding: Recovery1Binding,
  input: F0XStudyExecutionApprovalInput,
): StudyApprovalDecision {
  const frozenSlots = input.slots ?? F0V_SLOTS;
  if (input.approvalPath === null) {
    return refuseApproval('APPROVAL_PATH_ABSENT', 'a recovery-1 study approval path is required.');
  }
  if (!isAbsolute(input.approvalPath)) {
    return refuseApproval(
      'APPROVAL_PATH_NOT_ABSOLUTE',
      'the approval path must be absolute; a relative path would depend on the working directory.',
    );
  }
  let bytes: Buffer;
  try {
    bytes = input.readFile(input.approvalPath);
  } catch (error) {
    return refuseApproval(
      'APPROVAL_UNREADABLE',
      `the approval file could not be read (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  const approvalSha256 = input.sha256(bytes);
  if (approvalSha256 === binding.overlay.failedStudy.studyExecutionApprovalSha256) {
    return refuseApproval(
      'FAILED_STUDY_APPROVAL_PRESENTED',
      'this is the failed zero-inference study approval; it is never reusable.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return refuseApproval('APPROVAL_MALFORMED', 'the approval file is not valid JSON.');
  }
  if (
    (parsed as { approvalVersion?: unknown } | null)?.approvalVersion ===
    F0X_STUDY_EXECUTION_APPROVAL_VERSION
  ) {
    return refuseApproval(
      'NON_RECOVERY_STUDY_APPROVAL_PRESENTED',
      `the file is an original F0X study approval; recovery-1 requires ${F0X_RECOVERY_1_STUDY_EXECUTION_APPROVAL_VERSION}.`,
    );
  }
  const result = F0XRecovery1StudyExecutionApprovalSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return refuseApproval(
      'APPROVAL_MALFORMED',
      `the approval does not match the closed recovery-1 study-approval schema at ${first ? first.path.join('.') || '<root>' : '<unknown>'}: ${first?.message ?? 'unknown'}.`,
    );
  }
  const approval = result.data;
  if (
    F0V_APPROVAL_RECORD_RAW_SHA256 === null ||
    approval.f0vApprovalRecordRawSha256 !== F0V_APPROVAL_RECORD_RAW_SHA256
  ) {
    return refuseApproval(
      'FREEZE_APPROVAL_RECORD_MISMATCH',
      `the approval names f0vApprovalRecordRawSha256 ${approval.f0vApprovalRecordRawSha256}; the pinned F0V approval record is ${F0V_APPROVAL_RECORD_RAW_SHA256 ?? '<none pinned>'}.`,
    );
  }
  for (const [index, slot] of approval.slots.entries()) {
    const expected = frozenSlots[index];
    if (
      expected === undefined ||
      slot.sequence !== expected.sequence ||
      slot.slotId !== expected.slotId ||
      slot.variantName !== expected.variantName
    ) {
      return refuseApproval(
        'APPROVAL_SLOT_ORDER_MISMATCH',
        `slots[${index}] does not match the frozen slot at that position.`,
      );
    }
    if (slot.outputRoot !== recovery1MappingFor(binding, expected.slotId).recoveryOutputRoot) {
      return refuseApproval(
        'APPROVAL_SLOT_FIELD_MISMATCH',
        `slots[${index}] (${slot.slotId}) names an output root that is not the recovery-1 root for that slot.`,
      );
    }
  }
  const hashes = approval.slots.map((slot) => slot.candidateAuthorisationSha256);
  if (new Set(hashes).size !== hashes.length) {
    return refuseApproval(
      'APPROVAL_DUPLICATE_CANDIDATE_HASH',
      'two or more slots name the identical candidate authorisation hash.',
    );
  }
  const spent = recovery1SpentCandidateHashes(binding);
  const reused = hashes.filter((hash) => spent.includes(hash));
  if (reused.length > 0) {
    return refuseApproval(
      'SPENT_CANDIDATE_LISTED',
      `the approval lists ${reused.length} candidate(s) the failed zero-inference study already spent (${reused.join(', ')}).`,
    );
  }
  const roots = approval.slots.map((slot) => slot.outputRoot);
  if (new Set(roots).size !== roots.length) {
    return refuseApproval(
      'APPROVAL_DUPLICATE_OUTPUT_ROOT',
      'two or more slots name the identical output root.',
    );
  }
  if (
    canonicalStringify(approval.recovery) !==
    canonicalStringify(expectedRecovery1ApprovalBinding(binding))
  ) {
    return refuseApproval(
      'RECOVERY_BINDING_MISMATCH',
      'the approval’s recovery block does not bind exactly the overlay, corrected commit, failed study identities, spent hashes and recovery namespace this build pins.',
    );
  }
  if (
    approval.operatorApprovalStatement !==
    buildF0XRecovery1StudyApprovalStatement(
      approval.executionIntegrationCommit,
      approval.slots,
      binding,
    )
  ) {
    return refuseApproval(
      'APPROVAL_STATEMENT_MISMATCH',
      'the operator approval statement does not match the recovery-1 statement this build derives from the listed slots and execution build.',
    );
  }
  const now = input.nowUtc().getTime();
  const issuedAt = Date.parse(approval.issuedAtUtc);
  const validUntil = Date.parse(approval.validUntilUtc);
  if (!(validUntil > issuedAt)) {
    return refuseApproval('APPROVAL_MALFORMED', 'validUntilUtc must be after issuedAtUtc.');
  }
  if (now < issuedAt)
    return refuseApproval('APPROVAL_NOT_YET_VALID', 'the approval is not yet valid.');
  if (now > validUntil) {
    return refuseApproval('APPROVAL_EXPIRED', 'the approval validity window has passed.');
  }
  const actualHead = input.currentHead();
  if (approval.executionIntegrationCommit !== actualHead) {
    return refuseApproval(
      'EXECUTION_HEAD_MISMATCH',
      `the approval authorises execution build ${approval.executionIntegrationCommit}; the checked-out HEAD is ${actualHead}.`,
    );
  }
  return { granted: true, approval, approvalSha256 };
}

// ---------------------------------------------------------------------------
// The authority.
// ---------------------------------------------------------------------------

/**
 * The recovery-1 `StudyAuthority`: recovery lock, recovery approval, the
 * overlay's recovery study root, the caller's request-free study-level
 * preflight (`evaluateRecovery1StudyPreflight`), and the recovery binding the
 * study manifest and every outer slot identity record carry.
 */
export function createRecovery1Authority(
  binding: Recovery1Binding,
  studyLevelPreflight: () => readonly string[],
): StudyAuthority {
  return Object.freeze({
    kind: 'F0X_RECOVERY_1',
    studyRoot: binding.overlay.recoveryNamespace.studyRoot,
    evaluateSlotLock: (input: F0WSlotExecutionLockInput) =>
      evaluateF0XRecovery1SlotExecutionLock(binding, input),
    evaluateStudyApproval: (input: F0XStudyExecutionApprovalInput) =>
      evaluateF0XRecovery1StudyExecutionApproval(binding, input),
    studyLevelPreflight,
    studyManifestBinding: () => ({ ...expectedRecovery1ApprovalBinding(binding) }),
    outerSlotIdentityBinding: (authorisation: SlotAuthorisationCore) => ({
      overlayRawSha256: binding.overlayRawSha256,
      recoveryOf: (authorisation as Partial<F0XRecovery1SlotAuthorisation>).recoveryOf ?? null,
    }),
  });
}

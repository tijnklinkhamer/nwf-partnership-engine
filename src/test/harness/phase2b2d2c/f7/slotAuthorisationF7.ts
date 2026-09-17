/**
 * PHASE 2B-2D2C-F7 — THE PER-SLOT F6 RESTART EXECUTION LOCK.
 *
 * The F3 lock (`f3/authorisationF3.ts`) rebuilt over the owner-approved F6
 * restart study, in the same shape: a versioned, `z.strictObject`-closed
 * schema pinning every study-wide identity as a literal, an authorisation
 * statement recomputed byte for byte from the same pins, and an evaluator
 * whose slot-varying fields (`slotId`, `sequence`, `replicateNumber`,
 * `outputRoot`) are cross-checked against the frozen F6 slots, never taken on
 * the candidate's own say-so.
 *
 * WHY A NEW VERSION. `F3SlotAuthorisationSchema` pins study
 * `FINAL_V6_DEV_N5`, the F2 freeze and approval and the F5 roots — F5's
 * identity. An F6 candidate must name the F6 freeze, plan and owner approval,
 * the F6 slots and roots, and the host-awake contract instead. Every F3 and
 * earlier authorisation version is refused BY VALUE, and every candidate is
 * additionally scanned for any F5 identity (`f6/priorStudyIdentityF6.ts`)
 * before the schema runs, so no F5 candidate can validate here even if it
 * were relabelled.
 *
 * Like F3, the candidate binds its execution build and is checked against
 * the actually checked-out HEAD through an injected probe.
 *
 * NO MODEL-ID LITERAL LIVES HERE: `requestedModelId` is cross-checked against
 * the value the approved freeze itself carries.
 *
 * Pure aside from the injected reader, hasher, clock, HEAD probe and slot
 * resolver. No network, no database, no filesystem of its own.
 */
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../../../orgunits/classify/repair.js';
import {
  EXPECTED_CORPUS_ITEM_COUNT,
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
  FROZEN_AGENT_SDK_VERSION,
  FROZEN_AUTH_STATUS_TIMEOUT_MS,
  FROZEN_DEFAULT_MAX_TURNS,
  FROZEN_MAX_TRANSIENT_RETRIES,
  FROZEN_TIER1_GRACE_MS,
  FROZEN_TIER1_SOFT_DEADLINE_MS,
  FROZEN_TIER1_TOTAL_BUDGET_MS,
  MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
  RELIABILITY_SEMANTICS_V2,
} from '../constants.js';
import {
  ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT4_MAX_PROVIDER_REQUESTS,
} from '../f0o/authorisationF0O.js';
import {
  F0Z_RELIABILITY_BASE_COMMIT,
  F2_INTEGRATED_RUNTIME_COMMIT,
  PROPOSED_F2_FREEZE_RAW_SHA256,
  PROPOSED_F2_PLAN_SHA256,
  V6_PROMPT_SHA256,
  V6_PROMPT_VERSION,
  V6_SEMANTIC_SOURCE_COMMIT,
} from '../f2/freezeF2.js';
import {
  F2_N_REPLICATES,
  F2_VARIANT_NAME,
  f2OutputRootPathOf,
  type F2SlotIdentity,
} from '../f2/studyPlanCoreF2.js';
import {
  F3FrozenTimeoutsSchema,
  F3_SLOT_AUTHORISATION_VERSION,
  SUPERSEDED_AUTHORISATION_VERSIONS,
} from '../f3/authorisationF3.js';
import {
  F6_APPROVAL_RECORD_RAW_BYTES,
  F6_APPROVAL_RECORD_RAW_SHA256,
  PROPOSED_F6_FREEZE_RAW_BYTES,
  PROPOSED_F6_FREEZE_RAW_SHA256,
  PROPOSED_F6_PLAN_SHA256,
} from '../f6/freezeF6.js';
import { F6_HOST_AWAKE_CONTRACT_VERSION, LID_OPEN_REQUIRED } from '../f6/hostAwakePreflightF6.js';
import { priorStudyIdentityProblems } from '../f6/priorStudyIdentityF6.js';
import { F6_STUDY_ID } from '../f6/studyPlanCoreF6.js';
import { F7_STUDY_ROOT } from './studyRootsF7.js';

export const F7_SLOT_AUTHORISATION_VERSION = 'phase2b-2d2c-f7-v6-restart-slot-authorisation-v1';

/** Every earlier per-slot authorisation version, F3's (which F5 consumed) included, refused BY VALUE. */
export const F7_SUPERSEDED_AUTHORISATION_VERSIONS: readonly string[] = Object.freeze([
  ...SUPERSEDED_AUTHORISATION_VERSIONS,
  F3_SLOT_AUTHORISATION_VERSION,
]);

const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
const UtcInstant = z.iso.datetime({ offset: false });

/** Disjoint from F3's block (two F6-only keys), so an F3 candidate is structurally unparseable here. */
export const F7ProhibitionsSchema = z.strictObject({
  holdout: z.literal('NONE'),
  goldAccess: z.literal('NONE'),
  goldLabelChanges: z.literal('NONE'),
  thresholdChanges: z.literal('NONE'),
  promptChanges: z.literal('NONE'),
  databaseWrites: z.literal('NONE'),
  migrationWrites: z.literal('NONE'),
  otherSlotExecution: z.literal('NONE'),
  scoring: z.literal('NONE'),
  f5SlotReuseRerunOrReplacement: z.literal('NONE'),
});

export const F7SlotAuthorisationSchema = z.strictObject({
  authorisationVersion: z.literal(F7_SLOT_AUTHORISATION_VERSION),
  scope: z.literal('DEVELOPMENT_ONLY'),
  studyId: z.literal(F6_STUDY_ID),

  // The owner-approved F6 restart freeze, its plan and its owner approval.
  f6FreezeRawSha256: z.literal(PROPOSED_F6_FREEZE_RAW_SHA256),
  f6FreezeRawBytes: z.literal(PROPOSED_F6_FREEZE_RAW_BYTES),
  f6PlanSha256: z.literal(PROPOSED_F6_PLAN_SHA256),
  f6OwnerFreezeApprovalRawSha256: z.literal(F6_APPROVAL_RECORD_RAW_SHA256),
  f6OwnerFreezeApprovalRawBytes: z.literal(F6_APPROVAL_RECORD_RAW_BYTES),
  // The approved F2 plan every F6 replicate re-runs.
  f2FreezeRawSha256: z.literal(PROPOSED_F2_FREEZE_RAW_SHA256),
  f2PlanSha256: z.literal(PROPOSED_F2_PLAN_SHA256),

  slotId: z.string().min(1),
  sequence: z.int().min(1).max(F2_N_REPLICATES),
  replicateNumber: z.int().min(1).max(F2_N_REPLICATES),
  variantName: z.literal(F2_VARIANT_NAME),

  semanticSourceCommit: z.literal(V6_SEMANTIC_SOURCE_COMMIT),
  reliabilityBaseCommit: z.literal(F0Z_RELIABILITY_BASE_COMMIT),
  integratedRuntimeCommit: z.literal(F2_INTEGRATED_RUNTIME_COMMIT),
  promptVersion: z.literal(V6_PROMPT_VERSION),
  promptSha256: z.literal(V6_PROMPT_SHA256),

  reliabilitySemanticsVersion: z.literal(RELIABILITY_SEMANTICS_V2),
  c2Implemented: z.literal(false),
  c2Status: z.literal('NOT_IMPLEMENTED'),

  /** The exact, already-committed F7 execution build; checked against the ACTUAL HEAD. */
  executionBuildCommit: GitSha,

  maxLogicalEvaluations: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
  frozenLogicalBatchOrdinals: z
    .array(z.int())
    .length(EXPECTED_LOGICAL_BATCHES_PER_VARIANT)
    .refine((ordinals) => ordinals.every((ordinal, index) => ordinal === index + 1), {
      message: `frozenLogicalBatchOrdinals must be exactly [1, 2, ..., ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT}] in order.`,
    }),
  documentCount: z.literal(EXPECTED_CORPUS_ITEM_COUNT),
  maxProviderRequests: z.literal(ATTEMPT4_MAX_PROVIDER_REQUESTS),
  maxAdapterAttempts: z.literal(ATTEMPT4_MAX_ADAPTER_ATTEMPTS),
  maxNonTerminalTimeoutsPerReplicate: z.literal(MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE),

  repairPolicy: z.strictObject({
    enabled: z.literal(true),
    maxRoundsPerLogicalEvaluation: z.literal(1),
    minimumRemainingBudgetMs: z.literal(REPAIR_MINIMUM_REMAINING_BUDGET_MS),
  }),

  requestedModelId: z.string().min(1),
  agentSdkVersion: z.literal(FROZEN_AGENT_SDK_VERSION),
  runConfig: z.strictObject({
    maxTurns: z.literal(FROZEN_DEFAULT_MAX_TURNS),
    thinking: z.literal('disabled'),
  }),
  frozenTimeouts: F3FrozenTimeoutsSchema,

  hostAwakeContractVersion: z.literal(F6_HOST_AWAKE_CONTRACT_VERSION),
  lidRule: z.literal(LID_OPEN_REQUIRED),

  prohibitions: F7ProhibitionsSchema,
  outputRoot: z.string().min(1),
  issuedAtUtc: UtcInstant,
  validUntilUtc: UtcInstant,
  operatorAuthorisationStatement: z.string().min(1),
});

export type F7SlotExecutionAuthorisation = z.infer<typeof F7SlotAuthorisationSchema>;

/** The frozen output root of one F6 slot, under the F6 study root. */
export function f7OutputRootOf(slot: F2SlotIdentity): string {
  return f2OutputRootPathOf(F7_STUDY_ROOT, slot);
}

export function buildF7SlotAuthorisationStatement(
  slot: F2SlotIdentity,
  executionBuildCommit: string,
  requestedModelId: string,
): string {
  return (
    `I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF F6 RESTART STUDY ${F6_STUDY_ID} SLOT ${slot.slotId} ` +
    `(SEQUENCE ${slot.sequence} OF ${F2_N_REPLICATES}, REPLICATE ${slot.replicateNumber}, VARIANT ${F2_VARIANT_NAME}): ` +
    `AT MOST ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT} LOGICAL EVALUATIONS (FROZEN ORDINALS 1..${EXPECTED_LOGICAL_BATCHES_PER_VARIANT}) ` +
    `OVER ${EXPECTED_CORPUS_ITEM_COUNT} DEVELOPMENT DOCUMENTS. ` +
    `AGAINST THE OWNER-APPROVED F6 RESTART FREEZE ${PROPOSED_F6_FREEZE_RAW_SHA256} (${PROPOSED_F6_FREEZE_RAW_BYTES} BYTES) ` +
    `WITH DERIVED PLAN ${PROPOSED_F6_PLAN_SHA256}, ` +
    `F6 OWNER FREEZE-APPROVAL RECORD ${F6_APPROVAL_RECORD_RAW_SHA256} (${F6_APPROVAL_RECORD_RAW_BYTES} BYTES), ` +
    `RE-RUNNING THE APPROVED F2 PLAN ${PROPOSED_F2_PLAN_SHA256} OF FREEZE ${PROPOSED_F2_FREEZE_RAW_SHA256}, ` +
    `SEMANTIC V6 SOURCE ${V6_SEMANTIC_SOURCE_COMMIT}, RELIABILITY BASE ${F0Z_RELIABILITY_BASE_COMMIT}, ` +
    `INTEGRATED RUNTIME ${F2_INTEGRATED_RUNTIME_COMMIT}, ` +
    `PROMPT ${V6_PROMPT_VERSION} SHA-256 ${V6_PROMPT_SHA256}, ` +
    `RELIABILITY SEMANTICS ${RELIABILITY_SEMANTICS_V2} (C2 NOT_IMPLEMENTED), ` +
    `REQUESTED MODEL ${requestedModelId}, AGENT SDK ${FROZEN_AGENT_SDK_VERSION}, MAX TURNS ${FROZEN_DEFAULT_MAX_TURNS}. ` +
    `EXECUTED ONLY BY F7 EXECUTION BUILD ${executionBuildCommit}, ` +
    `AT THE FROZEN OUTPUT ROOT ${f7OutputRootOf(slot)}, ` +
    `UNDER HOST-AWAKE CONTRACT ${F6_HOST_AWAKE_CONTRACT_VERSION} (${LID_OPEN_REQUIRED}). ` +
    `REPAIR POLICY ENABLED (ONE ROUND PER LOGICAL EVALUATION, ${REPAIR_MINIMUM_REMAINING_BUDGET_MS} MS USABLE-WINDOW FLOOR), ` +
    `AT MOST ${ATTEMPT4_MAX_PROVIDER_REQUESTS} PROVIDER REQUESTS, AT MOST ${ATTEMPT4_MAX_ADAPTER_ATTEMPTS} ADAPTER ATTEMPTS ` +
    `AND AT MOST ${MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE} NON-TERMINAL TIMEOUTS. ` +
    'NO HOLDOUT. NO GOLD ACCESS. NO GOLD LABEL, THRESHOLD OR PROMPT CHANGE. NO DATABASE OR MIGRATION WRITE. ' +
    'NO SCORING. NO REUSE, RERUN OR REPLACEMENT OF ANY F5 SLOT. ' +
    'NO EXECUTION OF ANY OTHER SLOT UNDER THIS AUTHORISATION.'
  );
}

/** One fresh candidate for `slot`. Every frozen field is derived; nothing is hand-typed. */
export function buildF7SlotCandidate(
  slot: F2SlotIdentity,
  executionBuildCommit: string,
  requestedModelId: string,
  issuedAtUtc: string,
  validUntilUtc: string,
): F7SlotExecutionAuthorisation {
  return {
    authorisationVersion: F7_SLOT_AUTHORISATION_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: F6_STUDY_ID,
    f6FreezeRawSha256: PROPOSED_F6_FREEZE_RAW_SHA256,
    f6FreezeRawBytes: PROPOSED_F6_FREEZE_RAW_BYTES,
    f6PlanSha256: PROPOSED_F6_PLAN_SHA256,
    f6OwnerFreezeApprovalRawSha256: F6_APPROVAL_RECORD_RAW_SHA256,
    f6OwnerFreezeApprovalRawBytes: F6_APPROVAL_RECORD_RAW_BYTES,
    f2FreezeRawSha256: PROPOSED_F2_FREEZE_RAW_SHA256,
    f2PlanSha256: PROPOSED_F2_PLAN_SHA256,
    slotId: slot.slotId,
    sequence: slot.sequence,
    replicateNumber: slot.replicateNumber,
    variantName: F2_VARIANT_NAME,
    semanticSourceCommit: V6_SEMANTIC_SOURCE_COMMIT,
    reliabilityBaseCommit: F0Z_RELIABILITY_BASE_COMMIT,
    integratedRuntimeCommit: F2_INTEGRATED_RUNTIME_COMMIT,
    promptVersion: V6_PROMPT_VERSION,
    promptSha256: V6_PROMPT_SHA256,
    reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    c2Implemented: false,
    c2Status: 'NOT_IMPLEMENTED',
    executionBuildCommit,
    maxLogicalEvaluations: EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
    frozenLogicalBatchOrdinals: Array.from(
      { length: EXPECTED_LOGICAL_BATCHES_PER_VARIANT },
      (_, index) => index + 1,
    ),
    documentCount: EXPECTED_CORPUS_ITEM_COUNT,
    maxProviderRequests: ATTEMPT4_MAX_PROVIDER_REQUESTS,
    maxAdapterAttempts: ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
    maxNonTerminalTimeoutsPerReplicate: MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
    repairPolicy: {
      enabled: true,
      maxRoundsPerLogicalEvaluation: 1,
      minimumRemainingBudgetMs: REPAIR_MINIMUM_REMAINING_BUDGET_MS,
    },
    requestedModelId,
    agentSdkVersion: FROZEN_AGENT_SDK_VERSION,
    runConfig: { maxTurns: FROZEN_DEFAULT_MAX_TURNS, thinking: 'disabled' },
    frozenTimeouts: {
      attemptSoftDeadlineMs: FROZEN_TIER1_SOFT_DEADLINE_MS,
      abortCloseSettlementGraceMs: FROZEN_TIER1_GRACE_MS,
      totalProviderCallBudgetMs: FROZEN_TIER1_TOTAL_BUDGET_MS,
      authStatusTimeoutMs: FROZEN_AUTH_STATUS_TIMEOUT_MS,
      maxTransientRetriesPerRequest: FROZEN_MAX_TRANSIENT_RETRIES,
      attemptsPerProviderRequest: FROZEN_MAX_TRANSIENT_RETRIES + 1,
    },
    hostAwakeContractVersion: F6_HOST_AWAKE_CONTRACT_VERSION,
    lidRule: LID_OPEN_REQUIRED,
    prohibitions: {
      holdout: 'NONE',
      goldAccess: 'NONE',
      goldLabelChanges: 'NONE',
      thresholdChanges: 'NONE',
      promptChanges: 'NONE',
      databaseWrites: 'NONE',
      migrationWrites: 'NONE',
      otherSlotExecution: 'NONE',
      scoring: 'NONE',
      f5SlotReuseRerunOrReplacement: 'NONE',
    },
    outputRoot: f7OutputRootOf(slot),
    issuedAtUtc,
    validUntilUtc,
    operatorAuthorisationStatement: buildF7SlotAuthorisationStatement(
      slot,
      executionBuildCommit,
      requestedModelId,
    ),
  };
}

export type F7SlotExecutionLockRefusal =
  | 'AUTHORISATION_PATH_ABSENT'
  | 'AUTHORISATION_PATH_NOT_ABSOLUTE'
  | 'AUTHORISATION_UNREADABLE'
  | 'SUPERSEDED_AUTHORISATION_PRESENTED'
  | 'PRIOR_STUDY_IDENTITY_PRESENTED'
  | 'AUTHORISATION_MALFORMED'
  | 'AUTHORISATION_SLOT_UNKNOWN'
  | 'AUTHORISATION_SLOT_MISMATCH'
  | 'AUTHORISATION_SLOT_FIELD_MISMATCH'
  | 'AUTHORISATION_MODEL_MISMATCH'
  | 'AUTHORISATION_STATEMENT_MISMATCH'
  | 'AUTHORISATION_EXPIRED'
  | 'AUTHORISATION_NOT_YET_VALID'
  | 'AUTHORISATION_OUTPUT_ROOT_MISMATCH'
  | 'EXECUTION_BUILD_MISMATCH'
  | 'AUTHORISATION_ALREADY_CONSUMED';

export type F7SlotExecutionLockDecision =
  | {
      readonly granted: true;
      readonly authorisation: F7SlotExecutionAuthorisation;
      readonly slot: F2SlotIdentity;
      readonly authorisationSha256: string;
      /** The byte length of the SAME read the SHA-256 came from. */
      readonly authorisationBytes: number;
    }
  | {
      readonly granted: false;
      readonly refusal: F7SlotExecutionLockRefusal;
      readonly detail: string;
    };

export interface F7SlotExecutionLockInput {
  readonly authorisationPath: string | null;
  readonly expected: { readonly slotId: string; readonly outputRoot: string };
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  /** SLOT-SCOPED: `outputRoot` is always the slot's OWN frozen output root. */
  readonly alreadyConsumed: (authorisationSha256: string, outputRoot: string) => boolean;
  readonly nowUtc: () => Date;
  readonly currentHead: () => string;
  /** The requested model id the approved freeze names. Never a literal in this namespace. */
  readonly expectedRequestedModelId: string;
  /** Resolves a slotId against the five F6 slots; throws on an unknown id. */
  readonly resolveSlot: (slotId: string) => F2SlotIdentity;
}

const refuse = (
  refusal: F7SlotExecutionLockRefusal,
  detail: string,
): F7SlotExecutionLockDecision => ({ granted: false, refusal, detail });

/**
 * Evaluates the per-slot F6 restart execution lock. `granted: true` means
 * "these exact bytes would be accepted for this slot, at this build, now" —
 * never that anything has been authorised by an owner or run.
 */
export function evaluateF7SlotExecutionLock(
  input: F7SlotExecutionLockInput,
): F7SlotExecutionLockDecision {
  if (input.authorisationPath === null) {
    return refuse(
      'AUTHORISATION_PATH_ABSENT',
      `no candidate exists for slot ${input.expected.slotId}.`,
    );
  }
  if (!isAbsolute(input.authorisationPath)) {
    return refuse('AUTHORISATION_PATH_NOT_ABSOLUTE', 'the authorisation path must be absolute.');
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
  if (typeof version === 'string' && F7_SUPERSEDED_AUTHORISATION_VERSIONS.includes(version)) {
    return refuse(
      'SUPERSEDED_AUTHORISATION_PRESENTED',
      `the file is a superseded authorisation (${version}); an F6 restart slot requires ${F7_SLOT_AUTHORISATION_VERSION}.`,
    );
  }
  const prior = priorStudyIdentityProblems(parsed);
  if (prior.length > 0) {
    return refuse(
      'PRIOR_STUDY_IDENTITY_PRESENTED',
      `the authorisation cannot be an F6 authority: ${prior.join('; ')}.`,
    );
  }
  const result = F7SlotAuthorisationSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return refuse(
      'AUTHORISATION_MALFORMED',
      `the authorisation does not match the closed F6 restart slot schema at ` +
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
  let slot: F2SlotIdentity;
  try {
    slot = input.resolveSlot(authorisation.slotId);
  } catch (error) {
    return refuse(
      'AUTHORISATION_SLOT_UNKNOWN',
      error instanceof Error ? error.message : String(error),
    );
  }
  const fieldMismatches: string[] = [];
  if (authorisation.sequence !== slot.sequence) fieldMismatches.push('sequence');
  if (authorisation.replicateNumber !== slot.replicateNumber) {
    fieldMismatches.push('replicateNumber');
  }
  if (authorisation.variantName !== slot.variantName) fieldMismatches.push('variantName');
  if (fieldMismatches.length > 0) {
    return refuse(
      'AUTHORISATION_SLOT_FIELD_MISMATCH',
      `the authorisation's own claims for slot ${slot.slotId} disagree with the frozen F6 slots on: ${fieldMismatches.join(', ')}.`,
    );
  }
  if (authorisation.requestedModelId !== input.expectedRequestedModelId) {
    return refuse(
      'AUTHORISATION_MODEL_MISMATCH',
      "the authorisation's requested model id is not the one the approved freeze names.",
    );
  }
  if (
    authorisation.operatorAuthorisationStatement !==
    buildF7SlotAuthorisationStatement(
      slot,
      authorisation.executionBuildCommit,
      authorisation.requestedModelId,
    )
  ) {
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
  if (
    authorisation.outputRoot !== f7OutputRootOf(slot) ||
    authorisation.outputRoot !== input.expected.outputRoot
  ) {
    return refuse(
      'AUTHORISATION_OUTPUT_ROOT_MISMATCH',
      `the authorised output root is not the frozen F6 root for ${slot.slotId}, or not the output root supplied to this invocation.`,
    );
  }
  const actualHead = input.currentHead();
  if (authorisation.executionBuildCommit !== actualHead) {
    return refuse(
      'EXECUTION_BUILD_MISMATCH',
      `the candidate binds execution build ${authorisation.executionBuildCommit}; the checked-out HEAD is ${actualHead}.`,
    );
  }
  if (input.alreadyConsumed(authorisationSha256, input.expected.outputRoot)) {
    return refuse(
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

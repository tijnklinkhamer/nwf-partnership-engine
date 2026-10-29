/**
 * PHASE 2B-2D2C-F3 — THE PER-SLOT FINAL-V6 EXECUTION LOCK.
 *
 * Modelled directly on `f0w/authorisationF0W.ts`, which is itself modelled on
 * `f0o/authorisationF0O.ts`: a versioned, `z.strictObject`-closed schema
 * pinning every study-wide identity as a literal, an authorisation statement
 * recomputed byte-for-byte from the SAME pinned identities the schema checks,
 * and an evaluate/verify-candidate-only pair. Five valid authorisations exist
 * simultaneously — one per replicate slot — so the fields that vary between
 * them (`slotId`, `sequence`, `replicateNumber`, `outputRoot`) are
 * cross-checked against the injected, request-free F3 slot registry
 * (`slotRegistryF3.ts`), never taken on the candidate's own say-so.
 *
 * A NEW, ADDITIVE, CLOSED VERSION — NEVER A WIDENED HISTORICAL ONE.
 * `F0WSlotAuthorisationSchema` is pinned to `REPLICATION_V4_V5_N5`,
 * `PROMPT_V4_CANONICAL`/`PROMPT_V5_CANONICAL` and historical attempts 3/4,
 * and its `prohibitions` block carries `v6OrFutureVariantScheduling: 'NONE'`
 * — a field that would be self-contradictory in a V6 study. Coercing V6 into
 * it would mean widening three closed unions and inventing a `pairNumber`
 * for a study that has no pairs. This module therefore SUPERSEDES rather
 * than mutates, exactly as ATTEMPT_1/2/3/4 and F0W_SLOT_AUTHORISATION each
 * superseded their predecessor. Both schemas being `strictObject` and
 * carrying disjoint `prohibitions` keys makes the separation structural: an
 * F0W candidate cannot parse here and an F3 candidate cannot parse there,
 * without either evaluator having to recognise the other.
 *
 * WHAT THIS LOCK ADDS OVER F0W, AND WHY. It binds the EXECUTION BUILD on the
 * candidate itself (`executionBuildCommit`, cross-checked against the
 * actually checked-out HEAD through an injected probe). F0W bound the build
 * only on the study-level approval. Requiring it in BOTH places is strictly
 * stronger: a candidate materialised against one build can never be replayed
 * by a later one, even if a study approval naming that later build were
 * somehow produced. No F0X gate is weakened; one is added.
 *
 * NO MODEL-ID LITERAL LIVES HERE. `phase1a.firewall.test.ts` confines Claude
 * model ids to `allowedModels.ts`, so `requestedModelId` is cross-checked
 * against the value the APPROVED F2 FREEZE itself carries (supplied by the
 * registry), never against a string written in this namespace.
 *
 * No production constructor exists for a GRANTED decision outside this
 * evaluator, there is no environment-variable or flag bypass, and this module
 * creates no candidate, no output root and no consumption marker of its own.
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
  RELIABILITY_SEMANTICS_V1_HISTORICAL,
  RELIABILITY_SEMANTICS_V2,
} from '../constants.js';
import {
  ATTEMPT4_AUTHORISATION_VERSION,
  ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT4_MAX_PROVIDER_REQUESTS,
  ATTEMPT_1_AUTHORISATION_VERSION,
  ATTEMPT_2_AUTHORISATION_VERSION,
  ATTEMPT_3_AUTHORISATION_VERSION,
} from '../f0o/authorisationF0O.js';
import { F0W_SLOT_AUTHORISATION_VERSION } from '../f0w/authorisationF0W.js';
import { F0X_RECOVERY_1_SLOT_AUTHORISATION_VERSION } from '../f0x/recovery1Authority.js';
import {
  F0Z_RELIABILITY_BASE_COMMIT,
  F2_APPROVAL_RECORD_RAW_BYTES,
  F2_APPROVAL_RECORD_RAW_SHA256,
  F2_INTEGRATED_RUNTIME_COMMIT,
  F2_STUDY_ROOT,
  PROPOSED_F2_FREEZE_RAW_BYTES,
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
import { F3SlotRegistryError } from './slotRegistryF3.js';

export const F3_STUDY_ID = 'FINAL_V6_DEV_N5';
export const F3_SLOT_AUTHORISATION_VERSION = 'phase2b-2d2c-f3-v6-slot-authorisation-v1';

/** Every historical per-slot/per-attempt authorisation version this lock names and refuses BY VALUE. */
export const SUPERSEDED_AUTHORISATION_VERSIONS: readonly string[] = Object.freeze([
  ATTEMPT_1_AUTHORISATION_VERSION,
  ATTEMPT_2_AUTHORISATION_VERSION,
  ATTEMPT_3_AUTHORISATION_VERSION,
  ATTEMPT4_AUTHORISATION_VERSION,
  F0W_SLOT_AUTHORISATION_VERSION,
  F0X_RECOVERY_1_SLOT_AUTHORISATION_VERSION,
]);

const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
const UtcInstant = z.iso.datetime({ offset: false });

/**
 * The prohibitions a V6 candidate carries. Deliberately NOT F0W's block:
 * `v6OrFutureVariantScheduling` is absent (it would be self-contradictory
 * here) and `scoring` is present (the owner's brief §3 requires it, and
 * scoring is separately authorised only after all five slots are terminal).
 * The two blocks are therefore disjoint under `strictObject`, which is what
 * makes an F0W candidate structurally unparseable as an F3 one.
 */
export const F3ProhibitionsSchema = z.strictObject({
  holdout: z.literal('NONE'),
  goldLabelChanges: z.literal('NONE'),
  thresholdChanges: z.literal('NONE'),
  promptChanges: z.literal('NONE'),
  databaseWrites: z.literal('NONE'),
  migrationWrites: z.literal('NONE'),
  otherSlotExecution: z.literal('NONE'),
  scoring: z.literal('NONE'),
});

/** The frozen Tier-1 timeout/retry constants, restated so a drifted candidate is refused. */
export const F3FrozenTimeoutsSchema = z.strictObject({
  attemptSoftDeadlineMs: z.literal(FROZEN_TIER1_SOFT_DEADLINE_MS),
  abortCloseSettlementGraceMs: z.literal(FROZEN_TIER1_GRACE_MS),
  totalProviderCallBudgetMs: z.literal(FROZEN_TIER1_TOTAL_BUDGET_MS),
  authStatusTimeoutMs: z.literal(FROZEN_AUTH_STATUS_TIMEOUT_MS),
  maxTransientRetriesPerRequest: z.literal(FROZEN_MAX_TRANSIENT_RETRIES),
  attemptsPerProviderRequest: z.literal(FROZEN_MAX_TRANSIENT_RETRIES + 1),
});

export const F3SlotAuthorisationSchema = z.strictObject({
  authorisationVersion: z.literal(F3_SLOT_AUTHORISATION_VERSION),
  scope: z.literal('DEVELOPMENT_ONLY'),
  studyId: z.literal(F3_STUDY_ID),

  // The approved F2 freeze, its derived plan, and the owner freeze-approval
  // record — all four identities pinned by exact value AND exact byte length.
  f2FreezeRawSha256: z.literal(PROPOSED_F2_FREEZE_RAW_SHA256),
  f2FreezeRawBytes: z.literal(PROPOSED_F2_FREEZE_RAW_BYTES),
  f2PlanSha256: z.literal(PROPOSED_F2_PLAN_SHA256),
  f2OwnerFreezeApprovalRawSha256: z.literal(F2_APPROVAL_RECORD_RAW_SHA256),
  f2OwnerFreezeApprovalRawBytes: z.literal(F2_APPROVAL_RECORD_RAW_BYTES),

  // The slot's own identity. Cross-checked against the registry below.
  slotId: z.string().min(1),
  sequence: z.int().min(1).max(F2_N_REPLICATES),
  replicateNumber: z.int().min(1).max(F2_N_REPLICATES),
  variantName: z.literal(F2_VARIANT_NAME),

  // The two lineages and the runtime they compose to.
  semanticSourceCommit: z.literal(V6_SEMANTIC_SOURCE_COMMIT),
  reliabilityBaseCommit: z.literal(F0Z_RELIABILITY_BASE_COMMIT),
  integratedRuntimeCommit: z.literal(F2_INTEGRATED_RUNTIME_COMMIT),
  promptVersion: z.literal(V6_PROMPT_VERSION),
  promptSha256: z.literal(V6_PROMPT_SHA256),

  // Reliability semantics, and C2's deliberate absence.
  reliabilitySemanticsVersion: z.literal(RELIABILITY_SEMANTICS_V2),
  c2Implemented: z.literal(false),
  c2Status: z.literal('NOT_IMPLEMENTED'),

  /**
   * The exact, already-committed F3 execution-control build this candidate
   * may be consumed by. Never a literal this build can pin on itself (a
   * commit cannot know its own SHA while it is being written); checked
   * against the ACTUAL checked-out HEAD through an injected probe.
   */
  executionBuildCommit: GitSha,

  // The frozen per-replicate work and its ceilings.
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

  /** Cross-checked against the APPROVED FREEZE's own value, never a literal here. */
  requestedModelId: z.string().min(1),
  agentSdkVersion: z.literal(FROZEN_AGENT_SDK_VERSION),
  runConfig: z.strictObject({
    maxTurns: z.literal(FROZEN_DEFAULT_MAX_TURNS),
    thinking: z.literal('disabled'),
  }),
  frozenTimeouts: F3FrozenTimeoutsSchema,

  prohibitions: F3ProhibitionsSchema,
  outputRoot: z.string().min(1),
  issuedAtUtc: UtcInstant,
  validUntilUtc: UtcInstant,
  operatorAuthorisationStatement: z.string().min(1),
});

export type F3SlotExecutionAuthorisation = z.infer<typeof F3SlotAuthorisationSchema>;

/**
 * The one unmistakable owner statement for a given slot and execution build.
 * Every identity in it is a literal pin from this module's imports or from
 * the caller-supplied build/model — never a hand-typed duplicate.
 */
export function buildF3SlotAuthorisationStatement(
  slot: F2SlotIdentity,
  executionBuildCommit: string,
  requestedModelId: string,
): string {
  return (
    `I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF FINAL-V6 STUDY SLOT ${slot.slotId} ` +
    `(SEQUENCE ${slot.sequence} OF ${F2_N_REPLICATES}, REPLICATE ${slot.replicateNumber}, VARIANT ${F2_VARIANT_NAME}): ` +
    `AT MOST ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT} LOGICAL EVALUATIONS (FROZEN ORDINALS 1..${EXPECTED_LOGICAL_BATCHES_PER_VARIANT}) ` +
    `OVER ${EXPECTED_CORPUS_ITEM_COUNT} DEVELOPMENT DOCUMENTS. ` +
    `AGAINST THE OWNER-APPROVED F2 FREEZE ${PROPOSED_F2_FREEZE_RAW_SHA256} (${PROPOSED_F2_FREEZE_RAW_BYTES} BYTES) ` +
    `WITH DERIVED PLAN ${PROPOSED_F2_PLAN_SHA256}, ` +
    `OWNER FREEZE-APPROVAL RECORD ${F2_APPROVAL_RECORD_RAW_SHA256} (${F2_APPROVAL_RECORD_RAW_BYTES} BYTES), ` +
    `SEMANTIC V6 SOURCE ${V6_SEMANTIC_SOURCE_COMMIT}, RELIABILITY BASE ${F0Z_RELIABILITY_BASE_COMMIT}, ` +
    `INTEGRATED RUNTIME ${F2_INTEGRATED_RUNTIME_COMMIT}, ` +
    `PROMPT ${V6_PROMPT_VERSION} SHA-256 ${V6_PROMPT_SHA256}, ` +
    `RELIABILITY SEMANTICS ${RELIABILITY_SEMANTICS_V2} (C2 NOT_IMPLEMENTED), ` +
    `REQUESTED MODEL ${requestedModelId}, AGENT SDK ${FROZEN_AGENT_SDK_VERSION}, MAX TURNS ${FROZEN_DEFAULT_MAX_TURNS}. ` +
    `EXECUTED ONLY BY F3 EXECUTION-CONTROL BUILD ${executionBuildCommit}, ` +
    `AT THE FROZEN OUTPUT ROOT ${f2OutputRootPathOf(F2_STUDY_ROOT, slot)}. ` +
    `REPAIR POLICY ENABLED (ONE ROUND PER LOGICAL EVALUATION, ${REPAIR_MINIMUM_REMAINING_BUDGET_MS} MS USABLE-WINDOW FLOOR), ` +
    `AT MOST ${ATTEMPT4_MAX_PROVIDER_REQUESTS} PROVIDER REQUESTS, AT MOST ${ATTEMPT4_MAX_ADAPTER_ATTEMPTS} ADAPTER ATTEMPTS ` +
    `AND AT MOST ${MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE} NON-TERMINAL TIMEOUTS. ` +
    'NO HOLDOUT. NO GOLD LABEL, THRESHOLD OR PROMPT CHANGE. NO DATABASE OR MIGRATION WRITE. ' +
    'NO SCORING. NO EXECUTION OF ANY OTHER SLOT UNDER THIS AUTHORISATION.'
  );
}

export type F3SlotExecutionLockRefusal =
  | 'EXECUTE_FLAG_ABSENT'
  | 'AUTHORISATION_PATH_ABSENT'
  | 'AUTHORISATION_PATH_NOT_ABSOLUTE'
  | 'AUTHORISATION_UNREADABLE'
  | 'SUPERSEDED_AUTHORISATION_PRESENTED'
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

export type F3SlotExecutionLockDecision =
  | {
      readonly granted: true;
      readonly authorisation: F3SlotExecutionAuthorisation;
      readonly slot: F2SlotIdentity;
      /** SHA-256 of the exact authorisation bytes — the identity a consumption marker records. */
      readonly authorisationSha256: string;
      /**
       * The exact byte length of the SAME read this SHA-256 was computed
       * from — never a second, independently re-read length, so a caller
       * that also cross-checks an approval's `candidateAuthorisationBytes`
       * cannot suffer a TOCTOU split.
       */
      readonly authorisationBytes: number;
    }
  | {
      readonly granted: false;
      readonly refusal: F3SlotExecutionLockRefusal;
      readonly detail: string;
    };

export interface F3SlotExecutionLockInput {
  readonly executeFlag: boolean;
  readonly authorisationPath: string | null;
  /** What the runner itself verified and will use for THIS invocation. */
  readonly expected: {
    readonly slotId: string;
    readonly outputRoot: string;
  };
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  /**
   * SLOT-SCOPED: `outputRoot` is always the slot's OWN frozen output root —
   * never a study-wide root. A consumption marker under one slot's output
   * root must never be read as spending a DIFFERENT slot's candidate.
   */
  readonly alreadyConsumed: (authorisationSha256: string, outputRoot: string) => boolean;
  readonly nowUtc: () => Date;
  /** The ACTUAL currently checked-out HEAD, request-free (production: `git rev-parse HEAD`). */
  readonly currentHead: () => string;
  /** The requested model id the APPROVED F2 FREEZE names. Never a literal in this namespace. */
  readonly expectedRequestedModelId: string;
  /** Resolves a slotId against the frozen F3 registry; throws F3SlotRegistryError on an unknown id. */
  readonly resolveSlot: (slotId: string) => F2SlotIdentity;
}

const refuse = (
  refusal: F3SlotExecutionLockRefusal,
  detail: string,
): F3SlotExecutionLockDecision => ({ granted: false, refusal, detail });

/**
 * Evaluates the per-slot final-V6 execution lock. A caller that presents only
 * one half, a superseded lineage's authorisation, a candidate whose claimed
 * slot fields disagree with the frozen registry, a candidate for a DIFFERENT
 * slot than this invocation expects, a candidate built for a different
 * execution build, or any value the closed schema does not accept never
 * reaches a granted decision.
 */
export function evaluateF3SlotExecutionLock(
  input: F3SlotExecutionLockInput,
): F3SlotExecutionLockDecision {
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
  // Every superseded lineage is named and refused BY VALUE, before the closed
  // schema runs, so the refusal says WHICH historical authorisation was
  // presented rather than a generic shape error.
  const version = (parsed as { authorisationVersion?: unknown } | null)?.authorisationVersion;
  if (typeof version === 'string' && SUPERSEDED_AUTHORISATION_VERSIONS.includes(version)) {
    return refuse(
      'SUPERSEDED_AUTHORISATION_PRESENTED',
      `the file is a superseded authorisation (${version}); a final-V6 slot requires ${F3_SLOT_AUTHORISATION_VERSION}.`,
    );
  }
  const result = F3SlotAuthorisationSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return refuse(
      'AUTHORISATION_MALFORMED',
      `the authorisation does not match the closed final-V6 slot schema at ` +
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
    if (error instanceof F3SlotRegistryError) {
      return refuse('AUTHORISATION_SLOT_UNKNOWN', error.message);
    }
    throw error;
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
      `the authorisation's own claims for slot ${slot.slotId} disagree with the frozen registry on: ${fieldMismatches.join(', ')}.`,
    );
  }
  if (authorisation.requestedModelId !== input.expectedRequestedModelId) {
    return refuse(
      'AUTHORISATION_MODEL_MISMATCH',
      "the authorisation's requested model id is not the one the approved F2 freeze names.",
    );
  }
  const expectedStatement = buildF3SlotAuthorisationStatement(
    slot,
    authorisation.executionBuildCommit,
    authorisation.requestedModelId,
  );
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
  const expectedOutputRoot = f2OutputRootPathOf(F2_STUDY_ROOT, slot);
  if (
    authorisation.outputRoot !== expectedOutputRoot ||
    authorisation.outputRoot !== input.expected.outputRoot
  ) {
    return refuse(
      'AUTHORISATION_OUTPUT_ROOT_MISMATCH',
      `the authorised output root is not the frozen root for ${slot.slotId}, or not the output root supplied to this invocation.`,
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

/**
 * VERIFICATION ONLY. Evaluates every check of the per-slot lock against a
 * CANDIDATE authorisation file exactly as the execution path would, and
 * returns the decision. It grants nothing: it constructs no provider,
 * launches no child and writes no marker. A `granted: true` here means "this
 * exact byte sequence WOULD be accepted if the owner issued a study approval
 * naming it and presented it with --execute"; it never means that it has been.
 */
export function verifyF3SlotAuthorisationCandidate(
  input: Omit<F3SlotExecutionLockInput, 'executeFlag'>,
): F3SlotExecutionLockDecision {
  return evaluateF3SlotExecutionLock({ ...input, executeFlag: true });
}

/** Re-exported so a reader of this module can see the v1 name it refuses without importing constants. */
export { RELIABILITY_SEMANTICS_V1_HISTORICAL, RELIABILITY_SEMANTICS_V2 };

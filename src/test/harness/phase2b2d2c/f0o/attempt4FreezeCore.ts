/**
 * PHASE 2B-2D2C-F0O — THE SHARED CORE for loading, hash-verifying and
 * DERIVING from an ATTEMPT-4 configuration freeze (PROPOSED, preparation
 * only - no owner freeze approval and no execution authorisation exists).
 *
 * Modelled deliberately on `attempt3FreezeCore.ts`, which stays byte-for-byte
 * unmodified: F0I and attempt 3 remain immutable historical evidence, and a
 * SEPARATE module for attempt 4 is what keeps that true structurally rather
 * than by convention. Every schema rule, cross-check and derivation here is
 * the SAME shape as attempt 3's, with exactly two generalisations:
 *
 *   1. The scheduled candidate is `PROMPT_V5_CANONICAL` (attempt 3's schema
 *      hard-codes `PROMPT_V4_CANONICAL` as a literal, so it cannot load an
 *      attempt-4 freeze without this parallel module).
 *   2. Each batch now carries a THIRD read-only comparator map,
 *      `attempt3ComparatorFinalInputSha256`, alongside the unchanged
 *      `attempt1ComparatorFinalInputSha256` and `attempt2ComparatorFinalInputSha256`
 *      - because attempt 4 compares against ALL THREE preserved attempts,
 *      never reruns any of them.
 *
 * Nothing here writes, authorises or creates an artifact of any kind. Pure
 * aside from the injected bytes. No network, no database, no clock, no
 * filesystem, no Git. No provider call, no SDK, no inference.
 *
 * NO EXECUTION LOCK, NO CLI AND NO SCORER FAMILY EXIST FOR ATTEMPT 4. F0O is
 * freeze preparation only; a future, separately-reviewed slice (an F0J
 * equivalent) would build those, and this module deliberately does not
 * pre-empt it.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { computeFinalInputSha256 } from '../../../../orgunits/classify/finalIdentity.js';
import {
  REPAIR_ATTEMPT_SOFT_DEADLINE_MS,
  REPAIR_HARD_KILL_GRACE_MS,
  REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION,
  REPAIR_MINIMUM_REMAINING_BUDGET_MS,
  REPAIR_TOTAL_BUDGET_MS,
} from '../../../../orgunits/classify/repair.js';
import {
  EXPECTED_F0B_FREEZE_RAW_SHA256,
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
  FROZEN_AGENT_SDK_VERSION,
  FROZEN_AUTH_STATUS_TIMEOUT_MS,
  FROZEN_CLAUDE_CODE_VERSION,
  FROZEN_MAX_TRANSIENT_RETRIES,
  FROZEN_POSIX_USER_VARIABLE,
  FROZEN_RUN_CONFIG,
  FROZEN_RUN_PLATFORM,
  FROZEN_STDERR_TAIL_MAX_CHARS,
  FROZEN_TIER1_GRACE_MS,
  FROZEN_TIER1_SOFT_DEADLINE_MS,
  FROZEN_TIER1_TOTAL_BUDGET_MS,
  FROZEN_TIER2_GRACE_MS,
  FROZEN_TIER2_WATCHDOG_MS,
  REQUIRED_CAPTURE_FIELDS,
  STOP_CONDITIONS,
} from '../constants.js';
import {
  FrozenBatchContextSchema,
  FrozenChildEnvironmentSchema,
  FrozenClaudeCodeExecutableSchema,
  RepairPolicySchema,
} from '../freeze.js';

export const ATTEMPT_4_NO = 4;
export const ATTEMPT_4_STATUS = 'PROPOSED_PENDING_OWNER_FREEZE_APPROVAL';
/** The ONE attempt-4 variant name and label. */
export const ATTEMPT_4_VARIANT_NAME = 'PROMPT_V5_CANONICAL';
export const ATTEMPT_4_VARIANT_LABEL = 'PROMPT_V5_CANDIDATE';

/** The attempt-1 variants that must NEVER appear in an attempt-4 plan. */
export const ATTEMPT_1_VARIANT_NAMES = ['PROMPT_V1_CANONICAL', 'PROMPT_V2_CANONICAL'] as const;
/** The attempt-2 variant that must NEVER be re-run for attempt 4 - only read as a comparator. */
export const ATTEMPT_2_VARIANT_NAME = 'PROMPT_V3_CANONICAL';
/** The attempt-3 variant that must NEVER be re-run for attempt 4 - only read as a comparator. */
export const ATTEMPT_3_VARIANT_NAME = 'PROMPT_V4_CANONICAL';

/** The identity of the one attempt-4 variant, as the revision pins it. */
export interface Attempt4VariantIdentity {
  readonly name: typeof ATTEMPT_4_VARIANT_NAME;
  readonly label: typeof ATTEMPT_4_VARIANT_LABEL;
  readonly role: 'candidate';
  readonly order: 1;
  readonly gitCommit: string;
  readonly runtimeBaseCommit: string;
  readonly promptVersion: string;
  readonly runtimePromptSha256: string;
  readonly runtimePromptCharacters: number;
  readonly runtimePromptUtf8Bytes: number;
}

/** Everything that distinguishes one attempt-4 freeze revision from another. Only one exists so far: F0O. */
export interface Attempt4FreezeRevision {
  readonly label: 'F0O';
  readonly freezePath: string;
  readonly rawSha256: string;
  readonly rawBytes: number;
  readonly freezeId: string;
  readonly version: string;
  readonly freezeRevision: string;
  readonly variant: Attempt4VariantIdentity;
  readonly freezeBranchBasedOn: string;
}

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);

const Attempt4VariantSchema = z.strictObject({
  name: z.literal(ATTEMPT_4_VARIANT_NAME),
  label: z.literal(ATTEMPT_4_VARIANT_LABEL),
  role: z.literal('candidate'),
  order: z.literal(1),
  gitCommit: GitSha,
  runtimeBaseCommit: GitSha,
  promptVersion: z.string().min(1),
  runtimePromptCharacters: z.int().min(1),
  runtimePromptUtf8Bytes: z.int().min(1),
  runtimePromptSha256: Sha256,
});

export const Attempt4BatchSchema = z.strictObject({
  ordinal: z.int().min(1),
  organisationId: z.string().min(1),
  echeRowKey: z.string().min(1),
  organisationName: z.string().min(1),
  documentCount: z.int().min(1),
  goldIds: z.array(z.string().regex(/^g[0-9a-f]{16}$/)).min(1),
  docIndices: z.array(z.int().min(0)).min(1),
  corpusLineNumbers: z.array(z.int().min(1)).min(1),
  historicalAssemblyInputSha256: z.array(Sha256).min(1),
  context: FrozenBatchContextSchema,
  serializedBatchUtf8Bytes: z.int().min(1),
  assemblyInputSha256: Sha256,
  canonicalSerializedInputSha256: Sha256,
  finalInputSha256: z.strictObject({ PROMPT_V5_CANONICAL: Sha256 }),
  attempt1ComparatorFinalInputSha256: z.strictObject({
    PROMPT_V1_CANONICAL: Sha256,
    PROMPT_V2_CANONICAL: Sha256,
  }),
  attempt2ComparatorFinalInputSha256: z.strictObject({
    PROMPT_V3_CANONICAL: Sha256,
  }),
  attempt3ComparatorFinalInputSha256: z.strictObject({
    PROMPT_V4_CANONICAL: Sha256,
  }),
  callCeiling: z.strictObject({
    originalRequests: z.literal(1),
    maxEligibleRejectedDocuments: z.int().min(1),
    maxRepairRequests: z.int().min(1),
    maxProviderRequests: z.int().min(2),
    maxAdapterAttempts: z.int().min(3),
  }),
});

/** Only the fields the derivation reads are closed; prose fields pass through. */
export function createAttempt4FreezeSchema(rev: Attempt4FreezeRevision) {
  return z.looseObject({
    freezeId: z.literal(rev.freezeId),
    version: z.literal(rev.version),
    status: z.literal(ATTEMPT_4_STATUS),
    freezeRevision: z.literal(rev.freezeRevision),
    attemptNo: z.literal(ATTEMPT_4_NO),
    approvalModel: z.looseObject({ thisFileAuthorises: z.array(z.never()).length(0) }),
    ownerApprovalRequired: z.array(z.string().min(1)).min(1),
    /** All three preserved attempts, byte-unchanged, never superseded (attempt 4 is a DIFFERENT attempt, not a correction). */
    predecessor: z.looseObject({
      attempt1: z.looseObject({
        file: z.literal('docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json'),
        rawSha256: z.literal(EXPECTED_F0B_FREEZE_RAW_SHA256),
        role: z.literal('HISTORICAL_ATTEMPT_1_CONFIGURATION_BYTE_UNCHANGED'),
      }),
      attempt2: z.looseObject({
        file: z.literal('docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0E_V1.json'),
        rawSha256: Sha256,
        approvalRecordFile: z.string().min(1),
        approvalRecordRawSha256: Sha256,
        primaryArtifactInventorySha256: Sha256,
        primaryArtifactCount: z.int().min(1),
        repairArtifactInventorySha256: Sha256,
        repairArtifactCount: z.int().min(0),
        authorisationSha256: Sha256,
        planSha256: Sha256,
        role: z.literal('HISTORICAL_ATTEMPT_2_CONFIGURATION_BYTE_UNCHANGED'),
      }),
      attempt3: z.looseObject({
        file: z.literal('docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0I_V1.json'),
        rawSha256: Sha256,
        approvalRecordFile: z.string().min(1),
        approvalRecordRawSha256: Sha256,
        // Attempt 3, like attempt 2, carries a repair round, so its evidence
        // inventory is measured as TWO separate hashes (primary vs repair-1),
        // exactly as F0K's own closure table reports it.
        primaryArtifactInventorySha256: Sha256,
        primaryArtifactCount: z.int().min(1),
        repairArtifactInventorySha256: Sha256,
        repairArtifactCount: z.int().min(0),
        authorisationSha256: Sha256,
        planSha256: Sha256,
        role: z.literal('HISTORICAL_ATTEMPT_3_CONFIGURATION_BYTE_UNCHANGED'),
      }),
    }),
    git: z.looseObject({
      repository: z.string().min(1),
      v5Runtime: z.looseObject({ commit: GitSha, basedOn: GitSha }),
      v4Runtime: z.looseObject({ commit: GitSha, basedOn: GitSha }),
      r1RepairReliability: z.looseObject({ commit: GitSha }),
      freezeBranchBasedOn: GitSha,
    }),
    corpus: z.looseObject({
      scope: z.literal('DEVELOPMENT'),
      itemCount: z.int().min(1),
      canonicalCorpusPath: z.string().min(1),
      canonicalManifestPath: z.string().min(1),
      derivedCorpusRawSha256: Sha256,
      derivedManifestRawSha256: Sha256,
      derivedCorpusContentSha256: Sha256,
      holdoutFilesNeverRead: z.array(z.string().min(1)),
    }),
    batching: z.looseObject({
      groupBy: z.literal('organisationId'),
      logicalBatchesPerVariant: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
      concurrency: z.literal(1),
      execution: z.literal('sequential'),
      plannedLogicalEvaluations: z.strictObject({
        total: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
        perVariant: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
      }),
      /** V1, V2, V3 AND V4 - all four prior variants - are read-only comparators for attempt 4, never rerun. */
      priorVariantsNotScheduled: z.tuple([
        z.literal('PROMPT_V1_CANONICAL'),
        z.literal('PROMPT_V2_CANONICAL'),
        z.literal('PROMPT_V3_CANONICAL'),
        z.literal('PROMPT_V4_CANONICAL'),
      ]),
      plan: z.array(Attempt4BatchSchema).length(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
    }),
    inputConstruction: z.looseObject({
      context: z.looseObject({
        ruleVersion: z.string().min(1),
        fetchPolicyVersion: z.string().min(1),
        assemblyVersion: z.string().min(1),
        rootKey: z.null(),
      }),
      promptVersionByVariant: z.strictObject({ PROMPT_V5_CANONICAL: z.string().min(1) }),
    }),
    classifier: z.looseObject({
      requestedModelId: z.string().min(1),
      agentSdk: z.looseObject({ package: z.string().min(1), version: z.string().min(1) }),
      assemblyVersion: z.string().min(1),
      outputSchemaVersion: z.string().min(1),
      runConfig: z.strictObject({ maxTurns: z.literal(3), thinking: z.literal('disabled') }),
      variants: z.array(Attempt4VariantSchema).length(1),
      claudeCodeExecutable: FrozenClaudeCodeExecutableSchema,
      childEnvironment: FrozenChildEnvironmentSchema,
    }),
    repairPolicy: RepairPolicySchema,
    repairContract: z.looseObject({
      minimumRemainingBudgetMsStatus: z.string().min(1),
      rules: z.array(z.string().min(1)).min(12),
      repairDeadlineFormula: z.looseObject({
        statement: z.string().min(1),
        softDeadlineMs: z.int(),
        hardKillGraceMs: z.int(),
        totalBudgetMs: z.int(),
        implementation: z.array(z.string().min(1)).min(6),
      }),
      minimumRemainingBudgetMsOptions: z.looseObject({
        authStatusUpperBoundMs: z.int(),
        measuredOnAttempt1: z.looseObject({ slowestFullEvaluationWallMs: z.int() }),
        options: z
          .array(
            z.looseObject({
              usableFloorMs: z.int(),
              status: z.enum(['SELECTED_BY_OWNER_2026_09_14', 'REJECTED_BY_OWNER_2026_09_14']),
              remainingFloorMs: z.int(),
              worstCaseInferenceWindowAfterMaxAuthStatusMs: z.int(),
            }),
          )
          .min(2),
        recommendation: z.string().min(1),
      }),
    }),
    callCeiling: z.looseObject({
      maxTransientRetriesPerRequest: z.int(),
      perLogicalEvaluation: z.array(
        z.strictObject({
          ordinal: z.int().min(1),
          originalRequests: z.literal(1),
          maxEligibleRejectedDocuments: z.int().min(1),
          maxRepairRequests: z.int().min(1),
          maxProviderRequests: z.int().min(2),
          maxAdapterAttempts: z.int().min(3),
        }),
      ),
      totals: z.strictObject({
        logicalEvaluations: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
        originalRequests: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
        documents: z.int().min(1),
        maxRepairRequests: z.int().min(1),
        maxProviderRequests: z.int().min(1),
        maxAdapterAttempts: z.int().min(1),
      }),
    }),
    liveness: z.looseObject({
      tier1: z.looseObject({
        attemptSoftDeadlineMs: z.int(),
        abortCloseSettlementGraceMs: z.int(),
        totalProviderCallBudgetMs: z.int(),
        transientRetries: z.looseObject({
          maxAfterFirstAttempt: z.int(),
          backoffMs: z.array(z.int()),
        }),
      }),
      tier2: z.looseObject({
        parentWatchdogMs: z.int(),
        gracefulTerminationWindowMs: z.int(),
        stderrTailMaxChars: z.int(),
        watchdogDerivationMs: z.looseObject({
          authStatusRunnerTimeout: z.int(),
          providerAttemptWindow: z.int(),
          finalInnerCloseGrace: z.int(),
          childStartupArtifactFlushAndSchedulingVariance: z.int(),
          total: z.int(),
        }),
      }),
      sharedBudgetRule: z.looseObject({
        perEvaluationWorstCaseMs: z.looseObject({ total: z.int() }),
        tier2Sufficiency: z.looseObject({ watchdogMs: z.int(), claim: z.string().min(1) }),
      }),
    }),
    stopConditions: z.looseObject({
      conditions: z.array(z.looseObject({ id: z.string().min(1), meaning: z.string().min(1) })),
    }),
    outputCapture: z.looseObject({ requiredPerLogicalBatch: z.array(z.string().min(1)) }),
    scoring: z.looseObject({
      gates: z.record(z.string(), z.number()),
      acceptanceRule: z.string().min(1),
      comparatorPolicy: z.looseObject({
        attempt1: z.looseObject({
          freezeRawSha256: z.literal(EXPECTED_F0B_FREEZE_RAW_SHA256),
          artifactInventorySha256: Sha256,
          artifactCount: z.int().min(1),
          authorisationSha256: Sha256,
          planSha256: Sha256,
          readOnly: z.literal(true),
          neverInsideAttempt4Namespace: z.literal(true),
        }),
        attempt2: z.looseObject({
          freezeRawSha256: Sha256,
          primaryArtifactInventorySha256: Sha256,
          primaryArtifactCount: z.int().min(1),
          repairArtifactInventorySha256: Sha256,
          repairArtifactCount: z.int().min(0),
          authorisationSha256: Sha256,
          planSha256: Sha256,
          readOnly: z.literal(true),
          neverInsideAttempt4Namespace: z.literal(true),
        }),
        attempt3: z.looseObject({
          freezeRawSha256: Sha256,
          primaryArtifactInventorySha256: Sha256,
          primaryArtifactCount: z.int().min(1),
          repairArtifactInventorySha256: Sha256,
          repairArtifactCount: z.int().min(0),
          authorisationSha256: Sha256,
          planSha256: Sha256,
          readOnly: z.literal(true),
          neverInsideAttempt4Namespace: z.literal(true),
        }),
        stochasticCaveat: z.string().min(1),
      }),
      scoringInputs: z.looseObject({
        devLabelsFixture: z.looseObject({ path: z.string().min(1), rawSha256: Sha256 }),
        scoringSupplement: z.looseObject({ path: z.string().min(1), rawSha256: Sha256 }),
        ownerAdjudicationRecord: z.looseObject({ path: z.string().min(1), rawSha256: Sha256 }),
      }),
      postRepairTreatment: z.looseObject({
        gatesAppliedTo: z.literal('POST_REPAIR_VALIDITY'),
        firstPassAlwaysReported: z.literal(true),
      }),
    }),
    unresolvedGold: z.looseObject({
      goldId: z.string().regex(/^g[0-9a-f]{16}$/),
      committedLabel: z.string().min(1),
      ownerAdjudicated: z.literal(true),
    }),
    holdout: z.looseObject({ inferenceDuring2D2C: z.literal('FORBIDDEN') }),
    exclusions: z.looseObject({ thisFreezeAuthorises: z.array(z.never()).length(0) }),
  });
}

export type Attempt4Freeze = z.infer<ReturnType<typeof createAttempt4FreezeSchema>>;
export type Attempt4Batch = z.infer<typeof Attempt4BatchSchema>;

export class Attempt4FreezeError extends Error {
  override readonly name = 'Attempt4FreezeError';
  constructor(
    readonly stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT',
    message: string,
  ) {
    super(message);
  }
}

export function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface LoadedAttempt4Freeze {
  readonly freeze: Attempt4Freeze;
  readonly rawSha256: string;
  readonly rawBytes: number;
  readonly revision: Attempt4FreezeRevision;
}

/**
 * Loads one revision from exact bytes: raw hash first, then shape, then
 * agreement with the production constants of THIS build and with the
 * revision descriptor.
 */
export function loadAttempt4FreezeFromBytes(
  rev: Attempt4FreezeRevision,
  bytes: Buffer,
): LoadedAttempt4Freeze {
  const rawSha256 = sha256Hex(bytes);
  if (rawSha256 !== rev.rawSha256) {
    throw new Attempt4FreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `${rev.label} raw SHA-256 ${rawSha256} does not equal the proposed value ${rev.rawSha256}; the freeze is not trusted and nothing proceeds.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Attempt4FreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `${rev.label} bytes do not parse: ${String(error)}`,
    );
  }
  const result = createAttempt4FreezeSchema(rev).safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Attempt4FreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `${rev.label} shape is not the contract: ${first ? `${first.path.join('.')}: ${first.message}` : 'unknown'}`,
    );
  }
  assertAttempt4FreezeAgreesWithProduction(rev, result.data);
  return { freeze: result.data, rawSha256, rawBytes: bytes.length, revision: rev };
}

/** The freeze must say what this build's production constants say, and what its own revision descriptor says. */
export function assertAttempt4FreezeAgreesWithProduction(
  rev: Attempt4FreezeRevision,
  freeze: Attempt4Freeze,
): void {
  const problems: string[] = [];
  const variant = freeze.classifier.variants[0]!;
  const pinned = rev.variant;
  for (const key of [
    'gitCommit',
    'runtimeBaseCommit',
    'promptVersion',
    'runtimePromptSha256',
    'runtimePromptCharacters',
    'runtimePromptUtf8Bytes',
  ] as const) {
    if (variant[key] !== pinned[key]) problems.push(`variant.${key}`);
  }
  if (
    freeze.inputConstruction.promptVersionByVariant.PROMPT_V5_CANONICAL !== pinned.promptVersion
  ) {
    problems.push('promptVersionByVariant');
  }
  if (freeze.git.v5Runtime.commit !== pinned.gitCommit) problems.push('git.v5Runtime.commit');
  if (freeze.git.v5Runtime.basedOn !== pinned.runtimeBaseCommit)
    problems.push('git.v5Runtime.basedOn');
  if (freeze.git.freezeBranchBasedOn !== rev.freezeBranchBasedOn)
    problems.push('git.freezeBranchBasedOn');

  // Repair policy: the production constants, exactly (unchanged from attempt 3 - R1 is untouched).
  const policy = freeze.repairPolicy;
  if (!policy.enabled) problems.push('repairPolicy.enabled');
  if (policy.maxRoundsPerLogicalEvaluation !== REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION) {
    problems.push('repairPolicy.maxRoundsPerLogicalEvaluation');
  }
  if (policy.minimumRemainingBudgetMs !== REPAIR_MINIMUM_REMAINING_BUDGET_MS) {
    problems.push('repairPolicy.minimumRemainingBudgetMs');
  }

  const formula = freeze.repairContract.repairDeadlineFormula;
  if (formula.softDeadlineMs !== FROZEN_TIER1_SOFT_DEADLINE_MS)
    problems.push('repairDeadlineFormula.softDeadlineMs');
  if (formula.hardKillGraceMs !== FROZEN_TIER1_GRACE_MS)
    problems.push('repairDeadlineFormula.hardKillGraceMs');
  if (formula.totalBudgetMs !== FROZEN_TIER1_TOTAL_BUDGET_MS)
    problems.push('repairDeadlineFormula.totalBudgetMs');

  // Liveness: unchanged from attempt 3 and equal to production.
  const { tier1, tier2 } = freeze.liveness;
  if (tier1.attemptSoftDeadlineMs !== FROZEN_TIER1_SOFT_DEADLINE_MS)
    problems.push('tier1.attemptSoftDeadlineMs');
  if (tier1.abortCloseSettlementGraceMs !== FROZEN_TIER1_GRACE_MS)
    problems.push('tier1.abortCloseSettlementGraceMs');
  if (tier1.totalProviderCallBudgetMs !== FROZEN_TIER1_TOTAL_BUDGET_MS)
    problems.push('tier1.totalProviderCallBudgetMs');
  if (tier1.transientRetries.maxAfterFirstAttempt !== FROZEN_MAX_TRANSIENT_RETRIES)
    problems.push('tier1.transientRetries');
  if (tier1.totalProviderCallBudgetMs !== REPAIR_TOTAL_BUDGET_MS)
    problems.push('repair total budget');
  if (tier1.abortCloseSettlementGraceMs !== REPAIR_HARD_KILL_GRACE_MS)
    problems.push('repair grace');
  if (tier1.attemptSoftDeadlineMs !== REPAIR_ATTEMPT_SOFT_DEADLINE_MS)
    problems.push('repair soft deadline');
  if (tier2.parentWatchdogMs !== FROZEN_TIER2_WATCHDOG_MS) problems.push('tier2.parentWatchdogMs');
  if (tier2.gracefulTerminationWindowMs !== FROZEN_TIER2_GRACE_MS)
    problems.push('tier2.gracefulTerminationWindowMs');
  const d = tier2.watchdogDerivationMs;
  if (d.authStatusRunnerTimeout !== FROZEN_AUTH_STATUS_TIMEOUT_MS)
    problems.push('tier2 derivation auth');
  if (d.providerAttemptWindow !== FROZEN_TIER1_TOTAL_BUDGET_MS)
    problems.push('tier2 derivation window');
  if (d.finalInnerCloseGrace !== FROZEN_TIER1_GRACE_MS) problems.push('tier2 derivation grace');
  if (
    d.authStatusRunnerTimeout +
      d.providerAttemptWindow +
      d.finalInnerCloseGrace +
      d.childStartupArtifactFlushAndSchedulingVariance !==
    d.total
  ) {
    problems.push('tier2 derivation sum');
  }
  if (d.total !== tier2.parentWatchdogMs) problems.push('tier2 derivation total');
  const worst = freeze.liveness.sharedBudgetRule.perEvaluationWorstCaseMs.total;
  if (worst !== FROZEN_TIER1_TOTAL_BUDGET_MS + FROZEN_TIER1_GRACE_MS)
    problems.push('sharedBudgetRule worst case');
  if (freeze.liveness.sharedBudgetRule.tier2Sufficiency.watchdogMs !== FROZEN_TIER2_WATCHDOG_MS) {
    problems.push('sharedBudgetRule tier2');
  }

  const executable = freeze.classifier.claudeCodeExecutable;
  if (executable.sdkPackage !== freeze.classifier.agentSdk.package) problems.push('sdkPackage');
  if (executable.sdkVersion !== FROZEN_AGENT_SDK_VERSION) problems.push('sdkVersion');
  if (freeze.classifier.agentSdk.version !== FROZEN_AGENT_SDK_VERSION)
    problems.push('agentSdk.version');
  if (executable.claudeCodeVersion !== FROZEN_CLAUDE_CODE_VERSION)
    problems.push('claudeCodeVersion');
  if (executable.nativePackagePrefix !== `${executable.sdkPackage}-`)
    problems.push('nativePackagePrefix');
  const run = executable.runPlatform;
  if (run.platform !== FROZEN_RUN_PLATFORM.platform) problems.push('runPlatform.platform');
  if (run.arch !== FROZEN_RUN_PLATFORM.arch) problems.push('runPlatform.arch');
  if (run.platformKey !== FROZEN_RUN_PLATFORM.platformKey) problems.push('runPlatform.platformKey');
  if (run.nativePackage !== `${executable.nativePackagePrefix}${run.platformKey}`)
    problems.push('runPlatform.nativePackage');
  if (run.nativePackageVersion !== FROZEN_AGENT_SDK_VERSION)
    problems.push('runPlatform.nativePackageVersion');
  if (run.binaryFileName !== FROZEN_RUN_PLATFORM.binaryFileName)
    problems.push('runPlatform.binaryFileName');
  if (run.binaryBytes !== FROZEN_RUN_PLATFORM.binaryBytes) problems.push('runPlatform.binaryBytes');
  if (run.binarySha256 !== FROZEN_RUN_PLATFORM.binarySha256)
    problems.push('runPlatform.binarySha256');
  if (freeze.classifier.childEnvironment.posixOsPassthroughAddition !== FROZEN_POSIX_USER_VARIABLE)
    problems.push('childEnvironment.posixOsPassthroughAddition');
  if (tier2.stderrTailMaxChars !== FROZEN_STDERR_TAIL_MAX_CHARS)
    problems.push('tier2.stderrTailMaxChars');

  if (freeze.classifier.runConfig.maxTurns !== FROZEN_RUN_CONFIG.maxTurns)
    problems.push('runConfig.maxTurns');
  if (freeze.classifier.runConfig.thinking !== FROZEN_RUN_CONFIG.thinking)
    problems.push('runConfig.thinking');
  const ids = freeze.stopConditions.conditions.map((c) => c.id);
  for (const id of STOP_CONDITIONS) if (!ids.includes(id)) problems.push(`stop condition ${id}`);
  for (const field of REQUIRED_CAPTURE_FIELDS) {
    if (!freeze.outputCapture.requiredPerLogicalBatch.includes(field))
      problems.push(`capture field ${field}`);
  }
  if (freeze.outputCapture.requiredPerLogicalBatch.length !== REQUIRED_CAPTURE_FIELDS.length) {
    problems.push('capture field count');
  }

  const ceilingByOrdinal = new Map(
    freeze.callCeiling.perLogicalEvaluation.map((c) => [c.ordinal, c]),
  );
  if (freeze.callCeiling.maxTransientRetriesPerRequest !== FROZEN_MAX_TRANSIENT_RETRIES)
    problems.push('callCeiling retries');
  let documents = 0;
  for (const [index, batch] of freeze.batching.plan.entries()) {
    if (batch.ordinal !== index + 1) problems.push(`plan ordinal at index ${index}`);
    if (batch.canonicalSerializedInputSha256 !== batch.assemblyInputSha256)
      problems.push(`plan ${batch.ordinal}: canonical != assembly`);
    if (
      batch.documentCount !== batch.goldIds.length ||
      batch.documentCount !== batch.docIndices.length
    ) {
      problems.push(`plan ${batch.ordinal}: documentCount`);
    }
    const expectedV5 = computeFinalInputSha256({
      assemblyInputSha256: batch.assemblyInputSha256,
      promptVersion: pinned.promptVersion,
      outputSchemaVersion: freeze.classifier.outputSchemaVersion,
    });
    if (batch.finalInputSha256.PROMPT_V5_CANONICAL !== expectedV5)
      problems.push(`plan ${batch.ordinal}: V5 final identity`);
    for (const attempt1 of Object.values(batch.attempt1ComparatorFinalInputSha256)) {
      if (attempt1 === expectedV5)
        problems.push(`plan ${batch.ordinal}: V5 identity equals an attempt-1 identity`);
    }
    if (batch.attempt2ComparatorFinalInputSha256.PROMPT_V3_CANONICAL === expectedV5) {
      problems.push(`plan ${batch.ordinal}: V5 identity equals the attempt-2 identity`);
    }
    if (batch.attempt3ComparatorFinalInputSha256.PROMPT_V4_CANONICAL === expectedV5) {
      problems.push(`plan ${batch.ordinal}: V5 identity equals the attempt-3 identity`);
    }
    const ceiling = deriveCallCeiling(batch.documentCount);
    if (canonicalStringify(batch.callCeiling) !== canonicalStringify(ceiling))
      problems.push(`plan ${batch.ordinal}: callCeiling`);
    const listed = ceilingByOrdinal.get(batch.ordinal);
    if (
      listed === undefined ||
      canonicalStringify({ ordinal: batch.ordinal, ...ceiling }) !== canonicalStringify(listed)
    ) {
      problems.push(`callCeiling.perLogicalEvaluation ${batch.ordinal}`);
    }
    documents += batch.documentCount;
  }
  const totals = freeze.callCeiling.totals;
  if (
    totals.documents !== documents ||
    totals.maxRepairRequests !== documents ||
    totals.maxProviderRequests !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT + documents ||
    totals.maxAdapterAttempts !==
      (EXPECTED_LOGICAL_BATCHES_PER_VARIANT + documents) * (1 + FROZEN_MAX_TRANSIENT_RETRIES)
  ) {
    problems.push('callCeiling.totals');
  }
  if (problems.length > 0) {
    throw new Attempt4FreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `${rev.label} disagrees with this build's production constants: ${problems.join('; ')}`,
    );
  }
}

export interface CallCeiling {
  readonly originalRequests: 1;
  readonly maxEligibleRejectedDocuments: number;
  readonly maxRepairRequests: number;
  readonly maxProviderRequests: number;
  readonly maxAdapterAttempts: number;
}

/** THE mechanical ceiling: identical formula to attempt 2/3's - one original request plus at most one repair per document. */
export function deriveCallCeiling(documentCount: number): CallCeiling {
  if (!Number.isInteger(documentCount) || documentCount < 1)
    throw new RangeError('documentCount must be a positive integer.');
  return {
    originalRequests: 1,
    maxEligibleRejectedDocuments: documentCount,
    maxRepairRequests: documentCount,
    maxProviderRequests: 1 + documentCount,
    maxAdapterAttempts: (1 + documentCount) * (1 + FROZEN_MAX_TRANSIENT_RETRIES),
  };
}

export interface Attempt4PlannedEvaluation {
  readonly sequence: number;
  readonly attemptNo: 4;
  readonly variantName: 'PROMPT_V5_CANONICAL';
  readonly variantLabel: 'PROMPT_V5_CANDIDATE';
  readonly variantOrder: 1;
  readonly variantGitCommit: string;
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly logicalBatchOrdinal: number;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly orderedGoldIds: readonly string[];
  readonly orderedDocIndices: readonly number[];
  readonly batchContext: Attempt4Batch['context'];
  readonly serializedBatchUtf8Bytes: number;
  readonly assemblyInputSha256: string;
  readonly canonicalSerializedInputSha256: string;
  readonly finalInputSha256: string;
  readonly callCeiling: CallCeiling;
}

export interface Attempt4ExecutionPlan {
  readonly freezeVersion: string;
  readonly freezeConfigRawSha256: string;
  readonly attemptNo: 4;
  readonly requestedModelId: string;
  readonly runConfig: typeof FROZEN_RUN_CONFIG;
  readonly outputSchemaVersion: string;
  readonly assemblyVersion: string;
  readonly repairPolicy: Attempt4Freeze['repairPolicy'];
  readonly liveness: {
    readonly tier1SoftDeadlineMs: number;
    readonly tier1GraceMs: number;
    readonly tier1TotalBudgetMs: number;
    readonly tier2WatchdogMs: number;
    readonly tier2GraceMs: number;
  };
  readonly concurrency: 1;
  readonly plannedLogicalEvaluations: number;
  readonly callCeilingTotals: Attempt4Freeze['callCeiling']['totals'];
  readonly evaluations: readonly Attempt4PlannedEvaluation[];
}

/**
 * The attempt-4 plan: exactly the 12 frozen batches, in ordinal order, for
 * the ONE variant PROMPT_V5_CANONICAL. No attempt-1, attempt-2 or attempt-3
 * variant, root, identity or artifact enters it; their comparator
 * identities stay in the freeze as provenance only.
 */
export function buildAttempt4ExecutionPlan(
  freeze: Attempt4Freeze,
  freezeRawSha256: string,
): Attempt4ExecutionPlan {
  const variant = freeze.classifier.variants[0]!;
  const evaluations: Attempt4PlannedEvaluation[] = freeze.batching.plan.map((batch, index) => ({
    sequence: index + 1,
    attemptNo: ATTEMPT_4_NO,
    variantName: ATTEMPT_4_VARIANT_NAME,
    variantLabel: ATTEMPT_4_VARIANT_LABEL,
    variantOrder: 1,
    variantGitCommit: variant.gitCommit,
    promptVersion: variant.promptVersion,
    promptSha256: variant.runtimePromptSha256,
    logicalBatchOrdinal: batch.ordinal,
    organisationId: batch.organisationId,
    echeRowKey: batch.echeRowKey,
    orderedGoldIds: batch.goldIds,
    orderedDocIndices: batch.docIndices,
    batchContext: batch.context,
    serializedBatchUtf8Bytes: batch.serializedBatchUtf8Bytes,
    assemblyInputSha256: batch.assemblyInputSha256,
    canonicalSerializedInputSha256: batch.assemblyInputSha256,
    finalInputSha256: batch.finalInputSha256.PROMPT_V5_CANONICAL,
    callCeiling: deriveCallCeiling(batch.documentCount),
  }));
  if (evaluations.length !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT) {
    throw new Attempt4FreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `plan holds ${evaluations.length} evaluations; ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT} are frozen.`,
    );
  }
  return {
    freezeVersion: freeze.version,
    freezeConfigRawSha256: freezeRawSha256,
    attemptNo: ATTEMPT_4_NO,
    requestedModelId: freeze.classifier.requestedModelId,
    runConfig: FROZEN_RUN_CONFIG,
    outputSchemaVersion: freeze.classifier.outputSchemaVersion,
    assemblyVersion: freeze.classifier.assemblyVersion,
    repairPolicy: freeze.repairPolicy,
    liveness: {
      tier1SoftDeadlineMs: FROZEN_TIER1_SOFT_DEADLINE_MS,
      tier1GraceMs: FROZEN_TIER1_GRACE_MS,
      tier1TotalBudgetMs: FROZEN_TIER1_TOTAL_BUDGET_MS,
      tier2WatchdogMs: FROZEN_TIER2_WATCHDOG_MS,
      tier2GraceMs: FROZEN_TIER2_GRACE_MS,
    },
    concurrency: 1,
    plannedLogicalEvaluations: evaluations.length,
    callCeilingTotals: freeze.callCeiling.totals,
    evaluations,
  };
}

/** Stable identity of an attempt-4 plan: SHA-256 of its canonical serialization. */
export function attempt4PlanSha256(plan: Attempt4ExecutionPlan): string {
  return sha256Hex(canonicalStringify(plan));
}

/** True iff the plan is the ONE V5 variant over ordinals 1..12 in order, and no V1/V2/V3/V4 variant appears. */
export function attempt4PlanOrderIsFrozen(plan: Attempt4ExecutionPlan): boolean {
  const priorVariantNames: readonly string[] = [
    ...ATTEMPT_1_VARIANT_NAMES,
    ATTEMPT_2_VARIANT_NAME,
    ATTEMPT_3_VARIANT_NAME,
  ];
  return (
    plan.evaluations.length === EXPECTED_LOGICAL_BATCHES_PER_VARIANT &&
    plan.evaluations.every(
      (evaluation, index) =>
        evaluation.sequence === index + 1 &&
        evaluation.logicalBatchOrdinal === index + 1 &&
        evaluation.variantName === ATTEMPT_4_VARIANT_NAME &&
        !priorVariantNames.includes(evaluation.variantName),
    )
  );
}

/** `<outputRoot>/experiments/attempt-4` - never created by this module; naming only. */
export function attempt4ExperimentDirectoryOf(outputRoot: string): string {
  return `${outputRoot}/experiments/attempt-${ATTEMPT_4_NO}`;
}

/** The write-once attempt-4 namespace shape; never created by this module. */
export function attempt4AttemptDirectoryOf(
  outputRoot: string,
  logicalBatchOrdinal: number,
): string {
  return `${outputRoot}/evaluations/${ATTEMPT_4_VARIANT_NAME}/batch-${String(logicalBatchOrdinal).padStart(2, '0')}/attempt-${ATTEMPT_4_NO}`;
}

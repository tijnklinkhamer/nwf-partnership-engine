/**
 * PHASE 2B-2D2C — THE SHARED CORE for loading, hash-verifying and DERIVING
 * from an ATTEMPT-2 configuration freeze revision.
 *
 * Two revisions exist: F0C (approved 2026-09-14; superseded before any
 * execution by Finding F1) and F0E (the replacement that re-pins the runtime
 * to the corrected V3B commit). They share every schema rule, every
 * production cross-check and the plan derivation; they differ ONLY in the
 * revision descriptor a caller supplies — identifiers, the pinned raw hash,
 * the variant's runtime commits and the supersession block. Neither
 * revision's descriptor can be confused with the other's, because each is
 * a separate module with its own literals, and the descriptor is checked
 * against the bytes on every load.
 *
 * Nothing here writes, authorises or creates an artifact of any kind. Pure
 * aside from the injected bytes. No network, no database, no clock, no
 * filesystem, no Git.
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

/** The attempt-1 authorisation that was CONSUMED on 2026-09-13; presenting it for attempt 2 is refused by exact hash. */
export const SPENT_ATTEMPT_1_AUTHORISATION_SHA256 =
  '46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705';

export const ATTEMPT_2_NO = 2;
export const ATTEMPT_2_STATUS = 'PROPOSED_PENDING_OWNER_FREEZE_APPROVAL';
/** The ONE attempt-2 variant name and label, identical in every attempt-2 revision. */
export const ATTEMPT_2_VARIANT_NAME = 'PROMPT_V3_CANONICAL';
export const ATTEMPT_2_VARIANT_LABEL = 'PROMPT_V3_CANDIDATE';

/** The identity of the one attempt-2 variant, as a revision pins it. */
export interface Attempt2VariantIdentity {
  readonly name: typeof ATTEMPT_2_VARIANT_NAME;
  readonly label: typeof ATTEMPT_2_VARIANT_LABEL;
  readonly role: 'candidate';
  readonly order: 1;
  readonly gitCommit: string;
  readonly runtimeBaseCommit: string;
  readonly promptVersion: string;
  readonly runtimePromptSha256: string;
  readonly runtimePromptCharacters: number;
  readonly runtimePromptUtf8Bytes: number;
}

/** Everything that distinguishes one attempt-2 freeze revision from another. */
export interface Attempt2FreezeRevision {
  readonly label: 'F0C' | 'F0E';
  readonly freezePath: string;
  /** The pinned raw SHA-256 of the revision's bytes; never edited to fit changed bytes. */
  readonly rawSha256: string;
  readonly rawBytes: number;
  readonly freezeId: string;
  readonly version: string;
  readonly freezeRevision: string;
  readonly variant: Attempt2VariantIdentity;
  /** The commit the freeze branch was cut from (`git.freezeBranchBasedOn`). */
  readonly freezeBranchBasedOn: string;
  /** Present when this revision supersedes an earlier attempt-2 revision (F0E supersedes F0C). */
  readonly supersedes?: {
    readonly file: string;
    readonly rawSha256: string;
    readonly derivedAttempt2PlanSha256: string;
  };
}

/** The attempt-1 variants that must NEVER appear in an attempt-2 plan. */
export const ATTEMPT_1_VARIANT_NAMES = ['PROMPT_V1_CANONICAL', 'PROMPT_V2_CANONICAL'] as const;

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);

const Attempt2VariantSchema = z.strictObject({
  name: z.literal(ATTEMPT_2_VARIANT_NAME),
  label: z.literal(ATTEMPT_2_VARIANT_LABEL),
  role: z.literal('candidate'),
  order: z.literal(1),
  gitCommit: GitSha,
  runtimeBaseCommit: GitSha,
  promptVersion: z.string().min(1),
  runtimePromptCharacters: z.int().min(1),
  runtimePromptUtf8Bytes: z.int().min(1),
  runtimePromptSha256: Sha256,
});

export const Attempt2BatchSchema = z.strictObject({
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
  finalInputSha256: z.strictObject({ PROMPT_V3_CANONICAL: Sha256 }),
  attempt1ComparatorFinalInputSha256: z.strictObject({
    PROMPT_V1_CANONICAL: Sha256,
    PROMPT_V2_CANONICAL: Sha256,
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
export function createAttempt2FreezeSchema(rev: Attempt2FreezeRevision) {
  return z.looseObject({
    freezeId: z.literal(rev.freezeId),
    version: z.literal(rev.version),
    status: z.literal(ATTEMPT_2_STATUS),
    freezeRevision: z.literal(rev.freezeRevision),
    attemptNo: z.literal(ATTEMPT_2_NO),
    /** Present exactly when this revision supersedes an earlier one; the VALUES are enforced against the descriptor on load. */
    supersedes: z
      .looseObject({
        file: z.string().min(1),
        rawSha256: Sha256,
        derivedAttempt2PlanSha256: Sha256,
        role: z.literal('HISTORICAL_ATTEMPT_2_CONFIGURATION_SUPERSEDED_BEFORE_ANY_EXECUTION'),
        reason: z.string().min(1),
      })
      .optional(),
    approvalModel: z.looseObject({ thisFileAuthorises: z.array(z.never()).length(0) }),
    ownerApprovalRequired: z.array(z.string().min(1)).min(1),
    predecessor: z.looseObject({
      file: z.literal('docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json'),
      rawSha256: z.literal(EXPECTED_F0B_FREEZE_RAW_SHA256),
      role: z.literal('HISTORICAL_ATTEMPT_1_CONFIGURATION_BYTE_UNCHANGED'),
    }),
    git: z.looseObject({
      repository: z.string().min(1),
      v3Runtime: z.looseObject({ commit: GitSha, basedOn: GitSha }),
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
      attempt1VariantsNotScheduled: z.tuple([
        z.literal('PROMPT_V1_CANONICAL'),
        z.literal('PROMPT_V2_CANONICAL'),
      ]),
      plan: z.array(Attempt2BatchSchema).length(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
    }),
    inputConstruction: z.looseObject({
      context: z.looseObject({
        ruleVersion: z.string().min(1),
        fetchPolicyVersion: z.string().min(1),
        assemblyVersion: z.string().min(1),
        rootKey: z.null(),
      }),
      promptVersionByVariant: z.strictObject({ PROMPT_V3_CANONICAL: z.string().min(1) }),
    }),
    classifier: z.looseObject({
      requestedModelId: z.string().min(1),
      agentSdk: z.looseObject({ package: z.string().min(1), version: z.string().min(1) }),
      assemblyVersion: z.string().min(1),
      outputSchemaVersion: z.string().min(1),
      runConfig: z.strictObject({ maxTurns: z.literal(3), thinking: z.literal('disabled') }),
      variants: z.array(Attempt2VariantSchema).length(1),
      claudeCodeExecutable: FrozenClaudeCodeExecutableSchema,
      childEnvironment: FrozenChildEnvironmentSchema,
    }),
    repairPolicy: RepairPolicySchema,
    repairContract: z.looseObject({
      minimumRemainingBudgetMsStatus: z.literal(
        'OWNER_SELECTED_2026_09_14_PENDING_FREEZE_APPROVAL',
      ),
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
          neverInsideAttempt2Namespace: z.literal(true),
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

/** The parsed shape is identical for every revision (only literal VALUES differ), so one type serves both. */
export type Attempt2Freeze = z.infer<ReturnType<typeof createAttempt2FreezeSchema>>;
export type Attempt2Batch = z.infer<typeof Attempt2BatchSchema>;

export class Attempt2FreezeError extends Error {
  override readonly name = 'F0CFreezeError';
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

/** Kept under its historical name: every F0C and F0D test names this class. */
export const F0CFreezeError = Attempt2FreezeError;
export type F0CFreezeError = Attempt2FreezeError;

export interface LoadedAttempt2Freeze {
  readonly freeze: Attempt2Freeze;
  readonly rawSha256: string;
  readonly rawBytes: number;
  readonly revision: Attempt2FreezeRevision;
}

/**
 * Loads one revision from exact bytes: raw hash first, then shape, then
 * agreement with the production constants of THIS build and with the
 * revision descriptor. A freeze that disagrees with production, or bytes
 * that are not this revision's, is a drift, never a warning.
 */
export function loadAttempt2FreezeFromBytes(
  rev: Attempt2FreezeRevision,
  bytes: Buffer,
): LoadedAttempt2Freeze {
  const rawSha256 = sha256Hex(bytes);
  if (rawSha256 !== rev.rawSha256) {
    throw new Attempt2FreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `${rev.label} raw SHA-256 ${rawSha256} does not equal the proposed value ${rev.rawSha256}; the freeze is not trusted and nothing proceeds.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Attempt2FreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `${rev.label} bytes do not parse: ${String(error)}`,
    );
  }
  const result = createAttempt2FreezeSchema(rev).safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Attempt2FreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `${rev.label} shape is not the contract: ${first ? `${first.path.join('.')}: ${first.message}` : 'unknown'}`,
    );
  }
  assertAttempt2FreezeAgreesWithProduction(rev, result.data);
  return { freeze: result.data, rawSha256, rawBytes: bytes.length, revision: rev };
}

/** The freeze must say what this build's production constants say, and what its own revision descriptor says. */
export function assertAttempt2FreezeAgreesWithProduction(
  rev: Attempt2FreezeRevision,
  freeze: Attempt2Freeze,
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
    freeze.inputConstruction.promptVersionByVariant.PROMPT_V3_CANONICAL !== pinned.promptVersion
  ) {
    problems.push('promptVersionByVariant');
  }
  if (freeze.git.v3Runtime.commit !== pinned.gitCommit) problems.push('git.v3Runtime.commit');
  if (freeze.git.v3Runtime.basedOn !== pinned.runtimeBaseCommit)
    problems.push('git.v3Runtime.basedOn');
  if (freeze.git.freezeBranchBasedOn !== rev.freezeBranchBasedOn)
    problems.push('git.freezeBranchBasedOn');
  if (rev.supersedes === undefined) {
    if (freeze.supersedes !== undefined)
      problems.push('supersedes: this revision supersedes nothing');
  } else if (
    freeze.supersedes === undefined ||
    freeze.supersedes.file !== rev.supersedes.file ||
    freeze.supersedes.rawSha256 !== rev.supersedes.rawSha256 ||
    freeze.supersedes.derivedAttempt2PlanSha256 !== rev.supersedes.derivedAttempt2PlanSha256
  ) {
    problems.push('supersedes: the superseded revision is not the one this revision names');
  }

  // Repair policy: the production constants, exactly.
  const policy = freeze.repairPolicy;
  if (!policy.enabled) problems.push('repairPolicy.enabled');
  if (policy.maxRoundsPerLogicalEvaluation !== REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION) {
    problems.push('repairPolicy.maxRoundsPerLogicalEvaluation');
  }
  if (policy.minimumRemainingBudgetMs !== REPAIR_MINIMUM_REMAINING_BUDGET_MS) {
    problems.push('repairPolicy.minimumRemainingBudgetMs');
  }

  // The deadline formula: the frozen production numbers, exactly.
  const formula = freeze.repairContract.repairDeadlineFormula;
  if (formula.softDeadlineMs !== FROZEN_TIER1_SOFT_DEADLINE_MS)
    problems.push('repairDeadlineFormula.softDeadlineMs');
  if (formula.hardKillGraceMs !== FROZEN_TIER1_GRACE_MS)
    problems.push('repairDeadlineFormula.hardKillGraceMs');
  if (formula.totalBudgetMs !== FROZEN_TIER1_TOTAL_BUDGET_MS)
    problems.push('repairDeadlineFormula.totalBudgetMs');
  // The GENERAL rule (window at the repair decision; per attempt, elapsed since repair classify entry).
  const requiredFormulaFragments = [
    'repairWindowMs = max(0, remainingLogicalEvaluationBudgetMsAtRepairDecision - CLASSIFIER_CALL_HARD_KILL_GRACE_MS)',
    'repairAttemptDeadlineMs = min(CLASSIFIER_CALL_SOFT_DEADLINE_MS, max(0, repairWindowMs - elapsedSinceRepairClassifyEntryMs))',
    'prior transient attempts, retry backoff',
    'A non-positive remainder is the existing terminal TIMEOUT with no new runner attempt',
    'repairWindowMs < REPAIR_MINIMUM_REMAINING_BUDGET_MS -> skip, fail closed',
  ];
  if (!requiredFormulaFragments.every((fragment) => formula.statement.includes(fragment))) {
    problems.push('repairDeadlineFormula.statement');
  }
  // The floor options: arithmetic over the auth upper bound and the grace, nothing selected.
  const options = freeze.repairContract.minimumRemainingBudgetMsOptions;
  if (options.authStatusUpperBoundMs !== FROZEN_AUTH_STATUS_TIMEOUT_MS)
    problems.push('floorOptions.authStatusUpperBoundMs');
  for (const option of options.options) {
    if (option.remainingFloorMs !== option.usableFloorMs + FROZEN_TIER1_GRACE_MS)
      problems.push(`floorOptions ${option.usableFloorMs}: remainingFloorMs`);
    if (
      option.worstCaseInferenceWindowAfterMaxAuthStatusMs !==
      Math.max(0, option.usableFloorMs - options.authStatusUpperBoundMs)
    ) {
      problems.push(`floorOptions ${option.usableFloorMs}: worst-case inference window`);
    }
  }
  if (!options.options.some((o) => o.usableFloorMs === policy.minimumRemainingBudgetMs)) {
    problems.push('floorOptions: the implementation value is not among the presented options');
  }
  // Exactly one option is SELECTED, and it is the implementation value; every other option is REJECTED.
  const selected = options.options.filter((o) => o.status === 'SELECTED_BY_OWNER_2026_09_14');
  if (selected.length !== 1 || selected[0]!.usableFloorMs !== policy.minimumRemainingBudgetMs) {
    problems.push('floorOptions: the SELECTED option is not the implementation value');
  }
  // The owner-approval checklist must name the floor by the implementation value and nothing else.
  const floorChecklistEntries = freeze.ownerApprovalRequired.filter((entry) =>
    entry.includes('REPAIR_MINIMUM_REMAINING_BUDGET_MS'),
  );
  if (
    floorChecklistEntries.length !== 1 ||
    !floorChecklistEntries[0]!.startsWith(
      `REPAIR_MINIMUM_REMAINING_BUDGET_MS = ${REPAIR_MINIMUM_REMAINING_BUDGET_MS} ms on the usable repair window`,
    ) ||
    floorChecklistEntries[0]!.includes('(PROPOSED)')
  ) {
    problems.push(
      'ownerApprovalRequired: the floor checklist entry does not name the implementation value',
    );
  }

  // Liveness: unchanged from F0B and equal to production.
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

  // F0D: the SDK-bundled executable contract and the run-platform binary
  // identity are the F0B ones, exactly (the V3 root resolves the same binary).
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

  // Run config, stop conditions, capture fields: unchanged.
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

  // The plan: ordinals, identities and the mechanical ceiling.
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
    const expectedV3 = computeFinalInputSha256({
      assemblyInputSha256: batch.assemblyInputSha256,
      promptVersion: pinned.promptVersion,
      outputSchemaVersion: freeze.classifier.outputSchemaVersion,
    });
    if (batch.finalInputSha256.PROMPT_V3_CANONICAL !== expectedV3)
      problems.push(`plan ${batch.ordinal}: V3 final identity`);
    for (const attempt1 of Object.values(batch.attempt1ComparatorFinalInputSha256)) {
      if (attempt1 === expectedV3)
        problems.push(`plan ${batch.ordinal}: V3 identity equals an attempt-1 identity`);
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
    throw new Attempt2FreezeError(
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

/** THE mechanical ceiling: one original request plus at most one repair per document, each with at most 1 + FROZEN_MAX_TRANSIENT_RETRIES adapter attempts. */
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

export interface Attempt2PlannedEvaluation {
  readonly sequence: number;
  readonly attemptNo: 2;
  readonly variantName: 'PROMPT_V3_CANONICAL';
  readonly variantLabel: 'PROMPT_V3_CANDIDATE';
  readonly variantOrder: 1;
  readonly variantGitCommit: string;
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly logicalBatchOrdinal: number;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly orderedGoldIds: readonly string[];
  readonly orderedDocIndices: readonly number[];
  readonly batchContext: Attempt2Batch['context'];
  readonly serializedBatchUtf8Bytes: number;
  readonly assemblyInputSha256: string;
  readonly canonicalSerializedInputSha256: string;
  readonly finalInputSha256: string;
  readonly callCeiling: CallCeiling;
}

export interface Attempt2ExecutionPlan {
  readonly freezeVersion: string;
  readonly freezeConfigRawSha256: string;
  readonly attemptNo: 2;
  readonly requestedModelId: string;
  readonly runConfig: typeof FROZEN_RUN_CONFIG;
  readonly outputSchemaVersion: string;
  readonly assemblyVersion: string;
  readonly repairPolicy: Attempt2Freeze['repairPolicy'];
  readonly liveness: {
    readonly tier1SoftDeadlineMs: number;
    readonly tier1GraceMs: number;
    readonly tier1TotalBudgetMs: number;
    readonly tier2WatchdogMs: number;
    readonly tier2GraceMs: number;
  };
  readonly concurrency: 1;
  readonly plannedLogicalEvaluations: number;
  readonly callCeilingTotals: Attempt2Freeze['callCeiling']['totals'];
  readonly evaluations: readonly Attempt2PlannedEvaluation[];
}

/**
 * The attempt-2 plan: exactly the 12 frozen batches, in ordinal order, for
 * the ONE variant. No attempt-1 variant, root, identity or artifact enters
 * it; the comparator identities stay in the freeze as provenance only.
 */
export function buildAttempt2ExecutionPlan(
  freeze: Attempt2Freeze,
  freezeRawSha256: string,
): Attempt2ExecutionPlan {
  const variant = freeze.classifier.variants[0]!;
  const evaluations: Attempt2PlannedEvaluation[] = freeze.batching.plan.map((batch, index) => ({
    sequence: index + 1,
    attemptNo: ATTEMPT_2_NO,
    variantName: ATTEMPT_2_VARIANT_NAME,
    variantLabel: ATTEMPT_2_VARIANT_LABEL,
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
    finalInputSha256: batch.finalInputSha256.PROMPT_V3_CANONICAL,
    callCeiling: deriveCallCeiling(batch.documentCount),
  }));
  if (evaluations.length !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT) {
    throw new Attempt2FreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `plan holds ${evaluations.length} evaluations; ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT} are frozen.`,
    );
  }
  return {
    freezeVersion: freeze.version,
    freezeConfigRawSha256: freezeRawSha256,
    attemptNo: ATTEMPT_2_NO,
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

/** Stable identity of an attempt-2 plan: SHA-256 of its canonical serialization. */
export function attempt2PlanSha256(plan: Attempt2ExecutionPlan): string {
  return sha256Hex(canonicalStringify(plan));
}

/** True iff the plan is the ONE variant over ordinals 1..12 in order, and no attempt-1 variant appears. */
export function attempt2PlanOrderIsFrozen(plan: Attempt2ExecutionPlan): boolean {
  return (
    plan.evaluations.length === EXPECTED_LOGICAL_BATCHES_PER_VARIANT &&
    plan.evaluations.every(
      (evaluation, index) =>
        evaluation.sequence === index + 1 &&
        evaluation.logicalBatchOrdinal === index + 1 &&
        evaluation.variantName === ATTEMPT_2_VARIANT_NAME &&
        !(ATTEMPT_1_VARIANT_NAMES as readonly string[]).includes(evaluation.variantName),
    )
  );
}

/** `<outputRoot>/experiments/attempt-2` — the attempt-2 experiment directory. */
export function attempt2ExperimentDirectoryOf(outputRoot: string): string {
  return `${outputRoot}/experiments/attempt-${ATTEMPT_2_NO}`;
}

/** The write-once attempt-2 namespaces; attempt-1 directories are outside all of them. */
export function attempt2AttemptDirectoryOf(
  outputRoot: string,
  logicalBatchOrdinal: number,
): string {
  return `${outputRoot}/evaluations/${ATTEMPT_2_VARIANT_NAME}/batch-${String(logicalBatchOrdinal).padStart(2, '0')}/attempt-${ATTEMPT_2_NO}`;
}

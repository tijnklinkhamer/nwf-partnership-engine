/**
 * PHASE 2B-2D2C-F0C — loading, hash-verifying and DERIVING from the
 * PROPOSED attempt-2 configuration freeze
 * (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0C_V1.json`).
 *
 * F0C configures a DIFFERENT attempt from F0B: Prompt V3 with the ADR 0011
 * repair round enabled, on the identical canonical inputs, scored against
 * the preserved attempt-1 evidence. It never touches the F0B loader
 * (`../freeze.ts`), which stays pinned to the attempt-1 bytes; this module
 * has its own schema, its own hash pin and its own plan builder, so the two
 * attempts cannot be confused by a shared constant.
 *
 * STATUS: PROPOSED. The raw SHA-256 pinned below is the hash of the
 * proposed bytes presented for owner freeze approval. Approval is recorded
 * OUTSIDE the file, so the bytes — and therefore this hash — do not change
 * on approval. Until an approval record exists, nothing here may be used to
 * plan a run: `loadF0CFreezeFromBytes` verifies bytes and derives a plan; it
 * writes nothing, authorises nothing and creates no artifact of any kind.
 *
 * Pure aside from the injected bytes. No network, no database, no clock, no
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

/** Repository-relative path of the PROPOSED F0C freeze. */
export const F0C_FREEZE_PATH = 'docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0C_V1.json';

/**
 * PROPOSED_PENDING_OWNER_FREEZE_APPROVAL. The raw SHA-256 of the proposed
 * F0C bytes. It is the value presented for approval and the value an
 * approval record must name; it is never edited to fit changed bytes —
 * changed bytes are a new proposal.
 */
export const PROPOSED_F0C_FREEZE_RAW_SHA256 =
  'd3de146fa789e64f09d850b03512e602caa226578387306642de6f4904b3efa9';

/**
 * F0D (attempt-2 preparation): the owner APPROVED exactly these bytes on
 * 2026-09-14 (`PHASE_2B_2D2C_F0C_OWNER_FREEZE_APPROVAL_V1.json`, ratified by
 * `..._RATIFICATION_V1.json`). The value is the SAME as the proposed one —
 * approval is a separate record and never edits the bytes — and is
 * restated under its own name so that attempt-2 code reads "approved",
 * never "proposed", and so a drifted approval record is refused by hash.
 */
export const APPROVED_F0C_FREEZE_RAW_SHA256 = PROPOSED_F0C_FREEZE_RAW_SHA256;
export const APPROVED_F0C_FREEZE_RAW_BYTES = 82_304;
/** The derived attempt-2 plan identity the owner approved; a rebuilt plan must equal it exactly. */
export const APPROVED_F0C_PLAN_SHA256 =
  '133a7a2017873ae5b2144796084f7cca28b22ce7c9593f3d5e828ce3ec4c3143';
/** The branch commit whose bytes were approved (the freeze bytes are identical at every later commit of the branch). */
export const F0C_APPROVED_FREEZE_COMMIT = '5ddb558ff5404b1e5f1633e6def634a2a57fd7e3';
export const F0C_APPROVAL_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F0C_OWNER_FREEZE_APPROVAL_V1.json';
export const F0C_APPROVAL_RECORD_RAW_SHA256 =
  '61eb52f3193636ff496d403140538cfd370964b82e7b660fbe6d9944a831dd22';
export const F0C_RATIFICATION_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F0C_OWNER_FREEZE_APPROVAL_RATIFICATION_V1.json';
export const F0C_RATIFICATION_RECORD_RAW_SHA256 =
  'bad4b359b319039a4341c66ad04efd7a92285725cd526b934d7883cb40162cba';
/** The attempt-1 authorisation that was CONSUMED on 2026-09-13; presenting it for attempt 2 is refused by exact hash. */
export const SPENT_ATTEMPT_1_AUTHORISATION_SHA256 =
  '46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705';

export const F0C_FREEZE_ID = 'PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0C_V1';
export const F0C_FREEZE_VERSION = 'phase2b-2d2c-dev-configuration-freeze-f0c-v1';
export const F0C_FREEZE_REVISION = 'F0C_V3_R1_ATTEMPT_2';
export const F0C_STATUS = 'PROPOSED_PENDING_OWNER_FREEZE_APPROVAL';
export const F0C_ATTEMPT_NO = 2;

/** The ONE attempt-2 variant, restated so a drifted freeze is refused. */
export const F0C_VARIANT = Object.freeze({
  name: 'PROMPT_V3_CANONICAL',
  label: 'PROMPT_V3_CANDIDATE',
  role: 'candidate',
  order: 1,
  gitCommit: '0c0d73803ed1155d568afe50a6657b7be7276dbb',
  runtimeBaseCommit: '9c509107fd66afdc979364a135bf94eb64379972',
  promptVersion: 'orgunit-classifier-prompt-v3',
  runtimePromptSha256: 'd05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1',
  runtimePromptCharacters: 14_012,
  runtimePromptUtf8Bytes: 14_088,
});

/** The attempt-1 variants that must NEVER appear in an attempt-2 plan. */
export const ATTEMPT_1_VARIANT_NAMES = ['PROMPT_V1_CANONICAL', 'PROMPT_V2_CANONICAL'] as const;

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);

const F0CVariantSchema = z.strictObject({
  name: z.literal(F0C_VARIANT.name),
  label: z.literal(F0C_VARIANT.label),
  role: z.literal('candidate'),
  order: z.literal(1),
  gitCommit: GitSha,
  runtimeBaseCommit: GitSha,
  promptVersion: z.string().min(1),
  runtimePromptCharacters: z.int().min(1),
  runtimePromptUtf8Bytes: z.int().min(1),
  runtimePromptSha256: Sha256,
});

export const F0CBatchSchema = z.strictObject({
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
export const F0CFreezeSchema = z.looseObject({
  freezeId: z.literal(F0C_FREEZE_ID),
  version: z.literal(F0C_FREEZE_VERSION),
  status: z.literal(F0C_STATUS),
  freezeRevision: z.literal(F0C_FREEZE_REVISION),
  attemptNo: z.literal(F0C_ATTEMPT_NO),
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
    plan: z.array(F0CBatchSchema).length(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
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
    variants: z.array(F0CVariantSchema).length(1),
    claudeCodeExecutable: FrozenClaudeCodeExecutableSchema,
    childEnvironment: FrozenChildEnvironmentSchema,
  }),
  repairPolicy: RepairPolicySchema,
  repairContract: z.looseObject({
    minimumRemainingBudgetMsStatus: z.literal('OWNER_SELECTED_2026_09_14_PENDING_FREEZE_APPROVAL'),
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

export type F0CFreeze = z.infer<typeof F0CFreezeSchema>;
export type F0CBatch = z.infer<typeof F0CBatchSchema>;

export class F0CFreezeError extends Error {
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

export interface LoadedF0CFreeze {
  readonly freeze: F0CFreeze;
  readonly rawSha256: string;
  readonly rawBytes: number;
}

/**
 * Loads the PROPOSED freeze from exact bytes: raw hash first, then shape,
 * then agreement with the production constants of THIS build. A freeze that
 * disagrees with production is a drift in one of them, never a warning.
 */
export function loadF0CFreezeFromBytes(bytes: Buffer): LoadedF0CFreeze {
  const rawSha256 = sha256Hex(bytes);
  if (rawSha256 !== PROPOSED_F0C_FREEZE_RAW_SHA256) {
    throw new F0CFreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `F0C raw SHA-256 ${rawSha256} does not equal the proposed value ${PROPOSED_F0C_FREEZE_RAW_SHA256}; the freeze is not trusted and nothing proceeds.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new F0CFreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `F0C bytes do not parse: ${String(error)}`,
    );
  }
  const result = F0CFreezeSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new F0CFreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `F0C shape is not the contract: ${first ? `${first.path.join('.')}: ${first.message}` : 'unknown'}`,
    );
  }
  assertF0CAgreesWithProduction(result.data);
  return { freeze: result.data, rawSha256, rawBytes: bytes.length };
}

/** The freeze must say what this build's production constants say. */
export function assertF0CAgreesWithProduction(freeze: F0CFreeze): void {
  const problems: string[] = [];
  const variant = freeze.classifier.variants[0]!;
  for (const key of [
    'gitCommit',
    'runtimeBaseCommit',
    'promptVersion',
    'runtimePromptSha256',
    'runtimePromptCharacters',
    'runtimePromptUtf8Bytes',
  ] as const) {
    if (variant[key] !== F0C_VARIANT[key]) problems.push(`variant.${key}`);
  }
  if (
    freeze.inputConstruction.promptVersionByVariant.PROMPT_V3_CANONICAL !==
    F0C_VARIANT.promptVersion
  ) {
    problems.push('promptVersionByVariant');
  }
  if (freeze.git.v3Runtime.commit !== F0C_VARIANT.gitCommit) problems.push('git.v3Runtime.commit');
  if (freeze.git.v3Runtime.basedOn !== F0C_VARIANT.runtimeBaseCommit)
    problems.push('git.v3Runtime.basedOn');
  if (freeze.git.freezeBranchBasedOn !== F0C_VARIANT.gitCommit)
    problems.push('git.freezeBranchBasedOn');

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
      promptVersion: F0C_VARIANT.promptVersion,
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
    throw new F0CFreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `F0C disagrees with this build's production constants: ${problems.join('; ')}`,
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

export interface F0CPlannedEvaluation {
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
  readonly batchContext: F0CBatch['context'];
  readonly serializedBatchUtf8Bytes: number;
  readonly assemblyInputSha256: string;
  readonly canonicalSerializedInputSha256: string;
  readonly finalInputSha256: string;
  readonly callCeiling: CallCeiling;
}

export interface F0CExecutionPlan {
  readonly freezeVersion: string;
  readonly freezeConfigRawSha256: string;
  readonly attemptNo: 2;
  readonly requestedModelId: string;
  readonly runConfig: typeof FROZEN_RUN_CONFIG;
  readonly outputSchemaVersion: string;
  readonly assemblyVersion: string;
  readonly repairPolicy: F0CFreeze['repairPolicy'];
  readonly liveness: {
    readonly tier1SoftDeadlineMs: number;
    readonly tier1GraceMs: number;
    readonly tier1TotalBudgetMs: number;
    readonly tier2WatchdogMs: number;
    readonly tier2GraceMs: number;
  };
  readonly concurrency: 1;
  readonly plannedLogicalEvaluations: number;
  readonly callCeilingTotals: F0CFreeze['callCeiling']['totals'];
  readonly evaluations: readonly F0CPlannedEvaluation[];
}

/**
 * The attempt-2 plan: exactly the 12 frozen batches, in ordinal order, for
 * the ONE variant. No attempt-1 variant, root, identity or artifact enters
 * it; the comparator identities stay in the freeze as provenance only.
 */
export function buildF0CExecutionPlan(
  freeze: F0CFreeze,
  freezeRawSha256: string,
): F0CExecutionPlan {
  const variant = freeze.classifier.variants[0]!;
  const evaluations: F0CPlannedEvaluation[] = freeze.batching.plan.map((batch, index) => ({
    sequence: index + 1,
    attemptNo: F0C_ATTEMPT_NO,
    variantName: F0C_VARIANT.name,
    variantLabel: F0C_VARIANT.label,
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
    throw new F0CFreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `plan holds ${evaluations.length} evaluations; ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT} are frozen.`,
    );
  }
  return {
    freezeVersion: freeze.version,
    freezeConfigRawSha256: freezeRawSha256,
    attemptNo: F0C_ATTEMPT_NO,
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
export function f0cPlanSha256(plan: F0CExecutionPlan): string {
  return sha256Hex(canonicalStringify(plan));
}

/** True iff the plan is the ONE variant over ordinals 1..12 in order, and no attempt-1 variant appears. */
export function f0cPlanOrderIsFrozen(plan: F0CExecutionPlan): boolean {
  return (
    plan.evaluations.length === EXPECTED_LOGICAL_BATCHES_PER_VARIANT &&
    plan.evaluations.every(
      (evaluation, index) =>
        evaluation.sequence === index + 1 &&
        evaluation.logicalBatchOrdinal === index + 1 &&
        evaluation.variantName === F0C_VARIANT.name &&
        !(ATTEMPT_1_VARIANT_NAMES as readonly string[]).includes(evaluation.variantName),
    )
  );
}

/** `<outputRoot>/experiments/attempt-2` — the attempt-2 experiment directory. */
export function f0cExperimentDirectoryOf(outputRoot: string): string {
  return `${outputRoot}/experiments/attempt-${F0C_ATTEMPT_NO}`;
}

/** The write-once attempt-2 namespaces; attempt-1 directories are outside all of them. */
export function f0cAttemptDirectoryOf(outputRoot: string, logicalBatchOrdinal: number): string {
  return `${outputRoot}/evaluations/${F0C_VARIANT.name}/batch-${String(logicalBatchOrdinal).padStart(2, '0')}/attempt-${F0C_ATTEMPT_NO}`;
}

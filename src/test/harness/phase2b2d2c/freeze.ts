/**
 * PHASE 2B-2D2C-F1 — loading and hash-verifying the immutable freeze at its
 * F0B revision.
 *
 * The runner recomputes the raw SHA-256 of the freeze bytes and refuses to
 * proceed unless it equals the F0B value recorded in the F1A/F0B audit;
 * the superseded F0A bytes are refused by exact hash like any other. The
 * structural schema below is CLOSED for every field the runner reads and
 * open for the prose fields it does not: a freeze that carries the right
 * bytes but the wrong shape is a drift, never a warning.
 *
 * Pure aside from the injected reader. No network, no database, no clock.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../../orgunits/classify/repair.js';
import {
  EXPECTED_F0B_FREEZE_RAW_SHA256,
  EXPECTED_FREEZE_REVISION,
  EXPECTED_FREEZE_VERSION,
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
  EXPECTED_LOGICAL_EVALUATIONS,
  FROZEN_AGENT_SDK_VERSION,
  FROZEN_CLAUDE_CODE_VERSION,
  FROZEN_POSIX_USER_VARIABLE,
  FROZEN_RUN_PLATFORM,
  FROZEN_VARIANTS,
  STOP_CONDITIONS,
  REQUIRED_CAPTURE_FIELDS,
  SUPERSEDED_F0A_FREEZE_RAW_SHA256,
} from './constants.js';

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);

const RootRefSchema = z.strictObject({
  rootKey: z.string().min(1),
  authorityKind: z.enum(['claim', 'promotion']),
  url: z.string().min(1),
});

export const FrozenBatchContextSchema = z.strictObject({
  organisationName: z.string().min(1),
  echeRowKey: z.string().min(1),
  countryCode: z.string().min(1),
  runId: z.string().min(1),
  ruleVersion: z.string().min(1),
  fetchPolicyVersion: z.string().min(1),
  assemblyVersion: z.string().min(1),
  rootKey: z.null(),
  roots: z.array(RootRefSchema).min(1),
});

export const FrozenBatchSchema = z.strictObject({
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
  finalInputSha256: z.strictObject({
    PROMPT_V1_CANONICAL: Sha256,
    PROMPT_V2_CANONICAL: Sha256,
  }),
});

const VariantSchema = z.strictObject({
  name: z.enum(['PROMPT_V1_CANONICAL', 'PROMPT_V2_CANONICAL']),
  role: z.enum(['comparator', 'candidate']),
  order: z.int().min(1).max(2),
  gitCommit: GitSha,
  runtimeBaseCommit: GitSha,
  promptVersion: z.string().min(1),
  runtimePromptCharacters: z.int().min(1),
  runtimePromptUtf8Bytes: z.int().min(1),
  runtimePromptSha256: Sha256,
});

/** F1A/F0B: the SDK-bundled executable contract and the run-platform binary identity (prose fields pass through). */
export const FrozenClaudeCodeExecutableSchema = z.looseObject({
  source: z.literal('SDK_BUNDLED_NATIVE_BINARY'),
  sdkPackage: z.string().min(1),
  sdkVersion: z.string().min(1),
  claudeCodeVersion: z.string().min(1),
  nativePackagePrefix: z.string().min(1),
  sameExecutableForAuthStatusAndInference: z.literal(true),
  externalPathCliAcceptedAsPreflightOracle: z.literal(false),
  runPlatform: z.strictObject({
    platform: z.string().min(1),
    arch: z.string().min(1),
    platformKey: z.string().min(1),
    nativePackage: z.string().min(1),
    nativePackageVersion: z.string().min(1),
    binaryFileName: z.string().min(1),
    binaryBytes: z.int().min(1),
    binarySha256: Sha256,
  }),
});

/** F1A/F0B: the POSIX `USER` requirement, recorded as a NAME; its value is never recorded (prose fields pass through). */
export const FrozenChildEnvironmentSchema = z.looseObject({
  posixOsPassthroughAddition: z.literal(FROZEN_POSIX_USER_VARIABLE),
  valueRecorded: z.literal(false),
  lognameIsSubstitute: z.literal(false),
  windowsAllowlistChanged: z.literal(false),
});

/** The frozen shape of ADR 0011's repair policy: exactly one round, a named minimum window. */
export const RepairPolicySchema = z.strictObject({
  enabled: z.boolean(),
  maxRoundsPerLogicalEvaluation: z.literal(1),
  minimumRemainingBudgetMs: z.int().min(1),
});

export type FrozenRepairPolicy = z.infer<typeof RepairPolicySchema>;

/** Only the fields the runner reads are closed; prose fields pass through. */
export const FreezeSchema = z.looseObject({
  freezeId: z.literal('PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1'),
  version: z.literal(EXPECTED_FREEZE_VERSION),
  status: z.literal('FROZEN_NO_INFERENCE_RUN'),
  freezeRevision: z.literal(EXPECTED_FREEZE_REVISION),
  supersedesFreezeRawSha256: z.literal(SUPERSEDED_F0A_FREEZE_RAW_SHA256),
  git: z.looseObject({
    repository: z.string().min(1),
    r2bHardLiveness: z.looseObject({ commit: GitSha }),
    r3PromptV2: z.looseObject({ commit: GitSha }),
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
      total: z.literal(EXPECTED_LOGICAL_EVALUATIONS),
      perVariant: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
    }),
    plan: z.array(FrozenBatchSchema).length(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
  }),
  inputConstruction: z.looseObject({
    context: z.looseObject({
      ruleVersion: z.string().min(1),
      fetchPolicyVersion: z.string().min(1),
      assemblyVersion: z.string().min(1),
      rootKey: z.null(),
    }),
    promptVersionByVariant: z.strictObject({
      PROMPT_V1_CANONICAL: z.string().min(1),
      PROMPT_V2_CANONICAL: z.string().min(1),
    }),
  }),
  classifier: z.looseObject({
    requestedModelId: z.string().min(1),
    agentSdk: z.looseObject({ package: z.string().min(1), version: z.string().min(1) }),
    assemblyVersion: z.string().min(1),
    outputSchemaVersion: z.string().min(1),
    runConfig: z.strictObject({ maxTurns: z.literal(3), thinking: z.literal('disabled') }),
    variants: z.array(VariantSchema).length(2),
    claudeCodeExecutable: FrozenClaudeCodeExecutableSchema,
    childEnvironment: FrozenChildEnvironmentSchema,
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
      watchdogDerivationMs: z.looseObject({ authStatusRunnerTimeout: z.int() }),
    }),
  }),
  stopConditions: z.looseObject({
    conditions: z.array(z.looseObject({ id: z.string().min(1), meaning: z.string().min(1) })),
  }),
  outputCapture: z.looseObject({
    requiredPerLogicalBatch: z.array(z.string().min(1)),
  }),
  unresolvedGold: z.looseObject({
    goldId: z.string().regex(/^g[0-9a-f]{16}$/),
    committedLabel: z.string().min(1),
  }),
  holdout: z.looseObject({ inferenceDuring2D2C: z.literal('FORBIDDEN') }),
  /**
   * Phase 2B-2D2C-R1 (ADR 0011): the bounded item-level repair policy a
   * freeze revision may declare. ABSENT on F0B, which is exactly what keeps
   * the F0B bytes and hash unchanged: absent means DISABLED, the pre-R1
   * lifecycle. A later freeze revision enabling it must also name a
   * variant root that implements the repair module, which the child checks.
   */
  repairPolicy: RepairPolicySchema.optional(),
});

export type Freeze = z.infer<typeof FreezeSchema>;

/** The policy a freeze declares, or the DISABLED policy when it declares none (F0B). */
export function freezeRepairPolicy(freeze: Freeze): FrozenRepairPolicy {
  return (
    freeze.repairPolicy ?? {
      enabled: false,
      maxRoundsPerLogicalEvaluation: 1,
      minimumRemainingBudgetMs: REPAIR_MINIMUM_REMAINING_BUDGET_MS,
    }
  );
}
export type FrozenBatch = z.infer<typeof FrozenBatchSchema>;
export type FrozenBatchContext = z.infer<typeof FrozenBatchContextSchema>;

export interface LoadedFreeze {
  readonly freeze: Freeze;
  /** The raw SHA-256 of the exact bytes read — equal to the F0B value, or loading failed. */
  readonly rawSha256: string;
  readonly rawBytes: number;
}

export class FreezeDriftError extends Error {
  override readonly name = 'FreezeDriftError';
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

/**
 * Loads the freeze from exact bytes. The raw hash is verified FIRST, before
 * the bytes are even parsed: a freeze with the wrong hash is never trusted
 * far enough to be read.
 */
export function loadFreezeFromBytes(bytes: Buffer): LoadedFreeze {
  const rawSha256 = sha256Hex(bytes);
  if (rawSha256 !== EXPECTED_F0B_FREEZE_RAW_SHA256) {
    throw new FreezeDriftError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `freeze raw SHA-256 ${rawSha256} does not equal the F0B value ` +
        `${EXPECTED_F0B_FREEZE_RAW_SHA256}` +
        `${rawSha256 === SUPERSEDED_F0A_FREEZE_RAW_SHA256 ? ' (it is the SUPERSEDED F0A freeze)' : ''}` +
        `; the freeze is not trusted and nothing proceeds.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new FreezeDriftError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `freeze bytes hash correctly but do not parse as JSON: ${String(error)}`,
    );
  }
  const result = FreezeSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new FreezeDriftError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `freeze shape is not the F0B contract: ${first ? `${first.path.join('.')}: ${first.message}` : 'unknown'}`,
    );
  }
  const freeze = result.data;
  assertFreezeAgreesWithConstants(freeze);
  return { freeze, rawSha256, rawBytes: bytes.length };
}

/** The freeze must say what this runner's own constants say; a disagreement is a drift in one of them. */
function assertFreezeAgreesWithConstants(freeze: Freeze): void {
  const problems: string[] = [];
  for (const expected of FROZEN_VARIANTS) {
    const actual = freeze.classifier.variants.find((v) => v.name === expected.name);
    if (actual === undefined) {
      problems.push(`variant ${expected.name} absent`);
      continue;
    }
    for (const key of [
      'role',
      'order',
      'gitCommit',
      'runtimeBaseCommit',
      'promptVersion',
      'runtimePromptSha256',
      'runtimePromptCharacters',
      'runtimePromptUtf8Bytes',
    ] as const) {
      if (actual[key] !== expected[key]) problems.push(`variant ${expected.name}.${key}`);
    }
    if (freeze.inputConstruction.promptVersionByVariant[expected.name] !== expected.promptVersion) {
      problems.push(`promptVersionByVariant.${expected.name}`);
    }
  }
  if (freeze.classifier.variants[0]?.order !== 1 || freeze.classifier.variants[1]?.order !== 2) {
    problems.push('variant order');
  }
  // F1A/F0B: the executable contract and the run-platform binary identity.
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
  if (run.nativePackage !== `${executable.nativePackagePrefix}${run.platformKey}`) {
    problems.push('runPlatform.nativePackage');
  }
  if (run.nativePackageVersion !== FROZEN_AGENT_SDK_VERSION)
    problems.push('runPlatform.nativePackageVersion');
  if (run.binaryFileName !== FROZEN_RUN_PLATFORM.binaryFileName)
    problems.push('runPlatform.binaryFileName');
  if (run.binaryBytes !== FROZEN_RUN_PLATFORM.binaryBytes) problems.push('runPlatform.binaryBytes');
  if (run.binarySha256 !== FROZEN_RUN_PLATFORM.binarySha256)
    problems.push('runPlatform.binarySha256');
  const ids = freeze.stopConditions.conditions.map((c) => c.id);
  for (const id of STOP_CONDITIONS) if (!ids.includes(id)) problems.push(`stop condition ${id}`);
  for (const field of REQUIRED_CAPTURE_FIELDS) {
    if (!freeze.outputCapture.requiredPerLogicalBatch.includes(field)) {
      problems.push(`capture field ${field}`);
    }
  }
  if (freeze.outputCapture.requiredPerLogicalBatch.length !== REQUIRED_CAPTURE_FIELDS.length) {
    problems.push('capture field count');
  }
  for (const [index, batch] of freeze.batching.plan.entries()) {
    if (batch.ordinal !== index + 1) problems.push(`plan ordinal at index ${index}`);
    if (batch.canonicalSerializedInputSha256 !== batch.assemblyInputSha256) {
      problems.push(
        `plan ${batch.ordinal}: canonicalSerializedInputSha256 !== assemblyInputSha256`,
      );
    }
  }
  if (problems.length > 0) {
    throw new FreezeDriftError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `freeze disagrees with the runner's frozen constants: ${problems.join('; ')}`,
    );
  }
}

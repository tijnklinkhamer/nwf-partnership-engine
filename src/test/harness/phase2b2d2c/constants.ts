/**
 * PHASE 2B-2D2C-F1 — the frozen values the DEV runner is built against.
 *
 * Every value here is an OWNER_PRESERVED_REQUIREMENT of the F1 brief or a
 * value of the immutable freeze
 * (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json`), at its
 * F0B revision (F1A/F0B auth/runtime-parity, 2026-09-13). The runner
 * recomputes and verifies the freeze's raw SHA-256 before doing anything
 * execution-capable; these literals exist so that a freeze which has
 * drifted — the superseded F0A bytes included — is refused rather than
 * trusted.
 *
 * PURE. No network, no database, no filesystem, no clock, no environment.
 */

/** Repository-relative path of the freeze. */
export const FREEZE_PATH = 'docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json';

/** The immutable F0B freeze JSON raw SHA-256 (F1A/F0B audit §5). The ONLY accepted freeze hash. */
export const EXPECTED_F0B_FREEZE_RAW_SHA256 =
  'c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157';

/** The superseded F0A raw SHA-256 (F0A audit §13.9): named so it can be REFUSED by exact value, never accepted. */
export const SUPERSEDED_F0A_FREEZE_RAW_SHA256 =
  '7b84ac0bca90086eea8fb59cdbd501317e3bfd53533fa529a85a8a44988ad6aa';

export const EXPECTED_FREEZE_VERSION = 'phase2b-2d2c-dev-configuration-freeze-v1';
export const EXPECTED_FREEZE_REVISION = 'F0B_AUTH_RUNTIME_PARITY';

/**
 * The two frozen variants. `name` is the freeze's own variant name (the key
 * of every frozen `finalInputSha256`); `label` is the F1 brief's role label,
 * carried alongside, never in place of, the freeze name. `gitCommit` is the
 * CORRECTED runtime commit (F1A/F0B: the R2B/R3 commit plus the identical
 * auth/runtime-parity production correction, prompt untouched);
 * `runtimeBaseCommit` is the R2B/R3 commit it was built from. A root at the
 * base commit is REFUSED: it resolves no bundled executable and forwards no
 * `USER`.
 */
export const FROZEN_VARIANTS = [
  {
    name: 'PROMPT_V1_CANONICAL',
    label: 'PROMPT_V1_COMPARATOR',
    role: 'comparator',
    order: 1,
    gitCommit: '0d2928a474796b89fad0644e99b5b934ecad10d0',
    runtimeBaseCommit: '952f80e124bc681ee15c35386d30ba52a6d80c98',
    promptVersion: 'orgunit-classifier-prompt-v1',
    runtimePromptSha256: '65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0',
    runtimePromptCharacters: 9887,
    runtimePromptUtf8Bytes: 9963,
  },
  {
    name: 'PROMPT_V2_CANONICAL',
    label: 'PROMPT_V2_CANDIDATE',
    role: 'candidate',
    order: 2,
    gitCommit: 'c37dd5a73d0f285b97a0a9a43bf0e42be8fc99c7',
    runtimeBaseCommit: 'a36d024fa9a0bc6f4bc3c66b32ab6109fa4fa31a',
    promptVersion: 'orgunit-classifier-prompt-v2',
    runtimePromptSha256: '181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635',
    runtimePromptCharacters: 11304,
    runtimePromptUtf8Bytes: 11382,
  },
] as const;

export type FrozenVariantName = (typeof FROZEN_VARIANTS)[number]['name'];
export type FrozenVariantLabel = (typeof FROZEN_VARIANTS)[number]['label'];
export type FrozenVariant = (typeof FROZEN_VARIANTS)[number];

/**
 * F1A/F0B: the Claude Code executable both subprocesses run is the native
 * binary bundled by the exact installed Agent SDK, resolved from the variant
 * root's own `node_modules/`. The package NAMES live in the freeze (the
 * runner namespace never spells the SDK package); the versions and the
 * run-platform binary identity are restated here so a drifted freeze is
 * refused.
 */
export const FROZEN_AGENT_SDK_VERSION = '0.3.251';
export const FROZEN_CLAUDE_CODE_VERSION = '2.1.251';

/** The platform the DEV attribution run executes on, and its exact SDK-bundled binary (measured in both corrected roots). */
export const FROZEN_RUN_PLATFORM = Object.freeze({
  platform: 'darwin',
  arch: 'arm64',
  platformKey: 'darwin-arm64',
  binaryFileName: 'claude',
  binaryBytes: 197_171_680,
  binarySha256: '625869b01e0050f260b2980fac248fd9cef9e462612bded4ec9d3d49ff8969a5',
});

/** The POSIX account-name variable the macOS Keychain lookup requires (ADR 0010 Amendment A). Presence is frozen; its value is never recorded. */
export const FROZEN_POSIX_USER_VARIABLE = 'USER';

export const EXPECTED_LOGICAL_BATCHES_PER_VARIANT = 12;
export const EXPECTED_LOGICAL_EVALUATIONS = 24;
export const EXPECTED_CORPUS_ITEM_COUNT = 49;

/** Tier 1 (production constants, restated as the frozen expectation). */
export const FROZEN_TIER1_SOFT_DEADLINE_MS = 300_000;
export const FROZEN_TIER1_GRACE_MS = 10_000;
export const FROZEN_TIER1_TOTAL_BUDGET_MS = 600_000;
export const FROZEN_AUTH_STATUS_TIMEOUT_MS = 60_000;
export const FROZEN_MAX_TRANSIENT_RETRIES = 2;
export const FROZEN_TRANSIENT_RETRY_BASE_DELAY_MS = 500;
export const FROZEN_STDERR_TAIL_MAX_CHARS = 2_048;
export const FROZEN_DEFAULT_MAX_TURNS = 3;

/** Tier 2 (a 2D2C choice frozen by F0, not a production constant). */
export const FROZEN_TIER2_WATCHDOG_MS = 700_000;
export const FROZEN_TIER2_GRACE_MS = 10_000;

/** The explicit run configuration the freeze pins; `effort` is ABSENT. */
export const FROZEN_RUN_CONFIG = Object.freeze({ maxTurns: 3, thinking: 'disabled' as const });

/** The ten frozen stop conditions, exactly. */
export const STOP_CONDITIONS = [
  'CHILD_EXITED_UNCONFIRMED',
  'SUPPRESSED_EXPIRED_TARGET_IDENTITY',
  'TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT',
  'RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION',
  'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
  'CORPUS_CONFIG_OR_HASH_DRIFT',
  'UNEXPECTED_RESPONSE_MODEL_ID',
  'ISOLATION_VIOLATION',
  'USAGE_LIMIT_INTERRUPTION',
  'UNRECONCILED_PROVIDER_FAILURE',
] as const;

export type StopConditionId = (typeof STOP_CONDITIONS)[number];

/**
 * 2D2C-F0Z — THE RELIABILITY SEMANTICS VERSION.
 *
 * A run under `RELIABILITY_SEMANTICS_V2` is NOT observation-semantics-
 * identical to Recovery-1 and must never be silently pooled with it. Under
 * v1 a confirmed provider TIMEOUT ended the whole replicate, so its items and
 * every later batch's items were UNOBSERVED. Under v2 that evaluation closes
 * durably, ITS OWN items become observed-INVALID, and the next frozen logical
 * evaluation proceeds. The denominator's SIZE is unchanged; its COMPOSITION
 * is not.
 *
 * Recovery-1 wrote no such field. Its absence therefore MEANS v1, and the
 * historical scorer keeps reading it exactly as before - the version is
 * recorded so a future run can be refused by a v1 reader, never so history
 * can be reinterpreted.
 */
export const RELIABILITY_SEMANTICS_V1_HISTORICAL = 'RELIABILITY_SEMANTICS_V1_RECOVERY_1';
export const RELIABILITY_SEMANTICS_V2 = 'RELIABILITY_SEMANTICS_V2_TIMEOUT_CONTINUATION';

/** The semantics a NEW run executes under. Recorded in the experiment manifest. */
export const RELIABILITY_SEMANTICS_VERSION = RELIABILITY_SEMANTICS_V2;

/**
 * MECHANICAL SAFETY BOUND, EXPLICITLY UNCALIBRATED. Without it a wedged host
 * could time out all twelve batches and still report COMPLETED_ALL_PLANNED.
 *
 * Recovery-1 measured 3 timeouts across 98 started batches (3.1%), and no
 * replicate had more than one. 2 is comfortably above that observed maximum
 * and far below 12. It is a bound, not a measurement, and it is the one
 * number in this slice a future run should re-examine.
 */
export const MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE = 2;

/**
 * 2D2C-F0Z — THE EXPLICIT EVALUATION-OUTCOME TAXONOMY.
 *
 * One durable class per logical evaluation, recorded on its stop decision.
 * The whole point is that these three families stay APART:
 *
 *   SEMANTIC INVALID OBSERVATION - the provider answered (or was asked and
 *     produced nothing usable); the item IS observed and counts in the
 *     denominator;
 *   MISSING DUE TO TERMINAL LIVENESS FAILURE - no answer exists and none can
 *     be attributed; the item is UNOBSERVED;
 *   CONTROL-PLANE FAILURE - the run was never entitled to ask; no item
 *     conclusion of any kind.
 *
 * Collapsing any two of them is precisely the defect this slice corrects.
 */
export const EVALUATION_OUTCOME_CLASSES = [
  /** OK, reconciled: raw checkpoint, validation and model id all recorded. */
  'VALIDATED_SEMANTIC_RESULT',
  /** OK, but documents remained rejected after the ADR 0011 repair round. */
  'VALIDATOR_REJECTED_POST_REPAIR',
  /** Semantic INVALID: the provider produced no usable structured result. Continues. */
  'STRUCTURED_OUTPUT_FAILED_NON_TERMINAL',
  /** Semantic INVALID: a confirmed Tier-1 TIMEOUT, durably closed. Continues (v2 only). */
  'PROVIDER_TIMEOUT_NON_TERMINAL',
  /** CONTROL-PLANE: auth, refusal, usage limit, isolation, drift. Never an observation. */
  'AUTH_OR_PRE_INFERENCE_FAILURE',
  /** TERMINAL LIVENESS: the Tier-2 watchdog fired on a child that was genuinely not answering. */
  'TIER2_LIVENESS_FAILURE',
  /** The child disappeared and the evidence cannot say cleanly how. FAIL CLOSED. */
  'AMBIGUOUS_CHILD_TERMINATION',
] as const;

export type EvaluationOutcomeClass = (typeof EVALUATION_OUTCOME_CLASSES)[number];

/**
 * The CLOSED set of provider outcomes a non-terminal evaluation may carry.
 *
 * This is deliberately the same set the forward scorer admits as observed
 * INVALID. Before F0Z the coordinator continued on ANY unrecognised non-OK
 * outcome - including `AUTH_FAILURE`, `PROVIDER_REFUSAL` and
 * `PROVIDER_TRANSIENT` - none of which the scorer admits, so such a run was
 * silently unscoreable. Continuation is now allow-listed and fails closed.
 */
export const NON_TERMINAL_PROVIDER_OUTCOMES = ['STRUCTURED_OUTPUT_FAILED', 'TIMEOUT'] as const;

/**
 * The 38 capture fields F0A requires per logical batch, in the freeze's own
 * order. The final record carries every one of them by this exact name.
 */
export const REQUIRED_CAPTURE_FIELDS = [
  'freezeVersion',
  'freezeConfigRawSha256',
  'variantName',
  'variantGitCommit',
  'logicalBatchOrdinal',
  'organisationId',
  'echeRowKey',
  'orderedGoldIds',
  'orderedDocIndices',
  'canonicalSerializedInputSha256',
  'assemblyInputSha256',
  'finalInputSha256',
  'serializedBatchUtf8Bytes',
  'batchContext',
  'promptVersion',
  'promptSha256',
  'requestedModelId',
  'providerReportedModelId',
  'startedAtUtc',
  'endedAtUtc',
  'monotonicWallTimeMs',
  'attemptNo',
  'internalAdapterAttemptCountWhereObservable',
  'inputTokens',
  'outputTokens',
  'cacheUsageWhereExposed',
  'providerOutcome',
  'rawOutputCanonicalSerialization',
  'rawOutputSha256',
  'validatorAcceptedRecords',
  'validatorRejectedRecords',
  'validatorRejectionReasons',
  'tier1StderrTailOnTimeout',
  'tier1ProgressTraceOnTimeout',
  'tier2Outcome',
  'tier2GracePhaseVerdict',
  'tier2HardKillDisposition',
  'tier2CleanupResult',
] as const;

export type RequiredCaptureField = (typeof REQUIRED_CAPTURE_FIELDS)[number];

/** The runner's own record version, stamped on every artifact envelope. */
export const RUNNER_ARTIFACT_VERSION = 'phase2b-2d2c-f1-dev-runner-artifact-v1';

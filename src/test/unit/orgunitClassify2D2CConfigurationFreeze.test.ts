/**
 * PHASE 2B-2D2C-F0 — the DEV attribution configuration freeze
 * (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json`) is
 * pinned against the committed bytes it freezes and against the production
 * exports it names. If the freeze and the repository ever disagree, this
 * test fails; the freeze is never rewritten to match an unexpected result.
 *
 * THE HOLDOUT BOUNDARY BINDS HERE. This file reads exactly two evaluation
 * fixtures — the DEVELOPMENT-only canonical corpus and its manifest. It never
 * opens the mixed source corpus and never opens any adjudication file, so no
 * HOLDOUT document, gold id or label can reach this process. Membership is
 * proved POSITIVELY: every gold id the freeze names must be a DEVELOPMENT
 * canonical-corpus id.
 *
 * NO GIT, NO NETWORK, NO DATABASE, NO PROVIDER. Git ancestry of the pinned
 * commits belongs to the F0 audit record's executed evidence, not to a test
 * that must pass on any branch. The v1 comparator prompt hash is verified
 * WITHOUT Git: the five reviewed 2D2B-3 insertions are removed from the
 * production v2 runtime prompt and the remainder must hash to the pinned v1
 * value.
 *
 * PHASE 2B-2D2C-F0A — INPUT IDENTITY CLOSURE. F0 pinned the corpus, the
 * batch plan and the prompts but not the complete `ClassifierBatchContext`
 * a batch sends, so the canonical serialized batch bytes and the 12 + 24
 * input identities were not yet defined. This file now reconstructs every
 * batch's `{ context, documents }` INDEPENDENTLY from the DEVELOPMENT-only
 * canonical corpus and the production version constants, serializes it
 * with the production canonicalizer, and requires the byte length, the
 * assembly identity and both final identities to equal the frozen values
 * AND the literal oracle below. Mutation tests prove each check bites; every
 * mutation is applied to an in-memory clone and the committed bytes are
 * re-verified untouched afterwards.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import {
  EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION,
  ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
} from '../../orgunits/classify/constants.js';
import {
  GoldCorpusItemSchema,
  type GoldCorpusItem,
} from '../../orgunits/classify/evaluation/goldSchema.js';
import { hashRecords } from '../../orgunits/classify/evaluation/hashes.js';
import {
  ABSOLUTE_GATES,
  MAX_SUBGROUP_SHORTFALL,
  MIN_SUBGROUP_SIZE_FOR_GATING,
  ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION,
  ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_PROTOCOL_VERSION,
} from '../../orgunits/classify/evaluation/protocol.js';
import { computeFinalInputSha256 } from '../../orgunits/classify/finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../orgunits/classify/outputSchema.js';
import {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
} from '../../orgunits/classify/prompt.js';
import { v2FromV3, v3FromV4, v4FromV5, v5FromV6 } from '../harness/phase2b2d2c/promptLineage.js';
import {
  AGENT_SDK_STDERR_TAIL_MAX_CHARS,
  CLASSIFIER_CALL_HARD_KILL_GRACE_MS,
  CLASSIFIER_CALL_SOFT_DEADLINE_MS,
  CLASSIFIER_CALL_TOTAL_BUDGET_MS,
} from '../../orgunits/classify/provider/agentSdkRunner.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from '../../orgunits/classify/provider/allowedModels.js';
import { AUTH_STATUS_TIMEOUT_MS } from '../../orgunits/classify/provider/authStatusRunner.js';
import {
  buildAgentSdkInvocation,
  CLASSIFIER_DEFAULT_MAX_TURNS,
} from '../../orgunits/classify/provider/sdkOptions.js';
import {
  MAX_TRANSIENT_RETRIES,
  TRANSIENT_RETRY_BASE_DELAY_MS,
} from '../../orgunits/classify/retry.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../../orgunits/signals/score.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
import { HARNESS_STDERR_TAIL_MAX_CHARS } from '../harness/processIsolatedBatch.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const FREEZE_PATH = 'docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json';

/** The only two evaluation fixtures this file may read (module comment). */
const DEV_CORPUS =
  'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1-canonical-v2.jsonl';
const DEV_MANIFEST =
  'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1-canonical-v2.manifest.jsonl';

// ---------------------------------------------------------------------------
// Expected values. Every one is an OWNER_PRESERVED_REQUIREMENT of the F0
// brief, and every hash is recomputed below from committed bytes.
// ---------------------------------------------------------------------------
const EXPECTED = {
  version: 'phase2b-2d2c-dev-configuration-freeze-v1',
  status: 'FROZEN_NO_INFERENCE_RUN',
  baselineMain: '7adf895fa20e9b25758e0748d1a02e26c387d19b',
  r1: '3b677dd2b0788ff9d7967f5c1627dddd1f81a1fd',
  r2b: '952f80e124bc681ee15c35386d30ba52a6d80c98',
  r3: 'a36d024fa9a0bc6f4bc3c66b32ab6109fa4fa31a',
  sourceCorpusRawSha256: 'dec0a5992afa4fd7b64009202d461edc91ddc29218f35e35f6bb7edd40d63ede',
  sourceManifestCorpusSha256: '42f041ee5704408788ff301811983c123c200f4c1d6f4fa89696d6b4abaea44b',
  derivedCorpusRawSha256: 'c5a9923a35689fd8b0950d615ee5339c6ccc63e83ac067960760497b6a9c4536',
  derivedManifestRawSha256: '9ef7dfb45307004297f019351163b06478d2f552834f10496545cfaf1a9a20f6',
  derivedCorpusContentSha256: 'f00139e42ff5d12dfc1a6ba1b969a635197ddda27f79515473f119ff919a6fa2',
  v1PromptSha256: '65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0',
  v2PromptSha256: '181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635',
  sdkVersion: '0.3.251',
  unresolvedGoldId: 'ge789b0f0aedc398c',
  freezeRevision: 'F0B_AUTH_RUNTIME_PARITY',
  f0aRevision: 'F0A_INPUT_IDENTITY_CLOSURE',
  supersededFreezeRawSha256: '7b84ac0bca90086eea8fb59cdbd501317e3bfd53533fa529a85a8a44988ad6aa',
  f0FreezeRawSha256: '422873a11d3876e4aa24b250cbc484a7f66b3100f1e3cda08d733a11c40a7164',
  correctedV1: '0d2928a474796b89fad0644e99b5b934ecad10d0',
  correctedV2: 'c37dd5a73d0f285b97a0a9a43bf0e42be8fc99c7',
  claudeCodeVersion: '2.1.251',
  runPlatformKey: 'darwin-arm64',
  runBinaryBytes: 197171680,
  runBinarySha256: '625869b01e0050f260b2980fac248fd9cef9e462612bded4ec9d3d49ff8969a5',
  ruleVersion: 'orgunit-signal-rules-v1',
  fetchPolicyVersion: 'orgunit-fetch-policy-v1',
  assemblyVersion: 'orgunit-classifier-assembly-v2',
  outputSchemaVersion: 'orgunit-classifier-output-schema-v2',
  v1PromptVersion: 'orgunit-classifier-prompt-v1',
  v2PromptVersion: 'orgunit-classifier-prompt-v2',
} as const;

/**
 * F0A ORACLE: the 12 assembly identities and 24 final identities, as
 * literals independent of the freeze JSON. Both the JSON and this table are
 * compared against a fresh reconstruction from the committed corpus on
 * every run; neither is ever edited to match an unexpected result.
 */
const EXPECTED_INPUT_IDENTITIES: readonly {
  readonly ordinal: number;
  readonly organisationId: string;
  readonly serializedBatchUtf8Bytes: number;
  readonly assemblyInputSha256: string;
  readonly finalV1: string;
  readonly finalV2: string;
}[] = [
  {
    ordinal: 1,
    organisationId: 'e115cbf8-25b4-4ccd-aa26-0b7b67af3f59',
    serializedBatchUtf8Bytes: 2886,
    assemblyInputSha256: '7179ad30e8292a024a0eba04233a787bc88293c5b11b94e744046a348da07644',
    finalV1: 'c208a683f656290a83fdc408f06e2f50a26e2d273a4cb6d738f7ea20b0e983ed',
    finalV2: '65bb07834ea233e237f71af971fcb3c2e3ced9a86d212321d1ac7bf12e1c8df9',
  },
  {
    ordinal: 2,
    organisationId: '4001270a-08ce-4018-b91e-abda06c52aa9',
    serializedBatchUtf8Bytes: 14145,
    assemblyInputSha256: 'ab75d12af9ac4c455b60bed11c0d6dad1b5f48de10ef96eb42c14aba411b1a91',
    finalV1: '2339f4fad8eff19d6251edc7c53a6c2c46640ca012ef6aa8f4e087bcf48a31d1',
    finalV2: 'f5bd11844e43a839799359e36215eb8f3f268951cf8ffdb142dab32332ea7c46',
  },
  {
    ordinal: 3,
    organisationId: '8b77946d-fe7d-4bb6-839d-5b9d116df3a0',
    serializedBatchUtf8Bytes: 13857,
    assemblyInputSha256: 'd7d98440e5bc091862e9d42c6b03eb36b387be9ef197322d2220ac2622a683dd',
    finalV1: 'fb20bcae94361589bd884c016bc2888607ae888eb7e79d1434d7223a69600415',
    finalV2: '8cec01c93119499e6f5c5b8137f753d439a06f25576bb12c88b81097b40a3000',
  },
  {
    ordinal: 4,
    organisationId: 'fc062f6b-d5b6-4026-b02c-0f94f787e2e8',
    serializedBatchUtf8Bytes: 8596,
    assemblyInputSha256: 'e154b407c7f8d4d34ce093819a7aafef0c992a478c11583cf326dad88e8b6a12',
    finalV1: '4b58a69ba08d17984c6c05449a294e2187c7963acf78d9b9e24eb0a64f1236d2',
    finalV2: 'be7da3efa2932b2a647f97692c73eece22e7e614e50eee3d72090487948dac93',
  },
  {
    ordinal: 5,
    organisationId: 'eba8e841-8dae-4423-8d47-4e26ede49c13',
    serializedBatchUtf8Bytes: 8579,
    assemblyInputSha256: '70d9caf445a693280d1639209d08a7838e35e24be92c4987edffec1a179b1c3b',
    finalV1: 'aac0f47c352b4e7e8a2ad5a1d645ad63e2c3130a6a2060ce10dc55d27e407f4f',
    finalV2: '4fd5d1159ca56dea5dc033a082d1244642000237a3d3117d8564d91b01858af3',
  },
  {
    ordinal: 6,
    organisationId: '885cea79-9d11-4c36-934d-976ff3e23e6f',
    serializedBatchUtf8Bytes: 6190,
    assemblyInputSha256: 'd75c5d26c7a44019a734c0b0d625962fe6c700487efb934ebe44dd67c0c8cbda',
    finalV1: 'fee447327d266aee90022de21690872a23f7f8515d0d279401ff2f260d00cd4e',
    finalV2: 'd97621f48923580b3f4d0e7fc32d44887163059e6ed9947dcbf755a65a6490ac',
  },
  {
    ordinal: 7,
    organisationId: 'cf4ac61c-09de-4901-84e6-a7fe0f3366ff',
    serializedBatchUtf8Bytes: 14463,
    assemblyInputSha256: '4fbc2317770371ae7c60ae2a7fbbb4d02aab5120f0767cf7dac36c4c8b5c9df4',
    finalV1: '03470f63873e0699a189823f0ddf6f2244b90e8801de94dd4420b9e763cddd08',
    finalV2: 'e6053074ba64155f20efbedbf102c059b98425c2ad09d580bae47243ae6fe517',
  },
  {
    ordinal: 8,
    organisationId: 'ca7f8271-a111-466e-86f4-06913eb80a8d',
    serializedBatchUtf8Bytes: 12302,
    assemblyInputSha256: '397be36ecdea24e98a8d9ab69a87038066a996cd78e06ed2e4e46fdb28c5a9c8',
    finalV1: '708f7b840c8eaafb4d11bac82f747feea2cafda85e83e31c402bd4af9587e369',
    finalV2: '5e1c29b149d91a401e448c5db4d6d28dd0ec837a8d27161c52c566ad51191955',
  },
  {
    ordinal: 9,
    organisationId: 'e1e18eda-ceb1-42d6-8f70-6bd6110cb3b1',
    serializedBatchUtf8Bytes: 11504,
    assemblyInputSha256: '6ce838c6e2b243bf4dec5dcdf8df0e04d69220b44f7020e4b602fa6f0867a890',
    finalV1: 'd17be7622466359484ebdbc4263006755dcab81ce1031788c99032eacaea245f',
    finalV2: '43381ff1e33c76b007c7ff9a747853b0ee9dde14aeee8bd78ecde3588e0855cd',
  },
  {
    ordinal: 10,
    organisationId: '65af386d-22ca-4d28-bd8e-10438c1e1cc7',
    serializedBatchUtf8Bytes: 9698,
    assemblyInputSha256: '1320329b0ec4c20a8426c2e54e83048489bc9be21f0b957fb3d7711bec54ae3c',
    finalV1: '58aa6a2dd37617b3d05a57a58f458473d09da4d23d765a56f3ca534ee64cba32',
    finalV2: 'dfb9da31fb825885bd0b735f4e54198565bd8984c0f4d97dea4fa3988298f3a1',
  },
  {
    ordinal: 11,
    organisationId: '99f0eea2-8c96-4ef9-a263-ac571cba5279',
    serializedBatchUtf8Bytes: 8358,
    assemblyInputSha256: '03d3cdb0523ca9daaf055e1a5b5d0f878bbc27cf31454501da4927ca1ea8ec2f',
    finalV1: '6784b06c3c99ef7216dfb7d476d6fe87462a54e5b2c3e56bc378f28b83bda3b9',
    finalV2: '719f25367d8c9ffd0cd70be8c2ab6b65e85008af21868a12e2c3972cec1db2aa',
  },
  {
    ordinal: 12,
    organisationId: 'c95125b8-7783-48de-bc89-ad652f38f0dd',
    serializedBatchUtf8Bytes: 15921,
    assemblyInputSha256: '21f433c92635027ea6f451a2c528edc20b6521cdcc5dc4b0e84de3a16549973b',
    finalV1: 'f2b052cec43e65732a5ba4ccf4115fb2cedfee2a19141cd54a8216fa535e9ef3',
    finalV2: '0ccaa717538982f58cc6addc16442accaa98f20c0b23ff3e7cb1745b0df0e16d',
  },
];

/**
 * The five reviewed 2D2B-3 insertions that turn v1 into v2 (R3 recovery
 * record §3.2). Removing them from the production v2 runtime prompt must
 * reproduce the v1 comparator's hash exactly — the Git-free proof that the
 * two pinned prompt identities are the two ends of one reviewed edit.
 */
const V2_PARAGRAPH_INSERTIONS = [
  "Classify the page's primary subject, not the presence of relevant words, activities, or services. Use UNIT_PAGE only when an organisational unit or operating function is itself the page's primary subject — for example, the page presents that unit's identity, remit, team, responsibility, or ongoing operations. Use NOT_A_UNIT when the page instead has a programme, grant, activity, event, form, navigation destination, or general institutional information as its primary subject, even when it describes Erasmus, mobility, international students, language learning, or student services. Describing Erasmus or services does not by itself make a page a UNIT_PAGE.",
  "The whole-organisation allowance is narrow: use it only when the document presents the whole organisation in the role of an operating unit or function and makes that role the page's primary subject. The organisation's small size alone is never enough; a homepage, marketing or navigation page, programme or course page, and news or event page remain NOT_A_UNIT when no operating unit or function is the page's primary subject.",
  'NO requires affirmative evidence of absence; silence is UNKNOWN; a service list that omits an axis is not evidence against it.',
  "`unit_name` must be copied exactly from this document's own title, headings, or excerpt. Never take it from another document in the batch, and never expand an abbreviation or acronym.",
] as const;
const V2_INLINE_INSERTION = 'contact form, ';

const REQUIRED_STOP_CONDITIONS = [
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

const REQUIRED_CAPTURE_FIELDS = [
  'freezeVersion',
  'freezeConfigRawSha256',
  'variantName',
  'variantGitCommit',
  'logicalBatchOrdinal',
  'organisationId',
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

// ---------------------------------------------------------------------------
// Minimal structural type of the freeze — only the fields asserted below.
// ---------------------------------------------------------------------------
interface FreezeVariant {
  readonly name: string;
  readonly role: string;
  readonly order: number;
  readonly gitCommit: string;
  readonly runtimeBaseCommit: string;
  readonly promptVersion: string;
  readonly runtimePromptCharacters: number;
  readonly runtimePromptUtf8Bytes: number;
  readonly runtimePromptSha256: string;
}
/** The F0 plan fields — the batching policy, derived independently below. */
interface FreezeBatchPlanCore {
  readonly ordinal: number;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly organisationName: string;
  readonly documentCount: number;
  readonly goldIds: readonly string[];
  readonly docIndices: readonly number[];
  readonly corpusLineNumbers: readonly number[];
  readonly historicalAssemblyInputSha256: readonly string[];
}
interface FrozenRootRef {
  readonly rootKey: string;
  readonly authorityKind: string;
  readonly url: string;
}
/** The reconstructed `ClassifierBatchContext` F0A freezes per batch. */
interface FrozenBatchContext {
  readonly organisationName: string;
  readonly echeRowKey: string;
  readonly countryCode: string;
  readonly runId: string;
  readonly ruleVersion: string;
  readonly fetchPolicyVersion: string;
  readonly assemblyVersion: string;
  readonly rootKey: string | null;
  readonly roots: readonly FrozenRootRef[];
}
/** The F0A input-identity fields added to every plan entry. */
interface FreezeBatchInputIdentity {
  readonly context: FrozenBatchContext;
  readonly serializedBatchUtf8Bytes: number;
  readonly assemblyInputSha256: string;
  readonly canonicalSerializedInputSha256: string;
  readonly finalInputSha256: Record<string, string>;
}
type FreezeBatch = FreezeBatchPlanCore & FreezeBatchInputIdentity;
interface Freeze {
  readonly freezeId: string;
  readonly version: string;
  readonly status: string;
  readonly freezeRevision: string;
  readonly supersedesFreezeRawSha256: string;
  readonly revisionHistory: readonly {
    readonly revision: string;
    readonly freezeRawSha256: string;
    readonly timing?: string;
    readonly unchanged?: readonly string[];
    readonly rule?: string;
  }[];
  readonly git: {
    readonly baselineMain: string;
    readonly r1EvidenceCanonicalisation: { readonly commit: string };
    readonly r2bHardLiveness: { readonly commit: string };
    readonly r3PromptV2: { readonly commit: string };
    readonly correctedRuntimeV1: { readonly commit: string; readonly basedOn: string };
    readonly correctedRuntimeV2: { readonly commit: string; readonly basedOn: string };
    readonly freezeBranchBasedOn: string;
    readonly requiredAncestry: readonly string[];
  };
  readonly corpus: Record<string, unknown> & {
    readonly scope: string;
    readonly itemCount: number;
    readonly canonicalCorpusPath: string;
    readonly canonicalManifestPath: string;
    readonly holdoutFilesNeverRead: readonly string[];
  };
  readonly batching: {
    readonly evidenceClass: string;
    readonly groupBy: string;
    readonly logicalBatchesPerVariant: number;
    readonly distinctOrganisations: number;
    readonly distinctHistoricalAssemblyInputSha256: number;
    readonly organisationWithTwoHistoricalAssemblyGroups: {
      readonly organisationId: string;
      readonly historicalAssemblyGroupCount: number;
    };
    readonly forbiddenRegrouping: readonly string[];
    readonly concurrency: number;
    readonly execution: string;
    readonly variantOrdering: string;
    readonly plannedLogicalEvaluations: { readonly total: number; readonly perVariant: number };
    readonly plan: readonly FreezeBatch[];
  };
  readonly inputConstruction: {
    readonly evidenceClass: string;
    readonly claim: string;
    readonly batchShape: string;
    readonly documents: { readonly order: string; readonly docIndex: string };
    readonly context: Record<string, string | null>;
    readonly preconditions: readonly string[];
    readonly serialization: string;
    readonly finalInputSha256: string;
    readonly promptVersionByVariant: Record<string, string>;
    readonly invariants: readonly string[];
    readonly runnerRule: string;
  };
  readonly classifier: {
    readonly requestedModelId: string;
    readonly agentSdk: { readonly package: string; readonly version: string };
    readonly assemblyVersion: string;
    readonly outputSchemaVersion: string;
    readonly runConfig: Record<string, unknown>;
    readonly invocationSurfaceFrozenByReference: {
      readonly absent: readonly string[];
      readonly pathToClaudeCodeExecutable: string;
    };
    readonly variants: readonly FreezeVariant[];
    readonly claudeCodeExecutable: {
      readonly source: string;
      readonly sdkPackage: string;
      readonly sdkVersion: string;
      readonly claudeCodeVersion: string;
      readonly nativePackagePrefix: string;
      readonly sameExecutableForAuthStatusAndInference: boolean;
      readonly externalPathCliAcceptedAsPreflightOracle: boolean;
      readonly runPlatform: {
        readonly platform: string;
        readonly arch: string;
        readonly platformKey: string;
        readonly nativePackage: string;
        readonly nativePackageVersion: string;
        readonly binaryFileName: string;
        readonly binaryBytes: number;
        readonly binarySha256: string;
      };
    };
    readonly childEnvironment: {
      readonly posixOsPassthroughAddition: string;
      readonly valueRecorded: boolean;
      readonly lognameIsSubstitute: boolean;
      readonly windowsAllowlistChanged: boolean;
    };
  };
  readonly liveness: {
    readonly tier1: {
      readonly attemptSoftDeadlineMs: number;
      readonly abortCloseSettlementGraceMs: number;
      readonly totalProviderCallBudgetMs: number;
      readonly timeoutNeverRetriedInsideAdapter: boolean;
      readonly transientRetries: {
        readonly maxAfterFirstAttempt: number;
        readonly backoffMs: readonly number[];
        readonly backoffConsumesTotalBudget: boolean;
      };
      readonly worstCaseAttemptSequenceMs: number;
    };
    readonly tier2: {
      readonly parentWatchdogMs: number;
      readonly gracefulTerminationWindowMs: number;
      readonly stderrTailMaxChars: number;
      readonly watchdogDerivationMs: {
        readonly authStatusRunnerTimeout: number;
        readonly providerAttemptWindow: number;
        readonly finalInnerCloseGrace: number;
        readonly childStartupArtifactFlushAndSchedulingVariance: number;
        readonly total: number;
      };
    };
    readonly decisionRule: {
      readonly tier1FiresFirst: string;
      readonly tier2KillsBecauseTier1DidNotFire: string;
    };
  };
  readonly stopConditions: {
    readonly policy: string;
    readonly conditions: readonly { readonly id: string; readonly meaning: string }[];
  };
  readonly outputCapture: {
    readonly rawOutputRule: string;
    readonly writeOnce: string;
    readonly requiredPerLogicalBatch: readonly string[];
    readonly identityRules: readonly string[];
    readonly neverCaptured: readonly string[];
  };
  readonly scoring: {
    readonly protocol: string;
    readonly denominatorsUnchanged: boolean;
    readonly gates: Record<string, number>;
    readonly acceptanceRule: string;
    readonly requiredComparison: readonly string[];
  };
  readonly unresolvedGold: {
    readonly goldId: string;
    readonly committedLabel: string;
    readonly labelChangedByThisTask: boolean;
    readonly policy: readonly string[];
    readonly blockedStatus: string;
  };
  readonly holdout: {
    readonly inferenceDuring2D2C: string;
    readonly rules: readonly string[];
    readonly historicalExposureDisclosure: string;
  };
  readonly nextStep: string;
}

function raw(path: string): Buffer {
  return readFileSync(resolve(ROOT, path));
}
function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const FREEZE_RAW = raw(FREEZE_PATH).toString('utf8');
const FREEZE = JSON.parse(FREEZE_RAW) as Freeze;

/** Parsed DEVELOPMENT canonical corpus, in file order, each row schema-validated. */
const DEV_ROWS = raw(DEV_CORPUS)
  .toString('utf8')
  .trim()
  .split('\n')
  .map((line) => GoldCorpusItemSchema.parse(JSON.parse(line) as unknown));
const DEV_MANIFEST_ROW = JSON.parse(raw(DEV_MANIFEST).toString('utf8').trim()) as Record<
  string,
  unknown
>;
const DEV_GOLD_IDS = new Set(DEV_ROWS.map((row) => row.goldId));

/** Organisation groups in first-appearance order, documents in corpus order — the batching policy, derived independently of the freeze. */
function deriveBatchPlan(): FreezeBatchPlanCore[] {
  const groups: {
    organisationId: string;
    echeRowKey: string;
    organisationName: string;
    goldIds: string[];
    docIndices: number[];
    corpusLineNumbers: number[];
    historicalAssemblyInputSha256: string[];
  }[] = [];
  for (const [index, row] of DEV_ROWS.entries()) {
    let group = groups.find((g) => g.organisationId === row.organisationId);
    if (group === undefined) {
      group = {
        organisationId: row.organisationId,
        echeRowKey: row.echeRowKey,
        organisationName: row.organisationName,
        goldIds: [],
        docIndices: [],
        corpusLineNumbers: [],
        historicalAssemblyInputSha256: [],
      };
      groups.push(group);
    }
    group.goldIds.push(row.goldId);
    group.docIndices.push(row.docIndex);
    group.corpusLineNumbers.push(index + 1);
    if (!group.historicalAssemblyInputSha256.includes(row.assemblyInputSha256)) {
      group.historicalAssemblyInputSha256.push(row.assemblyInputSha256);
    }
  }
  return groups.map((g, i) => ({ ordinal: i + 1, documentCount: g.goldIds.length, ...g }));
}

/** Projects a frozen plan entry onto its F0 core fields, so the F0 policy check ignores the F0A identity fields. */
function planCoreOf(batch: FreezeBatch): FreezeBatchPlanCore {
  return {
    ordinal: batch.ordinal,
    organisationId: batch.organisationId,
    echeRowKey: batch.echeRowKey,
    organisationName: batch.organisationName,
    documentCount: batch.documentCount,
    goldIds: batch.goldIds,
    docIndices: batch.docIndices,
    corpusLineNumbers: batch.corpusLineNumbers,
    historicalAssemblyInputSha256: batch.historicalAssemblyInputSha256,
  };
}

// ---------------------------------------------------------------------------
// F0A: independent reconstruction of every batch's { context, documents }.
// ---------------------------------------------------------------------------
type ReconstructedDocument = GoldCorpusItem['document'];
interface ReconstructedBatchInput {
  readonly ordinal: number;
  readonly organisationId: string;
  readonly context: FrozenBatchContext;
  readonly documents: readonly ReconstructedDocument[];
}
interface ReconstructedIdentity {
  readonly serialized: string;
  readonly serializedBatchUtf8Bytes: number;
  readonly assemblyInputSha256: string;
  readonly finalV1: string;
  readonly finalV2: string;
}

const ordinalCompare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The one value every row of an organisation must share; throws on disagreement — never picks one. */
function commonValue<K extends 'organisationName' | 'echeRowKey' | 'countryCode' | 'runId'>(
  rows: readonly GoldCorpusItem[],
  key: K,
): GoldCorpusItem[K] {
  const distinct = new Set(rows.map((row) => row[key]));
  if (distinct.size !== 1) {
    throw new Error(`${key} disagrees within organisation ${rows[0]!.organisationId}`);
  }
  return rows[0]![key];
}

/** Union of every document's roots, deduplicated by exact rootKey with byte-identical metadata required, sorted by rootKey (ordinal). */
function unionRoots(documents: readonly ReconstructedDocument[]): FrozenRootRef[] {
  const byKey = new Map<string, FrozenRootRef>();
  for (const document of documents) {
    for (const root of document.roots) {
      const seen = byKey.get(root.rootKey);
      if (seen === undefined) {
        byKey.set(root.rootKey, {
          rootKey: root.rootKey,
          authorityKind: root.authorityKind,
          url: root.url,
        });
      } else if (seen.authorityKind !== root.authorityKind || seen.url !== root.url) {
        throw new Error(`root ${root.rootKey} carries disagreeing metadata`);
      }
    }
  }
  return [...byKey.values()].sort((a, b) => ordinalCompare(a.rootKey, b.rootKey));
}

/** Reconstructs the exact ClassifierBatch of every organisation from DEV_ROWS and production constants alone. */
function reconstructBatchInputs(
  rows: readonly GoldCorpusItem[] = DEV_ROWS,
): ReconstructedBatchInput[] {
  const byOrganisation = new Map<string, GoldCorpusItem[]>();
  for (const row of rows) {
    const group = byOrganisation.get(row.organisationId);
    if (group === undefined) byOrganisation.set(row.organisationId, [row]);
    else group.push(row);
  }
  return [...byOrganisation.entries()].map(([organisationId, group], index) => {
    const documents = group.map((row) => row.document);
    return {
      ordinal: index + 1,
      organisationId,
      context: {
        organisationName: commonValue(group, 'organisationName'),
        echeRowKey: commonValue(group, 'echeRowKey'),
        countryCode: commonValue(group, 'countryCode'),
        runId: commonValue(group, 'runId'),
        ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
        fetchPolicyVersion: FETCH_POLICY_VERSION,
        assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
        rootKey: null,
        roots: unionRoots(documents),
      },
      documents,
    };
  });
}

/** Serializes exactly as the production canonicalizer does and derives all three identities through the production algorithm. */
function identityOf(
  input: Pick<ReconstructedBatchInput, 'context' | 'documents'>,
  promptVersions: { readonly v1: string; readonly v2: string } = {
    v1: EXPECTED.v1PromptVersion,
    v2: EXPECTED.v2PromptVersion,
  },
): ReconstructedIdentity {
  const serialized = canonicalStringify({ context: input.context, documents: input.documents });
  const assemblyInputSha256 = createHash('sha256').update(serialized, 'utf8').digest('hex');
  const final = (promptVersion: string): string =>
    computeFinalInputSha256({
      assemblyInputSha256,
      promptVersion,
      outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    });
  return {
    serialized,
    serializedBatchUtf8Bytes: Buffer.byteLength(serialized, 'utf8'),
    assemblyInputSha256,
    finalV1: final(promptVersions.v1),
    finalV2: final(promptVersions.v2),
  };
}

/**
 * The runner's own pre-flight, as a pure check: every frozen identity must
 * equal the identity recomputed from a reconstruction. Returns the list of
 * mismatches so the positive test can assert `[]` and the mutation tests can
 * assert exactly which check fired.
 */
function identityMismatches(
  plan: readonly FreezeBatch[],
  inputs: readonly ReconstructedBatchInput[],
): string[] {
  const mismatches: string[] = [];
  if (plan.length !== inputs.length) mismatches.push('batch count');
  for (const [index, batch] of plan.entries()) {
    const input = inputs[index];
    if (input === undefined) break;
    const identity = identityOf(input);
    if (batch.organisationId !== input.organisationId)
      mismatches.push(`${batch.ordinal}:organisationId`);
    if (canonicalStringify(batch.context) !== canonicalStringify(input.context)) {
      mismatches.push(`${batch.ordinal}:context`);
    }
    if (batch.serializedBatchUtf8Bytes !== identity.serializedBatchUtf8Bytes) {
      mismatches.push(`${batch.ordinal}:serializedBatchUtf8Bytes`);
    }
    if (batch.assemblyInputSha256 !== identity.assemblyInputSha256) {
      mismatches.push(`${batch.ordinal}:assemblyInputSha256`);
    }
    if (batch.canonicalSerializedInputSha256 !== batch.assemblyInputSha256) {
      mismatches.push(`${batch.ordinal}:canonicalSerializedInputSha256`);
    }
    if (batch.finalInputSha256['PROMPT_V1_CANONICAL'] !== identity.finalV1) {
      mismatches.push(`${batch.ordinal}:finalInputSha256.v1`);
    }
    if (batch.finalInputSha256['PROMPT_V2_CANONICAL'] !== identity.finalV2) {
      mismatches.push(`${batch.ordinal}:finalInputSha256.v2`);
    }
  }
  return mismatches;
}

/** A deep, mutable clone of the parsed freeze for mutation tests; the committed bytes are never touched. */
function cloneFreeze(): {
  batching: {
    plan: (FreezeBatchPlanCore & {
      context: {
        organisationName: string;
        echeRowKey: string;
        countryCode: string;
        runId: string;
        ruleVersion: string;
        fetchPolicyVersion: string;
        assemblyVersion: string;
        rootKey: string | null;
        roots: FrozenRootRef[];
      };
      serializedBatchUtf8Bytes: number;
      assemblyInputSha256: string;
      canonicalSerializedInputSha256: string;
      finalInputSha256: Record<string, string>;
    })[];
  };
} {
  return JSON.parse(FREEZE_RAW) as ReturnType<typeof cloneFreeze>;
}

describe('2D2C-F0 freeze: identity and Git pins', () => {
  it('has the exact version and status', () => {
    expect(FREEZE.freezeId).toBe('PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1');
    expect(FREEZE.version).toBe(EXPECTED.version);
    expect(FREEZE.status).toBe(EXPECTED.status);
  });

  it('pins the four Git states and bases the freeze branch on the exact R3 commit', () => {
    expect(FREEZE.git.baselineMain).toBe(EXPECTED.baselineMain);
    expect(FREEZE.git.r1EvidenceCanonicalisation.commit).toBe(EXPECTED.r1);
    expect(FREEZE.git.r2bHardLiveness.commit).toBe(EXPECTED.r2b);
    expect(FREEZE.git.r3PromptV2.commit).toBe(EXPECTED.r3);
    expect(FREEZE.git.freezeBranchBasedOn).toBe(EXPECTED.r3);
    for (const sha of [EXPECTED.baselineMain, EXPECTED.r1, EXPECTED.r2b, EXPECTED.r3]) {
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});

describe('2D2C-F0 freeze: corpus identity, recomputed from committed bytes', () => {
  it('names the DEVELOPMENT-only canonical corpus and manifest, and never the mixed or adjudication files', () => {
    expect(FREEZE.corpus.scope).toBe('DEVELOPMENT');
    expect(FREEZE.corpus.canonicalCorpusPath).toBe(DEV_CORPUS);
    expect(FREEZE.corpus.canonicalManifestPath).toBe(DEV_MANIFEST);
    expect(FREEZE.corpus.holdoutFilesNeverRead).toHaveLength(2);
    for (const never of FREEZE.corpus.holdoutFilesNeverRead) {
      expect(never).not.toBe(DEV_CORPUS);
      expect(never).not.toBe(DEV_MANIFEST);
    }
  });

  it('raw SHA-256 of the derived corpus and manifest match the freeze exactly', () => {
    expect(sha256(raw(DEV_CORPUS))).toBe(EXPECTED.derivedCorpusRawSha256);
    expect(sha256(raw(DEV_MANIFEST))).toBe(EXPECTED.derivedManifestRawSha256);
    expect(FREEZE.corpus['derivedCorpusRawSha256']).toBe(EXPECTED.derivedCorpusRawSha256);
    expect(FREEZE.corpus['derivedManifestRawSha256']).toBe(EXPECTED.derivedManifestRawSha256);
  });

  it('content hash of the derived corpus recomputes to the freeze value and to the manifest', () => {
    expect(hashRecords(DEV_ROWS)).toBe(EXPECTED.derivedCorpusContentSha256);
    expect(FREEZE.corpus['derivedCorpusContentSha256']).toBe(EXPECTED.derivedCorpusContentSha256);
    expect(DEV_MANIFEST_ROW['corpusSha256']).toBe(EXPECTED.derivedCorpusContentSha256);
  });

  it('every corpus identity value agrees with the committed manifest', () => {
    expect(FREEZE.corpus.itemCount).toBe(49);
    expect(DEV_MANIFEST_ROW['itemCount']).toBe(49);
    expect(DEV_MANIFEST_ROW['split']).toBe('DEVELOPMENT');
    expect(FREEZE.corpus['derivationVersion']).toBe(
      'orgunit-classifier-sonnet-acceptance-canonical-v2',
    );
    expect(DEV_MANIFEST_ROW['derivationVersion']).toBe(FREEZE.corpus['derivationVersion']);
    expect(FREEZE.corpus['canonicalisationRule']).toBe('NFC(decodeHtmlEntities_HTML4_once(text))');
    expect(DEV_MANIFEST_ROW['canonicalisationRule']).toBe(FREEZE.corpus['canonicalisationRule']);
    expect(FREEZE.corpus['sourceCorpusRawSha256']).toBe(EXPECTED.sourceCorpusRawSha256);
    expect(DEV_MANIFEST_ROW['sourceCorpusRawSha256']).toBe(EXPECTED.sourceCorpusRawSha256);
    expect(FREEZE.corpus['sourceManifestCorpusSha256']).toBe(EXPECTED.sourceManifestCorpusSha256);
    expect(DEV_MANIFEST_ROW['sourceManifestCorpusSha256']).toBe(
      EXPECTED.sourceManifestCorpusSha256,
    );
    expect(FREEZE.corpus['sourceCorpusVersion']).toBe(
      ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION,
    );
    expect(DEV_MANIFEST_ROW['sourceCorpusVersion']).toBe(FREEZE.corpus['sourceCorpusVersion']);
    expect(FREEZE.corpus['changedDocumentCount']).toBe(12);
    expect(DEV_MANIFEST_ROW['changedDocumentCount']).toBe(12);
    expect(FREEZE.corpus['unchangedDocumentCount']).toBe(37);
    expect(DEV_MANIFEST_ROW['unchangedDocumentCount']).toBe(37);
  });

  it('holds exactly 49 DEVELOPMENT rows with unique gold ids and no other split', () => {
    expect(DEV_ROWS).toHaveLength(49);
    expect(DEV_GOLD_IDS.size).toBe(49);
    for (const row of DEV_ROWS) {
      expect(row.split).toBe('DEVELOPMENT');
      expect(row.corpusVersion).toBe(ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION);
      expect(row.docIndex).toBe(row.document.docIndex);
    }
  });

  it('every item carries the one extraction version assembly v2 canonicalises, exactly as the freeze says', () => {
    expect(FREEZE.corpus['extractionRuleVersionOfEveryItem']).toBe(
      EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION,
    );
    for (const row of DEV_ROWS) {
      expect(row.document.extractionRuleVersion).toBe(
        EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION,
      );
    }
  });

  it('every gold id the freeze names anywhere is a DEVELOPMENT canonical-corpus id (positive membership proof)', () => {
    const named = FREEZE_RAW.match(/\bg[0-9a-f]{16}\b/g) ?? [];
    expect(named.length).toBeGreaterThanOrEqual(49);
    for (const id of named)
      expect(DEV_GOLD_IDS.has(id), `${id} is not a DEVELOPMENT id`).toBe(true);
  });
});

describe('2D2C-F0 freeze: batching contract, reconstructed from recorded run evidence', () => {
  const derived = deriveBatchPlan();

  it('is labelled as reconstructed, groups by exact organisationId, and plans 12 batches per variant', () => {
    expect(FREEZE.batching.evidenceClass).toBe('RECONSTRUCTED_FROM_RECORDED_RUN_EVIDENCE');
    expect(FREEZE.batching.groupBy).toBe('organisationId');
    expect(FREEZE.batching.logicalBatchesPerVariant).toBe(12);
    expect(FREEZE.batching.distinctOrganisations).toBe(12);
    expect(FREEZE.batching.plannedLogicalEvaluations).toEqual({ total: 24, perVariant: 12 });
    expect(FREEZE.batching.concurrency).toBe(1);
    expect(FREEZE.batching.execution).toBe('sequential');
    expect(FREEZE.batching.variantOrdering).toContain('every PROMPT_V1_CANONICAL batch completes');
    for (const forbidden of ['label', 'failure class', 'language', 'observed model result']) {
      expect(FREEZE.batching.forbiddenRegrouping).toContain(forbidden);
    }
  });

  it('the corpus has 12 organisation groups and 13 distinct historical assembly hashes', () => {
    expect(derived).toHaveLength(12);
    expect(new Set(DEV_ROWS.map((r) => r.organisationId)).size).toBe(12);
    const assemblyHashes = new Set(DEV_ROWS.map((r) => r.assemblyInputSha256));
    expect(assemblyHashes.size).toBe(13);
    expect(FREEZE.batching.distinctHistoricalAssemblyInputSha256).toBe(13);
    const twoGroups = derived.filter((g) => g.historicalAssemblyInputSha256.length === 2);
    expect(twoGroups).toHaveLength(1);
    expect(twoGroups[0]!.organisationId).toBe(
      FREEZE.batching.organisationWithTwoHistoricalAssemblyGroups.organisationId,
    );
    expect(
      FREEZE.batching.organisationWithTwoHistoricalAssemblyGroups.historicalAssemblyGroupCount,
    ).toBe(2);
    expect(derived.reduce((n, g) => n + g.goldIds.length, 0)).toBe(49);
  });

  it('organisations are contiguous in corpus order, so first-appearance grouping never interleaves', () => {
    const boundaries: string[] = [];
    for (const row of DEV_ROWS) {
      if (boundaries[boundaries.length - 1] !== row.organisationId)
        boundaries.push(row.organisationId);
    }
    expect(boundaries).toHaveLength(12);
    expect(new Set(boundaries).size).toBe(12);
  });

  it('the frozen plan equals the independently derived plan, ordinal by ordinal', () => {
    expect(FREEZE.batching.plan).toHaveLength(12);
    expect(FREEZE.batching.plan.map(planCoreOf)).toEqual(derived);
    for (const [i, batch] of FREEZE.batching.plan.entries()) {
      expect(batch.ordinal).toBe(i + 1);
      expect(batch.documentCount).toBe(batch.goldIds.length);
      expect(batch.docIndices).toHaveLength(batch.goldIds.length);
      expect(batch.corpusLineNumbers).toHaveLength(batch.goldIds.length);
      // Document order is corpus order: line numbers strictly increase.
      for (let k = 1; k < batch.corpusLineNumbers.length; k += 1) {
        expect(batch.corpusLineNumbers[k]!).toBeGreaterThan(batch.corpusLineNumbers[k - 1]!);
      }
      // Original docIndex values are preserved and unique within the logical batch.
      expect(new Set(batch.docIndices).size).toBe(batch.docIndices.length);
    }
  });

  it('the derivation is deterministic: two derivations are deep-equal', () => {
    expect(deriveBatchPlan()).toEqual(derived);
  });
});

describe('2D2C-F0 freeze: classifier configuration against production exports', () => {
  it('requests the Sonnet member of the production allowlist, with no alias and no date suffix', () => {
    const sonnet = ORGUNIT_CLASSIFIER_ALLOWED_MODELS.filter((m) => m.includes('sonnet'));
    expect(sonnet).toHaveLength(1);
    expect(FREEZE.classifier.requestedModelId).toBe(sonnet[0]);
    expect(ORGUNIT_CLASSIFIER_ALLOWED_MODELS).toContain(FREEZE.classifier.requestedModelId);
    expect(FREEZE.classifier.requestedModelId).not.toMatch(/\d{8}$/);
    expect(FREEZE.classifier.requestedModelId).not.toMatch(/latest/);
  });

  it('pins the Agent SDK at 0.3.251 in both package.json and the lockfile', () => {
    const pkg = JSON.parse(raw('package.json').toString('utf8')) as {
      dependencies: Record<string, string>;
    };
    const lock = JSON.parse(raw('package-lock.json').toString('utf8')) as {
      packages: Record<string, { version: string }>;
    };
    const name = FREEZE.classifier.agentSdk.package;
    expect(name).toBe('@anthropic-ai/claude-agent-sdk');
    expect(FREEZE.classifier.agentSdk.version).toBe(EXPECTED.sdkVersion);
    expect(pkg.dependencies[name]).toBe(EXPECTED.sdkVersion);
    expect(lock.packages[`node_modules/${name}`]?.version).toBe(EXPECTED.sdkVersion);
  });

  it('freezes the assembly and output-schema versions the production code exports', () => {
    expect(FREEZE.classifier.assemblyVersion).toBe(ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION);
    expect(FREEZE.classifier.assemblyVersion).toBe('orgunit-classifier-assembly-v2');
    expect(FREEZE.classifier.outputSchemaVersion).toBe(ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION);
    expect(FREEZE.classifier.outputSchemaVersion).toBe('orgunit-classifier-output-schema-v2');
  });

  it('passes exactly maxTurns 3 and thinking disabled; effort and every sampling setting are absent', () => {
    expect(Object.keys(FREEZE.classifier.runConfig).sort()).toEqual(['maxTurns', 'thinking']);
    expect(FREEZE.classifier.runConfig['maxTurns']).toBe(3);
    expect(FREEZE.classifier.runConfig['maxTurns']).toBe(CLASSIFIER_DEFAULT_MAX_TURNS);
    expect(FREEZE.classifier.runConfig['thinking']).toBe('disabled');
    expect('effort' in FREEZE.classifier.runConfig).toBe(false);
    for (const absent of ['effort', 'fallbackModel', 'resume', 'forkSession', 'hooks', 'agents']) {
      expect(FREEZE.classifier.invocationSurfaceFrozenByReference.absent).toContain(absent);
    }
  });

  it('the production invocation builder, fed the frozen runConfig, emits no effort key and the hermetic surface', () => {
    const invocation = buildAgentSdkInvocation({
      request: {
        systemPrompt: ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
        serializedBatch: '{}',
        outputJsonSchema: {},
        modelId: FREEZE.classifier.requestedModelId,
        runConfig: { maxTurns: 3, thinking: 'disabled' },
      },
      childEnv: {},
      scratchCwd: '/nonexistent-scratch',
      claudeCodeExecutablePath: '/nonexistent-root/node_modules/synthetic-native/claude',
    });
    const options = invocation.options as unknown as Record<string, unknown>;
    // F0B: the SDK's documented executable option is set explicitly, to the given path.
    expect(invocation.options.pathToClaudeCodeExecutable).toBe(
      '/nonexistent-root/node_modules/synthetic-native/claude',
    );
    expect(
      FREEZE.classifier.invocationSurfaceFrozenByReference.pathToClaudeCodeExecutable,
    ).toContain('claudeCodeExecutable.ts');
    expect('effort' in options).toBe(false);
    for (const sampling of ['temperature', 'topP', 'topK', 'top_p', 'top_k', 'fallbackModel']) {
      expect(sampling in options).toBe(false);
    }
    expect(invocation.options.thinking).toEqual({ type: 'disabled' });
    expect(invocation.options.maxTurns).toBe(3);
    expect(invocation.options.model).toBe(FREEZE.classifier.requestedModelId);
    expect(invocation.options.settingSources).toEqual([]);
    expect(invocation.options.persistSession).toBe(false);
    expect(invocation.options.tools).toEqual([]);
    expect(invocation.options.allowedTools).toEqual([]);
    expect(invocation.options.mcpServers).toEqual({});
    expect(invocation.options.strictMcpConfig).toBe(true);
    expect(invocation.options.skills).toEqual([]);
    expect(invocation.options.plugins).toEqual([]);
  });

  it('the two variants are v1 then v2, at the CORRECTED runtime commits built from R2B and R3, with the pinned prompt identities', () => {
    const [v1, v2] = FREEZE.classifier.variants;
    expect(FREEZE.classifier.variants).toHaveLength(2);
    expect(v1!.name).toBe('PROMPT_V1_CANONICAL');
    expect(v1!.role).toBe('comparator');
    expect(v1!.order).toBe(1);
    expect(v1!.gitCommit).toBe(EXPECTED.correctedV1);
    expect(v1!.runtimeBaseCommit).toBe(EXPECTED.r2b);
    expect(v1!.promptVersion).toBe('orgunit-classifier-prompt-v1');
    expect(v1!.runtimePromptCharacters).toBe(9887);
    expect(v1!.runtimePromptUtf8Bytes).toBe(9963);
    expect(v1!.runtimePromptSha256).toBe(EXPECTED.v1PromptSha256);
    expect(v2!.name).toBe('PROMPT_V2_CANONICAL');
    expect(v2!.role).toBe('candidate');
    expect(v2!.order).toBe(2);
    expect(v2!.gitCommit).toBe(EXPECTED.correctedV2);
    expect(v2!.runtimeBaseCommit).toBe(EXPECTED.r3);
    // F0B: neither variant may sit at its uncorrected base commit.
    expect(v1!.gitCommit).not.toBe(EXPECTED.r2b);
    expect(v2!.gitCommit).not.toBe(EXPECTED.r3);
    expect(FREEZE.git.correctedRuntimeV1).toMatchObject({
      commit: EXPECTED.correctedV1,
      basedOn: EXPECTED.r2b,
    });
    expect(FREEZE.git.correctedRuntimeV2).toMatchObject({
      commit: EXPECTED.correctedV2,
      basedOn: EXPECTED.r3,
    });
    expect(FREEZE.git.requiredAncestry).toContain(
      'correctedRuntimeV1 descends from r2bHardLiveness',
    );
    expect(FREEZE.git.requiredAncestry).toContain('correctedRuntimeV2 descends from r3PromptV2');
    expect(v2!.promptVersion).toBe('orgunit-classifier-prompt-v2');
    expect(v2!.runtimePromptCharacters).toBe(11304);
    expect(v2!.runtimePromptUtf8Bytes).toBe(11382);
    expect(v2!.runtimePromptSha256).toBe(EXPECTED.v2PromptSha256);
    expect(v1!.order).toBeLessThan(v2!.order);
  });

  it('the frozen v2 identity is reconstructible from the current production prompt (v6) without Git', () => {
    // 2D2C-F1/V6I1: production is now v6 (v5 + R1/R2/R3); the freeze still
    // names v2 and v1, both reconstructed by reversing the exact reviewed
    // deltas in sequence: v6 -> v5 -> v4 -> v3 -> v2 -> v1.
    expect(ORGUNIT_CLASSIFIER_PROMPT_VERSION).toBe('orgunit-classifier-prompt-v6');
    const v4 = v4FromV5(v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT));
    const v3 = v3FromV4(v4);
    const v2 = v2FromV3(v3);
    expect(v2.length).toBe(11304);
    expect(Buffer.byteLength(v2, 'utf8')).toBe(11382);
    expect(sha256(v2)).toBe(EXPECTED.v2PromptSha256);
  });

  it('removing the five reviewed insertions from v2 reproduces the frozen v1 identity without Git', () => {
    let stripped = v2FromV3(v3FromV4(v4FromV5(v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT))));
    for (const paragraph of V2_PARAGRAPH_INSERTIONS) {
      const block = `\n\n${paragraph}`;
      expect(stripped.split(block)).toHaveLength(2);
      stripped = stripped.replace(block, '');
    }
    expect(stripped.split(V2_INLINE_INSERTION)).toHaveLength(2);
    stripped = stripped.replace(V2_INLINE_INSERTION, '');
    expect(stripped.length).toBe(9887);
    expect(Buffer.byteLength(stripped, 'utf8')).toBe(9963);
    expect(sha256(stripped)).toBe(EXPECTED.v1PromptSha256);
  });
});

describe('2D2C-F0 freeze: liveness, retry and watchdog values against production constants', () => {
  const { tier1, tier2 } = FREEZE.liveness;

  it('Tier 1 equals the frozen runner and provider constants', () => {
    expect(tier1.attemptSoftDeadlineMs).toBe(300_000);
    expect(tier1.attemptSoftDeadlineMs).toBe(CLASSIFIER_CALL_SOFT_DEADLINE_MS);
    expect(tier1.abortCloseSettlementGraceMs).toBe(10_000);
    expect(tier1.abortCloseSettlementGraceMs).toBe(CLASSIFIER_CALL_HARD_KILL_GRACE_MS);
    expect(tier1.totalProviderCallBudgetMs).toBe(600_000);
    expect(tier1.totalProviderCallBudgetMs).toBe(CLASSIFIER_CALL_TOTAL_BUDGET_MS);
    expect(tier1.timeoutNeverRetriedInsideAdapter).toBe(true);
    expect(tier1.worstCaseAttemptSequenceMs).toBe(
      CLASSIFIER_CALL_TOTAL_BUDGET_MS + CLASSIFIER_CALL_HARD_KILL_GRACE_MS,
    );
  });

  it('transient retries are 2 after the first attempt with 500 ms then 1000 ms backoff, consuming the budget', () => {
    expect(tier1.transientRetries.maxAfterFirstAttempt).toBe(2);
    expect(tier1.transientRetries.maxAfterFirstAttempt).toBe(MAX_TRANSIENT_RETRIES);
    expect(tier1.transientRetries.backoffMs).toEqual([500, 1000]);
    expect(tier1.transientRetries.backoffMs).toEqual(
      Array.from(
        { length: MAX_TRANSIENT_RETRIES },
        (_, k) => TRANSIENT_RETRY_BASE_DELAY_MS * 2 ** k,
      ),
    );
    expect(tier1.transientRetries.backoffConsumesTotalBudget).toBe(true);
  });

  it('Tier 2 is 700 s watchdog / 10 s grace, and the 700 s derivation sums from production constants', () => {
    expect(tier2.parentWatchdogMs).toBe(700_000);
    expect(tier2.gracefulTerminationWindowMs).toBe(10_000);
    expect(tier2.stderrTailMaxChars).toBe(HARNESS_STDERR_TAIL_MAX_CHARS);
    expect(tier2.stderrTailMaxChars).toBe(AGENT_SDK_STDERR_TAIL_MAX_CHARS);
    const d = tier2.watchdogDerivationMs;
    expect(d.authStatusRunnerTimeout).toBe(AUTH_STATUS_TIMEOUT_MS);
    expect(d.authStatusRunnerTimeout).toBe(60_000);
    expect(d.providerAttemptWindow).toBe(CLASSIFIER_CALL_TOTAL_BUDGET_MS);
    expect(d.finalInnerCloseGrace).toBe(CLASSIFIER_CALL_HARD_KILL_GRACE_MS);
    expect(d.childStartupArtifactFlushAndSchedulingVariance).toBe(30_000);
    expect(
      d.authStatusRunnerTimeout +
        d.providerAttemptWindow +
        d.finalInnerCloseGrace +
        d.childStartupArtifactFlushAndSchedulingVariance,
    ).toBe(d.total);
    expect(d.total).toBe(tier2.parentWatchdogMs);
    // The outer watchdog can never pre-empt a correctly firing Tier 1.
    expect(tier2.parentWatchdogMs).toBeGreaterThan(
      AUTH_STATUS_TIMEOUT_MS + tier1.worstCaseAttemptSequenceMs,
    );
  });

  it('records both halves of the 2D2C decision rule', () => {
    expect(FREEZE.liveness.decisionRule.tier1FiresFirst).toContain('attemptNo + 1');
    expect(FREEZE.liveness.decisionRule.tier2KillsBecauseTier1DidNotFire).toContain('2D2B-2b');
  });
});

describe('2D2C-F0 freeze: stop conditions and raw-output capture', () => {
  it('names every required stop condition and stops the whole experiment', () => {
    const ids = FREEZE.stopConditions.conditions.map((c) => c.id);
    for (const required of REQUIRED_STOP_CONDITIONS) expect(ids).toContain(required);
    expect(new Set(ids).size).toBe(ids.length);
    for (const condition of FREEZE.stopConditions.conditions) {
      expect(condition.meaning.length).toBeGreaterThan(20);
    }
    expect(FREEZE.stopConditions.policy).toContain('stop the ENTIRE experiment');
    expect(FREEZE.stopConditions.policy).toContain('never start prompt v2');
  });

  it('requires rawOutput to be persisted BEFORE layer-2 validation, write-once per attempt', () => {
    expect(FREEZE.outputCapture.rawOutputRule).toContain('BEFORE layer-2 validation');
    expect(FREEZE.outputCapture.rawOutputRule).toContain(
      'retained even when validation later rejects',
    );
    expect(FREEZE.outputCapture.writeOnce).toContain('never overwritten');
    for (const field of REQUIRED_CAPTURE_FIELDS) {
      expect(FREEZE.outputCapture.requiredPerLogicalBatch).toContain(field);
    }
    expect(new Set(FREEZE.outputCapture.requiredPerLogicalBatch).size).toBe(
      FREEZE.outputCapture.requiredPerLogicalBatch.length,
    );
  });

  it('never captures credentials, profile contents, transcripts, chain of thought or debug files', () => {
    const never = FREEZE.outputCapture.neverCaptured.join('\n');
    for (const banned of ['credentials', 'profile', 'transcript', 'chain of thought', 'debug']) {
      expect(never).toContain(banned);
    }
  });
});

describe('2D2C-F0 freeze: scoring gates against the frozen protocol', () => {
  it('reuses the acceptance protocol version and every ABSOLUTE_GATES value unchanged', () => {
    expect(FREEZE.scoring.protocol).toBe(ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_PROTOCOL_VERSION);
    expect(FREEZE.scoring.denominatorsUnchanged).toBe(true);
    const g = FREEZE.scoring.gates;
    expect(g['minSchemaValidSpanVerifiedRate']).toBe(ABSOLUTE_GATES.minSchemaValidRate);
    expect(g['minSchemaValidSpanVerifiedRate']).toBe(0.99);
    expect(g['minUnitPageRecall']).toBe(ABSOLUTE_GATES.minUnitPageRecall);
    expect(g['minUnitPageRecall']).toBe(0.95);
    expect(g['minUnitPagePrecision']).toBe(ABSOLUTE_GATES.minUnitPagePrecision);
    expect(g['minUnitPagePrecision']).toBe(0.9);
    expect(g['minUnitTypeAccuracy']).toBe(ABSOLUTE_GATES.minUnitTypeAccuracy);
    expect(g['minUnitTypeAccuracy']).toBe(0.85);
    expect(g['minHardNegativeRejection']).toBe(ABSOLUTE_GATES.minHardNegativeRejection);
    expect(g['minHardNegativeRejection']).toBe(0.9);
    expect(g['maxNeedsReviewRate']).toBe(ABSOLUTE_GATES.maxNeedsReviewRate);
    expect(g['maxNeedsReviewRate']).toBe(0.15);
    expect(g['maxIsolationViolations']).toBe(ABSOLUTE_GATES.maxIsolationViolations);
    expect(g['maxIsolationViolations']).toBe(0);
    expect(g['evidenceSpanVerification']).toBe(1);
    expect(g['nonNullUnitNameVerification']).toBe(1);
    expect(g['minGateableLanguageSubgroupSize']).toBe(MIN_SUBGROUP_SIZE_FOR_GATING);
    expect(g['minGateableLanguageSubgroupSize']).toBe(20);
    expect(g['maxCatastrophicSubgroupShortfall']).toBe(MAX_SUBGROUP_SHORTFALL);
    expect(g['maxCatastrophicSubgroupShortfall']).toBe(0.1);
  });

  it('forbids a final acceptance decision while paired coverage is incomplete and requires the paired comparison', () => {
    expect(FREEZE.scoring.acceptanceRule).toContain('paired DEV coverage is incomplete');
    expect(FREEZE.scoring.acceptanceRule).toContain('stop condition is unresolved');
    const comparison = FREEZE.scoring.requiredComparison.join('\n');
    for (const required of [
      'absolute metrics for v1 and v2',
      'transition matrix',
      'recovered invalid-output count',
      'page-versus-unit failures',
      'UNKNOWN/NO',
      'latency and token',
      'liveness outcomes',
      'no claim of improvement based only on aggregate accuracy',
    ]) {
      expect(comparison).toContain(required);
    }
  });
});

describe('2D2C-F0 freeze: the unresolved gold question and the HOLDOUT boundary', () => {
  it('keeps the unresolved DEVELOPMENT item at its committed label with a leave-one-out policy', () => {
    const q = FREEZE.unresolvedGold;
    expect(q.goldId).toBe(EXPECTED.unresolvedGoldId);
    expect(DEV_GOLD_IDS.has(q.goldId)).toBe(true);
    expect(q.committedLabel).toBe('UNIT_PAGE');
    expect(q.labelChangedByThisTask).toBe(false);
    expect(q.blockedStatus).toBe('BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION');
    const policy = q.policy.join('\n');
    expect(policy).toContain('include the item normally');
    expect(policy).toContain('leave-one-out');
    expect(policy).toContain('do not invent an alternative gold label');
    expect(policy).toContain('BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION');
    expect(policy).toContain('never silently select');
  });

  it('forbids HOLDOUT inference, inspection, batching and derived values during 2D2C', () => {
    expect(FREEZE.holdout.inferenceDuring2D2C).toBe('FORBIDDEN');
    const rules = FREEZE.holdout.rules.join('\n');
    for (const rule of [
      'no HOLDOUT inference during 2D2C',
      'no new HOLDOUT inspection, transformation or tuning',
      'no HOLDOUT batching or prevalence analysis',
      'no HOLDOUT-derived value',
      'one-shot',
    ]) {
      expect(rules).toContain(rule);
    }
  });

  it('carries the R3 incidental exposure forward and never claims zero historical exposure', () => {
    const disclosure = FREEZE.holdout.historicalExposureDisclosure;
    expect(disclosure).toContain('eight');
    expect(disclosure).toContain('does NOT have zero historical exposure');
    expect(disclosure).toContain('No HOLDOUT inference and no result-driven tuning');
  });

  it('names the next step as re-entering F2 readiness for an explicit owner decision, and still authorises nothing', () => {
    expect(FREEZE.nextStep).toContain('Re-enter 2D2C-F2');
    expect(FREEZE.nextStep).toContain('explicit owner decision');
    expect(FREEZE.nextStep).toContain('authorises nothing');
  });
});

// ===========================================================================
// PHASE 2B-2D2C-F0A — the frozen input identity contract.
// ===========================================================================

describe('2D2C-F0B freeze: revision marker and superseded hashes', () => {
  it('carries the F0B revision, names the superseded F0A raw hash, and keeps the F0 filename and version', () => {
    expect(FREEZE.freezeRevision).toBe(EXPECTED.freezeRevision);
    expect(FREEZE.supersedesFreezeRawSha256).toBe(EXPECTED.supersededFreezeRawSha256);
    expect(FREEZE.supersedesFreezeRawSha256).toMatch(/^[0-9a-f]{64}$/);
    // The F0B bytes are a different file from BOTH superseded freezes.
    expect(sha256(raw(FREEZE_PATH))).not.toBe(EXPECTED.supersededFreezeRawSha256);
    expect(sha256(raw(FREEZE_PATH))).not.toBe(EXPECTED.f0FreezeRawSha256);
    expect(FREEZE.version).toBe(EXPECTED.version);
    expect(FREEZE.freezeId).toBe('PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1');
    expect(FREEZE.status).toBe(EXPECTED.status);
  });

  it('records F0, F0A and F0B in the revision history, retaining the historical entries verbatim', () => {
    const [f0, f0a, f0b] = FREEZE.revisionHistory;
    expect(FREEZE.revisionHistory).toHaveLength(3);
    expect(f0!.revision).toBe('F0');
    expect(f0!.freezeRawSha256).toBe(EXPECTED.f0FreezeRawSha256);
    expect(f0b!.revision).toBe(EXPECTED.freezeRevision);
    expect((f0b as { supersedesFreezeRawSha256?: string }).supersedesFreezeRawSha256).toBe(
      EXPECTED.supersededFreezeRawSha256,
    );
    expect(f0b!.timing).toContain('before any 2D2C inference');
    expect(f0b!.timing).toContain('no attempt was consumed');
    const f0bUnchanged = (f0b!.unchanged ?? []).join('\n');
    for (const item of [
      'corpus',
      'prompt',
      'gold labels',
      'gates',
      'run order',
      'model id',
      '12 assembly identities',
      '24 final input identities',
      'output schema',
    ]) {
      expect(f0bUnchanged).toContain(item);
    }
    expect(f0b!.rule).toContain('never the superseded F0A hash');
    expect(f0b!.rule).toContain('uncorrected R2B/R3 commit');
    expect(f0a!.revision).toBe(EXPECTED.f0aRevision);
    expect(f0a!.timing).toContain('before any F1 runner implementation');
    expect(f0a!.timing).toContain('before any 2D2C inference');
    const unchanged = (f0a!.unchanged ?? []).join('\n');
    for (const item of ['corpus', 'prompt', 'gold labels', 'gates', 'run order', 'model id']) {
      expect(unchanged).toContain(item);
    }
    expect(f0a!.rule).toContain('never the superseded F0 hash');
  });

  it('F0B pins the SDK-bundled executable contract and the run-platform binary identity, and the USER requirement by name only', () => {
    const executable = FREEZE.classifier.claudeCodeExecutable;
    expect(executable.source).toBe('SDK_BUNDLED_NATIVE_BINARY');
    expect(executable.sdkPackage).toBe(FREEZE.classifier.agentSdk.package);
    expect(executable.sdkVersion).toBe(EXPECTED.sdkVersion);
    expect(executable.claudeCodeVersion).toBe(EXPECTED.claudeCodeVersion);
    expect(executable.nativePackagePrefix).toBe(`${executable.sdkPackage}-`);
    expect(executable.sameExecutableForAuthStatusAndInference).toBe(true);
    expect(executable.externalPathCliAcceptedAsPreflightOracle).toBe(false);
    expect(executable.runPlatform).toEqual({
      platform: 'darwin',
      arch: 'arm64',
      platformKey: EXPECTED.runPlatformKey,
      nativePackage: `${executable.nativePackagePrefix}${EXPECTED.runPlatformKey}`,
      nativePackageVersion: EXPECTED.sdkVersion,
      binaryFileName: 'claude',
      binaryBytes: EXPECTED.runBinaryBytes,
      binarySha256: EXPECTED.runBinarySha256,
    });
    // The installed SDK's own manifest agrees with the pinned run-platform identity.
    const manifest = JSON.parse(
      raw(`node_modules/${executable.sdkPackage}/manifest.json`).toString('utf8'),
    ) as { version: string; platforms: Record<string, { checksum: string; size: number }> };
    expect(manifest.version).toBe(EXPECTED.claudeCodeVersion);
    expect(manifest.platforms[EXPECTED.runPlatformKey]).toEqual({
      binary: 'claude',
      checksum: EXPECTED.runBinarySha256,
      size: EXPECTED.runBinaryBytes,
    });
    expect(
      (
        JSON.parse(raw(`node_modules/${executable.sdkPackage}/package.json`).toString('utf8')) as {
          claudeCodeVersion: string;
        }
      ).claudeCodeVersion,
    ).toBe(EXPECTED.claudeCodeVersion);
    const childEnvironment = FREEZE.classifier.childEnvironment;
    expect(childEnvironment).toMatchObject({
      posixOsPassthroughAddition: 'USER',
      valueRecorded: false,
      lognameIsSubstitute: false,
      windowsAllowlistChanged: false,
    });
    // No account name, token or credential value appears anywhere in the freeze bytes.
    expect(raw(FREEZE_PATH).toString('utf8')).not.toMatch(/"USER"\s*:\s*"/);
  });
});

describe('2D2C-F0A freeze: the input-construction contract', () => {
  const construction = FREEZE.inputConstruction;

  it('is labelled as reconstructed from the committed corpus and production constants, and claims no lost bytes', () => {
    expect(construction.evidenceClass).toBe(
      'RECONSTRUCTED_FROM_COMMITTED_DEVELOPMENT_CORPUS_AND_PRODUCTION_CONSTANTS',
    );
    expect(construction.claim).toContain('does not claim to reproduce');
    expect(construction.batchShape).toBe('{ context, documents }');
    expect(construction.documents.order).toContain('canonical corpus line order');
    expect(construction.documents.docIndex).toContain('original docIndex');
  });

  it('pins the exact production rule, fetch-policy and assembly versions, rootKey null, and ordinal root ordering', () => {
    expect(construction.context['ruleVersion']).toBe(EXPECTED.ruleVersion);
    expect(construction.context['ruleVersion']).toBe(ORGUNIT_SIGNAL_RULE_VERSION);
    expect(construction.context['fetchPolicyVersion']).toBe(EXPECTED.fetchPolicyVersion);
    expect(construction.context['fetchPolicyVersion']).toBe(FETCH_POLICY_VERSION);
    expect(construction.context['assemblyVersion']).toBe(EXPECTED.assemblyVersion);
    expect(construction.context['assemblyVersion']).toBe(ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION);
    expect(construction.context['rootKey']).toBeNull();
    expect(construction.context['roots']).toContain('deduplicated by exact rootKey');
    expect(construction.context['roots']).toContain('ordinal string comparison');
    for (const field of ['organisationName', 'echeRowKey', 'countryCode', 'runId']) {
      expect(construction.context[field]).toContain('exact common');
    }
  });

  it('states the stop-on-disagreement preconditions and the DEVELOPMENT-only roots scope', () => {
    const preconditions = construction.preconditions.join('\n');
    expect(preconditions).toContain('organisationName, echeRowKey, countryCode and runId');
    expect(preconditions).toContain('byte-identical authorityKind and url');
    expect(preconditions).toContain('no version is chosen');
    expect(preconditions).toContain('no database, mixed corpus or HOLDOUT file is read');
  });

  it('names the production serialization and final-identity algorithms, both prompt versions and the output-schema version', () => {
    expect(construction.serialization).toContain('canonicalStringify({ context, documents })');
    expect(construction.serialization).toContain('src/orgunits/classify/canonical.ts');
    expect(construction.finalInputSha256).toContain('computeFinalInputSha256');
    expect(construction.finalInputSha256).toContain(EXPECTED.outputSchemaVersion);
    expect(construction.finalInputSha256).toContain('src/orgunits/classify/finalIdentity.ts');
    expect(construction.promptVersionByVariant).toEqual({
      PROMPT_V1_CANONICAL: EXPECTED.v1PromptVersion,
      PROMPT_V2_CANONICAL: EXPECTED.v2PromptVersion,
    });
    expect(construction.runnerRule).toContain(
      'BEFORE any auth status check or provider invocation',
    );
    expect(construction.runnerRule).toContain('CORPUS_CONFIG_OR_HASH_DRIFT');
    const invariants = construction.invariants.join('\n');
    expect(invariants).toContain('exactly 12 assembly identities');
    expect(invariants).toContain('exactly 24 final identities');
    expect(invariants).toContain('[2, 8, 5, 10]');
    expect(invariants).toContain('never reused');
  });
});

describe('2D2C-F0A freeze: batch contexts reconstructed independently from the DEVELOPMENT corpus', () => {
  const inputs = reconstructBatchInputs();

  it('reconstructs exactly 12 batches whose organisation ordinals match the frozen plan', () => {
    expect(inputs).toHaveLength(12);
    expect(inputs.map((i) => i.organisationId)).toEqual(
      FREEZE.batching.plan.map((b) => b.organisationId),
    );
    expect(inputs.reduce((n, i) => n + i.documents.length, 0)).toBe(49);
  });

  it('every organisation agrees on organisationName, echeRowKey, countryCode and runId, and a disagreement throws', () => {
    for (const input of inputs) {
      const rows = DEV_ROWS.filter((r) => r.organisationId === input.organisationId);
      for (const key of ['organisationName', 'echeRowKey', 'countryCode', 'runId'] as const) {
        expect(new Set(rows.map((r) => r[key])).size).toBe(1);
      }
    }
    const [first, ...rest] = DEV_ROWS.filter((r) => r.organisationId === inputs[0]!.organisationId);
    const conflicting = [{ ...first!, runId: `${first!.runId}-x` }, ...rest];
    expect(() => reconstructBatchInputs(conflicting)).toThrow(/runId disagrees/);
  });

  it('every context carries the production versions, rootKey null, and the frozen version strings', () => {
    for (const { context } of inputs) {
      expect(context.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION);
      expect(context.ruleVersion).toBe(EXPECTED.ruleVersion);
      expect(context.fetchPolicyVersion).toBe(FETCH_POLICY_VERSION);
      expect(context.fetchPolicyVersion).toBe(EXPECTED.fetchPolicyVersion);
      expect(context.assemblyVersion).toBe(ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION);
      expect(context.assemblyVersion).toBe(EXPECTED.assemblyVersion);
      expect(context.rootKey).toBeNull();
      expect(context.countryCode).toBe('FR');
    }
  });

  it('roots are the deduplicated union of the batch documents’ roots, strictly ordered by rootKey', () => {
    for (const input of inputs) {
      const keys = input.context.roots.map((r) => r.rootKey);
      expect(new Set(keys).size).toBe(keys.length);
      expect([...keys].sort(ordinalCompare)).toEqual(keys);
      const referenced = new Set(input.documents.flatMap((d) => d.roots.map((r) => r.rootKey)));
      expect(new Set(keys)).toEqual(referenced);
      expect(keys.length).toBeGreaterThanOrEqual(1);
      for (const root of input.context.roots) expect(root.rootKey).toMatch(/^(claim|promotion):/);
    }
    // Two batches genuinely carry two roots; every other batch carries one.
    expect(inputs.filter((i) => i.context.roots.length === 2).map((i) => i.ordinal)).toEqual([
      9, 12,
    ]);
    expect(inputs.filter((i) => i.context.roots.length === 1)).toHaveLength(10);
  });

  it('a duplicate rootKey whose metadata disagrees stops construction rather than being resolved silently', () => {
    const target = inputs[8]!; // Paris Cité: two roots, four documents
    const rows = DEV_ROWS.filter((r) => r.organisationId === target.organisationId);
    const victimKey = rows[0]!.document.roots[0]!.rootKey;
    const another = rows.find((r) => r.document.roots.some((root) => root.rootKey === victimKey));
    expect(another).toBeDefined();
    const mutated = rows.map((r) =>
      r === another
        ? {
            ...r,
            document: {
              ...r.document,
              roots: r.document.roots.map((root) =>
                root.rootKey === victimKey ? { ...root, url: `${root.url}x` } : root,
              ),
            },
          }
        : r,
    );
    expect(() => reconstructBatchInputs(mutated)).toThrow(/disagreeing metadata/);
  });

  it('documents are the exact canonical corpus documents in line order with their original docIndex', () => {
    for (const [index, input] of inputs.entries()) {
      const batch = FREEZE.batching.plan[index]!;
      expect(input.documents.map((d) => d.docIndex)).toEqual(batch.docIndices);
      const rows = batch.corpusLineNumbers.map((line) => DEV_ROWS[line - 1]!);
      expect(input.documents).toEqual(rows.map((r) => r.document));
    }
    expect(inputs[8]!.documents.map((d) => d.docIndex)).toEqual([2, 8, 5, 10]);
  });

  it('the twelve frozen contexts equal the reconstructed contexts exactly', () => {
    for (const [index, input] of inputs.entries()) {
      const batch = FREEZE.batching.plan[index]!;
      expect(batch.context).toEqual(input.context);
      expect(batch.context.organisationName).toBe(batch.organisationName);
      expect(batch.context.echeRowKey).toBe(batch.echeRowKey);
    }
  });
});

describe('2D2C-F0A freeze: the 12 assembly identities and 24 final identities', () => {
  const inputs = reconstructBatchInputs();
  const identities = inputs.map((input) => identityOf(input));

  it('serialized UTF-8 byte lengths equal the freeze and the oracle for every batch', () => {
    for (const [index, identity] of identities.entries()) {
      expect(identity.serializedBatchUtf8Bytes).toBe(
        FREEZE.batching.plan[index]!.serializedBatchUtf8Bytes,
      );
      expect(identity.serializedBatchUtf8Bytes).toBe(
        EXPECTED_INPUT_IDENTITIES[index]!.serializedBatchUtf8Bytes,
      );
      expect(identity.serializedBatchUtf8Bytes).toBeGreaterThan(0);
    }
  });

  it('all twelve assembly hashes equal the freeze and the oracle, and canonicalSerializedInputSha256 equals assemblyInputSha256', () => {
    expect(EXPECTED_INPUT_IDENTITIES).toHaveLength(12);
    for (const [index, identity] of identities.entries()) {
      const batch = FREEZE.batching.plan[index]!;
      const oracle = EXPECTED_INPUT_IDENTITIES[index]!;
      expect(oracle.ordinal).toBe(batch.ordinal);
      expect(oracle.organisationId).toBe(batch.organisationId);
      expect(identity.assemblyInputSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(batch.assemblyInputSha256).toBe(identity.assemblyInputSha256);
      expect(oracle.assemblyInputSha256).toBe(identity.assemblyInputSha256);
      expect(batch.canonicalSerializedInputSha256).toBe(batch.assemblyInputSha256);
    }
  });

  it('the 24 final identities recompute through computeFinalInputSha256 and equal the freeze and the oracle', () => {
    for (const [index, identity] of identities.entries()) {
      const batch = FREEZE.batching.plan[index]!;
      const oracle = EXPECTED_INPUT_IDENTITIES[index]!;
      expect(Object.keys(batch.finalInputSha256).sort()).toEqual([
        'PROMPT_V1_CANONICAL',
        'PROMPT_V2_CANONICAL',
      ]);
      expect(batch.finalInputSha256['PROMPT_V1_CANONICAL']).toBe(identity.finalV1);
      expect(batch.finalInputSha256['PROMPT_V2_CANONICAL']).toBe(identity.finalV2);
      expect(oracle.finalV1).toBe(identity.finalV1);
      expect(oracle.finalV2).toBe(identity.finalV2);
      expect(identity.finalV1).toBe(
        computeFinalInputSha256({
          assemblyInputSha256: batch.assemblyInputSha256,
          promptVersion: FREEZE.classifier.variants[0]!.promptVersion,
          outputSchemaVersion: FREEZE.classifier.outputSchemaVersion,
        }),
      );
      expect(identity.finalV2).toBe(
        computeFinalInputSha256({
          assemblyInputSha256: batch.assemblyInputSha256,
          promptVersion: FREEZE.classifier.variants[1]!.promptVersion,
          outputSchemaVersion: FREEZE.classifier.outputSchemaVersion,
        }),
      );
    }
  });

  it('assembly identity is variant-independent, every v1/v2 pair differs, and all 12 + 24 identities are unique', () => {
    const assembly = FREEZE.batching.plan.map((b) => b.assemblyInputSha256);
    expect(assembly).toHaveLength(12);
    expect(new Set(assembly).size).toBe(12);
    const finals = FREEZE.batching.plan.flatMap((b) => [
      b.finalInputSha256['PROMPT_V1_CANONICAL']!,
      b.finalInputSha256['PROMPT_V2_CANONICAL']!,
    ]);
    expect(finals).toHaveLength(24);
    expect(new Set(finals).size).toBe(24);
    for (const batch of FREEZE.batching.plan) {
      expect(batch.finalInputSha256['PROMPT_V1_CANONICAL']).not.toBe(
        batch.finalInputSha256['PROMPT_V2_CANONICAL'],
      );
    }
    // No final identity collides with any assembly identity, and none is a historical hash.
    const historical = new Set(DEV_ROWS.map((r) => r.assemblyInputSha256));
    for (const value of [...assembly, ...finals]) {
      expect(historical.has(value)).toBe(false);
    }
    expect(new Set([...assembly, ...finals]).size).toBe(36);
  });

  it('never reuses a historical assemblyInputSha256 as a 2D2C identity', () => {
    for (const batch of FREEZE.batching.plan) {
      expect(batch.historicalAssemblyInputSha256).not.toContain(batch.assemblyInputSha256);
    }
  });

  it('recomputation is deterministic across repeated reconstructions', () => {
    const again = reconstructBatchInputs().map((input) => identityOf(input));
    expect(again).toEqual(identities);
    expect(identityMismatches(FREEZE.batching.plan, reconstructBatchInputs())).toEqual([]);
  });
});

describe('2D2C-F0A freeze: mutation coverage — each frozen identity check bites', () => {
  const pristine = FREEZE_RAW;
  const inputs = reconstructBatchInputs();

  it('changing one context version changes the serialization and every identity of that batch', () => {
    const clone = cloneFreeze();
    clone.batching.plan[0]!.context.ruleVersion = 'orgunit-signal-rules-v2';
    const mismatches = identityMismatches(clone.batching.plan, inputs);
    expect(mismatches).toEqual(['1:context']);
    // And a reconstruction carrying the mutated version hashes differently everywhere.
    const mutated = identityOf({
      context: { ...inputs[0]!.context, fetchPolicyVersion: 'orgunit-fetch-policy-v2' },
      documents: inputs[0]!.documents,
    });
    const original = identityOf(inputs[0]!);
    expect(mutated.assemblyInputSha256).not.toBe(original.assemblyInputSha256);
    expect(mutated.finalV1).not.toBe(original.finalV1);
    expect(mutated.finalV2).not.toBe(original.finalV2);
    expect(raw(FREEZE_PATH).toString('utf8')).toBe(pristine);
  });

  it('reordering the roots of a two-root batch changes the assembly identity', () => {
    const target = inputs[8]!;
    expect(target.context.roots).toHaveLength(2);
    const reordered = identityOf({
      context: { ...target.context, roots: [...target.context.roots].reverse() },
      documents: target.documents,
    });
    expect(reordered.assemblyInputSha256).not.toBe(identityOf(target).assemblyInputSha256);
    const clone = cloneFreeze();
    clone.batching.plan[8]!.context.roots.reverse();
    expect(identityMismatches(clone.batching.plan, inputs)).toEqual(['9:context']);
    expect(raw(FREEZE_PATH).toString('utf8')).toBe(pristine);
  });

  it('moving one document changes the assembly identity and both final identities', () => {
    const target = inputs[1]!;
    const documents = [...target.documents];
    [documents[0], documents[1]] = [documents[1]!, documents[0]!];
    const moved = identityOf({ context: target.context, documents });
    const original = identityOf(target);
    expect(moved.serializedBatchUtf8Bytes).toBe(original.serializedBatchUtf8Bytes);
    expect(moved.assemblyInputSha256).not.toBe(original.assemblyInputSha256);
    expect(moved.finalV1).not.toBe(original.finalV1);
    expect(moved.finalV2).not.toBe(original.finalV2);
    const shuffled = inputs.map((input, index) => (index === 1 ? { ...input, documents } : input));
    expect(identityMismatches(FREEZE.batching.plan, shuffled)).toEqual([
      '2:assemblyInputSha256',
      '2:finalInputSha256.v1',
      '2:finalInputSha256.v2',
    ]);
    expect(raw(FREEZE_PATH).toString('utf8')).toBe(pristine);
  });

  it('changing one prompt version changes that variant’s final identity and only that one', () => {
    const target = inputs[3]!;
    const original = identityOf(target);
    const changed = identityOf(target, {
      v1: 'orgunit-classifier-prompt-v3',
      v2: EXPECTED.v2PromptVersion,
    });
    expect(changed.assemblyInputSha256).toBe(original.assemblyInputSha256);
    expect(changed.finalV1).not.toBe(original.finalV1);
    expect(changed.finalV2).toBe(original.finalV2);
    expect(changed.finalV1).not.toBe(
      FREEZE.batching.plan[3]!.finalInputSha256['PROMPT_V1_CANONICAL'],
    );
    expect(raw(FREEZE_PATH).toString('utf8')).toBe(pristine);
  });

  it('changing one frozen input hash by a single character is detected', () => {
    const flip = (hex: string): string => `${hex.slice(0, -1)}${hex.endsWith('0') ? '1' : '0'}`;
    const assemblyClone = cloneFreeze();
    assemblyClone.batching.plan[5]!.assemblyInputSha256 = flip(
      assemblyClone.batching.plan[5]!.assemblyInputSha256,
    );
    expect(identityMismatches(assemblyClone.batching.plan, inputs)).toEqual([
      '6:assemblyInputSha256',
      '6:canonicalSerializedInputSha256',
    ]);
    const finalClone = cloneFreeze();
    finalClone.batching.plan[11]!.finalInputSha256['PROMPT_V2_CANONICAL'] = flip(
      finalClone.batching.plan[11]!.finalInputSha256['PROMPT_V2_CANONICAL']!,
    );
    expect(identityMismatches(finalClone.batching.plan, inputs)).toEqual([
      '12:finalInputSha256.v2',
    ]);
    const bytesClone = cloneFreeze();
    bytesClone.batching.plan[2]!.serializedBatchUtf8Bytes += 1;
    expect(identityMismatches(bytesClone.batching.plan, inputs)).toEqual([
      '3:serializedBatchUtf8Bytes',
    ]);
    expect(raw(FREEZE_PATH).toString('utf8')).toBe(pristine);
  });

  it('after every mutation the committed freeze and its parse are unchanged', () => {
    expect(raw(FREEZE_PATH).toString('utf8')).toBe(pristine);
    expect(JSON.parse(raw(FREEZE_PATH).toString('utf8'))).toEqual(FREEZE);
    expect(identityMismatches(FREEZE.batching.plan, reconstructBatchInputs())).toEqual([]);
  });
});

describe('2D2C-F0A freeze: output-capture identity rules', () => {
  it('requires the four F0A capture fields and states the identity rules', () => {
    for (const field of [
      'assemblyInputSha256',
      'finalInputSha256',
      'serializedBatchUtf8Bytes',
      'batchContext',
    ]) {
      expect(FREEZE.outputCapture.requiredPerLogicalBatch).toContain(field);
    }
    const rules = FREEZE.outputCapture.identityRules.join('\n');
    expect(rules).toContain(
      'canonicalSerializedInputSha256 and assemblyInputSha256 are the same value',
    );
    expect(rules).toContain('promptVersion and the outputSchemaVersion');
    expect(rules).toContain('BEFORE any provider invocation');
    expect(rules).toContain('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect(rules).toContain('before any auth status check');
  });
});

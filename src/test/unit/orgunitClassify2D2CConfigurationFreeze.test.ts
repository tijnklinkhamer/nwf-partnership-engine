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
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION,
  ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
} from '../../orgunits/classify/constants.js';
import { GoldCorpusItemSchema } from '../../orgunits/classify/evaluation/goldSchema.js';
import { hashRecords } from '../../orgunits/classify/evaluation/hashes.js';
import {
  ABSOLUTE_GATES,
  MAX_SUBGROUP_SHORTFALL,
  MIN_SUBGROUP_SIZE_FOR_GATING,
  ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION,
  ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_PROTOCOL_VERSION,
} from '../../orgunits/classify/evaluation/protocol.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../orgunits/classify/outputSchema.js';
import {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
} from '../../orgunits/classify/prompt.js';
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
} as const;

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
  readonly promptVersion: string;
  readonly runtimePromptCharacters: number;
  readonly runtimePromptUtf8Bytes: number;
  readonly runtimePromptSha256: string;
}
interface FreezeBatch {
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
interface Freeze {
  readonly freezeId: string;
  readonly version: string;
  readonly status: string;
  readonly git: {
    readonly baselineMain: string;
    readonly r1EvidenceCanonicalisation: { readonly commit: string };
    readonly r2bHardLiveness: { readonly commit: string };
    readonly r3PromptV2: { readonly commit: string };
    readonly freezeBranchBasedOn: string;
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
  readonly classifier: {
    readonly requestedModelId: string;
    readonly agentSdk: { readonly package: string; readonly version: string };
    readonly assemblyVersion: string;
    readonly outputSchemaVersion: string;
    readonly runConfig: Record<string, unknown>;
    readonly invocationSurfaceFrozenByReference: { readonly absent: readonly string[] };
    readonly variants: readonly FreezeVariant[];
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
function deriveBatchPlan(): FreezeBatch[] {
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
    expect(FREEZE.batching.plan).toEqual(derived);
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
    });
    const options = invocation.options as unknown as Record<string, unknown>;
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

  it('the two variants are v1 then v2, at the R2B and R3 commits, with the pinned prompt identities', () => {
    const [v1, v2] = FREEZE.classifier.variants;
    expect(FREEZE.classifier.variants).toHaveLength(2);
    expect(v1!.name).toBe('PROMPT_V1_CANONICAL');
    expect(v1!.role).toBe('comparator');
    expect(v1!.order).toBe(1);
    expect(v1!.gitCommit).toBe(EXPECTED.r2b);
    expect(v1!.promptVersion).toBe('orgunit-classifier-prompt-v1');
    expect(v1!.runtimePromptCharacters).toBe(9887);
    expect(v1!.runtimePromptUtf8Bytes).toBe(9963);
    expect(v1!.runtimePromptSha256).toBe(EXPECTED.v1PromptSha256);
    expect(v2!.name).toBe('PROMPT_V2_CANONICAL');
    expect(v2!.role).toBe('candidate');
    expect(v2!.order).toBe(2);
    expect(v2!.gitCommit).toBe(EXPECTED.r3);
    expect(v2!.promptVersion).toBe('orgunit-classifier-prompt-v2');
    expect(v2!.runtimePromptCharacters).toBe(11304);
    expect(v2!.runtimePromptUtf8Bytes).toBe(11382);
    expect(v2!.runtimePromptSha256).toBe(EXPECTED.v2PromptSha256);
    expect(v1!.order).toBeLessThan(v2!.order);
  });

  it('the current production prompt IS the frozen v2 identity', () => {
    expect(ORGUNIT_CLASSIFIER_PROMPT_VERSION).toBe('orgunit-classifier-prompt-v2');
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.length).toBe(11304);
    expect(Buffer.byteLength(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, 'utf8')).toBe(11382);
    expect(sha256(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)).toBe(EXPECTED.v2PromptSha256);
  });

  it('removing the five reviewed insertions from v2 reproduces the frozen v1 identity without Git', () => {
    let stripped = ORGUNIT_CLASSIFIER_SYSTEM_PROMPT;
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

  it('names the next step as implementing the runner without running it', () => {
    expect(FREEZE.nextStep).toContain('without running it');
    expect(FREEZE.nextStep).toContain('separate execution authorisation');
  });
});

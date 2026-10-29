/**
 * PHASE 2B-2D2C-R1 — the child's ONE bounded repair round (ADR 0011), in
 * process with injected fakes: the policy resolution and the root-capability
 * preflight, the per-document repair artifacts under `repair-1/doc-<k>/`,
 * the isolated single-document request with a bounded window, the
 * raw-before-validation invariant on the repair, the budget skip, the
 * disabled default that leaves the attempt directory exactly as F1 left it,
 * and the CHILD_RESULT summary. No process is forked; no provider exists.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import * as canonicalModule from '../../orgunits/classify/canonical.js';
import * as constantsModule from '../../orgunits/classify/constants.js';
import * as finalIdentityModule from '../../orgunits/classify/finalIdentity.js';
import * as outputSchemaModule from '../../orgunits/classify/outputSchema.js';
import * as allowedModelsModule from '../../orgunits/classify/provider/allowedModels.js';
import * as authStatusRunnerModule from '../../orgunits/classify/provider/authStatusRunner.js';
import * as claudeCodeExecutableModule from '../../orgunits/classify/provider/claudeCodeExecutable.js';
import * as environmentModule from '../../orgunits/classify/provider/environment.js';
import * as sdkOptionsModule from '../../orgunits/classify/provider/sdkOptions.js';
import type {
  ClassifierProviderRequest,
  ClassifierProviderResult,
} from '../../orgunits/classify/providerContract.js';
import * as repairModule from '../../orgunits/classify/repair.js';
import * as retryModule from '../../orgunits/classify/retry.js';
import * as validateModule from '../../orgunits/classify/validate.js';
import * as scoreModule from '../../orgunits/signals/score.js';
import {
  readArtifact,
  repairDocumentDirectoryOf,
  repairRoundDirectoryOf,
  type ArtifactKind,
} from '../harness/phase2b2d2c/artifacts.js';
import { reconstructAndVerifyFrozenBatches } from '../harness/phase2b2d2c/batches.js';
import {
  runChildEvaluation,
  type ChildDependencies,
  type ChildManifest,
  type ChildRepairRoundRecord,
} from '../harness/phase2b2d2c/childMain.js';
import { FREEZE_PATH, RUNNER_ARTIFACT_VERSION } from '../harness/phase2b2d2c/constants.js';
import { loadDevCorpus } from '../harness/phase2b2d2c/corpus.js';
import {
  loadFreezeFromBytes,
  sha256Hex,
  type FrozenRepairPolicy,
} from '../harness/phase2b2d2c/freeze.js';
import { buildExecutionPlan } from '../harness/phase2b2d2c/plan.js';
import type { LoadedVariantRuntime } from '../harness/phase2b2d2c/runtimeLoader.js';
import { promptTextOf, V1 } from './support/phase2b2d2cSyntheticRoot.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FREEZE_BYTES = readFileSync(join(ROOT, FREEZE_PATH));
const { freeze, rawSha256 } = loadFreezeFromBytes(FREEZE_BYTES);

/**
 * THE VARIANT ROOT'S OWN FETCH-POLICY VERSION, NOT THIS BUILD'S.
 *
 * `FETCH_POLICY_VERSION` is v2 since ADR 0012; the historical variant root this
 * synthetic runtime stands in for exported `orgunit-fetch-policy-v1`, and
 * `verifyRootForVariant` refuses any root whose constant differs from the
 * freeze. So the frozen value is read from the freeze here, exactly as the
 * prompt module above is reconstructed rather than taken from this worktree:
 * a variant root is defined by what IT exports, never by whatever this build
 * ships.
 */
const FROZEN_POLICY_MODULE = {
  FETCH_POLICY_VERSION: freeze.inputConstruction.context.fetchPolicyVersion,
};
const corpus = loadDevCorpus(freeze, { read: (relative) => readFileSync(join(ROOT, relative)) });
const batches = reconstructAndVerifyFrozenBatches(freeze, corpus.rows, {
  canonicalStringify,
  computeFinalInputSha256: finalIdentityModule.computeFinalInputSha256,
  ruleVersion: scoreModule.ORGUNIT_SIGNAL_RULE_VERSION,
  assemblyVersion: constantsModule.ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
  outputSchemaVersion: outputSchemaModule.ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
});
const plan = buildExecutionPlan(freeze, rawSha256, batches);
const V1_BATCH_1 = plan.evaluations[0]!;
const BATCH_1 = batches[0]!;
const VARIANT_ROOT = '/synthetic/variant-root-v1';

const ENABLED: FrozenRepairPolicy = {
  enabled: true,
  maxRoundsPerLogicalEvaluation: 1,
  minimumRemainingBudgetMs: 120_000,
};

const scratchDirs: string[] = [];
afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function attemptDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-r1-child-'));
  scratchDirs.push(dir);
  return dir;
}

function fakeRuntime(withRepair: boolean): LoadedVariantRuntime {
  const names = [
    'canonical',
    'finalIdentity',
    'prompt',
    'outputSchema',
    'validate',
    'constants',
    'retry',
    'score',
    'policy',
    'allowedModels',
    'sdkOptions',
    'authStatusRunner',
    'environment',
    'claudeCodeExecutable',
    ...(withRepair ? ['repair'] : []),
  ];
  return {
    root: VARIANT_ROOT,
    moduleUrls: Object.fromEntries(
      names.map((m) => [m, `file://${VARIANT_ROOT}/dist/${m}.js`]),
    ) as LoadedVariantRuntime['moduleUrls'],
    canonical: canonicalModule,
    finalIdentity: finalIdentityModule,
    prompt: {
      ORGUNIT_CLASSIFIER_PROMPT_VERSION: V1.promptVersion,
      ORGUNIT_CLASSIFIER_SYSTEM_PROMPT: promptTextOf(V1.name),
    },
    outputSchema: outputSchemaModule,
    validate: validateModule,
    constants: constantsModule,
    retry: retryModule,
    score: scoreModule,
    policy: FROZEN_POLICY_MODULE,
    allowedModels: allowedModelsModule,
    sdkOptions: sdkOptionsModule,
    authStatusRunner: authStatusRunnerModule,
    environment: environmentModule,
    claudeCodeExecutable: claudeCodeExecutableModule,
    ...(withRepair ? { repair: repairModule } : {}),
  };
}

function manifestFor(dir: string): ChildManifest {
  const evaluation = V1_BATCH_1;
  return {
    runnerRecordVersion: RUNNER_ARTIFACT_VERSION,
    freezePath: join(ROOT, FREEZE_PATH),
    freezeConfigRawSha256: rawSha256,
    freezeVersion: freeze.version,
    variantName: evaluation.variantName,
    variantLabel: evaluation.variantLabel,
    variantGitCommit: evaluation.variantGitCommit,
    variantRoot: VARIANT_ROOT,
    promptVersion: evaluation.promptVersion,
    promptSha256: evaluation.promptSha256,
    logicalBatchOrdinal: evaluation.logicalBatchOrdinal,
    organisationId: evaluation.organisationId,
    echeRowKey: evaluation.echeRowKey,
    orderedGoldIds: evaluation.orderedGoldIds,
    orderedDocIndices: evaluation.orderedDocIndices,
    batchContext: evaluation.batchContext,
    serializedBatchUtf8Bytes: evaluation.serializedBatchUtf8Bytes,
    assemblyInputSha256: evaluation.assemblyInputSha256,
    finalInputSha256: evaluation.finalInputSha256,
    requestedModelId: plan.requestedModelId,
    runConfig: { maxTurns: 3, thinking: 'disabled' },
    outputSchemaVersion: plan.outputSchemaVersion,
    attemptNo: 1,
    attemptDir: dir,
    classifierConfigDir: '/synthetic/profile',
  };
}

function ok(rawOutput: unknown): ClassifierProviderResult {
  return {
    outcome: 'OK',
    rawOutput,
    responseModelId: plan.requestedModelId,
    inputTokens: 100,
    outputTokens: 50,
    outcomeDetail: null,
    outcomeReasonCode: null,
  };
}

/** A NEEDS_REVIEW result citing the document's own URL: always accepted. */
function acceptedFor(docIndex: number): unknown {
  const document = BATCH_1.documents.find((d) => d.docIndex === docIndex)!;
  return {
    doc_index: docIndex,
    verdict: 'NEEDS_REVIEW',
    unit_name: null,
    unit_type: null,
    page_kind: null,
    serves_incoming_international_students: null,
    serves_outgoing_mobility_students: null,
    provides_language_learning_or_support: null,
    confidence: 'LOW',
    rationale: 'test',
    evidence_spans: [{ source: 'URL_PATH', quote: document.url.slice(8, 20) }],
  };
}

/** The same result with a quote absent from the document: rejected as EVIDENCE. */
function rejectedFor(docIndex: number): unknown {
  return {
    ...(acceptedFor(docIndex) as Record<string, unknown>),
    evidence_spans: [{ source: 'TITLE', quote: 'this text is in no supplied field' }],
  };
}

interface Harness {
  readonly manifestPath: string;
  readonly deps: ChildDependencies;
  readonly requests: ClassifierProviderRequest[];
}

function harness(
  dir: string,
  options: {
    readonly results: readonly (
      ClassifierProviderResult | ((request: ClassifierProviderRequest) => ClassifierProviderResult)
    )[];
    readonly policy?: FrozenRepairPolicy;
    readonly withRepair?: boolean;
    /** How many fake milliseconds each clock read advances. */
    readonly tickMs?: number;
  },
): Harness {
  const manifest = manifestFor(dir);
  const manifestPath = join(dir, 'manifest-envelope.json');
  writeFileSync(
    manifestPath,
    JSON.stringify({
      artifactKind: 'CHILD_MANIFEST',
      artifactVersion: RUNNER_ARTIFACT_VERSION,
      record: manifest,
      recordSha256: sha256Hex(canonicalStringify(manifest)),
    }),
  );
  const runtime = fakeRuntime(options.withRepair ?? true);
  const requests: ClassifierProviderRequest[] = [];
  const results = [...options.results];
  let runnerAttempts = 0;
  let mono = 1000;
  const tick = options.tickMs ?? 250;
  const deps: ChildDependencies = {
    env: {
      PATH: '/usr/bin',
      HOME: '/home/x',
      NWF_PE_CLASSIFIER_CONFIG_DIR: '/synthetic/profile',
      NWF_PE_TIER2_SCRATCH_DIR: dir,
    },
    readFile: (path) => {
      if (path === manifestPath) return readFileSync(manifestPath);
      if (path === manifest.freezePath) return FREEZE_BYTES;
      if (path.startsWith(`${VARIANT_ROOT}/`))
        return readFileSync(join(ROOT, path.slice(VARIANT_ROOT.length + 1)));
      throw new Error(`unexpected read ${path}`);
    },
    verifyRoot: async (variantName, root) => ({
      variantName,
      root,
      ok: true,
      checks: [{ id: 'PATH_ABSOLUTE_AND_REAL', ok: true, detail: 'fake' }],
      runtime,
      claudeCodeExecutable: null,
    }),
    providerFactory: {
      create: async () => ({
        provider: {
          classify: async (request) => {
            requests.push(request);
            runnerAttempts += 1;
            const next = results.shift();
            if (next === undefined) throw new Error('no scripted result left');
            return typeof next === 'function' ? next(request) : next;
          },
        },
        runnerAttempts: () => runnerAttempts,
        authStatusInvocations: () => requests.length,
      }),
    },
    clock: {
      nowUtc: () => new Date('2026-09-14T12:00:00Z'),
      monotonicMs: () => (mono += tick),
    },
    ...(options.policy !== undefined ? { repairPolicyFor: () => options.policy! } : {}),
  };
  return { manifestPath, deps, requests };
}

const record = <T>(dir: string, kind: ArtifactKind): T | null => {
  const read = readArtifact<T>(dir, kind);
  return read.ok ? read.envelope.record : null;
};

const CHILD_WRITTEN_FILES = 5; // preflight, raw checkpoint, validation, provider outcome, child result (no diagnostics here)

describe('2D2C-R1 child: the disabled default leaves an attempt exactly as F1 left it', () => {
  it('writes no repair directory, sends one request, and records repairRound: null', async () => {
    const dir = attemptDir();
    const h = harness(dir, {
      results: [ok({ results: [acceptedFor(3), rejectedFor(5), acceptedFor(8)] })],
    });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome).toEqual({ exitCode: 0, stopCondition: null, providerOutcome: 'OK' });
    expect(h.requests).toHaveLength(1);
    expect(existsSync(repairRoundDirectoryOf(dir))).toBe(false);
    expect(record<{ repairRound: unknown }>(dir, 'CHILD_RESULT')?.repairRound).toBeNull();
    expect(
      readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest-envelope.json'),
    ).toHaveLength(CHILD_WRITTEN_FILES);
  });

  it('an enabled policy against a root without the repair module is CORPUS_CONFIG_OR_HASH_DRIFT before any provider construction', async () => {
    const dir = attemptDir();
    const h = harness(dir, { results: [], policy: ENABLED, withRepair: false });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome.exitCode).toBe(2);
    expect(outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect(h.requests).toHaveLength(0);
    expect(record<{ detail: string }>(dir, 'CHILD_PREFLIGHT')?.detail).toContain('repair module');
  });
});

describe('2D2C-R1 child: the one repair round', () => {
  const docIndices = V1_BATCH_1.orderedDocIndices;
  const [d0, d1, d2] = [docIndices[0]!, docIndices[1]!, docIndices[2]!];

  it('repairs each EVIDENCE-rejected document ALONE, raw before validation, and records every artifact under repair-1/doc-<k>/', async () => {
    const dir = attemptDir();
    const h = harness(dir, {
      policy: ENABLED,
      results: [
        ok({ results: [acceptedFor(d0), rejectedFor(d1), rejectedFor(d2)] }),
        (request) => {
          const payload = JSON.parse(request.serializedBatch) as {
            documents: { docIndex: number }[];
            repair: { doc_index: number; reason_codes: string[] };
          };
          expect(payload.documents).toHaveLength(1);
          expect(payload.documents[0]!.docIndex).toBe(d1);
          expect(payload.repair.doc_index).toBe(d1);
          expect(payload.repair.reason_codes).toEqual(['EVIDENCE_SPAN_NOT_LITERAL']);
          return ok({ results: [acceptedFor(d1)] }); // accepted on repair
        },
        ok({ results: [rejectedFor(d2)] }), // rejected again
      ],
    });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome).toEqual({ exitCode: 0, stopCondition: null, providerOutcome: 'OK' });
    expect(h.requests).toHaveLength(3);

    // The repair requests: same prompt, same schema, bounded window, single document.
    for (const request of h.requests.slice(1)) {
      expect(request.systemPrompt).toBe(h.requests[0]!.systemPrompt);
      expect(request.outputJsonSchema).toBe(h.requests[0]!.outputJsonSchema);
      expect(request.totalBudgetMs).toBeGreaterThan(0);
      expect(request.totalBudgetMs).toBeLessThan(600_000);
      expect(request.serializedBatch).toContain('"repair":');
    }

    // The original attempt directory holds exactly the F1 files plus the repair-1 directory.
    const entries = readdirSync(dir).sort();
    expect(entries).toContain('repair-1');
    expect(
      entries.filter((e) => e.endsWith('.json') && e !== 'manifest-envelope.json'),
    ).toHaveLength(CHILD_WRITTEN_FILES);

    // Per-document artifacts.
    const doc1 = repairDocumentDirectoryOf(dir, d1);
    expect(readdirSync(doc1).sort()).toEqual([
      'repair-decision.json',
      'repair-outcome.json',
      'repair-provider-outcome.json',
      'repair-raw-output-checkpoint.json',
      'repair-request.json',
      'repair-validation-result.json',
    ]);
    const decision = record<{ decision: { kind: string }; reasonCodes: string[] }>(
      doc1,
      'REPAIR_DECISION',
    )!;
    expect(decision.decision.kind).toBe('PROCEED');
    expect(decision.reasonCodes).toEqual(['EVIDENCE_SPAN_NOT_LITERAL']);
    const request = record<{
      documentCount: number;
      repairOfFinalInputSha256: string;
      repairInputSha256: string;
      windowMs: number;
      notice: { instruction: string };
    }>(doc1, 'REPAIR_REQUEST')!;
    expect(request.documentCount).toBe(1);
    expect(request.repairOfFinalInputSha256).toBe(V1_BATCH_1.finalInputSha256);
    expect(request.repairInputSha256).not.toBe(V1_BATCH_1.finalInputSha256);
    expect(request.windowMs).toBe(h.requests[1]!.totalBudgetMs);
    expect(request.notice.instruction).toBe(repairModule.REPAIR_NOTICE_INSTRUCTION);
    const raw = record<{ rawOutputSha256: string }>(doc1, 'REPAIR_RAW_OUTPUT_CHECKPOINT')!;
    expect(raw.rawOutputSha256).toBe(sha256Hex(canonicalStringify({ results: [acceptedFor(d1)] })));
    const validation = record<{ kind: string; accepted: unknown[]; rejected: unknown[] }>(
      doc1,
      'REPAIR_VALIDATION_RESULT',
    )!;
    expect(validation.kind).toBe('VALIDATED');
    expect(validation.accepted).toHaveLength(1);
    const outcome1 = record<{
      disposition: string;
      errorKind: string | null;
      verdict: string | null;
      rawCheckpointPersistedBeforeValidation: boolean;
      rawBeforeValidationSequence: { persistedSeq: number; validationStartedSeq: number };
    }>(doc1, 'REPAIR_OUTCOME')!;
    expect(outcome1).toMatchObject({
      disposition: 'ACCEPTED',
      errorKind: null,
      verdict: 'NEEDS_REVIEW',
      rawCheckpointPersistedBeforeValidation: true,
    });
    expect(outcome1.rawBeforeValidationSequence.persistedSeq).toBeLessThan(
      outcome1.rawBeforeValidationSequence.validationStartedSeq,
    );

    const doc2 = repairDocumentDirectoryOf(dir, d2);
    expect(
      record<{ disposition: string; errorKind: string }>(doc2, 'REPAIR_OUTCOME'),
    ).toMatchObject({
      disposition: 'REJECTED',
      errorKind: 'EVIDENCE_SPAN_UNVERIFIED',
    });

    // The round summary, and the same summary inside CHILD_RESULT.
    const round = record<ChildRepairRoundRecord>(repairRoundDirectoryOf(dir), 'REPAIR_ROUND')!;
    expect(round).toMatchObject({
      round: 1,
      repairRequestVersion: repairModule.REPAIR_REQUEST_VERSION,
      policy: ENABLED,
      planned: 2,
      executed: 2,
      accepted: 1,
      rejected: 1,
      providerFailed: 0,
      skipped: 0,
      inputTokens: 200,
      outputTokens: 100,
    });
    expect(round.documents.map((d) => [d.docIndex, d.disposition])).toEqual([
      [d1, 'ACCEPTED'],
      [d2, 'REJECTED'],
    ]);
    const childResult = record<{
      repairRound: ChildRepairRoundRecord & { repairRoundSha256: string };
    }>(dir, 'CHILD_RESULT')!;
    expect(childResult.repairRound.accepted).toBe(1);
    expect(childResult.repairRound.repairRoundSha256).toMatch(/^[0-9a-f]{64}$/);

    // The ORIGINAL validation record is untouched by the repair.
    const original = record<{ rejected: { docIndex: number }[] }>(dir, 'VALIDATION_RESULT')!;
    expect(original.rejected.map((r) => r.docIndex)).toEqual([d1, d2]);
  });

  it('a repair TIMEOUT is recorded as PROVIDER_FAILED / TIMEOUT and the round continues; it is not a stop condition', async () => {
    const dir = attemptDir();
    const h = harness(dir, {
      policy: ENABLED,
      results: [
        ok({ results: [rejectedFor(d0), acceptedFor(d1), rejectedFor(d2)] }),
        {
          outcome: 'TIMEOUT',
          rawOutput: null,
          responseModelId: null,
          inputTokens: null,
          outputTokens: null,
          outcomeDetail: 'liveness deadline',
          outcomeReasonCode: null,
        },
        ok({ results: [acceptedFor(d2)] }),
      ],
    });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome).toEqual({ exitCode: 0, stopCondition: null, providerOutcome: 'OK' });
    const round = record<ChildRepairRoundRecord>(repairRoundDirectoryOf(dir), 'REPAIR_ROUND')!;
    expect(round.documents.map((d) => [d.docIndex, d.disposition, d.errorKind])).toEqual([
      [d0, 'PROVIDER_FAILED', 'TIMEOUT'],
      [d2, 'ACCEPTED', null],
    ]);
    const doc0 = repairDocumentDirectoryOf(dir, d0);
    expect(existsSync(join(doc0, 'repair-raw-output-checkpoint.json'))).toBe(false);
    expect(existsSync(join(doc0, 'repair-validation-result.json'))).toBe(false);
    expect(record<{ outcome: string }>(doc0, 'REPAIR_PROVIDER_OUTCOME')?.outcome).toBe('TIMEOUT');
  });

  it('a repair usage-limit outcome IS a stop condition, carried through the child result', async () => {
    const dir = attemptDir();
    const h = harness(dir, {
      policy: ENABLED,
      results: [
        ok({ results: [rejectedFor(d0), acceptedFor(d1), acceptedFor(d2)] }),
        {
          outcome: 'USAGE_LIMIT_EXHAUSTED',
          rawOutput: null,
          responseModelId: null,
          inputTokens: null,
          outputTokens: null,
          outcomeDetail: 'limit',
          outcomeReasonCode: null,
        },
      ],
    });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome.stopCondition).toBe('USAGE_LIMIT_INTERRUPTION');
    expect(record<{ childStopCondition: string }>(dir, 'CHILD_RESULT')?.childStopCondition).toBe(
      'USAGE_LIMIT_INTERRUPTION',
    );
  });

  it('too little remaining budget SKIPS the repair with a persisted decision and no request', async () => {
    const dir = attemptDir();
    // Every clock read advances 300 s: two reads separate the original call's
    // start from the repair decision, so the original has "consumed" the whole
    // 600 s budget by the time the decision is taken.
    const h = harness(dir, {
      policy: ENABLED,
      tickMs: 300_000,
      results: [ok({ results: [rejectedFor(d0), acceptedFor(d1), acceptedFor(d2)] })],
    });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome.exitCode).toBe(0);
    expect(h.requests).toHaveLength(1);
    const doc0 = repairDocumentDirectoryOf(dir, d0);
    expect(readdirSync(doc0).sort()).toEqual(['repair-decision.json', 'repair-outcome.json']);
    expect(
      record<{ decision: { kind: string; code: string } }>(doc0, 'REPAIR_DECISION')?.decision,
    ).toMatchObject({
      kind: 'SKIP',
      code: 'REPAIR_SKIPPED_INSUFFICIENT_BUDGET',
    });
    expect(
      record<{ disposition: string; providerRequestSent: boolean }>(doc0, 'REPAIR_OUTCOME'),
    ).toMatchObject({
      disposition: 'SKIPPED',
      providerRequestSent: false,
    });
    const round = record<ChildRepairRoundRecord>(repairRoundDirectoryOf(dir), 'REPAIR_ROUND')!;
    expect(round).toMatchObject({ planned: 1, executed: 0, skipped: 1 });
  });

  it('with the policy enabled but nothing rejected, the round summary is written and says why nothing was planned', async () => {
    const dir = attemptDir();
    const h = harness(dir, {
      policy: ENABLED,
      results: [ok({ results: [acceptedFor(d0), acceptedFor(d1), acceptedFor(d2)] })],
    });
    await runChildEvaluation(h.manifestPath, h.deps);
    expect(h.requests).toHaveLength(1);
    const round = record<ChildRepairRoundRecord>(repairRoundDirectoryOf(dir), 'REPAIR_ROUND')!;
    expect(round).toMatchObject({
      planned: 0,
      executed: 0,
      noCandidatesBecause: 'NOTHING_REJECTED',
    });
    expect(readdirSync(repairRoundDirectoryOf(dir))).toEqual(['repair-round.json']);
  });
});

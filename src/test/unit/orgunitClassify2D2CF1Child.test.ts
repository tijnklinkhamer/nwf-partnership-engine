/**
 * PHASE 2B-2D2C-F1 — the child, in-process, with injected fakes: the
 * environment self-check, the freeze/root/corpus/identity preflight, the
 * raw-output-before-validation invariant, accepted / schema-invalid /
 * evidence-invalid raw output, persistence failures, write-once collisions,
 * provider outcomes and thrown failures. No process is forked here; every
 * artifact is written by the real write-once writer into a temporary
 * attempt directory.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
import * as sdkOptionsModule from '../../orgunits/classify/provider/sdkOptions.js';
import type {
  ClassifierProviderRequest,
  ClassifierProviderResult,
} from '../../orgunits/classify/providerContract.js';
import * as retryModule from '../../orgunits/classify/retry.js';
import * as validateModule from '../../orgunits/classify/validate.js';
import * as scoreModule from '../../orgunits/signals/score.js';
import * as policyModule from '../../orgunits/web/policy.js';
import {
  ARTIFACT_FILE_NAMES,
  readArtifact,
  writeArtifactOnce,
} from '../harness/phase2b2d2c/artifacts.js';
import { reconstructAndVerifyFrozenBatches } from '../harness/phase2b2d2c/batches.js';
import {
  runChildEvaluation,
  type ChildDependencies,
  type ChildManifest,
} from '../harness/phase2b2d2c/childMain.js';
import { FREEZE_PATH, RUNNER_ARTIFACT_VERSION } from '../harness/phase2b2d2c/constants.js';
import { loadDevCorpus } from '../harness/phase2b2d2c/corpus.js';
import { loadFreezeFromBytes, sha256Hex } from '../harness/phase2b2d2c/freeze.js';
import { buildExecutionPlan, type PlannedEvaluation } from '../harness/phase2b2d2c/plan.js';
import {
  persistRawOutputThenValidate,
  RawOutputNotPersistedError,
} from '../harness/phase2b2d2c/rawOutputCheckpoint.js';
import type { LoadedVariantRuntime } from '../harness/phase2b2d2c/runtimeLoader.js';
import { promptTextOf, V1 } from './support/phase2b2d2cSyntheticRoot.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FREEZE_BYTES = readFileSync(join(ROOT, FREEZE_PATH));
const { freeze, rawSha256 } = loadFreezeFromBytes(FREEZE_BYTES);
const corpus = loadDevCorpus(freeze, { read: (relative) => readFileSync(join(ROOT, relative)) });
const batches = reconstructAndVerifyFrozenBatches(freeze, corpus.rows, {
  canonicalStringify,
  computeFinalInputSha256: finalIdentityModule.computeFinalInputSha256,
  ruleVersion: scoreModule.ORGUNIT_SIGNAL_RULE_VERSION,
  fetchPolicyVersion: policyModule.FETCH_POLICY_VERSION,
  assemblyVersion: constantsModule.ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
  outputSchemaVersion: outputSchemaModule.ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
});
const plan = buildExecutionPlan(freeze, rawSha256, batches);
const V1_BATCH_1 = plan.evaluations[0]!;
const VARIANT_ROOT = '/synthetic/variant-root-v1';

const scratchDirs: string[] = [];
afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function attemptDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f1-child-'));
  scratchDirs.push(dir);
  return dir;
}

/** A runtime assembled from this worktree's real modules, with the root's OWN prompt (v1 text for the v1 root). */
function fakeRuntime(overrides: Partial<LoadedVariantRuntime> = {}): LoadedVariantRuntime {
  return {
    root: VARIANT_ROOT,
    moduleUrls: Object.fromEntries(
      [
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
      ].map((m) => [m, `file://${VARIANT_ROOT}/dist/${m}.js`]),
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
    policy: policyModule,
    allowedModels: allowedModelsModule,
    sdkOptions: sdkOptionsModule,
    authStatusRunner: authStatusRunnerModule,
    ...overrides,
  };
}

function manifestFor(
  evaluation: PlannedEvaluation,
  dir: string,
  overrides: Partial<ChildManifest> = {},
): ChildManifest {
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
    ...overrides,
  };
}

interface Harness {
  readonly manifestPath: string;
  readonly deps: ChildDependencies;
  readonly requests: ClassifierProviderRequest[];
  readonly factoryCalls: () => number;
  readonly validatorCalls: () => number;
}

function harness(
  dir: string,
  options: {
    readonly manifest?: Partial<ChildManifest>;
    readonly env?: Record<string, string>;
    readonly result?: ClassifierProviderResult;
    readonly throwFromProvider?: Error;
    readonly diagnostics?: unknown;
    readonly freezeBytes?: Buffer;
    readonly corpusBytes?: Buffer;
    readonly rootOk?: boolean;
    readonly persistRawCheckpoint?: ChildDependencies['persistRawCheckpoint'];
    readonly runtime?: LoadedVariantRuntime;
  } = {},
): Harness {
  const manifest = manifestFor(V1_BATCH_1, dir, options.manifest);
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
  const requests: ClassifierProviderRequest[] = [];
  let factoryCalls = 0;
  let validatorCalls = 0;
  const baseRuntime = options.runtime ?? fakeRuntime();
  const runtime: LoadedVariantRuntime = {
    ...baseRuntime,
    validate: {
      ...baseRuntime.validate,
      validateClassifierResponse: (raw, batch) => {
        validatorCalls += 1;
        return baseRuntime.validate.validateClassifierResponse(raw, batch);
      },
    },
  };
  const deps: ChildDependencies = {
    env: options.env ?? {
      PATH: '/usr/bin',
      HOME: '/home/x',
      NWF_PE_CLASSIFIER_CONFIG_DIR: '/synthetic/profile',
      NWF_PE_TIER2_SCRATCH_DIR: dir,
    },
    readFile: (path) => {
      if (path === manifestPath) return readFileSync(manifestPath);
      if (path === manifest.freezePath) return options.freezeBytes ?? FREEZE_BYTES;
      if (path.startsWith(`${VARIANT_ROOT}/`)) {
        const relative = path.slice(VARIANT_ROOT.length + 1);
        if (relative === freeze.corpus.canonicalCorpusPath && options.corpusBytes !== undefined)
          return options.corpusBytes;
        return readFileSync(join(ROOT, relative));
      }
      throw new Error(`unexpected read ${path}`);
    },
    verifyRoot: async (variantName, root) => ({
      variantName,
      root,
      ok: options.rootOk ?? true,
      checks: [{ id: 'PATH_ABSOLUTE_AND_REAL', ok: options.rootOk ?? true, detail: 'fake' }],
      runtime: (options.rootOk ?? true) ? runtime : null,
    }),
    providerFactory: {
      create: async (input) => {
        factoryCalls += 1;
        return {
          provider: {
            classify: async (request) => {
              requests.push(request);
              if (options.diagnostics !== undefined)
                input.onAttemptDiagnostics(options.diagnostics as never);
              if (options.throwFromProvider) throw options.throwFromProvider;
              return options.result ?? okResult(acceptedRawOutput());
            },
          },
          runnerAttempts: () => 1,
          authStatusInvocations: () => 1,
        };
      },
    },
    clock: (() => {
      let mono = 1000;
      return { nowUtc: () => new Date('2026-09-13T12:00:00Z'), monotonicMs: () => (mono += 250) };
    })(),
    ...(options.persistRawCheckpoint !== undefined
      ? { persistRawCheckpoint: options.persistRawCheckpoint }
      : {}),
  };
  return {
    manifestPath,
    deps,
    requests,
    factoryCalls: () => factoryCalls,
    validatorCalls: () => validatorCalls,
  };
}

function okResult(
  rawOutput: unknown,
  responseModelId: string = plan.requestedModelId,
): ClassifierProviderResult {
  return {
    outcome: 'OK',
    rawOutput,
    responseModelId,
    inputTokens: 100,
    outputTokens: 50,
    outcomeDetail: null,
  };
}

/** A response every document of batch 1 accepts: NEEDS_REVIEW, one URL_PATH span quoting the document's own URL. */
function acceptedRawOutput(): unknown {
  return {
    results: batches[0]!.documents.map((document) => ({
      doc_index: document.docIndex,
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
    })),
  };
}

const record = <T>(dir: string, kind: keyof typeof ARTIFACT_FILE_NAMES): T | null => {
  const read = readArtifact<T>(dir, kind);
  return read.ok ? read.envelope.record : null;
};

describe('2D2C-F1 child: preflight stops before any provider construction', () => {
  it('an environment variable outside the allowlist is an ISOLATION_VIOLATION; the factory is never called', async () => {
    const dir = attemptDir();
    const h = harness(dir, {
      env: {
        PATH: '/usr/bin',
        NWF_PE_CLASSIFIER_CONFIG_DIR: '/p',
        DATABASE_URL_ADMIN: 'postgres://x',
      },
    });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome).toEqual({
      exitCode: 2,
      stopCondition: 'ISOLATION_VIOLATION',
      providerOutcome: null,
    });
    expect(
      record<{ stopCondition: string; detail: string }>(dir, 'CHILD_PREFLIGHT')?.detail,
    ).toContain('DATABASE_URL_ADMIN');
    expect(h.factoryCalls()).toBe(0);
  });

  it('a drifted freeze, a drifted corpus at the root, a failed root, or a manifest identity mismatch is CORPUS_CONFIG_OR_HASH_DRIFT', async () => {
    const cases: { readonly name: string; readonly options: Parameters<typeof harness>[1] }[] = [
      { name: 'freeze', options: { freezeBytes: Buffer.concat([FREEZE_BYTES, Buffer.from(' ')]) } },
      {
        name: 'corpus',
        options: {
          corpusBytes: Buffer.concat([
            readFileSync(join(ROOT, freeze.corpus.canonicalCorpusPath)),
            Buffer.from('\n'),
          ]),
        },
      },
      { name: 'root', options: { rootOk: false } },
      { name: 'assembly', options: { manifest: { assemblyInputSha256: '0'.repeat(64) } } },
      {
        name: 'final',
        options: { manifest: { finalInputSha256: plan.evaluations[12]!.finalInputSha256 } },
      },
      { name: 'docIndices', options: { manifest: { orderedDocIndices: [3, 8, 5] } } },
      {
        name: 'wrong prompt at the root',
        options: {
          runtime: fakeRuntime({
            prompt: {
              ORGUNIT_CLASSIFIER_PROMPT_VERSION: V1.promptVersion,
              ORGUNIT_CLASSIFIER_SYSTEM_PROMPT: 'not the frozen prompt',
            },
          }),
        },
      },
    ];
    for (const { name, options } of cases) {
      const dir = attemptDir();
      const h = harness(dir, options);
      const outcome = await runChildEvaluation(h.manifestPath, h.deps);
      expect(outcome.stopCondition, name).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
      expect(outcome.exitCode, name).toBe(2);
      expect(h.factoryCalls(), name).toBe(0);
      expect(existsSync(join(dir, ARTIFACT_FILE_NAMES.PROVIDER_OUTCOME)), name).toBe(false);
    }
  });
});

describe('2D2C-F1 child: raw output is persisted before validation, and validation runs through the root', () => {
  it('accepted raw output: checkpoint, validation, outcome and result are all written; the request carried the ROOT’s prompt', async () => {
    const dir = attemptDir();
    const h = harness(dir);
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome).toEqual({ exitCode: 0, stopCondition: null, providerOutcome: 'OK' });
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]!.systemPrompt).toBe(promptTextOf(V1.name));
    expect(sha256Hex(h.requests[0]!.systemPrompt)).toBe(V1.runtimePromptSha256);
    expect(h.requests[0]!.serializedBatch).toBe(batches[0]!.serialized);
    expect(h.requests[0]!.runConfig).toEqual({ maxTurns: 3, thinking: 'disabled' });
    expect('effort' in h.requests[0]!.runConfig).toBe(false);
    const raw = record<{ rawOutputSha256: string; rawOutputCanonicalSerialization: string }>(
      dir,
      'RAW_OUTPUT_CHECKPOINT',
    )!;
    expect(raw.rawOutputSha256).toBe(sha256Hex(canonicalStringify(acceptedRawOutput())));
    expect(raw.rawOutputCanonicalSerialization).toBe(canonicalStringify(acceptedRawOutput()));
    const validation = record<{ kind: string; accepted: unknown[]; rejected: unknown[] }>(
      dir,
      'VALIDATION_RESULT',
    )!;
    expect(validation.kind).toBe('VALIDATED');
    expect(validation.accepted).toHaveLength(3);
    expect(validation.rejected).toHaveLength(0);
    const result = record<{
      rawCheckpointPersistedBeforeValidation: boolean;
      rawBeforeValidationSequence: { persistedSeq: number; validationStartedSeq: number };
    }>(dir, 'CHILD_RESULT')!;
    expect(result.rawCheckpointPersistedBeforeValidation).toBe(true);
    expect(result.rawBeforeValidationSequence.persistedSeq).toBeLessThan(
      result.rawBeforeValidationSequence.validationStartedSeq,
    );
    expect(h.validatorCalls()).toBe(1);
    expect(
      record<{
        outcome: string;
        internalAdapterAttemptCountWhereObservable: number;
        monotonicWallTimeMs: number;
      }>(dir, 'PROVIDER_OUTCOME'),
    ).toMatchObject({
      outcome: 'OK',
      internalAdapterAttemptCountWhereObservable: 1,
      monotonicWallTimeMs: 250,
    });
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('schema-invalid and evidence-invalid raw output retain the SAME raw checkpoint as accepted output', async () => {
    const schemaDir = attemptDir();
    const schema = harness(schemaDir, { result: okResult({ results: [] }) });
    expect((await runChildEvaluation(schema.manifestPath, schema.deps)).providerOutcome).toBe('OK');
    expect(record<{ kind: string; detail: string }>(schemaDir, 'VALIDATION_RESULT')).toMatchObject({
      kind: 'SCHEMA_INVALID',
    });
    expect(
      record<{ rawOutputSha256: string }>(schemaDir, 'RAW_OUTPUT_CHECKPOINT')!.rawOutputSha256,
    ).toBe(sha256Hex(canonicalStringify({ results: [] })));

    const evidenceRaw = acceptedRawOutput() as {
      results: { evidence_spans: { source: string; quote: string }[] }[];
    };
    evidenceRaw.results[0]!.evidence_spans = [
      { source: 'TITLE', quote: 'not in this document at all' },
    ];
    const evidenceDir = attemptDir();
    const evidence = harness(evidenceDir, { result: okResult(evidenceRaw) });
    await runChildEvaluation(evidence.manifestPath, evidence.deps);
    const validation = record<{
      kind: string;
      accepted: unknown[];
      rejected: { category: string }[];
    }>(evidenceDir, 'VALIDATION_RESULT')!;
    expect(validation.kind).toBe('VALIDATED');
    expect(validation.accepted).toHaveLength(2);
    expect(validation.rejected.map((r) => r.category)).toEqual(['EVIDENCE']);
    expect(
      record<{ rawOutputSha256: string }>(evidenceDir, 'RAW_OUTPUT_CHECKPOINT')!.rawOutputSha256,
    ).toBe(sha256Hex(canonicalStringify(evidenceRaw)));
  });

  it('TEMPORAL PROOF: while the raw-checkpoint persistence is held unresolved, the validator has not run', async () => {
    const dir = attemptDir();
    let releasePersist!: () => void;
    const held = new Promise<void>((resolveHeld) => {
      releasePersist = resolveHeld;
    });
    let persistCalls = 0;
    const h = harness(dir, {
      persistRawCheckpoint: async (attempt, checkpoint) => {
        persistCalls += 1;
        await held;
        writeArtifactOnce(attempt, 'RAW_OUTPUT_CHECKPOINT', checkpoint);
      },
    });
    const running = runChildEvaluation(h.manifestPath, h.deps);
    // Let the child reach and block on the held persistence.
    for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
    expect(persistCalls).toBe(1);
    expect(h.validatorCalls()).toBe(0);
    expect(existsSync(join(dir, ARTIFACT_FILE_NAMES.VALIDATION_RESULT))).toBe(false);
    releasePersist();
    const outcome = await running;
    expect(outcome.providerOutcome).toBe('OK');
    expect(h.validatorCalls()).toBe(1);
    expect(existsSync(join(dir, ARTIFACT_FILE_NAMES.RAW_OUTPUT_CHECKPOINT))).toBe(true);
  });

  it('a raw write failure prevents validation: RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION, validator never called', async () => {
    const dir = attemptDir();
    const h = harness(dir, {
      persistRawCheckpoint: async () => {
        throw new Error('disk full');
      },
    });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome).toEqual({
      exitCode: 1,
      stopCondition: 'RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION',
      providerOutcome: null,
    });
    expect(h.validatorCalls()).toBe(0);
    expect(existsSync(join(dir, ARTIFACT_FILE_NAMES.VALIDATION_RESULT))).toBe(false);
    expect(record<{ stopCondition: string; message: string }>(dir, 'CHILD_FAILURE')).toMatchObject({
      stopCondition: 'RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION',
    });
  });

  it('a write-once collision on the raw checkpoint is a persistence failure, never an overwrite', async () => {
    const dir = attemptDir();
    writeArtifactOnce(dir, 'RAW_OUTPUT_CHECKPOINT', { earlier: true });
    const h = harness(dir);
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome.stopCondition).toBe('RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION');
    expect(record<{ earlier: boolean }>(dir, 'RAW_OUTPUT_CHECKPOINT')).toEqual({ earlier: true });
    expect(h.validatorCalls()).toBe(0);
  });

  it('the invariant is structural: persistRawOutputThenValidate refuses to validate when canonicalization or persistence fails', async () => {
    let validated = 0;
    await expect(
      persistRawOutputThenValidate({
        rawOutput: { a: undefined },
        canonicalStringify,
        persist: async () => {},
        validate: () => (validated += 1),
      }),
    ).rejects.toBeInstanceOf(RawOutputNotPersistedError);
    await expect(
      persistRawOutputThenValidate({
        rawOutput: { a: 1 },
        canonicalStringify,
        persist: async () => {
          throw new Error('no');
        },
        validate: () => (validated += 1),
      }),
    ).rejects.toMatchObject({ stage: 'PERSIST' });
    expect(validated).toBe(0);
    const ok = await persistRawOutputThenValidate({
      rawOutput: { b: 2, a: 1 },
      canonicalStringify,
      persist: async () => {},
      validate: () => 'validated',
    });
    expect(ok.checkpoint.rawOutputCanonicalSerialization).toBe('{"a":1,"b":2}');
    expect(ok.checkpoint.rawOutputSha256).toBe(sha256Hex('{"a":1,"b":2}'));
    expect(ok.sequence.persistedSeq).toBeLessThan(ok.sequence.validationStartedSeq);
    expect(ok.validation).toBe('validated');
  });
});

describe('2D2C-F1 child: provider outcomes and thrown failures', () => {
  it('an unexpected response model id is recorded honestly; the parent decides the stop', async () => {
    const dir = attemptDir();
    const h = harness(dir, { result: okResult(acceptedRawOutput(), 'some-other-model') });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome.providerOutcome).toBe('OK');
    expect(
      record<{ providerReportedModelId: string }>(dir, 'CHILD_RESULT')!.providerReportedModelId,
    ).toBe('some-other-model');
  });

  it('a usage-limit outcome writes no raw checkpoint and no validation, only the outcome and result', async () => {
    const dir = attemptDir();
    const h = harness(dir, {
      result: {
        outcome: 'USAGE_LIMIT_EXHAUSTED',
        rawOutput: null,
        responseModelId: null,
        inputTokens: null,
        outputTokens: null,
        outcomeDetail: 'limit',
      },
    });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome).toEqual({
      exitCode: 0,
      stopCondition: null,
      providerOutcome: 'USAGE_LIMIT_EXHAUSTED',
    });
    expect(existsSync(join(dir, ARTIFACT_FILE_NAMES.RAW_OUTPUT_CHECKPOINT))).toBe(false);
    expect(existsSync(join(dir, ARTIFACT_FILE_NAMES.VALIDATION_RESULT))).toBe(false);
    expect(h.validatorCalls()).toBe(0);
  });

  it('a Tier-1 TIMEOUT captures the diagnostics through the hook and never synthesizes output', async () => {
    const dir = attemptDir();
    const diagnostics = {
      progress: [
        { stage: 'QUERY_STARTED', elapsedMs: 0 },
        { stage: 'DEADLINE_EXPIRED', elapsedMs: 300000 },
      ],
      stderrTail: 'tail',
      pid: null,
    };
    const h = harness(dir, {
      diagnostics,
      result: {
        outcome: 'TIMEOUT',
        rawOutput: null,
        responseModelId: null,
        inputTokens: null,
        outputTokens: null,
        outcomeDetail: 'timed out',
      },
    });
    expect((await runChildEvaluation(h.manifestPath, h.deps)).providerOutcome).toBe('TIMEOUT');
    expect(record<{ attempts: unknown[] }>(dir, 'TIER1_DIAGNOSTICS')!.attempts).toEqual([
      diagnostics,
    ]);
    expect(existsSync(join(dir, ARTIFACT_FILE_NAMES.RAW_OUTPUT_CHECKPOINT))).toBe(false);
  });

  it('an AUTH_FAILURE whose detail names an environment leak is an ISOLATION_VIOLATION in the child result', async () => {
    const dir = attemptDir();
    const h = harness(dir, {
      result: {
        outcome: 'AUTH_FAILURE',
        rawOutput: null,
        responseModelId: null,
        inputTokens: null,
        outputTokens: null,
        outcomeDetail: 'pre-flight CONFLICTING_AUTH_VARIABLES: refused',
      },
    });
    expect((await runChildEvaluation(h.manifestPath, h.deps)).stopCondition).toBe(
      'ISOLATION_VIOLATION',
    );
    const plain = harness(attemptDir(), {
      result: {
        outcome: 'AUTH_FAILURE',
        rawOutput: null,
        responseModelId: null,
        inputTokens: null,
        outputTokens: null,
        outcomeDetail: 'pre-flight NOT_LOGGED_IN',
      },
    });
    expect((await runChildEvaluation(plain.manifestPath, plain.deps)).stopCondition).toBeNull();
  });

  it('a provider that throws leaves a bounded failure record and exit code 1, with no result record', async () => {
    const dir = attemptDir();
    const h = harness(dir, { throwFromProvider: new Error(`boom ${'x'.repeat(5000)}`) });
    expect(await runChildEvaluation(h.manifestPath, h.deps)).toEqual({
      exitCode: 1,
      stopCondition: null,
      providerOutcome: null,
    });
    const failure = record<{ thrown: boolean; message: string; stopCondition: null }>(
      dir,
      'CHILD_FAILURE',
    )!;
    expect(failure.thrown).toBe(true);
    expect(failure.message.length).toBeLessThanOrEqual(2000);
    expect(failure.message).not.toMatch(/\n\s+at /);
    expect(existsSync(join(dir, ARTIFACT_FILE_NAMES.CHILD_RESULT))).toBe(false);
  });

  it('a manifest envelope whose hash does not match is refused before anything is read', async () => {
    const dir = attemptDir();
    const h = harness(dir);
    const tampered = JSON.parse(readFileSync(h.manifestPath, 'utf8')) as {
      record: { attemptNo: number };
    };
    tampered.record.attemptNo = 2;
    writeFileSync(h.manifestPath, JSON.stringify(tampered));
    await expect(runChildEvaluation(h.manifestPath, h.deps)).rejects.toThrow(
      /fails its own recorded hash/,
    );
    expect(h.factoryCalls()).toBe(0);
    mkdirSync(join(dir, 'unused'));
  });
});

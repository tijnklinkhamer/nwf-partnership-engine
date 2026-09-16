/**
 * PHASE 2B-2D2C-F0D — the Tier-2 child under an ATTEMPT-2 (F0E) manifest.
 *
 * With a fake provider and a runtime assembled from this worktree's own
 * modules (the production V3 prompt, the real repair module), proves that
 * the child resolves the F0E family by the freeze bytes' hash, re-verifies
 * every identity against the F0E plan, applies the FREEZE's repair policy
 * (the 120 000 ms floor) to the one bounded repair round, and refuses: an
 * attempt-1 variant under F0E, a wrong attempt number, a manifest whose
 * hash names the other family, a V3 manifest against the F0B bytes, and a
 * root without the repair module. No provider is constructed on any
 * refused path. Nothing outside a scratch directory is written.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import * as policyModule from '../../orgunits/web/policy.js';
import {
  readArtifact,
  repairDocumentDirectoryOf,
  repairRoundDirectoryOf,
  type ArtifactKind,
} from '../harness/phase2b2d2c/artifacts.js';
import { reconstructFrozenBatches } from '../harness/phase2b2d2c/batches.js';
import {
  runChildEvaluation,
  type ChildDependencies,
  type ChildManifest,
} from '../harness/phase2b2d2c/childMain.js';
import { FREEZE_PATH, RUNNER_ARTIFACT_VERSION } from '../harness/phase2b2d2c/constants.js';
import { loadDevCorpus } from '../harness/phase2b2d2c/corpus.js';
import {
  PROPOSED_F0E_FREEZE_RAW_SHA256,
  buildF0EExecutionPlan,
  F0E_FREEZE_PATH,
  F0E_VARIANT,
  loadF0EFreezeFromBytes,
} from '../harness/phase2b2d2c/f0c/freezeF0E.js';
import { EXPECTED_F0B_FREEZE_RAW_SHA256 } from '../harness/phase2b2d2c/constants.js';
import { sha256Hex } from '../harness/phase2b2d2c/freeze.js';
import type { LoadedVariantRuntime } from '../harness/phase2b2d2c/runtimeLoader.js';
import { v3PromptText } from './support/phase2b2d2cSyntheticRoot.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const F0C_BYTES = readFileSync(join(ROOT, F0E_FREEZE_PATH));
const F0B_BYTES = readFileSync(join(ROOT, FREEZE_PATH));
const { freeze, rawSha256 } = loadF0EFreezeFromBytes(F0C_BYTES);
const corpus = loadDevCorpus(freeze, { read: (relative) => readFileSync(join(ROOT, relative)) });
const batches = reconstructFrozenBatches(corpus.rows, {
  canonicalStringify,
  computeFinalInputSha256: finalIdentityModule.computeFinalInputSha256,
  ruleVersion: scoreModule.ORGUNIT_SIGNAL_RULE_VERSION,
  fetchPolicyVersion: policyModule.FETCH_POLICY_VERSION,
  assemblyVersion: constantsModule.ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
  outputSchemaVersion: outputSchemaModule.ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
});
const plan = buildF0EExecutionPlan(freeze, rawSha256);
const V3_BATCH_1 = plan.evaluations[0]!;
const BATCH_1 = batches[0]!;
const VARIANT_ROOT = '/synthetic/variant-root-v3';

/**
 * The frozen V3 runtime prompt module, RECONSTRUCTED from this build's own
 * v6 production text (2B-2D2C-F2 integrated v6 onto the accepted F0Z
 * runtime). Each reversal fails closed unless its region occurs exactly
 * once, and `F0E_VARIANT.runtimePromptSha256` is asserted below, so a
 * drifted reconstruction cannot pass as V3.
 */
const V3_PROMPT_MODULE = {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION: F0E_VARIANT.promptVersion,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT: v3PromptText(),
} as const;

const scratchDirs: string[] = [];
afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function attemptDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f0d-child-'));
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
    // 2B-2D2C-F2: this worktree's production prompt is now v6, so the frozen
    // V3 runtime this F0E child is verified against is RECONSTRUCTED from it
    // by reversing the exact reviewed v6->v5->v4->v3 deltas. A variant root
    // is defined by what IT exports, never by whatever this build ships.
    prompt: V3_PROMPT_MODULE,
    outputSchema: outputSchemaModule,
    validate: validateModule,
    constants: constantsModule,
    retry: retryModule,
    score: scoreModule,
    policy: policyModule,
    allowedModels: allowedModelsModule,
    sdkOptions: sdkOptionsModule,
    authStatusRunner: authStatusRunnerModule,
    environment: environmentModule,
    claudeCodeExecutable: claudeCodeExecutableModule,
    ...(withRepair ? { repair: repairModule } : {}),
  };
}

function manifestFor(dir: string, overrides: Partial<ChildManifest> = {}): ChildManifest {
  const evaluation = V3_BATCH_1;
  return {
    runnerRecordVersion: RUNNER_ARTIFACT_VERSION,
    freezePath: join(ROOT, F0E_FREEZE_PATH),
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
    attemptNo: 2,
    attemptDir: dir,
    classifierConfigDir: '/synthetic/profile',
    ...overrides,
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
  readonly factoryCalls: () => number;
}

function harness(
  dir: string,
  options: {
    readonly results?: readonly (
      ClassifierProviderResult | ((request: ClassifierProviderRequest) => ClassifierProviderResult)
    )[];
    readonly manifest?: Partial<ChildManifest>;
    readonly withRepair?: boolean;
    readonly freezeBytes?: Buffer;
  } = {},
): Harness {
  const manifest = manifestFor(dir, options.manifest);
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
  const results = [...(options.results ?? [])];
  let runnerAttempts = 0;
  let factoryCalls = 0;
  let mono = 1000;
  const deps: ChildDependencies = {
    env: {
      PATH: '/usr/bin',
      HOME: '/home/x',
      NWF_PE_CLASSIFIER_CONFIG_DIR: '/synthetic/profile',
      NWF_PE_TIER2_SCRATCH_DIR: dir,
    },
    readFile: (path) => {
      if (path === manifestPath) return readFileSync(manifestPath);
      if (path === manifest.freezePath) return options.freezeBytes ?? F0C_BYTES;
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
      create: async () => {
        factoryCalls += 1;
        return {
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
        };
      },
    },
    clock: {
      nowUtc: () => new Date('2026-09-15T12:00:00Z'),
      monotonicMs: () => (mono += 250),
    },
    // No repairPolicyFor: the FREEZE decides, exactly as the production entry binds it.
  };
  return { manifestPath, deps, requests, factoryCalls: () => factoryCalls };
}

const record = <T>(dir: string, kind: ArtifactKind): T | null => {
  const read = readArtifact<T>(dir, kind);
  return read.ok ? read.envelope.record : null;
};

describe('2D2C-F0D child under an F0E manifest: the freeze policy governs the one repair round', () => {
  const [d0, d1, d2] = V3_BATCH_1.orderedDocIndices as [number, number, number];

  it('passes preflight against the F0E plan, sends the original, repairs the ONE rejected document alone under the FROZEN 120000 ms floor, and records repairRound', async () => {
    const dir = attemptDir();
    const h = harness(dir, {
      results: [
        ok({ results: [acceptedFor(d0), rejectedFor(d1), acceptedFor(d2)] }),
        (request) => {
          const payload = JSON.parse(request.serializedBatch) as {
            documents: { docIndex: number }[];
          };
          expect(payload.documents.map((d) => d.docIndex)).toEqual([d1]);
          expect(request.totalBudgetMs).toBeDefined();
          return ok({ results: [acceptedFor(d1)] });
        },
      ],
    });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome).toEqual({ exitCode: 0, stopCondition: null, providerOutcome: 'OK' });
    expect(h.factoryCalls()).toBe(1);
    expect(h.requests).toHaveLength(2);
    expect(h.requests[0]?.systemPrompt).toBe(V3_PROMPT_MODULE.ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
    expect(sha256Hex(h.requests[0]!.systemPrompt)).toBe(F0E_VARIANT.runtimePromptSha256);
    const preflight = record<{ ok: boolean; detail: string }>(dir, 'CHILD_PREFLIGHT');
    expect(preflight?.ok).toBe(true);
    const decision = record<{
      policy: { minimumRemainingBudgetMs: number; enabled: boolean };
      decision: { kind: string };
    }>(repairDocumentDirectoryOf(dir, d1), 'REPAIR_DECISION');
    expect(decision?.policy).toEqual(freeze.repairPolicy);
    expect(decision?.policy.minimumRemainingBudgetMs).toBe(120_000);
    expect(decision?.decision.kind).toBe('PROCEED');
    const round = record<{ policy: unknown; planned: number; executed: number; accepted: number }>(
      repairRoundDirectoryOf(dir),
      'REPAIR_ROUND',
    );
    expect(round?.policy).toEqual(freeze.repairPolicy);
    expect(round).toMatchObject({ planned: 1, executed: 1, accepted: 1 });
    const childResult = record<{
      attemptNo: number;
      variantName: string;
      repairRound: { accepted: number } | null;
    }>(dir, 'CHILD_RESULT');
    expect(childResult?.attemptNo).toBe(2);
    expect(childResult?.variantName).toBe('PROMPT_V3_CANONICAL');
    expect(childResult?.repairRound?.accepted).toBe(1);
  });

  it('an F0E manifest naming an attempt-1 variant is CORPUS_CONFIG_OR_HASH_DRIFT before any provider construction', async () => {
    const dir = attemptDir();
    const h = harness(dir, {
      manifest: {
        variantName: 'PROMPT_V1_CANONICAL',
        variantLabel: 'PROMPT_V1_COMPARATOR',
        variantGitCommit: '0d2928a474796b89fad0644e99b5b934ecad10d0',
        promptVersion: 'orgunit-classifier-prompt-v1',
      },
    });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome.exitCode).toBe(2);
    expect(outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect(h.factoryCalls()).toBe(0);
    expect(record<{ detail: string }>(dir, 'CHILD_PREFLIGHT')?.detail).toContain(
      'PROMPT_V1_CANONICAL is not a variant this freeze (F0E_ATTEMPT_2) schedules',
    );
  });

  it('an F0E manifest requesting attempt 1 (or 3) is refused: the F0C freeze configures attempt 2', async () => {
    for (const attemptNo of [1, 3]) {
      const dir = attemptDir();
      const h = harness(dir, { manifest: { attemptNo } });
      const outcome = await runChildEvaluation(h.manifestPath, h.deps);
      expect(outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
      expect(h.factoryCalls()).toBe(0);
      expect(record<{ detail: string }>(dir, 'CHILD_PREFLIGHT')?.detail).toContain(
        `configures attempt 2; the manifest requests attempt ${attemptNo}`,
      );
    }
  });

  it('a manifest whose hash names the other family is refused with the family’s own message, in both directions', async () => {
    const f0cBytesF0bHash = attemptDir();
    let h = harness(f0cBytesF0bHash, {
      manifest: { freezeConfigRawSha256: EXPECTED_F0B_FREEZE_RAW_SHA256 },
    });
    expect((await runChildEvaluation(h.manifestPath, h.deps)).stopCondition).toBe(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
    );
    expect(record<{ detail: string }>(f0cBytesF0bHash, 'CHILD_PREFLIGHT')?.detail).toBe(
      'the manifest freeze hash is not the proposed F0E hash.',
    );
    const f0bBytesF0cHash = attemptDir();
    h = harness(f0bBytesF0cHash, { freezeBytes: F0B_BYTES });
    expect((await runChildEvaluation(h.manifestPath, h.deps)).stopCondition).toBe(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
    );
    expect(record<{ detail: string }>(f0bBytesF0cHash, 'CHILD_PREFLIGHT')?.detail).toBe(
      'the manifest freeze hash is not the F0B hash.',
    );
    expect(h.factoryCalls()).toBe(0);
  });

  it('a V3 manifest against the F0B bytes AND hash is refused: F0B schedules no V3', async () => {
    const dir = attemptDir();
    const h = harness(dir, {
      freezeBytes: F0B_BYTES,
      manifest: {
        freezeConfigRawSha256: EXPECTED_F0B_FREEZE_RAW_SHA256,
        freezeVersion: 'phase2b-2d2c-dev-configuration-freeze-v1',
        attemptNo: 1,
      },
    });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect(record<{ detail: string }>(dir, 'CHILD_PREFLIGHT')?.detail).toContain(
      'PROMPT_V3_CANONICAL is not a variant this freeze (F0B_ATTEMPT_1) schedules',
    );
    expect(h.factoryCalls()).toBe(0);
  });

  it('a root without the built repair module is refused under the F0E policy, before any provider construction', async () => {
    const dir = attemptDir();
    const h = harness(dir, { withRepair: false });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect(h.factoryCalls()).toBe(0);
    expect(record<{ detail: string }>(dir, 'CHILD_PREFLIGHT')?.detail).toContain(
      'the repair policy is enabled but the variant root ships no built repair module',
    );
    expect(existsSync(repairRoundDirectoryOf(dir))).toBe(false);
  });

  it('a manifest whose final identity is an attempt-1 comparator identity is refused: the root recomputes V3', async () => {
    const dir = attemptDir();
    const comparator =
      freeze.batching.plan[0]!.attempt1ComparatorFinalInputSha256.PROMPT_V2_CANONICAL;
    const h = harness(dir, { manifest: { finalInputSha256: comparator } });
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect(record<{ detail: string }>(dir, 'CHILD_PREFLIGHT')?.detail).toContain(
      'finalInputSha256',
    );
    expect(h.factoryCalls()).toBe(0);
    expect(PROPOSED_F0E_FREEZE_RAW_SHA256).toBe(rawSha256);
  });
});

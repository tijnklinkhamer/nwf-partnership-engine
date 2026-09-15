/**
 * PHASE 2B-2D2C-F0K — THE PRE-INFERENCE DISPATCH DEFECT, AND ITS REPAIR.
 *
 * On 2026-09-15 the first attempt-3 execution authorisation was physically
 * consumed and then the run was REFUSED BEFORE ANY INFERENCE: the parent
 * coordinator builds every child manifest through `ChildManifestSchema`, and
 * that closed variant set had been widened for attempt 2 (V3) but not for
 * attempt 3 (V4). The approved `PROMPT_V4_CANONICAL` / `PROMPT_V4_CANDIDATE`
 * pair was rejected at `ChildManifestSchema.parse`, AFTER `planned-input.json`
 * was written and BEFORE `child-manifest.json` was — which is exactly the
 * shape the preserved evidence root has. Zero logical evaluations, zero
 * provider requests, zero adapter attempts, zero classifier responses, zero
 * repairs.
 *
 * This file proves, entirely without a request:
 *
 *   1. the exact child-manifest contract: the four admitted variant names and
 *      labels, and that the set is still CLOSED;
 *   2. the coordinator -> child boundary over the REAL approved F0I plan: all
 *      twelve V4 manifests are now built and launched, and the pre-repair
 *      failure MODE is reproduced (a plan naming an unadmitted variant halts
 *      with planned-input.json written and child-manifest.json absent);
 *   3. the child under a real F0I manifest: family resolution, variant
 *      lookup, corpus reconstruction and the V4 FINAL IDENTITY all verify,
 *      and every prior-variant / wrong-attempt manifest is refused before any
 *      provider is constructed;
 *   4. the same thing at PROCESS level through the real Tier-2 child entry,
 *      which stops at its own preflight against a non-frozen root — before
 *      any provider import, so no authentication or network path is reachable;
 *   5. the replacement-authorisation state machine: the spent attempt-3 bytes
 *      are refused by exact SHA-256 in EVERY output root, and a replacement
 *      is permitted only where the preserved evidence PROVES a pre-inference
 *      refusal;
 *   6. the sibling stale set: the shared scorer planned-input schema now
 *      admits the V4 evaluations an attempt-3 run would persist.
 *
 * No provider, no network, no database, no clock outside the injected ones.
 * Everything is written under scratch directories.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import * as canonicalModule from '../../orgunits/classify/canonical.js';
import * as constantsModule from '../../orgunits/classify/constants.js';
import * as finalIdentityModule from '../../orgunits/classify/finalIdentity.js';
import * as outputSchemaModule from '../../orgunits/classify/outputSchema.js';
import * as promptModule from '../../orgunits/classify/prompt.js';
import * as allowedModelsModule from '../../orgunits/classify/provider/allowedModels.js';
import * as authStatusRunnerModule from '../../orgunits/classify/provider/authStatusRunner.js';
import * as claudeCodeExecutableModule from '../../orgunits/classify/provider/claudeCodeExecutable.js';
import * as environmentModule from '../../orgunits/classify/provider/environment.js';
import * as sdkOptionsModule from '../../orgunits/classify/provider/sdkOptions.js';
import * as repairModule from '../../orgunits/classify/repair.js';
import * as retryModule from '../../orgunits/classify/retry.js';
import * as validateModule from '../../orgunits/classify/validate.js';
import * as scoreModule from '../../orgunits/signals/score.js';
import * as policyModule from '../../orgunits/web/policy.js';
import {
  attemptDirectoryOf,
  readArtifact,
  writeArtifactOnce,
  type ArtifactKind,
} from '../harness/phase2b2d2c/artifacts.js';
import {
  ChildManifestSchema,
  runChildEvaluation,
  type ChildDependencies,
  type ChildManifest,
} from '../harness/phase2b2d2c/childMain.js';
import {
  EXPECTED_F0B_FREEZE_RAW_SHA256,
  FREEZE_PATH,
  RUNNER_ARTIFACT_VERSION,
} from '../harness/phase2b2d2c/constants.js';
import {
  authorisationMarkerPathOf,
  runExperiment,
  type ChildLaunchInput,
  type ChildLauncher,
  type ExperimentInput,
} from '../harness/phase2b2d2c/coordinator.js';
import {
  PROPOSED_F0E_FREEZE_RAW_SHA256,
  F0E_FREEZE_PATH,
} from '../harness/phase2b2d2c/f0c/freezeF0E.js';
import {
  ATTEMPT3_AUTHORISATION_STATEMENT,
  ATTEMPT3_AUTHORISATION_VERSION,
  ATTEMPT3_FROZEN_ORDINALS,
  ATTEMPT3_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT3_MAX_PROVIDER_REQUESTS,
  ATTEMPT3_REPLACEMENT_STATEMENT,
  evaluateAttempt3ExecutionLock,
  type Attempt3ExecutionAuthorisation,
  type Attempt3ExecutionLockInput,
} from '../harness/phase2b2d2c/f0i/authorisationF0I.js';
import { CHILD_ENTRY_PATH } from '../harness/phase2b2d2c/f0i/cliF0I.js';
import {
  buildF0IExecutionPlan,
  F0I_APPROVAL_RECORD_RAW_SHA256,
  F0I_FREEZE_PATH,
  F0I_RATIFICATION_RECORD_RAW_SHA256,
  F0I_VARIANT,
  loadF0IFreezeFromBytes,
  PROPOSED_F0I_FREEZE_RAW_SHA256,
  PROPOSED_F0I_PLAN_SHA256,
  SPENT_ATTEMPT_3_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_3_CONSUMPTION_RECORD_SHA256,
} from '../harness/phase2b2d2c/f0i/freezeF0I.js';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../orgunits/classify/repair.js';
import {
  classifyPriorAttempt3Root,
  type PriorAttempt3Probes,
} from '../harness/phase2b2d2c/f0i/priorAttempt3Evidence.js';
import { sha256Hex } from '../harness/phase2b2d2c/freeze.js';
import { runProcessIsolatedBatch } from '../harness/processIsolatedBatch.js';
import { PlannedInputSchema } from '../harness/phase2b2d2c/scoring/sources.js';
import type { LoadedVariantRuntime } from '../harness/phase2b2d2c/runtimeLoader.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const F0I_BYTES = readFileSync(join(ROOT, F0I_FREEZE_PATH));
const F0E_BYTES = readFileSync(join(ROOT, F0E_FREEZE_PATH));
const F0B_BYTES = readFileSync(join(ROOT, FREEZE_PATH));
const { freeze, rawSha256 } = loadF0IFreezeFromBytes(F0I_BYTES);
const PLAN = buildF0IExecutionPlan(freeze, rawSha256);
const MODEL = PLAN.requestedModelId;
const V4_BATCH_1 = PLAN.evaluations[0]!;
const IS_WINDOWS = process.platform === 'win32';

const SCRATCH = mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f0k-'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));
let counter = 0;
function scratchDir(prefix: string): string {
  counter += 1;
  const dir = join(SCRATCH, `${prefix}-${counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const record = <T>(dir: string, kind: ArtifactKind): T | null => {
  const read = readArtifact<T>(dir, kind);
  return read.ok ? read.envelope.record : null;
};

// ---------------------------------------------------------------------------
// 1. The exact child-manifest contract.
// ---------------------------------------------------------------------------

describe('2D2C-F0K: the child-manifest variant contract', () => {
  it('admits exactly the four attempt-1/2/3 variant names and labels, in order', () => {
    expect(ChildManifestSchema.shape.variantName.options).toEqual([
      'PROMPT_V1_CANONICAL',
      'PROMPT_V2_CANONICAL',
      'PROMPT_V3_CANONICAL',
      'PROMPT_V4_CANONICAL',
    ]);
    expect(ChildManifestSchema.shape.variantLabel.options).toEqual([
      'PROMPT_V1_COMPARATOR',
      'PROMPT_V2_CANDIDATE',
      'PROMPT_V3_CANDIDATE',
      'PROMPT_V4_CANDIDATE',
    ]);
  });

  it('the approved attempt-3 pair is the pair the freeze and the plan actually name', () => {
    expect(F0I_VARIANT.name).toBe('PROMPT_V4_CANONICAL');
    expect(F0I_VARIANT.label).toBe('PROMPT_V4_CANDIDATE');
    expect(V4_BATCH_1.variantName).toBe('PROMPT_V4_CANONICAL');
    expect(V4_BATCH_1.variantLabel).toBe('PROMPT_V4_CANDIDATE');
    expect(ChildManifestSchema.shape.variantName.options).toContain(V4_BATCH_1.variantName);
    expect(ChildManifestSchema.shape.variantLabel.options).toContain(V4_BATCH_1.variantLabel);
  });

  it('the set is still CLOSED: an unadmitted variant is refused, exactly as V4 was', () => {
    const base = manifestFor('/synthetic/attempt-dir');
    for (const override of [
      { variantName: 'PROMPT_V5_CANONICAL' },
      { variantLabel: 'PROMPT_V5_CANDIDATE' },
      { variantName: 'prompt_v4_canonical' },
    ]) {
      const parsed = ChildManifestSchema.safeParse({ ...base, ...override });
      expect(parsed.success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The coordinator -> child boundary, over the REAL approved F0I plan.
// ---------------------------------------------------------------------------

function tier2Ok(scratch: string) {
  return {
    outcome: 'COMPLETED' as const,
    platform: 'posix' as const,
    pid: 4242,
    exitCode: 0,
    signal: null,
    gracefulShutdownRequested: false,
    gracefulPhase: null,
    gracePhaseVerdict: null,
    shutdownAcknowledged: false,
    exitedWithinGrace: false,
    gracefulShutdownConfirmed: false,
    hardKillRequired: false,
    hardKillDisposition: 'NOT_REQUIRED' as const,
    hardKillSuppressionReason: null,
    hardKill: null,
    posixGroupSweep: 'NO_SUCH_PROCESS' as const,
    stderrTail: '',
    scratchDir: join(scratch, 'gone'),
  };
}

function fakeLauncher(): {
  readonly launcher: ChildLauncher;
  readonly launched: { variantName: string; ordinal: number; attemptNo: number }[];
} {
  const launched: { variantName: string; ordinal: number; attemptNo: number }[] = [];
  const launcher: ChildLauncher = {
    launch: async (input: ChildLaunchInput) => {
      const manifest = (
        JSON.parse(readFileSync(input.manifestPath, 'utf8')) as {
          record: { variantName: string; logicalBatchOrdinal: number; attemptNo: number };
        }
      ).record;
      launched.push({
        variantName: manifest.variantName,
        ordinal: manifest.logicalBatchOrdinal,
        attemptNo: manifest.attemptNo,
      });
      const dir = input.attemptDir;
      writeArtifactOnce(dir, 'CHILD_PREFLIGHT', {
        ok: true,
        stopCondition: null,
        detail: 'fake',
        checks: [],
        providerConstructed: false,
      });
      const serialization = canonicalStringify({ results: [] });
      writeArtifactOnce(dir, 'RAW_OUTPUT_CHECKPOINT', {
        rawOutputCanonicalSerialization: serialization,
        rawOutputSha256: sha256Hex(serialization),
        rawOutputUtf8Bytes: Buffer.byteLength(serialization, 'utf8'),
      });
      writeArtifactOnce(dir, 'VALIDATION_RESULT', {
        kind: 'SCHEMA_INVALID',
        detail: 'fake',
        accepted: [],
        rejected: [],
      });
      writeArtifactOnce(dir, 'PROVIDER_OUTCOME', {
        outcome: 'OK',
        providerReportedModelId: MODEL,
        inputTokens: 10,
        outputTokens: 20,
        outcomeDetail: null,
        internalAdapterAttemptCountWhereObservable: 1,
        authStatusInvocationsObserved: 1,
        startedAtUtc: '2026-09-15T12:00:00.000Z',
        endedAtUtc: '2026-09-15T12:00:01.000Z',
        monotonicWallTimeMs: 1000,
        tier1DiagnosticsCaptured: 0,
      });
      writeArtifactOnce(dir, 'CHILD_RESULT', {
        variantName: manifest.variantName,
        logicalBatchOrdinal: manifest.logicalBatchOrdinal,
        attemptNo: manifest.attemptNo,
        providerOutcome: 'OK',
        providerReportedModelId: MODEL,
        rawCheckpointPersistedBeforeValidation: true,
        rawBeforeValidationSequence: { persistedSeq: 1, validationStartedSeq: 2 },
        childStopCondition: null,
        artifactHashes: {},
        repairRound: null,
      });
      return tier2Ok(SCRATCH);
    },
  };
  return { launcher, launched };
}

function experimentInput(
  overrides: Partial<ExperimentInput> & { readonly launcher: ChildLauncher },
): ExperimentInput {
  const outputRoot = scratchDir('out');
  return {
    plan: PLAN,
    freezePath: join(ROOT, F0I_FREEZE_PATH),
    outputRoot,
    attemptNo: 3,
    authorisation: { authorisationVersion: 'synthetic-for-test' },
    authorisationSha256: sha256Hex(`f0k-auth-${counter}`),
    variantRoots: { PROMPT_V4_CANONICAL: '/synthetic/v4' },
    classifierConfigDir: '/synthetic/profile',
    parentEnv: { PATH: '/usr/bin', HOME: '/home/x' },
    platform: 'posix',
    clock: { nowUtc: () => new Date('2026-09-15T12:00:00Z') },
    ...overrides,
  };
}

describe('2D2C-F0K: the coordinator builds and launches all twelve V4 children', () => {
  it('runs the real approved F0I plan end to end against a fake launcher', async () => {
    const { launcher, launched } = fakeLauncher();
    const input = experimentInput({ launcher });
    const result = await runExperiment(input);
    expect(result.status).toBe('COMPLETED_ALL_PLANNED');
    expect(result.halt).toBeNull();
    expect(result.evaluationsStarted).toBe(12);
    expect(result.perVariantEndedWithoutStop).toEqual({ PROMPT_V4_CANONICAL: 12 });
    expect(launched).toEqual(
      Array.from({ length: 12 }, (_, index) => ({
        variantName: 'PROMPT_V4_CANONICAL',
        ordinal: index + 1,
        attemptNo: 3,
      })),
    );
    // Every child manifest exists and names the approved pair; this is the
    // exact write that was refused on 2026-09-15.
    for (let ordinal = 1; ordinal <= 12; ordinal += 1) {
      const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V4_CANONICAL', ordinal, 3);
      const manifest = record<ChildManifest>(dir, 'CHILD_MANIFEST');
      expect(manifest?.variantName).toBe('PROMPT_V4_CANONICAL');
      expect(manifest?.variantLabel).toBe('PROMPT_V4_CANDIDATE');
      expect(manifest?.variantGitCommit).toBe(F0I_VARIANT.gitCommit);
      expect(manifest?.attemptNo).toBe(3);
      expect(manifest?.freezeConfigRawSha256).toBe(PROPOSED_F0I_FREEZE_RAW_SHA256);
    }
    expect(existsSync(authorisationMarkerPathOf(input.outputRoot, input.authorisationSha256))).toBe(
      true,
    );
  });

  it('reproduces the pre-repair failure MODE: an unadmitted variant halts with planned-input written and child-manifest absent', async () => {
    const { launcher, launched } = fakeLauncher();
    const unadmitted = {
      ...PLAN,
      plannedLogicalEvaluations: 1,
      evaluations: [{ ...V4_BATCH_1, variantName: 'PROMPT_V9_CANONICAL' }],
    };
    const input = experimentInput({
      launcher,
      plan: unadmitted,
      variantRoots: { PROMPT_V9_CANONICAL: '/synthetic/v9' },
    });
    await expect(runExperiment(input)).rejects.toThrow();
    const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V9_CANONICAL', 1, 3);
    // The preserved attempt-3 evidence root has exactly this shape.
    expect(existsSync(join(dir, 'planned-input.json'))).toBe(true);
    expect(existsSync(join(dir, 'child-manifest.json'))).toBe(false);
    expect(launched).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. The child, in process, under a real F0I manifest.
// ---------------------------------------------------------------------------

const VARIANT_ROOT = '/synthetic/variant-root-v4';

function fakeRuntime(): LoadedVariantRuntime {
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
    'repair',
  ];
  return {
    root: VARIANT_ROOT,
    moduleUrls: Object.fromEntries(
      names.map((m) => [m, `file://${VARIANT_ROOT}/dist/${m}.js`]),
    ) as LoadedVariantRuntime['moduleUrls'],
    canonical: canonicalModule,
    finalIdentity: finalIdentityModule,
    // THIS worktree's production prompt is the V3 text, NOT the V4 text: the
    // V4 prompt lives only in the frozen V4 runtime root and is never copied
    // here. That is exactly why `promptSha256` is the one identity below that
    // legitimately differs — and why every OTHER identity matching proves the
    // child reconstructs a real V4 evaluation.
    prompt: promptModule,
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
    repair: repairModule,
  };
}

function manifestFor(dir: string, overrides: Partial<ChildManifest> = {}): ChildManifest {
  const e = V4_BATCH_1;
  return {
    runnerRecordVersion: RUNNER_ARTIFACT_VERSION,
    freezePath: join(ROOT, F0I_FREEZE_PATH),
    freezeConfigRawSha256: rawSha256,
    freezeVersion: freeze.version,
    variantName: e.variantName,
    variantLabel: e.variantLabel,
    variantGitCommit: e.variantGitCommit,
    variantRoot: VARIANT_ROOT,
    promptVersion: e.promptVersion,
    promptSha256: e.promptSha256,
    logicalBatchOrdinal: e.logicalBatchOrdinal,
    organisationId: e.organisationId,
    echeRowKey: e.echeRowKey,
    orderedGoldIds: e.orderedGoldIds,
    orderedDocIndices: e.orderedDocIndices,
    batchContext: e.batchContext,
    serializedBatchUtf8Bytes: e.serializedBatchUtf8Bytes,
    assemblyInputSha256: e.assemblyInputSha256,
    finalInputSha256: e.finalInputSha256,
    requestedModelId: PLAN.requestedModelId,
    runConfig: { maxTurns: 3, thinking: 'disabled' },
    outputSchemaVersion: PLAN.outputSchemaVersion,
    attemptNo: 3,
    attemptDir: dir,
    classifierConfigDir: '/synthetic/profile',
    ...overrides,
  };
}

const childScratch: string[] = [];
afterEach(() => {
  for (const dir of childScratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function childHarness(
  dir: string,
  options: { readonly manifest?: Partial<ChildManifest>; readonly freezeBytes?: Buffer } = {},
): { readonly manifestPath: string; readonly deps: ChildDependencies; factoryCalls: () => number } {
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
  const runtime = fakeRuntime();
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
      if (path === manifest.freezePath) return options.freezeBytes ?? F0I_BYTES;
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
        throw new Error('this test must never construct a provider');
      },
    },
    clock: {
      nowUtc: () => new Date('2026-09-15T12:00:00Z'),
      monotonicMs: () => (mono += 250),
    },
  };
  return { manifestPath, deps, factoryCalls: () => factoryCalls };
}

function childDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f0k-child-'));
  childScratch.push(dir);
  return dir;
}

describe('2D2C-F0K: the child under a real attempt-3 (F0I) manifest', () => {
  it('resolves the F0I family, finds the V4 variant, and re-derives EVERY identity except the prompt this worktree cannot carry', async () => {
    const dir = childDir();
    const h = childHarness(dir);
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect(h.factoryCalls()).toBe(0);
    const preflight = record<{ detail: string; checks: { mismatches?: string[] } }>(
      dir,
      'CHILD_PREFLIGHT',
    );
    // The ONLY mismatch is the prompt text, which lives in the frozen V4
    // runtime root alone. organisationId, echeRowKey, gold ids, doc indices,
    // batch context, serialized bytes, assembly identity, the V4 FINAL
    // IDENTITY, the model and the output schema all verified.
    expect(preflight?.checks.mismatches).toEqual(['promptSha256']);
    expect(preflight?.detail).not.toContain('is not a variant this freeze');
  });

  it('a V1, V2 or V3 manifest under F0I is refused before any provider construction', async () => {
    for (const [variantName, variantLabel] of [
      ['PROMPT_V1_CANONICAL', 'PROMPT_V1_COMPARATOR'],
      ['PROMPT_V2_CANONICAL', 'PROMPT_V2_CANDIDATE'],
      ['PROMPT_V3_CANONICAL', 'PROMPT_V3_CANDIDATE'],
    ] as const) {
      const dir = childDir();
      const h = childHarness(dir, { manifest: { variantName, variantLabel } });
      const outcome = await runChildEvaluation(h.manifestPath, h.deps);
      expect(outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
      expect(h.factoryCalls()).toBe(0);
      expect(record<{ detail: string }>(dir, 'CHILD_PREFLIGHT')?.detail).toContain(
        `${variantName} is not a variant this freeze (F0I_ATTEMPT_3) schedules`,
      );
    }
  });

  it('F0K: an F0I manifest requesting attempt 1 or 2 is refused by the now-symmetric attempt gate', async () => {
    for (const attemptNo of [1, 2]) {
      const dir = childDir();
      const h = childHarness(dir, { manifest: { attemptNo } });
      const outcome = await runChildEvaluation(h.manifestPath, h.deps);
      expect(outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
      expect(h.factoryCalls()).toBe(0);
      expect(record<{ detail: string }>(dir, 'CHILD_PREFLIGHT')?.detail).toBe(
        `the F0I freeze configures attempt 3; the manifest requests attempt ${attemptNo}.`,
      );
    }
  });

  it('names the F0I family in its own hash-drift message, and leaves the F0E and F0B messages unchanged', async () => {
    const f0i = childDir();
    let h = childHarness(f0i, { manifest: { freezeConfigRawSha256: 'a'.repeat(64) } });
    await runChildEvaluation(h.manifestPath, h.deps);
    expect(record<{ detail: string }>(f0i, 'CHILD_PREFLIGHT')?.detail).toBe(
      'the manifest freeze hash is not the approved F0I hash.',
    );
    const f0e = childDir();
    h = childHarness(f0e, {
      freezeBytes: F0E_BYTES,
      manifest: { freezeConfigRawSha256: 'a'.repeat(64) },
    });
    await runChildEvaluation(h.manifestPath, h.deps);
    expect(record<{ detail: string }>(f0e, 'CHILD_PREFLIGHT')?.detail).toBe(
      'the manifest freeze hash is not the proposed F0E hash.',
    );
    const f0b = childDir();
    h = childHarness(f0b, {
      freezeBytes: F0B_BYTES,
      manifest: { freezeConfigRawSha256: 'a'.repeat(64) },
    });
    await runChildEvaluation(h.manifestPath, h.deps);
    expect(record<{ detail: string }>(f0b, 'CHILD_PREFLIGHT')?.detail).toBe(
      'the manifest freeze hash is not the F0B hash.',
    );
    // The three families remain distinguishable by hash alone.
    expect(
      new Set([
        PROPOSED_F0I_FREEZE_RAW_SHA256,
        PROPOSED_F0E_FREEZE_RAW_SHA256,
        EXPECTED_F0B_FREEZE_RAW_SHA256,
      ]).size,
    ).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 4. PROCESS level: the real Tier-2 child entry, request-free by construction.
// ---------------------------------------------------------------------------

describe.skipIf(IS_WINDOWS)('2D2C-F0K: the REAL child entry under an attempt-3 manifest', () => {
  it('boots, admits the V4 manifest, resolves the F0I family by hash, and stops at preflight against a non-frozen root — before any provider import', async () => {
    const pids: number[] = [];
    const launcher: ChildLauncher = {
      launch: (input) =>
        runProcessIsolatedBatch({
          modulePath: CHILD_ENTRY_PATH,
          args: ['--manifest', input.manifestPath],
          watchdogMs: 20_000,
          graceMs: 1_000,
          childEnv: input.childEnv,
          onChildSpawned: (pid) => {
            pids.push(pid);
          },
        }),
    };
    const input = experimentInput({
      launcher,
      plan: { ...PLAN, evaluations: PLAN.evaluations.slice(0, 1), plannedLogicalEvaluations: 1 },
      // THIS worktree, which is not the frozen V4 runtime root: the root check
      // fails, which is what makes the run structurally unable to reach a
      // provider, an auth path or a socket.
      variantRoots: { PROMPT_V4_CANONICAL: ROOT },
      parentEnv: {
        PATH: process.env['PATH'] ?? '',
        HOME: process.env['HOME'] ?? '',
        TMPDIR: process.env['TMPDIR'] ?? tmpdir(),
      },
    });
    const result = await runExperiment(input);
    expect(result.halt).toMatchObject({
      kind: 'STOP_CONDITION',
      stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT',
      atSequence: 1,
    });
    expect(pids).toHaveLength(1);
    const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V4_CANONICAL', 1, 3);
    // The manifest WAS built and WAS read by a real child process.
    expect(record<ChildManifest>(dir, 'CHILD_MANIFEST')?.variantName).toBe('PROMPT_V4_CANONICAL');
    const preflight = record<{
      ok: boolean;
      stopCondition: string;
      checks: { stage: string };
      providerConstructed: boolean;
    }>(dir, 'CHILD_PREFLIGHT');
    expect(preflight?.ok).toBe(false);
    expect(preflight?.providerConstructed).toBe(false);
    expect(preflight?.checks.stage).toBe('variantRoot');
    expect(existsSync(join(dir, 'provider-outcome.json'))).toBe(false);
    expect(existsSync(join(dir, 'raw-output-checkpoint.json'))).toBe(false);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// 5. The replacement-authorisation state machine.
// ---------------------------------------------------------------------------

describe('2D2C-F0K: physical consumption is permanent and root-independent', () => {
  it('pins the spent attempt-3 authorisation and its consumption record by exact hash', () => {
    expect(SPENT_ATTEMPT_3_AUTHORISATION_SHA256).toBe(
      'd7a66ad4834753be4b6c07cb7aac5f279181d0da9b92f541c07ca0b00b81d7d4',
    );
    expect(SPENT_ATTEMPT_3_CONSUMPTION_RECORD_SHA256).toBe(
      '35757c0b9c83a1b2e6b3e7c5ddb3c9935e8820f27f25eb95e7d484ed4f2d637e',
    );
  });

  it('refuses the spent attempt-3 bytes even under a FRESH output root with no consumption marker', () => {
    // Bytes whose hash is the spent one; the lock must never reach the schema.
    const bytes = Buffer.from('any bytes at all', 'utf8');
    const input: Attempt3ExecutionLockInput = {
      executeFlag: true,
      authorisationPath: '/synthetic/replacement.json',
      expected: { outputRoot: '/synthetic/attempt-3-retry-1', attemptNo: 3 },
      readFile: () => bytes,
      sha256: () => SPENT_ATTEMPT_3_AUTHORISATION_SHA256,
      alreadyConsumed: () => false,
      nowUtc: () => new Date('2026-09-15T12:00:00Z'),
    };
    const decision = evaluateAttempt3ExecutionLock(input);
    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(decision.refusal).toBe('SPENT_ATTEMPT_3_AUTHORISATION_PRESENTED');
      expect(decision.detail).toContain('PRE_INFERENCE_REFUSAL');
    }
  });
});

function probesFor(files: readonly string[], directory = true): PriorAttempt3Probes {
  return { isDirectory: () => directory, listFilesRecursively: () => files };
}

const PRESERVED_SHAPE = [
  `authorisations/${SPENT_ATTEMPT_3_AUTHORISATION_SHA256}.json`,
  'evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/planned-input.json',
  'experiments/attempt-3/experiment-manifest.json',
];

describe('2D2C-F0K: a replacement is permitted only where zero inference is PROVEN', () => {
  it('classifies the preserved attempt-3 root shape as PRE_INFERENCE_REFUSAL', () => {
    const verdict = classifyPriorAttempt3Root('/preserved/attempt-3', probesFor(PRESERVED_SHAPE));
    expect(verdict.disposition).toBe('PRE_INFERENCE_REFUSAL');
    expect(verdict.replacementPermitted).toBe(true);
  });

  it('refuses when any artifact past child-manifest construction is present', () => {
    for (const extra of [
      'evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/child-manifest.json',
      'evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/provider-outcome.json',
      'evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/final-record.json',
      'evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/repair-1/repair-round.json',
      'experiments/attempt-3/experiment-completion.json',
    ]) {
      const verdict = classifyPriorAttempt3Root(
        '/preserved/attempt-3',
        probesFor([...PRESERVED_SHAPE, extra]),
      );
      expect(verdict.disposition).toBe('SEMANTIC_EXECUTION_OBSERVED');
      expect(verdict.replacementPermitted).toBe(false);
    }
  });

  it('refuses an unaccounted file, and an unreadable root, as AMBIGUOUS', () => {
    const unknown = classifyPriorAttempt3Root(
      '/preserved/attempt-3',
      probesFor([...PRESERVED_SHAPE, 'notes.txt']),
    );
    expect(unknown.disposition).toBe('AMBIGUOUS');
    expect(unknown.replacementPermitted).toBe(false);
    const unreadable = classifyPriorAttempt3Root('/preserved/attempt-3', {
      isDirectory: () => true,
      listFilesRecursively: () => {
        throw new Error('EACCES');
      },
    });
    expect(unreadable.disposition).toBe('AMBIGUOUS');
    expect(unreadable.replacementPermitted).toBe(false);
  });

  it('reads a path that names no directory, and an empty one, as NO_PRIOR_ATTEMPT_3_EVIDENCE', () => {
    expect(classifyPriorAttempt3Root('/nowhere', probesFor([], false)).disposition).toBe(
      'NO_PRIOR_ATTEMPT_3_EVIDENCE',
    );
    expect(classifyPriorAttempt3Root('/empty', probesFor([])).disposition).toBe(
      'NO_PRIOR_ATTEMPT_3_EVIDENCE',
    );
  });
});

// ---------------------------------------------------------------------------
// 5b. The replacement binding is REQUIRED, and every member of it is pinned.
// ---------------------------------------------------------------------------

const REPLACEMENT_OUTPUT_ROOT = '/synthetic/attempt-3-retry-1';

function replacementAuthorisation(
  overrides: Record<string, unknown> = {},
): Attempt3ExecutionAuthorisation {
  return {
    authorisationVersion: ATTEMPT3_AUTHORISATION_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    attemptNo: 3,
    freezeConfigRawSha256: PROPOSED_F0I_FREEZE_RAW_SHA256,
    planSha256: PROPOSED_F0I_PLAN_SHA256,
    freezeApprovalRecordRawSha256: F0I_APPROVAL_RECORD_RAW_SHA256 as string,
    freezeApprovalRatificationRecordRawSha256: F0I_RATIFICATION_RECORD_RAW_SHA256 as string,
    variants: [
      {
        name: F0I_VARIANT.name,
        label: F0I_VARIANT.label,
        gitCommit: F0I_VARIANT.gitCommit,
        promptVersion: F0I_VARIANT.promptVersion,
        promptSha256: F0I_VARIANT.runtimePromptSha256,
      },
    ],
    maxLogicalEvaluations: 12,
    frozenLogicalBatchOrdinals: [...ATTEMPT3_FROZEN_ORDINALS],
    priorVariantReruns: { PROMPT_V1_CANONICAL: 0, PROMPT_V2_CANONICAL: 0, PROMPT_V3_CANONICAL: 0 },
    maxProviderRequests: ATTEMPT3_MAX_PROVIDER_REQUESTS,
    maxAdapterAttempts: ATTEMPT3_MAX_ADAPTER_ATTEMPTS,
    repairPolicy: {
      enabled: true,
      maxRoundsPerLogicalEvaluation: 1,
      minimumRemainingBudgetMs: REPAIR_MINIMUM_REMAINING_BUDGET_MS,
    },
    prohibitions: {
      holdout: 'NONE',
      goldLabelChanges: 'NONE',
      thresholdChanges: 'NONE',
      databaseWrites: 'NONE',
      migrationWrites: 'NONE',
    },
    replacementOf: {
      supersededAuthorisationSha256: SPENT_ATTEMPT_3_AUTHORISATION_SHA256,
      supersededConsumptionRecordSha256: SPENT_ATTEMPT_3_CONSUMPTION_RECORD_SHA256,
      supersededOutcome: 'PRE_INFERENCE_REFUSAL',
      priorSemanticAttemptExecutions: 0,
      operatorReplacementStatement: ATTEMPT3_REPLACEMENT_STATEMENT,
    },
    outputRoot: REPLACEMENT_OUTPUT_ROOT,
    issuedAtUtc: '2026-09-15T12:00:00Z',
    validUntilUtc: '2026-09-15T16:00:00Z',
    operatorAuthorisationStatement: ATTEMPT3_AUTHORISATION_STATEMENT,
    ...overrides,
  } as Attempt3ExecutionAuthorisation;
}

function lockFor(authorisation: unknown): Attempt3ExecutionLockInput {
  const bytes = Buffer.from(JSON.stringify(authorisation), 'utf8');
  return {
    executeFlag: true,
    authorisationPath: '/synthetic/replacement.json',
    expected: { outputRoot: REPLACEMENT_OUTPUT_ROOT, attemptNo: 3 },
    readFile: () => bytes,
    sha256: sha256Hex,
    alreadyConsumed: () => false,
    nowUtc: () => new Date('2026-09-15T13:00:00Z'),
  };
}

describe('2D2C-F0K: an attempt-3 authorisation must bind itself to the preserved refusal', () => {
  it('the replacement statement names the spent bytes, its consumption record and the zero-inference outcome', () => {
    expect(ATTEMPT3_REPLACEMENT_STATEMENT).toContain(SPENT_ATTEMPT_3_AUTHORISATION_SHA256);
    expect(ATTEMPT3_REPLACEMENT_STATEMENT).toContain(SPENT_ATTEMPT_3_CONSUMPTION_RECORD_SHA256);
    expect(ATTEMPT3_REPLACEMENT_STATEMENT).toContain('PRE_INFERENCE_REFUSAL');
    expect(ATTEMPT3_REPLACEMENT_STATEMENT).toContain('PROMPT_V4_CANONICAL');
  });

  it('a correctly-bound replacement is GRANTED, and the pinned attempt-3 statement is unchanged', () => {
    const decision = evaluateAttempt3ExecutionLock(lockFor(replacementAuthorisation()));
    expect(decision.granted).toBe(true);
    expect(ATTEMPT3_AUTHORISATION_STATEMENT).toContain(PROPOSED_F0I_FREEZE_RAW_SHA256);
    expect(ATTEMPT3_AUTHORISATION_STATEMENT).toContain(F0I_VARIANT.runtimePromptSha256);
  });

  it('every mutation of the binding — and its absence — is AUTHORISATION_MALFORMED', () => {
    const mutations: Record<string, unknown>[] = [
      {},
      { supersededAuthorisationSha256: 'b'.repeat(64) },
      { supersededConsumptionRecordSha256: 'c'.repeat(64) },
      { supersededOutcome: 'COMPLETED' },
      { priorSemanticAttemptExecutions: 1 },
      { operatorReplacementStatement: `${ATTEMPT3_REPLACEMENT_STATEMENT} ` },
    ];
    for (const mutation of mutations) {
      const base = replacementAuthorisation();
      const authorisation =
        Object.keys(mutation).length === 0
          ? (() => {
              const { replacementOf: _dropped, ...rest } = base as Record<string, unknown>;
              return rest;
            })()
          : { ...base, replacementOf: { ...base.replacementOf, ...mutation } };
      const decision = evaluateAttempt3ExecutionLock(lockFor(authorisation));
      expect(decision.granted).toBe(false);
      if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The sibling stale set: the shared scorer planned-input schema.
// ---------------------------------------------------------------------------

describe('2D2C-F0K: the shared scorer planned-input schema admits the V4 evaluations', () => {
  it('parses a real attempt-3 planned input, and still parses the prior variants', () => {
    const base = {
      sequence: V4_BATCH_1.sequence,
      variantLabel: V4_BATCH_1.variantLabel,
      variantOrder: V4_BATCH_1.variantOrder,
      variantGitCommit: V4_BATCH_1.variantGitCommit,
      promptVersion: V4_BATCH_1.promptVersion,
      promptSha256: V4_BATCH_1.promptSha256,
      logicalBatchOrdinal: V4_BATCH_1.logicalBatchOrdinal,
      organisationId: V4_BATCH_1.organisationId,
      echeRowKey: V4_BATCH_1.echeRowKey,
      orderedGoldIds: [...V4_BATCH_1.orderedGoldIds],
      orderedDocIndices: [...V4_BATCH_1.orderedDocIndices],
      assemblyInputSha256: V4_BATCH_1.assemblyInputSha256,
      canonicalSerializedInputSha256: V4_BATCH_1.canonicalSerializedInputSha256,
      finalInputSha256: V4_BATCH_1.finalInputSha256,
      attemptNo: 3,
      requestedModelId: PLAN.requestedModelId,
    };
    for (const variantName of [
      'PROMPT_V1_CANONICAL',
      'PROMPT_V2_CANONICAL',
      'PROMPT_V3_CANONICAL',
      'PROMPT_V4_CANONICAL',
    ]) {
      expect(PlannedInputSchema.safeParse({ ...base, variantName }).success).toBe(true);
    }
    expect(
      PlannedInputSchema.safeParse({ ...base, variantName: 'PROMPT_V9_CANONICAL' }).success,
    ).toBe(false);
  });
});

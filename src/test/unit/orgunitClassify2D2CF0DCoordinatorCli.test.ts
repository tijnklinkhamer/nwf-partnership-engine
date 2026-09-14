/**
 * PHASE 2B-2D2C-F0D — the coordinator over the ATTEMPT-2 plan, and the
 * attempt-2 CLI.
 *
 *   1. the coordinator with a FAKE launcher runs the twelve V3 evaluations
 *      in frozen order into the write-once attempt-2 namespace, consumes the
 *      authorisation, and stops on a planted attempt-2 directory, a missing
 *      root or a stop condition;
 *   2. the CLI is plan-only by default (no launcher, deterministic plan, the
 *      approved plan SHA-256), refuses `--execute` without every gate,
 *      refuses attempt numbers other than 2, refuses a NON-EMPTY output root,
 *      refuses the attempt-1 authorisation through the lock, and — only with
 *      a synthetic root that passes every V3 check and a NEW attempt-2
 *      authorisation — drives the fake launcher exactly once per evaluation;
 *   3. the REAL child entry, forked through the real Tier-2 harness with an
 *      attempt-2 manifest against a non-frozen root, resolves the F0C family
 *      by hash and stops at its own preflight — before any provider import.
 *
 * No provider, no network, no database. Synthetic roots never execute
 * their native binary. Everything is written under scratch directories.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../orgunits/classify/repair.js';
import {
  runProcessIsolatedBatch,
  type ProcessIsolatedBatchResult,
} from '../harness/processIsolatedBatch.js';
import {
  attemptDirectoryOf,
  readArtifact,
  writeArtifactOnce,
} from '../harness/phase2b2d2c/artifacts.js';
import {
  AUTHORISATION_STATEMENT,
  AUTHORISATION_VERSION,
} from '../harness/phase2b2d2c/authorisation.js';
import {
  EXPECTED_F0B_FREEZE_RAW_SHA256,
  FROZEN_VARIANTS,
} from '../harness/phase2b2d2c/constants.js';
import {
  authorisationMarkerPathOf,
  runExperiment,
  type ChildLauncher,
  type ChildLaunchInput,
  type ExperimentInput,
} from '../harness/phase2b2d2c/coordinator.js';
import {
  F0C_AUTHORISATION_STATEMENT,
  F0C_AUTHORISATION_VERSION,
  F0C_MAX_PROVIDER_REQUESTS,
  type F0CExecutionAuthorisation,
} from '../harness/phase2b2d2c/f0c/authorisationF0C.js';
import {
  CHILD_ENTRY_PATH,
  parseF0CCliArgs,
  runF0CCli,
  type F0CCliIo,
} from '../harness/phase2b2d2c/f0c/cliF0C.js';
import {
  APPROVED_F0C_FREEZE_RAW_SHA256,
  APPROVED_F0C_PLAN_SHA256,
  buildF0CExecutionPlan,
  F0C_APPROVAL_RECORD_RAW_SHA256,
  F0C_FREEZE_PATH,
  F0C_RATIFICATION_RECORD_RAW_SHA256,
  F0C_VARIANT,
  f0cPlanSha256,
  loadF0CFreezeFromBytes,
} from '../harness/phase2b2d2c/f0c/freezeF0C.js';
import { sha256Hex } from '../harness/phase2b2d2c/freeze.js';
import { loadVariantRuntime } from '../harness/phase2b2d2c/runtimeLoader.js';
import type { VariantRootProbes } from '../harness/phase2b2d2c/variantRoot.js';
import {
  buildSyntheticVariantRoot,
  fakeGitProbes,
  hostNativePackage,
  V3,
} from './support/phase2b2d2cSyntheticRoot.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { freeze, rawSha256 } = loadF0CFreezeFromBytes(readFileSync(join(ROOT, F0C_FREEZE_PATH)));
const PLAN = buildF0CExecutionPlan(freeze, rawSha256);
const MODEL = PLAN.requestedModelId;
const HOST_NATIVE = hostNativePackage(freeze);
const ON_RUN_PLATFORM =
  `${process.platform}-${process.arch}` ===
  freeze.classifier.claudeCodeExecutable.runPlatform.platformKey;
const IS_WINDOWS = process.platform === 'win32';

const SCRATCH = realpathSync.native(mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f0d-coord-')));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));
let outputCounter = 0;
function outputRoot(): string {
  outputCounter += 1;
  const dir = join(SCRATCH, `out-${outputCounter}`);
  mkdirSync(dir);
  return dir;
}

function tier2(overrides: Partial<ProcessIsolatedBatchResult> = {}): ProcessIsolatedBatchResult {
  return {
    outcome: 'COMPLETED',
    platform: 'posix',
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
    hardKillDisposition: 'NOT_REQUIRED',
    hardKillSuppressionReason: null,
    hardKill: null,
    posixGroupSweep: 'NO_SUCH_PROCESS',
    stderrTail: '',
    scratchDir: join(SCRATCH, 'gone'),
    ...overrides,
  };
}

const rawOf = (rawOutput: unknown) => {
  const serialization = canonicalStringify(rawOutput);
  return {
    rawOutputCanonicalSerialization: serialization,
    rawOutputSha256: sha256Hex(serialization),
    rawOutputUtf8Bytes: Buffer.byteLength(serialization, 'utf8'),
  };
};

function okChild(input: ChildLaunchInput, outcome = 'OK'): ProcessIsolatedBatchResult {
  const dir = input.attemptDir;
  const manifest = (
    JSON.parse(readFileSync(input.manifestPath, 'utf8')) as {
      record: { variantName: string; logicalBatchOrdinal: number; attemptNo: number };
    }
  ).record;
  writeArtifactOnce(dir, 'CHILD_PREFLIGHT', {
    ok: true,
    stopCondition: null,
    detail: 'fake',
    checks: [],
    providerConstructed: false,
  });
  if (outcome === 'OK') {
    writeArtifactOnce(dir, 'RAW_OUTPUT_CHECKPOINT', rawOf({ results: [] }));
    writeArtifactOnce(dir, 'VALIDATION_RESULT', {
      kind: 'SCHEMA_INVALID',
      detail: 'fake',
      accepted: [],
      rejected: [],
    });
  }
  writeArtifactOnce(dir, 'PROVIDER_OUTCOME', {
    outcome,
    providerReportedModelId: outcome === 'OK' ? MODEL : null,
    inputTokens: 10,
    outputTokens: 20,
    outcomeDetail: outcome === 'OK' ? null : outcome,
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
    providerOutcome: outcome,
    providerReportedModelId: outcome === 'OK' ? MODEL : null,
    rawCheckpointPersistedBeforeValidation: outcome === 'OK' ? true : null,
    rawBeforeValidationSequence:
      outcome === 'OK' ? { persistedSeq: 1, validationStartedSeq: 2 } : null,
    childStopCondition: null,
    artifactHashes: {},
    repairRound: null,
  });
  return tier2();
}

function fakeLauncher(behaviours: Record<number, 'ok' | 'usageLimit'> = {}) {
  const launched: { sequence: number; variantName: string; ordinal: number; attemptNo: number }[] =
    [];
  const launcher: ChildLauncher = {
    launch: async (input) => {
      const manifest = (
        JSON.parse(readFileSync(input.manifestPath, 'utf8')) as {
          record: { variantName: string; logicalBatchOrdinal: number; attemptNo: number };
        }
      ).record;
      const sequence = launched.length + 1;
      launched.push({
        sequence,
        variantName: manifest.variantName,
        ordinal: manifest.logicalBatchOrdinal,
        attemptNo: manifest.attemptNo,
      });
      expect(input.watchdogMs).toBe(700_000);
      expect(input.graceMs).toBe(10_000);
      return behaviours[sequence] === 'usageLimit'
        ? okChild(input, 'USAGE_LIMIT_EXHAUSTED')
        : okChild(input);
    },
  };
  return { launcher, launched };
}

function validAuthorisation(root: string): F0CExecutionAuthorisation {
  return {
    authorisationVersion: F0C_AUTHORISATION_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    attemptNo: 2,
    freezeConfigRawSha256: APPROVED_F0C_FREEZE_RAW_SHA256,
    planSha256: APPROVED_F0C_PLAN_SHA256,
    freezeApprovalRecordRawSha256: F0C_APPROVAL_RECORD_RAW_SHA256,
    freezeApprovalRatificationRecordRawSha256: F0C_RATIFICATION_RECORD_RAW_SHA256,
    variants: [
      { name: F0C_VARIANT.name, label: F0C_VARIANT.label, gitCommit: F0C_VARIANT.gitCommit },
    ],
    maxLogicalEvaluations: 12,
    maxProviderRequests: F0C_MAX_PROVIDER_REQUESTS,
    repairPolicy: {
      enabled: true,
      maxRoundsPerLogicalEvaluation: 1,
      minimumRemainingBudgetMs: REPAIR_MINIMUM_REMAINING_BUDGET_MS,
    },
    outputRoot: root,
    issuedAtUtc: '2026-09-15T11:00:00.000Z',
    validUntilUtc: '2026-09-15T13:00:00.000Z',
    operatorAuthorisationStatement: F0C_AUTHORISATION_STATEMENT,
  };
}

function experimentInput(
  overrides: Partial<ExperimentInput> & { readonly launcher: ChildLauncher },
): ExperimentInput {
  const root = outputRoot();
  return {
    plan: PLAN,
    freezePath: join(ROOT, F0C_FREEZE_PATH),
    outputRoot: root,
    attemptNo: 2,
    authorisation: validAuthorisation(root),
    authorisationSha256: sha256Hex(`auth-${outputCounter}`),
    variantRoots: { PROMPT_V3_CANONICAL: '/synthetic/v3' },
    classifierConfigDir: '/synthetic/profile',
    parentEnv: { PATH: '/usr/bin', HOME: '/home/x', DATABASE_URL_ADMIN: 'postgres://never' },
    platform: 'posix',
    clock: { nowUtc: () => new Date('2026-09-15T12:00:00Z') },
    ...overrides,
  };
}

const attemptDirs = (root: string): string[] => {
  const evaluations = join(root, 'evaluations');
  if (!existsSync(evaluations)) return [];
  const found: string[] = [];
  for (const variant of readdirSync(evaluations))
    for (const batch of readdirSync(join(evaluations, variant)))
      for (const attempt of readdirSync(join(evaluations, variant, batch)))
        found.push(join(evaluations, variant, batch, attempt));
  return found.sort();
};

const record = <T>(dir: string, kind: Parameters<typeof readArtifact>[1]): T => {
  const read = readArtifact<T>(dir, kind);
  if (!read.ok) throw new Error(`${kind} unreadable: ${read.detail}`);
  return read.envelope.record;
};

// ---------------------------------------------------------------------------
// 1. The coordinator over the attempt-2 plan.
// ---------------------------------------------------------------------------
describe('2D2C-F0D coordinator over the attempt-2 plan (fake launcher)', () => {
  it('runs exactly the 12 V3 evaluations in frozen order into the attempt-2 namespace, consumes the authorisation, and never touches a V1/V2 name', async () => {
    const { launcher, launched } = fakeLauncher();
    const input = experimentInput({ launcher });
    const result = await runExperiment(input);
    expect(result.status).toBe('COMPLETED_ALL_PLANNED');
    expect(result.evaluationsStarted).toBe(12);
    expect(result.perVariantEndedWithoutStop).toEqual({ PROMPT_V3_CANONICAL: 12 });
    expect(launched.map((l) => [l.variantName, l.ordinal, l.attemptNo])).toEqual(
      PLAN.evaluations.map((e) => ['PROMPT_V3_CANONICAL', e.logicalBatchOrdinal, 2]),
    );
    const dirs = attemptDirs(input.outputRoot);
    expect(dirs).toHaveLength(12);
    expect(dirs.every((d) => d.includes('/PROMPT_V3_CANONICAL/') && d.endsWith('attempt-2'))).toBe(
      true,
    );
    expect(readdirSync(join(input.outputRoot, 'evaluations'))).toEqual(['PROMPT_V3_CANONICAL']);
    const markerPath = authorisationMarkerPathOf(input.outputRoot, input.authorisationSha256);
    const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as {
      artifactKind: string;
      record: { authorisationSha256: string; attemptNo: number };
    };
    expect(marker.artifactKind).toBe('AUTHORISATION_CONSUMPTION');
    expect(marker.record).toMatchObject({
      authorisationSha256: input.authorisationSha256,
      attemptNo: 2,
    });
    expect(readdirSync(join(input.outputRoot, 'authorisations'))).toEqual([
      `${input.authorisationSha256}.json`,
    ]);
    const experimentDir = join(input.outputRoot, 'experiments', 'attempt-2');
    const manifest = record<{
      variantRoots: Record<string, string>;
      freezeConfigRawSha256: string;
      attemptNo: number;
    }>(experimentDir, 'EXPERIMENT_MANIFEST');
    expect(Object.keys(manifest.variantRoots)).toEqual(['PROMPT_V3_CANONICAL']);
    expect(manifest.freezeConfigRawSha256).toBe(APPROVED_F0C_FREEZE_RAW_SHA256);
    expect(manifest.attemptNo).toBe(2);
    const completion = record<{
      status: string;
      perVariantEndedWithoutStop: Record<string, number>;
    }>(experimentDir, 'EXPERIMENT_COMPLETION');
    expect(completion).toMatchObject({
      status: 'COMPLETED_ALL_PLANNED',
      perVariantEndedWithoutStop: { PROMPT_V3_CANONICAL: 12 },
    });
    const first = attemptDirectoryOf(input.outputRoot, 'PROMPT_V3_CANONICAL', 1, 2);
    const finalRecord = record<Record<string, unknown>>(first, 'FINAL_RECORD');
    expect(finalRecord['attemptNo']).toBe(2);
    expect(finalRecord['variantName']).toBe('PROMPT_V3_CANONICAL');
    expect(finalRecord['promptSha256']).toBe(V3.runtimePromptSha256);
    expect(finalRecord['freezeConfigRawSha256']).toBe(APPROVED_F0C_FREEZE_RAW_SHA256);
    expect(finalRecord['repairRound']).toBeNull();
    const childManifest = record<{ variantRoot: string; freezePath: string; attemptNo: number }>(
      first,
      'CHILD_MANIFEST',
    );
    expect(childManifest).toMatchObject({
      variantRoot: '/synthetic/v3',
      freezePath: join(ROOT, F0C_FREEZE_PATH),
      attemptNo: 2,
    });
  });

  it('a PLANTED attempt-2 directory (an attempt-1 artifact placed into the attempt-2 namespace) is a write-once refusal at that sequence, and the planted bytes are untouched', async () => {
    const { launcher, launched } = fakeLauncher();
    const input = experimentInput({ launcher });
    const planted = attemptDirectoryOf(input.outputRoot, 'PROMPT_V3_CANONICAL', 3, 2);
    mkdirSync(planted, { recursive: true });
    writeFileSync(join(planted, 'planned-input.json'), '{"planted":"attempt-1 shaped"}');
    const result = await runExperiment(input);
    expect(result.status).toBe('STOPPED');
    expect(result.halt).toMatchObject({ kind: 'WRITE_ONCE_REFUSAL', atSequence: 3 });
    expect(launched).toHaveLength(2);
    expect(readFileSync(join(planted, 'planned-input.json'), 'utf8')).toBe(
      '{"planted":"attempt-1 shaped"}',
    );
    expect(readdirSync(planted)).toEqual(['planned-input.json']);
  });

  it('a plan whose variant has no supplied root is refused before any child is launched', async () => {
    const { launcher, launched } = fakeLauncher();
    const result = await runExperiment(experimentInput({ launcher, variantRoots: {} }));
    expect(result.status).toBe('STOPPED');
    expect(result.halt).toMatchObject({ kind: 'WRITE_ONCE_REFUSAL', atSequence: 1 });
    expect(result.halt?.detail).toContain('no variant root was supplied');
    expect(launched).toHaveLength(0);
  });

  it('a usage-limit outcome stops the experiment; later evaluations never start', async () => {
    const { launcher, launched } = fakeLauncher({ 5: 'usageLimit' });
    const result = await runExperiment(experimentInput({ launcher }));
    expect(result.status).toBe('STOPPED');
    expect(result.halt).toMatchObject({
      kind: 'STOP_CONDITION',
      stopCondition: 'USAGE_LIMIT_INTERRUPTION',
      atSequence: 5,
    });
    expect(result.perVariantEndedWithoutStop).toEqual({ PROMPT_V3_CANONICAL: 4 });
    expect(launched).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// 2. The attempt-2 CLI.
// ---------------------------------------------------------------------------
function io(options: { rootProbes?: VariantRootProbes; launcher?: ChildLauncher } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  let launches = 0;
  const cliIo: F0CCliIo = {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    env: { PATH: '/usr/bin', HOME: '/home/x' },
    nowUtc: () => new Date('2026-09-15T12:00:00Z'),
    launcher: options.launcher ?? {
      launch: async () => {
        launches += 1;
        throw new Error('unreachable');
      },
    },
    ...(options.rootProbes === undefined ? {} : { rootProbes: options.rootProbes }),
  };
  return { cliIo, out, err, launches: () => launches };
}

describe('2D2C-F0D attempt-2 CLI: plan-only by default, closed arguments, no launcher', () => {
  it('parses a closed argument set: no --v1-root, --v2-root or --all; --attempt-no must be a positive integer', () => {
    expect(parseF0CCliArgs(['--json', '--v3-root', '/r', '--attempt1-root', '/a'])).toMatchObject({
      json: true,
      v3Root: '/r',
      attempt1Root: '/a',
      execute: false,
    });
    expect(() => parseF0CCliArgs(['--v1-root', '/x'])).toThrow(/unknown argument/);
    expect(() => parseF0CCliArgs(['--v2-root', '/x'])).toThrow(/unknown argument/);
    expect(() => parseF0CCliArgs(['--all'])).toThrow(/unknown argument/);
    expect(() => parseF0CCliArgs(['--attempt-no', 'two'])).toThrow(/positive integer/);
    expect(() => parseF0CCliArgs(['--authorisation'])).toThrow(/requires a value/);
  });

  it('the default invocation verifies everything, prints the approved plan, schedules V1/V2 zero times, and calls no launcher', async () => {
    const { cliIo, out, launches } = io();
    expect(await runF0CCli([], cliIo)).toBe(0);
    const text = out.join('');
    expect(text).toContain('PLAN / READINESS ONLY');
    expect(text).toContain(`plan sha256 ${APPROVED_F0C_PLAN_SHA256}`);
    expect(text).toContain('12 logical evaluations of PROMPT_V3_CANONICAL');
    expect(text).toContain('PROMPT_V1_CANONICAL and PROMPT_V2_CANONICAL scheduled 0 times');
    expect(text).toContain('ok  OWNER_FREEZE_APPROVAL_RATIFICATION');
    expect(text).toContain('at most 61 provider requests');
    expect(text).toContain('This invocation authorised nothing');
    expect(text.match(/PROMPT_V3_CANONICAL\s+\d+\s+F /g)).toHaveLength(12);
    expect(launches()).toBe(0);
  });

  it('--json prints a deterministic plan whose SHA-256 is the approved value', async () => {
    const a = io();
    const b = io();
    expect(await runF0CCli(['--json'], a.cliIo)).toBe(0);
    expect(await runF0CCli(['--json'], b.cliIo)).toBe(0);
    expect(a.out.join('')).toBe(b.out.join(''));
    const parsed = JSON.parse(a.out.join('')) as {
      planSha256: string;
      plan: { evaluations: unknown[]; attemptNo: number };
      executionAuthorisation: string;
    };
    expect(parsed.planSha256).toBe(APPROVED_F0C_PLAN_SHA256);
    expect(parsed.plan.evaluations).toHaveLength(12);
    expect(parsed.plan.attemptNo).toBe(2);
    expect(parsed.executionAuthorisation).toBe('NOT_EVALUATED_IN_PLAN_ONLY_MODE');
    expect(f0cPlanSha256(PLAN)).toBe(APPROVED_F0C_PLAN_SHA256);
  });

  it('--execute alone, or with an authorisation but no root/output/attempt/config, is refused before any launcher', async () => {
    const a = io();
    expect(await runF0CCli(['--execute'], a.cliIo)).toBe(2);
    expect(a.err.join('')).toContain('REFUSED: attempt-2 execution requires');
    const authPath = join(SCRATCH, 'auth-incomplete.json');
    writeFileSync(authPath, JSON.stringify(validAuthorisation(SCRATCH)));
    const b = io();
    expect(await runF0CCli(['--execute', '--authorisation', authPath], b.cliIo)).toBe(2);
    expect(b.err.join('')).toContain('--v3-root');
    expect(a.launches() + b.launches()).toBe(0);
  });

  it('--attempt-no 1 (or 3) is refused: the F0C freeze configures attempt 2', async () => {
    const authPath = join(SCRATCH, 'auth-attempt.json');
    writeFileSync(authPath, JSON.stringify(validAuthorisation(SCRATCH)));
    for (const attemptNo of ['1', '3']) {
      const { cliIo, err, launches } = io();
      const code = await runF0CCli(
        [
          '--execute',
          '--authorisation',
          authPath,
          '--v3-root',
          ROOT,
          '--output-root',
          outputRoot(),
          '--attempt-no',
          attemptNo,
          '--classifier-config-dir',
          '/synthetic/profile',
        ],
        cliIo,
      );
      expect(code).toBe(2);
      expect(err.join('')).toContain('configures attempt 2');
      expect(launches()).toBe(0);
    }
  });

  it('with every argument present but the runner’s own worktree as the V3 root, the root is refused (real probes) before the lock is read', async () => {
    const authPath = join(SCRATCH, 'auth-badroot.json');
    writeFileSync(authPath, JSON.stringify(validAuthorisation(SCRATCH)));
    const { cliIo, err, launches } = io();
    const code = await runF0CCli(
      [
        '--execute',
        '--authorisation',
        authPath,
        '--v3-root',
        ROOT,
        '--output-root',
        outputRoot(),
        '--attempt-no',
        '2',
        '--classifier-config-dir',
        '/synthetic/profile',
      ],
      cliIo,
    );
    expect(code).toBe(2);
    expect(err.join('')).toContain('REFUSED: the V3 root failed verification');
    expect(err.join('')).toContain('HEAD_MATCHES_FROZEN_COMMIT');
    expect(launches()).toBe(0);
  });
});

describe.skipIf(HOST_NATIVE === null || !ON_RUN_PLATFORM)(
  '2D2C-F0D attempt-2 CLI: the execution gates, through a synthetic V3 root that passes every check',
  () => {
    const v3Root = buildSyntheticVariantRoot(join(SCRATCH, 'v3-root'), {
      variant: V3,
      freeze,
      withRepairModule: true,
    });
    const probes: VariantRootProbes = {
      realpath: (path) => realpathSync.native(path),
      isDirectory: (path) => {
        try {
          return lstatSync(path).isDirectory();
        } catch {
          return false;
        }
      },
      readFile: (path) => readFileSync(path),
      mtimeMs: (path) => {
        try {
          return statSync(path).mtimeMs;
        } catch {
          return null;
        }
      },
      ...fakeGitProbes(V3, freeze),
      loadRuntime: (root) => loadVariantRuntime(root),
    };
    const args = (authPath: string, root: string): string[] => [
      '--execute',
      '--authorisation',
      authPath,
      '--v3-root',
      v3Root,
      '--output-root',
      root,
      '--attempt-no',
      '2',
      '--classifier-config-dir',
      '/synthetic/profile',
    ];

    it('plan-only with the synthetic root reports the root VERIFIED including every repair check', async () => {
      const { cliIo, out } = io({ rootProbes: probes });
      expect(await runF0CCli(['--v3-root', v3Root], cliIo)).toBe(0);
      const text = out.join('');
      expect(text).toContain(`PROMPT_V3_CANONICAL root ${v3Root}: VERIFIED`);
      expect(text).toContain('ok  REPAIR_DEFAULT_FLOOR_CONSTANT');
      expect(text).toContain('ok  REPAIR_FLOOR_HONOURED_FROM_POLICY');
    });

    it('a NON-EMPTY output root is refused before the lock is read: attempt-2 evidence starts in a fresh namespace', async () => {
      const root = outputRoot();
      mkdirSync(join(root, 'evaluations', 'PROMPT_V1_CANONICAL'), { recursive: true });
      const authPath = join(SCRATCH, 'auth-nonempty.json');
      writeFileSync(authPath, JSON.stringify(validAuthorisation(root)));
      const { cliIo, err, launches } = io({ rootProbes: probes });
      expect(await runF0CCli(args(authPath, root), cliIo)).toBe(2);
      expect(err.join('')).toContain('ATTEMPT2_OUTPUT_ROOT_NOT_EMPTY');
      expect(launches()).toBe(0);
      expect(existsSync(join(root, 'authorisations'))).toBe(false);
    });

    it('the attempt-1 authorisation, and an authorisation naming the F0B hash, are refused by the lock; nothing is created', async () => {
      const root = outputRoot();
      const attempt1Path = join(SCRATCH, 'auth-f1.json');
      writeFileSync(
        attempt1Path,
        JSON.stringify({
          authorisationVersion: AUTHORISATION_VERSION,
          scope: 'DEVELOPMENT_ONLY',
          freezeConfigRawSha256: EXPECTED_F0B_FREEZE_RAW_SHA256,
          variants: FROZEN_VARIANTS.map((v) => ({
            name: v.name,
            label: v.label,
            gitCommit: v.gitCommit,
          })),
          maxLogicalEvaluations: 24,
          attemptNo: 1,
          outputRoot: root,
          issuedAtUtc: '2026-09-15T11:00:00.000Z',
          validUntilUtc: '2026-09-15T13:00:00.000Z',
          operatorAuthorisationStatement: AUTHORISATION_STATEMENT,
        }),
      );
      const a = io({ rootProbes: probes });
      expect(await runF0CCli(args(attempt1Path, root), a.cliIo)).toBe(2);
      expect(a.err.join('')).toContain('ATTEMPT_1_AUTHORISATION_PRESENTED');
      const f0bPath = join(SCRATCH, 'auth-f0bhash.json');
      writeFileSync(
        f0bPath,
        JSON.stringify({
          ...validAuthorisation(root),
          freezeConfigRawSha256: EXPECTED_F0B_FREEZE_RAW_SHA256,
        }),
      );
      const b = io({ rootProbes: probes });
      expect(await runF0CCli(args(f0bPath, root), b.cliIo)).toBe(2);
      expect(b.err.join('')).toContain('AUTHORISATION_MALFORMED');
      expect(a.launches() + b.launches()).toBe(0);
      expect(readdirSync(root)).toEqual([]);
    });

    it('ONLY a NEW attempt-2 authorisation naming this root drives the launcher: 12 launches, marker written; the same root cannot be reused, and the same authorisation cannot name another root', async () => {
      const root = outputRoot();
      const authPath = join(SCRATCH, 'auth-valid.json');
      writeFileSync(authPath, JSON.stringify(validAuthorisation(root)));
      const { launcher, launched } = fakeLauncher();
      const run = io({ rootProbes: probes, launcher });
      expect(await runF0CCli(args(authPath, root), run.cliIo)).toBe(0);
      expect(launched).toHaveLength(12);
      expect(
        launched.every((l) => l.variantName === 'PROMPT_V3_CANONICAL' && l.attemptNo === 2),
      ).toBe(true);
      const authSha = sha256Hex(readFileSync(authPath));
      expect(existsSync(authorisationMarkerPathOf(root, authSha))).toBe(true);
      const summary = JSON.parse(run.out.join('')) as {
        executionAuthorisation: string;
        experiment: { status: string };
      };
      expect(summary.executionAuthorisation).toBe('GRANTED_AND_CONSUMED');
      expect(summary.experiment.status).toBe('COMPLETED_ALL_PLANNED');
      // Second run into the same root: refused as non-empty, before the lock.
      const again = io({ rootProbes: probes, launcher });
      expect(await runF0CCli(args(authPath, root), again.cliIo)).toBe(2);
      expect(again.err.join('')).toContain('ATTEMPT2_OUTPUT_ROOT_NOT_EMPTY');
      // The same authorisation against a fresh root: refused, it names the other root.
      const fresh = outputRoot();
      const other = io({ rootProbes: probes, launcher });
      expect(await runF0CCli(args(authPath, fresh), other.cliIo)).toBe(2);
      expect(other.err.join('')).toContain('AUTHORISATION_OUTPUT_ROOT_MISMATCH');
      expect(launched).toHaveLength(12);
      expect(readdirSync(fresh)).toEqual([]);
    });
  },
);

// ---------------------------------------------------------------------------
// 3. The REAL child entry with an attempt-2 manifest.
// ---------------------------------------------------------------------------
const NODE_PATH_ENV = {
  PATH: process.env['PATH'] ?? '',
  HOME: process.env['HOME'] ?? '',
  TMPDIR: process.env['TMPDIR'] ?? tmpdir(),
};

describe.skipIf(IS_WINDOWS)(
  '2D2C-F0D the REAL child entry under an attempt-2 manifest (POSIX)',
  () => {
    it('boots through tsx, resolves the F0C family from the freeze bytes’ hash, and stops at its own preflight against a non-frozen root — before any provider import', async () => {
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
        parentEnv: NODE_PATH_ENV,
        variantRoots: { PROMPT_V3_CANONICAL: ROOT },
      });
      const result = await runExperiment(input);
      expect(result.halt).toMatchObject({
        kind: 'STOP_CONDITION',
        stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT',
        atSequence: 1,
      });
      expect(pids).toHaveLength(1);
      const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V3_CANONICAL', 1, 2);
      const preflight = record<{
        ok: boolean;
        stopCondition: string;
        checks: { stage: string; checks?: { id: string; ok: boolean }[] };
        providerConstructed: boolean;
      }>(dir, 'CHILD_PREFLIGHT');
      expect(preflight.ok).toBe(false);
      expect(preflight.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
      expect(preflight.providerConstructed).toBe(false);
      expect(preflight.checks.stage).toBe('variantRoot');
      expect(preflight.checks.checks?.find((c) => !c.ok)?.id).toBe('HEAD_MATCHES_FROZEN_COMMIT');
      expect(existsSync(join(dir, 'provider-outcome.json'))).toBe(false);
    }, 60_000);
  },
);

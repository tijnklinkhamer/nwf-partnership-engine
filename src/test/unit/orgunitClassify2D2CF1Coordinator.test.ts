/**
 * PHASE 2B-2D2C-F1 — the parent coordinator: sequential order, one child
 * per logical evaluation, v1 before v2, write-once attempts, the 38-field
 * final record, and STOP AFTER THE FIRST stop condition. Three layers:
 *
 *   1. the pure stop decision over both platforms' Tier-2 result shapes;
 *   2. the coordinator with a FAKE launcher that writes exactly what a child
 *      would and returns a synthetic Tier-2 result — the full stop matrix;
 *   3. the coordinator with the REAL Tier-2 harness forking scripted fixture
 *      children (POSIX; the Windows block is skipped here), plus the REAL
 *      child entry stopping at its own preflight against a root that is
 *      not a frozen worktree — proving the tsx bootstrap, the envelope
 *      manifest and the fail-before-provider path in a real process.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../orgunits/classify/constants.js';
import { computeFinalInputSha256 } from '../../orgunits/classify/finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../orgunits/classify/outputSchema.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../../orgunits/signals/score.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
import {
  HARNESS_SCRATCH_PREFIX,
  runProcessIsolatedBatch,
  validateSignalTargetPid,
  type ProcessIsolatedBatchResult,
} from '../harness/processIsolatedBatch.js';
import {
  ARTIFACT_FILE_NAMES,
  attemptDirectoryOf,
  readArtifact,
  writeArtifactOnce,
  WriteOnceCollisionError,
  type ArtifactKind,
} from '../harness/phase2b2d2c/artifacts.js';
import {
  AUTHORISATION_STATEMENT,
  AUTHORISATION_VERSION,
  type ExecutionAuthorisation,
} from '../harness/phase2b2d2c/authorisation.js';
import { reconstructAndVerifyFrozenBatches } from '../harness/phase2b2d2c/batches.js';
import { CHILD_ENTRY_PATH } from '../harness/phase2b2d2c/cli.js';
import {
  EXPECTED_F0B_FREEZE_RAW_SHA256,
  FREEZE_PATH,
  FROZEN_VARIANTS,
  REQUIRED_CAPTURE_FIELDS,
  STOP_CONDITIONS,
  type StopConditionId,
} from '../harness/phase2b2d2c/constants.js';
import {
  composeFinalRecord,
  runExperiment,
  type ChildLaunchInput,
  type ChildLauncher,
  type ExperimentInput,
} from '../harness/phase2b2d2c/coordinator.js';
import { loadDevCorpus } from '../harness/phase2b2d2c/corpus.js';
import { loadFreezeFromBytes, sha256Hex } from '../harness/phase2b2d2c/freeze.js';
import { buildExecutionPlan, type ExecutionPlan } from '../harness/phase2b2d2c/plan.js';
import {
  deriveStopDecision,
  type ChildArtifactObservation,
  type Tier2Observation,
} from '../harness/phase2b2d2c/stopConditions.js';

const IS_WINDOWS = process.platform === 'win32';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE_CHILD = join(ROOT, 'src/test/fixtures/phase2b2d2c/fixtureChild.mjs');
const { freeze, rawSha256 } = loadFreezeFromBytes(readFileSync(join(ROOT, FREEZE_PATH)));
const corpus = loadDevCorpus(freeze, { read: (relative) => readFileSync(join(ROOT, relative)) });
const PLAN = buildExecutionPlan(
  freeze,
  rawSha256,
  reconstructAndVerifyFrozenBatches(freeze, corpus.rows, {
    canonicalStringify,
    computeFinalInputSha256,
    ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
    fetchPolicyVersion: FETCH_POLICY_VERSION,
    assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
  }),
);
const MODEL = PLAN.requestedModelId;

const SCRATCH = realpathSync.native(mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f1-coord-')));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));
let outputCounter = 0;
function outputRoot(): string {
  outputCounter += 1;
  const dir = join(SCRATCH, `out-${outputCounter}`);
  mkdirSync(dir);
  return dir;
}

const AUTHORISATION: ExecutionAuthorisation = {
  authorisationVersion: AUTHORISATION_VERSION,
  scope: 'DEVELOPMENT_ONLY',
  freezeConfigRawSha256: EXPECTED_F0B_FREEZE_RAW_SHA256,
  variants: FROZEN_VARIANTS.map((v) => ({ name: v.name, label: v.label, gitCommit: v.gitCommit })),
  maxLogicalEvaluations: 24,
  attemptNo: 1,
  outputRoot: '/synthetic',
  issuedAtUtc: '2026-09-13T11:00:00.000Z',
  validUntilUtc: '2026-09-13T13:00:00.000Z',
  operatorAuthorisationStatement: AUTHORISATION_STATEMENT,
};

function experimentInput(
  overrides: Partial<ExperimentInput> & { readonly launcher: ChildLauncher },
): ExperimentInput {
  return {
    plan: PLAN,
    freezePath: join(ROOT, FREEZE_PATH),
    outputRoot: outputRoot(),
    attemptNo: 1,
    authorisation: AUTHORISATION,
    authorisationSha256: sha256Hex(`auth-${outputCounter}`),
    variantRoots: { PROMPT_V1_CANONICAL: '/synthetic/v1', PROMPT_V2_CANONICAL: '/synthetic/v2' },
    classifierConfigDir: '/synthetic/profile',
    parentEnv: { PATH: '/usr/bin', HOME: '/home/x', DATABASE_URL_ADMIN: 'postgres://never' },
    platform: 'posix',
    clock: { nowUtc: () => new Date('2026-09-13T12:00:00Z') },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Synthetic Tier-2 results and child artifacts.
// ---------------------------------------------------------------------------
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
const WATCHDOG_NO_RESPONSE = tier2({
  outcome: 'TIMED_OUT_KILLED',
  exitCode: null,
  signal: 'SIGKILL',
  gracefulShutdownRequested: true,
  gracefulPhase: { ipcRequestSent: true, groupSigtermSent: true },
  gracePhaseVerdict: 'NO_SHUTDOWN_RESPONSE',
  hardKillRequired: true,
  hardKillDisposition: 'EXECUTED',
  hardKill: { method: 'POSIX_PROCESS_GROUP_SIGKILL', delivered: true, taskkillExitCode: null },
});
const EXITED_UNCONFIRMED = tier2({
  outcome: 'TIMED_OUT_KILLED',
  gracefulShutdownRequested: true,
  gracefulPhase: { ipcRequestSent: true, groupSigtermSent: true },
  gracePhaseVerdict: 'CHILD_EXITED_UNCONFIRMED',
  exitedWithinGrace: true,
  hardKillRequired: true,
  hardKillDisposition: 'EXECUTED',
  hardKill: { method: 'POSIX_PROCESS_GROUP_SIGKILL', delivered: false, taskkillExitCode: null },
});
const WINDOWS_SUPPRESSED = tier2({
  platform: 'win32',
  outcome: 'TIMED_OUT_KILLED',
  gracefulShutdownRequested: true,
  gracefulPhase: { ipcRequestSent: true, groupSigtermSent: false },
  gracePhaseVerdict: 'CHILD_EXITED_UNCONFIRMED',
  exitedWithinGrace: true,
  hardKillRequired: true,
  hardKillDisposition: 'SUPPRESSED_EXPIRED_TARGET_IDENTITY',
  hardKillSuppressionReason: 'DIRECT_CHILD_EXIT_OBSERVED',
  posixGroupSweep: 'NOT_APPLICABLE',
});

type Behaviour = (input: ChildLaunchInput) => ProcessIsolatedBatchResult;

const rawOf = (rawOutput: unknown) => {
  const serialization = canonicalStringify(rawOutput);
  return {
    rawOutputCanonicalSerialization: serialization,
    rawOutputSha256: sha256Hex(serialization),
    rawOutputUtf8Bytes: Buffer.byteLength(serialization, 'utf8'),
  };
};
const preflightOk = (dir: string) =>
  writeArtifactOnce(dir, 'CHILD_PREFLIGHT', {
    ok: true,
    stopCondition: null,
    detail: 'fake',
    checks: [],
    providerConstructed: false,
  });
const outcomeOf = (dir: string, outcome: string, providerReportedModelId: string | null) =>
  writeArtifactOnce(dir, 'PROVIDER_OUTCOME', {
    outcome,
    providerReportedModelId,
    inputTokens: 10,
    outputTokens: 20,
    outcomeDetail: outcome === 'OK' ? null : outcome,
    internalAdapterAttemptCountWhereObservable: 1,
    authStatusInvocationsObserved: 1,
    startedAtUtc: '2026-09-13T12:00:00.000Z',
    endedAtUtc: '2026-09-13T12:00:01.000Z',
    monotonicWallTimeMs: 1000,
    tier1DiagnosticsCaptured: 0,
  });
const resultOf = (
  dir: string,
  input: ChildLaunchInput,
  outcome: string,
  providerReportedModelId: string | null,
  rawPersisted: boolean | null,
  childStopCondition: StopConditionId | null = null,
) => {
  const manifest = (
    JSON.parse(readFileSync(input.manifestPath, 'utf8')) as {
      record: { variantName: string; logicalBatchOrdinal: number; attemptNo: number };
    }
  ).record;
  writeArtifactOnce(dir, 'CHILD_RESULT', {
    variantName: manifest.variantName,
    logicalBatchOrdinal: manifest.logicalBatchOrdinal,
    attemptNo: manifest.attemptNo,
    providerOutcome: outcome,
    providerReportedModelId,
    rawCheckpointPersistedBeforeValidation: rawPersisted,
    rawBeforeValidationSequence: rawPersisted ? { persistedSeq: 1, validationStartedSeq: 2 } : null,
    childStopCondition,
    artifactHashes: {},
  });
};

const BEHAVIOURS: Record<string, Behaviour> = {
  ok: (input) => {
    preflightOk(input.attemptDir);
    writeArtifactOnce(input.attemptDir, 'RAW_OUTPUT_CHECKPOINT', rawOf({ results: [] }));
    writeArtifactOnce(input.attemptDir, 'VALIDATION_RESULT', {
      kind: 'SCHEMA_INVALID',
      detail: 'fake',
      accepted: [],
      rejected: [],
    });
    outcomeOf(input.attemptDir, 'OK', MODEL);
    resultOf(input.attemptDir, input, 'OK', MODEL, true);
    return tier2();
  },
  okWrongModel: (input) => {
    BEHAVIOURS.ok!(input);
    return tier2();
  },
  reconciledFailure: (input) => {
    preflightOk(input.attemptDir);
    outcomeOf(input.attemptDir, 'STRUCTURED_OUTPUT_FAILED', MODEL);
    resultOf(input.attemptDir, input, 'STRUCTURED_OUTPUT_FAILED', MODEL, null);
    return tier2({ exitCode: 0 });
  },
  usageLimit: (input) => {
    preflightOk(input.attemptDir);
    outcomeOf(input.attemptDir, 'USAGE_LIMIT_EXHAUSTED', null);
    resultOf(input.attemptDir, input, 'USAGE_LIMIT_EXHAUSTED', null, null);
    return tier2();
  },
  tier1Timeout: (input) => {
    preflightOk(input.attemptDir);
    writeArtifactOnce(input.attemptDir, 'TIER1_DIAGNOSTICS', {
      captureHook: 'onAttemptDiagnostics',
      attempts: [
        {
          progress: [{ stage: 'DEADLINE_EXPIRED', elapsedMs: 300000 }],
          stderrTail: 't',
          pid: null,
        },
      ],
    });
    outcomeOf(input.attemptDir, 'TIMEOUT', null);
    resultOf(input.attemptDir, input, 'TIMEOUT', null, null);
    return tier2();
  },
  rawMissing: (input) => {
    preflightOk(input.attemptDir);
    writeArtifactOnce(input.attemptDir, 'VALIDATION_RESULT', {
      kind: 'SCHEMA_INVALID',
      detail: 'fake',
      accepted: [],
      rejected: [],
    });
    outcomeOf(input.attemptDir, 'OK', MODEL);
    resultOf(input.attemptDir, input, 'OK', MODEL, false);
    return tier2();
  },
  corruptRaw: (input) => {
    BEHAVIOURS.ok!(input);
    const path = join(input.attemptDir, ARTIFACT_FILE_NAMES.RAW_OUTPUT_CHECKPOINT);
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace('"rawOutputUtf8Bytes": ', '"rawOutputUtf8Bytes": 1'),
    );
    return tier2();
  },
  driftInChild: (input) => {
    writeArtifactOnce(input.attemptDir, 'CHILD_PREFLIGHT', {
      ok: false,
      stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT',
      detail: 'fake drift',
      checks: [],
      providerConstructed: false,
    });
    return tier2({ exitCode: 2 });
  },
  isolationInChild: (input) => {
    writeArtifactOnce(input.attemptDir, 'CHILD_PREFLIGHT', {
      ok: false,
      stopCondition: 'ISOLATION_VIOLATION',
      detail: 'fake leak',
      checks: [],
      providerConstructed: false,
    });
    return tier2({ exitCode: 2 });
  },
  crashBeforeAnything: () => tier2({ exitCode: 1 }),
  crashAfterRaw: (input) => {
    preflightOk(input.attemptDir);
    writeArtifactOnce(input.attemptDir, 'RAW_OUTPUT_CHECKPOINT', rawOf({ results: [] }));
    return tier2({ exitCode: 1 });
  },
  thrown: (input) => {
    preflightOk(input.attemptDir);
    writeArtifactOnce(input.attemptDir, 'CHILD_FAILURE', {
      thrown: true,
      stopCondition: null,
      message: 'Error: boom',
    });
    return tier2({ exitCode: 1 });
  },
  watchdogNoResponse: (input) => {
    preflightOk(input.attemptDir);
    return WATCHDOG_NO_RESPONSE;
  },
  exitedUnconfirmed: (input) => {
    preflightOk(input.attemptDir);
    return EXITED_UNCONFIRMED;
  },
  windowsSuppressed: (input) => {
    preflightOk(input.attemptDir);
    return WINDOWS_SUPPRESSED;
  },
};

/** A launcher that runs `behaviours[sequence]` (default `ok`) and records the launch order. */
function fakeLauncher(behaviours: Record<number, keyof typeof BEHAVIOURS> = {}) {
  const launched: {
    sequence: number;
    variantName: string;
    ordinal: number;
    env: Record<string, string>;
  }[] = [];
  const launcher: ChildLauncher = {
    launch: async (input) => {
      const manifest = (
        JSON.parse(readFileSync(input.manifestPath, 'utf8')) as {
          record: { variantName: string; logicalBatchOrdinal: number };
        }
      ).record;
      const sequence = launched.length + 1;
      launched.push({
        sequence,
        variantName: manifest.variantName,
        ordinal: manifest.logicalBatchOrdinal,
        env: { ...input.childEnv },
      });
      expect(input.watchdogMs).toBe(700_000);
      expect(input.graceMs).toBe(10_000);
      const behaviour = BEHAVIOURS[behaviours[sequence] ?? 'ok']!;
      if (behaviours[sequence] === 'okWrongModel') {
        preflightOk(input.attemptDir);
        writeArtifactOnce(input.attemptDir, 'RAW_OUTPUT_CHECKPOINT', rawOf({ results: [] }));
        writeArtifactOnce(input.attemptDir, 'VALIDATION_RESULT', {
          kind: 'SCHEMA_INVALID',
          detail: 'fake',
          accepted: [],
          rejected: [],
        });
        outcomeOf(input.attemptDir, 'OK', `${MODEL}-other`);
        resultOf(input.attemptDir, input, 'OK', `${MODEL}-other`, true);
        return tier2();
      }
      return behaviour(input);
    },
  };
  return { launcher, launched };
}

const attemptDirs = (root: string): string[] => {
  const evaluations = join(root, 'evaluations');
  if (!existsSync(evaluations)) return [];
  return readdirSync(evaluations).flatMap((variant) =>
    readdirSync(join(evaluations, variant)).flatMap((batch) =>
      readdirSync(join(evaluations, variant, batch)).map((attempt) =>
        join(variant, batch, attempt),
      ),
    ),
  );
};
const readRecord = <T>(dir: string, kind: ArtifactKind): T => {
  const read = readArtifact<T>(dir, kind);
  if (!read.ok) throw new Error(`${kind}: ${read.detail}`);
  return read.envelope.record;
};

// ---------------------------------------------------------------------------
// 1. The pure stop decision.
// ---------------------------------------------------------------------------
describe('2D2C-F1 stop decision (pure; both platforms)', () => {
  const absent = { present: false } as const;
  const okArtifacts = (
    overrides: Partial<ChildArtifactObservation> = {},
  ): ChildArtifactObservation => ({
    preflight: { present: true, valid: true, stopCondition: null },
    failure: absent,
    result: {
      present: true,
      valid: true,
      providerOutcome: 'OK',
      providerReportedModelId: MODEL,
      rawCheckpointPersistedBeforeValidation: true,
      childStopCondition: null,
    },
    rawCheckpoint: { present: true, valid: true },
    validation: { present: true, valid: true },
    providerOutcome: { present: true, valid: true },
    tier1Diagnostics: absent,
    ...overrides,
  });
  const completed: Tier2Observation = {
    outcome: 'COMPLETED',
    gracePhaseVerdict: null,
    hardKillDisposition: 'NOT_REQUIRED',
    exitCode: 0,
    signal: null,
  };

  it('a reconciled OK does not stop; every stop condition is reachable and named exactly', () => {
    expect(
      deriveStopDecision({ tier2: completed, artifacts: okArtifacts(), requestedModelId: MODEL })
        .stop,
    ).toBe(false);
    const table: [string, Tier2Observation, ChildArtifactObservation, StopConditionId][] = [
      [
        'suppressed (win32)',
        {
          outcome: 'TIMED_OUT_KILLED',
          gracePhaseVerdict: 'CHILD_EXITED_UNCONFIRMED',
          hardKillDisposition: 'SUPPRESSED_EXPIRED_TARGET_IDENTITY',
          exitCode: 0,
          signal: null,
        },
        okArtifacts(),
        'SUPPRESSED_EXPIRED_TARGET_IDENTITY',
      ],
      [
        'exited unconfirmed (posix)',
        {
          outcome: 'TIMED_OUT_KILLED',
          gracePhaseVerdict: 'CHILD_EXITED_UNCONFIRMED',
          hardKillDisposition: 'EXECUTED',
          exitCode: 0,
          signal: null,
        },
        okArtifacts(),
        'CHILD_EXITED_UNCONFIRMED',
      ],
      [
        'watchdog, no tier-1 timeout',
        {
          outcome: 'TIMED_OUT_KILLED',
          gracePhaseVerdict: 'NO_SHUTDOWN_RESPONSE',
          hardKillDisposition: 'EXECUTED',
          exitCode: null,
          signal: 'SIGKILL',
        },
        okArtifacts({
          result: absent,
          rawCheckpoint: absent,
          validation: absent,
          providerOutcome: absent,
        }),
        'TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT',
      ],
      [
        'watchdog after cooperative ack',
        {
          outcome: 'TIMED_OUT_KILLED',
          gracePhaseVerdict: 'SHUTDOWN_CONFIRMED',
          hardKillDisposition: 'NOT_REQUIRED',
          exitCode: 3,
          signal: null,
        },
        okArtifacts({ result: absent }),
        'TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT',
      ],
      [
        'raw not persisted',
        completed,
        okArtifacts({
          result: {
            present: true,
            valid: true,
            providerOutcome: 'OK',
            providerReportedModelId: MODEL,
            rawCheckpointPersistedBeforeValidation: false,
            childStopCondition: null,
          },
          rawCheckpoint: absent,
        }),
        'RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION',
      ],
      [
        'corrupt raw',
        completed,
        okArtifacts({ rawCheckpoint: { present: true, valid: false } }),
        'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
      ],
      [
        'corrupt result',
        completed,
        okArtifacts({ result: { present: true, valid: false } }),
        'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
      ],
      [
        'partial artifacts, no result',
        completed,
        okArtifacts({ result: absent, validation: absent, providerOutcome: absent }),
        'BATCH_ARTIFACT_MISSING_OR_CORRUPT',
      ],
      [
        'drift from child preflight',
        completed,
        okArtifacts({
          preflight: { present: true, valid: true, stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT' },
        }),
        'CORPUS_CONFIG_OR_HASH_DRIFT',
      ],
      [
        'unexpected model',
        completed,
        okArtifacts({
          result: {
            present: true,
            valid: true,
            providerOutcome: 'OK',
            providerReportedModelId: 'other',
            rawCheckpointPersistedBeforeValidation: true,
            childStopCondition: null,
          },
        }),
        'UNEXPECTED_RESPONSE_MODEL_ID',
      ],
      [
        'isolation from child preflight',
        completed,
        okArtifacts({
          preflight: { present: true, valid: true, stopCondition: 'ISOLATION_VIOLATION' },
        }),
        'ISOLATION_VIOLATION',
      ],
      [
        'usage limit',
        completed,
        okArtifacts({
          result: {
            present: true,
            valid: true,
            providerOutcome: 'USAGE_LIMIT_EXHAUSTED',
            providerReportedModelId: null,
            rawCheckpointPersistedBeforeValidation: null,
            childStopCondition: null,
          },
          rawCheckpoint: absent,
          validation: absent,
        }),
        'USAGE_LIMIT_INTERRUPTION',
      ],
      [
        'nothing left behind',
        { ...completed, exitCode: 1 },
        okArtifacts({
          result: absent,
          rawCheckpoint: absent,
          validation: absent,
          providerOutcome: absent,
        }),
        'UNRECONCILED_PROVIDER_FAILURE',
      ],
      [
        'thrown',
        { ...completed, exitCode: 1 },
        okArtifacts({
          failure: { present: true, valid: true, stopCondition: null },
          result: absent,
          rawCheckpoint: absent,
          validation: absent,
          providerOutcome: absent,
        }),
        'UNRECONCILED_PROVIDER_FAILURE',
      ],
    ];
    const seen = new Set<StopConditionId>();
    for (const [name, tier2Observation, artifacts, expected] of table) {
      const decision = deriveStopDecision({
        tier2: tier2Observation,
        artifacts,
        requestedModelId: MODEL,
      });
      expect(decision.stop, name).toBe(true);
      expect(decision.stopCondition, name).toBe(expected);
      seen.add(expected);
    }
    expect([...seen].sort()).toEqual([...STOP_CONDITIONS].sort());
  });

  it('a Tier-1 TIMEOUT with persisted diagnostics halts by the decision rule, not by a stop condition; other reconciled failures continue', () => {
    const timeout = deriveStopDecision({
      tier2: completed,
      artifacts: okArtifacts({
        result: {
          present: true,
          valid: true,
          providerOutcome: 'TIMEOUT',
          providerReportedModelId: null,
          rawCheckpointPersistedBeforeValidation: null,
          childStopCondition: null,
        },
        rawCheckpoint: absent,
        validation: absent,
        tier1Diagnostics: { present: true, valid: true },
      }),
      requestedModelId: MODEL,
    });
    expect(timeout).toMatchObject({
      stop: true,
      stopCondition: null,
      haltKind: 'TIER1_TIMEOUT_DECISION_RULE',
    });
    expect(timeout.detail).toContain('attemptNo + 1');
    const noDiagnostics = deriveStopDecision({
      tier2: completed,
      artifacts: okArtifacts({
        result: {
          present: true,
          valid: true,
          providerOutcome: 'TIMEOUT',
          providerReportedModelId: null,
          rawCheckpointPersistedBeforeValidation: null,
          childStopCondition: null,
        },
        rawCheckpoint: absent,
        validation: absent,
      }),
      requestedModelId: MODEL,
    });
    expect(noDiagnostics.stopCondition).toBe('BATCH_ARTIFACT_MISSING_OR_CORRUPT');
    for (const outcome of [
      'AUTH_FAILURE',
      'PROVIDER_TRANSIENT',
      'PROVIDER_REFUSAL',
      'STRUCTURED_OUTPUT_FAILED',
    ] as const) {
      const decision = deriveStopDecision({
        tier2: completed,
        artifacts: okArtifacts({
          result: {
            present: true,
            valid: true,
            providerOutcome: outcome,
            providerReportedModelId: null,
            rawCheckpointPersistedBeforeValidation: null,
            childStopCondition: null,
          },
          rawCheckpoint: absent,
          validation: absent,
        }),
        requestedModelId: MODEL,
      });
      expect(decision.stop, outcome).toBe(false);
    }
    // The unconfirmed-termination verdicts win over everything else, on both platforms.
    for (const platformResult of [WINDOWS_SUPPRESSED, EXITED_UNCONFIRMED]) {
      const decision = deriveStopDecision({
        tier2: {
          outcome: platformResult.outcome,
          gracePhaseVerdict: platformResult.gracePhaseVerdict,
          hardKillDisposition: platformResult.hardKillDisposition,
          exitCode: platformResult.exitCode,
          signal: platformResult.signal,
        },
        artifacts: okArtifacts(),
        requestedModelId: MODEL,
      });
      expect(decision.stopCondition).toBe(
        platformResult.hardKillDisposition === 'SUPPRESSED_EXPIRED_TARGET_IDENTITY'
          ? 'SUPPRESSED_EXPIRED_TARGET_IDENTITY'
          : 'CHILD_EXITED_UNCONFIRMED',
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The coordinator with a fake launcher.
// ---------------------------------------------------------------------------
describe('2D2C-F1 coordinator with a fake launcher', () => {
  it('runs all 24 in the frozen order, one child each, v1 then v2, and writes a 38-field final record per attempt', async () => {
    const { launcher, launched } = fakeLauncher();
    const input = experimentInput({ launcher });
    const result = await runExperiment(input);
    expect(result.status).toBe('COMPLETED_ALL_PLANNED');
    expect(result.evaluationsStarted).toBe(24);
    expect(result.perVariantEndedWithoutStop).toEqual({
      PROMPT_V1_CANONICAL: 12,
      PROMPT_V2_CANONICAL: 12,
    });
    expect(launched.map((l) => `${l.variantName}:${l.ordinal}`)).toEqual(
      PLAN.evaluations.map((e) => `${e.variantName}:${e.logicalBatchOrdinal}`),
    );
    expect(
      launched.every(
        (l) =>
          l.env['NWF_PE_CLASSIFIER_CONFIG_DIR'] === '/synthetic/profile' &&
          !('DATABASE_URL_ADMIN' in l.env),
      ),
    ).toBe(true);
    expect(attemptDirs(input.outputRoot)).toHaveLength(24);
    for (const evaluation of PLAN.evaluations) {
      const dir = attemptDirectoryOf(
        input.outputRoot,
        evaluation.variantName,
        evaluation.logicalBatchOrdinal,
        1,
      );
      const final = readRecord<Record<string, unknown>>(dir, 'FINAL_RECORD');
      for (const field of REQUIRED_CAPTURE_FIELDS) expect(field in final, field).toBe(true);
      expect(final['finalInputSha256']).toBe(evaluation.finalInputSha256);
      expect(final['providerReportedModelId']).toBe(MODEL);
      expect(final['cacheUsageWhereExposed']).toBeNull();
      expect((final['fieldAvailability'] as Record<string, string>)['cacheUsageWhereExposed']).toBe(
        'NOT_EXPOSED_BY_RUNNER_SEAM',
      );
      expect(final['tier2HardKillDisposition']).toBe('NOT_REQUIRED');
      expect(readRecord<{ stop: boolean }>(dir, 'STOP_DECISION').stop).toBe(false);
      for (const kind of ['PLANNED_INPUT', 'CHILD_MANIFEST', 'TIER2_OUTCOME'] as const)
        expect(readArtifact(dir, kind).ok, kind).toBe(true);
    }
    expect(existsSync(join(result.experimentDir, ARTIFACT_FILE_NAMES.EXPERIMENT_COMPLETION))).toBe(
      true,
    );
    expect(existsSync(join(result.experimentDir, ARTIFACT_FILE_NAMES.EXPERIMENT_STOP))).toBe(false);
    expect(
      existsSync(join(input.outputRoot, 'authorisations', `${input.authorisationSha256}.json`)),
    ).toBe(true);
  });

  it('stops after the FIRST stop condition: no later batch starts and prompt v2 never starts', async () => {
    const { launcher, launched } = fakeLauncher({ 3: 'usageLimit' });
    const input = experimentInput({ launcher });
    const result = await runExperiment(input);
    expect(result.status).toBe('STOPPED');
    expect(result.halt).toMatchObject({
      kind: 'STOP_CONDITION',
      stopCondition: 'USAGE_LIMIT_INTERRUPTION',
      atSequence: 3,
    });
    expect(launched).toHaveLength(3);
    expect(attemptDirs(input.outputRoot)).toHaveLength(3);
    expect(attemptDirs(input.outputRoot).some((d) => d.startsWith('PROMPT_V2_CANONICAL'))).toBe(
      false,
    );
    expect(
      readRecord<{ stopCondition: string }>(result.experimentDir, 'EXPERIMENT_STOP').stopCondition,
    ).toBe('USAGE_LIMIT_INTERRUPTION');
    expect(existsSync(join(result.experimentDir, ARTIFACT_FILE_NAMES.EXPERIMENT_COMPLETION))).toBe(
      false,
    );
  });

  it('a stop on the twelfth v1 batch means zero v2 attempts; a stop on the first v2 batch leaves exactly 13', async () => {
    const twelfth = fakeLauncher({ 12: 'watchdogNoResponse' });
    const a = await runExperiment(experimentInput({ launcher: twelfth.launcher }));
    expect(a.halt).toMatchObject({
      stopCondition: 'TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT',
      atSequence: 12,
    });
    expect(twelfth.launched.filter((l) => l.variantName === 'PROMPT_V2_CANONICAL')).toHaveLength(0);
    const thirteenth = fakeLauncher({ 13: 'exitedUnconfirmed' });
    const b = await runExperiment(experimentInput({ launcher: thirteenth.launcher }));
    expect(b.halt).toMatchObject({ stopCondition: 'CHILD_EXITED_UNCONFIRMED', atSequence: 13 });
    expect(thirteenth.launched).toHaveLength(13);
    expect(b.perVariantEndedWithoutStop).toEqual({
      PROMPT_V1_CANONICAL: 12,
      PROMPT_V2_CANONICAL: 0,
    });
  });

  it.each([
    ['okWrongModel', 'UNEXPECTED_RESPONSE_MODEL_ID'],
    ['rawMissing', 'RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION'],
    ['corruptRaw', 'BATCH_ARTIFACT_MISSING_OR_CORRUPT'],
    ['crashAfterRaw', 'BATCH_ARTIFACT_MISSING_OR_CORRUPT'],
    ['crashBeforeAnything', 'UNRECONCILED_PROVIDER_FAILURE'],
    ['thrown', 'UNRECONCILED_PROVIDER_FAILURE'],
    ['driftInChild', 'CORPUS_CONFIG_OR_HASH_DRIFT'],
    ['isolationInChild', 'ISOLATION_VIOLATION'],
    ['usageLimit', 'USAGE_LIMIT_INTERRUPTION'],
    ['watchdogNoResponse', 'TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT'],
    ['exitedUnconfirmed', 'CHILD_EXITED_UNCONFIRMED'],
    ['windowsSuppressed', 'SUPPRESSED_EXPIRED_TARGET_IDENTITY'],
  ] as const)(
    'behaviour %s at sequence 2 stops the experiment with %s and only two attempts exist',
    async (behaviour, expected) => {
      const { launcher, launched } = fakeLauncher({ 2: behaviour });
      const input = experimentInput({ launcher });
      const result = await runExperiment(input);
      expect(result.halt).toMatchObject({
        kind: 'STOP_CONDITION',
        stopCondition: expected,
        atSequence: 2,
      });
      expect(launched).toHaveLength(2);
      expect(attemptDirs(input.outputRoot)).toHaveLength(2);
      const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V1_CANONICAL', 2, 1);
      const final = readRecord<Record<string, unknown>>(dir, 'FINAL_RECORD');
      expect((final['stopDecision'] as { stopCondition: string }).stopCondition).toBe(expected);
      if (behaviour === 'windowsSuppressed') {
        // A suppressed hard kill never looks attempted or delivered.
        expect(final['tier2HardKillDisposition']).toBe('SUPPRESSED_EXPIRED_TARGET_IDENTITY');
        expect(
          (
            final['tier2CleanupResult'] as {
              hardKillRecord: unknown;
              hardKillSuppressionReason: string;
            }
          ).hardKillRecord,
        ).toBeNull();
        expect(
          (final['tier2CleanupResult'] as { hardKillSuppressionReason: string })
            .hardKillSuppressionReason,
        ).toBe('DIRECT_CHILD_EXIT_OBSERVED');
      }
      if (behaviour === 'crashBeforeAnything') {
        // Nothing was synthesized for a child that left nothing behind.
        for (const field of [
          'providerOutcome',
          'rawOutputSha256',
          'validatorAcceptedRecords',
          'startedAtUtc',
        ] as const)
          expect(final[field], field).toBeNull();
        expect((final['fieldAvailability'] as Record<string, string>)['providerOutcome']).toBe(
          'NOT_OBSERVED_CHILD_LEFT_NO_RECORD',
        );
      }
    },
  );

  it('a Tier-1 TIMEOUT halts by the decision rule; a reconciled provider failure continues to the next batch', async () => {
    const timeout = fakeLauncher({ 4: 'tier1Timeout' });
    const a = await runExperiment(experimentInput({ launcher: timeout.launcher }));
    expect(a.halt).toMatchObject({ kind: 'TIER1_TIMEOUT_DECISION_RULE', atSequence: 4 });
    expect(timeout.launched).toHaveLength(4);
    const reconciled = fakeLauncher({ 5: 'reconciledFailure' });
    const b = await runExperiment(experimentInput({ launcher: reconciled.launcher }));
    expect(b.status).toBe('COMPLETED_ALL_PLANNED');
    expect(reconciled.launched).toHaveLength(24);
  });

  it('an existing attempt directory is a write-once refusal before any launch; a consumed authorisation is refused before anything', async () => {
    const { launcher, launched } = fakeLauncher();
    const input = experimentInput({ launcher });
    mkdirSync(attemptDirectoryOf(input.outputRoot, 'PROMPT_V1_CANONICAL', 2, 1), {
      recursive: true,
    });
    const result = await runExperiment(input);
    expect(result.halt).toMatchObject({ kind: 'WRITE_ONCE_REFUSAL', atSequence: 2 });
    expect(launched).toHaveLength(1);
    const again = experimentInput({
      launcher,
      outputRoot: input.outputRoot,
      authorisationSha256: input.authorisationSha256,
    });
    await expect(runExperiment(again)).rejects.toBeInstanceOf(WriteOnceCollisionError);
    expect(launched).toHaveLength(1);
    // A different attempt number under the same root is a new, separate identity.
    const attempt2 = experimentInput({
      launcher,
      outputRoot: input.outputRoot,
      attemptNo: 2,
      authorisationSha256: sha256Hex('another authorisation'),
    });
    expect((await runExperiment(attempt2)).status).toBe('COMPLETED_ALL_PLANNED');
    expect(attemptDirs(input.outputRoot).filter((d) => d.endsWith('attempt-2'))).toHaveLength(24);
  });

  it('composeFinalRecord carries exactly the 38 frozen names plus the closed runner extras, and never a fabricated value', () => {
    const evaluation = PLAN.evaluations[0]!;
    const final = composeFinalRecord({
      plan: PLAN,
      evaluation,
      attemptNo: 1,
      artifacts: { observation: {} as never, records: {}, hashes: {} },
      tier2: tier2({ exitCode: 1 }),
      stopDecision: {
        stop: true,
        stopCondition: 'UNRECONCILED_PROVIDER_FAILURE',
        haltKind: 'STOP_CONDITION',
        detail: 'x',
      },
      scratchDirRemoved: true,
    });
    const keys = Object.keys(final).sort();
    expect(keys).toEqual(
      [
        ...REQUIRED_CAPTURE_FIELDS,
        'runnerRecordVersion',
        'variantLabel',
        'fieldAvailability',
        'artifactHashes',
        'stopDecision',
        'repairRound', // ADR 0011: null on every attempt that performed no repair round
      ].sort(),
    );
    expect(final.providerOutcome).toBeNull();
    expect(final.rawOutputCanonicalSerialization).toBeNull();
    expect(final.tier1ProgressTraceOnTimeout).toBeNull();
    expect(final.attemptNo).toBe(1);
    expect(final.variantLabel).toBe('PROMPT_V1_COMPARATOR');
  });
});

// ---------------------------------------------------------------------------
// 3. Real fixture children through the real Tier-2 harness (POSIX here).
// ---------------------------------------------------------------------------
const spawnedPids = new Set<number>();
function isAlive(pid: number): boolean {
  try {
    process.kill(validateSignalTargetPid(pid), 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
afterEach(async () => {
  for (const pid of spawnedPids) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // gone
    }
  }
  spawnedPids.clear();
});
const harnessScratchEntries = (): string[] =>
  readdirSync(tmpdir()).filter((entry) => entry.startsWith(HARNESS_SCRATCH_PREFIX));
const LEAK_CHECKED = ['Timeout', 'ProcessWrap'];
const activeResources = (): Record<string, number> => {
  const counts: Record<string, number> = Object.fromEntries(LEAK_CHECKED.map((k) => [k, 0]));
  for (const kind of process.getActiveResourcesInfo()) if (kind in counts) counts[kind]! += 1;
  return counts;
};
let scratchBefore: string[] = [];
let resourcesBefore: Record<string, number> = {};
beforeAll(() => {
  scratchBefore = harnessScratchEntries();
  resourcesBefore = activeResources();
});
afterAll(() => {
  expect(harnessScratchEntries().sort()).toEqual(scratchBefore.sort());
  expect(activeResources()).toEqual(resourcesBefore);
});

function fixtureLauncher(behaviour: string, timing = { watchdogMs: 1_500, graceMs: 1_000 }) {
  const pids: number[] = [];
  const launcher: ChildLauncher = {
    launch: (input) =>
      runProcessIsolatedBatch({
        modulePath: FIXTURE_CHILD,
        args: [behaviour, '--manifest', input.manifestPath],
        watchdogMs: timing.watchdogMs,
        graceMs: timing.graceMs,
        childEnv: input.childEnv,
        onChildSpawned: (pid) => {
          pids.push(pid);
          spawnedPids.add(pid);
        },
      }),
  };
  return { launcher, pids };
}
/** The first two v1 evaluations only — enough to prove "the next batch starts" or "does not". */
const TWO_EVALUATIONS: ExecutionPlan = {
  ...PLAN,
  plannedLogicalEvaluations: 2,
  evaluations: PLAN.evaluations.slice(0, 2),
};
const NODE_PATH_ENV = {
  PATH: process.env['PATH'] ?? '',
  HOME: process.env['HOME'] ?? '',
  TMPDIR: process.env['TMPDIR'] ?? tmpdir(),
};

describe.skipIf(IS_WINDOWS)('2D2C-F1 coordinator with real fixture children (POSIX)', () => {
  it('two children that complete OK run one after the other; every process and scratch directory is gone afterwards', async () => {
    const { launcher, pids } = fixtureLauncher('completes-ok');
    const input = experimentInput({ launcher, plan: TWO_EVALUATIONS, parentEnv: NODE_PATH_ENV });
    const result = await runExperiment(input);
    expect(result.status).toBe('COMPLETED_ALL_PLANNED');
    expect(pids).toHaveLength(2);
    expect(pids.every((pid) => !isAlive(pid))).toBe(true);
    const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V1_CANONICAL', 1, 1);
    expect(
      readRecord<{ tier2Outcome: string; providerOutcome: string }>(dir, 'FINAL_RECORD'),
    ).toMatchObject({ tier2Outcome: 'COMPLETED', providerOutcome: 'OK' });
    expect(readRecord<{ scratchDirRemoved: boolean }>(dir, 'TIER2_OUTCOME').scratchDirRemoved).toBe(
      true,
    );
  });

  it.each([
    ['crashes-before-raw', 'UNRECONCILED_PROVIDER_FAILURE'],
    ['crashes-after-raw', 'BATCH_ARTIFACT_MISSING_OR_CORRUPT'],
    ['completes-wrong-model', 'UNEXPECTED_RESPONSE_MODEL_ID'],
    ['never-exits', 'TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT'],
    ['cooperative-hang', 'TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT'],
    ['exits-without-ack', 'CHILD_EXITED_UNCONFIRMED'],
  ] as const)(
    'a real child that %s stops the experiment with %s and no second child is forked',
    async (behaviour, expected) => {
      const { launcher, pids } = fixtureLauncher(behaviour);
      const input = experimentInput({ launcher, plan: TWO_EVALUATIONS, parentEnv: NODE_PATH_ENV });
      const result = await runExperiment(input);
      expect(result.halt).toMatchObject({
        kind: 'STOP_CONDITION',
        stopCondition: expected,
        atSequence: 1,
      });
      expect(pids).toHaveLength(1);
      expect(isAlive(pids[0]!)).toBe(false);
      expect(attemptDirs(input.outputRoot)).toHaveLength(1);
      const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V1_CANONICAL', 1, 1);
      const tier2Record = readRecord<{
        outcome: string;
        gracePhaseVerdict: string | null;
        hardKillDisposition: string;
        scratchDirRemoved: boolean;
      }>(dir, 'TIER2_OUTCOME');
      expect(tier2Record.scratchDirRemoved).toBe(true);
      if (behaviour === 'never-exits')
        expect(tier2Record).toMatchObject({
          outcome: 'TIMED_OUT_KILLED',
          gracePhaseVerdict: 'NO_SHUTDOWN_RESPONSE',
          hardKillDisposition: 'EXECUTED',
        });
      if (behaviour === 'cooperative-hang')
        expect(tier2Record).toMatchObject({
          outcome: 'TIMED_OUT_KILLED',
          gracePhaseVerdict: 'SHUTDOWN_CONFIRMED',
          hardKillDisposition: 'NOT_REQUIRED',
        });
      if (behaviour === 'exits-without-ack')
        expect(tier2Record).toMatchObject({
          gracePhaseVerdict: 'CHILD_EXITED_UNCONFIRMED',
          hardKillDisposition: 'EXECUTED',
        });
    },
  );

  it('the REAL child entry boots through tsx, reads the envelope manifest, and stops at its own preflight against a non-frozen root — before any provider import', async () => {
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
            spawnedPids.add(pid);
          },
        }),
    };
    // The runner's own worktree is not a frozen variant worktree: HEAD is not the frozen commit.
    const input = experimentInput({
      launcher,
      plan: TWO_EVALUATIONS,
      parentEnv: NODE_PATH_ENV,
      variantRoots: { PROMPT_V1_CANONICAL: ROOT, PROMPT_V2_CANONICAL: ROOT },
    });
    const result = await runExperiment(input);
    expect(result.halt).toMatchObject({
      kind: 'STOP_CONDITION',
      stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT',
      atSequence: 1,
    });
    expect(pids).toHaveLength(1);
    const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V1_CANONICAL', 1, 1);
    const preflight = readRecord<{
      ok: boolean;
      stopCondition: string;
      checks: { stage: string; checks: { id: string; ok: boolean }[] };
      providerConstructed: boolean;
    }>(dir, 'CHILD_PREFLIGHT');
    expect(preflight.ok).toBe(false);
    expect(preflight.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect(preflight.providerConstructed).toBe(false);
    expect(preflight.checks.stage).toBe('variantRoot');
    // The runner's own worktree passes the repository check and fails on HEAD: it is not the frozen commit.
    expect(preflight.checks.checks.find((c) => !c.ok)?.id).toBe('HEAD_MATCHES_FROZEN_COMMIT');
    expect(readRecord<{ exitCode: number; outcome: string }>(dir, 'TIER2_OUTCOME')).toMatchObject({
      exitCode: 2,
      outcome: 'COMPLETED',
    });
    expect(existsSync(join(dir, ARTIFACT_FILE_NAMES.PROVIDER_OUTCOME))).toBe(false);
  });

  it('the REAL child entry refuses an environment leak first: ISOLATION_VIOLATION with no root check and no provider import', async () => {
    const pids: number[] = [];
    const launcher: ChildLauncher = {
      launch: (input) =>
        runProcessIsolatedBatch({
          modulePath: CHILD_ENTRY_PATH,
          args: ['--manifest', input.manifestPath],
          watchdogMs: 20_000,
          graceMs: 1_000,
          childEnv: { ...input.childEnv, NODE_OPTIONS: '--no-warnings' },
          onChildSpawned: (pid) => {
            pids.push(pid);
            spawnedPids.add(pid);
          },
        }),
    };
    const input = experimentInput({
      launcher,
      plan: TWO_EVALUATIONS,
      parentEnv: NODE_PATH_ENV,
      variantRoots: { PROMPT_V1_CANONICAL: ROOT, PROMPT_V2_CANONICAL: ROOT },
    });
    const result = await runExperiment(input);
    expect(result.halt).toMatchObject({ stopCondition: 'ISOLATION_VIOLATION', atSequence: 1 });
    const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V1_CANONICAL', 1, 1);
    expect(
      readRecord<{ detail: string; checks: unknown }>(dir, 'CHILD_PREFLIGHT').detail,
    ).toContain('NODE_OPTIONS');
  });
});

// ---------------------------------------------------------------------------
// 4. Real Windows processes — executed only on Windows; skipped explicitly here.
// ---------------------------------------------------------------------------
describe.runIf(IS_WINDOWS)('2D2C-F1 coordinator with real fixture children (Windows)', () => {
  it('a real child that exits without acknowledging is SUPPRESSED_EXPIRED_TARGET_IDENTITY on Windows (R2B), and stops the experiment', async () => {
    const { launcher } = fixtureLauncher('exits-without-ack', {
      watchdogMs: 1_500,
      graceMs: 600_000,
    });
    const input = experimentInput({
      launcher,
      plan: TWO_EVALUATIONS,
      platform: 'win32',
      parentEnv: {
        Path: process.env['Path'] ?? process.env['PATH'] ?? '',
        SystemRoot: process.env['SystemRoot'] ?? '',
        TEMP: process.env['TEMP'] ?? tmpdir(),
      },
    });
    const result = await runExperiment(input);
    expect(result.halt).toMatchObject({
      stopCondition: 'SUPPRESSED_EXPIRED_TARGET_IDENTITY',
      atSequence: 1,
    });
    const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V1_CANONICAL', 1, 1);
    expect(
      readRecord<{ hardKill: unknown; hardKillSuppressionReason: string }>(dir, 'TIER2_OUTCOME'),
    ).toMatchObject({ hardKill: null, hardKillSuppressionReason: 'DIRECT_CHILD_EXIT_OBSERVED' });
  });
});

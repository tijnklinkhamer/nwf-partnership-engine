/**
 * PHASE 2B-2D2C-F0X — the study executor: frozen order, the
 * all-ten-before-the-first-child property, a live re-check immediately
 * before each slot's consumption, and the physical (real child process,
 * real Tier-2 harness, zero real provider) dispatch proof for one V4 slot
 * and one V5 slot through the FULL composed-executor chain.
 *
 * `F0V_STUDY_ROOT` is mocked to a temporary directory for this file's
 * whole module graph, exactly as in `orgunitClassify2D2CF0XComposedGate`
 * — the real frozen root (which now holds the preserved first real F0X
 * study invocation) is never written, and this file proves it by hash.
 *
 * ZERO-INFERENCE EXECUTION-RECOVERY CORRECTION: progression now follows the
 * slot's own preserved evidence, never the mere return of `runExperiment`.
 * A fake launcher that leaves no child artifact is therefore NOT Class C
 * (the study pauses at slot 1), and the ten-slot happy path uses a fake
 * launcher that writes the artifacts a child writes only after a provider
 * call returned.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type * as FreezeF0VModule from '../harness/phase2b2d2c/f0v/freezeF0V.js';

vi.mock('../harness/phase2b2d2c/f0v/freezeF0V.js', async (importOriginal) => {
  const { mkdtempSync, realpathSync: realpath } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join: joinPath } = await import('node:path');
  const root = realpath.native(mkdtempSync(joinPath(tmpdir(), 'nwf-pe-f0x-executor-root-')));
  const actual = await importOriginal<typeof FreezeF0VModule>();
  return { ...actual, F0V_STUDY_ROOT: root };
});

import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { snapshotTreeSha256 } from '../helpers/treeSnapshot.js';
import { attemptDirectoryOf, writeArtifactOnce } from '../harness/phase2b2d2c/artifacts.js';
import { CHILD_ENTRY_PATH } from '../harness/phase2b2d2c/cli.js';
import type { ChildLauncher } from '../harness/phase2b2d2c/coordinator.js';
import { runProcessIsolatedBatch } from '../harness/processIsolatedBatch.js';
import type { ProcessIsolatedBatchResult } from '../harness/processIsolatedBatch.js';
import {
  ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT4_MAX_PROVIDER_REQUESTS,
} from '../harness/phase2b2d2c/f0o/authorisationF0O.js';
import {
  buildF0IExecutionPlan,
  F0I_FREEZE_PATH,
  loadF0IFreezeFromBytes,
} from '../harness/phase2b2d2c/f0i/freezeF0I.js';
import {
  buildF0OExecutionPlan,
  F0O_FREEZE_PATH,
  loadF0OFreezeFromBytes,
} from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import {
  F0U_METHODOLOGY_RAW_SHA256,
  F0V_APPROVAL_RECORD_RAW_SHA256,
  F0V_FREEZE_PATH,
  F0V_STUDY_ROOT,
  PROPOSED_F0V_FREEZE_RAW_SHA256,
  PROPOSED_F0V_PLAN_SHA256,
} from '../harness/phase2b2d2c/f0v/freezeF0V.js';
import {
  F0V_SLOTS,
  futureOutputRootPathOf,
  sha256Hex,
  type StudySlotIdentity,
} from '../harness/phase2b2d2c/f0v/studyPlanCore.js';
import {
  buildF0WSlotAuthorisationStatement,
  F0W_SLOT_AUTHORISATION_VERSION,
  type F0WSlotExecutionAuthorisation,
} from '../harness/phase2b2d2c/f0w/authorisationF0W.js';
import { historicalIdentityOf } from '../harness/phase2b2d2c/f0w/slotExecutionPlan.js';
import {
  loadStudySlotRegistry,
  type StudySlotRegistry,
} from '../harness/phase2b2d2c/f0w/slotRegistry.js';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../orgunits/classify/repair.js';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../harness/phase2b2d2c/constants.js';
import {
  buildF0XStudyExecutionApprovalStatement,
  F0X_STUDY_EXECUTION_APPROVAL_VERSION,
  type F0XStudyExecutionApproval,
} from '../harness/phase2b2d2c/f0x/studyExecutionApprovalF0X.js';
import { runReplicationStudyExecution } from '../harness/phase2b2d2c/f0x/studyExecutor.js';
import {
  isConsumedByOuterSlotIdentity,
  outerSlotIdentityPathOf,
} from '../harness/phase2b2d2c/f0x/outerSlotIdentity.js';
import { isAuthorisationConsumed } from '../harness/phase2b2d2c/coordinator.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REAL_F0V_STUDY_ROOT_STRING =
  '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/replication-v4-v5-n5';
/** The real root holds preserved evidence; this file must never write there. */
const REAL_STUDY_ROOT_AT_LOAD = snapshotTreeSha256(REAL_F0V_STUDY_ROOT_STRING);
const FIXED_HEAD = 'a'.repeat(40);
const APPROVAL_SHA = F0V_APPROVAL_RECORD_RAW_SHA256 as string;

const registry: StudySlotRegistry = loadStudySlotRegistry(
  readFileSync(join(ROOT, F0V_FREEZE_PATH)),
);
const f0i = loadF0IFreezeFromBytes(readFileSync(join(ROOT, F0I_FREEZE_PATH)));
const f0o = loadF0OFreezeFromBytes(readFileSync(join(ROOT, F0O_FREEZE_PATH)));
const F0I_PLAN = buildF0IExecutionPlan(f0i.freeze, f0i.rawSha256);
const F0O_PLAN = buildF0OExecutionPlan(f0o.freeze, f0o.rawSha256);

let outputCounter = 0;
function freshDir(): string {
  outputCounter += 1;
  const dir = join(F0V_STUDY_ROOT, `scratch-${outputCounter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

afterAll(() => {
  rmSync(F0V_STUDY_ROOT, { recursive: true, force: true });
});

function slotOutputRoot(slot: StudySlotIdentity): string {
  return futureOutputRootPathOf(F0V_STUDY_ROOT, slot);
}

afterEach(() => {
  for (const slot of F0V_SLOTS) rmSync(slotOutputRoot(slot), { recursive: true, force: true });
  rmSync(join(F0V_STUDY_ROOT, 'study-manifest.json'), { force: true });
  rmSync(join(F0V_STUDY_ROOT, 'study-terminal.json'), { force: true });
  rmSync(join(F0V_STUDY_ROOT, 'study-events'), { recursive: true, force: true });
});

function buildValidCandidate(
  slot: StudySlotIdentity,
  overrides: Partial<F0WSlotExecutionAuthorisation> = {},
): F0WSlotExecutionAuthorisation {
  const identity = historicalIdentityOf(slot.variantName);
  return {
    authorisationVersion: F0W_SLOT_AUTHORISATION_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: 'REPLICATION_V4_V5_N5',
    f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
    f0vPlanSha256: PROPOSED_F0V_PLAN_SHA256,
    f0vApprovalRecordRawSha256: APPROVAL_SHA,
    f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
    slotId: slot.slotId,
    sequence: slot.sequence,
    pairNumber: slot.pairNumber,
    variantName: slot.variantName,
    sourceHistoricalFreezeRawSha256: identity.historicalFreezeRawSha256,
    sourceHistoricalPlanSha256: identity.historicalPlanSha256,
    runtimeCommit: identity.runtimeCommit,
    promptVersion: identity.promptVersion,
    promptSha256: identity.promptSha256,
    historicalAttemptNo: identity.historicalAttemptNo,
    maxLogicalEvaluations: EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
    frozenLogicalBatchOrdinals: Array.from(
      { length: EXPECTED_LOGICAL_BATCHES_PER_VARIANT },
      (_, i) => i + 1,
    ),
    maxProviderRequests: ATTEMPT4_MAX_PROVIDER_REQUESTS,
    maxAdapterAttempts: ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
    repairPolicy: {
      enabled: true,
      maxRoundsPerLogicalEvaluation: 1,
      minimumRemainingBudgetMs: REPAIR_MINIMUM_REMAINING_BUDGET_MS,
    },
    prohibitions: {
      holdout: 'NONE',
      goldLabelChanges: 'NONE',
      thresholdChanges: 'NONE',
      promptChanges: 'NONE',
      databaseWrites: 'NONE',
      migrationWrites: 'NONE',
      v6OrFutureVariantScheduling: 'NONE',
      otherSlotExecution: 'NONE',
    },
    outputRoot: slotOutputRoot(slot),
    issuedAtUtc: '2026-09-01T00:00:00.000Z',
    validUntilUtc: '2026-12-01T00:00:00.000Z',
    operatorAuthorisationStatement: buildF0WSlotAuthorisationStatement(slot),
    ...overrides,
  };
}

function candidateBytesOf(
  slot: StudySlotIdentity,
  overrides: Partial<F0WSlotExecutionAuthorisation> = {},
): Buffer {
  return Buffer.from(JSON.stringify(buildValidCandidate(slot, overrides), null, 2));
}

function writeCandidateFile(
  dir: string,
  slot: StudySlotIdentity,
  overrides: Partial<F0WSlotExecutionAuthorisation> = {},
): string {
  const path = join(dir, `${slot.slotId}.json`);
  writeFileSync(path, candidateBytesOf(slot, overrides));
  return path;
}

function buildValidApproval(
  slots: readonly StudySlotIdentity[] = F0V_SLOTS,
  perSlotOverrides: ReadonlyMap<string, Partial<F0WSlotExecutionAuthorisation>> = new Map(),
): F0XStudyExecutionApproval {
  const slotEntries = slots.map((slot) => {
    const bytes = candidateBytesOf(slot, perSlotOverrides.get(slot.slotId) ?? {});
    return {
      slotId: slot.slotId,
      sequence: slot.sequence,
      variantName: slot.variantName,
      candidateAuthorisationSha256: sha256Hex(bytes),
      candidateAuthorisationBytes: bytes.length,
      outputRoot: slotOutputRoot(slot),
    };
  });
  return {
    approvalVersion: F0X_STUDY_EXECUTION_APPROVAL_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: 'REPLICATION_V4_V5_N5',
    f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
    f0vPlanSha256: PROPOSED_F0V_PLAN_SHA256,
    f0vApprovalRecordRawSha256: APPROVAL_SHA,
    f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
    executionIntegrationCommit: FIXED_HEAD,
    slots: slotEntries,
    issuedAtUtc: '2026-09-01T00:00:00.000Z',
    validUntilUtc: '2026-12-01T00:00:00.000Z',
    operatorApprovalStatement: buildF0XStudyExecutionApprovalStatement(FIXED_HEAD, slotEntries),
  };
}

function writeApprovalFile(dir: string, approval: F0XStudyExecutionApproval): string {
  const path = join(dir, 'study-approval.json');
  writeFileSync(path, JSON.stringify(approval, null, 2));
  return path;
}

const readFile = (p: string): Buffer => readFileSync(p);
const currentHead = () => FIXED_HEAD;
const alreadyConsumed = () => false;
const outputRootProbes = {
  realpath: (p: string) => realpathSync.native(p),
  isDirectory: (p: string) => existsSync(p),
};
function listFilesRecursively(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const results: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else results.push(full.slice(root.length + 1));
    }
  };
  walk(root);
  return results;
}
const sequencingProbes = {
  isDirectory: (p: string) => existsSync(p),
  listFilesRecursively,
  readFile: (p: string) => readFileSync(p),
};

/** A fully valid, ten-slot fixture: every candidate present, every output root created. */
function fullyValidStudySetup(
  perSlotOverrides: ReadonlyMap<string, Partial<F0WSlotExecutionAuthorisation>> = new Map(),
) {
  const dir = freshDir();
  for (const slot of F0V_SLOTS) {
    writeCandidateFile(dir, slot, perSlotOverrides.get(slot.slotId) ?? {});
    mkdirSync(slotOutputRoot(slot), { recursive: true });
  }
  const approvalPath = writeApprovalFile(dir, buildValidApproval(F0V_SLOTS, perSlotOverrides));
  return {
    candidatePathForSlot: (slotId: string) => join(dir, `${slotId}.json`),
    studyApprovalPath: approvalPath,
  };
}

function fakeLauncherThatNeverRunsAProvider(dispatched: string[]): ChildLauncher {
  return {
    launch: async (input): Promise<ProcessIsolatedBatchResult> => {
      dispatched.push(input.attemptDir);
      return {
        outcome: 'COMPLETED',
        platform: 'posix',
        pid: 1000 + dispatched.length,
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
        posixGroupSweep: null,
        stderrTail: '',
        scratchDir: join(freshDir(), 'never-existed'),
      } as unknown as ProcessIsolatedBatchResult;
    },
  };
}

/**
 * Writes, into the dispatched attempt directory, exactly the artifacts a real
 * child writes only AFTER `provider.classify` returned — a genuine Class C
 * semantic-execution marker set — without any process or provider.
 */
function fakeLauncherWritingSemanticExecution(dispatched: string[]): ChildLauncher {
  const inner = fakeLauncherThatNeverRunsAProvider(dispatched);
  return {
    launch: async (input) => {
      const manifest = (
        JSON.parse(readFileSync(input.manifestPath, 'utf8')) as {
          record: {
            variantName: string;
            logicalBatchOrdinal: number;
            attemptNo: number;
            requestedModelId: string;
          };
        }
      ).record;
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
        providerReportedModelId: manifest.requestedModelId,
        inputTokens: 10,
        outputTokens: 20,
        outcomeDetail: null,
        internalAdapterAttemptCountWhereObservable: 1,
        authStatusInvocationsObserved: 1,
        startedAtUtc: '2026-09-16T12:00:00.000Z',
        endedAtUtc: '2026-09-16T12:00:01.000Z',
        monotonicWallTimeMs: 1000,
        tier1DiagnosticsCaptured: 0,
      });
      writeArtifactOnce(dir, 'CHILD_RESULT', {
        variantName: manifest.variantName,
        logicalBatchOrdinal: manifest.logicalBatchOrdinal,
        attemptNo: manifest.attemptNo,
        providerOutcome: 'OK',
        providerReportedModelId: manifest.requestedModelId,
        rawCheckpointPersistedBeforeValidation: true,
        rawBeforeValidationSequence: { persistedSeq: 1, validationStartedSeq: 2 },
        childStopCondition: null,
        artifactHashes: {},
        repairRound: null,
      });
      return inner.launch(input);
    },
  };
}

describe('2D2C-F0X executor: the real frozen study root is never written', () => {
  it('the mocked study root is not the real F0V study root', () => {
    expect(F0V_STUDY_ROOT).not.toBe(REAL_F0V_STUDY_ROOT_STRING);
    expect(F0V_STUDY_ROOT.startsWith(`${REAL_F0V_STUDY_ROOT_STRING}/`)).toBe(false);
  });

  afterAll(() => {
    expect(snapshotTreeSha256(REAL_F0V_STUDY_ROOT_STRING)).toEqual(REAL_STUDY_ROOT_AT_LOAD);
  });
});

describe('2D2C-F0X executor: all-ten-before-first-child and frozen order (fake launcher)', () => {
  it('a preflight refusal launches ZERO children — candidate 10 missing blocks slot 1', async () => {
    const dir = freshDir();
    for (const slot of F0V_SLOTS.slice(0, 9)) {
      writeCandidateFile(dir, slot);
      mkdirSync(slotOutputRoot(slot), { recursive: true });
    }
    mkdirSync(slotOutputRoot(F0V_SLOTS[9]!), { recursive: true }); // no candidate file for slot 10
    const approvalPath = writeApprovalFile(dir, buildValidApproval());
    const dispatched: string[] = [];

    const outcome = await runReplicationStudyExecution({
      registry,
      f0iPlan: F0I_PLAN,
      f0oPlan: F0O_PLAN,
      executionIntegrationCommit: FIXED_HEAD,
      candidatePathForSlot: (slotId) =>
        existsSync(join(dir, `${slotId}.json`)) ? join(dir, `${slotId}.json`) : null,
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
      runnerRepoRoot: ROOT,
      v4Root: ROOT,
      v5Root: ROOT,
      classifierConfigDir: join(freshDir(), 'profile'),
      parentEnv: {},
      platform: 'posix',
      launcher: fakeLauncherThatNeverRunsAProvider(dispatched),
      clock: { nowUtc: () => new Date('2026-09-16T12:00:00.000Z') },
    });

    expect(outcome.status).toBe('BLOCKED_BEFORE_START');
    expect(dispatched).toHaveLength(0);
  });

  it('dispatches all ten slots in the frozen order and completes the whole study ONLY when every slot leaves real Class C evidence', async () => {
    const { candidatePathForSlot, studyApprovalPath } = fullyValidStudySetup();
    const dispatched: string[] = [];

    const outcome = await runReplicationStudyExecution({
      registry,
      f0iPlan: F0I_PLAN,
      f0oPlan: F0O_PLAN,
      executionIntegrationCommit: FIXED_HEAD,
      candidatePathForSlot,
      studyApprovalPath,
      readFile,
      sha256: sha256Hex,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
      runnerRepoRoot: ROOT,
      v4Root: ROOT,
      v5Root: ROOT,
      classifierConfigDir: join(freshDir(), 'profile'),
      parentEnv: {},
      platform: 'posix',
      launcher: fakeLauncherWritingSemanticExecution(dispatched),
      clock: { nowUtc: () => new Date('2026-09-16T12:00:00.000Z') },
    });

    expect(outcome.status).toBe('COMPLETED_ALL_SLOTS');
    if (outcome.status === 'COMPLETED_ALL_SLOTS') {
      expect(outcome.completedSlots.map((c) => c.slot.slotId)).toEqual(
        F0V_SLOTS.map((s) => s.slotId),
      );
    }
    // Every dispatched child left provider-outcome/raw-output/child-result
    // markers, so each slot is Class C and durably closed, and the study
    // auto-advances through all ten slots in their frozen order.
    expect(dispatched.length).toBeGreaterThanOrEqual(F0V_SLOTS.length);
    for (const slot of F0V_SLOTS) {
      expect(
        existsSync(
          join(
            F0V_STUDY_ROOT,
            'study-events',
            `${String(slot.sequence).padStart(3, '0')}-${slot.slotId}-SLOT_COMPLETED_CLASS_C.json`,
          ),
        ),
      ).toBe(true);
    }
    // The outer-slot-identity record exists for every slot, written before dispatch.
    for (const slot of F0V_SLOTS) {
      expect(existsSync(outerSlotIdentityPathOf(slotOutputRoot(slot)))).toBe(true);
    }
  });

  it('a live re-check catches a candidate consumed between the all-ten preflight and this slot being reached, and PAUSES rather than crashing', async () => {
    // PAIR_1_V5 (slot 2)'s candidate structurally verifies during the
    // all-ten preflight's own check (its FIRST `alreadyConsumed` lookup),
    // but is reported consumed the SECOND time anything asks — modelling a
    // candidate spent by something else between preflight and this slot's
    // turn. This proves gate 2 is RE-EVALUATED live per slot immediately
    // before consumption, never trusted from the earlier preflight.
    const slot2 = F0V_SLOTS[1]!;
    const { candidatePathForSlot, studyApprovalPath } = fullyValidStudySetup();
    const slot2Hash = sha256Hex(candidateBytesOf(slot2));
    const checkCounts = new Map<string, number>();
    const liveAlreadyConsumed = (hash: string): boolean => {
      const count = (checkCounts.get(hash) ?? 0) + 1;
      checkCounts.set(hash, count);
      return hash === slot2Hash && count > 1;
    };
    const dispatched: string[] = [];

    const outcome = await runReplicationStudyExecution({
      registry,
      f0iPlan: F0I_PLAN,
      f0oPlan: F0O_PLAN,
      executionIntegrationCommit: FIXED_HEAD,
      candidatePathForSlot,
      studyApprovalPath,
      readFile,
      sha256: sha256Hex,
      currentHead,
      alreadyConsumed: liveAlreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
      runnerRepoRoot: ROOT,
      v4Root: ROOT,
      v5Root: ROOT,
      classifierConfigDir: join(freshDir(), 'profile'),
      parentEnv: {},
      platform: 'posix',
      launcher: fakeLauncherWritingSemanticExecution(dispatched),
      clock: { nowUtc: () => new Date('2026-09-16T12:00:00.000Z') },
    });

    expect(outcome.status).toBe('PAUSED');
    if (outcome.status === 'PAUSED') {
      expect(outcome.pausedAtSlot).toBe(slot2.slotId);
      expect(outcome.pauseKind).toBe('GATE_REFUSAL');
      if (outcome.pauseKind === 'GATE_REFUSAL') {
        expect(outcome.failedGate.failedGate).toBe('SLOT_AUTHORISATION');
      }
    }
    // Slot 1 (PAIR_1_V4) ran as Class C (all 12 evaluations); slot 2 never started.
    expect(dispatched).toHaveLength(12);
    expect(dispatched.every((dir) => dir.startsWith(slotOutputRoot(F0V_SLOTS[0]!)))).toBe(true);
  });
});

describe('2D2C-F0X corrective closure: a failed all-ten preflight writes ZERO artifacts', () => {
  function fullyValidCandidatesOnly(): {
    dir: string;
    candidatePathForSlot: (slotId: string) => string | null;
  } {
    const dir = freshDir();
    for (const slot of F0V_SLOTS) {
      writeCandidateFile(dir, slot);
      mkdirSync(slotOutputRoot(slot), { recursive: true });
    }
    return { dir, candidatePathForSlot: (slotId) => join(dir, `${slotId}.json`) };
  }

  function studyRootTopLevelArtifacts(): readonly string[] {
    if (!existsSync(F0V_STUDY_ROOT)) return [];
    return readdirSync(F0V_STUDY_ROOT).filter(
      (name) =>
        name === 'study-manifest.json' || name === 'study-terminal.json' || name === 'study-events',
    );
  }

  function snapshotSlotTree(): Readonly<Record<string, readonly string[]>> {
    const snapshot: Record<string, readonly string[]> = {};
    for (const slot of F0V_SLOTS)
      snapshot[slot.slotId] = listFilesRecursively(slotOutputRoot(slot));
    return snapshot;
  }

  const SCENARIOS: Record<
    string,
    () => {
      candidatePathForSlot: (slotId: string) => string | null;
      studyApprovalPath: string | null;
    }
  > = {
    'candidate 10 is missing': () => {
      const dir = freshDir();
      for (const slot of F0V_SLOTS.slice(0, 9)) {
        writeCandidateFile(dir, slot);
        mkdirSync(slotOutputRoot(slot), { recursive: true });
      }
      mkdirSync(slotOutputRoot(F0V_SLOTS[9]!), { recursive: true });
      const approvalPath = writeApprovalFile(dir, buildValidApproval());
      return {
        candidatePathForSlot: (slotId) =>
          existsSync(join(dir, `${slotId}.json`)) ? join(dir, `${slotId}.json`) : null,
        studyApprovalPath: approvalPath,
      };
    },
    'the study approval is missing': () => {
      const { candidatePathForSlot } = fullyValidCandidatesOnly();
      return { candidatePathForSlot, studyApprovalPath: null };
    },
    'a candidate byte-length mismatch inside the approval (slot 5, correct SHA)': () => {
      const { dir, candidatePathForSlot } = fullyValidCandidatesOnly();
      const approval = buildValidApproval() as unknown as {
        slots: { candidateAuthorisationBytes: number }[];
      };
      approval.slots[4]!.candidateAuthorisationBytes += 1;
      const approvalPath = writeApprovalFile(dir, approval as unknown as F0XStudyExecutionApproval);
      return { candidatePathForSlot, studyApprovalPath: approvalPath };
    },
    'a candidate hash mismatch inside the approval (slot 4)': () => {
      const { dir, candidatePathForSlot } = fullyValidCandidatesOnly();
      const approval = buildValidApproval() as unknown as {
        slots: { candidateAuthorisationSha256: string }[];
      };
      approval.slots[3]!.candidateAuthorisationSha256 = 'f'.repeat(64);
      const approvalPath = writeApprovalFile(dir, approval as unknown as F0XStudyExecutionApproval);
      return { candidatePathForSlot, studyApprovalPath: approvalPath };
    },
    'output root 10 does not exist': () => {
      const dir = freshDir();
      for (const slot of F0V_SLOTS.slice(0, 9)) {
        writeCandidateFile(dir, slot);
        mkdirSync(slotOutputRoot(slot), { recursive: true });
      }
      writeCandidateFile(dir, F0V_SLOTS[9]!); // candidate exists, output root does not
      const approvalPath = writeApprovalFile(dir, buildValidApproval());
      return {
        candidatePathForSlot: (slotId) => join(dir, `${slotId}.json`),
        studyApprovalPath: approvalPath,
      };
    },
    'the approval slot list is reordered': () => {
      const { dir, candidatePathForSlot } = fullyValidCandidatesOnly();
      const approval = buildValidApproval() as unknown as { slots: unknown[] };
      const [first, second, ...rest] = approval.slots;
      approval.slots = [second, first, ...rest];
      const approvalPath = writeApprovalFile(dir, approval as unknown as F0XStudyExecutionApproval);
      return { candidatePathForSlot, studyApprovalPath: approvalPath };
    },
    'candidate 7 is expired': () => {
      const dir = freshDir();
      for (const slot of F0V_SLOTS) {
        mkdirSync(slotOutputRoot(slot), { recursive: true });
        if (slot.slotId === F0V_SLOTS[6]!.slotId) {
          writeCandidateFile(dir, slot, { validUntilUtc: '2020-01-01T00:00:00.000Z' });
        } else {
          writeCandidateFile(dir, slot);
        }
      }
      const overrides = new Map([
        [F0V_SLOTS[6]!.slotId, { validUntilUtc: '2020-01-01T00:00:00.000Z' }],
      ]);
      const approvalPath = writeApprovalFile(dir, buildValidApproval(F0V_SLOTS, overrides));
      return {
        candidatePathForSlot: (slotId) => join(dir, `${slotId}.json`),
        studyApprovalPath: approvalPath,
      };
    },
    'the study approval itself is expired': () => {
      const { dir, candidatePathForSlot } = fullyValidCandidatesOnly();
      const approval = buildValidApproval() as unknown as { validUntilUtc: string };
      approval.validUntilUtc = '2020-01-01T00:00:00.000Z';
      const approvalPath = writeApprovalFile(dir, approval as unknown as F0XStudyExecutionApproval);
      return { candidatePathForSlot, studyApprovalPath: approvalPath };
    },
  };

  for (const [name, buildScenario] of Object.entries(SCENARIOS)) {
    it(`${name}: BLOCKED_BEFORE_START leaves the study/slot tree byte-for-byte unchanged`, async () => {
      const { candidatePathForSlot, studyApprovalPath } = buildScenario();
      const beforeSlotTree = snapshotSlotTree();
      expect(studyRootTopLevelArtifacts()).toEqual([]);
      const dispatched: string[] = [];

      const outcome = await runReplicationStudyExecution({
        registry,
        f0iPlan: F0I_PLAN,
        f0oPlan: F0O_PLAN,
        executionIntegrationCommit: FIXED_HEAD,
        candidatePathForSlot,
        studyApprovalPath,
        readFile,
        sha256: sha256Hex,
        currentHead,
        alreadyConsumed,
        sequencingProbes,
        outputRootProbes,
        forbiddenOutputRootContainers: [],
        runnerRepoRoot: ROOT,
        v4Root: ROOT,
        v5Root: ROOT,
        classifierConfigDir: join(freshDir(), 'profile'),
        parentEnv: {},
        platform: 'posix',
        launcher: fakeLauncherThatNeverRunsAProvider(dispatched),
        clock: { nowUtc: () => new Date('2026-09-16T12:00:00.000Z') },
      });

      expect(outcome.status).toBe('BLOCKED_BEFORE_START');
      expect(dispatched).toHaveLength(0);
      // No study manifest, no terminal record, no events directory.
      expect(studyRootTopLevelArtifacts()).toEqual([]);
      // Every slot output root's own file listing is exactly what it was
      // before this invocation — no slot artifact, no consumption marker.
      expect(snapshotSlotTree()).toEqual(beforeSlotTree);
    });
  }
});

describe('2D2C-F0X zero-inference correction: progression follows the slot’s OWN evidence, never the mere return of runExperiment', () => {
  /** Writes the EXACT preserved refusal: ok:false, providerConstructed:false, ENOENT at `freeze`. */
  function fakeLauncherRefusingAtFreeze(dispatched: string[]): ChildLauncher {
    const inner = fakeLauncherThatNeverRunsAProvider(dispatched);
    return {
      launch: async (input) => {
        const manifest = (
          JSON.parse(readFileSync(input.manifestPath, 'utf8')) as {
            record: { variantName: string };
          }
        ).record;
        const relative =
          manifest.variantName === 'PROMPT_V4_CANONICAL' ? F0I_FREEZE_PATH : F0O_FREEZE_PATH;
        writeArtifactOnce(input.attemptDir, 'CHILD_PREFLIGHT', {
          ok: false,
          stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT',
          detail: `Error: ENOENT: no such file or directory, open '${relative}'`,
          checks: { stage: 'freeze' },
          providerConstructed: false,
        });
        return inner.launch(input);
      },
    };
  }

  function executorInput(
    setup: ReturnType<typeof fullyValidStudySetup>,
    launcher: ChildLauncher,
    overrides: Partial<Parameters<typeof runReplicationStudyExecution>[0]> = {},
  ): Parameters<typeof runReplicationStudyExecution>[0] {
    return {
      registry,
      f0iPlan: F0I_PLAN,
      f0oPlan: F0O_PLAN,
      executionIntegrationCommit: FIXED_HEAD,
      candidatePathForSlot: setup.candidatePathForSlot,
      studyApprovalPath: setup.studyApprovalPath,
      readFile,
      sha256: sha256Hex,
      currentHead,
      alreadyConsumed: (hash, outputRoot) =>
        isConsumedByOuterSlotIdentity(outputRoot, hash, readFile) ||
        isAuthorisationConsumed(outputRoot, hash),
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
      runnerRepoRoot: ROOT,
      v4Root: ROOT,
      v5Root: ROOT,
      classifierConfigDir: join(freshDir(), 'profile'),
      parentEnv: {},
      platform: 'posix',
      launcher,
      clock: { nowUtc: () => new Date('2026-09-16T12:00:00.000Z') },
      ...overrides,
    };
  }

  const eventsOnDisk = (): string[] =>
    existsSync(join(F0V_STUDY_ROOT, 'study-events'))
      ? readdirSync(join(F0V_STUDY_ROOT, 'study-events')).sort()
      : [];

  it('a confirmed pre-inference refusal on slot 1 (the preserved failure shape) is CLASS B: the study PAUSES, a STOPPED experiment is NOT Class C, and slots 2..10 are never started or consumed', async () => {
    const setup = fullyValidStudySetup();
    const dispatched: string[] = [];
    const outcome = await runReplicationStudyExecution(
      executorInput(setup, fakeLauncherRefusingAtFreeze(dispatched)),
    );

    expect(outcome.status).toBe('PAUSED');
    if (outcome.status !== 'PAUSED') return;
    expect(outcome.pauseKind).toBe('POST_EXECUTION_EVIDENCE');
    if (outcome.pauseKind !== 'POST_EXECUTION_EVIDENCE') return;
    expect(outcome.pausedAtSlot).toBe('PAIR_1_V4');
    expect(outcome.experiment.status).toBe('STOPPED');
    expect(outcome.inclusionClass).toBe(
      'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL',
    );
    expect(outcome.completedSlots).toEqual([]);
    expect(dispatched).toHaveLength(1);

    expect(eventsOnDisk()).toEqual([
      '001-PAIR_1_V4-SLOT_GRANTED.json',
      '001-PAIR_1_V4-SLOT_PAUSED_CLASS_B.json',
    ]);
    const terminal = (
      JSON.parse(readFileSync(join(F0V_STUDY_ROOT, 'study-terminal.json'), 'utf8')) as {
        record: { outcome: string; blockingSlotId: string; slotsCompleted: number };
      }
    ).record;
    expect(terminal).toMatchObject({
      outcome: 'PAUSED',
      blockingSlotId: 'PAIR_1_V4',
      slotsCompleted: 0,
    });

    // The executor cannot burn the other nine candidates: exactly ONE slot
    // holds an outer identity and a consumption marker; nine roots are empty.
    for (const [index, slot] of F0V_SLOTS.entries()) {
      const hash = sha256Hex(candidateBytesOf(slot));
      const consumed =
        isConsumedByOuterSlotIdentity(slotOutputRoot(slot), hash, readFile) ||
        isAuthorisationConsumed(slotOutputRoot(slot), hash);
      expect(consumed).toBe(index === 0);
      if (index > 0) expect(listFilesRecursively(slotOutputRoot(slot))).toEqual([]);
    }

    // Re-invoking cannot resume past it either: the all-ten preflight sees
    // slot 1's evidence and refuses before any write or dispatch.
    const again: string[] = [];
    const eventsBefore = eventsOnDisk();
    const second = await runReplicationStudyExecution(
      executorInput(setup, fakeLauncherRefusingAtFreeze(again)),
    );
    expect(second.status).toBe('BLOCKED_BEFORE_START');
    expect(again).toEqual([]);
    expect(eventsOnDisk()).toEqual(eventsBefore);
  });

  it('a STOPPED experiment whose child left NO record is AMBIGUOUS, never Class C: the study pauses at slot 1', async () => {
    const dispatched: string[] = [];
    const outcome = await runReplicationStudyExecution(
      executorInput(fullyValidStudySetup(), fakeLauncherThatNeverRunsAProvider(dispatched)),
    );
    expect(outcome.status).toBe('PAUSED');
    if (outcome.status !== 'PAUSED' || outcome.pauseKind !== 'POST_EXECUTION_EVIDENCE') {
      throw new Error('expected a post-execution pause');
    }
    expect(outcome.experiment.status).toBe('STOPPED');
    expect(outcome.inclusionClass).toBe('AMBIGUOUS_EVIDENCE');
    expect(dispatched).toHaveLength(1);
    expect(eventsOnDisk()).toEqual([
      '001-PAIR_1_V4-SLOT_AMBIGUOUS.json',
      '001-PAIR_1_V4-SLOT_GRANTED.json',
    ]);
  });

  it('a real semantic-execution marker makes the slot Class C, but it must STILL be durably closed before progression', async () => {
    const dispatched: string[] = [];
    // The probe hides both terminal experiment records, modelling a Class C
    // slot that has not (yet) been durably closed.
    const hidingClosure = {
      ...sequencingProbes,
      listFilesRecursively: (root: string) =>
        listFilesRecursively(root).filter(
          (file) =>
            !file.endsWith('experiment-stop.json') && !file.endsWith('experiment-completion.json'),
        ),
    };
    const outcome = await runReplicationStudyExecution(
      executorInput(fullyValidStudySetup(), fakeLauncherWritingSemanticExecution(dispatched), {
        sequencingProbes: hidingClosure,
      }),
    );
    expect(outcome.status).toBe('PAUSED');
    if (outcome.status !== 'PAUSED' || outcome.pauseKind !== 'POST_EXECUTION_EVIDENCE') {
      throw new Error('expected a post-execution pause');
    }
    expect(outcome.inclusionClass).toBe('CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED');
    expect(outcome.classification.durablyClosed).toBe(false);
    expect(outcome.pausedAtSlot).toBe('PAIR_1_V4');
    expect(listFilesRecursively(slotOutputRoot(F0V_SLOTS[1]!))).toEqual([]);
  });

  it('defect 1: a runner root under which the frozen F0I/F0O bytes do not resolve refuses BEFORE the preflight — zero writes, zero consumption, zero dispatch', async () => {
    const setup = fullyValidStudySetup();
    const dispatched: string[] = [];
    await expect(
      runReplicationStudyExecution(
        executorInput(setup, fakeLauncherWritingSemanticExecution(dispatched), {
          runnerRepoRoot: freshDir(),
        }),
      ),
    ).rejects.toMatchObject({
      name: 'ChildFreezePathError',
      refusal: 'FREEZE_UNREADABLE_AT_ABSOLUTE_PATH',
    });
    expect(dispatched).toEqual([]);
    expect(existsSync(join(F0V_STUDY_ROOT, 'study-manifest.json'))).toBe(false);
    expect(existsSync(join(F0V_STUDY_ROOT, 'study-terminal.json'))).toBe(false);
    for (const slot of F0V_SLOTS) expect(listFilesRecursively(slotOutputRoot(slot))).toEqual([]);
  });
});

describe('2D2C-F0X executor: physical dispatch through the REAL Tier-2 harness (zero provider)', () => {
  it('slot 1 (V4) physically reaches the real child entry, passes FREEZE loading from the absolute manifest path in its scratch cwd, refuses at variantRoot before any provider — and the study PAUSES as Class B instead of burning slots 2..10', async () => {
    const truncated = <
      T extends { evaluations: readonly unknown[]; plannedLogicalEvaluations: number },
    >(
      plan: T,
    ): T => ({ ...plan, evaluations: [plan.evaluations[0]], plannedLogicalEvaluations: 1 });
    const f0iTruncated = truncated(F0I_PLAN);
    const f0oTruncated = truncated(F0O_PLAN);

    const { candidatePathForSlot, studyApprovalPath } = fullyValidStudySetup();
    const pids: number[] = [];
    const scratchDirs: string[] = [];
    const realLauncher: ChildLauncher = {
      launch: (input) =>
        runProcessIsolatedBatch({
          modulePath: CHILD_ENTRY_PATH,
          args: ['--manifest', input.manifestPath],
          watchdogMs: 20_000,
          graceMs: 1_000,
          childEnv: input.childEnv,
          onChildSpawned: (pid, scratchDir) => {
            pids.push(pid);
            scratchDirs.push(scratchDir);
          },
        }),
    };

    const outcome = await runReplicationStudyExecution({
      registry,
      f0iPlan: f0iTruncated,
      f0oPlan: f0oTruncated,
      executionIntegrationCommit: FIXED_HEAD,
      candidatePathForSlot,
      studyApprovalPath,
      readFile,
      sha256: sha256Hex,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
      runnerRepoRoot: ROOT,
      // The runner's OWN worktree is not a frozen V4/V5 variant worktree:
      // HEAD is not the historical frozen commit, so the REAL child fails
      // its own `variantRoot` preflight (`HEAD_MATCHES_FROZEN_COMMIT`)
      // before constructing any provider — but only AFTER its `freeze`
      // stage, which is exactly what the absolute path must get past.
      v4Root: ROOT,
      v5Root: ROOT,
      classifierConfigDir: join(freshDir(), 'profile'),
      parentEnv: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '/tmp' },
      platform: 'posix',
      launcher: realLauncher,
      clock: { nowUtc: () => new Date('2026-09-16T12:00:00.000Z') },
    });

    // Exactly ONE real child process, forked with a scratch cwd outside the repo.
    expect(pids).toHaveLength(1);
    expect(scratchDirs[0]!.startsWith(ROOT)).toBe(false);

    const slot1 = F0V_SLOTS[0]!;
    const dir = attemptDirectoryOf(slotOutputRoot(slot1), slot1.variantName, 1, 3);
    const manifest = (
      JSON.parse(readFileSync(join(dir, 'child-manifest.json'), 'utf8')) as {
        record: { freezePath: string };
      }
    ).record;
    expect(manifest.freezePath).toBe(join(ROOT, F0I_FREEZE_PATH));
    const preflight = (
      JSON.parse(readFileSync(join(dir, 'child-preflight.json'), 'utf8')) as {
        record: { ok: boolean; providerConstructed: boolean; checks: { stage: string } };
      }
    ).record;
    expect(preflight.ok).toBe(false);
    expect(preflight.providerConstructed).toBe(false);
    // Past `freeze`: the child opened and hash-resolved the F0I bytes.
    expect(preflight.checks.stage).toBe('variantRoot');

    expect(outcome.status).toBe('PAUSED');
    if (outcome.status === 'PAUSED') {
      expect(outcome.pausedAtSlot).toBe(slot1.slotId);
      expect(outcome.pauseKind).toBe('POST_EXECUTION_EVIDENCE');
      if (outcome.pauseKind === 'POST_EXECUTION_EVIDENCE') {
        expect(outcome.inclusionClass).toBe(
          'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL',
        );
        expect(outcome.experiment.status).toBe('STOPPED');
      }
      expect(outcome.completedSlots).toEqual([]);
    }

    // Slots 2..10: no evidence, no outer identity, no consumption marker.
    for (const slot of F0V_SLOTS.slice(1)) {
      expect(listFilesRecursively(slotOutputRoot(slot))).toEqual([]);
    }
    for (const slot of F0V_SLOTS) {
      const files = listFilesRecursively(slotOutputRoot(slot));
      expect(files.some((f) => f.endsWith('provider-outcome.json'))).toBe(false);
    }
  }, 60_000);
});

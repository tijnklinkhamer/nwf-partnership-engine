/**
 * PHASE 2B-2D2C-F6 (part A) — THE F5 HOST-SLEEP STRUCTURAL CLOSURE, VERIFIED.
 *
 * Proves the closure record is the pinned bytes, keeps every durable F5
 * classification exactly as recorded (REP_4 Class C, never rerun; REP_5
 * AMBIGUOUS, never forced), draws no semantic verdict, and that its incident
 * timeline is internally consistent. When the F5 roots exist on this machine,
 * their inventories are re-hashed and must equal the pinned ones — F5 is
 * immutable. On a machine without them (CI), that one check is skipped, never
 * faked.
 *
 * ZERO PROVIDER. No inference, no auth-status, no scoring, no gold, no HOLDOUT.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EXPECTED_CORPUS_ITEM_COUNT } from '../harness/phase2b2d2c/constants.js';
import {
  F5ClosureError,
  F5_CANNOT_SATISFY_MARKER,
  F5_CLOSURE_PATH,
  F5_CLOSURE_RAW_BYTES,
  F5_CLOSURE_RAW_SHA256,
  F5_CONSUMED_CANDIDATE_SHA256S,
  F5_CONTROL_ROOT,
  F5_CONTROL_ROOT_FILE_COUNT,
  F5_CONTROL_ROOT_INVENTORY_SHA256,
  F5_HOST_SLEEP_CONCLUSION,
  F5_NO_SEMANTIC_VERDICT_MARKER,
  F5_STUDY_ROOT,
  F5_STUDY_ROOT_FILE_COUNT,
  F5_STUDY_ROOT_INVENTORY_SHA256,
  loadF5ClosureFromBytes,
} from '../harness/phase2b2d2c/f6/f5ClosureF6.js';
import {
  computeRootInventory,
  formatRootInventory,
} from '../harness/phase2b2d2c/f6/rootInventoryF6.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BYTES = readFileSync(join(ROOT, F5_CLOSURE_PATH));
const LOADED = loadF5ClosureFromBytes(BYTES);
const CLOSURE = LOADED.closure;
const RAW = JSON.parse(BYTES.toString('utf8')) as {
  slots: Array<Record<string, unknown>>;
  hostSleepIncident: {
    powerManagementLog: Array<{ utc: string; event: string; detail: string }>;
    affectedEvaluations: Array<{
      slotId: string;
      logicalBatchOrdinal: number;
      startedAtUtc?: string;
      tier2: {
        watchdogFiredAtUtc: string | null;
        parentHeartbeatMaxGapMs: number;
        childProbe: { pingsSent: number; pongsReceived: number; unanswered: number };
      };
    }>;
  };
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const ms = (utc: string): number => Date.parse(utc);

describe('2D2C-F5 closure: identity and what it authorises', () => {
  it('is exactly the pinned bytes, and authorises nothing', () => {
    expect(LOADED.rawSha256).toBe(F5_CLOSURE_RAW_SHA256);
    expect(LOADED.rawBytes).toBe(F5_CLOSURE_RAW_BYTES);
    expect(CLOSURE.thisRecordAuthorises).toEqual([]);
    expect(CLOSURE.zeroRequestConfirmation).toEqual({
      providerCalls: 0,
      classifierInference: 0,
      authStatusInvocations: 0,
      scoring: 0,
      devGoldLoaded: false,
      scorerLoaded: false,
      holdoutAccessed: false,
      f5EvidenceModified: false,
    });
  });

  it('refuses drifted bytes before parsing them', () => {
    const drifted = Buffer.from(BYTES.toString('utf8').replace('"PAUSED"', '"COMPLETED"'), 'utf8');
    expect(() => loadF5ClosureFromBytes(drifted)).toThrow(F5ClosureError);
  });

  it('binds the F5 study approval, the runner and the study/control inventories', () => {
    expect(CLOSURE.f5Study.studyExecutionApproval.rawSha256).toBe(
      'aed64a864c5e46ea2d58fac696c091dfea7fd5118e49f70b01fabc605266299d',
    );
    expect(CLOSURE.f5Study.studyExecutionApproval.rawBytes).toBe(4098);
    expect(CLOSURE.f5Study.runnerExecutionBuildCommit).toBe(
      '1b000dda59803f804c5f03430733e711f67949d7',
    );
    expect(CLOSURE.inventory.studyRoot.fileCount).toBe(567);
    expect(CLOSURE.inventory.studyRoot.inventorySha256).toBe(
      'fc9d8aac1e8ba22429c99be3295078a58268dcbacb00390ee1bfb0c6394287db',
    );
    expect(CLOSURE.f5Study.consumedCandidateAuthorisationSha256s).toEqual(
      F5_CONSUMED_CANDIDATE_SHA256S,
    );
  });
});

describe('2D2C-F5 closure: the recorded classifications are preserved, never reinterpreted', () => {
  it('REP_1..3 are Class C COMPLETED_ALL_PLANNED, 12/12 and 49/49', () => {
    for (const slot of CLOSURE.slots.slice(0, 3)) {
      expect(slot.inclusionClass).toBe('C');
      expect(slot.experimentStatus).toBe('COMPLETED_ALL_PLANNED');
      expect(slot.evaluationsStartedAndClosed).toBe(12);
      expect(slot.itemsStructurallyObserved).toBe(49);
    }
  });

  it('REP_4 stays Class C STOPPED at 10/12 and 34/49, and is NOT recoverable, rerun or replaced', () => {
    const rep4 = CLOSURE.slots[3];
    expect(rep4.slotId).toBe('V6_REP_4');
    expect(rep4.inclusionClass).toBe('C');
    expect(rep4.stopCondition).toBe('TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT');
    expect(rep4.evaluationsStartedAndClosed).toBe(10);
    expect(rep4.itemsStructurallyObserved).toBe(34);
    expect(rep4.recoverableInsideF5).toBe(false);
    expect(rep4.rerun).toBe(false);
    expect(rep4.replaced).toBe(false);
    const accounting = RAW.slots[3]!.itemAccounting as Record<string, number>;
    const { total, ...parts } = accounting;
    expect(Object.values(parts).reduce((sum, n) => sum + n, 0)).toBe(total);
    expect(total).toBe(EXPECTED_CORPUS_ITEM_COUNT);
    expect(accounting.batches01To08ClosedWithProviderOutcomeOk).toBe(34);

    const recoverable = clone(RAW);
    recoverable.slots[3]!.recoverableInsideF5 = true;
    expect(() => loadF5ClosureFromBytes(Buffer.from(JSON.stringify(recoverable)))).toThrow(
      F5ClosureError,
    );
  });

  it('REP_5 stays AMBIGUOUS: mechanically NOT_RESOLVED, and never forced into Class B or C', () => {
    const rep5 = CLOSURE.slots[4];
    expect(rep5.inclusionClass).toBe('AMBIGUOUS');
    expect(rep5.confirmedProviderRequest).toBe(false);
    expect(rep5.mechanicalResolutionAttempt.result).toBe('NOT_RESOLVED');
    expect(rep5.forcedIntoClassB).toBe(false);
    expect(rep5.forcedIntoClassC).toBe(false);
    expect(rep5.itemsStructurallyObserved).toBe(0);
  });
});

describe('2D2C-F5 closure: structural, never semantic', () => {
  it('records both markers, three complete replicates of five, and no scoring', () => {
    expect(CLOSURE.structuralConclusion.markers).toEqual([
      F5_CANNOT_SATISFY_MARKER,
      F5_NO_SEMANTIC_VERDICT_MARKER,
    ]);
    expect(CLOSURE.structuralConclusion.completeReplicates).toBe(3);
    expect(CLOSURE.structuralConclusion.requiredCompleteReplicates).toBe(5);
    expect(CLOSURE.structuralConclusion.f5Scored).toBe(false);
  });

  it('never states that V6 failed or that DEV is not ready because of model performance', () => {
    const text = BYTES.toString('utf8');
    expect(text).not.toContain('V6_FAILED');
    expect(text).not.toContain('DEV_NOT_READY_FOR_HOLDOUT_BECAUSE_OF_MODEL_PERFORMANCE');
    expect(text).not.toMatch(/"(precision|recall|gateOutcome|verdict|label)"\s*:/i);
    expect(text).not.toMatch(/\bwrong\b/i);
  });

  it('F5 is closed as history: never recovered in place, never pooled, zero observations carried forward', () => {
    expect(CLOSURE.consequence.f5RecoveredInPlace).toBe(false);
    expect(CLOSURE.consequence.nextStudyIsAFreshStudyNotF5Recovery).toBe(true);
    expect(CLOSURE.consequence.f5ObservationsCountTowardNextStudy).toBe(0);
    expect(CLOSURE.consequence.f5AndNextStudyNeverPooled).toBe(true);
  });
});

describe('2D2C-F5 closure: the host-sleep incident timeline is internally consistent', () => {
  const incident = RAW.hostSleepIncident;
  const sleeps = incident.powerManagementLog.filter((entry) => entry.event === 'Sleep');
  const wakes = incident.powerManagementLog.filter((entry) => entry.event === 'DarkWake');

  it('the first sleep is Clamshell Sleep at 08:44:27Z, 11 s after REP_4 batch 09 started', () => {
    expect(sleeps[0]!.utc).toBe('2026-09-17T08:44:27Z');
    expect(sleeps[0]!.detail).toContain('Clamshell Sleep');
    const batch09 = incident.affectedEvaluations[0]!;
    expect(batch09.slotId).toBe('V6_REP_4');
    expect(batch09.logicalBatchOrdinal).toBe(9);
    // pmset logs whole seconds, so the interval is rounded (10.892 s -> 11 s).
    expect(Math.round((ms(sleeps[0]!.utc) - ms(batch09.startedAtUtc!)) / 1000)).toBe(11);
    expect(CLOSURE.hostSleepIncident.conclusion).toBe(F5_HOST_SLEEP_CONCLUSION);
  });

  it('each Tier-2 watchdog fire lands inside a DarkWake, and each heartbeat gap matches the preceding sleep', () => {
    const [, batch10, rep5] = incident.affectedEvaluations;
    for (const evaluation of [batch10!, rep5!]) {
      const fired = ms(evaluation.tier2.watchdogFiredAtUtc!);
      const wake = wakes.find((entry) => Math.abs(ms(entry.utc) - fired) <= 1_000);
      expect(
        wake,
        `${evaluation.slotId} fire at ${evaluation.tier2.watchdogFiredAtUtc}`,
      ).toBeDefined();
      const sleepSeconds = Number(
        /\((\d+) secs\)/.exec(sleeps.filter((entry) => ms(entry.utc) < fired).at(-1)!.detail)![1],
      );
      expect(Math.abs(evaluation.tier2.parentHeartbeatMaxGapMs / 1000 - sleepSeconds)).toBeLessThan(
        5,
      );
    }
    expect(batch10!.tier2.parentHeartbeatMaxGapMs).toBe(984_262);
    expect(rep5!.tier2.parentHeartbeatMaxGapMs).toBe(1_077_481);
  });

  it('every child probe was answered: the gaps are whole-host gaps, not a hung child', () => {
    for (const evaluation of incident.affectedEvaluations) {
      expect(evaluation.tier2.childProbe.unanswered).toBe(0);
      expect(evaluation.tier2.childProbe.pongsReceived).toBe(evaluation.tier2.childProbe.pingsSent);
    }
  });
});

describe('2D2C-F5 closure: F5 evidence is immutable', () => {
  it('the inventory formatter sorts paths by raw byte order, not by line', () => {
    const text = formatRootInventory([
      { relativePath: './b', sha256: '0'.repeat(64), bytes: 1 },
      { relativePath: './B', sha256: 'f'.repeat(64), bytes: 2 },
      { relativePath: './a/z', sha256: '1'.repeat(64), bytes: 3 },
    ]);
    expect(
      text
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split(' ')[2]),
    ).toEqual(['./B', './a/z', './b']);
  });

  it.skipIf(!existsSync(F5_STUDY_ROOT))(
    'the F5 study root still hashes to the pinned 567-file inventory',
    () => {
      const inventory = computeRootInventory(F5_STUDY_ROOT);
      expect(inventory.nonRegularEntries).toEqual([]);
      expect(inventory.fileCount).toBe(F5_STUDY_ROOT_FILE_COUNT);
      expect(inventory.inventorySha256).toBe(F5_STUDY_ROOT_INVENTORY_SHA256);
    },
  );

  it.skipIf(!existsSync(F5_CONTROL_ROOT))(
    'the F5 control root still hashes to the pinned 14-file inventory',
    () => {
      const inventory = computeRootInventory(F5_CONTROL_ROOT);
      expect(inventory.nonRegularEntries).toEqual([]);
      expect(inventory.fileCount).toBe(F5_CONTROL_ROOT_FILE_COUNT);
      expect(inventory.inventorySha256).toBe(F5_CONTROL_ROOT_INVENTORY_SHA256);
    },
  );
});

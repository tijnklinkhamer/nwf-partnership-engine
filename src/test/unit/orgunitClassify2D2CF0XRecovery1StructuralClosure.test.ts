/**
 * PHASE 2B-2D2C-F0X RECOVERY-1 — POST-EXECUTION STRUCTURAL CLOSURE AND THE
 * PARTIAL-REPLICATE ANALYSIS CLARIFICATION.
 *
 * Always runs: the committed inventory, closure and clarification are pinned
 * by raw SHA-256; the closure and the clarification regenerate from their
 * sources exactly; every verbatim restatement of a frozen rule is compared to
 * the frozen bytes.
 *
 * Machine-local (`runIf` the Recovery-1 root exists): the inventory re-derives
 * from the real evidence exactly, and a NAIVE walk that uses none of the
 * inventory code independently reconciles every execution total. The real
 * Recovery-1 root and control directory are snapshotted before and after and
 * must be unchanged.
 *
 * No provider, no scoring, no gold, no holdout access, no write outside a
 * vitest temp directory.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { snapshotTreeSha256 } from '../helpers/treeSnapshot.js';
import { F0I_FREEZE_PATH } from '../harness/phase2b2d2c/f0i/freezeF0I.js';
import { F0O_FREEZE_PATH } from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import { F0V_FREEZE_PATH } from '../harness/phase2b2d2c/f0v/freezeF0V.js';
import { sha256Hex } from '../harness/phase2b2d2c/f0v/studyPlanCore.js';
import { createReadOnlyInventoryProbes } from '../harness/phase2b2d2c/f0x/failedStudyInventory.js';
import {
  F0X_RECOVERY_1_CONTROL_DIR,
  F0X_RECOVERY_1_STUDY_ROOT,
} from '../harness/phase2b2d2c/f0x/recovery1Overlay.js';
import {
  buildRecovery1ExecutionInventory,
  RECOVERY_1_EXECUTION_INVENTORY_PATH,
  RECOVERY_1_EXECUTION_INVENTORY_RAW_SHA256,
  type Recovery1ExecutionInventory,
} from '../harness/phase2b2d2c/f0x/recovery1ExecutionInventory.js';
import {
  buildRecovery1StructuralClosure,
  F0V_CLASS_C_ACTION,
  FROZEN_PROVIDER_FAILURE_TREATMENT,
  RECOVERY_1_STRUCTURAL_CLOSURE_PATH,
  RECOVERY_1_STRUCTURAL_CLOSURE_RAW_SHA256,
  StructuralClosureError,
} from '../harness/phase2b2d2c/f0x/recovery1StructuralClosure.js';
import {
  buildPartialReplicateClarification,
  INCLUDED_N_PER_PROMPT,
  NOT_AVAILABLE_INCOMPLETE_REPLICATE,
  REPLICATION_CLARIFICATION_PATH,
  REPLICATION_CLARIFICATION_RAW_SHA256,
  SIX_FROZEN_DEV_GATES,
} from '../harness/phase2b2d2c/scoring/replicationContract.js';
import { CRITICAL_AND_CONTROL_GOLD_IDS } from '../harness/phase2b2d2c/scoring/replicationSummarise.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RECOVERY_PRESENT =
  existsSync(F0X_RECOVERY_1_STUDY_ROOT) && existsSync(F0X_RECOVERY_1_CONTROL_DIR);
const RECOVERY_ROOT_AT_LOAD = snapshotTreeSha256(F0X_RECOVERY_1_STUDY_ROOT);
const RECOVERY_CONTROL_AT_LOAD = snapshotTreeSha256(F0X_RECOVERY_1_CONTROL_DIR);

afterAll(() => {
  expect(snapshotTreeSha256(F0X_RECOVERY_1_STUDY_ROOT)).toEqual(RECOVERY_ROOT_AT_LOAD);
  expect(snapshotTreeSha256(F0X_RECOVERY_1_CONTROL_DIR)).toEqual(RECOVERY_CONTROL_AT_LOAD);
});

const inventoryBytes = readFileSync(join(ROOT, RECOVERY_1_EXECUTION_INVENTORY_PATH));
const inventory = JSON.parse(inventoryBytes.toString('utf8')) as Recovery1ExecutionInventory;
const closureBytes = readFileSync(join(ROOT, RECOVERY_1_STRUCTURAL_CLOSURE_PATH));
const closure = JSON.parse(closureBytes.toString('utf8')) as ReturnType<
  typeof buildRecovery1StructuralClosure
>;
const clarificationBytes = readFileSync(join(ROOT, REPLICATION_CLARIFICATION_PATH));
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as Record<string, unknown>;

const PARTIAL_SLOTS = ['PAIR_4_V5', 'PAIR_4_V4', 'PAIR_5_V4'];

describe('2D2C-F0X recovery-1: the committed execution inventory', () => {
  it('is pinned by raw SHA-256 and carries no classifier verdict', () => {
    expect(sha256Hex(inventoryBytes)).toBe(RECOVERY_1_EXECUTION_INVENTORY_RAW_SHA256);
    expect(inventory.requestFree).toBe(true);
    expect(inventory.parsesClassifierVerdicts).toBe(false);
    const text = inventoryBytes.toString('utf8');
    for (const verdictShaped of ['"verdict"', '"unit_type"', '"rationale"', '"evidence_spans"']) {
      expect(text).not.toContain(verdictShaped);
    }
  });

  it('records the reconciled whole-study totals', () => {
    expect(inventory.studyRoot).toBe(F0X_RECOVERY_1_STUDY_ROOT);
    expect(inventory.wholeStudyTree).toEqual({
      fileCount: 1191,
      treeSha256: '009ea90aab5936ac4dde1c1880f42c79580611fb99c5c63b2f038c82428b49dc',
    });
    expect(inventory.totals).toEqual({
      slotsPresent: 10,
      evaluationsPlanned: 120,
      evaluationsStarted: 98,
      evaluationsEndedWithoutStop: 95,
      evaluationsEndedWithStop: 3,
      originalProviderRequests: 98,
      repairProviderRequests: 10,
      providerRequests: 108,
      adapterAttempts: 108,
      authStatusInvocations: 108,
      originalOutcomes: { OK: 94, STRUCTURED_OUTPUT_FAILED: 1, TIMEOUT: 3 },
      tier2Outcomes: { COMPLETED: 97, TIMED_OUT_KILLED: 1 },
      repairCallsByDisposition: { ACCEPTED: 10 },
      slotsWithCompletion: 7,
      slotsWithStop: 3,
      classA: 0,
      classB: 0,
      classC: 10,
      ambiguous: 0,
      durablyClosed: 10,
      everyParsedRecordVerified: true,
    });
  });

  it('its totals are the sum of its own per-slot counts (re-added here, not trusted)', () => {
    const sum = (select: (slot: Recovery1ExecutionInventory['slots'][number]) => number): number =>
      inventory.slots.reduce((total, slot) => total + select(slot), 0);
    expect(sum((s) => s.counts.evaluationsStarted)).toBe(inventory.totals.evaluationsStarted);
    expect(sum((s) => s.evaluations.length)).toBe(inventory.totals.evaluationsStarted);
    expect(sum((s) => s.evaluations.filter((e) => e.providerOutcome !== null).length)).toBe(
      inventory.totals.originalProviderRequests,
    );
    expect(sum((s) => s.evaluations.reduce((n, e) => n + e.repairCalls.length, 0))).toBe(
      inventory.totals.repairProviderRequests,
    );
    expect(
      sum((s) =>
        s.evaluations.reduce(
          (n, e) =>
            n +
            (e.adapterAttempts as number) +
            e.repairCalls.reduce((m, c) => m + (c.adapterAttempts as number), 0),
          0,
        ),
      ),
    ).toBe(inventory.totals.adapterAttempts);
    expect(sum((s) => s.fileCount) + inventory.studyLevelFiles.length).toBe(
      inventory.wholeStudyTree.fileCount,
    );
  });
});

describe('2D2C-F0X recovery-1: the immutable structural closure', () => {
  it('is pinned, and regenerates exactly from the pinned inventory', () => {
    expect(sha256Hex(closureBytes)).toBe(RECOVERY_1_STRUCTURAL_CLOSURE_RAW_SHA256);
    expect(JSON.parse(JSON.stringify(buildRecovery1StructuralClosure(inventoryBytes)))).toEqual(
      closure,
    );
  });

  it('refuses an inventory whose bytes differ by one character', () => {
    const tampered = Buffer.from(inventoryBytes);
    tampered[tampered.length - 2] = tampered[tampered.length - 2] === 0x7d ? 0x20 : 0x7d;
    expect(() => buildRecovery1StructuralClosure(tampered)).toThrow(StructuralClosureError);
  });

  it('records the owner decision: all ten slots count, five per prompt, and the three stopped slots are never replaced', () => {
    expect(closure.ownerMethodologicalDecision.decision).toBe(
      'ALL_TEN_RECOVERY_1_SLOTS_COUNT_TOWARD_THE_FROZEN_N5_STUDY',
    );
    expect(closure.ownerMethodologicalDecision.includedReplicatesPerPrompt).toEqual({
      PROMPT_V4_CANONICAL: 5,
      PROMPT_V5_CANONICAL: 5,
    });
    expect(closure.ownerMethodologicalDecision.stoppedSlotsNeverReplacedOrRerun).toEqual(
      PARTIAL_SLOTS,
    );
    expect(closure.slots).toHaveLength(10);
    for (const slot of closure.slots) {
      expect(slot.countsTowardN).toBe(true);
      expect(slot.replacementOrRerunEligible).toBe(false);
      expect(slot.inclusionClass).toBe('CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED');
      expect(slot.durablyClosed).toBe(true);
    }
    expect(closure.ownerMethodologicalDecision.historicalAttempt3V4AndAttempt4V5).toBe(
      'PILOT_ONLY_NOT_COUNTED_TOWARD_N5',
    );
  });

  it('F0V classC action and the F0I/F0O provider-failure treatment are restated verbatim from the frozen bytes', () => {
    const f0v = readJson(F0V_FREEZE_PATH) as { inclusionRule: { classC: { action: string } } };
    expect(F0V_CLASS_C_ACTION).toBe(f0v.inclusionRule.classC.action);
    for (const path of [F0I_FREEZE_PATH, F0O_FREEZE_PATH]) {
      const freeze = readJson(path) as { scoring: { providerFailureTreatment: string } };
      expect(FROZEN_PROVIDER_FAILURE_TREATMENT).toBe(freeze.scoring.providerFailureTreatment);
    }
    expect(
      readFileSync(
        join(ROOT, 'docs/evaluation/PHASE_2B_2D_SONNET_ACCEPTANCE_PROTOCOL.md'),
        'utf8',
      ).replace(/\s+/g, ' '),
    ).toContain(
      'any structured-output failure (all counted INVALID — never a missing observation)',
    );
  });

  it('interprets COMPLETED_ALL_SLOTS structurally and records the exact study boundaries and hashes', () => {
    expect(closure.completedAllSlotsInterpretation.recordedOutcome).toBe('COMPLETED_ALL_SLOTS');
    expect(closure.completedAllSlotsInterpretation.recordRewritten).toBe(false);
    expect(closure.study).toMatchObject({
      startedAtUtc: '2026-09-16T15:14:22.446Z',
      completedAtUtc: '2026-09-16T16:15:58.314Z',
      studyManifest: {
        recordSha256: '09588c2df052c8f21417a6e65486abd474b045a9c942dd8c87b23cc6b4e02379',
      },
      studyTerminal: {
        recordSha256: 'be456b6a2750d25bea0a8e49fe4c974bcc81cc3b6d4aa50856890aa3892759a3',
        slotsCompleted: 10,
      },
      studyEvents: { count: 20, everyRecordSha256Verified: true },
    });
    expect(closure.frozenIdentities.studyExecutionApprovalSha256).toBe(
      '4edadcd77d09ce79423723f27602bd3f4ac29ef16e60707aa3efac5cbfe67ae2',
    );
    expect(closure.frozenIdentities.historicalBytesEdited).toBe(false);
  });

  it('per prompt: V4 3 full-coverage + 2 stopped, V5 4 + 1; the three terminal conditions are preserved exactly', () => {
    expect(closure.perPrompt.PROMPT_V4_CANONICAL).toMatchObject({
      includedSlots: 5,
      allTwelveEvaluationsEndedWithoutStop: 3,
      experimentStoppedBeforeAllPlanned: 2,
      slotsWithANonTerminalProviderFailure: ['PAIR_3_V4'],
    });
    expect(closure.perPrompt.PROMPT_V5_CANONICAL).toMatchObject({
      includedSlots: 5,
      allTwelveEvaluationsEndedWithoutStop: 4,
      experimentStoppedBeforeAllPlanned: 1,
    });
    const terminal = Object.fromEntries(
      closure.terminalFailures.slots.map((slot) => [
        slot.slotId,
        {
          started: slot.evaluationsStarted,
          ended: slot.evaluationsEndedWithoutStop,
          batch: slot.terminal?.logicalBatchOrdinal,
          outcome: slot.terminal?.providerOutcome,
          tier2: slot.terminal?.tier2Outcome,
          halt: slot.terminal?.haltKind,
          stopCondition: slot.terminal?.stopCondition,
        },
      ]),
    );
    expect(terminal).toEqual({
      PAIR_4_V5: {
        started: 11,
        ended: 10,
        batch: 11,
        outcome: 'TIMEOUT',
        tier2: 'COMPLETED',
        halt: 'TIER1_TIMEOUT_DECISION_RULE',
        stopCondition: null,
      },
      PAIR_4_V4: {
        started: 2,
        ended: 1,
        batch: 2,
        outcome: 'TIMEOUT',
        tier2: 'TIMED_OUT_KILLED',
        halt: 'STOP_CONDITION',
        stopCondition: 'CHILD_EXITED_UNCONFIRMED',
      },
      PAIR_5_V4: {
        started: 1,
        ended: 0,
        batch: 1,
        outcome: 'TIMEOUT',
        tier2: 'COMPLETED',
        halt: 'TIER1_TIMEOUT_DECISION_RULE',
        stopCondition: null,
      },
    });
  });

  it('surfaces the non-terminal structured-output failure inside PAIR_3_V4 and the UNKNOWN-cause wall time, without interpreting either', () => {
    const [structured, wallTime] = closure.structuralObservations;
    expect(structured?.slots).toEqual([
      {
        slotId: 'PAIR_3_V4',
        structuralTerminalCondition: 'ALL_12_PLANNED_EVALUATIONS_ENDED_WITHOUT_STOP',
        failures: [
          expect.objectContaining({
            logicalBatchOrdinal: 9,
            documents: 4,
            providerOutcome: 'STRUCTURED_OUTPUT_FAILED',
            validationResultPresent: false,
          }),
        ],
      },
    ]);
    expect(wallTime?.slots.map((s) => s.slotId)).toEqual(['PAIR_4_V4']);
    expect(wallTime?.statement).toContain('UNKNOWN');
  });

  it('confirms zero scoring and zero holdout access', () => {
    expect(closure.zeroScoringConfirmation).toEqual({
      goldLabelsLoaded: false,
      scoringSupplementOpened: false,
      ownerAdjudicationRecordOpened: false,
      scorerRun: false,
      classifierVerdictsParsedByThisClosure: false,
      holdoutSplitAccess: 'NONE',
      mixedLabelFileAccess: 'NONE',
    });
    expect(closure.evidenceModified).toBe(false);
  });
});

describe('2D2C-F0X: the additive partial-replicate analysis clarification', () => {
  const clarification = JSON.parse(clarificationBytes.toString('utf8')) as ReturnType<
    typeof buildPartialReplicateClarification
  >;

  it('is pinned, and is exactly what the scorer constants generate', () => {
    expect(sha256Hex(clarificationBytes)).toBe(REPLICATION_CLARIFICATION_RAW_SHA256);
    expect(JSON.parse(JSON.stringify(buildPartialReplicateClarification()))).toEqual(clarification);
  });

  it('cites the unedited F0U/F0V/F0I/F0O bytes and the closure, and authorises nothing', () => {
    expect(clarification.authorises).toEqual([]);
    expect(clarification.additivity.historicalBytesEdited).toBe(false);
    expect(sha256Hex(readFileSync(join(ROOT, F0V_FREEZE_PATH)))).toBe(
      clarification.additivity.f0vFreezeRawSha256,
    );
    expect(sha256Hex(readFileSync(join(ROOT, F0I_FREEZE_PATH)))).toBe(
      clarification.additivity.v4HistoricalFreezeF0IRawSha256,
    );
    expect(sha256Hex(readFileSync(join(ROOT, F0O_FREEZE_PATH)))).toBe(
      clarification.additivity.v5HistoricalFreezeF0ORawSha256,
    );
    expect(
      sha256Hex(
        readFileSync(
          join(ROOT, 'docs/audits/PHASE_2B_2D2C_F0U_REPLICATION_METHODOLOGY_REVIEW_2026-09.md'),
        ),
      ),
    ).toBe(clarification.additivity.f0uMethodologyRawSha256);
    expect(clarification.additivity.structuralClosure.rawSha256).toBe(
      RECOVERY_1_STRUCTURAL_CLOSURE_RAW_SHA256,
    );
  });

  it('keeps N fixed at 5, marks every incomplete full-run metric NOT_AVAILABLE, and changes no gate threshold', () => {
    expect(INCLUDED_N_PER_PROMPT).toBe(5);
    expect(clarification.fullRunGateMetrics.TERMINAL_FAILURE_PARTIAL).toMatchObject({
      eachGateMetric: NOT_AVAILABLE_INCOMPLETE_REPLICATE,
      devGateOutcome: NOT_AVAILABLE_INCOMPLETE_REPLICATE,
    });
    const f0v = readJson(F0V_FREEZE_PATH) as {
      analysisContract: {
        sixFrozenDevGates: Record<string, number>;
        criticalAndControlItemFrequencyTables: string[];
      };
    };
    expect(Object.keys(f0v.analysisContract.sixFrozenDevGates)).toEqual([...SIX_FROZEN_DEV_GATES]);
    for (const path of [F0I_FREEZE_PATH, F0O_FREEZE_PATH]) {
      const gates = (readJson(path) as { scoring: { gates: Record<string, number> } }).scoring
        .gates;
      for (const [gate, threshold] of Object.entries(f0v.analysisContract.sixFrozenDevGates)) {
        expect(gates[gate], `${path} ${gate}`).toBe(threshold);
      }
    }
    expect(CRITICAL_AND_CONTROL_GOLD_IDS).toEqual(
      f0v.analysisContract.criticalAndControlItemFrequencyTables,
    );
    expect(clarification.unchanged).toEqual({
      gateThresholds: true,
      sixGateComputation: true,
      postRepairTreatment: true,
      holdoutForbidden: true,
      v6: false,
    });
  });
});

describe.runIf(RECOVERY_PRESENT)('2D2C-F0X recovery-1 (machine-local): the REAL evidence', () => {
  it('TRIPWIRE: re-deriving the inventory from the real root reproduces the committed inventory exactly', () => {
    const rederived = buildRecovery1ExecutionInventory(
      F0X_RECOVERY_1_STUDY_ROOT,
      F0X_RECOVERY_1_CONTROL_DIR,
      createReadOnlyInventoryProbes(),
    );
    expect(JSON.parse(JSON.stringify(rederived))).toEqual(inventory);
  });

  it('INDEPENDENT RECONCILIATION: a naive walk that shares no inventory code agrees with every total', () => {
    const files: string[] = [];
    const walk = (dir: string, prefix: string): void => {
      for (const name of readdirSync(dir).sort()) {
        const full = join(dir, name);
        const rel = prefix === '' ? name : `${prefix}/${name}`;
        if (statSync(full).isDirectory()) walk(full, rel);
        else files.push(rel);
      }
    };
    walk(F0X_RECOVERY_1_STUDY_ROOT, '');
    files.sort();
    const hash = (rel: string): string =>
      createHash('sha256')
        .update(readFileSync(join(F0X_RECOVERY_1_STUDY_ROOT, rel)))
        .digest('hex');
    expect(files).toHaveLength(1191);
    expect(
      createHash('sha256')
        .update(files.map((rel) => `${hash(rel)}  ${rel}\n`).join(''))
        .digest('hex'),
    ).toBe('009ea90aab5936ac4dde1c1880f42c79580611fb99c5c63b2f038c82428b49dc');
    const record = (rel: string): Record<string, unknown> =>
      (
        JSON.parse(readFileSync(join(F0X_RECOVERY_1_STUDY_ROOT, rel), 'utf8')) as {
          record: Record<string, unknown>;
        }
      ).record;
    const named = (name: string): string[] => files.filter((rel) => rel.endsWith(`/${name}`));
    const original = named('provider-outcome.json');
    const repair = named('repair-provider-outcome.json');
    const attempts = [...original, ...repair].reduce(
      (n, rel) => n + (record(rel)['internalAdapterAttemptCountWhereObservable'] as number),
      0,
    );
    const auth = [...original, ...repair].reduce(
      (n, rel) => n + (record(rel)['authStatusInvocationsObserved'] as number),
      0,
    );
    const outcomes: Record<string, number> = {};
    for (const rel of original) {
      const outcome = record(rel)['outcome'] as string;
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
    const stopped = named('stop-decision.json').filter((rel) => record(rel)['stop'] === true);
    expect({
      original: original.length,
      repair: repair.length,
      providerRequests: original.length + repair.length,
      attempts,
      auth,
      outcomes,
      evaluationsStarted: new Set(
        files
          .filter((rel) => /\/batch-\d\d\//.test(rel))
          .map((rel) => rel.replace(/\/attempt-.*$/, '')),
      ).size,
      stopped: stopped.length,
      completions: named('experiment-completion.json').length,
      stops: named('experiment-stop.json').length,
      repairAccepted: named('repair-outcome.json').filter(
        (rel) => record(rel)['disposition'] === 'ACCEPTED',
      ).length,
      markers: files.filter((rel) => /^pair-\d-v\d\/authorisations\/[0-9a-f]{64}\.json$/.test(rel))
        .length,
    }).toEqual({
      original: inventory.totals.originalProviderRequests,
      repair: inventory.totals.repairProviderRequests,
      providerRequests: 108,
      attempts: inventory.totals.adapterAttempts,
      auth: inventory.totals.authStatusInvocations,
      outcomes: inventory.totals.originalOutcomes,
      evaluationsStarted: inventory.totals.evaluationsStarted,
      stopped: inventory.totals.evaluationsEndedWithStop,
      completions: 7,
      stops: 3,
      repairAccepted: 10,
      markers: 10,
    });
    const terminal = record('study-terminal.json');
    expect(terminal['outcome']).toBe('COMPLETED_ALL_SLOTS');
  });
});

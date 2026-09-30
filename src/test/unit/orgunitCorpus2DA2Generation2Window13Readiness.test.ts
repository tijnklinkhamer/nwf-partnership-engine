/**
 * Phase 2B-2D A2 Generation 2: WINDOW-13 OFFLINE READINESS - the two-item
 * replacement-only cleanup window: complete Q1 [106, 109] -> reserves 19/20,
 * no carry-in, no primary (every original slot 0..109 has started), planned
 * size 2, the generic default replacement-first cadence, and the frozen P2/P5
 * percentage rules applied to that size (thresholds 1 and 1).
 *
 * Every input is committed bytes at a pinned commit (see the materialiser);
 * the record is compared with its bytes at THIS task's terminal commit (the
 * commit that adds the audit) once it exists, else the working tree - so a
 * later Window-13 authority, ledger append or live result cannot turn these
 * readiness claims red.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { strictPercentThresholdCount } from '../harness/phase2b2d/continuationWindow/windowContract.js';
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
} from '../harness/phase2b2d/generation2Acquisition/executionBinding.js';
import { evaluateGeneration2WindowGate } from '../harness/phase2b2d/generation2Acquisition/gateAdapter.js';
import { parseOperationalGeneration2Ledger } from '../harness/phase2b2d/generation2Acquisition/operationalLedger.js';
import { assessCommittedInputs } from '../harness/phase2b2d/generation2Acquisition/state.js';
import { buildGeneration2WindowSpec } from '../harness/phase2b2d/generation2Acquisition/windowSpec.js';
import {
  APPROVED_WINDOW_CADENCE_AUTHORITIES,
  DEFAULT_WINDOW_EXECUTION_CADENCE,
} from '../harness/phase2b2d/generation2Cadence/windowCadence.js';
import {
  readWindow13Inputs,
  renderWindow13Readiness,
} from '../harness/phase2b2d/generation2Window13/materialiseWindow13Readiness.js';
import {
  EXPECTED_WINDOW_13,
  WINDOW13_CONTINUATION_DECISION,
  WINDOW13_CURRENT_LEDGER_REVISION,
  WINDOW13_GENERIC_REPAIR_COMMIT,
  WINDOW13_PLANNED_SIZE,
  WINDOW13_READINESS_AUDIT_PATH,
  WINDOW13_READINESS_PATH,
  WINDOW13_READINESS_TERMINAL_STATE,
} from '../harness/phase2b2d/generation2Window13/window13Contract.js';
import {
  buildWindow13Readiness,
  type Window13Inputs,
  type Window13Readiness,
} from '../harness/phase2b2d/generation2Window13/window13Readiness.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
const terminal = (() => {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW13_READINESS_AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
})();
const committedRecord = (): string =>
  terminal === null
    ? readFileSync(join(REPO, WINDOW13_READINESS_PATH), 'utf8')
    : execFileSync('git', ['-C', REPO, 'show', `${terminal}:${WINDOW13_READINESS_PATH}`], {
        encoding: 'utf8',
      });

let inputs: Window13Inputs;
let built: Window13Readiness;
let record: Json;

const basisOf = () =>
  assessCommittedInputs(
    inputs.window12Inputs.window11Inputs.window10Inputs.window09Inputs.window08Inputs.committed,
  ).basis!;

beforeAll(() => {
  inputs = readWindow13Inputs(REPO);
  built = buildWindow13Readiness(inputs);
  record = JSON.parse(committedRecord()) as Json;
}, 300_000);

describe('Phase 2B-2D A2 Generation-2 Window-13 offline readiness', () => {
  it('re-derives byte-identically from committed bytes and authorises nothing', async () => {
    expect(await renderWindow13Readiness(inputs)).toBe(committedRecord());
    expect(record.terminalState).toBe(WINDOW13_READINESS_TERMINAL_STATE);
    expect(record.thisFileAuthorises).toEqual([]);
    expect(record.isLiveAuthority).toBe(false);
    for (const key of [
      'networkAuthorised',
      'databaseAuthorised',
      'ledgerMutationAuthorised',
      'reserveAssignmentAuthorised',
      'networkUsed',
      'databaseUsed',
      'ledgerMutated',
      'reserveAssigned',
      'acquisitionRunCreated',
    ]) {
      expect(record[key], key).toBe(false);
    }
    expect(Object.values(record.sideEffects as Json).every((v) => v === 0 || v === false)).toBe(
      true,
    );
    expect(record.sideEffects.window14Created).toBe(false);
    expect(record.bound.carryInGenericRepairCommit).toBe(WINDOW13_GENERIC_REPAIR_COMMIT);
    expect(record.bound.window12).toMatchObject({
      readiness: { commit: '7960b9d91ab8aefc1d7eb56d91fb3881dc9631c3' },
      authority: { commit: '5ee2afe80ac750e762243335c3c5097ac92a66aa' },
      liveResult: { commit: 'b302438289fedf4b457fc21873e0c1fc3d4aa388' },
      postFinalP5Ruling: { commit: '793e0a6f512e4791a9b4ea5fb344e8c5086cf5df' },
      adjudication: { commit: '1cb1a21dbb79585abc8518852bf69856fd59576d' },
    });
    expect(record.bound.window12CadenceDecision.commit).toBe(
      '6dd2f7c737ebb016ffc6429cc9c85040a1312f66',
    );
    expect(record.bound.window12CadencePinCommit).toBe('03407f112c052e52dd517256ff78658b74bb876b');
    expect(record.bound.continuationDecision).toMatchObject({
      commit: WINDOW13_CONTINUATION_DECISION.commit,
      sha256: WINDOW13_CONTINUATION_DECISION.sha256,
      scope: 'WINDOW_13_SIZE_ONLY',
      recordKind: 'GENERATION2_OWNER_CONTINUATION_DECISION',
      isCadenceAuthority: false,
      ownerDecisions: [
        'PRESERVE_WINDOW_12_POST_FINAL_P5_AND_FULL_ADJUDICATION_V1',
        'APPROVE_WINDOW_13_TWO_ITEM_REPLACEMENT_ONLY_CLEANUP_WINDOW_V1',
        'APPROVE_WINDOW_13_OFFLINE_READINESS_UNDER_DEFAULT_REPLACEMENT_FIRST_CADENCE_V1',
      ],
    });
  });

  it('the size decision is committed alone, authorises offline readiness only, and changes no gate', () => {
    const decision = JSON.parse(
      git(
        'show',
        `${WINDOW13_CONTINUATION_DECISION.commit}:${WINDOW13_CONTINUATION_DECISION.path}`,
      ),
    ) as Json;
    expect(decision.isLiveAuthority).toBe(false);
    expect(decision.thisFileAuthorises).toHaveLength(1);
    expect(decision.thisFileAuthorises[0]).toMatch(/^Window-13 OFFLINE readiness/);
    for (const key of [
      'ledgerWriteAuthorised',
      'reserveAssignmentAuthorised',
      'networkAuthorised',
      'liveAuthorityAuthorised',
      'executionAuthorised',
    ]) {
      expect(decision[key], key).toBe(false);
    }
    expect(decision.window13Size.plannedWindowSize).toBe(2);
    expect(decision.frozenGateThresholdsAtPlannedSize2).toMatchObject({
      p2: { percentThresholdCount: 1 },
      p5: { thresholdCount: 1 },
      gateSemanticsChanged: false,
      gateWaiver: false,
      denominatorOverride: false,
    });
    expect(decision.executionCadence).toMatchObject({
      mode: 'Q1_REPLACEMENTS_THEN_PRIMARIES',
      window13CadenceDecision: false,
      window13CadencePin: false,
    });
  });

  it('replays the explicit twelve-window history: 52 / 52 run references, every historical spec hash', () => {
    const windows = record.adjudicationHistory.windows as Json[];
    expect(windows.map((w) => w.windowOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(windows.map((w) => w.rebuiltWindowSpecHash)).toEqual(
      EXPECTED_WINDOW_13.rebuiltWindowSpecHashes,
    );
    expect(built.history.windows.map((w) => w.windowOrdinal)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    // Cadence authorities exist for exactly Windows 08, 09, 10 and 12; Window 11 is default.
    expect(
      windows.filter((w) => w.cadenceAuthority !== undefined).map((w) => w.windowOrdinal),
    ).toEqual(EXPECTED_WINDOW_13.cadenceWindows);
    expect(windows.map((w) => w.cadenceAuthority?.commit ?? null)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      '2c20af702c3a9aed93e41f61c28d274f01c8351a',
      '9deb681e6cb7f19ad4af0f677655f278ece6c149',
      '7b226de931752dc70028b5e20e37fa5d7a925ca5',
      null,
      '6dd2f7c737ebb016ffc6429cc9c85040a1312f66',
    ]);
    expect(record.adjudicationHistory.integrity).toEqual({
      holds: true,
      isFrozenP7: false,
      historicalRunReferences: EXPECTED_WINDOW_13.historicalRunReferenceCount,
      distinct: EXPECTED_WINDOW_13.historicalRunReferenceCount,
    });
    expect(
      record.adjudicationHistory.hardenedLiveResultContract.map((c: Json) => [c.result, c.items]),
    ).toEqual([
      ['PASS', 5],
      ['PASS', 5],
      ['PASS', 5],
      ['PASS', 5],
      ['PASS', 5],
      ['PASS', 5],
      ['PASS', 2],
      ['PASS', 5],
      ['PASS', 4],
      ['PASS', 2],
      ['PASS', 4],
      ['PASS', 5],
    ]);
    expect(record.adjudicationHistory.window12).toMatchObject({
      executionCadence: 'PRIMARIES_THEN_Q1_REPLACEMENTS',
      authorisedOrder: ['G2P:108', 'G2P:109', 'G2R:107:16', 'G2R:103:17', 'G2R:106:18'],
      consumedLedgerSequences: [17, 18],
      notExecuted: [],
    });
    expect(record.adjudicationHistory.consumedLedgerEntryCount).toBe(19);
  });

  it('the current state is 108 (20/44/44) / failures [106, 109] / nothing assigned, pending or never started', () => {
    const s = EXPECTED_WINDOW_13.currentState;
    expect(record.currentState).toEqual({
      ACQUISITION_SUCCESSFUL: s.successful,
      acquisitionSuccessfulBySplit: s.successfulBySplit,
      CURRENT_ACQUISITION_FAILURE: s.failures,
      failureReasons: s.failureReasons,
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: s.assigned,
      PENDING_CAPABILITY_REVIEW: s.pending,
      CARRY_FORWARD_REFUSED: s.refused,
      NEVER_STARTED: s.neverStarted,
      q1: s.q1,
      accounting: s.accounting,
      generation2ReserveConsumed: s.ledgerEntryCount,
      nextGeneration2ReservePosition: s.nextGeneration2Reserve,
    });
    expect(built.state.neverStarted).toEqual([]);
  });

  it('the original corpus is exhausted: NEVER_STARTED is empty and there is no selection 110', () => {
    expect(record.originalCorpusExhausted).toMatchObject({
      originalSelectionCount: 110,
      originalSelectionIndexes: { from: 0, to: 109 },
      neverStarted: [],
      neverStartedFrom: null,
      neverStartedTo: null,
      specPlanningStateNeverStartedCount: 0,
      selectionIndex110: {
        existsInDraw: false,
        buildPrimaryExecutionBindingRefusal: 'SELECTION_INDEX_INVALID',
      },
      primaryInvented: false,
    });
    const basis = basisOf();
    expect(basis.draw.selection).toHaveLength(110);
    expect(() => buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, 110)).toThrow(
      /SELECTION_INDEX_INVALID/,
    );
    expect(built.spec.planningState).toMatchObject({
      neverStartedCount: 0,
      neverStartedFrom: null,
      neverStartedTo: null,
    });
    expect(committedRecord()).not.toMatch(/G2P:110|G2P:1[1-9]\d/);
  });

  it('Q1 is exactly [106, 109] -> reserves 19 and 20, nothing skipped', () => {
    expect(record.q1.assignments).toEqual(EXPECTED_WINDOW_13.q1Assignments);
    expect(record.q1.skippedReserves).toEqual([]);
    expect(
      record.q1.occupantsReplaced.map((o: Json) => [
        o.selectionIndex,
        o.kind,
        o.generation2ReserveRankPosition,
        o.generation2LedgerSequence,
      ]),
    ).toEqual([
      [106, 'GENERATION2_RESERVE_REPLACEMENT', 18, 18],
      [109, 'GENERATION1_TERMINAL_OCCUPANT', null, null],
    ]);
  });

  it('reserves 19 and 20 are the frozen schedule entries (identities checked here only)', () => {
    const basis = basisOf();
    const want: Record<number, [string, string, string]> = {
      19: [
        'E BILBAO28|949650662',
        'c5a127d4-2184-4b1d-8d45-49405cba495e',
        '912c21c5-da90-43cd-8ceb-3b7096df832f',
      ],
      20: [
        'PL CZESTOC05|949604781',
        '75dac0d4-3822-4f9e-906a-b3d2f0ce5a25',
        '91079cca-fd61-4500-9b62-befc848eccfc',
      ],
    };
    for (const reserve of EXPECTED_WINDOW_13.reserves) {
      const b = buildReserveExecutionBinding(
        basis.frameIndex,
        basis.schedule,
        reserve.generation2ReserveRankPosition,
      );
      expect({
        generation2ReserveRankPosition: b.generation2ReserveRankPosition,
        sourceFrameRankPosition: b.sourceFrameRankPosition,
        rankHash: b.rankHash,
        frameEntrySha256: b.frameEntrySha256,
        scheduleEntrySha256: b.scheduleEntrySha256,
      }).toEqual(reserve);
      const [echeRowKey, organisationId, rootId] = want[reserve.generation2ReserveRankPosition]!;
      expect([b.echeRowKey, b.organisationId]).toEqual([echeRowKey, organisationId]);
      expect(b.rootAuthorities).toEqual([{ type: 'WEBSITE_CLAIM', id: rootId }]);
      expect(b.rootAuthorityCount).toBe(1);
    }
    expect(record.q1.newReserves).toEqual(
      EXPECTED_WINDOW_13.reserves.map((r) => ({
        ...r,
        rootAuthorityTypes: ['WEBSITE_CLAIM'],
        rootAuthorityCount: 1,
      })),
    );
    expect(committedRecord()).not.toMatch(
      /BILBAO|CZESTOC|c5a127d4|75dac0d4|912c21c5|91079cca|949650662|949604781/,
    );
  });

  it('the prospective append is in memory only: 106 -> 19 (prev seq 18) then 109 -> 20 (Gen-1 occupant), 21 entries', () => {
    const a = record.prospectiveAppend;
    expect(a.written).toBe(false);
    expect(a.inMemoryOnly).toBe(true);
    expect(
      a.entries.map((e: Json) => ({
        sequence: e.sequence,
        selectionIndex: e.selectionIndex,
        generation2ReserveRankPosition: e.generation2ReserveRankPosition,
        split: e.split,
        reason: e.reason,
        replacedOccupantKind: e.replacedOccupantKind,
        previousSequenceForSlot: e.previousSequenceForSlot,
      })),
    ).toEqual(EXPECTED_WINDOW_13.plannedAppend);
    expect(a.previousLedgerHash).toBe(WINDOW13_CURRENT_LEDGER_REVISION.ledgerHash);
    expect(a.entries[0].previousEntryHash).toBe(WINDOW13_CURRENT_LEDGER_REVISION.lastEntryHash);
    expect(a.entries[1].previousEntryHash).toBe(a.entries[0].entryHash);
    expect(a.entries.every((e: Json) => e.recordedAtUtc === a.recordedAtUtc)).toBe(true);
    expect([a.prospectiveEntryCount, a.nextGeneration2ReservePosition]).toEqual([21, 21]);
    const prospective = parseOperationalGeneration2Ledger(
      JSON.parse(built.prospectiveLedgerText) as unknown,
      basisOf().genesis,
    );
    expect(prospective.entries).toHaveLength(21);
    expect(prospective.ledgerHash).toBe(a.prospectiveLedgerHash);
    expect(sha256(built.prospectiveLedgerText)).toBe(a.prospectiveLedgerFile.sha256);
    expect(prospective.entries.slice(19).map((e) => e.entryHash)).toEqual(
      a.entries.map((e: Json) => e.entryHash),
    );
    const p = EXPECTED_WINDOW_13.prospective;
    expect(record.prospectiveState).toEqual({
      ACQUISITION_SUCCESSFUL: p.successful,
      CURRENT_ACQUISITION_FAILURE: p.failures,
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: p.assigned,
      PENDING_CAPABILITY_REVIEW: [],
      NEVER_STARTED: p.neverStarted,
      q1: p.q1,
      accounting: p.accounting,
    });
  });

  it('planned size is 2 = the actionable work; the unchanged generic builder accepts it', () => {
    const w = record.window13;
    expect(w.plannedWindowSize).toBe(2);
    expect(WINDOW13_PLANNED_SIZE).toBe(2);
    expect(w.size).toMatchObject({
      recommendedBatchSize: 5,
      requiredBatchSizeInPlan: false,
      actionableWorkItemCount: 2,
      carryInAssigned: 0,
      q1Replacements: 2,
      neverStartedPrimaries: 0,
      genericBuilderAccepted: true,
      genericBuilderChanged: false,
    });
    expect(record.bound.corpusAcquisitionPlanV1).toMatchObject({
      batchingPlanRecommendedBatchSize: 5,
      batchingPlanBatchSizeKeys: ['recommendedBatchSize'],
    });
    // Regression: size 2 is accepted with replacementItems = 2 and primaryCount = 0 ...
    expect(built.spec.plannedWindowSize).toBe(2);
    expect(built.spec.workItems).toHaveLength(2);
    // ... and the same builder refuses to manufacture work: size 5 would need primaries that do not exist,
    // and size 1 cannot hold the complete Q1.
    const specInput = {
      basis: basisOf(),
      startingLedger: parseOperationalGeneration2Ledger(
        JSON.parse(inputs.currentLedgerText) as unknown,
        basisOf().genesis,
      ),
      startingLedgerFile: {
        sha256: sha256(inputs.currentLedgerText),
        bytes: Buffer.byteLength(inputs.currentLedgerText, 'utf8'),
      },
      history: built.history,
    };
    expect(() => buildGeneration2WindowSpec({ ...specInput, plannedWindowSize: 5 })).toThrow(
      /PRIMARIES_EXHAUSTED/,
    );
    expect(() => buildGeneration2WindowSpec({ ...specInput, plannedWindowSize: 1 })).toThrow(
      /Q1_EXCEEDS_WINDOW/,
    );
  });

  it('membership and order are exactly R106:19 -> R109:20; no primary; composition 0/1/1', () => {
    const w = record.window13;
    expect(w.membership).toEqual(EXPECTED_WINDOW_13.membership);
    expect(w.order).toEqual(EXPECTED_WINDOW_13.order);
    expect(built.spec.workItems.map((i) => [i.order, i.workItemId, i.kind])).toEqual([
      [1, 'G2R:106:19', 'REPLACEMENT'],
      [2, 'G2R:109:20', 'REPLACEMENT'],
    ]);
    expect(w.replacementGroup.map((g: Json) => [g.workItemId, g.ledgerSequence])).toEqual(
      EXPECTED_WINDOW_13.replacementGroup,
    );
    expect([
      w.replacementItems,
      w.carryInReplacementItems,
      w.newQ1ReplacementItems,
      w.primaryItems,
    ]).toEqual([2, 0, 2, 0]);
    expect(w.workItems.map((i: Json) => i.split)).toEqual(EXPECTED_WINDOW_13.splits);
    expect(w.composition).toEqual(EXPECTED_WINDOW_13.composition);
    expect(w.plannedReplacementAppend.map((p: Json) => p.sequence)).toEqual([19, 20]);
    expect(w.windowSpecHash).toBe(built.spec.windowSpecHash);
    expect(w.adaptsToResults).toBe(false);
    expect(w.executionIdentities.map((i: Json) => i.workItemId)).toEqual(EXPECTED_WINDOW_13.order);
    expect(w.executionIdentities.every((i: Json) => i.rebuiltEqualsSpec === true)).toBe(true);
    expect(w.executionIdentities.map((i: Json) => i.identityDigest)).toEqual(
      built.spec.workItems.map((i) => i.identityDigest),
    );
  });

  it('default cadence only: no executionCadence field, no Window-13 authority, pins stay [8, 9, 10, 12]', () => {
    const w = record.window13;
    expect(w.cadence).toEqual({
      mode: 'Q1_REPLACEMENTS_THEN_PRIMARIES',
      source: 'generic default (no cadenceAuthority supplied to buildGeneration2WindowSpec)',
      specHasExecutionCadenceField: false,
      window13CadenceAuthorityExists: false,
      window13CadencePinExists: false,
    });
    expect('executionCadence' in built.spec).toBe(false);
    expect(w).not.toHaveProperty('executionCadence');
    expect(DEFAULT_WINDOW_EXECUTION_CADENCE).toBe('Q1_REPLACEMENTS_THEN_PRIMARIES');
    expect(APPROVED_WINDOW_CADENCE_AUTHORITIES.map((a) => a.windowOrdinal)).toEqual([8, 9, 10, 12]);
    expect(record.bound.approvedCadenceWindowOrdinals).toEqual([8, 9, 10, 12]);
    expect([record.bound.window13CadenceDecision, record.bound.window13CadencePin]).toEqual([
      null,
      null,
    ]);
    expect(record.gates.operationalPrerequisites).toMatchObject({
      adjudicationHistoryIntegrity: true,
      windowCadenceAuthorityIntegrity: null,
    });
  });

  it('frozen P2 and P5 at planned size 2 give thresholds 1 and 1 (not the size-5 values 3 and 2)', () => {
    expect(strictPercentThresholdCount(2, 40)).toBe(1);
    expect(strictPercentThresholdCount(2, 30)).toBe(1);
    expect([strictPercentThresholdCount(5, 40), strictPercentThresholdCount(5, 30)]).toEqual([
      3, 2,
    ]);
    expect(built.spec.gateThresholds).toEqual(EXPECTED_WINDOW_13.gateThresholds);
    expect(record.gates.p2).toMatchObject({
      threshold: 1,
      consecutiveArm: 3,
      ruleUnchanged: true,
      fiveItemThresholdPreserved: false,
    });
    expect(record.gates.p5).toMatchObject({
      threshold: 1,
      denominator: 2,
      minRawPageEvidence: 4,
      scope: 'CURRENT_WINDOW',
      lowYieldCountAtWindowStart: 0,
      carriedFromWindow12: 0,
      ruleUnchanged: true,
      fiveItemThresholdPreserved: false,
    });
  });

  describe('the frozen gate on the two-item window', () => {
    type Reason = 'PAGE_BUDGET_EXHAUSTED' | 'ROBOTS_BLOCKED_ROOT' | 'ROBOTS_UNREADABLE_ROOT';
    const observation = (id: string, raw: number, reason: Reason = 'PAGE_BUDGET_EXHAUSTED') => {
      const item = built.spec.workItems.find((i) => i.workItemId === id)!;
      return {
        workItemId: id,
        kind: item.kind,
        selectionIndex: item.selectionIndex,
        reserveRankPosition: item.generation2ReserveRankPosition,
        rawPageEvidenceCount: raw,
        runTerminalState: 'COMPLETED' as const,
        rootTerminalReason: reason,
        orchestrationError: false,
        persistenceAnomaly: false,
        hostStateAnomaly: false,
        inputOrRootMismatch: false,
      };
    };
    const gate = (completed: ReturnType<typeof observation>[]) =>
      evaluateGeneration2WindowGate({
        spec: built.spec,
        preflight: built.preflightOnProspective,
        generation: { successfulOrganisationCount: 108, reserveConsumedCount: 21 },
        completed,
      });
    const conditions = (v: ReturnType<typeof gate>) =>
      v.triggeredConditions.map((c) => c.condition);

    it('zero completed: continue to G2R:106:19', () => {
      expect(gate([])).toMatchObject({
        decision: 'CONTINUE_TO_NEXT_WORK_ITEM',
        nextWorkItemId: 'G2R:106:19',
        mayStartNextWorkItem: true,
      });
      expect(record.gates.zeroCompletedGate).toEqual({
        decision: 'CONTINUE_TO_NEXT_WORK_ITEM',
        nextWorkItemId: 'G2R:106:19',
        mayStartNextWorkItem: true,
      });
    });

    it('one first-item robots refusal fires P2 (and, at 0 raw pages, P5 too); item 2 does not start', () => {
      for (const reason of ['ROBOTS_BLOCKED_ROOT', 'ROBOTS_UNREADABLE_ROOT'] as const) {
        const alone = gate([observation('G2R:106:19', 10, reason)]);
        expect([alone.decision, alone.mayStartNextWorkItem, conditions(alone)]).toEqual([
          'PAUSE_P2_ROBOTS_REFUSAL',
          false,
          ['P2'],
        ]);
        const both = gate([observation('G2R:106:19', 0, reason)]);
        expect(both.mayStartNextWorkItem).toBe(false);
        expect(both.nextWorkItemId).toBeNull();
        expect(conditions(both)).toEqual(expect.arrayContaining(['P2', 'P5']));
        expect(both.decision).toBe('PAUSE_P2_ROBOTS_REFUSAL');
      }
    });

    it('one first-item raw < 4 fires P5; item 2 does not start', () => {
      for (const raw of [0, 3]) {
        const v = gate([observation('G2R:106:19', raw)]);
        expect([v.decision, v.mayStartNextWorkItem, v.nextWorkItemId, conditions(v)]).toEqual([
          'PAUSE_P5_LOW_RAW_YIELD',
          false,
          null,
          ['P5'],
        ]);
      }
    });

    it('a clean, sufficient item 1 permits item 2; a gate first firing after item 2 is post-final', () => {
      const clean = gate([observation('G2R:106:19', 4)]);
      expect([clean.decision, clean.nextWorkItemId, clean.mayStartNextWorkItem]).toEqual([
        'CONTINUE_TO_NEXT_WORK_ITEM',
        'G2R:109:20',
        true,
      ]);
      expect(gate([observation('G2R:106:19', 30), observation('G2R:109:20', 30)]).decision).toBe(
        'WINDOW_COMPLETE',
      );
      const postFinal = gate([observation('G2R:106:19', 30), observation('G2R:109:20', 1)]);
      expect([postFinal.decision, postFinal.nextWorkItemId]).toEqual([
        'PAUSE_P5_LOW_RAW_YIELD',
        null,
      ]);
    });
  });

  it('P6 / P7 / P8 and history integrity', () => {
    const g = record.gates;
    expect([
      g.p6.beforeAppend.reserveConsumed,
      g.p6.beforeAppend.successful,
      g.p6.beforeAppend.fires,
      g.p6.afterAppend.reserveConsumed,
      g.p6.afterAppend.successful,
      g.p6.afterAppend.fires,
    ]).toEqual([19, 108, false, 21, 108, false]);
    expect(g.p7.invariants).toBe(18);
    expect(g.p7.onCurrentLedger).toMatchObject({
      held: '16/18',
      falseInvariants: EXPECTED_WINDOW_13.p7CurrentFalse,
    });
    expect(g.p7.onProspectiveLedger).toEqual({ held: '18/18', falseInvariants: [] });
    expect(built.preflightOnProspective.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(
      true,
    );
    expect(g.p8).toMatch(/^unchanged/);
    expect(g.intendedLiveConcurrencyPolicy).toMatch(/Engine \/ shared-nwf_pe/);
  });

  it('the canonical ledger is untouched at this task terminal: nineteen entries, reserve 19 unassigned', () => {
    const at = terminal ?? 'HEAD';
    const text = execFileSync(
      'git',
      ['-C', REPO, 'show', `${at}:${WINDOW13_CURRENT_LEDGER_REVISION.path}`],
      { encoding: 'utf8' },
    );
    expect(sha256(text)).toBe(WINDOW13_CURRENT_LEDGER_REVISION.fileSha256);
    expect(Buffer.byteLength(text, 'utf8')).toBe(16565);
    expect(record.canonicalGeneration2Ledger).toEqual({
      unchanged: true,
      entryCount: 19,
      ledgerHash: WINDOW13_CURRENT_LEDGER_REVISION.ledgerHash,
      reserve19Assigned: false,
      reserve20Assigned: false,
    });
    const ledger = JSON.parse(text) as Json;
    expect(ledger.entries.map((e: Json) => e.generation2ReserveRankPosition)).not.toContain(19);
  });
});

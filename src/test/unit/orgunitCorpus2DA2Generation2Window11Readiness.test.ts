/**
 * Phase 2B-2D A2 Generation 2: WINDOW-11 OFFLINE READINESS - a PURE
 * REPLACEMENT window: the three Window-10 carry-in assigned replacements
 * (sequences 12/13/14) plus the complete Q1 [106, 107] (reserves 15/16)
 * exactly fill the five-item window, so there is no primary. Default
 * replacement-first cadence, NO cadence decision, NO cadence pin, NO
 * `executionCadence` field.
 *
 * Every input is committed bytes at a pinned commit (see the materialiser);
 * the record is compared with its bytes at THIS task's terminal commit (the
 * commit that adds the audit) once it exists, else the working tree - so a
 * later Window-11 authority, ledger append or live result cannot turn these
 * readiness claims red.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildReserveExecutionBinding } from '../harness/phase2b2d/generation2Acquisition/executionBinding.js';
import { evaluateGeneration2WindowGate } from '../harness/phase2b2d/generation2Acquisition/gateAdapter.js';
import { parseOperationalGeneration2Ledger } from '../harness/phase2b2d/generation2Acquisition/operationalLedger.js';
import { assessCommittedInputs } from '../harness/phase2b2d/generation2Acquisition/state.js';
import { APPROVED_WINDOW_CADENCE_AUTHORITIES } from '../harness/phase2b2d/generation2Cadence/windowCadence.js';
import {
  readWindow11Inputs,
  renderWindow11Readiness,
} from '../harness/phase2b2d/generation2Window11/materialiseWindow11Readiness.js';
import {
  EXPECTED_WINDOW_11,
  WINDOW11_CURRENT_LEDGER_REVISION,
  WINDOW11_GENERIC_REPAIR_COMMIT,
  WINDOW11_READINESS_AUDIT_PATH,
  WINDOW11_READINESS_PATH,
  WINDOW11_READINESS_TERMINAL_STATE,
  WINDOW11_W10_CADENCE_DECISION,
} from '../harness/phase2b2d/generation2Window11/window11Contract.js';
import {
  buildWindow11Readiness,
  type Window11Inputs,
  type Window11Readiness,
} from '../harness/phase2b2d/generation2Window11/window11Readiness.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
const terminal = (() => {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW11_READINESS_AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
})();
const committedRecord = (): string =>
  terminal === null
    ? readFileSync(join(REPO, WINDOW11_READINESS_PATH), 'utf8')
    : execFileSync('git', ['-C', REPO, 'show', `${terminal}:${WINDOW11_READINESS_PATH}`], {
        encoding: 'utf8',
      });

let inputs: Window11Inputs;
let built: Window11Readiness;
let record: Json;

beforeAll(() => {
  inputs = readWindow11Inputs(REPO);
  built = buildWindow11Readiness(inputs);
  record = JSON.parse(committedRecord()) as Json;
}, 300_000);

const basisOf = () =>
  assessCommittedInputs(inputs.window10Inputs.window09Inputs.window08Inputs.committed).basis!;

describe('Phase 2B-2D A2 Generation-2 Window-11 offline readiness', () => {
  it('re-derives byte-identically from committed bytes and authorises nothing', async () => {
    expect(await renderWindow11Readiness(inputs)).toBe(committedRecord());
    expect(record.terminalState).toBe(WINDOW11_READINESS_TERMINAL_STATE);
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
    expect(record.bound.carryInGenericRepairCommit).toBe(WINDOW11_GENERIC_REPAIR_COMMIT);
    expect(record.bound.carryInOwnerSemanticDecision).toMatchObject({
      commit: 'c64a6c392c355c89003c7f3a41de2757473c5fd7',
      scope: 'GENERATION2_GENERIC_WINDOW_MEMBERSHIP_SEMANTICS',
    });
    expect(record.bound.window10.adjudication).toMatchObject({
      commit: 'cd4a346648fda84dc334556165afeb91fa7d475a',
      sha256: '6c27a6b5c0db88ca792367551ed134509affb4cc36a488e0f7387364ecdf1bae',
    });
    expect(record.bound.window10.liveResult.commit).toBe(
      '5af3ec75adcaad744d0c934ecedbed8c1c8b752e',
    );
    expect(record.bound.window10.midWindowP5Ruling.commit).toBe(
      '1e79430be35fff02e1788e335f1506126e0661fd',
    );
  });

  it('replays the explicit ten-window history: 43 / 43 run references, every historical spec hash', () => {
    const windows = record.adjudicationHistory.windows as Json[];
    expect(windows.map((w) => w.windowOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(windows.map((w) => w.rebuiltWindowSpecHash)).toEqual(
      EXPECTED_WINDOW_11.rebuiltWindowSpecHashes,
    );
    // Windows 08, 09 and 10 each carry their OWN pinned cadence decision; Window 11 none.
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
    ]);
    expect(windows[9]!.cadenceAuthority.sha256).toBe(WINDOW11_W10_CADENCE_DECISION.sha256);
    expect(windows[9]!.liveResult.path).toMatch(/WINDOW_10_LIVE_RESULT_V1\.json$/);
    expect(record.adjudicationHistory.integrity).toEqual({
      holds: true,
      isFrozenP7: false,
      historicalRunReferences: EXPECTED_WINDOW_11.historicalRunReferenceCount,
      distinct: EXPECTED_WINDOW_11.historicalRunReferenceCount,
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
    ]);
    expect(record.adjudicationHistory.window10).toEqual({
      executed: EXPECTED_WINDOW_11.window10Outcomes,
      executionCadence: 'PRIMARIES_THEN_Q1_REPLACEMENTS',
      authorisedOrder: ['G2P:106', 'G2P:107', 'G2R:99:12', 'G2R:96:13', 'G2R:103:14'],
      consumedLedgerSequences: [13, 14],
      notExecuted: ['G2R:99:12', 'G2R:96:13', 'G2R:103:14'],
    });
    expect(record.adjudicationHistory.consumedLedgerEntryCount).toBe(15);
  });

  it('the current state is 103 / failures [106, 107] / assigned [96, 99, 103]; Q1 is [106, 107]', () => {
    const s = EXPECTED_WINDOW_11.currentState;
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
    for (const slot of [96, 99, 103]) expect(record.currentState.q1).not.toContain(slot);
  });

  it('the carry-ins are exactly sequences 12 / 13 / 14 with the identities Window 10 authorised', () => {
    expect(record.carryIn.occupants).toEqual(EXPECTED_WINDOW_11.carryIn);
    const w10Authority = JSON.parse(built.history.windows[9]!.authority.text) as Json;
    for (const c of EXPECTED_WINDOW_11.carryIn) {
      expect(
        w10Authority.authorisedWorkItems.find((i: Json) => i.workItemId === c.workItemId)
          .identityDigest,
      ).toBe(c.identityDigest);
    }
  });

  it('the new assignments are exactly 106 -> 15 and 107 -> 16', () => {
    expect(record.q1.assignments).toEqual(EXPECTED_WINDOW_11.q1Assignments);
    expect(record.q1.occupantsReplaced.map((o: Json) => [o.selectionIndex, o.kind])).toEqual([
      [106, 'GENERATION1_TERMINAL_OCCUPANT'],
      [107, 'GENERATION1_TERMINAL_OCCUPANT'],
    ]);
  });

  it('reserves 12-16 are the frozen schedule entries (identities checked here only)', () => {
    const basis = basisOf();
    const want: Record<number, [string, string, string]> = {
      15: [
        'E SANTAND01|999880075',
        '7edcb999-d3f3-4d84-b410-b2546339d14c',
        'f1c8da75-9de7-422c-a48e-f0b5743062df',
      ],
      16: [
        'F ANGOULE21|949497402',
        '20a19383-aa6b-44c5-a683-c67bf9d8ff23',
        'bfed5234-0aa3-415e-b1f3-a2d4e625de64',
      ],
    };
    for (const reserve of EXPECTED_WINDOW_11.reserves) {
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
      expect(b.rootAuthorities.map((a) => a.type)).toEqual(['WEBSITE_CLAIM']);
      const expected = want[reserve.generation2ReserveRankPosition];
      if (expected !== undefined) {
        expect([b.echeRowKey, b.organisationId]).toEqual([expected[0], expected[1]]);
        expect(b.rootAuthorities).toEqual([{ type: 'WEBSITE_CLAIM', id: expected[2] }]);
      }
    }
    expect(record.q1.newReserves).toEqual(
      EXPECTED_WINDOW_11.reserves.slice(3).map((r) => ({
        ...r,
        rootAuthorityTypes: ['WEBSITE_CLAIM'],
        rootAuthorityCount: 1,
      })),
    );
    expect(committedRecord()).not.toMatch(
      /SANTAND|ANGOULE|7edcb999|20a19383|f1c8da75|bfed5234|TENERIF|MESSINA|BARCELO/,
    );
  });

  it('the prospective append is in memory only: 106 -> 15 then 107 -> 16, 17 entries', () => {
    const a = record.prospectiveAppend;
    expect(a.written).toBe(false);
    expect(a.carryInEntriesAppended).toBe(0);
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
    ).toEqual(EXPECTED_WINDOW_11.plannedAppend);
    expect(a.previousLedgerHash).toBe(WINDOW11_CURRENT_LEDGER_REVISION.ledgerHash);
    expect(a.entries[0].previousEntryHash).toBe(WINDOW11_CURRENT_LEDGER_REVISION.lastEntryHash);
    expect(a.entries[1].previousEntryHash).toBe(a.entries[0].entryHash);
    expect([a.prospectiveEntryCount, a.nextGeneration2ReservePosition]).toEqual([17, 17]);
    expect(a.prospectiveLedgerFile.sha256).toBe(sha256(built.prospectiveLedgerText));
    const prospective = parseOperationalGeneration2Ledger(
      JSON.parse(built.prospectiveLedgerText) as unknown,
      basisOf().genesis,
    );
    expect(prospective.entries).toHaveLength(17);
    expect(prospective.ledgerHash).toBe(a.prospectiveLedgerHash);
    // sequences 12-14 are unchanged: slots 99/96/103 keep reserves 12/13/14
    for (const c of EXPECTED_WINDOW_11.carryIn) {
      expect(prospective.entries[c.ledgerSequence]!.entryHash).toBe(c.entryHash);
    }
    const p = EXPECTED_WINDOW_11.prospective;
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

  it('five replacements exactly fill the window: zero primaries, no G2P:108 / G2P:109', () => {
    const w = record.window11;
    expect(w.plannedWindowSize).toBe(5);
    expect([w.replacementItems, w.carryInReplacementItems, w.newQ1ReplacementItems]).toEqual([
      5, 3, 2,
    ]);
    expect(w.primaryItems).toBe(0);
    expect(built.spec.workItems.every((i) => i.kind === 'REPLACEMENT')).toBe(true);
    expect(w.membership).toEqual(EXPECTED_WINDOW_11.membership);
    expect(w.order).not.toContain('G2P:108');
    expect(w.order).not.toContain('G2P:109');
    expect(w.primariesExcluded).toEqual({ from: 108, to: 109, count: 2 });
    expect(w.workItems.map((i: Json) => i.split)).toEqual(EXPECTED_WINDOW_11.splits);
    expect(w.composition).toEqual(EXPECTED_WINDOW_11.composition);
  });

  it('the order is ledger sequence 12 -> 13 -> 14 -> 15 -> 16, not selectionIndex', () => {
    const w = record.window11;
    expect(w.order).toEqual(EXPECTED_WINDOW_11.order);
    expect(w.replacementGroup.map((g: Json) => [g.workItemId, g.ledgerSequence])).toEqual(
      EXPECTED_WINDOW_11.replacementGroup,
    );
    expect(w.replacementGroup.map((g: Json) => g.carryIn)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    const bySelection = [...built.spec.workItems]
      .sort((a, b) => a.selectionIndex - b.selectionIndex)
      .map((i) => i.workItemId);
    expect(w.order).not.toEqual(bySelection);
    expect(w.plannedReplacementAppend.map((p: Json) => p.sequence)).toEqual([15, 16]);
    expect(w.windowSpecHash).toBe(built.spec.windowSpecHash);
    expect(w.windowSpecHash).toBe(
      'df50897eb8d273fd0af753b06cf8266e1b7e34490ed8cd31fd69ebea9a391752',
    );
    expect(w.executionIdentities.every((i: Json) => i.rebuiltEqualsSpec === true)).toBe(true);
    expect(w.executionIdentities.map((i: Json) => i.workItemId)).toEqual(EXPECTED_WINDOW_11.order);
    expect(w.adaptsToResults).toBe(false);
  });

  it('the default cadence is used: no Window-11 cadence authority, pin or executionCadence field', () => {
    expect('executionCadence' in built.spec).toBe(false);
    expect(record.window11.executionCadence).toBeUndefined();
    expect(record.window11.cadence).toEqual({
      mode: 'Q1_REPLACEMENTS_THEN_PRIMARIES',
      source: 'generic default (no cadenceAuthority supplied to buildGeneration2WindowSpec)',
      specHasExecutionCadenceField: false,
      window11CadenceAuthorityExists: false,
      window11CadencePinExists: false,
    });
    expect(
      APPROVED_WINDOW_CADENCE_AUTHORITIES.filter((a) => a.windowOrdinal <= 11).map(
        (a) => a.windowOrdinal,
      ),
    ).toEqual([8, 9, 10]);
    expect([record.bound.window11CadenceDecision, record.bound.window11CadencePin]).toEqual([
      null,
      null,
    ]);
    expect(record.bound.window10CadenceDecision).toMatchObject({
      scope: 'WINDOW_10_CADENCE_ONLY',
      broadened: false,
    });
  });

  it('P2 / P5 / P6 / P7 / P8, history integrity and no cadence prerequisite', () => {
    const g = record.gates;
    expect(g.p2.threshold).toBe(3);
    expect(g.p5).toMatchObject({
      threshold: 2,
      denominator: 5,
      scope: 'CURRENT_WINDOW',
      lowYieldCountAtWindowStart: 0,
      carriedFromWindow10: 0,
      sticky: true,
    });
    expect([
      g.p6.beforeAppend.reserveConsumed,
      g.p6.beforeAppend.successful,
      g.p6.beforeAppend.fires,
      g.p6.afterAppend.reserveConsumed,
      g.p6.afterAppend.successful,
      g.p6.afterAppend.fires,
    ]).toEqual([15, 103, false, 17, 103, false]);
    expect(g.p7.invariants).toBe(18);
    expect(g.p7.onCurrentLedger).toMatchObject({
      held: '16/18',
      falseInvariants: EXPECTED_WINDOW_11.p7CurrentFalse,
    });
    expect(g.p7.onProspectiveLedger).toEqual({ held: '18/18', falseInvariants: [] });
    expect(g.operationalPrerequisites).toEqual({
      adjudicationHistoryIntegrity: true,
      windowCadenceAuthorityIntegrityPresent: false,
      outsideFrozenP7: true,
    });
    expect(
      'windowCadenceAuthorityIntegrity' in built.preflightOnProspective.operationalPrerequisites,
    ).toBe(false);
    expect(g.zeroCompletedGate).toEqual({
      decision: 'CONTINUE_TO_NEXT_WORK_ITEM',
      nextWorkItemId: 'G2R:99:12',
      mayStartNextWorkItem: true,
    });
  });

  it('frozen P5 is unchanged: two low-yield replacements fire it after item 2', () => {
    const spec = built.spec;
    const observation = (id: string, raw: number) => {
      const item = spec.workItems.find((i) => i.workItemId === id)!;
      return {
        workItemId: id,
        kind: item.kind,
        selectionIndex: item.selectionIndex,
        reserveRankPosition: item.generation2ReserveRankPosition,
        rawPageEvidenceCount: raw,
        runTerminalState: 'COMPLETED' as const,
        rootTerminalReason: 'PAGE_BUDGET_EXHAUSTED' as const,
        orchestrationError: false,
        persistenceAnomaly: false,
        hostStateAnomaly: false,
        inputOrRootMismatch: false,
      };
    };
    const gate = (completed: ReturnType<typeof observation>[]) =>
      evaluateGeneration2WindowGate({
        spec,
        preflight: built.preflightOnProspective,
        generation: { successfulOrganisationCount: 103, reserveConsumedCount: 17 },
        completed,
      });
    expect(gate([observation('G2R:99:12', 0)]).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    const fired = gate([observation('G2R:99:12', 0), observation('G2R:96:13', 3)]);
    expect([fired.decision, fired.mayStartNextWorkItem]).toEqual(['PAUSE_P5_LOW_RAW_YIELD', false]);
    expect(gate([observation('G2R:99:12', 30), observation('G2R:96:13', 30)]).nextWorkItemId).toBe(
      'G2R:103:14',
    );
  });

  it('the canonical ledger is untouched at this task terminal: fifteen entries, reserve 15 unassigned', () => {
    const at = terminal ?? 'HEAD';
    const text = execFileSync(
      'git',
      ['-C', REPO, 'show', `${at}:${WINDOW11_CURRENT_LEDGER_REVISION.path}`],
      { encoding: 'utf8' },
    );
    expect(sha256(text)).toBe(WINDOW11_CURRENT_LEDGER_REVISION.fileSha256);
    expect(record.canonicalGeneration2Ledger).toEqual({
      unchanged: true,
      entryCount: 15,
      ledgerHash: WINDOW11_CURRENT_LEDGER_REVISION.ledgerHash,
      reserve15Assigned: false,
      reserve16Assigned: false,
    });
  });
});

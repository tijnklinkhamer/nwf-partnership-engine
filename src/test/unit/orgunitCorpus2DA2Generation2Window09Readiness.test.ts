/**
 * Phase 2B-2D A2 Generation 2: WINDOW-09 OFFLINE READINESS under its own,
 * separately pinned primary-first cadence.
 *
 * Every input is committed bytes at a pinned commit (see the materialiser);
 * the record is compared with its bytes at THIS task's terminal commit (the
 * commit that adds the audit) once it exists, else the working tree - so a
 * later Window-09 authority, ledger append or live result cannot turn these
 * readiness claims red.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
} from '../harness/phase2b2d/generation2Acquisition/executionBinding.js';
import { evaluateGeneration2WindowGate } from '../harness/phase2b2d/generation2Acquisition/gateAdapter.js';
import { assessCommittedInputs } from '../harness/phase2b2d/generation2Acquisition/state.js';
import { verifyWindowCadenceAuthority } from '../harness/phase2b2d/generation2Cadence/windowCadence.js';
import {
  readWindow09Inputs,
  renderWindow09Readiness,
} from '../harness/phase2b2d/generation2Window09/materialiseWindow09Readiness.js';
import {
  EXPECTED_WINDOW_09,
  WINDOW09_CADENCE_DECISION,
  WINDOW09_CURRENT_LEDGER_REVISION,
  WINDOW09_READINESS_AUDIT_PATH,
  WINDOW09_READINESS_PATH,
  WINDOW09_READINESS_TERMINAL_STATE,
  WINDOW09_W08_CADENCE_DECISION,
} from '../harness/phase2b2d/generation2Window09/window09Contract.js';
import {
  buildWindow09Readiness,
  cadenceBindingOf,
  type Window09Inputs,
  type Window09Readiness,
} from '../harness/phase2b2d/generation2Window09/window09Readiness.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
const terminal = (() => {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW09_READINESS_AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
})();
const committedRecord = (): string =>
  terminal === null
    ? readFileSync(join(REPO, WINDOW09_READINESS_PATH), 'utf8')
    : execFileSync('git', ['-C', REPO, 'show', `${terminal}:${WINDOW09_READINESS_PATH}`], {
        encoding: 'utf8',
      });

let inputs: Window09Inputs;
let built: Window09Readiness;
let record: Json;

beforeAll(() => {
  inputs = readWindow09Inputs(REPO);
  built = buildWindow09Readiness(inputs);
  record = JSON.parse(committedRecord()) as Json;
}, 300_000);

describe('Phase 2B-2D A2 Generation-2 Window-09 offline readiness', () => {
  it('re-derives byte-identically from committed bytes and authorises nothing', async () => {
    expect(await renderWindow09Readiness(inputs)).toBe(committedRecord());
    expect(record.terminalState).toBe(WINDOW09_READINESS_TERMINAL_STATE);
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
    expect(record.bound.cadenceImplementationCommit).toBe(
      '8a90e74fe39a78868f4470b2c6396d107fe5ea0d',
    );
  });

  it('replays the explicit eight-window history: 37 / 37 run references, every historical spec hash', () => {
    const windows = record.adjudicationHistory.windows as Json[];
    expect(windows.map((w) => w.windowOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(windows.map((w) => w.rebuiltWindowSpecHash)).toEqual(
      EXPECTED_WINDOW_09.rebuiltWindowSpecHashes,
    );
    expect(windows[7]!.rebuiltWindowSpecHash).toBe(
      'a5cf6eeec7067eeadd94266d972a8ecd16130bab184d0ba76b39adaf530b8131',
    );
    // Only Window 08 carries a cadence decision, and it is its OWN pinned one.
    expect(windows.map((w) => w.cadenceAuthority?.commit ?? null)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      '2c20af702c3a9aed93e41f61c28d274f01c8351a',
    ]);
    expect(windows[7]!.cadenceAuthority.sha256).toBe(WINDOW09_W08_CADENCE_DECISION.sha256);
    expect(record.adjudicationHistory.integrity).toEqual({
      holds: true,
      isFrozenP7: false,
      historicalRunReferences: 37,
      distinct: 37,
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
    ]);
    expect(record.adjudicationHistory.window08.executed).toEqual(
      EXPECTED_WINDOW_09.window08Outcomes,
    );
    expect(record.adjudicationHistory.window08.authorisedOrder).toEqual([
      'G2P:100',
      'G2P:101',
      'G2P:102',
      'G2R:96:9',
      'G2R:99:10',
    ]);
  });

  it('the current state is 101 successes and complete Q1 is [96 -> 11, 99 -> 12]', () => {
    const s = EXPECTED_WINDOW_09.currentState;
    expect(record.currentState).toMatchObject({
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
    expect(record.q1.assignments).toEqual(EXPECTED_WINDOW_09.q1Assignments);
    expect(
      record.q1.occupantsReplaced.map((o: Json) => [
        o.selectionIndex,
        o.kind,
        o.generation2ReserveRankPosition,
        o.generation2LedgerSequence,
      ]),
    ).toEqual([
      [96, 'GENERATION2_RESERVE_REPLACEMENT', 9, 9],
      [99, 'GENERATION2_RESERVE_REPLACEMENT', 10, 10],
    ]);
  });

  it('reserves 11 and 12 are the frozen schedule entries (identities checked here only)', () => {
    const basis = assessCommittedInputs(inputs.window08Inputs.committed).basis!;
    const want: Record<number, [string, string]> = {
      11: ['F CHOLET13|932004907', '4a2e24ff-627d-4f1b-aeb4-52958ec4cd5f'],
      12: ['E TENERIF29|942150331', '834f2c71-616a-4d20-9973-9e713f784888'],
    };
    for (const reserve of EXPECTED_WINDOW_09.reserves) {
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
      expect([b.echeRowKey, b.organisationId]).toEqual(
        want[reserve.generation2ReserveRankPosition],
      );
      expect(b.rootAuthorities.map((a) => a.type)).toEqual(['WEBSITE_CLAIM']);
    }
    expect(record.q1.reserves).toEqual(
      EXPECTED_WINDOW_09.reserves.map((r) => ({ ...r, rootAuthorityTypes: ['WEBSITE_CLAIM'] })),
    );
  });

  it('primaries 103-105 are the frozen draw entries (identities checked here only)', () => {
    const basis = assessCommittedInputs(inputs.window08Inputs.committed).basis!;
    const want: Record<number, [string, string]> = {
      103: ['E BARCELO31|945958842', '38067a64-ffcf-4a05-af5e-d5febcb97992'],
      104: ['F PARIS520|949449193', '019c1389-1b1e-4bfd-bad9-680ce6542475'],
      105: ['F PARIS523|879192772', '32184537-9e39-4d98-a437-98ea6d2385b8'],
    };
    for (const primary of EXPECTED_WINDOW_09.primaries) {
      const b = buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, primary.selectionIndex);
      expect([b.echeRowKey, b.organisationId]).toEqual(want[primary.selectionIndex]);
      expect([b.rankHash, b.split]).toEqual([primary.rankHash, primary.split]);
      expect(b.rootAuthorities.map((a) => a.type)).toEqual(['WEBSITE_CLAIM']);
    }
    expect(committedRecord()).not.toMatch(
      /CHOLET|TENERIF|BARCELO|PARIS52|4a2e24ff|834f2c71|38067a64|019c1389|32184537/,
    );
  });

  it('the prospective append is in memory only: 96 -> 11 (prev seq 9) then 99 -> 12 (prev seq 10), 13 entries', () => {
    const a = record.prospectiveAppend;
    expect(a.written).toBe(false);
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
    ).toEqual(EXPECTED_WINDOW_09.plannedAppend);
    expect(a.previousLedgerHash).toBe(WINDOW09_CURRENT_LEDGER_REVISION.ledgerHash);
    expect(a.entries[0].previousEntryHash).toBe(WINDOW09_CURRENT_LEDGER_REVISION.lastEntryHash);
    expect(a.entries[1].previousEntryHash).toBe(a.entries[0].entryHash);
    expect([a.prospectiveEntryCount, a.nextGeneration2ReservePosition]).toEqual([13, 13]);
    const p = EXPECTED_WINDOW_09.prospective;
    expect(record.prospectiveState).toMatchObject({
      ACQUISITION_SUCCESSFUL: p.successful,
      CURRENT_ACQUISITION_FAILURE: p.failures,
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: p.assigned,
      PENDING_CAPABILITY_REVIEW: [],
      NEVER_STARTED: p.neverStarted,
      q1: p.q1,
      accounting: p.accounting,
    });
    expect(built.prospectiveLedgerText).not.toBe(
      readFileSync(join(REPO, WINDOW09_CURRENT_LEDGER_REVISION.path), 'utf8'),
    );
  });

  it('membership is complete Q1 + exactly G2P:103-105; the order is precommitted primary-first', () => {
    const w = record.window09;
    expect(w.membership).toEqual(EXPECTED_WINDOW_09.membership);
    expect(w.defaultCadenceOrder).toEqual(EXPECTED_WINDOW_09.defaultOrder);
    expect(w.order).toEqual(EXPECTED_WINDOW_09.order);
    expect([...w.order].sort()).toEqual([...w.membership].sort());
    expect(w.workItems.map((i: Json) => i.split)).toEqual(EXPECTED_WINDOW_09.splits);
    expect(w.composition).toEqual(EXPECTED_WINDOW_09.composition);
    expect(w.membershipEqualsDefaultCadence).toBe(true);
    expect(w.plannedReplacementAppend).toEqual(built.defaultSpec.plannedReplacementAppend);
    expect(w.windowSpecHash).toBe(built.spec.windowSpecHash);
    expect(w.defaultCadenceSpecHash).toBe(built.defaultSpec.windowSpecHash);
    expect(w.defaultCadenceSpecHash).not.toBe(w.windowSpecHash);
    expect(w.adaptsToResults).toBe(false);
    expect(w.executionIdentities.every((i: Json) => i.rebuiltEqualsSpec === true)).toBe(true);
    expect(w.executionIdentities.map((i: Json) => i.workItemId)).toEqual(EXPECTED_WINDOW_09.order);
  });

  it('the cadence is exactly the Window-09 pin, verified by the generic verifier for window 9 only', () => {
    const w = record.window09;
    expect(w.executionCadence).toEqual(verifyWindowCadenceAuthority(cadenceBindingOf(inputs), 9));
    expect(w.executionCadence.authority).toMatchObject({
      commit: '9deb681e6cb7f19ad4af0f677655f278ece6c149',
      sha256: WINDOW09_CADENCE_DECISION.sha256,
      ownerDecision: 'APPROVE_WINDOW_09_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1',
    });
    expect(sha256(inputs.cadenceDecisionText)).toBe(WINDOW09_CADENCE_DECISION.sha256);
    expect(w.cadenceIntegrity).toMatchObject({
      windowOrdinal: 9,
      mode: 'PRIMARIES_THEN_Q1_REPLACEMENTS',
      defaultMode: 'Q1_REPLACEMENTS_THEN_PRIMARIES',
    });
    expect(record.bound.continuationDecision).toMatchObject({
      scope: 'WINDOW_09_CADENCE_ONLY',
      recordKind: 'GENERATION2_OWNER_CONTINUATION_DECISION',
    });
    expect(record.bound.window08CadenceDecision).toMatchObject({
      commit: '2c20af702c3a9aed93e41f61c28d274f01c8351a',
      scope: 'WINDOW_08_CADENCE_ONLY',
      broadened: false,
    });
  });

  it('P2 / P5 / P6 / P7 / P8 and both operational prerequisites', () => {
    const g = record.gates;
    expect(g.p2.threshold).toBe(3);
    expect(g.p5).toMatchObject({
      threshold: 2,
      denominator: 5,
      scope: 'CURRENT_WINDOW',
      lowYieldCountAtWindowStart: 0,
      carriedFromWindow08: 0,
      exemptForPrimaries: false,
      sticky: true,
    });
    expect([
      g.p6.beforeAppend.reserveConsumed,
      g.p6.beforeAppend.successful,
      g.p6.beforeAppend.fires,
      g.p6.afterAppend.reserveConsumed,
      g.p6.afterAppend.successful,
      g.p6.afterAppend.fires,
    ]).toEqual([11, 101, false, 13, 101, false]);
    expect(g.p7.invariants).toBe(18);
    expect(g.p7.onCurrentLedger).toMatchObject({
      held: '16/18',
      falseInvariants: EXPECTED_WINDOW_09.p7CurrentFalse,
    });
    expect(g.p7.onProspectiveLedger).toEqual({ held: '18/18', falseInvariants: [] });
    expect(g.p7.withoutTheCadenceDecision.windowCadenceAuthorityIntegrity).toBe(false);
    expect(g.operationalPrerequisites).toEqual({
      adjudicationHistoryIntegrity: true,
      windowCadenceAuthorityIntegrity: true,
      bothOutsideFrozenP7: true,
    });
    expect(g.zeroCompletedGate).toEqual({
      decision: 'CONTINUE_TO_NEXT_WORK_ITEM',
      nextWorkItemId: 'G2P:103',
      mayStartNextWorkItem: true,
    });
  });

  it('frozen P5 is unchanged: two low-yield primaries fire it after item 2, no exemption', () => {
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
        generation: { successfulOrganisationCount: 101, reserveConsumedCount: 13 },
        completed,
      });
    expect(gate([observation('G2P:103', 0)]).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    const fired = gate([observation('G2P:103', 0), observation('G2P:104', 3)]);
    expect([fired.decision, fired.mayStartNextWorkItem]).toEqual(['PAUSE_P5_LOW_RAW_YIELD', false]);
    expect(gate([observation('G2P:103', 30), observation('G2P:104', 30)]).nextWorkItemId).toBe(
      'G2P:105',
    );
    expect(spec.gateThresholds).toEqual(built.defaultSpec.gateThresholds);
  });

  it('the canonical ledger is untouched at this task terminal: eleven entries, reserve 11 unassigned', () => {
    const at = terminal ?? 'HEAD';
    const text = execFileSync(
      'git',
      ['-C', REPO, 'show', `${at}:${WINDOW09_CURRENT_LEDGER_REVISION.path}`],
      { encoding: 'utf8' },
    );
    expect(sha256(text)).toBe(WINDOW09_CURRENT_LEDGER_REVISION.fileSha256);
    expect(record.canonicalGeneration2Ledger).toEqual({
      unchanged: true,
      entryCount: 11,
      ledgerHash: WINDOW09_CURRENT_LEDGER_REVISION.ledgerHash,
      reserve11Assigned: false,
    });
  });
});

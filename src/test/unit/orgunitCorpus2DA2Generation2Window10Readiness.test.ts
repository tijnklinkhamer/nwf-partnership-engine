/**
 * Phase 2B-2D A2 Generation 2: WINDOW-10 OFFLINE READINESS - the first window
 * that begins with a CARRY-IN assigned replacement (slot 99, reserve 12,
 * sequence 12), under its own separately pinned primary-first cadence.
 *
 * Every input is committed bytes at a pinned commit (see the materialiser);
 * the record is compared with its bytes at THIS task's terminal commit (the
 * commit that adds the audit) once it exists, else the working tree - so a
 * later Window-10 authority, ledger append or live result cannot turn these
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
import { parseOperationalGeneration2Ledger } from '../harness/phase2b2d/generation2Acquisition/operationalLedger.js';
import { assessCommittedInputs } from '../harness/phase2b2d/generation2Acquisition/state.js';
import { verifyWindowCadenceAuthority } from '../harness/phase2b2d/generation2Cadence/windowCadence.js';
import {
  readWindow10Inputs,
  renderWindow10Readiness,
} from '../harness/phase2b2d/generation2Window10/materialiseWindow10Readiness.js';
import {
  EXPECTED_WINDOW_10,
  WINDOW10_CADENCE_DECISION,
  WINDOW10_CURRENT_LEDGER_REVISION,
  WINDOW10_GENERIC_REPAIR_COMMIT,
  WINDOW10_READINESS_AUDIT_PATH,
  WINDOW10_READINESS_PATH,
  WINDOW10_READINESS_TERMINAL_STATE,
  WINDOW10_W09_CADENCE_DECISION,
} from '../harness/phase2b2d/generation2Window10/window10Contract.js';
import {
  buildWindow10Readiness,
  cadenceBindingOf,
  type Window10Inputs,
  type Window10Readiness,
} from '../harness/phase2b2d/generation2Window10/window10Readiness.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
const terminal = (() => {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW10_READINESS_AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
})();
const committedRecord = (): string =>
  terminal === null
    ? readFileSync(join(REPO, WINDOW10_READINESS_PATH), 'utf8')
    : execFileSync('git', ['-C', REPO, 'show', `${terminal}:${WINDOW10_READINESS_PATH}`], {
        encoding: 'utf8',
      });

let inputs: Window10Inputs;
let built: Window10Readiness;
let record: Json;

beforeAll(() => {
  inputs = readWindow10Inputs(REPO);
  built = buildWindow10Readiness(inputs);
  record = JSON.parse(committedRecord()) as Json;
}, 300_000);

describe('Phase 2B-2D A2 Generation-2 Window-10 offline readiness', () => {
  it('re-derives byte-identically from committed bytes and authorises nothing', async () => {
    expect(await renderWindow10Readiness(inputs)).toBe(committedRecord());
    expect(record.terminalState).toBe(WINDOW10_READINESS_TERMINAL_STATE);
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
      '63de49b472d2bdc3c31e671c956969620c163416',
    );
    expect(record.bound.carryInGenericRepairCommit).toBe(WINDOW10_GENERIC_REPAIR_COMMIT);
    expect(record.bound.carryInOwnerSemanticDecision).toMatchObject({
      commit: 'c64a6c392c355c89003c7f3a41de2757473c5fd7',
      scope: 'GENERATION2_GENERIC_WINDOW_MEMBERSHIP_SEMANTICS',
      recordKind: 'GENERATION2_OWNER_SEMANTIC_DECISION',
    });
  });

  it('replays the explicit nine-window history: 41 / 41 run references, every historical spec hash', () => {
    const windows = record.adjudicationHistory.windows as Json[];
    expect(windows.map((w) => w.windowOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(windows.map((w) => w.rebuiltWindowSpecHash)).toEqual(
      EXPECTED_WINDOW_10.rebuiltWindowSpecHashes,
    );
    expect(windows[7]!.rebuiltWindowSpecHash).toBe(
      'a5cf6eeec7067eeadd94266d972a8ecd16130bab184d0ba76b39adaf530b8131',
    );
    expect(windows[8]!.rebuiltWindowSpecHash).toBe(
      'e2c7837660243dfb0420d97e2f72a59de7eb6b147fecba336a360029f8a8abdb',
    );
    // Windows 08 and 09 each carry their OWN pinned cadence decision.
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
    ]);
    expect(windows[8]!.cadenceAuthority.sha256).toBe(WINDOW10_W09_CADENCE_DECISION.sha256);
    expect(windows[8]!.liveResult.path).toMatch(/WINDOW_09_LIVE_RESULT_V2\.json$/);
    expect(record.adjudicationHistory.integrity).toEqual({
      holds: true,
      isFrozenP7: false,
      historicalRunReferences: 41,
      distinct: 41,
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
    ]);
    expect(record.adjudicationHistory.window09).toEqual({
      executed: EXPECTED_WINDOW_10.window09Outcomes,
      executionCadence: 'PRIMARIES_THEN_Q1_REPLACEMENTS',
      authorisedOrder: ['G2P:103', 'G2P:104', 'G2P:105', 'G2R:96:11', 'G2R:99:12'],
      consumedLedgerSequences: [11, 12],
      notExecuted: ['G2R:99:12'],
    });
    // sequence 12 stays consumed although its work item never ran
    expect(record.adjudicationHistory.consumedLedgerEntryCount).toBe(13);
  });

  it('the current state is 103 / failures [96, 103] / assigned [99]; Q1 excludes 99', () => {
    const s = EXPECTED_WINDOW_10.currentState;
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
    expect(record.currentState.q1).not.toContain(99);
  });

  it('G2R:99:12 is carried in automatically on its sequence-12 entry: no new entry, no second reserve', () => {
    expect(record.carryIn.occupants).toEqual(EXPECTED_WINDOW_10.carryIn);
    expect(record.q1.assignments).toEqual(EXPECTED_WINDOW_10.q1Assignments);
    expect(record.q1.assignments.map((a: Json) => a.selectionIndex)).not.toContain(99);
    expect(
      record.q1.occupantsReplaced.map((o: Json) => [
        o.selectionIndex,
        o.kind,
        o.generation2ReserveRankPosition,
        o.generation2LedgerSequence,
      ]),
    ).toEqual([
      [96, 'GENERATION2_RESERVE_REPLACEMENT', 11, 11],
      [103, 'GENERATION1_TERMINAL_OCCUPANT', null, null],
    ]);
    // the carry-in identity is the one Window 09 authorised for the same occupant
    const w09Authority = JSON.parse(built.history.windows[8]!.authority.text) as Json;
    expect(
      w09Authority.authorisedWorkItems.find((i: Json) => i.workItemId === 'G2R:99:12')
        .identityDigest,
    ).toBe(EXPECTED_WINDOW_10.carryIn[0].identityDigest);
  });

  it('reserves 12-14 are the frozen schedule entries (identities checked here only)', () => {
    const basis = assessCommittedInputs(inputs.window09Inputs.window08Inputs.committed).basis!;
    const want: Record<number, [string, string, string]> = {
      12: ['E TENERIF29|942150331', '834f2c71-616a-4d20-9973-9e713f784888', ''],
      13: [
        'I MESSINA01|999662601',
        '64a4ccf6-245c-4283-9ca6-1b46a0735fd9',
        '53c85283-2239-4a03-bdec-578df8edfc50',
      ],
      14: [
        'E BARCELO29|953604188',
        '6c49cd3b-71ff-47ce-820d-259f16225a1e',
        'a7d18316-0a53-44d9-be8a-87d5c19f976f',
      ],
    };
    for (const reserve of EXPECTED_WINDOW_10.reserves) {
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
      expect(b.rootAuthorities.map((a) => a.type)).toEqual(['WEBSITE_CLAIM']);
      if (rootId !== '') expect(b.rootAuthorities.map((a) => a.id)).toEqual([rootId]);
    }
    expect(record.q1.reserves).toEqual(
      EXPECTED_WINDOW_10.reserves.map((r) => ({ ...r, rootAuthorityTypes: ['WEBSITE_CLAIM'] })),
    );
  });

  it('primaries 106-107 are the frozen draw entries (identities checked here only)', () => {
    const basis = assessCommittedInputs(inputs.window09Inputs.window08Inputs.committed).basis!;
    const want: Record<number, [string, string, string]> = {
      106: [
        'PL KIELCE08|949406125',
        '289f816b-1dd9-4e4c-9420-d433d205445f',
        'b5122a00-50fc-46d3-8b9d-730a85977a9f',
      ],
      107: [
        'E BARCELO208|928145859',
        '88f329f3-9a5c-431f-ad4f-8efd27d91cae',
        '6d298893-4f0d-48e9-b1ee-ba00f199c7c6',
      ],
    };
    for (const primary of EXPECTED_WINDOW_10.primaries) {
      const b = buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, primary.selectionIndex);
      const [echeRowKey, organisationId, rootId] = want[primary.selectionIndex]!;
      expect([b.echeRowKey, b.organisationId]).toEqual([echeRowKey, organisationId]);
      expect([b.rankHash, b.split]).toEqual([primary.rankHash, primary.split]);
      expect(b.rootAuthorities).toEqual([{ type: 'WEBSITE_CLAIM', id: rootId }]);
    }
    expect(committedRecord()).not.toMatch(
      /TENERIF|MESSINA|BARCELO|KIELCE|834f2c71|64a4ccf6|6c49cd3b|289f816b|88f329f3|53c85283|a7d18316|b5122a00|6d298893/,
    );
  });

  it('the prospective append is in memory only: 96 -> 13 (prev seq 11) then 103 -> 14 (no prev), 15 entries', () => {
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
    ).toEqual(EXPECTED_WINDOW_10.plannedAppend);
    expect(a.previousLedgerHash).toBe(WINDOW10_CURRENT_LEDGER_REVISION.ledgerHash);
    expect(a.entries[0].previousEntryHash).toBe(WINDOW10_CURRENT_LEDGER_REVISION.lastEntryHash);
    expect(a.entries[1].previousEntryHash).toBe(a.entries[0].entryHash);
    expect([a.prospectiveEntryCount, a.nextGeneration2ReservePosition]).toEqual([15, 15]);
    const p = EXPECTED_WINDOW_10.prospective;
    expect(record.prospectiveState).toEqual({
      ACQUISITION_SUCCESSFUL: p.successful,
      CURRENT_ACQUISITION_FAILURE: p.failures,
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: p.assigned,
      PENDING_CAPABILITY_REVIEW: [],
      NEVER_STARTED: p.neverStarted,
      q1: p.q1,
      accounting: p.accounting,
    });
    const prospective = parseOperationalGeneration2Ledger(
      JSON.parse(built.prospectiveLedgerText) as unknown,
      assessCommittedInputs(inputs.window09Inputs.window08Inputs.committed).basis!.genesis,
    );
    // sequence 12 is unchanged in the prospective ledger: slot 99 keeps reserve 12
    expect(prospective.entries[12]!.entryHash).toBe(EXPECTED_WINDOW_10.carryIn[0].entryHash);
    expect(prospective.entries.filter((e) => e.selectionIndex === 99).at(-1)!.sequence).toBe(12);
  });

  it('membership is carry-in + complete Q1 + G2P:106-107; replacements 12 -> 13 -> 14; primary-first order', () => {
    const w = record.window10;
    expect(w.membership).toEqual(EXPECTED_WINDOW_10.membership);
    expect(w.defaultCadenceOrder).toEqual(EXPECTED_WINDOW_10.defaultOrder);
    expect(w.order).toEqual(EXPECTED_WINDOW_10.order);
    expect(w.order).not.toContain('G2P:108');
    expect([...w.order].sort()).toEqual([...w.membership].sort());
    expect(w.replacementGroup.map((g: Json) => [g.workItemId, g.ledgerSequence])).toEqual(
      EXPECTED_WINDOW_10.replacementGroup,
    );
    expect(w.replacementGroup.map((g: Json) => g.carryIn)).toEqual([true, false, false]);
    expect([w.replacementItems, w.carryInReplacementItems, w.primaryItems]).toEqual([3, 1, 2]);
    expect(w.workItems.map((i: Json) => i.split)).toEqual(EXPECTED_WINDOW_10.splits);
    expect(w.composition).toEqual(EXPECTED_WINDOW_10.composition);
    expect(w.membershipEqualsDefaultCadence).toBe(true);
    // the append holds ONLY the new Q1 entries
    expect(w.plannedReplacementAppend.map((p: Json) => p.sequence)).toEqual([13, 14]);
    expect(w.plannedReplacementAppend).toEqual(built.defaultSpec.plannedReplacementAppend);
    expect(w.windowSpecHash).toBe(built.spec.windowSpecHash);
    expect(w.windowSpecHash).toBe(
      '9ab4edc800d1e5ba629b5bc4fb7844fa3e886f7de33bc49065094c65bf5c68a5',
    );
    expect(w.defaultCadenceSpecHash).toBe(built.defaultSpec.windowSpecHash);
    expect(w.defaultCadenceSpecHash).not.toBe(w.windowSpecHash);
    expect(w.adaptsToResults).toBe(false);
    expect(w.executionIdentities.every((i: Json) => i.rebuiltEqualsSpec === true)).toBe(true);
    expect(w.executionIdentities.map((i: Json) => i.workItemId)).toEqual(EXPECTED_WINDOW_10.order);
  });

  it('the cadence is exactly the Window-10 pin, verified by the generic verifier for window 10 only', () => {
    const w = record.window10;
    expect(w.executionCadence).toEqual(verifyWindowCadenceAuthority(cadenceBindingOf(inputs), 10));
    expect(w.executionCadence.authority).toMatchObject({
      commit: '7b226de931752dc70028b5e20e37fa5d7a925ca5',
      sha256: WINDOW10_CADENCE_DECISION.sha256,
      ownerDecision: 'APPROVE_WINDOW_10_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1',
    });
    expect(sha256(inputs.cadenceDecisionText)).toBe(WINDOW10_CADENCE_DECISION.sha256);
    expect(w.cadenceIntegrity).toMatchObject({
      windowOrdinal: 10,
      mode: 'PRIMARIES_THEN_Q1_REPLACEMENTS',
      defaultMode: 'Q1_REPLACEMENTS_THEN_PRIMARIES',
    });
    expect(record.bound.continuationDecision).toMatchObject({
      scope: 'WINDOW_10_CADENCE_ONLY',
      recordKind: 'GENERATION2_OWNER_CONTINUATION_DECISION',
    });
    expect(record.bound.window09CadenceDecision).toMatchObject({
      commit: '9deb681e6cb7f19ad4af0f677655f278ece6c149',
      scope: 'WINDOW_09_CADENCE_ONLY',
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
      carriedFromWindow09: 0,
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
    ]).toEqual([13, 103, false, 15, 103, false]);
    expect(g.p7.invariants).toBe(18);
    expect(g.p7.onCurrentLedger).toMatchObject({
      held: '16/18',
      falseInvariants: EXPECTED_WINDOW_10.p7CurrentFalse,
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
      nextWorkItemId: 'G2P:106',
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
        generation: { successfulOrganisationCount: 103, reserveConsumedCount: 15 },
        completed,
      });
    expect(gate([observation('G2P:106', 0)]).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    const fired = gate([observation('G2P:106', 0), observation('G2P:107', 3)]);
    expect([fired.decision, fired.mayStartNextWorkItem]).toEqual(['PAUSE_P5_LOW_RAW_YIELD', false]);
    expect(gate([observation('G2P:106', 30), observation('G2P:107', 30)]).nextWorkItemId).toBe(
      'G2R:99:12',
    );
    expect(spec.gateThresholds).toEqual(built.defaultSpec.gateThresholds);
  });

  it('the canonical ledger is untouched at this task terminal: thirteen entries, reserve 13 unassigned', () => {
    const at = terminal ?? 'HEAD';
    const text = execFileSync(
      'git',
      ['-C', REPO, 'show', `${at}:${WINDOW10_CURRENT_LEDGER_REVISION.path}`],
      { encoding: 'utf8' },
    );
    expect(sha256(text)).toBe(WINDOW10_CURRENT_LEDGER_REVISION.fileSha256);
    expect(record.canonicalGeneration2Ledger).toEqual({
      unchanged: true,
      entryCount: 13,
      ledgerHash: WINDOW10_CURRENT_LEDGER_REVISION.ledgerHash,
      reserve13Assigned: false,
    });
  });
});

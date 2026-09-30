/**
 * Phase 2B-2D A2 Generation 2: WINDOW-12 OFFLINE READINESS - carry-in
 * G2R:107:16, complete Q1 [103, 106] -> reserves 17/18, and the final two
 * never-started primaries G2P:108/109, under Window 12's own separately
 * pinned primary-first cadence.
 *
 * Every input is committed bytes at a pinned commit (see the materialiser);
 * the record is compared with its bytes at THIS task's terminal commit (the
 * commit that adds the audit) once it exists, else the working tree - so a
 * later Window-12 authority, ledger append or live result cannot turn these
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
import {
  APPROVED_WINDOW_CADENCE_AUTHORITIES,
  DEFAULT_WINDOW_EXECUTION_CADENCE,
  verifyWindowCadenceAuthority,
} from '../harness/phase2b2d/generation2Cadence/windowCadence.js';
import {
  readWindow12Inputs,
  renderWindow12Readiness,
} from '../harness/phase2b2d/generation2Window12/materialiseWindow12Readiness.js';
import {
  EXPECTED_WINDOW_12,
  WINDOW12_CADENCE_DECISION,
  WINDOW12_CADENCE_PIN_COMMIT,
  WINDOW12_CURRENT_LEDGER_REVISION,
  WINDOW12_GENERIC_REPAIR_COMMIT,
  WINDOW12_READINESS_AUDIT_PATH,
  WINDOW12_READINESS_PATH,
  WINDOW12_READINESS_TERMINAL_STATE,
} from '../harness/phase2b2d/generation2Window12/window12Contract.js';
import {
  buildWindow12Readiness,
  cadenceBindingOf,
  type Window12Inputs,
  type Window12Readiness,
} from '../harness/phase2b2d/generation2Window12/window12Readiness.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
const terminal = (() => {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW12_READINESS_AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
})();
const committedRecord = (): string =>
  terminal === null
    ? readFileSync(join(REPO, WINDOW12_READINESS_PATH), 'utf8')
    : execFileSync('git', ['-C', REPO, 'show', `${terminal}:${WINDOW12_READINESS_PATH}`], {
        encoding: 'utf8',
      });

let inputs: Window12Inputs;
let built: Window12Readiness;
let record: Json;

const basisOf = () =>
  assessCommittedInputs(
    inputs.window11Inputs.window10Inputs.window09Inputs.window08Inputs.committed,
  ).basis!;

beforeAll(() => {
  inputs = readWindow12Inputs(REPO);
  built = buildWindow12Readiness(inputs);
  record = JSON.parse(committedRecord()) as Json;
}, 300_000);

describe('Phase 2B-2D A2 Generation-2 Window-12 offline readiness', () => {
  it('re-derives byte-identically from committed bytes and authorises nothing', async () => {
    expect(await renderWindow12Readiness(inputs)).toBe(committedRecord());
    expect(record.terminalState).toBe(WINDOW12_READINESS_TERMINAL_STATE);
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
    expect(record.sideEffects.window13Created).toBe(false);
    expect(record.bound.cadencePinCommit).toBe(WINDOW12_CADENCE_PIN_COMMIT);
    expect(record.bound.carryInGenericRepairCommit).toBe(WINDOW12_GENERIC_REPAIR_COMMIT);
    expect(record.bound.carryInOwnerSemanticDecision).toMatchObject({
      commit: 'c64a6c392c355c89003c7f3a41de2757473c5fd7',
      scope: 'GENERATION2_GENERIC_WINDOW_MEMBERSHIP_SEMANTICS',
      recordKind: 'GENERATION2_OWNER_SEMANTIC_DECISION',
    });
    expect(record.bound.window11).toMatchObject({
      liveResult: { commit: '32bcda7fe7d0d03108a58d7ebb262228233b0a98' },
      midWindowP5Ruling: { commit: '0b8636c188eccb2ae533f02a92ff4837910a87fe' },
      adjudication: { commit: '2e014b1dcd61ab567ef21141a2fb664456f375e4' },
    });
  });

  it('replays the explicit eleven-window history: 47 / 47 run references, every historical spec hash', () => {
    const windows = record.adjudicationHistory.windows as Json[];
    expect(windows.map((w) => w.windowOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(windows.map((w) => w.rebuiltWindowSpecHash)).toEqual(
      EXPECTED_WINDOW_12.rebuiltWindowSpecHashes,
    );
    expect(built.history.windows.map((w) => w.windowOrdinal)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    // Cadence authorities exist for exactly Windows 08, 09 and 10; Window 11 is default.
    expect(
      windows.filter((w) => w.cadenceAuthority !== undefined).map((w) => w.windowOrdinal),
    ).toEqual(EXPECTED_WINDOW_12.cadenceWindows);
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
    ]);
    expect(built.history.windows[10]!.cadenceAuthority).toBeUndefined();
    expect(windows[10]!.liveResult.path).toMatch(/WINDOW_11_LIVE_RESULT_V1\.json$/);
    expect(record.adjudicationHistory.integrity).toEqual({
      holds: true,
      isFrozenP7: false,
      historicalRunReferences: EXPECTED_WINDOW_12.historicalRunReferenceCount,
      distinct: EXPECTED_WINDOW_12.historicalRunReferenceCount,
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
    ]);
    expect(record.adjudicationHistory.window11).toEqual({
      executed: EXPECTED_WINDOW_12.window11Outcomes,
      executionCadence: 'Q1_REPLACEMENTS_THEN_PRIMARIES',
      authorisedOrder: ['G2R:99:12', 'G2R:96:13', 'G2R:103:14', 'G2R:106:15', 'G2R:107:16'],
      consumedLedgerSequences: [15, 16],
      notExecuted: ['G2R:107:16'],
    });
    // sequence 16 stays consumed although its work item never ran
    expect(record.adjudicationHistory.consumedLedgerEntryCount).toBe(17);
  });

  it('the current state is 105 / failures [103, 106] / assigned [107] / never [108, 109]; Q1 excludes 107', () => {
    const s = EXPECTED_WINDOW_12.currentState;
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
    expect(record.currentState.q1).toEqual([103, 106]);
    expect(record.currentState.q1).not.toContain(107);
  });

  it('G2R:107:16 is carried in on its sequence-16 entry: no new entry, no second reserve, same identity', () => {
    expect(record.carryIn.occupants).toEqual(EXPECTED_WINDOW_12.carryIn);
    expect(record.q1.assignments).toEqual(EXPECTED_WINDOW_12.q1Assignments);
    expect(record.q1.assignments.map((a: Json) => a.selectionIndex)).not.toContain(107);
    expect(
      record.q1.occupantsReplaced.map((o: Json) => [
        o.selectionIndex,
        o.kind,
        o.generation2ReserveRankPosition,
        o.generation2LedgerSequence,
      ]),
    ).toEqual([
      [103, 'GENERATION2_RESERVE_REPLACEMENT', 14, 14],
      [106, 'GENERATION2_RESERVE_REPLACEMENT', 15, 15],
    ]);
    // the carry-in identity is the one Window 11 authorised for the same occupant
    const w11Authority = JSON.parse(built.history.windows[10]!.authority.text) as Json;
    expect(
      w11Authority.authorisedWorkItems.find((i: Json) => i.workItemId === 'G2R:107:16')
        .identityDigest,
    ).toBe('964b38c8af815bea7778b3228c8ac231ea378afdc2a267222e63d1fe7ad3c33e');
    expect(record.prospectiveAppend.carryInEntriesAppended).toBe(0);
    expect(record.prospectiveAppend.entries.map((e: Json) => e.selectionIndex)).not.toContain(107);
  });

  it('reserves 16-18 are the frozen schedule entries (identities checked here only)', () => {
    const basis = basisOf();
    const want: Record<number, [string, string | null, string | null]> = {
      16: ['F ANGOULE21|949497402', null, null],
      17: [
        'E GRANADA13|894147165',
        '25e96d25-a1e6-4354-82c5-c31f3a9802f2',
        '36b4b9c7-5567-4cc1-a3f9-365df19ae911',
      ],
      18: [
        'F JOUY-JO02|948986115',
        'a4c54695-5880-4aa4-95fa-340905b4cdef',
        '46dc477f-6c8d-40b3-9cda-c23b15984086',
      ],
    };
    for (const reserve of EXPECTED_WINDOW_12.reserves) {
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
      expect(b.echeRowKey).toBe(echeRowKey);
      if (organisationId !== null) expect(b.organisationId).toBe(organisationId);
      expect(b.rootAuthorities.map((a) => a.type)).toEqual(['WEBSITE_CLAIM']);
      if (rootId !== null) expect(b.rootAuthorities.map((a) => a.id)).toEqual([rootId]);
    }
    const view = (r: (typeof EXPECTED_WINDOW_12.reserves)[number]) => ({
      ...r,
      rootAuthorityTypes: ['WEBSITE_CLAIM'],
      rootAuthorityCount: 1,
    });
    expect(record.carryIn.reserves).toEqual([view(EXPECTED_WINDOW_12.reserves[0])]);
    expect(record.q1.newReserves).toEqual(EXPECTED_WINDOW_12.reserves.slice(1).map(view));
  });

  it('primaries 108-109 are the frozen draw entries (identities checked here only)', () => {
    const basis = basisOf();
    const want: Record<number, [string, string, string]> = {
      108: [
        'RS UZICE02|894723151',
        'bf614244-5cb3-4235-92aa-cc3da3e1a529',
        'c8b5bcf4-30ba-47d8-8e38-7537c8828ecb',
      ],
      109: [
        'E JAEN09|944922300',
        '4f32cdf8-2a6b-42f7-9566-940699ba0ebd',
        '2ed6cb22-1bf3-4a86-bb9a-12bc603249e1',
      ],
    };
    for (const primary of EXPECTED_WINDOW_12.primaries) {
      const b = buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, primary.selectionIndex);
      const [echeRowKey, organisationId, rootId] = want[primary.selectionIndex]!;
      expect([b.echeRowKey, b.organisationId]).toEqual([echeRowKey, organisationId]);
      expect([b.rankHash, b.split]).toEqual([primary.rankHash, primary.split]);
      expect(b.rootAuthorities).toEqual([{ type: 'WEBSITE_CLAIM', id: rootId }]);
      const recorded = (record.window12.primaries as Json[]).find(
        (p) => p.workItemId === primary.workItemId,
      )!;
      expect(recorded).toMatchObject({
        selectionIndex: primary.selectionIndex,
        split: primary.split,
        rankHash: primary.rankHash,
        rootAuthorityCount: 1,
        identityDigest: b.drawEntrySha256,
      });
    }
    expect(committedRecord()).not.toMatch(
      /ANGOULE|GRANADA|JOUY|UZICE|JAEN|25e96d25|a4c54695|bf614244|4f32cdf8|36b4b9c7|46dc477f|c8b5bcf4|2ed6cb22/,
    );
  });

  it('the prospective append is in memory only: 103 -> 17 (prev seq 14) then 106 -> 18 (prev seq 15), 19 entries', () => {
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
    ).toEqual(EXPECTED_WINDOW_12.plannedAppend);
    expect(a.previousLedgerHash).toBe(WINDOW12_CURRENT_LEDGER_REVISION.ledgerHash);
    expect(a.entries[0].previousEntryHash).toBe(WINDOW12_CURRENT_LEDGER_REVISION.lastEntryHash);
    expect(a.entries[1].previousEntryHash).toBe(a.entries[0].entryHash);
    expect(a.entries.every((e: Json) => e.recordedAtUtc === a.recordedAtUtc)).toBe(true);
    expect([a.prospectiveEntryCount, a.nextGeneration2ReservePosition]).toEqual([19, 19]);
    const p = EXPECTED_WINDOW_12.prospective;
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
      basisOf().genesis,
    );
    expect(prospective.entries).toHaveLength(19);
    expect(prospective.ledgerHash).toBe(a.prospectiveLedgerHash);
    expect(prospective.entries.slice(17).map((e) => e.entryHash)).toEqual(
      a.entries.map((e: Json) => e.entryHash),
    );
    // sequence 16 is unchanged in the prospective ledger: slot 107 keeps reserve 16
    expect(prospective.entries[16]!.entryHash).toBe(EXPECTED_WINDOW_12.carryIn[0].entryHash);
    expect(prospective.entries.filter((e) => e.selectionIndex === 107).at(-1)!.sequence).toBe(16);
  });

  it('membership is exactly carry-in + complete Q1 + G2P:108-109; replacements 16 -> 17 -> 18', () => {
    const w = record.window12;
    expect(w.membership).toEqual(EXPECTED_WINDOW_12.membership);
    expect(w.membership).toHaveLength(5);
    expect(w.membership.filter((id: string) => id.startsWith('G2P:'))).toEqual([
      'G2P:108',
      'G2P:109',
    ]);
    expect(w.neverStartedPrimariesAfterThisWindow).toEqual({ from: null, to: null, count: 0 });
    expect(w.replacementGroup.map((g: Json) => [g.workItemId, g.ledgerSequence])).toEqual(
      EXPECTED_WINDOW_12.replacementGroup,
    );
    expect(w.replacementGroup.map((g: Json) => g.carryIn)).toEqual([true, false, false]);
    expect([
      w.replacementItems,
      w.carryInReplacementItems,
      w.newQ1ReplacementItems,
      w.primaryItems,
    ]).toEqual([3, 1, 2, 2]);
    expect(w.composition).toEqual(EXPECTED_WINDOW_12.composition);
    expect(w.membershipEqualsDefaultCadence).toBe(true);
    // the append holds ONLY the new Q1 entries
    expect(w.plannedReplacementAppend.map((p: Json) => p.sequence)).toEqual([17, 18]);
    expect(w.plannedReplacementAppend).toEqual(built.defaultSpec.plannedReplacementAppend);
  });

  it('the order is primary-first P108 -> P109 -> R107:16 -> R103:17 -> R106:18; the replacement group is not reordered', () => {
    const w = record.window12;
    expect(w.order).toEqual(EXPECTED_WINDOW_12.order);
    expect([...w.order].sort()).toEqual([...w.membership].sort());
    expect(w.defaultCadenceOrder).toEqual(EXPECTED_WINDOW_12.membership);
    expect(w.order.filter((id: string) => id.startsWith('G2R:'))).toEqual(
      w.defaultCadenceOrder.filter((id: string) => id.startsWith('G2R:')),
    );
    expect(w.workItems.map((i: Json) => i.split)).toEqual(EXPECTED_WINDOW_12.splits);
    expect(w.windowSpecHash).toBe(built.spec.windowSpecHash);
    expect(w.defaultCadenceSpecHash).toBe(built.defaultSpec.windowSpecHash);
    expect(w.defaultCadenceSpecHash).not.toBe(w.windowSpecHash);
    expect(w.adaptsToResults).toBe(false);
    expect(w.executionIdentities.every((i: Json) => i.rebuiltEqualsSpec === true)).toBe(true);
    expect(w.executionIdentities.map((i: Json) => i.workItemId)).toEqual(EXPECTED_WINDOW_12.order);
    expect(
      w.executionIdentities.find((i: Json) => i.workItemId === 'G2R:107:16').identityDigest,
    ).toBe(EXPECTED_WINDOW_12.carryIn[0].identityDigest);
  });

  it('the cadence is exactly the Window-12 pin; pins are [8, 9, 10, 12]; no Window-11 pin; default unchanged', () => {
    const w = record.window12;
    expect(w.executionCadence).toEqual(verifyWindowCadenceAuthority(cadenceBindingOf(inputs), 12));
    expect(w.executionCadence.authority).toMatchObject({
      commit: '6dd2f7c737ebb016ffc6429cc9c85040a1312f66',
      sha256: WINDOW12_CADENCE_DECISION.sha256,
      ownerDecision: 'APPROVE_WINDOW_12_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1',
    });
    expect(sha256(inputs.cadenceDecisionText)).toBe(WINDOW12_CADENCE_DECISION.sha256);
    expect(w.cadenceIntegrity).toMatchObject({
      windowOrdinal: 12,
      mode: 'PRIMARIES_THEN_Q1_REPLACEMENTS',
      defaultMode: 'Q1_REPLACEMENTS_THEN_PRIMARIES',
      window11PinExists: false,
    });
    expect(record.bound.continuationDecision).toMatchObject({
      scope: 'WINDOW_12_CADENCE_ONLY',
      recordKind: 'GENERATION2_OWNER_CONTINUATION_DECISION',
    });
    expect(record.bound.approvedCadenceWindowOrdinals).toEqual([8, 9, 10, 12]);
    expect(APPROVED_WINDOW_CADENCE_AUTHORITIES.map((a) => a.windowOrdinal)).toEqual([8, 9, 10, 12]);
    expect([record.bound.window11CadenceDecision, record.bound.window11CadencePin]).toEqual([
      null,
      null,
    ]);
    expect(DEFAULT_WINDOW_EXECUTION_CADENCE).toBe('Q1_REPLACEMENTS_THEN_PRIMARIES');
    const decision = JSON.parse(inputs.cadenceDecisionText) as Json;
    expect(decision.executionCadence.appliesToWindowOrdinals).toEqual([12]);
    expect(decision.ownerDecisions).toEqual([
      'PRESERVE_WINDOW_11_MID_WINDOW_P5_AND_PARTIAL_ADJUDICATION_V1',
      'APPROVE_WINDOW_12_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1',
      'APPROVE_WINDOW_12_OFFLINE_READINESS_UNDER_PRIMARY_FIRST_CADENCE_ONLY_V1',
    ]);
  });

  it('P2 / P5 / P6 / P7 / P8 and both operational prerequisites', () => {
    const g = record.gates;
    expect(g.p2.threshold).toBe(3);
    expect(g.p5).toMatchObject({
      threshold: 2,
      denominator: 5,
      scope: 'CURRENT_WINDOW',
      lowYieldCountAtWindowStart: 0,
      carriedFromWindow11: 0,
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
    ]).toEqual([17, 105, false, 19, 105, false]);
    expect(g.p7.invariants).toBe(18);
    expect(g.p7.onCurrentLedger).toMatchObject({
      held: '16/18',
      falseInvariants: EXPECTED_WINDOW_12.p7CurrentFalse,
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
      nextWorkItemId: 'G2P:108',
      mayStartNextWorkItem: true,
    });
    expect(g.p8).toMatch(/^unchanged/);
    expect(g.intendedLiveConcurrencyPolicy).toMatch(/Engine \/ shared-nwf_pe/);
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
        generation: { successfulOrganisationCount: 105, reserveConsumedCount: 19 },
        completed,
      });
    expect(gate([observation('G2P:108', 0)]).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    const fired = gate([observation('G2P:108', 0), observation('G2P:109', 3)]);
    expect([fired.decision, fired.mayStartNextWorkItem]).toEqual(['PAUSE_P5_LOW_RAW_YIELD', false]);
    expect(gate([observation('G2P:108', 30), observation('G2P:109', 30)]).nextWorkItemId).toBe(
      'G2R:107:16',
    );
    expect(spec.gateThresholds).toEqual(built.defaultSpec.gateThresholds);
  });

  it('the canonical ledger is untouched at this task terminal: seventeen entries, reserve 17 unassigned', () => {
    const at = terminal ?? 'HEAD';
    const text = execFileSync(
      'git',
      ['-C', REPO, 'show', `${at}:${WINDOW12_CURRENT_LEDGER_REVISION.path}`],
      { encoding: 'utf8' },
    );
    expect(sha256(text)).toBe(WINDOW12_CURRENT_LEDGER_REVISION.fileSha256);
    expect(Buffer.byteLength(text, 'utf8')).toBe(15288);
    expect(record.canonicalGeneration2Ledger).toEqual({
      unchanged: true,
      entryCount: 17,
      ledgerHash: WINDOW12_CURRENT_LEDGER_REVISION.ledgerHash,
      reserve17Assigned: false,
      reserve18Assigned: false,
    });
    const ledger = JSON.parse(text) as Json;
    expect(ledger.entries.map((e: Json) => e.generation2ReserveRankPosition)).not.toContain(17);
  });
});

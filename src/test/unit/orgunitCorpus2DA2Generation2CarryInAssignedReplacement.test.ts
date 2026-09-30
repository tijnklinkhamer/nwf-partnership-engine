/**
 * Phase 2B-2D A2 Generation 2: CARRY-IN ASSIGNED REPLACEMENTS.
 *
 * Window 09 validly ended with an assigned, never-executed replacement (slot
 * 99, reserve 12, ledger sequence 12). That disproved the generic planner's
 * assumption that a window begins with zero already-assigned-but-unexecuted
 * replacements. Over the REAL committed nine-window history this proves:
 *
 *   - the replay of Windows 01-09 is unchanged: 41 / 41 run references, every
 *     historical spec hash identical (zero-carry-in windows keep their bytes);
 *   - after Window 09, slot 99 is ASSIGNED, not Q1; Q1 is [96, 103];
 *   - the next window carries G2R:99:12 in automatically, plus every new
 *     complete-Q1 replacement, ordered by ledger sequence, with an append
 *     holding ONLY the new Q1 entries;
 *   - the replay accepts a window that begins with an ASSIGNED slot, and
 *     refuses an authority that omits it, reorders it, or invents another;
 *   - carry-in + Q1 beyond the window size fails closed;
 *   - P7 is 16/18 before the new append and 18/18 after it.
 *
 * Every input is read by `git show` at a PINNED commit.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
  executionEntrySha256,
} from '../harness/phase2b2d/generation2Acquisition/executionBinding.js';
import { prepareGeneration2ReplacementAppend } from '../harness/phase2b2d/generation2Acquisition/ledgerAppend.js';
import {
  GENERATION2_LEDGER_PATH,
  Generation2OperationalRefusal,
} from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import {
  parseOperationalGeneration2Ledger,
  type OperationalGeneration2Ledger,
} from '../harness/phase2b2d/generation2Acquisition/operationalLedger.js';
import {
  GENERATION2_P7_INVARIANT_NAMES,
  computeGeneration2PreflightWithAssessment,
  type Generation2Preflight,
} from '../harness/phase2b2d/generation2Acquisition/preflight.js';
import {
  assessCommittedInputs,
  deriveGeneration2CurrentState,
  planCompleteQ1,
  type CommittedInputAssessment,
  type Generation2OperationalBasis,
} from '../harness/phase2b2d/generation2Acquisition/state.js';
import {
  buildGeneration2WindowSpec,
  recomputeWindowSpecHash,
  type Generation2WindowSpec,
  type Generation2WindowWorkItem,
} from '../harness/phase2b2d/generation2Acquisition/windowSpec.js';
import {
  replayGeneration2History,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
} from '../harness/phase2b2d/generation2History/adjudicationHistory.js';
import { assessAdjudicationHistoryIntegrity } from '../harness/phase2b2d/generation2History/historyIntegrity.js';
import { synthesiseAdjudicatedWindow } from '../harness/phase2b2d/generation2Window03/synthesiseWindow.js';
import { readWindow09Inputs } from '../harness/phase2b2d/generation2Window09/materialiseWindow09Readiness.js';
import {
  cadenceBindingOf,
  eightWindowHistoryForWindow09,
} from '../harness/phase2b2d/generation2Window09/window09Readiness.js';

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const show = (commit: string, path: string): string =>
  execFileSync('git', ['-C', REPO, 'show', `${commit}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

const W09 = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_';
const W09_RECORDS = {
  authority: {
    path: `${W09}LIVE_AUTHORITY_V1.json`,
    commit: '38f14d98d6242be4f8e9560fc91bb8b258117cee',
    sha256: '97841c9a2c679b5adcd6673128353e4aa6e20b54d6474fb957bc9e2e63c61e51',
  },
  liveResult: {
    path: `${W09}LIVE_RESULT_V2.json`,
    commit: 'e5c3bf8ab93dabfc008862c108f1d68a32c7772b',
    sha256: 'e7d384ad58a03090ecdfc3130ef2eb5b4e9966b784aa1cc2f36bc2ed7825c0f1',
  },
  adjudication: {
    path: `${W09}EVIDENCE_ADJUDICATION_V1.json`,
    commit: 'ce139ff44df9248b35ceec0b04719e51371b0436',
    sha256: '9cf694e5caf0f1c6d403d045b6939cae7bd57964372c9002ce22fc44ee739fa3',
  },
} as const;
const LEDGER_13 = {
  commit: '8e65dd744d1933c5824c09f856de62f63f21b0c1',
  fileSha256: 'bdbb1b7beecf715b9e6f0e94b63e9046507c3605e2c662701606207db7919bf7',
  bytes: 12733,
  ledgerHash: '5a27fb02ddca755af5c7712c0de650028b0e7ef18b5b752cfd2170da0b7dd768',
} as const;
const HISTORICAL_SPEC_HASHES = [
  'af9eafe58251a9dbb6a0af5baae0258b2a82a1f1183554d45f3b2dd14898fb23',
  '59bb957942e6f06e8c530bb5dffcd3118f9e3ff5b4a3fc9e1af8ea7e03297b9c',
  '012f983bd0b59b5fe20cf628cf765418ea8046d3f28c1eaafc70d2e679d30418',
  '8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da',
  '1714e3c9f9cd175cc6650e8cde150dee0f1c18ae742cc4508235291bee061cad',
  '470f0d281d104b2d099b8e8c62ff65ef4f58678adbba8e422c167a7398935ac0',
  '6a52a37a49b5b48a158a8a6535fdb6355f7b5e1225c902f841de9b261197cce3',
  'a5cf6eeec7067eeadd94266d972a8ecd16130bab184d0ba76b39adaf530b8131',
  'e2c7837660243dfb0420d97e2f72a59de7eb6b147fecba336a360029f8a8abdb',
];
const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
/** Illustrative only: never a live timestamp. */
const ILLUSTRATIVE = '2026-09-30T15:30:00Z';
/** The next window, in the legacy default replacement-first order. */
const DEFAULT_ORDER = ['G2R:99:12', 'G2R:96:13', 'G2R:103:14', 'G2P:106', 'G2P:107'];

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}
const bind = (pin: { path: string; commit: string }): CommittedRecordBinding => {
  const text = show(pin.commit, pin.path);
  return { path: pin.path, sha256: sha256(text), text };
};
const ids = (spec: Generation2WindowSpec): string[] => spec.workItems.map((i) => i.workItemId);
const falses = (pf: Generation2Preflight): string[] =>
  GENERATION2_P7_INVARIANT_NAMES.filter((n) => !pf.invariants[n]);
const reseal = (
  spec: Generation2WindowSpec,
  workItems: readonly Generation2WindowWorkItem[],
): Generation2WindowSpec => {
  const next = {
    ...spec,
    workItems: workItems.map((item, k) => ({ ...item, order: k + 1 })),
  } as Generation2WindowSpec;
  return { ...next, windowSpecHash: recomputeWindowSpecHash(next) };
};

let assessment: CommittedInputAssessment;
let basis: Generation2OperationalBasis;
let nine: Generation2AdjudicationHistory;
let ledgerText: string;
let ledger: OperationalGeneration2Ledger;
let spec: Generation2WindowSpec;
let prospectiveText: string;

const specOf = (plannedWindowSize: number): Generation2WindowSpec =>
  buildGeneration2WindowSpec({
    basis,
    startingLedger: ledger,
    startingLedgerFile: { sha256: sha256(ledgerText), bytes: bytesOf(ledgerText) },
    plannedWindowSize,
    history: nine,
  });

beforeAll(() => {
  const inputs = readWindow09Inputs(REPO);
  assessment = assessCommittedInputs(inputs.window08Inputs.committed);
  basis = assessment.basis!;
  const w09 = {
    windowOrdinal: 9,
    authority: bind(W09_RECORDS.authority),
    liveResult: bind(W09_RECORDS.liveResult),
    adjudication: bind(W09_RECORDS.adjudication),
    startingLedgerText: inputs.currentLedgerText,
    cadenceAuthority: cadenceBindingOf(inputs),
  };
  nine = { windows: [...eightWindowHistoryForWindow09(inputs).windows, w09] };
  ledgerText = show(LEDGER_13.commit, GENERATION2_LEDGER_PATH);
  ledger = parseOperationalGeneration2Ledger(JSON.parse(ledgerText) as unknown, basis.genesis);
  spec = specOf(5);
  const append = prepareGeneration2ReplacementAppend({
    basis,
    ledger,
    assignments: planCompleteQ1(basis, ledger, nine),
    recordedAtUtc: ILLUSTRATIVE,
    history: nine,
  });
  prospectiveText = `${JSON.stringify(append.nextLedger, null, 2)}\n`;
}, 300_000);

describe('Generation-2 carry-in assigned replacements: the real post-Window-09 state', () => {
  it('pins the committed Window-09 records and the thirteen-entry ledger', () => {
    for (const [k, pin] of Object.entries(W09_RECORDS)) {
      expect(nine.windows[8]![k as keyof typeof W09_RECORDS].sha256, k).toBe(pin.sha256);
    }
    expect([sha256(ledgerText), bytesOf(ledgerText)]).toEqual([
      LEDGER_13.fileSha256,
      LEDGER_13.bytes,
    ]);
    expect([ledger.ledgerHash, ledger.entries.length]).toEqual([LEDGER_13.ledgerHash, 13]);
  });

  it('replays Windows 01-09 unchanged: every historical spec hash, 41 / 41 run references', () => {
    const integrity = assessAdjudicationHistoryIntegrity(basis, ledger, nine);
    expect(integrity.failures).toEqual([]);
    expect(integrity.rebuiltWindowSpecHashes).toEqual(HISTORICAL_SPEC_HASHES);
    expect(integrity.historicalRunReferences).toHaveLength(41);
    expect(new Set(integrity.historicalRunReferences).size).toBe(41);
    // Every historical window began with zero assigned slots and carried none in.
    for (const window of integrity.replay!.windows) {
      const replacements = window.authorisedWorkItemIds.filter((id) => id.startsWith('G2R:'));
      expect(replacements).toHaveLength(window.consumedLedgerSequences.length);
    }
    expect(integrity.replay!.consumedLedgerEntryCount).toBe(13);
  });

  it('after Window 09: 103 successful, failures [96, 103], slot 99 ASSIGNED to reserve 12, never started 106..109', () => {
    const state = deriveGeneration2CurrentState(basis, ledger, nine);
    expect(state.successfulOrganisationCount).toBe(103);
    expect(state.currentAcquisitionFailure).toEqual([96, 103]);
    expect(state.q1Reasons).toEqual([
      { selectionIndex: 96, reason: HOST },
      { selectionIndex: 103, reason: MIN_PAGES },
    ]);
    expect(state.replacementAssignedAwaitingExecution).toEqual([99]);
    expect(state.neverStarted).toEqual([106, 107, 108, 109]);
    expect(state.q1).toEqual([96, 103]);
    expect(state.q1).not.toContain(99);
    expect(state.accounting).toBe(
      '103 successful + 2 failed + 1 assigned + 0 pending + 4 never started = 110',
    );
    const e12 = ledger.entries[12]!;
    expect([e12.sequence, e12.selectionIndex, e12.generation2ReserveRankPosition]).toEqual([
      12, 99, 12,
    ]);
  });

  it('complete Q1 assigns ONLY the new failures: 96 -> 13, 103 -> 14; slot 99 gets no second reserve', () => {
    expect(
      planCompleteQ1(basis, ledger, nine).map((a) => [
        a.selectionIndex,
        a.generation2ReserveRankPosition,
        a.reason,
      ]),
    ).toEqual([
      [96, 13, HOST],
      [103, 14, MIN_PAGES],
    ]);
    const assign = (selectionIndex: number, position: number, reason: string) => ({
      selectionIndex,
      generation2ReserveRankPosition: position,
      reason,
    });
    for (const assignments of [
      [assign(96, 13, HOST), assign(99, 14, HOST), assign(103, 15, MIN_PAGES)],
      [assign(99, 13, HOST), assign(103, 14, MIN_PAGES)],
    ]) {
      expect(
        codeOf(() =>
          prepareGeneration2ReplacementAppend({
            basis,
            ledger,
            assignments: assignments as never,
            recordedAtUtc: ILLUSTRATIVE,
            history: nine,
          }),
        ),
      ).not.toBe('NO_REFUSAL');
    }
  });

  it('the next window carries R99:12 in automatically, then the new Q1 replacements, in ledger-sequence order', () => {
    expect(ids(spec)).toEqual(DEFAULT_ORDER);
    expect(spec.planningState.replacementAssignedAwaitingExecution).toEqual([99]);
    expect(spec.planningState.q1).toEqual([96, 103]);
    // the append holds ONLY the new Q1 entries
    expect(
      spec.plannedReplacementAppend.map((p) => [
        p.sequence,
        p.selectionIndex,
        p.generation2ReserveRankPosition,
        p.split,
        p.reason,
        p.replacedOccupantKind,
        p.previousSequenceForSlot,
      ]),
    ).toEqual([
      [13, 96, 13, 'DEV_CONFIRM', HOST, 'GENERATION2_RESERVE_REPLACEMENT', 11],
      [14, 103, 14, 'DEV_CONFIRM', MIN_PAGES, 'GENERATION1_TERMINAL_OCCUPANT', null],
    ]);
    const carry = spec.workItems[0]!;
    expect(carry).toMatchObject({
      kind: 'REPLACEMENT',
      workItemId: 'G2R:99:12',
      selectionIndex: 99,
      generation2ReserveRankPosition: 12,
      split: 'FINAL_HOLDOUT',
      replacementReason: HOST,
      replacesOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
    });
    // the SAME assigned-occupant identity Window 09 authorised
    expect(carry.identityDigest).toBe(
      'b0acb1711b129ff7d8f68ca07b62737d83a6b4f70ed0fa835a08bb7941d01587',
    );
    expect(carry.identityDigest).toBe(
      executionEntrySha256(buildReserveExecutionBinding(basis.frameIndex, basis.schedule, 12)),
    );
    const w09Authority = JSON.parse(nine.windows[8]!.authority.text) as {
      authorisedWorkItems: Generation2WindowWorkItem[];
    };
    const { order: _drop, ...carryWithoutOrder } = carry;
    const { order: _w09, ...w09Item } = w09Authority.authorisedWorkItems.find(
      (i) => i.workItemId === 'G2R:99:12',
    )!;
    expect(carryWithoutOrder).toEqual(w09Item);
    expect(spec.workItems.slice(3).map((i) => i.identityDigest)).toEqual(
      [106, 107].map(
        (s) => buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, s).drawEntrySha256,
      ),
    );
    expect(spec.gateThresholds).toEqual({
      p2RobotsRefusalWindowCount: 3,
      p5LowRawYieldWindowCount: 2,
    });
  });

  it('every replacement obligation must fit: carry-in + Q1 beyond the window fails closed', () => {
    expect(ids(specOf(3))).toEqual(DEFAULT_ORDER.slice(0, 3));
    expect(ids(specOf(6))).toEqual([...DEFAULT_ORDER, 'G2P:108']);
    expect(codeOf(() => specOf(2))).toBe('REPLACEMENT_OBLIGATIONS_EXCEED_WINDOW');
    expect(codeOf(() => specOf(1))).toBe('Q1_EXCEEDS_WINDOW');
  });

  it('P7 is 16/18 before the new append and 18/18 after it; the carry-in is checked on both', () => {
    const preflight = (currentLedgerText: string, expected = spec) =>
      computeGeneration2PreflightWithAssessment(assessment, {
        currentLedgerText,
        startingLedgerText: ledgerText,
        expectedWindowSpec: expected,
        adjudicationHistory: nine,
      });
    const before = preflight(ledgerText);
    expect(falses(before)).toEqual([
      'plannedReplacementAppendRecorded',
      'postAppendOccupantsMatchAssignedReserves',
    ]);
    const after = preflight(prospectiveText);
    expect(falses(after)).toEqual([]);
    expect(after.currentLedgerEntryCount).toBe(15);
    expect(after.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(true);
    // a spec that drops the carry-in (the old membership) is not the governed window
    const p108 = specOf(6).workItems.find((i) => i.workItemId === 'G2P:108')!;
    const dropped = reseal(spec, [...spec.workItems.slice(1), p108]);
    const pf = preflight(prospectiveText, dropped);
    expect(falses(pf)).toEqual(
      expect.arrayContaining(['windowSpecHashValid', 'workItemsMatchGovernance']),
    );
    expect(pf.invariants.completeQ1EqualsPlanningQ1).toBe(true);
  });
});

describe('Generation-2 carry-in assigned replacements: the history replay', () => {
  const synthesise = (windowSpec: Generation2WindowSpec) =>
    synthesiseAdjudicatedWindow({
      basis,
      priorHistory: nine,
      startingLedgerText: ledgerText,
      prospectiveLedgerText: prospectiveText,
      spec: windowSpec,
      verdicts: {},
      runRefSeed: 'carry-in-test',
    });

  it('accepts a window that begins with an ASSIGNED slot and executes its carry-in occupant', () => {
    const next = synthesise(spec);
    const integrity = assessAdjudicationHistoryIntegrity(basis, next.ledger, next.history);
    expect(integrity.failures).toEqual([]);
    const w10 = integrity.replay!.windows[9]!;
    expect(w10.stateBefore.replacementAssignedAwaitingExecution).toEqual([96, 99, 103]);
    expect(w10.consumedLedgerSequences).toEqual([13, 14]);
    expect(w10.authorisedWorkItemIds).toEqual(DEFAULT_ORDER);
    expect(integrity.rebuiltWindowSpecHashes).toEqual([
      ...HISTORICAL_SPEC_HASHES,
      spec.windowSpecHash,
    ]);
    expect(integrity.historicalRunReferences).toHaveLength(46);
    // executed once, the occupant is no longer assigned and cannot be adjudicated again
    const after = integrity.replay!.final;
    expect(after.replacementAssignedAwaitingExecution).toEqual([]);
    expect(after.acquisitionSuccessful).toHaveLength(108);
    const following = buildGeneration2WindowSpec({
      basis,
      startingLedger: next.ledger,
      startingLedgerFile: { sha256: sha256(next.ledgerText), bytes: bytesOf(next.ledgerText) },
      plannedWindowSize: 2,
      history: next.history,
    });
    expect(ids(following)).toEqual(['G2P:108', 'G2P:109']);
  });

  it('refuses an authority that omits, reorders or invents a carry-in occupant', () => {
    const p108 = specOf(6).workItems.find((i) => i.workItemId === 'G2P:108')!;
    const item = (id: string) => spec.workItems.find((i) => i.workItemId === id)!;
    const forgeries: Generation2WindowWorkItem[][] = [
      // omitted: the pre-repair membership
      [item('G2R:96:13'), item('G2R:103:14'), item('G2P:106'), item('G2P:107'), p108],
      // reordered: a new Q1 assignment ahead of the older carry-in
      [item('G2R:96:13'), item('G2R:99:12'), item('G2R:103:14'), item('G2P:106'), item('G2P:107')],
      // invented: a second carry-in on an unassigned slot
      [
        item('G2R:99:12'),
        item('G2R:96:13'),
        item('G2R:103:14'),
        { ...item('G2R:99:12'), workItemId: 'G2R:106:12', selectionIndex: 106 },
        item('G2P:107'),
      ],
    ];
    for (const workItems of forgeries) {
      const next = synthesise(reseal(spec, workItems));
      expect(codeOf(() => replayGeneration2History(basis, next.ledger, next.history))).toBe(
        'HISTORY_AUTHORITY_WORK_ITEM',
      );
    }
  });
});

/**
 * Phase 2B-2D A2 Generation 2: the ADJUDICATION-AWARE STATE BRIDGE and the
 * WINDOW-02 OFFLINE READINESS - the proofs.
 *
 * Reads only committed bytes - at this task's own terminal commit once it
 * exists, so a later, separately authorised Window-02 append or authority
 * cannot turn these claims into a temporal defect. Opens no socket and no
 * database, writes no file, assigns no reserve and never mutates the
 * canonical Generation-2 ledger: every append here exists in memory only.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ReplacementReason } from '../harness/phase2b2d/continuationWindow/windowContract.js';
import type { Generation2LedgerEntry } from '../harness/phase2b2d/generation2/generation2Ledger.js';
import { p6Fires } from '../harness/phase2b2d/generation2Freeze/freezeArtifacts.js';
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
  executionEntrySha256,
} from '../harness/phase2b2d/generation2Acquisition/executionBinding.js';
import { evaluateGeneration2WindowGate } from '../harness/phase2b2d/generation2Acquisition/gateAdapter.js';
import { prepareGeneration2ReplacementAppend } from '../harness/phase2b2d/generation2Acquisition/ledgerAppend.js';
import { COMMITTED_JSON_DIRECTORIES } from '../harness/phase2b2d/generation2Acquisition/materialiseReadiness.js';
import {
  GENERATION2_LEDGER_PATH,
  Generation2OperationalRefusal,
  PINNED,
} from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import {
  computeEntryHash,
  parseOperationalGeneration2Ledger,
  resolveCrossGenerationOccupant,
  validateOperationalGeneration2Ledger,
  withEntries,
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
  type CommittedTexts,
} from '../harness/phase2b2d/generation2Acquisition/state.js';
import {
  buildGeneration2WindowSpec,
  type Generation2WindowSpec,
} from '../harness/phase2b2d/generation2Acquisition/windowSpec.js';
import {
  EMPTY_GENERATION2_HISTORY,
  accountingOf,
  bySplitOf,
  replayGeneration2History,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
  type Generation2WindowHistoryBinding,
} from '../harness/phase2b2d/generation2History/adjudicationHistory.js';
import {
  CURRENT_LEDGER_REVISION,
  EXPECTED_WINDOW_02,
  GENESIS_REVISION_COMMIT,
  WINDOW02_PLANNED_SIZE,
  WINDOW02_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  WINDOW02_READINESS_AUDIT_PATH,
  WINDOW02_READINESS_PATH,
  WINDOW02_READINESS_STARTING_HEAD,
  WINDOW02_READINESS_TERMINAL_STATE,
  WINDOW_01_HISTORY_PINS,
} from '../harness/phase2b2d/generation2History/historyContract.js';
import { assessAdjudicationHistoryIntegrity } from '../harness/phase2b2d/generation2History/historyIntegrity.js';
import { renderWindow02Readiness } from '../harness/phase2b2d/generation2History/materialiseWindow02Readiness.js';
import {
  NEGATIVE_HISTORY_ATTACKS,
  buildWindow02Readiness,
  window01History,
} from '../harness/phase2b2d/generation2History/window02Readiness.js';

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The commit that added this task's audit, or null while it is uncommitted. */
function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW02_READINESS_AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}
const TERMINAL = terminalCommit();
/** Bytes as this task left them: its terminal commit, else the working tree. */
const readState = (path: string): string =>
  TERMINAL === null ? readFileSync(join(REPO, path), 'utf8') : git('show', `${TERMINAL}:${path}`);
const namesState = (dir: string): string[] =>
  TERMINAL === null
    ? readdirSync(join(REPO, dir))
    : git('ls-tree', '--name-only', `${TERMINAL}:${dir}`).split('\n').filter(Boolean);

const GENESIS_TEXT = git('show', `${GENESIS_REVISION_COMMIT}:${GENERATION2_LEDGER_PATH}`);
const CURRENT_TEXT = readState(GENERATION2_LEDGER_PATH);
function committedState(): CommittedTexts {
  const committed = new Map<string, string>();
  for (const dir of COMMITTED_JSON_DIRECTORIES) {
    for (const name of namesState(dir)) {
      if (name.endsWith('.json')) committed.set(`${dir}/${name}`, readState(`${dir}/${name}`));
    }
  }
  committed.set(GENERATION2_LEDGER_PATH, GENESIS_TEXT);
  return committed;
}
const COMMITTED = committedState();
const ASSESSMENT = assessCommittedInputs(COMMITTED);
const BASIS = ASSESSMENT.basis!;
const CURRENT = parseOperationalGeneration2Ledger(JSON.parse(CURRENT_TEXT), BASIS.genesis);
const HISTORY = window01History(COMMITTED, GENESIS_TEXT);
const W01 = HISTORY.windows[0]!;
const READINESS = buildWindow02Readiness(COMMITTED, CURRENT_TEXT, GENESIS_TEXT);
const SPEC = READINESS.spec;

const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE' as const;
const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET' as const;
const ROBOTS = 'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED' as const;

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}

const rebind = (binding: CommittedRecordBinding, value: unknown): CommittedRecordBinding => {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  return { path: binding.path, sha256: sha256(text), text };
};
const refOf = (binding: CommittedRecordBinding) => ({
  path: binding.path,
  sha256: binding.sha256,
  bytes: bytesOf(binding.text),
});
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Tampers one Window-01 record and RE-SEALS every downstream reference, as an
 * attacker controlling the pins would: the semantic layer - not the hash
 * pin - must be what refuses.
 */
function tampered(
  mutate: {
    authority?: (r: Json) => void;
    live?: (r: Json) => void;
    adjudication?: (r: Json) => void;
  },
  base: Generation2WindowHistoryBinding = W01,
): Generation2AdjudicationHistory {
  const authorityJson = JSON.parse(base.authority.text) as Json;
  mutate.authority?.(authorityJson);
  const authority = mutate.authority ? rebind(base.authority, authorityJson) : base.authority;
  const liveJson = JSON.parse(base.liveResult.text) as Json;
  if (mutate.authority)
    liveJson.boundAuthority = { ...liveJson.boundAuthority, ...refOf(authority) };
  mutate.live?.(liveJson);
  const liveResult =
    mutate.authority || mutate.live ? rebind(base.liveResult, liveJson) : base.liveResult;
  const adjudicationJson = JSON.parse(base.adjudication.text) as Json;
  adjudicationJson.bound.liveResult = {
    ...adjudicationJson.bound.liveResult,
    ...refOf(liveResult),
  };
  adjudicationJson.bound.authority = { ...adjudicationJson.bound.authority, ...refOf(authority) };
  mutate.adjudication?.(adjudicationJson);
  return {
    windows: [
      {
        ...base,
        authority,
        liveResult,
        adjudication: rebind(base.adjudication, adjudicationJson),
      },
    ],
  };
}
const refusedWith = (history: Generation2AdjudicationHistory, ledger = CURRENT): string =>
  refusal(() => deriveGeneration2CurrentState(BASIS, ledger, history));

const preflightOf = (
  currentText: string,
  spec: Generation2WindowSpec = SPEC,
  history: Generation2AdjudicationHistory = HISTORY,
  startingText: string = CURRENT_TEXT,
): Generation2Preflight =>
  computeGeneration2PreflightWithAssessment(ASSESSMENT, {
    currentLedgerText: currentText,
    startingLedgerText: startingText,
    expectedWindowSpec: spec,
    adjudicationHistory: history,
  });
const falseInvariants = (p: Generation2Preflight): string[] =>
  GENERATION2_P7_INVARIANT_NAMES.filter((name) => !p.invariants[name]);

describe('Phase 2B-2D A2 Generation-2 adjudication-aware state bridge', () => {
  it('starts from the exact committed inputs and the pinned canonical ledger revision', () => {
    expect(ASSESSMENT.failures).toEqual([]);
    expect(Object.values(ASSESSMENT.checks).every(Boolean)).toBe(true);
    expect(sha256(GENESIS_TEXT)).toBe(PINNED.genesisLedger.sha256);
    expect(sha256(CURRENT_TEXT)).toBe(CURRENT_LEDGER_REVISION.fileSha256);
    expect(CURRENT.ledgerHash).toBe(CURRENT_LEDGER_REVISION.ledgerHash);
    expect(CURRENT.entries).toHaveLength(2);
    for (const role of ['authority', 'liveResult', 'adjudication'] as const) {
      expect(W01[role].sha256).toBe(WINDOW_01_HISTORY_PINS[role].sha256);
      expect(sha256(git('show', `${WINDOW_01_HISTORY_PINS[role].commit}:${W01[role].path}`))).toBe(
        W01[role].sha256,
      );
    }
    expect(git('merge-base', '--is-ancestor', WINDOW02_READINESS_STARTING_HEAD, 'HEAD')).toBe('');
  });

  it('(A) zero history reproduces the historical first-window state exactly', () => {
    const state = deriveGeneration2CurrentState(BASIS, BASIS.genesis);
    expect(state).toMatchObject({
      successfulOrganisationCount: 75,
      currentAcquisitionFailure: [75, 76],
      replacementAssignedAwaitingExecution: [],
      q1: [75, 76],
      nextGeneration2ReservePosition: 0,
    });
    expect(state.neverStarted).toEqual(Array.from({ length: 33 }, (_, k) => 77 + k));
    expect(
      planCompleteQ1(BASIS, BASIS.genesis).map((a) => [
        a.selectionIndex,
        a.generation2ReserveRankPosition,
      ]),
    ).toEqual([
      [75, 0],
      [76, 1],
    ]);
    // An explicit empty history is the same thing as no history.
    expect(deriveGeneration2CurrentState(BASIS, BASIS.genesis, EMPTY_GENERATION2_HISTORY)).toEqual(
      state,
    );
    // The first window rebuilt with zero history is the spec Window 01 was authorised on.
    const w01Spec = buildGeneration2WindowSpec({
      basis: BASIS,
      startingLedger: BASIS.genesis,
      startingLedgerFile: { sha256: sha256(GENESIS_TEXT), bytes: bytesOf(GENESIS_TEXT) },
      plannedWindowSize: 5,
    });
    expect(w01Spec.windowSpecHash).toBe(
      (JSON.parse(W01.authority.text) as Json).boundWindowSpec.windowSpecHash,
    );
    expect('adjudicationHistory' in w01Spec).toBe(false);
  });

  it('the defect: zero history cannot see Window 01 and reads the current ledger as 75 / [] / [75,76]', () => {
    const state = deriveGeneration2CurrentState(BASIS, CURRENT);
    expect(state).toMatchObject({
      successfulOrganisationCount: 75,
      currentAcquisitionFailure: [],
      replacementAssignedAwaitingExecution: [75, 76],
      q1: [],
    });
    expect(state.neverStarted[0]).toBe(77);
  });

  it('(B) replays Window 01 item by item and every summary equals the replay', () => {
    const replay = replayGeneration2History(BASIS, CURRENT, HISTORY);
    expect(replay.consumedLedgerEntryCount).toBe(2);
    const window = replay.windows[0]!;
    expect(window.executed.map((i) => [i.workItemId, i.verdict, i.q3Reason])).toEqual(
      EXPECTED_WINDOW_02.window01Outcomes,
    );
    const adjudication = JSON.parse(W01.adjudication.text) as Json;
    expect(adjudication.terminalState).toBe(WINDOW_01_HISTORY_PINS.adjudication.terminalState);
    expect(window.executed.map((i) => i.runRefSha256)).toEqual(
      (adjudication.items as Json[]).map((i) => i.runRefSha256),
    );
    expect(window.stateBefore).toMatchObject({
      acquisitionSuccessful: expect.any(Array),
      currentAcquisitionFailure: [],
      replacementAssignedAwaitingExecution: [75, 76],
    });
    expect(window.consumedLedgerSequences).toEqual([0, 1]);
    const integrity = assessAdjudicationHistoryIntegrity(BASIS, CURRENT, HISTORY);
    expect(integrity).toMatchObject({ holds: true, isFrozenP7: false, windowCount: 1 });
    expect(integrity.rebuiltWindowSpecHashes).toEqual([window.windowSpecHash]);
  });

  it('(C) derives 79 successful (14/33/32), failure [78], never-started 80..109', () => {
    const state = deriveGeneration2CurrentState(BASIS, CURRENT, HISTORY);
    expect(state).toMatchObject({
      successfulOrganisationCount: 79,
      currentAcquisitionFailure: [78],
      replacementAssignedAwaitingExecution: [],
      pendingCapabilityReview: [],
      carryForwardRefused: [],
      ledgerEntryCount: 2,
      nextGeneration2ReservePosition: 2,
      accounting: '79 successful + 1 failed + 0 assigned + 0 pending + 30 never started = 110',
    });
    expect(bySplitOf(BASIS, state.acquisitionSuccessful)).toEqual(
      EXPECTED_WINDOW_02.currentState.successfulBySplit,
    );
    expect(state.neverStarted).toEqual(Array.from({ length: 30 }, (_, k) => 80 + k));
    expect(p6Fires({ reserveConsumedCount: 2, successfulOrganisationCount: 79 })).toBe(false);
  });

  it('(D) Q1 is [78] -> Generation-2 reserve 2, HOST_UNREACHABLE, and nothing else', () => {
    const state = deriveGeneration2CurrentState(BASIS, CURRENT, HISTORY);
    expect(state.q1).toEqual([78]);
    expect(state.q1Reasons).toEqual([{ selectionIndex: 78, reason: HOST }]);
    expect(planCompleteQ1(BASIS, CURRENT, HISTORY)).toEqual([
      { selectionIndex: 78, generation2ReserveRankPosition: 2, reason: HOST },
    ]);
  });

  it('(E) the prospective append is exactly one entry: sequence 2, slot 78 -> reserve 2, chained to entry 1', () => {
    const append = prepareGeneration2ReplacementAppend({
      basis: BASIS,
      ledger: CURRENT,
      assignments: planCompleteQ1(BASIS, CURRENT, HISTORY),
      recordedAtUtc: WINDOW02_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      history: HISTORY,
    });
    expect(append.appendedEntries).toHaveLength(1);
    const entry = append.appendedEntries[0]!;
    expect(entry).toMatchObject({ ...EXPECTED_WINDOW_02.prospectiveAppend });
    expect(entry.previousEntryHash).toBe(CURRENT.entries[1]!.entryHash);
    const before = resolveCrossGenerationOccupant(BASIS, CURRENT, 78);
    expect(before).toMatchObject({
      kind: 'GENERATION1_TERMINAL_OCCUPANT',
      generation1OccupantKind: 'ORIGINAL_SELECTION',
    });
    expect(entry.replacedEcheRowKey).toBe(before.echeRowKey);
    expect(entry.replacementEcheRowKey).toBe(BASIS.schedule[2]!.echeRowKey);
    // Without the history the same append is refused: 78 is not an obligation there.
    expect(
      refusal(() =>
        prepareGeneration2ReplacementAppend({
          basis: BASIS,
          ledger: CURRENT,
          assignments: [{ selectionIndex: 78, generation2ReserveRankPosition: 2, reason: HOST }],
          recordedAtUtc: WINDOW02_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
        }),
      ),
    ).toBe('NOTHING_TO_APPEND');
  });

  it('(F) after the append: 79 / [] / [78] assigned / 80..109, Q1 empty, 3 entries, next reserve 3', () => {
    const prospective = parseOperationalGeneration2Ledger(
      JSON.parse(READINESS.prospectiveLedgerText),
      BASIS.genesis,
    );
    expect(prospective.entries).toHaveLength(3);
    const state = deriveGeneration2CurrentState(BASIS, prospective, HISTORY);
    expect(state).toMatchObject({
      successfulOrganisationCount: 79,
      currentAcquisitionFailure: [],
      replacementAssignedAwaitingExecution: [78],
      q1: [],
      ledgerEntryCount: 3,
      nextGeneration2ReservePosition: 3,
      accounting: '79 successful + 0 failed + 1 assigned + 0 pending + 30 never started = 110',
    });
    // The unadjudicated suffix is assigned, never success or failure.
    expect(replayGeneration2History(BASIS, prospective, HISTORY).consumedLedgerEntryCount).toBe(2);
  });

  it('(G)(H) Window 02 is derived as G2R:78:2, G2P:80..83 with the frozen splits', () => {
    expect(SPEC.workItems.map((i) => ({ workItemId: i.workItemId, split: i.split }))).toEqual(
      EXPECTED_WINDOW_02.workItems,
    );
    for (const item of SPEC.workItems) {
      expect(item.split).toBe(BASIS.draw.selection[item.selectionIndex]!.split);
    }
    expect(SPEC.plannedWindowSize).toBe(WINDOW02_PLANNED_SIZE);
    expect(SPEC.plannedReplacementAppend).toEqual([EXPECTED_WINDOW_02.prospectiveAppend]);
    expect(SPEC.startingLedger).toMatchObject({
      fileSha256: CURRENT_LEDGER_REVISION.fileSha256,
      ledgerHash: CURRENT_LEDGER_REVISION.ledgerHash,
      entryCount: 2,
    });
    expect(SPEC.adjudicationHistory).toMatchObject({ windowCount: 1, consumedLedgerEntryCount: 2 });
    expect(SPEC.planningState).toMatchObject({
      successfulOrganisationCount: 79,
      currentAcquisitionFailure: [78],
      q1: [78],
      neverStartedFrom: 80,
      neverStartedTo: 109,
      neverStartedCount: 30,
    });
  });

  it('(I) every work item re-binds to the frozen schedule/frame/draw digest', () => {
    for (const item of SPEC.workItems) {
      const digest =
        item.kind === 'REPLACEMENT'
          ? executionEntrySha256(
              buildReserveExecutionBinding(
                BASIS.frameIndex,
                BASIS.schedule,
                item.generation2ReserveRankPosition!,
              ),
            )
          : buildPrimaryExecutionBinding(BASIS.frameIndex, BASIS.draw, item.selectionIndex)
              .drawEntrySha256;
      expect(digest).toBe(item.identityDigest);
      expect(item.rootAuthorityCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('(J) P2 3, P5 2, P6 false at 3 consumed / 79 successes; gate continues only after the append', () => {
    expect(SPEC.gateThresholds).toEqual({
      p2RobotsRefusalWindowCount: 3,
      p5LowRawYieldWindowCount: 2,
    });
    expect(p6Fires({ reserveConsumedCount: 3, successfulOrganisationCount: 79 })).toBe(false);
    expect(falseInvariants(READINESS.preflightOnProspective)).toEqual([]);
    expect(
      READINESS.preflightOnProspective.operationalPrerequisites.adjudicationHistoryIntegrity,
    ).toBe(true);
    expect(falseInvariants(READINESS.preflightOnCurrent)).toEqual([
      'plannedReplacementAppendRecorded',
      'postAppendOccupantsMatchAssignedReserves',
    ]);
    const gate = (p: Generation2Preflight, reserveConsumedCount: number) =>
      evaluateGeneration2WindowGate({
        spec: SPEC,
        preflight: p,
        generation: { successfulOrganisationCount: 79, reserveConsumedCount },
        completed: [],
      });
    expect(gate(READINESS.preflightOnProspective, 3)).toMatchObject({
      decision: 'CONTINUE_TO_NEXT_WORK_ITEM',
      nextWorkItemId: 'G2R:78:2',
    });
    expect(gate(READINESS.preflightOnCurrent, 2).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });

  it('the preflight without the history cannot reproduce the Window-02 spec', () => {
    const noHistory = preflightOf(READINESS.prospectiveLedgerText, SPEC, EMPTY_GENERATION2_HISTORY);
    expect(noHistory.invariants.recomputedStateEqualsPlanningState).toBe(false);
    expect(noHistory.invariants.windowSpecHashValid).toBe(false);
  });

  it('(M) the canonical ledger still holds 2 entries, hash ce56b07e..., next reserve 2', () => {
    expect(CURRENT_TEXT).toBe(
      git('show', `${CURRENT_LEDGER_REVISION.appendCommit}:${GENERATION2_LEDGER_PATH}`),
    );
    expect(
      CURRENT.entries.map((e) => [e.sequence, e.selectionIndex, e.generation2ReserveRankPosition]),
    ).toEqual([
      [0, 75, 0],
      [1, 76, 1],
    ]);
    expect(
      deriveGeneration2CurrentState(BASIS, CURRENT, HISTORY).nextGeneration2ReservePosition,
    ).toBe(2);
  });

  it('(N) no Window-02 live authority, LIVE_RESULT or adjudication exists', () => {
    const names = namesState('docs/evaluation').filter((name) => /GENERATION2/.test(name));
    expect(names.filter((name) => /WINDOW_02/.test(name))).toEqual([
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_02_OFFLINE_READINESS_V1.json',
    ]);
    expect(names.filter((name) => /LIVE_AUTHORITY/.test(name))).toEqual([
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_AUTHORITY_V1.json',
    ]);
  });

  it('the committed readiness record is exactly what the builder derives, and authorises nothing', async () => {
    const committed = readState(WINDOW02_READINESS_PATH);
    expect(
      await renderWindow02Readiness({
        committed: COMMITTED,
        currentLedgerText: CURRENT_TEXT,
        genesisText: GENESIS_TEXT,
      }),
    ).toBe(committed);
    const record = JSON.parse(committed) as Json;
    expect(record).toMatchObject({
      thisFileAuthorises: [],
      isLiveAuthority: false,
      networkAuthorised: false,
      databaseAuthorised: false,
      ledgerMutationAuthorised: false,
      reserveAssigned: false,
      terminalState: WINDOW02_READINESS_TERMINAL_STATE,
      startingHead: WINDOW02_READINESS_STARTING_HEAD,
    });
    expect(record.window02.order).toEqual(['G2R:78:2', 'G2P:80', 'G2P:81', 'G2P:82', 'G2P:83']);
    expect(record.operationalPrerequisite).toMatchObject({ isFrozenP7: false, holds: true });
    expect(Object.values(record.sideEffects as Record<string, number>).every((n) => n === 0)).toBe(
      true,
    );
    expect(record.negativeHistoryAttacks.attacks).toEqual([...NEGATIVE_HISTORY_ATTACKS]);
    // Public-safe: no identity beyond digests.
    const echeRowKeys = BASIS.draw.selection.map((entry) => entry.echeRowKey);
    for (const key of [...echeRowKeys, BASIS.schedule[2]!.echeRowKey]) {
      expect(committed.includes(key)).toBe(false);
    }
    expect(committed).not.toMatch(/https?:\/\/|organisationId|rootAuthorities"/);
  });
});

describe('(L) negative history attacks - each refuses', () => {
  const item = (k: number) => (r: Json) => r.items[k] as Json;

  it('the pins matter: a tampered record that is not re-pinned is refused', () => {
    const text = W01.adjudication.text.replace('"G2P:79"', '"G2P:80"');
    expect(
      refusedWith({ windows: [{ ...W01, adjudication: { ...W01.adjudication, text } }] }),
    ).toBe('HISTORY_RECORD_NOT_PINNED');
    const committed = new Map(COMMITTED).set(W01.adjudication.path, text);
    expect(refusal(() => window01History(committed, GENESIS_TEXT))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('missing adjudication item', () => {
    expect(refusedWith(tampered({ adjudication: (r) => void r.items.splice(2, 1) }))).toBe(
      'HISTORY_ADJUDICATION_ITEMS',
    );
  });

  it('duplicate adjudication item / double adjudication', () => {
    expect(
      refusedWith(tampered({ adjudication: (r) => void (r.items[1] = clone(r.items[0])) })),
    ).toBe('HISTORY_DOUBLE_ADJUDICATION');
    // The same committed window supplied twice.
    expect(refusedWith({ windows: [W01, W01] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(refusedWith({ windows: [W01, { ...W01, windowOrdinal: 2 }] })).toBe(
      'HISTORY_AUTHORITY_NOT_APPLICABLE',
    );
  });

  it('reordered adjudication items', () => {
    expect(refusedWith(tampered({ adjudication: (r) => void r.items.reverse() }))).toBe(
      'HISTORY_ADJUDICATION_ITEMS',
    );
    expect(refusedWith(tampered({ live: (r) => void r.items.reverse() }))).toBe(
      'HISTORY_UNAUTHORISED_ITEM',
    );
  });

  it('wrong workItemId / slot / reserve position / split / identity digest / runRefSha256', () => {
    const cases: [string, (r: Json) => void][] = [
      ['workItemId', (r) => void (item(4)(r).workItemId = 'G2R:79:4')],
      ['slot', (r) => void (item(4)(r).selectionIndex = 80)],
      ['reserve position', (r) => void (item(0)(r).generation2ReserveRankPosition = 1)],
      ['split', (r) => void (item(2)(r).split = 'DEV_TRAIN')],
      ['identity digest', (r) => void (item(2)(r).identityDigest = '0'.repeat(64))],
      ['runRefSha256', (r) => void (item(3)(r).runRefSha256 = item(4)(r).runRefSha256)],
    ];
    for (const [name, mutate] of cases) {
      expect([name, refusedWith(tampered({ adjudication: mutate }))]).toEqual([
        name,
        name === 'workItemId' ? 'HISTORY_UNAUTHORISED_ITEM' : 'HISTORY_ADJUDICATION_ITEMS',
      ]);
      const live = refusedWith(tampered({ live: mutate }));
      expect([name, live]).toEqual([
        name,
        name === 'runRefSha256' ? 'HISTORY_LIVE_RESULT_ITEMS' : 'HISTORY_UNAUTHORISED_ITEM',
      ]);
    }
    // An authority whose item is not the window rule's, or whose digest does not re-bind.
    expect(
      refusedWith(
        tampered({
          authority: (r) => void (r.authorisedWorkItems[2].identityDigest = '0'.repeat(64)),
        }),
      ),
    ).toBe('HISTORY_AUTHORITY_WORK_ITEM');
    expect(
      refusedWith(
        tampered({
          authority: (r) => {
            r.authorisedWorkItems[4].workItemId = 'G2P:80';
            r.authorisedWorkItems[4].selectionIndex = 80;
            r.exactOrder[4] = 'G2P:80';
          },
        }),
      ),
    ).toBe('HISTORY_AUTHORITY_WORK_ITEM');
  });

  it('successful item changed to unsuccessful, and back', () => {
    const verdict = (k: number, v: string, q3: string | null) => (r: Json) => {
      item(k)(r).adjudication.verdict = v;
      item(k)(r).adjudication.q3Reason = q3;
    };
    expect(
      refusedWith(tampered({ adjudication: verdict(0, 'ACQUISITION_UNSUCCESSFUL', HOST) })),
    ).toBe('HISTORY_SUMMARY_DISAGREES');
    expect(
      refusedWith(tampered({ adjudication: verdict(0, 'ACQUISITION_UNSUCCESSFUL', null) })),
    ).toBe('HISTORY_Q3_REASON_INVALID');
    expect(
      refusedWith(tampered({ adjudication: verdict(3, 'ACQUISITION_SUCCESSFUL', null) })),
    ).toBe('HISTORY_SUMMARY_DISAGREES');
    expect(
      refusedWith(tampered({ adjudication: verdict(3, 'ACQUISITION_SUCCESSFUL', HOST) })),
    ).toBe('HISTORY_SUCCESS_WITH_REASON');
    expect(
      refusedWith(tampered({ adjudication: verdict(3, 'PENDING_CAPABILITY_REVIEW', null) })),
    ).toBe('HISTORY_VERDICT_NOT_FROZEN');
  });

  it('changed Q3 reason / invalid Q3 reason', () => {
    expect(
      refusedWith(
        tampered({ adjudication: (r) => void (item(3)(r).adjudication.q3Reason = MIN_PAGES) }),
      ),
    ).toBe('HISTORY_SUMMARY_DISAGREES');
    expect(
      refusedWith(
        tampered({
          adjudication: (r) =>
            void (item(3)(r).adjudication.q3Reason = 'ACQUISITION_UNSUCCESSFUL_TIMEOUT'),
        }),
      ),
    ).toBe('HISTORY_Q3_REASON_INVALID');
  });

  it('integrity or validation that does not permit adjudication', () => {
    expect(
      refusedWith(
        tampered({ adjudication: (r) => void (item(1)(r).integrity.verdict = 'DEVIATION') }),
      ),
    ).toBe('HISTORY_INTEGRITY_NOT_CLEAN');
    expect(refusedWith(tampered({ adjudication: (r) => void (r.validation.exitCode = 1) }))).toBe(
      'HISTORY_VALIDATION_NOT_ACCEPTED',
    );
    expect(refusedWith(tampered({ live: (r) => void (item(2)(r).runsForOccupant = 2) }))).toBe(
      'HISTORY_LIVE_RESULT_ITEMS',
    );
  });

  it('adjudication bound to the wrong LIVE_RESULT; LIVE_RESULT bound to the wrong authority', () => {
    expect(
      refusedWith(
        tampered({
          adjudication: (r) => void (r.bound.liveResult.sha256 = W01.authority.sha256),
        }),
      ),
    ).toBe('HISTORY_ADJUDICATION_LIVE_RESULT');
    expect(
      refusedWith(
        tampered({ live: (r) => void (r.boundAuthority.sha256 = W01.adjudication.sha256) }),
      ),
    ).toBe('HISTORY_LIVE_RESULT_AUTHORITY');
    expect(refusedWith(tampered({ live: (r) => void (r.windowSpecHash = '0'.repeat(64)) }))).toBe(
      'HISTORY_LIVE_RESULT_AUTHORITY',
    );
    expect(refusedWith(tampered({ adjudication: (r) => void (r.bound.authority.bytes = 1) }))).toBe(
      'HISTORY_ADJUDICATION_AUTHORITY',
    );
  });

  it('consumed replacement lacking its ledger entry', () => {
    expect(refusedWith(HISTORY, BASIS.genesis)).toBe('HISTORY_REPLACEMENT_LEDGER_ENTRY_MISSING');
    const oneEntry = withEntries(BASIS.genesis, CURRENT.entries.slice(0, 1));
    expect(validateOperationalGeneration2Ledger(BASIS, oneEntry).valid).toBe(true);
    expect(refusedWith(HISTORY, oneEntry)).toBe('HISTORY_REPLACEMENT_LEDGER_ENTRY_MISSING');
  });

  it('replacement pointing at the wrong ledger sequence', () => {
    expect(
      refusedWith(tampered({ authority: (r) => void (r.plannedLedgerAppend[1].sequence = 0) })),
    ).toBe('HISTORY_REPLACEMENT_LEDGER_SEQUENCE');
    expect(
      refusedWith(
        tampered({
          authority: (r) => void (r.plannedLedgerAppend[0].generation2ReserveRankPosition = 1),
        }),
      ),
    ).toBe('HISTORY_REPLACEMENT_LEDGER_SEQUENCE');
  });

  it('adjudicating a never-authorised primary', () => {
    const toP80 = (r: Json) => {
      const it80 = item(4)(r);
      it80.workItemId = 'G2P:80';
      it80.selectionIndex = 80;
      it80.split = BASIS.draw.selection[80]!.split;
      it80.identityDigest = buildPrimaryExecutionBinding(
        BASIS.frameIndex,
        BASIS.draw,
        80,
      ).drawEntrySha256;
    };
    expect(refusedWith(tampered({ adjudication: toP80 }))).toBe('HISTORY_UNAUTHORISED_ITEM');
    expect(refusedWith(tampered({ live: toP80, adjudication: toP80 }))).toBe(
      'HISTORY_UNAUTHORISED_ITEM',
    );
  });

  it('history records supplied out of order', () => {
    expect(refusedWith({ windows: [{ ...W01, windowOrdinal: 2 }] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(refusedWith(tampered({ authority: (r) => void (r.windowOrdinal = 2) }))).toBe(
      'HISTORY_AUTHORITY_NOT_APPLICABLE',
    );
  });

  it('summary disagreeing with the replayed state', () => {
    const cases: ((r: Json) => void)[] = [
      (r) => void (r.generation2StateAfter.ACQUISITION_SUCCESSFUL = 80),
      (r) => void (r.generation2StateAfter.CURRENT_ACQUISITION_FAILURE = []),
      (r) => void (r.generation2StateAfter.NEVER_STARTED.from = 81),
      (r) => void (r.generation2StateAfter.acquisitionSuccessfulBySplit.DEV_TRAIN = 15),
      (r) => void (r.q1After = [78, 79]),
      (r) => void (r.pendingReplacementObligations = []),
      (r) => void (r.ledgerAfter.entryCount = 3),
      (r) => void (r.generation2StateBefore.REPLACEMENT_ASSIGNED_AWAITING_EXECUTION = [75]),
      (r) => void (r.windowSummary.acquisitionUnsuccessful = [77]),
      (r) => void (r.p6.successfulOrganisationCount = 75),
    ];
    for (const mutate of cases) {
      expect(refusedWith(tampered({ adjudication: mutate }))).toBe('HISTORY_SUMMARY_DISAGREES');
    }
  });

  it('a refused history fails the separate integrity prerequisite and the P7 ledger invariant', () => {
    const bad = tampered({ adjudication: (r) => void r.items.splice(2, 1) });
    const p = preflightOf(READINESS.prospectiveLedgerText, SPEC, bad);
    expect(p.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(false);
    expect(p.invariants.currentGeneration2LedgerExactAndValid).toBe(false);
    expect(assessAdjudicationHistoryIntegrity(BASIS, CURRENT, bad).holds).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (K) Generic same-slot Q2: a synthetic, IN-MEMORY Window 02 in which the
// slot-78 replacement fails. Nothing here is committed or live.
// ---------------------------------------------------------------------------

function synthesiseWindow02(verdicts: Record<number, ReplacementReason | null>): {
  history: Generation2AdjudicationHistory;
  ledger: OperationalGeneration2Ledger;
  ledgerText: string;
} {
  const ledger = parseOperationalGeneration2Ledger(
    JSON.parse(READINESS.prospectiveLedgerText),
    BASIS.genesis,
  );
  const ledgerText = READINESS.prospectiveLedgerText;
  const authorityJson = {
    recordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
    generationId: 'METHODOLOGY_V3_GEN2',
    isLiveAuthority: true,
    windowOrdinal: 2,
    ordinaryWindows: 1,
    plannedWindowSize: SPEC.plannedWindowSize,
    maximumLiveInvocations: SPEC.plannedWindowSize,
    maximumLiveInvocationsPerWorkItem: 1,
    concurrency: 1,
    exactOrder: SPEC.workItems.map((i) => i.workItemId),
    authorisedWorkItems: SPEC.workItems,
    plannedLedgerAppend: SPEC.plannedReplacementAppend,
    boundWindowSpec: { windowSpecHash: SPEC.windowSpecHash },
    boundStartingLedger: {
      fileSha256: sha256(CURRENT_TEXT),
      bytes: bytesOf(CURRENT_TEXT),
      ledgerHash: CURRENT.ledgerHash,
      entryCount: 2,
    },
  };
  const authority = rebind(
    { path: 'synthetic/w02-authority.json', sha256: '', text: '' },
    authorityJson,
  );
  const liveItems = SPEC.workItems.map((i, k) => ({
    order: k + 1,
    workItemId: i.workItemId,
    kind: i.kind,
    selectionIndex: i.selectionIndex,
    generation2ReserveRankPosition: i.generation2ReserveRankPosition,
    split: i.split,
    identityDigest: i.identityDigest,
    cliExecuteInvocations: 1,
    runsForOccupant: 1,
    completionRows: 1,
    runTerminalState: 'COMPLETED',
    dryRun: false,
    runRefSha256: sha256(`synthetic-run-${String(k)}`),
  }));
  const live = rebind(
    { path: 'synthetic/w02-live.json', sha256: '', text: '' },
    {
      recordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      generationId: 'METHODOLOGY_V3_GEN2',
      isLiveAuthority: false,
      boundAuthority: refOf(authority),
      windowSpecHash: SPEC.windowSpecHash,
      ledgerDuringTheWindow: { ledgerHash: ledger.ledgerHash, entryCount: 3 },
      items: liveItems,
      liveInvocations: { used: 5, retries: 0 },
      stops: { itemsNotStarted: [] },
    },
  );
  const slotOf = (k: number) => SPEC.workItems[k]!.selectionIndex;
  const failed = liveItems.map((_, k) => k).filter((k) => verdicts[slotOf(k)] != null);
  const successful = [
    ...deriveGeneration2CurrentState(BASIS, CURRENT, HISTORY).acquisitionSuccessful,
    ...liveItems
      .map((_, k) => k)
      .filter((k) => !failed.includes(k))
      .map(slotOf),
  ].sort((a, b) => a - b);
  const failures = failed.map(slotOf).sort((a, b) => a - b);
  const neverStarted = Array.from({ length: 26 }, (_, k) => 84 + k);
  const after = {
    acquisitionSuccessful: successful,
    currentAcquisitionFailure: failures,
    replacementAssignedAwaitingExecution: [],
    neverStarted,
    failureReasons: failures.map((s) => ({ selectionIndex: s, reason: verdicts[s]! })),
  };
  const adjudication = rebind(
    { path: 'synthetic/w02-adjudication.json', sha256: '', text: '' },
    {
      recordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      generationId: 'METHODOLOGY_V3_GEN2',
      isLiveAuthority: false,
      thisFileAuthorises: [],
      terminalState: 'SYNTHETIC_WINDOW_02_ADJUDICATED_STOPPED',
      bound: {
        liveResult: refOf(live),
        authority: refOf(authority),
        ledger: { ledgerHash: ledger.ledgerHash, entryCount: 3 },
      },
      validation: { exitCode: 0, result: 'WINDOW_02_VALIDATION_ACCEPTED' },
      items: liveItems.map((i) => ({
        workItemId: i.workItemId,
        kind: i.kind,
        selectionIndex: i.selectionIndex,
        generation2ReserveRankPosition: i.generation2ReserveRankPosition,
        split: i.split,
        identityDigest: i.identityDigest,
        runRefSha256: i.runRefSha256,
        integrity: { verdict: 'CLEAN' },
        adjudication: {
          verdict:
            verdicts[i.selectionIndex] == null
              ? 'ACQUISITION_SUCCESSFUL'
              : 'ACQUISITION_UNSUCCESSFUL',
          q3Reason: verdicts[i.selectionIndex] ?? null,
        },
      })),
      windowSummary: {
        executed: 5,
        authorised: 5,
        acquisitionSuccessful: liveItems
          .map((_, k) => k)
          .filter((k) => !failed.includes(k))
          .map(slotOf),
        acquisitionUnsuccessful: failures,
      },
      generation2StateBefore: {
        ACQUISITION_SUCCESSFUL: 79,
        CURRENT_ACQUISITION_FAILURE: [],
        REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: [78],
        NEVER_STARTED: { from: 80, to: 109, count: 30 },
        q1: [],
        ledgerEntryCount: 3,
        nextGeneration2ReservePosition: 3,
      },
      generation2StateAfter: {
        ACQUISITION_SUCCESSFUL: successful.length,
        acquisitionSuccessfulBySplit: bySplitOf(BASIS, successful),
        CURRENT_ACQUISITION_FAILURE: failures,
        currentFailureBySplit: bySplitOf(BASIS, failures),
        REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: [],
        PENDING_CAPABILITY_REVIEW: [],
        CARRY_FORWARD_REFUSED: [],
        NEVER_STARTED: { from: 84, to: 109, count: 26, bySplit: bySplitOf(BASIS, neverStarted) },
        accounting: accountingOf(after),
      },
      q1After: failures,
      q1AfterReasons: after.failureReasons,
      pendingReplacementObligations: failures,
      ledgerAfter: {
        entryCount: 3,
        ledgerHash: ledger.ledgerHash,
        nextGeneration2ReservePosition: 3,
      },
      reserves: { generation2Consumed: 3, nextGeneration2ReservePosition: 3 },
      p6: { reserveConsumed: 3, successfulOrganisationCount: successful.length },
    },
  );
  return {
    ledger,
    ledgerText,
    history: {
      windows: [
        W01,
        {
          windowOrdinal: 2,
          authority,
          liveResult: live,
          adjudication,
          startingLedgerText: CURRENT_TEXT,
        },
      ],
    },
  };
}

describe('(K) same-slot Q2: a failed Generation-2 replacement re-opens the SAME slot', () => {
  const W02 = synthesiseWindow02({ 78: ROBOTS, 81: MIN_PAGES });

  it('the synthetic two-window history replays and passes history integrity', () => {
    const integrity = assessAdjudicationHistoryIntegrity(BASIS, W02.ledger, W02.history);
    expect(integrity.failures).toEqual([]);
    expect(integrity.rebuiltWindowSpecHashes[1]).toBe(SPEC.windowSpecHash);
    const state = deriveGeneration2CurrentState(BASIS, W02.ledger, W02.history);
    expect(state).toMatchObject({
      successfulOrganisationCount: 82,
      currentAcquisitionFailure: [78, 81],
      replacementAssignedAwaitingExecution: [],
      q1: [78, 81],
      q1Reasons: [
        { selectionIndex: 78, reason: ROBOTS },
        { selectionIndex: 81, reason: MIN_PAGES },
      ],
      nextGeneration2ReservePosition: 3,
    });
  });

  it('the next append chains slot 78 onto its Generation-2 occupant (sequence 2), ascending, next reserves 3 and 4', () => {
    const q1 = planCompleteQ1(BASIS, W02.ledger, W02.history);
    expect(q1).toEqual([
      { selectionIndex: 78, generation2ReserveRankPosition: 3, reason: ROBOTS },
      { selectionIndex: 81, generation2ReserveRankPosition: 4, reason: MIN_PAGES },
    ]);
    const append = prepareGeneration2ReplacementAppend({
      basis: BASIS,
      ledger: W02.ledger,
      assignments: q1,
      recordedAtUtc: '2026-09-29T00:00:00Z',
      history: W02.history,
    });
    expect(
      append.appendedEntries.map((e) => [
        e.sequence,
        e.selectionIndex,
        e.generation2ReserveRankPosition,
        e.replacedOccupantKind,
        e.previousSequenceForSlot,
      ]),
    ).toEqual([
      [3, 78, 3, 'GENERATION2_RESERVE_REPLACEMENT', 2],
      [4, 81, 4, 'GENERATION1_TERMINAL_OCCUPANT', null],
    ]);
    // The whole provenance chain is kept: entry 2 is untouched, entry 3 replaces its reserve.
    expect(append.nextLedger.entries[2]).toEqual(W02.ledger.entries[2]);
    expect(append.appendedEntries[0]!.replacedEcheRowKey).toBe(
      W02.ledger.entries[2]!.replacementEcheRowKey,
    );
    expect(append.stateAfter.replacementAssignedAwaitingExecution).toEqual([78, 81]);
    const w03 = buildGeneration2WindowSpec({
      basis: BASIS,
      startingLedger: W02.ledger,
      startingLedgerFile: { sha256: sha256(W02.ledgerText), bytes: bytesOf(W02.ledgerText) },
      plannedWindowSize: 5,
      history: W02.history,
    });
    expect(w03.workItems.map((i) => i.workItemId)).toEqual([
      'G2R:78:3',
      'G2R:81:4',
      'G2P:84',
      'G2P:85',
      'G2P:86',
    ]);
    expect(w03.plannedReplacementAppend.map((p) => p.previousSequenceForSlot)).toEqual([2, null]);
  });

  it('without the Window-02 adjudication, a second entry for slot 78 is refused', () => {
    const entries: Generation2LedgerEntry[] = [...W02.ledger.entries];
    const occupant = resolveCrossGenerationOccupant(BASIS, W02.ledger, 78);
    const payload = {
      sequence: 3,
      selectionIndex: 78,
      split: occupant.split,
      replacedEcheRowKey: occupant.echeRowKey,
      replacementEcheRowKey: BASIS.schedule[3]!.echeRowKey,
      generation2ReserveRankPosition: 3,
      reason: HOST,
      recordedAtUtc: '2026-09-29T00:00:00Z',
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT' as const,
      previousSequenceForSlot: 2,
      previousEntryHash: entries[2]!.entryHash,
    };
    const forged = withEntries(BASIS.genesis, [
      ...entries,
      { ...payload, entryHash: computeEntryHash(payload) },
    ]);
    expect(validateOperationalGeneration2Ledger(BASIS, forged).valid).toBe(true);
    expect(refusedWith(HISTORY, forged)).toBe('GENERATION2_ADJUDICATION_REQUIRED');
    // A successful replacement's slot can never be re-served.
    const allSucceed = synthesiseWindow02({});
    const reserved = withEntries(BASIS.genesis, [
      ...entries,
      { ...payload, reason: ROBOTS, entryHash: computeEntryHash({ ...payload, reason: ROBOTS }) },
    ]);
    expect(refusedWith(allSucceed.history, reserved)).toBe('LEDGER_ENTRY_FOR_NON_FAILED_SLOT');
  });

  it('the Window-02 history over the ledger WITHOUT its pre-network append is refused', () => {
    expect(refusedWith(W02.history, CURRENT)).toBe('HISTORY_REPLACEMENT_LEDGER_ENTRY_MISSING');
  });
});

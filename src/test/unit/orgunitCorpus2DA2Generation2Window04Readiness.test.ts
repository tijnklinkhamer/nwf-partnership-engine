/**
 * Phase 2B-2D A2 Generation 2: WINDOW-04 OFFLINE READINESS after the generic
 * cross-window run-reference promotion - the proofs.
 *
 * Reads only committed bytes - at this task's own terminal commit (the one
 * that adds its audit) once it exists, else the working tree - so a later,
 * separately authorised Window-04 authority or ledger append cannot turn these
 * claims into a temporal defect. Opens no socket and no database, writes no
 * file, assigns no reserve and never mutates the canonical Generation-2
 * ledger: every failure and append here exists in memory only.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR,
  P6_SUCCESS_FLOOR,
} from '../harness/phase2b2d/continuationWindow/windowContract.js';
import { buildPrimaryExecutionBinding } from '../harness/phase2b2d/generation2Acquisition/executionBinding.js';
import { evaluateGeneration2WindowGate } from '../harness/phase2b2d/generation2Acquisition/gateAdapter.js';
import { prepareGeneration2ReplacementAppend } from '../harness/phase2b2d/generation2Acquisition/ledgerAppend.js';
import { COMMITTED_JSON_DIRECTORIES } from '../harness/phase2b2d/generation2Acquisition/materialiseReadiness.js';
import {
  GENERATION2_LEDGER_PATH,
  Generation2OperationalRefusal,
} from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import {
  computeEntryHash,
  parseOperationalGeneration2Ledger,
  resolveCrossGenerationOccupant,
  validateOperationalGeneration2Ledger,
  withEntries,
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
  recomputeWindowSpecHash,
  type Generation2WindowSpec,
} from '../harness/phase2b2d/generation2Acquisition/windowSpec.js';
import { p6Fires } from '../harness/phase2b2d/generation2Freeze/freezeArtifacts.js';
import {
  bySplitOf,
  replayGeneration2History,
  type Generation2AdjudicationHistory,
  type Generation2WindowHistoryBinding,
} from '../harness/phase2b2d/generation2History/adjudicationHistory.js';
import { assessAdjudicationHistoryIntegrity } from '../harness/phase2b2d/generation2History/historyIntegrity.js';
import { refOf, sealRecord } from '../harness/phase2b2d/generation2Window03/synthesiseWindow.js';
import { renderWindow04Readiness } from '../harness/phase2b2d/generation2Window04/materialiseWindow04Readiness.js';
import {
  EXPECTED_WINDOW_04,
  GENESIS_REVISION_COMMIT,
  WINDOW04_CURRENT_LEDGER_REVISION,
  WINDOW04_READINESS_AUDIT_PATH,
  WINDOW04_READINESS_PATH,
  WINDOW04_READINESS_STARTING_HEAD,
  WINDOW04_READINESS_TERMINAL_STATE,
  WINDOW04_SYNTHETIC_APPEND_RECORDED_AT_UTC,
  WINDOW04_W01_PINS,
  WINDOW04_W02_PINS,
  WINDOW04_W02_VALIDATION_CHAIN,
  WINDOW04_W03_PINS,
} from '../harness/phase2b2d/generation2Window04/window04Contract.js';
import {
  WINDOW04_NEGATIVE_ATTACKS,
  buildWindow04Readiness,
  syntheticWindow04Failure,
  threeWindowHistory,
  verifyWindow03Validation,
} from '../harness/phase2b2d/generation2Window04/window04Readiness.js';

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The commit that added this task's audit, or null while it is uncommitted. */
function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW04_READINESS_AUDIT_PATH)
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

const at = (commit: string): string => git('show', `${commit}:${GENERATION2_LEDGER_PATH}`);
const GENESIS_TEXT = at(GENESIS_REVISION_COMMIT);
const W02_START_TEXT = at(WINDOW04_W02_PINS.startingLedgerRevisionCommit);
const W03_START_TEXT = at(WINDOW04_W03_PINS.startingLedgerRevisionCommit);
const STARTS = [GENESIS_TEXT, W02_START_TEXT, W03_START_TEXT] as const;
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
const AUDITS = new Map(
  [WINDOW04_W02_VALIDATION_CHAIN.stopAudit, WINDOW04_W02_VALIDATION_CHAIN.closureAudit].map(
    (pin) => [pin.path, git('show', `${pin.commit}:${pin.path}`)] as const,
  ),
);
const INPUTS = {
  committed: COMMITTED,
  currentLedgerText: CURRENT_TEXT,
  startingLedgerTexts: STARTS,
  auditTexts: AUDITS,
};
const ASSESSMENT = assessCommittedInputs(COMMITTED);
const BASIS = ASSESSMENT.basis!;
const CURRENT = parseOperationalGeneration2Ledger(JSON.parse(CURRENT_TEXT), BASIS.genesis);
const HISTORY = threeWindowHistory(COMMITTED, STARTS);
const [W01, W02, W03] = HISTORY.windows as [
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
];
const READINESS = buildWindow04Readiness(INPUTS);
const SPEC = READINESS.spec;

const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE' as const;
const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET' as const;

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}
const refusedWith = (history: Generation2AdjudicationHistory, ledger = CURRENT): string =>
  refusal(() => deriveGeneration2CurrentState(BASIS, ledger, history));
const integrityOf = (history: Generation2AdjudicationHistory) =>
  assessAdjudicationHistoryIntegrity(BASIS, CURRENT, history);

/**
 * Tampers the Window-03 LIVE_RESULT and/or adjudication and RE-SEALS every
 * downstream reference, as an attacker controlling the pins would: the
 * semantic layer - not the hash pin - must be what refuses.
 */
function tamperedW03(mutate: {
  live?: (r: Json) => void;
  adjudication?: (r: Json) => void;
}): Generation2AdjudicationHistory {
  const liveJson = JSON.parse(W03.liveResult.text) as Json;
  mutate.live?.(liveJson);
  const liveResult = mutate.live ? sealRecord(W03.liveResult.path, liveJson) : W03.liveResult;
  const adjudicationJson = JSON.parse(W03.adjudication.text) as Json;
  adjudicationJson.bound.liveResult = {
    ...adjudicationJson.bound.liveResult,
    ...refOf(liveResult),
  };
  mutate.adjudication?.(adjudicationJson);
  return {
    windows: [
      W01,
      W02,
      { ...W03, liveResult, adjudication: sealRecord(W03.adjudication.path, adjudicationJson) },
    ],
  };
}

const preflightOf = (
  currentText: string = CURRENT_TEXT,
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
/** A spec edited by an attacker and re-sealed with its recomputed hash. */
const resealedSpec = (mutate: (spec: Json) => void): Generation2WindowSpec => {
  const spec = clone(SPEC) as unknown as Json;
  mutate(spec);
  spec.windowSpecHash = recomputeWindowSpecHash(spec as unknown as Generation2WindowSpec);
  return spec as unknown as Generation2WindowSpec;
};
/** Substitutes a genuine primary (real digest) for one Window-04 item, re-sealed. */
const substituted = (position: number, selectionIndex: number): Generation2WindowSpec => {
  const binding = buildPrimaryExecutionBinding(BASIS.frameIndex, BASIS.draw, selectionIndex);
  return resealedSpec((s) => {
    const item = (s.workItems as Json[])[position]!;
    item.workItemId = `G2P:${String(selectionIndex)}`;
    item.selectionIndex = selectionIndex;
    item.split = binding.split;
    item.identityDigest = binding.drawEntrySha256;
    item.rootAuthorityCount = binding.rootAuthorityCount;
  });
};
const runRefsOf = (binding: Generation2WindowHistoryBinding): string[] =>
  (JSON.parse(binding.adjudication.text) as Json).items.map((i: Json) => i.runRefSha256 as string);

describe('Generation-2 Window 04 offline readiness: canonical start and bindings', () => {
  it('starts from the exact committed inputs, the Window-03 adjudication commit and the 5-entry ledger', () => {
    expect(ASSESSMENT.failures).toEqual([]);
    expect(Object.values(ASSESSMENT.checks).every(Boolean)).toBe(true);
    expect(git('merge-base', '--is-ancestor', WINDOW04_READINESS_STARTING_HEAD, 'HEAD')).toBe('');
    expect(sha256(CURRENT_TEXT)).toBe(WINDOW04_CURRENT_LEDGER_REVISION.fileSha256);
    expect(bytesOf(CURRENT_TEXT)).toBe(WINDOW04_CURRENT_LEDGER_REVISION.bytes);
    expect(CURRENT.ledgerHash).toBe(
      'e58f872e22f3794ac3af2ed34ee802f0b140ffc95d94dc19a1b28db1a7b00a72',
    );
    expect(CURRENT.entries).toHaveLength(5);
    expect(CURRENT_TEXT).toBe(at(WINDOW04_CURRENT_LEDGER_REVISION.appendCommit));
  });

  it('binds Windows 01, 02 and 03 by the exact committed bytes at their commits', () => {
    const pairs = [
      [W01, WINDOW04_W01_PINS],
      [W02, WINDOW04_W02_PINS],
      [W03, WINDOW04_W03_PINS],
    ] as const;
    for (const [binding, pins] of pairs) {
      for (const role of ['authority', 'liveResult', 'adjudication'] as const) {
        expect(binding[role].sha256).toBe(pins[role].sha256);
        expect(sha256(git('show', `${pins[role].commit}:${pins[role].path}`))).toBe(
          pins[role].sha256,
        );
      }
    }
    expect(WINDOW04_W01_PINS.authority.commit).toBe('219f6d4a1cb869e9253a9701d48543a88f80f0ab');
    expect(WINDOW04_W02_PINS.liveResult.commit).toBe('d074c0647136b45ee094b2d46a98ee2110db5102');
    expect(WINDOW04_W03_PINS.authority.commit).toBe('a39309f489aef60ae43ff4d179b9150dc5caf6c0');
    expect(WINDOW04_W03_PINS.liveResult.commit).toBe('17398aaf44b33d831ab9fb8c23b17b0d529da160');
    expect(WINDOW04_W03_PINS.adjudication.commit).toBe(WINDOW04_READINESS_STARTING_HEAD);
    expect(sha256(W03.startingLedgerText)).toBe(WINDOW04_W03_PINS.startingLedgerFileSha256);
    expect(
      parseOperationalGeneration2Ledger(JSON.parse(W03_START_TEXT), BASIS.genesis).entries,
    ).toHaveLength(3);
    const adjudication = JSON.parse(W03.adjudication.text) as Json;
    expect(adjudication.terminalState).toBe(WINDOW04_W03_PINS.adjudication.terminalState);
    expect(adjudication.bound.startingLedgerRevision.commit).toBe(
      WINDOW04_W03_PINS.startingLedgerRevisionCommit,
    );
    expect(adjudication.bound.ledger.appendCommit).toBe(WINDOW04_W03_PINS.ledgerAppendCommit);
  });

  it('the Window-02 chain is preserved; Window 03 validated cleanly on its own, without the Window-02 ruling', () => {
    const record = READINESS.record as Json;
    const chain = record.bound.window02ValidationChain;
    expect(chain.originalValidation.formalVerdict).toBe(
      'VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED',
    );
    expect(chain.originalValidation.reclassified).toBe(false);
    expect(chain.adjudicationPermittedOnlyThroughRulingAndReproof).toBe(true);
    expect(chain.window02P5RulingIsWindow02Specific).toBe(true);
    expect(chain.window02P5RulingReusedForAnyLaterWindow).toBe(false);
    expect(verifyWindow03Validation(W03.adjudication.text)).toEqual({
      exitCode: 0,
      runs: 1,
      exclusivityVerdict: 'VALIDATION_EXECUTION_EXCLUSIVITY_PROVED',
      result: 'WINDOW_03_VALIDATION_ACCEPTED',
      p5Fired: false,
      window02P5RulingReused: false,
    });
    const reusing = JSON.parse(W03.adjudication.text) as Json;
    reusing.p5.window02RulingNotReused = false;
    expect(refusal(() => verifyWindow03Validation(JSON.stringify(reusing)))).toBe(
      'WINDOW_03_VALIDATION_NOT_ACCEPTED',
    );
  });
});

describe('Generation-2 Window 04 offline readiness: replayed three-window state', () => {
  it('generic history integrity holds over all three windows with fifteen globally unique run references', () => {
    const integrity = integrityOf(HISTORY);
    expect(integrity.failures).toEqual([]);
    expect(integrity).toMatchObject({ holds: true, isFrozenP7: false, windowCount: 3 });
    expect(integrity.historicalRunReferences).toHaveLength(15);
    expect(new Set(integrity.historicalRunReferences).size).toBe(15);
    const replay = integrity.replay!;
    expect(replay.consumedLedgerEntryCount).toBe(5);
    expect(replay.windows.map((w) => w.consumedLedgerSequences)).toEqual([[0, 1], [2], [3, 4]]);
    expect(integrity.rebuiltWindowSpecHashes).toEqual(replay.windows.map((w) => w.windowSpecHash));
    expect(replay.windows[2]!.executed.map((i) => [i.workItemId, i.verdict, i.q3Reason])).toEqual(
      EXPECTED_WINDOW_04.window03Outcomes,
    );
  });

  it('derives 87 successful (16/36/35), no failure, nothing assigned or pending, never-started 87..109', () => {
    const state = deriveGeneration2CurrentState(BASIS, CURRENT, HISTORY);
    expect(state).toMatchObject({
      successfulOrganisationCount: 87,
      currentAcquisitionFailure: [],
      replacementAssignedAwaitingExecution: [],
      pendingCapabilityReview: [],
      carryForwardRefused: [],
      q1: [],
      ledgerEntryCount: 5,
      nextGeneration2ReservePosition: 5,
      accounting: '87 successful + 0 failed + 0 assigned + 0 pending + 23 never started = 110',
    });
    expect(bySplitOf(BASIS, state.acquisitionSuccessful)).toEqual({
      DEV_TRAIN: 16,
      DEV_CONFIRM: 36,
      FINAL_HOLDOUT: 35,
    });
    expect(state.neverStarted).toEqual(Array.from({ length: 23 }, (_, k) => 87 + k));
  });

  it('complete Q1 is empty, so there is nothing to append and reserve 5 stays unassigned', () => {
    expect(planCompleteQ1(BASIS, CURRENT, HISTORY)).toEqual([]);
    expect(
      refusal(() =>
        prepareGeneration2ReplacementAppend({
          basis: BASIS,
          ledger: CURRENT,
          assignments: [],
          recordedAtUtc: WINDOW04_SYNTHETIC_APPEND_RECORDED_AT_UTC,
          history: HISTORY,
        }),
      ),
    ).toBe('NOTHING_TO_APPEND');
    expect(SPEC.plannedReplacementAppend).toEqual([]);
  });
});

describe('Generation-2 Window 04 offline readiness: the derived window', () => {
  it('is G2P:87..91, primaries only, splits from the frozen draw', () => {
    expect(SPEC.workItems.map((i) => [i.workItemId, i.kind, i.split])).toEqual([
      ['G2P:87', 'PRIMARY', 'FINAL_HOLDOUT'],
      ['G2P:88', 'PRIMARY', 'DEV_TRAIN'],
      ['G2P:89', 'PRIMARY', 'DEV_CONFIRM'],
      ['G2P:90', 'PRIMARY', 'FINAL_HOLDOUT'],
      ['G2P:91', 'PRIMARY', 'DEV_CONFIRM'],
    ]);
    for (const item of SPEC.workItems) {
      expect(BASIS.draw.selection[item.selectionIndex]!.split).toBe(item.split);
    }
  });

  it('the spec rebuilds byte-identically and its hash recomputes', () => {
    const rebuilt = buildGeneration2WindowSpec({
      basis: BASIS,
      startingLedger: CURRENT,
      startingLedgerFile: { sha256: sha256(CURRENT_TEXT), bytes: bytesOf(CURRENT_TEXT) },
      plannedWindowSize: 5,
      history: HISTORY,
    });
    expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(SPEC));
    expect(recomputeWindowSpecHash(SPEC)).toBe(SPEC.windowSpecHash);
    expect((READINESS.record as Json).bound.derivedWindow04SpecHash).toBe(SPEC.windowSpecHash);
  });

  it('every primary execution identity is exact against the draw and the frame', () => {
    for (const item of SPEC.workItems) {
      const binding = buildPrimaryExecutionBinding(
        BASIS.frameIndex,
        BASIS.draw,
        item.selectionIndex,
      );
      const slot = BASIS.draw.selection[item.selectionIndex]!;
      const ranked = BASIS.frameIndex.ranked[item.selectionIndex]!;
      expect(binding.selectionIndex).toBe(item.selectionIndex);
      expect(binding.split).toBe(item.split);
      expect(binding.echeRowKey).toBe(slot.echeRowKey);
      expect(binding.echeRowKey).toBe(ranked.echeRowKey);
      expect(binding.organisationId).toBe(slot.organisationId);
      expect(binding.organisationId).toBe(ranked.organisationId);
      expect(binding.rootAuthorityCount).toBe(item.rootAuthorityCount);
      expect(binding.drawEntrySha256).toBe(item.identityDigest);
    }
  });

  it('frozen P7 is 18/18 on the current ledger, history integrity holds separately, and the gate continues at G2P:87', () => {
    const preflight = preflightOf();
    expect(falseInvariants(preflight)).toEqual([]);
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(preflight.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(true);
    const gate = evaluateGeneration2WindowGate({
      spec: SPEC,
      preflight,
      generation: { successfulOrganisationCount: 87, reserveConsumedCount: 5 },
      completed: [],
    });
    expect(gate.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(gate.nextWorkItemId).toBe('G2P:87');
  });

  it('P2 = 3, P5 = 2 for a planned size of 5; P6 does not fire at 5 consumed / 87 successful', () => {
    expect(SPEC.gateThresholds).toEqual({
      p2RobotsRefusalWindowCount: 3,
      p5LowRawYieldWindowCount: 2,
    });
    expect(p6Fires({ reserveConsumedCount: 5, successfulOrganisationCount: 87 })).toBe(false);
  });

  it('the committed record is exactly what the builder derives, and authorises nothing', async () => {
    const committed = readState(WINDOW04_READINESS_PATH);
    expect(await renderWindow04Readiness(INPUTS)).toBe(committed);
    const record = JSON.parse(committed) as Json;
    expect(record).toMatchObject({
      terminalState: WINDOW04_READINESS_TERMINAL_STATE,
      startingHead: WINDOW04_READINESS_STARTING_HEAD,
      thisFileAuthorises: [],
      isLiveAuthority: false,
      networkAuthorised: false,
      databaseAuthorised: false,
      ledgerMutationAuthorised: false,
      reserveAssignmentAuthorised: false,
    });
    expect(record.operationalPrerequisite).toMatchObject({
      name: 'ADJUDICATION_HISTORY_INTEGRITY',
      isFrozenP7: false,
      holds: true,
      windowCount: 3,
      includesGlobalRunReferenceUniqueness: true,
    });
    expect(record.adjudicationHistory.globalRunReferences).toMatchObject({
      count: 15,
      distinct: 15,
      globallyUnique: true,
    });
    expect(record.gates.p7.onCurrentCommittedLedger).toMatchObject({
      trueCount: 18,
      falseCount: 0,
    });
    expect(record.canonicalGeneration2Ledger).toMatchObject({
      entryCountStill: 5,
      ledgerHashStill: WINDOW04_CURRENT_LEDGER_REVISION.ledgerHash,
      nextGeneration2ReserveStill: 5,
      reserve5Assigned: false,
      mutatedByThisTask: false,
    });
    expect(Object.values(record.sideEffects as Record<string, number>).every((n) => n === 0)).toBe(
      true,
    );
    expect(record.negativeAttacks.attacks).toEqual([...WINDOW04_NEGATIVE_ATTACKS]);
    // Public-safe: no identity beyond digests.
    const keys = BASIS.draw.selection.flatMap((e) => [e.echeRowKey, e.organisationId]);
    for (const key of keys) expect(committed.includes(key)).toBe(false);
    expect(committed).not.toMatch(/https?:\/\/|"organisationId"|"echeRowKey"|rootAuthorities"/);
  });

  it('no Window-04 authority, LIVE_RESULT or adjudication exists; the ledger is unchanged', () => {
    const names = namesState('docs/evaluation').filter((name) =>
      /GENERATION2_WINDOW_04/.test(name),
    );
    expect(names).toEqual(['PHASE_2B_2D_A2_GENERATION2_WINDOW_04_OFFLINE_READINESS_V1.json']);
    expect(
      CURRENT.entries.map((e) => [e.sequence, e.selectionIndex, e.generation2ReserveRankPosition]),
    ).toEqual([
      [0, 75, 0],
      [1, 76, 1],
      [2, 78, 2],
      [3, 82, 3],
      [4, 83, 4],
    ]);
  });
});

describe('synthetic Window-04 primary failures: Q1 -> next reserve, in memory only', () => {
  it('a failed G2P:87 becomes a current failure, Q1 = [87], and reserve 5 is projected - never appended', () => {
    const proof = syntheticWindow04Failure({
      basis: BASIS,
      history: HISTORY,
      current: CURRENT,
      currentLedgerText: CURRENT_TEXT,
      spec: SPEC,
      verdicts: { 87: HOST },
      runRefSeed: 'test-single-primary-failure',
    });
    expect(proof.integrityFailures).toEqual([]);
    expect(proof.state).toMatchObject({
      successfulOrganisationCount: 91,
      currentAcquisitionFailure: [87],
      q1: [87],
      nextGeneration2ReservePosition: 5,
    });
    expect(proof.q1).toEqual([
      { selectionIndex: 87, generation2ReserveRankPosition: 5, reason: HOST },
    ]);
    expect(proof.projectedEntries).toEqual([
      {
        sequence: 5,
        selectionIndex: 87,
        generation2ReserveRankPosition: 5,
        split: 'FINAL_HOLDOUT',
        reason: HOST,
        replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
        previousSequenceForSlot: null,
      },
    ]);
    expect(CURRENT.entries).toHaveLength(5);
    expect(sha256(readState(GENERATION2_LEDGER_PATH))).toBe(
      WINDOW04_CURRENT_LEDGER_REVISION.fileSha256,
    );
  });

  it('several failures are ordered ascending and take reserves 5, 6, 7 without skipping', () => {
    const proof = syntheticWindow04Failure({
      basis: BASIS,
      history: HISTORY,
      current: CURRENT,
      currentLedgerText: CURRENT_TEXT,
      spec: SPEC,
      verdicts: { 91: HOST, 87: MIN_PAGES, 89: HOST },
      runRefSeed: 'test-multiple-primary-failure',
    });
    expect(proof.integrityFailures).toEqual([]);
    expect(proof.q1).toEqual([
      { selectionIndex: 87, generation2ReserveRankPosition: 5, reason: MIN_PAGES },
      { selectionIndex: 89, generation2ReserveRankPosition: 6, reason: HOST },
      { selectionIndex: 91, generation2ReserveRankPosition: 7, reason: HOST },
    ]);
    expect(
      proof.projectedEntries.map((e) => [e.sequence, e.generation2ReserveRankPosition]),
    ).toEqual([
      [5, 5],
      [6, 6],
      [7, 7],
    ]);
    // A partial or skipping assignment of that Q1 is refused by the landed append.
    const synthetic = (READINESS.record as Json).syntheticMultipleFailureProof;
    expect(synthetic.canonicalAppend).toBe(false);
    expect(CURRENT.entries).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Negative attacks.
// ---------------------------------------------------------------------------

describe('Window-04 negative attacks - each refuses', () => {
  const item = (k: number) => (r: Json) => r.items[k] as Json;

  it('the attack list recorded in the readiness is the list proved here', () => {
    expect(WINDOW04_NEGATIVE_ATTACKS).toHaveLength(23);
  });

  it('Window 01 omitted', () => {
    expect(refusedWith({ windows: [W02, W03] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(integrityOf({ windows: [W02, W03] }).holds).toBe(false);
    const committed = new Map(COMMITTED);
    committed.delete(W01.authority.path);
    expect(refusal(() => threeWindowHistory(committed, STARTS))).toBe('HISTORY_BINDING_NOT_PINNED');
  });

  it('Window 02 omitted', () => {
    expect(refusedWith({ windows: [W01, W03] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(integrityOf({ windows: [W01, W03] }).holds).toBe(false);
    const committed = new Map(COMMITTED);
    committed.delete(W02.liveResult.path);
    expect(refusal(() => threeWindowHistory(committed, STARTS))).toBe('HISTORY_BINDING_NOT_PINNED');
  });

  it('Window 03 omitted / stale state that ignores Window 03', () => {
    const stale = { windows: [W01, W02] };
    expect(deriveGeneration2CurrentState(BASIS, CURRENT, stale)).toMatchObject({
      successfulOrganisationCount: 82,
      replacementAssignedAwaitingExecution: [82, 83],
      q1: [],
    });
    expect(falseInvariants(preflightOf(CURRENT_TEXT, SPEC, stale))).toEqual([
      'recomputedStateEqualsPlanningState',
      'windowSpecHashValid',
      'workItemsMatchGovernance',
    ]);
    const committed = new Map(COMMITTED);
    committed.delete(W03.adjudication.path);
    expect(refusal(() => threeWindowHistory(committed, STARTS))).toBe('HISTORY_BINDING_NOT_PINNED');
    expect(refusal(() => buildWindow04Readiness({ ...INPUTS, committed }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('history reordered', () => {
    expect(refusedWith({ windows: [W01, W03, W02] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(refusedWith({ windows: [W03, W02, W01] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(integrityOf({ windows: [W02, W01, W03] }).holds).toBe(false);
  });

  it('historical record hash mismatch', () => {
    const text = W03.adjudication.text.replace('"exitCode": 0', '"exitCode": 1');
    expect(text).not.toBe(W03.adjudication.text);
    expect(
      refusedWith({ windows: [W01, W02, { ...W03, adjudication: { ...W03.adjudication, text } }] }),
    ).toBe('HISTORY_RECORD_NOT_PINNED');
    const committed = new Map(COMMITTED).set(W03.adjudication.path, text);
    expect(refusal(() => threeWindowHistory(committed, STARTS))).toBe('HISTORY_BINDING_NOT_PINNED');
  });

  it('forged Window-03 success summary (re-sealed)', () => {
    const cases: ((r: Json) => void)[] = [
      (r) => void (r.generation2StateAfter.ACQUISITION_SUCCESSFUL = 88),
      (r) => void (r.generation2StateAfter.CURRENT_ACQUISITION_FAILURE = [86]),
      (r) => void (r.generation2StateAfter.NEVER_STARTED.from = 88),
      (r) => void (r.q1After = [86]),
      (r) => void (r.windowSummary.acquisitionSuccessful = [82, 83, 84, 85]),
      (r) => void (r.windowSummary.acquisitionUnsuccessful = [86]),
      (r) => void (r.ledgerAfter.entryCount = 6),
    ];
    for (const mutate of cases) {
      expect(refusedWith(tamperedW03({ adjudication: mutate }))).toBe('HISTORY_SUMMARY_DISAGREES');
    }
  });

  it('forged Window-03 item verdict (re-sealed)', () => {
    const verdict = (k: number, v: string, q3: string | null) => (r: Json) => {
      item(k)(r).adjudication.verdict = v;
      item(k)(r).adjudication.q3Reason = q3;
    };
    expect(
      refusedWith(tamperedW03({ adjudication: verdict(4, 'ACQUISITION_UNSUCCESSFUL', HOST) })),
    ).toBe('HISTORY_SUMMARY_DISAGREES');
    expect(
      refusedWith(tamperedW03({ adjudication: verdict(0, 'ACQUISITION_SUCCESSFUL', HOST) })),
    ).toBe('HISTORY_SUCCESS_WITH_REASON');
  });

  it('duplicate run reference within a window (re-sealed)', () => {
    const dup = runRefsOf(W03)[0]!;
    const forged = tamperedW03({
      live: (r) => void (item(1)(r).runRefSha256 = dup),
      adjudication: (r) => void (item(1)(r).runRefSha256 = dup),
    });
    expect(refusedWith(forged)).toBe('HISTORY_LIVE_RESULT_ITEMS');
    expect(integrityOf(forged).holds).toBe(false);
  });

  it('duplicate run reference across windows (re-sealed): refused by the GENERIC integrity', () => {
    const reused = runRefsOf(W02)[3]!;
    const forged = tamperedW03({
      live: (r) => void (item(4)(r).runRefSha256 = reused),
      adjudication: (r) => void (item(4)(r).runRefSha256 = reused),
    });
    // The replay alone accepts it - both windows are internally consistent.
    expect(refusal(() => replayGeneration2History(BASIS, CURRENT, forged))).toBe('NO_REFUSAL');
    const integrity = integrityOf(forged);
    expect(integrity.holds).toBe(false);
    expect(integrity.failures).toEqual([
      expect.stringMatching(
        /^REFUSED HISTORY_DUPLICATE_RUN_REFERENCE: .*window 2 reappears in window 3/,
      ),
    ]);
    expect(preflightOf(CURRENT_TEXT, SPEC, forged).operationalPrerequisites).toMatchObject({
      adjudicationHistoryIntegrity: false,
    });
  });

  it('fake Q1 when Q1 is empty', () => {
    const assignment = { selectionIndex: 87, generation2ReserveRankPosition: 5, reason: HOST };
    expect(
      refusal(() =>
        prepareGeneration2ReplacementAppend({
          basis: BASIS,
          ledger: CURRENT,
          assignments: [assignment] as never,
          recordedAtUtc: WINDOW04_SYNTHETIC_APPEND_RECORDED_AT_UTC,
          history: HISTORY,
        }),
      ),
    ).toBe('NOTHING_TO_APPEND');
    const spec = resealedSpec((s) => void (s.planningState.q1 = [87]));
    expect(falseInvariants(preflightOf(CURRENT_TEXT, spec))).toContain('windowSpecHashValid');
    const planned = resealedSpec(
      (s) => void (s.plannedReplacementAppend = [{ sequence: 5, ...assignment }]),
    );
    expect(falseInvariants(preflightOf(CURRENT_TEXT, planned))).toContain(
      'completeQ1EqualsPlanningQ1',
    );
  });

  it('reserve 5 assigned despite empty Q1 (a valid, re-hashed ledger entry)', () => {
    const occupant = resolveCrossGenerationOccupant(BASIS, CURRENT, 87);
    const payload = {
      sequence: 5,
      selectionIndex: 87,
      split: occupant.split,
      replacedEcheRowKey: occupant.echeRowKey,
      replacementEcheRowKey: BASIS.schedule[5]!.echeRowKey,
      generation2ReserveRankPosition: 5,
      reason: HOST,
      recordedAtUtc: WINDOW04_SYNTHETIC_APPEND_RECORDED_AT_UTC,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT' as const,
      previousSequenceForSlot: null,
      previousEntryHash: CURRENT.entries[4]!.entryHash,
    };
    const forged = withEntries(BASIS.genesis, [
      ...CURRENT.entries,
      { ...payload, entryHash: computeEntryHash(payload) },
    ]);
    expect(validateOperationalGeneration2Ledger(BASIS, forged).valid).toBe(true);
    expect(refusedWith(HISTORY, forged)).toBe('LEDGER_ENTRY_FOR_NON_FAILED_SLOT');
    const p = preflightOf(`${JSON.stringify(forged, null, 2)}\n`);
    expect(falseInvariants(p)).toEqual(
      expect.arrayContaining([
        'currentGeneration2LedgerExactAndValid',
        'noUnexpectedGeneration2Assignments',
      ]),
    );
    expect(p.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(false);
  });

  it('P86 repeated / P92 substituted (re-sealed, genuine digests)', () => {
    for (const spec of [substituted(0, 86), substituted(4, 92)]) {
      const p = preflightOf(CURRENT_TEXT, spec);
      expect(p.invariants.executionEntryIdentitiesMatch).toBe(true);
      expect(p.invariants.workItemsMatchGovernance).toBe(false);
      expect(p.invariants.windowSpecHashValid).toBe(false);
    }
  });

  it('P87-P91 reordered (re-sealed)', () => {
    const spec = resealedSpec((s) => {
      const items = s.workItems as Json[];
      [items[0], items[4]] = [items[4]!, items[0]!];
      items.forEach((it, k) => void (it.order = k + 1));
    });
    const p = preflightOf(CURRENT_TEXT, spec);
    expect(p.invariants.workItemsMatchGovernance).toBe(false);
    expect(p.invariants.windowSpecHashValid).toBe(false);
  });

  it('wrong split (re-sealed)', () => {
    const spec = resealedSpec((s) => void (s.workItems[1].split = 'FINAL_HOLDOUT'));
    const p = preflightOf(CURRENT_TEXT, spec);
    expect(p.invariants.workItemsMatchGovernance).toBe(false);
    expect(p.invariants.windowSpecHashValid).toBe(false);
  });

  it('wrong execution identity (re-sealed)', () => {
    const spec = resealedSpec(
      (s) => void (s.workItems[1].identityDigest = s.workItems[2].identityDigest),
    );
    expect(preflightOf(CURRENT_TEXT, spec).invariants.executionEntryIdentitiesMatch).toBe(false);
  });

  it('wrong starting ledger revision', () => {
    expect(
      refusedWith({ windows: [W01, W02, { ...W03, startingLedgerText: W02_START_TEXT }] }),
    ).toBe('HISTORY_LEDGER_NOT_A_PREFIX');
    expect(
      refusal(() => threeWindowHistory(COMMITTED, [GENESIS_TEXT, W02_START_TEXT, CURRENT_TEXT])),
    ).toBe('HISTORY_BINDING_NOT_PINNED');
    // Window 04 planned against the Window-03 starting revision fails P7.
    const p = preflightOf(CURRENT_TEXT, SPEC, HISTORY, W03_START_TEXT);
    expect(p.invariants.startingLedgerRevisionMatchesPrecommit).toBe(false);
  });

  it('dynamic directory scan / latest discovery', () => {
    // A "latest" Window-03-shaped record substituted at a pinned path is refused by the pin.
    const committed = new Map(COMMITTED).set(
      W03.adjudication.path,
      COMMITTED.get(WINDOW04_W03_PINS.offlineReadiness.path)!,
    );
    expect(refusal(() => threeWindowHistory(committed, STARTS))).toBe('HISTORY_BINDING_NOT_PINNED');
    // This readiness record is not an adjudication.
    const readiness = readState(WINDOW04_READINESS_PATH);
    expect(
      refusedWith({
        windows: [
          W01,
          W02,
          {
            ...W03,
            adjudication: {
              path: WINDOW04_READINESS_PATH,
              sha256: sha256(readiness),
              text: readiness,
            },
          },
        ],
      }),
    ).toBe('HISTORY_ADJUDICATION_KIND');
    // The builder takes no directory: the namespace reads no directory at all.
    for (const name of [
      'window04Readiness.ts',
      'window04Contract.ts',
      'materialiseWindow04Readiness.ts',
    ]) {
      expect(readState(`src/test/harness/phase2b2d/generation2Window04/${name}`), name).not.toMatch(
        /readdirSync|readdir\(|\bglob\(|statSync|findLatest|latestWindow/,
      );
    }
  });

  it('altered P2 / P5 thresholds (re-sealed)', () => {
    for (const mutate of [
      (s: Json) => void (s.gateThresholds.p2RobotsRefusalWindowCount = 4),
      (s: Json) => void (s.gateThresholds.p5LowRawYieldWindowCount = 3),
    ]) {
      expect(falseInvariants(preflightOf(CURRENT_TEXT, resealedSpec(mutate)))).toEqual([
        'windowSpecHashValid',
      ]);
    }
  });

  it('altered P6 semantics', () => {
    expect(P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR).toBe(10);
    expect(P6_SUCCESS_FLOOR).toBe(50);
    expect(p6Fires({ reserveConsumedCount: 11, successfulOrganisationCount: 49 })).toBe(true);
    expect(p6Fires({ reserveConsumedCount: 10, successfulOrganisationCount: 49 })).toBe(false);
    expect(p6Fires({ reserveConsumedCount: 11, successfulOrganisationCount: 50 })).toBe(false);
    expect((READINESS.record as Json).gates.p6).toEqual({
      rule: 'reserveConsumed > 10 AND successfulOrganisationCount < 50',
      reserveConsumed: 5,
      successfulOrganisationCount: 87,
      fires: false,
    });
  });

  it('frozen P7 changed', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect((READINESS.record as Json).gates.p7.invariants).toEqual([
      ...GENERATION2_P7_INVARIANT_NAMES,
    ]);
    // A frozen input edited in place is not the frozen basis.
    const path =
      'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json';
    const edited = new Map(COMMITTED).set(path, `${COMMITTED.get(path)!} `);
    expect(assessCommittedInputs(edited).basis).toBeNull();
    expect(refusal(() => buildWindow04Readiness({ ...INPUTS, committed: edited }))).toBe(
      'BASIS_NOT_EXACT',
    );
  });
});

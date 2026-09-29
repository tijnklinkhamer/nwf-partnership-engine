/**
 * Phase 2B-2D A2 Generation 2: WINDOW-05 OFFLINE READINESS over the explicit
 * four-window history (Window 04 with its pinned authority-shape correction)
 * - the proofs.
 *
 * Reads only committed bytes - at this task's own terminal commit (the one
 * that adds its audit) once it exists, else the working tree - so a later,
 * separately authorised Window-05 authority or ledger append cannot turn these
 * claims into a temporal defect. Opens no socket and no database, writes no
 * file, assigns no reserve and never mutates the canonical Generation-2
 * ledger: every failure, append and synthetic window here exists in memory.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
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
  APPROVED_AUTHORITY_SHAPE_CORRECTIONS,
  bySplitOf,
  replayGeneration2History,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
  type Generation2WindowHistoryBinding,
} from '../harness/phase2b2d/generation2History/adjudicationHistory.js';
import { assessAdjudicationHistoryIntegrity } from '../harness/phase2b2d/generation2History/historyIntegrity.js';
import {
  refOf,
  sealRecord,
  synthesiseAdjudicatedWindow,
} from '../harness/phase2b2d/generation2Window03/synthesiseWindow.js';
import { verifyWindow02ValidationChain } from '../harness/phase2b2d/generation2Window03/window03Readiness.js';
import { verifyWindow03Validation } from '../harness/phase2b2d/generation2Window04/window04Readiness.js';
import { renderWindow05Readiness } from '../harness/phase2b2d/generation2Window05/materialiseWindow05Readiness.js';
import {
  EXPECTED_WINDOW_05,
  GENESIS_REVISION_COMMIT,
  WINDOW05_CURRENT_LEDGER_REVISION,
  WINDOW05_READINESS_AUDIT_PATH,
  WINDOW05_READINESS_PATH,
  WINDOW05_READINESS_RECORDED_AT_UTC,
  WINDOW05_READINESS_STARTING_HEAD,
  WINDOW05_READINESS_TERMINAL_STATE,
  WINDOW05_W01_PINS,
  WINDOW05_W02_PINS,
  WINDOW05_W02_VALIDATION_CHAIN,
  WINDOW05_W03_PINS,
  WINDOW05_W04_PINS,
} from '../harness/phase2b2d/generation2Window05/window05Contract.js';
import {
  WINDOW05_CORRECTION_ATTACKS,
  WINDOW05_HISTORY_ATTACKS,
  WINDOW05_STATE_ATTACKS,
  buildWindow05Readiness,
  fourWindowHistoryForWindow05,
  verifyWindow04Adjudication,
  type Window05Inputs,
} from '../harness/phase2b2d/generation2Window05/window05Readiness.js';
import { syntheticWindow04Failure as syntheticWindowFailure } from '../harness/phase2b2d/generation2Window04/window04Readiness.js';

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The commit that added this task's audit, or null while it is uncommitted. */
function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW05_READINESS_AUDIT_PATH)
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
const W02_START_TEXT = at(WINDOW05_W02_PINS.startingLedgerRevisionCommit);
const W03_START_TEXT = at(WINDOW05_W03_PINS.startingLedgerRevisionCommit);
const W04_START_TEXT = at(WINDOW05_W04_PINS.startingLedgerRevisionCommit);
const STARTS = [GENESIS_TEXT, W02_START_TEXT, W03_START_TEXT, W04_START_TEXT] as const;
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
  [WINDOW05_W02_VALIDATION_CHAIN.stopAudit, WINDOW05_W02_VALIDATION_CHAIN.closureAudit].map(
    (pin) => [pin.path, git('show', `${pin.commit}:${pin.path}`)] as const,
  ),
);
const INPUTS: Window05Inputs = {
  committed: COMMITTED,
  currentLedgerText: CURRENT_TEXT,
  startingLedgerTexts: STARTS,
  window04AuthorityTextAtCommit: git(
    'show',
    `${WINDOW05_W04_PINS.authority.commit}:${WINDOW05_W04_PINS.authority.path}`,
  ),
  auditTexts: AUDITS,
};
const ASSESSMENT = assessCommittedInputs(COMMITTED);
const BASIS = ASSESSMENT.basis!;
const CURRENT = parseOperationalGeneration2Ledger(JSON.parse(CURRENT_TEXT), BASIS.genesis);
const HISTORY = fourWindowHistoryForWindow05(INPUTS);
const [W01, W02, W03, W04] = HISTORY.windows as [
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
];
const CORRECTION = W04.authorityShapeCorrection!;
const CORRECTION_RECORD = JSON.parse(CORRECTION.record.text) as Json;
const READINESS = buildWindow05Readiness(INPUTS);
const SPEC = READINESS.spec;
const RECORD = READINESS.record as Json;

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
const replay = (history: Generation2AdjudicationHistory, ledger = CURRENT): string =>
  refusal(() => replayGeneration2History(BASIS, ledger, history));
const refusedWith = (history: Generation2AdjudicationHistory, ledger = CURRENT): string =>
  refusal(() => deriveGeneration2CurrentState(BASIS, ledger, history));
const integrityOf = (history: Generation2AdjudicationHistory, ledger = CURRENT) =>
  assessAdjudicationHistoryIntegrity(BASIS, ledger, history);

/** Window 04 with a mutated correction record, RE-SEALED so only its semantics can refuse. */
function withCorrection(
  mutate: (record: Json) => void,
  authorityCommit: string = CORRECTION.authorityCommit,
): Generation2AdjudicationHistory {
  const record = clone(CORRECTION_RECORD);
  mutate(record);
  return {
    windows: [
      W01,
      W02,
      W03,
      {
        ...W04,
        authorityShapeCorrection: {
          record: sealRecord(CORRECTION.record.path, record),
          authorityCommit,
        },
      },
    ],
  };
}

/**
 * Tampers the Window-04 LIVE_RESULT and/or adjudication and RE-SEALS every
 * downstream reference, as an attacker controlling the pins would: the
 * semantic layer - not the hash pin - must be what refuses.
 */
function tamperedW04(mutate: {
  live?: (r: Json) => void;
  adjudication?: (r: Json) => void;
}): Generation2AdjudicationHistory {
  const liveJson = JSON.parse(W04.liveResult.text) as Json;
  mutate.live?.(liveJson);
  const liveResult = mutate.live ? sealRecord(W04.liveResult.path, liveJson) : W04.liveResult;
  const adjudicationJson = JSON.parse(W04.adjudication.text) as Json;
  adjudicationJson.bound.liveResult = {
    ...adjudicationJson.bound.liveResult,
    ...refOf(liveResult),
  };
  mutate.adjudication?.(adjudicationJson);
  return {
    windows: [
      W01,
      W02,
      W03,
      { ...W04, liveResult, adjudication: sealRecord(W04.adjudication.path, adjudicationJson) },
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
/** Substitutes a genuine primary (real digest) for one Window-05 item, re-sealed. */
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
/** A synthetic, adjudicated, all-successful Window 05 over `spec`. */
const syntheticWindow05 = (spec: Generation2WindowSpec, seed: string) =>
  synthesiseAdjudicatedWindow({
    basis: BASIS,
    priorHistory: HISTORY,
    startingLedgerText: CURRENT_TEXT,
    prospectiveLedgerText: CURRENT_TEXT,
    spec,
    verdicts: {},
    runRefSeed: seed,
  });

// ---------------------------------------------------------------------------
// Canonical start and bindings.
// ---------------------------------------------------------------------------

describe('Generation-2 Window 05 offline readiness: canonical start and bindings', () => {
  it('starts from the exact committed inputs, the Window-04 adjudication commit and the 5-entry ledger', () => {
    expect(ASSESSMENT.failures).toEqual([]);
    expect(Object.values(ASSESSMENT.checks).every(Boolean)).toBe(true);
    expect(git('merge-base', '--is-ancestor', WINDOW05_READINESS_STARTING_HEAD, 'HEAD')).toBe('');
    expect(WINDOW05_READINESS_STARTING_HEAD).toBe(WINDOW05_W04_PINS.adjudication.commit);
    expect(sha256(CURRENT_TEXT)).toBe(WINDOW05_CURRENT_LEDGER_REVISION.fileSha256);
    expect(bytesOf(CURRENT_TEXT)).toBe(WINDOW05_CURRENT_LEDGER_REVISION.bytes);
    expect(CURRENT.ledgerHash).toBe(
      'e58f872e22f3794ac3af2ed34ee802f0b140ffc95d94dc19a1b28db1a7b00a72',
    );
    expect(CURRENT.entries).toHaveLength(5);
    expect(CURRENT_TEXT).toBe(at(WINDOW05_CURRENT_LEDGER_REVISION.appendCommit));
    expect(CURRENT_TEXT).toBe(at(WINDOW05_READINESS_STARTING_HEAD));
  });

  it('binds Windows 01-04 by the exact committed bytes at their commits, in explicit order', () => {
    const pairs = [
      [W01, WINDOW05_W01_PINS],
      [W02, WINDOW05_W02_PINS],
      [W03, WINDOW05_W03_PINS],
      [W04, WINDOW05_W04_PINS],
    ] as const;
    for (const [binding, pins] of pairs) {
      for (const role of ['authority', 'liveResult', 'adjudication'] as const) {
        expect(binding[role].sha256).toBe(pins[role].sha256);
        expect(sha256(git('show', `${pins[role].commit}:${pins[role].path}`))).toBe(
          pins[role].sha256,
        );
        expect(readState(pins[role].path)).toBe(binding[role].text);
      }
    }
    expect(HISTORY.windows.map((w) => w.windowOrdinal)).toEqual([1, 2, 3, 4]);
    expect(WINDOW05_W04_PINS.authority.commit).toBe('05ffde6e8bcbbd2456ae1ccf69f43a7a41c2fcba');
    expect(WINDOW05_W04_PINS.liveResult.commit).toBe('8efe11c290b24d17bde24f61914a19698986f108');
    expect(sha256(W04.startingLedgerText)).toBe(WINDOW05_W04_PINS.startingLedgerFileSha256);
    expect(W04.startingLedgerText).toBe(CURRENT_TEXT);
    const adjudication = JSON.parse(W04.adjudication.text) as Json;
    expect(adjudication.terminalState).toBe(WINDOW05_W04_PINS.adjudication.terminalState);
    expect(adjudication.bound.startingLedgerRevision.commit).toBe(
      WINDOW05_W04_PINS.startingLedgerRevisionCommit,
    );
  });

  it('the Window-02 chain, Window-03 and Window-04 validations are preserved exactly as landed', () => {
    const chain = RECORD.bound.window02ValidationChain;
    expect(chain.originalValidation.formalVerdict).toBe(
      'VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED',
    );
    expect(chain.originalValidation.reclassified).toBe(false);
    expect(chain.adjudicationPermittedOnlyThroughRulingAndReproof).toBe(true);
    expect(chain.window02P5RulingReusedForAnyLaterWindow).toBe(false);
    expect(RECORD.bound.window03Validation).toMatchObject({
      result: 'WINDOW_03_VALIDATION_ACCEPTED',
      window02P5RulingReused: false,
    });
    expect(verifyWindow04Adjudication(W04.adjudication.text)).toEqual({
      exitCode: 0,
      runs: 1,
      exclusivityVerdict: 'VALIDATION_EXECUTION_EXCLUSIVITY_PROVED',
      result: 'WINDOW_04_VALIDATION_ACCEPTED',
      carriedOverUnder: 'ACCEPT_WINDOW04_EXISTING_EXCLUSIVE_VALIDATION_FOR_ADJUDICATION_V1',
      p5Fired: false,
      window02P5RulingReused: false,
      g2p88OperatorRuling: {
        ownerRuling: 'CONFIRM_WINDOW04_G2P88_CONTINUE_MITIGATED_NOTIFICATION_ONLY_V1',
        scope: 'Window-04-specific; not a precedent',
        window04Only: true,
        inheritedByWindow05: false,
      },
    });
    expect(RECORD.window05.inheritedAnomalyWaivers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The Window-04 correction binding and its containment.
// ---------------------------------------------------------------------------

describe('Window-04 pinned authority-shape correction: bound explicitly, contained', () => {
  it('the correction record is the exact committed one, bound to the exact authority, commit and spec', () => {
    expect(CORRECTION.record.path).toBe(
      'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_OWNER_SHAPE_CORRECTION_AND_ADJUDICATION_RULING_V1.json',
    );
    expect(CORRECTION.record.sha256).toBe(WINDOW05_W04_PINS.correction.sha256);
    expect(CORRECTION.authorityCommit).toBe(WINDOW05_W04_PINS.authority.commit);
    expect(CORRECTION_RECORD.boundAuthority).toMatchObject({
      path: WINDOW05_W04_PINS.authority.path,
      sha256: WINDOW05_W04_PINS.authority.sha256,
      commit: WINDOW05_W04_PINS.authority.commit,
    });
    expect(CORRECTION_RECORD.boundWindowSpecHash).toBe(WINDOW05_W04_PINS.windowSpecHash);
    expect(CORRECTION_RECORD.thisFileAuthorises).toEqual([]);
    expect(CORRECTION_RECORD.isLiveAuthority).toBe(false);
    expect(CORRECTION_RECORD.authorityShapeCorrection).toMatchObject({
      sourceField: 'boundLedger',
      canonicalField: 'boundStartingLedger',
      valuesAltered: false,
      otherFieldsRemapped: false,
      scope: 'EXACT_PINNED_WINDOW_04_AUTHORITY_ONLY',
    });
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS).toHaveLength(1);
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS[0]).toMatchObject({
      windowOrdinal: 4,
      authoritySha256: WINDOW05_W04_PINS.authority.sha256,
    });
  });

  it('the Window-04 authority itself is unchanged and still carries only boundLedger', () => {
    const authority = JSON.parse(W04.authority.text) as Json;
    expect(Object.hasOwn(authority, 'boundLedger')).toBe(true);
    expect(Object.hasOwn(authority, 'boundStartingLedger')).toBe(false);
    expect(git('log', '--format=%H', '--', WINDOW05_W04_PINS.authority.path).trim()).toBe(
      WINDOW05_W04_PINS.authority.commit,
    );
  });

  it('the readiness records the correction on Window 04 only, as historical compatibility', () => {
    expect(RECORD.window04AuthorityShapeCorrection).toMatchObject({
      mapping: { from: 'boundLedger', to: 'boundStartingLedger' },
      grantsAuthority: false,
      thisFileAuthorises: [],
      approvedCorrectionsInTheBridge: 1,
      suppliedExplicitlyWithWindow04Only: true,
      recordedOnReplayedWindows: [false, false, false, true],
      withoutCorrection: { replayRefusal: 'HISTORY_RECORD_SHAPE', integrityHolds: false },
      historicalCompatibilityOnly: true,
      futureWindowFallback: false,
    });
  });

  it('a prospective canonical Window-05 authority REQUIRES boundStartingLedger', () => {
    expect(RECORD.prospectiveWindow05AuthorityShape).toMatchObject({
      requiredStartingLedgerField: 'boundStartingLedger',
      canonicalFieldPresent: true,
      aliasFieldPresent: false,
      canonicalShapeReplays: true,
      aliasOnlyShapeRefusal: 'HISTORY_RECORD_SHAPE',
      window04CorrectionAttachedRefusal: 'HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND',
      window04TypoPropagated: false,
    });
    const synthetic = syntheticWindow05(SPEC, 'test-prospective-shape');
    const authority = JSON.parse(synthetic.history.windows[4]!.authority.text) as Json;
    expect(Object.keys(authority)).toContain('boundStartingLedger');
    expect(Object.keys(authority)).not.toContain('boundLedger');
    expect(integrityOf(synthetic.history, synthetic.ledger).holds).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The replayed four-window state.
// ---------------------------------------------------------------------------

describe('Generation-2 Window 05 offline readiness: replayed four-window state', () => {
  it('generic history integrity holds over all four windows with 20 globally unique run references', () => {
    const integrity = integrityOf(HISTORY);
    expect(integrity.failures).toEqual([]);
    expect(integrity).toMatchObject({ holds: true, isFrozenP7: false, windowCount: 4 });
    expect(integrity.historicalRunReferences).toHaveLength(20);
    expect(new Set(integrity.historicalRunReferences).size).toBe(20);
    const replayed = integrity.replay!;
    expect(replayed.windows.map((w) => w.executed.length)).toEqual([5, 5, 5, 5]);
    for (const window of replayed.windows) {
      const refs = window.executed.map((i) => i.runRefSha256);
      expect(new Set(refs).size).toBe(refs.length);
    }
    expect(replayed.consumedLedgerEntryCount).toBe(5);
    expect(integrity.rebuiltWindowSpecHashes).toEqual(EXPECTED_WINDOW_05.rebuiltWindowSpecHashes);
    expect(integrity.rebuiltWindowSpecHashes).toEqual(
      replayed.windows.map((w) => w.windowSpecHash),
    );
    expect(replayed.windows[3]!.executed.map((i) => [i.workItemId, i.verdict, i.q3Reason])).toEqual(
      EXPECTED_WINDOW_05.window04Outcomes,
    );
    expect(RECORD.adjudicationHistory.globalRunReferences).toMatchObject({
      count: 20,
      distinct: 20,
      perWindow: [5, 5, 5, 5],
      globallyUnique: true,
    });
  });

  it('derives 92 successful (17/38/37), no failure, nothing assigned or pending, never-started 92..109', () => {
    const state = deriveGeneration2CurrentState(BASIS, CURRENT, HISTORY);
    expect(state).toMatchObject({
      successfulOrganisationCount: 92,
      currentAcquisitionFailure: [],
      replacementAssignedAwaitingExecution: [],
      pendingCapabilityReview: [],
      carryForwardRefused: [],
      q1: [],
      ledgerEntryCount: 5,
      ledgerHash: WINDOW05_CURRENT_LEDGER_REVISION.ledgerHash,
      nextGeneration2ReservePosition: 5,
      accounting: '92 successful + 0 failed + 0 assigned + 0 pending + 18 never started = 110',
    });
    expect(bySplitOf(BASIS, state.acquisitionSuccessful)).toEqual({
      DEV_TRAIN: 17,
      DEV_CONFIRM: 38,
      FINAL_HOLDOUT: 37,
    });
    expect(state.neverStarted).toEqual(Array.from({ length: 18 }, (_, k) => 92 + k));
  });

  it('complete Q1 is empty, so there is nothing to append and reserve 5 stays unassigned', () => {
    expect(planCompleteQ1(BASIS, CURRENT, HISTORY)).toEqual([]);
    expect(
      refusal(() =>
        prepareGeneration2ReplacementAppend({
          basis: BASIS,
          ledger: CURRENT,
          assignments: [],
          recordedAtUtc: WINDOW05_READINESS_RECORDED_AT_UTC,
          history: HISTORY,
        }),
      ),
    ).toBe('NOTHING_TO_APPEND');
    expect(SPEC.plannedReplacementAppend).toEqual([]);
    expect(RECORD.q1).toMatchObject({
      assignments: [],
      empty: true,
      preNetworkAppendRequired: false,
      appendAttemptOnEmptyQ1: 'NOTHING_TO_APPEND',
    });
  });
});

// ---------------------------------------------------------------------------
// The derived window.
// ---------------------------------------------------------------------------

describe('Generation-2 Window 05 offline readiness: the derived window', () => {
  it('is G2P:92..96, primaries only, splits from the frozen draw', () => {
    expect(SPEC.workItems.map((i) => [i.workItemId, i.kind, i.split])).toEqual([
      ['G2P:92', 'PRIMARY', 'FINAL_HOLDOUT'],
      ['G2P:93', 'PRIMARY', 'DEV_TRAIN'],
      ['G2P:94', 'PRIMARY', 'DEV_CONFIRM'],
      ['G2P:95', 'PRIMARY', 'FINAL_HOLDOUT'],
      ['G2P:96', 'PRIMARY', 'DEV_CONFIRM'],
    ]);
    for (const item of SPEC.workItems) {
      expect(BASIS.draw.selection[item.selectionIndex]!.split).toBe(item.split);
      expect(item.workItemId).toBe(`G2P:${String(item.selectionIndex)}`);
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
    expect(canonicalStringify(rebuilt)).toBe(canonicalStringify(SPEC));
    expect(recomputeWindowSpecHash(SPEC)).toBe(SPEC.windowSpecHash);
    expect(RECORD.bound.derivedWindow05SpecHash).toBe(SPEC.windowSpecHash);
    expect(RECORD.window05.independentRebuild).toEqual({
      rebuiltWindowSpecHash: SPEC.windowSpecHash,
      canonicalBytesEqual: true,
      recomputedHashEqual: true,
    });
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

  it('frozen P7 is 18/18 on the current ledger, history integrity holds separately, and the gate continues at G2P:92', () => {
    const preflight = preflightOf();
    expect(falseInvariants(preflight)).toEqual([]);
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(GENERATION2_P7_INVARIANT_NAMES.join(' ')).not.toMatch(/history|adjudicat|runRef/i);
    expect(preflight.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(true);
    const gate = evaluateGeneration2WindowGate({
      spec: SPEC,
      preflight,
      generation: { successfulOrganisationCount: 92, reserveConsumedCount: 5 },
      completed: [],
    });
    expect(gate.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(gate.nextWorkItemId).toBe('G2P:92');
    // Without the correction the history prerequisite does not hold; P7 itself does not see it.
    const uncorrected = fourWindowHistoryForWindow05(INPUTS, { withCorrection: false });
    expect(integrityOf(uncorrected).holds).toBe(false);
  });

  it('P2 = 3, P5 = 2 for a planned size of 5; P6 does not fire at 5 consumed / 92 successful', () => {
    expect(SPEC.gateThresholds).toEqual({
      p2RobotsRefusalWindowCount: 3,
      p5LowRawYieldWindowCount: 2,
    });
    expect(p6Fires({ reserveConsumedCount: 5, successfulOrganisationCount: 92 })).toBe(false);
    expect(RECORD.gates.p6).toEqual({
      rule: 'reserveConsumed > 10 AND successfulOrganisationCount < 50',
      reserveConsumed: 5,
      successfulOrganisationCount: 92,
      fires: false,
    });
  });

  it('the committed record is exactly what the builder derives, and authorises nothing', async () => {
    const committed = readState(WINDOW05_READINESS_PATH);
    expect(await renderWindow05Readiness(INPUTS)).toBe(committed);
    const record = JSON.parse(committed) as Json;
    expect(record).toMatchObject({
      terminalState: WINDOW05_READINESS_TERMINAL_STATE,
      startingHead: WINDOW05_READINESS_STARTING_HEAD,
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
      windowCount: 4,
      includesGlobalRunReferenceUniqueness: true,
    });
    expect(record.gates.p7.onCurrentCommittedLedger).toMatchObject({
      trueCount: 18,
      falseCount: 0,
    });
    expect(record.canonicalGeneration2Ledger).toMatchObject({
      entryCountStill: 5,
      ledgerHashStill: WINDOW05_CURRENT_LEDGER_REVISION.ledgerHash,
      nextGeneration2ReserveStill: 5,
      reserve5Assigned: false,
      mutatedByThisTask: false,
    });
    expect(Object.values(record.sideEffects as Record<string, number>).every((n) => n === 0)).toBe(
      true,
    );
    expect(record.negativeAttacks.correctionAttacks).toEqual([...WINDOW05_CORRECTION_ATTACKS]);
    expect(record.negativeAttacks.historyAttacks).toEqual([...WINDOW05_HISTORY_ATTACKS]);
    expect(record.negativeAttacks.stateAttacks).toEqual([...WINDOW05_STATE_ATTACKS]);
    // Public-safe: no identity beyond digests.
    const keys = BASIS.draw.selection.flatMap((e) => [e.echeRowKey, e.organisationId]);
    for (const key of keys) expect(committed.includes(key)).toBe(false);
    expect(committed).not.toMatch(/https?:\/\/|"organisationId"|"echeRowKey"|rootAuthorities"/);
  });

  it('no Window-05 authority, LIVE_RESULT or adjudication and no Window-06 artefact exists; the ledger is unchanged', () => {
    const names = namesState('docs/evaluation').filter((name) =>
      /GENERATION2_WINDOW_0[56]/.test(name),
    );
    expect(names).toEqual(['PHASE_2B_2D_A2_GENERATION2_WINDOW_05_OFFLINE_READINESS_V1.json']);
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

// ---------------------------------------------------------------------------
// Synthetic Window-05 primary failures.
// ---------------------------------------------------------------------------

describe('synthetic Window-05 primary failures: Q1 -> next reserve, in memory only', () => {
  it('a failed G2P:92 becomes a current failure, Q1 = [92], and reserve 5 is projected - never appended', () => {
    const proof = syntheticWindowFailure({
      basis: BASIS,
      history: HISTORY,
      current: CURRENT,
      currentLedgerText: CURRENT_TEXT,
      spec: SPEC,
      verdicts: { 92: HOST },
      runRefSeed: 'test-window-05-single-primary-failure',
    });
    expect(proof.integrityFailures).toEqual([]);
    expect(proof.state).toMatchObject({
      successfulOrganisationCount: 96,
      currentAcquisitionFailure: [92],
      q1: [92],
      nextGeneration2ReservePosition: 5,
    });
    expect(proof.q1).toEqual([
      { selectionIndex: 92, generation2ReserveRankPosition: 5, reason: HOST },
    ]);
    const occupant = resolveCrossGenerationOccupant(BASIS, CURRENT, 92);
    expect(proof.projectedEntries).toEqual([
      {
        sequence: 5,
        selectionIndex: 92,
        generation2ReserveRankPosition: 5,
        split: 'FINAL_HOLDOUT',
        reason: HOST,
        replacedOccupantKind: occupant.kind,
        previousSequenceForSlot: occupant.generation2LedgerSequence,
      },
    ]);
    expect(occupant.kind).toBe('GENERATION1_TERMINAL_OCCUPANT');
    expect(CURRENT.entries).toHaveLength(5);
    expect(sha256(readState(GENERATION2_LEDGER_PATH))).toBe(
      WINDOW05_CURRENT_LEDGER_REVISION.fileSha256,
    );
  });

  it('failures given as 96, 92, 94 are normalised to Q1 92 -> 94 -> 96 with reserves 5 -> 6 -> 7', () => {
    const proof = syntheticWindowFailure({
      basis: BASIS,
      history: HISTORY,
      current: CURRENT,
      currentLedgerText: CURRENT_TEXT,
      spec: SPEC,
      verdicts: { 96: HOST, 92: MIN_PAGES, 94: HOST },
      runRefSeed: 'test-window-05-multiple-primary-failure',
    });
    expect(proof.integrityFailures).toEqual([]);
    expect(proof.q1).toEqual([
      { selectionIndex: 92, generation2ReserveRankPosition: 5, reason: MIN_PAGES },
      { selectionIndex: 94, generation2ReserveRankPosition: 6, reason: HOST },
      { selectionIndex: 96, generation2ReserveRankPosition: 7, reason: HOST },
    ]);
    expect(
      proof.projectedEntries.map((e) => [
        e.sequence,
        e.selectionIndex,
        e.generation2ReserveRankPosition,
      ]),
    ).toEqual([
      [5, 92, 5],
      [6, 94, 6],
      [7, 96, 7],
    ]);
    expect(RECORD.syntheticMultipleFailureProof.canonicalAppend).toBe(false);
    expect(CURRENT.entries).toHaveLength(5);
  });

  it('an unadjudicated Window-05 failure authorises no replacement: current Q1 stays empty', () => {
    // Until a Window-05 adjudication is committed and replayed, the explicit
    // history ends at Window 04 and the landed planner sees no obligation.
    expect(planCompleteQ1(BASIS, CURRENT, HISTORY)).toEqual([]);
    const assignment = { selectionIndex: 92, generation2ReserveRankPosition: 5, reason: HOST };
    expect(
      refusal(() =>
        prepareGeneration2ReplacementAppend({
          basis: BASIS,
          ledger: CURRENT,
          assignments: [assignment] as never,
          recordedAtUtc: WINDOW05_READINESS_RECORDED_AT_UTC,
          history: HISTORY,
        }),
      ),
    ).toBe('NOTHING_TO_APPEND');
  });
});

// ---------------------------------------------------------------------------
// Negative attacks: the Window-04 correction is not an escape hatch.
// ---------------------------------------------------------------------------

describe('Window-04 correction attacks - each refuses', () => {
  it('the attack list recorded in the readiness is the list proved here', () => {
    expect(WINDOW05_CORRECTION_ATTACKS).toHaveLength(16);
  });

  it('Window 04 supplied without its approved correction', () => {
    const uncorrected = fourWindowHistoryForWindow05(INPUTS, { withCorrection: false });
    expect(uncorrected.windows[3]!.authorityShapeCorrection).toBeUndefined();
    expect(replay(uncorrected)).toBe('HISTORY_RECORD_SHAPE');
    expect(integrityOf(uncorrected).failures).toEqual([
      'REFUSED HISTORY_RECORD_SHAPE: boundStartingLedger is not an object',
    ]);
    const { authorityShapeCorrection: _dropped, ...bare } = W04;
    expect(replay({ windows: [W01, W02, W03, bare] })).toBe('HISTORY_RECORD_SHAPE');
  });

  it('wrong correction hash', () => {
    const edited = new Map(COMMITTED).set(
      CORRECTION.record.path,
      `${CORRECTION.record.text.trimEnd()} \n`,
    );
    expect(refusal(() => fourWindowHistoryForWindow05({ ...INPUTS, committed: edited }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
    const unsealed = {
      windows: [
        W01,
        W02,
        W03,
        {
          ...W04,
          authorityShapeCorrection: {
            ...CORRECTION,
            record: { ...CORRECTION.record, sha256: 'f'.repeat(64) },
          },
        },
      ],
    };
    expect(replay(unsealed)).toBe('HISTORY_RECORD_NOT_PINNED');
  });

  it('wrong authority commit (in the record, or named by the caller)', () => {
    expect(
      replay(
        withCorrection((r) => void (r.boundAuthority.commit = WINDOW05_W04_PINS.liveResult.commit)),
      ),
    ).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_FOR_THIS_AUTHORITY');
    expect(replay(withCorrection(() => undefined, WINDOW05_W04_PINS.liveResult.commit))).toBe(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_FOR_THIS_AUTHORITY',
    );
    expect(
      refusal(() =>
        fourWindowHistoryForWindow05({
          ...INPUTS,
          window04AuthorityTextAtCommit: git(
            'show',
            `${WINDOW05_W04_PINS.authority.commit}^:${WINDOW05_W02_PINS.authority.path}`,
          ),
        }),
      ),
    ).toBe('HISTORY_BINDING_NOT_PINNED');
  });

  it('wrong authority SHA', () => {
    expect(replay(withCorrection((r) => void (r.boundAuthority.sha256 = 'f'.repeat(64))))).toBe(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_FOR_THIS_AUTHORITY',
    );
  });

  it('wrong spec hash', () => {
    expect(
      replay(
        withCorrection(
          (r) => void (r.boundWindowSpecHash = EXPECTED_WINDOW_05.rebuiltWindowSpecHashes[2]),
        ),
      ),
    ).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_FOR_THIS_AUTHORITY');
  });

  it.each([
    ['Window 01', 0],
    ['Window 02', 1],
    ['Window 03', 2],
  ])('correction attached to %s', (_name, k) => {
    const windows = [W01, W02, W03, W04].map((window, j) =>
      j === k ? { ...window, authorityShapeCorrection: CORRECTION } : window,
    );
    expect(replay({ windows })).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND');
    // Even re-labelled for that window, the approval is pinned to Window 04's authority.
    const relabelled = clone(CORRECTION_RECORD);
    relabelled.windowOrdinal = k + 1;
    const forged = [W01, W02, W03, W04].map((window, j) =>
      j === k
        ? {
            ...window,
            authorityShapeCorrection: {
              record: sealRecord(CORRECTION.record.path, relabelled),
              authorityCommit: CORRECTION.authorityCommit,
            },
          }
        : window,
    );
    expect(replay({ windows: forged })).toBe(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_FOR_THIS_AUTHORITY',
    );
  });

  it('correction attached to prospective Window 05', () => {
    const synthetic = syntheticWindow05(SPEC, 'test-correction-on-window-05');
    const w05 = synthetic.history.windows[4]!;
    expect(
      replay(
        { windows: [...HISTORY.windows, { ...w05, authorityShapeCorrection: CORRECTION }] },
        synthetic.ledger,
      ),
    ).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND');
    // Re-labelled for Window 05 and re-bound to its bytes: still not an approved correction.
    const record = clone(CORRECTION_RECORD);
    record.windowOrdinal = 5;
    record.authorityShapeCorrection.scope = 'EXACT_PINNED_WINDOW_05_AUTHORITY_ONLY';
    record.boundWindowSpecHash = SPEC.windowSpecHash;
    record.boundAuthority = {
      ...record.boundAuthority,
      path: w05.authority.path,
      sha256: w05.authority.sha256,
      bytes: bytesOf(w05.authority.text),
    };
    const authority = JSON.parse(w05.authority.text) as Json;
    authority.boundLedger = authority.boundStartingLedger;
    delete authority.boundStartingLedger;
    const aliased = sealRecord(w05.authority.path, authority);
    record.boundAuthority.sha256 = aliased.sha256;
    record.boundAuthority.bytes = bytesOf(aliased.text);
    record.authorityShapeCorrection.sourceValueCanonicalSha256 = sha256(
      canonicalStringify(authority.boundLedger),
    );
    const forged = {
      ...w05,
      authority: aliased,
      authorityShapeCorrection: {
        record: sealRecord(CORRECTION.record.path, record),
        authorityCommit: CORRECTION.authorityCommit,
      },
    };
    expect(replay({ windows: [...HISTORY.windows, forged] }, synthetic.ledger)).toBe(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_APPROVED',
    );
  });

  it('future authority with only boundLedger', () => {
    const synthetic = syntheticWindow05(SPEC, 'test-future-bound-ledger');
    const w05 = synthetic.history.windows[4]!;
    const authority = JSON.parse(w05.authority.text) as Json;
    authority.boundLedger = authority.boundStartingLedger;
    delete authority.boundStartingLedger;
    const history = {
      windows: [
        ...HISTORY.windows,
        { ...w05, authority: sealRecord(w05.authority.path, authority) },
      ],
    };
    expect(replay(history, synthetic.ledger)).toBe('HISTORY_RECORD_SHAPE');
    expect(integrityOf(history, synthetic.ledger).holds).toBe(false);
    // The canonical shape of the same window replays.
    expect(replay(synthetic.history, synthetic.ledger)).toBe('NO_REFUSAL');
  });

  it.each([
    [
      'correction mapping another field',
      (r: Json) => void (r.authorityShapeCorrection.sourceField = 'boundAdjudicationHistory'),
    ],
    [
      'correction mapping onto another canonical field',
      (r: Json) => void (r.authorityShapeCorrection.canonicalField = 'boundWindowSpec'),
    ],
    [
      'correction containing extra override keys',
      (r: Json) => void (r.authorityShapeCorrection.extraMapping = { exactOrder: 'items' }),
    ],
    ['correction containing an exactOrder override', (r: Json) => void (r.exactOrder = [])],
    ['correction widening invocation limits', (r: Json) => void (r.maximumLiveInvocations = 10)],
    [
      'correction widening per-item invocation limits',
      (r: Json) => void (r.maximumLiveInvocationsPerWorkItem = 2),
    ],
    ['correction changing work items', (r: Json) => void (r.authorisedWorkItems = [])],
    [
      'correction changing starting ledger',
      (r: Json) => void (r.boundStartingLedger = { ...r.boundCurrentLedger, entryCount: 6 }),
    ],
    ['correction changing spec hash', (r: Json) => void (r.windowSpecHash = 'f'.repeat(64))],
  ])('%s', (_name, mutate) => {
    expect(replay(withCorrection(mutate))).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_APPROVED');
  });

  it('correction changing starting ledger through its pinned value hash', () => {
    const history = withCorrection(
      (r) =>
        void (r.authorityShapeCorrection.sourceValueCanonicalSha256 = sha256(
          canonicalStringify({ entryCount: 6 }),
        )),
    );
    expect(replay(history)).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_VALUE_MISMATCH');
  });

  it('a correction granting authority is refused', () => {
    for (const [field, value] of [
      ['networkAuthorised', true],
      ['window05Authorised', true],
      ['reserveAssignmentAuthorised', true],
      ['thisFileAuthorises', ['G2P:92']],
    ] as const) {
      expect(replay(withCorrection((r) => void (r[field] = value))), field).toBe(
        'HISTORY_AUTHORITY_SHAPE_CORRECTION_GRANTS_AUTHORITY',
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Negative attacks: the history defences.
// ---------------------------------------------------------------------------

describe('Window-05 history attacks - each refuses', () => {
  const item = (k: number) => (r: Json) => r.items[k] as Json;

  it('the attack list recorded in the readiness is the list proved here', () => {
    expect(WINDOW05_HISTORY_ATTACKS).toHaveLength(14);
  });

  it('missing Window 01', () => {
    expect(refusedWith({ windows: [W02, W03, W04] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(integrityOf({ windows: [W02, W03, W04] }).holds).toBe(false);
    const committed = new Map(COMMITTED);
    committed.delete(W01.authority.path);
    expect(refusal(() => fourWindowHistoryForWindow05({ ...INPUTS, committed }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('missing intermediate window', () => {
    for (const windows of [
      [W01, W03, W04],
      [W01, W02, W04],
    ]) {
      expect(refusedWith({ windows })).toBe('HISTORY_OUT_OF_ORDER');
    }
    const committed = new Map(COMMITTED);
    committed.delete(W03.liveResult.path);
    expect(refusal(() => buildWindow05Readiness({ ...INPUTS, committed }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('reordered windows', () => {
    expect(refusedWith({ windows: [W01, W02, W04, W03] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(refusedWith({ windows: [W04, W03, W02, W01] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(integrityOf({ windows: [W02, W01, W03, W04] }).holds).toBe(false);
  });

  it('duplicated window ordinal', () => {
    expect(refusedWith({ windows: [W01, W02, W03, W03] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(refusedWith({ windows: [W01, W02, W03, { ...W04, windowOrdinal: 3 }] })).toBe(
      'HISTORY_OUT_OF_ORDER',
    );
    expect(integrityOf({ windows: [W01, W02, W03, W04, W04] }).holds).toBe(false);
  });

  it('edited historical authority', () => {
    const text = W03.authority.text.replace('"concurrency": 1', '"concurrency": 2');
    expect(text).not.toBe(W03.authority.text);
    expect(
      refusedWith({ windows: [W01, W02, { ...W03, authority: { ...W03.authority, text } }, W04] }),
    ).toBe('HISTORY_RECORD_NOT_PINNED');
    const edited = new Map(COMMITTED).set(W04.authority.path, `${W04.authority.text} `);
    expect(refusal(() => fourWindowHistoryForWindow05({ ...INPUTS, committed: edited }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('edited LIVE_RESULT (re-sealed)', () => {
    const forged = tamperedW04({ live: (r) => void (item(2)(r).selectionIndex = 97) });
    expect(refusedWith(forged)).toBe('HISTORY_UNAUTHORISED_ITEM');
    expect(integrityOf(forged).holds).toBe(false);
    const edited = new Map(COMMITTED).set(W04.liveResult.path, `${W04.liveResult.text} `);
    expect(refusal(() => fourWindowHistoryForWindow05({ ...INPUTS, committed: edited }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('edited adjudication (re-sealed): forged summaries and verdicts', () => {
    const cases: ((r: Json) => void)[] = [
      (r) => void (r.generation2StateAfter.ACQUISITION_SUCCESSFUL = 93),
      (r) => void (r.generation2StateAfter.CURRENT_ACQUISITION_FAILURE = [91]),
      (r) => void (r.generation2StateAfter.NEVER_STARTED.from = 93),
      (r) => void (r.q1After = [91]),
      (r) => void (r.windowSummary.acquisitionUnsuccessful = [91]),
      (r) => void (r.ledgerAfter.entryCount = 6),
    ];
    for (const mutate of cases) {
      expect(refusedWith(tamperedW04({ adjudication: mutate }))).toBe('HISTORY_SUMMARY_DISAGREES');
    }
    const verdict = (r: Json) => {
      item(4)(r).adjudication.verdict = 'ACQUISITION_UNSUCCESSFUL';
      item(4)(r).adjudication.q3Reason = HOST;
    };
    expect(refusedWith(tamperedW04({ adjudication: verdict }))).toBe('HISTORY_SUMMARY_DISAGREES');
    const edited = new Map(COMMITTED).set(W04.adjudication.path, `${W04.adjudication.text} `);
    expect(refusal(() => fourWindowHistoryForWindow05({ ...INPUTS, committed: edited }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('mismatched starting ledger', () => {
    expect(
      refusedWith({ windows: [W01, W02, W03, { ...W04, startingLedgerText: W03_START_TEXT }] }),
    ).toBe('HISTORY_LEDGER_NOT_A_PREFIX');
    expect(
      refusal(() =>
        fourWindowHistoryForWindow05({
          ...INPUTS,
          startingLedgerTexts: [GENESIS_TEXT, W02_START_TEXT, W03_START_TEXT, W03_START_TEXT],
        }),
      ),
    ).toBe('HISTORY_BINDING_NOT_PINNED');
    // Window 05 planned against the Window-03 starting revision fails P7.
    const p = preflightOf(CURRENT_TEXT, SPEC, HISTORY, W03_START_TEXT);
    expect(p.invariants.startingLedgerRevisionMatchesPrecommit).toBe(false);
  });

  it('mismatched rebuilt spec: a self-consistent window whose spec is not the frozen one', () => {
    // A re-sealed spec with an altered P5 threshold: every cross-binding of the
    // synthetic triple agrees, so only the independent rebuild can refuse it.
    const altered = resealedSpec((s) => void (s.gateThresholds.p5LowRawYieldWindowCount = 3));
    const synthetic = syntheticWindow05(altered, 'test-mismatched-rebuilt-spec');
    expect(replay(synthetic.history, synthetic.ledger)).toBe('NO_REFUSAL');
    const integrity = integrityOf(synthetic.history, synthetic.ledger);
    expect(integrity.holds).toBe(false);
    expect(integrity.failures).toEqual(['window 5: bound windowSpecHash is not the rebuilt spec']);
    // A reordered spec is refused earlier, by the replay itself.
    const reordered = resealedSpec((s) => {
      const items = s.workItems as Json[];
      [items[0], items[4]] = [items[4]!, items[0]!];
      items.forEach((it, k) => void (it.order = k + 1));
    });
    const reorderedWindow = syntheticWindow05(reordered, 'test-reordered-rebuilt-spec');
    expect(replay(reorderedWindow.history, reorderedWindow.ledger)).toBe(
      'HISTORY_AUTHORITY_WORK_ITEM',
    );
  });

  it('duplicate run ref within a window (re-sealed)', () => {
    const dup = runRefsOf(W04)[0]!;
    const forged = tamperedW04({
      live: (r) => void (item(1)(r).runRefSha256 = dup),
      adjudication: (r) => void (item(1)(r).runRefSha256 = dup),
    });
    expect(refusedWith(forged)).toBe('HISTORY_LIVE_RESULT_ITEMS');
    expect(integrityOf(forged).holds).toBe(false);
  });

  it('duplicate run ref across windows (re-sealed): refused by the GENERIC integrity', () => {
    for (const [source, k] of [
      [W01, 0],
      [W03, 4],
    ] as const) {
      const reused = runRefsOf(source)[k]!;
      const forged = tamperedW04({
        live: (r) => void (item(3)(r).runRefSha256 = reused),
        adjudication: (r) => void (item(3)(r).runRefSha256 = reused),
      });
      expect(replay(forged)).toBe('NO_REFUSAL');
      const integrity = integrityOf(forged);
      expect(integrity.holds).toBe(false);
      expect(integrity.failures).toEqual([
        expect.stringMatching(
          new RegExp(
            `^REFUSED HISTORY_DUPLICATE_RUN_REFERENCE: .*window ${String(source.windowOrdinal)} reappears in window 4`,
          ),
        ),
      ]);
      expect(preflightOf(CURRENT_TEXT, SPEC, forged).operationalPrerequisites).toMatchObject({
        adjudicationHistoryIntegrity: false,
      });
    }
    // A synthetic Window 05 reusing a real Window-04 reference is refused the same way.
    const synthetic = syntheticWindow05(SPEC, 'test-cross-window-05');
    const w05 = synthetic.history.windows[4]!;
    const reused = runRefsOf(W04)[2]!;
    const live = JSON.parse(w05.liveResult.text) as Json;
    live.items[0].runRefSha256 = reused;
    const liveResult = sealRecord(w05.liveResult.path, live);
    const adjudication = JSON.parse(w05.adjudication.text) as Json;
    adjudication.items[0].runRefSha256 = reused;
    adjudication.bound.liveResult = refOf(liveResult);
    const history = {
      windows: [
        ...HISTORY.windows,
        { ...w05, liveResult, adjudication: sealRecord(w05.adjudication.path, adjudication) },
      ],
    };
    expect(integrityOf(history, synthetic.ledger).failures).toEqual([
      expect.stringMatching(/HISTORY_DUPLICATE_RUN_REFERENCE: .*window 4 reappears in window 5/),
    ]);
  });

  it('Window-02 validation-chain tampering', () => {
    const texts = new Map<string, string>([...COMMITTED, ...AUDITS]);
    const lastW02 = (JSON.parse(W02.authority.text) as { exactOrder: string[] }).exactOrder.at(-1)!;
    expect(refusal(() => verifyWindow02ValidationChain(texts, lastW02))).toBe('NO_REFUSAL');
    const stop = WINDOW05_W02_VALIDATION_CHAIN.stopAudit.path;
    const tamperedAudits = new Map(AUDITS).set(stop, `${AUDITS.get(stop)!}\n`);
    expect(refusal(() => buildWindow05Readiness({ ...INPUTS, auditTexts: tamperedAudits }))).toBe(
      'VALIDATION_CHAIN_NOT_PINNED',
    );
    const ruling = WINDOW05_W02_VALIDATION_CHAIN.ownerRuling.path;
    const tampered = new Map(COMMITTED).set(ruling, `${COMMITTED.get(ruling)!} `);
    expect(
      refusal(() => verifyWindow02ValidationChain(new Map([...tampered, ...AUDITS]), lastW02)),
    ).toBe('VALIDATION_CHAIN_NOT_PINNED');
  });

  it('reuse of the Window-02 P5 ruling outside Window 02', () => {
    const w03 = JSON.parse(W03.adjudication.text) as Json;
    w03.p5.window02RulingNotReused = false;
    expect(refusal(() => verifyWindow03Validation(JSON.stringify(w03)))).toBe(
      'WINDOW_03_VALIDATION_NOT_ACCEPTED',
    );
    const w04 = JSON.parse(W04.adjudication.text) as Json;
    w04.p5.window02RulingNotReused = false;
    expect(refusal(() => verifyWindow04Adjudication(JSON.stringify(w04)))).toBe(
      'WINDOW_04_VALIDATION_NOT_ACCEPTED',
    );
    expect(RECORD.bound.window02ValidationChain.window02P5RulingReusedForAnyLaterWindow).toBe(
      false,
    );
  });

  it('Window-04 G2P:88 ruling generalised to Window 05', () => {
    for (const mutate of [
      (r: Json) => void (r.operatorExecutionChannelAnomaly.ownerRulingScope = 'generic precedent'),
      (r: Json) => void (r.operatorExecutionChannelAnomaly.item = 'G2P:92'),
      (r: Json) => void (r.operatorExecutionChannelAnomaly.ownerRuling = 'CONFIRM_ANY_CONTINUE_V1'),
    ]) {
      const w04 = JSON.parse(W04.adjudication.text) as Json;
      mutate(w04);
      expect(refusal(() => verifyWindow04Adjudication(JSON.stringify(w04)))).toBe(
        'WINDOW_04_OPERATOR_RULING_NOT_SCOPED',
      );
    }
    expect(RECORD.window05.inheritedAnomalyWaivers).toEqual([]);
    expect(RECORD.bound.window04Validation.g2p88OperatorRuling.inheritedByWindow05).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Negative attacks: state, spec and gates.
// ---------------------------------------------------------------------------

describe('Window-05 state attacks - each refuses', () => {
  it('the attack list recorded in the readiness is the list proved here', () => {
    expect(WINDOW05_STATE_ATTACKS).toHaveLength(11);
  });

  it('fake Q1 when Q1 is empty', () => {
    const assignment = { selectionIndex: 92, generation2ReserveRankPosition: 5, reason: HOST };
    expect(
      refusal(() =>
        prepareGeneration2ReplacementAppend({
          basis: BASIS,
          ledger: CURRENT,
          assignments: [assignment] as never,
          recordedAtUtc: WINDOW05_READINESS_RECORDED_AT_UTC,
          history: HISTORY,
        }),
      ),
    ).toBe('NOTHING_TO_APPEND');
    const spec = resealedSpec((s) => void (s.planningState.q1 = [92]));
    expect(falseInvariants(preflightOf(CURRENT_TEXT, spec))).toContain('windowSpecHashValid');
    const planned = resealedSpec(
      (s) => void (s.plannedReplacementAppend = [{ sequence: 5, ...assignment }]),
    );
    expect(falseInvariants(preflightOf(CURRENT_TEXT, planned))).toContain(
      'completeQ1EqualsPlanningQ1',
    );
  });

  it('reserve 5 assigned despite empty Q1 (a valid, re-hashed ledger entry)', () => {
    const occupant = resolveCrossGenerationOccupant(BASIS, CURRENT, 92);
    const payload = {
      sequence: 5,
      selectionIndex: 92,
      split: occupant.split,
      replacedEcheRowKey: occupant.echeRowKey,
      replacementEcheRowKey: BASIS.schedule[5]!.echeRowKey,
      generation2ReserveRankPosition: 5,
      reason: HOST,
      recordedAtUtc: WINDOW05_READINESS_RECORDED_AT_UTC,
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

  it('G2P:91 repeated / G2P:97 substituted (re-sealed, genuine digests)', () => {
    for (const spec of [substituted(0, 91), substituted(4, 97)]) {
      const p = preflightOf(CURRENT_TEXT, spec);
      expect(p.invariants.executionEntryIdentitiesMatch).toBe(true);
      expect(p.invariants.workItemsMatchGovernance).toBe(false);
      expect(p.invariants.windowSpecHashValid).toBe(false);
    }
  });

  it('G2P:92-G2P:96 reordered (re-sealed)', () => {
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

  it('wrong starting ledger revision for Window 05', () => {
    const p = preflightOf(CURRENT_TEXT, SPEC, HISTORY, W03_START_TEXT);
    expect(p.invariants.startingLedgerRevisionMatchesPrecommit).toBe(false);
    expect(
      refusal(() => buildWindow05Readiness({ ...INPUTS, currentLedgerText: W03_START_TEXT })),
    ).toBe('CURRENT_LEDGER_NOT_CANONICAL');
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
  });

  it('frozen P7 changed', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(RECORD.gates.p7.invariants).toEqual([...GENERATION2_P7_INVARIANT_NAMES]);
    const path =
      'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json';
    const edited = new Map(COMMITTED).set(path, `${COMMITTED.get(path)!} `);
    expect(assessCommittedInputs(edited).basis).toBeNull();
    expect(refusal(() => buildWindow05Readiness({ ...INPUTS, committed: edited }))).toBe(
      'BASIS_NOT_EXACT',
    );
  });

  it('dynamic directory scan / latest discovery is impossible: the namespace reads no directory', () => {
    for (const name of [
      'window05Readiness.ts',
      'window05Contract.ts',
      'materialiseWindow05Readiness.ts',
    ]) {
      expect(readState(`src/test/harness/phase2b2d/generation2Window05/${name}`), name).not.toMatch(
        /readdirSync|readdir\(|\bglob\(|statSync|findLatest|latestWindow/,
      );
    }
    // A "latest" record substituted at the pinned Window-04 adjudication path is refused.
    const committed = new Map(COMMITTED).set(
      W04.adjudication.path,
      COMMITTED.get(WINDOW05_W04_PINS.offlineReadiness.path)!,
    );
    expect(refusal(() => fourWindowHistoryForWindow05({ ...INPUTS, committed }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
    const readiness = readState(WINDOW05_READINESS_PATH);
    const asAdjudication: CommittedRecordBinding = {
      path: WINDOW05_READINESS_PATH,
      sha256: sha256(readiness),
      text: readiness,
    };
    expect(
      refusedWith({ windows: [W01, W02, W03, { ...W04, adjudication: asAdjudication }] }),
    ).toBe('HISTORY_ADJUDICATION_KIND');
  });
});

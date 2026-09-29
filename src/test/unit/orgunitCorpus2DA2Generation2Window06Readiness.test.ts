/**
 * Phase 2B-2D A2 Generation 2: WINDOW-06 OFFLINE READINESS over the explicit
 * five-window history (Window 04 with its pinned authority-shape correction,
 * Window 05 through its LIVE_RESULT V2 and its validation re-proof chain) -
 * the proofs.
 *
 * Reads only committed bytes - at this task's own terminal commit (the one
 * that adds its audit) once it exists, else the working tree - so a later,
 * separately authorised Window-06 authority or ledger append cannot turn these
 * claims into a temporal defect. Opens no socket and no database, writes no
 * file, assigns no reserve and never mutates the canonical Generation-2
 * ledger: every append, failure and synthetic window here exists in memory.
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
import { renderWindow06Readiness } from '../harness/phase2b2d/generation2Window06/materialiseWindow06Readiness.js';
import {
  EXPECTED_WINDOW_06,
  GENESIS_REVISION_COMMIT,
  WINDOW06_CURRENT_LEDGER_REVISION,
  WINDOW06_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  WINDOW06_READINESS_AUDIT_PATH,
  WINDOW06_READINESS_PATH,
  WINDOW06_READINESS_STARTING_HEAD,
  WINDOW06_READINESS_TERMINAL_STATE,
  WINDOW06_W01_PINS,
  WINDOW06_W02_PINS,
  WINDOW06_W02_VALIDATION_CHAIN,
  WINDOW06_W03_PINS,
  WINDOW06_W04_PINS,
  WINDOW06_W05_PINS,
  WINDOW06_W05_RECORD_PINS,
} from '../harness/phase2b2d/generation2Window06/window06Contract.js';
import {
  WINDOW06_HISTORY_ATTACKS,
  WINDOW06_Q1_ATTACKS,
  WINDOW06_WINDOW_ATTACKS,
  buildWindow06Readiness,
  fiveWindowHistoryForWindow06,
  verifyWindow05Validation,
  type Window06Inputs,
} from '../harness/phase2b2d/generation2Window06/window06Readiness.js';

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The commit that added this task's audit, or null while it is uncommitted. */
function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW06_READINESS_AUDIT_PATH)
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
const W02_START_TEXT = at(WINDOW06_W02_PINS.startingLedgerRevisionCommit);
const W03_START_TEXT = at(WINDOW06_W03_PINS.startingLedgerRevisionCommit);
const W04_START_TEXT = at(WINDOW06_W04_PINS.startingLedgerRevisionCommit);
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
  [WINDOW06_W02_VALIDATION_CHAIN.stopAudit, WINDOW06_W02_VALIDATION_CHAIN.closureAudit].map(
    (pin) => [pin.path, git('show', `${pin.commit}:${pin.path}`)] as const,
  ),
);
const W05_AT_COMMIT = new Map<string, string>(
  WINDOW06_W05_RECORD_PINS.map(
    (pin) => [pin.path, git('show', `${pin.commit}:${pin.path}`)] as const,
  ),
);
const INPUTS: Window06Inputs = {
  committed: COMMITTED,
  currentLedgerText: CURRENT_TEXT,
  startingLedgerTexts: STARTS,
  window04AuthorityTextAtCommit: git(
    'show',
    `${WINDOW06_W04_PINS.authority.commit}:${WINDOW06_W04_PINS.authority.path}`,
  ),
  window05TextsAtCommit: W05_AT_COMMIT,
  auditTexts: AUDITS,
};
const ASSESSMENT = assessCommittedInputs(COMMITTED);
const BASIS = ASSESSMENT.basis!;
const CURRENT = parseOperationalGeneration2Ledger(JSON.parse(CURRENT_TEXT), BASIS.genesis);
const HISTORY = fiveWindowHistoryForWindow06(INPUTS);
const [W01, W02, W03, W04, W05] = HISTORY.windows as [
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
];
const CORRECTION = W04.authorityShapeCorrection!;
const READINESS = buildWindow06Readiness(INPUTS);
const SPEC = READINESS.spec;
const RECORD = READINESS.record as Json;
const PROSPECTIVE = parseOperationalGeneration2Ledger(
  JSON.parse(READINESS.prospectiveLedgerText),
  BASIS.genesis,
);

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
const item = (k: number) => (r: Json) => r.items[k] as Json;
const rebind = (binding: CommittedRecordBinding, value: unknown): CommittedRecordBinding =>
  sealRecord(binding.path, value);
const runRefsOf = (binding: Generation2WindowHistoryBinding): string[] =>
  (JSON.parse(binding.adjudication.text) as Json).items.map((i: Json) => i.runRefSha256 as string);

/**
 * Tampers the Window-05 LIVE_RESULT and/or adjudication and RE-SEALS every
 * downstream reference, as an attacker controlling the pins would: the
 * semantic layer - not the hash pin - must be what refuses.
 */
function tamperedW05(mutate: {
  live?: (r: Json) => void;
  adjudication?: (r: Json) => void;
}): Generation2AdjudicationHistory {
  const liveJson = JSON.parse(W05.liveResult.text) as Json;
  mutate.live?.(liveJson);
  const liveResult = mutate.live ? rebind(W05.liveResult, liveJson) : W05.liveResult;
  const adjudicationJson = JSON.parse(W05.adjudication.text) as Json;
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
      W04,
      { ...W05, liveResult, adjudication: rebind(W05.adjudication, adjudicationJson) },
    ],
  };
}

const preflightOf = (
  currentText: string = READINESS.prospectiveLedgerText,
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
const gateOf = (p: Generation2Preflight, reserveConsumedCount: number) =>
  evaluateGeneration2WindowGate({
    spec: SPEC,
    preflight: p,
    generation: { successfulOrganisationCount: 95, reserveConsumedCount },
    completed: [],
  });
/** A spec edited by an attacker and re-sealed with its recomputed hash. */
const resealedSpec = (mutate: (spec: Json) => void): Generation2WindowSpec => {
  const spec = clone(SPEC) as unknown as Json;
  mutate(spec);
  spec.windowSpecHash = recomputeWindowSpecHash(spec as unknown as Generation2WindowSpec);
  return spec as unknown as Generation2WindowSpec;
};
/** Substitutes a genuine primary (real digest) for one Window-06 item, re-sealed. */
const substituted = (position: number, selectionIndex: number): Generation2WindowSpec => {
  const binding = buildPrimaryExecutionBinding(BASIS.frameIndex, BASIS.draw, selectionIndex);
  return resealedSpec((s) => {
    const it = (s.workItems as Json[])[position]!;
    it.workItemId = `G2P:${String(selectionIndex)}`;
    it.kind = 'PRIMARY';
    it.selectionIndex = selectionIndex;
    it.split = binding.split;
    it.identityDigest = binding.drawEntrySha256;
    it.rootAuthorityCount = binding.rootAuthorityCount;
  });
};
const swapped = (a: number, b: number): Generation2WindowSpec =>
  resealedSpec((s) => {
    const items = s.workItems as Json[];
    [items[a], items[b]] = [items[b]!, items[a]!];
    items.forEach((it, k) => void (it.order = k + 1));
  });

const Q1 = planCompleteQ1(BASIS, CURRENT, HISTORY);
const [A94, A96] = Q1 as [(typeof Q1)[number], (typeof Q1)[number]];
const appendWith = (
  assignments: readonly {
    selectionIndex: number;
    generation2ReserveRankPosition: number;
    reason: string;
  }[],
  history: Generation2AdjudicationHistory = HISTORY,
  ledger = CURRENT,
) =>
  refusal(() =>
    prepareGeneration2ReplacementAppend({
      basis: BASIS,
      ledger,
      assignments: assignments as never,
      recordedAtUtc: WINDOW06_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      history,
    }),
  );

/** A prospective ledger whose entry 5 is edited and RE-CHAINED, so only semantics can refuse it. */
function forgedProspective(mutate: (payload: Json) => void): string {
  const entries: Json[] = [...PROSPECTIVE.entries];
  const { entryHash: _a, ...first } = entries[5]!;
  void _a;
  mutate(first);
  const firstHash = computeEntryHash(first as never);
  entries[5] = { ...first, entryHash: firstHash };
  const { entryHash: _b, ...second } = { ...entries[6]!, previousEntryHash: firstHash } as Json;
  void _b;
  entries[6] = { ...second, entryHash: computeEntryHash(second as never) };
  return `${JSON.stringify(withEntries(BASIS.genesis, entries as never), null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Canonical start and bindings.
// ---------------------------------------------------------------------------

describe('Generation-2 Window 06 offline readiness: canonical start and bindings', () => {
  it('starts from the exact committed inputs, the Window-05 adjudication commit and the 5-entry ledger', () => {
    expect(ASSESSMENT.failures).toEqual([]);
    expect(Object.values(ASSESSMENT.checks).every(Boolean)).toBe(true);
    expect(git('merge-base', '--is-ancestor', WINDOW06_READINESS_STARTING_HEAD, 'HEAD')).toBe('');
    expect(WINDOW06_READINESS_STARTING_HEAD).toBe(WINDOW06_W05_PINS.adjudication.commit);
    expect(sha256(CURRENT_TEXT)).toBe(WINDOW06_CURRENT_LEDGER_REVISION.fileSha256);
    expect(bytesOf(CURRENT_TEXT)).toBe(WINDOW06_CURRENT_LEDGER_REVISION.bytes);
    expect(CURRENT.ledgerHash).toBe(
      'e58f872e22f3794ac3af2ed34ee802f0b140ffc95d94dc19a1b28db1a7b00a72',
    );
    expect(CURRENT.entries).toHaveLength(5);
    expect(CURRENT_TEXT).toBe(at(WINDOW06_CURRENT_LEDGER_REVISION.appendCommit));
    expect(CURRENT_TEXT).toBe(at(WINDOW06_READINESS_STARTING_HEAD));
  });

  it('the direct closure chain adds exactly the LIVE_RESULT V2, the ruling, the re-proof and the adjudication', () => {
    const chain = WINDOW06_W05_PINS.closureChain;
    const files = [
      WINDOW06_W05_PINS.liveResult.path,
      WINDOW06_W05_PINS.validationOwnerRuling.path,
      WINDOW06_W05_PINS.validationReproof.path,
      WINDOW06_W05_PINS.adjudication.path,
    ];
    chain.forEach((commit, k) => {
      expect(git('diff-tree', '--no-commit-id', '--name-status', '-r', commit).trim()).toBe(
        `A\t${files[k]!}`,
      );
      if (k > 0) expect(git('rev-parse', `${commit}^`).trim()).toBe(chain[k - 1]);
    });
    expect(git('merge-base', '--is-ancestor', chain[3]!, 'HEAD')).toBe('');
  });

  it('LIVE_RESULT V1 is byte-identical to the commit that added it and was never rewritten', () => {
    const pin = WINDOW06_W05_PINS.liveResultV1;
    expect(git('log', '--format=%H', '--', pin.path).split('\n').filter(Boolean)).toEqual([
      pin.commit,
    ]);
    expect(readState(pin.path)).toBe(git('show', `${pin.commit}:${pin.path}`));
    expect(sha256(readState(pin.path))).toBe(pin.sha256);
    expect(bytesOf(readState(pin.path))).toBe(pin.bytes);
    expect(git('diff', pin.commit, 'HEAD', '--', pin.path)).toBe('');
  });

  it('binds Windows 01-05 by the exact committed bytes at their commits, in explicit order', () => {
    const pairs = [
      [W01, WINDOW06_W01_PINS],
      [W02, WINDOW06_W02_PINS],
      [W03, WINDOW06_W03_PINS],
      [W04, WINDOW06_W04_PINS],
      [W05, WINDOW06_W05_PINS],
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
    expect(HISTORY.windows.map((w) => w.windowOrdinal)).toEqual([1, 2, 3, 4, 5]);
    expect(W05.startingLedgerText).toBe(CURRENT_TEXT);
    expect(W05.liveResult.path).toBe(WINDOW06_W05_PINS.liveResult.path);
    expect(W05.liveResult.path).toMatch(/LIVE_RESULT_V2\.json$/);
    expect(W05.liveResult.sha256).not.toBe(WINDOW06_W05_PINS.liveResultV1.sha256);
    const adjudication = JSON.parse(W05.adjudication.text) as Json;
    expect(adjudication.bound.liveResult.path).toBe(WINDOW06_W05_PINS.liveResult.path);
    expect(adjudication.bound.liveResult.supersedesImmutableV1.sha256).toBe(
      WINDOW06_W05_PINS.liveResultV1.sha256,
    );
    expect(adjudication.terminalState).toBe(WINDOW06_W05_PINS.adjudication.terminalState);
  });

  it('exactly one pinned correction exists: Window 04 only; Window 05 carries the canonical field and none', () => {
    expect(HISTORY.windows.map((w) => w.authorityShapeCorrection !== undefined)).toEqual([
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS).toHaveLength(1);
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS[0]!.windowOrdinal).toBe(4);
    const w04 = JSON.parse(W04.authority.text) as Json;
    const w05 = JSON.parse(W05.authority.text) as Json;
    expect(Object.hasOwn(w04, 'boundStartingLedger')).toBe(false);
    expect(Object.hasOwn(w04, 'boundLedger')).toBe(true);
    expect(Object.hasOwn(w05, 'boundStartingLedger')).toBe(true);
    expect(Object.hasOwn(w05, 'boundLedger')).toBe(false);
  });

  it('the Window-05 validation chain: first V2 validation NOT_PROVED preserved, ruling, one clean re-proof, adjudication from it only', () => {
    const v = verifyWindow05Validation(COMMITTED);
    expect(v.firstValidation).toMatchObject({
      formalVerdict: 'VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED',
      reclassified: false,
      acceptedForAdjudication: false,
      exitCode: 0,
    });
    expect(v.reproof).toMatchObject({
      exclusivityVerdict: 'WINDOW_05_VALIDATION_EXCLUSIVITY_REPROVED_CLEAN',
      runs: 1,
      exitCode: 0,
      externalCompetingProcess: 0,
      ancestryUnproved: 0,
    });
    expect(v.ownerRulingDecisions).toContain(
      'APPROVE_EXACTLY_ONE_WINDOW_05_VALIDATION_EXCLUSIVITY_REPROOF_AFTER_EXTERNAL_COMPETITOR_STOP_V1',
    );
    expect(v.result).toBe('WINDOW_05_VALIDATION_ACCEPTED');
    expect(v.monitorCoverage).toMatchObject({
      items: ['G2P:92', 'G2P:93'],
      classification: 'CONCURRENCY_MONITOR_COVERAGE_INSUFFICIENT',
      executionExclusivity: 'NOT_PROVED',
      window05Only: true,
      inheritedByWindow06: false,
      proceduralDeviation: {
        item: 'G2P:93',
        name: 'WINDOW_05_NEXT_ITEM_STARTED_BEFORE_PRIOR_ITEM_MONITOR_COVERAGE_VERDICT_WAS_CHECKED',
      },
    });
    for (const pin of WINDOW06_W05_RECORD_PINS) {
      expect(sha256(readState(pin.path)), pin.path).toBe(pin.sha256);
      expect(readState(pin.path), pin.path).toBe(W05_AT_COMMIT.get(pin.path));
    }
  });
});

// ---------------------------------------------------------------------------
// The replayed state, the complete Q1 and the prospective append.
// ---------------------------------------------------------------------------

describe('Generation-2 Window 06 offline readiness: replayed state', () => {
  it('generic history integrity holds over all five windows with 25 globally unique run references', () => {
    const integrity = integrityOf(HISTORY);
    expect(integrity.holds).toBe(true);
    expect(integrity.failures).toEqual([]);
    expect(integrity.windowCount).toBe(5);
    expect(integrity.historicalRunReferences).toHaveLength(25);
    expect(new Set(integrity.historicalRunReferences).size).toBe(25);
    expect(integrity.rebuiltWindowSpecHashes).toEqual(EXPECTED_WINDOW_06.rebuiltWindowSpecHashes);
    expect(integrity.replay!.windows.map((w) => w.windowSpecHash)).toEqual(
      EXPECTED_WINDOW_06.rebuiltWindowSpecHashes,
    );
    expect(integrity.replay!.windows.map((w) => w.executed.length)).toEqual([5, 5, 5, 5, 5]);
    expect(integrity.replay!.consumedLedgerEntryCount).toBe(5);
  });

  it('Window 04 without its pinned correction still refuses; it is not a fallback for Window 05 or 06', () => {
    const uncorrected = fiveWindowHistoryForWindow06(INPUTS, { withCorrection: false });
    expect(replay(uncorrected)).toBe('HISTORY_RECORD_SHAPE');
    expect(integrityOf(uncorrected).holds).toBe(false);
  });

  it('derives 95 successful (18/38/39), failures [94, 96] MIN_PAGES, never-started 97..109', () => {
    const state = deriveGeneration2CurrentState(BASIS, CURRENT, HISTORY);
    expect(state.successfulOrganisationCount).toBe(95);
    expect(bySplitOf(BASIS, state.acquisitionSuccessful)).toEqual({
      DEV_TRAIN: 18,
      DEV_CONFIRM: 38,
      FINAL_HOLDOUT: 39,
    });
    expect(state.currentAcquisitionFailure).toEqual([94, 96]);
    expect(state.q1Reasons).toEqual([
      { selectionIndex: 94, reason: MIN_PAGES },
      { selectionIndex: 96, reason: MIN_PAGES },
    ]);
    expect(state.replacementAssignedAwaitingExecution).toEqual([]);
    expect(state.pendingCapabilityReview).toEqual([]);
    expect(state.carryForwardRefused).toEqual([]);
    expect(state.neverStarted).toEqual(Array.from({ length: 13 }, (_, k) => 97 + k));
    expect(state.accounting).toBe(
      '95 successful + 2 failed + 0 assigned + 0 pending + 13 never started = 110',
    );
    expect(state.ledgerEntryCount).toBe(5);
    expect(state.nextGeneration2ReservePosition).toBe(5);
    expect(state.ledgerHash).toBe(WINDOW06_CURRENT_LEDGER_REVISION.ledgerHash);
    expect(state.q1).toEqual([94, 96]);
  });

  it('Q1 is [94, 96] -> reserves 5 and 6, in that order, both replacing the Generation-1 terminal occupant', () => {
    expect(Q1).toEqual(EXPECTED_WINDOW_06.q1Assignments);
    for (const slot of [94, 96]) {
      const occupant = resolveCrossGenerationOccupant(BASIS, CURRENT, slot);
      expect(occupant.kind).toBe('GENERATION1_TERMINAL_OCCUPANT');
      expect(occupant.generation2LedgerSequence).toBeNull();
      expect(occupant.generation2EntryCountForSlot).toBe(0);
    }
  });

  it('the prospective append: sequences 5 and 6, chained to entry 4, schedule reserves 5 and 6, no reserve reused', () => {
    const append = prepareGeneration2ReplacementAppend({
      basis: BASIS,
      ledger: CURRENT,
      assignments: Q1,
      recordedAtUtc: WINDOW06_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      history: HISTORY,
    });
    expect(
      append.appendedEntries.map((e) => ({
        sequence: e.sequence,
        selectionIndex: e.selectionIndex,
        generation2ReserveRankPosition: e.generation2ReserveRankPosition,
        split: e.split,
        reason: e.reason,
        replacedOccupantKind: e.replacedOccupantKind,
        previousSequenceForSlot: e.previousSequenceForSlot,
      })),
    ).toEqual(EXPECTED_WINDOW_06.prospectiveAppend);
    expect(append.appendedEntries.map((e) => e.previousEntryHash)).toEqual([
      CURRENT.entries[4]!.entryHash,
      append.appendedEntries[0]!.entryHash,
    ]);
    append.appendedEntries.forEach((entry, k) => {
      const scheduled = BASIS.schedule[entry.generation2ReserveRankPosition]!;
      expect(entry.replacementEcheRowKey).toBe(scheduled.echeRowKey);
      expect(entry.split).toBe(BASIS.draw.selection[entry.selectionIndex]!.split);
      const { entryHash, ...payload } = entry;
      expect(entryHash).toBe(computeEntryHash(payload));
      expect(k + 5).toBe(entry.sequence);
    });
    expect(new Set(append.appendedEntries.map((e) => e.replacementEcheRowKey)).size).toBe(2);
    expect(append.reserveConsumedBefore).toBe(5);
    expect(append.reserveConsumedAfter).toBe(7);
    expect(validateOperationalGeneration2Ledger(BASIS, PROSPECTIVE).valid).toBe(true);
    expect(PROSPECTIVE.entries).toHaveLength(7);
  });

  it('after the append: 95 / [] / assigned [94, 96] / 97..109, Q1 empty, 7 entries, next reserve 7', () => {
    const post = deriveGeneration2CurrentState(BASIS, PROSPECTIVE, HISTORY);
    expect(post.successfulOrganisationCount).toBe(95);
    expect(post.currentAcquisitionFailure).toEqual([]);
    expect(post.replacementAssignedAwaitingExecution).toEqual([94, 96]);
    expect(post.pendingCapabilityReview).toEqual([]);
    expect(post.neverStarted).toEqual(Array.from({ length: 13 }, (_, k) => 97 + k));
    expect(post.q1).toEqual([]);
    expect(post.ledgerEntryCount).toBe(7);
    expect(post.nextGeneration2ReservePosition).toBe(7);
    expect(post.accounting).toBe(
      '95 successful + 0 failed + 2 assigned + 0 pending + 13 never started = 110',
    );
  });

  it('the canonical ledger is untouched: still the committed five-entry revision, reserve 5 unassigned', () => {
    expect(CURRENT.entries).toHaveLength(5);
    expect(CURRENT.entries.map((e) => e.generation2ReserveRankPosition)).toEqual([0, 1, 2, 3, 4]);
    expect(CURRENT_TEXT).toBe(at(WINDOW06_READINESS_STARTING_HEAD));
    expect(READINESS.prospectiveLedgerText).not.toBe(CURRENT_TEXT);
    expect(READINESS.prospectiveLedgerText.startsWith('{')).toBe(true);
    expect(
      git(
        'diff',
        '--name-only',
        WINDOW06_READINESS_STARTING_HEAD,
        'HEAD',
        '--',
        GENERATION2_LEDGER_PATH,
      ),
    ).toBe('');
  });
});

// ---------------------------------------------------------------------------
// The window.
// ---------------------------------------------------------------------------

describe('Generation-2 Window 06 offline readiness: the window', () => {
  it('is G2R:94:5, G2R:96:6, G2P:97, G2P:98, G2P:99 with the frozen draw splits', () => {
    expect(SPEC.workItems.map((i) => i.workItemId)).toEqual(EXPECTED_WINDOW_06.workItemIds);
    expect(SPEC.workItems.map((i) => i.kind)).toEqual([
      'REPLACEMENT',
      'REPLACEMENT',
      'PRIMARY',
      'PRIMARY',
      'PRIMARY',
    ]);
    for (const it of SPEC.workItems) {
      expect(it.split, it.workItemId).toBe(BASIS.draw.selection[it.selectionIndex]!.split);
    }
    expect(SPEC.workItems.slice(0, 2).map((i) => i.split)).toEqual(['DEV_CONFIRM', 'DEV_CONFIRM']);
    expect(SPEC.plannedWindowSize).toBe(5);
    expect(SPEC.plannedReplacementAppend).toEqual(EXPECTED_WINDOW_06.prospectiveAppend);
    expect(RECORD.window06.composition).toEqual({ DEV_TRAIN: 0, DEV_CONFIRM: 3, FINAL_HOLDOUT: 2 });
  });

  it('the spec hash is computed, recomputes, and an independent rebuild is identical', () => {
    expect(recomputeWindowSpecHash(SPEC)).toBe(SPEC.windowSpecHash);
    const again = buildWindow06Readiness(INPUTS);
    expect(canonicalStringify(again.spec)).toBe(canonicalStringify(SPEC));
    expect(again.spec.windowSpecHash).toBe(SPEC.windowSpecHash);
    expect(RECORD.window06.independentRebuild).toEqual({
      rebuiltWindowSpecHash: SPEC.windowSpecHash,
      canonicalBytesEqual: true,
      recomputedHashEqual: true,
    });
  });

  it('every execution identity re-binds exactly to the frozen schedule / draw and frame entry', () => {
    const bindings = RECORD.window06.executionBindings as Json[];
    expect(bindings).toHaveLength(5);
    for (const [k, b] of bindings.entries()) {
      expect(b.order).toBe(k + 1);
      expect(b.equalsSpecIdentityDigest, b.workItemId).toBe(true);
      expect(b.rootAuthorityCountEqualsSpec, b.workItemId).toBe(true);
      expect(b.rootAuthoritiesFromExactFrameEntryInOrder).toBe(true);
      if (b.kind === 'REPLACEMENT') {
        expect(b.identityEqualsScheduleAndFrame).toBe(true);
        expect(b.frameEntrySha256RecomputedAndEqual).toBe(true);
        expect(b.identityDigestKind).toBe('GENERATION2_EXECUTION_ENTRY_SHA256');
      } else {
        expect(b.identityEqualsDrawAndFrame).toBe(true);
        expect(b.splitExact).toBe(true);
        expect(b.selectionIndexExact).toBe(true);
        expect(b.identityDigestKind).toBe('ORIGINAL_DRAW_SELECTION_ENTRY_SHA256');
      }
    }
  });

  it('P2 = 3, P5 = 2 for a planned size of 5; P6 false at 5 and at 7 consumed with 95 successes', () => {
    expect(SPEC.gateThresholds.p2RobotsRefusalWindowCount).toBe(3);
    expect(SPEC.gateThresholds.p5LowRawYieldWindowCount).toBe(2);
    for (const consumed of [5, 7]) {
      expect(p6Fires({ reserveConsumedCount: consumed, successfulOrganisationCount: 95 })).toBe(
        false,
      );
    }
    expect(RECORD.gates.p6).toMatchObject({
      reserveConsumedBeforeAppend: 5,
      reserveConsumedAfterAppend: 7,
      firesBefore: false,
      firesAfter: false,
    });
  });

  it('P7 on the current 5-entry ledger: 16/18, only the two persistence-dependent invariants false, pause', () => {
    const p = preflightOf(CURRENT_TEXT);
    expect(falseInvariants(p)).toEqual(EXPECTED_WINDOW_06.currentLedgerFalseInvariants);
    expect(GENERATION2_P7_INVARIANT_NAMES.length - falseInvariants(p).length).toBe(16);
    expect(p.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(true);
    expect(gateOf(p, 5).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });

  it('P7 on the prospective 7-entry ledger: 18/18, gate continues to G2R:94:5', () => {
    const p = preflightOf(READINESS.prospectiveLedgerText);
    expect(falseInvariants(p)).toEqual([]);
    expect(p.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(true);
    const gate = gateOf(p, 7);
    expect(gate.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(gate.nextWorkItemId).toBe('G2R:94:5');
  });
});

// ---------------------------------------------------------------------------
// The committed record.
// ---------------------------------------------------------------------------

describe('Generation-2 Window 06 offline readiness: the committed record', () => {
  it('is exactly what the builder derives, and authorises nothing', async () => {
    const committed = readState(WINDOW06_READINESS_PATH);
    expect(await renderWindow06Readiness(INPUTS)).toBe(committed);
    const record = JSON.parse(committed) as Json;
    expect(record).toMatchObject({
      thisFileAuthorises: [],
      isLiveAuthority: false,
      networkUsed: false,
      databaseUsed: false,
      ledgerMutated: false,
      reserveAssigned: false,
      canonicalLedgerMutated: false,
      networkAuthorised: false,
      databaseAuthorised: false,
      ledgerMutationAuthorised: false,
      reserveAssignmentAuthorised: false,
      terminalState: WINDOW06_READINESS_TERMINAL_STATE,
      startingHead: WINDOW06_READINESS_STARTING_HEAD,
      generationId: 'METHODOLOGY_V3_GEN2',
      branch: 'feat/phase2b-2d-a2-batch-02',
    });
    expect(record.window06.order).toEqual(EXPECTED_WINDOW_06.workItemIds);
    expect(record.adjudicationHistory.order).toHaveLength(5);
    expect(record.adjudicationHistory.globalRunReferences).toMatchObject({
      count: 25,
      distinct: 25,
      globallyUnique: true,
    });
    expect(record.operationalPrerequisite).toMatchObject({
      isFrozenP7: false,
      holds: true,
      windowCount: 5,
    });
    expect(record.gates.p7.onCurrentCommittedLedger.trueCount).toBe(16);
    expect(record.gates.p7.onCurrentCommittedLedger.gateDecisionWithZeroCompleted).toBe(
      'PAUSE_P7_INVARIANT_MISMATCH',
    );
    expect(record.gates.p7.onProspectivePostAppendLedger.trueCount).toBe(18);
    expect(record.gates.anomalyWaiversAtWindowStart).toBe(0);
    expect(record.gates.window05MonitorDeviationsInherited).toBe(false);
    expect(record.window06.inheritedAnomalyWaivers).toEqual([]);
    expect(record.canonicalGeneration2Ledger).toMatchObject({
      entryCountStill: 5,
      ledgerHashStill: WINDOW06_CURRENT_LEDGER_REVISION.ledgerHash,
      nextGeneration2ReserveStill: 5,
      reserve5Assigned: false,
      reserve6Assigned: false,
      mutatedByThisTask: false,
    });
    expect(Object.values(record.sideEffects as Record<string, number>).every((n) => n === 0)).toBe(
      true,
    );
    expect(record.bound.window05.liveResultV1.adjudicatedBinding).toBe(false);
    expect(record.window04AuthorityShapeCorrection).toMatchObject({
      appliesToWindow05: false,
      appliesToWindow06: false,
      futureWindowFallback: false,
    });
    expect(record.nextOwnerDecision).toMatch(/G2R:94:5 -> G2R:96:6 -> G2P:97 -> G2P:98 -> G2P:99/);
    expect(record.nextOwnerDecision).toMatch(/Authority is NOT granted by this readiness record/);
    expect(record.negativeAttacks.historyAttacks).toEqual([...WINDOW06_HISTORY_ATTACKS]);
    expect(record.negativeAttacks.q1Attacks).toEqual([...WINDOW06_Q1_ATTACKS]);
    expect(record.negativeAttacks.windowAttacks).toEqual([...WINDOW06_WINDOW_ATTACKS]);
    // Public-safe: no identity beyond digests.
    const keys = [
      ...BASIS.draw.selection.flatMap((e) => [e.echeRowKey, e.organisationId]),
      ...[5, 6].flatMap((k) => [BASIS.schedule[k]!.echeRowKey, BASIS.schedule[k]!.organisationId]),
    ];
    for (const key of keys) expect(committed.includes(key)).toBe(false);
    expect(committed).not.toMatch(/https?:\/\/|"organisationId"|"echeRowKey"|rootAuthorities"/);
  });

  it('no Window-06 live authority, LIVE_RESULT, adjudication or append exists; the ledger is unchanged', () => {
    const names = namesState('docs/evaluation').filter((name) =>
      /GENERATION2_WINDOW_0[6-9]|GENERATION2_WINDOW_[1-9]\d/.test(name),
    );
    expect(names).toEqual(['PHASE_2B_2D_A2_GENERATION2_WINDOW_06_OFFLINE_READINESS_V1.json']);
    expect(CURRENT.entries.map((e) => [e.sequence, e.selectionIndex])).toEqual([
      [0, 75],
      [1, 76],
      [2, 78],
      [3, 82],
      [4, 83],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Negative attacks: every one refuses.
// ---------------------------------------------------------------------------

describe('negative attacks - history', () => {
  it('the attack lists recorded in the readiness are the lists proved here', () => {
    expect(WINDOW06_HISTORY_ATTACKS).toHaveLength(14);
    expect(WINDOW06_Q1_ATTACKS).toHaveLength(11);
    expect(WINDOW06_WINDOW_ATTACKS).toHaveLength(11);
  });

  it('missing Window 01', () => {
    expect(refusedWith({ windows: [W02, W03, W04, W05] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(integrityOf({ windows: [W02, W03, W04, W05] }).holds).toBe(false);
    const committed = new Map(COMMITTED);
    committed.delete(W01.authority.path);
    expect(refusal(() => fiveWindowHistoryForWindow06({ ...INPUTS, committed }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('missing Window 05: the stale four-window state plans no Q1 at all, and the readiness refuses', () => {
    const four = { windows: [W01, W02, W03, W04] };
    const stale = deriveGeneration2CurrentState(BASIS, CURRENT, four);
    expect(stale.successfulOrganisationCount).toBe(92);
    expect(stale.q1).toEqual([]);
    expect(planCompleteQ1(BASIS, CURRENT, four)).toEqual([]);
    const committed = new Map(COMMITTED);
    committed.delete(W05.adjudication.path);
    expect(refusal(() => buildWindow06Readiness({ ...INPUTS, committed }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
    const missingAt = new Map(W05_AT_COMMIT);
    missingAt.delete(W05.liveResult.path);
    expect(
      refusal(() => buildWindow06Readiness({ ...INPUTS, window05TextsAtCommit: missingAt })),
    ).toBe('HISTORY_BINDING_NOT_PINNED');
  });

  it('reordered history', () => {
    expect(refusedWith({ windows: [W01, W02, W03, W05, W04] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(refusedWith({ windows: [W05, W04, W03, W02, W01] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(integrityOf({ windows: [W02, W01, W03, W04, W05] }).holds).toBe(false);
  });

  it('duplicated window ordinal', () => {
    expect(refusedWith({ windows: [W01, W02, W03, W04, W04] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(refusedWith({ windows: [W01, W02, W03, W04, { ...W05, windowOrdinal: 4 }] })).toBe(
      'HISTORY_OUT_OF_ORDER',
    );
    expect(integrityOf({ windows: [W01, W02, W03, W04, W05, W05] }).holds).toBe(false);
  });

  it('edited historical authority', () => {
    const text = W05.authority.text.replace('"concurrency": 1', '"concurrency": 2');
    expect(text).not.toBe(W05.authority.text);
    expect(
      refusedWith({
        windows: [W01, W02, W03, W04, { ...W05, authority: { ...W05.authority, text } }],
      }),
    ).toBe('HISTORY_RECORD_NOT_PINNED');
    const edited = new Map(COMMITTED).set(W05.authority.path, `${W05.authority.text} `);
    expect(refusal(() => fiveWindowHistoryForWindow06({ ...INPUTS, committed: edited }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('edited LIVE_RESULT (re-sealed)', () => {
    const forged = tamperedW05({ live: (r) => void (item(2)(r).selectionIndex = 97) });
    expect(refusedWith(forged)).toBe('HISTORY_UNAUTHORISED_ITEM');
    expect(integrityOf(forged).holds).toBe(false);
    const edited = new Map(COMMITTED).set(W05.liveResult.path, `${W05.liveResult.text} `);
    expect(refusal(() => fiveWindowHistoryForWindow06({ ...INPUTS, committed: edited }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('edited adjudication (re-sealed): forged verdicts and summaries', () => {
    const verdict = tamperedW05({
      adjudication: (r) => {
        item(2)(r).adjudication = { verdict: 'ACQUISITION_SUCCESSFUL', q3Reason: null };
      },
    });
    expect(refusedWith(verdict)).toBe('HISTORY_SUMMARY_DISAGREES');
    const summary = tamperedW05({
      adjudication: (r) => void (r.generation2StateAfter.ACQUISITION_SUCCESSFUL = 96),
    });
    expect(refusedWith(summary)).toBe('HISTORY_SUMMARY_DISAGREES');
    const reason = tamperedW05({
      adjudication: (r) => void (item(4)(r).adjudication.q3Reason = 'NOT_A_FROZEN_REASON'),
    });
    expect(refusedWith(reason)).toBe('HISTORY_Q3_REASON_INVALID');
    const edited = new Map(COMMITTED).set(W05.adjudication.path, `${W05.adjudication.text} `);
    expect(refusal(() => fiveWindowHistoryForWindow06({ ...INPUTS, committed: edited }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('Window-05 LIVE_RESULT V1 substituted for V2', () => {
    const v1Text = readState(WINDOW06_W05_PINS.liveResultV1.path);
    const v1: CommittedRecordBinding = {
      path: WINDOW06_W05_PINS.liveResultV1.path,
      sha256: sha256(v1Text),
      text: v1Text,
    };
    // Bare substitution: V1 binds the wrong authority bytes, and the adjudication binds V2.
    expect(refusedWith({ windows: [W01, W02, W03, W04, { ...W05, liveResult: v1 }] })).toBe(
      'HISTORY_LIVE_RESULT_AUTHORITY',
    );
    // V1 written at V2's pinned path is refused by the pin before any replay.
    const committed = new Map(COMMITTED).set(WINDOW06_W05_PINS.liveResult.path, v1Text);
    expect(refusal(() => fiveWindowHistoryForWindow06({ ...INPUTS, committed }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
    // V1 bound with a re-sealed adjudication reference is STILL refused, by V1's own authority bytes.
    const adjudication = JSON.parse(W05.adjudication.text) as Json;
    adjudication.bound.liveResult = { ...adjudication.bound.liveResult, ...refOf(v1) };
    expect(
      refusedWith({
        windows: [
          W01,
          W02,
          W03,
          W04,
          { ...W05, liveResult: v1, adjudication: rebind(W05.adjudication, adjudication) },
        ],
      }),
    ).toBe('HISTORY_LIVE_RESULT_AUTHORITY');
    expect(W05.liveResult.text).not.toBe(v1Text);
  });

  /** Re-seals one Window-05 validation-chain record AND every reference to it. */
  function resealedChain(
    key: 'validationOwnerRuling' | 'validationReproof' | 'adjudication',
    mutate: (record: Json) => void,
  ) {
    const texts = new Map(COMMITTED);
    const pins = clone(WINDOW06_W05_PINS) as Json;
    const edit = (which: string, fn: (r: Json) => void): void => {
      const pin = pins[which] as Json;
      const record = JSON.parse(texts.get(pin.path)!) as Json;
      fn(record);
      const text = `${JSON.stringify(record, null, 2)}\n`;
      texts.set(pin.path, text);
      pin.sha256 = sha256(text);
      pin.bytes = bytesOf(text);
    };
    edit(key, mutate);
    if (key !== 'adjudication') {
      edit('validationReproof', (r) => {
        if (key === 'validationOwnerRuling') {
          r.boundOwnerRuling = {
            ...r.boundOwnerRuling,
            sha256: pins.validationOwnerRuling.sha256,
            bytes: pins.validationOwnerRuling.bytes,
          };
        }
      });
      edit('adjudication', (r) => {
        r.validation.boundRecords.ownerRuling = {
          ...r.validation.boundRecords.ownerRuling,
          sha256: pins.validationOwnerRuling.sha256,
          bytes: pins.validationOwnerRuling.bytes,
        };
        r.validation.boundRecords.reproofRecord = {
          ...r.validation.boundRecords.reproofRecord,
          sha256: pins.validationReproof.sha256,
          bytes: pins.validationReproof.bytes,
        };
      });
    }
    return { texts, pins: pins as unknown as typeof WINDOW06_W05_PINS };
  }

  it('Window-05 validation re-proof omitted or altered (re-sealed through the chain)', () => {
    const texts = new Map(COMMITTED);
    texts.delete(WINDOW06_W05_PINS.validationReproof.path);
    expect(refusal(() => verifyWindow05Validation(texts))).toBe('VALIDATION_CHAIN_NOT_PINNED');
    expect(
      refusal(() =>
        buildWindow06Readiness({
          ...INPUTS,
          committed: texts,
        }),
      ),
    ).toBe('VALIDATION_CHAIN_NOT_PINNED');
    for (const mutate of [
      (r: Json) => void (r.terminalVerdict = 'WINDOW_05_VALIDATION_EXCLUSIVITY_NOT_PROVED'),
      (r: Json) => void (r.reproof.exitCode = 1),
      (r: Json) => void (r.reproof.runs = 2),
      (r: Json) => void (r.reproof.secondAttempt = true),
      (r: Json) => void (r.furtherValidationAuthorised = true),
      (r: Json) => void (r.boundLiveResult.sha256 = 'a'.repeat(64)),
    ]) {
      const { texts: t, pins } = resealedChain('validationReproof', mutate);
      expect(refusal(() => verifyWindow05Validation(t, pins))).toBe(
        'WINDOW_05_VALIDATION_NOT_ACCEPTED',
      );
    }
    // The genuine, unaltered chain passes through the very same path.
    expect(refusal(() => verifyWindow05Validation(COMMITTED))).toBe('NO_REFUSAL');
  });

  it('first Window-05 validation incorrectly reclassified clean (re-sealed through the chain)', () => {
    const cases: [Parameters<typeof resealedChain>[0], (r: Json) => void][] = [
      ['validationOwnerRuling', (r) => void (r.originalValidation.reclassified = true)],
      [
        'validationOwnerRuling',
        (r) =>
          void (r.originalValidation.formalVerdict = 'VALIDATION_EXECUTION_EXCLUSIVITY_PROVED'),
      ],
      ['validationReproof', (r) => void (r.firstValidation.reclassified = true)],
      [
        'validationReproof',
        (r) =>
          void (r.firstValidation.formalVerdict =
            'WINDOW_05_VALIDATION_EXCLUSIVITY_REPROVED_CLEAN'),
      ],
      ['adjudication', (r) => void (r.validation.firstV2Validation.reclassified = true)],
      ['adjudication', (r) => void (r.validation.firstV2Validation.acceptedForAdjudication = true)],
      [
        'adjudication',
        (r) =>
          void (r.validation.firstV2Validation.formalVerdict =
            'VALIDATION_EXECUTION_EXCLUSIVITY_PROVED'),
      ],
    ];
    for (const [key, mutate] of cases) {
      const { texts, pins } = resealedChain(key, mutate);
      expect(refusal(() => verifyWindow05Validation(texts, pins))).toBe(
        'WINDOW_05_VALIDATION_NOT_ACCEPTED',
      );
    }
  });

  it('the Window-05 monitor-coverage deviations cannot be dropped or converted to a waiver', () => {
    for (const mutate of [
      (r: Json) => void (r.operationalDeviations.monitorCoverage.executionExclusivity = 'PROVED'),
      (r: Json) => void (r.operationalDeviations.monitorCoverage.notRewrittenAsClean = false),
      (r: Json) => void (r.operationalDeviations.monitorCoverage.evidenceInvalidated = true),
      (r: Json) => void (r.p5.inheritedWaivers = ['G2P:92']),
    ]) {
      const { texts, pins } = resealedChain('adjudication', mutate);
      expect(refusal(() => verifyWindow05Validation(texts, pins))).toBe(
        'WINDOW_05_VALIDATION_NOT_ACCEPTED',
      );
    }
  });

  it('Window-04 correction omitted', () => {
    const uncorrected = fiveWindowHistoryForWindow06(INPUTS, { withCorrection: false });
    expect(replay(uncorrected)).toBe('HISTORY_RECORD_SHAPE');
    expect(integrityOf(uncorrected).holds).toBe(false);
    expect(preflightOf(CURRENT_TEXT, SPEC, uncorrected).operationalPrerequisites).toMatchObject({
      adjudicationHistoryIntegrity: false,
    });
  });

  it('Window-04 correction attached to Window 05 or to prospective Window 06', () => {
    expect(
      replay({
        windows: [W01, W02, W03, W04, { ...W05, authorityShapeCorrection: CORRECTION }],
      }),
    ).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND');
    expect(RECORD.prospectiveWindow06AuthorityShape).toMatchObject({
      window04CorrectionAttachedRefusal: 'HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND',
      window04TypoPropagated: false,
    });
    // Re-labelled and re-bound for Window 05: still not an approved correction.
    const record = JSON.parse(W04.authorityShapeCorrection!.record.text) as Json;
    record.windowOrdinal = 5;
    record.authorityShapeCorrection.scope = 'EXACT_PINNED_WINDOW_05_AUTHORITY_ONLY';
    const forged = {
      ...W05,
      authorityShapeCorrection: {
        ...W04.authorityShapeCorrection!,
        record: sealRecord(W04.authorityShapeCorrection!.record.path, record),
      },
    };
    expect(replay({ windows: [W01, W02, W03, W04, forged] })).toBe(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_FOR_THIS_AUTHORITY',
    );
  });

  it('duplicate historical run reference (within a window, and across windows, re-sealed)', () => {
    const within = runRefsOf(W05)[0]!;
    expect(
      refusedWith(
        tamperedW05({
          live: (r) => void (item(1)(r).runRefSha256 = within),
          adjudication: (r) => void (item(1)(r).runRefSha256 = within),
        }),
      ),
    ).toBe('HISTORY_LIVE_RESULT_ITEMS');
    for (const [source, k] of [
      [W01, 0],
      [W04, 3],
    ] as const) {
      const reused = runRefsOf(source)[k]!;
      const forged = tamperedW05({
        live: (r) => void (item(3)(r).runRefSha256 = reused),
        adjudication: (r) => void (item(3)(r).runRefSha256 = reused),
      });
      expect(replay(forged)).toBe('NO_REFUSAL');
      const integrity = integrityOf(forged);
      expect(integrity.holds).toBe(false);
      expect(integrity.failures).toEqual([
        expect.stringMatching(
          new RegExp(
            `^REFUSED HISTORY_DUPLICATE_RUN_REFERENCE: .*window ${String(source.windowOrdinal)} reappears in window 5`,
          ),
        ),
      ]);
    }
  });

  it('wrong starting ledger revision', () => {
    expect(
      refusedWith({
        windows: [W01, W02, W03, W04, { ...W05, startingLedgerText: W03_START_TEXT }],
      }),
    ).toBe('HISTORY_LEDGER_NOT_A_PREFIX');
    expect(
      refusal(() => buildWindow06Readiness({ ...INPUTS, currentLedgerText: W03_START_TEXT })),
    ).toBe('CURRENT_LEDGER_NOT_CANONICAL');
    expect(
      refusal(() =>
        buildWindow06Readiness({ ...INPUTS, currentLedgerText: READINESS.prospectiveLedgerText }),
      ),
    ).toBe('CURRENT_LEDGER_NOT_CANONICAL');
    const p = preflightOf(READINESS.prospectiveLedgerText, SPEC, HISTORY, W03_START_TEXT);
    expect(p.invariants.startingLedgerRevisionMatchesPrecommit).toBe(false);
    const q = preflightOf(
      READINESS.prospectiveLedgerText,
      SPEC,
      HISTORY,
      READINESS.prospectiveLedgerText,
    );
    expect(q.invariants.startingLedgerRevisionMatchesPrecommit).toBe(false);
  });
});

describe('negative attacks - Q1 and the ledger', () => {
  it('Q1 [96, 94] instead of ascending [94, 96]', () => {
    expect(appendWith([A96, A94])).toBe('ASSIGNMENT_NOT_Q1');
    expect(
      appendWith([
        { ...A96, generation2ReserveRankPosition: 5 },
        { ...A94, generation2ReserveRankPosition: 6 },
      ]),
    ).toBe('ASSIGNMENT_NOT_Q1');
    expect(Q1.map((a) => a.selectionIndex)).toEqual([94, 96]);
  });

  it('slot 94 assigned reserve 6', () => {
    expect(appendWith([{ ...A94, generation2ReserveRankPosition: 6 }, A96])).toBe(
      'ASSIGNMENT_NOT_Q1',
    );
    expect(
      appendWith([
        { ...A94, generation2ReserveRankPosition: 6 },
        { ...A96, generation2ReserveRankPosition: 7 },
      ]),
    ).toBe('ASSIGNMENT_NOT_Q1');
  });

  it('slot 96 assigned reserve 5', () => {
    expect(appendWith([{ ...A96, generation2ReserveRankPosition: 5 }, A94])).toBe(
      'ASSIGNMENT_NOT_Q1',
    );
    expect(appendWith([A94, { ...A96, generation2ReserveRankPosition: 5 }])).toBe(
      'ASSIGNMENT_NOT_Q1',
    );
  });

  it('reserve 5 skipped / reserve 6 skipped', () => {
    expect(
      appendWith([
        { ...A94, generation2ReserveRankPosition: 6 },
        { ...A96, generation2ReserveRankPosition: 7 },
      ]),
    ).toBe('ASSIGNMENT_NOT_Q1');
    expect(appendWith([A94, { ...A96, generation2ReserveRankPosition: 7 }])).toBe(
      'ASSIGNMENT_NOT_Q1',
    );
    expect(appendWith(Q1)).toBe('NO_REFUSAL');
  });

  it('only one of the two Q1 obligations planned', () => {
    expect(appendWith([A94])).toBe('Q1_INCOMPLETE');
    expect(appendWith([A96])).toBe('Q1_INCOMPLETE');
    expect(appendWith([])).toBe('Q1_INCOMPLETE');
  });

  it('a fake third Q1 obligation', () => {
    const third = { selectionIndex: 97, generation2ReserveRankPosition: 7, reason: MIN_PAGES };
    expect(appendWith([A94, A96, third])).not.toBe('NO_REFUSAL');
    expect(
      appendWith([A94, { ...third, selectionIndex: 95, generation2ReserveRankPosition: 6 }, A96]),
    ).not.toBe('NO_REFUSAL');
    // A successful slot is never an obligation.
    expect(planCompleteQ1(BASIS, CURRENT, HISTORY).map((a) => a.selectionIndex)).not.toContain(95);
  });

  it('wrong replacement reason', () => {
    expect(appendWith([A94, { ...A96, reason: HOST }])).toBe('ASSIGNMENT_REASON_MISMATCH');
    expect(appendWith([{ ...A94, reason: HOST }, A96])).toBe('ASSIGNMENT_REASON_MISMATCH');
  });

  it('wrong replaced-occupant kind (a valid, re-chained ledger entry)', () => {
    const text = forgedProspective(
      (p) => void (p.replacedOccupantKind = 'GENERATION2_RESERVE_REPLACEMENT'),
    );
    const forged = parseOperationalGeneration2Ledger(JSON.parse(text), BASIS.genesis);
    expect(validateOperationalGeneration2Ledger(BASIS, forged).valid).toBe(false);
    expect(falseInvariants(preflightOf(text))).toContain('currentGeneration2LedgerExactAndValid');
  });

  it('non-null previousSequenceForSlot for 94 or 96 (a valid, re-chained ledger entry)', () => {
    for (const mutate of [
      (p: Json) => void (p.previousSequenceForSlot = 3),
      (p: Json) => void (p.previousSequenceForSlot = 0),
    ]) {
      const text = forgedProspective(mutate);
      const forged = parseOperationalGeneration2Ledger(JSON.parse(text), BASIS.genesis);
      expect(validateOperationalGeneration2Ledger(BASIS, forged).valid).toBe(false);
      expect(falseInvariants(preflightOf(text))).toContain('currentGeneration2LedgerExactAndValid');
    }
  });

  it('canonical ledger mutated during readiness: the readiness treats only the pinned 5-entry revision as canonical', () => {
    expect(RECORD.canonicalGeneration2Ledger.mutatedByThisTask).toBe(false);
    expect(
      refusal(() => buildWindow06Readiness({ ...INPUTS, currentLedgerText: `${CURRENT_TEXT} ` })),
    ).toBe('CURRENT_LEDGER_NOT_CANONICAL');
    // The builder returns a NEW prospective text and never rewrites the canonical one.
    expect(READINESS.prospectiveLedgerText).not.toBe(CURRENT_TEXT);
    expect(INPUTS.currentLedgerText).toBe(CURRENT_TEXT);
    expect(CURRENT.entries).toHaveLength(5);
    // The current committed ledger cannot start Window 06: it is not 18/18.
    expect(falseInvariants(preflightOf(CURRENT_TEXT)).length).toBe(2);
  });
});

describe('negative attacks - the window, the gates and the authority shape', () => {
  it('G2P:97 placed before a Q1 replacement', () => {
    for (const spec of [swapped(0, 2), swapped(1, 2), swapped(0, 4)]) {
      const p = preflightOf(READINESS.prospectiveLedgerText, spec);
      expect(p.invariants.workItemsMatchGovernance).toBe(false);
      expect(p.invariants.windowSpecHashValid).toBe(false);
    }
  });

  it('G2P:100 substituted for 97/98/99 (re-sealed, genuine digests)', () => {
    for (const position of [2, 3, 4]) {
      const p = preflightOf(READINESS.prospectiveLedgerText, substituted(position, 100));
      expect(p.invariants.executionEntryIdentitiesMatch).toBe(true);
      expect(p.invariants.workItemsMatchGovernance).toBe(false);
      expect(p.invariants.windowSpecHashValid).toBe(false);
    }
    // A skipped-ahead primary (G2P:98..100) is equally refused.
    expect(
      preflightOf(READINESS.prospectiveLedgerText, substituted(2, 100)).invariants
        .workItemsMatchGovernance,
    ).toBe(false);
  });

  it('work items reordered (re-sealed)', () => {
    for (const spec of [swapped(0, 1), swapped(3, 4), swapped(2, 3)]) {
      const p = preflightOf(READINESS.prospectiveLedgerText, spec);
      expect(p.invariants.workItemsMatchGovernance).toBe(false);
      expect(p.invariants.windowSpecHashValid).toBe(false);
    }
  });

  it('wrong split (re-sealed; and in a re-chained ledger entry)', () => {
    for (const position of [0, 2, 3]) {
      const spec = resealedSpec((s) => {
        const it = (s.workItems as Json[])[position]!;
        it.split = it.split === 'DEV_TRAIN' ? 'FINAL_HOLDOUT' : 'DEV_TRAIN';
      });
      const p = preflightOf(READINESS.prospectiveLedgerText, spec);
      expect(p.invariants.workItemsMatchGovernance).toBe(false);
      expect(p.invariants.windowSpecHashValid).toBe(false);
    }
    const text = forgedProspective((p) => void (p.split = 'DEV_TRAIN'));
    const forged = parseOperationalGeneration2Ledger(JSON.parse(text), BASIS.genesis);
    expect(validateOperationalGeneration2Ledger(BASIS, forged).valid).toBe(false);
  });

  it('wrong execution identity (re-sealed)', () => {
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [3, 4],
    ] as const) {
      const spec = resealedSpec(
        (s) => void (s.workItems[a].identityDigest = s.workItems[b].identityDigest),
      );
      expect(
        preflightOf(READINESS.prospectiveLedgerText, spec).invariants.executionEntryIdentitiesMatch,
      ).toBe(false);
    }
  });

  it('altered P2 / P5 thresholds (re-sealed)', () => {
    for (const mutate of [
      (s: Json) => void (s.gateThresholds.p2RobotsRefusalWindowCount = 4),
      (s: Json) => void (s.gateThresholds.p5LowRawYieldWindowCount = 3),
    ]) {
      expect(
        falseInvariants(preflightOf(READINESS.prospectiveLedgerText, resealedSpec(mutate))),
      ).toContain('windowSpecHashValid');
    }
  });

  it('altered P6 semantics', () => {
    expect(P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR).toBe(10);
    expect(P6_SUCCESS_FLOOR).toBe(50);
    expect(p6Fires({ reserveConsumedCount: 11, successfulOrganisationCount: 49 })).toBe(true);
    expect(p6Fires({ reserveConsumedCount: 10, successfulOrganisationCount: 49 })).toBe(false);
    expect(p6Fires({ reserveConsumedCount: 11, successfulOrganisationCount: 50 })).toBe(false);
    expect(RECORD.gates.p6.rule).toBe('reserveConsumed > 10 AND successfulOrganisationCount < 50');
  });

  it('frozen P7 changed', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(RECORD.gates.p7.invariants).toEqual([...GENERATION2_P7_INVARIANT_NAMES]);
    expect(GENERATION2_P7_INVARIANT_NAMES.join(' ')).not.toMatch(/history|adjudicat|runRef/i);
    const path =
      'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json';
    const edited = new Map(COMMITTED).set(path, `${COMMITTED.get(path)!} `);
    expect(assessCommittedInputs(edited).basis).toBeNull();
    expect(refusal(() => buildWindow06Readiness({ ...INPUTS, committed: edited }))).toBe(
      'BASIS_NOT_EXACT',
    );
  });

  it('prospective future authority using boundLedger', () => {
    const prospectiveWindow = synthesiseAdjudicatedWindow({
      basis: BASIS,
      priorHistory: HISTORY,
      startingLedgerText: CURRENT_TEXT,
      prospectiveLedgerText: READINESS.prospectiveLedgerText,
      spec: SPEC,
      verdicts: {},
      runRefSeed: 'test-window-06-future-bound-ledger',
    });
    const w06 = prospectiveWindow.history.windows[5]!;
    const authority = JSON.parse(w06.authority.text) as Json;
    expect(Object.hasOwn(authority, 'boundStartingLedger')).toBe(true);
    expect(Object.hasOwn(authority, 'boundLedger')).toBe(false);
    expect(authority.plannedLedgerAppend).toHaveLength(2);
    expect(replay(prospectiveWindow.history, prospectiveWindow.ledger)).toBe('NO_REFUSAL');
    authority.boundLedger = authority.boundStartingLedger;
    delete authority.boundStartingLedger;
    const aliased = {
      windows: [
        ...HISTORY.windows,
        { ...w06, authority: sealRecord(w06.authority.path, authority) },
      ],
    };
    expect(replay(aliased, prospectiveWindow.ledger)).toBe('HISTORY_RECORD_SHAPE');
    expect(integrityOf(aliased, prospectiveWindow.ledger).holds).toBe(false);
    expect(RECORD.prospectiveWindow06AuthorityShape).toMatchObject({
      canonicalFieldPresent: true,
      aliasFieldPresent: false,
      canonicalShapeReplays: true,
      aliasOnlyShapeRefusal: 'HISTORY_RECORD_SHAPE',
    });
  });

  it('Window-04 authority-shape correction used as a future fallback', () => {
    const prospectiveWindow = synthesiseAdjudicatedWindow({
      basis: BASIS,
      priorHistory: HISTORY,
      startingLedgerText: CURRENT_TEXT,
      prospectiveLedgerText: READINESS.prospectiveLedgerText,
      spec: SPEC,
      verdicts: {},
      runRefSeed: 'test-window-06-correction-fallback',
    });
    const w06 = prospectiveWindow.history.windows[5]!;
    // The correction, attached to a canonical Window 06: never consulted, never approved.
    expect(
      replay(
        {
          windows: [...HISTORY.windows, { ...w06, authorityShapeCorrection: CORRECTION }],
        },
        prospectiveWindow.ledger,
      ),
    ).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND');
    // A boundLedger-only Window 06 WITH that correction is refused as well: no alias is accepted.
    const authority = JSON.parse(w06.authority.text) as Json;
    authority.boundLedger = authority.boundStartingLedger;
    delete authority.boundStartingLedger;
    expect(
      replay(
        {
          windows: [
            ...HISTORY.windows,
            {
              ...w06,
              authority: sealRecord(w06.authority.path, authority),
              authorityShapeCorrection: CORRECTION,
            },
          ],
        },
        prospectiveWindow.ledger,
      ),
    ).not.toBe('NO_REFUSAL');
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS).toHaveLength(1);
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS[0]!.windowOrdinal).toBe(4);
  });

  it('the namespace reads no directory: no scan, no glob, no "latest"', () => {
    for (const name of [
      'window06Readiness.ts',
      'window06Contract.ts',
      'materialiseWindow06Readiness.ts',
    ]) {
      expect(readState(`src/test/harness/phase2b2d/generation2Window06/${name}`), name).not.toMatch(
        /readdirSync|readdir\(|\bglob\(|statSync|findLatest|latestWindow/,
      );
    }
  });
});

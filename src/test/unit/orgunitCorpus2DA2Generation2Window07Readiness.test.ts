/**
 * Phase 2B-2D A2 Generation 2: WINDOW-07 OFFLINE READINESS over the explicit
 * six-window history (Window 04 with its pinned authority-shape correction,
 * Window 05 through LIVE_RESULT V2, Window 06 through LIVE_RESULT V3 and its
 * owner-ruling and validation chain), built on the post-Window-06 hardening -
 * the proofs.
 *
 * TEMPORALLY SCOPED FROM DAY ONE. Every claim about the repository reads
 * committed bytes at this task's own terminal commit (the one that adds its
 * audit) once it exists, else the working tree; every historical record is
 * read at its own pinned commit. Nothing compares against the moving HEAD, so
 * a later, separately authorised Window-07 authority, ledger append, live
 * result or adjudication cannot turn these claims into a temporal defect.
 * Opens no socket and no database, writes no file, assigns no reserve and
 * never mutates the canonical Generation-2 ledger: every append, failure and
 * synthetic window here exists in memory.
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
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
  executionEntrySha256,
} from '../harness/phase2b2d/generation2Acquisition/executionBinding.js';
import { evaluateGeneration2WindowGate } from '../harness/phase2b2d/generation2Acquisition/gateAdapter.js';
import { prepareGeneration2ReplacementAppend } from '../harness/phase2b2d/generation2Acquisition/ledgerAppend.js';
import { COMMITTED_JSON_DIRECTORIES } from '../harness/phase2b2d/generation2Acquisition/materialiseReadiness.js';
import {
  FROZEN_P8_DEFINITION,
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
  validateGeneration2LiveResultForHistory,
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
import {
  renderWindow07Readiness,
  requireHardeningChain,
} from '../harness/phase2b2d/generation2Window07/materialiseWindow07Readiness.js';
import {
  EXPECTED_WINDOW_07,
  GENESIS_REVISION_COMMIT,
  WINDOW07_CANONICAL_LIVE_RESULTS,
  WINDOW07_CURRENT_LEDGER_REVISION,
  WINDOW07_HARDENING_PINS,
  WINDOW07_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  WINDOW07_READINESS_AUDIT_PATH,
  WINDOW07_READINESS_PATH,
  WINDOW07_READINESS_STARTING_HEAD,
  WINDOW07_READINESS_TERMINAL_STATE,
  WINDOW07_W02_PINS,
  WINDOW07_W02_VALIDATION_CHAIN,
  WINDOW07_W03_PINS,
  WINDOW07_W04_PINS,
  WINDOW07_W05_PINS,
  WINDOW07_W05_RECORD_PINS,
  WINDOW07_W06_PINS,
  WINDOW07_W06_RECORD_PINS,
  WINDOW07_W06_STARTING_LEDGER_REVISION,
} from '../harness/phase2b2d/generation2Window07/window07Contract.js';
import {
  WINDOW07_HISTORY_ATTACKS,
  WINDOW07_Q1_ATTACKS,
  WINDOW07_WINDOW_ATTACKS,
  buildWindow07Readiness,
  liveResultExpectationFor,
  sixWindowHistoryForWindow07,
  verifyHardening,
  verifyWindow06Closure,
  type Window07Inputs,
} from '../harness/phase2b2d/generation2Window07/window07Readiness.js';

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The commit that added this task's audit, or null while it is uncommitted. */
function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW07_READINESS_AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}
const TERMINAL = terminalCommit();
/** Bytes as this task left them: its terminal commit, else the working tree. Never HEAD. */
const readState = (path: string): string =>
  TERMINAL === null ? readFileSync(join(REPO, path), 'utf8') : git('show', `${TERMINAL}:${path}`);
const namesState = (dir: string): string[] =>
  TERMINAL === null
    ? readdirSync(join(REPO, dir))
    : git('ls-tree', '--name-only', `${TERMINAL}:${dir}`).split('\n').filter(Boolean);
/** The task's own range: the starting head to its terminal (or the working tree). */
const RANGE =
  TERMINAL === null
    ? [WINDOW07_READINESS_STARTING_HEAD]
    : [WINDOW07_READINESS_STARTING_HEAD, TERMINAL];

const at = (commit: string): string => git('show', `${commit}:${GENERATION2_LEDGER_PATH}`);
const GENESIS_TEXT = at(GENESIS_REVISION_COMMIT);
const STARTS = [
  GENESIS_TEXT,
  at(WINDOW07_W02_PINS.startingLedgerRevisionCommit),
  at(WINDOW07_W03_PINS.startingLedgerRevisionCommit),
  at(WINDOW07_W04_PINS.startingLedgerRevisionCommit),
] as const;
const FIVE_TEXT = at(WINDOW07_W06_STARTING_LEDGER_REVISION.appendCommit);
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
const atCommit = (pins: readonly { path: string; commit: string }[]) =>
  new Map(pins.map((pin) => [pin.path, git('show', `${pin.commit}:${pin.path}`)] as const));
const W06_AT_COMMIT = atCommit(WINDOW07_W06_RECORD_PINS);
const INPUTS: Window07Inputs = {
  committed: COMMITTED,
  currentLedgerText: CURRENT_TEXT,
  startingLedgerTexts: STARTS,
  fiveEntryLedgerText: FIVE_TEXT,
  window04AuthorityTextAtCommit: git(
    'show',
    `${WINDOW07_W04_PINS.authority.commit}:${WINDOW07_W04_PINS.authority.path}`,
  ),
  window05TextsAtCommit: atCommit(WINDOW07_W05_RECORD_PINS),
  window06TextsAtCommit: W06_AT_COMMIT,
  auditTexts: atCommit([
    WINDOW07_W02_VALIDATION_CHAIN.stopAudit,
    WINDOW07_W02_VALIDATION_CHAIN.closureAudit,
  ]),
};
const ASSESSMENT = assessCommittedInputs(COMMITTED);
const BASIS = ASSESSMENT.basis!;
const CURRENT = parseOperationalGeneration2Ledger(JSON.parse(CURRENT_TEXT), BASIS.genesis);
const HISTORY = sixWindowHistoryForWindow07(INPUTS);
const [W01, W02, W03, W04, W05, W06] = HISTORY.windows as [
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
];
const CORRECTION = W04.authorityShapeCorrection!;
const READINESS = buildWindow07Readiness(INPUTS);
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
const runRefsOf = (binding: Generation2WindowHistoryBinding): string[] =>
  (JSON.parse(binding.adjudication.text) as Json).items.map((i: Json) => i.runRefSha256 as string);
const REPLAYED = replayGeneration2History(BASIS, CURRENT, HISTORY);

/**
 * Tampers the Window-06 LIVE_RESULT and/or adjudication and RE-SEALS every
 * downstream reference, as an attacker controlling the pins would: the
 * semantic layer - not the hash pin - must be what refuses.
 */
function tamperedW06(mutate: {
  live?: (r: Json) => void;
  adjudication?: (r: Json) => void;
}): Generation2AdjudicationHistory {
  const liveJson = JSON.parse(W06.liveResult.text) as Json;
  mutate.live?.(liveJson);
  const liveResult = mutate.live ? sealRecord(W06.liveResult.path, liveJson) : W06.liveResult;
  const adjudicationJson = JSON.parse(W06.adjudication.text) as Json;
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
      W05,
      { ...W06, liveResult, adjudication: sealRecord(W06.adjudication.path, adjudicationJson) },
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
const gateOf = (p: Generation2Preflight, reserveConsumedCount: number, spec = SPEC) =>
  evaluateGeneration2WindowGate({
    spec,
    preflight: p,
    generation: { successfulOrganisationCount: 98, reserveConsumedCount },
    completed: [],
  });
/** A spec edited by an attacker and re-sealed with its recomputed hash. */
const resealedSpec = (mutate: (spec: Json) => void): Generation2WindowSpec => {
  const spec = clone(SPEC) as unknown as Json;
  mutate(spec);
  spec.windowSpecHash = recomputeWindowSpecHash(spec as unknown as Generation2WindowSpec);
  return spec as unknown as Generation2WindowSpec;
};
/** A genuine primary work item (real digest) for `selectionIndex`. */
const primaryItem = (selectionIndex: number, order: number): Json => {
  const binding = buildPrimaryExecutionBinding(BASIS.frameIndex, BASIS.draw, selectionIndex);
  return {
    ...clone(SPEC.workItems[2]!),
    order,
    workItemId: `G2P:${String(selectionIndex)}`,
    selectionIndex,
    split: binding.split,
    identityDigest: binding.drawEntrySha256,
    rootAuthorityCount: binding.rootAuthorityCount,
  };
};
const substituted = (position: number, selectionIndex: number): Generation2WindowSpec =>
  resealedSpec((s) => void (s.workItems[position] = primaryItem(selectionIndex, position + 1)));
const swapped = (a: number, b: number): Generation2WindowSpec =>
  resealedSpec((s) => {
    const items = s.workItems as Json[];
    [items[a], items[b]] = [items[b]!, items[a]!];
    items.forEach((it, k) => void (it.order = k + 1));
  });

const Q1 = planCompleteQ1(BASIS, CURRENT, HISTORY);
const [A96, A99] = Q1 as [(typeof Q1)[number], (typeof Q1)[number]];
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
      recordedAtUtc: WINDOW07_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      history,
    }),
  );

/**
 * A prospective ledger whose entry `sequence` (7 or 8) is edited and every
 * later entry RE-CHAINED, so only semantics - never the hash chain - can refuse it.
 */
function forgedProspective(sequence: 7 | 8, mutate: (payload: Json) => void): string {
  const entries: Json[] = [...PROSPECTIVE.entries];
  let previous = entries[sequence - 1]!.entryHash as string;
  for (let k = sequence; k < entries.length; k += 1) {
    const { entryHash: _dropped, ...payload } = {
      ...entries[k]!,
      previousEntryHash: previous,
    } as Json;
    void _dropped;
    if (k === sequence) mutate(payload);
    previous = computeEntryHash(payload as never);
    entries[k] = { ...payload, entryHash: previous };
  }
  return `${JSON.stringify(withEntries(BASIS.genesis, entries as never), null, 2)}\n`;
}

/** Re-seals one Window-06 closure record AND the adjudication reference to it. */
function resealedW06(
  key:
    | 'concurrencyDeviationOwnerRuling'
    | 'postFinalP5OwnerRuling'
    | 'validationFailureAndTemporalTestScopingOwnerRuling'
    | 'adjudication',
  mutate: (record: Json) => void,
) {
  const texts = new Map(COMMITTED);
  const pins = clone(WINDOW07_W06_PINS) as Json;
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
    edit('adjudication', (r) => {
      r.bound[key] = { ...r.bound[key], sha256: pins[key].sha256, bytes: pins[key].bytes };
    });
  }
  return { texts, pins: pins as unknown as typeof WINDOW07_W06_PINS };
}

// ---------------------------------------------------------------------------
// Canonical start, the hardening basis and the bindings.
// ---------------------------------------------------------------------------

describe('Generation-2 Window 07 offline readiness: canonical start and the hardening basis', () => {
  it('starts from the exact committed inputs, the hardening terminal and the 7-entry ledger', () => {
    expect(ASSESSMENT.failures).toEqual([]);
    expect(Object.values(ASSESSMENT.checks).every(Boolean)).toBe(true);
    expect(git('merge-base', '--is-ancestor', WINDOW07_READINESS_STARTING_HEAD, 'HEAD')).toBe('');
    expect(WINDOW07_READINESS_STARTING_HEAD).toBe(WINDOW07_HARDENING_PINS.record.commit);
    expect(sha256(CURRENT_TEXT)).toBe(WINDOW07_CURRENT_LEDGER_REVISION.fileSha256);
    expect(bytesOf(CURRENT_TEXT)).toBe(WINDOW07_CURRENT_LEDGER_REVISION.bytes);
    expect(CURRENT.ledgerHash).toBe(WINDOW07_CURRENT_LEDGER_REVISION.ledgerHash);
    expect(CURRENT.entries).toHaveLength(7);
    expect(CURRENT_TEXT).toBe(at(WINDOW07_CURRENT_LEDGER_REVISION.appendCommit));
    expect(CURRENT_TEXT).toBe(at(WINDOW07_READINESS_STARTING_HEAD));
    const last = CURRENT.entries[6]!;
    expect([last.sequence, last.selectionIndex, last.generation2ReserveRankPosition]).toEqual([
      6, 96, 6,
    ]);
    expect(last.entryHash).toBe(EXPECTED_WINDOW_07.canonicalEntry6EntryHash);
  });

  it('the hardening chain 47389c5 -> f21eeac -> 5881585 changes exactly its pinned files', () => {
    expect(refusal(() => requireHardeningChain(REPO))).toBe('NO_REFUSAL');
    const changed = (commit: string) =>
      git('diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', commit)
        .split('\n')
        .filter(Boolean)
        .sort();
    expect(changed(WINDOW07_HARDENING_PINS.codeCommit)).toEqual(
      [...WINDOW07_HARDENING_PINS.codeCommitChanges].sort(),
    );
    expect(changed(WINDOW07_HARDENING_PINS.record.commit)).toEqual([
      WINDOW07_HARDENING_PINS.record.path,
    ]);
    expect(git('rev-parse', `${WINDOW07_HARDENING_PINS.codeCommit}^`).trim()).toBe(
      WINDOW07_HARDENING_PINS.startingHead,
    );
    expect(git('rev-parse', `${WINDOW07_HARDENING_PINS.record.commit}^`).trim()).toBe(
      WINDOW07_HARDENING_PINS.codeCommit,
    );
  });

  it('the hardening record is pinned, authorises nothing, and is bound by the readiness', () => {
    const h = verifyHardening(COMMITTED);
    expect(h.record.thisFileAuthorises).toEqual([]);
    expect(h.record.isLiveAuthority).toBe(false);
    expect(h.record.terminalState).toBe(WINDOW07_HARDENING_PINS.terminalState);
    expect(h.record.sideEffects).toMatchObject({
      institutionNetworkRequests: 0,
      databaseConnections: 0,
      ledgerWrites: 0,
      reserveAssignments: 0,
      window07Authority: false,
      window07Execution: false,
      g2p100Execution: false,
    });
    expect(readState(WINDOW07_HARDENING_PINS.record.path)).toBe(
      git(
        'show',
        `${WINDOW07_HARDENING_PINS.record.commit}:${WINDOW07_HARDENING_PINS.record.path}`,
      ),
    );
    expect(RECORD.bound.postWindow06Hardening).toMatchObject({
      record: WINDOW07_HARDENING_PINS.record,
      codeCommit: WINDOW07_HARDENING_PINS.codeCommit,
      thisFileAuthorises: [],
      isLiveAuthority: false,
    });
  });

  it('A. binds Windows 01-06 by the exact committed bytes, in explicit order, V3 for Window 06', () => {
    expect(HISTORY.windows.map((w) => w.windowOrdinal)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(HISTORY.windows.map((w) => w.liveResult.path)).toEqual([
      ...WINDOW07_CANONICAL_LIVE_RESULTS,
    ]);
    for (const role of ['authority', 'liveResult', 'adjudication'] as const) {
      const pin = WINDOW07_W06_PINS[role];
      expect(W06[role].sha256).toBe(pin.sha256);
      expect(sha256(git('show', `${pin.commit}:${pin.path}`))).toBe(pin.sha256);
      expect(readState(pin.path)).toBe(W06[role].text);
    }
    expect(W05.liveResult.sha256).toBe(WINDOW07_W05_PINS.liveResult.sha256);
    expect(W06.startingLedgerText).toBe(FIVE_TEXT);
    expect(W06.authorityShapeCorrection).toBeUndefined();
    expect(HISTORY.windows.map((w) => w.authorityShapeCorrection !== undefined)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(RECORD.adjudicationHistory).toMatchObject({
      explicitOrderedBindingsOnly: true,
      directoryDiscovery: false,
      latestLookup: false,
    });
  });

  it('the Window-06 closure chain adds exactly its records, parent to child, and every record is immutable', () => {
    const chain = WINDOW07_W06_PINS.closureChain;
    chain.forEach(([commit, status, path], k) => {
      expect(git('diff-tree', '--no-commit-id', '--name-status', '-r', commit).trim()).toBe(
        `${status}\t${path}`,
      );
      if (k > 0) expect(git('rev-parse', `${commit}^`).trim()).toBe(chain[k - 1]![0]);
    });
    for (const pin of WINDOW07_W06_RECORD_PINS) {
      // Every Window-06 record was added by its pinned commit and never touched again up to this task's end.
      expect(
        git('log', '--format=%H', RANGE.at(-1)!, '--', pin.path).split('\n').filter(Boolean),
        pin.path,
      ).toEqual([pin.commit]);
      expect(readState(pin.path), pin.path).toBe(W06_AT_COMMIT.get(pin.path));
      expect(sha256(readState(pin.path)), pin.path).toBe(pin.sha256);
      expect(bytesOf(readState(pin.path)), pin.path).toBe(pin.bytes);
    }
  });

  it('the Window-06 closure: V1 -> V2 -> V3, four Window-06-only rulings, exit-1 first validation, one accepted re-proof', () => {
    const c = verifyWindow06Closure(COMMITTED);
    expect(c.liveResultProvenance).toMatchObject({
      canonicalAdjudicatedBinding: WINDOW07_W06_PINS.liveResult.path,
      immutableV1: WINDOW07_W06_PINS.liveResultV1.path,
      immutableV2: WINDOW07_W06_PINS.liveResultV2.path,
    });
    expect(c.rulings).toMatchObject({
      everyRulingScope: 'WINDOW_06_ONLY',
      transferredToWindow07: false,
    });
    expect(c.validation).toMatchObject({
      firstPostFinalP5Validation: {
        exitCode: 1,
        reclassified: false,
        acceptedForAdjudication: false,
      },
      ownerAuthorisedPostFixReproof: {
        runs: 1,
        exitCode: 0,
        headValidated: WINDOW07_W06_PINS.testCorrectionCommit,
        externalCompetingProcess: 0,
        ancestryUnproved: 0,
      },
      result: 'WINDOW_06_VALIDATION_ACCEPTED',
    });
    expect(c.concurrency).toMatchObject({
      item: 'G2P:98',
      inItemExecutionExclusivity: 'NOT_PROVED',
      inheritedByWindow07: false,
    });
    expect(c.p5).toMatchObject({ fired: true, waived: false, inheritedByWindow07: false });
  });
});

// ---------------------------------------------------------------------------
// Replay, the hardened contract, state, Q1 and the prospective append.
// ---------------------------------------------------------------------------

describe('Generation-2 Window 07 offline readiness: six-window replay and hardened contract', () => {
  it('B. history integrity holds over six windows with 30 globally unique run references', () => {
    const integrity = integrityOf(HISTORY);
    expect(integrity.failures).toEqual([]);
    expect(integrity.holds).toBe(true);
    expect(integrity.windowCount).toBe(6);
    expect(integrity.historicalRunReferences).toHaveLength(30);
    expect(new Set(integrity.historicalRunReferences).size).toBe(30);
    expect(integrity.rebuiltWindowSpecHashes).toEqual(EXPECTED_WINDOW_07.rebuiltWindowSpecHashes);
    expect(integrity.replay!.windows.map((w) => w.executed.length)).toEqual([5, 5, 5, 5, 5, 5]);
    expect(integrity.replay!.consumedLedgerEntryCount).toBe(7);
    expect(RECORD.adjudicationHistory.globalRunReferences).toMatchObject({
      count: 30,
      distinct: 30,
      globallyUnique: true,
    });
  });

  it('C. the hardened LIVE_RESULT contract passes all six canonical bindings', () => {
    HISTORY.windows.forEach((binding, k) => {
      const items = validateGeneration2LiveResultForHistory(
        binding.liveResult,
        liveResultExpectationFor(binding, REPLAYED.windows[k]!),
      );
      expect(items, binding.liveResult.path).toHaveLength(5);
      expect(items.map((i) => i.runRefSha256)).toEqual(
        REPLAYED.windows[k]!.executed.map((e) => e.runRefSha256),
      );
    });
    expect(RECORD.hardenedLiveResultContract.allSixPass).toBe(true);
    expect(
      (RECORD.hardenedLiveResultContract.canonicalBindings as Json[]).map((r) => [
        r.liveResult,
        r.result,
        r.runRefsEqualReplay,
      ]),
    ).toEqual(WINDOW07_CANONICAL_LIVE_RESULTS.map((path) => [path, 'PASS', true]));
    expect(RECORD.hardenedLiveResultContract.nonCanonicalStayRefused).toEqual({
      window05V1: 'HISTORY_LIVE_RESULT_AUTHORITY',
      window06V1: 'HISTORY_RECORD_SHAPE',
      window06V2: 'HISTORY_RECORD_SHAPE',
    });
  });

  it('Window 04 without its pinned correction still refuses; it is no fallback for 05, 06 or 07', () => {
    const uncorrected = sixWindowHistoryForWindow07(INPUTS, { withCorrection: false });
    expect(replay(uncorrected)).toBe('HISTORY_RECORD_SHAPE');
    expect(integrityOf(uncorrected).holds).toBe(false);
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS).toHaveLength(1);
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS[0]!.windowOrdinal).toBe(4);
  });

  it('D. derives 98 successful (18/40/40), failures [96, 99] HOST_UNREACHABLE, never-started 100..109', () => {
    const state = deriveGeneration2CurrentState(BASIS, CURRENT, HISTORY);
    expect(state.successfulOrganisationCount).toBe(98);
    expect(bySplitOf(BASIS, state.acquisitionSuccessful)).toEqual({
      DEV_TRAIN: 18,
      DEV_CONFIRM: 40,
      FINAL_HOLDOUT: 40,
    });
    expect(state.currentAcquisitionFailure).toEqual([96, 99]);
    expect(state.q1Reasons).toEqual([
      { selectionIndex: 96, reason: HOST },
      { selectionIndex: 99, reason: HOST },
    ]);
    expect(state.replacementAssignedAwaitingExecution).toEqual([]);
    expect(state.pendingCapabilityReview).toEqual([]);
    expect(state.neverStarted).toEqual(Array.from({ length: 10 }, (_, k) => 100 + k));
    expect(state.accounting).toBe(
      '98 successful + 2 failed + 0 assigned + 0 pending + 10 never started = 110',
    );
    expect(state.ledgerEntryCount).toBe(7);
    expect(state.nextGeneration2ReservePosition).toBe(7);
  });

  it('E. the complete Q1 is exactly [96 -> 7, 99 -> 8], both HOST_UNREACHABLE', () => {
    expect(Q1).toEqual([
      { selectionIndex: 96, generation2ReserveRankPosition: 7, reason: HOST },
      { selectionIndex: 99, generation2ReserveRankPosition: 8, reason: HOST },
    ]);
    expect(RECORD.q1.assignments).toEqual(Q1);
  });

  it('F. reserve 7 and reserve 8 identities, independently from the frozen schedule and frame', () => {
    const want = [
      {
        position: 7,
        frame: 157,
        echeRowKey: 'P VIANA-D01|998454563',
        organisationId: '2e8b7b5a-6308-4f78-9e68-96f36e82ecc9',
        rankHash: '067e1da9f79e88b8517682ac95e2d112c688da1dc6f08054b2f2b3cc8857de91',
        frameEntrySha256: '6f99f7d94e367331c4d34a2c04825b80f37147bf346e5d86828541a0c91479fa',
        scheduleEntrySha256: '9ac60f40b8054b9c956966d3db60f8afd232d3cddf8c2faa918972bf717df1ad',
      },
      {
        position: 8,
        frame: 158,
        echeRowKey: 'E LOGRONO16|956152281',
        organisationId: '99cabfa1-25e3-4a48-b06f-a96416e49c36',
        rankHash: '06846116baa24a32feba16030fcee82e2cc1b8d8878663c2385c4da72a42bfbb',
        frameEntrySha256: 'a9c3f774b8e22b50e50e687dc4f7448af8cf526a5fe509a4c402bd03664e1d4f',
        scheduleEntrySha256: 'c1c38b9aaca08e2e9b3a924a5d7f1ade9ba5b47cf03e10020a07cbfb2d995307',
      },
    ];
    for (const w of want) {
      const scheduled = BASIS.schedule[w.position]!;
      const ranked = BASIS.frameIndex.ranked[w.frame]!;
      const binding = buildReserveExecutionBinding(BASIS.frameIndex, BASIS.schedule, w.position);
      for (const source of [scheduled, ranked, binding]) {
        expect(source.echeRowKey).toBe(w.echeRowKey);
        expect(source.organisationId).toBe(w.organisationId);
        expect(source.rankHash).toBe(w.rankHash);
      }
      expect(binding.sourceFrameRankPosition).toBe(w.frame);
      expect(binding.frameEntrySha256).toBe(w.frameEntrySha256);
      expect(scheduled.frameEntrySha256).toBe(w.frameEntrySha256);
      expect(binding.scheduleEntrySha256).toBe(w.scheduleEntrySha256);
      expect(binding.rootAuthorities.map((a) => a.type)).toEqual(['WEBSITE_CLAIM']);
    }
  });

  it('G. slot 96 is a replacement of a replacement: occupant = sequence 6 / reserve 6, previousSequenceForSlot 6', () => {
    const occupant = resolveCrossGenerationOccupant(BASIS, CURRENT, 96);
    expect(occupant).toMatchObject({
      kind: 'GENERATION2_RESERVE_REPLACEMENT',
      split: 'DEV_CONFIRM',
      echeRowKey: 'D KONSTAN01|999866204',
      generation2ReserveRankPosition: 6,
      generation2LedgerSequence: 6,
      generation2EntryCountForSlot: 1,
    });
    expect(CURRENT.entries[6]!.replacementEcheRowKey).toBe(occupant.echeRowKey);
    expect(PROSPECTIVE.entries[7]).toMatchObject({
      sequence: 7,
      selectionIndex: 96,
      generation2ReserveRankPosition: 7,
      reason: HOST,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 6,
      replacedEcheRowKey: 'D KONSTAN01|999866204',
      replacementEcheRowKey: 'P VIANA-D01|998454563',
    });
  });

  it('H. slot 99 replaces its Generation-1 terminal occupant: previousSequenceForSlot null', () => {
    const occupant = resolveCrossGenerationOccupant(BASIS, CURRENT, 99);
    expect(occupant).toMatchObject({
      kind: 'GENERATION1_TERMINAL_OCCUPANT',
      split: 'FINAL_HOLDOUT',
      echeRowKey: 'E VIGO14|948992808',
      generation2LedgerSequence: null,
      generation2EntryCountForSlot: 0,
    });
    expect(BASIS.draw.selection[99]!.organisationId).toBe('51e68f66-343b-4314-8b46-2455559cae90');
    expect(PROSPECTIVE.entries[8]).toMatchObject({
      sequence: 8,
      selectionIndex: 99,
      generation2ReserveRankPosition: 8,
      reason: HOST,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
      replacedEcheRowKey: 'E VIGO14|948992808',
      replacementEcheRowKey: 'E LOGRONO16|956152281',
    });
  });

  it('I/J. the prospective append chains 6 -> 7 -> 8 and yields a valid 9-entry ledger', () => {
    const append = prepareGeneration2ReplacementAppend({
      basis: BASIS,
      ledger: CURRENT,
      assignments: Q1,
      recordedAtUtc: WINDOW07_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      history: HISTORY,
    });
    expect(append.appendedEntries.map((e) => e.previousEntryHash)).toEqual([
      EXPECTED_WINDOW_07.canonicalEntry6EntryHash,
      append.appendedEntries[0]!.entryHash,
    ]);
    for (const entry of append.appendedEntries) {
      const { entryHash, ...payload } = entry;
      expect(entryHash).toBe(computeEntryHash(payload));
      expect(entry.recordedAtUtc).toBe(WINDOW07_PROSPECTIVE_APPEND_RECORDED_AT_UTC);
    }
    expect(append.reserveConsumedBefore).toBe(7);
    expect(append.reserveConsumedAfter).toBe(9);
    expect(`${JSON.stringify(append.nextLedger, null, 2)}\n`).toBe(READINESS.prospectiveLedgerText);
    expect(validateOperationalGeneration2Ledger(BASIS, PROSPECTIVE).valid).toBe(true);
    expect(PROSPECTIVE.entries).toHaveLength(9);
    expect(PROSPECTIVE.entries.slice(0, 7)).toEqual(CURRENT.entries);
    expect(RECORD.prospectiveAppend).toMatchObject({
      inMemoryOnly: true,
      persisted: false,
      recordedAtUtcKind: 'READINESS_ONLY_ILLUSTRATIVE',
      nextLedgerHash: PROSPECTIVE.ledgerHash,
      canonicalSequence6EntryHash: EXPECTED_WINDOW_07.canonicalEntry6EntryHash,
    });
  });

  it('K. after the append: 98 / [] / assigned [96, 99] / 100..109, Q1 empty, 9 entries, next reserve 9', () => {
    const post = deriveGeneration2CurrentState(BASIS, PROSPECTIVE, HISTORY);
    expect(post.successfulOrganisationCount).toBe(98);
    expect(post.currentAcquisitionFailure).toEqual([]);
    expect(post.replacementAssignedAwaitingExecution).toEqual([96, 99]);
    expect(post.pendingCapabilityReview).toEqual([]);
    expect(post.neverStarted).toEqual(Array.from({ length: 10 }, (_, k) => 100 + k));
    expect(post.q1).toEqual([]);
    expect(post.ledgerEntryCount).toBe(9);
    expect(post.nextGeneration2ReservePosition).toBe(9);
    expect(post.accounting).toBe(
      '98 successful + 0 failed + 2 assigned + 0 pending + 10 never started = 110',
    );
  });
});

// ---------------------------------------------------------------------------
// The window and its gates.
// ---------------------------------------------------------------------------

describe('Generation-2 Window 07 offline readiness: the window', () => {
  it('L/M. is G2R:96:7, G2R:99:8, G2P:100, G2P:101, G2P:102 with composition 1 / 2 / 2', () => {
    expect(SPEC.workItems.map((i) => i.workItemId)).toEqual([
      'G2R:96:7',
      'G2R:99:8',
      'G2P:100',
      'G2P:101',
      'G2P:102',
    ]);
    expect(SPEC.workItems.map((i) => i.split)).toEqual([
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      'DEV_TRAIN',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
    ]);
    for (const it of SPEC.workItems) {
      expect(it.split, it.workItemId).toBe(BASIS.draw.selection[it.selectionIndex]!.split);
      expect(it.rootAuthorityCount, it.workItemId).toBe(1);
    }
    expect(SPEC.plannedWindowSize).toBe(5);
    expect(RECORD.window07.composition).toEqual({ DEV_TRAIN: 1, DEV_CONFIRM: 2, FINAL_HOLDOUT: 2 });
  });

  it('the three primaries are the exact frozen draw entries, one WEBSITE_CLAIM root each', () => {
    const want: [number, string, string, string][] = [
      [100, 'F ARRAS16|893931922', '1b63a994-a445-46dc-a50b-2bf841e355be', 'DEV_TRAIN'],
      [101, 'HU BUDAPES26|944411692', '3439f9b3-8259-4884-b6e3-f0af20ffdb37', 'DEV_CONFIRM'],
      [102, 'F RENNES67|948093909', '2329a212-5e65-4848-a071-99b083bdfab4', 'FINAL_HOLDOUT'],
    ];
    for (const [index, echeRowKey, organisationId, split] of want) {
      const slot = BASIS.draw.selection[index]!;
      const binding = buildPrimaryExecutionBinding(BASIS.frameIndex, BASIS.draw, index);
      expect(slot).toMatchObject({ selectionIndex: index, echeRowKey, organisationId, split });
      expect(binding).toMatchObject({ selectionIndex: index, echeRowKey, organisationId, split });
      expect(binding.rootAuthorityCount).toBe(1);
      expect(binding.rootAuthorities.map((a) => a.type)).toEqual(['WEBSITE_CLAIM']);
    }
  });

  it('N. every execution identity is deterministic and re-binds to the frozen schedule / draw and frame', () => {
    const rebuilt = SPEC.workItems.map((i) =>
      i.kind === 'REPLACEMENT'
        ? executionEntrySha256(
            buildReserveExecutionBinding(
              BASIS.frameIndex,
              BASIS.schedule,
              i.generation2ReserveRankPosition!,
            ),
          )
        : buildPrimaryExecutionBinding(BASIS.frameIndex, BASIS.draw, i.selectionIndex)
            .drawEntrySha256,
    );
    expect(rebuilt).toEqual(SPEC.workItems.map((i) => i.identityDigest));
    for (const digest of rebuilt) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    const bindings = RECORD.window07.executionBindings as Json[];
    expect(bindings.map((b) => b.identityDigest)).toEqual(rebuilt);
    for (const b of bindings) {
      expect(b.equalsSpecIdentityDigest, b.workItemId).toBe(true);
      expect(b.rootAuthorityTypes).toEqual(['WEBSITE_CLAIM']);
      if (b.kind === 'REPLACEMENT') {
        expect(b.identityEqualsScheduleAndFrame).toBe(true);
        expect(b.frameEntrySha256RecomputedAndEqual).toBe(true);
      } else {
        expect(b.identityEqualsDrawAndFrame && b.splitExact && b.selectionIndexExact).toBe(true);
      }
    }
  });

  it('O. the spec hash is deterministic: recomputes, and an independent rebuild is byte-identical', () => {
    expect(recomputeWindowSpecHash(SPEC)).toBe(SPEC.windowSpecHash);
    const again = buildWindow07Readiness(INPUTS);
    expect(canonicalStringify(again.spec)).toBe(canonicalStringify(SPEC));
    expect(again.spec.windowSpecHash).toBe(SPEC.windowSpecHash);
    expect(again.prospectiveLedgerText).toBe(READINESS.prospectiveLedgerText);
    expect(RECORD.window07.independentRebuild).toEqual({
      rebuiltWindowSpecHash: SPEC.windowSpecHash,
      canonicalBytesEqual: true,
      recomputedHashEqual: true,
      executionIdentitiesRebuiltAndEqual: true,
    });
    expect(RECORD.window07.windowSpecHash).toBe(SPEC.windowSpecHash);
  });

  it('P/Q/R. P2 = 3 (blocked + unreadable), P5 = 2, P6 false at 7 and at 9 consumed with 98 successes', () => {
    expect(SPEC.gateThresholds.p2RobotsRefusalWindowCount).toBe(3);
    expect(SPEC.gateThresholds.p5LowRawYieldWindowCount).toBe(2);
    expect(RECORD.gates.p2.counts).toEqual(['ROBOTS_BLOCKED_ROOT', 'ROBOTS_UNREADABLE_ROOT']);
    expect(RECORD.gates.p5.window06PostFinalP5RulingInherited).toBe(false);
    for (const consumed of [7, 9]) {
      expect(p6Fires({ reserveConsumedCount: consumed, successfulOrganisationCount: 98 })).toBe(
        false,
      );
    }
    expect(RECORD.gates.p6).toMatchObject({
      reserveConsumedBeforeAppend: 7,
      reserveConsumedAfterAppend: 9,
      firesBefore: false,
      firesAfter: false,
    });
  });

  it('S. P7 on the current 7-entry ledger: 16/18, only the two persistence-dependent invariants false, pause', () => {
    const p = preflightOf(CURRENT_TEXT);
    expect(falseInvariants(p)).toEqual([
      'plannedReplacementAppendRecorded',
      'postAppendOccupantsMatchAssignedReserves',
    ]);
    expect(GENERATION2_P7_INVARIANT_NAMES.length - falseInvariants(p).length).toBe(16);
    expect(p.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(true);
    expect(gateOf(p, 7).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });

  it('T. P7 on the prospective 9-entry ledger: 18/18, gate continues to G2R:96:7', () => {
    const p = preflightOf(READINESS.prospectiveLedgerText);
    expect(falseInvariants(p)).toEqual([]);
    expect(p.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(true);
    const gate = gateOf(p, 9);
    expect(gate.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(gate.nextWorkItemId).toBe('G2R:96:7');
  });

  it('U. P8 is unchanged: host sleep/wake or a pacing-clock gap only; concurrency stays separate', () => {
    expect(RECORD.gates.p8).toEqual(FROZEN_P8_DEFINITION);
    expect(FROZEN_P8_DEFINITION.meaning).toBe(
      'host sleep/wake, or a wall-clock gap inconsistent with the pacing clock',
    );
    expect(RECORD.gates).toMatchObject({
      p8Unchanged: true,
      concurrencyIsSeparateFromP8: true,
      priorWindowConcurrencyRulingInherited: false,
      anomalyWaiversAtWindowStart: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// The committed record and the task's zero side effects (scoped to TERMINAL).
// ---------------------------------------------------------------------------

describe('Generation-2 Window 07 offline readiness: the committed record', () => {
  it('V. is exactly what the builder derives, and authorises nothing', async () => {
    const committed = readState(WINDOW07_READINESS_PATH);
    expect(await renderWindow07Readiness(INPUTS)).toBe(committed);
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
      terminalState: WINDOW07_READINESS_TERMINAL_STATE,
      startingHead: WINDOW07_READINESS_STARTING_HEAD,
      generationId: 'METHODOLOGY_V3_GEN2',
      branch: 'feat/phase2b-2d-a2-batch-02',
    });
    expect(Object.values(record.sideEffects as Record<string, number>).every((n) => n === 0)).toBe(
      true,
    );
    expect(record.nextOwnerDecision).toMatch(
      /G2R:96:7 -> G2R:99:8 -> G2P:100 -> G2P:101 -> G2P:102/,
    );
    expect(record.nextOwnerDecision).toMatch(/Authority is NOT granted by this readiness record/);
    expect(record.negativeAttacks.historyAttacks).toEqual([...WINDOW07_HISTORY_ATTACKS]);
    expect(record.negativeAttacks.q1Attacks).toEqual([...WINDOW07_Q1_ATTACKS]);
    expect(record.negativeAttacks.windowAttacks).toEqual([...WINDOW07_WINDOW_ATTACKS]);
    // Public-safe: no identity beyond digests.
    const keys = [
      ...BASIS.draw.selection.flatMap((e) => [e.echeRowKey, e.organisationId]),
      ...[6, 7, 8].flatMap((k) => [
        BASIS.schedule[k]!.echeRowKey,
        BASIS.schedule[k]!.organisationId,
      ]),
    ];
    for (const key of keys) expect(committed.includes(key)).toBe(false);
    expect(committed).not.toMatch(/https?:\/\/|"organisationId"|"echeRowKey"|rootAuthorities"/);
  });

  it('W. no Generation-2 Window-07 authority, LIVE_RESULT or adjudication exists at this task terminal', () => {
    const names = namesState('docs/evaluation').filter((name) =>
      /GENERATION2_WINDOW_0[7-9]|GENERATION2_WINDOW_[1-9]\d/.test(name),
    );
    expect(names).toEqual(['PHASE_2B_2D_A2_GENERATION2_WINDOW_07_OFFLINE_READINESS_V1.json']);
  });

  it('X. the canonical ledger is untouched over this task: still 7 entries, reserve 7 unassigned', () => {
    expect(git('diff', '--name-only', ...RANGE, '--', GENERATION2_LEDGER_PATH).trim()).toBe('');
    expect(CURRENT.entries.map((e) => [e.sequence, e.selectionIndex])).toEqual([
      [0, 75],
      [1, 76],
      [2, 78],
      [3, 82],
      [4, 83],
      [5, 94],
      [6, 96],
    ]);
    expect(CURRENT.entries.some((e) => e.generation2ReserveRankPosition >= 7)).toBe(false);
    expect(RECORD.canonicalGeneration2Ledger).toMatchObject({
      entryCountStill: 7,
      ledgerHashStill: WINDOW07_CURRENT_LEDGER_REVISION.ledgerHash,
      nextGeneration2ReserveStill: 7,
      reserve7Assigned: false,
      reserve8Assigned: false,
      mutatedByThisTask: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Negative attacks: every one refuses.
// ---------------------------------------------------------------------------

describe('negative attacks - history and the hardened contract', () => {
  it('the attack lists recorded in the readiness are the lists proved here', () => {
    expect(WINDOW07_HISTORY_ATTACKS).toHaveLength(16);
    expect(WINDOW07_Q1_ATTACKS).toHaveLength(10);
    expect(WINDOW07_WINDOW_ATTACKS).toHaveLength(12);
  });

  it('missing Window 01 / missing Window 06', () => {
    expect(refusedWith({ windows: [W02, W03, W04, W05, W06] })).toBe('HISTORY_OUT_OF_ORDER');
    // Without Window 06 the seven-entry ledger's tail reads as merely assigned: a stale state with NO Q1.
    const five = { windows: [W01, W02, W03, W04, W05] };
    const stale = deriveGeneration2CurrentState(BASIS, CURRENT, five);
    expect(stale.successfulOrganisationCount).toBe(95);
    expect(stale.replacementAssignedAwaitingExecution).toEqual([94, 96]);
    expect(stale.q1).toEqual([]);
    expect(planCompleteQ1(BASIS, CURRENT, five)).toEqual([]);
    const committed = new Map(COMMITTED);
    committed.delete(W06.adjudication.path);
    expect(refusal(() => buildWindow07Readiness({ ...INPUTS, committed }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
    const missingAt = new Map(W06_AT_COMMIT);
    missingAt.delete(W06.liveResult.path);
    expect(
      refusal(() => buildWindow07Readiness({ ...INPUTS, window06TextsAtCommit: missingAt })),
    ).toBe('HISTORY_BINDING_NOT_PINNED');
  });

  it('reordered history / duplicated window ordinal', () => {
    expect(refusedWith({ windows: [W01, W02, W03, W04, W06, W05] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(refusedWith({ windows: [W01, W02, W03, W04, W05, W05] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(refusedWith({ windows: [W01, W02, W03, W04, W05, { ...W06, windowOrdinal: 5 }] })).toBe(
      'HISTORY_OUT_OF_ORDER',
    );
  });

  it('edited historical authority', () => {
    const text = `${W06.authority.text} `;
    expect(
      refusedWith({
        windows: [W01, W02, W03, W04, W05, { ...W06, authority: { ...W06.authority, text } }],
      }),
    ).toBe('HISTORY_RECORD_NOT_PINNED');
    const edited = new Map(COMMITTED).set(W06.authority.path, text);
    expect(refusal(() => sixWindowHistoryForWindow07({ ...INPUTS, committed: edited }))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('edited Window-06 LIVE_RESULT and adjudication (re-sealed)', () => {
    expect(refusedWith(tamperedW06({ live: (r) => void (item(2)(r).selectionIndex = 100) }))).toBe(
      'HISTORY_UNAUTHORISED_ITEM',
    );
    expect(
      refusedWith(
        tamperedW06({
          adjudication: (r) =>
            void (item(4)(r).adjudication = { verdict: 'ACQUISITION_SUCCESSFUL', q3Reason: null }),
        }),
      ),
    ).toBe('HISTORY_SUMMARY_DISAGREES');
    expect(
      refusedWith(
        tamperedW06({
          adjudication: (r) => void (r.generation2StateAfter.ACQUISITION_SUCCESSFUL = 99),
        }),
      ),
    ).toBe('HISTORY_SUMMARY_DISAGREES');
  });

  it('Window-06 LIVE_RESULT V1 or V2 substituted for V3', () => {
    for (const pin of [WINDOW07_W06_PINS.liveResultV1, WINDOW07_W06_PINS.liveResultV2]) {
      const text = readState(pin.path);
      const binding: CommittedRecordBinding = { path: pin.path, sha256: sha256(text), text };
      expect(replay({ windows: [W01, W02, W03, W04, W05, { ...W06, liveResult: binding }] })).toBe(
        'HISTORY_RECORD_SHAPE',
      );
      const committed = new Map(COMMITTED).set(WINDOW07_W06_PINS.liveResult.path, text);
      expect(refusal(() => sixWindowHistoryForWindow07({ ...INPUTS, committed }))).toBe(
        'HISTORY_BINDING_NOT_PINNED',
      );
    }
  });

  it('malformed historical LIVE_RESULT is refused through the hardened contract', () => {
    const cases: [(r: Json) => void, string][] = [
      [(r) => delete r.stops.itemsNotStarted, 'HISTORY_RECORD_SHAPE'],
      [(r) => delete r.boundAuthority.bytes, 'HISTORY_LIVE_RESULT_AUTHORITY'],
      [(r) => (r.liveInvocations.retries = 1), 'HISTORY_LIVE_RESULT_ITEMS'],
      [(r) => (r.items[0].runRefSha256 = 'abc123'), 'HISTORY_LIVE_RESULT_ITEMS'],
    ];
    for (const [mutate, code] of cases) {
      const record = JSON.parse(W06.liveResult.text) as Json;
      mutate(record);
      const forged = sealRecord(W06.liveResult.path, record);
      expect(
        refusal(() =>
          validateGeneration2LiveResultForHistory(
            forged,
            liveResultExpectationFor(W06, REPLAYED.windows[5]!),
          ),
        ),
      ).toBe(code);
      expect(replay({ windows: [W01, W02, W03, W04, W05, { ...W06, liveResult: forged }] })).toBe(
        code,
      );
    }
  });

  it('Window-06 validation chain altered (re-sealed through the chain)', () => {
    const cases: [Parameters<typeof resealedW06>[0], (r: Json) => void][] = [
      ['adjudication', (r) => void (r.validation.firstPostFinalP5Validation.reclassified = true)],
      ['adjudication', (r) => void (r.validation.firstPostFinalP5Validation.exitCode = 0)],
      [
        'adjudication',
        (r) => void (r.validation.firstPostFinalP5Validation.acceptedForAdjudication = true),
      ],
      ['adjudication', (r) => void (r.validation.ownerAuthorisedPostFixReproof.runs = 2)],
      ['adjudication', (r) => void (r.validation.ownerAuthorisedPostFixReproof.exitCode = 1)],
      [
        'adjudication',
        (r) => void (r.validation.ownerAuthorisedPostFixReproof.EXTERNAL_COMPETING_PROCESS = 1),
      ],
      ['adjudication', (r) => void (r.validation.fullValidationRunsAfterThisRecord = 1)],
      ['adjudication', (r) => void (r.bound.liveResult.path = WINDOW07_W06_PINS.liveResultV2.path)],
      [
        'validationFailureAndTemporalTestScopingOwnerRuling',
        (r) => void r.ownerDecisions.splice(3, 1),
      ],
    ];
    for (const [key, mutate] of cases) {
      const { texts, pins } = resealedW06(key, mutate);
      expect(refusal(() => verifyWindow06Closure(texts, pins))).toBe(
        'WINDOW_06_CLOSURE_NOT_ACCEPTED',
      );
    }
    const texts = new Map(COMMITTED);
    texts.delete(WINDOW07_W06_PINS.postFinalP5OwnerRuling.path);
    expect(refusal(() => verifyWindow06Closure(texts))).toBe('VALIDATION_CHAIN_NOT_PINNED');
    expect(refusal(() => buildWindow07Readiness({ ...INPUTS, committed: texts }))).toBe(
      'VALIDATION_CHAIN_NOT_PINNED',
    );
    expect(refusal(() => verifyWindow06Closure(COMMITTED))).toBe('NO_REFUSAL');
  });

  it('Window-06 rulings cannot be converted into a Window-07 waiver', () => {
    const cases: [Parameters<typeof resealedW06>[0], (r: Json) => void][] = [
      ['concurrencyDeviationOwnerRuling', (r) => void (r.scope = 'WINDOW_06_AND_LATER')],
      ['postFinalP5OwnerRuling', (r) => void (r.scope = 'ALL_LATER_WINDOWS')],
      ['adjudication', (r) => void (r.p5.waived = true)],
      ['adjudication', (r) => void (r.p5.inheritedWaivers = ['G2P:99'])],
      ['adjudication', (r) => void (r.operationalDeviations.concurrency.scope = 'GENERATION2')],
      [
        'adjudication',
        (r) => void (r.operationalDeviations.concurrency.evidenceInvalidated = true),
      ],
      [
        'adjudication',
        (r) => void (r.operationalDeviations.concurrency.inItemExecutionExclusivity = 'PROVED'),
      ],
    ];
    for (const [key, mutate] of cases) {
      const { texts, pins } = resealedW06(key, mutate);
      expect(refusal(() => verifyWindow06Closure(texts, pins))).toBe(
        'WINDOW_06_CLOSURE_NOT_ACCEPTED',
      );
    }
    expect(RECORD.window07.inheritedAnomalyWaivers).toEqual([]);
  });

  it('Window-04 correction omitted / attached to Window 06', () => {
    const uncorrected = sixWindowHistoryForWindow07(INPUTS, { withCorrection: false });
    expect(replay(uncorrected)).toBe('HISTORY_RECORD_SHAPE');
    expect(preflightOf(CURRENT_TEXT, SPEC, uncorrected).operationalPrerequisites).toMatchObject({
      adjudicationHistoryIntegrity: false,
    });
    expect(
      replay({
        windows: [W01, W02, W03, W04, W05, { ...W06, authorityShapeCorrection: CORRECTION }],
      }),
    ).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND');
  });

  it('duplicate historical run reference (within Window 06, and across windows, re-sealed)', () => {
    const within = runRefsOf(W06)[0]!;
    expect(
      refusedWith(
        tamperedW06({
          live: (r) => void (item(1)(r).runRefSha256 = within),
          adjudication: (r) => void (item(1)(r).runRefSha256 = within),
        }),
      ),
    ).toBe('HISTORY_LIVE_RESULT_ITEMS');
    for (const [source, k] of [
      [W01, 0],
      [W05, 3],
    ] as const) {
      const reused = runRefsOf(source)[k]!;
      const forged = tamperedW06({
        live: (r) => void (item(3)(r).runRefSha256 = reused),
        adjudication: (r) => void (item(3)(r).runRefSha256 = reused),
      });
      expect(replay(forged)).toBe('NO_REFUSAL');
      const integrity = integrityOf(forged);
      expect(integrity.holds).toBe(false);
      expect(integrity.failures).toEqual([
        expect.stringMatching(
          new RegExp(
            `^REFUSED HISTORY_DUPLICATE_RUN_REFERENCE: .*window ${String(source.windowOrdinal)} reappears in window 6`,
          ),
        ),
      ]);
    }
  });

  it('wrong starting ledger revision', () => {
    expect(
      refusedWith({
        windows: [W01, W02, W03, W04, W05, { ...W06, startingLedgerText: STARTS[2] }],
      }),
    ).toBe('HISTORY_LEDGER_NOT_A_PREFIX');
    expect(refusal(() => buildWindow07Readiness({ ...INPUTS, currentLedgerText: FIVE_TEXT }))).toBe(
      'CURRENT_LEDGER_NOT_CANONICAL',
    );
    expect(
      refusal(() => buildWindow07Readiness({ ...INPUTS, fiveEntryLedgerText: CURRENT_TEXT })),
    ).toBe('HISTORY_BINDING_NOT_PINNED');
    const p = preflightOf(READINESS.prospectiveLedgerText, SPEC, HISTORY, FIVE_TEXT);
    expect(p.invariants.startingLedgerRevisionMatchesPrecommit).toBe(false);
  });

  it('hardening record altered or missing', () => {
    const path = WINDOW07_HARDENING_PINS.record.path;
    const missing = new Map(COMMITTED);
    missing.delete(path);
    expect(refusal(() => buildWindow07Readiness({ ...INPUTS, committed: missing }))).toBe(
      'HARDENING_NOT_PINNED',
    );
    const edited = new Map(COMMITTED).set(path, `${COMMITTED.get(path)!} `);
    expect(refusal(() => verifyHardening(edited))).toBe('HARDENING_NOT_PINNED');
    for (const mutate of [
      (r: Json) => void (r.thisFileAuthorises = ['Window 07']),
      (r: Json) => void (r.isLiveAuthority = true),
      (r: Json) => void (r.sideEffects.window07Authority = true),
      (r: Json) => void (r.canonicalLiveResultPositiveChecks.results[5].result = 'FAIL'),
      (r: Json) => void (r.terminalState = 'SOMETHING_ELSE'),
    ]) {
      const record = JSON.parse(COMMITTED.get(path)!) as Json;
      mutate(record);
      const text = `${JSON.stringify(record, null, 2)}\n`;
      const pins = {
        ...WINDOW07_HARDENING_PINS,
        record: { ...WINDOW07_HARDENING_PINS.record, sha256: sha256(text), bytes: bytesOf(text) },
      } as unknown as typeof WINDOW07_HARDENING_PINS;
      expect(refusal(() => verifyHardening(new Map(COMMITTED).set(path, text), pins))).toBe(
        'HARDENING_NOT_ACCEPTED',
      );
    }
  });
});

describe('negative attacks - Q1 and the ledger', () => {
  it('incomplete Q1 (one obligation only, or none)', () => {
    expect(appendWith([A96])).toBe('Q1_INCOMPLETE');
    expect(appendWith([A99])).toBe('Q1_INCOMPLETE');
    expect(appendWith([])).toBe('Q1_INCOMPLETE');
  });

  it('reversed Q1 [99, 96]', () => {
    expect(appendWith([A99, A96])).toBe('ASSIGNMENT_NOT_Q1');
    expect(
      appendWith([
        { ...A99, generation2ReserveRankPosition: 7 },
        { ...A96, generation2ReserveRankPosition: 8 },
      ]),
    ).toBe('ASSIGNMENT_NOT_Q1');
  });

  it('skipped reserve / reserve reused', () => {
    expect(
      appendWith([
        { ...A96, generation2ReserveRankPosition: 8 },
        { ...A99, generation2ReserveRankPosition: 9 },
      ]),
    ).toBe('ASSIGNMENT_NOT_Q1');
    expect(appendWith([A96, { ...A99, generation2ReserveRankPosition: 9 }])).toBe(
      'ASSIGNMENT_NOT_Q1',
    );
    expect(appendWith([A96, { ...A99, generation2ReserveRankPosition: 7 }])).toBe(
      'ASSIGNMENT_NOT_Q1',
    );
    expect(appendWith([{ ...A96, generation2ReserveRankPosition: 6 }, A99])).toBe(
      'ASSIGNMENT_NOT_Q1',
    );
    expect(appendWith(Q1)).toBe('NO_REFUSAL');
  });

  it('wrong replacement reason', () => {
    expect(appendWith([{ ...A96, reason: MIN_PAGES }, A99])).toBe('ASSIGNMENT_REASON_MISMATCH');
    expect(appendWith([A96, { ...A99, reason: MIN_PAGES }])).toBe('ASSIGNMENT_REASON_MISMATCH');
  });

  it('a fake third Q1 obligation', () => {
    const third = { selectionIndex: 100, generation2ReserveRankPosition: 9, reason: HOST };
    expect(appendWith([A96, A99, third])).not.toBe('NO_REFUSAL');
    expect(
      appendWith([A96, { ...third, selectionIndex: 97, generation2ReserveRankPosition: 8 }, A99]),
    ).not.toBe('NO_REFUSAL');
    expect(Q1.map((a) => a.selectionIndex)).not.toContain(94);
  });

  it('wrong previous replacement lineage cannot silently pass (valid, re-chained ledgers)', () => {
    const forgeries = [
      forgedProspective(7, (p) => {
        p.replacedOccupantKind = 'GENERATION1_TERMINAL_OCCUPANT';
        p.previousSequenceForSlot = null;
      }),
      forgedProspective(7, (p) => void (p.previousSequenceForSlot = 5)),
      forgedProspective(7, (p) => void (p.previousSequenceForSlot = null)),
      forgedProspective(
        7,
        (p) => void (p.replacedEcheRowKey = CURRENT.entries[6]!.replacedEcheRowKey),
      ),
      forgedProspective(8, (p) => {
        p.replacedOccupantKind = 'GENERATION2_RESERVE_REPLACEMENT';
        p.previousSequenceForSlot = 6;
      }),
      forgedProspective(8, (p) => void (p.previousSequenceForSlot = 7)),
    ];
    for (const text of forgeries) {
      const forged = parseOperationalGeneration2Ledger(JSON.parse(text), BASIS.genesis);
      expect(validateOperationalGeneration2Ledger(BASIS, forged).valid).toBe(false);
      expect(falseInvariants(preflightOf(text))).toContain('currentGeneration2LedgerExactAndValid');
    }
  });

  it('canonical ledger mutated during readiness: only the pinned 7-entry revision is canonical', () => {
    expect(
      refusal(() => buildWindow07Readiness({ ...INPUTS, currentLedgerText: `${CURRENT_TEXT} ` })),
    ).toBe('CURRENT_LEDGER_NOT_CANONICAL');
    expect(
      refusal(() =>
        buildWindow07Readiness({ ...INPUTS, currentLedgerText: READINESS.prospectiveLedgerText }),
      ),
    ).toBe('CURRENT_LEDGER_NOT_CANONICAL');
    expect(INPUTS.currentLedgerText).toBe(CURRENT_TEXT);
    expect(falseInvariants(preflightOf(CURRENT_TEXT))).toHaveLength(2);
  });
});

describe('negative attacks - the window, the gates and the authority shape', () => {
  it('unauthorised sixth work item', () => {
    const sixth = resealedSpec((s) => void (s.workItems as Json[]).push(primaryItem(103, 6)));
    expect(sixth.workItems).toHaveLength(6);
    const p = preflightOf(READINESS.prospectiveLedgerText, sixth);
    expect(p.invariants.workItemsMatchGovernance).toBe(false);
    expect(p.invariants.windowSpecHashValid).toBe(false);
    expect(gateOf(p, 9, sixth).decision).not.toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    // A six-item spec re-sized to 6 is a DIFFERENT window: it can never carry this readiness's hash.
    const resized = resealedSpec((s) => {
      (s.workItems as Json[]).push(primaryItem(103, 6));
      s.plannedWindowSize = 6;
    });
    expect(resized.windowSpecHash).not.toBe(SPEC.windowSpecHash);
    expect(RECORD.window07.windowSpecHash).toBe(SPEC.windowSpecHash);
    expect(RECORD.window07.order).toHaveLength(5);
    // Against the readiness's own five-item window, a sixth observation is refused by the gate.
    const clean = (workItemId: string, selectionIndex: number, kind: string) => ({
      workItemId,
      kind,
      selectionIndex,
      reserveRankPosition: null,
      rawPageEvidenceCount: 10,
      runTerminalState: 'COMPLETED' as const,
      rootTerminalReason: null,
      orchestrationError: false,
      persistenceAnomaly: false,
      hostStateAnomaly: false,
      inputOrRootMismatch: false,
    });
    const five = SPEC.workItems.map((i) => ({
      ...clean(i.workItemId, i.selectionIndex, i.kind),
      reserveRankPosition: i.generation2ReserveRankPosition ?? null,
    }));
    const sixthObserved = [...five, clean('G2P:103', 103, 'PRIMARY')];
    const pros = preflightOf(READINESS.prospectiveLedgerText);
    const run = (completed: unknown[]) =>
      evaluateGeneration2WindowGate({
        spec: SPEC,
        preflight: pros,
        generation: { successfulOrganisationCount: 98, reserveConsumedCount: 9 },
        completed: completed as never,
      });
    expect(run(five).decision).not.toBe('PAUSE_P7_INVARIANT_MISMATCH');
    expect(run(sixthObserved).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });

  it('G2P:100 placed before a Q1 replacement / work items reordered', () => {
    for (const spec of [swapped(0, 2), swapped(1, 2), swapped(0, 1), swapped(3, 4)]) {
      const p = preflightOf(READINESS.prospectiveLedgerText, spec);
      expect(p.invariants.workItemsMatchGovernance).toBe(false);
      expect(p.invariants.windowSpecHashValid).toBe(false);
    }
  });

  it('G2P:103 substituted for 100/101/102 (re-sealed, genuine digests)', () => {
    for (const position of [2, 3, 4]) {
      const p = preflightOf(READINESS.prospectiveLedgerText, substituted(position, 103));
      expect(p.invariants.executionEntryIdentitiesMatch).toBe(true);
      expect(p.invariants.workItemsMatchGovernance).toBe(false);
      expect(p.invariants.windowSpecHashValid).toBe(false);
    }
  });

  it('wrong split / wrong execution identity (re-sealed)', () => {
    for (const position of [0, 1, 2]) {
      const spec = resealedSpec((s) => {
        const it = (s.workItems as Json[])[position]!;
        it.split = it.split === 'DEV_TRAIN' ? 'FINAL_HOLDOUT' : 'DEV_TRAIN';
      });
      expect(
        preflightOf(READINESS.prospectiveLedgerText, spec).invariants.workItemsMatchGovernance,
      ).toBe(false);
    }
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

  it('altered P2 / P5 thresholds (re-sealed) and altered P6 semantics', () => {
    for (const mutate of [
      (s: Json) => void (s.gateThresholds.p2RobotsRefusalWindowCount = 4),
      (s: Json) => void (s.gateThresholds.p5LowRawYieldWindowCount = 3),
    ]) {
      expect(
        falseInvariants(preflightOf(READINESS.prospectiveLedgerText, resealedSpec(mutate))),
      ).toContain('windowSpecHashValid');
    }
    expect(P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR).toBe(10);
    expect(P6_SUCCESS_FLOOR).toBe(50);
    expect(p6Fires({ reserveConsumedCount: 11, successfulOrganisationCount: 49 })).toBe(true);
    expect(p6Fires({ reserveConsumedCount: 11, successfulOrganisationCount: 98 })).toBe(false);
    expect(RECORD.gates.p6.rule).toBe('reserveConsumed > 10 AND successfulOrganisationCount < 50');
  });

  it('frozen P7 changed', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(RECORD.gates.p7.invariants).toEqual([...GENERATION2_P7_INVARIANT_NAMES]);
    const path =
      'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json';
    const edited = new Map(COMMITTED).set(path, `${COMMITTED.get(path)!} `);
    expect(refusal(() => buildWindow07Readiness({ ...INPUTS, committed: edited }))).toBe(
      'BASIS_NOT_EXACT',
    );
  });

  it('prospective future authority using boundLedger / Window-04 correction as a fallback', () => {
    const prospectiveWindow = synthesiseAdjudicatedWindow({
      basis: BASIS,
      priorHistory: HISTORY,
      startingLedgerText: CURRENT_TEXT,
      prospectiveLedgerText: READINESS.prospectiveLedgerText,
      spec: SPEC,
      verdicts: {},
      runRefSeed: 'test-window-07-future-bound-ledger',
    });
    const w07 = prospectiveWindow.history.windows[6]!;
    const authority = JSON.parse(w07.authority.text) as Json;
    expect(Object.hasOwn(authority, 'boundStartingLedger')).toBe(true);
    expect(authority.plannedLedgerAppend).toHaveLength(2);
    expect(replay(prospectiveWindow.history, prospectiveWindow.ledger)).toBe('NO_REFUSAL');
    authority.boundLedger = authority.boundStartingLedger;
    delete authority.boundStartingLedger;
    expect(
      replay(
        {
          windows: [
            ...HISTORY.windows,
            { ...w07, authority: sealRecord(w07.authority.path, authority) },
          ],
        },
        prospectiveWindow.ledger,
      ),
    ).toBe('HISTORY_RECORD_SHAPE');
    expect(
      replay(
        { windows: [...HISTORY.windows, { ...w07, authorityShapeCorrection: CORRECTION }] },
        prospectiveWindow.ledger,
      ),
    ).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND');
    expect(RECORD.prospectiveWindow07AuthorityShape).toMatchObject({
      canonicalFieldPresent: true,
      aliasFieldPresent: false,
      canonicalShapeReplays: true,
      aliasOnlyShapeRefusal: 'HISTORY_RECORD_SHAPE',
      window04CorrectionAttachedRefusal: 'HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND',
    });
  });
});

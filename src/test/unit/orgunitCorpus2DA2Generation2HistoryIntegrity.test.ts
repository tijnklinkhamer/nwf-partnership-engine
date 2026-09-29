/**
 * Phase 2B-2D A2 Generation 2: the GENERIC ADJUDICATION_HISTORY_INTEGRITY
 * boundary now enforces
 * GENERATION2_HISTORICAL_RUN_REFERENCE_IS_GLOBALLY_UNIQUE_ACROSS_ALL_ADJUDICATED_WINDOWS_V1
 * itself - no window-specific caller has to remember to ask.
 *
 * Every history here is either the real committed one (bound by exact pinned
 * commits, never a directory scan) or a synthetic, in-memory one re-sealed so
 * that the SEMANTIC rule - not a stale hash pin - is what refuses. Opens no
 * socket and no database and writes no file.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMITTED_JSON_DIRECTORIES } from '../harness/phase2b2d/generation2Acquisition/materialiseReadiness.js';
import {
  GENERATION2_LEDGER_PATH,
  Generation2OperationalRefusal,
} from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import { parseOperationalGeneration2Ledger } from '../harness/phase2b2d/generation2Acquisition/operationalLedger.js';
import {
  GENERATION2_P7_INVARIANT_NAMES,
  computeGeneration2PreflightWithAssessment,
} from '../harness/phase2b2d/generation2Acquisition/preflight.js';
import {
  assessCommittedInputs,
  type CommittedTexts,
} from '../harness/phase2b2d/generation2Acquisition/state.js';
import { buildGeneration2WindowSpec } from '../harness/phase2b2d/generation2Acquisition/windowSpec.js';
import {
  replayGeneration2History,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
  type Generation2WindowHistoryBinding,
} from '../harness/phase2b2d/generation2History/adjudicationHistory.js';
import {
  GLOBAL_RUN_REFERENCE_UNIQUENESS_RULE,
  assessAdjudicationHistoryIntegrity,
  requireUniqueHistoricalRunReferences,
} from '../harness/phase2b2d/generation2History/historyIntegrity.js';
import {
  refOf,
  sealRecord,
  synthesiseAdjudicatedWindow,
} from '../harness/phase2b2d/generation2Window03/synthesiseWindow.js';
import { requireUniqueHistoricalRunReferences as window03Helper } from '../harness/phase2b2d/generation2Window03/window03Readiness.js';
import {
  GENESIS_REVISION_COMMIT,
  WINDOW04_CURRENT_LEDGER_REVISION,
  WINDOW04_READINESS_AUDIT_PATH,
  WINDOW04_W02_PINS,
  WINDOW04_W03_PINS,
} from '../harness/phase2b2d/generation2Window04/window04Contract.js';
import { threeWindowHistory } from '../harness/phase2b2d/generation2Window04/window04Readiness.js';

const REPO = resolve(import.meta.dirname, '../../..');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The commit that added this task's audit, or null while it is uncommitted. */
function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW04_READINESS_AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}
const TERMINAL = terminalCommit();
const readState = (path: string): string =>
  TERMINAL === null ? readFileSync(join(REPO, path), 'utf8') : git('show', `${TERMINAL}:${path}`);
const namesState = (dir: string): string[] =>
  TERMINAL === null
    ? git('ls-files', '--', dir)
        .split('\n')
        .filter(Boolean)
        .map((path) => path.slice(dir.length + 1))
        .filter((name) => !name.includes('/'))
    : git('ls-tree', '--name-only', `${TERMINAL}:${dir}`).split('\n').filter(Boolean);

const at = (commit: string): string => git('show', `${commit}:${GENERATION2_LEDGER_PATH}`);
const GENESIS_TEXT = at(GENESIS_REVISION_COMMIT);
const W02_START_TEXT = at(WINDOW04_W02_PINS.startingLedgerRevisionCommit);
const W03_START_TEXT = at(WINDOW04_W03_PINS.startingLedgerRevisionCommit);
const CURRENT_TEXT = at(WINDOW04_CURRENT_LEDGER_REVISION.appendCommit);
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
const parse = (text: string) => parseOperationalGeneration2Ledger(JSON.parse(text), BASIS.genesis);
const CURRENT = parse(CURRENT_TEXT);
const HISTORY = threeWindowHistory(COMMITTED, [GENESIS_TEXT, W02_START_TEXT, W03_START_TEXT]);
const [W01, W02, W03] = HISTORY.windows as [
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
];
const runRefsOf = (binding: Generation2WindowHistoryBinding): string[] =>
  (JSON.parse(binding.adjudication.text) as Json).items.map((i: Json) => i.runRefSha256 as string);

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}
const integrityOf = (history: Generation2AdjudicationHistory, ledger = CURRENT) =>
  assessAdjudicationHistoryIntegrity(BASIS, ledger, history);

/**
 * Rewrites one executed item's run reference in a window's LIVE_RESULT and
 * adjudication, and re-seals every downstream reference so both records stay
 * internally self-consistent: the pin cannot be what refuses.
 */
function withRunRef(
  binding: Generation2WindowHistoryBinding,
  itemIndex: number,
  runRef: string,
): Generation2WindowHistoryBinding {
  const live = JSON.parse(binding.liveResult.text) as Json;
  live.items[itemIndex].runRefSha256 = runRef;
  const liveResult: CommittedRecordBinding = sealRecord(binding.liveResult.path, live);
  const adjudication = JSON.parse(binding.adjudication.text) as Json;
  adjudication.items[itemIndex].runRefSha256 = runRef;
  adjudication.bound.liveResult = { ...adjudication.bound.liveResult, ...refOf(liveResult) };
  return {
    ...binding,
    liveResult,
    adjudication: sealRecord(binding.adjudication.path, adjudication),
  };
}

describe('generic history integrity: the promoted rule lives in the assessment itself', () => {
  it('assessAdjudicationHistoryIntegrity calls the uniqueness helper before it can hold', () => {
    const source = readState('src/test/harness/phase2b2d/generation2History/historyIntegrity.ts');
    const body = source.slice(source.indexOf('export function assessAdjudicationHistoryIntegrity'));
    expect(body).toMatch(
      /replay = replayGeneration2History\(basis, ledger, history\);\s*runRefs = requireUniqueHistoricalRunReferences\(replay\);/,
    );
    expect(source).toContain(GLOBAL_RUN_REFERENCE_UNIQUENESS_RULE);
    expect(GLOBAL_RUN_REFERENCE_UNIQUENESS_RULE).toBe(
      'GENERATION2_HISTORICAL_RUN_REFERENCE_IS_GLOBALLY_UNIQUE_ACROSS_ALL_ADJUDICATED_WINDOWS_V1',
    );
  });

  it('Window 03 keeps no copy: its export IS the generic helper', () => {
    expect(window03Helper).toBe(requireUniqueHistoricalRunReferences);
    const w03 = readState('src/test/harness/phase2b2d/generation2Window03/window03Readiness.ts');
    expect(w03).not.toMatch(/export function requireUniqueHistoricalRunReferences/);
    expect(w03).toContain('const runRefs = integrity.historicalRunReferences;');
  });

  it('frozen P7 is unchanged: eighteen invariants, none about history or run references', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(GENERATION2_P7_INVARIANT_NAMES.join(' ')).not.toMatch(/history|adjudicat|runRef/i);
  });
});

describe('generic history integrity: unique histories hold', () => {
  it('one window with unique references holds', () => {
    // Judged against the ledger as it stood when Window 02 was planned.
    const integrity = integrityOf({ windows: [W01] }, parse(W02_START_TEXT));
    expect(integrity.failures).toEqual([]);
    expect(integrity.holds).toBe(true);
    expect(integrity.historicalRunReferences).toEqual(runRefsOf(W01));
  });

  it('two windows with unique references hold', () => {
    const integrity = integrityOf({ windows: [W01, W02] }, parse(W03_START_TEXT));
    expect(integrity.failures).toEqual([]);
    expect(integrity.historicalRunReferences).toHaveLength(10);
  });

  it('the three real windows hold, with fifteen globally unique references in history order', () => {
    const integrity = integrityOf(HISTORY);
    expect(integrity.failures).toEqual([]);
    expect(integrity).toMatchObject({ holds: true, isFrozenP7: false, windowCount: 3 });
    const refs = integrity.historicalRunReferences;
    expect(refs).toEqual([...runRefsOf(W01), ...runRefsOf(W02), ...runRefsOf(W03)]);
    expect(refs).toHaveLength(15);
    expect(new Set(refs).size).toBe(15);
    for (const ref of refs) expect(ref).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a synthetic fourth window with fresh references holds', () => {
    const spec = buildGeneration2WindowSpec({
      basis: BASIS,
      startingLedger: CURRENT,
      startingLedgerFile: {
        sha256: WINDOW04_CURRENT_LEDGER_REVISION.fileSha256,
        bytes: WINDOW04_CURRENT_LEDGER_REVISION.bytes,
      },
      plannedWindowSize: 5,
      history: HISTORY,
    });
    const w04 = synthesiseAdjudicatedWindow({
      basis: BASIS,
      priorHistory: HISTORY,
      startingLedgerText: CURRENT_TEXT,
      prospectiveLedgerText: CURRENT_TEXT,
      spec,
      verdicts: {},
      runRefSeed: 'generic-integrity-fresh',
    });
    const integrity = integrityOf(w04.history, w04.ledger);
    expect(integrity.failures).toEqual([]);
    expect(integrity.historicalRunReferences).toHaveLength(20);
  });
});

describe('generic history integrity: the cross-window attack', () => {
  const reused = runRefsOf(W01)[0]!;
  const attacked = { windows: [W01, W02, withRunRef(W03, 2, reused)] };

  it('the attacked window is internally self-consistent and replays: only the global rule is left to refuse', () => {
    const replay = replayGeneration2History(BASIS, CURRENT, attacked);
    const w03Refs = replay.windows[2]!.executed.map((item) => item.runRefSha256);
    expect(new Set(w03Refs).size).toBe(w03Refs.length); // unique within the window
    expect(w03Refs[2]).toBe(reused);
    expect(replay.windows[0]!.executed[0]!.runRefSha256).toBe(reused);
    expect(refusal(() => requireUniqueHistoricalRunReferences(replay))).toBe(
      'HISTORY_DUPLICATE_RUN_REFERENCE',
    );
  });

  it('assessAdjudicationHistoryIntegrity fails closed, and only on the run reference', () => {
    const integrity = integrityOf(attacked);
    expect(integrity.holds).toBe(false);
    expect(integrity.replay).toBeNull();
    expect(integrity.historicalRunReferences).toEqual([]);
    expect(integrity.failures).toHaveLength(1);
    expect(integrity.failures[0]).toMatch(
      /^REFUSED HISTORY_DUPLICATE_RUN_REFERENCE: a run reference executed in window 1 reappears in window 3 \(G2P:84\)/,
    );
  });

  it('the preflight reports the prerequisite as not holding, separately from P7', () => {
    const spec = buildGeneration2WindowSpec({
      basis: BASIS,
      startingLedger: CURRENT,
      startingLedgerFile: {
        sha256: WINDOW04_CURRENT_LEDGER_REVISION.fileSha256,
        bytes: WINDOW04_CURRENT_LEDGER_REVISION.bytes,
      },
      plannedWindowSize: 5,
      history: HISTORY,
    });
    const preflight = computeGeneration2PreflightWithAssessment(ASSESSMENT, {
      currentLedgerText: CURRENT_TEXT,
      startingLedgerText: CURRENT_TEXT,
      expectedWindowSpec: spec,
      adjudicationHistory: attacked,
    });
    expect(preflight.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(false);
    expect(preflight.operationalPrerequisites.adjudicationHistoryFailures.join(' ')).toContain(
      'HISTORY_DUPLICATE_RUN_REFERENCE',
    );
  });

  it('a synthetic window reusing a real Window-03 reference is refused the same way', () => {
    const spec = buildGeneration2WindowSpec({
      basis: BASIS,
      startingLedger: CURRENT,
      startingLedgerFile: {
        sha256: WINDOW04_CURRENT_LEDGER_REVISION.fileSha256,
        bytes: WINDOW04_CURRENT_LEDGER_REVISION.bytes,
      },
      plannedWindowSize: 5,
      history: HISTORY,
    });
    const w04 = synthesiseAdjudicatedWindow({
      basis: BASIS,
      priorHistory: HISTORY,
      startingLedgerText: CURRENT_TEXT,
      prospectiveLedgerText: CURRENT_TEXT,
      spec,
      verdicts: {},
      runRefSeed: 'generic-integrity-attack',
    });
    const binding = w04.history.windows[3]!;
    const forged = { windows: [W01, W02, W03, withRunRef(binding, 4, runRefsOf(W03)[1]!)] };
    expect(refusal(() => replayGeneration2History(BASIS, w04.ledger, forged))).toBe('NO_REFUSAL');
    const integrity = integrityOf(forged, w04.ledger);
    expect(integrity.holds).toBe(false);
    expect(integrity.failures).toEqual([
      expect.stringMatching(/HISTORY_DUPLICATE_RUN_REFERENCE: .* window 3 reappears in window 4/),
    ]);
  });

  it('two windows sharing a reference fail too (the rule does not need three)', () => {
    const integrity = integrityOf(
      { windows: [W01, withRunRef(W02, 0, runRefsOf(W01)[4]!)] },
      parse(W03_START_TEXT),
    );
    expect(integrity.holds).toBe(false);
    expect(integrity.failures.join(' ')).toContain('HISTORY_DUPLICATE_RUN_REFERENCE');
  });
});

describe('generic history integrity: the landed defences still refuse independently', () => {
  it('a duplicate inside one window is still refused by the replay itself', () => {
    const forged = { windows: [W01, W02, withRunRef(W03, 1, runRefsOf(W03)[0]!)] };
    expect(refusal(() => replayGeneration2History(BASIS, CURRENT, forged))).toBe(
      'HISTORY_LIVE_RESULT_ITEMS',
    );
    const integrity = integrityOf(forged);
    expect(integrity.holds).toBe(false);
    expect(integrity.failures.join(' ')).toContain('HISTORY_LIVE_RESULT_ITEMS');
    expect(integrity.failures.join(' ')).not.toContain('HISTORY_DUPLICATE_RUN_REFERENCE');
  });

  it('order changes are refused', () => {
    for (const windows of [
      [W01, W03, W02],
      [W02, W01, W03],
      [W03, W02, W01],
    ]) {
      expect(integrityOf({ windows }).holds).toBe(false);
    }
  });

  it('omitted history is refused', () => {
    for (const windows of [
      [W02, W03],
      [W01, W03],
    ]) {
      const integrity = integrityOf({ windows });
      expect(integrity.holds).toBe(false);
      expect(integrity.failures.join(' ')).not.toContain('HISTORY_DUPLICATE_RUN_REFERENCE');
    }
  });

  it('an unsealed edit is refused by the pin, before any semantic rule', () => {
    const text = W03.adjudication.text.replace(runRefsOf(W03)[0]!, runRefsOf(W01)[0]!);
    const integrity = integrityOf({
      windows: [W01, W02, { ...W03, adjudication: { ...W03.adjudication, text } }],
    });
    expect(integrity.holds).toBe(false);
    expect(integrity.failures.join(' ')).toContain('HISTORY_RECORD_NOT_PINNED');
  });
});

/**
 * PHASE 2B-2D A2 - THE POST-V4 REPLACEMENT + INDEX-9 CONTINUATION WINDOW,
 * OFFLINE.
 *
 * Pins the Generation-1 reserve replacement ledger contract (append-only,
 * hash-chained, validated against the frozen draw), the ascending pending-
 * obligation planner, the mechanical replacement-reason precedence, the
 * precommitted Window V1 plan and its P7 preflight, and the pure gate over
 * all eight Plan V1 pause conditions.
 *
 * Ledger-matrix fixtures use an INVENTED draw (keys like `SEL-003`,
 * `RES-00`). Tests that must touch the real frozen draw assert booleans and
 * hashes only, so no institution identity can reach a failure message.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import {
  evaluateBetweenRunGate,
  evaluateP5OverRawCounts,
} from '../harness/phase2b2d/acquisitionGate/betweenRunGate.js';
import { BATCH_02_SELECTION_INDICES } from '../harness/phase2b2d/acquisitionGate/gateContract.js';
import {
  recomputeFrameHash,
  type FrameArtifact,
} from '../harness/phase2b2d/corpus/frameArtifact.js';
import { recomputeDrawHash, type DrawArtifact } from '../harness/phase2b2d/draw/drawArtifact.js';
import { SPLIT_ASSIGNMENT_CYCLE_V2_R2 } from '../harness/phase2b2d/draw/drawContract.js';
import { prepareReplacementAppend } from '../harness/phase2b2d/continuationWindow/replacementAppend.js';
import {
  buildGenesisReplacementLedger,
  computeEntryHash,
  currentOccupantForSelectionIndex,
  ledgerExtendsGenesis,
  recomputeLedgerHash,
  reserveConsumedCount,
  stripEntryHash,
  validateReplacementLedger,
  type DrawForLedger,
  type ReplacementLedger,
  type ReplacementLedgerEntry,
} from '../harness/phase2b2d/continuationWindow/replacementLedger.js';
import {
  planPendingReplacementObligations,
  ReserveExhausted,
} from '../harness/phase2b2d/continuationWindow/replacementPlanner.js';
import {
  HOST_UNREACHABLE_ERROR_KINDS,
  replacementReasonFor,
  type ReplacementReasonFacts,
} from '../harness/phase2b2d/continuationWindow/replacementReason.js';
import {
  CURRENT_REPLACEMENT_REASONS,
  DRAW_FILE_SHA256,
  DRAW_HASH,
  DRAW_PATH,
  FRAME_PATH,
  OWNER_CLARIFICATION_PATH,
  OWNER_CLARIFICATION_SHA256,
  REPLACEMENT_LEDGER_PATH,
  REPLACEMENT_REASONS,
  ROOT_TERMINAL_REASONS,
  WINDOW_PLAN_PATH,
  WINDOW_V1_PENDING_REPLACEMENT_SLOTS,
  WINDOW_V1_SIZE,
  WINDOW_V1_WORK_ITEMS,
  exceedsStrictPercent,
  strictPercentThresholdCount,
  type CompletedWorkObservation,
  type ContinuationWindowGateInput,
  type GenerationState,
  type RootTerminalReason,
  type WindowPreflight,
} from '../harness/phase2b2d/continuationWindow/windowContract.js';
import { evaluateContinuationWindowGate } from '../harness/phase2b2d/continuationWindow/windowGate.js';
import {
  buildWindowPlan,
  computeWindowPreflight,
  drawEntrySha256,
  recomputeWindowPlanHash,
  workItemsOf,
  type WindowPlan,
} from '../harness/phase2b2d/continuationWindow/windowPlan.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const readText = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

// ---------------------------------------------------------------------------
// Invented fixtures.
// ---------------------------------------------------------------------------

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/** A draw about nothing: frozen shape, frozen hash value, invented keys. */
function syntheticDraw(reservePrefix = 'RES'): DrawForLedger {
  return {
    drawHash: DRAW_HASH,
    selection: Array.from({ length: 110 }, (_, i) => ({
      selectionIndex: i,
      echeRowKey: `SEL-${pad(i, 3)}`,
      split: SPLIT_ASSIGNMENT_CYCLE_V2_R2[i % 22]!,
    })),
    reserve: Array.from({ length: 40 }, (_, i) => ({
      reserveRankPosition: i,
      echeRowKey: `${reservePrefix}-${pad(i, 2)}`,
    })),
  };
}

const DRAW = syntheticDraw();
const GENESIS = buildGenesisReplacementLedger();
const AT = '2026-09-22T09:00:00Z';

function append(
  ledger: ReplacementLedger,
  slots: readonly number[],
  draw: DrawForLedger = DRAW,
  recordedAtUtc = AT,
): ReplacementLedger {
  const planned = planPendingReplacementObligations(draw, ledger, slots);
  return prepareReplacementAppend({
    draw,
    ledger,
    assignments: planned.map((p) => ({
      ...p,
      reason: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
    })),
    recordedAtUtc,
  }).nextLedger;
}

/** Replaces the entries and re-seals ledgerHash, so only the entry invariants are under test. */
function withEntries(
  ledger: ReplacementLedger,
  entries: ReplacementLedgerEntry[],
): ReplacementLedger {
  const draft = { ...ledger, entries, ledgerHash: '' };
  return { ...draft, ledgerHash: recomputeLedgerHash(draft) };
}

/** Rewrites one entry's fields and re-seals ITS OWN hash (not the chain after it). */
function rehash(
  entry: ReplacementLedgerEntry,
  patch: Partial<ReplacementLedgerEntry>,
): ReplacementLedgerEntry {
  const next = { ...entry, ...patch };
  return { ...next, entryHash: computeEntryHash(stripEntryHash(next)) };
}

/** Rebuilds a whole chain from payloads so a single positional violation is isolated. */
function rechain(entries: ReplacementLedgerEntry[]): ReplacementLedgerEntry[] {
  const out: ReplacementLedgerEntry[] = [];
  entries.forEach((entry, k) => {
    out.push(rehash(entry, { previousEntryHash: k === 0 ? null : out[k - 1]!.entryHash }));
  });
  return out;
}

const invalid = (ledger: ReplacementLedger, draw: DrawForLedger = DRAW): boolean =>
  !validateReplacementLedger(draw, ledger).valid;

const FOUR = append(GENESIS, [3, 4, 6, 8]);

// ---------------------------------------------------------------------------
// The real frozen artifacts (booleans and hashes only).
// ---------------------------------------------------------------------------

const DRAW_TEXT = readText(DRAW_PATH);
const REAL_DRAW = JSON.parse(DRAW_TEXT) as DrawArtifact;
const LEDGER_TEXT = readText(REPLACEMENT_LEDGER_PATH);
const COMMITTED_LEDGER = JSON.parse(LEDGER_TEXT) as ReplacementLedger;
const PLAN_TEXT = readText(WINDOW_PLAN_PATH);
const COMMITTED_PLAN = JSON.parse(PLAN_TEXT) as WindowPlan;

// ===========================================================================
// 1. THE GENESIS LEDGER
// ===========================================================================

describe('2D-A2 continuation: the canonical replacement ledger is the EMPTY genesis', () => {
  it('(A) exists at the one pinned path, is valid against the real draw, and holds zero entries', () => {
    expect(REPLACEMENT_LEDGER_PATH).toBe(
      'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
    );
    expect(COMMITTED_LEDGER.entries).toEqual([]);
    expect(validateReplacementLedger(REAL_DRAW, COMMITTED_LEDGER)).toEqual({
      valid: true,
      entryCount: 0,
    });
    expect(reserveConsumedCount(REAL_DRAW, COMMITTED_LEDGER)).toBe(0);
  });

  it('is byte-for-byte what the pure genesis builder produces, and its ledgerHash recomputes', () => {
    expect(canonicalStringify(COMMITTED_LEDGER)).toBe(canonicalStringify(GENESIS));
    expect(recomputeLedgerHash(COMMITTED_LEDGER)).toBe(COMMITTED_LEDGER.ledgerHash);
    expect(ledgerExtendsGenesis(COMMITTED_LEDGER)).toBe(true);
    expect(sha256(LEDGER_TEXT)).toBe(
      COMMITTED_PLAN.bound.genesisReplacementLedger!.artifactFileSha256,
    );
    expect(Buffer.byteLength(LEDGER_TEXT, 'utf8')).toBe(
      COMMITTED_PLAN.bound.genesisReplacementLedger!.bytes,
    );
  });

  it('binds R3, Plan V1, the frame, the draw and the owner clarification', () => {
    expect(COMMITTED_LEDGER.bound.draw).toMatchObject({
      drawHash: DRAW_HASH,
      artifactFileSha256: DRAW_FILE_SHA256,
    });
    expect(COMMITTED_LEDGER.bound.ownerClarification).toMatchObject({
      sha256: OWNER_CLARIFICATION_SHA256,
    });
    expect(Object.keys(COMMITTED_LEDGER.bound).sort()).toEqual(
      ['corpusAcquisitionPlanV1', 'draw', 'frame', 'methodologyR3', 'ownerClarification'].sort(),
    );
    expect(COMMITTED_LEDGER.reserveCount).toBe(40);
    expect(COMMITTED_LEDGER.replacementReasons).toEqual([...REPLACEMENT_REASONS]);
    expect(COMMITTED_LEDGER.thisFileAuthorises).toEqual([]);
  });

  it('carries no mutable current-occupant map, status or counter', () => {
    const keys = Object.keys(COMMITTED_LEDGER);
    for (const forbidden of [/current/i, /status/i, /occupant/i, /count$/i]) {
      expect(
        keys.filter(
          (key) => forbidden.test(key) && key !== 'reserveCount' && key !== 'selectionCount',
        ),
      ).toEqual([]);
    }
  });

  it('a header edit is detected as not extending genesis', () => {
    const edited = { ...GENESIS, reserveCount: 41 };
    expect(ledgerExtendsGenesis({ ...edited, ledgerHash: recomputeLedgerHash(edited) })).toBe(
      false,
    );
  });
});

// ===========================================================================
// 2. THE LEDGER VALIDATOR (matrix A-O)
// ===========================================================================

describe('2D-A2 continuation: the append-only ledger contract', () => {
  it('(A) the empty genesis ledger is valid', () => {
    expect(validateReplacementLedger(DRAW, GENESIS)).toEqual({ valid: true, entryCount: 0 });
  });

  it('(B) a first append of reserve position 0 is valid', () => {
    const one = append(GENESIS, [3]);
    expect(validateReplacementLedger(DRAW, one)).toEqual({ valid: true, entryCount: 1 });
    expect(one.entries[0]).toMatchObject({
      sequence: 0,
      selectionIndex: 3,
      reserveRankPosition: 0,
      replacedEcheRowKey: 'SEL-003',
      replacementEcheRowKey: 'RES-00',
      split: 'DEV_CONFIRM',
      replacedOccupantKind: 'ORIGINAL_SELECTION',
      previousSequenceForSlot: null,
      previousEntryHash: null,
      recordedAtUtc: AT,
    });
  });

  it('(C) four sequential appends 0,1,2,3 are valid and hash-chained', () => {
    expect(validateReplacementLedger(DRAW, FOUR)).toEqual({ valid: true, entryCount: 4 });
    expect(FOUR.entries.map((e) => e.reserveRankPosition)).toEqual([0, 1, 2, 3]);
    expect(FOUR.entries[0]!.previousEntryHash).toBeNull();
    for (let k = 1; k < 4; k += 1) {
      expect(FOUR.entries[k]!.previousEntryHash).toBe(FOUR.entries[k - 1]!.entryHash);
    }
    for (const entry of FOUR.entries) {
      expect(computeEntryHash(stripEntryHash(entry))).toBe(entry.entryHash);
    }
  });

  it('keeps every frozen Plan V1 field, unrenamed', () => {
    for (const field of [
      'selectionIndex',
      'split',
      'replacedEcheRowKey',
      'replacementEcheRowKey',
      'reserveRankPosition',
      'reason',
      'recordedAtUtc',
    ]) {
      expect(Object.keys(FOUR.entries[0]!)).toContain(field);
    }
  });

  it('(D) a duplicate reserve position is rejected', () => {
    const [a, b] = FOUR.entries;
    const dup = rechain([a!, { ...b!, reserveRankPosition: 0, replacementEcheRowKey: 'RES-00' }]);
    expect(invalid(withEntries(GENESIS, dup))).toBe(true);
  });

  it('(E) skipping from position 1 to 3 is rejected', () => {
    const [a, b, , d] = FOUR.entries;
    const skipped = rechain([a!, b!, { ...d!, sequence: 2 }]);
    expect(invalid(withEntries(GENESIS, skipped))).toBe(true);
  });

  it('(F) an out-of-order reserve position is rejected', () => {
    const [a, b] = FOUR.entries;
    const swapped = rechain([
      { ...a!, reserveRankPosition: 1, replacementEcheRowKey: 'RES-01' },
      { ...b!, reserveRankPosition: 0, replacementEcheRowKey: 'RES-00' },
    ]);
    expect(invalid(withEntries(GENESIS, swapped))).toBe(true);
  });

  it('(G) the wrong reserve identity for a position is rejected', () => {
    const wrong = rechain([{ ...FOUR.entries[0]!, replacementEcheRowKey: 'RES-05' }]);
    expect(invalid(withEntries(GENESIS, wrong))).toBe(true);
  });

  it('(H) the wrong replaced identity is rejected', () => {
    const wrong = rechain([{ ...FOUR.entries[0]!, replacedEcheRowKey: 'SEL-004' }]);
    expect(invalid(withEntries(GENESIS, wrong))).toBe(true);
  });

  it('(I) the wrong split is rejected', () => {
    const wrong = rechain([{ ...FOUR.entries[0]!, split: 'FINAL_HOLDOUT' }]);
    expect(invalid(withEntries(GENESIS, wrong))).toBe(true);
  });

  it('(J) a reason outside the four frozen tokens is rejected', () => {
    const wrong = rechain([
      { ...FOUR.entries[0]!, reason: 'DNS_NAME_NOT_FOUND' as ReplacementLedgerEntry['reason'] },
    ]);
    expect(invalid(withEntries(GENESIS, wrong))).toBe(true);
  });

  it('(K) a changed historical entry fails the hash chain', () => {
    // Edited in place, not re-hashed: its own hash no longer recomputes.
    const edited = [...FOUR.entries];
    edited[0] = { ...edited[0]!, recordedAtUtc: '2026-09-22T08:00:00Z' };
    expect(invalid(withEntries(GENESIS, edited))).toBe(true);
    // Edited AND re-hashed: the next entry's previousEntryHash no longer chains.
    const resealed = [...FOUR.entries];
    resealed[0] = rehash(resealed[0]!, { recordedAtUtc: '2026-09-22T08:00:00Z' });
    expect(invalid(withEntries(GENESIS, resealed))).toBe(true);
    // Even the ledgerHash alone detects an unsealed edit.
    expect(recomputeLedgerHash({ ...FOUR, entries: edited })).not.toBe(FOUR.ledgerHash);
  });

  it('(L) deleting a prefix entry fails', () => {
    expect(invalid(withEntries(GENESIS, FOUR.entries.slice(1)))).toBe(true);
  });

  it('(M) reordered entries fail', () => {
    const reordered = [FOUR.entries[1]!, FOUR.entries[0]!, FOUR.entries[2]!, FOUR.entries[3]!];
    expect(invalid(withEntries(GENESIS, reordered))).toBe(true);
  });

  it('(N) the same reserve assigned to two slots fails', () => {
    const [a, b] = FOUR.entries;
    const twice = rechain([a!, { ...b!, replacementEcheRowKey: 'RES-00' }]);
    expect(invalid(withEntries(GENESIS, twice))).toBe(true);
  });

  it('(O) the 41st reserve is refused, by the planner and by the validator', () => {
    const forty = append(
      GENESIS,
      Array.from({ length: 40 }, (_, i) => i),
    );
    expect(validateReplacementLedger(DRAW, forty)).toEqual({ valid: true, entryCount: 40 });
    expect(() => planPendingReplacementObligations(DRAW, forty, [40])).toThrow(ReserveExhausted);
    expect(() => planPendingReplacementObligations(DRAW, forty, [40])).toThrow(
      /CORPUS_FREEZE_REFUSED/,
    );
    const last = forty.entries[39]!;
    const fortyFirst = rehash(
      {
        ...last,
        sequence: 40,
        selectionIndex: 41,
        split: SPLIT_ASSIGNMENT_CYCLE_V2_R2[41 % 22]!,
        replacedEcheRowKey: 'SEL-041',
        reserveRankPosition: 40,
        replacementEcheRowKey: 'RES-40',
        previousSequenceForSlot: null,
        replacedOccupantKind: 'ORIGINAL_SELECTION',
      },
      { previousEntryHash: last.entryHash },
    );
    expect(invalid(withEntries(GENESIS, [...forty.entries, fortyFirst]))).toBe(true);
  });

  it('rejects an entry carrying an extra field such as a mutable current organisation', () => {
    const extra = rechain([
      { ...FOUR.entries[0]!, currentOrganisation: 'x' } as unknown as ReplacementLedgerEntry,
    ]);
    expect(invalid(withEntries(GENESIS, extra))).toBe(true);
  });

  it('rejects a timestamp that is not an explicit ISO-8601 UTC instant, or that goes backwards', () => {
    expect(
      invalid(withEntries(GENESIS, rechain([{ ...FOUR.entries[0]!, recordedAtUtc: 'yesterday' }]))),
    ).toBe(true);
    const backwards = rechain([
      FOUR.entries[0]!,
      { ...FOUR.entries[1]!, recordedAtUtc: '2026-09-21T00:00:00Z' },
    ]);
    expect(invalid(withEntries(GENESIS, backwards))).toBe(true);
  });

  it('rejects a ledger checked against a draw whose hash is not the frozen one', () => {
    expect(invalid(GENESIS, { ...DRAW, drawHash: '0'.repeat(64) })).toBe(true);
  });

  it('never places an eche row key in a violation message', () => {
    const result = validateReplacementLedger(
      DRAW,
      withEntries(GENESIS, rechain([{ ...FOUR.entries[0]!, replacedEcheRowKey: 'SEL-004' }])),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      for (const message of result.violations) expect(message).not.toMatch(/SEL-|RES-/);
    }
  });
});

// ===========================================================================
// 3. CURRENT OCCUPANT (P, Q)
// ===========================================================================

describe('2D-A2 continuation: the current occupant is derived, never stored', () => {
  it('(P) no entry -> the original selection; one entry -> that reserve', () => {
    expect(currentOccupantForSelectionIndex(DRAW, GENESIS, 3)).toEqual({
      selectionIndex: 3,
      occupantKind: 'ORIGINAL_SELECTION',
      echeRowKey: 'SEL-003',
      reserveRankPosition: null,
      ledgerSequence: null,
    });
    expect(currentOccupantForSelectionIndex(DRAW, FOUR, 3)).toMatchObject({
      occupantKind: 'RESERVE_REPLACEMENT',
      echeRowKey: 'RES-00',
      reserveRankPosition: 0,
      ledgerSequence: 0,
    });
    expect(currentOccupantForSelectionIndex(DRAW, FOUR, 9).occupantKind).toBe('ORIGINAL_SELECTION');
  });

  it('(Q) a same-slot chain replaces the previous RESERVE occupant, append-only', () => {
    const chained = append(FOUR, [3]);
    expect(validateReplacementLedger(DRAW, chained)).toEqual({ valid: true, entryCount: 5 });
    expect(chained.entries[4]).toMatchObject({
      sequence: 4,
      selectionIndex: 3,
      reserveRankPosition: 4,
      replacedEcheRowKey: 'RES-00',
      replacementEcheRowKey: 'RES-04',
      replacedOccupantKind: 'RESERVE_REPLACEMENT',
      previousSequenceForSlot: 0,
      split: 'DEV_CONFIRM',
    });
    // The earlier entry is untouched, byte for byte.
    expect(canonicalStringify(chained.entries.slice(0, 4))).toBe(canonicalStringify(FOUR.entries));
    expect(currentOccupantForSelectionIndex(DRAW, chained, 3).echeRowKey).toBe('RES-04');
    // A chain entry that claims to replace the ORIGINAL occupant is refused.
    const wrong = rechain([
      ...FOUR.entries,
      {
        ...chained.entries[4]!,
        replacedEcheRowKey: 'SEL-003',
        replacedOccupantKind: 'ORIGINAL_SELECTION',
        previousSequenceForSlot: null,
      },
    ]);
    expect(invalid(withEntries(GENESIS, wrong))).toBe(true);
  });

  it('refuses to derive anything from an invalid ledger', () => {
    expect(() =>
      currentOccupantForSelectionIndex(DRAW, withEntries(GENESIS, FOUR.entries.slice(1)), 3),
    ).toThrow();
  });
});

// ===========================================================================
// 4. THE PLANNER (R-V)
// ===========================================================================

describe('2D-A2 continuation: the pending-obligation planner', () => {
  it('(R) sorts pending slots ascending', () => {
    expect(
      planPendingReplacementObligations(DRAW, GENESIS, [8, 3, 6, 4]).map((p) => p.selectionIndex),
    ).toEqual([3, 4, 6, 8]);
  });

  it('(S) ignores the input order entirely', () => {
    const a = planPendingReplacementObligations(DRAW, GENESIS, [3, 4, 6, 8]);
    const b = planPendingReplacementObligations(DRAW, GENESIS, [8, 6, 4, 3]);
    const c = planPendingReplacementObligations(DRAW, GENESIS, [6, 3, 8, 4]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('(T) starts at the next unused reserve position', () => {
    expect(planPendingReplacementObligations(DRAW, append(GENESIS, [1, 2]), [7])).toEqual([
      { selectionIndex: 7, reserveRankPosition: 2 },
    ]);
  });

  it('(U) the current plan over the REAL genesis ledger is exactly 3->0, 4->1, 6->2, 8->3', () => {
    expect(
      planPendingReplacementObligations(REAL_DRAW, COMMITTED_LEDGER, [
        ...WINDOW_V1_PENDING_REPLACEMENT_SLOTS,
      ]),
    ).toEqual([
      { selectionIndex: 3, reserveRankPosition: 0 },
      { selectionIndex: 4, reserveRankPosition: 1 },
      { selectionIndex: 6, reserveRankPosition: 2 },
      { selectionIndex: 8, reserveRankPosition: 3 },
    ]);
  });

  it('(V) with 0..3 consumed, pending [9,3] -> 3->4, 9->5 (a later window, never inserted into the old one)', () => {
    expect(planPendingReplacementObligations(DRAW, FOUR, [9, 3])).toEqual([
      { selectionIndex: 3, reserveRankPosition: 4 },
      { selectionIndex: 9, reserveRankPosition: 5 },
    ]);
  });

  it('is identity-blind: different reserve identities give the same assignment', () => {
    const other = syntheticDraw('ZZZ');
    expect(planPendingReplacementObligations(other, GENESIS, [8, 3])).toEqual(
      planPendingReplacementObligations(DRAW, GENESIS, [8, 3]),
    );
  });

  it('refuses a duplicate or out-of-range pending slot, and an invalid ledger', () => {
    expect(() => planPendingReplacementObligations(DRAW, GENESIS, [3, 3])).toThrow(/twice/);
    expect(() => planPendingReplacementObligations(DRAW, GENESIS, [110])).toThrow();
    expect(() => planPendingReplacementObligations(DRAW, GENESIS, [-1])).toThrow();
    expect(() =>
      planPendingReplacementObligations(DRAW, withEntries(GENESIS, FOUR.entries.slice(1)), [3]),
    ).toThrow();
  });
});

// ===========================================================================
// 5. PRE-NETWORK APPEND PREPARATION
// ===========================================================================

describe('2D-A2 continuation: append preparation (for the later live authority)', () => {
  it('produces the four future rows over the REAL draw, in memory only', () => {
    const prepared = prepareReplacementAppend({
      draw: REAL_DRAW,
      ledger: COMMITTED_LEDGER,
      assignments: [3, 4, 6, 8].map((selectionIndex, reserveRankPosition) => ({
        selectionIndex,
        reserveRankPosition,
        reason: CURRENT_REPLACEMENT_REASONS[selectionIndex as 3 | 4 | 6 | 8],
      })),
      recordedAtUtc: AT,
    });
    expect(prepared.reserveConsumedBefore).toBe(0);
    expect(prepared.reserveConsumedAfter).toBe(4);
    expect(prepared.previousLedgerHash).toBe(COMMITTED_LEDGER.ledgerHash);
    expect(prepared.appendedEntryHashes).toHaveLength(4);
    const rows = prepared.nextLedger.entries;
    expect(
      rows.map((r) => [r.sequence, r.selectionIndex, r.reserveRankPosition, r.split, r.reason]),
    ).toEqual([
      [0, 3, 0, 'DEV_CONFIRM', 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'],
      [1, 4, 1, 'FINAL_HOLDOUT', 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE'],
      [2, 6, 2, 'DEV_CONFIRM', 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE'],
      [3, 8, 3, 'DEV_CONFIRM', 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE'],
    ]);
    rows.forEach((row) => {
      expect(row.replacedOccupantKind).toBe('ORIGINAL_SELECTION');
      expect(row.replacedEcheRowKey === REAL_DRAW.selection[row.selectionIndex]!.echeRowKey).toBe(
        true,
      );
      expect(
        row.replacementEcheRowKey === REAL_DRAW.reserve[row.reserveRankPosition]!.echeRowKey,
      ).toBe(true);
    });
    // The canonical file on disk is untouched: still the empty genesis.
    expect((JSON.parse(readText(REPLACEMENT_LEDGER_PATH)) as ReplacementLedger).entries).toEqual(
      [],
    );
  });

  it('refuses assignments that are not exactly the planner’s (manual reordering)', () => {
    expect(() =>
      prepareReplacementAppend({
        draw: DRAW,
        ledger: GENESIS,
        assignments: [
          {
            selectionIndex: 4,
            reserveRankPosition: 0,
            reason: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
          },
          {
            selectionIndex: 3,
            reserveRankPosition: 1,
            reason: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
          },
        ],
        recordedAtUtc: AT,
      }),
    ).toThrow(/not the planner/);
  });

  it('requires an explicit caller-supplied UTC timestamp', () => {
    expect(() =>
      prepareReplacementAppend({
        draw: DRAW,
        ledger: GENESIS,
        assignments: [
          {
            selectionIndex: 3,
            reserveRankPosition: 0,
            reason: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
          },
        ],
        recordedAtUtc: '',
      }),
    ).toThrow(/recordedAtUtc/);
  });
});

// ===========================================================================
// 6. REPLACEMENT-REASON PRECEDENCE
// ===========================================================================

describe('2D-A2 continuation: the mechanical replacement-reason precedence', () => {
  const facts = (overrides: Partial<ReplacementReasonFacts>): ReplacementReasonFacts => ({
    rootTerminalReason: 'NO_ELIGIBLE_HTML',
    blockingTransportErrorKind: null,
    usableHttpResponseObtained: true,
    postSd7PageCount: 0,
    ...overrides,
  });

  it('invalid root authority -> ROOT_AUTHORITY_FAILURE (rank 1 beats a transport failure)', () => {
    expect(replacementReasonFor(facts({ rootTerminalReason: 'INVALID_ROOT_AUTHORITY' }))).toBe(
      'ACQUISITION_UNSUCCESSFUL_ROOT_AUTHORITY_FAILURE',
    );
    expect(
      replacementReasonFor(
        facts({
          rootTerminalReason: 'INVALID_ROOT_AUTHORITY',
          blockingTransportErrorKind: 'DNS_FAILURE',
          usableHttpResponseObtained: false,
        }),
      ),
    ).toBe('ACQUISITION_UNSUCCESSFUL_ROOT_AUTHORITY_FAILURE');
  });

  it('robots explicitly disallowed -> ROBOTS_DISALLOWED', () => {
    expect(replacementReasonFor(facts({ rootTerminalReason: 'ROBOTS_BLOCKED_ROOT' }))).toBe(
      'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED',
    );
  });

  it('DNS/TLS/connect/read/refused/reset before any usable response -> HOST_UNREACHABLE', () => {
    for (const kind of HOST_UNREACHABLE_ERROR_KINDS) {
      expect(
        replacementReasonFor(
          facts({
            rootTerminalReason: 'ROBOTS_UNREADABLE_ROOT',
            blockingTransportErrorKind: kind,
            usableHttpResponseObtained: false,
          }),
        ),
        kind,
      ).toBe('ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE');
    }
  });

  it('HTTP 500 with robots allowed and post-SD7 < 4 -> MIN_PAGES_NOT_MET', () => {
    expect(
      replacementReasonFor(
        facts({ rootTerminalReason: 'NO_ELIGIBLE_HTML', usableHttpResponseObtained: true }),
      ),
    ).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
  });

  it('any other determinate post-SD7 < 4 falls back to MIN_PAGES_NOT_MET', () => {
    expect(
      replacementReasonFor(
        facts({
          rootTerminalReason: 'COMPLETED_WITH_NO_PROMISING_CANDIDATES',
          postSd7PageCount: 3,
        }),
      ),
    ).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
    // A transport error AFTER a usable response is not host-unreachable.
    expect(
      replacementReasonFor(
        facts({ blockingTransportErrorKind: 'READ_TIMEOUT', usableHttpResponseObtained: true }),
      ),
    ).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
  });

  it('returns no reason when the formal count meets the minimum, and refuses a non-exact count', () => {
    expect(replacementReasonFor(facts({ postSd7PageCount: 4 }))).toBeNull();
    expect(() => replacementReasonFor(facts({ postSd7PageCount: 2.5 }))).toThrow();
  });

  it('never emits a subtype token: every output is one of the four frozen reasons', () => {
    for (const rootTerminalReason of ROOT_TERMINAL_REASONS) {
      for (const kind of [null, ...HOST_UNREACHABLE_ERROR_KINDS]) {
        for (const usable of [true, false]) {
          const reason = replacementReasonFor(
            facts({
              rootTerminalReason,
              blockingTransportErrorKind: kind,
              usableHttpResponseObtained: usable,
            }),
          );
          expect(REPLACEMENT_REASONS).toContain(reason);
        }
      }
    }
  });

  it('reproduces the four governance reasons from the recorded mechanical facts, with no network', () => {
    // Transcribed from the owner clarification's currentReasonsVerifiedAgainstDurableEvidence.
    const recorded: Record<3 | 4 | 6 | 8, ReplacementReasonFacts> = {
      3: facts({ rootTerminalReason: 'NO_ELIGIBLE_HTML', usableHttpResponseObtained: true }),
      4: facts({
        rootTerminalReason: 'ROBOTS_UNREADABLE_ROOT',
        blockingTransportErrorKind: 'DNS_FAILURE',
        usableHttpResponseObtained: false,
      }),
      6: facts({
        rootTerminalReason: 'ROBOTS_UNREADABLE_ROOT',
        blockingTransportErrorKind: 'CONNECTION_RESET',
        usableHttpResponseObtained: false,
      }),
      8: facts({
        rootTerminalReason: 'ROBOTS_UNREADABLE_ROOT',
        blockingTransportErrorKind: 'CONNECTION_RESET',
        usableHttpResponseObtained: false,
      }),
    };
    for (const slot of [3, 4, 6, 8] as const) {
      expect(replacementReasonFor(recorded[slot])).toBe(CURRENT_REPLACEMENT_REASONS[slot]);
    }
    expect(CURRENT_REPLACEMENT_REASONS).toEqual({
      3: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
      4: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
      6: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
      8: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
    });
    const clarification = JSON.parse(readText(OWNER_CLARIFICATION_PATH)) as {
      Q3_replacementReasonPrecedence: { replacementReasons: Record<string, string> };
    };
    expect(clarification.Q3_replacementReasonPrecedence.replacementReasons).toEqual({
      '3': CURRENT_REPLACEMENT_REASONS[3],
      '4': CURRENT_REPLACEMENT_REASONS[4],
      '6': CURRENT_REPLACEMENT_REASONS[6],
      '8': CURRENT_REPLACEMENT_REASONS[8],
    });
  });
});

// ===========================================================================
// 7. THE WINDOW V1 PLAN AND ITS PREFLIGHT
// ===========================================================================

describe('2D-A2 continuation: the offline precommitted Window V1 plan', () => {
  it('pins the exact ordered work-item ids, kinds, positions and splits', () => {
    expect(WINDOW_V1_WORK_ITEMS.map((item) => item.workItemId)).toEqual([
      'R:3:0',
      'R:4:1',
      'R:6:2',
      'R:8:3',
      'P:9',
    ]);
    expect(COMMITTED_PLAN.workItems.map((item) => item.workItemId)).toEqual([
      'R:3:0',
      'R:4:1',
      'R:6:2',
      'R:8:3',
      'P:9',
    ]);
    expect(COMMITTED_PLAN.workItems.map((item) => item.split)).toEqual([
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      'DEV_CONFIRM',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
    ]);
    expect(COMMITTED_PLAN.workItems.map((item) => item.reserveRankPosition)).toEqual([
      0,
      1,
      2,
      3,
      null,
    ]);
    expect(COMMITTED_PLAN.workItems.map((item) => item.kind)).toEqual([
      'REPLACEMENT',
      'REPLACEMENT',
      'REPLACEMENT',
      'REPLACEMENT',
      'PRIMARY',
    ]);
    expect(COMMITTED_PLAN.windowSize).toBe(5);
    expect(WINDOW_V1_SIZE).toBe(5);
    expect(canonicalStringify(workItemsOf(COMMITTED_PLAN))).toBe(
      canonicalStringify(WINDOW_V1_WORK_ITEMS),
    );
  });

  it('every split is the frozen draw slot’s own split', () => {
    for (const item of COMMITTED_PLAN.workItems) {
      expect(item.split).toBe(REAL_DRAW.selection[item.selectionIndex]!.split);
    }
  });

  it('is exactly what the pure builder derives from the real draw and the genesis ledger bytes', () => {
    const rebuilt = buildWindowPlan(REAL_DRAW, {
      artifactFileSha256: sha256(LEDGER_TEXT),
      bytes: Buffer.byteLength(LEDGER_TEXT, 'utf8'),
    });
    expect(canonicalStringify(rebuilt)).toBe(canonicalStringify(COMMITTED_PLAN));
    expect(recomputeWindowPlanHash(COMMITTED_PLAN)).toBe(COMMITTED_PLAN.windowPlanHash);
  });

  it('binds each work item to its exact draw entry by an opaque digest', () => {
    for (const item of COMMITTED_PLAN.workItems) {
      const entry =
        item.kind === 'REPLACEMENT'
          ? REAL_DRAW.reserve[item.reserveRankPosition!]!
          : REAL_DRAW.selection[item.selectionIndex]!;
      expect(drawEntrySha256(entry)).toBe(item.drawEntrySha256);
    }
    // The index-9 digest is of the SELECTION entry; replacements digest RESERVE entries.
    expect(COMMITTED_PLAN.workItems[4]!.drawEntryKind).toBe('SELECTION');
    expect(
      COMMITTED_PLAN.workItems.slice(0, 4).every((item) => item.drawEntryKind === 'RESERVE'),
    ).toBe(true);
  });

  it('exposes no institution identity of any drawn organisation', () => {
    const drawn = [...REAL_DRAW.selection, ...REAL_DRAW.reserve];
    let leaks = 0;
    for (const entry of drawn) {
      for (const value of [
        entry.echeRowKey,
        entry.organisationId,
        entry.rankHash,
        ...entry.rootAuthorities.map((a) => a.id),
      ]) {
        if (PLAN_TEXT.includes(value) || LEDGER_TEXT.includes(value)) leaks += 1;
      }
    }
    expect(leaks).toBe(0);
    expect(PLAN_TEXT).not.toMatch(/https?:\/\//);
  });

  it('records that nothing is consumed, assigned or authorised', () => {
    expect(COMMITTED_PLAN.recordKind).toBe('OFFLINE_PRECOMMITTED_WINDOW_PLAN');
    expect(COMMITTED_PLAN.isLiveAuthority).toBe(false);
    expect(COMMITTED_PLAN.thisFileAuthorises).toEqual([]);
    expect(COMMITTED_PLAN.stateAtPlanTime).toEqual({
      replacementLedgerEntries: 0,
      reserveConsumed: 0,
      replacementAssignmentsDurablyActivated: 0,
      index9: 'NEVER_STARTED',
      liveAuthorityGranted: false,
    });
    expect(
      COMMITTED_PLAN.plannedFutureAssignments.map((a) => [a.selectionIndex, a.reserveRankPosition]),
    ).toEqual([
      [3, 0],
      [4, 1],
      [6, 2],
      [8, 3],
    ]);
    expect(COMMITTED_PLAN.plannedPrimary).toBe(9);
    expect(COMMITTED_PLAN.pauseThresholdsForThisWindow).toMatchObject({
      p2PercentageThresholdCount: 3,
      p5LowYieldThresholdCount: 2,
    });
    expect(COMMITTED_PLAN.bound.ownerClarification).toMatchObject({
      sha256: OWNER_CLARIFICATION_SHA256,
      bytes: 18443,
    });
    expect(sha256(readText(OWNER_CLARIFICATION_PATH))).toBe(OWNER_CLARIFICATION_SHA256);
  });
});

describe('2D-A2 continuation: the P7 preflight over the real frozen artifacts', () => {
  const frameText = readText(FRAME_PATH);
  const frame = JSON.parse(frameText) as FrameArtifact;
  const baseInput = {
    draw: REAL_DRAW,
    drawFileSha256: sha256(DRAW_TEXT),
    recomputedDrawHash: recomputeDrawHash(REAL_DRAW),
    frameFileSha256: sha256(frameText),
    recomputedFrameHash: recomputeFrameHash(frame),
    ownerClarificationSha256: sha256(readText(OWNER_CLARIFICATION_PATH)),
    windowPlan: COMMITTED_PLAN,
  };
  const liveLedger = prepareReplacementAppend({
    draw: REAL_DRAW,
    ledger: COMMITTED_LEDGER,
    assignments: [3, 4, 6, 8].map((selectionIndex, reserveRankPosition) => ({
      selectionIndex,
      reserveRankPosition,
      reason: CURRENT_REPLACEMENT_REASONS[selectionIndex as 3 | 4 | 6 | 8],
    })),
    recordedAtUtc: AT,
  }).nextLedger;
  const gate = (preflight: WindowPreflight, reserveConsumedCount: number) =>
    evaluateContinuationWindowGate({
      window: workItemsOf(COMMITTED_PLAN),
      plannedWindowSize: COMMITTED_PLAN.windowSize,
      preflight,
      generation: { successfulOrganisationCount: 5, reserveConsumedCount },
      completed: [],
    });

  it('on the committed GENESIS ledger: every binding holds, but the window may NOT start (no assignment recorded yet)', () => {
    const preflight = computeWindowPreflight({ ...baseInput, ledger: COMMITTED_LEDGER });
    expect(preflight.invariants).toEqual({
      frameBindingValid: true,
      drawBindingValid: true,
      ownerClarificationBindingValid: true,
      replacementLedgerValid: true,
      replacementLedgerExtendsGenesis: true,
      windowPlanValid: true,
      workItemsMatchFrozenPlan: true,
      workItemDrawEntriesMatch: true,
      replacementAssignmentsRecorded: false,
      currentOccupantsMatch: false,
    });
    expect(preflight.ledgerEntryCount).toBe(0);
    const verdict = gate(preflight, 0);
    expect(verdict.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    expect(verdict.mayStartNextWorkItem).toBe(false);
  });

  it('after the four rows are appended (in memory): all invariants hold and item R:3:0 may start', () => {
    const preflight = computeWindowPreflight({ ...baseInput, ledger: liveLedger });
    expect(Object.values(preflight.invariants).every((holds) => holds)).toBe(true);
    expect(preflight.ledgerEntryCount).toBe(4);
    const verdict = gate(preflight, 4);
    expect(verdict.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(verdict.nextWorkItemId).toBe('R:3:0');
    // ... but not if the generation state disagrees with the ledger.
    expect(gate(preflight, 0).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });

  it('a wrong draw, frame or clarification binding is P7 before the first item', () => {
    for (const patch of [
      { drawFileSha256: '0'.repeat(64) },
      { recomputedFrameHash: '0'.repeat(64) },
      { ownerClarificationSha256: '0'.repeat(64) },
    ]) {
      const preflight = computeWindowPreflight({ ...baseInput, ...patch, ledger: liveLedger });
      expect(gate(preflight, 4).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    }
  });

  it('a tampered plan, a mismatched work item or a wrong current occupant is P7', () => {
    const items = COMMITTED_PLAN.workItems.map((item) => ({ ...item }));
    items[4] = { ...items[4]!, split: 'DEV_CONFIRM' };
    const tampered = { ...COMMITTED_PLAN, workItems: items };
    const resealed = {
      ...tampered,
      windowPlanHash: recomputeWindowPlanHash(tampered as WindowPlan),
    } as WindowPlan;
    expect(
      computeWindowPreflight({ ...baseInput, windowPlan: resealed, ledger: liveLedger }).invariants
        .windowPlanValid,
    ).toBe(false);

    const reReplaced = prepareReplacementAppend({
      draw: REAL_DRAW,
      ledger: liveLedger,
      assignments: [
        {
          selectionIndex: 3,
          reserveRankPosition: 4,
          reason: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
        },
      ],
      recordedAtUtc: AT,
    }).nextLedger;
    const preflight = computeWindowPreflight({ ...baseInput, ledger: reReplaced });
    expect(preflight.invariants.currentOccupantsMatch).toBe(false);
    expect(gate(preflight, 5).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });
});

// ===========================================================================
// 8. THE GATE (all eight conditions)
// ===========================================================================

const CLEAN_PREFLIGHT: WindowPreflight = {
  invariants: {
    frameBindingValid: true,
    drawBindingValid: true,
    ownerClarificationBindingValid: true,
    replacementLedgerValid: true,
    replacementLedgerExtendsGenesis: true,
    windowPlanValid: true,
    workItemsMatchFrozenPlan: true,
    workItemDrawEntriesMatch: true,
    replacementAssignmentsRecorded: true,
    currentOccupantsMatch: true,
  },
  ledgerEntryCount: 4,
};
const GEN: GenerationState = { successfulOrganisationCount: 5, reserveConsumedCount: 4 };

function obs(
  position: number,
  patch: Partial<CompletedWorkObservation> = {},
): CompletedWorkObservation {
  const item = WINDOW_V1_WORK_ITEMS[position]!;
  return {
    workItemId: item.workItemId,
    kind: item.kind,
    selectionIndex: item.selectionIndex,
    reserveRankPosition: item.reserveRankPosition,
    rawPageEvidenceCount: 30,
    runTerminalState: 'COMPLETED',
    rootTerminalReason: 'COMPLETED_WITH_CANDIDATES',
    orchestrationError: false,
    persistenceAnomaly: false,
    hostStateAnomaly: false,
    inputOrRootMismatch: false,
    ...patch,
  };
}

function run(
  patches: readonly Partial<CompletedWorkObservation>[],
  overrides: Partial<ContinuationWindowGateInput> = {},
) {
  return evaluateContinuationWindowGate({
    window: WINDOW_V1_WORK_ITEMS,
    plannedWindowSize: WINDOW_V1_SIZE,
    preflight: CLEAN_PREFLIGHT,
    generation: GEN,
    completed: patches.map((patch, i) => obs(i, patch)),
    ...overrides,
  });
}

const conditionsOf = (verdict: ReturnType<typeof run>) =>
  verdict.triggeredConditions.map((t) => t.condition);
const reason = (
  rootTerminalReason: RootTerminalReason,
  raw = 30,
): Partial<CompletedWorkObservation> => ({ rootTerminalReason, rawPageEvidenceCount: raw });
const ROBOTS = reason('ROBOTS_UNREADABLE_ROOT');
const BLOCKED = reason('ROBOTS_BLOCKED_ROOT');
const ROOT = reason('INVALID_ROOT_AUTHORITY');
const OK = {};

describe('2D-A2 continuation gate: the threshold arithmetic', () => {
  it('derives P2 = 3 and P5 = 2 for a five-item window from the strict > comparisons', () => {
    expect(strictPercentThresholdCount(5, 40)).toBe(3);
    expect(strictPercentThresholdCount(5, 30)).toBe(2);
    expect(exceedsStrictPercent(2, 5, 40)).toBe(false); // 40% is NOT > 40%
    expect(exceedsStrictPercent(3, 5, 40)).toBe(true);
    expect(exceedsStrictPercent(1, 5, 30)).toBe(false); // 20%
    expect(exceedsStrictPercent(2, 5, 30)).toBe(true); // 40%
    expect(run([]).p2PercentageThresholdCount).toBe(3);
    expect(run([]).p5LowYieldThresholdCount).toBe(2);
  });

  it('derives thresholds mechanically for other planned sizes too', () => {
    expect(strictPercentThresholdCount(10, 40)).toBe(5);
    expect(strictPercentThresholdCount(10, 30)).toBe(4);
    expect(strictPercentThresholdCount(4, 30)).toBe(2);
  });

  it('divides by the PLANNED size, never the completed count', () => {
    // One low-yield item of one completed is 20% of the planned five, not 100%.
    expect(run([{ rawPageEvidenceCount: 0 }]).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
  });
});

describe('2D-A2 continuation gate: start, continue, complete', () => {
  it('clean preflight and zero completed -> may start the first item', () => {
    const verdict = run([]);
    expect(verdict.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(verdict.mayStartNextWorkItem).toBe(true);
    expect(verdict.nextWorkItemId).toBe('R:3:0');
    expect(verdict.remainingWorkItemIds).toEqual(['R:3:0', 'R:4:1', 'R:6:2', 'R:8:3', 'P:9']);
  });

  it('walks the frozen order with no sorting', () => {
    expect(run([OK]).nextWorkItemId).toBe('R:4:1');
    expect(run([OK, OK, OK, OK]).nextWorkItemId).toBe('P:9');
  });

  it('all five clean -> WINDOW_COMPLETE, and that is not permission to start anything', () => {
    const verdict = run([OK, OK, OK, OK, OK]);
    expect(verdict.decision).toBe('WINDOW_COMPLETE');
    expect(verdict.mayStartNextWorkItem).toBe(false);
    expect(verdict.remainingWorkItemIds).toEqual([]);
    expect(verdict.triggeredConditions).toEqual([]);
  });

  it('no sixth work item can be started: an observation beyond the window is P7', () => {
    const completed = [0, 1, 2, 3, 4].map((i) => obs(i));
    const sixth = { ...obs(4), workItemId: 'P:10', selectionIndex: 10 };
    const verdict = evaluateContinuationWindowGate({
      window: WINDOW_V1_WORK_ITEMS,
      plannedWindowSize: 5,
      preflight: CLEAN_PREFLIGHT,
      generation: GEN,
      completed: [...completed, sixth],
    });
    expect(verdict.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    expect(verdict.mayStartNextWorkItem).toBe(false);
  });
});

describe('2D-A2 continuation gate: P7 invariants', () => {
  it('any false preflight invariant pauses before the first item', () => {
    for (const name of Object.keys(CLEAN_PREFLIGHT.invariants)) {
      const preflight = {
        ...CLEAN_PREFLIGHT,
        invariants: { ...CLEAN_PREFLIGHT.invariants, [name]: false },
      };
      const verdict = run([], { preflight });
      expect(verdict.decision, name).toBe('PAUSE_P7_INVARIANT_MISMATCH');
      expect(verdict.mayStartNextWorkItem).toBe(false);
    }
  });

  it('reordered, skipped or duplicated items are P7', () => {
    const reordered = evaluateContinuationWindowGate({
      window: WINDOW_V1_WORK_ITEMS,
      plannedWindowSize: 5,
      preflight: CLEAN_PREFLIGHT,
      generation: GEN,
      completed: [obs(1)],
    });
    expect(reordered.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    const duplicated = evaluateContinuationWindowGate({
      window: WINDOW_V1_WORK_ITEMS,
      plannedWindowSize: 5,
      preflight: CLEAN_PREFLIGHT,
      generation: GEN,
      completed: [obs(0), obs(0)],
    });
    expect(duplicated.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });

  it('a PRIMARY observation carrying a reserve position, or a wrong position, is P7', () => {
    expect(run([OK, OK, OK, OK, { reserveRankPosition: 4 }]).decision).toBe(
      'PAUSE_P7_INVARIANT_MISMATCH',
    );
    expect(run([{ reserveRankPosition: 1 }]).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });

  it('a per-item input/root mismatch, or a planned size that is not the window length, is P7', () => {
    expect(run([{ inputOrRootMismatch: true }]).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    expect(run([], { plannedWindowSize: 4 }).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });

  it('historical Batch-02 observations are not inputs: one presented to the gate is P7', () => {
    const batch02Index5 = {
      ...obs(0),
      workItemId: 'P:5',
      kind: 'PRIMARY' as const,
      selectionIndex: 5,
      reserveRankPosition: null,
      rawPageEvidenceCount: 0,
    };
    const verdict = evaluateContinuationWindowGate({
      window: WINDOW_V1_WORK_ITEMS,
      plannedWindowSize: 5,
      preflight: CLEAN_PREFLIGHT,
      generation: GEN,
      completed: [batch02Index5],
    });
    expect(verdict.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    // And the input type has no history channel at all.
    const input: ContinuationWindowGateInput = {
      window: WINDOW_V1_WORK_ITEMS,
      plannedWindowSize: 5,
      preflight: CLEAN_PREFLIGHT,
      generation: GEN,
      completed: [],
    };
    expect(Object.keys(input).sort()).toEqual([
      'completed',
      'generation',
      'plannedWindowSize',
      'preflight',
      'window',
    ]);
  });

  it('the v4 targeted-revalidation robots history does not pre-trigger P2', () => {
    // Indices 4, 6 and 8 were all ROBOTS_UNREADABLE_ROOT under v4. A new window starts at zero.
    const verdict = run([]);
    expect(verdict.windowRobotsRefusalCount).toBe(0);
    expect(verdict.maxConsecutiveRobotsRefusals).toBe(0);
    expect(verdict.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
  });
});

describe('2D-A2 continuation gate: P1 repeated root-authority failure', () => {
  it('pauses at three consecutive', () => {
    const verdict = run([ROOT, ROOT, ROOT]);
    expect(verdict.decision).toBe('PAUSE_P1_REPEATED_ROOT_AUTHORITY_FAILURE');
    expect(verdict.maxConsecutiveRootAuthorityFailures).toBe(3);
  });

  it('does not trigger at two, nor at two-success-one', () => {
    expect(conditionsOf(run([ROOT, ROOT]))).not.toContain('P1');
    const verdict = run([ROOT, ROOT, OK, ROOT]);
    expect(conditionsOf(verdict)).not.toContain('P1');
    expect(verdict.trailingP1Count).toBe(1);
  });
});

describe('2D-A2 continuation gate: P2 robots refusal / unreadability', () => {
  it('pauses on three consecutive (blocked and unreadable both count)', () => {
    const verdict = run([ROBOTS, BLOCKED, ROBOTS]);
    expect(verdict.decision).toBe('PAUSE_P2_ROBOTS_REFUSAL');
    expect(
      verdict.triggeredConditions.filter((t) => t.condition === 'P2').map((t) => t.arm),
    ).toHaveLength(2);
  });

  it('does NOT pause at 2 of 5 (40% is not > 40%)', () => {
    const verdict = run([ROBOTS, OK, ROBOTS]);
    expect(conditionsOf(verdict)).not.toContain('P2');
    expect(verdict.windowRobotsRefusalCount).toBe(2);
    expect(verdict.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
  });

  it('DOES pause at 3 of 5 even when non-consecutive (percentage arm only)', () => {
    const verdict = run([ROBOTS, ROBOTS, OK, ROBOTS]);
    expect(verdict.decision).toBe('PAUSE_P2_ROBOTS_REFUSAL');
    expect(verdict.maxConsecutiveRobotsRefusals).toBe(2);
    const p2 = verdict.triggeredConditions.filter((t) => t.condition === 'P2');
    expect(p2).toHaveLength(1);
    expect(p2[0]!.arm).toMatch(/3 of 5 planned items/);
  });
});

describe('2D-A2 continuation gate: P3 run failure', () => {
  it('pauses on two consecutive FAILED', () => {
    const verdict = run([{ runTerminalState: 'FAILED' }, { runTerminalState: 'FAILED' }]);
    expect(verdict.decision).toBe('PAUSE_P3_CONSECUTIVE_RUN_FAILURE');
  });

  it('does not pause consecutively on FAILED, COMPLETED, FAILED', () => {
    const verdict = run([{ runTerminalState: 'FAILED' }, OK, { runTerminalState: 'FAILED' }]);
    expect(conditionsOf(verdict)).not.toContain('P3');
    expect(verdict.maxConsecutiveFailedRuns).toBe(1);
    expect(verdict.trailingP3FailedCount).toBe(1);
  });

  it('pauses IMMEDIATELY on any ORCHESTRATION_ERROR, distinct from the consecutive arm', () => {
    const verdict = run([{ orchestrationError: true }]);
    expect(verdict.decision).toBe('PAUSE_P3_ORCHESTRATION_ERROR');
    expect(verdict.triggeredConditions).toHaveLength(1);
  });
});

describe('2D-A2 continuation gate: P4, P8 immediate', () => {
  it('any persistence anomaly pauses immediately', () => {
    expect(run([{ persistenceAnomaly: true }]).decision).toBe('PAUSE_P4_PERSISTENCE_ANOMALY');
  });

  it('any host-state anomaly pauses immediately', () => {
    expect(run([{ hostStateAnomaly: true }]).decision).toBe('PAUSE_P8_HOST_STATE_ANOMALY');
  });
});

describe('2D-A2 continuation gate: P5 low raw yield (surrogate: raw < 4)', () => {
  it('does not pause at 1 of 5', () => {
    expect(run([{ rawPageEvidenceCount: 0 }, OK, OK]).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
  });

  it('pauses at 2 of 5', () => {
    const verdict = run([{ rawPageEvidenceCount: 3 }, OK, { rawPageEvidenceCount: 0 }]);
    expect(verdict.decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
    expect(verdict.windowLowYieldCount).toBe(2);
  });

  it('treats 3 as low and 4 as not (and 4 is NOT an SD9 success claim)', () => {
    expect(run([{ rawPageEvidenceCount: 4 }, { rawPageEvidenceCount: 4 }]).decision).toBe(
      'CONTINUE_TO_NEXT_WORK_ITEM',
    );
    expect(run([{ rawPageEvidenceCount: 3 }, { rawPageEvidenceCount: 3 }]).decision).toBe(
      'PAUSE_P5_LOW_RAW_YIELD',
    );
  });

  it('reproduces the Batch-02 worked examples, re-expressed as window items', () => {
    const counts = (values: number[]) =>
      run(values.map((rawPageEvidenceCount) => ({ rawPageEvidenceCount })));
    expect(counts([0]).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(counts([0, 0]).decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
    expect(counts([20, 0, 15]).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(counts([20, 0, 15, 0]).decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
    expect(counts([20, 14, 0, 9]).mayStartNextWorkItem).toBe(true);
    expect(counts([20, 14, 0, 9, 0]).decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
  });
});

describe('2D-A2 continuation gate: P6 generation-global reserve usage', () => {
  const at = (reserveConsumedCount: number, successfulOrganisationCount: number) =>
    run([], {
      generation: { reserveConsumedCount, successfulOrganisationCount },
      preflight: { ...CLEAN_PREFLIGHT, ledgerEntryCount: reserveConsumedCount },
    });

  it('10 reserves / 5 successes -> no P6', () => {
    expect(at(10, 5).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
  });

  it('11 reserves / 49 successes -> P6', () => {
    expect(at(11, 49).decision).toBe('PAUSE_P6_UNEXPECTED_RESERVE_USAGE');
  });

  it('11 reserves / 50 successes -> no P6', () => {
    expect(at(11, 50).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
  });

  it('the current state after the four planned assignments does not fire it', () => {
    expect(at(4, 5).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
  });
});

describe('2D-A2 continuation gate: simultaneous triggers, precedence and stickiness', () => {
  it('reports EVERY simultaneous trigger, in the frozen reporting precedence', () => {
    const verdict = run(
      [
        { ...ROBOTS, rawPageEvidenceCount: 0, runTerminalState: 'FAILED' },
        {
          ...ROBOTS,
          rawPageEvidenceCount: 0,
          runTerminalState: 'FAILED',
          persistenceAnomaly: true,
          hostStateAnomaly: true,
          orchestrationError: true,
          inputOrRootMismatch: true,
        },
        { ...ROBOTS, rawPageEvidenceCount: 0 },
      ],
      {
        generation: { reserveConsumedCount: 11, successfulOrganisationCount: 5 },
        preflight: { ...CLEAN_PREFLIGHT, ledgerEntryCount: 11 },
      },
    );
    expect(verdict.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    expect(verdict.mayStartNextWorkItem).toBe(false);
    expect([...new Set(verdict.triggeredConditions.map((t) => t.decision))]).toEqual([
      'PAUSE_P7_INVARIANT_MISMATCH',
      'PAUSE_P4_PERSISTENCE_ANOMALY',
      'PAUSE_P8_HOST_STATE_ANOMALY',
      'PAUSE_P3_ORCHESTRATION_ERROR',
      'PAUSE_P2_ROBOTS_REFUSAL',
      'PAUSE_P3_CONSECUTIVE_RUN_FAILURE',
      'PAUSE_P6_UNEXPECTED_RESERVE_USAGE',
      'PAUSE_P5_LOW_RAW_YIELD',
    ]);
  });

  it('P1 is reported ahead of P2, and P6 ahead of P5', () => {
    const verdict = run([
      { ...ROOT, rawPageEvidenceCount: 0 },
      { ...ROOT, rawPageEvidenceCount: 0 },
      { ...ROOT, rawPageEvidenceCount: 0 },
    ]);
    expect(verdict.decision).toBe('PAUSE_P1_REPEATED_ROOT_AUTHORITY_FAILURE');
    expect(conditionsOf(verdict)).toEqual(['P1', 'P5']);
    const p6p5 = run([{ rawPageEvidenceCount: 0 }, { rawPageEvidenceCount: 0 }], {
      generation: { reserveConsumedCount: 11, successfulOrganisationCount: 5 },
      preflight: { ...CLEAN_PREFLIGHT, ledgerEntryCount: 11 },
    });
    expect(p6p5.decision).toBe('PAUSE_P6_UNEXPECTED_RESERVE_USAGE');
    expect(conditionsOf(p6p5)).toEqual(['P6', 'P5']);
  });

  it('a pause is sticky: later clean items never restore permission', () => {
    const low = { rawPageEvidenceCount: 0 };
    const sequences = [
      [low, low],
      [low, low, OK],
      [low, low, OK, OK],
      [low, low, OK, OK, OK],
    ];
    for (const sequence of sequences) {
      const verdict = run(sequence);
      expect(verdict.decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
      expect(verdict.mayStartNextWorkItem).toBe(false);
    }
    for (const trigger of [
      { hostStateAnomaly: true },
      { persistenceAnomaly: true },
      { orchestrationError: true },
    ]) {
      expect(run([trigger, OK, OK]).mayStartNextWorkItem).toBe(false);
      expect(run([trigger, OK, OK, OK, OK]).mayStartNextWorkItem).toBe(false);
    }
  });
});

// ===========================================================================
// 9. THE HISTORICAL BATCH-02 GATE IS UNTOUCHED
// ===========================================================================

describe('2D-A2 continuation: the historical Batch-02 gate stays historical', () => {
  it('its two modules are byte-identical to the bytes the strategy bound', () => {
    expect(sha256(readText('src/test/harness/phase2b2d/acquisitionGate/gateContract.ts'))).toBe(
      '5ccdb98d90c1d3373e834b8057607bf2bb775c8e4d052854fa98a19f7fcf1067',
    );
    expect(sha256(readText('src/test/harness/phase2b2d/acquisitionGate/betweenRunGate.ts'))).toBe(
      '43f751b1c695638d542c4e88d55f60b80953385850d5d39ae36fe667fcb35737',
    );
  });

  it('still authorises exactly [5,6,7,8,9] and still reads PAUSE_P5 on its recorded state', () => {
    expect([...BATCH_02_SELECTION_INDICES]).toEqual([5, 6, 7, 8, 9]);
    // Batch 02's execution record: indices 5 and 6 both yielded 0 raw pages.
    const verdict = evaluateP5OverRawCounts([0, 0]);
    expect(verdict.decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
    expect(verdict.mayStartNextOrganisation).toBe(false);
    expect(evaluateBetweenRunGate({ completedRuns: [] }).decision).toBe('CONTINUE');
  });
});

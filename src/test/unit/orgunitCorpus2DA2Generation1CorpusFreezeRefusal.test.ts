/**
 * The Generation-1 terminal: CORPUS_FREEZE_REFUSED because the complete current
 * Q1 [75, 76] needs reserve positions 39..40 and only position 39 remains.
 *
 * Reads the COMMITTED draw, ledger and terminal record. Opens no socket and no
 * database, and never writes the ledger: the 40-entry ledger in (C) exists in
 * memory only.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readVerifiedDraw } from '../harness/phase2b2d/continuationWindow/materialiseContinuationArtifacts.js';
import { prepareReplacementAppend } from '../harness/phase2b2d/continuationWindow/replacementAppend.js';
import {
  currentOccupantForSelectionIndex,
  recomputeLedgerHash,
  reserveConsumedCount,
  type ReplacementLedger,
} from '../harness/phase2b2d/continuationWindow/replacementLedger.js';
import {
  ReserveExhausted,
  planPendingReplacementObligations,
} from '../harness/phase2b2d/continuationWindow/replacementPlanner.js';
import {
  REPLACEMENT_LEDGER_PATH,
  RESERVE_COUNT,
} from '../harness/phase2b2d/continuationWindow/windowContract.js';

const REPO = resolve(import.meta.dirname, '../../..');
const RECORD_PATH = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION1_CORPUS_FREEZE_REFUSAL_V1.json';
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const DRAW = readVerifiedDraw(REPO);
const LEDGER_TEXT = read(REPLACEMENT_LEDGER_PATH);
const LEDGER = JSON.parse(LEDGER_TEXT) as ReplacementLedger;
const RECORD = JSON.parse(read(RECORD_PATH)) as Record<string, unknown> & {
  bound: Record<string, { path: string; sha256: string }>;
};
const Q1 = [75, 76];

describe('Phase 2B-2D A2 Generation-1 CORPUS_FREEZE_REFUSED', () => {
  it('binds the committed 39-entry ledger, the unchanged planner and R3', () => {
    expect(LEDGER.entries).toHaveLength(39);
    expect(recomputeLedgerHash(LEDGER)).toBe(
      'a5a60d7e02faa831d38bab131a42e94f80203989989276393216fdc814623e18',
    );
    expect(reserveConsumedCount(DRAW, LEDGER)).toBe(39);
    for (const key of ['methodologyR3', 'replacementPlanner', 'ownerReserveOrderClarification']) {
      const binding = RECORD.bound[key]!;
      expect(sha256(read(binding.path))).toBe(binding.sha256);
    }
  });

  it('(A) 39 consumed + Q1 [75, 76] -> ReserveExhausted / CORPUS_FREEZE_REFUSED', () => {
    expect(() => planPendingReplacementObligations(DRAW, LEDGER, Q1)).toThrow(ReserveExhausted);
    expect(() => planPendingReplacementObligations(DRAW, LEDGER, Q1)).toThrow(
      /CORPUS_FREEZE_REFUSED: 2 obligations need positions 39\.\.40, beyond the last reserve position 39/,
    );
  });

  it('(B) 39 consumed + [75] alone would be assignable to reserve 39', () => {
    expect(planPendingReplacementObligations(DRAW, LEDGER, [75])).toEqual([
      { selectionIndex: 75, reserveRankPosition: 39 },
    ]);
  });

  it('(C) 40 consumed + any non-empty obligation -> refusal', () => {
    const forty = prepareReplacementAppend({
      draw: DRAW,
      ledger: LEDGER,
      assignments: [
        {
          selectionIndex: 75,
          reserveRankPosition: 39,
          reason: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
        },
      ],
      recordedAtUtc: '2099-01-01T00:00:00Z', // hypothetical, after every real entry
    }).nextLedger;
    expect(reserveConsumedCount(DRAW, forty)).toBe(RESERVE_COUNT);
    for (const pending of [[75], [76], [75, 76], [77]]) {
      expect(() => planPendingReplacementObligations(DRAW, forty, pending)).toThrow(
        /CORPUS_FREEZE_REFUSED/,
      );
    }
    // In memory only: the committed ledger is untouched.
    expect(read(REPLACEMENT_LEDGER_PATH)).toBe(LEDGER_TEXT);
  });

  it('(D) the terminal decision does not append reserve 39', () => {
    expect(LEDGER.entries.some((entry) => entry.reserveRankPosition === 39)).toBe(false);
    expect(LEDGER.entries.some((entry) => entry.sequence === 39)).toBe(false);
    expect(sha256(LEDGER_TEXT)).toBe(RECORD.bound.replacementLedger!.sha256);
    expect(RECORD.reserve39Assigned).toBe(false);
    expect(RECORD.newAcquisitionAuthorityGranted).toBe(false);
    expect(RECORD.plannerResult).toBe('CORPUS_FREEZE_REFUSED');
    expect(RECORD.corpusFreezeStatus).toBe('REFUSED');
  });

  it('(E) the final canonical state stays 75 / [75, 76] / [] / 77..109', () => {
    expect(RECORD.finalGeneration1State).toMatchObject({
      ACQUISITION_SUCCESSFUL: 75,
      CURRENT_ACQUISITION_FAILURE: Q1,
      PENDING_CAPABILITY_REVIEW: [],
      NEVER_STARTED: { from: 77, to: 109, count: 33 },
    });
    expect(75 + Q1.length + 0 + 33).toBe(110);
    const slot75 = currentOccupantForSelectionIndex(DRAW, LEDGER, 75);
    expect([slot75.occupantKind, slot75.reserveRankPosition]).toEqual(['RESERVE_REPLACEMENT', 38]);
    expect(currentOccupantForSelectionIndex(DRAW, LEDGER, 76).occupantKind).toBe(
      'ORIGINAL_SELECTION',
    );
    for (let index = 77; index <= 109; index++) {
      expect(LEDGER.entries.some((entry) => entry.selectionIndex === index)).toBe(false);
    }
  });
});

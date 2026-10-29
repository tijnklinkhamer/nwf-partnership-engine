/**
 * THE PENDING REPLACEMENT-OBLIGATION PLANNER (Owner Clarification Q1).
 *
 *   1. collect the pending replacement obligations (failed selection slots);
 *   2. sort them by selectionIndex ASCENDING;
 *   3. nextReservePosition = the first reserve rank position not consumed by
 *      the validated ledger prefix (entry k consumed position k, so this is
 *      the entry count);
 *   4. assign positions monotonically to the sorted obligations.
 *
 * The planner reads NOTHING that could steer an assignment: not an
 * institution identity, a country, a hostname, a URL, a failure reason, a
 * split or an expected yield. Its inputs are selection indices and the
 * validated ledger's length. Only AFTER a position is assigned may a caller
 * look up the draw entry at that position, mechanically.
 *
 * It never inserts into an already-precommitted window: a later obligation
 * is planned for a LATER window, under new owner authority.
 *
 * THIS MODULE IS PURE.
 */

import {
  requireValidLedger,
  type DrawForLedger,
  type ReplacementLedger,
} from './replacementLedger.js';
import { RESERVE_COUNT, RESERVE_EXHAUSTION_REFUSAL, SELECTION_COUNT } from './windowContract.js';

export interface PlannedReplacementAssignment {
  readonly selectionIndex: number;
  readonly reserveRankPosition: number;
}

export class ReserveExhausted extends Error {
  readonly refusal = RESERVE_EXHAUSTION_REFUSAL;
  constructor(message: string) {
    super(`${RESERVE_EXHAUSTION_REFUSAL}: ${message}`);
    this.name = 'ReserveExhausted';
  }
}

export function planPendingReplacementObligations(
  draw: DrawForLedger,
  ledger: ReplacementLedger,
  pendingSelectionIndices: readonly number[],
): PlannedReplacementAssignment[] {
  const consumed = requireValidLedger(draw, ledger);

  const seen = new Set<number>();
  for (const index of pendingSelectionIndices) {
    if (!Number.isInteger(index) || index < 0 || index >= SELECTION_COUNT) {
      throw new Error(`pending selection index ${String(index)} is not a frozen selection slot`);
    }
    if (seen.has(index)) {
      throw new Error(`pending selection index ${String(index)} is listed twice`);
    }
    seen.add(index);
  }

  const sorted = [...pendingSelectionIndices].sort((a, b) => a - b);
  if (consumed + sorted.length > RESERVE_COUNT) {
    throw new ReserveExhausted(
      `${String(sorted.length)} obligations need positions ${String(consumed)}..${String(consumed + sorted.length - 1)}, beyond the last reserve position ${String(RESERVE_COUNT - 1)}`,
    );
  }
  return sorted.map((selectionIndex, offset) => ({
    selectionIndex,
    reserveRankPosition: consumed + offset,
  }));
}

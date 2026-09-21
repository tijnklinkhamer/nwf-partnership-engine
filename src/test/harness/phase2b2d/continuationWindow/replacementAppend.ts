/**
 * PRE-NETWORK LEDGER APPEND PREPARATION - FOR THE LATER LIVE AUTHORITY ONLY.
 *
 * Given a validated ledger, the frozen draw, the approved assignments and an
 * explicit `recordedAtUtc` SUPPLIED BY THE CALLER, this builds the
 * prospective next ledger revision in memory and proves it valid. It reads
 * no clock and writes nothing: persisting the result, committing it and
 * pushing it BEFORE any institution network is the live authority's act.
 *
 * This implementation never calls it against the canonical ledger.
 *
 * THIS MODULE IS PURE.
 */

import {
  computeEntryHash,
  computeLedgerHash,
  requireValidLedger,
  type DrawForLedger,
  type ReplacementLedger,
  type ReplacementLedgerEntry,
  type ReplacementLedgerEntryPayload,
} from './replacementLedger.js';
import { planPendingReplacementObligations } from './replacementPlanner.js';
import { REPLACEMENT_REASONS, type ReplacementReason } from './windowContract.js';

export interface ApprovedReplacementAssignment {
  readonly selectionIndex: number;
  readonly reserveRankPosition: number;
  readonly reason: ReplacementReason;
}

export interface PreparedReplacementAppend {
  readonly previousLedgerHash: string;
  readonly nextLedger: ReplacementLedger;
  readonly nextLedgerHash: string;
  readonly appendedEntryHashes: readonly string[];
  readonly reserveConsumedBefore: number;
  readonly reserveConsumedAfter: number;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

export function prepareReplacementAppend(input: {
  readonly draw: DrawForLedger;
  readonly ledger: ReplacementLedger;
  readonly assignments: readonly ApprovedReplacementAssignment[];
  readonly recordedAtUtc: string;
}): PreparedReplacementAppend {
  const { draw, ledger, assignments, recordedAtUtc } = input;
  const before = requireValidLedger(draw, ledger);
  if (!ISO_UTC.test(recordedAtUtc)) {
    throw new Error(
      'recordedAtUtc must be an explicit ISO-8601 UTC instant supplied by the caller',
    );
  }
  if (assignments.length === 0) throw new Error('nothing to append');

  // The approved assignments must be EXACTLY what the frozen planner derives:
  // ascending selection index, next unused positions, no manual reordering.
  const planned = planPendingReplacementObligations(
    draw,
    ledger,
    assignments.map((assignment) => assignment.selectionIndex),
  );
  assignments.forEach((assignment, i) => {
    const expected = planned[i]!;
    if (
      assignment.selectionIndex !== expected.selectionIndex ||
      assignment.reserveRankPosition !== expected.reserveRankPosition
    ) {
      throw new Error(
        `assignment ${String(i)} (slot ${String(assignment.selectionIndex)} -> position ${String(assignment.reserveRankPosition)}) is not the planner's (slot ${String(expected.selectionIndex)} -> position ${String(expected.reserveRankPosition)})`,
      );
    }
    if (!(REPLACEMENT_REASONS as readonly string[]).includes(assignment.reason)) {
      throw new Error(`assignment ${String(i)} carries a reason outside the frozen vocabulary`);
    }
  });

  const entries: ReplacementLedgerEntry[] = [...ledger.entries];
  const appended: string[] = [];
  for (const assignment of assignments) {
    const sequence = entries.length;
    let prior: ReplacementLedgerEntry | undefined;
    for (const entry of entries) {
      if (entry.selectionIndex === assignment.selectionIndex) prior = entry;
    }
    const slot = draw.selection[assignment.selectionIndex]!;
    const reserve = draw.reserve[assignment.reserveRankPosition]!;
    const payload: ReplacementLedgerEntryPayload = {
      sequence,
      selectionIndex: assignment.selectionIndex,
      split: slot.split,
      replacedEcheRowKey: prior === undefined ? slot.echeRowKey : prior.replacementEcheRowKey,
      replacementEcheRowKey: reserve.echeRowKey,
      reserveRankPosition: assignment.reserveRankPosition,
      reason: assignment.reason,
      recordedAtUtc,
      replacedOccupantKind: prior === undefined ? 'ORIGINAL_SELECTION' : 'RESERVE_REPLACEMENT',
      previousSequenceForSlot: prior === undefined ? null : prior.sequence,
      previousEntryHash: sequence === 0 ? null : entries[sequence - 1]!.entryHash,
    };
    const entryHash = computeEntryHash(payload);
    entries.push({ ...payload, entryHash });
    appended.push(entryHash);
  }

  const withoutHash = { ...ledger, entries } as Record<string, unknown>;
  delete withoutHash.ledgerHash;
  const nextLedgerHash = computeLedgerHash(withoutHash as Omit<ReplacementLedger, 'ledgerHash'>);
  const nextLedger = {
    ...(withoutHash as Omit<ReplacementLedger, 'ledgerHash'>),
    ledgerHash: nextLedgerHash,
  };
  const after = requireValidLedger(draw, nextLedger);

  return {
    previousLedgerHash: ledger.ledgerHash,
    nextLedger,
    nextLedgerHash,
    appendedEntryHashes: appended,
    reserveConsumedBefore: before,
    reserveConsumedAfter: after,
  };
}

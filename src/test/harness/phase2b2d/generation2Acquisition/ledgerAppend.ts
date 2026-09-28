/**
 * GENERATION-2 PRE-NETWORK LEDGER APPEND PREPARATION - the Generation-2
 * equivalent of the landed Generation-1 `prepareReplacementAppend`. PURE.
 *
 * It builds the prospective next ledger revision IN MEMORY and proves it
 * valid. It reads no clock (the caller supplies `recordedAtUtc`), writes no
 * file, opens no database and no socket. Persisting, committing and pushing
 * the result BEFORE any institution network is a future live authority's act;
 * this implementation never writes the canonical Generation-2 ledger.
 *
 * IT DOES NOT TRUST THE ASSIGNMENT LIST
 *
 *   The Q1 plan is recomputed here over the COMPLETE current obligation set
 *   (every current failure - carried, or produced by a committed adjudicated
 *   window - that no unadjudicated entry has assigned), by this
 *   namespace AND by the landed frozen Generation-2 planner, which must agree.
 *   The approved assignments must then be EXACTLY that plan: same length (a
 *   partial assignment refuses), same order (a reversed one refuses), same
 *   positions (a skipped or reordered reserve refuses), and each reason must
 *   be the slot's committed terminal replacement reason.
 */

import type { ReplacementReason } from '../continuationWindow/windowContract.js';
import type { Generation2LedgerEntry } from '../generation2/generation2Ledger.js';
import {
  EMPTY_GENERATION2_HISTORY,
  type Generation2AdjudicationHistory,
} from '../generation2History/adjudicationHistory.js';
import { buildReserveExecutionBinding, executionEntrySha256 } from './executionBinding.js';
import { refuse } from './operationalContract.js';
import {
  computeEntryHash,
  requireValidOperationalLedger,
  resolveCrossGenerationOccupant,
  withEntries,
  type OperationalGeneration2Ledger,
} from './operationalLedger.js';
import {
  deriveGeneration2CurrentState,
  planCompleteQ1,
  type Generation2CurrentState,
  type Generation2OperationalBasis,
} from './state.js';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

export interface ApprovedGeneration2Assignment {
  readonly selectionIndex: number;
  readonly generation2ReserveRankPosition: number;
  readonly reason: ReplacementReason;
}

export interface PreparedGeneration2Append {
  readonly previousLedgerHash: string;
  readonly previousEntryCount: number;
  readonly nextLedger: OperationalGeneration2Ledger;
  readonly nextLedgerHash: string;
  readonly appendedEntries: readonly Generation2LedgerEntry[];
  readonly appendedEntryHashes: readonly string[];
  /** executionEntrySha256 of each appended reserve's frozen-frame execution binding. */
  readonly appendedExecutionEntrySha256: readonly string[];
  readonly reserveConsumedBefore: number;
  readonly reserveConsumedAfter: number;
  readonly stateBefore: Generation2CurrentState;
  readonly stateAfter: Generation2CurrentState;
}

export function prepareGeneration2ReplacementAppend(input: {
  readonly basis: Generation2OperationalBasis;
  readonly ledger: OperationalGeneration2Ledger;
  readonly assignments: readonly ApprovedGeneration2Assignment[];
  readonly recordedAtUtc: string;
  /** The committed adjudicated windows so far, in order. Default: none. */
  readonly history?: Generation2AdjudicationHistory;
}): PreparedGeneration2Append {
  const { basis, ledger, assignments, recordedAtUtc } = input;
  const history = input.history ?? EMPTY_GENERATION2_HISTORY;
  const before = requireValidOperationalLedger(basis, ledger);
  if (typeof recordedAtUtc !== 'string' || !ISO_UTC.test(recordedAtUtc)) {
    refuse('RECORDED_AT_NOT_EXPLICIT', 'recordedAtUtc must be an explicit ISO-8601 UTC instant');
  }
  const lastRecordedAt = ledger.entries.at(-1)?.recordedAtUtc;
  if (lastRecordedAt !== undefined && recordedAtUtc < lastRecordedAt) {
    refuse('RECORDED_AT_BACKWARDS', 'recordedAtUtc precedes the last ledger entry');
  }

  const stateBefore = deriveGeneration2CurrentState(basis, ledger, history);
  const planned = planCompleteQ1(basis, ledger, history);
  if (planned.length === 0) refuse('NOTHING_TO_APPEND', 'Q1 is empty');
  if (assignments.length !== planned.length) {
    refuse(
      'Q1_INCOMPLETE',
      `${String(assignments.length)} assignments for ${String(planned.length)} pending obligations; Q1 assigns every obligation at once`,
    );
  }
  assignments.forEach((assignment, i) => {
    const expected = planned[i]!;
    if (
      assignment.selectionIndex !== expected.selectionIndex ||
      assignment.generation2ReserveRankPosition !== expected.generation2ReserveRankPosition
    ) {
      refuse(
        'ASSIGNMENT_NOT_Q1',
        `assignment ${String(i)} (slot ${String(assignment.selectionIndex)} -> Generation-2 position ${String(assignment.generation2ReserveRankPosition)}) is not Q1's (slot ${String(expected.selectionIndex)} -> position ${String(expected.generation2ReserveRankPosition)})`,
      );
    }
    if (assignment.reason !== expected.reason) {
      refuse(
        'ASSIGNMENT_REASON_MISMATCH',
        `assignment ${String(i)}: reason is not the slot's committed reason`,
      );
    }
  });

  const entries: Generation2LedgerEntry[] = [...ledger.entries];
  const appended: Generation2LedgerEntry[] = [];
  const executionDigests: string[] = [];
  for (const assignment of assignments) {
    const sequence = entries.length;
    const binding = buildReserveExecutionBinding(
      basis.frameIndex,
      basis.schedule,
      assignment.generation2ReserveRankPosition,
    );
    const occupant = resolveCrossGenerationOccupant(
      basis,
      withEntries(basis.genesis, entries),
      assignment.selectionIndex,
    );
    const payload: Omit<Generation2LedgerEntry, 'entryHash'> = {
      sequence,
      selectionIndex: assignment.selectionIndex,
      split: occupant.split,
      replacedEcheRowKey: occupant.echeRowKey,
      replacementEcheRowKey: binding.echeRowKey,
      generation2ReserveRankPosition: assignment.generation2ReserveRankPosition,
      reason: assignment.reason,
      recordedAtUtc,
      replacedOccupantKind: occupant.kind,
      previousSequenceForSlot: occupant.generation2LedgerSequence,
      previousEntryHash: sequence === 0 ? null : entries[sequence - 1]!.entryHash,
    };
    const entry = { ...payload, entryHash: computeEntryHash(payload) };
    entries.push(entry);
    appended.push(entry);
    executionDigests.push(executionEntrySha256(binding));
  }

  const nextLedger = withEntries(basis.genesis, entries);
  const after = requireValidOperationalLedger(basis, nextLedger);
  const stateAfter = deriveGeneration2CurrentState(basis, nextLedger, history);
  if (stateAfter.q1.length !== 0) refuse('Q1_NOT_DISCHARGED', 'the append left an obligation');
  return {
    previousLedgerHash: ledger.ledgerHash,
    previousEntryCount: before,
    nextLedger,
    nextLedgerHash: nextLedger.ledgerHash,
    appendedEntries: appended,
    appendedEntryHashes: appended.map((entry) => entry.entryHash),
    appendedExecutionEntrySha256: executionDigests,
    reserveConsumedBefore: before,
    reserveConsumedAfter: after,
    stateBefore,
    stateAfter,
  };
}

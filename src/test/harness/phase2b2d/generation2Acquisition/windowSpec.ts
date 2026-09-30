/**
 * THE GENERATION-2 BOUNDED WINDOW SPEC: the prospective window, derived - not
 * chosen - from the frozen state. PURE.
 *
 *   inputs   the operational basis (frozen frame, draw, Generation-1 terminal
 *            and ledger, frozen schedule, re-derived carry-forward) and the
 *            STARTING Generation-2 ledger revision
 *   members  every CARRY-IN replacement (a slot already ASSIGNED in the
 *            starting revision, on its exact ledger occupant: no Q1, no new
 *            entry), every Q1 replacement (ascending slot, positions from the
 *            ledger's next unused one) - the whole group in ledger-sequence
 *            order - and the lowest-index NEVER_STARTED original primaries,
 *            ascending, until the planned size is reached. Every replacement
 *            obligation must fit (REPLACEMENT_OBLIGATIONS_EXCEED_WINDOW); the
 *            append holds ONLY the Q1 entries. With no carry-in the spec is
 *            unchanged byte for byte
 *   order    by default every replacement first, then the primaries; ONLY a
 *            verified, pinned owner cadence decision for this exact window
 *            (generation2Cadence/windowCadence.ts) puts the SAME members in
 *            primaries-first order, and only then does the spec carry an
 *            `executionCadence` block - a default spec is unchanged byte for byte
 *   ids      `G2R:<slot>:<Gen-2 position>` / `G2P:<slot>`
 *   identity a replacement binds `executionEntrySha256` of its frozen-frame
 *            execution binding; a primary binds `drawEntrySha256` of its
 *            exact original draw selection entry (cross-checked to the frame)
 *
 * The spec names no institution: identities appear only as digests.
 *
 * The spec is PROSPECTIVE and authorises nothing. It is what a later owner
 * authority would precommit; the P7 preflight re-derives it from committed
 * bytes and requires canonical equality.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  P2_BATCH_PERCENT_STRICTLY_ABOVE,
  P5_BATCH_PERCENT_STRICTLY_ABOVE,
  strictPercentThresholdCount,
  type ReplacementReason,
} from '../continuationWindow/windowContract.js';
import type { Split } from '../draw/drawContract.js';
import type { Generation2ReplacedOccupantKind } from '../generation2/generation2Ledger.js';
import {
  EMPTY_GENERATION2_HISTORY,
  historyBindingOf,
  replayGeneration2History,
  type Generation2AdjudicationHistory,
} from '../generation2History/adjudicationHistory.js';
import {
  DEFAULT_WINDOW_EXECUTION_CADENCE,
  orderByCadence,
  verifyWindowCadenceAuthority,
  type WindowCadenceAuthorityBinding,
  type WindowExecutionCadenceBlock,
} from '../generation2Cadence/windowCadence.js';
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
  executionEntrySha256,
} from './executionBinding.js';
import {
  CANONICAL_SCHEDULE_HASH,
  DRAW_HASH,
  FRAME_HASH,
  FROZEN_SCHEDULE_HASH,
  GENERATION1_LEDGER_HASH,
  GENERATION2_ID,
  GENERATION2_LEDGER_PATH,
  GENESIS_LEDGER_HASH,
  PINNED,
  generation2PrimaryWorkItemId,
  generation2ReplacementWorkItemId,
  refuse,
} from './operationalContract.js';
import {
  resolveCrossGenerationOccupant,
  withEntries,
  type FileRef,
  type OperationalGeneration2Ledger,
} from './operationalLedger.js';
import {
  deriveGeneration2CurrentState,
  planCompleteQ1,
  type Generation2OperationalBasis,
} from './state.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export const WINDOW_SPEC_SCHEMA = 'GENERATION2_BOUNDED_WINDOW_SPEC_V1';
export const REPLACEMENT_IDENTITY_KIND = 'GENERATION2_EXECUTION_ENTRY_SHA256';
export const PRIMARY_IDENTITY_KIND = 'ORIGINAL_DRAW_SELECTION_ENTRY_SHA256';

export type Generation2HistoryBinding = ReturnType<typeof historyBindingOf>;

export interface Generation2WindowWorkItem {
  readonly order: number;
  readonly kind: 'REPLACEMENT' | 'PRIMARY';
  readonly workItemId: string;
  readonly selectionIndex: number;
  readonly generation2ReserveRankPosition: number | null;
  readonly split: Split;
  readonly replacementReason: ReplacementReason | null;
  readonly replacesOccupantKind: Generation2ReplacedOccupantKind | null;
  readonly identityDigestKind: typeof REPLACEMENT_IDENTITY_KIND | typeof PRIMARY_IDENTITY_KIND;
  readonly identityDigest: string;
  readonly rootAuthorityCount: number;
}

export interface PlannedReplacementEntry {
  readonly sequence: number;
  readonly selectionIndex: number;
  readonly generation2ReserveRankPosition: number;
  readonly split: Split;
  readonly reason: ReplacementReason;
  readonly replacedOccupantKind: Generation2ReplacedOccupantKind;
  readonly previousSequenceForSlot: number | null;
}

export interface Generation2PlanningState {
  readonly successfulOrganisationCount: number;
  readonly currentAcquisitionFailure: readonly number[];
  readonly replacementAssignedAwaitingExecution: readonly number[];
  readonly pendingCapabilityReview: readonly number[];
  readonly neverStartedCount: number;
  readonly neverStartedFrom: number | null;
  readonly neverStartedTo: number | null;
  readonly carryForwardRefused: readonly number[];
  readonly q1: readonly number[];
  readonly generation2ReserveConsumed: number;
  readonly nextGeneration2ReservePosition: number;
}

export interface StartingLedgerBinding {
  readonly path: string;
  readonly fileSha256: string;
  readonly bytes: number;
  readonly ledgerHash: string;
  readonly entryCount: number;
}

export interface Generation2WindowSpec {
  readonly schema: typeof WINDOW_SPEC_SCHEMA;
  readonly generationId: string;
  readonly isLiveAuthority: false;
  readonly thisSpecAuthorises: readonly string[];
  readonly bound: Readonly<Record<string, FileRef>>;
  readonly frozenHashes: Readonly<Record<string, string>>;
  readonly startingLedger: StartingLedgerBinding;
  readonly planningState: Generation2PlanningState;
  readonly plannedWindowSize: number;
  readonly plannedReplacementAppend: readonly PlannedReplacementEntry[];
  readonly workItems: readonly Generation2WindowWorkItem[];
  readonly gateThresholds: {
    readonly p2RobotsRefusalWindowCount: number;
    readonly p5LowRawYieldWindowCount: number;
  };
  /**
   * Present ONLY when the spec was planned over a non-empty committed
   * adjudication history: its public-safe identity (paths, hashes, ordinals).
   * Absent for the first window, whose spec is unchanged byte for byte.
   */
  readonly adjudicationHistory?: Generation2HistoryBinding;
  /**
   * Present ONLY for a non-default cadence: the verified owner decision that
   * ordered this window's members primaries-first. Absent = legacy default.
   */
  readonly executionCadence?: WindowExecutionCadenceBlock;
  readonly windowSpecHash: string;
}

interface SequencedItem {
  readonly sequence: number;
  readonly item: Generation2WindowWorkItem;
}

export function recomputeWindowSpecHash(spec: Generation2WindowSpec): string {
  const clone = { ...spec } as Record<string, unknown>;
  delete clone.windowSpecHash;
  return sha256(canonicalStringify(clone));
}

export function buildGeneration2WindowSpec(input: {
  readonly basis: Generation2OperationalBasis;
  readonly startingLedger: OperationalGeneration2Ledger;
  /** SHA-256 and byte length of the starting revision's committed bytes. */
  readonly startingLedgerFile: { readonly sha256: string; readonly bytes: number };
  readonly plannedWindowSize: number;
  /** The committed adjudicated windows before this one, in order. Default: none. */
  readonly history?: Generation2AdjudicationHistory;
  /**
   * The committed owner cadence decision for THIS window (its ordinal is the
   * history length + 1). Absent: the legacy replacement-first default.
   */
  readonly cadenceAuthority?: WindowCadenceAuthorityBinding;
}): Generation2WindowSpec {
  const { basis, startingLedger, plannedWindowSize } = input;
  const history = input.history ?? EMPTY_GENERATION2_HISTORY;
  if (!Number.isInteger(plannedWindowSize) || plannedWindowSize < 1) {
    refuse('WINDOW_SIZE_INVALID', 'the planned window size is not a positive integer');
  }
  const state = deriveGeneration2CurrentState(basis, startingLedger, history);
  const q1 = planCompleteQ1(basis, startingLedger, history);
  if (q1.length > plannedWindowSize) {
    refuse(
      'Q1_EXCEEDS_WINDOW',
      'every pending obligation must be in the window it is assigned for',
    );
  }

  // Carry-in: every slot already ASSIGNED in the starting revision keeps its
  // exact ledger occupant - no Q1, no second reserve, no new entry - and stays
  // a work item until that occupant is executed and adjudicated.
  const carryIn = state.replacementAssignedAwaitingExecution.map((selectionIndex) => {
    const entry = startingLedger.entries.findLast((e) => e.selectionIndex === selectionIndex);
    const occupant = resolveCrossGenerationOccupant(basis, startingLedger, selectionIndex);
    if (
      entry === undefined ||
      occupant.kind !== 'GENERATION2_RESERVE_REPLACEMENT' ||
      occupant.generation2LedgerSequence !== entry.sequence ||
      occupant.generation2ReserveRankPosition !== entry.generation2ReserveRankPosition
    ) {
      refuse(
        'CARRY_IN_OCCUPANT_NOT_IN_LEDGER',
        `assigned slot ${String(selectionIndex)} has no current Generation-2 ledger occupant`,
      );
    }
    return entry;
  });
  if (carryIn.length + q1.length > plannedWindowSize) {
    refuse(
      'REPLACEMENT_OBLIGATIONS_EXCEED_WINDOW',
      'every carry-in assigned replacement and every Q1 obligation must be in the window',
    );
  }
  const carryInItems = carryIn.map((entry): SequencedItem => {
    const binding = buildReserveExecutionBinding(
      basis.frameIndex,
      basis.schedule,
      entry.generation2ReserveRankPosition,
    );
    return {
      sequence: entry.sequence,
      item: {
        order: 0,
        kind: 'REPLACEMENT',
        workItemId: generation2ReplacementWorkItemId(
          entry.selectionIndex,
          entry.generation2ReserveRankPosition,
        ),
        selectionIndex: entry.selectionIndex,
        generation2ReserveRankPosition: entry.generation2ReserveRankPosition,
        split: entry.split,
        replacementReason: entry.reason,
        replacesOccupantKind: entry.replacedOccupantKind,
        identityDigestKind: REPLACEMENT_IDENTITY_KIND,
        identityDigest: executionEntrySha256(binding),
        rootAuthorityCount: binding.rootAuthorityCount,
      },
    };
  });

  // New replacements: exactly Q1, sequenced as the append would record them.
  const entries = [...startingLedger.entries];
  const plannedReplacementAppend: PlannedReplacementEntry[] = [];
  const q1Items: Generation2WindowWorkItem[] = q1.map((assignment) => {
    const occupant = resolveCrossGenerationOccupant(
      basis,
      withEntries(basis.genesis, entries),
      assignment.selectionIndex,
    );
    const binding = buildReserveExecutionBinding(
      basis.frameIndex,
      basis.schedule,
      assignment.generation2ReserveRankPosition,
    );
    const sequence = startingLedger.entries.length + plannedReplacementAppend.length;
    plannedReplacementAppend.push({
      sequence,
      selectionIndex: assignment.selectionIndex,
      generation2ReserveRankPosition: assignment.generation2ReserveRankPosition,
      split: occupant.split,
      reason: assignment.reason,
      replacedOccupantKind: occupant.kind,
      previousSequenceForSlot: occupant.generation2LedgerSequence,
    });
    return {
      order: 0,
      kind: 'REPLACEMENT',
      workItemId: generation2ReplacementWorkItemId(
        assignment.selectionIndex,
        assignment.generation2ReserveRankPosition,
      ),
      selectionIndex: assignment.selectionIndex,
      generation2ReserveRankPosition: assignment.generation2ReserveRankPosition,
      split: occupant.split,
      replacementReason: assignment.reason,
      replacesOccupantKind: occupant.kind,
      identityDigestKind: REPLACEMENT_IDENTITY_KIND,
      identityDigest: executionEntrySha256(binding),
      rootAuthorityCount: binding.rootAuthorityCount,
    };
  });
  // The complete replacement group, in canonical ledger-assignment sequence.
  const replacementItems = [
    ...carryInItems,
    ...q1Items.map((item, k): SequencedItem => ({
      sequence: plannedReplacementAppend[k]!.sequence,
      item,
    })),
  ]
    .sort((a, b) => a.sequence - b.sequence)
    .map(({ item }) => item);

  // Primaries: the lowest never-started ORIGINAL selections, ascending.
  const primaryCount = plannedWindowSize - replacementItems.length;
  const primaries = [...state.neverStarted].sort((a, b) => a - b).slice(0, primaryCount);
  if (primaries.length !== primaryCount) {
    refuse('PRIMARIES_EXHAUSTED', 'not enough never-started primaries to fill the window');
  }
  const primaryItems: Generation2WindowWorkItem[] = primaries.map((selectionIndex) => {
    const occupant = resolveCrossGenerationOccupant(basis, startingLedger, selectionIndex);
    if (
      occupant.kind !== 'GENERATION1_TERMINAL_OCCUPANT' ||
      occupant.generation1OccupantKind !== 'ORIGINAL_SELECTION' ||
      occupant.generation2EntryCountForSlot !== 0
    ) {
      refuse(
        'PRIMARY_NOT_ORIGINAL',
        `slot ${String(selectionIndex)} is not its original selection`,
      );
    }
    const binding = buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, selectionIndex);
    if (binding.echeRowKey !== occupant.echeRowKey) {
      refuse(
        'PRIMARY_NOT_ORIGINAL',
        `slot ${String(selectionIndex)}: occupant differs from the draw`,
      );
    }
    return {
      order: 0,
      kind: 'PRIMARY',
      workItemId: generation2PrimaryWorkItemId(selectionIndex),
      selectionIndex,
      generation2ReserveRankPosition: null,
      split: binding.split,
      replacementReason: null,
      replacesOccupantKind: null,
      identityDigestKind: PRIMARY_IDENTITY_KIND,
      identityDigest: binding.drawEntrySha256,
      rootAuthorityCount: binding.rootAuthorityCount,
    };
  });

  const cadence =
    input.cadenceAuthority === undefined
      ? null
      : verifyWindowCadenceAuthority(input.cadenceAuthority, history.windows.length + 1);
  const workItems = orderByCadence(
    replacementItems,
    primaryItems,
    cadence?.mode ?? DEFAULT_WINDOW_EXECUTION_CADENCE,
  ).map((item, position) => ({
    ...item,
    order: position + 1,
  }));
  const withoutHash: Omit<Generation2WindowSpec, 'windowSpecHash'> = {
    schema: WINDOW_SPEC_SCHEMA,
    generationId: GENERATION2_ID,
    isLiveAuthority: false,
    thisSpecAuthorises: [],
    bound: basis.bound,
    frozenHashes: {
      frameHash: FRAME_HASH,
      drawHash: DRAW_HASH,
      generation1LedgerHash: GENERATION1_LEDGER_HASH,
      canonicalScheduleHash: CANONICAL_SCHEDULE_HASH,
      frozenScheduleHash: FROZEN_SCHEDULE_HASH,
      genesisLedgerHash: GENESIS_LEDGER_HASH,
    },
    startingLedger: {
      path: GENERATION2_LEDGER_PATH,
      fileSha256: input.startingLedgerFile.sha256,
      bytes: input.startingLedgerFile.bytes,
      ledgerHash: startingLedger.ledgerHash,
      entryCount: startingLedger.entries.length,
    },
    planningState: {
      successfulOrganisationCount: state.successfulOrganisationCount,
      currentAcquisitionFailure: state.currentAcquisitionFailure,
      replacementAssignedAwaitingExecution: state.replacementAssignedAwaitingExecution,
      pendingCapabilityReview: state.pendingCapabilityReview,
      neverStartedCount: state.neverStarted.length,
      neverStartedFrom: state.neverStarted[0] ?? null,
      neverStartedTo: state.neverStarted.at(-1) ?? null,
      carryForwardRefused: state.carryForwardRefused,
      q1: state.q1,
      generation2ReserveConsumed: state.generation2ReserveConsumed,
      nextGeneration2ReservePosition: state.nextGeneration2ReservePosition,
    },
    plannedWindowSize,
    plannedReplacementAppend,
    workItems,
    gateThresholds: {
      p2RobotsRefusalWindowCount: strictPercentThresholdCount(
        plannedWindowSize,
        P2_BATCH_PERCENT_STRICTLY_ABOVE,
      ),
      p5LowRawYieldWindowCount: strictPercentThresholdCount(
        plannedWindowSize,
        P5_BATCH_PERCENT_STRICTLY_ABOVE,
      ),
    },
    ...(history.windows.length === 0
      ? {}
      : {
          adjudicationHistory: historyBindingOf(
            replayGeneration2History(basis, startingLedger, history),
          ),
        }),
    ...(cadence === null ? {} : { executionCadence: cadence }),
  };
  if (
    input.startingLedgerFile.sha256.length !== 64 ||
    PINNED.genesisLedger.path !== GENERATION2_LEDGER_PATH
  ) {
    refuse('STARTING_LEDGER_FILE', 'the starting ledger file is not identified');
  }
  return { ...withoutHash, windowSpecHash: sha256(canonicalStringify(withoutHash)) };
}

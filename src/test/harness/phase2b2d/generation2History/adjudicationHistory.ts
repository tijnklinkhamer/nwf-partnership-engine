/**
 * THE GENERATION-2 ADJUDICATION HISTORY BRIDGE: committed window history,
 * validated and REPLAYED item by item into the one Generation-2 slot state
 * machine. PURE.
 *
 * WHY IT EXISTS
 *
 *   The first-window state model was `carried start + Generation-2 ledger`:
 *   every ledger entry meant REPLACEMENT_ASSIGNED_AWAITING_EXECUTION, because
 *   no Generation-2 window had been adjudicated. After Window 01 that model
 *   cannot say which assigned replacements have run, which primaries have
 *   run, or which slots have failed again. This module adds exactly that
 *   knowledge, and nothing else.
 *
 * EXPLICIT HISTORY
 *
 *   The history is an ORDERED list of committed window bindings supplied by
 *   the caller (authority, LIVE_RESULT, adjudication, the starting ledger
 *   revision). Nothing is discovered: no directory scan, no glob, no
 *   "latest", no filename ordering, no modification time.
 *
 * TRUST MODEL
 *
 *   Every record is re-hashed against its binding and every cross-reference
 *   (adjudication -> LIVE_RESULT -> authority -> ledger revision) must hold.
 *   Item identities, digests (re-bound from the frozen frame / schedule /
 *   draw), run references, verdicts and Q3 reasons are checked item by item.
 *   The verdicts are then REPLAYED through the state machine; the record's
 *   own summaries (state before/after, Q1, obligations, ledger, P6) are only
 *   COMPARED against the replay, never used to compute it.
 *
 * THE STATE MACHINE (the only one; `deriveGeneration2CurrentState` uses it)
 *
 *   carried start: SUCCESSFUL / FAILURE(reason) / NEVER_STARTED
 *   ledger entry for a FAILURE slot, same reason   -> ASSIGNED (that entry)
 *   primary item on a NEVER_STARTED slot           -> SUCCESSFUL | FAILURE(q3)
 *   replacement item on its exact ASSIGNED occupant -> SUCCESSFUL | FAILURE(q3)
 *
 *   A failed replacement is a FAILURE of the SAME slot, so its next ledger
 *   entry replaces the Generation-2 occupant and carries its sequence
 *   (same-slot Q2). Ledger entries that no adjudicated window consumed are the
 *   unadjudicated suffix: they stay ASSIGNED, never success or failure.
 *
 * Frozen P7 is not redefined here. History integrity is an ADDITIONAL
 * operational prerequisite.
 *
 * No filesystem, no database, no network, no clock.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  REPLACEMENT_REASONS,
  type ReplacementReason,
} from '../continuationWindow/windowContract.js';
import type { Split } from '../draw/drawContract.js';
import type { Generation2LedgerEntry } from '../generation2/generation2Ledger.js';
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
  executionEntrySha256,
} from '../generation2Acquisition/executionBinding.js';
import {
  GENERATION2_ID,
  generation2PrimaryWorkItemId,
  generation2ReplacementWorkItemId,
  refuse,
} from '../generation2Acquisition/operationalContract.js';
import {
  parseOperationalGeneration2Ledger,
  prefixLedgerHash,
  type OperationalGeneration2Ledger,
} from '../generation2Acquisition/operationalLedger.js';
import type { Generation2OperationalBasis } from '../generation2Acquisition/state.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;
const SELECTION_COUNT = 110;
const SPLITS: readonly Split[] = ['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'];

export const HISTORY_BRIDGE_VERSION = 'GENERATION2_ADJUDICATION_HISTORY_BRIDGE_V1';
export const ADJUDICATION_VERDICTS = [
  'ACQUISITION_SUCCESSFUL',
  'ACQUISITION_UNSUCCESSFUL',
] as const;
export type AdjudicationVerdict = (typeof ADJUDICATION_VERDICTS)[number];

// ---------------------------------------------------------------------------
// The explicit history.
// ---------------------------------------------------------------------------

/** A committed record: where it lives, the SHA-256 it is pinned to, and its bytes. */
export interface CommittedRecordBinding {
  readonly path: string;
  readonly sha256: string;
  readonly text: string;
}

/** One adjudicated window, supplied explicitly by the caller. */
export interface Generation2WindowHistoryBinding {
  readonly windowOrdinal: number;
  readonly authority: CommittedRecordBinding;
  readonly liveResult: CommittedRecordBinding;
  readonly adjudication: CommittedRecordBinding;
  /** The bytes of the ledger revision the authority precommitted its window against. */
  readonly startingLedgerText: string;
}

/** Ordered: windows[k] is window k+1. Empty means the historical first-window model. */
export interface Generation2AdjudicationHistory {
  readonly windows: readonly Generation2WindowHistoryBinding[];
}

export const EMPTY_GENERATION2_HISTORY: Generation2AdjudicationHistory = { windows: [] };

// ---------------------------------------------------------------------------
// Slot lifecycle.
// ---------------------------------------------------------------------------

export type SlotStatus = 'SUCCESSFUL' | 'FAILURE' | 'ASSIGNED' | 'NEVER_STARTED';

export interface SlotLifecycle {
  readonly status: SlotStatus;
  /** FAILURE: the reason the slot's next replacement records. ASSIGNED: the reason its entry recorded. */
  readonly reason: ReplacementReason | null;
  /** ASSIGNED: the ledger entry whose reserve now occupies the slot. */
  readonly assignedSequence: number | null;
  readonly assignedPosition: number | null;
}

type Slots = Map<number, SlotLifecycle>;

const statusList = (slots: Slots, status: SlotStatus): number[] =>
  [...slots.entries()]
    .filter(([, slot]) => slot.status === status)
    .map(([index]) => index)
    .sort((a, b) => a - b);

function initialSlots(basis: Generation2OperationalBasis): Slots {
  const start = basis.carriedForward;
  if (start.refused.length !== 0) {
    refuse('CARRY_FORWARD_REFUSED', 'a slot was refused carry-forward');
  }
  const slots: Slots = new Map();
  const set = (index: number, slot: SlotLifecycle): void => {
    if (slots.has(index)) refuse('STATE_ACCOUNTING', `slot ${String(index)} is carried twice`);
    slots.set(index, slot);
  };
  const none = { assignedSequence: null, assignedPosition: null };
  for (const index of start.successful) set(index, { status: 'SUCCESSFUL', reason: null, ...none });
  for (const index of start.failures) {
    const reason = start.failureReasons.find((r) => r.selectionIndex === index)?.reason;
    if (reason === undefined) refuse('FAILURE_REASON_NOT_DERIVABLE', `slot ${String(index)}`);
    set(index, { status: 'FAILURE', reason, ...none });
  }
  for (const index of start.neverStarted) {
    set(index, { status: 'NEVER_STARTED', reason: null, ...none });
  }
  if (slots.size !== SELECTION_COUNT) {
    refuse('STATE_ACCOUNTING', `${String(slots.size)} slots carried, not 110`);
  }
  return slots;
}

/**
 * A ledger entry assigns a reserve to a FAILURE slot, for that failure's
 * reason. Refusal codes are the first-window model's, unchanged.
 */
function applyLedgerEntry(slots: Slots, entry: Generation2LedgerEntry): void {
  const slot = slots.get(entry.selectionIndex);
  if (slot?.status === 'ASSIGNED') {
    refuse(
      'GENERATION2_ADJUDICATION_REQUIRED',
      `slot ${String(entry.selectionIndex)} is re-assigned, but no Generation-2 adjudication of its assigned replacement exists`,
    );
  }
  if (slot?.status !== 'FAILURE') {
    refuse(
      'LEDGER_ENTRY_FOR_NON_FAILED_SLOT',
      `a Generation-2 entry replaces slot ${String(entry.selectionIndex)}, which is not a current failure`,
    );
  }
  if (entry.reason !== slot.reason) {
    refuse(
      'LEDGER_REASON_MISMATCH',
      `slot ${String(entry.selectionIndex)}: reason differs from its evidence`,
    );
  }
  slots.set(entry.selectionIndex, {
    status: 'ASSIGNED',
    reason: entry.reason,
    assignedSequence: entry.sequence,
    assignedPosition: entry.generation2ReserveRankPosition,
  });
}

interface ReplayedItem {
  readonly kind: 'REPLACEMENT' | 'PRIMARY';
  readonly selectionIndex: number;
  readonly generation2ReserveRankPosition: number | null;
  readonly verdict: AdjudicationVerdict;
  readonly q3Reason: ReplacementReason | null;
}

function applyAdjudicatedItem(slots: Slots, item: ReplayedItem): void {
  const slot = slots.get(item.selectionIndex);
  if (item.kind === 'PRIMARY') {
    if (slot?.status !== 'NEVER_STARTED') {
      refuse(
        'HISTORY_PRIMARY_NOT_NEVER_STARTED',
        `slot ${String(item.selectionIndex)} is adjudicated as a primary but is ${slot?.status ?? 'unknown'}`,
      );
    }
  } else if (
    slot?.status !== 'ASSIGNED' ||
    slot.assignedPosition !== item.generation2ReserveRankPosition
  ) {
    refuse(
      'HISTORY_REPLACEMENT_NOT_ASSIGNED_OCCUPANT',
      `slot ${String(item.selectionIndex)}: the adjudicated replacement is not the slot's assigned Generation-2 occupant`,
    );
  }
  slots.set(item.selectionIndex, {
    status: item.verdict === 'ACQUISITION_SUCCESSFUL' ? 'SUCCESSFUL' : 'FAILURE',
    reason: item.q3Reason,
    assignedSequence: null,
    assignedPosition: null,
  });
}

// ---------------------------------------------------------------------------
// Snapshots and summaries.
// ---------------------------------------------------------------------------

export interface Generation2SlotSnapshot {
  readonly acquisitionSuccessful: readonly number[];
  readonly currentAcquisitionFailure: readonly number[];
  readonly replacementAssignedAwaitingExecution: readonly number[];
  readonly neverStarted: readonly number[];
  readonly failureReasons: readonly { selectionIndex: number; reason: ReplacementReason }[];
}

function snapshot(slots: Slots): Generation2SlotSnapshot {
  const failures = statusList(slots, 'FAILURE');
  return {
    acquisitionSuccessful: statusList(slots, 'SUCCESSFUL'),
    currentAcquisitionFailure: failures,
    replacementAssignedAwaitingExecution: statusList(slots, 'ASSIGNED'),
    neverStarted: statusList(slots, 'NEVER_STARTED'),
    failureReasons: failures.map((selectionIndex) => ({
      selectionIndex,
      reason: slots.get(selectionIndex)!.reason!,
    })),
  };
}

export function accountingOf(snap: Generation2SlotSnapshot): string {
  const total =
    snap.acquisitionSuccessful.length +
    snap.currentAcquisitionFailure.length +
    snap.replacementAssignedAwaitingExecution.length +
    snap.neverStarted.length;
  if (total !== SELECTION_COUNT) {
    refuse('STATE_ACCOUNTING', `${String(total)} slots accounted, not 110`);
  }
  return `${String(snap.acquisitionSuccessful.length)} successful + ${String(snap.currentAcquisitionFailure.length)} failed + ${String(snap.replacementAssignedAwaitingExecution.length)} assigned + 0 pending + ${String(snap.neverStarted.length)} never started = ${String(total)}`;
}

export function bySplitOf(
  basis: Generation2OperationalBasis,
  indices: readonly number[],
): Record<Split, number> {
  const counts = Object.fromEntries(SPLITS.map((split) => [split, 0])) as Record<Split, number>;
  for (const index of indices) counts[basis.draw.selection[index]!.split] += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Strict record reading.
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function asObject(value: unknown, what: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    refuse('HISTORY_RECORD_SHAPE', `${what} is not an object`);
  }
  return value as Json;
}
function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) refuse('HISTORY_RECORD_SHAPE', `${what} is not an array`);
  return value;
}
function asString(value: unknown, what: string): string {
  if (typeof value !== 'string') refuse('HISTORY_RECORD_SHAPE', `${what} is not a string`);
  return value;
}
function asInt(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    refuse('HISTORY_RECORD_SHAPE', `${what} is not an integer`);
  }
  return value;
}
const same = (a: unknown, b: unknown): boolean => canonicalStringify(a) === canonicalStringify(b);

function parseBound(binding: CommittedRecordBinding, role: string): Json {
  if (!HEX64.test(binding.sha256) || sha256(binding.text) !== binding.sha256) {
    refuse('HISTORY_RECORD_NOT_PINNED', `${role} ${binding.path} does not hash to its binding`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(binding.text);
  } catch {
    refuse('HISTORY_RECORD_SHAPE', `${role} is not JSON`);
  }
  return asObject(parsed, role);
}

/** A `{path, sha256, bytes}` reference must name exactly this binding's bytes. */
function requireRef(value: unknown, binding: CommittedRecordBinding, code: string, what: string) {
  const ref = asObject(value, what);
  if (
    ref.path !== binding.path ||
    ref.sha256 !== binding.sha256 ||
    ref.bytes !== Buffer.byteLength(binding.text, 'utf8')
  ) {
    refuse(code, `${what} does not bind ${binding.path} exactly`);
  }
}

const WORK_ITEM_IDENTITY_FIELDS = [
  'workItemId',
  'kind',
  'selectionIndex',
  'generation2ReserveRankPosition',
  'split',
  'identityDigest',
] as const;

function identityOf(item: Json): Record<string, unknown> {
  return Object.fromEntries(WORK_ITEM_IDENTITY_FIELDS.map((field) => [field, item[field]]));
}

// ---------------------------------------------------------------------------
// One window.
// ---------------------------------------------------------------------------

export interface ReplayedWindow {
  readonly windowOrdinal: number;
  readonly authority: { readonly path: string; readonly sha256: string };
  readonly liveResult: { readonly path: string; readonly sha256: string };
  readonly adjudication: { readonly path: string; readonly sha256: string };
  readonly authorisedWorkItemIds: readonly string[];
  readonly windowSpecHash: string;
  readonly startingLedger: {
    readonly fileSha256: string;
    readonly ledgerHash: string;
    readonly entryCount: number;
  };
  readonly startingLedgerText: string;
  readonly plannedWindowSize: number;
  readonly consumedLedgerSequences: readonly number[];
  readonly ledgerHashAfterAppend: string;
  readonly executed: readonly {
    readonly workItemId: string;
    readonly selectionIndex: number;
    readonly verdict: AdjudicationVerdict;
    readonly q3Reason: ReplacementReason | null;
    readonly runRefSha256: string;
  }[];
  readonly stateBefore: Generation2SlotSnapshot;
  readonly stateAfter: Generation2SlotSnapshot;
}

function replayWindow(
  basis: Generation2OperationalBasis,
  ledger: OperationalGeneration2Ledger,
  slots: Slots,
  cursor: number,
  binding: Generation2WindowHistoryBinding,
  expectedOrdinal: number,
): { window: ReplayedWindow; cursor: number } {
  const ordinal = String(expectedOrdinal);
  if (binding.windowOrdinal !== expectedOrdinal) {
    refuse(
      'HISTORY_OUT_OF_ORDER',
      `history position ${ordinal} carries window ${String(binding.windowOrdinal)}`,
    );
  }

  // ---- authority -------------------------------------------------------------
  const authority = parseBound(binding.authority, `window ${ordinal} authority`);
  if (
    authority.recordKind !== 'GENERATION2_OWNER_LIVE_AUTHORITY' ||
    authority.generationId !== GENERATION2_ID ||
    authority.isLiveAuthority !== true ||
    authority.windowOrdinal !== expectedOrdinal ||
    authority.ordinaryWindows !== 1 ||
    authority.maximumLiveInvocationsPerWorkItem !== 1 ||
    authority.concurrency !== 1
  ) {
    refuse(
      'HISTORY_AUTHORITY_NOT_APPLICABLE',
      `window ${ordinal}: the authority is not a one-window Generation-2 live authority for this window`,
    );
  }
  const size = asInt(authority.plannedWindowSize, 'plannedWindowSize');
  const authorised = asArray(authority.authorisedWorkItems, 'authorisedWorkItems').map((v, k) =>
    asObject(v, `authorisedWorkItems[${String(k)}]`),
  );
  const exactOrder = asArray(authority.exactOrder, 'exactOrder').map((v) =>
    asString(v, 'exactOrder'),
  );
  if (
    size < 1 ||
    authorised.length !== size ||
    exactOrder.length !== size ||
    authority.maximumLiveInvocations !== size ||
    authorised.some((item, k) => item.order !== k + 1 || item.workItemId !== exactOrder[k]) ||
    new Set(exactOrder).size !== size
  ) {
    refuse('HISTORY_AUTHORITY_ORDER', `window ${ordinal}: the authorised order is not exact`);
  }

  // ---- the starting revision and the pre-network append ------------------------
  const start = asObject(authority.boundStartingLedger, 'boundStartingLedger');
  if (
    start.entryCount !== cursor ||
    ledger.entries.length < cursor ||
    start.ledgerHash !== prefixLedgerHash(ledger, cursor) ||
    start.fileSha256 !== sha256(binding.startingLedgerText) ||
    start.bytes !== Buffer.byteLength(binding.startingLedgerText, 'utf8')
  ) {
    refuse(
      'HISTORY_LEDGER_NOT_A_PREFIX',
      `window ${ordinal}: the authority's starting revision is not this ledger's prefix at ${String(cursor)} entries`,
    );
  }
  const startingLedger = parseOperationalGeneration2Ledger(
    JSON.parse(binding.startingLedgerText) as unknown,
    basis.genesis,
  );
  if (startingLedger.ledgerHash !== start.ledgerHash || startingLedger.entries.length !== cursor) {
    refuse(
      'HISTORY_LEDGER_NOT_A_PREFIX',
      `window ${ordinal}: the starting revision bytes are not that revision`,
    );
  }
  if (statusList(slots, 'ASSIGNED').length !== 0) {
    refuse(
      'HISTORY_UNEXECUTED_ASSIGNMENT',
      `window ${ordinal}: an earlier assigned replacement was never adjudicated`,
    );
  }
  const planned = asArray(authority.plannedLedgerAppend, 'plannedLedgerAppend').map((v) =>
    asObject(v, 'plannedLedgerAppend[]'),
  );
  const consumed: number[] = [];
  planned.forEach((plan, k) => {
    const sequence = cursor + k;
    const entry = ledger.entries[sequence];
    if (entry === undefined) {
      refuse(
        'HISTORY_REPLACEMENT_LEDGER_ENTRY_MISSING',
        `window ${ordinal}: planned entry ${String(sequence)} is not in the ledger`,
      );
    }
    if (
      plan.sequence !== sequence ||
      plan.selectionIndex !== entry.selectionIndex ||
      plan.generation2ReserveRankPosition !== entry.generation2ReserveRankPosition ||
      plan.split !== entry.split ||
      plan.reason !== entry.reason ||
      plan.replacedOccupantKind !== entry.replacedOccupantKind ||
      plan.previousSequenceForSlot !== entry.previousSequenceForSlot
    ) {
      refuse(
        'HISTORY_REPLACEMENT_LEDGER_SEQUENCE',
        `window ${ordinal}: planned entry ${String(sequence)} is not the ledger's entry ${String(sequence)}`,
      );
    }
    // Q1: every obligation, ascending, positions monotone from the cursor.
    const q1 = statusList(slots, 'FAILURE');
    if (entry.selectionIndex !== q1[0]) {
      refuse(
        'HISTORY_Q1_ORDER',
        `window ${ordinal}: entry ${String(sequence)} is not the lowest pending obligation`,
      );
    }
    applyLedgerEntry(slots, entry);
    consumed.push(sequence);
  });
  if (statusList(slots, 'FAILURE').length !== 0) {
    refuse(
      'HISTORY_Q1_NOT_DISCHARGED',
      `window ${ordinal}: the pre-network append left an obligation`,
    );
  }
  const afterAppend = cursor + planned.length;
  const ledgerHashAfterAppend = prefixLedgerHash(ledger, afterAppend);
  const stateBefore = snapshot(slots);

  // ---- the authorised work items are the window rule over the replayed state ---
  const expectedPrimaries = stateBefore.neverStarted.slice(0, size - planned.length);
  authorised.forEach((item, k) => {
    const replacement = k < planned.length ? ledger.entries[cursor + k]! : null;
    const slotIndex = replacement?.selectionIndex ?? expectedPrimaries[k - planned.length];
    if (slotIndex === undefined) {
      refuse(
        'HISTORY_AUTHORITY_WORK_ITEM',
        `window ${ordinal}: item ${String(k + 1)} has no never-started primary`,
      );
    }
    const split = basis.draw.selection[slotIndex]!.split;
    let expected: Record<string, unknown>;
    if (replacement !== null) {
      const reserve = buildReserveExecutionBinding(
        basis.frameIndex,
        basis.schedule,
        replacement.generation2ReserveRankPosition,
      );
      expected = {
        workItemId: generation2ReplacementWorkItemId(
          slotIndex,
          replacement.generation2ReserveRankPosition,
        ),
        kind: 'REPLACEMENT',
        selectionIndex: slotIndex,
        generation2ReserveRankPosition: replacement.generation2ReserveRankPosition,
        split,
        identityDigest: executionEntrySha256(reserve),
      };
      if (
        item.replacementReason !== replacement.reason ||
        item.replacesOccupantKind !== replacement.replacedOccupantKind ||
        item.rootAuthorityCount !== reserve.rootAuthorityCount
      ) {
        refuse(
          'HISTORY_AUTHORITY_WORK_ITEM',
          `window ${ordinal}: item ${String(k + 1)} does not describe its ledger entry`,
        );
      }
    } else {
      const primary = buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, slotIndex);
      expected = {
        workItemId: generation2PrimaryWorkItemId(slotIndex),
        kind: 'PRIMARY',
        selectionIndex: slotIndex,
        generation2ReserveRankPosition: null,
        split: primary.split,
        identityDigest: primary.drawEntrySha256,
      };
      if (
        item.replacementReason !== null ||
        item.rootAuthorityCount !== primary.rootAuthorityCount
      ) {
        refuse(
          'HISTORY_AUTHORITY_WORK_ITEM',
          `window ${ordinal}: item ${String(k + 1)} is not an original primary`,
        );
      }
    }
    if (!same(identityOf(item), expected)) {
      refuse(
        'HISTORY_AUTHORITY_WORK_ITEM',
        `window ${ordinal}: item ${String(k + 1)} is not the window rule's item over the replayed state`,
      );
    }
  });
  const windowSpecHash = asString(
    asObject(authority.boundWindowSpec, 'boundWindowSpec').windowSpecHash,
    'windowSpecHash',
  );

  // ---- LIVE_RESULT ---------------------------------------------------------------
  const live = parseBound(binding.liveResult, `window ${ordinal} LIVE_RESULT`);
  if (
    live.recordKind !== 'GENERATION2_WINDOW_LIVE_RESULT' ||
    live.generationId !== GENERATION2_ID ||
    live.isLiveAuthority !== false
  ) {
    refuse('HISTORY_LIVE_RESULT_KIND', `window ${ordinal}: not a Generation-2 LIVE_RESULT`);
  }
  requireRef(
    live.boundAuthority,
    binding.authority,
    'HISTORY_LIVE_RESULT_AUTHORITY',
    `window ${ordinal} LIVE_RESULT.boundAuthority`,
  );
  if (live.windowSpecHash !== windowSpecHash) {
    refuse(
      'HISTORY_LIVE_RESULT_AUTHORITY',
      `window ${ordinal}: the LIVE_RESULT names another window spec`,
    );
  }
  const liveLedger = asObject(live.ledgerDuringTheWindow, 'ledgerDuringTheWindow');
  if (liveLedger.ledgerHash !== ledgerHashAfterAppend || liveLedger.entryCount !== afterAppend) {
    refuse(
      'HISTORY_LEDGER_NOT_A_PREFIX',
      `window ${ordinal}: the LIVE_RESULT ran against another ledger revision`,
    );
  }
  const liveItems = asArray(live.items, 'LIVE_RESULT.items').map((v) =>
    asObject(v, 'LIVE_RESULT.items[]'),
  );
  const liveIds = liveItems.map((item) => item.workItemId);
  if (liveItems.length > size || new Set(liveIds).size !== liveIds.length) {
    refuse(
      'HISTORY_LIVE_RESULT_ITEMS',
      `window ${ordinal}: executed items are duplicated or exceed the authority`,
    );
  }
  const runRefs = new Set<string>();
  liveItems.forEach((item, k) => {
    const authorisedItem = authorised[k]!;
    if (!same(identityOf(item), identityOf(authorisedItem))) {
      refuse(
        'HISTORY_UNAUTHORISED_ITEM',
        `window ${ordinal}: executed item ${String(k + 1)} is not the authority's item ${String(k + 1)}`,
      );
    }
    const runRef = asString(item.runRefSha256, 'runRefSha256');
    if (
      item.order !== k + 1 ||
      !HEX64.test(runRef) ||
      runRefs.has(runRef) ||
      item.cliExecuteInvocations !== 1 ||
      item.runsForOccupant !== 1 ||
      item.completionRows !== 1 ||
      item.runTerminalState !== 'COMPLETED' ||
      item.dryRun !== false
    ) {
      refuse(
        'HISTORY_LIVE_RESULT_ITEMS',
        `window ${ordinal}: executed item ${String(k + 1)} is not one clean completed run`,
      );
    }
    runRefs.add(runRef);
  });
  const invocations = asObject(live.liveInvocations, 'liveInvocations');
  const stops = asObject(live.stops, 'stops');
  if (
    invocations.used !== liveItems.length ||
    invocations.retries !== 0 ||
    !same(stops.itemsNotStarted, exactOrder.slice(liveItems.length))
  ) {
    refuse(
      'HISTORY_LIVE_RESULT_ITEMS',
      `window ${ordinal}: invocation accounting does not match the executed items`,
    );
  }

  // ---- adjudication ----------------------------------------------------------------
  const adjudication = parseBound(binding.adjudication, `window ${ordinal} adjudication`);
  if (
    adjudication.recordKind !== 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION' ||
    adjudication.generationId !== GENERATION2_ID ||
    adjudication.isLiveAuthority !== false ||
    !same(adjudication.thisFileAuthorises, []) ||
    !/_ADJUDICATED_/.test(asString(adjudication.terminalState, 'terminalState'))
  ) {
    refuse(
      'HISTORY_ADJUDICATION_KIND',
      `window ${ordinal}: not a terminal Generation-2 adjudication`,
    );
  }
  const bound = asObject(adjudication.bound, 'adjudication.bound');
  requireRef(
    bound.liveResult,
    binding.liveResult,
    'HISTORY_ADJUDICATION_LIVE_RESULT',
    `window ${ordinal} adjudication.bound.liveResult`,
  );
  requireRef(
    bound.authority,
    binding.authority,
    'HISTORY_ADJUDICATION_AUTHORITY',
    `window ${ordinal} adjudication.bound.authority`,
  );
  const adjudicatedLedger = asObject(bound.ledger, 'adjudication.bound.ledger');
  if (
    adjudicatedLedger.ledgerHash !== ledgerHashAfterAppend ||
    adjudicatedLedger.entryCount !== afterAppend
  ) {
    refuse(
      'HISTORY_LEDGER_NOT_A_PREFIX',
      `window ${ordinal}: the adjudication binds another ledger revision`,
    );
  }
  const validation = asObject(adjudication.validation, 'validation');
  if (
    validation.exitCode !== 0 ||
    !/_VALIDATION_ACCEPTED$/.test(asString(validation.result, 'validation.result'))
  ) {
    refuse(
      'HISTORY_VALIDATION_NOT_ACCEPTED',
      `window ${ordinal}: the adjudication's validation was not accepted`,
    );
  }
  const adjudicatedItems = asArray(adjudication.items, 'adjudication.items').map((v) =>
    asObject(v, 'adjudication.items[]'),
  );
  const adjudicatedIds = adjudicatedItems.map((item) => item.workItemId);
  if (new Set(adjudicatedIds).size !== adjudicatedIds.length) {
    refuse('HISTORY_DOUBLE_ADJUDICATION', `window ${ordinal}: a work item is adjudicated twice`);
  }
  if (adjudicatedItems.length !== liveItems.length) {
    refuse(
      'HISTORY_ADJUDICATION_ITEMS',
      `window ${ordinal}: ${String(adjudicatedItems.length)} adjudicated items for ${String(liveItems.length)} executed`,
    );
  }
  const executed: ReplayedWindow['executed'][number][] = [];
  adjudicatedItems.forEach((item, k) => {
    const liveItem = liveItems[k]!;
    if (!exactOrder.includes(asString(item.workItemId, 'workItemId'))) {
      refuse(
        'HISTORY_UNAUTHORISED_ITEM',
        `window ${ordinal}: adjudicated item ${String(k + 1)} was never authorised`,
      );
    }
    if (
      !same(identityOf(item), identityOf(liveItem)) ||
      item.runRefSha256 !== liveItem.runRefSha256
    ) {
      refuse(
        'HISTORY_ADJUDICATION_ITEMS',
        `window ${ordinal}: adjudicated item ${String(k + 1)} is not executed item ${String(k + 1)}`,
      );
    }
    const integrity = asObject(item.integrity, 'integrity');
    if (integrity.verdict !== 'CLEAN') {
      refuse(
        'HISTORY_INTEGRITY_NOT_CLEAN',
        `window ${ordinal}: item ${String(k + 1)} integrity does not permit adjudication`,
      );
    }
    const decision = asObject(item.adjudication, 'adjudication');
    const verdict = decision.verdict;
    if (!(ADJUDICATION_VERDICTS as readonly unknown[]).includes(verdict)) {
      refuse(
        'HISTORY_VERDICT_NOT_FROZEN',
        `window ${ordinal}: item ${String(k + 1)} verdict is outside the frozen vocabulary`,
      );
    }
    const q3 = decision.q3Reason;
    if (verdict === 'ACQUISITION_SUCCESSFUL' && q3 !== null) {
      refuse(
        'HISTORY_SUCCESS_WITH_REASON',
        `window ${ordinal}: item ${String(k + 1)} succeeded but carries a replacement reason`,
      );
    }
    if (
      verdict === 'ACQUISITION_UNSUCCESSFUL' &&
      !(REPLACEMENT_REASONS as readonly unknown[]).includes(q3)
    ) {
      refuse(
        'HISTORY_Q3_REASON_INVALID',
        `window ${ordinal}: item ${String(k + 1)} failed without a valid Q3 reason`,
      );
    }
    const replayed: ReplayedItem = {
      kind: liveItem.kind as 'REPLACEMENT' | 'PRIMARY',
      selectionIndex: liveItem.selectionIndex as number,
      generation2ReserveRankPosition: liveItem.generation2ReserveRankPosition as number | null,
      verdict: verdict as AdjudicationVerdict,
      q3Reason: q3 as ReplacementReason | null,
    };
    applyAdjudicatedItem(slots, replayed);
    executed.push({
      workItemId: liveItem.workItemId as string,
      selectionIndex: replayed.selectionIndex,
      verdict: replayed.verdict,
      q3Reason: replayed.q3Reason,
      runRefSha256: liveItem.runRefSha256 as string,
    });
  });
  const stateAfter = snapshot(slots);

  requireSummaryAgreement(basis, adjudication, {
    ordinal,
    stateBefore,
    stateAfter,
    ledgerEntryCount: afterAppend,
    ledgerHash: ledgerHashAfterAppend,
    executed,
    size,
  });

  return {
    cursor: afterAppend,
    window: {
      windowOrdinal: expectedOrdinal,
      authority: { path: binding.authority.path, sha256: binding.authority.sha256 },
      liveResult: { path: binding.liveResult.path, sha256: binding.liveResult.sha256 },
      adjudication: { path: binding.adjudication.path, sha256: binding.adjudication.sha256 },
      authorisedWorkItemIds: exactOrder,
      windowSpecHash,
      startingLedger: {
        fileSha256: start.fileSha256 as string,
        ledgerHash: start.ledgerHash as string,
        entryCount: cursor,
      },
      startingLedgerText: binding.startingLedgerText,
      plannedWindowSize: size,
      consumedLedgerSequences: consumed,
      ledgerHashAfterAppend,
      executed,
      stateBefore,
      stateAfter,
    },
  };
}

/** The record's summaries are the COMPARISON TARGET: each must equal the replay. */
function requireSummaryAgreement(
  basis: Generation2OperationalBasis,
  adjudication: Json,
  replay: {
    ordinal: string;
    stateBefore: Generation2SlotSnapshot;
    stateAfter: Generation2SlotSnapshot;
    ledgerEntryCount: number;
    ledgerHash: string;
    executed: ReplayedWindow['executed'];
    size: number;
  },
): void {
  const { stateBefore: b, stateAfter: a } = replay;
  const range = (indices: readonly number[]) => ({
    from: indices[0] ?? null,
    to: indices.at(-1) ?? null,
    count: indices.length,
  });
  const mismatches: string[] = [];
  const check = (name: string, recorded: unknown, derived: unknown): void => {
    if (!same(recorded, derived)) mismatches.push(name);
  };
  const before = asObject(adjudication.generation2StateBefore, 'generation2StateBefore');
  check(
    'before.ACQUISITION_SUCCESSFUL',
    before.ACQUISITION_SUCCESSFUL,
    b.acquisitionSuccessful.length,
  );
  check(
    'before.CURRENT_ACQUISITION_FAILURE',
    before.CURRENT_ACQUISITION_FAILURE,
    b.currentAcquisitionFailure,
  );
  check(
    'before.REPLACEMENT_ASSIGNED_AWAITING_EXECUTION',
    before.REPLACEMENT_ASSIGNED_AWAITING_EXECUTION,
    b.replacementAssignedAwaitingExecution,
  );
  check('before.NEVER_STARTED', before.NEVER_STARTED, range(b.neverStarted));
  check('before.q1', before.q1, b.currentAcquisitionFailure);
  check('before.ledgerEntryCount', before.ledgerEntryCount, replay.ledgerEntryCount);
  check(
    'before.nextGeneration2ReservePosition',
    before.nextGeneration2ReservePosition,
    replay.ledgerEntryCount,
  );

  const after = asObject(adjudication.generation2StateAfter, 'generation2StateAfter');
  check(
    'after.ACQUISITION_SUCCESSFUL',
    after.ACQUISITION_SUCCESSFUL,
    a.acquisitionSuccessful.length,
  );
  check(
    'after.acquisitionSuccessfulBySplit',
    after.acquisitionSuccessfulBySplit,
    bySplitOf(basis, a.acquisitionSuccessful),
  );
  check(
    'after.CURRENT_ACQUISITION_FAILURE',
    after.CURRENT_ACQUISITION_FAILURE,
    a.currentAcquisitionFailure,
  );
  check(
    'after.currentFailureBySplit',
    after.currentFailureBySplit,
    bySplitOf(basis, a.currentAcquisitionFailure),
  );
  check(
    'after.REPLACEMENT_ASSIGNED_AWAITING_EXECUTION',
    after.REPLACEMENT_ASSIGNED_AWAITING_EXECUTION,
    a.replacementAssignedAwaitingExecution,
  );
  check('after.PENDING_CAPABILITY_REVIEW', after.PENDING_CAPABILITY_REVIEW, []);
  check('after.CARRY_FORWARD_REFUSED', after.CARRY_FORWARD_REFUSED, []);
  check('after.NEVER_STARTED', after.NEVER_STARTED, {
    ...range(a.neverStarted),
    bySplit: bySplitOf(basis, a.neverStarted),
  });
  check('after.accounting', after.accounting, accountingOf(a));
  check('q1After', adjudication.q1After, a.currentAcquisitionFailure);
  check('q1AfterReasons', adjudication.q1AfterReasons, a.failureReasons);
  check(
    'pendingReplacementObligations',
    adjudication.pendingReplacementObligations,
    a.currentAcquisitionFailure,
  );

  const ledgerAfter = asObject(adjudication.ledgerAfter, 'ledgerAfter');
  check('ledgerAfter.entryCount', ledgerAfter.entryCount, replay.ledgerEntryCount);
  check('ledgerAfter.ledgerHash', ledgerAfter.ledgerHash, replay.ledgerHash);
  check(
    'ledgerAfter.nextGeneration2ReservePosition',
    ledgerAfter.nextGeneration2ReservePosition,
    replay.ledgerEntryCount,
  );
  const reserves = asObject(adjudication.reserves, 'reserves');
  check('reserves.generation2Consumed', reserves.generation2Consumed, replay.ledgerEntryCount);
  check(
    'reserves.nextGeneration2ReservePosition',
    reserves.nextGeneration2ReservePosition,
    replay.ledgerEntryCount,
  );
  const p6 = asObject(adjudication.p6, 'p6');
  check('p6.reserveConsumed', p6.reserveConsumed, replay.ledgerEntryCount);
  check(
    'p6.successfulOrganisationCount',
    p6.successfulOrganisationCount,
    a.acquisitionSuccessful.length,
  );

  const summary = asObject(adjudication.windowSummary, 'windowSummary');
  const slotsWith = (verdict: AdjudicationVerdict) =>
    replay.executed
      .filter((item) => item.verdict === verdict)
      .map((item) => item.selectionIndex)
      .sort((x, y) => x - y);
  check('windowSummary.executed', summary.executed, replay.executed.length);
  check('windowSummary.authorised', summary.authorised, replay.size);
  check(
    'windowSummary.acquisitionSuccessful',
    summary.acquisitionSuccessful,
    slotsWith('ACQUISITION_SUCCESSFUL'),
  );
  check(
    'windowSummary.acquisitionUnsuccessful',
    summary.acquisitionUnsuccessful,
    slotsWith('ACQUISITION_UNSUCCESSFUL'),
  );

  if (mismatches.length !== 0) {
    refuse(
      'HISTORY_SUMMARY_DISAGREES',
      `window ${replay.ordinal}: recorded summary differs from the replay at ${mismatches.join(', ')}`,
    );
  }
}

// ---------------------------------------------------------------------------
// The whole history.
// ---------------------------------------------------------------------------

export interface Generation2HistoryReplay {
  readonly bridgeVersion: typeof HISTORY_BRIDGE_VERSION;
  readonly windows: readonly ReplayedWindow[];
  /** Ledger entries consumed (and executed) by adjudicated windows: a ledger prefix. */
  readonly consumedLedgerEntryCount: number;
  /** Every slot after the history and the unadjudicated ledger suffix. */
  readonly final: Generation2SlotSnapshot;
}

/**
 * Carried start -> each committed window in order (its pre-network append,
 * then its adjudicated items) -> the unadjudicated ledger suffix, which stays
 * ASSIGNED. The ledger must already be parsed and valid.
 */
export function replayGeneration2History(
  basis: Generation2OperationalBasis,
  ledger: OperationalGeneration2Ledger,
  history: Generation2AdjudicationHistory = EMPTY_GENERATION2_HISTORY,
): Generation2HistoryReplay {
  const slots = initialSlots(basis);
  let cursor = 0;
  const windows: ReplayedWindow[] = [];
  history.windows.forEach((binding, k) => {
    const next = replayWindow(basis, ledger, slots, cursor, binding, k + 1);
    windows.push(next.window);
    cursor = next.cursor;
  });
  for (const entry of ledger.entries.slice(cursor)) applyLedgerEntry(slots, entry);
  const final = snapshot(slots);
  accountingOf(final);
  return {
    bridgeVersion: HISTORY_BRIDGE_VERSION,
    windows,
    consumedLedgerEntryCount: cursor,
    final,
  };
}

/** The public-safe identity of a replayed history: paths, hashes and ordinals only. */
export function historyBindingOf(replay: Generation2HistoryReplay) {
  return {
    bridgeVersion: replay.bridgeVersion,
    windowCount: replay.windows.length,
    consumedLedgerEntryCount: replay.consumedLedgerEntryCount,
    windows: replay.windows.map((window) => ({
      windowOrdinal: window.windowOrdinal,
      authority: window.authority,
      liveResult: window.liveResult,
      adjudication: window.adjudication,
      windowSpecHash: window.windowSpecHash,
      startingLedger: window.startingLedger,
      ledgerHashAfterAppend: window.ledgerHashAfterAppend,
    })),
  };
}

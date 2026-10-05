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
 * AUTHORITY-SHAPE CORRECTIONS
 *
 *   An authority is read by its canonical field names. The one exception is
 *   a window whose binding EXPLICITLY carries a committed, owner-approved
 *   correction record pinned to that authority's exact path, commit and
 *   bytes; only then may one approved field alias (APPROVED_AUTHORITY_SHAPE_
 *   CORRECTIONS) supply the canonical value, and only its exact, hash-pinned
 *   stored object. There is no fallback: an authority lacking a canonical
 *   field and a correction is refused, and a correction is never consulted
 *   for a canonically shaped authority.
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
 *   A consumed entry whose work item a window did not execute also stays
 *   ASSIGNED (CARRY-IN). The next window takes it in as a required member on
 *   the same entry - never a Q1 obligation, never a second reserve - so a
 *   window's replacements are every slot ASSIGNED after its append, in
 *   ledger-sequence order. Ledger consumption is unchanged by this.
 *
 * TARGETED HOST RECOVERY (Methodology-V3 amendment V3-H1..V3-H10, Design A)
 *
 *   A window's binding may EXPLICITLY carry committed targeted-host-recovery
 *   chains (never looked up). An adjudication item that carries an
 *   `acquisitionOfRecord` block must then be original integrity exactly
 *   HOST_CONFOUNDED, match exactly one supplied chain for its (window, work
 *   item, original run) incident, pass eligibility E1-E14 and every hop of the
 *   chain, and name a CLEAN recovery; its adjudicated verdict is then the one
 *   applied to the slot. The item still appears exactly once, at its position,
 *   with its ORIGINAL run reference. Without the block the ordinary path is
 *   unchanged: integrity must be CLEAN. Every supplied chain must be consumed,
 *   and a recovered window must record its original stop history unchanged.
 *   Recovery-free windows replay, and bind, byte-identically.
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
  cadenceOfAuthority,
  type WindowCadenceAuthorityBinding,
} from '../generation2Cadence/windowCadence.js';
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
import { HOST_RECOVERY_EXTENSION_VERSION } from '../generation2Recovery/hostRecoveryContract.js';
import {
  incidentOfBinding,
  requireOriginalWindowStopHistoryPreserved,
  validateAcquisitionOfRecord,
  validateTargetedHostRecovery,
  type ReplayedAcquisitionOfRecord,
  type TargetedHostRecoveryBinding,
} from '../generation2Recovery/hostRecoveryProvenance.js';

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

/**
 * A committed, owner-approved correction of how ONE pinned authority's SHAPE
 * is read. It never edits the authority: it names the exact bytes it applies
 * to and the one field it lets the replay read under its canonical name.
 */
export interface AuthorityShapeCorrectionBinding {
  readonly record: CommittedRecordBinding;
  /** The commit the caller read the authority bytes at; the record must bind exactly it. */
  readonly authorityCommit: string;
}

/** One adjudicated window, supplied explicitly by the caller. */
export interface Generation2WindowHistoryBinding {
  readonly windowOrdinal: number;
  readonly authority: CommittedRecordBinding;
  readonly liveResult: CommittedRecordBinding;
  readonly adjudication: CommittedRecordBinding;
  /** The bytes of the ledger revision the authority precommitted its window against. */
  readonly startingLedgerText: string;
  /** Absent for every canonically shaped authority. Never looked up: supplied or not. */
  readonly authorityShapeCorrection?: AuthorityShapeCorrectionBinding;
  /**
   * The committed owner cadence decision, supplied ONLY for a window whose
   * authority carries an `executionCadence` block. Absent: the legacy
   * replacement-first default. Never looked up: supplied or not.
   */
  readonly cadenceAuthority?: WindowCadenceAuthorityBinding;
  /**
   * Committed targeted-host-recovery chains, supplied ONLY for a window whose
   * adjudication accepts a recovery. Absent for every ordinary window. Never
   * looked up: supplied or not.
   */
  readonly targetedHostRecoveries?: readonly TargetedHostRecoveryBinding[];
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

// ---------------------------------------------------------------------------
// The starting-ledger binding, and the one approved authority-shape correction.
// ---------------------------------------------------------------------------

export const AUTHORITY_SHAPE_CORRECTION_RECORD_KIND =
  'GENERATION2_WINDOW_AUTHORITY_SHAPE_CORRECTION_AND_ADJUDICATION_RULING';

/**
 * Every authority-shape correction an owner has approved, each under its own
 * ruling and pinned to the ONE authority (window ordinal + exact SHA-256) it
 * was issued for. Adding one is a reviewed code change, never data: a record
 * naming any other ruling, field pair, window or authority is refused, so
 * `boundLedger` never becomes a second spelling of `boundStartingLedger`.
 */
export const APPROVED_AUTHORITY_SHAPE_CORRECTIONS = [
  {
    ownerRuling: 'APPROVE_PINNED_WINDOW04_AUTHORITY_STARTING_LEDGER_FIELD_ALIAS_CORRECTION_V1',
    windowOrdinal: 4,
    authoritySha256: 'bb24c26a8f2816a2cba584edb3726254bd72b1a8b979ca3cf9348effae1802a5',
    sourceField: 'boundLedger',
    canonicalField: 'boundStartingLedger',
  },
] as const;

const CORRECTION_BLOCK_FIELDS = [
  'canonicalField',
  'originalBytesRemainAuthoritative',
  'otherFieldsRemapped',
  'ownerRuling',
  'scope',
  'sourceField',
  'sourceValueCanonicalSha256',
  'valuesAltered',
] as const;

/** Keys that would read as an override of the window itself; a correction may carry none. */
const CORRECTION_FORBIDDEN_KEYS = [
  'authorisedWorkItems',
  'boundLedger',
  'boundStartingLedger',
  'boundWindowSpec',
  'concurrency',
  'exactOrder',
  'items',
  'ledgerAfter',
  'maximumLiveInvocations',
  'maximumLiveInvocationsPerWorkItem',
  'plannedLedgerAppend',
  'plannedWindowSize',
  'validation',
  'windowSpecHash',
] as const;

const has = (value: Json, key: string): boolean => Object.hasOwn(value, key);

/**
 * The authority's starting-ledger binding. A canonically shaped authority is
 * read exactly as before and a correction is never consulted for it; only an
 * authority WITHOUT `boundStartingLedger` may be read through a correction,
 * and only one supplied explicitly and validated in full. The authority object
 * is not mutated: the exact stored object is returned.
 */
function resolveBoundStartingLedger(
  authority: Json,
  binding: Generation2WindowHistoryBinding,
  expectedOrdinal: number,
): Json {
  const correction = binding.authorityShapeCorrection;
  if (correction === undefined) {
    if (
      has(authority, 'boundStartingLedger') &&
      has(authority, 'boundLedger') &&
      !same(authority.boundStartingLedger, authority.boundLedger)
    ) {
      refuse(
        'HISTORY_AUTHORITY_SHAPE_CONFLICT',
        `window ${String(expectedOrdinal)}: the authority carries two different starting-ledger bindings`,
      );
    }
    return asObject(authority.boundStartingLedger, 'boundStartingLedger');
  }
  const mapping = validateAuthorityShapeCorrection(authority, binding, correction, expectedOrdinal);
  if (has(authority, mapping.canonicalField)) {
    refuse(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_APPLICABLE',
      `window ${String(expectedOrdinal)}: the authority carries the canonical ${mapping.canonicalField}; a correction is never consulted for it`,
    );
  }
  return asObject(authority[mapping.sourceField], mapping.sourceField);
}

function validateAuthorityShapeCorrection(
  authority: Json,
  binding: Generation2WindowHistoryBinding,
  correction: AuthorityShapeCorrectionBinding,
  expectedOrdinal: number,
): (typeof APPROVED_AUTHORITY_SHAPE_CORRECTIONS)[number] {
  const ordinal = String(expectedOrdinal);
  const record = parseBound(correction.record, `window ${ordinal} authority-shape correction`);
  if (
    record.recordKind !== AUTHORITY_SHAPE_CORRECTION_RECORD_KIND ||
    record.generationId !== GENERATION2_ID ||
    record.windowOrdinal !== expectedOrdinal
  ) {
    refuse(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND',
      `window ${ordinal}: the correction is not a Generation-2 authority-shape correction for this window`,
    );
  }
  const grants = Object.keys(record).filter(
    (key) => /Authori[sz]ed$/.test(key) && record[key] !== false,
  );
  if (record.isLiveAuthority !== false || !same(record.thisFileAuthorises, []) || grants.length) {
    refuse(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_GRANTS_AUTHORITY',
      `window ${ordinal}: the correction grants authority (${grants.join(', ') || 'live'})`,
    );
  }
  const bound = asObject(record.boundAuthority, 'correction.boundAuthority');
  const windowSpec = asObject(authority.boundWindowSpec, 'boundWindowSpec');
  if (
    bound.path !== binding.authority.path ||
    bound.sha256 !== binding.authority.sha256 ||
    bound.bytes !== Buffer.byteLength(binding.authority.text, 'utf8') ||
    !/^[0-9a-f]{40}$/.test(correction.authorityCommit) ||
    bound.commit !== correction.authorityCommit ||
    record.boundWindowSpecHash !== windowSpec.windowSpecHash
  ) {
    refuse(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_FOR_THIS_AUTHORITY',
      `window ${ordinal}: the correction does not bind this authority's exact path, commit, bytes and window spec`,
    );
  }
  const overrides = CORRECTION_FORBIDDEN_KEYS.filter((key) => has(record, key));
  const block = asObject(record.authorityShapeCorrection, 'authorityShapeCorrection');
  const mapping = APPROVED_AUTHORITY_SHAPE_CORRECTIONS.find(
    (approved) =>
      approved.ownerRuling === block.ownerRuling &&
      approved.windowOrdinal === expectedOrdinal &&
      approved.authoritySha256 === binding.authority.sha256 &&
      approved.sourceField === block.sourceField &&
      approved.canonicalField === block.canonicalField,
  );
  if (
    overrides.length !== 0 ||
    !same(Object.keys(block).sort(), [...CORRECTION_BLOCK_FIELDS]) ||
    mapping === undefined ||
    !asArray(record.ownerRulings, 'ownerRulings').includes(mapping.ownerRuling) ||
    block.valuesAltered !== false ||
    block.otherFieldsRemapped !== false ||
    block.originalBytesRemainAuthoritative !== true ||
    block.scope !== `EXACT_PINNED_WINDOW_${ordinal.padStart(2, '0')}_AUTHORITY_ONLY`
  ) {
    refuse(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_APPROVED',
      `window ${ordinal}: the correction is not exactly one approved, value-preserving field alias${overrides.length ? ` (it carries ${overrides.join(', ')})` : ''}`,
    );
  }
  if (!has(authority, mapping.sourceField)) {
    refuse(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_APPLICABLE',
      `window ${ordinal}: the authority has no ${mapping.sourceField}`,
    );
  }
  const source = asObject(authority[mapping.sourceField], mapping.sourceField);
  if (sha256(canonicalStringify(source)) !== block.sourceValueCanonicalSha256) {
    refuse(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_VALUE_MISMATCH',
      `window ${ordinal}: the authority's ${mapping.sourceField} is not the value the correction pinned`,
    );
  }
  return mapping;
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

/** identityOf, refusing an absent field instead of letting canonicalStringify throw on it. */
function requiredIdentityOf(item: Json, what: string): Record<string, unknown> {
  for (const field of WORK_ITEM_IDENTITY_FIELDS) {
    if (item[field] === undefined) refuse('HISTORY_RECORD_SHAPE', `${what}.${field} is absent`);
  }
  return identityOf(item);
}

// ---------------------------------------------------------------------------
// The LIVE_RESULT contract (the one implementation; replayWindow calls it).
// ---------------------------------------------------------------------------

/**
 * What a window's LIVE_RESULT is checked against. Every value comes from the
 * window's authority and the ledger revision it ran against - never from the
 * LIVE_RESULT itself - so a caller can check a LIVE_RESULT before it is
 * committed, exactly as the replay later will.
 */
export interface Generation2LiveResultExpectation {
  readonly windowOrdinal: number;
  /** The authority binding the LIVE_RESULT's boundAuthority must name exactly. */
  readonly authority: CommittedRecordBinding;
  /** The authority's boundWindowSpec.windowSpecHash. */
  readonly windowSpecHash: string;
  /** The authority's authorisedWorkItems, in authorised order. */
  readonly authorisedWorkItems: readonly Readonly<Record<string, unknown>>[];
  /** The authority's exactOrder. */
  readonly exactOrder: readonly string[];
  /** The ledger revision during the window: after the pre-network append. */
  readonly ledgerHash: string;
  readonly ledgerEntryCount: number;
}

/**
 * Validates one Generation-2 LIVE_RESULT against its expectation and returns
 * its executed items. PURE. Refuses (Generation2OperationalRefusal) on:
 * wrong kind / generation / live-authority flag, an inexact boundAuthority
 * {path, sha256, bytes}, another window spec, another ledger revision,
 * executed items that are not an exact prefix of the authorised order,
 * duplicated items or run references, a malformed run reference, anything
 * but one clean completed non-dry run per item, invocation accounting that
 * does not match, and a top-level stops.itemsNotStarted that is absent, not
 * an array of strings, or not the authorised order's unexecuted suffix.
 * A malformed record is a HISTORY_RECORD_SHAPE refusal, never a raw error.
 */
export function validateGeneration2LiveResultForHistory(
  liveResult: CommittedRecordBinding,
  expected: Generation2LiveResultExpectation,
): readonly Readonly<Record<string, unknown>>[] {
  const ordinal = String(expected.windowOrdinal);
  const size = expected.exactOrder.length;
  if (expected.authorisedWorkItems.length !== size) {
    refuse('HISTORY_AUTHORITY_ORDER', `window ${ordinal}: the authorised order is not exact`);
  }
  const live = parseBound(liveResult, `window ${ordinal} LIVE_RESULT`);
  if (
    live.recordKind !== 'GENERATION2_WINDOW_LIVE_RESULT' ||
    live.generationId !== GENERATION2_ID ||
    live.isLiveAuthority !== false
  ) {
    refuse('HISTORY_LIVE_RESULT_KIND', `window ${ordinal}: not a Generation-2 LIVE_RESULT`);
  }
  requireRef(
    live.boundAuthority,
    expected.authority,
    'HISTORY_LIVE_RESULT_AUTHORITY',
    `window ${ordinal} LIVE_RESULT.boundAuthority`,
  );
  if (live.windowSpecHash !== expected.windowSpecHash) {
    refuse(
      'HISTORY_LIVE_RESULT_AUTHORITY',
      `window ${ordinal}: the LIVE_RESULT names another window spec`,
    );
  }
  const liveLedger = asObject(live.ledgerDuringTheWindow, 'ledgerDuringTheWindow');
  if (
    liveLedger.ledgerHash !== expected.ledgerHash ||
    liveLedger.entryCount !== expected.ledgerEntryCount
  ) {
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
    const authorisedItem = asObject(expected.authorisedWorkItems[k], 'authorisedWorkItems[]');
    if (
      !same(
        requiredIdentityOf(item, `LIVE_RESULT.items[${String(k)}]`),
        requiredIdentityOf(authorisedItem, `authorisedWorkItems[${String(k)}]`),
      )
    ) {
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
  // The canonical field is TOP-LEVEL stops.itemsNotStarted; its shape is
  // required before it is compared, so an absent field is a refusal.
  const itemsNotStarted = asArray(stops.itemsNotStarted, 'LIVE_RESULT.stops.itemsNotStarted').map(
    (v) => asString(v, 'LIVE_RESULT.stops.itemsNotStarted[]'),
  );
  if (
    invocations.used !== liveItems.length ||
    invocations.retries !== 0 ||
    !same(itemsNotStarted, expected.exactOrder.slice(liveItems.length))
  ) {
    refuse(
      'HISTORY_LIVE_RESULT_ITEMS',
      `window ${ordinal}: invocation accounting does not match the executed items`,
    );
  }
  return liveItems;
}

// ---------------------------------------------------------------------------
// One window.
// ---------------------------------------------------------------------------

export interface ReplayedWindow {
  readonly windowOrdinal: number;
  readonly authority: { readonly path: string; readonly sha256: string };
  readonly liveResult: { readonly path: string; readonly sha256: string };
  readonly adjudication: { readonly path: string; readonly sha256: string };
  /** Present only when the window's authority was read through an explicit correction. */
  readonly authorityShapeCorrection?: { readonly path: string; readonly sha256: string };
  /** Present only when the window ran under a verified non-default cadence decision. */
  readonly cadenceAuthority?: { readonly path: string; readonly sha256: string };
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
    /** Always the ORIGINAL ordinary run reference, recovered or not. */
    readonly runRefSha256: string;
    /** Present only when the item's verdict comes from an accepted host recovery. */
    readonly acquisitionOfRecord?: ReplayedAcquisitionOfRecord;
  }[];
  /** Present only when the window's binding carries targeted host recoveries. */
  readonly recoveryExtension?: typeof HOST_RECOVERY_EXTENSION_VERSION;
  readonly targetedHostRecoveries?: readonly ReplayedAcquisitionOfRecord[];
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
  priorWindows: readonly ReplayedWindow[],
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
  const start = resolveBoundStartingLedger(authority, binding, expectedOrdinal);
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
  // A window may begin with ASSIGNED slots (an earlier window's unexecuted
  // occupants). They are not Q1 and take no new entry: `applyLedgerEntry`
  // refuses re-assigning one. They are required members below.
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
  // Replacement members are EVERY slot assigned after the append - carry-in
  // occupants and this window's new Q1 entries alike - on its exact ledger
  // entry, in ledger-sequence order; primaries fill the rest. Only a verified
  // cadence decision moves the SAME replacements behind the primaries. The
  // ledger append above is replayed first either way.
  const replacementGroup = stateBefore.replacementAssignedAwaitingExecution
    .map((index) => {
      const slot = slots.get(index)!;
      const entry = ledger.entries[slot.assignedSequence!];
      if (
        entry === undefined ||
        slot.assignedSequence! >= afterAppend ||
        entry.selectionIndex !== index ||
        entry.generation2ReserveRankPosition !== slot.assignedPosition
      ) {
        refuse(
          'HISTORY_ASSIGNED_OCCUPANT_NOT_IN_LEDGER',
          `window ${ordinal}: assigned slot ${String(index)} is not its ledger entry`,
        );
      }
      return entry;
    })
    .sort((a, b) => a.sequence - b.sequence);
  const cadence = cadenceOfAuthority(authority, binding.cadenceAuthority, expectedOrdinal);
  const replacementCount = replacementGroup.length;
  const primaryCount = size - replacementCount;
  if (primaryCount < 0) {
    refuse(
      'REPLACEMENT_OBLIGATIONS_EXCEED_WINDOW',
      `window ${ordinal}: ${String(replacementCount)} replacement obligations exceed ${String(size)} items`,
    );
  }
  const replacementsLead = cadence === 'Q1_REPLACEMENTS_THEN_PRIMARIES';
  const expectedPrimaries = stateBefore.neverStarted.slice(0, primaryCount);
  authorised.forEach((item, k) => {
    const replacementIndex = replacementsLead
      ? k < replacementCount
        ? k
        : null
      : k >= primaryCount
        ? k - primaryCount
        : null;
    const replacement = replacementIndex === null ? null : replacementGroup[replacementIndex]!;
    const slotIndex =
      replacement?.selectionIndex ?? expectedPrimaries[replacementsLead ? k - replacementCount : k];
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
  const liveItems = validateGeneration2LiveResultForHistory(binding.liveResult, {
    windowOrdinal: expectedOrdinal,
    authority: binding.authority,
    windowSpecHash,
    authorisedWorkItems: authorised,
    exactOrder,
    ledgerHash: ledgerHashAfterAppend,
    ledgerEntryCount: afterAppend,
  });

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
  const recoveries = supplyRecoveries(binding, expectedOrdinal);
  const consumedRecoveries = new Set<TargetedHostRecoveryBinding>();
  const recoveredHere: ReplayedAcquisitionOfRecord[] = [];
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
    let acquisitionOfRecord: ReplayedAcquisitionOfRecord | undefined;
    if (has(item, 'acquisitionOfRecord')) {
      acquisitionOfRecord = acceptRecoveredItem(item, integrity, liveItem, {
        ordinal,
        expectedOrdinal,
        binding,
        recoveries,
        consumedRecoveries,
        recoveredHere,
        liveItems,
        priorWindows,
        ledger,
        afterAppend,
        ledgerHashAfterAppend,
      });
      recoveredHere.push(acquisitionOfRecord);
    } else if (integrity.verdict !== 'CLEAN') {
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
      ...(acquisitionOfRecord === undefined ? {} : { acquisitionOfRecord }),
    });
  });
  const stateAfter = snapshot(slots);
  if (recoveries !== undefined) {
    const unused = recoveries.filter((recovery) => !consumedRecoveries.has(recovery));
    if (unused.length !== 0) {
      refuse(
        'HOST_RECOVERY_BINDING_UNUSED',
        `window ${ordinal}: ${String(unused.length)} supplied recovery chain(s) accepted by no adjudicated item`,
      );
    }
    requireOriginalWindowStopHistoryPreserved(
      adjudication,
      binding.liveResult,
      recoveries.map((recovery) => recovery.incidentRuling),
      recoveredHere.map((aor) => aor.incident.workItemId),
    );
  }

  requireSummaryAgreement(basis, adjudication, {
    ordinal,
    stateBefore,
    stateAfter,
    ledgerEntryCount: afterAppend,
    ledgerHash: ledgerHashAfterAppend,
    executed,
    size,
    recovered: executed.filter((e) => e.acquisitionOfRecord !== undefined).map((e) => e.workItemId),
  });

  return {
    cursor: afterAppend,
    window: {
      windowOrdinal: expectedOrdinal,
      authority: { path: binding.authority.path, sha256: binding.authority.sha256 },
      liveResult: { path: binding.liveResult.path, sha256: binding.liveResult.sha256 },
      adjudication: { path: binding.adjudication.path, sha256: binding.adjudication.sha256 },
      ...(binding.authorityShapeCorrection === undefined
        ? {}
        : {
            authorityShapeCorrection: {
              path: binding.authorityShapeCorrection.record.path,
              sha256: binding.authorityShapeCorrection.record.sha256,
            },
          }),
      ...(binding.cadenceAuthority === undefined
        ? {}
        : {
            cadenceAuthority: {
              path: binding.cadenceAuthority.path,
              sha256: binding.cadenceAuthority.sha256,
            },
          }),
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
      ...(recoveries === undefined
        ? {}
        : {
            recoveryExtension: HOST_RECOVERY_EXTENSION_VERSION,
            targetedHostRecoveries: recoveredHere,
          }),
      stateBefore,
      stateAfter,
    },
  };
}

/** The window's supplied recovery chains: absent, or a non-empty list of distinct incidents. */
function supplyRecoveries(
  binding: Generation2WindowHistoryBinding,
  expectedOrdinal: number,
): readonly TargetedHostRecoveryBinding[] | undefined {
  const recoveries = binding.targetedHostRecoveries;
  if (recoveries === undefined) return undefined;
  if (recoveries.length === 0) {
    refuse(
      'HOST_RECOVERY_BINDING_UNUSED',
      `window ${String(expectedOrdinal)}: an empty recovery list is not "no recovery"; omit it`,
    );
  }
  const incidents = recoveries.map((recovery) => canonicalStringify(incidentOfBinding(recovery)));
  if (new Set(incidents).size !== incidents.length) {
    refuse(
      'HOST_RECOVERY_ALREADY_EXISTS_FOR_INCIDENT',
      `window ${String(expectedOrdinal)}: two recovery chains for one incident`,
    );
  }
  return recoveries;
}

/**
 * One adjudicated item that claims an acquisition of record: exactly one
 * supplied chain for its incident, validated in full (eligibility E1-E14 and
 * every hop), and an acquisitionOfRecord block naming that chain. PURE.
 */
function acceptRecoveredItem(
  item: Json,
  integrity: Json,
  liveItem: Readonly<Record<string, unknown>>,
  ctx: {
    readonly ordinal: string;
    readonly expectedOrdinal: number;
    readonly binding: Generation2WindowHistoryBinding;
    readonly recoveries: readonly TargetedHostRecoveryBinding[] | undefined;
    readonly consumedRecoveries: Set<TargetedHostRecoveryBinding>;
    readonly recoveredHere: readonly ReplayedAcquisitionOfRecord[];
    readonly liveItems: readonly Readonly<Record<string, unknown>>[];
    readonly priorWindows: readonly ReplayedWindow[];
    readonly ledger: OperationalGeneration2Ledger;
    readonly afterAppend: number;
    readonly ledgerHashAfterAppend: string;
  },
): ReplayedAcquisitionOfRecord {
  const workItemId = liveItem.workItemId as string;
  if (integrity.verdict === 'CLEAN') {
    refuse(
      'HOST_RECOVERY_TARGET_WAS_CLEAN',
      `window ${ctx.ordinal}: ${workItemId} is CLEAN; a clean item never carries an acquisition of record`,
    );
  }
  const incident = {
    windowOrdinal: ctx.expectedOrdinal,
    workItemId,
    originalRunRefSha256: liveItem.runRefSha256 as string,
  };
  const matching = (ctx.recoveries ?? []).filter((recovery) =>
    same(incidentOfBinding(recovery), incident),
  );
  if (matching.length !== 1) {
    refuse(
      'HOST_RECOVERY_BINDING_MISSING',
      `window ${ctx.ordinal}: ${workItemId} claims an acquisition of record but no supplied recovery chain is for its incident`,
    );
  }
  const recovery = matching[0]!;
  const prior = ctx.priorWindows.flatMap((w) => w.executed);
  const priorAors = [
    ...prior.flatMap((e) => (e.acquisitionOfRecord === undefined ? [] : [e.acquisitionOfRecord])),
    ...ctx.recoveredHere,
  ];
  const validated = validateTargetedHostRecovery(recovery, {
    windowOrdinal: ctx.expectedOrdinal,
    authority: ctx.binding.authority,
    liveResult: ctx.binding.liveResult,
    validatedLiveItems: ctx.liveItems,
    incident,
    ledgerEntries: ctx.ledger.entries.slice(0, ctx.afterAppend),
    ledgerDuringWindow: { entryCount: ctx.afterAppend, ledgerHash: ctx.ledgerHashAfterAppend },
    priorAdjudicatedWorkItemIds: prior.map((e) => e.workItemId),
    ordinaryRunRefs: [
      ...prior.map((e) => e.runRefSha256),
      ...ctx.liveItems.map((live) => live.runRefSha256 as string),
    ],
    priorRecoveryRunRefs: priorAors.map((aor) => aor.runRefSha256),
    priorRecoveryIncidents: priorAors.map((aor) => aor.incident),
  });
  const accepted = validateAcquisitionOfRecord(item, recovery, validated);
  ctx.consumedRecoveries.add(recovery);
  return accepted;
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
    recovered: readonly string[];
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
  // Only a window that accepted a recovery names its recovered items; any other omits the key.
  if (replay.recovered.length !== 0) {
    check(
      'windowSummary.acquisitionOfRecordRecovered',
      summary.acquisitionOfRecordRecovered,
      replay.recovered,
    );
  } else if (Object.hasOwn(summary, 'acquisitionOfRecordRecovered')) {
    mismatches.push('windowSummary.acquisitionOfRecordRecovered');
  }

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
  /** Present only when some window accepted a targeted host recovery. */
  readonly recoveryExtension?: typeof HOST_RECOVERY_EXTENSION_VERSION;
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
    const next = replayWindow(basis, ledger, slots, cursor, binding, k + 1, windows);
    windows.push(next.window);
    cursor = next.cursor;
  });
  for (const entry of ledger.entries.slice(cursor)) applyLedgerEntry(slots, entry);
  const final = snapshot(slots);
  accountingOf(final);
  return {
    bridgeVersion: HISTORY_BRIDGE_VERSION,
    ...(windows.some((window) => window.recoveryExtension !== undefined)
      ? { recoveryExtension: HOST_RECOVERY_EXTENSION_VERSION }
      : {}),
    windows,
    consumedLedgerEntryCount: cursor,
    final,
  };
}

/** The public-safe identity of a replayed history: paths, hashes and ordinals only. */
export function historyBindingOf(replay: Generation2HistoryReplay) {
  return {
    bridgeVersion: replay.bridgeVersion,
    ...(replay.recoveryExtension === undefined
      ? {}
      : { recoveryExtension: replay.recoveryExtension }),
    windowCount: replay.windows.length,
    consumedLedgerEntryCount: replay.consumedLedgerEntryCount,
    windows: replay.windows.map((window) => ({
      windowOrdinal: window.windowOrdinal,
      authority: window.authority,
      liveResult: window.liveResult,
      adjudication: window.adjudication,
      ...(window.authorityShapeCorrection === undefined
        ? {}
        : { authorityShapeCorrection: window.authorityShapeCorrection }),
      ...(window.cadenceAuthority === undefined
        ? {}
        : { cadenceAuthority: window.cadenceAuthority }),
      ...(window.targetedHostRecoveries === undefined
        ? {}
        : { targetedHostRecoveries: window.targetedHostRecoveries }),
      windowSpecHash: window.windowSpecHash,
      startingLedger: window.startingLedger,
      ledgerHashAfterAppend: window.ledgerHashAfterAppend,
    })),
  };
}

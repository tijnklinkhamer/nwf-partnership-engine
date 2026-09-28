/**
 * THE OPERATIONAL GENERATION-2 LEDGER: an explicit parser for the FROZEN
 * ledger shape, an independent pure validator, and the cross-generation
 * occupant resolver. PURE.
 *
 * WHY NOT THE FREEZE-TIME CAST
 *
 *   The landed Generation-2 primitives type their input as the PROPOSAL
 *   ledger (`status: 'PROPOSAL'`). The freeze verified the frozen genesis
 *   through `asGeneration2Ledger`, an intentional `as unknown as` view. That
 *   is acceptable for re-verifying a freeze; it is NOT acceptable as the
 *   authority boundary of a live window, where the ledger on disk decides
 *   which organisation is acquired. So every ledger revision here is PARSED:
 *   exact header key set, exact status FROZEN, exact bindings, a header that
 *   is canonically the pinned genesis header, entries built field by field
 *   with exact types, and a ledgerHash that recomputes. Nothing is coerced.
 *
 *   The landed validator and planner are still consulted - but only AFTER a
 *   revision has passed this parser and this validator, as a second,
 *   independent opinion that must agree (`landedProposalView`). They never
 *   stand in for the parse.
 *
 * INVARIANTS (identical to the landed Generation-2 validator)
 *
 *   sequence contiguous from 0; reserve positions contiguous from 0 and equal
 *   to the sequence; the replacement is exactly the schedule entry at that
 *   position and was never drawn by Generation 1; the split is the slot's
 *   frozen split; the replaced identity is the slot's cross-generation
 *   occupant immediately before the entry, with the matching occupant kind
 *   and previousSequenceForSlot; previousEntryHash chains; entryHash and
 *   ledgerHash recompute; reasons are the four frozen tokens; recordedAtUtc is
 *   an explicit, non-decreasing UTC instant; no position beyond 5669.
 *
 * Violation messages never carry an echeRowKey.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  currentOccupantForSelectionIndex,
  type ReplacementLedger,
} from '../continuationWindow/replacementLedger.js';
import {
  REPLACEMENT_REASON_PRECEDENCE,
  REPLACEMENT_REASONS,
  type ReplacementReason,
} from '../continuationWindow/windowContract.js';
import type { DrawArtifact } from '../draw/drawArtifact.js';
import type { Split } from '../draw/drawContract.js';
import {
  GENERATION2_ENTRY_FIELDS,
  buildGeneration1StartingState,
  type Generation1StartingState,
  type Generation2Ledger,
  type Generation2LedgerEntry,
  type Generation2ReplacedOccupantKind,
} from '../generation2/generation2Ledger.js';
import type { Generation2ReserveScheduleEntry } from '../generation2/reserveSchedule.js';
import {
  CANONICAL_SCHEDULE_HASH,
  DRAW_HASH,
  FROZEN_SCHEDULE_HASH,
  GENERATION1_LEDGER_ENTRY_COUNT,
  GENERATION1_LEDGER_HASH,
  GENERATION2_ID,
  GENESIS_LEDGER_HASH,
  PINNED,
  refuse,
} from './operationalContract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const HEX64 = /^[0-9a-f]{64}$/;
const SELECTION_COUNT = 110;
const GENERATION2_RESERVE_COUNT = 5670;
const SPLITS: readonly Split[] = ['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'];

export const FROZEN_LEDGER_RECORD = 'PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2';
export const FROZEN_LEDGER_RECORD_KIND = 'RESERVE_REPLACEMENT_LEDGER_V1_GEN2_FROZEN';

// ---------------------------------------------------------------------------
// Types.
// ---------------------------------------------------------------------------

export interface FileRef {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** Every field the frozen genesis header carries, with its exact type. */
export interface OperationalLedgerHeader {
  readonly record: string;
  readonly recordKind: string;
  readonly generationId: string;
  readonly status: 'FROZEN';
  readonly publicSafe: true;
  readonly thisFileAuthorises: readonly string[];
  readonly isLiveAuthority: false;
  readonly networkUsed: false;
  readonly databaseRead: false;
  readonly reserveAssigned: false;
  readonly acquisitionRunCreated: false;
  readonly appendOnly: true;
  readonly ownerFreezeApproval: FileRef;
  readonly generation1StartingState: Generation1StartingState;
  readonly generation1HistoryIsNotFlattened: string;
  readonly selectionDraw: FileRef & { readonly drawHash: string; readonly authority: string };
  readonly reserveSchedule: {
    readonly path: string;
    readonly scheduleHash: string;
    readonly fileSha256: string;
    readonly frozenScheduleHash: string;
  };
  readonly carryForwardBaseline: FileRef;
  readonly currentOccupantDerivation: {
    readonly version: string;
    readonly resolver: string;
    readonly chain: string;
  };
  readonly reserveCount: number;
  readonly selectionCount: number;
  readonly reserveExhaustionRefusal: string;
  readonly replacementReasons: readonly ReplacementReason[];
  readonly replacementReasonPrecedence: readonly ReplacementReason[];
  readonly hashing: {
    readonly entryHash: string;
    readonly ledgerHash: string;
    readonly derivedNotStored: string;
  };
}

export interface OperationalGeneration2Ledger extends OperationalLedgerHeader {
  readonly entries: readonly Generation2LedgerEntry[];
  readonly ledgerHash: string;
}

export const HEADER_KEYS = [
  'record',
  'recordKind',
  'generationId',
  'status',
  'publicSafe',
  'thisFileAuthorises',
  'isLiveAuthority',
  'networkUsed',
  'databaseRead',
  'reserveAssigned',
  'acquisitionRunCreated',
  'appendOnly',
  'ownerFreezeApproval',
  'generation1StartingState',
  'generation1HistoryIsNotFlattened',
  'selectionDraw',
  'reserveSchedule',
  'carryForwardBaseline',
  'currentOccupantDerivation',
  'reserveCount',
  'selectionCount',
  'reserveExhaustionRefusal',
  'replacementReasons',
  'replacementReasonPrecedence',
  'hashing',
] as const;

// ---------------------------------------------------------------------------
// Parsing helpers.
// ---------------------------------------------------------------------------

type Json = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: readonly string[], what: string): Json {
  if (!isObject(value)) refuse('LEDGER_SHAPE', `${what} is not an object`);
  const actual = Object.keys(value).sort().join(',');
  if (actual !== [...keys].sort().join(',')) {
    refuse('LEDGER_SHAPE', `${what} does not carry exactly its frozen fields`);
  }
  return value;
}

function str(value: unknown, what: string): string {
  if (typeof value !== 'string') refuse('LEDGER_SHAPE', `${what} is not a string`);
  return value;
}

function int(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    refuse('LEDGER_SHAPE', `${what} is not an integer`);
  }
  return value;
}

function literal<T>(value: unknown, expected: T, what: string): T {
  if (value !== expected) refuse('LEDGER_AUTHORITY', `${what} is not ${String(expected)}`);
  return expected;
}

function fileRef(value: unknown, pinned: { path: string; sha256: string }, what: string): FileRef {
  const ref = exactKeys(value, ['path', 'sha256', 'bytes'], what);
  if (ref.path !== pinned.path || ref.sha256 !== pinned.sha256) {
    refuse('LEDGER_BINDING', `${what} does not bind the pinned file`);
  }
  return { path: str(ref.path, what), sha256: str(ref.sha256, what), bytes: int(ref.bytes, what) };
}

function reasons(value: unknown, expected: readonly ReplacementReason[], what: string) {
  if (!Array.isArray(value) || canonicalStringify(value) !== canonicalStringify(expected)) {
    refuse('LEDGER_AUTHORITY', `${what} is not the frozen reason list`);
  }
  return [...expected];
}

/**
 * The header, parsed field by field against the freeze's authority
 * semantics. Returns a NEW object: nothing of the input is passed through
 * unchecked.
 */
export function parseLedgerHeader(value: unknown): OperationalLedgerHeader {
  const h = exactKeys(value, [...HEADER_KEYS, 'entries', 'ledgerHash'], 'ledger');
  const expectedStart = buildGeneration1StartingState(PINNED.generation1Terminal.sha256);
  if (canonicalStringify(h.generation1StartingState) !== canonicalStringify(expectedStart)) {
    refuse('LEDGER_BINDING', 'generation1StartingState does not bind the Generation-1 terminal');
  }
  if (!Array.isArray(h.thisFileAuthorises) || h.thisFileAuthorises.length !== 0) {
    refuse('LEDGER_AUTHORITY', 'the ledger claims to authorise something');
  }
  const draw = exactKeys(
    h.selectionDraw,
    ['path', 'sha256', 'bytes', 'drawHash', 'authority'],
    'selectionDraw',
  );
  if (
    draw.path !== PINNED.draw.path ||
    draw.sha256 !== PINNED.draw.sha256 ||
    draw.drawHash !== DRAW_HASH
  ) {
    refuse('LEDGER_BINDING', 'selectionDraw does not bind the frozen draw');
  }
  const schedule = exactKeys(
    h.reserveSchedule,
    ['path', 'scheduleHash', 'fileSha256', 'frozenScheduleHash'],
    'reserveSchedule',
  );
  if (
    schedule.path !== PINNED.frozenSchedule.path ||
    schedule.fileSha256 !== PINNED.frozenSchedule.sha256 ||
    schedule.scheduleHash !== CANONICAL_SCHEDULE_HASH ||
    schedule.frozenScheduleHash !== FROZEN_SCHEDULE_HASH
  ) {
    refuse('LEDGER_BINDING', 'reserveSchedule does not bind the frozen schedule');
  }
  const derivation = exactKeys(
    h.currentOccupantDerivation,
    ['version', 'resolver', 'chain'],
    'currentOccupantDerivation',
  );
  if (derivation.version !== 'GENERATION2_CROSS_GENERATION_OCCUPANT_RESOLUTION_V1') {
    refuse('LEDGER_AUTHORITY', 'unknown occupant derivation');
  }
  const hashing = exactKeys(h.hashing, ['entryHash', 'ledgerHash', 'derivedNotStored'], 'hashing');
  if (int(h.reserveCount, 'reserveCount') !== GENERATION2_RESERVE_COUNT) {
    refuse('LEDGER_AUTHORITY', 'reserveCount is not 5670');
  }
  if (int(h.selectionCount, 'selectionCount') !== SELECTION_COUNT) {
    refuse('LEDGER_AUTHORITY', 'selectionCount is not 110');
  }
  return {
    record: literal(h.record, FROZEN_LEDGER_RECORD, 'record'),
    recordKind: literal(h.recordKind, FROZEN_LEDGER_RECORD_KIND, 'recordKind'),
    generationId: literal(h.generationId, GENERATION2_ID, 'generationId'),
    status: literal(h.status, 'FROZEN' as const, 'status'),
    publicSafe: literal(h.publicSafe, true as const, 'publicSafe'),
    thisFileAuthorises: [],
    isLiveAuthority: literal(h.isLiveAuthority, false as const, 'isLiveAuthority'),
    networkUsed: literal(h.networkUsed, false as const, 'networkUsed'),
    databaseRead: literal(h.databaseRead, false as const, 'databaseRead'),
    reserveAssigned: literal(h.reserveAssigned, false as const, 'reserveAssigned'),
    acquisitionRunCreated: literal(
      h.acquisitionRunCreated,
      false as const,
      'acquisitionRunCreated',
    ),
    appendOnly: literal(h.appendOnly, true as const, 'appendOnly'),
    ownerFreezeApproval: fileRef(
      h.ownerFreezeApproval,
      PINNED.methodologyV3Approval,
      'ownerFreezeApproval',
    ),
    generation1StartingState: expectedStart,
    generation1HistoryIsNotFlattened: str(
      h.generation1HistoryIsNotFlattened,
      'generation1HistoryIsNotFlattened',
    ),
    selectionDraw: {
      path: PINNED.draw.path,
      sha256: PINNED.draw.sha256,
      bytes: int(draw.bytes, 'selectionDraw.bytes'),
      drawHash: DRAW_HASH,
      authority: str(draw.authority, 'selectionDraw.authority'),
    },
    reserveSchedule: {
      path: PINNED.frozenSchedule.path,
      scheduleHash: CANONICAL_SCHEDULE_HASH,
      fileSha256: PINNED.frozenSchedule.sha256,
      frozenScheduleHash: FROZEN_SCHEDULE_HASH,
    },
    carryForwardBaseline: fileRef(
      h.carryForwardBaseline,
      PINNED.carryForwardBaseline,
      'carryForwardBaseline',
    ),
    currentOccupantDerivation: {
      version: 'GENERATION2_CROSS_GENERATION_OCCUPANT_RESOLUTION_V1',
      resolver: str(derivation.resolver, 'resolver'),
      chain: str(derivation.chain, 'chain'),
    },
    reserveCount: GENERATION2_RESERVE_COUNT,
    selectionCount: SELECTION_COUNT,
    reserveExhaustionRefusal: literal(
      h.reserveExhaustionRefusal,
      'CORPUS_FREEZE_REFUSED',
      'reserveExhaustionRefusal',
    ),
    replacementReasons: reasons(h.replacementReasons, REPLACEMENT_REASONS, 'replacementReasons'),
    replacementReasonPrecedence: reasons(
      h.replacementReasonPrecedence,
      REPLACEMENT_REASON_PRECEDENCE,
      'replacementReasonPrecedence',
    ),
    hashing: {
      entryHash: str(hashing.entryHash, 'hashing.entryHash'),
      ledgerHash: str(hashing.ledgerHash, 'hashing.ledgerHash'),
      derivedNotStored: str(hashing.derivedNotStored, 'hashing.derivedNotStored'),
    },
  };
}

function parseEntry(value: unknown, at: string): Generation2LedgerEntry {
  const e = exactKeys(value, GENERATION2_ENTRY_FIELDS, at);
  const split = str(e.split, `${at}.split`);
  if (!(SPLITS as readonly string[]).includes(split))
    refuse('LEDGER_SHAPE', `${at}: unknown split`);
  const reason = str(e.reason, `${at}.reason`);
  if (!(REPLACEMENT_REASONS as readonly string[]).includes(reason)) {
    refuse('LEDGER_SHAPE', `${at}: unknown reason`);
  }
  const kind = str(e.replacedOccupantKind, `${at}.replacedOccupantKind`);
  if (kind !== 'GENERATION1_TERMINAL_OCCUPANT' && kind !== 'GENERATION2_RESERVE_REPLACEMENT') {
    refuse('LEDGER_SHAPE', `${at}: unknown replacedOccupantKind`);
  }
  const nullableInt = (v: unknown, what: string): number | null =>
    v === null ? null : int(v, what);
  const nullableStr = (v: unknown, what: string): string | null =>
    v === null ? null : str(v, what);
  return {
    sequence: int(e.sequence, `${at}.sequence`),
    selectionIndex: int(e.selectionIndex, `${at}.selectionIndex`),
    split: split as Split,
    replacedEcheRowKey: str(e.replacedEcheRowKey, `${at}.replacedEcheRowKey`),
    replacementEcheRowKey: str(e.replacementEcheRowKey, `${at}.replacementEcheRowKey`),
    generation2ReserveRankPosition: int(e.generation2ReserveRankPosition, `${at}.position`),
    reason: reason as ReplacementReason,
    recordedAtUtc: str(e.recordedAtUtc, `${at}.recordedAtUtc`),
    replacedOccupantKind: kind,
    previousSequenceForSlot: nullableInt(
      e.previousSequenceForSlot,
      `${at}.previousSequenceForSlot`,
    ),
    previousEntryHash: nullableStr(e.previousEntryHash, `${at}.previousEntryHash`),
    entryHash: str(e.entryHash, `${at}.entryHash`),
  };
}

export function recomputeOperationalLedgerHash(ledger: object): string {
  const clone = { ...ledger } as Record<string, unknown>;
  delete clone.ledgerHash;
  return sha256(canonicalStringify(clone));
}

/**
 * Parses any revision of the Generation-2 ledger. Its header must be
 * canonically the pinned genesis header; its ledgerHash must recompute. This
 * says nothing yet about the entries' chain - that is the validator's job.
 */
export function parseOperationalGeneration2Ledger(
  value: unknown,
  genesis: OperationalGeneration2Ledger,
): OperationalGeneration2Ledger {
  const header = parseLedgerHeader(value);
  const raw = value as Json;
  if (canonicalStringify(header) !== canonicalStringify(headerOf(genesis))) {
    refuse('LEDGER_NOT_GENESIS_EXTENSION', 'the header is not the frozen genesis header');
  }
  if (!Array.isArray(raw.entries)) refuse('LEDGER_SHAPE', 'entries is not an array');
  const entries = (raw.entries as unknown[]).map((entry, k) =>
    parseEntry(entry, `entry ${String(k)}`),
  );
  const ledgerHash = str(raw.ledgerHash, 'ledgerHash');
  const parsed: OperationalGeneration2Ledger = { ...header, entries, ledgerHash };
  if (!HEX64.test(ledgerHash) || recomputeOperationalLedgerHash(parsed) !== ledgerHash) {
    refuse('LEDGER_HASH', 'ledgerHash does not recompute');
  }
  return parsed;
}

/** The committed genesis: pinned file bytes, zero entries, pinned ledgerHash. */
export function parseFrozenGenesisLedger(text: string): OperationalGeneration2Ledger {
  if (sha256(text) !== PINNED.genesisLedger.sha256) {
    refuse('GENESIS_NOT_PINNED', 'the genesis ledger file is not the frozen bytes');
  }
  const value = JSON.parse(text) as unknown;
  const header = parseLedgerHeader(value);
  const raw = value as Json;
  if (!Array.isArray(raw.entries) || raw.entries.length !== 0) {
    refuse('GENESIS_NOT_EMPTY', 'the frozen genesis ledger is not empty');
  }
  const genesis: OperationalGeneration2Ledger = {
    ...header,
    entries: [],
    ledgerHash: str(raw.ledgerHash, 'ledgerHash'),
  };
  if (
    genesis.ledgerHash !== GENESIS_LEDGER_HASH ||
    recomputeOperationalLedgerHash(genesis) !== GENESIS_LEDGER_HASH
  ) {
    refuse('GENESIS_NOT_PINNED', 'the genesis ledgerHash is not the frozen hash');
  }
  return genesis;
}

export function headerOf(ledger: OperationalGeneration2Ledger): OperationalLedgerHeader {
  const clone = { ...ledger } as Record<string, unknown>;
  delete clone.entries;
  delete clone.ledgerHash;
  return clone as unknown as OperationalLedgerHeader;
}

/** A revision with a given entry list, hashed. Used by the append builder. */
export function withEntries(
  genesis: OperationalGeneration2Ledger,
  entries: readonly Generation2LedgerEntry[],
): OperationalGeneration2Ledger {
  const payload = { ...headerOf(genesis), entries: [...entries] };
  return { ...payload, ledgerHash: sha256(canonicalStringify(payload)) };
}

/** The ledgerHash the ledger had after its first `count` entries. */
export function prefixLedgerHash(ledger: OperationalGeneration2Ledger, count: number): string {
  return withEntries(ledger, ledger.entries.slice(0, count)).ledgerHash;
}

// ---------------------------------------------------------------------------
// The validator.
// ---------------------------------------------------------------------------

export interface LedgerBasis {
  readonly draw: DrawArtifact;
  readonly generation1Ledger: ReplacementLedger;
  readonly schedule: readonly Generation2ReserveScheduleEntry[];
  readonly genesis: OperationalGeneration2Ledger;
}

export type OperationalLedgerValidation =
  | { readonly valid: true; readonly entryCount: number }
  | { readonly valid: false; readonly violations: readonly string[] };

export function computeEntryHash(payload: Omit<Generation2LedgerEntry, 'entryHash'>): string {
  return sha256(canonicalStringify(payload));
}

export function validateOperationalGeneration2Ledger(
  basis: LedgerBasis,
  ledger: OperationalGeneration2Ledger,
): OperationalLedgerValidation {
  const violations: string[] = [];
  const fail = (message: string): void => {
    violations.push(message);
  };
  if (basis.generation1Ledger.ledgerHash !== GENERATION1_LEDGER_HASH) {
    fail('the Generation-1 ledger is not the terminal ledger');
  }
  if (basis.generation1Ledger.entries.length !== GENERATION1_LEDGER_ENTRY_COUNT) {
    fail('the Generation-1 ledger does not hold 39 entries');
  }
  if (basis.schedule.length !== GENERATION2_RESERVE_COUNT)
    fail('schedule does not hold 5670 entries');
  if (canonicalStringify(headerOf(ledger)) !== canonicalStringify(headerOf(basis.genesis))) {
    fail('the header is not the frozen genesis header');
  }
  if (recomputeOperationalLedgerHash(ledger) !== ledger.ledgerHash)
    fail('ledgerHash does not recompute');

  const generation1Keys = new Set<string>([
    ...basis.draw.selection.map((entry) => entry.echeRowKey),
    ...basis.draw.reserve.map((entry) => entry.echeRowKey),
  ]);
  const occupantBySlot = new Map<number, { key: string; sequence: number }>();
  const used = new Set<string>();
  const usedSequences = new Set<number>();
  let previousHash: string | null = null;
  let previousRecordedAt = '';

  ledger.entries.forEach((entry, k) => {
    const at = `entry ${String(k)}`;
    if (entry.sequence !== k || usedSequences.has(entry.sequence))
      fail(`${at}: sequence is not ${String(k)}`);
    usedSequences.add(entry.sequence);
    if (k >= GENERATION2_RESERVE_COUNT)
      fail(`${at}: Generation-2 reserve exhausted - CORPUS_FREEZE_REFUSED`);
    if (entry.generation2ReserveRankPosition !== k) {
      fail(
        `${at}: generation2ReserveRankPosition breaks monotonic assignment (expected ${String(k)})`,
      );
    }
    if (entry.selectionIndex < 0 || entry.selectionIndex >= SELECTION_COUNT) {
      fail(`${at}: selectionIndex is not a frozen selection slot`);
      return;
    }
    const slot = basis.draw.selection[entry.selectionIndex]!;
    if (entry.split !== slot.split) fail(`${at}: split differs from the slot's frozen split`);
    const scheduled = basis.schedule[entry.generation2ReserveRankPosition];
    if (scheduled === undefined || scheduled.echeRowKey !== entry.replacementEcheRowKey) {
      fail(`${at}: replacement identity is not the schedule entry at its position`);
    }
    if (generation1Keys.has(entry.replacementEcheRowKey)) {
      fail(`${at}: replacement identity was drawn by Generation 1`);
    }
    if (used.has(entry.replacementEcheRowKey)) fail(`${at}: replacement identity already assigned`);
    used.add(entry.replacementEcheRowKey);

    const prior = occupantBySlot.get(entry.selectionIndex);
    const expectedReplaced =
      prior === undefined
        ? currentOccupantForSelectionIndex(
            basis.draw,
            basis.generation1Ledger,
            entry.selectionIndex,
          ).echeRowKey
        : prior.key;
    const expectedKind: Generation2ReplacedOccupantKind =
      prior === undefined ? 'GENERATION1_TERMINAL_OCCUPANT' : 'GENERATION2_RESERVE_REPLACEMENT';
    if (entry.replacedEcheRowKey !== expectedReplaced) {
      fail(`${at}: replaced identity is not the slot's occupant immediately before this entry`);
    }
    if (entry.replacedOccupantKind !== expectedKind)
      fail(`${at}: replacedOccupantKind is not ${expectedKind}`);
    if (entry.previousSequenceForSlot !== (prior === undefined ? null : prior.sequence)) {
      fail(
        `${at}: previousSequenceForSlot does not point at the slot's previous Generation-2 entry`,
      );
    }
    occupantBySlot.set(entry.selectionIndex, { key: entry.replacementEcheRowKey, sequence: k });

    if (!ISO_UTC.test(entry.recordedAtUtc)) {
      fail(`${at}: recordedAtUtc is not an explicit ISO-8601 UTC instant`);
    } else {
      if (entry.recordedAtUtc < previousRecordedAt) fail(`${at}: recordedAtUtc goes backwards`);
      previousRecordedAt = entry.recordedAtUtc;
    }
    if (entry.previousEntryHash !== previousHash) fail(`${at}: previousEntryHash does not chain`);
    const payload = { ...entry } as Record<string, unknown>;
    delete payload.entryHash;
    if (!HEX64.test(entry.entryHash) || sha256(canonicalStringify(payload)) !== entry.entryHash) {
      fail(`${at}: entryHash does not recompute`);
    }
    previousHash = entry.entryHash;
  });

  return violations.length === 0
    ? { valid: true, entryCount: ledger.entries.length }
    : { valid: false, violations };
}

export function requireValidOperationalLedger(
  basis: LedgerBasis,
  ledger: OperationalGeneration2Ledger,
): number {
  const result = validateOperationalGeneration2Ledger(basis, ledger);
  if (!result.valid) refuse('LEDGER_INVALID', result.violations.join('; '));
  return result.entryCount;
}

/**
 * The landed proposal-typed primitives' view of an ALREADY PARSED AND
 * VALIDATED revision. Used only to obtain a second, independent opinion from
 * the landed validator, resolver and Q1 planner; never as the boundary.
 */
export function landedProposalView(ledger: OperationalGeneration2Ledger): Generation2Ledger {
  return ledger as unknown as Generation2Ledger;
}

// ---------------------------------------------------------------------------
// Cross-generation occupant resolution.
// ---------------------------------------------------------------------------

export interface CrossGenerationOccupant {
  readonly selectionIndex: number;
  readonly split: Split;
  readonly kind: 'GENERATION1_TERMINAL_OCCUPANT' | 'GENERATION2_RESERVE_REPLACEMENT';
  readonly echeRowKey: string;
  /** The Generation-1 terminal occupant's own kind (history, unmodified). */
  readonly generation1OccupantKind: 'ORIGINAL_SELECTION' | 'RESERVE_REPLACEMENT';
  readonly generation1TerminalEcheRowKey: string;
  readonly generation2ReserveRankPosition: number | null;
  readonly generation2LedgerSequence: number | null;
  readonly generation2EntryCountForSlot: number;
}

/** Generation-1 terminal occupant (landed derivation) + this ledger's tail. */
export function resolveCrossGenerationOccupant(
  basis: LedgerBasis,
  ledger: OperationalGeneration2Ledger,
  selectionIndex: number,
): CrossGenerationOccupant {
  requireValidOperationalLedger(basis, ledger);
  const slot = basis.draw.selection[selectionIndex];
  if (!Number.isInteger(selectionIndex) || slot === undefined) {
    refuse('SELECTION_INDEX_INVALID', `selection index ${String(selectionIndex)}`);
  }
  const terminal = currentOccupantForSelectionIndex(
    basis.draw,
    basis.generation1Ledger,
    selectionIndex,
  );
  const tail = ledger.entries.filter((entry) => entry.selectionIndex === selectionIndex);
  const last = tail[tail.length - 1];
  return {
    selectionIndex,
    split: slot.split,
    kind: last === undefined ? 'GENERATION1_TERMINAL_OCCUPANT' : 'GENERATION2_RESERVE_REPLACEMENT',
    echeRowKey: last === undefined ? terminal.echeRowKey : last.replacementEcheRowKey,
    generation1OccupantKind: terminal.occupantKind,
    generation1TerminalEcheRowKey: terminal.echeRowKey,
    generation2ReserveRankPosition: last === undefined ? null : last.generation2ReserveRankPosition,
    generation2LedgerSequence: last === undefined ? null : last.sequence,
    generation2EntryCountForSlot: tail.length,
  };
}

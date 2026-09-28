/**
 * THE GENERATION-2 REPLACEMENT LEDGER (PROPOSAL): genesis, hash chain, pure
 * validator, cross-generation occupant resolver and Q1 planner.
 *
 * A SEPARATE LEDGER, NEVER AN APPEND TO GENERATION 1
 *
 *   The 39-entry Generation-1 ledger is immutable history. Generation 2 starts
 *   its OWN ledger at zero entries, and its header binds an immutable
 *   `generation1StartingState`: the Generation-1 terminal commit and record,
 *   the Generation-1 ledger file/hash, and how the starting occupant of every
 *   slot is derived (the landed Generation-1 currentOccupantForSelectionIndex
 *   over the frozen draw plus that 39-entry ledger).
 *
 *   A Generation-2 entry therefore says: "the slot's occupant immediately
 *   before this entry - the Generation-1 terminal occupant, or an earlier
 *   Generation-2 reserve - is replaced by Generation-2 reserve N". The
 *   Generation-1 chain is never rewritten or flattened; the resolver
 *   concatenates the two separately auditable chains.
 *
 * WHAT IS THE SAME AS GENERATION 1
 *
 *   Q1 (ascending selectionIndex, next unused position assigned monotonically
 *   to EACH pending obligation), Q2 (same-slot append-only chain), the four
 *   Q3 replacement reasons, the canonicalizer, the append-only hash chain and
 *   "no mutable current-occupant, status or counter field".
 *
 * WHAT DIFFERS
 *
 *   The reserve source (the 5,670-entry schedule, not the 40-entry draw
 *   reserve), the exhaustion bound (5,670, not 40), and the first
 *   replacedOccupantKind (GENERATION1_TERMINAL_OCCUPANT).
 *
 * THIS MODULE IS PURE AND AUTHORISES NOTHING. The genesis ledger is built in
 * memory; no ledger file is written by this proposal.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  currentOccupantForSelectionIndex,
  requireValidLedger,
  type DrawForLedger,
  type ReplacementLedger,
} from '../continuationWindow/replacementLedger.js';
import {
  REPLACEMENT_REASON_PRECEDENCE,
  REPLACEMENT_REASONS,
  type ReplacementReason,
} from '../continuationWindow/windowContract.js';
import type { Split } from '../draw/drawContract.js';
import {
  DRAW_HASH,
  DRAW_PATH,
  GENERATION1_ID,
  GENERATION1_LEDGER_ENTRY_COUNT,
  GENERATION1_LEDGER_FILE_SHA256,
  GENERATION1_LEDGER_HASH,
  GENERATION1_LEDGER_PATH,
  GENERATION1_TERMINAL_COMMIT,
  GENERATION1_TERMINAL_RECORD_PATH,
  GENERATION1_TERMINAL_STATUS,
  GENERATION2_ID,
  GENERATION2_LEDGER_RECORD,
  GENERATION2_LEDGER_RECORD_KIND,
  GENERATION2_RESERVE_COUNT,
  GENERATION2_RESERVE_EXHAUSTION_REFUSAL,
  GENERATION2_RESERVE_SCHEDULE_PATH,
  SELECTION_COUNT,
} from './generation2Contract.js';
import type { Generation2ReserveScheduleEntry } from './reserveSchedule.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const HEX64 = /^[0-9a-f]{64}$/;

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

// ---------------------------------------------------------------------------
// Types.
// ---------------------------------------------------------------------------

export type Generation2ReplacedOccupantKind =
  'GENERATION1_TERMINAL_OCCUPANT' | 'GENERATION2_RESERVE_REPLACEMENT';

export interface Generation2LedgerEntry {
  readonly sequence: number;
  readonly selectionIndex: number;
  readonly split: Split;
  readonly replacedEcheRowKey: string;
  readonly replacementEcheRowKey: string;
  readonly generation2ReserveRankPosition: number;
  readonly reason: ReplacementReason;
  readonly recordedAtUtc: string;
  readonly replacedOccupantKind: Generation2ReplacedOccupantKind;
  readonly previousSequenceForSlot: number | null;
  readonly previousEntryHash: string | null;
  readonly entryHash: string;
}

export type Generation2LedgerEntryPayload = Omit<Generation2LedgerEntry, 'entryHash'>;

export const GENERATION2_ENTRY_FIELDS = [
  'sequence',
  'selectionIndex',
  'split',
  'replacedEcheRowKey',
  'replacementEcheRowKey',
  'generation2ReserveRankPosition',
  'reason',
  'recordedAtUtc',
  'replacedOccupantKind',
  'previousSequenceForSlot',
  'previousEntryHash',
  'entryHash',
] as const;

export interface Generation1StartingState {
  readonly generationId: string;
  readonly terminalStatus: string;
  readonly terminalCommit: string;
  readonly terminalRecordPath: string;
  readonly terminalRecordSha256: string;
  readonly ledgerPath: string;
  readonly ledgerFileSha256: string;
  readonly ledgerHash: string;
  readonly ledgerEntryCount: number;
  readonly drawPath: string;
  readonly drawHash: string;
  readonly currentOccupantDerivation: string;
}

export interface Generation2Ledger {
  readonly record: string;
  readonly recordKind: string;
  readonly generationId: string;
  readonly status: 'PROPOSAL';
  readonly thisFileAuthorises: readonly string[];
  readonly generation1StartingState: Generation1StartingState;
  readonly reserveSchedule: { readonly path: string; readonly scheduleHash: string };
  readonly reserveCount: number;
  readonly selectionCount: number;
  readonly reserveExhaustionRefusal: string;
  readonly replacementReasons: readonly ReplacementReason[];
  readonly replacementReasonPrecedence: readonly ReplacementReason[];
  readonly entries: readonly Generation2LedgerEntry[];
  readonly ledgerHash: string;
}

// ---------------------------------------------------------------------------
// Hashing + genesis.
// ---------------------------------------------------------------------------

export function computeGeneration2EntryHash(payload: Generation2LedgerEntryPayload): string {
  return sha256(canonicalStringify(payload));
}

export function recomputeGeneration2LedgerHash(ledger: Generation2Ledger): string {
  const clone = { ...ledger } as Record<string, unknown>;
  delete clone.ledgerHash;
  return sha256(canonicalStringify(clone));
}

export function buildGeneration1StartingState(
  terminalRecordSha256: string,
): Generation1StartingState {
  return {
    generationId: GENERATION1_ID,
    terminalStatus: GENERATION1_TERMINAL_STATUS,
    terminalCommit: GENERATION1_TERMINAL_COMMIT,
    terminalRecordPath: GENERATION1_TERMINAL_RECORD_PATH,
    terminalRecordSha256,
    ledgerPath: GENERATION1_LEDGER_PATH,
    ledgerFileSha256: GENERATION1_LEDGER_FILE_SHA256,
    ledgerHash: GENERATION1_LEDGER_HASH,
    ledgerEntryCount: GENERATION1_LEDGER_ENTRY_COUNT,
    drawPath: DRAW_PATH,
    drawHash: DRAW_HASH,
    currentOccupantDerivation:
      'landed Generation-1 currentOccupantForSelectionIndex over the frozen draw plus the committed 39-entry Generation-1 ledger, for every selection index 0..109',
  };
}

export function buildGenesisGeneration2Ledger(
  terminalRecordSha256: string,
  scheduleHash: string,
): Generation2Ledger {
  const withoutHash: Omit<Generation2Ledger, 'ledgerHash'> = {
    record: GENERATION2_LEDGER_RECORD,
    recordKind: GENERATION2_LEDGER_RECORD_KIND,
    generationId: GENERATION2_ID,
    status: 'PROPOSAL',
    thisFileAuthorises: [],
    generation1StartingState: buildGeneration1StartingState(terminalRecordSha256),
    reserveSchedule: { path: GENERATION2_RESERVE_SCHEDULE_PATH, scheduleHash },
    reserveCount: GENERATION2_RESERVE_COUNT,
    selectionCount: SELECTION_COUNT,
    reserveExhaustionRefusal: GENERATION2_RESERVE_EXHAUSTION_REFUSAL,
    replacementReasons: [...REPLACEMENT_REASONS],
    replacementReasonPrecedence: [...REPLACEMENT_REASON_PRECEDENCE],
    entries: [],
  };
  return {
    ...withoutHash,
    ledgerHash: sha256(canonicalStringify(withoutHash)),
  };
}

// ---------------------------------------------------------------------------
// Inputs the Generation-2 ledger is validated against.
// ---------------------------------------------------------------------------

export interface Generation2Basis {
  readonly draw: DrawForLedger;
  readonly generation1Ledger: ReplacementLedger;
  readonly schedule: readonly Generation2ReserveScheduleEntry[];
  readonly scheduleHash: string;
}

export type Generation2LedgerValidation =
  | { readonly valid: true; readonly entryCount: number }
  | { readonly valid: false; readonly violations: readonly string[] };

export function validateGeneration2Ledger(
  basis: Generation2Basis,
  ledger: Generation2Ledger,
): Generation2LedgerValidation {
  const violations: string[] = [];
  const fail = (message: string): void => {
    violations.push(message);
  };

  const generation1Count = requireValidLedger(basis.draw, basis.generation1Ledger);
  if (generation1Count !== GENERATION1_LEDGER_ENTRY_COUNT) {
    fail('generation-1 ledger is not the terminal 39-entry ledger');
  }
  if (basis.generation1Ledger.ledgerHash !== GENERATION1_LEDGER_HASH) {
    fail('generation-1 ledgerHash is not the terminal ledger hash');
  }
  if (basis.schedule.length !== GENERATION2_RESERVE_COUNT)
    fail('schedule does not hold 5670 entries');
  if (ledger.generationId !== GENERATION2_ID)
    fail('ledger generationId is not METHODOLOGY_V3_GEN2');
  if (ledger.reserveSchedule.scheduleHash !== basis.scheduleHash)
    fail('ledger binds a different schedule');
  const start = ledger.generation1StartingState;
  if (
    start.generationId !== GENERATION1_ID ||
    start.terminalCommit !== GENERATION1_TERMINAL_COMMIT ||
    start.ledgerHash !== GENERATION1_LEDGER_HASH ||
    start.ledgerFileSha256 !== GENERATION1_LEDGER_FILE_SHA256 ||
    start.ledgerEntryCount !== GENERATION1_LEDGER_ENTRY_COUNT ||
    start.drawHash !== DRAW_HASH
  ) {
    fail('generation1StartingState does not bind the Generation-1 terminal');
  }
  if (recomputeGeneration2LedgerHash(ledger) !== ledger.ledgerHash)
    fail('ledgerHash does not recompute');

  const generation1Keys = new Set<string>([
    ...basis.draw.selection.map((entry) => entry.echeRowKey),
    ...basis.draw.reserve.map((entry) => entry.echeRowKey),
  ]);
  const occupantBySlot = new Map<number, { key: string; sequence: number }>();
  const inheritedBySlot = new Map<number, string>();
  const inheritedOccupant = (selectionIndex: number): string => {
    let key = inheritedBySlot.get(selectionIndex);
    if (key === undefined) {
      key = currentOccupantForSelectionIndex(
        basis.draw,
        basis.generation1Ledger,
        selectionIndex,
      ).echeRowKey;
      inheritedBySlot.set(selectionIndex, key);
    }
    return key;
  };
  const used = new Set<string>();
  let previousHash: string | null = null;
  let previousRecordedAt = '';

  ledger.entries.forEach((entry, k) => {
    const at = `entry ${String(k)}`;
    if (Object.keys(entry).sort().join(',') !== [...GENERATION2_ENTRY_FIELDS].sort().join(',')) {
      fail(`${at}: fields are not exactly the Generation-2 entry fields`);
    }
    if (entry.sequence !== k) fail(`${at}: sequence is not ${String(k)}`);
    if (k >= GENERATION2_RESERVE_COUNT) {
      fail(`${at}: Generation-2 reserve exhausted - ${GENERATION2_RESERVE_EXHAUSTION_REFUSAL}`);
    }
    if (entry.generation2ReserveRankPosition !== k) {
      fail(
        `${at}: generation2ReserveRankPosition breaks monotonic assignment (expected ${String(k)})`,
      );
    }
    if (!isIntegerIn(entry.selectionIndex, 0, SELECTION_COUNT - 1)) {
      fail(`${at}: selectionIndex is not a frozen selection slot`);
      return;
    }
    const slot = basis.draw.selection[entry.selectionIndex];
    if (slot === undefined) {
      fail(`${at}: selectionIndex has no draw entry`);
      return;
    }
    if (entry.split !== slot.split) fail(`${at}: split differs from the slot's frozen split`);
    if (!(REPLACEMENT_REASONS as readonly string[]).includes(entry.reason)) {
      fail(`${at}: reason is not one of the four frozen tokens`);
    }
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
      prior === undefined ? inheritedOccupant(entry.selectionIndex) : prior.key;
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

    if (typeof entry.recordedAtUtc !== 'string' || !ISO_UTC.test(entry.recordedAtUtc)) {
      fail(`${at}: recordedAtUtc is not an explicit ISO-8601 UTC instant`);
    } else {
      if (entry.recordedAtUtc < previousRecordedAt) fail(`${at}: recordedAtUtc goes backwards`);
      previousRecordedAt = entry.recordedAtUtc;
    }
    if (entry.previousEntryHash !== previousHash) fail(`${at}: previousEntryHash does not chain`);
    const payload = { ...entry } as Record<string, unknown>;
    delete payload.entryHash;
    if (typeof entry.entryHash !== 'string' || !HEX64.test(entry.entryHash)) {
      fail(`${at}: entryHash is not a sha256`);
    } else if (sha256(canonicalStringify(payload)) !== entry.entryHash) {
      fail(`${at}: entryHash does not recompute`);
    }
    previousHash = entry.entryHash;
  });

  return violations.length === 0
    ? { valid: true, entryCount: ledger.entries.length }
    : { valid: false, violations };
}

export class Generation2LedgerInvalid extends Error {
  constructor(readonly violations: readonly string[]) {
    super(`generation-2 ledger invalid: ${violations.join('; ')}`);
    this.name = 'Generation2LedgerInvalid';
  }
}

export function requireValidGeneration2Ledger(
  basis: Generation2Basis,
  ledger: Generation2Ledger,
): number {
  const result = validateGeneration2Ledger(basis, ledger);
  if (!result.valid) throw new Generation2LedgerInvalid(result.violations);
  return result.entryCount;
}

// ---------------------------------------------------------------------------
// Cross-generation occupant resolution.
// ---------------------------------------------------------------------------

export interface ChainLink {
  readonly generationId: string;
  readonly occupantKind:
    'ORIGINAL_SELECTION' | 'GENERATION1_RESERVE_REPLACEMENT' | 'GENERATION2_RESERVE_REPLACEMENT';
  readonly echeRowKey: string;
  readonly generation1ReserveRankPosition: number | null;
  readonly generation2ReserveRankPosition: number | null;
  readonly ledgerSequence: number | null;
}

export interface Generation2SlotOccupant {
  readonly selectionIndex: number;
  readonly split: Split;
  /** The Generation-1 terminal occupant: the starting point of the Generation-2 chain. */
  readonly generation1TerminalOccupant: ChainLink;
  /** original selection -> Generation-1 replacements (history, unmodified). */
  readonly generation1Chain: readonly ChainLink[];
  /** Generation-2 replacements, if any. */
  readonly generation2Chain: readonly ChainLink[];
  readonly current: ChainLink;
}

export function resolveGeneration2Occupant(
  basis: Generation2Basis,
  ledger: Generation2Ledger,
  selectionIndex: number,
): Generation2SlotOccupant {
  requireValidGeneration2Ledger(basis, ledger);
  const slot = basis.draw.selection[selectionIndex];
  if (!isIntegerIn(selectionIndex, 0, SELECTION_COUNT - 1) || slot === undefined) {
    throw new Error(`selectionIndex ${String(selectionIndex)} is not a frozen selection slot`);
  }
  const generation1Chain: ChainLink[] = [
    {
      generationId: GENERATION1_ID,
      occupantKind: 'ORIGINAL_SELECTION',
      echeRowKey: slot.echeRowKey,
      generation1ReserveRankPosition: null,
      generation2ReserveRankPosition: null,
      ledgerSequence: null,
    },
  ];
  for (const entry of basis.generation1Ledger.entries) {
    if (entry.selectionIndex !== selectionIndex) continue;
    generation1Chain.push({
      generationId: GENERATION1_ID,
      occupantKind: 'GENERATION1_RESERVE_REPLACEMENT',
      echeRowKey: entry.replacementEcheRowKey,
      generation1ReserveRankPosition: entry.reserveRankPosition,
      generation2ReserveRankPosition: null,
      ledgerSequence: entry.sequence,
    });
  }
  const terminal = generation1Chain[generation1Chain.length - 1]!;
  const landed = currentOccupantForSelectionIndex(
    basis.draw,
    basis.generation1Ledger,
    selectionIndex,
  );
  if (landed.echeRowKey !== terminal.echeRowKey) {
    throw new Error('Generation-1 chain end disagrees with the landed occupant derivation');
  }
  const generation2Chain: ChainLink[] = ledger.entries
    .filter((entry) => entry.selectionIndex === selectionIndex)
    .map((entry) => ({
      generationId: GENERATION2_ID,
      occupantKind: 'GENERATION2_RESERVE_REPLACEMENT' as const,
      echeRowKey: entry.replacementEcheRowKey,
      generation1ReserveRankPosition: null,
      generation2ReserveRankPosition: entry.generation2ReserveRankPosition,
      ledgerSequence: entry.sequence,
    }));
  return {
    selectionIndex,
    split: slot.split,
    generation1TerminalOccupant: terminal,
    generation1Chain,
    generation2Chain,
    current: generation2Chain[generation2Chain.length - 1] ?? terminal,
  };
}

// ---------------------------------------------------------------------------
// Q1 planner over the Generation-2 schedule.
// ---------------------------------------------------------------------------

export class Generation2ReserveExhausted extends Error {
  readonly refusal = GENERATION2_RESERVE_EXHAUSTION_REFUSAL;
  constructor(message: string) {
    super(`${GENERATION2_RESERVE_EXHAUSTION_REFUSAL}: ${message}`);
    this.name = 'Generation2ReserveExhausted';
  }
}

export interface PlannedGeneration2Assignment {
  readonly selectionIndex: number;
  readonly generation2ReserveRankPosition: number;
}

/**
 * Q1 unchanged: sort ALL pending obligations ascending by selectionIndex and
 * assign the next unused Generation-2 position monotonically to EACH. Reads no
 * identity, country, hostname, reason, split or yield. Returns a PLAN only:
 * nothing is appended here.
 */
export function planGeneration2ReplacementObligations(
  basis: Generation2Basis,
  ledger: Generation2Ledger,
  pendingSelectionIndices: readonly number[],
): PlannedGeneration2Assignment[] {
  const consumed = requireValidGeneration2Ledger(basis, ledger);
  const seen = new Set<number>();
  for (const index of pendingSelectionIndices) {
    if (!isIntegerIn(index, 0, SELECTION_COUNT - 1)) {
      throw new Error(`pending selection index ${String(index)} is not a frozen selection slot`);
    }
    if (seen.has(index))
      throw new Error(`pending selection index ${String(index)} is listed twice`);
    seen.add(index);
  }
  const sorted = [...pendingSelectionIndices].sort((a, b) => a - b);
  if (consumed + sorted.length > GENERATION2_RESERVE_COUNT) {
    throw new Generation2ReserveExhausted(
      `${String(sorted.length)} obligations need Generation-2 positions ${String(consumed)}..${String(consumed + sorted.length - 1)}, beyond the last position ${String(GENERATION2_RESERVE_COUNT - 1)}`,
    );
  }
  return sorted.map((selectionIndex, offset) => ({
    selectionIndex,
    generation2ReserveRankPosition: consumed + offset,
  }));
}

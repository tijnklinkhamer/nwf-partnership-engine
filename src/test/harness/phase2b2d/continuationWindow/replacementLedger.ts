/**
 * THE GENERATION-1 RESERVE REPLACEMENT LEDGER: CONTRACT, HASH CHAIN, PURE
 * VALIDATOR AND CURRENT-OCCUPANT DERIVATION.
 *
 * AN EVOLVING, APPEND-ONLY ARTIFACT
 *
 *   Unlike a one-shot evaluation record, this ledger is updated over the
 *   life of Generation 1 - but ONLY by appending a valid suffix of new,
 *   immutable entries. Git keeps every earlier revision. The contract below
 *   makes every other edit detectable: deleting, editing or reordering an
 *   entry, reusing or skipping a reserve position, or changing an entry's
 *   slot, reason, identities or timestamp breaks either a positional
 *   invariant or the hash chain, and the validator fails closed.
 *
 * THE HASH CHAIN, EXACTLY
 *
 *   sequence          0-based append position; entry k has sequence k.
 *   previousEntryHash null for sequence 0, otherwise entries[k-1].entryHash.
 *   entryHash         sha256 over canonicalStringify(entry WITHOUT entryHash):
 *                     every other field of the entry, previousEntryHash
 *                     included - the same canonicalizer the frame hash, the
 *                     draw hash and the classifier assembly hash use (sorted
 *                     keys, arrays in given order, undefined refused). There
 *                     is no second canonicalization function.
 *   ledgerHash        sha256 over canonicalStringify(ledger WITHOUT
 *                     ledgerHash). It changes on every append, by design: a
 *                     revision is identified by (file sha, ledgerHash, head
 *                     entryHash), never by a permanent final sha.
 *
 * NO MUTABLE CURRENT STATE
 *
 *   There is no `currentOrganisation` map, no status field and no counter.
 *   A slot's current occupant is DERIVED (the latest entry for that slot, or
 *   the original selection when there is none), and reserveConsumedCount IS
 *   the number of valid entries. An assigned-but-not-yet-executed reserve is
 *   expressed by the absence of a run in the acquisition evidence, never by
 *   editing this ledger.
 *
 * THIS MODULE IS PURE. No filesystem, no database, no network, no clock. It
 * never places an eche row key in a violation message.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import type { Split } from '../draw/drawContract.js';
import {
  CORPUS_PLAN_PATH,
  CORPUS_PLAN_SHA256,
  DRAW_FILE_SHA256,
  DRAW_HASH,
  DRAW_PATH,
  FRAME_FILE_SHA256,
  FRAME_HASH,
  FRAME_PATH,
  FROZEN_REPLACEMENT_ENTRY_FIELDS,
  GENERATION_ID,
  METHODOLOGY_R3_PATH,
  METHODOLOGY_R3_SHA256,
  OWNER_CLARIFICATION_PATH,
  OWNER_CLARIFICATION_SHA256,
  REPLACEMENT_LEDGER_RECORD,
  REPLACEMENT_LEDGER_RECORD_KIND,
  REPLACEMENT_REASON_PRECEDENCE,
  REPLACEMENT_REASONS,
  RESERVE_COUNT,
  RESERVE_EXHAUSTION_REFUSAL,
  SELECTION_COUNT,
  type ReplacedOccupantKind,
  type ReplacementReason,
} from './windowContract.js';

// ---------------------------------------------------------------------------
// Types.
// ---------------------------------------------------------------------------

/** The part of the frozen draw the ledger is validated against. */
export interface DrawForLedger {
  readonly drawHash: string;
  readonly selection: readonly {
    readonly selectionIndex: number;
    readonly echeRowKey: string;
    readonly split: Split;
  }[];
  readonly reserve: readonly {
    readonly reserveRankPosition: number;
    readonly echeRowKey: string;
  }[];
}

/**
 * One replacement event. The seven Plan V1 fields are all present, unrenamed;
 * the rest is integrity metadata the validator derives and checks.
 */
export interface ReplacementLedgerEntry {
  readonly sequence: number;
  readonly selectionIndex: number;
  readonly split: Split;
  readonly replacedEcheRowKey: string;
  readonly replacementEcheRowKey: string;
  readonly reserveRankPosition: number;
  readonly reason: ReplacementReason;
  readonly recordedAtUtc: string;
  readonly replacedOccupantKind: ReplacedOccupantKind;
  /** The earlier entry for the SAME slot this one continues, or null. */
  readonly previousSequenceForSlot: number | null;
  readonly previousEntryHash: string | null;
  readonly entryHash: string;
}

export type ReplacementLedgerEntryPayload = Omit<ReplacementLedgerEntry, 'entryHash'>;

export const ENTRY_FIELDS = [
  ...FROZEN_REPLACEMENT_ENTRY_FIELDS,
  'sequence',
  'replacedOccupantKind',
  'previousSequenceForSlot',
  'previousEntryHash',
  'entryHash',
] as const;

export interface ReplacementLedger {
  readonly record: string;
  readonly recordKind: string;
  readonly generationId: string;
  readonly publicSafe: boolean;
  readonly thisFileAuthorises: readonly string[];
  readonly semantics: Readonly<Record<string, unknown>>;
  readonly bound: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly reserveCount: number;
  readonly selectionCount: number;
  readonly reserveExhaustionRefusal: string;
  readonly frozenEntryFields: readonly string[];
  readonly integrityFields: readonly string[];
  readonly replacementReasons: readonly ReplacementReason[];
  readonly replacementReasonPrecedence: readonly ReplacementReason[];
  readonly hashing: Readonly<Record<string, string>>;
  readonly entries: readonly ReplacementLedgerEntry[];
  readonly ledgerHash: string;
}

export type ReplacementLedgerHeader = Omit<ReplacementLedger, 'entries' | 'ledgerHash'>;

// ---------------------------------------------------------------------------
// Hashing.
// ---------------------------------------------------------------------------

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function computeEntryHash(payload: ReplacementLedgerEntryPayload): string {
  return sha256(canonicalStringify(payload));
}

export function computeLedgerHash(ledger: Omit<ReplacementLedger, 'ledgerHash'>): string {
  return sha256(canonicalStringify(ledger));
}

export function recomputeLedgerHash(ledger: ReplacementLedger): string {
  const clone = { ...ledger } as Record<string, unknown>;
  delete clone.ledgerHash;
  return sha256(canonicalStringify(clone));
}

export function stripEntryHash(entry: ReplacementLedgerEntry): ReplacementLedgerEntryPayload {
  const clone = { ...entry } as Record<string, unknown>;
  delete clone.entryHash;
  return clone as unknown as ReplacementLedgerEntryPayload;
}

// ---------------------------------------------------------------------------
// Genesis.
// ---------------------------------------------------------------------------

/** The header every revision of the ledger carries unchanged, forever. */
export function genesisLedgerHeader(): ReplacementLedgerHeader {
  return {
    record: REPLACEMENT_LEDGER_RECORD,
    recordKind: REPLACEMENT_LEDGER_RECORD_KIND,
    generationId: GENERATION_ID,
    publicSafe: true,
    thisFileAuthorises: [],
    semantics: {
      appendOnly: true,
      oneLedgerPerGeneration: true,
      evolvingArtifact:
        'Updated over the life of Generation 1 ONLY by appending valid suffix entries. Git preserves every earlier revision; each revision must carry its predecessor as a byte-identical entry prefix.',
      forbidden: [
        'deleting an existing entry',
        'editing an existing entry',
        'reordering entries',
        'reusing a reserve position',
        'skipping a reserve position or going backwards',
        "changing an entry's selectionIndex, split, reason, replaced or replacement identity, timestamp or hashes",
        'a mutable current-occupant, status or counter field',
      ],
      reserveConsumedCount: 'the number of VALID entries - never a stored counter',
      currentOccupant:
        'DERIVED: the replacementEcheRowKey of the latest entry for the slot, or the original selection when the slot has no entry',
      assignedNotYetExecuted:
        'an entry whose replacement has no acquisition run yet; execution state lives in the research-run evidence, never here',
      assignedReservesAreNeverReturned:
        'a reserve position, once appended, stays consumed even if its window pauses before the replacement executes',
      pendingObligationOrder:
        'SELECTION_INDEX_ASCENDING, next unused reserve rank position assigned monotonically (Owner Clarification Q1)',
      replacementChain:
        'SAME_SELECTION_SLOT_APPEND_ONLY_ACROSS_PRECOMMITTED_WINDOWS (Owner Clarification Q2); a later entry for a slot replaces that slot’s previous reserve occupant',
      whatEntriesMustNotCarry: [
        'organisationId',
        'institution name',
        'hostname',
        'URL',
        'page-level or semantic material',
      ],
    },
    bound: {
      methodologyR3: { path: METHODOLOGY_R3_PATH, sha256: METHODOLOGY_R3_SHA256 },
      corpusAcquisitionPlanV1: { path: CORPUS_PLAN_PATH, sha256: CORPUS_PLAN_SHA256 },
      frame: { path: FRAME_PATH, artifactFileSha256: FRAME_FILE_SHA256, frameHash: FRAME_HASH },
      draw: { path: DRAW_PATH, artifactFileSha256: DRAW_FILE_SHA256, drawHash: DRAW_HASH },
      ownerClarification: { path: OWNER_CLARIFICATION_PATH, sha256: OWNER_CLARIFICATION_SHA256 },
    },
    reserveCount: RESERVE_COUNT,
    selectionCount: SELECTION_COUNT,
    reserveExhaustionRefusal: RESERVE_EXHAUSTION_REFUSAL,
    frozenEntryFields: [...FROZEN_REPLACEMENT_ENTRY_FIELDS],
    integrityFields: [
      'sequence',
      'replacedOccupantKind',
      'previousSequenceForSlot',
      'previousEntryHash',
      'entryHash',
    ],
    replacementReasons: [...REPLACEMENT_REASONS],
    replacementReasonPrecedence: [...REPLACEMENT_REASON_PRECEDENCE],
    hashing: {
      canonicalizer:
        'canonicalStringify from src/orgunits/classify/canonical.ts - the canonicalizer of the frame hash and the draw hash',
      sequence: '0-based append position; entry k has sequence k and reserveRankPosition k',
      previousEntryHash: 'null for sequence 0; otherwise the entryHash of entries[sequence - 1]',
      entryHash:
        'sha256(canonicalStringify(entry without entryHash)) - every other entry field, previousEntryHash included',
      ledgerHash:
        'sha256(canonicalStringify(ledger without ledgerHash)); changes on every append by design',
      revisionIdentity:
        'every later revision binds previous ledger file sha, new ledger file sha, and the appended entry hashes',
    },
  };
}

export function buildGenesisReplacementLedger(): ReplacementLedger {
  const payload = { ...genesisLedgerHeader(), entries: [] as ReplacementLedgerEntry[] };
  return { ...payload, ledgerHash: computeLedgerHash(payload) };
}

export function ledgerHeaderOf(ledger: ReplacementLedger): ReplacementLedgerHeader {
  const clone = { ...ledger } as Record<string, unknown>;
  delete clone.entries;
  delete clone.ledgerHash;
  return clone as unknown as ReplacementLedgerHeader;
}

/** True when the ledger's header is byte-for-byte (canonically) the genesis header. */
export function ledgerExtendsGenesis(ledger: ReplacementLedger): boolean {
  return canonicalStringify(ledgerHeaderOf(ledger)) === canonicalStringify(genesisLedgerHeader());
}

// ---------------------------------------------------------------------------
// The pure validator.
// ---------------------------------------------------------------------------

export type LedgerValidation =
  | { readonly valid: true; readonly entryCount: number }
  | { readonly valid: false; readonly violations: readonly string[] };

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const HEX64 = /^[0-9a-f]{64}$/;

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Proves the ledger against the frozen draw. Fails closed: ANY violation makes
 * the whole ledger invalid, and nothing downstream may read an invalid one.
 */
export function validateReplacementLedger(
  draw: DrawForLedger,
  ledger: ReplacementLedger,
): LedgerValidation {
  const violations: string[] = [];
  const fail = (message: string): void => {
    violations.push(message);
  };

  // The draw itself must be the frozen one, in its frozen shape.
  if (draw.drawHash !== DRAW_HASH) fail('draw: drawHash is not the frozen DRAW_V2_GEN1 hash');
  if (draw.selection.length !== SELECTION_COUNT) fail('draw: selection length is not 110');
  if (draw.reserve.length !== RESERVE_COUNT) fail('draw: reserve length is not 40');
  draw.selection.forEach((entry, index) => {
    if (entry.selectionIndex !== index) fail(`draw: selection[${String(index)}] is out of order`);
  });
  draw.reserve.forEach((entry, index) => {
    if (entry.reserveRankPosition !== index) {
      fail(`draw: reserve[${String(index)}] is out of order`);
    }
  });
  if (ledger.bound.draw?.drawHash !== draw.drawHash) fail('ledger: bound drawHash differs');

  if (!Array.isArray(ledger.entries)) {
    return { valid: false, violations: [...violations, 'ledger: entries is not an array'] };
  }
  if (recomputeLedgerHash(ledger) !== ledger.ledgerHash)
    fail('ledger: ledgerHash does not recompute');

  const selectionKeys = new Set(draw.selection.map((entry) => entry.echeRowKey));
  const occupantBySlot = new Map<number, { key: string; sequence: number }>();
  const usedReplacementKeys = new Set<string>();
  let previousHash: string | null = null;
  let previousRecordedAt = '';

  ledger.entries.forEach((entry, k) => {
    const at = `entry ${String(k)}`;
    const keys = Object.keys(entry).sort();
    const expectedKeys = [...ENTRY_FIELDS].sort();
    if (keys.join(',') !== expectedKeys.join(',')) {
      fail(`${at}: fields are not exactly the frozen seven plus the integrity metadata`);
    }
    if (entry.sequence !== k) fail(`${at}: sequence is not ${String(k)}`);

    if (k >= RESERVE_COUNT) {
      fail(
        `${at}: reserve exhausted - a replacement beyond position 39 is ${RESERVE_EXHAUSTION_REFUSAL}`,
      );
    }
    if (!isIntegerIn(entry.reserveRankPosition, 0, RESERVE_COUNT - 1)) {
      fail(`${at}: reserveRankPosition is not an integer 0..39`);
    } else if (entry.reserveRankPosition !== k) {
      fail(
        `${at}: reserveRankPosition ${String(entry.reserveRankPosition)} breaks monotonic consumption (expected ${String(k)})`,
      );
    }

    if (!isIntegerIn(entry.selectionIndex, 0, SELECTION_COUNT - 1)) {
      fail(`${at}: selectionIndex is not an integer 0..109`);
      return;
    }
    const slot = draw.selection[entry.selectionIndex];
    if (slot === undefined) {
      fail(`${at}: selectionIndex has no draw entry`);
      return;
    }
    if (entry.split !== slot.split) fail(`${at}: split differs from its slot's frozen split`);
    if (!(REPLACEMENT_REASONS as readonly string[]).includes(entry.reason)) {
      fail(`${at}: reason is not one of the four frozen tokens`);
    }

    const reserveEntry = isIntegerIn(entry.reserveRankPosition, 0, RESERVE_COUNT - 1)
      ? draw.reserve[entry.reserveRankPosition]
      : undefined;
    if (reserveEntry === undefined || entry.replacementEcheRowKey !== reserveEntry.echeRowKey) {
      fail(`${at}: replacement identity is not the draw's reserve entry at its position`);
    }
    if (selectionKeys.has(entry.replacementEcheRowKey)) {
      fail(`${at}: replacement identity is a selected organisation`);
    }
    if (usedReplacementKeys.has(entry.replacementEcheRowKey)) {
      fail(`${at}: replacement identity is already assigned to a slot`);
    }
    usedReplacementKeys.add(entry.replacementEcheRowKey);

    const prior = occupantBySlot.get(entry.selectionIndex);
    const expectedReplaced = prior === undefined ? slot.echeRowKey : prior.key;
    const expectedKind: ReplacedOccupantKind =
      prior === undefined ? 'ORIGINAL_SELECTION' : 'RESERVE_REPLACEMENT';
    const expectedPreviousForSlot = prior === undefined ? null : prior.sequence;
    if (entry.replacedEcheRowKey !== expectedReplaced) {
      fail(`${at}: replaced identity is not the slot's occupant immediately before this entry`);
    }
    if (entry.replacedOccupantKind !== expectedKind) {
      fail(`${at}: replacedOccupantKind is not ${expectedKind}`);
    }
    if (entry.previousSequenceForSlot !== expectedPreviousForSlot) {
      fail(`${at}: previousSequenceForSlot does not point at the slot's previous entry`);
    }
    occupantBySlot.set(entry.selectionIndex, { key: entry.replacementEcheRowKey, sequence: k });

    if (typeof entry.recordedAtUtc !== 'string' || !ISO_UTC.test(entry.recordedAtUtc)) {
      fail(`${at}: recordedAtUtc is not an explicit ISO-8601 UTC instant`);
    } else {
      if (entry.recordedAtUtc < previousRecordedAt) fail(`${at}: recordedAtUtc goes backwards`);
      previousRecordedAt = entry.recordedAtUtc;
    }

    if (entry.previousEntryHash !== previousHash) {
      fail(`${at}: previousEntryHash does not chain to the prior entry`);
    }
    if (typeof entry.entryHash !== 'string' || !HEX64.test(entry.entryHash)) {
      fail(`${at}: entryHash is not a sha256`);
    } else if (computeEntryHash(stripEntryHash(entry)) !== entry.entryHash) {
      fail(`${at}: entryHash does not recompute`);
    }
    previousHash = entry.entryHash;
  });

  return violations.length === 0
    ? { valid: true, entryCount: ledger.entries.length }
    : { valid: false, violations };
}

export class ReplacementLedgerInvalid extends Error {
  constructor(readonly violations: readonly string[]) {
    super(`replacement ledger invalid: ${violations.join('; ')}`);
    this.name = 'ReplacementLedgerInvalid';
  }
}

/** Validates or throws. Every derivation below goes through this first. */
export function requireValidLedger(draw: DrawForLedger, ledger: ReplacementLedger): number {
  const result = validateReplacementLedger(draw, ledger);
  if (!result.valid) throw new ReplacementLedgerInvalid(result.violations);
  return result.entryCount;
}

/** reserveConsumedCount = number of VALID canonical entries. */
export function reserveConsumedCount(draw: DrawForLedger, ledger: ReplacementLedger): number {
  return requireValidLedger(draw, ledger);
}

// ---------------------------------------------------------------------------
// Current occupant: derived, never stored.
// ---------------------------------------------------------------------------

export interface SlotOccupant {
  readonly selectionIndex: number;
  readonly occupantKind: 'ORIGINAL_SELECTION' | 'RESERVE_REPLACEMENT';
  readonly echeRowKey: string;
  readonly reserveRankPosition: number | null;
  readonly ledgerSequence: number | null;
}

export function currentOccupantForSelectionIndex(
  draw: DrawForLedger,
  ledger: ReplacementLedger,
  selectionIndex: number,
): SlotOccupant {
  requireValidLedger(draw, ledger);
  const slot = draw.selection[selectionIndex];
  if (!isIntegerIn(selectionIndex, 0, SELECTION_COUNT - 1) || slot === undefined) {
    throw new Error(`selectionIndex ${String(selectionIndex)} is not a frozen selection slot`);
  }
  let latest: ReplacementLedgerEntry | undefined;
  for (const entry of ledger.entries) {
    if (entry.selectionIndex === selectionIndex) latest = entry;
  }
  if (latest === undefined) {
    return {
      selectionIndex,
      occupantKind: 'ORIGINAL_SELECTION',
      echeRowKey: slot.echeRowKey,
      reserveRankPosition: null,
      ledgerSequence: null,
    };
  }
  return {
    selectionIndex,
    occupantKind: 'RESERVE_REPLACEMENT',
    echeRowKey: latest.replacementEcheRowKey,
    reserveRankPosition: latest.reserveRankPosition,
    ledgerSequence: latest.sequence,
  };
}

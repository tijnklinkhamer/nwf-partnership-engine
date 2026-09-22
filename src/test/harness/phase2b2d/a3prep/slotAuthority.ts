/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R17: THE A2 ACQUISITION-OF-RECORD →
 * A3 SLOT AUTHORITY CONTRACT.
 *
 * ONE QUESTION
 *
 *   For one frozen Generation-1 selection slot, which A2 organisation
 *   acquisition - if any - is currently authorised to become A3 input?
 *
 *   This module answers WHO / WHICH ACQUISITION may feed A3. It never answers
 *   WHICH PAGES enter SET_P or SET_R: it carries no page, document, score,
 *   label or classifier field of any kind.
 *
 * THE A2 AUTHORITY TAXONOMY (read from the committed A2 records, 696c523)
 *
 *   DRAW                    the frozen initial occupant of every slot, its
 *                           selectionIndex and its split; plus the 40 ranked
 *                           reserve entries, which carry NO split.
 *   REPLACEMENT LEDGER      append-only slot transitions. Occupant authority
 *                           only: it says who occupies a slot, never whether
 *                           that occupant was acquired successfully.
 *   PRENETWORK ASSIGNMENT   authorises one future reserve occupant for
 *                           execution (it is what appends the ledger entry).
 *                           NOT acquisition success.
 *   LIVE WINDOW AUTHORITY   authorises bounded institution-network execution.
 *                           NOT acquisition success.
 *   STRATEGY / WINDOW PLAN  precommit what a later window will do. NOT
 *                           acquisition success.
 *   LIVE RESULT             observation / evidence. It may carry a
 *                           `diagnosticSd9` value, always beside
 *                           `diagnosticSd9IsAdjudicative: false`. NOT
 *                           acquisition success, however successful it looks.
 *   EVIDENCE ADJUDICATION   the owner/evidence decision that states
 *                           ACQUISITION_SUCCESSFUL or one frozen unsuccessful
 *                           reason. THE ONLY DISPOSITION AUTHORITY.
 *
 * THE READY RULE, EXACTLY
 *
 *   A slot is `A3_SLOT_ACQUISITION_AUTHORITY_READY` iff ALL of:
 *
 *     1. its current occupant is DERIVED from the frozen draw plus the
 *        append-only replacement ledger (never supplied by the caller);
 *     2. exactly one `A2_TERMINAL_EVIDENCE_ADJUDICATION` fact names that exact
 *        occupant (selectionIndex, split, occupant kind, reserve position and
 *        draw-entry digest all equal);
 *     3. that fact's disposition is `ACQUISITION_SUCCESSFUL`; and
 *     4. that fact binds the exact adjudication record, the exact live result
 *        it adjudicated, the run reference digest and the policy version a
 *        later database adapter must prove.
 *
 *   Everything else is NOT READY or a structural refusal. There is no
 *   conversion from a diagnostic SD9 value, a live result, a window authority,
 *   a pre-network assignment, a strategy, a plan, the latest file, the latest
 *   run, the latest commit, a database row or a sealed file to READY.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 *   - No filesystem: no directory scan, no glob, no "latest adjudication", no
 *     JSON loader, no git-history parser. Every input is an in-memory,
 *     already-normalised fact. Translating the heterogeneous committed A2
 *     records into these facts is a LATER adapter's job (R18), so that no
 *     chronological filename heuristic can ever become authority.
 *   - No database: no run, observation, page-evidence or candidate query. R17
 *     ends at "which slot/run is authorised"; binding that to database
 *     evidence (e.g. proving sha256(runId) === runRefSha256) is R18.
 *   - No hashing: this module recomputes no entry hash, ledger hash or draw
 *     digest. The canonical ledger validator
 *     (`continuationWindow/replacementLedger.ts`, which hashes with
 *     node:crypto) must accept the ledger BEFORE its entries are normalised
 *     into this contract; R17 then re-checks every positional and chain
 *     invariant that needs no hash - sequence order, monotonic reserve
 *     consumption, previous-entry-hash linkage, same-slot continuation, split
 *     inheritance, reserve identity and global reserve uniqueness. It imports
 *     nothing from the A2 continuation namespace (pinned by the namespace
 *     isolation test), so its reason vocabulary is a copy a test compares
 *     against the canonical one.
 *   - No new digest: no authority-snapshot token is invented. The READY object
 *     carries the raw bound hashes (draw, ledger, slot-chain entries,
 *     adjudication, live result, run reference), which is enough for a later
 *     assembly step to re-verify that the same ledger/authority state still
 *     holds before it materialises anything (TOCTOU).
 *   - No preflight integration and no reserve assignment: an unsuccessful
 *     current occupant is SURFACED as an open replacement obligation; nothing
 *     here plans, assigns or appends.
 *
 * INTERNAL, NOT PUBLIC
 *
 *   A READY object carries organisation identity and run provenance because a
 *   later split-scoped database adapter needs them. It is INTERNAL authority,
 *   never a public gated manifest: only `deriveGenerationSlotAuthoritySummary`
 *   produces a public-safe aggregate, and it names no slot index and no
 *   identity. Refusal messages name field categories and positions only -
 *   never an organisation, eche row key, run id, URL, domain or sealed path.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read, no hashing.
 */
import { GENERATION_ID, SPLIT_ASSIGNMENT_CYCLE_V2_R2 } from '../draw/drawContract.js';
import {
  GENERATION_1_RESERVE_ORGANISATIONS,
  GENERATION_1_SELECTED_ORGANISATIONS,
  GENERATION_1_SPLIT_ORGANISATION_COUNTS,
  SPLITS,
  type Split,
} from './contracts.js';

// ---------------------------------------------------------------------------
// A. FROZEN VOCABULARY.
// ---------------------------------------------------------------------------

/** The one fact kind that can carry a terminal acquisition disposition. */
export const A2_TERMINAL_EVIDENCE_ADJUDICATION = 'A2_TERMINAL_EVIDENCE_ADJUDICATION';

/** The fact kind for everything that is evidence or authority but NOT a disposition. */
export const A2_NON_ADJUDICATIVE_EVIDENCE = 'A2_NON_ADJUDICATIVE_EVIDENCE';

/**
 * The A2 record kinds that can NEVER be a terminal adjudication. Two of them -
 * `LIVE_WINDOW_RESULT` and `DIAGNOSTIC_SD9` - are OBSERVATIONS of an executed
 * acquisition (they move a slot to "pending adjudication"); the other four are
 * pre-execution governance (they move nothing).
 */
export const A2_NON_ADJUDICATIVE_RECORD_KINDS = Object.freeze([
  'LIVE_WINDOW_RESULT',
  'DIAGNOSTIC_SD9',
  'LIVE_WINDOW_AUTHORITY',
  'PRENETWORK_ASSIGNMENT',
  'STRATEGY',
  'WINDOW_PLAN',
] as const);
export type A2NonAdjudicativeRecordKind = (typeof A2_NON_ADJUDICATIVE_RECORD_KINDS)[number];

/** The non-adjudicative kinds that prove an acquisition was actually executed. */
export const A2_EXECUTED_OBSERVATION_RECORD_KINDS: readonly A2NonAdjudicativeRecordKind[] =
  Object.freeze(['LIVE_WINDOW_RESULT', 'DIAGNOSTIC_SD9']);

/** The one success disposition. There is no other success-like token. */
export const A2_ACQUISITION_SUCCESSFUL = 'ACQUISITION_SUCCESSFUL';

/**
 * The four frozen unsuccessful dispositions, in Plan V1 SD2's order. Value-
 * identical to the replacement-reason vocabulary in
 * `continuationWindow/windowContract.ts` (`REPLACEMENT_REASONS`); a test
 * compares the two element by element rather than trusting this copy.
 */
export const A2_UNSUCCESSFUL_DISPOSITIONS = Object.freeze([
  'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
  'ACQUISITION_UNSUCCESSFUL_ROOT_AUTHORITY_FAILURE',
  'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED',
  'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
] as const);
export type A2UnsuccessfulDisposition = (typeof A2_UNSUCCESSFUL_DISPOSITIONS)[number];

export const A2_TERMINAL_DISPOSITIONS = Object.freeze([
  A2_ACQUISITION_SUCCESSFUL,
  ...A2_UNSUCCESSFUL_DISPOSITIONS,
] as const);
export type A2TerminalDisposition = (typeof A2_TERMINAL_DISPOSITIONS)[number];

/**
 * Who occupies a slot. Two DIFFERENT draw domains: a PRIMARY is
 * `draw.selection[selectionIndex]`; a RESERVE_REPLACEMENT is
 * `draw.reserve[reserveRankPosition]`. The kind is always explicit, so a
 * reserve can never be mistaken for the selection entry at the same array
 * position.
 */
export const A3_SLOT_OCCUPANT_KINDS = Object.freeze(['PRIMARY', 'RESERVE_REPLACEMENT'] as const);
export type A3SlotOccupantKind = (typeof A3_SLOT_OCCUPANT_KINDS)[number];

/** Owner Clarification Q2, bound by name. */
export const A3_SLOT_REPLACEMENT_CHAIN_SEMANTICS =
  'SAME_SELECTION_SLOT_APPEND_ONLY_ACROSS_PRECOMMITTED_WINDOWS';

export const A3_SLOT_ACQUISITION_AUTHORITY_READY = 'A3_SLOT_ACQUISITION_AUTHORITY_READY';
export const A2_ACQUISITION_NOT_ADJUDICATED = 'A2_ACQUISITION_NOT_ADJUDICATED';
export const A2_EVIDENCE_PENDING_ADJUDICATION = 'A2_EVIDENCE_PENDING_ADJUDICATION';
export const A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL =
  'A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL';

export const A3_SLOT_ACQUISITION_AUTHORITY_STATUSES = Object.freeze([
  A3_SLOT_ACQUISITION_AUTHORITY_READY,
  A2_ACQUISITION_NOT_ADJUDICATED,
  A2_EVIDENCE_PENDING_ADJUDICATION,
  A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL,
] as const);
export type A3SlotAcquisitionAuthorityStatus =
  (typeof A3_SLOT_ACQUISITION_AUTHORITY_STATUSES)[number];

/** How an unsuccessful current occupant's slot can still be resolved. */
export const A3_REPLACEMENT_OBLIGATION_STATES = Object.freeze([
  'REPLACEMENT_OBLIGATION_RESERVE_AVAILABLE',
  'REPLACEMENT_OBLIGATION_RESERVE_EXHAUSTED',
] as const);
export type A3ReplacementObligationState = (typeof A3_REPLACEMENT_OBLIGATION_STATES)[number];

export const A3_GENERATION_SLOT_AUTHORITY_COMPLETE = 'A3_GENERATION_SLOT_AUTHORITY_COMPLETE';
export const A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE = 'A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE';
export type A3GenerationSlotAuthorityStatus =
  typeof A3_GENERATION_SLOT_AUTHORITY_COMPLETE | typeof A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE;

// ---------------------------------------------------------------------------
// B. NORMALISED INPUTS. Already validated upstream; re-checked structurally here.
// ---------------------------------------------------------------------------

/** One committed governance or evidence record, by path, bytes digest and commit. */
export interface A2RecordBinding {
  /** Repository-relative, under `docs/evaluation/`, ending `.json`. */
  readonly path: string;
  /** Lower-hex SHA-256 of the committed file bytes. Never recomputed here. */
  readonly sha256: string;
  /** The full 40-character commit that introduced these exact bytes. */
  readonly commit: string;
}

/** The frozen draw artifact this resolution reads, by identity only. */
export interface A2DrawBinding {
  readonly path: string;
  readonly artifactFileSha256: string;
  readonly drawHash: string;
}

/**
 * One of the 110 frozen DRAW selection entries. `drawEntrySha256` is the
 * canonical public-safe digest the A2 window plans and adjudications already
 * use: sha256(canonicalStringify(exact parsed draw entry)), computed upstream
 * by `continuationWindow/windowPlan.ts`'s `drawEntrySha256`.
 */
export interface A2GenerationDrawSelectionSlot {
  readonly selectionIndex: number;
  readonly split: Split;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly drawEntrySha256: string;
}

/** One of the 40 frozen DRAW reserve entries. It has NO split of its own. */
export interface A2GenerationDrawReserveEntry {
  readonly reserveRankPosition: number;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly drawEntrySha256: string;
}

/**
 * One canonical replacement-ledger entry, field for field as
 * `continuationWindow/replacementLedger.ts`'s `ReplacementLedgerEntry` defines
 * it: the seven frozen Plan V1 fields plus the five integrity fields. Nothing
 * is renamed or loosened for convenience.
 */
export interface A2ReplacementLedgerTransition {
  readonly sequence: number;
  readonly selectionIndex: number;
  readonly split: Split;
  readonly replacedEcheRowKey: string;
  readonly replacementEcheRowKey: string;
  readonly reserveRankPosition: number;
  readonly reason: A2UnsuccessfulDisposition;
  readonly recordedAtUtc: string;
  readonly replacedOccupantKind: 'ORIGINAL_SELECTION' | 'RESERVE_REPLACEMENT';
  readonly previousSequenceForSlot: number | null;
  readonly previousEntryHash: string | null;
  readonly entryHash: string;
}

/** The one ledger revision this resolution reads. */
export interface A2ReplacementLedgerRevision {
  readonly path: string;
  readonly fileSha256: string;
  readonly ledgerHash: string;
  readonly entries: readonly A2ReplacementLedgerTransition[];
}

/**
 * A commitment to a sealed SD7 detail file, WITHOUT opening it. Only the
 * basename is carried - the split-scoped root is resolved later, by split,
 * inside a split-scoped adapter; this module has no filesystem access.
 */
export interface A3SealedSd7DetailCommitment {
  readonly split: Split;
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** The occupant a fact is about, named the way the A2 adjudication items name it. */
export interface A2OccupantReference {
  readonly generationId: string;
  readonly selectionIndex: number;
  readonly split: Split;
  readonly occupantKind: A3SlotOccupantKind;
  readonly reserveRankPosition: number | null;
  readonly drawEntrySha256: string;
}

/**
 * ONE already-validated A2 terminal evidence adjudication of ONE occupant's
 * acquisition of record. The discriminant is mandatory: an object shaped like
 * a live result cannot become one by carrying a disposition string.
 */
export interface A2AdjudicatedAcquisitionFact extends A2OccupantReference {
  readonly factKind: typeof A2_TERMINAL_EVIDENCE_ADJUDICATION;
  readonly disposition: A2TerminalDisposition;
  /** The adjudication record itself. */
  readonly adjudication: A2RecordBinding;
  /**
   * The observation record that was adjudicated - a live-window result, or in
   * earlier windows the execution / revalidation result the adjudication
   * bound. Structural provenance only; never re-hashed here.
   */
  readonly liveResult: A2RecordBinding;
  /** SHA-256 of the durable database run id, exactly as the public record binds it. */
  readonly runRefSha256: string;
  /** The ACTUAL policy of the run of record (any accepted version, not "latest"). */
  readonly acquisitionPolicyVersion: string;
  /**
   * The acquisition-policy transition ledger the adjudication bound, when the
   * run of record moved across policies for this same occupant. Carried as
   * provenance; NOT mandatory per occupant (see the audit note).
   */
  readonly acquisitionPolicyTransitionLedger: A2RecordBinding | null;
  /** The sealed SD7 detail commitment, when the adjudication recorded one. */
  readonly sealedSd7Detail: A3SealedSd7DetailCommitment | null;
}

/**
 * Evidence or authority about an occupant that is NOT a disposition. Used
 * only to tell "executed, pending adjudication" apart from "never executed".
 */
export interface A2NonAdjudicativeEvidenceFact extends A2OccupantReference {
  readonly factKind: typeof A2_NON_ADJUDICATIVE_EVIDENCE;
  readonly recordKind: A2NonAdjudicativeRecordKind;
  readonly record: A2RecordBinding;
  /** A live result's diagnostic value, if any. Never read as a disposition. */
  readonly diagnosticSd9: string | null;
  readonly diagnosticSd9IsAdjudicative: false;
}

export interface A3GenerationSlotAuthorityInput {
  readonly generationId: string;
  readonly draw: A2DrawBinding;
  readonly selection: readonly A2GenerationDrawSelectionSlot[];
  readonly reserve: readonly A2GenerationDrawReserveEntry[];
  readonly replacementLedger: A2ReplacementLedgerRevision;
  readonly adjudications: readonly A2AdjudicatedAcquisitionFact[];
  readonly evidenceStatuses: readonly A2NonAdjudicativeEvidenceFact[];
}

// ---------------------------------------------------------------------------
// C. OUTPUTS.
// ---------------------------------------------------------------------------

/** One link of a slot's occupant chain: position 0 is always the primary. */
export interface A3SlotChainLink {
  readonly chainPosition: number;
  readonly occupantKind: A3SlotOccupantKind;
  readonly reserveRankPosition: number | null;
  readonly drawEntrySha256: string;
  /** The ledger entry that installed this occupant, or null for the primary. */
  readonly installedByLedgerSequence: number | null;
  readonly installedByLedgerEntryHash: string | null;
  /** The frozen reason this occupant was replaced, or null for the current tail. */
  readonly replacedWithReason: A2UnsuccessfulDisposition | null;
}

/** The DERIVED current occupant plus the full structural chain that proves it. */
export interface A3CurrentSlotOccupant {
  readonly selectionIndex: number;
  /** Inherited from the draw selection slot, always. */
  readonly split: Split;
  readonly occupantKind: A3SlotOccupantKind;
  readonly reserveRankPosition: number | null;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly drawEntrySha256: string;
  readonly ledgerSequence: number | null;
  readonly ledgerEntryHash: string | null;
  readonly chain: readonly A3SlotChainLink[];
}

interface A3SlotAuthorityCommon {
  readonly generationId: string;
  readonly selectionIndex: number;
  readonly split: Split;
  readonly occupant: A3CurrentSlotOccupant;
}

/**
 * INTERNAL authority for ONE slot: everything a later split-scoped database
 * adapter needs to prove the exact organisation, run, split, policy,
 * adjudication and sealed commitment - and nothing about pages, sets, scores,
 * labels or classifier output. Only this module can mint one; see
 * `isA3SlotAcquisitionAuthorityReady`.
 */
export interface A3SlotAcquisitionAuthorityReady extends A3SlotAuthorityCommon {
  readonly status: typeof A3_SLOT_ACQUISITION_AUTHORITY_READY;
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly occupantKind: A3SlotOccupantKind;
  readonly reserveRankPosition: number | null;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly drawEntrySha256: string;
  readonly draw: A2DrawBinding;
  readonly replacementLedger: {
    readonly path: string;
    readonly fileSha256: string;
    readonly ledgerHash: string;
    readonly entryCount: number;
  };
  /** The ledger entry hashes of THIS slot's chain, in append order. */
  readonly slotChainLedgerEntryHashes: readonly string[];
  readonly disposition: typeof A2_ACQUISITION_SUCCESSFUL;
  readonly adjudication: A2RecordBinding;
  readonly liveResult: A2RecordBinding;
  readonly runRefSha256: string;
  readonly acquisitionPolicyVersion: string;
  readonly acquisitionPolicyTransitionLedger: A2RecordBinding | null;
  readonly sealedSd7Detail: A3SealedSd7DetailCommitment | null;
}

export type A3SlotAcquisitionAuthorityNotReady =
  | (A3SlotAuthorityCommon & {
      readonly status: typeof A2_ACQUISITION_NOT_ADJUDICATED;
    })
  | (A3SlotAuthorityCommon & {
      readonly status: typeof A2_EVIDENCE_PENDING_ADJUDICATION;
      readonly executedObservationCount: number;
    })
  | (A3SlotAuthorityCommon & {
      readonly status: typeof A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL;
      readonly disposition: A2UnsuccessfulDisposition;
      readonly replacementObligation: A3ReplacementObligationState;
    });

/**
 * One slot's authority. A STRUCTURAL REFUSAL is not a member: it is thrown as
 * `A3SlotAuthorityRefusal`, so that no partial generation result - 109 slots
 * resolved and one refused - can ever exist for a caller to consume.
 */
export type A3SlotAcquisitionAuthority =
  A3SlotAcquisitionAuthorityReady | A3SlotAcquisitionAuthorityNotReady;

export interface A3GenerationSlotAuthorityResolution {
  readonly kind: 'A3_GENERATION_SLOT_AUTHORITY_RESOLUTION';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly generationId: string;
  readonly draw: A2DrawBinding;
  readonly replacementLedger: {
    readonly path: string;
    readonly fileSha256: string;
    readonly ledgerHash: string;
    readonly entryCount: number;
  };
  readonly reserveConsumedCount: number;
  readonly reserveUnusedCount: number;
  /** Exactly one authority per selectionIndex, in selectionIndex order. */
  readonly slots: readonly A3SlotAcquisitionAuthority[];
}

/** The public-safe aggregate: counts only, no slot index, no identity. */
export interface A3GenerationSlotAuthoritySummary {
  readonly kind: 'A3_GENERATION_SLOT_AUTHORITY_SUMMARY';
  readonly generationId: string;
  readonly totalSlotCount: number;
  readonly slotCountBySplit: Readonly<Record<Split, number>>;
  readonly readySlotCount: number;
  readonly notReadySlotCount: number;
  readonly unsuccessfulCurrentOccupantCount: number;
  readonly pendingAdjudicationCount: number;
  readonly noTerminalEvidenceCount: number;
  readonly openReplacementObligationCount: number;
  readonly reserveExhaustedObligationCount: number;
  readonly replacementOccupantCount: number;
  readonly primaryOccupantCount: number;
  readonly reserveConsumedCount: number;
  readonly reserveUnusedCount: number;
  readonly status: A3GenerationSlotAuthorityStatus;
}

// ---------------------------------------------------------------------------
// D. REFUSAL.
// ---------------------------------------------------------------------------

export type A3SlotAuthorityRefusalCode =
  | 'INPUT_SHAPE_INVALID'
  | 'GENERATION_MISMATCH'
  | 'DRAW_SELECTION_INVALID'
  | 'DRAW_RESERVE_INVALID'
  | 'DRAW_IDENTITY_NOT_UNIQUE'
  | 'LEDGER_BINDING_INVALID'
  | 'LEDGER_ORDER_INVALID'
  | 'LEDGER_HASH_CHAIN_BROKEN'
  | 'LEDGER_RESERVE_REUSED'
  | 'LEDGER_RESERVE_NOT_MONOTONIC'
  | 'LEDGER_RESERVE_EXHAUSTED'
  | 'LEDGER_SLOT_MISMATCH'
  | 'LEDGER_SPLIT_MISMATCH'
  | 'LEDGER_REASON_INVALID'
  | 'LEDGER_RESERVE_IDENTITY_MISMATCH'
  | 'LEDGER_CHAIN_DISCONTINUOUS'
  | 'FACT_KIND_NOT_TERMINAL_ADJUDICATION'
  | 'FACT_KIND_NOT_NON_ADJUDICATIVE_EVIDENCE'
  | 'FACT_DIAGNOSTIC_CLAIMS_ADJUDICATIVE'
  | 'FACT_DISPOSITION_INVALID'
  | 'FACT_OCCUPANT_INVALID'
  | 'FACT_SPLIT_MISMATCH'
  | 'FACT_DRAW_IDENTITY_MISMATCH'
  | 'FACT_OCCUPANT_NOT_IN_SLOT_CHAIN'
  | 'FACT_PROVENANCE_INVALID'
  | 'DUPLICATE_TERMINAL_ADJUDICATION'
  | 'REPLACEMENT_AFTER_TERMINAL_SUCCESS'
  | 'REPLACEMENT_REASON_CONTRADICTS_ADJUDICATION'
  | 'NOT_A_RESOLVER_ISSUED_RESOLUTION';

/**
 * Fail-closed refusal. The message names a field category, an array position,
 * a slot-local chain position or an authority-state class - never an
 * organisation, eche row key, run id, URL, domain or sealed path.
 */
export class A3SlotAuthorityRefusal extends Error {
  constructor(
    readonly code: A3SlotAuthorityRefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3SlotAuthorityRefusal';
  }
}

function refuse(code: A3SlotAuthorityRefusalCode, message: string): never {
  throw new A3SlotAuthorityRefusal(code, message);
}

// ---------------------------------------------------------------------------
// E. STRUCTURAL VALIDATORS. Shape only - nothing is hashed or fetched.
// ---------------------------------------------------------------------------

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;
const FULL_COMMIT = /^[0-9a-f]{40}$/;
const EVALUATION_RECORD_PATH = /^docs\/evaluation\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.json$/;
const SEALED_DETAIL_BASENAME = /^[A-Za-z0-9_.-]+\.json$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const FETCH_POLICY_VERSION = /^orgunit-fetch-policy-v[1-9][0-9]*$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A non-narrowing presence check for inputs that already have a declared
 * type: it proves "a non-null, non-array object" at run time without
 * collapsing the static type to an index signature.
 */
function isPresentObject(value: unknown): boolean {
  return isObject(value);
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isSplit(value: unknown): value is Split {
  return (SPLITS as readonly unknown[]).includes(value);
}

function isHex(value: unknown): value is string {
  return typeof value === 'string' && LOWER_HEX_SHA256.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isEvaluationPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    EVALUATION_RECORD_PATH.test(value) &&
    !value.split('/').some((segment) => segment === '..' || segment === '.')
  );
}

function isUnsuccessful(value: unknown): value is A2UnsuccessfulDisposition {
  return (A2_UNSUCCESSFUL_DISPOSITIONS as readonly unknown[]).includes(value);
}

function isTerminalDisposition(value: unknown): value is A2TerminalDisposition {
  return (A2_TERMINAL_DISPOSITIONS as readonly unknown[]).includes(value);
}

function requireRecordBinding(value: unknown, at: string): A2RecordBinding {
  if (!isObject(value)) return refuse('FACT_PROVENANCE_INVALID', `${at} is not an object`);
  if (!isEvaluationPath(value.path)) {
    refuse('FACT_PROVENANCE_INVALID', `${at}.path is not a canonical docs/evaluation JSON path`);
  }
  if (!isHex(value.sha256)) {
    refuse('FACT_PROVENANCE_INVALID', `${at}.sha256 is not a lower-hex SHA-256`);
  }
  if (typeof value.commit !== 'string' || !FULL_COMMIT.test(value.commit)) {
    refuse('FACT_PROVENANCE_INVALID', `${at}.commit is not a full 40-character lower-hex commit`);
  }
  return Object.freeze({ path: value.path, sha256: value.sha256, commit: value.commit });
}

// ---------------------------------------------------------------------------
// F. SLOT-LOCAL CURRENT-OCCUPANT DERIVATION.
// ---------------------------------------------------------------------------

/**
 * Derives ONE slot's current occupant from its frozen draw selection entry and
 * the ledger transitions for that slot, in append order.
 *
 * Owner Clarification Q2 (`SAME_SELECTION_SLOT_APPEND_ONLY_ACROSS_PRECOMMITTED_WINDOWS`):
 * the initial occupant is `selection[S]`; each valid transition for S
 * replaces the previous occupant; earlier occupants stay history; the current
 * occupant is the tail; the split is ALWAYS the selection slot's.
 *
 * SLOT-LOCAL ONLY. One slot's chain cannot prove that a reserve is not also
 * used by another slot, that reserve positions are consumed monotonically
 * across the generation, or that the global hash chain is intact - those are
 * `resolveGenerationSlotAuthorities`'s job and this function does not pretend
 * otherwise.
 */
export function resolveCurrentSlotOccupant(
  slot: A2GenerationDrawSelectionSlot,
  slotTransitions: readonly A2ReplacementLedgerTransition[],
  reserve: readonly A2GenerationDrawReserveEntry[],
): A3CurrentSlotOccupant {
  if (!isPresentObject(slot) || !isIntegerIn(slot.selectionIndex, 0, Number.MAX_SAFE_INTEGER)) {
    refuse('INPUT_SHAPE_INVALID', 'slot is not a draw selection entry');
  }
  if (!isSplit(slot.split)) refuse('INPUT_SHAPE_INVALID', 'slot.split is not a frozen split');
  if (!Array.isArray(slotTransitions) || !Array.isArray(reserve)) {
    refuse('INPUT_SHAPE_INVALID', 'slot transitions and reserve must be arrays');
  }

  const chain: A3SlotChainLink[] = [];
  let tail = {
    occupantKind: 'PRIMARY' as A3SlotOccupantKind,
    reserveRankPosition: null as number | null,
    echeRowKey: slot.echeRowKey,
    organisationId: slot.organisationId,
    drawEntrySha256: slot.drawEntrySha256,
    ledgerSequence: null as number | null,
    ledgerEntryHash: null as string | null,
  };
  const pending: { link: Omit<A3SlotChainLink, 'replacedWithReason'> }[] = [
    {
      link: {
        chainPosition: 0,
        occupantKind: 'PRIMARY',
        reserveRankPosition: null,
        drawEntrySha256: slot.drawEntrySha256,
        installedByLedgerSequence: null,
        installedByLedgerEntryHash: null,
      },
    },
  ];
  const reasons: A2UnsuccessfulDisposition[] = [];

  slotTransitions.forEach((transition, j) => {
    const at = `slot chain transition ${String(j)}`;
    if (!isPresentObject(transition)) refuse('INPUT_SHAPE_INVALID', `${at} is not an object`);
    if (transition.selectionIndex !== slot.selectionIndex) {
      refuse('LEDGER_SLOT_MISMATCH', `${at} names a different selectionIndex`);
    }
    if (transition.split !== slot.split) {
      refuse('LEDGER_SPLIT_MISMATCH', `${at} split differs from its slot's frozen split`);
    }
    if (!isUnsuccessful(transition.reason)) {
      refuse('LEDGER_REASON_INVALID', `${at} reason is not one of the four frozen tokens`);
    }
    if (!isIntegerIn(transition.sequence, 0, Number.MAX_SAFE_INTEGER)) {
      refuse('LEDGER_ORDER_INVALID', `${at} sequence is not a non-negative integer`);
    }
    if (tail.ledgerSequence !== null && transition.sequence <= tail.ledgerSequence) {
      refuse('LEDGER_ORDER_INVALID', `${at} is not after the slot's previous transition`);
    }
    const expectedKind = j === 0 ? 'ORIGINAL_SELECTION' : 'RESERVE_REPLACEMENT';
    if (transition.replacedOccupantKind !== expectedKind) {
      refuse('LEDGER_CHAIN_DISCONTINUOUS', `${at} replacedOccupantKind is not ${expectedKind}`);
    }
    if (transition.previousSequenceForSlot !== tail.ledgerSequence) {
      refuse(
        'LEDGER_CHAIN_DISCONTINUOUS',
        `${at} previousSequenceForSlot does not point at the slot's previous transition`,
      );
    }
    if (transition.replacedEcheRowKey !== tail.echeRowKey) {
      refuse(
        'LEDGER_CHAIN_DISCONTINUOUS',
        j === 0
          ? `${at} does not replace the slot's initial draw occupant`
          : `${at} does not replace the slot's previous tail occupant`,
      );
    }
    if (!isIntegerIn(transition.reserveRankPosition, 0, reserve.length - 1)) {
      refuse('LEDGER_RESERVE_IDENTITY_MISMATCH', `${at} reserveRankPosition has no draw entry`);
    }
    const reserveEntry = reserve[transition.reserveRankPosition];
    if (
      reserveEntry === undefined ||
      reserveEntry.reserveRankPosition !== transition.reserveRankPosition ||
      reserveEntry.echeRowKey !== transition.replacementEcheRowKey
    ) {
      refuse(
        'LEDGER_RESERVE_IDENTITY_MISMATCH',
        `${at} replacement identity is not the draw's reserve entry at its position`,
      );
    }
    if (!isHex(transition.entryHash)) {
      refuse('LEDGER_HASH_CHAIN_BROKEN', `${at} entryHash is not a lower-hex SHA-256`);
    }
    for (const { link } of pending) {
      if (link.reserveRankPosition === transition.reserveRankPosition) {
        refuse('LEDGER_RESERVE_REUSED', `${at} reinstalls a reserve already in this slot chain`);
      }
    }

    reasons.push(transition.reason);
    tail = {
      occupantKind: 'RESERVE_REPLACEMENT',
      reserveRankPosition: transition.reserveRankPosition,
      echeRowKey: reserveEntry.echeRowKey,
      organisationId: reserveEntry.organisationId,
      drawEntrySha256: reserveEntry.drawEntrySha256,
      ledgerSequence: transition.sequence,
      ledgerEntryHash: transition.entryHash,
    };
    pending.push({
      link: {
        chainPosition: j + 1,
        occupantKind: 'RESERVE_REPLACEMENT',
        reserveRankPosition: transition.reserveRankPosition,
        drawEntrySha256: reserveEntry.drawEntrySha256,
        installedByLedgerSequence: transition.sequence,
        installedByLedgerEntryHash: transition.entryHash,
      },
    });
  });

  pending.forEach(({ link }, k) => {
    chain.push(Object.freeze({ ...link, replacedWithReason: reasons[k] ?? null }));
  });

  return Object.freeze({
    selectionIndex: slot.selectionIndex,
    split: slot.split,
    occupantKind: tail.occupantKind,
    reserveRankPosition: tail.reserveRankPosition,
    echeRowKey: tail.echeRowKey,
    organisationId: tail.organisationId,
    drawEntrySha256: tail.drawEntrySha256,
    ledgerSequence: tail.ledgerSequence,
    ledgerEntryHash: tail.ledgerEntryHash,
    chain: Object.freeze(chain),
  });
}

// ---------------------------------------------------------------------------
// G. GENERATION-GLOBAL VALIDATION.
// ---------------------------------------------------------------------------

function validateDraw(input: A3GenerationSlotAuthorityInput): void {
  const { draw, selection, reserve } = input;
  if (
    !isPresentObject(draw) ||
    !isNonEmptyString(draw.path) ||
    !isHex(draw.artifactFileSha256) ||
    !isHex(draw.drawHash)
  ) {
    refuse('DRAW_SELECTION_INVALID', 'draw binding is not a path plus two lower-hex digests');
  }
  if (!Array.isArray(selection) || selection.length !== GENERATION_1_SELECTED_ORGANISATIONS) {
    refuse('DRAW_SELECTION_INVALID', 'selection is not exactly the frozen 110 slots');
  }
  if (!Array.isArray(reserve) || reserve.length !== GENERATION_1_RESERVE_ORGANISATIONS) {
    refuse('DRAW_RESERVE_INVALID', 'reserve is not exactly the frozen 40 entries');
  }
  const cycle = SPLIT_ASSIGNMENT_CYCLE_V2_R2;
  const seenKeys = new Set<string>();
  const seenOrganisations = new Set<string>();
  const seenDigests = new Set<string>();
  const unique = (key: unknown, organisationId: unknown, digest: unknown, at: string): void => {
    if (!isNonEmptyString(key) || !isNonEmptyString(organisationId) || !isHex(digest)) {
      refuse('INPUT_SHAPE_INVALID', `${at} identity fields are malformed`);
    }
    if (seenKeys.has(key) || seenOrganisations.has(organisationId) || seenDigests.has(digest)) {
      refuse('DRAW_IDENTITY_NOT_UNIQUE', `${at} repeats an identity already in the draw`);
    }
    seenKeys.add(key);
    seenOrganisations.add(organisationId);
    seenDigests.add(digest);
  };
  selection.forEach((entry, index) => {
    const at = `selection[${String(index)}]`;
    if (!isPresentObject(entry) || entry.selectionIndex !== index) {
      refuse('DRAW_SELECTION_INVALID', `${at} is out of order`);
    }
    if (!isSplit(entry.split) || entry.split !== cycle[index % cycle.length]) {
      refuse('DRAW_SELECTION_INVALID', `${at} split is not the frozen split-cycle value`);
    }
    unique(entry.echeRowKey, entry.organisationId, entry.drawEntrySha256, at);
  });
  for (const split of SPLITS) {
    const count = selection.filter((entry) => entry.split === split).length;
    if (count !== GENERATION_1_SPLIT_ORGANISATION_COUNTS[split]) {
      refuse('DRAW_SELECTION_INVALID', `selection ${split} count is not the frozen count`);
    }
  }
  reserve.forEach((entry, index) => {
    const at = `reserve[${String(index)}]`;
    if (!isPresentObject(entry) || entry.reserveRankPosition !== index) {
      refuse('DRAW_RESERVE_INVALID', `${at} is out of order`);
    }
    if ('split' in entry) refuse('DRAW_RESERVE_INVALID', `${at} carries a split of its own`);
    unique(entry.echeRowKey, entry.organisationId, entry.drawEntrySha256, at);
  });
}

/**
 * The generation-global ledger invariants a single slot chain cannot prove.
 * Mirrors the canonical validator's positional rules without its hashing.
 */
function validateLedgerGlobally(input: A3GenerationSlotAuthorityInput): void {
  const ledger = input.replacementLedger;
  if (
    !isPresentObject(ledger) ||
    !isEvaluationPath(ledger.path) ||
    !isHex(ledger.fileSha256) ||
    !isHex(ledger.ledgerHash) ||
    !Array.isArray(ledger.entries)
  ) {
    refuse('LEDGER_BINDING_INVALID', 'replacement ledger binding or entries are malformed');
  }
  const usedReserve = new Set<number>();
  const usedReplacementKeys = new Set<string>();
  const selectionKeys = new Set(input.selection.map((entry) => entry.echeRowKey));
  let previousHash: string | null = null;
  let previousRecordedAt = '';
  ledger.entries.forEach((entry, k) => {
    const at = `ledger entry ${String(k)}`;
    if (!isPresentObject(entry)) refuse('INPUT_SHAPE_INVALID', `${at} is not an object`);
    if (entry.sequence !== k) refuse('LEDGER_ORDER_INVALID', `${at} sequence is not ${String(k)}`);
    if (k >= GENERATION_1_RESERVE_ORGANISATIONS) {
      refuse('LEDGER_RESERVE_EXHAUSTED', `${at} is beyond the frozen 40-entry reserve`);
    }
    if (!isIntegerIn(entry.selectionIndex, 0, GENERATION_1_SELECTED_ORGANISATIONS - 1)) {
      refuse('LEDGER_SLOT_MISMATCH', `${at} selectionIndex is not a frozen slot`);
    }
    if (!isIntegerIn(entry.reserveRankPosition, 0, GENERATION_1_RESERVE_ORGANISATIONS - 1)) {
      refuse('LEDGER_RESERVE_IDENTITY_MISMATCH', `${at} reserveRankPosition is not 0..39`);
    }
    if (
      usedReserve.has(entry.reserveRankPosition) ||
      usedReplacementKeys.has(entry.replacementEcheRowKey)
    ) {
      refuse('LEDGER_RESERVE_REUSED', `${at} consumes a reserve an earlier entry already consumed`);
    }
    usedReserve.add(entry.reserveRankPosition);
    usedReplacementKeys.add(entry.replacementEcheRowKey);
    if (entry.reserveRankPosition !== k) {
      refuse(
        'LEDGER_RESERVE_NOT_MONOTONIC',
        `${at} breaks monotonic reserve consumption (Owner Clarification Q1)`,
      );
    }
    if (selectionKeys.has(entry.replacementEcheRowKey)) {
      refuse('LEDGER_RESERVE_IDENTITY_MISMATCH', `${at} replacement identity is a selected entry`);
    }
    if (typeof entry.recordedAtUtc !== 'string' || !ISO_UTC.test(entry.recordedAtUtc)) {
      refuse('LEDGER_ORDER_INVALID', `${at} recordedAtUtc is not an explicit ISO-8601 UTC instant`);
    }
    if (entry.recordedAtUtc < previousRecordedAt) {
      refuse('LEDGER_ORDER_INVALID', `${at} recordedAtUtc goes backwards`);
    }
    previousRecordedAt = entry.recordedAtUtc;
    if (entry.previousEntryHash !== previousHash) {
      refuse(
        'LEDGER_HASH_CHAIN_BROKEN',
        `${at} previousEntryHash does not chain to the prior entry`,
      );
    }
    if (!isHex(entry.entryHash)) {
      refuse('LEDGER_HASH_CHAIN_BROKEN', `${at} entryHash is not a lower-hex SHA-256`);
    }
    previousHash = entry.entryHash;
  });
}

// ---------------------------------------------------------------------------
// H. FACT VALIDATION AND OCCUPANT MATCHING.
// ---------------------------------------------------------------------------

function occupantKeyOf(ref: {
  readonly occupantKind: A3SlotOccupantKind;
  readonly reserveRankPosition: number | null;
  readonly drawEntrySha256: string;
}): string {
  return `${ref.occupantKind}|${String(ref.reserveRankPosition)}|${ref.drawEntrySha256}`;
}

/**
 * Checks the occupant a fact names against the frozen draw domains and the
 * slot's derived chain. Returns the chain position it names.
 */
function locateFactOccupant(
  fact: A2OccupantReference,
  at: string,
  input: A3GenerationSlotAuthorityInput,
  chains: readonly A3CurrentSlotOccupant[],
): { selectionIndex: number; chainPosition: number } {
  if (fact.generationId !== input.generationId) {
    refuse('GENERATION_MISMATCH', `${at} names another generation`);
  }
  if (!isIntegerIn(fact.selectionIndex, 0, GENERATION_1_SELECTED_ORGANISATIONS - 1)) {
    refuse('FACT_OCCUPANT_INVALID', `${at} selectionIndex is not a frozen slot`);
  }
  const occupant = chains[fact.selectionIndex]!;
  if (fact.split !== occupant.split) {
    refuse('FACT_SPLIT_MISMATCH', `${at} split differs from its slot's frozen split`);
  }
  let expectedDigest: string;
  if (fact.occupantKind === 'PRIMARY') {
    if (fact.reserveRankPosition !== null) {
      refuse('FACT_OCCUPANT_INVALID', `${at} is a PRIMARY with a reserve position`);
    }
    expectedDigest = input.selection[fact.selectionIndex]!.drawEntrySha256;
  } else if (fact.occupantKind === 'RESERVE_REPLACEMENT') {
    if (!isIntegerIn(fact.reserveRankPosition, 0, GENERATION_1_RESERVE_ORGANISATIONS - 1)) {
      refuse('FACT_OCCUPANT_INVALID', `${at} is a RESERVE_REPLACEMENT without a position 0..39`);
    }
    expectedDigest = input.reserve[fact.reserveRankPosition]!.drawEntrySha256;
  } else {
    return refuse(
      'FACT_OCCUPANT_INVALID',
      `${at} occupantKind is not PRIMARY or RESERVE_REPLACEMENT`,
    );
  }
  if (fact.drawEntrySha256 !== expectedDigest) {
    refuse(
      'FACT_DRAW_IDENTITY_MISMATCH',
      `${at} draw-entry digest is not the frozen ${fact.occupantKind} entry it names`,
    );
  }
  const key = occupantKeyOf(fact);
  const chainPosition = occupant.chain.findIndex((link) => occupantKeyOf(link) === key);
  if (chainPosition < 0) {
    refuse('FACT_OCCUPANT_NOT_IN_SLOT_CHAIN', `${at} names an occupant this slot never had`);
  }
  return { selectionIndex: fact.selectionIndex, chainPosition };
}

function validateTerminalFact(
  fact: A2AdjudicatedAcquisitionFact,
  at: string,
  slotSplit: Split,
): A2AdjudicatedAcquisitionFact {
  if (!isTerminalDisposition(fact.disposition)) {
    refuse('FACT_DISPOSITION_INVALID', `${at} disposition is not one of the five frozen tokens`);
  }
  const adjudication = requireRecordBinding(fact.adjudication, `${at}.adjudication`);
  const liveResult = requireRecordBinding(fact.liveResult, `${at}.liveResult`);
  if (!isHex(fact.runRefSha256)) {
    refuse('FACT_PROVENANCE_INVALID', `${at}.runRefSha256 is not a lower-hex SHA-256`);
  }
  if (
    typeof fact.acquisitionPolicyVersion !== 'string' ||
    !FETCH_POLICY_VERSION.test(fact.acquisitionPolicyVersion)
  ) {
    refuse(
      'FACT_PROVENANCE_INVALID',
      `${at}.acquisitionPolicyVersion is not a fetch-policy version`,
    );
  }
  const transition =
    fact.acquisitionPolicyTransitionLedger === null
      ? null
      : requireRecordBinding(
          fact.acquisitionPolicyTransitionLedger,
          `${at}.acquisitionPolicyTransitionLedger`,
        );
  let sealed: A3SealedSd7DetailCommitment | null = null;
  if (fact.sealedSd7Detail !== null) {
    const detail: unknown = fact.sealedSd7Detail;
    if (
      !isObject(detail) ||
      !isSplit(detail.split) ||
      typeof detail.file !== 'string' ||
      !SEALED_DETAIL_BASENAME.test(detail.file) ||
      !isHex(detail.sha256) ||
      !isIntegerIn(detail.bytes, 1, Number.MAX_SAFE_INTEGER)
    ) {
      refuse('FACT_PROVENANCE_INVALID', `${at}.sealedSd7Detail is not a basename commitment`);
    }
    if (detail.split !== slotSplit) {
      refuse('FACT_SPLIT_MISMATCH', `${at}.sealedSd7Detail names another split's sealed root`);
    }
    sealed = Object.freeze({
      split: detail.split,
      file: detail.file,
      sha256: detail.sha256,
      bytes: detail.bytes,
    });
  }
  return Object.freeze({
    ...fact,
    adjudication,
    liveResult,
    acquisitionPolicyTransitionLedger: transition,
    sealedSd7Detail: sealed,
  });
}

// ---------------------------------------------------------------------------
// I. THE GENERATION RESOLVER.
// ---------------------------------------------------------------------------

const ISSUED_READY = new WeakSet<object>();
const ISSUED_RESOLUTIONS = new WeakSet<object>();

/**
 * True ONLY for a READY authority this module minted. A clone, a spread, a
 * literal, a live-result row or a deserialised copy is not one - downstream
 * A3 code must consume a minted `A3SlotAcquisitionAuthorityReady`, never a
 * live result or anything shaped like one.
 */
export function isA3SlotAcquisitionAuthorityReady(
  value: unknown,
): value is A3SlotAcquisitionAuthorityReady {
  return typeof value === 'object' && value !== null && ISSUED_READY.has(value);
}

/**
 * Resolves one authority per frozen selection slot, or refuses the whole
 * generation. The order of work is the design:
 *
 *   1. the draw is exactly the frozen 110 + 40, in order, with the frozen
 *      split cycle and unique identities;
 *   2. the ledger is globally valid (order, monotonic consumption, no reuse,
 *      unbroken previous-hash linkage, no exhaustion overflow);
 *   3. every slot's chain is derived by `resolveCurrentSlotOccupant`;
 *   4. every fact is validated, located in its slot's chain, and counted -
 *      at most ONE terminal adjudication per occupant, however it is
 *      supplied, and none for an occupant that was later replaced after a
 *      terminal success;
 *   5. each slot is classified from its CURRENT occupant's facts only.
 */
export function resolveGenerationSlotAuthorities(
  input: A3GenerationSlotAuthorityInput,
): A3GenerationSlotAuthorityResolution {
  if (!isPresentObject(input)) refuse('INPUT_SHAPE_INVALID', 'input is not an object');
  if (input.generationId !== GENERATION_ID) {
    refuse('GENERATION_MISMATCH', 'generationId is not the frozen Generation-1 id');
  }
  if (!Array.isArray(input.adjudications) || !Array.isArray(input.evidenceStatuses)) {
    refuse('INPUT_SHAPE_INVALID', 'adjudications and evidenceStatuses must be arrays');
  }
  validateDraw(input);
  validateLedgerGlobally(input);

  const ledger = input.replacementLedger;
  const chains = input.selection.map((slot) =>
    resolveCurrentSlotOccupant(
      slot,
      ledger.entries.filter((entry) => entry.selectionIndex === slot.selectionIndex),
      input.reserve,
    ),
  );

  // Terminal adjudications, keyed by (slot, chain position). No latest-wins.
  const terminalBySlot = new Map<number, Map<number, A2AdjudicatedAcquisitionFact>>();
  input.adjudications.forEach((raw, i) => {
    const at = `adjudications[${String(i)}]`;
    if (!isPresentObject(raw)) refuse('INPUT_SHAPE_INVALID', `${at} is not an object`);
    if (raw.factKind !== A2_TERMINAL_EVIDENCE_ADJUDICATION) {
      refuse(
        'FACT_KIND_NOT_TERMINAL_ADJUDICATION',
        `${at} is not an ${A2_TERMINAL_EVIDENCE_ADJUDICATION} fact`,
      );
    }
    const located = locateFactOccupant(raw, at, input, chains);
    const fact = validateTerminalFact(raw, at, chains[located.selectionIndex]!.split);
    const perSlot = terminalBySlot.get(located.selectionIndex) ?? new Map();
    if (perSlot.has(located.chainPosition)) {
      refuse(
        'DUPLICATE_TERMINAL_ADJUDICATION',
        `${at} is a second terminal adjudication for slot-chain position ${String(located.chainPosition)}`,
      );
    }
    perSlot.set(located.chainPosition, fact);
    terminalBySlot.set(located.selectionIndex, perSlot);
  });

  // Non-adjudicative evidence: counted, never promoted.
  const executedObservationsBySlot = new Map<number, Map<number, number>>();
  input.evidenceStatuses.forEach((raw, i) => {
    const at = `evidenceStatuses[${String(i)}]`;
    if (!isPresentObject(raw)) refuse('INPUT_SHAPE_INVALID', `${at} is not an object`);
    if (raw.factKind !== A2_NON_ADJUDICATIVE_EVIDENCE) {
      refuse(
        'FACT_KIND_NOT_NON_ADJUDICATIVE_EVIDENCE',
        `${at} is not an ${A2_NON_ADJUDICATIVE_EVIDENCE} fact`,
      );
    }
    if (!(A2_NON_ADJUDICATIVE_RECORD_KINDS as readonly unknown[]).includes(raw.recordKind)) {
      refuse('FACT_KIND_NOT_NON_ADJUDICATIVE_EVIDENCE', `${at} recordKind is not a known kind`);
    }
    if (raw.diagnosticSd9IsAdjudicative !== false) {
      refuse(
        'FACT_DIAGNOSTIC_CLAIMS_ADJUDICATIVE',
        `${at} does not declare itself non-adjudicative`,
      );
    }
    requireRecordBinding(raw.record, `${at}.record`);
    const located = locateFactOccupant(raw, at, input, chains);
    if (A2_EXECUTED_OBSERVATION_RECORD_KINDS.includes(raw.recordKind)) {
      const perSlot = executedObservationsBySlot.get(located.selectionIndex) ?? new Map();
      perSlot.set(located.chainPosition, (perSlot.get(located.chainPosition) ?? 0) + 1);
      executedObservationsBySlot.set(located.selectionIndex, perSlot);
    }
  });

  // Historical occupants: a replacement must follow an UNSUCCESSFUL occupant
  // whose adjudicated reason is the ledger's reason (Q2 + Q3). A chain
  // terminates on success; a later transition after it is refused.
  chains.forEach((occupant) => {
    const perSlot = terminalBySlot.get(occupant.selectionIndex);
    if (perSlot === undefined) return;
    occupant.chain.forEach((link) => {
      if (link.replacedWithReason === null) return;
      const fact = perSlot.get(link.chainPosition);
      if (fact === undefined) return;
      if (fact.disposition === A2_ACQUISITION_SUCCESSFUL) {
        refuse(
          'REPLACEMENT_AFTER_TERMINAL_SUCCESS',
          `slot-chain position ${String(link.chainPosition)} was adjudicated successful and then replaced`,
        );
      }
      if (fact.disposition !== link.replacedWithReason) {
        refuse(
          'REPLACEMENT_REASON_CONTRADICTS_ADJUDICATION',
          `slot-chain position ${String(link.chainPosition)} ledger reason differs from its adjudicated disposition`,
        );
      }
    });
  });

  const reserveConsumedCount = ledger.entries.length;
  const reserveUnusedCount = GENERATION_1_RESERVE_ORGANISATIONS - reserveConsumedCount;
  const ledgerBinding = Object.freeze({
    path: ledger.path,
    fileSha256: ledger.fileSha256,
    ledgerHash: ledger.ledgerHash,
    entryCount: reserveConsumedCount,
  });
  const drawBinding = Object.freeze({
    path: input.draw.path,
    artifactFileSha256: input.draw.artifactFileSha256,
    drawHash: input.draw.drawHash,
  });

  const slots = chains.map((occupant): A3SlotAcquisitionAuthority => {
    const tailPosition = occupant.chain.length - 1;
    const common = {
      generationId: input.generationId,
      selectionIndex: occupant.selectionIndex,
      split: occupant.split,
      occupant,
    };
    const fact = terminalBySlot.get(occupant.selectionIndex)?.get(tailPosition);
    if (fact === undefined) {
      const executed =
        executedObservationsBySlot.get(occupant.selectionIndex)?.get(tailPosition) ?? 0;
      return executed > 0
        ? Object.freeze({
            ...common,
            status: A2_EVIDENCE_PENDING_ADJUDICATION,
            executedObservationCount: executed,
          })
        : Object.freeze({ ...common, status: A2_ACQUISITION_NOT_ADJUDICATED });
    }
    if (fact.disposition !== A2_ACQUISITION_SUCCESSFUL) {
      return Object.freeze({
        ...common,
        status: A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL,
        disposition: fact.disposition,
        replacementObligation:
          reserveUnusedCount > 0
            ? 'REPLACEMENT_OBLIGATION_RESERVE_AVAILABLE'
            : 'REPLACEMENT_OBLIGATION_RESERVE_EXHAUSTED',
      });
    }
    const ready: A3SlotAcquisitionAuthorityReady = Object.freeze({
      ...common,
      status: A3_SLOT_ACQUISITION_AUTHORITY_READY,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      occupantKind: occupant.occupantKind,
      reserveRankPosition: occupant.reserveRankPosition,
      organisationId: occupant.organisationId,
      echeRowKey: occupant.echeRowKey,
      drawEntrySha256: occupant.drawEntrySha256,
      draw: drawBinding,
      replacementLedger: ledgerBinding,
      slotChainLedgerEntryHashes: Object.freeze(
        occupant.chain.flatMap((link) =>
          link.installedByLedgerEntryHash === null ? [] : [link.installedByLedgerEntryHash],
        ),
      ),
      disposition: A2_ACQUISITION_SUCCESSFUL,
      adjudication: fact.adjudication,
      liveResult: fact.liveResult,
      runRefSha256: fact.runRefSha256,
      acquisitionPolicyVersion: fact.acquisitionPolicyVersion,
      acquisitionPolicyTransitionLedger: fact.acquisitionPolicyTransitionLedger,
      sealedSd7Detail: fact.sealedSd7Detail,
    });
    ISSUED_READY.add(ready);
    return ready;
  });

  const resolution: A3GenerationSlotAuthorityResolution = Object.freeze({
    kind: 'A3_GENERATION_SLOT_AUTHORITY_RESOLUTION',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    generationId: input.generationId,
    draw: drawBinding,
    replacementLedger: ledgerBinding,
    reserveConsumedCount,
    reserveUnusedCount,
    slots: Object.freeze(slots),
  });
  ISSUED_RESOLUTIONS.add(resolution);
  return resolution;
}

// ---------------------------------------------------------------------------
// J. THE PUBLIC-SAFE SUMMARY.
// ---------------------------------------------------------------------------

/**
 * Aggregate counts over a resolution THIS MODULE issued - never over
 * caller-supplied counts. COMPLETE means only that every one of the 110 slots
 * has an acquisition-of-record organisation allowed to feed A3; it does not
 * mean A3 is complete, and it is not a corpus-freeze verdict.
 */
export function deriveGenerationSlotAuthoritySummary(
  resolution: A3GenerationSlotAuthorityResolution,
): A3GenerationSlotAuthoritySummary {
  if (!isPresentObject(resolution) || !ISSUED_RESOLUTIONS.has(resolution)) {
    refuse('NOT_A_RESOLVER_ISSUED_RESOLUTION', 'summary input was not issued by the resolver');
  }
  const { slots } = resolution;
  const count = (predicate: (slot: A3SlotAcquisitionAuthority) => boolean): number =>
    slots.filter(predicate).length;

  const readySlotCount = count((slot) => slot.status === A3_SLOT_ACQUISITION_AUTHORITY_READY);
  const unsuccessfulCurrentOccupantCount = count(
    (slot) => slot.status === A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL,
  );
  const pendingAdjudicationCount = count(
    (slot) => slot.status === A2_EVIDENCE_PENDING_ADJUDICATION,
  );
  const noTerminalEvidenceCount = count((slot) => slot.status === A2_ACQUISITION_NOT_ADJUDICATED);
  const openReplacementObligationCount = count(
    (slot) =>
      slot.status === A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL &&
      slot.replacementObligation === 'REPLACEMENT_OBLIGATION_RESERVE_AVAILABLE',
  );
  const replacementOccupantCount = count(
    (slot) => slot.occupant.occupantKind === 'RESERVE_REPLACEMENT',
  );
  const notReadySlotCount = slots.length - readySlotCount;
  const slotCountBySplit = Object.freeze(
    Object.fromEntries(
      SPLITS.map((split) => [split, count((slot) => slot.split === split)]),
    ) as Record<Split, number>,
  );

  // Mechanical reconciliation. A mismatch is a defect in this module.
  if (
    slots.length !== GENERATION_1_SELECTED_ORGANISATIONS ||
    unsuccessfulCurrentOccupantCount + pendingAdjudicationCount + noTerminalEvidenceCount !==
      notReadySlotCount ||
    SPLITS.some(
      (split) => slotCountBySplit[split] !== GENERATION_1_SPLIT_ORGANISATION_COUNTS[split],
    )
  ) {
    refuse('NOT_A_RESOLVER_ISSUED_RESOLUTION', 'resolution counts do not reconcile');
  }

  return Object.freeze({
    kind: 'A3_GENERATION_SLOT_AUTHORITY_SUMMARY',
    generationId: resolution.generationId,
    totalSlotCount: slots.length,
    slotCountBySplit,
    readySlotCount,
    notReadySlotCount,
    unsuccessfulCurrentOccupantCount,
    pendingAdjudicationCount,
    noTerminalEvidenceCount,
    openReplacementObligationCount,
    reserveExhaustedObligationCount:
      unsuccessfulCurrentOccupantCount - openReplacementObligationCount,
    replacementOccupantCount,
    primaryOccupantCount: slots.length - replacementOccupantCount,
    reserveConsumedCount: resolution.reserveConsumedCount,
    reserveUnusedCount: resolution.reserveUnusedCount,
    status:
      readySlotCount === GENERATION_1_SELECTED_ORGANISATIONS
        ? A3_GENERATION_SLOT_AUTHORITY_COMPLETE
        : A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE,
  });
}

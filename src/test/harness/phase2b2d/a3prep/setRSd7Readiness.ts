/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R13: THE SET_R CAP-4 DOCUMENT
 * MEMBERSHIP, THE COMPLETE SET_R RANK'S FREEZE READINESS, AND THE SET_R
 * EXTENSION BOUNDARY, ALL DERIVED FROM ONE R12 PREPARATION.
 *
 * R12 (`setRSd7.ts`) owns the composition: R11's rank, R7's greedy walk, the
 * join. R13 owns only the MEMBERSHIP CONSEQUENCES of that composition while
 * each short-text document's `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP` is
 * semantically unresolved. It consumes an `A3SetRSd7Preparation` in memory and
 * never re-ranks, re-walks, re-scores, re-hashes or rebuilds a graph; R12's
 * preparation shape is unchanged and is not extended with cap fields.
 *
 * THREE SEPARATE QUESTIONS, NEVER INTERCHANGEABLE
 *
 *   A. Is the INITIAL cap - the first SET_R_MAX_PAGES_PER_ORGANISATION = 4
 *      document identities - exact? (`determineSetRDocumentCap`)
 *   B. Is the COMPLETE survivor-aware SET_R rank exact? (`fullRankReadiness`)
 *   C. Is every slot's REQUIRED selected membership exact, corpus-wide? That
 *      is the freeze preflight's question (`corpusFreezePreflight.ts`). R13
 *      first answered it from B; the later append-only Generation-1 owner
 *      clarification (`SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY`) scoped
 *      REQUIRED to the reachable capped membership, so the preflight now reads
 *      A, and B remains full-order evidence.
 *
 *   A being exact does NOT make B exact.
 *
 * WHY THE R8 CAP PROOF APPLIES MECHANICALLY TO CAP 4
 *
 *   The owner short-text policy
 *   (`SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_AMBIGUITY_PROPAGATION_V1`) materialises
 *   only membership identical under EVERY treatment in
 *   `SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1`: each unresolved
 *   document independently ABSENT or PRESENT at its frozen rank position, with
 *   `NO_EVICTION_OR_RECLASSIFICATION` of a measurable survivor. Its clause 7
 *   accepts R8's exact-tail case in cap-generic terms ("at least cap-many
 *   measurable survivors ... the last capped one strictly before every
 *   unresolved short-text source rank"), and clause 14 applies the policy to
 *   SET_R once its truthful order exists (R11). Under the GREEDY walk a
 *   document's fate depends only on documents ranked BEFORE it and a later
 *   document never removes an earlier kept one. So when survivor #4's source
 *   position precedes the earliest unresolved one, the first four measurable
 *   survivors are fixed before any unresolved position is reached, and every
 *   treatment keeps them as the first four members. Nothing in the proof uses
 *   the number 8; it holds for 4 unchanged. It holds for GREEDY only, which is
 *   why the procedure is bound at compile time and at run time below.
 *
 * THE CAP IS EXACT IN EXACTLY TWO CASES, AND BLOCKED IN EVERY OTHER
 *
 *   A. `NO_UNRESOLVED_SHORT_TEXT`: the measurable survivors ARE the post-SD7
 *      membership; the cap is the first min(4, n) of them (none when n = 0).
 *   B. `FOUR_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT`: survivor
 *      #4 exists and its source position is strictly below the earliest
 *      unresolved short-text source position.
 *
 *   Otherwise BLOCKED, with no document list under any name: no best guess,
 *   no measurable-only prefix, no keep/drop choice for short text.
 *
 * WHY THE COMPLETE RANK IS BLOCKED BY ANY UNRESOLVED SHORT TEXT
 *
 *   ABSENT and PRESENT_AT_FROZEN_SAMPLE_RANK_POSITION give different complete
 *   memberships for the same document, so one unresolved document anywhere in
 *   the rank - even after survivor #4, with the cap exact - blocks it.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 *   - It enumerates no treatment: the 2^k reference model is test logic only.
 *     At run time it evaluates the proved closed-form condition.
 *   - It reads no score, hashes nothing, walks no graph and calls no R6, R7,
 *     R10 or R11 function; R12 already fixed the order.
 *   - It decides no short-text document's semantic status, evaluates no SD9,
 *     truncates no organisation share, answers no K4, selects no extension and
 *     produces no final SET_R, corpus, manifest, item or gold identity.
 *   - No readiness summary or refusal message carries a document SHA-256, a
 *     salted digest, a score, a page id, a URL, text or an organisation
 *     identity. A refusal names a POSITION or a count.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read, no hashing. It mutates no input.
 */
import {
  K3_SD7_SURVIVOR_PROCEDURE,
  SET_R_MAX_PAGES_PER_ORGANISATION,
  SPLITS,
  type Split,
} from './contracts.js';
import { SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED } from './sd7.js';
import {
  A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS,
  type A3SetRMeasurableSurvivorRankedDocument,
  type A3SetRSd7Preparation,
} from './setRSd7.js';
import type { A3SelectionIndex } from './types.js';

// ---------------------------------------------------------------------------
// The K3 procedure the exact-tail rule (case B) is proved for.
// ---------------------------------------------------------------------------

/**
 * Case B is sound for this procedure only. The annotated assignment below is a
 * compile-time tripwire: if the K3 contract ever names another procedure, this
 * file stops type-checking until the proof is consciously reviewed.
 */
export const SET_R_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE = 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK';
const K3_PROCEDURE_IS_THE_PROVED_ONE: typeof SET_R_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE =
  K3_SD7_SURVIVOR_PROCEDURE;

// ---------------------------------------------------------------------------
// Refusal: malformed in-memory input. Never names an identity or caller value.
// ---------------------------------------------------------------------------

export type A3SetRSd7ReadinessRefusalCode =
  | 'K3_PROCEDURE_NOT_PROVED'
  | 'SLOT_IDENTITY_INVALID'
  | 'PREPARATION_KIND_INVALID'
  | 'PREPARATION_SLOT_MISMATCH'
  | 'PREPARATION_ORDER_INVALID'
  | 'PREPARATION_INCONSISTENT'
  | 'READINESS_INVALID'
  | 'EXTENSION_CURSOR_INVALID';

/** A fail-closed refusal. The message starts with `STOP:` and names no identity. */
export class A3SetRSd7ReadinessRefusal extends Error {
  readonly code: A3SetRSd7ReadinessRefusalCode;
  constructor(code: A3SetRSd7ReadinessRefusalCode, message: string) {
    super(`STOP: ${code}: ${message}`);
    this.name = 'A3SetRSd7ReadinessRefusal';
    this.code = code;
  }
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCanonicalSplit(value: unknown): value is Split {
  return typeof value === 'string' && (SPLITS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// A. THE INITIAL SET_R CAP.
// ---------------------------------------------------------------------------

export const SET_R_DOCUMENT_CAP_EXACT = 'SET_R_DOCUMENT_CAP_EXACT';
export const SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP =
  'SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP';

export type A3SetRDocumentCapExactReason =
  'NO_UNRESOLVED_SHORT_TEXT' | 'FOUR_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT';

/** The cap-4 membership is provably invariant under every short-text treatment. */
export interface A3SetRDocumentCapExact {
  readonly status: typeof SET_R_DOCUMENT_CAP_EXACT;
  readonly reason: A3SetRDocumentCapExactReason;
  /**
   * A prefix of R12's `measurableSurvivorAwareFullRank`: the same frozen
   * objects, no new identity. Not a gold or item manifest.
   */
  readonly documents: readonly A3SetRMeasurableSurvivorRankedDocument[];
}

/**
 * The cap-4 membership differs across admissible short-text treatments, so
 * the owner policy forbids materialising it. There is deliberately NO document
 * list here, under any name.
 */
export interface A3SetRDocumentCapBlocked {
  readonly status: typeof SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP;
  readonly openIssue: typeof SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED;
  readonly measurableSurvivorCount: number;
  readonly shortTextUnresolvedCount: number;
  readonly earliestUnresolvedShortTextSourceRankPosition: number;
  /**
   * `sourceRankPosition` of the measurable survivor at survivor position
   * SET_R_MAX_PAGES_PER_ORGANISATION - 1 (survivor #4), or null when fewer
   * survivors exist.
   */
  readonly capBoundaryMeasurableSurvivorSourceRankPosition: number | null;
}

export type A3SetRDocumentCap = A3SetRDocumentCapExact | A3SetRDocumentCapBlocked;

/** Internal consistency of an R12 preparation, checked before any conclusion. */
function requireSetRPreparation(preparation: A3SetRSd7Preparation): void {
  if (preparation.kind !== A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS) {
    throw new A3SetRSd7ReadinessRefusal(
      'PREPARATION_KIND_INVALID',
      'the input is not an R12 SET_R SD7 preparation.',
    );
  }
  if (
    preparation.sd7Preparation.survivorProcedure !==
      SET_R_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE ||
    K3_PROCEDURE_IS_THE_PROVED_ONE !== SET_R_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE
  ) {
    throw new A3SetRSd7ReadinessRefusal(
      'K3_PROCEDURE_NOT_PROVED',
      'the survivor procedure is not the one the exact-cap rule is proved for.',
    );
  }

  const rankLength = preparation.preSd7FullRank.length;
  const survivors = preparation.measurableSurvivorAwareFullRank;
  const unresolved = preparation.sd7Preparation.shortTextUnresolvedInSampleOrder;
  assertStrictlyAscendingWithin(
    survivors.map((s) => s.sourceRankPosition),
    rankLength,
    'measurable survivor',
  );
  assertStrictlyAscendingWithin(
    unresolved.map((u) => u.sourceRankPosition),
    rankLength,
    'unresolved short-text entry',
  );

  const survivorPositions = new Set(survivors.map((s) => s.sourceRankPosition));
  const consistent =
    survivors.length === preparation.sd7Preparation.measurableSurvivors.length &&
    survivors.every((s, position) => s.sample === 'SET_R' && s.survivorRankPosition === position) &&
    unresolved.every((u) => u.sample === 'SET_R' && !survivorPositions.has(u.sourceRankPosition));
  if (!consistent) {
    throw new A3SetRSd7ReadinessRefusal(
      'PREPARATION_INCONSISTENT',
      'the survivor and unresolved short-text positions do not describe one SET_R rank.',
    );
  }
}

function assertStrictlyAscendingWithin(
  positions: readonly number[],
  rankLength: number,
  what: string,
): void {
  let previous = -1;
  positions.forEach((position, ordinal) => {
    if (!isNonNegativeSafeInteger(position) || position <= previous || position >= rankLength) {
      throw new A3SetRSd7ReadinessRefusal(
        'PREPARATION_ORDER_INVALID',
        `${what} ${ordinal} is not in strictly ascending source rank order within the rank.`,
      );
    }
    previous = position;
  });
}

/**
 * The SET_R cap-4 document membership of one R12 preparation: EXACT in the two
 * proved cases, BLOCKED otherwise.
 */
export function determineSetRDocumentCap(preparation: A3SetRSd7Preparation): A3SetRDocumentCap {
  requireSetRPreparation(preparation);
  const survivors = preparation.measurableSurvivorAwareFullRank;
  const unresolved = preparation.sd7Preparation.shortTextUnresolvedInSampleOrder;
  const boundary = survivors[SET_R_MAX_PAGES_PER_ORGANISATION - 1];

  if (unresolved.length === 0) {
    return exact('NO_UNRESOLVED_SHORT_TEXT', survivors);
  }

  // Ascending order was asserted, so entry 0 is the earliest.
  const earliestUnresolved = unresolved[0]!.sourceRankPosition;
  if (boundary !== undefined && boundary.sourceRankPosition < earliestUnresolved) {
    return exact('FOUR_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT', survivors);
  }

  return Object.freeze({
    status: SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
    openIssue: SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
    measurableSurvivorCount: survivors.length,
    shortTextUnresolvedCount: unresolved.length,
    earliestUnresolvedShortTextSourceRankPosition: earliestUnresolved,
    capBoundaryMeasurableSurvivorSourceRankPosition: boundary?.sourceRankPosition ?? null,
  });
}

function exact(
  reason: A3SetRDocumentCapExactReason,
  survivors: readonly A3SetRMeasurableSurvivorRankedDocument[],
): A3SetRDocumentCapExact {
  return Object.freeze({
    status: SET_R_DOCUMENT_CAP_EXACT,
    reason,
    documents: Object.freeze(survivors.slice(0, SET_R_MAX_PAGES_PER_ORGANISATION)),
  });
}

// ---------------------------------------------------------------------------
// B. SANITISED PER-SLOT SET_R FREEZE READINESS.
// ---------------------------------------------------------------------------

export const SET_R_INITIAL_CAP_EXACT = 'SET_R_INITIAL_CAP_EXACT';
export const SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP =
  'SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP';
export type A3SetRInitialCapReadiness =
  typeof SET_R_INITIAL_CAP_EXACT | typeof SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP;

export const SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT = 'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT';
export const SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT =
  'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT';
export type A3SetRFullRankReadiness =
  | typeof SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT
  | typeof SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT;

export const A3_SET_R_FREEZE_SLOT_READINESS_SANITISED = 'A3_SET_R_FREEZE_SLOT_READINESS_SANITISED';

/**
 * INTERNAL PREFLIGHT INPUT. One slot's SET_R freeze readiness, reduced to
 * mechanical facts: no document SHA-256, salted digest, score, page id, URL,
 * text, organisation identity or graph edge - the type has nowhere to put
 * one. `selectionIndex` is carried only so the aggregate preflight can join
 * SET_R to SET_P structurally; the aggregate result never surfaces it.
 */
export interface A3SetRFreezeSlotReadiness {
  readonly kind: typeof A3_SET_R_FREEZE_SLOT_READINESS_SANITISED;
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  /** `determineSetRDocumentCap(...).status`, restated. */
  readonly initialCapReadiness: A3SetRInitialCapReadiness;
  /** EXACT iff no unresolved short text exists anywhere in the sample's rank. */
  readonly fullRankReadiness: A3SetRFullRankReadiness;
  readonly measurableSurvivorCount: number;
  readonly shortTextUnresolvedCount: number;
  /**
   * The EARLIEST unresolved short-text source rank position - the extension
   * boundary. Null exactly when `shortTextUnresolvedCount === 0`.
   */
  readonly firstBlockedSourceRankPosition: number | null;
  /**
   * Measurable survivors whose source rank position is strictly less than
   * `firstBlockedSourceRankPosition`; every measurable survivor when there is
   * no unresolved short text. Their complete-sample positions are invariant.
   */
  readonly exactMeasurableSurvivorPrefixCount: number;
}

export interface A3SetRFreezeSlotReadinessInput {
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly preparation: A3SetRSd7Preparation;
}

/**
 * Reduce one R12 preparation to its sanitised SET_R freeze readiness. The
 * slot's identity is supplied alongside, because an empty rank carries none,
 * and is checked against every rank entry the preparation does carry.
 */
export function deriveSetRFreezeSlotReadiness(
  input: A3SetRFreezeSlotReadinessInput,
): A3SetRFreezeSlotReadiness {
  const { selectionIndex, split, preparation } = input;
  if (!isNonNegativeSafeInteger(selectionIndex) || !isCanonicalSplit(split)) {
    throw new A3SetRSd7ReadinessRefusal(
      'SLOT_IDENTITY_INVALID',
      'the slot needs a non-negative safe-integer selection index and a canonical split.',
    );
  }
  if (preparation.kind !== A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS) {
    throw new A3SetRSd7ReadinessRefusal(
      'PREPARATION_KIND_INVALID',
      'the input is not an R12 SET_R SD7 preparation.',
    );
  }
  preparation.preSd7FullRank.forEach((entry, position) => {
    if (entry.selectionIndex !== selectionIndex || entry.split !== split) {
      throw new A3SetRSd7ReadinessRefusal(
        'PREPARATION_SLOT_MISMATCH',
        `rank entry ${position} belongs to a different slot or split.`,
      );
    }
  });

  const cap = determineSetRDocumentCap(preparation);
  const survivors = preparation.measurableSurvivorAwareFullRank;
  const unresolved = preparation.sd7Preparation.shortTextUnresolvedInSampleOrder;
  const firstBlocked = unresolved.length === 0 ? null : unresolved[0]!.sourceRankPosition;
  const exactPrefix =
    firstBlocked === null
      ? survivors.length
      : survivors.filter((s) => s.sourceRankPosition < firstBlocked).length;

  return Object.freeze({
    kind: A3_SET_R_FREEZE_SLOT_READINESS_SANITISED,
    selectionIndex,
    split,
    initialCapReadiness:
      cap.status === SET_R_DOCUMENT_CAP_EXACT
        ? SET_R_INITIAL_CAP_EXACT
        : SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
    fullRankReadiness:
      unresolved.length === 0
        ? SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT
        : SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    measurableSurvivorCount: survivors.length,
    shortTextUnresolvedCount: unresolved.length,
    firstBlockedSourceRankPosition: firstBlocked,
    exactMeasurableSurvivorPrefixCount: exactPrefix,
  });
}

// ---------------------------------------------------------------------------
// Structural validation of ONE sanitised SET_R summary. Returns a code or
// null; never echoes a field value. The aggregate preflight reuses it.
// ---------------------------------------------------------------------------

export type A3SetRFreezeSlotReadinessStructuralCode =
  | 'ENTRY_NOT_A_READINESS_SUMMARY'
  | 'SELECTION_INDEX_INVALID'
  | 'SPLIT_NOT_CANONICAL'
  | 'READINESS_TOKEN_NOT_CANONICAL'
  | 'COUNT_INVALID'
  | 'READINESS_INCONSISTENT';

export function structuralIssueOfSetRFreezeSlotReadiness(
  entry: unknown,
): A3SetRFreezeSlotReadinessStructuralCode | null {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return 'ENTRY_NOT_A_READINESS_SUMMARY';
  }
  const r = entry as Record<string, unknown>;
  if (r.kind !== A3_SET_R_FREEZE_SLOT_READINESS_SANITISED) return 'ENTRY_NOT_A_READINESS_SUMMARY';
  if (!isNonNegativeSafeInteger(r.selectionIndex)) return 'SELECTION_INDEX_INVALID';
  if (!isCanonicalSplit(r.split)) return 'SPLIT_NOT_CANONICAL';
  if (
    (r.initialCapReadiness !== SET_R_INITIAL_CAP_EXACT &&
      r.initialCapReadiness !== SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP) ||
    (r.fullRankReadiness !== SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT &&
      r.fullRankReadiness !== SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT)
  ) {
    return 'READINESS_TOKEN_NOT_CANONICAL';
  }
  const measurable = r.measurableSurvivorCount;
  const short = r.shortTextUnresolvedCount;
  const prefix = r.exactMeasurableSurvivorPrefixCount;
  const firstBlocked = r.firstBlockedSourceRankPosition;
  if (
    !isNonNegativeSafeInteger(measurable) ||
    !isNonNegativeSafeInteger(short) ||
    !isNonNegativeSafeInteger(prefix) ||
    (firstBlocked !== null && !isNonNegativeSafeInteger(firstBlocked))
  ) {
    return 'COUNT_INVALID';
  }
  const capExact = r.initialCapReadiness === SET_R_INITIAL_CAP_EXACT;
  const consistent =
    r.fullRankReadiness === SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT
      ? // Case A: no unresolved short text, whole rank known, cap exact.
        short === 0 && firstBlocked === null && prefix === measurable && capExact
      : short > 0 &&
        firstBlocked !== null &&
        prefix <= measurable &&
        // `prefix` survivors hold distinct source positions below the boundary.
        prefix <= firstBlocked &&
        // With unresolved short text the cap is exact iff survivor #4 is in the prefix.
        capExact === prefix >= SET_R_MAX_PAGES_PER_ORGANISATION;
  return consistent ? null : 'READINESS_INCONSISTENT';
}

// ---------------------------------------------------------------------------
// C. THE SET_R EXTENSION BOUNDARY. A READINESS CHECK ONLY: no extension is
// selected, no cursor is moved and no label is involved.
// ---------------------------------------------------------------------------

export const SET_R_EXTENSION_POSITION_EXACT = 'SET_R_EXTENSION_POSITION_EXACT';
export const SET_R_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED =
  'SET_R_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED';
/** The complete rank is exact and holds no entry at this position: exactly nothing is there. */
export const SET_R_EXTENSION_RANK_EXHAUSTED_EXACT = 'SET_R_EXTENSION_RANK_EXHAUSTED_EXACT';

export type A3SetRExtensionPositionReadiness =
  | typeof SET_R_EXTENSION_POSITION_EXACT
  | typeof SET_R_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED
  | typeof SET_R_EXTENSION_RANK_EXHAUSTED_EXACT;

/**
 * Is complete-sample SET_R position `survivorAwarePosition` (0-based) exactly
 * known under every admissible short-text treatment? Inside the invariant
 * prefix it is measurable survivor `survivorAwarePosition`; at or beyond it,
 * with any unresolved short text, it is not.
 */
export function checkSetRExtensionCursorAgainstShortTextBoundary(
  readiness: A3SetRFreezeSlotReadiness,
  survivorAwarePosition: number,
): A3SetRExtensionPositionReadiness {
  if (structuralIssueOfSetRFreezeSlotReadiness(readiness) !== null) {
    throw new A3SetRSd7ReadinessRefusal(
      'READINESS_INVALID',
      'the SET_R slot readiness summary is structurally invalid.',
    );
  }
  if (!isNonNegativeSafeInteger(survivorAwarePosition)) {
    throw new A3SetRSd7ReadinessRefusal(
      'EXTENSION_CURSOR_INVALID',
      'the extension cursor must be a non-negative safe integer.',
    );
  }
  if (survivorAwarePosition < readiness.exactMeasurableSurvivorPrefixCount) {
    return SET_R_EXTENSION_POSITION_EXACT;
  }
  return readiness.fullRankReadiness === SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT
    ? SET_R_EXTENSION_RANK_EXHAUSTED_EXACT
    : SET_R_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED;
}

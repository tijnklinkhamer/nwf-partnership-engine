/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R8: THE FROZEN SET_P TOTAL RANK
 * BOUND TO THE CANONICAL GREEDY SD7 SURVIVOR PREPARATION, AND A FAIL-CLOSED
 * DOCUMENT-CAP DETERMINATION.
 *
 * A THIN COMPOSITION, IN EXACTLY THIS ORDER:
 *
 *   1. `rankSetPFull(pool)`                            - R2, the frozen SET_P order;
 *   2. `prepareSd7SampleSurvivors({ sample: 'SET_P',  - R7, the K3 greedy walk
 *        graph, order: preSd7FullRank })`                driven by THAT order;
 *   3. JOIN each measurable survivor back to its R2 entry by its known
 *      `sourceRankPosition`, copying the frozen salted digest - never
 *      re-hashing, re-sorting or searching;
 *   4. decide whether the SD3 cap-8 document membership is mechanically exact
 *      while `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP` is still open.
 *
 * The cap is applied only AFTER survivor preparation. SD7 survivor selection
 * is driven by SET_P's own frozen rank, never by graph order.
 *
 * WHY THIS IS NOT `selectSetPOrganisationCap(rankSetPFull(pool))`
 *
 *   R2's `selectSetPOrganisationCap` is a prefix of the PRE-SURVIVOR rank. After
 *   the walk some measurable documents are excluded, survivor positions differ
 *   from source positions, and short-text documents are undecided. A prefix of
 *   the pre-survivor rank is therefore not the post-SD7 sample, and this module
 *   neither calls it nor feeds it survivors. R2's function is unchanged.
 *
 * THE CAP IS EXACT IN EXACTLY TWO CASES, AND BLOCKED IN EVERY OTHER
 *
 *   A. No unresolved short text: the measurable survivor set IS the post-SD7
 *      set, and the cap is its first SET_P_MAX_PAGES_PER_ORGANISATION entries
 *      (all of them when fewer).
 *   B. At least SET_P_MAX_PAGES_PER_ORGANISATION measurable survivors exist and
 *      the last capped one's `sourceRankPosition` is strictly less than EVERY
 *      unresolved short-text `sourceRankPosition`. Under the owner's GREEDY
 *      walk a document's fate depends only on documents ranked BEFORE it, and a
 *      later document can never remove an earlier kept one; so no treatment of
 *      a later short-text document can change or displace those first capped
 *      survivors. This argument holds for GREEDY only, which is why the
 *      procedure is checked at both compile time and run time below.
 *
 *   Otherwise the result is BLOCKED and carries no document list at all: no
 *   best guess, no measurable-only prefix, no keep/drop choice for short text.
 *   The blocked status carries counts and source positions only.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 *   - It decides nothing about a short-text document: not uniqueness, not an
 *     edge, not survival, not membership. Case B relies on rank chronology and
 *     greediness alone.
 *   - It evaluates no SD9, builds no SET_R and answers none of K1, K2 or K4. It
 *     works at DOCUMENT identity: no page-evidence row, URL or representative.
 *   - It produces no final SET_P, corpus, manifest or gold sample.
 *
 * No refusal message carries a document SHA-256: a failure names a POSITION.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read, no hashing of its own. It mutates no input.
 */
import {
  K3_SD7_SURVIVOR_PROCEDURE,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  type Split,
} from './contracts.js';
import {
  prepareSd7SampleSurvivors,
  SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
  type A3Sd7SampleSurvivorInput,
  type A3Sd7SampleSurvivorPreparation,
} from './sd7.js';
import { rankSetPFull, type A3SetPRankedDocument } from './setP.js';
import type { A3DistinctDocument, A3DocumentSha256, A3SelectionIndex } from './types.js';

// ---------------------------------------------------------------------------
// The K3 procedure the exact-tail rule (case B) is proved for.
// ---------------------------------------------------------------------------

/**
 * Case B is sound for this procedure only. The annotated assignment below is a
 * compile-time tripwire: if the K3 contract ever names another procedure, this
 * file stops type-checking until the proof is consciously reviewed.
 */
export const SET_P_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE = 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK';
const K3_PROCEDURE_IS_THE_PROVED_ONE: typeof SET_P_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE =
  K3_SD7_SURVIVOR_PROCEDURE;

// ---------------------------------------------------------------------------
// Input.
// ---------------------------------------------------------------------------

/**
 * ONE selection slot's exact-distinct document population and the ONE
 * canonical R6 graph of that organisation. No text, score, label or model
 * output: the types have nowhere to put one.
 */
export interface A3SetPSd7PreparationInput {
  readonly pool: readonly A3DistinctDocument[];
  readonly graph: A3Sd7SampleSurvivorInput['graph'];
}

// ---------------------------------------------------------------------------
// Output.
// ---------------------------------------------------------------------------

/**
 * A measurable SET_P survivor at both of its positions, carrying the salted
 * digest COPIED from its R2 entry. Deliberately no bare `rankPosition`.
 */
export interface A3SetPMeasurableSurvivorRankedDocument {
  readonly sample: 'SET_P';
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly documentSha256: A3DocumentSha256;
  /** Copied from `preSd7FullRank[sourceRankPosition]`, never recomputed. */
  readonly saltedRankSha256: string;
  /** Position in the complete pre-survivor SET_P rank. */
  readonly sourceRankPosition: number;
  /** Contiguous 0-based position among the measurable survivors. */
  readonly survivorRankPosition: number;
}

export const SET_P_DOCUMENT_CAP_EXACT = 'SET_P_DOCUMENT_CAP_EXACT';
export const SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP =
  'SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP';

export type A3SetPDocumentCapExactReason =
  'NO_UNRESOLVED_SHORT_TEXT' | 'EIGHT_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT';

/** The cap membership is provably invariant under every short-text treatment. */
export interface A3SetPDocumentCapExact {
  readonly status: typeof SET_P_DOCUMENT_CAP_EXACT;
  readonly reason: A3SetPDocumentCapExactReason;
  /** A prefix of `measurableSurvivorAwareFullRank`. Not a gold or item manifest. */
  readonly documents: readonly A3SetPMeasurableSurvivorRankedDocument[];
}

/**
 * The cap membership depends on the open short-text decision. There is
 * deliberately NO document list here, under any name.
 */
export interface A3SetPDocumentCapBlocked {
  readonly status: typeof SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP;
  readonly openIssue: typeof SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED;
  readonly measurableSurvivorCount: number;
  readonly shortTextUnresolvedCount: number;
  readonly earliestUnresolvedShortTextSourceRankPosition: number;
  /**
   * `sourceRankPosition` of the measurable survivor at survivor position
   * SET_P_MAX_PAGES_PER_ORGANISATION - 1, or null when fewer survivors exist.
   */
  readonly capBoundaryMeasurableSurvivorSourceRankPosition: number | null;
}

export type A3SetPDocumentCap = A3SetPDocumentCapExact | A3SetPDocumentCapBlocked;

/** Pre-label A3 preparation for one slot. NOT a final SET_P sample or corpus. */
export interface A3SetPSd7Preparation {
  readonly kind: 'A3_SET_P_SD7_PREPARATION_NOT_REAL_CORPUS';
  /** R2's complete pre-survivor rank, as returned. */
  readonly preSd7FullRank: readonly A3SetPRankedDocument[];
  /** R7's preparation, as returned. */
  readonly sd7Preparation: A3Sd7SampleSurvivorPreparation;
  /** EVERY measurable survivor, not only the capped ones. */
  readonly measurableSurvivorAwareFullRank: readonly A3SetPMeasurableSurvivorRankedDocument[];
  readonly documentCap: A3SetPDocumentCap;
}

// ---------------------------------------------------------------------------
// Refusals: composition invariants only. R2 and R7 refusals pass through.
// ---------------------------------------------------------------------------

export type A3SetPSd7CompositionRefusalCode =
  | 'K3_PROCEDURE_NOT_PROVED'
  | 'SURVIVOR_SAMPLE_MISMATCH'
  | 'SURVIVOR_POSITION_NOT_CONTIGUOUS'
  | 'SOURCE_POSITION_OUT_OF_RANGE'
  | 'SOURCE_IDENTITY_MISMATCH'
  | 'SHORT_TEXT_ORDER_MISMATCH';

/** A fail-closed refusal. The message starts with `STOP:` and names no identity. */
export class A3SetPSd7CompositionRefusal extends Error {
  readonly code: A3SetPSd7CompositionRefusalCode;
  constructor(code: A3SetPSd7CompositionRefusalCode, message: string) {
    super(`STOP: ${code}: ${message}`);
    this.name = 'A3SetPSd7CompositionRefusal';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// The composition.
// ---------------------------------------------------------------------------

/**
 * Rank one slot's pool for SET_P, walk it greedily over the organisation's
 * canonical graph, join the survivors back to the rank, and determine the
 * document cap - exact or blocked.
 */
export function prepareSetPSd7(input: A3SetPSd7PreparationInput): A3SetPSd7Preparation {
  const preSd7FullRank = rankSetPFull(input.pool);
  const sd7Preparation = prepareSd7SampleSurvivors({
    sample: 'SET_P',
    graph: input.graph,
    order: preSd7FullRank,
  });

  if (
    sd7Preparation.survivorProcedure !== SET_P_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE ||
    K3_PROCEDURE_IS_THE_PROVED_ONE !== SET_P_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE
  ) {
    throw new A3SetPSd7CompositionRefusal(
      'K3_PROCEDURE_NOT_PROVED',
      'the survivor procedure is not the one the exact-cap rule is proved for.',
    );
  }

  const measurableSurvivorAwareFullRank = joinSurvivorsToRank(preSd7FullRank, sd7Preparation);
  assertShortTextPositionsMatchRank(preSd7FullRank, sd7Preparation);

  return Object.freeze({
    kind: 'A3_SET_P_SD7_PREPARATION_NOT_REAL_CORPUS' as const,
    preSd7FullRank,
    sd7Preparation,
    measurableSurvivorAwareFullRank,
    documentCap: determineDocumentCap(measurableSurvivorAwareFullRank, sd7Preparation),
  });
}

/** Each survivor, located by its known source position; the digest is copied. */
function joinSurvivorsToRank(
  preSd7FullRank: readonly A3SetPRankedDocument[],
  sd7Preparation: A3Sd7SampleSurvivorPreparation,
): readonly A3SetPMeasurableSurvivorRankedDocument[] {
  return Object.freeze(
    sd7Preparation.measurableSurvivors.map((survivor, position) => {
      if (survivor.sample !== 'SET_P') {
        throw new A3SetPSd7CompositionRefusal(
          'SURVIVOR_SAMPLE_MISMATCH',
          `survivor ${position} is not a SET_P survivor.`,
        );
      }
      if (survivor.survivorRankPosition !== position) {
        throw new A3SetPSd7CompositionRefusal(
          'SURVIVOR_POSITION_NOT_CONTIGUOUS',
          `survivor ${position} does not carry survivorRankPosition ${position}.`,
        );
      }
      const ranked = rankEntryAt(
        preSd7FullRank,
        survivor.sourceRankPosition,
        `survivor ${position}`,
      );
      assertSameIdentity(ranked, survivor, `survivor ${position}`);
      return Object.freeze({
        sample: 'SET_P' as const,
        selectionIndex: ranked.selectionIndex,
        split: ranked.split,
        documentSha256: ranked.documentSha256,
        saltedRankSha256: ranked.saltedRankSha256,
        sourceRankPosition: survivor.sourceRankPosition,
        survivorRankPosition: survivor.survivorRankPosition,
      });
    }),
  );
}

/** Unresolved short-text positions name real rank entries, in strictly ascending order. */
function assertShortTextPositionsMatchRank(
  preSd7FullRank: readonly A3SetPRankedDocument[],
  sd7Preparation: A3Sd7SampleSurvivorPreparation,
): void {
  let previous = -1;
  sd7Preparation.shortTextUnresolvedInSampleOrder.forEach((unresolved, ordinal) => {
    if (unresolved.sample !== 'SET_P' || unresolved.sourceRankPosition <= previous) {
      throw new A3SetPSd7CompositionRefusal(
        'SHORT_TEXT_ORDER_MISMATCH',
        `unresolved short-text entry ${ordinal} is not a SET_P entry in ascending rank order.`,
      );
    }
    const ranked = rankEntryAt(
      preSd7FullRank,
      unresolved.sourceRankPosition,
      `unresolved short-text entry ${ordinal}`,
    );
    assertSameIdentity(ranked, unresolved, `unresolved short-text entry ${ordinal}`);
    previous = unresolved.sourceRankPosition;
  });
}

function rankEntryAt(
  preSd7FullRank: readonly A3SetPRankedDocument[],
  sourceRankPosition: number,
  what: string,
): A3SetPRankedDocument {
  const ranked = Number.isSafeInteger(sourceRankPosition)
    ? preSd7FullRank[sourceRankPosition]
    : undefined;
  if (ranked === undefined || ranked.rankPosition !== sourceRankPosition) {
    throw new A3SetPSd7CompositionRefusal(
      'SOURCE_POSITION_OUT_OF_RANGE',
      `${what} names a source position the full SET_P rank does not hold.`,
    );
  }
  return ranked;
}

function assertSameIdentity(
  ranked: A3SetPRankedDocument,
  other: {
    readonly selectionIndex: A3SelectionIndex;
    readonly split: Split;
    readonly documentSha256: A3DocumentSha256;
  },
  what: string,
): void {
  if (
    ranked.sample !== 'SET_P' ||
    ranked.documentSha256 !== other.documentSha256 ||
    ranked.selectionIndex !== other.selectionIndex ||
    ranked.split !== other.split
  ) {
    throw new A3SetPSd7CompositionRefusal(
      'SOURCE_IDENTITY_MISMATCH',
      `${what} does not match the full SET_P rank entry at its source position.`,
    );
  }
}

// ---------------------------------------------------------------------------
// The document-cap determination: case A, case B, or blocked.
// ---------------------------------------------------------------------------

function determineDocumentCap(
  survivors: readonly A3SetPMeasurableSurvivorRankedDocument[],
  sd7Preparation: A3Sd7SampleSurvivorPreparation,
): A3SetPDocumentCap {
  const unresolved = sd7Preparation.shortTextUnresolvedInSampleOrder;
  const boundary = survivors[SET_P_MAX_PAGES_PER_ORGANISATION - 1];

  if (unresolved.length === 0) {
    return exact('NO_UNRESOLVED_SHORT_TEXT', survivors);
  }

  // Ascending order was asserted, so entry 0 is the earliest.
  const earliestUnresolved = unresolved[0]!.sourceRankPosition;
  if (boundary !== undefined && boundary.sourceRankPosition < earliestUnresolved) {
    return exact('EIGHT_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT', survivors);
  }

  return Object.freeze({
    status: SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
    openIssue: SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
    measurableSurvivorCount: survivors.length,
    shortTextUnresolvedCount: unresolved.length,
    earliestUnresolvedShortTextSourceRankPosition: earliestUnresolved,
    capBoundaryMeasurableSurvivorSourceRankPosition: boundary?.sourceRankPosition ?? null,
  });
}

function exact(
  reason: A3SetPDocumentCapExactReason,
  survivors: readonly A3SetPMeasurableSurvivorRankedDocument[],
): A3SetPDocumentCapExact {
  return Object.freeze({
    status: SET_P_DOCUMENT_CAP_EXACT,
    reason,
    documents: Object.freeze(survivors.slice(0, SET_P_MAX_PAGES_PER_ORGANISATION)),
  });
}

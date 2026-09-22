/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R12: THE COMPLETE SET_R TOTAL RANK
 * BOUND TO THE CANONICAL GREEDY SD7 SURVIVOR PREPARATION. NO CAP.
 *
 * A THIN COMPOSITION, IN EXACTLY THIS ORDER:
 *
 *   1. `rankSetRFull(rankInputs)`                      - R11, the frozen SET_R
 *                                                        order over R10 scores;
 *   2. `prepareSd7SampleSurvivors({ sample: 'SET_R',  - R7, the K3 greedy walk
 *        graph, order: preSd7FullRank })`                driven by THAT order;
 *   3. require the K3 procedure this composition assumes;
 *   4. JOIN each measurable survivor back to its R11 entry by its known
 *      `sourceRankPosition`, copying the frozen salted digest - never
 *      re-hashing, re-sorting, searching or reading a score;
 *   5. verify each unresolved short-text position against the R11 rank.
 *
 * R12 adds NO ranking semantic and NO SD7 semantic. R10 owns the score
 * evidence, R11 owns the pre-SD7 order, R7 owns the walk. This module never
 * accepts a caller-supplied rank: it calls R11 itself, so the order R7 walks
 * is always the canonical one.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 *   - It applies NO per-organisation cap. The SET_R cap is 4, but whether a
 *     cap-4 prefix is mechanically exact while short-text membership is
 *     unresolved needs its own review. The SET_P analogue (R8) is exact when
 *     there is no unresolved short text, or when at least cap-size measurable
 *     survivors exist and the cap-boundary survivor precedes every unresolved
 *     short-text position. That LOOKS mechanically transferable to cap 4, but
 *     it is deliberately NOT instantiated here: cap-4 invariance, full-rank
 *     readiness, the extension boundary and the interaction with R9's freeze
 *     preflight are R13's to review and test.
 *   - It decides nothing about a short-text document. R7's
 *     `shortTextUnresolvedInSampleOrder` is returned exactly as R7 emitted it;
 *     no such document enters the survivor-aware rank, and none is excluded.
 *   - It evaluates no SD9, reports no readiness, answers no K4, and produces
 *     no final SET_R, corpus, manifest or gold sample.
 *
 * No refusal message carries a document SHA-256: a failure names a POSITION.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read, no hashing of its own. It mutates no input.
 */
import { K3_SD7_SURVIVOR_PROCEDURE, type Split } from './contracts.js';
import {
  prepareSd7SampleSurvivors,
  type A3Sd7SampleSurvivorInput,
  type A3Sd7SampleSurvivorPreparation,
} from './sd7.js';
import { rankSetRFull, type A3SetRRankedDocument, type A3SetRRankInput } from './setR.js';
import type { A3DocumentSha256, A3SelectionIndex } from './types.js';

// ---------------------------------------------------------------------------
// The K3 procedure this composition is written for.
// ---------------------------------------------------------------------------

/**
 * The composition assumes the GREEDY walk. The annotated assignment below is a
 * compile-time tripwire: if the K3 contract ever names another procedure, this
 * file stops type-checking until the composition is consciously reviewed.
 */
export const SET_R_SD7_COMPOSITION_REQUIRES_PROCEDURE = 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK';
const K3_PROCEDURE_IS_THE_ASSUMED_ONE: typeof SET_R_SD7_COMPOSITION_REQUIRES_PROCEDURE =
  K3_SD7_SURVIVOR_PROCEDURE;

// ---------------------------------------------------------------------------
// Input.
// ---------------------------------------------------------------------------

/**
 * ONE selection slot's R11 rank inputs (each exact document paired with its
 * R10 preparation) and the ONE canonical R6 graph of that organisation.
 */
export interface A3SetRSd7PreparationInput {
  readonly rankInputs: readonly A3SetRRankInput[];
  readonly graph: A3Sd7SampleSurvivorInput['graph'];
}

// ---------------------------------------------------------------------------
// Output.
// ---------------------------------------------------------------------------

/**
 * A measurable SET_R survivor at both of its positions, carrying the salted
 * digest COPIED from its R11 entry. Deliberately no bare `rankPosition`, and
 * no score or score provenance: those stay with R10.
 */
export interface A3SetRMeasurableSurvivorRankedDocument {
  readonly sample: 'SET_R';
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly documentSha256: A3DocumentSha256;
  /** Copied from `preSd7FullRank[sourceRankPosition]`, never recomputed. */
  readonly saltedRankSha256: string;
  /** Position in the complete pre-survivor SET_R rank. */
  readonly sourceRankPosition: number;
  /** Contiguous 0-based position among the measurable survivors. */
  readonly survivorRankPosition: number;
}

export const A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS = 'A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS';

/**
 * Pre-label A3 preparation for one slot. NOT a final SET_R sample or corpus:
 * uncapped, and with every short-text document still unresolved.
 */
export interface A3SetRSd7Preparation {
  readonly kind: typeof A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS;
  /** R11's complete pre-survivor rank, as returned. */
  readonly preSd7FullRank: readonly A3SetRRankedDocument[];
  /** R7's preparation, as returned. */
  readonly sd7Preparation: A3Sd7SampleSurvivorPreparation;
  /** EVERY measurable survivor. Uncapped. */
  readonly measurableSurvivorAwareFullRank: readonly A3SetRMeasurableSurvivorRankedDocument[];
}

// ---------------------------------------------------------------------------
// Refusals: composition invariants only. R11 and R7 refusals pass through.
// ---------------------------------------------------------------------------

export type A3SetRSd7CompositionRefusalCode =
  | 'K3_PROCEDURE_NOT_PROVED'
  | 'SURVIVOR_SAMPLE_MISMATCH'
  | 'SURVIVOR_POSITION_NOT_CONTIGUOUS'
  | 'SOURCE_POSITION_OUT_OF_RANGE'
  | 'SOURCE_IDENTITY_MISMATCH'
  | 'SHORT_TEXT_ORDER_MISMATCH';

/** A fail-closed refusal. The message starts with `STOP:` and names no identity. */
export class A3SetRSd7CompositionRefusal extends Error {
  readonly code: A3SetRSd7CompositionRefusalCode;
  constructor(code: A3SetRSd7CompositionRefusalCode, message: string) {
    super(`STOP: ${code}: ${message}`);
    this.name = 'A3SetRSd7CompositionRefusal';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// The composition.
// ---------------------------------------------------------------------------

/**
 * Rank one slot's SET_R inputs with R11, walk that rank greedily over the
 * organisation's canonical graph with R7, and join the measurable survivors
 * back to the rank. Uncapped; short text stays unresolved.
 */
export function prepareSetRSd7(input: A3SetRSd7PreparationInput): A3SetRSd7Preparation {
  const preSd7FullRank = rankSetRFull(input.rankInputs);
  const sd7Preparation = prepareSd7SampleSurvivors({
    sample: 'SET_R',
    graph: input.graph,
    order: preSd7FullRank,
  });

  if (
    sd7Preparation.survivorProcedure !== SET_R_SD7_COMPOSITION_REQUIRES_PROCEDURE ||
    K3_PROCEDURE_IS_THE_ASSUMED_ONE !== SET_R_SD7_COMPOSITION_REQUIRES_PROCEDURE
  ) {
    throw new A3SetRSd7CompositionRefusal(
      'K3_PROCEDURE_NOT_PROVED',
      'the survivor procedure is not the one this composition is reviewed for.',
    );
  }

  const measurableSurvivorAwareFullRank = joinSurvivorsToRank(preSd7FullRank, sd7Preparation);
  assertShortTextPositionsMatchRank(preSd7FullRank, sd7Preparation);

  return Object.freeze({
    kind: A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS,
    preSd7FullRank,
    sd7Preparation,
    measurableSurvivorAwareFullRank,
  });
}

/** Each survivor, located by its known source position; the digest is copied. */
function joinSurvivorsToRank(
  preSd7FullRank: readonly A3SetRRankedDocument[],
  sd7Preparation: A3Sd7SampleSurvivorPreparation,
): readonly A3SetRMeasurableSurvivorRankedDocument[] {
  return Object.freeze(
    sd7Preparation.measurableSurvivors.map((survivor, position) => {
      if (survivor.sample !== 'SET_R') {
        throw new A3SetRSd7CompositionRefusal(
          'SURVIVOR_SAMPLE_MISMATCH',
          `survivor ${position} is not a SET_R survivor.`,
        );
      }
      if (survivor.survivorRankPosition !== position) {
        throw new A3SetRSd7CompositionRefusal(
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
        sample: 'SET_R' as const,
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
  preSd7FullRank: readonly A3SetRRankedDocument[],
  sd7Preparation: A3Sd7SampleSurvivorPreparation,
): void {
  let previous = -1;
  sd7Preparation.shortTextUnresolvedInSampleOrder.forEach((unresolved, ordinal) => {
    if (unresolved.sample !== 'SET_R' || unresolved.sourceRankPosition <= previous) {
      throw new A3SetRSd7CompositionRefusal(
        'SHORT_TEXT_ORDER_MISMATCH',
        `unresolved short-text entry ${ordinal} is not a SET_R entry in ascending rank order.`,
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
  preSd7FullRank: readonly A3SetRRankedDocument[],
  sourceRankPosition: number,
  what: string,
): A3SetRRankedDocument {
  const ranked = Number.isSafeInteger(sourceRankPosition)
    ? preSd7FullRank[sourceRankPosition]
    : undefined;
  if (ranked === undefined || ranked.rankPosition !== sourceRankPosition) {
    throw new A3SetRSd7CompositionRefusal(
      'SOURCE_POSITION_OUT_OF_RANGE',
      `${what} names a source position the full SET_R rank does not hold.`,
    );
  }
  return ranked;
}

function assertSameIdentity(
  ranked: A3SetRRankedDocument,
  other: {
    readonly selectionIndex: A3SelectionIndex;
    readonly split: Split;
    readonly documentSha256: A3DocumentSha256;
  },
  what: string,
): void {
  if (
    ranked.sample !== 'SET_R' ||
    ranked.documentSha256 !== other.documentSha256 ||
    ranked.selectionIndex !== other.selectionIndex ||
    ranked.split !== other.split
  ) {
    throw new A3SetRSd7CompositionRefusal(
      'SOURCE_IDENTITY_MISMATCH',
      `${what} does not match the full SET_R rank entry at its source position.`,
    );
  }
}

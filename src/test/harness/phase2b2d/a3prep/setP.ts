/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION: SET_P RANKING (R2).
 *
 * SET_P RANKING OVER A CALLER-SUPPLIED ELIGIBLE DISTINCT-DOCUMENT POOL.
 * This is NOT Generation-1 SET_P materialisation.
 *
 * R3 rule SD3: take the first SET_P_MAX_PAGES_PER_ORGANISATION = 8 by salted
 * rank sha256("SET_P_V2_R2:" + documentSha256), lower-case hex, plain
 * lexicographic ascending, with NO class filtering of any kind.
 *
 * WHAT THIS MODULE DOES NOT DO, AND WHY
 *
 *   - It performs no SD7. K3 is resolved to SAMPLE-SPECIFIC GREEDY survivors
 *     (`GREEDY_SAMPLE_RANK_SURVIVOR_WALK`), but this module still only ranks
 *     the caller-supplied PRE-SURVIVOR exact-distinct pool of one slot. R8
 *     will compose this full SET_P rank with R7's `a3prep/sd7.ts` survivor
 *     walk; nothing here walks a graph. This module ranks exactly what it
 *     receives.
 *   - It resolves no exact duplicate. A repeated document identity is refused
 *     (K2 decides representatives, not a ranker).
 *   - It reads no class, gold label, candidate track or candidate score: the
 *     input type has nowhere to put one.
 *   - It does not decide SD9, organisation replacement or SD4's gate-share cap.
 *
 * FULL RANK FIRST, CAP SECOND. `rankSetPFull` returns EVERY input document in
 * its frozen order, because Plan section 9 requires the whole rank to survive
 * for later deterministic extension and provenance. `selectSetPOrganisationCap`
 * is a view of that rank: a prefix, never a re-rank.
 *
 * THIS MODULE IS PURE. It performs no IO and reads no clock, randomness or
 * environment.
 */
import { SET_P_MAX_PAGES_PER_ORGANISATION, SET_P_RANK_KEY_PREFIX } from './contracts.js';
import {
  A3RankStop,
  assertLowerHexDocumentSha256s,
  assertSingleSlotAndSplit,
  assertUniqueDocumentSha256s,
  assertUniqueRankDigests,
  comparePlainLexicographic,
  prefixedDocumentRankHash,
} from './rank.js';
import type { A3DistinctDocument, A3RankedDocument } from './types.js';

/** A SET_P-ranked document: R1's ranked shape, pinned to the SET_P sample. */
export type A3SetPRankedDocument = A3RankedDocument & { readonly sample: 'SET_P' };

/**
 * The complete, deterministic SET_P order of one selection slot's
 * caller-supplied pool. Every input document appears exactly once, at a
 * 0-based `rankPosition`.
 *
 * Fails closed on a malformed document identity, a repeated identity, a pool
 * spanning more than one slot or split, or a salted-digest collision. Input
 * order has no effect on the output. Empty input returns an empty rank.
 *
 * The output carries identity and position only - never the source
 * page-evidence ids, text, URL, title, host or institution identity.
 */
export function rankSetPFull(pool: readonly A3DistinctDocument[]): readonly A3SetPRankedDocument[] {
  assertSingleSlotAndSplit(pool);
  assertLowerHexDocumentSha256s(pool);
  assertUniqueDocumentSha256s(pool);

  const keyed = pool.map((document) => ({
    selectionIndex: document.selectionIndex,
    split: document.split,
    documentSha256: document.documentSha256,
    saltedRankSha256: prefixedDocumentRankHash(SET_P_RANK_KEY_PREFIX, document.documentSha256),
  }));
  assertUniqueRankDigests(keyed);

  keyed.sort((a, b) => comparePlainLexicographic(a.saltedRankSha256, b.saltedRankSha256));

  return Object.freeze(
    keyed.map((entry, rankPosition) =>
      Object.freeze({ sample: 'SET_P' as const, ...entry, rankPosition }),
    ),
  );
}

/**
 * The SD3 per-organisation cap as a VIEW of a full SET_P rank: its first
 * SET_P_MAX_PAGES_PER_ORGANISATION (8) entries, or all of them when fewer.
 *
 * It never re-ranks, class-filters or inspects a score, and it refuses input
 * whose entries are not `SET_P` at positions exactly 0..n-1 in order, so it
 * cannot be handed an unranked, reordered or mid-cut list.
 *
 * THIS IS THE ORIGINAL R2 RANK-PREFIX PRIMITIVE, OVER THE PRE-SD7 RANK. It is
 * NOT the post-SD7 SET_P selection: after K3's greedy survivor walk some
 * documents are excluded and short-text membership is still open. The
 * canonical post-K3, post-SD7 document cap is R8's `prepareSetPSd7`
 * (`setPSd7.ts`), which may instead report the cap as BLOCKED.
 */
export function selectSetPOrganisationCap(
  fullRank: readonly A3SetPRankedDocument[],
): readonly A3SetPRankedDocument[] {
  fullRank.forEach((entry, position) => {
    if (entry.sample !== 'SET_P' || entry.rankPosition !== position) {
      throw new A3RankStop(
        `STOP: input position ${position} is not position ${position} of a full SET_P rank.`,
      );
    }
  });
  return Object.freeze(fullRank.slice(0, SET_P_MAX_PAGES_PER_ORGANISATION));
}

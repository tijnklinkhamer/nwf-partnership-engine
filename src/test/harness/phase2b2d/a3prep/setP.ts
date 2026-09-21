import {
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_P_RANK_SALT,
} from './contracts.js';
import {
  assertSingleOrganisationAndSplit,
  assertUniqueDocumentHashes,
  assertUniqueRankHashes,
  plainLexicographicCompare,
  saltedDocumentRankHash,
} from './rank.js';
import type { A3DistinctDocument } from './types.js';

export interface RankedSetPDocument extends A3DistinctDocument {
  readonly setPRankHash: string;
  readonly setPRankPosition: number;
}

export function rankSetP(
  documents: readonly A3DistinctDocument[],
): readonly RankedSetPDocument[] {
  assertSingleOrganisationAndSplit(documents);
  assertUniqueDocumentHashes(documents);

  const hashed = documents.map((document) => ({
    ...document,
    setPRankHash: saltedDocumentRankHash(SET_P_RANK_SALT, document.documentSha256),
  }));
  assertUniqueRankHashes(
    hashed.map((document) => ({
      documentSha256: document.documentSha256,
      rankHash: document.setPRankHash,
    })),
  );

  return hashed
    .sort((a, b) => plainLexicographicCompare(a.setPRankHash, b.setPRankHash))
    .map((document, setPRankPosition) => ({ ...document, setPRankPosition }));
}

/**
 * SAFE ONLY after the caller supplies an owner-authorised SD7 survivor pool.
 * No class/gold/model/candidate field exists in the input type.
 */
export function selectSetP(
  postSd7Documents: readonly A3DistinctDocument[],
): readonly RankedSetPDocument[] {
  return rankSetP(postSd7Documents).slice(0, SET_P_MAX_PAGES_PER_ORGANISATION);
}

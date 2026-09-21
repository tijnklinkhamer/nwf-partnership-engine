import {
  SET_R_MAX_PAGES_PER_ORGANISATION,
  SET_R_RANK_SALT,
} from './contracts.js';
import { assertUniqueDocumentHashes, plainHexCompare, saltedDocumentRankHash } from './rank.js';
import type { A3ResolvedSetRDocument } from './types.js';

export interface RankedSetRDocument extends A3ResolvedSetRDocument {
  readonly setRTieBreakHash: string;
  readonly setRRankPosition: number;
}

export function rankSetR(
  documents: readonly A3ResolvedSetRDocument[],
): readonly RankedSetRDocument[] {
  assertUniqueDocumentHashes(documents);
  return documents
    .map((document) => ({
      ...document,
      setRTieBreakHash: saltedDocumentRankHash(SET_R_RANK_SALT, document.documentSha256),
    }))
    .sort((a, b) => {
      if (a.candidateIndependentScore !== b.candidateIndependentScore) {
        return b.candidateIndependentScore - a.candidateIndependentScore;
      }
      return plainHexCompare(a.setRTieBreakHash, b.setRTieBreakHash);
    })
    .map((document, setRRankPosition) => ({ ...document, setRRankPosition }));
}

/**
 * The input already contains ONE approved candidate-independent score per
 * document. This function intentionally does not derive that score from Track
 * A/B candidate rows because the frozen artifacts do not define that reduction.
 */
export function selectSetR(
  postSd7ResolvedDocuments: readonly A3ResolvedSetRDocument[],
): readonly RankedSetRDocument[] {
  return rankSetR(postSd7ResolvedDocuments).slice(0, SET_R_MAX_PAGES_PER_ORGANISATION);
}

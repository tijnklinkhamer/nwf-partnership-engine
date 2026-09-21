import {
  SET_R_MAX_PAGES_PER_ORGANISATION,
  SET_R_RANK_SALT,
  A3PrepStop,
} from './contracts.js';
import {
  assertSingleOrganisationAndSplit,
  assertUniqueDocumentHashes,
  assertUniqueRankHashes,
  plainLexicographicCompare,
  saltedDocumentRankHash,
} from './rank.js';
import type { A3ResolvedSetRDocument } from './types.js';

export interface RankedSetRDocument extends A3ResolvedSetRDocument {
  readonly setRTieBreakHash: string;
  readonly setRRankPosition: number;
}

export function rankSetR(
  documents: readonly A3ResolvedSetRDocument[],
): readonly RankedSetRDocument[] {
  assertSingleOrganisationAndSplit(documents);
  assertUniqueDocumentHashes(documents);

  for (const document of documents) {
    if (!Number.isFinite(document.candidateIndependentScore)) {
      throw new A3PrepStop(
        `STOP: non-finite SET_R score for ${document.documentSha256}.`,
      );
    }
  }

  const hashed = documents.map((document) => ({
    ...document,
    setRTieBreakHash: saltedDocumentRankHash(SET_R_RANK_SALT, document.documentSha256),
  }));
  assertUniqueRankHashes(
    hashed.map((document) => ({
      documentSha256: document.documentSha256,
      rankHash: document.setRTieBreakHash,
    })),
  );

  return hashed
    .sort((a, b) => {
      if (a.candidateIndependentScore !== b.candidateIndependentScore) {
        return b.candidateIndependentScore - a.candidateIndependentScore;
      }
      return plainLexicographicCompare(a.setRTieBreakHash, b.setRTieBreakHash);
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

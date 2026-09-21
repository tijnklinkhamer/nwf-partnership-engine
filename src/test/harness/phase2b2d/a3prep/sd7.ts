import {
  exactDuplicatePass,
  nearDuplicatePass,
  type PageForSd7,
} from '../sd7/nearDuplicatePairs.js';
import { A3PrepStop } from './contracts.js';
import { evaluateSd9FromBounds } from './sd9.js';
import type { A3PageEvidenceInput } from './types.js';

export interface A3Sd7Assessment {
  readonly inputPageCount: number;
  readonly exactDistinctDocumentCount: number;
  readonly exactDuplicateRowsRemoved: number;
  readonly shortTextUnresolvedCount: number;
  readonly nearDuplicateEdgeCount: number;
  readonly postSd7CountMin: number;
  readonly postSd7CountMax: number;
  readonly survivorIdentityIsOrderDependent: boolean;
  readonly sd9Status: ReturnType<typeof evaluateSd9FromBounds>;
}

/**
 * Higher-level A3 adapter around the ONE existing SD7 implementation.
 *
 * It MEASURES bounds only. It does not choose a survivor order, because SD9 is
 * defined before SET_P/SET_R materialisation while SD7 names the rank "of the
 * sample being drawn"; the two samples have different ranks.
 *
 * Short-text handling follows the already-recorded owner operational decision:
 * retain the unresolved flag and finalise SD9 only if all admissible treatments
 * lie on the same side of the >=4 boundary.
 */
export function assessSd7ForOrganisation(
  pages: readonly A3PageEvidenceInput[],
): A3Sd7Assessment {
  if (pages.length > 0) {
    const first = pages[0]!;
    for (const page of pages) {
      if (page.organisationKey !== first.organisationKey) {
        throw new A3PrepStop('STOP: mixed organisations reached one SD7 assessment.');
      }
      if (page.split !== first.split) {
        throw new A3PrepStop('STOP: mixed splits reached one SD7 assessment.');
      }
    }
  }

  const pageForSd7: PageForSd7[] = pages.map((page) => ({
    pageId: page.pageEvidenceId,
    documentSha256: page.documentSha256,
    mainText: page.mainText,
  }));
  const exact = exactDuplicatePass(pageForSd7);

  const textByHash = new Map<string, string>();
  for (const page of pages) {
    if (!textByHash.has(page.documentSha256)) {
      textByHash.set(page.documentSha256, page.mainText);
    }
  }

  const near = nearDuplicatePass(exact.groups, (documentSha256) => {
    const text = textByHash.get(documentSha256);
    if (text === undefined) throw new A3PrepStop(`STOP: missing text for ${documentSha256}.`);
    return text;
  });

  const postSd7CountMin = near.measurableSurvivorsMin;
  const postSd7CountMax = near.measurableSurvivorsMax + near.shortTextUnresolvedCount;

  return {
    inputPageCount: pages.length,
    exactDistinctDocumentCount: exact.distinctDocumentCount,
    exactDuplicateRowsRemoved: exact.duplicateRowsRemoved,
    shortTextUnresolvedCount: near.shortTextUnresolvedCount,
    nearDuplicateEdgeCount: near.edgeCount,
    postSd7CountMin,
    postSd7CountMax,
    survivorIdentityIsOrderDependent: near.survivorIdentityIsOrderDependent,
    sd9Status: evaluateSd9FromBounds(postSd7CountMin, postSd7CountMax),
  };
}

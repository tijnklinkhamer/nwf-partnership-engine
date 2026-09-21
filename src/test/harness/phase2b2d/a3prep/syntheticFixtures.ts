import type {
  A3DistinctDocument,
  A3OrganisationInput,
  A3PageEvidenceInput,
  A3ResolvedSetRDocument,
  A3Split,
} from './types.js';

function text(from: number, count = 20): string {
  return Array.from({ length: count }, (_, index) => `invented-${from + index}`).join(' ');
}

export function syntheticPage(
  organisationKey: string,
  split: A3Split,
  pageEvidenceId: string,
  documentSha256: string,
  mainText = text(Number(pageEvidenceId.replace(/\D/gu, '')) || 1),
): A3PageEvidenceInput {
  return {
    organisationKey,
    split,
    pageEvidenceId,
    rootKey: `root-${organisationKey}`,
    documentSha256,
    mainText,
    candidates: [],
  };
}

export function syntheticOrganisation(
  selectionIndex: number,
  split: A3Split,
  pageCount: number,
): A3OrganisationInput {
  const organisationKey = `ORG_${selectionIndex.toString().padStart(3, '0')}`;
  return {
    selectionIndex,
    organisationKey,
    split,
    acquisitionOfRecordState: 'ADJUDICATED',
    reserveTransitionState: 'NOT_REQUIRED',
    pages: Array.from({ length: pageCount }, (_, index) =>
      syntheticPage(
        organisationKey,
        split,
        `p${selectionIndex}_${index}`,
        `sha-${selectionIndex}-${index}`,
        text(selectionIndex * 1000 + index * 50),
      ),
    ),
  };
}

export function distinctDocuments(
  organisationKey: string,
  split: A3Split,
  count: number,
): readonly A3DistinctDocument[] {
  return Array.from({ length: count }, (_, index) => ({
    organisationKey,
    split,
    documentSha256: `synthetic-sha-${index}`,
    pageEvidenceIds: [`synthetic-page-${index}`],
  }));
}

export function resolvedSetRDocuments(
  organisationKey: string,
  split: A3Split,
  scores: readonly number[],
): readonly A3ResolvedSetRDocument[] {
  return scores.map((candidateIndependentScore, index) => ({
    organisationKey,
    split,
    documentSha256: `synthetic-r-sha-${index}`,
    pageEvidenceIds: [`synthetic-r-page-${index}`],
    candidateIndependentScore,
  }));
}

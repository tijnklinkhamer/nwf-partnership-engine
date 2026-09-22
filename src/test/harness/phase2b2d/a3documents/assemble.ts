/**
 * PHASE 2B-2D — A3 R21: THE PURE, UNBOUND DOCUMENT-SOURCE ASSEMBLER.
 *
 * ONE ORGANISATION AT A TIME
 *
 *   The input is one selection slot's rows. Exact grouping runs inside that
 *   slot only - there is no multi-slot entry point and no global digest set -
 *   so the same response bytes held by two organisations stay two documents,
 *   one in each slot, which is what frozen SD7 requires of the population.
 *
 * THE CANONICAL EXACT-DUPLICATE PASS, NOT A SECOND ONE
 *
 *   Grouping by response digest is `exactDuplicatePass` from the canonical
 *   SD7 module, called unchanged. This file adapts rows to `PageForSd7` and
 *   consumes the pass's own groups and aggregates. It does not measure a
 *   near-duplicate graph, tokenise, shingle or compare.
 *
 * THE ORDER OF THE CHECKS IS THE DESIGN
 *
 *   1. Source-row relations: unique page ids; every candidate belongs to a
 *      page of THIS slot and to that page's document.
 *   2. Exact grouping, by the canonical pass.
 *   3. For each group, the EXTRACTION SUPPORT GATE - before any text is
 *      usable. More than one version: refused. One version other than the
 *      supported one: refused. No version is chosen, sorted or compared.
 *   4. For each group, TEXT BY EQUALITY: the set of persisted texts must have
 *      exactly one member, and the canonical pass must agree it did not
 *      diverge. The sole value becomes the document's SD7 text. No row is
 *      its representative: not the first, not the lowest id, not the highest
 *      score, not the latest fetch.
 *   5. For each group, canonical R10 `prepareSetRDocumentScore` over EVERY
 *      source row and both of each row's persisted track observations.
 *
 * NO TEXT TRANSFORMATION
 *
 *   The stored text is kept exactly as persisted: no case folding, no
 *   whitespace folding, no Unicode normalisation, no entity decoding, no
 *   truncation, no concatenation. The later canonical SD7 measurement does
 *   its own frozen normalisation; doing any of it here would do it twice.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read. It mutates no input.
 */
import {
  exactDuplicatePass,
  type DocumentTextLookup,
  type PageForSd7,
} from '../sd7/nearDuplicatePairs.js';
import {
  A3SetRScoreRefusal,
  prepareSetRDocumentScore,
  type A3SetRDocumentScoreInput,
  type A3SetRSourcePageScoreInput,
} from '../a3prep/setRScore.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3PageEvidenceId,
  A3PersistedCandidateTrack,
  A3SelectionIndex,
  A3TrackCandidateObservation,
} from '../a3prep/types.js';
import { R20_EVIDENCE_SPLIT_V1 } from '../a3evidence/types.js';
import { refuse } from './refusal.js';
import {
  R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1,
  type A3DocumentSourceEntry,
  type UnboundA3SlotDocumentSourceAssembly,
  type UnboundSlotCandidateSourceRow,
  type UnboundSlotDocumentSourceInput,
  type UnboundSlotPageSourceRow,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE TEXT STORE.
// ---------------------------------------------------------------------------

/**
 * Text lives HERE, never on a returned object. Keyed by the unbound assembly
 * object itself, so a clone of the assembly has no text at all.
 */
const TEXT_BY_UNBOUND_ASSEMBLY = new WeakMap<object, ReadonlyMap<string, string>>();

function lookupOver(texts: ReadonlyMap<string, string>): DocumentTextLookup {
  return (documentSha256: string): string => {
    const text = texts.get(documentSha256);
    if (text === undefined) {
      refuse(
        'R21_DOCUMENT_TEXT_LOOKUP_UNKNOWN_DOCUMENT',
        'the requested document is not part of this slot assembly',
      );
    }
    return text;
  };
}

/**
 * The text lookup for ONE unbound assembly this module returned. It resolves
 * only that assembly's own documents. Unbound text is caller-supplied, so
 * this is a processing convenience, never authority; R22 must take the
 * MINTED accessor in `devTrain.ts`.
 */
export function documentTextLookupForUnboundSlotAssembly(assembly: unknown): DocumentTextLookup {
  const texts =
    typeof assembly === 'object' && assembly !== null
      ? TEXT_BY_UNBOUND_ASSEMBLY.get(assembly)
      : undefined;
  if (texts === undefined) {
    refuse(
      'R21_NOT_AN_UNBOUND_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
      'the value is not a slot assembly returned by this module',
    );
  }
  return lookupOver(texts);
}

// ---------------------------------------------------------------------------
// B. SHAPE VALIDATION.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function requirePageRow(row: unknown, position: number): UnboundSlotPageSourceRow {
  if (
    !isRecord(row) ||
    !isNonEmptyString(row['pageEvidenceId']) ||
    !isNonEmptyString(row['documentSha256']) ||
    !isNonEmptyString(row['extractionRuleVersion']) ||
    typeof row['mainText'] !== 'string'
  ) {
    refuse('R21_SOURCE_ROW_SHAPE_INVALID', `page-evidence source row at position ${position}`);
  }
  return row as unknown as UnboundSlotPageSourceRow;
}

function requireCandidateRow(row: unknown, position: number): UnboundSlotCandidateSourceRow {
  if (
    !isRecord(row) ||
    !isNonEmptyString(row['pageEvidenceId']) ||
    !isNonEmptyString(row['documentSha256']) ||
    typeof row['track'] !== 'string' ||
    typeof row['candidateScore'] !== 'string' ||
    typeof row['ruleVersion'] !== 'string'
  ) {
    refuse('R21_SOURCE_ROW_SHAPE_INVALID', `candidate source row at position ${position}`);
  }
  return row as unknown as UnboundSlotCandidateSourceRow;
}

function requireSlotInput(input: unknown): UnboundSlotDocumentSourceInput {
  if (
    !isRecord(input) ||
    typeof input['selectionIndex'] !== 'number' ||
    !Number.isInteger(input['selectionIndex']) ||
    input['selectionIndex'] < 0 ||
    !Array.isArray(input['pageEvidence']) ||
    !Array.isArray(input['candidates'])
  ) {
    refuse('R21_SLOT_INPUT_SHAPE_INVALID', 'the slot input does not have the documented shape');
  }
  if (input['split'] !== R20_EVIDENCE_SPLIT_V1) {
    refuse(
      'R21_SPLIT_NOT_SUPPORTED',
      `R21 V1 assembles ${R20_EVIDENCE_SPLIT_V1} only; no other split is read`,
    );
  }
  return input as unknown as UnboundSlotDocumentSourceInput;
}

// ---------------------------------------------------------------------------
// C. THE ASSEMBLER.
// ---------------------------------------------------------------------------

/**
 * Assemble ONE slot's exact documents. Returns an UNBOUND assembly: it
 * carries no authority, whatever rows it was given.
 */
export function assembleUnboundSlotDocumentSources(
  input: UnboundSlotDocumentSourceInput,
): UnboundA3SlotDocumentSourceAssembly {
  const slot = requireSlotInput(input);
  const pages = slot.pageEvidence.map((row, position) => requirePageRow(row, position));
  const candidates = slot.candidates.map((row, position) => requireCandidateRow(row, position));
  if (pages.length === 0) {
    refuse('R21_SLOT_HAS_NO_PAGE_EVIDENCE', 'an authorised slot presented no page evidence');
  }

  // 1. Source-row relations.
  const pageById = new Map<string, UnboundSlotPageSourceRow>();
  pages.forEach((page, position) => {
    if (pageById.has(page.pageEvidenceId)) {
      refuse(
        'R21_DUPLICATE_PAGE_EVIDENCE_SOURCE_ROW',
        `page-evidence source row at position ${position} repeats an earlier row`,
      );
    }
    pageById.set(page.pageEvidenceId, page);
  });

  const observationsByPage = new Map<string, A3TrackCandidateObservation[]>();
  candidates.forEach((candidate, position) => {
    const page = pageById.get(candidate.pageEvidenceId);
    if (page === undefined) {
      refuse(
        'R21_CANDIDATE_OUTSIDE_SLOT_PAGE_EVIDENCE',
        `candidate source row at position ${position} names no page of this slot`,
      );
    }
    if (candidate.documentSha256 !== page.documentSha256) {
      refuse(
        'R21_CANDIDATE_DOCUMENT_SHA_MISMATCH',
        `candidate source row at position ${position} disagrees with its page's document`,
      );
    }
    const observation: A3TrackCandidateObservation = Object.freeze({
      pageEvidenceId: candidate.pageEvidenceId as A3PageEvidenceId,
      // Passed through exactly; canonical R10 refuses any unexpected track.
      track: candidate.track as A3PersistedCandidateTrack,
      // The persisted numeric(8,4) TEXT, never converted.
      candidateScoreDecimal: candidate.candidateScore,
      ruleVersion: candidate.ruleVersion,
    });
    const existing = observationsByPage.get(candidate.pageEvidenceId);
    if (existing === undefined) observationsByPage.set(candidate.pageEvidenceId, [observation]);
    else existing.push(observation);
  });

  // 2. Exact grouping, by the canonical pass, over this slot only.
  const pass = exactDuplicatePass(
    pages.map((page): PageForSd7 => ({
      pageId: page.pageEvidenceId,
      documentSha256: page.documentSha256,
      mainText: page.mainText,
    })),
  );

  const texts = new Map<string, string>();
  const documents: A3DocumentSourceEntry[] = [];
  let candidateObservationCount = 0;

  pass.groups.forEach((group, groupPosition) => {
    const members = group.pageIds.map((pageId) => pageById.get(pageId) as UnboundSlotPageSourceRow);

    // 3. The extraction support gate, BEFORE the text becomes usable.
    const versions = new Set(members.map((member) => member.extractionRuleVersion));
    if (versions.size !== 1) {
      refuse(
        'R21_MULTI_EXTRACTION_VERSION_DOCUMENT_REQUIRES_EXPLICIT_POLICY',
        `exact-document group at position ${groupPosition} carries ${versions.size} extraction rule versions`,
      );
    }
    if (!versions.has(R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1)) {
      refuse(
        'R21_UNSUPPORTED_EXTRACTION_RULE_VERSION',
        `exact-document group at position ${groupPosition} uses an extraction rule version R21 V1 does not support`,
      );
    }

    // 4. Text by equality: cardinality one, and the canonical pass agrees.
    const distinctTexts = new Set(members.map((member) => member.mainText));
    if (distinctTexts.size !== 1 || group.extractedTextDiverged) {
      refuse(
        'R21_EXACT_DOCUMENT_TEXT_DIVERGENCE',
        `exact-document group at position ${groupPosition} holds more than one persisted text`,
      );
    }
    const [soleText] = distinctTexts;
    texts.set(group.documentSha256, soleText as string);

    // 5. Every source row, and all of its persisted score evidence, to R10.
    const document: A3DistinctDocument = Object.freeze({
      selectionIndex: slot.selectionIndex as A3SelectionIndex,
      split: R20_EVIDENCE_SPLIT_V1,
      documentSha256: group.documentSha256 as A3DocumentSha256,
      sourcePageEvidenceIds: Object.freeze(
        group.pageIds.map((pageId) => pageId as A3PageEvidenceId),
      ),
    });
    const sourceRows: A3SetRSourcePageScoreInput[] = members.map((member) => {
      const observations = observationsByPage.get(member.pageEvidenceId) ?? [];
      candidateObservationCount += observations.length;
      return Object.freeze({
        pageEvidenceId: member.pageEvidenceId as A3PageEvidenceId,
        documentSha256: member.documentSha256 as A3DocumentSha256,
        candidateObservations: Object.freeze([...observations]),
      });
    });
    const scoreInput: A3SetRDocumentScoreInput = Object.freeze({
      document,
      sourceRows: Object.freeze(sourceRows),
    });

    let scorePreparation;
    try {
      scorePreparation = prepareSetRDocumentScore(scoreInput);
    } catch (error) {
      if (error instanceof A3SetRScoreRefusal) {
        refuse(
          'R21_SET_R_SCORE_PREPARATION_REFUSED',
          `canonical R10 refused exact-document group at position ${groupPosition} with ${error.code}`,
          { cause: error },
        );
      }
      throw error;
    }

    documents.push(
      Object.freeze({
        document,
        extractionRuleVersion: R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1,
        scorePreparation,
        sourceRowCount: members.length,
      }),
    );
  });

  const assembly: UnboundA3SlotDocumentSourceAssembly = Object.freeze({
    kind: 'UNBOUND_A3_DOCUMENT_SOURCE_ASSEMBLY' as const,
    selectionIndex: slot.selectionIndex,
    split: R20_EVIDENCE_SPLIT_V1,
    exactDuplicate: Object.freeze({
      rowCount: pass.rowCount,
      distinctDocumentCount: pass.distinctDocumentCount,
      duplicateGroupCount: pass.duplicateGroupCount,
      duplicateRowsRemoved: pass.duplicateRowsRemoved,
      divergentGroupCount: pass.divergentGroupCount,
    }),
    documents: Object.freeze(documents),
    candidateObservationCount,
  });
  TEXT_BY_UNBOUND_ASSEMBLY.set(assembly, texts);
  return assembly;
}

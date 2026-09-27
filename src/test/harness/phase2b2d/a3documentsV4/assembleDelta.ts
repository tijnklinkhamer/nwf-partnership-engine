/**
 * PHASE 2B-2D — A3 R34: THE MECHANICAL V4 DELTA ADAPTER AROUND R21'S PURE
 * ASSEMBLER.
 *
 * R21 OWNS EVERY DOCUMENT SEMANTIC. THIS FILE OWNS NONE.
 *
 *   Source-row validation, candidate -> page relations, the canonical
 *   `exactDuplicatePass`, the extraction-version support gate, text by
 *   equality, the private text store and canonical R10
 *   `prepareSetRDocumentScore` all live in R21's
 *   `assembleUnboundSlotDocumentSources`, which is called here UNCHANGED,
 *   exactly once per R33 delta item, ONE SLOT AT A TIME. This file only
 *   re-shapes one R33 item's rows into R21's plain input - no pre-grouping,
 *   no pre-dedupe, no pre-scoring, no text transformation, no cross-slot
 *   digest comparison - and re-checks the two row-graph links the shapes
 *   carry before R21 sees them.
 *
 * ALL OR NOTHING
 *
 *   Every item is assembled before any result is returned. A refusal on the
 *   seventh item returns nothing for the first six: the minting layer
 *   receives either every unbound assembly or an exception.
 *
 * AN INDEPENDENT AGREEMENT CHECK WITH R33
 *
 *   R33 measured each run's page rows, distinct response digests and
 *   candidate rows. R21's assembly of the same rows must reproduce all three,
 *   its R10 preparations must cover exactly those rows and candidate
 *   observations, and every source row must lie in exactly one document -
 *   derived per item, never against a hardcoded number. Any disagreement
 *   STOPS: two slices reading one run must not disagree about its documents.
 *
 * THIS MODULE IS PURE. No socket, database, filesystem, clock, randomness or
 * environment read. It mutates no input. Its outputs are UNBOUND - not
 * authority - so exercising it with synthetic R33-shaped items proves the
 * adapter without minting anything.
 */
import { assembleUnboundSlotDocumentSources } from '../a3documents/assemble.js';
import type {
  UnboundA3SlotDocumentSourceAssembly,
  UnboundSlotCandidateSourceRow,
  UnboundSlotDocumentSourceInput,
  UnboundSlotPageSourceRow,
} from '../a3documents/types.js';
import type { A3DurableAcquisitionEvidenceDeltaV4 } from '../a3evidenceV4/types.js';
import { refuseV4Document } from './refusal.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireItemShape(item: unknown): A3DurableAcquisitionEvidenceDeltaV4 {
  const authority = isRecord(item) ? item['authority'] : undefined;
  const evidence = isRecord(item) ? item['evidence'] : undefined;
  if (
    !isRecord(authority) ||
    !isRecord(evidence) ||
    !Array.isArray(evidence['pageEvidence']) ||
    !Array.isArray(evidence['candidates']) ||
    !isRecord(evidence['integrity'])
  ) {
    refuseV4Document(
      'R34_DELTA_EVIDENCE_SHAPE_INVALID',
      'the delta item does not carry an authority and page/candidate evidence',
    );
  }
  return item as unknown as A3DurableAcquisitionEvidenceDeltaV4;
}

/**
 * §8. One R33 delta item's rows as R21's plain input. The page -> fetch link
 * and the fetch's digest, and the candidate -> page link, are re-checked here
 * rather than trusted; no URL, host, root, title or heading is carried over.
 */
export function slotInputFromDeltaEvidenceV4(item: unknown): UnboundSlotDocumentSourceInput {
  const delta = requireItemShape(item);
  const pageEvidence = delta.evidence.pageEvidence.map(
    (row, position): UnboundSlotPageSourceRow => {
      if (
        !isRecord(row) ||
        !isRecord(row.page) ||
        !isRecord(row.fetch) ||
        row.page.fetchObservationId !== row.fetch.id ||
        row.fetch.responseSha256 !== row.responseSha256
      ) {
        refuseV4Document(
          'R34_PAGE_FETCH_RELATION_MISMATCH',
          `page-evidence source row at position ${position} disagrees with its own fetch`,
        );
      }
      return Object.freeze({
        pageEvidenceId: row.page.id,
        documentSha256: row.responseSha256,
        extractionRuleVersion: row.page.ruleVersion,
        mainText: row.page.mainText,
      });
    },
  );
  const candidates = delta.evidence.candidates.map(
    (row, position): UnboundSlotCandidateSourceRow => {
      if (
        !isRecord(row) ||
        !isRecord(row.candidate) ||
        row.candidate.pageEvidenceId !== row.pageEvidenceId
      ) {
        refuseV4Document(
          'R34_CANDIDATE_PAGE_RELATION_MISMATCH',
          `candidate source row at position ${position} disagrees with its own page link`,
        );
      }
      return Object.freeze({
        pageEvidenceId: row.pageEvidenceId,
        documentSha256: row.responseSha256,
        track: row.candidate.track,
        // The persisted numeric(8,4) TEXT, passed through untouched.
        candidateScore: row.candidate.candidateScore,
        ruleVersion: row.candidate.ruleVersion,
      });
    },
  );
  return Object.freeze({
    selectionIndex: delta.authority.selectionIndex,
    split: delta.authority.split,
    pageEvidence: Object.freeze(pageEvidence),
    candidates: Object.freeze(candidates),
  });
}

/**
 * §12. R21's assembly of one item must reproduce R33's own row, document and
 * candidate counts for that item's run; its R10 preparations must cover
 * exactly those rows and candidate observations; and every R33 page row must
 * lie in exactly one document. Derived from the item; no constant.
 */
export function requireAssemblyAgreesWithDeltaEvidenceV4(
  item: A3DurableAcquisitionEvidenceDeltaV4,
  unbound: UnboundA3SlotDocumentSourceAssembly,
  position: number,
): void {
  const integrity = item.evidence.integrity;
  let r10SourceRows = 0;
  let r10CandidateObservations = 0;
  const documentsPerRow = new Map<string, number>();
  for (const entry of unbound.documents) {
    r10SourceRows += entry.scorePreparation.sourceRowScores.length;
    for (const row of entry.scorePreparation.sourceRowScores) {
      r10CandidateObservations += row.trackScores.length;
    }
    for (const id of entry.document.sourcePageEvidenceIds) {
      documentsPerRow.set(id, (documentsPerRow.get(id) ?? 0) + 1);
    }
  }
  const rowIds = item.evidence.pageEvidence.map((row) => row.page.id);
  const everyRowExactlyOnce =
    documentsPerRow.size === rowIds.length && rowIds.every((id) => documentsPerRow.get(id) === 1);
  if (
    unbound.exactDuplicate.rowCount !== integrity.pageEvidenceSourceRowCount ||
    unbound.exactDuplicate.distinctDocumentCount !== integrity.distinctResponseSha256Count ||
    unbound.documents.length !== integrity.distinctResponseSha256Count ||
    unbound.candidateObservationCount !== integrity.candidateRowCount ||
    r10SourceRows !== integrity.pageEvidenceSourceRowCount ||
    r10CandidateObservations !== integrity.candidateRowCount ||
    rowIds.length !== integrity.pageEvidenceSourceRowCount ||
    !everyRowExactlyOnce
  ) {
    refuseV4Document(
      'STOP_R34_DOCUMENT_ASSEMBLY_DISAGREES_WITH_R33_DURABLE_EVIDENCE',
      `the assembly of delta item at position ${position} disagrees with R33's measured counts`,
    );
  }
}

/**
 * §9 / §11. Every item through R21's pure assembler exactly once, one slot at
 * a time, in order, before anything is returned. Callers mint only from this
 * function's result.
 */
export function assembleDeltaItemsAllOrNothingV4(
  items: readonly A3DurableAcquisitionEvidenceDeltaV4[],
): readonly UnboundA3SlotDocumentSourceAssembly[] {
  const inputs = items.map((item) => slotInputFromDeltaEvidenceV4(item));
  const unbound: UnboundA3SlotDocumentSourceAssembly[] = [];
  items.forEach((item, position) => {
    const assembled = assembleUnboundSlotDocumentSources(
      inputs[position] as UnboundSlotDocumentSourceInput,
    );
    requireAssemblyAgreesWithDeltaEvidenceV4(item, assembled, position);
    unbound.push(assembled);
  });
  return Object.freeze(unbound);
}

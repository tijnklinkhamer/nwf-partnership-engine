/**
 * PHASE 2B-2D — A3 R27: THE MECHANICAL DELTA ADAPTER AROUND R21'S PURE ASSEMBLER.
 *
 * R21 OWNS EVERY DOCUMENT SEMANTIC. THIS FILE OWNS NONE.
 *
 *   Source-row validation, candidate -> page relations, the canonical
 *   `exactDuplicatePass`, the extraction-version support gate, text by
 *   equality, the private text store and canonical R10
 *   `prepareSetRDocumentScore` all live in R21's
 *   `assembleUnboundSlotDocumentSources`, which is called here UNCHANGED,
 *   exactly once per R26 delta item. This file only re-shapes one R26 item's
 *   rows into R21's plain input - no pre-grouping, no pre-dedupe, no
 *   pre-scoring, no text transformation - and re-checks the two row-graph
 *   links the shapes carry before R21 sees them.
 *
 * ALL OR NOTHING
 *
 *   Every item is assembled before any result is returned. A refusal on the
 *   second item returns nothing for the first: the minting layer receives
 *   either every unbound assembly or an exception.
 *
 * AN INDEPENDENT AGREEMENT CHECK WITH R26
 *
 *   R26 measured each run's page rows, distinct response digests and
 *   candidate rows. R21's assembly of the same rows must reproduce all three,
 *   derived per item - never against a hardcoded number. Any disagreement
 *   STOPS: two slices reading one run must not disagree about its documents.
 *
 * THIS MODULE IS PURE. No socket, database, filesystem, clock, randomness or
 * environment read. It mutates no input. Its outputs are UNBOUND - not
 * authority - so exercising it with synthetic R26-shaped items proves the
 * adapter without minting anything.
 */
import { assembleUnboundSlotDocumentSources } from '../a3documents/assemble.js';
import type {
  UnboundA3SlotDocumentSourceAssembly,
  UnboundSlotCandidateSourceRow,
  UnboundSlotDocumentSourceInput,
  UnboundSlotPageSourceRow,
} from '../a3documents/types.js';
import type { A3DurableAcquisitionEvidenceDeltaV2 } from '../a3evidenceV2/types.js';
import { refuseV2Document } from './refusal.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireItemShape(item: unknown): A3DurableAcquisitionEvidenceDeltaV2 {
  const authority = isRecord(item) ? item['authority'] : undefined;
  const evidence = isRecord(item) ? item['evidence'] : undefined;
  if (
    !isRecord(authority) ||
    !isRecord(evidence) ||
    !Array.isArray(evidence['pageEvidence']) ||
    !Array.isArray(evidence['candidates'])
  ) {
    refuseV2Document(
      'R27_DELTA_EVIDENCE_SHAPE_INVALID',
      'the delta item does not carry an authority and page/candidate evidence',
    );
  }
  return item as unknown as A3DurableAcquisitionEvidenceDeltaV2;
}

/**
 * §14-§16. One R26 delta item's rows as R21's plain input. The page -> fetch
 * link and the fetch's digest, and the candidate -> page link, are re-checked
 * here rather than trusted; no URL, root, title or heading is carried over.
 */
export function slotInputFromDeltaEvidence(item: unknown): UnboundSlotDocumentSourceInput {
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
        refuseV2Document(
          'R27_PAGE_FETCH_RELATION_MISMATCH',
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
        refuseV2Document(
          'R27_CANDIDATE_PAGE_RELATION_MISMATCH',
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
 * §33. R21's assembly of one item must reproduce R26's own row, document and
 * candidate counts for that item's run. Derived from the item; no constant.
 */
export function requireAssemblyAgreesWithDeltaEvidence(
  item: A3DurableAcquisitionEvidenceDeltaV2,
  unbound: UnboundA3SlotDocumentSourceAssembly,
  position: number,
): void {
  const integrity = item.evidence.integrity;
  if (
    unbound.exactDuplicate.rowCount !== integrity.pageEvidenceSourceRowCount ||
    unbound.exactDuplicate.distinctDocumentCount !== integrity.distinctResponseSha256Count ||
    unbound.documents.length !== integrity.distinctResponseSha256Count ||
    unbound.candidateObservationCount !== integrity.candidateRowCount
  ) {
    refuseV2Document(
      'STOP_R27_DOCUMENT_ASSEMBLY_DISAGREES_WITH_R26_DURABLE_EVIDENCE',
      `the assembly of delta item at position ${position} disagrees with R26's measured counts`,
    );
  }
}

/**
 * §17 / §18. Every item through R21's pure assembler exactly once, in order,
 * before anything is returned. Callers mint only from this function's result.
 */
export function assembleDeltaItemsAllOrNothing(
  items: readonly A3DurableAcquisitionEvidenceDeltaV2[],
): readonly UnboundA3SlotDocumentSourceAssembly[] {
  const unbound: UnboundA3SlotDocumentSourceAssembly[] = [];
  items.forEach((item, position) => {
    const assembled = assembleUnboundSlotDocumentSources(slotInputFromDeltaEvidence(item));
    requireAssemblyAgreesWithDeltaEvidence(item, assembled, position);
    unbound.push(assembled);
  });
  return Object.freeze(unbound);
}

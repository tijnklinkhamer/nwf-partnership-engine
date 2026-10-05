/**
 * PHASE 2B-2D — A3 R40: THE MECHANICAL V5 DELTA ADAPTER AROUND R21'S PURE
 * ASSEMBLER.
 *
 * R21 OWNS EVERY DOCUMENT SEMANTIC. THIS FILE OWNS NONE.
 *
 *   Source-row validation, candidate -> page relations, the canonical
 *   `exactDuplicatePass`, the extraction-version support gate, text by
 *   equality, the private text store and canonical R10
 *   `prepareSetRDocumentScore` all live in R21's
 *   `assembleUnboundSlotDocumentSources`, which is called here UNCHANGED,
 *   exactly once per R39 delta item, ONE SLOT AT A TIME. This file only
 *   re-shapes one R39 item's rows into R21's plain input - no pre-grouping,
 *   no pre-dedupe, no pre-scoring, no text transformation, no cross-slot
 *   digest comparison - and re-checks the two row-graph links the shapes
 *   carry before R21 sees them.
 *
 * NO GENERATION-SPECIFIC SEMANTICS
 *
 *   Once R39 has authenticated the evidence, a PRIMARY, Generation-1 reserve
 *   or Generation-2 reserve occupant's rows are assembled identically. The
 *   adapter reads the authority's selection index and nothing else of it.
 *
 * ALL OR NOTHING
 *
 *   Every item is adapted before the first R21 call, and every item is
 *   assembled before any result is returned. A refusal on the seventh item
 *   returns nothing for the first six: the minting layer receives either
 *   every unbound assembly or an exception.
 *
 * AN INDEPENDENT AGREEMENT CHECK WITH R39
 *
 *   R39 measured each run's page rows, distinct response digests and
 *   candidate rows. R21's assembly of the same rows must reproduce all three,
 *   its R10 preparations must cover exactly those rows and candidate
 *   observations, and every source row must lie in exactly one document -
 *   derived per item, never against a hardcoded number. Any disagreement
 *   STOPS.
 *
 * THIS MODULE IS PURE. No socket, database, filesystem, clock, randomness or
 * environment read. It mutates no input. Its outputs are UNBOUND - not
 * authority - so exercising it with synthetic R39-shaped items proves the
 * adapter without minting anything.
 */
import { assembleUnboundSlotDocumentSources } from '../a3documents/assemble.js';
import type {
  UnboundA3SlotDocumentSourceAssembly,
  UnboundSlotCandidateSourceRow,
  UnboundSlotDocumentSourceInput,
  UnboundSlotPageSourceRow,
} from '../a3documents/types.js';
import type { A3DurableAcquisitionEvidenceDeltaV5 } from '../a3evidenceV5/types.js';
import { refuseV5Document } from './refusal.js';
import { R40_DOCUMENT_SPLIT } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireItemShape(item: unknown): A3DurableAcquisitionEvidenceDeltaV5 {
  const authority = isRecord(item) ? item['authority'] : undefined;
  const evidence = isRecord(item) ? item['evidence'] : undefined;
  if (
    !isRecord(authority) ||
    !isRecord(evidence) ||
    !Array.isArray(evidence['pageEvidence']) ||
    !Array.isArray(evidence['candidates']) ||
    !isRecord(evidence['integrity'])
  ) {
    refuseV5Document(
      'R40_DELTA_EVIDENCE_SHAPE_INVALID',
      'the delta item does not carry an authority and page/candidate evidence',
    );
  }
  return item as unknown as A3DurableAcquisitionEvidenceDeltaV5;
}

/**
 * §16 / §17. One R39 delta item's rows as R21's plain input. The page -> fetch
 * link and the fetch's digest, and the candidate -> page link, are re-checked
 * here rather than trusted; no URL, host, root, title or heading is carried.
 */
export function slotInputFromDeltaEvidenceV5(item: unknown): UnboundSlotDocumentSourceInput {
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
        refuseV5Document(
          'R40_PAGE_FETCH_RELATION_MISMATCH',
          `page-evidence source row at position ${position} disagrees with its own fetch`,
        );
      }
      return Object.freeze({
        pageEvidenceId: row.page.id,
        documentSha256: row.responseSha256,
        extractionRuleVersion: row.page.ruleVersion,
        // The persisted, already-redacted text, exactly as stored.
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
        refuseV5Document(
          'R40_CANDIDATE_PAGE_RELATION_MISMATCH',
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
    split: R40_DOCUMENT_SPLIT,
    pageEvidence: Object.freeze(pageEvidence),
    candidates: Object.freeze(candidates),
  });
}

/**
 * §23. R21's assembly of one item must reproduce R39's own row, document and
 * candidate counts for that item's run; its R10 preparations must cover
 * exactly those rows and candidate observations; and every R39 page row must
 * lie in exactly one document. Derived from the item; no constant.
 */
export function requireAssemblyAgreesWithDeltaEvidenceV5(
  item: A3DurableAcquisitionEvidenceDeltaV5,
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
    unbound.selectionIndex !== item.authority.selectionIndex ||
    unbound.exactDuplicate.rowCount !== integrity.pageEvidenceSourceRowCount ||
    unbound.exactDuplicate.distinctDocumentCount !== integrity.distinctResponseSha256Count ||
    unbound.documents.length !== integrity.distinctResponseSha256Count ||
    unbound.candidateObservationCount !== integrity.candidateRowCount ||
    r10SourceRows !== integrity.pageEvidenceSourceRowCount ||
    r10CandidateObservations !== integrity.candidateRowCount ||
    rowIds.length !== integrity.pageEvidenceSourceRowCount ||
    !everyRowExactlyOnce
  ) {
    refuseV5Document(
      'STOP_R40_DOCUMENT_ASSEMBLY_DISAGREES_WITH_R39_DURABLE_EVIDENCE',
      `the assembly of delta item at position ${position} disagrees with R39's measured counts`,
    );
  }
}

export interface DeltaAssemblyResultV5 {
  readonly assemblies: readonly UnboundA3SlotDocumentSourceAssembly[];
  /** How many times R21's pure assembler was called. One per item, by construction. */
  readonly r21AssemblyCalls: number;
}

/**
 * §15 / §24. Every item adapted first; then every item through R21's pure
 * assembler exactly once, one slot at a time, in order, before anything is
 * returned. Callers mint only from this function's result.
 */
export function assembleDeltaItemsAllOrNothingV5(
  items: readonly A3DurableAcquisitionEvidenceDeltaV5[],
): DeltaAssemblyResultV5 {
  const inputs = items.map((item) => slotInputFromDeltaEvidenceV5(item));
  const assemblies: UnboundA3SlotDocumentSourceAssembly[] = [];
  let r21AssemblyCalls = 0;
  items.forEach((item, position) => {
    r21AssemblyCalls += 1;
    const assembled = assembleUnboundSlotDocumentSources(
      inputs[position] as UnboundSlotDocumentSourceInput,
    );
    requireAssemblyAgreesWithDeltaEvidenceV5(item, assembled, position);
    assemblies.push(assembled);
  });
  return Object.freeze({ assemblies: Object.freeze(assemblies), r21AssemblyCalls });
}

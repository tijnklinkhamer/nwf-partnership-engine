/**
 * PHASE 2B-2D — A3 R21: THE DOCUMENT-SOURCE ASSEMBLY TYPES.
 *
 * ONE QUESTION R21 ANSWERS
 *
 *   For each authorised DEV_TRAIN organisation, which exact persisted source
 *   rows form each exact document, what ONE SD7 text value is mechanically
 *   available without choosing a representative, and what complete K1/K2
 *   score evidence belongs to that document?
 *
 * WHAT R21 IS NOT
 *
 *   Not SET_P, not SET_R membership, not an SD7 near-duplicate graph, not an
 *   SD7 survivor decision, not a rank, not a cap, not a short-text decision
 *   and not a corpus freeze. It stops at "these rows are this document, and
 *   this is its complete score evidence".
 *
 * THE TWO LEVELS
 *
 *   `UnboundA3SlotDocumentSourceAssembly` is what the PURE assembler returns
 *   for any caller-supplied rows. It is not authority: a test may build one
 *   freely, because doing so proves nothing about which acquisition A2
 *   adjudicated.
 *
 *   `A3DevTrainSlotDocumentSourceAssemblyV1` and
 *   `A3DevTrainDocumentSourceBatchV1` are minted ONLY by `devTrain.ts`, and
 *   only from an actual R20-minted DEV_TRAIN batch. They are branded by
 *   private `WeakSet`s, so a clone, a spread or a deserialised copy is not
 *   one.
 *
 * WHERE THE TEXT IS - AND IS NOT
 *
 *   No type in this file has a field that can hold page text. The canonical
 *   `A3DistinctDocument` has nowhere to put it, and R21 does not add one:
 *   text travels separately through a `DocumentTextLookup` closure held in a
 *   module-private `WeakMap`, exactly as the canonical R6 SD7 architecture
 *   prescribes. A log line or a file built from these shapes is structurally
 *   incapable of quoting a page.
 */
import type { A3DistinctDocument } from '../a3prep/types.js';
import type { A3SetRDocumentScorePreparation } from '../a3prep/setRScore.js';
import type { A3CommittedGovernanceSnapshot } from '../a3governance/snapshot.js';
import type { R20EvidenceSplitV1 } from '../a3evidence/types.js';

/**
 * THE ONE EXTRACTION RULE VERSION R21 V1 SUPPORTS.
 *
 * A BOUNDED IMPLEMENTATION SUPPORT CONTRACT for the current DEV_TRAIN
 * evidence - not a methodology amendment, not a claim that v2 is preferred
 * forever, and not a multi-version policy. Frozen R3 says SD7 reads
 * "redacted extracted main_text" and says nothing about which extraction of
 * one response represents it, so a document under any other version, or
 * under more than one, is refused rather than resolved.
 */
export const R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1 = 'orgunit-extraction-v2' as const;
export type R21SupportedExtractionRuleVersionV1 = typeof R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1;

// ---------------------------------------------------------------------------
// A. THE PLAIN, UNBOUND INPUT.
// ---------------------------------------------------------------------------

/** One page-evidence source row, reduced to what document assembly needs. */
export interface UnboundSlotPageSourceRow {
  /** `orgunit_page_evidence.id`. */
  readonly pageEvidenceId: string;
  /** `orgunit_fetch_observations.response_sha256`, via THIS row's own fetch. */
  readonly documentSha256: string;
  /** `orgunit_page_evidence.rule_version` - the EXTRACTION rule version. */
  readonly extractionRuleVersion: string;
  /** The persisted, already-redacted `main_text`, exactly as stored. */
  readonly mainText: string;
}

/** One persisted candidate observation, reduced to what K1/K2 needs. */
export interface UnboundSlotCandidateSourceRow {
  readonly pageEvidenceId: string;
  /** The response digest reached through the candidate's page's fetch. */
  readonly documentSha256: string;
  readonly track: string;
  /** The exact `numeric(8,4)` text. Never converted to a number here. */
  readonly candidateScore: string;
  /** The SIGNAL rule version. */
  readonly ruleVersion: string;
}

/**
 * ONE organisation's rows. There is no multi-slot input shape on purpose:
 * exact grouping runs inside one selection slot only, so a cross-organisation
 * copy of the same bytes stays distinct population evidence (frozen SD7).
 */
export interface UnboundSlotDocumentSourceInput {
  readonly selectionIndex: number;
  readonly split: string;
  /** In deterministic R20 source-row order. That order is provenance only. */
  readonly pageEvidence: readonly UnboundSlotPageSourceRow[];
  readonly candidates: readonly UnboundSlotCandidateSourceRow[];
}

// ---------------------------------------------------------------------------
// B. THE ASSEMBLY SHAPES.
// ---------------------------------------------------------------------------

/**
 * One exact document and its complete score evidence. Nothing here is a
 * representative: `document.sourcePageEvidenceIds` lists EVERY source row in
 * provenance order, and `scorePreparation` is canonical R10's output over all
 * of them. No text, URL, host, root, title, rank or winner.
 */
export interface A3DocumentSourceEntry {
  readonly document: A3DistinctDocument;
  readonly extractionRuleVersion: R21SupportedExtractionRuleVersionV1;
  readonly scorePreparation: A3SetRDocumentScorePreparation;
  readonly sourceRowCount: number;
}

/** The canonical `exactDuplicatePass` aggregates for one slot. */
export interface A3SlotExactDuplicateAggregates {
  readonly rowCount: number;
  readonly distinctDocumentCount: number;
  readonly duplicateGroupCount: number;
  /** `rowCount - distinctDocumentCount`. Not R20's duplicate-source-row count. */
  readonly duplicateRowsRemoved: number;
  readonly divergentGroupCount: number;
}

interface A3SlotDocumentSourceAssemblyBody {
  readonly selectionIndex: number;
  readonly split: R20EvidenceSplitV1;
  readonly exactDuplicate: A3SlotExactDuplicateAggregates;
  /** In canonical `exactDuplicatePass` first-seen order. Provenance only; never a rank. */
  readonly documents: readonly A3DocumentSourceEntry[];
  readonly candidateObservationCount: number;
}

/** Level A. Not authority. */
export interface UnboundA3SlotDocumentSourceAssembly extends A3SlotDocumentSourceAssemblyBody {
  readonly kind: 'UNBOUND_A3_DOCUMENT_SOURCE_ASSEMBLY';
}

/** Level B, one slot. Minted only from one actual R20-minted evidence item. */
export interface A3DevTrainSlotDocumentSourceAssemblyV1 extends A3SlotDocumentSourceAssemblyBody {
  readonly kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_V1';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
}

/** Level B, the split. Minted only from an actual R20-minted DEV_TRAIN batch. */
export interface A3DevTrainDocumentSourceBatchV1 {
  readonly kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_BATCH_V1';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R20EvidenceSplitV1;
  readonly governanceSnapshot: A3CommittedGovernanceSnapshot;
  readonly items: readonly A3DevTrainSlotDocumentSourceAssemblyV1[];
}

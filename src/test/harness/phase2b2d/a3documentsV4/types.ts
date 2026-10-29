/**
 * PHASE 2B-2D — A3 R34: THE GOVERNANCE V4 INCREMENTAL DOCUMENT-SOURCE TYPES.
 *
 * ONE QUESTION R34 ANSWERS
 *
 *   Can the seven R33-minted Governance V4 DEV_TRAIN durable-evidence delta
 *   items - and only those - be turned, through the EXACT existing R21 pure
 *   document-source assembler, into newly minted slot assemblies, while the
 *   six historical R21 / R27 slot assemblies stay canonical prior coverage
 *   rather than being rebuilt?
 *
 * R34 IS INCREMENTAL
 *
 *   R21 canonical history covers five slot assemblies and R27 added a sixth;
 *   R34 newly assembles the V4 delta slots. There is no thirteen-slot batch
 *   anywhere in this namespace: the historical six enter only as committed
 *   AGGREGATE counts in the coverage-expansion proof, never as objects,
 *   wrappers or text lookups.
 *
 * WHAT IS REUSED BY TYPE, NOT COPIED
 *
 *   `A3DocumentSourceEntry` and `A3SlotExactDuplicateAggregates` are R21's
 *   own types. The documents inside an R34 slot assembly are the exact
 *   objects R21's pure assembler returned - its `A3DistinctDocument`s and
 *   canonical R10 `A3SetRDocumentScorePreparation`s, never rebuilt.
 *
 * WHERE THE TEXT IS - AND IS NOT
 *
 *   No type in this file has a field that can hold page text, a title, a
 *   heading, a URL or a host. Text travels only through a processing-only
 *   `DocumentTextLookup` held in a module-private `WeakMap` in `devTrain.ts`.
 */
import type {
  A3DocumentSourceEntry,
  A3SlotExactDuplicateAggregates,
} from '../a3documents/types.js';
import type { A3CommittedGovernanceSnapshotV4 } from '../a3governanceV4/snapshotV4.js';
import type { A3DevTrainDurableEvidenceDeltaBatchV4 } from '../a3evidenceV4/types.js';

/**
 * R34 supports EXACTLY ONE split. A constant, never a parameter: assembling
 * DEV_CONFIRM or FINAL_HOLDOUT must not be a one-argument change.
 */
export const R34_DOCUMENT_SPLIT = 'DEV_TRAIN' as const;
export type R34DocumentSplit = typeof R34_DOCUMENT_SPLIT;

/**
 * One newly assembled V4 delta slot. Minted only by `devTrain.ts`, only from
 * one actual R33-minted `A3DurableAcquisitionEvidenceDeltaV4`, and branded by
 * a private `WeakSet` - a clone, a spread or a deserialised copy is not one.
 */
export interface A3DevTrainSlotDocumentSourceAssemblyDeltaV4 {
  readonly kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V4';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R34DocumentSplit;
  /** Canonical `exactDuplicatePass` aggregates, exactly as R21 returned them. */
  readonly exactDuplicate: A3SlotExactDuplicateAggregates;
  /** R21's own entries, in canonical first-seen order. Provenance only; never a rank. */
  readonly documents: readonly A3DocumentSourceEntry[];
  readonly candidateObservationCount: number;
}

/**
 * The V4 delta document-source batch. Holds ONLY newly assembled delta slots -
 * it is NOT a thirteen-slot batch and never contains a historical R21 or R27
 * slot.
 */
export interface A3DevTrainDocumentSourceDeltaBatchV4 {
  readonly kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V4';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R34DocumentSplit;
  /** The ACTUAL V4 snapshot behind the R33 batch, by reference. */
  readonly governanceSnapshotV4: A3CommittedGovernanceSnapshotV4;
  /** The ACTUAL R33 delta batch this was assembled from, by reference. */
  readonly evidenceDeltaBatch: A3DevTrainDurableEvidenceDeltaBatchV4;
  readonly items: readonly A3DevTrainSlotDocumentSourceAssemblyDeltaV4[];
}

/**
 * The committed R21 + R27 aggregate history, closed to one six-slot baseline.
 * COUNTS ONLY: no slot, document, digest or text of the historical six exists
 * in this process.
 */
export interface HistoricalDocumentSourceCoverageBaseline {
  readonly r21SlotCount: number;
  readonly r27NewSlotCount: number;
  readonly slotCount: number;
  readonly sourceRows: number;
  readonly slotLocalDocuments: number;
  readonly exactDuplicateGroups: number;
  readonly exactDuplicateRowsRemoved: number;
  readonly multiSourceDocuments: number;
  readonly candidateObservations: number;
  readonly r10Preparations: number;
  readonly r10SourceRows: number;
  readonly r10CandidateObservations: number;
}

/**
 * The aggregate coverage proof: committed R21 + R27 history + the newly
 * minted R34 delta. COUNTS ONLY. "Slot-local documents" is a SUM of per-slot
 * distinct document counts, never a count of globally unique response
 * digests - no cross-organisation comparison is made.
 */
export interface A3DevTrainCanonicalDocumentSourceCoverageExpansionV4 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_DOCUMENT_SOURCE_COVERAGE_EXPANSION_V4';
  readonly historicalSlotCount: number;
  readonly deltaSlotCount: number;
  readonly v4AuthorityCoverageCount: number;
  readonly coverageSlotCount: number;
  readonly historicalSourceRows: number;
  readonly deltaSourceRows: number;
  readonly coverageSourceRows: number;
  readonly historicalSlotLocalDocuments: number;
  readonly deltaSlotLocalDocuments: number;
  readonly coverageSlotLocalDocuments: number;
  readonly historicalExactDuplicateGroups: number;
  readonly deltaExactDuplicateGroups: number;
  readonly coverageExactDuplicateGroups: number;
  readonly historicalExactDuplicateRowsRemoved: number;
  readonly deltaExactDuplicateRowsRemoved: number;
  readonly coverageExactDuplicateRowsRemoved: number;
  readonly historicalMultiSourceDocuments: number;
  readonly deltaMultiSourceDocuments: number;
  readonly coverageMultiSourceDocuments: number;
  readonly historicalCandidateObservations: number;
  readonly deltaCandidateObservations: number;
  readonly coverageCandidateObservations: number;
  readonly historicalR10Preparations: number;
  readonly deltaR10Preparations: number;
  readonly coverageR10Preparations: number;
  readonly historicalR10SourceRows: number;
  readonly deltaR10SourceRows: number;
  readonly coverageR10SourceRows: number;
  readonly historicalR10CandidateObservations: number;
  readonly deltaR10CandidateObservations: number;
  readonly coverageR10CandidateObservations: number;
}

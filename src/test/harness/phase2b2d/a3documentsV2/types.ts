/**
 * PHASE 2B-2D — A3 R27: THE INCREMENTAL DOCUMENT-SOURCE ASSEMBLY TYPES.
 *
 * ONE QUESTION R27 ANSWERS
 *
 *   Can the one R26-minted DEV_TRAIN evidence delta be turned, through the
 *   EXACT existing R21 pure document-source assembler, into one newly minted
 *   slot assembly - while the five historical R21 slot assemblies stay
 *   canonical prior coverage rather than being rebuilt?
 *
 * R27 IS INCREMENTAL
 *
 *   R21 canonical history covers five slot assemblies; R27 newly assembles
 *   one delta slot. There is no six-slot batch anywhere in this namespace:
 *   the historical five enter only as committed AGGREGATE counts in the
 *   coverage-expansion proof, never as objects, wrappers or text lookups.
 *
 * WHAT IS REUSED BY TYPE, NOT COPIED
 *
 *   `A3DocumentSourceEntry` and `A3SlotExactDuplicateAggregates` are R21's
 *   own types. The documents inside an R27 slot assembly are the exact
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
import type { A3CommittedGovernanceSnapshotV2 } from '../a3governanceV2/snapshotV2.js';
import type { A3DevTrainDurableEvidenceDeltaBatchV2 } from '../a3evidenceV2/types.js';

/**
 * R27 supports EXACTLY ONE split. A constant, never a parameter: assembling
 * DEV_CONFIRM or FINAL_HOLDOUT must not be a one-argument change.
 */
export const R27_DOCUMENT_SPLIT = 'DEV_TRAIN' as const;
export type R27DocumentSplit = typeof R27_DOCUMENT_SPLIT;

/**
 * One newly assembled delta slot. Minted only by `devTrain.ts`, only from one
 * actual R26-minted `A3DurableAcquisitionEvidenceDeltaV2`, and branded by a
 * private `WeakSet` - a clone, a spread or a deserialised copy is not one.
 */
export interface A3DevTrainSlotDocumentSourceAssemblyDeltaV2 {
  readonly kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V2';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R27DocumentSplit;
  /** Canonical `exactDuplicatePass` aggregates, exactly as R21 returned them. */
  readonly exactDuplicate: A3SlotExactDuplicateAggregates;
  /** R21's own entries, in canonical first-seen order. Provenance only; never a rank. */
  readonly documents: readonly A3DocumentSourceEntry[];
  readonly candidateObservationCount: number;
}

/**
 * The delta document-source batch. Holds ONLY newly assembled delta slots -
 * it is NOT a six-slot batch and never contains a historical R21 slot.
 */
export interface A3DevTrainDocumentSourceDeltaBatchV2 {
  readonly kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V2';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R27DocumentSplit;
  /** The ACTUAL V2 snapshot behind the R26 batch, by reference. */
  readonly governanceSnapshotV2: A3CommittedGovernanceSnapshotV2;
  /** The ACTUAL R26 delta batch this was assembled from, by reference. */
  readonly evidenceDeltaBatch: A3DevTrainDurableEvidenceDeltaBatchV2;
  readonly items: readonly A3DevTrainSlotDocumentSourceAssemblyDeltaV2[];
}

/**
 * The aggregate coverage proof: committed R21 history + the newly minted
 * delta. COUNTS ONLY. "Slot-local documents" is a SUM of per-slot distinct
 * document counts, never a count of globally unique response digests - no
 * cross-organisation comparison is made.
 */
export interface A3DevTrainCanonicalDocumentSourceCoverageExpansionV2 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_DOCUMENT_SOURCE_COVERAGE_EXPANSION_V2';
  readonly historicalR21SlotCount: number;
  readonly deltaSlotCount: number;
  readonly v2AuthorityCoverageCount: number;
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

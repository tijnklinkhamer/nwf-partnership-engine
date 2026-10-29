/**
 * PHASE 2B-2D — A3 R40: THE GOVERNANCE V5 INCREMENTAL DOCUMENT-SOURCE TYPES.
 *
 * ONE QUESTION R40 ANSWERS
 *
 *   Can the seven newly evidence-bound Governance V5 DEV_TRAIN authorities be
 *   transformed, one slot at a time, through the unchanged R21 canonical
 *   document-source assembler, while the thirteen historical document /
 *   downstream slots remain untouched and canonical?
 *
 * WHY A SIBLING OF R34 AND NOT A REUSE OF IT
 *
 *   R34's adapter and binder take R33's V4 evidence types and brands, and
 *   stay exactly that. R39's V5 evidence carries an R38A cross-generation
 *   READY, not an R17 READY, so R40 owns its own V5 verification, adapter and
 *   mint. From R21 it takes only the pure assembler and its text lookup.
 *
 * R40 IS INCREMENTAL
 *
 *   R34 canonical history covers thirteen slot assemblies (R21 5 + R27 1 +
 *   R34 7). R40 newly assembles the seven V5 delta slots. There is no
 *   twenty-slot batch anywhere in this namespace: the historical thirteen
 *   enter only as committed AGGREGATE counts, never as objects, wrappers or
 *   text lookups.
 *
 * WHERE THE TEXT IS - AND IS NOT
 *
 *   No type in this file has a field that can hold page text, a title, a
 *   heading, a URL or a host. Text travels only through R21's processing-only
 *   `DocumentTextLookup`, held in a module-private `WeakMap` in `devTrain.ts`.
 */
import type {
  A3DocumentSourceEntry,
  A3SlotExactDuplicateAggregates,
} from '../a3documents/types.js';
import type { A3CommittedGovernanceSnapshotV5 } from '../a3governanceV5/snapshotV5.js';
import type { A3DevTrainDurableEvidenceDeltaBatchV5 } from '../a3evidenceV5/types.js';

/**
 * R40 supports EXACTLY ONE split. A constant, never a parameter: assembling
 * DEV_CONFIRM or FINAL_HOLDOUT must not be a one-argument change.
 */
export const R40_DOCUMENT_SPLIT = 'DEV_TRAIN' as const;
export type R40DocumentSplit = typeof R40_DOCUMENT_SPLIT;

/**
 * One newly assembled V5 delta slot. Minted only by `devTrain.ts`, only from
 * one actual R39-minted `A3DurableAcquisitionEvidenceDeltaV5`, and branded by
 * a private `WeakSet` - a clone, a spread or a deserialised copy is not one.
 * It holds R21's own objects by reference; no text and no evidence row.
 */
export interface A3DevTrainSlotDocumentSourceAssemblyDeltaV5 {
  readonly kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V5';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R40DocumentSplit;
  /** Canonical `exactDuplicatePass` aggregates, exactly as R21 returned them. */
  readonly exactDuplicate: A3SlotExactDuplicateAggregates;
  /** R21's own entries, in canonical first-seen order. Provenance only; never a rank. */
  readonly documents: readonly A3DocumentSourceEntry[];
  readonly candidateObservationCount: number;
}

/**
 * The V5 delta document-source batch. Holds ONLY the newly assembled delta
 * slots - it is NOT a twenty-slot batch and never contains a historical slot.
 * The R39 batch it came from is reachable only through private provenance.
 */
export interface A3DevTrainDocumentSourceDeltaBatchV5 {
  readonly kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V5';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R40DocumentSplit;
  /** The ACTUAL V5 snapshot behind the R39 batch, by reference. */
  readonly governanceSnapshotV5: A3CommittedGovernanceSnapshotV5;
  readonly items: readonly A3DevTrainSlotDocumentSourceAssemblyDeltaV5[];
}

/**
 * The committed R34 + R37 aggregate history, closed against the fresh R39
 * continuity to one thirteen-slot document / downstream baseline. COUNTS
 * ONLY: no slot, document, digest or text of the historical thirteen exists
 * in this process.
 */
export interface HistoricalV5DocumentCoverageProof {
  readonly kind: 'HISTORICAL_V5_DOCUMENT_COVERAGE_PROOF';
  readonly r34HistoricalSlotsBeforeR34: number;
  readonly r34NewSlots: number;
  readonly documentSlotCount: number;
  readonly sourceRows: number;
  readonly slotLocalDocuments: number;
  readonly exactDuplicateGroups: number;
  readonly exactDuplicateRowsRemoved: number;
  readonly multiSourceDocuments: number;
  readonly candidateObservations: number;
  readonly r10Preparations: number;
  readonly r10SourceRows: number;
  readonly r10CandidateObservations: number;
  readonly r37ReadinessSlotCount: number;
  readonly freshR39UnchangedCount: number;
}

/**
 * Historical R34 aggregate + the minted R40 delta = coverage. COUNTS ONLY.
 * "Slot-local documents" is a SUM of per-slot distinct counts, never a count
 * of globally unique digests. Evidence and documents reach twenty; graph,
 * sample and readiness coverage stay at the historical thirteen.
 */
export interface A3DevTrainCanonicalDocumentSourceCoverageExpansionV5 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_DOCUMENT_SOURCE_COVERAGE_EXPANSION_V5';
  readonly historicalDocumentSlotCount: number;
  readonly deltaSlotCount: number;
  readonly coverageDocumentSlotCount: number;
  readonly v5DevTrainAuthorityCoverageCount: number;
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
  readonly historicalGraphCoverageCount: number;
  readonly historicalSampleCoverageCount: number;
  readonly historicalReadinessCoverageCount: number;
  readonly graphCoverageAfterR40: number;
  readonly sampleCoverageAfterR40: number;
  readonly readinessCoverageAfterR40: number;
}

/** Re-exported so callers name the upstream batch type through one module. */
export type { A3DevTrainDurableEvidenceDeltaBatchV5 };

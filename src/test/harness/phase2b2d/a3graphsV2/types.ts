/**
 * PHASE 2B-2D — A3 R28: THE INCREMENTAL SD7 GRAPH MEASUREMENT TYPES.
 *
 * ONE QUESTION R28 ANSWERS
 *
 *   What is the canonical SD7 near-duplicate graph for ONLY the newly
 *   assembled R27 DEV_TRAIN delta slot, using R22's exact pure graph
 *   measurement and R27's private text capability - while the five historical
 *   R22 graphs stay canonical prior coverage?
 *
 * R28 IS INCREMENTAL
 *
 *   R22 canonical history covers five slot graphs; R28 adds one. There is no
 *   six-slot graph batch anywhere in this namespace: the historical five enter
 *   only as committed AGGREGATE counts in the coverage expansion, never as
 *   objects, wrappers or re-measurements.
 *
 * THE GRAPH IS R22'S, UNCHANGED
 *
 *   `graph` on a minted delta graph is the exact
 *   `NearDuplicateGraphMeasurement` object R22's `measureUnboundSlotSd7Graph`
 *   returned - by reference, never copied, re-ordered or re-counted. R28 adds
 *   no near-duplicate semantics of its own.
 *
 * NOT A SURVIVOR, NOT A RANK
 *
 *   A graph is a RELATION over one organisation's documents. Nothing here
 *   keeps or drops a document, picks an edge endpoint, ranks, caps, resolves
 *   short text or evaluates SD9.
 *
 * NO TEXT
 *
 *   No type here has a field that can hold page text, a title, a heading, a
 *   URL or a host. Text reaches only the canonical shingler, through R27's
 *   private lookup, for the duration of one measurement call.
 */
import type {
  UnboundA3SlotSd7GraphPreparation,
  UnboundSlotSd7GraphInput,
} from '../a3graphs/types.js';
import type { measureUnboundSlotSd7Graph } from '../a3graphs/measure.js';
import type { A3CommittedGovernanceSnapshotV2 } from '../a3governanceV2/snapshotV2.js';
import type { A3DevTrainDocumentSourceDeltaBatchV2 } from '../a3documentsV2/types.js';
import { R27_DOCUMENT_SPLIT } from '../a3documentsV2/types.js';

/**
 * R28 supports EXACTLY ONE split - R27's. A constant, never a parameter:
 * measuring DEV_CONFIRM or FINAL_HOLDOUT must not be a one-argument change.
 */
export const R28_GRAPH_SPLIT = R27_DOCUMENT_SPLIT;
export type R28GraphSplit = typeof R28_GRAPH_SPLIT;

/** The processing-only text capability R22's measurement accepts. */
export type R28DocumentTextLookup = Parameters<typeof measureUnboundSlotSd7Graph>[1];

// ---------------------------------------------------------------------------
// A. THE PLAIN, UNBOUND DELTA REQUEST.
// ---------------------------------------------------------------------------

/**
 * ONE slot and ONE text lookup for it. There is no multi-slot document array
 * and no field that could carry a second organisation's documents: one
 * request is one organisation, and one canonical R22 call.
 */
export interface DeltaSlotGraphMeasurementRequest {
  readonly slot: UnboundSlotSd7GraphInput;
  readonly textLookup: R28DocumentTextLookup;
}

export type UnboundDeltaSlotGraph = UnboundA3SlotSd7GraphPreparation;

// ---------------------------------------------------------------------------
// B. THE MINTED DELTA GRAPH SHAPES.
// ---------------------------------------------------------------------------

/** One newly measured delta slot graph. Minted only from one actual R27 delta slot. */
export interface A3DevTrainSlotSd7GraphMeasurementDeltaV2 {
  readonly kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_DELTA_V2';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R28GraphSplit;
  /** R22's canonical graph, by reference, unchanged. */
  readonly graph: UnboundA3SlotSd7GraphPreparation['graph'];
}

/**
 * The delta graph batch. Holds ONLY newly measured delta graphs - it is NOT a
 * six-graph batch and never contains a historical R22 graph.
 */
export interface A3DevTrainSd7GraphDeltaBatchV2 {
  readonly kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V2';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R28GraphSplit;
  /** The ACTUAL V2 snapshot behind the R27 batch, by reference. */
  readonly governanceSnapshotV2: A3CommittedGovernanceSnapshotV2;
  /** The ACTUAL R27 delta batch this was measured from, by reference. */
  readonly documentSourceDeltaBatch: A3DevTrainDocumentSourceDeltaBatchV2;
  readonly items: readonly A3DevTrainSlotSd7GraphMeasurementDeltaV2[];
}

// ---------------------------------------------------------------------------
// C. COUNTS ONLY.
// ---------------------------------------------------------------------------

/** The committed R22 aggregate history the coverage expansion consumes. */
export interface R22HistoricalGraphBaseline {
  readonly slotGraphs: number;
  readonly documents: number;
  readonly measurableDocuments: number;
  readonly shortTextUnresolved: number;
  readonly comparedPairs: number;
  readonly nearDuplicateEdges: number;
  readonly documentsInAtLeastOneEdge: number;
}

/**
 * Historical R22 + newly measured delta. COUNTS ONLY, and every total is a
 * SUM OF PER-SLOT COUNTS: compared pairs are never a global n(n-1)/2, edges
 * are never cross-organisation, and documents in edges are never deduplicated
 * across organisations.
 */
export interface A3DevTrainCanonicalSd7GraphCoverageExpansionV2 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_SD7_GRAPH_COVERAGE_EXPANSION_V2';
  readonly historicalGraphSlots: number;
  readonly deltaGraphSlots: number;
  readonly coverageGraphSlots: number;
  readonly historicalDocuments: number;
  readonly deltaDocuments: number;
  readonly coverageDocuments: number;
  readonly historicalMeasurableDocuments: number;
  readonly deltaMeasurableDocuments: number;
  readonly coverageMeasurableDocuments: number;
  readonly historicalShortTextUnresolved: number;
  readonly deltaShortTextUnresolved: number;
  readonly coverageShortTextUnresolved: number;
  readonly historicalComparedPairs: number;
  readonly deltaComparedPairs: number;
  readonly coverageComparedPairs: number;
  readonly historicalNearDuplicateEdges: number;
  readonly deltaNearDuplicateEdges: number;
  readonly coverageNearDuplicateEdges: number;
  readonly historicalDocumentsInAtLeastOneEdge: number;
  readonly deltaDocumentsInAtLeastOneEdge: number;
  readonly coverageDocumentsInAtLeastOneEdge: number;
}

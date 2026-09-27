/**
 * PHASE 2B-2D — A3 R35: THE GOVERNANCE V4 INCREMENTAL SD7 GRAPH TYPES.
 *
 * ONE QUESTION R35 ANSWERS
 *
 *   What are the canonical SD7 near-duplicate graphs for ONLY the seven newly
 *   assembled R34 DEV_TRAIN delta slots, measured through R22's unchanged
 *   canonical graph path and R34's private document-text capabilities, while
 *   the six historical R22 / R28 graphs remain canonical prior coverage?
 *
 * R35 IS INCREMENTAL
 *
 *   R22 canonical history covers five slot graphs and R28 added a sixth; R35
 *   newly measures the V4 delta slots. There is no thirteen-slot graph batch
 *   anywhere in this namespace: the historical six enter only as committed
 *   AGGREGATE counts in the coverage expansion, never as objects, wrappers,
 *   text lookups or re-measurements.
 *
 * THE GRAPH IS R22'S, UNCHANGED
 *
 *   `graph` on a minted delta graph is the exact
 *   `NearDuplicateGraphMeasurement` object R22's `measureUnboundSlotSd7Graph`
 *   returned - by reference, never copied, re-ordered or re-counted. R35 adds
 *   no near-duplicate semantics of its own.
 *
 * NOT A SURVIVOR, NOT A RANK, NOT A SHORT-TEXT DECISION
 *
 *   A graph is a RELATION over one organisation's documents. Nothing here
 *   keeps or drops a document, picks an edge endpoint, computes a component,
 *   ranks, caps, resolves short text or evaluates SD9.
 *
 * NO TEXT
 *
 *   No type here has a field that can hold page text, a title, a heading, a
 *   URL or a host. Text reaches only the canonical shingler, through R34's
 *   private lookup, for the duration of one measurement call.
 */
import type {
  UnboundA3SlotSd7GraphPreparation,
  UnboundSlotSd7GraphInput,
} from '../a3graphs/types.js';
import type { measureUnboundSlotSd7Graph } from '../a3graphs/measure.js';
import type { A3CommittedGovernanceSnapshotV4 } from '../a3governanceV4/snapshotV4.js';
import type { A3DevTrainDocumentSourceDeltaBatchV4 } from '../a3documentsV4/types.js';
import { R34_DOCUMENT_SPLIT } from '../a3documentsV4/types.js';

/**
 * R35 supports EXACTLY ONE split - R34's. A constant, never a parameter:
 * measuring DEV_CONFIRM or FINAL_HOLDOUT must not be a one-argument change.
 */
export const R35_GRAPH_SPLIT = R34_DOCUMENT_SPLIT;
export type R35GraphSplit = typeof R35_GRAPH_SPLIT;

/** The processing-only text capability R22's measurement accepts. */
export type R35DocumentTextLookup = Parameters<typeof measureUnboundSlotSd7Graph>[1];

// ---------------------------------------------------------------------------
// A. THE PLAIN, UNBOUND DELTA REQUEST.
// ---------------------------------------------------------------------------

/**
 * ONE slot and ONE text lookup for it. There is no multi-slot document array
 * and no field that could carry a second organisation's documents: one
 * request is one organisation, and one canonical R22 call.
 */
export interface DeltaSlotGraphMeasurementRequestV4 {
  readonly slot: UnboundSlotSd7GraphInput;
  readonly textLookup: R35DocumentTextLookup;
}

export type UnboundDeltaSlotGraphV4 = UnboundA3SlotSd7GraphPreparation;

// ---------------------------------------------------------------------------
// B. THE MINTED DELTA GRAPH SHAPES.
// ---------------------------------------------------------------------------

/** One newly measured V4 delta slot graph. Minted only from one actual R34 delta slot. */
export interface A3DevTrainSlotSd7GraphMeasurementDeltaV4 {
  readonly kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_DELTA_V4';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R35GraphSplit;
  /** R22's canonical graph, by reference, unchanged. */
  readonly graph: UnboundA3SlotSd7GraphPreparation['graph'];
}

/**
 * The V4 delta graph batch. Holds ONLY newly measured delta graphs - it is NOT
 * a thirteen-graph batch and never contains a historical R22 or R28 graph.
 */
export interface A3DevTrainSd7GraphDeltaBatchV4 {
  readonly kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V4';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R35GraphSplit;
  /** The ACTUAL V4 snapshot behind the R34 batch, by reference. */
  readonly governanceSnapshotV4: A3CommittedGovernanceSnapshotV4;
  /** The ACTUAL R34 delta batch this was measured from, by reference. */
  readonly documentSourceDeltaBatch: A3DevTrainDocumentSourceDeltaBatchV4;
  readonly items: readonly A3DevTrainSlotSd7GraphMeasurementDeltaV4[];
}

// ---------------------------------------------------------------------------
// C. COUNTS ONLY.
// ---------------------------------------------------------------------------

/**
 * The committed R22 + R28 aggregate history, closed to one six-slot graph
 * baseline. COUNTS ONLY: no graph, document, digest or text of the historical
 * six exists in this process.
 */
export interface HistoricalGraphCoverageBaseline {
  readonly r22GraphSlots: number;
  readonly r28NewGraphSlots: number;
  readonly slotGraphs: number;
  readonly documents: number;
  readonly measurableDocuments: number;
  readonly shortTextUnresolved: number;
  readonly comparedPairs: number;
  readonly nearDuplicateEdges: number;
  readonly documentsInAtLeastOneEdge: number;
}

/**
 * Historical R22 + R28 + newly measured delta. COUNTS ONLY, and every total
 * is a SUM OF PER-SLOT COUNTS: compared pairs are never a global n(n-1)/2,
 * edges are never cross-organisation, and documents in edges are never
 * deduplicated across organisations.
 */
export interface A3DevTrainCanonicalSd7GraphCoverageExpansionV4 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_SD7_GRAPH_COVERAGE_EXPANSION_V4';
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

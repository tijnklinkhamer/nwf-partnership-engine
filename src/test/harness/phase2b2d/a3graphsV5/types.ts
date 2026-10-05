/**
 * PHASE 2B-2D — A3 R41: THE GOVERNANCE V5 INCREMENTAL SD7 GRAPH TYPES.
 *
 * ONE QUESTION R41 ANSWERS
 *
 *   What does unchanged canonical R22 SD7 graph measurement produce for ONLY
 *   the seven new Governance-V5 R40 document slots, while the thirteen
 *   historical R35 / R37 graph-and-downstream slots remain untouched and
 *   canonical?
 *
 * WHY A SIBLING OF R35 AND NOT A REUSE OF IT
 *
 *   R35's binder and adapter take R34's V4 document brands, and stay exactly
 *   that. R40's V5 slots carry R40's own brands and private text capability,
 *   so R41 owns its own V5 verification, adapter and mint. From R22 it takes
 *   only the pure `measureUnboundSlotSd7Graph` and `requireCanonicalGraphStructure`.
 *
 * R41 IS INCREMENTAL
 *
 *   R35 canonical history covers thirteen slot graphs (R22 5 + R28 1 + R35 7).
 *   R41 newly measures the seven V5 delta slots. There is no twenty-slot graph
 *   batch anywhere in this namespace: the historical thirteen enter only as
 *   committed AGGREGATE counts, never as objects, wrappers, text lookups or
 *   re-measurements.
 *
 * THE GRAPH IS R22'S, UNCHANGED
 *
 *   `graph` on a minted delta graph is the exact `NearDuplicateGraphMeasurement`
 *   R22 returned - by reference, never copied, re-ordered or re-counted.
 *
 * NOT A SURVIVOR, NOT A RANK, NOT A SHORT-TEXT DECISION
 *
 *   A graph is a RELATION over one organisation's documents. Nothing here
 *   keeps or drops a document, computes a component, ranks, caps, resolves
 *   short text or evaluates SD9.
 *
 * NO TEXT
 *
 *   No type here has a field that can hold page text, a title, a heading, a
 *   URL or a host. Text reaches only the canonical shingler, through R40's
 *   private lookup, for the duration of one measurement call.
 */
import type {
  UnboundA3SlotSd7GraphPreparation,
  UnboundSlotSd7GraphInput,
} from '../a3graphs/types.js';
import type { measureUnboundSlotSd7Graph } from '../a3graphs/measure.js';
import type { A3CommittedGovernanceSnapshotV5 } from '../a3governanceV5/snapshotV5.js';
import type { A3DevTrainDocumentSourceDeltaBatchV5 } from '../a3documentsV5/types.js';
import { R40_DOCUMENT_SPLIT } from '../a3documentsV5/types.js';

/**
 * R41 supports EXACTLY ONE split - R40's. A constant, never a parameter:
 * measuring DEV_CONFIRM or FINAL_HOLDOUT must not be a one-argument change.
 */
export const R41_GRAPH_SPLIT = R40_DOCUMENT_SPLIT;
export type R41GraphSplit = typeof R41_GRAPH_SPLIT;

/** The processing-only text capability R22's measurement accepts. */
export type R41DocumentTextLookup = Parameters<typeof measureUnboundSlotSd7Graph>[1];

// ---------------------------------------------------------------------------
// A. THE PLAIN, UNBOUND DELTA REQUEST.
// ---------------------------------------------------------------------------

/**
 * ONE slot and ONE text lookup for it. There is no multi-slot document array
 * and no field that could carry a second organisation's documents: one
 * request is one organisation, and one canonical R22 call.
 */
export interface DeltaSlotGraphMeasurementRequestV5 {
  readonly slot: UnboundSlotSd7GraphInput;
  readonly textLookup: R41DocumentTextLookup;
}

export type UnboundDeltaSlotGraphV5 = UnboundA3SlotSd7GraphPreparation;

/** Every unbound graph, and how many canonical R22 calls produced them. */
export interface UnboundDeltaGraphMeasurementV5 {
  readonly graphs: readonly UnboundDeltaSlotGraphV5[];
  readonly r22Calls: number;
}

// ---------------------------------------------------------------------------
// B. THE MINTED DELTA GRAPH SHAPES.
// ---------------------------------------------------------------------------

/** One newly measured V5 delta slot graph. Minted only from one actual R40 delta slot. */
export interface A3DevTrainSlotSd7GraphMeasurementDeltaV5 {
  readonly kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_DELTA_V5';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R41GraphSplit;
  /** R22's canonical graph, by reference, unchanged. */
  readonly graph: UnboundA3SlotSd7GraphPreparation['graph'];
}

/**
 * The V5 delta graph batch. Holds ONLY newly measured delta graphs - it is
 * NOT a twenty-graph batch and never contains a historical graph. The R40
 * batch it came from is reachable only through private provenance.
 */
export interface A3DevTrainSd7GraphDeltaBatchV5 {
  readonly kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V5';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R41GraphSplit;
  /** The ACTUAL V5 snapshot behind the R40 batch, by reference. */
  readonly governanceSnapshotV5: A3CommittedGovernanceSnapshotV5;
  readonly items: readonly A3DevTrainSlotSd7GraphMeasurementDeltaV5[];
}

// ---------------------------------------------------------------------------
// C. COUNTS ONLY.
// ---------------------------------------------------------------------------

/**
 * The committed R35 + R37 + R40 aggregate history, closed to one
 * thirteen-slot graph / downstream baseline and bound to one exact R40 batch.
 * COUNTS ONLY: no graph, document, digest or text of the historical thirteen
 * exists in this process.
 */
export interface HistoricalV5GraphCoverageProof {
  readonly kind: 'HISTORICAL_V5_GRAPH_COVERAGE_PROOF';
  readonly r35HistoricalGraphSlotsBeforeR35: number;
  readonly r35NewGraphSlots: number;
  readonly graphSlots: number;
  readonly documents: number;
  readonly measurableDocuments: number;
  readonly shortTextUnresolved: number;
  readonly comparedPairs: number;
  readonly nearDuplicateEdges: number;
  readonly documentsInAtLeastOneEdge: number;
  readonly r37ReadinessSlots: number;
  readonly r40HistoricalDocumentSlots: number;
  readonly r40HistoricalSlotLocalDocuments: number;
  readonly r40HistoricalGraphCoverage: number;
  readonly r40HistoricalSampleCoverage: number;
  readonly r40HistoricalReadinessCoverage: number;
}

/**
 * Historical R35 + newly measured delta. COUNTS ONLY, and every total is a
 * SUM OF PER-SLOT COUNTS: compared pairs are never a global n(n-1)/2, edges
 * are never cross-organisation, and documents in edges are never
 * deduplicated across organisations.
 */
export interface A3DevTrainCanonicalSd7GraphCoverageExpansionV5 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_SD7_GRAPH_COVERAGE_EXPANSION_V5';
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
  readonly documentSlotCoverage: number;
  readonly sampleCoverageAfterR41: number;
  readonly readinessCoverageAfterR41: number;
}

/** Re-exported so callers name the upstream batch type through one module. */
export type { A3DevTrainDocumentSourceDeltaBatchV5 };

/**
 * PHASE 2B-2D — A3 R29: THE INCREMENTAL SAMPLE SURVIVOR PREPARATION TYPES.
 *
 * ONE QUESTION R29 ANSWERS
 *
 *   What do the exact existing R23 SET_P and SET_R sample-preparation
 *   semantics produce for ONLY the newly measured R28 delta graph and its
 *   exact R27 document-source slot - while the five historical R23 sample
 *   preparations stay canonical prior history?
 *
 * R29 IS INCREMENTAL
 *
 *   R23 canonical history covers five slot preparations; R29 prepares one
 *   additional V2 delta slot. There is no six-slot sample batch anywhere in
 *   this namespace: the historical five enter only as committed AGGREGATE
 *   counts in the coverage expansion, never as objects, wrappers or
 *   re-preparations.
 *
 * THE PREPARATION IS R23'S, UNCHANGED
 *
 *   `setP`, `setR`, `setRDocumentCap` and `setRFreezeSlotReadiness` on a
 *   minted delta preparation are the exact objects R23's
 *   `prepareUnboundSlotSampleSurvivors` returned - by reference, never
 *   copied, re-ordered or re-counted. R29 adds no rank, survivor-walk, cap or
 *   readiness semantics of its own.
 *
 * NO SCORE, NO EDGE, NO TEXT IS COPIED
 *
 *   No type here has a field for a score, a rank value, a graph edge or page
 *   text. Scores stay inside R21's canonical R10 preparations (held by the
 *   R27 slot); edges stay inside R28's canonical graph. Both are reached only
 *   through provenance.
 */
import type {
  UnboundA3SlotSampleSurvivorPreparation,
  UnboundSlotSampleSurvivorInput,
} from '../a3samples/types.js';
import type { prepareUnboundSlotSampleSurvivors } from '../a3samples/prepare.js';
import type { A3CommittedGovernanceSnapshotV2 } from '../a3governanceV2/snapshotV2.js';
import type { A3DevTrainSd7GraphDeltaBatchV2 } from '../a3graphsV2/types.js';
import { R28_GRAPH_SPLIT } from '../a3graphsV2/types.js';

/**
 * R29 supports EXACTLY ONE split - R28's. A constant, never a parameter:
 * preparing DEV_CONFIRM or FINAL_HOLDOUT must not be a one-argument change.
 */
export const R29_SAMPLE_SPLIT = R28_GRAPH_SPLIT;
export type R29SampleSplit = typeof R29_SAMPLE_SPLIT;

/** The canonical graph shape R23's pure helper accepts. */
export type R29CanonicalGraph = Parameters<typeof prepareUnboundSlotSampleSurvivors>[1];

// ---------------------------------------------------------------------------
// A. THE PLAIN, UNBOUND DELTA REQUEST.
// ---------------------------------------------------------------------------

/**
 * ONE slot and ONE graph for it. There is no multi-slot document array, no
 * score list, no rank and no survivor set: one request is one organisation,
 * and one canonical R23 call.
 */
export interface DeltaSlotSamplePreparationRequest {
  readonly slot: UnboundSlotSampleSurvivorInput;
  readonly graph: R29CanonicalGraph;
}

export type UnboundDeltaSlotSamplePreparation = UnboundA3SlotSampleSurvivorPreparation;

// ---------------------------------------------------------------------------
// B. THE MINTED DELTA PREPARATION SHAPES.
// ---------------------------------------------------------------------------

/** One newly prepared delta slot. Minted only from one actual R28 delta graph. */
export interface A3DevTrainSlotSampleSurvivorPreparationDeltaV2 {
  readonly kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_DELTA_V2';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R29SampleSplit;
  /** R23's canonical SET_P preparation, by reference, unchanged. */
  readonly setP: UnboundA3SlotSampleSurvivorPreparation['setP'];
  /** R23's canonical SET_R preparation, by reference, unchanged. */
  readonly setR: UnboundA3SlotSampleSurvivorPreparation['setR'];
  /** R23's canonical SET_R cap, by reference, unchanged. */
  readonly setRDocumentCap: UnboundA3SlotSampleSurvivorPreparation['setRDocumentCap'];
  /** R23's canonical SET_R freeze-slot readiness, by reference, unchanged. */
  readonly setRFreezeSlotReadiness: UnboundA3SlotSampleSurvivorPreparation['setRFreezeSlotReadiness'];
}

/**
 * The delta sample batch. Holds ONLY newly prepared delta slots - it is NOT a
 * six-slot batch and never contains a historical R23 preparation.
 */
export interface A3DevTrainSampleSurvivorDeltaBatchV2 {
  readonly kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V2';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R29SampleSplit;
  /** The ACTUAL V2 snapshot behind the R28 batch, by reference. */
  readonly governanceSnapshotV2: A3CommittedGovernanceSnapshotV2;
  /** The ACTUAL R28 graph delta batch this was prepared from, by reference. */
  readonly graphDeltaBatch: A3DevTrainSd7GraphDeltaBatchV2;
  readonly items: readonly A3DevTrainSlotSampleSurvivorPreparationDeltaV2[];
}

// ---------------------------------------------------------------------------
// C. COUNTS ONLY.
// ---------------------------------------------------------------------------

/** One sample's aggregate counts, exactly as R23's census counts them. */
export interface SampleAggregateCounts {
  readonly preSd7RankEntryCount: number;
  readonly measurableDocumentCount: number;
  readonly measurableSurvivorCount: number;
  readonly measurableExclusionCount: number;
  readonly unresolvedShortTextOccurrenceCount: number;
  readonly initialCapExactSlotCount: number;
  readonly initialCapBlockedSlotCount: number;
  readonly exactCapDocumentCountAcrossExactSlots: number;
}

export interface SetRAggregateCounts extends SampleAggregateCounts {
  readonly fullRankExactSlotCount: number;
  readonly fullRankShortTextBlockedSlotCount: number;
}

export interface DivergenceAggregateCounts {
  readonly measurableDocumentCount: number;
  readonly survivingBothSamples: number;
  readonly survivingSetPOnly: number;
  readonly survivingSetROnly: number;
  readonly excludedInBothSamples: number;
}

/** The committed R23 aggregate history the coverage expansion consumes. */
export interface R23HistoricalSampleBaseline {
  readonly slotPreparations: number;
  readonly setP: SampleAggregateCounts;
  readonly setR: SetRAggregateCounts;
  readonly divergence: DivergenceAggregateCounts;
}

/** Aggregates derived from the minted R29 delta batch. */
export interface R29DeltaSampleAggregates {
  readonly slotPreparations: number;
  readonly setP: SampleAggregateCounts;
  readonly setR: SetRAggregateCounts;
  readonly divergence: DivergenceAggregateCounts;
  /** Single-edge, no-short-text delta slots whose two samples excluded the same endpoint. */
  readonly singleEdgeSlotsSameExcludedEndpoint: number;
  /** Single-edge, no-short-text delta slots whose two samples excluded opposite endpoints. */
  readonly singleEdgeSlotsOppositeExcludedEndpoints: number;
}

/**
 * Historical R23 + newly prepared delta. COUNTS ONLY: every total is a SUM
 * of per-slot counts, and no identity of any kind is carried.
 */
export interface A3DevTrainCanonicalSampleSurvivorCoverageExpansionV2 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_SAMPLE_SURVIVOR_COVERAGE_EXPANSION_V2';
  readonly historicalSlotPreparations: number;
  readonly deltaSlotPreparations: number;
  readonly coverageSlotPreparations: number;
  readonly historical: {
    readonly setP: SampleAggregateCounts;
    readonly setR: SetRAggregateCounts;
    readonly divergence: DivergenceAggregateCounts;
  };
  readonly delta: {
    readonly setP: SampleAggregateCounts;
    readonly setR: SetRAggregateCounts;
    readonly divergence: DivergenceAggregateCounts;
  };
  readonly coverage: {
    readonly setP: SampleAggregateCounts;
    readonly setR: SetRAggregateCounts;
    readonly divergence: DivergenceAggregateCounts;
  };
}

/**
 * PHASE 2B-2D — A3 R36: THE GOVERNANCE V4 INCREMENTAL SAMPLE SURVIVOR PREPARATION TYPES.
 *
 * ONE QUESTION R36 ANSWERS
 *
 *   What do the existing frozen SET_P and SET_R sample-specific ranks,
 *   canonical K3 greedy survivor walks, cap rules and SET_R readiness
 *   semantics produce for ONLY the seven newly measured R35 DEV_TRAIN graphs,
 *   while the six historical R23 / R29 preparations remain canonical prior
 *   coverage and all unresolved short-text membership remains unresolved?
 *
 * R36 IS INCREMENTAL
 *
 *   R23 canonical history covers five slot preparations and R29 added a
 *   sixth; R36 prepares the V4 delta slots. There is no thirteen-slot sample
 *   batch anywhere in this namespace: the historical six enter only as
 *   committed AGGREGATE counts in the coverage expansion, never as objects,
 *   wrappers or re-preparations.
 *
 * THE PREPARATION IS R23'S, UNCHANGED
 *
 *   `setP`, `setR`, `setRDocumentCap` and `setRFreezeSlotReadiness` on a
 *   minted delta preparation are the exact objects R23's
 *   `prepareUnboundSlotSampleSurvivors` returned - by reference, never
 *   copied, re-ordered or re-counted. R36 adds no rank, survivor-walk, cap or
 *   readiness semantics of its own.
 *
 * NO SCORE, NO EDGE, NO TEXT IS COPIED
 *
 *   No type here has a field for a score, a rank value, a graph edge or page
 *   text. Scores stay inside R21's canonical R10 preparations (held by the
 *   R34 slot); edges stay inside R35's canonical graph. Both are reached only
 *   through provenance.
 */
import type {
  UnboundA3SlotSampleSurvivorPreparation,
  UnboundSlotSampleSurvivorInput,
} from '../a3samples/types.js';
import type { prepareUnboundSlotSampleSurvivors } from '../a3samples/prepare.js';
import type { A3CommittedGovernanceSnapshotV4 } from '../a3governanceV4/snapshotV4.js';
import type { A3DevTrainSd7GraphDeltaBatchV4 } from '../a3graphsV4/types.js';
import { R35_GRAPH_SPLIT } from '../a3graphsV4/types.js';

/**
 * R36 supports EXACTLY ONE split - R35's. A constant, never a parameter:
 * preparing DEV_CONFIRM or FINAL_HOLDOUT must not be a one-argument change.
 */
export const R36_SAMPLE_SPLIT = R35_GRAPH_SPLIT;
export type R36SampleSplit = typeof R36_SAMPLE_SPLIT;

/** The canonical graph shape R23's pure helper accepts. */
export type R36CanonicalGraph = Parameters<typeof prepareUnboundSlotSampleSurvivors>[1];

/**
 * The canonical constants and tokens R23 prepares under, STATED for the
 * record. This namespace imports nothing from `a3prep/` or `sd7/`; the unit
 * suite proves every literal here equals the frozen canonical constant.
 */
export const R36_STATED_CANONICAL_SAMPLE_CONSTANTS = Object.freeze({
  setPMaxPagesPerOrganisation: 8,
  setRMaxPagesPerOrganisation: 4,
  k3SurvivorProcedure: 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK',
  k3SurvivorScope: 'SAMPLE_SPECIFIC',
  k3GraphScope: 'ONE_CANONICAL_GRAPH_PER_ORGANISATION',
  setPDocumentCapExact: 'SET_P_DOCUMENT_CAP_EXACT',
  setPDocumentCapBlockedShortTextSampleMembership:
    'SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP',
  setRDocumentCapExact: 'SET_R_DOCUMENT_CAP_EXACT',
  setRDocumentCapBlockedShortTextSampleMembership:
    'SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP',
  setRInitialCapExact: 'SET_R_INITIAL_CAP_EXACT',
  setRInitialCapBlockedShortTextMembership: 'SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP',
  setRFullSampleRankMembershipExact: 'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
  setRFullSampleRankMembershipBlockedShortText:
    'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT',
  sd7ShortTextSampleMembershipOpenIssue: 'SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP',
} as const);

// ---------------------------------------------------------------------------
// A. THE PLAIN, UNBOUND DELTA REQUEST.
// ---------------------------------------------------------------------------

/**
 * ONE slot and ONE graph for it. There is no multi-slot document array, no
 * score list, no rank, no survivor set and no cap membership: one request is
 * one organisation, and one canonical R23 call.
 */
export interface DeltaSlotSamplePreparationRequestV4 {
  readonly slot: UnboundSlotSampleSurvivorInput;
  readonly graph: R36CanonicalGraph;
}

export type UnboundDeltaSlotSamplePreparationV4 = UnboundA3SlotSampleSurvivorPreparation;

// ---------------------------------------------------------------------------
// B. THE MINTED DELTA PREPARATION SHAPES.
// ---------------------------------------------------------------------------

/** One newly prepared V4 delta slot. Minted only from one actual R35 delta graph. */
export interface A3DevTrainSlotSampleSurvivorPreparationDeltaV4 {
  readonly kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_DELTA_V4';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R36SampleSplit;
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
 * The V4 delta sample batch. Holds ONLY newly prepared delta slots - it is
 * NOT a thirteen-slot batch and never contains a historical R23 or R29
 * preparation.
 */
export interface A3DevTrainSampleSurvivorDeltaBatchV4 {
  readonly kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V4';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R36SampleSplit;
  /** The ACTUAL V4 snapshot behind the R35 batch, by reference. */
  readonly governanceSnapshotV4: A3CommittedGovernanceSnapshotV4;
  /** The ACTUAL R35 graph delta batch this was prepared from, by reference. */
  readonly graphDeltaBatch: A3DevTrainSd7GraphDeltaBatchV4;
  readonly items: readonly A3DevTrainSlotSampleSurvivorPreparationDeltaV4[];
}

// ---------------------------------------------------------------------------
// C. COUNTS ONLY.
// ---------------------------------------------------------------------------

/** One sample's aggregate counts, exactly as R23 / R29's censuses count them. */
export interface SampleAggregateCountsV4 {
  readonly preSd7RankEntryCount: number;
  readonly measurableDocumentCount: number;
  readonly measurableSurvivorCount: number;
  readonly measurableExclusionCount: number;
  readonly unresolvedShortTextOccurrenceCount: number;
  readonly initialCapExactSlotCount: number;
  readonly initialCapBlockedSlotCount: number;
  readonly exactCapDocumentCountAcrossExactSlots: number;
}

export interface SetRAggregateCountsV4 extends SampleAggregateCountsV4 {
  readonly fullRankExactSlotCount: number;
  readonly fullRankShortTextBlockedSlotCount: number;
}

export interface DivergenceAggregateCountsV4 {
  readonly measurableDocumentCount: number;
  readonly survivingBothSamples: number;
  readonly survivingSetPOnly: number;
  readonly survivingSetROnly: number;
  readonly excludedInBothSamples: number;
}

/**
 * The committed R23 + R29 aggregate history, closed to one six-slot sample
 * baseline. COUNTS ONLY: no rank, survivor, exclusion or cap member of the
 * historical six exists in this process.
 */
export interface HistoricalSamplePreparationBaselineV4 {
  readonly r23SlotPreparations: number;
  readonly r29NewSlotPreparations: number;
  readonly slotPreparations: number;
  readonly setP: SampleAggregateCountsV4;
  readonly setR: SetRAggregateCountsV4;
  readonly divergence: DivergenceAggregateCountsV4;
}

/** Aggregates derived from the minted R36 delta batch. */
export interface R36DeltaSampleAggregates {
  readonly slotPreparations: number;
  readonly setP: SampleAggregateCountsV4;
  readonly setR: SetRAggregateCountsV4;
  readonly divergence: DivergenceAggregateCountsV4;
  /** Delta slots with exactly one edge and no short text. */
  readonly singleEdgeNoShortTextSlots: number;
  /** ...of which the two samples excluded the same endpoint. */
  readonly singleEdgeSlotsSameExcludedEndpoint: number;
  /** ...of which the two samples excluded opposite endpoints. */
  readonly singleEdgeSlotsOppositeExcludedEndpoints: number;
}

/**
 * Historical R23 + R29 + newly prepared delta. COUNTS ONLY: every total is a
 * SUM of per-slot counts, and no identity of any kind is carried.
 */
export interface A3DevTrainCanonicalSampleSurvivorCoverageExpansionV4 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_SAMPLE_SURVIVOR_COVERAGE_EXPANSION_V4';
  readonly historicalSlotPreparations: number;
  readonly deltaSlotPreparations: number;
  readonly coverageSlotPreparations: number;
  readonly historical: {
    readonly setP: SampleAggregateCountsV4;
    readonly setR: SetRAggregateCountsV4;
    readonly divergence: DivergenceAggregateCountsV4;
  };
  readonly delta: {
    readonly setP: SampleAggregateCountsV4;
    readonly setR: SetRAggregateCountsV4;
    readonly divergence: DivergenceAggregateCountsV4;
  };
  readonly coverage: {
    readonly setP: SampleAggregateCountsV4;
    readonly setR: SetRAggregateCountsV4;
    readonly divergence: DivergenceAggregateCountsV4;
  };
}

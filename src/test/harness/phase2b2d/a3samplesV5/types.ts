/**
 * PHASE 2B-2D — A3 R42: THE GOVERNANCE V5 INCREMENTAL SAMPLE SURVIVOR PREPARATION TYPES.
 *
 * ONE QUESTION R42 ANSWERS
 *
 *   What do the unchanged canonical R23 SET_P / SET_R ranks, sample-specific
 *   K3 survivor walks, cap rules and SET_R readiness semantics produce for
 *   ONLY the seven new Governance-V5 R41 graphs, while the thirteen historical
 *   R36 / R37 sample-and-readiness slots remain untouched and canonical?
 *
 * WHY A SIBLING OF R36 AND NOT A REUSE OF IT
 *
 *   R36's binder takes R35's V4 graph brands, and stays exactly that. R41's V5
 *   graphs carry R41's own brands and R40 slot provenance, so R42 owns its own
 *   V5 verification and mint. From R23 it takes only the pure
 *   `prepareUnboundSlotSampleSurvivors` and `sampleSurvivorDivergence`.
 *
 * R42 IS INCREMENTAL
 *
 *   R36 canonical history covers thirteen slot preparations (R23 5 + R29 1 +
 *   R36 7). R42 prepares the seven V5 delta slots. There is no twenty-slot
 *   sample batch anywhere in this namespace: the historical thirteen enter
 *   only as committed AGGREGATE counts, never as objects, wrappers or
 *   re-preparations.
 *
 * THE PREPARATION IS R23'S, UNCHANGED
 *
 *   `setP`, `setR`, `setRDocumentCap` and `setRFreezeSlotReadiness` on a
 *   minted delta preparation are the exact objects R23's
 *   `prepareUnboundSlotSampleSurvivors` returned - by reference, never
 *   copied, re-ordered or re-counted. R42 adds no rank, survivor-walk, cap or
 *   readiness semantics of its own.
 *
 * NO SCORE, NO EDGE, NO TEXT IS COPIED
 *
 *   No type here has a field for a score, a rank value, a graph edge or page
 *   text. Scores stay inside R21's canonical R10 preparations (held by the R40
 *   slot); edges stay inside R41's canonical graph. Both are reached only
 *   through provenance.
 */
import type {
  UnboundA3SlotSampleSurvivorPreparation,
  UnboundSlotSampleSurvivorInput,
} from '../a3samples/types.js';
import type { prepareUnboundSlotSampleSurvivors } from '../a3samples/prepare.js';
import type { A3CommittedGovernanceSnapshotV5 } from '../a3governanceV5/snapshotV5.js';
import type { A3DevTrainSd7GraphDeltaBatchV5 } from '../a3graphsV5/types.js';
import { R41_GRAPH_SPLIT } from '../a3graphsV5/types.js';

/**
 * R42 supports EXACTLY ONE split - R41's. A constant, never a parameter:
 * preparing DEV_CONFIRM or FINAL_HOLDOUT must not be a one-argument change.
 */
export const R42_SAMPLE_SPLIT = R41_GRAPH_SPLIT;
export type R42SampleSplit = typeof R42_SAMPLE_SPLIT;

/** The canonical graph shape R23's pure helper accepts. */
export type R42CanonicalGraph = Parameters<typeof prepareUnboundSlotSampleSurvivors>[1];

/**
 * The canonical constants and tokens R23 prepares under, STATED for the
 * record. This namespace imports nothing from `a3prep/` or `sd7/`; the unit
 * suite proves every literal here equals the frozen canonical constant.
 */
export const R42_STATED_CANONICAL_SAMPLE_CONSTANTS = Object.freeze({
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
export interface DeltaSlotSamplePreparationRequestV5 {
  readonly slot: UnboundSlotSampleSurvivorInput;
  readonly graph: R42CanonicalGraph;
}

export type UnboundDeltaSlotSamplePreparationV5 = UnboundA3SlotSampleSurvivorPreparation;

/** Every unbound preparation, and how many canonical R23 calls produced them. */
export interface UnboundDeltaSamplePreparationV5 {
  readonly preparations: readonly UnboundDeltaSlotSamplePreparationV5[];
  readonly r23Calls: number;
}

// ---------------------------------------------------------------------------
// B. THE MINTED DELTA PREPARATION SHAPES.
// ---------------------------------------------------------------------------

/** One newly prepared V5 delta slot. Minted only from one actual R41 delta graph. */
export interface A3DevTrainSlotSampleSurvivorPreparationDeltaV5 {
  readonly kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_DELTA_V5';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R42SampleSplit;
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
 * The V5 delta sample batch. Holds ONLY newly prepared delta slots - it is
 * NOT a twenty-slot batch and never contains a historical R23, R29 or R36
 * preparation. The R41 batch it came from is reachable only through private
 * provenance.
 */
export interface A3DevTrainSampleSurvivorDeltaBatchV5 {
  readonly kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V5';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R42SampleSplit;
  /** The ACTUAL V5 snapshot behind the R41 batch, by reference. */
  readonly governanceSnapshotV5: A3CommittedGovernanceSnapshotV5;
  readonly items: readonly A3DevTrainSlotSampleSurvivorPreparationDeltaV5[];
}

// ---------------------------------------------------------------------------
// C. COUNTS ONLY.
// ---------------------------------------------------------------------------

/** One sample's aggregate counts, exactly as R23 / R29 / R36's censuses count them. */
export interface SampleAggregateCountsV5 {
  readonly preSd7RankEntryCount: number;
  readonly measurableDocumentCount: number;
  readonly measurableSurvivorCount: number;
  readonly measurableExclusionCount: number;
  readonly unresolvedShortTextOccurrenceCount: number;
  readonly initialCapExactSlotCount: number;
  readonly initialCapBlockedSlotCount: number;
  readonly exactCapDocumentCountAcrossExactSlots: number;
}

export interface SetRAggregateCountsV5 extends SampleAggregateCountsV5 {
  readonly fullRankExactSlotCount: number;
  readonly fullRankShortTextBlockedSlotCount: number;
}

export interface DivergenceAggregateCountsV5 {
  readonly measurableDocumentCount: number;
  readonly survivingBothSamples: number;
  readonly survivingSetPOnly: number;
  readonly survivingSetROnly: number;
  readonly excludedInBothSamples: number;
}

/**
 * The committed R36 + R37 + R41 aggregate history, closed to one
 * thirteen-slot sample baseline and bound to one exact R41 batch. COUNTS
 * ONLY: no rank, survivor, exclusion or cap member of the historical thirteen
 * exists in this process.
 */
export interface HistoricalV5SamplePreparationCoverageProof {
  readonly kind: 'HISTORICAL_V5_SAMPLE_PREPARATION_COVERAGE_PROOF';
  readonly r36HistoricalSlotPreparationsBeforeR36: number;
  readonly r36NewSlotPreparations: number;
  readonly slotPreparations: number;
  readonly r37ReadinessSlots: number;
  readonly r41HistoricalSampleCoverage: number;
  readonly r41HistoricalReadinessCoverage: number;
  readonly setP: SampleAggregateCountsV5;
  readonly setR: SetRAggregateCountsV5;
  readonly divergence: DivergenceAggregateCountsV5;
}

/** Aggregates derived from the minted R42 delta batch. */
export interface R42DeltaSampleAggregates {
  readonly slotPreparations: number;
  readonly setP: SampleAggregateCountsV5;
  readonly setR: SetRAggregateCountsV5;
  readonly divergence: DivergenceAggregateCountsV5;
  /** Delta slots with exactly one edge and no short text. */
  readonly singleEdgeNoShortTextSlots: number;
  /** ...of which the two samples excluded the same endpoint. */
  readonly singleEdgeSlotsSameExcludedEndpoint: number;
  /** ...of which the two samples excluded opposite endpoints. */
  readonly singleEdgeSlotsOppositeExcludedEndpoints: number;
}

/**
 * Historical R36 + newly prepared delta. COUNTS ONLY: every total is a SUM
 * of per-slot counts, and no identity of any kind is carried.
 */
export interface A3DevTrainCanonicalSampleSurvivorCoverageExpansionV5 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_SAMPLE_SURVIVOR_COVERAGE_EXPANSION_V5';
  readonly historicalSlotPreparations: number;
  readonly deltaSlotPreparations: number;
  readonly coverageSlotPreparations: number;
  readonly historical: {
    readonly setP: SampleAggregateCountsV5;
    readonly setR: SetRAggregateCountsV5;
    readonly divergence: DivergenceAggregateCountsV5;
  };
  readonly delta: {
    readonly setP: SampleAggregateCountsV5;
    readonly setR: SetRAggregateCountsV5;
    readonly divergence: DivergenceAggregateCountsV5;
  };
  readonly coverage: {
    readonly setP: SampleAggregateCountsV5;
    readonly setR: SetRAggregateCountsV5;
    readonly divergence: DivergenceAggregateCountsV5;
  };
  readonly graphCoverageAfterR42: number;
  readonly sampleCoverageAfterR42: number;
  readonly readinessCoverageAfterR42: number;
}

/** Re-exported so callers name the upstream batch type through one module. */
export type { A3DevTrainSd7GraphDeltaBatchV5 };

/**
 * PHASE 2B-2D — A3 R30: THE INCREMENTAL REACHABLE-MEMBERSHIP / SD9 READINESS TYPES.
 *
 * ONE QUESTION R30 ANSWERS
 *
 *   What does the exact existing R24 owner-bound reachable-membership and
 *   mechanical SD9 logic produce for ONLY the newly prepared R29 delta slot,
 *   while the five historical R24 readiness states stay canonical prior
 *   history?
 *
 * R30 IS INCREMENTAL
 *
 *   R24 canonical history covers five slot readiness states; R30 derives one
 *   additional V2 delta slot readiness. There is no six-slot readiness batch
 *   anywhere in this namespace: the historical five enter only as committed
 *   AGGREGATE counts in the coverage expansion, never as objects, wrappers or
 *   re-derivations.
 *
 * THE READINESS IS R24'S, UNCHANGED
 *
 *   Every readiness, membership and SD9 field on a minted delta readiness is
 *   the exact object R24's `deriveUnboundSlotReachableMembershipReadiness`
 *   returned - by reference, never copied, re-derived or re-classified. An
 *   EXACT membership's `documents` IS the canonical R29 cap array; SET_R
 *   freeze-slot readiness IS R29's stored object. R30 adds no membership,
 *   readiness or SD9 semantics of its own.
 *
 * SD9 HERE IS A3 MECHANICAL READINESS ONLY. It does not rewrite an A2
 * acquisition status, create a replacement obligation, consume a reserve,
 * change a ledger, authorise acquisition or adjudicate anything in A2.
 *
 * NO DOCUMENT IDENTITY IS COPIED. Membership objects hold canonical documents
 * internally; no R30 field repeats their identities, and nothing serialises
 * them.
 */
import type {
  A3MechanicalSd9Readiness,
  A3ReachableMembership,
  UnboundA3SlotReachableMembershipReadiness,
} from '../a3readiness/types.js';
import type { A3CommittedGovernanceSnapshotV2 } from '../a3governanceV2/snapshotV2.js';
import type {
  A3DevTrainSampleSurvivorDeltaBatchV2,
  A3DevTrainSlotSampleSurvivorPreparationDeltaV2,
} from '../a3samplesV2/types.js';
import { R29_SAMPLE_SPLIT } from '../a3samplesV2/types.js';

/**
 * R30 supports EXACTLY ONE split - R29's. A constant, never a parameter:
 * deriving DEV_CONFIRM or FINAL_HOLDOUT readiness must not be a one-argument
 * change.
 */
export const R30_READINESS_SPLIT = R29_SAMPLE_SPLIT;
export type R30ReadinessSplit = typeof R30_READINESS_SPLIT;

/** What R24's pure helper returns for one R29-shaped preparation. Not authority. */
export type UnboundDeltaSlotReadiness = UnboundA3SlotReachableMembershipReadiness;

/** The R29 preparation fields R24's pure helper reads. A minted R29 preparation satisfies it. */
export type DeltaSlotReadinessInput = Pick<
  A3DevTrainSlotSampleSurvivorPreparationDeltaV2,
  'selectionIndex' | 'split' | 'setP' | 'setR' | 'setRDocumentCap' | 'setRFreezeSlotReadiness'
>;

// ---------------------------------------------------------------------------
// A. THE MINTED DELTA READINESS SHAPES.
// ---------------------------------------------------------------------------

/** One newly derived delta slot readiness. Minted only from one actual R29 delta preparation. */
export interface A3DevTrainSlotReachableMembershipSd9DeltaV2 {
  readonly kind: 'A3_DEV_TRAIN_SLOT_REACHABLE_MEMBERSHIP_SD9_DELTA_V2';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R30ReadinessSplit;
  /** R24's canonical SET_P freeze-slot readiness, by reference. */
  readonly setPFreezeSlotReadiness: UnboundDeltaSlotReadiness['setPFreezeSlotReadiness'];
  /** R29's stored SET_R freeze-slot readiness, by reference. Never re-derived. */
  readonly setRFreezeSlotReadiness: UnboundDeltaSlotReadiness['setRFreezeSlotReadiness'];
  readonly setPReachableMembership: A3ReachableMembership<'SET_P'>;
  readonly setRReachableMembership: A3ReachableMembership<'SET_R'>;
  readonly setPSd9: A3MechanicalSd9Readiness<'SET_P'>;
  readonly setRSd9: A3MechanicalSd9Readiness<'SET_R'>;
}

/**
 * The delta readiness batch. Holds ONLY newly derived delta readiness - it is
 * NOT a six-slot batch and never contains a historical R24 readiness.
 */
export interface A3DevTrainReachableMembershipSd9DeltaBatchV2 {
  readonly kind: 'A3_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_DELTA_BATCH_V2';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R30ReadinessSplit;
  /** The ACTUAL V2 snapshot behind the R29 batch, by reference. */
  readonly governanceSnapshotV2: A3CommittedGovernanceSnapshotV2;
  /** The ACTUAL R29 sample delta batch this was derived from, by reference. */
  readonly sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV2;
  readonly items: readonly A3DevTrainSlotReachableMembershipSd9DeltaV2[];
}

// ---------------------------------------------------------------------------
// B. COUNTS ONLY.
// ---------------------------------------------------------------------------

/** One sample's readiness aggregate, exactly as R24's census counts it. */
export interface ReadinessSampleAggregate {
  readonly reachableMembershipExactSlotCount: number;
  readonly reachableMembershipBlockedSlotCount: number;
  readonly reachableMembershipDocumentCountAcrossExactSlots: number;
  readonly fullRankExactSlotCount: number;
  readonly fullRankShortTextBlockedSlotCount: number;
  readonly fullRankBlockedWhileReachableMembershipExactSlotCount: number;
  readonly measurableSurvivorCount: number;
  readonly unresolvedShortTextOccurrenceCount: number;
  readonly sd9MinEnvelopeTotal: number;
  readonly sd9MaxEnvelopeTotal: number;
  readonly sd9MechanicalSuccessfulSlotCount: number;
  readonly sd9MechanicalUnsuccessfulSlotCount: number;
  readonly sd9MechanicalPendingSlotCount: number;
}

export interface CrossSampleSd9Aggregate {
  readonly bothSamplesMechanicallySuccessfulSlotCount: number;
  readonly sd9StatusDisagreementSlotCount: number;
}

/** The committed R24 aggregate history the coverage expansion consumes. */
export interface R24HistoricalReadinessBaseline {
  readonly slotReadinessCount: number;
  readonly setP: ReadinessSampleAggregate;
  readonly setR: ReadinessSampleAggregate;
  readonly crossSample: CrossSampleSd9Aggregate;
}

/** Aggregates derived from the minted R30 delta batch. */
export interface R30DeltaReadinessAggregates {
  readonly slotReadinessCount: number;
  readonly setP: ReadinessSampleAggregate;
  readonly setR: ReadinessSampleAggregate;
  readonly crossSample: CrossSampleSd9Aggregate;
}

/**
 * Historical R24 + newly derived delta. COUNTS ONLY: every total is a SUM of
 * per-slot counts, and no identity of any kind is carried.
 */
export interface A3DevTrainCanonicalReachableMembershipSd9CoverageExpansionV2 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_REACHABLE_MEMBERSHIP_SD9_COVERAGE_EXPANSION_V2';
  readonly historicalReadinessSlotCount: number;
  readonly deltaReadinessSlotCount: number;
  readonly coverageReadinessSlotCount: number;
  readonly historical: {
    readonly setP: ReadinessSampleAggregate;
    readonly setR: ReadinessSampleAggregate;
    readonly crossSample: CrossSampleSd9Aggregate;
  };
  readonly delta: {
    readonly setP: ReadinessSampleAggregate;
    readonly setR: ReadinessSampleAggregate;
    readonly crossSample: CrossSampleSd9Aggregate;
  };
  readonly coverage: {
    readonly setP: ReadinessSampleAggregate;
    readonly setR: ReadinessSampleAggregate;
    readonly crossSample: CrossSampleSd9Aggregate;
  };
}

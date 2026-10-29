/**
 * PHASE 2B-2D — A3 R37: THE GOVERNANCE V4 INCREMENTAL REACHABLE-MEMBERSHIP / SD9 READINESS TYPES.
 *
 * ONE QUESTION R37 ANSWERS
 *
 *   What does the exact existing R24 owner-bound reachable-membership and
 *   mechanical SD9 logic produce for ONLY the newly prepared R36 Governance V4
 *   DEV_TRAIN slots, while the six historical R24 / R30 readiness states
 *   remain canonical prior coverage?
 *
 * R37 IS INCREMENTAL
 *
 *   R24 canonical history covers five slot readiness states and R30 added a
 *   sixth; R37 derives the V4 delta slots. There is no thirteen-slot readiness
 *   batch anywhere in this namespace: the historical six enter only as
 *   committed AGGREGATE counts in the coverage expansion, never as objects,
 *   wrappers or re-derivations.
 *
 * THE READINESS IS R24'S, UNCHANGED
 *
 *   Every readiness, membership and SD9 field on a minted delta readiness is
 *   the exact object R24's `deriveUnboundSlotReachableMembershipReadiness`
 *   returned - by reference, never copied, re-derived or re-classified. An
 *   EXACT membership's `documents` IS the canonical R36 cap array; SET_R
 *   freeze-slot readiness IS R36's stored object. R37 adds no membership,
 *   readiness or SD9 semantics of its own.
 *
 * SD9 HERE IS A3 MECHANICAL READINESS ONLY. It does not rewrite an A2
 * acquisition status, create a replacement obligation, consume a reserve,
 * change a ledger, authorise acquisition or adjudicate anything in A2.
 *
 * NO DOCUMENT IDENTITY IS COPIED. Membership objects hold canonical documents
 * internally; no R37 field repeats their identities, and nothing serialises
 * them.
 */
import type {
  A3MechanicalSd9Readiness,
  A3ReachableMembership,
  UnboundA3SlotReachableMembershipReadiness,
} from '../a3readiness/types.js';
import type { A3CommittedGovernanceSnapshotV4 } from '../a3governanceV4/snapshotV4.js';
import type {
  A3DevTrainSampleSurvivorDeltaBatchV4,
  A3DevTrainSlotSampleSurvivorPreparationDeltaV4,
} from '../a3samplesV4/types.js';
import { R36_SAMPLE_SPLIT } from '../a3samplesV4/types.js';

/**
 * R37 supports EXACTLY ONE split - R36's. A constant, never a parameter:
 * deriving DEV_CONFIRM or FINAL_HOLDOUT readiness must not be a one-argument
 * change.
 */
export const R37_READINESS_SPLIT = R36_SAMPLE_SPLIT;
export type R37ReadinessSplit = typeof R37_READINESS_SPLIT;

/**
 * The Generation-1 owner clarification R24 binds, STATED for the postcondition
 * and the census. Not a new policy object: R24 binds the canonical one, and
 * the unit suite proves these equal its tokens.
 */
export const R37_STATED_REACHABLE_MEMBERSHIP_POLICY = Object.freeze({
  decisionToken: 'SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1',
  generation: 'METHODOLOGY_V2_GEN1',
  requiredMembershipScope: 'REACHABLE_SELECTED_CAPPED_MEMBERSHIP',
  zeroExtensionHeadroomScope:
    'ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP',
  unreachableTailFreezeEffect: 'DOES_NOT_REFUSE_FREEZE_BY_ITSELF',
} as const);

/**
 * The canonical constants and tokens R24's helper derives under, STATED for
 * the record. This namespace imports nothing from `a3prep/`; the unit suite
 * proves every literal here equals the frozen canonical constant. Nothing
 * here implements a semantic: the tokens are read back off R24's own result.
 */
export const R37_STATED_CANONICAL_READINESS_CONSTANTS = Object.freeze({
  setPMaxPagesPerOrganisation: 8,
  setRMaxPagesPerOrganisation: 4,
  sd9MinPagesPerOrganisation: 4,
  reachableMembershipDecisionToken: R37_STATED_REACHABLE_MEMBERSHIP_POLICY.decisionToken,
  generation: R37_STATED_REACHABLE_MEMBERSHIP_POLICY.generation,
  requiredMembershipScope: R37_STATED_REACHABLE_MEMBERSHIP_POLICY.requiredMembershipScope,
  zeroExtensionHeadroomScope: R37_STATED_REACHABLE_MEMBERSHIP_POLICY.zeroExtensionHeadroomScope,
  unreachableTailFreezeEffect: R37_STATED_REACHABLE_MEMBERSHIP_POLICY.unreachableTailFreezeEffect,
  sd9EnvelopeFormula:
    'MIN_EQUALS_MEASURABLE_SURVIVORS__MAX_EQUALS_MEASURABLE_SURVIVORS_PLUS_UNRESOLVED_SHORT_TEXT',
  sd9Semantics: 'A3_MECHANICAL_SD9_OF_CANONICAL_SURVIVOR_ENVELOPE_ONLY_NOT_A2_ACQUISITION_STATUS',
  setPFullSampleRankMembershipExact: 'FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
  setRFullSampleRankMembershipExact: 'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
  sd9Successful: 'ACQUISITION_SUCCESSFUL',
  sd9Unsuccessful: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
  sd9Pending: 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL',
} as const);

/** What R24's pure helper returns for one R36-shaped preparation. Not authority. */
export type UnboundDeltaSlotReadinessV4 = UnboundA3SlotReachableMembershipReadiness;

/** The R36 preparation fields R24's pure helper reads. A minted R36 preparation satisfies it. */
export type DeltaSlotReadinessInputV4 = Pick<
  A3DevTrainSlotSampleSurvivorPreparationDeltaV4,
  'selectionIndex' | 'split' | 'setP' | 'setR' | 'setRDocumentCap' | 'setRFreezeSlotReadiness'
>;

// ---------------------------------------------------------------------------
// A. THE MINTED DELTA READINESS SHAPES.
// ---------------------------------------------------------------------------

/** One newly derived V4 delta slot readiness. Minted only from one actual R36 preparation. */
export interface A3DevTrainSlotReachableMembershipSd9DeltaV4 {
  readonly kind: 'A3_DEV_TRAIN_SLOT_REACHABLE_MEMBERSHIP_SD9_DELTA_V4';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R37ReadinessSplit;
  /** R24's canonical SET_P freeze-slot readiness, by reference. */
  readonly setPFreezeSlotReadiness: UnboundDeltaSlotReadinessV4['setPFreezeSlotReadiness'];
  /** R36's stored SET_R freeze-slot readiness, by reference. Never re-derived. */
  readonly setRFreezeSlotReadiness: UnboundDeltaSlotReadinessV4['setRFreezeSlotReadiness'];
  readonly setPReachableMembership: A3ReachableMembership<'SET_P'>;
  readonly setRReachableMembership: A3ReachableMembership<'SET_R'>;
  readonly setPSd9: A3MechanicalSd9Readiness<'SET_P'>;
  readonly setRSd9: A3MechanicalSd9Readiness<'SET_R'>;
}

/**
 * The V4 delta readiness batch. Holds ONLY newly derived delta readiness - it
 * is NOT a thirteen-slot batch and never contains a historical R24 or R30
 * readiness.
 */
export interface A3DevTrainReachableMembershipSd9DeltaBatchV4 {
  readonly kind: 'A3_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_DELTA_BATCH_V4';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R37ReadinessSplit;
  /** The ACTUAL V4 snapshot behind the R36 batch, by reference. */
  readonly governanceSnapshotV4: A3CommittedGovernanceSnapshotV4;
  /** The ACTUAL R36 sample delta batch this was derived from, by reference. */
  readonly sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV4;
  readonly items: readonly A3DevTrainSlotReachableMembershipSd9DeltaV4[];
}

// ---------------------------------------------------------------------------
// B. COUNTS ONLY.
// ---------------------------------------------------------------------------

/** One sample's readiness aggregate, exactly as R24's and R30's censuses count it. */
export interface ReadinessSampleAggregateV4 {
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

export interface CrossSampleSd9AggregateV4 {
  readonly bothSamplesMechanicallySuccessfulSlotCount: number;
  readonly sd9StatusDisagreementSlotCount: number;
}

/**
 * The committed R24 + R30 aggregate history, closed to one six-slot readiness
 * baseline. COUNTS ONLY: no historical readiness, membership or SD9 object
 * exists in this process.
 */
export interface HistoricalReadinessBaselineV4 {
  readonly r24SlotReadinessCount: number;
  readonly r30NewSlotReadinessCount: number;
  readonly slotReadinessCount: number;
  readonly setP: ReadinessSampleAggregateV4;
  readonly setR: ReadinessSampleAggregateV4;
  readonly crossSample: CrossSampleSd9AggregateV4;
}

/** Aggregates derived from R24's per-slot readiness for the delta. */
export interface R37DeltaReadinessAggregates {
  readonly slotReadinessCount: number;
  readonly setP: ReadinessSampleAggregateV4;
  readonly setR: ReadinessSampleAggregateV4;
  readonly crossSample: CrossSampleSd9AggregateV4;
}

/**
 * Historical R24 + R30 + newly derived delta. COUNTS ONLY: every total is a
 * SUM of per-slot counts, and no identity of any kind is carried.
 */
export interface A3DevTrainCanonicalReachableMembershipSd9CoverageExpansionV4 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_REACHABLE_MEMBERSHIP_SD9_COVERAGE_EXPANSION_V4';
  readonly historicalReadinessSlotCount: number;
  readonly deltaReadinessSlotCount: number;
  readonly coverageReadinessSlotCount: number;
  readonly historical: {
    readonly setP: ReadinessSampleAggregateV4;
    readonly setR: ReadinessSampleAggregateV4;
    readonly crossSample: CrossSampleSd9AggregateV4;
  };
  readonly delta: {
    readonly setP: ReadinessSampleAggregateV4;
    readonly setR: ReadinessSampleAggregateV4;
    readonly crossSample: CrossSampleSd9AggregateV4;
  };
  readonly coverage: {
    readonly setP: ReadinessSampleAggregateV4;
    readonly setR: ReadinessSampleAggregateV4;
    readonly crossSample: CrossSampleSd9AggregateV4;
  };
}

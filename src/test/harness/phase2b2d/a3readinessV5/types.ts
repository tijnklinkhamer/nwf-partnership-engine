/**
 * PHASE 2B-2D — A3 R43: THE GOVERNANCE V5 INCREMENTAL REACHABLE-MEMBERSHIP / SD9 READINESS TYPES.
 *
 * ONE QUESTION R43 ANSWERS
 *
 *   What do unchanged canonical R24 reachable-membership and mechanical-SD9
 *   semantics produce for ONLY the seven new Governance-V5 R42 sample
 *   preparations, while the thirteen historical R37 readiness slots remain
 *   untouched and canonical?
 *
 * WHY A SIBLING OF R37 AND NOT A REUSE OF IT
 *
 *   R37's binder takes R36's V4 sample brands, and stays exactly that. R42's V5
 *   preparations carry R42's own brands and R41 graph provenance, so R43 owns
 *   its own V5 verification and mint. From R24 it takes only the pure
 *   `deriveUnboundSlotReachableMembershipReadiness` and its result tokens.
 *
 * R43 IS INCREMENTAL
 *
 *   R37 canonical history covers thirteen slot readiness states (R24 5 + R30 1
 *   + R37 7). R43 derives the seven V5 delta slots. There is no twenty-slot
 *   readiness batch anywhere in this namespace: the historical thirteen enter
 *   only as committed AGGREGATE counts, never as objects, wrappers or
 *   re-derivations.
 *
 * THE METHODOLOGY GENERATION IS NOT THE ACQUISITION GENERATION
 *
 *   Governance V5 is cross-generation ACQUISITION governance: it says which
 *   organisation occupies a slot and under which acquisition generation it
 *   was fetched. The A3 corpus / sampling methodology R23 and R24 implement is
 *   the frozen Methodology-V2 / Generation-1 methodology. R24's owner-policy
 *   binding therefore stays `METHODOLOGY_V2_GEN1` for every slot here, and
 *   nothing in this namespace reads an acquisition or resolution generation to
 *   choose a membership policy.
 *
 * THE READINESS IS R24'S, UNCHANGED
 *
 *   Every readiness, membership and SD9 field on a minted delta readiness is
 *   the exact object R24 returned - by reference, never copied, re-derived or
 *   re-classified. An EXACT membership's `documents` IS the canonical R42 cap
 *   array; SET_R freeze-slot readiness IS R42's stored object.
 *
 * SD9 HERE IS A3 MECHANICAL READINESS ONLY. It does not rewrite an A2
 * acquisition status, create a replacement obligation, consume a reserve,
 * change a ledger, authorise acquisition or adjudicate anything in A2.
 *
 * NO DOCUMENT IDENTITY IS COPIED. Membership objects hold canonical documents
 * internally; no R43 field repeats their identities, and nothing serialises
 * them.
 */
import type {
  A3MechanicalSd9Readiness,
  A3ReachableMembership,
  UnboundA3SlotReachableMembershipReadiness,
} from '../a3readiness/types.js';
import type { A3CommittedGovernanceSnapshotV5 } from '../a3governanceV5/snapshotV5.js';
import type {
  A3DevTrainSampleSurvivorDeltaBatchV5,
  A3DevTrainSlotSampleSurvivorPreparationDeltaV5,
} from '../a3samplesV5/types.js';
import { R42_SAMPLE_SPLIT } from '../a3samplesV5/types.js';

/**
 * R43 supports EXACTLY ONE split - R42's. A constant, never a parameter:
 * deriving DEV_CONFIRM or FINAL_HOLDOUT readiness must not be a one-argument
 * change.
 */
export const R43_READINESS_SPLIT = R42_SAMPLE_SPLIT;
export type R43ReadinessSplit = typeof R43_READINESS_SPLIT;

/**
 * The Generation-1 owner clarification R24 binds, STATED for the postcondition
 * and the census. Not a new policy object: R24 binds the canonical one, and
 * the unit suite proves these equal its tokens. `generation` is the frozen A3
 * METHODOLOGY generation - never a slot's acquisition generation.
 */
export const R43_STATED_REACHABLE_MEMBERSHIP_POLICY = Object.freeze({
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
export const R43_STATED_CANONICAL_READINESS_CONSTANTS = Object.freeze({
  setPMaxPagesPerOrganisation: 8,
  setRMaxPagesPerOrganisation: 4,
  sd9MinPagesPerOrganisation: 4,
  reachableMembershipDecisionToken: R43_STATED_REACHABLE_MEMBERSHIP_POLICY.decisionToken,
  generation: R43_STATED_REACHABLE_MEMBERSHIP_POLICY.generation,
  requiredMembershipScope: R43_STATED_REACHABLE_MEMBERSHIP_POLICY.requiredMembershipScope,
  zeroExtensionHeadroomScope: R43_STATED_REACHABLE_MEMBERSHIP_POLICY.zeroExtensionHeadroomScope,
  unreachableTailFreezeEffect: R43_STATED_REACHABLE_MEMBERSHIP_POLICY.unreachableTailFreezeEffect,
  sd9EnvelopeFormula:
    'MIN_EQUALS_MEASURABLE_SURVIVORS__MAX_EQUALS_MEASURABLE_SURVIVORS_PLUS_UNRESOLVED_SHORT_TEXT',
  sd9Semantics: 'A3_MECHANICAL_SD9_OF_CANONICAL_SURVIVOR_ENVELOPE_ONLY_NOT_A2_ACQUISITION_STATUS',
  setPFullSampleRankMembershipExact: 'FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
  setRFullSampleRankMembershipExact: 'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
  sd9Successful: 'ACQUISITION_SUCCESSFUL',
  sd9Unsuccessful: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
  sd9Pending: 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL',
} as const);

/** What R24's pure helper returns for one R42 preparation. Not authority. */
export type UnboundDeltaSlotReadinessV5 = UnboundA3SlotReachableMembershipReadiness;

/** The R42 preparation fields R24's pure helper reads. A minted R42 preparation satisfies it. */
export type DeltaSlotReadinessInputV5 = Pick<
  A3DevTrainSlotSampleSurvivorPreparationDeltaV5,
  'selectionIndex' | 'split' | 'setP' | 'setR' | 'setRDocumentCap' | 'setRFreezeSlotReadiness'
>;

/** Every unbound readiness, and how many canonical R24 calls produced them. */
export interface UnboundDeltaReadinessV5 {
  readonly readiness: readonly UnboundDeltaSlotReadinessV5[];
  readonly r24Calls: number;
}

// ---------------------------------------------------------------------------
// A. THE MINTED DELTA READINESS SHAPES.
// ---------------------------------------------------------------------------

/** One newly derived V5 delta slot readiness. Minted only from one actual R42 preparation. */
export interface A3DevTrainSlotReachableMembershipSd9DeltaV5 {
  readonly kind: 'A3_DEV_TRAIN_SLOT_REACHABLE_MEMBERSHIP_SD9_DELTA_V5';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R43ReadinessSplit;
  /** R24's canonical SET_P freeze-slot readiness, by reference. */
  readonly setPFreezeSlotReadiness: UnboundDeltaSlotReadinessV5['setPFreezeSlotReadiness'];
  /** R42's stored SET_R freeze-slot readiness, by reference. Never re-derived. */
  readonly setRFreezeSlotReadiness: UnboundDeltaSlotReadinessV5['setRFreezeSlotReadiness'];
  readonly setPReachableMembership: A3ReachableMembership<'SET_P'>;
  readonly setRReachableMembership: A3ReachableMembership<'SET_R'>;
  readonly setPSd9: A3MechanicalSd9Readiness<'SET_P'>;
  readonly setRSd9: A3MechanicalSd9Readiness<'SET_R'>;
}

/**
 * The V5 delta readiness batch. Holds ONLY newly derived delta readiness - it
 * is NOT a twenty-slot batch and never contains a historical R24, R30 or R37
 * readiness. The R42 batch it came from is reachable only through private
 * provenance.
 */
export interface A3DevTrainReachableMembershipSd9DeltaBatchV5 {
  readonly kind: 'A3_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_DELTA_BATCH_V5';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R43ReadinessSplit;
  /** The ACTUAL V5 snapshot behind the R42 batch, by reference. */
  readonly governanceSnapshotV5: A3CommittedGovernanceSnapshotV5;
  readonly items: readonly A3DevTrainSlotReachableMembershipSd9DeltaV5[];
}

// ---------------------------------------------------------------------------
// B. COUNTS ONLY.
// ---------------------------------------------------------------------------

/** One sample's readiness aggregate, exactly as R24's, R30's and R37's censuses count it. */
export interface ReadinessSampleAggregateV5 {
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

export interface CrossSampleSd9AggregateV5 {
  readonly bothSamplesMechanicallySuccessfulSlotCount: number;
  readonly sd9StatusDisagreementSlotCount: number;
}

/**
 * The committed R37 + R42 aggregate history, closed to one thirteen-slot
 * readiness baseline and bound to one exact R42 batch. COUNTS ONLY: no
 * historical readiness, membership or SD9 object exists in this process.
 */
export interface HistoricalV5ReadinessCoverageProof {
  readonly kind: 'HISTORICAL_V5_READINESS_COVERAGE_PROOF';
  readonly r37HistoricalReadinessSlotsBeforeR37: number;
  readonly r37NewReadinessSlots: number;
  readonly slotReadinessCount: number;
  readonly r42HistoricalSampleCoverage: number;
  readonly r42HistoricalReadinessCoverage: number;
  readonly setP: ReadinessSampleAggregateV5;
  readonly setR: ReadinessSampleAggregateV5;
  readonly crossSample: CrossSampleSd9AggregateV5;
}

/** Aggregates derived from R24's per-slot readiness for the delta. */
export interface R43DeltaReadinessAggregates {
  readonly slotReadinessCount: number;
  readonly setP: ReadinessSampleAggregateV5;
  readonly setR: ReadinessSampleAggregateV5;
  readonly crossSample: CrossSampleSd9AggregateV5;
}

/**
 * Historical R37 + newly derived delta. COUNTS ONLY: every total is a SUM of
 * per-slot counts, and no identity of any kind is carried.
 */
export interface A3DevTrainCanonicalReachableMembershipSd9CoverageExpansionV5 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_REACHABLE_MEMBERSHIP_SD9_COVERAGE_EXPANSION_V5';
  readonly historicalReadinessSlotCount: number;
  readonly deltaReadinessSlotCount: number;
  readonly coverageReadinessSlotCount: number;
  readonly historical: {
    readonly setP: ReadinessSampleAggregateV5;
    readonly setR: ReadinessSampleAggregateV5;
    readonly crossSample: CrossSampleSd9AggregateV5;
  };
  readonly delta: {
    readonly setP: ReadinessSampleAggregateV5;
    readonly setR: ReadinessSampleAggregateV5;
    readonly crossSample: CrossSampleSd9AggregateV5;
  };
  readonly coverage: {
    readonly setP: ReadinessSampleAggregateV5;
    readonly setR: ReadinessSampleAggregateV5;
    readonly crossSample: CrossSampleSd9AggregateV5;
  };
  readonly sampleCoverageAfterR43: number;
  readonly readinessCoverageAfterR43: number;
}

/** Re-exported so callers name the upstream batch type through one module. */
export type { A3DevTrainSampleSurvivorDeltaBatchV5 };

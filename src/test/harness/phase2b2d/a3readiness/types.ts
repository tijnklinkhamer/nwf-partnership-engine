/**
 * PHASE 2B-2D — A3 R24: REACHABLE INITIAL-CAP MEMBERSHIP AND MECHANICAL SD9 READINESS TYPES.
 *
 * TWO QUESTIONS, KEPT APART
 *
 *   1. REACHABLE MEMBERSHIP. Under the Generation-1 owner clarification
 *      `SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1`
 *      the required sample membership is `REACHABLE_SELECTED_CAPPED_MEMBERSHIP`,
 *      and with zero extension headroom the selected cap IS the complete
 *      reachable membership. So for one R23-minted slot and one sample: an
 *      EXACT canonical initial cap's documents are that membership, by
 *      reference; a BLOCKED canonical cap gives a BLOCKED membership with no
 *      document list at all.
 *
 *   2. MECHANICAL SD9. One canonical `deriveSd9BoundsUnderShortTextPolicy`
 *      envelope per sample, from that sample's measurable-survivor count and
 *      unresolved short-text count. Never from a cap size: a cap is a SELECTED
 *      SAMPLE, not the admissible post-SD7 page count.
 *
 *   A slot may be EXACT on (1) while its full rank is short-text BLOCKED, and
 *   (2) is evaluated whether (1) is EXACT or BLOCKED. Neither axis is derived
 *   from the other.
 *
 * SD9 HERE IS MECHANICAL ONLY
 *
 *   `ACQUISITION_SUCCESSFUL`, `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET` and
 *   `ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL` are the frozen SD9
 *   vocabulary, and in R24 they mean ONLY "mechanical classification of the
 *   supplied canonical A3 survivor-count envelope". They do not rewrite an A2
 *   acquisition-of-record, adjudicate an A2 run, create a reserve obligation
 *   or a replacement reason, consume a reserve or alter an A2 ledger.
 *
 * THE TWO LEVELS
 *
 *   `UnboundA3SlotReachableMembershipReadiness` is what the PURE helper in
 *   `membership.ts` returns for any R23-shaped preparation. It is not
 *   authority. `A3DevTrainSlotReachableMembershipReadinessV1` and
 *   `A3DevTrainReachableMembershipSd9BatchV1` are minted ONLY by
 *   `devTrain.ts`, from an actual R23 mint, and branded by private `WeakSet`s.
 *
 * DOCUMENTS STAY INTERNAL. An EXACT membership holds the canonical cap
 * document objects so a later in-process selection can use them; nothing in
 * this namespace serialises or logs one.
 */
import type {
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
  SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY,
} from '../a3prep/contracts.js';
import type {
  A3SetPFreezeSlotReadiness,
  A3Sd9ShortTextPolicyBounds,
} from '../a3prep/corpusFreezePreflight.js';
import type { SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED } from '../a3prep/sd7.js';
import type { A3SetPMeasurableSurvivorRankedDocument } from '../a3prep/setPSd7.js';
import type { A3SetRMeasurableSurvivorRankedDocument } from '../a3prep/setRSd7.js';
import type { A3SetRFreezeSlotReadiness } from '../a3prep/setRSd7Readiness.js';
import type { A3CommittedGovernanceSnapshot } from '../a3governance/snapshot.js';
import type { R20EvidenceSplitV1 } from '../a3evidence/types.js';

export type A3ReadinessSample = 'SET_P' | 'SET_R';

export const REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT = 'REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT';
export const REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED = 'REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED';

/** What an R24 SD9 status means, carried on every SD9 result. */
export const R24_SD9_SEMANTICS =
  'A3_MECHANICAL_SD9_OF_CANONICAL_SURVIVOR_ENVELOPE_ONLY_NOT_A2_ACQUISITION_STATUS';

// ---------------------------------------------------------------------------
// A. THE OWNER-POLICY BINDING.
// ---------------------------------------------------------------------------

/**
 * The owner-bound policy, by reference, plus the exact tokens R24 relies on.
 * The object IS `SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY`; the tokens are
 * restated so a reader need not chase it.
 */
export interface A3ReachableMembershipPolicyBinding {
  readonly policy: typeof SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY;
  readonly decisionToken: 'SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1';
  readonly generation: 'METHODOLOGY_V2_GEN1';
  readonly requiredMembershipScope: 'REACHABLE_SELECTED_CAPPED_MEMBERSHIP';
  readonly zeroExtensionHeadroomScope: 'ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP';
  readonly unreachableTailFreezeEffect: 'DOES_NOT_REFUSE_FREEZE_BY_ITSELF';
}

// ---------------------------------------------------------------------------
// B. REACHABLE MEMBERSHIP: A DISCRIMINATED UNION.
// ---------------------------------------------------------------------------

type CapSizeOf<S extends A3ReadinessSample> = S extends 'SET_P'
  ? typeof SET_P_MAX_PAGES_PER_ORGANISATION
  : typeof SET_R_MAX_PAGES_PER_ORGANISATION;

type DocumentOf<S extends A3ReadinessSample> = S extends 'SET_P'
  ? A3SetPMeasurableSurvivorRankedDocument
  : A3SetRMeasurableSurvivorRankedDocument;

/**
 * The canonical exact cap IS the complete Generation-1 reachable selected
 * membership. `documents` is the canonical cap's own array, by reference:
 * never copied, re-ranked or sliced here.
 */
export interface A3ReachableMembershipExact<S extends A3ReadinessSample> {
  readonly status: typeof REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT;
  readonly sample: S;
  readonly canonicalCapSize: CapSizeOf<S>;
  readonly documentCount: number;
  readonly documents: readonly DocumentOf<S>[];
  readonly ownerPolicy: A3ReachableMembershipPolicyBinding;
}

/**
 * The canonical cap is blocked by unresolved short-text membership, so the
 * reachable membership is BLOCKED. There is deliberately NO document list
 * here, under any name, optional or otherwise.
 */
export interface A3ReachableMembershipBlocked<S extends A3ReadinessSample> {
  readonly status: typeof REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED;
  readonly sample: S;
  readonly canonicalCapSize: CapSizeOf<S>;
  readonly openIssue: typeof SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED;
  readonly ownerPolicy: A3ReachableMembershipPolicyBinding;
}

export type A3ReachableMembership<S extends A3ReadinessSample> =
  A3ReachableMembershipExact<S> | A3ReachableMembershipBlocked<S>;

// ---------------------------------------------------------------------------
// C. MECHANICAL SD9.
// ---------------------------------------------------------------------------

/** One sample's canonical envelope, by reference, and what it may be read as. */
export interface A3MechanicalSd9Readiness<S extends A3ReadinessSample> {
  readonly sample: S;
  readonly semantics: typeof R24_SD9_SEMANTICS;
  /** Exactly what `deriveSd9BoundsUnderShortTextPolicy` returned. */
  readonly canonical: A3Sd9ShortTextPolicyBounds;
}

// ---------------------------------------------------------------------------
// D. THE SLOT AND BATCH SHAPES.
// ---------------------------------------------------------------------------

interface A3SlotReachableMembershipReadinessBody {
  readonly selectionIndex: number;
  readonly split: R20EvidenceSplitV1;
  /** Canonical `deriveSetPFreezeSlotReadiness(...)`, called once, by reference. */
  readonly setPFreezeSlotReadiness: A3SetPFreezeSlotReadiness;
  /** R23's stored `setRFreezeSlotReadiness`, by reference. Never re-derived. */
  readonly setRFreezeSlotReadiness: A3SetRFreezeSlotReadiness;
  readonly setPReachableMembership: A3ReachableMembership<'SET_P'>;
  readonly setRReachableMembership: A3ReachableMembership<'SET_R'>;
  readonly setPSd9: A3MechanicalSd9Readiness<'SET_P'>;
  readonly setRSd9: A3MechanicalSd9Readiness<'SET_R'>;
}

/** Level A. Not authority. */
export interface UnboundA3SlotReachableMembershipReadiness extends A3SlotReachableMembershipReadinessBody {
  readonly kind: 'UNBOUND_A3_SLOT_REACHABLE_MEMBERSHIP_READINESS';
}

/** Level B, one slot. Minted only from one actual R23-minted slot preparation. */
export interface A3DevTrainSlotReachableMembershipReadinessV1 extends A3SlotReachableMembershipReadinessBody {
  readonly kind: 'A3_DEV_TRAIN_SLOT_REACHABLE_MEMBERSHIP_READINESS_V1';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
}

/** Level B, the split. Minted only from an actual R23-minted sample survivor batch. */
export interface A3DevTrainReachableMembershipSd9BatchV1 {
  readonly kind: 'A3_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_BATCH_V1';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R20EvidenceSplitV1;
  readonly governanceSnapshot: A3CommittedGovernanceSnapshot;
  readonly items: readonly A3DevTrainSlotReachableMembershipReadinessV1[];
}

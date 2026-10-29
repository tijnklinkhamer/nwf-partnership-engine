/**
 * PHASE 2B-2D — A3 R37: THE V4 DELTA PATH AROUND R24'S PURE READINESS HELPER.
 *
 * DO NOT DERIVE A MEMBERSHIP, A READINESS OR AN SD9 STATUS AGAIN
 *
 *   R24's `deriveUnboundSlotReachableMembershipReadiness` owns every
 *   readiness semantic: the owner-policy binding, canonical SET_P freeze-slot
 *   readiness, use-by-reference of the stored SET_R readiness, exact
 *   reachable cap membership, BLOCKED membership, zero-extension-headroom
 *   semantics, the canonical SD9 survivor envelope and its classification,
 *   and every structural consistency check. This file calls it - exactly once
 *   per preparation, with the genuine R36 preparation object itself - and
 *   never slices a cap, re-derives a readiness, builds an envelope or
 *   classifies a status. It has no other route to SD9.
 *
 * THE POSTCONDITIONS ARE IDENTITY CHECKS, NOT DECISIONS
 *
 *   After R24 returns, R37 checks only that the canonical result IS the R36
 *   preparation's own objects and tokens:
 *
 *     - same selection slot and split;
 *     - SET_R freeze-slot readiness is R36's stored object, by identity;
 *     - an EXACT membership's `documents` is the canonical cap's own array,
 *       by identity, and a BLOCKED membership has no document list, for a
 *       cap that has none;
 *     - both memberships carry the one owner policy with its exact
 *       Generation-1 tokens;
 *     - both SD9 results carry the exact R24 semantics token and one of the
 *       three frozen mechanical statuses, and the canonical envelope is
 *       `[survivors, survivors + unresolved]` as the R36 counts state them -
 *       never a cap size.
 *
 *   None of these selects, counts or classifies anything.
 *
 * ALL OR NOTHING
 *
 *   Every preparation is derived before any result is returned. A refusal on
 *   the last preparation returns nothing for the earlier ones.
 *
 * THE AGGREGATION IS COUNTING ONLY
 *
 *   `aggregateDeltaReadinessV4` sums what R24 returned, per sample, exactly as
 *   R24's and R30's censuses count it: exact / blocked reachable membership,
 *   documents across exact memberships, full-rank exact / short-text-blocked
 *   (read from the readiness R24 returned - never inferred from a cap), the
 *   envelope bounds and the three mechanical statuses. SET_P and SET_R are
 *   counted independently; a slot's two statuses are compared, never
 *   equalised.
 *
 * THIS MODULE IS PURE. No socket, database, filesystem, clock, randomness or
 * environment read. It mutates no input. Its outputs are UNBOUND - not
 * authority - so synthetic preparations exercise the delta path without
 * minting.
 */
import { deriveUnboundSlotReachableMembershipReadiness } from '../a3readiness/membership.js';
import {
  REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED,
  REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT,
  R24_SD9_SEMANTICS,
  type A3MechanicalSd9Readiness,
  type A3ReachableMembership,
  type A3ReadinessSample,
} from '../a3readiness/types.js';
import { refuseV4Readiness } from './refusal.js';
import {
  R37_STATED_CANONICAL_READINESS_CONSTANTS as C,
  R37_STATED_REACHABLE_MEMBERSHIP_POLICY,
  type DeltaSlotReadinessInputV4,
  type R37DeltaReadinessAggregates,
  type ReadinessSampleAggregateV4,
  type UnboundDeltaSlotReadinessV4,
} from './types.js';

interface CanonicalCapView {
  readonly documents?: unknown;
}

interface SampleCountsView {
  readonly sd7Preparation: {
    readonly counts: {
      readonly measurableSurvivorCount: number;
      readonly shortTextUnresolvedCount: number;
    };
  };
}

const MECHANICAL_SD9_STATUSES: ReadonlySet<string> = new Set([
  C.sd9Successful,
  C.sd9Unsuccessful,
  C.sd9Pending,
]);

function requireMembershipByReference<S extends A3ReadinessSample>(
  sample: S,
  membership: A3ReachableMembership<S>,
  cap: CanonicalCapView,
  position: number,
): void {
  const capHasDocuments = Object.prototype.hasOwnProperty.call(cap, 'documents');
  if (membership.sample !== sample) {
    refuseV4Readiness(
      'R37_DELTA_READINESS_NOT_BY_REFERENCE',
      `${sample} membership at position ${position} names another sample`,
    );
  }
  if (membership.status === REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT) {
    // The canonical cap's own array: never copied, re-ranked or sliced.
    if (
      !capHasDocuments ||
      membership.documents !== cap.documents ||
      membership.documentCount !== membership.documents.length
    ) {
      refuseV4Readiness(
        'R37_DELTA_READINESS_NOT_BY_REFERENCE',
        `${sample} exact membership at position ${position} is not the canonical cap array`,
      );
    }
    return;
  }
  if (
    membership.status !== REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED ||
    capHasDocuments ||
    Object.prototype.hasOwnProperty.call(membership, 'documents')
  ) {
    refuseV4Readiness(
      'R37_DELTA_READINESS_NOT_BY_REFERENCE',
      `${sample} blocked membership at position ${position} does not match a blocked canonical cap`,
    );
  }
}

function requireOwnerPolicy(unbound: UnboundDeltaSlotReadinessV4, position: number): void {
  const p = unbound.setPReachableMembership.ownerPolicy;
  const r = unbound.setRReachableMembership.ownerPolicy;
  const stated = R37_STATED_REACHABLE_MEMBERSHIP_POLICY;
  const matches = (binding: typeof p): boolean =>
    binding.decisionToken === stated.decisionToken &&
    binding.generation === stated.generation &&
    binding.requiredMembershipScope === stated.requiredMembershipScope &&
    binding.zeroExtensionHeadroomScope === stated.zeroExtensionHeadroomScope &&
    binding.unreachableTailFreezeEffect === stated.unreachableTailFreezeEffect;
  if (p.policy !== r.policy || !matches(p) || !matches(r)) {
    refuseV4Readiness(
      'R37_OWNER_POLICY_BINDING_MISMATCH',
      `the readiness at position ${position} is not bound to the Generation-1 owner policy`,
    );
  }
}

function requireSd9Postcondition<S extends A3ReadinessSample>(
  sample: S,
  sd9: A3MechanicalSd9Readiness<S>,
  preparation: SampleCountsView,
  position: number,
): void {
  const counts = preparation.sd7Preparation.counts;
  if (
    sd9.sample !== sample ||
    sd9.semantics !== R24_SD9_SEMANTICS ||
    !MECHANICAL_SD9_STATUSES.has(sd9.canonical.status)
  ) {
    refuseV4Readiness(
      'R37_SD9_SEMANTICS_MISMATCH',
      `${sample} SD9 at position ${position} does not carry the R24 mechanical semantics`,
    );
  }
  if (
    sd9.canonical.minCount !== counts.measurableSurvivorCount ||
    sd9.canonical.maxCount !== counts.measurableSurvivorCount + counts.shortTextUnresolvedCount
  ) {
    refuseV4Readiness(
      'R37_DELTA_READINESS_NOT_BY_REFERENCE',
      `${sample} SD9 envelope at position ${position} does not describe its R36 preparation`,
    );
  }
}

function requireReadinessDescribesPreparation(
  preparation: DeltaSlotReadinessInputV4,
  unbound: UnboundDeltaSlotReadinessV4,
  position: number,
): void {
  if (
    unbound.selectionIndex !== preparation.selectionIndex ||
    unbound.split !== preparation.split ||
    // §15: R24 keeps SET_R readiness by reference; R37 preserves that.
    unbound.setRFreezeSlotReadiness !== preparation.setRFreezeSlotReadiness
  ) {
    refuseV4Readiness(
      'R37_DELTA_READINESS_NOT_BY_REFERENCE',
      `the readiness at position ${position} does not keep its R36 preparation's slot and SET_R readiness`,
    );
  }
  requireMembershipByReference(
    'SET_P',
    unbound.setPReachableMembership,
    preparation.setP.documentCap as CanonicalCapView,
    position,
  );
  requireMembershipByReference(
    'SET_R',
    unbound.setRReachableMembership,
    preparation.setRDocumentCap as CanonicalCapView,
    position,
  );
  requireOwnerPolicy(unbound, position);
  requireSd9Postcondition('SET_P', unbound.setPSd9, preparation.setP, position);
  requireSd9Postcondition('SET_R', unbound.setRSd9, preparation.setR, position);
}

/**
 * Every preparation through R24's `deriveUnboundSlotReachableMembershipReadiness`
 * exactly once, in order, before anything is returned. Callers mint only from
 * this result.
 */
export function deriveDeltaSlotReadinessAllOrNothingV4(
  preparations: readonly DeltaSlotReadinessInputV4[],
): readonly UnboundDeltaSlotReadinessV4[] {
  const derived: UnboundDeltaSlotReadinessV4[] = [];
  preparations.forEach((preparation, position) => {
    const unbound = deriveUnboundSlotReachableMembershipReadiness(preparation);
    requireReadinessDescribesPreparation(preparation, unbound, position);
    derived.push(unbound);
  });
  return Object.freeze(derived);
}

// ---------------------------------------------------------------------------
// AGGREGATION: COUNTING WHAT R24 RETURNED.
// ---------------------------------------------------------------------------

/** The R24 readiness fields the aggregation reads. Unbound and minted readiness satisfy it. */
export type ReadinessCountInputV4 = Pick<
  UnboundDeltaSlotReadinessV4,
  | 'setPFreezeSlotReadiness'
  | 'setRFreezeSlotReadiness'
  | 'setPReachableMembership'
  | 'setRReachableMembership'
  | 'setPSd9'
  | 'setRSd9'
>;

type MutableAggregate = { -readonly [K in keyof ReadinessSampleAggregateV4]: number };

export function emptyReadinessAggregateV4(): MutableAggregate {
  return {
    reachableMembershipExactSlotCount: 0,
    reachableMembershipBlockedSlotCount: 0,
    reachableMembershipDocumentCountAcrossExactSlots: 0,
    fullRankExactSlotCount: 0,
    fullRankShortTextBlockedSlotCount: 0,
    fullRankBlockedWhileReachableMembershipExactSlotCount: 0,
    measurableSurvivorCount: 0,
    unresolvedShortTextOccurrenceCount: 0,
    sd9MinEnvelopeTotal: 0,
    sd9MaxEnvelopeTotal: 0,
    sd9MechanicalSuccessfulSlotCount: 0,
    sd9MechanicalUnsuccessfulSlotCount: 0,
    sd9MechanicalPendingSlotCount: 0,
  };
}

/** One slot, one sample, counted exactly as R24's census counts it. */
function accumulate(
  into: MutableAggregate,
  membership: A3ReachableMembership<'SET_P'> | A3ReachableMembership<'SET_R'>,
  fullRankExact: boolean,
  readiness: {
    readonly measurableSurvivorCount: number;
    readonly shortTextUnresolvedCount: number;
  },
  sd9: A3MechanicalSd9Readiness<'SET_P'> | A3MechanicalSd9Readiness<'SET_R'>,
): void {
  const exact = membership.status === REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT;
  if (exact) {
    into.reachableMembershipExactSlotCount += 1;
    into.reachableMembershipDocumentCountAcrossExactSlots += membership.documentCount;
  } else {
    into.reachableMembershipBlockedSlotCount += 1;
  }
  if (fullRankExact) {
    into.fullRankExactSlotCount += 1;
  } else {
    into.fullRankShortTextBlockedSlotCount += 1;
    if (exact) into.fullRankBlockedWhileReachableMembershipExactSlotCount += 1;
  }
  into.measurableSurvivorCount += readiness.measurableSurvivorCount;
  into.unresolvedShortTextOccurrenceCount += readiness.shortTextUnresolvedCount;
  into.sd9MinEnvelopeTotal += sd9.canonical.minCount;
  into.sd9MaxEnvelopeTotal += sd9.canonical.maxCount;
  if (sd9.canonical.status === C.sd9Successful) {
    into.sd9MechanicalSuccessfulSlotCount += 1;
  } else if (sd9.canonical.status === C.sd9Unsuccessful) {
    into.sd9MechanicalUnsuccessfulSlotCount += 1;
  } else if (sd9.canonical.status === C.sd9Pending) {
    into.sd9MechanicalPendingSlotCount += 1;
  } else {
    refuseV4Readiness(
      'R37_SD9_SEMANTICS_MISMATCH',
      `a ${sd9.sample} SD9 status is not one of the three frozen mechanical statuses`,
    );
  }
}

/**
 * Per-sample sums over R24's per-slot results. SET_P and SET_R are counted
 * independently; the cross-sample counts compare each slot's two statuses
 * and never equalise them.
 */
export function aggregateDeltaReadinessV4(
  readiness: readonly ReadinessCountInputV4[],
): R37DeltaReadinessAggregates {
  const p = emptyReadinessAggregateV4();
  const r = emptyReadinessAggregateV4();
  let bothSuccessful = 0;
  let disagreement = 0;
  for (const item of readiness) {
    accumulate(
      p,
      item.setPReachableMembership,
      item.setPFreezeSlotReadiness.fullRankReadiness === C.setPFullSampleRankMembershipExact,
      item.setPFreezeSlotReadiness,
      item.setPSd9,
    );
    accumulate(
      r,
      item.setRReachableMembership,
      item.setRFreezeSlotReadiness.fullRankReadiness === C.setRFullSampleRankMembershipExact,
      item.setRFreezeSlotReadiness,
      item.setRSd9,
    );
    const pStatus = item.setPSd9.canonical.status;
    const rStatus = item.setRSd9.canonical.status;
    if (pStatus === C.sd9Successful && rStatus === C.sd9Successful) bothSuccessful += 1;
    if (pStatus !== rStatus) disagreement += 1;
  }
  const slots = readiness.length;
  for (const sample of [p, r]) {
    if (
      sample.reachableMembershipExactSlotCount + sample.reachableMembershipBlockedSlotCount !==
        slots ||
      sample.fullRankExactSlotCount + sample.fullRankShortTextBlockedSlotCount !== slots ||
      sample.sd9MechanicalSuccessfulSlotCount +
        sample.sd9MechanicalUnsuccessfulSlotCount +
        sample.sd9MechanicalPendingSlotCount !==
        slots ||
      sample.sd9MinEnvelopeTotal !== sample.measurableSurvivorCount ||
      sample.sd9MaxEnvelopeTotal !==
        sample.measurableSurvivorCount + sample.unresolvedShortTextOccurrenceCount
    ) {
      refuseV4Readiness(
        'R37_DELTA_BATCH_COMPOSITION_INVALID',
        'the delta readiness aggregates do not partition the delta slots',
      );
    }
  }
  return Object.freeze({
    slotReadinessCount: slots,
    setP: Object.freeze(p),
    setR: Object.freeze(r),
    crossSample: Object.freeze({
      bothSamplesMechanicallySuccessfulSlotCount: bothSuccessful,
      sd9StatusDisagreementSlotCount: disagreement,
    }),
  });
}

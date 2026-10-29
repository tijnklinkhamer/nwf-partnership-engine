/**
 * PHASE 2B-2D — A3 R30: THE DELTA PATH AROUND R24'S PURE READINESS HELPER.
 *
 * DO NOT DERIVE A MEMBERSHIP, A READINESS OR AN SD9 STATUS AGAIN
 *
 *   R24's `deriveUnboundSlotReachableMembershipReadiness` owns every
 *   readiness semantic: the owner-policy binding, canonical SET_P freeze-slot
 *   readiness, use-by-reference of the stored SET_R readiness, exact
 *   reachable cap membership, BLOCKED membership, zero-extension-headroom
 *   semantics, the canonical SD9 survivor envelope and its classification,
 *   and every structural consistency check. This file calls it - exactly once
 *   per preparation - and never slices a cap, re-derives a readiness, builds
 *   an envelope or classifies a status. It has no other route to SD9.
 *
 * THE POSTCONDITIONS ARE IDENTITY CHECKS, NOT DECISIONS
 *
 *   After R24 returns, R30 checks only that the canonical result IS the R29
 *   preparation's own objects and tokens:
 *
 *     - same selection slot and split;
 *     - SET_R freeze-slot readiness is R29's stored object, by identity;
 *     - an EXACT membership's `documents` is the canonical cap's own array,
 *       by identity, and a BLOCKED membership has no document list, for a
 *       cap that has none;
 *     - both memberships carry the one owner policy with its exact
 *       Generation-1 tokens;
 *     - both SD9 results carry the exact R24 semantics token, and the
 *       canonical envelope is `[survivors, survivors + unresolved]` as the
 *       R29 counts state them.
 *
 *   None of these selects, counts or classifies anything.
 *
 * ALL OR NOTHING
 *
 *   Every preparation is derived before any result is returned. A refusal on
 *   the second preparation returns nothing for the first.
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
import { refuseV2Readiness } from './refusal.js';
import type { DeltaSlotReadinessInput, UnboundDeltaSlotReadiness } from './types.js';

/**
 * The Generation-1 owner clarification R24 binds, STATED for the postcondition
 * and the census. Not a new policy object: R24 binds the canonical one, and
 * the unit suite proves these equal its tokens.
 */
export const R30_STATED_REACHABLE_MEMBERSHIP_POLICY = Object.freeze({
  decisionToken: 'SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1',
  generation: 'METHODOLOGY_V2_GEN1',
  requiredMembershipScope: 'REACHABLE_SELECTED_CAPPED_MEMBERSHIP',
  zeroExtensionHeadroomScope:
    'ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP',
  unreachableTailFreezeEffect: 'DOES_NOT_REFUSE_FREEZE_BY_ITSELF',
} as const);

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

function requireMembershipByReference<S extends A3ReadinessSample>(
  sample: S,
  membership: A3ReachableMembership<S>,
  cap: CanonicalCapView,
  position: number,
): void {
  const capHasDocuments = Object.prototype.hasOwnProperty.call(cap, 'documents');
  if (membership.sample !== sample) {
    refuseV2Readiness(
      'R30_DELTA_READINESS_NOT_BY_REFERENCE',
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
      refuseV2Readiness(
        'R30_DELTA_READINESS_NOT_BY_REFERENCE',
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
    refuseV2Readiness(
      'R30_DELTA_READINESS_NOT_BY_REFERENCE',
      `${sample} blocked membership at position ${position} does not match a blocked canonical cap`,
    );
  }
}

function requireOwnerPolicy(unbound: UnboundDeltaSlotReadiness, position: number): void {
  const p = unbound.setPReachableMembership.ownerPolicy;
  const r = unbound.setRReachableMembership.ownerPolicy;
  const stated = R30_STATED_REACHABLE_MEMBERSHIP_POLICY;
  const matches = (binding: typeof p): boolean =>
    binding.decisionToken === stated.decisionToken &&
    binding.generation === stated.generation &&
    binding.requiredMembershipScope === stated.requiredMembershipScope &&
    binding.zeroExtensionHeadroomScope === stated.zeroExtensionHeadroomScope &&
    binding.unreachableTailFreezeEffect === stated.unreachableTailFreezeEffect;
  if (p.policy !== r.policy || !matches(p) || !matches(r)) {
    refuseV2Readiness(
      'R30_OWNER_POLICY_BINDING_MISMATCH',
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
  if (sd9.sample !== sample || sd9.semantics !== R24_SD9_SEMANTICS) {
    refuseV2Readiness(
      'R30_SD9_SEMANTICS_MISMATCH',
      `${sample} SD9 at position ${position} does not carry the R24 mechanical semantics`,
    );
  }
  if (
    sd9.canonical.minCount !== counts.measurableSurvivorCount ||
    sd9.canonical.maxCount !== counts.measurableSurvivorCount + counts.shortTextUnresolvedCount
  ) {
    refuseV2Readiness(
      'R30_DELTA_READINESS_NOT_BY_REFERENCE',
      `${sample} SD9 envelope at position ${position} does not describe its R29 preparation`,
    );
  }
}

function requireReadinessDescribesPreparation(
  preparation: DeltaSlotReadinessInput,
  unbound: UnboundDeltaSlotReadiness,
  position: number,
): void {
  if (
    unbound.selectionIndex !== preparation.selectionIndex ||
    unbound.split !== preparation.split ||
    // §17: R24 keeps SET_R readiness by reference; R30 preserves that.
    unbound.setRFreezeSlotReadiness !== preparation.setRFreezeSlotReadiness
  ) {
    refuseV2Readiness(
      'R30_DELTA_READINESS_NOT_BY_REFERENCE',
      `the readiness at position ${position} does not keep its R29 preparation's slot and SET_R readiness`,
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
export function deriveDeltaSlotReadinessAllOrNothing(
  preparations: readonly DeltaSlotReadinessInput[],
): readonly UnboundDeltaSlotReadiness[] {
  const derived: UnboundDeltaSlotReadiness[] = [];
  preparations.forEach((preparation, position) => {
    const unbound = deriveUnboundSlotReachableMembershipReadiness(preparation);
    requireReadinessDescribesPreparation(preparation, unbound, position);
    derived.push(unbound);
  });
  return Object.freeze(derived);
}

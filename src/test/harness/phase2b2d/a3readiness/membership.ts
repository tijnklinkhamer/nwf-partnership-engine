/**
 * PHASE 2B-2D — A3 R24: THE PURE, UNBOUND REACHABLE-MEMBERSHIP AND SD9 READINESS HELPER.
 *
 * DO NOT DERIVE A CAP, A READINESS OR AN SD9 STATUS AGAIN
 *
 *   R23 already carries every canonical object this step needs:
 *
 *     SET_P  `setP.documentCap`             - canonical cap-8 exactness (R8);
 *     SET_R  `setRDocumentCap`              - canonical cap-4 exactness (R13);
 *            `setRFreezeSlotReadiness`      - canonical SET_R readiness (R13),
 *                                             derived ONCE in R23 and reused
 *                                             here by reference.
 *
 *   R24 adds exactly three canonical calls per slot:
 *
 *     `deriveSetPFreezeSlotReadiness(...)`       once   (R23 did not carry it);
 *     `deriveSd9BoundsUnderShortTextPolicy(...)` once per sample.
 *
 *   It never re-derives SET_R readiness, never slices a cap, never reranks,
 *   never walks survivors, never extends, never resolves short text.
 *
 * REACHABLE MEMBERSHIP (§13-§18)
 *
 *   Bound to `SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY`: for Generation 1,
 *   required membership is `REACHABLE_SELECTED_CAPPED_MEMBERSHIP`, and with
 *   zero extension headroom the selected cap is the complete reachable
 *   membership. So an EXACT canonical cap's `documents` array IS the reachable
 *   membership, by reference; a BLOCKED canonical cap yields a BLOCKED
 *   membership that has no document list. An unresolved short-text tail AFTER
 *   an exact cap stays unresolved full-order evidence and changes nothing here.
 *   Full-rank exactness is NOT required for an exact reachable membership.
 *
 * MECHANICAL SD9 (§19-§23)
 *
 *   The ONLY SD9 route is the canonical owner-policy envelope helper, fed with
 *   `measurableSurvivorMin = measurableSurvivorMax = sd7Preparation.counts
 *   .measurableSurvivorCount` and `shortTextUnresolvedCount = sd7Preparation
 *   .counts.shortTextUnresolvedCount`. A present short-text treatment never
 *   evicts or reclassifies a measurable survivor, so the only uncertainty is
 *   whether each unresolved short text contributes: the envelope is
 *   `[survivors, survivors + unresolved]`, and R24 does not choose inside it.
 *   A cap size is never an SD9 input. SET_P and SET_R are evaluated
 *   independently and are never forced to agree.
 *
 *   These statuses are A3 MECHANICAL readiness only. They are not A2
 *   acquisition authority and change no A2 fact.
 *
 * ONE ORGANISATION AT A TIME. There is no multi-slot entry point.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read. It mutates no input.
 */
import {
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
  SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY,
} from '../a3prep/contracts.js';
import {
  deriveSd9BoundsUnderShortTextPolicy,
  deriveSetPFreezeSlotReadiness,
  SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_P_INITIAL_CAP_EXACT,
  type A3SetPFreezeSlotReadiness,
  type A3Sd9ShortTextPolicyBounds,
} from '../a3prep/corpusFreezePreflight.js';
import { SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED } from '../a3prep/sd7.js';
import {
  SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
  SET_P_DOCUMENT_CAP_EXACT,
  type A3SetPDocumentCap,
  type A3SetPSd7Preparation,
} from '../a3prep/setPSd7.js';
import type { A3SetRSd7Preparation } from '../a3prep/setRSd7.js';
import {
  SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
  SET_R_DOCUMENT_CAP_EXACT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_R_INITIAL_CAP_EXACT,
  structuralIssueOfSetRFreezeSlotReadiness,
  type A3SetRDocumentCap,
  type A3SetRFreezeSlotReadiness,
} from '../a3prep/setRSd7Readiness.js';
import type { A3SelectionIndex } from '../a3prep/types.js';
import { R20_EVIDENCE_SPLIT_V1 } from '../a3evidence/types.js';
import { refuse } from './refusal.js';
import {
  REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED,
  REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT,
  R24_SD9_SEMANTICS,
  type A3MechanicalSd9Readiness,
  type A3ReachableMembership,
  type A3ReachableMembershipPolicyBinding,
  type A3ReadinessSample,
  type UnboundA3SlotReachableMembershipReadiness,
} from './types.js';

/**
 * The R23 fields R24 reads. An R23 minted or unbound preparation satisfies
 * it. There is no field for a cap list, a readiness, a count or a bound of
 * the caller's own: every one of them is read from these canonical objects.
 */
export interface UnboundSlotReadinessInput {
  readonly selectionIndex: number;
  readonly split: string;
  readonly setP: A3SetPSd7Preparation;
  readonly setR: A3SetRSd7Preparation;
  readonly setRDocumentCap: A3SetRDocumentCap;
  readonly setRFreezeSlotReadiness: A3SetRFreezeSlotReadiness;
}

type SamplePreparation = A3SetPSd7Preparation | A3SetRSd7Preparation;

// ---------------------------------------------------------------------------
// A. THE OWNER-POLICY BINDING (§18).
// ---------------------------------------------------------------------------

/**
 * Binds R24 to the owner clarification exactly as recorded. A policy object
 * whose tokens differ is refused: R24 proves no extension theorem of its own.
 */
export function requireReachableMembershipPolicyBinding(): A3ReachableMembershipPolicyBinding {
  const policy = SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY;
  if (
    policy.resolved !== true ||
    policy.decisionToken !==
      'SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1' ||
    policy.generation !== 'METHODOLOGY_V2_GEN1' ||
    policy.requiredMembershipScope !== 'REACHABLE_SELECTED_CAPPED_MEMBERSHIP' ||
    policy.zeroExtensionHeadroomScope !==
      'ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP' ||
    policy.unreachableTailFreezeEffect !== 'DOES_NOT_REFUSE_FREEZE_BY_ITSELF' ||
    policy.sd9 !== 'UNCHANGED'
  ) {
    refuse(
      'R24_OWNER_POLICY_BINDING_MISMATCH',
      'the reachable-membership owner policy does not carry the Generation-1 tokens',
    );
  }
  return Object.freeze({
    policy,
    decisionToken: policy.decisionToken,
    generation: policy.generation,
    requiredMembershipScope: policy.requiredMembershipScope,
    zeroExtensionHeadroomScope: policy.zeroExtensionHeadroomScope,
    unreachableTailFreezeEffect: policy.unreachableTailFreezeEffect,
  });
}

// ---------------------------------------------------------------------------
// B. SHAPE.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireSlotPreparation(input: unknown): UnboundSlotReadinessInput {
  if (
    !isRecord(input) ||
    typeof input['selectionIndex'] !== 'number' ||
    !Number.isSafeInteger(input['selectionIndex']) ||
    input['selectionIndex'] < 0 ||
    !isRecord(input['setP']) ||
    !isRecord(input['setR']) ||
    !isRecord(input['setRDocumentCap']) ||
    !isRecord(input['setRFreezeSlotReadiness'])
  ) {
    refuse(
      'R24_SLOT_PREPARATION_SHAPE_INVALID',
      'the slot preparation does not have the R23 shape',
    );
  }
  if (input['split'] !== R20_EVIDENCE_SPLIT_V1) {
    refuse(
      'R24_SPLIT_NOT_SUPPORTED',
      `R24 V1 reads ${R20_EVIDENCE_SPLIT_V1} only; no other split is read`,
    );
  }
  for (const sample of ['setP', 'setR'] as const) {
    const preparation = input[sample] as Record<string, unknown>;
    const sd7 = preparation['sd7Preparation'];
    if (
      !isRecord(sd7) ||
      !isRecord(sd7['counts']) ||
      !Array.isArray(sd7['shortTextUnresolvedInSampleOrder']) ||
      !Array.isArray(preparation['measurableSurvivorAwareFullRank'])
    ) {
      refuse('R24_SLOT_PREPARATION_SHAPE_INVALID', `${sample} is not a canonical preparation`);
    }
  }
  return input as unknown as UnboundSlotReadinessInput;
}

// ---------------------------------------------------------------------------
// C. READINESS CONSISTENCY (§29, §30). Checked, never reconstructed.
// ---------------------------------------------------------------------------

function requireSetPReadinessConsistency(
  slot: UnboundSlotReadinessInput,
  readiness: A3SetPFreezeSlotReadiness,
): void {
  const counts = slot.setP.sd7Preparation.counts;
  const short = counts.shortTextUnresolvedCount;
  const initialExact = readiness.initialCapReadiness === SET_P_INITIAL_CAP_EXACT;
  const fullExact = readiness.fullRankReadiness === SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT;
  const prefix = readiness.exactMeasurableSurvivorPrefixCount;
  const firstBlocked = readiness.firstBlockedSourceRankPosition;
  const structurallyValid = fullExact
    ? short === 0 && firstBlocked === null && prefix === readiness.measurableSurvivorCount
    : short > 0 &&
      firstBlocked !== null &&
      prefix <= readiness.measurableSurvivorCount &&
      prefix <= firstBlocked &&
      initialExact === prefix >= SET_P_MAX_PAGES_PER_ORGANISATION;
  if (
    readiness.selectionIndex !== slot.selectionIndex ||
    readiness.split !== slot.split ||
    initialExact !== (slot.setP.documentCap.status === SET_P_DOCUMENT_CAP_EXACT) ||
    fullExact !== (short === 0) ||
    readiness.measurableSurvivorCount !== counts.measurableSurvivorCount ||
    readiness.shortTextUnresolvedCount !== short ||
    !structurallyValid
  ) {
    refuse(
      'R24_SET_P_READINESS_INCONSISTENT',
      'the canonical SET_P freeze-slot readiness does not describe the R23 SET_P preparation',
    );
  }
}

function requireSetRReadinessConsistency(slot: UnboundSlotReadinessInput): void {
  const readiness = slot.setRFreezeSlotReadiness;
  const counts = slot.setR.sd7Preparation.counts;
  if (
    structuralIssueOfSetRFreezeSlotReadiness(readiness) !== null ||
    readiness.selectionIndex !== slot.selectionIndex ||
    readiness.split !== slot.split ||
    (readiness.initialCapReadiness === SET_R_INITIAL_CAP_EXACT) !==
      (slot.setRDocumentCap.status === SET_R_DOCUMENT_CAP_EXACT) ||
    (readiness.fullRankReadiness === SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT) !==
      (counts.shortTextUnresolvedCount === 0) ||
    readiness.measurableSurvivorCount !== counts.measurableSurvivorCount ||
    readiness.shortTextUnresolvedCount !== counts.shortTextUnresolvedCount
  ) {
    refuse(
      'R24_SET_R_READINESS_INCONSISTENT',
      "R23's stored SET_R freeze-slot readiness does not describe its SET_R preparation",
    );
  }
}

// ---------------------------------------------------------------------------
// D. REACHABLE MEMBERSHIP (§13, §14, §27, §31).
// ---------------------------------------------------------------------------

interface CanonicalCapView {
  readonly status: string;
  readonly documents?: readonly unknown[];
  readonly openIssue?: string;
}

function reachableMembershipOf<S extends A3ReadinessSample>(
  sample: S,
  cap: CanonicalCapView,
  exactStatus: string,
  blockedStatus: string,
  canonicalCapSize: number,
  preparation: SamplePreparation,
  ownerPolicy: A3ReachableMembershipPolicyBinding,
): A3ReachableMembership<S> {
  if (cap.status === exactStatus) {
    const documents = cap.documents;
    const survivors = preparation.measurableSurvivorAwareFullRank;
    if (
      !Array.isArray(documents) ||
      documents.length > canonicalCapSize ||
      documents.some((document, position) => document !== survivors[position])
    ) {
      refuse(
        'R24_REACHABLE_MEMBERSHIP_INCONSISTENT',
        `${sample} exact cap is not a canonical survivor prefix within the cap`,
      );
    }
    return Object.freeze({
      status: REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT,
      sample,
      canonicalCapSize,
      documentCount: documents.length,
      // The canonical cap's own array: never copied, re-ranked or sliced.
      documents,
      ownerPolicy,
    }) as unknown as A3ReachableMembership<S>;
  }
  if (cap.status === blockedStatus) {
    if (
      Object.prototype.hasOwnProperty.call(cap, 'documents') ||
      cap.openIssue !== SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED
    ) {
      refuse(
        'R24_REACHABLE_MEMBERSHIP_INCONSISTENT',
        `${sample} blocked cap carries membership or lost its open issue`,
      );
    }
    return Object.freeze({
      status: REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED,
      sample,
      canonicalCapSize,
      openIssue: SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
      ownerPolicy,
    }) as unknown as A3ReachableMembership<S>;
  }
  refuse('R24_REACHABLE_MEMBERSHIP_INCONSISTENT', `${sample} cap status is not canonical`);
}

// ---------------------------------------------------------------------------
// E. MECHANICAL SD9 (§19-§23). The one canonical envelope route.
// ---------------------------------------------------------------------------

function mechanicalSd9Of<S extends A3ReadinessSample>(
  sample: S,
  preparation: SamplePreparation,
): A3MechanicalSd9Readiness<S> {
  let canonical: A3Sd9ShortTextPolicyBounds;
  try {
    canonical = deriveSd9BoundsUnderShortTextPolicy({
      measurableSurvivorMin: preparation.sd7Preparation.counts.measurableSurvivorCount,
      measurableSurvivorMax: preparation.sd7Preparation.counts.measurableSurvivorCount,
      shortTextUnresolvedCount: preparation.sd7Preparation.counts.shortTextUnresolvedCount,
    });
  } catch (error) {
    refuse('R24_CANONICAL_SD9_ENVELOPE_STOPPED', `${sample} canonical SD9 envelope stopped`, {
      cause: error,
    });
  }
  // Postcondition over the canonical result, never a second classification.
  const counts = preparation.sd7Preparation.counts;
  if (
    canonical.minCount !== counts.measurableSurvivorCount ||
    canonical.maxCount !== counts.measurableSurvivorCount + counts.shortTextUnresolvedCount
  ) {
    refuse(
      'R24_SD9_ENVELOPE_INCONSISTENT',
      `${sample} canonical SD9 envelope is not [survivors, survivors + unresolved]`,
    );
  }
  return Object.freeze({ sample, semantics: R24_SD9_SEMANTICS, canonical });
}

// ---------------------------------------------------------------------------
// F. ONE SLOT.
// ---------------------------------------------------------------------------

/**
 * Derives ONE slot's reachable membership and mechanical SD9 readiness from
 * an R23-shaped preparation. Returns an UNBOUND result: it carries no
 * authority, whatever it was given.
 */
export function deriveUnboundSlotReachableMembershipReadiness(
  input: UnboundSlotReadinessInput,
): UnboundA3SlotReachableMembershipReadiness {
  const ownerPolicy = requireReachableMembershipPolicyBinding();
  const slot = requireSlotPreparation(input);

  // §11: canonical SET_P readiness, called exactly once.
  let setPFreezeSlotReadiness: A3SetPFreezeSlotReadiness;
  try {
    setPFreezeSlotReadiness = deriveSetPFreezeSlotReadiness({
      selectionIndex: slot.selectionIndex as A3SelectionIndex,
      split: R20_EVIDENCE_SPLIT_V1,
      preparation: slot.setP,
    });
  } catch (error) {
    refuse('R24_CANONICAL_SET_P_READINESS_STOPPED', 'canonical SET_P readiness stopped', {
      cause: error,
    });
  }
  requireSetPReadinessConsistency(slot, setPFreezeSlotReadiness);

  // §12: R23's stored SET_R readiness, checked and kept by reference.
  requireSetRReadinessConsistency(slot);

  const setPCap: A3SetPDocumentCap = slot.setP.documentCap;
  const setPReachableMembership = reachableMembershipOf(
    'SET_P',
    setPCap,
    SET_P_DOCUMENT_CAP_EXACT,
    SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
    SET_P_MAX_PAGES_PER_ORGANISATION,
    slot.setP,
    ownerPolicy,
  );
  const setRReachableMembership = reachableMembershipOf(
    'SET_R',
    slot.setRDocumentCap,
    SET_R_DOCUMENT_CAP_EXACT,
    SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
    SET_R_MAX_PAGES_PER_ORGANISATION,
    slot.setR,
    ownerPolicy,
  );

  return Object.freeze({
    kind: 'UNBOUND_A3_SLOT_REACHABLE_MEMBERSHIP_READINESS' as const,
    selectionIndex: slot.selectionIndex,
    split: R20_EVIDENCE_SPLIT_V1,
    setPFreezeSlotReadiness,
    setRFreezeSlotReadiness: slot.setRFreezeSlotReadiness,
    setPReachableMembership,
    setRReachableMembership,
    setPSd9: mechanicalSd9Of('SET_P', slot.setP),
    setRSd9: mechanicalSd9Of('SET_R', slot.setR),
  });
}

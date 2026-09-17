/**
 * PHASE 2B-2D2C-F3 — THE FAIL-CLOSED FINAL-V6 SEQUENCING GATE.
 *
 * The ordering rule only: slot N+1 is never eligible while any slot 1..N is
 * anything other than Class C AND durably closed, and the target slot's own
 * root must hold no evidence yet.
 *
 * IT REUSES THE PROVEN EVIDENCE WALK VERBATIM. `classifySlotEvidence` and
 * `inclusionClassOf` (`f0w/sequencing.ts`) are imported and called, never
 * reimplemented: they take a PATH and injected probes, carry no V4/V5 slot
 * type, and already encode the corrected Class A/B/C taxonomy the
 * zero-inference recovery hardened. Only F0W's own `evaluateSequencingGate`
 * is not reusable here, because its signature is typed against
 * `StudySlotIdentity` (which carries `pairNumber` and a variant union closed
 * to V4/V5). This module is that one small ordering loop, retyped over
 * `F2SlotIdentity` — the same rule, the same refusal vocabulary, the same
 * fail-closed default.
 *
 * PURE aside from the injected probes. No network, no database, no clock, no
 * filesystem of its own; it never writes, moves or deletes anything.
 */
import {
  classifySlotEvidence,
  inclusionClassOf,
  type SlotEvidenceClassification,
  type SlotEvidenceProbes,
} from '../f0w/sequencing.js';
import { F2_SLOTS, type F2SlotIdentity } from '../f2/studyPlanCoreF2.js';

export type F3SequencingRefusal =
  | 'UNKNOWN_SLOT_ID'
  | 'PRIOR_SLOT_NOT_YET_CLASS_C'
  | 'PRIOR_SLOT_PAUSED_CLASS_B'
  | 'PRIOR_SLOT_AMBIGUOUS_EVIDENCE'
  | 'PRIOR_SLOT_CLASS_C_NOT_YET_DURABLY_CLOSED'
  | 'TARGET_SLOT_ALREADY_HAS_EVIDENCE';

export type F3SequencingDecision =
  | { readonly eligible: true; readonly slot: F2SlotIdentity }
  | {
      readonly eligible: false;
      readonly refusal: F3SequencingRefusal;
      readonly detail: string;
      readonly blockingSlot: F2SlotIdentity | null;
    };

/**
 * True iff every slot BEFORE `targetSlotId` (frozen order) is Class C and
 * durably closed, and the target slot's OWN root holds no evidence yet.
 * Never infers progression from a directory NAME — every verdict comes from
 * `classifySlotEvidence`'s read of the preserved artifacts themselves.
 */
export function evaluateF3SequencingGate(
  targetSlotId: string,
  outputRootOfSlot: (slot: F2SlotIdentity) => string,
  probes: SlotEvidenceProbes,
  slots: readonly F2SlotIdentity[] = F2_SLOTS,
): F3SequencingDecision {
  const targetIndex = slots.findIndex((slot) => slot.slotId === targetSlotId);
  if (targetIndex < 0) {
    return {
      eligible: false,
      refusal: 'UNKNOWN_SLOT_ID',
      detail: `"${targetSlotId}" is not one of the ${slots.length} frozen final-V6 study slots.`,
      blockingSlot: null,
    };
  }

  for (let index = 0; index < targetIndex; index += 1) {
    const prior = slots[index];
    if (prior === undefined) continue;
    const classification: SlotEvidenceClassification = classifySlotEvidence(
      outputRootOfSlot(prior),
      probes,
    );
    const inclusion = inclusionClassOf(classification);
    if (inclusion === 'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL') {
      return {
        eligible: false,
        refusal: 'PRIOR_SLOT_PAUSED_CLASS_B',
        detail: `slot ${prior.slotId} is Class B (${classification.detail}); the study is paused there pending a separate owner-reviewed recovery decision.`,
        blockingSlot: prior,
      };
    }
    if (inclusion === 'AMBIGUOUS_EVIDENCE') {
      return {
        eligible: false,
        refusal: 'PRIOR_SLOT_AMBIGUOUS_EVIDENCE',
        detail: `slot ${prior.slotId} holds evidence this build cannot account for (${classification.detail}).`,
        blockingSlot: prior,
      };
    }
    if (inclusion !== 'CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED') {
      return {
        eligible: false,
        refusal: 'PRIOR_SLOT_NOT_YET_CLASS_C',
        detail: `slot ${prior.slotId} has not produced a semantic replicate yet (${classification.detail}).`,
        blockingSlot: prior,
      };
    }
    if (!classification.durablyClosed) {
      return {
        eligible: false,
        refusal: 'PRIOR_SLOT_CLASS_C_NOT_YET_DURABLY_CLOSED',
        detail: `slot ${prior.slotId} is Class C but not durably closed (${classification.detail}); a further artifact could still be appended.`,
        blockingSlot: prior,
      };
    }
  }

  const target = slots[targetIndex]!;
  const targetClassification = classifySlotEvidence(outputRootOfSlot(target), probes);
  if (targetClassification.disposition !== 'NO_EVIDENCE') {
    return {
      eligible: false,
      refusal: 'TARGET_SLOT_ALREADY_HAS_EVIDENCE',
      detail: `slot ${target.slotId} already holds evidence (${targetClassification.disposition}: ${targetClassification.detail}); a slot is never re-run.`,
      blockingSlot: target,
    };
  }
  return { eligible: true, slot: target };
}

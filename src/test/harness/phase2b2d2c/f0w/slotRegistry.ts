/**
 * PHASE 2B-2D2C-F0W — the REQUEST-FREE STUDY-SLOT REGISTRY.
 *
 * F0V already froze the ten replication-study slots as a literal array
 * (`F0V_SLOTS`, `studyPlanCore.ts`) and a freeze loader that cross-checks a
 * freeze document's own `slots` block against that literal
 * (`assertF0VFreezeAgreesWithProduction`, `freezeF0V.ts`). This module adds
 * nothing new to WHAT the ten slots are; it adds a small, request-free
 * LOOKUP surface a per-slot authorisation candidate can be resolved and
 * cross-checked against — so a candidate's own claims about its slot are
 * never trusted, only its `slotId` is used to look the real slot up.
 *
 * Loading the registry from bytes reuses `loadF0VFreezeFromBytes` verbatim:
 * a wrong F0V raw hash, a shape mismatch, or a slots block that disagrees
 * with this build's own `F0V_SLOTS` are ALL refused there, before this
 * module ever runs. This module's own `resolveSlot` then refuses an unknown
 * `slotId` by exact value — there is no fuzzy match, no case-folding, and no
 * "closest slot" fallback.
 *
 * PURE. No network, no database, no clock, no filesystem of its own — the
 * caller supplies the F0V freeze bytes it already read.
 */
import { loadF0VFreezeFromBytes, type F0VFreeze } from '../f0v/freezeF0V.js';
import { F0V_SLOTS, F0V_TOTAL_SLOTS, type StudySlotIdentity } from '../f0v/studyPlanCore.js';

export class SlotRegistryError extends Error {
  override readonly name = 'SlotRegistryError';
  constructor(
    readonly reason: 'UNKNOWN_SLOT_ID',
    message: string,
  ) {
    super(message);
  }
}

export interface StudySlotRegistry {
  readonly f0vFreeze: F0VFreeze;
  readonly f0vFreezeRawSha256: string;
  readonly totalSlots: typeof F0V_TOTAL_SLOTS;
  readonly slots: readonly StudySlotIdentity[];
  /** Refuses (throws) an unknown slotId; never returns undefined and never guesses. */
  resolveSlot(slotId: string): StudySlotIdentity;
}

/**
 * Loads the registry from the F0V freeze bytes: hash, shape and
 * production-agreement are ALL re-verified by `loadF0VFreezeFromBytes` before
 * this function returns anything. The returned `slots` array is exactly
 * `F0V_SLOTS` (the freeze loader already proved the freeze document agrees
 * with it field for field), never a copy built from the JSON document.
 */
export function loadStudySlotRegistry(f0vFreezeBytes: Buffer): StudySlotRegistry {
  const { freeze, rawSha256 } = loadF0VFreezeFromBytes(f0vFreezeBytes);
  const bySlotId = new Map(F0V_SLOTS.map((slot) => [slot.slotId, slot]));
  return {
    f0vFreeze: freeze,
    f0vFreezeRawSha256: rawSha256,
    totalSlots: F0V_TOTAL_SLOTS,
    slots: F0V_SLOTS,
    resolveSlot(slotId: string): StudySlotIdentity {
      const slot = bySlotId.get(slotId);
      if (slot === undefined) {
        throw new SlotRegistryError(
          'UNKNOWN_SLOT_ID',
          `"${slotId}" is not one of the ${F0V_TOTAL_SLOTS} frozen replication-study slots ` +
            `(${F0V_SLOTS.map((s) => s.slotId).join(', ')}).`,
        );
      }
      return slot;
    },
  };
}

/** The slot immediately after `slotId` in frozen sequence order, or null after the last slot. */
export function nextSlotAfter(
  slotId: string,
  slots: readonly StudySlotIdentity[],
): StudySlotIdentity | null {
  const index = slots.findIndex((slot) => slot.slotId === slotId);
  if (index < 0) {
    throw new SlotRegistryError('UNKNOWN_SLOT_ID', `"${slotId}" is not a frozen slot.`);
  }
  return slots[index + 1] ?? null;
}

/**
 * PHASE 2B-2D2C-F3 — THE REQUEST-FREE FINAL-V6 SLOT REGISTRY.
 *
 * The exact F0W analogue (`f0w/slotRegistry.ts`), rebuilt over the APPROVED
 * F2 freeze rather than the historical F0V one. It adds nothing to WHAT the
 * five slots are — `F2_SLOTS` (`f2/studyPlanCoreF2.ts`) already froze them,
 * and `loadF2FreezeFromBytes` already refuses a freeze whose own `slots`
 * block disagrees with that literal. It adds only the small, request-free
 * LOOKUP surface a per-slot authorisation candidate is resolved and
 * cross-checked against, so a candidate's own claims about its slot are
 * never trusted — only its `slotId` is used to look the real slot up.
 *
 * WHY A NEW REGISTRY RATHER THAN THE F0W ONE. `StudySlotIdentity`
 * (`f0v/studyPlanCore.ts`) carries `pairNumber` and a `StudyVariantName`
 * closed to `PROMPT_V4_CANONICAL | PROMPT_V5_CANONICAL`. A V6 replicate has
 * no pair and is neither variant, so reusing that type would mean inventing
 * a `pairNumber` for a study that has none and widening a closed historical
 * union. The owner's brief forbids exactly that coercion; this registry is
 * therefore additive and the historical one is untouched.
 *
 * PURE. No network, no database, no clock, no filesystem of its own — the
 * caller supplies the F2 freeze bytes it already read.
 */
import { loadF2FreezeFromBytes, type F2Freeze } from '../f2/freezeF2.js';
import { F2_N_REPLICATES, F2_SLOTS, type F2SlotIdentity } from '../f2/studyPlanCoreF2.js';

export class F3SlotRegistryError extends Error {
  override readonly name = 'F3SlotRegistryError';
  constructor(
    readonly reason: 'UNKNOWN_SLOT_ID',
    message: string,
  ) {
    super(message);
  }
}

export interface F3SlotRegistry {
  readonly f2Freeze: F2Freeze;
  readonly f2FreezeRawSha256: string;
  readonly f2FreezeRawBytes: number;
  readonly totalSlots: typeof F2_N_REPLICATES;
  readonly slots: readonly F2SlotIdentity[];
  /**
   * The requested model id THE APPROVED FREEZE ITSELF names. Read from the
   * freeze document, never written as a literal in this namespace:
   * `phase1a.firewall.test.ts` confines Claude model ids to
   * `allowedModels.ts`, and `freezeF2.ts` records the same reasoning.
   */
  readonly requestedModelId: string;
  /** Refuses (throws) an unknown slotId; never returns undefined and never guesses. */
  resolveSlot(slotId: string): F2SlotIdentity;
}

/**
 * Loads the registry from the F2 freeze bytes: raw hash, raw byte length,
 * shape and production-agreement are ALL re-verified by
 * `loadF2FreezeFromBytes` before this function returns anything. The
 * returned `slots` array is exactly `F2_SLOTS` (the freeze loader already
 * proved the freeze document agrees with it field for field), never a copy
 * built from the JSON document.
 */
export function loadF3SlotRegistry(f2FreezeBytes: Buffer): F3SlotRegistry {
  const { freeze, rawSha256, rawBytes } = loadF2FreezeFromBytes(f2FreezeBytes);
  const bySlotId = new Map(F2_SLOTS.map((slot) => [slot.slotId, slot]));
  return {
    f2Freeze: freeze,
    f2FreezeRawSha256: rawSha256,
    f2FreezeRawBytes: rawBytes,
    totalSlots: F2_N_REPLICATES,
    slots: F2_SLOTS,
    requestedModelId: freeze.perRunPolicy.requestedModelId,
    resolveSlot(slotId: string): F2SlotIdentity {
      const slot = bySlotId.get(slotId);
      if (slot === undefined) {
        throw new F3SlotRegistryError(
          'UNKNOWN_SLOT_ID',
          `"${slotId}" is not one of the ${F2_N_REPLICATES} frozen final-V6 study slots ` +
            `(${F2_SLOTS.map((s) => s.slotId).join(', ')}).`,
        );
      }
      return slot;
    },
  };
}

/** The slot immediately after `slotId` in frozen sequence order, or null after the last slot. */
export function nextF3SlotAfter(
  slotId: string,
  slots: readonly F2SlotIdentity[] = F2_SLOTS,
): F2SlotIdentity | null {
  const index = slots.findIndex((slot) => slot.slotId === slotId);
  if (index < 0) {
    throw new F3SlotRegistryError('UNKNOWN_SLOT_ID', `"${slotId}" is not a frozen slot.`);
  }
  return slots[index + 1] ?? null;
}

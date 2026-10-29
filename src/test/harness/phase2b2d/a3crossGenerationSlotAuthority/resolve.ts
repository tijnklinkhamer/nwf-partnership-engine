/**
 * PHASE 2B-2D — A3 R38A: THE CROSS-GENERATION RESOLVER AND ITS READY RULE.
 *
 * A slot is `A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY` iff ALL of:
 *
 *   1. its current occupant is DERIVED from the original selection, the
 *      Generation-1 chain (validated by R17 itself) and the Generation-2 chain
 *      (validated in its own namespace) - never supplied by the caller;
 *   2. exactly one terminal acquisition-of-record fact names that exact
 *      generation-qualified occupant;
 *   3. its disposition is exactly ACQUISITION_SUCCESSFUL;
 *   4. it binds the exact adjudication, the declared acquisition-of-record
 *      result, the run-reference digest and the actual acquisition policy;
 *   5. if the fact is a Generation-1 fact, an exact carry-forward admission is
 *      genuine and no Generation-2 transition has touched the slot; and
 *   6. if the occupant is a Generation-2 reserve, the fact is genuinely a
 *      Generation-2 fact naming its exact schedule identity.
 *
 * Nothing else is READY: no diagnostic SD9, live result, freeze aggregate,
 * carry-forward feasibility boolean, window authority, strategy, plan,
 * pre-network assignment or corpus-freeze count is an input at all.
 *
 * ALL OR NOTHING
 *
 *   Every input is validated and every slot classified BEFORE any authority
 *   is registered as minted. A structural refusal anywhere throws, and no
 *   object built before it ever becomes a minted authority. PURE.
 */
import {
  A2_ACQUISITION_SUCCESSFUL,
  type A2UnsuccessfulDisposition,
} from '../a3prep/slotAuthority.js';
import { resolveCrossGenerationOccupants, slotLedgerEntryHashes } from './chain.js';
import { isObject } from './occupantIdentity.js';
import { refuseCrossGeneration } from './refusal.js';
import {
  acquisitionOfRecordResultOf,
  admitCarryForwards,
  indexAdjudicationRegistries,
  locateTerminalFact,
} from './terminalFacts.js';
import {
  A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY,
  CROSS_GENERATION_ACQUISITION_NOT_ADJUDICATED,
  CROSS_GENERATION_CURRENT_OCCUPANT_UNSUCCESSFUL,
  GENERATION1_ID,
  GENERATION2_ID,
  type A3CrossGenerationSlotAcquisitionAuthority,
  type A3CrossGenerationSlotAcquisitionAuthorityReady,
  type A3CrossGenerationSlotAuthorityResolution,
  type CarryForwardAdmission,
  type CrossGenerationResolutionInput,
  type CrossGenerationTerminalFact,
} from './types.js';

const ISSUED_READY = new WeakSet<object>();
const ISSUED_RESOLUTIONS = new WeakSet<object>();
/** The genuine, validated admission behind each minted carried authority. */
const CARRY_FORWARD_OF = new WeakMap<object, CarryForwardAdmission>();

/**
 * True ONLY for a READY authority this namespace minted. A spread, a
 * structuredClone, a JSON round trip, a literal, or an R17 READY is not one.
 */
export function isA3CrossGenerationSlotAcquisitionAuthorityReady(
  value: unknown,
): value is A3CrossGenerationSlotAcquisitionAuthorityReady {
  return typeof value === 'object' && value !== null && ISSUED_READY.has(value);
}

export function isA3CrossGenerationSlotAuthorityResolution(
  value: unknown,
): value is A3CrossGenerationSlotAuthorityResolution {
  return typeof value === 'object' && value !== null && ISSUED_RESOLUTIONS.has(value);
}

/**
 * The genuine carry-forward admission a minted carried authority was resolved
 * through, or null when it carries none. Refuses anything not minted here.
 */
export function carryForwardAdmissionOf(
  ready: A3CrossGenerationSlotAcquisitionAuthorityReady,
): CarryForwardAdmission | null {
  if (!isA3CrossGenerationSlotAcquisitionAuthorityReady(ready)) {
    refuseCrossGeneration(
      'NOT_A_MINTED_CROSS_GENERATION_AUTHORITY',
      'carry-forward provenance requested for an object this contract did not mint',
    );
  }
  return CARRY_FORWARD_OF.get(ready) ?? null;
}

/**
 * Resolves one authority per frozen selection slot for a Generation-2
 * resolution, or refuses the whole resolution.
 */
export function resolveCrossGenerationSlotAuthorities(
  input: CrossGenerationResolutionInput,
): A3CrossGenerationSlotAuthorityResolution {
  if (!isObject(input)) refuseCrossGeneration('INPUT_SHAPE_INVALID', 'input is not an object');
  if (!Array.isArray(input.terminalFacts)) {
    refuseCrossGeneration('INPUT_SHAPE_INVALID', 'terminalFacts must be an array');
  }
  const structure = resolveCrossGenerationOccupants(input);
  const { occupants } = structure;
  const registry = indexAdjudicationRegistries(input);

  // Terminal facts keyed by (slot, chain position). At most one per occupant,
  // across both generations: no ordering, no recency, no replacement by a
  // second fact.
  const terminalBySlot = new Map<number, Map<number, CrossGenerationTerminalFact>>();
  input.terminalFacts.forEach((raw, i) => {
    const located = locateTerminalFact(raw, `terminalFacts[${String(i)}]`, occupants, registry);
    const perSlot = terminalBySlot.get(located.selectionIndex) ?? new Map();
    if (perSlot.has(located.chainPosition)) {
      refuseCrossGeneration(
        'DUPLICATE_TERMINAL_ADJUDICATION',
        `terminalFacts[${String(i)}] is a second terminal adjudication for slot-chain position ${String(located.chainPosition)}`,
      );
    }
    perSlot.set(located.chainPosition, located.fact);
    terminalBySlot.set(located.selectionIndex, perSlot);
  });

  const admissions = admitCarryForwards(input, occupants, registry, terminalBySlot);

  // History: a replaced occupant must have failed for the ledger's reason.
  for (const occupant of occupants) {
    const perSlot = terminalBySlot.get(occupant.selectionIndex);
    if (perSlot === undefined) continue;
    for (const link of occupant.chain) {
      if (link.replacedWithReason === null) continue;
      const fact = perSlot.get(link.chainPosition);
      if (fact === undefined) continue;
      if (fact.disposition === A2_ACQUISITION_SUCCESSFUL) {
        refuseCrossGeneration(
          'REPLACEMENT_AFTER_TERMINAL_SUCCESS',
          `slot-chain position ${String(link.chainPosition)} was adjudicated successful and then replaced`,
        );
      }
      if (fact.disposition !== link.replacedWithReason) {
        refuseCrossGeneration(
          'REPLACEMENT_REASON_CONTRADICTS_ADJUDICATION',
          `slot-chain position ${String(link.chainPosition)} ledger reason differs from its adjudicated disposition`,
        );
      }
    }
  }

  const ready: A3CrossGenerationSlotAcquisitionAuthorityReady[] = [];
  const slots = occupants.map((occupant): A3CrossGenerationSlotAcquisitionAuthority => {
    const common = {
      resolutionGenerationId: GENERATION2_ID,
      selectionIndex: occupant.selectionIndex,
      split: occupant.split,
      occupant,
    } as const;
    const tail = occupant.chain.length - 1;
    const fact = terminalBySlot.get(occupant.selectionIndex)?.get(tail);
    if (fact === undefined) {
      return Object.freeze({ ...common, status: CROSS_GENERATION_ACQUISITION_NOT_ADJUDICATED });
    }
    if (fact.disposition !== A2_ACQUISITION_SUCCESSFUL) {
      return Object.freeze({
        ...common,
        status: CROSS_GENERATION_CURRENT_OCCUPANT_UNSUCCESSFUL,
        disposition: fact.disposition as A2UnsuccessfulDisposition,
        acquisitionGenerationId: fact.factGenerationId,
      });
    }
    const admission = admissions.get(occupant.selectionIndex) ?? null;
    if (fact.factGenerationId === GENERATION1_ID && admission === null) {
      refuseCrossGeneration(
        'CARRY_FORWARD_ADMISSION_MISSING',
        'a Generation-1 success is the current acquisition of record in a Generation-2 resolution without a carry-forward admission',
      );
    }
    if (fact.factGenerationId === GENERATION2_ID && admission !== null) {
      refuseCrossGeneration(
        'CARRY_FORWARD_ADMISSION_MISMATCH',
        'a carry-forward admission names a slot whose acquisition of record is a Generation-2 adjudication',
      );
    }
    const hashes = slotLedgerEntryHashes(occupant);
    const authority: A3CrossGenerationSlotAcquisitionAuthorityReady = Object.freeze({
      ...common,
      status: A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      draw: Object.freeze({
        path: input.draw.path,
        artifactFileSha256: input.draw.artifactFileSha256,
        drawHash: input.draw.drawHash,
      }),
      generation1Ledger: structure.generation1Ledger,
      generation2Ledger: structure.generation2Ledger,
      generation2Schedule: Object.freeze({
        path: input.generation2Schedule.path,
        scheduleHash: input.generation2Schedule.scheduleHash,
      }),
      slotGeneration1LedgerEntryHashes: hashes.generation1,
      slotGeneration2LedgerEntryHashes: hashes.generation2,
      acquisitionGenerationId: fact.factGenerationId,
      disposition: A2_ACQUISITION_SUCCESSFUL,
      adjudication: fact.adjudication,
      acquisitionOfRecord: fact.acquisitionOfRecord,
      acquisitionOfRecordResult: acquisitionOfRecordResultOf(fact.acquisitionOfRecord),
      runRefSha256: fact.runRefSha256,
      acquisitionPolicyVersion: fact.acquisitionPolicyVersion,
      acquisitionPolicyTransitionLedger: fact.acquisitionPolicyTransitionLedger,
      sealedSd7Detail: fact.sealedSd7Detail,
      carryForwardAdmission: admission === null ? null : admission.admissionRecord,
    });
    if (admission !== null) CARRY_FORWARD_OF.set(authority, admission);
    ready.push(authority);
    return authority;
  });

  // Every admission must be consumed by exactly the READY slot it admits.
  for (const selectionIndex of admissions.keys()) {
    const slot = slots[selectionIndex]!;
    if (slot.status !== A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY) {
      refuseCrossGeneration(
        'CARRY_FORWARD_ADMISSION_MISMATCH',
        'a carry-forward admission names a slot that does not resolve to its carried acquisition',
      );
    }
  }

  const resolution: A3CrossGenerationSlotAuthorityResolution = Object.freeze({
    kind: 'A3_CROSS_GENERATION_SLOT_AUTHORITY_RESOLUTION',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    resolutionGenerationId: GENERATION2_ID,
    generation1Ledger: structure.generation1Ledger,
    generation2Ledger: structure.generation2Ledger,
    slots: Object.freeze(slots),
  });
  // Minting happens here, after every check has passed, and only here.
  for (const authority of ready) ISSUED_READY.add(authority);
  ISSUED_RESOLUTIONS.add(resolution);
  return resolution;
}

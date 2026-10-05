/**
 * PHASE 2B-2D — A3 R38A: THE R17 -> CROSS-GENERATION CONTINUITY BRIDGE.
 *
 * THE OWNER-DEFINED RULE (closes R38 I5)
 *
 *   Resolution CONTEXT is not acquisition AUTHORITY. A carried historical
 *   acquisition does not become a different evidence authority because it is
 *   now viewed inside a Generation-2 resolution, so `resolutionGenerationId`
 *   is not, by itself, an evidence-continuity field. What IS compared is the
 *   acquisition: for a carried Generation-1 authority, the cross-generation
 *   `acquisitionGenerationId` (still Generation 1) against R17's
 *   `generationId`, and every evidence-relevant field below.
 *
 * EVIDENCE CONTINUITY FIELDS (`CROSS_GENERATION_CONTINUITY_FIELDS`)
 *
 *   selection index, split, organisation, eche row key, acquisition
 *   generation, current occupant identity (generation-qualified), original
 *   source identity (the selection entry and its draw), the Generation-1
 *   slot-local chain and its ordered entry hashes, this slot's Generation-2
 *   transitions, disposition, adjudication, acquisition-of-record result, run
 *   reference, acquisition policy, policy-transition binding, sealed SD7
 *   commitment.
 *
 * GOVERNANCE CONTEXT, DELIBERATELY EXCLUDED
 *
 *   `resolutionGenerationId`; the WHOLE-ledger revisions of both ledgers (an
 *   append for another slot is context, not a change to this slot); the
 *   Generation-2 schedule binding; and the carry-forward admission binding
 *   itself - which is REQUIRED and VERIFIED as genuine before UNCHANGED is
 *   possible, but whose existence is a proof of continuity, not a change.
 *
 * R17 MAPPING
 *
 *   R17 PRIMARY maps only to PRIMARY with the same draw entry; R17
 *   RESERVE_REPLACEMENT maps only to GENERATION1_RESERVE_REPLACEMENT in
 *   GENERATION1_DRAW_RESERVE with the same position and draw-entry digest. A
 *   Generation-2 reserve can never compare unchanged to an R17 authority.
 *
 * This bridge is NEW and explicit. R26's comparator is untouched and is not
 * replaced. PURE.
 */
import {
  isA3SlotAcquisitionAuthorityReady,
  type A3SlotAcquisitionAuthorityReady,
} from '../a3prep/slotAuthority.js';
import { refuseCrossGeneration } from './refusal.js';
import {
  carryForwardAdmissionOf,
  isA3CrossGenerationSlotAcquisitionAuthorityReady,
} from './resolve.js';
import { bindingKey, acquisitionOfRecordResultOf } from './terminalFacts.js';
import { sourceIdentityKey } from './occupantIdentity.js';
import {
  GENERATION1_DRAW_RESERVE,
  GENERATION1_ID,
  GENERATION1_REPLACEMENT_LEDGER,
  GENERATION2_ID,
  type A3CrossGenerationSlotAcquisitionAuthorityReady,
  type CrossGenerationSourceIdentity,
} from './types.js';

export const CROSS_GENERATION_AUTHORITY_UNCHANGED = 'CROSS_GENERATION_AUTHORITY_UNCHANGED';
export const CROSS_GENERATION_AUTHORITY_CHANGED = 'CROSS_GENERATION_AUTHORITY_CHANGED';

/** The evidence-continuity fields, in their fixed reporting order. */
export const CROSS_GENERATION_CONTINUITY_FIELDS = Object.freeze([
  'selectionIndex',
  'split',
  'organisationId',
  'echeRowKey',
  'acquisitionGenerationId',
  'currentOccupantIdentity',
  'originalSourceIdentity',
  'generation1SlotChain',
  'generation1SlotChainLedgerEntryHashes',
  'generation2SlotTransitions',
  'disposition',
  'adjudication',
  'acquisitionOfRecordResult',
  'runRefSha256',
  'acquisitionPolicyVersion',
  'acquisitionPolicyTransitionLedger',
  'sealedSd7Detail',
] as const);
export type CrossGenerationContinuityField = (typeof CROSS_GENERATION_CONTINUITY_FIELDS)[number];

/** Present on the authorities, deliberately NOT evidence-continuity fields. */
export const CROSS_GENERATION_GOVERNANCE_CONTEXT_FIELDS = Object.freeze([
  'resolutionGenerationId',
  'generation1Ledger',
  'generation2Ledger',
  'generation2Schedule',
  'carryForwardAdmission',
] as const);

export type CrossGenerationContinuityProjection = Readonly<
  Record<CrossGenerationContinuityField, unknown>
>;

/** Key-sorted rendering: equal iff equal as plain data; undefined != null. */
function render(value: unknown): string {
  if (value === undefined) return '"<undefined>"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(render).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${render(record[key])}`)
    .join(',')}}`;
}

// ---------------------------------------------------------------------------
// A. THE TWO PROJECTIONS.
// ---------------------------------------------------------------------------

function r17CurrentOccupant(ready: A3SlotAcquisitionAuthorityReady): CrossGenerationSourceIdentity {
  if (ready.occupantKind === 'PRIMARY' && ready.reserveRankPosition === null) {
    return {
      sourceKind: 'PRIMARY',
      selectionIndex: ready.selectionIndex,
      drawEntrySha256: ready.drawEntrySha256,
      echeRowKey: ready.echeRowKey,
      organisationId: ready.organisationId,
    };
  }
  if (ready.occupantKind === 'RESERVE_REPLACEMENT' && ready.reserveRankPosition !== null) {
    return {
      sourceKind: 'GENERATION1_RESERVE_REPLACEMENT',
      reserveNamespace: GENERATION1_DRAW_RESERVE,
      generation1ReserveRankPosition: ready.reserveRankPosition,
      drawEntrySha256: ready.drawEntrySha256,
      echeRowKey: ready.echeRowKey,
      organisationId: ready.organisationId,
    };
  }
  return refuseCrossGeneration(
    'NOT_A_MINTED_R17_AUTHORITY',
    'R17 occupant kind is neither PRIMARY nor RESERVE_REPLACEMENT',
  );
}

/** R17's view, in the cross-generation vocabulary (the exact §23 mapping). */
export function r17ContinuityProjection(
  ready: A3SlotAcquisitionAuthorityReady,
): CrossGenerationContinuityProjection {
  const current = r17CurrentOccupant(ready);
  return Object.freeze({
    selectionIndex: ready.selectionIndex,
    split: ready.split,
    organisationId: ready.organisationId,
    echeRowKey: ready.echeRowKey,
    acquisitionGenerationId: ready.generationId,
    currentOccupantIdentity: sourceIdentityKey(current),
    originalSourceIdentity: {
      selectionIndex: ready.selectionIndex,
      drawEntrySha256: ready.occupant.chain[0]?.drawEntrySha256 ?? null,
      draw: ready.draw,
    },
    generation1SlotChain: ready.occupant.chain.map((link) => ({
      sourceKind: link.occupantKind === 'PRIMARY' ? 'PRIMARY' : 'GENERATION1_RESERVE_REPLACEMENT',
      generation1ReserveRankPosition: link.reserveRankPosition,
      drawEntrySha256: link.drawEntrySha256,
      generation1Sequence: link.installedByLedgerSequence,
      generation1EntryHash: link.installedByLedgerEntryHash,
    })),
    generation1SlotChainLedgerEntryHashes: ready.slotChainLedgerEntryHashes,
    generation2SlotTransitions: [],
    disposition: ready.disposition,
    adjudication: ready.adjudication,
    acquisitionOfRecordResult: ready.liveResult,
    runRefSha256: ready.runRefSha256,
    acquisitionPolicyVersion: ready.acquisitionPolicyVersion,
    acquisitionPolicyTransitionLedger: ready.acquisitionPolicyTransitionLedger,
    sealedSd7Detail: ready.sealedSd7Detail,
  });
}

/** The cross-generation view. `resolutionGenerationId` is not part of it. */
export function crossGenerationContinuityProjection(
  ready: A3CrossGenerationSlotAcquisitionAuthorityReady,
): CrossGenerationContinuityProjection {
  const primary = ready.occupant.chain[0]?.source;
  const generation1Links = ready.occupant.chain.slice(
    0,
    ready.occupant.generation1TerminalChainPosition + 1,
  );
  return Object.freeze({
    selectionIndex: ready.selectionIndex,
    split: ready.split,
    organisationId: ready.occupant.source.organisationId,
    echeRowKey: ready.occupant.source.echeRowKey,
    acquisitionGenerationId: ready.acquisitionGenerationId,
    currentOccupantIdentity: sourceIdentityKey(ready.occupant.source),
    originalSourceIdentity: {
      selectionIndex: ready.selectionIndex,
      drawEntrySha256: primary?.sourceKind === 'PRIMARY' ? primary.drawEntrySha256 : null,
      draw: ready.draw,
    },
    generation1SlotChain: generation1Links.map((link) => ({
      sourceKind: link.source.sourceKind,
      generation1ReserveRankPosition:
        link.source.sourceKind === 'GENERATION1_RESERVE_REPLACEMENT'
          ? link.source.generation1ReserveRankPosition
          : null,
      drawEntrySha256:
        link.source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT'
          ? null
          : link.source.drawEntrySha256,
      generation1Sequence:
        link.installation.installedBy === GENERATION1_REPLACEMENT_LEDGER
          ? link.installation.generation1Sequence
          : null,
      generation1EntryHash:
        link.installation.installedBy === GENERATION1_REPLACEMENT_LEDGER
          ? link.installation.generation1EntryHash
          : null,
    })),
    generation1SlotChainLedgerEntryHashes: ready.slotGeneration1LedgerEntryHashes,
    generation2SlotTransitions: ready.slotGeneration2LedgerEntryHashes,
    disposition: ready.disposition,
    adjudication: ready.adjudication,
    acquisitionOfRecordResult: ready.acquisitionOfRecordResult,
    runRefSha256: ready.runRefSha256,
    acquisitionPolicyVersion: ready.acquisitionPolicyVersion,
    acquisitionPolicyTransitionLedger: ready.acquisitionPolicyTransitionLedger,
    sealedSd7Detail: ready.sealedSd7Detail,
  });
}

// ---------------------------------------------------------------------------
// B. ONE-SLOT COMPARISON.
// ---------------------------------------------------------------------------

export interface CrossGenerationContinuityResult {
  readonly classification:
    typeof CROSS_GENERATION_AUTHORITY_UNCHANGED | typeof CROSS_GENERATION_AUTHORITY_CHANGED;
  readonly selectionIndex: number;
  /** Empty iff UNCHANGED; otherwise the semantic fields that differ, in fixed order. */
  readonly changedFields: readonly CrossGenerationContinuityField[];
  /** Context only: the resolution generation moved (always true for R17 -> Gen2). */
  readonly resolutionGenerationDiffers: boolean;
  /** Context only: a carried authority's genuine admission was verified. */
  readonly carriedThroughVerifiedAdmission: boolean;
}

function requireGenuineCarry(ready: A3CrossGenerationSlotAcquisitionAuthorityReady): void {
  const admission = carryForwardAdmissionOf(ready);
  if (
    admission === null ||
    ready.carryForwardAdmission === null ||
    bindingKey(admission.admissionRecord) !== bindingKey(ready.carryForwardAdmission) ||
    admission.selectionIndex !== ready.selectionIndex ||
    admission.split !== ready.split ||
    sourceIdentityKey(admission.occupant) !== sourceIdentityKey(ready.occupant.source) ||
    bindingKey(admission.generation1Adjudication) !== bindingKey(ready.adjudication) ||
    bindingKey(admission.acquisitionOfRecordResult) !==
      bindingKey(acquisitionOfRecordResultOf(ready.acquisitionOfRecord)) ||
    admission.runRefSha256 !== ready.runRefSha256 ||
    admission.acquisitionPolicyVersion !== ready.acquisitionPolicyVersion ||
    render(admission.acquisitionPolicyTransitionLedger) !==
      render(ready.acquisitionPolicyTransitionLedger) ||
    ready.slotGeneration2LedgerEntryHashes.length !== 0
  ) {
    refuseCrossGeneration(
      'CONTINUITY_CARRY_FORWARD_NOT_GENUINE',
      'a carried Generation-1 authority has no genuine carry-forward admission behind it',
    );
  }
}

/**
 * Compares ONE R17 READY authority with ONE cross-generation READY authority
 * for the same slot. Both must be minted by their own contracts.
 */
export function compareR17WithCrossGenerationAuthority(
  r17: A3SlotAcquisitionAuthorityReady,
  cross: A3CrossGenerationSlotAcquisitionAuthorityReady,
): CrossGenerationContinuityResult {
  if (!isA3SlotAcquisitionAuthorityReady(r17)) {
    refuseCrossGeneration('NOT_A_MINTED_R17_AUTHORITY', 'the old authority was not minted by R17');
  }
  if (!isA3CrossGenerationSlotAcquisitionAuthorityReady(cross)) {
    refuseCrossGeneration(
      'NOT_A_MINTED_CROSS_GENERATION_AUTHORITY',
      'the new authority was not minted by the cross-generation contract',
    );
  }
  if (r17.generationId !== GENERATION1_ID) {
    refuseCrossGeneration('NOT_A_MINTED_R17_AUTHORITY', 'an R17 authority is always Generation 1');
  }
  if (r17.selectionIndex !== cross.selectionIndex) {
    refuseCrossGeneration('CONTINUITY_SLOT_MISMATCH', 'the two authorities name different slots');
  }
  if (
    cross.acquisitionGenerationId === GENERATION2_ID &&
    bindingKey(cross.adjudication) === bindingKey(r17.adjudication)
  ) {
    refuseCrossGeneration(
      'CONTINUITY_RELABEL_DETECTED',
      'a Generation-1 adjudication appears as a Generation-2 acquisition of record',
    );
  }
  const carried = cross.acquisitionGenerationId === GENERATION1_ID;
  if (carried) requireGenuineCarry(cross);
  const a = r17ContinuityProjection(r17);
  const b = crossGenerationContinuityProjection(cross);
  const changedFields = Object.freeze(
    CROSS_GENERATION_CONTINUITY_FIELDS.filter((field) => render(a[field]) !== render(b[field])),
  );
  return Object.freeze({
    classification:
      changedFields.length === 0
        ? CROSS_GENERATION_AUTHORITY_UNCHANGED
        : CROSS_GENERATION_AUTHORITY_CHANGED,
    selectionIndex: cross.selectionIndex,
    changedFields,
    resolutionGenerationDiffers: String(cross.resolutionGenerationId) !== String(r17.generationId),
    carriedThroughVerifiedAdmission: carried,
  });
}

// ---------------------------------------------------------------------------
// C. THE LIST COMPARISON (for a later, separately authorised governance task).
// ---------------------------------------------------------------------------

export interface CrossGenerationContinuityDelta {
  readonly kind: 'CROSS_GENERATION_AUTHORITY_CONTINUITY_ANALYSIS';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly unchanged: readonly CrossGenerationContinuityResult[];
  readonly changed: readonly CrossGenerationContinuityResult[];
  /** Slots READY under R17 with no cross-generation READY authority. */
  readonly retractedSelectionIndices: readonly number[];
  /** Slots READY in the cross-generation resolution with no R17 READY authority. */
  readonly newSelectionIndices: readonly number[];
}

function indexBySelection<T extends { readonly selectionIndex: number }>(
  readies: readonly T[],
): Map<number, T> {
  const out = new Map<number, T>();
  for (const ready of readies) {
    if (out.has(ready.selectionIndex)) {
      refuseCrossGeneration(
        'CONTINUITY_DUPLICATE_SELECTION_INDEX',
        'two authorities on one side share a selection index',
      );
    }
    out.set(ready.selectionIndex, ready);
  }
  return out;
}

/** Classifies; mints nothing; hardcodes no expected count. */
export function compareR17WithCrossGenerationAuthorities(
  r17Readies: readonly A3SlotAcquisitionAuthorityReady[],
  crossReadies: readonly A3CrossGenerationSlotAcquisitionAuthorityReady[],
): CrossGenerationContinuityDelta {
  for (const ready of r17Readies) {
    if (!isA3SlotAcquisitionAuthorityReady(ready)) {
      refuseCrossGeneration('NOT_A_MINTED_R17_AUTHORITY', 'an old authority was not minted by R17');
    }
  }
  for (const ready of crossReadies) {
    if (!isA3CrossGenerationSlotAcquisitionAuthorityReady(ready)) {
      refuseCrossGeneration(
        'NOT_A_MINTED_CROSS_GENERATION_AUTHORITY',
        'a new authority was not minted by the cross-generation contract',
      );
    }
  }
  const before = indexBySelection(r17Readies);
  const after = indexBySelection(crossReadies);
  const unchanged: CrossGenerationContinuityResult[] = [];
  const changed: CrossGenerationContinuityResult[] = [];
  const retracted: number[] = [];
  for (const index of [...before.keys()].sort((x, y) => x - y)) {
    const cross = after.get(index);
    if (cross === undefined) {
      retracted.push(index);
      continue;
    }
    const result = compareR17WithCrossGenerationAuthority(before.get(index)!, cross);
    (result.classification === CROSS_GENERATION_AUTHORITY_UNCHANGED ? unchanged : changed).push(
      result,
    );
  }
  const fresh = [...after.keys()].filter((index) => !before.has(index)).sort((x, y) => x - y);
  return Object.freeze({
    kind: 'CROSS_GENERATION_AUTHORITY_CONTINUITY_ANALYSIS',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    unchanged: Object.freeze(unchanged),
    changed: Object.freeze(changed),
    retractedSelectionIndices: Object.freeze(retracted),
    newSelectionIndices: Object.freeze(fresh),
  });
}

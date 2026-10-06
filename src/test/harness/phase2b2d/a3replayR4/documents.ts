/**
 * PHASE 2B-2D — A3 R47: THE PRIVATE 5 + 1 + 7 + 7 CANONICAL DOCUMENT REPLAY VIEW.
 *
 * THERE IS NO HISTORICAL TWENTY-SLOT DOCUMENT BATCH, ON PURPOSE
 *
 *   The twenty current DEV_TRAIN document authorities were minted by four
 *   different landed binders: R21 (5 slots), R27 (1), R34 (7) and R40 (7).
 *   R47 does not convert aggregate history into objects and does not
 *   re-assemble anything. It takes the four GENUINE batches a fresh process
 *   re-minted through those unchanged binders, checks every one by its own
 *   landed brand, and holds exact references to their slots in a private,
 *   processing-only view. The view is not a document-source authority.
 *
 * EVERYTHING IS VERIFIED BEFORE ANYTHING IS MINTED
 *
 *   1. the exact R46 approval binding (`approval.ts`);
 *   2. the eight-checkpoint reproduction proof, minted for EXACTLY these four
 *      document batches (`reproduction.ts`);
 *   3. each batch and each slot by its own landed brand; exactly 5 + 1 + 7 + 7;
 *      DEV_TRAIN only; twenty distinct selection slots; each slot's own
 *      authority (through the layer's own provenance accessor) on the same
 *      selection slot and split;
 *   4. all twenty private text capabilities, through each layer's own
 *      accessor - `documentTextLookupForSlotAssembly` (R21),
 *      `documentTextLookupForDeltaSlotAssembly` (R27), `...V4` (R34) and
 *      `...V5` (R40) - one capability per slot, never a global text map;
 *   5. the genuine Governance V4 and V5 snapshots behind R34 and R40 (by
 *      identity), the twenty slots equal EXACTLY the V5 DEV_TRAIN READY slots,
 *      and the canonical V4 -> V5 continuity classifies R21 + R27 + R34 as the
 *      thirteen UNCHANGED authorities and R40 as the seven NEW ones, with zero
 *      changed and zero retracted - derived, never caller-supplied;
 *   6. the exact twenty-slot document population (617 / 611 / 1234 / 5 / 6 /
 *      5 / 611 / 617 / 1234).
 *
 *   Only then are the twenty replay slots and the view minted. One view per
 *   proof; a second binding attempt refuses.
 *
 * THIS MODULE ISSUES NO SQL and reads no text: it only captures capabilities.
 */
import type { DocumentTextLookup } from '../sd7/nearDuplicatePairs.js';
import type {
  A3DocumentSourceEntry,
  A3SlotExactDuplicateAggregates,
} from '../a3documents/types.js';
import {
  documentTextLookupForSlotAssembly,
  durableEvidenceForDocumentSourceAssembly,
  isA3DevTrainDocumentSourceBatch,
  isA3DevTrainSlotDocumentSourceAssembly,
} from '../a3documents/devTrain.js';
import {
  documentTextLookupForDeltaSlotAssembly,
  evidenceDeltaForDeltaSlotAssembly,
  isA3DevTrainDocumentSourceDeltaBatchV2,
  isA3DevTrainSlotDocumentSourceAssemblyDeltaV2,
} from '../a3documentsV2/devTrain.js';
import {
  documentTextLookupForDeltaSlotAssemblyV4,
  evidenceDeltaForDeltaSlotAssemblyV4,
  isA3DevTrainDocumentSourceDeltaBatchV4,
  isA3DevTrainSlotDocumentSourceAssemblyDeltaV4,
} from '../a3documentsV4/devTrain.js';
import {
  documentTextLookupForDeltaSlotAssemblyV5,
  evidenceDeltaForDeltaSlotAssemblyV5,
  isA3DevTrainDocumentSourceDeltaBatchV5,
  isA3DevTrainSlotDocumentSourceAssemblyDeltaV5,
} from '../a3documentsV5/devTrain.js';
import { isCommittedGovernanceSnapshotV4 } from '../a3governanceV4/snapshotV4.js';
import { deriveDevTrainAuthorityContinuityV4ToV5 } from '../a3governanceV5/devTrainContinuity.js';
import {
  isCommittedGovernanceSnapshotV5,
  readyAuthoritiesOfV5,
} from '../a3governanceV5/snapshotV5.js';
import type { A3CrossGenerationSlotAcquisitionAuthorityReady } from '../a3crossGenerationSlotAuthority/types.js';
import { SD7_R4_METHODOLOGY_VERSION } from '../sd7R4/types.js';
import { requireR46ApprovalBinding } from './approval.js';
import { refuseR47 } from './refusal.js';
import { reproducedDocumentBatchesForProof } from './reproduction.js';
import {
  R47_EXPECTED_DOCUMENT_POPULATION,
  R47_REPLAY_SPLIT,
  R47_STRATUM_SLOT_COUNTS,
  type A3R4DevTrainCanonicalDocumentReplayView,
  type A3R4DocumentPopulation,
  type A3R4DocumentReplaySlot,
  type R47DocumentStratum,
} from './types.js';

// ---------------------------------------------------------------------------
// A. PRIVATE BRANDS AND CAPABILITIES.
// ---------------------------------------------------------------------------

const MINTED_SLOTS = new WeakSet<object>();
const MINTED_VIEWS = new WeakSet<object>();
const TEXT_LOOKUP_BY_SLOT = new WeakMap<object, DocumentTextLookup>();
const V5_READY_BY_SLOT = new WeakMap<object, A3CrossGenerationSlotAcquisitionAuthorityReady>();
const SOURCE_SLOT_BY_REPLAY_SLOT = new WeakMap<object, object>();
const VIEW_BY_PROOF = new WeakMap<object, A3R4DevTrainCanonicalDocumentReplayView>();
const IN_FLIGHT_PROOFS = new WeakSet<object>();

export function isA3R4DocumentReplaySlot(value: unknown): value is A3R4DocumentReplaySlot {
  return typeof value === 'object' && value !== null && MINTED_SLOTS.has(value);
}

export function isA3R4DevTrainCanonicalDocumentReplayView(
  value: unknown,
): value is A3R4DevTrainCanonicalDocumentReplayView {
  return typeof value === 'object' && value !== null && MINTED_VIEWS.has(value);
}

/**
 * The private text capability captured for exactly ONE minted replay slot:
 * the genuine source slot's own landed lookup. Anything else refuses.
 */
export function textLookupForR4ReplaySlot(slot: unknown): DocumentTextLookup {
  const lookup =
    typeof slot === 'object' && slot !== null ? TEXT_LOOKUP_BY_SLOT.get(slot) : undefined;
  if (lookup === undefined || !isA3R4DocumentReplaySlot(slot)) {
    refuseR47('R47_TEXT_CAPABILITY_UNAVAILABLE', 'the value is not a minted R47 replay slot');
  }
  return lookup;
}

/** The genuine Governance V5 READY authority of one minted replay slot. */
export function v5ReadyAuthorityForR4ReplaySlot(
  slot: unknown,
): A3CrossGenerationSlotAcquisitionAuthorityReady | undefined {
  if (!isA3R4DocumentReplaySlot(slot)) return undefined;
  return V5_READY_BY_SLOT.get(slot);
}

/** The genuine source document slot a minted replay slot references. */
export function sourceSlotForR4ReplaySlot(slot: unknown): object | undefined {
  if (!isA3R4DocumentReplaySlot(slot)) return undefined;
  return SOURCE_SLOT_BY_REPLAY_SLOT.get(slot);
}

// ---------------------------------------------------------------------------
// B. THE FOUR GENUINE LAYERS.
// ---------------------------------------------------------------------------

interface GenuineSourceSlot {
  readonly selectionIndex: number;
  readonly split: string;
  readonly exactDuplicate: A3SlotExactDuplicateAggregates;
  readonly documents: readonly A3DocumentSourceEntry[];
  readonly candidateObservationCount: number;
}

interface CollectedSlot {
  readonly stratum: R47DocumentStratum;
  readonly source: GenuineSourceSlot;
  readonly authority: { readonly selectionIndex: number; readonly split: string } | undefined;
  readonly lookupOf: () => DocumentTextLookup;
}

interface Layer {
  readonly stratum: R47DocumentStratum;
  readonly isBatch: (value: unknown) => boolean;
  readonly isSlot: (value: unknown) => boolean;
  readonly authorityOf: (
    slot: unknown,
  ) => { readonly selectionIndex: number; readonly split: string } | undefined;
  readonly lookupOf: (slot: unknown) => DocumentTextLookup;
}

const LAYERS: Readonly<Record<'r21' | 'r27' | 'r34' | 'r40', Layer>> = Object.freeze({
  r21: {
    stratum: 'R21_V1',
    isBatch: isA3DevTrainDocumentSourceBatch,
    isSlot: isA3DevTrainSlotDocumentSourceAssembly,
    authorityOf: (slot) => durableEvidenceForDocumentSourceAssembly(slot)?.authority,
    lookupOf: documentTextLookupForSlotAssembly,
  },
  r27: {
    stratum: 'R27_V2',
    isBatch: isA3DevTrainDocumentSourceDeltaBatchV2,
    isSlot: isA3DevTrainSlotDocumentSourceAssemblyDeltaV2,
    authorityOf: (slot) => evidenceDeltaForDeltaSlotAssembly(slot)?.authority,
    lookupOf: documentTextLookupForDeltaSlotAssembly,
  },
  r34: {
    stratum: 'R34_V4',
    isBatch: isA3DevTrainDocumentSourceDeltaBatchV4,
    isSlot: isA3DevTrainSlotDocumentSourceAssemblyDeltaV4,
    authorityOf: (slot) => evidenceDeltaForDeltaSlotAssemblyV4(slot)?.authority,
    lookupOf: documentTextLookupForDeltaSlotAssemblyV4,
  },
  r40: {
    stratum: 'R40_V5',
    isBatch: isA3DevTrainDocumentSourceDeltaBatchV5,
    isSlot: isA3DevTrainSlotDocumentSourceAssemblyDeltaV5,
    authorityOf: (slot) => evidenceDeltaForDeltaSlotAssemblyV5(slot)?.authority,
    lookupOf: documentTextLookupForDeltaSlotAssemblyV5,
  },
});

function collectLayer(layer: Layer, batch: unknown): readonly CollectedSlot[] {
  if (!layer.isBatch(batch)) {
    refuseR47(
      'R47_DOCUMENT_SOURCE_NOT_GENUINE',
      `the ${layer.stratum} input is not a batch minted by its own landed binder in this process`,
    );
  }
  const record = batch as { readonly split?: unknown; readonly items?: unknown };
  if (record.split !== R47_REPLAY_SPLIT) {
    refuseR47('R47_DOCUMENT_SLOT_NOT_DEV_TRAIN', `the ${layer.stratum} batch is outside DEV_TRAIN`);
  }
  const items = Array.isArray(record.items) ? (record.items as readonly unknown[]) : [];
  if (items.length !== R47_STRATUM_SLOT_COUNTS[layer.stratum]) {
    refuseR47(
      'R47_DOCUMENT_STRATUM_COUNT_MISMATCH',
      `the ${layer.stratum} batch holds ${String(items.length)} slots, not ${String(R47_STRATUM_SLOT_COUNTS[layer.stratum])}`,
    );
  }
  return items.map((item, position) => {
    if (!layer.isSlot(item)) {
      refuseR47(
        'R47_DOCUMENT_SOURCE_NOT_GENUINE',
        `${layer.stratum} slot at position ${position} is not a slot its own binder minted`,
      );
    }
    const source = item as GenuineSourceSlot;
    if (source.split !== R47_REPLAY_SPLIT) {
      refuseR47(
        'R47_DOCUMENT_SLOT_NOT_DEV_TRAIN',
        `${layer.stratum} slot at position ${position} is outside DEV_TRAIN`,
      );
    }
    return Object.freeze({
      stratum: layer.stratum,
      source,
      authority: layer.authorityOf(item),
      lookupOf: () => layer.lookupOf(item),
    });
  });
}

// ---------------------------------------------------------------------------
// C. POPULATION.
// ---------------------------------------------------------------------------

/** Sums over the slots' own canonical objects. Counts only. */
export function documentPopulationOf(
  slots: readonly {
    readonly exactDuplicate: A3SlotExactDuplicateAggregates;
    readonly documents: readonly A3DocumentSourceEntry[];
    readonly candidateObservationCount: number;
  }[],
): A3R4DocumentPopulation {
  let sourceRows = 0;
  let slotLocalDocuments = 0;
  let candidateObservations = 0;
  let exactDuplicateGroups = 0;
  let exactDuplicateRowsRemoved = 0;
  let multiSourceDocuments = 0;
  let r10Preparations = 0;
  let r10SourceRows = 0;
  let r10CandidateObservations = 0;
  for (const slot of slots) {
    sourceRows += slot.exactDuplicate.rowCount;
    slotLocalDocuments += slot.documents.length;
    candidateObservations += slot.candidateObservationCount;
    exactDuplicateGroups += slot.exactDuplicate.duplicateGroupCount;
    exactDuplicateRowsRemoved += slot.exactDuplicate.duplicateRowsRemoved;
    for (const entry of slot.documents) {
      if (entry.sourceRowCount > 1) multiSourceDocuments += 1;
      r10Preparations += 1;
      r10SourceRows += entry.scorePreparation.sourceRowScores.length;
      for (const row of entry.scorePreparation.sourceRowScores) {
        r10CandidateObservations += row.trackScores.length;
      }
    }
  }
  return Object.freeze({
    slots: slots.length,
    sourceRows,
    slotLocalDocuments,
    candidateObservations,
    exactDuplicateGroups,
    exactDuplicateRowsRemoved,
    multiSourceDocuments,
    r10Preparations,
    r10SourceRows,
    r10CandidateObservations,
  });
}

// ---------------------------------------------------------------------------
// D. THE BINDER.
// ---------------------------------------------------------------------------

export interface R47DocumentReplayViewInput {
  readonly approval: unknown;
  readonly reproductionProof: unknown;
  readonly governanceV4: unknown;
  readonly governanceV5: unknown;
  readonly r21: unknown;
  readonly r27: unknown;
  readonly r34: unknown;
  readonly r40: unknown;
}

/**
 * Verifies every input authority, then mints the private replay view. No
 * text is read and no graph is measured here.
 */
export function bindR4DevTrainCanonicalDocumentReplayView(
  input: R47DocumentReplayViewInput,
): A3R4DevTrainCanonicalDocumentReplayView {
  requireR46ApprovalBinding(input.approval);

  const proved = reproducedDocumentBatchesForProof(input.reproductionProof);
  if (
    proved === undefined ||
    proved.r21 !== input.r21 ||
    proved.r27 !== input.r27 ||
    proved.r34 !== input.r34 ||
    proved.r40 !== input.r40
  ) {
    refuseR47(
      'R47_HISTORICAL_REPRODUCTION_NOT_PROVED',
      'the four document batches were not proved to reproduce their committed censuses',
    );
  }
  const proof = input.reproductionProof as object;
  if (VIEW_BY_PROOF.has(proof) || IN_FLIGHT_PROOFS.has(proof)) {
    refuseR47(
      'R47_DOCUMENT_VIEW_ALREADY_BOUND',
      'this reproduction already produced a replay view',
    );
  }

  // §3: brands, strata, split, slots, provenance.
  const collected = [
    ...collectLayer(LAYERS.r21, input.r21),
    ...collectLayer(LAYERS.r27, input.r27),
    ...collectLayer(LAYERS.r34, input.r34),
    ...collectLayer(LAYERS.r40, input.r40),
  ];
  const seen = new Set<number>();
  collected.forEach((slot, position) => {
    const index = slot.source.selectionIndex;
    if (!Number.isSafeInteger(index) || seen.has(index)) {
      refuseR47(
        'R47_DUPLICATE_SELECTION_SLOT',
        `replay position ${position} repeats a selection slot`,
      );
    }
    seen.add(index);
    if (
      slot.authority === undefined ||
      slot.authority.selectionIndex !== index ||
      slot.authority.split !== R47_REPLAY_SPLIT
    ) {
      refuseR47(
        'R47_DOCUMENT_SOURCE_NOT_GENUINE',
        `replay position ${position} does not trace to a DEV_TRAIN authority on its own slot`,
      );
    }
  });

  // §4: every private text capability, before anything else is minted.
  const lookups = collected.map((slot, position) => {
    try {
      const lookup = slot.lookupOf();
      if (typeof lookup !== 'function') throw new TypeError('not a function');
      return lookup;
    } catch (error) {
      refuseR47(
        'R47_TEXT_CAPABILITY_UNAVAILABLE',
        `replay position ${position} has no private text capability`,
        { cause: error },
      );
    }
  });

  // §5: Governance V5 coverage and V4 -> V5 continuity, derived.
  const g4 = input.governanceV4;
  const g5 = input.governanceV5;
  if (
    !isCommittedGovernanceSnapshotV4(g4) ||
    !isCommittedGovernanceSnapshotV5(g5) ||
    (input.r34 as { governanceSnapshotV4?: unknown }).governanceSnapshotV4 !== g4 ||
    (input.r40 as { governanceSnapshotV5?: unknown }).governanceSnapshotV5 !== g5
  ) {
    refuseR47(
      'STOP_R47_GOVERNANCE_V5_COVERAGE_MISMATCH',
      'the governance snapshots are not the genuine V4 / V5 snapshots behind R34 and R40',
    );
  }
  const v5DevTrain = readyAuthoritiesOfV5(g5).filter((ready) => ready.split === R47_REPLAY_SPLIT);
  const readyByIndex = new Map(v5DevTrain.map((ready) => [ready.selectionIndex, ready] as const));
  const continuity = deriveDevTrainAuthorityContinuityV4ToV5(g4, g5);
  const unchanged = new Set(continuity.unchanged.map((result) => result.selectionIndex));
  const added = new Set(continuity.newSelectionIndices);
  const historicalIndices = collected
    .filter((slot) => slot.stratum !== 'R40_V5')
    .map((slot) => slot.source.selectionIndex);
  const v5Indices = collected
    .filter((slot) => slot.stratum === 'R40_V5')
    .map((slot) => slot.source.selectionIndex);
  const sameSet = (a: ReadonlySet<number>, b: readonly number[]): boolean =>
    a.size === b.length && b.every((value) => a.has(value));
  if (
    readyByIndex.size !== v5DevTrain.length ||
    !sameSet(new Set(readyByIndex.keys()), [...seen]) ||
    continuity.changed.length !== 0 ||
    continuity.retractedSelectionIndices.length !== 0 ||
    !sameSet(unchanged, historicalIndices) ||
    !sameSet(added, v5Indices) ||
    collected.some(
      (slot) =>
        slot.stratum === 'R40_V5' &&
        slot.authority !== readyByIndex.get(slot.source.selectionIndex),
    )
  ) {
    refuseR47(
      'STOP_R47_GOVERNANCE_V5_COVERAGE_MISMATCH',
      'the replay slots are not exactly the current V5 DEV_TRAIN READY slots, 13 unchanged + 7 new',
    );
  }

  // §6: the exact population.
  const population = documentPopulationOf(collected.map((slot) => slot.source));
  for (const [key, expected] of Object.entries(R47_EXPECTED_DOCUMENT_POPULATION)) {
    if (population[key as keyof A3R4DocumentPopulation] !== expected) {
      refuseR47(
        'STOP_R47_DOCUMENT_POPULATION_MISMATCH',
        `the twenty-slot document population ${key} is not the canonical value`,
      );
    }
  }

  // Mint: all checks passed.
  IN_FLIGHT_PROOFS.add(proof);
  try {
    const slots = collected.map((slot, position) => {
      const minted: A3R4DocumentReplaySlot = Object.freeze({
        kind: 'A3_R4_DEV_TRAIN_CANONICAL_DOCUMENT_REPLAY_SLOT' as const,
        authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
        selectionIndex: slot.source.selectionIndex,
        split: R47_REPLAY_SPLIT,
        stratum: slot.stratum,
        governanceContinuity:
          slot.stratum === 'R40_V5'
            ? ('V5_ADDITION' as const)
            : ('V4_TO_V5_UNCHANGED_HISTORICAL' as const),
        exactDuplicate: slot.source.exactDuplicate,
        documents: slot.source.documents,
        candidateObservationCount: slot.source.candidateObservationCount,
      });
      MINTED_SLOTS.add(minted);
      TEXT_LOOKUP_BY_SLOT.set(minted, lookups[position]!);
      V5_READY_BY_SLOT.set(minted, readyByIndex.get(slot.source.selectionIndex)!);
      SOURCE_SLOT_BY_REPLAY_SLOT.set(minted, slot.source);
      return minted;
    });
    const view: A3R4DevTrainCanonicalDocumentReplayView = Object.freeze({
      kind: 'A3R4DevTrainCanonicalDocumentReplayView' as const,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
      split: R47_REPLAY_SPLIT,
      isNewDocumentAuthority: false as const,
      methodologyVersion: SD7_R4_METHODOLOGY_VERSION,
      slots: Object.freeze(slots),
    });
    MINTED_VIEWS.add(view);
    VIEW_BY_PROOF.set(proof, view);
    return view;
  } finally {
    IN_FLIGHT_PROOFS.delete(proof);
  }
}

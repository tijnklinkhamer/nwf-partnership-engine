/**
 * PHASE 2B-2D — A3 R27: THE INCREMENTAL DEV_TRAIN BINDER, AND THE ONLY PLACE
 * THAT MINTS DELTA DOCUMENT-SOURCE ASSEMBLIES.
 *
 * R26'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R26-minted `A3DevTrainDurableEvidenceDeltaBatchV2`
 *   and checks it by brand; then checks every item by brand, by the V2
 *   snapshot that produced it (by identity), by the V2 READY authority it was
 *   minted for, and by split. A clone, a spread, a literal, a deserialised
 *   copy, an R20 V1 item or batch, or an R21 document batch refuses before
 *   any assembly happens.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass.
 *
 * WHAT IS REUSED, AND WHAT IS DELIBERATELY NOT
 *
 *   Reused unchanged from R21: the pure `assembleUnboundSlotDocumentSources`
 *   (through `assembleDelta.ts`) and `documentTextLookupForUnboundSlotAssembly`.
 *   NOT reused: R21's V1 minting (`bindDevTrainDocumentSourceBatch`). It
 *   requires an R20/V1 evidence batch by brand, correctly, and is neither
 *   called nor broadened here. The five historical R21 slots are never
 *   reassembled, re-minted, wrapped or given a text lookup.
 *
 * ADDITIVE ONLY
 *
 *   Before any assembly the R26 batch must still state 0 changed, 0 removed,
 *   0 legacy evidence requests, and `unchanged + delta items` must equal the
 *   V2 DEV_TRAIN READY count DERIVED from the batch's own V2 snapshot - never
 *   a caller-supplied expected count.
 *
 * ALL OR NOTHING, AND ONE-TO-ONE
 *
 *   Every delta item is assembled unbound first; only then is anything
 *   minted. One R26 item yields at most one R27 slot assembly, and one R26
 *   batch at most one R27 batch, per process.
 *
 * THIS MODULE ISSUES NO SQL. The only database access in a real run is
 * canonical R26's own, completed before this binder is called.
 */
import type { DocumentTextLookup } from '../sd7/nearDuplicatePairs.js';
import { documentTextLookupForUnboundSlotAssembly } from '../a3documents/assemble.js';
import type { UnboundA3SlotDocumentSourceAssembly } from '../a3documents/types.js';
import { readyAuthoritiesOfV2 } from '../a3governanceV2/snapshotV2.js';
import {
  durableEvidenceDeltaV2ForReadyAuthority,
  governanceSnapshotV2ForDurableEvidenceDelta,
  isA3DevTrainDurableEvidenceDeltaBatchV2,
  isA3DurableAcquisitionEvidenceDeltaV2,
} from '../a3evidenceV2/devTrain.js';
import type {
  A3DevTrainDurableEvidenceDeltaBatchV2,
  A3DurableAcquisitionEvidenceDeltaV2,
} from '../a3evidenceV2/types.js';
import { assembleDeltaItemsAllOrNothing } from './assembleDelta.js';
import { refuseV2Document } from './refusal.js';
import {
  R27_DOCUMENT_SPLIT,
  type A3DevTrainDocumentSourceDeltaBatchV2,
  type A3DevTrainSlotDocumentSourceAssemblyDeltaV2,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_SLOT_ASSEMBLIES = new WeakSet<object>();
const MINTED_DELTA_DOCUMENT_BATCHES = new WeakSet<object>();
const EVIDENCE_DELTA_BY_SLOT_ASSEMBLY = new WeakMap<object, A3DurableAcquisitionEvidenceDeltaV2>();
const SLOT_ASSEMBLY_BY_EVIDENCE_DELTA = new WeakMap<
  object,
  A3DevTrainSlotDocumentSourceAssemblyDeltaV2
>();
const EVIDENCE_DELTA_BATCH_BY_DOCUMENT_BATCH = new WeakMap<
  object,
  A3DevTrainDurableEvidenceDeltaBatchV2
>();
const DOCUMENT_BATCH_BY_EVIDENCE_DELTA_BATCH = new WeakMap<
  object,
  A3DevTrainDocumentSourceDeltaBatchV2
>();
const TEXT_LOOKUP_BY_SLOT_ASSEMBLY = new WeakMap<object, DocumentTextLookup>();

/** True ONLY for a delta slot assembly this module minted in THIS process. */
export function isA3DevTrainSlotDocumentSourceAssemblyDeltaV2(
  value: unknown,
): value is A3DevTrainSlotDocumentSourceAssemblyDeltaV2 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_SLOT_ASSEMBLIES.has(value);
}

export function isA3DevTrainDocumentSourceDeltaBatchV2(
  value: unknown,
): value is A3DevTrainDocumentSourceDeltaBatchV2 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_DOCUMENT_BATCHES.has(value);
}

/** The exact R26 delta item a minted R27 slot was assembled from, or `undefined`. */
export function evidenceDeltaForDeltaSlotAssembly(
  slot: unknown,
): A3DurableAcquisitionEvidenceDeltaV2 | undefined {
  if (!isA3DevTrainSlotDocumentSourceAssemblyDeltaV2(slot)) return undefined;
  return EVIDENCE_DELTA_BY_SLOT_ASSEMBLY.get(slot);
}

/** The R27 slot minted from one R26 delta item, or `undefined`. */
export function deltaSlotAssemblyForEvidenceDelta(
  evidence: unknown,
): A3DevTrainSlotDocumentSourceAssemblyDeltaV2 | undefined {
  if (!isA3DurableAcquisitionEvidenceDeltaV2(evidence)) return undefined;
  return SLOT_ASSEMBLY_BY_EVIDENCE_DELTA.get(evidence);
}

/** The R26 delta batch a minted R27 batch was assembled from, or `undefined`. */
export function evidenceDeltaBatchForDocumentSourceDeltaBatch(
  batch: unknown,
): A3DevTrainDurableEvidenceDeltaBatchV2 | undefined {
  if (!isA3DevTrainDocumentSourceDeltaBatchV2(batch)) return undefined;
  return EVIDENCE_DELTA_BATCH_BY_DOCUMENT_BATCH.get(batch);
}

/**
 * §21. THE TEXT CAPABILITY FOR ONE MINTED R27 SLOT.
 *
 * Returns the R21 lookup captured for exactly that slot at mint time. A
 * clone, an unbound R21 assembly, a historical R21 slot or any other value
 * refuses here; an unknown digest refuses inside the underlying R21 lookup.
 * Text is processing-only: it is never placed on a returned object.
 */
export function documentTextLookupForDeltaSlotAssembly(slot: unknown): DocumentTextLookup {
  const lookup =
    typeof slot === 'object' && slot !== null ? TEXT_LOOKUP_BY_SLOT_ASSEMBLY.get(slot) : undefined;
  if (lookup === undefined || !isA3DevTrainSlotDocumentSourceAssemblyDeltaV2(slot)) {
    refuseV2Document(
      'R27_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
      'the value is not a delta slot assembly minted by the R27 binder',
    );
  }
  return lookup;
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

function requireMintedEvidenceDeltaBatch(batch: unknown): A3DevTrainDurableEvidenceDeltaBatchV2 {
  if (!isA3DevTrainDurableEvidenceDeltaBatchV2(batch)) {
    refuseV2Document(
      'R27_EVIDENCE_DELTA_NOT_MINTED_BY_R26',
      'the input is not a DEV_TRAIN evidence delta batch minted by R26 in this process',
    );
  }
  if (DOCUMENT_BATCH_BY_EVIDENCE_DELTA_BATCH.has(batch)) {
    refuseV2Document(
      'R27_DELTA_BATCH_ALREADY_ASSEMBLED',
      'this R26 delta batch already produced an R27 document-source delta batch',
    );
  }
  if (batch.split !== R27_DOCUMENT_SPLIT) {
    refuseV2Document('R27_SPLIT_NOT_SUPPORTED', 'the evidence delta batch is outside DEV_TRAIN');
  }
  return batch;
}

/** §12. The R26 coverage must still be purely additive, derived, not supplied. */
function requireAdditiveCoverage(batch: A3DevTrainDurableEvidenceDeltaBatchV2): void {
  const coverage = batch.coverage;
  const v2DevTrainReady = readyAuthoritiesOfV2(batch.governanceSnapshotV2).filter(
    (ready) => ready.split === R27_DOCUMENT_SPLIT,
  ).length;
  if (
    coverage.changedExistingCount !== 0 ||
    coverage.removedCount !== 0 ||
    coverage.legacyAuthorityEvidenceRequests !== 0 ||
    coverage.newlyBoundDeltaCount !== batch.items.length ||
    coverage.unchangedCanonicalCoverageCount + batch.items.length !==
      coverage.v2ReadyAuthorityCount ||
    coverage.v2ReadyAuthorityCount !== v2DevTrainReady
  ) {
    refuseV2Document(
      'R27_EVIDENCE_COVERAGE_NOT_ADDITIVE',
      'unchanged canonical coverage plus delta items does not equal the V2 DEV_TRAIN READY count',
    );
  }
}

/** §11. Every item: R26 brand, same V2 snapshot, R26's own mapping, DEV_TRAIN. */
function requireItemMintedForBatch(
  item: unknown,
  batch: A3DevTrainDurableEvidenceDeltaBatchV2,
  position: number,
): A3DurableAcquisitionEvidenceDeltaV2 {
  if (!isA3DurableAcquisitionEvidenceDeltaV2(item)) {
    refuseV2Document(
      'R27_EVIDENCE_DELTA_NOT_MINTED_BY_R26',
      `batch item at position ${position} is not delta evidence minted by R26`,
    );
  }
  if (governanceSnapshotV2ForDurableEvidenceDelta(item) !== batch.governanceSnapshotV2) {
    refuseV2Document(
      'R27_EVIDENCE_DELTA_NOT_MINTED_BY_R26',
      `batch item at position ${position} was minted under another V2 snapshot`,
    );
  }
  if (durableEvidenceDeltaV2ForReadyAuthority(item.authority) !== item) {
    refuseV2Document(
      'R27_EVIDENCE_DELTA_NOT_MINTED_BY_R26',
      `batch item at position ${position} is not the evidence R26 minted for its authority`,
    );
  }
  if (item.split !== R27_DOCUMENT_SPLIT || item.authority.split !== R27_DOCUMENT_SPLIT) {
    refuseV2Document(
      'R27_SPLIT_NOT_SUPPORTED',
      `batch item at position ${position} is outside DEV_TRAIN`,
    );
  }
  if (SLOT_ASSEMBLY_BY_EVIDENCE_DELTA.has(item)) {
    refuseV2Document(
      'R27_DELTA_EVIDENCE_ALREADY_ASSEMBLED',
      `batch item at position ${position} already has a minted R27 slot assembly`,
    );
  }
  return item;
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaSlot(
  item: A3DurableAcquisitionEvidenceDeltaV2,
  unbound: UnboundA3SlotDocumentSourceAssembly,
): A3DevTrainSlotDocumentSourceAssemblyDeltaV2 {
  // §21: obtained immediately before minting; held only privately.
  const lookup = documentTextLookupForUnboundSlotAssembly(unbound);
  const minted: A3DevTrainSlotDocumentSourceAssemblyDeltaV2 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V2' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: R27_DOCUMENT_SPLIT,
    // §20: R21's own objects, by reference - never rebuilt.
    exactDuplicate: unbound.exactDuplicate,
    documents: unbound.documents,
    candidateObservationCount: unbound.candidateObservationCount,
  });
  MINTED_DELTA_SLOT_ASSEMBLIES.add(minted);
  EVIDENCE_DELTA_BY_SLOT_ASSEMBLY.set(minted, item);
  SLOT_ASSEMBLY_BY_EVIDENCE_DELTA.set(item, minted);
  TEXT_LOOKUP_BY_SLOT_ASSEMBLY.set(minted, lookup);
  return minted;
}

/**
 * Mints the DEV_TRAIN document-source DELTA batch from an actual R26-minted
 * evidence delta batch. The item count is DERIVED from that batch.
 */
export function bindDevTrainDocumentSourceDeltaBatchV2(
  evidenceDeltaBatch: unknown,
): A3DevTrainDocumentSourceDeltaBatchV2 {
  const batch = requireMintedEvidenceDeltaBatch(evidenceDeltaBatch);
  requireAdditiveCoverage(batch);

  const seenSlots = new Set<number>();
  const items = batch.items.map((candidate, position) => {
    const item = requireItemMintedForBatch(candidate, batch, position);
    if (seenSlots.has(item.authority.selectionIndex)) {
      refuseV2Document(
        'R27_DELTA_BATCH_COMPOSITION_INVALID',
        `batch item at position ${position} repeats an earlier selection slot`,
      );
    }
    seenSlots.add(item.authority.selectionIndex);
    return item;
  });

  // Assemble EVERY delta item, unbound, before minting ANY of them.
  const unbound = assembleDeltaItemsAllOrNothing(items);
  if (unbound.length !== items.length) {
    refuseV2Document(
      'R27_DELTA_BATCH_COMPOSITION_INVALID',
      'not every R26 delta item produced exactly one unbound assembly',
    );
  }

  const minted = items.map((item, position) =>
    mintDeltaSlot(item, unbound[position] as UnboundA3SlotDocumentSourceAssembly),
  );
  for (const [position, slot] of minted.entries()) {
    if (
      !isA3DevTrainSlotDocumentSourceAssemblyDeltaV2(slot) ||
      evidenceDeltaForDeltaSlotAssembly(slot) !== items[position] ||
      deltaSlotAssemblyForEvidenceDelta(items[position]) !== slot
    ) {
      refuseV2Document(
        'R27_DELTA_BATCH_COMPOSITION_INVALID',
        `delta slot assembly at position ${position} does not trace to its R26 item`,
      );
    }
  }

  const documentBatch: A3DevTrainDocumentSourceDeltaBatchV2 = Object.freeze({
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V2' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R27_DOCUMENT_SPLIT,
    governanceSnapshotV2: batch.governanceSnapshotV2,
    evidenceDeltaBatch: batch,
    items: Object.freeze(minted),
  });
  MINTED_DELTA_DOCUMENT_BATCHES.add(documentBatch);
  EVIDENCE_DELTA_BATCH_BY_DOCUMENT_BATCH.set(documentBatch, batch);
  DOCUMENT_BATCH_BY_EVIDENCE_DELTA_BATCH.set(batch, documentBatch);
  return documentBatch;
}

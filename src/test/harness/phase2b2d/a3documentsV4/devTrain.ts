/**
 * PHASE 2B-2D — A3 R34: THE V4 INCREMENTAL DEV_TRAIN BINDER, AND THE ONLY
 * PLACE THAT MINTS V4 DELTA DOCUMENT-SOURCE ASSEMBLIES.
 *
 * R33'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R33-minted `A3DevTrainDurableEvidenceDeltaBatchV4`
 *   and checks it by brand, then requires the fresh-reproduction proof minted
 *   for exactly that batch; then checks every item by brand, by the V4
 *   snapshot that produced it (by identity), by the V4 READY authority it was
 *   minted for (itself minted by that same snapshot), and by split. A clone, a
 *   spread, a literal, a deserialised copy, an R26 V2 or R20 V1 evidence item
 *   or batch, or an R27 / R21 document batch refuses before any assembly.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass.
 *
 * WHAT IS REUSED, AND WHAT IS DELIBERATELY NOT
 *
 *   Reused unchanged from R21: the pure `assembleUnboundSlotDocumentSources`
 *   (through `assembleDelta.ts`) and `documentTextLookupForUnboundSlotAssembly`.
 *   NOT reused: R21's V1 minting and R27's V2 minting. They require their own
 *   upstream brands, correctly, and are neither called nor broadened here.
 *   The six historical R21 / R27 slots are never reassembled, re-minted,
 *   wrapped or given a text lookup.
 *
 * ADDITIVE ONLY
 *
 *   Before any assembly the R33 batch must still state 0 changed, 0 removed,
 *   0 legacy evidence requests, one delta request per item, and
 *   `historical + delta items` must equal the V4 DEV_TRAIN READY count
 *   DERIVED from the batch's own V4 snapshot - never a caller-supplied count.
 *
 * ALL OR NOTHING, AND ONE-TO-ONE
 *
 *   Every delta item is adapted, then assembled unbound; only then is anything
 *   minted. One R33 item yields at most one R34 slot assembly, and one R33
 *   batch at most one R34 batch, per process.
 *
 * THIS MODULE ISSUES NO SQL. The only database access in a real run is
 * canonical R33's own, completed - and its pool closed - before this binder
 * is called.
 */
import type { DocumentTextLookup } from '../sd7/nearDuplicatePairs.js';
import { documentTextLookupForUnboundSlotAssembly } from '../a3documents/assemble.js';
import type { UnboundA3SlotDocumentSourceAssembly } from '../a3documents/types.js';
import {
  governanceSnapshotV4ForReadyAuthority,
  readyAuthoritiesOfV4,
} from '../a3governanceV4/snapshotV4.js';
import {
  durableEvidenceDeltaV4ForReadyAuthority,
  governanceSnapshotV4ForDurableEvidenceDelta,
  isA3DevTrainDurableEvidenceDeltaBatchV4,
  isA3DurableAcquisitionEvidenceDeltaV4,
} from '../a3evidenceV4/devTrain.js';
import type {
  A3DevTrainDurableEvidenceDeltaBatchV4,
  A3DurableAcquisitionEvidenceDeltaV4,
} from '../a3evidenceV4/types.js';
import { assembleDeltaItemsAllOrNothingV4 } from './assembleDelta.js';
import { r33ReproductionProofForBatch, type R33ReproductionProof } from './r33Drift.js';
import { refuseV4Document } from './refusal.js';
import {
  R34_DOCUMENT_SPLIT,
  type A3DevTrainDocumentSourceDeltaBatchV4,
  type A3DevTrainSlotDocumentSourceAssemblyDeltaV4,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_SLOT_ASSEMBLIES = new WeakSet<object>();
const MINTED_DELTA_DOCUMENT_BATCHES = new WeakSet<object>();
const EVIDENCE_DELTA_BY_SLOT_ASSEMBLY = new WeakMap<object, A3DurableAcquisitionEvidenceDeltaV4>();
const SLOT_ASSEMBLY_BY_EVIDENCE_DELTA = new WeakMap<
  object,
  A3DevTrainSlotDocumentSourceAssemblyDeltaV4
>();
const EVIDENCE_DELTA_BATCH_BY_DOCUMENT_BATCH = new WeakMap<
  object,
  A3DevTrainDurableEvidenceDeltaBatchV4
>();
const DOCUMENT_BATCH_BY_EVIDENCE_DELTA_BATCH = new WeakMap<
  object,
  A3DevTrainDocumentSourceDeltaBatchV4
>();
const TEXT_LOOKUP_BY_SLOT_ASSEMBLY = new WeakMap<object, DocumentTextLookup>();

/** True ONLY for a V4 delta slot assembly this module minted in THIS process. */
export function isA3DevTrainSlotDocumentSourceAssemblyDeltaV4(
  value: unknown,
): value is A3DevTrainSlotDocumentSourceAssemblyDeltaV4 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_SLOT_ASSEMBLIES.has(value);
}

export function isA3DevTrainDocumentSourceDeltaBatchV4(
  value: unknown,
): value is A3DevTrainDocumentSourceDeltaBatchV4 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_DOCUMENT_BATCHES.has(value);
}

/** The exact R33 delta item a minted R34 slot was assembled from, or `undefined`. */
export function evidenceDeltaForDeltaSlotAssemblyV4(
  slot: unknown,
): A3DurableAcquisitionEvidenceDeltaV4 | undefined {
  if (!isA3DevTrainSlotDocumentSourceAssemblyDeltaV4(slot)) return undefined;
  return EVIDENCE_DELTA_BY_SLOT_ASSEMBLY.get(slot);
}

/** The R34 slot minted from one R33 delta item, or `undefined`. */
export function deltaSlotAssemblyForEvidenceDeltaV4(
  evidence: unknown,
): A3DevTrainSlotDocumentSourceAssemblyDeltaV4 | undefined {
  if (!isA3DurableAcquisitionEvidenceDeltaV4(evidence)) return undefined;
  return SLOT_ASSEMBLY_BY_EVIDENCE_DELTA.get(evidence);
}

/** The R33 delta batch a minted R34 batch was assembled from, or `undefined`. */
export function evidenceDeltaBatchForDocumentSourceDeltaBatchV4(
  batch: unknown,
): A3DevTrainDurableEvidenceDeltaBatchV4 | undefined {
  if (!isA3DevTrainDocumentSourceDeltaBatchV4(batch)) return undefined;
  return EVIDENCE_DELTA_BATCH_BY_DOCUMENT_BATCH.get(batch);
}

/** The R34 batch minted from one R33 delta batch, or `undefined`. */
export function documentSourceDeltaBatchForEvidenceDeltaBatchV4(
  batch: unknown,
): A3DevTrainDocumentSourceDeltaBatchV4 | undefined {
  if (!isA3DevTrainDurableEvidenceDeltaBatchV4(batch)) return undefined;
  return DOCUMENT_BATCH_BY_EVIDENCE_DELTA_BATCH.get(batch);
}

/**
 * §15. THE TEXT CAPABILITY FOR ONE MINTED R34 SLOT.
 *
 * Returns the R21 lookup captured for exactly that slot at mint time. A
 * clone, an unbound R21 assembly, an R27 or R21 slot or any other value
 * refuses here; an unknown digest refuses inside the underlying R21 lookup.
 * Text is processing-only: it is never placed on a returned object.
 */
export function documentTextLookupForDeltaSlotAssemblyV4(slot: unknown): DocumentTextLookup {
  const lookup =
    typeof slot === 'object' && slot !== null ? TEXT_LOOKUP_BY_SLOT_ASSEMBLY.get(slot) : undefined;
  if (lookup === undefined || !isA3DevTrainSlotDocumentSourceAssemblyDeltaV4(slot)) {
    refuseV4Document(
      'R34_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
      'the value is not a delta slot assembly minted by the R34 binder',
    );
  }
  return lookup;
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

function requireMintedEvidenceDeltaBatch(
  batch: unknown,
  reproductionProof: unknown,
): A3DevTrainDurableEvidenceDeltaBatchV4 {
  if (!isA3DevTrainDurableEvidenceDeltaBatchV4(batch)) {
    refuseV4Document(
      'R34_EVIDENCE_DELTA_NOT_MINTED_BY_R33',
      'the input is not a DEV_TRAIN evidence delta batch minted by R33 in this process',
    );
  }
  const proved: R33ReproductionProof | undefined = r33ReproductionProofForBatch(batch);
  if (proved === undefined || proved !== reproductionProof) {
    refuseV4Document(
      'R34_R33_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'this R33 batch was not proved to reproduce the committed R33 census',
    );
  }
  if (DOCUMENT_BATCH_BY_EVIDENCE_DELTA_BATCH.has(batch)) {
    refuseV4Document(
      'R34_DELTA_BATCH_ALREADY_ASSEMBLED',
      'this R33 delta batch already produced an R34 document-source delta batch',
    );
  }
  if (batch.split !== R34_DOCUMENT_SPLIT) {
    refuseV4Document('R34_SPLIT_NOT_SUPPORTED', 'the evidence delta batch is outside DEV_TRAIN');
  }
  return batch;
}

/** §7. The R33 coverage must still be purely additive, derived, not supplied. */
function requireAdditiveCoverage(batch: A3DevTrainDurableEvidenceDeltaBatchV4): void {
  const coverage = batch.coverage;
  const v4DevTrainReady = readyAuthoritiesOfV4(batch.governanceSnapshotV4).filter(
    (ready) => ready.split === R34_DOCUMENT_SPLIT,
  ).length;
  if (
    coverage.changedExistingCount !== 0 ||
    coverage.removedCount !== 0 ||
    coverage.legacyAuthorityEvidenceRequests !== 0 ||
    coverage.deltaAuthorityEvidenceRequests !== batch.items.length ||
    coverage.newlyBoundDeltaCount !== batch.items.length ||
    coverage.unchangedCanonicalCoverageCount !== coverage.historicalCanonicalCoverageCount ||
    coverage.historicalCanonicalCoverageCount + batch.items.length !==
      coverage.v4DevTrainReadyCount ||
    coverage.coverageAfterExpansionCount !== coverage.v4DevTrainReadyCount ||
    coverage.v4DevTrainReadyCount !== v4DevTrainReady
  ) {
    refuseV4Document(
      'R34_EVIDENCE_COVERAGE_NOT_ADDITIVE',
      'historical canonical coverage plus delta items does not equal the V4 DEV_TRAIN READY count',
    );
  }
}

/** §7. Every item: R33 brand, same V4 snapshot, R33's own mapping, V4 READY, DEV_TRAIN. */
function requireItemMintedForBatch(
  item: unknown,
  batch: A3DevTrainDurableEvidenceDeltaBatchV4,
  position: number,
): A3DurableAcquisitionEvidenceDeltaV4 {
  if (!isA3DurableAcquisitionEvidenceDeltaV4(item)) {
    refuseV4Document(
      'R34_EVIDENCE_DELTA_NOT_MINTED_BY_R33',
      `batch item at position ${position} is not delta evidence minted by R33`,
    );
  }
  if (
    governanceSnapshotV4ForDurableEvidenceDelta(item) !== batch.governanceSnapshotV4 ||
    item.governanceSnapshotV4 !== batch.governanceSnapshotV4
  ) {
    refuseV4Document(
      'R34_EVIDENCE_DELTA_NOT_MINTED_BY_R33',
      `batch item at position ${position} was minted under another V4 snapshot`,
    );
  }
  if (durableEvidenceDeltaV4ForReadyAuthority(item.authority) !== item) {
    refuseV4Document(
      'R34_EVIDENCE_DELTA_NOT_MINTED_BY_R33',
      `batch item at position ${position} is not the evidence R33 minted for its authority`,
    );
  }
  if (governanceSnapshotV4ForReadyAuthority(item.authority) !== batch.governanceSnapshotV4) {
    refuseV4Document(
      'R34_EVIDENCE_DELTA_NOT_MINTED_BY_R33',
      `batch item at position ${position} carries an authority not minted by the batch's V4 snapshot`,
    );
  }
  if (item.split !== R34_DOCUMENT_SPLIT || item.authority.split !== R34_DOCUMENT_SPLIT) {
    refuseV4Document(
      'R34_SPLIT_NOT_SUPPORTED',
      `batch item at position ${position} is outside DEV_TRAIN`,
    );
  }
  if (SLOT_ASSEMBLY_BY_EVIDENCE_DELTA.has(item)) {
    refuseV4Document(
      'R34_DELTA_EVIDENCE_ALREADY_ASSEMBLED',
      `batch item at position ${position} already has a minted R34 slot assembly`,
    );
  }
  return item;
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaSlot(
  item: A3DurableAcquisitionEvidenceDeltaV4,
  unbound: UnboundA3SlotDocumentSourceAssembly,
): A3DevTrainSlotDocumentSourceAssemblyDeltaV4 {
  // §15: obtained immediately before minting; held only privately.
  const lookup = documentTextLookupForUnboundSlotAssembly(unbound);
  const minted: A3DevTrainSlotDocumentSourceAssemblyDeltaV4 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V4' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: R34_DOCUMENT_SPLIT,
    // R21's own objects, by reference - never rebuilt.
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
 * Mints the DEV_TRAIN document-source V4 DELTA batch from an actual
 * R33-minted evidence delta batch whose fresh reproduction was proved. The
 * item count is DERIVED from that batch.
 */
export function bindDevTrainDocumentSourceDeltaBatchV4(
  evidenceDeltaBatch: unknown,
  reproductionProof: unknown,
): A3DevTrainDocumentSourceDeltaBatchV4 {
  const batch = requireMintedEvidenceDeltaBatch(evidenceDeltaBatch, reproductionProof);
  requireAdditiveCoverage(batch);

  const seenSlots = new Set<number>();
  const seenAuthorities = new Set<object>();
  const seenRuns = new Set<string>();
  const items = batch.items.map((candidate, position) => {
    const item = requireItemMintedForBatch(candidate, batch, position);
    if (
      seenSlots.has(item.authority.selectionIndex) ||
      seenAuthorities.has(item.authority) ||
      seenRuns.has(item.evidence.run.id)
    ) {
      refuseV4Document(
        'R34_DELTA_BATCH_COMPOSITION_INVALID',
        `batch item at position ${position} repeats an earlier slot, authority or durable run`,
      );
    }
    seenSlots.add(item.authority.selectionIndex);
    seenAuthorities.add(item.authority);
    seenRuns.add(item.evidence.run.id);
    return item;
  });

  // Adapt and assemble EVERY delta item, unbound, before minting ANY of them.
  const unbound = assembleDeltaItemsAllOrNothingV4(items);
  if (unbound.length !== items.length) {
    refuseV4Document(
      'R34_DELTA_BATCH_COMPOSITION_INVALID',
      'not every R33 delta item produced exactly one unbound assembly',
    );
  }

  const minted = items.map((item, position) =>
    mintDeltaSlot(item, unbound[position] as UnboundA3SlotDocumentSourceAssembly),
  );
  for (const [position, slot] of minted.entries()) {
    if (
      !isA3DevTrainSlotDocumentSourceAssemblyDeltaV4(slot) ||
      evidenceDeltaForDeltaSlotAssemblyV4(slot) !== items[position] ||
      deltaSlotAssemblyForEvidenceDeltaV4(items[position]) !== slot
    ) {
      refuseV4Document(
        'R34_DELTA_BATCH_COMPOSITION_INVALID',
        `delta slot assembly at position ${position} does not trace to its R33 item`,
      );
    }
  }

  const documentBatch: A3DevTrainDocumentSourceDeltaBatchV4 = Object.freeze({
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V4' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R34_DOCUMENT_SPLIT,
    governanceSnapshotV4: batch.governanceSnapshotV4,
    evidenceDeltaBatch: batch,
    items: Object.freeze(minted),
  });
  MINTED_DELTA_DOCUMENT_BATCHES.add(documentBatch);
  EVIDENCE_DELTA_BATCH_BY_DOCUMENT_BATCH.set(documentBatch, batch);
  DOCUMENT_BATCH_BY_EVIDENCE_DELTA_BATCH.set(batch, documentBatch);
  return documentBatch;
}

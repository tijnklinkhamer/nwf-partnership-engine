/**
 * PHASE 2B-2D — A3 R40: THE V5 INCREMENTAL DEV_TRAIN BINDER, AND THE ONLY
 * PLACE THAT MINTS V5 DELTA DOCUMENT-SOURCE ASSEMBLIES.
 *
 * R39'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R39-minted `A3DevTrainDurableEvidenceDeltaBatchV5`
 *   and checks it by brand; then requires the fresh-reproduction proof minted
 *   for exactly that batch (which itself required the upstream pool closed),
 *   and the historical R34 / R37 document-coverage proof closed against
 *   exactly that batch; then checks every item by brand, by the V5 snapshot
 *   that produced it (by identity), by R39's own authority -> evidence
 *   mapping, by the V5 READY authority it was minted for (itself minted by
 *   that same snapshot), and by split - ALL of them before the first R21 call.
 *   A clone, a spread, a literal, a deserialised copy, an R33 / R26 / R20
 *   evidence item or batch, an R34 / R27 / R21 document batch, a V5 snapshot
 *   or READY, or a committed census refuses before any assembly.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass, and no expected
 *   item count is accepted: the count is derived from the batch.
 *
 * WHAT IS REUSED, AND WHAT IS DELIBERATELY NOT
 *
 *   Reused unchanged from R21: the pure `assembleUnboundSlotDocumentSources`
 *   (through `assembleDelta.ts`) and `documentTextLookupForUnboundSlotAssembly`.
 *   NOT reused: R21's V1, R27's V2 and R34's V4 minting and adapters. They
 *   require their own upstream brands, correctly, and are neither called nor
 *   broadened here. The thirteen historical slots are never reassembled,
 *   re-minted, wrapped or given a text lookup.
 *
 * ALL OR NOTHING, AND ONE-TO-ONE
 *
 *   Every delta item is verified, then adapted, then assembled unbound; only
 *   then is anything minted. One R39 item yields at most one R40 slot
 *   assembly, and one R39 batch at most one R40 batch, per process.
 *
 * THIS MODULE ISSUES NO SQL. The only database access in a real run is
 * canonical R39's own, completed - and its pool closed - before this binder
 * can be called.
 */
import type { DocumentTextLookup } from '../sd7/nearDuplicatePairs.js';
import { documentTextLookupForUnboundSlotAssembly } from '../a3documents/assemble.js';
import type { UnboundA3SlotDocumentSourceAssembly } from '../a3documents/types.js';
import { isA3CrossGenerationSlotAcquisitionAuthorityReady } from '../a3crossGenerationSlotAuthority/resolve.js';
import {
  governanceSnapshotV5ForReadyAuthority,
  readyAuthoritiesOfV5,
} from '../a3governanceV5/snapshotV5.js';
import {
  durableEvidenceDeltaV5ForReadyAuthority,
  governanceSnapshotV5ForDurableEvidenceDelta,
  isA3DevTrainDurableEvidenceDeltaBatchV5,
  isA3DurableAcquisitionEvidenceDeltaV5,
} from '../a3evidenceV5/devTrain.js';
import type {
  A3DevTrainDurableEvidenceDeltaBatchV5,
  A3DurableAcquisitionEvidenceDeltaV5,
} from '../a3evidenceV5/types.js';
import { assembleDeltaItemsAllOrNothingV5 } from './assembleDelta.js';
import { historicalDocumentCoverageProofForBatch } from './history.js';
import { r39ReproductionProofForBatch } from './r39Drift.js';
import { refuseV5Document } from './refusal.js';
import {
  R40_DOCUMENT_SPLIT,
  type A3DevTrainDocumentSourceDeltaBatchV5,
  type A3DevTrainSlotDocumentSourceAssemblyDeltaV5,
  type HistoricalV5DocumentCoverageProof,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_SLOT_ASSEMBLIES = new WeakSet<object>();
const MINTED_DELTA_DOCUMENT_BATCHES = new WeakSet<object>();
const EVIDENCE_DELTA_BY_SLOT_ASSEMBLY = new WeakMap<object, A3DurableAcquisitionEvidenceDeltaV5>();
const SLOT_ASSEMBLY_BY_EVIDENCE_DELTA = new WeakMap<
  object,
  A3DevTrainSlotDocumentSourceAssemblyDeltaV5
>();
const EVIDENCE_DELTA_BATCH_BY_DOCUMENT_BATCH = new WeakMap<
  object,
  A3DevTrainDurableEvidenceDeltaBatchV5
>();
const DOCUMENT_BATCH_BY_EVIDENCE_DELTA_BATCH = new WeakMap<
  object,
  A3DevTrainDocumentSourceDeltaBatchV5
>();
const TEXT_LOOKUP_BY_SLOT_ASSEMBLY = new WeakMap<object, DocumentTextLookup>();
const R21_CALLS_BY_DOCUMENT_BATCH = new WeakMap<object, number>();
/** R39 batches with a binding attempt currently in progress. */
const IN_FLIGHT_EVIDENCE_BATCHES = new WeakSet<object>();

/** True ONLY for a V5 delta slot assembly this module minted in THIS process. */
export function isA3DevTrainSlotDocumentSourceAssemblyDeltaV5(
  value: unknown,
): value is A3DevTrainSlotDocumentSourceAssemblyDeltaV5 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_SLOT_ASSEMBLIES.has(value);
}

export function isA3DevTrainDocumentSourceDeltaBatchV5(
  value: unknown,
): value is A3DevTrainDocumentSourceDeltaBatchV5 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_DOCUMENT_BATCHES.has(value);
}

/** The exact R39 delta item a minted R40 slot was assembled from, or `undefined`. */
export function evidenceDeltaForDeltaSlotAssemblyV5(
  slot: unknown,
): A3DurableAcquisitionEvidenceDeltaV5 | undefined {
  if (!isA3DevTrainSlotDocumentSourceAssemblyDeltaV5(slot)) return undefined;
  return EVIDENCE_DELTA_BY_SLOT_ASSEMBLY.get(slot);
}

/** The R40 slot minted from one R39 delta item, or `undefined`. */
export function deltaSlotAssemblyForEvidenceDeltaV5(
  evidence: unknown,
): A3DevTrainSlotDocumentSourceAssemblyDeltaV5 | undefined {
  if (!isA3DurableAcquisitionEvidenceDeltaV5(evidence)) return undefined;
  return SLOT_ASSEMBLY_BY_EVIDENCE_DELTA.get(evidence);
}

/** The R39 delta batch a minted R40 batch was assembled from, or `undefined`. */
export function evidenceDeltaBatchForDocumentSourceDeltaBatchV5(
  batch: unknown,
): A3DevTrainDurableEvidenceDeltaBatchV5 | undefined {
  if (!isA3DevTrainDocumentSourceDeltaBatchV5(batch)) return undefined;
  return EVIDENCE_DELTA_BATCH_BY_DOCUMENT_BATCH.get(batch);
}

/** The R40 batch minted from one R39 delta batch, or `undefined`. */
export function documentSourceDeltaBatchForEvidenceDeltaBatchV5(
  batch: unknown,
): A3DevTrainDocumentSourceDeltaBatchV5 | undefined {
  if (!isA3DevTrainDurableEvidenceDeltaBatchV5(batch)) return undefined;
  return DOCUMENT_BATCH_BY_EVIDENCE_DELTA_BATCH.get(batch);
}

/** How many R21 assembler calls produced this minted R40 batch, or `undefined`. */
export function r21AssemblyCallsForDocumentSourceDeltaBatchV5(batch: unknown): number | undefined {
  if (!isA3DevTrainDocumentSourceDeltaBatchV5(batch)) return undefined;
  return R21_CALLS_BY_DOCUMENT_BATCH.get(batch);
}

/**
 * §28. THE TEXT CAPABILITY FOR ONE MINTED R40 SLOT.
 *
 * Returns the R21 lookup captured for exactly that slot at mint time. A
 * clone, a literal, an unbound R21 assembly, an R34 / R27 / R21 slot or any
 * other value refuses here; an unknown digest refuses inside the underlying
 * R21 lookup. Text is processing-only: it is never placed on a returned object.
 */
export function documentTextLookupForDeltaSlotAssemblyV5(slot: unknown): DocumentTextLookup {
  const lookup =
    typeof slot === 'object' && slot !== null ? TEXT_LOOKUP_BY_SLOT_ASSEMBLY.get(slot) : undefined;
  if (lookup === undefined || !isA3DevTrainSlotDocumentSourceAssemblyDeltaV5(slot)) {
    refuseV5Document(
      'R40_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
      'the value is not a delta slot assembly minted by the R40 binder',
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
  historicalProof: unknown,
): A3DevTrainDurableEvidenceDeltaBatchV5 {
  if (!isA3DevTrainDurableEvidenceDeltaBatchV5(batch)) {
    refuseV5Document(
      'R40_EVIDENCE_DELTA_NOT_MINTED_BY_R39',
      'the input is not a DEV_TRAIN evidence delta batch minted by R39 in this process',
    );
  }
  const proved = r39ReproductionProofForBatch(batch);
  if (proved === undefined || proved !== reproductionProof) {
    refuseV5Document(
      'R40_R39_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'this R39 batch was not proved to reproduce the committed R39 census',
    );
  }
  const history = historicalDocumentCoverageProofForBatch(batch);
  if (history === undefined || history !== historicalProof) {
    refuseV5Document(
      'R40_HISTORICAL_DOCUMENT_COVERAGE_NOT_PROVED_FOR_BATCH',
      'the historical R34 / R37 document coverage was not proved against this R39 batch',
    );
  }
  if (DOCUMENT_BATCH_BY_EVIDENCE_DELTA_BATCH.has(batch) || IN_FLIGHT_EVIDENCE_BATCHES.has(batch)) {
    refuseV5Document(
      'R40_DELTA_BATCH_ALREADY_ASSEMBLED',
      'this R39 delta batch already produced an R40 document-source delta batch',
    );
  }
  if (batch.split !== R40_DOCUMENT_SPLIT) {
    refuseV5Document('R40_SPLIT_NOT_SUPPORTED', 'the evidence delta batch is outside DEV_TRAIN');
  }
  return batch;
}

/** §12. The R39 coverage must still be purely additive, derived, not supplied. */
function requireAdditiveCoverage(
  batch: A3DevTrainDurableEvidenceDeltaBatchV5,
  history: HistoricalV5DocumentCoverageProof,
): void {
  const coverage = batch.coverage;
  const items = batch.items.length;
  const v5DevTrainReady = readyAuthoritiesOfV5(batch.governanceSnapshotV5).filter(
    (ready) => ready.split === R40_DOCUMENT_SPLIT,
  ).length;
  const historical = coverage.historicalCanonicalEvidenceCoverageCount;
  if (
    coverage.changedExistingCount !== 0 ||
    coverage.removedCount !== 0 ||
    coverage.legacyAuthorityEvidenceRequests !== 0 ||
    coverage.deltaAuthorityEvidenceRequests !== items ||
    coverage.newlyBoundDeltaCount !== items ||
    coverage.unchangedCanonicalCoverageCount !== historical ||
    coverage.v4DevTrainReadyCount !== historical ||
    historical + items !== coverage.v5DevTrainReadyCount ||
    coverage.coverageAfterExpansionCount !== coverage.v5DevTrainReadyCount ||
    coverage.v5DevTrainReadyCount !== v5DevTrainReady ||
    coverage.historicalCanonicalReadinessCoverageCount !== historical ||
    coverage.downstreamReadinessCoverageCountAfterR39 !== historical ||
    history.documentSlotCount !== historical ||
    history.r37ReadinessSlotCount !== historical
  ) {
    refuseV5Document(
      'R40_EVIDENCE_COVERAGE_NOT_ADDITIVE',
      'historical canonical coverage plus delta items does not equal the V5 DEV_TRAIN READY count',
    );
  }
}

/** §13. Every item: R39 brand, same V5 snapshot, R39's own mapping, V5 READY, DEV_TRAIN. */
function requireItemMintedForBatch(
  item: unknown,
  batch: A3DevTrainDurableEvidenceDeltaBatchV5,
  position: number,
): A3DurableAcquisitionEvidenceDeltaV5 {
  if (!isA3DurableAcquisitionEvidenceDeltaV5(item)) {
    refuseV5Document(
      'R40_EVIDENCE_DELTA_NOT_MINTED_BY_R39',
      `batch item at position ${position} is not delta evidence minted by R39`,
    );
  }
  if (
    governanceSnapshotV5ForDurableEvidenceDelta(item) !== batch.governanceSnapshotV5 ||
    item.governanceSnapshotV5 !== batch.governanceSnapshotV5
  ) {
    refuseV5Document(
      'R40_EVIDENCE_DELTA_NOT_MINTED_BY_R39',
      `batch item at position ${position} was minted under another V5 snapshot`,
    );
  }
  if (durableEvidenceDeltaV5ForReadyAuthority(item.authority) !== item) {
    refuseV5Document(
      'R40_EVIDENCE_DELTA_NOT_MINTED_BY_R39',
      `batch item at position ${position} is not the evidence R39 minted for its authority`,
    );
  }
  if (
    !isA3CrossGenerationSlotAcquisitionAuthorityReady(item.authority) ||
    governanceSnapshotV5ForReadyAuthority(item.authority) !== batch.governanceSnapshotV5
  ) {
    refuseV5Document(
      'R40_EVIDENCE_DELTA_NOT_MINTED_BY_R39',
      `batch item at position ${position} carries an authority not minted by the batch's V5 snapshot`,
    );
  }
  if (item.split !== R40_DOCUMENT_SPLIT || item.authority.split !== R40_DOCUMENT_SPLIT) {
    refuseV5Document(
      'R40_SPLIT_NOT_SUPPORTED',
      `batch item at position ${position} is outside DEV_TRAIN`,
    );
  }
  if (SLOT_ASSEMBLY_BY_EVIDENCE_DELTA.has(item)) {
    refuseV5Document(
      'R40_DELTA_EVIDENCE_ALREADY_ASSEMBLED',
      `batch item at position ${position} already has a minted R40 slot assembly`,
    );
  }
  return item;
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaSlot(
  item: A3DurableAcquisitionEvidenceDeltaV5,
  unbound: UnboundA3SlotDocumentSourceAssembly,
): A3DevTrainSlotDocumentSourceAssemblyDeltaV5 {
  // §28: obtained immediately before minting; held only privately.
  const lookup = documentTextLookupForUnboundSlotAssembly(unbound);
  const minted: A3DevTrainSlotDocumentSourceAssemblyDeltaV5 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V5' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: R40_DOCUMENT_SPLIT,
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
 * Mints the DEV_TRAIN document-source V5 DELTA batch from an actual
 * R39-minted evidence delta batch whose fresh reproduction and historical
 * document coverage were proved. The item count is DERIVED from that batch.
 */
export function bindDevTrainDocumentSourceDeltaBatchV5(
  evidenceDeltaBatch: unknown,
  reproductionProof: unknown,
  historicalProof: unknown,
): A3DevTrainDocumentSourceDeltaBatchV5 {
  const batch = requireMintedEvidenceDeltaBatch(
    evidenceDeltaBatch,
    reproductionProof,
    historicalProof,
  );
  requireAdditiveCoverage(batch, historicalProof as HistoricalV5DocumentCoverageProof);

  // Every item verified BEFORE any is adapted or assembled.
  const seenSlots = new Set<number>();
  const seenAuthorities = new Set<object>();
  const seenItems = new Set<object>();
  const seenRuns = new Set<string>();
  const items = batch.items.map((candidate, position) => {
    const item = requireItemMintedForBatch(candidate, batch, position);
    if (
      seenItems.has(item) ||
      seenSlots.has(item.authority.selectionIndex) ||
      seenAuthorities.has(item.authority) ||
      seenRuns.has(item.evidence.run.id)
    ) {
      refuseV5Document(
        'R40_DELTA_BATCH_COMPOSITION_INVALID',
        `batch item at position ${position} repeats an earlier item, slot, authority or durable run`,
      );
    }
    seenItems.add(item);
    seenSlots.add(item.authority.selectionIndex);
    seenAuthorities.add(item.authority);
    seenRuns.add(item.evidence.run.id);
    return item;
  });

  IN_FLIGHT_EVIDENCE_BATCHES.add(batch);
  try {
    // Adapt and assemble EVERY delta item, unbound, before minting ANY of them.
    const { assemblies, r21AssemblyCalls } = assembleDeltaItemsAllOrNothingV5(items);
    if (assemblies.length !== items.length || r21AssemblyCalls !== items.length) {
      refuseV5Document(
        'R40_DELTA_BATCH_COMPOSITION_INVALID',
        'not every R39 delta item produced exactly one unbound assembly from one R21 call',
      );
    }

    const minted = items.map((item, position) =>
      mintDeltaSlot(item, assemblies[position] as UnboundA3SlotDocumentSourceAssembly),
    );
    for (const [position, slot] of minted.entries()) {
      if (
        !isA3DevTrainSlotDocumentSourceAssemblyDeltaV5(slot) ||
        evidenceDeltaForDeltaSlotAssemblyV5(slot) !== items[position] ||
        deltaSlotAssemblyForEvidenceDeltaV5(items[position]) !== slot
      ) {
        refuseV5Document(
          'R40_DELTA_BATCH_COMPOSITION_INVALID',
          `delta slot assembly at position ${position} does not trace to its R39 item`,
        );
      }
    }

    const documentBatch: A3DevTrainDocumentSourceDeltaBatchV5 = Object.freeze({
      kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V5' as const,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
      split: R40_DOCUMENT_SPLIT,
      governanceSnapshotV5: batch.governanceSnapshotV5,
      items: Object.freeze(minted),
    });
    MINTED_DELTA_DOCUMENT_BATCHES.add(documentBatch);
    EVIDENCE_DELTA_BATCH_BY_DOCUMENT_BATCH.set(documentBatch, batch);
    DOCUMENT_BATCH_BY_EVIDENCE_DELTA_BATCH.set(batch, documentBatch);
    R21_CALLS_BY_DOCUMENT_BATCH.set(documentBatch, r21AssemblyCalls);
    return documentBatch;
  } finally {
    IN_FLIGHT_EVIDENCE_BATCHES.delete(batch);
  }
}

/**
 * PHASE 2B-2D — A3 R35: THE V4 INCREMENTAL DEV_TRAIN GRAPH BINDER, AND THE
 * ONLY PLACE THAT MINTS V4 DELTA SD7 GRAPHS.
 *
 * R34'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R34-minted `A3DevTrainDocumentSourceDeltaBatchV4`
 *   and checks it by brand; requires the fresh-reproduction proof minted for
 *   exactly that batch (identity, not equality); checks that it traces to the
 *   exact R33 batch it stores, both ways, under the exact V4 snapshot it
 *   stores; then checks every slot by R34 brand, by the R33 item at the same
 *   position (by identity, both ways), by selection slot and by split. A
 *   clone, a spread, a literal, a deserialised copy, an R27 / R21 document
 *   slot or batch, an R33 evidence batch or the committed R34 census refuses
 *   before any measurement happens.
 *
 *   Text comes ONLY from R34's private capability,
 *   `documentTextLookupForDeltaSlotAssemblyV4(slot)`, handed straight to R22's
 *   pure measurement. R35 never reaches R33 rows, never reads page text and
 *   never reconstructs, wraps or caches a lookup.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass.
 *
 * DELTA ONLY
 *
 *   The loop runs over `batch.items` and nothing else. No historical R21 /
 *   R27 slot and no historical R22 / R28 graph is obtained, wrapped,
 *   re-measured or re-minted.
 *
 * ALL OR NOTHING, AND ONE-TO-ONE
 *
 *   Every slot is verified and every text capability obtained first; every
 *   delta slot is then measured unbound; only then is anything minted. One R34
 *   slot yields at most one R35 graph, and one R34 batch at most one R35
 *   batch, per process.
 *
 * THIS MODULE ISSUES NO SQL. The only database access in a real run is
 * canonical R33's own, completed - and its pool closed - before R34 and this
 * binder are called.
 */
import {
  deltaSlotAssemblyForEvidenceDeltaV4,
  documentSourceDeltaBatchForEvidenceDeltaBatchV4,
  documentTextLookupForDeltaSlotAssemblyV4,
  evidenceDeltaBatchForDocumentSourceDeltaBatchV4,
  evidenceDeltaForDeltaSlotAssemblyV4,
  isA3DevTrainDocumentSourceDeltaBatchV4,
  isA3DevTrainSlotDocumentSourceAssemblyDeltaV4,
} from '../a3documentsV4/devTrain.js';
import type {
  A3DevTrainDocumentSourceDeltaBatchV4,
  A3DevTrainSlotDocumentSourceAssemblyDeltaV4,
} from '../a3documentsV4/types.js';
import { readyAuthoritiesOfV4 } from '../a3governanceV4/snapshotV4.js';
import { measureDeltaSlotGraphsAllOrNothingV4 } from './measureDelta.js';
import { r34ReproductionProofForBatch, type R34ReproductionProof } from './r34Drift.js';
import { refuseV4Graph } from './refusal.js';
import {
  R35_GRAPH_SPLIT,
  type A3DevTrainSd7GraphDeltaBatchV4,
  type A3DevTrainSlotSd7GraphMeasurementDeltaV4,
  type UnboundDeltaSlotGraphV4,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_GRAPHS = new WeakSet<object>();
const MINTED_DELTA_GRAPH_BATCHES = new WeakSet<object>();
const DOCUMENT_SLOT_BY_DELTA_GRAPH = new WeakMap<
  object,
  A3DevTrainSlotDocumentSourceAssemblyDeltaV4
>();
const DELTA_GRAPH_BY_DOCUMENT_SLOT = new WeakMap<
  object,
  A3DevTrainSlotSd7GraphMeasurementDeltaV4
>();
const DOCUMENT_BATCH_BY_GRAPH_BATCH = new WeakMap<object, A3DevTrainDocumentSourceDeltaBatchV4>();
const GRAPH_BATCH_BY_DOCUMENT_BATCH = new WeakMap<object, A3DevTrainSd7GraphDeltaBatchV4>();

/** True ONLY for a V4 delta graph this module minted in THIS process. */
export function isA3DevTrainSlotSd7GraphMeasurementDeltaV4(
  value: unknown,
): value is A3DevTrainSlotSd7GraphMeasurementDeltaV4 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_GRAPHS.has(value);
}

export function isA3DevTrainSd7GraphDeltaBatchV4(
  value: unknown,
): value is A3DevTrainSd7GraphDeltaBatchV4 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_GRAPH_BATCHES.has(value);
}

/** The exact R34 delta slot a minted R35 graph was measured from, or `undefined`. */
export function documentSourceDeltaSlotForDeltaGraphV4(
  graph: unknown,
): A3DevTrainSlotDocumentSourceAssemblyDeltaV4 | undefined {
  if (!isA3DevTrainSlotSd7GraphMeasurementDeltaV4(graph)) return undefined;
  return DOCUMENT_SLOT_BY_DELTA_GRAPH.get(graph);
}

/** The R35 graph minted from one R34 delta slot, or `undefined`. */
export function deltaGraphForDocumentSourceDeltaSlotV4(
  slot: unknown,
): A3DevTrainSlotSd7GraphMeasurementDeltaV4 | undefined {
  if (!isA3DevTrainSlotDocumentSourceAssemblyDeltaV4(slot)) return undefined;
  return DELTA_GRAPH_BY_DOCUMENT_SLOT.get(slot);
}

/** The R34 batch a minted R35 graph batch was measured from, or `undefined`. */
export function documentSourceDeltaBatchForGraphDeltaBatchV4(
  batch: unknown,
): A3DevTrainDocumentSourceDeltaBatchV4 | undefined {
  if (!isA3DevTrainSd7GraphDeltaBatchV4(batch)) return undefined;
  return DOCUMENT_BATCH_BY_GRAPH_BATCH.get(batch);
}

/** The R35 graph batch minted from one R34 batch, or `undefined`. */
export function graphDeltaBatchForDocumentSourceDeltaBatchV4(
  batch: unknown,
): A3DevTrainSd7GraphDeltaBatchV4 | undefined {
  if (!isA3DevTrainDocumentSourceDeltaBatchV4(batch)) return undefined;
  return GRAPH_BATCH_BY_DOCUMENT_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

/** §9. R34 brand, proof by identity, exact R33 batch both ways, exact V4 snapshot, DEV_TRAIN. */
function requireMintedDocumentDeltaBatch(
  batch: unknown,
  reproductionProof: unknown,
): A3DevTrainDocumentSourceDeltaBatchV4 {
  if (!isA3DevTrainDocumentSourceDeltaBatchV4(batch)) {
    refuseV4Graph(
      'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
      'the input is not a DEV_TRAIN document-source delta batch minted by R34 in this process',
    );
  }
  const proved: R34ReproductionProof | undefined = r34ReproductionProofForBatch(batch);
  if (proved === undefined || proved !== reproductionProof) {
    refuseV4Graph(
      'R35_R34_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'this R34 batch was not proved to reproduce the committed R34 census',
    );
  }
  if (GRAPH_BATCH_BY_DOCUMENT_BATCH.has(batch)) {
    refuseV4Graph(
      'R35_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED',
      'this R34 delta batch already produced an R35 graph delta batch',
    );
  }
  const evidenceBatch = evidenceDeltaBatchForDocumentSourceDeltaBatchV4(batch);
  if (
    evidenceBatch === undefined ||
    evidenceBatch !== batch.evidenceDeltaBatch ||
    documentSourceDeltaBatchForEvidenceDeltaBatchV4(evidenceBatch) !== batch ||
    evidenceBatch.governanceSnapshotV4 !== batch.governanceSnapshotV4 ||
    evidenceBatch.items.length !== batch.items.length
  ) {
    refuseV4Graph(
      'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
      'the R34 delta batch does not trace to its exact R33 batch and V4 snapshot',
    );
  }
  if (batch.split !== R35_GRAPH_SPLIT || evidenceBatch.split !== R35_GRAPH_SPLIT) {
    refuseV4Graph(
      'R35_SPLIT_NOT_SUPPORTED',
      'the document-source delta batch is outside DEV_TRAIN',
    );
  }
  return batch;
}

/**
 * §9. Upstream coverage must still be purely additive: 0 changed, 0 removed,
 * 0 legacy evidence requests, one delta request per item, and historical
 * coverage plus delta items equal to the V4 DEV_TRAIN READY count DERIVED
 * from the batch's own V4 snapshot. The proof's R34 counts must agree.
 * Nothing here is caller-supplied.
 */
function requireAdditiveCoverage(
  batch: A3DevTrainDocumentSourceDeltaBatchV4,
  proof: R34ReproductionProof,
): void {
  const coverage = batch.evidenceDeltaBatch.coverage;
  const v4DevTrainReady = readyAuthoritiesOfV4(batch.governanceSnapshotV4).filter(
    (ready) => ready.split === R35_GRAPH_SPLIT,
  ).length;
  const deltaDocuments = batch.items.reduce((sum, slot) => sum + slot.documents.length, 0);
  if (
    coverage.changedExistingCount !== 0 ||
    coverage.removedCount !== 0 ||
    coverage.legacyAuthorityEvidenceRequests !== 0 ||
    coverage.deltaAuthorityEvidenceRequests !== batch.items.length ||
    coverage.newlyBoundDeltaCount !== batch.items.length ||
    coverage.unchangedCanonicalCoverageCount !== coverage.historicalCanonicalCoverageCount ||
    coverage.historicalCanonicalCoverageCount + batch.items.length !==
      coverage.v4DevTrainReadyCount ||
    coverage.v4DevTrainReadyCount !== v4DevTrainReady ||
    proof.historicalDocumentSourceSlots !== coverage.historicalCanonicalCoverageCount ||
    proof.deltaSlots !== batch.items.length ||
    proof.deltaSlotLocalDocuments !== deltaDocuments
  ) {
    refuseV4Graph(
      'R35_DOCUMENT_SOURCE_COVERAGE_NOT_ADDITIVE',
      'historical coverage plus delta slots does not equal the V4 DEV_TRAIN READY coverage',
    );
  }
}

/** §9. Every slot: R34 brand, the R33 item at the same position, both ways. */
function requireSlotMintedForBatch(
  slot: unknown,
  batch: A3DevTrainDocumentSourceDeltaBatchV4,
  position: number,
): A3DevTrainSlotDocumentSourceAssemblyDeltaV4 {
  if (!isA3DevTrainSlotDocumentSourceAssemblyDeltaV4(slot)) {
    refuseV4Graph(
      'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
      `batch slot at position ${position} is not a delta slot assembly minted by R34`,
    );
  }
  const evidence = evidenceDeltaForDeltaSlotAssemblyV4(slot);
  if (
    evidence === undefined ||
    batch.evidenceDeltaBatch.items[position] !== evidence ||
    deltaSlotAssemblyForEvidenceDeltaV4(evidence) !== slot ||
    evidence.authority.selectionIndex !== slot.selectionIndex
  ) {
    refuseV4Graph(
      'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
      `batch slot at position ${position} does not trace to its R33 item in this batch`,
    );
  }
  if (
    slot.split !== R35_GRAPH_SPLIT ||
    evidence.split !== R35_GRAPH_SPLIT ||
    evidence.authority.split !== R35_GRAPH_SPLIT
  ) {
    refuseV4Graph(
      'R35_SPLIT_NOT_SUPPORTED',
      `batch slot at position ${position} is outside DEV_TRAIN`,
    );
  }
  if (DELTA_GRAPH_BY_DOCUMENT_SLOT.has(slot)) {
    refuseV4Graph(
      'R35_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED',
      `batch slot at position ${position} already has a minted R35 graph`,
    );
  }
  return slot;
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaGraph(
  slot: A3DevTrainSlotDocumentSourceAssemblyDeltaV4,
  unbound: UnboundDeltaSlotGraphV4,
): A3DevTrainSlotSd7GraphMeasurementDeltaV4 {
  const minted: A3DevTrainSlotSd7GraphMeasurementDeltaV4 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_DELTA_V4' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: R35_GRAPH_SPLIT,
    // §20: R22's canonical graph object, by reference - never rebuilt.
    graph: unbound.graph,
  });
  MINTED_DELTA_GRAPHS.add(minted);
  DOCUMENT_SLOT_BY_DELTA_GRAPH.set(minted, slot);
  DELTA_GRAPH_BY_DOCUMENT_SLOT.set(slot, minted);
  return minted;
}

/**
 * Mints the DEV_TRAIN SD7 graph V4 DELTA batch from an actual R34-minted
 * document-source delta batch whose fresh reproduction was proved. The item
 * count is DERIVED from that batch - there is no caller-supplied expected
 * count. One R22 call per delta slot, and no other graph call.
 */
export function bindDevTrainSd7GraphDeltaBatchV4(
  documentDeltaBatch: unknown,
  reproductionProof: unknown,
): A3DevTrainSd7GraphDeltaBatchV4 {
  const batch = requireMintedDocumentDeltaBatch(documentDeltaBatch, reproductionProof);
  requireAdditiveCoverage(batch, reproductionProof as R34ReproductionProof);

  const seenSlots = new Set<object>();
  const seenSelectionIndices = new Set<number>();
  const slots = batch.items.map((candidate, position) => {
    const slot = requireSlotMintedForBatch(candidate, batch, position);
    if (seenSlots.has(slot) || seenSelectionIndices.has(slot.selectionIndex)) {
      refuseV4Graph(
        'R35_DELTA_BATCH_COMPOSITION_INVALID',
        `batch slot at position ${position} repeats an earlier slot`,
      );
    }
    seenSlots.add(slot);
    seenSelectionIndices.add(slot.selectionIndex);
    return slot;
  });

  // §10 / §15: every text capability obtained - through R34 only - before
  // any measurement; then every delta slot measured, unbound, before minting.
  const requests = slots.map((slot) => ({
    slot,
    textLookup: documentTextLookupForDeltaSlotAssemblyV4(slot),
  }));
  const unbound = measureDeltaSlotGraphsAllOrNothingV4(requests);
  if (unbound.length !== slots.length) {
    refuseV4Graph(
      'R35_DELTA_BATCH_COMPOSITION_INVALID',
      'not every R34 delta slot produced exactly one graph',
    );
  }

  const minted = slots.map((slot, position) =>
    mintDeltaGraph(slot, unbound[position] as UnboundDeltaSlotGraphV4),
  );
  for (const [position, graph] of minted.entries()) {
    if (
      !isA3DevTrainSlotSd7GraphMeasurementDeltaV4(graph) ||
      documentSourceDeltaSlotForDeltaGraphV4(graph) !== slots[position] ||
      deltaGraphForDocumentSourceDeltaSlotV4(slots[position]) !== graph ||
      graph.graph !== unbound[position]?.graph
    ) {
      refuseV4Graph(
        'R35_DELTA_BATCH_COMPOSITION_INVALID',
        `delta graph at position ${position} does not trace to its R34 slot`,
      );
    }
  }

  const graphBatch: A3DevTrainSd7GraphDeltaBatchV4 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V4' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R35_GRAPH_SPLIT,
    governanceSnapshotV4: batch.governanceSnapshotV4,
    documentSourceDeltaBatch: batch,
    items: Object.freeze(minted),
  });
  MINTED_DELTA_GRAPH_BATCHES.add(graphBatch);
  DOCUMENT_BATCH_BY_GRAPH_BATCH.set(graphBatch, batch);
  GRAPH_BATCH_BY_DOCUMENT_BATCH.set(batch, graphBatch);
  return graphBatch;
}

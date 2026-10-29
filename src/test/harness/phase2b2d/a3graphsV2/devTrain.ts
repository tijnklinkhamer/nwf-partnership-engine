/**
 * PHASE 2B-2D — A3 R28: THE INCREMENTAL DEV_TRAIN GRAPH BINDER, AND THE ONLY
 * PLACE THAT MINTS DELTA SD7 GRAPHS.
 *
 * R27'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R27-minted `A3DevTrainDocumentSourceDeltaBatchV2`
 *   and checks it by brand; checks that it traces to the exact R26 batch it
 *   stores, under the exact V2 snapshot it stores; then checks every slot by
 *   R27 brand, by the R26 item at the same position (by identity, both ways),
 *   by selection slot and by split. A clone, a spread, a literal, a
 *   deserialised copy, a historical R21 slot or batch, or an R26 evidence
 *   batch refuses before any measurement happens.
 *
 *   Text comes ONLY from R27's private capability,
 *   `documentTextLookupForDeltaSlotAssembly(slot)`, handed straight to R22's
 *   pure measurement. R28 never reaches R26 rows, never reads page text and
 *   never reconstructs a lookup.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass.
 *
 * DELTA ONLY
 *
 *   The loop runs over `batch.items` and nothing else. No historical R21 slot
 *   and no historical R22 graph is obtained, wrapped, re-measured or re-minted.
 *
 * ALL OR NOTHING, AND ONE-TO-ONE
 *
 *   Every delta slot is measured unbound first; only then is anything minted.
 *   One R27 slot yields at most one R28 graph, and one R27 batch at most one
 *   R28 batch, per process.
 *
 * THIS MODULE ISSUES NO SQL. The only database access in a real run is
 * canonical R26's own, completed before this binder is called.
 */
import {
  deltaSlotAssemblyForEvidenceDelta,
  documentTextLookupForDeltaSlotAssembly,
  evidenceDeltaBatchForDocumentSourceDeltaBatch,
  evidenceDeltaForDeltaSlotAssembly,
  isA3DevTrainDocumentSourceDeltaBatchV2,
  isA3DevTrainSlotDocumentSourceAssemblyDeltaV2,
} from '../a3documentsV2/devTrain.js';
import type {
  A3DevTrainDocumentSourceDeltaBatchV2,
  A3DevTrainSlotDocumentSourceAssemblyDeltaV2,
} from '../a3documentsV2/types.js';
import { measureDeltaSlotGraphsAllOrNothing } from './measureDelta.js';
import { refuseV2Graph } from './refusal.js';
import {
  R28_GRAPH_SPLIT,
  type A3DevTrainSd7GraphDeltaBatchV2,
  type A3DevTrainSlotSd7GraphMeasurementDeltaV2,
  type UnboundDeltaSlotGraph,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_GRAPHS = new WeakSet<object>();
const MINTED_DELTA_GRAPH_BATCHES = new WeakSet<object>();
const DOCUMENT_SLOT_BY_DELTA_GRAPH = new WeakMap<
  object,
  A3DevTrainSlotDocumentSourceAssemblyDeltaV2
>();
const DELTA_GRAPH_BY_DOCUMENT_SLOT = new WeakMap<
  object,
  A3DevTrainSlotSd7GraphMeasurementDeltaV2
>();
const DOCUMENT_BATCH_BY_GRAPH_BATCH = new WeakMap<object, A3DevTrainDocumentSourceDeltaBatchV2>();
const GRAPH_BATCH_BY_DOCUMENT_BATCH = new WeakMap<object, A3DevTrainSd7GraphDeltaBatchV2>();

/** True ONLY for a delta graph this module minted in THIS process. */
export function isA3DevTrainSlotSd7GraphMeasurementDeltaV2(
  value: unknown,
): value is A3DevTrainSlotSd7GraphMeasurementDeltaV2 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_GRAPHS.has(value);
}

export function isA3DevTrainSd7GraphDeltaBatchV2(
  value: unknown,
): value is A3DevTrainSd7GraphDeltaBatchV2 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_GRAPH_BATCHES.has(value);
}

/** The exact R27 delta slot a minted R28 graph was measured from, or `undefined`. */
export function documentSourceDeltaSlotForDeltaGraph(
  graph: unknown,
): A3DevTrainSlotDocumentSourceAssemblyDeltaV2 | undefined {
  if (!isA3DevTrainSlotSd7GraphMeasurementDeltaV2(graph)) return undefined;
  return DOCUMENT_SLOT_BY_DELTA_GRAPH.get(graph);
}

/** The R28 graph minted from one R27 delta slot, or `undefined`. */
export function deltaGraphForDocumentSourceDeltaSlot(
  slot: unknown,
): A3DevTrainSlotSd7GraphMeasurementDeltaV2 | undefined {
  if (!isA3DevTrainSlotDocumentSourceAssemblyDeltaV2(slot)) return undefined;
  return DELTA_GRAPH_BY_DOCUMENT_SLOT.get(slot);
}

/** The R27 batch a minted R28 graph batch was measured from, or `undefined`. */
export function documentSourceDeltaBatchForGraphDeltaBatch(
  batch: unknown,
): A3DevTrainDocumentSourceDeltaBatchV2 | undefined {
  if (!isA3DevTrainSd7GraphDeltaBatchV2(batch)) return undefined;
  return DOCUMENT_BATCH_BY_GRAPH_BATCH.get(batch);
}

/** The R28 graph batch minted from one R27 batch, or `undefined`. */
export function graphDeltaBatchForDocumentSourceDeltaBatch(
  batch: unknown,
): A3DevTrainSd7GraphDeltaBatchV2 | undefined {
  if (!isA3DevTrainDocumentSourceDeltaBatchV2(batch)) return undefined;
  return GRAPH_BATCH_BY_DOCUMENT_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

/** §10 / §11. R27 brand, exact R26 batch by identity, exact V2 snapshot, DEV_TRAIN. */
function requireMintedDocumentDeltaBatch(batch: unknown): A3DevTrainDocumentSourceDeltaBatchV2 {
  if (!isA3DevTrainDocumentSourceDeltaBatchV2(batch)) {
    refuseV2Graph(
      'R28_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R27',
      'the input is not a DEV_TRAIN document-source delta batch minted by R27 in this process',
    );
  }
  if (GRAPH_BATCH_BY_DOCUMENT_BATCH.has(batch)) {
    refuseV2Graph(
      'R28_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED',
      'this R27 delta batch already produced an R28 graph delta batch',
    );
  }
  const evidenceBatch = evidenceDeltaBatchForDocumentSourceDeltaBatch(batch);
  if (
    evidenceBatch === undefined ||
    evidenceBatch !== batch.evidenceDeltaBatch ||
    evidenceBatch.governanceSnapshotV2 !== batch.governanceSnapshotV2 ||
    evidenceBatch.items.length !== batch.items.length
  ) {
    refuseV2Graph(
      'R28_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R27',
      'the R27 delta batch does not trace to its exact R26 batch and V2 snapshot',
    );
  }
  if (batch.split !== R28_GRAPH_SPLIT || evidenceBatch.split !== R28_GRAPH_SPLIT) {
    refuseV2Graph(
      'R28_SPLIT_NOT_SUPPORTED',
      'the document-source delta batch is outside DEV_TRAIN',
    );
  }
  return batch;
}

/**
 * §13. Upstream coverage must still be purely additive: 0 changed, 0 removed,
 * 0 legacy evidence requests, every delta item assembled, and unchanged
 * canonical coverage plus delta slots equal to the V2 DEV_TRAIN coverage the
 * R26 mint derived from its own snapshot. Nothing here is caller-supplied.
 */
function requireAdditiveCoverage(batch: A3DevTrainDocumentSourceDeltaBatchV2): void {
  const coverage = batch.evidenceDeltaBatch.coverage;
  if (
    coverage.changedExistingCount !== 0 ||
    coverage.removedCount !== 0 ||
    coverage.legacyAuthorityEvidenceRequests !== 0 ||
    coverage.newlyBoundDeltaCount !== batch.items.length ||
    coverage.unchangedCanonicalCoverageCount + batch.items.length !== coverage.v2ReadyAuthorityCount
  ) {
    refuseV2Graph(
      'R28_DOCUMENT_SOURCE_COVERAGE_NOT_ADDITIVE',
      'unchanged canonical coverage plus delta slots does not equal the V2 DEV_TRAIN coverage',
    );
  }
}

/** §12. Every slot: R27 brand, the R26 item at the same position, both ways. */
function requireSlotMintedForBatch(
  slot: unknown,
  batch: A3DevTrainDocumentSourceDeltaBatchV2,
  position: number,
): A3DevTrainSlotDocumentSourceAssemblyDeltaV2 {
  if (!isA3DevTrainSlotDocumentSourceAssemblyDeltaV2(slot)) {
    refuseV2Graph(
      'R28_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R27',
      `batch slot at position ${position} is not a delta slot assembly minted by R27`,
    );
  }
  const evidence = evidenceDeltaForDeltaSlotAssembly(slot);
  if (
    evidence === undefined ||
    batch.evidenceDeltaBatch.items[position] !== evidence ||
    deltaSlotAssemblyForEvidenceDelta(evidence) !== slot ||
    evidence.authority.selectionIndex !== slot.selectionIndex
  ) {
    refuseV2Graph(
      'R28_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R27',
      `batch slot at position ${position} does not trace to its R26 item in this batch`,
    );
  }
  if (
    slot.split !== R28_GRAPH_SPLIT ||
    evidence.split !== R28_GRAPH_SPLIT ||
    evidence.authority.split !== R28_GRAPH_SPLIT
  ) {
    refuseV2Graph(
      'R28_SPLIT_NOT_SUPPORTED',
      `batch slot at position ${position} is outside DEV_TRAIN`,
    );
  }
  if (DELTA_GRAPH_BY_DOCUMENT_SLOT.has(slot)) {
    refuseV2Graph(
      'R28_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED',
      `batch slot at position ${position} already has a minted R28 graph`,
    );
  }
  return slot;
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaGraph(
  slot: A3DevTrainSlotDocumentSourceAssemblyDeltaV2,
  unbound: UnboundDeltaSlotGraph,
): A3DevTrainSlotSd7GraphMeasurementDeltaV2 {
  const minted: A3DevTrainSlotSd7GraphMeasurementDeltaV2 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_DELTA_V2' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: R28_GRAPH_SPLIT,
    // §18: R22's canonical graph object, by reference - never rebuilt.
    graph: unbound.graph,
  });
  MINTED_DELTA_GRAPHS.add(minted);
  DOCUMENT_SLOT_BY_DELTA_GRAPH.set(minted, slot);
  DELTA_GRAPH_BY_DOCUMENT_SLOT.set(slot, minted);
  return minted;
}

/**
 * Mints the DEV_TRAIN SD7 graph DELTA batch from an actual R27-minted
 * document-source delta batch. The item count is DERIVED from that batch -
 * there is no caller-supplied expected count. One R22 call per delta slot,
 * and no other graph call.
 */
export function bindDevTrainSd7GraphDeltaBatchV2(
  documentDeltaBatch: unknown,
): A3DevTrainSd7GraphDeltaBatchV2 {
  const batch = requireMintedDocumentDeltaBatch(documentDeltaBatch);
  requireAdditiveCoverage(batch);

  const seenSlots = new Set<object>();
  const seenSelectionIndices = new Set<number>();
  const slots = batch.items.map((candidate, position) => {
    const slot = requireSlotMintedForBatch(candidate, batch, position);
    if (seenSlots.has(slot) || seenSelectionIndices.has(slot.selectionIndex)) {
      refuseV2Graph(
        'R28_DELTA_BATCH_COMPOSITION_INVALID',
        `batch slot at position ${position} repeats an earlier slot`,
      );
    }
    seenSlots.add(slot);
    seenSelectionIndices.add(slot.selectionIndex);
    return slot;
  });

  // §15 / §16: measure EVERY delta slot, unbound, before minting ANY of them.
  const unbound = measureDeltaSlotGraphsAllOrNothing(
    slots.map((slot) => ({ slot, textLookup: documentTextLookupForDeltaSlotAssembly(slot) })),
  );
  if (unbound.length !== slots.length) {
    refuseV2Graph(
      'R28_DELTA_BATCH_COMPOSITION_INVALID',
      'not every R27 delta slot produced exactly one graph',
    );
  }

  const minted = slots.map((slot, position) =>
    mintDeltaGraph(slot, unbound[position] as UnboundDeltaSlotGraph),
  );
  for (const [position, graph] of minted.entries()) {
    if (
      !isA3DevTrainSlotSd7GraphMeasurementDeltaV2(graph) ||
      documentSourceDeltaSlotForDeltaGraph(graph) !== slots[position] ||
      deltaGraphForDocumentSourceDeltaSlot(slots[position]) !== graph ||
      graph.graph !== unbound[position]?.graph
    ) {
      refuseV2Graph(
        'R28_DELTA_BATCH_COMPOSITION_INVALID',
        `delta graph at position ${position} does not trace to its R27 slot`,
      );
    }
  }

  const graphBatch: A3DevTrainSd7GraphDeltaBatchV2 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V2' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R28_GRAPH_SPLIT,
    governanceSnapshotV2: batch.governanceSnapshotV2,
    documentSourceDeltaBatch: batch,
    items: Object.freeze(minted),
  });
  MINTED_DELTA_GRAPH_BATCHES.add(graphBatch);
  DOCUMENT_BATCH_BY_GRAPH_BATCH.set(graphBatch, batch);
  GRAPH_BATCH_BY_DOCUMENT_BATCH.set(batch, graphBatch);
  return graphBatch;
}

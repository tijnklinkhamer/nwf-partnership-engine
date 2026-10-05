/**
 * PHASE 2B-2D — A3 R41: THE V5 INCREMENTAL DEV_TRAIN GRAPH BINDER, AND THE
 * ONLY PLACE THAT MINTS V5 DELTA SD7 GRAPHS.
 *
 * R40'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R40-minted `A3DevTrainDocumentSourceDeltaBatchV5`
 *   and checks it by brand; requires the fresh-reproduction proof AND the
 *   historical graph-coverage proof minted for exactly that batch (identity,
 *   not equality); checks that it traces to its exact R39 batch both ways,
 *   under the V5 snapshot it stores; then checks every slot by R40 brand, by
 *   the R39 item at the same position (by identity, both ways), by selection
 *   slot and by split - ALL before any text capability is obtained. A clone, a
 *   spread, a literal, a deserialised copy, an R34 / R27 / R21 document slot or
 *   batch, an R39 evidence batch, a V5 snapshot or READY or the committed R40
 *   census refuses before any measurement happens.
 *
 *   Text comes ONLY from R40's private capability,
 *   `documentTextLookupForDeltaSlotAssemblyV5(slot)`, handed straight to R22's
 *   pure measurement. R41 never reaches R39 rows, never reads page text and
 *   never reconstructs, wraps or caches a lookup.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass, and no expected
 *   item count is accepted: the count is derived from the batch.
 *
 * WHAT IS REUSED, AND WHAT IS DELIBERATELY NOT
 *
 *   Reused unchanged from R22: `measureUnboundSlotSd7Graph` and
 *   `requireCanonicalGraphStructure` (through `measureDelta.ts`). NOT reused:
 *   R22's V1, R28's V2 and R35's V4 minting and adapters. They require their
 *   own upstream brands, correctly, and are neither called nor broadened here.
 *
 * DELTA ONLY
 *
 *   The loop runs over `batch.items` and nothing else. No historical slot and
 *   no historical graph is obtained, wrapped, re-measured or re-minted.
 *
 * ALL OR NOTHING, AND ONE-TO-ONE
 *
 *   Every slot is verified and every text capability obtained first; every
 *   delta slot is then measured unbound; only then is anything minted. One R40
 *   slot yields at most one R41 graph, and one R40 batch at most one R41
 *   batch, per process.
 *
 * THIS MODULE ISSUES NO SQL. The only database access in a real run is
 * canonical R39's own, completed - and its pool closed - before R40 and this
 * binder are called.
 */
import {
  deltaSlotAssemblyForEvidenceDeltaV5,
  documentSourceDeltaBatchForEvidenceDeltaBatchV5,
  documentTextLookupForDeltaSlotAssemblyV5,
  evidenceDeltaBatchForDocumentSourceDeltaBatchV5,
  evidenceDeltaForDeltaSlotAssemblyV5,
  isA3DevTrainDocumentSourceDeltaBatchV5,
  isA3DevTrainSlotDocumentSourceAssemblyDeltaV5,
} from '../a3documentsV5/devTrain.js';
import type {
  A3DevTrainDocumentSourceDeltaBatchV5,
  A3DevTrainSlotDocumentSourceAssemblyDeltaV5,
} from '../a3documentsV5/types.js';
import type { UnboundSlotSd7GraphInput } from '../a3graphs/types.js';
import { readyAuthoritiesOfV5 } from '../a3governanceV5/snapshotV5.js';
import { historicalGraphCoverageProofForBatch } from './history.js';
import { measureDeltaSlotGraphsAllOrNothingV5 } from './measureDelta.js';
import { r40ReproductionProofForBatch, type R40ReproductionProof } from './r40Drift.js';
import { refuseV5Graph } from './refusal.js';
import {
  R41_GRAPH_SPLIT,
  type A3DevTrainSd7GraphDeltaBatchV5,
  type A3DevTrainSlotSd7GraphMeasurementDeltaV5,
  type HistoricalV5GraphCoverageProof,
  type R41DocumentTextLookup,
  type UnboundDeltaSlotGraphV5,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_GRAPHS = new WeakSet<object>();
const MINTED_DELTA_GRAPH_BATCHES = new WeakSet<object>();
const DOCUMENT_SLOT_BY_DELTA_GRAPH = new WeakMap<
  object,
  A3DevTrainSlotDocumentSourceAssemblyDeltaV5
>();
const DELTA_GRAPH_BY_DOCUMENT_SLOT = new WeakMap<
  object,
  A3DevTrainSlotSd7GraphMeasurementDeltaV5
>();
const DOCUMENT_BATCH_BY_GRAPH_BATCH = new WeakMap<object, A3DevTrainDocumentSourceDeltaBatchV5>();
const GRAPH_BATCH_BY_DOCUMENT_BATCH = new WeakMap<object, A3DevTrainSd7GraphDeltaBatchV5>();
const R22_CALLS_BY_GRAPH_BATCH = new WeakMap<object, number>();
/** R40 batches with a binding attempt currently in progress. */
const IN_FLIGHT_DOCUMENT_BATCHES = new WeakSet<object>();

/** True ONLY for a V5 delta graph this module minted in THIS process. */
export function isA3DevTrainSlotSd7GraphMeasurementDeltaV5(
  value: unknown,
): value is A3DevTrainSlotSd7GraphMeasurementDeltaV5 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_GRAPHS.has(value);
}

export function isA3DevTrainSd7GraphDeltaBatchV5(
  value: unknown,
): value is A3DevTrainSd7GraphDeltaBatchV5 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_GRAPH_BATCHES.has(value);
}

/** The exact R40 delta slot a minted R41 graph was measured from, or `undefined`. */
export function documentSourceDeltaSlotForDeltaGraphV5(
  graph: unknown,
): A3DevTrainSlotDocumentSourceAssemblyDeltaV5 | undefined {
  if (!isA3DevTrainSlotSd7GraphMeasurementDeltaV5(graph)) return undefined;
  return DOCUMENT_SLOT_BY_DELTA_GRAPH.get(graph);
}

/** The R41 graph minted from one R40 delta slot, or `undefined`. */
export function deltaGraphForDocumentSourceDeltaSlotV5(
  slot: unknown,
): A3DevTrainSlotSd7GraphMeasurementDeltaV5 | undefined {
  if (!isA3DevTrainSlotDocumentSourceAssemblyDeltaV5(slot)) return undefined;
  return DELTA_GRAPH_BY_DOCUMENT_SLOT.get(slot);
}

/** The R40 batch a minted R41 graph batch was measured from, or `undefined`. */
export function documentSourceDeltaBatchForGraphDeltaBatchV5(
  batch: unknown,
): A3DevTrainDocumentSourceDeltaBatchV5 | undefined {
  if (!isA3DevTrainSd7GraphDeltaBatchV5(batch)) return undefined;
  return DOCUMENT_BATCH_BY_GRAPH_BATCH.get(batch);
}

/** The R41 graph batch minted from one R40 batch, or `undefined`. */
export function graphDeltaBatchForDocumentSourceDeltaBatchV5(
  batch: unknown,
): A3DevTrainSd7GraphDeltaBatchV5 | undefined {
  if (!isA3DevTrainDocumentSourceDeltaBatchV5(batch)) return undefined;
  return GRAPH_BATCH_BY_DOCUMENT_BATCH.get(batch);
}

/** How many canonical R22 calls produced this minted R41 batch, or `undefined`. */
export function r22GraphCallsForGraphDeltaBatchV5(batch: unknown): number | undefined {
  if (!isA3DevTrainSd7GraphDeltaBatchV5(batch)) return undefined;
  return R22_CALLS_BY_GRAPH_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

/** §13. R40 brand, both proofs by identity, exact R39 batch both ways, DEV_TRAIN, one-shot. */
function requireMintedDocumentDeltaBatch(
  batch: unknown,
  reproductionProof: unknown,
  historicalProof: unknown,
): A3DevTrainDocumentSourceDeltaBatchV5 {
  if (!isA3DevTrainDocumentSourceDeltaBatchV5(batch)) {
    refuseV5Graph(
      'R41_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R40',
      'the input is not a DEV_TRAIN document-source delta batch minted by R40 in this process',
    );
  }
  const proved = r40ReproductionProofForBatch(batch);
  if (proved === undefined || proved !== reproductionProof) {
    refuseV5Graph(
      'R41_R40_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'this R40 batch was not proved to reproduce the committed R40 census',
    );
  }
  const history = historicalGraphCoverageProofForBatch(batch);
  if (history === undefined || history !== historicalProof) {
    refuseV5Graph(
      'R41_HISTORICAL_GRAPH_COVERAGE_NOT_PROVED_FOR_BATCH',
      'the historical R35 / R37 graph coverage was not proved against this R40 batch',
    );
  }
  if (GRAPH_BATCH_BY_DOCUMENT_BATCH.has(batch) || IN_FLIGHT_DOCUMENT_BATCHES.has(batch)) {
    refuseV5Graph(
      'R41_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED',
      'this R40 delta batch already produced an R41 graph delta batch',
    );
  }
  const evidenceBatch = evidenceDeltaBatchForDocumentSourceDeltaBatchV5(batch);
  if (
    evidenceBatch === undefined ||
    documentSourceDeltaBatchForEvidenceDeltaBatchV5(evidenceBatch) !== batch ||
    evidenceBatch.governanceSnapshotV5 !== batch.governanceSnapshotV5 ||
    evidenceBatch.items.length !== batch.items.length
  ) {
    refuseV5Graph(
      'R41_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R40',
      'the R40 delta batch does not trace to its exact R39 batch and V5 snapshot',
    );
  }
  if (batch.split !== R41_GRAPH_SPLIT || evidenceBatch.split !== R41_GRAPH_SPLIT) {
    refuseV5Graph(
      'R41_SPLIT_NOT_SUPPORTED',
      'the document-source delta batch is outside DEV_TRAIN',
    );
  }
  return batch;
}

/**
 * §13. Coverage must still be purely additive, and nothing here is
 * caller-supplied: historical document, graph, sample and readiness coverage
 * all equal the fresh R39 unchanged count; the delta slot count equals the
 * batch's own items and R39's newly bound count; historical plus delta equals
 * the V5 DEV_TRAIN READY count DERIVED from the batch's own V5 snapshot; and
 * the reproduction proof's R40 counts agree with the batch itself.
 */
function requireAdditiveCoverage(
  batch: A3DevTrainDocumentSourceDeltaBatchV5,
  proof: R40ReproductionProof,
  history: HistoricalV5GraphCoverageProof,
): void {
  const evidenceBatch = evidenceDeltaBatchForDocumentSourceDeltaBatchV5(batch)!;
  const coverage = evidenceBatch.coverage;
  const items = batch.items.length;
  const historical = coverage.unchangedCanonicalCoverageCount;
  const v5DevTrainReady = readyAuthoritiesOfV5(batch.governanceSnapshotV5).filter(
    (ready) => ready.split === R41_GRAPH_SPLIT,
  ).length;
  const deltaDocuments = batch.items.reduce((sum, slot) => sum + slot.documents.length, 0);
  if (
    coverage.changedExistingCount !== 0 ||
    coverage.removedCount !== 0 ||
    coverage.legacyAuthorityEvidenceRequests !== 0 ||
    coverage.deltaAuthorityEvidenceRequests !== items ||
    coverage.newlyBoundDeltaCount !== items ||
    historical + items !== coverage.v5DevTrainReadyCount ||
    coverage.v5DevTrainReadyCount !== v5DevTrainReady ||
    proof.deltaSlots !== items ||
    proof.r21AssemblyCalls !== items ||
    proof.historicalR21AssemblyCalls !== 0 ||
    proof.deltaSlotLocalDocuments !== deltaDocuments ||
    proof.historicalDocumentSlots !== historical ||
    proof.coverageDocumentSlots !== historical + items ||
    proof.coverageSlotLocalDocuments !== proof.historicalSlotLocalDocuments + deltaDocuments ||
    history.graphSlots !== historical ||
    history.r40HistoricalDocumentSlots !== historical ||
    history.r40HistoricalGraphCoverage !== historical ||
    history.r40HistoricalSampleCoverage !== historical ||
    history.r40HistoricalReadinessCoverage !== historical ||
    history.r37ReadinessSlots !== historical ||
    history.documents !== proof.historicalSlotLocalDocuments
  ) {
    refuseV5Graph(
      'R41_DOCUMENT_SOURCE_COVERAGE_NOT_ADDITIVE',
      'historical coverage plus delta slots does not equal the V5 DEV_TRAIN READY coverage',
    );
  }
}

/** §14. Every slot: R40 brand, the R39 item at the same position, both ways. */
function requireSlotMintedForBatch(
  slot: unknown,
  batch: A3DevTrainDocumentSourceDeltaBatchV5,
  position: number,
): A3DevTrainSlotDocumentSourceAssemblyDeltaV5 {
  if (!isA3DevTrainSlotDocumentSourceAssemblyDeltaV5(slot)) {
    refuseV5Graph(
      'R41_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R40',
      `batch slot at position ${position} is not a delta slot assembly minted by R40`,
    );
  }
  const evidenceBatch = evidenceDeltaBatchForDocumentSourceDeltaBatchV5(batch);
  const evidence = evidenceDeltaForDeltaSlotAssemblyV5(slot);
  if (
    evidence === undefined ||
    evidenceBatch?.items[position] !== evidence ||
    deltaSlotAssemblyForEvidenceDeltaV5(evidence) !== slot ||
    evidence.authority.selectionIndex !== slot.selectionIndex
  ) {
    refuseV5Graph(
      'R41_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R40',
      `batch slot at position ${position} does not trace to its R39 item in this batch`,
    );
  }
  if (
    slot.split !== R41_GRAPH_SPLIT ||
    evidence.split !== R41_GRAPH_SPLIT ||
    evidence.authority.split !== R41_GRAPH_SPLIT
  ) {
    refuseV5Graph(
      'R41_SPLIT_NOT_SUPPORTED',
      `batch slot at position ${position} is outside DEV_TRAIN`,
    );
  }
  if (DELTA_GRAPH_BY_DOCUMENT_SLOT.has(slot)) {
    refuseV5Graph(
      'R41_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED',
      `batch slot at position ${position} already has a minted R41 graph`,
    );
  }
  return slot;
}

/** §17. Exactly R22's plain input: the R40 slot's own documents, by reference, in order. */
function slotGraphInputV5(
  slot: A3DevTrainSlotDocumentSourceAssemblyDeltaV5,
): UnboundSlotSd7GraphInput {
  return Object.freeze({
    selectionIndex: slot.selectionIndex,
    split: slot.split,
    documents: slot.documents,
  });
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaGraph(
  slot: A3DevTrainSlotDocumentSourceAssemblyDeltaV5,
  unbound: UnboundDeltaSlotGraphV5,
): A3DevTrainSlotSd7GraphMeasurementDeltaV5 {
  const minted: A3DevTrainSlotSd7GraphMeasurementDeltaV5 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_DELTA_V5' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: R41_GRAPH_SPLIT,
    // §26: R22's canonical graph object, by reference - never rebuilt.
    graph: unbound.graph,
  });
  MINTED_DELTA_GRAPHS.add(minted);
  DOCUMENT_SLOT_BY_DELTA_GRAPH.set(minted, slot);
  DELTA_GRAPH_BY_DOCUMENT_SLOT.set(slot, minted);
  return minted;
}

/**
 * Mints the DEV_TRAIN SD7 graph V5 DELTA batch from an actual R40-minted
 * document-source delta batch whose fresh reproduction and historical graph
 * coverage were proved. The item count is DERIVED from that batch. One R22
 * call per delta slot, and no other graph call.
 */
export function bindDevTrainSd7GraphDeltaBatchV5(
  documentDeltaBatch: unknown,
  reproductionProof: unknown,
  historicalProof: unknown,
): A3DevTrainSd7GraphDeltaBatchV5 {
  const batch = requireMintedDocumentDeltaBatch(
    documentDeltaBatch,
    reproductionProof,
    historicalProof,
  );
  requireAdditiveCoverage(
    batch,
    reproductionProof as R40ReproductionProof,
    historicalProof as HistoricalV5GraphCoverageProof,
  );

  // §14: every slot verified BEFORE any text capability is obtained.
  const seenSlots = new Set<object>();
  const seenSelectionIndices = new Set<number>();
  const slots = batch.items.map((candidate, position) => {
    const slot = requireSlotMintedForBatch(candidate, batch, position);
    if (seenSlots.has(slot) || seenSelectionIndices.has(slot.selectionIndex)) {
      refuseV5Graph(
        'R41_DELTA_BATCH_COMPOSITION_INVALID',
        `batch slot at position ${position} repeats an earlier slot`,
      );
    }
    seenSlots.add(slot);
    seenSelectionIndices.add(slot.selectionIndex);
    return slot;
  });

  IN_FLIGHT_DOCUMENT_BATCHES.add(batch);
  try {
    // §15: every text capability obtained - through R40 only - before any
    // measurement. A failure on the last one reaches no R22 call.
    const lookups: R41DocumentTextLookup[] = slots.map((slot) =>
      documentTextLookupForDeltaSlotAssemblyV5(slot),
    );
    const requests = slots.map((slot, position) => ({
      slot: slotGraphInputV5(slot),
      textLookup: lookups[position] as R41DocumentTextLookup,
    }));
    // §25: every delta slot measured, unbound, before minting ANY of them.
    const { graphs, r22Calls } = measureDeltaSlotGraphsAllOrNothingV5(requests);
    if (graphs.length !== slots.length || r22Calls !== slots.length) {
      refuseV5Graph(
        'R41_DELTA_BATCH_COMPOSITION_INVALID',
        'not every R40 delta slot produced exactly one graph from one R22 call',
      );
    }

    const minted = slots.map((slot, position) =>
      mintDeltaGraph(slot, graphs[position] as UnboundDeltaSlotGraphV5),
    );
    for (const [position, graph] of minted.entries()) {
      if (
        !isA3DevTrainSlotSd7GraphMeasurementDeltaV5(graph) ||
        documentSourceDeltaSlotForDeltaGraphV5(graph) !== slots[position] ||
        deltaGraphForDocumentSourceDeltaSlotV5(slots[position]) !== graph ||
        graph.graph !== graphs[position]?.graph
      ) {
        refuseV5Graph(
          'R41_DELTA_BATCH_COMPOSITION_INVALID',
          `delta graph at position ${position} does not trace to its R40 slot`,
        );
      }
    }

    const graphBatch: A3DevTrainSd7GraphDeltaBatchV5 = Object.freeze({
      kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V5' as const,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
      split: R41_GRAPH_SPLIT,
      governanceSnapshotV5: batch.governanceSnapshotV5,
      items: Object.freeze(minted),
    });
    MINTED_DELTA_GRAPH_BATCHES.add(graphBatch);
    DOCUMENT_BATCH_BY_GRAPH_BATCH.set(graphBatch, batch);
    GRAPH_BATCH_BY_DOCUMENT_BATCH.set(batch, graphBatch);
    R22_CALLS_BY_GRAPH_BATCH.set(graphBatch, r22Calls);
    return graphBatch;
  } finally {
    IN_FLIGHT_DOCUMENT_BATCHES.delete(batch);
  }
}

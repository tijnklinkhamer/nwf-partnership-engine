/**
 * PHASE 2B-2D — A3 R29: THE INCREMENTAL DEV_TRAIN SAMPLE BINDER, AND THE ONLY
 * PLACE THAT MINTS DELTA SAMPLE PREPARATIONS.
 *
 * R28'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R28-minted `A3DevTrainSd7GraphDeltaBatchV2`
 *   and checks it by brand; checks that it traces to the exact R27 batch it
 *   stores, in both directions, under the exact V2 snapshot it stores; then
 *   checks every graph by R28 brand, derives its exact R27 slot through R28's
 *   provenance, and requires that slot to be the R27 batch item at the same
 *   position and to map back to the same graph. It accepts no separately
 *   supplied documents, graphs, ranks, scores or survivor sets, so a graph
 *   from one slot can never meet another slot's documents or scores.
 *
 *   A clone, a spread, a literal, a deserialised copy, a batch holding a
 *   cloned graph, a historical R22 graph or batch, an R27 document batch or an
 *   R26 evidence batch refuses before any preparation happens.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass.
 *
 * DELTA ONLY
 *
 *   The loop runs over `batch.items` and nothing else. No historical R21 slot,
 *   R22 graph or R23 preparation is obtained, wrapped, re-prepared or
 *   re-minted, and no six-slot input is ever built.
 *
 * ALL OR NOTHING, AND ONE-TO-ONE
 *
 *   Every delta slot is prepared unbound first; only then is anything minted.
 *   One R28 graph yields at most one R29 preparation, and one R28 batch at
 *   most one R29 batch, per process.
 *
 * THIS MODULE ISSUES NO SQL. The only database access in a real run is
 * canonical R26's own, completed before this binder is called.
 */
import {
  deltaGraphForDocumentSourceDeltaSlot,
  documentSourceDeltaBatchForGraphDeltaBatch,
  documentSourceDeltaSlotForDeltaGraph,
  graphDeltaBatchForDocumentSourceDeltaBatch,
  isA3DevTrainSd7GraphDeltaBatchV2,
  isA3DevTrainSlotSd7GraphMeasurementDeltaV2,
} from '../a3graphsV2/devTrain.js';
import type {
  A3DevTrainSd7GraphDeltaBatchV2,
  A3DevTrainSlotSd7GraphMeasurementDeltaV2,
} from '../a3graphsV2/types.js';
import type { A3DevTrainSlotDocumentSourceAssemblyDeltaV2 } from '../a3documentsV2/types.js';
import { prepareDeltaSlotSamplesAllOrNothing } from './prepareDelta.js';
import { refuseV2Sample } from './refusal.js';
import {
  R29_SAMPLE_SPLIT,
  type A3DevTrainSampleSurvivorDeltaBatchV2,
  type A3DevTrainSlotSampleSurvivorPreparationDeltaV2,
  type UnboundDeltaSlotSamplePreparation,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_PREPARATIONS = new WeakSet<object>();
const MINTED_DELTA_SAMPLE_BATCHES = new WeakSet<object>();
const DELTA_GRAPH_BY_PREPARATION = new WeakMap<object, A3DevTrainSlotSd7GraphMeasurementDeltaV2>();
const PREPARATION_BY_DELTA_GRAPH = new WeakMap<
  object,
  A3DevTrainSlotSampleSurvivorPreparationDeltaV2
>();
const GRAPH_BATCH_BY_SAMPLE_BATCH = new WeakMap<object, A3DevTrainSd7GraphDeltaBatchV2>();
const SAMPLE_BATCH_BY_GRAPH_BATCH = new WeakMap<object, A3DevTrainSampleSurvivorDeltaBatchV2>();

/** True ONLY for a delta preparation this module minted in THIS process. */
export function isA3DevTrainSlotSampleSurvivorPreparationDeltaV2(
  value: unknown,
): value is A3DevTrainSlotSampleSurvivorPreparationDeltaV2 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_PREPARATIONS.has(value);
}

export function isA3DevTrainSampleSurvivorDeltaBatchV2(
  value: unknown,
): value is A3DevTrainSampleSurvivorDeltaBatchV2 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_SAMPLE_BATCHES.has(value);
}

/** The exact R28 delta graph a minted R29 preparation was prepared over, or `undefined`. */
export function deltaGraphForSamplePreparation(
  preparation: unknown,
): A3DevTrainSlotSd7GraphMeasurementDeltaV2 | undefined {
  if (!isA3DevTrainSlotSampleSurvivorPreparationDeltaV2(preparation)) return undefined;
  return DELTA_GRAPH_BY_PREPARATION.get(preparation);
}

/** The R29 preparation minted from one R28 delta graph, or `undefined`. */
export function samplePreparationForDeltaGraph(
  graph: unknown,
): A3DevTrainSlotSampleSurvivorPreparationDeltaV2 | undefined {
  if (!isA3DevTrainSlotSd7GraphMeasurementDeltaV2(graph)) return undefined;
  return PREPARATION_BY_DELTA_GRAPH.get(graph);
}

/** The R28 batch a minted R29 sample batch was prepared from, or `undefined`. */
export function graphDeltaBatchForSampleDeltaBatch(
  batch: unknown,
): A3DevTrainSd7GraphDeltaBatchV2 | undefined {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV2(batch)) return undefined;
  return GRAPH_BATCH_BY_SAMPLE_BATCH.get(batch);
}

/** The R29 sample batch minted from one R28 batch, or `undefined`. */
export function sampleDeltaBatchForGraphDeltaBatch(
  batch: unknown,
): A3DevTrainSampleSurvivorDeltaBatchV2 | undefined {
  if (!isA3DevTrainSd7GraphDeltaBatchV2(batch)) return undefined;
  return SAMPLE_BATCH_BY_GRAPH_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

/** §10 / §11. R28 brand, exact R27 batch by identity both ways, exact V2 snapshot, DEV_TRAIN. */
function requireMintedGraphDeltaBatch(batch: unknown): A3DevTrainSd7GraphDeltaBatchV2 {
  if (!isA3DevTrainSd7GraphDeltaBatchV2(batch)) {
    refuseV2Sample(
      'R29_SD7_GRAPH_DELTA_NOT_MINTED_BY_R28',
      'the input is not a DEV_TRAIN SD7 graph delta batch minted by R28 in this process',
    );
  }
  if (SAMPLE_BATCH_BY_GRAPH_BATCH.has(batch)) {
    refuseV2Sample(
      'R29_SD7_GRAPH_DELTA_ALREADY_PREPARED',
      'this R28 graph delta batch already produced an R29 sample delta batch',
    );
  }
  const documentBatch = documentSourceDeltaBatchForGraphDeltaBatch(batch);
  if (
    documentBatch === undefined ||
    documentBatch !== batch.documentSourceDeltaBatch ||
    graphDeltaBatchForDocumentSourceDeltaBatch(documentBatch) !== batch ||
    documentBatch.governanceSnapshotV2 !== batch.governanceSnapshotV2 ||
    documentBatch.evidenceDeltaBatch.governanceSnapshotV2 !== batch.governanceSnapshotV2 ||
    documentBatch.items.length !== batch.items.length
  ) {
    refuseV2Sample(
      'R29_SD7_GRAPH_DELTA_NOT_MINTED_BY_R28',
      'the R28 graph delta batch does not trace to its exact R27 batch and V2 snapshot',
    );
  }
  if (
    batch.split !== R29_SAMPLE_SPLIT ||
    documentBatch.split !== R29_SAMPLE_SPLIT ||
    documentBatch.evidenceDeltaBatch.split !== R29_SAMPLE_SPLIT
  ) {
    refuseV2Sample('R29_SPLIT_NOT_SUPPORTED', 'the graph delta batch is outside DEV_TRAIN');
  }
  return batch;
}

/**
 * §14. Upstream coverage must still be purely additive through R28 -> R27 ->
 * R26: 0 changed, 0 removed, 0 legacy evidence requests, every delta item
 * measured, V1 canonical coverage equal to the unchanged coverage, and
 * unchanged plus delta equal to the V2 DEV_TRAIN coverage. Nothing here is
 * caller-supplied.
 */
function requireAdditiveCoverage(batch: A3DevTrainSd7GraphDeltaBatchV2): void {
  const coverage = batch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;
  if (
    coverage.changedExistingCount !== 0 ||
    coverage.removedCount !== 0 ||
    coverage.legacyAuthorityEvidenceRequests !== 0 ||
    coverage.newlyBoundDeltaCount !== batch.items.length ||
    coverage.v1CanonicalCoveredAuthorityCount !== coverage.unchangedCanonicalCoverageCount ||
    coverage.unchangedCanonicalCoverageCount + batch.items.length !== coverage.v2ReadyAuthorityCount
  ) {
    refuseV2Sample(
      'R29_GRAPH_DELTA_COVERAGE_NOT_ADDITIVE',
      'unchanged canonical coverage plus delta graphs does not equal the V2 DEV_TRAIN coverage',
    );
  }
}

/** §12. Every graph: R28 brand, its R27 slot at the same position, both ways. */
function requireGraphMintedForBatch(
  graph: unknown,
  batch: A3DevTrainSd7GraphDeltaBatchV2,
  position: number,
): {
  readonly graph: A3DevTrainSlotSd7GraphMeasurementDeltaV2;
  readonly slot: A3DevTrainSlotDocumentSourceAssemblyDeltaV2;
} {
  if (!isA3DevTrainSlotSd7GraphMeasurementDeltaV2(graph)) {
    refuseV2Sample(
      'R29_SD7_GRAPH_DELTA_NOT_MINTED_BY_R28',
      `batch graph at position ${position} is not a delta graph minted by R28`,
    );
  }
  const slot = documentSourceDeltaSlotForDeltaGraph(graph);
  if (
    slot === undefined ||
    batch.documentSourceDeltaBatch.items[position] !== slot ||
    deltaGraphForDocumentSourceDeltaSlot(slot) !== graph ||
    slot.selectionIndex !== graph.selectionIndex
  ) {
    refuseV2Sample(
      'R29_SD7_GRAPH_DELTA_NOT_MINTED_BY_R28',
      `batch graph at position ${position} does not trace to its R27 slot in this batch`,
    );
  }
  if (graph.split !== R29_SAMPLE_SPLIT || slot.split !== R29_SAMPLE_SPLIT) {
    refuseV2Sample(
      'R29_SPLIT_NOT_SUPPORTED',
      `batch graph at position ${position} is outside DEV_TRAIN`,
    );
  }
  if (PREPARATION_BY_DELTA_GRAPH.has(graph)) {
    refuseV2Sample(
      'R29_SD7_GRAPH_DELTA_ALREADY_PREPARED',
      `batch graph at position ${position} already has a minted R29 preparation`,
    );
  }
  return { graph, slot };
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaPreparation(
  graph: A3DevTrainSlotSd7GraphMeasurementDeltaV2,
  unbound: UnboundDeltaSlotSamplePreparation,
): A3DevTrainSlotSampleSurvivorPreparationDeltaV2 {
  const minted: A3DevTrainSlotSampleSurvivorPreparationDeltaV2 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_DELTA_V2' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: R29_SAMPLE_SPLIT,
    // §19: R23's canonical objects, by reference - never rebuilt.
    setP: unbound.setP,
    setR: unbound.setR,
    setRDocumentCap: unbound.setRDocumentCap,
    setRFreezeSlotReadiness: unbound.setRFreezeSlotReadiness,
  });
  MINTED_DELTA_PREPARATIONS.add(minted);
  DELTA_GRAPH_BY_PREPARATION.set(minted, graph);
  PREPARATION_BY_DELTA_GRAPH.set(graph, minted);
  return minted;
}

/**
 * Mints the DEV_TRAIN sample survivor DELTA batch from an actual R28-minted
 * graph delta batch. The item count is DERIVED from that batch - there is no
 * caller-supplied expected count. One R23 call per delta slot, and no other
 * sample call.
 */
export function bindDevTrainSampleSurvivorDeltaBatchV2(
  graphDeltaBatch: unknown,
): A3DevTrainSampleSurvivorDeltaBatchV2 {
  const batch = requireMintedGraphDeltaBatch(graphDeltaBatch);
  requireAdditiveCoverage(batch);

  const seenGraphs = new Set<object>();
  const seenSelectionIndices = new Set<number>();
  const pairs = batch.items.map((candidate, position) => {
    const pair = requireGraphMintedForBatch(candidate, batch, position);
    if (seenGraphs.has(pair.graph) || seenSelectionIndices.has(pair.graph.selectionIndex)) {
      refuseV2Sample(
        'R29_DELTA_BATCH_COMPOSITION_INVALID',
        `batch graph at position ${position} repeats an earlier graph`,
      );
    }
    seenGraphs.add(pair.graph);
    seenSelectionIndices.add(pair.graph.selectionIndex);
    return pair;
  });

  // §15-§18: prepare EVERY delta slot, unbound, before minting ANY of them -
  // the exact R27 slot and the exact R28 canonical graph object, nothing else.
  const unbound = prepareDeltaSlotSamplesAllOrNothing(
    pairs.map(({ graph, slot }) => ({ slot, graph: graph.graph })),
  );
  if (unbound.length !== pairs.length) {
    refuseV2Sample(
      'R29_DELTA_BATCH_COMPOSITION_INVALID',
      'not every R28 delta graph produced exactly one preparation',
    );
  }

  const minted = pairs.map(({ graph }, position) =>
    mintDeltaPreparation(graph, unbound[position] as UnboundDeltaSlotSamplePreparation),
  );
  for (const [position, preparation] of minted.entries()) {
    const graph = pairs[position]?.graph;
    if (
      !isA3DevTrainSlotSampleSurvivorPreparationDeltaV2(preparation) ||
      deltaGraphForSamplePreparation(preparation) !== graph ||
      samplePreparationForDeltaGraph(graph) !== preparation ||
      preparation.setP !== unbound[position]?.setP ||
      preparation.setR !== unbound[position]?.setR
    ) {
      refuseV2Sample(
        'R29_DELTA_BATCH_COMPOSITION_INVALID',
        `delta preparation at position ${position} does not trace to its R28 graph`,
      );
    }
  }

  const sampleBatch: A3DevTrainSampleSurvivorDeltaBatchV2 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V2' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R29_SAMPLE_SPLIT,
    governanceSnapshotV2: batch.governanceSnapshotV2,
    graphDeltaBatch: batch,
    items: Object.freeze(minted),
  });
  MINTED_DELTA_SAMPLE_BATCHES.add(sampleBatch);
  GRAPH_BATCH_BY_SAMPLE_BATCH.set(sampleBatch, batch);
  SAMPLE_BATCH_BY_GRAPH_BATCH.set(batch, sampleBatch);
  return sampleBatch;
}

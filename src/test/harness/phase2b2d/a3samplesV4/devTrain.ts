/**
 * PHASE 2B-2D — A3 R36: THE V4 INCREMENTAL DEV_TRAIN SAMPLE BINDER, AND THE
 * ONLY PLACE THAT MINTS V4 DELTA SAMPLE PREPARATIONS.
 *
 * R35'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R35-minted `A3DevTrainSd7GraphDeltaBatchV4`
 *   and checks it by brand; requires the fresh-reproduction proof minted for
 *   exactly that batch (identity, not equality); checks that it traces to the
 *   exact R34 batch it stores, in both directions, under the exact V4
 *   snapshot it stores; then checks every graph by R35 brand, derives its
 *   exact R34 slot through R35's provenance, and requires that slot to be the
 *   R34 batch item at the same position and to map back to the same graph.
 *   It accepts no separately supplied documents, graphs, ranks, scores,
 *   survivor sets or cap members, so a graph from one slot can never meet
 *   another slot's documents or scores.
 *
 *   A clone, a spread, a literal, a deserialised copy, a batch holding a
 *   cloned graph, a graph passed as a batch, an R34 document batch, an R33
 *   evidence batch, an R28 / R29 V2 batch, a historical R22 graph, the
 *   committed R35 census or `undefined` refuses before any preparation.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass.
 *
 * DELTA ONLY
 *
 *   The loop runs over `batch.items` and nothing else. No historical R21 /
 *   R27 slot, R22 / R28 graph or R23 / R29 preparation is obtained, wrapped,
 *   re-prepared or re-minted, and no thirteen-slot input is ever built.
 *
 * ALL OR NOTHING, AND ONE-TO-ONE
 *
 *   Every graph is verified first; every delta slot is then prepared unbound;
 *   only then is anything minted. One R35 graph yields at most one R36
 *   preparation, and one R35 batch at most one R36 batch, per process.
 *
 * THIS MODULE ISSUES NO SQL. The only database access in a real run is
 * canonical R33's own, completed - and its pool closed - before R34, R35 and
 * this binder are called.
 */
import {
  deltaGraphForDocumentSourceDeltaSlotV4,
  documentSourceDeltaBatchForGraphDeltaBatchV4,
  documentSourceDeltaSlotForDeltaGraphV4,
  graphDeltaBatchForDocumentSourceDeltaBatchV4,
  isA3DevTrainSd7GraphDeltaBatchV4,
  isA3DevTrainSlotSd7GraphMeasurementDeltaV4,
} from '../a3graphsV4/devTrain.js';
import type {
  A3DevTrainSd7GraphDeltaBatchV4,
  A3DevTrainSlotSd7GraphMeasurementDeltaV4,
} from '../a3graphsV4/types.js';
import type { A3DevTrainSlotDocumentSourceAssemblyDeltaV4 } from '../a3documentsV4/types.js';
import { prepareDeltaSlotSamplesAllOrNothingV4 } from './prepareDelta.js';
import { r35ReproductionProofForBatch, type R35ReproductionProof } from './r35Drift.js';
import { refuseV4Sample } from './refusal.js';
import {
  R36_SAMPLE_SPLIT,
  type A3DevTrainSampleSurvivorDeltaBatchV4,
  type A3DevTrainSlotSampleSurvivorPreparationDeltaV4,
  type UnboundDeltaSlotSamplePreparationV4,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_PREPARATIONS = new WeakSet<object>();
const MINTED_DELTA_SAMPLE_BATCHES = new WeakSet<object>();
const DELTA_GRAPH_BY_PREPARATION = new WeakMap<object, A3DevTrainSlotSd7GraphMeasurementDeltaV4>();
const PREPARATION_BY_DELTA_GRAPH = new WeakMap<
  object,
  A3DevTrainSlotSampleSurvivorPreparationDeltaV4
>();
const GRAPH_BATCH_BY_SAMPLE_BATCH = new WeakMap<object, A3DevTrainSd7GraphDeltaBatchV4>();
const SAMPLE_BATCH_BY_GRAPH_BATCH = new WeakMap<object, A3DevTrainSampleSurvivorDeltaBatchV4>();

/** True ONLY for a V4 delta preparation this module minted in THIS process. */
export function isA3DevTrainSlotSampleSurvivorPreparationDeltaV4(
  value: unknown,
): value is A3DevTrainSlotSampleSurvivorPreparationDeltaV4 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_PREPARATIONS.has(value);
}

export function isA3DevTrainSampleSurvivorDeltaBatchV4(
  value: unknown,
): value is A3DevTrainSampleSurvivorDeltaBatchV4 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_SAMPLE_BATCHES.has(value);
}

/** The exact R35 delta graph a minted R36 preparation was prepared over, or `undefined`. */
export function deltaGraphForSamplePreparationV4(
  preparation: unknown,
): A3DevTrainSlotSd7GraphMeasurementDeltaV4 | undefined {
  if (!isA3DevTrainSlotSampleSurvivorPreparationDeltaV4(preparation)) return undefined;
  return DELTA_GRAPH_BY_PREPARATION.get(preparation);
}

/** The R36 preparation minted from one R35 delta graph, or `undefined`. */
export function samplePreparationForDeltaGraphV4(
  graph: unknown,
): A3DevTrainSlotSampleSurvivorPreparationDeltaV4 | undefined {
  if (!isA3DevTrainSlotSd7GraphMeasurementDeltaV4(graph)) return undefined;
  return PREPARATION_BY_DELTA_GRAPH.get(graph);
}

/** The R35 batch a minted R36 sample batch was prepared from, or `undefined`. */
export function graphDeltaBatchForSampleDeltaBatchV4(
  batch: unknown,
): A3DevTrainSd7GraphDeltaBatchV4 | undefined {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV4(batch)) return undefined;
  return GRAPH_BATCH_BY_SAMPLE_BATCH.get(batch);
}

/** The R36 sample batch minted from one R35 batch, or `undefined`. */
export function sampleDeltaBatchForGraphDeltaBatchV4(
  batch: unknown,
): A3DevTrainSampleSurvivorDeltaBatchV4 | undefined {
  if (!isA3DevTrainSd7GraphDeltaBatchV4(batch)) return undefined;
  return SAMPLE_BATCH_BY_GRAPH_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

/** §9. R35 brand, proof by identity, exact R34 batch both ways, exact V4 snapshot, DEV_TRAIN. */
function requireMintedGraphDeltaBatch(
  batch: unknown,
  reproductionProof: unknown,
): A3DevTrainSd7GraphDeltaBatchV4 {
  if (!isA3DevTrainSd7GraphDeltaBatchV4(batch)) {
    refuseV4Sample(
      'R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35',
      'the input is not a DEV_TRAIN SD7 graph delta batch minted by R35 in this process',
    );
  }
  const proved: R35ReproductionProof | undefined = r35ReproductionProofForBatch(batch);
  if (proved === undefined || proved !== reproductionProof) {
    refuseV4Sample(
      'R36_R35_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'this R35 batch was not proved to reproduce the committed R35 census',
    );
  }
  if (SAMPLE_BATCH_BY_GRAPH_BATCH.has(batch)) {
    refuseV4Sample(
      'R36_SD7_GRAPH_DELTA_ALREADY_PREPARED',
      'this R35 graph delta batch already produced an R36 sample delta batch',
    );
  }
  const documentBatch = documentSourceDeltaBatchForGraphDeltaBatchV4(batch);
  if (
    documentBatch === undefined ||
    documentBatch !== batch.documentSourceDeltaBatch ||
    graphDeltaBatchForDocumentSourceDeltaBatchV4(documentBatch) !== batch ||
    documentBatch.governanceSnapshotV4 !== batch.governanceSnapshotV4 ||
    documentBatch.evidenceDeltaBatch.governanceSnapshotV4 !== batch.governanceSnapshotV4 ||
    documentBatch.items.length !== batch.items.length
  ) {
    refuseV4Sample(
      'R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35',
      'the R35 graph delta batch does not trace to its exact R34 batch and V4 snapshot',
    );
  }
  if (
    batch.split !== R36_SAMPLE_SPLIT ||
    documentBatch.split !== R36_SAMPLE_SPLIT ||
    documentBatch.evidenceDeltaBatch.split !== R36_SAMPLE_SPLIT
  ) {
    refuseV4Sample('R36_SPLIT_NOT_SUPPORTED', 'the graph delta batch is outside DEV_TRAIN');
  }
  return batch;
}

/**
 * §10. Upstream coverage must still be purely additive through R35 -> R34 ->
 * R33: 0 changed, 0 removed, 0 legacy evidence requests, one delta request
 * per graph, historical coverage unchanged, and historical plus delta equal
 * to the V4 DEV_TRAIN coverage. The proof's R35 counts must agree with the
 * actual batch. Nothing here is caller-supplied - there is no "expected
 * seven".
 */
function requireAdditiveCoverage(
  batch: A3DevTrainSd7GraphDeltaBatchV4,
  proof: R35ReproductionProof,
): void {
  const coverage = batch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;
  let documents = 0;
  let measurable = 0;
  let shortText = 0;
  for (const item of batch.items) {
    documents += item.graph.documents.length;
    measurable += item.graph.measurableIndices.length;
    shortText += item.graph.shortTextUnresolvedCount;
  }
  if (
    coverage.changedExistingCount !== 0 ||
    coverage.removedCount !== 0 ||
    coverage.legacyAuthorityEvidenceRequests !== 0 ||
    coverage.deltaAuthorityEvidenceRequests !== batch.items.length ||
    coverage.newlyBoundDeltaCount !== batch.items.length ||
    coverage.unchangedCanonicalCoverageCount !== coverage.historicalCanonicalCoverageCount ||
    coverage.historicalCanonicalCoverageCount + batch.items.length !==
      coverage.v4DevTrainReadyCount ||
    proof.historicalGraphSlots !== coverage.historicalCanonicalCoverageCount ||
    proof.deltaGraphSlots !== batch.items.length ||
    proof.deltaDocuments !== documents ||
    proof.deltaMeasurableDocuments !== measurable ||
    proof.deltaShortTextUnresolved !== shortText ||
    measurable + shortText !== documents
  ) {
    refuseV4Sample(
      'R36_GRAPH_DELTA_COVERAGE_NOT_ADDITIVE',
      'historical coverage plus delta graphs does not equal the V4 DEV_TRAIN coverage',
    );
  }
}

/** §9. Every graph: R35 brand, its R34 slot at the same position, both ways. */
function requireGraphMintedForBatch(
  graph: unknown,
  batch: A3DevTrainSd7GraphDeltaBatchV4,
  position: number,
): {
  readonly graph: A3DevTrainSlotSd7GraphMeasurementDeltaV4;
  readonly slot: A3DevTrainSlotDocumentSourceAssemblyDeltaV4;
} {
  if (!isA3DevTrainSlotSd7GraphMeasurementDeltaV4(graph)) {
    refuseV4Sample(
      'R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35',
      `batch graph at position ${position} is not a delta graph minted by R35`,
    );
  }
  const slot = documentSourceDeltaSlotForDeltaGraphV4(graph);
  if (
    slot === undefined ||
    batch.documentSourceDeltaBatch.items[position] !== slot ||
    deltaGraphForDocumentSourceDeltaSlotV4(slot) !== graph ||
    slot.selectionIndex !== graph.selectionIndex
  ) {
    refuseV4Sample(
      'R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35',
      `batch graph at position ${position} does not trace to its R34 slot in this batch`,
    );
  }
  if (graph.split !== R36_SAMPLE_SPLIT || slot.split !== R36_SAMPLE_SPLIT) {
    refuseV4Sample(
      'R36_SPLIT_NOT_SUPPORTED',
      `batch graph at position ${position} is outside DEV_TRAIN`,
    );
  }
  if (PREPARATION_BY_DELTA_GRAPH.has(graph)) {
    refuseV4Sample(
      'R36_SD7_GRAPH_DELTA_ALREADY_PREPARED',
      `batch graph at position ${position} already has a minted R36 preparation`,
    );
  }
  return { graph, slot };
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaPreparation(
  graph: A3DevTrainSlotSd7GraphMeasurementDeltaV4,
  unbound: UnboundDeltaSlotSamplePreparationV4,
): A3DevTrainSlotSampleSurvivorPreparationDeltaV4 {
  const minted: A3DevTrainSlotSampleSurvivorPreparationDeltaV4 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_DELTA_V4' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: R36_SAMPLE_SPLIT,
    // §21: R23's canonical objects, by reference - never rebuilt.
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
 * Mints the DEV_TRAIN sample survivor V4 DELTA batch from an actual
 * R35-minted graph delta batch whose fresh reproduction was proved. The item
 * count is DERIVED from that batch - there is no caller-supplied expected
 * count. One R23 call per delta slot, and no other sample call.
 */
export function bindDevTrainSampleSurvivorDeltaBatchV4(
  graphDeltaBatch: unknown,
  reproductionProof: unknown,
): A3DevTrainSampleSurvivorDeltaBatchV4 {
  const batch = requireMintedGraphDeltaBatch(graphDeltaBatch, reproductionProof);

  const seenGraphs = new Set<object>();
  const seenSelectionIndices = new Set<number>();
  const pairs = batch.items.map((candidate, position) => {
    const pair = requireGraphMintedForBatch(candidate, batch, position);
    if (seenGraphs.has(pair.graph) || seenSelectionIndices.has(pair.graph.selectionIndex)) {
      refuseV4Sample(
        'R36_DELTA_BATCH_COMPOSITION_INVALID',
        `batch graph at position ${position} repeats an earlier graph`,
      );
    }
    seenGraphs.add(pair.graph);
    seenSelectionIndices.add(pair.graph.selectionIndex);
    return pair;
  });
  // §10: only once every graph is proved genuine are its counts summed.
  requireAdditiveCoverage(batch, reproductionProof as R35ReproductionProof);

  // §11-§18: prepare EVERY delta slot, unbound, before minting ANY of them -
  // the exact R34 slot and the exact R35 canonical graph object, nothing else.
  const unbound = prepareDeltaSlotSamplesAllOrNothingV4(
    pairs.map(({ graph, slot }) => ({ slot, graph: graph.graph })),
  );
  if (unbound.length !== pairs.length) {
    refuseV4Sample(
      'R36_DELTA_BATCH_COMPOSITION_INVALID',
      'not every R35 delta graph produced exactly one preparation',
    );
  }

  const minted = pairs.map(({ graph }, position) =>
    mintDeltaPreparation(graph, unbound[position] as UnboundDeltaSlotSamplePreparationV4),
  );
  for (const [position, preparation] of minted.entries()) {
    const graph = pairs[position]?.graph;
    const source = unbound[position];
    if (
      !isA3DevTrainSlotSampleSurvivorPreparationDeltaV4(preparation) ||
      deltaGraphForSamplePreparationV4(preparation) !== graph ||
      samplePreparationForDeltaGraphV4(graph) !== preparation ||
      preparation.setP !== source?.setP ||
      preparation.setR !== source.setR ||
      preparation.setRDocumentCap !== source.setRDocumentCap ||
      preparation.setRFreezeSlotReadiness !== source.setRFreezeSlotReadiness
    ) {
      refuseV4Sample(
        'R36_DELTA_BATCH_COMPOSITION_INVALID',
        `delta preparation at position ${position} does not trace to its R35 graph`,
      );
    }
  }

  const sampleBatch: A3DevTrainSampleSurvivorDeltaBatchV4 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V4' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R36_SAMPLE_SPLIT,
    governanceSnapshotV4: batch.governanceSnapshotV4,
    graphDeltaBatch: batch,
    items: Object.freeze(minted),
  });
  MINTED_DELTA_SAMPLE_BATCHES.add(sampleBatch);
  GRAPH_BATCH_BY_SAMPLE_BATCH.set(sampleBatch, batch);
  SAMPLE_BATCH_BY_GRAPH_BATCH.set(batch, sampleBatch);
  return sampleBatch;
}

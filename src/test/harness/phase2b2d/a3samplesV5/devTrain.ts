/**
 * PHASE 2B-2D — A3 R42: THE V5 INCREMENTAL DEV_TRAIN SAMPLE BINDER, AND THE
 * ONLY PLACE THAT MINTS V5 DELTA SAMPLE PREPARATIONS.
 *
 * R41'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R41-minted `A3DevTrainSd7GraphDeltaBatchV5`
 *   and checks it by brand; requires the fresh-reproduction proof AND the
 *   historical sample-coverage proof minted for exactly that batch (identity,
 *   not equality); checks that it traces to its exact R40 batch both ways,
 *   under the V5 snapshot it stores; then checks every graph by R41 brand,
 *   derives its exact R40 slot through R41's provenance, and requires that
 *   slot to be the R40 batch item at the same position and to map back to the
 *   same graph - ALL before the first R23 call. It accepts no separately
 *   supplied documents, graphs, ranks, scores, survivor sets or cap members,
 *   so a graph from one slot can never meet another slot's documents or
 *   scores.
 *
 *   A clone, a spread, a literal, a deserialised copy, a batch holding a
 *   cloned graph, a graph passed as a batch, an R40 document batch, an R39
 *   evidence batch, an R35 / R28 / R22 graph batch, a V5 snapshot or READY,
 *   the committed R41 census or `undefined` refuses before any preparation.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass, and no expected
 *   item count is accepted: the count is derived from the batch.
 *
 * WHAT IS REUSED, AND WHAT IS DELIBERATELY NOT
 *
 *   Reused unchanged from R23: `prepareUnboundSlotSampleSurvivors` and
 *   `sampleSurvivorDivergence` (through `prepareDelta.ts`). NOT reused: R23's
 *   V1, R29's V2 and R36's V4 minting. They require their own upstream
 *   brands, correctly, and are neither called nor broadened here.
 *
 * DELTA ONLY
 *
 *   The loop runs over `batch.items` and nothing else. No historical slot,
 *   graph or preparation is obtained, wrapped, re-prepared or re-minted, and
 *   no twenty-slot input is ever built.
 *
 * ALL OR NOTHING, AND ONE-TO-ONE
 *
 *   Every graph is verified first; every delta slot is then prepared unbound
 *   and validated; only then is anything minted. One R41 graph yields at most
 *   one R42 preparation, and one R41 batch at most one R42 batch, per process.
 *
 * THIS MODULE ISSUES NO SQL. The only database access in a real run is
 * canonical R39's own, completed - and its pool closed - before R40, R41 and
 * this binder are called.
 */
import { evidenceDeltaBatchForDocumentSourceDeltaBatchV5 } from '../a3documentsV5/devTrain.js';
import type {
  A3DevTrainDocumentSourceDeltaBatchV5,
  A3DevTrainSlotDocumentSourceAssemblyDeltaV5,
} from '../a3documentsV5/types.js';
import {
  deltaGraphForDocumentSourceDeltaSlotV5,
  documentSourceDeltaBatchForGraphDeltaBatchV5,
  documentSourceDeltaSlotForDeltaGraphV5,
  graphDeltaBatchForDocumentSourceDeltaBatchV5,
  isA3DevTrainSd7GraphDeltaBatchV5,
  isA3DevTrainSlotSd7GraphMeasurementDeltaV5,
} from '../a3graphsV5/devTrain.js';
import type {
  A3DevTrainSd7GraphDeltaBatchV5,
  A3DevTrainSlotSd7GraphMeasurementDeltaV5,
} from '../a3graphsV5/types.js';
import { historicalSampleCoverageProofForBatch } from './history.js';
import { prepareDeltaSlotSamplesAllOrNothingV5 } from './prepareDelta.js';
import { r41ReproductionProofForBatch, type R41ReproductionProof } from './r41Drift.js';
import { refuseV5Sample } from './refusal.js';
import {
  R42_SAMPLE_SPLIT,
  type A3DevTrainSampleSurvivorDeltaBatchV5,
  type A3DevTrainSlotSampleSurvivorPreparationDeltaV5,
  type HistoricalV5SamplePreparationCoverageProof,
  type UnboundDeltaSlotSamplePreparationV5,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_PREPARATIONS = new WeakSet<object>();
const MINTED_DELTA_SAMPLE_BATCHES = new WeakSet<object>();
const DELTA_GRAPH_BY_PREPARATION = new WeakMap<object, A3DevTrainSlotSd7GraphMeasurementDeltaV5>();
const PREPARATION_BY_DELTA_GRAPH = new WeakMap<
  object,
  A3DevTrainSlotSampleSurvivorPreparationDeltaV5
>();
const GRAPH_BATCH_BY_SAMPLE_BATCH = new WeakMap<object, A3DevTrainSd7GraphDeltaBatchV5>();
const SAMPLE_BATCH_BY_GRAPH_BATCH = new WeakMap<object, A3DevTrainSampleSurvivorDeltaBatchV5>();
const R23_CALLS_BY_SAMPLE_BATCH = new WeakMap<object, number>();
/** R41 batches with a binding attempt currently in progress. */
const IN_FLIGHT_GRAPH_BATCHES = new WeakSet<object>();

/** True ONLY for a V5 delta preparation this module minted in THIS process. */
export function isA3DevTrainSlotSampleSurvivorPreparationDeltaV5(
  value: unknown,
): value is A3DevTrainSlotSampleSurvivorPreparationDeltaV5 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_PREPARATIONS.has(value);
}

export function isA3DevTrainSampleSurvivorDeltaBatchV5(
  value: unknown,
): value is A3DevTrainSampleSurvivorDeltaBatchV5 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_SAMPLE_BATCHES.has(value);
}

/** The exact R41 delta graph a minted R42 preparation was prepared over, or `undefined`. */
export function deltaGraphForSamplePreparationV5(
  preparation: unknown,
): A3DevTrainSlotSd7GraphMeasurementDeltaV5 | undefined {
  if (!isA3DevTrainSlotSampleSurvivorPreparationDeltaV5(preparation)) return undefined;
  return DELTA_GRAPH_BY_PREPARATION.get(preparation);
}

/** The R42 preparation minted from one R41 delta graph, or `undefined`. */
export function samplePreparationForDeltaGraphV5(
  graph: unknown,
): A3DevTrainSlotSampleSurvivorPreparationDeltaV5 | undefined {
  if (!isA3DevTrainSlotSd7GraphMeasurementDeltaV5(graph)) return undefined;
  return PREPARATION_BY_DELTA_GRAPH.get(graph);
}

/** The R41 batch a minted R42 sample batch was prepared from, or `undefined`. */
export function graphDeltaBatchForSampleDeltaBatchV5(
  batch: unknown,
): A3DevTrainSd7GraphDeltaBatchV5 | undefined {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV5(batch)) return undefined;
  return GRAPH_BATCH_BY_SAMPLE_BATCH.get(batch);
}

/** The R42 sample batch minted from one R41 batch, or `undefined`. */
export function sampleDeltaBatchForGraphDeltaBatchV5(
  batch: unknown,
): A3DevTrainSampleSurvivorDeltaBatchV5 | undefined {
  if (!isA3DevTrainSd7GraphDeltaBatchV5(batch)) return undefined;
  return SAMPLE_BATCH_BY_GRAPH_BATCH.get(batch);
}

/** How many canonical R23 calls produced this minted R42 batch, or `undefined`. */
export function r23CallsForSampleDeltaBatchV5(batch: unknown): number | undefined {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV5(batch)) return undefined;
  return R23_CALLS_BY_SAMPLE_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

/** §13. R41 brand, both proofs by identity, exact R40 batch both ways, DEV_TRAIN, one-shot. */
function requireMintedGraphDeltaBatch(
  batch: unknown,
  reproductionProof: unknown,
  historicalProof: unknown,
): {
  readonly batch: A3DevTrainSd7GraphDeltaBatchV5;
  readonly documentBatch: A3DevTrainDocumentSourceDeltaBatchV5;
} {
  if (!isA3DevTrainSd7GraphDeltaBatchV5(batch)) {
    refuseV5Sample(
      'R42_SD7_GRAPH_DELTA_NOT_MINTED_BY_R41',
      'the input is not a DEV_TRAIN SD7 graph delta batch minted by R41 in this process',
    );
  }
  const proved = r41ReproductionProofForBatch(batch);
  if (proved === undefined || proved !== reproductionProof) {
    refuseV5Sample(
      'R42_R41_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'this R41 batch was not proved to reproduce the committed R41 census',
    );
  }
  const history = historicalSampleCoverageProofForBatch(batch);
  if (history === undefined || history !== historicalProof) {
    refuseV5Sample(
      'R42_HISTORICAL_SAMPLE_COVERAGE_NOT_PROVED_FOR_BATCH',
      'the historical R36 / R37 sample coverage was not proved against this R41 batch',
    );
  }
  if (SAMPLE_BATCH_BY_GRAPH_BATCH.has(batch) || IN_FLIGHT_GRAPH_BATCHES.has(batch)) {
    refuseV5Sample(
      'R42_SD7_GRAPH_DELTA_ALREADY_PREPARED',
      'this R41 graph delta batch already produced an R42 sample delta batch',
    );
  }
  const documentBatch = documentSourceDeltaBatchForGraphDeltaBatchV5(batch);
  if (
    documentBatch === undefined ||
    graphDeltaBatchForDocumentSourceDeltaBatchV5(documentBatch) !== batch ||
    documentBatch.governanceSnapshotV5 !== batch.governanceSnapshotV5 ||
    documentBatch.items.length !== batch.items.length
  ) {
    refuseV5Sample(
      'R42_SD7_GRAPH_DELTA_NOT_MINTED_BY_R41',
      'the R41 graph delta batch does not trace to its exact R40 batch and V5 snapshot',
    );
  }
  if (batch.split !== R42_SAMPLE_SPLIT || documentBatch.split !== R42_SAMPLE_SPLIT) {
    refuseV5Sample('R42_SPLIT_NOT_SUPPORTED', 'the graph delta batch is outside DEV_TRAIN');
  }
  return { batch, documentBatch };
}

/**
 * §13. Coverage must still be purely additive, and nothing here is
 * caller-supplied: historical graph coverage, historical sample coverage and
 * historical readiness coverage are one and the same thirteen; the delta
 * graph count equals the batch's own items and the R41 proof's delta;
 * historical plus delta equals R41's combined graph coverage, R39's V5
 * DEV_TRAIN READY coverage and the R41 authority / evidence / document
 * coverage; and the proof's delta populations agree with the batch itself.
 */
function requireAdditiveCoverage(
  batch: A3DevTrainSd7GraphDeltaBatchV5,
  documentBatch: A3DevTrainDocumentSourceDeltaBatchV5,
  proof: R41ReproductionProof,
  history: HistoricalV5SamplePreparationCoverageProof,
): void {
  const items = batch.items.length;
  const historical = history.slotPreparations;
  const evidenceCoverage = evidenceDeltaBatchForDocumentSourceDeltaBatchV5(documentBatch)?.coverage;
  let documents = 0;
  let measurable = 0;
  let shortText = 0;
  for (const item of batch.items) {
    documents += item.graph.documents.length;
    measurable += item.graph.measurableIndices.length;
    shortText += item.graph.shortTextUnresolvedCount;
  }
  if (
    evidenceCoverage === undefined ||
    evidenceCoverage.changedExistingCount !== 0 ||
    evidenceCoverage.removedCount !== 0 ||
    evidenceCoverage.newlyBoundDeltaCount !== items ||
    evidenceCoverage.unchangedCanonicalCoverageCount !== historical ||
    evidenceCoverage.v5DevTrainReadyCount !== historical + items ||
    proof.historicalGraphSlots !== historical ||
    proof.sampleCoverageBeforeR42 !== historical ||
    proof.readinessCoverageBeforeR42 !== historical ||
    history.r37ReadinessSlots !== historical ||
    history.r41HistoricalSampleCoverage !== historical ||
    history.r41HistoricalReadinessCoverage !== historical ||
    proof.deltaGraphSlots !== items ||
    proof.r22Calls !== items ||
    proof.coverageGraphSlots !== historical + items ||
    proof.authorityCoverage !== historical + items ||
    proof.evidenceCoverage !== historical + items ||
    proof.documentCoverage !== historical + items ||
    proof.deltaDocuments !== documents ||
    proof.deltaMeasurableDocuments !== measurable ||
    proof.deltaShortTextUnresolved !== shortText ||
    measurable + shortText !== documents
  ) {
    refuseV5Sample(
      'R42_GRAPH_DELTA_COVERAGE_NOT_ADDITIVE',
      'historical sample coverage plus delta graphs does not equal the V5 DEV_TRAIN graph coverage',
    );
  }
}

/** §14. Every graph: R41 brand, its R40 slot at the same position, both ways. */
function requireGraphMintedForBatch(
  graph: unknown,
  documentBatch: A3DevTrainDocumentSourceDeltaBatchV5,
  position: number,
): {
  readonly graph: A3DevTrainSlotSd7GraphMeasurementDeltaV5;
  readonly slot: A3DevTrainSlotDocumentSourceAssemblyDeltaV5;
} {
  if (!isA3DevTrainSlotSd7GraphMeasurementDeltaV5(graph)) {
    refuseV5Sample(
      'R42_SD7_GRAPH_DELTA_NOT_MINTED_BY_R41',
      `batch graph at position ${position} is not a delta graph minted by R41`,
    );
  }
  const slot = documentSourceDeltaSlotForDeltaGraphV5(graph);
  if (
    slot === undefined ||
    documentBatch.items[position] !== slot ||
    deltaGraphForDocumentSourceDeltaSlotV5(slot) !== graph ||
    slot.selectionIndex !== graph.selectionIndex
  ) {
    refuseV5Sample(
      'R42_SD7_GRAPH_DELTA_NOT_MINTED_BY_R41',
      `batch graph at position ${position} does not trace to its R40 slot in this batch`,
    );
  }
  if (graph.split !== R42_SAMPLE_SPLIT || slot.split !== R42_SAMPLE_SPLIT) {
    refuseV5Sample(
      'R42_SPLIT_NOT_SUPPORTED',
      `batch graph at position ${position} is outside DEV_TRAIN`,
    );
  }
  if (PREPARATION_BY_DELTA_GRAPH.has(graph)) {
    refuseV5Sample(
      'R42_SD7_GRAPH_DELTA_ALREADY_PREPARED',
      `batch graph at position ${position} already has a minted R42 preparation`,
    );
  }
  return { graph, slot };
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaPreparation(
  graph: A3DevTrainSlotSd7GraphMeasurementDeltaV5,
  unbound: UnboundDeltaSlotSamplePreparationV5,
): A3DevTrainSlotSampleSurvivorPreparationDeltaV5 {
  const minted: A3DevTrainSlotSampleSurvivorPreparationDeltaV5 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_DELTA_V5' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: R42_SAMPLE_SPLIT,
    // §29: R23's canonical objects, by reference - never rebuilt.
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
 * Mints the DEV_TRAIN sample survivor V5 DELTA batch from an actual
 * R41-minted graph delta batch whose fresh reproduction and historical sample
 * coverage were proved. The item count is DERIVED from that batch. One R23
 * call per delta slot, and no other sample call.
 */
export function bindDevTrainSampleSurvivorDeltaBatchV5(
  graphDeltaBatch: unknown,
  reproductionProof: unknown,
  historicalProof: unknown,
): A3DevTrainSampleSurvivorDeltaBatchV5 {
  const { batch, documentBatch } = requireMintedGraphDeltaBatch(
    graphDeltaBatch,
    reproductionProof,
    historicalProof,
  );

  // §14: every graph verified BEFORE its counts are summed or R23 is called.
  const seenGraphs = new Set<object>();
  const seenSlots = new Set<object>();
  const seenSelectionIndices = new Set<number>();
  const pairs = batch.items.map((candidate, position) => {
    const pair = requireGraphMintedForBatch(candidate, documentBatch, position);
    if (
      seenGraphs.has(pair.graph) ||
      seenSlots.has(pair.slot) ||
      seenSelectionIndices.has(pair.graph.selectionIndex)
    ) {
      refuseV5Sample(
        'R42_DELTA_BATCH_COMPOSITION_INVALID',
        `batch graph at position ${position} repeats an earlier graph`,
      );
    }
    seenGraphs.add(pair.graph);
    seenSlots.add(pair.slot);
    seenSelectionIndices.add(pair.graph.selectionIndex);
    return pair;
  });
  requireAdditiveCoverage(
    batch,
    documentBatch,
    reproductionProof as R41ReproductionProof,
    historicalProof as HistoricalV5SamplePreparationCoverageProof,
  );

  IN_FLIGHT_GRAPH_BATCHES.add(batch);
  try {
    // §15 / §28: prepare EVERY delta slot, unbound, before minting ANY of them -
    // the exact R40 slot and the exact R41 canonical graph object, nothing else.
    const { preparations, r23Calls } = prepareDeltaSlotSamplesAllOrNothingV5(
      pairs.map(({ graph, slot }) => ({ slot, graph: graph.graph })),
    );
    if (preparations.length !== pairs.length || r23Calls !== pairs.length) {
      refuseV5Sample(
        'R42_DELTA_BATCH_COMPOSITION_INVALID',
        'not every R41 delta graph produced exactly one preparation from one R23 call',
      );
    }

    const minted = pairs.map(({ graph }, position) =>
      mintDeltaPreparation(graph, preparations[position] as UnboundDeltaSlotSamplePreparationV5),
    );
    for (const [position, preparation] of minted.entries()) {
      const graph = pairs[position]?.graph;
      const source = preparations[position];
      if (
        !isA3DevTrainSlotSampleSurvivorPreparationDeltaV5(preparation) ||
        deltaGraphForSamplePreparationV5(preparation) !== graph ||
        samplePreparationForDeltaGraphV5(graph) !== preparation ||
        preparation.setP !== source?.setP ||
        preparation.setR !== source.setR ||
        preparation.setRDocumentCap !== source.setRDocumentCap ||
        preparation.setRFreezeSlotReadiness !== source.setRFreezeSlotReadiness
      ) {
        refuseV5Sample(
          'R42_DELTA_BATCH_COMPOSITION_INVALID',
          `delta preparation at position ${position} does not trace to its R41 graph`,
        );
      }
    }

    const sampleBatch: A3DevTrainSampleSurvivorDeltaBatchV5 = Object.freeze({
      kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V5' as const,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
      split: R42_SAMPLE_SPLIT,
      governanceSnapshotV5: batch.governanceSnapshotV5,
      items: Object.freeze(minted),
    });
    MINTED_DELTA_SAMPLE_BATCHES.add(sampleBatch);
    GRAPH_BATCH_BY_SAMPLE_BATCH.set(sampleBatch, batch);
    SAMPLE_BATCH_BY_GRAPH_BATCH.set(batch, sampleBatch);
    R23_CALLS_BY_SAMPLE_BATCH.set(sampleBatch, r23Calls);
    return sampleBatch;
  } finally {
    IN_FLIGHT_GRAPH_BATCHES.delete(batch);
  }
}

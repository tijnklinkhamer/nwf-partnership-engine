/**
 * PHASE 2B-2D — A3 R23: THE DEV_TRAIN SAMPLE SURVIVOR BINDER, AND THE ONLY PLACE THAT MINTS.
 *
 * R22'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R22-minted `A3DevTrainSd7GraphBatchV1` and
 *   checks it by brand. It then derives the exact R21 batch through R22's own
 *   provenance (`documentSourceBatchForGraphBatch`), requires the governance
 *   snapshot to be the same object at every level, and for every position
 *   derives the exact R21 slot with `documentSourceAssemblyForSlotGraph` and
 *   requires the reverse mapping `slotGraphForDocumentSourceAssembly` to
 *   return that same graph. It accepts no separately supplied documents,
 *   graphs, ranks or score preparations, so a graph from one slot can never
 *   be combined with the documents or scores of another.
 *
 *   A clone, a spread, a literal, a deserialised batch, a cloned slot graph
 *   or a graph batch whose provenance does not resolve to one exact R21 batch
 *   is refused before any preparation happens.
 *
 *   There is no unsafe, forced, test-only, plain-object or environment
 *   bypass. Synthetic tests exercise the UNBOUND helper in `prepare.ts`; the
 *   minted route is exercised by the real R19 -> R20 -> R21 -> R22 -> R23
 *   chain, because that is what minted MEANS.
 *
 * ALL OR NOTHING
 *
 *   Every slot is prepared UNBOUND first. Only when every slot of the batch
 *   has passed every canonical call and structural check does anything get
 *   minted. A canonically BLOCKED cap is a result, not a refusal.
 *
 * ONE R22 GRAPH, ONE R23 PREPARATION
 *
 *   An R22 slot graph may be prepared once, and an R22 graph batch may be
 *   bound once. The mapping is one-to-one and recorded privately.
 *
 * THIS MODULE ISSUES NO SQL. It consumes an in-process R22 batch and nothing
 * else; the only database access in a real run is canonical R20's own.
 */
import type { A3DevTrainSlotDocumentSourceAssemblyV1 } from '../a3documents/types.js';
import {
  documentSourceAssemblyForSlotGraph,
  documentSourceBatchForGraphBatch,
  governanceSnapshotForGraphBatch,
  isA3DevTrainSd7GraphBatch,
  isA3DevTrainSlotSd7GraphMeasurement,
  slotGraphForDocumentSourceAssembly,
} from '../a3graphs/devTrain.js';
import type {
  A3DevTrainSd7GraphBatchV1,
  A3DevTrainSlotSd7GraphMeasurementV1,
} from '../a3graphs/types.js';
import type { A3CommittedGovernanceSnapshot } from '../a3governance/snapshot.js';
import { R20_EVIDENCE_SPLIT_V1 } from '../a3evidence/types.js';
import { prepareUnboundSlotSampleSurvivors } from './prepare.js';
import { refuse } from './refusal.js';
import type {
  A3DevTrainSampleSurvivorBatchV1,
  A3DevTrainSlotSampleSurvivorPreparationV1,
  UnboundA3SlotSampleSurvivorPreparation,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_SLOT_PREPARATIONS = new WeakSet<object>();
const MINTED_SAMPLE_BATCHES = new WeakSet<object>();
const SLOT_GRAPH_BY_SLOT_PREPARATION = new WeakMap<object, A3DevTrainSlotSd7GraphMeasurementV1>();
const SLOT_PREPARATION_BY_SLOT_GRAPH = new WeakMap<
  object,
  A3DevTrainSlotSampleSurvivorPreparationV1
>();
const GRAPH_BATCH_BY_SAMPLE_BATCH = new WeakMap<object, A3DevTrainSd7GraphBatchV1>();
const SAMPLE_BATCH_BY_GRAPH_BATCH = new WeakMap<object, A3DevTrainSampleSurvivorBatchV1>();

export function isA3DevTrainSlotSampleSurvivorPreparation(
  value: unknown,
): value is A3DevTrainSlotSampleSurvivorPreparationV1 {
  return typeof value === 'object' && value !== null && MINTED_SLOT_PREPARATIONS.has(value);
}

export function isA3DevTrainSampleSurvivorBatch(
  value: unknown,
): value is A3DevTrainSampleSurvivorBatchV1 {
  return typeof value === 'object' && value !== null && MINTED_SAMPLE_BATCHES.has(value);
}

/** The exact R22 slot graph a minted preparation was prepared from, or `undefined`. */
export function slotGraphForSlotSamplePreparation(
  preparation: unknown,
): A3DevTrainSlotSd7GraphMeasurementV1 | undefined {
  if (!isA3DevTrainSlotSampleSurvivorPreparation(preparation)) return undefined;
  return SLOT_GRAPH_BY_SLOT_PREPARATION.get(preparation);
}

/** The preparation minted from one R22 slot graph, or `undefined`. */
export function slotSamplePreparationForSlotGraph(
  slotGraph: unknown,
): A3DevTrainSlotSampleSurvivorPreparationV1 | undefined {
  if (!isA3DevTrainSlotSd7GraphMeasurement(slotGraph)) return undefined;
  return SLOT_PREPARATION_BY_SLOT_GRAPH.get(slotGraph);
}

/** The R22 graph batch a minted sample batch was prepared from, or `undefined`. */
export function graphBatchForSampleSurvivorBatch(
  batch: unknown,
): A3DevTrainSd7GraphBatchV1 | undefined {
  if (!isA3DevTrainSampleSurvivorBatch(batch)) return undefined;
  return GRAPH_BATCH_BY_SAMPLE_BATCH.get(batch);
}

/** The R19 snapshot behind a minted sample batch, through upstream provenance. */
export function governanceSnapshotForSampleSurvivorBatch(
  batch: unknown,
): A3CommittedGovernanceSnapshot | undefined {
  return governanceSnapshotForGraphBatch(graphBatchForSampleSurvivorBatch(batch));
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY (§8-§10).
// ---------------------------------------------------------------------------

function requireMintedGraphBatch(batch: unknown): A3DevTrainSd7GraphBatchV1 {
  if (!isA3DevTrainSd7GraphBatch(batch)) {
    refuse(
      'R23_SD7_GRAPH_AUTHORITY_NOT_MINTED_BY_R22',
      'the input is not a DEV_TRAIN SD7 graph batch minted by R22 in this process',
    );
  }
  if (batch.split !== R20_EVIDENCE_SPLIT_V1) {
    refuse('R23_SPLIT_NOT_SUPPORTED', 'the graph batch is outside DEV_TRAIN');
  }
  const documentBatch = documentSourceBatchForGraphBatch(batch);
  if (
    documentBatch === undefined ||
    documentBatch.split !== R20_EVIDENCE_SPLIT_V1 ||
    documentBatch.governanceSnapshot !== batch.governanceSnapshot ||
    governanceSnapshotForGraphBatch(batch) !== batch.governanceSnapshot ||
    documentBatch.items.length !== batch.items.length
  ) {
    refuse(
      'R23_SD7_GRAPH_AUTHORITY_NOT_MINTED_BY_R22',
      'the graph batch does not resolve to one exact R21 batch and snapshot',
    );
  }
  if (SAMPLE_BATCH_BY_GRAPH_BATCH.has(batch)) {
    refuse('R23_SD7_GRAPH_ALREADY_PREPARED', 'the graph batch already has a minted sample batch');
  }
  return batch;
}

interface BoundSlot {
  readonly slotGraph: A3DevTrainSlotSd7GraphMeasurementV1;
  readonly r21Slot: A3DevTrainSlotDocumentSourceAssemblyV1;
}

function requireSlotGraphMintedForBatch(
  candidate: unknown,
  batch: A3DevTrainSd7GraphBatchV1,
  position: number,
): BoundSlot {
  if (!isA3DevTrainSlotSd7GraphMeasurement(candidate)) {
    refuse(
      'R23_SD7_GRAPH_AUTHORITY_NOT_MINTED_BY_R22',
      `batch slot graph at position ${position} is not a slot graph minted by R22`,
    );
  }
  const documentBatch = documentSourceBatchForGraphBatch(batch);
  const r21Slot = documentSourceAssemblyForSlotGraph(candidate);
  if (
    r21Slot === undefined ||
    documentBatch?.items[position] !== r21Slot ||
    slotGraphForDocumentSourceAssembly(r21Slot) !== candidate ||
    r21Slot.selectionIndex !== candidate.selectionIndex
  ) {
    refuse(
      'R23_SD7_GRAPH_AUTHORITY_NOT_MINTED_BY_R22',
      `batch slot graph at position ${position} does not trace to its R21 slot in this batch`,
    );
  }
  if (candidate.split !== R20_EVIDENCE_SPLIT_V1 || r21Slot.split !== R20_EVIDENCE_SPLIT_V1) {
    refuse('R23_SPLIT_NOT_SUPPORTED', `batch slot at position ${position} is outside DEV_TRAIN`);
  }
  if (SLOT_PREPARATION_BY_SLOT_GRAPH.has(candidate)) {
    refuse(
      'R23_SD7_GRAPH_ALREADY_PREPARED',
      `batch slot graph at position ${position} already has a minted preparation`,
    );
  }
  return { slotGraph: candidate, r21Slot };
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintSlotPreparation(
  slotGraph: A3DevTrainSlotSd7GraphMeasurementV1,
  unbound: UnboundA3SlotSampleSurvivorPreparation,
): A3DevTrainSlotSampleSurvivorPreparationV1 {
  const minted: A3DevTrainSlotSampleSurvivorPreparationV1 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_V1' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: unbound.split,
    setP: unbound.setP,
    setR: unbound.setR,
    setRDocumentCap: unbound.setRDocumentCap,
    setRFreezeSlotReadiness: unbound.setRFreezeSlotReadiness,
  });
  MINTED_SLOT_PREPARATIONS.add(minted);
  SLOT_GRAPH_BY_SLOT_PREPARATION.set(minted, slotGraph);
  SLOT_PREPARATION_BY_SLOT_GRAPH.set(slotGraph, minted);
  return minted;
}

/**
 * Mints the DEV_TRAIN sample survivor batch from an actual R22-minted graph
 * batch. The item count is DERIVED from that batch - there is no
 * caller-supplied expected count. Each slot's SET_P and SET_R preparations
 * consume the SAME canonical graph object.
 */
export function bindDevTrainSampleSurvivorBatch(
  graphBatchInput: unknown,
): A3DevTrainSampleSurvivorBatchV1 {
  const graphBatch = requireMintedGraphBatch(graphBatchInput);

  const seenGraphs = new Set<object>();
  const seenSelectionIndices = new Set<number>();
  const bound = graphBatch.items.map((candidate, position) => {
    const slot = requireSlotGraphMintedForBatch(candidate, graphBatch, position);
    if (seenGraphs.has(slot.slotGraph) || seenSelectionIndices.has(slot.slotGraph.selectionIndex)) {
      refuse(
        'R23_BATCH_COMPOSITION_INVALID',
        `batch slot graph at position ${position} repeats an earlier slot`,
      );
    }
    seenGraphs.add(slot.slotGraph);
    seenSelectionIndices.add(slot.slotGraph.selectionIndex);
    return slot;
  });

  // Prepare EVERY slot, unbound, before minting ANY of them.
  const unbound = bound.map(({ slotGraph, r21Slot }) =>
    prepareUnboundSlotSampleSurvivors(r21Slot, slotGraph.graph),
  );
  if (unbound.length !== graphBatch.items.length) {
    refuse('R23_BATCH_COMPOSITION_INVALID', 'not every R22 slot graph produced one preparation');
  }

  const minted = bound.map(({ slotGraph }, position) =>
    mintSlotPreparation(slotGraph, unbound[position] as UnboundA3SlotSampleSurvivorPreparation),
  );
  for (const [position, preparation] of minted.entries()) {
    const slotGraph = bound[position]?.slotGraph;
    if (
      !isA3DevTrainSlotSampleSurvivorPreparation(preparation) ||
      slotGraphForSlotSamplePreparation(preparation) !== slotGraph ||
      slotSamplePreparationForSlotGraph(slotGraph) !== preparation ||
      preparation.selectionIndex !== slotGraph?.selectionIndex ||
      preparation.split !== R20_EVIDENCE_SPLIT_V1
    ) {
      refuse(
        'R23_BATCH_COMPOSITION_INVALID',
        `slot preparation at position ${position} does not trace to its R22 slot graph`,
      );
    }
  }

  const sampleBatch: A3DevTrainSampleSurvivorBatchV1 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_BATCH_V1' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R20_EVIDENCE_SPLIT_V1,
    governanceSnapshot: graphBatch.governanceSnapshot,
    items: Object.freeze(minted),
  });
  MINTED_SAMPLE_BATCHES.add(sampleBatch);
  GRAPH_BATCH_BY_SAMPLE_BATCH.set(sampleBatch, graphBatch);
  SAMPLE_BATCH_BY_GRAPH_BATCH.set(graphBatch, sampleBatch);
  return sampleBatch;
}

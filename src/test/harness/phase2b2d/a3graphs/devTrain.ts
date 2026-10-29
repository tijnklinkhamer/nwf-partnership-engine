/**
 * PHASE 2B-2D — A3 R22: THE DEV_TRAIN GRAPH BINDER, AND THE ONLY PLACE THAT MINTS.
 *
 * R21'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R21-minted `A3DevTrainDocumentSourceBatchV1`
 *   and checks it by brand, then checks every slot assembly by brand, by the
 *   R20 item R21 minted it from (by identity, at the same position of the
 *   exact R20 batch R21 consumed), and by the governance snapshot (by
 *   identity). A clone, a spread, a literal, a deserialised batch, an unbound
 *   R21 assembly or a slot from another batch is refused before any
 *   measurement happens.
 *
 *   Text comes ONLY from R21's private capability,
 *   `documentTextLookupForSlotAssembly(slot)`, and is handed straight to the
 *   canonical measurement. R22 never reaches R20 page rows and never
 *   reconstructs a lookup from durable evidence.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass. Synthetic tests
 *   exercise the UNBOUND measurement in `measure.ts`; the minted route is
 *   exercised by the real R19 -> R20 -> R21 -> R22 chain, because that is
 *   what minted MEANS.
 *
 * ALL OR NOTHING
 *
 *   Every slot is measured UNBOUND first. Only when every slot of the batch
 *   has measured does anything get minted, so a refusal half way through
 *   leaves no minted graph and no consumed R21 slot behind.
 *
 * ONE R21 SLOT, ONE R22 GRAPH
 *
 *   An R21 slot assembly may be measured once, and an R21 batch may be bound
 *   once. The mapping slot assembly <-> graph is one-to-one and recorded
 *   privately, so a second measurement refuses rather than producing a
 *   rival graph.
 *
 * THIS MODULE ISSUES NO SQL. It consumes an in-process R21 batch and nothing
 * else; the only database access in a real run is canonical R20's own.
 */
import {
  documentSourceAssemblyForDurableEvidence,
  documentTextLookupForSlotAssembly,
  durableEvidenceBatchForDocumentSourceBatch,
  durableEvidenceForDocumentSourceAssembly,
  governanceSnapshotForDocumentSourceBatch,
  isA3DevTrainDocumentSourceBatch,
  isA3DevTrainSlotDocumentSourceAssembly,
} from '../a3documents/devTrain.js';
import type {
  A3DevTrainDocumentSourceBatchV1,
  A3DevTrainSlotDocumentSourceAssemblyV1,
} from '../a3documents/types.js';
import type { A3CommittedGovernanceSnapshot } from '../a3governance/snapshot.js';
import { R20_EVIDENCE_SPLIT_V1 } from '../a3evidence/types.js';
import { measureUnboundSlotSd7Graph } from './measure.js';
import { refuse } from './refusal.js';
import type {
  A3DevTrainSd7GraphBatchV1,
  A3DevTrainSlotSd7GraphMeasurementV1,
  UnboundA3SlotSd7GraphPreparation,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_SLOT_GRAPHS = new WeakSet<object>();
const MINTED_GRAPH_BATCHES = new WeakSet<object>();
const SLOT_ASSEMBLY_BY_SLOT_GRAPH = new WeakMap<object, A3DevTrainSlotDocumentSourceAssemblyV1>();
const SLOT_GRAPH_BY_SLOT_ASSEMBLY = new WeakMap<object, A3DevTrainSlotSd7GraphMeasurementV1>();
const DOCUMENT_BATCH_BY_GRAPH_BATCH = new WeakMap<object, A3DevTrainDocumentSourceBatchV1>();
const GRAPH_BATCH_BY_DOCUMENT_BATCH = new WeakMap<object, A3DevTrainSd7GraphBatchV1>();

export function isA3DevTrainSlotSd7GraphMeasurement(
  value: unknown,
): value is A3DevTrainSlotSd7GraphMeasurementV1 {
  return typeof value === 'object' && value !== null && MINTED_SLOT_GRAPHS.has(value);
}

export function isA3DevTrainSd7GraphBatch(value: unknown): value is A3DevTrainSd7GraphBatchV1 {
  return typeof value === 'object' && value !== null && MINTED_GRAPH_BATCHES.has(value);
}

/** The exact R21 slot assembly a minted graph was measured from, or `undefined`. */
export function documentSourceAssemblyForSlotGraph(
  slotGraph: unknown,
): A3DevTrainSlotDocumentSourceAssemblyV1 | undefined {
  if (!isA3DevTrainSlotSd7GraphMeasurement(slotGraph)) return undefined;
  return SLOT_ASSEMBLY_BY_SLOT_GRAPH.get(slotGraph);
}

/** The graph minted from one R21 slot assembly, or `undefined`. */
export function slotGraphForDocumentSourceAssembly(
  slotAssembly: unknown,
): A3DevTrainSlotSd7GraphMeasurementV1 | undefined {
  if (!isA3DevTrainSlotDocumentSourceAssembly(slotAssembly)) return undefined;
  return SLOT_GRAPH_BY_SLOT_ASSEMBLY.get(slotAssembly);
}

/** The R21 batch a minted graph batch was measured from, or `undefined`. */
export function documentSourceBatchForGraphBatch(
  batch: unknown,
): A3DevTrainDocumentSourceBatchV1 | undefined {
  if (!isA3DevTrainSd7GraphBatch(batch)) return undefined;
  return DOCUMENT_BATCH_BY_GRAPH_BATCH.get(batch);
}

/** The R19 snapshot behind a minted graph batch, through upstream provenance. */
export function governanceSnapshotForGraphBatch(
  batch: unknown,
): A3CommittedGovernanceSnapshot | undefined {
  return governanceSnapshotForDocumentSourceBatch(documentSourceBatchForGraphBatch(batch));
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

function requireMintedDocumentBatch(batch: unknown): A3DevTrainDocumentSourceBatchV1 {
  if (!isA3DevTrainDocumentSourceBatch(batch)) {
    refuse(
      'R22_DOCUMENT_SOURCE_AUTHORITY_NOT_MINTED_BY_R21',
      'the input is not a DEV_TRAIN document-source batch minted by R21 in this process',
    );
  }
  if (batch.split !== R20_EVIDENCE_SPLIT_V1) {
    refuse('R22_SPLIT_NOT_SUPPORTED', 'the document-source batch is outside DEV_TRAIN');
  }
  const durableBatch = durableEvidenceBatchForDocumentSourceBatch(batch);
  if (
    durableBatch === undefined ||
    durableBatch.governanceSnapshot !== batch.governanceSnapshot ||
    governanceSnapshotForDocumentSourceBatch(batch) !== batch.governanceSnapshot ||
    durableBatch.items.length !== batch.items.length
  ) {
    refuse(
      'R22_DOCUMENT_SOURCE_AUTHORITY_NOT_MINTED_BY_R21',
      'the document-source batch does not trace to its exact R20 batch and snapshot',
    );
  }
  if (GRAPH_BATCH_BY_DOCUMENT_BATCH.has(batch)) {
    refuse(
      'R22_DOCUMENT_SOURCE_ALREADY_MEASURED',
      'the document-source batch already has a minted graph batch',
    );
  }
  return batch;
}

function requireSlotMintedForBatch(
  slot: unknown,
  batch: A3DevTrainDocumentSourceBatchV1,
  position: number,
): A3DevTrainSlotDocumentSourceAssemblyV1 {
  if (!isA3DevTrainSlotDocumentSourceAssembly(slot)) {
    refuse(
      'R22_DOCUMENT_SOURCE_AUTHORITY_NOT_MINTED_BY_R21',
      `batch slot at position ${position} is not a slot assembly minted by R21`,
    );
  }
  const durable = durableEvidenceForDocumentSourceAssembly(slot);
  const durableBatch = durableEvidenceBatchForDocumentSourceBatch(batch);
  if (
    durable === undefined ||
    durableBatch?.items[position] !== durable ||
    documentSourceAssemblyForDurableEvidence(durable) !== slot ||
    durable.governanceSnapshot !== batch.governanceSnapshot ||
    durable.authority.selectionIndex !== slot.selectionIndex
  ) {
    refuse(
      'R22_DOCUMENT_SOURCE_AUTHORITY_NOT_MINTED_BY_R21',
      `batch slot at position ${position} does not trace to its R20 item in this batch`,
    );
  }
  if (slot.split !== R20_EVIDENCE_SPLIT_V1 || durable.split !== R20_EVIDENCE_SPLIT_V1) {
    refuse('R22_SPLIT_NOT_SUPPORTED', `batch slot at position ${position} is outside DEV_TRAIN`);
  }
  if (SLOT_GRAPH_BY_SLOT_ASSEMBLY.has(slot)) {
    refuse(
      'R22_DOCUMENT_SOURCE_ALREADY_MEASURED',
      `batch slot at position ${position} already has a minted graph`,
    );
  }
  return slot;
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintSlotGraph(
  slot: A3DevTrainSlotDocumentSourceAssemblyV1,
  unbound: UnboundA3SlotSd7GraphPreparation,
): A3DevTrainSlotSd7GraphMeasurementV1 {
  const minted: A3DevTrainSlotSd7GraphMeasurementV1 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_V1' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: unbound.split,
    graph: unbound.graph,
  });
  MINTED_SLOT_GRAPHS.add(minted);
  SLOT_ASSEMBLY_BY_SLOT_GRAPH.set(minted, slot);
  SLOT_GRAPH_BY_SLOT_ASSEMBLY.set(slot, minted);
  return minted;
}

/**
 * Mints the DEV_TRAIN SD7 graph batch from an actual R21-minted batch. The
 * item count is DERIVED from that batch - there is no caller-supplied
 * expected count. One canonical graph call per slot, and no other.
 */
export function bindDevTrainSd7GraphBatch(documentBatch: unknown): A3DevTrainSd7GraphBatchV1 {
  const batch = requireMintedDocumentBatch(documentBatch);

  const seenSlots = new Set<object>();
  const seenSelectionIndices = new Set<number>();
  const slots = batch.items.map((candidate, position) => {
    const slot = requireSlotMintedForBatch(candidate, batch, position);
    if (seenSlots.has(slot) || seenSelectionIndices.has(slot.selectionIndex)) {
      refuse(
        'R22_BATCH_COMPOSITION_INVALID',
        `batch slot at position ${position} repeats an earlier slot`,
      );
    }
    seenSlots.add(slot);
    seenSelectionIndices.add(slot.selectionIndex);
    return slot;
  });

  // Measure EVERY slot, unbound, before minting ANY of them.
  const unbound = slots.map((slot) =>
    measureUnboundSlotSd7Graph(slot, documentTextLookupForSlotAssembly(slot)),
  );
  if (unbound.length !== batch.items.length) {
    refuse('R22_BATCH_COMPOSITION_INVALID', 'not every R21 slot produced one graph');
  }

  const minted = slots.map((slot, position) =>
    mintSlotGraph(slot, unbound[position] as UnboundA3SlotSd7GraphPreparation),
  );
  for (const [position, slotGraph] of minted.entries()) {
    if (
      !isA3DevTrainSlotSd7GraphMeasurement(slotGraph) ||
      documentSourceAssemblyForSlotGraph(slotGraph) !== slots[position] ||
      slotGraphForDocumentSourceAssembly(slots[position]) !== slotGraph ||
      slotGraph.split !== R20_EVIDENCE_SPLIT_V1
    ) {
      refuse(
        'R22_BATCH_COMPOSITION_INVALID',
        `slot graph at position ${position} does not trace to its R21 slot assembly`,
      );
    }
  }

  const graphBatch: A3DevTrainSd7GraphBatchV1 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SD7_GRAPH_BATCH_V1' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R20_EVIDENCE_SPLIT_V1,
    governanceSnapshot: batch.governanceSnapshot,
    items: Object.freeze(minted),
  });
  MINTED_GRAPH_BATCHES.add(graphBatch);
  DOCUMENT_BATCH_BY_GRAPH_BATCH.set(graphBatch, batch);
  GRAPH_BATCH_BY_DOCUMENT_BATCH.set(batch, graphBatch);
  return graphBatch;
}

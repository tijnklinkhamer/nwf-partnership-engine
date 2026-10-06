/**
 * PHASE 2B-2D — A3 R47: ALL TWENTY R4 SAMPLE PREPARATIONS, MINTED ATOMICALLY.
 *
 * For every minted R4 graph, exactly one `prepareUnboundR4SlotSamples` call
 * over that graph and its replay slot's own canonical document entries:
 * unchanged `rankSetPFull` / `rankSetRFull`, the K3 greedy walk over the R4
 * relation, exact caps 8 / 4. Every graph document is a SURVIVOR or an
 * EXCLUSION in each sample; there is no third class.
 *
 * All twenty are prepared and validated UNBOUND first. A refusal on slot 20
 * mints nothing. One sample batch per graph batch.
 *
 * THIS MODULE ISSUES NO SQL AND READS NO TEXT.
 */
import { isA3R4DevTrainGraphBatch, replaySlotForR4Graph } from './graphs.js';
import { refuseR47 } from './refusal.js';
import { prepareUnboundR4SlotSamples, type UnboundR4SlotSamplePreparation } from './survivors.js';
import {
  R47_REPLAY_SPLIT,
  type A3R4DevTrainGraphBatch,
  type A3R4DevTrainSampleBatch,
  type A3R4DevTrainSlotGraph,
  type A3R4DevTrainSlotSamplePreparation,
} from './types.js';

const MINTED_PREPARATIONS = new WeakSet<object>();
const MINTED_BATCHES = new WeakSet<object>();
const PREPARATION_BY_GRAPH = new WeakMap<object, A3R4DevTrainSlotSamplePreparation>();
const GRAPH_BY_PREPARATION = new WeakMap<object, A3R4DevTrainSlotGraph>();
const BATCH_BY_GRAPH_BATCH = new WeakMap<object, A3R4DevTrainSampleBatch>();
const GRAPH_BATCH_BY_BATCH = new WeakMap<object, A3R4DevTrainGraphBatch>();
const PREPARATIONS_BY_BATCH = new WeakMap<object, number>();
const IN_FLIGHT = new WeakSet<object>();

export function isA3R4DevTrainSlotSamplePreparation(
  value: unknown,
): value is A3R4DevTrainSlotSamplePreparation {
  return typeof value === 'object' && value !== null && MINTED_PREPARATIONS.has(value);
}
export function isA3R4DevTrainSampleBatch(value: unknown): value is A3R4DevTrainSampleBatch {
  return typeof value === 'object' && value !== null && MINTED_BATCHES.has(value);
}
export function r4GraphForSamplePreparation(value: unknown): A3R4DevTrainSlotGraph | undefined {
  return isA3R4DevTrainSlotSamplePreparation(value) ? GRAPH_BY_PREPARATION.get(value) : undefined;
}
export function r4SamplePreparationForGraph(
  graph: unknown,
): A3R4DevTrainSlotSamplePreparation | undefined {
  return typeof graph === 'object' && graph !== null ? PREPARATION_BY_GRAPH.get(graph) : undefined;
}
export function r4GraphBatchForSampleBatch(batch: unknown): A3R4DevTrainGraphBatch | undefined {
  return isA3R4DevTrainSampleBatch(batch) ? GRAPH_BATCH_BY_BATCH.get(batch) : undefined;
}
export function r4SamplePreparationsForBatch(batch: unknown): number | undefined {
  return isA3R4DevTrainSampleBatch(batch) ? PREPARATIONS_BY_BATCH.get(batch) : undefined;
}

export function bindR4DevTrainSampleBatch(graphBatch: unknown): A3R4DevTrainSampleBatch {
  if (!isA3R4DevTrainGraphBatch(graphBatch)) {
    refuseR47('R47_NOT_A_MINTED_R4_GRAPH_BATCH', 'the input is not a minted R4 graph batch');
  }
  if (BATCH_BY_GRAPH_BATCH.has(graphBatch) || IN_FLIGHT.has(graphBatch)) {
    refuseR47(
      'R47_R4_SAMPLE_BATCH_ALREADY_PREPARED',
      'this R4 graph batch already produced samples',
    );
  }
  IN_FLIGHT.add(graphBatch);
  try {
    let preparations = 0;
    const unbound: UnboundR4SlotSamplePreparation[] = graphBatch.items.map((graph, position) => {
      const slot = replaySlotForR4Graph(graph);
      if (slot === undefined || slot.selectionIndex !== graph.selectionIndex) {
        refuseR47(
          'R47_R4_SAMPLE_INPUT_INVALID',
          `graph at position ${position} does not trace to its replay slot`,
        );
      }
      try {
        preparations += 1;
        return prepareUnboundR4SlotSamples(slot, graph.graph);
      } catch (error) {
        refuseR47(
          'R47_R4_SAMPLE_POSTCONDITION_FAILED',
          `R4 sample preparation stopped at position ${position}`,
          { cause: error },
        );
      }
    });

    const items = unbound.map((result, position) => {
      const graph = graphBatch.items[position]!;
      const minted: A3R4DevTrainSlotSamplePreparation = Object.freeze({
        kind: 'A3_R4_DEV_TRAIN_SLOT_SAMPLE_PREPARATION' as const,
        authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
        selectionIndex: result.selectionIndex,
        split: R47_REPLAY_SPLIT,
        setP: result.setP,
        setR: result.setR,
      });
      MINTED_PREPARATIONS.add(minted);
      PREPARATION_BY_GRAPH.set(graph, minted);
      GRAPH_BY_PREPARATION.set(minted, graph);
      return minted;
    });
    const batch: A3R4DevTrainSampleBatch = Object.freeze({
      kind: 'A3_R4_DEV_TRAIN_SAMPLE_BATCH' as const,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
      split: R47_REPLAY_SPLIT,
      items: Object.freeze(items),
    });
    MINTED_BATCHES.add(batch);
    BATCH_BY_GRAPH_BATCH.set(graphBatch, batch);
    GRAPH_BATCH_BY_BATCH.set(batch, graphBatch);
    PREPARATIONS_BY_BATCH.set(batch, preparations);
    return batch;
  } finally {
    IN_FLIGHT.delete(graphBatch);
  }
}

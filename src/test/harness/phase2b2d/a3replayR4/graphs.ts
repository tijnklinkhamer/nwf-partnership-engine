/**
 * PHASE 2B-2D — A3 R47: ALL TWENTY R4 GRAPHS, THEIR EXACT ENVELOPES, AND THE
 * GRAPH-LEVEL A2 / SD9 INVARIANCE CHECK.
 *
 * THE ONLY SEMANTIC INPUT IS THE CANONICAL DOCUMENT AUTHORITY
 *
 *   A replay slot's own document entries and its own private text capability.
 *   No historical R3 graph (R22 / R28 / R35 / R41) is read, consumed or
 *   compared as input: this module imports nothing from any `a3graphs*`
 *   namespace. Each R4 document becomes one canonical `ExactDuplicateGroup`
 *   mechanically - its digest, its source rows in order, and
 *   `extractedTextDiverged: false`, which is legitimate because every landed
 *   document binder refused divergent groups before minting.
 *
 * THE SAME PATH FOR EVERY SLOT
 *
 *   There is no branch on stratum, on generation, on which slots once had a
 *   blocked cap, or on which slots hold short text. Every replay slot goes
 *   through `measureUnboundR4SlotGraph`, exactly once.
 *
 * ALL OR NOTHING
 *
 *   All twenty graphs are measured UNBOUND, structurally proved, given their
 *   exact envelope, and checked against the R3 long-branch history and the A2
 *   acquisition of record BEFORE any one is minted. A refusal on slot 20
 *   leaves zero R4 graphs, zero slot -> graph mappings and no batch.
 *
 * A2 IS NOT TOUCHED. A mismatch STOPS; it never changes A2, consumes a
 * reserve, alters Governance V5 or proceeds to samples.
 *
 * THIS MODULE ISSUES NO SQL.
 */
import type { DocumentTextLookup, ExactDuplicateGroup } from '../sd7/nearDuplicatePairs.js';
import { evaluateSd9FromAdmissiblePostSd7Bounds } from '../a3prep/sd9.js';
import type { A3DocumentSourceEntry } from '../a3documents/types.js';
import { deriveR4SurvivorEnvelope } from '../sd7R4/envelope.js';
import { measureR4NearDuplicateGraph, requireR4GraphStructure } from '../sd7R4/measure.js';
import { R3_FIVE_GRAM_JACCARD } from '../sd7R4/types.js';
import {
  isA3R4DevTrainCanonicalDocumentReplayView,
  textLookupForR4ReplaySlot,
  v5ReadyAuthorityForR4ReplaySlot,
} from './documents.js';
import { refuseR47 } from './refusal.js';
import {
  R47_GRAPH_SD9_SEMANTICS,
  R47_HISTORICAL_R3_BASELINE,
  R47_REPLAY_SPLIT,
  type A3R4DevTrainCanonicalDocumentReplayView,
  type A3R4DevTrainGraphBatch,
  type A3R4DevTrainSlotGraph,
  type A3R4DocumentReplaySlot,
  type UnboundA3R4SlotGraph,
} from './types.js';

// ---------------------------------------------------------------------------
// A. ONE SLOT, UNBOUND.
// ---------------------------------------------------------------------------

/** One canonical exact group per document, in order; a bijection or a refusal. */
export function exactGroupsForR4Slot(
  documents: readonly A3DocumentSourceEntry[],
): readonly ExactDuplicateGroup[] {
  if (!Array.isArray(documents) || documents.length === 0) {
    refuseR47('R47_R4_GRAPH_MEASUREMENT_STOPPED', 'an authorised slot presented no exact document');
  }
  const seenDocuments = new Set<string>();
  const seenRows = new Set<string>();
  return Object.freeze(
    documents.map((entry, position): ExactDuplicateGroup => {
      const { documentSha256, sourcePageEvidenceIds } = entry.document;
      if (seenDocuments.has(documentSha256) || sourcePageEvidenceIds.length === 0) {
        refuseR47(
          'R47_R4_GRAPH_MEASUREMENT_STOPPED',
          `document entry at position ${position} repeats a document or names no source row`,
        );
      }
      seenDocuments.add(documentSha256);
      for (const row of sourcePageEvidenceIds) {
        if (seenRows.has(row)) {
          refuseR47(
            'R47_R4_GRAPH_MEASUREMENT_STOPPED',
            `document entry at position ${position} shares a source row with another document`,
          );
        }
        seenRows.add(row);
      }
      return Object.freeze({
        documentSha256,
        pageIds: sourcePageEvidenceIds,
        extractedTextDiverged: false,
      });
    }),
  );
}

/**
 * Measures ONE slot's R4 graph, proves its structure, derives its exact
 * order-independent envelope and its graph-level mechanical SD9 status.
 * Returns an UNBOUND result: it carries no authority.
 */
export function measureUnboundR4SlotGraph(
  slot: {
    readonly selectionIndex: number;
    readonly split: string;
    readonly documents: readonly A3DocumentSourceEntry[];
  },
  textLookup: DocumentTextLookup,
): UnboundA3R4SlotGraph {
  if (slot.split !== R47_REPLAY_SPLIT) {
    refuseR47('R47_R4_GRAPH_MEASUREMENT_STOPPED', 'R47 measures DEV_TRAIN only');
  }
  const groups = exactGroupsForR4Slot(slot.documents);
  const graph = measureR4NearDuplicateGraph(groups, textLookup);
  requireR4GraphStructure(
    graph,
    slot.documents.map((entry) => entry.document.documentSha256),
  );
  const envelope = deriveR4SurvivorEnvelope(graph, groups, textLookup);
  return Object.freeze({
    kind: 'UNBOUND_A3_R4_SLOT_GRAPH' as const,
    selectionIndex: slot.selectionIndex,
    split: R47_REPLAY_SPLIT,
    graph,
    envelope,
    graphSd9Semantics: R47_GRAPH_SD9_SEMANTICS,
    graphSd9Status: evaluateSd9FromAdmissiblePostSd7Bounds(
      envelope.survivorsMin,
      envelope.survivorsMax,
    ),
  });
}

// ---------------------------------------------------------------------------
// B. AGGREGATES OVER UNBOUND GRAPHS (counts only).
// ---------------------------------------------------------------------------

export interface R4GraphAggregates {
  readonly slots: number;
  readonly documents: number;
  readonly longDocuments: number;
  readonly shortBranchDocuments: number;
  readonly relationResolvedDocuments: number;
  readonly unresolvedDocuments: number;
  readonly totalUnorderedPairs: number;
  readonly r3FiveGramPairs: number;
  readonly r4ExactSequenceBranchPairs: number;
  readonly r3FiveGramEdges: number;
  readonly r3DocumentsTouchingAnEdge: number;
  readonly r4ShortExactSequenceEdges: number;
  readonly totalR4Edges: number;
  readonly documentsTouchingAnyR4Edge: number;
  readonly shortEquivalenceClasses: number;
  readonly survivorEnvelopeMinTotal: number;
  readonly survivorEnvelopeMaxTotal: number;
}

export function r4GraphAggregatesOf(
  items: readonly Pick<UnboundA3R4SlotGraph, 'graph' | 'envelope'>[],
): R4GraphAggregates {
  const sum = (f: (item: Pick<UnboundA3R4SlotGraph, 'graph' | 'envelope'>) => number): number =>
    items.reduce((total, item) => total + f(item), 0);
  const touching = (item: Pick<UnboundA3R4SlotGraph, 'graph'>, onlyR3: boolean): number => {
    const set = new Set<number>();
    for (const edge of item.graph.edges) {
      if (onlyR3 && edge.basis !== R3_FIVE_GRAM_JACCARD) continue;
      set.add(edge.aIndex);
      set.add(edge.bIndex);
    }
    return set.size;
  };
  const r3Edges = sum((i) => i.graph.edges.filter((e) => e.basis === R3_FIVE_GRAM_JACCARD).length);
  const allEdges = sum((i) => i.graph.edges.length);
  return Object.freeze({
    slots: items.length,
    documents: sum((i) => i.graph.documents.length),
    longDocuments: sum((i) => i.graph.longIndices.length),
    shortBranchDocuments: sum((i) => i.graph.shortIndices.length),
    relationResolvedDocuments: sum(
      (i) => i.graph.documents.filter((d) => d.relationResolved).length,
    ),
    unresolvedDocuments: sum((i) => i.graph.unresolvedDocumentCount),
    totalUnorderedPairs: sum((i) => i.graph.totalPairCount),
    r3FiveGramPairs: sum((i) => i.graph.r3FiveGramPairCount),
    r4ExactSequenceBranchPairs: sum((i) => i.graph.r4ExactSequenceBranchPairCount),
    r3FiveGramEdges: r3Edges,
    r3DocumentsTouchingAnEdge: sum((i) => touching(i, true)),
    r4ShortExactSequenceEdges: allEdges - r3Edges,
    totalR4Edges: allEdges,
    documentsTouchingAnyR4Edge: sum((i) => touching(i, false)),
    shortEquivalenceClasses: sum((i) => i.envelope.shortEquivalenceClassCount),
    survivorEnvelopeMinTotal: sum((i) => i.envelope.survivorsMin),
    survivorEnvelopeMaxTotal: sum((i) => i.envelope.survivorsMax),
  });
}

// ---------------------------------------------------------------------------
// C. THE BINDER.
// ---------------------------------------------------------------------------

const MINTED_GRAPHS = new WeakSet<object>();
const MINTED_BATCHES = new WeakSet<object>();
const GRAPH_BY_REPLAY_SLOT = new WeakMap<object, A3R4DevTrainSlotGraph>();
const REPLAY_SLOT_BY_GRAPH = new WeakMap<object, A3R4DocumentReplaySlot>();
const BATCH_BY_VIEW = new WeakMap<object, A3R4DevTrainGraphBatch>();
const VIEW_BY_BATCH = new WeakMap<object, A3R4DevTrainCanonicalDocumentReplayView>();
const MEASUREMENTS_BY_BATCH = new WeakMap<object, number>();
const IN_FLIGHT_VIEWS = new WeakSet<object>();

export function isA3R4DevTrainSlotGraph(value: unknown): value is A3R4DevTrainSlotGraph {
  return typeof value === 'object' && value !== null && MINTED_GRAPHS.has(value);
}
export function isA3R4DevTrainGraphBatch(value: unknown): value is A3R4DevTrainGraphBatch {
  return typeof value === 'object' && value !== null && MINTED_BATCHES.has(value);
}
export function r4GraphForReplaySlot(slot: unknown): A3R4DevTrainSlotGraph | undefined {
  return typeof slot === 'object' && slot !== null ? GRAPH_BY_REPLAY_SLOT.get(slot) : undefined;
}
export function replaySlotForR4Graph(graph: unknown): A3R4DocumentReplaySlot | undefined {
  return isA3R4DevTrainSlotGraph(graph) ? REPLAY_SLOT_BY_GRAPH.get(graph) : undefined;
}
export function r4GraphBatchForView(view: unknown): A3R4DevTrainGraphBatch | undefined {
  return typeof view === 'object' && view !== null ? BATCH_BY_VIEW.get(view) : undefined;
}
export function viewForR4GraphBatch(
  batch: unknown,
): A3R4DevTrainCanonicalDocumentReplayView | undefined {
  return isA3R4DevTrainGraphBatch(batch) ? VIEW_BY_BATCH.get(batch) : undefined;
}
/** How many R4 graph measurements produced this minted batch. */
export function r4GraphMeasurementsForBatch(batch: unknown): number | undefined {
  return isA3R4DevTrainGraphBatch(batch) ? MEASUREMENTS_BY_BATCH.get(batch) : undefined;
}

/**
 * Measures all twenty R4 graphs unbound, proves the R3 long-branch history
 * and the A2 / SD9 invariance for every slot, and only then mints the batch.
 */
export function bindR4DevTrainGraphBatch(view: unknown): A3R4DevTrainGraphBatch {
  if (!isA3R4DevTrainCanonicalDocumentReplayView(view)) {
    refuseR47('R47_NOT_A_MINTED_DOCUMENT_REPLAY_VIEW', 'the input is not a minted R47 replay view');
  }
  if (BATCH_BY_VIEW.has(view) || IN_FLIGHT_VIEWS.has(view)) {
    refuseR47('R47_R4_GRAPH_BATCH_ALREADY_MEASURED', 'this replay view already produced R4 graphs');
  }
  IN_FLIGHT_VIEWS.add(view);
  try {
    // 1. Measure all twenty UNBOUND. Same path for every slot.
    let measurements = 0;
    const unbound = view.slots.map((slot, position) => {
      const lookup = textLookupForR4ReplaySlot(slot);
      try {
        measurements += 1;
        return measureUnboundR4SlotGraph(slot, lookup);
      } catch (error) {
        refuseR47(
          'R47_R4_GRAPH_MEASUREMENT_STOPPED',
          `R4 graph measurement stopped at replay position ${position}`,
          { cause: error },
        );
      }
    });

    // 2. The defined R3 branch and the document population, exactly as history.
    const aggregates = r4GraphAggregatesOf(unbound);
    const history = R47_HISTORICAL_R3_BASELINE;
    if (
      aggregates.documents !== history.documents ||
      aggregates.longDocuments !== history.longDocuments ||
      aggregates.shortBranchDocuments !== history.shortTextUnresolvedUnderR3 ||
      aggregates.r3FiveGramPairs !== history.r3ComparedLongPairs ||
      aggregates.r3FiveGramEdges !== history.r3Edges ||
      aggregates.r3DocumentsTouchingAnEdge !== history.r3DocumentsTouchingAnEdge ||
      aggregates.unresolvedDocuments !== 0 ||
      aggregates.relationResolvedDocuments !== aggregates.documents ||
      aggregates.totalUnorderedPairs !==
        aggregates.r3FiveGramPairs + aggregates.r4ExactSequenceBranchPairs
    ) {
      refuseR47(
        'STOP_R47_R3_LONG_BRANCH_INVARIANT_MISMATCH',
        'R4 changed the defined R3 branch or the canonical document population',
      );
    }

    // 3. Graph-level A2 / SD9 invariance, every slot.
    let mismatches = 0;
    const dispositions = view.slots.map((slot, position) => {
      const ready = v5ReadyAuthorityForR4ReplaySlot(slot);
      const disposition = ready?.disposition;
      if (
        disposition !== 'ACQUISITION_SUCCESSFUL' ||
        unbound[position]!.graphSd9Status !== disposition
      ) {
        mismatches += 1;
      }
      return disposition;
    });
    if (mismatches !== 0) {
      refuseR47(
        'STOP_R47_A2_SD9_INVARIANCE_MISMATCH',
        `${String(mismatches)} of ${String(view.slots.length)} R4 graph-level SD9 statuses disagree with the A2 acquisition of record`,
      );
    }

    // 4. Only now: mint.
    const items = unbound.map((result, position) => {
      const slot = view.slots[position]!;
      const minted: A3R4DevTrainSlotGraph = Object.freeze({
        kind: 'A3_R4_DEV_TRAIN_SLOT_GRAPH' as const,
        authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
        selectionIndex: result.selectionIndex,
        split: R47_REPLAY_SPLIT,
        graph: result.graph,
        envelope: result.envelope,
        graphSd9Semantics: result.graphSd9Semantics,
        graphSd9Status: result.graphSd9Status,
        a2AcquisitionOfRecordDisposition: dispositions[position] as 'ACQUISITION_SUCCESSFUL',
        a2StatusMatches: true as const,
      });
      MINTED_GRAPHS.add(minted);
      GRAPH_BY_REPLAY_SLOT.set(slot, minted);
      REPLAY_SLOT_BY_GRAPH.set(minted, slot);
      return minted;
    });
    const batch: A3R4DevTrainGraphBatch = Object.freeze({
      kind: 'A3_R4_DEV_TRAIN_GRAPH_BATCH' as const,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
      split: R47_REPLAY_SPLIT,
      items: Object.freeze(items),
    });
    MINTED_BATCHES.add(batch);
    BATCH_BY_VIEW.set(view, batch);
    VIEW_BY_BATCH.set(batch, view);
    MEASUREMENTS_BY_BATCH.set(batch, measurements);
    return batch;
  } finally {
    IN_FLIGHT_VIEWS.delete(view);
  }
}

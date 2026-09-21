/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R7: THE SAMPLE-AGNOSTIC GREEDY SD7
 * SURVIVOR WALK OVER THE CANONICAL R6 GRAPH.
 *
 * K3 is resolved by owner clarification
 * (`K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_CLARIFICATION_V1`, bound in `contracts.ts`
 * section G): one canonical near-duplicate graph per organisation, one
 * survivor set PER SAMPLE, and the survivor procedure is
 * `GREEDY_SAMPLE_RANK_SURVIVOR_WALK` - walk the sample's frozen total order
 * earliest -> latest and keep a document iff it has no graph edge to a
 * document ALREADY KEPT for that sample. This module is that one procedure.
 *
 * KEPT, NOT MERELY EARLIER. A document is excluded only by a neighbour that
 * was actually kept. On the path A - B - C walked A, B, C, B is excluded by A,
 * and C then survives because its only neighbour, B, was never kept. A rule
 * of "drop anything with ANY earlier neighbour" would drop C as well; that is
 * not the owner's procedure.
 *
 * WHAT THIS MODULE DOES NOT DO, AND WHY
 *
 *   - It measures nothing. It consumes a `NearDuplicateGraphMeasurement`
 *     produced by R6's `measureNearDuplicateGraph`, the one canonical pair
 *     measurement, and never normalises, tokenises, shingles or compares. It
 *     validates the graph's STRUCTURE only and never second-guesses an edge.
 *   - It knows no sample rule. The caller supplies ONE sample's complete,
 *     frozen total order; whether that order came from SET_P's salted rank or
 *     a future SET_R score rank is invisible here. It never computes a rank,
 *     and it never uses `graph.documents` order to choose anything.
 *   - It handles exactly ONE sample per call. SET_P and SET_R keep separate
 *     survivor sets (K3 "AT MOST ONE" is PER_SAMPLE); there is deliberately no
 *     entry point that takes both.
 *   - It decides nothing about SD7_SHORT_TEXT_UNRESOLVED documents. They are
 *     neither kept nor dropped: they are partitioned out, in the caller's
 *     sample order, into a differently-named sequence that carries the
 *     residual `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP` token. The owner has since
 *     resolved the HANDLING policy for that token (ambiguity propagation,
 *     `SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY` in `contracts.ts` section I); each
 *     document's semantic near-duplicate status stays unresolved, so this
 *     partition is exactly what that policy consumes.
 *   - It applies no cap, evaluates no SD9, and answers none of K1, K2 or K4.
 *     Its survivor sequence is a full survivor-aware rank, not a final sample.
 *
 * No refusal message carries a document SHA-256: a failure names a POSITION
 * or an index, so a sealed-split identity cannot reach a log.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read, no hashing. It mutates no input.
 */
import {
  K3_OWNER_DECISION,
  K3_SD7_AT_MOST_ONE_SCOPE,
  K3_SD7_GRAPH_SCOPE,
  K3_SD7_SURVIVOR_PROCEDURE,
  K3_SD7_SURVIVOR_SCOPE,
  SPLITS,
  type Split,
} from './contracts.js';
import type { A3DocumentSha256, A3Sample, A3SelectionIndex } from './types.js';
import type { NearDuplicateGraphMeasurement } from '../sd7/nearDuplicatePairs.js';

// ---------------------------------------------------------------------------
// The owner binding this module implements.
// ---------------------------------------------------------------------------

/** The K3 facts this module implements, carried by reference to `contracts.ts`. */
export const A3_SD7_SURVIVOR_ADAPTER_K3_BINDING = Object.freeze({
  decisionToken: K3_OWNER_DECISION.decisionToken,
  decisionRecordPath: K3_OWNER_DECISION.decisionRecordPath,
  decisionRecordSha256: K3_OWNER_DECISION.decisionRecordSha256,
  survivorProcedure: K3_SD7_SURVIVOR_PROCEDURE,
  survivorScope: K3_SD7_SURVIVOR_SCOPE,
  graphScope: K3_SD7_GRAPH_SCOPE,
  atMostOneScope: K3_SD7_AT_MOST_ONE_SCOPE,
});

/**
 * The residual issue K3 left open, spelled as the K3 owner record spells it.
 * Its handling policy is now owner-resolved (propagate the ambiguity); the
 * per-document semantic status it names is not.
 */
export const SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED = 'SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP';

// ---------------------------------------------------------------------------
// Input: ONE sample's caller-supplied frozen total order.
// ---------------------------------------------------------------------------

/**
 * One document's position in ONE sample's frozen total order for ONE
 * selection slot. It carries no score, digest, class, gold, URL or text: the
 * walk needs identity and position only. A R2 `A3RankedDocument` satisfies it
 * structurally, and anything beyond these fields is never copied onward.
 */
export interface A3Sd7SampleOrderEntry {
  readonly sample: A3Sample;
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly documentSha256: A3DocumentSha256;
  /** 0-based; the entry at array index i must carry exactly i. */
  readonly rankPosition: number;
}

export interface A3Sd7SampleSurvivorInput {
  readonly sample: A3Sample;
  /** The ONE canonical R6 graph of this organisation. */
  readonly graph: NearDuplicateGraphMeasurement;
  /** Every graph document exactly once, in this sample's frozen order. */
  readonly order: readonly A3Sd7SampleOrderEntry[];
}

// ---------------------------------------------------------------------------
// Output.
// ---------------------------------------------------------------------------

/** A MEASURABLE document kept by the greedy walk, at both of its positions. */
export interface A3Sd7MeasurableSurvivor {
  readonly sample: A3Sample;
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly documentSha256: A3DocumentSha256;
  /** Its position in the caller's full sample order (short-text documents included). */
  readonly sourceRankPosition: number;
  /** Its 0-based position among this sample's measurable survivors. */
  readonly survivorRankPosition: number;
}

/**
 * A MEASURABLE document the walk excluded, as a mechanical audit trace.
 * `blockingSurvivorRankPosition` names the earliest already-kept neighbour; when
 * several kept neighbours exist that choice is an EXPLANATION only, never part
 * of the survivor semantics.
 */
export interface A3Sd7MeasurableExclusion {
  readonly sample: A3Sample;
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly documentSha256: A3DocumentSha256;
  readonly sourceRankPosition: number;
  readonly blockingSurvivorRankPosition: number;
}

/**
 * An SD7_SHORT_TEXT_UNRESOLVED document's position in this sample's order.
 *
 * NOT A MEMBERSHIP DECISION. It is neither a survivor nor an exclusion, and
 * this shape deliberately has no field that could say either: whether it
 * belongs to the sample is `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP`. The owner
 * policy propagates that ambiguity rather than answering it, so membership is
 * materialised only where it is invariant across every admissible treatment.
 */
export interface A3Sd7ShortTextUnresolvedPosition {
  readonly sample: A3Sample;
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly documentSha256: A3DocumentSha256;
  readonly sourceRankPosition: number;
  /** 0-based position among this sample's unresolved short-text documents. */
  readonly unresolvedOrdinal: number;
  readonly openIssue: typeof SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED;
}

/**
 * One sample's survivor-aware preparation over one organisation's graph.
 * NOT a final SET_P or SET_R sample: no cap is applied, no SD9 is evaluated,
 * and the short-text documents are unresolved rather than placed.
 */
export interface A3Sd7SampleSurvivorPreparation {
  readonly kind: 'A3_SD7_SAMPLE_SURVIVOR_PREPARATION_NOT_A_FINAL_SAMPLE';
  readonly sample: A3Sample;
  readonly survivorProcedure: typeof K3_SD7_SURVIVOR_PROCEDURE;
  readonly survivorScope: typeof K3_SD7_SURVIVOR_SCOPE;
  readonly measurableSurvivors: readonly A3Sd7MeasurableSurvivor[];
  readonly measurableExclusions: readonly A3Sd7MeasurableExclusion[];
  readonly shortTextUnresolvedInSampleOrder: readonly A3Sd7ShortTextUnresolvedPosition[];
  readonly counts: {
    readonly sampleOrderLength: number;
    readonly measurableDocumentCount: number;
    readonly measurableSurvivorCount: number;
    readonly measurableExclusionCount: number;
    readonly shortTextUnresolvedCount: number;
  };
}

// ---------------------------------------------------------------------------
// Refusals.
// ---------------------------------------------------------------------------

export type A3Sd7SurvivorRefusalCode =
  | 'MALFORMED_SAMPLE'
  | 'MALFORMED_ORDER'
  | 'MALFORMED_ORDER_ENTRY'
  | 'ORDER_POSITION_MISMATCH'
  | 'MIXED_SAMPLE'
  | 'MIXED_SLOT_OR_SPLIT'
  | 'DUPLICATE_ORDER_DOCUMENT'
  | 'ORDER_GRAPH_COVERAGE_MISMATCH'
  | 'MALFORMED_GRAPH'
  | 'MALFORMED_GRAPH_DOCUMENT'
  | 'DUPLICATE_GRAPH_DOCUMENT'
  | 'MALFORMED_MEASURABLE_INDEX'
  | 'MEASURABLE_INDEX_MISMATCH'
  | 'SHORT_TEXT_COUNT_MISMATCH'
  | 'MALFORMED_EDGE'
  | 'DUPLICATE_EDGE';

/** A fail-closed refusal. The message starts with `STOP:` and names no identity. */
export class A3Sd7SurvivorRefusal extends Error {
  readonly code: A3Sd7SurvivorRefusalCode;
  constructor(code: A3Sd7SurvivorRefusalCode, message: string) {
    super(`STOP: ${code}: ${message}`);
    this.name = 'A3Sd7SurvivorRefusal';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// The walk.
// ---------------------------------------------------------------------------

/**
 * Walk ONE sample's frozen total order over ONE organisation's canonical
 * graph, greedily, and return the survivor-aware preparation.
 *
 * Refuses, before walking, any structurally impossible graph and any order
 * that does not cover `graph.documents` exactly once at positions 0..n-1 for
 * one sample, one slot and one split.
 */
export function prepareSd7SampleSurvivors(
  input: A3Sd7SampleSurvivorInput,
): A3Sd7SampleSurvivorPreparation {
  const { sample, graph, order } = input;
  if (sample !== 'SET_P' && sample !== 'SET_R') {
    throw new A3Sd7SurvivorRefusal('MALFORMED_SAMPLE', 'sample must be SET_P or SET_R.');
  }

  const graphIndexByDocument = validateGraphDocuments(graph);
  const adjacency = validateGraphRelation(graph);
  validateOrder(sample, order, graphIndexByDocument);

  const survivorPositionByGraphIndex = new Map<number, number>();
  const measurableSurvivors: A3Sd7MeasurableSurvivor[] = [];
  const measurableExclusions: A3Sd7MeasurableExclusion[] = [];
  const shortTextUnresolvedInSampleOrder: A3Sd7ShortTextUnresolvedPosition[] = [];

  order.forEach((entry, sourceRankPosition) => {
    const graphIndex = graphIndexByDocument.get(entry.documentSha256)!;
    const identity = {
      sample,
      selectionIndex: entry.selectionIndex,
      split: entry.split,
      documentSha256: entry.documentSha256,
      sourceRankPosition,
    };

    if (graph.documents[graphIndex]!.measurable !== true) {
      shortTextUnresolvedInSampleOrder.push(
        Object.freeze({
          ...identity,
          unresolvedOrdinal: shortTextUnresolvedInSampleOrder.length,
          openIssue: SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
        }),
      );
      return;
    }

    let blockingSurvivorRankPosition: number | undefined;
    for (const neighbour of adjacency.get(graphIndex)!) {
      const kept = survivorPositionByGraphIndex.get(neighbour);
      if (
        kept !== undefined &&
        (blockingSurvivorRankPosition === undefined || kept < blockingSurvivorRankPosition)
      ) {
        blockingSurvivorRankPosition = kept;
      }
    }

    if (blockingSurvivorRankPosition === undefined) {
      const survivorRankPosition = measurableSurvivors.length;
      survivorPositionByGraphIndex.set(graphIndex, survivorRankPosition);
      measurableSurvivors.push(Object.freeze({ ...identity, survivorRankPosition }));
    } else {
      measurableExclusions.push(Object.freeze({ ...identity, blockingSurvivorRankPosition }));
    }
  });

  return Object.freeze({
    kind: 'A3_SD7_SAMPLE_SURVIVOR_PREPARATION_NOT_A_FINAL_SAMPLE' as const,
    sample,
    survivorProcedure: K3_SD7_SURVIVOR_PROCEDURE,
    survivorScope: K3_SD7_SURVIVOR_SCOPE,
    measurableSurvivors: Object.freeze(measurableSurvivors),
    measurableExclusions: Object.freeze(measurableExclusions),
    shortTextUnresolvedInSampleOrder: Object.freeze(shortTextUnresolvedInSampleOrder),
    counts: Object.freeze({
      sampleOrderLength: order.length,
      measurableDocumentCount: measurableSurvivors.length + measurableExclusions.length,
      measurableSurvivorCount: measurableSurvivors.length,
      measurableExclusionCount: measurableExclusions.length,
      shortTextUnresolvedCount: shortTextUnresolvedInSampleOrder.length,
    }),
  });
}

// ---------------------------------------------------------------------------
// Structural validation. Never semantic: no edge is recomputed or questioned.
// ---------------------------------------------------------------------------

function isIndexInRange(value: unknown, length: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < length;
}

/** Unique, well-formed documents; returns identity -> graph index. */
function validateGraphDocuments(graph: NearDuplicateGraphMeasurement): Map<string, number> {
  if (
    typeof graph !== 'object' ||
    graph === null ||
    !Array.isArray(graph.documents) ||
    !Array.isArray(graph.measurableIndices) ||
    !Array.isArray(graph.edges)
  ) {
    throw new A3Sd7SurvivorRefusal(
      'MALFORMED_GRAPH',
      'the graph must carry documents, measurableIndices and edges arrays.',
    );
  }

  const indexByDocument = new Map<string, number>();
  graph.documents.forEach((document, index) => {
    if (
      typeof document !== 'object' ||
      document === null ||
      typeof document.documentSha256 !== 'string' ||
      typeof document.measurable !== 'boolean'
    ) {
      throw new A3Sd7SurvivorRefusal(
        'MALFORMED_GRAPH_DOCUMENT',
        `graph document ${index} lacks a string identity or a boolean measurable flag.`,
      );
    }
    const earlier = indexByDocument.get(document.documentSha256);
    if (earlier !== undefined) {
      throw new A3Sd7SurvivorRefusal(
        'DUPLICATE_GRAPH_DOCUMENT',
        `graph documents ${earlier} and ${index} carry the same identity.`,
      );
    }
    indexByDocument.set(document.documentSha256, index);
  });
  return indexByDocument;
}

/** Measurable indices, short-text count and edges; returns graph index -> neighbours. */
function validateGraphRelation(
  graph: NearDuplicateGraphMeasurement,
): Map<number, readonly number[]> {
  const size = graph.documents.length;

  const listed = new Set<number>();
  graph.measurableIndices.forEach((index, position) => {
    if (!isIndexInRange(index, size)) {
      throw new A3Sd7SurvivorRefusal(
        'MALFORMED_MEASURABLE_INDEX',
        `measurableIndices position ${position} is not an in-range safe integer.`,
      );
    }
    if (listed.has(index)) {
      throw new A3Sd7SurvivorRefusal(
        'MALFORMED_MEASURABLE_INDEX',
        `measurableIndices position ${position} repeats graph index ${index}.`,
      );
    }
    if (graph.documents[index]!.measurable !== true) {
      throw new A3Sd7SurvivorRefusal(
        'MEASURABLE_INDEX_MISMATCH',
        `measurableIndices position ${position} names graph document ${index}, which is not measurable.`,
      );
    }
    listed.add(index);
  });

  let unlisted = 0;
  graph.documents.forEach((document, index) => {
    if (listed.has(index)) return;
    if (document.measurable !== false) {
      throw new A3Sd7SurvivorRefusal(
        'MEASURABLE_INDEX_MISMATCH',
        `graph document ${index} is measurable but absent from measurableIndices.`,
      );
    }
    unlisted += 1;
  });
  if (graph.shortTextUnresolvedCount !== unlisted) {
    throw new A3Sd7SurvivorRefusal(
      'SHORT_TEXT_COUNT_MISMATCH',
      `shortTextUnresolvedCount does not equal the ${unlisted} graph documents outside measurableIndices.`,
    );
  }

  const neighbours = new Map<number, number[]>();
  for (const index of listed) neighbours.set(index, []);
  const seenEdges = new Set<string>();
  graph.edges.forEach((edge, position) => {
    if (
      typeof edge !== 'object' ||
      edge === null ||
      !isIndexInRange(edge.aIndex, size) ||
      !isIndexInRange(edge.bIndex, size) ||
      edge.aIndex >= edge.bIndex
    ) {
      throw new A3Sd7SurvivorRefusal(
        'MALFORMED_EDGE',
        `edge ${position} is not a pair of in-range safe integers with aIndex < bIndex.`,
      );
    }
    if (!listed.has(edge.aIndex) || !listed.has(edge.bIndex)) {
      throw new A3Sd7SurvivorRefusal(
        'MALFORMED_EDGE',
        `edge ${position} touches a graph document that is not measurable.`,
      );
    }
    const key = `${edge.aIndex}:${edge.bIndex}`;
    if (seenEdges.has(key)) {
      throw new A3Sd7SurvivorRefusal('DUPLICATE_EDGE', `edge ${position} repeats an earlier edge.`);
    }
    seenEdges.add(key);
    neighbours.get(edge.aIndex)!.push(edge.bIndex);
    neighbours.get(edge.bIndex)!.push(edge.aIndex);
  });
  return neighbours;
}

/** One sample, one slot, one split, positions 0..n-1, a bijection onto the graph documents. */
function validateOrder(
  sample: A3Sample,
  order: readonly A3Sd7SampleOrderEntry[],
  graphIndexByDocument: ReadonlyMap<string, number>,
): void {
  if (!Array.isArray(order)) {
    throw new A3Sd7SurvivorRefusal('MALFORMED_ORDER', 'the sample order must be an array.');
  }

  const first = order[0];
  const seen = new Map<string, number>();
  order.forEach((entry, position) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof entry.documentSha256 !== 'string' ||
      typeof entry.selectionIndex !== 'number' ||
      !Number.isSafeInteger(entry.selectionIndex) ||
      entry.selectionIndex < 0 ||
      !SPLITS.includes(entry.split)
    ) {
      throw new A3Sd7SurvivorRefusal(
        'MALFORMED_ORDER_ENTRY',
        `order position ${position} lacks a string identity, a slot index or a known split.`,
      );
    }
    if (entry.rankPosition !== position) {
      throw new A3Sd7SurvivorRefusal(
        'ORDER_POSITION_MISMATCH',
        `order position ${position} does not carry rankPosition ${position}.`,
      );
    }
    if (entry.sample !== sample) {
      throw new A3Sd7SurvivorRefusal(
        'MIXED_SAMPLE',
        `order position ${position} is not a ${sample} entry; one call walks one sample.`,
      );
    }
    if (entry.selectionIndex !== first!.selectionIndex || entry.split !== first!.split) {
      throw new A3Sd7SurvivorRefusal(
        'MIXED_SLOT_OR_SPLIT',
        `order position ${position} belongs to a different slot or split than position 0.`,
      );
    }
    const earlier = seen.get(entry.documentSha256);
    if (earlier !== undefined) {
      throw new A3Sd7SurvivorRefusal(
        'DUPLICATE_ORDER_DOCUMENT',
        `order positions ${earlier} and ${position} carry the same identity.`,
      );
    }
    seen.set(entry.documentSha256, position);
    if (!graphIndexByDocument.has(entry.documentSha256)) {
      throw new A3Sd7SurvivorRefusal(
        'ORDER_GRAPH_COVERAGE_MISMATCH',
        `order position ${position} names a document the graph does not hold.`,
      );
    }
  });

  if (order.length !== graphIndexByDocument.size) {
    throw new A3Sd7SurvivorRefusal(
      'ORDER_GRAPH_COVERAGE_MISMATCH',
      `the order covers ${order.length} of the graph's ${graphIndexByDocument.size} documents; every graph document must appear exactly once.`,
    );
  }
}

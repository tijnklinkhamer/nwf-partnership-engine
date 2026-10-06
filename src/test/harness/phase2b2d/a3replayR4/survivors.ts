/**
 * PHASE 2B-2D — A3 R47: THE K3 GREEDY SURVIVOR WALK AND THE SET_P / SET_R
 * COMPOSITIONS OVER THE TRUTHFUL R4 RELATION.
 *
 * WHY A VERSIONED COMPOSITION AND NOT R7 / R8 / R12
 *
 *   R7's `prepareSd7SampleSurvivors` consumes an R3 `NearDuplicateGraphMeasurement`
 *   whose type ENCODES "short text = unresolved": a short document is never
 *   walked, it is partitioned into an unresolved sequence. Under R4 every
 *   document is relation-resolved, so feeding R7 an R4 graph would require
 *   casting a truthful relation into a type that says otherwise. R47 does not
 *   cast. It composes the SAME K3 procedure over the R4 graph instead.
 *
 * K3 IS UNCHANGED (approved proposal N7)
 *
 *   `GREEDY_SAMPLE_RANK_SURVIVOR_WALK`: walk the sample's frozen total order
 *   earliest -> latest; keep a document iff it has no edge to a document
 *   ALREADY KEPT for that sample; an excluded document records the earliest
 *   already-kept neighbour as an audit witness. No other survivor rule. The
 *   test suite proves exact equality with R7 on every input where R3 is
 *   defined (all documents >= 5 tokens).
 *
 * THE RANKS ARE UNCHANGED
 *
 *   SET_P: canonical `rankSetPFull(pool)` - the frozen salted rank.
 *   SET_R: canonical `rankSetRFull(rankInputs)` - the frozen R10 score order.
 *   Neither is reimplemented: no new hash, no new sort.
 *
 * THE CAPS ARE EXACT
 *
 *   With no unresolved document there is nothing whose treatment could move a
 *   cap, so each cap is the first `min(cap, survivorCount)` survivors in that
 *   sample's survivor order: 8 for SET_P, 4 for SET_R. There is no BLOCKED
 *   status in this composition.
 *
 * No refusal message carries a document digest: a failure names a POSITION.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read, no hashing of its own. It mutates no input.
 */
import {
  K3_SD7_SURVIVOR_PROCEDURE,
  K3_SD7_SURVIVOR_SCOPE,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
  SPLITS,
  type Split,
} from '../a3prep/contracts.js';
import type { A3Sd7SampleOrderEntry } from '../a3prep/sd7.js';
import { rankSetPFull, type A3SetPRankedDocument } from '../a3prep/setP.js';
import { rankSetRFull, type A3SetRRankedDocument, type A3SetRRankInput } from '../a3prep/setR.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3Sample,
  A3SelectionIndex,
} from '../a3prep/types.js';
import type { A3DocumentSourceEntry } from '../a3documents/types.js';
import { requireR4GraphStructure } from '../sd7R4/measure.js';
import {
  SD7_R4_METHODOLOGY_VERSION,
  type R4NearDuplicateGraphMeasurement,
} from '../sd7R4/types.js';
import { refuseR47 } from './refusal.js';

// ---------------------------------------------------------------------------
// A. THE K3 WALK OVER AN R4 GRAPH.
// ---------------------------------------------------------------------------

export interface R4SampleSurvivor {
  readonly sample: A3Sample;
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly documentSha256: A3DocumentSha256;
  readonly sourceRankPosition: number;
  readonly survivorRankPosition: number;
}

export interface R4SampleExclusion {
  readonly sample: A3Sample;
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly documentSha256: A3DocumentSha256;
  readonly sourceRankPosition: number;
  /** The earliest already-kept neighbour. An EXPLANATION only, never semantics. */
  readonly blockingSurvivorRankPosition: number;
}

export interface R4SampleSurvivorPreparation {
  readonly kind: 'A3_R4_SAMPLE_SURVIVOR_PREPARATION_NOT_A_FINAL_SAMPLE';
  readonly methodologyVersion: typeof SD7_R4_METHODOLOGY_VERSION;
  readonly sample: A3Sample;
  readonly survivorProcedure: typeof K3_SD7_SURVIVOR_PROCEDURE;
  readonly survivorScope: typeof K3_SD7_SURVIVOR_SCOPE;
  readonly survivors: readonly R4SampleSurvivor[];
  readonly exclusions: readonly R4SampleExclusion[];
  readonly counts: {
    readonly sampleOrderLength: number;
    readonly survivorCount: number;
    readonly exclusionCount: number;
    readonly unresolvedCount: 0;
  };
}

function walkInputError(message: string): never {
  refuseR47('R47_R4_SAMPLE_INPUT_INVALID', message);
}

function requireOrder(
  sample: A3Sample,
  order: readonly A3Sd7SampleOrderEntry[],
  graph: R4NearDuplicateGraphMeasurement,
): Map<string, number> {
  if (!Array.isArray(order)) walkInputError('the sample order must be an array');
  const graphIndex = new Map<string, number>();
  graph.documents.forEach((document, index) => graphIndex.set(document.documentSha256, index));
  const seen = new Set<string>();
  const first = order[0];
  order.forEach((entry, position) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof entry.documentSha256 !== 'string' ||
      !Number.isSafeInteger(entry.selectionIndex) ||
      !SPLITS.includes(entry.split) ||
      entry.rankPosition !== position ||
      entry.sample !== sample ||
      entry.selectionIndex !== first!.selectionIndex ||
      entry.split !== first!.split
    ) {
      walkInputError(
        `order position ${position} is not a ${sample} entry of one slot at its position`,
      );
    }
    if (seen.has(entry.documentSha256) || !graphIndex.has(entry.documentSha256)) {
      walkInputError(`order position ${position} repeats a document or names one the graph lacks`);
    }
    seen.add(entry.documentSha256);
  });
  if (order.length !== graph.documents.length) {
    walkInputError('the order does not cover every graph document exactly once');
  }
  return graphIndex;
}

/**
 * K3 over ONE sample's frozen total order and ONE organisation's R4 graph.
 * Every graph document lands in exactly one of `survivors` / `exclusions`.
 */
export function prepareR4SampleSurvivors(input: {
  readonly sample: A3Sample;
  readonly graph: R4NearDuplicateGraphMeasurement;
  readonly order: readonly A3Sd7SampleOrderEntry[];
}): R4SampleSurvivorPreparation {
  const { sample, graph, order } = input;
  if (sample !== 'SET_P' && sample !== 'SET_R') walkInputError('sample must be SET_P or SET_R');
  requireR4GraphStructure(
    graph,
    graph.documents.map((document) => document.documentSha256),
  );
  const graphIndex = requireOrder(sample, order, graph);

  const neighbours = graph.documents.map((): number[] => []);
  for (const edge of graph.edges) {
    neighbours[edge.aIndex]!.push(edge.bIndex);
    neighbours[edge.bIndex]!.push(edge.aIndex);
  }

  const keptAt = new Map<number, number>();
  const survivors: R4SampleSurvivor[] = [];
  const exclusions: R4SampleExclusion[] = [];
  order.forEach((entry, sourceRankPosition) => {
    const index = graphIndex.get(entry.documentSha256)!;
    const identity = {
      sample,
      selectionIndex: entry.selectionIndex,
      split: entry.split,
      documentSha256: entry.documentSha256,
      sourceRankPosition,
    };
    let blocking: number | undefined;
    for (const neighbour of neighbours[index]!) {
      const kept = keptAt.get(neighbour);
      if (kept !== undefined && (blocking === undefined || kept < blocking)) blocking = kept;
    }
    if (blocking === undefined) {
      const survivorRankPosition = survivors.length;
      keptAt.set(index, survivorRankPosition);
      survivors.push(Object.freeze({ ...identity, survivorRankPosition }));
    } else {
      exclusions.push(Object.freeze({ ...identity, blockingSurvivorRankPosition: blocking }));
    }
  });

  return Object.freeze({
    kind: 'A3_R4_SAMPLE_SURVIVOR_PREPARATION_NOT_A_FINAL_SAMPLE' as const,
    methodologyVersion: SD7_R4_METHODOLOGY_VERSION,
    sample,
    survivorProcedure: K3_SD7_SURVIVOR_PROCEDURE,
    survivorScope: K3_SD7_SURVIVOR_SCOPE,
    survivors: Object.freeze(survivors),
    exclusions: Object.freeze(exclusions),
    counts: Object.freeze({
      sampleOrderLength: order.length,
      survivorCount: survivors.length,
      exclusionCount: exclusions.length,
      unresolvedCount: 0 as const,
    }),
  });
}

// ---------------------------------------------------------------------------
// B. THE SET_P AND SET_R COMPOSITIONS.
// ---------------------------------------------------------------------------

export interface R4SurvivorRankedDocument<S extends A3Sample> {
  readonly sample: S;
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly documentSha256: A3DocumentSha256;
  /** Copied from `preSd7FullRank[sourceRankPosition]`, never recomputed. */
  readonly saltedRankSha256: string;
  readonly sourceRankPosition: number;
  readonly survivorRankPosition: number;
}

export const R4_SET_P_DOCUMENT_CAP_EXACT = 'R4_SET_P_DOCUMENT_CAP_EXACT' as const;
export const R4_SET_R_DOCUMENT_CAP_EXACT = 'R4_SET_R_DOCUMENT_CAP_EXACT' as const;
export const R4_CAP_EXACT_REASON =
  'EVERY_DOCUMENT_RELATION_RESOLVED_UNDER_METHODOLOGY_V2_R4' as const;

export interface R4DocumentCapExact<S extends A3Sample> {
  readonly status: S extends 'SET_P'
    ? typeof R4_SET_P_DOCUMENT_CAP_EXACT
    : typeof R4_SET_R_DOCUMENT_CAP_EXACT;
  readonly reason: typeof R4_CAP_EXACT_REASON;
  readonly capSize: number;
  /** The first min(capSize, survivors) survivors, a prefix of the survivor order. */
  readonly documents: readonly R4SurvivorRankedDocument<S>[];
}

export interface R4SamplePreparation<S extends A3Sample> {
  readonly kind: S extends 'SET_P'
    ? 'A3_R4_SET_P_PREPARATION_NOT_REAL_CORPUS'
    : 'A3_R4_SET_R_PREPARATION_NOT_REAL_CORPUS';
  readonly methodologyVersion: typeof SD7_R4_METHODOLOGY_VERSION;
  /** The canonical pre-SD7 rank, exactly as `rankSetPFull` / `rankSetRFull` returned it. */
  readonly preSd7FullRank: readonly (S extends 'SET_P'
    ? A3SetPRankedDocument
    : A3SetRRankedDocument)[];
  readonly sd7Preparation: R4SampleSurvivorPreparation;
  /** EVERY survivor, uncapped, in survivor order. */
  readonly survivorAwareFullRank: readonly R4SurvivorRankedDocument<S>[];
  readonly documentCap: R4DocumentCapExact<S>;
}

export type R4SetPPreparation = R4SamplePreparation<'SET_P'>;
export type R4SetRPreparation = R4SamplePreparation<'SET_R'>;

function composeOver<S extends A3Sample>(
  sample: S,
  preSd7FullRank: readonly (A3SetPRankedDocument | A3SetRRankedDocument)[],
  graph: R4NearDuplicateGraphMeasurement,
  capSize: number,
): R4SamplePreparation<S> {
  const sd7Preparation = prepareR4SampleSurvivors({ sample, graph, order: preSd7FullRank });
  if (sd7Preparation.survivorProcedure !== 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK') {
    refuseR47('R47_R4_SAMPLE_POSTCONDITION_FAILED', 'the K3 procedure is not the greedy walk');
  }
  const survivorAwareFullRank = sd7Preparation.survivors.map((survivor, position) => {
    const ranked = preSd7FullRank[survivor.sourceRankPosition];
    if (
      survivor.survivorRankPosition !== position ||
      ranked === undefined ||
      ranked.rankPosition !== survivor.sourceRankPosition ||
      ranked.documentSha256 !== survivor.documentSha256 ||
      ranked.sample !== sample
    ) {
      refuseR47(
        'R47_R4_SAMPLE_POSTCONDITION_FAILED',
        `${sample} survivor ${position} does not join its pre-SD7 rank entry`,
      );
    }
    return Object.freeze({
      sample,
      selectionIndex: ranked.selectionIndex,
      split: ranked.split,
      documentSha256: ranked.documentSha256,
      saltedRankSha256: ranked.saltedRankSha256,
      sourceRankPosition: survivor.sourceRankPosition,
      survivorRankPosition: survivor.survivorRankPosition,
    });
  });
  const frozenRank = Object.freeze(survivorAwareFullRank);
  return Object.freeze({
    kind: (sample === 'SET_P'
      ? 'A3_R4_SET_P_PREPARATION_NOT_REAL_CORPUS'
      : 'A3_R4_SET_R_PREPARATION_NOT_REAL_CORPUS') as R4SamplePreparation<S>['kind'],
    methodologyVersion: SD7_R4_METHODOLOGY_VERSION,
    preSd7FullRank: preSd7FullRank as R4SamplePreparation<S>['preSd7FullRank'],
    sd7Preparation,
    survivorAwareFullRank: frozenRank,
    documentCap: Object.freeze({
      status: (sample === 'SET_P'
        ? R4_SET_P_DOCUMENT_CAP_EXACT
        : R4_SET_R_DOCUMENT_CAP_EXACT) as R4DocumentCapExact<S>['status'],
      reason: R4_CAP_EXACT_REASON,
      capSize,
      documents: Object.freeze(frozenRank.slice(0, capSize)),
    }),
  });
}

/** SET_P: canonical salted rank -> K3 over the R4 graph -> exact cap 8. */
export function prepareR4SetP(input: {
  readonly pool: readonly A3DistinctDocument[];
  readonly graph: R4NearDuplicateGraphMeasurement;
}): R4SetPPreparation {
  return composeOver(
    'SET_P',
    rankSetPFull(input.pool),
    input.graph,
    SET_P_MAX_PAGES_PER_ORGANISATION,
  );
}

/** SET_R: canonical R10 score rank -> K3 over the R4 graph -> exact cap 4. */
export function prepareR4SetR(input: {
  readonly rankInputs: readonly A3SetRRankInput[];
  readonly graph: R4NearDuplicateGraphMeasurement;
}): R4SetRPreparation {
  return composeOver(
    'SET_R',
    rankSetRFull(input.rankInputs),
    input.graph,
    SET_R_MAX_PAGES_PER_ORGANISATION,
  );
}

// ---------------------------------------------------------------------------
// C. ONE SLOT: BOTH SAMPLES, AND THEIR POSTCONDITIONS.
// ---------------------------------------------------------------------------

export interface UnboundR4SlotSamplePreparation {
  readonly kind: 'UNBOUND_A3_R4_SLOT_SAMPLE_PREPARATION';
  readonly selectionIndex: number;
  readonly split: Split;
  readonly setP: R4SetPPreparation;
  readonly setR: R4SetRPreparation;
}

function requirePostconditions(
  sample: A3Sample,
  graph: R4NearDuplicateGraphMeasurement,
  preparation: R4SamplePreparation<A3Sample>,
  capSize: number,
): void {
  const fail: (message: string) => never = (message) =>
    refuseR47('R47_R4_SAMPLE_POSTCONDITION_FAILED', `${sample}: ${message}`);
  const sd7 = preparation.sd7Preparation;
  const n = graph.documents.length;
  if (
    preparation.preSd7FullRank.length !== n ||
    sd7.counts.sampleOrderLength !== n ||
    sd7.counts.survivorCount + sd7.counts.exclusionCount !== n ||
    sd7.survivors.length !== sd7.counts.survivorCount ||
    sd7.exclusions.length !== sd7.counts.exclusionCount ||
    sd7.counts.unresolvedCount !== 0
  ) {
    fail('survivors + exclusions do not partition the documents');
  }
  const index = new Map<string, number>();
  graph.documents.forEach((d, i) => index.set(d.documentSha256, i));
  const placed = new Set<string>();
  for (const entry of [...sd7.survivors, ...sd7.exclusions]) {
    if (placed.has(entry.documentSha256) || !index.has(entry.documentSha256)) {
      fail('a document is placed twice or is not a graph document');
    }
    placed.add(entry.documentSha256);
  }
  if (placed.size !== n) fail('not every graph document is placed');
  const survivorIndices = new Set(sd7.survivors.map((s) => index.get(s.documentSha256)!));
  const edgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    if (survivorIndices.has(edge.aIndex) && survivorIndices.has(edge.bIndex)) {
      fail('an edge joins two survivors');
    }
    edgeKeys.add(`${String(edge.aIndex)}:${String(edge.bIndex)}`);
  }
  sd7.exclusions.forEach((exclusion, position) => {
    const blocker = sd7.survivors[exclusion.blockingSurvivorRankPosition];
    if (blocker === undefined || blocker.sourceRankPosition >= exclusion.sourceRankPosition) {
      fail(`exclusion ${position} has no earlier blocking survivor`);
    }
    const a = index.get(blocker.documentSha256)!;
    const b = index.get(exclusion.documentSha256)!;
    if (!edgeKeys.has(`${String(Math.min(a, b))}:${String(Math.max(a, b))}`)) {
      fail(`exclusion ${position} is not adjacent to its recorded blocker`);
    }
  });
  const cap = preparation.documentCap;
  if (
    cap.capSize !== capSize ||
    cap.documents.length !== Math.min(capSize, preparation.survivorAwareFullRank.length) ||
    cap.documents.some((document, i) => document !== preparation.survivorAwareFullRank[i])
  ) {
    fail('the exact cap is not the survivor prefix');
  }
}

/**
 * ONE slot's SET_P and SET_R preparations over ONE R4 graph. SET_P's pool and
 * SET_R's rank inputs are the SAME canonical document entries, unfiltered and
 * unsorted; both samples walk the SAME graph object.
 */
export function prepareUnboundR4SlotSamples(
  slot: {
    readonly selectionIndex: number;
    readonly split: Split;
    readonly documents: readonly A3DocumentSourceEntry[];
  },
  graph: R4NearDuplicateGraphMeasurement,
): UnboundR4SlotSamplePreparation {
  if (
    !Array.isArray(slot.documents) ||
    slot.documents.length === 0 ||
    slot.documents.length !== graph.documents.length ||
    slot.documents.some(
      (entry, i) => entry.document.documentSha256 !== graph.documents[i]!.documentSha256,
    )
  ) {
    refuseR47(
      'R47_R4_SAMPLE_INPUT_INVALID',
      "the graph does not cover exactly the slot's exact documents in order",
    );
  }
  const setP = prepareR4SetP({ pool: slot.documents.map((entry) => entry.document), graph });
  const setR = prepareR4SetR({
    rankInputs: slot.documents.map((entry) => ({
      document: entry.document,
      scorePreparation: entry.scorePreparation,
    })),
    graph,
  });
  requirePostconditions('SET_P', graph, setP, SET_P_MAX_PAGES_PER_ORGANISATION);
  requirePostconditions('SET_R', graph, setR, SET_R_MAX_PAGES_PER_ORGANISATION);
  return Object.freeze({
    kind: 'UNBOUND_A3_R4_SLOT_SAMPLE_PREPARATION' as const,
    selectionIndex: slot.selectionIndex,
    split: slot.split,
    setP,
    setR,
  });
}

export interface R4SampleDivergenceCounts {
  readonly documentCount: number;
  readonly survivingBothSamples: number;
  readonly survivingSetPOnly: number;
  readonly survivingSetROnly: number;
  readonly excludedInBothSamples: number;
}

/** Per-document survivor status across the two samples. Counts only. */
export function r4SampleDivergence(
  preparation: { readonly setP: R4SetPPreparation; readonly setR: R4SetRPreparation },
  graph: R4NearDuplicateGraphMeasurement,
): R4SampleDivergenceCounts {
  const p = new Set<string>(preparation.setP.sd7Preparation.survivors.map((s) => s.documentSha256));
  const r = new Set<string>(preparation.setR.sd7Preparation.survivors.map((s) => s.documentSha256));
  let both = 0;
  let pOnly = 0;
  let rOnly = 0;
  let neither = 0;
  for (const document of graph.documents) {
    const inP = p.has(document.documentSha256);
    const inR = r.has(document.documentSha256);
    if (inP && inR) both += 1;
    else if (inP) pOnly += 1;
    else if (inR) rOnly += 1;
    else neither += 1;
  }
  return Object.freeze({
    documentCount: graph.documents.length,
    survivingBothSamples: both,
    survivingSetPOnly: pOnly,
    survivingSetROnly: rOnly,
    excludedInBothSamples: neither,
  });
}

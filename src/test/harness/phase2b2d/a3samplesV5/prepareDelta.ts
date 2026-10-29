/**
 * PHASE 2B-2D — A3 R42: THE V5 DELTA PATH AROUND R23'S PURE SAMPLE PREPARATION.
 *
 * DO NOT IMPLEMENT A RANK, A SURVIVOR WALK OR A CAP AGAIN
 *
 *   R23's `prepareUnboundSlotSampleSurvivors` owns every sample semantic:
 *   the frozen SET_P salted rank, the frozen SET_R score-then-salted rank,
 *   the canonical K3 sample-specific greedy survivor walk for each, survivor
 *   / exclusion binding, the cap-8 and cap-4 determinations, SET_R freeze-slot
 *   readiness and every structural postcondition (population, partition,
 *   survivor independence, exclusion witness, cap and readiness shape). This
 *   file calls it - exactly once per request - and never ranks, salts,
 *   compares scores, walks survivors, picks a blocker or slices a cap.
 *
 * SAME SLOT, SAME GRAPH, BOTH SAMPLES
 *
 *   A request is one slot and one graph. R23 hands that slot's exact
 *   documents and that ONE graph object to both SET_P and SET_R; nothing here
 *   creates a second graph for either sample.
 *
 * THE BRIEF'S STOP CHECKS ARE POSTCONDITIONS, NOT DECISIONS
 *
 *   After R23 returns, facts are checked against the graph the preparation
 *   consumed. None of them selects anything:
 *
 *     - each sample's rank holds every exact slot document exactly once;
 *     - each sample's survivors, exclusions and unresolved short text are
 *       disjoint and together are exactly the graph's documents, the
 *       unresolved ones exactly the graph's short-text documents, each
 *       carrying the canonical open issue;
 *     - a graph with no unresolved short text cannot block either cap;
 *     - SET_R's initial-cap readiness agrees with SET_R's cap, and SET_R's
 *       full-rank readiness is exact exactly where the graph has no
 *       unresolved short text - the two readiness tokens are never collapsed;
 *     - R23's own `sampleSurvivorDivergence` partitions exactly the graph's
 *       measurable documents;
 *     - a graph with exactly one edge and no short text leaves each sample
 *       with exactly one exclusion, and the two samples' divergence is one of
 *       the two structurally possible shapes (same endpoint excluded, or
 *       opposite).
 *
 *   The last applies ONLY to single-edge, short-text-free graphs: a
 *   multi-edge or short-text graph's exclusions are whatever R23 returns, and
 *   nothing here expects a count from the number of edges.
 *
 * ALL OR NOTHING
 *
 *   Every request is prepared and validated before any result is returned. A
 *   refusal on the last request returns nothing for the earlier ones.
 *
 * THIS MODULE IS PURE. No socket, database, filesystem, clock, randomness or
 * environment read. It mutates no input. Its outputs are UNBOUND - not
 * authority - so synthetic slots exercise the delta path without minting.
 */
import {
  prepareUnboundSlotSampleSurvivors,
  sampleSurvivorDivergence,
} from '../a3samples/prepare.js';
import { refuseV5Sample } from './refusal.js';
import {
  R42_STATED_CANONICAL_SAMPLE_CONSTANTS as C,
  type DeltaSlotSamplePreparationRequestV5,
  type R42CanonicalGraph,
  type UnboundDeltaSamplePreparationV5,
  type UnboundDeltaSlotSamplePreparationV5,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRequestShape(
  request: unknown,
  position: number,
): DeltaSlotSamplePreparationRequestV5 {
  if (
    !isRecord(request) ||
    !isRecord(request['slot']) ||
    !isRecord(request['graph']) ||
    Object.keys(request).some((key) => key !== 'slot' && key !== 'graph')
  ) {
    refuseV5Sample(
      'R42_DELTA_REQUEST_SHAPE_INVALID',
      `delta request at position ${position} is not exactly one slot with one graph`,
    );
  }
  return request as unknown as DeltaSlotSamplePreparationRequestV5;
}

/**
 * The preparation R23 returned must be the slot it was asked about: same
 * selection slot, same split, and both samples ranked over exactly the
 * slot's document population, each exact document exactly once.
 */
function requirePreparationCoversSlot(
  request: DeltaSlotSamplePreparationRequestV5,
  unbound: UnboundDeltaSlotSamplePreparationV5,
  position: number,
): void {
  const { slot, graph } = request;
  const slotDigests = new Set<string>(
    slot.documents.map((entry) => entry.document.documentSha256 as string),
  );
  const rankCoversSlot = (rank: readonly { readonly documentSha256: string }[]): boolean => {
    const ranked = new Set(rank.map((entry) => entry.documentSha256));
    return (
      rank.length === slot.documents.length &&
      ranked.size === rank.length &&
      [...ranked].every((digest) => slotDigests.has(digest))
    );
  };
  if (
    unbound.selectionIndex !== slot.selectionIndex ||
    unbound.split !== slot.split ||
    unbound.setRFreezeSlotReadiness.selectionIndex !== slot.selectionIndex ||
    slotDigests.size !== slot.documents.length ||
    graph.documents.length !== slot.documents.length ||
    !rankCoversSlot(unbound.setP.preSd7FullRank) ||
    !rankCoversSlot(unbound.setR.preSd7FullRank)
  ) {
    refuseV5Sample(
      'R42_DELTA_PREPARATION_DOES_NOT_COVER_ITS_SLOT',
      `the preparation for delta request at position ${position} does not cover exactly its slot`,
    );
  }
}

/** True for the canonical exact-cap shape: R23 proves an exact cap carries `documents`. */
function capIsExact(cap: { readonly status: string }, exactStatus: string): boolean {
  return (
    cap.status === exactStatus && Array.isArray((cap as { readonly documents?: unknown }).documents)
  );
}

/**
 * §23 / §24 / §48. Both samples agree with the graph they consumed: counts,
 * and the survivor / exclusion / unresolved PARTITION of the graph's exact
 * documents - the unresolved ones exactly the graph's short-text documents.
 * Identities are compared in memory only and never leave this function.
 */
function requireAgreesWithGraph(
  unbound: UnboundDeltaSlotSamplePreparationV5,
  graph: R42CanonicalGraph,
  position: number,
): void {
  const m = graph.measurableIndices.length;
  const measurable = new Set(
    graph.measurableIndices.map((index) => graph.documents[index]?.documentSha256),
  );
  const shortText = new Set(
    graph.documents
      .filter((_, index) => !graph.measurableIndices.includes(index))
      .map((document) => document.documentSha256),
  );
  for (const sample of [unbound.setP, unbound.setR]) {
    const prep = sample.sd7Preparation;
    const counts = prep.counts;
    const survivors = prep.measurableSurvivors.map((s) => s.documentSha256 as string);
    const exclusions = prep.measurableExclusions.map((e) => e.documentSha256 as string);
    const unresolved = prep.shortTextUnresolvedInSampleOrder.map((u) => u.documentSha256 as string);
    const all = [...survivors, ...exclusions, ...unresolved];
    if (
      counts.measurableDocumentCount !== m ||
      counts.measurableSurvivorCount !== survivors.length ||
      counts.measurableExclusionCount !== exclusions.length ||
      survivors.length + exclusions.length !== m ||
      counts.shortTextUnresolvedCount !== graph.shortTextUnresolvedCount ||
      unresolved.length !== graph.shortTextUnresolvedCount ||
      prep.shortTextUnresolvedInSampleOrder.some(
        (u) => u.openIssue !== C.sd7ShortTextSampleMembershipOpenIssue,
      ) ||
      m + graph.shortTextUnresolvedCount !== sample.preSd7FullRank.length ||
      new Set(all).size !== graph.documents.length ||
      all.length !== graph.documents.length ||
      [...survivors, ...exclusions].some((digest) => !measurable.has(digest)) ||
      unresolved.some((digest) => !shortText.has(digest))
    ) {
      refuseV5Sample(
        'STOP_R42_SAMPLE_PREPARATION_DISAGREES_WITH_R41_GRAPH',
        `the preparation for delta request at position ${position} disagrees with its graph`,
      );
    }
  }
  if (
    graph.shortTextUnresolvedCount === 0 &&
    (!capIsExact(unbound.setP.documentCap, C.setPDocumentCapExact) ||
      !capIsExact(unbound.setRDocumentCap, C.setRDocumentCapExact))
  ) {
    refuseV5Sample(
      'STOP_R42_UNEXPECTED_DELTA_CAP_BLOCKED_WITH_NO_SHORT_TEXT',
      `a cap for delta request at position ${position} is blocked although the graph has no short text`,
    );
  }
}

/**
 * §21 / §22 / §24. SET_R's two readiness tokens, checked SEPARATELY against
 * what R23 returned: initial-cap readiness mirrors the SET_R cap; full-rank
 * readiness is exact exactly where this graph has no unresolved short text.
 * A full-rank block is never read as an initial-cap block, or vice versa.
 */
function requireSetRReadinessAgreesWithGraph(
  unbound: UnboundDeltaSlotSamplePreparationV5,
  graph: R42CanonicalGraph,
  position: number,
): void {
  const readiness = unbound.setRFreezeSlotReadiness;
  const capExact = capIsExact(unbound.setRDocumentCap, C.setRDocumentCapExact);
  const expectedInitial = capExact
    ? C.setRInitialCapExact
    : C.setRInitialCapBlockedShortTextMembership;
  const expectedFull =
    graph.shortTextUnresolvedCount === 0
      ? C.setRFullSampleRankMembershipExact
      : C.setRFullSampleRankMembershipBlockedShortText;
  if (
    readiness.initialCapReadiness !== expectedInitial ||
    readiness.fullRankReadiness !== expectedFull ||
    readiness.shortTextUnresolvedCount !== graph.shortTextUnresolvedCount ||
    (!capExact &&
      unbound.setRDocumentCap.status !== C.setRDocumentCapBlockedShortTextSampleMembership) ||
    (!capIsExact(unbound.setP.documentCap, C.setPDocumentCapExact) &&
      unbound.setP.documentCap.status !== C.setPDocumentCapBlockedShortTextSampleMembership)
  ) {
    refuseV5Sample(
      'STOP_R42_SET_R_READINESS_INCONSISTENT_WITH_R41_GRAPH',
      `the cap / readiness tokens for delta request at position ${position} disagree with its graph`,
    );
  }
}

/**
 * §17 / §26 / §27. R23's own divergence partitions exactly the graph's
 * measurable documents. On a graph with exactly one edge and no short text,
 * every valid greedy walk keeps all but one endpoint of that edge, so each
 * sample has exactly one exclusion and the samples either excluded the same
 * endpoint (m-1 / 0 / 0 / 1) or opposite endpoints (m-2 / 1 / 1 / 0). Any
 * other shape stops. Other graphs are not examined for a shape.
 */
function requireDivergenceStructure(
  unbound: UnboundDeltaSlotSamplePreparationV5,
  graph: R42CanonicalGraph,
  position: number,
): void {
  const m = graph.measurableIndices.length;
  const d = sampleSurvivorDivergence(unbound, graph);
  if (
    d.measurableDocumentCount !== m ||
    d.survivingBothSamples + d.survivingSetPOnly + d.survivingSetROnly + d.excludedInBothSamples !==
      m ||
    d.survivingBothSamples + d.survivingSetPOnly !==
      unbound.setP.sd7Preparation.counts.measurableSurvivorCount ||
    d.survivingBothSamples + d.survivingSetROnly !==
      unbound.setR.sd7Preparation.counts.measurableSurvivorCount
  ) {
    refuseV5Sample(
      'STOP_R42_SAMPLE_PREPARATION_DISAGREES_WITH_R41_GRAPH',
      `the divergence for delta request at position ${position} does not partition its graph`,
    );
  }
  if (graph.edges.length !== 1 || graph.shortTextUnresolvedCount !== 0) return;
  const p = unbound.setP.sd7Preparation.counts;
  const r = unbound.setR.sd7Preparation.counts;
  const sameEndpoint =
    d.survivingBothSamples === m - 1 &&
    d.survivingSetPOnly === 0 &&
    d.survivingSetROnly === 0 &&
    d.excludedInBothSamples === 1;
  const oppositeEndpoints =
    d.survivingBothSamples === m - 2 &&
    d.survivingSetPOnly === 1 &&
    d.survivingSetROnly === 1 &&
    d.excludedInBothSamples === 0;
  if (
    p.measurableSurvivorCount !== m - 1 ||
    p.measurableExclusionCount !== 1 ||
    r.measurableSurvivorCount !== m - 1 ||
    r.measurableExclusionCount !== 1 ||
    !(sameEndpoint || oppositeEndpoints)
  ) {
    refuseV5Sample(
      'STOP_R42_SAMPLE_DIVERGENCE_INCONSISTENT_WITH_SINGLE_EDGE_GRAPH',
      `the samples for delta request at position ${position} do not fit a single-edge graph`,
    );
  }
}

/**
 * Every request through R23's `prepareUnboundSlotSampleSurvivors` exactly
 * once, in order, and every result validated, before anything is returned.
 * Callers mint only from this result.
 */
export function prepareDeltaSlotSamplesAllOrNothingV5(
  requests: readonly DeltaSlotSamplePreparationRequestV5[],
): UnboundDeltaSamplePreparationV5 {
  const checked = requests.map((candidate, position) => requireRequestShape(candidate, position));
  const prepared: UnboundDeltaSlotSamplePreparationV5[] = [];
  let r23Calls = 0;
  checked.forEach((request) => {
    r23Calls += 1;
    prepared.push(prepareUnboundSlotSampleSurvivors(request.slot, request.graph));
  });
  checked.forEach((request, position) => {
    const unbound = prepared[position] as UnboundDeltaSlotSamplePreparationV5;
    requirePreparationCoversSlot(request, unbound, position);
    requireAgreesWithGraph(unbound, request.graph, position);
    requireSetRReadinessAgreesWithGraph(unbound, request.graph, position);
    requireDivergenceStructure(unbound, request.graph, position);
  });
  return Object.freeze({ preparations: Object.freeze(prepared), r23Calls });
}

/**
 * PHASE 2B-2D — A3 R36: THE V4 DELTA PATH AROUND R23'S PURE SAMPLE PREPARATION.
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
 *   After R23 returns, aggregate facts are checked against the graph the
 *   preparation consumed. None of them selects anything:
 *
 *     - each sample's rank covers the slot's exact population, and each
 *       sample's survivors + exclusions equal the graph's measurable count;
 *     - each sample's unresolved short-text count equals the graph's;
 *     - a graph with no unresolved short text cannot block either cap;
 *     - SET_R's initial-cap readiness agrees with SET_R's cap, and SET_R's
 *       full-rank readiness is exact exactly where the graph has no
 *       unresolved short text - the two readiness tokens are never collapsed;
 *     - a graph with exactly one edge and no short text leaves each sample
 *       with exactly one exclusion, and the two samples' divergence - taken
 *       only from R23's `sampleSurvivorDivergence` - is one of the two
 *       structurally possible shapes (same endpoint excluded, or opposite).
 *
 *   The last applies ONLY to single-edge, short-text-free graphs: a
 *   multi-edge or short-text graph's exclusions are whatever R23 returns, and
 *   nothing here expects a count from the number of edges.
 *
 * ALL OR NOTHING
 *
 *   Every request is prepared before any result is returned. A refusal on the
 *   last request returns nothing for the earlier ones.
 *
 * THIS MODULE IS PURE. No socket, database, filesystem, clock, randomness or
 * environment read. It mutates no input. Its outputs are UNBOUND - not
 * authority - so synthetic slots exercise the delta path without minting.
 */
import {
  prepareUnboundSlotSampleSurvivors,
  sampleSurvivorDivergence,
} from '../a3samples/prepare.js';
import { refuseV4Sample } from './refusal.js';
import {
  R36_STATED_CANONICAL_SAMPLE_CONSTANTS as C,
  type DeltaSlotSamplePreparationRequestV4,
  type R36CanonicalGraph,
  type UnboundDeltaSlotSamplePreparationV4,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRequestShape(
  request: unknown,
  position: number,
): DeltaSlotSamplePreparationRequestV4 {
  if (
    !isRecord(request) ||
    !isRecord(request['slot']) ||
    !isRecord(request['graph']) ||
    Object.keys(request).some((key) => key !== 'slot' && key !== 'graph')
  ) {
    refuseV4Sample(
      'R36_DELTA_REQUEST_SHAPE_INVALID',
      `delta request at position ${position} is not exactly one slot with one graph`,
    );
  }
  return request as unknown as DeltaSlotSamplePreparationRequestV4;
}

/**
 * The preparation R23 returned must be the slot it was asked about: same
 * selection slot, same split, and both samples ranked over exactly the
 * slot's document population. R23 already proves this structurally;
 * restating it keeps a delta preparation from ever being attributed to
 * another slot.
 */
function requirePreparationCoversSlot(
  request: DeltaSlotSamplePreparationRequestV4,
  unbound: UnboundDeltaSlotSamplePreparationV4,
  position: number,
): void {
  const { slot, graph } = request;
  if (
    unbound.selectionIndex !== slot.selectionIndex ||
    unbound.split !== slot.split ||
    unbound.setRFreezeSlotReadiness.selectionIndex !== slot.selectionIndex ||
    graph.documents.length !== slot.documents.length ||
    unbound.setP.preSd7FullRank.length !== slot.documents.length ||
    unbound.setR.preSd7FullRank.length !== slot.documents.length
  ) {
    refuseV4Sample(
      'R36_DELTA_PREPARATION_DOES_NOT_COVER_ITS_SLOT',
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

/** §13 / §14 / §17. Both samples agree with the graph they consumed on partition and short text. */
function requireAgreesWithGraph(
  unbound: UnboundDeltaSlotSamplePreparationV4,
  graph: R36CanonicalGraph,
  position: number,
): void {
  const m = graph.measurableIndices.length;
  for (const sample of [unbound.setP, unbound.setR]) {
    const counts = sample.sd7Preparation.counts;
    if (
      counts.measurableDocumentCount !== m ||
      counts.measurableSurvivorCount + counts.measurableExclusionCount !== m ||
      counts.shortTextUnresolvedCount !== graph.shortTextUnresolvedCount ||
      sample.sd7Preparation.shortTextUnresolvedInSampleOrder.length !==
        graph.shortTextUnresolvedCount ||
      sample.sd7Preparation.shortTextUnresolvedInSampleOrder.some(
        (unresolved) => unresolved.openIssue !== C.sd7ShortTextSampleMembershipOpenIssue,
      ) ||
      m + graph.shortTextUnresolvedCount !== sample.preSd7FullRank.length
    ) {
      refuseV4Sample(
        'STOP_R36_SAMPLE_PREPARATION_DISAGREES_WITH_R35_GRAPH',
        `the preparation for delta request at position ${position} disagrees with its graph`,
      );
    }
  }
  if (
    graph.shortTextUnresolvedCount === 0 &&
    (!capIsExact(unbound.setP.documentCap, C.setPDocumentCapExact) ||
      !capIsExact(unbound.setRDocumentCap, C.setRDocumentCapExact))
  ) {
    refuseV4Sample(
      'STOP_R36_UNEXPECTED_DELTA_CAP_BLOCKED_WITH_NO_SHORT_TEXT',
      `a cap for delta request at position ${position} is blocked although the graph has no short text`,
    );
  }
}

/**
 * §16 / §23. SET_R's two readiness tokens, checked SEPARATELY against what
 * R23 returned: initial-cap readiness mirrors the SET_R cap; full-rank
 * readiness is exact exactly where this graph has no unresolved short text.
 * A full-rank block is never read as an initial-cap block, or vice versa.
 */
function requireSetRReadinessAgreesWithGraph(
  unbound: UnboundDeltaSlotSamplePreparationV4,
  graph: R36CanonicalGraph,
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
    refuseV4Sample(
      'STOP_R36_SET_R_READINESS_INCONSISTENT_WITH_R35_GRAPH',
      `the cap / readiness tokens for delta request at position ${position} disagree with its graph`,
    );
  }
}

/**
 * §20 / §35. On a graph with exactly one edge and no short text, every
 * valid greedy walk keeps all but one endpoint of that edge, so each sample
 * has exactly one exclusion and the samples either excluded the same
 * endpoint (m-1 / 0 / 0 / 1) or opposite endpoints (m-2 / 1 / 1 / 0). Any
 * other shape stops. Other graphs are not examined here.
 */
function requireSingleEdgeStructure(
  unbound: UnboundDeltaSlotSamplePreparationV4,
  graph: R36CanonicalGraph,
  position: number,
): void {
  if (graph.edges.length !== 1 || graph.shortTextUnresolvedCount !== 0) return;
  const m = graph.measurableIndices.length;
  const p = unbound.setP.sd7Preparation.counts;
  const r = unbound.setR.sd7Preparation.counts;
  const d = sampleSurvivorDivergence(unbound, graph);
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
    d.measurableDocumentCount !== m ||
    !(sameEndpoint || oppositeEndpoints)
  ) {
    refuseV4Sample(
      'STOP_R36_SAMPLE_DIVERGENCE_INCONSISTENT_WITH_SINGLE_EDGE_GRAPH',
      `the samples for delta request at position ${position} do not fit a single-edge graph`,
    );
  }
}

/**
 * Every request through R23's `prepareUnboundSlotSampleSurvivors` exactly
 * once, in order, before anything is returned. Callers mint only from this
 * result.
 */
export function prepareDeltaSlotSamplesAllOrNothingV4(
  requests: readonly DeltaSlotSamplePreparationRequestV4[],
): readonly UnboundDeltaSlotSamplePreparationV4[] {
  const checked = requests.map((candidate, position) => requireRequestShape(candidate, position));
  const prepared: UnboundDeltaSlotSamplePreparationV4[] = [];
  checked.forEach((request, position) => {
    const unbound = prepareUnboundSlotSampleSurvivors(request.slot, request.graph);
    requirePreparationCoversSlot(request, unbound, position);
    requireAgreesWithGraph(unbound, request.graph, position);
    requireSetRReadinessAgreesWithGraph(unbound, request.graph, position);
    requireSingleEdgeStructure(unbound, request.graph, position);
    prepared.push(unbound);
  });
  return Object.freeze(prepared);
}

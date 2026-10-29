/**
 * PHASE 2B-2D — A3 R29: THE DELTA PATH AROUND R23'S PURE SAMPLE PREPARATION.
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
 *   After R23 returns, three aggregate facts are checked against the graph
 *   the preparation consumed. None of them selects anything:
 *
 *     - each sample's unresolved short-text count equals the graph's;
 *     - a graph with no unresolved short text cannot block either cap;
 *     - a graph with exactly one edge and no short text leaves each sample
 *       with exactly one exclusion, and the two samples' divergence - taken
 *       only from R23's `sampleSurvivorDivergence` - is one of the two
 *       structurally possible shapes (same endpoint excluded, or opposite).
 *
 *   The third applies ONLY to single-edge graphs: a multi-edge graph's
 *   exclusions are whatever R23 returns, and nothing here expects a count.
 *
 * ALL OR NOTHING
 *
 *   Every request is prepared before any result is returned. A refusal on the
 *   second request returns nothing for the first.
 *
 * THIS MODULE IS PURE. No socket, database, filesystem, clock, randomness or
 * environment read. It mutates no input. Its outputs are UNBOUND - not
 * authority - so synthetic slots exercise the delta path without minting.
 */
import {
  prepareUnboundSlotSampleSurvivors,
  sampleSurvivorDivergence,
} from '../a3samples/prepare.js';
import { refuseV2Sample } from './refusal.js';
import type {
  DeltaSlotSamplePreparationRequest,
  R29CanonicalGraph,
  UnboundDeltaSlotSamplePreparation,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRequestShape(
  request: unknown,
  position: number,
): DeltaSlotSamplePreparationRequest {
  if (!isRecord(request) || !isRecord(request['slot']) || !isRecord(request['graph'])) {
    refuseV2Sample(
      'R29_DELTA_REQUEST_SHAPE_INVALID',
      `delta request at position ${position} is not one slot with one graph`,
    );
  }
  return request as unknown as DeltaSlotSamplePreparationRequest;
}

/**
 * The preparation R23 returned must be the slot it was asked about: same
 * selection slot, same split, and both samples ranked over exactly the
 * graph's document population. R23 already proves this structurally;
 * restating it keeps a delta preparation from ever being attributed to
 * another slot.
 */
function requirePreparationCoversSlot(
  request: DeltaSlotSamplePreparationRequest,
  unbound: UnboundDeltaSlotSamplePreparation,
  position: number,
): void {
  const { slot, graph } = request;
  if (
    unbound.selectionIndex !== slot.selectionIndex ||
    unbound.split !== slot.split ||
    unbound.setRFreezeSlotReadiness.selectionIndex !== slot.selectionIndex ||
    unbound.setP.preSd7FullRank.length !== graph.documents.length ||
    unbound.setR.preSd7FullRank.length !== graph.documents.length ||
    graph.documents.length !== slot.documents.length
  ) {
    refuseV2Sample(
      'R29_DELTA_PREPARATION_DOES_NOT_COVER_ITS_SLOT',
      `the preparation for delta request at position ${position} does not cover exactly its slot`,
    );
  }
}

/** True for the canonical exact-cap shape: R23 proves an exact cap carries `documents`. */
function capIsExact(cap: object): boolean {
  return Array.isArray((cap as { readonly documents?: unknown }).documents);
}

/** §32 / §33. The two samples agree with the graph they consumed on short text and caps. */
function requireAgreesWithGraph(
  unbound: UnboundDeltaSlotSamplePreparation,
  graph: R29CanonicalGraph,
  position: number,
): void {
  const pCounts = unbound.setP.sd7Preparation.counts;
  const rCounts = unbound.setR.sd7Preparation.counts;
  if (
    pCounts.shortTextUnresolvedCount !== graph.shortTextUnresolvedCount ||
    rCounts.shortTextUnresolvedCount !== graph.shortTextUnresolvedCount ||
    unbound.setRFreezeSlotReadiness.shortTextUnresolvedCount !== graph.shortTextUnresolvedCount ||
    pCounts.measurableSurvivorCount + pCounts.measurableExclusionCount !==
      graph.measurableIndices.length ||
    rCounts.measurableSurvivorCount + rCounts.measurableExclusionCount !==
      graph.measurableIndices.length
  ) {
    refuseV2Sample(
      'STOP_R29_SAMPLE_PREPARATION_DISAGREES_WITH_R28_GRAPH',
      `the preparation for delta request at position ${position} disagrees with its graph`,
    );
  }
  if (
    graph.shortTextUnresolvedCount === 0 &&
    (!capIsExact(unbound.setP.documentCap) || !capIsExact(unbound.setRDocumentCap))
  ) {
    refuseV2Sample(
      'STOP_R29_UNEXPECTED_DELTA_CAP_BLOCKED_WITH_NO_SHORT_TEXT',
      `a cap for delta request at position ${position} is blocked although the graph has no short text`,
    );
  }
}

/**
 * §24 / §27 / §28. On a graph with exactly one edge and no short text, every
 * valid greedy walk keeps all but one endpoint of that edge, so each sample
 * has exactly one exclusion and the samples either excluded the same
 * endpoint (m-1 / 0 / 0 / 1) or opposite endpoints (m-2 / 1 / 1 / 0). Any
 * other shape stops. Other graphs are not examined here.
 */
function requireSingleEdgeStructure(
  unbound: UnboundDeltaSlotSamplePreparation,
  graph: R29CanonicalGraph,
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
    refuseV2Sample(
      'STOP_R29_SAMPLE_DIVERGENCE_INCONSISTENT_WITH_SINGLE_EDGE_GRAPH',
      `the samples for delta request at position ${position} do not fit a single-edge graph`,
    );
  }
}

/**
 * Every request through R23's `prepareUnboundSlotSampleSurvivors` exactly
 * once, in order, before anything is returned. Callers mint only from this
 * result.
 */
export function prepareDeltaSlotSamplesAllOrNothing(
  requests: readonly DeltaSlotSamplePreparationRequest[],
): readonly UnboundDeltaSlotSamplePreparation[] {
  const prepared: UnboundDeltaSlotSamplePreparation[] = [];
  requests.forEach((candidate, position) => {
    const request = requireRequestShape(candidate, position);
    const unbound = prepareUnboundSlotSampleSurvivors(request.slot, request.graph);
    requirePreparationCoversSlot(request, unbound, position);
    requireAgreesWithGraph(unbound, request.graph, position);
    requireSingleEdgeStructure(unbound, request.graph, position);
    prepared.push(unbound);
  });
  return Object.freeze(prepared);
}

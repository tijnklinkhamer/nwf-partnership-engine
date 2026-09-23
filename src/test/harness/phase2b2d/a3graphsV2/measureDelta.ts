/**
 * PHASE 2B-2D — A3 R28: THE DELTA PATH AROUND R22'S PURE GRAPH MEASUREMENT.
 *
 * DO NOT IMPLEMENT SD7 AGAIN
 *
 *   R22's `measureUnboundSlotSd7Graph` owns every graph semantic: the
 *   document -> canonical group adaptation, document order, the call to
 *   canonical `measureNearDuplicateGraph`, normalisation, 5-token shingles, the
 *   exact integer 9/10 predicate, the short-text partition, the compared-pair
 *   formula, edge validation and the graph freeze. This file calls it -
 *   exactly once per request - and never tokenises, shingles, compares,
 *   thresholds or normalises anything itself.
 *
 * ONE ORGANISATION PER CALL
 *
 *   A request is one slot and one lookup. There is no entry point that takes
 *   several organisations' documents, or historical graphs plus delta
 *   documents, so no pair can ever cross two organisations.
 *
 * ALL OR NOTHING
 *
 *   Every request is measured before any result is returned. A refusal on the
 *   second request returns nothing for the first: the minting layer receives
 *   either every unbound graph or an exception.
 *
 * THIS MODULE IS PURE. No socket, database, filesystem, clock, randomness or
 * environment read. It mutates no input. Its outputs are UNBOUND - not
 * authority - so synthetic slots exercise the delta path without minting.
 */
import { measureUnboundSlotSd7Graph } from '../a3graphs/measure.js';
import { refuseV2Graph } from './refusal.js';
import type { DeltaSlotGraphMeasurementRequest, UnboundDeltaSlotGraph } from './types.js';

function requireRequestShape(request: unknown, position: number): DeltaSlotGraphMeasurementRequest {
  const record =
    typeof request === 'object' && request !== null && !Array.isArray(request)
      ? (request as Record<string, unknown>)
      : undefined;
  if (
    record === undefined ||
    typeof record['slot'] !== 'object' ||
    record['slot'] === null ||
    typeof record['textLookup'] !== 'function'
  ) {
    refuseV2Graph(
      'R28_DELTA_REQUEST_SHAPE_INVALID',
      `delta request at position ${position} is not one slot with one text lookup`,
    );
  }
  return record as unknown as DeltaSlotGraphMeasurementRequest;
}

/**
 * The graph R22 returned must be the slot it was asked about: same selection
 * slot, same documents, same order. R22 already proves this structurally;
 * restating it here keeps a delta graph from ever being attributed to
 * another slot.
 */
function requireGraphCoversSlot(
  request: DeltaSlotGraphMeasurementRequest,
  unbound: UnboundDeltaSlotGraph,
  position: number,
): void {
  const { slot } = request;
  if (
    unbound.selectionIndex !== slot.selectionIndex ||
    unbound.split !== slot.split ||
    unbound.graph.documents.length !== slot.documents.length ||
    unbound.graph.documents.some(
      (document, index) =>
        document.documentSha256 !== slot.documents[index]?.document.documentSha256,
    )
  ) {
    refuseV2Graph(
      'R28_DELTA_GRAPH_DOES_NOT_COVER_ITS_SLOT',
      `the graph for delta request at position ${position} does not cover exactly its slot`,
    );
  }
}

/**
 * Every request through R22's `measureUnboundSlotSd7Graph` exactly once, in
 * order, before anything is returned. Callers mint only from this result.
 */
export function measureDeltaSlotGraphsAllOrNothing(
  requests: readonly DeltaSlotGraphMeasurementRequest[],
): readonly UnboundDeltaSlotGraph[] {
  const measured: UnboundDeltaSlotGraph[] = [];
  requests.forEach((candidate, position) => {
    const request = requireRequestShape(candidate, position);
    const unbound = measureUnboundSlotSd7Graph(request.slot, request.textLookup);
    requireGraphCoversSlot(request, unbound, position);
    measured.push(unbound);
  });
  return Object.freeze(measured);
}

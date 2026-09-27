/**
 * PHASE 2B-2D — A3 R35: THE V4 DELTA PATH AROUND R22'S PURE GRAPH MEASUREMENT.
 *
 * DO NOT IMPLEMENT SD7 AGAIN
 *
 *   R22's `measureUnboundSlotSd7Graph` owns every graph semantic: the
 *   document -> canonical group adaptation, document order, the call to
 *   canonical near-duplicate measurement, normalisation, 5-token shingles,
 *   the exact integer 9/10 predicate, the short-text partition, the
 *   compared-pair formula, edge validation and the graph freeze. This file
 *   calls it - exactly once per request - and never tokenises, shingles,
 *   compares, thresholds, trims or normalises anything itself, and never looks
 *   at a text: an empty or short text is R22's (and SD7's) to classify.
 *
 * STRUCTURE IS RE-PROVED, NEVER RE-DECIDED
 *
 *   After the call, the graph is handed to R22's own exported
 *   `requireCanonicalGraphStructure` against the SAME slot (coverage in order,
 *   measurable / short-text partition, per-slot m(m-1)/2, edge shape), and the
 *   graph's documents are cross-checked against the slot's R34 exact documents
 *   by digest and position. Nothing here decides that a non-edge "should" be
 *   an edge.
 *
 * ONE ORGANISATION PER CALL
 *
 *   A request is one slot and one lookup. There is no entry point that takes
 *   several organisations' documents, or historical graphs plus delta
 *   documents, so no pair can ever cross two organisations.
 *
 * ALL OR NOTHING
 *
 *   Every request's shape is checked before the first measurement, and every
 *   request is measured before any result is returned. A refusal on the last
 *   request returns nothing for the earlier ones: the minting layer receives
 *   either every unbound graph or an exception.
 *
 * THIS MODULE IS PURE. No socket, database, filesystem, clock, randomness or
 * environment read. It mutates no input. Its outputs are UNBOUND - not
 * authority - so synthetic slots exercise the delta path without minting.
 */
import { measureUnboundSlotSd7Graph, requireCanonicalGraphStructure } from '../a3graphs/measure.js';
import { refuseV4Graph } from './refusal.js';
import type { DeltaSlotGraphMeasurementRequestV4, UnboundDeltaSlotGraphV4 } from './types.js';

function requireRequestShape(
  request: unknown,
  position: number,
): DeltaSlotGraphMeasurementRequestV4 {
  const record =
    typeof request === 'object' && request !== null && !Array.isArray(request)
      ? (request as Record<string, unknown>)
      : undefined;
  if (
    record === undefined ||
    typeof record['slot'] !== 'object' ||
    record['slot'] === null ||
    Array.isArray(record['slot']) ||
    typeof record['textLookup'] !== 'function'
  ) {
    refuseV4Graph(
      'R35_DELTA_REQUEST_SHAPE_INVALID',
      `delta request at position ${position} is not one slot with one text lookup`,
    );
  }
  return record as unknown as DeltaSlotGraphMeasurementRequestV4;
}

/**
 * The graph R22 returned must be the slot it was asked about: same selection
 * slot, same split, every exact document exactly once, same digest, same
 * order. R22 already proves this structurally; restating it here keeps a
 * delta graph from ever being attributed to another slot.
 */
function requireGraphCoversSlot(
  request: DeltaSlotGraphMeasurementRequestV4,
  unbound: UnboundDeltaSlotGraphV4,
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
    refuseV4Graph(
      'R35_DELTA_GRAPH_DOES_NOT_COVER_ITS_SLOT',
      `the graph for delta request at position ${position} does not cover exactly its slot`,
    );
  }
}

/**
 * Every request through R22's `measureUnboundSlotSd7Graph` exactly once, in
 * order, before anything is returned. Callers mint only from this result.
 */
export function measureDeltaSlotGraphsAllOrNothingV4(
  requests: readonly unknown[],
): readonly UnboundDeltaSlotGraphV4[] {
  if (!Array.isArray(requests)) {
    refuseV4Graph('R35_DELTA_REQUEST_SHAPE_INVALID', 'the delta requests are not an array');
  }
  // Every shape first: a malformed last request reaches no R22 call at all.
  const checked = requests.map((candidate, position) => requireRequestShape(candidate, position));
  const measured: UnboundDeltaSlotGraphV4[] = [];
  checked.forEach((request, position) => {
    const unbound = measureUnboundSlotSd7Graph(request.slot, request.textLookup);
    requireCanonicalGraphStructure(request.slot, unbound.graph);
    requireGraphCoversSlot(request, unbound, position);
    measured.push(unbound);
  });
  return Object.freeze(measured);
}

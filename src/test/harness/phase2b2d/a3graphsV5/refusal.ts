/**
 * PHASE 2B-2D — A3 R41: THE V5 INCREMENTAL GRAPH MEASUREMENT'S FAIL-CLOSED REFUSAL.
 *
 * R41 adds no graph semantics of its own, so it adds no semantic refusal
 * either: a coverage, partition, pair-count or edge-structure refusal raised
 * by R22's pure measurement propagates UNCHANGED as R22's own
 * `A3GraphRefusal`, and an unknown-document refusal raised inside R40's text
 * capability propagates as R21's own. One disagreement has one name in every
 * slice. The codes here are about INPUT AUTHORITY, the fresh R40
 * reproduction, the committed R35 / R37 / R40 history and the brief's STOPs.
 *
 * Messages name a category, a field path or an array position. They never
 * name an organisation, a selection index, a run, a row id, a document
 * digest, an edge endpoint, a similarity, a URL, a score or text.
 */

export const A3_GRAPH_V5_REFUSAL_CODES = Object.freeze([
  // Input authority.
  'R41_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R40',
  'R41_R40_REPRODUCTION_NOT_PROVED_FOR_BATCH',
  'R41_R40_REPRODUCTION_ALREADY_PROVED',
  'R41_HISTORICAL_GRAPH_COVERAGE_NOT_PROVED_FOR_BATCH',
  'R41_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED',
  'R41_SPLIT_NOT_SUPPORTED',
  'R41_DOCUMENT_SOURCE_COVERAGE_NOT_ADDITIVE',
  'R41_DELTA_BATCH_COMPOSITION_INVALID',
  'R41_NOT_A_MINTED_DELTA_GRAPH_BATCH',
  'R41_UPSTREAM_POOL_NOT_CLOSED_BEFORE_R40',

  // The unbound delta measurement around R22's call.
  'R41_DELTA_REQUEST_SHAPE_INVALID',
  'R41_DELTA_GRAPH_DOES_NOT_COVER_ITS_SLOT',

  // The brief's stop markers.
  'STOP_R41_FRESH_R40_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
  'STOP_R41_HISTORICAL_R35_R37_GRAPH_BASELINE_DRIFT_REQUIRES_REVIEW',
] as const);

export type A3GraphV5RefusalCode = (typeof A3_GRAPH_V5_REFUSAL_CODES)[number];

export class A3GraphV5Refusal extends Error {
  constructor(
    readonly code: A3GraphV5RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3GraphV5Refusal';
  }
}

export function refuseV5Graph(code: A3GraphV5RefusalCode, message: string): never {
  throw new A3GraphV5Refusal(code, message);
}

/**
 * PHASE 2B-2D — A3 R35: THE V4 INCREMENTAL GRAPH MEASUREMENT'S FAIL-CLOSED REFUSAL.
 *
 * R35 adds no graph semantics of its own, so it adds no semantic refusal
 * either: a coverage, partition, pair-count or edge-structure refusal raised
 * by R22's pure measurement propagates UNCHANGED as R22's own
 * `A3GraphRefusal`, so one disagreement has one name in every slice. The
 * codes here are about INPUT AUTHORITY, the fresh R34 reproduction, the
 * committed R22 / R28 history and the brief's own STOP markers.
 *
 * Messages name a category, a field path or an array position. They never
 * name an organisation, a selection index, a run, a row id, a document
 * digest, an edge endpoint, a similarity, a URL, a score or text.
 */

export const A3_GRAPH_V4_REFUSAL_CODES = Object.freeze([
  // Input authority.
  'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
  'R35_R34_REPRODUCTION_NOT_PROVED_FOR_BATCH',
  'R35_R34_REPRODUCTION_ALREADY_PROVED',
  'R35_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED',
  'R35_SPLIT_NOT_SUPPORTED',
  'R35_DOCUMENT_SOURCE_COVERAGE_NOT_ADDITIVE',
  'R35_DELTA_BATCH_COMPOSITION_INVALID',
  'R35_NOT_A_MINTED_DELTA_GRAPH_BATCH',
  'R35_HISTORICAL_GRAPH_BASELINE_NOT_PROVED',

  // The unbound delta measurement around R22's call.
  'R35_DELTA_REQUEST_SHAPE_INVALID',
  'R35_DELTA_GRAPH_DOES_NOT_COVER_ITS_SLOT',

  // The brief's stop markers.
  'STOP_R35_FRESH_R34_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
  'STOP_R35_HISTORICAL_R22_R28_GRAPH_BASELINE_DRIFT_REQUIRES_REVIEW',
] as const);

export type A3GraphV4RefusalCode = (typeof A3_GRAPH_V4_REFUSAL_CODES)[number];

export class A3GraphV4Refusal extends Error {
  constructor(
    readonly code: A3GraphV4RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3GraphV4Refusal';
  }
}

export function refuseV4Graph(code: A3GraphV4RefusalCode, message: string): never {
  throw new A3GraphV4Refusal(code, message);
}

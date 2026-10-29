/**
 * PHASE 2B-2D — A3 R28: THE INCREMENTAL GRAPH MEASUREMENT'S FAIL-CLOSED REFUSAL.
 *
 * R28 adds no graph semantics of its own, so it adds no semantic refusal
 * either: a coverage, partition, pair-count or edge-structure refusal raised
 * by R22's pure measurement propagates UNCHANGED as R22's own
 * `A3GraphRefusal`, so one disagreement has one name in both slices. The
 * codes here are about INPUT AUTHORITY and the brief's own STOP markers.
 *
 * Messages name a category, a field path or an array position. They never
 * name an organisation, a selection index, a run, a row id, a document
 * digest, an edge endpoint, a similarity, a URL, a score or text.
 */

export const A3_GRAPH_V2_REFUSAL_CODES = Object.freeze([
  // Input authority.
  'R28_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R27',
  'R28_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED',
  'R28_SPLIT_NOT_SUPPORTED',
  'R28_DOCUMENT_SOURCE_COVERAGE_NOT_ADDITIVE',
  'R28_DELTA_BATCH_COMPOSITION_INVALID',
  'R28_NOT_A_MINTED_DELTA_GRAPH_BATCH',

  // The unbound delta measurement around R22's call.
  'R28_DELTA_REQUEST_SHAPE_INVALID',
  'R28_DELTA_GRAPH_DOES_NOT_COVER_ITS_SLOT',

  // The committed A2 adjudication input.
  'R28_A2_ADJUDICATION_INPUT_INVALID',

  // The brief's stop markers.
  'STOP_R28_CANONICAL_R27_DOCUMENT_DELTA_DRIFT_REQUIRES_REVIEW',
  'STOP_R28_HISTORICAL_R22_BASELINE_DRIFT_REQUIRES_REVIEW',
  'STOP_R28_CANONICAL_GRAPH_DISAGREES_WITH_COMMITTED_A2_SD7_AGGREGATE',
] as const);

export type A3GraphV2RefusalCode = (typeof A3_GRAPH_V2_REFUSAL_CODES)[number];

export class A3GraphV2Refusal extends Error {
  constructor(
    readonly code: A3GraphV2RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3GraphV2Refusal';
  }
}

export function refuseV2Graph(code: A3GraphV2RefusalCode, message: string): never {
  throw new A3GraphV2Refusal(code, message);
}

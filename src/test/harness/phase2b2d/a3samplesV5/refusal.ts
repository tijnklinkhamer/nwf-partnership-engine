/**
 * PHASE 2B-2D — A3 R42: THE V5 INCREMENTAL SAMPLE PREPARATION'S FAIL-CLOSED REFUSAL.
 *
 * R42 adds no rank, survivor-walk, cap or readiness semantics of its own, so
 * it adds no semantic refusal either: a population, partition, independence,
 * witness, cap or readiness refusal raised by R23's pure preparation
 * propagates UNCHANGED as R23's own `A3SampleRefusal`, so one disagreement has
 * one name in every slice. The codes here are about INPUT AUTHORITY, the
 * fresh R41 reproduction, the committed R36 / R37 / R41 history and the
 * brief's own STOP markers.
 *
 * A canonically BLOCKED cap is NOT a refusal here either - except where the
 * graph has no unresolved short text at all, which the canonical semantics
 * say cannot block a cap.
 *
 * Messages name a category, a field path or an array position. They never
 * name an organisation, a selection index, a run, a document digest, a rank
 * digest or position, an edge endpoint, a score, a URL or text.
 */

export const A3_SAMPLE_V5_REFUSAL_CODES = Object.freeze([
  // Input authority.
  'R42_SD7_GRAPH_DELTA_NOT_MINTED_BY_R41',
  'R42_R41_REPRODUCTION_NOT_PROVED_FOR_BATCH',
  'R42_R41_REPRODUCTION_ALREADY_PROVED',
  'R42_UPSTREAM_POOL_NOT_CLOSED_BEFORE_R40',
  'R42_HISTORICAL_SAMPLE_COVERAGE_NOT_PROVED_FOR_BATCH',
  'R42_SD7_GRAPH_DELTA_ALREADY_PREPARED',
  'R42_SPLIT_NOT_SUPPORTED',
  'R42_GRAPH_DELTA_COVERAGE_NOT_ADDITIVE',
  'R42_DELTA_BATCH_COMPOSITION_INVALID',
  'R42_NOT_A_MINTED_DELTA_SAMPLE_BATCH',

  // The unbound delta preparation around R23's call.
  'R42_DELTA_REQUEST_SHAPE_INVALID',
  'R42_DELTA_PREPARATION_DOES_NOT_COVER_ITS_SLOT',

  // The brief's stop markers.
  'STOP_R42_FRESH_R41_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
  'STOP_R42_HISTORICAL_R36_R37_SAMPLE_BASELINE_DRIFT_REQUIRES_REVIEW',
  'STOP_R42_SAMPLE_PREPARATION_DISAGREES_WITH_R41_GRAPH',
  'STOP_R42_UNEXPECTED_DELTA_CAP_BLOCKED_WITH_NO_SHORT_TEXT',
  'STOP_R42_SET_R_READINESS_INCONSISTENT_WITH_R41_GRAPH',
  'STOP_R42_SAMPLE_DIVERGENCE_INCONSISTENT_WITH_SINGLE_EDGE_GRAPH',
] as const);

export type A3SampleV5RefusalCode = (typeof A3_SAMPLE_V5_REFUSAL_CODES)[number];

export class A3SampleV5Refusal extends Error {
  constructor(
    readonly code: A3SampleV5RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3SampleV5Refusal';
  }
}

export function refuseV5Sample(code: A3SampleV5RefusalCode, message: string): never {
  throw new A3SampleV5Refusal(code, message);
}

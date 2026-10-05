/**
 * PHASE 2B-2D — A3 R36: THE V4 INCREMENTAL SAMPLE PREPARATION'S FAIL-CLOSED REFUSAL.
 *
 * R36 adds no rank, survivor-walk, cap or readiness semantics of its own, so
 * it adds no semantic refusal either: a population, partition, independence,
 * witness, cap or readiness refusal raised by R23's pure preparation
 * propagates UNCHANGED as R23's own `A3SampleRefusal`, so one disagreement has
 * one name in every slice. The codes here are about INPUT AUTHORITY, the
 * fresh R35 reproduction, the committed R23 / R29 history and the brief's own
 * STOP markers.
 *
 * A canonically BLOCKED cap is NOT a refusal here either - except where the
 * graph has no unresolved short text at all, which the canonical semantics
 * say cannot block a cap.
 *
 * Messages name a category, a field path or an array position. They never
 * name an organisation, a selection index, a run, a document digest, a rank
 * digest or position, an edge endpoint, a score, a URL or text.
 */

export const A3_SAMPLE_V4_REFUSAL_CODES = Object.freeze([
  // Input authority.
  'R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35',
  'R36_R35_REPRODUCTION_NOT_PROVED_FOR_BATCH',
  'R36_R35_REPRODUCTION_ALREADY_PROVED',
  'R36_SD7_GRAPH_DELTA_ALREADY_PREPARED',
  'R36_SPLIT_NOT_SUPPORTED',
  'R36_GRAPH_DELTA_COVERAGE_NOT_ADDITIVE',
  'R36_DELTA_BATCH_COMPOSITION_INVALID',
  'R36_NOT_A_MINTED_DELTA_SAMPLE_BATCH',
  'R36_HISTORICAL_SAMPLE_BASELINE_NOT_PROVED',

  // The unbound delta preparation around R23's call.
  'R36_DELTA_REQUEST_SHAPE_INVALID',
  'R36_DELTA_PREPARATION_DOES_NOT_COVER_ITS_SLOT',

  // The brief's stop markers.
  'STOP_R36_FRESH_R35_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
  'STOP_R36_HISTORICAL_R23_R29_SAMPLE_BASELINE_DRIFT_REQUIRES_REVIEW',
  'STOP_R36_SAMPLE_PREPARATION_DISAGREES_WITH_R35_GRAPH',
  'STOP_R36_UNEXPECTED_DELTA_CAP_BLOCKED_WITH_NO_SHORT_TEXT',
  'STOP_R36_SET_R_READINESS_INCONSISTENT_WITH_R35_GRAPH',
  'STOP_R36_SAMPLE_DIVERGENCE_INCONSISTENT_WITH_SINGLE_EDGE_GRAPH',
] as const);

export type A3SampleV4RefusalCode = (typeof A3_SAMPLE_V4_REFUSAL_CODES)[number];

export class A3SampleV4Refusal extends Error {
  constructor(
    readonly code: A3SampleV4RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3SampleV4Refusal';
  }
}

export function refuseV4Sample(code: A3SampleV4RefusalCode, message: string): never {
  throw new A3SampleV4Refusal(code, message);
}

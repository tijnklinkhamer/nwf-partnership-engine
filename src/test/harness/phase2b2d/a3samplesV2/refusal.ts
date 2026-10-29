/**
 * PHASE 2B-2D — A3 R29: THE INCREMENTAL SAMPLE PREPARATION'S FAIL-CLOSED REFUSAL.
 *
 * R29 adds no rank, survivor-walk, cap or readiness semantics of its own, so
 * it adds no semantic refusal either: a population, partition, independence,
 * witness, cap or readiness refusal raised by R23's pure preparation
 * propagates UNCHANGED as R23's own `A3SampleRefusal`, so one disagreement has
 * one name in both slices. The codes here are about INPUT AUTHORITY and the
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

export const A3_SAMPLE_V2_REFUSAL_CODES = Object.freeze([
  // Input authority.
  'R29_SD7_GRAPH_DELTA_NOT_MINTED_BY_R28',
  'R29_SD7_GRAPH_DELTA_ALREADY_PREPARED',
  'R29_SPLIT_NOT_SUPPORTED',
  'R29_GRAPH_DELTA_COVERAGE_NOT_ADDITIVE',
  'R29_DELTA_BATCH_COMPOSITION_INVALID',
  'R29_NOT_A_MINTED_DELTA_SAMPLE_BATCH',

  // The unbound delta preparation around R23's call.
  'R29_DELTA_REQUEST_SHAPE_INVALID',
  'R29_DELTA_PREPARATION_DOES_NOT_COVER_ITS_SLOT',

  // The committed R23 historical baseline.
  'R29_R23_HISTORICAL_BASELINE_INPUT_INVALID',

  // The brief's stop markers.
  'STOP_R29_CANONICAL_R28_GRAPH_DELTA_DRIFT_REQUIRES_REVIEW',
  'STOP_R29_SAMPLE_PREPARATION_DISAGREES_WITH_R28_GRAPH',
  'STOP_R29_UNEXPECTED_DELTA_CAP_BLOCKED_WITH_NO_SHORT_TEXT',
  'STOP_R29_SAMPLE_DIVERGENCE_INCONSISTENT_WITH_SINGLE_EDGE_GRAPH',
] as const);

export type A3SampleV2RefusalCode = (typeof A3_SAMPLE_V2_REFUSAL_CODES)[number];

export class A3SampleV2Refusal extends Error {
  constructor(
    readonly code: A3SampleV2RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3SampleV2Refusal';
  }
}

export function refuseV2Sample(code: A3SampleV2RefusalCode, message: string): never {
  throw new A3SampleV2Refusal(code, message);
}

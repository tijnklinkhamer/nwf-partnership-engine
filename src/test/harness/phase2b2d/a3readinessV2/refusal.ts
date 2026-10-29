/**
 * PHASE 2B-2D — A3 R30: THE INCREMENTAL READINESS'S FAIL-CLOSED REFUSAL.
 *
 * R30 adds no membership, readiness or SD9 semantics of its own, so it adds
 * no semantic refusal either: a shape, owner-policy, readiness, membership or
 * SD9-envelope refusal raised by R24's pure helper propagates UNCHANGED as
 * R24's own `A3ReadinessRefusal`, so one disagreement has one name in both
 * slices. The codes here are about INPUT AUTHORITY, by-reference
 * postconditions and the brief's own STOP markers.
 *
 * A canonically BLOCKED reachable membership is NOT a refusal, and neither is
 * an UNSUCCESSFUL or PENDING mechanical SD9 status: they are governed results.
 *
 * Messages name a category, a field path or an array position. They never
 * name an organisation, a selection index, a run, a document digest, a rank
 * position, a score, a URL or text.
 */

export const A3_READINESS_V2_REFUSAL_CODES = Object.freeze([
  // Input authority.
  'R30_SAMPLE_DELTA_NOT_MINTED_BY_R29',
  'R30_SAMPLE_DELTA_ALREADY_BOUND',
  'R30_SPLIT_NOT_SUPPORTED',
  'R30_SAMPLE_DELTA_COVERAGE_NOT_ADDITIVE',
  'R30_DELTA_BATCH_COMPOSITION_INVALID',
  'R30_NOT_A_MINTED_DELTA_READINESS_BATCH',

  // Postconditions over R24's canonical result.
  'R30_DELTA_READINESS_NOT_BY_REFERENCE',
  'R30_OWNER_POLICY_BINDING_MISMATCH',
  'R30_SD9_SEMANTICS_MISMATCH',

  // The committed R24 historical baseline.
  'R30_R24_HISTORICAL_BASELINE_INPUT_INVALID',

  // The brief's stop marker.
  'STOP_R30_CANONICAL_R29_SAMPLE_DELTA_DRIFT_REQUIRES_REVIEW',
] as const);

export type A3ReadinessV2RefusalCode = (typeof A3_READINESS_V2_REFUSAL_CODES)[number];

export class A3ReadinessV2Refusal extends Error {
  constructor(
    readonly code: A3ReadinessV2RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3ReadinessV2Refusal';
  }
}

export function refuseV2Readiness(code: A3ReadinessV2RefusalCode, message: string): never {
  throw new A3ReadinessV2Refusal(code, message);
}

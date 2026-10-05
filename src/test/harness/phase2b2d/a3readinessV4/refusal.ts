/**
 * PHASE 2B-2D — A3 R37: THE V4 INCREMENTAL READINESS'S FAIL-CLOSED REFUSAL.
 *
 * R37 adds no membership, readiness or SD9 semantics of its own, so it adds
 * no semantic refusal either: a shape, owner-policy, readiness, membership or
 * SD9-envelope refusal raised by R24's pure helper propagates UNCHANGED as
 * R24's own `A3ReadinessRefusal`, so one disagreement has one name in every
 * slice. The codes here are about INPUT AUTHORITY, the fresh R36
 * reproduction, the committed R24 / R30 history, by-reference postconditions
 * and the brief's own STOP markers.
 *
 * A canonically BLOCKED reachable membership is NOT a refusal, and neither is
 * an UNSUCCESSFUL or PENDING mechanical SD9 status: they are governed results.
 *
 * Messages name a category, a field path or an array position. They never
 * name an organisation, a selection index, a run, a document digest, a rank
 * position, a score, a URL or text.
 */

export const A3_READINESS_V4_REFUSAL_CODES = Object.freeze([
  // Input authority.
  'R37_SAMPLE_DELTA_NOT_MINTED_BY_R36',
  'R37_R36_REPRODUCTION_NOT_PROVED_FOR_BATCH',
  'R37_R36_REPRODUCTION_ALREADY_PROVED',
  'R37_SAMPLE_DELTA_ALREADY_BOUND',
  'R37_SPLIT_NOT_SUPPORTED',
  'R37_SAMPLE_DELTA_COVERAGE_NOT_ADDITIVE',
  'R37_DELTA_BATCH_COMPOSITION_INVALID',
  'R37_NOT_A_MINTED_DELTA_READINESS_BATCH',
  'R37_HISTORICAL_READINESS_BASELINE_NOT_PROVED',

  // Postconditions over R24's canonical result.
  'R37_DELTA_READINESS_NOT_BY_REFERENCE',
  'R37_OWNER_POLICY_BINDING_MISMATCH',
  'R37_SD9_SEMANTICS_MISMATCH',

  // The brief's stop markers.
  'STOP_R37_FRESH_R36_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
  'STOP_R37_HISTORICAL_R24_R30_READINESS_BASELINE_DRIFT_REQUIRES_REVIEW',
  'STOP_R37_READINESS_DISAGREES_WITH_R36_PREPARATIONS',
] as const);

export type A3ReadinessV4RefusalCode = (typeof A3_READINESS_V4_REFUSAL_CODES)[number];

export class A3ReadinessV4Refusal extends Error {
  constructor(
    readonly code: A3ReadinessV4RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3ReadinessV4Refusal';
  }
}

export function refuseV4Readiness(code: A3ReadinessV4RefusalCode, message: string): never {
  throw new A3ReadinessV4Refusal(code, message);
}

/**
 * PHASE 2B-2D — A3 R43: THE V5 INCREMENTAL READINESS'S FAIL-CLOSED REFUSAL.
 *
 * R43 adds no membership, readiness or SD9 semantics of its own, so it adds
 * no semantic refusal either: a shape, owner-policy, readiness, membership or
 * SD9-envelope refusal raised by R24's pure helper propagates UNCHANGED as
 * R24's own `A3ReadinessRefusal`, so one disagreement has one name in every
 * slice. The codes here are about INPUT AUTHORITY, the fresh R42
 * reproduction, the committed R37 / R42 history, by-reference postconditions
 * and the brief's own STOP markers.
 *
 * A canonically BLOCKED reachable membership is NOT a refusal, and neither is
 * an UNSUCCESSFUL or PENDING mechanical SD9 status: they are governed results.
 *
 * Messages name a category, a field path or an array position. They never
 * name an organisation, a selection index, a run, a document digest, a rank
 * position, a score, a URL or text.
 */

export const A3_READINESS_V5_REFUSAL_CODES = Object.freeze([
  // Input authority.
  'R43_SAMPLE_DELTA_NOT_MINTED_BY_R42',
  'R43_R42_REPRODUCTION_NOT_PROVED_FOR_BATCH',
  'R43_R42_REPRODUCTION_ALREADY_PROVED',
  'R43_UPSTREAM_POOL_NOT_CLOSED_BEFORE_R40',
  'R43_HISTORICAL_READINESS_COVERAGE_NOT_PROVED_FOR_BATCH',
  'R43_SAMPLE_DELTA_ALREADY_BOUND',
  'R43_SPLIT_NOT_SUPPORTED',
  'R43_SAMPLE_DELTA_COVERAGE_NOT_ADDITIVE',
  'R43_DELTA_BATCH_COMPOSITION_INVALID',
  'R43_NOT_A_MINTED_DELTA_READINESS_BATCH',

  // Postconditions over R24's canonical result.
  'R43_DELTA_READINESS_NOT_BY_REFERENCE',
  'R43_OWNER_POLICY_BINDING_MISMATCH',
  'R43_SD9_SEMANTICS_MISMATCH',

  // The brief's stop markers.
  'STOP_R43_FRESH_R42_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
  'STOP_R43_HISTORICAL_R37_READINESS_BASELINE_DRIFT_REQUIRES_REVIEW',
  'STOP_R43_READINESS_DISAGREES_WITH_R42_PREPARATIONS',
] as const);

export type A3ReadinessV5RefusalCode = (typeof A3_READINESS_V5_REFUSAL_CODES)[number];

export class A3ReadinessV5Refusal extends Error {
  constructor(
    readonly code: A3ReadinessV5RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3ReadinessV5Refusal';
  }
}

export function refuseV5Readiness(code: A3ReadinessV5RefusalCode, message: string): never {
  throw new A3ReadinessV5Refusal(code, message);
}

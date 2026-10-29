/**
 * PHASE 2B-2D — A3 R24: THE REACHABLE-MEMBERSHIP / SD9 READINESS FAIL-CLOSED REFUSAL.
 *
 * Every broken invariant is a REFUSAL, never a repair. A canonically BLOCKED
 * cap is NOT a refusal: it is a governed result, and R24 carries it as a
 * BLOCKED reachable membership with no document list.
 *
 * A mechanical SD9 status of UNSUCCESSFUL or PENDING is not a refusal either.
 * It is the canonical envelope's classification, and R24 reports it.
 *
 * There is no partial result. Refusal messages name a category, a sample and
 * array positions. They never name an organisation, a selection index, a run,
 * a row id, a document digest, a rank position, a score or text.
 */

export const A3_READINESS_REFUSAL_CODES = Object.freeze([
  // Input authority (Level B).
  'R24_SAMPLE_PREPARATION_AUTHORITY_NOT_MINTED_BY_R23',
  'R24_SAMPLE_PREPARATION_ALREADY_BOUND',
  'R24_BATCH_COMPOSITION_INVALID',

  // Slot shape and owner-policy binding.
  'R24_SPLIT_NOT_SUPPORTED',
  'R24_SLOT_PREPARATION_SHAPE_INVALID',
  'R24_OWNER_POLICY_BINDING_MISMATCH',

  // Canonical calls.
  'R24_CANONICAL_SET_P_READINESS_STOPPED',
  'R24_CANONICAL_SD9_ENVELOPE_STOPPED',

  // Structural proof around canonical results (§29-§31).
  'R24_SET_P_READINESS_INCONSISTENT',
  'R24_SET_R_READINESS_INCONSISTENT',
  'R24_REACHABLE_MEMBERSHIP_INCONSISTENT',
  'R24_SD9_ENVELOPE_INCONSISTENT',

  // The post-mint R23 drift cross-check.
  'R24_R23_CENSUS_INPUT_INVALID',
] as const);

export type A3ReadinessRefusalCode = (typeof A3_READINESS_REFUSAL_CODES)[number];

export class A3ReadinessRefusal extends Error {
  constructor(
    readonly code: A3ReadinessRefusalCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(`${code}: ${message}`, options);
    this.name = 'A3ReadinessRefusal';
  }
}

export function refuse(
  code: A3ReadinessRefusalCode,
  message: string,
  options?: { readonly cause?: unknown },
): never {
  throw new A3ReadinessRefusal(code, message, options);
}

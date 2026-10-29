/**
 * PHASE 2B-2D — A3 R23: THE SAMPLE SURVIVOR PREPARATION'S FAIL-CLOSED REFUSAL.
 *
 * R23 wraps the canonical SET_P and SET_R compositions in structural proof.
 * Every broken invariant is a REFUSAL, never a repair: a preparation whose
 * partition, independence or exclusion trace does not hold is not re-walked
 * under another order - it stops.
 *
 * A canonically BLOCKED cap is NOT a refusal. It is a governed result, and it
 * is carried through exactly as the canonical function returned it.
 *
 * There is no partial result. A batch that refused half way would hand R24
 * preparations for some DEV_TRAIN slots and silence for the rest.
 *
 * Refusal messages name a category, a sample and array positions. They never
 * name an organisation, a selection index, a run, a row id, a document digest,
 * a rank digest, a score, an edge endpoint or extracted text.
 */

export const A3_SAMPLE_REFUSAL_CODES = Object.freeze([
  // Input authority (Level B).
  'R23_SD7_GRAPH_AUTHORITY_NOT_MINTED_BY_R22',
  'R23_SD7_GRAPH_ALREADY_PREPARED',
  'R23_BATCH_COMPOSITION_INVALID',

  // Slot shape.
  'R23_SPLIT_NOT_SUPPORTED',
  'R23_SLOT_INPUT_SHAPE_INVALID',
  'R23_SLOT_HAS_NO_DOCUMENTS',
  'R23_GRAPH_DOCUMENT_COVERAGE_MISMATCH',

  // The canonical compositions themselves.
  'R23_CANONICAL_SET_P_PREPARATION_STOPPED',
  'R23_CANONICAL_SET_R_PREPARATION_STOPPED',
  'R23_CANONICAL_SET_R_CAP_STOPPED',
  'R23_CANONICAL_SET_R_READINESS_STOPPED',

  // Structural proof around the canonical results (§13, §23-§27).
  'R23_SAMPLE_POPULATION_MISMATCH',
  'R23_SURVIVOR_PARTITION_INVALID',
  'R23_SHORT_TEXT_PLACEMENT_INVALID',
  'R23_SURVIVOR_INDEPENDENCE_VIOLATED',
  'R23_EXCLUSION_WITNESS_INVALID',
  'R23_CAP_RESULT_MALFORMED',
  'R23_CAP_READINESS_INCONSISTENT',

  // The post-mint R22 drift cross-check.
  'R23_R22_CENSUS_INPUT_INVALID',
] as const);

export type A3SampleRefusalCode = (typeof A3_SAMPLE_REFUSAL_CODES)[number];

export class A3SampleRefusal extends Error {
  constructor(
    readonly code: A3SampleRefusalCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(`${code}: ${message}`, options);
    this.name = 'A3SampleRefusal';
  }
}

export function refuse(
  code: A3SampleRefusalCode,
  message: string,
  options?: { readonly cause?: unknown },
): never {
  throw new A3SampleRefusal(code, message, options);
}

/**
 * PHASE 2B-2D — A3 R22: THE GRAPH MEASUREMENT'S FAIL-CLOSED REFUSAL.
 *
 * R22 wraps one canonical call per slot in structural proof. Every broken
 * invariant is a REFUSAL, never a repair: a graph that does not cover its
 * slot's documents exactly, or whose edges are malformed, is not re-measured
 * under another order or threshold - it stops.
 *
 * There is no partial result. A batch that refused half way would hand R23
 * graphs for some DEV_TRAIN slots and silence for the rest.
 *
 * Refusal messages name a category and array positions. They never name an
 * organisation, a selection index, a run, a row id, a URL, a document digest,
 * a similarity, a score or extracted text.
 */

export const A3_GRAPH_REFUSAL_CODES = Object.freeze([
  // Input authority (Level B).
  'R22_DOCUMENT_SOURCE_AUTHORITY_NOT_MINTED_BY_R21',
  'R22_DOCUMENT_SOURCE_ALREADY_MEASURED',
  'R22_BATCH_COMPOSITION_INVALID',
  'R22_NOT_A_MINTED_SLOT_SD7_GRAPH',

  // Slot shape.
  'R22_SPLIT_NOT_SUPPORTED',
  'R22_SLOT_INPUT_SHAPE_INVALID',
  'R22_SLOT_HAS_NO_DOCUMENTS',

  // Exact document -> canonical group translation (§10).
  'R22_DUPLICATE_DOCUMENT_IN_SLOT',
  'R22_DOCUMENT_HAS_NO_SOURCE_ROW',
  'R22_SOURCE_ROW_IN_TWO_DOCUMENTS',
  'R22_GROUP_TRANSLATION_NOT_BIJECTIVE',

  // The canonical measurement itself.
  'R22_CANONICAL_MEASUREMENT_STOPPED',

  // Structural proof around the canonical graph (§15-§18).
  'R22_GRAPH_COVERAGE_MISMATCH',
  'R22_GRAPH_PARTITION_INVALID',
  'R22_COMPARED_PAIR_COUNT_INVALID',
  'R22_GRAPH_EDGE_STRUCTURE_INVALID',

  // The post-mint R21 drift cross-check.
  'R22_R21_CENSUS_INPUT_INVALID',
] as const);

export type A3GraphRefusalCode = (typeof A3_GRAPH_REFUSAL_CODES)[number];

export class A3GraphRefusal extends Error {
  constructor(
    readonly code: A3GraphRefusalCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(`${code}: ${message}`, options);
    this.name = 'A3GraphRefusal';
  }
}

export function refuse(
  code: A3GraphRefusalCode,
  message: string,
  options?: { readonly cause?: unknown },
): never {
  throw new A3GraphRefusal(code, message, options);
}

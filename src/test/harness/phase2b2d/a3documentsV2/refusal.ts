/**
 * PHASE 2B-2D — A3 R27: THE INCREMENTAL ASSEMBLY'S FAIL-CLOSED REFUSAL.
 *
 * R27 adds no document semantics of its own, so it adds no semantic refusal
 * either: a support-gate, text-divergence, relation or R10 refusal raised by
 * R21's pure assembler propagates UNCHANGED as R21's own
 * `A3DocumentSourceRefusal`, so one disagreement has one name in both slices.
 * The codes here are about INPUT AUTHORITY, the R26 row graph R27 adapts, and
 * the brief's own STOP markers.
 *
 * Messages name a category, a field or an array position. They never name an
 * organisation, a selection index, a run, a row id, a document digest, a URL,
 * a score or text.
 */

export const A3_DOCUMENT_SOURCE_V2_REFUSAL_CODES = Object.freeze([
  // Input authority.
  'R27_EVIDENCE_DELTA_NOT_MINTED_BY_R26',
  'R27_DELTA_EVIDENCE_ALREADY_ASSEMBLED',
  'R27_DELTA_BATCH_ALREADY_ASSEMBLED',
  'R27_SPLIT_NOT_SUPPORTED',
  'R27_EVIDENCE_COVERAGE_NOT_ADDITIVE',
  'R27_DELTA_BATCH_COMPOSITION_INVALID',
  'R27_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
  'R27_NOT_A_MINTED_DELTA_DOCUMENT_SOURCE_BATCH',

  // The R26 row graph, re-checked before R21 assembly.
  'R27_DELTA_EVIDENCE_SHAPE_INVALID',
  'R27_PAGE_FETCH_RELATION_MISMATCH',
  'R27_CANDIDATE_PAGE_RELATION_MISMATCH',

  // The brief's stop markers.
  'STOP_R27_DOCUMENT_ASSEMBLY_DISAGREES_WITH_R26_DURABLE_EVIDENCE',
  'STOP_R27_CANONICAL_R26_DELTA_DRIFT_REQUIRES_REVIEW',
  'STOP_R27_HISTORICAL_R21_BASELINE_DRIFT_REQUIRES_REVIEW',
] as const);

export type A3DocumentSourceV2RefusalCode = (typeof A3_DOCUMENT_SOURCE_V2_REFUSAL_CODES)[number];

export class A3DocumentSourceV2Refusal extends Error {
  constructor(
    readonly code: A3DocumentSourceV2RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3DocumentSourceV2Refusal';
  }
}

export function refuseV2Document(code: A3DocumentSourceV2RefusalCode, message: string): never {
  throw new A3DocumentSourceV2Refusal(code, message);
}

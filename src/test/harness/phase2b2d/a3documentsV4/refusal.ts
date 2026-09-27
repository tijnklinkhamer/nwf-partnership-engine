/**
 * PHASE 2B-2D — A3 R34: THE V4 INCREMENTAL ASSEMBLY'S FAIL-CLOSED REFUSAL.
 *
 * R34 adds no document semantics of its own, so it adds no semantic refusal
 * either: a support-gate, text-divergence, relation or R10 refusal raised by
 * R21's pure assembler propagates UNCHANGED as R21's own
 * `A3DocumentSourceRefusal`, so one disagreement has one name in every slice.
 * The codes here are about INPUT AUTHORITY, the R33 row graph R34 adapts, the
 * fresh R33 reproduction and the committed history, and the brief's STOPs.
 *
 * Messages name a category, a field path or an array position. They never
 * name an organisation, a selection index, a run, a row id, a document
 * digest, a URL, a score or text.
 */

export const A3_DOCUMENT_SOURCE_V4_REFUSAL_CODES = Object.freeze([
  // Input authority.
  'R34_EVIDENCE_DELTA_NOT_MINTED_BY_R33',
  'R34_R33_REPRODUCTION_NOT_PROVED_FOR_BATCH',
  'R34_DELTA_EVIDENCE_ALREADY_ASSEMBLED',
  'R34_DELTA_BATCH_ALREADY_ASSEMBLED',
  'R34_SPLIT_NOT_SUPPORTED',
  'R34_EVIDENCE_COVERAGE_NOT_ADDITIVE',
  'R34_DELTA_BATCH_COMPOSITION_INVALID',
  'R34_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
  'R34_NOT_A_MINTED_DELTA_DOCUMENT_SOURCE_BATCH',
  'R34_HISTORICAL_BASELINE_NOT_PROVED',

  // The R33 row graph, re-checked before R21 assembly.
  'R34_DELTA_EVIDENCE_SHAPE_INVALID',
  'R34_PAGE_FETCH_RELATION_MISMATCH',
  'R34_CANDIDATE_PAGE_RELATION_MISMATCH',

  // The brief's stop markers.
  'STOP_R34_DOCUMENT_ASSEMBLY_DISAGREES_WITH_R33_DURABLE_EVIDENCE',
  'STOP_R34_FRESH_R33_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
  'STOP_R34_HISTORICAL_R21_R27_BASELINE_DRIFT_REQUIRES_REVIEW',
] as const);

export type A3DocumentSourceV4RefusalCode = (typeof A3_DOCUMENT_SOURCE_V4_REFUSAL_CODES)[number];

export class A3DocumentSourceV4Refusal extends Error {
  constructor(
    readonly code: A3DocumentSourceV4RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3DocumentSourceV4Refusal';
  }
}

export function refuseV4Document(code: A3DocumentSourceV4RefusalCode, message: string): never {
  throw new A3DocumentSourceV4Refusal(code, message);
}

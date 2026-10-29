/**
 * PHASE 2B-2D — A3 R40: THE V5 INCREMENTAL ASSEMBLY'S FAIL-CLOSED REFUSAL.
 *
 * R40 adds no document semantics of its own, so it adds no semantic refusal
 * either: a support-gate, text-divergence, relation or R10 refusal raised by
 * R21's pure assembler propagates UNCHANGED as R21's own
 * `A3DocumentSourceRefusal`, so one disagreement has one name in every slice.
 * The codes here are about INPUT AUTHORITY, the R39 row graph R40 adapts, the
 * fresh R39 reproduction and the committed history, and the brief's STOPs.
 *
 * Messages name a category, a field path or an array position. They never
 * name an organisation, a selection index, a run, a row id, a document
 * digest, a URL, a score or text.
 */

export const A3_DOCUMENT_SOURCE_V5_REFUSAL_CODES = Object.freeze([
  // Input authority.
  'R40_EVIDENCE_DELTA_NOT_MINTED_BY_R39',
  'R40_R39_REPRODUCTION_NOT_PROVED_FOR_BATCH',
  'R40_HISTORICAL_DOCUMENT_COVERAGE_NOT_PROVED_FOR_BATCH',
  'R40_DELTA_EVIDENCE_ALREADY_ASSEMBLED',
  'R40_DELTA_BATCH_ALREADY_ASSEMBLED',
  'R40_SPLIT_NOT_SUPPORTED',
  'R40_EVIDENCE_COVERAGE_NOT_ADDITIVE',
  'R40_DELTA_BATCH_COMPOSITION_INVALID',
  'R40_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
  'R40_NOT_A_MINTED_DELTA_DOCUMENT_SOURCE_BATCH',
  'R40_UPSTREAM_POOL_NOT_CLOSED',

  // The R39 row graph, re-checked before R21 assembly.
  'R40_DELTA_EVIDENCE_SHAPE_INVALID',
  'R40_PAGE_FETCH_RELATION_MISMATCH',
  'R40_CANDIDATE_PAGE_RELATION_MISMATCH',

  // The brief's stop markers.
  'STOP_R40_DOCUMENT_ASSEMBLY_DISAGREES_WITH_R39_DURABLE_EVIDENCE',
  'STOP_R40_FRESH_R39_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
  'STOP_R40_HISTORICAL_R34_R37_BASELINE_DRIFT_REQUIRES_REVIEW',
] as const);

export type A3DocumentSourceV5RefusalCode = (typeof A3_DOCUMENT_SOURCE_V5_REFUSAL_CODES)[number];

export class A3DocumentSourceV5Refusal extends Error {
  constructor(
    readonly code: A3DocumentSourceV5RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3DocumentSourceV5Refusal';
  }
}

export function refuseV5Document(code: A3DocumentSourceV5RefusalCode, message: string): never {
  throw new A3DocumentSourceV5Refusal(code, message);
}

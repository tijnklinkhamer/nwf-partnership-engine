/**
 * PHASE 2B-2D — A3 R33: THE V4 INCREMENTAL EVIDENCE ADAPTER'S FAIL-CLOSED
 * REFUSAL.
 *
 * Every refusal R33 raises happens BEFORE any database connection unless it is
 * one R20's own lower layer raises (those keep R20's own `A3EvidenceRefusal`
 * and code). A changed or retracted existing DEV_TRAIN authority is refused by
 * R32's own gate with R32's own `STOP_R32_*` marker: one disagreement keeps one
 * name in every slice.
 *
 * Messages name a field category or a count. They never name an organisation,
 * an eche row key, a selection index, a run id or a digest.
 */

export const A3_EVIDENCE_V4_REFUSAL_CODES = Object.freeze([
  'STOP_R33_GOVERNANCE_SNAPSHOT_DRIFT_REQUIRES_REVIEW',
  'STOP_R33_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW',
  'R33_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3',
  'R33_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4',
  'R33_NOT_A_DERIVED_V4_EVIDENCE_DELTA',
  'R33_READY_NOT_MINTED_BY_GOVERNANCE_V4_SNAPSHOT',
  'R33_AUTHORITY_SPLIT_NOT_SUPPORTED',
  'R33_AUTHORITY_NOT_A_NEW_V4_DELTA_AUTHORITY',
  'R33_COVERAGE_ARITHMETIC_INVALID',
  'R33_DELTA_BATCH_COMPOSITION_INVALID',
  'R33_NOT_A_MINTED_DELTA_BATCH',
] as const);

export type A3EvidenceV4RefusalCode = (typeof A3_EVIDENCE_V4_REFUSAL_CODES)[number];

export class A3EvidenceV4Refusal extends Error {
  constructor(
    readonly code: A3EvidenceV4RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3EvidenceV4Refusal';
  }
}

export function refuseV4Evidence(code: A3EvidenceV4RefusalCode, message: string): never {
  throw new A3EvidenceV4Refusal(code, message);
}

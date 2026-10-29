/**
 * PHASE 2B-2D — A3 R39: THE V5 INCREMENTAL EVIDENCE ADAPTER'S FAIL-CLOSED
 * REFUSAL.
 *
 * Every refusal R39 raises happens BEFORE any database connection unless it is
 * one R20's own lower layer raises (those keep R20's own `A3EvidenceRefusal`
 * and code), or one of the post-read composition checks that refuse BEFORE
 * any V5 evidence is minted. A changed or retracted existing DEV_TRAIN
 * authority is refused by R38B's own gate with R38B's own `STOP_R38B_*`
 * marker: one disagreement keeps one name in every slice.
 *
 * Messages name a field category or a count. They never name an organisation,
 * an eche row key, a selection index, a run id or a digest.
 */

export const A3_EVIDENCE_V5_REFUSAL_CODES = Object.freeze([
  'STOP_R39_GOVERNANCE_V5_DRIFT_REQUIRES_REVIEW',
  'STOP_R39_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW',
  'R39_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4',
  'R39_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V5',
  'R39_NOT_A_DERIVED_V5_EVIDENCE_DELTA',
  'R39_NEW_DELTA_AUTHORITIES_NOT_DERIVABLE',
  'R39_READY_NOT_MINTED_BY_GOVERNANCE_V5_SNAPSHOT',
  'R39_AUTHORITY_SPLIT_NOT_SUPPORTED',
  'R39_AUTHORITY_NOT_A_NEW_V5_DELTA_AUTHORITY',
  'R39_COVERAGE_ARITHMETIC_INVALID',
  'R39_DELTA_READ_COMPOSITION_INVALID',
  'R39_V5_SNAPSHOT_ALREADY_BOUND_IN_THIS_PROCESS',
  'R39_NOT_A_MINTED_DELTA_BATCH',
  'R39_SQL_STATEMENT_COUNT_UNEXPECTED',
  'R39_DATABASE_ACCESS_UNEXPECTED',
] as const);

export type A3EvidenceV5RefusalCode = (typeof A3_EVIDENCE_V5_REFUSAL_CODES)[number];

export class A3EvidenceV5Refusal extends Error {
  constructor(
    readonly code: A3EvidenceV5RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3EvidenceV5Refusal';
  }
}

export function refuseV5Evidence(code: A3EvidenceV5RefusalCode, message: string): never {
  throw new A3EvidenceV5Refusal(code, message);
}

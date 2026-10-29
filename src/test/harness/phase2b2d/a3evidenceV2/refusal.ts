/**
 * PHASE 2B-2D — A3 R26: THE INCREMENTAL EVIDENCE ADAPTER'S FAIL-CLOSED REFUSAL.
 *
 * Every refusal R26 raises happens BEFORE any evidence query unless it is one
 * R20's own lower layer raises (those keep R20's own `A3EvidenceRefusal` and
 * code, so one disagreement has one name in both slices).
 *
 * The three `STOP_R26_*` codes are the brief's own stop markers: an old
 * authority that changed, an old authority that was retracted, and a
 * governance snapshot that drifted from the R25 checkpoint. None of them is
 * resolved here - R26 is an append-only expansion, not a reconciliation.
 *
 * Messages name a field category or a count. They never name an organisation,
 * an eche row key, a selection index, a run id or a digest.
 */

export const A3_EVIDENCE_V2_REFUSAL_CODES = Object.freeze([
  'STOP_R26_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
  'STOP_R26_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
  'STOP_R26_GOVERNANCE_SNAPSHOT_DRIFT_REQUIRES_REVIEW',
  'R26_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V1',
  'R26_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V2',
  'R26_READY_NOT_MINTED_BY_GOVERNANCE_V2_SNAPSHOT',
  'R26_AUTHORITY_SPLIT_NOT_SUPPORTED',
  'R26_DUPLICATE_SELECTION_INDEX',
  'R26_COVERAGE_ARITHMETIC_INVALID',
  'R26_DELTA_BATCH_COMPOSITION_INVALID',
  'R26_NOT_A_MINTED_DELTA_BATCH',
] as const);

export type A3EvidenceV2RefusalCode = (typeof A3_EVIDENCE_V2_REFUSAL_CODES)[number];

export class A3EvidenceV2Refusal extends Error {
  constructor(
    readonly code: A3EvidenceV2RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3EvidenceV2Refusal';
  }
}

export function refuseV2Evidence(code: A3EvidenceV2RefusalCode, message: string): never {
  throw new A3EvidenceV2Refusal(code, message);
}

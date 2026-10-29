/**
 * PHASE 2B-2D — A3 R31: THE COMMITTED-GOVERNANCE V3 ADAPTER'S FAIL-CLOSED
 * REFUSAL.
 *
 * These are the refusals that exist ONLY because Registry V3 exists: its
 * composition over Registry V2, its pinned ten-entry ledger revision, its one
 * new record family, its snapshot brand and R31's zero-DEV_TRAIN-delta stop
 * conditions. The commit-addressed byte transport is R25's, unchanged, and
 * raises R25's own codes; every semantic refusal V3 shares with Registry V1 is
 * raised with V1's own `A3GovernanceRefusal` and V1's own code. One
 * disagreement keeps one name in every snapshot.
 *
 * Messages name a registry id, an array position or a field category. They
 * never name an organisation, an eche row key, a run id, a URL, a domain or a
 * sealed path.
 */

export const A3_GOVERNANCE_V3_REFUSAL_CODES = Object.freeze([
  // Registry V3 shape and composition.
  'REGISTRY_V3_ENTRY_MALFORMED',
  'REGISTRY_V3_DUPLICATE_ENTRY',
  'REGISTRY_V3_COMPOSITION_INVALID',
  // The pinned ten-entry replacement ledger.
  'REPLACEMENT_LEDGER_V3_PIN_MISMATCH',
  // A ledger entry's frozen reason must predate the ledger revision itself.
  'V3_REPLACEMENT_REASON_POSTDATES_LEDGER_REVISION',
  // The post-P24 window adjudication family.
  'V3_FAMILY_RECORD_SHAPE_INVALID',
  'V3_FAMILY_ITEM_SHAPE_INVALID',
  'V3_FAMILY_ITEM_ORDER_INVALID',
  'V3_FAMILY_UNSTARTED_ITEM_INVALID',
  'V3_FAMILY_DISPOSITION_CONFLICT',
  'V3_FAMILY_OBSERVATION_BINDING_MISMATCH',
  // Snapshot.
  'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3',
  // R31's DEV_TRAIN continuity stop conditions.
  'STOP_R31_UNEXPECTED_NEW_DEV_TRAIN_AUTHORITY_REQUIRES_EVIDENCE_DELTA_PLANNING',
  'STOP_R31_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
  'STOP_R31_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
] as const);

export type A3GovernanceV3RefusalCode = (typeof A3_GOVERNANCE_V3_REFUSAL_CODES)[number];

export class A3GovernanceV3Refusal extends Error {
  constructor(
    readonly code: A3GovernanceV3RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3GovernanceV3Refusal';
  }
}

export function refuseV3(code: A3GovernanceV3RefusalCode, message: string): never {
  throw new A3GovernanceV3Refusal(code, message);
}

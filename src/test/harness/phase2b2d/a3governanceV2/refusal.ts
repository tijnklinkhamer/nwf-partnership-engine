/**
 * PHASE 2B-2D — A3 R25: THE COMMITTED-GOVERNANCE V2 ADAPTER'S FAIL-CLOSED
 * REFUSAL.
 *
 * These are the refusals that exist ONLY because Registry V2 is
 * commit-addressed and carries one new record family. Every semantic refusal
 * V2 shares with Registry V1 - identity conflicts, replacement-history
 * disagreement, superseded runs - is raised with V1's own
 * `A3GovernanceRefusal` and V1's own code, so one disagreement has one name in
 * both snapshots.
 *
 * Messages name a registry id, an array position or a field category. They
 * never name an organisation, an eche row key, a run id, a URL, a domain or a
 * sealed path.
 */

export const A3_GOVERNANCE_V2_REFUSAL_CODES = Object.freeze([
  // Registry V2 shape and composition.
  'REGISTRY_V2_ENTRY_MALFORMED',
  'REGISTRY_V2_DUPLICATE_ENTRY',
  'REGISTRY_V2_COMPOSITION_INVALID',
  // Commit-addressed byte transport.
  'COMMIT_ADDRESS_MALFORMED',
  'COMMITTED_PATH_UNSAFE',
  'COMMITTED_OBJECT_MISSING',
  'COMMITTED_PATH_MISSING_AT_COMMIT',
  'COMMITTED_BYTES_DRIFT',
  'COMMITTED_RECORD_UNPARSEABLE',
  'COMMITTED_RECORD_KIND_MISMATCH',
  // The pinned nine-entry replacement ledger.
  'REPLACEMENT_LEDGER_V2_PIN_MISMATCH',
  // The post-P18 second-window adjudication family.
  'V2_FAMILY_RECORD_SHAPE_INVALID',
  'V2_FAMILY_ITEM_SHAPE_INVALID',
  'V2_FAMILY_ITEM_ORDER_INVALID',
  'V2_FAMILY_DISPOSITION_CONFLICT',
  'V2_FAMILY_OBSERVATION_BINDING_MISMATCH',
  // Snapshot.
  'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V2',
] as const);

export type A3GovernanceV2RefusalCode = (typeof A3_GOVERNANCE_V2_REFUSAL_CODES)[number];

export class A3GovernanceV2Refusal extends Error {
  constructor(
    readonly code: A3GovernanceV2RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3GovernanceV2Refusal';
  }
}

export function refuseV2(code: A3GovernanceV2RefusalCode, message: string): never {
  throw new A3GovernanceV2Refusal(code, message);
}

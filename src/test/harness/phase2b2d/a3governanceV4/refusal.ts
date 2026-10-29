/**
 * PHASE 2B-2D — A3 R32: THE COMMITTED-GOVERNANCE V4 ADAPTER'S FAIL-CLOSED
 * REFUSAL.
 *
 * These are the refusals that exist ONLY because Registry V4 exists: its
 * composition over Registry V3, its pinned thirty-entry ledger revision, the
 * record families V4 adds, the one prefix -> full run-reference bridge the A2
 * provenance closure makes possible, the corrections of pending items, its
 * snapshot brand and R32's DEV_TRAIN continuity stop conditions. The
 * commit-addressed byte transport is R25's, unchanged, and raises R25's own
 * codes; every semantic refusal V4 shares with Registry V1 is raised with V1's
 * own `A3GovernanceRefusal` and V1's own code. One disagreement keeps one name
 * in every snapshot.
 *
 * Messages name a registry id, an array position or a field category. They
 * never name an organisation, an eche row key, a run id, a URL, a domain or a
 * sealed path.
 */

export const A3_GOVERNANCE_V4_REFUSAL_CODES = Object.freeze([
  // Registry V4 shape and composition.
  'REGISTRY_V4_ENTRY_MALFORMED',
  'REGISTRY_V4_DUPLICATE_ENTRY',
  'REGISTRY_V4_COMPOSITION_INVALID',
  // The pinned thirty-entry replacement ledger.
  'REPLACEMENT_LEDGER_V4_PIN_MISMATCH',
  // A ledger entry's frozen reason must predate the ledger revision itself.
  'V4_REPLACEMENT_REASON_POSTDATES_LEDGER_REVISION',
  // The V4 record families.
  'V4_FAMILY_RECORD_SHAPE_INVALID',
  'V4_FAMILY_ITEM_SHAPE_INVALID',
  'V4_FAMILY_ITEM_ORDER_INVALID',
  'V4_FAMILY_DISPOSITION_CONFLICT',
  'V4_FAMILY_OBSERVATION_BINDING_MISMATCH',
  'V4_FAMILY_FULL_RUN_REFERENCE_IN_PREFIX_ERA_RECORD',
  // The provenance-closure family and the prefix -> full bridge.
  'V4_CLOSURE_RECORD_SHAPE_INVALID',
  'V4_CLOSURE_ENTRY_SHAPE_INVALID',
  'V4_CLOSURE_DERIVATION_LABEL_INVALID',
  'V4_CLOSURE_PREFIX_COMPLETION_INVALID',
  'V4_CLOSURE_UNIQUE_MATCH_UNPROVEN',
  'V4_CLOSURE_AGGREGATES_DO_NOT_RECONCILE',
  'V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE',
  'V4_CLOSURE_ENTRY_BOUND_TWICE',
  'V4_CLOSURE_ENTRY_NOT_A_CURRENT_EPISODE',
  'V4_MIXED_CONVENTION_BRIDGE_INVALID',
  'V4_CURRENT_PREFIX_ERA_FACT_WITHOUT_FULL_RUN_PROVENANCE',
  // Pending / held items and the records that resolve them.
  'V4_RECONCILIATION_SHAPE_INVALID',
  'V4_CORRECTION_TRANSITION_INVALID',
  'V4_CORRECTION_WITHOUT_PENDING_ITEM',
  'V4_CORRECTION_EVIDENCE_MISMATCH',
  'V4_HELD_ITEM_RESOLUTION_INVALID',
  'V4_NON_TERMINAL_ITEM_UNRESOLVED',
  'V4_DECLARED_GENERATION_STATE_MISMATCH',
  // Snapshot.
  'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4',
  // R32's DEV_TRAIN continuity stop conditions.
  'STOP_R32_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
  'STOP_R32_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
] as const);

export type A3GovernanceV4RefusalCode = (typeof A3_GOVERNANCE_V4_REFUSAL_CODES)[number];

export class A3GovernanceV4Refusal extends Error {
  constructor(
    readonly code: A3GovernanceV4RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3GovernanceV4Refusal';
  }
}

export function refuseV4(code: A3GovernanceV4RefusalCode, message: string): never {
  throw new A3GovernanceV4Refusal(code, message);
}

/**
 * PHASE 2B-2D — A3 R38B: THE COMMITTED-GOVERNANCE V5 ADAPTER'S FAIL-CLOSED
 * REFUSAL.
 *
 * These are the refusals that exist ONLY because Registry V5 exists: its
 * exact composition (its own entries plus the V4 entries it reuses by
 * reference), its commit-addressed bytes, its explicit parser families, the
 * terminal Generation-1 starting state, the Generation-2 reserve schedule and
 * ledger, the carry-forward admissions, the explicit thirteen-window
 * Generation-2 history, the Window-13 recovery, run-reference integrity, the
 * post-derivation freeze cross-check, the V5 snapshot brand and R38B's
 * DEV_TRAIN continuity stop conditions. The byte transport is R25's,
 * unchanged, and raises R25's own codes. A refusal from the R38A contract is
 * the R38A contract's own `A3CrossGenerationRefusal`, never re-wrapped.
 *
 * Messages name a registry id, an array position, a slot-chain position or a
 * field category. They never name an organisation, an eche row key, a run id,
 * a URL, a domain or a sealed path.
 */

export const A3_GOVERNANCE_V5_REFUSAL_CODES = Object.freeze([
  // Registry V5 shape and composition.
  'REGISTRY_V5_ENTRY_MALFORMED',
  'REGISTRY_V5_DUPLICATE_ENTRY',
  'REGISTRY_V5_COMPOSITION_INVALID',
  'REGISTRY_V5_DISCRIMINATOR_MISMATCH',
  'REGISTRY_V5_CHECKPOINT_MISMATCH',
  // Governance preconditions (R38 refusal, R38A contract record).
  'V5_PRECONDITION_INVALID',
  // Frozen identity: draw, frame, Generation-2 schedule.
  'V5_FROZEN_DRAW_INVALID',
  'V5_FROZEN_FRAME_INVALID',
  'V5_GENERATION2_SCHEDULE_INVALID',
  // Ledgers and the terminal Generation-1 starting state.
  'V5_GENERATION1_TERMINAL_STATE_INVALID',
  'V5_GENERATION1_LEDGER_INVALID',
  'V5_GENERATION2_LEDGER_INVALID',
  'V5_METHODOLOGY_V3_INVALID',
  // Structure.
  'V5_STRUCTURAL_OCCUPANT_MISMATCH',
  // Record families.
  'V5_FAMILY_RECORD_SHAPE_INVALID',
  'V5_FAMILY_ITEM_SHAPE_INVALID',
  'V5_FAMILY_GENERATION_MISMATCH',
  'V5_FAMILY_BINDING_MISMATCH',
  'V5_FAMILY_IDENTITY_MISMATCH',
  'V5_FAMILY_POLICY_UNBOUND',
  // Carry-forward.
  'V5_CARRY_FORWARD_INVALID',
  'V5_CARRY_FORWARD_FACT_MISMATCH',
  // The explicit Generation-2 history.
  'V5_HISTORY_WINDOW_ORDER_INVALID',
  'V5_HISTORY_LEDGER_CONSUMPTION_INVALID',
  'V5_HISTORY_OCCUPANT_INVALID',
  'V5_HISTORY_CADENCE_INVALID',
  // Window-13 host recovery.
  'V5_RECOVERY_PROVENANCE_INVALID',
  // Terminal facts and their provenance.
  'V5_TERMINAL_FACT_DUPLICATE',
  'V5_TERMINAL_FACT_UNREGISTERED_PROVENANCE',
  'V5_DIAGNOSTIC_PROMOTION_REFUSED',
  // Historical replacement audit.
  'V5_REPLACEMENT_HISTORY_INVALID',
  // Run-reference integrity.
  'V5_RUN_REFERENCE_INTEGRITY_INVALID',
  // The R38A resolution and the post-derivation cross-checks.
  'V5_TERMINAL_RESOLUTION_INCOMPLETE',
  'V5_FREEZE_BINDING_MISMATCH',
  'V5_FREEZE_AGGREGATE_MISMATCH',
  'V5_DECLARED_STATE_MISMATCH',
  // Snapshot.
  'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V5',
  // R38B's DEV_TRAIN continuity stop conditions.
  'STOP_R38B_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
  'STOP_R38B_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
] as const);

export type A3GovernanceV5RefusalCode = (typeof A3_GOVERNANCE_V5_REFUSAL_CODES)[number];

export class A3GovernanceV5Refusal extends Error {
  constructor(
    readonly code: A3GovernanceV5RefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3GovernanceV5Refusal';
  }
}

export function refuseV5(code: A3GovernanceV5RefusalCode, message: string): never {
  throw new A3GovernanceV5Refusal(code, message);
}

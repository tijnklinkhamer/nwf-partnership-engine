/**
 * PHASE 2B-2D — A3 R19: THE GOVERNANCE ADAPTER'S FAIL-CLOSED REFUSAL.
 *
 * Every disagreement between committed governance records is a REFUSAL, never
 * a silent precedence resolution. There is no warning-only path and no partial
 * result: an adapter that refused half way through would hand a caller a
 * census over an authority state nobody approved.
 *
 * Refusal messages name a registry id, a family, a selection index, an array
 * position or a field category. They never name an organisation, an eche row
 * key, a run id, a URL, a domain or a sealed path - the same discipline R17's
 * own refusals keep.
 */

export const A3_GOVERNANCE_REFUSAL_CODES = Object.freeze([
  // Registry and bytes.
  'REGISTRY_ENTRY_MALFORMED',
  'REGISTRY_DUPLICATE_ENTRY',
  'REGISTERED_GOVERNANCE_FILE_MISSING',
  'REGISTERED_GOVERNANCE_FILE_DRIFT',
  'REGISTERED_GOVERNANCE_FILE_UNPARSEABLE',
  'REGISTERED_GOVERNANCE_RECORD_KIND_MISMATCH',
  'UNREGISTERED_GOVERNANCE_PATH',
  'UNSUPPORTED_GOVERNANCE_RECORD_FAMILY',
  'REGISTRY_INCOMPLETE_FOR_CURRENT_OCCUPANT',
  // Frozen draw.
  'FROZEN_DRAW_MALFORMED',
  'FROZEN_DRAW_IDENTITY_MISMATCH',
  // Replacement ledger.
  'REPLACEMENT_LEDGER_MALFORMED',
  'REPLACEMENT_LEDGER_INVALID',
  'REPLACEMENT_LEDGER_HASH_MISMATCH',
  // Transition ledger chain.
  'TRANSITION_LEDGER_MALFORMED',
  'TRANSITION_LEDGER_PREDECESSOR_MISMATCH',
  'TRANSITION_LEDGER_ENTRY_COUNT_MISMATCH',
  'TRANSITION_LEDGER_CARRY_FORWARD_MUTATED',
  'TRANSITION_LEDGER_CHAIN_MALFORMED',
  // Transition edges and graph.
  'TRANSITION_EDGE_MALFORMED',
  'TRANSITION_EDGE_RUN_REF_MALFORMED',
  'TRANSITION_EDGE_SELF_SUPERSESSION',
  'TRANSITION_EDGE_DECLARATION_INCONSISTENT',
  'TRANSITION_GRAPH_CYCLE',
  'TRANSITION_GRAPH_FORK',
  'TRANSITION_GRAPH_OCCUPANT_SCOPE_UNPROVABLE',
  'TRANSITION_TAIL_WITHOUT_TERMINAL_ADJUDICATION',
  // Family parsing.
  'GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID',
  'GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID',
  'GOVERNANCE_FAMILY_DISPOSITION_INVALID',
  'GOVERNANCE_FAMILY_OCCUPANT_UNDECLARED',
  'GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT',
  'NON_ADJUDICATIVE_SOURCE_USED_AS_DISPOSITION',
  // Normalisation and precedence.
  'REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE',
  'MULTIPLE_CURRENT_TERMINAL_ADJUDICATIONS',
  'CURRENT_FACT_USES_SUPERSEDED_RUN',
  // Historical replacement audit.
  'REPLACEMENT_HISTORY_REASON_MISSING',
  'REPLACEMENT_HISTORY_REASON_MISMATCH',
  'REPLACEMENT_HISTORY_OCCUPANT_WAS_SUCCESSFUL',
  'REPLACEMENT_HISTORY_EPISODE_MISMATCH',
  // Snapshot.
  'NOT_A_MINTED_GOVERNANCE_SNAPSHOT',
] as const);

export type A3GovernanceRefusalCode = (typeof A3_GOVERNANCE_REFUSAL_CODES)[number];

export class A3GovernanceRefusal extends Error {
  constructor(
    readonly code: A3GovernanceRefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3GovernanceRefusal';
  }
}

export function refuse(code: A3GovernanceRefusalCode, message: string): never {
  throw new A3GovernanceRefusal(code, message);
}

/** `MULTIPLE_HISTORICAL_ADJUDICATIONS` is a legitimate observation, never a refusal. */
export const MULTIPLE_HISTORICAL_ADJUDICATIONS = 'MULTIPLE_HISTORICAL_ADJUDICATIONS';

/**
 * PHASE 2B-2D — A3 R20: THE DURABLE-EVIDENCE ADAPTER'S FAIL-CLOSED REFUSAL.
 *
 * R20 binds a governance authority to database rows. Every disagreement
 * between the two is a REFUSAL, never a repair and never a precedence rule:
 * an adapter that picked a winner would be inventing the acquisition of
 * record that R17 already decided.
 *
 * There is no partial result. A batch that refused half way through would
 * hand a later slice evidence for some DEV_TRAIN slots and silence for the
 * rest, and silence is exactly what "no silent zero" forbids.
 *
 * Refusal messages name a field category, a table, a relation or a count.
 * They never name an organisation, an eche row key, a run id, a URL, a host,
 * a document digest or extracted text - the same discipline R17's and R19's
 * own refusals keep.
 */

export const A3_EVIDENCE_REFUSAL_CODES = Object.freeze([
  // Authority and minting.
  'READY_AUTHORITY_NOT_MINTED_BY_GOVERNANCE_SNAPSHOT',
  'NOT_A_MINTED_GOVERNANCE_SNAPSHOT',
  'AUTHORITY_SPLIT_NOT_SUPPORTED',
  'DUPLICATE_READY_AUTHORITY',
  'NOT_A_MINTED_DURABLE_EVIDENCE',
  'BATCH_COMPOSITION_INVALID',

  // Database capability.
  'DATABASE_ROLE_NOT_PERMITTED',
  'DATABASE_NAME_UNEXPECTED',
  'TRANSACTION_NOT_READ_ONLY',
  'TRANSACTION_ISOLATION_NOT_REPEATABLE_READ',

  // Request shape.
  'EVIDENCE_REQUEST_SHAPE_INVALID',

  // Run identification.
  'AUTHORISED_RUN_NOT_FOUND',
  'AUTHORISED_RUN_NOT_UNIQUE',
  'AUTHORISED_RUN_ROW_NOT_UNIQUE',
  'AUTHORISED_RUN_IS_DRY_RUN',
  'AUTHORISED_RUN_POLICY_MISMATCH',
  'AUTHORISED_RUN_RULE_VERSION_INVALID',
  'RUN_UUID_MALFORMED',

  // Completion.
  'AUTHORISED_RUN_COMPLETION_MISSING',
  'AUTHORISED_RUN_COMPLETION_NOT_UNIQUE',
  'AUTHORISED_RUN_NOT_COMPLETED',
  'AUTHORISED_RUN_COMPLETION_CARRIES_ERROR',

  // Fetch observations.
  'AUTHORISED_RUN_HAS_NO_FETCH_OBSERVATION',
  'AUTHORISED_RUN_IDENTITY_CONTAMINATION',
  'AUTHORISED_RUN_FETCH_POLICY_INCOHERENT',

  // Page evidence relations.
  'PAGE_EVIDENCE_FETCH_OUTSIDE_RUN',
  'PAGE_EVIDENCE_ROOT_KEY_MISMATCH',
  'PAGE_EVIDENCE_OVER_NON_SUCCESS_FETCH',
  'PAGE_EVIDENCE_FETCH_LACKS_RESPONSE_DIGEST',
  'PAGE_EVIDENCE_RESPONSE_DIGEST_MALFORMED',
  'PAGE_EVIDENCE_FETCH_LACKS_DURABLE_BYTES',
  'PAGE_EVIDENCE_TEXT_LENGTH_DISAGREES',

  // Exact-document consistency.
  'DURABLE_DOCUMENT_EXTRACTION_CONFLICT',

  // Candidate relations.
  'CANDIDATE_RUN_MISMATCH',
  'CANDIDATE_PAGE_OUTSIDE_RUN',
  'CANDIDATE_ROOT_KEY_MISMATCH',
  'CANDIDATE_RULE_VERSION_INCOHERENT',
  'CANDIDATE_SCORE_REPRESENTATION_INVALID',
  'CANDIDATE_TRACK_PAIR_VIOLATION',
] as const);

export type A3EvidenceRefusalCode = (typeof A3_EVIDENCE_REFUSAL_CODES)[number];

export class A3EvidenceRefusal extends Error {
  constructor(
    readonly code: A3EvidenceRefusalCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'A3EvidenceRefusal';
  }
}

export function refuse(code: A3EvidenceRefusalCode, message: string): never {
  throw new A3EvidenceRefusal(code, message);
}

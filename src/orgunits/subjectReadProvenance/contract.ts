/**
 * TRACK B, B2.5-M1 - THE B-LOCAL, PROVISIONAL DISCOVERY-SUBJECT ACQUISITION
 * COMPANION CONTRACT (`nwf-pe.discovery-subject-acquisition-companion.m1-provisional`),
 * AS DATA.
 *
 * WHAT THIS IS. A companion to ONE already-built snapshot-scope manifest
 * (S0) of ONE focal Discovery Subject. It binds, under one deterministic
 * acquisition digest:
 *   - that manifest's own digest and a RECORDS-ONLY digest of the stored
 *     evidence records in its membership (the record-set digest), which is
 *     independent of the source globals (the validation as-of and the ECHE
 *     row-key state, both bound by the manifest digest), the clock, the
 *     transaction, the findings and everything in this companion;
 *   - how each bounded read of the transaction-bound assembler ended, as the
 *     assembler's loader REPORTED it: the shared-identifier holder query, the
 *     direct incoming relationship-claim query, the source-subject row read
 *     and the incoming-claim review read - each under its named predicate,
 *     its query limit and its included cap;
 *   - how deep each supplied subject's evidence was read;
 *   - whether the B2.1 validator ran, under which rule version, and which
 *     finding partitions were published or withheld by policy;
 *   - the fixed read-protocol, clock, authenticity and permission statements.
 *
 * WHAT THIS IS NOT.
 *   - Not S0 and not a change to it: S0's bytes, digests and refusals are
 *     untouched, and this companion only references its manifest digest.
 *   - Not the B2.4 evidence companion and not part of the B2.4 -> H1
 *     handoff; nothing here is rendered into either.
 *   - Not proof that any query ran. Every observation is ASSEMBLER-REPORTED;
 *     anyone can build a companion with the same digests from the same data.
 *   - Not proof that the source is complete, current or unchanged between
 *     two reads. Equal record-set digests prove only that two SUPPLIED record
 *     sets are equal. A transaction-consistent read is not a durable source
 *     revision, and a server clock reading is neither monotonic, nor a
 *     commit-order marker, nor a freshness guarantee.
 *   - Not signed, not authenticated, not a review-trust, protection,
 *     identity or operational decision. Every permission is the literal NONE.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */

/** The provisional, B-local contract name. Not a cross-track contract. */
export const ACQUISITION_COMPANION_CONTRACT =
  'nwf-pe.discovery-subject-acquisition-companion.m1-provisional';

export const ACQUISITION_COMPANION_CONTRACT_STATUS =
  'B_LOCAL_PROVISIONAL_NOT_A_CROSS_TRACK_CONTRACT';

/** Which assembler, and which of its read and validation protocols, these observations describe. */
export const ASSEMBLER_IDENTITY = Object.freeze({
  implementation: 'B2_5_TRANSACTION_BOUND_DISCOVERY_SUBJECT_SNAPSHOT_ASSEMBLER',
  readProtocolVersion: 'b2-5-p1a-p1e.read.v1',
  validationProtocolVersion: 'b2-5-v1-r1.validation.v1',
  companionBuilderVersion: 'b2-5-m1.companion.v1',
} as const);

/**
 * The record-set rule. The record-set digest is SHA-256 over
 * `<contract>/record-set\n<canonical JSON>` of the record type, record id and
 * full content digest of every membership entry that is a STORED EVIDENCE
 * RECORD - a subject row, an identity claim, a relationship claim, a review
 * or a review attestation reference - and of nothing else. Every
 * SOURCE_GLOBAL entry is excluded: VALIDATION_AS_OF is a clock reading and
 * ECHE_ROW_KEY_EXISTENCE is a status of another table's keys, and neither is
 * a stored evidence record. Both stay bound by the S0 manifest digest and,
 * through it, by the acquisition digest. A membership type in neither list
 * is refused, never silently included.
 */
export const RECORD_SET_RULE = Object.freeze({
  rule: 'b2-5-m1.record-set.v1',
  entryFields: Object.freeze(['contentDigest', 'recordId', 'recordType'] as const),
  ordering: 'RECORD_TYPE_THEN_RECORD_ID_ASCENDING_INPUT_ORDER_IGNORED',
  includedRecordTypes: Object.freeze([
    'SUBJECT',
    'IDENTITY_CLAIM',
    'RELATIONSHIP_CLAIM',
    'REVIEW',
    'REVIEW_ATTESTATION_REFERENCE',
  ] as const),
  excludedRecordTypes: Object.freeze(['SOURCE_GLOBAL'] as const),
  excludedMembership: Object.freeze([
    'SOURCE_GLOBAL:ECHE_ROW_KEY_EXISTENCE',
    'SOURCE_GLOBAL:VALIDATION_AS_OF',
  ] as const),
  sourceGlobalBinding: 'BOUND_BY_THE_S0_MANIFEST_DIGEST_AND_THROUGH_IT_BY_THE_ACQUISITION_DIGEST',
  meaning: 'EQUALITY_OF_THE_SUPPLIED_RECORD_SETS_ONLY_NOT_AN_UNCHANGED_DATABASE_BETWEEN_READS',
} as const);
export type StoredRecordType = (typeof RECORD_SET_RULE.includedRecordTypes)[number];

/** The S0 membership record types, restated (this module reads S0 output, it defines none). */
export const MEMBERSHIP_RECORD_TYPES = [
  'SUBJECT',
  'IDENTITY_CLAIM',
  'RELATIONSHIP_CLAIM',
  'REVIEW',
  'REVIEW_ATTESTATION_REFERENCE',
  'SOURCE_GLOBAL',
] as const;
export type MembershipRecordType = (typeof MEMBERSHIP_RECORD_TYPES)[number];
export const SOURCE_GLOBAL_RECORD_IDS = ['ECHE_ROW_KEY_EXISTENCE', 'VALIDATION_AS_OF'] as const;

/**
 * The named read predicates, versioned. Each states exactly which rows its
 * statement matches; an outcome is a statement about that predicate within
 * one transaction snapshot, and about nothing else.
 */
export const READ_PREDICATES = Object.freeze({
  holders: 'b2-5-p1b.other-subjects-with-an-external-identifier-claim-equal-to-a-focal-one.v1',
  incoming: 'b2-5-p1c.other-subjects-relationship-claims-targeting-the-focal-subject.v1',
  sourceRows: 'b2-5-p1d.included-incoming-claim-source-subject-rows-by-exact-id.v1',
  claimReviewRead:
    'b2-5-p1e.stored-reviews-and-attestation-references-of-included-claims-the-graph-lacks.v1',
} as const);

/** The holder and incoming statements' bounds: one sentinel row beyond the included cap. */
export const HOLDER_QUERY_LIMIT = 21;
export const HOLDER_INCLUDED_CAP = 20;
export const INCOMING_QUERY_LIMIT = 21;
export const INCOMING_INCLUDED_CAP = 20;

/**
 * The review statement's bound, restated from the loader (it does not report
 * it): more matching rows than this and the WHOLE read throws - it never
 * truncates - so no result, and no companion, exists for such a read.
 */
export const REVIEW_STATEMENT_ROW_BOUND = 5000;

/** The loader outcomes and bases this companion accepts, exactly as the loader reports them. */
export const LOADER_ENUMERATION_OUTCOMES = ['EXHAUSTIVE', 'TRUNCATED', 'UNKNOWN'] as const;
export type LoaderEnumerationOutcome = (typeof LOADER_ENUMERATION_OUTCOMES)[number];
export const HOLDER_BASES = [
  'NO_FOCAL_EXTERNAL_IDENTIFIER',
  'QUERY_RETURNED_FEWER_ROWS_THAN_ITS_LIMIT',
  'QUERY_RETURNED_A_ROW_BEYOND_THE_INCLUDED_CAP',
  'QUERY_RESULT_NOT_DISTINCT_ORDERED_AND_BOUNDED',
] as const;
export const INCOMING_BASES = [
  'QUERY_RETURNED_FEWER_ROWS_THAN_ITS_LIMIT',
  'QUERY_RETURNED_A_ROW_BEYOND_THE_INCLUDED_CAP',
  'QUERY_RESULT_NOT_DISTINCT_ORDERED_BOUNDED_AND_DIRECT',
] as const;
export const LOADER_SOURCE_ROW_OUTCOMES = [
  'NONE_REQUESTED',
  'EVERY_REQUESTED_ROW_READ',
  'REQUESTED_ROWS_ABSENT',
  'UNKNOWN',
] as const;
export const LOADER_REVIEW_READ_OUTCOMES = [
  'NONE_REQUESTED',
  'EVERY_MATCHING_ROW_READ',
  'UNKNOWN',
] as const;

/**
 * How a bounded enumeration ended, as this companion states it. NOT_REQUESTED
 * (no statement was sent: its predicate has no member) and EMPTY (a statement
 * was sent and matched nothing) are kept apart from each other and from
 * EXHAUSTIVE (fewer rows than the limit, at least one); TRUNCATED means at
 * least one matching row exists beyond the included cap and was never
 * enumerated; UNKNOWN supports no conclusion and includes nothing.
 */
export const ENUMERATION_STATUSES = [
  'NOT_REQUESTED',
  'EMPTY_AS_OF_SNAPSHOT',
  'EXHAUSTIVE_AS_OF_SNAPSHOT',
  'TRUNCATED_AT_INCLUDED_CAP',
  'UNKNOWN',
] as const;
export type EnumerationStatus = (typeof ENUMERATION_STATUSES)[number];

/** What lies beyond the included rows, for each enumeration status. */
export const BEYOND_INCLUDED: { readonly [K in EnumerationStatus]: string } = Object.freeze({
  NOT_REQUESTED: 'PREDICATE_HAS_NO_MEMBER_NO_STATEMENT_SENT',
  EMPTY_AS_OF_SNAPSHOT: 'NO_MATCHING_ROW_IN_THIS_SNAPSHOT_UNDER_THE_PREDICATE',
  EXHAUSTIVE_AS_OF_SNAPSHOT: 'NO_FURTHER_MATCHING_ROW_IN_THIS_SNAPSHOT_UNDER_THE_PREDICATE',
  TRUNCATED_AT_INCLUDED_CAP: 'AT_LEAST_ONE_FURTHER_MATCHING_ROW_EXISTS_NEVER_ENUMERATED',
  UNKNOWN: 'UNKNOWN_NOTHING_INCLUDED',
});

/** How one source subject of an included incoming claim was acquired. */
export const SOURCE_SUBJECT_ACQUISITIONS = [
  'HELD_BY_BASE_GRAPH',
  'ROW_ONLY_READ_BY_EXACT_ID',
  'NOT_READ_ABSENT_FROM_SNAPSHOT',
  'NOT_READ_RESULT_UNKNOWN',
] as const;
export type SourceSubjectAcquisition = (typeof SOURCE_SUBJECT_ACQUISITIONS)[number];

/**
 * How much of one SUPPLIED subject's own evidence was read. None of these is
 * "completely examined": every non-focal depth omits evidence the loader
 * never reads, and even the focal depth omits other subjects' claims about it
 * beyond the incoming report.
 */
export const EVIDENCE_DEPTHS = Object.freeze({
  FOCAL_SUBJECT:
    'ROW_EVERY_IDENTITY_CLAIM_EVERY_OUTGOING_RELATIONSHIP_CLAIM_AND_THEIR_REVIEWS_READ',
  PART_OF_CLOSURE_MEMBER:
    'ROW_EVERY_IDENTITY_CLAIM_ITS_PART_OF_RELATIONSHIP_CLAIMS_ONLY_AND_THEIR_REVIEWS_READ',
  OUTSIDE_PART_OF_CLOSURE:
    'ROW_EVERY_IDENTITY_CLAIM_AND_THEIR_REVIEWS_READ_NO_RELATIONSHIP_CLAIM_READ',
  ROW_ONLY: 'SUBJECT_ROW_ONLY_NO_CLAIM_RELATIONSHIP_REVIEW_OR_ATTESTATION_READ',
} as const);
export type EvidenceDepth = keyof typeof EVIDENCE_DEPTHS;

/**
 * How the stored reviews of one included incoming claim were read.
 *   NOT_REQUESTED           - the claim is held by the base graph; its reviews
 *                             came with the base graph's own review statement;
 *   ZERO_MATCHING_ROWS      - requested; the statement returned no review;
 *   COMPLETE_AS_OF_SNAPSHOT - requested; every stored review of it and every
 *                             attestation reference of those reviews in this
 *                             snapshot was returned. Not the latest review
 *                             beyond the snapshot, not a verified signature,
 *                             not a trusted reviewer;
 *   UNKNOWN                 - requested; the result was refused by the
 *                             loader's guard and nothing was used.
 * A read beyond REVIEW_STATEMENT_ROW_BOUND is REFUSED by throwing, so it never
 * reaches a companion and has no status here.
 */
export const REVIEW_READ_STATUSES = [
  'NOT_REQUESTED',
  'ZERO_MATCHING_ROWS',
  'COMPLETE_AS_OF_SNAPSHOT',
  'UNKNOWN',
] as const;
export type ReviewReadStatus = (typeof REVIEW_READ_STATUSES)[number];

/** The validator rule version a validated read may bind. */
export const ACCEPTED_VALIDATOR_RULE_VERSION = 'discovery-identity-rules-v1';

/** The V1 publication policy, as fixed statements. */
export const VALIDATION_POLICY = Object.freeze({
  validator: 'B2_1_VALIDATE_IDENTITY_GRAPH_UNMODIFIED',
  inputs:
    'EXACTLY_THE_RECORDS_SUPPLIED_TO_S0_THE_PRESENT_ECHE_KEYS_AND_THE_ONE_POST_SNAPSHOT_AS_OF',
  partitions: Object.freeze({
    INPUT: 'PUBLISHED_IN_THE_MANIFEST_ITS_INPUTS_ARE_EXACT',
    FOCAL_RECORD: 'PUBLISHED_IN_THE_MANIFEST_COVERAGE_IS_THE_WEAKEST_FOCAL_RULE_DEPENDENCY',
    NEIGHBOUR_RECORD: 'WITHHELD_BY_POLICY_PARTIAL_GRAPH_DIAGNOSTICS_UNRELIABLE',
    UNSUPPLIED_RECORD: 'WITHHELD_BY_POLICY_UNTRUSTED_DIAGNOSTICS',
  }),
  withheldDiagnostics:
    'BOUND_HERE_BY_DIGEST_FOR_AUDIT_ONLY_UNTRUSTED_NOT_FINDINGS_NOT_IN_THE_MANIFEST',
  absence: 'NO_PUBLISHED_FINDING_IS_NOT_PROOF_THAT_ANY_SUBJECT_IS_VALID',
  execution: 'ASSEMBLER_REPORTED_NOT_INDEPENDENTLY_VERIFIED',
} as const);

/** The fixed read-protocol statements the assembler's read keeps. */
export const READ_PROTOCOL = Object.freeze({
  connection: 'ONE_CALLER_INJECTED_CONNECTION_OWNED_FOR_THE_ASSEMBLY',
  transaction:
    'REPEATABLE_READ_READ_ONLY_BEGUN_BY_THE_ASSEMBLER_SERVER_STATE_CHECKED_AT_START_AND_END',
  transactionEnd: 'ROLLED_BACK',
  consistency: 'TRANSACTION_CONSISTENT_READ_NOT_A_DURABLE_SOURCE_REVISION',
  transactionSnapshot: 'TRANSACTION_LOCAL_COMPARED_NOT_EXPORTED_NOT_A_SOURCE_REVISION',
  durableSourceRevision: 'NONE',
  loaderLimitations: Object.freeze([
    'ATTESTATION_PAYLOADS_SIGNATURES_ENVIRONMENT_AND_NONCE_COUNTS_NOT_REPRESENTED',
    'INCOMING_RELATIONSHIP_CLAIMS_CAPPED_OVERFLOW_DETECTED_NEVER_ENUMERATED',
    'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_STORED_RECORDS_ONLY_NOT_VERIFIED_NOT_TRUSTED_NOT_PROVEN_LATEST',
    'INCOMING_RELATIONSHIP_SOURCE_SUBJECT_ROWS_ONLY_THEIR_CLAIMS_RELATIONSHIPS_REVIEWS_NOT_READ',
    'NEIGHBOUR_RELATIONSHIPS_LIMITED_TO_THE_PART_OF_CHAIN',
    'PROTECTED_REGISTRY_NOT_CONSULTED',
    'RECORD_CREATION_INSTANTS_NOT_REPRESENTED',
    'SHARED_IDENTIFIER_HOLDERS_CAPPED_OVERFLOW_DETECTED_NEVER_ENUMERATED',
  ] as const),
} as const);

/** The fixed clock statements (V1-R1). The as-of value itself is bound by the S0 manifest. */
export const CLOCK_TREATMENT = Object.freeze({
  asOfSource:
    'ONE_SERVER_CLOCK_TIMESTAMP_READING_ON_THE_READ_CONNECTION_AFTER_THE_SNAPSHOT_TAKING_STATEMENT',
  asOfBinding: 'BOUND_BY_THE_S0_MANIFEST_AS_VALIDATION_AS_OF_EXCLUDED_FROM_THE_RECORD_SET_DIGEST',
  serverClock: 'WALL_CLOCK_NOT_MONOTONIC_MAY_STEP_BACKWARDS',
  commitOrder: 'NOT_A_COMMIT_ORDER_MARKER',
  freshness: 'NOT_A_FRESHNESS_GUARANTEE',
  backwardStepResidual:
    'A_SERVER_CLOCK_STEPPING_BACKWARDS_CAN_MAKE_A_VISIBLE_RECORD_APPEAR_FUTURE_DATED',
} as const);

/**
 * THE FIXED AUTHENTICITY BOUNDARY. Each state has ONE value; no code path in
 * this module can emit a stronger one.
 */
export const AUTHENTICITY = Object.freeze({
  sourceCompleteness: 'NOT_PROVEN',
  sourceFreshness: 'NOT_PROVEN',
  exportAuthentication: 'UNAUTHENTICATED',
  reviewerTrust: 'NONE_ESTABLISHED',
  signatureVerification: 'NOT_PERFORMED',
  latestReview: 'NOT_PROVEN',
  reviewHeadAsOfSnapshot: 'NOT_STATED',
  protectionCheck: 'NOT_CONSULTED',
  protectionVerdict: 'UNKNOWN',
  observations: 'ASSEMBLER_REPORTED_NOT_INDEPENDENTLY_AUTHENTICATED',
  queryExecution: 'NOT_PROVEN_BY_ANY_DIGEST',
  digests: 'UNSIGNED_RECOMPUTABLE_BY_ANYONE_NOT_AUTHENTICATORS',
  durableSourceRevision: 'NONE',
  handoff: 'NOT_PART_OF_THE_B2_4_EVIDENCE_COMPANION_OR_THE_H1_HANDOFF',
} as const);

/** The closed permission object, restated: every capability is NONE, by type and by value. */
export const PERMISSION_CAPABILITIES = [
  'research',
  'canonicalIssuance',
  'canonicalLinking',
  'qualification',
  'publication',
  'outreach',
  'opportunityCreation',
  'distributionAction',
  'suppressionClearance',
] as const;
export type PermissionCapability = (typeof PERMISSION_CAPABILITIES)[number];
export type Permissions = { readonly [K in PermissionCapability]: 'NONE' };

export const PERMISSIONS: Permissions = Object.freeze({
  research: 'NONE',
  canonicalIssuance: 'NONE',
  canonicalLinking: 'NONE',
  qualification: 'NONE',
  publication: 'NONE',
  outreach: 'NONE',
  opportunityCreation: 'NONE',
  distributionAction: 'NONE',
  suppressionClearance: 'NONE',
});

export const CANONICAL_ISSUER = Object.freeze({
  producerMayIssue: 'NONE',
  identifiersIssuedHere: 'NONE',
} as const);

/** Why a companion was refused: malformed, tampered or self-contradicting input. */
export const COMPANION_REFUSAL_CODES = [
  'MANIFEST_SHAPE_UNSUPPORTED',
  'MANIFEST_DIGEST_INCONSISTENT',
  'MANIFEST_NOT_REPRODUCED',
  'DUPLICATE_RECORD_IDENTITY',
  'CONFLICTING_RECORD_ENTRY',
  'OBSERVATION_SHAPE_UNSUPPORTED',
  'OBSERVATION_MISSING',
  'READ_PROTOCOL_MISMATCH',
  'OBSERVATION_INCONSISTENT',
  'OBSERVATION_INCONSISTENT_WITH_MANIFEST',
] as const;
export type CompanionRefusalCode = (typeof COMPANION_REFUSAL_CODES)[number];

export class AcquisitionCompanionRefusal extends Error {
  constructor(
    readonly code: CompanionRefusalCode,
    readonly detail: string,
  ) {
    super(`acquisition companion refused: ${code} (${detail})`);
    this.name = 'AcquisitionCompanionRefusal';
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HEX64 = /^[0-9a-f]{64}$/;

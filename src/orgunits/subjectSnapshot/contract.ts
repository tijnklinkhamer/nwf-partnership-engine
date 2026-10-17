/**
 * TRACK B, B2.5-S0 - THE B-LOCAL, PROVISIONAL SUBJECT SNAPSHOT-SCOPE
 * MANIFEST CONTRACT (`nwf-pe.discovery-subject-snapshot-scope-manifest.s0-provisional`),
 * AS DATA.
 *
 * WHAT THIS IS. A content-bound manifest over ONE caller-supplied set of
 * records about ONE Discovery Subject: which records the set holds, a
 * canonical digest of each one's content, the direct-neighbourhood scope the
 * caller DECLARES it examined, the validation inputs and findings it
 * supplied, its review chains, and the (never consulted) protection status -
 * all committed by one deterministic manifest digest.
 *
 * WHAT THIS IS NOT.
 *   - Not a cross-track contract and not ratified. It is distinct from the
 *     B2.4 companion evidence contract and from the I0 compatibility
 *     contract, neither of which it reads, renders or emits.
 *   - Not proof that the supplied set holds every relevant database record.
 *     The manifest can confirm that every SUPPLIED record was content-bound;
 *     it cannot see a record nobody supplied. Source completeness, the
 *     source snapshot, freshness and export authenticity stay unproven - by
 *     type: `STATES` below has no member that says otherwise.
 *   - Not a durable source revision, a replay-resistant assertion or a
 *     signed export. Anyone can recompute every digest it carries.
 *   - Not a protection verdict. The protected-cohort registry is never read.
 *   - Not a permission. Every capability is the literal `NONE`.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */

/** The provisional, B-local contract name. Not a cross-track contract. */
export const SNAPSHOT_SCOPE_CONTRACT =
  'nwf-pe.discovery-subject-snapshot-scope-manifest.s0-provisional';

export const SNAPSHOT_SCOPE_CONTRACT_STATUS = 'B_LOCAL_PROVISIONAL_NOT_A_CROSS_TRACK_CONTRACT';

/** The only scope S0 can declare: one subject's direct neighbourhood, nothing transitive. */
export const SCOPE_KIND = 'DECLARED_DIRECT_NEIGHBOURHOOD';

/** How the supplied set came into being. Recorded, never verified. */
export const INPUT_ORIGINS = ['SYNTHETIC_IN_MEMORY', 'CALLER_SUPPLIED_UNVERIFIED'] as const;
export type InputOrigin = (typeof INPUT_ORIGINS)[number];

export const RELATIONSHIP_DIRECTIONS = ['OUTGOING', 'INCOMING'] as const;
export type RelationshipDirection = (typeof RELATIONSHIP_DIRECTIONS)[number];

/**
 * Every category the declared direct-neighbourhood scope is made of. The
 * caller states, for each, whether it REPRESENTED it, knows it is
 * INCOMPLETE, or does not know. A declaration the supplied input itself
 * contradicts is refused; one it cannot check stays a declaration.
 */
export const SCOPE_CATEGORIES = [
  'FOCAL_SUBJECT',
  'FOCAL_IDENTITY_CLAIMS',
  'OUTGOING_RELATIONSHIP_CLAIMS',
  'INCOMING_RELATIONSHIP_CLAIMS',
  'REFERENCED_RECORDS',
  'SHARED_IDENTIFIER_HOLDERS',
  'RECORD_SCOPED_FINDINGS',
  'INPUT_SCOPED_FINDINGS',
  'NEIGHBOUR_RECORD_FINDINGS',
  'REVIEW_RECORDS',
  'REVIEW_ATTESTATION_REFERENCES',
  'VALIDATION_INPUTS',
  'SOURCE_GLOBALS',
  'PROTECTION_STATUS',
] as const;
export type ScopeCategory = (typeof SCOPE_CATEGORIES)[number];

export const CATEGORY_DECLARATIONS = ['REPRESENTED', 'INCOMPLETE', 'UNKNOWN'] as const;
export type CategoryDeclaration = (typeof CATEGORY_DECLARATIONS)[number];

/** How a bounded enumeration ended. Reaching a declared bound is never exhaustive. */
export const ENUMERATIONS = ['EXHAUSTIVE_AS_DECLARED', 'TRUNCATED', 'UNKNOWN'] as const;
export type Enumeration = (typeof ENUMERATIONS)[number];

/** What the caller says about the validator run. Never verified here. */
export const VALIDATOR_EXECUTIONS = ['CALLER_ASSERTED_RAN', 'NOT_RUN', 'UNKNOWN'] as const;
export type ValidatorExecution = (typeof VALIDATOR_EXECUTIONS)[number];

/** The only protection-check status S0 may state. The protected registry is never read. */
export const PROTECTION_CHECK = 'NOT_CONSULTED';
export const PROTECTION_VERDICT = 'UNKNOWN';

export const RECORD_TYPES = [
  'SUBJECT',
  'IDENTITY_CLAIM',
  'RELATIONSHIP_CLAIM',
  'REVIEW',
  'REVIEW_ATTESTATION_REFERENCE',
  'SOURCE_GLOBAL',
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** Each record's provenance category. "AS_SUPPLIED" everywhere: none is verified here. */
export const RECORD_PROVENANCE: { readonly [K in RecordType]: string } = Object.freeze({
  SUBJECT: 'REGISTRY_RECORD_AS_SUPPLIED',
  IDENTITY_CLAIM: 'REGISTRY_RECORD_AS_SUPPLIED',
  RELATIONSHIP_CLAIM: 'REGISTRY_RECORD_AS_SUPPLIED',
  REVIEW: 'REGISTRY_RECORD_AS_SUPPLIED',
  REVIEW_ATTESTATION_REFERENCE: 'ATTESTATION_REFERENCE_AS_SUPPLIED',
  SOURCE_GLOBAL: 'SOURCE_GLOBAL_AS_SUPPLIED',
});

/** The validation-relevant source globals S0 can carry, by closed key. */
export const SOURCE_GLOBAL_KEYS = ['ECHE_ROW_KEY_EXISTENCE', 'VALIDATION_AS_OF'] as const;
export type SourceGlobalKey = (typeof SOURCE_GLOBAL_KEYS)[number];

/**
 * THE INTEGRITY AND COMPLETENESS STATES, as separate, non-overlapping
 * concepts. Each has exactly the values S0 can honestly reach; the four
 * source/export states have ONE value each, so no S0 code path can emit a
 * stronger one. There is deliberately no overall "complete" state.
 */
export const STATES = Object.freeze({
  /** The input had the closed shape. A refused input produces no manifest at all. */
  shapeValidity: ['SHAPE_VALID'],
  /** Whether the carried digests are what the carried content recomputes to. */
  contentDigestConsistency: ['CONSISTENT', 'INCONSISTENT'],
  /** Whether the caller declared every scope category REPRESENTED over what it supplied. */
  declaredScopeCoverage: ['GAPS_DECLARED', 'NO_GAP_DECLARED_OVER_SUPPLIED_INPUT'],
  /** References inside the supplied set to records or state it does not hold. */
  unresolvedSourceOmissions: ['PRESENT', 'NONE_DETECTED_IN_SUPPLIED_INPUT'],
  sourceSnapshotVerification: ['NOT_VERIFIED'],
  sourceCompleteness: ['NOT_PROVEN'],
  sourceFreshness: ['NOT_PROVEN'],
  exportAuthentication: ['UNAUTHENTICATED'],
} as const);

/**
 * THE CLOSED PERMISSION OBJECT. Every capability is `NONE`, by type and by
 * value - the same capability list as the B2.4 companion, restated rather
 * than imported so this module stays outside that module's boundary.
 */
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

/** What every manifest says it cannot prove. Fixed statements, never computed. */
export const LIMITATIONS = Object.freeze({
  scope: 'DECLARED_DIRECT_NEIGHBOURHOOD_NOT_TRANSITIVE_PARENTAGE',
  membership: 'SUPPLIED_SET_ONLY_NOT_EVERY_RELEVANT_DATABASE_RECORD',
  absentRelationship: 'NOT_EVIDENCE_OF_NO_PARENT_OR_INDEPENDENCE',
  emptyFindings: 'NOT_PROOF_THAT_VALIDATORS_RAN_OVER_COMPLETE_SOURCE_DATA',
  sourceGlobals: 'SUPPLIED_VALUES_NOT_PROVEN_COMPLETELY_RETRIEVED',
  reviewChains: 'A_SUPPLIED_HEAD_IS_NOT_PROOF_OF_THE_LATEST_REVIEW',
  attestationReferences: 'REFERENCES_ONLY_NO_SIGNATURE_VERIFIED_NO_REVIEWER_TRUST',
  sourceRevision: 'NONE_NOT_A_DURABLE_SOURCE_REVISION',
  freshness: 'NOT_PROVEN_NO_INSTANT_IS_COMMITTED',
  replay: 'NOT_REPLAY_RESISTANT',
  manifestDigest: 'RECOMPUTABLE_BY_ANYONE_NOT_AN_AUTHENTICATOR',
  protection: 'PROTECTED_REGISTRY_NOT_CONSULTED',
  reference: 'A_REFERENCE_SET_IS_CALLER_SUPPLIED_ITS_INDEPENDENCE_IS_NOT_PROVEN',
} as const);

/** Who may issue canonical identifiers, as this manifest states it: never its producer. */
export const CANONICAL_ISSUER = Object.freeze({
  producerMayIssue: 'NONE',
  identifiersIssuedHere: 'NONE',
} as const);

/** Bounds. Larger is refused, never truncated. */
export const MAX_RECORDS = 5000;
export const MAX_FINDINGS = 2000;
export const MAX_SHARED_IDENTIFIER_HOLDERS = 64;
export const MAX_ECHE_ROW_KEYS = 5000;

/** Why an input was refused: malformed or self-contradicting INPUT, never a subject's state. */
export const REFUSAL_CODES = [
  'CONTRACT_UNKNOWN',
  'INPUT_SHAPE_UNSUPPORTED',
  'RECORD_SHAPE_UNSUPPORTED',
  'FINDING_SHAPE_UNSUPPORTED',
  'SOURCE_GLOBAL_SHAPE_UNSUPPORTED',
  'DUPLICATE_RECORD_IDENTITY',
  'CONFLICTING_RECORD_ENTRY',
  'FOCAL_SUBJECT_MISSING',
  'SCOPE_DECLARATION_INCONSISTENT',
  'ENUMERATION_NOT_EXHAUSTIVE',
  'PROTECTION_STATUS_UNSUPPORTED',
  'CANONICAL_IDENTIFIER_INADMISSIBLE',
  'BOUND_EXCEEDED',
] as const;
export type SnapshotScopeRefusalCode = (typeof REFUSAL_CODES)[number];

export class SnapshotScopeRefusal extends Error {
  constructor(
    readonly code: SnapshotScopeRefusalCode,
    readonly detail: string,
  ) {
    super(`subject snapshot-scope manifest refused: ${code} (${detail})`);
    this.name = 'SnapshotScopeRefusal';
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HEX64 = /^[0-9a-f]{64}$/;
export const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
export const FINDING_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
export const RULE_VERSION = /^[a-z0-9][a-z0-9.-]{0,63}$/;

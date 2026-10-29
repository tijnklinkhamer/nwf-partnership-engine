/**
 * TRACK B, B2.4-R1a - THE B-LOCAL, PROVISIONAL SUBJECT-EVIDENCE CONTRACT
 * (`nwf-pe.discovery-subject-evidence.v1-provisional`), AS DATA.
 *
 * WHAT THIS IS. A companion EVIDENCE document for one Discovery Subject: the
 * canonical B2.1 records, the stored B2.3 review attestations exactly as
 * signed, and the B2.2/B2.3 derived identity state - kept apart, so a later
 * consumer can re-derive the state from the records instead of trusting it.
 *
 * WHAT THIS IS NOT.
 *   - Not a ratified shared interface. ADR 0021 RC2 s2 names the shared
 *     handoff `nwf-pe.discovery-identity-handoff.v1`; this module neither
 *     renames, replaces nor emits it, and no Track C consumer is claimed to
 *     accept this document.
 *   - Not a second canonical identity contract. The Discovery Subject UUID is
 *     a B-local evidence-container id (ADR 0020 s12). Nothing here issues,
 *     links or reserves a canonical identifier, or asserts that two actors
 *     are one.
 *   - Not a signed export, and NOT PROOF OF COMPLETENESS OR FRESHNESS. Each
 *     B2.3 Ed25519 signature establishes authority over ONE review decision
 *     and the evidence it was bound to. Nothing signs this document, so
 *     nothing proves it holds every later claim, review, contradiction or
 *     revocation. `producedAt` and the source revision are informational; a
 *     producer-computed digest is not an external trust anchor; the embedded
 *     public trust context authorises nothing, least of all itself; and every
 *     producer-derived verdict is advisory - a consumer must re-verify. The
 *     closed `LIMITATIONS` below say so inside every document, and the
 *     capabilities a consumer would need instead (independently approved
 *     trust distribution and freshness / completeness evidence) are NOT
 *     AUTHORISED in R1a.
 *   - Not a permission. Every capability in `PERMISSIONS` is the literal
 *     `NONE`, and `researchAuthority.granted` is the literal `false`.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */

/** The provisional, B-local contract name. Never a ratified shared interface. */
export const SUBJECT_EVIDENCE_CONTRACT = 'nwf-pe.discovery-subject-evidence.v1-provisional';

export const SUBJECT_EVIDENCE_CONTRACT_STATUS = 'B_LOCAL_PROVISIONAL_NOT_RATIFIED';

/** The RC2 shared handoff this document accompanies. Referenced by name, never emitted here. */
export const RC2_SHARED_HANDOFF_CONTRACT = 'nwf-pe.discovery-identity-handoff.v1';

/** The only source repository whose records this projection reads. */
export const ENGINE_SOURCE_REPOSITORY = 'nwf-partnership-engine';

/**
 * How the caller read the graph. Recorded, never trusted: no classification
 * makes the document complete or current.
 */
export const READ_CONSISTENCY_CLASSES = [
  /** Every query of the load ran inside one REPEATABLE READ (or stricter) transaction. */
  'SINGLE_SNAPSHOT_TRANSACTION',
  /** Several statements, each at READ COMMITTED: rows may come from different instants. */
  'MULTI_STATEMENT_READ_COMMITTED',
  /** Built in memory by a test; no database was read. */
  'SYNTHETIC_IN_MEMORY',
] as const;
export type ReadConsistencyClass = (typeof READ_CONSISTENCY_CLASSES)[number];

/**
 * What the caller asserts about the graph's extent. `TRUNCATED` is refused:
 * a judgement is never made over a silently partial graph (store.ts header).
 */
export const NEIGHBOURHOOD_EXTENTS = ['BOUNDED_NEIGHBOURHOOD_LOADED', 'TRUNCATED'] as const;
export type NeighbourhoodExtent = (typeof NEIGHBOURHOOD_EXTENTS)[number];

/** The trust scope the caller says it projects under; it must equal the trust set's own. */
export const AUTHORITY_SCOPES = ['OPERATIONAL', 'TEST_ONLY'] as const;
export type AuthorityScope = (typeof AUTHORITY_SCOPES)[number];

/** The explicitly supplied, exactly-keyed context of one projection. */
export interface SubjectEvidenceContext {
  readonly contract: typeof SUBJECT_EVIDENCE_CONTRACT;
  /** Must equal the graph's focal subject. */
  readonly subjectId: string;
  readonly sourceRepository: typeof ENGINE_SOURCE_REPOSITORY;
  /** A 40-hex git commit, or null. INFORMATIONAL: it proves nothing about the records. */
  readonly sourceRevision: string | null;
  /** The `subject_review_environment` id the attestations were loaded with; null when unknown. */
  readonly engineEnvironmentId: string | null;
  readonly readConsistency: ReadConsistencyClass;
  readonly neighbourhood: NeighbourhoodExtent;
  /** ISO-8601 ms UTC. INFORMATIONAL: never a freshness proof. */
  readonly producedAt: string;
  readonly authorityScope: AuthorityScope;
}

export const CONTEXT_KEYS = [
  'authorityScope',
  'contract',
  'engineEnvironmentId',
  'neighbourhood',
  'producedAt',
  'readConsistency',
  'sourceRepository',
  'sourceRevision',
  'subjectId',
] as const;

/**
 * THE CLOSED PERMISSION OBJECT. Every capability is `NONE`, by type and by
 * value. There is no boolean, no partial grant and no field a later reader
 * could read as "allowed".
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

/** Who may issue canonical identifiers, as this document states it: never its producer. */
export const CANONICAL_ISSUER = Object.freeze({
  producerMayIssue: 'NONE',
  issuingAuthority: 'OPERATOR_IDENTITY_REGISTER_PER_RC2_S1',
  identifiersIssuedHere: 'NONE',
} as const);

/** RC2 s7 / B2.1: the source model cannot establish legal independence. */
export const LEGAL_INDEPENDENCE = 'UNKNOWN';

/**
 * THE LIMITATIONS EVERY DOCUMENT CARRIES. Each is a fixed statement about
 * what the document cannot prove, so no reader can mistake it for more.
 */
export const LIMITATIONS = Object.freeze({
  documentSignature: 'NONE_NOT_A_SIGNED_EXPORT',
  completeness: 'NOT_PROVEN_AN_UNSIGNED_EXPORT_IS_NOT_PROOF_OF_COMPLETENESS',
  freshness: 'NOT_PROVEN_PRODUCED_AT_IS_INFORMATIONAL',
  snapshotMonotonicity: 'NOT_SUFFICIENT_FOR_COMPLETENESS',
  reviewSignatures: 'AUTHORITY_OVER_INDIVIDUAL_DECISIONS_ONLY',
  producerDigests: 'NOT_AN_EXTERNAL_TRUST_ANCHOR',
  embeddedTrustContext: 'DESCRIPTIVE_ONLY_AUTHORISES_NOTHING',
  producerAssessment: 'ADVISORY_CONSUMER_MUST_REVERIFY',
  recordedTimestamps: 'DATABASE_SOURCED_UNSIGNED',
  consumerPrerequisites:
    'INDEPENDENT_TRUST_DISTRIBUTION_AND_FRESHNESS_COMPLETENESS_EVIDENCE_NOT_AUTHORISED_IN_R1A',
} as const);

/**
 * Bounds. Larger is refused, never truncated. Subjects and rows mirror the
 * store's own graph bounds; the document bound keeps one projection small.
 */
export const MAX_SUBJECTS = 64;
export const MAX_RECORDS = 5000;
export const MAX_ATTESTATIONS = 2000;
export const MAX_FINDINGS = 2000;
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

/** Why a projection was refused: malformed or inconsistent INPUT, never a subject's unresolved claims. */
export const REFUSAL_CODES = [
  'CONTRACT_UNKNOWN',
  'CONTEXT_SHAPE_INVALID',
  'INPUT_SHAPE_UNSUPPORTED',
  'RECORD_SHAPE_UNSUPPORTED',
  'RECORD_CONTENT_INADMISSIBLE',
  'SUBJECT_IDENTIFIER_INCONSISTENT',
  'GRAPH_TRUNCATED',
  'REQUIRED_EVIDENCE_MISSING',
  'DUPLICATE_RECORD_ID',
  'ATTESTATION_REFERENCE_INCONSISTENT',
  'ATTESTATION_RECORD_MALFORMED',
  'ENVIRONMENT_INCONSISTENT',
  'REVIEW_AUTHORITY_UNASSESSED',
  'TRUST_CONTEXT_UNSUPPORTED',
  'TRUST_SCOPE_MISMATCH',
  'BOUND_EXCEEDED',
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

export class SubjectEvidenceRefusal extends Error {
  constructor(
    readonly code: RefusalCode,
    readonly detail: string,
  ) {
    super(`subject evidence projection refused: ${code} (${detail})`);
    this.name = 'SubjectEvidenceRefusal';
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HEX64 = /^[0-9a-f]{64}$/;
export const GIT_REVISION = /^[0-9a-f]{40}$/;
export const INSTANT_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

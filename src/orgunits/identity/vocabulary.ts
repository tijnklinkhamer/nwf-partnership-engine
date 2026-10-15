/**
 * TRACK B, B2.1 - THE CLOSED VOCABULARIES AND RECORD SHAPES OF
 * DISCOVERY-SUBJECT IDENTITY.
 *
 * Mirrors migration 0013 value for value; the integration test proves the
 * database refuses everything outside these lists. PURE: no socket, no
 * database, no filesystem, no environment, no clock.
 *
 * Nothing here is a verdict. A kind is a CLAIM or a reviewed label, never a
 * legal form; a relationship is an ASSERTION, never a fact; a review is a
 * trusted path's decision, never research authority. See ADR 0019.
 */

export const DISCOVERY_IDENTITY_RULE_VERSION = 'discovery-identity-rules-v1';

/** Organisational kinds. `UNCERTAIN` is first-class, never a placeholder for a guess. */
export const SUBJECT_KINDS = [
  'FACULTY_SCHOOL_DEPARTMENT',
  'INTERNAL_STUDENT_GROUP',
  'INDEPENDENT_STUDENT_ASSOCIATION',
  'NETWORK_LOCAL_CHAPTER',
  'ORGANISATION_NETWORK',
  'INDEPENDENT_COMMUNITY',
  'OTHER_ORGANISATIONAL_UNIT',
  'UNCERTAIN',
] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

/**
 * Kinds that are, by what they are, PART OF something larger: a faculty
 * belongs to an institution, an internal group to a faculty or institution,
 * an organisational unit to its organisation. A subject carrying one of these
 * with no recorded structural parent has an UNKNOWN parent - not none.
 */
export const PARENT_IMPLYING_KINDS: readonly SubjectKind[] = [
  'FACULTY_SCHOOL_DEPARTMENT',
  'INTERNAL_STUDENT_GROUP',
  'OTHER_ORGANISATIONAL_UNIT',
];

/** Kinds whose own claim is that they are NOT part of an institution. */
export const SELF_STANDING_KINDS: readonly SubjectKind[] = [
  'INDEPENDENT_STUDENT_ASSOCIATION',
  'INDEPENDENT_COMMUNITY',
];

export const IDENTITY_CLAIM_KINDS = [
  'NAME',
  'ALTERNATE_NAME',
  'NATIVE_NAME',
  'ENTITY_KIND',
  'PUBLIC_WEBSITE',
  'EXTERNAL_IDENTIFIER',
] as const;
export type IdentityClaimKind = (typeof IDENTITY_CLAIM_KINDS)[number];

export const NAME_CLAIM_KINDS: readonly IdentityClaimKind[] = [
  'NAME',
  'ALTERNATE_NAME',
  'NATIVE_NAME',
];

/** Only PART_OF is structural. Every other predicate is an association, never parentage. */
export const RELATIONSHIP_PREDICATES = [
  'PART_OF',
  'AFFILIATED_WITH',
  'LOCAL_CHAPTER_OF',
  'OPERATES_AT',
  'HOSTED_BY',
  'SERVES_AUDIENCE_AT',
] as const;
export type RelationshipPredicate = (typeof RELATIONSHIP_PREDICATES)[number];
export const STRUCTURAL_PREDICATE: RelationshipPredicate = 'PART_OF';

/** Where a claim came from. A human recording a value is not a source. */
export const SOURCE_TYPES = ['PAGE_EVIDENCE', 'WEBSITE_CLAIM', 'PUBLIC_URL'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** SOURCE_STATED: the source says it. INFERRED: a reader concluded it. Neither is a review. */
export const CLAIM_BASES = ['SOURCE_STATED', 'INFERRED'] as const;
export type ClaimBasis = (typeof CLAIM_BASES)[number];

export const REVIEW_OUTCOMES = ['CONFIRMED', 'DISPUTED', 'REJECTED', 'WITHDRAWN'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

/** Typed external identifiers, checked for SHAPE only - never for validity. */
export const IDENTIFIER_SHAPES = {
  EU_PIC: /^[0-9]{9}$/,
  FR_RNA: /^W[0-9A-Z]{9}$/,
  NL_KVK: /^[0-9]{8}$/,
} as const satisfies Record<string, RegExp>;
export type IdentifierScheme = keyof typeof IDENTIFIER_SHAPES;

/** Provenance carried by every claim, identity and relationship alike. */
export interface ClaimProvenance {
  readonly sourceType: SourceType;
  readonly sourcePageEvidenceId: string | null;
  readonly sourceWebsiteClaimId: string | null;
  readonly sourceUrl: string | null;
  readonly sourceVersionRef: string | null;
  /** When the SOURCE was observed (ISO-8601 UTC). */
  readonly observedAt: string;
  readonly claimBasis: ClaimBasis;
  /** The trusted path that RECORDED the claim - never its source. */
  readonly recordedByActorKey: string;
}

export interface DiscoverySubjectRecord {
  readonly id: string;
  /** A working label at registration, `UNCERTAIN` allowed. Never a reviewed kind. */
  readonly registeredKind: SubjectKind;
  readonly registeredByActorKey: string;
  readonly registrationNote: string | null;
}

export interface IdentityClaimRecord extends ClaimProvenance {
  readonly id: string;
  readonly subjectId: string;
  readonly claimKind: IdentityClaimKind;
  readonly nameText: string | null;
  readonly nameLanguage: string | null;
  readonly claimedKind: SubjectKind | null;
  readonly websiteUrl: string | null;
  readonly identifierScheme: IdentifierScheme | null;
  readonly identifierValue: string | null;
}

export interface RelationshipClaimRecord extends ClaimProvenance {
  readonly id: string;
  readonly subjectId: string;
  readonly predicate: RelationshipPredicate;
  readonly targetSubjectId: string | null;
  readonly targetEcheRowKey: string | null;
}

export interface SubjectReviewRecord {
  readonly id: string;
  readonly reviewedSubjectId: string | null;
  readonly reviewedIdentityClaimId: string | null;
  readonly reviewedRelationshipClaimId: string | null;
  readonly reviewOutcome: ReviewOutcome;
  readonly supersedesReviewId: string | null;
  /** The trusted path that DECIDED - distinct from any claim's source. */
  readonly actorKey: string;
  readonly reviewedAt: string;
  readonly reason: string | null;
}

/** Everything the validator reasons about, supplied by the caller. Nothing is loaded. */
export interface IdentityGraphInput {
  readonly subjects: readonly DiscoverySubjectRecord[];
  readonly identityClaims: readonly IdentityClaimRecord[];
  readonly relationshipClaims: readonly RelationshipClaimRecord[];
  readonly reviews: readonly SubjectReviewRecord[];
  /** ECHE source-row keys the caller knows to exist. Never read from a database here. */
  readonly knownEcheRowKeys: readonly string[];
  /** The evaluation instant (ISO-8601 UTC). The validator reads no clock. */
  readonly asOf: string;
}

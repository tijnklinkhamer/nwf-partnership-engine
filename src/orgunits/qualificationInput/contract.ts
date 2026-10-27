/**
 * REL P1 - THE ENGINE QUALIFICATION-INPUT EXPORT
 * (`nwf-pe.qualification-input-export.v1`), AS DATA.
 *
 * WHY THIS EXISTS. The Operator owns the only NWF qualification model: Track
 * C C1, rubric `nwf-qualification-rubric/V0-R2`, scored out of 100. It also
 * owns the opportunity descriptors (one versioned OWNER pilot-descriptor
 * register per geography), the review and attestation inputs, and the door
 * for real evidence (the Track C C2c `RESEARCH_REAL` family). The Engine holds
 * the stored, source-backed research. This export is the one document between
 * them: for ONE discovery subject, the C1-shaped candidate, channel, source,
 * claim and claim-link records the Engine's stored rows support, each tagged
 * with the evidence class and pointing at the rows it rests on, plus the
 * subject's STATED country (or null).
 *
 * WHAT IT CARRIES, AND ONLY THIS (OWNER decision, REL P1):
 *
 *   channel.existence        DP1  EXISTS. The subject's admitted website was
 *                                 fetched and yielded page evidence (a 2xx
 *                                 HTML capture with a SHA-256).
 *   channel.static_currency  DP3  CURRENT_OR_UPCOMING_YEAR, only for a
 *                                 RESOURCE_PAGE channel, only when a captured
 *                                 page STATES a full calendar date in its
 *                                 capture year or the next (`dates.ts`).
 *   channel.operator_binding G3   HOSTED_ON_CANDIDATE_SITE: the channel is the
 *                                 subject's own admitted website.
 *   candidate.location       (AF1 host-language rule only) ONLY from ADR 0024
 *                                 COUNTRY_OF_OPERATION claims, and only while
 *                                 they are STATED (all agree).
 *   candidate.kind           read-only, never scores: an admitted
 *                                 SOURCE_STATED registry ENTITY_KIND claim,
 *                                 where the registry kind has a faithful C1
 *                                 kind.
 *
 * Nothing else. No classifier output, no page-phrase reading, no audience,
 * language, need, reach, count, openness, publishing route, cycle, network or
 * continuity claim: the Engine stores no evidence C1 admits for them, so
 * they have no claim and C1 reports them unresolved. No opportunity
 * descriptor: the Operator pairs this export with the OWNER descriptor for
 * `country.value`. A subject whose country is UNKNOWN or CONFLICTING is
 * exported with `country.value: null`, which the Operator reports as "not
 * rankable: no stated country". A country is never guessed.
 *
 * INSTANTS. C1 and C2c instants are whole UTC seconds. Every instant here is
 * the stored millisecond value TRUNCATED toward the epoch to the whole second
 * (`toWholeSecond`). Truncation can only move an instant earlier, never across
 * a later evaluation instant; the as-of filter compares the untruncated value.
 *
 * WHAT THIS IS NOT. Not an assessment, a score, a rank, a verdict or an
 * eligibility. Not an identity: references are Engine-local provisional
 * `rp-<kind>:<uuid>` values (C2c's reference namespace) and I0 binds
 * identity in the Operator. Not a permission: every capability is the literal
 * `NONE` and contact permission is `NOT_GRANTED`. It carries no
 * organisation name and no contact field, by construction.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { createHash } from 'node:crypto';

export const QUALIFICATION_INPUT_EXPORT_CONTRACT = 'nwf-pe.qualification-input-export.v1';
export const QUALIFICATION_INPUT_PRODUCER_VERSION = 'nwf-pe-qualification-input-producer-v1';
export const ENGINE_SOURCE_REPOSITORY = 'nwf-partnership-engine';

/** The Operator contracts this export is shaped for (restated, never imported). */
export const TARGET_CONTRACTS = Object.freeze({
  qualificationInput: 'nwf-qualification-input/1-provisional',
  qualificationRubric: 'nwf-qualification-rubric/V0-R2',
  researchInput: 'nwf-qualification-research-input/1-provisional',
  researchReference: 'nwf-research-provisional-reference/1-provisional',
} as const);

/** Every source and every claim carries this class (C2c `EVIDENCE_CLASSES`). */
export const EVIDENCE_CLASS = 'RESEARCH_REAL';

export const INSTANT_RULE = 'WHOLE_SECOND_UTC_TRUNCATED_TOWARD_EPOCH';

export const READ_CONSISTENCY_CLASSES = [
  'SINGLE_SNAPSHOT_TRANSACTION',
  'SYNTHETIC_IN_MEMORY',
] as const;
export type ReadConsistencyClass = (typeof READ_CONSISTENCY_CLASSES)[number];

/** Every capability is `NONE`; contact permission is C2c's `NOT_GRANTED`. */
export const PERMISSIONS = Object.freeze({
  qualification: 'NONE',
  ranking: 'NONE',
  publication: 'NONE',
  memberRelease: 'NONE',
  identityBinding: 'NONE',
  outreach: 'NONE',
  contactPermission: 'NOT_GRANTED',
} as const);

export const LIMITATIONS = Object.freeze({
  documentSignature: 'NONE_NOT_A_SIGNED_EXPORT',
  scoring: 'NONE_THE_OPERATOR_C1_RUBRIC_ALONE_SCORES',
  descriptors: 'NONE_THE_OPERATOR_PAIRS_THE_OWNER_PILOT_DESCRIPTOR_FOR_THE_STATED_COUNTRY',
  identity: 'PROVISIONAL_ENGINE_LOCAL_REFERENCES_I0_BINDS_IDENTITY_IN_THE_OPERATOR',
  country: 'ADR_0024_COUNTRY_OF_OPERATION_STATED_ONLY_ELSE_NULL_NEVER_INFERRED',
  bytes: 'RESPONSE_BODIES_ARE_NEVER_STORED_A_CAPTURE_IS_A_DIGEST_ONLY',
  pageText: 'NO_PAGE_TEXT_IS_EXPORTED',
  classifier: 'NO_CLASSIFIER_OR_PAGE_PHRASE_CLAIM_IS_EXPORTED',
  licence: 'UNKNOWN_NO_STORED_SOURCE_RECORDS_A_LICENCE',
  asOf: 'RECORDS_CREATED_AFTER_EVALUATED_AT_ARE_EXCLUDED',
  instants: INSTANT_RULE,
  completeness: 'NOT_PROVEN',
  piiFields: 'NONE_BY_CONSTRUCTION',
} as const);

// ---------------------------------------------------------------------------
// Vocabularies (restated from the Operator's C1 and C2c contracts).
// ---------------------------------------------------------------------------

export const EXPORTED_CLAIM_KEYS = [
  'candidate.kind',
  'candidate.location',
  'channel.existence',
  'channel.operator_binding',
  'channel.static_currency',
] as const;
export type ExportedClaimKey = (typeof EXPORTED_CLAIM_KEYS)[number];

/** C1 `CANDIDATE_KINDS`. */
export type C1CandidateKind =
  | 'UNIVERSITY'
  | 'UNIVERSITY_UNIT'
  | 'INTERNATIONAL_OFFICE'
  | 'LANGUAGE_CENTRE'
  | 'STUDENT_ASSOCIATION'
  | 'INTERNATIONAL_STUDENT_ASSOCIATION'
  | 'LANGUAGE_SOCIETY'
  | 'INFORMAL_GROUP'
  | 'OTHER';

/**
 * The B2.1 registry kinds (migration 0013) onto C1 candidate kinds, only
 * where the meaning is the same. INDEPENDENT_COMMUNITY,
 * NETWORK_LOCAL_CHAPTER, ORGANISATION_NETWORK, OTHER_ORGANISATIONAL_UNIT and
 * UNCERTAIN have no faithful C1 kind and produce no claim (never OTHER).
 */
export const REGISTRY_KIND_TO_C1: Readonly<Record<string, C1CandidateKind | null>> = Object.freeze({
  FACULTY_SCHOOL_DEPARTMENT: 'UNIVERSITY_UNIT',
  INTERNAL_STUDENT_GROUP: 'STUDENT_ASSOCIATION',
  INDEPENDENT_STUDENT_ASSOCIATION: 'STUDENT_ASSOCIATION',
  INDEPENDENT_COMMUNITY: null,
  NETWORK_LOCAL_CHAPTER: null,
  ORGANISATION_NETWORK: null,
  OTHER_ORGANISATIONAL_UNIT: null,
  UNCERTAIN: null,
});

export type PublisherRelation = 'SELF' | 'THIRD_PARTY';
export type AssertionMode = 'OBSERVED' | 'SELF_ASSERTED' | 'THIRD_PARTY_ASSERTED';
export type Attribution = 'EXACT' | 'LIKELY';
/** C1 `CLAIM_PRODUCERS` members this export uses. */
export type ClaimProducer = 'NWF_SYSTEM' | 'HUMAN_RESEARCHER';

/** C2c reproducibility classes this export declares. */
export type Reproducibility =
  | {
      readonly kind: 'DIGEST_ONLY_BYTES_UNAVAILABLE';
      readonly contentDigest: string;
      readonly bytesAvailable: false;
      /** The https locator, or null when the stored URL is not https (C2c needs https). */
      readonly origin: string | null;
      readonly digestRecordedAt: string;
    }
  | {
      readonly kind: 'EXTERNAL_REFERENCE_ONLY';
      readonly origin: string | null;
      readonly accessedAt: string;
      readonly contentDigest: null;
    };

/** The stored record a source is. Row ids only; never text. */
export type SourceRecord =
  | {
      readonly kind: 'PAGE_EVIDENCE';
      readonly pageEvidenceId: string;
      readonly fetchObservationId: string;
      readonly researchRunId: string;
      readonly admissionId: string | null;
      readonly extractionRuleVersion: string;
      readonly candidates: readonly {
        readonly candidateId: string;
        readonly track: string;
        readonly candidateScore: string;
        readonly rankWithinRoot: number;
        readonly ruleVersion: string;
      }[];
    }
  | {
      readonly kind: 'SOURCE_DISCOVERY_NOMINATION';
      readonly nominationId: string;
      readonly discoveryRunId: string;
    }
  | {
      readonly kind: 'WEBSITE_CLAIM';
      readonly websiteClaimId: string;
      readonly ingestRunId: string;
    }
  | { readonly kind: 'PUBLIC_URL_UNRESOLVED'; readonly provenanceKey: string };

export interface ExportSource {
  readonly evidenceClass: typeof EVIDENCE_CLASS;
  readonly sourceRef: string;
  readonly publisherRelation: PublisherRelation;
  readonly capturedAt: string;
  /** The C1 `Source` capture fields (sourceId = sourceRef). */
  readonly c1: {
    readonly captureKind: 'ARTEFACT';
    readonly contentDigest: string | null;
    readonly originKey: string;
    readonly derivedFromSourceRef: null;
    readonly attesterRef: null;
    readonly partnerRecordRef: null;
  };
  readonly reproducibility: Reproducibility;
  readonly record: SourceRecord;
}

export type ClaimValue =
  | { readonly countryCode: string }
  | { readonly kind: C1CandidateKind }
  | { readonly status: 'EXISTS' }
  | { readonly operatorCandidateId: string; readonly basis: 'HOSTED_ON_CANDIDATE_SITE' }
  | { readonly marker: 'CURRENT_OR_UPCOMING_YEAR'; readonly lastModified: null };

export type ClaimBasis =
  | {
      readonly origin: 'ADR_0024_COUNTRY_OF_OPERATION';
      readonly jurisdictionClaimId: string;
      readonly recordedByActorKey: string;
    }
  | {
      readonly origin: 'REGISTRY_ENTITY_KIND';
      readonly identityClaimId: string;
      readonly registryKind: string;
    }
  | {
      readonly origin: 'ADMITTED_WEBSITE_CAPTURED';
      readonly websiteClaimId: string;
      readonly admissionIds: readonly string[];
    }
  | {
      readonly origin: 'STATED_DATE_IN_CAPTURE';
      readonly pageEvidenceId: string;
      /** The stated dates the marker rests on (capture year or the next). */
      readonly statedDates: readonly string[];
    };

export interface ExportClaim {
  readonly evidenceClass: typeof EVIDENCE_CLASS;
  readonly claimRef: string;
  readonly claimKey: ExportedClaimKey;
  readonly subject: { readonly kind: 'CANDIDATE' | 'CHANNEL'; readonly ref: string };
  readonly mode: AssertionMode;
  readonly attribution: Attribution;
  readonly producedBy: ClaimProducer;
  readonly value: ClaimValue;
  readonly basis: ClaimBasis;
  /**
   * Where this claim, as the Engine states it, departs from the C2c
   * RESEARCH_REAL contract as it stands (restated tables below). The
   * Operator's admission decides; the Engine never relabels a claim to fit.
   */
  readonly researchRealConflicts: readonly ResearchRealConflict[];
}

export interface ExportClaimLink {
  readonly claimRef: string;
  readonly sourceRef: string;
  readonly relation: 'SUPPORTS';
}

/**
 * C2c `MODE_REPRODUCIBILITY` and `RESEARCH_CLAIM_PRODUCERS`, restated: which
 * reproducibility classes may support which mode, and which producers a
 * RESEARCH_REAL claim may name.
 */
export const RESEARCH_REAL_MODE_REPRODUCIBILITY: Readonly<
  Record<AssertionMode, readonly string[]>
> = Object.freeze({
  OBSERVED: ['PRESERVED_SOURCE_MATERIAL'],
  SELF_ASSERTED: [
    'PRESERVED_SOURCE_MATERIAL',
    'EXTERNAL_REFERENCE_ONLY',
    'DIGEST_ONLY_BYTES_UNAVAILABLE',
  ],
  THIRD_PARTY_ASSERTED: [
    'PRESERVED_SOURCE_MATERIAL',
    'EXTERNAL_REFERENCE_ONLY',
    'DIGEST_ONLY_BYTES_UNAVAILABLE',
  ],
});
export const RESEARCH_REAL_CLAIM_PRODUCERS: readonly string[] = Object.freeze([
  'HUMAN_RESEARCHER',
  'CLASSIFIER',
  'LANGUAGE_MODEL',
]);

export type ResearchRealConflict =
  | 'MODE_NEEDS_PRESERVED_SOURCE_MATERIAL_ENGINE_HOLDS_DIGEST_ONLY'
  | 'PRODUCER_NWF_SYSTEM_NOT_A_RESEARCH_REAL_PRODUCER'
  | 'SOURCE_ORIGIN_NOT_HTTPS';

export interface QualificationInputExportDocument {
  readonly document: typeof QUALIFICATION_INPUT_EXPORT_CONTRACT;
  readonly producerVersion: typeof QUALIFICATION_INPUT_PRODUCER_VERSION;
  readonly targetContracts: typeof TARGET_CONTRACTS;
  readonly evidenceClass: typeof EVIDENCE_CLASS;
  readonly instantRule: typeof INSTANT_RULE;
  readonly dateRuleVersion: string;
  readonly sourceRepository: typeof ENGINE_SOURCE_REPOSITORY;
  readonly readConsistency: ReadConsistencyClass;
  readonly subjectId: string;
  readonly evaluatedAt: string;
  readonly candidate: { readonly candidateRef: string; readonly relations: readonly never[] };
  readonly country: {
    readonly value: string | null;
    readonly standing: 'STATED' | 'UNKNOWN' | 'CONFLICTING';
    readonly rule: 'ADR_0024_COUNTRY_OF_OPERATION_STATED';
    readonly notRankableReason: 'NO_STATED_COUNTRY' | null;
  };
  readonly channels: readonly {
    readonly channelRef: string;
    readonly kind: 'RESOURCE_PAGE';
    readonly visibility: 'PUBLIC';
    readonly websiteClaimId: string;
    readonly admissionIds: readonly string[];
  }[];
  readonly sources: readonly ExportSource[];
  readonly claims: readonly ExportClaim[];
  readonly claimLinks: readonly ExportClaimLink[];
  readonly excluded: readonly { readonly ref: string; readonly reason: ExclusionReason }[];
  readonly researchRuns: readonly {
    readonly runId: string;
    readonly admissionId: string;
    readonly included: boolean;
    readonly pages: number;
  }[];
  readonly permissions: typeof PERMISSIONS;
  readonly limitations: typeof LIMITATIONS;
}

export type ExclusionReason =
  | 'RUN_NOT_COMPLETED'
  | 'RUN_IS_DRY_RUN'
  | 'ADMISSION_REVOKED_BY_EVALUATED_AT'
  | 'ROOT_WEBSITE_CLAIM_NEGATIVE_REVIEW'
  | 'IDENTITY_CLAIM_INFERRED'
  | 'IDENTITY_CLAIM_NEGATIVE_REVIEW'
  | 'REGISTRY_KIND_HAS_NO_FAITHFUL_C1_KIND'
  | 'JURISDICTION_CLAIM_INVALID'
  | 'COUNTRY_NOT_STATED'
  | 'SOURCE_UNRESOLVABLE';

export type QualificationInputRefusalCode =
  | 'ARGUMENT_INVALID'
  | 'SUBJECT_NOT_FOUND'
  | 'SUBJECT_NEGATIVE_REVIEW_RECORDED'
  | 'EVALUATED_AT_IN_THE_FUTURE'
  | 'RECORD_INCONSISTENT'
  | 'BOUND_EXCEEDED';

export class QualificationInputExportRefusal extends Error {
  constructor(
    readonly code: QualificationInputRefusalCode,
    readonly detail: string,
  ) {
    super(`qualification input export refused: ${code} (${detail})`);
    this.name = 'QualificationInputExportRefusal';
  }
}

// ---------------------------------------------------------------------------
// Primitives.
// ---------------------------------------------------------------------------

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** C2c's provisional reference: `rp-<kind>:<lower-case v4 uuid>`. */
export const RP_REFERENCE =
  /^rp-(candidate|channel|source|claim):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** C1/C2c `isoInstant`: whole seconds, UTC. */
export const WHOLE_SECOND_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export const INSTANT_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const sha256Hex = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

/** `…T12:34:56.789Z` -> `…T12:34:56Z`: truncation toward the epoch, never rounding. */
export function toWholeSecond(instantMs: string): string {
  if (!INSTANT_MS.test(instantMs)) {
    throw new QualificationInputExportRefusal('RECORD_INCONSISTENT', `instant ${instantMs}`);
  }
  return `${instantMs.slice(0, 19)}Z`;
}

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A deterministic v4-shaped UUID from a stable key (for records with no row id of their own). */
export function derivedUuid(stableKey: string): string {
  const h = sha256Hex(`${QUALIFICATION_INPUT_PRODUCER_VERSION}|${stableKey}`);
  const variant = '89ab'[parseInt(h[16]!, 16) & 3]!;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** A stored row id as an rp reference, when it is v4-shaped; else a derived one. */
export function rpRef(kind: 'candidate' | 'channel' | 'source' | 'claim', key: string): string {
  return `rp-${kind}:${V4.test(key) ? key : derivedUuid(`${kind}|${key}`)}`;
}

export const isHttpsLocator = (value: string): boolean => {
  if (!/^https:\/\/[^\s]+$/.test(value) || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
};

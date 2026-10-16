/**
 * TRACK B, B2.2 - THE NARROW REQUEST SHAPES OF THE DISCOVERY-SUBJECT REGISTRY.
 *
 * One request type per operation, each turned into EXACTLY the B2.1 record
 * shapes (`src/orgunits/identity/vocabulary.ts`) and judged by the B2.1
 * validator - this module re-implements no identity rule. It checks only what
 * must hold before a value may reach a SQL parameter at all (UUID shape), and
 * it supplies the one thing the caller may never supply: the recorded actor
 * key, which is the fixed path key of this CLI (migration 0014 refuses any
 * other from a non-owner writer).
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import type {
  ClaimBasis,
  ClaimProvenance,
  DiscoverySubjectRecord,
  IdentityClaimRecord,
  RelationshipClaimRecord,
  RelationshipPredicate,
  SubjectKind,
} from '../identity/vocabulary.js';

/** The machine contract every registry command speaks with `--json`. */
export const SUBJECT_REGISTRY_CONTRACT = 'nwf-pe.discovery-subject-registry.v1';

/**
 * The path key recorded as `registered_by_actor_key` / `recorded_by_actor_key`
 * for every row this CLI writes. It names the PATH (this command, through the
 * writer capability), never a person, and is NOT a claim of OWNER identity.
 * Migration 0014 refuses any other value from a non-owner session.
 */
export const REGISTRY_WRITER_ACTOR_KEY = 'discovery-subjects-cli';

/** The capability role migration 0014 creates. */
export const REGISTRY_WRITER_ROLE = 'nwf_discovery_subject_writer';

/** `list` page size: default and hard maximum. There is no unbounded read. */
export const LIST_DEFAULT_LIMIT = 25;
export const LIST_MAX_LIMIT = 100;

/** Lower-case UUID, the only form the B2.1 validator accepts as a record id. */
export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A subject state digest, as `show` prints it. */
export const STATE_DIGEST_SHAPE = /^[0-9a-f]{64}$/;

/** Where a claim came from - exactly one of the three B2.1 source types. */
export type SourceInput =
  | { readonly sourceType: 'PUBLIC_URL'; readonly url: string; readonly versionRef: string | null }
  | { readonly sourceType: 'PAGE_EVIDENCE'; readonly pageEvidenceId: string }
  | { readonly sourceType: 'WEBSITE_CLAIM'; readonly websiteClaimId: string };

export interface ProvenanceInput {
  readonly source: SourceInput;
  /** When the SOURCE was observed (ISO-8601 UTC). Never defaulted to "now". */
  readonly observedAt: string;
  readonly claimBasis: ClaimBasis;
}

/** One new subject together with its first NAME claim, written atomically. */
export interface ProposeRequest {
  /** Chosen by the operator, so an accidental retry is refused rather than duplicated. */
  readonly subjectId: string;
  readonly registeredKind: SubjectKind;
  readonly registrationNote: string | null;
  readonly name: string;
  readonly nameLanguage: string | null;
  readonly provenance: ProvenanceInput;
}

/** One identity claim, in exactly the payload columns its kind names. */
export type IdentityClaimPayload =
  | {
      readonly claimKind: 'NAME' | 'ALTERNATE_NAME';
      readonly nameText: string;
      readonly nameLanguage: string | null;
    }
  | { readonly claimKind: 'NATIVE_NAME'; readonly nameText: string; readonly nameLanguage: string }
  | { readonly claimKind: 'ENTITY_KIND'; readonly claimedKind: SubjectKind }
  | { readonly claimKind: 'PUBLIC_WEBSITE'; readonly websiteUrl: string }
  | {
      readonly claimKind: 'EXTERNAL_IDENTIFIER';
      readonly identifierScheme: string;
      readonly identifierValue: string;
    };

export interface ClaimRequest {
  readonly subjectId: string;
  readonly payload: IdentityClaimPayload;
  readonly provenance: ProvenanceInput;
}

export type RelationshipTargetInput =
  { readonly targetSubjectId: string } | { readonly targetEcheRowKey: string };

export interface RelateRequest {
  readonly subjectId: string;
  readonly predicate: RelationshipPredicate;
  readonly target: RelationshipTargetInput;
  readonly provenance: ProvenanceInput;
}

/** Turns provenance input into the B2.1 provenance columns, with the BOUND actor key. */
export function provenanceRecord(p: ProvenanceInput): ClaimProvenance {
  const base = {
    observedAt: p.observedAt,
    claimBasis: p.claimBasis,
    recordedByActorKey: REGISTRY_WRITER_ACTOR_KEY,
  };
  switch (p.source.sourceType) {
    case 'PUBLIC_URL':
      return {
        ...base,
        sourceType: 'PUBLIC_URL',
        sourcePageEvidenceId: null,
        sourceWebsiteClaimId: null,
        sourceUrl: p.source.url,
        sourceVersionRef: p.source.versionRef,
      };
    case 'PAGE_EVIDENCE':
      return {
        ...base,
        sourceType: 'PAGE_EVIDENCE',
        sourcePageEvidenceId: p.source.pageEvidenceId,
        sourceWebsiteClaimId: null,
        sourceUrl: null,
        sourceVersionRef: null,
      };
    case 'WEBSITE_CLAIM':
      return {
        ...base,
        sourceType: 'WEBSITE_CLAIM',
        sourcePageEvidenceId: null,
        sourceWebsiteClaimId: p.source.websiteClaimId,
        sourceUrl: null,
        sourceVersionRef: null,
      };
  }
}

export function subjectRecord(r: ProposeRequest): DiscoverySubjectRecord {
  return {
    id: r.subjectId,
    registeredKind: r.registeredKind,
    registeredByActorKey: REGISTRY_WRITER_ACTOR_KEY,
    registrationNote: r.registrationNote,
  };
}

export function identityClaimRecord(
  id: string,
  subjectId: string,
  payload: IdentityClaimPayload,
  provenance: ProvenanceInput,
): IdentityClaimRecord {
  const empty = {
    nameText: null,
    nameLanguage: null,
    claimedKind: null,
    websiteUrl: null,
    identifierScheme: null,
    identifierValue: null,
  };
  const body = (() => {
    switch (payload.claimKind) {
      case 'NAME':
      case 'ALTERNATE_NAME':
      case 'NATIVE_NAME':
        return { ...empty, nameText: payload.nameText, nameLanguage: payload.nameLanguage };
      case 'ENTITY_KIND':
        return { ...empty, claimedKind: payload.claimedKind };
      case 'PUBLIC_WEBSITE':
        return { ...empty, websiteUrl: payload.websiteUrl };
      case 'EXTERNAL_IDENTIFIER':
        return {
          ...empty,
          identifierScheme: payload.identifierScheme,
          identifierValue: payload.identifierValue,
        };
    }
  })();
  // The validator, not this cast, decides whether an unknown scheme is admissible.
  return {
    id,
    subjectId,
    claimKind: payload.claimKind,
    ...body,
    ...provenanceRecord(provenance),
  } as IdentityClaimRecord;
}

export function relationshipClaimRecord(id: string, r: RelateRequest): RelationshipClaimRecord {
  return {
    id,
    subjectId: r.subjectId,
    predicate: r.predicate,
    targetSubjectId: 'targetSubjectId' in r.target ? r.target.targetSubjectId : null,
    targetEcheRowKey: 'targetEcheRowKey' in r.target ? r.target.targetEcheRowKey : null,
    ...provenanceRecord(r.provenance),
  };
}

/** Every UUID-typed value in a provenance input, for the pre-SQL shape check. */
export function provenanceUuids(p: ProvenanceInput): string[] {
  if (p.source.sourceType === 'PAGE_EVIDENCE') return [p.source.pageEvidenceId];
  if (p.source.sourceType === 'WEBSITE_CLAIM') return [p.source.websiteClaimId];
  return [];
}

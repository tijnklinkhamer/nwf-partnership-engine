/**
 * Track B, B2.1 - SYNTHETIC discovery-subject identity fixtures.
 *
 * Every value here is invented: ids are deterministic UUIDs, ECHE row keys use
 * the reserved test prefix `T B21`, and every URL sits under the reserved
 * `.example` / `.test` top-level domains. No real organisation, no protected
 * cohort entry and no personal data appears anywhere.
 */
import type {
  DiscoverySubjectRecord,
  IdentityClaimRecord,
  IdentityGraphInput,
  RelationshipClaimRecord,
  RelationshipPredicate,
  ReviewOutcome,
  SubjectKind,
  SubjectReviewRecord,
} from '../../orgunits/identity/vocabulary.js';

export const AS_OF = '2026-10-15T12:00:00.000Z';
export const OBSERVED = '2026-10-01T09:00:00.000Z';
export const ACTOR = 'owner-cli';

/** Synthetic ECHE source-row keys. Never real institutions. */
export const ECHE_ALPHA = 'T B21 ALPHA01|300000021';
export const ECHE_BETA = 'T B21 BETA01|300000022';
export const ECHE_GAMMA = 'T B21 GAMMA01|300000023';
/** Supplied to the evaluator as "protected" - a synthetic stand-in, not a cohort entry. */
export const ECHE_PROTECTED = 'T B21 PROT01|300000029';
export const KNOWN_ECHE = [ECHE_ALPHA, ECHE_BETA, ECHE_GAMMA, ECHE_PROTECTED];

/** A deterministic, well-formed UUID for a small integer. */
export function uid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

export function sourceUrl(path: string): string {
  return `https://synthetic-b21.example/${path}`;
}

export function subject(n: number, kind: SubjectKind = 'UNCERTAIN'): DiscoverySubjectRecord {
  return {
    id: uid(n),
    registeredKind: kind,
    registeredByActorKey: ACTOR,
    registrationNote: null,
  };
}

const PROVENANCE = {
  sourceType: 'PUBLIC_URL',
  sourcePageEvidenceId: null,
  sourceWebsiteClaimId: null,
  sourceVersionRef: null,
  observedAt: OBSERVED,
  claimBasis: 'SOURCE_STATED',
  recordedByActorKey: ACTOR,
} as const;

export function nameClaim(
  n: number,
  subjectN: number,
  text: string,
  options: {
    kind?: 'NAME' | 'ALTERNATE_NAME' | 'NATIVE_NAME';
    language?: string;
    src?: string;
  } = {},
): IdentityClaimRecord {
  return {
    ...PROVENANCE,
    id: uid(n),
    subjectId: uid(subjectN),
    claimKind: options.kind ?? 'NAME',
    nameText: text,
    nameLanguage: options.language ?? null,
    claimedKind: null,
    websiteUrl: null,
    identifierScheme: null,
    identifierValue: null,
    sourceUrl: sourceUrl(options.src ?? `subject-${subjectN}`),
  };
}

export function kindClaim(
  n: number,
  subjectN: number,
  kind: SubjectKind,
  src = `kind-${n}`,
): IdentityClaimRecord {
  return {
    ...PROVENANCE,
    id: uid(n),
    subjectId: uid(subjectN),
    claimKind: 'ENTITY_KIND',
    nameText: null,
    nameLanguage: null,
    claimedKind: kind,
    websiteUrl: null,
    identifierScheme: null,
    identifierValue: null,
    sourceUrl: sourceUrl(src),
    claimBasis: 'INFERRED',
  };
}

export function identifierClaim(
  n: number,
  subjectN: number,
  scheme: 'EU_PIC' | 'FR_RNA' | 'NL_KVK',
  value: string,
): IdentityClaimRecord {
  return {
    ...PROVENANCE,
    id: uid(n),
    subjectId: uid(subjectN),
    claimKind: 'EXTERNAL_IDENTIFIER',
    nameText: null,
    nameLanguage: null,
    claimedKind: null,
    websiteUrl: null,
    identifierScheme: scheme,
    identifierValue: value,
    sourceUrl: sourceUrl(`identifier-${n}`),
  };
}

export function relation(
  n: number,
  subjectN: number,
  predicate: RelationshipPredicate,
  target: { subject: number } | { eche: string },
  src = `relation-${n}`,
): RelationshipClaimRecord {
  return {
    ...PROVENANCE,
    id: uid(n),
    subjectId: uid(subjectN),
    predicate,
    targetSubjectId: 'subject' in target ? uid(target.subject) : null,
    targetEcheRowKey: 'eche' in target ? target.eche : null,
    sourceUrl: sourceUrl(src),
  };
}

export function review(
  n: number,
  target: { subject: number } | { identityClaim: number } | { relationshipClaim: number },
  outcome: ReviewOutcome,
  options: { supersedes?: number; at?: string; reason?: string } = {},
): SubjectReviewRecord {
  return {
    id: uid(n),
    reviewedSubjectId: 'subject' in target ? uid(target.subject) : null,
    reviewedIdentityClaimId: 'identityClaim' in target ? uid(target.identityClaim) : null,
    reviewedRelationshipClaimId:
      'relationshipClaim' in target ? uid(target.relationshipClaim) : null,
    reviewOutcome: outcome,
    supersedesReviewId: options.supersedes === undefined ? null : uid(options.supersedes),
    actorKey: ACTOR,
    reviewedAt: options.at ?? '2026-10-10T10:00:00.000Z',
    reason: options.reason ?? null,
  };
}

export function graph(parts: Partial<IdentityGraphInput> = {}): IdentityGraphInput {
  return {
    subjects: [],
    identityClaims: [],
    relationshipClaims: [],
    reviews: [],
    knownEcheRowKeys: KNOWN_ECHE,
    asOf: AS_OF,
    ...parts,
  };
}

/**
 * Shared admissibility samples: the unit test checks the TypeScript predicates
 * against `expected`, and the integration test checks migration 0013's SQL
 * predicates against the SAME list, so the two can never drift silently.
 */
export const URL_SAMPLES: readonly { readonly url: string; readonly expected: boolean }[] = [
  { url: 'https://synthetic-b21.example/', expected: true },
  { url: 'https://synthetic-b21.example', expected: true },
  { url: 'http://club.synthetic-b21.example/about/team', expected: true },
  { url: 'https://synthetic-b21.example/caf%C3%A9-langues', expected: true },
  { url: 'https://xn--bcher-kva.example/', expected: true },
  { url: 'https://user:secret@synthetic-b21.example/', expected: false },
  { url: 'https://synthetic-b21.example/@someone', expected: false },
  { url: 'https://synthetic-b21.example/someone%40mailbox.example', expected: false },
  { url: 'https://synthetic-b21.example/page?token=abc', expected: false },
  { url: 'https://synthetic-b21.example/page#section', expected: false },
  { url: 'https://synthetic-b21.example:8443/', expected: false },
  { url: 'https://synthetic-b21.example:443/', expected: false },
  { url: 'https://Synthetic-B21.example/', expected: false },
  { url: 'https://192.0.2.10/', expected: false },
  { url: 'ftp://synthetic-b21.example/', expected: false },
  { url: 'https://synthetic-b21.example/a b', expected: false },
  { url: 'https://synthetic-b21..example/', expected: false },
  { url: 'https://-synthetic.example/', expected: false },
  { url: 'https://www.instagram.com/synthetic_b21', expected: false },
  { url: 'https://instagram.com/synthetic_b21', expected: false },
  { url: 'https://m.facebook.com/synthetic', expected: false },
  { url: 'https://wa.me/0000', expected: false },
  { url: 'https://t.me/synthetic', expected: false },
  { url: 'https://linktr.ee/synthetic', expected: false },
  { url: 'https://notinstagram.com.example/', expected: true },
  { url: `https://synthetic-b21.example/${'a'.repeat(2048)}`, expected: false },
];

export const TEXT_SAMPLES: readonly { readonly text: string; readonly expected: boolean }[] = [
  { text: 'Synthetic Buddy Network', expected: true },
  { text: 'Club Langues & Cultures 2021-2027', expected: true },
  { text: 'Café des Langues', expected: true },
  { text: 'Founded 1998, 2000 members', expected: true },
  { text: 'Write to someone at synthetic', expected: true },
  { text: 'someone@synthetic-b21.example', expected: false },
  { text: 'Call +33 1 23 45 67 89', expected: false },
  { text: '0612345678', expected: false },
  { text: '06.12.34.56.78', expected: false },
  { text: '(020) 123-4567', expected: false },
  { text: 'Line\nbreak', expected: false },
  { text: 'Tab\there', expected: false },
];

/**
 * GLOBAL FOUNDATION R4 - VALIDATION AND DERIVED JURISDICTION STANDING.
 *
 * `validateJurisdictionClaim` mirrors migration 0016's CHECKs, so a record
 * read from anywhere other than the database is held to the same shape - with
 * ONE deliberate exception: source-URL admissibility is B2.1's predicate
 * (`discovery_identity_url_admissible`, reused by 0016's CHECK). This module
 * does not import the B2.1 identity namespace, whose importer set the B2.5-V1
 * firewall freezes, so that check is the database's alone.
 * `deriveJurisdictionStanding` reduces ONE subject's claims to what they
 * jointly say: UNKNOWN when nothing was stated, STATED when every valid claim
 * agrees, CONFLICTING when they do not. PURE. See ADR 0024.
 *
 * What it never does:
 *   - repair a claim: an invalid record is excluded and reported, never fixed;
 *   - default a country: no claim is UNKNOWN, not the ECHE Country Cd and not
 *     a guess from a name, a language or a top-level domain;
 *   - propagate: a claim about another subject - a PART_OF target, a network,
 *     a host institution - is ignored, never inherited;
 *   - pick a winner: two official-looking sources that disagree stay
 *     CONFLICTING;
 *   - grant anything. A standing carries no permission, eligibility or
 *     contact field, and STATED is not a lawful basis for anything.
 */
import {
  JURISDICTION_CLAIM_BASES,
  JURISDICTION_CLAIM_KINDS,
  JURISDICTION_SOURCE_TYPES,
  LEGAL_FORMS,
  isAssignedIso3166Alpha2,
  type Iso3166Alpha2,
  type JurisdictionClaimRecord,
  type LegalForm,
} from './vocabulary.js';

export const SUBJECT_JURISDICTION_RULE_VERSION = 'subject-jurisdiction-rules-v1';

export type JurisdictionFindingCode =
  | 'CLAIM_KIND_UNKNOWN'
  | 'PAYLOAD_MISMATCH'
  | 'COUNTRY_NOT_ASSIGNED'
  | 'LEGAL_FORM_UNKNOWN'
  | 'SOURCE_SHAPE'
  | 'SOURCE_VERSION_SHAPE'
  | 'BASIS_NOT_SOURCE_STATED'
  | 'ACTOR_KEY_SHAPE';

const ACTOR_KEY_SHAPE = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function includes<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

/** Every reason the record would be refused by migration 0016; empty when admissible. */
export function validateJurisdictionClaim(
  record: JurisdictionClaimRecord,
): JurisdictionFindingCode[] {
  const findings: JurisdictionFindingCode[] = [];
  if (!includes(JURISDICTION_CLAIM_KINDS, record.claimKind)) {
    findings.push('CLAIM_KIND_UNKNOWN');
  } else if (record.claimKind === 'LEGAL_FORM') {
    if (record.claimedLegalForm === null || record.claimedCountry !== null) {
      findings.push('PAYLOAD_MISMATCH');
    }
  } else if (record.claimedCountry === null || record.claimedLegalForm !== null) {
    findings.push('PAYLOAD_MISMATCH');
  }
  if (record.claimedCountry !== null && !isAssignedIso3166Alpha2(record.claimedCountry)) {
    findings.push('COUNTRY_NOT_ASSIGNED');
  }
  if (record.claimedLegalForm !== null && !includes(LEGAL_FORMS, record.claimedLegalForm)) {
    findings.push('LEGAL_FORM_UNKNOWN');
  }
  const present = [record.sourcePageEvidenceId, record.sourceWebsiteClaimId, record.sourceUrl];
  const expected =
    record.sourceType === 'PAGE_EVIDENCE' ? 0 : record.sourceType === 'WEBSITE_CLAIM' ? 1 : 2;
  if (
    !includes(JURISDICTION_SOURCE_TYPES, record.sourceType) ||
    present.some((value, index) => (value !== null) !== (index === expected))
  ) {
    findings.push('SOURCE_SHAPE');
  }
  if (record.sourceVersionRef !== null && !SHA256_HEX.test(record.sourceVersionRef)) {
    findings.push('SOURCE_VERSION_SHAPE');
  }
  if (!includes(JURISDICTION_CLAIM_BASES, record.claimBasis)) {
    findings.push('BASIS_NOT_SOURCE_STATED');
  }
  if (!ACTOR_KEY_SHAPE.test(record.recordedByActorKey)) {
    findings.push('ACTOR_KEY_SHAPE');
  }
  return findings;
}

/** The provenance key migration 0016 generates, so standing can cite its sources. */
export function jurisdictionProvenanceKeyOf(record: JurisdictionClaimRecord): string {
  switch (record.sourceType) {
    case 'PAGE_EVIDENCE':
      return `page_evidence:${record.sourcePageEvidenceId ?? ''}`;
    case 'WEBSITE_CLAIM':
      return `website_claim:${record.sourceWebsiteClaimId ?? ''}`;
    default:
      return `url:${record.sourceUrl ?? ''}|v=${record.sourceVersionRef ?? ''}`;
  }
}

export type Stated<T extends string> =
  | { readonly state: 'UNKNOWN' }
  | { readonly state: 'STATED'; readonly value: T; readonly provenanceKeys: readonly string[] }
  | { readonly state: 'CONFLICTING'; readonly values: readonly T[] };

export interface SubjectJurisdictionStanding {
  readonly ruleVersion: typeof SUBJECT_JURISDICTION_RULE_VERSION;
  readonly subjectId: string;
  readonly countryOfOperation: Stated<Iso3166Alpha2>;
  readonly countryOfRegistration: Stated<Iso3166Alpha2>;
  readonly legalForm: Stated<LegalForm>;
  /** Records about THIS subject that failed validation: excluded, never repaired. */
  readonly excludedClaimIds: readonly string[];
}

function reduce<T extends string>(
  pairs: readonly { value: T; provenanceKey: string }[],
): Stated<T> {
  if (pairs.length === 0) return { state: 'UNKNOWN' };
  const values = [...new Set(pairs.map((p) => p.value))].sort();
  if (values.length > 1) return { state: 'CONFLICTING', values };
  return {
    state: 'STATED',
    value: values[0]!,
    provenanceKeys: [...new Set(pairs.map((p) => p.provenanceKey))].sort(),
  };
}

/** What ONE subject's own claims jointly state. Claims about any other subject are ignored. */
export function deriveJurisdictionStanding(
  subjectId: string,
  claims: readonly JurisdictionClaimRecord[],
): SubjectJurisdictionStanding {
  const operation: { value: Iso3166Alpha2; provenanceKey: string }[] = [];
  const registration: { value: Iso3166Alpha2; provenanceKey: string }[] = [];
  const legalForm: { value: LegalForm; provenanceKey: string }[] = [];
  const excluded: string[] = [];
  for (const claim of claims) {
    if (claim.subjectId !== subjectId) continue;
    if (validateJurisdictionClaim(claim).length > 0) {
      excluded.push(claim.id);
      continue;
    }
    const provenanceKey = jurisdictionProvenanceKeyOf(claim);
    if (claim.claimKind === 'LEGAL_FORM') {
      legalForm.push({ value: claim.claimedLegalForm as LegalForm, provenanceKey });
    } else {
      const target = claim.claimKind === 'COUNTRY_OF_OPERATION' ? operation : registration;
      target.push({ value: claim.claimedCountry as Iso3166Alpha2, provenanceKey });
    }
  }
  return {
    ruleVersion: SUBJECT_JURISDICTION_RULE_VERSION,
    subjectId,
    countryOfOperation: reduce(operation),
    countryOfRegistration: reduce(registration),
    legalForm: reduce(legalForm),
    excludedClaimIds: excluded.sort(),
  };
}

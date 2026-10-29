/**
 * REL FINAL JOIN A2 - THE READ-ONLY SUBJECT FACTS EXPORT
 * (`nwf-pe.subject-facts-export.v1`), AS DATA.
 *
 * WHY THIS EXISTS. The Operator's `registry-admin --subjects` export needs,
 * per Discovery Subject, the facts its OWNER registry record carries: a name,
 * a website host, a claimed country, the source licence, the run that
 * brought the source in, when the source was retrieved, and when the Engine
 * created and last appended to the subject. Until now those were typed by
 * hand. This module derives them from STORED CLAIMS ONLY, so nothing the
 * Operator receives is a value a person chose.
 *
 * THE RULES (`subject-facts-rules-v1`). Each is a reading of stored records,
 * never a repair and never a winner:
 *
 *   name          the SOURCE_STATED `NAME` claims of the subject (never
 *                 ALTERNATE/NATIVE names, never an INFERRED claim). One
 *                 distinct text is STATED; several are CONFLICTING and no
 *                 name is emitted; none is UNKNOWN. Every claim is listed
 *                 with its source cited.
 *   websiteHost   the same reading over SOURCE_STATED `PUBLIC_WEBSITE`
 *                 claims, by host.
 *   claimedCountry  ONLY an ADR 0024 jurisdiction claim, through R4's own
 *                 `deriveJurisdictionStanding`: the COUNTRY OF OPERATION when
 *                 it is STATED, otherwise null. Never a name, a language, a
 *                 top-level domain, a search geography or an ECHE Country Cd.
 *   provenance    of the EARLIEST-RECORDED claim stating the name: its source
 *                 cited, resolved to the stored record it names -
 *                   PUBLIC_URL whose version ref is the source-discovery
 *                     nomination citation digest of a stored nomination with
 *                     that URL (verified by recomputing the digest, never by
 *                     URL alone) -> that nomination's retrieval instant and
 *                     its discovery run;
 *                   PAGE_EVIDENCE -> its fetch's observation instant and
 *                     research run;
 *                   WEBSITE_CLAIM -> the claim's observation instant and
 *                     ingest run;
 *                   anything else stays UNRESOLVED (null instant, null run).
 *   sourceLicence the source record's own recorded licence. No source record
 *                 a subject claim can cite (nomination, page evidence,
 *                 website claim, public URL) has a licence column, so it is
 *                 the explicit `UNKNOWN` - never a guessed licence.
 *   engineCreatedAt / engineUpdatedAt  the subject row's own `created_at`,
 *                 and the latest `created_at` among the subject row and every
 *                 record about it this export read (append-only tables: a
 *                 later record is the only kind of "update").
 *
 * A claim or a subject that carries ANY stored DISPUTED or REJECTED review -
 * superseded or not - is excluded from every derivation (the conservative
 * reading: a later CONFIRMED review never silently re-admits it here) and
 * listed with its exclusion reason.
 *
 * WHAT THIS IS NOT. Not a verified identity (claims only), not a signed or
 * complete export, not a permission (every capability `NONE`), and it carries
 * no contact field by construction: there is no key for one.
 *
 * PURE apart from SHA-256 (the nomination citation digest): no socket, no
 * database, no filesystem, no environment, no clock.
 */
import { createHash } from 'node:crypto';

import { deriveJurisdictionStanding } from '../subjectJurisdiction/standing.js';
import type { JurisdictionClaimRecord } from '../subjectJurisdiction/vocabulary.js';

export const SUBJECT_FACTS_EXPORT_CONTRACT = 'nwf-pe.subject-facts-export.v1';
export const SUBJECT_FACTS_RULE_VERSION = 'subject-facts-rules-v1';
export const ENGINE_SOURCE_REPOSITORY = 'nwf-partnership-engine';

/** The explicit licence value when the source record states none. */
export const LICENCE_UNKNOWN = 'UNKNOWN';

/** Bounds. Larger is refused, never truncated. */
export const MAX_SUBJECTS_PER_EXPORT = 500;
export const MAX_RECORDS_PER_SUBJECT = 1000;

/**
 * Restated from `sourceDiscovery/promote.ts` (`NOMINATION_CITATION_VERSION`,
 * `nominationCitationDigest`) and pinned equal by the unit test: this module
 * does not import the source-discovery namespace, whose registry-facing
 * importers an earlier firewall freezes.
 */
export const NOMINATION_CITATION_VERSION = 'source-discovery-nomination-citation-v1';

export function nominationCitationDigestOf(n: {
  readonly id: string;
  readonly url: string;
  readonly retrievedAt: string;
}): string {
  return createHash('sha256')
    .update(`${NOMINATION_CITATION_VERSION}|${n.id}|${n.url}|${n.retrievedAt}`, 'utf8')
    .digest('hex');
}

export const READ_CONSISTENCY_CLASSES = [
  'SINGLE_SNAPSHOT_TRANSACTION',
  'SYNTHETIC_IN_MEMORY',
] as const;
export type ReadConsistencyClass = (typeof READ_CONSISTENCY_CLASSES)[number];

export const PERMISSIONS = Object.freeze({
  research: 'NONE',
  canonicalIssuance: 'NONE',
  canonicalLinking: 'NONE',
  qualification: 'NONE',
  publication: 'NONE',
  outreach: 'NONE',
} as const);

export const LIMITATIONS = Object.freeze({
  documentSignature: 'NONE_NOT_A_SIGNED_EXPORT',
  identity: 'CLAIMS_ONLY_NOT_A_VERIFIED_IDENTITY',
  completeness: 'NOT_PROVEN',
  piiFields: 'NONE_BY_CONSTRUCTION',
  licence: 'AS_RECORDED_BY_THE_SOURCE_ELSE_UNKNOWN',
  country: 'ADR_0024_JURISDICTION_CLAIM_ONLY_NEVER_INFERRED',
  reviews: 'ANY_DISPUTED_OR_REJECTED_REVIEW_EXCLUDES',
} as const);

// ---------------------------------------------------------------------------
// Records, as the loader reads them (timestamps ISO-8601 ms UTC).
// ---------------------------------------------------------------------------

export type SourceType = 'PAGE_EVIDENCE' | 'WEBSITE_CLAIM' | 'PUBLIC_URL';
export type ClaimBasis = 'SOURCE_STATED' | 'INFERRED';

export interface SubjectRowRecord {
  readonly id: string;
  readonly createdAt: string;
}

export interface IdentityClaimRecord {
  readonly id: string;
  readonly subjectId: string;
  readonly claimKind: string;
  readonly nameText: string | null;
  readonly nameLanguage: string | null;
  readonly websiteUrl: string | null;
  readonly sourceType: SourceType;
  readonly sourcePageEvidenceId: string | null;
  readonly sourceWebsiteClaimId: string | null;
  readonly sourceUrl: string | null;
  readonly sourceVersionRef: string | null;
  readonly observedAt: string;
  readonly claimBasis: ClaimBasis;
  readonly createdAt: string;
}

export interface ReviewRecord {
  readonly id: string;
  /** `subject:<uuid>` or `identity_claim:<uuid>` (migration 0013's generated key). */
  readonly targetKey: string;
  readonly outcome: string;
  readonly createdAt: string;
}

export interface NominationRecord {
  readonly id: string;
  readonly discoveryRunId: string;
  readonly url: string;
  readonly retrievedAt: string;
}

export interface PageEvidenceSourceRecord {
  readonly id: string;
  readonly researchRunId: string;
  readonly requestedUrl: string;
  readonly fetchObservedAt: string;
}

export interface WebsiteClaimSourceRecord {
  readonly id: string;
  readonly ingestRunId: string;
  readonly normalisedUrl: string | null;
  readonly observedAt: string;
}

export interface JurisdictionClaimRow extends JurisdictionClaimRecord {
  readonly createdAt: string;
}

export interface SubjectFactsRecords {
  readonly readAt: string;
  readonly requestedSubjectIds: readonly string[];
  readonly subjects: readonly SubjectRowRecord[];
  readonly identityClaims: readonly IdentityClaimRecord[];
  readonly reviews: readonly ReviewRecord[];
  readonly nominations: readonly NominationRecord[];
  readonly pageEvidenceSources: readonly PageEvidenceSourceRecord[];
  readonly websiteClaimSources: readonly WebsiteClaimSourceRecord[];
  readonly jurisdictionClaims: readonly JurisdictionClaimRow[];
}

// ---------------------------------------------------------------------------
// The document.
// ---------------------------------------------------------------------------

export type IngestRunKind = 'SOURCE_DISCOVERY_RUN' | 'ORGUNIT_RESEARCH_RUN' | 'INGEST_RUN';
export type SourceResolution =
  'SOURCE_DISCOVERY_NOMINATION' | 'PAGE_EVIDENCE' | 'WEBSITE_CLAIM' | 'UNRESOLVED';

export interface SourceCitation {
  /** Migration 0013's generated `provenance_key` form. */
  readonly sourceRef: string;
  readonly sourceType: SourceType;
  readonly sourceUrl: string | null;
  readonly resolution: SourceResolution;
  /** The id of the stored record the resolution names; null when UNRESOLVED. */
  readonly resolvedRecordId: string | null;
  readonly sourceLicence: string;
  readonly sourceRetrievedAt: string | null;
  readonly ingestRun: { readonly kind: IngestRunKind; readonly id: string } | null;
}

export type ExclusionReason = 'BASIS_INFERRED' | 'NEGATIVE_REVIEW_RECORDED';

export interface NameClaimFact {
  readonly claimId: string;
  readonly text: string;
  readonly language: string | null;
  readonly basis: ClaimBasis;
  readonly observedAt: string;
  readonly recordedAt: string;
  readonly excluded: ExclusionReason | null;
  readonly source: SourceCitation;
}

export interface WebsiteClaimFact {
  readonly claimId: string;
  readonly url: string;
  readonly host: string;
  readonly basis: ClaimBasis;
  readonly observedAt: string;
  readonly recordedAt: string;
  readonly excluded: ExclusionReason | null;
  readonly source: SourceCitation;
}

export type StatedValue<K extends string> =
  | { readonly state: 'UNKNOWN' }
  | ({ readonly state: 'STATED'; readonly claimIds: readonly string[] } & Record<K, string>)
  | { readonly state: 'CONFLICTING'; readonly values: readonly string[] };

export interface SubjectFacts {
  readonly subjectId: string;
  readonly engineCreatedAt: string;
  readonly engineUpdatedAt: string;
  readonly negativeReviewRecorded: boolean;
  readonly name: StatedValue<'text'>;
  readonly websiteHost: StatedValue<'host'>;
  readonly claimedCountry: string | null;
  readonly jurisdiction: ReturnType<typeof deriveJurisdictionStanding>;
  /** Of the earliest-recorded claim stating the name; null unless the name is STATED. */
  readonly provenance: {
    readonly basis: 'EARLIEST_RECORDED_STATING_NAME_CLAIM';
    readonly claimId: string;
    readonly source: SourceCitation;
  } | null;
  readonly nameClaims: readonly NameClaimFact[];
  readonly websiteClaims: readonly WebsiteClaimFact[];
}

export interface SubjectFactsDocument {
  readonly document: typeof SUBJECT_FACTS_EXPORT_CONTRACT;
  readonly ruleVersion: typeof SUBJECT_FACTS_RULE_VERSION;
  readonly sourceRepository: typeof ENGINE_SOURCE_REPOSITORY;
  readonly readConsistency: ReadConsistencyClass;
  readonly readAt: string;
  readonly permissions: typeof PERMISSIONS;
  readonly limitations: typeof LIMITATIONS;
  readonly subjects: readonly SubjectFacts[];
  /** Requested ids with no stored subject row: reported, never invented. */
  readonly missingSubjectIds: readonly string[];
}

export type SubjectFactsRefusalCode =
  'SUBJECT_ID_INVALID' | 'SUBJECT_ID_REPEATED' | 'BOUND_EXCEEDED' | 'RECORD_INCONSISTENT';

export class SubjectFactsRefusal extends Error {
  constructor(
    readonly code: SubjectFactsRefusalCode,
    readonly detail: string,
  ) {
    super(`subject facts export refused: ${code} (${detail})`);
    this.name = 'SubjectFactsRefusal';
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The requested ids, validated: UUIDs, unique, 1..MAX_SUBJECTS_PER_EXPORT. */
export function validateSubjectIds(ids: readonly string[]): readonly string[] {
  if (ids.length === 0 || ids.length > MAX_SUBJECTS_PER_EXPORT) {
    throw new SubjectFactsRefusal('BOUND_EXCEEDED', `subject ids: ${ids.length}`);
  }
  const seen = new Set<string>();
  for (const id of ids) {
    if (!UUID.test(id)) throw new SubjectFactsRefusal('SUBJECT_ID_INVALID', 'subjectId');
    if (seen.has(id)) throw new SubjectFactsRefusal('SUBJECT_ID_REPEATED', 'subjectId');
    seen.add(id);
  }
  return [...seen].sort();
}

const byRecorded = <T extends { readonly createdAt: string; readonly id: string }>(a: T, b: T) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;

const sourceRefOf = (c: IdentityClaimRecord): string =>
  c.sourceType === 'PAGE_EVIDENCE'
    ? `page_evidence:${c.sourcePageEvidenceId ?? ''}`
    : c.sourceType === 'WEBSITE_CLAIM'
      ? `website_claim:${c.sourceWebsiteClaimId ?? ''}`
      : `url:${c.sourceUrl ?? ''}|v=${c.sourceVersionRef ?? ''}`;

function citationOf(c: IdentityClaimRecord, records: SubjectFactsRecords): SourceCitation {
  const base = {
    sourceRef: sourceRefOf(c),
    sourceType: c.sourceType,
    sourceLicence: LICENCE_UNKNOWN,
  };
  if (c.sourceType === 'PAGE_EVIDENCE') {
    const page = records.pageEvidenceSources.find((p) => p.id === c.sourcePageEvidenceId);
    if (page !== undefined) {
      return {
        ...base,
        sourceUrl: page.requestedUrl,
        resolution: 'PAGE_EVIDENCE',
        resolvedRecordId: page.id,
        sourceRetrievedAt: page.fetchObservedAt,
        ingestRun: { kind: 'ORGUNIT_RESEARCH_RUN', id: page.researchRunId },
      };
    }
  } else if (c.sourceType === 'WEBSITE_CLAIM') {
    const claim = records.websiteClaimSources.find((w) => w.id === c.sourceWebsiteClaimId);
    if (claim !== undefined) {
      return {
        ...base,
        sourceUrl: claim.normalisedUrl,
        resolution: 'WEBSITE_CLAIM',
        resolvedRecordId: claim.id,
        sourceRetrievedAt: claim.observedAt,
        ingestRun: { kind: 'INGEST_RUN', id: claim.ingestRunId },
      };
    }
  } else if (c.sourceVersionRef !== null) {
    // Verified by recomputing the citation digest: a URL alone resolves nothing.
    const nomination = records.nominations.find(
      (n) => n.url === c.sourceUrl && nominationCitationDigestOf(n) === c.sourceVersionRef,
    );
    if (nomination !== undefined) {
      return {
        ...base,
        sourceUrl: c.sourceUrl,
        resolution: 'SOURCE_DISCOVERY_NOMINATION',
        resolvedRecordId: nomination.id,
        sourceRetrievedAt: nomination.retrievedAt,
        ingestRun: { kind: 'SOURCE_DISCOVERY_RUN', id: nomination.discoveryRunId },
      };
    }
  }
  return {
    ...base,
    sourceUrl: c.sourceType === 'PUBLIC_URL' ? c.sourceUrl : null,
    resolution: 'UNRESOLVED',
    resolvedRecordId: null,
    sourceRetrievedAt: null,
    ingestRun: null,
  };
}

function stated<K extends string>(
  key: K,
  admitted: readonly { readonly value: string; readonly claimId: string }[],
): StatedValue<K> {
  const values = [...new Set(admitted.map((a) => a.value))].sort();
  if (values.length === 0) return { state: 'UNKNOWN' };
  if (values.length > 1) return { state: 'CONFLICTING', values };
  return {
    state: 'STATED',
    [key]: values[0]!,
    claimIds: admitted.map((a) => a.claimId).sort(),
  } as StatedValue<K>;
}

const NEGATIVE_OUTCOMES: ReadonlySet<string> = new Set(['DISPUTED', 'REJECTED']);

function factsOf(subject: SubjectRowRecord, records: SubjectFactsRecords): SubjectFacts {
  const claims = records.identityClaims.filter((c) => c.subjectId === subject.id).sort(byRecorded);
  const claimIds = new Set(claims.map((c) => c.id));
  const reviews = records.reviews.filter(
    (r) =>
      r.targetKey === `subject:${subject.id}` ||
      (r.targetKey.startsWith('identity_claim:') &&
        claimIds.has(r.targetKey.slice('identity_claim:'.length))),
  );
  const jurisdiction = records.jurisdictionClaims.filter((j) => j.subjectId === subject.id);
  if (claims.length + reviews.length + jurisdiction.length > MAX_RECORDS_PER_SUBJECT) {
    throw new SubjectFactsRefusal('BOUND_EXCEEDED', `records of subject ${subject.id}`);
  }
  const negative = new Set(
    reviews.filter((r) => NEGATIVE_OUTCOMES.has(r.outcome)).map((r) => r.targetKey),
  );
  const subjectNegative = negative.has(`subject:${subject.id}`);
  const exclusionOf = (c: IdentityClaimRecord): ExclusionReason | null =>
    subjectNegative || negative.has(`identity_claim:${c.id}`)
      ? 'NEGATIVE_REVIEW_RECORDED'
      : c.claimBasis !== 'SOURCE_STATED'
        ? 'BASIS_INFERRED'
        : null;

  const nameClaims: NameClaimFact[] = claims
    .filter((c) => c.claimKind === 'NAME')
    .map((c) => {
      if (c.nameText === null) throw new SubjectFactsRefusal('RECORD_INCONSISTENT', c.id);
      return {
        claimId: c.id,
        text: c.nameText,
        language: c.nameLanguage,
        basis: c.claimBasis,
        observedAt: c.observedAt,
        recordedAt: c.createdAt,
        excluded: exclusionOf(c),
        source: citationOf(c, records),
      };
    });
  const websiteClaims: WebsiteClaimFact[] = claims
    .filter((c) => c.claimKind === 'PUBLIC_WEBSITE')
    .map((c) => {
      if (c.websiteUrl === null) throw new SubjectFactsRefusal('RECORD_INCONSISTENT', c.id);
      return {
        claimId: c.id,
        url: c.websiteUrl,
        host: new URL(c.websiteUrl).hostname,
        basis: c.claimBasis,
        observedAt: c.observedAt,
        recordedAt: c.createdAt,
        excluded: exclusionOf(c),
        source: citationOf(c, records),
      };
    });

  const name = stated(
    'text',
    nameClaims
      .filter((n) => n.excluded === null)
      .map((n) => ({ value: n.text, claimId: n.claimId })),
  );
  const websiteHost = stated(
    'host',
    websiteClaims
      .filter((w) => w.excluded === null)
      .map((w) => ({ value: w.host, claimId: w.claimId })),
  );
  // nameClaims is in recorded order, so the first admitted one stating the
  // name is the earliest-recorded stating claim.
  const first =
    name.state === 'STATED'
      ? nameClaims.find((n) => n.excluded === null && n.text === name.text)
      : undefined;
  const standing = deriveJurisdictionStanding(subject.id, jurisdiction);
  const operation = standing.countryOfOperation;
  const updated = [
    subject.createdAt,
    ...claims.map((c) => c.createdAt),
    ...reviews.map((r) => r.createdAt),
    ...jurisdiction.map((j) => j.createdAt),
  ].sort();
  return {
    subjectId: subject.id,
    engineCreatedAt: subject.createdAt,
    engineUpdatedAt: updated[updated.length - 1]!,
    negativeReviewRecorded: subjectNegative,
    name,
    websiteHost,
    claimedCountry: operation.state === 'STATED' ? operation.value : null,
    jurisdiction: standing,
    provenance:
      first === undefined
        ? null
        : {
            basis: 'EARLIEST_RECORDED_STATING_NAME_CLAIM',
            claimId: first.claimId,
            source: first.source,
          },
    nameClaims,
    websiteClaims,
  };
}

/** The document for exactly the requested subjects. Throws `SubjectFactsRefusal`. */
export function buildSubjectFactsDocument(
  records: SubjectFactsRecords,
  readConsistency: ReadConsistencyClass,
): SubjectFactsDocument {
  const requested = validateSubjectIds(records.requestedSubjectIds);
  const rows = new Map<string, SubjectRowRecord>();
  for (const row of records.subjects) {
    if (!requested.includes(row.id) || rows.has(row.id)) {
      throw new SubjectFactsRefusal('RECORD_INCONSISTENT', `subject row ${row.id}`);
    }
    rows.set(row.id, row);
  }
  for (const c of records.identityClaims) {
    if (!rows.has(c.subjectId)) {
      throw new SubjectFactsRefusal('RECORD_INCONSISTENT', `identity claim ${c.id}`);
    }
  }
  return {
    document: SUBJECT_FACTS_EXPORT_CONTRACT,
    ruleVersion: SUBJECT_FACTS_RULE_VERSION,
    sourceRepository: ENGINE_SOURCE_REPOSITORY,
    readConsistency,
    readAt: records.readAt,
    permissions: PERMISSIONS,
    limitations: LIMITATIONS,
    subjects: requested.filter((id) => rows.has(id)).map((id) => factsOf(rows.get(id)!, records)),
    missingSubjectIds: requested.filter((id) => !rows.has(id)),
  };
}

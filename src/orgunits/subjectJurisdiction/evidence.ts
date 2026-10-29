/**
 * GLOBAL R5 - THE ENGINE-LOCAL, PROVISIONAL SUBJECT-JURISDICTION EVIDENCE
 * COMPANION (`nwf-pe.subject-jurisdiction-evidence.v1-provisional`).
 *
 * WHAT THIS IS. One small, versioned document per Discovery Subject that
 * carries that subject's own migration-0016 jurisdiction claims exactly as
 * recorded, the R4 validation findings, and a derived, advisory reading of
 * what the claims jointly say. It accompanies - and binds by digest to - the
 * B2.4 subject-evidence document (`nwf-pe.discovery-subject-evidence.v1-provisional`),
 * which it neither imports, renames nor re-emits. It is the one interface
 * through which a consumer may see jurisdiction evidence; it is NOT a second
 * organisation record.
 *
 * WHAT THIS ADDS OVER R4's STANDING. R4 reports two different countries of
 * operation as CONFLICTING. A country of operation is not exclusive - an
 * organisation may operate in several - so R5 separates:
 *   - MULTI_COUNTRY_SOURCE_STATED: ONE source (one provenance key) itself
 *     states every country named, i.e. the source asserts a multi-country
 *     operation;
 *   - DIVERGENT_UNRESOLVED: sources name different countries and no single
 *     source states the whole set - a partial view and a genuine conflict are
 *     indistinguishable here, so neither is concluded.
 * Registration country and legal form are single-valued: two values are
 * CONFLICTING, as in R4. NOTHING IS RESOLVED: every reading other than
 * UNKNOWN or a single agreed value is listed in `openQuestions` for an OWNER
 * review that has no authority yet (ADR 0024 s6). R4's standing is reused,
 * not edited: its rule version stays `subject-jurisdiction-rules-v1`.
 *
 * WHAT THIS IS NOT.
 *   - Not ratified: ADR 0024 is Proposed, migration 0016 is not activated.
 *   - Not identity: the subject id is B's evidence-container id. Nothing here
 *     issues, links or reserves a canonical identifier (RC2 s1: I0 only), and
 *     a shared country links nothing.
 *   - Not ECHE: no eche_row_key, Erasmus code, PIC or Country Cd appears, and
 *     no claim is inherited along PART_OF or any other relationship.
 *   - Not a permission: every capability is the literal `NONE`. A stated
 *     country is not a lawful basis for contact anywhere.
 *   - Not signed, not complete, not fresh: see LIMITATIONS.
 *
 * PURE apart from SHA-256: no socket, no database, no filesystem, no
 * environment, no clock. Does not import the B2.1 identity namespace, the
 * B2.3 review namespace or the B2.4 handoff namespace.
 */
import { createHash } from 'node:crypto';

import {
  SUBJECT_JURISDICTION_RULE_VERSION,
  deriveJurisdictionStanding,
  jurisdictionProvenanceKeyOf,
  validateJurisdictionClaim,
  type JurisdictionFindingCode,
} from './standing.js';
import {
  ISO_3166_1_ALPHA2_LIST_SHA256,
  type Iso3166Alpha2,
  type JurisdictionClaimRecord,
  type LegalForm,
} from './vocabulary.js';

export const JURISDICTION_EVIDENCE_CONTRACT = 'nwf-pe.subject-jurisdiction-evidence.v1-provisional';
export const JURISDICTION_EVIDENCE_CONTRACT_STATUS = 'ENGINE_LOCAL_PROVISIONAL_ADR_0024_PROPOSED';
export const JURISDICTION_EVIDENCE_RULE_VERSION = 'subject-jurisdiction-evidence-rules-v1';

/**
 * The kind of document this companion binds to by digest: B2.4's subject
 * evidence document. A LABEL, never its contract string - the B2.4 firewall
 * keeps that name out of every production file but its own - and never an
 * import: binding is a digest reference, not consumption.
 */
export const BOUND_DOCUMENT_KIND = 'B2_4_SUBJECT_EVIDENCE';

export const ENGINE_SOURCE_REPOSITORY = 'nwf-partnership-engine';

export const READ_CONSISTENCY_CLASSES = [
  'SINGLE_SNAPSHOT_TRANSACTION',
  'MULTI_STATEMENT_READ_COMMITTED',
  'SYNTHETIC_IN_MEMORY',
] as const;
export type ReadConsistencyClass = (typeof READ_CONSISTENCY_CLASSES)[number];

export interface JurisdictionEvidenceContext {
  readonly contract: typeof JURISDICTION_EVIDENCE_CONTRACT;
  readonly subjectId: string;
  /** SHA-256 of the B2.4 document for the same subject; null when none was produced. */
  readonly subjectEvidenceDocumentDigest: string | null;
  readonly sourceRepository: typeof ENGINE_SOURCE_REPOSITORY;
  /** A 40-hex git commit, or null. INFORMATIONAL. */
  readonly sourceRevision: string | null;
  readonly readConsistency: ReadConsistencyClass;
  /** ISO-8601 ms UTC. INFORMATIONAL: never a freshness proof. */
  readonly producedAt: string;
}

const CONTEXT_KEYS = [
  'contract',
  'producedAt',
  'readConsistency',
  'sourceRepository',
  'sourceRevision',
  'subjectEvidenceDocumentDigest',
  'subjectId',
] as const;

const CLAIM_KEYS = [
  'claimBasis',
  'claimKind',
  'claimedCountry',
  'claimedLegalForm',
  'id',
  'observedAt',
  'recordedByActorKey',
  'sourcePageEvidenceId',
  'sourceType',
  'sourceUrl',
  'sourceVersionRef',
  'sourceWebsiteClaimId',
  'subjectId',
] as const;

/** Every capability is `NONE`, by type and by value. */
export const PERMISSIONS = Object.freeze({
  research: 'NONE',
  canonicalIssuance: 'NONE',
  canonicalLinking: 'NONE',
  qualification: 'NONE',
  memberRelease: 'NONE',
  publication: 'NONE',
  outreach: 'NONE',
  contactPermission: 'NONE',
  suppressionClearance: 'NONE',
} as const);

export const LIMITATIONS = Object.freeze({
  documentSignature: 'NONE_NOT_A_SIGNED_EXPORT',
  completeness: 'NOT_PROVEN_AN_UNSIGNED_EXPORT_IS_NOT_PROOF_OF_COMPLETENESS',
  freshness: 'NOT_PROVEN_PRODUCED_AT_IS_INFORMATIONAL',
  producerDigests: 'NOT_AN_EXTERNAL_TRUST_ANCHOR',
  producerReading: 'ADVISORY_CONSUMER_MUST_REVERIFY',
  sourceUrlAdmissibility: 'ENFORCED_BY_MIGRATION_0013_PREDICATE_ONLY_NOT_REVERIFIED_HERE',
  absenceOfClaims: 'UNKNOWN_NEVER_A_DEFAULT',
  echeRegistryCountry: 'NEVER_A_JURISDICTION_SOURCE',
  relationships: 'NO_CLAIM_IS_INHERITED',
  jurisdictionReview: 'NO_REVIEW_AUTHORITY_EXISTS_ADR_0024_S6',
  ratification: 'ADR_0024_PROPOSED_MIGRATION_0016_NOT_ACTIVATED',
} as const);

export const MAX_CLAIMS = 500;

export const REFUSAL_CODES = [
  'CONTRACT_UNKNOWN',
  'CONTEXT_SHAPE_INVALID',
  'CLAIM_SHAPE_UNSUPPORTED',
  'SUBJECT_IDENTIFIER_INCONSISTENT',
  'DUPLICATE_CLAIM_ID',
  'BOUND_EXCEEDED',
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HEX64 = /^[0-9a-f]{64}$/;
const GIT_REVISION = /^[0-9a-f]{40}$/;
const INSTANT_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

class Refusal extends Error {
  constructor(
    readonly code: RefusalCode,
    readonly detail: string,
  ) {
    super(`jurisdiction evidence refused: ${code} (${detail})`);
  }
}

function refuse(code: RefusalCode, detail: string): never {
  throw new Refusal(code, detail);
}

// ------------------------------------------------------------ canonical JSON

/**
 * The B2.3 canonical encoding, restated (not imported: the B2.3 review
 * namespace's importer set is frozen): sorted keys, no whitespace, strings,
 * null, booleans, arrays and plain objects only - NO NUMBERS.
 */
export type CanonicalValue =
  null | boolean | string | readonly CanonicalValue[] | { readonly [key: string]: CanonicalValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 16) throw new TypeError('canonical: nesting_too_deep');
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v, depth + 1)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => {
        const v = value[k];
        if (v === undefined) throw new TypeError('canonical: undefined_value');
        return `${JSON.stringify(k)}:${canonicalJson(v, depth + 1)}`;
      })
      .join(',')}}`;
  }
  throw new TypeError(`canonical: unsupported_${typeof value}`);
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

// ------------------------------------------------------------ input checks

function exactlyKeyed(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    isPlainObject(value) &&
    canonicalJson([...Object.keys(value)].sort()) === canonicalJson([...keys].sort())
  );
}

function checkContext(context: unknown): JurisdictionEvidenceContext {
  if (!isPlainObject(context) || context['contract'] !== JURISDICTION_EVIDENCE_CONTRACT) {
    refuse('CONTRACT_UNKNOWN', 'contract');
  }
  if (!exactlyKeyed(context, CONTEXT_KEYS)) refuse('CONTEXT_SHAPE_INVALID', 'keys');
  const c = context as unknown as JurisdictionEvidenceContext;
  if (typeof c.subjectId !== 'string' || !UUID.test(c.subjectId)) {
    refuse('CONTEXT_SHAPE_INVALID', 'subjectId');
  }
  if (
    c.subjectEvidenceDocumentDigest !== null &&
    (typeof c.subjectEvidenceDocumentDigest !== 'string' ||
      !HEX64.test(c.subjectEvidenceDocumentDigest))
  ) {
    refuse('CONTEXT_SHAPE_INVALID', 'subjectEvidenceDocumentDigest');
  }
  if (c.sourceRepository !== ENGINE_SOURCE_REPOSITORY) {
    refuse('CONTEXT_SHAPE_INVALID', 'sourceRepository');
  }
  if (
    c.sourceRevision !== null &&
    (typeof c.sourceRevision !== 'string' || !GIT_REVISION.test(c.sourceRevision))
  ) {
    refuse('CONTEXT_SHAPE_INVALID', 'sourceRevision');
  }
  if (!(READ_CONSISTENCY_CLASSES as readonly unknown[]).includes(c.readConsistency)) {
    refuse('CONTEXT_SHAPE_INVALID', 'readConsistency');
  }
  if (typeof c.producedAt !== 'string' || !INSTANT_MS.test(c.producedAt)) {
    refuse('CONTEXT_SHAPE_INVALID', 'producedAt');
  }
  return c;
}

function checkClaims(claims: unknown, subjectId: string): JurisdictionClaimRecord[] {
  if (!Array.isArray(claims)) refuse('CLAIM_SHAPE_UNSUPPORTED', 'not_an_array');
  if (claims.length > MAX_CLAIMS) refuse('BOUND_EXCEEDED', 'claims');
  const seen = new Set<string>();
  for (const claim of claims as unknown[]) {
    if (!exactlyKeyed(claim, CLAIM_KEYS)) refuse('CLAIM_SHAPE_UNSUPPORTED', 'keys');
    for (const key of CLAIM_KEYS) {
      const value = claim[key];
      if (value !== null && typeof value !== 'string') refuse('CLAIM_SHAPE_UNSUPPORTED', key);
    }
    const id = claim['id'];
    if (typeof id !== 'string' || !UUID.test(id)) refuse('CLAIM_SHAPE_UNSUPPORTED', 'id');
    if (typeof claim['observedAt'] !== 'string' || !INSTANT_MS.test(claim['observedAt'])) {
      refuse('CLAIM_SHAPE_UNSUPPORTED', 'observedAt');
    }
    if (claim['subjectId'] !== subjectId) refuse('SUBJECT_IDENTIFIER_INCONSISTENT', id);
    if (seen.has(id)) refuse('DUPLICATE_CLAIM_ID', id);
    seen.add(id);
  }
  return [...(claims as JurisdictionClaimRecord[])].sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ------------------------------------------------------------ the reading

export interface StatedValue<T extends string> {
  readonly value: T;
  readonly provenanceKeys: readonly string[];
}

export type OperationFootprint =
  | { readonly state: 'UNKNOWN' }
  | {
      readonly state: 'SINGLE_COUNTRY_STATED';
      readonly countries: readonly StatedValue<Iso3166Alpha2>[];
    }
  | {
      readonly state: 'MULTI_COUNTRY_SOURCE_STATED';
      readonly countries: readonly StatedValue<Iso3166Alpha2>[];
      /** The sources that each state the WHOLE set themselves. */
      readonly coStatingProvenanceKeys: readonly string[];
    }
  | {
      readonly state: 'DIVERGENT_UNRESOLVED';
      readonly countries: readonly StatedValue<Iso3166Alpha2>[];
    };

export type SingleValued<T extends string> =
  | { readonly state: 'UNKNOWN' }
  | { readonly state: 'STATED'; readonly values: readonly StatedValue<T>[] }
  | { readonly state: 'CONFLICTING'; readonly values: readonly StatedValue<T>[] };

export const OPEN_QUESTIONS = [
  'CLAIMS_EXCLUDED_AS_INVALID',
  'COUNTRY_OF_OPERATION_DIVERGENT',
  'COUNTRY_OF_OPERATION_MULTI_COUNTRY_UNREVIEWED',
  'COUNTRY_OF_REGISTRATION_CONFLICTING',
  'LEGAL_FORM_CONFLICTING',
] as const;
export type OpenQuestion = (typeof OPEN_QUESTIONS)[number];

function grouped<T extends string>(
  pairs: readonly { value: T; provenanceKey: string }[],
): StatedValue<T>[] {
  const byValue = new Map<T, Set<string>>();
  for (const { value, provenanceKey } of pairs) {
    byValue.set(value, (byValue.get(value) ?? new Set()).add(provenanceKey));
  }
  return [...byValue.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([value, keys]) => ({ value, provenanceKeys: [...keys].sort() }));
}

function singleValued<T extends string>(
  pairs: readonly { value: T; provenanceKey: string }[],
): SingleValued<T> {
  const values = grouped(pairs);
  if (values.length === 0) return { state: 'UNKNOWN' };
  return { state: values.length === 1 ? 'STATED' : 'CONFLICTING', values };
}

function operationFootprint(
  pairs: readonly { value: Iso3166Alpha2; provenanceKey: string }[],
): OperationFootprint {
  const countries = grouped(pairs);
  if (countries.length === 0) return { state: 'UNKNOWN' };
  if (countries.length === 1) return { state: 'SINGLE_COUNTRY_STATED', countries };
  const bySource = new Map<string, Set<string>>();
  for (const { value, provenanceKey } of pairs) {
    bySource.set(provenanceKey, (bySource.get(provenanceKey) ?? new Set()).add(value));
  }
  const coStating = [...bySource.entries()]
    .filter(([, stated]) => stated.size === countries.length)
    .map(([key]) => key)
    .sort();
  return coStating.length > 0
    ? { state: 'MULTI_COUNTRY_SOURCE_STATED', countries, coStatingProvenanceKeys: coStating }
    : { state: 'DIVERGENT_UNRESOLVED', countries };
}

// ------------------------------------------------------------ the document

export interface JurisdictionEvidenceDocument {
  readonly contract: typeof JURISDICTION_EVIDENCE_CONTRACT;
  readonly contractStatus: typeof JURISDICTION_EVIDENCE_CONTRACT_STATUS;
  readonly ruleVersions: CanonicalValue;
  readonly subject: CanonicalValue;
  readonly source: CanonicalValue;
  readonly claims: CanonicalValue;
  readonly excluded: CanonicalValue;
  readonly reading: CanonicalValue;
  readonly openQuestions: readonly OpenQuestion[];
  readonly review: CanonicalValue;
  readonly digests: CanonicalValue;
  readonly permissions: typeof PERMISSIONS;
  readonly limitations: typeof LIMITATIONS;
}

export type JurisdictionEvidenceResult =
  | {
      readonly outcome: 'PROJECTED';
      readonly document: JurisdictionEvidenceDocument;
      readonly canonical: string;
      /** SHA-256 of `${contract}\n${canonical}`. Producer-computed: never a trust anchor. */
      readonly documentDigest: string;
    }
  | { readonly outcome: 'REFUSED'; readonly code: RefusalCode; readonly detail: string };

function build(
  c: JurisdictionEvidenceContext,
  claims: readonly JurisdictionClaimRecord[],
): JurisdictionEvidenceResult {
  const excluded: { claimId: string; findings: JurisdictionFindingCode[] }[] = [];
  const operation: { value: Iso3166Alpha2; provenanceKey: string }[] = [];
  const registration: { value: Iso3166Alpha2; provenanceKey: string }[] = [];
  const legalForm: { value: LegalForm; provenanceKey: string }[] = [];
  for (const claim of claims) {
    const findings = validateJurisdictionClaim(claim);
    if (findings.length > 0) {
      excluded.push({ claimId: claim.id, findings: [...findings].sort() });
      continue;
    }
    const provenanceKey = jurisdictionProvenanceKeyOf(claim);
    if (claim.claimKind === 'LEGAL_FORM') {
      legalForm.push({ value: claim.claimedLegalForm as LegalForm, provenanceKey });
    } else {
      (claim.claimKind === 'COUNTRY_OF_OPERATION' ? operation : registration).push({
        value: claim.claimedCountry as Iso3166Alpha2,
        provenanceKey,
      });
    }
  }
  const reading = {
    countryOfOperation: operationFootprint(operation),
    countryOfRegistration: singleValued(registration),
    legalForm: singleValued(legalForm),
  };

  // R4's standing over the same claims must agree wherever R4 had an answer.
  const r4 = deriveJurisdictionStanding(c.subjectId, claims);
  const agrees =
    r4.countryOfRegistration.state === reading.countryOfRegistration.state &&
    r4.legalForm.state === reading.legalForm.state &&
    (r4.countryOfOperation.state === 'CONFLICTING') ===
      (reading.countryOfOperation.state === 'MULTI_COUNTRY_SOURCE_STATED' ||
        reading.countryOfOperation.state === 'DIVERGENT_UNRESOLVED');
  if (!agrees) throw new Error('jurisdiction evidence: R4 standing disagrees (internal)');

  const open = new Set<OpenQuestion>();
  if (excluded.length > 0) open.add('CLAIMS_EXCLUDED_AS_INVALID');
  if (reading.countryOfOperation.state === 'DIVERGENT_UNRESOLVED') {
    open.add('COUNTRY_OF_OPERATION_DIVERGENT');
  }
  if (reading.countryOfOperation.state === 'MULTI_COUNTRY_SOURCE_STATED') {
    open.add('COUNTRY_OF_OPERATION_MULTI_COUNTRY_UNREVIEWED');
  }
  if (reading.countryOfRegistration.state === 'CONFLICTING') {
    open.add('COUNTRY_OF_REGISTRATION_CONFLICTING');
  }
  if (reading.legalForm.state === 'CONFLICTING') open.add('LEGAL_FORM_CONFLICTING');

  const claimsValue = claims as unknown as CanonicalValue;
  const document: JurisdictionEvidenceDocument = {
    contract: JURISDICTION_EVIDENCE_CONTRACT,
    contractStatus: JURISDICTION_EVIDENCE_CONTRACT_STATUS,
    ruleVersions: {
      claimValidation: SUBJECT_JURISDICTION_RULE_VERSION,
      evidence: JURISDICTION_EVIDENCE_RULE_VERSION,
      iso3166Alpha2ListSha256: ISO_3166_1_ALPHA2_LIST_SHA256,
    },
    subject: {
      discoverySubjectId: c.subjectId,
      boundDocumentKind: BOUND_DOCUMENT_KIND,
      subjectEvidenceDocumentDigest: c.subjectEvidenceDocumentDigest,
    },
    source: {
      sourceRepository: c.sourceRepository,
      sourceRevision: c.sourceRevision,
      readConsistency: c.readConsistency,
      producedAt: c.producedAt,
    },
    claims: claimsValue,
    excluded: excluded as unknown as CanonicalValue,
    reading: reading as unknown as CanonicalValue,
    openQuestions: [...open].sort(),
    review: { state: 'UNREVIEWED', authority: 'NONE_ASSIGNED' },
    digests: {
      claims: sha256(`${JURISDICTION_EVIDENCE_CONTRACT}/claims\n${canonicalJson(claimsValue)}`),
      claimCount: String(claims.length),
    },
    permissions: PERMISSIONS,
    limitations: LIMITATIONS,
  };
  const canonical = canonicalJson(document);
  return {
    outcome: 'PROJECTED',
    document,
    canonical,
    documentDigest: sha256(`${JURISDICTION_EVIDENCE_CONTRACT}\n${canonical}`),
  };
}

/**
 * Projects ONE subject's jurisdiction claims. Deterministic: the same claims
 * in any order under the same context yield the same bytes. A claim about any
 * other subject is refused, not ignored - the input must be this subject's.
 */
export function projectJurisdictionEvidence(
  claims: unknown,
  context: unknown,
): JurisdictionEvidenceResult {
  try {
    const c = checkContext(context);
    return build(c, checkClaims(claims, c.subjectId));
  } catch (error) {
    if (error instanceof Refusal)
      return { outcome: 'REFUSED', code: error.code, detail: error.detail };
    throw error;
  }
}

export type ReproductionResult =
  | { readonly state: 'REPRODUCED'; readonly documentDigest: string }
  | { readonly state: 'NOT_REPRODUCIBLE'; readonly reason: string };

/**
 * Re-runs the projection from a document's OWN claims and context and
 * compares canonical bytes, so an edited reading, a dropped open question or
 * a relabelled permission fails. Total: never throws.
 */
export function reproduceJurisdictionEvidence(document: unknown): ReproductionResult {
  try {
    if (!isPlainObject(document) || document['contract'] !== JURISDICTION_EVIDENCE_CONTRACT) {
      return { state: 'NOT_REPRODUCIBLE', reason: 'contract_unknown' };
    }
    const subject = document['subject'] as Record<string, unknown>;
    const source = document['source'] as Record<string, unknown>;
    const again = projectJurisdictionEvidence(document['claims'], {
      contract: JURISDICTION_EVIDENCE_CONTRACT,
      subjectId: subject['discoverySubjectId'],
      subjectEvidenceDocumentDigest: subject['subjectEvidenceDocumentDigest'],
      sourceRepository: source['sourceRepository'],
      sourceRevision: source['sourceRevision'],
      readConsistency: source['readConsistency'],
      producedAt: source['producedAt'],
    });
    if (again.outcome === 'REFUSED')
      return { state: 'NOT_REPRODUCIBLE', reason: `refused:${again.code}` };
    return again.canonical === canonicalJson(document)
      ? { state: 'REPRODUCED', documentDigest: again.documentDigest }
      : { state: 'NOT_REPRODUCIBLE', reason: 'document_differs' };
  } catch {
    return { state: 'NOT_REPRODUCIBLE', reason: 'document_shape' };
  }
}

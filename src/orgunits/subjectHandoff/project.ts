/**
 * TRACK B, B2.4-R1a - THE PURE, DETERMINISTIC SUBJECT-EVIDENCE PROJECTION.
 *
 * Takes ONE already loaded B2.3 subject graph, its explicitly supplied
 * context and a sealed review trust set, and returns either a canonical
 * `nwf-pe.discovery-subject-evidence.v1-provisional` document or a refusal.
 *
 * IT DERIVES NOTHING OF ITS OWN. Identity state comes from the accepted B2.2 /
 * B2.3-R2 read model (`deriveSubjectReadModel`), which runs the B2.1
 * validator and re-verifies every review attestation through the one
 * effective-review projection. This module only checks that the input is a
 * well-formed, consistent graph, then lays the read model's answer beside
 * the raw records it was derived from, in five categories kept apart:
 *
 *   A source        who produced it and from what - every revision and
 *                   instant marked INFORMATIONAL;
 *   B records       the canonical B2.1 records exactly as loaded: original
 *                   registered and claimed kinds, `targetEcheRowKey` in its
 *                   original Engine `CODE|PIC` form, provenance, recording
 *                   actors, observation instants;
 *   C reviewEvidence the stored B2.3 attestations exactly as signed, and the
 *                   unsigned database instants, labelled as such;
 *   D assessment    the producer's derived state, ADVISORY: recorded history
 *                   and effective authority side by side, integrity holds,
 *                   protection, research authority (never granted); its
 *                   identity verdicts answer for EVERY finding the document
 *                   carries, input-scoped ones included (B2.4-R2);
 *   E observations  typed relationships, website observations (never a
 *                   verified channel) and source-backed identifiers;
 * plus the canonical findings (findings.ts), the I0 v1 compatibility
 * diagnostics, the all-`NONE` permissions and the fixed limitations.
 *
 * REFUSED, NOT REPRESENTED: malformed or inconsistent INPUT - an unknown
 * contract, an unsupported shape, an out-of-vocabulary or inadmissible value
 * (which an export must never copy), an inconsistent subject id, a truncated
 * or dangling graph, a duplicate record id, an attestation naming no loaded
 * review, an inconsistent environment, reviews whose authority was not
 * assessed, an unsealed or mismatched trust context, a bound exceeded.
 * REPRESENTED, NOT REFUSED: a well-formed subject with unresolved claims,
 * conflicts, broken review chains or integrity holds - those are findings.
 *
 * `reproduceSubjectEvidence` re-runs the projection from a document's own
 * records under the CALLER's trust set and compares bytes. It proves only
 * that the document's assessment follows from its records under that trust;
 * it proves nothing about completeness or freshness, and the trust context a
 * document embeds is never used.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { createHash } from 'node:crypto';

import { provenanceKeyOf, validateIdentityGraph } from '../identity/validate.js';
import {
  DISCOVERY_IDENTITY_RULE_VERSION,
  STRUCTURAL_PREDICATE,
  type IdentityClaimRecord,
  type RelationshipClaimRecord,
} from '../identity/vocabulary.js';
import {
  deriveSubjectReadModel,
  type FindingView,
  type SubjectGraph,
  type SubjectReadModel,
} from '../subjectRegistry/readModel.js';
import { SUBJECT_REGISTRY_CONTRACT } from '../subjectRegistry/requests.js';
import type {
  LoadedReviewAttestations,
  ReviewAttestationRecord,
} from '../subjectRegistry/reviewAttestation.js';
import { canonicalJson, type CanonicalValue } from '../subjectReview/canonical.js';
import {
  NONCE,
  REVIEW_EVIDENCE_RULES_VERSION,
  REVIEW_KEY_ID,
  REVIEW_PROTOCOL,
} from '../subjectReview/protocol.js';
import { ReviewTrustSet } from '../subjectReview/trust.js';
import {
  AUTHORITY_SCOPES,
  CANONICAL_ISSUER,
  CONTEXT_KEYS,
  ENGINE_SOURCE_REPOSITORY,
  GIT_REVISION,
  HEX64,
  INSTANT_MS,
  LEGAL_INDEPENDENCE,
  LIMITATIONS,
  MAX_ATTESTATIONS,
  MAX_DOCUMENT_BYTES,
  MAX_FINDINGS,
  MAX_RECORDS,
  MAX_SUBJECTS,
  NEIGHBOURHOOD_EXTENTS,
  PERMISSIONS,
  RC2_SHARED_HANDOFF_CONTRACT,
  READ_CONSISTENCY_CLASSES,
  SUBJECT_EVIDENCE_CONTRACT,
  SUBJECT_EVIDENCE_CONTRACT_STATUS,
  SubjectEvidenceRefusal,
  UUID,
  type RefusalCode,
  type SubjectEvidenceContext,
} from './contract.js';
import {
  evidenceFindingsDigestOf,
  evidenceFindingsOf,
  i0V1FindingsRenderingOf,
  INPUT_RECORD_ID,
  type EvidenceFinding,
} from './findings.js';

// ------------------------------------------------------------------ closed input shapes

/** The exact B2.1 record shapes (vocabulary.ts). The document's record schema is exactly these. */
const PROVENANCE_KEYS = [
  'sourceType',
  'sourcePageEvidenceId',
  'sourceWebsiteClaimId',
  'sourceUrl',
  'sourceVersionRef',
  'observedAt',
  'claimBasis',
  'recordedByActorKey',
];
const RECORD_KEYS = {
  subjects: ['id', 'registeredKind', 'registeredByActorKey', 'registrationNote'],
  identityClaims: [
    'id',
    'subjectId',
    'claimKind',
    'nameText',
    'nameLanguage',
    'claimedKind',
    'websiteUrl',
    'identifierScheme',
    'identifierValue',
    ...PROVENANCE_KEYS,
  ],
  relationshipClaims: [
    'id',
    'subjectId',
    'predicate',
    'targetSubjectId',
    'targetEcheRowKey',
    ...PROVENANCE_KEYS,
  ],
  reviews: [
    'id',
    'reviewedSubjectId',
    'reviewedIdentityClaimId',
    'reviewedRelationshipClaimId',
    'reviewOutcome',
    'supersedesReviewId',
    'actorKey',
    'reviewedAt',
    'reason',
  ],
} as const;
type Collection = keyof typeof RECORD_KEYS;
const COLLECTIONS = Object.keys(RECORD_KEYS) as Collection[];

/** The exact stored attestation row (reviewAttestation.ts). */
const ATTESTATION_KEYS = [
  'id',
  'reviewId',
  'environmentId',
  'protocol',
  'action',
  'keyId',
  'keyFingerprint',
  'nonce',
  'subjectId',
  'reviewTargetKey',
  'reviewOutcome',
  'expectedHeadReviewId',
  'subjectStateDigest',
  'evidenceSnapshotDigest',
  'targetRecordDigest',
  'ruleVersion',
  'issuedAt',
  'expiresAt',
  'signedPayload',
  'signature',
  'payloadSha256',
  'recordedAt',
];

/**
 * B2.1 INVALID codes that mean a record carries a value outside its closed
 * vocabulary or admissibility rule - free text an export must never copy.
 * Migration 0013 refuses every one of them, so no stored row produces one.
 */
const INADMISSIBLE_CONTENT_CODES = new Set([
  'PROHIBITED_FIELD',
  'NAME_INADMISSIBLE',
  'NOTE_INADMISSIBLE',
  'WEBSITE_URL_INADMISSIBLE',
  'SOURCE_URL_INADMISSIBLE',
  'NAME_LANGUAGE_INVALID',
  'IDENTIFIER_SCHEME_UNKNOWN',
  'IDENTIFIER_SHAPE_INVALID',
  'ENTITY_KIND_UNKNOWN',
  'CLAIM_KIND_UNKNOWN',
  'PREDICATE_UNKNOWN',
  'REVIEW_OUTCOME_UNKNOWN',
  'CLAIM_BASIS_UNKNOWN',
  'ACTOR_KEY_INVALID',
  'SOURCE_VERSION_REF_INVALID',
  'TIMESTAMP_INVALID',
  'RECORD_ID_INVALID',
]);

/** ISO-8601 UTC with up to microseconds: the store's `to_char(... .US)` form, or ms. */
const STORED_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

const refuse = (code: RefusalCode, detail: string): never => {
  throw new SubjectEvidenceRefusal(code, detail);
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
};
const sameKeys = (v: Record<string, unknown>, keys: readonly string[]) => {
  const have = Object.keys(v).sort();
  const want = [...keys].sort();
  return have.length === want.length && have.every((k, i) => k === want[i]);
};
const oneOf = (values: readonly string[], v: unknown): boolean =>
  typeof v === 'string' && values.includes(v);
const byId = <T extends { readonly id: string }>(a: T, b: T) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const instantOk = (v: unknown, pattern: RegExp) =>
  typeof v === 'string' && pattern.test(v) && !Number.isNaN(Date.parse(v));

function checkContext(raw: unknown): SubjectEvidenceContext {
  if (!isPlainObject(raw)) return refuse('CONTEXT_SHAPE_INVALID', 'context_not_object');
  if (raw['contract'] !== SUBJECT_EVIDENCE_CONTRACT) return refuse('CONTRACT_UNKNOWN', 'contract');
  if (!sameKeys(raw, CONTEXT_KEYS)) return refuse('CONTEXT_SHAPE_INVALID', 'context_fields');
  const c = raw as unknown as SubjectEvidenceContext;
  const problems = [
    typeof c.subjectId === 'string' && UUID.test(c.subjectId) ? null : 'subjectId',
    c.sourceRepository === ENGINE_SOURCE_REPOSITORY ? null : 'sourceRepository',
    c.sourceRevision === null ||
    (typeof c.sourceRevision === 'string' && GIT_REVISION.test(c.sourceRevision))
      ? null
      : 'sourceRevision',
    c.engineEnvironmentId === null ||
    (typeof c.engineEnvironmentId === 'string' && UUID.test(c.engineEnvironmentId))
      ? null
      : 'engineEnvironmentId',
    oneOf(READ_CONSISTENCY_CLASSES, c.readConsistency) ? null : 'readConsistency',
    oneOf(NEIGHBOURHOOD_EXTENTS, c.neighbourhood) ? null : 'neighbourhood',
    instantOk(c.producedAt, INSTANT_MS) ? null : 'producedAt',
    oneOf(AUTHORITY_SCOPES, c.authorityScope) ? null : 'authorityScope',
  ].filter((p) => p !== null);
  if (problems.length > 0) refuse('CONTEXT_SHAPE_INVALID', problems.join(','));
  return c;
}

/** A shape-checked copy of the graph, every collection sorted by id. */
function checkGraph(raw: unknown): SubjectGraph {
  if (!isPlainObject(raw)) return refuse('INPUT_SHAPE_UNSUPPORTED', 'graph_not_object');
  const graphKeys = ['focalSubjectId', 'input', 'recordedAt'];
  if (!sameKeys(raw, 'attestations' in raw ? [...graphKeys, 'attestations'] : graphKeys)) {
    refuse('INPUT_SHAPE_UNSUPPORTED', 'graph_fields');
  }
  const input = raw['input'];
  if (
    !isPlainObject(input) ||
    !sameKeys(input, [...COLLECTIONS, 'knownEcheRowKeys', 'asOf']) ||
    COLLECTIONS.some((c) => !Array.isArray(input[c])) ||
    !Array.isArray(input['knownEcheRowKeys']) ||
    (input['knownEcheRowKeys'] as unknown[]).some((k) => typeof k !== 'string') ||
    typeof input['asOf'] !== 'string'
  ) {
    refuse('INPUT_SHAPE_UNSUPPORTED', 'graph_input');
  }
  const inputRecord = input as Record<string, unknown[]>;
  const collections = {} as Record<Collection, Record<string, string | null>[]>;
  let total = 0;
  for (const name of COLLECTIONS) {
    const list = inputRecord[name]!;
    total += list.length;
    collections[name] = list.map((record, index) => {
      if (
        !isPlainObject(record) ||
        !sameKeys(record, RECORD_KEYS[name]) ||
        Object.values(record).some((v) => v !== null && typeof v !== 'string')
      ) {
        return refuse('RECORD_SHAPE_UNSUPPORTED', `${name}[${index}]`);
      }
      if (!UUID.test(record['id'] as string))
        refuse('RECORD_SHAPE_UNSUPPORTED', `${name}[${index}].id`);
      return { ...(record as Record<string, string | null>) };
    });
  }
  if (collections.subjects.length > MAX_SUBJECTS) refuse('BOUND_EXCEEDED', 'subjects');
  if (total > MAX_RECORDS) refuse('BOUND_EXCEEDED', 'records');

  const seen = new Map<string, string>();
  for (const name of COLLECTIONS) {
    for (const record of collections[name]) {
      const id = record['id'] as string;
      const content = canonicalJson(record);
      const prior = seen.get(id);
      if (prior !== undefined) {
        refuse('DUPLICATE_RECORD_ID', prior === content ? 'repeated' : 'conflicting');
      }
      seen.set(id, content);
    }
  }
  for (const review of collections.reviews) {
    const targets = [
      review['reviewedSubjectId'],
      review['reviewedIdentityClaimId'],
      review['reviewedRelationshipClaimId'],
    ].filter((t) => t !== null);
    if (targets.length !== 1) refuse('RECORD_SHAPE_UNSUPPORTED', 'review_target');
  }

  const recordedAt = raw['recordedAt'];
  if (
    !isPlainObject(recordedAt) ||
    Object.entries(recordedAt).some(([id, at]) => !seen.has(id) || !instantOk(at, STORED_INSTANT))
  ) {
    refuse('INPUT_SHAPE_UNSUPPORTED', 'recordedAt');
  }

  const sorted = (name: Collection) =>
    [...collections[name]].sort((a, b) => byId(a as never, b as never));
  const graph: SubjectGraph = {
    focalSubjectId: raw['focalSubjectId'] as string,
    input: {
      subjects: sorted('subjects') as never,
      identityClaims: sorted('identityClaims') as never,
      relationshipClaims: sorted('relationshipClaims') as never,
      reviews: sorted('reviews') as never,
      knownEcheRowKeys: [...(inputRecord['knownEcheRowKeys'] as string[])].sort(),
      asOf: inputRecord['asOf'] as unknown as string,
    },
    recordedAt: Object.fromEntries(
      Object.entries(recordedAt as Record<string, string>).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    ...('attestations' in raw
      ? { attestations: checkAttestations(raw['attestations'], seen) }
      : {}),
  };
  return graph;
}

function checkAttestations(
  raw: unknown,
  recordIds: ReadonlyMap<string, string>,
): LoadedReviewAttestations {
  if (!isPlainObject(raw) || !sameKeys(raw, ['environmentId', 'records', 'nonceUseCounts'])) {
    return refuse('ATTESTATION_RECORD_MALFORMED', 'attestations_shape');
  }
  const env = raw['environmentId'];
  if (env !== null && !(typeof env === 'string' && UUID.test(env))) {
    refuse('ATTESTATION_RECORD_MALFORMED', 'environmentId');
  }
  const records = raw['records'];
  if (!Array.isArray(records)) return refuse('ATTESTATION_RECORD_MALFORMED', 'records');
  if (records.length > MAX_ATTESTATIONS) refuse('BOUND_EXCEEDED', 'attestations');
  const checked = records.map((r: unknown, index) => {
    const where = `attestations[${index}]`;
    if (
      !isPlainObject(r) ||
      !sameKeys(r, ATTESTATION_KEYS) ||
      Object.entries(r).some(
        ([k, v]) => !(typeof v === 'string' || (k === 'expectedHeadReviewId' && v === null)),
      )
    ) {
      return refuse('ATTESTATION_RECORD_MALFORMED', where);
    }
    const a = r as unknown as ReviewAttestationRecord;
    const shaped =
      [a.id, a.reviewId, a.environmentId, a.subjectId].every((v) => UUID.test(v)) &&
      (a.expectedHeadReviewId === null || UUID.test(a.expectedHeadReviewId)) &&
      [
        a.keyFingerprint,
        a.subjectStateDigest,
        a.evidenceSnapshotDigest,
        a.targetRecordDigest,
        a.payloadSha256,
      ].every((v) => HEX64.test(v)) &&
      REVIEW_KEY_ID.test(a.keyId) &&
      NONCE.test(a.nonce) &&
      BASE64URL.test(a.signedPayload) &&
      BASE64URL.test(a.signature) &&
      [a.issuedAt, a.expiresAt, a.recordedAt].every((v) => instantOk(v, STORED_INSTANT));
    if (!shaped) refuse('ATTESTATION_RECORD_MALFORMED', where);
    if (recordIds.has(a.id)) refuse('DUPLICATE_RECORD_ID', 'attestation_id_reused');
    return { ...a };
  });
  const ids = new Set(checked.map((a) => a.id));
  if (ids.size !== checked.length) refuse('DUPLICATE_RECORD_ID', 'attestation');
  const counts = raw['nonceUseCounts'];
  const nonces = [...new Set(checked.map((a) => a.nonce))].sort();
  if (
    !isPlainObject(counts) ||
    !sameKeys(counts, nonces) ||
    Object.values(counts).some((n) => !Number.isSafeInteger(n) || (n as number) < 1)
  ) {
    refuse('ATTESTATION_RECORD_MALFORMED', 'nonceUseCounts');
  }
  return {
    environmentId: env as string | null,
    records: checked.sort(byId),
    nonceUseCounts: Object.fromEntries(
      nonces.map((n) => [n, (counts as Record<string, number>)[n]!]),
    ),
  };
}

/**
 * Consistency of the graph as ONE bounded neighbourhood of its focal subject.
 * Returns the B2.1 validator's whole-input findings, which the read model
 * does not report.
 */
function checkConsistency(graph: SubjectGraph, context: SubjectEvidenceContext): FindingView[] {
  const { input } = graph;
  if (graph.focalSubjectId !== context.subjectId || !UUID.test(graph.focalSubjectId)) {
    refuse('SUBJECT_IDENTIFIER_INCONSISTENT', 'focalSubjectId');
  }
  const subjects = new Set(input.subjects.map((s) => s.id));
  if (!subjects.has(graph.focalSubjectId)) refuse('REQUIRED_EVIDENCE_MISSING', 'focal_subject');
  for (const record of [...input.identityClaims, ...input.relationshipClaims]) {
    if (!subjects.has(record.subjectId)) refuse('REQUIRED_EVIDENCE_MISSING', 'claim_subject');
  }
  for (const r of input.relationshipClaims) {
    if (r.targetSubjectId !== null && !subjects.has(r.targetSubjectId)) {
      refuse('GRAPH_TRUNCATED', 'relationship_target_not_loaded');
    }
  }
  const claims = new Set(input.identityClaims.map((c) => c.id));
  const relationships = new Set(input.relationshipClaims.map((r) => r.id));
  for (const r of input.reviews) {
    const loaded =
      (r.reviewedSubjectId !== null && subjects.has(r.reviewedSubjectId)) ||
      (r.reviewedIdentityClaimId !== null && claims.has(r.reviewedIdentityClaimId)) ||
      (r.reviewedRelationshipClaimId !== null && relationships.has(r.reviewedRelationshipClaimId));
    if (!loaded) refuse('REQUIRED_EVIDENCE_MISSING', 'review_target_not_loaded');
  }

  const attestations = graph.attestations;
  if (input.reviews.length > 0 && attestations === undefined) {
    refuse('REVIEW_AUTHORITY_UNASSESSED', 'attestations_not_loaded');
  }
  if (attestations !== undefined) {
    const reviews = new Set(input.reviews.map((r) => r.id));
    if (attestations.records.some((a) => !reviews.has(a.reviewId))) {
      refuse('ATTESTATION_REFERENCE_INCONSISTENT', 'attestation_names_no_loaded_review');
    }
    if (attestations.environmentId !== context.engineEnvironmentId) {
      refuse('ENVIRONMENT_INCONSISTENT', 'engineEnvironmentId');
    }
  }

  const { findings } = validateIdentityGraph(input);
  const inadmissible = findings
    .filter((f) => INADMISSIBLE_CONTENT_CODES.has(f.code) && f.recordId !== INPUT_RECORD_ID)
    .map((f) => f.code);
  if (inadmissible.length > 0) {
    refuse('RECORD_CONTENT_INADMISSIBLE', [...new Set(inadmissible)].sort().join(','));
  }
  return findings
    .filter((f) => f.recordId === INPUT_RECORD_ID)
    .map((f) => ({ severity: f.severity, code: f.code, recordId: f.recordId, field: f.field }));
}

// ------------------------------------------------------------------ the document

export interface SubjectEvidenceDocument {
  readonly contract: typeof SUBJECT_EVIDENCE_CONTRACT;
  readonly contractStatus: typeof SUBJECT_EVIDENCE_CONTRACT_STATUS;
  readonly source: CanonicalValue;
  readonly records: CanonicalValue;
  readonly reviewEvidence: CanonicalValue;
  readonly assessment: CanonicalValue;
  readonly observations: CanonicalValue;
  readonly findings: CanonicalValue;
  readonly interoperability: CanonicalValue;
  readonly digests: CanonicalValue;
  readonly permissions: typeof PERMISSIONS;
  readonly canonicalIssuer: typeof CANONICAL_ISSUER;
  readonly limitations: typeof LIMITATIONS;
}

export type SubjectEvidenceResult =
  | {
      readonly outcome: 'PROJECTED';
      readonly document: SubjectEvidenceDocument;
      /** The canonical encoding of `document` (B2.3 canonical JSON: sorted keys, no numbers). */
      readonly canonical: string;
      /** SHA-256 of the canonical document. Producer-computed: never a trust anchor. */
      readonly documentDigest: string;
    }
  | { readonly outcome: 'REFUSED'; readonly code: RefusalCode; readonly detail: string };

const count = (n: number) => String(n);

/**
 * B2.4-R2: the advisory identity verdicts, answerable to the document's OWN
 * canonical findings. The read model scopes findings to the focal subject's
 * records, so its verdicts never see a whole-input (`recordId: "input"`)
 * finding; this document carries those findings, so a favourable verdict
 * beside one of them would contradict the document itself. A blocking
 * finding counts by SEVERITY, whatever its scope, and each verdict can only
 * be made less favourable than the read model's - never more.
 */
function advisoryIdentityOf(m: SubjectReadModel, findings: readonly EvidenceFinding[]) {
  const present = (severity: EvidenceFinding['severity']) =>
    findings.some((f) => f.severity === severity);
  const structurallyValid = m.identityStatus.structurallyValid && !present('INVALID');
  const reviewConfirmed =
    m.identityStatus.reviewConfirmed && structurallyValid && !present('INTEGRITY_HOLD');
  const unmet = [...m.reviewability.subjectConfirmationPreconditionsUnmet];
  if (!structurallyValid && !unmet.includes('STRUCTURALLY_INVALID')) {
    unmet.push('STRUCTURALLY_INVALID');
  }
  const research = [...m.researchAuthority.reasons];
  if (!reviewConfirmed && !research.includes('IDENTITY_NOT_REVIEW_CONFIRMED')) {
    // The read model's own position: after its two standing reasons.
    research.splice(2, 0, 'IDENTITY_NOT_REVIEW_CONFIRMED');
  }
  return {
    structurallyValid,
    conflicted: m.identityStatus.conflicted || present('CONFLICT'),
    reviewConfirmed,
    subjectConfirmationPreconditionsUnmet: unmet,
    researchReasons: research,
  };
}

/** Section D: the read model's answer, ADVISORY, with recorded and effective apart. */
function assessmentOf(
  m: SubjectReadModel,
  trust: ReviewTrustSet,
  findings: readonly EvidenceFinding[],
): CanonicalValue {
  const a = m.reviewAttestation;
  const advisory = advisoryIdentityOf(m, findings);
  return {
    status: 'PRODUCER_DERIVED_ADVISORY_CONSUMER_MUST_REVERIFY',
    derivedBy: 'B2_3_R2_SUBJECT_READ_MODEL',
    authorityScope: trust.scope,
    operationalStanding:
      trust.scope === 'TEST_ONLY'
        ? 'TEST_ONLY_NEVER_OPERATIONAL_EVIDENCE'
        : 'PRODUCER_ASSESSED_NOT_CONSUMER_VERIFIED',
    trustContext: {
      role: LIMITATIONS.embeddedTrustContext,
      scope: trust.scope,
      entries: trust
        .entries()
        .map((e) => ({ ...e }))
        .sort((x, y) => (x.keyId < y.keyId ? -1 : 1)),
    },
    ruleVersion: m.ruleVersion,
    registryContract: m.contract,
    stateDigest: m.stateDigest,
    reviewAttestation: {
      state: a.state,
      holdReasons: [...a.holdReasons],
      verdicts: a.reviews.map((v) => ({
        reviewId: v.reviewId,
        targetKey: v.targetKey,
        keyId: v.keyId,
        validAtRecordingUnderProjectionTrust: v.validAtRecording ? 'VALID' : 'NOT_VALID',
        authorityUnderProjectionTrust: v.currentlyAuthoritative ? 'CURRENT' : 'NOT_CURRENT',
        snapshotRecomputed: v.snapshotRecomputed ? 'RECOMPUTED' : 'NOT_RECOMPUTED',
        signedCoveredRecordIds: v.coveredRecordIds === null ? null : [...v.coveredRecordIds],
        holdReasons: [...v.holdReasons],
      })),
      withheldTargets: [...m.effectiveIdentity.withheldTargets],
    },
    identity: {
      recordedReview: m.identityStatus.identityReview,
      recordedReviewHeadId: m.identityStatus.identityReviewHeadId,
      effectiveReview: m.effectiveIdentity.identityReview,
      effectiveConfirmation: advisory.reviewConfirmed
        ? 'CONFIRMED_UNDER_PROJECTION_TRUST'
        : 'NOT_CONFIRMED',
      structuralValidity: advisory.structurallyValid
        ? 'NO_INVALID_FINDING'
        : 'INVALID_FINDINGS_PRESENT',
      conflict: advisory.conflicted ? 'CONFLICT_PRESENT' : 'NO_CONFLICT_FOUND',
      reviewCoverage: m.identityStatus.reviewCoverage,
      factualVerification: m.identityStatus.factualVerification,
    },
    kinds: {
      registered: m.kinds.registered,
      claimed: [...m.kinds.claimed],
      effectiveReviewed: m.kinds.reviewed,
      claims: m.kinds.claims.map((c) => ({
        claimId: c.claimId,
        claimedKind: c.value,
        recordedReview: c.review,
        effectiveReview: c.effectiveReview,
      })),
    },
    claims: [...m.names, ...m.websites, ...m.identifiers]
      .sort((x, y) => (x.claimId < y.claimId ? -1 : 1))
      .map((c) => ({
        claimId: c.claimId,
        claimKind: c.claimKind,
        recordedReview: c.review,
        effectiveReview: c.effectiveReview,
      })),
    relationships: m.relationships.map((r) => ({
      claimId: r.claimId,
      predicate: r.predicate,
      structural: r.structural ? 'STRUCTURAL' : 'NON_STRUCTURAL',
      targetKey: r.targetKey,
      recordedReview: r.review,
      effectiveReview: r.effectiveReview,
      targetIdentityRecordedReview: r.targetIdentityRecordedReview,
      targetIdentityEffectiveReview: r.targetIdentityReview,
    })),
    structuralParentage: {
      effectiveUnresolvedReason: m.structuralParentage.unresolvedReason,
      protectedRegistryConsulted: false,
    },
    protection: {
      protectedRegistryConsulted: false,
      structuralParentage: { ...m.protection.structuralParentage },
      structuralUncertainty: [...m.protection.structuralUncertainty],
      relationshipTargetIdentityUnresolved: [...m.protection.relationshipTargetIdentityUnresolved],
      reevaluationRequired: m.protection.reevaluationRequired,
      reevaluationTriggers: [...m.protection.reevaluationTriggers],
      evidenceAfterAttestation: [...m.protection.evidenceAfterAttestation],
    },
    missingEvidence: [...m.missingEvidence],
    reviewability: {
      authoritativeReviewExecution: m.reviewability.authoritativeReviewExecution,
      blocker: m.reviewability.blocker,
      unreviewedTargets: count(m.reviewability.unreviewedTargets),
      subjectConfirmationPreconditionsUnmet: advisory.subjectConfirmationPreconditionsUnmet,
    },
    researchAuthority: {
      granted: false,
      status: m.researchAuthority.status,
      reasons: advisory.researchReasons,
    },
  };
}

/** Section E: typed observations of the focal subject. Nothing here is a verified fact. */
function observationsOf(graph: SubjectGraph): CanonicalValue {
  const focal = graph.focalSubjectId;
  const claims = graph.input.identityClaims.filter((c) => c.subjectId === focal);
  const relationships = graph.input.relationshipClaims.filter((r) => r.subjectId === focal);
  const holders = (c: IdentityClaimRecord) =>
    [
      ...new Set(
        graph.input.identityClaims
          .filter(
            (o) =>
              o.subjectId !== focal &&
              o.claimKind === 'EXTERNAL_IDENTIFIER' &&
              o.identifierScheme === c.identifierScheme &&
              o.identifierValue === c.identifierValue,
          )
          .map((o) => o.subjectId),
      ),
    ].sort();
  return {
    relationships: relationships.map((r: RelationshipClaimRecord) => ({
      claimId: r.id,
      predicate: r.predicate,
      structural: r.predicate === STRUCTURAL_PREDICATE ? 'STRUCTURAL_CLAIM' : 'NON_STRUCTURAL',
      target:
        r.targetSubjectId !== null
          ? { kind: 'DISCOVERY_SUBJECT', subjectId: r.targetSubjectId }
          : {
              kind: 'ECHE_SOURCE_ROW',
              echeRowKey: r.targetEcheRowKey,
              representation: 'ENGINE_ECHE_ROW_KEY_CODE_PIPE_PIC_UNNORMALISED',
            },
      claimBasis: r.claimBasis,
      identityWithTarget: 'NOT_ASSERTED',
      provenanceKey: provenanceKeyOf(r),
    })),
    websites: claims
      .filter((c) => c.claimKind === 'PUBLIC_WEBSITE')
      .map((c) => ({
        claimId: c.id,
        websiteUrl: c.websiteUrl,
        observation: 'PUBLIC_WEBSITE_OBSERVED',
        channel: 'NOT_A_VERIFIED_CHANNEL',
        channelOwnership: 'NOT_ESTABLISHED',
        provenanceKey: provenanceKeyOf(c),
      })),
    externalIdentifiers: claims
      .filter((c) => c.claimKind === 'EXTERNAL_IDENTIFIER')
      .map((c) => ({
        claimId: c.id,
        scheme: c.identifierScheme,
        value: c.identifierValue,
        shapeOnly: 'SHAPE_CHECKED_NOT_VALIDATED',
        provenanceKey: provenanceKeyOf(c),
        alsoClaimedByLoadedSubjects: holders(c),
      })),
    legalIndependence: LEGAL_INDEPENDENCE,
  };
}

/** Where I0-R2's v1 checker could not carry this subject. Diagnostics only: nothing is emitted. */
function interoperabilityOf(graph: SubjectGraph, findingsRepresentable: boolean): CanonicalValue {
  const focal = graph.focalSubjectId;
  const relationships = graph.input.relationshipClaims.filter((r) => r.subjectId === focal);
  const diagnostics: { code: string; recordId: string | null }[] = [
    { code: 'I0_V1_IDENTITY_CLAIMS_NOT_CARRIED', recordId: null },
    { code: 'I0_V1_REVIEW_PROOFS_NOT_CARRIED', recordId: null },
    { code: 'I0_V1_ATTESTATION_SLOT_IS_A_SIGNED_EXPORT_NOT_AUTHORISED', recordId: null },
    { code: 'I0_V1_NO_TYPED_LIFECYCLE_RETRACTION_OR_CORRECTION', recordId: null },
  ];
  if (relationships.length === 0) {
    diagnostics.push({ code: 'I0_V1_ZERO_RELATIONSHIP_SUBJECT_UNREPRESENTABLE', recordId: null });
  }
  if (relationships.length > 50) {
    diagnostics.push({ code: 'I0_V1_RELATIONSHIP_BOUND_EXCEEDED', recordId: null });
  }
  if (!findingsRepresentable) {
    diagnostics.push({ code: 'I0_V1_FINDINGS_NOT_REPRESENTABLE', recordId: null });
  }
  if (graph.input.reviews.length > 0) {
    diagnostics.push({ code: 'I0_V1_REVIEW_AUTHORITY_NOT_EXPRESSIBLE', recordId: null });
  }
  for (const r of relationships) {
    if (
      r.targetEcheRowKey !== null &&
      !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(r.targetEcheRowKey)
    ) {
      diagnostics.push({ code: 'I0_V1_ECHE_ROW_KEY_ENCODING_UNREPRESENTABLE', recordId: r.id });
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(r.observedAt)) {
      diagnostics.push({ code: 'I0_V1_OBSERVED_AT_PRECISION_UNREPRESENTABLE', recordId: r.id });
    }
    if (r.sourceUrl !== null && r.sourceUrl.length > 600) {
      diagnostics.push({ code: 'I0_V1_SOURCE_URL_LENGTH_UNREPRESENTABLE', recordId: r.id });
    }
  }
  return {
    sharedContract: RC2_SHARED_HANDOFF_CONTRACT,
    emission: 'NOT_EMITTED_IN_R1A',
    compatibilityReference: 'I0_R2_35488BE_UNRATIFIED_REFERENCE',
    consumerAcceptance: 'NOT_CLAIMED',
    diagnostics: diagnostics
      .map((d) => canonicalJson(d))
      .sort()
      .map((l) => JSON.parse(l) as CanonicalValue),
  };
}

function build(
  graph: SubjectGraph,
  context: SubjectEvidenceContext,
  trust: ReviewTrustSet,
  inputScoped: readonly FindingView[],
) {
  const model = deriveSubjectReadModel(graph, trust);
  const findings: EvidenceFinding[] = evidenceFindingsOf({
    subjectId: graph.focalSubjectId,
    validator: [
      ...model.findings.invalid,
      ...model.findings.conflicts,
      ...model.findings.unresolved,
      ...model.findings.reviewSignals,
    ],
    inputScoped,
    attestation: model.reviewAttestation,
    withheldTargets: model.effectiveIdentity.withheldTargets,
    protection: model.protection,
  });
  if (findings.length > MAX_FINDINGS) refuse('BOUND_EXCEEDED', 'findings');
  const rendering = i0V1FindingsRenderingOf(findings);

  const records = {
    subjects: graph.input.subjects.map((r) => ({ ...r })),
    identityClaims: graph.input.identityClaims.map((r) => ({ ...r })),
    relationshipClaims: graph.input.relationshipClaims.map((r) => ({ ...r })),
    reviews: graph.input.reviews.map((r) => ({ ...r })),
    knownEcheRowKeys: [...graph.input.knownEcheRowKeys],
    asOf: graph.input.asOf,
    recordedAt: { ...graph.recordedAt },
    recordedAtProvenance: 'DATABASE_ROW_CREATION_UNSIGNED_DISPLAY_ONLY',
  } as unknown as CanonicalValue;
  const loaded = graph.attestations;
  const reviewEvidence: CanonicalValue = {
    protocol: REVIEW_PROTOCOL,
    evidenceRules: REVIEW_EVIDENCE_RULES_VERSION,
    attestationsLoaded: loaded === undefined ? 'NOT_LOADED_NO_REVIEWS' : 'LOADED',
    environmentId: loaded === undefined ? null : loaded.environmentId,
    attestations: loaded === undefined ? [] : loaded.records.map((a) => ({ ...a })),
    nonceUseCounts:
      loaded === undefined
        ? {}
        : Object.fromEntries(Object.entries(loaded.nonceUseCounts).map(([n, c]) => [n, count(c)])),
    instantProvenance: {
      signedPayloadIssuedAtExpiresAt: 'SIGNED',
      attestationRecordedAt: 'DATABASE_SOURCED_UNSIGNED',
      reviewReviewedAt: 'DATABASE_SOURCED_UNSIGNED_CHECKED_AGAINST_SIGNED_WINDOW',
    },
  };
  const evidenceContent = sha256(
    `${SUBJECT_EVIDENCE_CONTRACT}/evidence\n${canonicalJson({ records, reviewEvidence })}`,
  );
  const findingsDigest = evidenceFindingsDigestOf(findings);

  const document: SubjectEvidenceDocument = {
    contract: SUBJECT_EVIDENCE_CONTRACT,
    contractStatus: SUBJECT_EVIDENCE_CONTRACT_STATUS,
    source: {
      discoverySubjectId: graph.focalSubjectId,
      sourceRepository: context.sourceRepository,
      sourceRevision: context.sourceRevision,
      sourceRevisionRole: 'INFORMATIONAL_ONLY',
      registryContract: SUBJECT_REGISTRY_CONTRACT,
      identityRuleVersion: DISCOVERY_IDENTITY_RULE_VERSION,
      evidenceRulesVersion: REVIEW_EVIDENCE_RULES_VERSION,
      reviewProtocol: REVIEW_PROTOCOL,
      engineEnvironmentId: context.engineEnvironmentId,
      engineEnvironmentSource: loaded === undefined ? 'CALLER_STATED' : 'ATTESTATION_LOAD',
      readConsistency: context.readConsistency,
      neighbourhood: context.neighbourhood,
      producedAt: context.producedAt,
      producedAtRole: 'INFORMATIONAL_NOT_FRESHNESS',
    },
    records,
    reviewEvidence,
    assessment: assessmentOf(model, trust, findings),
    observations: observationsOf(graph),
    findings: {
      evidence: findings as unknown as CanonicalValue,
      evidenceDigest: findingsDigest,
      i0V1: rendering as unknown as CanonicalValue,
    },
    interoperability: interoperabilityOf(graph, rendering.status === 'REPRESENTABLE'),
    digests: {
      evidenceContent,
      findings: findingsDigest,
      role: LIMITATIONS.producerDigests,
    },
    permissions: PERMISSIONS,
    canonicalIssuer: CANONICAL_ISSUER,
    limitations: LIMITATIONS,
  };
  const canonical = canonicalJson(document as unknown as CanonicalValue);
  if (Buffer.byteLength(canonical, 'utf8') > MAX_DOCUMENT_BYTES)
    refuse('BOUND_EXCEEDED', 'document');
  return {
    outcome: 'PROJECTED' as const,
    document,
    canonical,
    documentDigest: sha256(`${SUBJECT_EVIDENCE_CONTRACT}\n${canonical}`),
  };
}

/**
 * Projects one subject. Deterministic: the same records, in any order, under
 * the same context and trust, yield the same bytes. `trust` defaults to the
 * operational set (no key today); only vitest can construct another.
 */
export function projectSubjectEvidence(
  graph: unknown,
  context: unknown,
  trust: ReviewTrustSet = ReviewTrustSet.operational(),
): SubjectEvidenceResult {
  try {
    const c = checkContext(context);
    if (c.neighbourhood === 'TRUNCATED') refuse('GRAPH_TRUNCATED', 'caller_declared_truncated');
    if (!ReviewTrustSet.isTrustSet(trust)) refuse('TRUST_CONTEXT_UNSUPPORTED', 'trust_not_sealed');
    if (trust.scope !== c.authorityScope) refuse('TRUST_SCOPE_MISMATCH', 'authorityScope');
    const g = checkGraph(graph);
    return build(g, c, trust, checkConsistency(g, c));
  } catch (error) {
    if (error instanceof SubjectEvidenceRefusal) {
      return { outcome: 'REFUSED', code: error.code, detail: error.detail };
    }
    throw error;
  }
}

export type ReproductionResult =
  | {
      readonly state: 'REPRODUCED';
      /** Reproduction is consistency under the CALLER's trust; it is not completeness or freshness. */
      readonly limitations: typeof LIMITATIONS;
    }
  | { readonly state: 'NOT_REPRODUCIBLE'; readonly reason: string };

/**
 * Re-runs the projection from a document's OWN records under the caller's
 * `trust` - never the trust context the document embeds - and compares the
 * canonical bytes. Any edited verdict, stripped hold, dropped finding or
 * relabelled trust scope fails. Total: never throws.
 */
export function reproduceSubjectEvidence(
  document: unknown,
  trust: ReviewTrustSet,
): ReproductionResult {
  try {
    if (!isPlainObject(document) || document['contract'] !== SUBJECT_EVIDENCE_CONTRACT) {
      return { state: 'NOT_REPRODUCIBLE', reason: 'contract_unknown' };
    }
    const claimed = canonicalJson(document as CanonicalValue);
    const source = document['source'] as Record<string, unknown>;
    const records = document['records'] as Record<string, unknown>;
    const evidence = document['reviewEvidence'] as Record<string, unknown>;
    const assessment = document['assessment'] as Record<string, unknown>;
    const loaded = evidence['attestationsLoaded'] === 'LOADED';
    const graph = {
      focalSubjectId: source['discoverySubjectId'],
      input: {
        subjects: records['subjects'],
        identityClaims: records['identityClaims'],
        relationshipClaims: records['relationshipClaims'],
        reviews: records['reviews'],
        knownEcheRowKeys: records['knownEcheRowKeys'],
        asOf: records['asOf'],
      },
      recordedAt: records['recordedAt'],
      ...(loaded
        ? {
            attestations: {
              environmentId: evidence['environmentId'],
              records: evidence['attestations'],
              nonceUseCounts: Object.fromEntries(
                Object.entries(evidence['nonceUseCounts'] as Record<string, string>).map(
                  ([n, c]) => [n, /^[1-9][0-9]{0,8}$/.test(c) ? Number(c) : Number.NaN],
                ),
              ),
            },
          }
        : {}),
    };
    const context = {
      contract: SUBJECT_EVIDENCE_CONTRACT,
      subjectId: source['discoverySubjectId'],
      sourceRepository: source['sourceRepository'],
      sourceRevision: source['sourceRevision'],
      engineEnvironmentId: source['engineEnvironmentId'],
      readConsistency: source['readConsistency'],
      neighbourhood: source['neighbourhood'],
      producedAt: source['producedAt'],
      authorityScope: assessment['authorityScope'],
    };
    const again = projectSubjectEvidence(graph, context, trust);
    if (again.outcome === 'REFUSED') {
      return { state: 'NOT_REPRODUCIBLE', reason: `refused:${again.code}` };
    }
    return again.canonical === claimed
      ? { state: 'REPRODUCED', limitations: LIMITATIONS }
      : { state: 'NOT_REPRODUCIBLE', reason: 'assessment_differs' };
  } catch {
    return { state: 'NOT_REPRODUCIBLE', reason: 'document_shape' };
  }
}

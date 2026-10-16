/**
 * Track B, B2.4-R1a - the provisional, B-local subject-evidence projection
 * (`nwf-pe.discovery-subject-evidence.v1-provisional`), over SYNTHETIC
 * subjects (the B2.1 fixtures) and TEST-ONLY keys generated in memory by this
 * run. No real organisation, no operational key, no database, no network.
 *
 * Every projected document is checked by `assertEvidenceInvariants`, which
 * re-derives what the document must preserve from the accepted B2.2/B2.3 read
 * model - so a document that drops an integrity finding, or carries a
 * producer verdict the records do not support, FAILS it (see the mutation
 * block). Every document is also reproduced from its own records.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { validateIdentityGraph } from '../../orgunits/identity/validate.js';
import type {
  IdentityClaimRecord,
  IdentityGraphInput,
  SubjectReviewRecord,
} from '../../orgunits/identity/vocabulary.js';
import {
  CANONICAL_ISSUER,
  LIMITATIONS,
  PERMISSION_CAPABILITIES,
  PERMISSIONS,
  RC2_SHARED_HANDOFF_CONTRACT,
  SUBJECT_EVIDENCE_CONTRACT,
  type SubjectEvidenceContext,
} from '../../orgunits/subjectHandoff/contract.js';
import {
  DERIVED_FINDING_CODES,
  evidenceFindingsDigestOf,
  i0V1FindingsDigestOf,
  type EvidenceFinding,
  type I0V1FindingsRendering,
} from '../../orgunits/subjectHandoff/findings.js';
import {
  projectSubjectEvidence,
  reproduceSubjectEvidence,
  type SubjectEvidenceDocument,
  type SubjectEvidenceResult,
} from '../../orgunits/subjectHandoff/project.js';
import {
  deriveSubjectReadModel,
  subjectStateDigest,
  type SubjectGraph,
} from '../../orgunits/subjectRegistry/readModel.js';
import type {
  LoadedReviewAttestations,
  ReviewAttestationRecord,
} from '../../orgunits/subjectRegistry/reviewAttestation.js';
import { reviewEvidenceOf } from '../../orgunits/subjectRegistry/reviewEvidence.js';
import {
  REVIEW_ACTION_AUDIENCE,
  REVIEW_CONTRACT_VERSION,
  REVIEW_PROTOCOL,
  type ReviewIntent,
  type ReviewTargetKind,
} from '../../orgunits/subjectReview/protocol.js';
import {
  OPERATIONAL_OWNER_REVIEW_KEYS,
  ReviewTrustSet,
} from '../../orgunits/subjectReview/trust.js';
import {
  ECHE_ALPHA,
  ECHE_BETA,
  OBSERVED,
  graph,
  identifierClaim,
  kindClaim,
  nameClaim,
  relation,
  review,
  sourceUrl,
  subject,
  uid,
} from '../helpers/discoveryIdentityFixtures.js';
import {
  payloadOf,
  signIntent,
  testReviewKey,
  testTrust,
  trustEntry,
  type TestReviewKey,
} from '../helpers/ownerReviewFixtures.js';

const ENV = '11111111-1111-4111-8111-111111111111';
const REVIEWED_AT = '2026-10-15T11:00:00.000Z';
const SIGNED_MS = Date.parse(REVIEWED_AT) - 60_000;
const PRODUCED_AT = '2026-10-16T09:00:00.000Z';
const REVISION = 'bb75da76fbe8dcf065dd31d2937c246eb216aab7';

const keyA = testReviewKey('test-owner-a');
const trustA = testTrust(trustEntry(keyA));
const OPERATIONAL = ReviewTrustSet.operational();

/**
 * Locally inspected I0-R2 vectors: the outputs of `findingsDigestOf`
 * (Operator 35488be, server/identityRegister/provenance.ts:188), computed by
 * running that function, read-only, on the inputs named here.
 */
const I0_R2_VECTORS = {
  empty: 'e1f4e7dd2ac2de69cb92a764a8d4a1f3d8e2d9d024ab32f1034b639c33ab63e3',
  /** I0-R2's own provenance.test.ts FINDINGS fixture. */
  i0Fixture: '9f920610ab4f960cecadc99b894a13b6d7ed1d99709d764ba5f655b53f3de70f',
  /** Two B-shaped findings (below). */
  bSample: 'ce79f299ebd0fc3e14aaad750fc75c5e46ba4aa27fa53f80f137a4873632317d',
};
/** I0-R2 `findingsDigestOf` over the exact rendering scenario (9) below produces. */
const I0_R2_VECTORS_FORGED = '37dec733c477c39ad13a2ed102154d9048146ce83e77fb914a20c601042ce5a0';
const I0_FIXTURE = [
  { code: 'PARENT_UNKNOWN', field: null, recordId: 'dddddddd-0000-4000-8000-0000000000d1' },
  { code: 'SOURCE_STALE', field: 'observedAt', recordId: null },
];
const B_SAMPLE = [
  { code: 'REVIEW_AUTHORITY_WITHHELD', field: 'subject', recordId: uid(1) },
  { code: 'SUBJECT_WITHOUT_NAME_CLAIM', field: null, recordId: uid(1) },
];

// ------------------------------------------------------------------ fixtures

function focal(
  n: number,
  parts: Partial<IdentityGraphInput>,
  attestations?: LoadedReviewAttestations,
  recordedAt: Record<string, string> = {},
): SubjectGraph {
  return {
    focalSubjectId: uid(n),
    input: graph(parts),
    recordedAt,
    ...(attestations !== undefined ? { attestations } : {}),
  };
}

function ctx(n: number, over: Partial<Record<keyof SubjectEvidenceContext, unknown>> = {}) {
  return {
    contract: SUBJECT_EVIDENCE_CONTRACT,
    subjectId: uid(n),
    sourceRepository: 'nwf-partnership-engine',
    sourceRevision: REVISION,
    engineEnvironmentId: ENV,
    readConsistency: 'SYNTHETIC_IN_MEMORY',
    neighbourhood: 'BOUNDED_NEIGHBOURHOOD_LOADED',
    producedAt: PRODUCED_AT,
    authorityScope: 'TEST_ONLY',
    ...over,
  };
}

function websiteClaim(n: number, subjectN: number, url: string): IdentityClaimRecord {
  return {
    ...nameClaim(n, subjectN, 'unused'),
    claimKind: 'PUBLIC_WEBSITE',
    nameText: null,
    websiteUrl: url,
    sourceUrl: sourceUrl(`website-${n}`),
  };
}

function intentFor(
  g: SubjectGraph,
  target: { kind: ReviewTargetKind; id: string },
  outcome: ReviewIntent['outcome'],
  head: string | null,
): ReviewIntent {
  return {
    protocol: REVIEW_PROTOCOL,
    contractVersion: REVIEW_CONTRACT_VERSION,
    action: REVIEW_ACTION_AUDIENCE,
    environmentId: ENV,
    subjectId: g.focalSubjectId,
    target,
    expectedHeadReviewId: head,
    subjectStateDigest: subjectStateDigest(g),
    ruleVersion: 'discovery-identity-rules-v1',
    evidence: reviewEvidenceOf(g, target)!,
    outcome,
    reason: outcome === 'CONFIRMED' ? null : 'synthetic reason',
  };
}

/** The review row and attestation row a correct B2.3 execution would write, signed by a TEST key. */
function attested(
  g: SubjectGraph,
  reviewN: number,
  target: { kind: ReviewTargetKind; id: string },
  outcome: ReviewIntent['outcome'] = 'CONFIRMED',
  key: TestReviewKey = keyA,
  head: string | null = null,
): { review: SubjectReviewRecord; attestation: ReviewAttestationRecord; envelope: string } {
  const envelope = signIntent(intentFor(g, target, outcome, head), key, { nowMs: SIGNED_MS });
  const p = payloadOf(envelope) as Record<string, string>;
  const doc = JSON.parse(envelope) as { payload: string; signature: string };
  const evidence = p['evidence'] as unknown as Record<string, string>;
  const r: SubjectReviewRecord = {
    id: uid(reviewN),
    reviewedSubjectId: target.kind === 'SUBJECT' ? target.id : null,
    reviewedIdentityClaimId: target.kind === 'IDENTITY_CLAIM' ? target.id : null,
    reviewedRelationshipClaimId: target.kind === 'RELATIONSHIP_CLAIM' ? target.id : null,
    reviewOutcome: outcome,
    supersedesReviewId: head,
    actorKey: `owner-review-${key.keyId}`,
    reviewedAt: REVIEWED_AT,
    reason: outcome === 'CONFIRMED' ? null : 'synthetic reason',
  };
  const prefix = {
    SUBJECT: 'subject',
    IDENTITY_CLAIM: 'identity_claim',
    RELATIONSHIP_CLAIM: 'relationship_claim',
  };
  return {
    envelope,
    review: r,
    attestation: {
      id: uid(reviewN + 5000),
      reviewId: r.id,
      environmentId: ENV,
      protocol: REVIEW_PROTOCOL,
      action: REVIEW_ACTION_AUDIENCE,
      keyId: key.keyId,
      keyFingerprint: key.fingerprint,
      nonce: p['nonce']!,
      subjectId: g.focalSubjectId,
      reviewTargetKey: `${prefix[target.kind]}:${target.id}`,
      reviewOutcome: outcome,
      expectedHeadReviewId: head,
      subjectStateDigest: p['subjectStateDigest']!,
      evidenceSnapshotDigest: evidence['snapshotDigest']!,
      targetRecordDigest: evidence['targetRecordDigest']!,
      ruleVersion: 'discovery-identity-rules-v1',
      issuedAt: p['issuedAt']!,
      expiresAt: p['expiresAt']!,
      signedPayload: doc.payload,
      signature: doc.signature,
      payloadSha256: createHash('sha256')
        .update(Buffer.from(doc.payload, 'base64url'))
        .digest('hex'),
      recordedAt: REVIEWED_AT,
    },
  };
}

function loaded(...records: ReviewAttestationRecord[]): LoadedReviewAttestations {
  const nonceUseCounts: Record<string, number> = {};
  for (const r of records) nonceUseCounts[r.nonce] = (nonceUseCounts[r.nonce] ?? 0) + 1;
  return { environmentId: ENV, records, nonceUseCounts };
}

const BASE = {
  subjects: [subject(1, 'INDEPENDENT_COMMUNITY')],
  identityClaims: [nameClaim(10, 1, 'Synthetic Tandem Club')],
};
const SUBJECT_1 = { kind: 'SUBJECT' as const, id: uid(1) };

// ------------------------------------------------------------------ reading a document

type Doc = SubjectEvidenceDocument & Record<string, unknown>;
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const at = (doc: unknown, ...path: string[]): Json =>
  path.reduce((v: Json, k) => (v === undefined || v === null ? v : v[k]), doc);
const findingsOf = (doc: unknown): EvidenceFinding[] => at(doc, 'findings', 'evidence');
const has = (doc: unknown, code: string, recordId?: string) =>
  findingsOf(doc).some(
    (f) => f.code === code && (recordId === undefined || f.recordId === recordId),
  );
const i0Of = (doc: unknown): I0V1FindingsRendering => at(doc, 'findings', 'i0V1');
const diagnosticsOf = (doc: unknown): string[] =>
  at(doc, 'interoperability', 'diagnostics').map((d: { code: string }) => d.code);

/**
 * WHAT EVERY DOCUMENT MUST PRESERVE, re-derived independently from the
 * accepted read model over the same graph and trust. Throws on any breach.
 */
function assertEvidenceInvariants(doc: unknown, g: SubjectGraph, trust: ReviewTrustSet): void {
  const fail = (what: string) => {
    throw new Error(`evidence invariant broken: ${what}`);
  };
  const m = deriveSubjectReadModel(g, trust);
  const found = findingsOf(doc);
  for (const f of validateIdentityGraph(g.input).findings.filter((x) => x.recordId === 'input')) {
    if (!found.some((x) => x.code === f.code && x.scope === 'INPUT' && x.recordId === 'input')) {
      fail(`input-scoped finding ${f.code} dropped`);
    }
  }
  const present = (code: string, recordId: string) =>
    found.some((f) => f.code === code && f.recordId === recordId);
  for (const f of [
    ...m.findings.invalid,
    ...m.findings.conflicts,
    ...m.findings.unresolved,
    ...m.findings.reviewSignals,
  ]) {
    if (!present(f.code, f.recordId)) fail(`validator finding ${f.code} dropped`);
  }
  for (const v of m.reviewAttestation.reviews) {
    for (const reason of v.holdReasons)
      if (!present(reason, v.reviewId)) fail(`hold ${reason} dropped`);
    const projected = at(doc, 'assessment', 'reviewAttestation', 'verdicts').find(
      (x: { reviewId: string }) => x.reviewId === v.reviewId,
    );
    if (
      projected?.authorityUnderProjectionTrust !==
      (v.currentlyAuthoritative ? 'CURRENT' : 'NOT_CURRENT')
    ) {
      fail('a producer verdict disagrees with verification');
    }
  }
  if (
    m.reviewAttestation.state === 'INTEGRITY_HOLD' &&
    !present('REVIEW_INTEGRITY_HOLD', g.focalSubjectId)
  ) {
    fail('integrity hold stripped');
  }
  if (at(doc, 'assessment', 'reviewAttestation', 'state') !== m.reviewAttestation.state)
    fail('state');
  for (const reason of m.protection.structuralUncertainty) {
    if (!present(reason, g.focalSubjectId)) fail(`protection ${reason} dropped`);
  }
  if (
    m.protection.reevaluationRequired &&
    !present('REQUIRES_PROTECTION_REEVALUATION', g.focalSubjectId)
  ) {
    fail('re-evaluation dropped');
  }
  const confirmed = at(doc, 'assessment', 'identity', 'effectiveConfirmation');
  if (
    confirmed !==
    (m.identityStatus.reviewConfirmed ? 'CONFIRMED_UNDER_PROJECTION_TRUST' : 'NOT_CONFIRMED')
  ) {
    fail('effective confirmation is not the verified one');
  }
  if (m.reviewAttestation.state !== 'ATTESTED' && m.reviewAttestation.state !== 'NO_REVIEWS') {
    if (confirmed !== 'NOT_CONFIRMED') fail('a held subject reads as confirmed');
    if (at(doc, 'assessment', 'kinds', 'effectiveReviewed') !== null) fail('held kind');
  }
  if (at(doc, 'assessment', 'researchAuthority', 'granted') !== false) fail('research authority');
  if (canonicalOf(at(doc, 'permissions')) !== canonicalOf(PERMISSIONS)) fail('permissions');
  if (canonicalOf(at(doc, 'canonicalIssuer')) !== canonicalOf(CANONICAL_ISSUER)) fail('issuer');
  if (canonicalOf(at(doc, 'limitations')) !== canonicalOf(LIMITATIONS)) fail('limitations');
  if (at(doc, 'findings', 'evidenceDigest') !== evidenceFindingsDigestOf(found))
    fail('findings digest');
  const i0 = i0Of(doc);
  if (i0.status === 'REPRESENTABLE') {
    if (i0.findings.length !== found.length) fail('I0 rendering dropped a finding');
    if (i0.findingsDigest !== i0V1FindingsDigestOf(i0.findings)) fail('I0 digest');
  }
  if (
    trust.scope === 'TEST_ONLY' &&
    at(doc, 'assessment', 'operationalStanding') !== 'TEST_ONLY_NEVER_OPERATIONAL_EVIDENCE'
  ) {
    fail('test-only evidence presented as operational');
  }
  const text = JSON.stringify(doc);
  if (/(cand|chn|opp):/.test(text)) fail('canonical identifier');
  if (/SAME_ACTOR|sameActor|MERGED_INTO|mergedInto/.test(text)) fail('equivalence');
}
const canonicalOf = (v: unknown) => JSON.stringify(v, Object.keys(v as object).sort());

const projected: { doc: Doc; graph: SubjectGraph; trust: ReviewTrustSet }[] = [];

function project(
  g: SubjectGraph,
  context: Record<string, unknown> = ctx(Number.parseInt(g.focalSubjectId.slice(-12), 16)),
  trust: ReviewTrustSet = trustA,
): Doc {
  const result = projectSubjectEvidence(g, context, trust);
  if (result.outcome !== 'PROJECTED') throw new Error(`refused: ${result.code} ${result.detail}`);
  const doc = result.document as Doc;
  assertEvidenceInvariants(doc, g, trust);
  expect(reproduceSubjectEvidence(JSON.parse(result.canonical), trust).state).toBe('REPRODUCED');
  projected.push({ doc, graph: g, trust });
  return doc;
}

function refusal(result: SubjectEvidenceResult): string {
  return result.outcome === 'REFUSED' ? `${result.code}:${result.detail}` : 'PROJECTED';
}

// ------------------------------------------------------------------ scenarios

describe('B2.4-R1a observations: evidence kept, nothing inferred', () => {
  it('(1) an independent language association with ZERO relationships stays representable', () => {
    const g = focal(1, {
      subjects: [subject(1, 'INDEPENDENT_STUDENT_ASSOCIATION')],
      identityClaims: [
        nameClaim(10, 1, 'Synthetic Language Society'),
        kindClaim(11, 1, 'INDEPENDENT_STUDENT_ASSOCIATION'),
      ],
    });
    const doc = project(g);
    expect(at(doc, 'observations', 'relationships')).toEqual([]);
    expect(at(doc, 'observations', 'legalIndependence')).toBe('UNKNOWN');
    expect(at(doc, 'assessment', 'kinds', 'registered')).toBe('INDEPENDENT_STUDENT_ASSOCIATION');
    expect(at(doc, 'assessment', 'kinds', 'claimed')).toEqual(['INDEPENDENT_STUDENT_ASSOCIATION']);
    expect(at(doc, 'assessment', 'kinds', 'effectiveReviewed')).toBeNull();
    // The B-local companion carries it; I0 v1 cannot, and says so.
    expect(diagnosticsOf(doc)).toContain('I0_V1_ZERO_RELATIONSHIP_SUBJECT_UNREPRESENTABLE');
    expect(findingsOf(doc)).toEqual([]);
    expect(i0Of(doc)).toMatchObject({
      status: 'REPRESENTABLE',
      findings: [],
      findingsDigest: I0_R2_VECTORS.empty,
    });
  });

  it('(2) an ESN-style local section HOSTED_BY a university is not that university', () => {
    const g = focal(2, {
      subjects: [subject(2, 'NETWORK_LOCAL_CHAPTER')],
      identityClaims: [nameClaim(20, 2, 'Synthetic Exchange Section')],
      relationshipClaims: [relation(21, 2, 'HOSTED_BY', { eche: ECHE_ALPHA })],
    });
    const doc = project(g);
    const [rel] = at(doc, 'observations', 'relationships');
    expect(rel).toMatchObject({
      predicate: 'HOSTED_BY',
      structural: 'NON_STRUCTURAL',
      identityWithTarget: 'NOT_ASSERTED',
      target: { kind: 'ECHE_SOURCE_ROW', echeRowKey: ECHE_ALPHA },
    });
    expect(at(doc, 'assessment', 'kinds', 'registered')).toBe('NETWORK_LOCAL_CHAPTER');
    expect(at(doc, 'assessment', 'structuralParentage', 'effectiveUnresolvedReason')).toBeNull();
    expect(at(doc, 'observations', 'legalIndependence')).toBe('UNKNOWN');
    expect(at(doc, 'records', 'subjects')).toHaveLength(1);
  });

  it('(3) two subjects citing one identifier stay two subjects: a review signal, never a merge', () => {
    const g = focal(1, {
      subjects: [subject(1, 'INDEPENDENT_COMMUNITY'), subject(3, 'UNCERTAIN')],
      identityClaims: [
        nameClaim(10, 1, 'Synthetic Tandem Club'),
        identifierClaim(12, 1, 'EU_PIC', '999000111'),
        nameClaim(30, 3, 'Synthetic Tandem Club Alumni'),
        identifierClaim(32, 3, 'EU_PIC', '999000111'),
      ],
    });
    const doc = project(g);
    expect(has(doc, 'SHARED_EXTERNAL_IDENTIFIER', uid(12))).toBe(true);
    // Subject 3's own finding belongs to subject 3's projection (the read model's focal scope);
    // here the link survives as an observation, not as a merge.
    expect(has(doc, 'SHARED_EXTERNAL_IDENTIFIER', uid(32))).toBe(false);
    expect(at(doc, 'observations', 'externalIdentifiers')).toEqual([
      expect.objectContaining({
        claimId: uid(12),
        scheme: 'EU_PIC',
        value: '999000111',
        shapeOnly: 'SHAPE_CHECKED_NOT_VALIDATED',
        alsoClaimedByLoadedSubjects: [uid(3)],
      }),
    ]);
    expect(at(doc, 'records', 'subjects').map((s: { id: string }) => s.id)).toEqual([
      uid(1),
      uid(3),
    ]);
  });

  it('(4) ambiguous actor evidence keeps both kinds, the conflict and the unknown parent', () => {
    const g = focal(4, {
      subjects: [subject(4, 'UNCERTAIN')],
      identityClaims: [
        nameClaim(40, 4, 'Synthetic Debate Circle'),
        kindClaim(41, 4, 'INDEPENDENT_STUDENT_ASSOCIATION'),
        kindClaim(42, 4, 'INTERNAL_STUDENT_GROUP'),
      ],
    });
    const doc = project(g);
    expect(at(doc, 'assessment', 'kinds', 'claimed')).toEqual([
      'INDEPENDENT_STUDENT_ASSOCIATION',
      'INTERNAL_STUDENT_GROUP',
    ]);
    expect(has(doc, 'ENTITY_KIND_CONFLICT', uid(4))).toBe(true);
    expect(has(doc, 'STRUCTURAL_PARENT_UNKNOWN', uid(4))).toBe(true);
    expect(at(doc, 'assessment', 'identity', 'conflict')).toBe('CONFLICT_PRESENT');
    expect(at(doc, 'assessment', 'researchAuthority', 'reasons')).toContain(
      'STRUCTURAL_PARENTAGE_UNRESOLVED:STRUCTURAL_PARENT_UNKNOWN',
    );
  });

  it('(5) an ECHE CODE|PIC target keeps its original Engine bytes and is never re-encoded', () => {
    const g = focal(5, {
      subjects: [subject(5, 'FACULTY_SCHOOL_DEPARTMENT')],
      identityClaims: [nameClaim(50, 5, 'Synthetic Faculty of Languages')],
      relationshipClaims: [relation(51, 5, 'PART_OF', { eche: ECHE_BETA })],
    });
    const result = projectSubjectEvidence(g, ctx(5), trustA);
    if (result.outcome !== 'PROJECTED') throw new Error('refused');
    const doc = project(g);
    expect(at(doc, 'records', 'relationshipClaims', '0', 'targetEcheRowKey')).toBe(ECHE_BETA);
    expect(at(doc, 'observations', 'relationships', '0', 'target')).toEqual({
      kind: 'ECHE_SOURCE_ROW',
      echeRowKey: ECHE_BETA,
      representation: 'ENGINE_ECHE_ROW_KEY_CODE_PIPE_PIC_UNNORMALISED',
    });
    // The only spellings of the key are the original one (and B's own `eche:` target key).
    const spellings = result.canonical.match(/T[ _%+]?(?:20)?B21[ _%+]?(?:20)?BETA01[^"]*/g) ?? [];
    expect([...new Set(spellings)]).toEqual([ECHE_BETA]);
    expect(diagnosticsOf(doc)).toContain('I0_V1_ECHE_ROW_KEY_ENCODING_UNREPRESENTABLE');
    expect(at(doc, 'observations', 'relationships', '0', 'structural')).toBe('STRUCTURAL_CLAIM');
  });

  it('(5b) an ECHE row the caller does not know stays an INVALID finding, not a refusal', () => {
    const g = focal(5, {
      subjects: [subject(5, 'FACULTY_SCHOOL_DEPARTMENT')],
      identityClaims: [nameClaim(50, 5, 'Synthetic Faculty of Languages')],
      relationshipClaims: [relation(51, 5, 'PART_OF', { eche: 'T B21 OTHER01|300000099' })],
    });
    const doc = project(g);
    expect(has(doc, 'RELATIONSHIP_TARGET_UNKNOWN', uid(51))).toBe(true);
    expect(at(doc, 'assessment', 'identity', 'structuralValidity')).toBe(
      'INVALID_FINDINGS_PRESENT',
    );
  });

  it('(6) a public website is an observation, never a verified channel', () => {
    const g = focal(6, {
      subjects: [subject(6, 'INDEPENDENT_COMMUNITY')],
      identityClaims: [
        nameClaim(60, 6, 'Synthetic Conversation Cafe'),
        websiteClaim(61, 6, 'https://cafe.synthetic-b21.example/'),
      ],
    });
    const doc = project(g);
    expect(at(doc, 'observations', 'websites')).toEqual([
      {
        claimId: uid(61),
        websiteUrl: 'https://cafe.synthetic-b21.example/',
        observation: 'PUBLIC_WEBSITE_OBSERVED',
        channel: 'NOT_A_VERIFIED_CHANNEL',
        channelOwnership: 'NOT_ESTABLISHED',
        provenanceKey: `url:${sourceUrl('website-61')}|v=`,
      },
    ]);
    expect(JSON.stringify(doc)).not.toMatch(/"channel":"(VERIFIED|OWNED)/);
  });
});

describe('B2.4-R1a review evidence: history kept, authority only from verification', () => {
  it('(7) a subject with no reviews: NO_REVIEWS, unreviewed, nothing withheld', () => {
    for (const attestations of [undefined, loaded()]) {
      const doc = project(focal(1, BASE, attestations));
      expect(at(doc, 'assessment', 'reviewAttestation', 'state')).toBe('NO_REVIEWS');
      expect(at(doc, 'assessment', 'identity', 'effectiveReview')).toBe('UNREVIEWED');
      expect(at(doc, 'reviewEvidence', 'attestationsLoaded')).toBe(
        attestations === undefined ? 'NOT_LOADED_NO_REVIEWS' : 'LOADED',
      );
      expect(at(doc, 'assessment', 'reviewAttestation', 'withheldTargets')).toEqual([]);
    }
  });

  it('(8) a valid synthetic attestation is carried byte for byte, and stays TEST-ONLY evidence', () => {
    const base = focal(1, BASE);
    const a = attested(base, 90, SUBJECT_1);
    const g = focal(1, { ...BASE, reviews: [a.review] }, loaded(a.attestation));
    const doc = project(g);
    expect(at(doc, 'assessment', 'reviewAttestation', 'state')).toBe('ATTESTED');
    expect(at(doc, 'assessment', 'identity')).toMatchObject({
      recordedReview: 'CONFIRMED',
      effectiveReview: 'CONFIRMED',
      effectiveConfirmation: 'CONFIRMED_UNDER_PROJECTION_TRUST',
    });
    expect(at(doc, 'assessment', 'operationalStanding')).toBe(
      'TEST_ONLY_NEVER_OPERATIONAL_EVIDENCE',
    );
    const envelope = JSON.parse(a.envelope) as { payload: string; signature: string };
    const [carried] = at(doc, 'reviewEvidence', 'attestations');
    expect(carried).toEqual(a.attestation);
    expect(carried.signedPayload).toBe(envelope.payload);
    expect(carried.signature).toBe(envelope.signature);
    const signed = payloadOf(a.envelope) as { evidence: { coveredRecordIds: string[] } };
    expect(at(doc, 'assessment', 'reviewAttestation', 'verdicts', '0')).toMatchObject({
      reviewId: uid(90),
      keyId: 'test-owner-a',
      validAtRecordingUnderProjectionTrust: 'VALID',
      authorityUnderProjectionTrust: 'CURRENT',
      signedCoveredRecordIds: signed.evidence.coveredRecordIds,
      holdReasons: [],
    });
    expect(at(doc, 'reviewEvidence', 'instantProvenance', 'attestationRecordedAt')).toBe(
      'DATABASE_SOURCED_UNSIGNED',
    );
    expect(at(doc, 'assessment', 'researchAuthority', 'granted')).toBe(false);
    expect(diagnosticsOf(doc)).toContain('I0_V1_REVIEW_AUTHORITY_NOT_EXPRESSIBLE');
    // The SAME records under the operational trust set (no key): a hold, never a confirmation.
    const operational = project(g, ctx(1, { authorityScope: 'OPERATIONAL' }), OPERATIONAL);
    expect(at(operational, 'assessment', 'reviewAttestation', 'state')).toBe('INTEGRITY_HOLD');
    expect(has(operational, 'KEY_UNKNOWN', uid(90))).toBe(true);
    expect(at(operational, 'assessment', 'identity', 'effectiveReview')).toBe('AUTHORITY_WITHHELD');
    expect(at(operational, 'assessment', 'operationalStanding')).toBe(
      'PRODUCER_ASSESSED_NOT_CONSUMER_VERIFIED',
    );
  });

  it('(9) a forged or unattested review is history, never an effective confirmation', () => {
    const forged = review(91, { subject: 1 }, 'CONFIRMED', { at: REVIEWED_AT });
    const g = focal(1, { ...BASE, reviews: [forged] }, loaded());
    const doc = project(g);
    expect(at(doc, 'assessment', 'identity')).toMatchObject({
      recordedReview: 'CONFIRMED',
      effectiveReview: 'AUTHORITY_WITHHELD',
      effectiveConfirmation: 'NOT_CONFIRMED',
    });
    expect(has(doc, 'ATTESTATION_MISSING', uid(91))).toBe(true);
    expect(has(doc, 'REVIEW_INTEGRITY_HOLD', uid(1))).toBe(true);
    expect(has(doc, 'REVIEW_AUTHORITY_WITHHELD', uid(1))).toBe(true);
    expect(at(doc, 'records', 'reviews')).toEqual([forged]);
    // Every finding fits I0 v1 here; the rendering and its digest are exactly I0-R2's.
    expect(i0Of(doc)).toEqual({
      status: 'REPRESENTABLE',
      findings: [
        { code: 'ATTESTATION_MISSING', field: null, recordId: uid(91) },
        { code: 'REVIEW_AUTHORITY_WITHHELD', field: 'subject', recordId: uid(1) },
        { code: 'REVIEW_INTEGRITY_HOLD', field: null, recordId: uid(1) },
      ],
      findingsDigest: I0_R2_VECTORS_FORGED,
      losses: ['ORIGIN_NOT_CARRIED', 'SEVERITY_NOT_CARRIED'],
    });
  });

  it('(10) a REVOKED test key: valid when recorded, not current, held', () => {
    const base = focal(1, BASE);
    const a = attested(base, 90, SUBJECT_1);
    const revoked = testTrust(
      trustEntry(keyA, 'REVOKED', { revokedAt: '2026-10-15T12:00:00.000Z' }),
    );
    const g = focal(1, { ...BASE, reviews: [a.review] }, loaded(a.attestation));
    const doc = project(g, ctx(1), revoked);
    expect(at(doc, 'assessment', 'reviewAttestation', 'verdicts', '0')).toMatchObject({
      validAtRecordingUnderProjectionTrust: 'VALID',
      authorityUnderProjectionTrust: 'NOT_CURRENT',
      holdReasons: ['KEY_REVOKED'],
    });
    expect(at(doc, 'assessment', 'identity', 'effectiveConfirmation')).toBe('NOT_CONFIRMED');
    expect(at(doc, 'assessment', 'trustContext', 'entries', '0', 'state')).toBe('REVOKED');
  });

  it('(11) parent-implying evidence after a valid review is surfaced, never suppressed', () => {
    const base = focal(1, BASE);
    const a = attested(base, 90, SUBJECT_1);
    const g = focal(
      1,
      {
        ...BASE,
        identityClaims: [...BASE.identityClaims, kindClaim(11, 1, 'FACULTY_SCHOOL_DEPARTMENT')],
        reviews: [a.review],
      },
      loaded(a.attestation),
    );
    const doc = project(g);
    expect(at(doc, 'assessment', 'reviewAttestation', 'state')).toBe('ATTESTED');
    expect(at(doc, 'assessment', 'protection', 'evidenceAfterAttestation')).toEqual([uid(11)]);
    expect(at(doc, 'assessment', 'protection', 'reevaluationTriggers')).toContain(
      'PROTECTION_RELEVANT_EVIDENCE_AFTER_REVIEW',
    );
    expect(has(doc, 'EVIDENCE_AFTER_ATTESTATION', uid(11))).toBe(true);
    expect(has(doc, 'REQUIRES_PROTECTION_REEVALUATION', uid(1))).toBe(true);
    expect(has(doc, 'STRUCTURAL_PARENT_UNKNOWN', uid(1))).toBe(true);
  });

  it('(12) missing evidence snapshot content is an integrity hold, kept', () => {
    const withSite = {
      ...BASE,
      identityClaims: [
        ...BASE.identityClaims,
        websiteClaim(12, 1, 'https://club.synthetic-b21.example/'),
      ],
    };
    const a = attested(focal(1, withSite), 90, SUBJECT_1);
    const g = focal(1, { ...BASE, reviews: [a.review] }, loaded(a.attestation));
    const doc = project(g);
    expect(has(doc, 'EVIDENCE_RECORD_MISSING', uid(90))).toBe(true);
    expect(at(doc, 'assessment', 'reviewAttestation', 'state')).toBe('INTEGRITY_HOLD');
    expect(at(doc, 'assessment', 'identity', 'effectiveConfirmation')).toBe('NOT_CONFIRMED');
  });

  it('(13) review authority that was not assessed is refused, never read as unreviewed', () => {
    const a = attested(focal(1, BASE), 90, SUBJECT_1);
    const g = focal(1, { ...BASE, reviews: [a.review] });
    expect(refusal(projectSubjectEvidence(g, ctx(1), trustA))).toBe(
      'REVIEW_AUTHORITY_UNASSESSED:attestations_not_loaded',
    );
    // Dropping the attestation row is not "unassessed": it is a hold.
    const doc = project(focal(1, { ...BASE, reviews: [a.review] }, loaded()));
    expect(has(doc, 'ATTESTATION_MISSING', uid(90))).toBe(true);
  });

  it('(18) divergent content under the same record ids changes the evidence, and breaks the attestation', () => {
    const a = attested(focal(1, BASE), 90, SUBJECT_1);
    const original = focal(1, { ...BASE, reviews: [a.review] }, loaded(a.attestation));
    const renamed = focal(
      1,
      {
        ...BASE,
        identityClaims: [nameClaim(10, 1, 'Synthetic Tandem Society')],
        reviews: [a.review],
      },
      loaded(a.attestation),
    );
    expect(subjectStateDigest(original)).toBe(subjectStateDigest(renamed));
    const before = project(original);
    const after = project(renamed);
    expect(at(before, 'assessment', 'stateDigest')).toBe(at(after, 'assessment', 'stateDigest'));
    expect(at(before, 'digests', 'evidenceContent')).not.toBe(
      at(after, 'digests', 'evidenceContent'),
    );
    expect(has(after, 'EVIDENCE_CONTENT_CHANGED', uid(90))).toBe(true);
    expect(at(after, 'assessment', 'identity', 'effectiveConfirmation')).toBe('NOT_CONFIRMED');
  });

  it('(19) a review-chain integrity failure stays visible and decides nothing', () => {
    const base = focal(1, BASE);
    const first = attested(base, 90, SUBJECT_1);
    const second = attested(base, 92, SUBJECT_1);
    const g = focal(
      1,
      { ...BASE, reviews: [first.review, second.review] },
      loaded(first.attestation, second.attestation),
    );
    const doc = project(g);
    expect(has(doc, 'REVIEW_CHAIN_INVALID', uid(90))).toBe(true);
    expect(has(doc, 'REVIEW_CHAIN_INVALID', uid(92))).toBe(true);
    expect(at(doc, 'assessment', 'identity')).toMatchObject({
      recordedReview: 'CHAIN_INVALID',
      effectiveReview: 'CHAIN_INVALID',
      effectiveConfirmation: 'NOT_CONFIRMED',
      conflict: 'CONFLICT_PRESENT',
    });
  });
});

describe('B2.4-R1a refusals: malformed input is refused, never repaired', () => {
  const okGraph = () => focal(1, BASE);

  it('(14) refuses duplicate record ids, conflicting or repeated, across collections too', () => {
    const conflicting = focal(1, {
      ...BASE,
      identityClaims: [nameClaim(10, 1, 'Synthetic Tandem Club'), nameClaim(10, 1, 'Other Club')],
    });
    expect(refusal(projectSubjectEvidence(conflicting, ctx(1), trustA))).toBe(
      'DUPLICATE_RECORD_ID:conflicting',
    );
    const repeated = focal(1, {
      ...BASE,
      identityClaims: [BASE.identityClaims[0]!, BASE.identityClaims[0]!],
    });
    expect(refusal(projectSubjectEvidence(repeated, ctx(1), trustA))).toBe(
      'DUPLICATE_RECORD_ID:repeated',
    );
    const crossed = focal(1, {
      ...BASE,
      identityClaims: [{ ...nameClaim(10, 1, 'X Club'), id: uid(1) }],
    });
    expect(refusal(projectSubjectEvidence(crossed, ctx(1), trustA))).toMatch(
      /^DUPLICATE_RECORD_ID:/,
    );
  });

  it('(15) refuses test-only authority presented as operational, and an unsealed trust set', () => {
    expect(
      refusal(projectSubjectEvidence(okGraph(), ctx(1, { authorityScope: 'OPERATIONAL' }), trustA)),
    ).toBe('TRUST_SCOPE_MISMATCH:authorityScope');
    expect(refusal(projectSubjectEvidence(okGraph(), ctx(1), OPERATIONAL))).toBe(
      'TRUST_SCOPE_MISMATCH:authorityScope',
    );
    const lookalike = { ...trustA, scope: 'TEST_ONLY' } as unknown as ReviewTrustSet;
    expect(refusal(projectSubjectEvidence(okGraph(), ctx(1), lookalike))).toBe(
      'TRUST_CONTEXT_UNSUPPORTED:trust_not_sealed',
    );
  });

  it('refuses unknown contract versions, extra context fields and unsupported shapes', () => {
    const p = (g: unknown, c: unknown) => refusal(projectSubjectEvidence(g, c, trustA));
    expect(p(okGraph(), ctx(1, { contract: 'nwf-pe.discovery-subject-evidence.v2' }))).toBe(
      'CONTRACT_UNKNOWN:contract',
    );
    expect(p(okGraph(), { ...ctx(1), verified: true })).toBe(
      'CONTEXT_SHAPE_INVALID:context_fields',
    );
    expect(p(okGraph(), ctx(1, { producedAt: 'yesterday', sourceRevision: 'main' }))).toBe(
      'CONTEXT_SHAPE_INVALID:sourceRevision,producedAt',
    );
    expect(p({ ...okGraph(), extra: 1 }, ctx(1))).toBe('INPUT_SHAPE_UNSUPPORTED:graph_fields');
    expect(p({ focalSubjectId: uid(1), recordedAt: {} }, ctx(1))).toBe(
      'INPUT_SHAPE_UNSUPPORTED:graph_fields',
    );
    const withNumber = focal(1, {
      ...BASE,
      subjects: [{ ...subject(1), registrationNote: 7 as never }],
    });
    expect(p(withNumber, ctx(1))).toBe('RECORD_SHAPE_UNSUPPORTED:subjects[0]');
    const withContact = focal(1, {
      ...BASE,
      subjects: [{ ...subject(1), contactEmail: null } as never],
    });
    expect(p(withContact, ctx(1))).toBe('RECORD_SHAPE_UNSUPPORTED:subjects[0]');
  });

  it('refuses an inconsistent subject id, a truncated graph and missing required evidence', () => {
    const p = (g: unknown, c: unknown = ctx(1)) => refusal(projectSubjectEvidence(g, c, trustA));
    expect(p(okGraph(), ctx(2))).toBe('SUBJECT_IDENTIFIER_INCONSISTENT:focalSubjectId');
    expect(p(okGraph(), ctx(1, { neighbourhood: 'TRUNCATED' }))).toBe(
      'GRAPH_TRUNCATED:caller_declared_truncated',
    );
    const dangling = focal(1, {
      ...BASE,
      relationshipClaims: [relation(20, 1, 'AFFILIATED_WITH', { subject: 7 })],
    });
    expect(p(dangling)).toBe('GRAPH_TRUNCATED:relationship_target_not_loaded');
    expect(p(focal(1, { identityClaims: BASE.identityClaims, subjects: [subject(2)] }))).toBe(
      'REQUIRED_EVIDENCE_MISSING:focal_subject',
    );
    const orphanReview = focal(
      1,
      { ...BASE, reviews: [review(91, { identityClaim: 77 }, 'CONFIRMED')] },
      loaded(),
    );
    expect(p(orphanReview)).toBe('REQUIRED_EVIDENCE_MISSING:review_target_not_loaded');
  });

  it('refuses inconsistent attestation references, environments and malformed attestation digests', () => {
    const a = attested(focal(1, BASE), 90, SUBJECT_1);
    const p = (g: unknown, c: unknown = ctx(1)) => refusal(projectSubjectEvidence(g, c, trustA));
    expect(p(focal(1, BASE, loaded(a.attestation)))).toBe(
      'ATTESTATION_REFERENCE_INCONSISTENT:attestation_names_no_loaded_review',
    );
    const g = focal(1, { ...BASE, reviews: [a.review] }, loaded(a.attestation));
    expect(p(g, ctx(1, { engineEnvironmentId: '22222222-2222-4222-8222-222222222222' }))).toBe(
      'ENVIRONMENT_INCONSISTENT:engineEnvironmentId',
    );
    const badDigest = focal(
      1,
      { ...BASE, reviews: [a.review] },
      loaded({ ...a.attestation, targetRecordDigest: 'abc' }),
    );
    expect(p(badDigest)).toBe('ATTESTATION_RECORD_MALFORMED:attestations[0]');
    const noCount = focal(
      1,
      { ...BASE, reviews: [a.review] },
      {
        ...loaded(a.attestation),
        nonceUseCounts: {},
      },
    );
    expect(p(noCount)).toBe('ATTESTATION_RECORD_MALFORMED:nonceUseCounts');
  });

  it('refuses inadmissible content without echoing it, and bounds the input', () => {
    const leaky = focal(1, {
      ...BASE,
      identityClaims: [nameClaim(10, 1, 'someone@synthetic-b21.example')],
    });
    const r = projectSubjectEvidence(leaky, ctx(1), trustA);
    expect(refusal(r)).toBe('RECORD_CONTENT_INADMISSIBLE:NAME_INADMISSIBLE');
    expect(JSON.stringify(r)).not.toContain('someone@');
    const many = focal(1, {
      subjects: Array.from({ length: 65 }, (_, i) => subject(i + 1)),
      identityClaims: BASE.identityClaims,
    });
    expect(refusal(projectSubjectEvidence(many, ctx(1), trustA))).toBe('BOUND_EXCEEDED:subjects');
  });
});

describe('B2.4-R1a determinism and limits of a digest', () => {
  it('(16) a new source revision changes no evidence: only the informational metadata moves', () => {
    const a = attested(focal(1, BASE), 90, SUBJECT_1);
    const g = focal(1, { ...BASE, reviews: [a.review] }, loaded(a.attestation));
    const first = projectSubjectEvidence(g, ctx(1), trustA);
    const second = projectSubjectEvidence(
      g,
      ctx(1, {
        sourceRevision: 'fe00ae0d4a096fda3c3f9386366ab9c82bb5fbfc',
        producedAt: '2026-10-17T09:00:00.000Z',
      }),
      trustA,
    );
    if (first.outcome !== 'PROJECTED' || second.outcome !== 'PROJECTED') throw new Error('refused');
    for (const section of [
      'records',
      'reviewEvidence',
      'assessment',
      'findings',
      'digests',
    ] as const) {
      expect(second.document[section]).toEqual(first.document[section]);
    }
    expect(at(second.document, 'source', 'sourceRevisionRole')).toBe('INFORMATIONAL_ONLY');
    expect(at(second.document, 'source', 'producedAtRole')).toBe('INFORMATIONAL_NOT_FRESHNESS');
    expect(second.documentDigest).not.toBe(first.documentDigest);
  });

  it('(17) the same records in any order yield the same bytes', () => {
    const base = focal(1, {
      subjects: [subject(1, 'UNCERTAIN'), subject(3, 'UNCERTAIN')],
      identityClaims: [
        nameClaim(10, 1, 'Synthetic Tandem Club'),
        identifierClaim(12, 1, 'EU_PIC', '999000111'),
        kindClaim(13, 1, 'INDEPENDENT_COMMUNITY'),
        identifierClaim(32, 3, 'EU_PIC', '999000111'),
      ],
      relationshipClaims: [
        relation(20, 1, 'HOSTED_BY', { eche: ECHE_ALPHA }),
        relation(21, 1, 'AFFILIATED_WITH', { subject: 3 }),
      ],
    });
    const x = attested(base, 90, SUBJECT_1);
    const y = attested(base, 91, { kind: 'IDENTITY_CLAIM', id: uid(13) }, 'REJECTED');
    const recordedAt = {
      [uid(1)]: '2026-10-01T10:00:00.000001Z',
      [uid(10)]: '2026-10-01T10:00:01.000002Z',
      [uid(90)]: '2026-10-15T11:00:00.000000Z',
    };
    const ordered = focal(
      1,
      { ...base.input, reviews: [x.review, y.review] },
      loaded(x.attestation, y.attestation),
      recordedAt,
    );
    const shuffled: SubjectGraph = {
      focalSubjectId: uid(1),
      recordedAt: Object.fromEntries(Object.entries(recordedAt).reverse()),
      attestations: loaded(y.attestation, x.attestation),
      input: {
        subjects: [...ordered.input.subjects].reverse(),
        identityClaims: [...ordered.input.identityClaims].reverse(),
        relationshipClaims: [...ordered.input.relationshipClaims].reverse(),
        reviews: [...ordered.input.reviews].reverse(),
        knownEcheRowKeys: [...ordered.input.knownEcheRowKeys].reverse(),
        asOf: ordered.input.asOf,
      },
    };
    const one = projectSubjectEvidence(ordered, ctx(1), trustA);
    const two = projectSubjectEvidence(shuffled, ctx(1), trustA);
    if (one.outcome !== 'PROJECTED' || two.outcome !== 'PROJECTED') throw new Error('refused');
    expect(two.canonical).toBe(one.canonical);
    expect(two.documentDigest).toBe(one.documentDigest);
    project(shuffled);
    // Microsecond instants from the store survive verbatim.
    expect(one.canonical).toContain('2026-10-01T10:00:00.000001Z');
  });

  it('records, in every document, that an unsigned export proves neither completeness nor freshness', () => {
    const doc = project(focal(1, BASE));
    expect(doc.limitations).toEqual({
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
    });
    expect(at(doc, 'digests', 'role')).toBe('NOT_AN_EXTERNAL_TRUST_ANCHOR');
    expect(at(doc, 'assessment', 'status')).toBe(
      'PRODUCER_DERIVED_ADVISORY_CONSUMER_MUST_REVERIFY',
    );
    expect(at(doc, 'assessment', 'trustContext', 'role')).toBe(
      'DESCRIPTIVE_ONLY_AUTHORISES_NOTHING',
    );
    expect(Object.keys(doc)).not.toContain('signature');
    expect(Object.keys(doc)).not.toContain('attestation');
    // A deletion the producer never saw is invisible to every digest it can compute:
    // the same document results whether or not a later review exists elsewhere.
    const later = attested(focal(1, BASE), 99, SUBJECT_1, 'REJECTED');
    expect(later.review.id).toBe(uid(99));
    const again = project(focal(1, BASE));
    expect(at(again, 'digests')).toEqual(at(doc, 'digests'));
    expect(reproduceSubjectEvidence(again, trustA)).toEqual({
      state: 'REPRODUCED',
      limitations: LIMITATIONS,
    });
  });
});

describe('B2.4-R1a findings: B findings preserved, I0 v1 rendered only when lossless in scope', () => {
  it('computes I0-R2 findingsDigestOf exactly, over its own vectors', () => {
    expect(i0V1FindingsDigestOf([])).toBe(I0_R2_VECTORS.empty);
    expect(i0V1FindingsDigestOf(I0_FIXTURE)).toBe(I0_R2_VECTORS.i0Fixture);
    expect(i0V1FindingsDigestOf(B_SAMPLE)).toBe(I0_R2_VECTORS.bSample);
  });

  it('keeps an input-scoped finding as recordId "input" and refuses the I0 rendering instead of faking one', () => {
    const g = focal(1, { ...BASE, knownEcheRowKeys: [ECHE_ALPHA, 'not an eche key'] });
    const doc = project(g);
    const finding = findingsOf(doc).find((f) => f.code === 'ECHE_ROW_KEY_INVALID');
    expect(finding).toEqual({
      origin: 'IDENTITY_VALIDATOR',
      severity: 'INVALID',
      code: 'ECHE_ROW_KEY_INVALID',
      scope: 'INPUT',
      recordId: 'input',
      field: 'knownEcheRowKeys',
    });
    expect(i0Of(doc)).toEqual({
      status: 'NOT_REPRESENTABLE',
      diagnostics: [{ code: 'I0_V1_INPUT_SCOPED_FINDING_UNREPRESENTABLE', finding }],
      losses: ['ORIGIN_NOT_CARRIED', 'SEVERITY_NOT_CARRIED'],
    });
    expect(diagnosticsOf(doc)).toContain('I0_V1_FINDINGS_NOT_REPRESENTABLE');
    expect(JSON.stringify(i0Of(doc))).not.toContain('findingsDigest');
  });

  it('flags microsecond observation instants, which I0 v1 cannot carry', () => {
    const g = focal(2, {
      subjects: [subject(2, 'NETWORK_LOCAL_CHAPTER'), subject(3, 'UNCERTAIN')],
      identityClaims: [nameClaim(20, 2, 'Synthetic Exchange Section')],
      relationshipClaims: [
        {
          ...relation(21, 2, 'AFFILIATED_WITH', { subject: 3 }),
          observedAt: '2026-10-01T09:00:00.000001Z',
        },
      ],
    });
    const doc = project(g);
    expect(at(doc, 'interoperability', 'diagnostics')).toContainEqual({
      code: 'I0_V1_OBSERVED_AT_PRECISION_UNREPRESENTABLE',
      recordId: uid(21),
    });
    expect(at(doc, 'records', 'relationshipClaims', '0', 'observedAt')).toBe(
      '2026-10-01T09:00:00.000001Z',
    );
    expect(OBSERVED).toBe('2026-10-01T09:00:00.000Z');
  });

  it('gives every finding code exactly one origin and severity across this suite', () => {
    const seen = new Map<string, Set<string>>();
    for (const { doc } of projected) {
      for (const f of findingsOf(doc)) {
        seen.set(f.code, (seen.get(f.code) ?? new Set()).add(`${f.origin}/${f.severity}`));
      }
    }
    expect(seen.size).toBeGreaterThan(10);
    for (const [code, classes] of seen) expect([...classes], code).toHaveLength(1);
    for (const code of DERIVED_FINDING_CODES) expect(seen.get(code)?.size ?? 1).toBe(1);
  });
});

describe('B2.4-R1a negative mutations: a weakened document fails', () => {
  function held() {
    const forged = review(91, { subject: 1 }, 'CONFIRMED', { at: REVIEWED_AT });
    const g = focal(1, { ...BASE, reviews: [forged] }, loaded());
    const doc = project(g);
    return {
      g,
      doc,
      copy: () => JSON.parse(JSON.stringify(doc)) as Record<string, Record<string, unknown>>,
    };
  }

  it('(13) stripping the integrity hold is caught by the invariants and by reproduction', () => {
    const { g, copy } = held();
    const stripped = copy();
    stripped['findings']!['evidence'] = findingsOf(stripped).filter(
      (f) => f.code !== 'REVIEW_INTEGRITY_HOLD',
    );
    expect(() => assertEvidenceInvariants(stripped, g, trustA)).toThrow(
      /integrity hold stripped|findings digest/,
    );
    expect(reproduceSubjectEvidence(stripped, trustA).state).toBe('NOT_REPRODUCIBLE');
    // Even with the B-local digest recomputed to match, a dropped hold reason is caught.
    const rehashed = copy();
    rehashed['findings']!['evidence'] = findingsOf(rehashed).filter(
      (f) => f.code !== 'ATTESTATION_MISSING',
    );
    rehashed['findings']!['evidenceDigest'] = evidenceFindingsDigestOf(findingsOf(rehashed));
    expect(() => assertEvidenceInvariants(rehashed, g, trustA)).toThrow(
      /hold ATTESTATION_MISSING dropped/,
    );
    expect(reproduceSubjectEvidence(rehashed, trustA).state).toBe('NOT_REPRODUCIBLE');
  });

  it('treating a producer verdict as authoritative is caught', () => {
    const { g, copy } = held();
    const promoted = copy();
    const assessment = promoted['assessment'] as Record<string, Json>;
    assessment['reviewAttestation']['verdicts'][0]['authorityUnderProjectionTrust'] = 'CURRENT';
    assessment['reviewAttestation']['verdicts'][0]['holdReasons'] = [];
    assessment['reviewAttestation']['state'] = 'ATTESTED';
    assessment['identity']['effectiveConfirmation'] = 'CONFIRMED_UNDER_PROJECTION_TRUST';
    expect(() => assertEvidenceInvariants(promoted, g, trustA)).toThrow(
      /producer verdict|state|confirmation/,
    );
    expect(reproduceSubjectEvidence(promoted, trustA).state).toBe('NOT_REPRODUCIBLE');
  });

  it('(15) relabelling test-only evidence as operational, or trusting its embedded keys, is caught', () => {
    const a = attested(focal(1, BASE), 90, SUBJECT_1);
    const g = focal(1, { ...BASE, reviews: [a.review] }, loaded(a.attestation));
    const doc = project(g);
    const relabelled = JSON.parse(JSON.stringify(doc)) as Doc;
    (relabelled.assessment as Record<string, unknown>)['authorityScope'] = 'OPERATIONAL';
    (relabelled.assessment as Record<string, unknown>)['operationalStanding'] =
      'PRODUCER_ASSESSED_NOT_CONSUMER_VERIFIED';
    expect(reproduceSubjectEvidence(relabelled, OPERATIONAL).state).toBe('NOT_REPRODUCIBLE');
    expect(reproduceSubjectEvidence(relabelled, trustA)).toEqual({
      state: 'NOT_REPRODUCIBLE',
      reason: 'refused:TRUST_SCOPE_MISMATCH',
    });
    // The keys a document embeds authorise nothing: the caller's trust set decides.
    expect(reproduceSubjectEvidence(doc, OPERATIONAL).state).toBe('NOT_REPRODUCIBLE');
    expect(
      reproduceSubjectEvidence(doc, testTrust(trustEntry(testReviewKey('test-owner-b')))).state,
    ).toBe('NOT_REPRODUCIBLE');
    expect(
      reproduceSubjectEvidence({ ...doc, contract: RC2_SHARED_HANDOFF_CONTRACT }, trustA),
    ).toEqual({
      state: 'NOT_REPRODUCIBLE',
      reason: 'contract_unknown',
    });
  });
});

describe('B2.4-R1a authority: no permission, no canonical issuer, no operational key', () => {
  it('(20) every projected document grants nothing and issues nothing', () => {
    expect(projected.length).toBeGreaterThan(15);
    for (const { doc } of projected) {
      expect(Object.keys(doc.permissions).sort()).toEqual([...PERMISSION_CAPABILITIES].sort());
      expect(new Set(Object.values(doc.permissions))).toEqual(new Set(['NONE']));
      expect(doc.canonicalIssuer).toEqual({
        producerMayIssue: 'NONE',
        issuingAuthority: 'OPERATOR_IDENTITY_REGISTER_PER_RC2_S1',
        identifiersIssuedHere: 'NONE',
      });
      expect(doc.contract).toBe('nwf-pe.discovery-subject-evidence.v1-provisional');
      expect(doc.contractStatus).toBe('B_LOCAL_PROVISIONAL_NOT_RATIFIED');
      expect(at(doc, 'interoperability')).toMatchObject({
        sharedContract: 'nwf-pe.discovery-identity-handoff.v1',
        emission: 'NOT_EMITTED_IN_R1A',
        consumerAcceptance: 'NOT_CLAIMED',
      });
      expect(at(doc, 'assessment', 'researchAuthority', 'granted')).toBe(false);
      expect(JSON.stringify(doc)).not.toMatch(/"(cand|chn|opp):|"granted":true|SAME_ACTOR/);
    }
    expect(OPERATIONAL_OWNER_REVIEW_KEYS).toEqual([]);
    expect(OPERATIONAL.hasActiveKey()).toBe(false);
  });
});

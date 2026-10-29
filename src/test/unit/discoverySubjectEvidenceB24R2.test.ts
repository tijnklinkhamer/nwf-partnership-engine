/**
 * Track B, B2.4-R2 - an input-scoped finding can no longer hide behind a
 * favourable advisory verdict.
 *
 * THE DEFECT. The B2.2/B2.3 read model scopes findings to the focal subject's
 * own records, so its `structurallyValid` never sees a whole-input finding
 * (`recordId: "input"`). B2.4 carries those findings in `findings.evidence`
 * but copied the read model's narrower verdicts, so one document could say
 * `structuralValidity: NO_INVALID_FINDING` - and, with an attested
 * confirmation, `effectiveConfirmation: CONFIRMED_UNDER_PROJECTION_TRUST` -
 * beside its own INVALID finding.
 *
 * Real B2.1 input-scoped findings (ECHE_ROW_KEY_INVALID, AS_OF_INVALID) are
 * produced by the real validator. B2.1 emits no input-scoped CONFLICT, and
 * B2.3 no input-scoped integrity hold, so those are INJECTED - appended to the
 * real `evidenceFindingsOf` output and re-sorted canonically - to prove the
 * advisory gate reads severity, never scope. Synthetic subjects, TEST-ONLY
 * in-memory keys; no database, no network, no operational key.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type {
  IdentityGraphInput,
  SubjectReviewRecord,
} from '../../orgunits/identity/vocabulary.js';
import {
  PERMISSION_CAPABILITIES,
  SUBJECT_EVIDENCE_CONTRACT,
} from '../../orgunits/subjectHandoff/contract.js';
import type * as FindingsModule from '../../orgunits/subjectHandoff/findings.js';
import {
  evidenceFindingsDigestOf,
  type EvidenceFinding,
} from '../../orgunits/subjectHandoff/findings.js';
import {
  projectSubjectEvidence,
  reproduceSubjectEvidence,
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
import { canonicalJson } from '../../orgunits/subjectReview/canonical.js';
import {
  REVIEW_ACTION_AUDIENCE,
  REVIEW_CONTRACT_VERSION,
  REVIEW_PROTOCOL,
} from '../../orgunits/subjectReview/protocol.js';
import { ReviewTrustSet } from '../../orgunits/subjectReview/trust.js';
import {
  ECHE_ALPHA,
  graph,
  nameClaim,
  relation,
  review,
  subject,
  uid,
} from '../helpers/discoveryIdentityFixtures.js';
import {
  payloadOf,
  signIntent,
  testReviewKey,
  testTrust,
  trustEntry,
} from '../helpers/ownerReviewFixtures.js';

/** Findings appended to the real `evidenceFindingsOf` output; empty unless a test sets them. */
const injected = vi.hoisted(() => ({ findings: [] as unknown[] }));

vi.mock('../../orgunits/subjectHandoff/findings.js', async (importOriginal) => {
  const real = await importOriginal<typeof FindingsModule>();
  const { canonicalJson: line } = await import('../../orgunits/subjectReview/canonical.js');
  return {
    ...real,
    evidenceFindingsOf: (sources: Parameters<typeof real.evidenceFindingsOf>[0]) => {
      const all = [
        ...real.evidenceFindingsOf(sources),
        ...(injected.findings as EvidenceFinding[]),
      ];
      const byLine = new Map(all.map((f) => [line(f as never), f]));
      return [...byLine.keys()].sort().map((k) => byLine.get(k)!);
    },
  };
});

function withInjected<T>(findings: readonly EvidenceFinding[], run: () => T): T {
  injected.findings = [...findings];
  try {
    return run();
  } finally {
    injected.findings = [];
  }
}

const ENV = '11111111-1111-4111-8111-111111111111';
const REVIEWED_AT = '2026-10-15T11:00:00.000Z';
const SIGNED_MS = Date.parse(REVIEWED_AT) - 60_000;
const keyA = testReviewKey('test-owner-r2');
const trustA = testTrust(trustEntry(keyA));
const OPERATIONAL = ReviewTrustSet.operational();

const BASE = {
  subjects: [subject(1, 'INDEPENDENT_COMMUNITY')],
  identityClaims: [nameClaim(10, 1, 'Synthetic Tandem Club')],
};
const BAD_KEYS = { knownEcheRowKeys: [ECHE_ALPHA, 'not an eche key'] };

function focal(parts: Partial<IdentityGraphInput>, attestations?: LoadedReviewAttestations) {
  return {
    focalSubjectId: uid(1),
    input: graph(parts),
    recordedAt: {},
    ...(attestations !== undefined ? { attestations } : {}),
  } satisfies SubjectGraph;
}

const ctx = (scope: 'TEST_ONLY' | 'OPERATIONAL' = 'TEST_ONLY') => ({
  contract: SUBJECT_EVIDENCE_CONTRACT,
  subjectId: uid(1),
  sourceRepository: 'nwf-partnership-engine',
  sourceRevision: '96ef2aa734dc48cc786204063f5343fc26589bf3',
  engineEnvironmentId: ENV,
  readConsistency: 'SYNTHETIC_IN_MEMORY',
  neighbourhood: 'BOUNDED_NEIGHBOURHOOD_LOADED',
  producedAt: '2026-10-17T09:00:00.000Z',
  authorityScope: scope,
});

/** The review and attestation rows a correct B2.3 execution writes, signed by a TEST key. */
function attestedConfirmation(g: SubjectGraph, reviewN = 90) {
  const target = { kind: 'SUBJECT' as const, id: uid(1) };
  const envelope = signIntent(
    {
      protocol: REVIEW_PROTOCOL,
      contractVersion: REVIEW_CONTRACT_VERSION,
      action: REVIEW_ACTION_AUDIENCE,
      environmentId: ENV,
      subjectId: g.focalSubjectId,
      target,
      expectedHeadReviewId: null,
      subjectStateDigest: subjectStateDigest(g),
      ruleVersion: 'discovery-identity-rules-v1',
      evidence: reviewEvidenceOf(g, target)!,
      outcome: 'CONFIRMED',
      reason: null,
    },
    keyA,
    { nowMs: SIGNED_MS },
  );
  const p = payloadOf(envelope) as Record<string, string>;
  const evidence = p['evidence'] as unknown as Record<string, string>;
  const doc = JSON.parse(envelope) as { payload: string; signature: string };
  const r: SubjectReviewRecord = {
    id: uid(reviewN),
    reviewedSubjectId: uid(1),
    reviewedIdentityClaimId: null,
    reviewedRelationshipClaimId: null,
    reviewOutcome: 'CONFIRMED',
    supersedesReviewId: null,
    actorKey: `owner-review-${keyA.keyId}`,
    reviewedAt: REVIEWED_AT,
    reason: null,
  };
  const a: ReviewAttestationRecord = {
    id: uid(reviewN + 5000),
    reviewId: r.id,
    environmentId: ENV,
    protocol: REVIEW_PROTOCOL,
    action: REVIEW_ACTION_AUDIENCE,
    keyId: keyA.keyId,
    keyFingerprint: keyA.fingerprint,
    nonce: p['nonce']!,
    subjectId: uid(1),
    reviewTargetKey: `subject:${uid(1)}`,
    reviewOutcome: 'CONFIRMED',
    expectedHeadReviewId: null,
    subjectStateDigest: p['subjectStateDigest']!,
    evidenceSnapshotDigest: evidence['snapshotDigest']!,
    targetRecordDigest: evidence['targetRecordDigest']!,
    ruleVersion: 'discovery-identity-rules-v1',
    issuedAt: p['issuedAt']!,
    expiresAt: p['expiresAt']!,
    signedPayload: doc.payload,
    signature: doc.signature,
    payloadSha256: createHash('sha256').update(Buffer.from(doc.payload, 'base64url')).digest('hex'),
    recordedAt: REVIEWED_AT,
  };
  const loaded: LoadedReviewAttestations = {
    environmentId: ENV,
    records: [a],
    nonceUseCounts: { [a.nonce]: 1 },
  };
  return { review: r, loaded };
}

/** A graph whose focal subject carries a valid TEST-ONLY attested confirmation. */
function confirmedGraph(parts: Partial<IdentityGraphInput>): SubjectGraph {
  const unreviewed = focal({ ...BASE, ...parts });
  const { review: r, loaded } = attestedConfirmation(unreviewed);
  return focal({ ...BASE, ...parts, reviews: [r] }, loaded);
}

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function projected(
  g: SubjectGraph,
  trust: ReviewTrustSet = trustA,
  scope: 'TEST_ONLY' | 'OPERATIONAL' = 'TEST_ONLY',
) {
  const r: SubjectEvidenceResult = projectSubjectEvidence(g, ctx(scope), trust);
  if (r.outcome !== 'PROJECTED') throw new Error(`refused: ${r.code} ${r.detail}`);
  const doc = JSON.parse(r.canonical) as Json;
  // Every projected document grants nothing.
  for (const c of PERMISSION_CAPABILITIES) expect(doc.permissions[c]).toBe('NONE');
  expect(doc.assessment.researchAuthority.granted).toBe(false);
  expect(doc.canonicalIssuer.identifiersIssuedHere).toBe('NONE');
  return { result: r, doc };
}

const identityOf = (doc: Json) => doc.assessment.identity;
const blocking = (doc: Json): EvidenceFinding[] =>
  (doc.findings.evidence as EvidenceFinding[]).filter((f) =>
    ['INVALID', 'CONFLICT', 'INTEGRITY_HOLD'].includes(f.severity),
  );

/**
 * THE R2 INVARIANT, independent of the producer: no advisory verdict may be
 * favourable while the document's own findings carry a blocking one of the
 * kind it answers for, whatever the finding's scope.
 */
function assertAdvisoryConsistent(doc: Json): void {
  const findings = doc.findings.evidence as EvidenceFinding[];
  const any = (severity: string) => findings.some((f) => f.severity === severity);
  const identity = identityOf(doc);
  if (any('INVALID')) {
    expect(identity.structuralValidity).toBe('INVALID_FINDINGS_PRESENT');
    expect(identity.effectiveConfirmation).toBe('NOT_CONFIRMED');
    expect(doc.assessment.reviewability.subjectConfirmationPreconditionsUnmet).toContain(
      'STRUCTURALLY_INVALID',
    );
  }
  if (any('CONFLICT')) expect(identity.conflict).toBe('CONFLICT_PRESENT');
  if (any('INTEGRITY_HOLD')) expect(identity.effectiveConfirmation).toBe('NOT_CONFIRMED');
  if (identity.effectiveConfirmation === 'NOT_CONFIRMED') {
    expect(doc.assessment.researchAuthority.reasons).toContain('IDENTITY_NOT_REVIEW_CONFIRMED');
  }
  expect(doc.findings.evidenceDigest).toBe(evidenceFindingsDigestOf(findings));
  expect(doc.digests.findings).toBe(doc.findings.evidenceDigest);
  expect(findings.map((f) => canonicalJson(f as never))).toEqual(
    [...new Set(findings.map((f) => canonicalJson(f as never)))].sort(),
  );
}

const ECHE_KEY_FINDING: EvidenceFinding = {
  origin: 'IDENTITY_VALIDATOR',
  severity: 'INVALID',
  code: 'ECHE_ROW_KEY_INVALID',
  scope: 'INPUT',
  recordId: 'input',
  field: 'knownEcheRowKeys',
};

describe('B2.4-R2 (1) an input-scoped INVALID finding is never hidden by an advisory verdict', () => {
  it('a confirmed subject over an invalid input reads INVALID and NOT_CONFIRMED, its finding kept verbatim', () => {
    const g = confirmedGraph(BAD_KEYS);
    const { doc } = projected(g);
    // The finding is the validator's own: code, severity, scope and record id unchanged.
    expect(doc.findings.evidence).toContainEqual(ECHE_KEY_FINDING);
    expect(identityOf(doc)).toMatchObject({
      structuralValidity: 'INVALID_FINDINGS_PRESENT',
      effectiveConfirmation: 'NOT_CONFIRMED',
      // Review history and B2.3 verification are untouched: the review IS validly attested.
      recordedReview: 'CONFIRMED',
      effectiveReview: 'CONFIRMED',
    });
    expect(doc.assessment.reviewAttestation.state).toBe('ATTESTED');
    expect(doc.assessment.reviewAttestation.verdicts[0].authorityUnderProjectionTrust).toBe(
      'CURRENT',
    );
    expect(doc.assessment.reviewability.subjectConfirmationPreconditionsUnmet).toEqual([
      'STRUCTURALLY_INVALID',
    ]);
    expect(doc.assessment.researchAuthority.reasons.slice(0, 3)).toEqual([
      'SUBJECT_RESEARCH_ADMISSION_POLICY_ABSENT',
      'PROTECTED_STRUCTURAL_PARENTAGE_NOT_EVALUATED',
      'IDENTITY_NOT_REVIEW_CONFIRMED',
    ]);
    assertAdvisoryConsistent(doc);
    // The read model's own verdict stays the narrower, record-scoped one: R2 corrects the
    // DOCUMENT, it does not touch B2.2/B2.3.
    const m = deriveSubjectReadModel(g, trustA);
    expect(m.identityStatus.structurallyValid).toBe(true);
    expect(m.identityStatus.reviewConfirmed).toBe(true);
  });

  it('an unparseable asOf is an input-scoped INVALID finding that blocks the same way', () => {
    const { doc } = projected(confirmedGraph({ asOf: 'not-an-instant' }));
    expect(doc.findings.evidence).toContainEqual({
      origin: 'IDENTITY_VALIDATOR',
      severity: 'INVALID',
      code: 'AS_OF_INVALID',
      scope: 'INPUT',
      recordId: 'input',
      field: 'asOf',
    });
    expect(identityOf(doc).structuralValidity).toBe('INVALID_FINDINGS_PRESENT');
    expect(identityOf(doc).effectiveConfirmation).toBe('NOT_CONFIRMED');
    assertAdvisoryConsistent(doc);
  });

  it('an unreviewed subject over an invalid input reads INVALID; protection holds stay separate', () => {
    const { doc } = projected(focal({ ...BASE, ...BAD_KEYS }));
    expect(identityOf(doc).structuralValidity).toBe('INVALID_FINDINGS_PRESENT');
    expect(doc.findings.evidence).toContainEqual({
      origin: 'PROTECTION',
      severity: 'PROTECTION',
      code: 'INPUT_STRUCTURALLY_INVALID',
      scope: 'RECORD',
      recordId: uid(1),
      field: null,
    });
    expect(doc.assessment.protection.structuralUncertainty).toEqual(['INPUT_STRUCTURALLY_INVALID']);
    assertAdvisoryConsistent(doc);
  });
});

describe('B2.4-R2 (2-4) the gate reads severity, never scope (INJECTED: not producible by B2.1/B2.3)', () => {
  it('(2) an input-scoped CONFLICT reads CONFLICT_PRESENT', () => {
    const conflict: EvidenceFinding = {
      origin: 'IDENTITY_VALIDATOR',
      severity: 'CONFLICT',
      code: 'ENTITY_KIND_CONFLICT',
      scope: 'INPUT',
      recordId: 'input',
      field: null,
    };
    const g = confirmedGraph({});
    const { doc } = withInjected([conflict], () => projected(g));
    expect(doc.findings.evidence).toContainEqual(conflict);
    expect(identityOf(doc).conflict).toBe('CONFLICT_PRESENT');
    // A conflict is not a structural defect, exactly as for a record-scoped one.
    expect(identityOf(doc).structuralValidity).toBe('NO_INVALID_FINDING');
    assertAdvisoryConsistent(doc);
  });

  it('(3) an input-scoped integrity hold withholds the confirmation', () => {
    const integrity: EvidenceFinding = {
      origin: 'REVIEW_ATTESTATION',
      severity: 'INTEGRITY_HOLD',
      code: 'REVIEW_INTEGRITY_HOLD',
      scope: 'INPUT',
      recordId: 'input',
      field: null,
    };
    const g = confirmedGraph({});
    const { doc } = withInjected([integrity], () => projected(g));
    expect(doc.findings.evidence).toContainEqual(integrity);
    expect(identityOf(doc).effectiveConfirmation).toBe('NOT_CONFIRMED');
    expect(identityOf(doc).structuralValidity).toBe('NO_INVALID_FINDING');
    assertAdvisoryConsistent(doc);
  });

  it('(4) nonblocking input-scoped findings change no verdict and stay visible', () => {
    const nonblocking: EvidenceFinding[] = [
      {
        origin: 'IDENTITY_VALIDATOR',
        severity: 'UNRESOLVED',
        code: 'SUBJECT_WITHOUT_NAME_CLAIM',
        scope: 'INPUT',
        recordId: 'input',
        field: null,
      },
      {
        origin: 'PROTECTION',
        severity: 'PROTECTION',
        code: 'REQUIRES_PROTECTION_REEVALUATION',
        scope: 'INPUT',
        recordId: 'input',
        field: null,
      },
    ];
    const g = confirmedGraph({});
    const clean = projected(g).doc;
    const { doc } = withInjected(nonblocking, () => projected(g));
    for (const f of nonblocking) expect(doc.findings.evidence).toContainEqual(f);
    expect(identityOf(doc)).toEqual(identityOf(clean));
    expect(identityOf(doc).effectiveConfirmation).toBe('CONFIRMED_UNDER_PROJECTION_TRUST');
    expect(doc.assessment.researchAuthority).toEqual(clean.assessment.researchAuthority);
    expect(doc.assessment.reviewability).toEqual(clean.assessment.reviewability);
    assertAdvisoryConsistent(doc);
  });
});

describe('B2.4-R2 (5-7) zero relationships, held reviews and later adverse evidence', () => {
  it('(5) a zero-relationship subject over an invalid input is still projected, and still INVALID', () => {
    const { doc } = projected(focal({ ...BASE, ...BAD_KEYS }));
    expect(doc.records.relationshipClaims).toEqual([]);
    expect(doc.interoperability.diagnostics).toContainEqual({
      code: 'I0_V1_ZERO_RELATIONSHIP_SUBJECT_UNREPRESENTABLE',
      recordId: null,
    });
    expect(identityOf(doc).structuralValidity).toBe('INVALID_FINDINGS_PRESENT');
  });

  it('(6) an unattested or operationally untrusted review stays held, and the input finding stays', () => {
    const forged = review(91, { subject: 1 }, 'CONFIRMED', { at: REVIEWED_AT });
    const unattested = focal(
      { ...BASE, ...BAD_KEYS, reviews: [forged] },
      {
        environmentId: ENV,
        records: [],
        nonceUseCounts: {},
      },
    );
    const untrusted = confirmedGraph(BAD_KEYS);
    for (const doc of [
      projected(unattested).doc,
      projected(untrusted, OPERATIONAL, 'OPERATIONAL').doc,
    ]) {
      expect(doc.assessment.reviewAttestation.state).toBe('INTEGRITY_HOLD');
      expect(identityOf(doc).effectiveConfirmation).toBe('NOT_CONFIRMED');
      expect(identityOf(doc).structuralValidity).toBe('INVALID_FINDINGS_PRESENT');
      expect(doc.findings.evidence).toContainEqual(ECHE_KEY_FINDING);
      expect(
        doc.findings.evidence.some((f: EvidenceFinding) => f.code === 'REVIEW_INTEGRITY_HOLD'),
      ).toBe(true);
      assertAdvisoryConsistent(doc);
    }
  });

  it('(7) a valid confirmation followed by adverse input evidence is no longer a confirmation', () => {
    const before = focal(BASE);
    const { review: r, loaded } = attestedConfirmation(before);
    const clean = projected(focal({ ...BASE, reviews: [r] }, loaded)).doc;
    expect(identityOf(clean).effectiveConfirmation).toBe('CONFIRMED_UNDER_PROJECTION_TRUST');
    const after = projected(focal({ ...BASE, ...BAD_KEYS, reviews: [r] }, loaded)).doc;
    expect(identityOf(after).effectiveConfirmation).toBe('NOT_CONFIRMED');
    expect(identityOf(after).structuralValidity).toBe('INVALID_FINDINGS_PRESENT');
    expect(after.findings.evidence).toContainEqual(ECHE_KEY_FINDING);
    assertAdvisoryConsistent(after);
  });
});

describe('B2.4-R2 (8-10) reproduction and digests', () => {
  it('(8) an intact corrected document reproduces', () => {
    const { doc } = projected(confirmedGraph(BAD_KEYS));
    expect(reproduceSubjectEvidence(doc, trustA).state).toBe('REPRODUCED');
  });

  it('(9) a document carrying the pre-R2 favourable verdicts no longer reproduces', () => {
    const { doc } = projected(confirmedGraph(BAD_KEYS));
    const preR2 = JSON.parse(JSON.stringify(doc)) as Json;
    preR2.assessment.identity.structuralValidity = 'NO_INVALID_FINDING';
    preR2.assessment.identity.effectiveConfirmation = 'CONFIRMED_UNDER_PROJECTION_TRUST';
    preR2.assessment.reviewability.subjectConfirmationPreconditionsUnmet = [];
    preR2.assessment.researchAuthority.reasons = preR2.assessment.researchAuthority.reasons.filter(
      (r: string) => r !== 'IDENTITY_NOT_REVIEW_CONFIRMED',
    );
    expect(reproduceSubjectEvidence(preR2, trustA)).toEqual({
      state: 'NOT_REPRODUCIBLE',
      reason: 'assessment_differs',
    });
    // Each favourable field alone is caught too.
    for (const [path, value] of [
      [['identity', 'structuralValidity'], 'NO_INVALID_FINDING'],
      [['identity', 'effectiveConfirmation'], 'CONFIRMED_UNDER_PROJECTION_TRUST'],
      [['reviewability', 'subjectConfirmationPreconditionsUnmet'], []],
    ] as const) {
      const tampered = JSON.parse(JSON.stringify(doc)) as Json;
      tampered.assessment[path[0]][path[1]] = value;
      expect(reproduceSubjectEvidence(tampered, trustA).state).toBe('NOT_REPRODUCIBLE');
    }
  });

  it('(10) findings and document digests are consistent and deterministic', () => {
    const g = focal({ ...BASE, ...BAD_KEYS });
    const a = projected(g);
    const b = projected({
      ...g,
      input: { ...g.input, knownEcheRowKeys: [...BAD_KEYS.knownEcheRowKeys].reverse() },
    });
    expect(b.result.canonical).toBe(a.result.canonical);
    const r = a.result as Extract<SubjectEvidenceResult, { outcome: 'PROJECTED' }>;
    expect(r.documentDigest).toBe(
      createHash('sha256')
        .update(`${SUBJECT_EVIDENCE_CONTRACT}\n${r.canonical}`, 'utf8')
        .digest('hex'),
    );
    assertAdvisoryConsistent(a.doc);
    // R2 changes no finding: the canonical findings and their digest are the pre-R2 ones.
    expect(a.doc.findings.evidenceDigest).toBe(PRE_R2_INPUT_INVALID_FINDINGS_DIGEST);
    expect(blocking(a.doc)).toEqual([ECHE_KEY_FINDING]);
  });
});

/**
 * Documents with NO input-scoped finding, projected by the ACCEPTED producer
 * (96ef2aa), before this repair: R2 must leave their bytes exactly as they were.
 */
const PRE_R2_DOCUMENT_DIGESTS = {
  unreviewedClean: '7713479e729ab4da9b6907a3260579b945edb350eddd039fb3ef515350a58377',
  withRelationships: 'd402414a6fdc97ecbde6e1bd7b31fc74dfa1ec7327eacd1a68a5802d4488f297',
};
/** The accepted producer's findings digest for `focal({...BASE, ...BAD_KEYS})`. */
const PRE_R2_INPUT_INVALID_FINDINGS_DIGEST =
  'b9c95ef8d00d7670f7fb1ee457f8d5f025b06faacff56f8875596a857dcb2dc1';

describe('B2.4-R2 (11-12) positive cases are unchanged and still grant nothing', () => {
  it('(11) documents without an input-scoped finding keep their exact accepted bytes', () => {
    // An EMPTY test-only trust set: the embedded trust context is part of the bytes.
    const keyless = testTrust();
    const clean = projected(focal(BASE), keyless).result as Extract<
      SubjectEvidenceResult,
      { outcome: 'PROJECTED' }
    >;
    const related = projected(
      focal({
        subjects: [subject(1, 'FACULTY_SCHOOL_DEPARTMENT')],
        identityClaims: [nameClaim(10, 1, 'Synthetic Faculty of Languages')],
        relationshipClaims: [relation(11, 1, 'PART_OF', { eche: ECHE_ALPHA })],
      }),
      keyless,
    ).result as Extract<SubjectEvidenceResult, { outcome: 'PROJECTED' }>;
    expect(clean.documentDigest).toBe(PRE_R2_DOCUMENT_DIGESTS.unreviewedClean);
    expect(related.documentDigest).toBe(PRE_R2_DOCUMENT_DIGESTS.withRelationships);
  });

  it("(11b) an attested clean subject gains no hold: its verdicts are exactly the read model's", () => {
    const g = confirmedGraph({});
    const { doc } = projected(g);
    const m = deriveSubjectReadModel(g, trustA);
    expect(identityOf(doc)).toMatchObject({
      structuralValidity: 'NO_INVALID_FINDING',
      conflict: 'NO_CONFLICT_FOUND',
      effectiveConfirmation: 'CONFIRMED_UNDER_PROJECTION_TRUST',
    });
    expect(doc.assessment.reviewability.subjectConfirmationPreconditionsUnmet).toEqual(
      m.reviewability.subjectConfirmationPreconditionsUnmet,
    );
    expect(doc.assessment.researchAuthority.reasons).toEqual(m.researchAuthority.reasons);
    expect(blocking(doc)).toEqual([]);
    expect(reproduceSubjectEvidence(doc, trustA).state).toBe('REPRODUCED');
  });

  it('(12) every permission is NONE in every document above, and no test key is operational', () => {
    // projected() asserts the permissions on every call; the operational set holds only the
    // R2-P1 OWNER key, never a test key.
    expect(OPERATIONAL.entries().map((e) => [e.keyId, e.fingerprint, e.scope, e.state])).toEqual([
      [
        'owner-review-2026-10',
        'b2c8fcf82c3359d0fd829dbb4cda9cee4007578d3cd8aacd95ad53e5cf11bb86',
        'OPERATIONAL',
        'ACTIVE',
      ],
    ]);
    const { doc } = projected(confirmedGraph({}));
    expect(doc.assessment.operationalStanding).toBe('TEST_ONLY_NEVER_OPERATIONAL_EVIDENCE');
    expect(Object.values(doc.permissions)).toEqual(PERMISSION_CAPABILITIES.map(() => 'NONE'));
  });
});

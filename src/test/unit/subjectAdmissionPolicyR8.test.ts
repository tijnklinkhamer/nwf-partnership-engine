/**
 * Global R8 - the subject research-admission policy (ADR 0025), over
 * SYNTHETIC subjects only: no network, no database.
 *
 * Every review a case relies on is signed by the PRODUCTION signer with an
 * in-memory TEST_ONLY Ed25519 key and verified by the production read model,
 * so "authoritative" here means exactly what it means in B2.3. Every protected
 * cohort is built by the REAL B3.0 registry builder from synthetic artifacts
 * (`syntheticCohort`). Nothing is fetched, stored or classified.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

import type { EvaluationCohortRegistry } from '../../orgunits/classify/evaluationCohortGuard.js';
import type {
  IdentityClaimRecord,
  IdentityGraphInput,
  SubjectKind,
  SubjectReviewRecord,
} from '../../orgunits/identity/vocabulary.js';
import {
  MAX_ADMISSION_VALIDITY_SECONDS,
  SUBJECT_RESEARCH_ADMISSION_POLICY_VERSION,
  evaluateSubjectResearchAdmission,
  protectedKeysFor,
  protectedRegistryDigest,
  type SubjectAdmissionDecision,
  type SubjectAdmissionInput,
} from '../../orgunits/subjectAdmission/policy.js';
import {
  SubjectRootRefusal,
  enforceSubjectRootResearchEligibility,
} from '../../orgunits/subjectAdmission/runGuard.js';
import { subjectStateDigest, type SubjectGraph } from '../../orgunits/subjectRegistry/readModel.js';
import type {
  LoadedReviewAttestations,
  ReviewAttestationRecord,
} from '../../orgunits/subjectRegistry/reviewAttestation.js';
import { reviewEvidenceOf } from '../../orgunits/subjectRegistry/reviewEvidence.js';
import {
  REVIEW_ACTION_AUDIENCE,
  REVIEW_CONTRACT_VERSION,
  REVIEW_PROTOCOL,
  type ReviewTargetKind,
} from '../../orgunits/subjectReview/protocol.js';
import { ReviewTrustSet } from '../../orgunits/subjectReview/trust.js';
import type { ResolvedRoot } from '../../orgunits/web/authority.js';
import { validateRequestUrl } from '../../orgunits/web/url.js';
import {
  graph,
  kindClaim,
  nameClaim,
  relation,
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
} from '../helpers/ownerReviewFixtures.js';
import { syntheticCohort, type SyntheticIdentity } from '../helpers/syntheticCohortRegistry.js';

const ENV = '22222222-2222-4222-8222-222222222222';
const REVIEWED_AT = '2026-10-15T11:00:00.000Z';
const SIGNED_MS = Date.parse(REVIEWED_AT) - 60_000;
const KEY = testReviewKey('test-owner-r8');
const TEST_TRUST = testTrust(trustEntry(KEY));

/** Synthetic subjects; hosts on real suffixes, as the gateway requires. */
const JP = 0x8a1;
const BR = 0x8b1;
const JP_SITE = 'https://www.synthetic-r8-circle.example.jp/';
const BR_SITE = 'https://www.synthetic-r8-linguas.example.com.br/';

/** The synthetic French ECHE university (a frame member, unprotected) and a protected one. */
const FR_UNIVERSITY: SyntheticIdentity = {
  organisationId: '00000000-0000-4000-8000-00000008f001',
  echeRowKey: 'F SYNTH08|900000801',
};
const FR_PROTECTED: SyntheticIdentity = {
  organisationId: '00000000-0000-4000-8000-00000008f002',
  echeRowKey: 'F SYNTH08P|900000802',
};
/** An ECHE row the evaluation frame does not hold: its protection is UNKNOWN. */
const OUTSIDE_FRAME_KEY = 'F SYNTH08X|900000803';

function registry(): EvaluationCohortRegistry {
  const cohort = syntheticCohort();
  cohort.admit(FR_UNIVERSITY);
  cohort.protect(FR_PROTECTED, 'DRAW_SELECTION');
  const loaded = cohort.load();
  if (!loaded.ok) throw new Error(loaded.detail);
  return loaded.registry;
}
const REGISTRY = registry();

function websiteClaim(
  n: number,
  subjectN: number,
  url: string,
  basis: 'SOURCE_STATED' | 'INFERRED' = 'SOURCE_STATED',
): IdentityClaimRecord {
  return {
    ...nameClaim(n, subjectN, 'unused'),
    claimKind: 'PUBLIC_WEBSITE',
    nameText: null,
    websiteUrl: url,
    claimBasis: basis,
    sourceUrl: sourceUrl(`r8-website-${n}`),
  };
}

function baseGraph(subjectN: number, parts: Partial<IdentityGraphInput>): SubjectGraph {
  return {
    focalSubjectId: uid(subjectN),
    input: graph({
      knownEcheRowKeys: [FR_UNIVERSITY.echeRowKey, FR_PROTECTED.echeRowKey, OUTSIDE_FRAME_KEY],
      ...parts,
    }),
    recordedAt: {},
    attestations: { environmentId: ENV, records: [], nonceUseCounts: {} },
  };
}

const TARGET_KEY: Record<ReviewTargetKind, string> = {
  SUBJECT: 'subject',
  IDENTITY_CLAIM: 'identity_claim',
  RELATIONSHIP_CLAIM: 'relationship_claim',
};

/**
 * Appends the review row + attestation a correct B2.3 execution would write,
 * signed over the graph AS IT STANDS (so successive reviews chain correctly).
 */
function attest(
  g: SubjectGraph,
  reviewN: number,
  target: { kind: ReviewTargetKind; id: string },
  outcome: 'CONFIRMED' | 'DISPUTED' | 'REJECTED' = 'CONFIRMED',
): SubjectGraph {
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
      outcome,
      reason: outcome === 'CONFIRMED' ? null : 'synthetic reason',
    },
    KEY,
    { nowMs: SIGNED_MS },
  );
  const p = payloadOf(envelope) as Record<string, string>;
  const doc = JSON.parse(envelope) as { payload: string; signature: string };
  const evidence = p['evidence'] as unknown as Record<string, string>;
  const row: SubjectReviewRecord = {
    id: uid(reviewN),
    reviewedSubjectId: target.kind === 'SUBJECT' ? target.id : null,
    reviewedIdentityClaimId: target.kind === 'IDENTITY_CLAIM' ? target.id : null,
    reviewedRelationshipClaimId: target.kind === 'RELATIONSHIP_CLAIM' ? target.id : null,
    reviewOutcome: outcome,
    supersedesReviewId: null,
    actorKey: `owner-review-${KEY.keyId}`,
    reviewedAt: REVIEWED_AT,
    reason: outcome === 'CONFIRMED' ? null : 'synthetic reason',
  };
  const record: ReviewAttestationRecord = {
    id: uid(reviewN + 0x5000),
    reviewId: row.id,
    environmentId: ENV,
    protocol: REVIEW_PROTOCOL,
    action: REVIEW_ACTION_AUDIENCE,
    keyId: KEY.keyId,
    keyFingerprint: KEY.fingerprint,
    nonce: p['nonce']!,
    subjectId: g.focalSubjectId,
    reviewTargetKey: `${TARGET_KEY[target.kind]}:${target.id}`,
    reviewOutcome: outcome,
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
  const prior: LoadedReviewAttestations = g.attestations!;
  return {
    ...g,
    input: { ...g.input, reviews: [...g.input.reviews, row] },
    attestations: {
      environmentId: ENV,
      records: [...prior.records, record],
      nonceUseCounts: { ...prior.nonceUseCounts, [record.nonce]: 1 },
    },
  };
}

const confirmSubject = (g: SubjectGraph, reviewN: number) =>
  attest(g, reviewN, { kind: 'SUBJECT', id: g.focalSubjectId });

function jpGraph(
  kind: SubjectKind = 'INDEPENDENT_STUDENT_ASSOCIATION',
  site = JP_SITE,
): SubjectGraph {
  return baseGraph(JP, {
    subjects: [subject(JP, kind)],
    identityClaims: [
      nameClaim(JP + 1, JP, 'Synthetic Osaka Language Exchange Circle'),
      nameClaim(JP + 2, JP, '合成大阪言語交換サークル', { kind: 'NATIVE_NAME', language: 'ja' }),
      websiteClaim(JP + 3, JP, site),
    ],
  });
}

function brGraph(): SubjectGraph {
  return baseGraph(BR, {
    subjects: [subject(BR, 'INDEPENDENT_COMMUNITY')],
    identityClaims: [
      nameClaim(BR + 1, BR, 'Associação Sintética de Línguas', {
        kind: 'NATIVE_NAME',
        language: 'pt-BR',
      }),
      nameClaim(BR + 2, BR, 'Synthetic Language Association'),
      websiteClaim(BR + 3, BR, BR_SITE),
    ],
  });
}

function input(
  g: SubjectGraph,
  overrides: Partial<SubjectAdmissionInput> = {},
): SubjectAdmissionInput {
  const rootClaimId =
    g.input.identityClaims.find(
      (c) => c.subjectId === g.focalSubjectId && c.claimKind === 'PUBLIC_WEBSITE',
    )?.id ?? uid(0);
  return {
    graph: g,
    trust: TEST_TRUST,
    rootClaimId,
    registry: REGISTRY,
    // The French ECHE university's own domain, as the ECHE path holds it.
    isolationDomains: ['example.fr'],
    ...overrides,
  };
}

function reasonsOf(decision: SubjectAdmissionDecision): readonly string[] {
  return decision.outcome === 'REFUSED' ? decision.reasons : [];
}

describe('R8 admission: the Japanese and Brazilian subjects are admissible under TEST_ONLY authority', () => {
  it('admits the Japanese association: own website, no ECHE identity, digests bound', () => {
    const g = confirmSubject(jpGraph(), JP + 0x10);
    const decision = evaluateSubjectResearchAdmission(input(g));
    expect(decision.outcome).toBe('ADMISSIBLE');
    if (decision.outcome !== 'ADMISSIBLE') return;
    expect(decision.policyVersion).toBe('subject-research-admission-policy-v1');
    expect(decision.identityAuthorityScope).toBe('TEST_ONLY');
    expect(decision.rootUrl.url).toBe(JP_SITE);
    expect(decision.rootUrl.registrableDomain).toBe('example.jp');
    expect(decision.subjectStateDigest).toBe(subjectStateDigest(g));
    expect(decision.protectedRegistryDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(decision)).not.toMatch(/eche|country|legal|qualif|contact|permission/i);
  });

  it('admits the Brazilian organisation independently', () => {
    const decision = evaluateSubjectResearchAdmission(input(confirmSubject(brGraph(), BR + 0x10)));
    expect(decision.outcome).toBe('ADMISSIBLE');
    if (decision.outcome === 'ADMISSIBLE') {
      expect(decision.rootUrl.registrableDomain).toBe('example.com.br');
    }
  });

  it('is deterministic and binds the policy version the root resolver implements', () => {
    const g = confirmSubject(jpGraph(), JP + 0x10);
    expect(evaluateSubjectResearchAdmission(input(g))).toEqual(
      evaluateSubjectResearchAdmission(input(g)),
    );
    expect(SUBJECT_RESEARCH_ADMISSION_POLICY_VERSION).toBe('subject-research-admission-policy-v1');
    expect(MAX_ADMISSION_VALIDITY_SECONDS).toBe(2_592_000);
  });
});

describe('R8 admission D5: identity must be authoritatively confirmed', () => {
  it('refuses an unreviewed subject', () => {
    expect(reasonsOf(evaluateSubjectResearchAdmission(input(jpGraph())))).toEqual([
      'IDENTITY_NOT_AUTHORITATIVELY_CONFIRMED',
    ]);
  });

  it('refuses under the OPERATIONAL trust set: it holds no OWNER key, so a test signature is no authority', () => {
    const g = confirmSubject(jpGraph(), JP + 0x10);
    const reasons = reasonsOf(
      evaluateSubjectResearchAdmission(input(g, { trust: ReviewTrustSet.operational() })),
    );
    expect(reasons).toContain('IDENTITY_NOT_AUTHORITATIVELY_CONFIRMED');
    expect(reasons).toContain('REVIEW_AUTHORITY_WITHHELD');
  });

  it('refuses a FORGED confirmation: a review row with no attestation is an integrity hold', () => {
    const g = jpGraph();
    const forged: SubjectGraph = {
      ...g,
      input: {
        ...g.input,
        reviews: [
          {
            id: uid(JP + 0x20),
            reviewedSubjectId: uid(JP),
            reviewedIdentityClaimId: null,
            reviewedRelationshipClaimId: null,
            reviewOutcome: 'CONFIRMED',
            supersedesReviewId: null,
            actorKey: 'owner-cli',
            reviewedAt: REVIEWED_AT,
            reason: null,
          },
        ],
      },
    };
    const reasons = reasonsOf(evaluateSubjectResearchAdmission(input(forged)));
    expect(reasons).toEqual([
      'IDENTITY_NOT_AUTHORITATIVELY_CONFIRMED',
      'REVIEW_AUTHORITY_WITHHELD',
    ]);
  });

  it('refuses a TAMPERED attestation: one altered signature withholds the whole chain', () => {
    const g = confirmSubject(jpGraph(), JP + 0x10);
    const record = g.attestations!.records[0]!;
    const sig = record.signature;
    const tampered: SubjectGraph = {
      ...g,
      attestations: {
        ...g.attestations!,
        records: [{ ...record, signature: `${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}` }],
      },
    };
    expect(reasonsOf(evaluateSubjectResearchAdmission(input(tampered)))).toEqual([
      'IDENTITY_NOT_AUTHORITATIVELY_CONFIRMED',
      'REVIEW_AUTHORITY_WITHHELD',
    ]);
  });
});

describe('R8 admission Q1: protected and unresolved structural parents refuse', () => {
  const FAC = 0x8c1;
  function faculty(target: string, confirmEdge: boolean): SubjectGraph {
    let g = baseGraph(FAC, {
      subjects: [subject(FAC, 'FACULTY_SCHOOL_DEPARTMENT')],
      identityClaims: [
        nameClaim(FAC + 1, FAC, 'Synthetic Faculty of Languages'),
        websiteClaim(FAC + 3, FAC, 'https://www.synthetic-r8-faculty.example.de/'),
      ],
      relationshipClaims: [relation(FAC + 4, FAC, 'PART_OF', { eche: target })],
    });
    if (confirmEdge) g = attest(g, FAC + 0x20, { kind: 'RELATIONSHIP_CLAIM', id: uid(FAC + 4) });
    return confirmSubject(g, FAC + 0x30);
  }

  it('a CONFIRMED PART_OF a protected ECHE row is PROTECTED_STRUCTURAL_PARENT', () => {
    const reasons = reasonsOf(
      evaluateSubjectResearchAdmission(input(faculty(FR_PROTECTED.echeRowKey, true))),
    );
    expect(reasons).toContain('PROTECTED_STRUCTURAL_PARENT');
    expect(reasons).toContain('PROTECTION_REEVALUATION_REQUIRED');
  });

  it('an UNCONFIRMED PART_OF a protected row is unresolved, never admitted', () => {
    const reasons = reasonsOf(
      evaluateSubjectResearchAdmission(input(faculty(FR_PROTECTED.echeRowKey, false))),
    );
    expect(reasons).toContain('STRUCTURAL_PARENTAGE_UNRESOLVED');
    expect(reasons).not.toContain('PROTECTED_STRUCTURAL_PARENT');
  });

  it('an ECHE parent the evaluation frame cannot vouch for is treated as protected (fail closed)', () => {
    const g = faculty(OUTSIDE_FRAME_KEY, true);
    expect(protectedKeysFor(g.input, REGISTRY)).toContain(OUTSIDE_FRAME_KEY);
    expect(reasonsOf(evaluateSubjectResearchAdmission(input(g)))).toContain(
      'PROTECTED_STRUCTURAL_PARENT',
    );
  });

  it('a CONFIRMED PART_OF an UNPROTECTED frame member is not a block, but still needs re-evaluation (monotone)', () => {
    const reasons = reasonsOf(
      evaluateSubjectResearchAdmission(input(faculty(FR_UNIVERSITY.echeRowKey, true))),
    );
    expect(reasons).not.toContain('PROTECTED_STRUCTURAL_PARENT');
    expect(reasons).toContain('PROTECTION_REEVALUATION_REQUIRED');
  });

  it('a structural cycle is unresolved', () => {
    const A = 0x8d1;
    const B = 0x8e1;
    let g = baseGraph(A, {
      subjects: [
        subject(A, 'INDEPENDENT_STUDENT_ASSOCIATION'),
        subject(B, 'INDEPENDENT_STUDENT_ASSOCIATION'),
      ],
      identityClaims: [
        nameClaim(A + 1, A, 'Synthetic Circle A'),
        websiteClaim(A + 3, A, 'https://www.synthetic-r8-cycle.example.jp/'),
        nameClaim(B + 1, B, 'Synthetic Circle B'),
      ],
      relationshipClaims: [
        relation(A + 4, A, 'PART_OF', { subject: B }),
        relation(B + 4, B, 'PART_OF', { subject: A }),
      ],
    });
    g = confirmSubject(g, A + 0x30);
    expect(reasonsOf(evaluateSubjectResearchAdmission(input(g)))).toContain(
      'STRUCTURAL_PARENTAGE_UNRESOLVED',
    );
  });
});

describe('R8 admission Q2: HOSTED_BY does not inherit protection; domain isolation is independent', () => {
  it('admits an independent association HOSTED_BY a protected institution on its OWN domain', () => {
    let g = jpGraph();
    g = {
      ...g,
      input: {
        ...g.input,
        relationshipClaims: [relation(JP + 4, JP, 'HOSTED_BY', { eche: FR_PROTECTED.echeRowKey })],
      },
    };
    const decision = evaluateSubjectResearchAdmission(input(confirmSubject(g, JP + 0x10)));
    expect(decision.outcome).toBe('ADMISSIBLE');
  });

  it('refuses the same subject when its root shares a registrable domain with an ECHE claim or promotion', () => {
    const g = confirmSubject(jpGraph(), JP + 0x10);
    expect(
      reasonsOf(evaluateSubjectResearchAdmission(input(g, { isolationDomains: ['example.jp'] }))),
    ).toEqual(['ROOT_DOMAIN_NOT_ISOLATED']);
  });

  it('refuses a faculty page on its ECHE university domain', () => {
    const g = confirmSubject(
      jpGraph('INDEPENDENT_STUDENT_ASSOCIATION', 'https://www.example.fr/club/'),
      JP + 0x10,
    );
    expect(reasonsOf(evaluateSubjectResearchAdmission(input(g)))).toEqual([
      'ROOT_DOMAIN_NOT_ISOLATED',
    ]);
  });
});

describe('R8 admission Q3: monotone protection - UNCERTAIN stays blocked, nothing clears it', () => {
  it('refuses a subject REGISTERED UNCERTAIN, even with an attested independent kind', () => {
    let g = jpGraph('UNCERTAIN');
    g = {
      ...g,
      input: {
        ...g.input,
        identityClaims: [
          ...g.input.identityClaims,
          {
            ...kindClaim(JP + 5, JP, 'INDEPENDENT_STUDENT_ASSOCIATION'),
            claimBasis: 'SOURCE_STATED',
          },
        ],
      },
    };
    g = attest(g, JP + 0x18, { kind: 'IDENTITY_CLAIM', id: uid(JP + 5) });
    g = confirmSubject(g, JP + 0x19);
    const reasons = reasonsOf(evaluateSubjectResearchAdmission(input(g)));
    expect(reasons).toContain('STRUCTURAL_PARENTAGE_UNRESOLVED');
  });

  it('refuses a parent-implying kind with no recorded parent', () => {
    const g = confirmSubject(jpGraph('INTERNAL_STUDENT_GROUP'), JP + 0x10);
    expect(reasonsOf(evaluateSubjectResearchAdmission(input(g)))).toContain(
      'STRUCTURAL_PARENTAGE_UNRESOLVED',
    );
  });
});

describe('R8 admission: the root is the subject own SOURCE_STATED website, by claim id', () => {
  const confirmed = () => confirmSubject(jpGraph(), JP + 0x10);

  it('refuses an unknown claim id, a name claim and another subject claim', () => {
    expect(
      reasonsOf(evaluateSubjectResearchAdmission(input(confirmed(), { rootClaimId: uid(1) }))),
    ).toEqual(['ROOT_CLAIM_NOT_FOUND']);
    expect(
      reasonsOf(evaluateSubjectResearchAdmission(input(confirmed(), { rootClaimId: uid(JP + 1) }))),
    ).toContain('ROOT_CLAIM_NOT_PUBLIC_WEBSITE');
    const g = confirmed();
    const other: SubjectGraph = {
      ...g,
      input: {
        ...g.input,
        subjects: [...g.input.subjects, subject(BR, 'INDEPENDENT_COMMUNITY')],
        identityClaims: [...g.input.identityClaims, websiteClaim(BR + 3, BR, BR_SITE)],
      },
    };
    expect(
      reasonsOf(evaluateSubjectResearchAdmission(input(other, { rootClaimId: uid(BR + 3) }))),
    ).toContain('ROOT_CLAIM_NOT_SUBJECTS_OWN');
  });

  it('refuses an INFERRED website and an effectively DISPUTED one', () => {
    let inferred = jpGraph();
    inferred = {
      ...inferred,
      input: {
        ...inferred.input,
        identityClaims: inferred.input.identityClaims.map((c) =>
          c.claimKind === 'PUBLIC_WEBSITE' ? { ...c, claimBasis: 'INFERRED' as const } : c,
        ),
      },
    };
    expect(
      reasonsOf(evaluateSubjectResearchAdmission(input(confirmSubject(inferred, JP + 0x10)))),
    ).toContain('ROOT_CLAIM_NOT_SOURCE_STATED');
    let disputed = attest(
      jpGraph(),
      JP + 0x18,
      { kind: 'IDENTITY_CLAIM', id: uid(JP + 3) },
      'DISPUTED',
    );
    disputed = confirmSubject(disputed, JP + 0x19);
    expect(reasonsOf(evaluateSubjectResearchAdmission(input(disputed)))).toContain(
      'ROOT_CLAIM_REVIEW_NEGATIVE',
    );
  });

  it('refuses an IP-literal root and a service-subdomain host, with the gateway own gates', () => {
    expect(
      reasonsOf(
        evaluateSubjectResearchAdmission(
          input(
            confirmSubject(
              jpGraph('INDEPENDENT_STUDENT_ASSOCIATION', 'http://192.0.2.10/'),
              JP + 0x10,
            ),
          ),
        ),
      ),
    ).toContain('ROOT_URL_UNUSABLE');
    expect(
      reasonsOf(
        evaluateSubjectResearchAdmission(
          input(
            confirmSubject(
              jpGraph(
                'INDEPENDENT_STUDENT_ASSOCIATION',
                'https://moodle.synthetic-r8-circle.example.jp/',
              ),
              JP + 0x10,
            ),
          ),
        ),
      ),
    ).toContain('ROOT_HOST_SERVICE_SUBDOMAIN');
  });

  it('is total over hostile input: never throws, always refuses', () => {
    const g = confirmed();
    for (const hostile of [
      { ...input(g), graph: { ...g, focalSubjectId: 'not-a-uuid' } },
      { ...input(g), isolationDomains: [''] },
      { ...input(g), isolationDomains: 'example.fr' as unknown as string[] },
      { ...input(g), graph: { ...g, focalSubjectId: uid(0x999) } },
      {
        ...input(g),
        graph: { ...g, input: { ...g.input, reviews: null } },
      } as unknown as SubjectAdmissionInput,
      { ...input(g), registry: null } as unknown as SubjectAdmissionInput,
    ]) {
      const decision = evaluateSubjectResearchAdmission(hostile);
      expect(decision.outcome).toBe('REFUSED');
    }
  });
});

describe('R8 protected-registry digest', () => {
  it('is stable for one registry and changes when the protected set changes', () => {
    expect(protectedRegistryDigest(REGISTRY)).toBe(protectedRegistryDigest(registry()));
    const cohort = syntheticCohort();
    cohort.admit(FR_UNIVERSITY);
    const other = cohort.load();
    if (!other.ok) throw new Error(other.detail);
    expect(protectedRegistryDigest(other.registry)).not.toBe(protectedRegistryDigest(REGISTRY));
  });
});

describe('R8 run guard: refusals that precede any database read', () => {
  const noDatabase = {
    query: () => {
      throw new Error('the guard must refuse before reading');
    },
  } as unknown as pg.Pool;
  const rootUrl = (() => {
    const v = validateRequestUrl(JP_SITE);
    if (!v.ok) throw new Error('fixture');
    return v.value;
  })();
  const subjectRoot = (scope: 'OPERATIONAL' | 'TEST_ONLY'): ResolvedRoot => ({
    websiteClaimId: null,
    promotionId: null,
    subjectAdmissionId: uid(0xa01),
    rootKey: `subject_admission:${uid(0xa01)}`,
    rootUrl,
    echeRowKey: null,
    organisationId: null,
    subjectAdmission: {
      admissionId: uid(0xa01),
      subjectId: uid(JP),
      identityClaimId: uid(JP + 3),
      identityAuthorityScope: scope,
      protectedRegistryDigest: protectedRegistryDigest(REGISTRY),
    },
  });
  const original = process.env['VITEST'];
  afterEach(() => {
    process.env['VITEST'] = original;
  });

  it('refuses a TEST_ONLY admission outside vitest (D5)', async () => {
    process.env['VITEST'] = 'false';
    await expect(
      enforceSubjectRootResearchEligibility(noDatabase, null, subjectRoot('TEST_ONLY')),
    ).rejects.toMatchObject({ code: 'SUBJECT_ROOT_TEST_ONLY_OUTSIDE_TEST' });
  });

  it('refuses an ECHE root handed to the subject guard', async () => {
    await expect(
      enforceSubjectRootResearchEligibility(noDatabase, null, {
        ...subjectRoot('OPERATIONAL'),
        subjectAdmission: null,
      }),
    ).rejects.toBeInstanceOf(SubjectRootRefusal);
  });

  it('refuses a changed protected registry before reading anything', async () => {
    const cohort = syntheticCohort();
    cohort.admit(FR_UNIVERSITY);
    await expect(
      enforceSubjectRootResearchEligibility(noDatabase, null, subjectRoot('OPERATIONAL'), {
        loadCohortRegistry: () => cohort.load(),
      }),
    ).rejects.toMatchObject({ code: 'SUBJECT_ROOT_PROTECTED_REGISTRY_CHANGED' });
  });

  it('refuses unverifiable cohort metadata', async () => {
    await expect(
      enforceSubjectRootResearchEligibility(noDatabase, null, subjectRoot('OPERATIONAL'), {
        loadCohortRegistry: () => ({
          ok: false,
          kind: 'EVALUATION_COHORT_METADATA_UNVERIFIED',
          detail: 'synthetic',
        }),
      }),
    ).rejects.toMatchObject({ code: 'SUBJECT_ROOT_COHORT_METADATA_UNVERIFIED' });
  });
});

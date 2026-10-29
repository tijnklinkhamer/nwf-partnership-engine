/**
 * Global R6 - a Discovery Subject as a research root, with SYNTHETIC,
 * deterministic sources only (no network, no database):
 *   1. a Japanese student association,
 *   2. a Brazilian language organisation,
 *   3. a faculty of an existing French ECHE university.
 *
 * The planner's protection facts are produced HERE by the real B2.1/B2.2/B2.3
 * evaluators (structural-parent constraint, subject read model, a TEST_ONLY
 * signed OWNER review), because closed Track B firewalls freeze their
 * production importers. A planned root is then REHEARSED through the
 * existing pure acquisition stages - robots policy, sitemap parsing, root
 * scope, the host gate, the frontier, extraction with redaction, candidate
 * scoring - exactly as `rootRunner.ts` composes them, to show the subject
 * enters the same foundation without any ECHE identifier. Nothing persists:
 * the fetch-evidence schema cannot record a subject root (an OWNER decision).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { evaluateStructuralParentConstraint } from '../../orgunits/identity/structuralParent.js';
import type {
  IdentityClaimRecord,
  IdentityGraphInput,
  SubjectReviewRecord,
} from '../../orgunits/identity/vocabulary.js';
import { createFrontier } from '../../orgunits/orchestrator/frontier.js';
import { scoreFetchedPageCandidate } from '../../orgunits/signals/score.js';
import { parseSitemapXml } from '../../orgunits/sitemap.js';
import { SubjectResearchAdmission } from '../../orgunits/subjectResearch/admission.js';
import {
  EXECUTION_BLOCKERS,
  NO_INFERENCE,
  SUBJECT_ROOT_ORIGIN,
  planSubjectResearchRoot,
  type SubjectResearchPlan,
  type SubjectResearchPlanInput,
} from '../../orgunits/subjectResearch/plan.js';
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
} from '../../orgunits/subjectReview/protocol.js';
import { ReviewTrustSet } from '../../orgunits/subjectReview/trust.js';
import { extractPage } from '../../orgunits/web/extract.js';
import { checkHostAdmissible } from '../../orgunits/web/hostPolicy.js';
import { ROBOTS_USER_AGENT_TOKEN } from '../../orgunits/web/robots.js';
import { EvaluatedRobotsPolicy } from '../../orgunits/web/robotsPolicy.js';
import { checkRootScope, validateRequestUrl } from '../../orgunits/web/url.js';
import {
  graph,
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
} from '../helpers/ownerReviewFixtures.js';

const ENV = '11111111-1111-4111-8111-111111111111';
const REVIEWED_AT = '2026-10-15T11:00:00.000Z';
const SIGNED_MS = Date.parse(REVIEWED_AT) - 60_000;
const KEY = testReviewKey('test-owner-r6');
const TEST_TRUST = testTrust(trustEntry(KEY));

/** Synthetic subjects. Hosts sit under documentation-style names on real suffixes, as the gateway requires. */
const JP = 0x6a1;
const BR = 0x6b1;
const FR = 0x6c1;
const JP_SITE = 'https://www.synthetic-r6-circle.example.jp/';
const BR_SITE = 'https://www.synthetic-r6-linguas.example.com.br/';
/** The French ECHE university's own website claim, and its (synthetic) source-row key. */
const FR_UNIVERSITY_SITE = 'https://www.synthetic-r6-universite.example.fr/';
const FR_UNIVERSITY_KEY = 'F SYNTH06|900000601';

function websiteClaim(n: number, subjectN: number, url: string): IdentityClaimRecord {
  return {
    ...nameClaim(n, subjectN, 'unused'),
    claimKind: 'PUBLIC_WEBSITE',
    nameText: null,
    websiteUrl: url,
    sourceUrl: sourceUrl(`r6-website-${n}`),
  };
}

const INPUTS: Record<number, Partial<IdentityGraphInput>> = {
  [JP]: {
    subjects: [subject(JP, 'INDEPENDENT_STUDENT_ASSOCIATION')],
    identityClaims: [
      nameClaim(JP + 1, JP, 'Synthetic Osaka Language Exchange Circle'),
      nameClaim(JP + 2, JP, '合成大阪言語交換サークル', { kind: 'NATIVE_NAME', language: 'ja' }),
      websiteClaim(JP + 3, JP, JP_SITE),
    ],
    knownEcheRowKeys: [],
  },
  [BR]: {
    subjects: [subject(BR, 'INDEPENDENT_COMMUNITY')],
    identityClaims: [
      nameClaim(BR + 1, BR, 'Associação Sintética de Línguas', {
        kind: 'NATIVE_NAME',
        language: 'pt-BR',
      }),
      nameClaim(BR + 2, BR, 'Synthetic Language Association'),
      websiteClaim(BR + 3, BR, BR_SITE),
    ],
    knownEcheRowKeys: [],
  },
  [FR]: {
    subjects: [subject(FR, 'FACULTY_SCHOOL_DEPARTMENT')],
    identityClaims: [
      nameClaim(FR + 1, FR, 'Faculté synthétique des langues'),
      kindClaim(FR + 2, FR, 'FACULTY_SCHOOL_DEPARTMENT'),
      websiteClaim(FR + 3, FR, `${FR_UNIVERSITY_SITE}faculte-langues/`),
    ],
    relationshipClaims: [relation(FR + 4, FR, 'PART_OF', { eche: FR_UNIVERSITY_KEY })],
    knownEcheRowKeys: [FR_UNIVERSITY_KEY],
  },
};

/** The review row + attestation a correct B2.3 execution would write, signed by a TEST key. */
function confirmedSubjectReview(
  g: SubjectGraph,
  reviewN: number,
): { review: SubjectReviewRecord; attestation: ReviewAttestationRecord } {
  const target = { kind: 'SUBJECT' as const, id: g.focalSubjectId };
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
    KEY,
    { nowMs: SIGNED_MS },
  );
  const p = payloadOf(envelope) as Record<string, string>;
  const doc = JSON.parse(envelope) as { payload: string; signature: string };
  const evidence = p['evidence'] as unknown as Record<string, string>;
  const review: SubjectReviewRecord = {
    id: uid(reviewN),
    reviewedSubjectId: g.focalSubjectId,
    reviewedIdentityClaimId: null,
    reviewedRelationshipClaimId: null,
    reviewOutcome: 'CONFIRMED',
    supersedesReviewId: null,
    actorKey: `owner-review-${KEY.keyId}`,
    reviewedAt: REVIEWED_AT,
    reason: null,
  };
  return {
    review,
    attestation: {
      id: uid(reviewN + 5000),
      reviewId: review.id,
      environmentId: ENV,
      protocol: REVIEW_PROTOCOL,
      action: REVIEW_ACTION_AUDIENCE,
      keyId: KEY.keyId,
      keyFingerprint: KEY.fingerprint,
      nonce: p['nonce']!,
      subjectId: g.focalSubjectId,
      reviewTargetKey: `subject:${g.focalSubjectId}`,
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
      payloadSha256: createHash('sha256')
        .update(Buffer.from(doc.payload, 'base64url'))
        .digest('hex'),
      recordedAt: REVIEWED_AT,
    },
  };
}

/** Builds the planner input from the REAL B evaluators, optionally with a confirmed review. */
function plannerInput(
  subjectN: number,
  options: { reviewed: boolean; trust: ReviewTrustSet; protectedKeys?: string[] },
): SubjectResearchPlanInput {
  const base: SubjectGraph = {
    focalSubjectId: uid(subjectN),
    input: graph(INPUTS[subjectN]!),
    recordedAt: {},
  };
  let g = base;
  if (options.reviewed) {
    const { review, attestation } = confirmedSubjectReview(base, subjectN + 0x10);
    const attestations: LoadedReviewAttestations = {
      environmentId: ENV,
      records: [attestation],
      nonceUseCounts: { [attestation.nonce]: 1 },
    };
    g = { ...base, input: { ...base.input, reviews: [review] }, attestations };
  }
  const model = deriveSubjectReadModel(g, options.trust);
  const constraint = evaluateStructuralParentConstraint(
    g.input,
    uid(subjectN),
    options.protectedKeys ?? [FR_UNIVERSITY_KEY],
  );
  const websiteReview = new Map(model.websites.map((w) => [w.claimId, w.effectiveReview]));
  return {
    origin: SUBJECT_ROOT_ORIGIN,
    subjectId: uid(subjectN),
    rootClaimId: uid(subjectN + 3),
    identityClaims: g.input.identityClaims
      .filter((c) => c.subjectId === uid(subjectN))
      .map((c) => ({
        id: c.id,
        subjectId: c.subjectId,
        claimKind: c.claimKind,
        websiteUrl: c.websiteUrl,
        claimBasis: c.claimBasis,
        effectiveReview: websiteReview.get(c.id) ?? 'UNREVIEWED',
      })),
    identityReview: {
      confirmed: model.identityStatus.reviewConfirmed,
      authorityScope: options.trust.scope,
    },
    structuralParent: constraint.constraint,
    // The French ECHE university's website claim, as the existing ECHE path holds it.
    echeWebsiteRegistrableDomains: [validateRequestUrl(FR_UNIVERSITY_SITE).ok ? 'example.fr' : ''],
  };
}

const REHEARSAL = () => SubjectResearchAdmission.forVitestSyntheticRehearsal();
const planned = (plan: SubjectResearchPlan) => {
  if (plan.outcome !== 'PLANNED') throw new Error(`refused: ${plan.reasons.join(',')}`);
  return plan;
};
const reviewedTestOnly = { reviewed: true, trust: TEST_TRUST };

describe('R6 planner over the three synthetic cases (real B evaluators feed it)', () => {
  it('a Japanese student association plans a subject root with no ECHE identity', () => {
    const plan = planned(planSubjectResearchRoot(plannerInput(JP, reviewedTestOnly), REHEARSAL()));
    expect(plan.rootKey).toBe(`subject_claim:${uid(JP + 3)}`);
    expect(plan.rootUrl.hostname).toBe('www.synthetic-r6-circle.example.jp');
    expect(plan.rootUrl.registrableDomain).toBe('example.jp');
    expect(plan.executable).toBe(false);
    expect(plan.executionBlockers).toEqual(EXECUTION_BLOCKERS);
    expect(plan.inference).toEqual(NO_INFERENCE);
    expect(plan.identityAuthorityScope).toBe('TEST_ONLY');
    expect(JSON.stringify(plan)).not.toMatch(/\|[0-9]{9}|eche_?row_?key|country|"JP"/i);
    expect(plan.inference.jurisdiction).toBe('NOT_INFERRED');
  });

  it('a Brazilian language organisation plans independently, with its own root', () => {
    const plan = planned(planSubjectResearchRoot(plannerInput(BR, reviewedTestOnly), REHEARSAL()));
    expect(plan.rootKey).toBe(`subject_claim:${uid(BR + 3)}`);
    expect(plan.rootUrl.registrableDomain).toBe('example.com.br');
    expect(plan.subjectId).toBe(uid(BR));
  });

  it('a faculty of the French ECHE university is refused: protected parent unconfirmed, and its domain is the university path', () => {
    const plan = planSubjectResearchRoot(plannerInput(FR, reviewedTestOnly), REHEARSAL());
    expect(plan).toMatchObject({
      outcome: 'REFUSED',
      reasons: ['ROOT_DOMAIN_COINCIDES_WITH_ECHE_WEBSITE', 'STRUCTURAL_PARENT_UNRESOLVED'],
    });
  });

  it('a CONFIRMED PART_OF a protected ECHE row is RESEARCH_BLOCKING (real B2.1 evaluator)', () => {
    const confirmedEdge = graph({
      ...INPUTS[FR]!,
      reviews: [review(FR + 5, { relationshipClaim: FR + 4 }, 'CONFIRMED')],
    });
    const constraint = evaluateStructuralParentConstraint(confirmedEdge, uid(FR), [
      FR_UNIVERSITY_KEY,
    ]);
    expect(constraint.constraint).toBe('RESEARCH_BLOCKING');
    const plan = planSubjectResearchRoot(
      { ...plannerInput(FR, reviewedTestOnly), structuralParent: constraint.constraint },
      REHEARSAL(),
    );
    expect(plan).toMatchObject({
      outcome: 'REFUSED',
      reasons: ['ROOT_DOMAIN_COINCIDES_WITH_ECHE_WEBSITE', 'STRUCTURAL_PARENT_BLOCKING'],
    });
  });

  it('without an admission capability every subject is refused, whatever its evidence', () => {
    for (const n of [JP, BR]) {
      expect(planSubjectResearchRoot(plannerInput(n, reviewedTestOnly))).toMatchObject({
        outcome: 'REFUSED',
        reasons: ['ADMISSION_POLICY_ABSENT'],
      });
    }
  });

  it('under OPERATIONAL trust (no OWNER key exists) no identity is confirmed, so research is refused', () => {
    const operational = ReviewTrustSet.operational();
    const plan = planSubjectResearchRoot(
      plannerInput(JP, { reviewed: true, trust: operational }),
      REHEARSAL(),
    );
    expect(plan).toMatchObject({ outcome: 'REFUSED', reasons: ['IDENTITY_NOT_REVIEW_CONFIRMED'] });
  });
});

describe('R6 planner refuses unsupported or unapproved origins and malformed roots', () => {
  const base = () => plannerInput(JP, reviewedTestOnly);
  const reasonsOf = (input: SubjectResearchPlanInput, admission: unknown = REHEARSAL()) => {
    const plan = planSubjectResearchRoot(input, admission);
    return plan.outcome === 'REFUSED' ? plan.reasons : [];
  };
  const withRoot = (over: Partial<SubjectResearchPlanInput['identityClaims'][number]>) => {
    const input = base();
    return {
      ...input,
      identityClaims: input.identityClaims.map((c) =>
        c.id === input.rootClaimId ? { ...c, ...over } : c,
      ),
    };
  };

  it.each([
    [
      'an ECHE-row origin',
      { ...plannerInput(JP, reviewedTestOnly), origin: 'ECHE_WEBSITE_CLAIM' },
      'ROOT_ORIGIN_UNSUPPORTED',
    ],
    [
      'a name claim as root',
      { ...plannerInput(JP, reviewedTestOnly), rootClaimId: uid(JP + 1) },
      'ROOT_CLAIM_NOT_PUBLIC_WEBSITE',
    ],
    [
      'an unknown claim',
      { ...plannerInput(JP, reviewedTestOnly), rootClaimId: uid(0x6fff) },
      'ROOT_CLAIM_NOT_FOUND',
    ],
    ['another subject’s claim', withRoot({ subjectId: uid(BR) }), 'ROOT_CLAIM_NOT_SUBJECTS_OWN'],
    ['an inferred website', withRoot({ claimBasis: 'INFERRED' }), 'ROOT_CLAIM_NOT_SOURCE_STATED'],
    ['a disputed website', withRoot({ effectiveReview: 'DISPUTED' }), 'ROOT_CLAIM_REVIEW_NEGATIVE'],
    [
      'a reserved .example host',
      withRoot({ websiteUrl: 'https://synthetic-r5-jp.example/' }),
      'ROOT_URL_UNUSABLE',
    ],
    [
      'an explicit port',
      withRoot({ websiteUrl: 'https://www.synthetic-r6-circle.example.jp:443/' }),
      'ROOT_URL_UNUSABLE',
    ],
    [
      'credentials',
      withRoot({ websiteUrl: 'https://u:p@www.synthetic-r6-circle.example.jp/' }),
      'ROOT_URL_UNUSABLE',
    ],
    [
      'a service subdomain',
      withRoot({ websiteUrl: 'https://moodle.synthetic-r6-circle.example.jp/' }),
      'ROOT_HOST_SERVICE_SUBDOMAIN',
    ],
    [
      'a malformed protection fact',
      { ...plannerInput(JP, reviewedTestOnly), structuralParent: 'FINE' },
      'PROTECTION_INPUT_INVALID',
    ],
  ])('refuses %s', (_label, input, reason) => {
    expect(reasonsOf(input as SubjectResearchPlanInput)).toContain(reason);
  });

  it('a forged or cloned admission is no admission', () => {
    const forged = { scope: 'SYNTHETIC_REHEARSAL_ONLY' };
    expect(reasonsOf(base(), forged)).toEqual(['ADMISSION_POLICY_ABSENT']);
    expect(reasonsOf(base(), structuredClone(REHEARSAL()))).toEqual(['ADMISSION_POLICY_ABSENT']);
    expect(reasonsOf(base(), Object.create(SubjectResearchAdmission.prototype))).toEqual([
      'ADMISSION_POLICY_ABSENT',
    ]);
  });

  it('has no production constructor: outside vitest the rehearsal seam throws', () => {
    const previous = process.env['VITEST'];
    process.env['VITEST'] = 'false';
    try {
      expect(() => SubjectResearchAdmission.forVitestSyntheticRehearsal()).toThrow(/TEST SEAM/);
    } finally {
      process.env['VITEST'] = previous;
    }
  });

  it('two subjects on one registrable domain each plan alone: a shared domain is never equivalence', () => {
    const input = base();
    const twin = {
      ...input,
      subjectId: uid(BR),
      rootClaimId: uid(BR + 3),
      identityClaims: [
        {
          ...input.identityClaims.find((c) => c.id === input.rootClaimId)!,
          id: uid(BR + 3),
          subjectId: uid(BR),
        },
      ],
    };
    const a = planned(planSubjectResearchRoot(input, REHEARSAL()));
    const b = planned(planSubjectResearchRoot(twin, REHEARSAL()));
    expect(a.rootUrl.registrableDomain).toBe(b.rootUrl.registrableDomain);
    expect(a.rootKey).not.toBe(b.rootKey);
    expect(JSON.stringify(a)).not.toContain(uid(BR));
    expect(a.inference.subjectEquivalence).toBe('NOT_INFERRED');
  });

  it('is total over hostile input', () => {
    for (const bad of [null, undefined, {}, { origin: SUBJECT_ROOT_ORIGIN }]) {
      expect(
        planSubjectResearchRoot(bad as unknown as SubjectResearchPlanInput, REHEARSAL()).outcome,
      ).toBe('REFUSED');
    }
  });
});

// ------------------------------------------------------------ the rehearsal

/** Deterministic synthetic documents per host: what a scripted transport would return. */
const DOCUMENTS: Record<string, Record<string, string>> = {
  [JP_SITE]: {
    policy:
      'User-agent: *\nDisallow: /members/\nSitemap: https://www.synthetic-r6-circle.example.jp/sitemap-main.xml\n',
    sitemap:
      '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      '<url><loc>https://www.synthetic-r6-circle.example.jp/international-students/</loc></url>' +
      '<url><loc>https://www.synthetic-r6-circle.example.jp/language-exchange/</loc></url>' +
      '<url><loc>https://www.synthetic-r6-circle.example.jp/members/roster/</loc></url>' +
      '<url><loc>https://events.example-elsewhere.jp/r6/</loc></url>' +
      '<url><loc>https://moodle.synthetic-r6-circle.example.jp/course/</loc></url>' +
      '</urlset>',
    '/international-students/':
      '<html><head><title>International Students | Language Exchange Circle</title></head>' +
      '<body><h1>International students</h1><p>Welcome to the international student exchange. ' +
      'Contact board@synthetic-r6-circle.example.jp</p></body></html>',
    '/language-exchange/':
      '<html><head><title>Language exchange and language courses</title></head>' +
      '<body><h1>Language exchange</h1><p>Weekly tandem language exchange sessions.</p></body></html>',
  },
  [BR_SITE]: {
    policy: 'User-agent: *\nAllow: /\n',
    sitemap:
      '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      '<url><loc>https://www.synthetic-r6-linguas.example.com.br/intercambio-internacional/</loc></url>' +
      '<url><loc>http://www.synthetic-r6-linguas.example.com.br/downgrade/</loc></url>' +
      '</urlset>',
    '/intercambio-internacional/':
      '<html><head><title>International exchange - language centre</title></head>' +
      '<body><h1>International exchange</h1><p>Language centre courses for international students. ' +
      'Tel +55 11 5555 0123</p></body></html>',
  },
};

function rehearse(plan: Extract<SubjectResearchPlan, { outcome: 'PLANNED' }>) {
  const docs = DOCUMENTS[plan.rootUrl.url]!;
  const root = plan.rootUrl;
  const policy = EvaluatedRobotsPolicy.fromBody(docs['policy']!);
  const rootAllowed =
    policy.evaluate(ROBOTS_USER_AGENT_TOKEN, root.requestPath).decision === 'ALLOWED';
  const parsed = parseSitemapXml(docs['sitemap']!);
  const frontier = createFrontier();
  const refused: Record<string, string> = {};
  for (const loc of parsed.locs) {
    const v = validateRequestUrl(loc);
    if (!v.ok) {
      refused[loc] = v.reason;
      continue;
    }
    const scope = checkRootScope(root, v.value);
    if (!scope.ok) {
      refused[loc] = scope.reason;
      continue;
    }
    if (!checkHostAdmissible(v.value.hostname, v.value.registrableDomain).ok) {
      refused[loc] = 'service_subdomain';
      continue;
    }
    if (policy.evaluate(ROBOTS_USER_AGENT_TOKEN, v.value.requestPath).decision !== 'ALLOWED') {
      refused[loc] = 'robots_disallowed';
      continue;
    }
    frontier.add(v.value.url, 'SITEMAP', null, null);
  }
  const pages: { url: string; text: string; trackA: number; trackB: number }[] = [];
  for (;;) {
    const next = frontier.pickNext(0, 0, () => true);
    if (next === null) break;
    const html = docs[new URL(next.url).pathname];
    if (html === undefined) continue;
    const page = extractPage(html);
    const score = scoreFetchedPageCandidate({
      url: next.url,
      title: page.title,
      headings: page.headings.filter((h) => h.level <= 3) as { level: 1 | 2 | 3; text: string }[],
    });
    const track = (t: string) => score.tracks.find((x) => x.track === t)?.score ?? 0;
    pages.push({ url: next.url, text: page.mainText, trackA: track('A'), trackB: track('B') });
  }
  return { rootAllowed, sitemapDirectives: policy.sitemapUrls, refused, pages };
}

describe('R6 rehearsal: a planned subject root enters the existing acquisition stages', () => {
  it('the Japanese association: policy, sitemap, scope, host gate, frontier, extraction, scoring', () => {
    const plan = planned(planSubjectResearchRoot(plannerInput(JP, reviewedTestOnly), REHEARSAL()));
    const r = rehearse(plan);
    expect(r.rootAllowed).toBe(true);
    expect(r.sitemapDirectives).toEqual([
      'https://www.synthetic-r6-circle.example.jp/sitemap-main.xml',
    ]);
    expect(r.refused).toEqual({
      'https://www.synthetic-r6-circle.example.jp/members/roster/': 'robots_disallowed',
      'https://events.example-elsewhere.jp/r6/': 'registrable_domain_outside_root',
      'https://moodle.synthetic-r6-circle.example.jp/course/': 'service_subdomain',
    });
    expect(r.pages.map((p) => p.url).sort()).toEqual([
      'https://www.synthetic-r6-circle.example.jp/international-students/',
      'https://www.synthetic-r6-circle.example.jp/language-exchange/',
    ]);
    // Redaction is part of extraction: no contact datum survives.
    for (const p of r.pages) expect(p.text).not.toMatch(/@|board@/);
    expect(r.pages.some((p) => p.text.includes('[EMAIL]'))).toBe(true);
    expect(Math.max(...r.pages.map((p) => p.trackA))).toBeGreaterThan(0);
  });

  it('the Brazilian organisation: a downgrade is refused by root scope; the page is redacted and scored', () => {
    const plan = planned(planSubjectResearchRoot(plannerInput(BR, reviewedTestOnly), REHEARSAL()));
    const r = rehearse(plan);
    expect(r.rootAllowed).toBe(true);
    expect(r.refused).toEqual({
      'http://www.synthetic-r6-linguas.example.com.br/downgrade/': 'scheme_downgrade',
    });
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0]!.text).toContain('[PHONE]');
    expect(r.pages[0]!.text).not.toMatch(/5555/);
    expect(r.pages[0]!.trackA + r.pages[0]!.trackB).toBeGreaterThan(0);
  });

  it('is deterministic: the same synthetic sources give the same rehearsal', () => {
    const plan = planned(planSubjectResearchRoot(plannerInput(BR, reviewedTestOnly), REHEARSAL()));
    expect(JSON.stringify(rehearse(plan))).toBe(JSON.stringify(rehearse(plan)));
  });
});

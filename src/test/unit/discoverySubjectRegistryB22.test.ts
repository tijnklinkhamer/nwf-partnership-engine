/**
 * Track B, B2.2 - the discovery-subject registry's PURE layer, with SYNTHETIC
 * records only (the B2.1 fixtures: `.example` URLs, `T B21` ECHE keys).
 *
 *   - the read model keeps proposed / structurally valid / conflicted /
 *     partially reviewed / review-confirmed apart, and never grants research
 *     authority - not even to a review-confirmed subject;
 *   - its per-claim review heads agree with the B2.1 validator's own states;
 *   - the state digest moves on any new claim or review and on nothing else;
 *   - the recorded actor key is bound, never supplied;
 *   - the trusted-reviewer capability cannot be forged and has no production
 *     constructor;
 *   - the CLI is narrow: unknown options and commands are refused, review
 *     execution is refused before any connection, and a command without
 *     --execute never reaches the writer;
 *   - (B2.2-C) the registry is not a canonical identity issuer: canonical-
 *     shaped `cand:` / `chn:` / `opp:` ids and equivalence predicates are
 *     refused before any registry read or write, and two subjects sharing an
 *     identifier stay two subjects with a review signal - never merged, never
 *     promoted to an equivalence, never granted research authority.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';

import { runDiscoverySubjects } from '../../cli/commands/discoverySubjects.js';
import { validateIdentityGraph } from '../../orgunits/identity/validate.js';
import type { IdentityGraphInput } from '../../orgunits/identity/vocabulary.js';
import {
  certifiedChainHead,
  deriveSubjectReadModel,
  subjectStateDigest,
  summariseSubjectPage,
  type SubjectGraph,
} from '../../orgunits/subjectRegistry/readModel.js';
import {
  REGISTRY_WRITER_ACTOR_KEY,
  REGISTRY_WRITER_ROLE,
  identityClaimRecord,
  provenanceRecord,
  subjectRecord,
} from '../../orgunits/subjectRegistry/requests.js';
import {
  REVIEWER_TRUST_PRIMITIVE_ABSENT,
  TrustedReviewerContext,
} from '../../orgunits/subjectRegistry/reviewAuthority.js';
import { ReviewTrustSet } from '../../orgunits/subjectReview/trust.js';
import {
  AS_OF,
  ECHE_ALPHA,
  ECHE_PROTECTED,
  OBSERVED,
  graph,
  identifierClaim,
  kindClaim,
  nameClaim,
  relation,
  review,
  subject,
  uid,
} from '../helpers/discoveryIdentityFixtures.js';

function focal(n: number, parts: Partial<IdentityGraphInput>): SubjectGraph {
  return { focalSubjectId: uid(n), input: graph(parts), recordedAt: {} };
}

describe('B2.2 read model: six distinct states, none of them research authority', () => {
  it('a bare proposal is proposed, structurally valid, unreviewed and not confirmed', () => {
    const m = deriveSubjectReadModel(
      focal(1, { subjects: [subject(1)], identityClaims: [nameClaim(10, 1, 'Synthetic Club')] }),
    );
    expect(m.identityStatus).toEqual({
      proposed: true,
      structurallyValid: true,
      conflicted: false,
      reviewCoverage: 'UNREVIEWED',
      identityReview: 'UNREVIEWED',
      identityReviewHeadId: null,
      reviewConfirmed: false,
      factualVerification: 'NOT_ESTABLISHED_BY_THIS_LAYER',
    });
    expect(m.names.map((n) => [n.value, n.review])).toEqual([['Synthetic Club', 'UNREVIEWED']]);
    expect(m.missingEvidence).toEqual([
      'ENTITY_KIND_CLAIM_ABSENT',
      'KIND_NOT_REVIEW_CONFIRMED',
      'IDENTITY_NOT_REVIEW_CONFIRMED',
      'STRUCTURAL_PARENT_UNKNOWN',
    ]);
    expect(m.researchAuthority.granted).toBe(false);
  });

  it('partial review, conflict and review confirmation are separate facts', () => {
    const partial = deriveSubjectReadModel(
      focal(1, {
        subjects: [subject(1, 'INDEPENDENT_COMMUNITY')],
        identityClaims: [
          nameClaim(10, 1, 'Synthetic Club'),
          kindClaim(11, 1, 'INDEPENDENT_COMMUNITY'),
        ],
        reviews: [review(90, { identityClaim: 10 }, 'CONFIRMED')],
      }),
    );
    expect(partial.identityStatus.reviewCoverage).toBe('PARTIALLY_REVIEWED');
    expect(partial.identityStatus.reviewConfirmed).toBe(false);
    expect(partial.names[0]!.reviewHeadId).toBe(uid(90));

    const conflicted = deriveSubjectReadModel(
      focal(1, {
        subjects: [subject(1)],
        identityClaims: [
          nameClaim(10, 1, 'Synthetic Club'),
          kindClaim(11, 1, 'INDEPENDENT_COMMUNITY'),
          kindClaim(12, 1, 'INTERNAL_STUDENT_GROUP'),
        ],
      }),
    );
    expect(conflicted.identityStatus.structurallyValid).toBe(true);
    expect(conflicted.identityStatus.conflicted).toBe(true);
    expect(conflicted.findings.conflicts.map((f) => f.code)).toEqual(['ENTITY_KIND_CONFLICT']);

    const confirmed = deriveSubjectReadModel(
      focal(1, {
        subjects: [subject(1, 'INDEPENDENT_COMMUNITY')],
        identityClaims: [
          nameClaim(10, 1, 'Synthetic Club'),
          kindClaim(11, 1, 'INDEPENDENT_COMMUNITY'),
        ],
        reviews: [
          review(90, { identityClaim: 10 }, 'CONFIRMED'),
          review(91, { identityClaim: 11 }, 'CONFIRMED'),
          review(92, { subject: 1 }, 'CONFIRMED'),
        ],
      }),
    );
    expect(confirmed.identityStatus.reviewCoverage).toBe('FULLY_REVIEWED');
    // B2.3: these fixture reviews carry no OWNER attestation, so authority is
    // withheld; the attested case is proven in discoverySubjectReviewB23.test.ts.
    expect(confirmed.identityStatus.reviewConfirmed).toBe(false);
    expect(confirmed.kinds.reviewed).toBe(null);
    // Reviewed identity is NOT research eligibility.
    expect(confirmed.researchAuthority).toEqual({
      granted: false,
      status: 'NOT_GRANTED',
      reasons: [
        'SUBJECT_RESEARCH_ADMISSION_POLICY_ABSENT',
        'PROTECTED_STRUCTURAL_PARENTAGE_NOT_EVALUATED',
        'IDENTITY_NOT_REVIEW_CONFIRMED',
        'REVIEW_ATTESTATION_NOT_EVALUATED',
      ],
    });
  });

  it('a structurally invalid subject is never review-confirmed, whatever its head says', () => {
    const m = deriveSubjectReadModel(
      focal(1, {
        subjects: [subject(1)],
        identityClaims: [],
        reviews: [review(90, { subject: 1 }, 'CONFIRMED')],
      }),
    );
    expect(m.identityStatus.identityReview).toBe('CONFIRMED');
    expect(m.identityStatus.structurallyValid).toBe(false);
    expect(m.identityStatus.reviewConfirmed).toBe(false);
    expect(m.findings.invalid.map((f) => f.code)).toContain('SUBJECT_CONFIRMED_WITHOUT_NAME_CLAIM');
    expect(m.reviewability.subjectConfirmationPreconditionsUnmet).toEqual([
      'NAME_CLAIM_ABSENT',
      'STRUCTURALLY_INVALID',
    ]);
  });

  it('a rejected claim is not effective, and a later claim inherits no confirmation', () => {
    const m = deriveSubjectReadModel(
      focal(1, {
        subjects: [subject(1)],
        identityClaims: [
          nameClaim(10, 1, 'Synthetic Club'),
          nameClaim(13, 1, 'Synthetic Club', { kind: 'ALTERNATE_NAME', src: 'later' }),
          kindClaim(11, 1, 'INTERNAL_STUDENT_GROUP'),
        ],
        reviews: [
          review(90, { identityClaim: 10 }, 'CONFIRMED'),
          review(91, { identityClaim: 11 }, 'REJECTED', { reason: 'synthetic' }),
          review(92, { subject: 1 }, 'CONFIRMED'),
        ],
      }),
    );
    // B2.3-R2: an unattested rejection is recorded history, not authority -
    // it hides no claimed kind (discoverySubjectReviewB23.test.ts).
    expect(m.kinds.claimed).toEqual(['INTERNAL_STUDENT_GROUP']);
    expect(m.kinds.claims.map((c) => c.review)).toEqual(['REJECTED']);
    expect(m.names.map((n) => [n.claimId, n.review])).toEqual([
      [uid(10), 'CONFIRMED'],
      [uid(13), 'UNREVIEWED'],
    ]);
  });

  it('HOSTED_BY is never structural, and an UNCERTAIN kind with no parent stays unresolved', () => {
    const m = deriveSubjectReadModel(
      focal(1, {
        subjects: [subject(1, 'UNCERTAIN')],
        identityClaims: [nameClaim(10, 1, 'Synthetic Hosted Club')],
        relationshipClaims: [relation(20, 1, 'HOSTED_BY', { eche: ECHE_PROTECTED })],
      }),
    );
    expect(m.relationships.map((r) => [r.predicate, r.structural])).toEqual([['HOSTED_BY', false]]);
    expect(m.structuralParentage).toEqual({
      partOfTargets: [],
      protectedRegistryConsulted: false,
      unresolvedReason: 'STRUCTURAL_PARENT_UNKNOWN',
    });
    expect(m.researchAuthority.reasons).toContain(
      'STRUCTURAL_PARENTAGE_UNRESOLVED:STRUCTURAL_PARENT_UNKNOWN',
    );
  });

  it('keeps several affiliations side by side, with no parent elected', () => {
    const m = deriveSubjectReadModel(
      focal(1, {
        subjects: [subject(1, 'NETWORK_LOCAL_CHAPTER'), subject(2, 'ORGANISATION_NETWORK')],
        identityClaims: [
          nameClaim(10, 1, 'Synthetic Chapter'),
          nameClaim(11, 2, 'Synthetic Network'),
        ],
        relationshipClaims: [
          relation(20, 1, 'LOCAL_CHAPTER_OF', { subject: 2 }),
          relation(21, 1, 'AFFILIATED_WITH', { eche: ECHE_ALPHA }),
          relation(22, 1, 'OPERATES_AT', { eche: ECHE_PROTECTED }),
        ],
      }),
    );
    expect(m.relationships.map((r) => r.predicate)).toEqual([
      'LOCAL_CHAPTER_OF',
      'AFFILIATED_WITH',
      'OPERATES_AT',
    ]);
    expect(m.structuralParentage.partOfTargets).toEqual([]);
    expect(m.findings.unresolved.map((f) => f.code)).toContain(
      'RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED',
    );
  });
});

describe('B2.2 review heads agree with the B2.1 validator', () => {
  const chains: Partial<IdentityGraphInput>[] = [
    { reviews: [] },
    { reviews: [review(90, { relationshipClaim: 20 }, 'CONFIRMED')] },
    {
      reviews: [
        review(90, { relationshipClaim: 20 }, 'CONFIRMED', { at: '2026-10-02T10:00:00.000Z' }),
        review(91, { relationshipClaim: 20 }, 'WITHDRAWN', {
          supersedes: 90,
          at: '2026-10-03T10:00:00.000Z',
        }),
      ],
    },
    {
      reviews: [
        review(90, { relationshipClaim: 20 }, 'CONFIRMED'),
        review(91, { relationshipClaim: 20 }, 'DISPUTED'),
      ],
    },
    {
      reviews: [
        review(90, { relationshipClaim: 20 }, 'REJECTED', { at: '2026-10-05T10:00:00.000Z' }),
        review(91, { relationshipClaim: 20 }, 'CONFIRMED', {
          supersedes: 90,
          at: '2026-10-01T10:00:00.000Z',
        }),
      ],
    },
  ];
  it.each(chains.map((c, i) => [i, c] as const))('chain fixture %i', (_i, parts) => {
    const input = graph({
      subjects: [subject(1)],
      identityClaims: [nameClaim(10, 1, 'Synthetic Club')],
      relationshipClaims: [relation(20, 1, 'AFFILIATED_WITH', { eche: ECHE_ALPHA })],
      ...parts,
    });
    const v = validateIdentityGraph(input);
    const head = certifiedChainHead(input.reviews, v.findings, `relationship_claim:${uid(20)}`);
    expect(head.state).toBe(v.relationships[0]!.review);
  });
});

describe('B2.2 state digest', () => {
  const base = {
    subjects: [subject(1)],
    identityClaims: [nameClaim(10, 1, 'Synthetic Club')],
  };
  it('changes when a claim or a review is added, and not with input order', () => {
    const d0 = subjectStateDigest(focal(1, base));
    const d1 = subjectStateDigest(
      focal(1, {
        ...base,
        identityClaims: [...base.identityClaims, kindClaim(11, 1, 'UNCERTAIN')],
      }),
    );
    const d2 = subjectStateDigest(
      focal(1, {
        ...base,
        reviews: [review(90, { identityClaim: 10 }, 'DISPUTED', { reason: 'x' })],
      }),
    );
    expect(new Set([d0, d1, d2]).size).toBe(3);
    const twoClaims = [nameClaim(10, 1, 'A'), nameClaim(11, 1, 'B', { src: 'b' })];
    expect(
      subjectStateDigest(focal(1, { subjects: [subject(1)], identityClaims: twoClaims })),
    ).toBe(
      subjectStateDigest(
        focal(1, { subjects: [subject(1)], identityClaims: [...twoClaims].reverse() }),
      ),
    );
  });

  it('ignores records that belong to other subjects', () => {
    const withOther = focal(1, {
      subjects: [subject(1), subject(2)],
      identityClaims: [nameClaim(10, 1, 'Synthetic Club'), nameClaim(11, 2, 'Other')],
    });
    expect(subjectStateDigest(withOther)).toBe(subjectStateDigest(focal(1, base)));
  });
});

describe('B2.2 list summary', () => {
  it('names each subject, derives its review, and grants nothing', () => {
    const page = summariseSubjectPage(
      {
        subjects: [subject(1), subject(2)],
        identityClaims: [nameClaim(10, 1, 'Same Name'), nameClaim(11, 2, 'Same Name')],
        reviews: [review(90, { subject: 2 }, 'CONFIRMED')],
        recordedAt: {},
      },
      AS_OF,
      2,
    );
    expect(page.subjects.map((s) => [s.subjectId, s.names, s.identityReview])).toEqual([
      [uid(1), ['Same Name'], 'UNREVIEWED'],
      [uid(2), ['Same Name'], 'CONFIRMED'],
    ]);
    expect(page.subjects.every((s) => s.researchAuthority === 'NOT_GRANTED')).toBe(true);
    expect(page.nextAfter).toBe(uid(2));
  });
});

describe('B2.2 requests: the recorded actor is bound, never supplied', () => {
  it('stamps the CLI path key on subjects and on every source type', () => {
    expect(REGISTRY_WRITER_ACTOR_KEY).toBe('discovery-subjects-cli');
    const s = subjectRecord({
      subjectId: uid(1),
      registeredKind: 'UNCERTAIN',
      registrationNote: null,
      name: 'x',
      nameLanguage: null,
      provenance: {
        source: { sourceType: 'PUBLIC_URL', url: 'https://a.example/', versionRef: null },
        observedAt: OBSERVED,
        claimBasis: 'SOURCE_STATED',
      },
    });
    expect(s.registeredByActorKey).toBe(REGISTRY_WRITER_ACTOR_KEY);
    for (const source of [
      { sourceType: 'PUBLIC_URL', url: 'https://a.example/', versionRef: null },
      { sourceType: 'PAGE_EVIDENCE', pageEvidenceId: uid(5) },
      { sourceType: 'WEBSITE_CLAIM', websiteClaimId: uid(6) },
    ] as const) {
      const p = provenanceRecord({ source, observedAt: OBSERVED, claimBasis: 'INFERRED' });
      expect(p.recordedByActorKey).toBe(REGISTRY_WRITER_ACTOR_KEY);
      expect(
        [p.sourceUrl, p.sourcePageEvidenceId, p.sourceWebsiteClaimId].filter(Boolean),
      ).toHaveLength(1);
    }
  });

  it('builds exactly the B2.1 claim shape, which the validator accepts', () => {
    const claim = identityClaimRecord(
      uid(10),
      uid(1),
      { claimKind: 'PUBLIC_WEBSITE', websiteUrl: 'https://club.synthetic-b22.example/' },
      {
        source: {
          sourceType: 'PUBLIC_URL',
          url: 'https://club.synthetic-b22.example/',
          versionRef: null,
        },
        observedAt: OBSERVED,
        claimBasis: 'SOURCE_STATED',
      },
    );
    const v = validateIdentityGraph(
      graph({ subjects: [subject(1)], identityClaims: [nameClaim(11, 1, 'Club'), claim] }),
    );
    expect(v.structurallyValid).toBe(true);
  });
});

describe('B2.2 trusted reviewer: no production constructor, no forgery', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts only a value the class minted', () => {
    const real = TrustedReviewerContext.testSeam('synthetic-reviewer');
    expect(TrustedReviewerContext.isContext(real)).toBe(true);
    const forgeries: unknown[] = [
      { actorKey: 'owner' },
      { ...real },
      Object.create(TrustedReviewerContext.prototype),
      JSON.parse(JSON.stringify(real)),
      'owner',
      null,
    ];
    for (const forged of forgeries) expect(TrustedReviewerContext.isContext(forged)).toBe(false);
  });

  it('refuses to mint outside vitest, naming the missing trust primitive', () => {
    vi.stubEnv('VITEST', '');
    expect(() => TrustedReviewerContext.testSeam('synthetic-reviewer')).toThrow(
      REVIEWER_TRUST_PRIMITIVE_ABSENT,
    );
  });

  it('refuses a malformed actor key even in tests', () => {
    expect(() => TrustedReviewerContext.testSeam('Owner Name')).toThrow();
  });
});

describe('B2.2 CLI: narrow, dry-run by default, review execution refused', () => {
  function harness(trust?: ReviewTrustSet) {
    const calls: string[] = [];
    const out: string[] = [];
    const err: string[] = [];
    const refusingPool = (name: string) => () => {
      calls.push(name);
      throw new Error(`test: ${name} pool must not be used here`);
    };
    return {
      calls,
      out,
      err,
      deps: {
        readonlyPool: refusingPool('readonly') as () => pg.Pool,
        writerPool: refusingPool('writer') as () => pg.Pool,
        ...(trust !== undefined ? { trust } : {}),
        out: (t: string) => void out.push(t),
        err: (t: string) => void err.push(t),
      },
    };
  }

  const source = [
    '--source-url',
    'https://synthetic-b22.example/club',
    '--observed-at',
    OBSERVED,
    '--basis',
    'SOURCE_STATED',
  ];

  it('refuses review --execute before touching any database', async () => {
    const args = [
      'review',
      '--subject',
      uid(1),
      '--outcome',
      'CONFIRMED',
      '--expect-head',
      'none',
      '--expect-state',
      'a'.repeat(64),
      '--execute',
      '--json',
    ];
    // With no OWNER key (a keyless set through the test seam): the trust primitive is absent.
    const h = harness(ReviewTrustSet.ephemeralForVitest([]));
    const code = await runDiscoverySubjects(args, h.deps);
    expect(code).toBe(1);
    expect(h.calls).toEqual([]);
    expect(JSON.parse(h.out.join(''))).toMatchObject({
      outcome: 'REFUSED',
      code: REVIEWER_TRUST_PRIMITIVE_ABSENT,
    });
    // Under the operational set (R2-P1: one OWNER key), an unsigned execution is still
    // refused before any pool: its flags belong inside a signed envelope.
    const op = harness();
    expect(await runDiscoverySubjects(args, op.deps)).toBe(1);
    expect(op.calls).toEqual([]);
    expect(JSON.parse(op.out.join(''))).toMatchObject({
      outcome: 'REFUSED',
      code: 'INPUT_INVALID',
    });
  });

  it.each([
    [['review', '--actor-key', 'owner', '--subject', uid(1)]],
    [['propose', '--subject-id', uid(1), '--actor-key', 'owner']],
    [['propose', '--subject-id', uid(1), '--email', 'x']],
    [['claim', '--subject-id', uid(1), '--sql', 'DELETE']],
    [['show', '--subject-id', uid(1), '--execute']],
    [['list', '--all']],
    [['propose', 'positional']],
  ])('refuses an option or positional outside the subcommand schema: %j', async (argv) => {
    const h = harness();
    expect(await runDiscoverySubjects(argv, h.deps)).toBe(1);
    expect(h.calls).toEqual([]);
  });

  it('refuses an unknown subcommand and an out-of-range page size', async () => {
    const h = harness();
    expect(await runDiscoverySubjects(['merge'], h.deps)).toBe(1);
    expect(await runDiscoverySubjects(['import', '--file', 'x.csv'], h.deps)).toBe(1);
    expect(await runDiscoverySubjects(['list', '--limit', '101'], h.deps)).toBe(1);
    expect(await runDiscoverySubjects(['list', '--limit', '0'], h.deps)).toBe(1);
    expect(h.calls).toEqual([]);
  });

  it('without --execute a write command reaches the READONLY pool only', async () => {
    for (const argv of [
      [
        'propose',
        '--subject-id',
        uid(1),
        '--kind',
        'UNCERTAIN',
        '--name',
        'Synthetic Club',
        ...source,
      ],
      [
        'claim',
        '--subject-id',
        uid(1),
        '--claim-kind',
        'ENTITY_KIND',
        '--entity-kind',
        'UNCERTAIN',
        ...source,
      ],
      [
        'relate',
        '--subject-id',
        uid(1),
        '--predicate',
        'AFFILIATED_WITH',
        '--target-eche-row-key',
        ECHE_ALPHA,
        ...source,
      ],
    ]) {
      const h = harness();
      expect(await runDiscoverySubjects(argv, h.deps)).toBe(1);
      expect(h.calls).toEqual(['readonly']);
    }
  });

  it('with --execute a write command reaches the WRITER pool only', async () => {
    const h = harness();
    await runDiscoverySubjects(
      [
        'propose',
        '--subject-id',
        uid(1),
        '--kind',
        'UNCERTAIN',
        '--name',
        'Synthetic Club',
        ...source,
        '--execute',
      ],
      h.deps,
    );
    expect(h.calls).toEqual(['writer']);
  });

  it('requires exactly one source, an observation instant and a matching payload', async () => {
    for (const argv of [
      [
        'propose',
        '--subject-id',
        uid(1),
        '--kind',
        'UNCERTAIN',
        '--name',
        'N',
        '--observed-at',
        OBSERVED,
        '--basis',
        'INFERRED',
      ],
      [
        'propose',
        '--subject-id',
        uid(1),
        '--kind',
        'UNCERTAIN',
        '--name',
        'N',
        ...source,
        '--source-page-evidence-id',
        uid(5),
      ],
      [
        'propose',
        '--subject-id',
        uid(1),
        '--kind',
        'UNCERTAIN',
        '--name',
        'N',
        '--source-url',
        'https://a.example/',
        '--basis',
        'INFERRED',
      ],
      [
        'claim',
        '--subject-id',
        uid(1),
        '--claim-kind',
        'ENTITY_KIND',
        '--entity-kind',
        'UNCERTAIN',
        '--website-url',
        'https://a.example/',
        ...source,
      ],
      ['claim', '--subject-id', uid(1), '--claim-kind', 'CONTACT', ...source],
      [
        'relate',
        '--subject-id',
        uid(1),
        '--predicate',
        'PARENT',
        '--target-subject-id',
        uid(2),
        ...source,
      ],
      ['relate', '--subject-id', uid(1), '--predicate', 'PART_OF', ...source],
    ]) {
      const h = harness();
      expect(await runDiscoverySubjects(argv, h.deps), argv.join(' ')).toBe(1);
      expect(h.calls, argv.join(' ')).toEqual([]);
    }
  });

  /** A readonly pool that records every statement and answers only the database clock. */
  function recordingPool(statements: string[]): () => pg.Pool {
    return () =>
      ({
        connect: async () => ({
          query: async (text: string) => {
            statements.push(text);
            return { rows: /clock_timestamp/.test(text) ? [{ now: AS_OF }] : [] };
          },
          release: () => undefined,
        }),
        end: async () => undefined,
      }) as unknown as pg.Pool;
  }

  const CANONICAL_SHAPED = ['cand:', 'chn:', 'opp:'].map((prefix) => `${prefix}${uid(1)}`);

  it('B2.2-C: refuses canonical-shaped ids on the read paths before any connection', async () => {
    for (const id of [...CANONICAL_SHAPED, uid(0xabc).toUpperCase()]) {
      for (const argv of [
        ['show', '--subject-id', id],
        ['list', '--after', id],
      ]) {
        const h = harness();
        expect(await runDiscoverySubjects(argv, h.deps), argv.join(' ')).toBe(1);
        expect(h.calls, argv.join(' ')).toEqual([]);
      }
    }
  });

  it('B2.2-C: refuses a canonical-shaped subject or target id before any registry read', async () => {
    for (const id of CANONICAL_SHAPED) {
      for (const argv of [
        ['propose', '--subject-id', id, '--kind', 'UNCERTAIN', '--name', 'Synthetic Club'],
        ['claim', '--subject-id', id, '--claim-kind', 'ENTITY_KIND', '--entity-kind', 'UNCERTAIN'],
        ['relate', '--subject-id', id, '--predicate', 'AFFILIATED_WITH'],
        ['relate', '--subject-id', uid(1), '--predicate', 'AFFILIATED_WITH'],
      ]) {
        const statements: string[] = [];
        const out: string[] = [];
        const target =
          argv[0] === 'relate' ? ['--target-subject-id', argv[2] === uid(1) ? id : uid(2)] : [];
        const code = await runDiscoverySubjects([...argv, ...target, ...source, '--json'], {
          readonlyPool: recordingPool(statements),
          writerPool: () => {
            throw new Error('test: writer pool must not be used for a dry run');
          },
          out: (t) => void out.push(t),
          err: () => undefined,
        });
        expect(code, argv.join(' ')).toBe(1);
        expect(JSON.parse(out.join('')), argv.join(' ')).toMatchObject({
          outcome: 'REFUSED',
          code: 'INPUT_INVALID',
        });
        expect(
          statements.filter((q) => /discovery_|INSERT|organisations/i.test(q)),
          argv.join(' '),
        ).toEqual([]);
      }
    }
  });

  it.each(['SAME_ACTOR', 'SAME_AS', 'EQUIVALENT_TO', 'MERGED_INTO', 'DUPLICATE_OF', 'SPLIT_FROM'])(
    'B2.2-C: refuses the equivalence predicate %s before any connection',
    async (predicate) => {
      const h = harness();
      const argv = [
        'relate',
        '--subject-id',
        uid(1),
        '--predicate',
        predicate,
        '--target-subject-id',
        uid(2),
        ...source,
      ];
      expect(await runDiscoverySubjects(argv, h.deps)).toBe(1);
      expect(await runDiscoverySubjects([...argv, '--execute'], h.deps)).toBe(1);
      expect(h.calls).toEqual([]);
    },
  );

  it('B2.2-C: offers no merge, split, link, handoff or canonical registration command', async () => {
    const h = harness();
    for (const sub of ['merge', 'split', 'link', 'handoff', 'register', 'promote', 'resolve']) {
      expect(await runDiscoverySubjects([sub, '--subject-id', uid(1)], h.deps), sub).toBe(1);
    }
    expect(h.calls).toEqual([]);
  });

  it('never prints a connection string', async () => {
    const h = harness();
    await runDiscoverySubjects(['show', '--subject-id', 'postgres://user:secret@host/db'], h.deps);
    expect([...h.out, ...h.err].join('')).not.toContain('secret');
  });
});

describe('B2.2-C canonical identity boundary: provisional subjects, never a canonical issuer', () => {
  const WEBSITE_PROVENANCE = {
    source: {
      sourceType: 'PUBLIC_URL',
      url: 'https://synthetic-b22c.example/about',
      versionRef: null,
    },
    observedAt: OBSERVED,
    claimBasis: 'SOURCE_STATED',
  } as const;

  /** Two subjects, one shared EU_PIC, a public website on the first, a subject-level CONFIRMED review. */
  function sharedIdentifierGraph(focalN: number): SubjectGraph {
    return focal(focalN, {
      subjects: [subject(1), subject(2)],
      identityClaims: [
        nameClaim(10, 1, 'Synthetic Student Society'),
        nameClaim(20, 2, 'Synthetic Student Society', { src: 'other-page' }),
        identifierClaim(11, 1, 'EU_PIC', '999999991'),
        identifierClaim(21, 2, 'EU_PIC', '999999991'),
        identityClaimRecord(
          uid(12),
          uid(1),
          { claimKind: 'PUBLIC_WEBSITE', websiteUrl: 'https://synthetic-b22c.example/' },
          WEBSITE_PROVENANCE,
        ),
      ],
      reviews: [review(30, { subject: 1 }, 'CONFIRMED')],
    });
  }

  function keysAndStrings(value: unknown, keys: string[] = [], strings: string[] = []) {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) for (const v of value) keysAndStrings(v, keys, strings);
    else if (typeof value === 'object' && value !== null) {
      for (const [k, v] of Object.entries(value)) {
        keys.push(k);
        keysAndStrings(v, keys, strings);
      }
    }
    return { keys, strings };
  }

  it('the writer capability is named for the discovery-subject registry only', () => {
    expect(REGISTRY_WRITER_ROLE).toBe('nwf_discovery_subject_writer');
    expect(REGISTRY_WRITER_ROLE).not.toMatch(/^nwf_identity/);
  });

  it('a shared identifier keeps two subjects apart, as a review signal only', () => {
    const one = deriveSubjectReadModel(sharedIdentifierGraph(1));
    const two = deriveSubjectReadModel(sharedIdentifierGraph(2));
    expect([one.subjectId, two.subjectId]).toEqual([uid(1), uid(2)]);
    for (const m of [one, two]) {
      expect(m.findings.reviewSignals.map((f) => f.code)).toContain('SHARED_EXTERNAL_IDENTIFIER');
      for (const bucket of [m.findings.invalid, m.findings.conflicts, m.findings.unresolved]) {
        expect(bucket.map((f) => f.code)).not.toContain('SHARED_EXTERNAL_IDENTIFIER');
      }
      expect(m.identifiers.map((c) => c.review)).toEqual(['UNREVIEWED']);
      expect(m.researchAuthority).toMatchObject({ granted: false, status: 'NOT_GRANTED' });
    }
    // The unreviewed shared identifier is not promoted into the other subject's identity.
    expect(two.identityStatus.identityReview).toBe('UNREVIEWED');
    expect(two.identityStatus.reviewConfirmed).toBe(false);
    expect(one.stateDigest).not.toBe(two.stateDigest);
  });

  it('a public website claim is unreviewed evidence, not a verified or owned channel', () => {
    const m = deriveSubjectReadModel(sharedIdentifierGraph(1));
    expect(m.websites).toHaveLength(1);
    expect(m.websites[0]!.review).toBe('UNREVIEWED');
    expect(Object.keys(m.websites[0]!).sort()).toEqual(
      [
        'claimId',
        'claimKind',
        // B2.3-R2: the head as attested authority sees it - still no verified, owned or channel field.
        'effectiveReview',
        'nameLanguage',
        'provenance',
        'recordedAt',
        'review',
        'reviewHeadId',
        'value',
      ].sort(),
    );
    expect(m.identityStatus.factualVerification).toBe('NOT_ESTABLISHED_BY_THIS_LAYER');
  });

  it('even a review-confirmed subject carries no canonical reference and no research authority', () => {
    for (const n of [1, 2]) {
      const m = deriveSubjectReadModel(sharedIdentifierGraph(n));
      const { keys, strings } = keysAndStrings(m);
      for (const key of keys) {
        expect(key).not.toMatch(
          /canonical|candidate|channel|opportunit|sameActor|merged|equivalen|verified|owner|operat|split/i,
        );
      }
      for (const text of strings) expect(text).not.toMatch(/^(cand|chn|opp):/);
      expect(m.researchAuthority.granted).toBe(false);
    }
  });
});

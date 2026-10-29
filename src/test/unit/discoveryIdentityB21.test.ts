/**
 * Track B, B2.1 - the pure discovery-subject identity validator and the
 * protected structural-parent constraint, over SYNTHETIC records only.
 *
 * These tests show the model can REPRESENT useful micro-organisations and
 * keeps claims, reviews and research authority apart. They verify no
 * real-world organisation.
 */
import { describe, expect, it } from 'vitest';

import {
  isAdmissibleFreeText,
  isAdmissibleName,
  isAdmissiblePublicUrl,
} from '../../orgunits/identity/admissibility.js';
import { evaluateStructuralParentConstraint } from '../../orgunits/identity/structuralParent.js';
import {
  validateIdentityGraph,
  type IdentityFindingCode,
  type IdentityValidationResult,
} from '../../orgunits/identity/validate.js';
import type { IdentityGraphInput } from '../../orgunits/identity/vocabulary.js';
import {
  ECHE_ALPHA,
  ECHE_BETA,
  ECHE_GAMMA,
  ECHE_PROTECTED,
  TEXT_SAMPLES,
  URL_SAMPLES,
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

function codes(result: IdentityValidationResult, severity?: string): IdentityFindingCode[] {
  return result.findings
    .filter((f) => severity === undefined || f.severity === severity)
    .map((f) => f.code);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** A club PART_OF a faculty PART_OF an ECHE row, every edge CONFIRMED. */
function clubInFacultyInInstitution(eche: string): IdentityGraphInput {
  return graph({
    subjects: [subject(1, 'INTERNAL_STUDENT_GROUP'), subject(2, 'FACULTY_SCHOOL_DEPARTMENT')],
    identityClaims: [
      nameClaim(11, 1, 'Synthetic Faculty Club'),
      nameClaim(12, 2, 'Synthetic Faculty of Languages'),
    ],
    relationshipClaims: [
      relation(21, 1, 'PART_OF', { subject: 2 }),
      relation(22, 2, 'PART_OF', { eche }),
    ],
    reviews: [
      review(31, { relationshipClaim: 21 }, 'CONFIRMED'),
      review(32, { relationshipClaim: 22 }, 'CONFIRMED'),
    ],
  });
}

describe('B2.1 admissibility predicates (mirrored by migration 0013)', () => {
  it.each(URL_SAMPLES)('public URL $url -> $expected', ({ url, expected }) => {
    expect(isAdmissiblePublicUrl(url)).toBe(expected);
  });

  it.each(TEXT_SAMPLES)('free text %# -> $expected', ({ text, expected }) => {
    expect(isAdmissibleFreeText(text)).toBe(expected);
  });

  it('bounds names to 1-300 code points with no edge spaces', () => {
    expect(isAdmissibleName('')).toBe(false);
    expect(isAdmissibleName(' Leading')).toBe(false);
    expect(isAdmissibleName('Trailing ')).toBe(false);
    expect(isAdmissibleName('é'.repeat(300))).toBe(true);
    expect(isAdmissibleName('é'.repeat(301))).toBe(false);
  });
});

describe('B2.1 representable micro-organisations (cases 1-9)', () => {
  it('1. a standalone independent community: no parent, no relationship, still a valid subject', () => {
    const input = graph({
      subjects: [subject(1, 'INDEPENDENT_COMMUNITY')],
      identityClaims: [nameClaim(11, 1, 'Synthetic Tandem Community')],
    });
    const result = validateIdentityGraph(input);
    expect(result.structurallyValid).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.subjects[0]).toMatchObject({
      identityReview: 'UNREVIEWED',
      factualVerification: 'NOT_ESTABLISHED_BY_THIS_LAYER',
      nameClaimCount: 1,
    });
    expect(evaluateStructuralParentConstraint(input, uid(1), [ECHE_PROTECTED]).constraint).toBe(
      'NO_KNOWN_STRUCTURAL_PARENT_BLOCK',
    );
  });

  it('2-3. an internal club within a faculty within an ECHE institution', () => {
    const result = validateIdentityGraph(clubInFacultyInInstitution(ECHE_ALPHA));
    expect(result.structurallyValid).toBe(true);
    expect(codes(result, 'CONFLICT')).toEqual([]);
    expect(result.relationships.map((r) => [r.predicate, r.targetKey, r.review])).toEqual([
      ['PART_OF', `subject:${uid(2)}`, 'CONFIRMED'],
      ['PART_OF', `eche:${ECHE_ALPHA}`, 'CONFIRMED'],
    ]);
  });

  it('4. a local network chapter with a network and two university affiliations', () => {
    const result = validateIdentityGraph(
      graph({
        subjects: [subject(1, 'NETWORK_LOCAL_CHAPTER'), subject(2, 'ORGANISATION_NETWORK')],
        identityClaims: [
          nameClaim(11, 1, 'Synthetic Network Section City'),
          nameClaim(12, 2, 'Synthetic Student Network'),
        ],
        relationshipClaims: [
          relation(21, 1, 'LOCAL_CHAPTER_OF', { subject: 2 }),
          relation(22, 1, 'AFFILIATED_WITH', { eche: ECHE_ALPHA }),
          relation(23, 1, 'AFFILIATED_WITH', { eche: ECHE_BETA }),
        ],
      }),
    );
    expect(result.structurallyValid).toBe(true);
    expect(codes(result, 'CONFLICT')).toEqual([]);
    expect(result.relationships).toHaveLength(3);
    expect(result.relationships.every((r) => r.review === 'UNREVIEWED')).toBe(true);
  });

  it('5. an association operating at several universities has no structural parent conflict', () => {
    const result = validateIdentityGraph(
      graph({
        subjects: [subject(1, 'INDEPENDENT_STUDENT_ASSOCIATION')],
        identityClaims: [nameClaim(11, 1, 'Synthetic Intercampus Association')],
        relationshipClaims: [
          relation(21, 1, 'OPERATES_AT', { eche: ECHE_ALPHA }),
          relation(22, 1, 'OPERATES_AT', { eche: ECHE_BETA }),
          relation(23, 1, 'SERVES_AUDIENCE_AT', { eche: ECHE_GAMMA }),
        ],
      }),
    );
    expect(result.structurallyValid).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('6. identical names on two campuses stay two subjects, with no finding at all', () => {
    const result = validateIdentityGraph(
      graph({
        subjects: [subject(1, 'INTERNAL_STUDENT_GROUP'), subject(2, 'INTERNAL_STUDENT_GROUP')],
        identityClaims: [
          nameClaim(11, 1, 'Synthetic Buddy Programme', { src: 'campus-north' }),
          nameClaim(12, 2, 'Synthetic Buddy Programme', { src: 'campus-south' }),
        ],
        relationshipClaims: [
          relation(21, 1, 'PART_OF', { eche: ECHE_ALPHA }),
          relation(22, 2, 'PART_OF', { eche: ECHE_BETA }),
        ],
      }),
    );
    expect(result.structurallyValid).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.subjects.map((s) => s.subjectId)).toEqual([uid(1), uid(2)]);
  });

  it('7. one subject with a name, an alternate name and a native-language name', () => {
    const result = validateIdentityGraph(
      graph({
        subjects: [subject(1, 'INDEPENDENT_STUDENT_ASSOCIATION')],
        identityClaims: [
          nameClaim(11, 1, 'Synthetic Language Exchange'),
          nameClaim(12, 1, 'SLE', { kind: 'ALTERNATE_NAME' }),
          nameClaim(13, 1, 'Échange Linguistique Synthétique', {
            kind: 'NATIVE_NAME',
            language: 'fr',
          }),
        ],
      }),
    );
    expect(result.structurallyValid).toBe(true);
    expect(result.subjects[0]!.nameClaimCount).toBe(3);
  });

  it('8. conflicting kind claims are a CONFLICT, both stay, and no kind is elected', () => {
    const input = graph({
      subjects: [subject(1, 'UNCERTAIN')],
      identityClaims: [
        nameClaim(11, 1, 'Synthetic Debate Society'),
        kindClaim(12, 1, 'INTERNAL_STUDENT_GROUP'),
        kindClaim(13, 1, 'INDEPENDENT_STUDENT_ASSOCIATION'),
      ],
    });
    const result = validateIdentityGraph(input);
    expect(result.structurallyValid).toBe(true);
    expect(codes(result)).toEqual(['ENTITY_KIND_CONFLICT']);
    expect(result.subjects[0]).toMatchObject({
      claimedKinds: ['INDEPENDENT_STUDENT_ASSOCIATION', 'INTERNAL_STUDENT_GROUP'],
      reviewedKind: null,
    });

    const reviewedOne = validateIdentityGraph({
      ...input,
      reviews: [review(31, { identityClaim: 13 }, 'CONFIRMED')],
    });
    expect(reviewedOne.subjects[0]!.reviewedKind).toBe('INDEPENDENT_STUDENT_ASSOCIATION');

    const reviewedBoth = validateIdentityGraph({
      ...input,
      reviews: [
        review(31, { identityClaim: 12 }, 'CONFIRMED'),
        review(32, { identityClaim: 13 }, 'CONFIRMED'),
      ],
    });
    expect(codes(reviewedBoth, 'CONFLICT')).toContain('REVIEWED_ENTITY_KIND_CONFLICT');
    expect(reviewedBoth.subjects[0]!.reviewedKind).toBeNull();
  });

  it('9. two sources supporting one identity are corroboration, not a duplicate', () => {
    const result = validateIdentityGraph(
      graph({
        subjects: [subject(1, 'INDEPENDENT_COMMUNITY')],
        identityClaims: [
          nameClaim(11, 1, 'Synthetic Polyglot Circle', { src: 'source-one' }),
          nameClaim(12, 1, 'Synthetic Polyglot Circle', { src: 'source-two' }),
        ],
      }),
    );
    expect(result.structurallyValid).toBe(true);
    expect(result.subjects[0]!.nameClaimCount).toBe(2);
  });
});

describe('B2.1 refusals and unresolved states (cases 10-16, 22)', () => {
  it('10. a page mistaken for an organisation stays evidence: unreviewed, then REJECTED, never auto-confirmed', () => {
    const base = graph({
      subjects: [subject(1, 'UNCERTAIN')],
      identityClaims: [nameClaim(11, 1, 'Master in Synthetic Studies')],
    });
    const unreviewed = validateIdentityGraph(base);
    expect(unreviewed.subjects[0]!.identityReview).toBe('UNREVIEWED');
    expect(evaluateStructuralParentConstraint(base, uid(1), []).reason).toBe(
      'STRUCTURAL_PARENT_UNKNOWN',
    );

    const rejected = validateIdentityGraph({
      ...base,
      reviews: [
        review(31, { subject: 1 }, 'REJECTED', { reason: 'A programme page, not an organisation' }),
      ],
    });
    expect(rejected.structurallyValid).toBe(true);
    expect(rejected.subjects[0]!.identityReview).toBe('REJECTED');

    // A subject cannot be CONFIRMED on no name claim at all.
    const confirmedEmpty = validateIdentityGraph(
      graph({ subjects: [subject(2)], reviews: [review(32, { subject: 2 }, 'CONFIRMED')] }),
    );
    expect(codes(confirmedEmpty, 'INVALID')).toEqual(['SUBJECT_CONFIRMED_WITHOUT_NAME_CLAIM']);
  });

  it('11. the same source asserting the same relationship twice is refused', () => {
    const duplicate = validateIdentityGraph(
      graph({
        subjects: [subject(1, 'INTERNAL_STUDENT_GROUP')],
        identityClaims: [nameClaim(11, 1, 'Synthetic Choir')],
        relationshipClaims: [
          relation(21, 1, 'PART_OF', { eche: ECHE_ALPHA }, 'same-page'),
          relation(22, 1, 'PART_OF', { eche: ECHE_ALPHA }, 'same-page'),
        ],
      }),
    );
    expect(codes(duplicate, 'INVALID')).toEqual(['DUPLICATE_ASSERTION']);
    expect(duplicate.findings[0]!.recordId).toBe(uid(22));
  });

  it('12. a claim without provenance is refused', () => {
    const missing = validateIdentityGraph(
      graph({
        subjects: [subject(1)],
        identityClaims: [{ ...nameClaim(11, 1, 'Synthetic Group'), sourceUrl: null }],
        relationshipClaims: [
          {
            ...relation(21, 1, 'AFFILIATED_WITH', { eche: ECHE_ALPHA }),
            sourceType: 'PAGE_EVIDENCE',
          },
        ],
      }),
    );
    expect(codes(missing, 'INVALID')).toEqual(['PROVENANCE_MISSING', 'PROVENANCE_MISSING']);
  });

  it('13. an unknown relationship target (subject or ECHE row) is refused', () => {
    const result = validateIdentityGraph(
      graph({
        subjects: [subject(1)],
        relationshipClaims: [
          relation(21, 1, 'AFFILIATED_WITH', { subject: 99 }),
          relation(22, 1, 'AFFILIATED_WITH', { eche: 'T B21 UNKNOWN01|300000099' }),
          { ...relation(23, 1, 'AFFILIATED_WITH', { eche: ECHE_ALPHA }), targetSubjectId: uid(1) },
        ],
      }),
    );
    expect(codes(result, 'INVALID')).toEqual([
      'RELATIONSHIP_TARGET_INVALID',
      'RELATIONSHIP_TARGET_UNKNOWN',
      'RELATIONSHIP_TARGET_UNKNOWN',
    ]);
  });

  it('14. a self-referential relationship is refused', () => {
    const result = validateIdentityGraph(
      graph({
        subjects: [subject(1)],
        relationshipClaims: [relation(21, 1, 'PART_OF', { subject: 1 })],
      }),
    );
    expect(codes(result, 'INVALID')).toEqual(['RELATIONSHIP_SELF_LINK']);
  });

  it('15. a claimed PART_OF cycle is a CONFLICT; a CONFIRMED one is INVALID; the evaluator is UNRESOLVED', () => {
    const claimed = graph({
      subjects: [subject(1, 'FACULTY_SCHOOL_DEPARTMENT'), subject(2, 'FACULTY_SCHOOL_DEPARTMENT')],
      identityClaims: [nameClaim(11, 1, 'Synthetic Unit A'), nameClaim(12, 2, 'Synthetic Unit B')],
      relationshipClaims: [
        relation(21, 1, 'PART_OF', { subject: 2 }),
        relation(22, 2, 'PART_OF', { subject: 1 }),
      ],
    });
    const claimedResult = validateIdentityGraph(claimed);
    expect(claimedResult.structurallyValid).toBe(true);
    expect(codes(claimedResult, 'CONFLICT')).toEqual([
      'STRUCTURAL_CYCLE_CLAIMED',
      'STRUCTURAL_CYCLE_CLAIMED',
    ]);
    expect(evaluateStructuralParentConstraint(claimed, uid(1), []).reason).toBe('STRUCTURAL_CYCLE');

    const confirmed = validateIdentityGraph({
      ...claimed,
      reviews: [
        review(31, { relationshipClaim: 21 }, 'CONFIRMED'),
        review(32, { relationshipClaim: 22 }, 'CONFIRMED'),
      ],
    });
    expect(confirmed.structurallyValid).toBe(false);
    expect(codes(confirmed, 'INVALID')).toEqual([
      'CONFIRMED_STRUCTURAL_CYCLE',
      'CONFIRMED_STRUCTURAL_CYCLE',
    ]);
  });

  it('two structural parents on different chains are a CONFLICT; a parent and its own ancestor are not', () => {
    const conflicting = validateIdentityGraph(
      graph({
        subjects: [subject(1, 'INTERNAL_STUDENT_GROUP')],
        identityClaims: [nameClaim(11, 1, 'Synthetic Robotics Club')],
        relationshipClaims: [
          relation(21, 1, 'PART_OF', { eche: ECHE_ALPHA }),
          relation(22, 1, 'PART_OF', { eche: ECHE_BETA }),
        ],
      }),
    );
    expect(codes(conflicting, 'CONFLICT')).toEqual(['STRUCTURAL_PARENT_CONFLICT']);

    const consistent = validateIdentityGraph({
      ...clubInFacultyInInstitution(ECHE_ALPHA),
      relationshipClaims: [
        ...clubInFacultyInInstitution(ECHE_ALPHA).relationshipClaims,
        relation(23, 1, 'PART_OF', { eche: ECHE_ALPHA }),
      ],
    });
    expect(codes(consistent, 'CONFLICT')).toEqual([]);
  });

  it('an independent kind with a structural parent is a REVIEW_SIGNAL, not a verdict', () => {
    const result = validateIdentityGraph(
      graph({
        subjects: [subject(1, 'INDEPENDENT_STUDENT_ASSOCIATION')],
        identityClaims: [nameClaim(11, 1, 'Synthetic Association')],
        relationshipClaims: [relation(21, 1, 'PART_OF', { eche: ECHE_ALPHA })],
      }),
    );
    expect(result.structurallyValid).toBe(true);
    expect(codes(result)).toEqual(['SELF_STANDING_KIND_WITH_STRUCTURAL_PARENT']);
  });

  it('16. review history is append-only: superseded, withdrawn and re-decided, derived from the head', () => {
    const base = graph({
      subjects: [subject(1, 'INDEPENDENT_COMMUNITY')],
      identityClaims: [nameClaim(11, 1, 'Synthetic Reading Circle')],
    });
    const history = [
      review(31, { subject: 1 }, 'CONFIRMED', { at: '2026-10-02T10:00:00.000Z' }),
      review(32, { subject: 1 }, 'DISPUTED', { supersedes: 31, at: '2026-10-03T10:00:00.000Z' }),
      review(33, { subject: 1 }, 'WITHDRAWN', { supersedes: 32, at: '2026-10-04T10:00:00.000Z' }),
    ];
    const state = (reviews: typeof history) =>
      validateIdentityGraph({ ...base, reviews }).subjects[0]!.identityReview;
    expect(state(history.slice(0, 1))).toBe('CONFIRMED');
    expect(state(history.slice(0, 2))).toBe('DISPUTED');
    expect(state(history)).toBe('UNREVIEWED');
    expect(
      state([
        ...history,
        review(34, { subject: 1 }, 'CONFIRMED', { supersedes: 33, at: '2026-10-05T10:00:00.000Z' }),
      ]),
    ).toBe('CONFIRMED');
    // Order of the input does not change the derived head.
    expect(state([...history].reverse())).toBe('UNREVIEWED');
  });

  it('16b. a malformed review chain is INVALID and reads as CHAIN_INVALID, never as a verdict', () => {
    const base = graph({
      subjects: [subject(1), subject(2)],
      identityClaims: [nameClaim(11, 1, 'Synthetic A'), nameClaim(12, 2, 'Synthetic B')],
    });
    const cases: [string, IdentityGraphInput['reviews']][] = [
      [
        'two roots',
        [review(31, { subject: 1 }, 'CONFIRMED'), review(32, { subject: 1 }, 'REJECTED')],
      ],
      [
        'two successors',
        [
          review(31, { subject: 1 }, 'CONFIRMED'),
          review(32, { subject: 1 }, 'DISPUTED', { supersedes: 31 }),
          review(33, { subject: 1 }, 'REJECTED', { supersedes: 31 }),
        ],
      ],
      [
        'supersedes another target',
        [
          review(31, { subject: 2 }, 'CONFIRMED'),
          review(32, { subject: 1 }, 'CONFIRMED'),
          review(33, { subject: 1 }, 'REJECTED', { supersedes: 31 }),
        ],
      ],
      ['withdrawal of nothing', [review(31, { subject: 1 }, 'WITHDRAWN')]],
      [
        'backwards in time',
        [
          review(31, { subject: 1 }, 'CONFIRMED', { at: '2026-10-05T10:00:00.000Z' }),
          review(32, { subject: 1 }, 'REJECTED', {
            supersedes: 31,
            at: '2026-10-04T10:00:00.000Z',
          }),
        ],
      ],
    ];
    for (const [label, reviews] of cases) {
      const result = validateIdentityGraph({ ...base, reviews });
      expect(result.structurallyValid, label).toBe(false);
      expect(codes(result, 'INVALID'), label).toContain('REVIEW_CHAIN_INVALID');
      expect(result.subjects[0]!.identityReview, label).not.toBe('CONFIRMED');
    }
  });

  it('22. a source or website URL carrying credentials, tokens, a mailbox shape or a social host is refused', () => {
    const bad = [
      'https://user:secret@synthetic-b21.example/',
      'https://synthetic-b21.example/page?session=abc',
      'https://synthetic-b21.example/@someone',
      'https://www.instagram.com/synthetic_b21',
      'https://synthetic-b21.example:8080/',
    ];
    for (const url of bad) {
      const result = validateIdentityGraph(
        graph({
          subjects: [subject(1)],
          identityClaims: [
            { ...nameClaim(11, 1, 'Synthetic Group'), sourceUrl: url },
            {
              ...nameClaim(12, 1, 'x'),
              claimKind: 'PUBLIC_WEBSITE',
              nameText: null,
              websiteUrl: url,
            },
          ],
        }),
      );
      expect(codes(result, 'INVALID'), url).toEqual([
        'SOURCE_URL_INADMISSIBLE',
        'WEBSITE_URL_INADMISSIBLE',
      ]);
    }
  });

  it('22b. mailbox- or telephone-shaped names, notes and reasons, and unknown fields, are refused', () => {
    const result = validateIdentityGraph(
      graph({
        subjects: [
          { ...subject(1), registrationNote: 'reach them at someone@synthetic-b21.example' },
          { ...subject(2), contactAddress: 'anything', parentId: uid(1) } as never,
        ],
        identityClaims: [
          nameClaim(11, 1, 'someone@synthetic-b21.example'),
          nameClaim(12, 2, 'Call 06 12 34 56 78'),
        ],
        reviews: [review(31, { subject: 1 }, 'DISPUTED', { reason: 'Ring +33 1 23 45 67 89' })],
      }),
    );
    expect(codes(result, 'INVALID')).toEqual([
      'NAME_INADMISSIBLE',
      'NAME_INADMISSIBLE',
      'NOTE_INADMISSIBLE',
      'NOTE_INADMISSIBLE',
      'PROHIBITED_FIELD',
      'PROHIBITED_FIELD',
    ]);
    expect(
      result.findings.filter((f) => f.code === 'PROHIBITED_FIELD').map((f) => f.field),
    ).toEqual(['contactAddress', 'parentId']);
  });

  it('refuses unknown vocabulary, malformed ids, malformed identifiers and future timestamps', () => {
    const result = validateIdentityGraph(
      graph({
        subjects: [{ ...subject(1), registeredKind: 'UNIVERSITY' as never }],
        identityClaims: [
          { ...identifierClaim(11, 1, 'NL_KVK', '1234'), observedAt: '2027-01-01T00:00:00.000Z' },
          { ...identifierClaim(12, 1, 'EU_PIC', '300000001'), identifierScheme: 'VAT' as never },
        ],
        relationshipClaims: [
          {
            ...relation(21, 1, 'AFFILIATED_WITH', { eche: ECHE_ALPHA }),
            predicate: 'OWNS' as never,
          },
          { ...relation(22, 1, 'LOCAL_CHAPTER_OF', { eche: ECHE_ALPHA }) },
          { ...relation(23, 1, 'HOSTED_BY', { eche: ECHE_BETA }), id: 'not-a-uuid' },
        ],
      }),
    );
    expect(codes(result, 'INVALID')).toEqual([
      'ENTITY_KIND_UNKNOWN',
      'IDENTIFIER_SCHEME_UNKNOWN',
      'IDENTIFIER_SHAPE_INVALID',
      'LOCAL_CHAPTER_TARGET_NOT_SUBJECT',
      'PREDICATE_UNKNOWN',
      'RECORD_ID_INVALID',
      'TIMESTAMP_AFTER_AS_OF',
    ]);
  });

  it('a shared typed identifier across two subjects is a REVIEW_SIGNAL and never merges them', () => {
    const result = validateIdentityGraph(
      graph({
        subjects: [subject(1, 'INDEPENDENT_STUDENT_ASSOCIATION'), subject(2, 'UNCERTAIN')],
        identityClaims: [
          nameClaim(11, 1, 'Synthetic Exchange Club'),
          nameClaim(12, 2, 'Synthetic Exchange Club Alumni'),
          identifierClaim(13, 1, 'FR_RNA', 'W000000021'),
          identifierClaim(14, 2, 'FR_RNA', 'W000000021'),
        ],
      }),
    );
    expect(result.structurallyValid).toBe(true);
    expect(codes(result)).toEqual(['SHARED_EXTERNAL_IDENTIFIER', 'SHARED_EXTERNAL_IDENTIFIER']);
    expect(result.subjects).toHaveLength(2);
  });

  it('a relationship to an unreviewed subject rests on an UNRESOLVED identity', () => {
    const result = validateIdentityGraph(clubInFacultyInInstitution(ECHE_ALPHA));
    expect(codes(result, 'UNRESOLVED')).toEqual(['RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED']);
    const confirmedTarget = validateIdentityGraph({
      ...clubInFacultyInInstitution(ECHE_ALPHA),
      reviews: [
        ...clubInFacultyInInstitution(ECHE_ALPHA).reviews,
        review(33, { subject: 2 }, 'CONFIRMED'),
      ],
    });
    expect(codes(confirmedTarget, 'UNRESOLVED')).toEqual([]);
  });
});

describe('B2.1 protected structural parent (cases 19-21)', () => {
  it('19. a CONFIRMED PART_OF chain to a protected row blocks the faculty and its club', () => {
    const input = clubInFacultyInInstitution(ECHE_PROTECTED);
    for (const n of [1, 2]) {
      const constraint = evaluateStructuralParentConstraint(input, uid(n), [ECHE_PROTECTED]);
      expect(constraint).toEqual({
        ruleVersion: 'discovery-identity-rules-v1',
        subjectId: uid(n),
        constraint: 'RESEARCH_BLOCKING',
        reason: 'PROTECTED_STRUCTURAL_PARENT',
        grantsResearchAuthority: false,
      });
    }
  });

  it('19b. the block names the parent, never cohort membership, and the same graph is clear when nothing is protected', () => {
    const input = clubInFacultyInInstitution(ECHE_PROTECTED);
    const blocked = JSON.stringify(
      evaluateStructuralParentConstraint(input, uid(1), [ECHE_PROTECTED]),
    );
    expect(blocked).not.toMatch(/COHORT|HOLDOUT|DEV_TRAIN|member/i);
    expect(blocked).not.toContain(ECHE_PROTECTED);
    expect(evaluateStructuralParentConstraint(input, uid(1), []).constraint).toBe(
      'NO_KNOWN_STRUCTURAL_PARENT_BLOCK',
    );
  });

  it('20. mere affiliation, operation, hosting, audience or chapterhood at a protected row never blocks', () => {
    const input = graph({
      subjects: [subject(1, 'INDEPENDENT_STUDENT_ASSOCIATION')],
      identityClaims: [nameClaim(11, 1, 'Synthetic Exchange Association')],
      relationshipClaims: [
        relation(21, 1, 'AFFILIATED_WITH', { eche: ECHE_PROTECTED }),
        relation(22, 1, 'OPERATES_AT', { eche: ECHE_PROTECTED }),
        relation(23, 1, 'HOSTED_BY', { eche: ECHE_PROTECTED }),
        relation(24, 1, 'SERVES_AUDIENCE_AT', { eche: ECHE_PROTECTED }),
      ],
      reviews: [21, 22, 23, 24].map((n) => review(n + 10, { relationshipClaim: n }, 'CONFIRMED')),
    });
    const constraint = evaluateStructuralParentConstraint(input, uid(1), [ECHE_PROTECTED]);
    expect(constraint.constraint).toBe('NO_KNOWN_STRUCTURAL_PARENT_BLOCK');
    expect(constraint.grantsResearchAuthority).toBe(false);
  });

  it('21. an unreviewed or DISPUTED PART_OF to a protected row is UNRESOLVED; a REJECTED one is not followed', () => {
    const base = graph({
      subjects: [subject(1, 'FACULTY_SCHOOL_DEPARTMENT')],
      identityClaims: [nameClaim(11, 1, 'Synthetic School of Translation')],
      relationshipClaims: [
        relation(21, 1, 'PART_OF', { eche: ECHE_PROTECTED }),
        relation(22, 1, 'PART_OF', { eche: ECHE_ALPHA }),
      ],
    });
    const evaluate = (reviews: IdentityGraphInput['reviews']) =>
      evaluateStructuralParentConstraint({ ...base, reviews }, uid(1), [ECHE_PROTECTED]).reason;

    expect(evaluate([])).toBe('PROTECTED_STRUCTURAL_PARENT_UNCONFIRMED');
    expect(evaluate([review(31, { relationshipClaim: 21 }, 'DISPUTED')])).toBe(
      'PROTECTED_STRUCTURAL_PARENT_UNCONFIRMED',
    );
    expect(evaluate([review(31, { relationshipClaim: 21 }, 'REJECTED')])).toBe(
      'NO_PROTECTED_STRUCTURAL_PARENT_KNOWN',
    );
    expect(evaluate([review(31, { relationshipClaim: 21 }, 'CONFIRMED')])).toBe(
      'PROTECTED_STRUCTURAL_PARENT',
    );
  });

  it('a parent-implying kind with no recorded parent is UNRESOLVED, not clear', () => {
    const input = graph({
      subjects: [subject(1, 'INTERNAL_STUDENT_GROUP'), subject(2, 'FACULTY_SCHOOL_DEPARTMENT')],
      identityClaims: [nameClaim(11, 1, 'Synthetic Club'), nameClaim(12, 2, 'Synthetic Faculty')],
      relationshipClaims: [relation(21, 1, 'PART_OF', { subject: 2 })],
      reviews: [review(31, { relationshipClaim: 21 }, 'CONFIRMED')],
    });
    expect(evaluateStructuralParentConstraint(input, uid(1), [ECHE_PROTECTED]).reason).toBe(
      'STRUCTURAL_PARENT_UNKNOWN',
    );
  });

  it('fails closed on malformed input, malformed protected keys and unknown subjects', () => {
    const input = clubInFacultyInInstitution(ECHE_ALPHA);
    expect(evaluateStructuralParentConstraint(input, uid(77), []).reason).toBe('SUBJECT_UNKNOWN');
    expect(evaluateStructuralParentConstraint(input, uid(1), ['not a key']).reason).toBe(
      'INPUT_STRUCTURALLY_INVALID',
    );
    const broken = { ...input, asOf: 'yesterday' };
    expect(evaluateStructuralParentConstraint(broken, uid(1), []).constraint).toBe('UNRESOLVED');
  });

  it('no result of the evaluator is ever research authority', () => {
    const inputs = [
      clubInFacultyInInstitution(ECHE_PROTECTED),
      clubInFacultyInInstitution(ECHE_ALPHA),
      graph({ subjects: [subject(1, 'INDEPENDENT_COMMUNITY')] }),
    ];
    for (const input of inputs) {
      for (const protectedKeys of [[], [ECHE_PROTECTED]]) {
        const constraint = evaluateStructuralParentConstraint(input, uid(1), protectedKeys);
        expect(constraint.grantsResearchAuthority).toBe(false);
        expect(Object.keys(constraint).sort()).toEqual([
          'constraint',
          'grantsResearchAuthority',
          'reason',
          'ruleVersion',
          'subjectId',
        ]);
      }
    }
  });
});

describe('B2.1 determinism and purity', () => {
  const input = graph({
    subjects: [subject(3, 'NETWORK_LOCAL_CHAPTER'), subject(1, 'UNCERTAIN'), subject(2)],
    identityClaims: [
      nameClaim(13, 3, 'Synthetic Section'),
      kindClaim(12, 1, 'INTERNAL_STUDENT_GROUP'),
      kindClaim(14, 1, 'INDEPENDENT_COMMUNITY'),
      nameClaim(11, 1, 'Synthetic One'),
    ],
    relationshipClaims: [
      relation(22, 3, 'LOCAL_CHAPTER_OF', { subject: 2 }),
      relation(21, 1, 'PART_OF', { eche: ECHE_BETA }),
      relation(23, 1, 'PART_OF', { eche: ECHE_GAMMA }),
    ],
    reviews: [review(31, { subject: 3 }, 'DISPUTED')],
  });

  it('returns the identical result for any ordering of the same records', () => {
    const expected = JSON.stringify(validateIdentityGraph(input));
    const reversed: IdentityGraphInput = {
      ...input,
      subjects: [...input.subjects].reverse(),
      identityClaims: [...input.identityClaims].reverse(),
      relationshipClaims: [...input.relationshipClaims].reverse(),
      reviews: [...input.reviews].reverse(),
      knownEcheRowKeys: [...input.knownEcheRowKeys].reverse(),
    };
    expect(JSON.stringify(validateIdentityGraph(reversed))).toBe(expected);
    expect(JSON.stringify(validateIdentityGraph(input))).toBe(expected);
  });

  it('reports the same record for a collision whatever the input order (duplicates, double successors)', () => {
    const colliding = graph({
      subjects: [subject(1, 'INTERNAL_STUDENT_GROUP')],
      identityClaims: [
        nameClaim(11, 1, 'Synthetic Choir', { src: 'same' }),
        nameClaim(12, 1, 'Synthetic Choir', { src: 'same' }),
      ],
      relationshipClaims: [
        relation(21, 1, 'PART_OF', { eche: ECHE_ALPHA }, 'same'),
        relation(22, 1, 'PART_OF', { eche: ECHE_ALPHA }, 'same'),
      ],
      reviews: [
        review(31, { subject: 1 }, 'CONFIRMED'),
        review(32, { subject: 1 }, 'DISPUTED', { supersedes: 31 }),
        review(33, { subject: 1 }, 'REJECTED', { supersedes: 31 }),
      ],
    });
    const forward = JSON.stringify(validateIdentityGraph(colliding));
    const reversed = JSON.stringify(
      validateIdentityGraph({
        ...colliding,
        identityClaims: [...colliding.identityClaims].reverse(),
        relationshipClaims: [...colliding.relationshipClaims].reverse(),
        reviews: [...colliding.reviews].reverse(),
      }),
    );
    expect(reversed).toBe(forward);
    expect(forward).toContain('DUPLICATE_ASSERTION');
    expect(forward).toContain('REVIEW_CHAIN_INVALID');
  });

  it('never mutates its input', () => {
    const frozen = deepFreeze(structuredClone(input));
    expect(() => validateIdentityGraph(frozen)).not.toThrow();
    expect(() =>
      evaluateStructuralParentConstraint(frozen, uid(1), [ECHE_PROTECTED]),
    ).not.toThrow();
    expect(frozen).toEqual(input);
  });

  it('refuses a non-array collection outright', () => {
    const result = validateIdentityGraph({ ...input, reviews: null as never });
    expect(result.structurallyValid).toBe(false);
    expect(codes(result)).toEqual(['INPUT_SHAPE_INVALID']);
  });

  it('uses only the supplied instant: the same records are valid or not depending on asOf alone', () => {
    const later = graph({
      subjects: [subject(1)],
      identityClaims: [
        { ...nameClaim(11, 1, 'Synthetic Later'), observedAt: '2026-12-01T00:00:00.000Z' },
      ],
    });
    expect(validateIdentityGraph(later).structurallyValid).toBe(false);
    expect(
      validateIdentityGraph({ ...later, asOf: '2027-01-01T00:00:00Z' }).structurallyValid,
    ).toBe(true);
  });

  it('the synthetic URL helper produces admissible sources', () => {
    expect(isAdmissiblePublicUrl(sourceUrl('anything/at-all'))).toBe(true);
  });
});

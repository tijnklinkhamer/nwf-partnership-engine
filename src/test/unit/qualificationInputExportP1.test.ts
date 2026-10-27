/**
 * REL P1 - the qualification-input export's RULES over in-memory records
 * (`nwf-pe-qualification-input-producer-v1`, `nwf-pe-stated-date-rules-v1`):
 * only the five C1 claim keys the Engine's stored evidence supports, every
 * claim citing stored rows, a country only from STATED ADR 0024 claims
 * (else null), RESEARCH_REAL on every source and claim, whole-second
 * instants, the as-of cut, determinism, and no page text or contact field.
 */
import { describe, expect, it } from 'vitest';

import {
  buildQualificationInputExport,
  type IdentityClaimRow,
  type PageRow,
  type QualificationInputRecords,
} from '../../orgunits/qualificationInput/build.js';
import {
  EXPORTED_CLAIM_KEYS,
  PERMISSIONS,
  QUALIFICATION_INPUT_EXPORT_CONTRACT,
  QUALIFICATION_INPUT_PRODUCER_VERSION,
  QualificationInputExportRefusal,
  RP_REFERENCE,
  WHOLE_SECOND_INSTANT,
  derivedUuid,
  toWholeSecond,
} from '../../orgunits/qualificationInput/contract.js';
import {
  currentOrUpcomingYearDates,
  statedDates,
} from '../../orgunits/qualificationInput/dates.js';
import {
  nominationCitationDigestOf,
  type JurisdictionClaimRow,
} from '../../orgunits/subjectFacts/facts.js';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const SUBJECT = id(0x5001);
const ROOT_CLAIM = id(0x6001);
const ADMISSION = id(0x7001);
const RUN = id(0x8001);
const SITE = 'https://www.gogaku-gakko-fict.jp/';
const NOW = '2026-10-27T12:00:00.000Z';
const EVAL = '2026-10-27T11:00:00Z';
const t = (minute: number) => `2026-10-27T09:${String(minute).padStart(2, '0')}:30.250Z`;

const NOMINATION = {
  id: id(0x9001),
  discoveryRunId: id(0x9101),
  url: 'https://directory.rel-p1-fict.org/gakko',
  retrievedAt: '2026-10-26T08:00:00.000Z',
};

function identity(
  n: number,
  fields: Partial<IdentityClaimRow> & Pick<IdentityClaimRow, 'claimKind'>,
): IdentityClaimRow {
  return {
    id: id(0x6000 + n),
    subjectId: SUBJECT,
    claimedKind: null,
    websiteUrl: null,
    sourceType: 'PUBLIC_URL',
    sourcePageEvidenceId: null,
    sourceWebsiteClaimId: null,
    sourceUrl: NOMINATION.url,
    sourceVersionRef: nominationCitationDigestOf(NOMINATION),
    observedAt: NOMINATION.retrievedAt,
    claimBasis: 'SOURCE_STATED',
    createdAt: t(n),
    ...fields,
  };
}

function page(n: number, url: string, text: string, fields: Partial<PageRow> = {}): PageRow {
  return {
    id: id(0xa000 + n),
    fetchObservationId: id(0xb000 + n),
    runId: RUN,
    rootKey: `subject_admission:${ADMISSION}`,
    requestedUrl: url,
    observedAt: t(20 + n),
    responseSha256: `${'a'.repeat(63)}${n}`,
    title: '日本語学校',
    headings: [{ level: 1, text: '日本語学校' }],
    mainText: text,
    ruleVersion: 'orgunit-extraction-v3',
    createdAt: t(20 + n),
    ...fields,
  };
}

function jurisdiction(
  n: number,
  country: string,
  fields: Partial<JurisdictionClaimRow> = {},
): JurisdictionClaimRow {
  return {
    id: id(0xc000 + n),
    subjectId: SUBJECT,
    claimKind: 'COUNTRY_OF_OPERATION',
    claimedCountry: country,
    claimedLegalForm: null,
    sourceType: 'PAGE_EVIDENCE',
    sourcePageEvidenceId: id(0xa001),
    sourceWebsiteClaimId: null,
    sourceUrl: null,
    sourceVersionRef: null,
    observedAt: t(40),
    claimBasis: 'SOURCE_STATED',
    recordedByActorKey: 'rel-p1-owner',
    createdAt: t(40 + n),
    ...fields,
  };
}

function records(overrides: Partial<QualificationInputRecords> = {}): QualificationInputRecords {
  return {
    databaseNow: NOW,
    subjectId: SUBJECT,
    subject: { id: SUBJECT, createdAt: t(0) },
    identityClaims: [
      identity(1, { claimKind: 'PUBLIC_WEBSITE', websiteUrl: SITE }),
      identity(2, { claimKind: 'ENTITY_KIND', claimedKind: 'INDEPENDENT_STUDENT_ASSOCIATION' }),
      identity(3, { claimKind: 'ENTITY_KIND', claimedKind: 'INDEPENDENT_COMMUNITY' }),
      identity(4, {
        claimKind: 'ENTITY_KIND',
        claimedKind: 'FACULTY_SCHOOL_DEPARTMENT',
        claimBasis: 'INFERRED',
      }),
    ],
    reviews: [
      { id: id(0xd001), targetKey: `subject:${SUBJECT}`, outcome: 'CONFIRMED', createdAt: t(5) },
    ],
    jurisdictionClaims: [jurisdiction(1, 'JP')],
    admissions: [
      {
        id: ADMISSION,
        subjectId: SUBJECT,
        identityClaimId: ROOT_CLAIM,
        websiteUrl: SITE,
        admittedAt: t(10),
      },
    ],
    revocations: [],
    runs: [
      {
        id: RUN,
        rootScope: `subject_admission:${ADMISSION}`,
        dryRun: false,
        completion: { terminalState: 'COMPLETED', createdAt: t(30) },
      },
    ],
    pages: [
      page(1, SITE, '２０２６年１１月１５日に日本語の授業が始まります。電話 [PHONE]'),
      page(2, `${SITE}about/`, '1998年創立。お問い合わせ [EMAIL]'),
    ],
    candidates: [
      {
        id: id(0xe001),
        pageEvidenceId: id(0xa001),
        track: 'LANGUAGE_CENTRE',
        candidateScore: '3.0000',
        rankWithinRoot: 1,
        ruleVersion: 'orgunit-signal-rules-v2',
      },
    ],
    nominations: [NOMINATION],
    websiteClaims: [],
    ...overrides,
  };
}

const build = (r: QualificationInputRecords = records(), evaluatedAt: string | null = EVAL) =>
  buildQualificationInputExport(r, { evaluatedAt, readConsistency: 'SYNTHETIC_IN_MEMORY' });

const claimsOf = (doc: ReturnType<typeof build>, key: string) =>
  doc.claims.filter((c) => c.claimKey === key);

describe('REL P1: stated dates (an observation, never an interpretation)', () => {
  it('reads the four closed full-date forms, NFKC-folded and diacritic-free', () => {
    expect(
      statedDates([
        '2026-11-15 open day',
        '２０２７年１月３日',
        '15 de noviembre de 2026',
        '12 december 2026',
        'March 5th, 2027',
        '6 Oktober 2026',
        '1 setiembre 2026',
      ]),
    ).toEqual(['2026-09-01', '2026-10-06', '2026-11-15', '2026-12-12', '2027-01-03', '2027-03-05']);
  });

  it('never reads a bare year, a month and year, a numeric D/M form, a range or an impossible date', () => {
    expect(
      statedDates([
        '© 2026',
        'november 2026',
        '06/10/2026',
        '10.11.2026',
        'academic year 2026-2027',
        '2026-02-30',
        '31 april 2026',
        '15 november 1999',
        'tel 2026-1115',
      ]),
    ).toEqual([]);
  });

  it('keeps only the capture year and the next', () => {
    expect(
      currentOrUpcomingYearDates(
        ['2025-12-01', '2026-01-02', '2027-12-31', '2028-01-01'],
        '2026-10-27T09:00:00.000Z',
      ),
    ).toEqual(['2026-01-02', '2027-12-31']);
  });
});

describe('REL P1: the qualification-input export (in memory)', () => {
  it('emits exactly the five supported C1 claim keys, each citing stored rows', () => {
    const doc = build();
    expect(doc.document).toBe(QUALIFICATION_INPUT_EXPORT_CONTRACT);
    expect(doc.producerVersion).toBe(QUALIFICATION_INPUT_PRODUCER_VERSION);
    expect(doc.evaluatedAt).toBe(EVAL);
    expect(new Set(doc.claims.map((c) => c.claimKey))).toEqual(new Set(EXPORTED_CLAIM_KEYS));
    expect(doc.country).toEqual({
      value: 'JP',
      standing: 'STATED',
      rule: 'ADR_0024_COUNTRY_OF_OPERATION_STATED',
      notRankableReason: null,
    });
    expect(doc.channels).toEqual([
      {
        channelRef: `rp-channel:${ROOT_CLAIM}`,
        kind: 'RESOURCE_PAGE',
        visibility: 'PUBLIC',
        websiteClaimId: ROOT_CLAIM,
        admissionIds: [ADMISSION],
      },
    ]);

    const [existence] = claimsOf(doc, 'channel.existence');
    expect(existence).toMatchObject({
      mode: 'OBSERVED',
      attribution: 'EXACT',
      producedBy: 'NWF_SYSTEM',
      subject: { kind: 'CHANNEL', ref: `rp-channel:${ROOT_CLAIM}` },
      value: { status: 'EXISTS' },
    });
    const [binding] = claimsOf(doc, 'channel.operator_binding');
    expect(binding!.value).toEqual({
      operatorCandidateId: `rp-candidate:${SUBJECT}`,
      basis: 'HOSTED_ON_CANDIDATE_SITE',
    });
    for (const c of [existence!, binding!]) {
      expect(
        doc.claimLinks.filter((l) => l.claimRef === c.claimRef).map((l) => l.sourceRef),
      ).toEqual([`rp-source:${id(0xa001)}`, `rp-source:${id(0xa002)}`]);
    }

    // Only the page that STATES a 2026/2027 date is current; the 1998 one yields nothing.
    const currency = claimsOf(doc, 'channel.static_currency');
    expect(currency).toHaveLength(1);
    expect(currency[0]!.basis).toEqual({
      origin: 'STATED_DATE_IN_CAPTURE',
      pageEvidenceId: id(0xa001),
      statedDates: ['2026-11-15'],
    });
    expect(currency[0]!.value).toEqual({ marker: 'CURRENT_OR_UPCOMING_YEAR', lastModified: null });

    // Location from a SELF page: SELF_ASSERTED + EXACT, recorded by a person.
    const [location] = claimsOf(doc, 'candidate.location');
    expect(location).toMatchObject({
      mode: 'SELF_ASSERTED',
      attribution: 'EXACT',
      producedBy: 'HUMAN_RESEARCHER',
      value: { countryCode: 'JP' },
      researchRealConflicts: [],
    });

    // Kind from a THIRD_PARTY nomination (digest-verified): THIRD_PARTY_ASSERTED + LIKELY.
    const kinds = claimsOf(doc, 'candidate.kind');
    expect(kinds.map((k) => k.value)).toEqual([{ kind: 'STUDENT_ASSOCIATION' }]);
    expect(kinds[0]).toMatchObject({ mode: 'THIRD_PARTY_ASSERTED', attribution: 'LIKELY' });
    const kindSource = doc.sources.find(
      (s) =>
        s.sourceRef === doc.claimLinks.find((l) => l.claimRef === kinds[0]!.claimRef)!.sourceRef,
    )!;
    expect(kindSource).toMatchObject({
      publisherRelation: 'THIRD_PARTY',
      sourceRef: `rp-source:${NOMINATION.id}`,
      record: { kind: 'SOURCE_DISCOVERY_NOMINATION', nominationId: NOMINATION.id },
      reproducibility: {
        kind: 'EXTERNAL_REFERENCE_ONLY',
        origin: NOMINATION.url,
        contentDigest: null,
      },
    });

    expect(doc.excluded).toEqual([
      { ref: `identity_claim:${id(0x6003)}`, reason: 'REGISTRY_KIND_HAS_NO_FAITHFUL_C1_KIND' },
      { ref: `identity_claim:${id(0x6004)}`, reason: 'IDENTITY_CLAIM_INFERRED' },
    ]);
  });

  it('tags RESEARCH_REAL everywhere, uses rp references and whole-second instants', () => {
    const doc = build();
    expect(doc.evidenceClass).toBe('RESEARCH_REAL');
    for (const s of doc.sources) {
      expect(s.evidenceClass).toBe('RESEARCH_REAL');
      expect(s.sourceRef).toMatch(RP_REFERENCE);
      expect(s.capturedAt).toMatch(WHOLE_SECOND_INSTANT);
    }
    for (const c of doc.claims) {
      expect(c.evidenceClass).toBe('RESEARCH_REAL');
      expect(c.claimRef).toMatch(RP_REFERENCE);
      expect(c.subject.ref).toMatch(RP_REFERENCE);
    }
    const pageSource = doc.sources.find((s) => s.sourceRef === `rp-source:${id(0xa001)}`)!;
    expect(pageSource.capturedAt).toBe('2026-10-27T09:21:30Z');
    expect(pageSource).toMatchObject({
      publisherRelation: 'SELF',
      c1: { captureKind: 'ARTEFACT', contentDigest: pageSource.reproducibility.contentDigest },
      reproducibility: {
        kind: 'DIGEST_ONLY_BYTES_UNAVAILABLE',
        bytesAvailable: false,
        origin: SITE,
      },
      record: {
        kind: 'PAGE_EVIDENCE',
        researchRunId: RUN,
        admissionId: ADMISSION,
        candidates: [{ candidateId: id(0xe001), rankWithinRoot: 1, track: 'LANGUAGE_CENTRE' }],
      },
    });
    expect(toWholeSecond('2026-10-27T09:21:30.999Z')).toBe('2026-10-27T09:21:30Z');
    expect(JSON.stringify(doc)).not.toMatch(/(cand|chn|opp):/i);
  });

  it('names every RESEARCH_REAL conflict of an OBSERVED Engine capture, never relabelling it', () => {
    for (const c of build().claims.filter((x) => x.claimKey.startsWith('channel.'))) {
      expect(c.researchRealConflicts).toEqual([
        'MODE_NEEDS_PRESERVED_SOURCE_MATERIAL_ENGINE_HOLDS_DIGEST_ONLY',
        'PRODUCER_NWF_SYSTEM_NOT_A_RESEARCH_REAL_PRODUCER',
      ]);
    }
    const http = build(
      records({ pages: [page(1, 'http://www.gogaku-gakko-fict.jp/', 'no date')] }),
    );
    expect(claimsOf(http, 'channel.existence')[0]!.researchRealConflicts).toContain(
      'SOURCE_ORIGIN_NOT_HTTPS',
    );
  });

  it('exports country null for UNKNOWN and CONFLICTING standings, with no location claim', () => {
    const unknown = build(records({ jurisdictionClaims: [] }));
    expect(unknown.country).toMatchObject({
      value: null,
      standing: 'UNKNOWN',
      notRankableReason: 'NO_STATED_COUNTRY',
    });
    expect(claimsOf(unknown, 'candidate.location')).toEqual([]);

    const conflicting = build(
      records({
        jurisdictionClaims: [
          jurisdiction(1, 'MX'),
          jurisdiction(2, 'US', {
            sourceType: 'PUBLIC_URL',
            sourcePageEvidenceId: null,
            sourceUrl: 'https://directory.rel-p1-fict.org/listing',
          }),
        ],
      }),
    );
    expect(conflicting.country).toMatchObject({ value: null, standing: 'CONFLICTING' });
    expect(claimsOf(conflicting, 'candidate.location')).toEqual([]);
    expect(conflicting.excluded.filter((e) => e.reason === 'COUNTRY_NOT_STATED')).toHaveLength(2);
    // Channel evidence is unaffected: the Operator, not the Engine, reports "not rankable".
    expect(claimsOf(conflicting, 'channel.existence')).toHaveLength(1);
  });

  it('a third-party listing never becomes SELF, and an unverified citation stays unresolved', () => {
    const doc = build(
      records({
        jurisdictionClaims: [
          jurisdiction(1, 'JP', {
            sourceType: 'PUBLIC_URL',
            sourcePageEvidenceId: null,
            sourceUrl: NOMINATION.url,
            sourceVersionRef: 'f'.repeat(64),
          }),
        ],
      }),
    );
    const [location] = claimsOf(doc, 'candidate.location');
    expect(location).toMatchObject({ mode: 'THIRD_PARTY_ASSERTED', attribution: 'LIKELY' });
    const ref = doc.claimLinks.find((l) => l.claimRef === location!.claimRef)!.sourceRef;
    expect(doc.sources.find((s) => s.sourceRef === ref)!.record).toEqual({
      kind: 'PUBLIC_URL_UNRESOLVED',
      provenanceKey: `url:${NOMINATION.url}|v=${'f'.repeat(64)}`,
    });
  });

  it('a page-evidence citation on the subject’s own registrable domain is SELF, even under another root', () => {
    const own = page(9, 'https://info.gogaku-gakko-fict.jp/kaisha', 'x', {
      runId: id(0x8999),
      rootKey: `claim:${id(0x1)}`,
    });
    const doc = build(
      records({
        jurisdictionClaims: [jurisdiction(1, 'JP', { sourcePageEvidenceId: own.id })],
        pages: [...records().pages, own],
      }),
    );
    const ref = doc.claimLinks.find(
      (l) => l.claimRef === claimsOf(doc, 'candidate.location')[0]!.claimRef,
    )!.sourceRef;
    expect(doc.sources.find((s) => s.sourceRef === ref)).toMatchObject({
      publisherRelation: 'SELF',
      record: { kind: 'PAGE_EVIDENCE', admissionId: null },
    });
  });

  it('applies the as-of cut: later pages, completions, claims and revocations do not exist yet', () => {
    const early = build(records(), '2026-10-27T09:21:00Z');
    // The run completed at 09:30: nothing researched exists at 09:21.
    expect(early.channels).toEqual([]);
    expect(early.researchRuns).toEqual([
      { runId: RUN, admissionId: ADMISSION, included: false, pages: 0 },
    ]);
    expect(early.excluded).toContainEqual({
      ref: `research_run:${RUN}`,
      reason: 'RUN_NOT_COMPLETED',
    });
    expect(early.country.value).toBeNull();

    const revoked = build(
      records({ revocations: [{ id: id(0xf001), admissionId: ADMISSION, revokedAt: t(50) }] }),
    );
    expect(revoked.channels).toEqual([]);
    expect(revoked.excluded).toContainEqual({
      ref: `research_run:${RUN}`,
      reason: 'ADMISSION_REVOKED_BY_EVALUATED_AT',
    });
    const beforeRevocation = build(
      records({
        revocations: [
          { id: id(0xf001), admissionId: ADMISSION, revokedAt: '2026-10-27T11:30:00.000Z' },
        ],
      }),
    );
    expect(beforeRevocation.channels).toHaveLength(1);

    for (const run of [
      { dryRun: true, completion: { terminalState: 'COMPLETED', createdAt: t(30) } },
      { dryRun: false, completion: { terminalState: 'FAILED', createdAt: t(30) } },
      { dryRun: false, completion: null },
    ]) {
      const doc = build(
        records({ runs: [{ id: RUN, rootScope: `subject_admission:${ADMISSION}`, ...run }] }),
      );
      expect(doc.channels).toEqual([]);
      expect(claimsOf(doc, 'channel.existence')).toEqual([]);
    }
  });

  it('excludes a negatively reviewed claim and refuses a negatively reviewed subject', () => {
    const doc = build(
      records({
        reviews: [
          {
            id: id(0xd002),
            targetKey: `identity_claim:${id(0x6002)}`,
            outcome: 'DISPUTED',
            createdAt: t(6),
          },
        ],
      }),
    );
    expect(claimsOf(doc, 'candidate.kind')).toEqual([]);
    expect(doc.excluded).toContainEqual({
      ref: `identity_claim:${id(0x6002)}`,
      reason: 'IDENTITY_CLAIM_NEGATIVE_REVIEW',
    });
    const rootNegative = build(
      records({
        reviews: [
          {
            id: id(0xd003),
            targetKey: `identity_claim:${ROOT_CLAIM}`,
            outcome: 'REJECTED',
            createdAt: t(6),
          },
        ],
        identityClaims: [identity(1, { claimKind: 'PUBLIC_WEBSITE', websiteUrl: SITE })],
      }),
    );
    expect(rootNegative.channels).toEqual([]);
    expect(() =>
      build(
        records({
          reviews: [
            {
              id: id(0xd004),
              targetKey: `subject:${SUBJECT}`,
              outcome: 'REJECTED',
              createdAt: t(6),
            },
          ],
        }),
      ),
    ).toThrow(QualificationInputExportRefusal);
  });

  it('refuses a missing subject, a malformed or future instant, and a malformed id', () => {
    const code = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return (e as QualificationInputExportRefusal).code;
      }
      return null;
    };
    expect(code(() => build(records({ subject: null })))).toBe('SUBJECT_NOT_FOUND');
    expect(code(() => build(records(), '2026-10-27T09:00:00Z'.replace('09', '08')))).toBe(
      'SUBJECT_NOT_FOUND',
    );
    expect(code(() => build(records(), '2026-10-27T11:00:00.000Z'))).toBe('ARGUMENT_INVALID');
    expect(code(() => build(records(), '2026-10-27T12:00:01Z'))).toBe('EVALUATED_AT_IN_THE_FUTURE');
    expect(code(() => build(records({ subjectId: 'nope' })))).toBe('ARGUMENT_INVALID');
    // The database clock, truncated, when no instant is given.
    expect(build(records(), null).evaluatedAt).toBe('2026-10-27T12:00:00Z');
  });

  it('is deterministic: equal records in any order give identical bytes', () => {
    const base = records();
    const shuffled = records({
      identityClaims: [...base.identityClaims].reverse(),
      pages: [...base.pages].reverse(),
      jurisdictionClaims: [...base.jurisdictionClaims].reverse(),
    });
    expect(JSON.stringify(build(shuffled))).toBe(JSON.stringify(build(base)));
    expect(derivedUuid('x')).toBe(derivedUuid('x'));
    expect(derivedUuid('x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('carries no page text, no name, no contact field, and denies every permission', () => {
    const text = JSON.stringify(build());
    expect(text).not.toContain('日本語学校');
    expect(text).not.toContain('授業');
    expect(text).not.toMatch(/\[EMAIL\]|\[PHONE\]|mailto:|tel:|@/);
    const keys: string[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v !== null && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          keys.push(k);
          walk(x);
        }
      }
    };
    walk(JSON.parse(text));
    expect(
      [...new Set(keys)].filter((k) =>
        /e-?mail|phone|contact|name|score|qualified|eligible/i.test(k),
      ),
    ).toEqual(['candidateScore', 'contactPermission']);
    expect(PERMISSIONS.contactPermission).toBe('NOT_GRANTED');
    expect(
      Object.entries(PERMISSIONS)
        .filter(([k]) => k !== 'contactPermission')
        .every(([, v]) => v === 'NONE'),
    ).toBe(true);
  });
});

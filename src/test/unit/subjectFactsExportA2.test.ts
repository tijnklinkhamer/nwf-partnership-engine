/**
 * REL final join A2 - the subject facts export's RULES, over in-memory
 * records (`subject-facts-rules-v1`): names from SOURCE_STATED NAME claims
 * only, every source cited and resolved only by a verified record, a country
 * only from an ADR 0024 jurisdiction claim, an explicit UNKNOWN licence, no
 * winner between disagreeing claims, and no contact field anywhere.
 */
import { describe, expect, it } from 'vitest';

import {
  LICENCE_UNKNOWN,
  MAX_SUBJECTS_PER_EXPORT,
  NOMINATION_CITATION_VERSION,
  SUBJECT_FACTS_EXPORT_CONTRACT,
  SubjectFactsRefusal,
  buildSubjectFactsDocument,
  nominationCitationDigestOf,
  type IdentityClaimRecord,
  type JurisdictionClaimRow,
  type SubjectFactsRecords,
} from '../../orgunits/subjectFacts/facts.js';
import {
  NOMINATION_CITATION_VERSION as PROMOTE_CITATION_VERSION,
  nominationCitationDigest,
} from '../../orgunits/sourceDiscovery/promote.js';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const S = { a: id(0xa1), b: id(0xb1), c: id(0xc1), d: id(0xd1), e: id(0xe1) };
const T0 = '2026-10-26T08:00:00.000Z';
const at = (minute: number) => `2026-10-26T08:${String(minute).padStart(2, '0')}:00.000Z`;

const NOMINATION = {
  id: id(0x501),
  discoveryRunId: id(0x601),
  url: 'https://directory.rel-a2-fict.nl/taalcafe',
  retrievedAt: '2026-10-25T07:00:00.000Z',
};

let claimSeq = 0;
function claim(
  subjectId: string,
  fields: Partial<IdentityClaimRecord> & Pick<IdentityClaimRecord, 'claimKind'>,
): IdentityClaimRecord {
  claimSeq += 1;
  return {
    id: id(0x1000 + claimSeq),
    subjectId,
    nameText: null,
    nameLanguage: null,
    websiteUrl: null,
    sourceType: 'PUBLIC_URL',
    sourcePageEvidenceId: null,
    sourceWebsiteClaimId: null,
    sourceUrl: 'https://unresolved.rel-a2-fict.org/page',
    sourceVersionRef: null,
    observedAt: T0,
    claimBasis: 'SOURCE_STATED',
    createdAt: at(claimSeq),
    ...fields,
  };
}

function country(subjectId: string, value: string, n: number): JurisdictionClaimRow {
  return {
    id: id(0x2000 + n),
    subjectId,
    claimKind: 'COUNTRY_OF_OPERATION',
    claimedCountry: value,
    claimedLegalForm: null,
    sourceType: 'PUBLIC_URL',
    sourcePageEvidenceId: null,
    sourceWebsiteClaimId: null,
    sourceUrl: `https://source-${n}.rel-a2-fict.org/`,
    sourceVersionRef: null,
    observedAt: T0,
    claimBasis: 'SOURCE_STATED',
    recordedByActorKey: 'rel-final-join-a2-test',
    createdAt: at(50 + n),
  };
}

const citedByNomination = {
  sourceType: 'PUBLIC_URL' as const,
  sourceUrl: NOMINATION.url,
  sourceVersionRef: nominationCitationDigestOf(NOMINATION),
};

const aName = claim(S.a, {
  claimKind: 'NAME',
  nameText: 'Taalcafé Voorbeeld',
  nameLanguage: 'nl',
  ...citedByNomination,
});
const aNameAgain = claim(S.a, { claimKind: 'NAME', nameText: 'Taalcafé Voorbeeld' });
const aWebsite = claim(S.a, {
  claimKind: 'PUBLIC_WEBSITE',
  websiteUrl: 'https://taalcafe-voorbeeld.example.test/',
  ...citedByNomination,
});
const aAlternate = claim(S.a, { claimKind: 'ALTERNATE_NAME', nameText: 'Voorbeeld Language Café' });
const bName1 = claim(S.b, { claimKind: 'NAME', nameText: 'Ejemplo Uno' });
const bName2 = claim(S.b, {
  claimKind: 'NAME',
  nameText: 'Ejemplo Dos',
  sourceType: 'PAGE_EVIDENCE',
  sourceUrl: null,
  sourcePageEvidenceId: id(0x701),
});
const bSite1 = claim(S.b, { claimKind: 'PUBLIC_WEBSITE', websiteUrl: 'https://uno.example.test/' });
const bSite2 = claim(S.b, {
  claimKind: 'PUBLIC_WEBSITE',
  websiteUrl: 'https://dos.example.test/',
  sourceType: 'WEBSITE_CLAIM',
  sourceUrl: null,
  sourceWebsiteClaimId: id(0x801),
});
const cInferred = claim(S.c, {
  claimKind: 'NAME',
  nameText: 'Gekozen Naam',
  claimBasis: 'INFERRED',
});
const cStated = claim(S.c, { claimKind: 'NAME', nameText: 'Afgewezen Naam' });
const dRejected = claim(S.d, { claimKind: 'NAME', nameText: 'Verkeerde Naam' });
const dKept = claim(S.d, {
  claimKind: 'NAME',
  nameText: '渋谷語学交流サークル',
  nameLanguage: 'ja',
  ...citedByNomination,
  sourceVersionRef: 'f'.repeat(64),
});
const dWebsite = claim(S.d, {
  claimKind: 'PUBLIC_WEBSITE',
  websiteUrl: 'https://www.shibuya-fict.jp/',
});

const RECORDS: SubjectFactsRecords = {
  readAt: '2026-10-26T12:00:00.000Z',
  requestedSubjectIds: [S.d, S.a, S.b, S.c, S.e],
  subjects: [S.a, S.b, S.c, S.d].map((s, i) => ({ id: s, createdAt: at(i) })),
  identityClaims: [
    aName,
    aNameAgain,
    aWebsite,
    aAlternate,
    bName1,
    bName2,
    bSite1,
    bSite2,
    cInferred,
    cStated,
    dRejected,
    dKept,
    dWebsite,
  ],
  reviews: [
    { id: id(0x901), targetKey: `subject:${S.c}`, outcome: 'REJECTED', createdAt: at(40) },
    {
      id: id(0x902),
      targetKey: `identity_claim:${dRejected.id}`,
      outcome: 'DISPUTED',
      createdAt: at(41),
    },
    // A later CONFIRMED review never re-admits a claim here.
    {
      id: id(0x903),
      targetKey: `identity_claim:${dRejected.id}`,
      outcome: 'CONFIRMED',
      createdAt: at(42),
    },
  ],
  nominations: [
    NOMINATION,
    { ...NOMINATION, id: id(0x502), retrievedAt: '2026-10-24T07:00:00.000Z' },
  ],
  pageEvidenceSources: [
    {
      id: id(0x701),
      researchRunId: id(0x711),
      requestedUrl: 'https://dos.example.test/about',
      fetchObservedAt: '2026-10-23T10:00:00.000Z',
    },
  ],
  websiteClaimSources: [
    {
      id: id(0x801),
      ingestRunId: id(0x811),
      normalisedUrl: 'https://dos.example.test/',
      observedAt: '2026-10-22T10:00:00.000Z',
    },
  ],
  jurisdictionClaims: [country(S.a, 'NL', 1), country(S.b, 'MX', 2), country(S.b, 'US', 3)],
};

const doc = buildSubjectFactsDocument(RECORDS, 'SYNTHETIC_IN_MEMORY');
const facts = (subjectId: string) => doc.subjects.find((s) => s.subjectId === subjectId)!;

describe('the subject facts export: contract and scope', () => {
  it('is the versioned contract, for exactly the requested subjects, sorted; a missing one is reported', () => {
    expect(doc.document).toBe(SUBJECT_FACTS_EXPORT_CONTRACT);
    expect(doc.document).toBe('nwf-pe.subject-facts-export.v1');
    expect(doc.ruleVersion).toBe('subject-facts-rules-v1');
    expect(doc.subjects.map((s) => s.subjectId)).toEqual([S.a, S.b, S.c, S.d]);
    expect(doc.missingSubjectIds).toEqual([S.e]);
    expect(Object.values(doc.permissions).every((v) => v === 'NONE')).toBe(true);
  });

  it('restates the source-discovery nomination citation digest exactly', () => {
    expect(NOMINATION_CITATION_VERSION).toBe(PROMOTE_CITATION_VERSION);
    expect(nominationCitationDigestOf(NOMINATION)).toBe(nominationCitationDigest(NOMINATION));
  });

  it('refuses malformed, repeated, empty and over-bound subject id lists', () => {
    const refusal = (ids: string[]) => {
      try {
        buildSubjectFactsDocument({ ...RECORDS, requestedSubjectIds: ids }, 'SYNTHETIC_IN_MEMORY');
      } catch (error) {
        return error instanceof SubjectFactsRefusal ? error.code : 'OTHER';
      }
      return 'NOT_REFUSED';
    };
    expect(refusal(['not-a-uuid'])).toBe('SUBJECT_ID_INVALID');
    expect(refusal([S.a, S.a])).toBe('SUBJECT_ID_REPEATED');
    expect(refusal([])).toBe('BOUND_EXCEEDED');
    expect(refusal(Array.from({ length: MAX_SUBJECTS_PER_EXPORT + 1 }, (_, i) => id(i)))).toBe(
      'BOUND_EXCEEDED',
    );
    // A claim about a subject that was not requested is an inconsistent read.
    expect(refusal([S.a])).toBe('RECORD_INCONSISTENT');
  });

  it('carries no contact-shaped key anywhere', () => {
    const keys: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v !== null && typeof v === 'object') {
        for (const [k, inner] of Object.entries(v)) {
          keys.push(k);
          walk(inner);
        }
      }
    };
    walk(doc);
    expect(keys.filter((k) => /mail|phone|contact|tel|address|person/i.test(k))).toEqual([]);
  });
});

describe('the subject facts export: names, websites, provenance', () => {
  it('a name STATED by several claims, every source cited; ALTERNATE names never name the subject', () => {
    const a = facts(S.a);
    expect(a.name).toEqual({
      state: 'STATED',
      text: 'Taalcafé Voorbeeld',
      claimIds: [aName.id, aNameAgain.id].sort(),
    });
    expect(a.nameClaims.map((n) => n.claimId)).toEqual([aName.id, aNameAgain.id]);
    expect(a.nameClaims.every((n) => n.source.sourceRef.startsWith('url:'))).toBe(true);
    expect(a.websiteHost).toEqual({
      state: 'STATED',
      host: 'taalcafe-voorbeeld.example.test',
      claimIds: [aWebsite.id],
    });
  });

  it('provenance is the earliest stating claim, resolved through a VERIFIED nomination citation', () => {
    const a = facts(S.a);
    expect(a.provenance).toEqual({
      basis: 'EARLIEST_RECORDED_STATING_NAME_CLAIM',
      claimId: aName.id,
      source: {
        sourceRef: `url:${NOMINATION.url}|v=${nominationCitationDigestOf(NOMINATION)}`,
        sourceType: 'PUBLIC_URL',
        sourceUrl: NOMINATION.url,
        resolution: 'SOURCE_DISCOVERY_NOMINATION',
        resolvedRecordId: NOMINATION.id,
        sourceLicence: LICENCE_UNKNOWN,
        sourceRetrievedAt: NOMINATION.retrievedAt,
        ingestRun: { kind: 'SOURCE_DISCOVERY_RUN', id: NOMINATION.discoveryRunId },
      },
    });
    // The second claim cites a URL with no verified record: UNRESOLVED, never guessed.
    expect(a.nameClaims[1]!.source).toMatchObject({
      resolution: 'UNRESOLVED',
      ingestRun: null,
      sourceRetrievedAt: null,
    });
  });

  it('a nomination matching by URL but not by digest resolves nothing', () => {
    const d = facts(S.d);
    expect(d.nameClaims.find((n) => n.claimId === dKept.id)!.source.resolution).toBe('UNRESOLVED');
    expect(d.provenance?.source.ingestRun).toBeNull();
  });

  it('page evidence and website claim sources resolve to their own run and instant', () => {
    const b = facts(S.b);
    expect(b.nameClaims.find((n) => n.claimId === bName2.id)!.source).toMatchObject({
      resolution: 'PAGE_EVIDENCE',
      sourceUrl: 'https://dos.example.test/about',
      sourceRetrievedAt: '2026-10-23T10:00:00.000Z',
      ingestRun: { kind: 'ORGUNIT_RESEARCH_RUN', id: id(0x711) },
    });
    expect(b.websiteClaims.find((w) => w.claimId === bSite2.id)!.source).toMatchObject({
      resolution: 'WEBSITE_CLAIM',
      ingestRun: { kind: 'INGEST_RUN', id: id(0x811) },
    });
  });

  it('disagreeing claims are CONFLICTING: no name, no host, no provenance - never a winner', () => {
    const b = facts(S.b);
    expect(b.name).toEqual({ state: 'CONFLICTING', values: ['Ejemplo Dos', 'Ejemplo Uno'] });
    expect(b.websiteHost).toEqual({
      state: 'CONFLICTING',
      values: ['dos.example.test', 'uno.example.test'],
    });
    expect(b.provenance).toBeNull();
  });

  it('an INFERRED claim never names a subject; a negative subject review excludes everything', () => {
    const c = facts(S.c);
    expect(c.negativeReviewRecorded).toBe(true);
    expect(c.name).toEqual({ state: 'UNKNOWN' });
    expect(c.nameClaims.map((n) => n.excluded)).toEqual([
      'NEGATIVE_REVIEW_RECORDED',
      'NEGATIVE_REVIEW_RECORDED',
    ]);
    const inferredOnly = buildSubjectFactsDocument(
      {
        ...RECORDS,
        requestedSubjectIds: [S.c],
        subjects: [{ id: S.c, createdAt: T0 }],
        identityClaims: [cInferred],
        reviews: [],
      },
      'SYNTHETIC_IN_MEMORY',
    ).subjects[0]!;
    expect(inferredOnly.name).toEqual({ state: 'UNKNOWN' });
    expect(inferredOnly.nameClaims[0]!.excluded).toBe('BASIS_INFERRED');
  });

  it('a DISPUTED claim stays excluded even after a later CONFIRMED review', () => {
    const d = facts(S.d);
    expect(d.nameClaims.find((n) => n.claimId === dRejected.id)!.excluded).toBe(
      'NEGATIVE_REVIEW_RECORDED',
    );
    expect(d.name).toEqual({ state: 'STATED', text: '渋谷語学交流サークル', claimIds: [dKept.id] });
  });

  it('licence is the explicit UNKNOWN for every source kind', () => {
    const licences = doc.subjects.flatMap((s) =>
      [...s.nameClaims, ...s.websiteClaims].map((c) => c.source.sourceLicence),
    );
    expect(new Set(licences)).toEqual(new Set([LICENCE_UNKNOWN]));
  });
});

describe('the subject facts export: country and timestamps', () => {
  it('the country is ONLY an ADR 0024 country-of-operation claim', () => {
    expect(facts(S.a).claimedCountry).toBe('NL');
    // Two countries of operation: CONFLICTING under R4, so no country.
    expect(facts(S.b).jurisdiction.countryOfOperation).toEqual({
      state: 'CONFLICTING',
      values: ['MX', 'US'],
    });
    expect(facts(S.b).claimedCountry).toBeNull();
    // A Japanese name and a .jp website are never a country.
    expect(facts(S.d).jurisdiction.countryOfOperation).toEqual({ state: 'UNKNOWN' });
    expect(facts(S.d).claimedCountry).toBeNull();
  });

  it('created is the subject row; updated is the latest record about it', () => {
    expect(facts(S.a).engineCreatedAt).toBe(at(0));
    expect(facts(S.a).engineUpdatedAt).toBe(at(51));
    expect(facts(S.d).engineUpdatedAt).toBe(at(42));
  });
});

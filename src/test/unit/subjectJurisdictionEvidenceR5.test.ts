/**
 * Global R5 - the subject-jurisdiction evidence companion
 * (src/orgunits/subjectJurisdiction/evidence.ts) over three SYNTHETIC cases:
 *   1. a Japanese student association (no ECHE identity, recorded but
 *      unattested identity review);
 *   2. a Brazilian language association (multi-country, divergent and
 *      conflicting variants);
 *   3. a faculty of an existing French ECHE university (jurisdiction stays
 *      UNKNOWN; the ECHE row's country is never a source).
 * Every URL sits under the reserved `.example` top-level domain.
 *
 * Also builds the deterministic R5 fixture pack (B2.4 document + jurisdiction
 * companion per case) that the Operator consumes byte for byte, and proves
 * the committed pack is exactly what this tree produces. Regenerate with
 * `R5_WRITE_FIXTURE_PACK=1 npx vitest run src/test/unit/subjectJurisdictionEvidenceR5.test.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SUBJECT_EVIDENCE_CONTRACT } from '../../orgunits/subjectHandoff/contract.js';
import { projectSubjectEvidence } from '../../orgunits/subjectHandoff/project.js';
import {
  BOUND_DOCUMENT_KIND,
  JURISDICTION_EVIDENCE_CONTRACT,
  OPEN_QUESTIONS,
  PERMISSIONS,
  canonicalJson,
  projectJurisdictionEvidence,
  reproduceJurisdictionEvidence,
  type JurisdictionEvidenceResult,
} from '../../orgunits/subjectJurisdiction/evidence.js';
import {
  deriveJurisdictionStanding,
  jurisdictionProvenanceKeyOf,
} from '../../orgunits/subjectJurisdiction/standing.js';
import type { JurisdictionClaimRecord } from '../../orgunits/subjectJurisdiction/vocabulary.js';
import {
  graph,
  kindClaim,
  nameClaim,
  relation,
  review,
  subject,
  uid,
} from '../helpers/discoveryIdentityFixtures.js';

const PACK_PATH = resolve(process.cwd(), 'src/test/fixtures/globalR5/jurisdiction-pack.json');
const PRODUCED_AT = '2026-10-19T12:00:00.000Z';
const ENV = '11111111-0000-4000-8000-000000000005';
/** Informational source revision recorded in the pack: the R5 base (R4 pin commit). */
const R5_BASE = '6c793c53cb293c6fa9410b6d382673f337b59fee';

/**
 * A synthetic French ECHE source-row key. `XF SYNTH01` is X-prefixed: ISO 3166 reserves X codes
 * for user assignment and no Erasmus code uses one, so it can never name a real row.
 */
export const ECHE_FR_UNIVERSITY = 'XF SYNTH01|900000501';

const JP = 0x5a1;
const BR = 0x5b1;
const FR = 0x5c1;

let next = 0;
function jclaim(subjectN: number, over: Partial<JurisdictionClaimRecord>): JurisdictionClaimRecord {
  next += 1;
  return {
    id: uid(0x5f000 + next),
    subjectId: uid(subjectN),
    claimKind: 'COUNTRY_OF_OPERATION',
    claimedCountry: 'JP',
    claimedLegalForm: null,
    sourceType: 'PUBLIC_URL',
    sourcePageEvidenceId: null,
    sourceWebsiteClaimId: null,
    sourceUrl: 'https://synthetic-r5-jp.example/about',
    sourceVersionRef: 'a'.repeat(64),
    observedAt: '2026-10-19T09:00:00.000Z',
    claimBasis: 'SOURCE_STATED',
    recordedByActorKey: 'owner-cli',
    ...over,
  };
}

function ctx(subjectN: number, digest: string | null, over: Record<string, unknown> = {}) {
  return {
    contract: JURISDICTION_EVIDENCE_CONTRACT,
    subjectId: uid(subjectN),
    subjectEvidenceDocumentDigest: digest,
    sourceRepository: 'nwf-partnership-engine',
    sourceRevision: null,
    readConsistency: 'SYNTHETIC_IN_MEMORY',
    producedAt: PRODUCED_AT,
    ...over,
  };
}

function projected(result: JurisdictionEvidenceResult) {
  if (result.outcome !== 'PROJECTED') throw new Error(`refused: ${result.code} ${result.detail}`);
  return result;
}

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const reading = (r: JurisdictionEvidenceResult): Json =>
  (projected(r).document.reading as Json) ?? null;

// ------------------------------------------------------------ the three cases

const JP_CLAIMS = [
  jclaim(JP, { claimedCountry: 'JP' }),
  jclaim(JP, {
    claimKind: 'LEGAL_FORM',
    claimedCountry: null,
    claimedLegalForm: 'UNREGISTERED_INFORMAL_GROUP',
  }),
];
const BR_SITE = 'https://synthetic-r5-br.example/quem-somos';
const BR_STATUTE = 'https://synthetic-r5-br.example/estatuto';
const BR_CLAIMS = [
  jclaim(BR, { claimedCountry: 'BR', sourceUrl: BR_SITE, sourceVersionRef: 'b'.repeat(64) }),
  jclaim(BR, { claimedCountry: 'PT', sourceUrl: BR_SITE, sourceVersionRef: 'b'.repeat(64) }),
  jclaim(BR, {
    claimKind: 'COUNTRY_OF_REGISTRATION',
    claimedCountry: 'BR',
    sourceUrl: BR_STATUTE,
    sourceVersionRef: 'c'.repeat(64),
  }),
  jclaim(BR, {
    claimKind: 'LEGAL_FORM',
    claimedCountry: null,
    claimedLegalForm: 'REGISTERED_LEGAL_ENTITY',
    sourceUrl: BR_STATUTE,
    sourceVersionRef: 'c'.repeat(64),
  }),
];

function subjectGraphs() {
  return {
    [JP]: {
      focalSubjectId: uid(JP),
      input: graph({
        subjects: [subject(JP, 'INDEPENDENT_STUDENT_ASSOCIATION')],
        identityClaims: [
          nameClaim(JP + 1, JP, 'Synthetic Tokyo International Student Association', {
            src: 'r5-jp-about',
          }),
          nameClaim(JP + 2, JP, '合成東京国際学生会', {
            kind: 'NATIVE_NAME',
            language: 'ja',
            src: 'r5-jp-about',
          }),
          kindClaim(JP + 3, JP, 'INDEPENDENT_STUDENT_ASSOCIATION'),
        ],
        // A RECORDED B2.1 review, deliberately without a B2.3 attestation: it
        // stays NOT_CONFIRMED under operational trust (no OWNER key exists).
        reviews: [review(JP + 4, { subject: JP }, 'CONFIRMED')],
        knownEcheRowKeys: [],
      }),
      recordedAt: {},
      // Attestations WERE loaded, and there are none for the recorded review.
      attestations: { environmentId: ENV, records: [], nonceUseCounts: {} },
    },
    [BR]: {
      focalSubjectId: uid(BR),
      input: graph({
        subjects: [subject(BR, 'INDEPENDENT_COMMUNITY')],
        identityClaims: [
          nameClaim(BR + 1, BR, 'Associação Sintética de Línguas', {
            kind: 'NATIVE_NAME',
            language: 'pt-BR',
            src: 'r5-br-quem-somos',
          }),
          nameClaim(BR + 2, BR, 'Synthetic Language Association', { src: 'r5-br-quem-somos' }),
        ],
        knownEcheRowKeys: [],
      }),
      recordedAt: {},
    },
    [FR]: {
      focalSubjectId: uid(FR),
      input: graph({
        subjects: [subject(FR, 'FACULTY_SCHOOL_DEPARTMENT')],
        identityClaims: [nameClaim(FR + 1, FR, 'Faculté synthétique des langues')],
        relationshipClaims: [relation(FR + 2, FR, 'PART_OF', { eche: ECHE_FR_UNIVERSITY })],
        knownEcheRowKeys: [ECHE_FR_UNIVERSITY],
      }),
      recordedAt: {},
    },
  };
}

function subjectEvidence(subjectN: number) {
  const g = subjectGraphs()[subjectN as typeof JP]!;
  const result = projectSubjectEvidence(g, {
    contract: SUBJECT_EVIDENCE_CONTRACT,
    subjectId: uid(subjectN),
    sourceRepository: 'nwf-partnership-engine',
    sourceRevision: null,
    engineEnvironmentId: ENV,
    readConsistency: 'SYNTHETIC_IN_MEMORY',
    neighbourhood: 'BOUNDED_NEIGHBOURHOOD_LOADED',
    producedAt: PRODUCED_AT,
    authorityScope: 'OPERATIONAL',
  });
  if (result.outcome !== 'PROJECTED') throw new Error(`B2.4 refused: ${result.code}`);
  return result;
}

function caseOf(caseId: string, subjectN: number, claims: readonly JurisdictionClaimRecord[]) {
  const evidence = subjectEvidence(subjectN);
  const jurisdiction = projected(
    projectJurisdictionEvidence(claims, ctx(subjectN, evidence.documentDigest)),
  );
  return {
    caseId,
    subjectEvidence: { document: evidence.document, documentDigest: evidence.documentDigest },
    jurisdiction: {
      document: jurisdiction.document,
      documentDigest: jurisdiction.documentDigest,
    },
  };
}

function pack() {
  return {
    pack: 'nwf-pe.global-r5.synthetic-fixture-pack.v1',
    syntheticOnly: true,
    engineBaseRevision: R5_BASE,
    subjectEvidenceContract: SUBJECT_EVIDENCE_CONTRACT,
    jurisdictionEvidenceContract: JURISDICTION_EVIDENCE_CONTRACT,
    cases: [
      caseOf('JP_STUDENT_ASSOCIATION', JP, JP_CLAIMS),
      caseOf('BR_LANGUAGE_ASSOCIATION', BR, BR_CLAIMS),
      caseOf('FR_ECHE_UNIVERSITY_FACULTY', FR, []),
    ],
  };
}

// ------------------------------------------------------------ tests

describe('R5 contract surface', () => {
  it('binds to the B2.4 document by a label and a digest, never by naming its contract', () => {
    expect(BOUND_DOCUMENT_KIND).toBe('B2_4_SUBJECT_EVIDENCE');
    expect(BOUND_DOCUMENT_KIND).not.toContain(SUBJECT_EVIDENCE_CONTRACT);
  });

  it('grants nothing: every capability is the literal NONE', () => {
    expect(Object.values(PERMISSIONS)).toEqual(Object.values(PERMISSIONS).map(() => 'NONE'));
    expect(Object.keys(PERMISSIONS)).toEqual(
      expect.arrayContaining([
        'canonicalIssuance',
        'memberRelease',
        'outreach',
        'contactPermission',
      ]),
    );
  });
});

describe('R5 case 1: a Japanese student association', () => {
  const r = projectJurisdictionEvidence(JP_CLAIMS, ctx(JP, null));

  it('states JP operation and an informal group from one source; registration stays UNKNOWN', () => {
    expect(reading(r)).toEqual({
      countryOfOperation: {
        state: 'SINGLE_COUNTRY_STATED',
        countries: [{ value: 'JP', provenanceKeys: [jurisdictionProvenanceKeyOf(JP_CLAIMS[0]!)] }],
      },
      countryOfRegistration: { state: 'UNKNOWN' },
      legalForm: {
        state: 'STATED',
        values: [
          {
            value: 'UNREGISTERED_INFORMAL_GROUP',
            provenanceKeys: [jurisdictionProvenanceKeyOf(JP_CLAIMS[1]!)],
          },
        ],
      },
    });
    expect(projected(r).document.openQuestions).toEqual([]);
    expect(projected(r).document.review).toEqual({
      state: 'UNREVIEWED',
      authority: 'NONE_ASSIGNED',
    });
  });

  it('carries no ECHE identifier of any kind', () => {
    const bytes = projected(r).canonical;
    expect(bytes).not.toMatch(/\|[0-9]{9}"|erasmus|"pic"|eche_row_key|echeRowKey|country_code/i);
  });
});

describe('R5 case 2: a Brazilian language association - multi-country is not a conflict', () => {
  it('ONE source stating BR and PT is a source-stated multi-country operation, still unreviewed', () => {
    const r = projectJurisdictionEvidence(BR_CLAIMS, ctx(BR, null));
    const site = jurisdictionProvenanceKeyOf(BR_CLAIMS[0]!);
    expect(reading(r).countryOfOperation).toEqual({
      state: 'MULTI_COUNTRY_SOURCE_STATED',
      countries: [
        { value: 'BR', provenanceKeys: [site] },
        { value: 'PT', provenanceKeys: [site] },
      ],
      coStatingProvenanceKeys: [site],
    });
    expect(reading(r).countryOfRegistration.state).toBe('STATED');
    expect(reading(r).legalForm.values[0].value).toBe('REGISTERED_LEGAL_ENTITY');
    expect(projected(r).document.openQuestions).toEqual([
      'COUNTRY_OF_OPERATION_MULTI_COUNTRY_UNREVIEWED',
    ]);
    // R4's standing over the same claims still says CONFLICTING: R5 refines, never edits it.
    expect(deriveJurisdictionStanding(uid(BR), BR_CLAIMS).countryOfOperation.state).toBe(
      'CONFLICTING',
    );
  });

  it('two sources naming different single countries diverge, and nothing is concluded', () => {
    const claims = [
      jclaim(BR, { claimedCountry: 'BR', sourceUrl: BR_SITE }),
      jclaim(BR, { claimedCountry: 'AR', sourceUrl: 'https://synthetic-r5-ar.example/sobre' }),
    ];
    const r = projectJurisdictionEvidence(claims, ctx(BR, null));
    expect(reading(r).countryOfOperation.state).toBe('DIVERGENT_UNRESOLVED');
    expect(reading(r).countryOfOperation.countries.map((c: Json) => c.value)).toEqual(['AR', 'BR']);
    expect(projected(r).document.openQuestions).toEqual(['COUNTRY_OF_OPERATION_DIVERGENT']);
  });

  it('a multi-country source plus a partial source stays multi-country; an uncovered country diverges', () => {
    const covering = [
      ...BR_CLAIMS.slice(0, 2),
      jclaim(BR, { claimedCountry: 'BR', sourceUrl: 'https://synthetic-r5-br.example/contato' }),
    ];
    expect(
      reading(projectJurisdictionEvidence(covering, ctx(BR, null))).countryOfOperation.state,
    ).toBe('MULTI_COUNTRY_SOURCE_STATED');
    const uncovered = [
      ...BR_CLAIMS.slice(0, 2),
      jclaim(BR, { claimedCountry: 'AO', sourceUrl: 'https://synthetic-r5-ao.example/' }),
    ];
    expect(
      reading(projectJurisdictionEvidence(uncovered, ctx(BR, null))).countryOfOperation.state,
    ).toBe('DIVERGENT_UNRESOLVED');
  });

  it('two registration countries or two legal forms CONFLICT, with every source kept', () => {
    const claims = [
      ...BR_CLAIMS,
      jclaim(BR, {
        claimKind: 'COUNTRY_OF_REGISTRATION',
        claimedCountry: 'PT',
        sourceUrl: 'https://synthetic-r5-pt.example/registo',
      }),
      jclaim(BR, {
        claimKind: 'LEGAL_FORM',
        claimedCountry: null,
        claimedLegalForm: 'UNIT_OF_LARGER_ENTITY',
        sourceUrl: 'https://synthetic-r5-pt.example/registo',
      }),
    ];
    const r = projectJurisdictionEvidence(claims, ctx(BR, null));
    expect(reading(r).countryOfRegistration.state).toBe('CONFLICTING');
    expect(reading(r).countryOfRegistration.values.map((v: Json) => v.value)).toEqual(['BR', 'PT']);
    expect(reading(r).legalForm.state).toBe('CONFLICTING');
    expect(projected(r).document.openQuestions).toEqual([
      'COUNTRY_OF_OPERATION_MULTI_COUNTRY_UNREVIEWED',
      'COUNTRY_OF_REGISTRATION_CONFLICTING',
      'LEGAL_FORM_CONFLICTING',
    ]);
  });
});

describe('R5 case 3: a faculty of an existing French ECHE university', () => {
  it('with no jurisdiction claim, every dimension is UNKNOWN - never FR, never inherited', () => {
    const r = projected(projectJurisdictionEvidence([], ctx(FR, null)));
    expect(r.document.reading).toEqual({
      countryOfOperation: { state: 'UNKNOWN' },
      countryOfRegistration: { state: 'UNKNOWN' },
      legalForm: { state: 'UNKNOWN' },
    });
    expect(r.canonical).not.toContain(ECHE_FR_UNIVERSITY);
    expect(r.canonical).not.toMatch(/"FR"/);
  });

  it('refuses claims about any other subject (e.g. the PART_OF target) instead of inheriting them', () => {
    const r = projectJurisdictionEvidence([jclaim(JP, { claimedCountry: 'FR' })], ctx(FR, null));
    expect(r).toMatchObject({ outcome: 'REFUSED', code: 'SUBJECT_IDENTIFIER_INCONSISTENT' });
  });
});

describe('R5 integrity', () => {
  it('excludes an invalid claim, never repairs it, and raises an open question', () => {
    const bad = jclaim(JP, { claimedCountry: 'XK' });
    const r = projected(projectJurisdictionEvidence([...JP_CLAIMS, bad], ctx(JP, null)));
    expect(r.document.excluded).toEqual([{ claimId: bad.id, findings: ['COUNTRY_NOT_ASSIGNED'] }]);
    expect(r.document.openQuestions).toEqual(['CLAIMS_EXCLUDED_AS_INVALID']);
    expect((r.document.reading as Json).countryOfOperation.state).toBe('SINGLE_COUNTRY_STATED');
  });

  it.each([
    ['extra context key', JP_CLAIMS, ctx(JP, null, { locale: 'ja-JP' }), 'CONTEXT_SHAPE_INVALID'],
    ['bad digest', JP_CLAIMS, ctx(JP, 'ABC'), 'CONTEXT_SHAPE_INVALID'],
    ['wrong contract', JP_CLAIMS, ctx(JP, null, { contract: 'x' }), 'CONTRACT_UNKNOWN'],
    ['duplicate id', [JP_CLAIMS[0], JP_CLAIMS[0]], ctx(JP, null), 'DUPLICATE_CLAIM_ID'],
    [
      'extra claim key',
      [{ ...JP_CLAIMS[0], email: null }],
      ctx(JP, null),
      'CLAIM_SHAPE_UNSUPPORTED',
    ],
    [
      'numeric field',
      [{ ...JP_CLAIMS[0], sourceUrl: 7 }],
      ctx(JP, null),
      'CLAIM_SHAPE_UNSUPPORTED',
    ],
    ['not an array', { claims: [] }, ctx(JP, null), 'CLAIM_SHAPE_UNSUPPORTED'],
  ])('refuses %s', (_label, claims, context, code) => {
    expect(projectJurisdictionEvidence(claims, context)).toMatchObject({
      outcome: 'REFUSED',
      code,
    });
  });

  it('is order-independent and reproducible; any edit fails reproduction', () => {
    const a = projected(projectJurisdictionEvidence(BR_CLAIMS, ctx(BR, null)));
    const b = projected(projectJurisdictionEvidence([...BR_CLAIMS].reverse(), ctx(BR, null)));
    expect(b.canonical).toBe(a.canonical);
    expect(reproduceJurisdictionEvidence(a.document)).toEqual({
      state: 'REPRODUCED',
      documentDigest: a.documentDigest,
    });
    const doc = JSON.parse(a.canonical) as Json;
    for (const edit of [
      (d: Json) => (d.openQuestions = []),
      (d: Json) => (d.reading.countryOfOperation.state = 'SINGLE_COUNTRY_STATED'),
      (d: Json) => (d.permissions.outreach = 'ALLOWED'),
      (d: Json) => (d.review.state = 'REVIEWED'),
      (d: Json) => d.claims.pop(),
    ]) {
      const tampered = structuredClone(doc);
      edit(tampered);
      expect(reproduceJurisdictionEvidence(tampered).state).toBe('NOT_REPRODUCIBLE');
    }
  });

  it('declares only the closed open-question vocabulary', () => {
    expect([...OPEN_QUESTIONS].sort()).toEqual([...OPEN_QUESTIONS]);
  });
});

describe('R5 fixture pack (the Engine half of the Operator vertical slice)', () => {
  const built = `${canonicalJson(pack())}\n`;

  if (process.env['R5_WRITE_FIXTURE_PACK'] === '1') writeFileSync(PACK_PATH, built, 'utf8');

  it('the committed pack is exactly what this tree produces', () => {
    expect(readFileSync(PACK_PATH, 'utf8')).toBe(built);
  });

  it('binds each jurisdiction companion to its own B2.4 document digest', () => {
    for (const c of pack().cases) {
      const subject = c.jurisdiction.document.subject as Json;
      expect(subject.subjectEvidenceDocumentDigest).toBe(c.subjectEvidence.documentDigest);
      expect(subject.discoverySubjectId).toBe(
        (c.subjectEvidence.document.source as Json).discoverySubjectId,
      );
      expect(reproduceJurisdictionEvidence(c.jurisdiction.document).state).toBe('REPRODUCED');
    }
  });

  it('non-ECHE cases carry no ECHE key anywhere; the French case only in its own B2.4 records', () => {
    const [jp, br, fr] = pack().cases;
    for (const c of [jp!, br!]) expect(canonicalJson(c)).not.toMatch(/\|[0-9]{9}"/);
    expect(canonicalJson(fr!.subjectEvidence.document)).toContain(ECHE_FR_UNIVERSITY);
    expect(canonicalJson(fr!.jurisdiction.document)).not.toContain(ECHE_FR_UNIVERSITY);
  });
});

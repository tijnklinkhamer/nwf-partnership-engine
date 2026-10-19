/**
 * Global Foundation R4 - the pure jurisdiction vocabulary, validator and
 * derived standing (src/orgunits/subjectJurisdiction/), against migration
 * 0016 and three SYNTHETIC organisations: a Japanese student association, a
 * Brazilian language organisation and a French ECHE university's faculty.
 * Every URL sits under the reserved `.example` top-level domain.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  deriveJurisdictionStanding,
  jurisdictionProvenanceKeyOf,
  validateJurisdictionClaim,
} from '../../orgunits/subjectJurisdiction/standing.js';
import {
  ISO_3166_1_ALPHA2_ASSIGNED,
  ISO_3166_1_ALPHA2_LIST_SHA256,
  JURISDICTION_CLAIM_KINDS,
  LEGAL_FORMS,
  isAssignedIso3166Alpha2,
  type JurisdictionClaimRecord,
} from '../../orgunits/subjectJurisdiction/vocabulary.js';

const MIGRATION = readFileSync(
  resolve(process.cwd(), 'migrations/0016_subject_jurisdiction_claims.sql'),
  'utf8',
);

const JP_ASSOCIATION = '00000000-0000-4000-8000-0000000004a1';
const BR_LANGUAGE_ORG = '00000000-0000-4000-8000-0000000004b1';
const FR_FACULTY = '00000000-0000-4000-8000-0000000004c1';

let next = 0;
function claim(overrides: Partial<JurisdictionClaimRecord>): JurisdictionClaimRecord {
  next += 1;
  return {
    id: `00000000-0000-4000-8000-${(0x4f000 + next).toString(16).padStart(12, '0')}`,
    subjectId: JP_ASSOCIATION,
    claimKind: 'COUNTRY_OF_OPERATION',
    claimedCountry: 'JP',
    claimedLegalForm: null,
    sourceType: 'PUBLIC_URL',
    sourcePageEvidenceId: null,
    sourceWebsiteClaimId: null,
    sourceUrl: 'https://synthetic-r4-jp.example/about',
    sourceVersionRef: 'a'.repeat(64),
    observedAt: '2026-10-19T09:00:00.000Z',
    claimBasis: 'SOURCE_STATED',
    recordedByActorKey: 'owner-cli',
    ...overrides,
  };
}

describe('R4 vocabulary mirrors migration 0016', () => {
  it('holds exactly the 249 assigned ISO 3166-1 alpha-2 codes, sorted, unique, hashed as recorded', () => {
    expect(ISO_3166_1_ALPHA2_ASSIGNED).toHaveLength(249);
    expect([...ISO_3166_1_ALPHA2_ASSIGNED].sort()).toEqual([...ISO_3166_1_ALPHA2_ASSIGNED]);
    expect(new Set(ISO_3166_1_ALPHA2_ASSIGNED).size).toBe(249);
    const digest = createHash('sha256')
      .update(ISO_3166_1_ALPHA2_ASSIGNED.map((c) => `${c},`).join(''), 'utf8')
      .digest('hex');
    expect(digest).toBe(ISO_3166_1_ALPHA2_LIST_SHA256);
    expect(MIGRATION).toContain(ISO_3166_1_ALPHA2_LIST_SHA256);
  });

  it('uses the same code list as the SQL predicate, value for value', () => {
    const body = /ARRAY\[([\s\S]*?)\]::text\[\]/.exec(MIGRATION)?.[1] ?? '';
    const sqlCodes = [...body.matchAll(/'([A-Z]{2})'/g)].map((m) => m[1]);
    expect(sqlCodes).toEqual([...ISO_3166_1_ALPHA2_ASSIGNED]);
  });

  it('uses the same claim kinds and legal forms as the SQL CHECKs', () => {
    for (const kind of JURISDICTION_CLAIM_KINDS) expect(MIGRATION).toContain(`'${kind}'`);
    for (const form of LEGAL_FORMS) expect(MIGRATION).toContain(`'${form}'`);
    expect(MIGRATION).toMatch(/CHECK \(claim_basis = 'SOURCE_STATED'\)/);
  });

  it('refuses user-assigned, reserved and lower-case codes', () => {
    for (const ok of ['JP', 'BR', 'FR', 'GB', 'NA']) expect(isAssignedIso3166Alpha2(ok)).toBe(true);
    for (const bad of ['XK', 'EU', 'UK', 'ZZ', 'AA', 'QM', 'XA', 'jp', 'Jp', 'JPN', '', ' JP']) {
      expect(isAssignedIso3166Alpha2(bad), bad).toBe(false);
    }
  });
});

describe('R4 validateJurisdictionClaim mirrors the CHECKs', () => {
  it('admits a well-formed source-stated claim', () => {
    expect(validateJurisdictionClaim(claim({}))).toEqual([]);
    expect(
      validateJurisdictionClaim(
        claim({
          claimKind: 'LEGAL_FORM',
          claimedCountry: null,
          claimedLegalForm: 'UNREGISTERED_INFORMAL_GROUP',
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    [{ claimedCountry: 'XK' }, 'COUNTRY_NOT_ASSIGNED'],
    [{ claimedCountry: 'jp' }, 'COUNTRY_NOT_ASSIGNED'],
    [{ claimedCountry: null }, 'PAYLOAD_MISMATCH'],
    [{ claimedLegalForm: 'REGISTERED_LEGAL_ENTITY' }, 'PAYLOAD_MISMATCH'],
    [
      { claimKind: 'LEGAL_FORM', claimedCountry: null, claimedLegalForm: 'NGO' },
      'LEGAL_FORM_UNKNOWN',
    ],
    [{ claimKind: 'NATIONALITY' }, 'CLAIM_KIND_UNKNOWN'],
    [{ claimBasis: 'INFERRED' }, 'BASIS_NOT_SOURCE_STATED'],
    [{ sourceUrl: null }, 'SOURCE_SHAPE'],
    [{ sourceType: 'OWNER_MEMORY' }, 'SOURCE_SHAPE'],
    [{ sourceVersionRef: 'ABC' }, 'SOURCE_VERSION_SHAPE'],
    [{ recordedByActorKey: 'Jane Doe' }, 'ACTOR_KEY_SHAPE'],
  ] as const)('refuses %j with %s', (overrides, code) => {
    expect(
      validateJurisdictionClaim(claim(overrides as unknown as Partial<JurisdictionClaimRecord>)),
    ).toContain(code);
  });
});

describe('R4 deriveJurisdictionStanding over synthetic worldwide organisations', () => {
  const jpOperation = claim({ subjectId: JP_ASSOCIATION, claimedCountry: 'JP' });
  const jpForm = claim({
    subjectId: JP_ASSOCIATION,
    claimKind: 'LEGAL_FORM',
    claimedCountry: null,
    claimedLegalForm: 'UNREGISTERED_INFORMAL_GROUP',
  });
  const brOperation = claim({
    subjectId: BR_LANGUAGE_ORG,
    claimedCountry: 'BR',
    sourceUrl: 'https://synthetic-r4-br.example/quem-somos',
  });
  const brRegistration = claim({
    subjectId: BR_LANGUAGE_ORG,
    claimKind: 'COUNTRY_OF_REGISTRATION',
    claimedCountry: 'BR',
    sourceUrl: 'https://synthetic-r4-br.example/estatuto',
  });
  const brForm = claim({
    subjectId: BR_LANGUAGE_ORG,
    claimKind: 'LEGAL_FORM',
    claimedCountry: null,
    claimedLegalForm: 'REGISTERED_LEGAL_ENTITY',
    sourceUrl: 'https://synthetic-r4-br.example/estatuto',
  });
  const all = [jpOperation, jpForm, brOperation, brRegistration, brForm];

  it('a Japanese student association: operation JP, registration UNKNOWN, informal group', () => {
    const standing = deriveJurisdictionStanding(JP_ASSOCIATION, all);
    expect(standing.countryOfOperation).toEqual({
      state: 'STATED',
      value: 'JP',
      provenanceKeys: [jurisdictionProvenanceKeyOf(jpOperation)],
    });
    expect(standing.countryOfRegistration).toEqual({ state: 'UNKNOWN' });
    expect(standing.legalForm).toMatchObject({
      state: 'STATED',
      value: 'UNREGISTERED_INFORMAL_GROUP',
    });
    expect(standing.excludedClaimIds).toEqual([]);
  });

  it('a Brazilian language organisation: operation and registration BR, registered entity', () => {
    const standing = deriveJurisdictionStanding(BR_LANGUAGE_ORG, all);
    expect(standing.countryOfOperation).toMatchObject({ state: 'STATED', value: 'BR' });
    expect(standing.countryOfRegistration).toMatchObject({ state: 'STATED', value: 'BR' });
    expect(standing.legalForm).toMatchObject({ state: 'STATED', value: 'REGISTERED_LEGAL_ENTITY' });
  });

  it('a French ECHE faculty with no claim of its own is UNKNOWN - never defaulted, never inherited', () => {
    // The faculty may be PART_OF an ECHE row whose Country Cd is FR; that is
    // the ECHE row's attribute, not a source statement about this subject.
    const standing = deriveJurisdictionStanding(FR_FACULTY, all);
    expect(standing.countryOfOperation).toEqual({ state: 'UNKNOWN' });
    expect(standing.countryOfRegistration).toEqual({ state: 'UNKNOWN' });
    expect(standing.legalForm).toEqual({ state: 'UNKNOWN' });
  });

  it('keeps disagreeing sources CONFLICTING and never picks a winner', () => {
    const second = claim({
      subjectId: JP_ASSOCIATION,
      claimedCountry: 'KR',
      sourceUrl: 'https://synthetic-r4-other.example/listing',
    });
    expect(
      deriveJurisdictionStanding(JP_ASSOCIATION, [jpOperation, second]).countryOfOperation,
    ).toEqual({
      state: 'CONFLICTING',
      values: ['JP', 'KR'],
    });
  });

  it('excludes - never repairs - an invalid record, and reports it', () => {
    const inferred = claim({
      subjectId: JP_ASSOCIATION,
      claimBasis: 'INFERRED',
      claimedCountry: 'CN',
    });
    const standing = deriveJurisdictionStanding(JP_ASSOCIATION, [jpOperation, inferred]);
    expect(standing.countryOfOperation).toMatchObject({ state: 'STATED', value: 'JP' });
    expect(standing.excludedClaimIds).toEqual([inferred.id]);
  });

  it('carries no permission, eligibility, contact or outreach field at any depth', () => {
    const json = JSON.stringify(all.map((c) => deriveJurisdictionStanding(c.subjectId, all)));
    expect(json).not.toMatch(/permi|eligib|contact|consent|outreach|lawful|allowed|qualif/i);
  });
});

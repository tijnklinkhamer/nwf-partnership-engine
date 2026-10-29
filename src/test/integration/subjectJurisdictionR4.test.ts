/**
 * Global Foundation R4 - migration 0016 against REAL PostgreSQL (nwf_pe_test only).
 *
 * Proves, with SYNTHETIC rows only (reserved `.example` hosts, `X TEST01`
 * ECHE key):
 *   - a Japanese student association and a Brazilian language organisation
 *     are representable as discovery subjects with source-stated country and
 *     legal-form evidence, no ECHE identity and no fabricated identifier;
 *   - a French ECHE university's faculty keeps UNKNOWN jurisdiction: the ECHE
 *     row's Country Cd is never copied, defaulted or inherited;
 *   - the database refuses unassigned codes, inferred countries, malformed
 *     payloads, social-platform sources and unattributed rows;
 *   - the table is append-only for every role, and no runtime role can write;
 *   - ECHE organisations and website claims are byte-identical before and
 *     after jurisdiction evidence is recorded.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';

import { deriveJurisdictionStanding } from '../../orgunits/subjectJurisdiction/standing.js';
import type { JurisdictionClaimRecord } from '../../orgunits/subjectJurisdiction/vocabulary.js';
import {
  adminPool,
  classifierDatabaseConfigured,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
} from './helpers.js';

const describeDb =
  classifierDatabaseConfigured() && researchDatabaseConfigured() ? describe : describe.skip;

const MIGRATION_FILE = '0016_subject_jurisdiction_claims.sql';
const INSUFFICIENT_PRIVILEGE = '42501';
const APPEND_ONLY = '55000';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
// A missing payload value nulls the GENERATED value_key, which refuses first.
const NOT_NULL_VIOLATION = '23502';
const FOREIGN_KEY_VIOLATION = '23503';
const RUNTIME_ROLES = [
  'nwf_ingest',
  'nwf_research',
  'nwf_classifier',
  'nwf_readonly',
  'nwf_discovery_subject_writer',
  'nwf_discovery_subject_reviewer',
] as const;

async function expectCode(fn: () => Promise<unknown>, ...accepted: string[]): Promise<void> {
  try {
    await fn();
  } catch (err) {
    expect(accepted).toContain((err as { code?: string }).code);
    return;
  }
  throw new Error(`Expected SQLSTATE ${accepted.join('/')}, but the statement succeeded.`);
}

interface ClaimInput {
  kind?: string;
  country?: string | null;
  legalForm?: string | null;
  url?: string;
  version?: string | null;
  basis?: string;
  actor?: string;
}

describeDb('R4 migration 0016 - worldwide subject jurisdiction claims (integration)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let readonly: pg.Pool;
  let echeRowKey: string;
  let jpAssociation: string;
  let brLanguageOrg: string;
  let frFaculty: string;

  async function insertSubject(kind: string): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO discovery_subjects (registered_kind, registered_by_actor_key)
       VALUES ($1, 'owner-cli') RETURNING id`,
      [kind],
    );
    return rows[0]!.id;
  }

  async function insertIdentity(
    subjectId: string,
    claimKind: string,
    values: Record<string, string>,
    url: string,
  ): Promise<void> {
    const columns = Object.keys(values);
    await admin.query(
      `INSERT INTO discovery_subject_identity_claims
         (subject_id, claim_kind, ${columns.join(', ')}, source_type, source_url,
          observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, ${columns.map((_, i) => `$${i + 4}`).join(', ')}, 'PUBLIC_URL', $3,
               '2026-10-19T09:00:00Z', 'SOURCE_STATED', 'owner-cli')`,
      [subjectId, claimKind, url, ...Object.values(values)],
    );
  }

  async function insertJurisdiction(
    target: pg.Pool | pg.PoolClient,
    subjectId: string,
    input: ClaimInput,
  ): Promise<string> {
    const kind = input.kind ?? 'COUNTRY_OF_OPERATION';
    const { rows } = await target.query<{ id: string }>(
      `INSERT INTO subject_jurisdiction_claims
         (subject_id, claim_kind, claimed_country, claimed_legal_form, source_type,
          source_url, source_version_ref, observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, $3, $4, 'PUBLIC_URL', $5, $6, '2026-10-19T09:00:00Z', $7, $8)
       RETURNING id`,
      [
        subjectId,
        kind,
        input.country === undefined ? (kind === 'LEGAL_FORM' ? null : 'JP') : input.country,
        input.legalForm ?? null,
        input.url ?? 'https://synthetic-r4-jp.example/about',
        input.version === undefined ? 'a'.repeat(64) : input.version,
        input.basis ?? 'SOURCE_STATED',
        input.actor ?? 'owner-cli',
      ],
    );
    return rows[0]!.id;
  }

  async function readClaims(): Promise<JurisdictionClaimRecord[]> {
    const { rows } = await readonly.query<{
      id: string;
      subject_id: string;
      claim_kind: JurisdictionClaimRecord['claimKind'];
      claimed_country: string | null;
      claimed_legal_form: string | null;
      source_type: JurisdictionClaimRecord['sourceType'];
      source_page_evidence_id: string | null;
      source_website_claim_id: string | null;
      source_url: string | null;
      source_version_ref: string | null;
      observed_at: Date;
      claim_basis: string;
      recorded_by_actor_key: string;
    }>(`SELECT * FROM subject_jurisdiction_claims ORDER BY id`);
    return rows.map((r) => ({
      id: r.id,
      subjectId: r.subject_id,
      claimKind: r.claim_kind,
      claimedCountry: r.claimed_country,
      claimedLegalForm: r.claimed_legal_form,
      sourceType: r.source_type,
      sourcePageEvidenceId: r.source_page_evidence_id,
      sourceWebsiteClaimId: r.source_website_claim_id,
      sourceUrl: r.source_url,
      sourceVersionRef: r.source_version_ref,
      observedAt: r.observed_at.toISOString(),
      claimBasis: r.claim_basis,
      recordedByActorKey: r.recorded_by_actor_key,
    }));
  }

  async function echeDigest(): Promise<string> {
    const { rows } = await admin.query<{ row: string }>(
      `SELECT o::text AS row FROM organisations o
       UNION ALL SELECT w::text FROM website_claims w
       ORDER BY 1`,
    );
    return createHash('sha256')
      .update(rows.map((r) => r.row).join('\n'), 'utf8')
      .digest('hex');
  }

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    // The French ECHE university: an ECHE source row (Country Cd FR) and its
    // website claim, exactly as Phase 1A/1D would have stored them.
    echeRowKey = (await seedOrgunitRoot(admin)).echeRowKey;

    jpAssociation = await insertSubject('INDEPENDENT_STUDENT_ASSOCIATION');
    await insertIdentity(
      jpAssociation,
      'NAME',
      { name_text: 'Synthetic Tokyo Language Exchange Circle' },
      'https://synthetic-r4-jp.example/about',
    );
    await insertIdentity(
      jpAssociation,
      'NATIVE_NAME',
      { name_text: '合成言語交換サークル', name_language: 'ja' },
      'https://synthetic-r4-jp.example/about',
    );
    await insertIdentity(
      jpAssociation,
      'PUBLIC_WEBSITE',
      { website_url: 'https://synthetic-r4-jp.example/' },
      'https://synthetic-r4-jp.example/about',
    );

    brLanguageOrg = await insertSubject('INDEPENDENT_COMMUNITY');
    await insertIdentity(
      brLanguageOrg,
      'NATIVE_NAME',
      { name_text: 'Associação Sintética de Idiomas', name_language: 'pt-BR' },
      'https://synthetic-r4-br.example/quem-somos',
    );

    frFaculty = await insertSubject('FACULTY_SCHOOL_DEPARTMENT');
    await admin.query(
      `INSERT INTO discovery_subject_relationship_claims
         (subject_id, predicate, target_eche_row_key, source_type, source_url,
          observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, 'PART_OF', $2, 'PUBLIC_URL', 'https://synthetic-r4-fr.example/facultes',
               '2026-10-19T09:00:00Z', 'SOURCE_STATED', 'owner-cli')`,
      [frFaculty, echeRowKey],
    );
  });

  afterAll(async () => {
    await Promise.all([admin.end(), research.end(), readonly.end()]);
  });

  describe('the migration', () => {
    it('is recorded as 0016 with the checksum of the committed file', async () => {
      const sql = readFileSync(resolve(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8');
      const { rows } = await admin.query<{ checksum: string }>(
        `SELECT checksum FROM schema_migrations WHERE version = '0016'`,
      );
      expect(rows).toEqual([{ checksum: createHash('sha256').update(sql, 'utf8').digest('hex') }]);
    });

    it('adds one table of uuid/text/timestamptz columns, with no contact, permission or status column', async () => {
      const { rows } = await admin.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'subject_jurisdiction_claims'`,
      );
      expect([...new Set(rows.map((r) => r.data_type))].sort()).toEqual([
        'text',
        'timestamp with time zone',
        'uuid',
      ]);
      for (const { column_name } of rows) {
        expect(column_name).not.toMatch(
          /email|phone|person|contact|status|verified|confirmed|eligib|permi|consent|lawful|score|qualif|outreach|market|locale|target_language|json/,
        );
      }
    });

    it('references only discovery_subjects and the existing provenance tables', async () => {
      const { rows } = await admin.query<{ target: string }>(
        `SELECT DISTINCT confrelid::regclass::text AS target FROM pg_constraint
          WHERE conrelid = 'subject_jurisdiction_claims'::regclass AND contype = 'f'
          ORDER BY 1`,
      );
      expect(rows.map((r) => r.target)).toEqual([
        'discovery_subjects',
        'orgunit_page_evidence',
        'website_claims',
      ]);
    });

    it('attaches its trigger to its own table only, and touches no ECHE or B2.x table', async () => {
      const { rows } = await admin.query<{ tgname: string; table: string }>(
        `SELECT t.tgname, t.tgrelid::regclass::text AS table
           FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE NOT t.tgisinternal
            AND (t.tgname LIKE '%jurisdiction%' OR p.proname LIKE '%jurisdiction%'
                 OR p.proname LIKE '%iso3166%' OR t.tgrelid = 'subject_jurisdiction_claims'::regclass)
          ORDER BY t.tgname`,
      );
      expect(rows).toEqual([
        { tgname: 'subject_jurisdiction_claims_append_only', table: 'subject_jurisdiction_claims' },
        // REL Q1 (migration 0021, ADR 0024 s7): the non-owner writer's actor
        // binding (0014's function) and scope check, on this table only.
        {
          tgname: 'subject_jurisdiction_claims_writer_actor',
          table: 'subject_jurisdiction_claims',
        },
        {
          tgname: 'subject_jurisdiction_claims_writer_scope',
          table: 'subject_jurisdiction_claims',
        },
      ]);
    });
  });

  describe('synthetic worldwide organisations', () => {
    it('records a Japanese student association, a Brazilian language organisation, and leaves the French ECHE data byte-identical', async () => {
      const before = await echeDigest();

      await insertJurisdiction(admin, jpAssociation, { country: 'JP' });
      await insertJurisdiction(admin, jpAssociation, {
        kind: 'LEGAL_FORM',
        legalForm: 'UNREGISTERED_INFORMAL_GROUP',
      });
      await insertJurisdiction(admin, brLanguageOrg, {
        country: 'BR',
        url: 'https://synthetic-r4-br.example/quem-somos',
      });
      await insertJurisdiction(admin, brLanguageOrg, {
        kind: 'COUNTRY_OF_REGISTRATION',
        country: 'BR',
        url: 'https://synthetic-r4-br.example/estatuto',
      });
      await insertJurisdiction(admin, brLanguageOrg, {
        kind: 'LEGAL_FORM',
        legalForm: 'REGISTERED_LEGAL_ENTITY',
        url: 'https://synthetic-r4-br.example/estatuto',
      });

      expect(await echeDigest()).toBe(before);
      const { rows } = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM organisations WHERE eche_row_key = $1 AND country_code = 'FR'`,
        [echeRowKey],
      );
      expect(rows[0]!.n).toBe('1');
    });

    it('derives standing from the stored rows: JP and BR stated, the French faculty UNKNOWN', async () => {
      const claims = await readClaims();
      expect(claims).toHaveLength(5);
      const jp = deriveJurisdictionStanding(jpAssociation, claims);
      expect(jp.countryOfOperation).toMatchObject({ state: 'STATED', value: 'JP' });
      expect(jp.countryOfRegistration).toEqual({ state: 'UNKNOWN' });
      expect(jp.legalForm).toMatchObject({ state: 'STATED', value: 'UNREGISTERED_INFORMAL_GROUP' });
      const br = deriveJurisdictionStanding(brLanguageOrg, claims);
      expect(br.countryOfOperation).toMatchObject({ state: 'STATED', value: 'BR' });
      expect(br.countryOfRegistration).toMatchObject({ state: 'STATED', value: 'BR' });
      expect(br.legalForm).toMatchObject({ state: 'STATED', value: 'REGISTERED_LEGAL_ENTITY' });
      // PART_OF an ECHE row whose Country Cd is FR - and still UNKNOWN.
      const fr = deriveJurisdictionStanding(frFaculty, claims);
      expect(fr.countryOfOperation).toEqual({ state: 'UNKNOWN' });
      expect(fr.legalForm).toEqual({ state: 'UNKNOWN' });
      for (const standing of [jp, br, fr]) expect(standing.excludedClaimIds).toEqual([]);
    });

    it('stores no fabricated identifier: a Brazilian CNPJ scheme does not exist and is refused', async () => {
      await expectCode(
        () =>
          admin.query(
            `INSERT INTO discovery_subject_identity_claims
               (subject_id, claim_kind, identifier_scheme, identifier_value, source_type,
                source_url, observed_at, claim_basis, recorded_by_actor_key)
             VALUES ($1, 'EXTERNAL_IDENTIFIER', 'BR_CNPJ', '00000000000000', 'PUBLIC_URL',
                     'https://synthetic-r4-br.example/estatuto', now(), 'SOURCE_STATED', 'owner-cli')`,
            [brLanguageOrg],
          ),
        CHECK_VIOLATION,
      );
    });
  });

  describe('refusals', () => {
    it.each([
      ['a user-assigned code', { country: 'XK' }],
      ['an exceptional reservation', { country: 'EU' }],
      ['a lower-case code', { country: 'jp' }],
      ['an alpha-3 code', { country: 'JPN' }],
      ['an inferred country', { basis: 'INFERRED' }],
      [
        'a country on a legal-form claim',
        { kind: 'LEGAL_FORM', country: 'JP', legalForm: 'REGISTERED_LEGAL_ENTITY' },
      ],
      ['a legal form without a value', { kind: 'LEGAL_FORM' }],
      ['an unknown legal form', { kind: 'LEGAL_FORM', legalForm: 'NGO' }],
      ['an unknown claim kind', { kind: 'NATIONALITY' }],
      ['a country claim without a country', { country: null }],
      ['a social-platform source', { url: 'https://www.instagram.com/synthetic' }],
      ['a mailbox-shaped source', { url: 'https://synthetic-r4-jp.example/a%40b' }],
      ['a malformed version reference', { version: 'ABC' }],
      ['a person-shaped actor key', { actor: 'Jane Doe' }],
    ] as const)('refuses %s', async (_label, input) => {
      await expectCode(
        () => insertJurisdiction(admin, jpAssociation, input as ClaimInput),
        CHECK_VIOLATION,
        NOT_NULL_VIOLATION,
      );
    });

    it('refuses an unregistered subject and a duplicate claim', async () => {
      await expectCode(
        () => insertJurisdiction(admin, '00000000-0000-4000-8000-0000000004ff', {}),
        FOREIGN_KEY_VIOLATION,
      );
      await expectCode(() => insertJurisdiction(admin, jpAssociation, {}), UNIQUE_VIOLATION);
    });
  });

  describe('append-only and privilege boundary', () => {
    it('refuses UPDATE and DELETE even for the owner', async () => {
      await expectCode(
        () => admin.query(`UPDATE subject_jurisdiction_claims SET claimed_country = 'KR'`),
        APPEND_ONLY,
      );
      await expectCode(() => admin.query(`DELETE FROM subject_jurisdiction_claims`), APPEND_ONLY);
    });

    it('grants no runtime role any write, and only nwf_readonly a read', async () => {
      // REL Q1 (migration 0021, ADR 0024 s7) granted the B2.2 writer capability
      // SELECT + INSERT here, narrowed by a scope trigger; its exact grants and
      // refusals are asserted by jurisdictionClaimWriterQ1.test.ts. Every other
      // runtime role is unchanged.
      for (const role of RUNTIME_ROLES.filter((r) => r !== 'nwf_discovery_subject_writer')) {
        for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
          const { rows } = await admin.query<{ ok: boolean }>(
            `SELECT has_table_privilege($1, 'subject_jurisdiction_claims', $2) AS ok`,
            [role, privilege],
          );
          expect(rows[0]!.ok, `${role} ${privilege}`).toBe(false);
        }
        const { rows } = await admin.query<{ ok: boolean }>(
          `SELECT has_table_privilege($1, 'subject_jurisdiction_claims', 'SELECT') AS ok`,
          [role],
        );
        expect(rows[0]!.ok, `${role} SELECT`).toBe(role === 'nwf_readonly');
      }
    });

    // REL Q1: the B2.2 writer now holds INSERT; this owner-path row's actor key
    // ('owner-cli') is refused by 0014's binding trigger, still as 42501.
    it('refuses an actual write by the readonly login, the research login and the B2.2 writer', async () => {
      await expectCode(
        () => insertJurisdiction(readonly, jpAssociation, { country: 'KR' }),
        INSUFFICIENT_PRIVILEGE,
      );
      await expectCode(
        () => research.query(`SELECT 1 FROM subject_jurisdiction_claims`),
        INSUFFICIENT_PRIVILEGE,
      );
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE nwf_discovery_subject_writer');
        await expectCode(
          () => insertJurisdiction(client, jpAssociation, { country: 'KR' }),
          INSUFFICIENT_PRIVILEGE,
        );
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });
});

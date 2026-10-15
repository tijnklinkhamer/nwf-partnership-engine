/**
 * Track B, B2.1 - migration 0013 against REAL PostgreSQL (nwf_pe_test only).
 *
 * Proves, with SYNTHETIC rows only:
 *   - micro-organisations are representable as first-class subjects with many
 *     relationships, no mandatory ECHE parent, and claims that keep their
 *     provenance;
 *   - the database refuses malformed, unattributed, duplicated, self-linked,
 *     contact-shaped and social-platform values;
 *   - the SQL admissibility predicates agree with the TypeScript ones;
 *   - every table is append-only for EVERY role, the owner included, and no
 *     runtime role can write - research cannot even read;
 *   - review chains are linear per target, and rows read back from the
 *     database validate with the pure validator.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';

import {
  isAdmissibleFreeText,
  isAdmissiblePublicUrl,
} from '../../orgunits/identity/admissibility.js';
import { evaluateStructuralParentConstraint } from '../../orgunits/identity/structuralParent.js';
import { validateIdentityGraph } from '../../orgunits/identity/validate.js';
import type { IdentityGraphInput } from '../../orgunits/identity/vocabulary.js';
import {
  ECHE_ALPHA,
  ECHE_BETA,
  ECHE_PROTECTED,
  TEXT_SAMPLES,
  URL_SAMPLES,
  sourceUrl,
} from '../helpers/discoveryIdentityFixtures.js';
import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  ingestPool,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
} from './helpers.js';

const describeDb =
  classifierDatabaseConfigured() && researchDatabaseConfigured() ? describe : describe.skip;

const MIGRATION_FILE = '0013_discovery_subject_identity.sql';
const TABLES = [
  'discovery_subjects',
  'discovery_subject_identity_claims',
  'discovery_subject_relationship_claims',
  'discovery_subject_reviews',
] as const;

const INSUFFICIENT_PRIVILEGE = '42501';
const APPEND_ONLY = '55000';
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

async function expectCode(fn: () => Promise<unknown>, ...accepted: string[]): Promise<void> {
  try {
    await fn();
  } catch (err) {
    expect(accepted).toContain((err as { code?: string }).code);
    return;
  }
  throw new Error(`Expected SQLSTATE ${accepted.join('/')}, but the statement succeeded.`);
}

describeDb('B2.1 migration 0013 - discovery subject identity (integration)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let readonly: pg.Pool;
  let ingest: pg.Pool;
  let classifier: pg.Pool;
  let websiteClaimId: string;
  let pageEvidenceId: string;
  let sequence = 0;

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    readonly = readonlyPool();
    ingest = ingestPool();
    classifier = classifierPool();
    await truncateAll(admin);

    const root = await seedOrgunitRoot(admin);
    websiteClaimId = root.websiteClaimId;
    for (const key of [ECHE_ALPHA, ECHE_BETA, ECHE_PROTECTED]) {
      const [code, pic] = key.split('|') as [string, string];
      await admin.query(
        `INSERT INTO organisations
           (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
         VALUES ($1, 'Synthetic Institution', 'Synthetic Institution', 'ZZ', $2, $3)`,
        [key, code, pic],
      );
    }
    const run = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version)
       VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
    );
    const fetch = await admin.query<{ id: string; root_key: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url, requested_host,
          requested_registrable_domain, discovery_method, attempt_no, http_status,
          response_sha256, byte_count, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, 'https://www.example.ac.uk/clubs', 'www.example.ac.uk',
               'example.ac.uk', 'ROOT', 1, 200, $4, 64, 'ALLOWED', 'fetch-1', now())
       RETURNING id, root_key`,
      [run.rows[0]!.id, root.websiteClaimId, root.echeRowKey, 'e'.repeat(64)],
    );
    const page = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_page_evidence
         (fetch_observation_id, root_key, headings, main_text, main_text_chars,
          extraction_method, rule_version, observed_at)
       VALUES ($1, $2, '[]'::jsonb, 'Synthetic clubs page', 20, 'MAIN_ELEMENT', 'rules-1', now())
       RETURNING id`,
      [fetch.rows[0]!.id, fetch.rows[0]!.root_key],
    );
    pageEvidenceId = page.rows[0]!.id;
  });

  afterAll(async () => {
    await Promise.all([
      admin.end(),
      research.end(),
      readonly.end(),
      ingest.end(),
      classifier.end(),
    ]);
  });

  async function insertSubject(kind = 'UNCERTAIN', pool: pg.Pool = admin): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO discovery_subjects (registered_kind, registered_by_actor_key)
       VALUES ($1, 'owner-cli') RETURNING id`,
      [kind],
    );
    return rows[0]!.id;
  }

  async function insertNameClaim(
    subjectId: string,
    text: string,
    options: { claimKind?: string; language?: string | null; url?: string } = {},
  ): Promise<string> {
    sequence += 1;
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO discovery_subject_identity_claims
         (subject_id, claim_kind, name_text, name_language, source_type, source_url,
          observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, $3, $4, 'PUBLIC_URL', $5, '2026-10-01T09:00:00Z', 'SOURCE_STATED', 'owner-cli')
       RETURNING id`,
      [
        subjectId,
        options.claimKind ?? 'NAME',
        text,
        options.language ?? null,
        options.url ?? sourceUrl(`name-${sequence}`),
      ],
    );
    return rows[0]!.id;
  }

  async function insertKindClaim(subjectId: string, kind: string): Promise<string> {
    sequence += 1;
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO discovery_subject_identity_claims
         (subject_id, claim_kind, claimed_kind, source_type, source_url,
          observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, 'ENTITY_KIND', $2, 'PUBLIC_URL', $3, '2026-10-01T09:00:00Z', 'INFERRED', 'owner-cli')
       RETURNING id`,
      [subjectId, kind, sourceUrl(`kind-${sequence}`)],
    );
    return rows[0]!.id;
  }

  async function insertRelation(
    subjectId: string,
    predicate: string,
    target: { subject: string } | { eche: string },
    url = sourceUrl(`relation-${(sequence += 1)}`),
  ): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO discovery_subject_relationship_claims
         (subject_id, predicate, target_subject_id, target_eche_row_key, source_type,
          source_url, observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, $3, $4, 'PUBLIC_URL', $5, '2026-10-01T09:00:00Z', 'SOURCE_STATED', 'owner-cli')
       RETURNING id`,
      [
        subjectId,
        predicate,
        'subject' in target ? target.subject : null,
        'eche' in target ? target.eche : null,
        url,
      ],
    );
    return rows[0]!.id;
  }

  async function insertReview(
    target: { subject: string } | { identityClaim: string } | { relationshipClaim: string },
    outcome: string,
    supersedes: string | null = null,
    at = '2026-10-10T10:00:00Z',
  ): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO discovery_subject_reviews
         (reviewed_subject_id, reviewed_identity_claim_id, reviewed_relationship_claim_id,
          review_outcome, supersedes_review_id, actor_key, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, 'owner-cli', $6) RETURNING id`,
      [
        'subject' in target ? target.subject : null,
        'identityClaim' in target ? target.identityClaim : null,
        'relationshipClaim' in target ? target.relationshipClaim : null,
        outcome,
        supersedes,
        at,
      ],
    );
    return rows[0]!.id;
  }

  describe('the migration', () => {
    it('is recorded as 0013 with the checksum of the committed file', async () => {
      const sql = readFileSync(resolve(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8');
      const { rows } = await admin.query<{ checksum: string }>(
        `SELECT checksum FROM schema_migrations WHERE version = '0013'`,
      );
      expect(rows).toEqual([{ checksum: createHash('sha256').update(sql, 'utf8').digest('hex') }]);
    });

    it('creates exactly the four tables, with no contact, status or eligibility column', async () => {
      const { rows } = await admin.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name LIKE 'discovery%'
          ORDER BY table_name, ordinal_position`,
      );
      expect([...new Set(rows.map((r) => r.table_name))].sort()).toEqual([...TABLES].sort());
      for (const { table_name, column_name } of rows) {
        expect(column_name, `${table_name}.${column_name}`).not.toMatch(
          /email|mailbox|phone|telephone|mobile|instagram|facebook|linkedin|person|contact|status|verified|confirmed|eligib|score|qualif|outreach|parent_id|json/,
        );
      }
      const { rows: types } = await admin.query<{ data_type: string }>(
        `SELECT DISTINCT data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name LIKE 'discovery%' ORDER BY data_type`,
      );
      expect(types.map((t) => t.data_type)).toEqual(['text', 'timestamp with time zone', 'uuid']);
    });
  });

  describe('representation (synthetic cases 1-9)', () => {
    it('stores a standalone community with no parent and no relationship at all', async () => {
      const id = await insertSubject('INDEPENDENT_COMMUNITY');
      await insertNameClaim(id, 'Synthetic Tandem Community');
      const { rows } = await admin.query(
        `SELECT 1 FROM discovery_subject_relationship_claims WHERE subject_id = $1`,
        [id],
      );
      expect(rows).toEqual([]);
    });

    it('stores a club in a faculty in an ECHE institution, a chapter with many affiliations, and multi-campus operation', async () => {
      const faculty = await insertSubject('FACULTY_SCHOOL_DEPARTMENT');
      const club = await insertSubject('INTERNAL_STUDENT_GROUP');
      await insertRelation(club, 'PART_OF', { subject: faculty });
      await insertRelation(faculty, 'PART_OF', { eche: ECHE_ALPHA });

      const network = await insertSubject('ORGANISATION_NETWORK');
      const chapter = await insertSubject('NETWORK_LOCAL_CHAPTER');
      await insertRelation(chapter, 'LOCAL_CHAPTER_OF', { subject: network });
      await insertRelation(chapter, 'AFFILIATED_WITH', { eche: ECHE_ALPHA });
      await insertRelation(chapter, 'AFFILIATED_WITH', { eche: ECHE_BETA });
      await insertRelation(chapter, 'OPERATES_AT', { eche: ECHE_BETA });

      const { rows } = await admin.query<{ predicate: string; target_key: string }>(
        `SELECT predicate, target_key FROM discovery_subject_relationship_claims
          WHERE subject_id = $1 ORDER BY predicate, target_key`,
        [chapter],
      );
      expect(rows.map((r) => r.predicate)).toEqual([
        'AFFILIATED_WITH',
        'AFFILIATED_WITH',
        'LOCAL_CHAPTER_OF',
        'OPERATES_AT',
      ]);
      expect(rows[2]!.target_key).toBe(`subject:${network}`);
    });

    it('keeps identical names as separate subjects, several names per subject, conflicting kinds and corroborating sources', async () => {
      const north = await insertSubject('INTERNAL_STUDENT_GROUP');
      const south = await insertSubject('INTERNAL_STUDENT_GROUP');
      await insertNameClaim(north, 'Synthetic Buddy Programme');
      await insertNameClaim(south, 'Synthetic Buddy Programme');

      await insertNameClaim(north, 'SBP', { claimKind: 'ALTERNATE_NAME' });
      await insertNameClaim(north, 'Programme de Parrainage Synthétique', {
        claimKind: 'NATIVE_NAME',
        language: 'fr',
      });
      await insertNameClaim(north, 'Synthetic Buddy Programme', {
        url: sourceUrl('second-source'),
      });
      await insertKindClaim(north, 'INTERNAL_STUDENT_GROUP');
      await insertKindClaim(north, 'INDEPENDENT_STUDENT_ASSOCIATION');

      const { rows } = await admin.query<{ claim_kind: string; n: string }>(
        `SELECT claim_kind, count(*)::text AS n FROM discovery_subject_identity_claims
          WHERE subject_id = $1 GROUP BY claim_kind ORDER BY claim_kind`,
        [north],
      );
      expect(rows).toEqual([
        { claim_kind: 'ALTERNATE_NAME', n: '1' },
        { claim_kind: 'ENTITY_KIND', n: '2' },
        { claim_kind: 'NAME', n: '2' },
        { claim_kind: 'NATIVE_NAME', n: '1' },
      ]);
    });

    it('accepts page-evidence and website-claim provenance through real foreign keys', async () => {
      const id = await insertSubject();
      await admin.query(
        `INSERT INTO discovery_subject_identity_claims
           (subject_id, claim_kind, name_text, source_type, source_page_evidence_id,
            observed_at, claim_basis, recorded_by_actor_key)
         VALUES ($1, 'NAME', 'Synthetic Page Club', 'PAGE_EVIDENCE', $2, now(), 'SOURCE_STATED', 'owner-cli')`,
        [id, pageEvidenceId],
      );
      await admin.query(
        `INSERT INTO discovery_subject_relationship_claims
           (subject_id, predicate, target_eche_row_key, source_type, source_website_claim_id,
            observed_at, claim_basis, recorded_by_actor_key)
         VALUES ($1, 'OPERATES_AT', $2, 'WEBSITE_CLAIM', $3, now(), 'INFERRED', 'owner-cli')`,
        [id, ECHE_ALPHA, websiteClaimId],
      );
      await expectCode(
        () =>
          admin.query(
            `INSERT INTO discovery_subject_identity_claims
               (subject_id, claim_kind, name_text, source_type, source_page_evidence_id,
                observed_at, claim_basis, recorded_by_actor_key)
             VALUES ($1, 'NAME', 'Synthetic', 'PAGE_EVIDENCE', gen_random_uuid(), now(), 'SOURCE_STATED', 'owner-cli')`,
            [id],
          ),
        FOREIGN_KEY_VIOLATION,
      );
    });
  });

  describe('refusals', () => {
    it('refuses a self-link, a duplicate assertion, an unknown target and a chapter of an ECHE row', async () => {
      const a = await insertSubject('FACULTY_SCHOOL_DEPARTMENT');
      await expectCode(() => insertRelation(a, 'PART_OF', { subject: a }), CHECK_VIOLATION);

      await insertRelation(a, 'PART_OF', { eche: ECHE_ALPHA }, sourceUrl('same'));
      await expectCode(
        () => insertRelation(a, 'PART_OF', { eche: ECHE_ALPHA }, sourceUrl('same')),
        UNIQUE_VIOLATION,
      );
      // The same relationship from a second source is corroboration, and is kept.
      await insertRelation(a, 'PART_OF', { eche: ECHE_ALPHA }, sourceUrl('other'));

      await expectCode(
        () =>
          insertRelation(a, 'AFFILIATED_WITH', { subject: '00000000-0000-4000-8000-0000000000ff' }),
        FOREIGN_KEY_VIOLATION,
      );
      await expectCode(
        () => insertRelation(a, 'AFFILIATED_WITH', { eche: 'T B21 NOWHERE01|300000099' }),
        FOREIGN_KEY_VIOLATION,
      );
      await expectCode(
        () => insertRelation(a, 'LOCAL_CHAPTER_OF', { eche: ECHE_ALPHA }),
        CHECK_VIOLATION,
      );
      await expectCode(() => insertRelation(a, 'OWNS', { eche: ECHE_ALPHA }), CHECK_VIOLATION);
    });

    it('refuses a claim with missing or inconsistent provenance', async () => {
      const id = await insertSubject();
      for (const [sourceType, url, page] of [
        ['PUBLIC_URL', null, null],
        ['PAGE_EVIDENCE', null, null],
        ['PAGE_EVIDENCE', sourceUrl('both'), 'page'],
        ['OWNER_SAYS_SO', sourceUrl('x'), null],
      ] as const) {
        await expectCode(
          () =>
            admin.query(
              `INSERT INTO discovery_subject_identity_claims
                 (subject_id, claim_kind, name_text, source_type, source_url, source_page_evidence_id,
                  observed_at, claim_basis, recorded_by_actor_key)
               VALUES ($1, 'NAME', 'Synthetic', $2, $3, $4, now(), 'SOURCE_STATED', 'owner-cli')`,
              [id, sourceType, url, page === 'page' ? pageEvidenceId : null],
            ),
          CHECK_VIOLATION,
          NOT_NULL_VIOLATION,
        );
      }
    });

    it('refuses unknown kinds, contact-shaped names, bad identifiers, bad actors and mismatched payloads', async () => {
      await expectCode(() => insertSubject('UNIVERSITY'), CHECK_VIOLATION);
      const id = await insertSubject();
      await expectCode(() => insertNameClaim(id, 'someone@synthetic-b21.example'), CHECK_VIOLATION);
      await expectCode(() => insertNameClaim(id, 'Call 06 12 34 56 78'), CHECK_VIOLATION);
      await expectCode(() => insertNameClaim(id, ' Untrimmed'), CHECK_VIOLATION);
      await expectCode(
        () => insertNameClaim(id, 'Synthetic', { claimKind: 'NATIVE_NAME' }),
        CHECK_VIOLATION,
      );
      await expectCode(() => insertKindClaim(id, 'UNIVERSITY'), CHECK_VIOLATION);
      for (const [scheme, value] of [
        ['NL_KVK', '1234'],
        ['FR_RNA', 'X000000021'],
        ['VAT', '123456789'],
      ]) {
        await expectCode(
          () =>
            admin.query(
              `INSERT INTO discovery_subject_identity_claims
                 (subject_id, claim_kind, identifier_scheme, identifier_value, source_type, source_url,
                  observed_at, claim_basis, recorded_by_actor_key)
               VALUES ($1, 'EXTERNAL_IDENTIFIER', $2, $3, 'PUBLIC_URL', $4, now(), 'SOURCE_STATED', 'owner-cli')`,
              [id, scheme, value, sourceUrl(`id-${scheme}`)],
            ),
          CHECK_VIOLATION,
        );
      }
      await expectCode(
        () =>
          admin.query(
            `INSERT INTO discovery_subjects (registered_kind, registered_by_actor_key)
             VALUES ('UNCERTAIN', 'Some Person')`,
          ),
        CHECK_VIOLATION,
      );
    });

    it('refuses credentials, tokens, mailbox shapes and social hosts in website and source URLs', async () => {
      const id = await insertSubject();
      for (const url of [
        'https://user:secret@synthetic-b21.example/',
        'https://synthetic-b21.example/page?token=abc',
        'https://synthetic-b21.example/@someone',
        'https://www.instagram.com/synthetic_b21',
        'https://synthetic-b21.example:443/',
      ]) {
        await expectCode(() => insertNameClaim(id, 'Synthetic', { url }), CHECK_VIOLATION);
        await expectCode(
          () =>
            admin.query(
              `INSERT INTO discovery_subject_identity_claims
                 (subject_id, claim_kind, website_url, source_type, source_url,
                  observed_at, claim_basis, recorded_by_actor_key)
               VALUES ($1, 'PUBLIC_WEBSITE', $2, 'PUBLIC_URL', $3, now(), 'SOURCE_STATED', 'owner-cli')`,
              [id, url, sourceUrl('website')],
            ),
          CHECK_VIOLATION,
        );
      }
    });
  });

  describe('admissibility parity: SQL and TypeScript agree on the shared samples', () => {
    it('agrees on every URL sample', async () => {
      for (const { url, expected } of URL_SAMPLES) {
        const { rows } = await admin.query<{ ok: boolean }>(
          `SELECT discovery_identity_url_admissible($1) AS ok`,
          [url],
        );
        expect(rows[0]!.ok, url).toBe(expected);
        expect(isAdmissiblePublicUrl(url), url).toBe(expected);
      }
    });

    it('agrees on every free-text sample', async () => {
      for (const { text, expected } of TEXT_SAMPLES) {
        const { rows } = await admin.query<{ ok: boolean }>(
          `SELECT discovery_identity_text_admissible($1) AS ok`,
          [text],
        );
        expect(rows[0]!.ok, JSON.stringify(text)).toBe(expected);
        expect(isAdmissibleFreeText(text), JSON.stringify(text)).toBe(expected);
      }
    });
  });

  describe('append-only, for every role (cases 16-18)', () => {
    it('refuses UPDATE and DELETE even from the owner, and leaves the row intact', async () => {
      const subjectId = await insertSubject('INDEPENDENT_COMMUNITY');
      const claimId = await insertNameClaim(subjectId, 'Synthetic Immutable Club');
      const relationId = await insertRelation(subjectId, 'OPERATES_AT', { eche: ECHE_BETA });
      const reviewId = await insertReview({ subject: subjectId }, 'DISPUTED');
      const targets: [string, string, string][] = [
        ['discovery_subjects', subjectId, `registered_kind = 'UNCERTAIN'`],
        ['discovery_subject_identity_claims', claimId, `name_text = 'Rewritten'`],
        ['discovery_subject_relationship_claims', relationId, `predicate = 'PART_OF'`],
        ['discovery_subject_reviews', reviewId, `review_outcome = 'CONFIRMED'`],
      ];
      for (const [table, id, set] of targets) {
        await expectCode(
          () => admin.query(`UPDATE ${table} SET ${set} WHERE id = $1`, [id]),
          APPEND_ONLY,
        );
        await expectCode(
          () => admin.query(`DELETE FROM ${table} WHERE id = $1`, [id]),
          APPEND_ONLY,
        );
      }
      const { rows } = await admin.query<{ registered_kind: string }>(
        `SELECT registered_kind FROM discovery_subjects WHERE id = $1`,
        [subjectId],
      );
      expect(rows).toEqual([{ registered_kind: 'INDEPENDENT_COMMUNITY' }]);
    });

    it('denies every runtime role INSERT, UPDATE, DELETE and TRUNCATE; research, ingest and classifier cannot even read', async () => {
      const subjectId = await insertSubject();
      for (const [name, pool] of [
        ['research', research],
        ['ingest', ingest],
        ['classifier', classifier],
        ['readonly', readonly],
      ] as const) {
        await expectCode(() => insertSubject('UNCERTAIN', pool), INSUFFICIENT_PRIVILEGE);
        for (const table of TABLES) {
          await expectCode(
            () => pool.query(`UPDATE ${table} SET created_at = now() WHERE id = $1`, [subjectId]),
            INSUFFICIENT_PRIVILEGE,
          );
          await expectCode(
            () => pool.query(`DELETE FROM ${table} WHERE id = $1`, [subjectId]),
            INSUFFICIENT_PRIVILEGE,
          );
          await expectCode(() => pool.query(`TRUNCATE ${table}`), INSUFFICIENT_PRIVILEGE);
          if (name === 'readonly') {
            await pool.query(`SELECT count(*) FROM ${table}`);
          } else {
            await expectCode(
              () => pool.query(`SELECT count(*) FROM ${table}`),
              INSUFFICIENT_PRIVILEGE,
            );
          }
        }
      }
    });

    it('grants nothing on these tables but SELECT to nwf_readonly, read from the catalogue', async () => {
      const { rows } = await admin.query<{
        grantee: string;
        table_name: string;
        privilege_type: string;
      }>(
        `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
          WHERE table_name = ANY($1) AND grantee <> (SELECT tableowner FROM pg_tables
                                                      WHERE tablename = 'discovery_subjects')
          ORDER BY grantee, table_name, privilege_type`,
        [TABLES],
      );
      expect(rows).toEqual(
        [...TABLES].sort().map((table_name) => ({
          grantee: 'nwf_readonly',
          table_name,
          privilege_type: 'SELECT',
        })),
      );
    });
  });

  describe('review chains (case 16)', () => {
    it('keeps one linear chain per target and refuses every other shape', async () => {
      const a = await insertSubject('INDEPENDENT_COMMUNITY');
      const b = await insertSubject('INDEPENDENT_COMMUNITY');
      const first = await insertReview({ subject: a }, 'CONFIRMED', null, '2026-10-02T10:00:00Z');
      const second = await insertReview({ subject: a }, 'DISPUTED', first, '2026-10-03T10:00:00Z');
      const head = await insertReview({ subject: a }, 'WITHDRAWN', second, '2026-10-04T10:00:00Z');

      await expectCode(() => insertReview({ subject: a }, 'REJECTED'), UNIQUE_VIOLATION);
      await expectCode(() => insertReview({ subject: a }, 'REJECTED', first), UNIQUE_VIOLATION);
      await expectCode(() => insertReview({ subject: b }, 'REJECTED', head), FOREIGN_KEY_VIOLATION);
      await expectCode(() => insertReview({ subject: b }, 'WITHDRAWN'), CHECK_VIOLATION);
      await expectCode(
        () =>
          admin.query(
            `INSERT INTO discovery_subject_reviews
               (reviewed_subject_id, reviewed_relationship_claim_id, review_outcome, actor_key, reviewed_at)
             VALUES ($1, NULL, 'CONFIRMED', 'owner-cli', now()),
                    (NULL, NULL, 'CONFIRMED', 'owner-cli', now())`,
            [b],
          ),
        // No target: the generated review_target_key is NULL, so NOT NULL fires before the CHECK.
        CHECK_VIOLATION,
        NOT_NULL_VIOLATION,
      );
      const relation = await insertRelation(b, 'OPERATES_AT', { eche: ECHE_ALPHA });
      await expectCode(
        () =>
          admin.query(
            `INSERT INTO discovery_subject_reviews
               (reviewed_subject_id, reviewed_relationship_claim_id, review_outcome, actor_key, reviewed_at)
             VALUES ($1, $2, 'CONFIRMED', 'owner-cli', now())`,
            [b, relation],
          ),
        CHECK_VIOLATION,
      );

      const { rows } = await admin.query<{ review_outcome: string }>(
        `SELECT r.review_outcome FROM discovery_subject_reviews r
          WHERE r.reviewed_subject_id = $1
            AND NOT EXISTS (SELECT 1 FROM discovery_subject_reviews s
                             WHERE s.supersedes_review_id = r.id)`,
        [a],
      );
      expect(rows).toEqual([{ review_outcome: 'WITHDRAWN' }]);
    });
  });

  describe('round trip: rows read back by nwf_readonly validate with the pure validator', () => {
    it('reproduces the protected-parent block and the mere-affiliation non-block from stored rows', async () => {
      const faculty = await insertSubject('FACULTY_SCHOOL_DEPARTMENT');
      await insertNameClaim(faculty, 'Synthetic Protected Faculty');
      const toProtected = await insertRelation(faculty, 'PART_OF', { eche: ECHE_PROTECTED });
      await insertReview({ relationshipClaim: toProtected }, 'CONFIRMED');
      const association = await insertSubject('INDEPENDENT_STUDENT_ASSOCIATION');
      await insertNameClaim(association, 'Synthetic Affiliated Association');
      const affiliation = await insertRelation(association, 'AFFILIATED_WITH', {
        eche: ECHE_PROTECTED,
      });
      await insertReview({ relationshipClaim: affiliation }, 'CONFIRMED');

      const input = await loadGraph([faculty, association]);
      const validation = validateIdentityGraph(input);
      expect(validation.structurallyValid).toBe(true);
      expect(evaluateStructuralParentConstraint(input, faculty, [ECHE_PROTECTED]).constraint).toBe(
        'RESEARCH_BLOCKING',
      );
      expect(
        evaluateStructuralParentConstraint(input, association, [ECHE_PROTECTED]).constraint,
      ).toBe('NO_KNOWN_STRUCTURAL_PARENT_BLOCK');
    });
  });

  /** Reads the given subjects' rows as nwf_readonly and maps them to validator records. */
  async function loadGraph(subjectIds: string[]): Promise<IdentityGraphInput> {
    const iso = (d: Date) => d.toISOString();
    const subjects = await readonly.query(
      `SELECT id, registered_kind, registered_by_actor_key, registration_note
         FROM discovery_subjects WHERE id = ANY($1)`,
      [subjectIds],
    );
    const claims = await readonly.query(
      `SELECT * FROM discovery_subject_identity_claims WHERE subject_id = ANY($1)`,
      [subjectIds],
    );
    const relations = await readonly.query(
      `SELECT * FROM discovery_subject_relationship_claims WHERE subject_id = ANY($1)`,
      [subjectIds],
    );
    const reviews = await readonly.query(
      `SELECT * FROM discovery_subject_reviews
        WHERE reviewed_subject_id = ANY($1)
           OR reviewed_identity_claim_id IN (SELECT id FROM discovery_subject_identity_claims
                                              WHERE subject_id = ANY($1))
           OR reviewed_relationship_claim_id IN (SELECT id FROM discovery_subject_relationship_claims
                                                  WHERE subject_id = ANY($1))`,
      [subjectIds],
    );
    const provenance = (r: Record<string, unknown>) => ({
      sourceType: r['source_type'] as never,
      sourcePageEvidenceId: r['source_page_evidence_id'] as string | null,
      sourceWebsiteClaimId: r['source_website_claim_id'] as string | null,
      sourceUrl: r['source_url'] as string | null,
      sourceVersionRef: r['source_version_ref'] as string | null,
      observedAt: iso(r['observed_at'] as Date),
      claimBasis: r['claim_basis'] as never,
      recordedByActorKey: r['recorded_by_actor_key'] as string,
    });
    return {
      subjects: subjects.rows.map((r) => ({
        id: r.id,
        registeredKind: r.registered_kind,
        registeredByActorKey: r.registered_by_actor_key,
        registrationNote: r.registration_note,
      })),
      identityClaims: claims.rows.map((r) => ({
        ...provenance(r),
        id: r.id,
        subjectId: r.subject_id,
        claimKind: r.claim_kind,
        nameText: r.name_text,
        nameLanguage: r.name_language,
        claimedKind: r.claimed_kind,
        websiteUrl: r.website_url,
        identifierScheme: r.identifier_scheme,
        identifierValue: r.identifier_value,
      })),
      relationshipClaims: relations.rows.map((r) => ({
        ...provenance(r),
        id: r.id,
        subjectId: r.subject_id,
        predicate: r.predicate,
        targetSubjectId: r.target_subject_id,
        targetEcheRowKey: r.target_eche_row_key,
      })),
      reviews: reviews.rows.map((r) => ({
        id: r.id,
        reviewedSubjectId: r.reviewed_subject_id,
        reviewedIdentityClaimId: r.reviewed_identity_claim_id,
        reviewedRelationshipClaimId: r.reviewed_relationship_claim_id,
        reviewOutcome: r.review_outcome,
        supersedesReviewId: r.supersedes_review_id,
        actorKey: r.actor_key,
        reviewedAt: iso(r.reviewed_at as Date),
        reason: r.reason,
      })),
      knownEcheRowKeys: [ECHE_ALPHA, ECHE_BETA, ECHE_PROTECTED],
      asOf: '2030-01-01T00:00:00.000Z',
    };
  }
});

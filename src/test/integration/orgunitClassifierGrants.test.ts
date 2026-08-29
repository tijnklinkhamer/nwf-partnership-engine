/**
 * Proves the Phase 2B-2 classifier trust boundary is a DATABASE guarantee,
 * not a convention. Two claims reduce to privileges, mirroring
 * orgunitGrants.test.ts's discipline for migration 0007:
 *
 *   1. LEAST PRIVILEGE. nwf_classifier can read exactly the upstream
 *      evidence it needs (organisations, orgunit_research_runs,
 *      orgunit_fetch_observations, orgunit_page_evidence,
 *      orgunit_page_candidates) and can APPEND to its own four tables. It
 *      cannot read website_claims or any root-authority table, and it
 *      cannot write anything outside its own tables.
 *   2. SEPARATION OF WRITERS. nwf_research - the role that runs acquisition -
 *      receives NO grant of any kind on the four new classifier tables.
 *      Acquisition and semantic classification stay separated writers, each
 *      structurally incapable of the other's job.
 *
 * They run against nwf_pe_test, never the working database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
} from './helpers.js';

const describeDb = classifierDatabaseConfigured() ? describe : describe.skip;

/** Postgres insufficient_privilege. */
const INSUFFICIENT_PRIVILEGE = '42501';

async function expectDenied(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    expect((err as { code?: string }).code).toBe(INSUFFICIENT_PRIVILEGE);
    return;
  }
  throw new Error('Expected the statement to be denied, but it succeeded.');
}

/** Tables nwf_classifier both reads and appends to. */
const CLASSIFIER_EVIDENCE_TABLES = [
  'orgunit_classifier_calls',
  'orgunit_classifier_call_completions',
  'orgunit_page_classifications',
  'orgunit_classification_subjects',
];

/** Upstream evidence nwf_classifier may only READ. */
const UPSTREAM_READ_TABLES = [
  'organisations',
  'orgunit_research_runs',
  'orgunit_fetch_observations',
  'orgunit_page_evidence',
  'orgunit_page_candidates',
];

/** Phase 2B-1 evidence and root-authority tables nwf_classifier must NOT reach at all. */
const FORBIDDEN_TABLES = [
  'website_claims',
  'orgunit_redirect_observations',
  'orgunit_root_promotions',
  'orgunit_root_promotion_revocations',
  'organisation_sources',
  'ingest_runs',
  'ewp_heis',
];

const VALID_SHA = '7'.repeat(64);

describeDb('Phase 2B-2 classifier grants (integration)', () => {
  let admin: pg.Pool;
  let classifier: pg.Pool;
  let readonly: pg.Pool;
  let runId: string;
  let pageEvidenceId: string;
  let pageCandidateId: string;

  beforeAll(async () => {
    admin = adminPool();
    classifier = classifierPool();
    readonly = readonlyPool();
    await truncateAll(admin);

    const root = await seedOrgunitRoot(admin);
    const run = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version)
       VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
    );
    runId = run.rows[0]!.id;

    const fetch = await admin.query<{ id: string; root_key: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url,
          requested_host, requested_registrable_domain, discovery_method,
          http_status, content_type, charset, charset_source, charset_confidence,
          response_sha256, byte_count, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, 'https://www.example.ac.uk/international',
               'www.example.ac.uk', 'example.ac.uk', 'ROOT', 200, 'text/html',
               'utf-8', 'HTTP_HEADER', 'DECLARED', repeat('9', 64), 4096,
               'ALLOWED', 'fetch-1', now())
       RETURNING id, root_key`,
      [runId, root.websiteClaimId, root.echeRowKey],
    );

    const page = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_page_evidence
         (fetch_observation_id, root_key, title, declared_lang, headings,
          main_text, main_text_chars, extraction_method, rule_version, observed_at)
       VALUES ($1, $2, 'International Office', 'en', '[]'::jsonb, 'text', 4,
               'MAIN_ELEMENT', 'rules-1', now())
       RETURNING id`,
      [fetch.rows[0]!.id, fetch.rows[0]!.root_key],
    );
    pageEvidenceId = page.rows[0]!.id;

    const candidate = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_page_candidates
         (page_evidence_id, run_id, root_key, track, candidate_score,
          signals, rank_within_root, rule_version)
       VALUES ($1, $2, $3, 'INTERNATIONAL_OFFICE', 9.0, '[]'::jsonb, 1, 'rules-1')
       RETURNING id`,
      [pageEvidenceId, runId, fetch.rows[0]!.root_key],
    );
    pageCandidateId = candidate.rows[0]!.id;
  });

  afterAll(async () => {
    await Promise.all([admin.end(), classifier.end(), readonly.end()]);
  });

  describe('nwf_classifier exists and can reach the database', () => {
    it('is a real login role', async () => {
      const { rows } = await admin.query<{ rolcanlogin: boolean }>(
        `SELECT rolcanlogin FROM pg_roles WHERE rolname = 'nwf_classifier'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.rolcanlogin).toBe(true);
    });

    it('holds CONNECT and schema USAGE, and nothing resembling CREATE', async () => {
      const { rows } = await admin.query<{
        can_connect: boolean;
        can_use: boolean;
        can_create: boolean;
      }>(
        `SELECT has_database_privilege('nwf_classifier', current_database(), 'CONNECT') AS can_connect,
                has_schema_privilege('nwf_classifier', 'public', 'USAGE')                AS can_use,
                has_schema_privilege('nwf_classifier', 'public', 'CREATE')               AS can_create`,
      );
      expect(rows[0]!.can_connect).toBe(true);
      expect(rows[0]!.can_use).toBe(true);
      expect(rows[0]!.can_create).toBe(false);
    });

    it('does NOT hold the database TEMPORARY privilege', async () => {
      const { rows } = await admin.query<{ granted: boolean }>(
        `SELECT has_database_privilege('nwf_classifier', current_database(), 'TEMPORARY') AS granted`,
      );
      expect(rows[0]!.granted).toBe(false);
    });

    it('cannot create a table', async () => {
      await expectDenied(() => classifier.query('CREATE TABLE illegal_table (id int)'));
    });
  });

  describe('nwf_classifier can SELECT exactly the upstream evidence it needs', () => {
    it.each(UPSTREAM_READ_TABLES)('may read %s', async (table) => {
      await expect(classifier.query(`SELECT count(*) FROM ${table}`)).resolves.toBeDefined();
    });

    it.each(FORBIDDEN_TABLES)(
      'may NOT read %s (no root authority, no other Phase 1 evidence)',
      async (table) => {
        await expectDenied(() => classifier.query(`SELECT count(*) FROM ${table}`));
      },
    );
  });

  describe('nwf_classifier may INSERT its own append-only evidence', () => {
    it('writes a full chain: call, completion, classification, subject', async () => {
      const call = await classifier.query<{ id: string }>(
        `INSERT INTO orgunit_classifier_calls
           (run_id, eche_row_key, model_id, prompt_version, classifier_version,
            output_schema_version, input_sha256, input_document_count, requested_at)
         SELECT $1, eche_row_key, 'test-model-a', 'orgunit-classifier-prompt-v1',
                'orgunit-classifier-handoff-v1', 'orgunit-classifier-output-v1', $2, 1, now()
           FROM orgunit_fetch_observations WHERE id = (
             SELECT fetch_observation_id FROM orgunit_page_evidence WHERE id = $3
           )
         RETURNING id`,
        [runId, VALID_SHA, pageEvidenceId],
      );
      const callId = call.rows[0]!.id;

      const classification = await classifier.query<{ id: string }>(
        `INSERT INTO orgunit_page_classifications
           (call_id, page_evidence_id, verdict, unit_type,
            serves_incoming_international_students, serves_outgoing_mobility_students,
            provides_language_learning_or_support, confidence, rationale, evidence_spans)
         VALUES ($1, $2, 'UNIT_PAGE', 'INTERNATIONAL_MOBILITY_OFFICE', 'YES', 'UNKNOWN', 'NO',
                 'HIGH', 'Title and headings name the international office directly.',
                 '[{"source":"TITLE","quote":"International Office"}]'::jsonb)
         RETURNING id`,
        [callId, pageEvidenceId],
      );
      expect(classification.rows[0]!.id).toBeTruthy();

      const subject = await classifier.query<{ id: string }>(
        `INSERT INTO orgunit_classification_subjects (classification_id, page_candidate_id)
         VALUES ($1, $2) RETURNING id`,
        [classification.rows[0]!.id, pageCandidateId],
      );
      expect(subject.rows[0]!.id).toBeTruthy();

      const completion = await classifier.query<{ id: string }>(
        `INSERT INTO orgunit_classifier_call_completions
           (call_id, terminal_state, response_model_id, input_tokens, output_tokens, finished_at)
         VALUES ($1, 'COMPLETED', 'test-model-a', 1200, 180, now())
         RETURNING id`,
        [callId],
      );
      expect(completion.rows[0]!.id).toBeTruthy();
    });
  });

  describe('nwf_classifier can change NOTHING, anywhere', () => {
    it.each(CLASSIFIER_EVIDENCE_TABLES)('may NOT UPDATE %s', async (table) => {
      await expectDenied(() => classifier.query(`UPDATE ${table} SET created_at = now()`));
    });

    it.each(CLASSIFIER_EVIDENCE_TABLES)('may NOT DELETE from %s', async (table) => {
      await expectDenied(() => classifier.query(`DELETE FROM ${table}`));
    });

    it('may NOT TRUNCATE its own evidence', async () => {
      await expectDenied(() => classifier.query('TRUNCATE orgunit_page_classifications'));
    });

    it.each(UPSTREAM_READ_TABLES)('may NOT write to upstream evidence table %s', async (table) => {
      await expectDenied(() => classifier.query(`DELETE FROM ${table}`));
      await expectDenied(() => classifier.query(`UPDATE ${table} SET id = id`));
    });

    it('may NOT INSERT into any Phase 2B-1 evidence table', async () => {
      // THE CENTRAL ASSERTION: a role that INTERPRETS evidence must not be
      // able to FORGE the evidence it interprets.
      await expectDenied(() =>
        classifier.query(
          `INSERT INTO orgunit_fetch_observations
             (run_id, eche_row_key, requested_url, requested_host,
              requested_registrable_domain, discovery_method, http_status,
              robots_decision, fetch_policy_version, observed_at)
           VALUES ($1, 'forged|000', 'https://www.forged.edu/', 'www.forged.edu',
                   'forged.edu', 'ROOT', 200, 'ALLOWED', 'fetch-1', now())`,
          [runId],
        ),
      );
      await expectDenied(() =>
        classifier.query(
          `INSERT INTO orgunit_page_evidence
             (fetch_observation_id, root_key, headings, main_text, main_text_chars,
              extraction_method, rule_version, observed_at)
           VALUES ('00000000-0000-0000-0000-000000000000', 'claim:forged',
                   '[]'::jsonb, 'x', 1, 'MAIN_ELEMENT', 'rules-1', now())`,
        ),
      );
    });
  });

  describe('nwf_classifier cannot touch Phase 1 truth tables', () => {
    it('may NOT INSERT, UPDATE or DELETE an organisation', async () => {
      await expectDenied(() =>
        classifier.query(
          `INSERT INTO organisations (eche_row_key, legal_name, display_name, country_code, erasmus_code)
           VALUES ('z|1', 'Z', 'Z', 'FR', 'Z 1')`,
        ),
      );
      await expectDenied(() => classifier.query('UPDATE organisations SET city = NULL'));
      await expectDenied(() => classifier.query('DELETE FROM organisations'));
    });
  });

  describe('nwf_research is UNTOUCHED: it gets no classifier-table privilege', () => {
    const describeResearch = researchDatabaseConfigured() ? describe : describe.skip;

    describeResearch('cross-role isolation', () => {
      let research: pg.Pool;

      beforeAll(() => {
        research = researchPool();
      });

      afterAll(async () => {
        await research.end();
      });

      it.each(CLASSIFIER_EVIDENCE_TABLES)('nwf_research may NOT SELECT %s', async (table) => {
        await expectDenied(() => research.query(`SELECT count(*) FROM ${table}`));
      });

      it.each(CLASSIFIER_EVIDENCE_TABLES)('nwf_research may NOT INSERT into %s', async (table) => {
        await expectDenied(() => research.query(`INSERT INTO ${table} DEFAULT VALUES`));
      });
    });

    it('holds zero rows in information_schema.role_table_grants for the classifier tables', async () => {
      const { rows } = await admin.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.role_table_grants
          WHERE grantee = 'nwf_research' AND table_name = ANY($1)`,
        [CLASSIFIER_EVIDENCE_TABLES],
      );
      expect(rows).toEqual([]);
    });
  });

  describe('nwf_readonly can audit classifier evidence and change none of it', () => {
    it.each(CLASSIFIER_EVIDENCE_TABLES)('may SELECT %s', async (table) => {
      await expect(readonly.query(`SELECT count(*) FROM ${table}`)).resolves.toBeDefined();
    });

    it('may NOT INSERT', async () => {
      await expectDenied(() =>
        readonly.query(
          `INSERT INTO orgunit_classifier_calls
             (run_id, eche_row_key, model_id, prompt_version, classifier_version,
              output_schema_version, input_sha256, input_document_count, requested_at)
           VALUES ($1, 'x|1', 'm', 'p', 'c', 'o', repeat('1', 64), 1, now())`,
          [runId],
        ),
      );
    });

    it('may NOT UPDATE or DELETE', async () => {
      await expectDenied(() =>
        readonly.query('UPDATE orgunit_page_classifications SET confidence = confidence'),
      );
      await expectDenied(() => readonly.query('DELETE FROM orgunit_classification_subjects'));
    });

    it('still holds no TEMPORARY privilege', async () => {
      const { rows } = await admin.query<{ granted: boolean }>(
        `SELECT has_database_privilege('nwf_readonly', current_database(), 'TEMPORARY') AS granted`,
      );
      expect(rows[0]!.granted).toBe(false);
    });
  });

  describe('PUBLIC holds no privilege on the classifier tables', () => {
    it.each(CLASSIFIER_EVIDENCE_TABLES)('has no grant to PUBLIC on %s', async (table) => {
      const { rows } = await admin.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.role_table_grants
          WHERE grantee = 'PUBLIC' AND table_name = $1`,
        [table],
      );
      expect(rows).toEqual([]);
    });
  });

  describe('owner invariants survive migration 0009', () => {
    it('grants nwf_classifier SELECT on upstream evidence and INSERT only on its own tables', async () => {
      // Read from the catalogue rather than from the migration text: this is
      // the state that actually exists, whatever the SQL appears to say.
      const { rows } = await admin.query<{ table_name: string; privilege_type: string }>(
        `SELECT table_name, privilege_type
           FROM information_schema.role_table_grants
          WHERE grantee = 'nwf_classifier'
          ORDER BY table_name, privilege_type`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(
          ['SELECT', 'INSERT'],
          `nwf_classifier holds ${row.privilege_type} on ${row.table_name}`,
        ).toContain(row.privilege_type);
      }

      const writable = rows
        .filter((row) => row.privilege_type === 'INSERT')
        .map((row) => row.table_name)
        .sort();
      expect(writable).toEqual([...CLASSIFIER_EVIDENCE_TABLES].sort());

      const readable = rows
        .filter((row) => row.privilege_type === 'SELECT')
        .map((row) => row.table_name)
        .sort();
      expect(readable).toEqual([...CLASSIFIER_EVIDENCE_TABLES, ...UPSTREAM_READ_TABLES].sort());
    });

    it('keeps nwf_owner able to reach and administer the database', async () => {
      const { rows } = await admin.query<{
        can_connect: boolean;
        can_temp: boolean;
        can_create: boolean;
      }>(
        `SELECT has_database_privilege('nwf_owner', current_database(), 'CONNECT')   AS can_connect,
                has_database_privilege('nwf_owner', current_database(), 'TEMPORARY') AS can_temp,
                has_schema_privilege('nwf_owner', 'public', 'CREATE')                AS can_create`,
      );
      expect(rows[0]!.can_connect).toBe(true);
      expect(rows[0]!.can_temp).toBe(true);
      expect(rows[0]!.can_create).toBe(true);
    });

    it('leaves nwf_research and nwf_ingest exactly as they were', async () => {
      for (const role of ['nwf_research', 'nwf_ingest', 'nwf_readonly']) {
        const { rows } = await admin.query<{ connect: boolean; usage: boolean }>(
          `SELECT has_database_privilege($1, current_database(), 'CONNECT') AS connect,
                  has_schema_privilege($1, 'public', 'USAGE')               AS usage`,
          [role],
        );
        expect(rows[0]!.connect, `${role} lost CONNECT`).toBe(true);
        expect(rows[0]!.usage, `${role} lost schema USAGE`).toBe(true);
      }
    });
  });
});

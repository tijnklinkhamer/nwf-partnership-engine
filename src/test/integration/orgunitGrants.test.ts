/**
 * Proves the Phase 2B trust boundary is a DATABASE guarantee, not a convention.
 *
 * Two claims reduce to privileges, and these tests are what make them checkable:
 *
 *   1. APPEND-ONLY. The role that executes research can add evidence and can
 *      change nothing - not its own past rows, and not one byte of Phase 1
 *      source truth.
 *   2. SEPARATION OF POWERS. The role that OBSERVES a cross-domain redirect
 *      cannot APPROVE it. nwf_research holds SELECT and no INSERT on the root
 *      promotion and revocation tables, so the automated process is
 *      structurally incapable of granting itself a new crawl root.
 *
 * They run against nwf_pe_test, never the working database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  adminPool,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;

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

/** Tables nwf_research both reads and appends to. */
const RESEARCH_EVIDENCE_TABLES = [
  'orgunit_research_runs',
  'orgunit_research_run_completions',
  'orgunit_fetch_observations',
  'orgunit_redirect_observations',
  'orgunit_page_evidence',
  'orgunit_page_candidates',
];

/** Tables nwf_research may only READ: root authority is the operator's. */
const ROOT_AUTHORITY_TABLES = ['orgunit_root_promotions', 'orgunit_root_promotion_revocations'];

const ALL_ORGUNIT_TABLES = [...RESEARCH_EVIDENCE_TABLES, ...ROOT_AUTHORITY_TABLES];

describeDb('Phase 2B research grants (integration)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let readonly: pg.Pool;
  let root: OrgunitRootFixture;
  /** A redirect observation the operator could legitimately promote. */
  let promotableRedirectId: string;

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    root = await seedOrgunitRoot(admin);

    const run = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version)
       VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
    );
    const fetch = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url,
          requested_host, requested_registrable_domain, discovery_method,
          http_status, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, 'https://www.example.ac.uk/seed', 'www.example.ac.uk',
               'example.ac.uk', 'ROOT', 301, 'ALLOWED', 'fetch-1', now())
       RETURNING id`,
      [run.rows[0]!.id, root.websiteClaimId, root.echeRowKey],
    );
    const redirect = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_redirect_observations
         (fetch_observation_id, http_status, to_url_raw, to_url_resolved,
          target_malformed, scheme_downgraded, host_changed,
          registrable_domain_changed, observed_at)
       VALUES ($1, 301, 'https://www.example.edu/', 'https://www.example.edu/',
               false, false, true, true, now())
       RETURNING id`,
      [fetch.rows[0]!.id],
    );
    promotableRedirectId = redirect.rows[0]!.id;
  });

  afterAll(async () => {
    await Promise.all([admin.end(), research.end(), readonly.end()]);
  });

  describe('nwf_research exists and can reach the database', () => {
    it('is a real login role', async () => {
      const { rows } = await admin.query<{ rolcanlogin: boolean }>(
        `SELECT rolcanlogin FROM pg_roles WHERE rolname = 'nwf_research'`,
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
        `SELECT has_database_privilege('nwf_research', current_database(), 'CONNECT') AS can_connect,
                has_schema_privilege('nwf_research', 'public', 'USAGE')                AS can_use,
                has_schema_privilege('nwf_research', 'public', 'CREATE')               AS can_create`,
      );
      expect(rows[0]!.can_connect).toBe(true);
      expect(rows[0]!.can_use).toBe(true);
      expect(rows[0]!.can_create).toBe(false);
    });

    it('does NOT hold the database TEMPORARY privilege', async () => {
      // Migration 0006 removed the inherited PUBLIC grant; 0007 must not have
      // handed a new role one. Asserted on the privilege rather than by
      // attempting CREATE TEMP TABLE, so a passing test leaves nothing behind.
      const { rows } = await admin.query<{ granted: boolean }>(
        `SELECT has_database_privilege('nwf_research', current_database(), 'TEMPORARY') AS granted`,
      );
      expect(rows[0]!.granted).toBe(false);
    });

    it('cannot create a table', async () => {
      await expectDenied(() => research.query('CREATE TABLE illegal_table (id int)'));
    });
  });

  describe('nwf_research can SELECT exactly the source tables it needs', () => {
    it('may read website_claims - the source of research roots', async () => {
      await expect(research.query('SELECT count(*) FROM website_claims')).resolves.toBeDefined();
    });

    it('may read organisations - the nullable convenience link', async () => {
      await expect(research.query('SELECT count(*) FROM organisations')).resolves.toBeDefined();
    });

    it.each([
      'organisation_sources',
      'ingest_runs',
      'website_source_snapshots',
      'ewp_heis',
      'ewp_snapshots',
      'ewp_api_declarations',
    ])('may NOT read %s', async (table) => {
      // Least privilege is only meaningful if the unnecessary reads are absent
      // too. Research needs roots, not the whole provenance layer.
      await expectDenied(() => research.query(`SELECT count(*) FROM ${table}`));
    });
  });

  describe('SEPARATION OF POWERS: research observes, the operator approves', () => {
    it.each(ROOT_AUTHORITY_TABLES)(
      'may READ %s, so a run can see what is authorised',
      async (table) => {
        // A run has to know which roots are approved and which of those were
        // revoked, or it cannot decide what it may fetch. Reading is the whole
        // of its interest here.
        await expect(research.query(`SELECT count(*) FROM ${table}`)).resolves.toBeDefined();
      },
    );

    it('may NOT approve a root', async () => {
      // THE CENTRAL ASSERTION OF THIS FILE. The process that discovers a
      // cross-domain redirect must not hold the privilege to approve itself.
      await expectDenied(() =>
        research.query(
          `INSERT INTO orgunit_root_promotions
             (redirect_observation_id, redirect_target_malformed,
              redirect_scheme_downgraded, redirect_domain_changed,
              actor_key, approved_at)
           VALUES ($1, false, false, true, 'rogue-run', now())`,
          [promotableRedirectId],
        ),
      );
    });

    it('may NOT revoke a root either', async () => {
      // Withdrawal is operator authority too. A run that could revoke could
      // strip a competing root, which is the same power in the other direction.
      const promotion = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_root_promotions
           (redirect_observation_id, redirect_target_malformed,
            redirect_scheme_downgraded, redirect_domain_changed,
            actor_key, approved_at)
         VALUES ($1, false, false, true, 'owner-cli', now()) RETURNING id`,
        [promotableRedirectId],
      );
      await expectDenied(() =>
        research.query(
          `INSERT INTO orgunit_root_promotion_revocations
             (promotion_id, actor_key, revoked_at)
           VALUES ($1, 'rogue-run', now())`,
          [promotion.rows[0]!.id],
        ),
      );
    });

    it('the trusted owner path CAN approve and revoke', async () => {
      // The counterpart assertion: a boundary that also blocks the legitimate
      // path is not a boundary, it is a bug. Approval travels the existing
      // owner credential - no new role, API or UI was introduced.
      const fetch = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_fetch_observations
           (run_id, root_website_claim_id, eche_row_key, requested_url,
            requested_host, requested_registrable_domain, discovery_method,
            http_status, robots_decision, fetch_policy_version, observed_at)
         SELECT run_id, root_website_claim_id, eche_row_key,
                'https://www.example.ac.uk/owner-path', requested_host,
                requested_registrable_domain, 'ROOT', 301, 'ALLOWED',
                fetch_policy_version, now()
           FROM orgunit_fetch_observations
          WHERE root_website_claim_id IS NOT NULL
          LIMIT 1
         RETURNING id`,
      );
      const redirect = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_redirect_observations
           (fetch_observation_id, http_status, to_url_raw, to_url_resolved,
            target_malformed, scheme_downgraded, host_changed,
            registrable_domain_changed, observed_at)
         VALUES ($1, 301, 'https://www.owner-path.edu/', 'https://www.owner-path.edu/',
                 false, false, true, true, now())
         RETURNING id`,
        [fetch.rows[0]!.id],
      );
      const promotion = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_root_promotions
           (redirect_observation_id, redirect_target_malformed,
            redirect_scheme_downgraded, redirect_domain_changed,
            actor_key, approved_at, reason)
         VALUES ($1, false, false, true, 'owner-cli', now(),
                 'observed 301 onto the register value')
         RETURNING id`,
        [redirect.rows[0]!.id],
      );
      expect(promotion.rows[0]!.id).toBeTruthy();

      const revocation = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_root_promotion_revocations
           (promotion_id, actor_key, revoked_at, reason)
         VALUES ($1, 'owner-cli', now(), 'target went dark') RETURNING id`,
        [promotion.rows[0]!.id],
      );
      expect(revocation.rows[0]!.id).toBeTruthy();
    });

    it('lets research CONSUME an approved root it could not have created', async () => {
      // The third leg of the model: observe, (operator) decide, consume.
      const promotion = await admin.query<{ id: string }>(
        `SELECT id FROM orgunit_root_promotions ORDER BY approved_at LIMIT 1`,
      );
      const run = await research.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version)
         VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
      );
      const { rows } = await research.query<{ id: string }>(
        `INSERT INTO orgunit_fetch_observations
           (run_id, root_promotion_id, eche_row_key, requested_url,
            requested_host, requested_registrable_domain, discovery_method,
            http_status, robots_decision, fetch_policy_version, observed_at)
         VALUES ($1, $2, $3, 'https://www.example.edu/consumed', 'www.example.edu',
                 'example.edu', 'ROOT', 200, 'ALLOWED', 'fetch-1', now())
         RETURNING id`,
        [run.rows[0]!.id, promotion.rows[0]!.id, root.echeRowKey],
      );
      expect(rows[0]!.id).toBeTruthy();
    });
  });

  describe('nwf_research may INSERT its own evidence', () => {
    it('writes a full chain: run, fetch, redirect, page, candidate, completion', async () => {
      // An append-only contract that blocks the legitimate write path is just
      // a broken one, so the whole research-owned chain is exercised here.
      const run = await research.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version)
         VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
      );
      const runId = run.rows[0]!.id;

      const fetch = await research.query<{ id: string }>(
        `INSERT INTO orgunit_fetch_observations
           (run_id, root_website_claim_id, eche_row_key, organisation_id,
            requested_url, requested_host, requested_registrable_domain,
            discovery_method, http_status, robots_decision,
            fetch_policy_version, observed_at)
         VALUES ($1, $2, $3, $4, 'https://www.example.ac.uk/', 'www.example.ac.uk',
                 'example.ac.uk', 'ROOT', 301, 'ALLOWED', 'fetch-1', now())
         RETURNING id`,
        [runId, root.websiteClaimId, root.echeRowKey, root.organisationId],
      );

      const redirect = await research.query<{ id: string }>(
        `INSERT INTO orgunit_redirect_observations
           (fetch_observation_id, http_status, to_url_raw, to_url_resolved,
            target_malformed, scheme_downgraded, host_changed,
            registrable_domain_changed, observed_at)
         VALUES ($1, 301, 'https://www.example.edu/', 'https://www.example.edu/',
                 false, false, true, true, now())
         RETURNING id`,
        [fetch.rows[0]!.id],
      );
      expect(redirect.rows[0]!.id).toBeTruthy();

      const pageFetch = await research.query<{ id: string; root_key: string }>(
        `INSERT INTO orgunit_fetch_observations
           (run_id, root_website_claim_id, eche_row_key, requested_url,
            requested_host, requested_registrable_domain, discovery_method,
            discovery_parent_url, http_status, content_type, charset,
            charset_source, charset_confidence, response_sha256, byte_count,
            robots_decision, fetch_policy_version, observed_at)
         VALUES ($1, $2, $3, 'https://www.example.ac.uk/international',
                 'www.example.ac.uk', 'example.ac.uk', 'LINK',
                 'https://www.example.ac.uk/', 200, 'text/html', 'utf-8',
                 'HTTP_HEADER', 'DECLARED', repeat('b', 64), 4096,
                 'ALLOWED', 'fetch-1', now())
         RETURNING id, root_key`,
        [runId, root.websiteClaimId, root.echeRowKey],
      );

      const page = await research.query<{ id: string }>(
        `INSERT INTO orgunit_page_evidence
           (fetch_observation_id, root_key, title, declared_lang, headings,
            main_text, main_text_chars, extraction_method, rule_version, observed_at)
         VALUES ($1, $2, 'International', 'en', '[]'::jsonb, 'text', 4,
                 'MAIN_ELEMENT', 'rules-1', now())
         RETURNING id`,
        [pageFetch.rows[0]!.id, pageFetch.rows[0]!.root_key],
      );

      const candidate = await research.query<{ id: string }>(
        `INSERT INTO orgunit_page_candidates
           (page_evidence_id, run_id, root_key, track, type_hint,
            candidate_score, signals, rank_within_root, rule_version)
         VALUES ($1, $2, $3, 'INTERNATIONAL_OFFICE', 'UNCLEAR', 8.5,
                 '[]'::jsonb, 1, 'rules-1')
         RETURNING id`,
        [page.rows[0]!.id, runId, pageFetch.rows[0]!.root_key],
      );
      expect(candidate.rows[0]!.id).toBeTruthy();

      const completion = await research.query<{ id: string }>(
        `INSERT INTO orgunit_research_run_completions (run_id, terminal_state, finished_at)
         VALUES ($1, 'COMPLETED', now()) RETURNING id`,
        [runId],
      );
      expect(completion.rows[0]!.id).toBeTruthy();
    });
  });

  describe('nwf_research can change NOTHING', () => {
    it.each(ALL_ORGUNIT_TABLES)('may NOT UPDATE %s', async (table) => {
      await expectDenied(() => research.query(`UPDATE ${table} SET created_at = now()`));
    });

    it.each(ALL_ORGUNIT_TABLES)('may NOT DELETE from %s', async (table) => {
      await expectDenied(() => research.query(`DELETE FROM ${table}`));
    });

    it('may NOT TRUNCATE its own evidence', async () => {
      // Chosen because nothing references it, so the only possible refusal is
      // the privilege one this test is about.
      await expectDenied(() => research.query('TRUNCATE orgunit_page_candidates'));
    });

    it('may NOT TRUNCATE root authority', async () => {
      await expectDenied(() => research.query('TRUNCATE orgunit_root_promotion_revocations'));
    });
  });

  describe('nwf_research cannot touch Phase 1 truth tables', () => {
    it('may NOT INSERT an organisation', async () => {
      await expectDenied(() =>
        research.query(
          `INSERT INTO organisations (eche_row_key, legal_name, display_name, country_code, erasmus_code)
           VALUES ('y|2', 'Y', 'Y', 'FR', 'Y 2')`,
        ),
      );
    });

    it('may NOT UPDATE an organisation', async () => {
      // The exact capability that made a dedicated role necessary: nwf_ingest
      // holds this grant, and web research must not inherit it.
      await expectDenied(() => research.query('UPDATE organisations SET city = NULL'));
    });

    it('may NOT DELETE an organisation', async () => {
      await expectDenied(() => research.query('DELETE FROM organisations'));
    });

    it('may NOT write a website claim', async () => {
      // Promotion must never edit or elect a website claim. It cannot even try.
      await expectDenied(() => research.query("UPDATE website_claims SET raw_value = 'tampered'"));
    });

    it('may NOT write organisation_sources, ingest_runs or an ewp_ table', async () => {
      await expectDenied(() =>
        research.query("UPDATE organisation_sources SET source_url = 'tampered'"),
      );
      await expectDenied(() => research.query('UPDATE ingest_runs SET rows_read = 0'));
      await expectDenied(() => research.query('DELETE FROM ewp_heis'));
    });
  });

  describe('nwf_readonly can audit Phase 2B evidence and change none of it', () => {
    it.each(ALL_ORGUNIT_TABLES)('may SELECT %s', async (table) => {
      await expect(readonly.query(`SELECT count(*) FROM ${table}`)).resolves.toBeDefined();
    });

    it('may NOT INSERT', async () => {
      await expectDenied(() =>
        readonly.query(
          `INSERT INTO orgunit_research_runs
             (started_at, network_vantage, fetch_policy_version, rule_version)
           VALUES (now(), 'x', 'x', 'x')`,
        ),
      );
    });

    it('may NOT approve a root either', async () => {
      await expectDenied(() =>
        readonly.query(
          `INSERT INTO orgunit_root_promotions
             (redirect_observation_id, redirect_target_malformed,
              redirect_scheme_downgraded, redirect_domain_changed,
              actor_key, approved_at)
           VALUES ($1, false, false, true, 'auditor', now())`,
          [promotableRedirectId],
        ),
      );
    });

    it('may NOT UPDATE', async () => {
      await expectDenied(() => readonly.query('UPDATE orgunit_research_runs SET dry_run = true'));
    });

    it('may NOT DELETE', async () => {
      await expectDenied(() => readonly.query('DELETE FROM orgunit_page_candidates'));
    });

    it('still holds no TEMPORARY privilege', async () => {
      const { rows } = await admin.query<{ granted: boolean }>(
        `SELECT has_database_privilege('nwf_readonly', current_database(), 'TEMPORARY') AS granted`,
      );
      expect(rows[0]!.granted).toBe(false);
    });
  });

  describe('owner invariants survive migration 0007', () => {
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

    it('leaves the Phase 1 roles exactly as they were', async () => {
      // Adding a role must not disturb the existing ones. If this fails, a
      // grant in 0007 hit a wider grantee than it named.
      for (const role of ['nwf_ingest', 'nwf_readonly']) {
        const { rows } = await admin.query<{ connect: boolean; usage: boolean }>(
          `SELECT has_database_privilege($1, current_database(), 'CONNECT') AS connect,
                  has_schema_privilege($1, 'public', 'USAGE')               AS usage`,
          [role],
        );
        expect(rows[0]!.connect, `${role} lost CONNECT`).toBe(true);
        expect(rows[0]!.usage, `${role} lost schema USAGE`).toBe(true);
      }

      // nwf_ingest keeps the upsert capability Phase 1A depends on.
      const { rows } = await admin.query<{ granted: boolean }>(
        `SELECT has_table_privilege('nwf_ingest', 'organisations', 'UPDATE') AS granted`,
      );
      expect(rows[0]!.granted).toBe(true);
    });

    it('grants nwf_research SELECT everywhere and INSERT only on evidence', async () => {
      // Read from the catalogue rather than from the migration text: this is
      // the state that actually exists, whatever the SQL appears to say.
      const { rows } = await admin.query<{ table_name: string; privilege_type: string }>(
        `SELECT table_name, privilege_type
           FROM information_schema.role_table_grants
          WHERE grantee = 'nwf_research'
          ORDER BY table_name, privilege_type`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(
          ['SELECT', 'INSERT'],
          `nwf_research holds ${row.privilege_type} on ${row.table_name}`,
        ).toContain(row.privilege_type);
      }

      const writable = rows
        .filter((row) => row.privilege_type === 'INSERT')
        .map((row) => row.table_name)
        .sort();
      // Exactly the evidence tables. Neither root-authority table appears.
      expect(writable).toEqual([...RESEARCH_EVIDENCE_TABLES].sort());

      const readable = rows
        .filter((row) => row.privilege_type === 'SELECT')
        .map((row) => row.table_name)
        .sort();
      expect(readable).toEqual([...ALL_ORGUNIT_TABLES, 'organisations', 'website_claims'].sort());
    });
  });
});

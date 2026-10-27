/**
 * Global R8 - MIGRATION 0017 SAFETY on a DISPOSABLE database.
 *
 * Migration 0017 rebuilds `orgunit_fetch_observations.root_key` (PostgreSQL
 * 16 cannot change a generated column's expression in place). This test
 * proves, rather than argues, that it preserves every historical root key and
 * every evidence row:
 *
 *   1. it creates a fresh `*_test` database, applies 0001-0016 exactly as the
 *      runner does, and seeds claim-rooted and promotion-rooted runs with
 *      robots, root, link and redirect attempts, a redirect observation, a
 *      promotion, page evidence and candidates;
 *   2. it captures every fetch row's `(id, root_key)` and a content digest of
 *      every orgunit table (the fetch table over its pre-0017 column list);
 *   3. ROLLBACK: it runs 0017 inside one transaction, records the locks the
 *      transaction holds, forces a failure, and proves the schema and every
 *      digest are exactly the pre-0017 ones;
 *   4. it then applies 0017 through the REAL runner (`migrate`) and proves
 *      every `(id, root_key)` and every digest byte-identical, every
 *      constraint validated, and `root_key` still GENERATED ALWAYS.
 * The database is dropped afterwards.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { migrate, migrationFiles } from '../../db/migrate.js';
import { adminPool, databaseConfigured } from './helpers.js';

const describeDb = databaseConfigured() ? describe : describe.skip;

const MIGRATIONS_DIR = resolve(process.cwd(), 'migrations');
const MIGRATION_0017 = '0017_subject_research_admission.sql';
const ORGUNIT_TABLES = [
  'orgunit_research_runs',
  'orgunit_research_run_completions',
  'orgunit_redirect_observations',
  'orgunit_root_promotions',
  'orgunit_root_promotion_revocations',
  'orgunit_page_evidence',
  'orgunit_page_candidates',
  'website_claims',
  'organisations',
];

function sql(file: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
}

describeDb(
  'Global R8: migration 0017 preserves every historical root key (disposable database)',
  () => {
    const dbName = `nwf_pe_r8mig_${randomBytes(4).toString('hex')}_test`;
    let admin: pg.Pool;
    let db: pg.Pool;
    let fetchColumns: string[];
    const columnsBefore: Record<string, string[]> = {};
    let before: { keys: string; digests: Record<string, string> };
    let locks: { relation: string; mode: string }[];

    /**
     * Every table digested over its PRE-0017 column list, in its pre-0017
     * order, so a column 0017 ADDS (runs.root_scope, the fetch table's new
     * root and scope columns) can neither hide nor fake a change to what was
     * already there.
     */
    async function digests(): Promise<{ keys: string; digests: Record<string, string> }> {
      const keys = await db.query<{ id: string; root_key: string }>(
        `SELECT id, root_key FROM orgunit_fetch_observations ORDER BY id`,
      );
      const out: Record<string, string> = {};
      for (const table of [...ORGUNIT_TABLES, 'orgunit_fetch_observations']) {
        const { rows } = await db.query<{ d: string }>(
          `SELECT md5(coalesce(string_agg(r, E'\\n' ORDER BY r), '')) AS d
           FROM (SELECT ROW(${columnsBefore[table]!.join(', ')})::text AS r FROM ${table}) x`,
        );
        out[table] = rows[0]!.d;
      }
      return { keys: JSON.stringify(keys.rows), digests: out };
    }

    async function seed(): Promise<void> {
      const ingest = (
        await db.query<{ id: string }>(
          `INSERT INTO ingest_runs (source_system, source_input_kind, status)
         VALUES ('eche', 'operator_file', 'succeeded') RETURNING id`,
        )
      ).rows[0]!.id;
      const claimIds: string[] = [];
      for (const [key, host] of [
        ['X MIG01|999000201', 'www.mig-one.example.ac.uk'],
        ['X MIG02|999000202', 'www.mig-two.example.ac.uk'],
      ] as const) {
        const org = (
          await db.query<{ id: string }>(
            `INSERT INTO organisations (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
           VALUES ($1, 'Migration Institution', 'Migration Institution', 'FR', $2, $3) RETURNING id`,
            [key, key.split('|')[0], key.split('|')[1]],
          )
        ).rows[0]!.id;
        claimIds.push(
          (
            await db.query<{ id: string }>(
              `INSERT INTO website_claims
               (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
                structural_status, normalised_url, hostname, registrable_domain,
                rule_version, source_artifact_sha256, observed_at, ingest_run_id)
             VALUES ('ECHE_PUBLISHED', $1, $2, $1, $3, 'STRUCTURALLY_VALID', $4, $3,
                     'example.ac.uk', 'test-rules-1', repeat('a', 64), now(), $5)
             RETURNING id`,
              [key, org, host, `https://${host}/`, ingest],
            )
          ).rows[0]!.id,
        );
      }
      const run = (
        await db.query<{ id: string }>(
          `INSERT INTO orgunit_research_runs (started_at, network_vantage, fetch_policy_version, rule_version)
         VALUES (now(), 'test', 'fetch-1', 'rules-1') RETURNING id`,
        )
      ).rows[0]!.id;
      const fetch = async (
        claimId: string | null,
        promotionId: string | null,
        key: string,
        url: string,
        method: string,
        status: number,
        parent: string | null = null,
      ) =>
        (
          await db.query<{ id: string; root_key: string }>(
            `INSERT INTO orgunit_fetch_observations
             (run_id, root_website_claim_id, root_promotion_id, eche_row_key, requested_url,
              requested_host, requested_registrable_domain, discovery_method, discovery_parent_url,
              attempt_no, http_status, response_sha256, byte_count, robots_decision,
              fetch_policy_version, observed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, repeat('d', 64), 10,
                   'ALLOWED', 'fetch-1', now())
           RETURNING id, root_key`,
            [
              run,
              claimId,
              promotionId,
              key,
              url,
              new URL(url).hostname,
              new URL(url).hostname.split('.').slice(-3).join('.'),
              method,
              parent,
              status,
            ],
          )
        ).rows[0]!;
      const k1 = 'X MIG01|999000201';
      const k2 = 'X MIG02|999000202';
      await fetch(
        claimIds[0]!,
        null,
        k1,
        'https://www.mig-one.example.ac.uk/robots.txt',
        'ROBOTS',
        200,
      );
      const root1 = await fetch(
        claimIds[0]!,
        null,
        k1,
        'https://www.mig-one.example.ac.uk/',
        'ROOT',
        200,
      );
      const link1 = await fetch(
        claimIds[0]!,
        null,
        k1,
        'https://www.mig-one.example.ac.uk/intl/',
        'LINK',
        200,
        'https://www.mig-one.example.ac.uk/',
      );
      const hop = await fetch(
        claimIds[1]!,
        null,
        k2,
        'https://www.mig-two.example.ac.uk/',
        'ROOT',
        301,
      );
      const redirect = (
        await db.query<{ id: string }>(
          `INSERT INTO orgunit_redirect_observations
           (fetch_observation_id, http_status, to_url_raw, to_url_resolved, target_malformed,
            scheme_downgraded, host_changed, registrable_domain_changed, observed_at)
         VALUES ($1, 301, 'https://www.mig-moved.example.edu/', 'https://www.mig-moved.example.edu/',
                 false, false, true, true, now()) RETURNING id`,
          [hop.id],
        )
      ).rows[0]!.id;
      const promotion = (
        await db.query<{ id: string }>(
          `INSERT INTO orgunit_root_promotions
           (redirect_observation_id, redirect_target_malformed, redirect_scheme_downgraded,
            redirect_domain_changed, actor_key, approved_at, reason)
         VALUES ($1, false, false, true, 'owner-cli', now(), 'migration test') RETURNING id`,
          [redirect],
        )
      ).rows[0]!.id;
      const promoted = await fetch(
        null,
        promotion,
        k2,
        'https://www.mig-moved.example.edu/',
        'ROOT',
        200,
      );
      for (const f of [root1, link1, promoted]) {
        const page = (
          await db.query<{ id: string }>(
            `INSERT INTO orgunit_page_evidence
             (fetch_observation_id, root_key, headings, main_text, main_text_chars,
              extraction_method, rule_version, observed_at)
           VALUES ($1, $2, '["International"]'::jsonb, 'International office text', 25,
                   'MAIN_ELEMENT', 'rules-1', now()) RETURNING id`,
            [f.id, f.root_key],
          )
        ).rows[0]!.id;
        for (const [rank, track] of [
          [1, 'INTERNATIONAL_OFFICE'],
          [1, 'LANGUAGE_CENTRE'],
        ] as const) {
          await db.query(
            `INSERT INTO orgunit_page_candidates
             (page_evidence_id, run_id, root_key, track, type_hint, candidate_score,
              signals, rank_within_root, rule_version)
           VALUES ($1, $2, $3, $4, NULL, -2.5, '[]'::jsonb, $5, 'rules-1')`,
            [page, run, f.root_key, track, f === link1 ? rank + 1 : rank],
          );
        }
      }
      await db.query(
        `INSERT INTO orgunit_research_run_completions (run_id, terminal_state, finished_at)
       VALUES ($1, 'COMPLETED', now())`,
        [run],
      );
    }

    beforeAll(async () => {
      admin = adminPool();
      await admin.query(`CREATE DATABASE ${dbName} TEMPLATE template0`);
      const url = new URL(testDatabaseUrl('admin')!);
      url.pathname = `/${dbName}`;
      db = new pg.Pool({ connectionString: url.toString(), max: 2 });
      await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (const file of migrationFiles().filter((f) => f < '0017')) {
        const text = sql(file);
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          await client.query(text);
          await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
            file.slice(0, 4),
            createHash('sha256').update(text, 'utf8').digest('hex'),
          ]);
          await client.query('COMMIT');
        } finally {
          client.release();
        }
      }
      await seed();
      for (const table of [...ORGUNIT_TABLES, 'orgunit_fetch_observations']) {
        columnsBefore[table] = (
          await db.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
            [table],
          )
        ).rows.map((r) => r.column_name);
      }
      fetchColumns = columnsBefore['orgunit_fetch_observations']!;
      before = await digests();
    });

    afterAll(async () => {
      await db?.end();
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
    });

    it('seeds a realistic pre-0017 corpus: claim and promotion roots, pages, candidates, a redirect', async () => {
      const { rows } = await db.query<{ root_key: string }>(
        `SELECT DISTINCT split_part(root_key, ':', 1) AS root_key FROM orgunit_fetch_observations ORDER BY 1`,
      );
      expect(rows.map((r) => r.root_key)).toEqual(['claim', 'promotion']);
      expect(fetchColumns).toContain('root_key');
      expect(fetchColumns).not.toContain('root_subject_admission_id');
      expect(JSON.parse(before.keys)).toHaveLength(5);
    });

    it('ROLLBACK: a failure inside the 0017 transaction leaves the schema and every row exactly as before', async () => {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql(MIGRATION_0017));
        locks = (
          await client.query<{ relation: string; mode: string }>(
            `SELECT c.relname AS relation, l.mode FROM pg_locks l
             JOIN pg_class c ON c.oid = l.relation
            WHERE l.pid = pg_backend_pid() AND l.granted
              AND c.relname IN ('orgunit_fetch_observations', 'orgunit_page_evidence',
                                'orgunit_research_runs', 'discovery_subject_identity_claims')
            ORDER BY 1, 2`,
          )
        ).rows;
        await expect(client.query('SELECT 1 / 0')).rejects.toMatchObject({ code: '22012' });
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      expect(await digests()).toEqual(before);
      const { rows } = await db.query<{
        expr: string;
        nullable: string;
        admissions: string | null;
      }>(
        `SELECT pg_get_expr(d.adbin, d.adrelid) AS expr,
              (SELECT is_nullable FROM information_schema.columns
                WHERE table_name = 'orgunit_fetch_observations' AND column_name = 'eche_row_key') AS nullable,
              to_regclass('public.subject_research_admissions')::text AS admissions
         FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE d.adrelid = 'orgunit_fetch_observations'::regclass AND a.attname = 'root_key'`,
      );
      expect(rows[0]!.expr).not.toContain('subject_admission');
      expect(rows[0]!.nullable).toBe('NO');
      expect(rows[0]!.admissions).toBeNull();
    });

    it('records the locks 0017 holds until COMMIT', () => {
      const modes = (relation: string) =>
        locks.filter((l) => l.relation === relation).map((l) => l.mode);
      expect(modes('orgunit_fetch_observations')).toContain('AccessExclusiveLock');
      expect(modes('orgunit_page_evidence')).toContain('AccessExclusiveLock');
      expect(modes('orgunit_research_runs')).toContain('AccessExclusiveLock');
      expect(modes('discovery_subject_identity_claims')).toContain('ShareLock');
    });

    it('the REAL runner applies 0017, and every historical root key and evidence row is byte-identical', async () => {
      const result = await migrate(db);
      // Lane L1: the real runner now also applies 0018 (candidate run scope,
      // ADR 0025 s12), whose new foreign key validates this historical corpus;
      // REL L2: then 0019 (source-discovery nominations, ADR 0026).
      expect(result.applied).toEqual([
        MIGRATION_0017,
        '0018_subject_research_roots.sql',
        '0019_source_discovery_nominations.sql',
        // REL P2: then 0020 (link-out nomination identities and sightings).
        '0020_source_discovery_link_out_sightings.sql',
        // REL Q1: then 0021 (the jurisdiction-claim writer grants and triggers).
        '0021_subject_jurisdiction_claim_writer.sql',
        // WW E-SD: then 0022 (OWNER-path live source-discovery grants).
        '0022_source_discovery_live_grants.sql',
        // WW E-Q: then 0023 (acquisition campaigns and the work queue, ADR 0029).
        '0023_acquisition_campaigns_and_queue.sql',
        // WW E-W: then 0024 (campaign research admission and the wiring, ADR 0030).
        '0024_campaign_research_admission_and_wiring.sql',
        // WW E-SDFX: then 0025 (the source-discovery search gate, ADR 0028 s9).
        '0025_source_discovery_search_gate.sql',
        // WW H-ACQ: then 0026 (acquisition hardening, ADR 0030 s13).
        '0026_acquisition_hardening.sql',
      ]);
      expect(await digests()).toEqual(before);
      const { rows } = await db.query<{
        admission: string | null;
        run_scope: string;
        root_key: string;
      }>(
        `SELECT root_subject_admission_id AS admission, run_root_scope AS run_scope, root_key
         FROM orgunit_fetch_observations`,
      );
      for (const row of rows) {
        expect(row.admission).toBeNull();
        expect(row.run_scope).toBe('ECHE');
        expect(row.root_key).toMatch(/^(claim|promotion):[0-9a-f-]{36}$/);
      }
      const scopes = await db.query(`SELECT DISTINCT root_scope FROM orgunit_research_runs`);
      expect(scopes.rows).toEqual([{ root_scope: 'ECHE' }]);
    });

    it('keeps root_key GENERATED ALWAYS, and every rebuilt constraint is validated', async () => {
      const generated = await db.query(
        `SELECT attgenerated FROM pg_attribute
        WHERE attrelid = 'orgunit_fetch_observations'::regclass AND attname IN ('root_key', 'run_root_scope')`,
      );
      expect(generated.rows).toEqual([{ attgenerated: 's' }, { attgenerated: 's' }]);
      const constraints = await db.query<{ conname: string; convalidated: boolean }>(
        `SELECT conname, convalidated FROM pg_constraint
        WHERE conname IN ('orgunit_page_evidence_root_fk', 'orgunit_fetch_observations_run_scope_fk',
                          'orgunit_fetch_observations_root_xor_chk',
                          'orgunit_fetch_observations_subject_root_chk',
                          'orgunit_page_candidates_root_fk')
        ORDER BY conname`,
      );
      expect(constraints.rows).toEqual(
        [
          'orgunit_fetch_observations_root_xor_chk',
          'orgunit_fetch_observations_run_scope_fk',
          'orgunit_fetch_observations_subject_root_chk',
          'orgunit_page_candidates_root_fk',
          'orgunit_page_evidence_root_fk',
        ].map((conname) => ({ conname, convalidated: true })),
      );
      const indexes = await db.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
        WHERE indexname IN ('orgunit_fetch_observations_dedupe_uidx',
                            'orgunit_fetch_observations_id_root_key_uidx')
        ORDER BY indexname`,
      );
      expect(indexes.rows.map((r) => r.indexdef.replace(/^.* USING /, ''))).toEqual([
        'btree (run_id, root_key, requested_url, fetch_policy_version, attempt_no)',
        'btree (id, root_key)',
      ]);
      const forged = await db
        .query(
          `INSERT INTO orgunit_fetch_observations
           (run_id, root_website_claim_id, eche_row_key, requested_url, requested_host,
            requested_registrable_domain, discovery_method, http_status, robots_decision,
            fetch_policy_version, observed_at, root_key)
         SELECT run_id, root_website_claim_id, eche_row_key, requested_url || 'x', requested_host,
                requested_registrable_domain, 'ROOT', 200, 'ALLOWED', 'fetch-1', now(), 'claim:forged'
           FROM orgunit_fetch_observations WHERE root_website_claim_id IS NOT NULL LIMIT 1`,
        )
        .then(
          () => 'SUCCEEDED',
          (e: { code?: string }) => e.code,
        );
      expect(forged).toBe('428C9');
    });
  },
);

/**
 * Proves migration 0007's SCHEMA CONTRACT against a real PostgreSQL server.
 *
 * A CHECK constraint written in a migration and a CHECK constraint the database
 * actually enforces are different things, and the difference is only visible
 * when something tries to violate one. Every invariant ADR 0004 leans on is
 * exercised here by attempting the violation and requiring the refusal.
 *
 * These run as the OWNER on purpose: this file is about constraints, not
 * privileges, and using the owner means a refusal can only have come from the
 * constraint. Privileges are orgunitGrants.test.ts.
 *
 * They run against nwf_pe_test, never the working database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  adminPool,
  databaseConfigured,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';

const describeDb = databaseConfigured() ? describe : describe.skip;

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

async function expectSqlState(fn: () => Promise<unknown>, state: string): Promise<void> {
  try {
    await fn();
  } catch (err) {
    expect((err as { code?: string }).code).toBe(state);
    return;
  }
  throw new Error(`Expected the statement to fail with SQLSTATE ${state}, but it succeeded.`);
}

const ORGUNIT_TABLES = [
  'orgunit_research_runs',
  'orgunit_research_run_completions',
  'orgunit_fetch_observations',
  'orgunit_redirect_observations',
  'orgunit_root_promotion_events',
  'orgunit_page_evidence',
  'orgunit_page_candidates',
];

describeDb('Phase 2B schema contract (integration)', () => {
  let admin: pg.Pool;
  let root: OrgunitRootFixture;
  let runId: string;

  /** A fetch observation rooted in the seeded website claim. */
  async function insertFetch(
    overrides: {
      url?: string;
      status?: number | null;
      errorKind?: string | null;
      discovery?: string;
      parent?: string | null;
      sha?: string | null;
      bytes?: number | null;
    } = {},
  ): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url,
          requested_host, requested_registrable_domain, discovery_method,
          discovery_parent_url, http_status, error_kind, response_sha256,
          byte_count, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, $4, 'www.example.ac.uk', 'example.ac.uk', $5, $6,
               $7, $8, $9, $10, 'ALLOWED', 'fetch-1', now())
       RETURNING id`,
      [
        runId,
        root.websiteClaimId,
        root.echeRowKey,
        overrides.url ?? `https://www.example.ac.uk/${Math.random().toString(36).slice(2)}`,
        overrides.discovery ?? 'ROOT',
        overrides.parent ?? null,
        overrides.status === undefined ? 200 : overrides.status,
        overrides.errorKind ?? null,
        overrides.sha ?? null,
        overrides.bytes ?? null,
      ],
    );
    return rows[0]!.id;
  }

  async function insertRedirect(
    fetchId: string,
    overrides: {
      resolved?: string | null;
      malformed?: boolean;
      scheme?: boolean | null;
      host?: boolean | null;
      domain?: boolean | null;
    } = {},
  ): Promise<string> {
    const resolved =
      overrides.resolved === undefined ? 'https://www.example.edu/' : overrides.resolved;
    // All three comparison facts default together with the target: known when
    // it resolved, NULL when it did not. Defaulting any of them to a literal
    // would make "the facts are unknown" inexpressible, which is exactly the
    // state the schema is meant to allow.
    const fact = (override: boolean | null | undefined, known: boolean): boolean | null =>
      override === undefined ? (resolved === null ? null : known) : override;
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_redirect_observations
         (fetch_observation_id, http_status, to_url_raw, to_url_resolved,
          target_malformed, scheme_downgraded, host_changed,
          registrable_domain_changed, observed_at)
       VALUES ($1, 301, 'https://www.example.edu/', $2, $3, $4, $5, $6, now())
       RETURNING id`,
      [
        fetchId,
        resolved,
        overrides.malformed ?? resolved === null,
        fact(overrides.scheme, false),
        fact(overrides.host, true),
        fact(overrides.domain, true),
      ],
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    admin = adminPool();
    await truncateAll(admin);
    root = await seedOrgunitRoot(admin);
    const run = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version)
       VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
    );
    runId = run.rows[0]!.id;
  });

  afterAll(async () => {
    await admin.end();
  });

  describe('migration 0007 is applied and sequential', () => {
    it('records versions 0001 through 0007 with no gaps', async () => {
      const { rows } = await admin.query<{ version: string }>(
        'SELECT version FROM schema_migrations ORDER BY version',
      );
      expect(rows.map((r) => r.version)).toEqual([
        '0001',
        '0002',
        '0003',
        '0004',
        '0005',
        '0006',
        '0007',
      ]);
    });

    it('creates all seven orgunit tables', async () => {
      const { rows } = await admin.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'orgunit%'
          ORDER BY table_name`,
      );
      expect(rows.map((r) => r.table_name)).toEqual([...ORGUNIT_TABLES].sort());
    });
  });

  describe('the research-run lifecycle is append-only and derivable', () => {
    it('accepts exactly one terminal event per run', async () => {
      const run = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version)
         VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
      );
      const id = run.rows[0]!.id;

      await admin.query(
        `INSERT INTO orgunit_research_run_completions (run_id, terminal_state, finished_at)
         VALUES ($1, 'COMPLETED', now())`,
        [id],
      );
      // A second terminal row would make the derived status ambiguous.
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_research_run_completions (run_id, terminal_state, finished_at)
             VALUES ($1, 'FAILED', now())`,
            [id],
          ),
        UNIQUE_VIOLATION,
      );
    });

    it('permits only COMPLETED, FAILED and ABORTED as a terminal state', async () => {
      const run = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version)
         VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
      );
      // 'RUNNING' is not terminal, and a running row here would recreate the
      // mutable status column this design exists to avoid.
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_research_run_completions (run_id, terminal_state, finished_at)
             VALUES ($1, 'RUNNING', now())`,
            [run.rows[0]!.id],
          ),
        CHECK_VIOLATION,
      );
    });

    it('refuses a COMPLETED run that also carries an error', async () => {
      const run = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version)
         VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
      );
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_research_run_completions
               (run_id, terminal_state, finished_at, error_kind)
             VALUES ($1, 'COMPLETED', now(), 'TIMEOUT')`,
            [run.rows[0]!.id],
          ),
        CHECK_VIOLATION,
      );
    });

    it('gives the run table no status or finished_at column at all', async () => {
      const { rows } = await admin.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'orgunit_research_runs'`,
      );
      const columns = rows.map((r) => r.column_name);
      expect(columns).not.toContain('status');
      expect(columns).not.toContain('finished_at');
      expect(columns).toContain('rule_version');
      expect(columns).toContain('fetch_policy_version');
    });
  });

  describe('root provenance is exactly one authority', () => {
    it('refuses a fetch with no root authority', async () => {
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_fetch_observations
               (run_id, eche_row_key, requested_url, requested_host,
                requested_registrable_domain, discovery_method, http_status,
                robots_decision, fetch_policy_version, observed_at)
             VALUES ($1, $2, 'https://www.example.ac.uk/', 'www.example.ac.uk',
                     'example.ac.uk', 'ROOT', 200, 'ALLOWED', 'fetch-1', now())`,
            [runId, root.echeRowKey],
          ),
        CHECK_VIOLATION,
      );
    });

    it('refuses a fetch claiming BOTH a claim root and a promotion root', async () => {
      const fetchId = await insertFetch();
      const redirectId = await insertRedirect(fetchId);
      const promotion = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_root_promotion_events
           (redirect_observation_id, target_url, decision, decided_by, decided_at)
         VALUES ($1, 'https://www.example.edu/', 'APPROVE', 'operator-a', now())
         RETURNING id`,
        [redirectId],
      );

      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_fetch_observations
               (run_id, root_website_claim_id, root_promotion_event_id, eche_row_key,
                requested_url, requested_host, requested_registrable_domain,
                discovery_method, http_status, robots_decision,
                fetch_policy_version, observed_at)
             VALUES ($1, $2, $3, $4, 'https://www.example.edu/both', 'www.example.edu',
                     'example.edu', 'ROOT', 200, 'ALLOWED', 'fetch-1', now())`,
            [runId, root.websiteClaimId, promotion.rows[0]!.id, root.echeRowKey],
          ),
        CHECK_VIOLATION,
      );
    });

    it('accepts a fetch rooted in an operator promotion', async () => {
      const fetchId = await insertFetch();
      const redirectId = await insertRedirect(fetchId);
      const promotion = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_root_promotion_events
           (redirect_observation_id, target_url, decision, decided_by, decided_at)
         VALUES ($1, 'https://www.example.edu/', 'APPROVE', 'operator-a', now())
         RETURNING id`,
        [redirectId],
      );
      const { rows } = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_fetch_observations
           (run_id, root_promotion_event_id, eche_row_key, requested_url,
            requested_host, requested_registrable_domain, discovery_method,
            http_status, robots_decision, fetch_policy_version, observed_at)
         VALUES ($1, $2, $3, 'https://www.example.edu/promoted', 'www.example.edu',
                 'example.edu', 'ROOT', 200, 'ALLOWED', 'fetch-1', now())
         RETURNING id`,
        [runId, promotion.rows[0]!.id, root.echeRowKey],
      );
      expect(rows[0]!.id).toBeTruthy();
    });

    it('keeps organisation_id nullable on every table that carries one', async () => {
      // A NOT NULL link would turn a page into evidence of entity resolution.
      const { rows } = await admin.query<{ table_name: string; is_nullable: string }>(
        `SELECT table_name, is_nullable FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name LIKE 'orgunit%'
            AND column_name = 'organisation_id'`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.is_nullable, `${row.table_name}.organisation_id is NOT NULL`).toBe('YES');
      }
    });
  });

  describe('redirect evidence keeps facts separate and unknowns unknown', () => {
    it('refuses a resolved target that is also flagged malformed', async () => {
      const fetchId = await insertFetch();
      await expectSqlState(
        () => insertRedirect(fetchId, { resolved: 'https://www.example.edu/', malformed: true }),
        CHECK_VIOLATION,
      );
    });

    it('requires the comparison facts to be NULL when the target is malformed', async () => {
      const fetchId = await insertFetch();
      // A malformed target cannot have answered "did the host change?".
      await expectSqlState(
        () => insertRedirect(fetchId, { resolved: null, host: true, domain: true }),
        CHECK_VIOLATION,
      );
      // With the facts left unknown it is accepted.
      const id = await insertRedirect(fetchId, { resolved: null, host: null, domain: null });
      expect(id).toBeTruthy();
    });

    it('refuses a changed registrable domain on an unchanged host', async () => {
      const fetchId = await insertFetch();
      await expectSqlState(
        () => insertRedirect(fetchId, { host: false, domain: true }),
        CHECK_VIOLATION,
      );
    });

    it('records a same-domain host change as exactly that', async () => {
      // The case a single CROSS_DOMAIN enum would have flattened.
      const fetchId = await insertFetch();
      const id = await insertRedirect(fetchId, {
        resolved: 'https://international.example.ac.uk/',
        host: true,
        domain: false,
      });
      const { rows } = await admin.query<{
        host_changed: boolean;
        registrable_domain_changed: boolean;
      }>(
        `SELECT host_changed, registrable_domain_changed
           FROM orgunit_redirect_observations WHERE id = $1`,
        [id],
      );
      expect(rows[0]!.host_changed).toBe(true);
      expect(rows[0]!.registrable_domain_changed).toBe(false);
    });

    it('stores at most one edge per request', async () => {
      const fetchId = await insertFetch();
      await insertRedirect(fetchId);
      await expectSqlState(() => insertRedirect(fetchId), UNIQUE_VIOLATION);
    });
  });

  describe('cross-domain promotion is an explicit, append-only decision', () => {
    it('permits only APPROVE and REVOKE', async () => {
      const redirectId = await insertRedirect(await insertFetch());
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_root_promotion_events
               (redirect_observation_id, target_url, decision, decided_by, decided_at)
             VALUES ($1, 'https://www.example.edu/', 'MAYBE', 'operator-a', now())`,
            [redirectId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('requires an observed redirect behind every promotion', async () => {
      // redirect_observation_id is NOT NULL, so a promotion invented from
      // nothing cannot be recorded at all.
      const { rows } = await admin.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_name = 'orgunit_root_promotion_events'
            AND column_name = 'redirect_observation_id'`,
      );
      expect(rows[0]!.is_nullable).toBe('NO');
    });

    it('refuses an addressable identifier in the operator label', async () => {
      const redirectId = await insertRedirect(await insertFetch());
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_root_promotion_events
               (redirect_observation_id, target_url, decision, decided_by, decided_at)
             VALUES ($1, 'https://www.example.edu/', 'APPROVE',
                     'operator' || chr(64) || 'example.org', now())`,
            [redirectId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('collapses an identical resubmission but preserves a genuine revocation', async () => {
      const redirectId = await insertRedirect(await insertFetch());
      const at = '2026-08-25T10:00:00Z';
      const insert = (decision: string): Promise<unknown> =>
        admin.query(
          `INSERT INTO orgunit_root_promotion_events
             (redirect_observation_id, target_url, decision, decided_by, decided_at)
           VALUES ($1, 'https://www.example.edu/', $2, 'operator-a', $3)`,
          [redirectId, decision, at],
        );

      await insert('APPROVE');
      // The identical decision again is a duplicate, not a new fact.
      await expectSqlState(() => insert('APPROVE'), UNIQUE_VIOLATION);
      // A withdrawal is a DIFFERENT decision and must survive beside it.
      await insert('REVOKE');

      const { rows } = await admin.query<{ decision: string }>(
        `SELECT decision FROM orgunit_root_promotion_events
          WHERE redirect_observation_id = $1 ORDER BY decision`,
        [redirectId],
      );
      expect(rows.map((r) => r.decision)).toEqual(['APPROVE', 'REVOKE']);
    });
  });

  describe('fetch observations are bounded, versioned and idempotent per run', () => {
    it('refuses an observation with neither a status nor an error', async () => {
      await expectSqlState(() => insertFetch({ status: null, errorKind: null }), CHECK_VIOLATION);
    });

    it('accepts a status AND an error together', async () => {
      // A response can arrive and then time out mid-body. Modelling these as
      // mutually exclusive would force that case to lie.
      const id = await insertFetch({ status: 200, errorKind: 'READ_TIMEOUT' });
      expect(id).toBeTruthy();
    });

    it('refuses a body hash without a byte count', async () => {
      await expectSqlState(
        () => insertFetch({ sha: 'c'.repeat(64), bytes: null }),
        CHECK_VIOLATION,
      );
    });

    it('refuses a link with no parent, and a root with one', async () => {
      await expectSqlState(() => insertFetch({ discovery: 'LINK', parent: null }), CHECK_VIOLATION);
      await expectSqlState(
        () => insertFetch({ discovery: 'ROOT', parent: 'https://www.example.ac.uk/' }),
        CHECK_VIOLATION,
      );
    });

    it('deduplicates the same URL for the same run, root and policy', async () => {
      const url = 'https://www.example.ac.uk/idempotent';
      await insertFetch({ url });
      // NULLS NOT DISTINCT is what makes this fire: root_promotion_event_id is
      // NULL on both rows, and under default NULL semantics they would be
      // considered distinct and the index would guarantee nothing.
      await expectSqlState(() => insertFetch({ url }), UNIQUE_VIOLATION);
    });

    it('re-observes the same URL freely in a different run', async () => {
      const url = 'https://www.example.ac.uk/reobserved';
      await insertFetch({ url });
      const other = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version)
         VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
      );
      const { rows } = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_fetch_observations
           (run_id, root_website_claim_id, eche_row_key, requested_url,
            requested_host, requested_registrable_domain, discovery_method,
            http_status, robots_decision, fetch_policy_version, observed_at)
         VALUES ($1, $2, $3, $4, 'www.example.ac.uk', 'example.ac.uk', 'ROOT',
                 200, 'ALLOWED', 'fetch-1', now())
         RETURNING id`,
        [other.rows[0]!.id, root.websiteClaimId, root.echeRowKey, url],
      );
      expect(rows[0]!.id).toBeTruthy();
    });

    it('constrains the charset triple, the robots decision and the error taxonomy', async () => {
      await expectSqlState(
        () => insertFetch({ errorKind: 'GREMLINS', status: null }),
        CHECK_VIOLATION,
      );
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_fetch_observations
               (run_id, root_website_claim_id, eche_row_key, requested_url,
                requested_host, requested_registrable_domain, discovery_method,
                http_status, charset, robots_decision, fetch_policy_version, observed_at)
             VALUES ($1, $2, $3, 'https://www.example.ac.uk/charset', 'www.example.ac.uk',
                     'example.ac.uk', 'ROOT', 200, 'utf-8', 'ALLOWED', 'fetch-1', now())`,
            [runId, root.websiteClaimId, root.echeRowKey],
          ),
        CHECK_VIOLATION,
      );
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_fetch_observations
               (run_id, root_website_claim_id, eche_row_key, requested_url,
                requested_host, requested_registrable_domain, discovery_method,
                http_status, robots_decision, fetch_policy_version, observed_at)
             VALUES ($1, $2, $3, 'https://www.example.ac.uk/robots-decision',
                     'www.example.ac.uk', 'example.ac.uk', 'ROOT', 200,
                     'PROBABLY_FINE', 'fetch-1', now())`,
            [runId, root.websiteClaimId, root.echeRowKey],
          ),
        CHECK_VIOLATION,
      );
    });
  });

  describe('page evidence is derived text, never a response body', () => {
    async function insertPage(mainText: string, ruleVersion = 'rules-1'): Promise<string> {
      const fetchId = await insertFetch({ sha: 'd'.repeat(64), bytes: 1024 });
      const { rows } = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_page_evidence
           (fetch_observation_id, headings, main_text, main_text_chars,
            extraction_method, rule_version, observed_at)
         VALUES ($1, '[]'::jsonb, $2, length($2), 'MAIN_ELEMENT', $3, now())
         RETURNING id`,
        [fetchId, mainText, ruleVersion],
      );
      return rows[0]!.id;
    }

    it('stores no raw-body column of any spelling', async () => {
      const { rows } = await admin.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name LIKE 'orgunit%'`,
      );
      for (const row of rows) {
        expect(
          /(raw_html|raw_body|response_body|html_body|page_html|full_html|body_html|content_html|raw_response|raw_markup|page_source|html_source|html_content|response_text|raw_content|page_body)/.test(
            row.column_name,
          ),
          `${row.table_name}.${row.column_name} is a raw body`,
        ).toBe(false);
      }
    });

    it('enforces the extracted-text cap', async () => {
      await expectSqlState(() => insertPage('x'.repeat(200001)), CHECK_VIOLATION);
      await expect(insertPage('x'.repeat(200000))).resolves.toBeTruthy();
    });

    it('requires main_text_chars to be the truth about main_text', async () => {
      const fetchId = await insertFetch({ sha: 'e'.repeat(64), bytes: 1024 });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_evidence
               (fetch_observation_id, headings, main_text, main_text_chars,
                extraction_method, rule_version, observed_at)
             VALUES ($1, '[]'::jsonb, 'four', 999, 'MAIN_ELEMENT', 'rules-1', now())`,
            [fetchId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('stores one extraction per fetch per rule version, and appends on a rule change', async () => {
      const fetchId = await insertFetch({ sha: 'f'.repeat(64), bytes: 1024 });
      const insert = (ruleVersion: string): Promise<unknown> =>
        admin.query(
          `INSERT INTO orgunit_page_evidence
             (fetch_observation_id, headings, main_text, main_text_chars,
              extraction_method, rule_version, observed_at)
           VALUES ($1, '[]'::jsonb, 'text', 4, 'MAIN_ELEMENT', $2, now())`,
          [fetchId, ruleVersion],
        );
      await insert('rules-1');
      await expectSqlState(() => insert('rules-1'), UNIQUE_VIOLATION);
      // A NEW rule version yields a NEW row beside the old one.
      await insert('rules-2');
      const { rows } = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_page_evidence WHERE fetch_observation_id = $1`,
        [fetchId],
      );
      expect(rows[0]!.n).toBe('2');
    });

    it('refuses a declared language that is not a language tag', async () => {
      const fetchId = await insertFetch({ sha: '1'.repeat(64), bytes: 1024 });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_evidence
               (fetch_observation_id, declared_lang, headings, main_text,
                main_text_chars, extraction_method, rule_version, observed_at)
             VALUES ($1, 'not a tag', '[]'::jsonb, 'text', 4, 'MAIN_ELEMENT',
                     'rules-1', now())`,
            [fetchId],
          ),
        CHECK_VIOLATION,
      );
    });
  });

  describe('a candidate is a rank and cannot become a verdict', () => {
    async function insertPageFor(url: string): Promise<string> {
      const fetchId = await insertFetch({ url, sha: '2'.repeat(64), bytes: 1024 });
      const { rows } = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_page_evidence
           (fetch_observation_id, headings, main_text, main_text_chars,
            extraction_method, rule_version, observed_at)
         VALUES ($1, '[]'::jsonb, 'text', 4, 'MAIN_ELEMENT', 'rules-1', now())
         RETURNING id`,
        [fetchId],
      );
      return rows[0]!.id;
    }

    function insertCandidate(
      pageId: string,
      opts: { track?: string; hint?: string | null; rank?: number; rule?: string } = {},
    ): Promise<unknown> {
      return admin.query(
        `INSERT INTO orgunit_page_candidates
           (page_evidence_id, run_id, eche_row_key, root_website_claim_id,
            track, type_hint, candidate_score, signals, rank_within_root, rule_version)
         VALUES ($1, $2, $3, $4, $5, $6, 1.5, '[]'::jsonb, $7, $8)`,
        [
          pageId,
          runId,
          root.echeRowKey,
          root.websiteClaimId,
          opts.track ?? 'INTERNATIONAL_OFFICE',
          opts.hint === undefined ? 'UNCLEAR' : opts.hint,
          opts.rank ?? 1,
          opts.rule ?? 'rules-1',
        ],
      );
    }

    it('has no relevance, verdict or lifecycle column', async () => {
      const { rows } = await admin.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'orgunit_page_candidates'`,
      );
      const columns = rows.map((r) => r.column_name);
      expect(columns.length).toBeGreaterThan(0);
      for (const forbidden of [
        'status',
        'relevant',
        'is_relevant',
        'confirmed',
        'verified',
        'preferred',
        'approved',
        'classification_status',
        'contactable',
        'outreach_eligible',
        'compliance_passed',
        'frontier_score',
      ]) {
        expect(columns, `orgunit_page_candidates declares ${forbidden}`).not.toContain(forbidden);
      }
      expect(columns).toContain('candidate_score');
      expect(columns).toContain('rank_within_root');
    });

    it('permits only the three country-blind tracks', async () => {
      const pageId = await insertPageFor('https://www.example.ac.uk/track');
      await expectSqlState(
        () => insertCandidate(pageId, { track: 'FRENCH_UNIVERSITY' }),
        CHECK_VIOLATION,
      );
    });

    it('admits DEGREE_PROGRAMME and UNCLEAR as honest hints', async () => {
      const a = await insertPageFor('https://www.example.ac.uk/hint-a');
      await expect(insertCandidate(a, { hint: 'DEGREE_PROGRAMME' })).resolves.toBeDefined();
      const b = await insertPageFor('https://www.example.ac.uk/hint-b');
      await expect(insertCandidate(b, { hint: null, rank: 2 })).resolves.toBeDefined();
    });

    it('stores one result per page per rule version per track', async () => {
      const pageId = await insertPageFor('https://www.example.ac.uk/dedupe');
      await insertCandidate(pageId, { rank: 10 });
      await expectSqlState(() => insertCandidate(pageId, { rank: 11 }), UNIQUE_VIOLATION);
      // A different track over the same page is a different result.
      await expect(
        insertCandidate(pageId, { track: 'LANGUAGE_CENTRE', rank: 10 }),
      ).resolves.toBeDefined();
    });

    it('refuses two candidates claiming the same rank within one root', async () => {
      // A rank that can be claimed twice is decorative, not an ordering.
      const a = await insertPageFor('https://www.example.ac.uk/rank-a');
      const b = await insertPageFor('https://www.example.ac.uk/rank-b');
      await insertCandidate(a, { rank: 42 });
      await expectSqlState(() => insertCandidate(b, { rank: 42 }), UNIQUE_VIOLATION);
    });

    it('refuses a rank below one', async () => {
      const pageId = await insertPageFor('https://www.example.ac.uk/rank-zero');
      await expectSqlState(() => insertCandidate(pageId, { rank: 0 }), CHECK_VIOLATION);
    });

    it('carries its rule version, so a rule change appends rather than rewrites', async () => {
      const pageId = await insertPageFor('https://www.example.ac.uk/versioned');
      await insertCandidate(pageId, { rule: 'rules-1', rank: 100 });
      await insertCandidate(pageId, { rule: 'rules-2', rank: 100 });
      const { rows } = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_page_candidates WHERE page_evidence_id = $1`,
        [pageId],
      );
      expect(rows[0]!.n).toBe('2');
    });
  });

  describe('no Phase 2B table stores contact data or assumes a locale', () => {
    it('declares no contact-shaped column', async () => {
      const { rows } = await admin.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name LIKE 'orgunit%'`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(
          /(^|_)(email|mailbox|phone|telephone|mobile|fax|linkedin|first_name|last_name|full_name|job_title|person)(_|$)/.test(
            row.column_name,
          ),
          `${row.table_name}.${row.column_name} is contact data`,
        ).toBe(false);
      }
    });

    it('declares no country, market or target-language column', async () => {
      const { rows } = await admin.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name LIKE 'orgunit%'`,
      );
      const columns = rows.map((r) => r.column_name);
      for (const forbidden of [
        'country_code',
        'country',
        'target_language',
        'learner_language',
        'partner_country',
        'market',
        'locale',
      ]) {
        expect(columns, `a Phase 2B table declares ${forbidden}`).not.toContain(forbidden);
      }
      // The one language-shaped column is the document's own declaration.
      expect(columns).toContain('declared_lang');
    });
  });
});

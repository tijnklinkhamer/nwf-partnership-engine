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
const NOT_NULL_VIOLATION = '23502';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const GENERATED_ALWAYS_VIOLATION = '428C9';

async function expectSqlState(fn: () => Promise<unknown>, state: string): Promise<void> {
  try {
    await fn();
  } catch (err) {
    expect((err as { code?: string }).code).toBe(state);
    return;
  }
  throw new Error(`Expected the statement to fail with SQLSTATE ${state}, but it succeeded.`);
}

/**
 * For the rare case where TWO independent gates refuse the same statement and
 * either may fire first. Asserting one specific code there would be asserting
 * PostgreSQL's constraint evaluation order, which is not a guarantee and not
 * what the test is about.
 */
async function expectRefused(fn: () => Promise<unknown>, states: string[]): Promise<void> {
  try {
    await fn();
  } catch (err) {
    expect(states).toContain((err as { code?: string }).code);
    return;
  }
  throw new Error(
    `Expected the statement to be refused (${states.join(' or ')}), but it succeeded.`,
  );
}

/**
 * The eight Phase 2B-1 acquisition tables. Extended by
 * orgunitClassifierSchema.test.ts's own CLASSIFIER_TABLES list for the four
 * Phase 2B-2 tables migration 0009 adds - listed separately there rather than
 * merged in here, so this file's "acquisition tables" inventory and that
 * file's "classifier tables" inventory each stay an accurate, minimal
 * description of what they are actually testing.
 */
const ORGUNIT_TABLES = [
  'orgunit_research_runs',
  'orgunit_research_run_completions',
  'orgunit_fetch_observations',
  'orgunit_redirect_observations',
  'orgunit_root_promotions',
  'orgunit_root_promotion_revocations',
  'orgunit_page_evidence',
  'orgunit_page_candidates',
];

/** The four Phase 2B-2 classifier tables migration 0009 adds. */
const CLASSIFIER_TABLES = [
  'orgunit_classifier_calls',
  'orgunit_classifier_call_completions',
  'orgunit_page_classifications',
  'orgunit_classification_subjects',
];

interface FetchRow {
  id: string;
  root_key: string;
}

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
      attempt?: number;
      runId?: string;
    } = {},
  ): Promise<FetchRow> {
    const { rows } = await admin.query<FetchRow>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url,
          requested_host, requested_registrable_domain, discovery_method,
          discovery_parent_url, attempt_no, http_status, error_kind,
          response_sha256, byte_count, robots_decision, fetch_policy_version,
          observed_at)
       VALUES ($1, $2, $3, $4, 'www.example.ac.uk', 'example.ac.uk', $5, $6,
               $7, $8, $9, $10, $11, 'ALLOWED', 'fetch-1', now())
       RETURNING id, root_key`,
      [
        overrides.runId ?? runId,
        root.websiteClaimId,
        root.echeRowKey,
        overrides.url ?? `https://www.example.ac.uk/${Math.random().toString(36).slice(2)}`,
        overrides.discovery ?? 'ROOT',
        overrides.parent ?? null,
        overrides.attempt ?? 1,
        overrides.status === undefined ? 200 : overrides.status,
        overrides.errorKind ?? null,
        overrides.sha ?? null,
        overrides.bytes ?? null,
      ],
    );
    return rows[0]!;
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

  /** An operator approval of a redirect observation, via the owner path. */
  function approve(
    redirectId: string,
    opts: {
      malformed?: boolean;
      downgraded?: boolean;
      domainChanged?: boolean;
      actor?: string;
      at?: string;
    } = {},
  ): Promise<pg.QueryResult<{ id: string }>> {
    return admin.query<{ id: string }>(
      `INSERT INTO orgunit_root_promotions
         (redirect_observation_id, redirect_target_malformed,
          redirect_scheme_downgraded, redirect_domain_changed,
          actor_key, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        redirectId,
        opts.malformed ?? false,
        opts.downgraded ?? false,
        opts.domainChanged ?? true,
        opts.actor ?? 'owner-cli',
        opts.at ?? new Date().toISOString(),
      ],
    );
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

  describe('the Phase 2B migrations are applied and sequential', () => {
    it('records versions 0001 through 0009 with no gaps', async () => {
      const { rows } = await admin.query<{ version: string }>(
        'SELECT version FROM schema_migrations ORDER BY version',
      );
      // Extended for 0009 (the Phase 2B-2 classifier foundation). This list
      // is pinned deliberately so a new migration cannot arrive unnoticed:
      // adding one is meant to fail here first and be acknowledged here
      // explicitly.
      expect(rows.map((r) => r.version)).toEqual([
        '0001',
        '0002',
        '0003',
        '0004',
        '0005',
        '0006',
        '0007',
        '0008',
        '0009',
      ]);
    });

    it('creates all twelve orgunit tables (eight acquisition, four classifier)', async () => {
      const { rows } = await admin.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'orgunit%'
          ORDER BY table_name`,
      );
      expect(rows.map((r) => r.table_name)).toEqual(
        [...ORGUNIT_TABLES, ...CLASSIFIER_TABLES].sort(),
      );
    });
  });

  describe('the research-run lifecycle is append-only and derivable', () => {
    async function newRun(): Promise<string> {
      const { rows } = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version)
         VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
      );
      return rows[0]!.id;
    }

    it('accepts exactly one terminal event per run', async () => {
      const id = await newRun();
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
      // 'RUNNING' is not terminal, and a running row here would recreate the
      // mutable status column this design exists to avoid.
      const id = await newRun();
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_research_run_completions (run_id, terminal_state, finished_at)
             VALUES ($1, 'RUNNING', now())`,
            [id],
          ),
        CHECK_VIOLATION,
      );
    });

    it('refuses a COMPLETED run that also carries an error', async () => {
      const id = await newRun();
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_research_run_completions
               (run_id, terminal_state, finished_at, error_kind)
             VALUES ($1, 'COMPLETED', now(), 'TIMEOUT')`,
            [id],
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

  describe('root provenance is exactly one authority, and it is generated', () => {
    it('refuses a fetch with no root authority', async () => {
      // TWO independent gates catch this, and either may fire first: the XOR
      // CHECK, and the NOT NULL on the generated root_key - which evaluates to
      // NULL precisely when neither root column is set. Asserting one specific
      // code would be asserting constraint evaluation order rather than the
      // guarantee, so both are accepted.
      await expectRefused(
        () =>
          admin.query(
            `INSERT INTO orgunit_fetch_observations
               (run_id, eche_row_key, requested_url, requested_host,
                requested_registrable_domain, discovery_method, http_status,
                robots_decision, fetch_policy_version, observed_at)
             VALUES ($1, $2, 'https://www.example.ac.uk/no-root', 'www.example.ac.uk',
                     'example.ac.uk', 'ROOT', 200, 'ALLOWED', 'fetch-1', now())`,
            [runId, root.echeRowKey],
          ),
        [CHECK_VIOLATION, NOT_NULL_VIOLATION],
      );
    });

    it('refuses a fetch claiming BOTH a claim root and a promotion root', async () => {
      const promotion = await approve(await insertRedirect((await insertFetch()).id));
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_fetch_observations
               (run_id, root_website_claim_id, root_promotion_id, eche_row_key,
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

    it('derives root_key from the root columns and refuses to let anyone write it', async () => {
      // GENERATED ALWAYS is what makes root_key incapable of disagreeing with
      // the columns it summarises - and therefore what makes the downstream
      // composite foreign keys meaningful.
      const fetch = await insertFetch();
      expect(fetch.root_key).toBe(`claim:${root.websiteClaimId}`);

      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_fetch_observations
               (run_id, root_website_claim_id, eche_row_key, requested_url,
                requested_host, requested_registrable_domain, discovery_method,
                http_status, robots_decision, fetch_policy_version, observed_at,
                root_key)
             VALUES ($1, $2, $3, 'https://www.example.ac.uk/forged', 'www.example.ac.uk',
                     'example.ac.uk', 'ROOT', 200, 'ALLOWED', 'fetch-1', now(),
                     'claim:forged')`,
            [runId, root.websiteClaimId, root.echeRowKey],
          ),
        GENERATED_ALWAYS_VIOLATION,
      );
    });

    it('keeps organisation_id nullable everywhere it appears in Phase 2B-1', async () => {
      // A NOT NULL link would turn a page into evidence of entity resolution.
      // Within the Phase 2B-1 acquisition tables it appears exactly once: a
      // second copy is a second place that can disagree. Migration 0009
      // (Phase 2B-2) repeats the same convenience-link pattern on
      // orgunit_classifier_calls for the same reason - a different table with
      // the identical nullable-convenience-link justification, not a second
      // copy WITHIN this table's own provenance chain.
      const { rows } = await admin.query<{ table_name: string; is_nullable: string }>(
        `SELECT table_name, is_nullable FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name LIKE 'orgunit%'
            AND column_name = 'organisation_id'
          ORDER BY table_name`,
      );
      expect(rows.map((r) => r.table_name)).toEqual([
        'orgunit_classifier_calls',
        'orgunit_fetch_observations',
      ]);
      for (const row of rows) {
        expect(row.is_nullable, `${row.table_name}.organisation_id`).toBe('YES');
      }
    });
  });

  describe('redirect evidence keeps facts separate and unknowns unknown', () => {
    it('refuses a resolved target that is also flagged malformed', async () => {
      const fetch = await insertFetch();
      await expectSqlState(
        () => insertRedirect(fetch.id, { resolved: 'https://www.example.edu/', malformed: true }),
        CHECK_VIOLATION,
      );
    });

    it('requires the comparison facts to be NULL when the target is malformed', async () => {
      const fetch = await insertFetch();
      // A malformed target cannot have answered "did the host change?".
      await expectSqlState(
        () => insertRedirect(fetch.id, { resolved: null, host: true, domain: true }),
        CHECK_VIOLATION,
      );
      const id = await insertRedirect(fetch.id, {
        resolved: null,
        scheme: null,
        host: null,
        domain: null,
      });
      expect(id).toBeTruthy();
    });

    it('refuses a changed registrable domain on an unchanged host', async () => {
      const fetch = await insertFetch();
      await expectSqlState(
        () => insertRedirect(fetch.id, { host: false, domain: true }),
        CHECK_VIOLATION,
      );
    });

    it('records a same-domain host change as exactly that', async () => {
      // The case a single CROSS_DOMAIN enum would have flattened.
      const fetch = await insertFetch();
      const id = await insertRedirect(fetch.id, {
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
      const fetch = await insertFetch();
      await insertRedirect(fetch.id);
      await expectSqlState(() => insertRedirect(fetch.id), UNIQUE_VIOLATION);
    });
  });

  describe('cross-domain promotion is an explicit, structurally-gated decision', () => {
    it('always refers to one actual redirect observation', async () => {
      const { rows } = await admin.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_name = 'orgunit_root_promotions'
            AND column_name = 'redirect_observation_id'`,
      );
      expect(rows[0]!.is_nullable).toBe('NO');
      // And it must be a redirect that exists.
      await expectSqlState(
        () => approve('00000000-0000-0000-0000-000000000000'),
        FOREIGN_KEY_VIOLATION,
      );
    });

    it('stores NO url of its own, so it cannot name a different target', async () => {
      // THE FIX FOR "observed example-a.edu, approved example-b.edu": there is
      // simply nowhere to write a divergent target. The promoted URL is the
      // referenced observation's to_url_resolved and nothing else.
      const { rows } = await admin.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'orgunit_root_promotions'`,
      );
      const columns = rows.map((r) => r.column_name);
      for (const forbidden of ['target_url', 'url', 'promoted_url', 'root_url', 'to_url']) {
        expect(columns, `orgunit_root_promotions declares ${forbidden}`).not.toContain(forbidden);
      }

      // The target is reachable, and it is the observed one.
      const fetch = await insertFetch();
      const redirectId = await insertRedirect(fetch.id, { resolved: 'https://www.derived.edu/' });
      const promotion = await approve(redirectId);
      const target = await admin.query<{ to_url_resolved: string }>(
        `SELECT r.to_url_resolved
           FROM orgunit_root_promotions p
           JOIN orgunit_redirect_observations r ON r.id = p.redirect_observation_id
          WHERE p.id = $1`,
        [promotion.rows[0]!.id],
      );
      expect(target.rows[0]!.to_url_resolved).toBe('https://www.derived.edu/');
    });

    it('refuses to approve a malformed redirect target', async () => {
      const fetch = await insertFetch();
      const redirectId = await insertRedirect(fetch.id, {
        resolved: null,
        scheme: null,
        host: null,
        domain: null,
      });
      // Claiming the facts were fine finds no matching parent key; claiming
      // them honestly fails the CHECK. Both paths are closed.
      await expectSqlState(() => approve(redirectId), FOREIGN_KEY_VIOLATION);
      await expectSqlState(
        () => approve(redirectId, { malformed: true, domainChanged: true }),
        CHECK_VIOLATION,
      );
    });

    it('refuses to approve an HTTPS to HTTP downgrade', async () => {
      const fetch = await insertFetch();
      const redirectId = await insertRedirect(fetch.id, {
        resolved: 'http://www.insecure.edu/',
        scheme: true,
        host: true,
        domain: true,
      });
      // Honest mirroring hits the CHECK; lying about it finds no parent key.
      await expectSqlState(() => approve(redirectId, { downgraded: true }), CHECK_VIOLATION);
      await expectSqlState(() => approve(redirectId, { downgraded: false }), FOREIGN_KEY_VIOLATION);
    });

    it('refuses to promote a hop that never left the registrable domain', async () => {
      // Approving one would grant authority the run already had.
      const fetch = await insertFetch();
      const redirectId = await insertRedirect(fetch.id, {
        resolved: 'https://international.example.ac.uk/',
        host: true,
        domain: false,
      });
      await expectSqlState(() => approve(redirectId, { domainChanged: false }), CHECK_VIOLATION);
      await expectSqlState(
        () => approve(redirectId, { domainChanged: true }),
        FOREIGN_KEY_VIOLATION,
      );
    });

    it('refuses an actor key that is not an opaque slug', async () => {
      const redirectId = await insertRedirect((await insertFetch()).id);
      for (const actor of [
        'operator' + String.fromCharCode(64) + 'example.org',
        'Jane Doe',
        'jane.doe',
        'ab',
        '',
      ]) {
        await expectSqlState(() => approve(redirectId, { actor }), CHECK_VIOLATION);
      }
      await expect(approve(redirectId, { actor: 'owner-cli' })).resolves.toBeDefined();
    });

    it('collapses an identical resubmission but keeps a later re-approval', async () => {
      const redirectId = await insertRedirect((await insertFetch()).id);
      const at = '2026-08-25T10:00:00Z';
      await approve(redirectId, { at });
      await expectSqlState(() => approve(redirectId, { at }), UNIQUE_VIOLATION);
      // A later decision is a genuinely different, separately auditable one.
      await expect(approve(redirectId, { at: '2026-08-26T10:00:00Z' })).resolves.toBeDefined();
    });
  });

  describe('revocation is append-only and can never authorise anything', () => {
    it('leaves the approval intact as historical evidence', async () => {
      const redirectId = await insertRedirect((await insertFetch()).id);
      const promotion = await approve(redirectId);
      const promotionId = promotion.rows[0]!.id;

      await admin.query(
        `INSERT INTO orgunit_root_promotion_revocations (promotion_id, actor_key, revoked_at)
         VALUES ($1, 'owner-cli', now())`,
        [promotionId],
      );

      const { rows } = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_root_promotions WHERE id = $1`,
        [promotionId],
      );
      expect(rows[0]!.n).toBe('1');

      // The derived question: is this root currently active?
      const active = await admin.query<{ active: boolean }>(
        `SELECT NOT EXISTS (
                  SELECT 1 FROM orgunit_root_promotion_revocations WHERE promotion_id = p.id
                ) AS active
           FROM orgunit_root_promotions p WHERE p.id = $1`,
        [promotionId],
      );
      expect(active.rows[0]!.active).toBe(false);
    });

    it('records at most one revocation per approval', async () => {
      const promotion = await approve(await insertRedirect((await insertFetch()).id));
      const revoke = (): Promise<unknown> =>
        admin.query(
          `INSERT INTO orgunit_root_promotion_revocations (promotion_id, actor_key, revoked_at)
           VALUES ($1, 'owner-cli', now())`,
          [promotion.rows[0]!.id],
        );
      await revoke();
      await expectSqlState(revoke, UNIQUE_VIOLATION);
    });

    it('CANNOT be referenced as a fetch root authority', async () => {
      // THE STRUCTURAL PROOF. root_promotion_id references the APPROVAL table,
      // so a revocation id is not merely disallowed by convention - it is not
      // a value the foreign key can accept at all.
      const promotion = await approve(await insertRedirect((await insertFetch()).id));
      const revocation = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_root_promotion_revocations (promotion_id, actor_key, revoked_at)
         VALUES ($1, 'owner-cli', now()) RETURNING id`,
        [promotion.rows[0]!.id],
      );

      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_fetch_observations
               (run_id, root_promotion_id, eche_row_key, requested_url,
                requested_host, requested_registrable_domain, discovery_method,
                http_status, robots_decision, fetch_policy_version, observed_at)
             VALUES ($1, $2, $3, 'https://www.example.edu/via-revocation', 'www.example.edu',
                     'example.edu', 'ROOT', 200, 'ALLOWED', 'fetch-1', now())`,
            [runId, revocation.rows[0]!.id, root.echeRowKey],
          ),
        FOREIGN_KEY_VIOLATION,
      );
    });

    it('has no foreign key from any table into the revocation table', async () => {
      // Belt and braces on the assertion above, read from the catalogue.
      const { rows } = await admin.query<{ dependent: string }>(
        `SELECT c.relname AS dependent
           FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
           JOIN pg_class r ON r.oid = con.confrelid
          WHERE con.contype = 'f'
            AND r.relname = 'orgunit_root_promotion_revocations'`,
      );
      expect(rows).toEqual([]);
    });

    it('leaves the original website claim byte-for-byte untouched', async () => {
      // Promotion is about a redirect target. It elects no winner and edits no
      // claim, so the Phase 1D disagreement survives a promotion intact.
      const { rows } = await admin.query<{ raw_value: string; registrable_domain: string }>(
        `SELECT raw_value, registrable_domain FROM website_claims WHERE id = $1`,
        [root.websiteClaimId],
      );
      expect(rows[0]!.raw_value).toBe('www.example.ac.uk');
      expect(rows[0]!.registrable_domain).toBe('example.ac.uk');
    });
  });

  describe('fetch observations record ATTEMPTS, so retries survive', () => {
    it('stores a retry beside the attempt it retried', async () => {
      // The whole point: a failed first attempt must not be conflicted away by
      // the successful second, because the transient failure IS the evidence.
      const url = 'https://www.example.ac.uk/retried';
      const first = await insertFetch({
        url,
        attempt: 1,
        status: null,
        errorKind: 'CONNECT_TIMEOUT',
      });
      const second = await insertFetch({ url, attempt: 2, status: 200 });
      expect(first.id).not.toBe(second.id);

      const { rows } = await admin.query<{ attempt_no: number; error_kind: string | null }>(
        `SELECT attempt_no, error_kind FROM orgunit_fetch_observations
          WHERE run_id = $1 AND requested_url = $2 ORDER BY attempt_no`,
        [runId, url],
      );
      expect(rows.map((r) => r.attempt_no)).toEqual([1, 2]);
      expect(rows[0]!.error_kind).toBe('CONNECT_TIMEOUT');
      expect(rows[1]!.error_kind).toBeNull();
    });

    it('collapses an exact duplicate of the SAME attempt', async () => {
      const url = 'https://www.example.ac.uk/same-attempt';
      await insertFetch({ url, attempt: 1 });
      await expectSqlState(() => insertFetch({ url, attempt: 1 }), UNIQUE_VIOLATION);
    });

    it('allows attempt 1 again in a different run', async () => {
      const url = 'https://www.example.ac.uk/reobserved';
      await insertFetch({ url, attempt: 1 });
      const other = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version)
         VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
      );
      await expect(
        insertFetch({ url, attempt: 1, runId: other.rows[0]!.id }),
      ).resolves.toBeDefined();
    });

    it('rejects attempt numbers below one', async () => {
      await expectSqlState(() => insertFetch({ attempt: 0 }), CHECK_VIOLATION);
      await expectSqlState(() => insertFetch({ attempt: -1 }), CHECK_VIOLATION);
    });
  });

  describe('fetch observations are bounded and versioned', () => {
    it('refuses an observation with neither a status nor an error', async () => {
      await expectSqlState(() => insertFetch({ status: null, errorKind: null }), CHECK_VIOLATION);
    });

    it('accepts a status AND an error together', async () => {
      // A response can arrive and then time out mid-body. Modelling these as
      // mutually exclusive would force that case to lie.
      await expect(insertFetch({ status: 200, errorKind: 'READ_TIMEOUT' })).resolves.toBeDefined();
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
      const fetch = await insertFetch({ sha: 'd'.repeat(64), bytes: 1024 });
      const { rows } = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_page_evidence
           (fetch_observation_id, root_key, headings, main_text, main_text_chars,
            extraction_method, rule_version, observed_at)
         VALUES ($1, $2, '[]'::jsonb, $3, length($3), 'MAIN_ELEMENT', $4, now())
         RETURNING id`,
        [fetch.id, fetch.root_key, mainText, ruleVersion],
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

    it('enforces the 40,000-character extracted-text cap', async () => {
      await expectSqlState(() => insertPage('x'.repeat(40001)), CHECK_VIOLATION);
      await expect(insertPage('x'.repeat(40000))).resolves.toBeTruthy();
    });

    it('requires main_text_chars to be the truth about main_text', async () => {
      const fetch = await insertFetch({ sha: 'e'.repeat(64), bytes: 1024 });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_evidence
               (fetch_observation_id, root_key, headings, main_text, main_text_chars,
                extraction_method, rule_version, observed_at)
             VALUES ($1, $2, '[]'::jsonb, 'four', 999, 'MAIN_ELEMENT', 'rules-1', now())`,
            [fetch.id, fetch.root_key],
          ),
        CHECK_VIOLATION,
      );
    });

    it('stores one extraction per fetch per rule version, and appends on a rule change', async () => {
      const fetch = await insertFetch({ sha: 'f'.repeat(64), bytes: 1024 });
      const insert = (ruleVersion: string): Promise<unknown> =>
        admin.query(
          `INSERT INTO orgunit_page_evidence
             (fetch_observation_id, root_key, headings, main_text, main_text_chars,
              extraction_method, rule_version, observed_at)
           VALUES ($1, $2, '[]'::jsonb, 'text', 4, 'MAIN_ELEMENT', $3, now())`,
          [fetch.id, fetch.root_key, ruleVersion],
        );
      await insert('rules-1');
      await expectSqlState(() => insert('rules-1'), UNIQUE_VIOLATION);
      await insert('rules-2');
      const { rows } = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_page_evidence WHERE fetch_observation_id = $1`,
        [fetch.id],
      );
      expect(rows[0]!.n).toBe('2');
    });

    it('refuses a declared language that is not a language tag', async () => {
      const fetch = await insertFetch({ sha: '1'.repeat(64), bytes: 1024 });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_evidence
               (fetch_observation_id, root_key, declared_lang, headings, main_text,
                main_text_chars, extraction_method, rule_version, observed_at)
             VALUES ($1, $2, 'not a tag', '[]'::jsonb, 'text', 4, 'MAIN_ELEMENT',
                     'rules-1', now())`,
            [fetch.id, fetch.root_key],
          ),
        CHECK_VIOLATION,
      );
    });
  });

  describe('PROVENANCE CANNOT CONTRADICT ITSELF', () => {
    /** A second, genuinely different root: an operator-approved promotion. */
    async function promotedRoot(): Promise<string> {
      const promotion = await approve(await insertRedirect((await insertFetch()).id));
      const { rows } = await admin.query<FetchRow>(
        `INSERT INTO orgunit_fetch_observations
           (run_id, root_promotion_id, eche_row_key, requested_url, requested_host,
            requested_registrable_domain, discovery_method, http_status,
            response_sha256, byte_count, robots_decision, fetch_policy_version,
            observed_at)
         VALUES ($1, $2, $3, $4, 'www.example.edu', 'example.edu', 'ROOT', 200,
                 repeat('9', 64), 2048, 'ALLOWED', 'fetch-1', now())
         RETURNING id, root_key`,
        [
          runId,
          promotion.rows[0]!.id,
          root.echeRowKey,
          `https://www.example.edu/${Math.random().toString(36).slice(2)}`,
        ],
      );
      return rows[0]!.root_key;
    }

    it('refuses page evidence claiming a root its own fetch does not have', async () => {
      const fetch = await insertFetch({ sha: '2'.repeat(64), bytes: 1024 });
      const otherRootKey = await promotedRoot();
      expect(otherRootKey).not.toBe(fetch.root_key);

      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_evidence
               (fetch_observation_id, root_key, headings, main_text, main_text_chars,
                extraction_method, rule_version, observed_at)
             VALUES ($1, $2, '[]'::jsonb, 'text', 4, 'MAIN_ELEMENT', 'rules-1', now())`,
            [fetch.id, otherRootKey],
          ),
        FOREIGN_KEY_VIOLATION,
      );
    });

    it('refuses a candidate claiming a root its own page does not have', async () => {
      // THE CONTRADICTION THE OLD DESIGN ALLOWED: page from root A, candidate
      // claiming root B. The database itself refuses it now - no application
      // code is involved, and no future writer can get it wrong.
      const fetch = await insertFetch({ sha: '3'.repeat(64), bytes: 1024 });
      const page = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_page_evidence
           (fetch_observation_id, root_key, headings, main_text, main_text_chars,
            extraction_method, rule_version, observed_at)
         VALUES ($1, $2, '[]'::jsonb, 'text', 4, 'MAIN_ELEMENT', 'rules-1', now())
         RETURNING id`,
        [fetch.id, fetch.root_key],
      );
      const otherRootKey = await promotedRoot();

      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_candidates
               (page_evidence_id, run_id, root_key, track, candidate_score,
                signals, rank_within_root, rule_version)
             VALUES ($1, $2, $3, 'INTERNATIONAL_OFFICE', 1.0, '[]'::jsonb, 1, 'rules-1')`,
            [page.rows[0]!.id, runId, otherRootKey],
          ),
        FOREIGN_KEY_VIOLATION,
      );
    });

    it('carries no duplicated eche_row_key or organisation_id to contradict', async () => {
      // The other half of the fix: provenance that is not stored twice cannot
      // disagree with itself. These live on the fetch observation only.
      for (const table of ['orgunit_page_evidence', 'orgunit_page_candidates']) {
        const { rows } = await admin.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
          [table],
        );
        const columns = rows.map((r) => r.column_name);
        for (const forbidden of [
          'eche_row_key',
          'organisation_id',
          'root_website_claim_id',
          'root_promotion_id',
        ]) {
          expect(columns, `${table} duplicates ${forbidden}`).not.toContain(forbidden);
        }
      }
    });

    it('still reaches the full provenance by join', async () => {
      // Removing the copies must not remove the ability to answer the question.
      const fetch = await insertFetch({ sha: '4'.repeat(64), bytes: 1024 });
      const page = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_page_evidence
           (fetch_observation_id, root_key, headings, main_text, main_text_chars,
            extraction_method, rule_version, observed_at)
         VALUES ($1, $2, '[]'::jsonb, 'text', 4, 'MAIN_ELEMENT', 'rules-1', now())
         RETURNING id`,
        [fetch.id, fetch.root_key],
      );
      await admin.query(
        `INSERT INTO orgunit_page_candidates
           (page_evidence_id, run_id, root_key, track, candidate_score,
            signals, rank_within_root, rule_version)
         VALUES ($1, $2, $3, 'LANGUAGE_CENTRE', 2.0, '[]'::jsonb, 7, 'rules-join')`,
        [page.rows[0]!.id, runId, fetch.root_key],
      );

      const { rows } = await admin.query<{
        eche_row_key: string;
        organisation_id: string | null;
        root_website_claim_id: string | null;
      }>(
        `SELECT f.eche_row_key, f.organisation_id, f.root_website_claim_id
           FROM orgunit_page_candidates c
           JOIN orgunit_page_evidence p ON p.id = c.page_evidence_id
           JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
          WHERE c.rule_version = 'rules-join'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.eche_row_key).toBe(root.echeRowKey);
      expect(rows[0]!.root_website_claim_id).toBe(root.websiteClaimId);
    });
  });

  describe('a candidate is a rank and cannot become a verdict', () => {
    async function insertPageFor(url: string): Promise<FetchRow & { pageId: string }> {
      const fetch = await insertFetch({ url, sha: '5'.repeat(64), bytes: 1024 });
      const { rows } = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_page_evidence
           (fetch_observation_id, root_key, headings, main_text, main_text_chars,
            extraction_method, rule_version, observed_at)
         VALUES ($1, $2, '[]'::jsonb, 'text', 4, 'MAIN_ELEMENT', 'rules-1', now())
         RETURNING id`,
        [fetch.id, fetch.root_key],
      );
      return { ...fetch, pageId: rows[0]!.id };
    }

    function insertCandidate(
      page: { pageId: string; root_key: string },
      opts: { track?: string; hint?: string | null; rank?: number; rule?: string } = {},
    ): Promise<unknown> {
      return admin.query(
        `INSERT INTO orgunit_page_candidates
           (page_evidence_id, run_id, root_key, track, type_hint, candidate_score,
            signals, rank_within_root, rule_version)
         VALUES ($1, $2, $3, $4, $5, 1.5, '[]'::jsonb, $6, $7)`,
        [
          page.pageId,
          runId,
          page.root_key,
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
      const page = await insertPageFor('https://www.example.ac.uk/track');
      await expectSqlState(
        () => insertCandidate(page, { track: 'FRENCH_UNIVERSITY' }),
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
      const page = await insertPageFor('https://www.example.ac.uk/dedupe');
      await insertCandidate(page, { rank: 10 });
      await expectSqlState(() => insertCandidate(page, { rank: 11 }), UNIQUE_VIOLATION);
      await expect(
        insertCandidate(page, { track: 'LANGUAGE_CENTRE', rank: 10 }),
      ).resolves.toBeDefined();
    });

    it('keeps rank unique within run, root, track and rule version', async () => {
      // A rank that can be claimed twice is decorative, not an ordering. The
      // index now works off root_key, which is FK-pinned rather than copied.
      const a = await insertPageFor('https://www.example.ac.uk/rank-a');
      const b = await insertPageFor('https://www.example.ac.uk/rank-b');
      expect(a.root_key).toBe(b.root_key);
      await insertCandidate(a, { rank: 42 });
      await expectSqlState(() => insertCandidate(b, { rank: 42 }), UNIQUE_VIOLATION);
      // The same rank on a different track is a different ordering.
      await expect(
        insertCandidate(b, { track: 'STUDENT_ASSOCIATION', rank: 42 }),
      ).resolves.toBeDefined();
    });

    it('refuses a rank below one', async () => {
      const page = await insertPageFor('https://www.example.ac.uk/rank-zero');
      await expectSqlState(() => insertCandidate(page, { rank: 0 }), CHECK_VIOLATION);
    });

    it('carries its rule version, so a rule change appends rather than rewrites', async () => {
      const page = await insertPageFor('https://www.example.ac.uk/versioned');
      await insertCandidate(page, { rule: 'rules-1', rank: 100 });
      await insertCandidate(page, { rule: 'rules-2', rank: 100 });
      const { rows } = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_page_candidates WHERE page_evidence_id = $1`,
        [page.pageId],
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

    it('names the operator by an opaque key and nothing else', async () => {
      for (const table of ['orgunit_root_promotions', 'orgunit_root_promotion_revocations']) {
        const { rows } = await admin.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
          [table],
        );
        const columns = rows.map((r) => r.column_name);
        expect(columns).toContain('actor_key');
        for (const forbidden of ['decided_by', 'approved_by', 'revoked_by', 'operator_name']) {
          expect(columns, `${table} declares ${forbidden}`).not.toContain(forbidden);
        }
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

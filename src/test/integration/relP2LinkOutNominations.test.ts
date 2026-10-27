/**
 * REL P2 - PERSISTENT LINK-OUT NOMINATIONS, end to end, against a DISPOSABLE
 * PostgreSQL (`*_test` only). Every page comes from a SCRIPTED transport and
 * every review signature from a TEST-ONLY key; nothing leaves the process.
 *
 *   1. LEAST PRIVILEGE: the disposable `nwf_source_discovery_login_<hex>`
 *      login holds nothing until it SET ROLEs into the capability, and the
 *      capability can append and read nominations, identities and sightings
 *      and nothing else - no UPDATE/DELETE/TRUNCATE, no Phase 1 truth beyond
 *      the granted columns, no page evidence, claim, admission or promotion
 *      write, no other role, no DDL, no TEMP.
 *   2. DEDUPE + EVIDENCE: subject A (a Dutch non-university language
 *      organisation) links to an unknown niche organisation B from several
 *      pages and several runs: ONE nomination per run (0019), ONE identity
 *      across runs naming the first nomination, and EVERY (page, URL) kept as
 *      a sighting with its page evidence, run, redacted anchor text and
 *      observed_at. A replayed offer is idempotent. Only the first
 *      nomination is promotable.
 *   3. NEVER AUTHORISES A FETCH: no request to B's domain during A's runs;
 *      the gateway refuses B's URL under A's root before any DNS; a
 *      nomination id is not an admission; the research role cannot read a
 *      nomination; and a promoted but unadmitted B is refused research.
 *   4. NICHE DISCOVERY (NL, JP, MX): A's run nominates B -> the OWNER path
 *      promotes it (B2.2 writer), reviews it (B2.3), admits it (0017) ->
 *      research of B stores B's OWN evidence under B's own admission. B was in
 *      no seed list and no ECHE claim, and no request reached B's domain
 *      before its admission.
 *   5. CLI: `orgunits subjects research --execute` records link-outs when
 *      DATABASE_URL_SOURCE_DISCOVERY is set, says DISCARDED when it is not,
 *      refuses a login without the capability before any run, and the
 *      variable is validated (an empty value is an invalid environment).
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runOrgunitsSubjectsResearch } from '../../cli/commands/orgunitsSubjects.js';
import { runSourceDiscoveryCli } from '../../cli/commands/sourceDiscovery.js';
import { env, testDatabaseUrl } from '../../config/env.js';
import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import { runSubjectDiscovery } from '../../orgunits/orchestrator/orchestrate.js';
import { completeRun, startSubjectRun } from '../../orgunits/orchestrator/run.js';
import { createLinkOutNominationSink } from '../../orgunits/sourceDiscovery/linkOut.js';
import { verifySubjectAdmission } from '../../orgunits/subjectRun/admission.js';
import { runSubjectResearch } from '../../orgunits/subjectRun/execute.js';
import { executeWebAttempt } from '../../orgunits/web/gateway.js';
import { RobotsAuthorisation } from '../../orgunits/web/robotsAuthority.js';
import {
  ALLOW_ALL,
  ScriptedTransport,
  createRelSubjectHarness,
  html,
  instantClock,
  page,
  response,
} from '../helpers/relSubjectHarness.js';
import {
  assertDisposableTarget,
  createDisposableSourceDiscoveryLogin,
  type DisposableLogin,
} from '../helpers/sourceDiscoveryLogin.js';
import { syntheticCohort } from '../helpers/syntheticCohortRegistry.js';
import {
  adminPool,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
} from './helpers.js';

// The CLI connects through DATABASE_URL_RESEARCH; route it to the test
// database before anything reads the environment (as the L1 CLI test does).
if (process.env.DATABASE_URL_RESEARCH_TEST) {
  process.env.DATABASE_URL_RESEARCH = process.env.DATABASE_URL_RESEARCH_TEST;
}

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;

type Geo = 'NL' | 'JP' | 'MX';

/** FICTITIOUS organisations (every domain carries `-fict`); nothing is requested live. */
const WORLD: Record<
  Geo,
  {
    a: { name: string; site: string; lang: string };
    b: { name: string; site: string; title: string; text: string };
  }
> = {
  NL: {
    a: { name: 'Taalhuis Eemland', site: 'https://www.taalhuis-eemland-fict.nl/', lang: 'nl' },
    b: {
      name: 'Taalcafé De Brug',
      site: 'https://www.taalcafe-debrug-fict.nl/',
      title: 'Taalcafé De Brug',
      text: 'Elke donderdag een taalcafé voor nieuwkomers en vrijwilligers.',
    },
  },
  JP: {
    a: { name: '日本語ひろば', site: 'https://www.nihongo-hiroba-a-fict.jp/', lang: 'ja' },
    b: {
      name: '神戸国際交流サロン',
      site: 'https://www.kobe-koryu-b-fict.jp/',
      title: '神戸国際交流サロン',
      text: '留学生と地域の人の言語交換会を毎月開いています。',
    },
  },
  MX: {
    a: { name: 'Casa de Idiomas', site: 'https://www.casa-idiomas-a-fict.mx/', lang: 'es' },
    b: {
      name: 'Club de Conversación Querétaro',
      site: 'https://www.club-conversacion-b-fict.mx/',
      title: 'Club de Conversación Querétaro',
      text: 'Intercambio de idiomas cada sábado en el centro.',
    },
  },
};
const GEOS: readonly Geo[] = ['NL', 'JP', 'MX'];
const hostOf = (url: string) => new URL(url).hostname;
const domainOf = (url: string) => hostOf(url).replace(/^www\./, '');

/** B's own onward link (NL only): nominated by B's run, never fetched. */
const C_NL = 'https://www.leesclub-c-fict.nl/';

/** Subject A's site: two pages link to B (three sightings: two pages, two URLs). */
function transportForA(geo: Geo): ScriptedTransport {
  const { a, b } = WORLD[geo];
  return new ScriptedTransport()
    .route(`${a.site}robots.txt`, response(200, ALLOW_ALL, 'text/plain'))
    .route(
      a.site,
      html(
        page(a.lang, a.name, 'Taal leren, language exchange and tandem.', [
          ['/activiteiten/', 'Activiteiten'],
          [b.site, b.name],
          ['mailto:info@a-fict.example', 'Mail'],
        ]),
      ),
    )
    .route(
      `${a.site}activiteiten/`,
      html(
        page(a.lang, `${a.name} - activiteiten`, 'Language cafe partners.', [
          [b.site, `${b.name} (bel 030-123 45 67)`],
          [`${b.site}agenda/`, `${b.name} agenda`],
        ]),
      ),
    );
}

function transportForB(geo: Geo): ScriptedTransport {
  const { b } = WORLD[geo];
  const links: [string, string][] = geo === 'NL' ? [[C_NL, 'Leesclub']] : [];
  return new ScriptedTransport()
    .route(`${b.site}robots.txt`, response(200, ALLOW_ALL, 'text/plain'))
    .route(b.site, html(page(WORLD[geo].a.lang, b.title, b.text, links)));
}

async function sqlstate(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'OK';
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

describeDb('REL P2: persistent link-out nominations (integration, disposable database)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let readonly: pg.Pool;
  const h = createRelSubjectHarness('relp2');
  const cohort = syntheticCohort();
  const loadCohortRegistry = (): RegistryLoadResult => cohort.load();
  const deps = (transport: ScriptedTransport) => ({
    transport,
    clock: instantClock(),
    loadCohortRegistry,
  });

  const a = {} as Record<Geo, { subjectId: string; claimId: string; admissionId: string }>;
  const b = {} as Record<Geo, { subjectId: string; admissionId: string; nominationId: string }>;
  /** Every transport used before B's admission, to prove no request reached B. */
  const preAdmissionTransports: ScriptedTransport[] = [];
  let nlRun1 = '';
  let nlRun2 = '';
  let nlRun2Nomination = '';

  /** Sets (or clears) DATABASE_URL_SOURCE_DISCOVERY on the parsed, cached environment. */
  function setSourceDiscoveryEnv(value: string | undefined): void {
    const parsed = env() as { DATABASE_URL_SOURCE_DISCOVERY?: string };
    if (value === undefined) delete parsed.DATABASE_URL_SOURCE_DISCOVERY;
    else parsed.DATABASE_URL_SOURCE_DISCOVERY = value;
  }

  async function cliResearch(
    subjectId: string,
    transport: ScriptedTransport,
  ): Promise<{ code: number; json: Record<string, unknown> }> {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });
    try {
      const code = await runOrgunitsSubjectsResearch(
        { subjectId, execute: true, json: true },
        deps(transport),
      );
      return { code, json: JSON.parse(chunks.join('')) as Record<string, unknown> };
    } finally {
      spy.mockRestore();
    }
  }

  async function sourceCli(argv: string[]): Promise<{ code: number; out: string; err: string }> {
    let out = '';
    let err = '';
    const code = await runSourceDiscoveryCli(argv, {
      readonlyPool: () => new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 2 }),
      writerPool: h.writerPoolFactory(),
      out: (t) => void (out += t),
      err: (t) => void (err += t),
    });
    return { code, out, err };
  }

  const nominationsOf = async (domain: string) =>
    (
      await admin.query<{
        id: string;
        discovery_method: string;
        research_run_id: string;
        title: string | null;
        eche_overlap: boolean;
      }>(
        `SELECT n.id, n.discovery_method, r.research_run_id, n.title, n.eche_overlap
           FROM source_discovery_nominations n
           JOIN source_discovery_runs r ON r.id = n.discovery_run_id
          WHERE n.registrable_domain = $1
          ORDER BY n.created_at, n.id`,
        [domain],
      )
    ).rows;

  const fetchesOfHost = async (host: string) =>
    (
      await admin.query<{ root_key: string; observed_at: Date }>(
        `SELECT root_key, observed_at FROM orgunit_fetch_observations
          WHERE substring(requested_url from '^https?://([^/]+)') = $1
          ORDER BY observed_at`,
        [host],
      )
    ).rows;

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    readonly = readonlyPool();
    await admin.query(
      // WW E-SD (migration 0022): the grant tables reference these, so they go first.
      'TRUNCATE source_discovery_nomination_known_marks, source_discovery_run_completions, ' +
        'source_discovery_query_calls, source_discovery_grant_uses, source_discovery_grants, ' +
        'source_discovery_nomination_sightings, source_discovery_nomination_identities, ' +
        'source_discovery_nominations, source_discovery_runs, source_discovery_briefs',
    );
    await truncateAll(admin);
    // One ECHE organisation and website claim, so "B is in no ECHE list" is
    // measured against a register that is not empty.
    await seedOrgunitRoot(admin);
    await h.setUp(admin, { sourceDiscoveryLogin: true });
    // Every A is registered and confirmed BEFORE any admission: an admission
    // binds the registry fingerprint, and any later registry write stales it.
    for (const geo of GEOS) {
      const made = await h.confirmedSubject(readonly, WORLD[geo].a.name, WORLD[geo].a.site);
      a[geo] = { subjectId: made.subjectId, claimId: made.websiteClaimId, admissionId: '' };
    }
    for (const geo of GEOS) {
      a[geo].admissionId = await h.admit(
        admin,
        a[geo].subjectId,
        a[geo].claimId,
        loadCohortRegistry,
      );
    }
  });

  afterAll(async () => {
    setSourceDiscoveryEnv(undefined);
    await admin.query(
      // WW E-SD (migration 0022): the grant tables reference these, so they go first.
      'TRUNCATE source_discovery_nomination_known_marks, source_discovery_run_completions, ' +
        'source_discovery_query_calls, source_discovery_grant_uses, source_discovery_grants, ' +
        'source_discovery_nomination_sightings, source_discovery_nomination_identities, ' +
        'source_discovery_nominations, source_discovery_runs, source_discovery_briefs',
    );
    await truncateAll(admin);
    await h.tearDown(admin);
    await Promise.all([admin.end(), research.end(), readonly.end()]);
  });

  // ------------------------------------------------------------ 1. least privilege

  describe('1. the disposable login is least privilege', () => {
    let login: DisposableLogin;
    let pool: pg.Pool;

    beforeAll(async () => {
      login = await createDisposableSourceDiscoveryLogin(admin, testDatabaseUrl('admin')!);
      pool = new pg.Pool({ connectionString: login.url, max: 2 });
    });

    afterAll(async () => {
      await pool.end();
      await login.drop();
    });

    /** One statement in its own transaction, as the capability; always rolled back. */
    async function asCapability(sql: string): Promise<string> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE nwf_source_discovery');
        return await sqlstate(() => client.query(sql));
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }
    }

    it('refuses to be created outside a loopback *_test database, and never in nwf_pe', () => {
      for (const url of [
        'postgres://o:p@10.0.0.5:5432/nwf_pe_test',
        'postgres://o:p@db.example.com:5432/nwf_pe_test',
        'postgres://o:p@127.0.0.1:55432/nwf_pe',
        'postgres://o:p@127.0.0.1:55432/staging',
      ]) {
        expect(() => assertDisposableTarget(url), url).toThrow();
      }
      expect(() => assertDisposableTarget(testDatabaseUrl('admin')!)).not.toThrow();
    });

    it('is LOGIN NOINHERIT with no attribute, one SET-only membership and CONNECT only', async () => {
      const role = await admin.query(
        `SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
                rolbypassrls
           FROM pg_roles WHERE rolname = $1`,
        [login.login],
      );
      expect(role.rows).toEqual([
        {
          rolcanlogin: true,
          rolinherit: false,
          rolsuper: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolreplication: false,
          rolbypassrls: false,
        },
      ]);
      const members = await admin.query(
        `SELECT g.rolname AS role, m.admin_option, m.inherit_option, m.set_option
           FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
           JOIN pg_roles u ON u.oid = m.member
          WHERE u.rolname = $1`,
        [login.login],
      );
      expect(members.rows).toEqual([
        {
          role: 'nwf_source_discovery',
          admin_option: false,
          inherit_option: false,
          set_option: true,
        },
      ]);
      // Nothing is granted to the login itself but CONNECT on this database.
      const direct = await admin.query(
        `SELECT table_name FROM information_schema.role_table_grants WHERE grantee = $1
         UNION ALL
         SELECT table_name FROM information_schema.column_privileges WHERE grantee = $1`,
        [login.login],
      );
      expect(direct.rows).toEqual([]);
      const db = await admin.query<{ c: boolean; cr: boolean; t: boolean; s: boolean }>(
        `SELECT has_database_privilege($1, current_database(), 'CONNECT') AS c,
                has_database_privilege($1, current_database(), 'CREATE') AS cr,
                has_database_privilege($1, current_database(), 'TEMPORARY') AS t,
                has_schema_privilege($1, 'public', 'CREATE') AS s`,
        [login.login],
      );
      expect(db.rows[0]).toEqual({ c: true, cr: false, t: false, s: false });
    });

    it('holds NOTHING before SET ROLE (NOINHERIT)', async () => {
      for (const table of [
        'source_discovery_nominations',
        'source_discovery_nomination_identities',
        'source_discovery_nomination_sightings',
      ]) {
        // Schema-qualified: without SET ROLE the login has no USAGE on public at all.
        expect(
          await sqlstate(() => pool.query(`SELECT 1 FROM public.${table} LIMIT 1`)),
          table,
        ).toBe('42501');
      }
      const usage = await pool.query<{ u: boolean }>(
        `SELECT has_schema_privilege(current_user, 'public', 'USAGE') AS u`,
      );
      expect(usage.rows[0]!.u).toBe(false);
    });

    it('as the capability: may INSERT and SELECT its own tables', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE nwf_source_discovery');
        const run = await client.query<{ id: string }>(
          `INSERT INTO source_discovery_runs (run_kind, provider_key, actor_key, started_at)
           VALUES ('SEED', 'operator-seed', 'source-discovery-cli', clock_timestamp())
           RETURNING id`,
        );
        const nomination = await client.query<{ id: string }>(
          `INSERT INTO source_discovery_nominations
             (discovery_run_id, discovery_method, provider_key, url, hostname, registrable_domain,
              retrieved_at, eche_overlap, hei_signal, hei_signal_rule_version)
           VALUES ($1, 'SEED', 'operator-seed', 'https://lp-seed-fict.nl/', 'lp-seed-fict.nl',
                   'lp-seed-fict.nl', now(), false, false, 'source-discovery-hei-signal-v1')
           RETURNING id`,
          [run.rows[0]!.id],
        );
        await client.query(
          `INSERT INTO source_discovery_nomination_identities (registrable_domain, first_nomination_id)
           VALUES ('lp-seed-fict.nl', $1)`,
          [nomination.rows[0]!.id],
        );
        for (const table of [
          'source_discovery_runs',
          'source_discovery_nominations',
          'source_discovery_nomination_identities',
          'source_discovery_nomination_sightings',
          'source_discovery_briefs',
        ]) {
          await client.query(`SELECT * FROM ${table} LIMIT 1`);
        }
        // A sighting must cite a PAGE_LINK_OUT nomination: a SEED one is refused by the database.
        expect(
          await sqlstate(() =>
            client.query(
              `INSERT INTO source_discovery_nomination_sightings
                 (identity_id, registrable_domain, nomination_id, source_page_evidence_id, url,
                  hostname, observed_at)
               SELECT i.id, i.registrable_domain, i.first_nomination_id, gen_random_uuid(),
                      'https://lp-seed-fict.nl/', 'lp-seed-fict.nl', now()
                 FROM source_discovery_nomination_identities i
                WHERE i.registrable_domain = 'lp-seed-fict.nl'`,
            ),
          ),
        ).toBe('23514');
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });

    it('as the capability: no UPDATE, DELETE or TRUNCATE on any of its tables', async () => {
      for (const table of [
        'source_discovery_briefs',
        'source_discovery_runs',
        'source_discovery_nominations',
        'source_discovery_nomination_identities',
        'source_discovery_nomination_sightings',
      ]) {
        expect(await asCapability(`UPDATE ${table} SET created_at = now()`), table).toBe('42501');
        expect(await asCapability(`DELETE FROM ${table}`), table).toBe('42501');
        expect(await asCapability(`TRUNCATE ${table}`), table).toBe('42501');
      }
    });

    it('as the capability: reads only the two granted columns of Phase 1/2B truth', async () => {
      expect(await asCapability('SELECT registrable_domain FROM website_claims LIMIT 1')).toBe(
        'OK',
      );
      expect(await asCapability('SELECT id, observed_at FROM orgunit_page_evidence LIMIT 1')).toBe(
        'OK',
      );
      for (const sql of [
        'SELECT raw_value FROM website_claims LIMIT 1',
        'SELECT * FROM website_claims LIMIT 1',
        'SELECT main_text FROM orgunit_page_evidence LIMIT 1',
        'SELECT 1 FROM organisations LIMIT 1',
        'SELECT 1 FROM organisation_sources LIMIT 1',
        'SELECT 1 FROM ingest_runs LIMIT 1',
        'SELECT 1 FROM ewp_heis LIMIT 1',
        'SELECT 1 FROM orgunit_fetch_observations LIMIT 1',
        'SELECT 1 FROM orgunit_research_runs LIMIT 1',
        'SELECT 1 FROM discovery_subjects LIMIT 1',
        'SELECT 1 FROM subject_research_admissions LIMIT 1',
      ]) {
        expect(await asCapability(sql), sql).toBe('42501');
      }
    });

    it('as the capability: writes no page evidence, claim, admission, promotion, subject or run', async () => {
      for (const table of [
        'orgunit_page_evidence',
        'orgunit_fetch_observations',
        'orgunit_page_candidates',
        'orgunit_research_runs',
        'orgunit_root_promotions',
        'website_claims',
        'organisations',
        'subject_research_admissions',
        'discovery_subjects',
        'discovery_subject_identity_claims',
        'discovery_subject_reviews',
      ]) {
        expect(await asCapability(`INSERT INTO ${table} DEFAULT VALUES`), table).toBe('42501');
      }
    });

    it('cannot become another role, create objects or use TEMP', async () => {
      for (const sql of [
        'SET ROLE nwf_research',
        'SET ROLE nwf_owner',
        'SET ROLE nwf_discovery_subject_writer',
        'CREATE TABLE lp_probe (x int)',
        'CREATE TEMP TABLE lp_probe (x int)',
      ]) {
        expect(await asCapability(sql), sql).toBe('42501');
      }
      expect(await sqlstate(() => pool.query('SET ROLE nwf_research'))).toBe('42501');
    });

    it('the research role holds nothing on the new tables; audit may only read them', async () => {
      for (const table of [
        'source_discovery_nomination_identities',
        'source_discovery_nomination_sightings',
      ]) {
        const { rows } = await admin.query<{ role: string; p: string; ok: boolean }>(
          `SELECT r AS role, p, has_table_privilege(r, $1, p) AS ok
             FROM unnest(ARRAY['nwf_research', 'nwf_readonly', 'nwf_ingest', 'nwf_classifier',
                               'nwf_discovery_subject_writer']) r,
                  unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p`,
          [table],
        );
        expect(
          rows.filter((r) => r.ok).map((r) => `${r.role}:${r.p}`),
          table,
        ).toEqual(['nwf_readonly:SELECT']);
      }
    });
  });

  // ------------------------------------------------------------ 2. dedupe + evidence

  describe('2. one identity per domain, every sighting kept', () => {
    it('run 1 of NL A: one nomination of B, one identity, three sightings with evidence; B never requested', async () => {
      const transport = transportForA('NL');
      preAdmissionTransports.push(transport);
      const verified = await verifySubjectAdmission(research, a.NL.subjectId, deps(transport));
      if (verified.outcome !== 'VERIFIED') throw new Error(JSON.stringify(verified));
      const result = await runSubjectResearch(
        research,
        verified.admission,
        { networkVantage: 'test', linkOutPool: h.sourceDiscoveryPool() },
        deps(transport),
      );
      expect(result.runTerminalState).toBe('COMPLETED');
      nlRun1 = result.runId;
      expect(result.linkOuts).toMatchObject({
        offered: 3,
        inserted: 1,
        duplicates: 2,
        alreadyNominatedElsewhere: 0,
        sightings: 3,
        repeatedSightings: 0,
      });

      const domain = domainOf(WORLD.NL.b.site);
      const nominations = await nominationsOf(domain);
      expect(nominations).toHaveLength(1);
      expect(nominations[0]).toMatchObject({
        discovery_method: 'PAGE_LINK_OUT',
        research_run_id: nlRun1,
        title: 'Taalcafé De Brug',
        eche_overlap: false,
      });
      const identity = await admin.query<{ id: string; first_nomination_id: string }>(
        `SELECT id, first_nomination_id FROM source_discovery_nomination_identities
          WHERE registrable_domain = $1`,
        [domain],
      );
      expect(identity.rows).toEqual([
        { id: expect.any(String), first_nomination_id: nominations[0]!.id },
      ]);

      const sightings = await admin.query<{
        url: string;
        anchor_text: string | null;
        same_time: boolean;
        page_url: string;
        page_run: string;
      }>(
        `SELECT s.url, s.anchor_text, s.observed_at = p.observed_at AS same_time,
                f.requested_url AS page_url, f.run_id AS page_run
           FROM source_discovery_nomination_sightings s
           JOIN orgunit_page_evidence p ON p.id = s.source_page_evidence_id
           JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
          WHERE s.identity_id = $1
          ORDER BY f.requested_url, s.url`,
        [identity.rows[0]!.id],
      );
      const site = WORLD.NL.a.site;
      expect(sightings.rows).toEqual([
        {
          url: WORLD.NL.b.site,
          anchor_text: 'Taalcafé De Brug',
          same_time: true,
          page_url: site,
          page_run: nlRun1,
        },
        {
          url: WORLD.NL.b.site,
          anchor_text: 'Taalcafé De Brug (bel [PHONE])',
          same_time: true,
          page_url: `${site}activiteiten/`,
          page_run: nlRun1,
        },
        {
          url: `${WORLD.NL.b.site}agenda/`,
          anchor_text: 'Taalcafé De Brug agenda',
          same_time: true,
          page_url: `${site}activiteiten/`,
          page_run: nlRun1,
        },
      ]);
      // Never fetched: only A's own host was resolved or requested.
      expect(new Set(transport.resolvedHosts)).toEqual(new Set([hostOf(site)]));
      for (const url of transport.requestedUrls) expect(hostOf(url)).toBe(hostOf(site));
      expect(await fetchesOfHost(hostOf(WORLD.NL.b.site))).toEqual([]);
    });

    it('a replayed offer of the same page and URL is idempotent', async () => {
      const page = await admin.query<{ id: string }>(
        `SELECT p.id FROM orgunit_page_evidence p
           JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
          WHERE f.run_id = $1 AND f.requested_url = $2`,
        [nlRun1, WORLD.NL.a.site],
      );
      const before = await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM source_discovery_nomination_sightings`,
      );
      const capture = createLinkOutNominationSink(h.sourceDiscoveryPool(), nlRun1);
      await capture.sink(page.rows[0]!.id, WORLD.NL.b.site, 'Taalcafé De Brug');
      expect(capture.summary()).toMatchObject({
        inserted: 0,
        duplicates: 1,
        sightings: 0,
        repeatedSightings: 1,
      });
      const after = await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM source_discovery_nomination_sightings`,
      );
      expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
    });

    it('run 2 of NL A: a second nomination row, the SAME identity, three more sightings', async () => {
      const transport = transportForA('NL');
      preAdmissionTransports.push(transport);
      const verified = await verifySubjectAdmission(research, a.NL.subjectId, deps(transport));
      if (verified.outcome !== 'VERIFIED') throw new Error(JSON.stringify(verified));
      const result = await runSubjectResearch(
        research,
        verified.admission,
        { networkVantage: 'test', linkOutPool: h.sourceDiscoveryPool() },
        deps(transport),
      );
      expect(result.runTerminalState).toBe('COMPLETED');
      nlRun2 = result.runId;
      expect(result.linkOuts).toMatchObject({
        inserted: 1,
        alreadyNominatedElsewhere: 1,
        sightings: 3,
      });
      const domain = domainOf(WORLD.NL.b.site);
      const nominations = await nominationsOf(domain);
      expect(nominations.map((n) => n.research_run_id)).toEqual([nlRun1, nlRun2]);
      nlRun2Nomination = nominations[1]!.id;
      const identities = await admin.query<{ first: string; sightings: number }>(
        `SELECT i.first_nomination_id AS first,
                (SELECT count(*)::int FROM source_discovery_nomination_sightings s
                  WHERE s.identity_id = i.id) AS sightings
           FROM source_discovery_nomination_identities i WHERE i.registrable_domain = $1`,
        [domain],
      );
      expect(identities.rows).toEqual([{ first: nominations[0]!.id, sightings: 6 }]);
    });

    it('`nominations show` reads the identity and sightings; only the first nomination is promotable', async () => {
      const shown = await sourceCli([
        'nominations',
        'show',
        '--nomination-id',
        nlRun2Nomination,
        '--json',
      ]);
      expect(shown.code, shown.err).toBe(0);
      const data = (
        JSON.parse(shown.out) as {
          data: {
            promotable: boolean;
            identity: { firstNominationId: string; nominationCount: number; sightingCount: number };
            sightings: { researchRunId: string; anchorText: string | null }[];
          };
        }
      ).data;
      expect(data.promotable).toBe(false);
      expect(data.identity).toMatchObject({ nominationCount: 2, sightingCount: 6 });
      expect(new Set(data.sightings.map((s) => s.researchRunId))).toEqual(
        new Set([nlRun1, nlRun2]),
      );
      expect(JSON.stringify(data)).not.toContain('@');
      expect(JSON.stringify(data)).not.toContain('030-123');

      const refused = await sourceCli([
        'nominations',
        'promote',
        '--nomination-id',
        nlRun2Nomination,
        '--subject-id',
        randomUUID(),
        '--kind',
        'INDEPENDENT_COMMUNITY',
        '--json',
      ]);
      expect(refused.code).toBe(1);
      expect(refused.err).toContain('NOMINATION_NOT_CANONICAL');
      expect(refused.err).toContain(data.identity.firstNominationId);
    });
  });

  // ------------------------------------------------------------ 5. CLI (before any promotion)

  describe('5. CLI: DATABASE_URL_SOURCE_DISCOVERY decides record vs discard, never silently', () => {
    it('an empty value is an invalid environment (Zod), not a silent absence', async () => {
      const saved = process.env.DATABASE_URL_SOURCE_DISCOVERY;
      process.env.DATABASE_URL_SOURCE_DISCOVERY = '';
      try {
        vi.resetModules();
        const fresh = await import('../../config/env.js');
        expect(() => fresh.env()).toThrow(/DATABASE_URL_SOURCE_DISCOVERY/);
      } finally {
        if (saved === undefined) delete process.env.DATABASE_URL_SOURCE_DISCOVERY;
        else process.env.DATABASE_URL_SOURCE_DISCOVERY = saved;
        vi.resetModules();
      }
    });

    it('unset: the run is unchanged and the output says the link-outs were DISCARDED', async () => {
      setSourceDiscoveryEnv(undefined);
      const before = await nominationsOf(domainOf(WORLD.MX.b.site));
      const transport = transportForA('MX');
      preAdmissionTransports.push(transport);
      const r = await cliResearch(a.MX.subjectId, transport);
      expect(r.code).toBe(0);
      expect(r.json).toMatchObject({
        runTerminalState: 'COMPLETED',
        linkOuts: null,
        linkOutMode: 'DISCARDED',
      });
      expect(String(r.json['linkOutNote'])).toMatch(/DISCARDED.*DATABASE_URL_SOURCE_DISCOVERY/);
      expect(await nominationsOf(domainOf(WORLD.MX.b.site))).toEqual(before);
    });

    it('set to a login without the capability: refused before any run row, DNS or request', async () => {
      setSourceDiscoveryEnv(testDatabaseUrl('research')!);
      try {
        const runs = async () =>
          (await admin.query<{ n: number }>(`SELECT count(*)::int AS n FROM orgunit_research_runs`))
            .rows[0]!.n;
        const before = await runs();
        const transport = transportForA('MX');
        const r = await cliResearch(a.MX.subjectId, transport);
        expect(r.code).toBe(1);
        expect(r.json).toMatchObject({
          admission: 'REFUSED',
          refusal: { code: 'LINK_OUT_CAPABILITY_REFUSED' },
        });
        expect(await runs()).toBe(before);
        expect(transport.resolvedHosts).toEqual([]);
        expect(transport.requestedUrls).toEqual([]);
      } finally {
        setSourceDiscoveryEnv(undefined);
      }
    });

    it('set to the capability login: link-outs persist as nominations and sightings (JP, MX)', async () => {
      setSourceDiscoveryEnv(h.sourceDiscoveryUrl());
      try {
        for (const geo of ['JP', 'MX'] as const) {
          const transport = transportForA(geo);
          preAdmissionTransports.push(transport);
          const r = await cliResearch(a[geo].subjectId, transport);
          expect(r.code, geo).toBe(0);
          expect(r.json, geo).toMatchObject({
            runTerminalState: 'COMPLETED',
            linkOutMode: 'RECORDED_AS_NOMINATIONS',
            linkOuts: { inserted: 1, sightings: 3 },
          });
          const nominations = await nominationsOf(domainOf(WORLD[geo].b.site));
          expect(nominations, geo).toHaveLength(1);
          expect(nominations[0]!.title, geo).toBe(WORLD[geo].b.name);
          expect(nominations[0]!.research_run_id, geo).toBe(r.json['runId']);
        }
      } finally {
        setSourceDiscoveryEnv(undefined);
      }
    });
  });

  // ------------------------------------------------------------ 3. never authorises a fetch

  describe('3. a nomination never authorises a fetch', () => {
    it("the gateway refuses B's URL under A's root before any DNS lookup", async () => {
      const runId = await startSubjectRun(research, {
        networkVantage: 'test',
        admissionId: a.NL.admissionId,
      });
      const transport = new ScriptedTransport();
      try {
        for (const url of [WORLD.NL.b.site, `${WORLD.NL.b.site}agenda/`]) {
          await expect(
            executeWebAttempt(
              research,
              {
                runId,
                root: { kind: 'SUBJECT_ADMISSION', admissionId: a.NL.admissionId },
                requestedUrl: url,
                attemptNo: 1,
                discoveryMethod: 'LINK',
                discoveryParentUrl: WORLD.NL.a.site,
                robots: RobotsAuthorisation.forTestsOnly('ALLOWED'),
              },
              transport,
            ),
          ).rejects.toMatchObject({ reason: 'REQUEST_OUTSIDE_ROOT_SCOPE' });
        }
        expect(transport.resolvedHosts).toEqual([]);
        expect(transport.requestedUrls).toEqual([]);
      } finally {
        await completeRun(research, {
          runId,
          terminalState: 'ABORTED',
          errorKind: null,
          errorSummary: null,
        });
      }
    });

    it('a nomination id is not an admission: refused before any run row', async () => {
      const nomination = (await nominationsOf(domainOf(WORLD.NL.b.site)))[0]!;
      const runs = async () =>
        (await admin.query<{ n: number }>(`SELECT count(*)::int AS n FROM orgunit_research_runs`))
          .rows[0]!.n;
      const before = await runs();
      const transport = new ScriptedTransport();
      await expect(
        runSubjectDiscovery(
          research,
          { admissionId: nomination.id, networkVantage: 'test' },
          deps(transport),
        ),
      ).rejects.toMatchObject({ reason: 'ROOT_SUBJECT_ADMISSION_NOT_FOUND' });
      expect(await runs()).toBe(before);
      expect(transport.resolvedHosts).toEqual([]);
    });

    it('the research role cannot read a nomination, identity or sighting', async () => {
      for (const table of [
        'source_discovery_nominations',
        'source_discovery_nomination_identities',
        'source_discovery_nomination_sightings',
      ]) {
        expect(await sqlstate(() => research.query(`SELECT 1 FROM ${table} LIMIT 1`)), table).toBe(
          '42501',
        );
      }
    });
  });

  // ------------------------------------------------------------ 4. niche discovery

  describe('4. a NEW niche organisation is discovered from a linked source (NL, JP, MX)', () => {
    it('B was in no seed list and no ECHE claim, and nothing requested it', async () => {
      const seeds = GEOS.map((g) => domainOf(WORLD[g].a.site));
      for (const geo of GEOS) {
        const domain = domainOf(WORLD[geo].b.site);
        expect(seeds, geo).not.toContain(domain);
        const claims = await admin.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM website_claims WHERE registrable_domain = $1`,
          [domain],
        );
        expect(claims.rows[0]!.n, geo).toBe(0);
        const subjectClaims = await admin.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM discovery_subject_identity_claims
            WHERE website_url LIKE $1`,
          [`https://${hostOf(WORLD[geo].b.site)}%`],
        );
        expect(subjectClaims.rows[0]!.n, geo).toBe(0);
        const nominations = await nominationsOf(domain);
        expect(nominations.length, geo).toBeGreaterThan(0);
        for (const n of nominations) {
          expect(n.discovery_method, geo).toBe('PAGE_LINK_OUT');
          expect(n.eche_overlap, geo).toBe(false);
        }
        expect(await fetchesOfHost(hostOf(WORLD[geo].b.site)), geo).toEqual([]);
      }
      const echeClaims = await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM website_claims`,
      );
      expect(echeClaims.rows[0]!.n).toBeGreaterThan(0);
    });

    it('promote (B2.2) -> review (B2.3): B is a subject, still refused research without admission', async () => {
      for (const geo of GEOS) {
        const domain = domainOf(WORLD[geo].b.site);
        const canonical = (await nominationsOf(domain))[0]!.id;
        const subjectId = randomUUID();
        const promoted = await sourceCli([
          'nominations',
          'promote',
          '--nomination-id',
          canonical,
          '--subject-id',
          subjectId,
          '--kind',
          'INDEPENDENT_COMMUNITY',
          '--name-language',
          WORLD[geo].a.lang,
          '--execute',
          '--json',
        ]);
        expect(promoted.code, `${geo} ${promoted.err}`).toBe(0);
        b[geo] = { subjectId, admissionId: '', nominationId: canonical };
      }
      for (const geo of GEOS) {
        await h.confirmExisting(readonly, b[geo].subjectId, WORLD[geo].b.site);
      }
      for (const geo of GEOS) {
        const transport = new ScriptedTransport();
        const verified = await verifySubjectAdmission(research, b[geo].subjectId, deps(transport));
        expect(verified, geo).toMatchObject({ outcome: 'REFUSED', code: 'NO_ADMISSION_RECORD' });
        expect(transport.requestedUrls, geo).toEqual([]);
        expect(await fetchesOfHost(hostOf(WORLD[geo].b.site)), geo).toEqual([]);
      }
      // The promoted name claim cites the nomination's own text, unchanged.
      const names = await admin.query<{ subject_id: string; name_text: string }>(
        `SELECT subject_id, name_text FROM discovery_subject_identity_claims
          WHERE claim_kind = 'NAME' AND subject_id = ANY($1::uuid[])`,
        [GEOS.map((g) => b[g].subjectId)],
      );
      expect(new Set(names.rows.map((r) => r.name_text))).toEqual(
        new Set(GEOS.map((g) => WORLD[g].b.name)),
      );
    });

    it("OWNER admission -> research of B stores B's OWN evidence, rooted in B's admission", async () => {
      for (const geo of GEOS) {
        const graph = await admin.query<{ id: string }>(
          `SELECT id FROM discovery_subject_identity_claims
            WHERE subject_id = $1 AND claim_kind = 'PUBLIC_WEBSITE'`,
          [b[geo].subjectId],
        );
        b[geo].admissionId = await h.admit(
          admin,
          b[geo].subjectId,
          graph.rows[0]!.id,
          loadCohortRegistry,
        );
      }
      // No request reached any B before its admission.
      for (const t of preAdmissionTransports) {
        for (const geo of GEOS) {
          expect(t.resolvedHosts, geo).not.toContain(hostOf(WORLD[geo].b.site));
          expect(t.requestedUrls.map(hostOf), geo).not.toContain(hostOf(WORLD[geo].b.site));
        }
      }
      for (const geo of GEOS) {
        const transport = transportForB(geo);
        const verified = await verifySubjectAdmission(research, b[geo].subjectId, deps(transport));
        if (verified.outcome !== 'VERIFIED') throw new Error(`${geo} ${JSON.stringify(verified)}`);
        const result = await runSubjectResearch(
          research,
          verified.admission,
          { networkVantage: 'test', linkOutPool: h.sourceDiscoveryPool() },
          deps(transport),
        );
        expect(result.runTerminalState, geo).toBe('COMPLETED');
        expect(result.rootKey, geo).toBe(`subject_admission:${b[geo].admissionId}`);
        expect(new Set(transport.resolvedHosts), geo).toEqual(new Set([hostOf(WORLD[geo].b.site)]));

        const evidence = await research.query<{ title: string | null; main_text: string }>(
          `SELECT p.title, p.main_text FROM orgunit_page_evidence p
             JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
            WHERE f.run_id = $1 AND f.requested_url = $2`,
          [result.runId, WORLD[geo].b.site],
        );
        expect(evidence.rows, geo).toHaveLength(1);
        expect(evidence.rows[0]!.title, geo).toBe(WORLD[geo].b.title);
        expect(evidence.rows[0]!.main_text, geo).toContain(WORLD[geo].b.text);

        const fetches = await fetchesOfHost(hostOf(WORLD[geo].b.site));
        expect(fetches.length, geo).toBeGreaterThan(0);
        const admitted = await admin.query<{ admitted_at: Date }>(
          `SELECT admitted_at FROM subject_research_admissions WHERE id = $1`,
          [b[geo].admissionId],
        );
        for (const f of fetches) {
          expect(f.root_key, geo).toBe(`subject_admission:${b[geo].admissionId}`);
          expect(f.observed_at.getTime(), geo).toBeGreaterThanOrEqual(
            admitted.rows[0]!.admitted_at.getTime(),
          );
        }
      }
      // The chain continues, under the same rule: B (NL) linked to C, which is
      // nominated and never requested.
      const c = await nominationsOf(domainOf(C_NL));
      expect(c).toHaveLength(1);
      expect(c[0]!.research_run_id).not.toBe(nlRun1);
      expect(await fetchesOfHost(hostOf(C_NL))).toEqual([]);
    });
  });
});

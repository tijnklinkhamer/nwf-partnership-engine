/**
 * REL L2 / U1 - independent source discovery against a DISPOSABLE PostgreSQL,
 * with the SCRIPTED provider and FICTITIOUS result sets for JP, MX and NL.
 *
 * Nothing here reaches a network or a model: search results come from
 * `ScriptedSearchProvider`, and the link-out run uses a scripted transport
 * whose call log proves no nominated URL was ever resolved or requested.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { runSourceDiscoveryCli } from '../../cli/commands/sourceDiscovery.js';
import { runRootAcquisition } from '../../orgunits/orchestrator/rootRunner.js';
import { NWF_DISCOVERY_BRIEF_V1, queriesFor } from '../../orgunits/sourceDiscovery/brief.js';
import { createLinkOutNominationSink } from '../../orgunits/sourceDiscovery/linkOut.js';
import { nominationCitationDigest } from '../../orgunits/sourceDiscovery/promote.js';
import { runSourceDiscovery } from '../../orgunits/sourceDiscovery/run.js';
import { ScriptedSearchProvider } from '../../orgunits/sourceDiscovery/scriptedProvider.js';
import {
  SourceDiscoverySessionRefused,
  inSourceDiscoveryTransaction,
  loadNomination,
} from '../../orgunits/sourceDiscovery/store.js';
import type { RawSearchResult } from '../../orgunits/sourceDiscovery/types.js';
import type {
  RequestPlan,
  ResolvedAddress,
  TransportOutcome,
  WebTransport,
} from '../../orgunits/web/gateway.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
import { syntheticCohort } from '../helpers/syntheticCohortRegistry.js';
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

const RETRIEVED_AT = '2026-10-20T08:00:00.000Z';
const SUFFIX = randomBytes(4).toString('hex');
const SOURCE_LOGIN = `nwf_l2_test_source_${SUFFIX}`;
const WRITER_LOGIN = `nwf_l2_test_writer_${SUFFIX}`;
const OUTSIDER_LOGIN = `nwf_l2_test_outsider_${SUFFIX}`;
const LOGIN_PASSWORD = randomBytes(24).toString('hex');

function urlFor(login: string): string {
  const url = new URL(testDatabaseUrl('admin')!);
  url.username = login;
  url.password = LOGIN_PASSWORD;
  return url.toString();
}

async function sqlstate(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return String((err as { code?: string }).code);
  }
  return 'SUCCEEDED';
}

// ---------------------------------------------------------------- fixtures
//
// FICTITIOUS organisations only. Every domain carries `-fict` so none can be
// mistaken for a real site; nothing in this file requests any of them.

type Org = readonly [domain: string, title: string];

const OBSCURE: Record<'JP' | 'MX' | 'NL', readonly Org[]> = {
  JP: [
    ['shibuya-gogaku-koryu-fict.jp', '渋谷語学交流サークル'],
    ['minato-kokusai-koryu-fict.or.jp', '港区国際交流協会 語学ボランティア'],
    ['yokohama-nihongo-fict.jp', '横浜にほんご教室 ボランティア'],
    ['osaka-language-cafe-fict.jp', 'Osaka Language Cafe'],
    ['kyoto-tabunka-fict.jp', '京都多文化共生センター'],
    ['sapporo-exchange-fict.jp', 'Sapporo Language Exchange Club'],
    ['nagoya-eikaiwa-fict.jp', '名古屋 地域の英会話教室'],
    ['fukuoka-kokusai-fict.or.jp', '福岡国際交流ラウンジ'],
    ['kobe-gengo-koukan-fict.jp', '神戸言語交換会'],
    ['sendai-ryugakusei-fict.jp', '仙台留学生交流ネット'],
    ['online-nihongo-fict.jp', 'オンライン日本語コミュニティ'],
    ['hiroshima-bunka-fict.jp', '広島国際文化センター 語学講座'],
  ],
  MX: [
    ['intercambio-cdmx-fict.mx', 'Intercambio de Idiomas CDMX'],
    ['cafe-idiomas-gdl-fict.mx', 'Café de Idiomas Guadalajara'],
    ['casa-cultura-oax-fict.org.mx', 'Casa de la Cultura Oaxaca - Talleres de idiomas'],
    ['club-conversacion-mty-fict.mx', 'Club de Conversación Monterrey'],
    ['idiomas-comunidad-puebla-fict.mx', 'Clases de idiomas comunitarias Puebla'],
    ['merida-language-exchange-fict.mx', 'Mérida Language Exchange'],
    ['estudiantes-intl-fict.org.mx', 'Asociación de Estudiantes Internacionales'],
    ['escuelita-idiomas-fict.mx', 'Escuelita de Idiomas del Barrio'],
    ['queretaro-tandem-fict.mx', 'Tándem Querétaro'],
    ['tijuana-bilingue-fict.org.mx', 'Tijuana Bilingüe A.C.'],
    ['idiomas-en-linea-fict.mx', 'Comunidad en línea para aprender idiomas'],
    ['centro-cultural-aleman-fict.mx', 'Centro Cultural Alemán (ficticio)'],
  ],
  NL: [
    ['taalcafe-utrecht-fict.nl', 'Taalcafé Utrecht'],
    ['taaluitwisseling-adam-fict.nl', 'Taaluitwisseling Amsterdam'],
    ['taalmaatje-rotterdam-fict.nl', 'Taalmaatjes Rotterdam'],
    ['buurthuis-taalles-fict.nl', 'Buurthuis De Linde - taalles'],
    ['isv-groningen-fict.nl', 'Internationale studentenvereniging Groningen'],
    ['cultureel-centrum-fict.nl', 'Cultureel Centrum De Brug - taalcursus'],
    ['kleine-taalschool-fict.nl', 'De Kleine Taalschool'],
    ['online-taalgemeenschap-fict.nl', 'Online Taalgemeenschap'],
    ['language-meetup-hague-fict.nl', 'The Hague Language Exchange Meetup'],
    ['expat-talen-eindhoven-fict.nl', 'Expat Community Language Classes Eindhoven'],
    ['leiden-tandem-fict.nl', 'Tandem Leiden'],
    ['nijmegen-taalcafe-fict.nl', 'Taalcafé Nijmegen'],
  ],
};

const EXTRAS = {
  JP: {
    overlap: 'echo-overlap-fict.jp',
    university: ['fict-u.ac.jp', '架空大学 国際交流センター'],
    social: 'https://www.facebook.com/groups/fict-gogaku',
    pii: 'お問い合わせ info@shibuya-gogaku-koryu-fict.jp 電話 03-1234-5678 携帯 +81 90-1234-5678',
  },
  MX: {
    overlap: 'echo-overlap-fict.mx',
    university: ['universidad-ficticia.edu.mx', 'Universidad Ficticia - Centro de Idiomas'],
    social: 'https://www.instagram.com/intercambio_fict',
    pii: 'Escríbenos a hola@intercambio-cdmx-fict.mx o llama al +52 55 1234 5678',
  },
  NL: {
    overlap: 'echo-overlap-fict.nl',
    university: ['universiteit-fictief.nl', 'Universiteit Fictief - Talencentrum'],
    social: 'https://wa.me/31612345678',
    pii: 'Mail info@taalcafe-utrecht-fict.nl of bel 030-123 45 67',
  },
} as const;

type Geo = keyof typeof OBSCURE;

/** Spreads one country's fictitious results over that section's real query ids. */
function scriptFor(geo: Geo): Map<string, RawSearchResult[]> {
  const ids = queriesFor(NWF_DISCOVERY_BRIEF_V1, geo).queries.map((q) => q.queryId);
  const script = new Map<string, RawSearchResult[]>(ids.map((id) => [id, []]));
  const at = (i: number) => script.get(ids[i % ids.length]!)!;
  const extras = EXTRAS[geo];
  OBSCURE[geo].forEach(([domain, title], i) => {
    at(i).push({
      url: `https://www.${domain}/`,
      title,
      snippet: i === 0 ? extras.pii : `${title} - community page`,
    });
  });
  // The same registrable domain again, from another query and another path: deduped.
  at(1).push({ url: `https://${OBSCURE[geo][0]![0]}/events`, title: 'Events', snippet: null });
  at(2).push({ url: `https://www.${OBSCURE[geo][3]![0]}/`, title: 'again', snippet: null });
  // An ECHE-overlap domain (a website claim publishes it) and a university.
  at(3).push({ url: `https://www.${extras.overlap}/`, title: 'Overlap Org', snippet: null });
  at(4).push({
    url: `https://www.${extras.university[0]}/`,
    title: extras.university[1],
    snippet: null,
  });
  // A social/messaging URL and a URL with an explicit port: refused, never stored.
  at(5).push({ url: extras.social, title: 'Social group', snippet: null });
  at(6).push({ url: `https://${OBSCURE[geo][5]![0]}:8443/`, title: 'port', snippet: null });
  return script;
}

// ---------------------------------------------------------------- transport (link-out run)

const PUBLIC_V4: ResolvedAddress = { address: '193.51.196.10', family: 4 };

class RoutedTransport implements WebTransport {
  readonly resolvedHosts: string[] = [];
  readonly requestedUrls: string[] = [];
  private readonly routes = new Map<string, TransportOutcome>();
  route(url: string, outcome: TransportOutcome): this {
    this.routes.set(url, outcome);
    return this;
  }
  resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
    this.resolvedHosts.push(hostname);
    return Promise.resolve([PUBLIC_V4]);
  }
  execute(plan: RequestPlan): Promise<TransportOutcome> {
    this.requestedUrls.push(plan.url);
    return Promise.resolve(
      this.routes.get(plan.url) ?? {
        kind: 'RESPONSE',
        status: 404,
        headers: { 'content-type': 'text/plain' },
        body: Buffer.from('not found'),
        truncated: false,
      },
    );
  }
}

function html(title: string, links: string[]): TransportOutcome {
  const anchors = links.map((href, i) => `<a href="${href}">Link ${i} ${title}</a>`).join('\n');
  return {
    kind: 'RESPONSE',
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: Buffer.from(
      `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>Text.</p>${anchors}</main></body></html>`,
    ),
    truncated: false,
  };
}

const instantClock = () => ({ now: () => Date.now(), sleep: () => Promise.resolve() });

// ---------------------------------------------------------------- suite

describeDb('REL L2 source discovery (integration, disposable database)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let research: pg.Pool;
  let source: pg.Pool;
  let outsider: pg.Pool;
  let fixture: OrgunitRootFixture;

  async function seedOverlapClaims(): Promise<void> {
    for (const geo of Object.keys(EXTRAS) as Geo[]) {
      const domain = EXTRAS[geo].overlap;
      await admin.query(
        `INSERT INTO website_claims
           (source_kind, eche_row_key, source_row_key, raw_value, structural_status,
            normalised_url, hostname, registrable_domain, rule_version,
            source_artifact_sha256, observed_at, ingest_run_id)
         VALUES ('ECHE_PUBLISHED', $1, $1, $2, 'STRUCTURALLY_VALID', $3, $2, $2,
                 'test-rules-1', repeat('b', 64), now(), $4)`,
        [`X L2${geo}|99900${geo.charCodeAt(0)}`, domain, `https://${domain}/`, fixture.ingestRunId],
      );
    }
  }

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    research = researchPool();
    await admin.query(`CREATE ROLE ${SOURCE_LOGIN} LOGIN PASSWORD '${LOGIN_PASSWORD}'`);
    await admin.query(`GRANT nwf_source_discovery TO ${SOURCE_LOGIN}`);
    await admin.query(`CREATE ROLE ${WRITER_LOGIN} LOGIN PASSWORD '${LOGIN_PASSWORD}'`);
    await admin.query(`GRANT nwf_discovery_subject_writer TO ${WRITER_LOGIN}`);
    await admin.query(`CREATE ROLE ${OUTSIDER_LOGIN} LOGIN PASSWORD '${LOGIN_PASSWORD}'`);
    await admin.query(
      `DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${OUTSIDER_LOGIN}', current_database()); END $$`,
    );
    source = new pg.Pool({ connectionString: urlFor(SOURCE_LOGIN), max: 4 });
    outsider = new pg.Pool({ connectionString: urlFor(OUTSIDER_LOGIN), max: 2 });
  });

  beforeEach(async () => {
    await admin.query(
      'TRUNCATE source_discovery_nomination_sightings, source_discovery_nomination_identities, ' +
        'source_discovery_nominations, source_discovery_runs, source_discovery_briefs',
    );
    await truncateAll(admin);
    fixture = await seedOrgunitRoot(admin);
    await seedOverlapClaims();
  });

  afterAll(async () => {
    await Promise.all([source?.end(), outsider?.end()]);
    await admin
      .query(
        `DO $$ BEGIN EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM ${OUTSIDER_LOGIN}', current_database()); END $$`,
      )
      .catch(() => undefined);
    for (const login of [SOURCE_LOGIN, WRITER_LOGIN, OUTSIDER_LOGIN]) {
      await admin.query(`DROP ROLE IF EXISTS ${login}`);
    }
    await Promise.all([admin?.end(), readonly?.end(), research?.end()]);
  });

  const run = (geo: Geo) =>
    runSourceDiscovery(source, {
      brief: NWF_DISCOVERY_BRIEF_V1,
      geography: geo,
      provider: new ScriptedSearchProvider(scriptFor(geo), RETRIEVED_AT),
    });

  // ------------------------------------------------------------ migration 0019

  describe('migration 0019: the capability and nothing more', () => {
    it('creates a NOLOGIN, non-superuser role with SELECT + INSERT on exactly three tables', async () => {
      const role = await admin.query(
        `SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
           FROM pg_roles WHERE rolname = 'nwf_source_discovery'`,
      );
      expect(role.rows).toEqual([
        {
          rolcanlogin: false,
          rolsuper: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolbypassrls: false,
        },
      ]);
      const tables = await admin.query<{ t: string; p: string }>(
        `SELECT table_name AS t, privilege_type AS p FROM information_schema.role_table_grants
          WHERE grantee = 'nwf_source_discovery' ORDER BY 1, 2`,
      );
      expect(tables.rows.map((r) => `${r.t}:${r.p}`)).toEqual([
        'source_discovery_briefs:INSERT',
        'source_discovery_briefs:SELECT',
        // REL P2 (migration 0020): the identity and sighting tables, SELECT + INSERT only.
        'source_discovery_nomination_identities:INSERT',
        'source_discovery_nomination_identities:SELECT',
        'source_discovery_nomination_sightings:INSERT',
        'source_discovery_nomination_sightings:SELECT',
        'source_discovery_nominations:INSERT',
        'source_discovery_nominations:SELECT',
        'source_discovery_runs:INSERT',
        'source_discovery_runs:SELECT',
      ]);
      const columns = await admin.query<{ t: string; c: string; p: string }>(
        `SELECT table_name AS t, column_name AS c, privilege_type AS p
           FROM information_schema.column_privileges
          WHERE grantee = 'nwf_source_discovery' AND table_name NOT LIKE 'source_discovery%'
          ORDER BY 1, 2`,
      );
      expect(columns.rows.map((r) => `${r.t}.${r.c}:${r.p}`)).toEqual([
        'orgunit_page_evidence.id:SELECT',
        'orgunit_page_evidence.observed_at:SELECT',
        'website_claims.registrable_domain:SELECT',
      ]);
    });

    it('grants NO UPDATE, DELETE, TRUNCATE or TEMPORARY anywhere', async () => {
      const { rows } = await admin.query<{ t: string; u: boolean; d: boolean; tr: boolean }>(
        `SELECT c.relname AS t,
                has_table_privilege('nwf_source_discovery', c.oid, 'UPDATE') AS u,
                has_table_privilege('nwf_source_discovery', c.oid, 'DELETE') AS d,
                has_table_privilege('nwf_source_discovery', c.oid, 'TRUNCATE') AS tr
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v')`,
      );
      expect(rows.length).toBeGreaterThan(30);
      expect(rows.filter((r) => r.u || r.d || r.tr)).toEqual([]);
      const temp = await admin.query<{ temp: boolean }>(
        `SELECT has_database_privilege('nwf_source_discovery', current_database(), 'TEMPORARY') AS temp`,
      );
      expect(temp.rows[0]!.temp).toBe(false);
    });

    it('refuses UPDATE and DELETE to the capability (42501) and to the owner (append-only trigger)', async () => {
      await run('NL');
      const client = await source.connect();
      try {
        await client.query('SET ROLE nwf_source_discovery');
        for (const table of [
          'source_discovery_nominations',
          'source_discovery_runs',
          'source_discovery_briefs',
        ]) {
          expect(
            await sqlstate(() => client.query(`UPDATE ${table} SET created_at = now()`)),
            table,
          ).toBe('42501');
          expect(await sqlstate(() => client.query(`DELETE FROM ${table}`)), table).toBe('42501');
          expect(await sqlstate(() => client.query(`TRUNCATE ${table}`)), table).toBe('42501');
        }
      } finally {
        await client.query('RESET ROLE').catch(() => undefined);
        client.release();
      }
      for (const table of [
        'source_discovery_nominations',
        'source_discovery_runs',
        'source_discovery_briefs',
      ]) {
        expect(
          await sqlstate(() => admin.query(`UPDATE ${table} SET created_at = now()`)),
          table,
        ).toBe('55000');
        expect(await sqlstate(() => admin.query(`DELETE FROM ${table}`)), table).toBe('55000');
      }
    });

    it('enforces URL admissibility, redaction backstops, method shape and the eche_overlap measurement', async () => {
      const summary = await run('NL');
      const client = await source.connect();
      const insert = (overrides: Record<string, unknown>) => {
        const row = {
          discovery_run_id: summary.runId,
          discovery_method: 'SEARCH_PROVIDER',
          provider_key: 'scripted-search',
          query_id: 'nl.nl.language-cafe.01',
          source_page_evidence_id: null,
          url: 'https://direct-fict.nl/',
          hostname: 'direct-fict.nl',
          registrable_domain: 'direct-fict.nl',
          title: null,
          snippet: null,
          retrieved_at: RETRIEVED_AT,
          eche_overlap: false,
          hei_signal: false,
          hei_signal_rule_version: 'source-discovery-hei-signal-v1',
          ...overrides,
        };
        const cols = Object.keys(row);
        return client.query(
          `INSERT INTO source_discovery_nominations (${cols.join(', ')})
           VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(row),
        );
      };
      try {
        await client.query('SET ROLE nwf_source_discovery');
        const social = {
          url: 'https://www.facebook.com/x',
          hostname: 'www.facebook.com',
          registrable_domain: 'facebook.com',
        };
        expect(await sqlstate(() => insert(social))).toBe('23514');
        const wa = { url: 'https://wa.me/123', hostname: 'wa.me', registrable_domain: 'wa.me' };
        expect(await sqlstate(() => insert(wa))).toBe('23514');
        expect(await sqlstate(() => insert({ url: 'https://direct-fict.nl:8080/' }))).toBe('23514');
        expect(await sqlstate(() => insert({ url: 'ftp://direct-fict.nl/' }))).toBe('23514');
        expect(await sqlstate(() => insert({ url: 'https://u@direct-fict.nl/' }))).toBe('23514');
        expect(await sqlstate(() => insert({ url: 'https://direct-fict.nl/?q=1' }))).toBe('23514');
        expect(await sqlstate(() => insert({ hostname: 'other-fict.nl' }))).toBe('23514');
        expect(await sqlstate(() => insert({ title: 'mail me at x@y.nl' }))).toBe('23514');
        expect(await sqlstate(() => insert({ snippet: 'a'.repeat(1001) }))).toBe('23514');
        expect(await sqlstate(() => insert({ query_id: null }))).toBe('23514');
        // The caller cannot assert the measurement: the trigger recomputes it.
        expect(await sqlstate(() => insert({ eche_overlap: true }))).toBe('23514');
        const overlap = {
          url: 'https://echo-overlap-fict.nl/',
          hostname: 'echo-overlap-fict.nl',
          registrable_domain: 'echo-overlap-fict.nl',
        };
        expect(await sqlstate(() => insert({ ...overlap, eche_overlap: false }))).toBe('23514');
        // A link-out nomination cannot ride on a SEARCH run (composite run FK).
        expect(
          await sqlstate(() =>
            insert({
              discovery_method: 'PAGE_LINK_OUT',
              provider_key: 'page-link-out',
              query_id: null,
            }),
          ),
        ).toBe('23514');
        expect(
          await sqlstate(() =>
            insert({ discovery_method: 'SEED', provider_key: 'operator-seed', query_id: null }),
          ),
        ).toBe('23503');
        expect(await sqlstate(() => insert({}))).toBe('SUCCEEDED');
      } finally {
        await client.query('RESET ROLE').catch(() => undefined);
        client.release();
      }
    });

    it('refuses an owner, a superuser and a login without the capability before any write', async () => {
      for (const pool of [admin, outsider, research]) {
        await expect(inSourceDiscoveryTransaction(pool, () => Promise.resolve(1))).rejects.toThrow(
          SourceDiscoverySessionRefused,
        );
      }
    });
  });

  // ------------------------------------------------------------ search runs

  describe('scripted search runs over JP, MX and NL', () => {
    it.each(['JP', 'MX', 'NL'] as const)(
      '%s: >= 10 distinct non-ECHE, non-HEI nominations; overlap measured, HEI flagged, duplicates deduped, social refused, PII redacted',
      async (geo) => {
        const summary = await run(geo);
        const section = queriesFor(NWF_DISCOVERY_BRIEF_V1, geo);
        expect(summary.queries.map((q) => q.queryId)).toEqual(
          section.queries.map((q) => q.queryId),
        );
        expect(summary.inserted).toBe(14); // 12 obscure + overlap + university
        expect(summary.duplicates).toBe(2);
        expect(summary.refusals).toEqual({ SOCIAL_OR_MESSAGING_HOST: 1, URL_EXPLICIT_PORT: 1 });
        expect(summary.echeOverlapInserted).toBe(1);
        expect(summary.heiSignalInserted).toBe(1);

        const { rows } = await readonly.query<{
          registrable_domain: string;
          eche_overlap: boolean;
          hei_signal: boolean;
          title: string | null;
          snippet: string | null;
          retrieved_at: Date;
          discovery_method: string;
          query_id: string;
        }>(
          `SELECT registrable_domain, eche_overlap, hei_signal, title, snippet, retrieved_at,
                  discovery_method, query_id
             FROM source_discovery_nominations WHERE discovery_run_id = $1`,
          [summary.runId],
        );
        expect(rows).toHaveLength(14);
        const independent = rows.filter((r) => !r.eche_overlap && !r.hei_signal);
        expect(new Set(independent.map((r) => r.registrable_domain)).size).toBeGreaterThanOrEqual(
          10,
        );
        expect(independent.map((r) => r.registrable_domain).sort()).toEqual(
          OBSCURE[geo].map(([d]) => d).sort(),
        );
        expect(rows.find((r) => r.registrable_domain === EXTRAS[geo].overlap)?.eche_overlap).toBe(
          true,
        );
        expect(
          rows.find((r) => r.registrable_domain === EXTRAS[geo].university[0])?.hei_signal,
        ).toBe(true);
        expect(rows.some((r) => /facebook|instagram|wa\.me/.test(r.registrable_domain))).toBe(
          false,
        );
        for (const r of rows) {
          expect(r.discovery_method).toBe('SEARCH_PROVIDER');
          expect(r.retrieved_at.toISOString()).toBe(RETRIEVED_AT);
          expect(`${r.title ?? ''} ${r.snippet ?? ''}`).not.toMatch(
            /@|[0-9](?:[ .()+/-]{0,2}[0-9]){8}/,
          );
        }
        const pii = rows.find((r) => r.registrable_domain === OBSCURE[geo][0]![0])!;
        expect(pii.snippet).toContain('[EMAIL]');
        expect(pii.snippet).toContain('[PHONE]');
        // The same domain kept its FIRST nomination (the main page, not /events).
        expect(pii.title).toBe(OBSCURE[geo][0]![1]);
      },
    );

    it('records the brief once by digest, one run per geography, and nominations carry no country', async () => {
      const jp = await run('JP');
      const nl = await run('NL');
      expect(jp.briefId).toBe(nl.briefId);
      const briefs = await readonly.query(
        `SELECT brief_key, geography_claim, languages FROM source_discovery_briefs`,
      );
      expect(briefs.rows).toEqual([
        {
          brief_key: 'nwf-discovery-brief-v1',
          geography_claim: ['JP', 'MX', 'NL'],
          languages: ['en', 'es', 'ja', 'nl'],
        },
      ]);
      const runs = await readonly.query(
        `SELECT run_kind, geography FROM source_discovery_runs ORDER BY geography`,
      );
      expect(runs.rows).toEqual([
        { run_kind: 'SEARCH_PROVIDER', geography: 'JP' },
        { run_kind: 'SEARCH_PROVIDER', geography: 'NL' },
      ]);
      const cols = await admin.query<{ c: string }>(
        `SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'source_discovery_nominations'`,
      );
      expect(
        cols.rows
          .map((r) => r.c)
          .filter((c) => /country|geograph|locale|market|email|phone|contact/.test(c)),
      ).toEqual([]);
    });

    it('refuses a geography the brief does not claim before writing anything', async () => {
      await expect(
        runSourceDiscovery(source, {
          brief: NWF_DISCOVERY_BRIEF_V1,
          geography: 'FR',
          provider: new ScriptedSearchProvider(new Map(), RETRIEVED_AT),
        }),
      ).rejects.toThrow(/GEOGRAPHY_NOT_CLAIMED/);
      const { rows } = await readonly.query(`SELECT count(*)::int AS n FROM source_discovery_runs`);
      expect(rows[0]!.n).toBe(0);
    });
  });

  // ------------------------------------------------------------ link-out capture

  describe('link-out capture from a scripted root run: recorded, never fetched', () => {
    const ROOT = 'https://www.example.ac.uk/';
    const OFF_DOMAIN_HOSTS = [
      'taalcafe-linkout-fict.nl',
      'www.intercambio-linkout-fict.mx',
      'kokusai-linkout-fict.jp',
      'www.facebook.com',
      'query-linkout-fict.jp',
    ];

    function transport(): RoutedTransport {
      return new RoutedTransport()
        .route(`${ROOT}robots.txt`, {
          kind: 'RESPONSE',
          status: 200,
          headers: { 'content-type': 'text/plain' },
          body: Buffer.from('User-agent: *\nAllow: /'),
          truncated: false,
        })
        .route(
          ROOT,
          html('Home', [
            '/about',
            'https://taalcafe-linkout-fict.nl/',
            'https://www.intercambio-linkout-fict.mx/grupo',
            'https://www.facebook.com/fict-office',
            'https://query-linkout-fict.jp/page?id=7',
            'mailto:office@example.ac.uk',
          ]),
        )
        .route(
          `${ROOT}about`,
          html('About', [
            'https://taalcafe-linkout-fict.nl/agenda',
            'https://kokusai-linkout-fict.jp/',
          ]),
        );
    }

    async function newResearchRun(): Promise<string> {
      const { rows } = await research.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
         VALUES (now(), 'test-vantage', '${FETCH_POLICY_VERSION}', 'orgunit-signal-rules-v1', false)
         RETURNING id`,
      );
      return rows[0]!.id;
    }

    const deps = (t: RoutedTransport) => {
      const cohort = syntheticCohort();
      cohort.admit(fixture);
      return { loadCohortRegistry: cohort.load, transport: t, clock: instantClock() };
    };

    it('persists PAGE_LINK_OUT nominations citing their page evidence, and requests none of them', async () => {
      const researchRunId = await newResearchRun();
      const capture = createLinkOutNominationSink(source, researchRunId);
      const t = transport();
      const summary = await runRootAcquisition(
        research,
        researchRunId,
        { kind: 'WEBSITE_CLAIM', websiteClaimId: fixture.websiteClaimId },
        { ...deps(t), offDomainAnchorSink: capture.sink },
      );
      expect(summary.pagesWithEvidence).toBe(2);

      // NEVER FETCHED: no off-domain host was resolved or requested.
      for (const host of OFF_DOMAIN_HOSTS) {
        expect(t.resolvedHosts, host).not.toContain(host);
        expect(
          t.requestedUrls.some((u) => new URL(u).hostname === host),
          host,
        ).toBe(false);
      }
      expect([...new Set(t.resolvedHosts)]).toEqual(['www.example.ac.uk']);

      const s = capture.summary();
      expect(s).toMatchObject({ offered: 6, inserted: 3, duplicates: 1 });
      expect(s.refusals).toEqual({ SOCIAL_OR_MESSAGING_HOST: 1, URL_NOT_ADMISSIBLE: 1 });

      const { rows } = await readonly.query<{
        registrable_domain: string;
        url: string;
        title: string | null;
        source_page_evidence_id: string;
        retrieved_at: Date;
        observed_at: Date;
        page_url: string;
        run_kind: string;
        research_run_id: string;
        provider_key: string;
      }>(
        `SELECT n.registrable_domain, n.url, n.title, n.source_page_evidence_id, n.retrieved_at,
                p.observed_at, f.requested_url AS page_url, r.run_kind, r.research_run_id,
                n.provider_key
           FROM source_discovery_nominations n
           JOIN source_discovery_runs r ON r.id = n.discovery_run_id
           JOIN orgunit_page_evidence p ON p.id = n.source_page_evidence_id
           JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
          ORDER BY n.registrable_domain`,
      );
      expect(rows.map((r) => [r.registrable_domain, r.page_url])).toEqual([
        ['intercambio-linkout-fict.mx', ROOT],
        ['kokusai-linkout-fict.jp', `${ROOT}about`],
        ['taalcafe-linkout-fict.nl', ROOT],
      ]);
      for (const r of rows) {
        expect(r.run_kind).toBe('PAGE_LINK_OUT');
        expect(r.provider_key).toBe('page-link-out');
        expect(r.research_run_id).toBe(researchRunId);
        expect(r.retrieved_at.getTime()).toBe(r.observed_at.getTime());
        expect(r.title).toMatch(/^Link \d /);
      }
      expect(s.discoveryRunId).not.toBeNull();

      // A second root run under the same research run reuses the one capture run.
      const again = createLinkOutNominationSink(source, researchRunId);
      await again.sink(rows[0]!.source_page_evidence_id, 'https://brand-new-fict.nl/', 'New');
      expect(again.summary().discoveryRunId).toBe(s.discoveryRunId);
    });

    it('with no sink (the default) off-domain anchors are discarded exactly as before', async () => {
      const researchRunId = await newResearchRun();
      const t = transport();
      await runRootAcquisition(
        research,
        researchRunId,
        { kind: 'WEBSITE_CLAIM', websiteClaimId: fixture.websiteClaimId },
        deps(t),
      );
      const { rows } = await readonly.query(
        `SELECT count(*)::int AS n FROM source_discovery_nominations`,
      );
      expect(rows[0]!.n).toBe(0);
      expect([...new Set(t.resolvedHosts)]).toEqual(['www.example.ac.uk']);
    });
  });

  // ------------------------------------------------------------ CLI

  describe('CLI: dry-run discovery, list and explicit promotion through the B2.2 writer', () => {
    async function cli(argv: string[]): Promise<{ code: number; out: string; err: string }> {
      const out: string[] = [];
      const err: string[] = [];
      const code = await runSourceDiscoveryCli(argv, {
        readonlyPool: () => new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 2 }),
        writerPool: () => new pg.Pool({ connectionString: urlFor(WRITER_LOGIN), max: 2 }),
        out: (t) => void out.push(t),
        err: (t) => void err.push(t),
      });
      return { code, out: out.join(''), err: err.join('') };
    }

    it('discover-sources prints the queries as a DRY RUN and writes nothing', async () => {
      const r = await cli([
        'discover-sources',
        '--brief',
        'nwf-discovery-brief-v1',
        '--geography',
        'JP',
        '--json',
      ]);
      expect(r.code).toBe(0);
      const env = JSON.parse(r.out) as { outcome: string; data: { queries: { text: string }[] } };
      expect(env.outcome).toBe('DRY_RUN');
      expect(env.data.queries.map((q) => q.text)).toContain('国際交流協会 語学');
      const text = await cli([
        'discover-sources',
        '--brief',
        'nwf-discovery-brief-v1',
        '--geography',
        'MX',
      ]);
      expect(text.out).toContain('intercambio de idiomas asociación');
      const { rows } = await readonly.query(`SELECT count(*)::int AS n FROM source_discovery_runs`);
      expect(rows[0]!.n).toBe(0);
    });

    it('--execute is refused (live search is not authorised), as are unclaimed geographies and --all', async () => {
      const exec = await cli([
        'discover-sources',
        '--brief',
        'nwf-discovery-brief-v1',
        '--geography',
        'NL',
        '--execute',
        '--json',
      ]);
      expect(exec.code).toBe(1);
      expect(JSON.parse(exec.out)).toMatchObject({
        outcome: 'REFUSED',
        code: 'LIVE_SEARCH_NOT_AUTHORISED',
      });
      const fr = await cli([
        'discover-sources',
        '--brief',
        'nwf-discovery-brief-v1',
        '--geography',
        'FR',
      ]);
      expect(fr.code).toBe(1);
      expect(fr.err).toContain('GEOGRAPHY_NOT_CLAIMED');
      const all = await cli(['discover-sources', '--brief', 'nwf-discovery-brief-v1', '--all']);
      expect(all.code).toBe(1);
      expect(all.err).toContain('INPUT_INVALID');
      const listAll = await cli(['nominations', 'list', '--all']);
      expect(listAll.code).toBe(1);
    });

    it('promote: dry run writes nothing; --execute registers ONE subject whose name claim cites the nomination', async () => {
      const summary = await run('NL');
      const listed = await cli([
        'nominations',
        'list',
        '--run-id',
        summary.runId,
        '--limit',
        '100',
        '--json',
      ]);
      const nominations = (
        JSON.parse(listed.out) as {
          data: { nominations: { id: string; registrableDomain: string }[] };
        }
      ).data.nominations;
      expect(nominations).toHaveLength(14);
      const target = nominations.find((n) => n.registrableDomain === 'taalcafe-utrecht-fict.nl')!;
      const nomination = (await loadNomination(readonly, target.id))!;
      const subjectId = randomUUID();
      const args = [
        'nominations',
        'promote',
        '--nomination-id',
        target.id,
        '--subject-id',
        subjectId,
        '--kind',
        'INDEPENDENT_COMMUNITY',
        '--name-language',
        'nl',
        '--json',
      ];

      const dry = await cli(args);
      expect(dry.code).toBe(0);
      expect(JSON.parse(dry.out)).toMatchObject({ outcome: 'DRY_RUN' });
      const before = await readonly.query(`SELECT count(*)::int AS n FROM discovery_subjects`);
      expect(before.rows[0]!.n).toBe(0);

      const exec = await cli([...args, '--execute']);
      expect(exec.code, exec.err).toBe(0);
      expect(JSON.parse(exec.out)).toMatchObject({ outcome: 'EXECUTED' });
      const { rows } = await readonly.query<{
        registered_kind: string;
        registered_by_actor_key: string;
        name_text: string;
        source_type: string;
        source_url: string;
        source_version_ref: string;
        observed_at: Date;
        claim_basis: string;
      }>(
        `SELECT s.registered_kind, s.registered_by_actor_key, c.name_text, c.source_type,
                c.source_url, c.source_version_ref, c.observed_at, c.claim_basis
           FROM discovery_subjects s JOIN discovery_subject_identity_claims c ON c.subject_id = s.id
          WHERE s.id = $1`,
        [subjectId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        registered_kind: 'INDEPENDENT_COMMUNITY',
        registered_by_actor_key: 'discovery-subjects-cli',
        name_text: 'Taalcafé Utrecht',
        source_type: 'PUBLIC_URL',
        source_url: nomination.url,
        source_version_ref: nominationCitationDigest(nomination),
        claim_basis: 'SOURCE_STATED',
      });
      expect(rows[0]!.observed_at.toISOString()).toBe(nomination.retrievedAt);
      expect(nomination.retrievedAt).toBe(RETRIEVED_AT);

      // Nothing auto-promotes: exactly the one subject the operator asked for.
      const after = await readonly.query(`SELECT count(*)::int AS n FROM discovery_subjects`);
      expect(after.rows[0]!.n).toBe(1);
      // A retry of the same subject id is refused by the writer, not duplicated.
      const retry = await cli([...args, '--execute']);
      expect(retry.code).toBe(1);
      expect(retry.out).toContain('REGISTRY_SUBJECT_ALREADY_EXISTS');
    });

    it('promote refuses an unknown nomination, a bad kind and a missing subject id', async () => {
      const unknown = await cli([
        'nominations',
        'promote',
        '--nomination-id',
        randomUUID(),
        '--subject-id',
        randomUUID(),
        '--kind',
        'UNCERTAIN',
      ]);
      expect(unknown.code).toBe(1);
      expect(unknown.err).toContain('NOMINATION_NOT_FOUND');
      const kind = await cli([
        'nominations',
        'promote',
        '--nomination-id',
        randomUUID(),
        '--subject-id',
        randomUUID(),
        '--kind',
        'UNIVERSITY',
      ]);
      expect(kind.err).toContain('--kind must be one of');
      const missing = await cli([
        'nominations',
        'promote',
        '--nomination-id',
        randomUUID(),
        '--kind',
        'UNCERTAIN',
      ]);
      expect(missing.err).toContain('--subject-id is required');
    });
  });
});

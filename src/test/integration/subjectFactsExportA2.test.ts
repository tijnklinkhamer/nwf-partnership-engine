/**
 * REL final join A2 - the READ-ONLY subject facts export against a REAL
 * PostgreSQL (`*_test` only), over the Operator's synthetic REL world.
 *
 * The eleven Discovery Subjects of the Operator's twelve-organisation world
 * (`server/test/qualificationFit/world.ts`: same subject ids, names, website
 * hosts and countries; the twelfth is an ECHE HEI, not a subject) are entered
 * the way the Engine really enters them, with no network and no model:
 *   1. scripted source-discovery nominations under `nwf-discovery-brief-v1`;
 *   2. each nomination promoted through the B2.2 writer (its NAME claim cites
 *      the nomination), then a PUBLIC_WEBSITE claim citing the same
 *      nomination, through the registry CLI;
 *   3. ADR 0024 country-of-operation claims, recorded by the migration owner
 *      (no runtime role can write them) - the contradicted organisation gets
 *      a second, disagreeing country from another source.
 * Then `nwf-pe subject-facts export` reads them as the readonly role.
 *
 * THE OPERATOR FIXTURE. With `SUBJECT_FACTS_WRITE_FIXTURE=1` the CLI's
 * stdout is written to `src/test/fixtures/subjectFactsV1/rel-world-subject-facts.json`;
 * the Operator copies those bytes and pins their sha256. The Operator's
 * fixture hygiene admits only synthetic UUIDs, while the registry writer, the
 * source-discovery store and PostgreSQL issue random v4 ids, so every
 * non-synthetic UUID is RELABELLED (`relabel`) on the I0-R2 fixture pattern:
 * one bijection onto `cccccccc-0000-4000-8000-a2…`, assigned in sorted order,
 * so every sorted list keeps its order. Nothing else changes - not a name, a
 * host, a country, an instant or a digest (the `v=` citation digests were
 * computed over the ORIGINAL nomination ids: cited, not recomputable, in the
 * copy). The subject ids are the world's own synthetic ids. Without the flag,
 * the committed fixture must carry the same stable facts as a fresh export.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { runDiscoverySubjects } from '../../cli/commands/discoverySubjects.js';
import { runSubjectFactsCli } from '../../cli/commands/subjectFacts.js';
import { NWF_DISCOVERY_BRIEF_V1, queriesFor } from '../../orgunits/sourceDiscovery/brief.js';
import {
  nominationCitationDigest,
  promoteNomination,
  promotionRequest,
} from '../../orgunits/sourceDiscovery/promote.js';
import { runSourceDiscovery } from '../../orgunits/sourceDiscovery/run.js';
import { ScriptedSearchProvider } from '../../orgunits/sourceDiscovery/scriptedProvider.js';
import { listNominations, type NominationRow } from '../../orgunits/sourceDiscovery/store.js';
import type { SubjectKind } from '../../orgunits/sourceDiscovery/identityBridge.js';
import type { RawSearchResult } from '../../orgunits/sourceDiscovery/types.js';
import {
  LICENCE_UNKNOWN,
  SUBJECT_FACTS_EXPORT_CONTRACT,
  type SubjectFactsDocument,
} from '../../orgunits/subjectFacts/facts.js';
import { exportSubjectFacts } from '../../orgunits/subjectFacts/load.js';
import { adminPool, readonlyPool, researchDatabaseConfigured, truncateAll } from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
export const SUBJECT_FACTS_FIXTURE_PATH = join(
  HERE,
  '../fixtures/subjectFactsV1/rel-world-subject-facts.json',
);

const RETRIEVED_AT = '2026-10-26T08:00:00.000Z';
const SUFFIX = randomBytes(4).toString('hex');
const SOURCE_LOGIN = `nwf_relfj_a2_source_${SUFFIX}`;
const WRITER_LOGIN = `nwf_relfj_a2_writer_${SUFFIX}`;
const LOGIN_PASSWORD = randomBytes(24).toString('hex');
const ACTOR = 'rel-final-join-a2-test';

type Geo = 'JP' | 'MX' | 'NL';

interface WorldSubject {
  readonly key: string;
  readonly n: number;
  readonly name: string;
  readonly language: string;
  readonly kind: SubjectKind;
  /** The world's first source URL (`site(...)` in world.ts). */
  readonly site: string;
  /** The search geography the scripted nomination is returned under: never a country claim. */
  readonly searchGeography: Geo;
  /** ADR 0024 COUNTRY_OF_OPERATION claims, in recording order. */
  readonly countries: readonly string[];
  readonly expectedCountry: string | null;
}

const site = (host: string, path = '') => `https://${host}.example.test/${path}`;

/** The Operator world's eleven subjects, restated (the Operator test pins the join). */
const WORLD: readonly WorldSubject[] = [
  {
    key: 'nl-exchange',
    n: 0x01,
    name: 'Vereniging Taaluitwisseling Voorbeeld-Utrecht',
    language: 'nl',
    kind: 'INDEPENDENT_COMMUNITY',
    site: site('taaluitwisseling-utrecht'),
    searchGeography: 'NL',
    countries: ['NL'],
    expectedCountry: 'NL',
  },
  {
    key: 'nl-cafe',
    n: 0x02,
    name: 'Taalcafé Voorbeeld-Amsterdam',
    language: 'nl',
    kind: 'INDEPENDENT_COMMUNITY',
    site: site('taalcafe-amsterdam'),
    searchGeography: 'NL',
    countries: ['NL'],
    expectedCountry: 'NL',
  },
  {
    key: 'nl-cafe-duplicate',
    n: 0x03,
    name: 'Voorbeeld Language Café Amsterdam',
    language: 'en',
    kind: 'INDEPENDENT_COMMUNITY',
    site: site('taalcafe-amsterdam', 'en'),
    searchGeography: 'NL',
    countries: ['NL'],
    expectedCountry: 'NL',
  },
  {
    key: 'jp-circle',
    n: 0x04,
    name: 'Rei Tokyo International Exchange Circle',
    language: 'en',
    kind: 'INDEPENDENT_STUDENT_ASSOCIATION',
    site: site('rei-exchange-circle'),
    searchGeography: 'JP',
    countries: ['JP'],
    expectedCountry: 'JP',
  },
  {
    key: 'jp-school',
    n: 0x05,
    name: 'Rei Osaka Japanese Language School',
    language: 'en',
    kind: 'OTHER_ORGANISATIONAL_UNIT',
    site: site('rei-osaka-school'),
    searchGeography: 'JP',
    countries: ['JP'],
    expectedCountry: 'JP',
  },
  {
    key: 'jp-institute',
    n: 0x06,
    name: 'Rei Kyoto Cultural Institute',
    language: 'en',
    kind: 'OTHER_ORGANISATIONAL_UNIT',
    site: site('rei-kyoto-institute'),
    searchGeography: 'JP',
    countries: ['JP'],
    expectedCountry: 'JP',
  },
  {
    key: 'jp-online',
    n: 0x07,
    name: 'Rei Nagoya Online Language Community',
    language: 'en',
    kind: 'INDEPENDENT_COMMUNITY',
    site: site('rei-nagoya-online'),
    searchGeography: 'JP',
    countries: ['JP'],
    expectedCountry: 'JP',
  },
  {
    key: 'mx-intercambio',
    n: 0x08,
    name: 'Intercambio de Idiomas Ejemplo CDMX',
    language: 'es',
    kind: 'INDEPENDENT_COMMUNITY',
    site: site('intercambio-ejemplo-cdmx'),
    searchGeography: 'MX',
    countries: ['MX'],
    expectedCountry: 'MX',
  },
  {
    key: 'mx-community',
    n: 0x09,
    name: 'Círculo Comunitario Ejemplo Guadalajara',
    language: 'es',
    kind: 'INDEPENDENT_COMMUNITY',
    site: site('circulo-ejemplo-gdl'),
    searchGeography: 'MX',
    countries: ['MX'],
    expectedCountry: 'MX',
  },
  // Its own site states Mexico; a directory listing states another country.
  {
    key: 'mx-contradicted',
    n: 0x0a,
    name: 'Ejemplo Monterrey Language Exchange',
    language: 'en',
    kind: 'INDEPENDENT_COMMUNITY',
    site: site('ejemplo-mty-exchange'),
    searchGeography: 'MX',
    countries: ['MX', 'US'],
    expectedCountry: null,
  },
  // Outside the pilot geographies; nominated by a Dutch-language search.
  {
    key: 'de-tandem',
    n: 0x0b,
    name: 'Beispiel Tandem Verein Berlin',
    language: 'de',
    kind: 'INDEPENDENT_COMMUNITY',
    site: site('beispiel-tandem-berlin'),
    searchGeography: 'NL',
    countries: ['DE'],
    expectedCountry: 'DE',
  },
];

const subjectIdOf = (s: WorldSubject) =>
  `55555555-0000-4000-8000-5d${s.n.toString(16).padStart(10, '0')}`;
/** A fictitious public listing per subject, on a distinct ICANN registrable domain. */
const nominationUrlOf = (s: WorldSubject) =>
  `https://${s.key}-fict.${s.searchGeography.toLowerCase()}/`;

function scriptFor(geo: Geo): Map<string, RawSearchResult[]> {
  const ids = queriesFor(NWF_DISCOVERY_BRIEF_V1, geo).queries.map((q) => q.queryId);
  const script = new Map<string, RawSearchResult[]>(ids.map((id) => [id, []]));
  script.get(ids[0]!)!.push(
    ...WORLD.filter((s) => s.searchGeography === geo).map((s) => ({
      url: nominationUrlOf(s),
      title: s.name,
      snippet: `${s.name} - language exchange.`,
    })),
  );
  return script;
}

const UUID_ANY = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
const SYNTHETIC_UUID = /^([0-9a-f])\1{7}-0000-4000-8000-[0-9a-f]{12}$/;

/** Every non-synthetic UUID onto `cccccccc-0000-4000-8000-a2<n>`, order-preserving. */
function relabel(text: string): string {
  const random = [...new Set(text.match(UUID_ANY) ?? [])]
    .filter((u) => !SYNTHETIC_UUID.test(u))
    .sort();
  const mapping = new Map(
    random.map((u, i) => [
      u,
      `cccccccc-0000-4000-8000-a2${(i + 1).toString(16).padStart(10, '0')}`,
    ]),
  );
  return text.replace(UUID_ANY, (u) => mapping.get(u) ?? u);
}

/** The facts a fresh export and the committed fixture must share. */
function stableFacts(document: SubjectFactsDocument) {
  return document.subjects.map((s) => ({
    subjectId: s.subjectId,
    name: s.name.state === 'STATED' ? s.name.text : s.name.state,
    websiteHost: s.websiteHost.state === 'STATED' ? s.websiteHost.host : s.websiteHost.state,
    claimedCountry: s.claimedCountry,
    countryOfOperation: s.jurisdiction.countryOfOperation.state,
    negativeReviewRecorded: s.negativeReviewRecorded,
    resolution: s.provenance?.source.resolution ?? null,
    ingestRunKind: s.provenance?.source.ingestRun?.kind ?? null,
    sourceLicence: s.provenance?.source.sourceLicence ?? null,
    sourceRetrievedAt: s.provenance?.source.sourceRetrievedAt ?? null,
    nameClaims: s.nameClaims.length,
    websiteClaims: s.websiteClaims.length,
  }));
}

describeDb('REL final join A2: subject facts export over the REL world (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let source: pg.Pool;
  let writer: pg.Pool;

  function loginUrl(login: string): string {
    const url = new URL(testDatabaseUrl('admin')!);
    url.username = login;
    url.password = LOGIN_PASSWORD;
    return url.toString();
  }

  async function registry(argv: string[]): Promise<void> {
    const err: string[] = [];
    const exit = await runDiscoverySubjects([...argv, '--json'], {
      readonlyPool: () => new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 2 }),
      writerPool: () => new pg.Pool({ connectionString: loginUrl(WRITER_LOGIN), max: 2 }),
      reviewerPool: () => {
        throw new Error('no review in this test');
      },
      out: () => undefined,
      err: (t) => void err.push(t),
    });
    expect(exit, err.join('')).toBe(0);
  }

  async function cli(argv: string[]): Promise<{ exit: number; out: string; err: string }> {
    const out: string[] = [];
    const err: string[] = [];
    const exit = await runSubjectFactsCli(argv, {
      readonlyPool: () => new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 2 }),
      out: (t) => void out.push(t),
      err: (t) => void err.push(t),
    });
    return { exit, out: out.join(''), err: err.join('') };
  }

  async function truncateEverything(): Promise<void> {
    await admin.query(
      'TRUNCATE source_discovery_nominations, source_discovery_runs, source_discovery_briefs',
    );
    await truncateAll(admin);
  }

  async function counts(): Promise<Record<string, number>> {
    const tables = [
      'discovery_subjects',
      'discovery_subject_identity_claims',
      'discovery_subject_reviews',
      'subject_jurisdiction_claims',
      'source_discovery_nominations',
      'source_discovery_runs',
    ];
    const out: Record<string, number> = {};
    for (const t of tables) {
      const r = await admin.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`);
      out[t] = Number(r.rows[0]!.n);
    }
    return out;
  }

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    await truncateEverything();
    for (const login of [SOURCE_LOGIN, WRITER_LOGIN]) {
      await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${LOGIN_PASSWORD}'`);
    }
    await admin.query(`GRANT nwf_source_discovery TO ${SOURCE_LOGIN}`);
    await admin.query(`GRANT nwf_discovery_subject_writer TO ${WRITER_LOGIN}`);
    source = new pg.Pool({ connectionString: loginUrl(SOURCE_LOGIN), max: 2 });
    writer = new pg.Pool({ connectionString: loginUrl(WRITER_LOGIN), max: 2 });
  });

  afterAll(async () => {
    await Promise.all([source?.end(), writer?.end()]);
    await truncateEverything();
    for (const login of [SOURCE_LOGIN, WRITER_LOGIN]) {
      await admin.query(`DROP ROLE IF EXISTS ${login}`);
    }
    await Promise.all([admin.end(), readonly.end()]);
  });

  it('derives every subject fact from stored claims, read-only, and emits the Operator fixture', async () => {
    // ---- 1. Scripted nominations, one search run per geography.
    const nominationOf = new Map<string, NominationRow>();
    for (const geo of ['JP', 'MX', 'NL'] as const) {
      const summary = await runSourceDiscovery(source, {
        brief: NWF_DISCOVERY_BRIEF_V1,
        geography: geo,
        provider: new ScriptedSearchProvider(scriptFor(geo), RETRIEVED_AT),
      });
      const rows = await listNominations(readonly, {
        runId: summary.runId,
        after: null,
        limit: 100,
      });
      expect(rows, geo).toHaveLength(WORLD.filter((s) => s.searchGeography === geo).length);
      for (const row of rows) nominationOf.set(row.url, row);
    }

    // ---- 2. Promotion (NAME cites the nomination) and the PUBLIC_WEBSITE claim.
    for (const s of WORLD) {
      const nomination = nominationOf.get(nominationUrlOf(s))!;
      await promoteNomination(
        writer,
        promotionRequest({
          nomination,
          subjectId: subjectIdOf(s),
          kind: s.kind,
          nameLanguage: s.language,
        }),
        true,
      );
      await registry([
        'claim',
        '--subject-id',
        subjectIdOf(s),
        '--claim-kind',
        'PUBLIC_WEBSITE',
        '--website-url',
        s.site,
        '--source-url',
        nomination.url,
        '--source-version',
        nominationCitationDigest(nomination),
        '--observed-at',
        nomination.retrievedAt,
        '--basis',
        'SOURCE_STATED',
        '--execute',
      ]);
    }

    // ---- 3. ADR 0024 country claims (owner-recorded: no runtime role may write them).
    for (const s of WORLD) {
      const nomination = nominationOf.get(nominationUrlOf(s))!;
      for (const [index, country] of s.countries.entries()) {
        const own = index === 0;
        await admin.query(
          `INSERT INTO subject_jurisdiction_claims
             (subject_id, claim_kind, claimed_country, source_type, source_url,
              source_version_ref, observed_at, claim_basis, recorded_by_actor_key)
           VALUES ($1, 'COUNTRY_OF_OPERATION', $2, 'PUBLIC_URL', $3, $4, $5, 'SOURCE_STATED', $6)`,
          [
            subjectIdOf(s),
            country,
            own ? nomination.url : `https://directory.rel-world-fict.org/${s.key}`,
            own ? nominationCitationDigest(nomination) : null,
            RETRIEVED_AT,
            ACTOR,
          ],
        );
      }
    }

    // ---- 4. The export, through the CLI as the readonly role.
    const ids = WORLD.map(subjectIdOf);
    const before = await counts();
    const run = await cli(['export', ...ids.flatMap((id) => ['--subject-id', id])]);
    expect(run.exit, run.err).toBe(0);
    expect(await counts()).toEqual(before);
    const document = JSON.parse(run.out) as SubjectFactsDocument;
    expect(document.document).toBe(SUBJECT_FACTS_EXPORT_CONTRACT);
    expect(document.readConsistency).toBe('SINGLE_SNAPSHOT_TRANSACTION');
    expect(document.missingSubjectIds).toEqual([]);
    expect(document.subjects.map((s) => s.subjectId)).toEqual([...ids].sort());

    // The module and the CLI produce the same document (the read instant aside).
    const direct = await exportSubjectFacts(readonly, ids);
    expect({ ...direct, readAt: null }).toEqual({ ...document, readAt: null });

    for (const s of WORLD) {
      const facts = document.subjects.find((f) => f.subjectId === subjectIdOf(s))!;
      const nomination = nominationOf.get(nominationUrlOf(s))!;
      expect(facts.name, s.key).toMatchObject({ state: 'STATED', text: s.name });
      expect(facts.websiteHost, s.key).toMatchObject({
        state: 'STATED',
        host: new URL(s.site).hostname,
      });
      expect(facts.claimedCountry, s.key).toBe(s.expectedCountry);
      expect(facts.provenance?.source, s.key).toEqual({
        sourceRef: `url:${nomination.url}|v=${nominationCitationDigest(nomination)}`,
        sourceType: 'PUBLIC_URL',
        sourceUrl: nomination.url,
        resolution: 'SOURCE_DISCOVERY_NOMINATION',
        resolvedRecordId: nomination.id,
        sourceLicence: LICENCE_UNKNOWN,
        sourceRetrievedAt: RETRIEVED_AT,
        ingestRun: { kind: 'SOURCE_DISCOVERY_RUN', id: nomination.discoveryRunId },
      });
      expect(facts.websiteClaims[0]!.source.resolution, s.key).toBe('SOURCE_DISCOVERY_NOMINATION');
      expect(facts.engineUpdatedAt >= facts.engineCreatedAt, s.key).toBe(true);
    }
    const contradicted = document.subjects.find((f) => f.subjectId === subjectIdOf(WORLD[9]!))!;
    expect(contradicted.jurisdiction.countryOfOperation).toEqual({
      state: 'CONFLICTING',
      values: ['MX', 'US'],
    });

    // An unknown subject is reported, never invented; malformed input is refused.
    const unknown = '55555555-0000-4000-8000-5d00000000ff';
    const partial = await cli(['export', '--subject-id', ids[0]!, '--subject-id', unknown]);
    expect((JSON.parse(partial.out) as SubjectFactsDocument).missingSubjectIds).toEqual([unknown]);
    expect((await cli(['export', '--subject-id', 'nope'])).exit).toBe(1);
    expect((await cli(['export', '--all'])).exit).toBe(1);
    expect((await cli(['write'])).exit).toBe(1);

    // ---- 5. The Operator fixture: the CLI's exact bytes.
    if (process.env['SUBJECT_FACTS_WRITE_FIXTURE'] === '1') {
      mkdirSync(dirname(SUBJECT_FACTS_FIXTURE_PATH), { recursive: true });
      writeFileSync(SUBJECT_FACTS_FIXTURE_PATH, relabel(run.out), 'utf8');
    }
    expect(existsSync(SUBJECT_FACTS_FIXTURE_PATH)).toBe(true);
    const committedText = readFileSync(SUBJECT_FACTS_FIXTURE_PATH, 'utf8');
    for (const uuid of committedText.match(UUID_ANY) ?? []) expect(uuid).toMatch(SYNTHETIC_UUID);
    const committed = JSON.parse(committedText) as SubjectFactsDocument;
    expect(committed.document).toBe(SUBJECT_FACTS_EXPORT_CONTRACT);
    expect(stableFacts(committed)).toEqual(stableFacts(document));
  });
});

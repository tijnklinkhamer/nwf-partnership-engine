import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { testDatabaseUrl, type Role } from '../../config/env.js';
import { assertTestDatabaseConnection, assertTestDatabaseUrl } from '../../db/safety.js';
import type { ResolvedSource } from '../../ingest/eche/source.js';
import type { FresrResolvedSource } from '../../ingest/fresr/source.js';

export const FIXTURE_PATH = resolve(process.cwd(), 'src/test/fixtures/eche-sample.xlsx');
export const FRESR_FIXTURE_PATH = resolve(process.cwd(), 'src/test/fixtures/fresr-sample.json');

/** True when the separate integration-test database is configured. */
export function databaseConfigured(): boolean {
  return Boolean(testDatabaseUrl('admin') && testDatabaseUrl('ingest'));
}

/**
 * True when the Phase 2B research role is also configured.
 *
 * Deliberately a separate predicate: an environment that predates migration
 * 0007 has no DATABASE_URL_RESEARCH_TEST, and the Phase 2B grant tests should
 * skip there rather than fail with a connection error that looks like a bug in
 * the grants themselves.
 */
export function researchDatabaseConfigured(): boolean {
  return databaseConfigured() && Boolean(testDatabaseUrl('research'));
}

function pool(role: Role): pg.Pool {
  const url = testDatabaseUrl(role);
  if (!url) throw new Error(`No test database URL configured for role "${role}".`);
  return new pg.Pool({ connectionString: assertTestDatabaseUrl(url), max: 4 });
}

export function fixtureSource(bytes?: Buffer): ResolvedSource {
  const data = bytes ?? readFileSync(FIXTURE_PATH);
  return {
    kind: 'operator_file',
    pageUrl: null,
    fileUrl: null,
    filePath: FIXTURE_PATH,
    bytes: data,
    sha256: createHash('sha256').update(data).digest('hex'),
    contentType: null,
    retrievedAt: new Date('2026-08-21T00:00:00.000Z'),
  };
}

/**
 * The committed French-register fixture as a resolved source.
 *
 * Recorded as `operator_file` with NO asserted origin, which is the honest
 * description of a hand-written fixture: it was never published anywhere, so
 * its publication columns stay NULL.
 */
export function fresrFixtureSource(bytes?: Buffer): FresrResolvedSource {
  const data = bytes ?? readFileSync(FRESR_FIXTURE_PATH);
  return {
    kind: 'operator_file',
    readUrl: null,
    filePath: FRESR_FIXTURE_PATH,
    bytes: data,
    sha256: createHash('sha256').update(data).digest('hex'),
    fetchedAt: new Date('2026-08-24T00:00:00.000Z'),
    publicationUrl: null,
    originRetrievedAt: null,
  };
}

/**
 * Removes all ingested data while leaving the schema and grants in place.
 *
 * Asks the server which database it is connected to before truncating, so the
 * guarantee does not depend on the caller having used `pool()` above.
 */
export async function truncateAll(target: pg.Pool): Promise<void> {
  await assertTestDatabaseConnection(target);
  // Every table any ingest writes. ewp_* rows reference ingest_runs, so they
  // must be listed here too - otherwise a later run would fail on a dangling
  // foreign key and the failure would look like an ingest bug.
  // orgunit_* rows reference website_claims and organisations, so Phase 2B
  // evidence is listed here too. Listing it explicitly rather than relying on
  // CASCADE keeps the statement an accurate inventory of what a test run can
  // create - a silently cascaded table is one nobody remembers exists.
  await target.query(
    `TRUNCATE orgunit_page_candidates, orgunit_page_evidence,
              orgunit_root_promotion_revocations, orgunit_root_promotions,
              orgunit_redirect_observations, orgunit_fetch_observations,
              orgunit_research_run_completions, orgunit_research_runs,
              website_claims, website_source_snapshots,
              ewp_api_declarations, ewp_host_covered_heis, ewp_hosts,
              ewp_hei_other_ids, ewp_heis, ewp_snapshots,
              organisation_sources, organisations, ingest_runs CASCADE`,
  );
}

export function adminPool(): pg.Pool {
  return pool('admin');
}

export function ingestPool(): pg.Pool {
  return pool('ingest');
}

export function readonlyPool(): pg.Pool {
  return pool('readonly');
}

/** The Phase 2B research role (migration 0007). Append-only on orgunit_*. */
export function researchPool(): pg.Pool {
  return pool('research');
}

/** The minimum Phase 1 evidence a Phase 2B research root can descend from. */
export interface OrgunitRootFixture {
  ingestRunId: string;
  organisationId: string;
  websiteClaimId: string;
  echeRowKey: string;
}

/**
 * Seeds one ingest run, one organisation and one STRUCTURALLY_VALID website
 * claim, as the admin role.
 *
 * Written directly rather than by running the ECHE ingest: these tests are
 * about migration 0007's constraints and grants, and a full ingest would make
 * them depend on the parser, the fixture workbook and the normaliser as well.
 */
export async function seedOrgunitRoot(admin: pg.Pool): Promise<OrgunitRootFixture> {
  const echeRowKey = 'X TEST01|999000111';

  const run = await admin.query<{ id: string }>(
    `INSERT INTO ingest_runs (source_system, source_input_kind, status)
     VALUES ('eche', 'operator_file', 'succeeded') RETURNING id`,
  );
  const ingestRunId = run.rows[0]!.id;

  const org = await admin.query<{ id: string }>(
    `INSERT INTO organisations
       (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
     VALUES ($1, 'Test Institution', 'Test Institution', 'FR', 'X TEST01', '999000111')
     RETURNING id`,
    [echeRowKey],
  );
  const organisationId = org.rows[0]!.id;

  const claim = await admin.query<{ id: string }>(
    `INSERT INTO website_claims
       (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
        structural_status, normalised_url, hostname, registrable_domain,
        rule_version, source_artifact_sha256, observed_at, ingest_run_id)
     VALUES ('ECHE_PUBLISHED', $1, $2, $1, 'www.example.ac.uk',
             'STRUCTURALLY_VALID', 'https://www.example.ac.uk/',
             'www.example.ac.uk', 'example.ac.uk',
             'test-rules-1', repeat('a', 64), now(), $3)
     RETURNING id`,
    [echeRowKey, organisationId, ingestRunId],
  );

  return { ingestRunId, organisationId, websiteClaimId: claim.rows[0]!.id, echeRowKey };
}

export async function count(target: pg.Pool, table: string): Promise<number> {
  const { rows } = await target.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
  return Number.parseInt(rows[0]?.n ?? '0', 10);
}

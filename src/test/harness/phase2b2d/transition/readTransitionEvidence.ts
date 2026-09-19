/**
 * THE ONLY DATABASE-TOUCHING MODULE IN THIS STEP, AND IT ONLY READS.
 *
 * Every statement in this file is a `SELECT`. There is no INSERT, UPDATE,
 * DELETE, TRUNCATE, COPY, CREATE, ALTER, DROP, GRANT or transaction-control
 * statement anywhere in it, and it connects as the `readonly` role - which
 * holds SELECT on the `orgunit_*` evidence tables and NO WRITE GRANT ANYWHERE
 * in the schema. `research` would also have been able to read this and is
 * deliberately not used: it carries INSERT, and the right role for a read-only
 * step is the one that cannot write even by mistake.
 *
 * NO NETWORK. No socket module is imported. `pg` speaks to a loopback
 * container, and nothing here resolves or contacts an institution.
 *
 * A3a's `readPilotEvidence.ts` is the direct precedent for the page read, down
 * to reaching the document hash by join: `orgunit_page_evidence` has no hash
 * column, so SD7's "remove exact duplicates by documentSha256" resolves to
 * `orgunit_fetch_observations.response_sha256`, which is the landed schema's
 * only document hash.
 */
import type pg from 'pg';
import { TransitionStop } from './transitionContract.js';
import type { PersistedRedirect, PersistedRun } from './compatibilityCensus.js';

/**
 * Every table this step must prove it did not disturb. Listed explicitly
 * rather than derived from `pg_tables`, so a table added later shows up as a
 * missing name in review rather than as a silently unverified one.
 */
export const VERIFIED_TABLES = [
  'organisations',
  'website_claims',
  'orgunit_research_runs',
  'orgunit_research_run_completions',
  'orgunit_fetch_observations',
  'orgunit_redirect_observations',
  'orgunit_root_promotions',
  'orgunit_root_promotion_revocations',
  'orgunit_page_evidence',
  'orgunit_page_candidates',
] as const;

export interface TableCount {
  readonly table: string;
  readonly count: number;
}

export async function readTableCounts(pool: pg.Pool): Promise<readonly TableCount[]> {
  const counts: TableCount[] = [];
  for (const table of VERIFIED_TABLES) {
    // The table name comes from the frozen list above and from nowhere else -
    // there is no caller-supplied identifier anywhere in this module.
    const result = await pool.query<{ count: string }>(`SELECT count(*) AS count FROM ${table}`);
    counts.push({ table, count: Number.parseInt(result.rows[0]!.count, 10) });
  }
  return counts;
}

/**
 * Every acquisition run, with the fetch-policy version its observations carry.
 *
 * READ FROM THE FETCH OBSERVATIONS, NOT FROM THE RUN. `orgunit_research_runs`
 * records an execution identity and its configuration; the policy version a
 * request was actually issued under lives on the observation. A run whose
 * observations disagree with each other is a STOP, not an average.
 */
export async function readRuns(pool: pg.Pool): Promise<readonly PersistedRun[]> {
  const result = await pool.query<{
    id: string;
    started_at: Date;
    policy_versions: string[];
  }>(
    `SELECT r.id,
            r.started_at,
            coalesce(
              (SELECT array_agg(DISTINCT fo.fetch_policy_version)
                 FROM orgunit_fetch_observations fo
                WHERE fo.run_id = r.id),
              ARRAY[]::text[]
            ) AS policy_versions
       FROM orgunit_research_runs r
      ORDER BY r.started_at, r.id`,
  );

  return result.rows.map((row) => {
    if (row.policy_versions.length !== 1) {
      throw new TransitionStop(
        `STOP: a research run carries ${row.policy_versions.length} distinct fetch-policy ` +
          'versions across its observations. A run is issued under exactly one policy ' +
          'version, and classifying one that is not would be classifying a fiction.',
      );
    }
    return {
      runId: row.id,
      fetchPolicyVersion: row.policy_versions[0]!,
      startedAt: row.started_at.toISOString(),
    };
  });
}

/** Every persisted 3xx edge, joined to the request that produced it. */
export async function readRedirects(pool: pg.Pool): Promise<readonly PersistedRedirect[]> {
  const result = await pool.query<{
    run_id: string;
    requested_url: string;
    http_status: number;
    to_url_raw: string;
    to_url_resolved: string | null;
    target_malformed: boolean;
    scheme_downgraded: boolean | null;
    host_changed: boolean | null;
    registrable_domain_changed: boolean | null;
  }>(
    `SELECT fo.run_id,
            fo.requested_url,
            ro.http_status,
            ro.to_url_raw,
            ro.to_url_resolved,
            ro.target_malformed,
            ro.scheme_downgraded,
            ro.host_changed,
            ro.registrable_domain_changed
       FROM orgunit_redirect_observations ro
       JOIN orgunit_fetch_observations fo ON fo.id = ro.fetch_observation_id
      ORDER BY fo.observed_at, ro.id`,
  );

  return result.rows.map((row) => ({
    runId: row.run_id,
    requestedUrl: row.requested_url,
    httpStatus: row.http_status,
    toUrlRaw: row.to_url_raw,
    toUrlResolved: row.to_url_resolved,
    targetMalformed: row.target_malformed,
    schemeDowngraded: row.scheme_downgraded,
    hostChanged: row.host_changed,
    registrableDomainChanged: row.registrable_domain_changed,
  }));
}

/** One page-evidence row joined to its fetch's document hash. */
export interface TransitionPageRow {
  readonly runId: string;
  readonly echeRowKey: string;
  readonly pageId: string;
  readonly documentSha256: string;
  readonly mainText: string;
}

/**
 * Every page-evidence row for ONE organisation, with its run and document hash.
 *
 * The organisation - not the run - is the unit, because R3's SD7 comparison
 * scope is WITHIN_ONE_ORGANISATION_ONLY. The run is returned alongside so the
 * caller can PROVE which runs contributed, rather than assume the answer.
 */
export async function readOrganisationPages(
  pool: pg.Pool,
  echeRowKey: string,
): Promise<readonly TransitionPageRow[]> {
  const result = await pool.query<{
    run_id: string;
    eche_row_key: string;
    page_id: string;
    response_sha256: string | null;
    main_text: string;
  }>(
    `SELECT fo.run_id,
            fo.eche_row_key,
            pe.id AS page_id,
            fo.response_sha256,
            pe.main_text
       FROM orgunit_page_evidence pe
       JOIN orgunit_fetch_observations fo ON fo.id = pe.fetch_observation_id
      WHERE fo.eche_row_key = $1
      ORDER BY pe.id`,
    [echeRowKey],
  );

  return result.rows.map((row) => {
    if (row.response_sha256 === null) {
      // A page-evidence row exists only for a genuine 2xx HTML response, which
      // always carries a decoded-body hash. A NULL here would mean the exact
      // duplicate pass had no key to group by, and guessing one is not an option.
      throw new TransitionStop(
        'STOP: a page-evidence row has no response_sha256 on its fetch observation, ' +
          'so SD7 has no document hash to deduplicate by.',
      );
    }
    return {
      runId: row.run_id,
      echeRowKey: row.eche_row_key,
      pageId: row.page_id,
      documentSha256: row.response_sha256,
      mainText: row.main_text,
    };
  });
}

/** The raw page-evidence count for one organisation's ONE run. */
export async function readRunPageCount(pool: pg.Pool, runId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*) AS count
       FROM orgunit_page_evidence pe
       JOIN orgunit_fetch_observations fo ON fo.id = pe.fetch_observation_id
      WHERE fo.run_id = $1`,
    [runId],
  );
  return Number.parseInt(result.rows[0]!.count, 10);
}

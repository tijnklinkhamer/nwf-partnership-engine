/**
 * THE ONLY DATABASE-TOUCHING MODULE IN A3a, AND IT ONLY READS.
 *
 * Every statement in this file is a `SELECT`. There is no INSERT, UPDATE,
 * DELETE, TRUNCATE, COPY, CREATE, ALTER, DROP, GRANT or transaction-control
 * statement anywhere in it, and it connects as the `readonly` role - which
 * holds SELECT on the eight `orgunit_*` evidence tables and NO WRITE GRANT
 * ANYWHERE in the schema (migrations 0002, 0003, 0005, 0007, 0009). `research`
 * would also have been able to read this, and is deliberately not used: it
 * carries INSERT, and the right role for a read-only step is the one that
 * cannot write even by mistake. A3a's authority record sets
 * `databaseWriteAuthorised` to false, and the grants enforce it independently.
 *
 * NO NETWORK. No socket module is imported. `pg` speaks to a loopback
 * container, and nothing here resolves or contacts an institution.
 *
 * WHERE THE DOCUMENT HASH COMES FROM
 *
 *   R3's SD7 removes exact duplicates "by documentSha256". `orgunit_page_
 *   evidence` has no hash column - by design, since it stores DERIVED text and
 *   the bytes are represented only by `orgunit_fetch_observations.
 *   response_sha256` (migration 0007's own table comment says exactly this). So
 *   the document hash is reached by join from the page to its fetch. That is
 *   the landed schema's ONLY document hash and therefore the one the frozen
 *   wording names; A3a's authority record binds that reading explicitly.
 */
import type pg from 'pg';
import { Sd7PilotStop } from './sd7Contract.js';

/** One page-evidence row joined to its fetch's document hash. */
export interface PilotPageRow {
  readonly echeRowKey: string;
  readonly pageId: string;
  readonly documentSha256: string;
  readonly mainText: string;
  readonly mainTextChars: number;
}

export interface TableCount {
  readonly table: string;
  readonly count: number;
}

/**
 * Every table A3a must prove it did not disturb. Listed explicitly rather than
 * derived from `pg_tables`, so a table added later shows up as a missing name
 * in review rather than as a silently unverified one. (A1 takes the same line
 * for the same reason.)
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
 * Every page-evidence row Batch 01 produced, with its document hash.
 *
 * Ordered only so the read is reproducible. THIS ORDER IS NOT A SURVIVOR RANK
 * and nothing downstream may treat it as one: `nearDuplicatePairs.ts` measures
 * over ALL orders precisely so that no order in this repository - including
 * this one - becomes an answer the owner has not given.
 */
export async function readPilotPages(pool: pg.Pool): Promise<readonly PilotPageRow[]> {
  const result = await pool.query<{
    eche_row_key: string;
    page_id: string;
    response_sha256: string | null;
    main_text: string;
    main_text_chars: number;
  }>(
    `SELECT fo.eche_row_key,
            pe.id            AS page_id,
            fo.response_sha256,
            pe.main_text,
            pe.main_text_chars
       FROM orgunit_page_evidence pe
       JOIN orgunit_fetch_observations fo ON fo.id = pe.fetch_observation_id
      ORDER BY fo.eche_row_key, pe.id`,
  );

  return result.rows.map((row) => {
    if (row.response_sha256 === null) {
      // A page-evidence row exists only for a genuine 2xx HTML response, which
      // always carries a decoded-body hash. A NULL here would mean the exact
      // duplicate pass had no key to group by, and guessing one is not an option.
      throw new Sd7PilotStop(
        'STOP: a page-evidence row has no response_sha256 on its fetch ' +
          'observation, so SD7 has no document hash to deduplicate by.',
      );
    }
    return {
      echeRowKey: row.eche_row_key,
      pageId: row.page_id,
      documentSha256: row.response_sha256,
      mainText: row.main_text,
      mainTextChars: row.main_text_chars,
    };
  });
}

/**
 * The `eche_row_key` of every organisation Batch 01 ran, INCLUDING the three
 * that produced no page at all.
 *
 * READ FROM THE FETCH OBSERVATIONS, NOT FROM THE PAGES, AND NOT FROM THE RUNS.
 *
 *   Not from the pages, because a zero-yield organisation has no page-evidence
 *   row: an organisation list derived from pages would be three organisations
 *   short, and those three are exactly the ones whose SD9 verdict this pilot
 *   can settle outright.
 *
 *   Not from `orgunit_research_runs`, because that table carries no
 *   `eche_row_key` at all - a run is an execution identity and its
 *   configuration, and the organisation it was about lives one level down, on
 *   the fetch observation. Every one of the five organisations issued at least
 *   one gateway request, so all five appear here, including the one whose
 *   single request failed at DNS.
 */
export async function readPilotOrganisationKeys(pool: pg.Pool): Promise<readonly string[]> {
  const result = await pool.query<{ eche_row_key: string }>(
    `SELECT DISTINCT eche_row_key FROM orgunit_fetch_observations ORDER BY eche_row_key`,
  );
  return result.rows.map((row) => row.eche_row_key);
}

/** The count of runs Batch 01 recorded, checked against the execution record. */
export async function readResearchRunCount(pool: pg.Pool): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*) AS count FROM orgunit_research_runs`,
  );
  return Number.parseInt(result.rows[0]!.count, 10);
}

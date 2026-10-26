/**
 * REL L2 / U1 - APPEND-ONLY PERSISTENCE OF BRIEFS, RUNS AND NOMINATIONS.
 *
 * Every write happens inside `inSourceDiscoveryTransaction`, which refuses a
 * superuser or table-owner session, requires the connection to hold
 * `nwf_source_discovery`, and then narrows to exactly that capability with
 * `SET LOCAL ROLE` - the B2.2 writer pattern (subjectRegistry/writer.ts). The
 * capability holds SELECT + INSERT on three tables and two read-only column
 * grants; there is no UPDATE, DELETE or generic SQL here.
 *
 * `eche_overlap` is MEASURED here and re-measured by the database's own
 * INSERT trigger, which refuses a row that disagrees. It is a measurement,
 * never a join and never a merge.
 */
import type pg from 'pg';

import { briefDigest, briefPlan, type DiscoveryBrief } from './brief.js';
import type { PreparedNomination } from './nomination.js';
import {
  SOURCE_DISCOVERY_ACTOR_KEY,
  SOURCE_DISCOVERY_ROLE,
  type DiscoveryMethod,
  type ProviderKey,
  type SearchProviderKey,
} from './types.js';

export type Queryable = Pick<pg.ClientBase, 'query'>;

export class SourceDiscoverySessionRefused extends Error {
  constructor(detail: string) {
    super(`SOURCE_DISCOVERY_SESSION_REFUSED: ${detail}`);
    this.name = 'SourceDiscoverySessionRefused';
  }
}

async function enterSourceDiscoveryCapability(client: pg.PoolClient): Promise<void> {
  const { rows } = await client.query<{ super: boolean; holder: boolean; owner: boolean }>(
    `SELECT r.rolsuper AS super,
            pg_has_role(session_user, $1, 'MEMBER') AS holder,
            pg_has_role(session_user, c.relowner, 'MEMBER') AS owner
       FROM pg_roles r, pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE r.rolname = session_user AND n.nspname = 'public'
        AND c.relname = 'source_discovery_nominations'`,
    [SOURCE_DISCOVERY_ROLE],
  );
  const session = rows[0];
  if (session === undefined || session.super) {
    throw new SourceDiscoverySessionRefused('a superuser connection is refused.');
  }
  if (session.owner)
    throw new SourceDiscoverySessionRefused('a table-owner connection is refused.');
  if (!session.holder) {
    throw new SourceDiscoverySessionRefused(
      `the connection does not hold ${SOURCE_DISCOVERY_ROLE}.`,
    );
  }
  await client.query(`SET LOCAL ROLE ${SOURCE_DISCOVERY_ROLE}`);
}

/** One transaction, narrowed to the capability. Any throw rolls everything back. */
export async function inSourceDiscoveryTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await enterSourceDiscoveryCapability(client);
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Registers a brief by its digest. Idempotent: the same plan is one row. */
export async function registerBrief(q: Queryable, brief: DiscoveryBrief): Promise<string> {
  const digest = briefDigest(brief);
  await q.query(
    `INSERT INTO source_discovery_briefs
        (brief_key, plan_digest, query_plan, geography_claim, target_kinds, languages)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (brief_key, plan_digest) DO NOTHING`,
    [
      brief.briefKey,
      digest,
      JSON.stringify(briefPlan(brief)),
      [...brief.geographyClaim],
      [...brief.targetKinds],
      [...brief.languages],
    ],
  );
  const { rows } = await q.query<{ id: string }>(
    `SELECT id FROM source_discovery_briefs WHERE brief_key = $1 AND plan_digest = $2`,
    [brief.briefKey, digest],
  );
  return rows[0]!.id;
}

export async function startSearchRun(
  q: Queryable,
  input: { briefId: string; geography: string; providerKey: SearchProviderKey },
): Promise<string> {
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO source_discovery_runs
        (run_kind, provider_key, brief_id, geography, actor_key, started_at)
     VALUES ('SEARCH_PROVIDER', $1, $2, $3, $4, clock_timestamp())
     RETURNING id`,
    [input.providerKey, input.briefId, input.geography, SOURCE_DISCOVERY_ACTOR_KEY],
  );
  return rows[0]!.id;
}

/** The ONE link-out capture run of a research run, created on first use. */
export async function linkOutRunFor(q: Queryable, researchRunId: string): Promise<string> {
  await q.query(
    `INSERT INTO source_discovery_runs
        (run_kind, provider_key, research_run_id, actor_key, started_at)
     VALUES ('PAGE_LINK_OUT', 'page-link-out', $1, $2, clock_timestamp())
     ON CONFLICT (research_run_id) WHERE run_kind = 'PAGE_LINK_OUT' DO NOTHING`,
    [researchRunId, SOURCE_DISCOVERY_ACTOR_KEY],
  );
  const { rows } = await q.query<{ id: string }>(
    `SELECT id FROM source_discovery_runs
      WHERE run_kind = 'PAGE_LINK_OUT' AND research_run_id = $1`,
    [researchRunId],
  );
  return rows[0]!.id;
}

/** True when any website claim publishes this registrable domain. A measurement only. */
export async function measureEcheOverlap(
  q: Queryable,
  registrableDomain: string,
): Promise<boolean> {
  const { rows } = await q.query<{ hit: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM website_claims WHERE registrable_domain = $1) AS hit`,
    [registrableDomain],
  );
  return rows[0]!.hit;
}

export interface NominationInsert {
  readonly discoveryRunId: string;
  readonly method: DiscoveryMethod;
  readonly providerKey: ProviderKey;
  readonly queryId: string | null;
  readonly sourcePageEvidenceId: string | null;
  readonly prepared: PreparedNomination;
  /** ISO-8601. For PAGE_LINK_OUT, pass null: the source page's observed_at is used. */
  readonly retrievedAt: string | null;
}

export type NominationOutcome =
  | { readonly outcome: 'INSERTED'; readonly id: string; readonly echeOverlap: boolean }
  | { readonly outcome: 'DUPLICATE'; readonly echeOverlap: boolean };

/** Appends one nomination; the same registrable domain in the same run is a DUPLICATE. */
export async function insertNomination(
  q: Queryable,
  n: NominationInsert,
): Promise<NominationOutcome> {
  const echeOverlap = await measureEcheOverlap(q, n.prepared.registrableDomain);
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO source_discovery_nominations
        (discovery_run_id, discovery_method, provider_key, query_id, source_page_evidence_id,
         url, hostname, registrable_domain, title, snippet, retrieved_at,
         eche_overlap, hei_signal, hei_signal_rule_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             CASE WHEN $2 = 'PAGE_LINK_OUT'
                  THEN (SELECT observed_at FROM orgunit_page_evidence WHERE id = $5)
                  ELSE $11::timestamptz END,
             $12, $13, $14)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      n.discoveryRunId,
      n.method,
      n.providerKey,
      n.queryId,
      n.sourcePageEvidenceId,
      n.prepared.url,
      n.prepared.hostname,
      n.prepared.registrableDomain,
      n.prepared.title,
      n.prepared.snippet,
      n.retrievedAt,
      echeOverlap,
      n.prepared.heiSignal.flag,
      n.prepared.heiSignal.ruleVersion,
    ],
  );
  const id = rows[0]?.id;
  return id === undefined
    ? { outcome: 'DUPLICATE', echeOverlap }
    : { outcome: 'INSERTED', id, echeOverlap };
}

/** One nomination as an operator reads it. */
export interface NominationRow {
  readonly id: string;
  readonly discoveryRunId: string;
  readonly discoveryMethod: DiscoveryMethod;
  readonly providerKey: ProviderKey;
  readonly queryId: string | null;
  readonly sourcePageEvidenceId: string | null;
  readonly url: string;
  readonly hostname: string;
  readonly registrableDomain: string;
  readonly title: string | null;
  readonly snippet: string | null;
  readonly retrievedAt: string;
  readonly echeOverlap: boolean;
  readonly heiSignal: boolean;
  readonly heiSignalRuleVersion: string;
}

const NOMINATION_COLUMNS = `id, discovery_run_id, discovery_method, provider_key, query_id,
  source_page_evidence_id, url, hostname, registrable_domain, title, snippet,
  to_char(retrieved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS retrieved_at,
  eche_overlap, hei_signal, hei_signal_rule_version`;

interface RawNominationRow {
  id: string;
  discovery_run_id: string;
  discovery_method: DiscoveryMethod;
  provider_key: ProviderKey;
  query_id: string | null;
  source_page_evidence_id: string | null;
  url: string;
  hostname: string;
  registrable_domain: string;
  title: string | null;
  snippet: string | null;
  retrieved_at: string;
  eche_overlap: boolean;
  hei_signal: boolean;
  hei_signal_rule_version: string;
}

function toRow(r: RawNominationRow): NominationRow {
  return {
    id: r.id,
    discoveryRunId: r.discovery_run_id,
    discoveryMethod: r.discovery_method,
    providerKey: r.provider_key,
    queryId: r.query_id,
    sourcePageEvidenceId: r.source_page_evidence_id,
    url: r.url,
    hostname: r.hostname,
    registrableDomain: r.registrable_domain,
    title: r.title,
    snippet: r.snippet,
    retrievedAt: r.retrieved_at,
    echeOverlap: r.eche_overlap,
    heiSignal: r.hei_signal,
    heiSignalRuleVersion: r.hei_signal_rule_version,
  };
}

export async function loadNomination(q: Queryable, id: string): Promise<NominationRow | null> {
  const { rows } = await q.query<RawNominationRow>(
    `SELECT ${NOMINATION_COLUMNS} FROM source_discovery_nominations WHERE id = $1`,
    [id],
  );
  return rows[0] === undefined ? null : toRow(rows[0]);
}

export const NOMINATION_LIST_DEFAULT_LIMIT = 25;
export const NOMINATION_LIST_MAX_LIMIT = 100;

/** One bounded, keyset-paginated page, optionally within one run. There is no unbounded read. */
export async function listNominations(
  q: Queryable,
  options: { runId: string | null; after: string | null; limit: number },
): Promise<NominationRow[]> {
  const limit = Math.min(Math.max(1, options.limit), NOMINATION_LIST_MAX_LIMIT);
  const { rows } = await q.query<RawNominationRow>(
    `SELECT ${NOMINATION_COLUMNS} FROM source_discovery_nominations
      WHERE ($1::uuid IS NULL OR discovery_run_id = $1::uuid)
        AND ($2::uuid IS NULL OR id > $2::uuid)
      ORDER BY id
      LIMIT $3`,
    [options.runId, options.after, limit],
  );
  return rows.map(toRow);
}

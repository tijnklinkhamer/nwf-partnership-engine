/**
 * THE ONLY DATABASE-TOUCHING MODULE IN A1, AND IT ONLY READS.
 *
 * Every statement in this file is a `SELECT`. There is no INSERT, UPDATE,
 * DELETE, TRUNCATE, COPY, CREATE, ALTER, DROP, GRANT or transaction-control
 * statement anywhere in it, and it connects as the `readonly` role - the
 * least-privilege path this repository offers, which holds SELECT on every
 * evidence table and no write grant anywhere (migrations 0002, 0003, 0005,
 * 0007, 0009). Even if a write were attempted, the database would refuse it.
 *
 * THE AUTHORITY QUERIES MIRROR PRODUCTION EXACTLY
 *
 *   `orchestrate.ts` resolves a root two ways: STRUCTURALLY_VALID website
 *   claims ordered by `(source_kind, id)`, and live promotions reached through
 *   `promotion -> redirect observation -> fetch observation` with no
 *   revocation, ordered by `p.id`. Both are reproduced here verbatim except
 *   for the per-organisation `WHERE`, which is dropped so the enumeration is
 *   database-wide. A frame that judged eligibility by a different rule than
 *   the one acquisition will later apply would be a frame of something else.
 *
 * WHY THE SCHEMA VERSION IS NOT READ FROM `schema_migrations`
 *
 *   `nwf_readonly` holds no grant on that table, and the correct response to a
 *   permission error on a read-only step is to stop asking, not to reach for a
 *   more privileged role. The frame's `databaseSchemaVersion` is therefore the
 *   frozen constant in `frameContract.ts`, cross-checked against the committed
 *   `migrations/` directory by the A1 unit tests - a repository fact that
 *   needs no privilege at all.
 *
 * NO NETWORK. No socket module is imported; `pg` speaks to a loopback
 * container, and nothing here resolves or contacts an institution.
 */
import type pg from 'pg';
import type { RootAuthority } from './frameContract.js';
import type { EligibilityClaimRow, EligibilityPromotionRow } from './claimSnapshot.js';
import type { ExaminedOrganisation } from './frameEnumeration.js';

export interface IngestRunIdentity {
  readonly id: string;
  readonly sourceSystem: string;
  readonly sourceInputKind: string;
  readonly sourceFileSha256: string | null;
  readonly sourceFileBytes: string | null;
  readonly status: string;
  readonly startedAt: string;
}

export interface TableCount {
  readonly table: string;
  readonly count: number;
}

export interface FrameInputs {
  readonly organisations: readonly ExaminedOrganisation[];
  readonly claimRows: readonly EligibilityClaimRow[];
  readonly promotionRows: readonly EligibilityPromotionRow[];
  readonly ingestRuns: readonly IngestRunIdentity[];
  readonly claimRuleVersions: readonly string[];
  readonly claimSourceKinds: readonly string[];
  readonly tableCounts: readonly TableCount[];
}

/**
 * Every table A1 must prove it did not disturb. The list is explicit rather
 * than derived from `pg_tables` so that a table added later shows up as a
 * missing name in review, not as a silently unverified one.
 */
export const VERIFIED_TABLES = [
  'organisations',
  'organisation_sources',
  'ingest_runs',
  'website_claims',
  'website_source_snapshots',
  'ewp_snapshots',
  'ewp_heis',
  'ewp_hosts',
  'ewp_hei_other_ids',
  'ewp_api_declarations',
  'ewp_host_covered_heis',
  'orgunit_research_runs',
  'orgunit_research_run_completions',
  'orgunit_fetch_observations',
  'orgunit_redirect_observations',
  'orgunit_root_promotions',
  'orgunit_root_promotion_revocations',
  'orgunit_page_evidence',
  'orgunit_page_candidates',
  'orgunit_classifier_calls',
  'orgunit_classifier_call_completions',
  'orgunit_page_classifications',
  'orgunit_classification_subjects',
] as const;

/** Row counts for every verified table, in one round trip. */
export async function readTableCounts(pool: pg.Pool): Promise<readonly TableCount[]> {
  const sql = VERIFIED_TABLES.map(
    (table) => `SELECT '${table}' AS t, count(*)::text AS n FROM ${table}`,
  ).join(' UNION ALL ');
  const { rows } = await pool.query<{ t: string; n: string }>(`${sql} ORDER BY t`);
  return rows.map((row) => ({ table: row.t, count: Number(row.n) }));
}

/** Reads everything A1 needs, in one pass, without writing anything. */
export async function readFrameInputs(pool: pg.Pool): Promise<FrameInputs> {
  const organisationRows = await pool.query<{ id: string; eche_row_key: string }>(
    `SELECT id, eche_row_key FROM organisations ORDER BY eche_row_key`,
  );

  // SD1 clause A. Mirrors orchestrate.ts findOrganisationClaimRoots, minus the
  // per-organisation WHERE.
  const claimRows = await pool.query<EligibilityClaimRow>(
    `SELECT id, eche_row_key, organisation_id, source_kind, structural_status,
            rule_version, source_artifact_sha256
       FROM website_claims
      ORDER BY eche_row_key, source_kind, id`,
  );

  // SD1 clause B. Mirrors orchestrate.ts findOrganisationPromotionRoots: a
  // promotion carries no eche_row_key of its own, so it is reached through the
  // redirect observation it references and the fetch observation beneath it.
  const promotionRows = await pool.query<EligibilityPromotionRow>(
    `SELECT p.id AS promotion_id,
            f.eche_row_key AS eche_row_key,
            p.redirect_observation_id AS redirect_observation_id,
            EXISTS (
              SELECT 1 FROM orgunit_root_promotion_revocations v WHERE v.promotion_id = p.id
            ) AS revoked
       FROM orgunit_root_promotions p
       JOIN orgunit_redirect_observations r ON r.id = p.redirect_observation_id
       JOIN orgunit_fetch_observations f    ON f.id = r.fetch_observation_id
      ORDER BY f.eche_row_key, p.id`,
  );

  const ingestRuns = await pool.query<{
    id: string;
    source_system: string;
    source_input_kind: string;
    source_file_sha256: string | null;
    source_file_bytes: string | null;
    status: string;
    started_at: Date;
  }>(
    `SELECT id, source_system, source_input_kind, source_file_sha256,
            source_file_bytes::text AS source_file_bytes, status, started_at
       FROM ingest_runs ORDER BY started_at, id`,
  );

  const claimRuleVersions = await pool.query<{ rule_version: string }>(
    `SELECT DISTINCT rule_version FROM website_claims ORDER BY rule_version`,
  );
  const claimSourceKinds = await pool.query<{ source_kind: string }>(
    `SELECT DISTINCT source_kind FROM website_claims ORDER BY source_kind`,
  );
  const authoritiesByOrganisation = new Map<string, RootAuthority[]>();
  const push = (echeRowKey: string, authority: RootAuthority): void => {
    const existing = authoritiesByOrganisation.get(echeRowKey);
    if (existing) existing.push(authority);
    else authoritiesByOrganisation.set(echeRowKey, [authority]);
  };
  for (const claim of claimRows.rows) {
    if (claim.structural_status !== 'STRUCTURALLY_VALID') continue;
    push(claim.eche_row_key, {
      type: 'WEBSITE_CLAIM',
      id: claim.id,
      sourceLabel: `claim:${claim.source_kind}`,
    });
  }
  for (const promotion of promotionRows.rows) {
    if (promotion.revoked) continue;
    push(promotion.eche_row_key, {
      type: 'ROOT_PROMOTION',
      id: promotion.promotion_id,
      sourceLabel: 'promotion',
    });
  }

  const organisations: ExaminedOrganisation[] = organisationRows.rows.map((row) => ({
    echeRowKey: row.eche_row_key,
    organisationId: row.id,
    rootAuthorities: authoritiesByOrganisation.get(row.eche_row_key) ?? [],
  }));

  return {
    organisations,
    claimRows: claimRows.rows,
    promotionRows: promotionRows.rows,
    ingestRuns: ingestRuns.rows.map((row) => ({
      id: row.id,
      sourceSystem: row.source_system,
      sourceInputKind: row.source_input_kind,
      sourceFileSha256: row.source_file_sha256,
      sourceFileBytes: row.source_file_bytes,
      status: row.status,
      startedAt: row.started_at.toISOString(),
    })),
    claimRuleVersions: claimRuleVersions.rows.map((row) => row.rule_version),
    claimSourceKinds: claimSourceKinds.rows.map((row) => row.source_kind),
    tableCounts: await readTableCounts(pool),
  };
}

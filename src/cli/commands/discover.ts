/**
 * `nwf-pe orgunits discover` - THE FIRST NETWORK-CAPABLE RESEARCH CLI ENTRY
 * POINT (Phase 2B-1E).
 *
 * This file is an ENTRY POINT, not a network owner. It never imports
 * anything under `src/orgunits/web/` (the firewall's own check on CLI files
 * proves this by substring), it never constructs a robots authority, and it
 * never bypasses a budget: every request this command can cause runs through
 * `src/orgunits/orchestrator/orchestrate.ts`, which is itself layered on the
 * one approved gateway via `robots.ts`.
 *
 * EXECUTION GUARD: without `--execute`, this command performs a DRY RUN -
 * it resolves the organisation's root authority (a plain SQL read of
 * `website_claims`/`orgunit_root_promotions`, never `resolveRoot` from
 * `web/authority.ts`) and reports the plan. ZERO DNS, ZERO HTTP requests, no
 * fake fetch evidence, no invented candidate result. `--execute` is required
 * for a real research run.
 *
 * SCOPE: exactly ONE organisation per invocation (`--organisation-id`).
 * There is no `--all`, `--crawl-everything` or `--scan-database` - a
 * database-wide research sweep is never one command's job.
 *
 * DATABASE ROLE: the `research` role (`DATABASE_URL_RESEARCH`), the same
 * append-only, root-authority-read-only role migration 0007 created for
 * exactly this purpose. Never `admin`/`ingest`.
 */
import type pg from 'pg';
import { withPool } from '../../db/client.js';
import * as log from '../../logging/log.js';

export interface DiscoverOptions {
  organisationId?: string;
  execute: boolean;
  json: boolean;
}

interface ResolvedRootPlanRow {
  kind: 'WEBSITE_CLAIM' | 'ROOT_PROMOTION';
  id: string;
  label: string;
  url: string | null;
}

async function planRoots(pool: pg.Pool, echeRowKey: string): Promise<ResolvedRootPlanRow[]> {
  const claims = await pool.query<{
    id: string;
    source_kind: string;
    normalised_url: string | null;
  }>(
    `SELECT id, source_kind, normalised_url FROM website_claims
      WHERE eche_row_key = $1 AND structural_status = 'STRUCTURALLY_VALID'
      ORDER BY source_kind, id`,
    [echeRowKey],
  );
  const promotions = await pool.query<{ id: string; to_url_resolved: string | null }>(
    `SELECT p.id, r.to_url_resolved
       FROM orgunit_root_promotions p
       JOIN orgunit_redirect_observations r ON r.id = p.redirect_observation_id
       JOIN orgunit_fetch_observations f    ON f.id = r.fetch_observation_id
      WHERE f.eche_row_key = $1
        AND NOT EXISTS (SELECT 1 FROM orgunit_root_promotion_revocations v WHERE v.promotion_id = p.id)
      ORDER BY p.id`,
    [echeRowKey],
  );
  return [
    ...claims.rows.map((row) => ({
      kind: 'WEBSITE_CLAIM' as const,
      id: row.id,
      label: `claim:${row.source_kind}`,
      url: row.normalised_url,
    })),
    ...promotions.rows.map((row) => ({
      kind: 'ROOT_PROMOTION' as const,
      id: row.id,
      label: 'promotion',
      url: row.to_url_resolved,
    })),
  ];
}

export async function runOrgunitsDiscover(options: DiscoverOptions): Promise<number> {
  if (!options.organisationId) {
    log.error('orgunits discover requires --organisation-id <uuid>.');
    return 1;
  }

  return withPool('research', async (pool) => {
    const orgRow = await pool.query<{ eche_row_key: string }>(
      `SELECT eche_row_key FROM organisations WHERE id = $1`,
      [options.organisationId],
    );
    const echeRowKey = orgRow.rows[0]?.eche_row_key;
    if (echeRowKey === undefined) {
      log.error(`No organisation with id ${options.organisationId}.`);
      return 1;
    }

    if (!options.execute) {
      const roots = await planRoots(pool, echeRowKey);
      const plan = {
        mode: 'DRY_RUN',
        organisationId: options.organisationId,
        echeRowKey,
        roots,
        note:
          'No DNS lookup and no HTTP request were made. Pass --execute to run bounded ' +
          'discovery for real, through the research role.',
      };
      if (options.json) {
        process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      } else {
        log.info(`Dry run for organisation ${options.organisationId} (${echeRowKey}):`);
        if (roots.length === 0) {
          log.info('  no STRUCTURALLY_VALID website claim and no live root promotion was found.');
        }
        for (const root of roots) {
          log.info(`  [${root.kind}] ${root.label} ${root.id} -> ${root.url ?? '(unresolvable)'}`);
        }
        log.info('No DNS lookup and no HTTP request were made. Pass --execute to run for real.');
      }
      return 0;
    }

    const { runOrganisationDiscovery } = await import('../../orgunits/orchestrator/orchestrate.js');
    const result = await runOrganisationDiscovery(pool, {
      echeRowKey,
      networkVantage: 'cli',
    });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      log.info(
        `Run ${result.runId} for organisation ${options.organisationId} (${echeRowKey}): ${result.runTerminalState}`,
      );
      for (const root of result.roots) {
        log.info(
          `  [${root.ref.kind}] ${root.ref.sourceLabel} ${root.ref.id}: ${root.summary.terminalReason} ` +
            `(pages=${root.summary.pageAttempts}/35, requests=${root.summary.totalRequests}/60, ` +
            `candidates=${root.summary.candidateEvaluations}, trackA=${root.summary.trackASelected}, ` +
            `trackB=${root.summary.trackBSelected})`,
        );
      }
    }

    // A valid research run that found no promising candidate, or whose robots
    // policy blocked it, is NOT a process failure - only an unresolvable
    // organisation or a FAILED run terminal state is (spec "CLI exit
    // semantics").
    return result.runTerminalState === 'FAILED' ? 1 : 0;
  });
}

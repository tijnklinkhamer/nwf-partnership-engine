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
 * it resolves the organisation's root authority and its evaluation-cohort
 * eligibility through the orchestrator's own guard
 * (`planOrganisationResearch` - plain reads of `organisations`,
 * `website_claims`, the promotion chain and the pinned cohort files) and
 * reports the plan. ZERO DNS, ZERO HTTP requests, no run row, no fake fetch
 * evidence, no invented candidate result. `--execute` is required for a real
 * research run.
 *
 * EVALUATION-COHORT GUARD (Track B, B3.0): a protected, unverifiable or
 * identity-conflicting organisation is REFUSED in both modes, with a generic
 * code/kind/reason and no root list - the dry run is never a cohort
 * enumeration endpoint. `--execute` does not trust a previous dry run:
 * `runOrganisationDiscovery` re-plans and re-guards before it starts a run.
 *
 * SCOPE: exactly ONE organisation per invocation (`--organisation-id`).
 * There is no `--all`, `--crawl-everything` or `--scan-database` - a
 * database-wide research sweep is never one command's job.
 *
 * DATABASE ROLE: the `research` role (`DATABASE_URL_RESEARCH`), the same
 * append-only, root-authority-read-only role migration 0007 created for
 * exactly this purpose. Never `admin`/`ingest`.
 */
import { withPool } from '../../db/client.js';
import * as log from '../../logging/log.js';
import type { OrganisationRunResult } from '../../orgunits/orchestrator/orchestrate.js';
import type {
  ResearchCohortGuardDeps,
  ResearchCohortRefusal,
  ResearchExecutionPlan,
} from '../../orgunits/orchestrator/researchCohortGuard.js';

export interface DiscoverOptions {
  organisationId?: string;
  execute: boolean;
  json: boolean;
}

/**
 * Test seam: the cohort-registry loader only. Production (`src/cli/index.ts`)
 * passes nothing, so the committed pinned artifacts decide. There is no
 * transport here: `--execute` always uses the production gateway.
 */
export type DiscoverDependencies = ResearchCohortGuardDeps;

const NO_NETWORK_NOTE =
  'No DNS lookup and no HTTP request were made. Pass --execute to run bounded ' +
  'discovery for real, through the research role.';

/** Generic by construction: code, kind and reason only - never a cohort, key or root. */
function reportRefusal(
  options: DiscoverOptions,
  mode: 'DRY_RUN' | 'EXECUTE',
  refusal: ResearchCohortRefusal,
): number {
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          mode,
          organisationId: options.organisationId,
          eligibility: 'REFUSED',
          refusal: refusal.toJSON(),
          note: 'No research run was created. No DNS lookup and no HTTP request were made.',
        },
        null,
        2,
      )}\n`,
    );
  } else {
    log.error(
      `orgunits discover refused for organisation ${options.organisationId}: ` +
        `${refusal.code} ${refusal.kind} (${refusal.reason}). No research run was created, ` +
        'and no DNS lookup or HTTP request was made.',
    );
  }
  return 1;
}

export async function runOrgunitsDiscover(
  options: DiscoverOptions,
  deps: DiscoverDependencies = {},
): Promise<number> {
  const organisationId = options.organisationId;
  if (!organisationId) {
    log.error('orgunits discover requires --organisation-id <uuid>.');
    return 1;
  }

  return withPool('research', async (pool) => {
    const orgRow = await pool.query<{ eche_row_key: string }>(
      `SELECT eche_row_key FROM organisations WHERE id = $1`,
      [organisationId],
    );
    const echeRowKey = orgRow.rows[0]?.eche_row_key;
    if (echeRowKey === undefined) {
      log.error(`No organisation with id ${organisationId}.`);
      return 1;
    }

    const { ResearchCohortRefusal: Refusal, planOrganisationResearch } =
      await import('../../orgunits/orchestrator/researchCohortGuard.js');

    if (!options.execute) {
      let plan: ResearchExecutionPlan;
      try {
        plan = await planOrganisationResearch(pool, { organisationId, echeRowKey }, deps);
      } catch (error) {
        if (error instanceof Refusal) return reportRefusal(options, 'DRY_RUN', error);
        throw error;
      }
      const roots = plan.roots.map(({ ref, url }) => ({
        kind: ref.kind,
        id: ref.id,
        label: ref.sourceLabel,
        url,
      }));
      if (options.json) {
        process.stdout.write(
          `${JSON.stringify(
            {
              mode: 'DRY_RUN',
              organisationId,
              echeRowKey,
              eligibility: 'ELIGIBLE',
              roots,
              note: NO_NETWORK_NOTE,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        log.info(`Dry run for organisation ${organisationId} (${echeRowKey}):`);
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
    let result: OrganisationRunResult;
    try {
      result = await runOrganisationDiscovery(
        pool,
        { organisationId, echeRowKey, networkVantage: 'cli' },
        deps,
      );
    } catch (error) {
      if (error instanceof Refusal) return reportRefusal(options, 'EXECUTE', error);
      throw error;
    }

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      log.info(
        `Run ${result.runId} for organisation ${organisationId} (${echeRowKey}): ${result.runTerminalState}`,
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

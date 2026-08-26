/**
 * ONE RESEARCH RUN, ONE ORGANISATION, EVERY INDEPENDENT ROOT.
 *
 * Resolves the STRUCTURALLY_VALID website claims for one `eche_row_key` (an
 * ECHE claim, an FR-register claim, or both - Phase 1D's own finding is that
 * two official sources can disagree, and this module does not resolve that:
 * it runs BOTH, independently). Live, un-revoked root promotions for the
 * same organisation are ALSO run - a promotion is root authority exactly
 * like a claim, and both are read here, never merged into one canonical
 * root.
 *
 * ROOT INDEPENDENCE: each root gets its own `runRootAcquisition` call, its
 * own frontier, its own circuit breaker, its own robots cache. A failure on
 * one root (robots-blocked, budget-exhausted, unreachable) has no way to
 * reach another root's state - they do not share a mutable object.
 *
 * Starts and completes exactly one `orgunit_research_runs` row (append-only -
 * `run.ts`). If ANY unexpected (non-`WebGatewayRefusal`) error escapes a
 * root's acquisition, the run's completion is still appended, honestly, as
 * FAILED - never silently marked COMPLETED.
 */
import type pg from 'pg';
import type { RootAuthorityRef } from '../web/authority.js';
import { completeRun, startRun } from './run.js';
import { runRootAcquisition, type RootRunnerDeps, type RootSummary } from './rootRunner.js';

export interface OrganisationRootRef {
  readonly kind: 'WEBSITE_CLAIM' | 'ROOT_PROMOTION';
  readonly id: string;
  readonly sourceLabel: string;
}

export interface OrganisationRunResult {
  readonly runId: string;
  readonly echeRowKey: string;
  readonly organisationId: string | null;
  readonly roots: readonly { ref: OrganisationRootRef; summary: RootSummary }[];
  readonly runTerminalState: 'COMPLETED' | 'FAILED';
}

/**
 * Every STRUCTURALLY_VALID website claim for `echeRowKey`, each an
 * independent root - never deduplicated or merged even when two claims
 * normalise to similar URLs (spec "root processing").
 */
async function findOrganisationClaimRoots(
  pool: pg.Pool,
  echeRowKey: string,
): Promise<OrganisationRootRef[]> {
  const { rows } = await pool.query<{ id: string; source_kind: string }>(
    `SELECT id, source_kind FROM website_claims
      WHERE eche_row_key = $1 AND structural_status = 'STRUCTURALLY_VALID'
      ORDER BY source_kind, id`,
    [echeRowKey],
  );
  return rows.map((row) => ({
    kind: 'WEBSITE_CLAIM' as const,
    id: row.id,
    sourceLabel: `claim:${row.source_kind}`,
  }));
}

/**
 * Every LIVE (approved, not revoked) root promotion for `echeRowKey`,
 * reached through the redirect observation -> fetch observation chain, since
 * a promotion carries no `eche_row_key` of its own (ADR 0004 s7: it stores
 * no URL and no organisation link of its own; the referenced observation
 * supplies both).
 */
async function findOrganisationPromotionRoots(
  pool: pg.Pool,
  echeRowKey: string,
): Promise<OrganisationRootRef[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT DISTINCT p.id
       FROM orgunit_root_promotions p
       JOIN orgunit_redirect_observations r ON r.id = p.redirect_observation_id
       JOIN orgunit_fetch_observations f    ON f.id = r.fetch_observation_id
      WHERE f.eche_row_key = $1
        AND NOT EXISTS (
          SELECT 1 FROM orgunit_root_promotion_revocations v WHERE v.promotion_id = p.id
        )
      ORDER BY p.id`,
    [echeRowKey],
  );
  return rows.map((row) => ({
    kind: 'ROOT_PROMOTION' as const,
    id: row.id,
    sourceLabel: 'promotion',
  }));
}

function toRootAuthorityRef(ref: OrganisationRootRef): RootAuthorityRef {
  return ref.kind === 'WEBSITE_CLAIM'
    ? { kind: 'WEBSITE_CLAIM', websiteClaimId: ref.id }
    : { kind: 'ROOT_PROMOTION', promotionId: ref.id };
}

export interface RunOrganisationDiscoveryInput {
  echeRowKey: string;
  networkVantage: string;
}

/**
 * Starts one run, resolves every independent root for the organisation, runs
 * bounded discovery on each in turn, and appends the run's terminal
 * completion. This is the function the CLI calls; nothing else in this
 * repository starts a research run.
 */
export async function runOrganisationDiscovery(
  pool: pg.Pool,
  input: RunOrganisationDiscoveryInput,
  deps: RootRunnerDeps = {},
): Promise<OrganisationRunResult> {
  const runId = await startRun(pool, { networkVantage: input.networkVantage });

  const claimRoots = await findOrganisationClaimRoots(pool, input.echeRowKey);
  const promotionRoots = await findOrganisationPromotionRoots(pool, input.echeRowKey);
  const allRoots = [...claimRoots, ...promotionRoots];

  const organisationIdRow = await pool.query<{ organisation_id: string | null }>(
    `SELECT organisation_id FROM website_claims WHERE eche_row_key = $1 AND organisation_id IS NOT NULL LIMIT 1`,
    [input.echeRowKey],
  );
  const organisationId = organisationIdRow.rows[0]?.organisation_id ?? null;

  const roots: { ref: OrganisationRootRef; summary: RootSummary }[] = [];
  let runTerminalState: 'COMPLETED' | 'FAILED' = 'COMPLETED';
  let failureSummary: string | null = null;

  try {
    for (const ref of allRoots) {
      const summary = await runRootAcquisition(pool, runId, toRootAuthorityRef(ref), deps);
      roots.push({ ref, summary });
    }
  } catch (error) {
    runTerminalState = 'FAILED';
    failureSummary = error instanceof Error ? error.message : String(error);
  }

  await completeRun(pool, {
    runId,
    terminalState: runTerminalState,
    errorKind: runTerminalState === 'FAILED' ? 'ORCHESTRATION_ERROR' : null,
    errorSummary: failureSummary,
  });

  return { runId, echeRowKey: input.echeRowKey, organisationId, roots, runTerminalState };
}

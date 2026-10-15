/**
 * ONE RESEARCH RUN, ONE ORGANISATION, EVERY INDEPENDENT ROOT.
 *
 * Resolves the STRUCTURALLY_VALID website claims for one `eche_row_key` (an
 * ECHE claim, an FR-register claim, or both - Phase 1D's own finding is that
 * two official sources can disagree, and this module does not resolve that:
 * it runs BOTH, independently). Live, un-revoked root promotions for the
 * same organisation are ALSO run - a promotion is root authority exactly
 * like a claim, and both are read (by the guard's plan, below), never merged
 * into one canonical root.
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
 *
 * EVALUATION-COHORT GUARD FIRST (Track B, B3.0). Nothing above happens until
 * `planOrganisationResearch` (`researchCohortGuard.ts`) has verified the
 * requested organisation, the identity of every root it will use, and its
 * eligibility under the pinned evaluation-cohort authority. A refusal throws
 * `ResearchCohortRefusal` before `startRun`: no run row, no DNS, no HTTP, no
 * evidence. The roots executed are EXACTLY the plan's frozen list - this
 * module issues no root query of its own - so nothing appended after the
 * check can join the run, and `runRootAcquisition` re-checks each root's own
 * identity before its first request.
 */
import type pg from 'pg';
import { completeRun, startRun } from './run.js';
import { runRootAcquisition, type RootRunnerDeps, type RootSummary } from './rootRunner.js';
import {
  planOrganisationResearch,
  toRootAuthorityRef,
  type OrganisationRootRef,
} from './researchCohortGuard.js';

export type { OrganisationRootRef } from './researchCohortGuard.js';

export interface OrganisationRunResult {
  readonly runId: string;
  readonly echeRowKey: string;
  readonly organisationId: string | null;
  readonly roots: readonly { ref: OrganisationRootRef; summary: RootSummary }[];
  readonly runTerminalState: 'COMPLETED' | 'FAILED';
}

export interface RunOrganisationDiscoveryInput {
  /** The organisation requested. Its own `eche_row_key` must equal `echeRowKey`. */
  organisationId: string;
  echeRowKey: string;
  networkVantage: string;
}

/**
 * Guards, then starts one run, runs bounded discovery on each planned root in
 * turn, and appends the run's terminal completion. This is the function the
 * CLI calls; nothing else in this repository starts a research run. Throws
 * `ResearchCohortRefusal` - having written nothing - when the guard refuses.
 */
export async function runOrganisationDiscovery(
  pool: pg.Pool,
  input: RunOrganisationDiscoveryInput,
  deps: RootRunnerDeps = {},
): Promise<OrganisationRunResult> {
  const plan = await planOrganisationResearch(
    pool,
    { organisationId: input.organisationId, echeRowKey: input.echeRowKey },
    deps,
  );

  const runId = await startRun(pool, { networkVantage: input.networkVantage });

  const roots: { ref: OrganisationRootRef; summary: RootSummary }[] = [];
  let runTerminalState: 'COMPLETED' | 'FAILED' = 'COMPLETED';
  let failureSummary: string | null = null;

  try {
    for (const { ref } of plan.roots) {
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

  return {
    runId,
    echeRowKey: plan.echeRowKey,
    organisationId: plan.organisationId,
    roots,
    runTerminalState,
  };
}

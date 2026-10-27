/**
 * WW E-W - THE DISCOVERED STAGE (ADR 0030 s3.1): a campaign root becomes
 * nominations.
 *
 *   SEARCH_GRANT root - ONE granted live source-discovery run
 *     (`runGrantedSourceDiscovery`, ADR 0027/0028) under the grant the SIGNED
 *     campaign lists. Before anything runs: the grant must exist and its
 *     geography must be inside the campaign's signed geographies (or the
 *     campaign is WORLDWIDE) - an out-of-scope grant is REFUSED OUT_OF_SCOPE
 *     with no search. The run is started with the actor key
 *     `acq-<work item id>`, so a retried attempt finds the run its earlier
 *     attempt started and reuses its nominations instead of spending another
 *     grant slot (no duplicate search). One search run is consumed.
 *   LINK_OUT root - the PAGE_LINK_OUT nominations a campaign-admitted
 *     research run captured (never fetched). Nothing is consumed.
 *
 * Children are the run's ADMISSIBLE nominations (WW H-ACQ P1-9: a completed
 * run; RESULTS calls; a smoke call only once verified), at NOMINATED, keyed
 * by registrable domain. A nomination is never fetched, ranked or valued here.
 *
 * Opens no socket itself; the granted run reaches the provider only through
 * the injected live-search dependencies (`productionLiveSearchDeps` in
 * production, a fake SDK in tests).
 */
import type pg from 'pg';

import {
  WORLDWIDE,
  type StageHandler,
  type StageHandlerContext,
  type StageOutcome,
  type WorkItemView,
} from '../acquisition/index.js';
import {
  GrantedRunInternalError,
  GrantedRunRefusal,
  runGrantedSourceDiscovery,
} from './sourceDiscoveryPort.js';
import { searchRunActorKeyOf, type WiringDeps } from './context.js';
import { alreadyReported } from './records.js';

interface NominationRef {
  id: string;
  registrable_domain: string;
}

/**
 * WW H-ACQ (ADR 0030 s13, P1-9): what a SEARCH_PROVIDER run may hand the
 * campaign. A run is read only once it has its terminal completion row (an
 * incomplete run - a crashed process - is never advanced: RETRY while it is
 * missing). Its nominations count only when they came from a provider call
 * whose terminal row is RESULTS and which is either not the ADR 0027 D8
 * smoke call, or a smoke call the OWNER verified - for that very call or for
 * the same SDK version and model, which migration 0025 says a verification
 * covers. Nominations of an UNVERIFIED smoke call are never dropped: they
 * hold the item (RETRY, DEPENDENCY_NOT_READY) until the OWNER records the
 * verification.
 *
 * This is the wiring's own minimal check. Once H-SD's sourceDiscovery helper
 * (`admissibleNominationsOfRun`) lands, this function should delegate to it.
 */
export type RunNominations =
  | { readonly kind: 'INCOMPLETE' }
  | { readonly kind: 'SMOKE_UNVERIFIED' }
  | { readonly kind: 'ADMISSIBLE'; readonly nominations: readonly NominationRef[] };

export async function admissibleNominationsOfSearchRun(
  readonly: pg.Pool,
  runId: string,
): Promise<RunNominations> {
  const { rows: done } = await readonly.query<{ complete: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM source_discovery_run_completions WHERE run_id = $1) AS complete`,
    [runId],
  );
  if (done[0]?.complete !== true) return { kind: 'INCOMPLETE' };
  const { rows } = await readonly.query<NominationRef & { admissible: boolean; held: boolean }>(
    `SELECT n.id, n.registrable_domain,
            (q.id IS NOT NULL AND q.outcome = 'RESULTS'
             AND (NOT q.smoke OR v.verified)) AS admissible,
            (q.id IS NOT NULL AND q.outcome = 'RESULTS' AND q.smoke AND NOT v.verified) AS held
       FROM source_discovery_nominations n
       LEFT JOIN source_discovery_query_calls q
              ON q.run_id = n.discovery_run_id AND q.query_id = n.query_id
       LEFT JOIN LATERAL (
            SELECT EXISTS (SELECT 1 FROM source_discovery_smoke_verifications sv
                            WHERE (sv.run_id = q.run_id AND sv.call_seq = q.call_seq)
                               OR (sv.sdk_version = q.sdk_version AND sv.model_id = q.model_id))
                   AS verified) v ON true
      WHERE n.discovery_run_id = $1 AND n.discovery_method = 'SEARCH_PROVIDER'
      ORDER BY n.created_at, n.id`,
    [runId],
  );
  if (rows.some((r) => r.held)) return { kind: 'SMOKE_UNVERIFIED' };
  return {
    kind: 'ADMISSIBLE',
    nominations: rows
      .filter((r) => r.admissible)
      .map((r) => ({ id: r.id, registrable_domain: r.registrable_domain })),
  };
}

function advanceTo(nominations: readonly NominationRef[]): StageOutcome {
  return {
    kind: 'ADVANCED',
    next: 'NOMINATED',
    children: nominations.map((n) => ({
      subjectKind: 'NOMINATION' as const,
      subjectId: n.id,
      registrableDomain: n.registrable_domain,
    })),
  };
}

/** True when `geography` is inside the signed scope. */
export function geographyInScope(scope: readonly string[], geography: string | null): boolean {
  if (scope.length === 1 && scope[0] === WORLDWIDE) return true;
  return geography !== null && scope.includes(geography);
}

async function discoverFromGrant(
  deps: WiringDeps,
  item: WorkItemView,
  ctx: StageHandlerContext,
): Promise<StageOutcome> {
  const { readonly } = deps.pools;
  const { rows: grants } = await readonly.query<{ geography: string }>(
    'SELECT geography FROM source_discovery_grants WHERE id = $1',
    [item.subjectId],
  );
  const grant = grants[0];
  if (grant === undefined) return { kind: 'REFUSED', reason: 'GRANT_UNAVAILABLE' };
  if (!geographyInScope(ctx.campaign.scope.geographies, grant.geography)) {
    return { kind: 'REFUSED', reason: 'OUT_OF_SCOPE' };
  }

  const actorKey = searchRunActorKeyOf(item.id);
  const findRun = async (): Promise<string | null> => {
    const { rows } = await readonly.query<{ id: string }>(
      `SELECT id FROM source_discovery_runs
        WHERE actor_key = $1 AND run_kind = 'SEARCH_PROVIDER' ORDER BY started_at, id LIMIT 1`,
      [actorKey],
    );
    return rows[0]?.id ?? null;
  };

  let runId = await findRun();
  if (runId === null) {
    try {
      const result = await runGrantedSourceDiscovery(
        deps.pools.sourceDiscovery,
        { grantId: item.subjectId, actorKey },
        deps.liveSearch,
      );
      runId = result.runId;
    } catch (error) {
      if (error instanceof GrantedRunInternalError) {
        // The run exists (its completion was recorded first): the next
        // attempt finds it by actor key and reuses its nominations.
        ctx.consume('searchRuns', 1);
        return { kind: 'RETRY', reason: 'TRANSIENT_PROVIDER_FAILURE', retryable: true };
      }
      if (error instanceof GrantedRunRefusal) {
        if (error.code === 'LIVE_SEARCH_PREFLIGHT_REFUSED') {
          return { kind: 'RETRY', reason: 'DEPENDENCY_NOT_READY', retryable: true };
        }
        if (error.code === 'GRANT_RUN_SLOT_TAKEN') {
          return { kind: 'RETRY', reason: 'RATE_LIMITED', retryable: true };
        }
        return { kind: 'REFUSED', reason: 'GRANT_UNAVAILABLE' };
      }
      throw error;
    }
  }
  // One run per item, whichever attempt started it; report it once.
  const reported = await alreadyReported(deps.pools.worker, item.id);
  if (reported.searchRuns === 0) ctx.consume('searchRuns', 1);
  // P1-9: only a COMPLETED run's admissible nominations advance.
  const found = await admissibleNominationsOfSearchRun(readonly, runId);
  if (found.kind !== 'ADMISSIBLE') {
    return { kind: 'RETRY', reason: 'DEPENDENCY_NOT_READY', retryable: true };
  }
  return advanceTo(found.nominations);
}

async function discoverFromLinkOuts(deps: WiringDeps, item: WorkItemView): Promise<StageOutcome> {
  const { rows } = await deps.pools.readonly.query<NominationRef>(
    `SELECT n.id, n.registrable_domain
       FROM source_discovery_nominations n
       JOIN source_discovery_runs r ON r.id = n.discovery_run_id
      WHERE r.run_kind = 'PAGE_LINK_OUT' AND r.research_run_id = $1
      ORDER BY n.created_at, n.id`,
    [item.subjectId],
  );
  return advanceTo(rows);
}

export function discoveredHandler(deps: WiringDeps): StageHandler {
  return {
    stage: 'DISCOVERED',
    async handle(item, ctx) {
      if (item.sourceKind === 'SEARCH_GRANT') return discoverFromGrant(deps, item, ctx);
      if (item.sourceKind === 'LINK_OUT') return discoverFromLinkOuts(deps, item);
      // SEED roots have no wired discovery in this build: an OWNER act is needed.
      return { kind: 'AWAITING_HUMAN', queue: 'OWNER_RESEARCH_ADMISSION' };
    },
  };
}

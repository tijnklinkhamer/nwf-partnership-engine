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
 * granted run; RESULTS calls of a runtime the OWNER smoke-verified), at
 * NOMINATED, keyed by registrable domain. Unverified: the item waits for the
 * OWNER (AWAITING_HUMAN, OWNER_SMOKE_VERIFICATION); never an empty advance. A nomination is never fetched, ranked or valued here.
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
 * WW H-ACQ (ADR 0030 s13, P1-9): what a granted SEARCH_PROVIDER run may hand
 * the campaign - the wiring's own minimal check, in EXACTLY the shape of
 * H-SD's `admissibleNominationsOfRun(queryable, runId)` (sourceDiscovery,
 * integrated after this package) so the swap is one call:
 *
 *   NOT_A_GRANTED_RUN - no grant use records the run (refused);
 *   RUN_NOT_COMPLETED - no terminal completion row yet (a crashed process):
 *                       nothing partial is ever advanced;
 *   COMPLETED         - the nominations of provider calls whose terminal row
 *                       is RESULTS and whose SDK version + model carry an
 *                       OWNER smoke verification (migration 0025: a
 *                       verification covers every call of that runtime).
 *
 * H-SD's helper additionally requires a call's recorded search count to be
 * exactly 1 (its migration 0027); this branch has no such column.
 */
export interface AdmissibleNominations {
  readonly state: 'NOT_A_GRANTED_RUN' | 'RUN_NOT_COMPLETED' | 'COMPLETED';
  readonly nominations: readonly NominationRef[];
}

export async function admissibleNominationsOfGrantedRun(
  readonly: pg.Pool,
  runId: string,
): Promise<AdmissibleNominations> {
  const { rows: standing } = await readonly.query<{ granted: boolean; complete: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM source_discovery_grant_uses WHERE run_id = $1) AS granted,
            EXISTS (SELECT 1 FROM source_discovery_run_completions WHERE run_id = $1) AS complete`,
    [runId],
  );
  if (standing[0]?.granted !== true) return { state: 'NOT_A_GRANTED_RUN', nominations: [] };
  if (standing[0].complete !== true) return { state: 'RUN_NOT_COMPLETED', nominations: [] };
  const { rows } = await readonly.query<NominationRef>(
    `SELECT n.id, n.registrable_domain
       FROM source_discovery_nominations n
       JOIN source_discovery_query_calls q
         ON q.run_id = n.discovery_run_id AND q.query_id = n.query_id
      WHERE n.discovery_run_id = $1 AND n.discovery_method = 'SEARCH_PROVIDER'
        AND q.outcome = 'RESULTS'
        AND EXISTS (SELECT 1 FROM source_discovery_smoke_verifications sv
                     WHERE sv.sdk_version = q.sdk_version AND sv.model_id = q.model_id)
      ORDER BY n.created_at, n.id`,
    [runId],
  );
  return { state: 'COMPLETED', nominations: rows };
}

/** How many nominations the run recorded at all (admissible or not). */
async function recordedNominations(readonly: pg.Pool, runId: string): Promise<number> {
  const { rows } = await readonly.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM source_discovery_nominations WHERE discovery_run_id = $1',
    [runId],
  );
  return rows[0]!.n;
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
  // P1-9: only a COMPLETED granted run's admissible nominations advance -
  // also for a run an earlier attempt started (found by actor key).
  const found = await admissibleNominationsOfGrantedRun(readonly, runId);
  if (found.state === 'NOT_A_GRANTED_RUN') return { kind: 'REFUSED', reason: 'GRANT_UNAVAILABLE' };
  if (found.state === 'RUN_NOT_COMPLETED') {
    return { kind: 'RETRY', reason: 'DEPENDENCY_NOT_READY', retryable: true };
  }
  if (found.nominations.length === 0 && (await recordedNominations(readonly, runId)) > 0) {
    // Never a terminal EMPTY advance: the run found organisations, but its
    // calls' runtime has no OWNER smoke verification yet.
    return { kind: 'AWAITING_HUMAN', queue: 'OWNER_SMOKE_VERIFICATION' };
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

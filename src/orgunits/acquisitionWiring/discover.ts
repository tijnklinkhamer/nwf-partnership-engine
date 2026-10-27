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
 * Children are the run's nominations, at NOMINATED, keyed by registrable
 * domain. A nomination is never fetched, ranked or valued here.
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

async function nominationsOfRun(readonly: pg.Pool, runId: string): Promise<NominationRef[]> {
  const { rows } = await readonly.query<NominationRef>(
    `SELECT id, registrable_domain FROM source_discovery_nominations
      WHERE discovery_run_id = $1 ORDER BY created_at, id`,
    [runId],
  );
  return rows;
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
  return advanceTo(await nominationsOfRun(readonly, runId));
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

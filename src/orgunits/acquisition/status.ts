/**
 * WW E-Q - THE READ-ONLY CAMPAIGN STATUS (`acquisition status`).
 *
 * Everything here is DERIVED from rows at read time: queue depth per stage
 * and state, live claims, scheduled retries, terminal refusals and failures by
 * reason, the human backlog by queue, budgets used and remaining, the last
 * ADVANCED instant, the control state, and the last worker stop. It also
 * reports whether the stored campaign VERIFIES under the trust set it is
 * given - with the operational set (empty in this build) the answer is
 * always UNVERIFIED, and the status says so rather than implying authority.
 *
 * Reads only; runs on the readonly role. Opens no socket.
 */
import type pg from 'pg';

import { loadStoredCampaign, verifyStoredCampaign } from './authority.js';
import { BUDGET_NAMES, type BudgetName } from './document.js';
import { loadCampaignUsage, STAGE_ORDER } from './store.js';
import { CampaignTrustSet } from './trust.js';
import type { ControlState, ItemState, Stage } from './vocabulary.js';

export interface BudgetStatus {
  readonly limit: number;
  readonly used: number | null;
  readonly remaining: number | null;
}

export interface CampaignStatus {
  readonly campaignId: string;
  readonly campaignKey: string;
  readonly controlState: ControlState;
  readonly verification: { readonly verified: boolean; readonly detail: string | null };
  readonly window: { readonly startsAt: string; readonly endsAt: string; readonly open: boolean };
  readonly allowedStages: readonly string[];
  readonly totals: { readonly workItems: number; readonly open: number };
  readonly stages: Readonly<Record<Stage, Readonly<Partial<Record<ItemState, number>>>>>;
  readonly claimedLive: number;
  readonly retriesScheduled: number;
  readonly refusals: Readonly<Record<string, number>>;
  readonly failures: Readonly<Record<string, number>>;
  readonly awaitingHuman: Readonly<Record<string, number>>;
  readonly budgets: Readonly<Record<BudgetName, BudgetStatus>>;
  readonly lastAdvancedAt: string | null;
  readonly lastWorkerStop: {
    readonly workerId: string;
    readonly reason: string;
    readonly detail: string | null;
    readonly at: string;
  } | null;
}

type Queryable = pg.Pool | pg.PoolClient;

export async function loadCampaignStatus(
  q: Queryable,
  campaignId: string,
  trust: CampaignTrustSet = CampaignTrustSet.operational(),
): Promise<CampaignStatus | null> {
  const stored = await loadStoredCampaign(q, campaignId);
  if (stored === null) return null;
  const verified = verifyStoredCampaign(stored, trust);

  const { rows: budgetRow } = await q.query<Record<string, number>>(
    `SELECT max_work_items AS "maxWorkItems", max_search_runs AS "maxSearchRuns",
            max_research_roots AS "maxResearchRoots", max_gateway_requests AS "maxGatewayRequests",
            max_items_per_registrable_domain AS "maxItemsPerRegistrableDomain",
            max_concurrency AS "maxConcurrency", max_attempts_per_item AS "maxAttemptsPerItem",
            max_awaiting_human_backlog AS "maxAwaitingHumanBacklog"
       FROM acquisition_campaigns WHERE id = $1`,
    [campaignId],
  );
  const limits = budgetRow[0]!;
  const usage = await loadCampaignUsage(q, campaignId);

  const { rows: states } = await q.query<{ stage: Stage; state: ItemState; n: number }>(
    `SELECT stage, state, count(*)::integer AS n FROM acquisition_work_item_states
      WHERE campaign_id = $1 GROUP BY stage, state ORDER BY stage, state`,
    [campaignId],
  );
  const stages = Object.fromEntries(
    STAGE_ORDER.map((s) => [s, {} as Partial<Record<ItemState, number>>]),
  ) as Record<Stage, Partial<Record<ItemState, number>>>;
  let claimedLive = 0;
  let retriesScheduled = 0;
  for (const r of states) {
    stages[r.stage][r.state] = r.n;
    if (r.state === 'CLAIMED') claimedLive += r.n;
    if (r.state === 'RETRY_SCHEDULED') retriesScheduled += r.n;
  }

  const grouped = async (column: string, state: string): Promise<Record<string, number>> => {
    const { rows } = await q.query<{ k: string; n: number }>(
      `SELECT ${column} AS k, count(*)::integer AS n FROM acquisition_work_item_states
        WHERE campaign_id = $1 AND state = $2 GROUP BY 1 ORDER BY 1`,
      [campaignId, state],
    );
    return Object.fromEntries(rows.map((r) => [r.k, r.n]));
  };

  const { rows: last } = await q.query<{ at: Date | null }>(
    `SELECT max(o.recorded_at) AS at FROM acquisition_work_outcomes o
       JOIN acquisition_work_items i ON i.id = o.work_item_id
      WHERE i.campaign_id = $1 AND o.outcome = 'ADVANCED'`,
    [campaignId],
  );
  const { rows: stop } = await q.query<{
    worker_id: string;
    stop_reason: string;
    detail: string | null;
    stopped_at: Date;
  }>(
    `SELECT worker_id, stop_reason, detail, stopped_at FROM acquisition_worker_stops
      WHERE campaign_id = $1 ORDER BY stopped_at DESC, id DESC LIMIT 1`,
    [campaignId],
  );

  const used: Partial<Record<BudgetName, number>> = {
    maxWorkItems: usage.workItems,
    maxSearchRuns: usage.searchRuns,
    maxResearchRoots: usage.researchRoots,
    maxGatewayRequests: usage.gatewayRequests,
    maxAwaitingHumanBacklog: usage.awaitingHuman,
  };
  const budgets = Object.fromEntries(
    BUDGET_NAMES.map((name) => {
      const limit = Number(limits[name]);
      const u = used[name];
      return [
        name,
        { limit, used: u ?? null, remaining: u === undefined ? null : Math.max(0, limit - u) },
      ];
    }),
  ) as Record<BudgetName, BudgetStatus>;

  return {
    campaignId: stored.id,
    campaignKey: stored.campaignKey,
    controlState: stored.controlState,
    verification: verified.ok
      ? { verified: true, detail: null }
      : { verified: false, detail: verified.detail },
    window: {
      startsAt: new Date(stored.startsAtMs).toISOString(),
      endsAt: new Date(stored.endsAtMs).toISOString(),
      open: stored.nowMs >= stored.startsAtMs && stored.nowMs < stored.endsAtMs,
    },
    allowedStages: stored.allowedStages,
    totals: { workItems: usage.workItems, open: usage.open },
    stages,
    claimedLive,
    retriesScheduled,
    refusals: await grouped('refusal_reason', 'REFUSED_TERMINAL'),
    failures: await grouped('failure_reason', 'FAILED_TERMINAL'),
    awaitingHuman: await grouped('human_queue', 'AWAITING_HUMAN'),
    budgets,
    lastAdvancedAt: last[0]?.at?.toISOString() ?? null,
    lastWorkerStop:
      stop[0] === undefined
        ? null
        : {
            workerId: stop[0].worker_id,
            reason: stop[0].stop_reason,
            detail: stop[0].detail,
            at: stop[0].stopped_at.toISOString(),
          },
  };
}

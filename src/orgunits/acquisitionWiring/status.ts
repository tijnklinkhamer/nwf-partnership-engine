/**
 * WW E-W - THE VERSIONED CAMPAIGN STATUS `nwf-pe.acquisition-status.v1`
 * (ADR 0030 s8), consumed by the Mac runtime (E-M) through
 * `nwf-pe acquisition status --campaign-id <uuid> --json`.
 *
 * Everything is DERIVED at read time on the readonly role; nothing is stored.
 * It embeds the E-Q queue status unchanged (`queue`) and adds what an
 * operator needs to see the campaign PROGRESS: discovery activity, candidate
 * counts per stage, the identity-review backlog, outbox writes, the last
 * successful research, failures WITH an explanation, and budgets left.
 *
 * Shape changes need a new `schema` value; fields are only ever added in v1
 * if they are optional to a reader. R2 added `continuation` (null unless the
 * campaign is a v3 continuation): its predecessor, how many nominations it
 * lists, how many it adopted, how many the next worker start would adopt,
 * and every listed one it skipped, with the named reason - derived now, on
 * the readonly role, by the same rule the worker applies. Opens no socket.
 */
import type pg from 'pg';

import {
  CampaignTrustSet,
  loadContinuationCandidates,
  loadCampaignStatus,
  type CampaignContinuation,
  type CampaignStatus,
  type ContinuationSkip,
} from '../acquisition/index.js';
import { continuationScopeCheck } from './dedupe.js';

export const ACQUISITION_STATUS_SCHEMA = 'nwf-pe.acquisition-status.v1';

/** A fixed, reviewable explanation for every terminal reason a campaign can record. */
export const FAILURE_EXPLANATIONS: Readonly<Record<string, string>> = Object.freeze({
  DUPLICATE:
    'Refused as a duplicate of a website claim, an existing discovery subject, an earlier nomination or the plan exclusion set; a relationship signal was recorded, nothing was merged.',
  OUT_OF_SCOPE:
    'Outside the signed campaign geographies, or a link-out not found by this campaign.',
  NOT_ADMISSIBLE:
    'The nomination or subject could not be proposed or admitted (no admissible name, no website claim, or not proposed by this campaign).',
  POLICY_REFUSED:
    'A policy gate refused it (URL rules, service host, https-only root, domain isolation, protected registry, admission refusal).',
  SUBJECT_NOT_FOUND: 'The nomination or subject the item names no longer reads.',
  GRANT_UNAVAILABLE: 'The search grant is missing, expired, exhausted or not valid for a run.',
  IDENTITY_UNRESOLVED: 'Identity could not be resolved.',
  HANDLER_OUTPUT_INVALID: 'A stage produced an output the queue refused; nothing was enqueued.',
  CAMPAIGN_EMERGENCY_STOPPED: 'The OWNER recorded EMERGENCY_STOP while the item ran.',
  ATTEMPTS_EXHAUSTED: 'Every permitted attempt ended in a retryable failure.',
  LEASE_EXPIRED_ATTEMPTS_EXHAUSTED:
    'The last permitted attempt lost its lease (the process stopped mid-item).',
});

export interface AcquisitionStatusV1 {
  readonly schema: typeof ACQUISITION_STATUS_SCHEMA;
  readonly generatedAt: string;
  readonly campaign: {
    readonly campaignId: string;
    readonly campaignKey: string;
    readonly controlState: string;
    readonly verified: boolean;
    readonly verificationDetail: string | null;
    readonly window: { readonly startsAt: string; readonly endsAt: string; readonly open: boolean };
    readonly allowedStages: readonly string[];
  };
  readonly discovery: {
    readonly latestRun: {
      readonly runId: string;
      readonly kind: 'SEARCH_PROVIDER' | 'PAGE_LINK_OUT';
      readonly geography: string | null;
      readonly startedAt: string;
      readonly outcome: string | null;
    } | null;
    readonly searchRuns: number;
    readonly linkOutRoots: number;
  };
  readonly candidates: {
    readonly discovered: number;
    readonly deduplicated: number;
    readonly proposed: number;
    readonly researched: number;
    readonly duplicatesRefused: number;
    readonly largeHeiDeprioritised: number;
  };
  readonly identityReview: { readonly awaiting: number; readonly released: number };
  readonly outbox: {
    readonly researchExports: number;
    readonly manifestEntries: number;
    readonly lastWrittenAt: string | null;
  };
  readonly lastSuccessfulResearchAt: string | null;
  readonly failures: readonly {
    readonly stage: string;
    readonly outcome: 'REFUSED_TERMINAL' | 'FAILED_TERMINAL';
    readonly reason: string;
    readonly count: number;
    readonly explanation: string;
  }[];
  readonly budgets: CampaignStatus['budgets'];
  readonly queue: CampaignStatus;
  /** R2 (migration 0029): the signed continuation of a v3 campaign, or null. */
  readonly continuation: ContinuationStatus | null;
}

export interface ContinuationStatus {
  readonly predecessorCampaignId: string;
  readonly listed: number;
  readonly adopted: number;
  /** Eligible and in scope, not adopted yet: the next worker start adopts them. */
  readonly pending: number;
  readonly skipped: readonly {
    readonly nominationId: string;
    readonly position: number;
    readonly reason: ContinuationSkip;
  }[];
}

/** Derives the continuation status of a v3 campaign (null for v1/v2). */
async function loadContinuationStatus(
  q: Queryable,
  campaignId: string,
  workItemsRemaining: number | null,
): Promise<ContinuationStatus | null> {
  const { rows } = await q.query<{
    cont: CampaignContinuation | null;
    geographies: string[];
  }>(
    `SELECT document #> '{scope,continuation}' AS cont, geographies
       FROM acquisition_campaigns WHERE id = $1`,
    [campaignId],
  );
  const cont = rows[0]?.cont ?? null;
  if (cont === null) return null;
  const inScope = continuationScopeCheck(() => q);
  const skipped: { nominationId: string; position: number; reason: ContinuationSkip }[] = [];
  let adopted = 0;
  let pending = 0;
  for (const c of await loadContinuationCandidates(q, campaignId, cont)) {
    const skip = (reason: ContinuationSkip) =>
      skipped.push({ nominationId: c.nominationId, position: c.position, reason });
    if (c.disposition === 'ADOPTED') adopted += 1;
    else if (c.disposition !== 'ELIGIBLE') skip(c.disposition);
    else if (!(await inScope(c.nominationId, rows[0]!.geographies))) skip('OUT_OF_SCOPE');
    else if (workItemsRemaining === 0) skip('WORK_ITEM_BUDGET_EXHAUSTED');
    else pending += 1;
  }
  return {
    predecessorCampaignId: cont.predecessorCampaignId,
    listed: adopted + pending + skipped.length,
    adopted,
    pending,
    skipped,
  };
}

type Queryable = pg.Pool | pg.PoolClient;

const iso = (d: Date | null | undefined): string | null => (d == null ? null : d.toISOString());

export async function loadAcquisitionStatusV1(
  q: Queryable,
  campaignId: string,
  trust: CampaignTrustSet = CampaignTrustSet.operational(),
): Promise<AcquisitionStatusV1 | null> {
  const queue = await loadCampaignStatus(q, campaignId, trust);
  if (queue === null) return null;

  const { rows: now } = await q.query<{ now: Date }>('SELECT now() AS now');
  const { rows: runs } = await q.query<{
    id: string;
    run_kind: 'SEARCH_PROVIDER' | 'PAGE_LINK_OUT';
    geography: string | null;
    started_at: Date;
    outcome: string | null;
  }>(
    `SELECT r.id, r.run_kind, r.geography, r.started_at, c.outcome
       FROM source_discovery_runs r
       LEFT JOIN source_discovery_run_completions c ON c.run_id = r.id
      WHERE r.actor_key IN (SELECT 'acq-' || i.id::text FROM acquisition_work_items i
                             WHERE i.campaign_id = $1 AND i.stage = 'DISCOVERED')
         OR r.research_run_id IN (SELECT i.subject_id FROM acquisition_work_items i
                                   WHERE i.campaign_id = $1 AND i.source_kind = 'LINK_OUT'
                                     AND i.stage = 'DISCOVERED')
      ORDER BY r.started_at DESC, r.id DESC`,
    [campaignId],
  );
  const { rows: stageCounts } = await q.query<{ stage: string; advanced: number; total: number }>(
    `SELECT stage, count(*) FILTER (WHERE state = 'ADVANCED')::int AS advanced,
            count(*)::int AS total
       FROM acquisition_work_item_states WHERE campaign_id = $1 GROUP BY stage`,
    [campaignId],
  );
  const total = (stage: string) => stageCounts.find((s) => s.stage === stage)?.total ?? 0;
  const advanced = (stage: string) => stageCounts.find((s) => s.stage === stage)?.advanced ?? 0;
  const { rows: signals } = await q.query<{ kind: string; n: number }>(
    `SELECT signal_kind AS kind, count(*)::int AS n FROM acquisition_signals
      WHERE campaign_id = $1 GROUP BY 1`,
    [campaignId],
  );
  const { rows: review } = await q.query<{ awaiting: number; released: number }>(
    `SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM acquisition_work_items c
                                               WHERE c.parent_item_id = s.work_item_id))::int AS awaiting,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM acquisition_work_items c
                                           WHERE c.parent_item_id = s.work_item_id))::int AS released
       FROM acquisition_work_item_states s
      WHERE s.campaign_id = $1 AND s.stage = 'IDENTITY_REVIEW' AND s.state = 'AWAITING_HUMAN'`,
    [campaignId],
  );
  const { rows: outbox } = await q.query<{ kind: string; n: number; last: Date | null }>(
    `SELECT entry_kind AS kind, count(*)::int AS n, max(recorded_at) AS last
       FROM acquisition_outbox_entries WHERE campaign_id = $1 GROUP BY 1`,
    [campaignId],
  );
  const { rows: research } = await q.query<{ at: Date | null }>(
    `SELECT max(c.finished_at) AS at
       FROM subject_research_admissions a
       JOIN orgunit_research_runs r ON r.root_scope = 'subject_admission:' || a.id::text
       JOIN orgunit_research_run_completions c ON c.run_id = r.id
      WHERE a.campaign_id = $1 AND c.terminal_state = 'COMPLETED'`,
    [campaignId],
  );
  const { rows: failures } = await q.query<{
    stage: string;
    outcome: 'REFUSED_TERMINAL' | 'FAILED_TERMINAL';
    reason: string;
    n: number;
  }>(
    `SELECT stage, state AS outcome, COALESCE(refusal_reason, failure_reason) AS reason,
            count(*)::int AS n
       FROM acquisition_work_item_states
      WHERE campaign_id = $1 AND state IN ('REFUSED_TERMINAL', 'FAILED_TERMINAL')
      GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
    [campaignId],
  );
  const signal = (kind: string) => signals.find((s) => s.kind === kind)?.n ?? 0;
  const latest = runs[0];
  return {
    schema: ACQUISITION_STATUS_SCHEMA,
    generatedAt: now[0]!.now.toISOString(),
    campaign: {
      campaignId: queue.campaignId,
      campaignKey: queue.campaignKey,
      controlState: queue.controlState,
      verified: queue.verification.verified,
      verificationDetail: queue.verification.detail,
      window: queue.window,
      allowedStages: queue.allowedStages,
    },
    discovery: {
      latestRun:
        latest === undefined
          ? null
          : {
              runId: latest.id,
              kind: latest.run_kind,
              geography: latest.geography,
              startedAt: latest.started_at.toISOString(),
              outcome: latest.outcome,
            },
      searchRuns: runs.filter((r) => r.run_kind === 'SEARCH_PROVIDER').length,
      linkOutRoots: (
        await q.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM acquisition_work_items
            WHERE campaign_id = $1 AND source_kind = 'LINK_OUT' AND stage = 'DISCOVERED'`,
          [campaignId],
        )
      ).rows[0]!.n,
    },
    candidates: {
      discovered: total('NOMINATED'),
      deduplicated: advanced('NOMINATED'),
      proposed: total('RESEARCH_PENDING'),
      researched: advanced('RESEARCH_PENDING'),
      duplicatesRefused:
        signal('DUPLICATE_OF_WEBSITE_CLAIM') +
        signal('DUPLICATE_OF_DISCOVERY_SUBJECT') +
        signal('DUPLICATE_OF_EARLIER_NOMINATION') +
        signal('DUPLICATE_OF_PLAN_EXCLUSION'),
      largeHeiDeprioritised: signal('LARGE_HEI_TAGGED'),
    },
    identityReview: { awaiting: review[0]!.awaiting, released: review[0]!.released },
    outbox: {
      researchExports: outbox.find((o) => o.kind === 'RESEARCH_EXPORT')?.n ?? 0,
      manifestEntries: outbox.find((o) => o.kind === 'ASSESSABLE_MANIFEST')?.n ?? 0,
      lastWrittenAt:
        outbox
          .map((o) => iso(o.last))
          .filter((x): x is string => x !== null)
          .sort()
          .at(-1) ?? null,
    },
    lastSuccessfulResearchAt: iso(research[0]?.at),
    failures: failures.map((f) => ({
      stage: f.stage,
      outcome: f.outcome,
      reason: f.reason,
      count: f.n,
      explanation: FAILURE_EXPLANATIONS[f.reason] ?? 'No explanation is recorded for this reason.',
    })),
    budgets: queue.budgets,
    queue,
    continuation: await loadContinuationStatus(q, campaignId, queue.budgets.maxWorkItems.remaining),
  };
}

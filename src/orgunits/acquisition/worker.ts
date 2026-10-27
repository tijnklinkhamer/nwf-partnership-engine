/**
 * WW E-Q - THE ACQUISITION WORKER CORE (ADR 0029 s4).
 *
 * `runWorker` processes the approved work of ONE campaign without a prompt
 * per organisation: claim -> handler -> outcome, in a loop, until a recorded
 * stop reason. Before EVERY claim it re-derives the campaign authority (OWNER
 * signature under the pinned trust set, control state, window - all by the
 * database clock) and re-reads the budgets and the human backlog from rows.
 *
 *   - STAGE HANDLERS ARE INJECTED PORTS. This module performs no stage itself
 *     and imports no gateway, robots, search provider or research path: the
 *     wiring package plugs real handlers in through `StageHandler`. A worker
 *     refuses to start unless every stage the campaign lists has a handler.
 *   - THE HUMAN GATE IS NOT A HANDLER. An IDENTITY_REVIEW item is parked as
 *     AWAITING_HUMAN (OWNER_IDENTITY_REVIEW) by the worker itself; a handler
 *     for it is refused, and the database refuses any other outcome for it.
 *   - BUDGETS: a stage whose required resource is spent is not claimed; when
 *     only such items remain the worker stops with BUDGET_EXHAUSTED.
 *   - BACKPRESSURE: when the AWAITING_HUMAN backlog reaches the campaign's
 *     stated cap, the worker stops claiming (BACKPRESSURE).
 *   - CONTROL: PAUSE / STOP stop claiming; the current item finishes and its
 *     outcome is recorded. EMERGENCY_STOP is polled while a handler runs and
 *     aborts the handler's signal; whatever it returns is recorded as
 *     REFUSED_TERMINAL / CAMPAIGN_EMERGENCY_STOPPED, with no children.
 *   - GRACEFUL SHUTDOWN: the caller's AbortSignal is honoured BETWEEN items:
 *     the current item finishes and its outcome is recorded in one
 *     transaction. A process that dies mid-item leaves only a claim; its
 *     lease expires and the item is retried (attempt n+1); the database's
 *     one-terminal-outcome-per-item index makes a duplicate ADVANCED
 *     impossible.
 *   - A per-run HostCircuitBreaker (orchestrator/circuitBreaker.ts, reused)
 *     keyed by registrable domain is handed to handlers; a domain whose
 *     circuit is open is not scheduled for the rest of the run.
 *
 * Opens no socket. Never UPDATEs or DELETEs.
 */
import type pg from 'pg';

import {
  createHostCircuitBreaker,
  type HostCircuitBreaker,
} from '../orchestrator/circuitBreaker.js';
import { realClock, type Clock } from '../orchestrator/clock.js';
import {
  deriveCampaignAuthority,
  loadStoredCampaign,
  type CampaignAuthority,
  type CampaignAuthorityRefusalCode,
} from './authority.js';
import type { BudgetName, CampaignBudgets, CampaignScope } from './document.js';
import {
  NO_CONSUMPTION,
  OutcomeRefusedError,
  claimNextWorkItem,
  countOpenInScope,
  loadCampaignUsage,
  recordWorkOutcome,
  seedCampaignSearchGrantRoots,
  type ClaimedWork,
  type Consumption,
  type RecordedOutcome,
  type WorkItemSeed,
  type WorkItemView,
} from './store.js';
import type { CampaignTrustSet } from './trust.js';
import {
  DEFAULT_LEASE_SECONDS,
  HUMAN_GATE_STAGE,
  HUMAN_QUEUES,
  MAX_LEASE_SECONDS,
  REFUSAL_REASONS,
  REGISTRABLE_DOMAIN,
  RESOURCES,
  RETRY_REASONS,
  STAGE_SUBJECT_KINDS,
  UUID,
  WORKER_ID,
  isStage,
  successorOf,
  type HumanQueue,
  type OutcomeKind,
  type RefusalReason,
  type Resource,
  type RetryReason,
  type Stage,
  type WorkerStage,
  type WorkerStopReason,
} from './vocabulary.js';

// ---------------------------------------------------------------------------
// THE STAGE HANDLER PORT (exported from index.ts for the wiring package).
// ---------------------------------------------------------------------------

/** What a handler returns. Each is validated before anything is recorded. */
export type StageOutcome =
  | {
      readonly kind: 'ADVANCED';
      /** The next stage (successorOf(item.stage)); null ONLY from ASSESSABLE, the pipeline's end. */
      readonly next: Stage | null;
      /** Items to enqueue at `next`. Omitted: the same subject moves on. */
      readonly children?: readonly WorkItemSeed[];
    }
  | { readonly kind: 'RETRY'; readonly reason: RetryReason; readonly retryable: true }
  | { readonly kind: 'REFUSED'; readonly reason: RefusalReason }
  | { readonly kind: 'AWAITING_HUMAN'; readonly queue: HumanQueue };

/** The campaign as a handler sees it: the SIGNED scope and budgets, read-only. */
export interface HandlerCampaignView {
  readonly campaignId: string;
  readonly campaignKey: string;
  readonly scope: CampaignScope;
  readonly budgets: CampaignBudgets;
}

export interface StageHandlerContext {
  readonly campaign: HandlerCampaignView;
  readonly attemptNo: number;
  /** Campaign budget left for each resource when this item was claimed. */
  readonly remaining: Readonly<Record<Resource, number>>;
  /** Reports spend as it happens; recorded with the outcome, whatever it is. */
  consume(resource: Resource, amount: number): void;
  /** Aborted when the OWNER records EMERGENCY_STOP while this handler runs. */
  readonly signal: AbortSignal;
  readonly clock: Clock;
  /** Run-scoped, keyed by registrable domain. An open domain is not scheduled again this run. */
  readonly circuit: HostCircuitBreaker;
}

export interface StageHandler {
  readonly stage: WorkerStage;
  handle(item: WorkItemView, ctx: StageHandlerContext): Promise<StageOutcome>;
}

// ---------------------------------------------------------------------------
// Configuration refusals (thrown before any claim; nothing is written).
// ---------------------------------------------------------------------------

export type WorkerConfigRefusalCode =
  | 'WORKER_ID_INVALID'
  | 'LEASE_INVALID'
  | 'MAX_ITEMS_INVALID'
  | 'CAMPAIGN_NOT_FOUND'
  | 'HANDLER_NOT_PERMITTED'
  | 'HANDLER_DUPLICATE'
  | 'HANDLERS_NOT_WIRED';

export class WorkerConfigRefusal extends Error {
  constructor(
    readonly code: WorkerConfigRefusalCode,
    readonly detail: string | null = null,
  ) {
    super(detail === null ? code : `${code}: ${detail}`);
    this.name = 'WorkerConfigRefusal';
  }
}

/**
 * Every stage the campaign lists needs exactly one handler; the human gate
 * may have none. Returns the stages left unwired (empty = complete).
 */
export function checkHandlerCoverage(
  campaignStages: readonly string[],
  handlers: readonly StageHandler[],
): readonly string[] {
  const seen = new Set<string>();
  for (const h of handlers) {
    if ((h.stage as string) === HUMAN_GATE_STAGE) {
      throw new WorkerConfigRefusal('HANDLER_NOT_PERMITTED', HUMAN_GATE_STAGE);
    }
    if (!isStage(h.stage)) throw new WorkerConfigRefusal('HANDLER_NOT_PERMITTED', 'unknown_stage');
    if (seen.has(h.stage)) throw new WorkerConfigRefusal('HANDLER_DUPLICATE', h.stage);
    seen.add(h.stage);
  }
  return campaignStages.filter((s) => !seen.has(s)).sort();
}

// ---------------------------------------------------------------------------
// Outcome validation: a handler's word is checked before it is recorded.
// ---------------------------------------------------------------------------

const MAX_CHILDREN = 500;
/** The per-outcome consumption bounds of migration 0023. */
const CONSUMPTION_BOUNDS: Readonly<Record<Resource, number>> = {
  searchRuns: 100,
  researchRoots: 100,
  gatewayRequests: 10000,
};
const HANDLER_RETRY_REASONS = RETRY_REASONS.filter((r) => r !== 'LEASE_EXPIRED');
const HANDLER_REFUSAL_REASONS = REFUSAL_REASONS.filter((r) => r !== 'CAMPAIGN_EMERGENCY_STOPPED');

const INVALID: RecordedOutcome = { kind: 'REFUSED_TERMINAL', reason: 'HANDLER_OUTPUT_INVALID' };

/** Maps a handler's StageOutcome onto what may be recorded, or HANDLER_OUTPUT_INVALID. */
export function resolveStageOutcome(
  item: WorkItemView,
  attemptNo: number,
  maxAttempts: number,
  outcome: unknown,
): RecordedOutcome {
  if (typeof outcome !== 'object' || outcome === null) return INVALID;
  const o = outcome as Record<string, unknown>;
  switch (o['kind']) {
    case 'ADVANCED': {
      const expected = successorOf(item.stage);
      if (o['next'] !== expected) return INVALID;
      if (expected === null) {
        if (o['children'] !== undefined && (o['children'] as unknown[]).length !== 0)
          return INVALID;
        return { kind: 'ADVANCED', nextStage: null, children: [] };
      }
      const raw =
        o['children'] === undefined
          ? [
              {
                subjectKind: item.subjectKind,
                subjectId: item.subjectId,
                registrableDomain: item.registrableDomain,
              },
            ]
          : o['children'];
      if (!Array.isArray(raw) || raw.length > MAX_CHILDREN) return INVALID;
      const children: WorkItemSeed[] = [];
      for (const c of raw as unknown[]) {
        if (typeof c !== 'object' || c === null) return INVALID;
        const s = c as Record<string, unknown>;
        const domain = s['registrableDomain'] ?? null;
        if (
          !STAGE_SUBJECT_KINDS[expected].includes(s['subjectKind'] as never) ||
          typeof s['subjectId'] !== 'string' ||
          !UUID.test(s['subjectId']) ||
          !(domain === null || (typeof domain === 'string' && REGISTRABLE_DOMAIN.test(domain)))
        ) {
          return INVALID;
        }
        children.push({
          subjectKind: s['subjectKind'] as WorkItemSeed['subjectKind'],
          subjectId: s['subjectId'],
          registrableDomain: domain as string | null,
        });
      }
      return { kind: 'ADVANCED', nextStage: expected, children };
    }
    case 'RETRY':
      if (o['retryable'] !== true || !HANDLER_RETRY_REASONS.includes(o['reason'] as never)) {
        return INVALID;
      }
      return attemptNo >= maxAttempts
        ? { kind: 'FAILED_TERMINAL', reason: 'ATTEMPTS_EXHAUSTED' }
        : { kind: 'RETRY_SCHEDULED', reason: o['reason'] as RetryReason };
    case 'REFUSED':
      if (!HANDLER_REFUSAL_REASONS.includes(o['reason'] as never)) return INVALID;
      return { kind: 'REFUSED_TERMINAL', reason: o['reason'] as RefusalReason };
    case 'AWAITING_HUMAN':
      if (!HUMAN_QUEUES.includes(o['queue'] as never)) return INVALID;
      return { kind: 'AWAITING_HUMAN', queue: o['queue'] as HumanQueue };
    default:
      return INVALID;
  }
}

// ---------------------------------------------------------------------------
// The loop.
// ---------------------------------------------------------------------------

export interface RunWorkerOptions {
  /** A pool whose login holds nwf_acquisition_worker. */
  readonly pool: pg.Pool;
  readonly campaignId: string;
  /** A slug naming this PROCESS (`mac-runtime-1`), never a person. */
  readonly workerId: string;
  readonly handlers: readonly StageHandler[];
  readonly clock?: Clock;
  /** Graceful shutdown, honoured between items. */
  readonly signal?: AbortSignal;
  readonly maxItems?: number;
  /** Process at most one item, then stop. */
  readonly once?: boolean;
  /** Omitted: the operational trust set (EMPTY). Tests pass a TEST_ONLY set. */
  readonly trust?: CampaignTrustSet;
  readonly leaseSeconds?: number;
  /** Wait between empty polls. */
  readonly idleSleepMs?: number;
  /** Stop with IDLE after this long with nothing claimable. */
  readonly idleTimeoutMs?: number;
  /** EMERGENCY_STOP polling interval while a handler runs. */
  readonly controlPollMs?: number;
}

export interface WorkerSummary {
  readonly campaignId: string;
  readonly workerId: string;
  readonly stopReason: WorkerStopReason;
  readonly detail: string | null;
  readonly processed: number;
  readonly outcomes: Readonly<Record<OutcomeKind, number>>;
  /** Outcomes the database refused because a later attempt superseded the claim. */
  readonly superseded: number;
  readonly stopId: string;
}

const BUDGET_OF: Readonly<Record<Resource, BudgetName>> = {
  searchRuns: 'maxSearchRuns',
  researchRoots: 'maxResearchRoots',
  gatewayRequests: 'maxGatewayRequests',
};

const STOP_FOR_REFUSAL: Readonly<
  Record<Exclude<CampaignAuthorityRefusalCode, 'CAMPAIGN_NOT_FOUND'>, WorkerStopReason>
> = {
  CAMPAIGN_UNVERIFIED: 'CAMPAIGN_UNVERIFIED',
  CAMPAIGN_NOT_STARTED: 'CAMPAIGN_NOT_STARTED',
  CAMPAIGN_PAUSED: 'CAMPAIGN_PAUSED',
  CAMPAIGN_STOPPED: 'CAMPAIGN_STOPPED',
  CAMPAIGN_EMERGENCY_STOPPED: 'CAMPAIGN_EMERGENCY_STOPPED',
  CAMPAIGN_WINDOW_NOT_OPEN: 'CAMPAIGN_WINDOW_NOT_OPEN',
  CAMPAIGN_WINDOW_CLOSED: 'CAMPAIGN_WINDOW_CLOSED',
};

function sleepOrAbort(clock: Clock, ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal === undefined) return clock.sleep(ms);
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      signal.removeEventListener('abort', done);
      resolve();
    };
    signal.addEventListener('abort', done, { once: true });
    void clock.sleep(ms).then(done);
  });
}

const TICK: unique symbol = Symbol('tick');

export async function runWorker(options: RunWorkerOptions): Promise<WorkerSummary> {
  const { pool, campaignId, workerId, signal } = options;
  const clock = options.clock ?? realClock;
  const leaseSeconds = options.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const idleSleepMs = options.idleSleepMs ?? 5000;
  const idleTimeoutMs = options.idleTimeoutMs ?? 10 * 60 * 1000;
  const controlPollMs = options.controlPollMs ?? 5000;
  if (!WORKER_ID.test(workerId)) throw new WorkerConfigRefusal('WORKER_ID_INVALID');
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > MAX_LEASE_SECONDS) {
    throw new WorkerConfigRefusal('LEASE_INVALID');
  }
  if (
    options.maxItems !== undefined &&
    (!Number.isInteger(options.maxItems) || options.maxItems < 1)
  ) {
    throw new WorkerConfigRefusal('MAX_ITEMS_INVALID');
  }

  const stored = await loadStoredCampaign(pool, campaignId);
  if (stored === null) throw new WorkerConfigRefusal('CAMPAIGN_NOT_FOUND');
  const unwired = checkHandlerCoverage(stored.allowedStages, options.handlers);
  if (unwired.length > 0) throw new WorkerConfigRefusal('HANDLERS_NOT_WIRED', unwired.join(','));
  const handlerOf = new Map<Stage, StageHandler>(options.handlers.map((h) => [h.stage, h]));

  const startedAt = new Date(stored.nowMs);
  const breaker = createHostCircuitBreaker();
  const outcomes: Record<OutcomeKind, number> = {
    ADVANCED: 0,
    RETRY_SCHEDULED: 0,
    REFUSED_TERMINAL: 0,
    AWAITING_HUMAN: 0,
    FAILED_TERMINAL: 0,
  };
  let processed = 0;
  let superseded = 0;
  let seeded = false;
  let idleSinceMs: number | null = null;

  const stop = async (reason: WorkerStopReason, detail: string | null): Promise<WorkerSummary> => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO acquisition_worker_stops
         (campaign_id, worker_id, stop_reason, detail, items_processed, started_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [campaignId, workerId, reason, detail, processed, startedAt],
    );
    return {
      campaignId,
      workerId,
      stopReason: reason,
      detail,
      processed,
      outcomes: { ...outcomes },
      superseded,
      stopId: rows[0]!.id,
    };
  };

  for (;;) {
    if (signal?.aborted === true) return stop('ABORTED', null);
    if (options.maxItems !== undefined && processed >= options.maxItems) {
      return stop('MAX_ITEMS_REACHED', null);
    }
    const derived = await deriveCampaignAuthority(pool, campaignId, {
      ...(options.trust !== undefined ? { trust: options.trust } : {}),
    });
    if (!derived.ok) {
      if (derived.code === 'CAMPAIGN_NOT_FOUND')
        throw new WorkerConfigRefusal('CAMPAIGN_NOT_FOUND');
      return stop(STOP_FOR_REFUSAL[derived.code], derived.detail);
    }
    const authority = derived.authority;
    if (!seeded) {
      await seedCampaignSearchGrantRoots(pool, authority);
      seeded = true;
    }

    const usage = await loadCampaignUsage(pool, campaignId);
    if (usage.awaitingHuman >= authority.budgets.maxAwaitingHumanBacklog) {
      return stop('BACKPRESSURE', `awaiting_human:${usage.awaitingHuman}`);
    }
    const remaining = {
      searchRuns: authority.budgets.maxSearchRuns - usage.searchRuns,
      researchRoots: authority.budgets.maxResearchRoots - usage.researchRoots,
      gatewayRequests: authority.budgets.maxGatewayRequests - usage.gatewayRequests,
    };
    const exhausted = new Set(RESOURCES.filter((r) => remaining[r] <= 0));

    const claimed = await claimNextWorkItem(pool, authority, {
      workerId,
      leaseSeconds,
      exhausted,
      blockedDomains: new Set(breaker.openHosts()),
    });
    if (claimed.kind === 'NONE') {
      if (claimed.reason === 'BUDGET_EXHAUSTED' && claimed.exhausted !== null) {
        return stop('BUDGET_EXHAUSTED', BUDGET_OF[claimed.exhausted]);
      }
      if (
        claimed.reason === 'NOTHING_DUE' &&
        (await countOpenInScope(pool, campaignId, authority.scope.stages)) === 0
      ) {
        return stop('QUEUE_DRAINED', null);
      }
      if (options.once === true) return stop('IDLE', claimed.reason);
      const now = clock.now();
      idleSinceMs ??= now;
      if (now - idleSinceMs >= idleTimeoutMs) return stop('IDLE', claimed.reason);
      await sleepOrAbort(clock, idleSleepMs, signal);
      continue;
    }
    idleSinceMs = null;

    const recorded = await processClaim(claimed.claim, authority, remaining);
    processed += 1;
    if (recorded !== null) outcomes[recorded] += 1;
    if (options.once === true) return stop('ONCE_COMPLETED', null);
  }

  async function processClaim(
    claim: ClaimedWork,
    authority: CampaignAuthority,
    remaining: Readonly<Record<Resource, number>>,
  ): Promise<OutcomeKind | null> {
    const item = claim.item;
    const spent: Record<Resource, number> = { ...NO_CONSUMPTION };
    let outcome: RecordedOutcome;
    if (item.stage === HUMAN_GATE_STAGE) {
      outcome = { kind: 'AWAITING_HUMAN', queue: 'OWNER_IDENTITY_REVIEW' };
    } else {
      const handler = handlerOf.get(item.stage)!;
      const emergency = new AbortController();
      const ctx: StageHandlerContext = {
        campaign: {
          campaignId: authority.campaignId,
          campaignKey: authority.campaignKey,
          scope: authority.scope,
          budgets: authority.budgets,
        },
        attemptNo: claim.attemptNo,
        remaining,
        consume(resource: Resource, amount: number): void {
          if (!RESOURCES.includes(resource) || !Number.isInteger(amount) || amount < 0) {
            throw new RangeError('consume: a known resource and a non-negative integer');
          }
          if (spent[resource] + amount > CONSUMPTION_BOUNDS[resource]) {
            throw new RangeError('consume: beyond the per-item bound');
          }
          spent[resource] += amount;
        },
        signal: emergency.signal,
        clock,
        circuit: breaker,
      };
      const running = handler.handle(item, ctx).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      let settled: Awaited<typeof running> | typeof TICK = TICK;
      while (settled === TICK) {
        settled = await Promise.race([
          running,
          clock.sleep(controlPollMs).then((): typeof TICK => TICK),
        ]);
        if (settled !== TICK) break;
        const { rows } = await pool.query<{ state: string }>(
          'SELECT acquisition_campaign_control_state($1) AS state',
          [campaignId],
        );
        if (rows[0]!.state === 'EMERGENCY_STOPPED') emergency.abort();
      }
      if (emergency.signal.aborted) {
        outcome = { kind: 'REFUSED_TERMINAL', reason: 'CAMPAIGN_EMERGENCY_STOPPED' };
      } else if (!settled.ok) {
        outcome =
          claim.attemptNo >= authority.budgets.maxAttemptsPerItem
            ? { kind: 'FAILED_TERMINAL', reason: 'ATTEMPTS_EXHAUSTED' }
            : { kind: 'RETRY_SCHEDULED', reason: 'HANDLER_EXCEPTION' };
      } else {
        outcome = resolveStageOutcome(
          item,
          claim.attemptNo,
          authority.budgets.maxAttemptsPerItem,
          settled.value,
        );
      }
    }
    const consumption: Consumption = { ...spent };
    try {
      const result = await recordWorkOutcome(pool, claim, outcome, consumption, workerId);
      if (result.recorded === 'ADVANCED' && item.registrableDomain !== null) {
        breaker.recordSuccess(item.registrableDomain);
      }
      return result.recorded;
    } catch (error) {
      if (error instanceof OutcomeRefusedError) {
        superseded += 1;
        return null;
      }
      throw error;
    }
  }
}

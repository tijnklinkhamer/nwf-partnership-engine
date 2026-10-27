/**
 * WW E-M - THE SUPERVISOR: KEEP ONE CAMPAIGN'S WORKER RUNNING ON THIS MAC.
 *
 * The supervisor holds NO acquisition authority and does NO work. It runs the
 * existing `nwf-pe acquisition worker` for one campaign, reads why it stopped,
 * and decides - by the fixed table below - whether to start it again, wait,
 * or exit for good. Every authority decision stays where ADR 0029 put it: the
 * worker re-derives the OWNER-signed campaign authority before EVERY claim,
 * and the database refuses a claim the campaign does not permit. The
 * supervisor can only make the worker run LESS, never more.
 *
 *   worker stopped with            supervisor
 *   ---------------------------    ---------------------------------------
 *   IDLE / QUEUE_DRAINED / ...     restart after a capped, growing backoff
 *   BACKPRESSURE                   same, shown as waiting for human review
 *   CAMPAIGN_PAUSED                wait (no worker) until the status reads
 *                                  RUNNING again, then restart at once
 *   NOT_STARTED / WINDOW_NOT_OPEN  wait the same way
 *   STOPPED / EMERGENCY_STOPPED /  exit for good, reason recorded
 *   BUDGET_EXHAUSTED / WINDOW_
 *   CLOSED / UNVERIFIED
 *   refused (e.g. handlers not     exit for good, reason recorded
 *   wired, campaign not found)
 *   crashed / unreadable           restart after a capped backoff; exit
 *                                  after too many consecutive failures
 *   a reason it does not know      exit (never guess)
 *
 * While waiting it reads the campaign status (read-only) instead of starting
 * a worker, so a long pause does not write a worker-stop row every minute.
 * `wake()` (SIGUSR1 from `nwf-engine resume`) cuts any wait short.
 *
 * SHUTDOWN is graceful: the worker gets SIGTERM, which it honours BETWEEN
 * items - the current item finishes and its outcome is recorded. If the
 * campaign is EMERGENCY_STOPPED the worker has already aborted the running
 * handler (it polls the control state); should it still not exit within a
 * grace period it is killed - its claim then expires and, the campaign being
 * over, is never retried.
 *
 * Opens no socket, starts no process itself (the launcher and the status
 * probe are injected ports), touches no database row.
 */
import type { RuntimeClock } from './clock.js';
import {
  campaignFactsOf,
  parseStatusRun,
  parseWorkerRun,
  type CampaignFacts,
  type CliRun,
  type WorkerResult,
} from './envelope.js';
import type { SupervisorStateFile } from './lock.js';
import { SUPERVISOR_STATE_CONTRACT } from './lock.js';
import type { WorkerHandle } from './processes.js';

// ---------------------------------------------------------------------------
// Policy: mechanical safety bounds, not calibrated values.
// ---------------------------------------------------------------------------

export interface SupervisorPolicy {
  /** First wait after a worker found nothing to do; doubles while nothing changes. */
  readonly idleBackoffBaseMs: number;
  readonly idleBackoffCapMs: number;
  /** First wait after a crash or an unreadable status; doubles per consecutive failure. */
  readonly failureBackoffBaseMs: number;
  readonly failureBackoffCapMs: number;
  /** Consecutive failures tolerated before the supervisor gives up. */
  readonly maxConsecutiveFailures: number;
  /** How often a waiting supervisor re-reads the campaign status. */
  readonly waitPollMs: number;
  /** After EMERGENCY_STOP + shutdown, how long a worker gets before SIGKILL. */
  readonly emergencyKillGraceMs: number;
}

export const DEFAULT_SUPERVISOR_POLICY: SupervisorPolicy = Object.freeze({
  idleBackoffBaseMs: 30_000,
  idleBackoffCapMs: 15 * 60_000,
  failureBackoffBaseMs: 10_000,
  failureBackoffCapMs: 5 * 60_000,
  maxConsecutiveFailures: 8,
  waitPollMs: 60_000,
  emergencyKillGraceMs: 60_000,
});

export const SUPERVISOR_WORKER_ID = 'mac-supervisor';

// ---------------------------------------------------------------------------
// The decision table (pure, exported for tests).
// ---------------------------------------------------------------------------

export type WaitPhase =
  | 'WAITING_FOR_WORK'
  | 'WAITING_FOR_HUMAN_REVIEW'
  | 'WAITING_PAUSED'
  | 'WAITING_NOT_STARTED'
  | 'WAITING_WINDOW_NOT_OPEN';

export type SupervisorPhase =
  | 'STARTING'
  | 'CHECKING_CAMPAIGN'
  | 'RUNNING_WORKER'
  | WaitPhase
  | 'WAITING_AFTER_FAILURE'
  | 'STOPPING'
  | 'EXITED';

export type SupervisorExitReason =
  | 'CAMPAIGN_STOPPED'
  | 'CAMPAIGN_EMERGENCY_STOPPED'
  | 'BUDGET_EXHAUSTED'
  | 'CAMPAIGN_WINDOW_CLOSED'
  | 'CAMPAIGN_UNVERIFIED'
  | 'CAMPAIGN_NOT_FOUND'
  | 'HANDLERS_NOT_WIRED'
  | 'WORKER_REFUSED'
  | 'STATUS_REFUSED'
  | 'UNKNOWN_WORKER_STOP'
  | 'REPEATED_FAILURES'
  | 'SHUTDOWN_REQUESTED';

export type Decision =
  | { readonly kind: 'LAUNCH' }
  | { readonly kind: 'WAIT'; readonly phase: WaitPhase; readonly detail: string | null }
  | { readonly kind: 'IDLE'; readonly phase: WaitPhase; readonly detail: string | null }
  | { readonly kind: 'FAILURE'; readonly detail: string }
  | {
      readonly kind: 'EXIT';
      readonly reason: SupervisorExitReason;
      readonly detail: string | null;
    };

const TERMINAL_STOPS: Readonly<Record<string, SupervisorExitReason>> = {
  CAMPAIGN_STOPPED: 'CAMPAIGN_STOPPED',
  CAMPAIGN_EMERGENCY_STOPPED: 'CAMPAIGN_EMERGENCY_STOPPED',
  BUDGET_EXHAUSTED: 'BUDGET_EXHAUSTED',
  CAMPAIGN_WINDOW_CLOSED: 'CAMPAIGN_WINDOW_CLOSED',
  CAMPAIGN_UNVERIFIED: 'CAMPAIGN_UNVERIFIED',
};
const WAITING_STOPS: Readonly<Record<string, WaitPhase>> = {
  CAMPAIGN_PAUSED: 'WAITING_PAUSED',
  CAMPAIGN_NOT_STARTED: 'WAITING_NOT_STARTED',
  CAMPAIGN_WINDOW_NOT_OPEN: 'WAITING_WINDOW_NOT_OPEN',
};
const IDLE_STOPS: Readonly<Record<string, WaitPhase>> = {
  IDLE: 'WAITING_FOR_WORK',
  QUEUE_DRAINED: 'WAITING_FOR_WORK',
  MAX_ITEMS_REACHED: 'WAITING_FOR_WORK',
  ONCE_COMPLETED: 'WAITING_FOR_WORK',
  BACKPRESSURE: 'WAITING_FOR_HUMAN_REVIEW',
};

export function decideAfterWorker(result: WorkerResult, shutdownRequested: boolean): Decision {
  switch (result.kind) {
    case 'REFUSED':
      if (result.code === 'ACQUISITION_HANDLERS_NOT_WIRED') {
        return { kind: 'EXIT', reason: 'HANDLERS_NOT_WIRED', detail: result.detail };
      }
      if (result.code === 'CAMPAIGN_NOT_FOUND') {
        return { kind: 'EXIT', reason: 'CAMPAIGN_NOT_FOUND', detail: null };
      }
      return { kind: 'EXIT', reason: 'WORKER_REFUSED', detail: result.code };
    case 'CRASHED':
      return shutdownRequested
        ? { kind: 'EXIT', reason: 'SHUTDOWN_REQUESTED', detail: null }
        : { kind: 'FAILURE', detail: result.detail };
    case 'STOPPED': {
      const r = result.stopReason;
      if (r === 'ABORTED') {
        return shutdownRequested
          ? { kind: 'EXIT', reason: 'SHUTDOWN_REQUESTED', detail: null }
          : {
              kind: 'FAILURE',
              detail: 'the worker was aborted by something other than this supervisor',
            };
      }
      if (TERMINAL_STOPS[r] !== undefined) {
        return { kind: 'EXIT', reason: TERMINAL_STOPS[r], detail: result.detail };
      }
      if (shutdownRequested) return { kind: 'EXIT', reason: 'SHUTDOWN_REQUESTED', detail: null };
      if (WAITING_STOPS[r] !== undefined) {
        return { kind: 'WAIT', phase: WAITING_STOPS[r], detail: result.detail };
      }
      if (IDLE_STOPS[r] !== undefined) {
        return {
          kind: 'IDLE',
          phase: IDLE_STOPS[r],
          detail: `${r}${result.detail ? ` (${result.detail})` : ''}`,
        };
      }
      return { kind: 'EXIT', reason: 'UNKNOWN_WORKER_STOP', detail: r };
    }
  }
}

export type CampaignProbe =
  | { readonly kind: 'OK'; readonly facts: CampaignFacts }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'REFUSED'; readonly code: string }
  | { readonly kind: 'UNAVAILABLE'; readonly detail: string };

/** Reads `acquisition status --json` output into what the supervisor acts on. */
export function probeOf(run: CliRun): CampaignProbe {
  const read = parseStatusRun(run);
  if (read.kind === 'UNAVAILABLE') return { kind: 'UNAVAILABLE', detail: read.detail };
  if (read.kind === 'REFUSED') {
    return read.code === 'CAMPAIGN_NOT_FOUND'
      ? { kind: 'NOT_FOUND' }
      : { kind: 'REFUSED', code: read.code };
  }
  return { kind: 'OK', facts: campaignFactsOf(read.status) };
}

/**
 * Before launching, the status decides. A fact the status does not report is
 * UNKNOWN and is left to the worker, which enforces authority itself.
 */
export function decideAfterProbe(probe: CampaignProbe, nowMs: number): Decision {
  switch (probe.kind) {
    case 'UNAVAILABLE':
      return { kind: 'FAILURE', detail: `campaign status unavailable: ${probe.detail}` };
    case 'NOT_FOUND':
      return { kind: 'EXIT', reason: 'CAMPAIGN_NOT_FOUND', detail: null };
    case 'REFUSED':
      return { kind: 'EXIT', reason: 'STATUS_REFUSED', detail: probe.code };
    case 'OK': {
      const f = probe.facts;
      if (f.verified === false) {
        return { kind: 'EXIT', reason: 'CAMPAIGN_UNVERIFIED', detail: f.verificationDetail };
      }
      if (f.controlState === 'STOPPED')
        return { kind: 'EXIT', reason: 'CAMPAIGN_STOPPED', detail: null };
      if (f.controlState === 'EMERGENCY_STOPPED') {
        return { kind: 'EXIT', reason: 'CAMPAIGN_EMERGENCY_STOPPED', detail: null };
      }
      if (f.windowOpen === false) {
        const ends = f.windowEndsAt === null ? Number.NaN : Date.parse(f.windowEndsAt);
        if (!Number.isNaN(ends) && nowMs >= ends) {
          return { kind: 'EXIT', reason: 'CAMPAIGN_WINDOW_CLOSED', detail: f.windowEndsAt };
        }
        return { kind: 'WAIT', phase: 'WAITING_WINDOW_NOT_OPEN', detail: f.windowStartsAt };
      }
      if (f.controlState === 'PAUSED')
        return { kind: 'WAIT', phase: 'WAITING_PAUSED', detail: null };
      if (f.controlState === 'NOT_STARTED') {
        return { kind: 'WAIT', phase: 'WAITING_NOT_STARTED', detail: null };
      }
      return { kind: 'LAUNCH' };
    }
  }
}

/** min(base * 2^n, cap): deterministic, no jitter. */
export function backoffMs(base: number, cap: number, n: number): number {
  return Math.min(base * 2 ** Math.max(0, n), cap);
}

// ---------------------------------------------------------------------------
// The loop.
// ---------------------------------------------------------------------------

export interface SupervisorDeps {
  readonly campaignId: string;
  readonly pid: number;
  readonly clock: RuntimeClock;
  /** Reads `acquisition status --json` for the campaign. */
  readonly readStatus: () => Promise<CliRun>;
  /** Starts `acquisition worker` for the campaign. */
  readonly launchWorker: () => WorkerHandle;
  readonly log: (line: string) => void;
  readonly onState?: (state: SupervisorStateFile) => void;
  readonly policy?: Partial<SupervisorPolicy>;
}

export interface SupervisorExit {
  readonly reason: SupervisorExitReason;
  readonly detail: string | null;
  readonly at: string;
  readonly workerRuns: number;
}

export class Supervisor {
  readonly #deps: SupervisorDeps;
  readonly #policy: SupervisorPolicy;
  readonly #lifetime = new AbortController();
  #wakeController = new AbortController();
  #shutdown = false;
  #worker: WorkerHandle | null = null;
  #idleStreak = 0;
  #state: SupervisorStateFile;

  constructor(deps: SupervisorDeps) {
    this.#deps = deps;
    this.#policy = { ...DEFAULT_SUPERVISOR_POLICY, ...deps.policy };
    const now = this.#iso();
    this.#state = {
      contract: SUPERVISOR_STATE_CONTRACT,
      pid: deps.pid,
      campaignId: deps.campaignId,
      startedAt: now,
      phase: 'STARTING',
      phaseSince: now,
      phaseDetail: null,
      workerPid: null,
      workerRuns: 0,
      consecutiveFailures: 0,
      nextWakeAt: null,
      lastWorkerExit: null,
      exit: null,
      updatedAt: now,
    };
  }

  get state(): SupervisorStateFile {
    return this.#state;
  }

  get shutdownRequested(): boolean {
    return this.#shutdown;
  }

  /** A worker this supervisor launched and has not seen exit. */
  get hasLiveWorker(): boolean {
    return this.#worker !== null;
  }

  /** Cuts the current wait short (a resume, or a control change). */
  wake(): void {
    const old = this.#wakeController;
    this.#wakeController = new AbortController();
    old.abort();
  }

  /** Graceful shutdown: no new worker; the running one finishes its current item. */
  requestShutdown(): void {
    if (this.#shutdown) return;
    this.#shutdown = true;
    this.#deps.log('shutdown requested: the current item finishes and its outcome is recorded');
    const worker = this.#worker;
    if (worker !== null) {
      this.#update({ phase: 'STOPPING', phaseDetail: null });
      worker.terminate('graceful');
      void this.#escalateIfEmergency(worker);
    }
    this.wake();
  }

  async run(): Promise<SupervisorExit> {
    this.#deps.log(`supervisor ${this.#deps.pid} started for campaign ${this.#deps.campaignId}`);
    this.#update({});
    for (;;) {
      if (this.#shutdown) return this.#finish(await this.#shutdownReason(), null);
      this.#update({ phase: 'CHECKING_CAMPAIGN', phaseDetail: null, nextWakeAt: null });
      const probe = probeOf(await this.#deps.readStatus());
      if (this.#shutdown) continue;
      let decision = decideAfterProbe(probe, this.#deps.clock.now());
      if (decision.kind === 'LAUNCH') {
        const result = await this.#runWorker();
        decision = decideAfterWorker(result, this.#shutdown);
        if (result.kind !== 'CRASHED') this.#update({ consecutiveFailures: 0 });
        if (result.kind === 'STOPPED' && (result.processed ?? 0) > 0) this.#idleStreak = 0;
      } else if (decision.kind !== 'FAILURE') {
        this.#update({ consecutiveFailures: 0 });
      }
      switch (decision.kind) {
        case 'LAUNCH':
          break;
        case 'EXIT':
          return decision.reason === 'SHUTDOWN_REQUESTED'
            ? this.#finish(await this.#shutdownReason(), null)
            : this.#finish(decision.reason, decision.detail);
        case 'WAIT':
          this.#idleStreak = 0;
          await this.#wait(decision.phase, decision.detail, this.#policy.waitPollMs);
          break;
        case 'IDLE': {
          const ms = backoffMs(
            this.#policy.idleBackoffBaseMs,
            this.#policy.idleBackoffCapMs,
            this.#idleStreak,
          );
          this.#idleStreak += 1;
          await this.#wait(decision.phase, decision.detail, ms);
          break;
        }
        case 'FAILURE': {
          const failures = this.#state.consecutiveFailures + 1;
          this.#update({ consecutiveFailures: failures });
          this.#deps.log(`failure ${failures}: ${decision.detail}`);
          if (failures >= this.#policy.maxConsecutiveFailures) {
            return this.#finish('REPEATED_FAILURES', decision.detail);
          }
          const ms = backoffMs(
            this.#policy.failureBackoffBaseMs,
            this.#policy.failureBackoffCapMs,
            failures - 1,
          );
          await this.#wait('WAITING_AFTER_FAILURE', decision.detail, ms);
          break;
        }
      }
    }
  }

  async #runWorker(): Promise<WorkerResult> {
    const handle = this.#deps.launchWorker();
    this.#worker = handle;
    this.#update({
      phase: 'RUNNING_WORKER',
      phaseDetail: null,
      workerPid: handle.pid,
      workerRuns: this.#state.workerRuns + 1,
    });
    this.#deps.log(`worker started (pid ${String(handle.pid)})`);
    if (this.#shutdown) handle.terminate('graceful');
    const run = await handle.done;
    this.#worker = null;
    const result = parseWorkerRun(run);
    const reason =
      result.kind === 'STOPPED'
        ? result.stopReason
        : result.kind === 'REFUSED'
          ? result.code
          : 'CRASHED';
    const detail = result.detail;
    const processed = result.kind === 'STOPPED' ? result.processed : null;
    this.#deps.log(
      `worker ${result.kind.toLowerCase()}: ${reason}${detail ? ` (${detail})` : ''}` +
        (processed === null ? '' : `; ${processed} item(s) processed`) +
        (result.kind === 'STOPPED' ? ` ${JSON.stringify(result.outcomes)}` : ''),
    );
    this.#update({
      workerPid: null,
      lastWorkerExit: { at: this.#iso(), kind: result.kind, reason, detail, processed },
    });
    return result;
  }

  async #wait(phase: SupervisorPhase, detail: string | null, ms: number): Promise<void> {
    if (this.#shutdown) return;
    const wakeAt = new Date(this.#deps.clock.now() + ms).toISOString();
    this.#update({ phase, phaseDetail: detail, nextWakeAt: wakeAt });
    this.#deps.log(`${phase}${detail ? ` (${detail})` : ''}; next check at ${wakeAt}`);
    await this.#deps.clock.sleep(ms, this.#wakeController.signal);
  }

  async #shutdownReason(): Promise<SupervisorExitReason> {
    const probe = probeOf(await this.#deps.readStatus());
    if (probe.kind === 'OK' && probe.facts.controlState === 'EMERGENCY_STOPPED') {
      return 'CAMPAIGN_EMERGENCY_STOPPED';
    }
    if (probe.kind === 'OK' && probe.facts.controlState === 'STOPPED') return 'CAMPAIGN_STOPPED';
    return 'SHUTDOWN_REQUESTED';
  }

  async #escalateIfEmergency(worker: WorkerHandle): Promise<void> {
    const probe = probeOf(await this.#deps.readStatus());
    if (probe.kind !== 'OK' || probe.facts.controlState !== 'EMERGENCY_STOPPED') return;
    await this.#deps.clock.sleep(this.#policy.emergencyKillGraceMs, this.#lifetime.signal);
    if (this.#worker === worker) {
      this.#deps.log('EMERGENCY_STOP: the worker did not exit within the grace period; killing it');
      worker.terminate('kill');
    }
  }

  #finish(reason: SupervisorExitReason, detail: string | null): SupervisorExit {
    const at = this.#iso();
    this.#update({
      phase: 'EXITED',
      phaseDetail: null,
      nextWakeAt: null,
      exit: { at, reason, detail },
    });
    this.#deps.log(`supervisor exited: ${reason}${detail ? ` (${detail})` : ''}`);
    this.#lifetime.abort();
    return { reason, detail, at, workerRuns: this.#state.workerRuns };
  }

  #update(patch: Partial<SupervisorStateFile>): void {
    const now = this.#iso();
    const phaseChanged = patch.phase !== undefined && patch.phase !== this.#state.phase;
    this.#state = {
      ...this.#state,
      ...patch,
      ...(phaseChanged ? { phaseSince: now } : {}),
      updatedAt: now,
    };
    this.#deps.onState?.(this.#state);
  }

  #iso(): string {
    return new Date(this.#deps.clock.now()).toISOString();
  }
}

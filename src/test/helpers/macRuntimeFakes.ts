/**
 * WW E-M - FAKES FOR THE MAC RUNTIME TESTS: a clock that advances only when
 * told to, scripted Engine CLI output in the real `nwf-pe.acquisition-cli.v1`
 * shape, a controllable fake worker process, and a fake process port.
 * Nothing here starts a process, opens a socket or touches a database.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RuntimeClock } from '../../runtime/clock.js';
import type { CliRun } from '../../runtime/envelope.js';
import { enginePathsUnder, type EnginePaths } from '../../runtime/paths.js';
import type {
  AcquisitionInvocation,
  ComposeOperation,
  ProcessPort,
  WorkerHandle,
} from '../../runtime/processes.js';

export const T0 = Date.parse('2026-10-27T08:00:00.000Z');
export const CAMPAIGN = '11111111-0000-4000-8000-000000000001';
export const OTHER_CAMPAIGN = '22222222-0000-4000-8000-000000000002';

export interface FakeRuntimeClock extends RuntimeClock {
  advance(ms: number): void;
  readonly pending: number;
}

export function createFakeRuntimeClock(start = T0): FakeRuntimeClock {
  let current = start;
  const pending = new Set<{ deadline: number; resolve: () => void }>();
  return {
    now: () => current,
    sleep(ms, signal) {
      if (signal?.aborted === true || ms <= 0) return Promise.resolve();
      return new Promise((resolve) => {
        const entry = { deadline: current + ms, resolve };
        pending.add(entry);
        signal?.addEventListener(
          'abort',
          () => {
            pending.delete(entry);
            resolve();
          },
          { once: true },
        );
      });
    },
    advance(ms) {
      current += ms;
      const ready = [...pending]
        .filter((p) => p.deadline <= current)
        .sort((a, b) => a.deadline - b.deadline);
      for (const p of ready) {
        pending.delete(p);
        p.resolve();
      }
    },
    get pending() {
      return pending.size;
    },
  };
}

/** Lets every queued promise continuation run. */
export async function flush(rounds = 30): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise((r) => setImmediate(r));
}

export const run = (stdout: unknown, exitCode = 0, signal: string | null = null): CliRun => ({
  exitCode,
  signal,
  stdout: typeof stdout === 'string' ? stdout : `${JSON.stringify(stdout, null, 2)}\n`,
  stderrTail: '',
});

const CLI = 'nwf-pe.acquisition-cli.v1';

export interface StatusDraft {
  controlState?: string;
  verified?: boolean;
  verificationDetail?: string | null;
  startsAt?: string;
  endsAt?: string;
  open?: boolean;
  allowedStages?: string[];
  /** `identityReview.awaiting`. */
  awaiting?: number;
  extra?: Record<string, unknown>;
  /** Top-level v1 fields to leave out. */
  omit?: string[];
}

/** The ADR 0029 queue status, as `nwf-pe.acquisition-status.v1` embeds it under `queue`. */
function queueObject(d: StatusDraft, campaign: Record<string, unknown>): Record<string, unknown> {
  return {
    campaignId: campaign['campaignId'],
    campaignKey: campaign['campaignKey'],
    controlState: campaign['controlState'],
    verification: { verified: campaign['verified'], detail: campaign['verificationDetail'] },
    window: campaign['window'],
    allowedStages: campaign['allowedStages'],
    totals: { workItems: 4, open: 2 },
    stages: {
      DISCOVERED: { ADVANCED: 1 },
      NOMINATED: { PENDING: 1, CLAIMED: 1, LEASE_EXPIRED: 1, ADVANCED: 2 },
      DEDUPLICATED: { PENDING: 2 },
      RESEARCH_PENDING: {},
      RESEARCHED: {},
      IDENTITY_REVIEW: d.awaiting ? { AWAITING_HUMAN: d.awaiting } : {},
      ASSESSABLE: {},
    },
    claimedLive: 1,
    retriesScheduled: 0,
    refusals: { HANDLER_OUTPUT_INVALID: 1 },
    failures: {},
    awaitingHuman: d.awaiting ? { OWNER_IDENTITY_REVIEW: d.awaiting } : {},
    budgets: BUDGETS,
    lastAdvancedAt: '2026-10-27T07:59:00.000Z',
    lastWorkerStop: {
      workerId: 'mac-supervisor',
      reason: 'IDLE',
      detail: null,
      at: '2026-10-27T07:58:00.000Z',
    },
  };
}

const BUDGETS = {
  maxWorkItems: { limit: 500, used: 6, remaining: 494 },
  maxSearchRuns: { limit: 1, used: 1, remaining: 0 },
  maxConcurrency: { limit: 2, used: null, remaining: null },
};

/** A status object in the `nwf-pe.acquisition-status.v1` shape (`acquisitionWiring/status.ts`). */
export function statusObject(d: StatusDraft = {}): Record<string, unknown> {
  const campaign: Record<string, unknown> = {
    campaignId: CAMPAIGN,
    campaignKey: 'test-campaign-mac-v1',
    controlState: d.controlState ?? 'RUNNING',
    verified: d.verified ?? true,
    verificationDetail: d.verificationDetail ?? null,
    window: {
      startsAt: d.startsAt ?? '2026-10-27T00:00:00.000Z',
      endsAt: d.endsAt ?? '2026-10-28T00:00:00.000Z',
      open: d.open ?? true,
    },
    allowedStages: d.allowedStages ?? ['DISCOVERED', 'NOMINATED'],
  };
  const status: Record<string, unknown> = {
    schema: 'nwf-pe.acquisition-status.v1',
    generatedAt: '2026-10-27T08:00:00.000Z',
    campaign,
    discovery: {
      latestRun: {
        runId: '55555555-0000-4000-8000-000000000005',
        kind: 'SEARCH_PROVIDER',
        geography: 'JP',
        startedAt: '2026-10-27T07:00:00.000Z',
        outcome: 'COMPLETED',
      },
      searchRuns: 1,
      linkOutRoots: 0,
    },
    candidates: {
      discovered: 5,
      deduplicated: 2,
      proposed: 0,
      researched: 0,
      duplicatesRefused: 1,
      largeHeiDeprioritised: 0,
    },
    identityReview: { awaiting: d.awaiting ?? 0, released: 0 },
    outbox: { researchExports: 0, manifestEntries: 0, lastWrittenAt: null },
    lastSuccessfulResearchAt: null,
    failures: [
      {
        stage: 'NOMINATED',
        outcome: 'REFUSED_TERMINAL',
        reason: 'HANDLER_OUTPUT_INVALID',
        count: 1,
        explanation: 'A stage produced an output the queue refused; nothing was enqueued.',
      },
    ],
    budgets: BUDGETS,
    queue: queueObject(d, campaign),
    ...d.extra,
  };
  for (const k of d.omit ?? []) delete status[k];
  return status;
}

export const statusRun = (d: StatusDraft = {}): CliRun =>
  run({ contract: CLI, command: 'status', outcome: 'STATUS', status: statusObject(d) });

export const statusRefused = (code: string): CliRun =>
  run({ contract: CLI, command: 'status', outcome: 'REFUSED', code, detail: null }, 1);

export const workerStopped = (
  stopReason: string,
  processed = 0,
  detail: string | null = null,
): CliRun =>
  run({
    contract: CLI,
    command: 'worker',
    outcome: 'STOPPED',
    summary: {
      campaignId: CAMPAIGN,
      workerId: 'mac-supervisor',
      stopReason,
      detail,
      processed,
      outcomes: { ADVANCED: processed },
      superseded: 0,
      stopId: '33333333-0000-4000-8000-000000000003',
    },
  });

export const workerRefused = (code: string, detail: unknown = null): CliRun =>
  run(
    {
      contract: CLI,
      command: 'worker',
      outcome: 'REFUSED',
      code,
      ...(detail === null ? {} : { unwiredStages: detail }),
    },
    1,
  );

export const controlRecorded = (action: string, previousState: string): CliRun =>
  run({
    contract: CLI,
    command: 'campaign control',
    outcome: 'RECORDED',
    campaignId: CAMPAIGN,
    eventId: '44444444-0000-4000-8000-000000000004',
    sequenceNo: 2,
    previousState,
    action,
  });

export const crashed = (): CliRun => ({
  exitCode: 1,
  signal: null,
  stdout: '',
  stderrTail: 'Error: connect ECONNREFUSED',
});

/** A worker process the test finishes by hand. */
export class FakeWorker implements WorkerHandle {
  readonly pid: number;
  readonly terminations: ('graceful' | 'kill')[] = [];
  readonly done: Promise<CliRun>;
  #resolve!: (run: CliRun) => void;
  #reject!: (error: Error) => void;
  finished = false;
  constructor(pid: number) {
    this.pid = pid;
    this.done = new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }
  finish(result: CliRun): void {
    if (this.finished) return;
    this.finished = true;
    this.#resolve(result);
  }
  /** The supervisor loses track of this worker (an unexpected internal failure). */
  fail(error: Error): void {
    if (this.finished) return;
    this.finished = true;
    this.#reject(error);
  }
  terminate(mode: 'graceful' | 'kill'): void {
    this.terminations.push(mode);
  }
}

export interface FakeProcessPort extends ProcessPort {
  readonly calls: AcquisitionInvocation[];
  readonly workers: FakeWorker[];
  readonly composeCalls: ComposeOperation[];
  readonly supervisorSpawns: {
    campaignId: string;
    allowTestDatabase: boolean;
    outboxDir: string | null;
  }[];
  /** The outbox directory each launched worker was given. */
  readonly workerOutboxDirs: (string | null)[];
  status: () => CliRun;
  control: (inv: AcquisitionInvocation) => CliRun;
  composeResult: (op: ComposeOperation) => CliRun;
  onSpawnSupervisor: (campaignId: string) => number | null;
  /** The most workers alive at the same moment. */
  maxConcurrentWorkers: number;
}

export function createFakeProcessPort(): FakeProcessPort {
  let nextPid = 5000;
  let live = 0;
  const port: FakeProcessPort = {
    calls: [],
    workers: [],
    composeCalls: [],
    supervisorSpawns: [],
    workerOutboxDirs: [],
    maxConcurrentWorkers: 0,
    status: () => statusRun(),
    control: (inv) => controlRecorded(inv.kind === 'control' ? inv.action : 'PAUSE', 'RUNNING'),
    composeResult: () => run('{"State":"running","Health":"healthy"}\n'),
    onSpawnSupervisor: () => 4242,
    async acquisition(inv) {
      port.calls.push(inv);
      return inv.kind === 'status' ? port.status() : port.control(inv);
    },
    launchWorker(_campaignId, _workerId, _onStderr, outboxDir = null) {
      port.workerOutboxDirs.push(outboxDir);
      const w = new FakeWorker((nextPid += 1));
      live += 1;
      port.maxConcurrentWorkers = Math.max(port.maxConcurrentWorkers, live);
      void w.done.then(() => {
        live -= 1;
      });
      port.workers.push(w);
      return w;
    },
    async compose(op) {
      port.composeCalls.push(op);
      return port.composeResult(op);
    },
    spawnSupervisor(campaignId, allowTestDatabase, _outFile, outboxDir = null) {
      port.supervisorSpawns.push({ campaignId, allowTestDatabase, outboxDir });
      return port.onSpawnSupervisor(campaignId);
    },
  };
  return port;
}

export function tempEnginePaths(): EnginePaths {
  const root = mkdtempSync(join(tmpdir(), 'nwf-engine-test-'));
  return enginePathsUnder(join(root, 'state'), join(root, 'logs'), join(root, 'LaunchAgents'));
}

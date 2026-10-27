/**
 * WW E-M - the Mac runtime supervisor's state machine, on a fake clock with
 * fake worker processes: idle-restart backoff, pause-wait-resume, stop,
 * emergency stop, crash handling, and never two workers at once.
 */
import { describe, expect, it } from 'vitest';

import { parseWorkerRun } from '../../runtime/envelope.js';
import type { SupervisorStateFile } from '../../runtime/lock.js';
import {
  backoffMs,
  decideAfterProbe,
  decideAfterWorker,
  probeOf,
  Supervisor,
  type SupervisorExit,
} from '../../runtime/supervisor.js';
import {
  CAMPAIGN,
  T0,
  crashed,
  createFakeProcessPort,
  createFakeRuntimeClock,
  flush,
  statusRefused,
  statusRun,
  workerRefused,
  workerStopped,
  type StatusDraft,
} from '../helpers/macRuntimeFakes.js';

function harness(policy = {}, initial: StatusDraft | 'NOT_FOUND' | 'DOWN' = {}) {
  const clock = createFakeRuntimeClock();
  const procs = createFakeProcessPort();
  const states: SupervisorStateFile[] = [];
  const log: string[] = [];
  let status: StatusDraft | 'NOT_FOUND' | 'DOWN' = initial;
  procs.status = () =>
    status === 'NOT_FOUND'
      ? statusRefused('CAMPAIGN_NOT_FOUND')
      : status === 'DOWN'
        ? crashed()
        : statusRun(status);
  const supervisor = new Supervisor({
    campaignId: CAMPAIGN,
    pid: 777,
    clock,
    readStatus: () => procs.acquisition({ kind: 'status', campaignId: CAMPAIGN }),
    launchWorker: () => procs.launchWorker(CAMPAIGN, 'mac-supervisor', () => undefined),
    log: (l) => log.push(l),
    onState: (s) => states.push(s),
    policy,
  });
  let exit: SupervisorExit | null = null;
  const done = supervisor.run().then((e) => {
    exit = e;
    return e;
  });
  return {
    clock,
    procs,
    states,
    log,
    supervisor,
    done,
    get exit() {
      return exit;
    },
    setStatus(s: StatusDraft | 'NOT_FOUND' | 'DOWN') {
      status = s;
    },
    get phase() {
      return supervisor.state.phase;
    },
    lastWorker() {
      return procs.workers[procs.workers.length - 1]!;
    },
  };
}

describe('the decision table', () => {
  it('maps every known worker stop to restart, wait or exit, and an unknown one to exit', () => {
    const d = (r: string, processed = 0) =>
      decideAfterWorker(parseWorkerRun(workerStopped(r, processed)), false);
    for (const r of ['IDLE', 'QUEUE_DRAINED', 'MAX_ITEMS_REACHED', 'ONCE_COMPLETED']) {
      expect(d(r)).toMatchObject({ kind: 'IDLE', phase: 'WAITING_FOR_WORK' });
    }
    expect(d('BACKPRESSURE')).toMatchObject({ kind: 'IDLE', phase: 'WAITING_FOR_HUMAN_REVIEW' });
    expect(d('CAMPAIGN_PAUSED')).toMatchObject({ kind: 'WAIT', phase: 'WAITING_PAUSED' });
    expect(d('CAMPAIGN_NOT_STARTED')).toMatchObject({ kind: 'WAIT', phase: 'WAITING_NOT_STARTED' });
    expect(d('CAMPAIGN_WINDOW_NOT_OPEN')).toMatchObject({
      kind: 'WAIT',
      phase: 'WAITING_WINDOW_NOT_OPEN',
    });
    for (const r of [
      'CAMPAIGN_STOPPED',
      'CAMPAIGN_EMERGENCY_STOPPED',
      'BUDGET_EXHAUSTED',
      'CAMPAIGN_WINDOW_CLOSED',
      'CAMPAIGN_UNVERIFIED',
    ]) {
      expect(d(r)).toEqual({ kind: 'EXIT', reason: r, detail: null });
    }
    expect(d('SOMETHING_NEW')).toEqual({
      kind: 'EXIT',
      reason: 'UNKNOWN_WORKER_STOP',
      detail: 'SOMETHING_NEW',
    });
    expect(d('ABORTED')).toMatchObject({ kind: 'FAILURE' });
    expect(decideAfterWorker(parseWorkerRun(workerStopped('ABORTED')), true)).toMatchObject({
      kind: 'EXIT',
      reason: 'SHUTDOWN_REQUESTED',
    });
    expect(decideAfterWorker(parseWorkerRun(workerStopped('IDLE')), true)).toMatchObject({
      kind: 'EXIT',
      reason: 'SHUTDOWN_REQUESTED',
    });
  });

  it('exits on refusals and treats a crash as a failure', () => {
    expect(
      decideAfterWorker(parseWorkerRun(workerRefused('ACQUISITION_HANDLERS_NOT_WIRED')), false),
    ).toMatchObject({
      kind: 'EXIT',
      reason: 'HANDLERS_NOT_WIRED',
    });
    expect(
      decideAfterWorker(parseWorkerRun(workerRefused('CAMPAIGN_NOT_FOUND')), false),
    ).toMatchObject({ reason: 'CAMPAIGN_NOT_FOUND' });
    expect(decideAfterWorker(parseWorkerRun(workerRefused('LEASE_INVALID')), false)).toMatchObject({
      reason: 'WORKER_REFUSED',
      detail: 'LEASE_INVALID',
    });
    expect(decideAfterWorker(parseWorkerRun(crashed()), false)).toMatchObject({ kind: 'FAILURE' });
    expect(decideAfterWorker(parseWorkerRun(crashed()), true)).toMatchObject({
      kind: 'EXIT',
      reason: 'SHUTDOWN_REQUESTED',
    });
  });

  it('reads the status before launching; unknown facts are left to the worker', () => {
    const p = (d: StatusDraft) => decideAfterProbe(probeOf(statusRun(d)), T0);
    expect(p({})).toEqual({ kind: 'LAUNCH' });
    expect(p({ verified: false, verificationDetail: 'KEY_UNKNOWN' })).toEqual({
      kind: 'EXIT',
      reason: 'CAMPAIGN_UNVERIFIED',
      detail: 'KEY_UNKNOWN',
    });
    expect(p({ controlState: 'PAUSED' })).toMatchObject({ kind: 'WAIT', phase: 'WAITING_PAUSED' });
    expect(p({ controlState: 'NOT_STARTED' })).toMatchObject({
      kind: 'WAIT',
      phase: 'WAITING_NOT_STARTED',
    });
    expect(p({ controlState: 'STOPPED' })).toMatchObject({
      kind: 'EXIT',
      reason: 'CAMPAIGN_STOPPED',
    });
    expect(p({ controlState: 'EMERGENCY_STOPPED' })).toMatchObject({
      kind: 'EXIT',
      reason: 'CAMPAIGN_EMERGENCY_STOPPED',
    });
    expect(
      p({ open: false, startsAt: '2026-10-28T00:00:00.000Z', endsAt: '2026-10-29T00:00:00.000Z' }),
    ).toMatchObject({
      kind: 'WAIT',
      phase: 'WAITING_WINDOW_NOT_OPEN',
    });
    expect(p({ open: false, endsAt: '2026-10-27T07:00:00.000Z' })).toMatchObject({
      kind: 'EXIT',
      reason: 'CAMPAIGN_WINDOW_CLOSED',
    });
    expect(p({ omit: ['verification', 'window'] })).toEqual({ kind: 'LAUNCH' });
    expect(decideAfterProbe(probeOf(statusRefused('CAMPAIGN_NOT_FOUND')), T0)).toMatchObject({
      reason: 'CAMPAIGN_NOT_FOUND',
    });
    expect(decideAfterProbe(probeOf(crashed()), T0)).toMatchObject({ kind: 'FAILURE' });
  });

  it('backs off deterministically, doubling to a cap', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => backoffMs(30_000, 900_000, n))).toEqual([
      30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 900_000,
    ]);
  });
});

describe('the supervisor loop', () => {
  it('restarts an IDLE worker after a growing, capped backoff, and resets it after progress', async () => {
    const h = harness();
    await flush();
    expect(h.procs.workers).toHaveLength(1);
    const waits: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      h.lastWorker().finish(workerStopped('IDLE'));
      await flush();
      expect(h.phase).toBe('WAITING_FOR_WORK');
      const ms = Date.parse(h.supervisor.state.nextWakeAt!) - h.clock.now();
      waits.push(ms);
      h.clock.advance(ms - 1);
      await flush();
      expect(h.procs.workers).toHaveLength(i + 1);
      h.clock.advance(1);
      await flush();
      expect(h.procs.workers).toHaveLength(i + 2);
    }
    expect(waits).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 900_000]);
    h.lastWorker().finish(workerStopped('IDLE', 3));
    await flush();
    expect(Date.parse(h.supervisor.state.nextWakeAt!) - h.clock.now()).toBe(30_000);
    expect(h.procs.maxConcurrentWorkers).toBe(1);
    h.supervisor.requestShutdown();
    await h.done;
    expect(h.exit!.reason).toBe('SHUTDOWN_REQUESTED');
  });

  it('waits while PAUSED without starting a worker, and resumes at once on wake()', async () => {
    const h = harness();
    await flush();
    h.setStatus({ controlState: 'PAUSED' });
    h.lastWorker().finish(workerStopped('CAMPAIGN_PAUSED', 2));
    await flush();
    expect(h.phase).toBe('WAITING_PAUSED');
    for (let i = 0; i < 5; i += 1) {
      h.clock.advance(60_000);
      await flush();
      expect(h.phase).toBe('WAITING_PAUSED');
    }
    expect(h.procs.workers).toHaveLength(1);
    const statusReads = h.procs.calls.filter((c) => c.kind === 'status').length;
    expect(statusReads).toBe(6);
    h.setStatus({ controlState: 'RUNNING' });
    h.supervisor.wake();
    await flush();
    expect(h.phase).toBe('RUNNING_WORKER');
    expect(h.procs.workers).toHaveLength(2);
    h.supervisor.requestShutdown();
    expect(h.lastWorker().terminations).toEqual(['graceful']);
    h.lastWorker().finish(workerStopped('ABORTED', 1));
    await h.done;
    expect(h.exit!.reason).toBe('SHUTDOWN_REQUESTED');
  });

  it('also waits for NOT_STARTED and a window that has not opened, and resumes on its own poll', async () => {
    const h = harness({}, { controlState: 'NOT_STARTED' });
    await flush();
    expect(h.phase).toBe('WAITING_NOT_STARTED');
    expect(h.procs.workers).toHaveLength(0);
    h.setStatus({ open: false, startsAt: '2026-10-27T09:00:00.000Z' });
    h.clock.advance(60_000);
    await flush();
    expect(h.phase).toBe('WAITING_WINDOW_NOT_OPEN');
    h.setStatus({});
    h.clock.advance(60_000);
    await flush();
    expect(h.phase).toBe('RUNNING_WORKER');
    h.lastWorker().finish(workerStopped('CAMPAIGN_STOPPED', 1));
    await h.done;
    expect(h.exit).toMatchObject({ reason: 'CAMPAIGN_STOPPED', workerRuns: 1 });
  });

  it('exits for good on STOP, budget exhaustion, a closed window, an unverifiable or missing campaign', async () => {
    for (const reason of [
      'CAMPAIGN_STOPPED',
      'BUDGET_EXHAUSTED',
      'CAMPAIGN_WINDOW_CLOSED',
      'CAMPAIGN_UNVERIFIED',
    ]) {
      const h = harness();
      await flush();
      h.lastWorker().finish(
        workerStopped(reason, 0, reason === 'BUDGET_EXHAUSTED' ? 'maxSearchRuns' : null),
      );
      await h.done;
      expect(h.exit!.reason).toBe(reason);
      expect(h.states.at(-1)).toMatchObject({ phase: 'EXITED', exit: { reason } });
    }
    const unverified = harness({}, { verified: false, verificationDetail: 'KEY_UNKNOWN' });
    await unverified.done;
    expect(unverified.exit).toMatchObject({
      reason: 'CAMPAIGN_UNVERIFIED',
      detail: 'KEY_UNKNOWN',
      workerRuns: 0,
    });
    const missing = harness({}, 'NOT_FOUND');
    await missing.done;
    expect(missing.exit).toMatchObject({ reason: 'CAMPAIGN_NOT_FOUND', workerRuns: 0 });
  });

  it('exits HANDLERS_NOT_WIRED when the production worker refuses, after exactly one attempt', async () => {
    const h = harness();
    await flush();
    h.lastWorker().finish(workerRefused('ACQUISITION_HANDLERS_NOT_WIRED', ['DISCOVERED']));
    await h.done;
    expect(h.exit).toMatchObject({ reason: 'HANDLERS_NOT_WIRED', workerRuns: 1 });
    expect(h.procs.workers).toHaveLength(1);
  });

  it('EMERGENCY_STOP + shutdown: graceful first, SIGKILL only after the grace period', async () => {
    const h = harness({ emergencyKillGraceMs: 60_000 });
    await flush();
    const w = h.lastWorker();
    h.setStatus({ controlState: 'EMERGENCY_STOPPED' });
    h.supervisor.requestShutdown();
    await flush();
    expect(h.phase).toBe('STOPPING');
    expect(w.terminations).toEqual(['graceful']);
    h.clock.advance(59_999);
    await flush();
    expect(w.terminations).toEqual(['graceful']);
    h.clock.advance(1);
    await flush();
    expect(w.terminations).toEqual(['graceful', 'kill']);
    w.finish({ exitCode: null, signal: 'SIGKILL', stdout: '', stderrTail: '' });
    await h.done;
    expect(h.exit!.reason).toBe('CAMPAIGN_EMERGENCY_STOPPED');
  });

  it('EMERGENCY_STOP with a worker that exits promptly is never killed', async () => {
    const h = harness();
    await flush();
    const w = h.lastWorker();
    h.setStatus({ controlState: 'EMERGENCY_STOPPED' });
    h.supervisor.requestShutdown();
    await flush();
    w.finish(workerStopped('ABORTED', 1));
    await h.done;
    h.clock.advance(10 * 60_000);
    await flush();
    expect(w.terminations).toEqual(['graceful']);
    expect(h.exit!.reason).toBe('CAMPAIGN_EMERGENCY_STOPPED');
  });

  it('graceful shutdown of a RUNNING campaign never kills the worker, however long its item takes', async () => {
    const h = harness();
    await flush();
    const w = h.lastWorker();
    h.supervisor.requestShutdown();
    h.clock.advance(3 * 3600_000);
    await flush();
    expect(w.terminations).toEqual(['graceful']);
    expect(h.exit).toBeNull();
    w.finish(workerStopped('ABORTED', 1));
    await h.done;
    expect(h.exit!.reason).toBe('SHUTDOWN_REQUESTED');
  });

  it('restarts after a crash with a capped backoff, and gives up after repeated failures', async () => {
    const h = harness({ maxConsecutiveFailures: 4 });
    await flush();
    h.lastWorker().finish(crashed());
    await flush();
    expect(h.phase).toBe('WAITING_AFTER_FAILURE');
    expect(h.supervisor.state.consecutiveFailures).toBe(1);
    h.clock.advance(10_000);
    await flush();
    // A successful run resets the count.
    h.lastWorker().finish(workerStopped('IDLE', 1));
    await flush();
    expect(h.supervisor.state.consecutiveFailures).toBe(0);
    h.setStatus('DOWN');
    for (const wait of [30_000, 10_000, 20_000, 40_000]) {
      h.clock.advance(wait);
      await flush();
    }
    await h.done;
    expect(h.exit).toMatchObject({ reason: 'REPEATED_FAILURES' });
    expect(h.supervisor.state.consecutiveFailures).toBe(4);
    expect(h.procs.workers).toHaveLength(2);
  });

  it('never runs two workers at once across a long mixed scenario', async () => {
    const h = harness();
    await flush();
    const script = ['IDLE', 'CAMPAIGN_PAUSED', 'IDLE', 'BACKPRESSURE', 'QUEUE_DRAINED'];
    for (const r of script) {
      if (r === 'CAMPAIGN_PAUSED') h.setStatus({ controlState: 'PAUSED' });
      h.lastWorker().finish(workerStopped(r, 1));
      await flush();
      h.setStatus({});
      h.supervisor.wake();
      await flush();
      h.clock.advance(15 * 60_000);
      await flush();
    }
    expect(h.procs.maxConcurrentWorkers).toBe(1);
    expect(h.procs.workers.length).toBe(script.length + 1);
    h.supervisor.requestShutdown();
    h.lastWorker().finish(workerStopped('ABORTED'));
    await h.done;
  });
});

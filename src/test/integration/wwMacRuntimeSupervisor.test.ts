/**
 * WW E-M - the Mac runtime supervisor against a DISPOSABLE PostgreSQL.
 *
 * The supervisor and the `nwf-engine` commands run in-process; the Engine CLI
 * they call (`acquisition status | campaign control`) is the REAL one,
 * dispatched in-process with a TEST_ONLY campaign trust set; the worker is
 * the REAL `runWorker` with SCRIPTED stage handlers (the test-only seam -
 * production still wires none). Two cases cross a real process boundary and
 * prove production refuses: the real status (operational, EMPTY trust set)
 * and the real worker CLI. Nothing reaches a network, a model or a real
 * organisation; every campaign is signed by an in-memory TEST_ONLY key.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runAcquisitionCli } from '../../cli/commands/acquisition.js';
import { testDatabaseUrl } from '../../config/env.js';
import {
  WorkerConfigRefusal,
  claimNextWorkItem,
  deriveCampaignAuthority,
  recordCampaign,
  recordControlEvent,
  runWorker,
  type StageHandler,
  type StageOutcome,
} from '../../orgunits/acquisition/index.js';
import { realRuntimeClock } from '../../runtime/clock.js';
import { runEngine, type EngineDeps, type EngineSignal } from '../../runtime/commands.js';
import type { CliRun } from '../../runtime/envelope.js';
import { acquireLock, readSupervisorState, writeSupervisorState } from '../../runtime/lock.js';
import { engineRepoRoot } from '../../runtime/paths.js';
import {
  acquisitionArgv,
  createProcessPort,
  type ProcessPort,
  type WorkerHandle,
} from '../../runtime/processes.js';
import { Supervisor } from '../../runtime/supervisor.js';
import {
  campaignTrustEntry,
  signedCampaign,
  testCampaignKey,
  testCampaignTrust,
} from '../helpers/acquisitionCampaignFixtures.js';
import { tempEnginePaths } from '../helpers/macRuntimeFakes.js';
import { adminPool, databaseConfigured } from './helpers.js';

const describeDb = databaseConfigured() ? describe : describe.skip;

const SUFFIX = randomBytes(4).toString('hex');
const WORKER_LOGIN = `nwf_acq_mac_${SUFFIX}`;
const PASSWORD = randomBytes(24).toString('hex');
const KEY = testCampaignKey();
const TRUST = testCampaignTrust(campaignTrustEntry(KEY));
const SUPERVISOR_PID = 900_001;
const DOMAINS = [
  'alpha-org.example',
  'bravo-org.example',
  'charlie-org.example',
  'delta-org.example',
  'echo-org.example',
  'foxtrot-org.example',
];
const POLICY = {
  idleBackoffBaseMs: 50,
  idleBackoffCapMs: 200,
  failureBackoffBaseMs: 50,
  failureBackoffCapMs: 200,
  waitPollMs: 100,
  emergencyKillGraceMs: 2000,
};

function urlFor(login: string, password: string, base = testDatabaseUrl('admin')!): string {
  const url = new URL(base);
  url.username = login;
  url.password = password;
  return url.toString();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(
  what: string,
  fn: () => Promise<boolean> | boolean,
  ms = 20_000,
): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await sleep(25);
  }
  throw new Error(`timed out waiting for: ${what}`);
}

describeDb('WW E-M Mac runtime supervisor (integration)', () => {
  let admin: pg.Pool;
  let worker: pg.Pool;
  let environmentId: string;
  const workerUrl = () => urlFor(WORKER_LOGIN, PASSWORD);
  const readonlyUrl = () => testDatabaseUrl('readonly')!;

  beforeAll(async () => {
    admin = adminPool();
    await admin.query(`CREATE ROLE ${WORKER_LOGIN} LOGIN PASSWORD '${PASSWORD}'`);
    await admin.query(`GRANT nwf_acquisition_worker TO ${WORKER_LOGIN}`);
    worker = new pg.Pool({ connectionString: workerUrl(), max: 4 });
    const { rows } = await admin.query<{ id: string }>(
      'SELECT environment_id AS id FROM subject_review_environment',
    );
    environmentId = rows[0]!.id;
  });

  afterAll(async () => {
    await worker?.end();
    await admin.query(`DROP OWNED BY ${WORKER_LOGIN}`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${WORKER_LOGIN}`);
    await admin?.end();
  });

  beforeEach(async () => {
    await admin.query(
      // Migration 0024 (WW E-W) adds tables that reference the 0023 queue.
      // R2 (migration 0029): continuation adoptions reference campaigns and items too.
      `TRUNCATE acquisition_campaign_continuations,
                acquisition_claim_lease_extensions, acquisition_outbox_entries,
                acquisition_signals, acquisition_campaign_subjects,
                subject_research_admission_revocations, subject_research_admissions,
                acquisition_worker_stops, acquisition_work_outcomes, acquisition_work_claims,
                acquisition_work_items, acquisition_campaign_control_events, acquisition_campaigns
                CASCADE`,
    );
  });

  async function startedCampaign(): Promise<string> {
    const text = signedCampaign(KEY, {
      environmentId,
      stages: ['DISCOVERED', 'NOMINATED'],
      searchGrantIds: [randomUUID()],
    });
    const { campaignId } = await recordCampaign(
      admin,
      Buffer.from(text),
      { actorKey: 'owner-cli' },
      { trust: TRUST },
    );
    await recordControlEvent(
      admin,
      { campaignId, action: 'START', actorKey: 'owner-cli' },
      { trust: TRUST },
    );
    return campaignId;
  }

  /** Scripted handlers: DISCOVERED nominates six fictitious domains; NOMINATED advances each once. */
  function scripted(options: { nominatedDelayMs?: number; blockNominated?: boolean } = {}) {
    const executions: string[] = [];
    const handlers: StageHandler[] = [
      {
        stage: 'DISCOVERED',
        async handle(_item, ctx): Promise<StageOutcome> {
          ctx.consume('searchRuns', 1);
          return {
            kind: 'ADVANCED',
            next: 'NOMINATED',
            children: DOMAINS.map((d) => ({
              subjectKind: 'NOMINATION' as const,
              subjectId: randomUUID(),
              registrableDomain: d,
            })),
          };
        },
      },
      {
        stage: 'NOMINATED',
        async handle(item, ctx): Promise<StageOutcome> {
          executions.push(item.subjectId);
          if (options.blockNominated === true) {
            await new Promise<void>((resolve) =>
              ctx.signal.addEventListener('abort', () => resolve(), { once: true }),
            );
          } else {
            await sleep(options.nominatedDelayMs ?? 40);
          }
          return { kind: 'ADVANCED', next: 'DEDUPLICATED' };
        },
      },
    ];
    return { handlers, executions };
  }

  /** The REAL Engine CLI, dispatched in-process with the TEST_ONLY trust set. */
  async function cli(argv: readonly string[]): Promise<CliRun> {
    let stdout = '';
    let stderr = '';
    const exitCode = await runAcquisitionCli(argv, {
      ownerPool: () => adminPool(),
      readonlyPool: () => new pg.Pool({ connectionString: readonlyUrl(), max: 2 }),
      trust: TRUST,
      out: (t) => {
        stdout += t;
      },
      err: (t) => {
        stderr += t;
      },
    });
    return { exitCode, signal: null, stdout, stderrTail: stderr };
  }

  /** The test-only worker seam: the REAL runWorker with scripted handlers, as a WorkerHandle. */
  function inProcessWorker(
    campaignId: string,
    workerId: string,
    handlers: readonly StageHandler[],
  ): WorkerHandle {
    const controller = new AbortController();
    const done = runWorker({
      pool: worker,
      campaignId,
      workerId,
      handlers,
      trust: TRUST,
      signal: controller.signal,
      idleSleepMs: 20,
      idleTimeoutMs: 300,
      controlPollMs: 20,
    }).then(
      (summary): CliRun => ({
        exitCode: 0,
        signal: null,
        stdout: JSON.stringify({
          contract: 'nwf-pe.acquisition-cli.v1',
          command: 'worker',
          outcome: 'STOPPED',
          summary,
        }),
        stderrTail: '',
      }),
      (error: unknown): CliRun =>
        error instanceof WorkerConfigRefusal
          ? {
              exitCode: 1,
              signal: null,
              stdout: JSON.stringify({
                contract: 'nwf-pe.acquisition-cli.v1',
                command: 'worker',
                outcome: 'REFUSED',
                code: error.code,
                detail: error.detail,
              }),
              stderrTail: '',
            }
          : { exitCode: 1, signal: null, stdout: '', stderrTail: String(error) },
    );
    return { pid: null, done, terminate: () => controller.abort() };
  }

  function inProcessPort(handlers: readonly StageHandler[]): ProcessPort {
    return {
      acquisition: (inv) => cli(acquisitionArgv(inv).slice(1)),
      launchWorker: (campaignId, workerId) => inProcessWorker(campaignId, workerId, handlers),
      compose: async () => {
        throw new Error('docker is never called in this test');
      },
      // Boot time not known here: liveness is the pid alone (the H-RT fallback).
      bootTime: async () => ({ exitCode: 1, signal: null, stdout: '', stderrTail: 'not read' }),
      spawnSupervisor: () => {
        throw new Error('no detached process in this test');
      },
    };
  }

  function engine(procs: ProcessPort) {
    const paths = tempEnginePaths();
    const handlers: Partial<Record<string, () => void>> = {};
    const out: string[] = [];
    let supervising = false;
    const test = testDatabaseUrl('admin')!;
    const deps: EngineDeps = {
      paths,
      // WW H-RT: the supervisor checks every connection string the wired
      // worker uses. The stage-handler logins are never connected here (the
      // handlers are scripted), so they only need to name the same database.
      urls: {
        DATABASE_URL_ADMIN: test,
        DATABASE_URL_READONLY: readonlyUrl(),
        DATABASE_URL_ACQUISITION_WORKER: workerUrl(),
        DATABASE_URL_SOURCE_DISCOVERY: urlFor('nwf_source_discovery', PASSWORD),
        DATABASE_URL_DISCOVERY_SUBJECT_WRITER: urlFor('nwf_discovery_subject_writer', PASSWORD),
        DATABASE_URL_RESEARCH: urlFor('nwf_research', PASSWORD),
      },
      procs,
      clock: realRuntimeClock,
      pid: SUPERVISOR_PID,
      nodePath: process.execPath,
      isAlive: (pid) => pid === SUPERVISOR_PID && supervising,
      signal: (pid: number, sig: EngineSignal) => {
        if (pid !== SUPERVISOR_PID || !supervising) return false;
        handlers[sig]?.();
        return true;
      },
      onSignals: (h) => {
        Object.assign(handlers, h);
        return () => {
          for (const k of Object.keys(h)) delete handlers[k];
        };
      },
      doctor: () => {
        throw new Error('doctor is not part of this test');
      },
      out: (t) => out.push(t),
      err: (t) => out.push(t),
      supervisorPolicy: POLICY,
    };
    return {
      paths,
      out,
      run: (...argv: string[]) =>
        runEngine(
          [
            ...argv,
            ...(argv[0] === 'shutdown' || argv[0] === 'logs' ? [] : ['--allow-test-database']),
          ],
          deps,
        ),
      supervise(campaignId: string): Promise<number> {
        supervising = true;
        return runEngine(
          ['supervise', '--campaign-id', campaignId, '--allow-test-database'],
          deps,
        ).finally(() => {
          supervising = false;
        });
      },
      phase: () => readSupervisorState(paths)?.phase ?? null,
    };
  }

  const count = async (sql: string, params: unknown[] = []): Promise<number> =>
    (await admin.query<{ n: number }>(sql, params)).rows[0]!.n;
  const advancedAt = (stage: string) =>
    count(
      `SELECT count(*)::int AS n FROM acquisition_work_outcomes o JOIN acquisition_work_items i ON i.id = o.work_item_id
        WHERE o.outcome = 'ADVANCED' AND i.stage = $1`,
      [stage],
    );
  const duplicateAdvanced = () =>
    count(
      `SELECT count(*)::int AS n FROM (SELECT work_item_id FROM acquisition_work_outcomes
        WHERE outcome = 'ADVANCED' GROUP BY work_item_id HAVING count(*) > 1) d`,
    );
  const claimsWithoutOutcome = () =>
    count(
      `SELECT count(*)::int AS n FROM acquisition_work_claims c
        WHERE NOT EXISTS (SELECT 1 FROM acquisition_work_outcomes o WHERE o.claim_id = c.id)`,
    );

  it('processes queued work; pause -> resume -> shutdown -> restart finishes it with no duplicate ADVANCED', async () => {
    const campaignId = await startedCampaign();
    const { handlers, executions } = scripted({ nominatedDelayMs: 150 });
    const e = engine(inProcessPort(handlers));

    let supervising = e.supervise(campaignId);
    await until('two nominations advanced', async () => (await advancedAt('NOMINATED')) >= 2);
    expect(await advancedAt('DISCOVERED')).toBe(1);

    // PAUSE through nwf-engine (owner path, real CLI), then the supervisor waits without a worker.
    const pauseCode = await e.run('pause', '--reason', 'integration pause');
    expect(e.out.join(''), 'pause output').toContain('RECORDED PAUSE');
    expect(pauseCode).toBe(0);
    await until('supervisor waiting while paused', () => e.phase() === 'WAITING_PAUSED');
    const pausedAt = await count('SELECT count(*)::int AS n FROM acquisition_work_outcomes');
    expect(await claimsWithoutOutcome()).toBe(0);
    const runsWhilePaused = readSupervisorState(e.paths)!.workerRuns;
    await sleep(400);
    expect(await count('SELECT count(*)::int AS n FROM acquisition_work_outcomes')).toBe(pausedAt);
    // It re-reads the status every poll, but never starts a worker while paused.
    expect(['WAITING_PAUSED', 'CHECKING_CAMPAIGN']).toContain(e.phase());
    expect(readSupervisorState(e.paths)!.workerRuns).toBe(runsWhilePaused);

    // RESUME wakes it at once.
    const pausedNominated = await advancedAt('NOMINATED');
    expect(await e.run('resume')).toBe(0);
    await until(
      'work continues after resume',
      async () => (await advancedAt('NOMINATED')) > pausedNominated,
    );

    // Graceful shutdown mid-run: the current item finishes and its outcome is recorded.
    expect(await e.run('shutdown')).toBe(0);
    expect(await supervising).toBe(0);
    expect(readSupervisorState(e.paths)).toMatchObject({
      phase: 'EXITED',
      exit: { reason: 'SHUTDOWN_REQUESTED' },
    });
    expect(await claimsWithoutOutcome()).toBe(0);
    const beforeRestart = await advancedAt('NOMINATED');
    expect(beforeRestart).toBeLessThan(DOMAINS.length);

    // Restart: the remaining work completes; nothing is executed twice.
    supervising = e.supervise(campaignId);
    await until(
      'every nomination advanced',
      async () => (await advancedAt('NOMINATED')) === DOMAINS.length,
    );
    await until('supervisor idle after the queue drained', () => e.phase() === 'WAITING_FOR_WORK');
    expect(await e.run('shutdown')).toBe(0);
    expect(await supervising).toBe(0);

    expect(await duplicateAdvanced()).toBe(0);
    expect(await claimsWithoutOutcome()).toBe(0);
    expect(executions).toHaveLength(DOMAINS.length);
    expect(new Set(executions).size).toBe(DOMAINS.length);
    // Queue and results survive: 1 root + 6 nominations + 6 de-duplication items.
    expect(await count('SELECT count(*)::int AS n FROM acquisition_work_items')).toBe(
      1 + 2 * DOMAINS.length,
    );
    const stops = (
      await admin.query<{ stop_reason: string }>('SELECT stop_reason FROM acquisition_worker_stops')
    ).rows.map((r) => r.stop_reason);
    expect(stops).toEqual(expect.arrayContaining(['CAMPAIGN_PAUSED', 'ABORTED', 'QUEUE_DRAINED']));
    // status renders the same campaign from the real CLI output.
    e.out.length = 0;
    expect(await e.run('status', '--campaign-id', campaignId)).toBe(0);
    const text = e.out.join('');
    expect(text).toContain('Status contract              nwf-pe.acquisition-status.v1');
    expect(text).toContain('Candidates discovered        6  (nominations; items at NOMINATED)');
    expect(text).toContain('Control state                RUNNING');
  });

  it('crash -> recover -> restart: an orphaned claim expires and is retried, and ADVANCED stays unique', async () => {
    const campaignId = await startedCampaign();
    const { handlers, executions } = scripted({ nominatedDelayMs: 10 });
    const e = engine(inProcessPort(handlers));

    // Discover first, then stop, leaving six nominations queued.
    const first = e.supervise(campaignId);
    await until('nominations queued', async () => (await advancedAt('DISCOVERED')) === 1);
    expect(await e.run('pause')).toBe(0);
    await until('paused', () => e.phase() === 'WAITING_PAUSED');
    expect(await e.run('shutdown')).toBe(0);
    await first;
    await recordControlEvent(
      admin,
      { campaignId, action: 'RESUME', actorKey: 'owner-cli' },
      { trust: TRUST },
    );

    // A "crashed" supervisor: its worker claimed one item and died before recording an outcome.
    const derived = await deriveCampaignAuthority(worker, campaignId, { trust: TRUST });
    if (!derived.ok) throw new Error(derived.code);
    const orphan = await claimNextWorkItem(worker, derived.authority, {
      workerId: 'mac-supervisor',
      leaseSeconds: 1,
    });
    expect(orphan.kind).toBe('CLAIMED');
    acquireLock(
      e.paths,
      { pid: 424_242, campaignId, startedAt: new Date().toISOString(), nonce: 'n424242' },
      () => true,
    );
    writeSupervisorState(e.paths, {
      ...readSupervisorState(e.paths)!,
      pid: 424_242,
      workerPid: 424_243,
      exit: null,
      phase: 'RUNNING_WORKER',
    });

    // start would refuse the stale lock; recover clears it (nothing is alive) and deletes no data.
    expect(await e.run('recover')).toBe(0);
    expect(e.out.join('')).toContain('Recovered');
    await sleep(1100);

    const restarted = e.supervise(campaignId);
    await until(
      'every nomination advanced',
      async () => (await advancedAt('NOMINATED')) === DOMAINS.length,
    );
    expect(await e.run('shutdown')).toBe(0);
    await restarted;

    expect(await duplicateAdvanced()).toBe(0);
    expect(executions).toHaveLength(DOMAINS.length);
    if (orphan.kind === 'CLAIMED') {
      const attempts = await admin.query<{ attempt_no: number; outcome: string | null }>(
        `SELECT c.attempt_no, o.outcome FROM acquisition_work_claims c
           LEFT JOIN acquisition_work_outcomes o ON o.claim_id = c.id
          WHERE c.work_item_id = $1 ORDER BY c.attempt_no`,
        [orphan.claim.item.id],
      );
      expect(attempts.rows).toEqual([
        { attempt_no: 1, outcome: null },
        { attempt_no: 2, outcome: 'ADVANCED' },
      ]);
    }
  });

  it('stop --emergency aborts the running handler, records the refusal and exits the supervisor for good', async () => {
    const campaignId = await startedCampaign();
    const { handlers } = scripted({ blockNominated: true });
    const e = engine(inProcessPort(handlers));
    const supervising = e.supervise(campaignId);
    await until(
      'a nomination handler is running',
      async () =>
        (await count(
          "SELECT count(*)::int AS n FROM acquisition_work_item_states WHERE state = 'CLAIMED' AND stage = 'NOMINATED'",
        )) >= 1,
    );
    expect(await e.run('stop', '--emergency')).toBe(0);
    expect(await supervising).toBe(0);
    expect(readSupervisorState(e.paths)).toMatchObject({
      exit: { reason: 'CAMPAIGN_EMERGENCY_STOPPED' },
    });
    const refused = await count(
      "SELECT count(*)::int AS n FROM acquisition_work_outcomes WHERE outcome = 'REFUSED_TERMINAL' AND refusal_reason = 'CAMPAIGN_EMERGENCY_STOPPED'",
    );
    expect(refused).toBeGreaterThanOrEqual(1);
    expect(await claimsWithoutOutcome()).toBe(0);
    // A new start sees a campaign that is over.
    const again = await e.supervise(campaignId);
    expect(again).toBe(0);
    expect(readSupervisorState(e.paths)).toMatchObject({
      exit: { reason: 'CAMPAIGN_EMERGENCY_STOPPED' },
      workerRuns: 0,
    });
  });

  it('production refuses across a real process boundary: the empty trust set, status and worker alike', async () => {
    const campaignId = await startedCampaign();
    const saved = { ...process.env };
    process.env['DATABASE_URL_READONLY'] = readonlyUrl();
    process.env['DATABASE_URL_ACQUISITION_WORKER'] = workerUrl();
    try {
      const real = createProcessPort(engineRepoRoot());
      // The real `acquisition status` verifies under the OPERATIONAL (empty) trust set.
      const prod = new Supervisor({
        campaignId,
        pid: SUPERVISOR_PID,
        clock: realRuntimeClock,
        readStatus: () => real.acquisition({ kind: 'status', campaignId }),
        launchWorker: () => real.launchWorker(campaignId, 'mac-supervisor', () => undefined),
        log: () => undefined,
        policy: POLICY,
      });
      expect(await prod.run()).toMatchObject({ reason: 'CAMPAIGN_UNVERIFIED', workerRuns: 0 });

      // Even launched directly, the real worker CLI claims nothing: E-W wired
      // the production stage handlers, so it starts - and stops at once,
      // because the test-signed campaign does not verify under the
      // operational (empty) campaign trust set.
      const launched = new Supervisor({
        campaignId,
        pid: SUPERVISOR_PID,
        clock: realRuntimeClock,
        readStatus: () => cli(['status', '--campaign-id', campaignId, '--json']),
        launchWorker: () => real.launchWorker(campaignId, 'mac-supervisor', () => undefined),
        log: () => undefined,
        policy: POLICY,
      });
      const exit = await launched.run();
      expect(exit).toMatchObject({ reason: 'CAMPAIGN_UNVERIFIED', workerRuns: 1 });
      expect(await count('SELECT count(*)::int AS n FROM acquisition_work_claims')).toBe(0);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  }, 60_000);
});

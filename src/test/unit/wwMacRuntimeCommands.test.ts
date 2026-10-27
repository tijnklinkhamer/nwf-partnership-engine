/**
 * WW E-M - the `nwf-engine` commands against fake ports in temporary
 * directories: doctor, start, the single-instance lock, crash -> recover ->
 * start, pause/resume/stop/shutdown, logs, and the LaunchAgent generator.
 * No real process, Docker, launchd or database is touched.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { RuntimeClock } from '../../runtime/clock.js';
import { runEngine, type EngineDeps, type EngineSignal } from '../../runtime/commands.js';
import {
  compareLedger,
  parseComposePs,
  runDoctor,
  runbookFor,
  type DoctorDeps,
  type LedgerRead,
} from '../../runtime/doctor.js';
import { launchAgentPlist } from '../../runtime/launchAgent.js';
import {
  acquireLock,
  readConfig,
  readSupervisorState,
  writeConfig,
  writeSupervisorState,
  type SupervisorStateFile,
} from '../../runtime/lock.js';
import { createRotatingLog, tailLines } from '../../runtime/logs.js';
import type { EnginePaths } from '../../runtime/paths.js';
import {
  CAMPAIGN,
  OTHER_CAMPAIGN,
  T0,
  createFakeProcessPort,
  createFakeRuntimeClock,
  flush,
  run,
  tempEnginePaths,
  workerStopped,
  type FakeProcessPort,
} from '../helpers/macRuntimeFakes.js';

const URL = (db = 'nwf_pe') => `postgres://u:p@127.0.0.1:55432/${db}`;
const URLS = {
  DATABASE_URL_ADMIN: URL(),
  DATABASE_URL_READONLY: URL(),
  DATABASE_URL_ACQUISITION_WORKER: URL(),
};
const BUILD = [
  { version: '0001', file: '0001_a.sql', checksum: 'aa' },
  { version: '0002', file: '0002_b.sql', checksum: 'bb' },
  { version: '0022', file: '0022_c.sql', checksum: 'cc' },
];

function doctorDeps(over: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    nodeVersion: 'v24.18.0',
    urls: URLS,
    allowTestDatabase: false,
    composePs: async () =>
      run('{"State":"running","Health":"healthy","Publishers":[{"PublishedPort":55432}]}\n'),
    readLedger: async () => ({
      kind: 'OK',
      rows: BUILD.map((b) => ({ version: b.version, checksum: b.checksum })),
      tableExists: true,
    }),
    readWorkerLogin: async () => ({
      kind: 'OK',
      login: 'nwf_acq_mac',
      member: true,
      superuser: false,
    }),
    buildMigrations: () => BUILD,
    runbooks: () => ['NWF_PE_MIGRATIONS_0001_0002_APPLY_RUNBOOK_V1.md'],
    pinnedKeys: () => ({ pinned: 1, hasActiveKey: true }),
    diskFreeBytes: () => 50 * 1024 ** 3,
    logDirWritable: () => ({ ok: true, detail: 'writable' }),
    ...over,
  };
}

interface Harness {
  deps: EngineDeps;
  paths: EnginePaths;
  procs: FakeProcessPort;
  clock: ReturnType<typeof createFakeRuntimeClock>;
  out: string[];
  err: string[];
  signals: { pid: number; sig: EngineSignal }[];
  alive: Set<number>;
  handlers: Partial<Record<string, () => void>>;
  cli(...argv: string[]): Promise<number>;
  text(): string;
}

function harness(over: Partial<EngineDeps> = {}, doctor: Partial<DoctorDeps> = {}): Harness {
  const paths = tempEnginePaths();
  const procs = createFakeProcessPort();
  const clock = createFakeRuntimeClock();
  const out: string[] = [];
  const err: string[] = [];
  const signals: { pid: number; sig: EngineSignal }[] = [];
  const alive = new Set<number>();
  const handlers: Partial<Record<string, () => void>> = {};
  const deps: EngineDeps = {
    paths,
    urls: URLS,
    procs,
    clock,
    pid: 777,
    nodePath: '/usr/local/bin/node',
    isAlive: (pid) => alive.has(pid),
    signal: (pid, sig) => {
      signals.push({ pid, sig });
      return alive.has(pid);
    },
    onSignals: (h) => {
      Object.assign(handlers, h);
      return () => {
        for (const k of Object.keys(h)) delete handlers[k];
      };
    },
    doctor: () => doctorDeps(doctor),
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    ...over,
  };
  return {
    deps,
    paths,
    procs,
    clock,
    out,
    err,
    signals,
    alive,
    handlers,
    cli: (...argv) => runEngine(argv, deps),
    text: () => out.join('') + err.join(''),
  };
}

/** A real-time clock for commands that poll (start's confirmation loop). */
const quickClock: RuntimeClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
};

describe('doctor', () => {
  it('passes when everything is in place, and is read-only by construction', async () => {
    const report = await runDoctor(doctorDeps());
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => `${c.id}:${c.level}`)).toEqual([
      'node:PASS',
      'environment:PASS',
      'docker:PASS',
      'postgres:PASS',
      'migrations:PASS',
      'worker-login:PASS',
      'campaign-keys:PASS',
      'stage-handlers:INFO',
      'disk:PASS',
      'logs:PASS',
    ]);
  });

  it('refuses a database behind this build and names the runbook, never applying anything', async () => {
    const report = await runDoctor(
      doctorDeps({
        readLedger: async (): Promise<LedgerRead> => ({
          kind: 'OK',
          rows: [{ version: '0001', checksum: 'aa' }],
          tableExists: true,
        }),
      }),
    );
    expect(report.ok).toBe(false);
    const m = report.checks.find((c) => c.id === 'migrations')!;
    expect(m.level).toBe('FAIL');
    expect(m.detail.join('\n')).toContain('BEHIND this build: missing 0002, 0022');
    expect(m.detail.join('\n')).toContain(
      '0002: follow docs/architecture/NWF_PE_MIGRATIONS_0001_0002_APPLY_RUNBOOK_V1.md under a signed OWNER grant',
    );
    expect(m.detail.join('\n')).toContain('0022: no apply runbook in this build covers them');
    expect(m.detail.join('\n')).toContain('never applies migrations itself');
  });

  it('states plainly that campaigns cannot run without a pinned OWNER key, and reports env names only', async () => {
    const report = await runDoctor(
      doctorDeps({
        pinnedKeys: () => ({ pinned: 0, hasActiveKey: false }),
        urls: { DATABASE_URL_ADMIN: URL() },
      }),
    );
    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    expect(byId['campaign-keys']).toMatchObject({
      level: 'FAIL',
      summary: 'no OWNER campaign key pinned: campaigns cannot run',
    });
    expect(byId['worker-login']!.summary).toContain('no worker login configured');
    expect(byId['environment']!.detail.join(' ')).toContain('DATABASE_URL_READONLY is not set');
    expect(JSON.stringify(report)).not.toContain('u:p@');
  });

  it('reports Docker down, a stopped container, the wrong port, a superuser worker and a mismatched ledger', async () => {
    const report = await runDoctor(
      doctorDeps({
        composePs: async () => ({
          exitCode: 1,
          signal: null,
          stdout: '',
          stderrTail: 'Cannot connect to the Docker daemon',
        }),
        readWorkerLogin: async () => ({
          kind: 'OK',
          login: 'nwf_owner',
          member: true,
          superuser: true,
        }),
        readLedger: async () => ({
          kind: 'OK',
          rows: [
            { version: '0001', checksum: 'XX' },
            { version: '0002', checksum: 'bb' },
            { version: '0022', checksum: 'cc' },
            { version: '0099', checksum: 'zz' },
          ],
          tableExists: true,
        }),
      }),
    );
    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    expect(byId['docker']).toMatchObject({
      level: 'FAIL',
      summary: 'Docker is not running or not reachable',
    });
    expect(byId['worker-login']!.detail[0]).toContain('superuser');
    expect(byId['migrations']!.detail.join(' ')).toContain('0001 differ');
    expect(byId['migrations']!.detail.join(' ')).toContain('0099 that this build does not know');
    const stopped = await runDoctor(
      doctorDeps({
        composePs: async () => run('{"State":"exited","Publishers":[{"PublishedPort":55999}]}'),
      }),
    );
    const pg = stopped.checks.find((c) => c.id === 'postgres')!;
    expect(pg.level).toBe('WARN');
    expect(pg.detail.join(' ')).toContain('NOT this container');
  });

  it('compares ledgers, picks runbooks and parses both compose output shapes', () => {
    expect(compareLedger(BUILD, [{ version: '0001', checksum: 'aa' }])).toEqual({
      missing: ['0002', '0022'],
      mismatched: [],
      unknown: [],
    });
    const rbs = [
      'NWF_PE_MIGRATIONS_0013_0019_APPLY_RUNBOOK_V1.md',
      'NWF_PE_MIGRATIONS_0013_0021_APPLY_RUNBOOK_V1.md',
      'README.md',
    ];
    expect(runbookFor('0014', rbs)).toBe('NWF_PE_MIGRATIONS_0013_0021_APPLY_RUNBOOK_V1.md');
    expect(runbookFor('0021', rbs)).toBe('NWF_PE_MIGRATIONS_0013_0021_APPLY_RUNBOOK_V1.md');
    expect(runbookFor('0023', rbs)).toBeNull();
    expect(parseComposePs('[{"State":"running","Health":"healthy"}]')).toEqual([
      { state: 'running', health: 'healthy', publishedPorts: [] },
    ]);
    expect(parseComposePs('{"State":"running"}\n{"State":"exited"}\n')).toHaveLength(2);
    expect(parseComposePs('')).toEqual([]);
  });
});

describe('start', () => {
  it('starts Postgres when stopped, runs doctor, remembers the campaign and starts ONE supervisor', async () => {
    const h = harness({ clock: quickClock, startConfirmMs: 2000 });
    h.procs.composeResult = (op) => (op === 'ps' ? run('{"State":"exited"}') : run(''));
    h.procs.onSpawnSupervisor = (campaignId) => {
      h.alive.add(4242);
      acquireLock(h.paths, { pid: 4242, campaignId, startedAt: new Date().toISOString() }, (p) =>
        h.alive.has(p),
      );
      return 4242;
    };
    expect(await h.cli('start', '--campaign-id', CAMPAIGN)).toBe(0);
    expect(h.procs.composeCalls).toEqual(['ps', 'up']);
    expect(h.procs.supervisorSpawns).toEqual([{ campaignId: CAMPAIGN, allowTestDatabase: false }]);
    expect(readConfig(h.paths).campaignId).toBe(CAMPAIGN);
    expect(h.text()).toContain('Started: supervisor pid 4242');
    expect(statSync(h.paths.stateDir).mode & 0o777).toBe(0o700);
    expect(statSync(h.paths.lockFile).mode & 0o777).toBe(0o600);
    // A second start for the same campaign is a no-op; for another campaign it is refused.
    expect(await h.cli('start')).toBe(0);
    expect(h.text()).toContain('already running for campaign');
    expect(await h.cli('start', '--campaign-id', OTHER_CAMPAIGN)).toBe(1);
    expect(h.text()).toContain('already running for ANOTHER campaign');
    expect(h.procs.supervisorSpawns).toHaveLength(1);
  });

  it('refuses without a campaign, on Docker down, on a doctor FAIL, on a non-local or test database', async () => {
    const h = harness();
    expect(await h.cli('start')).toBe(1);
    expect(h.text()).toContain('No campaign is configured on this Mac');

    const docker = harness();
    docker.procs.composeResult = () => ({
      exitCode: 1,
      signal: null,
      stdout: '',
      stderrTail: 'daemon',
    });
    expect(await docker.cli('start', '--campaign-id', CAMPAIGN)).toBe(1);
    expect(docker.text()).toContain('Docker is not running');

    const noKey = harness({}, { pinnedKeys: () => ({ pinned: 0, hasActiveKey: false }) });
    expect(await noKey.cli('start', '--campaign-id', CAMPAIGN)).toBe(1);
    expect(noKey.text()).toContain('no OWNER campaign key pinned: campaigns cannot run');
    expect(noKey.text()).toContain('nothing was started');
    expect(noKey.procs.supervisorSpawns).toEqual([]);

    const remote = harness({
      urls: { ...URLS, DATABASE_URL_ADMIN: 'postgres://u:p@10.0.0.5:5432/nwf_pe' },
    });
    expect(await remote.cli('start', '--campaign-id', CAMPAIGN)).toBe(1);
    expect(remote.text()).toContain('not this Mac');
    expect(remote.procs.composeCalls).toEqual([]);

    const test = harness({
      urls: {
        DATABASE_URL_ADMIN: URL('nwf_pe_test'),
        DATABASE_URL_READONLY: URL('nwf_pe_test'),
        DATABASE_URL_ACQUISITION_WORKER: URL('nwf_pe_test'),
      },
    });
    expect(await test.cli('start', '--campaign-id', CAMPAIGN)).toBe(1);
    expect(test.text()).toContain('--allow-test-database');
  });
});

describe('single instance, crash and recovery', () => {
  it('a second supervisor never starts a worker while one holds the lock', async () => {
    const h = harness();
    h.alive.add(777);
    const first = h.cli('supervise', '--campaign-id', CAMPAIGN);
    await flush();
    expect(h.procs.workers).toHaveLength(1);
    const second = harness({ pid: 888 });
    const secondDeps = {
      ...second.deps,
      paths: h.paths,
      isAlive: (p: number) => h.alive.has(p),
      procs: second.procs,
    };
    expect(await runEngine(['supervise', '--campaign-id', CAMPAIGN], secondDeps)).toBe(1);
    expect(second.text()).toContain('LOCK_HELD');
    expect(second.procs.workers).toHaveLength(0);
    // Graceful shutdown through the registered SIGTERM handler.
    h.handlers['SIGTERM']!();
    h.procs.workers[0]!.finish(workerStopped('ABORTED', 1));
    expect(await first).toBe(0);
    expect(existsSync(h.paths.lockFile)).toBe(false);
    expect(readSupervisorState(h.paths)).toMatchObject({
      phase: 'EXITED',
      exit: { reason: 'SHUTDOWN_REQUESTED' },
    });
  });

  it('a supervisor that fails while its worker is alive keeps the lock, so no second worker can start', async () => {
    const h = harness();
    h.alive.add(777);
    const supervising = h.cli('supervise', '--campaign-id', CAMPAIGN);
    await flush();
    h.procs.workers[0]!.fail(new Error('internal failure'));
    await expect(supervising).rejects.toThrow('internal failure');
    expect(existsSync(h.paths.lockFile)).toBe(true);
    expect(tailLines(h.paths.logFile, 3).join('\n')).toContain('the lock is kept');
    h.alive.delete(777);
    h.alive.add(5001);
    writeSupervisorState(h.paths, { ...readSupervisorState(h.paths)!, workerPid: 5001 });
    expect(await h.cli('recover')).toBe(1);
    expect(h.text()).toContain('its worker (pid 5001) is still alive');
  });

  it('crash -> recover -> start: refuses while anything is alive, deletes no data, then starts again', async () => {
    const h = harness({ clock: quickClock, startConfirmMs: 2000 });
    writeConfig(h.paths, {
      contract: 'nwf-engine.config.v1',
      campaignId: CAMPAIGN,
      operatorStatusFile: null,
    });
    // A supervisor (pid 600) with a worker (pid 601) that "crashed": its files remain.
    acquireLock(
      h.paths,
      { pid: 600, campaignId: CAMPAIGN, startedAt: '2026-10-27T05:00:00.000Z' },
      () => true,
    );
    const crashedState: SupervisorStateFile = {
      contract: 'nwf-engine.supervisor-state.v1',
      pid: 600,
      campaignId: CAMPAIGN,
      startedAt: '2026-10-27T05:00:00.000Z',
      phase: 'RUNNING_WORKER',
      phaseSince: '2026-10-27T05:00:00.000Z',
      phaseDetail: null,
      workerPid: 601,
      workerRuns: 1,
      consecutiveFailures: 0,
      nextWakeAt: null,
      lastWorkerExit: null,
      exit: null,
      updatedAt: '2026-10-27T05:00:00.000Z',
    };
    writeSupervisorState(h.paths, crashedState);

    // While the supervisor is "alive", recover refuses.
    h.alive.add(600);
    expect(await h.cli('recover')).toBe(1);
    expect(h.text()).toContain('is alive; there is nothing to recover');
    // Supervisor gone: start refuses the stale lock.
    h.alive.delete(600);
    expect(await h.cli('start')).toBe(1);
    expect(h.text()).toContain('Run `nwf-engine recover` first');
    // Its worker still alive: recover refuses and says how to stop it.
    h.alive.add(601);
    expect(await h.cli('recover')).toBe(1);
    expect(h.text()).toContain('kill -TERM 601');
    expect(existsSync(h.paths.lockFile)).toBe(true);
    // Nothing alive: recover clears the lock, reports leases, deletes no data.
    h.alive.delete(601);
    expect(await h.cli('recover')).toBe(0);
    expect(existsSync(h.paths.lockFile)).toBe(false);
    expect(existsSync(h.paths.pidFile)).toBe(false);
    expect(existsSync(h.paths.stateFile)).toBe(true);
    expect(h.text()).toContain('1 item(s) with an expired lease and 1 with a live claim');
    expect(h.text()).toContain('No data was deleted');
    expect(h.procs.calls.every((c) => c.kind === 'status')).toBe(true);
    // And start works again.
    h.procs.onSpawnSupervisor = (campaignId) => {
      h.alive.add(4243);
      acquireLock(h.paths, { pid: 4243, campaignId, startedAt: new Date().toISOString() }, (p) =>
        h.alive.has(p),
      );
      return 4243;
    };
    expect(await h.cli('start')).toBe(0);
    expect(h.procs.supervisorSpawns).toHaveLength(1);
  });
});

describe('pause, resume, stop, shutdown', () => {
  function running(): Harness {
    const h = harness();
    writeConfig(h.paths, {
      contract: 'nwf-engine.config.v1',
      campaignId: CAMPAIGN,
      operatorStatusFile: null,
    });
    h.alive.add(4242);
    acquireLock(
      h.paths,
      { pid: 4242, campaignId: CAMPAIGN, startedAt: '2026-10-27T05:00:00.000Z' },
      () => true,
    );
    return h;
  }

  it('pause and resume record the event on the owner path, then wake the supervisor', async () => {
    const h = running();
    expect(await h.cli('pause', '--reason', 'lunch')).toBe(0);
    expect(h.procs.calls).toEqual([
      { kind: 'control', campaignId: CAMPAIGN, action: 'PAUSE', reason: 'lunch' },
    ]);
    expect(h.signals).toEqual([{ pid: 4242, sig: 'SIGUSR1' }]);
    expect(await h.cli('resume')).toBe(0);
    expect(h.procs.calls[1]).toEqual({ kind: 'control', campaignId: CAMPAIGN, action: 'RESUME' });
    expect(h.text()).toContain('RECORDED RESUME');
    expect(tailLines(h.paths.logFile, 5).join('\n')).toContain('RESUME recorded');
  });

  it('a refused control is explained and signals nothing', async () => {
    const h = running();
    h.procs.control = () =>
      run(
        {
          contract: 'nwf-pe.acquisition-cli.v1',
          outcome: 'REFUSED',
          code: 'CAMPAIGN_UNVERIFIED',
          detail: null,
        },
        1,
      );
    expect(await h.cli('resume')).toBe(1);
    expect(h.text()).toContain('RESUME was not recorded');
    expect(h.text()).toContain('verify under the pinned OWNER key set');
    expect(h.signals).toEqual([]);
  });

  it('stop is a dry run without --execute; --execute records STOP; --emergency records EMERGENCY_STOP and SIGTERMs', async () => {
    const h = running();
    expect(await h.cli('stop')).toBe(0);
    expect(h.procs.calls).toEqual([]);
    expect(h.text()).toContain('STOP ENDS the campaign for good');
    expect(h.text()).toContain('nwf-engine shutdown');
    expect(await h.cli('stop', '--execute')).toBe(0);
    expect(h.procs.calls.at(-1)).toMatchObject({ action: 'STOP' });
    expect(h.signals.at(-1)).toEqual({ pid: 4242, sig: 'SIGUSR1' });
    expect(await h.cli('stop', '--emergency')).toBe(0);
    expect(h.procs.calls.at(-1)).toMatchObject({ action: 'EMERGENCY_STOP' });
    expect(h.signals.at(-1)).toEqual({ pid: 4242, sig: 'SIGTERM' });
  });

  it('control still records when the engine is not running, and says so', async () => {
    const h = harness();
    expect(await h.cli('pause', '--campaign-id', CAMPAIGN)).toBe(0);
    expect(h.text()).toContain('not running on this Mac; the event is recorded');
    expect(h.signals).toEqual([]);
  });

  it('shutdown SIGTERMs the supervisor and leaves the campaign alone', async () => {
    const h = running();
    expect(await h.cli('shutdown')).toBe(0);
    expect(h.signals).toEqual([{ pid: 4242, sig: 'SIGTERM' }]);
    expect(h.procs.calls).toEqual([]);
    expect(h.text()).toContain('the campaign itself is unchanged');
    const idle = harness();
    expect(await idle.cli('shutdown')).toBe(0);
    expect(idle.text()).toContain('not running');
  });
});

describe('status, logs and the LaunchAgent', () => {
  it('status reads the runtime files and the campaign status, as text or nwf-engine.status.v1', async () => {
    const h = harness();
    writeConfig(h.paths, {
      contract: 'nwf-engine.config.v1',
      campaignId: CAMPAIGN,
      operatorStatusFile: null,
    });
    expect(await h.cli('status')).toBe(0);
    expect(h.text()).toContain('NWF Partnership Engine - status');
    expect(h.text()).toContain('NOT RUNNING');
    h.out.length = 0;
    expect(await h.cli('status', '--json')).toBe(0);
    const doc = JSON.parse(h.out.join('')) as { contract: string; campaign: { read: string } };
    expect(doc).toMatchObject({ contract: 'nwf-engine.status.v1', campaign: { read: 'STATUS' } });
    // A test database is refused for the status read, and the dashboard says why.
    const t = harness({ urls: { DATABASE_URL_READONLY: URL('nwf_pe_test') } });
    expect(await t.cli('status', '--campaign-id', CAMPAIGN)).toBe(0);
    expect(t.text()).toContain('could not be read');
    expect(t.procs.calls).toEqual([]);
  });

  it('logs rotate by size, tail, and follow until stopped', async () => {
    const h = harness();
    const log = createRotatingLog(h.paths.logDir, h.paths.logFile, () => T0, 200, 2);
    for (let i = 0; i < 12; i += 1) log.write(`line ${i}`);
    expect(existsSync(`${h.paths.logFile}.1`)).toBe(true);
    expect(existsSync(`${h.paths.logFile}.3`)).toBe(false);
    expect(await h.cli('logs', '--lines', '2')).toBe(0);
    expect(h.out.join('')).toContain('line 11');
    const stop = new AbortController();
    const f = harness({ followSignal: stop.signal });
    const following = runEngine(['logs', '--follow'], {
      ...f.deps,
      paths: h.paths,
      followSignal: stop.signal,
    });
    await flush();
    log.write('appended later');
    f.clock.advance(1000);
    await flush();
    stop.abort();
    expect(await following).toBe(0);
    expect(f.out.join('')).toContain('appended later');
  });

  it('install-agent needs --i-understand, writes only with --execute, and never loads it', async () => {
    const h = harness();
    writeConfig(h.paths, {
      contract: 'nwf-engine.config.v1',
      campaignId: CAMPAIGN,
      operatorStatusFile: null,
    });
    expect(await h.cli('install-agent')).toBe(1);
    expect(h.text()).toContain('Nothing is installed by default');
    expect(await h.cli('install-agent', '--i-understand')).toBe(0);
    expect(existsSync(h.paths.launchAgentFile)).toBe(false);
    expect(h.text()).toContain('DRY RUN: nothing was written');
    expect(await h.cli('install-agent', '--i-understand', '--execute')).toBe(0);
    const plist = readFileSync(h.paths.launchAgentFile, 'utf8');
    expect(statSync(h.paths.launchAgentFile).mode & 0o777).toBe(0o644);
    expect(plist).toContain('<key>Label</key><string>nl.newwavefluent.nwf-engine</string>');
    expect(plist).toContain('<key>RunAtLoad</key><false/>');
    expect(plist).toContain('<key>KeepAlive</key><false/>');
    expect(plist).toContain(`<string>${CAMPAIGN}</string>`);
    expect(plist).not.toMatch(/sudo|Keychain|DATABASE_URL|password/i);
    expect(h.text()).toContain('It is NOT loaded');
    expect(h.text()).toContain('launchctl bootstrap gui/$(id -u)');
    expect(await h.cli('uninstall-agent')).toBe(0);
    expect(existsSync(h.paths.launchAgentFile)).toBe(true);
    expect(await h.cli('uninstall-agent', '--execute')).toBe(0);
    expect(existsSync(h.paths.launchAgentFile)).toBe(false);
    expect(
      launchAgentPlist({
        nodePath: '/n/node',
        paths: h.paths,
        campaignId: CAMPAIGN,
        runAtLoad: true,
      }),
    ).toContain('<key>RunAtLoad</key><true/>');
    expect(() =>
      launchAgentPlist({ nodePath: '/n/node', paths: h.paths, campaignId: 'x', runAtLoad: false }),
    ).toThrow();
  });

  it('a corrupt lock file is treated as held-by-nobody and needs recover, never silently taken', async () => {
    const h = harness();
    acquireLock(h.paths, { pid: 1, campaignId: CAMPAIGN, startedAt: '' }, () => true);
    writeFileSync(h.paths.lockFile, 'not json');
    expect(
      acquireLock(h.paths, { pid: 2, campaignId: CAMPAIGN, startedAt: '' }, () => false),
    ).toMatchObject({
      ok: false,
      state: { kind: 'STALE' },
    });
    expect(await h.cli('start', '--campaign-id', CAMPAIGN)).toBe(1);
    expect(h.text()).toContain('nwf-engine recover');
  });
});

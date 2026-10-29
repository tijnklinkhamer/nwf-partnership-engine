/**
 * WW H-RT - regression tests for the Mac runtime hardening:
 *
 *   P1-6   every connection string the wired worker (and the review command)
 *          uses is required/checked by doctor, start and the supervisor;
 *   P2-10  strict URL reading (pg's own parser agrees; no query string, no
 *          socket form, explicit user/port/database) and no PG* inheritance;
 *   P2-11  a lock from before the system boot is stale; a pid is signalled
 *          only when the state file confirms its per-start nonce;
 *   P2-12  lock removal is rename + re-verify + no-clobber restore: two
 *          recovers and a start cannot leave two supervisors;
 *   P2-13  EMERGENCY_STOP after a graceful shutdown still escalates;
 *   doctor  review login, review key path, Claude Max profile, outbox.
 *
 * Fake ports and temporary directories only: no real process, Docker,
 * launchd, network or database.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { classifierProfileFacts } from '../../runtime/classifierProfile.js';
import { runEngine, type EngineDeps, type EngineSignal } from '../../runtime/commands.js';
import { pathFactsOf, runDoctor, type DoctorDeps } from '../../runtime/doctor.js';
import {
  acquireLock,
  inspectLock,
  parseBootTime,
  readLock,
  readSupervisorState,
  releaseLock,
  removeLockIfUnchanged,
  supervisorConfirmed,
  writeSupervisorState,
} from '../../runtime/lock.js';
import type { EnginePaths } from '../../runtime/paths.js';
import { childEnvironment, scrubPostgresVariables } from '../../runtime/processes.js';
import { Supervisor } from '../../runtime/supervisor.js';
import {
  checkDatabaseTargets,
  parseConnectionTarget,
  RUNTIME_DATABASE_VARIABLES,
  WORKER_DATABASE_VARIABLES,
} from '../../runtime/targets.js';
import {
  CAMPAIGN,
  FAKE_BOOT,
  bootTimeRun,
  createFakeProcessPort,
  createFakeRuntimeClock,
  flush,
  holdLock,
  run,
  statusRun,
  tempEnginePaths,
  workerStopped,
  type FakeProcessPort,
  type StatusDraft,
} from '../helpers/macRuntimeFakes.js';

const PASSWORD = 'hunter2-secret';
/** user:password and the `@` that ends userinfo in a connection URL (not an address). */
const USERINFO = `u:${PASSWORD}@`;
const URL = (db = 'nwf_pe', host = '127.0.0.1', port = 55432) =>
  `postgres://${USERINFO}${host}:${port}/${db}`;
const urlsFor = (db = 'nwf_pe') =>
  Object.fromEntries(RUNTIME_DATABASE_VARIABLES.map((v) => [v, URL(db)]));
const URLS = urlsFor();
const UID = typeof process.getuid === 'function' ? process.getuid() : 501;

function doctorDeps(over: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    nodeVersion: 'v24.18.0',
    urls: URLS,
    allowTestDatabase: false,
    composePs: async () =>
      run('{"State":"running","Health":"healthy","Publishers":[{"PublishedPort":55432}]}\n'),
    readLedger: async () => ({ kind: 'OK', rows: [], tableExists: true }),
    readWorkerLogin: async () => ({ kind: 'OK', login: 'w', member: true, superuser: false }),
    buildMigrations: () => [],
    runbooks: () => [],
    pinnedKeys: () => ({ pinned: 1, hasActiveKey: true }),
    diskFreeBytes: () => 50 * 1024 ** 3,
    logDirWritable: () => ({ ok: true, detail: 'writable' }),
    outboxDir: null,
    reviewKeyFile: null,
    uid: UID,
    pathFacts: pathFactsOf,
    classifierProfile: () => ({
      resolved: true,
      variable: 'NWF_PE_CLASSIFIER_CONFIG_DIR',
      fromVariable: false,
      path: '/Users/owner/profile-dir',
      present: true,
    }),
    ...over,
  };
}

interface Harness {
  deps: EngineDeps;
  paths: EnginePaths;
  procs: FakeProcessPort;
  out: string[];
  signals: { pid: number; sig: EngineSignal }[];
  alive: Set<number>;
  handlers: Partial<Record<string, () => void>>;
  cli(...argv: string[]): Promise<number>;
  text(): string;
}

function harness(over: Partial<EngineDeps> = {}, doctor: Partial<DoctorDeps> = {}): Harness {
  const paths = tempEnginePaths();
  const procs = createFakeProcessPort();
  const out: string[] = [];
  const signals: { pid: number; sig: EngineSignal }[] = [];
  const alive = new Set<number>();
  const handlers: Partial<Record<string, () => void>> = {};
  const deps: EngineDeps = {
    paths,
    urls: URLS,
    procs,
    clock: {
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
    },
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
    doctor: (options) => doctorDeps({ ...options, ...doctor }),
    out: (t) => out.push(t),
    err: (t) => out.push(t),
    startConfirmMs: 2000,
    ...over,
  };
  return {
    deps,
    paths,
    procs,
    out,
    signals,
    alive,
    handlers,
    cli: (...argv) => runEngine(argv, deps),
    text: () => out.join(''),
  };
}

// ---------------------------------------------------------------------------
// P1-6: every worker connection string.
// ---------------------------------------------------------------------------

describe('P1-6: doctor, start and the supervisor check every connection string the worker uses', () => {
  it('names exactly the worker roles of the production wiring, plus the reviewer', () => {
    expect([...WORKER_DATABASE_VARIABLES]).toEqual([
      'DATABASE_URL_ADMIN',
      'DATABASE_URL_READONLY',
      'DATABASE_URL_ACQUISITION_WORKER',
      'DATABASE_URL_SOURCE_DISCOVERY',
      'DATABASE_URL_DISCOVERY_SUBJECT_WRITER',
      'DATABASE_URL_RESEARCH',
    ]);
    expect(RUNTIME_DATABASE_VARIABLES.at(-1)).toBe('DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER');
  });

  for (const v of WORKER_DATABASE_VARIABLES) {
    it(`start refuses when ${v} is missing, remote, a test database or another port`, async () => {
      const cases: [string, string | undefined, string][] = [
        ['missing', undefined, `${v} is not set`],
        ['remote', URL('nwf_pe', '10.0.0.5'), 'not this Mac'],
        ['test db', URL('nwf_pe_test'), '--allow-test-database'],
        ['other port', URL('nwf_pe', '127.0.0.1', 55433), 'different databases'],
      ];
      for (const [, value, says] of cases) {
        const urls: Record<string, string> = { ...URLS };
        if (value === undefined) delete urls[v];
        else urls[v] = value;
        const h = harness({ urls });
        expect(await h.cli('start', '--campaign-id', CAMPAIGN)).toBe(1);
        expect(h.text()).toContain(says);
        expect(h.text()).not.toContain(PASSWORD);
        expect(h.procs.composeCalls).toEqual([]);
        expect(h.procs.supervisorSpawns).toEqual([]);
        // The supervisor refuses on its own as well, before taking the lock.
        const s = harness({ urls });
        expect(await s.cli('supervise', '--campaign-id', CAMPAIGN)).toBe(1);
        expect(existsSync(s.paths.lockFile)).toBe(false);
        expect(s.procs.workers).toEqual([]);
        // And doctor FAILs the environment line.
        const report = await runDoctor(doctorDeps({ urls }));
        const env = report.checks.find((c) => c.id === 'environment')!;
        expect(env.level).toBe('FAIL');
        expect(env.detail.join(' ')).toContain(says);
      }
    });
  }

  it('the reviewer is checked when set (a remote one is refused) and only warned about when absent', async () => {
    const remote = {
      ...URLS,
      DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER: URL('nwf_pe', 'db.example'),
    };
    expect(checkDatabaseTargets(remote).ok).toBe(false);
    const absent: Record<string, string> = { ...URLS };
    delete absent['DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER'];
    expect(checkDatabaseTargets(absent).ok).toBe(true);
    const report = await runDoctor(doctorDeps({ urls: absent }));
    expect(report.checks.find((c) => c.id === 'review-login')).toMatchObject({ level: 'WARN' });
    expect(report.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P2-10: strict URL reading and no PG* inheritance.
// ---------------------------------------------------------------------------

describe('P2-10: the connection-string check cannot be bypassed', () => {
  const refused: [string, string][] = [
    [`${URL()}?host=10.0.0.5`, 'query string (host)'],
    [`${URL()}?hostaddr=10.0.0.5`, 'query string (hostaddr)'],
    [`${URL()}?port=6543`, 'query string (port)'],
    [`${URL()}?options=-c%20search_path%3Devil`, 'query string (options)'],
    [`${URL()}?sslrootcert=/nonexistent/ca.pem`, 'query string'],
    [`${URL()}?`, 'query string'],
    [`${URL()}#x`, 'fragment'],
    ['socket:/tmp?db=nwf_pe', 'not a postgres:// URL'],
    ['/tmp nwf_pe', 'not a postgres:// URL'],
    ['host=127.0.0.1 port=55432 dbname=nwf_pe', 'not a postgres:// URL'],
    ['mysql://u:p@127.0.0.1:3306/nwf_pe', 'not a postgres:// URL'],
    [`postgres://u:${PASSWORD}@127.0.0.1/nwf_pe`, 'no explicit port'],
    [`postgres://u:${PASSWORD}@127.0.0.1:55432/`, 'no database'],
    [`postgres://u:${PASSWORD}@127.0.0.1:55432`, 'no database'],
    [`postgres://:${PASSWORD}@127.0.0.1:55432/nwf_pe`, 'no user'],
    [`postgres://u:${PASSWORD}@%2Ftmp:55432/nwf_pe`, 'reads differently'],
    [`postgres://u:${PASSWORD}@/nwf_pe`, 'not a parseable'],
    [`postgres://u:${PASSWORD}@127.0.0.1:55432/nwf pe`, 'whitespace'],
    [`postgres://u:${PASSWORD}@127.0.0.2:55432/nwf_pe`, 'not this Mac'],
  ];
  for (const [value, says] of refused) {
    it(`refuses ${value.replace(PASSWORD, '***')}`, () => {
      const r = parseConnectionTarget(value);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toContain(says);
        expect(r.reason).not.toContain(PASSWORD);
      }
    });
  }

  it('accepts the plain loopback forms, with the port and database pg will use', () => {
    expect(parseConnectionTarget(URL())).toEqual({
      ok: true,
      host: '127.0.0.1',
      port: 55432,
      database: 'nwf_pe',
    });
    expect(parseConnectionTarget('postgresql://u:p%3Fq@localhost:5432/db')).toMatchObject({
      ok: true,
      host: 'localhost',
    });
    expect(parseConnectionTarget('postgres://u:p@[::1]:5432/db')).toMatchObject({ ok: true });
  });

  it('a query-string override on ANY one variable fails the whole check', () => {
    for (const v of RUNTIME_DATABASE_VARIABLES) {
      const c = checkDatabaseTargets({ ...URLS, [v]: `${URL()}?host=10.0.0.5` });
      expect(c.ok, v).toBe(false);
      expect(c.refusals.join(' ')).toContain(v);
    }
  });

  it('children get no PG* variable; this process drops them too', () => {
    const env = childEnvironment({
      PATH: '/usr/bin',
      PGHOST: '10.0.0.5',
      PGPORT: '6543',
      PGDATABASE: 'other',
      PGOPTIONS: '-c x=y',
      PGPASSWORD: 'p',
      DATABASE_URL_ADMIN: URL(),
    });
    expect(Object.keys(env).sort()).toEqual(['DATABASE_URL_ADMIN', 'PATH']);
    const saved = { PGHOST: process.env['PGHOST'], PGSSLMODE: process.env['PGSSLMODE'] };
    process.env['PGHOST'] = '10.0.0.5';
    process.env['PGSSLMODE'] = 'disable';
    try {
      expect(scrubPostgresVariables()).toEqual(expect.arrayContaining(['PGHOST', 'PGSSLMODE']));
      expect(process.env['PGHOST']).toBeUndefined();
      expect(process.env['PGSSLMODE']).toBeUndefined();
    } finally {
      for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
    }
  });
});

// ---------------------------------------------------------------------------
// P2-11: boot time and the per-start nonce.
// ---------------------------------------------------------------------------

describe('P2-11: a lock from before the boot is stale; nothing unconfirmed is signalled', () => {
  it('parses kern.boottime and treats anything else as unknown', () => {
    expect(
      parseBootTime(run('{ sec = 1792317977, usec = 822231 } Sun Oct 18 12:06:17 2026\n')),
    ).toBe(1_792_317_977_822);
    expect(parseBootTime(bootTimeRun(FAKE_BOOT))).toBe(FAKE_BOOT);
    expect(parseBootTime(run('garbage'))).toBeNull();
    expect(parseBootTime(run('{ sec = 1, usec = 2 }', 1))).toBeNull();
  });

  it('inspectLock: an alive pid with a pre-boot lock is STALE (PREDATES_BOOT); unknown boot falls back to the pid', () => {
    const paths = tempEnginePaths();
    acquireLock(
      paths,
      { pid: 4242, campaignId: CAMPAIGN, startedAt: '2026-09-30T23:59:59.000Z', nonce: 'n' },
      () => true,
    );
    const alive = () => true;
    expect(inspectLock(paths, alive, FAKE_BOOT)).toMatchObject({
      kind: 'STALE',
      why: 'PREDATES_BOOT',
    });
    expect(inspectLock(paths, alive, null)).toMatchObject({ kind: 'HELD' });
    expect(inspectLock(paths, alive, Date.parse('2026-09-01T00:00:00.000Z'))).toMatchObject({
      kind: 'HELD',
    });
  });

  it('after a reboot: start refuses, shutdown signals nothing, recover clears it without a worker check', async () => {
    const h = harness();
    // A supervisor of the PREVIOUS boot; its pid (and its worker's) now name other processes.
    holdLock(h.paths, 4242, CAMPAIGN, {
      startedAt: '2026-09-30T20:00:00.000Z',
      state: { workerPid: 4243 },
    });
    h.alive.add(4242);
    h.alive.add(4243);
    expect(await h.cli('start', '--campaign-id', CAMPAIGN)).toBe(1);
    expect(h.text()).toContain('ran before the Mac last started');
    expect(await h.cli('shutdown')).toBe(0);
    expect(h.text()).toContain('stale lock of pid 4242');
    expect(await h.cli('pause', '--campaign-id', CAMPAIGN)).toBe(0);
    expect(h.signals).toEqual([]);
    expect(await h.cli('recover')).toBe(0);
    expect(h.text()).toContain('written before the Mac last started');
    expect(existsSync(h.paths.lockFile)).toBe(false);
    expect(h.signals).toEqual([]);
  });

  it('reads the boot time at most once per command', async () => {
    const h = harness();
    holdLock(h.paths, 4242, CAMPAIGN);
    h.alive.add(4242);
    await h.cli('status', '--campaign-id', CAMPAIGN);
    expect(h.procs.bootTimeReads).toBe(1);
    await h.cli('logs');
    expect(h.procs.bootTimeReads).toBe(1);
  });

  it('a HELD lock whose state file does not confirm pid + nonce is never signalled', async () => {
    const mismatched = harness();
    holdLock(mismatched.paths, 4242, CAMPAIGN, { state: { nonce: 'someone-else' } });
    mismatched.alive.add(4242);
    expect(await mismatched.cli('shutdown')).toBe(1);
    expect(mismatched.text()).toContain('was NOT signalled');
    expect(await mismatched.cli('pause')).toBe(0);
    expect(mismatched.text()).toContain('was NOT signalled');
    expect(await mismatched.cli('stop', '--emergency')).toBe(0);
    expect(mismatched.signals).toEqual([]);

    const exited = harness();
    holdLock(exited.paths, 4242, CAMPAIGN, {
      state: { exit: { at: '2026-10-27T07:00:00.000Z', reason: 'CAMPAIGN_STOPPED', detail: null } },
    });
    exited.alive.add(4242);
    expect(await exited.cli('shutdown')).toBe(1);
    expect(exited.signals).toEqual([]);

    const otherPid = harness();
    holdLock(otherPid.paths, 4242, CAMPAIGN, { state: { pid: 9999 } });
    otherPid.alive.add(4242);
    expect(await otherPid.cli('resume')).toBe(0);
    expect(otherPid.signals).toEqual([]);

    const confirmed = harness();
    holdLock(confirmed.paths, 4242, CAMPAIGN);
    confirmed.alive.add(4242);
    expect(await confirmed.cli('shutdown')).toBe(0);
    expect(confirmed.signals).toEqual([{ pid: 4242, sig: 'SIGTERM' }]);
  });

  it('the supervisor writes the same fresh nonce into its lock and every state, and releases only its own lock', async () => {
    const h = harness();
    h.alive.add(777);
    const supervising = h.cli('supervise', '--campaign-id', CAMPAIGN);
    await flush();
    const lock = readLock(h.paths)!;
    expect(lock.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(readSupervisorState(h.paths)!.nonce).toBe(lock.nonce);
    expect(supervisorConfirmed(h.paths, lock)).toBe(true);
    expect(releaseLock(h.paths, 777, 'not-the-nonce')).toBe(false);
    expect(existsSync(h.paths.lockFile)).toBe(true);
    h.handlers['SIGTERM']!();
    h.procs.workers[0]!.finish(workerStopped('ABORTED', 1));
    expect(await supervising).toBe(0);
    expect(existsSync(h.paths.lockFile)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P2-12: recover vs start.
// ---------------------------------------------------------------------------

describe('P2-12: recover removes only the lock it judged, so recovers and a start never yield two supervisors', () => {
  function crashed(h: Harness): void {
    holdLock(h.paths, 600, CAMPAIGN, {
      startedAt: '2026-10-27T05:00:00.000Z',
      state: { workerPid: 601 },
    });
  }

  it('lock level: a lock taken after the judgement survives the slow remover', () => {
    const paths = tempEnginePaths();
    acquireLock(
      paths,
      { pid: 600, campaignId: CAMPAIGN, startedAt: '2026-10-27T05:00:00.000Z', nonce: 'old' },
      () => true,
    );
    const judged1 = readFileSync(paths.lockFile, 'utf8'); // recover R1 judges it stale
    const judged2 = readFileSync(paths.lockFile, 'utf8'); // recover R2 too
    expect(removeLockIfUnchanged(paths, judged2)).toEqual({ kind: 'REMOVED' });
    holdLock(paths, 4243, CAMPAIGN); // a start's supervisor takes the lock
    expect(removeLockIfUnchanged(paths, judged1)).toMatchObject({
      kind: 'CHANGED',
      lock: { pid: 4243 },
    });
    expect(readLock(paths)).toMatchObject({ pid: 4243 });
    expect(
      acquireLock(paths, { pid: 5000, campaignId: CAMPAIGN, startedAt: '', nonce: 'x' }, (p) =>
        [4243].includes(p),
      ),
    ).toMatchObject({ ok: false, state: { kind: 'HELD', lock: { pid: 4243 } } });
    expect(removeLockIfUnchanged(tempEnginePaths(), judged1)).toEqual({ kind: 'GONE' });
  });

  it('a racing lock that appears during the restore window is kept, never deleted (CONFLICT)', () => {
    const paths = tempEnginePaths();
    holdLock(paths, 4243, CAMPAIGN);
    const result = removeLockIfUnchanged(paths, 'a different, older lock', () =>
      writeFileSync(paths.lockFile, '{"pid":4244}\n'),
    );
    expect(result).toMatchObject({ kind: 'CONFLICT', lock: { pid: 4243 } });
    if (result.kind === 'CONFLICT') {
      expect(readLock(paths)).toMatchObject({ pid: 4244 });
      expect(JSON.parse(readFileSync(result.movedTo, 'utf8'))).toMatchObject({ pid: 4243 });
    }
  });

  it('command level: R1 judges, R2 recovers and a start runs while R1 checks the worker; R1 removes nothing', async () => {
    const h = harness();
    crashed(h);
    let raced = false;
    const r1 = harness({
      paths: h.paths,
      isAlive: (pid) => {
        if (pid === 601 && !raced) {
          raced = true;
          // While R1 is between its judgement and its removal:
          const judged = readFileSync(h.paths.lockFile, 'utf8');
          expect(removeLockIfUnchanged(h.paths, judged).kind).toBe('REMOVED'); // R2 recovers
          holdLock(h.paths, 4243, CAMPAIGN); // and a start's supervisor takes the lock
          h.alive.add(4243);
        }
        return h.alive.has(pid);
      },
    });
    expect(await r1.cli('recover')).toBe(1);
    expect(r1.text()).toContain('The lock changed while recover ran');
    expect(readLock(h.paths)).toMatchObject({ pid: 4243 });
    // Exactly one supervisor: a further start for another campaign is refused, and a
    // second supervise cannot take the lock.
    const later = harness({ paths: h.paths, isAlive: (p) => h.alive.has(p) });
    expect(await later.cli('start', '--campaign-id', '22222222-0000-4000-8000-000000000002')).toBe(
      1,
    );
    expect(later.text()).toContain('already running for ANOTHER campaign');
    const second = harness({ paths: h.paths, pid: 888, isAlive: (p) => h.alive.has(p) });
    expect(await second.cli('supervise', '--campaign-id', CAMPAIGN)).toBe(1);
    expect(second.text()).toContain('LOCK_HELD');
    expect(second.procs.workers).toEqual([]);
  });

  it('two sequential recovers: the second finds nothing, and the pidfile of another pid is kept', async () => {
    const h = harness();
    crashed(h);
    writeFileSync(h.paths.pidFile, '4243\n');
    expect(await h.cli('recover')).toBe(0);
    expect(existsSync(h.paths.lockFile)).toBe(false);
    expect(readFileSync(h.paths.pidFile, 'utf8')).toBe('4243\n');
    expect(await h.cli('recover')).toBe(0);
    expect(h.text()).toContain('Nothing to recover');
  });
});

// ---------------------------------------------------------------------------
// P2-13: EMERGENCY_STOP after a graceful shutdown.
// ---------------------------------------------------------------------------

describe('P2-13: EMERGENCY_STOP after a graceful shutdown still escalates', () => {
  function supervised() {
    const clock = createFakeRuntimeClock();
    const procs = createFakeProcessPort();
    let status: StatusDraft = {};
    procs.status = () => statusRun(status);
    const supervisor = new Supervisor({
      campaignId: CAMPAIGN,
      pid: 777,
      nonce: 'n',
      clock,
      readStatus: () => procs.acquisition({ kind: 'status', campaignId: CAMPAIGN }),
      launchWorker: () => procs.launchWorker(CAMPAIGN, 'mac-supervisor', () => undefined),
      log: () => undefined,
      policy: { emergencyKillGraceMs: 60_000 },
    });
    const done = supervisor.run();
    return {
      clock,
      procs,
      supervisor,
      done,
      setStatus: (s: StatusDraft) => {
        status = s;
      },
    };
  }

  it('graceful shutdown, then EMERGENCY_STOP: SIGKILL exactly after the grace period, once', async () => {
    const h = supervised();
    await flush();
    const w = h.procs.workers[0]!;
    h.supervisor.requestShutdown(); // `nwf-engine shutdown` (campaign RUNNING)
    await flush();
    h.clock.advance(10 * 60_000);
    await flush();
    expect(w.terminations).toEqual(['graceful']);
    h.setStatus({ controlState: 'EMERGENCY_STOPPED' });
    h.supervisor.requestShutdown(); // `nwf-engine stop --emergency` signals again
    h.supervisor.requestShutdown(); // and a duplicate signal arms no second timer
    await flush();
    h.clock.advance(59_999);
    await flush();
    expect(w.terminations).toEqual(['graceful']);
    h.clock.advance(1);
    await flush();
    expect(w.terminations).toEqual(['graceful', 'kill']);
    h.clock.advance(120_000);
    await flush();
    expect(w.terminations).toEqual(['graceful', 'kill']);
    w.finish({ exitCode: null, signal: 'SIGKILL', stdout: '', stderrTail: '' });
    expect((await h.done).reason).toBe('CAMPAIGN_EMERGENCY_STOPPED');
  });

  it('a worker that exits within the grace period is never killed', async () => {
    const h = supervised();
    await flush();
    const w = h.procs.workers[0]!;
    h.supervisor.requestShutdown();
    await flush();
    h.setStatus({ controlState: 'EMERGENCY_STOPPED' });
    h.supervisor.requestShutdown();
    await flush();
    w.finish(workerStopped('ABORTED', 1));
    await h.done;
    h.clock.advance(10 * 60_000);
    await flush();
    expect(w.terminations).toEqual(['graceful']);
  });
});

// ---------------------------------------------------------------------------
// Doctor additions.
// ---------------------------------------------------------------------------

describe('doctor: outbox, review key path and the Claude Max profile (names and paths only)', () => {
  const root = () => realpathSync(mkdtempSync(join(tmpdir(), 'nwf-engine-hrt-')));

  it('outbox: a 0700 directory of yours passes; anything else FAILs and blocks start', async () => {
    const r = root();
    const ok = join(r, 'outbox');
    mkdirSync(ok, { mode: 0o700 });
    chmodSync(ok, 0o700);
    const wide = join(r, 'wide');
    mkdirSync(wide);
    chmodSync(wide, 0o755);
    const file = join(r, 'file');
    writeFileSync(file, '');
    symlinkSync(ok, join(r, 'link'));
    const level = async (outboxDir: string | null, uid = UID) =>
      (await runDoctor(doctorDeps({ outboxDir, uid }))).checks.find((c) => c.id === 'outbox')!;
    expect(await level(null)).toMatchObject({ level: 'INFO' });
    expect(await level(ok)).toMatchObject({ level: 'PASS' });
    expect(await level(wide)).toMatchObject({
      level: 'FAIL',
      summary: expect.stringContaining('0755'),
    });
    expect((await level(join(r, 'absent'))).summary).toContain('does not exist');
    expect((await level(join(r, 'link'))).summary).toContain('symlink');
    expect((await level(file)).summary).toContain('not a directory');
    expect((await level(ok, UID + 1)).summary).toContain('not owned by you');
    expect((await level('relative/outbox')).level).toBe('FAIL');

    // start hands its --outbox-dir to doctor, so a too-open outbox is refused before anything starts.
    const h = harness();
    expect(await h.cli('start', '--campaign-id', CAMPAIGN, '--outbox-dir', wide)).toBe(1);
    expect(h.text()).toContain('not 0700');
    expect(h.procs.supervisorSpawns).toEqual([]);
  });

  it('review key: reports the recorded path from lstat alone; never opens the file', async () => {
    const r = root();
    const key = join(r, 'review-key.enc');
    writeFileSync(key, 'ENCRYPTED KEY MATERIAL - must never appear in output');
    // Unreadable even by the owner: a PASS proves doctor never opened it.
    chmodSync(key, 0o000);
    const reviewKey = async (reviewKeyFile: string | null) =>
      (await runDoctor(doctorDeps({ reviewKeyFile }))).checks.find((c) => c.id === 'review-key')!;
    expect(await reviewKey(null)).toMatchObject({ level: 'INFO' });
    const pass = await reviewKey(key);
    expect(pass).toMatchObject({
      level: 'PASS',
      summary: `review key file path configured: ${key}`,
    });
    chmodSync(key, 0o644);
    expect((await reviewKey(key)).summary).toContain('readable or writable by others');
    expect((await reviewKey(join(r, 'absent'))).summary).toContain('does not exist');
    expect((await reviewKey(r)).summary).toContain('not a regular file');
    expect((await reviewKey('relative')).level).toBe('WARN');
    const all = JSON.stringify(await runDoctor(doctorDeps({ reviewKeyFile: key })));
    expect(all).not.toContain('KEY MATERIAL');
    // The doctor command reads the path from the runtime config.
    const h = harness();
    mkdirSync(h.paths.stateDir, { recursive: true });
    writeFileSync(
      h.paths.configFile,
      JSON.stringify({ contract: 'nwf-engine.config.v1', campaignId: null, reviewKeyFile: key }),
    );
    await h.cli('doctor');
    expect(h.text()).toContain(`review key file path configured: ${key}`);
  });

  it('Claude Max profile: the classifier resolver decides the path; lstat decides presence', () => {
    const home = root();
    const repo = join(home, 'repo');
    mkdirSync(repo);
    const missing = classifierProfileFacts({ HOME: home }, repo);
    expect(missing).toMatchObject({ resolved: true, fromVariable: false, present: false });
    if (missing.resolved) {
      mkdirSync(missing.path);
      writeFileSync(join(missing.path, 'secret-looking-file'), 'never read');
      expect(classifierProfileFacts({ HOME: home }, repo)).toMatchObject({ present: true });
    }
    const named = join(home, 'named-profile');
    expect(
      classifierProfileFacts({ HOME: home, NWF_PE_CLASSIFIER_CONFIG_DIR: named }, repo),
    ).toMatchObject({ resolved: true, fromVariable: true, path: named, present: false });
    expect(
      classifierProfileFacts({ HOME: home, NWF_PE_CLASSIFIER_CONFIG_DIR: join(repo, 'p') }, repo),
    ).toMatchObject({ resolved: false });
  });

  it('Claude Max profile: present PASSes, absent or unusable WARNs (the search stage refuses)', async () => {
    const profile = async (p: DoctorDeps['classifierProfile']) =>
      (await runDoctor(doctorDeps({ classifierProfile: p }))).checks.find(
        (c) => c.id === 'claude-profile',
      )!;
    expect(await profile(() => doctorDeps().classifierProfile())).toMatchObject({ level: 'PASS' });
    expect(
      await profile(() => ({
        resolved: true,
        variable: 'V',
        fromVariable: false,
        path: '/x',
        present: false,
      })),
    ).toMatchObject({ level: 'WARN' });
    expect(
      await profile(() => ({ resolved: false, variable: 'V', detail: 'refused: inside the repo' })),
    ).toMatchObject({
      level: 'WARN',
      detail: expect.arrayContaining(['refused: inside the repo']),
    });
  });

  it('a doctor report never contains a connection-string value', async () => {
    const report = await runDoctor(
      doctorDeps({ urls: { ...URLS, DATABASE_URL_RESEARCH: `${URL()}?host=10.0.0.5` } }),
    );
    expect(report.ok).toBe(false);
    expect(JSON.stringify(report)).not.toContain(PASSWORD);
  });
});

// The state file written by the supervisor is the one `supervisorConfirmed` reads.
describe('state file nonce', () => {
  it('a state file without a nonce (written before H-RT) confirms nothing', () => {
    const paths = tempEnginePaths();
    holdLock(paths, 4242, CAMPAIGN);
    const state = readSupervisorState(paths)!;
    const { nonce: _drop, ...legacy } = state;
    writeSupervisorState(paths, legacy as typeof state);
    expect(readSupervisorState(paths)!.nonce).toBe('');
    expect(supervisorConfirmed(paths, readLock(paths)!)).toBe(false);
  });
});

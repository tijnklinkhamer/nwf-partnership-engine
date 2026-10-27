/**
 * WW E-M - argument parsing, database-target refusals, CLI envelope parsing
 * and the status dashboard (including fields the status contract adds later
 * and fields it does not report).
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ENGINE_OPTIONS, parseEngineArgs } from '../../runtime/args.js';
import {
  campaignFactsOf,
  parseControlRun,
  parseStatusRun,
  parseWorkerRun,
} from '../../runtime/envelope.js';
import {
  COMPOSE_ARGV,
  InvocationRefusal,
  acquisitionArgv,
  supervisorArgv,
} from '../../runtime/processes.js';
import {
  ENGINE_STATUS_CONTRACT,
  buildEngineStatus,
  readOperatorPublication,
  renderEngineStatus,
  type EngineStatusInput,
} from '../../runtime/status.js';
import { checkDatabaseTargets } from '../../runtime/targets.js';
import {
  CAMPAIGN,
  T0,
  controlRecorded,
  crashed,
  run,
  statusObject,
  statusRefused,
  statusRun,
  workerRefused,
  workerStopped,
} from '../helpers/macRuntimeFakes.js';

describe('nwf-engine arguments', () => {
  it('parses each command strictly and refuses unknown commands and flags', () => {
    expect(parseEngineArgs([])).toEqual({ kind: 'HELP', exitCode: 1 });
    expect(parseEngineArgs(['--help'])).toEqual({ kind: 'HELP', exitCode: 0 });
    expect(parseEngineArgs(['launch'])).toMatchObject({ kind: 'ERROR' });
    expect(parseEngineArgs(['status', '--all'])).toMatchObject({ kind: 'ERROR' });
    expect(parseEngineArgs(['start', '--campaign-id', CAMPAIGN])).toEqual({
      kind: 'COMMAND',
      command: 'start',
      values: { 'campaign-id': CAMPAIGN },
    });
    expect(parseEngineArgs(['start', '--campaign-id', 'not-a-uuid'])).toMatchObject({
      kind: 'ERROR',
    });
    expect(
      parseEngineArgs(['start', '--campaign-id', 'AAAAAAAA-0000-4000-8000-00000000000A']),
    ).toMatchObject({ kind: 'ERROR' });
    expect(parseEngineArgs(['stop', '--emergency'])).toMatchObject({
      kind: 'COMMAND',
      values: { emergency: true },
    });
    expect(parseEngineArgs(['stop', '--emergency', '--execute'])).toMatchObject({ kind: 'ERROR' });
    expect(parseEngineArgs(['logs', '--follow', '--lines', '20'])).toMatchObject({
      kind: 'COMMAND',
    });
    expect(parseEngineArgs(['logs', '--lines', '0'])).toMatchObject({ kind: 'ERROR' });
    expect(parseEngineArgs(['supervise'])).toMatchObject({ kind: 'ERROR' });
    expect(parseEngineArgs(['doctor', '--execute'])).toMatchObject({ kind: 'ERROR' });
  });

  it('declares no option that names a database, key, trust, signature, migration, switch or every campaign', () => {
    for (const options of Object.values(ENGINE_OPTIONS)) {
      for (const name of Object.keys(options)) {
        expect(name).not.toMatch(
          /^all$|every|database-url|url$|key|trust|signature|migrat|switch|grant|sql|sudo/,
        );
      }
    }
  });
});

describe('database targets', () => {
  const url = (host: string, db: string) => `postgres://nwf_owner:hunter2@${host}:55432/${db}`;
  const all = (host: string, db: string) => ({
    DATABASE_URL_ADMIN: url(host, db),
    DATABASE_URL_READONLY: url(host, db),
    DATABASE_URL_ACQUISITION_WORKER: url(host, db),
  });

  it('accepts the local database and names the target without a password', () => {
    const c = checkDatabaseTargets(all('127.0.0.1', 'nwf_pe'));
    expect(c).toMatchObject({ ok: true, target: '127.0.0.1:55432/nwf_pe', isTestDatabase: false });
  });

  it('refuses a non-loopback host, in plain language, without printing the value', () => {
    const c = checkDatabaseTargets(all('db.example.org', 'nwf_pe'));
    expect(c.ok).toBe(false);
    expect(c.refusals.join(' ')).toContain('not this Mac');
    expect(c.refusals.join(' ')).not.toContain('hunter2');
  });

  it('refuses a _test database unless --allow-test-database', () => {
    expect(checkDatabaseTargets(all('localhost', 'nwf_pe_test')).ok).toBe(false);
    expect(
      checkDatabaseTargets(all('localhost', 'nwf_pe_test'), { allowTestDatabase: true }),
    ).toMatchObject({
      ok: true,
      isTestDatabase: true,
    });
  });

  it('refuses variables that name different databases, and missing required variables', () => {
    const mixed = {
      ...all('127.0.0.1', 'nwf_pe'),
      DATABASE_URL_READONLY: url('127.0.0.1', 'other'),
    };
    expect(checkDatabaseTargets(mixed).refusals.join(' ')).toContain('different databases');
    const c = checkDatabaseTargets({ DATABASE_URL_ADMIN: url('127.0.0.1', 'nwf_pe') });
    expect(c.missing).toEqual(['DATABASE_URL_READONLY', 'DATABASE_URL_ACQUISITION_WORKER']);
    expect(
      checkDatabaseTargets(
        { DATABASE_URL_ADMIN: url('::1', 'nwf_pe') },
        { required: ['DATABASE_URL_ADMIN'] },
      ).ok,
    ).toBe(false);
  });
});

describe('fixed process argument vectors', () => {
  it('builds only typed Engine CLI invocations', () => {
    expect(acquisitionArgv({ kind: 'status', campaignId: CAMPAIGN })).toEqual([
      'acquisition',
      'status',
      '--campaign-id',
      CAMPAIGN,
      '--json',
    ]);
    expect(
      acquisitionArgv({
        kind: 'control',
        campaignId: CAMPAIGN,
        action: 'PAUSE',
        reason: 'lunch break',
      }),
    ).toEqual([
      'acquisition',
      'campaign',
      'control',
      '--campaign-id',
      CAMPAIGN,
      '--action',
      'PAUSE',
      '--reason',
      'lunch break',
      '--execute',
      '--json',
    ]);
    expect(
      acquisitionArgv({ kind: 'worker', campaignId: CAMPAIGN, workerId: 'mac-supervisor' }),
    ).toEqual([
      'acquisition',
      'worker',
      '--campaign-id',
      CAMPAIGN,
      '--worker-id',
      'mac-supervisor',
      '--json',
    ]);
    expect(() => acquisitionArgv({ kind: 'status', campaignId: 'x; rm -rf /' })).toThrow(
      InvocationRefusal,
    );
    expect(() =>
      acquisitionArgv({ kind: 'control', campaignId: CAMPAIGN, action: 'START' as never }),
    ).toThrow(InvocationRefusal);
    expect(() =>
      acquisitionArgv({ kind: 'control', campaignId: CAMPAIGN, action: 'PAUSE', reason: 'a\nb' }),
    ).toThrow(InvocationRefusal);
    expect(supervisorArgv(CAMPAIGN, true)).toEqual([
      'supervise',
      '--campaign-id',
      CAMPAIGN,
      '--allow-test-database',
    ]);
    // ADR 0030 s6: the worker's outbox, only as an absolute canonical path.
    expect(
      acquisitionArgv({
        kind: 'worker',
        campaignId: CAMPAIGN,
        workerId: 'mac-supervisor',
        outboxDir: '/Users/owner/NWF/outbox',
      }),
    ).toEqual([
      'acquisition',
      'worker',
      '--campaign-id',
      CAMPAIGN,
      '--worker-id',
      'mac-supervisor',
      '--outbox-dir',
      '/Users/owner/NWF/outbox',
      '--json',
    ]);
    expect(supervisorArgv(CAMPAIGN, false, '/Users/owner/NWF/outbox')).toEqual([
      'supervise',
      '--campaign-id',
      CAMPAIGN,
      '--outbox-dir',
      '/Users/owner/NWF/outbox',
    ]);
    for (const bad of ['outbox', '/a/../b', '/a/', '/a//b', '/a\nb']) {
      expect(() =>
        acquisitionArgv({
          kind: 'worker',
          campaignId: CAMPAIGN,
          workerId: 'mac-supervisor',
          outboxDir: bad,
        }),
      ).toThrow(InvocationRefusal);
    }
  });

  it('allows exactly two docker compose vectors: ps and up --no-recreate, never down or -v', () => {
    expect(Object.keys(COMPOSE_ARGV).sort()).toEqual(['ps', 'up']);
    expect(COMPOSE_ARGV.up).toEqual([
      'compose',
      '-p',
      'nwf-partnership-engine',
      '-f',
      'docker-compose.yml',
      'up',
      '-d',
      '--no-recreate',
      '--wait',
      'postgres',
    ]);
    for (const argv of Object.values(COMPOSE_ARGV)) {
      expect(argv).not.toContain('down');
      expect(argv).not.toContain('-v');
      expect(argv).not.toContain('rm');
      expect(Object.isFrozen(argv)).toBe(true);
    }
  });
});

describe('reading the Engine CLI envelopes', () => {
  it('reads worker stops, refusals and crashes', () => {
    expect(parseWorkerRun(workerStopped('IDLE', 2))).toMatchObject({
      kind: 'STOPPED',
      stopReason: 'IDLE',
      processed: 2,
    });
    expect(parseWorkerRun(workerRefused('ACQUISITION_HANDLERS_NOT_WIRED', ['DISCOVERED']))).toEqual(
      {
        kind: 'REFUSED',
        code: 'ACQUISITION_HANDLERS_NOT_WIRED',
        detail: null,
      },
    );
    expect(parseWorkerRun(crashed())).toMatchObject({ kind: 'CRASHED' });
    expect(parseWorkerRun(run('{"contract":"something-else"}'))).toMatchObject({ kind: 'CRASHED' });
    expect(
      parseWorkerRun({ exitCode: null, signal: 'SIGKILL', stdout: '', stderrTail: '' }),
    ).toEqual({
      kind: 'CRASHED',
      detail: 'ended by signal SIGKILL',
    });
  });

  it('reads nwf-pe.acquisition-status.v1 inside the CLI envelope, keeping unknown fields', () => {
    expect(parseStatusRun(statusRun())).toMatchObject({
      kind: 'STATUS',
      contract: 'nwf-pe.acquisition-status.v1',
    });
    const grown = parseStatusRun(statusRun({ extra: { stageHandlers: { wired: 3 } } }));
    expect(grown.kind === 'STATUS' && grown.status['stageHandlers']).toEqual({ wired: 3 });
    // Another status schema is not guessed around: the dashboard says it cannot read it.
    const other = parseStatusRun(
      run({
        contract: 'nwf-pe.acquisition-cli.v1',
        outcome: 'STATUS',
        status: { ...statusObject(), schema: 'nwf-pe.acquisition-status.v2' },
      }),
    );
    expect(other).toMatchObject({ kind: 'UNAVAILABLE' });
    expect(other.kind === 'UNAVAILABLE' && other.detail).toContain('nwf-pe.acquisition-status.v2');
    // E-M's provisional bare status envelope never existed in the Engine CLI.
    expect(
      parseStatusRun(run({ contract: 'nwf-pe.acquisition-status.v1', controlState: 'PAUSED' })),
    ).toMatchObject({ kind: 'UNAVAILABLE' });
    expect(parseStatusRun(statusRefused('CAMPAIGN_NOT_FOUND'))).toMatchObject({
      kind: 'REFUSED',
      code: 'CAMPAIGN_NOT_FOUND',
    });
    expect(parseStatusRun(run('{"contract":"nwf-pe.unknown.v9"}'))).toMatchObject({
      kind: 'UNAVAILABLE',
    });
    expect(parseStatusRun(crashed())).toMatchObject({ kind: 'UNAVAILABLE' });
  });

  it('reads the supervisor facts from the v1 campaign and identityReview objects only', () => {
    const facts = campaignFactsOf(
      statusObject({ controlState: 'PAUSED', verified: false, awaiting: 3 }),
    );
    expect(facts).toEqual({
      controlState: 'PAUSED',
      verified: false,
      verificationDetail: null,
      windowStartsAt: '2026-10-27T00:00:00.000Z',
      windowEndsAt: '2026-10-28T00:00:00.000Z',
      windowOpen: true,
      identityReviewAwaiting: 3,
    });
    // A top-level controlState (the old provisional label) is not read.
    expect(campaignFactsOf({ controlState: 'RUNNING' }).controlState).toBeNull();
  });

  it('reads control results', () => {
    expect(parseControlRun(controlRecorded('PAUSE', 'RUNNING'))).toEqual({
      kind: 'RECORDED',
      previousState: 'RUNNING',
      sequenceNo: 2,
    });
    expect(
      parseControlRun(
        run(
          {
            contract: 'nwf-pe.acquisition-cli.v1',
            outcome: 'REFUSED',
            code: 'CAMPAIGN_UNVERIFIED',
            detail: null,
          },
          1,
        ),
      ),
    ).toEqual({ kind: 'REFUSED', code: 'CAMPAIGN_UNVERIFIED', detail: null });
  });
});

describe('the status dashboard', () => {
  const base = (over: Partial<EngineStatusInput> = {}): EngineStatusInput => ({
    nowMs: T0,
    lock: {
      kind: 'HELD',
      lock: { pid: 777, campaignId: CAMPAIGN, startedAt: '2026-10-27T05:00:00.000Z' },
    },
    supervisorState: {
      contract: 'nwf-engine.supervisor-state.v1',
      pid: 777,
      campaignId: CAMPAIGN,
      startedAt: '2026-10-27T05:00:00.000Z',
      phase: 'RUNNING_WORKER',
      phaseSince: '2026-10-27T07:00:00.000Z',
      phaseDetail: null,
      workerPid: 778,
      workerRuns: 3,
      consecutiveFailures: 0,
      nextWakeAt: null,
      lastWorkerExit: {
        at: '2026-10-27T06:59:00.000Z',
        kind: 'STOPPED',
        reason: 'IDLE',
        detail: null,
        processed: 4,
      },
      exit: null,
      updatedAt: '2026-10-27T07:00:00.000Z',
    },
    campaignId: CAMPAIGN,
    campaignRead: parseStatusRun(statusRun()),
    lastPublication: { at: null, source: 'not known on this Mac' },
    ...over,
  });

  it('derives the summary from the v1 status fields and names each derivation', () => {
    const doc = buildEngineStatus(
      base({
        campaignRead: parseStatusRun(statusRun({ awaiting: 2 })),
        outboxDir: '/Users/owner/NWF/outbox',
      }),
    );
    expect(doc.contract).toBe(ENGINE_STATUS_CONTRACT);
    expect(doc.engine).toMatchObject({
      state: 'RUNNING',
      pid: 777,
      uptimeSeconds: 3 * 3600,
      phase: 'RUNNING_WORKER',
      workerPid: 778,
    });
    expect(doc.campaign?.statusContract).toBe('nwf-pe.acquisition-status.v1');
    expect(doc.summary).toMatchObject({
      campaignKey: 'test-campaign-mac-v1',
      controlState: 'RUNNING',
      verified: true,
      queueDepth: {
        DISCOVERED: 0,
        NOMINATED: 3,
        DEDUPLICATED: 2,
        RESEARCH_PENDING: 0,
        RESEARCHED: 0,
        IDENTITY_REVIEW: 0,
        ASSESSABLE: 0,
      },
      openItems: 5,
      discovery: {
        latestRun: { kind: 'SEARCH_PROVIDER', geography: 'JP', outcome: 'COMPLETED' },
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
      identityReview: { awaiting: 2, released: 0 },
      outbox: { researchExports: 0, manifestEntries: 0, lastWrittenAt: null },
      outboxDir: '/Users/owner/NWF/outbox',
      lastAdvancedAt: '2026-10-27T07:59:00.000Z',
      lastSuccessfulResearchAt: null,
      lastWorkerStop: { reason: 'IDLE' },
    });
    expect(doc.summary.failures).toEqual([
      {
        stage: 'NOMINATED',
        outcome: 'REFUSED_TERMINAL',
        reason: 'HANDLER_OUTPUT_INVALID',
        count: 1,
        explanation: 'A stage produced an output the queue refused; nothing was enqueued.',
      },
    ]);
    expect(doc.summary.budgets!['maxSearchRuns']).toEqual({ limit: 1, used: 1, remaining: 0 });
    const codes = doc.notices.map((n) => n.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'LEASES_EXPIRED',
        'REFUSED_NOMINATED_HANDLER_OUTPUT_INVALID',
        'BUDGET_SPENT_maxSearchRuns',
        'IDENTITY_REVIEW_AWAITING',
      ]),
    );
    expect(doc.notReported).toEqual([]);
    expect(doc.additionalFields).toEqual({});
    const text = renderEngineStatus(doc);
    for (const s of [
      'RUNNING (pid 777, up 3h 0m)',
      'Status contract              nwf-pe.acquisition-status.v1',
      'Latest discovery run         SEARCH_PROVIDER JP started 2026-10-27T07:00:00.000Z, COMPLETED',
      'Candidates discovered        5  (nominations; items at NOMINATED)',
      '  duplicates refused         1',
      'Awaiting identity review     2  (released after review: 0)',
      'Outbox                       0 research export(s), 0 manifest line(s); last written never',
      'Outbox directory             /Users/owner/NWF/outbox',
      'Last successful research     none yet',
      'Last publication             not known on this Mac',
      'expired lease',
      'HANDLER_OUTPUT_INVALID - A stage produced an output the queue refused',
      `acquisition review list --campaign-id ${CAMPAIGN}`,
      'acquisition review sign',
    ]) {
      expect(text).toContain(s);
    }
  });

  it('shows fields the status contract adds and lists the ones it does not report', () => {
    const status = statusObject({
      extra: { stageHandlers: { wired: 6 } },
      omit: ['budgets', 'queue', 'lastSuccessfulResearchAt', 'candidates'],
    });
    const doc = buildEngineStatus(
      base({ campaignRead: { kind: 'STATUS', contract: 'nwf-pe.acquisition-status.v1', status } }),
    );
    expect(doc.additionalFields).toEqual({ stageHandlers: { wired: 6 } });
    expect(doc.notReported).toEqual(['candidates', 'lastSuccessfulResearchAt', 'budgets', 'queue']);
    expect(doc.summary).toMatchObject({
      queueDepth: null,
      candidates: null,
      budgets: null,
      lastAdvancedAt: null,
      lastSuccessfulResearchAt: null,
    });
    const text = renderEngineStatus(doc);
    expect(text).toContain('ADDITIONAL FIELDS REPORTED BY THE STATUS CONTRACT');
    expect(text).toContain('stageHandlers');
    expect(text).toContain('{"wired":6}');
    expect(text).toContain('Queue depth                  not reported');
    expect(text).toContain('Candidates discovered        not reported');
    expect(text).toContain('Last successful research     not reported');
    expect(text).toContain(
      'Not reported by the campaign status: candidates, lastSuccessfulResearchAt, budgets, queue',
    );
  });

  it('explains a stale lock, an unverified campaign, an unavailable status and the last exit', () => {
    const stale = buildEngineStatus(
      base({
        lock: { kind: 'STALE', lock: { pid: 777, campaignId: CAMPAIGN, startedAt: '' } },
        campaignRead: parseStatusRun(
          statusRun({ verified: false, verificationDetail: 'KEY_UNKNOWN' }),
        ),
      }),
    );
    expect(stale.engine.state).toBe('STALE');
    expect(stale.notices.map((n) => n.code)).toEqual(
      expect.arrayContaining(['STALE_LOCK', 'CAMPAIGN_UNVERIFIED']),
    );
    expect(renderEngineStatus(stale)).toContain('nwf-engine recover');
    const stopped = buildEngineStatus(
      base({
        lock: { kind: 'FREE' },
        supervisorState: {
          ...base().supervisorState!,
          phase: 'EXITED',
          exit: {
            at: '2026-10-27T07:50:00.000Z',
            reason: 'BUDGET_EXHAUSTED',
            detail: 'maxSearchRuns',
          },
        },
        campaignRead: { kind: 'UNAVAILABLE', detail: 'exit code 1' },
      }),
    );
    expect(stopped.engine).toMatchObject({
      state: 'NOT_RUNNING',
      lastExit: { reason: 'BUDGET_EXHAUSTED' },
    });
    const text = renderEngineStatus(stopped);
    expect(text).toContain('NOT RUNNING');
    expect(text).toContain('A budget the campaign signed is spent');
    expect(text).toContain('Campaign status could not be read');
    const none = buildEngineStatus(
      base({ lock: { kind: 'FREE' }, supervisorState: null, campaignId: null, campaignRead: null }),
    );
    expect(renderEngineStatus(none)).toContain('none configured');
  });

  it('reads the last publication only from an Operator status file, never guessing', () => {
    expect(readOperatorPublication(null)).toEqual({ at: null, source: 'not known on this Mac' });
    const dir = mkdtempSync(join(tmpdir(), 'nwf-engine-pub-'));
    const good = join(dir, 'operator-status.json');
    writeFileSync(good, JSON.stringify({ lastPublicationAt: '2026-10-26T18:00:00.000Z' }));
    expect(readOperatorPublication(good)).toEqual({ at: '2026-10-26T18:00:00.000Z', source: good });
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ published: 'yesterday' }));
    expect(readOperatorPublication(bad).at).toBeNull();
    expect(readOperatorPublication(join(dir, 'missing.json')).source).toContain(
      'not known on this Mac',
    );
  });
});

/**
 * WW E-M - THE `nwf-engine` COMMANDS.
 *
 * Each command explains a refusal in plain language and exits non-zero. All
 * effects go through injected ports (processes, files, signals, clock), so
 * every command is testable without a real child process, Docker, launchd or
 * database. What the commands can change, exhaustively:
 *
 *   - the runtime's own files (lock, pidfile, state, config, logs);
 *   - one Postgres container's RUNNING state, via `docker compose up`;
 *   - campaign control events PAUSE / RESUME / STOP / EMERGENCY_STOP, recorded
 *     by the existing owner-path CLI exactly as the OWNER would;
 *   - with `install-agent --i-understand --execute`, one user plist.
 *
 * Nothing here applies a migration, records or starts a campaign, grants
 * anything, changes a switch, or reads a key.
 */
import { existsSync } from 'node:fs';

import { ENGINE_USAGE, parseEngineArgs, type EngineCommand, type Values } from './args.js';
import type { RuntimeClock } from './clock.js';
import { renderDoctor, runDoctor, type DoctorDeps } from './doctor.js';
import { parseControlRun, parseStatusRun, type StatusRead } from './envelope.js';
import {
  launchAgentPlist,
  ownerAgentInstructions,
  removeLaunchAgent,
  writeLaunchAgent,
} from './launchAgent.js';
import {
  acquireLock,
  inspectLock,
  readConfig,
  readSupervisorState,
  releaseLock,
  removeLockFiles,
  writeConfig,
  writeSupervisorState,
  type IsAlive,
} from './lock.js';
import {
  createRotatingLog,
  fileSize,
  LOG_KEEP,
  LOG_MAX_BYTES,
  readSince,
  rotateIfLarger,
  tailLines,
} from './logs.js';
import { ensurePrivateDir, type EnginePaths } from './paths.js';
import type { ProcessPort, RuntimeControlAction } from './processes.js';
import { buildEngineStatus, readOperatorPublication, renderEngineStatus } from './status.js';
import { Supervisor, SUPERVISOR_WORKER_ID, type SupervisorPolicy } from './supervisor.js';
import {
  checkDatabaseTargets,
  type RuntimeDatabaseUrls,
  type RuntimeDatabaseVariable,
} from './targets.js';

export type EngineSignal = 'SIGTERM' | 'SIGUSR1';

export interface EngineDeps {
  readonly paths: EnginePaths;
  readonly urls: RuntimeDatabaseUrls;
  readonly procs: ProcessPort;
  readonly clock: RuntimeClock;
  readonly pid: number;
  readonly nodePath: string;
  readonly isAlive: IsAlive;
  /** Sends a signal to a process; false when it does not exist. */
  readonly signal: (pid: number, sig: EngineSignal) => boolean;
  /** Registers process-signal handlers; returns an unregister function. */
  readonly onSignals: (
    handlers: Partial<Record<'SIGTERM' | 'SIGINT' | 'SIGUSR1' | 'SIGHUP', () => void>>,
  ) => () => void;
  readonly doctor: (allowTestDatabase: boolean) => DoctorDeps;
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
  readonly supervisorPolicy?: Partial<SupervisorPolicy>;
  /** How long `start` waits to see the supervisor take its lock. */
  readonly startConfirmMs?: number;
  /** `logs --follow` stops when this aborts (tests); production stops on SIGINT. */
  readonly followSignal?: AbortSignal;
}

class Refusal extends Error {}

const ALL_VARS: readonly RuntimeDatabaseVariable[] = [
  'DATABASE_URL_ADMIN',
  'DATABASE_URL_READONLY',
  'DATABASE_URL_ACQUISITION_WORKER',
];

export async function runEngine(argv: readonly string[], deps: EngineDeps): Promise<number> {
  const parsed = parseEngineArgs(argv);
  if (parsed.kind === 'HELP') {
    deps.out(ENGINE_USAGE);
    return parsed.exitCode;
  }
  if (parsed.kind === 'ERROR') {
    deps.err(`${parsed.message}\n\n${ENGINE_USAGE}`);
    return 1;
  }
  try {
    return await COMMANDS[parsed.command](parsed.values, deps);
  } catch (error) {
    if (error instanceof Refusal) {
      deps.err(`REFUSED: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Shared steps.
// ---------------------------------------------------------------------------

const allowTest = (v: Values): boolean => v['allow-test-database'] === true;

function guardTargets(
  v: Values,
  deps: EngineDeps,
  required: readonly RuntimeDatabaseVariable[],
): void {
  const check = checkDatabaseTargets(deps.urls, { allowTestDatabase: allowTest(v), required });
  if (!check.ok) throw new Refusal(check.refusals.join('\n         '));
}

function campaignIdOf(v: Values, deps: EngineDeps): string {
  const flag = v['campaign-id'];
  if (typeof flag === 'string') return flag;
  // The campaign a supervisor is running for, then the one `start` remembered.
  const lock = inspectLock(deps.paths, deps.isAlive);
  if (lock.kind === 'HELD' && lock.lock.campaignId) return lock.lock.campaignId;
  const remembered = readConfig(deps.paths).campaignId;
  if (remembered === null) {
    throw new Refusal(
      'No campaign is configured on this Mac. Start one with `nwf-engine start --campaign-id <uuid>` ' +
        '(the uuid of a campaign the OWNER signed and recorded).',
    );
  }
  return remembered;
}

function engineLog(deps: EngineDeps) {
  return createRotatingLog(deps.paths.logDir, deps.paths.logFile, () => deps.clock.now());
}

async function readCampaign(deps: EngineDeps, campaignId: string): Promise<StatusRead> {
  return parseStatusRun(await deps.procs.acquisition({ kind: 'status', campaignId }));
}

function notifySupervisor(deps: EngineDeps, sig: EngineSignal): string {
  const lock = inspectLock(deps.paths, deps.isAlive);
  if (lock.kind !== 'HELD') {
    return 'The engine is not running on this Mac; the event is recorded and `nwf-engine start` will honour it.';
  }
  return deps.signal(lock.lock.pid, sig)
    ? `The supervisor (pid ${lock.lock.pid}) was notified.`
    : `The supervisor (pid ${lock.lock.pid}) could not be signalled; it will see the change at its next check.`;
}

// ---------------------------------------------------------------------------
// The commands.
// ---------------------------------------------------------------------------

const COMMANDS: Record<EngineCommand, (v: Values, deps: EngineDeps) => Promise<number>> = {
  async doctor(v, deps) {
    const report = await runDoctor(deps.doctor(allowTest(v)));
    deps.out(v['json'] === true ? `${JSON.stringify(report, null, 2)}\n` : renderDoctor(report));
    return report.ok ? 0 : 1;
  },

  async start(v, deps) {
    const campaignId = campaignIdOf(v, deps);
    guardTargets(v, deps, ALL_VARS);
    const lock = inspectLock(deps.paths, deps.isAlive);
    if (lock.kind === 'HELD') {
      if (lock.lock.campaignId === campaignId) {
        deps.out(
          `The engine is already running for campaign ${campaignId} (pid ${lock.lock.pid}). Nothing to do.\n`,
        );
        return 0;
      }
      throw new Refusal(
        `The engine is already running for ANOTHER campaign (${lock.lock.campaignId}, pid ${lock.lock.pid}). ` +
          'Run `nwf-engine shutdown` first; one campaign runs at a time on this Mac.',
      );
    }
    if (lock.kind === 'STALE') {
      throw new Refusal(
        `A supervisor (pid ${lock.lock.pid}) crashed or the Mac restarted, and its lock remains. ` +
          'Run `nwf-engine recover` first; it checks that nothing is still running.',
      );
    }

    // The local Postgres: start it if stopped. Never down, never -v, never a recreate.
    const ps = await deps.procs.compose('ps');
    if (ps.exitCode !== 0) {
      throw new Refusal(
        'Docker is not running or not reachable. Start Docker Desktop, then run `nwf-engine start` again.',
      );
    }
    if (!/"State"\s*:\s*"running"/.test(ps.stdout)) {
      deps.out(
        'Starting the Engine Postgres container (docker compose up -d --no-recreate --wait postgres) ...\n',
      );
      const up = await deps.procs.compose('up');
      if (up.exitCode !== 0) {
        throw new Refusal(
          `The Engine Postgres container did not start: ${up.stderrTail.trim().split('\n').slice(-1)[0] ?? 'no output'}. ` +
            'Nothing was removed. Check Docker Desktop, then try again.',
        );
      }
    }

    const report = await runDoctor(deps.doctor(allowTest(v)));
    if (!report.ok) {
      deps.out(renderDoctor(report));
      throw new Refusal('the preflight above has FAIL lines; nothing was started.');
    }

    writeConfig(deps.paths, { ...readConfig(deps.paths), campaignId });
    ensurePrivateDir(deps.paths.logDir);
    rotateIfLarger(deps.paths.supervisorOutFile, LOG_MAX_BYTES, LOG_KEEP);
    const pid = deps.procs.spawnSupervisor(campaignId, allowTest(v), deps.paths.supervisorOutFile);
    if (pid === null) throw new Refusal('the supervisor process could not be started.');
    const deadline = deps.clock.now() + (deps.startConfirmMs ?? 15_000);
    while (deps.clock.now() < deadline) {
      const now = inspectLock(deps.paths, deps.isAlive);
      if (now.kind === 'HELD' && now.lock.pid === pid) {
        deps.out(
          `Started: supervisor pid ${pid} for campaign ${campaignId}.\n` +
            'It keeps the worker running, waits while the campaign is paused, and exits for good when the campaign ends.\n' +
            '`nwf-engine status` shows what it is doing; `nwf-engine logs --follow` shows its log.\n',
        );
        return 0;
      }
      if (!deps.isAlive(pid)) break;
      await deps.clock.sleep(200);
    }
    const tail = tailLines(deps.paths.supervisorOutFile, 5).concat(
      tailLines(deps.paths.logFile, 5),
    );
    throw new Refusal(
      `the supervisor (pid ${pid}) did not take its lock.\n${tail.map((l) => `         ${l}`).join('\n')}`,
    );
  },

  async supervise(v, deps) {
    const campaignId = v['campaign-id'] as string;
    const log = engineLog(deps);
    const targets = checkDatabaseTargets(deps.urls, { allowTestDatabase: allowTest(v) });
    if (!targets.ok) {
      log.write(`supervisor refused: ${targets.refusals.join(' ')}`);
      throw new Refusal(targets.refusals.join(' '));
    }
    const startedAt = new Date(deps.clock.now()).toISOString();
    const acquired = acquireLock(
      deps.paths,
      { pid: deps.pid, campaignId, startedAt },
      deps.isAlive,
    );
    if (!acquired.ok) {
      const why = acquired.state.kind === 'HELD' ? 'LOCK_HELD' : 'LOCK_STALE';
      log.write(`supervisor ${deps.pid} did not start: ${why} (pid ${acquired.state.lock.pid})`);
      throw new Refusal(`${why}: pid ${acquired.state.lock.pid} holds the lock.`);
    }
    const supervisor = new Supervisor({
      campaignId,
      pid: deps.pid,
      clock: deps.clock,
      readStatus: () => deps.procs.acquisition({ kind: 'status', campaignId }),
      launchWorker: () =>
        deps.procs.launchWorker(campaignId, SUPERVISOR_WORKER_ID, (line) =>
          log.write(`[worker] ${line}`),
        ),
      log: (line) => log.write(line),
      onState: (state) => writeSupervisorState(deps.paths, state),
      ...(deps.supervisorPolicy !== undefined ? { policy: deps.supervisorPolicy } : {}),
    });
    const off = deps.onSignals({
      SIGTERM: () => supervisor.requestShutdown(),
      SIGINT: () => supervisor.requestShutdown(),
      SIGUSR1: () => supervisor.wake(),
      SIGHUP: () => log.write('SIGHUP ignored (use `nwf-engine shutdown`)'),
    });
    let releasable = true;
    try {
      const exit = await supervisor.run();
      deps.out(`supervisor exited: ${exit.reason}\n`);
      return 0;
    } catch (error) {
      // A supervisor that fails while its worker is alive KEEPS the lock: the
      // lock then turns stale, and `recover` refuses until that worker is gone,
      // so a second worker can never be started next to it.
      releasable = !supervisor.hasLiveWorker;
      log.write(
        `supervisor failed: ${error instanceof Error ? error.message : String(error)}` +
          (releasable ? '' : '; its worker is still running, so the lock is kept'),
      );
      throw error;
    } finally {
      off();
      if (releasable) releaseLock(deps.paths, deps.pid);
    }
  },

  async status(v, deps) {
    const config = readConfig(deps.paths);
    const lock = inspectLock(deps.paths, deps.isAlive);
    const flag = v['campaign-id'];
    const campaignId =
      typeof flag === 'string'
        ? flag
        : lock.kind !== 'FREE' && lock.lock.campaignId
          ? lock.lock.campaignId
          : config.campaignId;
    let campaignRead: StatusRead | null = null;
    if (campaignId !== null) {
      const check = checkDatabaseTargets(deps.urls, {
        allowTestDatabase: allowTest(v),
        required: ['DATABASE_URL_READONLY'],
      });
      campaignRead = check.ok
        ? await readCampaign(deps, campaignId)
        : { kind: 'UNAVAILABLE', detail: check.refusals.join(' ') };
    }
    const operatorFile =
      typeof v['operator-status-file'] === 'string'
        ? v['operator-status-file']
        : config.operatorStatusFile;
    const doc = buildEngineStatus({
      nowMs: deps.clock.now(),
      lock,
      supervisorState: readSupervisorState(deps.paths),
      campaignId,
      campaignRead,
      lastPublication: readOperatorPublication(operatorFile),
    });
    deps.out(v['json'] === true ? `${JSON.stringify(doc, null, 2)}\n` : renderEngineStatus(doc));
    return 0;
  },

  pause: (v, deps) => control(v, deps, 'PAUSE'),
  resume: (v, deps) => control(v, deps, 'RESUME'),

  async stop(v, deps) {
    if (v['emergency'] === true) return control(v, deps, 'EMERGENCY_STOP');
    if (v['execute'] !== true) {
      const campaignId = campaignIdOf(v, deps);
      deps.out(
        `DRY RUN: \`nwf-engine stop --execute\` records STOP for campaign ${campaignId}.\n` +
          '  STOP ENDS the campaign for good (it is terminal: a new signed campaign is needed to continue).\n' +
          '  The current item finishes and its outcome is recorded; then the worker and the supervisor exit.\n' +
          '  To stop the engine on this Mac WITHOUT ending the campaign, use `nwf-engine shutdown`.\n' +
          '  To pause it, use `nwf-engine pause`.\n',
      );
      return 0;
    }
    return control(v, deps, 'STOP');
  },

  async shutdown(v, deps) {
    const lock = inspectLock(deps.paths, deps.isAlive);
    if (lock.kind !== 'HELD') {
      deps.out(
        lock.kind === 'STALE'
          ? `The engine is not running (a stale lock of pid ${lock.lock.pid} remains: run \`nwf-engine recover\`).\n`
          : 'The engine is not running on this Mac.\n',
      );
      return 0;
    }
    const sent = deps.signal(lock.lock.pid, 'SIGTERM');
    const text = sent
      ? `Shutdown requested (pid ${lock.lock.pid}). The current item finishes and its outcome is recorded first; ` +
        'the campaign itself is unchanged. `nwf-engine status` shows when it has stopped.'
      : `The supervisor (pid ${lock.lock.pid}) could not be signalled.`;
    deps.out(
      v['json'] === true
        ? `${JSON.stringify({ contract: 'nwf-engine.shutdown.v1', pid: lock.lock.pid, signalled: sent })}\n`
        : `${text}\n`,
    );
    return sent ? 0 : 1;
  },

  async logs(v, deps) {
    const count = typeof v['lines'] === 'string' ? Number(v['lines']) : 100;
    const file = deps.paths.logFile;
    if (!existsSync(file)) deps.out(`No log yet (${file}).\n`);
    for (const line of tailLines(file, count)) deps.out(`${line}\n`);
    if (v['follow'] !== true) return 0;
    const stop = new AbortController();
    const off = deps.onSignals({ SIGINT: () => stop.abort(), SIGTERM: () => stop.abort() });
    deps.followSignal?.addEventListener('abort', () => stop.abort(), { once: true });
    let offset = fileSize(file);
    try {
      while (!stop.signal.aborted) {
        await deps.clock.sleep(1000, stop.signal);
        const next = readSince(file, offset);
        offset = next.offset;
        if (next.text.length > 0) deps.out(next.text);
      }
    } finally {
      off();
    }
    return 0;
  },

  async recover(v, deps) {
    const lock = inspectLock(deps.paths, deps.isAlive);
    if (lock.kind === 'HELD') {
      throw new Refusal(
        `The supervisor (pid ${lock.lock.pid}) is alive; there is nothing to recover. ` +
          'Use `nwf-engine shutdown` to stop it.',
      );
    }
    const lines: string[] = [];
    const state = readSupervisorState(deps.paths);
    if (lock.kind === 'STALE') {
      const worker = state !== null && state.pid === lock.lock.pid ? state.workerPid : null;
      if (worker !== null && deps.isAlive(worker)) {
        throw new Refusal(
          `The supervisor (pid ${lock.lock.pid}) is gone, but its worker (pid ${worker}) is still alive. ` +
            `Check it with \`ps -p ${worker} -o command=\`; if it is the Engine worker, \`kill -TERM ${worker}\` ` +
            'lets it finish its current item and exit. Then run `nwf-engine recover` again.',
        );
      }
      removeLockFiles(deps.paths);
      engineLog(deps).write(
        `recover: removed the stale lock of supervisor pid ${lock.lock.pid}; no data was deleted`,
      );
      lines.push(
        `Recovered: the stale lock of supervisor pid ${lock.lock.pid} was removed (no supervisor or worker process is alive).`,
        'No data was deleted: the queue, claims and outcomes are in the database, untouched.',
      );
    } else {
      lines.push('Nothing to recover: no supervisor lock exists.');
    }
    const campaignId =
      typeof v['campaign-id'] === 'string'
        ? v['campaign-id']
        : (lock.kind !== 'FREE' && lock.lock.campaignId) || readConfig(deps.paths).campaignId;
    if (campaignId !== null) {
      const check = checkDatabaseTargets(deps.urls, {
        allowTestDatabase: allowTest(v),
        required: ['DATABASE_URL_READONLY'],
      });
      const read = check.ok ? await readCampaign(deps, campaignId) : null;
      if (read?.kind === 'STATUS') {
        let expired = 0;
        let claimed = 0;
        const stages = read.status['stages'];
        if (typeof stages === 'object' && stages !== null) {
          for (const s of Object.values(stages as Record<string, Record<string, unknown>>)) {
            expired += typeof s['LEASE_EXPIRED'] === 'number' ? s['LEASE_EXPIRED'] : 0;
            claimed += typeof s['CLAIMED'] === 'number' ? s['CLAIMED'] : 0;
          }
        }
        lines.push(
          `Campaign ${campaignId}: ${expired} item(s) with an expired lease and ${claimed} with a live claim.`,
          'An item whose worker died is retried as its next attempt once its lease expires; the database allows at most one ADVANCED outcome per item, so nothing runs twice to completion.',
        );
      } else {
        lines.push(
          `Campaign ${campaignId}: lease state not known (${read === null ? 'database variables not usable' : read.kind === 'REFUSED' ? read.code : read.detail}).`,
        );
      }
    }
    lines.push('You can now run `nwf-engine start`.');
    deps.out(`${lines.join('\n')}\n`);
    return 0;
  },

  async 'install-agent'(v, deps) {
    if (v['i-understand'] !== true) {
      throw new Refusal(
        'install-agent writes a user LaunchAgent that can start the engine. Nothing is installed by default. ' +
          'Re-run with --i-understand to see exactly what would be written.',
      );
    }
    const campaignId = campaignIdOf(v, deps);
    const plist = launchAgentPlist({
      nodePath: deps.nodePath,
      paths: deps.paths,
      campaignId,
      runAtLoad: v['run-at-load'] === true,
    });
    const how = ownerAgentInstructions(deps.paths);
    deps.out(`LaunchAgent file: ${deps.paths.launchAgentFile}\n\n${plist}\n`);
    if (v['execute'] !== true) {
      deps.out('DRY RUN: nothing was written. Re-run with --execute to write exactly this file.\n');
      return 0;
    }
    writeLaunchAgent(deps.paths, plist);
    deps.out(
      `Written: ${deps.paths.launchAgentFile}\n` +
        'It is NOT loaded. To load it yourself (the runtime never does):\n' +
        how.load.map((l) => `  ${l}`).join('\n') +
        '\nTo remove it later: `nwf-engine uninstall-agent --execute`.\n',
    );
    return 0;
  },

  async 'uninstall-agent'(v, deps) {
    const how = ownerAgentInstructions(deps.paths);
    const exists = existsSync(deps.paths.launchAgentFile);
    if (!exists) {
      deps.out(`No LaunchAgent file at ${deps.paths.launchAgentFile}; nothing to remove.\n`);
      return 0;
    }
    deps.out(
      `If you loaded it, unload it yourself first:\n${how.unload.map((l) => `  ${l}`).join('\n')}\n`,
    );
    if (v['execute'] !== true) {
      deps.out(`DRY RUN: ${deps.paths.launchAgentFile} would be removed. Re-run with --execute.\n`);
      return 0;
    }
    removeLaunchAgent(deps.paths);
    deps.out(`Removed ${deps.paths.launchAgentFile}.\n`);
    return 0;
  },
};

async function control(v: Values, deps: EngineDeps, action: RuntimeControlAction): Promise<number> {
  const campaignId = campaignIdOf(v, deps);
  guardTargets(v, deps, ['DATABASE_URL_ADMIN', 'DATABASE_URL_READONLY']);
  const reason = typeof v['reason'] === 'string' ? v['reason'] : undefined;
  const result = parseControlRun(
    await deps.procs.acquisition({
      kind: 'control',
      campaignId,
      action,
      ...(reason !== undefined ? { reason } : {}),
    }),
  );
  const json = v['json'] === true;
  if (result.kind !== 'RECORDED') {
    const why =
      result.kind === 'REFUSED'
        ? `${result.code}${result.detail ? ` (${result.detail})` : ''}`
        : result.detail;
    if (json)
      deps.out(
        `${JSON.stringify({ contract: 'nwf-engine.control.v1', campaignId, action, outcome: result.kind, detail: why })}\n`,
      );
    throw new Refusal(
      `${action} was not recorded for campaign ${campaignId}: ${why}.${CONTROL_HINT[action]}`,
    );
  }
  engineLog(deps).write(
    `${action} recorded for campaign ${campaignId} (#${String(result.sequenceNo)}; was ${String(result.previousState)})`,
  );
  const notified = notifySupervisor(deps, action === 'EMERGENCY_STOP' ? 'SIGTERM' : 'SIGUSR1');
  if (json) {
    deps.out(
      `${JSON.stringify({ contract: 'nwf-engine.control.v1', campaignId, action, outcome: 'RECORDED', previousState: result.previousState, sequenceNo: result.sequenceNo, supervisor: notified })}\n`,
    );
  } else {
    deps.out(
      `RECORDED ${action} for campaign ${campaignId} (was ${String(result.previousState)}). ${CONTROL_EFFECT[action]}\n${notified}\n`,
    );
  }
  return 0;
}

const CONTROL_EFFECT: Readonly<Record<RuntimeControlAction, string>> = {
  PAUSE: 'The current item finishes; nothing new is claimed until RESUME.',
  RESUME: 'Work continues.',
  STOP: 'The current item finishes; the campaign is over.',
  EMERGENCY_STOP: 'Running work is aborted and recorded as refused; the campaign is over.',
};

const CONTROL_HINT: Readonly<Record<RuntimeControlAction, string>> = {
  PAUSE: ' Only a RUNNING campaign can be paused.',
  RESUME:
    ' Only a PAUSED campaign can be resumed, and RESUME needs the campaign to verify under the pinned OWNER key set.',
  STOP: '',
  EMERGENCY_STOP: '',
};

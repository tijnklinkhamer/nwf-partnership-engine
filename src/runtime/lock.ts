/**
 * WW E-M - SINGLE INSTANCE, STATE AND CONFIG FILES OF THE MAC RUNTIME.
 *
 * ONE SUPERVISOR PER MAC USER. The lock is an exclusive-create file
 * (`O_CREAT | O_EXCL`), so two supervisors racing to start cannot both win;
 * the loser exits without launching a worker. This is the LOCAL half of "never
 * two workers for one campaign"; the database's own claim rules (one claim
 * per item attempt, a concurrency cap per campaign) are the other half and
 * hold whatever happens to these files.
 *
 * A lock whose process is gone is STALE (the supervisor crashed or the Mac
 * lost power). `start` refuses a stale lock rather than silently taking it
 * over; `recover` checks that neither the supervisor nor its worker is alive
 * and only then removes the lock and pidfile. Nothing in the database is
 * touched by any of this, and no data is deleted.
 *
 * All files are 0600 inside a 0700 directory and hold no secret.
 */
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';

import { isObject } from './envelope.js';
import { ensurePrivateDir, type EnginePaths } from './paths.js';

export const SUPERVISOR_STATE_CONTRACT = 'nwf-engine.supervisor-state.v1';
export const ENGINE_CONFIG_CONTRACT = 'nwf-engine.config.v1';

export interface LockInfo {
  readonly pid: number;
  readonly campaignId: string;
  readonly startedAt: string;
}

/** Whether a pid names a live process (EPERM: alive, someone else's). */
export type IsAlive = (pid: number) => boolean;

export const processIsAlive: IsAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

/** Writes a file atomically (temp + rename) with mode 0600. */
export function writePrivateFile(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, path);
}

export function readLock(paths: EnginePaths): LockInfo | null {
  const raw = readJson(paths.lockFile);
  if (!isObject(raw))
    return existsSync(paths.lockFile) ? { pid: -1, campaignId: '', startedAt: '' } : null;
  return {
    pid: typeof raw['pid'] === 'number' ? raw['pid'] : -1,
    campaignId: typeof raw['campaignId'] === 'string' ? raw['campaignId'] : '',
    startedAt: typeof raw['startedAt'] === 'string' ? raw['startedAt'] : '',
  };
}

export type LockState =
  | { readonly kind: 'FREE' }
  | { readonly kind: 'HELD'; readonly lock: LockInfo }
  | { readonly kind: 'STALE'; readonly lock: LockInfo };

export function inspectLock(paths: EnginePaths, isAlive: IsAlive): LockState {
  const lock = readLock(paths);
  if (lock === null) return { kind: 'FREE' };
  return isAlive(lock.pid) ? { kind: 'HELD', lock } : { kind: 'STALE', lock };
}

export type AcquireResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly state: Exclude<LockState, { kind: 'FREE' }> };

/** Takes the lock for `info.pid`, exclusively. Never takes over a held OR stale lock. */
export function acquireLock(paths: EnginePaths, info: LockInfo, isAlive: IsAlive): AcquireResult {
  ensurePrivateDir(paths.stateDir);
  let fd: number;
  try {
    fd = openSync(paths.lockFile, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const state = inspectLock(paths, isAlive);
    if (state.kind === 'FREE') return acquireLock(paths, info, isAlive);
    return { ok: false, state };
  }
  try {
    writeSync(fd, `${JSON.stringify(info)}\n`);
  } finally {
    closeSync(fd);
  }
  writePrivateFile(paths.pidFile, `${info.pid}\n`);
  return { ok: true };
}

/** Releases the lock only if `pid` holds it. */
export function releaseLock(paths: EnginePaths, pid: number): boolean {
  const lock = readLock(paths);
  if (lock === null || lock.pid !== pid) return false;
  removeLockFiles(paths);
  return true;
}

/** Removes lock and pidfile (recover, after its liveness checks). Deletes no data. */
export function removeLockFiles(paths: EnginePaths): void {
  for (const file of [paths.lockFile, paths.pidFile]) {
    try {
      unlinkSync(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// The supervisor's reported state (read by `status` and `recover`).
// ---------------------------------------------------------------------------

export interface SupervisorStateFile {
  readonly contract: typeof SUPERVISOR_STATE_CONTRACT;
  readonly pid: number;
  readonly campaignId: string;
  readonly startedAt: string;
  readonly phase: string;
  readonly phaseSince: string;
  readonly phaseDetail: string | null;
  readonly workerPid: number | null;
  readonly workerRuns: number;
  readonly consecutiveFailures: number;
  readonly nextWakeAt: string | null;
  readonly lastWorkerExit: {
    readonly at: string;
    readonly kind: string;
    readonly reason: string;
    readonly detail: string | null;
    readonly processed: number | null;
  } | null;
  readonly exit: {
    readonly at: string;
    readonly reason: string;
    readonly detail: string | null;
  } | null;
  readonly updatedAt: string;
}

export function writeSupervisorState(paths: EnginePaths, state: SupervisorStateFile): void {
  ensurePrivateDir(paths.stateDir);
  writePrivateFile(paths.stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

export function readSupervisorState(paths: EnginePaths): SupervisorStateFile | null {
  const raw = readJson(paths.stateFile);
  return isObject(raw) && raw['contract'] === SUPERVISOR_STATE_CONTRACT
    ? (raw as unknown as SupervisorStateFile)
    : null;
}

// ---------------------------------------------------------------------------
// The remembered campaign (so daily commands need no uuid).
// ---------------------------------------------------------------------------

export interface EngineConfig {
  readonly contract: typeof ENGINE_CONFIG_CONTRACT;
  readonly campaignId: string | null;
  /** Optional path to a status file the Operator writes (last publication time). */
  readonly operatorStatusFile: string | null;
}

export function readConfig(paths: EnginePaths): EngineConfig {
  const raw = readJson(paths.configFile);
  if (!isObject(raw) || raw['contract'] !== ENGINE_CONFIG_CONTRACT) {
    return { contract: ENGINE_CONFIG_CONTRACT, campaignId: null, operatorStatusFile: null };
  }
  return {
    contract: ENGINE_CONFIG_CONTRACT,
    campaignId: typeof raw['campaignId'] === 'string' ? raw['campaignId'] : null,
    operatorStatusFile:
      typeof raw['operatorStatusFile'] === 'string' ? raw['operatorStatusFile'] : null,
  };
}

export function writeConfig(paths: EnginePaths, config: EngineConfig): void {
  ensurePrivateDir(paths.stateDir);
  writePrivateFile(paths.configFile, `${JSON.stringify(config, null, 2)}\n`);
}

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
 * WW H-RT hardening:
 *
 *   - PID REUSE ACROSS A REBOOT. A pid only names the same process within one
 *     boot. A lock written BEFORE the system booted (`kern.boottime`) is STALE
 *     whatever process now has that pid. When the boot time cannot be read,
 *     liveness falls back to the pid alone.
 *   - A PER-START NONCE. Each supervisor writes a random nonce into the lock
 *     and into its own state file. Nothing signals the lock's pid unless the
 *     state file names the same pid and the same nonce and has not exited.
 *   - NO REMOVAL BY PATH. A lock is removed only by an atomic rename to a
 *     unique name, followed by re-reading what was moved: if it is not the
 *     exact lock that was judged removable (another supervisor took the lock
 *     in between), it is put back with a no-clobber `link`. So a slow
 *     `recover` can never delete the lock of a supervisor that started while
 *     it ran, and two recovers plus a start cannot leave two supervisors.
 *
 * All files are 0600 inside a 0700 directory and hold no secret.
 */
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  linkSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';

import { isObject, type CliRun } from './envelope.js';
import { ensurePrivateDir, type EnginePaths } from './paths.js';

export const SUPERVISOR_STATE_CONTRACT = 'nwf-engine.supervisor-state.v1';
export const ENGINE_CONFIG_CONTRACT = 'nwf-engine.config.v1';

export interface LockInfo {
  readonly pid: number;
  readonly campaignId: string;
  readonly startedAt: string;
  /** Random per start; the supervisor's state file carries the same value. */
  readonly nonce: string;
}

/** A fresh per-start nonce (128 bits, hex). */
export function newLockNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * `sysctl -n kern.boottime` prints `{ sec = 1792317977, usec = 822231 } Sun
 * Oct 18 ...`. Returns the boot instant in epoch milliseconds, or null when
 * the probe failed or printed anything else (then liveness is the pid alone).
 */
export function parseBootTime(run: CliRun): number | null {
  if (run.exitCode !== 0) return null;
  const m = /^\{\s*sec\s*=\s*([0-9]{1,12})\s*,\s*usec\s*=\s*([0-9]{1,6})\s*\}/.exec(
    run.stdout.trim(),
  );
  if (m === null) return null;
  const ms = Number(m[1]) * 1000 + Math.floor(Number(m[2]) / 1000);
  return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
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

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function lockInfoOf(text: string): LockInfo {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    raw = null;
  }
  if (!isObject(raw)) return { pid: -1, campaignId: '', startedAt: '', nonce: '' };
  return {
    pid: typeof raw['pid'] === 'number' ? raw['pid'] : -1,
    campaignId: typeof raw['campaignId'] === 'string' ? raw['campaignId'] : '',
    startedAt: typeof raw['startedAt'] === 'string' ? raw['startedAt'] : '',
    nonce: typeof raw['nonce'] === 'string' ? raw['nonce'] : '',
  };
}

export function readLock(paths: EnginePaths): LockInfo | null {
  const text = readText(paths.lockFile);
  return text === null ? null : lockInfoOf(text);
}

/** Why a lock is stale: its pid is gone, or it was written before this boot. */
export type StaleReason = 'PROCESS_GONE' | 'PREDATES_BOOT';

export type LockState =
  | { readonly kind: 'FREE' }
  | { readonly kind: 'HELD'; readonly lock: LockInfo; readonly raw: string }
  | {
      readonly kind: 'STALE';
      readonly lock: LockInfo;
      readonly raw: string;
      readonly why: StaleReason;
    };

/**
 * `bootTimeMs` (from `parseBootTime`): a lock whose `startedAt` is before it,
 * or unreadable while it is known, is STALE even if its pid is alive - that
 * pid now names some other process.
 */
export function inspectLock(
  paths: EnginePaths,
  isAlive: IsAlive,
  bootTimeMs: number | null = null,
): LockState {
  const raw = readText(paths.lockFile);
  if (raw === null) return { kind: 'FREE' };
  const lock = lockInfoOf(raw);
  if (bootTimeMs !== null) {
    const started = Date.parse(lock.startedAt);
    if (Number.isNaN(started) || started < bootTimeMs) {
      return { kind: 'STALE', lock, raw, why: 'PREDATES_BOOT' };
    }
  }
  return isAlive(lock.pid)
    ? { kind: 'HELD', lock, raw }
    : { kind: 'STALE', lock, raw, why: 'PROCESS_GONE' };
}

/**
 * Whether the lock's pid is confirmed as THIS Mac's supervisor: its own state
 * file names the same pid and nonce and has not exited. Nothing signals a
 * pid that is not confirmed.
 */
export function supervisorConfirmed(paths: EnginePaths, lock: LockInfo): boolean {
  const state = readSupervisorState(paths);
  return (
    lock.nonce.length > 0 &&
    state !== null &&
    state.pid === lock.pid &&
    state.nonce === lock.nonce &&
    state.exit === null
  );
}

export type AcquireResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly state: Exclude<LockState, { kind: 'FREE' }> };

/** Takes the lock for `info.pid`, exclusively. Never takes over a held OR stale lock. */
export function acquireLock(
  paths: EnginePaths,
  info: LockInfo,
  isAlive: IsAlive,
  bootTimeMs: number | null = null,
): AcquireResult {
  ensurePrivateDir(paths.stateDir);
  let fd: number;
  try {
    fd = openSync(paths.lockFile, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const state = inspectLock(paths, isAlive, bootTimeMs);
    if (state.kind === 'FREE') return acquireLock(paths, info, isAlive, bootTimeMs);
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

/** Releases the lock only if `pid` with `nonce` holds it (removed by `removeLockIfUnchanged`). */
export function releaseLock(paths: EnginePaths, pid: number, nonce: string): boolean {
  const raw = readText(paths.lockFile);
  if (raw === null) return false;
  const lock = lockInfoOf(raw);
  if (lock.pid !== pid || lock.nonce !== nonce) return false;
  return removeLockIfUnchanged(paths, raw).kind === 'REMOVED';
}

export type LockRemoval =
  /** The judged lock was removed (and its pidfile, if it still named that pid). */
  | { readonly kind: 'REMOVED' }
  /** There was no lock any more (someone else removed it first). */
  | { readonly kind: 'GONE' }
  /** A different lock had replaced the judged one; it was put back untouched. */
  | { readonly kind: 'CHANGED'; readonly lock: LockInfo }
  /**
   * A different lock was moved and could not be put back, because yet another
   * lock appeared meanwhile. Nothing is deleted; `movedTo` keeps the moved one.
   */
  | { readonly kind: 'CONFLICT'; readonly lock: LockInfo; readonly movedTo: string };

function unlinkIfPresent(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/**
 * Removes the lock ONLY if it is still byte-for-byte `judgedRaw`: atomic
 * rename to a unique name, re-read, and either delete it or put it back with
 * a no-clobber link. Deletes no data.
 */
export function removeLockIfUnchanged(
  paths: EnginePaths,
  judgedRaw: string,
  /** Test seam: runs right after the rename (to interleave a racing start). */
  afterMove?: () => void,
): LockRemoval {
  const moved = `${paths.lockFile}.removing.${process.pid}.${randomBytes(8).toString('hex')}`;
  try {
    renameSync(paths.lockFile, moved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'GONE' };
    throw error;
  }
  afterMove?.();
  const raw = readText(moved) ?? '';
  if (raw === judgedRaw) {
    unlinkSync(moved);
    const pid = lockInfoOf(raw).pid;
    if (readText(paths.pidFile)?.trim() === String(pid)) unlinkIfPresent(paths.pidFile);
    return { kind: 'REMOVED' };
  }
  const lock = lockInfoOf(raw);
  try {
    linkSync(moved, paths.lockFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return { kind: 'CONFLICT', lock, movedTo: moved };
    }
    throw error;
  }
  unlinkSync(moved);
  return { kind: 'CHANGED', lock };
}

// ---------------------------------------------------------------------------
// The supervisor's reported state (read by `status` and `recover`).
// ---------------------------------------------------------------------------

export interface SupervisorStateFile {
  readonly contract: typeof SUPERVISOR_STATE_CONTRACT;
  readonly pid: number;
  /** The per-start nonce this supervisor also wrote into the lock ('' when unknown). */
  readonly nonce: string;
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
  if (!isObject(raw) || raw['contract'] !== SUPERVISOR_STATE_CONTRACT) return null;
  // A state file from before WW H-RT carries no nonce: it confirms nothing.
  return {
    ...(raw as unknown as SupervisorStateFile),
    nonce: typeof raw['nonce'] === 'string' ? raw['nonce'] : '',
  };
}

// ---------------------------------------------------------------------------
// The remembered campaign (so daily commands need no uuid).
// ---------------------------------------------------------------------------

export interface EngineConfig {
  readonly contract: typeof ENGINE_CONFIG_CONTRACT;
  readonly campaignId: string | null;
  /** Optional path to a status file the Operator writes (last publication time). */
  readonly operatorStatusFile: string | null;
  /**
   * The OWNER-chosen outbox directory (`start --outbox-dir`), handed to the
   * worker as `--outbox-dir` (ADR 0030 s6). An absolute path, never created
   * by the runtime; null when none was given.
   */
  readonly outboxDir: string | null;
  /**
   * Optional (WW H-RT), written by hand by the OWNER: the absolute path of
   * the encrypted review key file `acquisition review sign --key-file`
   * uses. `doctor` only reports whether it is set and whether the path is a
   * private regular file (lstat); nothing in the runtime ever opens it.
   */
  readonly reviewKeyFile?: string | null;
}

export function readConfig(paths: EnginePaths): EngineConfig {
  const raw = readJson(paths.configFile);
  if (!isObject(raw) || raw['contract'] !== ENGINE_CONFIG_CONTRACT) {
    return {
      contract: ENGINE_CONFIG_CONTRACT,
      campaignId: null,
      operatorStatusFile: null,
      outboxDir: null,
      reviewKeyFile: null,
    };
  }
  return {
    contract: ENGINE_CONFIG_CONTRACT,
    campaignId: typeof raw['campaignId'] === 'string' ? raw['campaignId'] : null,
    operatorStatusFile:
      typeof raw['operatorStatusFile'] === 'string' ? raw['operatorStatusFile'] : null,
    outboxDir: typeof raw['outboxDir'] === 'string' ? raw['outboxDir'] : null,
    reviewKeyFile: typeof raw['reviewKeyFile'] === 'string' ? raw['reviewKeyFile'] : null,
  };
}

export function writeConfig(paths: EnginePaths, config: EngineConfig): void {
  ensurePrivateDir(paths.stateDir);
  writePrivateFile(paths.configFile, `${JSON.stringify(config, null, 2)}\n`);
}

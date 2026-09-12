/**
 * THE 2D2B-2 TIER 2 TEST-HARNESS WATCHDOG, against REAL locally spawned
 * fixture processes (`src/test/fixtures/processHarness/`). The fixtures are
 * plain Node scripts: no network, no database, and the only file any of
 * them writes is a PID record inside the harness-owned scratch directory.
 *
 * Three layers:
 *
 *   1. the termination SEQUENCE CONTRACT for both platforms, against fake
 *      operations - pure, so it runs on every platform, and it pins the
 *      Windows rule (IPC request only, never a signal, then taskkill /T /F)
 *      even where Windows is not available;
 *   2. REAL POSIX process tests (skipped on Windows): completion,
 *      cooperative shutdown, hard process-group kill, bounded stderr, a
 *      same-group descendant, the post-exit sweep, and the documented
 *      detached-descendant limit - each proven by OS-level `kill(pid, 0)`
 *      probes and scratch-directory absence;
 *   3. REAL Windows process tests (skipped on every other platform).
 *
 * Every spawned PID is registered for emergency cleanup, so a failed
 * assertion cannot leave a fixture process running. Cleanup only ever
 * targets PIDs this file itself caused to exist.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  HARNESS_SCRATCH_PREFIX,
  HARNESS_STDERR_TAIL_MAX_CHARS,
  SHUTDOWN_ACK_MESSAGE,
  SHUTDOWN_REQUEST_MESSAGE,
  beginGracefulShutdown,
  buildTaskkillArgs,
  hardKillProcessTree,
  isGracefulShutdownConfirmed,
  runProcessIsolatedBatch,
  terminationPlatformOf,
  validateSignalTargetPid,
  type ProcessIsolatedBatchOptions,
  type TerminationOperations,
} from '../harness/processIsolatedBatch.js';

const IS_WINDOWS = process.platform === 'win32';
const FIXTURES = fileURLToPath(new URL('../fixtures/processHarness/', import.meta.url));
const fixture = (name: string): string => join(FIXTURES, name);

const WATCHDOG_MS = 1_500;
const GRACE_MS = 1_000;

// ---------------------------------------------------------------------------
// Emergency cleanup: only PIDs this file caused to exist.
// ---------------------------------------------------------------------------
const spawnedGroupLeaders = new Set<number>();
const spawnedDescendants = new Set<number>();

function isAlive(pid: number): boolean {
  try {
    process.kill(validateSignalTargetPid(pid), 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function waitUntilGone(pid: number, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((resolveTick) => setTimeout(resolveTick, 25));
  }
  return !isAlive(pid);
}

function emergencyKill(pid: number, group: boolean): void {
  try {
    const target = validateSignalTargetPid(pid);
    if (!isAlive(target) && !group) return;
    if (group && !IS_WINDOWS) process.kill(-target, 'SIGKILL');
    else process.kill(target, 'SIGKILL');
  } catch {
    // ESRCH: already gone - the expected case.
  }
}

afterEach(async () => {
  for (const pid of spawnedDescendants) emergencyKill(pid, false);
  for (const pid of spawnedGroupLeaders) emergencyKill(pid, true);
  for (const pid of [...spawnedDescendants, ...spawnedGroupLeaders]) await waitUntilGone(pid);
  spawnedDescendants.clear();
  spawnedGroupLeaders.clear();
});

// ---------------------------------------------------------------------------
// No harness scratch directory may outlive this file.
// ---------------------------------------------------------------------------
function harnessScratchEntries(): string[] {
  return readdirSync(tmpdir()).filter((entry) => entry.startsWith(HARNESS_SCRATCH_PREFIX));
}
let scratchBefore: string[] = [];
beforeAll(() => {
  scratchBefore = harnessScratchEntries();
});
afterAll(() => {
  expect(harnessScratchEntries().sort()).toEqual(scratchBefore.sort());
});

interface PidRecord {
  readonly direct: number;
  readonly descendant: number;
}

/**
 * Runs the harness, registering the direct child for emergency cleanup and,
 * for fixtures that write a PID record, polling it so the descendant is
 * registered - and proven ALIVE - while the batch is still running.
 */
async function runWithRecord(
  options: Omit<ProcessIsolatedBatchOptions, 'onChildSpawned' | 'beforeCleanup'>,
  expectRecord: boolean,
) {
  let record: PidRecord | null = null;
  let descendantAliveWhileRunning: boolean | null = null;
  let polling: Promise<void> = Promise.resolve();
  const result = await runProcessIsolatedBatch({
    ...options,
    onChildSpawned: (pid, scratchDir) => {
      spawnedGroupLeaders.add(pid);
      if (!expectRecord) return;
      polling = (async () => {
        const file = join(scratchDir, 'pids.json');
        const deadline = Date.now() + options.watchdogMs;
        while (Date.now() < deadline && !existsSync(file)) {
          await new Promise((resolveTick) => setTimeout(resolveTick, 10));
        }
        if (!existsSync(file)) return;
        record = JSON.parse(readFileSync(file, 'utf8')) as PidRecord;
        spawnedDescendants.add(record.descendant);
        descendantAliveWhileRunning = isAlive(record.descendant);
      })();
    },
    beforeCleanup: async () => {
      await polling;
    },
  });
  return {
    result,
    record: record as PidRecord | null,
    descendantAliveWhileRunning: descendantAliveWhileRunning as boolean | null,
  };
}

// ---------------------------------------------------------------------------
// 1. The sequence contract - pure, every platform.
// ---------------------------------------------------------------------------
function recordingOps(options: { ipcConnected?: boolean; taskkillExitCode?: number | null } = {}) {
  const calls: string[] = [];
  const ops: TerminationOperations = {
    sendIpc: (message) => {
      calls.push(`ipc:${message}`);
      return options.ipcConnected ?? true;
    },
    signalProcessGroup: (pid, signal) => {
      calls.push(`group:${signal}:${pid}`);
      return 'SIGNALLED';
    },
    taskkillTree: async (pid) => {
      calls.push(`taskkill:${buildTaskkillArgs(pid).join(' ')}`);
      return { exitCode: options.taskkillExitCode ?? 0 };
    },
  };
  return { ops, calls };
}

describe('Tier 2 termination contract (pure; executed on every platform)', () => {
  it('maps win32 to the Windows sequence and every other platform to POSIX', () => {
    expect(terminationPlatformOf('win32')).toBe('win32');
    expect(terminationPlatformOf('darwin')).toBe('posix');
    expect(terminationPlatformOf('linux')).toBe('posix');
  });

  it('WINDOWS graceful phase: the IPC shutdown request ONLY - no signal of any kind reaches the direct child', () => {
    const { ops, calls } = recordingOps();
    const record = beginGracefulShutdown('win32', 4242, ops);
    expect(calls).toEqual([`ipc:${SHUTDOWN_REQUEST_MESSAGE}`]);
    expect(record).toEqual({ ipcRequestSent: true, groupSigtermSent: false });
  });

  it('WINDOWS hard stage: exactly `taskkill /pid <validated-pid> /T /F`', async () => {
    const { ops, calls } = recordingOps();
    const record = await hardKillProcessTree('win32', 4242, ops);
    expect(calls).toEqual(['taskkill:/pid 4242 /T /F']);
    expect(record).toEqual({
      method: 'WINDOWS_TASKKILL_TREE',
      delivered: true,
      taskkillExitCode: 0,
    });
    const failing = recordingOps({ taskkillExitCode: 128 });
    expect((await hardKillProcessTree('win32', 4242, failing.ops)).delivered).toBe(false);
  });

  it('POSIX graceful phase: the IPC request plus SIGTERM to the process GROUP; hard stage: SIGKILL to the group', async () => {
    const graceful = recordingOps();
    expect(beginGracefulShutdown('posix', 4242, graceful.ops)).toEqual({
      ipcRequestSent: true,
      groupSigtermSent: true,
    });
    expect(graceful.calls).toEqual([`ipc:${SHUTDOWN_REQUEST_MESSAGE}`, 'group:SIGTERM:4242']);
    const hard = recordingOps();
    const record = await hardKillProcessTree('posix', 4242, hard.ops);
    expect(hard.calls).toEqual(['group:SIGKILL:4242']);
    expect(record.method).toBe('POSIX_PROCESS_GROUP_SIGKILL');
  });

  it('a graceful shutdown is CONFIRMED only by an acknowledgement AND an exit within grace', () => {
    expect(isGracefulShutdownConfirmed({ acknowledged: true, exitedWithinGrace: true })).toBe(true);
    // A bare exit is an exit, not a confirmed cooperative shutdown.
    expect(isGracefulShutdownConfirmed({ acknowledged: false, exitedWithinGrace: true })).toBe(
      false,
    );
    expect(isGracefulShutdownConfirmed({ acknowledged: true, exitedWithinGrace: false })).toBe(
      false,
    );
  });

  it('every PID entering a signal or tree-kill path must be an integer greater than 1', async () => {
    for (const bad of [0, 1, -1, -4242, 1.5, Number.NaN, '4242', null, undefined]) {
      expect(() => validateSignalTargetPid(bad)).toThrow(RangeError);
    }
    expect(validateSignalTargetPid(2)).toBe(2);
    expect(() => buildTaskkillArgs(1)).toThrow(RangeError);
    const { ops, calls } = recordingOps();
    expect(() => beginGracefulShutdown('posix', 1, ops)).toThrow(RangeError);
    await expect(hardKillProcessTree('posix', 0, ops)).rejects.toThrow(RangeError);
    await expect(hardKillProcessTree('win32', -1, ops)).rejects.toThrow(RangeError);
    expect(calls).toEqual([]); // nothing was signalled before the refusal
  });

  it('the fixtures speak exactly the harness protocol constants', () => {
    for (const name of [
      'cooperativeShutdown.mjs',
      'cooperativeLeaderLeavesSameGroupDescendant.mjs',
    ]) {
      const source = readFileSync(fixture(name), 'utf8');
      expect(source).toContain(`'${SHUTDOWN_REQUEST_MESSAGE}'`);
      expect(source).toContain(`'${SHUTDOWN_ACK_MESSAGE}'`);
    }
    // The Windows kill-race fixture installs NO IPC listener at all.
    const detached = readFileSync(fixture('spawnsDetachedGrandchildIgnoresShutdown.mjs'), 'utf8');
    expect(detached).not.toMatch(/process\.on\(\s*['"]message['"]/);
    expect(detached).toMatch(/detached:\s*true/);
  });

  it('refuses a non-positive watchdog or grace BEFORE creating any scratch directory', async () => {
    const before = harnessScratchEntries().length;
    await expect(
      runProcessIsolatedBatch({ modulePath: fixture('quickExit.mjs'), watchdogMs: 0, graceMs: 1 }),
    ).rejects.toThrow(TypeError);
    await expect(
      runProcessIsolatedBatch({
        modulePath: fixture('quickExit.mjs'),
        watchdogMs: 1,
        graceMs: Number.NaN,
      }),
    ).rejects.toThrow(TypeError);
    expect(harnessScratchEntries().length).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 2. Real POSIX processes - executed on macOS in this recovery.
// ---------------------------------------------------------------------------
describe.skipIf(IS_WINDOWS)('Tier 2 on POSIX (real fixture processes)', () => {
  it('a quick-exit child COMPLETES normally: no graceful phase, no hard kill, nothing left in its group', async () => {
    const { result } = await runWithRecord(
      { modulePath: fixture('quickExit.mjs'), watchdogMs: WATCHDOG_MS, graceMs: GRACE_MS },
      false,
    );
    expect(result.platform).toBe('posix');
    expect(result.outcome).toBe('COMPLETED');
    expect(result.exitCode).toBe(0);
    expect(result.gracefulShutdownRequested).toBe(false);
    expect(result.hardKillRequired).toBe(false);
    expect(result.posixGroupSweep).toBe('NO_SUCH_PROCESS');
    expect(isAlive(result.pid)).toBe(false);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('a cooperative child exits during the graceful phase: acknowledged + exited within grace = CONFIRMED, no hard kill', async () => {
    const { result } = await runWithRecord(
      {
        modulePath: fixture('cooperativeShutdown.mjs'),
        watchdogMs: WATCHDOG_MS,
        graceMs: GRACE_MS,
      },
      false,
    );
    expect(result.outcome).toBe('TIMED_OUT_KILLED');
    expect(result.gracefulShutdownRequested).toBe(true);
    expect(result.gracefulPhase).toEqual({ ipcRequestSent: true, groupSigtermSent: true });
    expect(result.shutdownAcknowledged).toBe(true);
    expect(result.exitedWithinGrace).toBe(true);
    expect(result.gracefulShutdownConfirmed).toBe(true);
    expect(result.hardKillRequired).toBe(false);
    expect(result.hardKill).toBeNull();
    expect(result.exitCode).toBe(0);
    expect(isAlive(result.pid)).toBe(false);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('a child that exits WITHOUT acknowledging is recorded as an exit, never as a confirmed shutdown', async () => {
    const { result } = await runWithRecord(
      { modulePath: fixture('exitsWithoutAck.mjs'), watchdogMs: WATCHDOG_MS, graceMs: GRACE_MS },
      false,
    );
    expect(result.outcome).toBe('TIMED_OUT_KILLED');
    expect(result.exitedWithinGrace).toBe(true);
    expect(result.shutdownAcknowledged).toBe(false);
    expect(result.gracefulShutdownConfirmed).toBe(false);
    expect(result.hardKillRequired).toBe(false);
    expect(isAlive(result.pid)).toBe(false);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('a never-exiting child reaches the HARD POSIX process-group SIGKILL', async () => {
    const { result } = await runWithRecord(
      { modulePath: fixture('neverExits.mjs'), watchdogMs: WATCHDOG_MS, graceMs: GRACE_MS },
      false,
    );
    expect(result.outcome).toBe('TIMED_OUT_KILLED');
    expect(result.gracefulPhase).toEqual({ ipcRequestSent: true, groupSigtermSent: true });
    expect(result.exitedWithinGrace).toBe(false);
    expect(result.gracefulShutdownConfirmed).toBe(false);
    expect(result.hardKillRequired).toBe(true);
    expect(result.hardKill).toEqual({
      method: 'POSIX_PROCESS_GROUP_SIGKILL',
      delivered: true,
      taskkillExitCode: null,
    });
    expect(result.signal).toBe('SIGKILL');
    expect(isAlive(result.pid)).toBe(false);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('a stderr-writing child keeps only a bounded TAIL and is still terminated', async () => {
    const { result } = await runWithRecord(
      {
        modulePath: fixture('writesStderrThenHangs.mjs'),
        watchdogMs: WATCHDOG_MS,
        graceMs: GRACE_MS,
      },
      false,
    );
    expect(result.stderrTail.length).toBe(HARNESS_STDERR_TAIL_MAX_CHARS);
    expect(result.stderrTail.endsWith('STDERR-TAIL-MARKER')).toBe(true);
    expect(result.stderrTail).not.toContain('STDERR-HEAD-MARKER');
    expect(result.hardKillRequired).toBe(true);
    expect(result.signal).toBe('SIGKILL');
    expect(isAlive(result.pid)).toBe(false);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('a SAME-PROCESS-GROUP descendant, alive while the batch ran, is gone after the hard group kill', async () => {
    const { result, record, descendantAliveWhileRunning } = await runWithRecord(
      {
        modulePath: fixture('spawnsSameGroupDescendantIgnoresShutdown.mjs'),
        watchdogMs: WATCHDOG_MS,
        graceMs: GRACE_MS,
      },
      true,
    );
    expect(record).not.toBeNull();
    expect(record!.direct).toBe(result.pid);
    expect(descendantAliveWhileRunning).toBe(true);
    expect(result.hardKillRequired).toBe(true);
    expect(isAlive(result.pid)).toBe(false);
    // The descendant was orphaned by the same SIGKILL and is reaped by init.
    expect(await waitUntilGone(record!.descendant)).toBe(true);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('REGRESSION (POSIX post-exit sweep): a confirmed graceful leader cannot leave a SIGTERM-ignoring same-group descendant behind', async () => {
    const { result, record, descendantAliveWhileRunning } = await runWithRecord(
      {
        modulePath: fixture('cooperativeLeaderLeavesSameGroupDescendant.mjs'),
        watchdogMs: WATCHDOG_MS,
        graceMs: GRACE_MS,
      },
      true,
    );
    expect(descendantAliveWhileRunning).toBe(true);
    expect(result.gracefulShutdownConfirmed).toBe(true);
    expect(result.hardKillRequired).toBe(false);
    // The leader is gone, but its group was not empty: the sweep found and
    // killed the descendant that ignored the graceful SIGTERM.
    expect(result.posixGroupSweep).toBe('SIGNALLED');
    expect(isAlive(result.pid)).toBe(false);
    expect(await waitUntilGone(record!.descendant)).toBe(true);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('DOCUMENTED LIMIT: a descendant that called setsid() (detached) is in ANOTHER group, and no group signal reaches it', async () => {
    const { result, record, descendantAliveWhileRunning } = await runWithRecord(
      {
        modulePath: fixture('spawnsDetachedGrandchildIgnoresShutdown.mjs'),
        watchdogMs: WATCHDOG_MS,
        graceMs: GRACE_MS,
      },
      true,
    );
    expect(descendantAliveWhileRunning).toBe(true);
    expect(result.hardKillRequired).toBe(true);
    expect(isAlive(result.pid)).toBe(false);
    // Honest negative control: the escaped descendant SURVIVES the harness.
    expect(isAlive(record!.descendant)).toBe(true);
    // This test created it, so this test ends it.
    process.kill(validateSignalTargetPid(record!.descendant), 'SIGKILL');
    expect(await waitUntilGone(record!.descendant)).toBe(true);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('the scratch directory is removed on a FAILURE path too, and the child is not left running', async () => {
    let seenScratch: string | null = null;
    let seenPid: number | null = null;
    await expect(
      runProcessIsolatedBatch({
        modulePath: fixture('neverExits.mjs'),
        watchdogMs: 200,
        graceMs: 200,
        onChildSpawned: (pid, scratchDir) => {
          spawnedGroupLeaders.add(pid);
          seenPid = pid;
          seenScratch = scratchDir;
        },
        beforeCleanup: () => {
          throw new Error('a failing post-run inspection');
        },
      }),
    ).rejects.toThrow('a failing post-run inspection');
    expect(seenScratch).not.toBeNull();
    expect(existsSync(seenScratch!)).toBe(false);
    expect(await waitUntilGone(seenPid!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Real Windows processes - executed only on Windows.
// ---------------------------------------------------------------------------
describe.runIf(IS_WINDOWS)('Tier 2 on Windows (real fixture processes)', () => {
  it('a cooperative child shuts down on the IPC request alone: CONFIRMED, no taskkill', async () => {
    const { result } = await runWithRecord(
      {
        modulePath: fixture('cooperativeShutdown.mjs'),
        watchdogMs: WATCHDOG_MS,
        graceMs: GRACE_MS,
      },
      false,
    );
    expect(result.platform).toBe('win32');
    expect(result.gracefulPhase).toEqual({ ipcRequestSent: true, groupSigtermSent: false });
    expect(result.gracefulShutdownConfirmed).toBe(true);
    expect(result.hardKillRequired).toBe(false);
    expect(result.posixGroupSweep).toBe('NOT_APPLICABLE');
    expect(isAlive(result.pid)).toBe(false);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('a child ignoring the IPC request stays alive until `taskkill /T /F`, which removes it AND its detached grandchild', async () => {
    const { result, record, descendantAliveWhileRunning } = await runWithRecord(
      {
        modulePath: fixture('spawnsDetachedGrandchildIgnoresShutdown.mjs'),
        watchdogMs: WATCHDOG_MS,
        graceMs: GRACE_MS,
      },
      true,
    );
    expect(descendantAliveWhileRunning).toBe(true);
    expect(result.exitedWithinGrace).toBe(false); // still alive to anchor the tree walk
    expect(result.hardKill?.method).toBe('WINDOWS_TASKKILL_TREE');
    expect(result.hardKill?.taskkillExitCode).toBe(0);
    expect(isAlive(result.pid)).toBe(false);
    expect(await waitUntilGone(record!.descendant)).toBe(true);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('a bare exit without acknowledgement is not a confirmed shutdown', async () => {
    const { result } = await runWithRecord(
      { modulePath: fixture('exitsWithoutAck.mjs'), watchdogMs: WATCHDOG_MS, graceMs: GRACE_MS },
      false,
    );
    expect(result.exitedWithinGrace).toBe(true);
    expect(result.gracefulShutdownConfirmed).toBe(false);
    expect(result.hardKillRequired).toBe(false);
  });
});

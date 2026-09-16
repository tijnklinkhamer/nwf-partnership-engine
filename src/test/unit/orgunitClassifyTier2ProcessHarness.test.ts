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
 *      even where Windows is not available; 1b executes the COMPLETE shared
 *      state machine (`runTerminationSequence`, the function the real
 *      harness calls) for both platforms, driven by explicit ACK / exit /
 *      channel-closed / grace-expiry events rather than a wall clock
 *      (2D2B-R2A), and pins that a Windows PID whose exit was observed never
 *      reaches `taskkill` (2D2B-R2B);
 *   2. REAL POSIX process tests (skipped on Windows): completion,
 *      cooperative shutdown, an unacknowledged exit reaching the hard stage
 *      immediately, hard process-group kill, bounded stderr, same-group
 *      descendants, the
 *      post-exit sweep, and the documented detached-descendant limit - each
 *      proven by OS-level `kill(pid, 0)` probes and scratch-directory absence;
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
  createGracePhaseTracker,
  decideGracePhase,
  hardKillProcessTree,
  isGracefulShutdownConfirmed,
  runProcessIsolatedBatch,
  runTerminationSequence,
  terminationPlatformOf,
  validateSignalTargetPid,
  type GracePhaseTracker,
  type GraceTimerArm,
  type GroupSignalResult,
  type HardKillStage,
  type ProcessIsolatedBatchOptions,
  type TerminationOperations,
  type TerminationPlatform,
} from '../harness/processIsolatedBatch.js';

const IS_WINDOWS = process.platform === 'win32';
const FIXTURES = fileURLToPath(new URL('../fixtures/processHarness/', import.meta.url));
const fixture = (name: string): string => join(FIXTURES, name);

const WATCHDOG_MS = 1_500;
const GRACE_MS = 1_000;
/**
 * A grace window twenty times the 30 s test timeout: a test using it can
 * pass ONLY if the harness does not wait for the grace deadline - no
 * wall-clock threshold is measured (2D2B-R2B).
 */
const GRACE_NEVER_WAITED_OUT_MS = 600_000;

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
// ...nor any timer or child-process handle the harness created.
const LEAK_CHECKED_RESOURCES = ['Timeout', 'ProcessWrap'];
function activeResourceCounts(): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(
    LEAK_CHECKED_RESOURCES.map((kind) => [kind, 0]),
  );
  for (const kind of process.getActiveResourcesInfo()) {
    if (kind in counts) counts[kind]! += 1;
  }
  return counts;
}
let resourcesBefore: Record<string, number> = {};
beforeAll(() => {
  scratchBefore = harnessScratchEntries();
  resourcesBefore = activeResourceCounts();
});
afterAll(() => {
  expect(harnessScratchEntries().sort()).toEqual(scratchBefore.sort());
  expect(activeResourceCounts()).toEqual(resourcesBefore);
});

interface PidRecord {
  readonly direct: number;
  readonly descendant: number;
}

/**
 * Runs the harness, registering the direct child for emergency cleanup and,
 * for fixtures that write a PID record, polling it so the descendant is
 * registered - and proven ALIVE - while the batch is still running. It also
 * probes, at the moment the hard stage is about to run, whether the direct
 * child and the descendant are still alive.
 */
async function runWithRecord(
  options: Omit<ProcessIsolatedBatchOptions, 'onChildSpawned' | 'beforeHardKill' | 'beforeCleanup'>,
  expectRecord: boolean,
) {
  let record: PidRecord | null = null;
  let descendantAliveWhileRunning: boolean | null = null;
  let atHardKill: { direct: boolean; descendant: boolean | null } | null = null;
  let spawnedPid: number | null = null;
  let polling: Promise<void> = Promise.resolve();
  const result = await runProcessIsolatedBatch({
    ...options,
    beforeHardKill: () => {
      const current = record as PidRecord | null;
      atHardKill = {
        direct: spawnedPid !== null && isAlive(spawnedPid),
        descendant: current === null ? null : isAlive(current.descendant),
      };
    },
    onChildSpawned: (pid, scratchDir) => {
      spawnedGroupLeaders.add(pid);
      spawnedPid = pid;
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
    atHardKill: atHardKill as { direct: boolean; descendant: boolean | null } | null,
  };
}

// ---------------------------------------------------------------------------
// 1. The sequence contract - pure, every platform.
// ---------------------------------------------------------------------------
function recordingOps(
  options: {
    ipcConnected?: boolean;
    taskkillExitCode?: number | null;
    /** What the POSIX hard group SIGKILL reports (ESRCH once the group is empty). */
    hardGroupResult?: GroupSignalResult;
  } = {},
) {
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
    killProcessGroup: async (pid) => {
      calls.push(`group:SIGKILL:${pid}`);
      return options.hardGroupResult ?? 'SIGNALLED';
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

  it('WINDOWS hard stage, child exit NOT observed: exactly `taskkill /pid <validated-pid> /T /F`', async () => {
    const { ops, calls } = recordingOps();
    const action = await hardKillProcessTree('win32', 4242, ops, () => false);
    expect(calls).toEqual(['taskkill:/pid 4242 /T /F']);
    expect(action).toEqual({
      disposition: 'EXECUTED',
      record: { method: 'WINDOWS_TASKKILL_TREE', delivered: true, taskkillExitCode: 0 },
    });
    const failing = recordingOps({ taskkillExitCode: 128 });
    expect(await hardKillProcessTree('win32', 4242, failing.ops, () => false)).toEqual({
      disposition: 'EXECUTED',
      record: { method: 'WINDOWS_TASKKILL_TREE', delivered: false, taskkillExitCode: 128 },
    });
  });

  it('WINDOWS hard stage, child exit OBSERVED: taskkill is NEVER issued - suppressed as an expired target identity (2D2B-R2B)', async () => {
    const { ops, calls } = recordingOps();
    const action = await hardKillProcessTree('win32', 4242, ops, () => true);
    expect(calls).toEqual([]); // no taskkill, no signal, nothing
    expect(action).toEqual({
      disposition: 'SUPPRESSED_EXPIRED_TARGET_IDENTITY',
      suppressionReason: 'DIRECT_CHILD_EXIT_OBSERVED',
    });
    // Never represented as attempted, delivered or successful.
    expect(action).not.toHaveProperty('record');
    expect(Object.isFrozen(action)).toBe(true);
  });

  it('WINDOWS final pre-kill gate: nothing can run between reading the exit state and spawning taskkill', async () => {
    // Reading the gate queues a microtask that marks the child exited. If
    // any `await` separated the read from the spawn, that microtask - which
    // stands for an exit event being processed - would run first.
    let exited = false;
    let exitedWhenTaskkillSpawned: boolean | null = null;
    const { ops } = recordingOps();
    const action = await hardKillProcessTree(
      'win32',
      4242,
      {
        ...ops,
        taskkillTree: async () => {
          exitedWhenTaskkillSpawned = exited;
          return { exitCode: 0 };
        },
      },
      () => {
        queueMicrotask(() => {
          exited = true;
        });
        return exited;
      },
    );
    expect(exitedWhenTaskkillSpawned).toBe(false);
    expect(action.disposition).toBe('EXECUTED');
  });

  it('WINDOWS taskkill runs through execFile with shell: false and the validated argument vector', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../harness/processIsolatedBatch.ts', import.meta.url)),
      'utf8',
    );
    const body = source.slice(source.indexOf('function windowsTaskkillTree('));
    expect(body).toMatch(/const args = \[\.\.\.buildTaskkillArgs\(pid\)\];/);
    expect(body).toMatch(/execFile\(\s*executable,\s*args,\s*\{ shell: false,/);
    // The one place ops.taskkillTree is reached is behind the pre-kill gate.
    expect(source.match(/ops\.taskkillTree\(/g)).toHaveLength(1);
    expect(source).toMatch(
      /if \(directChildExitObserved\(\)\) return HARD_KILL_SUPPRESSED_EXPIRED_TARGET;\s*const outcome = await ops\.taskkillTree\(target\);/,
    );
  });

  it('POSIX graceful phase: the IPC request plus SIGTERM to the process GROUP; hard stage: SIGKILL to the group, exit observed or not', async () => {
    const graceful = recordingOps();
    expect(beginGracefulShutdown('posix', 4242, graceful.ops)).toEqual({
      ipcRequestSent: true,
      groupSigtermSent: true,
    });
    expect(graceful.calls).toEqual([`ipc:${SHUTDOWN_REQUEST_MESSAGE}`, 'group:SIGTERM:4242']);
    for (const exitObserved of [false, true]) {
      const hard = recordingOps();
      const action = await hardKillProcessTree('posix', 4242, hard.ops, () => exitObserved);
      expect(hard.calls).toEqual(['group:SIGKILL:4242']);
      expect(action).toEqual({
        disposition: 'EXECUTED',
        record: { method: 'POSIX_PROCESS_GROUP_SIGKILL', delivered: true, taskkillExitCode: null },
      });
    }
    // An empty group is an honest "not delivered", never a failure.
    const empty = recordingOps({ hardGroupResult: 'NO_SUCH_PROCESS' });
    const action = await hardKillProcessTree('posix', 4242, empty.ops, () => true);
    expect(action).toEqual({
      disposition: 'EXECUTED',
      record: { method: 'POSIX_PROCESS_GROUP_SIGKILL', delivered: false, taskkillExitCode: null },
    });
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
    await expect(hardKillProcessTree('posix', 0, ops, () => false)).rejects.toThrow(RangeError);
    await expect(hardKillProcessTree('win32', -1, ops, () => false)).rejects.toThrow(RangeError);
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
    // The unacknowledged-exit fixtures answer the request by exiting, never with an ACK.
    for (const name of [
      'exitsWithoutAck.mjs',
      'leaderExitsWithoutAckLeavesSameGroupDescendant.mjs',
    ]) {
      const source = readFileSync(fixture(name), 'utf8');
      expect(source).toContain(`'${SHUTDOWN_REQUEST_MESSAGE}'`);
      expect(source).not.toContain(SHUTDOWN_ACK_MESSAGE);
      expect(source).not.toMatch(/process\.send\(/);
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
// 1b. The COMPLETE grace-phase state machine (2D2B-R2A, R2B) - the same
//     `runTerminationSequence` that `runProcessIsolatedBatch` calls, driven
//     by explicit events and a manual grace deadline: no wall clock, no
//     real timer, no process. Executed for BOTH platforms on every platform.
//     "Does not wait for grace" is proven by settling with the manual
//     deadline never fired.
// ---------------------------------------------------------------------------
function manualGrace() {
  let onExpired: (() => void) | null = null;
  let armed = 0;
  let disarmed = 0;
  const armGrace: GraceTimerArm = (expire) => {
    armed += 1;
    onExpired = expire;
    return () => {
      disarmed += 1;
    };
  };
  return {
    armGrace,
    expire: () => onExpired?.(),
    counts: () => ({ armed, disarmed }),
  };
}

/** Lets every queued promise continuation run; deterministic, not a clock. */
const flushPromises = (): Promise<void> =>
  new Promise((resolveFlush) => {
    setImmediate(resolveFlush);
  });

function startSequence(
  platform: TerminationPlatform,
  opsOptions: Parameters<typeof recordingOps>[0] = {},
  /** Runs inside the hook - i.e. after the grace decision, before the pre-kill gate. */
  duringBeforeHardKill?: (tracker: GracePhaseTracker) => void,
) {
  const { ops, calls } = recordingOps(opsOptions);
  const tracker = createGracePhaseTracker();
  const grace = manualGrace();
  let settled = false;
  const sequence = runTerminationSequence({
    platform,
    pid: 4242,
    ops,
    tracker,
    armGrace: grace.armGrace,
    beforeHardKill: () => {
      calls.push('before-hard-kill');
      duringBeforeHardKill?.(tracker);
    },
  }).then((record) => {
    settled = true;
    return record;
  });
  return { tracker, grace, calls, sequence, isSettled: () => settled };
}

const GRACEFUL_CALLS: Record<TerminationPlatform, readonly string[]> = {
  posix: [`ipc:${SHUTDOWN_REQUEST_MESSAGE}`, 'group:SIGTERM:4242'],
  win32: [`ipc:${SHUTDOWN_REQUEST_MESSAGE}`],
};
const HARD_CALL: Record<TerminationPlatform, string> = {
  posix: 'group:SIGKILL:4242',
  win32: 'taskkill:/pid 4242 /T /F',
};
const EXECUTED: Record<TerminationPlatform, HardKillStage> = {
  posix: {
    disposition: 'EXECUTED',
    record: { method: 'POSIX_PROCESS_GROUP_SIGKILL', delivered: true, taskkillExitCode: null },
  },
  win32: {
    disposition: 'EXECUTED',
    record: { method: 'WINDOWS_TASKKILL_TREE', delivered: true, taskkillExitCode: 0 },
  },
};
const SUPPRESSED: HardKillStage = {
  disposition: 'SUPPRESSED_EXPIRED_TARGET_IDENTITY',
  suppressionReason: 'DIRECT_CHILD_EXIT_OBSERVED',
};
/**
 * The hard stage once the direct child's exit HAS been observed: POSIX still
 * kills the (surviving) group; Windows refuses to aim taskkill at the PID.
 */
const AFTER_OBSERVED_EXIT: Record<
  TerminationPlatform,
  { readonly calls: readonly string[]; readonly hardKill: HardKillStage }
> = {
  posix: {
    calls: [...GRACEFUL_CALLS.posix, 'before-hard-kill', HARD_CALL.posix],
    hardKill: EXECUTED.posix,
  },
  win32: { calls: [...GRACEFUL_CALLS.win32, 'before-hard-kill'], hardKill: SUPPRESSED },
};

describe('Tier 2 grace-phase decision table (pure; executed on every platform)', () => {
  it('only acknowledgement AND exit is confirmed; every other combination requires the hard stage', () => {
    expect(decideGracePhase({ acknowledged: true, exitedWithinGrace: true })).toEqual({
      verdict: 'SHUTDOWN_CONFIRMED',
      acknowledged: true,
      exitedWithinGrace: true,
      gracefulShutdownConfirmed: true,
      hardKillRequired: false,
    });
    expect(decideGracePhase({ acknowledged: false, exitedWithinGrace: true })).toEqual({
      verdict: 'CHILD_EXITED_UNCONFIRMED',
      acknowledged: false,
      exitedWithinGrace: true,
      gracefulShutdownConfirmed: false,
      hardKillRequired: true,
    });
    expect(decideGracePhase({ acknowledged: true, exitedWithinGrace: false })).toEqual({
      verdict: 'ACKNOWLEDGED_NOT_EXITED',
      acknowledged: true,
      exitedWithinGrace: false,
      gracefulShutdownConfirmed: false,
      hardKillRequired: true,
    });
    expect(decideGracePhase({ acknowledged: false, exitedWithinGrace: false })).toEqual({
      verdict: 'NO_SHUTDOWN_RESPONSE',
      acknowledged: false,
      exitedWithinGrace: false,
      gracefulShutdownConfirmed: false,
      hardKillRequired: true,
    });
  });

  it('runProcessIsolatedBatch reaches the graceful and hard stages ONLY through runTerminationSequence', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../harness/processIsolatedBatch.ts', import.meta.url)),
      'utf8',
    );
    const body = source.slice(source.indexOf('export async function runProcessIsolatedBatch('));
    expect(body.match(/\brunTerminationSequence\(/g)).toHaveLength(1);
    expect(body).not.toMatch(/\bbeginGracefulShutdown\(/);
    // The one other hardKillProcessTree call is the emergency path in `finally`,
    // gated on the same harness-owned exit state (2D2B-R2B).
    expect(body.match(/\bhardKillProcessTree\(/g)).toHaveLength(1);
    expect(body).toMatch(/finally \{[\s\S]*hardKillProcessTree\(\s*platform,\s*child\.pid/);
    expect(body).toMatch(
      /taskkillTree: windowsTaskkillTree,\s*\},\s*\(\) => exitInfo !== undefined,/,
    );
    // The exit, the channel closure and the ACK all feed the one tracker.
    expect(body).toMatch(/graceTracker\?\.recordExit\(\)/);
    // 2D2C-F0Z gave this listener a block body so it can also timestamp the
    // disconnect for the liveness witness. The assertion still proves the
    // SAME thing: the channel closure feeds the one tracker, from this one
    // `once('disconnect')` registration.
    expect(body).toMatch(
      /forked\.once\('disconnect', \(\) => \{[\s\S]*?graceTracker\?\.recordChannelClosed\(\);[\s\S]*?\}\)/,
    );
    expect(body).toMatch(/graceTracker\?\.recordAcknowledgement\(\)/);
  });
});

describe.each(['posix', 'win32'] as const)(
  'Tier 2 complete termination state machine, %s sequence (pure; executed on every platform)',
  (platform) => {
    it('ACK + exit (any order, channel open or closed before the exit): CONFIRMED early, deadline disarmed, NOT_REQUIRED, no hard operation', async () => {
      for (const order of [
        ['ack', 'exit'],
        ['exit', 'ack'], // an ACK still in the pipe when the exit is seen
        ['ack', 'channel', 'exit'], // the order measured on macOS
      ] as const) {
        const run = startSequence(platform);
        for (const event of order) {
          if (event === 'ack') run.tracker.recordAcknowledgement();
          else if (event === 'exit') run.tracker.recordExit();
          else run.tracker.recordChannelClosed();
        }
        const record = await run.sequence;
        expect(record.grace.verdict).toBe('SHUTDOWN_CONFIRMED');
        expect(record.grace.gracefulShutdownConfirmed).toBe(true);
        expect(record.grace.hardKillRequired).toBe(false);
        expect(record.hardKill).toEqual({ disposition: 'NOT_REQUIRED' });
        expect(run.calls).toEqual(GRACEFUL_CALLS[platform]);
        expect(run.grace.counts()).toEqual({ armed: 1, disarmed: 1 });
      }
    });

    it('exit WITHOUT ACK is terminal the moment no ACK can arrive (exit + channel closed, either order) - WITHOUT the grace deadline ever expiring (2D2B-R2B)', async () => {
      for (const order of [
        ['exit', 'channel'],
        ['channel', 'exit'],
      ] as const) {
        const run = startSequence(platform);
        const [first, second] = order;
        if (first === 'exit') run.tracker.recordExit();
        else run.tracker.recordChannelClosed();
        await flushPromises();
        // One half alone decides nothing: an in-flight ACK, or a live child.
        expect(run.isSettled()).toBe(false);
        expect(run.calls).toEqual(GRACEFUL_CALLS[platform]);
        if (second === 'exit') run.tracker.recordExit();
        else run.tracker.recordChannelClosed();
        await flushPromises();
        // Settled with the manual deadline NEVER fired: grace was not waited out.
        expect(run.isSettled()).toBe(true);
        const record = await run.sequence;
        expect(record.grace).toEqual({
          verdict: 'CHILD_EXITED_UNCONFIRMED',
          acknowledged: false,
          exitedWithinGrace: true,
          gracefulShutdownConfirmed: false,
          hardKillRequired: true, // LOGICALLY required on both platforms
        });
        expect(run.calls).toEqual(AFTER_OBSERVED_EXIT[platform].calls);
        expect(record.hardKill).toEqual(AFTER_OBSERVED_EXIT[platform].hardKill);
        expect(run.grace.counts()).toEqual({ armed: 1, disarmed: 1 });
      }
    });

    it('exit WITHOUT ACK while the channel stays open: the grace deadline ends it, with the same platform action', async () => {
      const run = startSequence(platform);
      run.tracker.recordExit();
      await flushPromises();
      expect(run.isSettled()).toBe(false);
      run.grace.expire();
      const record = await run.sequence;
      expect(record.grace.verdict).toBe('CHILD_EXITED_UNCONFIRMED');
      expect(record.grace.hardKillRequired).toBe(true);
      expect(run.calls).toEqual(AFTER_OBSERVED_EXIT[platform].calls);
      expect(record.hardKill).toEqual(AFTER_OBSERVED_EXIT[platform].hardKill);
    });

    it('ACK WITHOUT exit stays pending (a closed channel does not change that) until grace, then EXECUTES the hard stage', async () => {
      const run = startSequence(platform);
      run.tracker.recordAcknowledgement();
      run.tracker.recordChannelClosed();
      await flushPromises();
      expect(run.isSettled()).toBe(false);
      expect(run.calls).toEqual(GRACEFUL_CALLS[platform]);
      run.grace.expire();
      const record = await run.sequence;
      expect(record.grace.verdict).toBe('ACKNOWLEDGED_NOT_EXITED');
      expect(record.grace.exitedWithinGrace).toBe(false);
      expect(record.grace.hardKillRequired).toBe(true);
      expect(run.calls).toEqual([
        ...GRACEFUL_CALLS[platform],
        'before-hard-kill',
        HARD_CALL[platform],
      ]);
      expect(record.hardKill).toEqual(EXECUTED[platform]);
    });

    it('NEITHER ACK nor exit stays pending until grace, then EXECUTES the hard stage', async () => {
      const run = startSequence(platform);
      await flushPromises();
      expect(run.isSettled()).toBe(false);
      run.grace.expire();
      const record = await run.sequence;
      expect(record.grace.verdict).toBe('NO_SHUTDOWN_RESPONSE');
      expect(record.grace.hardKillRequired).toBe(true);
      expect(run.calls).toEqual([
        ...GRACEFUL_CALLS[platform],
        'before-hard-kill',
        HARD_CALL[platform],
      ]);
      expect(record.hardKill).toEqual(EXECUTED[platform]);
    });

    it('the child exits AFTER the grace decision but BEFORE the final pre-kill check: the verdict stands; Windows suppresses, POSIX kills the group', async () => {
      for (const acknowledged of [false, true]) {
        const run = startSequence(platform, {}, (tracker) => tracker.recordExit());
        if (acknowledged) run.tracker.recordAcknowledgement();
        run.grace.expire();
        const record = await run.sequence;
        expect(record.grace.verdict).toBe(
          acknowledged ? 'ACKNOWLEDGED_NOT_EXITED' : 'NO_SHUTDOWN_RESPONSE',
        );
        // Never reinterpreted as a confirmed shutdown.
        expect(record.grace.gracefulShutdownConfirmed).toBe(false);
        expect(record.grace.hardKillRequired).toBe(true);
        expect(run.calls).toEqual(AFTER_OBSERVED_EXIT[platform].calls);
        expect(record.hardKill).toEqual(AFTER_OBSERVED_EXIT[platform].hardKill);
      }
    });

    it('events after the decision cannot rewrite it', async () => {
      const lateAck = startSequence(platform);
      lateAck.tracker.recordExit();
      lateAck.tracker.recordChannelClosed(); // decided: unconfirmed
      lateAck.tracker.recordAcknowledgement(); // too late to confirm
      lateAck.grace.expire(); // ignored
      const lateAckRecord = await lateAck.sequence;
      expect(lateAckRecord.grace.verdict).toBe('CHILD_EXITED_UNCONFIRMED');
      expect(lateAckRecord.hardKill).toEqual(AFTER_OBSERVED_EXIT[platform].hardKill);

      const lateExit = startSequence(platform);
      lateExit.tracker.recordAcknowledgement();
      lateExit.grace.expire(); // decided: acknowledged, not exited
      lateExit.tracker.recordExit(); // too late to confirm - but still a FACT for the gate
      const lateExitRecord = await lateExit.sequence;
      expect(lateExitRecord.grace.verdict).toBe('ACKNOWLEDGED_NOT_EXITED');
      expect(lateExitRecord.grace.gracefulShutdownConfirmed).toBe(false);
      expect(lateExitRecord.hardKill).toEqual(AFTER_OBSERVED_EXIT[platform].hardKill);

      const lateNothing = startSequence(platform);
      lateNothing.grace.expire(); // decided: no response
      lateNothing.tracker.recordAcknowledgement();
      lateNothing.tracker.recordChannelClosed();
      const lateNothingRecord = await lateNothing.sequence;
      expect(lateNothingRecord.grace.verdict).toBe('NO_SHUTDOWN_RESPONSE');
      expect(lateNothingRecord.hardKill).toEqual(EXECUTED[platform]);

      const lateExpiry = startSequence(platform);
      lateExpiry.tracker.recordAcknowledgement();
      lateExpiry.tracker.recordExit(); // decided: confirmed
      lateExpiry.grace.expire(); // ignored
      const lateExpiryRecord = await lateExpiry.sequence;
      expect(lateExpiryRecord.hardKill).toEqual({ disposition: 'NOT_REQUIRED' });
      expect(lateExpiry.calls).not.toContain(HARD_CALL[platform]);
    });
  },
);

describe('Tier 2 platform-specific hard stage after an unacknowledged exit (pure; executed on every platform)', () => {
  it('WINDOWS: across the whole decision matrix, taskkill is issued ONLY while the child exit is unobserved', async () => {
    type Step = 'ack' | 'exit' | 'channel' | 'expire';
    const scenarios: readonly (readonly Step[])[] = [
      ['exit', 'channel'],
      ['exit', 'expire'],
      ['ack', 'exit'],
      ['ack', 'expire'],
      ['expire'],
      ['ack', 'channel', 'expire'],
    ];
    for (const steps of scenarios) {
      const run = startSequence('win32');
      for (const step of steps) {
        if (step === 'ack') run.tracker.recordAcknowledgement();
        else if (step === 'exit') run.tracker.recordExit();
        else if (step === 'channel') run.tracker.recordChannelClosed();
        else run.grace.expire();
      }
      const record = await run.sequence;
      const taskkills = run.calls.filter((call) => call.startsWith('taskkill:'));
      if (run.tracker.exitObserved()) expect(taskkills, steps.join('>')).toEqual([]);
      else expect(taskkills, steps.join('>')).toEqual(['taskkill:/pid 4242 /T /F']);
      if (record.hardKill.disposition === 'EXECUTED') {
        expect(run.tracker.exitObserved(), steps.join('>')).toBe(false);
      }
    }
  });

  it('POSIX: the group SIGKILL after an unacknowledged exit records honestly whether the group still existed', async () => {
    const empty = startSequence('posix', { hardGroupResult: 'NO_SUCH_PROCESS' });
    empty.tracker.recordExit();
    empty.tracker.recordChannelClosed();
    expect((await empty.sequence).hardKill).toEqual({
      disposition: 'EXECUTED',
      record: { method: 'POSIX_PROCESS_GROUP_SIGKILL', delivered: false, taskkillExitCode: null },
    });
    const survivors = startSequence('posix');
    survivors.tracker.recordExit();
    survivors.tracker.recordChannelClosed();
    expect((await survivors.sequence).hardKill).toEqual(EXECUTED.posix);
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
    expect(result.gracePhaseVerdict).toBeNull();
    expect(result.hardKillRequired).toBe(false);
    expect(result.hardKillDisposition).toBe('NOT_REQUIRED');
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
    expect(result.gracePhaseVerdict).toBe('SHUTDOWN_CONFIRMED');
    expect(result.shutdownAcknowledged).toBe(true);
    expect(result.exitedWithinGrace).toBe(true);
    expect(result.gracefulShutdownConfirmed).toBe(true);
    expect(result.hardKillRequired).toBe(false);
    expect(result.hardKillDisposition).toBe('NOT_REQUIRED');
    expect(result.hardKillSuppressionReason).toBeNull();
    expect(result.hardKill).toBeNull();
    expect(result.exitCode).toBe(0);
    expect(isAlive(result.pid)).toBe(false);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('a child that exits WITHOUT acknowledging is UNCONFIRMED and reaches the hard group SIGKILL IMMEDIATELY - never waiting out grace (2D2B-R2A, R2B)', async () => {
    const { result, atHardKill } = await runWithRecord(
      {
        modulePath: fixture('exitsWithoutAck.mjs'),
        watchdogMs: WATCHDOG_MS,
        graceMs: GRACE_NEVER_WAITED_OUT_MS,
      },
      false,
    );
    expect(result.outcome).toBe('TIMED_OUT_KILLED');
    expect(result.gracePhaseVerdict).toBe('CHILD_EXITED_UNCONFIRMED');
    expect(result.exitedWithinGrace).toBe(true);
    expect(result.shutdownAcknowledged).toBe(false);
    expect(result.gracefulShutdownConfirmed).toBe(false);
    // The bare exit did not short-circuit the hard-kill decision.
    expect(result.hardKillRequired).toBe(true);
    expect(result.hardKillDisposition).toBe('EXECUTED');
    expect(result.hardKillSuppressionReason).toBeNull();
    expect(atHardKill).toEqual({ direct: false, descendant: null });
    // Executed, and honestly not delivered: the fixture left its group empty.
    expect(result.hardKill).toEqual({
      method: 'POSIX_PROCESS_GROUP_SIGKILL',
      delivered: false,
      taskkillExitCode: null,
    });
    expect(result.posixGroupSweep).toBe('NO_SUCH_PROCESS');
    expect(isAlive(result.pid)).toBe(false);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('REGRESSION (2D2B-R2A, R2B): a leader that exits WITHOUT ACK leaves a SIGTERM-ignoring same-group descendant, which the IMMEDIATE group SIGKILL removes - no grace wait', async () => {
    const { result, record, descendantAliveWhileRunning, atHardKill } = await runWithRecord(
      {
        modulePath: fixture('leaderExitsWithoutAckLeavesSameGroupDescendant.mjs'),
        watchdogMs: WATCHDOG_MS,
        graceMs: GRACE_NEVER_WAITED_OUT_MS,
      },
      true,
    );
    expect(record).not.toBeNull();
    expect(record!.direct).toBe(result.pid);
    expect(descendantAliveWhileRunning).toBe(true);
    expect(result.gracePhaseVerdict).toBe('CHILD_EXITED_UNCONFIRMED');
    expect(result.exitedWithinGrace).toBe(true);
    expect(result.shutdownAcknowledged).toBe(false);
    expect(result.gracefulShutdownConfirmed).toBe(false);
    expect(result.hardKillRequired).toBe(true);
    expect(result.hardKillDisposition).toBe('EXECUTED');
    // Probed at the moment the hard stage began: the leader is already gone,
    // the descendant survived the graceful SIGTERM and is still ALIVE.
    expect(atHardKill).toEqual({ direct: false, descendant: true });
    // The group SIGKILL found a live member - the descendant - and was delivered.
    expect(result.hardKill).toEqual({
      method: 'POSIX_PROCESS_GROUP_SIGKILL',
      delivered: true,
      taskkillExitCode: null,
    });
    // The sweep follows the delivered SIGKILL within milliseconds. A SIGKILLed
    // process still accepts kill() until it has finished dying (measured on
    // this Mac: an immediate second group kill answered SIGNALLED 79 of 80
    // times), so either answer is honest here; the OS probes below are the proof.
    expect(['NO_SUCH_PROCESS', 'SIGNALLED']).toContain(result.posixGroupSweep);
    expect(isAlive(result.pid)).toBe(false);
    expect(await waitUntilGone(record!.descendant)).toBe(true);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('a never-exiting child reaches the HARD POSIX process-group SIGKILL', async () => {
    const { result } = await runWithRecord(
      { modulePath: fixture('neverExits.mjs'), watchdogMs: WATCHDOG_MS, graceMs: GRACE_MS },
      false,
    );
    expect(result.outcome).toBe('TIMED_OUT_KILLED');
    expect(result.gracefulPhase).toEqual({ ipcRequestSent: true, groupSigtermSent: true });
    expect(result.gracePhaseVerdict).toBe('NO_SHUTDOWN_RESPONSE');
    expect(result.exitedWithinGrace).toBe(false);
    expect(result.gracefulShutdownConfirmed).toBe(false);
    expect(result.hardKillRequired).toBe(true);
    expect(result.hardKillDisposition).toBe('EXECUTED');
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
    expect(result.gracePhaseVerdict).toBe('SHUTDOWN_CONFIRMED');
    expect(result.gracefulShutdownConfirmed).toBe(true);
    expect(result.hardKillRequired).toBe(false);
    expect(result.hardKillDisposition).toBe('NOT_REQUIRED');
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
    expect(result.gracePhaseVerdict).toBe('NO_SHUTDOWN_RESPONSE');
    expect(result.exitedWithinGrace).toBe(false); // still alive to anchor the tree walk
    expect(result.hardKillDisposition).toBe('EXECUTED');
    expect(result.hardKill?.method).toBe('WINDOWS_TASKKILL_TREE');
    expect(result.hardKill?.taskkillExitCode).toBe(0);
    expect(isAlive(result.pid)).toBe(false);
    expect(await waitUntilGone(record!.descendant)).toBe(true);
    expect(existsSync(result.scratchDir)).toBe(false);
  });

  it('a bare exit without acknowledgement is UNCONFIRMED, requires the hard stage, and SUPPRESSES taskkill against the expired PID - immediately (2D2B-R2B)', async () => {
    const { result } = await runWithRecord(
      {
        modulePath: fixture('exitsWithoutAck.mjs'),
        watchdogMs: WATCHDOG_MS,
        graceMs: GRACE_NEVER_WAITED_OUT_MS,
      },
      false,
    );
    expect(result.gracePhaseVerdict).toBe('CHILD_EXITED_UNCONFIRMED');
    expect(result.exitedWithinGrace).toBe(true);
    expect(result.shutdownAcknowledged).toBe(false);
    expect(result.gracefulShutdownConfirmed).toBe(false);
    // Logically required; deliberately not executed; nothing claimed.
    expect(result.hardKillRequired).toBe(true);
    expect(result.hardKillDisposition).toBe('SUPPRESSED_EXPIRED_TARGET_IDENTITY');
    expect(result.hardKillSuppressionReason).toBe('DIRECT_CHILD_EXIT_OBSERVED');
    expect(result.hardKill).toBeNull();
    expect(result.posixGroupSweep).toBe('NOT_APPLICABLE');
    expect(isAlive(result.pid)).toBe(false);
    expect(existsSync(result.scratchDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2D2C-F0Z — the parent-side liveness witness.
//
// Recovery-1's incident D was a hard-killed child: whatever it knew died with
// it. The parent survived, so the parent is where the durable evidence has to
// live. Every assertion below is about RECORDING; none of these fields is read
// by the termination sequence or by `deriveStopDecision`, and C2 is NOT
// implemented, so no verdict changes.
// ---------------------------------------------------------------------------
describe('2D2C-F0Z parent-side liveness witness', () => {
  it('records the witness on the ordinary COMPLETED path, with no watchdog fire', async () => {
    const result = await runProcessIsolatedBatch({
      modulePath: fixture('quickExit.mjs'),
      watchdogMs: 30_000,
      graceMs: 1_000,
    });
    expect(result.outcome).toBe('COMPLETED');
    const w = result.livenessWitness!;
    expect(w).not.toBeNull();
    expect(w.watchdogNominalMs).toBe(30_000);
    expect(w.graceNominalMs).toBe(1_000);
    // The watchdog never fired, so every fire-related field stays null and
    // the overshoot is honestly absent rather than reported as zero.
    expect(w.watchdogFiredAtUtc).toBeNull();
    expect(w.watchdogOvershootMs).toBeNull();
    expect(w.ipcConnectedAtWatchdogFire).toBeNull();
    expect(w.graceArmedAtUtc).toBeNull();
    expect(w.graceExpiredByDeadline).toBe(false);
    expect(w.shutdownRequestAttemptedAtUtc).toBeNull();
    expect(w.hardKillAttemptedAtUtc).toBeNull();
    // The child did exit, and that instant is recorded.
    expect(w.childExitObservedAtUtc).not.toBeNull();
    expect(w.parentHeartbeat).not.toBeNull();
  });

  it('records the watchdog overshoot and the IPC state sampled at the fire', async () => {
    const result = await runProcessIsolatedBatch({
      modulePath: fixture('cooperativeShutdown.mjs'),
      watchdogMs: 250,
      graceMs: 5_000,
    });
    expect(result.outcome).toBe('TIMED_OUT_KILLED');
    const w = result.livenessWitness!;
    expect(w.watchdogNominalMs).toBe(250);
    expect(w.watchdogFiredAtUtc).not.toBeNull();
    // A healthy parent overshoots its own timer by a small amount; the field
    // exists so a future 780,400 ms is self-evident rather than reconstructed.
    expect(w.watchdogOvershootMs).not.toBeNull();
    expect(w.watchdogOvershootMs!).toBeLessThan(5_000);
    // This child keeps its channel open, so the request really was sent.
    expect(w.ipcConnectedAtWatchdogFire).toBe(true);
    expect(w.shutdownRequestAttemptedAtUtc).not.toBeNull();
    expect(w.shutdownAckObservedAtUtc).not.toBeNull();
    expect(result.gracePhaseVerdict).toBe('SHUTDOWN_CONFIRMED');
    // Confirmed, so no hard stage was attempted at all.
    expect(w.hardKillAttemptedAtUtc).toBeNull();
    expect(w.graceExpiredByDeadline).toBe(false);
  });

  it('EXPLAINS an ipcRequestSent:false: the channel was already closed when the watchdog fired', async () => {
    const result = await runProcessIsolatedBatch({
      modulePath: fixture('disconnectsThenLingers.mjs'),
      watchdogMs: 250,
      graceMs: 5_000,
    });
    expect(result.outcome).toBe('TIMED_OUT_KILLED');
    expect(result.gracefulPhase?.ipcRequestSent).toBe(false);
    const w = result.livenessWitness!;
    // THE POINT: the landed record said only `ipcRequestSent: false`, which
    // reads as "the child ignored us". These two fields say what actually
    // happened - the child had already closed the channel, so no request
    // could be sent and no ACK was ever possible.
    expect(w.ipcConnectedAtWatchdogFire).toBe(false);
    expect(w.childDisconnectObservedAtUtc).not.toBeNull();
    expect(w.shutdownAckObservedAtUtc).toBeNull();

    // C2 IS NOT IMPLEMENTED. The verdict is unchanged from the landed
    // behaviour: this is still an unconfirmed termination and still a stop.
    expect(result.gracePhaseVerdict).toBe('CHILD_EXITED_UNCONFIRMED');
    expect(result.hardKillRequired).toBe(true);
  });

  it('the witness never names a cause: no field asserts a stall, a suspension or a reason', async () => {
    const result = await runProcessIsolatedBatch({
      modulePath: fixture('quickExit.mjs'),
      watchdogMs: 30_000,
      graceMs: 1_000,
    });
    const keys = Object.keys(result.livenessWitness!).join(' ').toLowerCase();
    for (const banned of ['stall', 'suspend', 'cause', 'reason', 'hung', 'wedged', 'diagnosis']) {
      expect(keys, `the witness names a cause via ${banned}`).not.toContain(banned);
    }
  });
});

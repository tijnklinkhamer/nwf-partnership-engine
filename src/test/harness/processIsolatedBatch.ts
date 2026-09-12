/**
 * TIER 2 — THE TEST-HARNESS-ONLY FORKED-PROCESS WATCHDOG (2D2B-2).
 *
 * Tier 1 (`runQueryWithLivenessBoundary` in `agentSdkRunner.ts`) bounds one
 * SDK query from INSIDE the batch process, which only works while that
 * process's event loop is alive. This module is the observer from OUTSIDE:
 * one forked child per future 2D2C batch, a parent-owned watchdog, a bounded
 * stderr tail, a graceful termination attempt, and an OS-level process-tree
 * hard kill after a bounded grace. Its purpose is EVIDENCE — letting a bounded
 * evaluation run see whether Tier 1 fired before this watchdog had to — not
 * production process isolation.
 *
 * IT LIVES UNDER `src/test/` AND NOWHERE ELSE. No production module imports
 * it, and it is never a production fallback (`phase2b.firewall.test.ts`).
 *
 * TERMINATION, PER PLATFORM — the order is the design:
 *
 *   POSIX (executed on macOS in this recovery):
 *     the child is forked `detached`, i.e. setsid(): it LEADS its own process
 *     group, whose id is its validated PID. Graceful: the IPC shutdown request
 *     plus `process.kill(-pid, 'SIGTERM')` to that group. Hard, whenever the
 *     grace phase ends without a CONFIRMED shutdown - including after a bare
 *     exit: `process.kill(-pid, 'SIGKILL')`, which still reaches any
 *     same-group descendant of an already-exited leader (ESRCH when the group
 *     is empty, recorded as not delivered). After the direct child has exited, on
 *     EVERY path, one more group SIGKILL sweeps any same-group descendant that
 *     outlived its leader (ESRCH — nobody left — is the ordinary answer). A
 *     descendant that called setsid() itself is in ANOTHER group and is out of
 *     reach by construction; that limit is documented, not papered over.
 *
 *   Windows (historical design; code-inspected here, executed only on Windows):
 *     graceful is the IPC shutdown request ONLY. `child.kill('SIGTERM')` is
 *     NEVER called: on Windows it is TerminateProcess on the direct child,
 *     which would die before `taskkill /T` could walk its live descendant
 *     tree, orphaning a detached grandchild (the lost-laptop kill race; see
 *     docs/audits/PHASE_2B_2D2B_2_TIER2_WINDOWS_KILL_RACE_2026-09.md). An
 *     ignored request keeps the direct child ALIVE until the hard stage:
 *     `taskkill /pid <validated-pid> /T /F`, invoked without a shell. Any
 *     unconfirmed grace phase reaches that stage, a bare exit included.
 *
 * A graceful shutdown is CONFIRMED only when the child both acknowledged
 * over IPC and exited within the grace window. The two halves are tracked
 * INDEPENDENTLY, and the grace phase ends early only when BOTH have arrived
 * (`createGracePhaseTracker`). Every other outcome requires the hard stage:
 * a bare exit without an acknowledgement is recorded as an exit
 * (`CHILD_EXITED_UNCONFIRMED`), never as a confirmed cooperative shutdown,
 * and it does NOT short-circuit the hard tree kill (2D2B-R2A). The complete
 * decision - request, grace, verdict, hard stage - is ONE function,
 * `runTerminationSequence`, which `runProcessIsolatedBatch` calls and the
 * pure contract tests execute on every platform.
 *
 * WINDOWS LIMIT AFTER AN UNACKNOWLEDGED EXIT: `taskkill /T` walks the tree
 * from a LIVE root. When the direct child has already exited without
 * acknowledging, the hard stage is still ATTEMPTED, but it cannot
 * reconstruct the former descendant tree, and taskkill will normally report
 * failure; the record says so (`delivered: false`, the real exit code) and
 * nothing claims the tree was cleaned up. Once the root's handle is closed its
 * PID may also be reused, so that attempt could in principle reach an
 * unrelated process; the window is the grace period. No Job Object, process
 * enumeration or dependency is introduced to close either gap.
 *
 * Every PID that reaches a signal or `taskkill` passes
 * `validateSignalTargetPid` first (a safe integer > 1): `process.kill(-1)`
 * would signal every process the user owns and `process.kill(-0)` the
 * harness's own group, so neither is expressible. No PID is ever interpolated
 * into a shell, and only the group this harness itself spawned is signalled.
 *
 * Every harness-created scratch directory is removed before the harness
 * returns or throws.
 */
import { execFile, fork, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SHUTDOWN_REQUEST_MESSAGE = 'nwf-pe-tier2:shutdown-request';
export const SHUTDOWN_ACK_MESSAGE = 'nwf-pe-tier2:shutdown-ack';
/** The child learns its scratch directory from this variable (and runs with it as cwd). */
export const HARNESS_SCRATCH_DIR_VARIABLE = 'NWF_PE_TIER2_SCRATCH_DIR';
export const HARNESS_SCRATCH_PREFIX = 'nwf-pe-tier2-batch-';
export const HARNESS_STDERR_TAIL_MAX_CHARS = 2_048;

/** Bounded wait, after exit, for stdio and the IPC channel to drain. */
const EXIT_DRAIN_MS = 2_000;
/** Bounded wait for the direct child's exit after a hard kill. */
const HARD_KILL_EXIT_WAIT_MS = 10_000;
const TASKKILL_TIMEOUT_MS = 30_000;
/** POSIX sweep: bounded retry of Darwin's transient zombie-group EPERM (≤ 2 s). */
const SWEEP_EPERM_RETRY_MS = 10;
const SWEEP_EPERM_MAX_ATTEMPTS = 200;
/** OS variables a forked Node fixture may need; nothing else crosses. */
const CHILD_ENV_PASSTHROUGH = ['PATH', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR'];

export type TerminationPlatform = 'posix' | 'win32';

export function terminationPlatformOf(platform: NodeJS.Platform): TerminationPlatform {
  return platform === 'win32' ? 'win32' : 'posix';
}

/** A PID may enter a signal or tree-kill path only as a safe integer greater than 1. */
export function validateSignalTargetPid(pid: unknown): number {
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 1) {
    throw new RangeError(
      `refusing to signal pid ${String(pid)}: a signal target must be an integer greater than 1.`,
    );
  }
  return pid;
}

/** The exact `taskkill` argument vector for one validated PID. */
export function buildTaskkillArgs(pid: number): readonly string[] {
  return ['/pid', String(validateSignalTargetPid(pid)), '/T', '/F'];
}

export type GroupSignalResult = 'SIGNALLED' | 'NO_SUCH_PROCESS';

export interface TaskkillOutcome {
  readonly exitCode: number | null;
}

/**
 * The ONLY operating-system actions a termination sequence can take. There
 * is deliberately no "kill the direct child" operation in this interface.
 */
export interface TerminationOperations {
  /** One IPC message to the direct child; false when the channel is gone. */
  sendIpc(message: string): boolean;
  /** POSIX: signal the child's whole process group (the negated validated PID). */
  signalProcessGroup(pid: number, signal: 'SIGTERM' | 'SIGKILL'): GroupSignalResult;
  /** Windows: `taskkill /pid <pid> /T /F`, no shell. */
  taskkillTree(pid: number): Promise<TaskkillOutcome>;
}

export interface GracefulPhaseRecord {
  readonly ipcRequestSent: boolean;
  readonly groupSigtermSent: boolean;
}

/** Starts the graceful phase: IPC request everywhere; plus the group SIGTERM on POSIX only. */
export function beginGracefulShutdown(
  platform: TerminationPlatform,
  pid: number,
  ops: TerminationOperations,
): GracefulPhaseRecord {
  const target = validateSignalTargetPid(pid);
  const ipcRequestSent = ops.sendIpc(SHUTDOWN_REQUEST_MESSAGE);
  if (platform === 'win32') {
    // No signal of any kind: the direct child must stay alive to anchor the
    // hard-stage tree walk if it ignores the request.
    return { ipcRequestSent, groupSigtermSent: false };
  }
  return {
    ipcRequestSent,
    groupSigtermSent: ops.signalProcessGroup(target, 'SIGTERM') === 'SIGNALLED',
  };
}

export type HardKillMethod = 'POSIX_PROCESS_GROUP_SIGKILL' | 'WINDOWS_TASKKILL_TREE';

export interface HardKillRecord {
  readonly method: HardKillMethod;
  /** POSIX: whether the group still existed; Windows: taskkill's exit code. */
  readonly delivered: boolean;
  readonly taskkillExitCode: number | null;
}

/** The OS-level tree kill: group SIGKILL on POSIX, `taskkill /T /F` on Windows. */
export async function hardKillProcessTree(
  platform: TerminationPlatform,
  pid: number,
  ops: TerminationOperations,
): Promise<HardKillRecord> {
  const target = validateSignalTargetPid(pid);
  if (platform === 'win32') {
    const outcome = await ops.taskkillTree(target);
    return {
      method: 'WINDOWS_TASKKILL_TREE',
      delivered: outcome.exitCode === 0,
      taskkillExitCode: outcome.exitCode,
    };
  }
  return {
    method: 'POSIX_PROCESS_GROUP_SIGKILL',
    delivered: ops.signalProcessGroup(target, 'SIGKILL') === 'SIGNALLED',
    taskkillExitCode: null,
  };
}

/** Confirmed means BOTH: the child acknowledged, AND it exited inside the grace window. */
export function isGracefulShutdownConfirmed(input: {
  readonly acknowledged: boolean;
  readonly exitedWithinGrace: boolean;
}): boolean {
  return input.acknowledged && input.exitedWithinGrace;
}

/**
 * What the grace phase observed. Only `SHUTDOWN_CONFIRMED` avoids the hard
 * stage; an exit alone (`CHILD_EXITED_UNCONFIRMED`) says nothing about what
 * the child left behind, so it is not treated as a completed shutdown.
 */
export type GracePhaseVerdict =
  | 'SHUTDOWN_CONFIRMED'
  | 'CHILD_EXITED_UNCONFIRMED'
  | 'ACKNOWLEDGED_NOT_EXITED'
  | 'NO_SHUTDOWN_RESPONSE';

export interface GracePhaseDecision {
  readonly verdict: GracePhaseVerdict;
  readonly acknowledged: boolean;
  readonly exitedWithinGrace: boolean;
  readonly gracefulShutdownConfirmed: boolean;
  readonly hardKillRequired: boolean;
}

export function decideGracePhase(observed: {
  readonly acknowledged: boolean;
  readonly exitedWithinGrace: boolean;
}): GracePhaseDecision {
  const { acknowledged, exitedWithinGrace } = observed;
  const confirmed = isGracefulShutdownConfirmed({ acknowledged, exitedWithinGrace });
  const verdict: GracePhaseVerdict = confirmed
    ? 'SHUTDOWN_CONFIRMED'
    : exitedWithinGrace
      ? 'CHILD_EXITED_UNCONFIRMED'
      : acknowledged
        ? 'ACKNOWLEDGED_NOT_EXITED'
        : 'NO_SHUTDOWN_RESPONSE';
  return Object.freeze({
    verdict,
    acknowledged,
    exitedWithinGrace,
    gracefulShutdownConfirmed: confirmed,
    hardKillRequired: !confirmed,
  });
}

/**
 * Tracks the acknowledgement and the exit INDEPENDENTLY. `settled` resolves
 * exactly once: as confirmed the moment the SECOND half arrives, or with
 * whatever had been observed when the grace deadline expires. Events after
 * that are ignored, so neither a late exit nor a late acknowledgement can
 * rewrite the decision.
 */
export interface GracePhaseTracker {
  recordAcknowledgement(): void;
  recordExit(): void;
  expireGrace(): void;
  readonly settled: Promise<GracePhaseDecision>;
}

export function createGracePhaseTracker(): GracePhaseTracker {
  let acknowledged = false;
  let exited = false;
  let decided = false;
  let resolveSettled!: (decision: GracePhaseDecision) => void;
  const settled = new Promise<GracePhaseDecision>((resolveDecision) => {
    resolveSettled = resolveDecision;
  });
  const settle = (): void => {
    decided = true;
    resolveSettled(decideGracePhase({ acknowledged, exitedWithinGrace: exited }));
  };
  return {
    recordAcknowledgement: () => {
      if (decided) return;
      acknowledged = true;
      if (exited) settle();
    },
    recordExit: () => {
      if (decided) return;
      exited = true;
      if (acknowledged) settle();
    },
    expireGrace: () => {
      if (!decided) settle();
    },
    settled,
  };
}

/** Arms the grace deadline: calls `onExpired` once it elapses, and returns its disarm function. */
export type GraceTimerArm = (onExpired: () => void) => () => void;

export interface TerminationSequenceRecord {
  readonly gracefulPhase: GracefulPhaseRecord;
  readonly grace: GracePhaseDecision;
  readonly hardKill: HardKillRecord | null;
}

/**
 * THE termination state machine, shared by `runProcessIsolatedBatch` and the
 * pure contract tests: graceful request -> grace decision -> the OS-level
 * hard stage unless the shutdown was CONFIRMED. The caller feeds the tracker
 * from its own IPC and exit events.
 */
export async function runTerminationSequence(input: {
  readonly platform: TerminationPlatform;
  readonly pid: number;
  readonly ops: TerminationOperations;
  readonly tracker: GracePhaseTracker;
  readonly armGrace: GraceTimerArm;
  readonly beforeHardKill?: (() => Promise<void> | void) | undefined;
}): Promise<TerminationSequenceRecord> {
  const gracefulPhase = beginGracefulShutdown(input.platform, input.pid, input.ops);
  const disarmGrace = input.armGrace(() => input.tracker.expireGrace());
  const grace = await input.tracker.settled;
  disarmGrace();
  if (!grace.hardKillRequired) return { gracefulPhase, grace, hardKill: null };
  await input.beforeHardKill?.();
  const hardKill = await hardKillProcessTree(input.platform, input.pid, input.ops);
  return { gracefulPhase, grace, hardKill };
}

function posixSignalProcessGroup(pid: number, signal: 'SIGTERM' | 'SIGKILL'): GroupSignalResult {
  const target = validateSignalTargetPid(pid);
  try {
    process.kill(-target, signal);
    return 'SIGNALLED';
  } catch (error) {
    // Already gone: an honest answer, not a failure.
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return 'NO_SUCH_PROCESS';
    throw error;
  }
}

/**
 * The POSIX post-exit sweep. Darwin answers EPERM, not ESRCH, while a
 * group's only remaining members are unreaped zombies - measured at ~3.5 ms
 * right after a group SIGKILL, before launchd reaps them. A sweep that
 * follows a hard kill of an ALREADY-EXITED leader lands in that window every
 * time (2D2B-R2A), so EPERM is retried for a bounded time; an EPERM that
 * persists past the bound is still thrown.
 */
async function posixPostExitSweep(pid: number): Promise<GroupSignalResult> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return posixSignalProcessGroup(pid, 'SIGKILL');
    } catch (error) {
      const persistent = attempt >= SWEEP_EPERM_MAX_ATTEMPTS;
      if ((error as NodeJS.ErrnoException).code !== 'EPERM' || persistent) throw error;
    }
    await new Promise((resolveRetry) => setTimeout(resolveRetry, SWEEP_EPERM_RETRY_MS));
  }
}

function windowsTaskkillTree(pid: number): Promise<TaskkillOutcome> {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  const executable =
    systemRoot !== undefined ? join(systemRoot, 'System32', 'taskkill.exe') : 'taskkill';
  const args = [...buildTaskkillArgs(pid)];
  return new Promise((resolveTaskkill) => {
    execFile(
      executable,
      args,
      { shell: false, windowsHide: true, timeout: TASKKILL_TIMEOUT_MS },
      (error) => {
        if (error === null) {
          resolveTaskkill({ exitCode: 0 });
          return;
        }
        resolveTaskkill({ exitCode: typeof error.code === 'number' ? error.code : null });
      },
    );
  });
}

function boundedTail(text: string): string {
  if (text.length <= HARNESS_STDERR_TAIL_MAX_CHARS) return text;
  return text.slice(text.length - HARNESS_STDERR_TAIL_MAX_CHARS);
}

function childEnvironment(scratchDir: string): Record<string, string> {
  const env: Record<string, string> = { [HARNESS_SCRATCH_DIR_VARIABLE]: scratchDir };
  for (const name of CHILD_ENV_PASSTHROUGH) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

export type ProcessIsolatedBatchOutcome = 'COMPLETED' | 'TIMED_OUT_KILLED';

export interface ProcessIsolatedBatchOptions {
  /** The batch module to fork (a test fixture today; a 2D2C batch entry later). */
  readonly modulePath: string;
  readonly args?: readonly string[];
  /** Parent-owned watchdog: how long the batch may run before termination begins. */
  readonly watchdogMs: number;
  /** How long the graceful phase may take before the hard tree kill. */
  readonly graceMs: number;
  /** Called once the child exists, with its validated PID — lets a test register emergency cleanup. */
  readonly onChildSpawned?: (pid: number, scratchDir: string) => void;
  /** Called when the grace decision requires the hard stage, immediately before it — lets a test probe what is still alive. */
  readonly beforeHardKill?: () => Promise<void> | void;
  /** Called after the child is gone and before the scratch directory is removed. */
  readonly beforeCleanup?: (scratchDir: string) => Promise<void> | void;
}

export interface ProcessIsolatedBatchResult {
  readonly outcome: ProcessIsolatedBatchOutcome;
  readonly platform: TerminationPlatform;
  /** The direct child's PID — owned by this harness. */
  readonly pid: number;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly gracefulShutdownRequested: boolean;
  readonly gracefulPhase: GracefulPhaseRecord | null;
  /** The grace decision; null when the batch completed before the watchdog. */
  readonly gracePhaseVerdict: GracePhaseVerdict | null;
  /** Acknowledged in answer to the request, before the grace decision. */
  readonly shutdownAcknowledged: boolean;
  readonly exitedWithinGrace: boolean;
  readonly gracefulShutdownConfirmed: boolean;
  readonly hardKillRequired: boolean;
  readonly hardKill: HardKillRecord | null;
  /** POSIX only: the post-exit group sweep's answer. */
  readonly posixGroupSweep: GroupSignalResult | 'NOT_APPLICABLE';
  /** The final ≤ 2,048 characters the child wrote to stderr. */
  readonly stderrTail: string;
  /** Already removed when this result is returned. */
  readonly scratchDir: string;
}

interface Timer {
  readonly elapsed: Promise<void>;
  cancel(): void;
}

function timer(ms: number): Timer {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const elapsed = new Promise<void>((resolveTimer) => {
    handle = setTimeout(resolveTimer, ms);
  });
  return { elapsed, cancel: () => clearTimeout(handle) };
}

async function withinBound<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  const bound = timer(ms);
  try {
    return await Promise.race([promise, bound.elapsed.then(() => undefined)]);
  } finally {
    bound.cancel();
  }
}

function assertPositiveDuration(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive, finite number of milliseconds.`);
  }
}

interface ExitInfo {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export async function runProcessIsolatedBatch(
  options: ProcessIsolatedBatchOptions,
): Promise<ProcessIsolatedBatchResult> {
  assertPositiveDuration('watchdogMs', options.watchdogMs);
  assertPositiveDuration('graceMs', options.graceMs);
  const platform = terminationPlatformOf(process.platform);
  const scratchDir = await mkdtemp(join(tmpdir(), HARNESS_SCRATCH_PREFIX));

  let child: ChildProcess | undefined;
  let exited: Promise<ExitInfo> | undefined;
  let exitInfo: ExitInfo | undefined;
  /** Exists only once the graceful phase has begun; the IPC and exit events feed it. */
  let graceTracker: GracePhaseTracker | undefined;
  try {
    const forked = fork(options.modulePath, [...(options.args ?? [])], {
      cwd: scratchDir,
      env: childEnvironment(scratchDir),
      // Never inherit the test runner's own Node flags.
      execArgv: [],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      // POSIX: setsid(), so the child leads a process group of its own.
      detached: platform === 'posix',
      serialization: 'json',
    });
    child = forked;
    forked.on('error', () => {
      // Surfaced through exit/pid handling below; never an unhandled 'error'.
    });
    exited = new Promise<ExitInfo>((resolveExit) => {
      forked.once('exit', (code, signal) => {
        exitInfo = { code, signal };
        graceTracker?.recordExit();
        resolveExit(exitInfo);
      });
    });
    const drained = Promise.all([
      new Promise<void>((resolveClose) => forked.once('close', () => resolveClose())),
      new Promise<void>((resolveDisconnect) => {
        if (!forked.connected) resolveDisconnect();
        else forked.once('disconnect', () => resolveDisconnect());
      }),
    ]);

    let stderrTail = '';
    forked.stderr?.setEncoding('utf8');
    forked.stderr?.on('data', (chunk: string) => {
      stderrTail = boundedTail(stderrTail + chunk);
    });
    forked.on('message', (message) => {
      // An acknowledgement is an ANSWER to the request: before the graceful
      // phase there is no tracker, and nothing to acknowledge.
      if (message === SHUTDOWN_ACK_MESSAGE) graceTracker?.recordAcknowledgement();
    });

    if (forked.pid === undefined) {
      throw new Error(`Tier 2 harness: failed to fork ${options.modulePath}.`);
    }
    const pid = validateSignalTargetPid(forked.pid);
    options.onChildSpawned?.(pid, scratchDir);

    const ops: TerminationOperations = {
      sendIpc: (message) => {
        if (!forked.connected) return false;
        try {
          return forked.send(message, () => {
            // A send racing the child's exit is not an error worth surfacing.
          });
        } catch {
          return false;
        }
      },
      signalProcessGroup: posixSignalProcessGroup,
      taskkillTree: windowsTaskkillTree,
    };

    const watchdog = timer(options.watchdogMs);
    const first = await Promise.race([
      exited.then((exit) => ({ kind: 'EXIT' as const, exit })),
      watchdog.elapsed.then(() => ({ kind: 'WATCHDOG' as const })),
    ]);
    watchdog.cancel();

    let outcome: ProcessIsolatedBatchOutcome = 'COMPLETED';
    let exit: ExitInfo;
    let gracefulPhase: GracefulPhaseRecord | null = null;
    let grace: GracePhaseDecision | null = null;
    let hardKill: HardKillRecord | null = null;

    if (first.kind === 'EXIT') {
      exit = first.exit;
    } else {
      outcome = 'TIMED_OUT_KILLED';
      const tracker = createGracePhaseTracker();
      graceTracker = tracker;
      if (exitInfo !== undefined) tracker.recordExit();
      const sequence = await runTerminationSequence({
        platform,
        pid,
        ops,
        tracker,
        armGrace: (onExpired) => {
          const handle = setTimeout(onExpired, options.graceMs);
          return () => clearTimeout(handle);
        },
        beforeHardKill: options.beforeHardKill,
      });
      gracefulPhase = sequence.gracefulPhase;
      grace = sequence.grace;
      hardKill = sequence.hardKill;
      // Confirmed implies the exit was already observed; after a hard stage
      // the exit is awaited, bounded (immediate when the child exited unacknowledged).
      const settledExit = await withinBound(exited, HARD_KILL_EXIT_WAIT_MS);
      if (settledExit === undefined) {
        throw new Error(
          `Tier 2 harness: pid ${pid} did not exit within ${HARD_KILL_EXIT_WAIT_MS} ms of the hard kill.`,
        );
      }
      exit = settledExit;
    }

    await withinBound(drained, EXIT_DRAIN_MS);
    const posixGroupSweep: GroupSignalResult | 'NOT_APPLICABLE' =
      platform === 'posix' ? await posixPostExitSweep(pid) : 'NOT_APPLICABLE';

    await options.beforeCleanup?.(scratchDir);

    return {
      outcome,
      platform,
      pid,
      exitCode: exit.code,
      signal: exit.signal,
      gracefulShutdownRequested: gracefulPhase !== null,
      gracefulPhase,
      gracePhaseVerdict: grace?.verdict ?? null,
      shutdownAcknowledged: grace?.acknowledged ?? false,
      exitedWithinGrace: grace?.exitedWithinGrace ?? false,
      gracefulShutdownConfirmed: grace?.gracefulShutdownConfirmed ?? false,
      hardKillRequired: grace?.hardKillRequired ?? false,
      hardKill,
      posixGroupSweep,
      stderrTail,
      scratchDir,
    };
  } finally {
    // Emergency path: whatever went wrong above, never leave the tree running.
    if (
      child !== undefined &&
      child.pid !== undefined &&
      child.exitCode === null &&
      child.signalCode === null
    ) {
      try {
        await hardKillProcessTree(platform, child.pid, {
          sendIpc: () => false,
          signalProcessGroup: posixSignalProcessGroup,
          taskkillTree: windowsTaskkillTree,
        });
      } catch {
        // Best effort; the scratch removal below still runs.
      }
      if (exited !== undefined) await withinBound(exited, HARD_KILL_EXIT_WAIT_MS);
    }
    child?.stderr?.destroy();
    if (child?.connected === true) child.disconnect();
    await rm(scratchDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

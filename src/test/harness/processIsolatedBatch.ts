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
 *     grace phase ends without a CONFIRMED shutdown: `process.kill(-pid,
 *     'SIGKILL')`, which still reaches any same-group descendant of an
 *     already-exited leader (ESRCH when the group is empty, recorded as not
 *     delivered). An UNACKNOWLEDGED exit ends the grace phase at once, so that
 *     group kill follows the leader's exit immediately, while the PGID
 *     association is freshest, rather than at the grace deadline (2D2B-R2B).
 *     After the direct child has exited, on EVERY path, one more group SIGKILL
 *     sweeps any same-group descendant that outlived its leader. Both group
 *     SIGKILLs settle Darwin's transient zombie-group EPERM for a bounded
 *     time. A descendant that called setsid() itself is in ANOTHER group and
 *     is out of reach by construction; that limit is documented, not papered
 *     over.
 *
 *   Windows (historical design; code-inspected here, executed only on Windows):
 *     graceful is the IPC shutdown request ONLY. `child.kill('SIGTERM')` is
 *     NEVER called: on Windows it is TerminateProcess on the direct child,
 *     which would die before `taskkill /T` could walk its live descendant
 *     tree, orphaning a detached grandchild (the lost-laptop kill race; see
 *     docs/audits/PHASE_2B_2D2B_2_TIER2_WINDOWS_KILL_RACE_2026-09.md). An
 *     ignored request keeps the direct child ALIVE until the hard stage:
 *     `taskkill /pid <validated-pid> /T /F`, invoked without a shell - but
 *     ONLY while the harness has not observed the child's exit (below).
 *
 * A graceful shutdown is CONFIRMED only when the child both acknowledged
 * over IPC and exited within the grace window. The two halves are tracked
 * INDEPENDENTLY (`createGracePhaseTracker`). ACK plus exit ends the grace
 * phase early as confirmed. An exit WITHOUT an acknowledgement ends it early
 * too, as `CHILD_EXITED_UNCONFIRMED`, once the IPC channel has also closed -
 * the moment an ACK already in flight can no longer arrive (Node does not
 * order `'message'` before `'exit'`). ACK without exit, and neither, wait for
 * the grace deadline. Every outcome but a confirmed one logically requires
 * the hard stage (`hardKillRequired`); a bare exit is never a cooperative
 * shutdown (2D2B-R2A). The complete decision - request, grace, verdict, hard
 * stage - is ONE function, `runTerminationSequence`, which
 * `runProcessIsolatedBatch` calls and the pure contract tests execute on
 * every platform.
 *
 * STALE TARGET IDENTITY (2D2B-R2B). `taskkill` targets a NUMBER. Windows
 * documents a PID as valid only "from the time the process is created until
 * the process has been terminated", and `validateSignalTargetPid` proves
 * only that the number is well-formed, never that it still names the child
 * this harness created. So once the harness has observed the direct child's
 * exit, `taskkill` is never issued: the required hard stage is recorded as
 * `SUPPRESSED_EXPIRED_TARGET_IDENTITY`, never as attempted or delivered, and
 * nothing claims the child's former descendants were cleaned up (`taskkill
 * /T` could not walk from a dead root anyway). `hardKillProcessTree` checks
 * the harness-owned exit state immediately before spawning `taskkill`, with
 * no `await` between the check and the spawn. What remains is the unavoidable
 * race between that userspace check and `taskkill.exe` opening the PID; it is
 * documented, not claimed atomic. No Job Object, process enumeration or
 * dependency is introduced.
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
/**
 * 2D2C-F0Z liveness probe. PURELY OBSERVATIONAL: a child that never answers
 * is recorded as unresponsive and is NEVER killed, refused or timed out for
 * it. No decision anywhere reads the probe's result.
 *
 * It exists because the F0Z experiment showed the parent can see a stall the
 * child cannot report: a child SIGSTOPped for 2,000 ms answered with a
 * 2,002 ms round trip against a 396 ms median, while the parent stayed
 * healthy and able to write the observation down.
 */
export const LIVENESS_PING_MESSAGE = 'nwf-pe-tier2:liveness-ping';
export const LIVENESS_PONG_MESSAGE = 'nwf-pe-tier2:liveness-pong';
/** The child learns its scratch directory from this variable (and runs with it as cwd). */
export const HARNESS_SCRATCH_DIR_VARIABLE = 'NWF_PE_TIER2_SCRATCH_DIR';
export const HARNESS_SCRATCH_PREFIX = 'nwf-pe-tier2-batch-';
export const HARNESS_STDERR_TAIL_MAX_CHARS = 2_048;

/** 2D2C-F0Z: nominal period of the parent's own heartbeat (host-stall witness). */
const PARENT_HEARTBEAT_INTERVAL_MS = 1_000;
/** 2D2C-F0Z: nominal period of the parent->child liveness probe. */
const CHILD_PROBE_INTERVAL_MS = 5_000;

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
  /** POSIX graceful: SIGTERM to the child's whole process group (the negated validated PID). */
  signalProcessGroup(pid: number, signal: 'SIGTERM'): GroupSignalResult;
  /** POSIX hard: SIGKILL to that group, settling Darwin's transient zombie-group EPERM (bounded). */
  killProcessGroup(pid: number): Promise<GroupSignalResult>;
  /** Windows: `taskkill /pid <pid> /T /F`, no shell. Must spawn synchronously when called. */
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

/** An EXECUTED hard kill: what was done, and what the operating system answered. */
export interface HardKillRecord {
  readonly method: HardKillMethod;
  /** POSIX: whether the group still existed; Windows: taskkill's exit code. */
  readonly delivered: boolean;
  readonly taskkillExitCode: number | null;
}

/**
 * What happened to the hard stage - closed. `NOT_REQUIRED`: the shutdown was
 * confirmed (or the batch completed). `EXECUTED`: the OS action ran; its
 * `HardKillRecord` says how and whether it was delivered.
 * `SUPPRESSED_EXPIRED_TARGET_IDENTITY`: the hard stage was REQUIRED but the
 * OS action was deliberately NOT taken - nothing was attempted, delivered or
 * cleaned up.
 */
export type HardKillDisposition =
  'NOT_REQUIRED' | 'EXECUTED' | 'SUPPRESSED_EXPIRED_TARGET_IDENTITY';

/** Why a required hard stage was suppressed - closed, one member. */
export type HardKillSuppressionReason = 'DIRECT_CHILD_EXIT_OBSERVED';

export type HardKillAction =
  | { readonly disposition: 'EXECUTED'; readonly record: HardKillRecord }
  | {
      readonly disposition: 'SUPPRESSED_EXPIRED_TARGET_IDENTITY';
      readonly suppressionReason: HardKillSuppressionReason;
    };

export type HardKillStage = { readonly disposition: 'NOT_REQUIRED' } | HardKillAction;

const HARD_KILL_NOT_REQUIRED: HardKillStage = Object.freeze({ disposition: 'NOT_REQUIRED' });
const HARD_KILL_SUPPRESSED_EXPIRED_TARGET: HardKillAction = Object.freeze({
  disposition: 'SUPPRESSED_EXPIRED_TARGET_IDENTITY',
  suppressionReason: 'DIRECT_CHILD_EXIT_OBSERVED',
});

/**
 * The OS-level tree kill: group SIGKILL on POSIX, `taskkill /T /F` on Windows.
 *
 * `directChildExitObserved` is the harness-owned exit state. On Windows it is
 * read IMMEDIATELY before `taskkill` is spawned, with no `await` between the
 * read and the spawn, so no exit event can be processed in between: once the
 * exit has been observed the PID no longer proves identity, and the action
 * is SUPPRESSED rather than aimed at whatever process holds that number now.
 * POSIX ignores it: the group outlives its leader, and a same-group survivor
 * is exactly what the group SIGKILL is for.
 */
export async function hardKillProcessTree(
  platform: TerminationPlatform,
  pid: number,
  ops: TerminationOperations,
  directChildExitObserved: () => boolean,
): Promise<HardKillAction> {
  const target = validateSignalTargetPid(pid);
  if (platform === 'win32') {
    // FINAL PRE-KILL LIVENESS GATE - synchronous with the spawn below.
    if (directChildExitObserved()) return HARD_KILL_SUPPRESSED_EXPIRED_TARGET;
    const outcome = await ops.taskkillTree(target);
    return {
      disposition: 'EXECUTED',
      record: {
        method: 'WINDOWS_TASKKILL_TREE',
        delivered: outcome.exitCode === 0,
        taskkillExitCode: outcome.exitCode,
      },
    };
  }
  return {
    disposition: 'EXECUTED',
    record: {
      method: 'POSIX_PROCESS_GROUP_SIGKILL',
      delivered: (await ops.killProcessGroup(target)) === 'SIGNALLED',
      taskkillExitCode: null,
    },
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
 * What the grace phase observed. Only `SHUTDOWN_CONFIRMED` makes the hard
 * stage unnecessary; an exit alone (`CHILD_EXITED_UNCONFIRMED`) says nothing
 * about what the child left behind, so it is not treated as a completed
 * shutdown - whether or not the OS action can still safely be taken.
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
 * exactly once:
 *
 *   - ACK + exit (either order)             -> confirmed, at the second half;
 *   - exit, no ACK, IPC channel closed      -> CHILD_EXITED_UNCONFIRMED, at
 *     once - no acknowledgement can arrive any more, so waiting out the
 *     grace deadline would only age the target identity (2D2B-R2B);
 *   - otherwise                             -> whatever had been observed
 *     when the grace deadline expires.
 *
 * The channel condition exists because Node does not order an IPC
 * `'message'` before the `'exit'` event: an ACK the child sent before it
 * exited may still be in the pipe, and must be allowed to confirm. Events
 * after the decision cannot rewrite it. The EXIT, however, stays observable
 * after the decision (`exitObserved`): it is what the Windows pre-kill gate
 * reads.
 */
export interface GracePhaseTracker {
  recordAcknowledgement(): void;
  recordExit(): void;
  /** The IPC channel is closed: no acknowledgement can arrive after this. */
  recordChannelClosed(): void;
  expireGrace(): void;
  /** Whether the direct child's exit has been observed - at any time, decision or not. */
  exitObserved(): boolean;
  readonly settled: Promise<GracePhaseDecision>;
}

export function createGracePhaseTracker(): GracePhaseTracker {
  let acknowledged = false;
  let exited = false;
  let channelClosed = false;
  let exitObserved = false;
  let decided = false;
  let resolveSettled!: (decision: GracePhaseDecision) => void;
  const settled = new Promise<GracePhaseDecision>((resolveDecision) => {
    resolveSettled = resolveDecision;
  });
  const settle = (): void => {
    decided = true;
    resolveSettled(decideGracePhase({ acknowledged, exitedWithinGrace: exited }));
  };
  const settleIfTerminal = (): void => {
    if (exited && (acknowledged || channelClosed)) settle();
  };
  return {
    recordAcknowledgement: () => {
      if (decided) return;
      acknowledged = true;
      settleIfTerminal();
    },
    recordExit: () => {
      exitObserved = true;
      if (decided) return;
      exited = true;
      settleIfTerminal();
    },
    recordChannelClosed: () => {
      if (decided) return;
      channelClosed = true;
      settleIfTerminal();
    },
    expireGrace: () => {
      if (!decided) settle();
    },
    exitObserved: () => exitObserved,
    settled,
  };
}

/** Arms the grace deadline: calls `onExpired` once it elapses, and returns its disarm function. */
export type GraceTimerArm = (onExpired: () => void) => () => void;

export interface TerminationSequenceRecord {
  readonly gracefulPhase: GracefulPhaseRecord;
  readonly grace: GracePhaseDecision;
  readonly hardKill: HardKillStage;
}

/**
 * THE termination state machine, shared by `runProcessIsolatedBatch` and the
 * pure contract tests: graceful request -> grace decision -> the OS-level
 * hard stage unless the shutdown was CONFIRMED, gated on target identity
 * (`hardKillProcessTree`). The caller feeds the tracker from its own IPC,
 * channel and exit events; the tracker's exit state is the gate.
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
  if (!grace.hardKillRequired) return { gracefulPhase, grace, hardKill: HARD_KILL_NOT_REQUIRED };
  await input.beforeHardKill?.();
  const hardKill = await hardKillProcessTree(input.platform, input.pid, input.ops, () =>
    input.tracker.exitObserved(),
  );
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
 * A POSIX group SIGKILL that settles Darwin's zombie window: the hard stage
 * and the post-exit sweep both use it. Darwin answers EPERM, not ESRCH, while
 * a group's only remaining members are unreaped zombies - measured at ~3.5 ms
 * right after a group SIGKILL, before launchd reaps them. A sweep that
 * follows a hard kill of an ALREADY-EXITED leader lands in that window every
 * time (2D2B-R2A), and so can a hard kill issued the moment an unacknowledged
 * leader's exit is observed, if a same-group descendant died with it
 * (2D2B-R2B). EPERM is retried for a bounded time; an EPERM that persists
 * past the bound is still thrown.
 */
async function posixKillProcessGroupSettled(pid: number): Promise<GroupSignalResult> {
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

/**
 * The child environment. DEFAULT (every pre-2D2C-F1 caller): the OS
 * passthrough above plus the scratch variable. EXPLICIT (2D2C-F1): the
 * caller's already-filtered environment, used VERBATIM — nothing from
 * `process.env` is added to it — plus the scratch variable, which the
 * harness owns and always sets last so a caller cannot redirect it.
 */
function childEnvironment(
  scratchDir: string,
  explicit: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (explicit !== undefined) {
    for (const [name, value] of Object.entries(explicit)) env[name] = value;
  } else {
    for (const name of CHILD_ENV_PASSTHROUGH) {
      const value = process.env[name];
      if (value !== undefined) env[name] = value;
    }
  }
  env[HARNESS_SCRATCH_DIR_VARIABLE] = scratchDir;
  return env;
}

export type ProcessIsolatedBatchOutcome = 'COMPLETED' | 'TIMED_OUT_KILLED';

/** 2D2C-F0Z: how many parent heartbeats were due versus observed, and the worst gap. */
export interface ParentHeartbeatWitness {
  readonly nominalIntervalMs: number;
  readonly expectedBeats: number;
  readonly observedBeats: number;
  readonly maxGapMs: number;
}

/** 2D2C-F0Z: what the parent saw when it asked the child whether it was still answering. */
export interface ChildProbeWitness {
  readonly nominalIntervalMs: number;
  readonly pingsSent: number;
  readonly pongsReceived: number;
  readonly medianRttMs: number | null;
  readonly maxRttMs: number | null;
  /** Pings outstanding when the child ended. Non-zero means it stopped answering. */
  readonly unanswered: number;
}

/**
 * 2D2C-F0Z: the parent-side liveness witness, recorded for EVERY evaluation.
 *
 * This is the half of the evidence Recovery-1 was missing that a hard-killed
 * child could never have written itself: the parent survives, so it can say
 * when its own timers actually ran, whether the IPC channel was still open
 * when the watchdog fired, and whether the child was answering at all.
 *
 * EVIDENCE, NOT CAUSE. Every field states an observation. None of them names
 * a reason, and nothing in the termination or stop logic reads any of them —
 * C2 (the decision change these fields would support) is deliberately NOT
 * implemented in this slice.
 */
export interface Tier2LivenessWitness {
  readonly watchdogNominalMs: number;
  readonly watchdogArmedAtUtc: string;
  readonly watchdogFiredAtUtc: string | null;
  /** `fired − armed − nominal` on the monotonic clock; null when the watchdog never fired. */
  readonly watchdogOvershootMs: number | null;
  readonly graceNominalMs: number;
  readonly graceArmedAtUtc: string | null;
  /** True only when the grace DEADLINE decided it, false when an early settle did. */
  readonly graceExpiredByDeadline: boolean;
  /**
   * `child.connected` sampled at the instant the watchdog fired. This is the
   * fact that explains an `ipcRequestSent: false`: a child that has finished
   * its work disconnects before exiting, so the request could not be sent.
   */
  readonly ipcConnectedAtWatchdogFire: boolean | null;
  readonly shutdownRequestAttemptedAtUtc: string | null;
  readonly shutdownAckObservedAtUtc: string | null;
  readonly childDisconnectObservedAtUtc: string | null;
  readonly childExitObservedAtUtc: string | null;
  readonly hardKillAttemptedAtUtc: string | null;
  readonly parentHeartbeat: ParentHeartbeatWitness | null;
  readonly childProbe: ChildProbeWitness | null;
}

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
  /**
   * 2D2C-F1: an explicitly filtered child environment, used verbatim in
   * place of the default OS passthrough. The harness adds only its own
   * scratch-directory variable. Absent, the pre-F1 behaviour is unchanged.
   */
  readonly childEnv?: Readonly<Record<string, string>>;
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
  /** LOGICAL: any unconfirmed shutdown requires the hard stage, executable or not. */
  readonly hardKillRequired: boolean;
  /** What happened to the hard stage; `NOT_REQUIRED` exactly when `hardKillRequired` is false. */
  readonly hardKillDisposition: HardKillDisposition;
  /** Non-null exactly when the disposition is `SUPPRESSED_EXPIRED_TARGET_IDENTITY`. */
  readonly hardKillSuppressionReason: HardKillSuppressionReason | null;
  /** The EXECUTED hard stage (method, delivery); null when it was not executed. */
  readonly hardKill: HardKillRecord | null;
  /** POSIX only: the post-exit group sweep's answer. */
  readonly posixGroupSweep: GroupSignalResult | 'NOT_APPLICABLE';
  /**
   * 2D2C-F0Z: the parent-side liveness witness for this evaluation.
   * Observation only. `null` from a launcher double that records none - the
   * real harness always produces one.
   */
  readonly livenessWitness: Tier2LivenessWitness | null;
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

  // ---- 2D2C-F0Z parent-side liveness witness: observation only ----
  // Every field below is written by an observer and read by nobody but the
  // final record. No termination or stop decision consults any of them.
  const utcNow = (): string => new Date().toISOString();
  const witnessArmedMonotonicMs = performance.now();
  const witness: {
    watchdogArmedAtUtc: string;
    watchdogFiredAtUtc: string | null;
    watchdogOvershootMs: number | null;
    graceArmedAtUtc: string | null;
    graceExpiredByDeadline: boolean;
    ipcConnectedAtWatchdogFire: boolean | null;
    shutdownRequestAttemptedAtUtc: string | null;
    shutdownAckObservedAtUtc: string | null;
    childDisconnectObservedAtUtc: string | null;
    childExitObservedAtUtc: string | null;
    hardKillAttemptedAtUtc: string | null;
  } = {
    watchdogArmedAtUtc: utcNow(),
    watchdogFiredAtUtc: null,
    watchdogOvershootMs: null,
    graceArmedAtUtc: null,
    graceExpiredByDeadline: false,
    ipcConnectedAtWatchdogFire: null,
    shutdownRequestAttemptedAtUtc: null,
    shutdownAckObservedAtUtc: null,
    childDisconnectObservedAtUtc: null,
    childExitObservedAtUtc: null,
    hardKillAttemptedAtUtc: null,
  };

  let parentBeats = 0;
  let parentMaxGapMs = 0;
  let lastParentBeatMs = witnessArmedMonotonicMs;
  // `unref()`: a pending beat must never hold the parent open. Cleared in the
  // `finally` below on every path, including the throwing ones.
  const parentHeartbeat = setInterval(() => {
    parentBeats += 1;
    const beatMs = performance.now();
    parentMaxGapMs = Math.max(parentMaxGapMs, beatMs - lastParentBeatMs);
    lastParentBeatMs = beatMs;
  }, PARENT_HEARTBEAT_INTERVAL_MS);
  parentHeartbeat.unref?.();

  const probeSentAt = new Map<number, number>();
  const probeRtts: number[] = [];
  let probeSeq = 0;
  let childProbe: ReturnType<typeof setInterval> | undefined;

  const buildWitness = (): Tier2LivenessWitness => {
    const elapsedMs = Math.max(0, performance.now() - witnessArmedMonotonicMs);
    const sorted = [...probeRtts].sort((a, b) => a - b);
    return Object.freeze({
      watchdogNominalMs: options.watchdogMs,
      watchdogArmedAtUtc: witness.watchdogArmedAtUtc,
      watchdogFiredAtUtc: witness.watchdogFiredAtUtc,
      watchdogOvershootMs: witness.watchdogOvershootMs,
      graceNominalMs: options.graceMs,
      graceArmedAtUtc: witness.graceArmedAtUtc,
      graceExpiredByDeadline: witness.graceExpiredByDeadline,
      ipcConnectedAtWatchdogFire: witness.ipcConnectedAtWatchdogFire,
      shutdownRequestAttemptedAtUtc: witness.shutdownRequestAttemptedAtUtc,
      shutdownAckObservedAtUtc: witness.shutdownAckObservedAtUtc,
      childDisconnectObservedAtUtc: witness.childDisconnectObservedAtUtc,
      childExitObservedAtUtc: witness.childExitObservedAtUtc,
      hardKillAttemptedAtUtc: witness.hardKillAttemptedAtUtc,
      parentHeartbeat: Object.freeze({
        nominalIntervalMs: PARENT_HEARTBEAT_INTERVAL_MS,
        expectedBeats: Math.floor(elapsedMs / PARENT_HEARTBEAT_INTERVAL_MS),
        observedBeats: parentBeats,
        maxGapMs: Math.round(parentMaxGapMs),
      }),
      childProbe: Object.freeze({
        nominalIntervalMs: CHILD_PROBE_INTERVAL_MS,
        pingsSent: probeSeq,
        pongsReceived: probeRtts.length,
        medianRttMs: sorted.length === 0 ? null : Math.round(sorted[sorted.length >> 1]!),
        maxRttMs: sorted.length === 0 ? null : Math.round(sorted[sorted.length - 1]!),
        unanswered: probeSeq - probeRtts.length,
      }),
    });
  };

  try {
    const forked = fork(options.modulePath, [...(options.args ?? [])], {
      cwd: scratchDir,
      env: childEnvironment(scratchDir, options.childEnv),
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
        witness.childExitObservedAtUtc ??= utcNow();
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
    // A closed channel carries no further acknowledgement.
    forked.once('disconnect', () => {
      witness.childDisconnectObservedAtUtc ??= utcNow();
      graceTracker?.recordChannelClosed();
    });

    let stderrTail = '';
    forked.stderr?.setEncoding('utf8');
    forked.stderr?.on('data', (chunk: string) => {
      stderrTail = boundedTail(stderrTail + chunk);
    });
    forked.on('message', (message) => {
      // An acknowledgement is an ANSWER to the request: before the graceful
      // phase there is no tracker, and nothing to acknowledge.
      if (message === SHUTDOWN_ACK_MESSAGE) {
        witness.shutdownAckObservedAtUtc ??= utcNow();
        graceTracker?.recordAcknowledgement();
      }
      // 2D2C-F0Z probe reply. A child that never answers is simply recorded
      // as unanswered; nothing is killed, refused or retried because of it.
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: unknown }).type === LIVENESS_PONG_MESSAGE
      ) {
        const seq = (message as { seq?: unknown }).seq;
        if (typeof seq === 'number') {
          const sentAt = probeSentAt.get(seq);
          if (sentAt !== undefined) {
            probeSentAt.delete(seq);
            probeRtts.push(performance.now() - sentAt);
          }
        }
      }
    });

    if (forked.pid === undefined) {
      throw new Error(`Tier 2 harness: failed to fork ${options.modulePath}.`);
    }
    const pid = validateSignalTargetPid(forked.pid);
    options.onChildSpawned?.(pid, scratchDir);

    const ops: TerminationOperations = {
      sendIpc: (message) => {
        if (message === SHUTDOWN_REQUEST_MESSAGE)
          witness.shutdownRequestAttemptedAtUtc ??= utcNow();
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
      killProcessGroup: (targetPid) => {
        witness.hardKillAttemptedAtUtc ??= utcNow();
        return posixKillProcessGroupSettled(targetPid);
      },
      taskkillTree: (targetPid) => {
        witness.hardKillAttemptedAtUtc ??= utcNow();
        return windowsTaskkillTree(targetPid);
      },
    };

    // 2D2C-F0Z: the parent->child liveness probe. Armed only while the
    // channel is open; every unanswered ping is simply counted.
    childProbe = setInterval(() => {
      if (!forked.connected) return;
      probeSeq += 1;
      probeSentAt.set(probeSeq, performance.now());
      try {
        forked.send({ type: LIVENESS_PING_MESSAGE, seq: probeSeq }, () => {
          // A probe racing the child's exit is not an error worth surfacing.
        });
      } catch {
        // A closed channel simply leaves this ping unanswered.
      }
    }, CHILD_PROBE_INTERVAL_MS);
    childProbe.unref?.();

    const watchdog = timer(options.watchdogMs);
    const first = await Promise.race([
      exited.then((exit) => ({ kind: 'EXIT' as const, exit })),
      watchdog.elapsed.then(() => ({ kind: 'WATCHDOG' as const })),
    ]);
    watchdog.cancel();
    if (first.kind === 'WATCHDOG') {
      witness.watchdogFiredAtUtc = utcNow();
      witness.watchdogOvershootMs = Math.max(
        0,
        Math.round(performance.now() - witnessArmedMonotonicMs - options.watchdogMs),
      );
      // Sampled BEFORE the graceful phase runs: this is the fact that
      // explains an `ipcRequestSent: false` without inferring anything.
      witness.ipcConnectedAtWatchdogFire = forked.connected;
    }

    let outcome: ProcessIsolatedBatchOutcome = 'COMPLETED';
    let exit: ExitInfo;
    let gracefulPhase: GracefulPhaseRecord | null = null;
    let grace: GracePhaseDecision | null = null;
    let hardKill: HardKillStage = HARD_KILL_NOT_REQUIRED;

    if (first.kind === 'EXIT') {
      exit = first.exit;
    } else {
      outcome = 'TIMED_OUT_KILLED';
      const tracker = createGracePhaseTracker();
      graceTracker = tracker;
      if (!forked.connected) tracker.recordChannelClosed();
      if (exitInfo !== undefined) tracker.recordExit();
      const sequence = await runTerminationSequence({
        platform,
        pid,
        ops,
        tracker,
        armGrace: (onExpired) => {
          witness.graceArmedAtUtc = utcNow();
          const handle = setTimeout(() => {
            // Distinguishes a grace decision taken AT THE DEADLINE from one
            // taken early by an exit or an ACK - two situations the landed
            // record collapsed into one CHILD_EXITED_UNCONFIRMED verdict.
            witness.graceExpiredByDeadline = true;
            onExpired();
          }, options.graceMs);
          return () => clearTimeout(handle);
        },
        beforeHardKill: options.beforeHardKill,
      });
      gracefulPhase = sequence.gracefulPhase;
      grace = sequence.grace;
      hardKill = sequence.hardKill;
      // Confirmed or suppressed implies the exit was already observed; after
      // an executed hard stage the exit is awaited, bounded.
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
      platform === 'posix' ? await posixKillProcessGroupSettled(pid) : 'NOT_APPLICABLE';

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
      hardKillDisposition: hardKill.disposition,
      hardKillSuppressionReason:
        hardKill.disposition === 'SUPPRESSED_EXPIRED_TARGET_IDENTITY'
          ? hardKill.suppressionReason
          : null,
      hardKill: hardKill.disposition === 'EXECUTED' ? hardKill.record : null,
      posixGroupSweep,
      livenessWitness: buildWitness(),
      stderrTail,
      scratchDir,
    };
  } finally {
    // 2D2C-F0Z: the witness timers are cleared FIRST and on every path,
    // including the throwing ones. A leaked interval would keep the parent
    // alive past the run it was observing.
    clearInterval(parentHeartbeat);
    if (childProbe !== undefined) clearInterval(childProbe);
    // Emergency path: whatever went wrong above, never leave the tree running
    // - and, as everywhere, never aim taskkill at a PID whose exit was seen.
    if (
      child !== undefined &&
      child.pid !== undefined &&
      child.exitCode === null &&
      child.signalCode === null
    ) {
      try {
        await hardKillProcessTree(
          platform,
          child.pid,
          {
            sendIpc: () => false,
            signalProcessGroup: posixSignalProcessGroup,
            killProcessGroup: posixKillProcessGroupSettled,
            taskkillTree: windowsTaskkillTree,
          },
          () => exitInfo !== undefined,
        );
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

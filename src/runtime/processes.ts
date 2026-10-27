/**
 * WW E-M - THE MAC RUNTIME'S ONE PROCESS SEAM.
 *
 * This is the ONLY file under src/runtime/ that may start a process, and it
 * can start exactly four things, each from a FIXED argument vector built here
 * (never a caller string, never a shell):
 *
 *   1. the Engine's own CLI, `nwf-pe acquisition status | campaign control |
 *      worker`, for ONE campaign - typed invocations, validated below;
 *   2. `docker compose ... ps` for the Engine's Postgres service;
 *   3. `docker compose ... up -d --no-recreate --wait` for that service
 *      (never `down`, never `-v`, never a recreate);
 *   4. the runtime's own supervisor, detached.
 *
 * Every Node child runs this checkout's own source with `--import tsx`, from
 * the repository root, with the environment this process already has. The
 * runtime makes no network call itself: every request to an institution or a
 * provider can only happen inside the worker's own gated stage handlers.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { isAbsolute, normalize } from 'node:path';

import type { CliRun } from './envelope.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Mirrors the worker-id rule of the acquisition vocabulary (a slug naming a PROCESS). */
const WORKER_ID = /^[a-z0-9][a-z0-9_.:-]{2,63}$/;
/** A control reason: short, printable, no control characters. */
const REASON = /^[\p{L}\p{N} .,;:()'_/-]{1,200}$/u;

/**
 * The worker's outbox directory (ADR 0030 s6): absolute, already canonical
 * (no `.`/`..`/`//`, no trailing slash), printable, bounded. The worker
 * re-checks it (exists, a directory, not a symlink) before it writes.
 */
export function isOutboxDirArgument(dir: string): boolean {
  return (
    dir.length > 1 &&
    dir.length <= 1024 &&
    isAbsolute(dir) &&
    normalize(dir) === dir &&
    !dir.endsWith('/') &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/.test(dir)
  );
}

const NODE_FLAGS = ['--import', 'tsx'] as const;
export const ENGINE_CLI_ENTRY = 'src/cli/index.ts';
export const RUNTIME_ENTRY = 'src/runtime/engine.ts';

/** The compose project the Engine's Postgres was created under; pinned so every checkout addresses the SAME container and volume. */
export const COMPOSE_PROJECT = 'nwf-partnership-engine';
export const COMPOSE_SERVICE = 'postgres';
const DOCKER = 'docker';
const COMPOSE_BASE = ['compose', '-p', COMPOSE_PROJECT, '-f', 'docker-compose.yml'] as const;

/** THE COMPOSE ALLOWLIST: these two vectors and nothing else. */
export const COMPOSE_ARGV = Object.freeze({
  ps: Object.freeze([...COMPOSE_BASE, 'ps', '--all', '--format', 'json', COMPOSE_SERVICE]),
  up: Object.freeze([...COMPOSE_BASE, 'up', '-d', '--no-recreate', '--wait', COMPOSE_SERVICE]),
});
export type ComposeOperation = keyof typeof COMPOSE_ARGV;

/** The owner-path control actions the runtime records (never START: that is the OWNER's own act). */
export const RUNTIME_CONTROL_ACTIONS = ['PAUSE', 'RESUME', 'STOP', 'EMERGENCY_STOP'] as const;
export type RuntimeControlAction = (typeof RUNTIME_CONTROL_ACTIONS)[number];

export type AcquisitionInvocation =
  | { readonly kind: 'status'; readonly campaignId: string }
  | {
      readonly kind: 'control';
      readonly campaignId: string;
      readonly action: RuntimeControlAction;
      readonly reason?: string;
    }
  | {
      readonly kind: 'worker';
      readonly campaignId: string;
      readonly workerId: string;
      /** Passed as `--outbox-dir` when the OWNER configured one. */
      readonly outboxDir?: string | null;
    };

export class InvocationRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvocationRefusal';
  }
}

/** The exact `nwf-pe` argument vector for one typed invocation. */
export function acquisitionArgv(inv: AcquisitionInvocation): string[] {
  if (!UUID.test(inv.campaignId))
    throw new InvocationRefusal('campaign id must be a lower-case UUID');
  switch (inv.kind) {
    case 'status':
      return ['acquisition', 'status', '--campaign-id', inv.campaignId, '--json'];
    case 'control': {
      if (!(RUNTIME_CONTROL_ACTIONS as readonly string[]).includes(inv.action)) {
        throw new InvocationRefusal('unknown control action');
      }
      if (inv.reason !== undefined && !REASON.test(inv.reason)) {
        throw new InvocationRefusal('a reason is 1-200 plain characters');
      }
      return [
        'acquisition',
        'campaign',
        'control',
        '--campaign-id',
        inv.campaignId,
        '--action',
        inv.action,
        ...(inv.reason === undefined ? [] : ['--reason', inv.reason]),
        '--execute',
        '--json',
      ];
    }
    case 'worker':
      if (!WORKER_ID.test(inv.workerId)) throw new InvocationRefusal('worker id must be a slug');
      return [
        'acquisition',
        'worker',
        '--campaign-id',
        inv.campaignId,
        '--worker-id',
        inv.workerId,
        ...outboxArgs(inv.outboxDir),
        '--json',
      ];
  }
}

function outboxArgs(outboxDir: string | null | undefined): string[] {
  if (outboxDir === null || outboxDir === undefined) return [];
  if (!isOutboxDirArgument(outboxDir)) {
    throw new InvocationRefusal('the outbox directory must be an absolute, canonical path');
  }
  return ['--outbox-dir', outboxDir];
}

/** The exact runtime argument vector for a detached supervisor. */
export function supervisorArgv(
  campaignId: string,
  allowTestDatabase: boolean,
  outboxDir: string | null = null,
): string[] {
  if (!UUID.test(campaignId)) throw new InvocationRefusal('campaign id must be a lower-case UUID');
  return [
    'supervise',
    '--campaign-id',
    campaignId,
    ...outboxArgs(outboxDir),
    ...(allowTestDatabase ? ['--allow-test-database'] : []),
  ];
}

// ---------------------------------------------------------------------------
// Running them.
// ---------------------------------------------------------------------------

const STDOUT_CAP = 4 * 1024 * 1024;
const STDERR_TAIL = 16 * 1024;

/** A running worker child the supervisor waits on. */
export interface WorkerHandle {
  readonly pid: number | null;
  readonly done: Promise<CliRun>;
  /** graceful: SIGTERM (the worker finishes its current item); kill: SIGKILL. */
  terminate(mode: 'graceful' | 'kill'): void;
}

export interface ProcessPort {
  acquisition(inv: AcquisitionInvocation): Promise<CliRun>;
  launchWorker(
    campaignId: string,
    workerId: string,
    onStderr: (line: string) => void,
    outboxDir?: string | null,
  ): WorkerHandle;
  compose(op: ComposeOperation): Promise<CliRun>;
  /** Starts a detached supervisor; its output goes to `outFile`. Returns its pid. */
  spawnSupervisor(
    campaignId: string,
    allowTestDatabase: boolean,
    outFile: string,
    outboxDir?: string | null,
  ): number | null;
}

function collect(child: ChildProcess, onStderr?: (line: string) => void): Promise<CliRun> {
  let stdout = '';
  let stderr = '';
  let pending = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    if (stdout.length < STDOUT_CAP) stdout += chunk.slice(0, STDOUT_CAP - stdout.length);
  });
  child.stderr?.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_TAIL);
    if (onStderr !== undefined) {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) if (line.trim().length > 0) onStderr(line);
    }
  });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exitCode: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      if (onStderr !== undefined && pending.trim().length > 0) onStderr(pending);
      resolve({ exitCode, signal, stdout, stderrTail: stderr });
    };
    child.on('error', (error) => {
      stderr = `${stderr}\n${error.message}`.slice(-STDERR_TAIL);
      finish(null, null);
    });
    child.on('close', (code, signal) => finish(code, signal));
  });
}

export function createProcessPort(repoRoot: string): ProcessPort {
  const node = (script: string, args: readonly string[]): ChildProcess =>
    spawn(process.execPath, [...NODE_FLAGS, script, ...args], {
      cwd: repoRoot,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  return {
    acquisition: (inv) => collect(node(ENGINE_CLI_ENTRY, acquisitionArgv(inv))),
    launchWorker(campaignId, workerId, onStderr, outboxDir = null) {
      const child = node(
        ENGINE_CLI_ENTRY,
        acquisitionArgv({ kind: 'worker', campaignId, workerId, outboxDir }),
      );
      return {
        pid: child.pid ?? null,
        done: collect(child, onStderr),
        terminate(mode) {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill(mode === 'kill' ? 'SIGKILL' : 'SIGTERM');
          }
        },
      };
    },
    compose: (op) =>
      collect(
        spawn(DOCKER, [...COMPOSE_ARGV[op]], {
          cwd: repoRoot,
          env: process.env,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      ),
    spawnSupervisor(campaignId, allowTestDatabase, outFile, outboxDir = null) {
      const fd = openSync(outFile, 'a', 0o600);
      try {
        const child = spawn(
          process.execPath,
          [
            ...NODE_FLAGS,
            RUNTIME_ENTRY,
            ...supervisorArgv(campaignId, allowTestDatabase, outboxDir),
          ],
          {
            cwd: repoRoot,
            env: process.env,
            shell: false,
            detached: true,
            stdio: ['ignore', fd, fd],
          },
        );
        child.unref();
        return child.pid ?? null;
      } finally {
        closeSync(fd);
      }
    },
  };
}

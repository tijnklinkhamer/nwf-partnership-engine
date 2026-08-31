/**
 * THE AUTH-STATUS RUNNER SEAM — the ONLY production module in this
 * repository permitted to import `node:child_process` (ADR 0010 §13;
 * pinned by `phase2b.firewall.test.ts`).
 *
 * It executes exactly ONE fixed, request-free command — the Claude CLI's
 * own `claude auth status --json` — under the sanitized child environment
 * and the dedicated classifier profile, and captures its output for the
 * pure evaluator (`authStatus.ts`). The command reports LOCAL credential
 * state only; it performs no inference and no login.
 *
 * WHAT THIS MODULE CAN NEVER RUN, by construction: the command and
 * argument vector are module constants (`AUTH_STATUS_COMMAND`,
 * `AUTH_STATUS_ARGS`) — no caller-supplied string ever reaches the spawn,
 * so no `setup-token` invocation, no `/login` automation and no arbitrary
 * command execution is expressible through this seam. The firewall asserts
 * the exact argument vector.
 *
 * The environment REPLACES the subprocess environment entirely (never a
 * parent spread), exactly as the SDK invocation's does — so the check and
 * the inference see the SAME credential world (ADR 0010 §13: same
 * sanitized environment, same dedicated CLAUDE_CONFIG_DIR).
 *
 * Like the Agent SDK runner seam, the production runner is constructed
 * explicitly by production wiring only; every automated test injects a
 * fake and CI never spawns the CLI.
 */
import { execFile } from 'node:child_process';
import type { AuthStatusExecution } from './authStatus.js';

export const AUTH_STATUS_COMMAND = 'claude';
export const AUTH_STATUS_ARGS: readonly string[] = ['auth', 'status', '--json'];
/** Generous bound for a local, request-free status read. */
export const AUTH_STATUS_TIMEOUT_MS = 60_000;

export interface AuthStatusInvocation {
  /** The complete subprocess environment (the sanitized child env). REPLACES, never merges. */
  readonly env: Readonly<Record<string, string>>;
  /** An existing directory to run in (the per-invocation scratch cwd). */
  readonly cwd: string;
}

/** The injectable seam. Production: `createProductionAuthStatusRunner()`. Tests: a fake. */
export interface ClassifierAuthStatusRunner {
  run(invocation: AuthStatusInvocation): Promise<AuthStatusExecution>;
}

/**
 * The production runner: one fixed CLI execution per `run()`. A process
 * that RAN resolves with its exit code and stdout, even on a non-zero
 * exit — the pure evaluator judges the report. A process that could not
 * run at all (spawn failure, timeout) rejects; the provider maps that to
 * an auth failure without echoing any output.
 */
export function createProductionAuthStatusRunner(): ClassifierAuthStatusRunner {
  return {
    run(invocation: AuthStatusInvocation): Promise<AuthStatusExecution> {
      return new Promise<AuthStatusExecution>((resolvePromise, rejectPromise) => {
        execFile(
          AUTH_STATUS_COMMAND,
          [...AUTH_STATUS_ARGS],
          {
            env: { ...invocation.env },
            cwd: invocation.cwd,
            timeout: AUTH_STATUS_TIMEOUT_MS,
            windowsHide: true,
            // Windows npm installs expose the CLI as a .cmd shim, which only a
            // shell can start. The command and args are module constants, so
            // no untrusted text can reach the shell line.
            shell: process.platform === 'win32',
          },
          (error, stdout) => {
            if (error === null) {
              resolvePromise({ exitCode: 0, stdout });
              return;
            }
            // A numeric code means the CLI ran and exited non-zero: still a
            // report for the evaluator. Anything else (ENOENT, kill by
            // timeout) means no trustworthy report exists.
            if (typeof error.code === 'number' && error.killed !== true) {
              resolvePromise({ exitCode: error.code, stdout });
              return;
            }
            rejectPromise(
              new Error(
                `auth-status execution failed before producing a report ` +
                  `(${error.killed === true ? 'timed out' : String(error.code ?? 'spawn failure')}).`,
              ),
            );
          },
        );
      });
    },
  };
}

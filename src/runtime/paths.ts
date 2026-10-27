/**
 * WW E-M - WHERE THE MAC RUNTIME KEEPS ITS OWN FILES.
 *
 * Everything the runtime writes lives in two per-user directories, both
 * created with mode 0700 and neither ever system-level:
 *
 *   ~/Library/Application Support/nwf-engine/   lock, pidfile, state, config
 *   ~/Library/Logs/nwf-engine/                   size-rotated logs
 *
 * plus, ONLY when the OWNER passes `install-agent --i-understand --execute`,
 * one user LaunchAgent plist under ~/Library/LaunchAgents/. No file here holds
 * a secret, a key, a connection string or research evidence: research
 * evidence lives only in the database, and these files describe the PROCESS.
 * Deleting them deletes no data.
 */
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAUNCH_AGENT_LABEL = 'nl.newwavefluent.nwf-engine';

export interface EnginePaths {
  /** The Engine checkout the runtime belongs to (cwd of every child process). */
  readonly repoRoot: string;
  readonly stateDir: string;
  readonly logDir: string;
  /** Exclusive-create lock: at most one supervisor per Mac user. */
  readonly lockFile: string;
  /** The supervisor's pid, for humans and scripts. */
  readonly pidFile: string;
  /** The supervisor's last reported phase (`nwf-engine.supervisor-state.v1`). */
  readonly stateFile: string;
  /** The remembered campaign id (`nwf-engine.config.v1`). */
  readonly configFile: string;
  readonly logFile: string;
  /** Where a detached supervisor's own stdout/stderr go (crash traces). */
  readonly supervisorOutFile: string;
  readonly launchAgentFile: string;
}

/** The checkout this module was loaded from (src/runtime/ -> repo root). */
export function engineRepoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function macEnginePaths(home: string, repoRoot: string = engineRepoRoot()): EnginePaths {
  return enginePathsUnder(
    join(home, 'Library', 'Application Support', 'nwf-engine'),
    join(home, 'Library', 'Logs', 'nwf-engine'),
    join(home, 'Library', 'LaunchAgents'),
    repoRoot,
  );
}

/** The same layout under explicit directories (tests use temporary ones). */
export function enginePathsUnder(
  stateDir: string,
  logDir: string,
  launchAgentDir: string,
  repoRoot: string = engineRepoRoot(),
): EnginePaths {
  return {
    repoRoot,
    stateDir,
    logDir,
    lockFile: join(stateDir, 'supervisor.lock'),
    pidFile: join(stateDir, 'supervisor.pid'),
    stateFile: join(stateDir, 'supervisor-state.json'),
    configFile: join(stateDir, 'config.json'),
    logFile: join(logDir, 'engine.log'),
    supervisorOutFile: join(logDir, 'supervisor-output.log'),
    launchAgentFile: join(launchAgentDir, `${LAUNCH_AGENT_LABEL}.plist`),
  };
}

/** Creates `dir` if absent and forces mode 0700 (mkdir's mode is subject to umask). */
export function ensurePrivateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
}

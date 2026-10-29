/**
 * PHASE 2B-2D2C-F7 — PRODUCTION HOST OBSERVATION FOR THE HOST-AWAKE GATE.
 *
 * Captures, read-only, exactly the observations the frozen host-awake
 * preflight consumes (`f6/hostAwakePreflightF6.ts`):
 *
 *   - this process's lineage: `process.pid`, then each parent pid read with
 *     `/bin/ps -o ppid= -p <pid>`, nearest first (caffeinate asserts on behalf
 *     of the wrapped utility, which may be this process or an ancestor);
 *   - the three frozen read-only commands `/usr/bin/pmset -g batt`,
 *     `/usr/bin/pmset -g assertions` and
 *     `/usr/sbin/ioreg -r -k AppleClamshellState -d 4`.
 *
 * Every command is a fixed argument vector with no shell. None needs
 * privilege, none writes a power setting, and a command that fails yields
 * `null` — which the preflight records as unreadable rather than guessing. On a
 * non-darwin platform no command runs at all.
 */
import { execFileSync } from 'node:child_process';
import {
  F6_HOST_OBSERVATION_COMMANDS,
  type HostAwakeObservations,
} from '../f6/hostAwakePreflightF6.js';

const PS = '/bin/ps';
const MAX_LINEAGE_DEPTH = 32;

function readOnly(command: readonly string[]): string | null {
  const [file, ...args] = command;
  try {
    return execFileSync(file!, args, {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function processLineage(): number[] {
  const lineage = [process.pid];
  let pid = process.pid;
  for (let depth = 0; depth < MAX_LINEAGE_DEPTH; depth += 1) {
    const parent = Number((readOnly([PS, '-o', 'ppid=', '-p', String(pid)]) ?? '').trim());
    if (!Number.isInteger(parent) || parent <= 1 || lineage.includes(parent)) break;
    lineage.push(parent);
    pid = parent;
  }
  return lineage;
}

export function observeHostForF7(): HostAwakeObservations {
  const darwin = process.platform === 'darwin';
  return {
    platform: process.platform,
    observedAtUtc: new Date().toISOString(),
    processLineagePids: darwin ? processLineage() : [process.pid],
    pmsetBattStdout: darwin ? readOnly(F6_HOST_OBSERVATION_COMMANDS.powerSource) : null,
    pmsetAssertionsStdout: darwin ? readOnly(F6_HOST_OBSERVATION_COMMANDS.assertions) : null,
    ioregClamshellStdout: darwin ? readOnly(F6_HOST_OBSERVATION_COMMANDS.clamshell) : null,
  };
}

/**
 * Deliberately dependency-free.
 *
 * Phase 1A ships a CLI whose primary output is human-readable, and whose durable
 * run record is the `ingest_runs` table - not a log stream. A structured logging
 * library would add a dependency without adding diagnostic value here. Revisit
 * if a long-running worker is ever introduced.
 *
 * All diagnostics go to stderr so stdout stays clean for command output.
 */
import { isVerbose } from '../config/env.js';

export function info(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`WARN  ${message}\n`);
}

export function error(message: string): void {
  process.stderr.write(`ERROR ${message}\n`);
}

export function debug(message: string): void {
  if (isVerbose()) process.stderr.write(`DEBUG ${message}\n`);
}

#!/usr/bin/env node
/**
 * nwf-engine - THE OWNER'S CONTROL SURFACE FOR THE NWF ENGINE ON A MAC
 * (WW E-M; OWNER directive 2026-10-27 s5 "start it and let it work").
 *
 *   npm run engine -- <command>        or        scripts/nwf-engine <command>
 *
 * Wires the production ports and dispatches. Every behaviour lives in
 * commands.ts; see the runbook docs/operations/NWF_ENGINE_MAC_OWNER_RUNBOOK_V1.md.
 */
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../config/env.js';
import { createPool } from '../db/client.js';
import { pinnedCampaignKeys } from './campaignTrust.js';
import { classifierProfileFacts } from './classifierProfile.js';
import { realRuntimeClock } from './clock.js';
import { runEngine, type EngineDeps } from './commands.js';
import {
  buildMigrationsOf,
  createDoctorDbProbes,
  dirWritable,
  diskFreeBytesAt,
  pathFactsOf,
  runbooksOf,
} from './doctor.js';
import { processIsAlive } from './lock.js';
import { macEnginePaths } from './paths.js';
import { createProcessPort, inheritedEnvironment, scrubPostgresVariables } from './processes.js';
import { RUNTIME_DATABASE_VARIABLES, type RuntimeDatabaseUrls } from './targets.js';

export function productionEngineDeps(): EngineDeps {
  const paths = macEnginePaths(homedir());
  const e = env();
  // Every connection string the wired worker and the review command use
  // (names from targets.ts; values only ever reach the checks, never output).
  const urls: RuntimeDatabaseUrls = Object.fromEntries(
    RUNTIME_DATABASE_VARIABLES.flatMap((name) => {
      const value = e[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
  const procs = createProcessPort(paths.repoRoot);
  const db = createDoctorDbProbes(createPool);
  return {
    paths,
    urls,
    procs,
    clock: realRuntimeClock,
    pid: process.pid,
    nodePath: process.execPath,
    isAlive: processIsAlive,
    signal(pid, sig) {
      try {
        process.kill(pid, sig);
        return true;
      } catch {
        return false;
      }
    },
    onSignals(handlers) {
      const entries = Object.entries(handlers) as [NodeJS.Signals, () => void][];
      for (const [sig, fn] of entries) process.on(sig, fn);
      return () => {
        for (const [sig, fn] of entries) process.removeListener(sig, fn);
      };
    },
    doctor: ({ allowTestDatabase, outboxDir, reviewKeyFile }) => ({
      nodeVersion: process.version,
      urls,
      allowTestDatabase,
      outboxDir,
      reviewKeyFile,
      uid: typeof process.getuid === 'function' ? process.getuid() : null,
      pathFacts: pathFactsOf,
      // The environment the worker child would get (PG* removed).
      classifierProfile: () => classifierProfileFacts(inheritedEnvironment(), paths.repoRoot),
      composePs: () => procs.compose('ps'),
      readLedger: db.readLedger,
      readWorkerLogin: db.readWorkerLogin,
      buildMigrations: () => buildMigrationsOf(paths.repoRoot),
      runbooks: () => runbooksOf(paths.repoRoot),
      pinnedKeys: pinnedCampaignKeys,
      diskFreeBytes: () => diskFreeBytesAt(paths.stateDir),
      logDirWritable: () => dirWritable(paths.logDir),
    }),
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  // First: no PG* default may fill in a connection detail behind the URLs,
  // in this process or (via childEnvironment) any child it starts.
  scrubPostgresVariables();
  runEngine(process.argv.slice(2), productionEngineDeps()).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(
        `nwf-engine failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
}

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
import { realRuntimeClock } from './clock.js';
import { runEngine, type EngineDeps } from './commands.js';
import {
  buildMigrationsOf,
  createDoctorDbProbes,
  dirWritable,
  diskFreeBytesAt,
  runbooksOf,
} from './doctor.js';
import { processIsAlive } from './lock.js';
import { macEnginePaths } from './paths.js';
import { createProcessPort } from './processes.js';

export function productionEngineDeps(): EngineDeps {
  const paths = macEnginePaths(homedir());
  const e = env();
  const urls = {
    ...(e.DATABASE_URL_ADMIN !== undefined ? { DATABASE_URL_ADMIN: e.DATABASE_URL_ADMIN } : {}),
    ...(e.DATABASE_URL_READONLY !== undefined
      ? { DATABASE_URL_READONLY: e.DATABASE_URL_READONLY }
      : {}),
    ...(e.DATABASE_URL_ACQUISITION_WORKER !== undefined
      ? { DATABASE_URL_ACQUISITION_WORKER: e.DATABASE_URL_ACQUISITION_WORKER }
      : {}),
  };
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
    doctor: (allowTestDatabase) => ({
      nodeVersion: process.version,
      urls,
      allowTestDatabase,
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

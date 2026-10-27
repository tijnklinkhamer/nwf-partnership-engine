/**
 * WW E-M - WHICH DATABASE THE MAC RUNTIME MAY TARGET.
 *
 * The runtime never connects anywhere on its own say-so: the connection
 * strings come from the environment the OWNER configured (.env), exactly as
 * every `nwf-pe` command reads them. Before anything is started or read, the
 * runtime checks them and REFUSES, in plain language:
 *
 *   - a host that is not loopback (127.0.0.1, localhost, ::1): this runtime
 *     operates the local Docker database on this Mac and nothing else;
 *   - a database whose name ends in `_test`, unless `--allow-test-database`
 *     (integration tests only): a test database is truncated by test runs;
 *   - connection strings that name DIFFERENT databases: the owner path, the
 *     read-only path and the worker path must all be the same database, or
 *     a pause recorded in one would never reach a worker running in another.
 *
 * Only variable NAMES are ever printed, never values (they carry passwords).
 *
 * PURE: no socket, no filesystem, no environment read (the caller passes the
 * values in).
 */
import { isTestDatabaseName } from '../db/safety.js';

/** The three connection strings the runtime's work runs on. */
export const RUNTIME_DATABASE_VARIABLES = [
  'DATABASE_URL_ADMIN',
  'DATABASE_URL_READONLY',
  'DATABASE_URL_ACQUISITION_WORKER',
] as const;
export type RuntimeDatabaseVariable = (typeof RUNTIME_DATABASE_VARIABLES)[number];

/** What each variable is for, in the OWNER's words. */
export const VARIABLE_PURPOSE: Readonly<Record<RuntimeDatabaseVariable, string>> = {
  DATABASE_URL_ADMIN: 'owner path: reads the migration ledger, records pause/resume/stop events',
  DATABASE_URL_READONLY: 'read-only path: campaign status',
  DATABASE_URL_ACQUISITION_WORKER: 'the worker login granted nwf_acquisition_worker',
};

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export type RuntimeDatabaseUrls = Readonly<Partial<Record<RuntimeDatabaseVariable, string>>>;

export interface TargetCheck {
  readonly ok: boolean;
  /** Variables that are set (names only). */
  readonly present: readonly RuntimeDatabaseVariable[];
  readonly missing: readonly RuntimeDatabaseVariable[];
  /** Plain-language refusals; empty when ok. */
  readonly refusals: readonly string[];
  /** host:port/database the runtime will operate, when it is unambiguous. */
  readonly target: string | null;
  readonly isTestDatabase: boolean;
}

export interface TargetOptions {
  readonly allowTestDatabase?: boolean;
  /** Variables that must be present for the command at hand. */
  readonly required?: readonly RuntimeDatabaseVariable[];
}

export function checkDatabaseTargets(
  urls: RuntimeDatabaseUrls,
  options: TargetOptions = {},
): TargetCheck {
  const required = options.required ?? RUNTIME_DATABASE_VARIABLES;
  const present = RUNTIME_DATABASE_VARIABLES.filter((v) => (urls[v] ?? '').length > 0);
  const missing = required.filter((v) => !present.includes(v));
  const refusals: string[] = [];
  for (const v of missing) {
    refusals.push(`${v} is not set (${VARIABLE_PURPOSE[v]}). Add it to .env; see the runbook.`);
  }
  const targets = new Set<string>();
  let isTest = false;
  for (const v of present) {
    let parsed: URL;
    try {
      parsed = new URL(urls[v]!);
    } catch {
      refusals.push(`${v} is not a parseable connection string.`);
      continue;
    }
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
      refusals.push(
        `${v} points at host "${parsed.hostname}", which is not this Mac. The NWF Engine ` +
          'runtime only operates the local database (127.0.0.1); it refuses any other host.',
      );
      continue;
    }
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (isTestDatabaseName(database)) {
      isTest = true;
      if (options.allowTestDatabase !== true) {
        refusals.push(
          `${v} names the test database "${database}". Test databases are truncated by test ` +
            'runs; the runtime refuses them unless --allow-test-database is given (tests only).',
        );
      }
    }
    targets.add(`${parsed.hostname}:${parsed.port || '5432'}/${database}`);
  }
  if (targets.size > 1) {
    refusals.push(
      `The database variables name ${targets.size} different databases. The owner path, the ` +
        'read-only path and the worker must all use the same database.',
    );
  }
  return {
    ok: refusals.length === 0,
    present,
    missing,
    refusals,
    target: targets.size === 1 ? [...targets][0]! : null,
    isTestDatabase: isTest,
  };
}

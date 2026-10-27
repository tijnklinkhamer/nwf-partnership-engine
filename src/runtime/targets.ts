/**
 * WW E-M - WHICH DATABASE THE MAC RUNTIME MAY TARGET (hardened by WW H-RT).
 *
 * The runtime never connects anywhere on its own say-so: the connection
 * strings come from the environment the OWNER configured (.env), exactly as
 * every `nwf-pe` command reads them. Before anything is started or read, the
 * runtime checks EVERY connection string the wired worker and the OWNER's
 * review command use, and REFUSES, in plain language:
 *
 *   - a value that is not a plain `postgres://user@host:port/database` URL:
 *     a `socket:` URL, a socket path, a libpq `key=value` string, ANY query
 *     string (`?host=`, `?hostaddr=`, `?port=`, `?options=`, `?sslrootcert=`
 *     ... can each redirect or reconfigure the connection behind the visible
 *     host), a fragment, whitespace or control characters;
 *   - a missing user, port or database: pg fills a missing one from PG*
 *     environment variables (PGPORT, PGDATABASE, ...), which the runtime
 *     never trusts - its children run with every PG* variable removed;
 *   - a host that is not loopback (127.0.0.1, localhost, ::1): this runtime
 *     operates the local Docker database on this Mac and nothing else;
 *   - a database whose name ends in `_test`, unless `--allow-test-database`
 *     (integration tests only): a test database is truncated by test runs;
 *   - connection strings that name DIFFERENT databases (host, port and
 *     database): the owner path, the read-only path, the worker and its
 *     stage handlers must all be the same database, or a pause recorded in
 *     one would never reach a worker running in another.
 *
 * The URL is read twice and both readings must agree: once by the WHATWG URL
 * parser and once by `pg-connection-string`, the very parser `pg` itself uses
 * to turn the string into a connection (it is pg's own dependency, the same
 * installed copy; it is not a dependency of this repository). The query
 * string is refused BEFORE pg's parser runs, so it never reads a file named
 * by an `ssl*` parameter.
 *
 * Only variable NAMES (and a non-loopback host name) are ever printed, never
 * values (they carry passwords).
 *
 * PURE: no socket, no filesystem, no environment read (the caller passes the
 * values in).
 */
import { parse as parsePgConnectionString } from 'pg-connection-string';

import { isTestDatabaseName } from '../db/safety.js';

/**
 * The connection strings the wired worker uses (ADR 0030: one pool per
 * capability role, `acquisitionWiring/production.ts`) plus the owner path.
 * `start`, the supervisor and `doctor` require every one of them.
 */
export const WORKER_DATABASE_VARIABLES = [
  'DATABASE_URL_ADMIN',
  'DATABASE_URL_READONLY',
  'DATABASE_URL_ACQUISITION_WORKER',
  'DATABASE_URL_SOURCE_DISCOVERY',
  'DATABASE_URL_DISCOVERY_SUBJECT_WRITER',
  'DATABASE_URL_RESEARCH',
] as const;

/**
 * Every connection string the runtime checks: the worker's, plus the
 * reviewer login the OWNER's own `acquisition review sign --execute` uses.
 * The reviewer is checked whenever it is set, but not required: the runtime
 * never runs a review.
 */
export const RUNTIME_DATABASE_VARIABLES = [
  ...WORKER_DATABASE_VARIABLES,
  'DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER',
] as const;
export type RuntimeDatabaseVariable = (typeof RUNTIME_DATABASE_VARIABLES)[number];

/** What each variable is for, in the OWNER's words. */
export const VARIABLE_PURPOSE: Readonly<Record<RuntimeDatabaseVariable, string>> = {
  DATABASE_URL_ADMIN: 'owner path: reads the migration ledger, records pause/resume/stop events',
  DATABASE_URL_READONLY: 'read-only path: campaign status, and the stage handlers read through it',
  DATABASE_URL_ACQUISITION_WORKER: 'the worker login granted nwf_acquisition_worker',
  DATABASE_URL_SOURCE_DISCOVERY: 'the search stage and research link-outs (nwf_source_discovery)',
  DATABASE_URL_DISCOVERY_SUBJECT_WRITER: 'the proposal stage (nwf_discovery_subject_writer)',
  DATABASE_URL_RESEARCH: 'the research stage (nwf_research)',
  DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER:
    'your `acquisition review sign --execute` (nwf_discovery_subject_reviewer)',
};

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** The query parameters that redirect or reconfigure a pg connection, named in refusals. */
const CONNECTION_OVERRIDE_PARAMETERS = ['host', 'hostaddr', 'port', 'options', 'dbname', 'user'];

export type RuntimeDatabaseUrls = Readonly<Partial<Record<RuntimeDatabaseVariable, string>>>;

export type ConnectionTarget =
  | {
      readonly ok: true;
      readonly host: string;
      readonly port: number;
      readonly database: string;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Reads one connection string strictly. The reason never contains the value
 * (only, for a non-loopback host, the host name).
 */
export function parseConnectionTarget(value: string): ConnectionTarget {
  const refuse = (reason: string): ConnectionTarget => ({ ok: false, reason });
  if (!/^postgres(?:ql)?:\/\//.test(value)) {
    return refuse(
      'is not a postgres:// URL (a socket: URL, a socket path or a key=value string is refused)',
    );
  }
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(value)) {
    return refuse('contains whitespace or a control character');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return refuse('is not a parseable connection string');
  }
  if (value.includes('?') || url.search !== '') {
    const named = [...url.searchParams.keys()].filter((k) =>
      CONNECTION_OVERRIDE_PARAMETERS.includes(k.toLowerCase()),
    );
    return refuse(
      'carries a query string' +
        (named.length > 0 ? ` (${[...new Set(named)].join(', ')})` : '') +
        '; parameters can redirect or reconfigure the connection, so none is accepted',
    );
  }
  if (value.includes('#') || url.hash !== '') return refuse('carries a fragment');

  let pgView: ReturnType<typeof parsePgConnectionString>;
  try {
    pgView = parsePgConnectionString(value);
  } catch {
    return refuse('is not a connection string pg can read');
  }
  const host = pgView.host ?? '';
  const portText = pgView.port ?? '';
  const database = pgView.database ?? '';
  const user = pgView.user ?? '';
  if (host.length === 0) return refuse('names no host');
  if (host !== url.hostname) return refuse('names a host pg reads differently (an encoded host)');
  if (!LOOPBACK_HOSTS.has(host)) {
    return refuse(
      `points at host "${host}", which is not this Mac. The NWF Engine runtime only operates ` +
        'the local database (127.0.0.1); it refuses any other host',
    );
  }
  if (!/^[0-9]{1,5}$/.test(portText) || portText !== url.port) {
    return refuse('names no explicit port (pg would take one from PGPORT or a default)');
  }
  const port = Number(portText);
  if (port < 1 || port > 65_535) return refuse('names a port outside 1-65535');
  if (database.length === 0 || database.includes('/')) {
    return refuse('names no database (pg would take one from PGDATABASE or the user name)');
  }
  if (user.length === 0) return refuse('names no user (pg would take one from PGUSER)');
  return { ok: true, host, port, database };
}

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
  /** Variables that must be present for the command at hand (default: the worker's). */
  readonly required?: readonly RuntimeDatabaseVariable[];
}

export function checkDatabaseTargets(
  urls: RuntimeDatabaseUrls,
  options: TargetOptions = {},
): TargetCheck {
  const required = options.required ?? WORKER_DATABASE_VARIABLES;
  const present = RUNTIME_DATABASE_VARIABLES.filter((v) => (urls[v] ?? '').length > 0);
  const missing = required.filter((v) => !present.includes(v));
  const refusals: string[] = [];
  for (const v of missing) {
    refusals.push(`${v} is not set (${VARIABLE_PURPOSE[v]}). Add it to .env; see the runbook.`);
  }
  const targets = new Set<string>();
  let isTest = false;
  for (const v of present) {
    const parsed = parseConnectionTarget(urls[v]!);
    if (!parsed.ok) {
      refusals.push(`${v} ${parsed.reason}.`);
      continue;
    }
    if (isTestDatabaseName(parsed.database)) {
      isTest = true;
      if (options.allowTestDatabase !== true) {
        refusals.push(
          `${v} names the test database "${parsed.database}". Test databases are truncated by test ` +
            'runs; the runtime refuses them unless --allow-test-database is given (tests only).',
        );
      }
    }
    targets.add(`${parsed.host}:${parsed.port}/${parsed.database}`);
  }
  if (targets.size > 1) {
    refusals.push(
      `The database variables name ${targets.size} different databases. The owner path, the ` +
        'read-only path, the worker and its stage handlers must all use the same database ' +
        '(the same host, port and database name).',
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

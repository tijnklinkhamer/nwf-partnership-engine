/**
 * Guards for destructive database operations.
 *
 * Phase 1A has exactly two destructive code paths - `truncateAll` in the
 * integration-test helpers and `reset` in the migration runner - and both are
 * one misconfigured environment variable away from destroying the working
 * database. Neither may rely on documentation or on the caller passing the right
 * pool: each asserts its own precondition here.
 *
 * These are pure and independently testable so the invariant is executable
 * rather than aspirational.
 */
import type pg from 'pg';

/** Integration tests may only ever target a database whose name ends in this. */
export const TEST_DATABASE_SUFFIX = '_test';

/** Hosts a destructive local-only command may target. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export class UnsafeDatabaseTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeDatabaseTargetError';
  }
}

/** Database name from a connection string, or '' when it carries none. */
export function databaseNameFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeDatabaseTargetError(
      'Refusing to run a destructive operation against an unparseable connection string.',
    );
  }
  return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
}

export function isTestDatabaseName(name: string): boolean {
  return name.length > TEST_DATABASE_SUFFIX.length && name.endsWith(TEST_DATABASE_SUFFIX);
}

/**
 * Asserts a connection string points at an integration-test database.
 * Integration tests TRUNCATE, so anything else is refused loudly.
 */
export function assertTestDatabaseUrl(url: string): string {
  const database = databaseNameFromUrl(url);
  if (!isTestDatabaseName(database)) {
    throw new UnsafeDatabaseTargetError(
      `Refusing to run integration tests against database "${database}": the name must ` +
        `end in "${TEST_DATABASE_SUFFIX}". Integration tests truncate tables, so pointing ` +
        `them at the working database would destroy ingested data. ` +
        `Check DATABASE_URL_*_TEST in your .env.`,
    );
  }
  return url;
}

/**
 * Asserts a connection string points at a loopback host.
 * `db:reset` drops the schema, so it is restricted to the local Docker database.
 */
export function assertLocalDatabaseUrl(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new UnsafeDatabaseTargetError('Refusing to reset an unparseable connection string.');
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new UnsafeDatabaseTargetError(
      `Refusing to reset the schema of a non-local database (host "${host}"). ` +
        `db:reset drops and recreates the public schema and is local-development only.`,
    );
  }
  return url;
}

/**
 * Asserts the database a pool is actually connected to is a test database.
 *
 * The URL check above can be bypassed by handing a destructive helper a pool
 * built elsewhere; this one cannot, because it asks the server.
 */
export async function assertTestDatabaseConnection(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ db: string }>('SELECT current_database() AS db');
  const database = rows[0]?.db ?? '';
  if (!isTestDatabaseName(database)) {
    throw new UnsafeDatabaseTargetError(
      `Refusing to truncate database "${database}": the name must end in ` +
        `"${TEST_DATABASE_SUFFIX}". This pool is connected to a non-test database.`,
    );
  }
}

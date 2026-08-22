import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { testDatabaseUrl, type Role } from '../../config/env.js';
import { assertTestDatabaseConnection, assertTestDatabaseUrl } from '../../db/safety.js';
import type { ResolvedSource } from '../../ingest/eche/source.js';

export const FIXTURE_PATH = resolve(process.cwd(), 'src/test/fixtures/eche-sample.xlsx');

/** True when the separate integration-test database is configured. */
export function databaseConfigured(): boolean {
  return Boolean(testDatabaseUrl('admin') && testDatabaseUrl('ingest'));
}

function pool(role: Role): pg.Pool {
  const url = testDatabaseUrl(role);
  if (!url) throw new Error(`No test database URL configured for role "${role}".`);
  return new pg.Pool({ connectionString: assertTestDatabaseUrl(url), max: 4 });
}

export function fixtureSource(bytes?: Buffer): ResolvedSource {
  const data = bytes ?? readFileSync(FIXTURE_PATH);
  return {
    kind: 'operator_file',
    pageUrl: null,
    fileUrl: null,
    filePath: FIXTURE_PATH,
    bytes: data,
    sha256: createHash('sha256').update(data).digest('hex'),
    contentType: null,
    retrievedAt: new Date('2026-08-21T00:00:00.000Z'),
  };
}

/**
 * Removes all ingested data while leaving the schema and grants in place.
 *
 * Asks the server which database it is connected to before truncating, so the
 * guarantee does not depend on the caller having used `pool()` above.
 */
export async function truncateAll(target: pg.Pool): Promise<void> {
  await assertTestDatabaseConnection(target);
  await target.query('TRUNCATE organisation_sources, organisations, ingest_runs CASCADE');
}

export function adminPool(): pg.Pool {
  return pool('admin');
}

export function ingestPool(): pg.Pool {
  return pool('ingest');
}

export function readonlyPool(): pg.Pool {
  return pool('readonly');
}

export async function count(target: pg.Pool, table: string): Promise<number> {
  const { rows } = await target.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
  return Number.parseInt(rows[0]?.n ?? '0', 10);
}

/**
 * Proves the truncate guard fires against a live server, not just against a URL.
 *
 * The pool used here is built directly (bypassing the helpers' URL check) and
 * points at the `postgres` maintenance database on the same local server. If the
 * guard regressed, `truncateAll` would still not damage anything - that database
 * holds no Phase 1A tables - so this test is safe to run even when it fails.
 */
import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { testDatabaseUrl } from '../../config/env.js';
import { UnsafeDatabaseTargetError } from '../../db/safety.js';
import { adminPool, databaseConfigured, truncateAll } from './helpers.js';

const describeDb = databaseConfigured() ? describe : describe.skip;

/** The same server and credentials, pointed at a NON-test database. */
function nonTestPool(): pg.Pool {
  const url = new URL(testDatabaseUrl('admin') as string);
  url.pathname = '/postgres';
  return new pg.Pool({ connectionString: url.toString(), max: 1 });
}

describeDb('destructive-operation guard (integration)', () => {
  const pools: pg.Pool[] = [];

  afterAll(async () => {
    await Promise.all(pools.map((p) => p.end()));
  });

  it('truncateAll refuses a pool connected to a non-test database', async () => {
    const pool = nonTestPool();
    pools.push(pool);

    await expect(truncateAll(pool)).rejects.toThrow(UnsafeDatabaseTargetError);
    await expect(truncateAll(pool)).rejects.toThrow(/must end in "_test"/);
  });

  it('truncateAll is permitted against the integration-test database', async () => {
    const pool = adminPool();
    pools.push(pool);

    await expect(truncateAll(pool)).resolves.toBeUndefined();
  });

  it('every configured test connection string names a *_test database', () => {
    for (const role of ['admin', 'ingest', 'readonly'] as const) {
      const url = testDatabaseUrl(role);
      if (url === undefined) continue;
      expect(new URL(url).pathname, role).toMatch(/_test$/);
    }
  });
});

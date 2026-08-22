import pg from 'pg';
import { databaseUrl, type Role } from '../config/env.js';

/**
 * Postgres returns BIGINT/NUMERIC as strings by default to avoid precision loss.
 * COUNT(*) is the only place Phase 1A relies on that, and it is parsed explicitly
 * at each call site rather than by mutating global type parsers.
 */
export function createPool(role: Role): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl(role), max: 4 });
}

export async function withPool<T>(role: Role, fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const pool = createPool(role);
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

/** Runs `fn` inside a transaction, rolling back on any throw. */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

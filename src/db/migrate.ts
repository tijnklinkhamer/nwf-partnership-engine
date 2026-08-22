/**
 * Forward-only plain-SQL migration runner.
 *
 * Migrations are the source of truth for the schema. Each file runs exactly once,
 * inside a transaction, and is recorded in `schema_migrations` with a checksum so
 * that editing an applied migration is detected rather than silently ignored.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { withTransaction } from './client.js';
import { assertLocalDatabaseUrl, UnsafeDatabaseTargetError } from './safety.js';
import { databaseUrl, testDatabaseUrl } from '../config/env.js';
import * as log from '../logging/log.js';

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text        PRIMARY KEY,
      checksum    text        NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

/**
 * Number of ingested organisations, or 0 when the table does not exist yet.
 * Used to decide whether a reset would destroy real work.
 */
async function ingestedRowCount(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ n: string | null }>(
    `SELECT (SELECT count(*) FROM organisations)::text AS n
      WHERE to_regclass('public.organisations') IS NOT NULL`,
  );
  return Number.parseInt(rows[0]?.n ?? '0', 10);
}

/**
 * Drops and recreates the public schema. LOCAL DEVELOPMENT ONLY.
 *
 * Two gates, both enforced in code rather than in documentation:
 *   - `main()` refuses any non-loopback connection string, with no override.
 *   - a database that already holds ingested organisations requires an explicit
 *     `--force`, because dropping the schema destroys them and the source file
 *     that produced them may no longer be retrievable.
 */
export async function reset(pool: pg.Pool, force = false): Promise<void> {
  const existing = await ingestedRowCount(pool);
  if (existing > 0 && !force) {
    throw new UnsafeDatabaseTargetError(
      `Refusing to reset: this database already holds ${existing} organisation(s), ` +
        `and dropping the schema would destroy them along with their provenance. ` +
        `Re-run with --force if that is genuinely what you want.`,
    );
  }
  await withTransaction(pool, async (client) => {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
  });
  log.info(`Schema reset (public dropped and recreated; ${existing} organisation(s) discarded).`);
}

export async function migrate(pool: pg.Pool): Promise<{ applied: string[]; skipped: string[] }> {
  const applied: string[] = [];
  const skipped: string[] = [];

  await withTransaction(pool, (client) => ensureMigrationsTable(client));

  const { rows } = await pool.query<{ version: string; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations',
  );
  const existing = new Map(rows.map((r) => [r.version, r.checksum]));

  for (const file of migrationFiles()) {
    const version = file.slice(0, 4);
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    const sum = checksum(sql);
    const prior = existing.get(version);

    if (prior !== undefined) {
      if (prior !== sum) {
        throw new Error(
          `Migration ${file} has changed after being applied (checksum mismatch). ` +
            `Migrations are forward-only: add a new migration instead of editing this one.`,
        );
      }
      skipped.push(file);
      continue;
    }

    await withTransaction(pool, async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
        version,
        sum,
      ]);
    });
    log.info(`Applied ${file}`);
    applied.push(file);
  }

  return { applied, skipped };
}

async function main(): Promise<void> {
  const shouldReset = process.argv.includes('--reset');
  const force = process.argv.includes('--force');
  // --test migrates the separate integration-test database.
  const useTestDatabase = process.argv.includes('--test');

  const url = useTestDatabase ? testDatabaseUrl('admin') : databaseUrl('admin');
  if (!url) throw new Error('DATABASE_URL_ADMIN_TEST is not set.');

  // --reset drops the public schema, so refuse anything but the local Docker
  // database - and refuse it before a connection is even opened.
  if (shouldReset) assertLocalDatabaseUrl(url);

  const pool = new pg.Pool({ connectionString: url, max: 4 });
  try {
    if (shouldReset) await reset(pool, force);
    const { applied, skipped } = await migrate(pool);
    log.info(`Migrations complete: ${applied.length} applied, ${skipped.length} already present.`);
  } finally {
    await pool.end();
  }
}

// Only run when executed directly, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err: unknown) => {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

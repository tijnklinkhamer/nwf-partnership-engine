/**
 * Proves the least-privilege grant boundaries are real, not merely intended.
 *
 * These are the constraints that make "evidence is never overwritten" a database
 * guarantee rather than a code convention.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { ingestEche } from '../../ingest/eche/ingest.js';
import {
  adminPool,
  databaseConfigured,
  fixtureSource,
  ingestPool,
  readonlyPool,
  truncateAll,
} from './helpers.js';

const describeDb = databaseConfigured() ? describe : describe.skip;

/** Postgres insufficient_privilege. */
const INSUFFICIENT_PRIVILEGE = '42501';

async function expectDenied(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    expect((err as { code?: string }).code).toBe(INSUFFICIENT_PRIVILEGE);
    return;
  }
  throw new Error('Expected the statement to be denied, but it succeeded.');
}

// Data is seeded once in beforeAll; these tests only probe privileges.
describeDb('database grants (integration)', () => {
  let admin: pg.Pool;
  let ingest: pg.Pool;
  let readonly: pg.Pool;

  beforeAll(async () => {
    admin = adminPool();
    ingest = ingestPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    await ingestEche(ingest, fixtureSource());
  });

  afterAll(async () => {
    await Promise.all([admin.end(), ingest.end(), readonly.end()]);
  });

  describe('nwf_ingest', () => {
    it('may SELECT and INSERT organisation_sources', async () => {
      await expect(
        ingest.query('SELECT count(*) FROM organisation_sources'),
      ).resolves.toBeDefined();
    });

    it('may NOT UPDATE organisation_sources (evidence is append-only)', async () => {
      await expectDenied(() =>
        ingest.query("UPDATE organisation_sources SET source_url = 'tampered'"),
      );
    });

    it('may NOT DELETE organisation_sources (evidence is append-only)', async () => {
      await expectDenied(() => ingest.query('DELETE FROM organisation_sources'));
    });

    it('may UPDATE organisations (required for deterministic upsert)', async () => {
      await expect(
        ingest.query('UPDATE organisations SET city = city WHERE false'),
      ).resolves.toBeDefined();
    });

    it('may NOT DELETE organisations', async () => {
      await expectDenied(() => ingest.query('DELETE FROM organisations'));
    });

    it('may UPDATE ingest_runs (a run is created before it finishes)', async () => {
      await expect(
        ingest.query('UPDATE ingest_runs SET rows_read = rows_read WHERE false'),
      ).resolves.toBeDefined();
    });

    it('may NOT DELETE ingest_runs', async () => {
      await expectDenied(() => ingest.query('DELETE FROM ingest_runs'));
    });
  });

  describe('nwf_readonly', () => {
    it('may SELECT every Phase 1A table', async () => {
      await expect(readonly.query('SELECT count(*) FROM organisations')).resolves.toBeDefined();
      await expect(
        readonly.query('SELECT count(*) FROM organisation_sources'),
      ).resolves.toBeDefined();
      await expect(readonly.query('SELECT count(*) FROM ingest_runs')).resolves.toBeDefined();
    });

    it('may NOT INSERT', async () => {
      await expectDenied(() =>
        readonly.query(
          `INSERT INTO organisations (eche_row_key, legal_name, display_name, country_code, erasmus_code)
           VALUES ('x|1', 'X', 'X', 'FR', 'X 1')`,
        ),
      );
    });

    it('may NOT UPDATE', async () => {
      await expectDenied(() => readonly.query('UPDATE organisations SET city = NULL'));
    });

    it('may NOT DELETE', async () => {
      await expectDenied(() => readonly.query('DELETE FROM organisations'));
    });
  });

  describe('schema-level privileges', () => {
    it('does not grant either role the ability to create tables', async () => {
      await expectDenied(() => ingest.query('CREATE TABLE illegal_table (id int)'));
      await expectDenied(() => readonly.query('CREATE TABLE illegal_table (id int)'));
    });
  });

  // Migration 0006. PostgreSQL grants CONNECT *and* TEMPORARY to PUBLIC when a
  // database is created; migration 0002 revoked only CONNECT, so both roles
  // inherited TEMPORARY and could run CREATE TEMP TABLE despite holding no
  // schema CREATE and no write grant anywhere.
  //
  // These assertions inspect the privilege rather than attempting a
  // CREATE TEMP TABLE. A failed attempt would prove the same thing, but a
  // SUCCEEDING one would leave a real temporary table in the test session, and
  // the point of the migration is that the privilege is absent - so the
  // privilege is what gets asserted.
  describe('database-level TEMPORARY privilege', () => {
    async function hasTemporary(pool: pg.Pool, role: string): Promise<boolean> {
      const { rows } = await pool.query<{ granted: boolean }>(
        'SELECT has_database_privilege($1, current_database(), $2) AS granted',
        [role, 'TEMPORARY'],
      );
      return rows[0]!.granted;
    }

    it('is not held by PUBLIC', async () => {
      // Checked against the ACL directly: has_database_privilege() resolves a
      // NAMED role, and PUBLIC is not one. An empty grantee (oid 0) in datacl
      // IS PUBLIC, which is exactly the `=T/nwf_owner` entry this migration
      // removes.
      const { rows } = await admin.query<{ public_has_temp: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM pg_database d, aclexplode(d.datacl) a
           WHERE d.datname = current_database()
             AND a.grantee = 0
             AND a.privilege_type = 'TEMPORARY'
         ) AS public_has_temp`,
      );
      expect(rows[0]!.public_has_temp).toBe(false);
    });

    it('is not held by nwf_readonly', async () => {
      expect(await hasTemporary(admin, 'nwf_readonly')).toBe(false);
    });

    it('is not held by nwf_ingest', async () => {
      expect(await hasTemporary(admin, 'nwf_ingest')).toBe(false);
    });

    it('is still held by the owner, through its own explicit grant', async () => {
      // Revoking from PUBLIC must not disturb the owner's `nwf_owner=CTc`
      // entry. If this ever fails, the revoke hit the wrong grantee.
      expect(await hasTemporary(admin, 'nwf_owner')).toBe(true);
    });

    it('leaves CONNECT and schema USAGE intact for both roles', async () => {
      // The revoke targets one privilege on one object. Everything the roles
      // legitimately need to reach this database must survive it - otherwise
      // every other test in this file would be passing for the wrong reason.
      for (const role of ['nwf_ingest', 'nwf_readonly']) {
        const { rows } = await admin.query<{ connect: boolean; usage: boolean }>(
          `SELECT has_database_privilege($1, current_database(), 'CONNECT') AS connect,
                  has_schema_privilege($1, 'public', 'USAGE')                AS usage`,
          [role],
        );
        expect(rows[0]!.connect, `${role} lost CONNECT`).toBe(true);
        expect(rows[0]!.usage, `${role} lost schema USAGE`).toBe(true);
      }
    });
  });
});

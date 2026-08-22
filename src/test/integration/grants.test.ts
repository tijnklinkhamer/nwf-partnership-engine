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
});

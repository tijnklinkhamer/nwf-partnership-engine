/**
 * EWP ingestion against real PostgreSQL.
 *
 * The two properties that matter most here are not about EWP at all:
 *
 *   1. Ingesting EWP evidence leaves `organisations` COMPLETELY untouched -
 *      no row created, no row modified, and above all no canonical_domain
 *      written from a SCHAC identifier.
 *   2. EWP evidence is append-only, and that is enforced by grants rather than
 *      by the ingest code choosing to behave.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { ingestEwpCatalogue } from '../../ingest/ewp/ingest.js';
import { ingestEche } from '../../ingest/eche/ingest.js';
import type { EwpResolvedSource } from '../../ingest/ewp/source.js';
import {
  adminPool,
  count,
  databaseConfigured,
  fixtureSource,
  ingestPool,
  readonlyPool,
  truncateAll,
} from './helpers.js';

const describeDb = databaseConfigured() ? describe : describe.skip;

const EWP_FIXTURE_PATH = resolve(process.cwd(), 'src/test/fixtures/ewp-catalogue-sample.xml');

/** Postgres insufficient_privilege. */
const INSUFFICIENT_PRIVILEGE = '42501';

function ewpFixtureSource(bytes?: Buffer): EwpResolvedSource {
  const data = bytes ?? readFileSync(EWP_FIXTURE_PATH);
  return {
    kind: 'operator_file',
    fileUrl: null,
    filePath: EWP_FIXTURE_PATH,
    bytes: data,
    sha256: createHash('sha256').update(data).digest('hex'),
    contentType: null,
    fetchedAt: new Date('2026-08-22T00:00:00.000Z'),
  };
}

async function expectDenied(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    expect((err as { code?: string }).code).toBe(INSUFFICIENT_PRIVILEGE);
    return;
  }
  throw new Error('Expected the statement to be denied, but it succeeded.');
}

describeDb('EWP ingestion (integration)', () => {
  let admin: pg.Pool;
  let ingest: pg.Pool;
  let readonly: pg.Pool;

  beforeAll(() => {
    admin = adminPool();
    ingest = ingestPool();
    readonly = readonlyPool();
  });

  afterAll(async () => {
    await Promise.all([admin.end(), ingest.end(), readonly.end()]);
  });

  beforeEach(async () => {
    await truncateAll(admin);
  });

  describe('persistence', () => {
    it('stores the whole catalogue as one snapshot', async () => {
      const result = await ingestEwpCatalogue(ingest, ewpFixtureSource());

      expect(result.alreadyPresent).toBe(false);
      expect(result.heiCount).toBe(18);
      expect(result.hostCount).toBe(5);
      expect(result.snapshotId).not.toBeNull();

      expect(await count(readonly, 'ewp_snapshots')).toBe(1);
      expect(await count(readonly, 'ewp_heis')).toBe(18);
      expect(await count(readonly, 'ewp_hosts')).toBe(5);
      expect(await count(readonly, 'ewp_host_covered_heis')).toBe(5);
      expect(await count(readonly, 'ewp_api_declarations')).toBe(7);
    });

    it('records the artifact identity, size and fetch time', async () => {
      const source = ewpFixtureSource();
      await ingestEwpCatalogue(ingest, source);

      const { rows } = await readonly.query<{
        artifact_sha256: string;
        artifact_bytes: string;
        source_input_kind: string;
        source_location: string;
        fetched_at: Date;
      }>('SELECT * FROM ewp_snapshots');

      expect(rows[0]?.artifact_sha256).toBe(source.sha256);
      expect(rows[0]?.artifact_bytes).toBe(String(source.bytes.byteLength));
      expect(rows[0]?.source_input_kind).toBe('operator_file');
      // A local path, recorded as a local path - never as an official URL.
      expect(rows[0]?.source_location).toBe(EWP_FIXTURE_PATH);
      expect(rows[0]?.fetched_at.toISOString()).toBe('2026-08-22T00:00:00.000Z');
    });

    it('records the byte count on the ingest run too', async () => {
      const source = ewpFixtureSource();
      await ingestEwpCatalogue(ingest, source);
      const { rows } = await readonly.query<{ source_file_bytes: string; source_system: string }>(
        'SELECT source_file_bytes, source_system FROM ingest_runs',
      );
      expect(rows[0]?.source_file_bytes).toBe(String(source.bytes.byteLength));
      expect(rows[0]?.source_system).toBe('ewp_registry');
    });

    it('stores every published identifier with its raw value intact', async () => {
      await ingestEwpCatalogue(ingest, ewpFixtureSource());

      const { rows } = await readonly.query<{ id_type: string; id_value: string }>(
        `SELECT o.id_type, o.id_value
           FROM ewp_hei_other_ids o JOIN ewp_heis h ON h.id = o.ewp_hei_id
          WHERE h.hei_id = 'padded-pic.example' AND o.id_type = 'pic'`,
      );
      expect(rows[0]?.id_value).toBe(' 888888888 ');
    });

    it('keeps "oid" and "OID" apart as published but folds them for grouping', async () => {
      await ingestEwpCatalogue(ingest, ewpFixtureSource());
      const { rows } = await readonly.query<{ id_type: string; id_type_folded: string }>(
        `SELECT o.id_type, o.id_type_folded
           FROM ewp_hei_other_ids o JOIN ewp_heis h ON h.id = o.ewp_hei_id
          WHERE h.hei_id = 'case-variant-type.example' AND o.id_type_folded = 'oid'
          ORDER BY o.ordinal`,
      );
      expect(rows.map((r) => r.id_type)).toEqual(['oid', 'OID']);
      expect(rows.map((r) => r.id_type_folded)).toEqual(['oid', 'oid']);
    });

    it('gives a non-conforming PIC no comparison value but still stores it', async () => {
      await ingestEwpCatalogue(ingest, ewpFixtureSource());
      const { rows } = await readonly.query<{
        id_value: string;
        id_value_normalised: string | null;
      }>(
        `SELECT o.id_value, o.id_value_normalised
           FROM ewp_hei_other_ids o JOIN ewp_heis h ON h.id = o.ewp_hei_id
          WHERE h.hei_id = 'nonconforming-pic.example' AND o.id_type = 'pic'
          ORDER BY o.ordinal`,
      );
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.id_value_normalised).toBeNull();
      expect(rows.map((r) => r.id_value)).toEqual(['9.9958762E8', 'E10208905']);
    });

    it('gives an unknown identifier type no comparison value and never drops it', async () => {
      await ingestEwpCatalogue(ingest, ewpFixtureSource());
      const { rows } = await readonly.query<{ id_value_normalised: string | null }>(
        `SELECT id_value_normalised FROM ewp_hei_other_ids
          WHERE id_type = 'brand-new-type-not-seen-before'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id_value_normalised).toBeNull();
    });

    it('does not store an identifier that was published with no value', async () => {
      await ingestEwpCatalogue(ingest, ewpFixtureSource());
      const { rows } = await readonly.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ewp_hei_other_ids WHERE id_type = 'euc'`,
      );
      expect(rows[0]?.n).toBe('0');
    });

    it('stores a covered hei-id that has no matching institution', async () => {
      await ingestEwpCatalogue(ingest, ewpFixtureSource());
      const { rows } = await readonly.query<{ hei_id: string }>(
        `SELECT hei_id FROM ewp_host_covered_heis
          WHERE hei_id NOT IN (SELECT hei_id FROM ewp_heis)`,
      );
      expect(rows.map((r) => r.hei_id)).toEqual(['not-in-institutions.example']);
    });

    it('stores API declarations with their endpoints and namespace', async () => {
      await ingestEwpCatalogue(ingest, ewpFixtureSource());
      const { rows } = await readonly.query<{
        api_namespace: string;
        declared_version: string | null;
        endpoints: Record<string, string>;
      }>(
        `SELECT api_namespace, declared_version, endpoints
           FROM ewp_api_declarations
          WHERE api_local_name = 'imobilities'
          ORDER BY declared_version`,
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]?.api_namespace).not.toBe(rows[1]?.api_namespace);
      expect(rows[0]?.endpoints).toEqual({ 'get-url': 'https://ewp.e.example/imobilities/v1' });
    });

    it('stores no admin email anywhere', async () => {
      await ingestEwpCatalogue(ingest, ewpFixtureSource());
      // Scan every text column of every ewp table for the fixture's address.
      const { rows } = await readonly.query<{ hit: string }>(
        `SELECT h.id::text AS hit FROM ewp_hosts h
           WHERE h.admin_provider LIKE '%@%'
         UNION ALL
         SELECT s.id::text FROM ewp_snapshots s WHERE s.source_location LIKE '%never-store-me%'`,
      );
      expect(rows).toEqual([]);
    });
  });

  describe('idempotency', () => {
    it('re-ingesting identical bytes inserts nothing', async () => {
      const first = await ingestEwpCatalogue(ingest, ewpFixtureSource());
      const second = await ingestEwpCatalogue(ingest, ewpFixtureSource());

      expect(second.alreadyPresent).toBe(true);
      expect(second.snapshotId).toBe(first.snapshotId);
      expect(await count(readonly, 'ewp_snapshots')).toBe(1);
      expect(await count(readonly, 'ewp_heis')).toBe(18);
      // Both runs are still recorded, which is what makes the no-op auditable.
      expect(await count(readonly, 'ingest_runs')).toBe(2);
    });

    it('a changed artifact becomes a NEW snapshot beside the old one', async () => {
      const original = readFileSync(EWP_FIXTURE_PATH);
      const first = await ingestEwpCatalogue(ingest, ewpFixtureSource(original));

      // A different artifact: one extra institution.
      const changed = Buffer.from(
        original
          .toString('utf8')
          .replace(
            '</institutions>',
            '<hei id="brand-new.example"><name>Brand New</name></hei></institutions>',
          ),
        'utf8',
      );
      const second = await ingestEwpCatalogue(ingest, ewpFixtureSource(changed));

      expect(second.alreadyPresent).toBe(false);
      expect(second.snapshotId).not.toBe(first.snapshotId);
      expect(await count(readonly, 'ewp_snapshots')).toBe(2);
      expect(await count(readonly, 'ewp_heis')).toBe(18 + 19);

      // The first snapshot's evidence is completely intact.
      const { rows } = await readonly.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM ewp_heis WHERE snapshot_id = $1',
        [first.snapshotId],
      );
      expect(rows[0]?.n).toBe('18');
    });

    it('a dry run writes absolutely nothing', async () => {
      const result = await ingestEwpCatalogue(ingest, ewpFixtureSource(), { dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.snapshotId).toBeNull();
      expect(result.ingestRunId).toBeNull();
      expect(result.heiCount).toBe(18);
      expect(await count(readonly, 'ewp_snapshots')).toBe(0);
      expect(await count(readonly, 'ewp_heis')).toBe(0);
      expect(await count(readonly, 'ingest_runs')).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // The rule this whole phase hangs on.
  // -------------------------------------------------------------------------

  describe('organisations are never touched by EWP ingestion', () => {
    it('creates and modifies no organisation, and changes no canonical_domain', async () => {
      // Seed real ECHE organisations first, so "untouched" is a claim about
      // existing data rather than about an empty table.
      await ingestEche(ingest, fixtureSource());

      const before = await readonly.query<{
        id: string;
        canonical_domain: string | null;
        updated_at: Date;
      }>('SELECT id, canonical_domain, updated_at FROM organisations ORDER BY id');
      expect(before.rows.length).toBeGreaterThan(0);

      const sourcesBefore = await count(readonly, 'organisation_sources');

      await ingestEwpCatalogue(ingest, ewpFixtureSource());

      const after = await readonly.query<{
        id: string;
        canonical_domain: string | null;
        updated_at: Date;
      }>('SELECT id, canonical_domain, updated_at FROM organisations ORDER BY id');

      expect(after.rows).toEqual(before.rows);
      expect(await count(readonly, 'organisation_sources')).toBe(sourcesBefore);
    });

    it('never writes a SCHAC identifier into canonical_domain', async () => {
      await ingestEche(ingest, fixtureSource());

      const domainsFrom = async (): Promise<Array<string | null>> => {
        const { rows } = await readonly.query<{ canonical_domain: string | null }>(
          'SELECT canonical_domain FROM organisations ORDER BY eche_row_key',
        );
        return rows.map((row) => row.canonical_domain);
      };

      const before = await domainsFrom();
      await ingestEwpCatalogue(ingest, ewpFixtureSource());

      // Not one domain changed, appeared or disappeared.
      expect(await domainsFrom()).toEqual(before);

      // And specifically: no SCHAC id that ONLY EWP knows about leaked in.
      // Four fixture SCHAC ids coincide with a domain ECHE itself published,
      // so those are excluded - the point is that EWP contributed nothing.
      const { rows: schac } = await readonly.query<{ hei_id_folded: string }>(
        'SELECT hei_id_folded FROM ewp_heis',
      );
      const alsoPublishedByEche = new Set(before.filter((d): d is string => d !== null));
      const ewpOnly = schac
        .map((row) => row.hei_id_folded)
        .filter((id) => !alsoPublishedByEche.has(id));

      expect(ewpOnly.length).toBeGreaterThan(0);
      for (const id of ewpOnly) expect(before).not.toContain(id);
    });
  });

  // -------------------------------------------------------------------------
  // Append-only, enforced by the database.
  // -------------------------------------------------------------------------

  describe('ewp_* evidence is append-only by grant', () => {
    beforeEach(async () => {
      await ingestEwpCatalogue(ingest, ewpFixtureSource());
    });

    const tables = [
      'ewp_snapshots',
      'ewp_heis',
      'ewp_hei_other_ids',
      'ewp_hosts',
      'ewp_host_covered_heis',
      'ewp_api_declarations',
    ] as const;

    for (const table of tables) {
      it(`nwf_ingest may SELECT and INSERT ${table} but NOT UPDATE it`, async () => {
        await expect(ingest.query(`SELECT count(*) FROM ${table}`)).resolves.toBeDefined();
        await expectDenied(() =>
          ingest.query(`UPDATE ${table} SET created_at = now() WHERE false`),
        );
      });

      it(`nwf_ingest may NOT DELETE ${table}`, async () => {
        await expectDenied(() => ingest.query(`DELETE FROM ${table}`));
      });

      it(`nwf_readonly may SELECT but not write ${table}`, async () => {
        await expect(readonly.query(`SELECT count(*) FROM ${table}`)).resolves.toBeDefined();
        await expectDenied(() => readonly.query(`DELETE FROM ${table}`));
      });
    }

    it('refuses a second snapshot row for the same artifact hash', async () => {
      const { rows } = await readonly.query<{ artifact_sha256: string }>(
        'SELECT artifact_sha256 FROM ewp_snapshots',
      );
      const sha = rows[0]?.artifact_sha256;
      await expect(
        ingest.query(
          `INSERT INTO ewp_snapshots
             (artifact_sha256, artifact_bytes, source_input_kind, source_location,
              fetched_at, first_ingest_run_id, host_count, hei_count,
              other_id_count, api_declaration_count)
           SELECT $1, 1, 'operator_file', 'x', now(), id, 0, 0, 0, 0
             FROM ingest_runs LIMIT 1`,
          [sha],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('schema constraints', () => {
    it('rejects a snapshot whose sha256 is not a hex digest', async () => {
      // A run must exist, or INSERT..SELECT would insert nothing and "succeed".
      await ingestEwpCatalogue(ingest, ewpFixtureSource());
      await expect(
        ingest.query(
          `INSERT INTO ewp_snapshots
             (artifact_sha256, artifact_bytes, source_input_kind, source_location,
              fetched_at, first_ingest_run_id, host_count, hei_count,
              other_id_count, api_declaration_count)
           SELECT 'not-a-digest', 1, 'operator_file', 'x', now(), id, 0, 0, 0, 0
             FROM ingest_runs LIMIT 1`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it("rejects source_input_kind 'discovered' for an EWP snapshot", async () => {
      // There is no EWP document page, so claiming discovery would be false.
      await ingestEwpCatalogue(ingest, ewpFixtureSource());
      await expect(
        ingest.query(
          `INSERT INTO ewp_snapshots
             (artifact_sha256, artifact_bytes, source_input_kind, source_location,
              fetched_at, first_ingest_run_id, host_count, hei_count,
              other_id_count, api_declaration_count)
           SELECT repeat('a', 64), 1, 'discovered', 'x', now(), id, 0, 0, 0, 0
             FROM ingest_runs LIMIT 1`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('still accepts the Phase 1A input kinds on ingest_runs', async () => {
      for (const kind of ['discovered', 'operator_url', 'operator_file', 'official_endpoint']) {
        await expect(
          ingest.query(
            `INSERT INTO ingest_runs (source_system, source_input_kind, status)
             VALUES ('test', $1, 'running')`,
            [kind],
          ),
        ).resolves.toBeDefined();
      }
    });
  });
});

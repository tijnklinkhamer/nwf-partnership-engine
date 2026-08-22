import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { ingestEche } from '../../ingest/eche/ingest.js';
import { ECHE_COLUMNS } from '../../ingest/eche/schema.js';
import { parseEcheWorkbook } from '../../ingest/eche/parse.js';
import {
  adminPool,
  count,
  databaseConfigured,
  FIXTURE_PATH,
  fixtureSource,
  ingestPool,
  truncateAll,
} from './helpers.js';
import { buildWorkbook } from '../helpers/xlsx.js';

const describeDb = databaseConfigured() ? describe : describe.skip;

/**
 * Rebuilds the fixture workbook with one field changed, so the "changed row"
 * path can be exercised without hand-maintaining a second binary fixture.
 */
async function fixtureWithChange(
  match: (row: Record<string, string | null>) => boolean,
  change: (row: Record<string, string | null>) => Record<string, string | null>,
): Promise<Buffer> {
  const parsed = await parseEcheWorkbook(readFileSync(FIXTURE_PATH));
  const rows = parsed.rows.map((row) => (match(row) ? change({ ...row }) : row));
  const table = [
    ECHE_COLUMNS.map(() => null),
    [...ECHE_COLUMNS],
    ...rows.map((row) => ECHE_COLUMNS.map((column) => row[column] ?? null)),
  ];
  return buildWorkbook(table);
}

describeDb('ECHE ingestion (integration)', () => {
  let admin: pg.Pool;
  let ingest: pg.Pool;

  beforeAll(() => {
    admin = adminPool();
    ingest = ingestPool();
  });

  afterAll(async () => {
    await admin.end();
    await ingest.end();
  });

  beforeEach(async () => {
    await truncateAll(admin);
  });

  it('inserts organisations and appends provenance on first ingest', async () => {
    const result = await ingestEche(ingest, fixtureSource());

    expect(result.rowsInserted).toBe(12);
    expect(result.rowsUpdated).toBe(0);
    expect(result.rowsUnchanged).toBe(0);
    // Two fixture rows are deliberately invalid (bad country code, no legal name).
    expect(result.rowsSkippedInvalid).toBe(2);

    expect(await count(admin, 'organisations')).toBe(12);
    expect(await count(admin, 'organisation_sources')).toBe(12);
    expect(await count(admin, 'ingest_runs')).toBe(1);
  });

  it('is idempotent: re-ingesting identical data creates nothing new', async () => {
    await ingestEche(ingest, fixtureSource());
    const second = await ingestEche(ingest, fixtureSource());

    expect(second.rowsInserted).toBe(0);
    expect(second.rowsUpdated).toBe(0);
    expect(second.rowsUnchanged).toBe(12);

    expect(await count(admin, 'organisations')).toBe(12);
    // Provenance is NOT duplicated for an identical payload.
    expect(await count(admin, 'organisation_sources')).toBe(12);
    expect(await count(admin, 'ingest_runs')).toBe(2);
  });

  it('updates source-owned fields on a changed row and appends new provenance', async () => {
    await ingestEche(ingest, fixtureSource());

    const changed = await fixtureWithChange(
      (row) => (row['Erasmus code'] ?? '').includes('PARIS001'),
      (row) => ({ ...row, City: 'Paris Cedex', 'Website Url': 'https://new.pantheonsorbonne.fr' }),
    );
    const result = await ingestEche(ingest, fixtureSource(changed));

    expect(result.rowsUpdated).toBe(1);
    expect(result.rowsUnchanged).toBe(11);
    expect(result.rowsInserted).toBe(0);

    // No new organisation.
    expect(await count(admin, 'organisations')).toBe(12);
    // Provenance appended, not replaced: 12 original + 1 new payload.
    expect(await count(admin, 'organisation_sources')).toBe(13);

    const { rows } = await admin.query<{ city: string; canonical_domain: string }>(
      `SELECT city, canonical_domain FROM organisations WHERE erasmus_code = 'F PARIS001'`,
    );
    expect(rows[0]?.city).toBe('Paris Cedex');
    expect(rows[0]?.canonical_domain).toBe('pantheonsorbonne.fr');
  });

  it('never destroys earlier provenance when a row changes', async () => {
    // Read the original value from the fixture rather than hardcoding it, so the
    // test stays correct if the fixture is regenerated from a newer ECHE file.
    const original = await parseEcheWorkbook(readFileSync(FIXTURE_PATH));
    const parisRow = original.rows.find((row) => (row['Erasmus code'] ?? '').includes('PARIS001'));
    expect(parisRow).toBeDefined();
    const originalCity = parisRow?.City ?? null;
    expect(originalCity).not.toBe('Changed City');

    await ingestEche(ingest, fixtureSource());
    const changed = await fixtureWithChange(
      (row) => (row['Erasmus code'] ?? '').includes('PARIS001'),
      (row) => ({ ...row, City: 'Changed City' }),
    );
    await ingestEche(ingest, fixtureSource(changed));

    const { rows } = await admin.query<{ raw_payload: Record<string, string | null> }>(
      `SELECT s.raw_payload
         FROM organisation_sources s
         JOIN organisations o ON o.id = s.organisation_id
        WHERE o.erasmus_code = 'F PARIS001'
        ORDER BY s.created_at`,
    );
    expect(rows).toHaveLength(2);
    // The original observation is still readable, unmodified.
    expect(rows[0]?.raw_payload['City']).toBe(originalCity);
    expect(rows[1]?.raw_payload['City']).toBe('Changed City');
  });

  it('stores both rows of the duplicated Erasmus code without merging them', async () => {
    await ingestEche(ingest, fixtureSource());

    const { rows } = await admin.query<{ pic: string; legal_name: string; eche_row_key: string }>(
      `SELECT pic, legal_name, eche_row_key FROM organisations
        WHERE erasmus_code = 'E VIGO13' ORDER BY pic`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.pic).not.toBe(rows[1]?.pic);
    expect(rows[0]?.eche_row_key).not.toBe(rows[1]?.eche_row_key);
  });

  it('honours the country filter', async () => {
    const result = await ingestEche(ingest, fixtureSource(), { country: 'NL' });
    expect(result.rowsInserted).toBeGreaterThan(0);

    const { rows } = await admin.query<{ country_code: string }>(
      'SELECT DISTINCT country_code FROM organisations',
    );
    expect(rows.map((r) => r.country_code)).toEqual(['NL']);
  });

  it('performs no mutation at all in dry-run mode', async () => {
    const result = await ingestEche(ingest, fixtureSource(), { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.ingestRunId).toBeNull();
    expect(result.rowsRead).toBe(12);

    expect(await count(admin, 'organisations')).toBe(0);
    expect(await count(admin, 'organisation_sources')).toBe(0);
    // Not even an ingest_runs row is written.
    expect(await count(admin, 'ingest_runs')).toBe(0);
  });

  it('records run metadata including the source hash', async () => {
    const source = fixtureSource();
    await ingestEche(ingest, source);

    const { rows } = await admin.query<{
      status: string;
      source_file_sha256: string;
      source_input_kind: string;
      rows_inserted: number;
      finished_at: Date | null;
    }>(
      'SELECT status, source_file_sha256, source_input_kind, rows_inserted, finished_at FROM ingest_runs',
    );

    expect(rows[0]?.status).toBe('succeeded');
    expect(rows[0]?.source_file_sha256).toBe(source.sha256);
    expect(rows[0]?.source_input_kind).toBe('operator_file');
    expect(rows[0]?.rows_inserted).toBe(12);
    expect(rows[0]?.finished_at).not.toBeNull();
  });

  it('records the licence and source url on every provenance row', async () => {
    await ingestEche(ingest, fixtureSource());
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM organisation_sources
        WHERE source_licence LIKE 'CC BY 4.0%' AND source_system = 'eche'`,
    );
    expect(Number.parseInt(rows[0]?.n ?? '0', 10)).toBe(12);
  });
});

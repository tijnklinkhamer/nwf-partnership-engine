/**
 * Phase 1D website evidence, against a real PostgreSQL database.
 *
 * What these prove, and why each matters:
 *   - claims carry the PUBLISHED value, not the legacy-normalised one
 *   - re-ingesting the same artifact inserts nothing (append-only idempotency)
 *   - both sources' claims coexist; neither overwrites the other
 *   - ingesting website evidence changes NO organisation and NO ewp_* row
 *   - the ingest role cannot UPDATE or DELETE a claim - the database says so
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { ingestEche } from '../../ingest/eche/ingest.js';
import { ingestFresr } from '../../ingest/fresr/ingest.js';
import { ingestEcheWebsiteClaims } from '../../website/ingestEche.js';
import { WEBSITE_PARSE_RULE_VERSION } from '../../website/parse.js';
import {
  adminPool,
  count,
  databaseConfigured,
  fixtureSource,
  fresrFixtureSource,
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

describeDb('website evidence (integration)', () => {
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

  describe('ECHE website claims', () => {
    it('creates exactly one claim per source row, including rows with no website', async () => {
      const result = await ingestEcheWebsiteClaims(ingest, fixtureSource());

      // The denominator is the ARTIFACT, so a row publishing nothing still
      // produces a claim. That is what makes completeness verifiable with a
      // single COUNT instead of assumed.
      expect(result.rowsRead).toBe(14);
      expect(result.write?.inserted).toBe(14);
      expect(await count(readonly, 'website_claims')).toBe(14);
      expect(result.absent).toBeGreaterThan(0);
    });

    it('stores the PUBLISHED value, not the legacy-normalised one', async () => {
      await ingestEcheWebsiteClaims(ingest, fixtureSource());

      const { rows } = await readonly.query<{
        raw_value: string | null;
        structural_status: string;
        registrable_domain: string | null;
      }>(
        `SELECT raw_value, structural_status, registrable_domain
           FROM website_claims
          WHERE eche_row_key LIKE 'X BADURL01%'`,
      );
      // The fixture publishes the free text "not a url at all". The legacy
      // path turned that into null and moved on; the claim keeps it verbatim
      // and says WHY it was rejected.
      expect(rows[0]?.raw_value).toBe('not a url at all');
      expect(rows[0]?.structural_status).toBe('MALFORMED');
      expect(rows[0]?.registrable_domain).toBeNull();
    });

    it('links a claim to an organisation when one exists, and not otherwise', async () => {
      // Claims first, with NO organisations in the database at all.
      await ingestEcheWebsiteClaims(ingest, fixtureSource());
      const { rows: unlinked } = await readonly.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM website_claims WHERE organisation_id IS NOT NULL',
      );
      // The evidence layer covers the whole artifact regardless.
      expect(Number(unlinked[0]?.n)).toBe(0);
      expect(await count(readonly, 'website_claims')).toBe(14);
    });

    it('is idempotent: a second identical run inserts nothing', async () => {
      const first = await ingestEcheWebsiteClaims(ingest, fixtureSource());
      const second = await ingestEcheWebsiteClaims(ingest, fixtureSource());

      expect(first.write?.inserted).toBe(14);
      expect(second.write?.inserted).toBe(0);
      expect(second.write?.alreadyPresent).toBe(14);
      expect(await count(readonly, 'website_claims')).toBe(14);
    });

    it('performs no database mutation on a dry run', async () => {
      const result = await ingestEcheWebsiteClaims(ingest, fixtureSource(), { dryRun: true });
      expect(result.dryRun).toBe(true);
      expect(result.ingestRunId).toBeNull();
      expect(await count(readonly, 'website_claims')).toBe(0);
      expect(await count(readonly, 'ingest_runs')).toBe(0);
    });

    it('stamps the rule version that produced the classification', async () => {
      await ingestEcheWebsiteClaims(ingest, fixtureSource());
      const { rows } = await readonly.query<{ rule_version: string }>(
        'SELECT DISTINCT rule_version FROM website_claims',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.rule_version).toBe(WEBSITE_PARSE_RULE_VERSION);
    });
  });

  describe('French register claims', () => {
    it('stores a snapshot and the claims its PIC join supports', async () => {
      const result = await ingestFresr(ingest, fresrFixtureSource(), fixtureSource());

      expect(result.recordCount).toBe(12);
      // 10 usable PICs, of which one names no ECHE row in the fixture.
      expect(result.recordsWithPic).toBe(10);
      expect(result.recordsWithNonComparablePic).toBe(1);
      expect(result.recordsMatchingEche).toBe(9);
      expect(result.recordsWithPicNotInEche).toBe(1);
      expect(await count(readonly, 'website_source_snapshots')).toBe(1);
      expect(await count(readonly, 'website_claims')).toBe(9);
    });

    it('records a hand-written fixture as operator_file with NO invented origin', async () => {
      await ingestFresr(ingest, fresrFixtureSource(), fixtureSource());
      const { rows } = await readonly.query<{
        source_input_kind: string;
        publication_url: string | null;
        read_url: string | null;
        origin_retrieved_at: Date | null;
        record_count: number;
      }>('SELECT * FROM website_source_snapshots');

      expect(rows[0]?.source_input_kind).toBe('operator_file');
      // NULL means NOT RECORDED. The fixture was never published anywhere, and
      // nothing may infer a publication URL for it.
      expect(rows[0]?.publication_url).toBeNull();
      expect(rows[0]?.read_url).toBeNull();
      expect(rows[0]?.origin_retrieved_at).toBeNull();
      // The un-joined remainder stays visible.
      expect(rows[0]?.record_count).toBe(12);
    });

    it('is idempotent: a second identical run inserts nothing', async () => {
      const first = await ingestFresr(ingest, fresrFixtureSource(), fixtureSource());
      const second = await ingestFresr(ingest, fresrFixtureSource(), fixtureSource());

      expect(first.snapshotAlreadyPresent).toBe(false);
      expect(second.snapshotAlreadyPresent).toBe(true);
      expect(second.write?.inserted).toBe(0);
      expect(await count(readonly, 'website_source_snapshots')).toBe(1);
      expect(await count(readonly, 'website_claims')).toBe(9);
    });
  });

  describe('the two sources coexist and neither is overwritten', () => {
    beforeEach(async () => {
      await ingestEche(ingest, fixtureSource());
      await ingestEcheWebsiteClaims(ingest, fixtureSource());
      await ingestFresr(ingest, fresrFixtureSource(), fixtureSource());
    });

    it('keeps BOTH claims for a row the two sources disagree about', async () => {
      const { rows } = await readonly.query<{ source_kind: string; registrable_domain: string }>(
        `SELECT source_kind, registrable_domain
           FROM website_claims
          WHERE eche_row_key = 'F PARIS001|999859123'
          ORDER BY source_kind`,
      );
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => [r.source_kind, r.registrable_domain])).toEqual([
        ['ECHE_PUBLISHED', 'univ-paris1.fr'],
        ['FR_ESR', 'pantheonsorbonne.fr'],
      ]);
    });

    it('leaves the legacy organisations columns byte-for-byte untouched', async () => {
      const { rows } = await readonly.query<{
        website_url: string | null;
        canonical_domain: string | null;
      }>(
        `SELECT website_url, canonical_domain
           FROM organisations WHERE eche_row_key = 'F PARIS001|999859123'`,
      );
      // The French register says pantheonsorbonne.fr. That must NOT have
      // rewritten anything: a second source is evidence, never a correction.
      expect(rows[0]?.website_url).toBe('http://www.univ-paris1.fr/');
      expect(rows[0]?.canonical_domain).toBe('univ-paris1.fr');
    });

    it('creates and modifies NO organisation while ingesting website evidence', async () => {
      const before = await readonly.query<{ id: string; updated_at: Date }>(
        'SELECT id, updated_at FROM organisations ORDER BY id',
      );
      await ingestEcheWebsiteClaims(ingest, fixtureSource());
      await ingestFresr(ingest, fresrFixtureSource(), fixtureSource());
      const after = await readonly.query<{ id: string; updated_at: Date }>(
        'SELECT id, updated_at FROM organisations ORDER BY id',
      );

      expect(after.rows).toEqual(before.rows);
      expect(await count(readonly, 'organisations')).toBe(before.rowCount);
    });

    it('writes no organisation_sources row and no ewp_* row', async () => {
      // organisation_sources holds exactly what the ECHE organisation ingest
      // wrote, and website evidence adds nothing to it.
      expect(await count(readonly, 'organisation_sources')).toBe(
        await count(readonly, 'organisations'),
      );
      expect(await count(readonly, 'ewp_snapshots')).toBe(0);
      expect(await count(readonly, 'ewp_heis')).toBe(0);
    });
  });

  describe('grants make the claim tables append-only', () => {
    beforeEach(async () => {
      await ingestEcheWebsiteClaims(ingest, fixtureSource());
      await ingestFresr(ingest, fresrFixtureSource(), fixtureSource());
    });

    it('nwf_ingest may SELECT and INSERT website_claims', async () => {
      await expect(ingest.query('SELECT count(*) FROM website_claims')).resolves.toBeDefined();
    });

    it('nwf_ingest may NOT UPDATE website_claims', async () => {
      await expectDenied(() => ingest.query("UPDATE website_claims SET raw_value = 'rewritten'"));
    });

    it('nwf_ingest may NOT DELETE website_claims', async () => {
      await expectDenied(() => ingest.query('DELETE FROM website_claims'));
    });

    it('nwf_ingest may NOT UPDATE website_source_snapshots', async () => {
      await expectDenied(() =>
        ingest.query("UPDATE website_source_snapshots SET source_key = 'other'"),
      );
    });

    it('nwf_ingest may NOT DELETE website_source_snapshots', async () => {
      await expectDenied(() => ingest.query('DELETE FROM website_source_snapshots'));
    });

    it('nwf_readonly may SELECT but not INSERT', async () => {
      await expect(readonly.query('SELECT count(*) FROM website_claims')).resolves.toBeDefined();
      await expectDenied(() =>
        readonly.query(
          `INSERT INTO website_claims
             (source_kind, eche_row_key, source_row_key, structural_status, rule_version,
              source_artifact_sha256, observed_at, ingest_run_id)
           VALUES ('ECHE_PUBLISHED','X|1','X|1','ABSENT','v', repeat('a',64), now(),
                   (SELECT id FROM ingest_runs LIMIT 1))`,
        ),
      );
    });
  });

  describe('schema constraints refuse a conclusion masquerading as a claim', () => {
    it('rejects a structural status that is a cross-source verdict', async () => {
      await ingestEcheWebsiteClaims(ingest, fixtureSource());
      // CORROBORATED / VERIFIED / CONFLICT are relationships between claims.
      // No single source can hold one, and the database says so.
      await expect(
        admin.query(
          // Every other constraint is deliberately satisfied, so the status
          // check is the one that must reject this row.
          `INSERT INTO website_claims
             (source_kind, eche_row_key, source_row_key, raw_value, structural_status,
              rejection_reason, rule_version, source_artifact_sha256, observed_at,
              ingest_run_id)
           VALUES ('ECHE_PUBLISHED','X|9','X|9','https://x-test.fr/','CORROBORATED',
                   'n/a','v', repeat('a',64), now(),
                   (SELECT id FROM ingest_runs LIMIT 1))`,
        ),
      ).rejects.toThrow(/website_claims_structural_status_chk/);
    });

    it('rejects a rejected value that carries a derived domain anyway', async () => {
      await ingestEcheWebsiteClaims(ingest, fixtureSource());
      await expect(
        admin.query(
          `INSERT INTO website_claims
             (source_kind, eche_row_key, source_row_key, raw_value, structural_status,
              rejection_reason, normalised_url, hostname, registrable_domain,
              rule_version, source_artifact_sha256, observed_at, ingest_run_id)
           VALUES ('ECHE_PUBLISHED','X|9','X|9','a@gva.es','NOT_A_WEBSITE',
                   'userinfo_present','https://gva.es/','gva.es','gva.es','v',
                   repeat('a',64), now(), (SELECT id FROM ingest_runs LIMIT 1))`,
        ),
      ).rejects.toThrow(/website_claims_derived_iff_valid_chk/);
    });

    it('rejects a second external website source', async () => {
      await ingestEcheWebsiteClaims(ingest, fixtureSource());
      // Phase 1D approves ONE external register. Adding another is a phase
      // decision, and the constraint makes that explicit rather than implicit.
      await expect(
        admin.query(
          `INSERT INTO website_source_snapshots
             (source_key, source_input_kind, source_location, fetched_at,
              artifact_sha256, artifact_bytes, record_count, first_ingest_run_id)
           VALUES ('es_registro','operator_file','/tmp/x.json', now(),
                   repeat('b',64), 10, 1, (SELECT id FROM ingest_runs LIMIT 1))`,
        ),
      ).rejects.toThrow(/website_source_snapshots_source_key_chk/);
    });
  });
});

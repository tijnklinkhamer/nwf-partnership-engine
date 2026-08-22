/**
 * Idempotent ECHE ingestion.
 *
 * Contract:
 *   - first ingest of a row        -> organisation INSERTed, provenance appended
 *   - identical dataset re-ingested -> no duplicate organisation, no duplicate
 *                                      provenance row, counted as unchanged
 *   - changed row for same key      -> source-owned mutable fields UPDATEd,
 *                                      NEW provenance appended, prior provenance
 *                                      left completely intact
 *
 * Evidence history is never overwritten. The ingest role has no UPDATE or DELETE
 * grant on organisation_sources, so this is enforced by the database and not
 * merely by this code.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { withTransaction } from '../../db/client.js';
import * as log from '../../logging/log.js';
import { parseEcheWorkbook, type RawEcheRow } from './parse.js';
import { normaliseRow, RowValidationError, type NormalisedOrganisation } from './normalise.js';
import { ECHE_SOURCE_LICENCE, ECHE_SOURCE_SYSTEM } from './schema.js';
import type { ResolvedSource } from './source.js';

export interface IngestOptions {
  /** Restrict to a single ISO-3166-1 alpha-2 country code. */
  country?: string | undefined;
  /** Parse and report, but perform no database mutation whatsoever. */
  dryRun?: boolean | undefined;
}

export interface IngestResult {
  ingestRunId: string | null;
  rowsRead: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsUnchanged: number;
  rowsSkippedInvalid: number;
  invalidExamples: string[];
  dryRun: boolean;
  sheetName: string;
  headerRowIndex: number;
}

/** Stable hash of the raw source row, used for deterministic re-ingest detection. */
export function payloadHash(row: RawEcheRow): string {
  // Key order is fixed by sorting so that hashing is stable across runs.
  const ordered: Record<string, string | null> = {};
  for (const key of Object.keys(row).sort()) ordered[key] = row[key] ?? null;
  return createHash('sha256').update(JSON.stringify(ordered), 'utf8').digest('hex');
}

/**
 * The source-owned mutable fields. ECHE owns exactly these, and a re-ingest may
 * update only these. `id`, `eche_row_key`, `org_type` and `created_at` are never
 * touched by an update, and provenance is never touched at all.
 */
interface ExistingOrganisation {
  id: string;
  legal_name: string;
  display_name: string;
  country_code: string;
  city: string | null;
  erasmus_code: string;
  pic: string | null;
  oid: string | null;
  website_url: string | null;
  canonical_domain: string | null;
}

function differs(existing: ExistingOrganisation, next: NormalisedOrganisation): boolean {
  return (
    existing.legal_name !== next.legalName ||
    existing.display_name !== next.displayName ||
    existing.country_code !== next.countryCode ||
    existing.city !== next.city ||
    existing.erasmus_code !== next.erasmusCode ||
    existing.pic !== next.pic ||
    existing.oid !== next.oid ||
    existing.website_url !== next.websiteUrl ||
    existing.canonical_domain !== next.canonicalDomain
  );
}

async function startRun(pool: pg.Pool, source: ResolvedSource, dryRun: boolean): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ingest_runs
       (source_system, source_page_url, resolved_file_url, source_input_kind,
        source_file_sha256, status, dry_run)
     VALUES ($1, $2, $3, $4, $5, 'running', $6)
     RETURNING id`,
    [
      ECHE_SOURCE_SYSTEM,
      source.pageUrl,
      source.fileUrl ?? source.filePath,
      source.kind,
      source.sha256,
      dryRun,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to create ingest_runs row');
  return id;
}

async function finishRun(
  pool: pg.Pool,
  runId: string,
  result: Omit<IngestResult, 'ingestRunId' | 'dryRun' | 'sheetName' | 'headerRowIndex'>,
  status: 'succeeded' | 'failed',
  errorSummary: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE ingest_runs
        SET finished_at = now(), rows_read = $2, rows_inserted = $3,
            rows_updated = $4, rows_unchanged = $5, status = $6, error_summary = $7
      WHERE id = $1`,
    [
      runId,
      result.rowsRead,
      result.rowsInserted,
      result.rowsUpdated,
      result.rowsUnchanged,
      status,
      errorSummary,
    ],
  );
}

export async function ingestEche(
  pool: pg.Pool,
  source: ResolvedSource,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const dryRun = options.dryRun === true;
  const parsed = await parseEcheWorkbook(source.bytes);

  const countryFilter = options.country ? options.country.toUpperCase() : null;

  let rowsInserted = 0;
  let rowsUpdated = 0;
  let rowsUnchanged = 0;
  let rowsSkippedInvalid = 0;
  const invalidExamples: string[] = [];

  // Normalise first so a bad row is reported without any database work.
  const candidates: Array<{ raw: RawEcheRow; normalised: NormalisedOrganisation }> = [];
  for (const raw of parsed.rows) {
    let normalised: NormalisedOrganisation;
    try {
      normalised = normaliseRow(raw);
    } catch (err) {
      rowsSkippedInvalid += 1;
      if (invalidExamples.length < 10) {
        invalidExamples.push(err instanceof RowValidationError ? err.message : String(err));
      }
      continue;
    }
    if (countryFilter !== null && normalised.countryCode !== countryFilter) continue;
    candidates.push({ raw, normalised });
  }

  const rowsRead = candidates.length;

  if (dryRun) {
    log.info(
      `DRY RUN: parsed ${parsed.rows.length} data row(s); ` +
        `${rowsRead} match the current filter; ${rowsSkippedInvalid} invalid. ` +
        `No database mutation performed.`,
    );
    return {
      ingestRunId: null,
      rowsRead,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsUnchanged: 0,
      rowsSkippedInvalid,
      invalidExamples,
      dryRun: true,
      sheetName: parsed.sheetName,
      headerRowIndex: parsed.headerRowIndex,
    };
  }

  const runId = await startRun(pool, source, dryRun);

  try {
    for (const { raw, normalised } of candidates) {
      const hash = payloadHash(raw);

      await withTransaction(pool, async (client) => {
        const existingResult = await client.query<ExistingOrganisation>(
          `SELECT id, legal_name, display_name, country_code, city, erasmus_code,
                  pic, oid, website_url, canonical_domain
             FROM organisations
            WHERE eche_row_key = $1
            FOR UPDATE`,
          [normalised.echeRowKey],
        );
        const existing = existingResult.rows[0];

        let organisationId: string;

        if (!existing) {
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO organisations
               (eche_row_key, legal_name, display_name, country_code, city,
                erasmus_code, pic, oid, website_url, canonical_domain, org_type)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING id`,
            [
              normalised.echeRowKey,
              normalised.legalName,
              normalised.displayName,
              normalised.countryCode,
              normalised.city,
              normalised.erasmusCode,
              normalised.pic,
              normalised.oid,
              normalised.websiteUrl,
              normalised.canonicalDomain,
              normalised.orgType,
            ],
          );
          const id = inserted.rows[0]?.id;
          if (!id) throw new Error('INSERT organisations returned no id');
          organisationId = id;
          rowsInserted += 1;
        } else {
          organisationId = existing.id;
          if (differs(existing, normalised)) {
            await client.query(
              `UPDATE organisations
                  SET legal_name = $2, display_name = $3, country_code = $4, city = $5,
                      erasmus_code = $6, pic = $7, oid = $8, website_url = $9,
                      canonical_domain = $10, updated_at = now()
                WHERE id = $1`,
              [
                organisationId,
                normalised.legalName,
                normalised.displayName,
                normalised.countryCode,
                normalised.city,
                normalised.erasmusCode,
                normalised.pic,
                normalised.oid,
                normalised.websiteUrl,
                normalised.canonicalDomain,
              ],
            );
            rowsUpdated += 1;
          } else {
            rowsUnchanged += 1;
          }
        }

        // Append-only provenance. An identical payload for the same organisation
        // is recognised by the unique index and appended at most once.
        await client.query(
          `INSERT INTO organisation_sources
             (organisation_id, ingest_run_id, source_system, source_record_id,
              source_url, source_licence, retrieved_at, raw_payload, payload_sha256)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (organisation_id, source_system, source_record_id, payload_sha256)
           DO NOTHING`,
          [
            organisationId,
            runId,
            ECHE_SOURCE_SYSTEM,
            normalised.echeRowKey,
            source.fileUrl ?? source.filePath ?? 'operator-supplied',
            ECHE_SOURCE_LICENCE,
            source.retrievedAt,
            JSON.stringify(raw),
            hash,
          ],
        );
      });
    }

    const result = {
      rowsRead,
      rowsInserted,
      rowsUpdated,
      rowsUnchanged,
      rowsSkippedInvalid,
      invalidExamples,
    };
    await finishRun(pool, runId, result, 'succeeded', null);

    return {
      ingestRunId: runId,
      ...result,
      dryRun: false,
      sheetName: parsed.sheetName,
      headerRowIndex: parsed.headerRowIndex,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(
      pool,
      runId,
      {
        rowsRead,
        rowsInserted,
        rowsUpdated,
        rowsUnchanged,
        rowsSkippedInvalid,
        invalidExamples,
      },
      'failed',
      message.slice(0, 2000),
    );
    throw err;
  }
}

/**
 * EWP Registry catalogue ingestion.
 *
 * Contract:
 *   - a NEW artifact          -> one ewp_snapshots row plus all of its evidence
 *   - the SAME artifact again -> recognised by SHA-256, nothing re-inserted,
 *                                the run is recorded as unchanged
 *   - a CHANGED catalogue     -> a NEW snapshot beside the old one; no row of
 *                                the previous snapshot is touched
 *
 * The idempotency anchor is the SHA-256 of the artifact bytes and nothing else.
 * The live catalogue is refreshed continuously and publishes no edition or
 * version identifier, so there is no other honest identity available.
 *
 * WHAT THIS FUNCTION NEVER DOES, and what the database independently forbids:
 *   - touch `organisations` or `organisation_sources`. It issues no statement
 *     against either table. In particular it never writes canonical_domain, and
 *     a SCHAC identifier never becomes a website.
 *   - update or delete any ewp_* row. The nwf_ingest role holds SELECT and
 *     INSERT on those tables and nothing more, so append-only is enforced by
 *     grants rather than by this comment.
 *   - call any endpoint the catalogue declares.
 */
import type pg from 'pg';
import { withTransaction } from '../../db/client.js';
import * as log from '../../logging/log.js';
import { parseEwpCatalogue, type ParsedEwpCatalogue } from './parse.js';
import { normaliseHei, foldHeiId } from './normalise.js';
import { EWP_SOURCE_SYSTEM } from './schema.js';
import { sourceLocation, type EwpResolvedSource } from './source.js';

export interface EwpIngestOptions {
  /** Parse and report, but perform no database mutation whatsoever. */
  dryRun?: boolean | undefined;
}

export interface EwpIngestResult {
  ingestRunId: string | null;
  snapshotId: string | null;
  artifactSha256: string;
  artifactBytes: number;
  /** True when this artifact was already stored and nothing was inserted. */
  alreadyPresent: boolean;
  hostCount: number;
  heiCount: number;
  otherIdCount: number;
  apiDeclarationCount: number;
  coveredHeiRefCount: number;
  emptyOtherIdCount: number;
  dryRun: boolean;
}

/** How many rows are sent per multi-row INSERT. */
const INSERT_BATCH = 500;

function countOtherIds(parsed: ParsedEwpCatalogue): number {
  return parsed.heis.reduce((total, hei) => total + hei.otherIds.length, 0);
}

function countApis(parsed: ParsedEwpCatalogue): number {
  return parsed.hosts.reduce((total, host) => total + host.apis.length, 0);
}

function countCoveredRefs(parsed: ParsedEwpCatalogue): number {
  return parsed.hosts.reduce((total, host) => total + host.coveredHeiIds.length, 0);
}

async function startRun(
  pool: pg.Pool,
  source: EwpResolvedSource,
  dryRun: boolean,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ingest_runs
       (source_system, source_page_url, resolved_file_url, source_input_kind,
        source_file_sha256, source_file_bytes, status, dry_run)
     VALUES ($1, NULL, $2, $3, $4, $5, 'running', $6)
     RETURNING id`,
    // source_page_url stays NULL: the EWP catalogue is fetched from a
    // well-known endpoint, not discovered from a document page, and inventing
    // a page URL here would misrepresent where the bytes came from.
    [
      EWP_SOURCE_SYSTEM,
      sourceLocation(source),
      source.kind,
      source.sha256,
      source.bytes.byteLength,
      dryRun,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to create ingest_runs row for the EWP catalogue');
  return id;
}

async function finishRun(
  pool: pg.Pool,
  runId: string,
  rowsRead: number,
  rowsInserted: number,
  rowsUnchanged: number,
  status: 'succeeded' | 'failed',
  errorSummary: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE ingest_runs
        SET finished_at = now(), rows_read = $2, rows_inserted = $3,
            rows_unchanged = $4, status = $5, error_summary = $6
      WHERE id = $1`,
    [runId, rowsRead, rowsInserted, rowsUnchanged, status, errorSummary],
  );
}

/**
 * Inserts `rows` in batches using one multi-row VALUES statement per batch.
 *
 * 3472 HEIs, 7457 identifiers and 52254 API declarations is far too many for a
 * statement per row over a local socket, and far too many parameters for a
 * single statement (Postgres caps a message at 65535 parameters).
 */
async function insertBatched(
  client: pg.PoolClient,
  table: string,
  columns: readonly string[],
  rows: readonly unknown[][],
): Promise<void> {
  for (let start = 0; start < rows.length; start += INSERT_BATCH) {
    const batch = rows.slice(start, start + INSERT_BATCH);
    const params: unknown[] = [];
    const tuples = batch.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`,
      params,
    );
  }
}

export async function ingestEwpCatalogue(
  pool: pg.Pool,
  source: EwpResolvedSource,
  options: EwpIngestOptions = {},
): Promise<EwpIngestResult> {
  const dryRun = options.dryRun === true;

  // Parsing happens before any database work, so a malformed artifact is
  // reported without having created a run row at all.
  const parsed = parseEwpCatalogue(source.bytes);

  const hostCount = parsed.hosts.length;
  const heiCount = parsed.heis.length;
  const otherIdCount = countOtherIds(parsed);
  const apiDeclarationCount = countApis(parsed);
  const coveredHeiRefCount = countCoveredRefs(parsed);
  const emptyOtherIdCount = parsed.anomalies.filter(
    (anomaly) => anomaly.kind === 'empty_other_id_value',
  ).length;

  const base = {
    artifactSha256: source.sha256,
    artifactBytes: source.bytes.byteLength,
    hostCount,
    heiCount,
    otherIdCount,
    apiDeclarationCount,
    coveredHeiRefCount,
    emptyOtherIdCount,
  };

  if (dryRun) {
    log.info(
      `DRY RUN: parsed ${heiCount} HEI(s), ${hostCount} host(s), ` +
        `${otherIdCount} identifier(s), ${apiDeclarationCount} API declaration(s). ` +
        `No database mutation performed.`,
    );
    return {
      ...base,
      ingestRunId: null,
      snapshotId: null,
      alreadyPresent: false,
      dryRun: true,
    };
  }

  const runId = await startRun(pool, source, dryRun);

  try {
    // Is this exact artifact already stored? The unique index on
    // artifact_sha256 is what makes this a real guarantee rather than a race.
    const existing = await pool.query<{ id: string }>(
      'SELECT id FROM ewp_snapshots WHERE artifact_sha256 = $1',
      [source.sha256],
    );
    const existingId = existing.rows[0]?.id;
    if (existingId !== undefined) {
      log.info(
        `Artifact ${source.sha256.slice(0, 16)}... is already stored as snapshot ` +
          `${existingId}. Nothing was inserted.`,
      );
      await finishRun(pool, runId, heiCount, 0, heiCount, 'succeeded', null);
      return {
        ...base,
        ingestRunId: runId,
        snapshotId: existingId,
        alreadyPresent: true,
        dryRun: false,
      };
    }

    const snapshotId = await withTransaction(pool, async (client) => {
      const snapshot = await client.query<{ id: string }>(
        `INSERT INTO ewp_snapshots
           (artifact_sha256, artifact_bytes, source_input_kind, source_location,
            fetched_at, first_ingest_run_id, host_count, hei_count,
            other_id_count, api_declaration_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          source.sha256,
          source.bytes.byteLength,
          source.kind,
          sourceLocation(source),
          source.fetchedAt,
          runId,
          hostCount,
          heiCount,
          otherIdCount,
          apiDeclarationCount,
        ],
      );
      const id = snapshot.rows[0]?.id;
      if (!id) throw new Error('INSERT ewp_snapshots returned no id');

      // --- institutions -----------------------------------------------------
      const normalisedHeis = parsed.heis.map(normaliseHei);

      await insertBatched(
        client,
        'ewp_heis',
        ['snapshot_id', 'document_index', 'hei_id', 'hei_id_folded', 'names'],
        normalisedHeis.map((hei) => [
          id,
          hei.documentIndex,
          hei.heiId,
          hei.heiIdFolded,
          JSON.stringify(hei.names),
        ]),
      );

      // The identifier rows need their parent's generated uuid, so the ids are
      // read back keyed by document_index rather than assumed.
      const heiIdByIndex = new Map<number, string>();
      const storedHeis = await client.query<{ id: string; document_index: number }>(
        'SELECT id, document_index FROM ewp_heis WHERE snapshot_id = $1',
        [id],
      );
      for (const row of storedHeis.rows) heiIdByIndex.set(row.document_index, row.id);

      const otherIdRows: unknown[][] = [];
      for (const hei of normalisedHeis) {
        const parentId = heiIdByIndex.get(hei.documentIndex);
        if (parentId === undefined) {
          throw new Error(`Internal error: no stored ewp_heis row for index ${hei.documentIndex}`);
        }
        for (const other of hei.otherIds) {
          otherIdRows.push([
            id,
            parentId,
            other.ordinal,
            other.type,
            other.typeFolded,
            other.value,
            other.valueNormalised,
          ]);
        }
      }
      await insertBatched(
        client,
        'ewp_hei_other_ids',
        [
          'snapshot_id',
          'ewp_hei_id',
          'ordinal',
          'id_type',
          'id_type_folded',
          'id_value',
          'id_value_normalised',
        ],
        otherIdRows,
      );

      // --- hosts ------------------------------------------------------------
      await insertBatched(
        client,
        'ewp_hosts',
        ['snapshot_id', 'document_index', 'admin_provider'],
        // admin_email is deliberately absent: Phase 1B stores no contacts.
        parsed.hosts.map((host) => [id, host.documentIndex, host.adminProvider]),
      );

      const hostIdByIndex = new Map<number, string>();
      const storedHosts = await client.query<{ id: string; document_index: number }>(
        'SELECT id, document_index FROM ewp_hosts WHERE snapshot_id = $1',
        [id],
      );
      for (const row of storedHosts.rows) hostIdByIndex.set(row.document_index, row.id);

      const coveredRows: unknown[][] = [];
      const apiRows: unknown[][] = [];
      for (const host of parsed.hosts) {
        const parentId = hostIdByIndex.get(host.documentIndex);
        if (parentId === undefined) {
          throw new Error(
            `Internal error: no stored ewp_hosts row for index ${host.documentIndex}`,
          );
        }
        host.coveredHeiIds.forEach((heiId, ordinal) => {
          coveredRows.push([id, parentId, ordinal, heiId, foldHeiId(heiId)]);
        });
        host.apis.forEach((api, ordinal) => {
          apiRows.push([
            id,
            parentId,
            ordinal,
            api.namespaceUri,
            api.localName,
            api.version,
            JSON.stringify(api.endpoints),
          ]);
        });
      }

      await insertBatched(
        client,
        'ewp_host_covered_heis',
        ['snapshot_id', 'ewp_host_id', 'ordinal', 'hei_id', 'hei_id_folded'],
        coveredRows,
      );
      await insertBatched(
        client,
        'ewp_api_declarations',
        [
          'snapshot_id',
          'ewp_host_id',
          'ordinal',
          'api_namespace',
          'api_local_name',
          'declared_version',
          'endpoints',
        ],
        apiRows,
      );

      return id;
    });

    await finishRun(pool, runId, heiCount, heiCount, 0, 'succeeded', null);

    return {
      ...base,
      ingestRunId: runId,
      snapshotId,
      alreadyPresent: false,
      dryRun: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(pool, runId, heiCount, 0, 0, 'failed', message.slice(0, 2000));
    throw err;
  }
}

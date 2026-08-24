/**
 * French Ministry register ingestion: one snapshot, plus the website claims it
 * supports.
 *
 * THE JOIN IS DETERMINISTIC AND IDENTIFIER-ONLY.
 *
 * A register record produces a claim if and only if its PIC - the Participant
 * Identification Code, an official identifier BOTH datasets publish - equals
 * an ECHE source row's PIC. There is no name matching, no fuzzy comparison, no
 * city or postcode heuristic, and above all no domain-as-join-key: domains are
 * what this phase is measuring, so using one to decide which rows to compare
 * would assume the answer.
 *
 * A CLAIM IS NEVER A CORRECTION. If ECHE publishes univ-paris1.fr and the
 * register publishes pantheonsorbonne.fr for the same PIC, BOTH rows end up in
 * website_claims. Nothing is overwritten, nothing is preferred, and no
 * `organisations` row changes - this module issues no statement against
 * organisations, organisation_sources or any ewp_* table at all.
 *
 * WHY THE ECHE ARTIFACT, NOT THE DATABASE, SUPPLIES THE JOIN KEYS.
 *
 * The PIC-to-row-key map is built from the ECHE ARTIFACT, exactly as the
 * Phase 1B comparison does. Reading it from `organisations` instead would make
 * the measurement depend on whichever subset of the artifact a working
 * database happens to hold - a partial denominator that looks complete.
 */
import type pg from 'pg';
import { withTransaction } from '../../db/client.js';
import * as log from '../../logging/log.js';
import { blankToNull, echeRowKey, normaliseErasmusCode } from '../eche/normalise.js';
import { parseEcheWorkbook } from '../eche/parse.js';
import type { ResolvedSource as EcheResolvedSource } from '../eche/source.js';
import {
  insertWebsiteClaims,
  type WebsiteClaimInput,
  type WebsiteClaimWriteResult,
} from '../../website/claims.js';
import { parseWebsiteCandidate, WEBSITE_PARSE_RULE_VERSION } from '../../website/parse.js';
import { fresrPic, parseFresrExport } from './parse.js';
import { FRESR_CLAIM_SOURCE_KIND, FRESR_SOURCE_KEY, FRESR_SOURCE_SYSTEM } from './schema.js';
import { sourceLocation, type FresrResolvedSource } from './source.js';

export interface FresrIngestOptions {
  /** Parse and report, but perform no database mutation whatsoever. */
  dryRun?: boolean | undefined;
}

export interface FresrIngestResult {
  ingestRunId: string | null;
  snapshotId: string | null;
  artifactSha256: string;
  artifactBytes: number;
  /** True when this artifact was already stored as a snapshot. */
  snapshotAlreadyPresent: boolean;
  recordCount: number;
  recordsWithPic: number;
  /** Records whose published PIC is not plain digits, so it joins nothing. */
  recordsWithNonComparablePic: number;
  recordsWithUrlValue: number;
  recordsWithMultipleUai: number;
  /** Register records whose PIC matched at least one ECHE source row. */
  recordsMatchingEche: number;
  /** Register records with a PIC that matched no ECHE source row. */
  recordsWithPicNotInEche: number;
  structurallyValid: number;
  malformed: number;
  notAWebsite: number;
  absent: number;
  write: WebsiteClaimWriteResult | null;
  ruleVersion: string;
  dryRun: boolean;
}

/**
 * Raised inside the ingest transaction when the snapshot INSERT found the
 * artifact already stored by someone else. Never escapes this module.
 */
class ArtifactAlreadyStored extends Error {
  constructor(sha256: string) {
    super(`Artifact ${sha256} was stored concurrently by another ingest.`);
    this.name = 'ArtifactAlreadyStored';
  }
}

async function startRun(
  pool: pg.Pool,
  source: FresrResolvedSource,
  dryRun: boolean,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ingest_runs
       (source_system, source_page_url, resolved_file_url, source_input_kind,
        source_file_sha256, source_file_bytes, status, dry_run)
     VALUES ($1, NULL, $2, $3, $4, $5, 'running', $6)
     RETURNING id`,
    // source_page_url stays NULL: this dataset is read from a stable API
    // endpoint, not discovered from a document page. The landing page is
    // recorded on the snapshot as publication_url, where it belongs.
    [
      FRESR_SOURCE_SYSTEM,
      sourceLocation(source),
      // ingest_runs constrains source_input_kind to a shared vocabulary, and
      // both of this source's kinds are already in it.
      source.kind,
      source.sha256,
      source.bytes.byteLength,
      dryRun,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to create ingest_runs row for the French register');
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
 * PIC -> ECHE source row keys, built from the ECHE artifact.
 *
 * A LIST per PIC, not a single key. ECHE's PIC is measured unique today, but
 * it carries no unique constraint and nothing guarantees it stays that way; if
 * a PIC ever names two source rows, both get a claim and neither is chosen.
 */
export function echeRowKeysByPic(
  rows: readonly Record<string, string | null>[],
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const row of rows) {
    const pic = blankToNull(row['PIC'] ?? null);
    if (pic === null) continue;
    const rawCode = blankToNull(row['Erasmus code'] ?? null);
    if (rawCode === null) continue;
    const normalisedCode = normaliseErasmusCode(rawCode);
    if (normalisedCode === '') continue;

    const key = echeRowKey(normalisedCode, pic);
    const bucket = index.get(pic);
    if (bucket === undefined) index.set(pic, [key]);
    else if (!bucket.includes(key)) bucket.push(key);
  }
  return index;
}

export async function ingestFresr(
  pool: pg.Pool,
  source: FresrResolvedSource,
  echeSource: EcheResolvedSource,
  options: FresrIngestOptions = {},
): Promise<FresrIngestResult> {
  const dryRun = options.dryRun === true;

  // Both artifacts are parsed before any database work, so a malformed one is
  // reported without having created a run row at all.
  const parsed = parseFresrExport(source.bytes);
  const workbook = await parseEcheWorkbook(echeSource.bytes);
  const rowKeysByPic = echeRowKeysByPic(workbook.rows);

  const claims: WebsiteClaimInput[] = [];
  let recordsMatchingEche = 0;
  let recordsWithPicNotInEche = 0;
  let structurallyValid = 0;
  let malformed = 0;
  let notAWebsite = 0;
  let absent = 0;

  for (const record of parsed.records) {
    const pic = fresrPic(record);
    // A record with no comparable PIC cannot be attached to an ECHE source
    // row. It is NOT an error and NOT a miss: the register covers French
    // institutions generally, most of which publish no PIC. The snapshot's
    // record_count keeps the un-joined remainder visible.
    if (pic === null) continue;

    const rowKeys = rowKeysByPic.get(pic);
    if (rowKeys === undefined || rowKeys.length === 0) {
      recordsWithPicNotInEche += 1;
      continue;
    }
    recordsMatchingEche += 1;

    const candidate = parseWebsiteCandidate(record.url ?? null);
    for (const rowKey of rowKeys) {
      switch (candidate.status) {
        case 'STRUCTURALLY_VALID':
          structurallyValid += 1;
          break;
        case 'MALFORMED':
          malformed += 1;
          break;
        case 'NOT_A_WEBSITE':
          notAWebsite += 1;
          break;
        case 'ABSENT':
          absent += 1;
          break;
      }
      claims.push({
        sourceKind: FRESR_CLAIM_SOURCE_KIND,
        echeRowKey: rowKey,
        // The register's own stable row identifier, so two register records
        // naming the same ECHE row both survive as separate claims.
        sourceRowKey: record.etablissement_id_paysage,
        candidate,
      });
    }
  }

  const base = {
    artifactSha256: source.sha256,
    artifactBytes: source.bytes.byteLength,
    recordCount: parsed.records.length,
    recordsWithPic: parsed.recordsWithPic,
    recordsWithNonComparablePic: parsed.recordsWithNonComparablePic,
    recordsWithUrlValue: parsed.recordsWithUrlValue,
    recordsWithMultipleUai: parsed.recordsWithMultipleUai,
    recordsMatchingEche,
    recordsWithPicNotInEche,
    structurallyValid,
    malformed,
    notAWebsite,
    absent,
    ruleVersion: WEBSITE_PARSE_RULE_VERSION,
  };

  if (dryRun) {
    log.info(
      `DRY RUN: ${parsed.records.length} register record(s), ${parsed.recordsWithPic} with a ` +
        `PIC, ${recordsMatchingEche} matching an ECHE source row, producing ` +
        `${claims.length} claim(s). No database mutation performed.`,
    );
    return {
      ...base,
      ingestRunId: null,
      snapshotId: null,
      snapshotAlreadyPresent: false,
      write: null,
      dryRun: true,
    };
  }

  const runId = await startRun(pool, source, dryRun);

  try {
    const outcome = await withTransaction(pool, async (client) => {
      // ON CONFLICT DO NOTHING is what makes concurrent first ingests of
      // identical bytes safe: the unique index on artifact_sha256 makes one
      // transaction block here and return no row rather than raising
      // unique_violation. This is the transaction's first statement, so the
      // loser rolls back having written nothing.
      const snapshot = await client.query<{ id: string }>(
        `INSERT INTO website_source_snapshots
           (source_key, source_input_kind, source_location, fetched_at,
            publication_url, read_url, origin_retrieved_at,
            artifact_sha256, artifact_bytes, record_count, first_ingest_run_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (artifact_sha256) DO NOTHING
         RETURNING id`,
        [
          FRESR_SOURCE_KEY,
          source.kind,
          sourceLocation(source),
          source.fetchedAt,
          // publication_url / read_url / origin_retrieved_at say WHERE THE
          // ARTIFACT WAS PUBLISHED. They are whatever the resolver
          // established and are never derived here: null stays null.
          source.publicationUrl,
          source.readUrl,
          source.originRetrievedAt,
          source.sha256,
          source.bytes.byteLength,
          parsed.records.length,
          runId,
        ],
      );

      const snapshotId = snapshot.rows[0]?.id;
      if (snapshotId === undefined) throw new ArtifactAlreadyStored(source.sha256);

      const write = await insertWebsiteClaims(client, claims, {
        ingestRunId: runId,
        sourceArtifactSha256: source.sha256,
        sourceSnapshotId: snapshotId,
        observedAt: new Date(),
      });
      return { snapshotId, write, snapshotAlreadyPresent: false };
    }).catch(async (err: unknown) => {
      if (!(err instanceof ArtifactAlreadyStored)) throw err;

      // The snapshot already exists. The claims are still offered, because a
      // stored snapshot is not by itself proof that its claims were written -
      // an interrupted earlier run could have left a gap - and offering them
      // is free: the unique index makes a genuine repeat a no-op that reports
      // 0 inserted.
      const existing = await pool.query<{ id: string }>(
        'SELECT id FROM website_source_snapshots WHERE artifact_sha256 = $1',
        [source.sha256],
      );
      const snapshotId = existing.rows[0]?.id;
      if (snapshotId === undefined) {
        throw new Error(
          `INSERT website_source_snapshots for ${source.sha256} conflicted, but no ` +
            `snapshot with that artifact hash is present. Nothing was ingested.`,
        );
      }
      log.info(
        `Artifact ${source.sha256.slice(0, 16)}... is already stored as snapshot ` +
          `${snapshotId}. Re-offering its claims; duplicates are ignored.`,
      );
      const write = await withTransaction(pool, (client) =>
        insertWebsiteClaims(client, claims, {
          ingestRunId: runId,
          sourceArtifactSha256: source.sha256,
          sourceSnapshotId: snapshotId,
          observedAt: new Date(),
        }),
      );
      return { snapshotId, write, snapshotAlreadyPresent: true };
    });

    await finishRun(
      pool,
      runId,
      parsed.records.length,
      outcome.write.inserted,
      outcome.write.alreadyPresent,
      'succeeded',
      null,
    );

    return {
      ...base,
      ingestRunId: runId,
      snapshotId: outcome.snapshotId,
      snapshotAlreadyPresent: outcome.snapshotAlreadyPresent,
      write: outcome.write,
      dryRun: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(pool, runId, parsed.records.length, 0, 0, 'failed', message.slice(0, 2000));
    throw err;
  }
}

/**
 * ECHE website-claim ingestion.
 *
 * THE CRITICAL RULE OF THIS MODULE, AND THE REASON IT EXISTS.
 *
 * The raw values are read FROM THE ECHE ARTIFACT ITSELF, using the production
 * ECHE parser. They are NEVER read back out of `organisations.website_url` or
 * `organisations.canonical_domain`.
 *
 * Those columns have already been through the legacy Phase 1A normalisation
 * path, which is the exact defect this phase exists to record: it accepts an
 * email address as a website, because prefixing "https://" to
 * "03014851@edu.gva.es" yields a parsable URL whose userinfo is the mailbox
 * and whose registrable domain is "gva.es". Back-filling claims from those
 * columns would permanently lose the published value and preserve only the
 * damage. The evidence layer has to preserve BAD EVIDENCE HONESTLY, so it
 * reads the source.
 *
 * THE ARTIFACT IS THE DENOMINATOR. Every data row of the workbook produces
 * exactly one claim, including the 239 rows publishing no website at all,
 * which become `ABSENT` claims. There is deliberately no country filter: an
 * evidence base restricted to some subset would look complete while being
 * partial, and a partial denominator that looks complete is the single failure
 * mode this repository keeps guarding against. Whether an `organisations` row
 * exists for a given claim is a separate question, answered by the nullable
 * `organisation_id` link.
 *
 * Writes ONLY to website_claims and ingest_runs. It issues no statement
 * against organisations, organisation_sources or any ewp_* table.
 */
import type pg from 'pg';
import { withTransaction } from '../db/client.js';
import * as log from '../logging/log.js';
import { parseEcheWorkbook } from '../ingest/eche/parse.js';
import { blankToNull, echeRowKey, normaliseErasmusCode } from '../ingest/eche/normalise.js';
import { ECHE_SOURCE_SYSTEM } from '../ingest/eche/schema.js';
import type { ResolvedSource } from '../ingest/eche/source.js';
import {
  insertWebsiteClaims,
  type WebsiteClaimInput,
  type WebsiteClaimWriteResult,
} from './claims.js';
import { parseWebsiteCandidate, WEBSITE_PARSE_RULE_VERSION } from './parse.js';

/** Source system recorded on the ingest_runs row for a website-claim run. */
export const ECHE_WEBSITE_SOURCE_SYSTEM = `${ECHE_SOURCE_SYSTEM}_website_claims`;

export interface EcheWebsiteClaimOptions {
  /** Parse and report, but perform no database mutation whatsoever. */
  dryRun?: boolean | undefined;
}

export interface EcheWebsiteClaimResult {
  ingestRunId: string | null;
  artifactSha256: string;
  /** Data rows in the artifact. Equals the number of claims offered. */
  rowsRead: number;
  /** Rows whose identifiers could not form a row key, so no claim was made. */
  rowsUnusable: number;
  unusableExamples: string[];
  structurallyValid: number;
  malformed: number;
  notAWebsite: number;
  absent: number;
  write: WebsiteClaimWriteResult | null;
  ruleVersion: string;
  dryRun: boolean;
}

async function startRun(pool: pg.Pool, source: ResolvedSource, dryRun: boolean): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ingest_runs
       (source_system, source_page_url, resolved_file_url, source_input_kind,
        source_file_sha256, source_file_bytes, status, dry_run)
     VALUES ($1, $2, $3, $4, $5, $6, 'running', $7)
     RETURNING id`,
    [
      ECHE_WEBSITE_SOURCE_SYSTEM,
      source.pageUrl,
      source.fileUrl ?? source.filePath,
      source.kind,
      source.sha256,
      source.bytes.byteLength,
      dryRun,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to create ingest_runs row for ECHE website claims');
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

/** How many unusable rows are quoted back to the operator. */
const UNUSABLE_EXAMPLE_LIMIT = 5;

export async function ingestEcheWebsiteClaims(
  pool: pg.Pool,
  source: ResolvedSource,
  options: EcheWebsiteClaimOptions = {},
): Promise<EcheWebsiteClaimResult> {
  const dryRun = options.dryRun === true;

  // Parsing happens before any database work, so a malformed artifact is
  // reported without having created a run row at all.
  const workbook = await parseEcheWorkbook(source.bytes);

  const claims: WebsiteClaimInput[] = [];
  const unusableExamples: string[] = [];
  let rowsUnusable = 0;
  let structurallyValid = 0;
  let malformed = 0;
  let notAWebsite = 0;
  let absent = 0;

  for (const row of workbook.rows) {
    const rawCode = blankToNull(row['Erasmus code'] ?? null);
    const normalisedCode = rawCode === null ? '' : normaliseErasmusCode(rawCode);
    if (normalisedCode === '') {
      // A row with no Erasmus code has no row key, so there is nothing to
      // attach a claim to. Counted and reported, never repaired and never
      // silently dropped. Measured: 0 such rows in the live artifact.
      rowsUnusable += 1;
      if (unusableExamples.length < UNUSABLE_EXAMPLE_LIMIT) {
        unusableExamples.push(JSON.stringify(row['Legal Name'] ?? null));
      }
      continue;
    }

    const rowKey = echeRowKey(normalisedCode, blankToNull(row['PIC'] ?? null));

    // THE PUBLISHED VALUE, straight from the artifact. The only transformation
    // is the shared cell reader's removal of surrounding whitespace; interior
    // characters are untouched, so "www.uoi.gr / www.rc.uoi.gr" survives whole.
    const candidate = parseWebsiteCandidate(row['Website Url'] ?? null);

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
      sourceKind: 'ECHE_PUBLISHED',
      echeRowKey: rowKey,
      // For ECHE the claiming source IS the ECHE row, so the two keys coincide.
      sourceRowKey: rowKey,
      candidate,
    });
  }

  const base = {
    artifactSha256: source.sha256,
    rowsRead: workbook.rows.length,
    rowsUnusable,
    unusableExamples,
    structurallyValid,
    malformed,
    notAWebsite,
    absent,
    ruleVersion: WEBSITE_PARSE_RULE_VERSION,
  };

  if (dryRun) {
    log.info(
      `DRY RUN: classified ${claims.length} ECHE website claim(s) - ` +
        `${structurallyValid} valid, ${notAWebsite} not-a-website, ` +
        `${malformed} malformed, ${absent} absent. No database mutation performed.`,
    );
    return { ...base, ingestRunId: null, write: null, dryRun: true };
  }

  const runId = await startRun(pool, source, dryRun);

  try {
    const write = await withTransaction(pool, (client) =>
      insertWebsiteClaims(client, claims, {
        ingestRunId: runId,
        sourceArtifactSha256: source.sha256,
        // ECHE has no website_source_snapshots row by design: its artifact
        // identity already lives on the ingest run, and a second snapshot
        // record for the same bytes would be a second place to disagree.
        sourceSnapshotId: null,
        observedAt: new Date(),
      }),
    );

    await finishRun(
      pool,
      runId,
      workbook.rows.length,
      write.inserted,
      write.alreadyPresent,
      'succeeded',
      null,
    );

    return { ...base, ingestRunId: runId, write, dryRun: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(pool, runId, workbook.rows.length, 0, 0, 'failed', message.slice(0, 2000));
    throw err;
  }
}

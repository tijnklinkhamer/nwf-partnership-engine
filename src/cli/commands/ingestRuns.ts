import { withPool } from '../../db/client.js';

function pad(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

export async function runIngestRuns(args: { limit?: number | undefined }): Promise<number> {
  const limit = args.limit ?? 20;

  return withPool('readonly', async (pool) => {
    const { rows } = await pool.query<{
      id: string;
      source_system: string;
      source_input_kind: string;
      resolved_file_url: string | null;
      source_file_sha256: string | null;
      started_at: Date;
      finished_at: Date | null;
      rows_read: number;
      rows_inserted: number;
      rows_updated: number;
      rows_unchanged: number;
      status: string;
      dry_run: boolean;
      error_summary: string | null;
    }>(
      `SELECT id, source_system, source_input_kind, resolved_file_url, source_file_sha256,
              started_at, finished_at, rows_read, rows_inserted, rows_updated,
              rows_unchanged, status, dry_run, error_summary
         FROM ingest_runs
        ORDER BY started_at DESC
        LIMIT $1`,
      [limit],
    );

    if (rows.length === 0) {
      process.stdout.write('No ingest runs recorded.\n');
      return 0;
    }

    const lines = [
      '',
      `${pad('STARTED', 26)}${pad('STATUS', 11)}${pad('KIND', 15)}${pad('READ', 8)}${pad('INS', 8)}${pad('UPD', 8)}${pad('UNCH', 8)}SHA256`,
      '-'.repeat(110),
    ];
    for (const row of rows) {
      lines.push(
        pad(row.started_at.toISOString(), 26) +
          pad(row.status + (row.dry_run ? '/dry' : ''), 11) +
          pad(row.source_input_kind, 15) +
          pad(String(row.rows_read), 8) +
          pad(String(row.rows_inserted), 8) +
          pad(String(row.rows_updated), 8) +
          pad(String(row.rows_unchanged), 8) +
          (row.source_file_sha256 ? row.source_file_sha256.slice(0, 16) + '…' : '-'),
      );
      if (row.error_summary) lines.push(`    error: ${row.error_summary.slice(0, 200)}`);
    }
    lines.push('', `${rows.length} run(s) shown.`, '');
    process.stdout.write(lines.join('\n'));
    return 0;
  });
}

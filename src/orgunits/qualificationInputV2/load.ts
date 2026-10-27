/**
 * WW E-X - READS ONE SUBJECT'S STORED RECORDS AND BUILDS THE v2 EXPORT.
 *
 * The read is v1's own (`readQualificationInputRecords`): ONE connection,
 * ONE `REPEATABLE READ READ ONLY` transaction that always ends in ROLLBACK,
 * SELECTs only, the database clock the only clock. Nothing is written, no
 * network is touched, no model is called. v2 adds no query: every extraction
 * rule reads the page evidence v1 already reads.
 */
import type pg from 'pg';

import { readQualificationInputRecords } from '../qualificationInput/load.js';
import { buildQualificationInputExportV2 } from './build.js';
import type { QualificationInputExportDocumentV2 } from './contract.js';

export interface ExportOptionsV2 {
  readonly subjectId: string;
  /** Whole-second UTC instant, or null for the database clock. */
  readonly evaluatedAt: string | null;
}

/** Reads and builds the v2 export for exactly one subject. Never writes. */
export async function exportQualificationInputV2(
  pool: pg.Pool,
  options: ExportOptionsV2,
): Promise<QualificationInputExportDocumentV2> {
  const records = await readQualificationInputRecords(pool, options.subjectId);
  return buildQualificationInputExportV2(records, {
    evaluatedAt: options.evaluatedAt,
    readConsistency: 'SINGLE_SNAPSHOT_TRANSACTION',
  });
}

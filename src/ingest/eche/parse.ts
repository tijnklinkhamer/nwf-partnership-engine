/**
 * ECHE spreadsheet parser.
 *
 * Sheet selection is by CONTENT, never by name or position. The workbook is read
 * with `read-excel-file`'s default export, which is the library's documented
 * "read every sheet" API and returns `[{ sheet, data }, ...]` (renamed from the
 * old single-sheet default in v8.0.0; the single-sheet API is now the named
 * `readSheet()` export). Reading every sheet is deliberate: it is what makes the
 * ambiguity check below possible.
 *
 * Exactly one sheet must carry the expected ECHE header:
 *   - zero  -> SchemaDriftError
 *   - two+  -> AmbiguousSheetError (fail closed; never pick one)
 *
 * Within the chosen sheet the header is located by matching the expected column
 * set, never by assuming a fixed index: the live file's row 0 is blank padding
 * and the real header sits on row 1. Columns are never shifted to make a
 * mismatched header fit.
 */
import readXlsxFile, { type Sheet } from 'read-excel-file/node';
import { AmbiguousSheetError, ECHE_COLUMNS, SchemaDriftError } from './schema.js';

/** How far into a sheet we will look for a header row before giving up. */
const HEADER_SEARCH_LIMIT = 25;

/** How many leading rows of each sheet are quoted in a schema-drift error. */
const PREVIEW_ROWS = 5;

export type RawEcheRow = Record<string, string | null>;

/** Cell to trimmed string, preserving interior characters exactly. */
function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim();
}

/** Index of the row carrying every expected ECHE column, or -1. */
function locateHeaderRow(rows: readonly unknown[][]): number {
  const limit = Math.min(rows.length, HEADER_SEARCH_LIMIT);
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map(cellToString);
    if (ECHE_COLUMNS.every((column) => cells.includes(column))) return i;
  }
  return -1;
}

function describeSheets(sheets: readonly Sheet[]): string {
  return sheets
    .map((sheet) => {
      const preview = sheet.data
        .slice(0, PREVIEW_ROWS)
        .map((row) => (Array.isArray(row) ? row.map(cellToString).join(' | ') : String(row)));
      return `sheet "${sheet.sheet}" (${sheet.data.length} row(s)):\n  ${preview.join('\n  ')}`;
    })
    .join('\n');
}

export interface ParsedEche {
  sheetName: string;
  headerRowIndex: number;
  header: string[];
  rows: RawEcheRow[];
}

/** Parses ECHE spreadsheet bytes into raw, untransformed row objects. */
export async function parseEcheWorkbook(bytes: Buffer): Promise<ParsedEche> {
  const sheets = await readXlsxFile(bytes);

  const matches = sheets
    .map((sheet) => ({ sheet, headerRowIndex: locateHeaderRow(sheet.data) }))
    .filter((candidate) => candidate.headerRowIndex !== -1);

  if (matches.length > 1) {
    const names = matches.map((candidate) => candidate.sheet.sheet);
    throw new AmbiguousSheetError(
      `Ambiguous ECHE workbook: ${matches.length} sheets carry the expected header ` +
        `(${names.join(', ')}). Refusing to guess which one is authoritative. ` +
        `Nothing was ingested.`,
      names,
    );
  }

  const match = matches[0];
  if (!match) {
    throw new SchemaDriftError(
      `No sheet in this workbook carries the ECHE header within its first ` +
        `${HEADER_SEARCH_LIMIT} rows. Expected every one of: ${ECHE_COLUMNS.join(', ')}. ` +
        `Sheets seen:\n${describeSheets(sheets)}`,
      ECHE_COLUMNS,
      sheets.map((sheet) => sheet.sheet),
    );
  }

  const { sheet, headerRowIndex } = match;
  const headerRow = sheet.data[headerRowIndex];
  // locateHeaderRow only returns an index whose row is an array containing every
  // expected column, so the header and the column map below are always complete.
  const header = Array.isArray(headerRow) ? headerRow.map(cellToString) : [];

  const columnIndex = new Map<string, number>();
  for (const column of ECHE_COLUMNS) columnIndex.set(column, header.indexOf(column));

  const out: RawEcheRow[] = [];
  for (const row of sheet.data.slice(headerRowIndex + 1)) {
    if (!Array.isArray(row)) continue;
    // Skip entirely blank rows; the workbook contains structural padding.
    if (!row.some((cell) => cellToString(cell) !== '')) continue;

    const record: RawEcheRow = {};
    for (const column of ECHE_COLUMNS) {
      const index = columnIndex.get(column) as number;
      const value = cellToString(row[index]);
      record[column] = value === '' ? null : value;
    }
    out.push(record);
  }

  return { sheetName: sheet.sheet, headerRowIndex, header, rows: out };
}

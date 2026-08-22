import writeXlsxFile from 'write-excel-file/node';

type FixtureCell = { value: string | null; type: StringConstructor };
type FixtureSheet = { name: string; rows: Array<Array<string | null>> };

function toCells(rows: Array<Array<string | null>>): FixtureCell[][] {
  return rows.map((row) => row.map((value) => ({ value, type: String }) as FixtureCell));
}

/**
 * write-excel-file's declared overloads resolve ambiguously for sheets of
 * uniformly-typed cells, so each call shape is narrowed here once rather than
 * cast at every call site. The runtime shapes are the documented ones.
 */
const writeSingle = writeXlsxFile as unknown as (
  sheet: FixtureCell[][],
  options: { buffer: true; sheet?: string },
) => Promise<Buffer>;

const writeMultiple = writeXlsxFile as unknown as (
  sheets: FixtureCell[][][],
  options: { buffer: true; sheets: string[] },
) => Promise<Buffer>;

/**
 * Builds an in-memory single-sheet xlsx from rows of plain strings/nulls, for
 * tests that need a workbook other than the committed fixture.
 */
export async function buildWorkbook(
  rows: Array<Array<string | null>>,
  sheetName?: string,
): Promise<Buffer> {
  return sheetName === undefined
    ? writeSingle(toCells(rows), { buffer: true })
    : writeSingle(toCells(rows), { buffer: true, sheet: sheetName });
}

/** Builds an in-memory multi-sheet xlsx, for sheet-selection tests. */
export async function buildMultiSheetWorkbook(sheets: FixtureSheet[]): Promise<Buffer> {
  return writeMultiple(
    sheets.map((sheet) => toCells(sheet.rows)),
    { buffer: true, sheets: sheets.map((sheet) => sheet.name) },
  );
}

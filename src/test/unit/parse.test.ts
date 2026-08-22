import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEcheWorkbook } from '../../ingest/eche/parse.js';
import { AmbiguousSheetError, ECHE_COLUMNS, SchemaDriftError } from '../../ingest/eche/schema.js';
import { buildMultiSheetWorkbook, buildWorkbook } from '../helpers/xlsx.js';

const FIXTURE = resolve(process.cwd(), 'src/test/fixtures/eche-sample.xlsx');

function loadFixture(): Buffer {
  return readFileSync(FIXTURE);
}

describe('parseEcheWorkbook', () => {
  it('locates the header on the second row, not the first', async () => {
    const parsed = await parseEcheWorkbook(loadFixture());
    // The real ECHE file has a blank leading row; the fixture reproduces it.
    expect(parsed.headerRowIndex).toBe(1);
  });

  it('exposes exactly the documented ECHE columns', async () => {
    const parsed = await parseEcheWorkbook(loadFixture());
    for (const column of ECHE_COLUMNS) expect(parsed.header).toContain(column);
  });

  it('skips blank padding rows', async () => {
    const parsed = await parseEcheWorkbook(loadFixture());
    expect(parsed.rows.length).toBe(14);
    for (const row of parsed.rows) {
      expect(Object.values(row).some((value) => value !== null)).toBe(true);
    }
  });

  it('preserves non-breaking spaces in raw values (normalisation happens later)', async () => {
    const parsed = await parseEcheWorkbook(loadFixture());
    const codes = parsed.rows.map((row) => row['Erasmus code'] ?? '');
    expect(codes.some((code) => code.includes(String.fromCharCode(0x00a0)))).toBe(true);
  });

  it('maps blank cells to null rather than empty strings', async () => {
    const parsed = await parseEcheWorkbook(loadFixture());
    const noWebsite = parsed.rows.find((row) => row['Proposal Number'] === 'FIXTURE-002');
    expect(noWebsite).toBeDefined();
    expect(noWebsite?.['Website Url']).toBeNull();
  });

  it('retains both rows of the duplicated Erasmus code', async () => {
    const parsed = await parseEcheWorkbook(loadFixture());
    const vigo = parsed.rows.filter((row) => (row['Erasmus code'] ?? '').includes('VIGO13'));
    expect(vigo).toHaveLength(2);
    expect(new Set(vigo.map((row) => row.PIC)).size).toBe(2);
  });

  it('throws SchemaDriftError when a column is missing', async () => {
    const header = ECHE_COLUMNS.filter((column) => column !== 'PIC');
    const workbook = await buildWorkbook([[...header], ['a', 'b', 'c']]);
    await expect(parseEcheWorkbook(workbook)).rejects.toThrow(SchemaDriftError);
  });

  it('throws SchemaDriftError rather than shifting columns when the header is renamed', async () => {
    const header = ECHE_COLUMNS.map((column) =>
      column === 'Erasmus code' ? 'ErasmusCode' : column,
    );
    const workbook = await buildWorkbook([[...header], ECHE_COLUMNS.map(() => 'x')]);
    await expect(parseEcheWorkbook(workbook)).rejects.toThrow(/Erasmus code/);
  });

  it('throws SchemaDriftError when there is no header at all', async () => {
    const workbook = await buildWorkbook([['totally', 'unrelated', 'sheet']]);
    await expect(parseEcheWorkbook(workbook)).rejects.toThrow(SchemaDriftError);
  });
  it('renders dates as deterministic ISO-8601, not machine-locale strings', async () => {
    // The committed fixture must be identical on every machine. Date cells reach
    // the parser as Date objects; String(date) would embed the builder's
    // timezone and locale ("Fri Jan 01 2021 01:00:00 GMT+0100 (heure normale
    // d'Europe centrale)"), so cellToString uses toISOString().
    const parsed = await parseEcheWorkbook(loadFixture());
    const starts = parsed.rows.map((row) => row['Erasmus Eche Start']).filter((v) => v !== null);
    expect(starts.length).toBeGreaterThan(0);
    for (const value of starts) {
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it('reports the name of the sheet it selected', async () => {
    const parsed = await parseEcheWorkbook(loadFixture());
    // The fixture's sheet name differs from the live file's ("Report 2"); the
    // parser selects by header content, so neither name is hardcoded anywhere.
    expect(parsed.sheetName).toBe('Sheet1');
  });

  it('selects the ECHE sheet by content when other sheets come first', async () => {
    const workbook = await buildMultiSheetWorkbook([
      { name: 'Cover', rows: [['Some unrelated preamble', null]] },
      { name: 'Notes', rows: [['Erasmus code', 'but not the rest of the header']] },
      {
        name: 'Report 7',
        rows: [ECHE_COLUMNS.map(() => null), [...ECHE_COLUMNS], ECHE_COLUMNS.map(() => 'x')],
      },
    ]);
    const parsed = await parseEcheWorkbook(workbook);

    expect(parsed.sheetName).toBe('Report 7');
    expect(parsed.headerRowIndex).toBe(1);
    expect(parsed.rows).toHaveLength(1);
  });

  it('fails closed when more than one sheet carries the ECHE header', async () => {
    const echeRows = [[...ECHE_COLUMNS], ECHE_COLUMNS.map(() => 'x')];
    const workbook = await buildMultiSheetWorkbook([
      { name: 'Report 1', rows: echeRows },
      { name: 'Report 2', rows: echeRows },
    ]);

    await expect(parseEcheWorkbook(workbook)).rejects.toThrow(AmbiguousSheetError);
    await expect(parseEcheWorkbook(workbook)).rejects.toThrow(/Report 1, Report 2/);
  });

  it('throws SchemaDriftError when no sheet at all carries the header', async () => {
    const workbook = await buildMultiSheetWorkbook([
      { name: 'One', rows: [['totally', 'unrelated']] },
      { name: 'Two', rows: [['also', 'unrelated']] },
    ]);
    await expect(parseEcheWorkbook(workbook)).rejects.toThrow(SchemaDriftError);
    // The error names every sheet it looked at, so drift is diagnosable.
    await expect(parseEcheWorkbook(workbook)).rejects.toThrow(/sheet "One".*sheet "Two"/s);
  });
});

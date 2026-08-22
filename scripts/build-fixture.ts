#!/usr/bin/env node
/**
 * Regenerates src/test/fixtures/eche-sample.xlsx from a real ECHE spreadsheet.
 *
 * The full official spreadsheet is NOT committed: it is ~850 KB, it changes
 * upstream on its own schedule, and provenance belongs in the database rather
 * than in git. This script documents exactly how the committed fixture was
 * derived so it can be rebuilt and audited.
 *
 * Usage:
 *   npm run fixture:build -- <path-to-real-eche.xlsx>
 *
 * It reuses the production parser and normaliser rather than reimplementing
 * them, so the fixture can never be built against a different understanding of
 * the file than the one the application has.
 *
 * The fixture reproduces the real file's structure faithfully:
 *   - a leading entirely-blank row
 *   - the header on the SECOND row
 *   - non-breaking spaces inside Erasmus codes
 * plus a small number of synthetic edge-case rows for parser/normaliser tests.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import writeXlsxFile from 'write-excel-file/node';
import { parseEcheWorkbook, type RawEcheRow } from '../src/ingest/eche/parse.js';
import { normaliseErasmusCode } from '../src/ingest/eche/normalise.js';
import { ECHE_COLUMNS } from '../src/ingest/eche/schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'src', 'test', 'fixtures', 'eche-sample.xlsx');

/**
 * The fixture's sheet is deliberately NOT called "Report 2" like the live file.
 * The parser selects a sheet by header content, never by name, and a fixture
 * that matched the live name would stop proving that.
 */
const FIXTURE_SHEET_NAME = 'Sheet1';

// Real rows selected to cover the target countries plus the two structural
// oddities verified in the live data.
const WANTED_CODES = [
  // FR / NL / BE / DE coverage
  'F  PARIS001',
  'NL AMSTERD01',
  'B  BRUXEL01',
  'D  BERLIN01',
  // Erasmus-code country prefix disagrees with Country Cd (B... but NL).
  'B  DIEPENB07',
  // The duplicated Erasmus code: two rows, two PIC values.
  'E  VIGO13',
];

/** The duplicated code is the only one for which both rows are kept. */
const DUPLICATED_CODE = normaliseErasmusCode('E  VIGO13');

const NBSP = String.fromCharCode(0x00a0);

type FixtureRow = Array<string | null>;

async function main(): Promise<void> {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error('Usage: npm run fixture:build -- <path-to-real-eche.xlsx>');
    process.exit(1);
  }

  const parsed = await parseEcheWorkbook(readFileSync(sourcePath));
  console.log(
    `Read sheet "${parsed.sheetName}", header on row ${parsed.headerRowIndex}, ${parsed.rows.length} data row(s).`,
  );

  const wanted = new Set(WANTED_CODES.map(normaliseErasmusCode));
  const seenPerCode = new Map<string, number>();
  const picked: FixtureRow[] = [];

  for (const row of parsed.rows as RawEcheRow[]) {
    const code = normaliseErasmusCode(row['Erasmus code'] ?? '');
    if (!wanted.has(code)) continue;
    const seen = seenPerCode.get(code) ?? 0;
    if (seen >= (code === DUPLICATED_CODE ? 2 : 1)) continue;
    seenPerCode.set(code, seen + 1);
    picked.push(ECHE_COLUMNS.map((column) => row[column] ?? null));
  }

  console.log(`Selected ${picked.length} real row(s):`);
  for (const row of picked)
    console.log(`  ${normaliseErasmusCode(row[1] ?? '')}  ${row[8]}  ${row[4]}`);

  // Synthetic edge cases. Marked with an obviously fake proposal number so they
  // can never be confused with real ECHE records.
  const synthetic: FixtureRow[] = [
    // Surrounding whitespace on several fields; scheme-less website.
    [
      'FIXTURE-001',
      `  X${NBSP} WHITESPACE01  `,
      ' 111111111 ',
      ' E10000001 ',
      '  Whitespace University  ',
      ' Main St 1 ',
      ' 1000 ',
      '  Testville  ',
      ' fr ',
      '  www.whitespace-test.fr  ',
      null,
      null,
    ],
    // Missing website entirely.
    [
      'FIXTURE-002',
      `X${NBSP} NOWEB01`,
      '222222222',
      'E10000002',
      'No Website Hogeschool',
      'Straat 2',
      '2000',
      'Amsterdam',
      'NL',
      null,
      null,
      null,
    ],
    // Unparseable website value.
    [
      'FIXTURE-003',
      `X${NBSP} BADURL01`,
      '333333333',
      'E10000003',
      'Bad URL Institute',
      'Rue 3',
      '3000',
      'Brussels',
      'BE',
      'not a url at all',
      null,
      null,
    ],
    // Missing OID (100 such rows exist upstream).
    [
      'FIXTURE-004',
      `X${NBSP} NOOID01`,
      '444444444',
      null,
      'No OID Hochschule',
      'Weg 4',
      '4000',
      'Berlin',
      'DE',
      'https://no-oid-test.de/path',
      null,
      null,
    ],
    // Malformed country code: must be skipped as invalid, never guessed.
    [
      'FIXTURE-005',
      `X${NBSP} BADCC01`,
      '555555555',
      'E10000005',
      'Bad Country Institute',
      'Via 5',
      '5000',
      'Nowhere',
      'XXX',
      'https://bad-cc-test.example',
      null,
      null,
    ],
    // Missing Legal Name: must be skipped as invalid.
    [
      'FIXTURE-006',
      `X${NBSP} NONAME01`,
      '666666666',
      'E10000006',
      null,
      'Calle 6',
      '6000',
      'Madrid',
      'ES',
      'https://no-name-test.example',
      null,
      null,
    ],
    // Deep subdomain, to exercise public-suffix eTLD+1 extraction.
    [
      'FIXTURE-007',
      `X${NBSP} SUBDOM01`,
      '777777777',
      'E10000007',
      'Subdomain University',
      'Road 7',
      '7000',
      'Lyon',
      'FR',
      'https://intl.study.subdomain-test.co.uk/en',
      null,
      null,
    ],
  ];

  const rows: FixtureRow[] = [
    ECHE_COLUMNS.map(() => null), // leading blank row, exactly like the real file
    [...ECHE_COLUMNS],
    ...picked,
    ...synthetic,
  ];

  const data = rows.map((row) =>
    row.map((value) => ({ value: value === null ? null : String(value), type: String })),
  );

  // `sheet`, not `sheetName`: write-excel-file names the single-sheet option
  // `sheet`, and an unknown option is silently ignored rather than rejected.
  const write = writeXlsxFile as unknown as (
    sheet: unknown,
    options: { filePath: string; sheet: string },
  ) => Promise<void>;
  await write(data, { filePath: OUT, sheet: FIXTURE_SHEET_NAME });

  console.log(`
Wrote ${OUT}`);
  console.log(`Total rows written: ${rows.length} (1 blank + 1 header + ${rows.length - 2} data)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

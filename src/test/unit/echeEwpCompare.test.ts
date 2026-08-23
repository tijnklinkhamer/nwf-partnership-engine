/**
 * ECHE <-> EWP coverage measurement.
 *
 * Two things are being proved here. The counting is right, and - more
 * importantly - the measurement never resolves anything: a disagreement stays a
 * disagreement, an ambiguous identifier stays ambiguous, and a domain-shaped
 * string equality never becomes identity evidence.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  compareEcheToEwp,
  gradeOf,
  measureEcheEwpCoverage,
  toComparableHeis,
  toComparableRow,
  type EcheComparableRow,
  type EwpComparableHei,
} from '../../compare/echeEwp.js';

const ECHE_FIXTURE = readFileSync(resolve(process.cwd(), 'src/test/fixtures/eche-sample.xlsx'));
const EWP_FIXTURE = readFileSync(
  resolve(process.cwd(), 'src/test/fixtures/ewp-catalogue-sample.xml'),
);

function echeRow(overrides: Partial<EcheComparableRow> = {}): EcheComparableRow {
  return {
    echeRowKey: 'X A01|1',
    legalName: 'Test',
    countryCode: 'FR',
    erasmusCode: 'X A01',
    pic: '1',
    canonicalDomain: null,
    ...overrides,
  };
}

function ewpHei(overrides: Partial<EwpComparableHei> = {}): EwpComparableHei {
  return {
    heiId: 'a.example',
    heiIdFolded: 'a.example',
    erasmusCodes: [],
    pics: [],
    primaryName: null,
    ...overrides,
  };
}

function ewpSide(heis: EwpComparableHei[]) {
  return { heis, totalHosts: heis.length, emptyOtherIds: 0, nonComparablePics: 0 };
}

/**
 * The fixture-to-fixture report, computed once. measureEcheEwpCoverage is async
 * only because the xlsx parser is, so it is resolved in a top-level beforeAll
 * rather than re-run by every assertion.
 */
let fixtureReport: Awaited<ReturnType<typeof measureEcheEwpCoverage>>;

beforeAll(async () => {
  fixtureReport = await measureEcheEwpCoverage(ECHE_FIXTURE, EWP_FIXTURE);
});

// ---------------------------------------------------------------------------
// Verdict classification
// ---------------------------------------------------------------------------

describe('per-row verdicts', () => {
  it('MATCH_BOTH_AGREE when both identifiers reach the same single HEI', () => {
    const report = compareEcheToEwp(
      [echeRow()],
      ewpSide([ewpHei({ erasmusCodes: ['X A01'], pics: ['1'] })]),
    );
    expect(report.rows[0]?.verdict).toBe('MATCH_BOTH_AGREE');
    expect(report.coverage.bothAgree).toBe(1);
    expect(report.coverage.bothConflict).toBe(0);
  });

  it('MATCH_BOTH_CONFLICT when the two identifiers reach DIFFERENT HEIs', () => {
    const report = compareEcheToEwp(
      [echeRow()],
      ewpSide([
        ewpHei({ heiId: 'by-pic.example', pics: ['1'] }),
        ewpHei({ heiId: 'by-code.example', erasmusCodes: ['X A01'] }),
      ]),
    );
    const row = report.rows[0];
    expect(row?.verdict).toBe('MATCH_BOTH_CONFLICT');
    expect(row?.picHeiIds).toEqual(['by-pic.example']);
    expect(row?.erasmusHeiIds).toEqual(['by-code.example']);
    expect(report.coverage.bothConflict).toBe(1);
    expect(report.conflicts).toHaveLength(1);
  });

  it('MATCH_BOTH_AMBIGUOUS when the sets overlap but one side names several', () => {
    const report = compareEcheToEwp(
      [echeRow()],
      ewpSide([
        ewpHei({ heiId: 'a.example', erasmusCodes: ['X A01'], pics: ['1'] }),
        ewpHei({ heiId: 'b.example', erasmusCodes: ['X A01'] }),
      ]),
    );
    expect(report.rows[0]?.verdict).toBe('MATCH_BOTH_AMBIGUOUS');
    expect(report.rows[0]?.erasmusVerdict).toBe('MATCH_MULTI');
    expect(report.coverage.erasmusAmbiguous).toBe(1);
  });

  it('MATCH_PIC_ONLY and MATCH_ERASMUS_ONLY are kept apart, and are UNIQUE', () => {
    const picOnly = compareEcheToEwp([echeRow()], ewpSide([ewpHei({ pics: ['1'] })]));
    expect(picOnly.rows[0]?.verdict).toBe('MATCH_PIC_ONLY');
    expect(picOnly.rows[0]?.grade).toBe('UNIQUE');
    expect(picOnly.rows[0]?.erasmusVerdict).toBe('NO_MATCH');
    expect(picOnly.coverage.picOnlyUnique).toBe(1);
    expect(picOnly.coverage.picOnlyAmbiguous).toBe(0);

    const codeOnly = compareEcheToEwp([echeRow()], ewpSide([ewpHei({ erasmusCodes: ['X A01'] })]));
    expect(codeOnly.rows[0]?.verdict).toBe('MATCH_ERASMUS_ONLY');
    expect(codeOnly.rows[0]?.grade).toBe('UNIQUE');
    expect(codeOnly.rows[0]?.picVerdict).toBe('NO_MATCH');
    expect(codeOnly.coverage.erasmusOnlyUnique).toBe(1);
    expect(codeOnly.coverage.erasmusOnlyAmbiguous).toBe(0);
  });

  it('a PIC naming TWO HEIs with no other evidence is AMBIGUOUS, not a match', () => {
    // The regression this guards: one matching identifier used to become
    // MATCH_PIC_ONLY whatever its cardinality, so ambiguous evidence was
    // reported as a unique match at row level while the identifier-level
    // verdict still said MATCH_MULTI. The two must agree.
    const report = compareEcheToEwp(
      [echeRow()],
      ewpSide([
        ewpHei({ heiId: 'a.example', pics: ['1'] }),
        ewpHei({ heiId: 'b.example', pics: ['1'] }),
      ]),
    );
    const row = report.rows[0];
    expect(row?.verdict).toBe('MATCH_PIC_ONLY_AMBIGUOUS');
    expect(row?.grade).toBe('AMBIGUOUS');
    expect(row?.picVerdict).toBe('MATCH_MULTI');
    expect(row?.erasmusVerdict).toBe('NO_MATCH');
    expect(row?.picHeiIds).toEqual(['a.example', 'b.example']);
    // It counts as "matched by PIC only" - and as AMBIGUOUS, never UNIQUE.
    expect(report.coverage.matchedByPicOnly).toBe(1);
    expect(report.coverage.picOnlyUnique).toBe(0);
    expect(report.coverage.picOnlyAmbiguous).toBe(1);
    expect(report.classification).toMatchObject({ unique: 0, ambiguous: 1, noMatch: 0 });
    expect(report.ambiguousRows).toHaveLength(1);
  });

  it('an Erasmus code naming TWO HEIs with no other evidence is AMBIGUOUS', () => {
    const report = compareEcheToEwp(
      [echeRow({ pic: null })],
      ewpSide([
        ewpHei({ heiId: 'a.example', erasmusCodes: ['X A01'] }),
        ewpHei({ heiId: 'b.example', erasmusCodes: ['X A01'] }),
      ]),
    );
    const row = report.rows[0];
    expect(row?.verdict).toBe('MATCH_ERASMUS_ONLY_AMBIGUOUS');
    expect(row?.grade).toBe('AMBIGUOUS');
    expect(row?.erasmusVerdict).toBe('MATCH_MULTI');
    // The PIC was absent, so it was never compared. UNKNOWN, not NO_MATCH.
    expect(row?.picVerdict).toBe('UNKNOWN');
    expect(report.coverage.erasmusOnlyUnique).toBe(0);
    expect(report.coverage.erasmusOnlyAmbiguous).toBe(1);
    expect(report.classification).toMatchObject({ unique: 0, ambiguous: 1 });
  });

  it('two ambiguous sides that are disjoint are still a CONFLICT', () => {
    const report = compareEcheToEwp(
      [echeRow()],
      ewpSide([
        ewpHei({ heiId: 'a.example', pics: ['1'] }),
        ewpHei({ heiId: 'b.example', pics: ['1'] }),
        ewpHei({ heiId: 'c.example', erasmusCodes: ['X A01'] }),
        ewpHei({ heiId: 'd.example', erasmusCodes: ['X A01'] }),
      ]),
    );
    const row = report.rows[0];
    expect(row?.verdict).toBe('MATCH_BOTH_CONFLICT');
    expect(row?.grade).toBe('CONFLICT');
    // The ambiguity is still visible at identifier level, where it belongs.
    expect(row?.picVerdict).toBe('MATCH_MULTI');
    expect(row?.erasmusVerdict).toBe('MATCH_MULTI');
    expect(report.classification).toMatchObject({ unique: 0, ambiguous: 0, conflict: 1 });
  });

  it('both sides ambiguous and overlapping is AMBIGUOUS, never AGREE', () => {
    const report = compareEcheToEwp(
      [echeRow()],
      ewpSide([
        ewpHei({ heiId: 'a.example', pics: ['1'], erasmusCodes: ['X A01'] }),
        ewpHei({ heiId: 'b.example', pics: ['1'], erasmusCodes: ['X A01'] }),
      ]),
    );
    expect(report.rows[0]?.verdict).toBe('MATCH_BOTH_AMBIGUOUS');
    expect(report.rows[0]?.grade).toBe('AMBIGUOUS');
    expect(report.classification).toMatchObject({ unique: 0, ambiguous: 1 });
  });

  it('NO_MATCH when neither identifier reaches anything', () => {
    const report = compareEcheToEwp([echeRow()], ewpSide([ewpHei({ pics: ['999'] })]));
    expect(report.rows[0]?.verdict).toBe('NO_MATCH');
    expect(report.coverage.matchedByNeither).toBe(1);
  });

  it('UNKNOWN is never collapsed into NO_MATCH', () => {
    // "we could not look" and "we looked and found nothing" are different
    // findings, and conflating them would overstate the miss rate.
    const report = compareEcheToEwp(
      [echeRow({ pic: null })],
      ewpSide([ewpHei({ erasmusCodes: ['X A01'] })]),
    );
    expect(report.rows[0]?.picVerdict).toBe('UNKNOWN');
    expect(report.rows[0]?.erasmusVerdict).toBe('MATCH');
  });
});

// ---------------------------------------------------------------------------
// No automatic resolution
// ---------------------------------------------------------------------------

describe('no automatic resolution', () => {
  it('reports a conflict without choosing a winner', () => {
    const report = compareEcheToEwp(
      [echeRow()],
      ewpSide([
        ewpHei({ heiId: 'by-pic.example', pics: ['1'] }),
        ewpHei({ heiId: 'by-code.example', erasmusCodes: ['X A01'] }),
      ]),
    );
    const row = report.conflicts[0];
    // Both targets survive in the output. Nothing in the report names a
    // preferred, canonical or resolved institution for this row.
    expect(row?.picHeiIds).toEqual(['by-pic.example']);
    expect(row?.erasmusHeiIds).toEqual(['by-code.example']);
    expect(JSON.stringify(report)).not.toMatch(/"(resolved|canonical|merged|verified)[A-Za-z]*":/);
  });

  it('keeps both HEIs when one identifier is shared by two', () => {
    const report = compareEcheToEwp(
      [echeRow()],
      ewpSide([
        ewpHei({ heiId: 'a.example', pics: ['1'] }),
        ewpHei({ heiId: 'b.example', pics: ['1'] }),
      ]),
    );
    expect(report.rows[0]?.picHeiIds).toEqual(['a.example', 'b.example']);
    expect(report.rows[0]?.picVerdict).toBe('MATCH_MULTI');
    expect(report.ambiguity.ewpPicSharedByMultipleHeis).toEqual([
      { value: '1', heiIds: ['a.example', 'b.example'] },
    ]);
  });

  it('never matches on name similarity', () => {
    const report = compareEcheToEwp(
      [echeRow({ legalName: 'Universite de Paris', erasmusCode: null, pic: null })],
      ewpSide([ewpHei({ heiId: 'paris.fr', primaryName: 'Universite de Paris' })]),
    );
    expect(report.rows[0]?.verdict).toBe('NO_MATCH');
    expect(report.coverage.matchedByEither).toBe(0);
  });

  it('never matches on canonical_domain', () => {
    // Domain equality is measured separately and is explicitly not a match.
    const report = compareEcheToEwp(
      [echeRow({ erasmusCode: null, pic: null, canonicalDomain: 'a.example' })],
      ewpSide([ewpHei({ heiId: 'a.example', heiIdFolded: 'a.example' })]),
    );
    expect(report.rows[0]?.verdict).toBe('NO_MATCH');
    expect(report.coverage.matchedByEither).toBe(0);
    expect(report.domainShapeAnalysis.echeDomainEqualsSomeSchacId).toBe(1);
    expect(report.domainShapeAnalysis.andDidNotIdentifierMatchSameHei).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Domain-shape analysis is analytical only
// ---------------------------------------------------------------------------

describe('domain-shape analysis', () => {
  it('separates domain equality that IS corroborated by an identifier from the rest', () => {
    const report = compareEcheToEwp(
      [
        echeRow({ echeRowKey: 'r1', canonicalDomain: 'a.example' }),
        echeRow({
          echeRowKey: 'r2',
          erasmusCode: null,
          pic: null,
          canonicalDomain: 'b.example',
        }),
      ],
      ewpSide([
        ewpHei({
          heiId: 'a.example',
          heiIdFolded: 'a.example',
          erasmusCodes: ['X A01'],
          pics: ['1'],
        }),
        ewpHei({ heiId: 'b.example', heiIdFolded: 'b.example' }),
      ]),
    );
    expect(report.domainShapeAnalysis).toEqual({
      echeRowsWithCanonicalDomain: 2,
      echeDomainEqualsSomeSchacId: 2,
      andAlsoIdentifierMatchedSameHei: 1,
      andDidNotIdentifierMatchSameHei: 1,
    });
  });

  it('compares case-folded, because the fold is the only transformation applied', () => {
    const report = compareEcheToEwp(
      [echeRow({ erasmusCode: null, pic: null, canonicalDomain: 'upper.example.org' })],
      ewpSide([ewpHei({ heiId: 'upper.Example.ORG', heiIdFolded: 'upper.example.org' })]),
    );
    expect(report.domainShapeAnalysis.echeDomainEqualsSomeSchacId).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

describe('an unusable row stays in the denominator and is never a miss', () => {
  it('unusable rows are counted, not dropped, and are not NO MATCH', () => {
    // The row is not comparable, so it produces no RowComparison - but the
    // denominator this measurement reports is the ARTIFACT, not the subset of
    // it that could be read. Folding it into NO MATCH would claim EWP was
    // searched for it, which never happened.
    const report = compareEcheToEwp([echeRow()], ewpSide([ewpHei({ pics: ['1'] })]), 4);
    expect(report.eche.totalSourceRows).toBe(5);
    expect(report.eche.comparableRows).toBe(1);
    expect(report.eche.unusableRows).toBe(4);
    expect(report.rows).toHaveLength(1);
    expect(report.coverage.matchedByNeither).toBe(0);
    expect(report.classification).toEqual({
      totalSourceRows: 5,
      unique: 1,
      ambiguous: 0,
      conflict: 0,
      noMatch: 0,
      unusable: 4,
    });
  });
});

describe('coverage arithmetic', () => {
  it('either = pic + erasmus - both, and either + neither = COMPARABLE rows', () => {
    const c = fixtureReport.coverage;
    expect(c.matchedByEither).toBe(c.matchedByPic + c.matchedByErasmus - c.matchedByBoth);
    // Note the denominator: the identifier counters range over the rows that
    // could be compared. The full-artifact denominator is `classification`.
    expect(c.matchedByEither + c.matchedByNeither).toBe(fixtureReport.eche.comparableRows);
  });

  it('the classification partitions EVERY ECHE source row', () => {
    const k = fixtureReport.classification;
    expect(k.unique + k.ambiguous + k.conflict + k.noMatch + k.unusable).toBe(k.totalSourceRows);
    expect(k.totalSourceRows).toBe(fixtureReport.eche.totalSourceRows);
    expect(fixtureReport.eche.comparableRows + fixtureReport.eche.unusableRows).toBe(
      fixtureReport.eche.totalSourceRows,
    );
    // The fixture carries an intentionally unusable row; it must be visible.
    expect(k.unusable).toBeGreaterThan(0);
    expect(k.noMatch).toBe(fixtureReport.coverage.matchedByNeither);
  });

  it('pic-only + erasmus-only + both = either', () => {
    const c = fixtureReport.coverage;
    expect(c.matchedByPicOnly + c.matchedByErasmusOnly + c.matchedByBoth).toBe(c.matchedByEither);
  });

  it('the one-sided counters split cleanly into unique and ambiguous', () => {
    const c = fixtureReport.coverage;
    expect(c.picOnlyUnique + c.picOnlyAmbiguous).toBe(c.matchedByPicOnly);
    expect(c.erasmusOnlyUnique + c.erasmusOnlyAmbiguous).toBe(c.matchedByErasmusOnly);
  });

  it('unique is exactly the agreeing and singular rows, and nothing else', () => {
    const c = fixtureReport.coverage;
    expect(fixtureReport.classification.unique).toBe(
      c.bothAgree + c.picOnlyUnique + c.erasmusOnlyUnique,
    );
    expect(fixtureReport.classification.ambiguous).toBe(
      c.bothAmbiguous + c.picOnlyAmbiguous + c.erasmusOnlyAmbiguous,
    );
    expect(fixtureReport.classification.conflict).toBe(c.bothConflict);
  });

  it('every row grades consistently with its verdict', () => {
    for (const row of fixtureReport.rows) {
      expect(row.grade).toBe(gradeOf(row.verdict));
      // A row graded UNIQUE can never carry an ambiguous identifier verdict.
      if (row.grade === 'UNIQUE') {
        expect(row.picVerdict).not.toBe('MATCH_MULTI');
        expect(row.erasmusVerdict).not.toBe('MATCH_MULTI');
      }
    }
  });

  it('agree + conflict + ambiguous = both', () => {
    const c = fixtureReport.coverage;
    expect(c.bothAgree + c.bothConflict + c.bothAmbiguous).toBe(c.matchedByBoth);
  });

  it('reverse coverage partitions the EWP side', () => {
    const { reverse, ewp } = fixtureReport;
    expect(reverse.heisMatchedByAnyEcheRow + reverse.heisNotMatchedByAnyEcheRow).toBe(
      ewp.totalHeis,
    );
  });
});

describe('the committed fixtures end to end', () => {
  it('produces the expected classification of every row', () => {
    const report = fixtureReport;

    // ALL data rows in the fixture workbook, including the one that cannot be
    // compared. This is the denominator, and it does not shrink.
    expect(report.eche.totalSourceRows).toBe(14);
    expect(report.eche.comparableRows).toBe(13);
    // One fixture row has no Legal Name and cannot become a comparable row.
    expect(report.eche.unusableRows).toBe(1);
    expect(report.ewp.totalHeis).toBe(18);
    expect(report.ewp.totalHosts).toBe(5);

    expect(report.coverage).toMatchObject({
      matchedByPic: 9,
      matchedByErasmus: 9,
      matchedByBoth: 8,
      matchedByPicOnly: 1,
      matchedByErasmusOnly: 1,
      matchedByEither: 10,
      matchedByNeither: 3,
      bothAgree: 6,
      bothConflict: 1,
      bothAmbiguous: 1,
    });
  });

  it('finds exactly the one seeded conflict', () => {
    const report = fixtureReport;
    expect(report.conflicts).toHaveLength(1);
    const conflict = report.conflicts[0];
    expect(conflict?.erasmusCode).toBe('F PARIS001');
    expect(conflict?.picHeiIds).toEqual(['conflict-by-pic.example']);
    expect(conflict?.erasmusHeiIds).toEqual(['conflict-by-erasmus.example']);
  });

  it('counts EWP identifiers that could not be compared', () => {
    const report = fixtureReport;
    expect(report.ewp.emptyOtherIds).toBe(1);
    expect(report.ewp.nonComparablePics).toBe(2);
  });

  it('reports the ECHE duplicate Erasmus code without merging the two rows', () => {
    const report = fixtureReport;
    expect(report.ambiguity.echeErasmusSharedByMultipleRows).toEqual([
      { value: 'E VIGO13', heiIds: ['E VIGO13|863274975', 'E VIGO13|947711147'] },
    ]);
    // Both rows are still present and still counted separately.
    expect(report.rows.filter((row) => row.erasmusCode === 'E VIGO13')).toHaveLength(2);
  });

  it('collapses whitespace variants of one EWP code but not distinct codes', () => {
    const report = fixtureReport;
    expect(report.ambiguity.ewpHeisWithMultipleErasmusCodes).toEqual([
      { heiId: 'multi-code.example', values: ['X WHITESPACE01', 'ZZ OTHER01'] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Row extraction
// ---------------------------------------------------------------------------

describe('toComparableRow', () => {
  it('counts a row with a malformed country code rather than discarding it', () => {
    // Phase 1A's normaliseRow throws on this row. The measurement denominator
    // is every data row in the artifact, so it must still be counted.
    const row = toComparableRow({
      'Erasmus code': 'X  BADCC01',
      'Legal Name': 'Bad Country Institute',
      'Country Cd': 'XXX',
      PIC: '555555555',
    });
    expect(row?.countryCode).toBe('XXX');
    expect(row?.erasmusCode).toBe('X BADCC01');
  });

  it('returns null only when the row has no code or no name', () => {
    expect(toComparableRow({ 'Erasmus code': null, 'Legal Name': 'X' })).toBeNull();
    expect(toComparableRow({ 'Erasmus code': 'X  A01', 'Legal Name': null })).toBeNull();
  });

  it('gives a non-digit ECHE PIC no comparison value', () => {
    const row = toComparableRow({
      'Erasmus code': 'X  A01',
      'Legal Name': 'X',
      PIC: 'not-a-pic',
    });
    expect(row?.pic).toBeNull();
  });
});

describe('toComparableHeis', () => {
  it('exposes distinct comparison values per HEI', () => {
    const { heis } = toComparableHeis(EWP_FIXTURE);
    const multi = heis.find((hei) => hei.heiId === 'multi-code.example');
    expect(multi?.erasmusCodes).toEqual(['X WHITESPACE01', 'ZZ OTHER01']);
  });

  it('drops no HEI even when it publishes nothing comparable', () => {
    const { heis } = toComparableHeis(EWP_FIXTURE);
    const nonconforming = heis.find((hei) => hei.heiId === 'nonconforming-pic.example');
    expect(nonconforming).toBeDefined();
    expect(nonconforming?.pics).toEqual([]);
  });
});

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

  it('MATCH_PIC_ONLY and MATCH_ERASMUS_ONLY are kept apart', () => {
    const picOnly = compareEcheToEwp([echeRow()], ewpSide([ewpHei({ pics: ['1'] })]));
    expect(picOnly.rows[0]?.verdict).toBe('MATCH_PIC_ONLY');
    expect(picOnly.rows[0]?.erasmusVerdict).toBe('NO_MATCH');

    const codeOnly = compareEcheToEwp([echeRow()], ewpSide([ewpHei({ erasmusCodes: ['X A01'] })]));
    expect(codeOnly.rows[0]?.verdict).toBe('MATCH_ERASMUS_ONLY');
    expect(codeOnly.rows[0]?.picVerdict).toBe('NO_MATCH');
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

describe('coverage arithmetic', () => {
  it('either = pic + erasmus - both, and either + neither = total', () => {
    const c = fixtureReport.coverage;
    expect(c.matchedByEither).toBe(c.matchedByPic + c.matchedByErasmus - c.matchedByBoth);
    expect(c.matchedByEither + c.matchedByNeither).toBe(fixtureReport.eche.totalRows);
  });

  it('pic-only + erasmus-only + both = either', () => {
    const c = fixtureReport.coverage;
    expect(c.matchedByPicOnly + c.matchedByErasmusOnly + c.matchedByBoth).toBe(c.matchedByEither);
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

    expect(report.eche.totalRows).toBe(13);
    // One fixture row has no Legal Name and cannot become a comparable row.
    expect(report.eche.invalidRows).toBe(1);
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

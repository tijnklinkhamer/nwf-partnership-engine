import { describe, expect, it } from 'vitest';
import {
  blankToNull,
  canonicalDomain,
  echeRowKey,
  normaliseCountryCode,
  normaliseErasmusCode,
  normaliseRow,
  normaliseWebsiteUrl,
  RowValidationError,
} from '../../ingest/eche/normalise.js';
import type { RawEcheRow } from '../../ingest/eche/parse.js';

const NBSP = String.fromCharCode(0x00a0);

function row(overrides: Partial<RawEcheRow> = {}): RawEcheRow {
  return {
    'Proposal Number': '101000000',
    'Erasmus code': `F${NBSP} PARIS001`,
    PIC: '999999999',
    OID: 'E10000000',
    'Legal Name': 'Universite de Test',
    Street: 'Rue de Test 1',
    'Post Cd': '75001',
    City: 'Paris',
    'Country Cd': 'FR',
    'Website Url': 'www.test.fr',
    'Erasmus Eche Start': '2021-01-01T00:00:00.000Z',
    'Erasmus Eche End': '2029-12-31T00:00:00.000Z',
    ...overrides,
  };
}

describe('normaliseErasmusCode', () => {
  it('maps non-breaking spaces to ordinary spaces', () => {
    expect(normaliseErasmusCode(`E${NBSP} VIGO13`)).toBe('E VIGO13');
  });

  it('collapses whitespace runs, trims and uppercases', () => {
    expect(normaliseErasmusCode('  a  \t badenn01  ')).toBe('A BADENN01');
  });

  it('is idempotent', () => {
    const once = normaliseErasmusCode(`A${NBSP} GRAZ01`);
    expect(normaliseErasmusCode(once)).toBe(once);
  });

  it('keeps hyphens, which occur in real codes', () => {
    expect(normaliseErasmusCode(`CZ${NBSP} PRAHA-07`)).toBe('CZ PRAHA-07');
  });

  it('does not merge codes that differ by more than whitespace', () => {
    expect(normaliseErasmusCode('F PARIS001')).not.toBe(normaliseErasmusCode('F PARIS002'));
  });
});

describe('blankToNull', () => {
  it.each([
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
    ['  value  ', 'value'],
  ])('maps %j to %j', (input, expected) => {
    expect(blankToNull(input as string | null | undefined)).toBe(expected);
  });
});

describe('normaliseCountryCode', () => {
  it('uppercases a valid alpha-2 code', () => {
    expect(normaliseCountryCode('fr')).toBe('FR');
  });

  it('returns null for a malformed code rather than guessing', () => {
    expect(normaliseCountryCode('XXX')).toBeNull();
    expect(normaliseCountryCode('F')).toBeNull();
    expect(normaliseCountryCode('12')).toBeNull();
    expect(normaliseCountryCode(null)).toBeNull();
  });
});

describe('normaliseWebsiteUrl', () => {
  it('adds a scheme to bare hostnames (4271 such rows exist upstream)', () => {
    expect(normaliseWebsiteUrl('www.uni-graz.at')).toBe('https://www.uni-graz.at/');
  });

  it('preserves an existing scheme', () => {
    expect(normaliseWebsiteUrl('http://www.fhv.at')).toBe('http://www.fhv.at/');
  });

  it('returns null for unparseable input rather than inventing a URL', () => {
    expect(normaliseWebsiteUrl('not a url at all')).toBeNull();
    expect(normaliseWebsiteUrl('')).toBeNull();
    expect(normaliseWebsiteUrl(null)).toBeNull();
  });

  it('rejects non-http(s) schemes', () => {
    expect(normaliseWebsiteUrl('ftp://files.example.com')).toBeNull();
    expect(normaliseWebsiteUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects hostnames without a dot', () => {
    expect(normaliseWebsiteUrl('localhost')).toBeNull();
  });
});

describe('canonicalDomain', () => {
  it('extracts the registrable domain', () => {
    expect(canonicalDomain('https://www.uni-graz.at/en')).toBe('uni-graz.at');
  });

  it('handles multi-label public suffixes', () => {
    expect(canonicalDomain('https://intl.study.example.co.uk/en')).toBe('example.co.uk');
  });

  it('returns null when there is no url', () => {
    expect(canonicalDomain(null)).toBeNull();
  });
});

describe('echeRowKey', () => {
  it('separates the code from the PIC', () => {
    expect(echeRowKey('E VIGO13', '863274975')).toBe('E VIGO13|863274975');
  });

  it('distinguishes the two real VIGO13 rows', () => {
    expect(echeRowKey('E VIGO13', '863274975')).not.toBe(echeRowKey('E VIGO13', '947711147'));
  });

  it('tolerates a missing PIC', () => {
    // PIC is non-blank on all 6139 live rows, but the column is nullable, so the
    // key is still defined for a null. It stays a SOURCE-ROW key either way.
    expect(echeRowKey('X TEST01', null)).toBe('X TEST01|');
  });

  it('treats a blank PIC and a null PIC as the same source row', () => {
    // normaliseRow blank-to-nulls PIC before building the key, so an upstream
    // change from "" to NULL must not fork one source row into two.
    expect(normaliseRow(row({ PIC: '   ' })).echeRowKey).toBe(
      normaliseRow(row({ PIC: null })).echeRowKey,
    );
  });

  it('is deterministic for the same input', () => {
    expect(normaliseRow(row()).echeRowKey).toBe(normaliseRow(row()).echeRowKey);
  });
});

describe('eche_row_key collision safety', () => {
  it('rejects an Erasmus code containing the key delimiter', () => {
    // Guards the only way two different rows could produce one key:
    // ("A|B", "1") and ("A", "B|1") would otherwise both yield "A|B|1".
    expect(() => normaliseRow(row({ 'Erasmus code': 'A|B' }))).toThrow(RowValidationError);
    expect(() => normaliseRow(row({ 'Erasmus code': 'A|B' }))).toThrow(/delimiter/);
  });

  it('rejects a PIC containing the key delimiter', () => {
    expect(() => normaliseRow(row({ PIC: 'B|1' }))).toThrow(RowValidationError);
  });

  it('keys two rows differing only in PIC apart', () => {
    const a = normaliseRow(row({ PIC: '863274975' }));
    const b = normaliseRow(row({ PIC: '947711147' }));
    expect(a.echeRowKey).not.toBe(b.echeRowKey);
  });

  it('keys two rows differing only in Erasmus code apart', () => {
    const a = normaliseRow(row({ 'Erasmus code': `E${NBSP} VIGO13` }));
    const b = normaliseRow(row({ 'Erasmus code': `E${NBSP} VIGO14` }));
    expect(a.echeRowKey).not.toBe(b.echeRowKey);
  });

  it('collapses only the whitespace forms the normaliser is documented to collapse', () => {
    // NBSP and ordinary space are the same source row; nothing else is merged.
    expect(normaliseRow(row({ 'Erasmus code': `F${NBSP} PARIS001` })).echeRowKey).toBe(
      normaliseRow(row({ 'Erasmus code': 'f  paris001' })).echeRowKey,
    );
    expect(normaliseRow(row({ 'Erasmus code': 'F PARIS001' })).echeRowKey).not.toBe(
      normaliseRow(row({ 'Erasmus code': 'FPARIS001' })).echeRowKey,
    );
  });
});

describe('normaliseRow', () => {
  it('maps a well-formed row', () => {
    const result = normaliseRow(row());
    expect(result).toMatchObject({
      erasmusCode: 'F PARIS001',
      countryCode: 'FR',
      city: 'Paris',
      legalName: 'Universite de Test',
      displayName: 'Universite de Test',
      websiteUrl: 'https://www.test.fr/',
      canonicalDomain: 'test.fr',
      orgType: 'higher_education_institution',
    });
  });

  it('never derives country from the Erasmus code prefix', () => {
    // Real case: "B<NBSP> DIEPENB07" is in the Netherlands.
    const result = normaliseRow(row({ 'Erasmus code': `B${NBSP} DIEPENB07`, 'Country Cd': 'NL' }));
    expect(result.erasmusCode).toBe('B DIEPENB07');
    expect(result.countryCode).toBe('NL');
  });

  it('throws for a missing Erasmus code', () => {
    expect(() => normaliseRow(row({ 'Erasmus code': null }))).toThrow(RowValidationError);
  });

  it('throws for a missing Legal Name', () => {
    expect(() => normaliseRow(row({ 'Legal Name': null }))).toThrow(RowValidationError);
  });

  it('throws for a malformed country code instead of guessing one', () => {
    expect(() => normaliseRow(row({ 'Country Cd': 'XXX' }))).toThrow(RowValidationError);
  });

  it('keeps a missing website as null rather than inferring one from the name', () => {
    const result = normaliseRow(row({ 'Website Url': null }));
    expect(result.websiteUrl).toBeNull();
    expect(result.canonicalDomain).toBeNull();
  });

  it('keeps a missing OID as null (100 such rows exist upstream)', () => {
    expect(normaliseRow(row({ OID: null })).oid).toBeNull();
  });
});

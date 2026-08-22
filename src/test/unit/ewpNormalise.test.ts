/**
 * EWP normalisation.
 *
 * The property under test throughout: a comparison value exists ONLY where a
 * deterministic, justified rule exists, and the published value is never
 * altered, repaired or lost.
 */
import { describe, expect, it } from 'vitest';
import {
  comparableValues,
  foldHeiId,
  foldIdType,
  normaliseHei,
  normaliseOtherIdValue,
  normalisePic,
} from '../../ingest/ewp/normalise.js';
import { normaliseErasmusCode } from '../../ingest/eche/normalise.js';
import type { EwpHeiEntry } from '../../ingest/ewp/parse.js';

const NBSP = String.fromCharCode(0x00a0);

function hei(overrides: Partial<EwpHeiEntry> = {}): EwpHeiEntry {
  return {
    documentIndex: 0,
    heiId: 'a.example',
    names: [],
    otherIds: [],
    ...overrides,
  };
}

describe('foldIdType', () => {
  it('folds case for grouping', () => {
    expect(foldIdType('OID')).toBe('oid');
    expect(foldIdType('  Erasmus  ')).toBe('erasmus');
  });
});

describe('foldHeiId', () => {
  it('folds case and trims', () => {
    expect(foldHeiId('  upper.Example.ORG ')).toBe('upper.example.org');
  });

  it('changes nothing else about the identifier', () => {
    // Folding is not parsing. A SCHAC id that is plainly not a hostname passes
    // through unchanged apart from case.
    expect(foldHeiId('0740047Z.educonnect.education.gouv.fr')).toBe(
      '0740047z.educonnect.education.gouv.fr',
    );
  });
});

describe('normalisePic', () => {
  it('trims surrounding whitespace, which is deterministic', () => {
    expect(normalisePic(' 888888888 ')).toBe('888888888');
  });

  it('refuses to repair scientific notation', () => {
    // The live catalogue publishes this. "9.9958762E8" is almost certainly
    // 999587620, but almost certainly is not a basis for an official id.
    expect(normalisePic('9.9958762E8')).toBeNull();
  });

  it('refuses to repair a truncated decimal', () => {
    expect(normalisePic('9.99630009')).toBeNull();
  });

  it('refuses an OID published in a PIC slot', () => {
    expect(normalisePic('E10158141')).toBeNull();
  });

  it('accepts a plain digit string unchanged', () => {
    expect(normalisePic('999831575')).toBe('999831575');
  });
});

describe('normaliseOtherIdValue', () => {
  it('normalises an Erasmus code with the repository-wide rule', () => {
    expect(normaliseOtherIdValue('erasmus', 'F  THONON03')).toBe('F THONON03');
  });

  it('maps EWP double-space padding and ECHE NBSP padding onto one value', () => {
    // This equivalence is the whole reason the two sources are comparable.
    expect(normaliseOtherIdValue('erasmus', 'B  BRUXEL01')).toBe(
      normaliseErasmusCode(`B${NBSP} BRUXEL01`),
    );
  });

  it('normalises a PIC', () => {
    expect(normaliseOtherIdValue('pic', ' 123 ')).toBe('123');
  });

  it('produces NO comparison value for a type with no justified rule', () => {
    for (const type of ['erasmus-charter', 'euc', 'eche', 'oid', 'local']) {
      expect(normaliseOtherIdValue(type, 'whatever')).toBeNull();
    }
  });

  it('produces NO comparison value for an unknown type rather than inventing one', () => {
    expect(normaliseOtherIdValue('brand-new-type', 'whatever')).toBeNull();
  });
});

describe('normaliseHei', () => {
  it('keeps the raw value beside the comparison value', () => {
    const normalised = normaliseHei(hei({ otherIds: [{ type: 'erasmus', value: 'B  BRUXEL01' }] }));
    expect(normalised.otherIds[0]).toEqual({
      ordinal: 0,
      type: 'erasmus',
      typeFolded: 'erasmus',
      value: 'B  BRUXEL01',
      valueNormalised: 'B BRUXEL01',
    });
  });

  it('keeps a non-conforming PIC and gives it no comparison value', () => {
    const normalised = normaliseHei(hei({ otherIds: [{ type: 'pic', value: 'E10158141' }] }));
    expect(normalised.otherIds[0]?.value).toBe('E10158141');
    expect(normalised.otherIds[0]?.valueNormalised).toBeNull();
  });

  it('numbers identifiers in document order', () => {
    const normalised = normaliseHei(
      hei({
        otherIds: [
          { type: 'erasmus', value: 'X  A01' },
          { type: 'pic', value: '1' },
        ],
      }),
    );
    expect(normalised.otherIds.map((o) => o.ordinal)).toEqual([0, 1]);
  });
});

describe('comparableValues', () => {
  it('collapses whitespace variants of one code into a single value', () => {
    const normalised = normaliseHei(
      hei({
        otherIds: [
          { type: 'erasmus', value: 'A  WIENER01' },
          { type: 'erasmus', value: 'A WIENER01' },
        ],
      }),
    );
    expect(comparableValues(normalised, 'erasmus')).toEqual(['A WIENER01']);
  });

  it('keeps genuinely different codes apart and picks no winner', () => {
    // Montenegro's old and new country prefixes, both published by ucg.ac.me.
    const normalised = normaliseHei(
      hei({
        otherIds: [
          { type: 'erasmus', value: 'CG PODGORICA01' },
          { type: 'erasmus', value: 'ME PODGORI02' },
        ],
      }),
    );
    expect(comparableValues(normalised, 'erasmus')).toEqual(['CG PODGORICA01', 'ME PODGORI02']);
  });

  it('excludes identifiers that have no comparison value', () => {
    const normalised = normaliseHei(
      hei({
        otherIds: [
          { type: 'pic', value: '9.9958762E8' },
          { type: 'pic', value: '123456789' },
        ],
      }),
    );
    expect(comparableValues(normalised, 'pic')).toEqual(['123456789']);
  });

  it('returns an empty list rather than null when the type is absent', () => {
    expect(comparableValues(normaliseHei(hei()), 'pic')).toEqual([]);
  });
});

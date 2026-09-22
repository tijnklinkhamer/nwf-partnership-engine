/**
 * PHASE 2B-2D A3 R10 — PURE SET_R EXACT-DECIMAL K1/K2 SCORE REDUCER.
 *
 * Synthetic data only. Proves, against the real `a3prep/setRScore.ts`:
 *
 *   - numeric(8,4) decimal validation, canonicalisation and exact comparison,
 *     with no binary floating point in the implementation or the reference;
 *   - K1 MAX across the two required tracks and K2 MAX across source rows,
 *     signed and unclamped, equal to the joint MAX over all observations;
 *   - every integrity defect refuses rather than repairs;
 *   - multiplicity is idempotent, input order is irrelevant, provenance is
 *     complete, and no winning source becomes a representative;
 *   - the resolved score is bound to the canonical K1/K2 record hashes, and
 *     the tests themselves fail if the bound owner semantics change.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  K1_OWNER_DECISION,
  K2_OWNER_DECISION,
  SET_R_BOUND_SIGNAL_RULE_VERSION,
  SET_R_DOCUMENT_SCORE_SEMANTICS,
  SET_R_DUPLICATE_MULTIPLICITY_POLICY,
  SET_R_EXACT_DOCUMENT_REPRESENTATIVE_POLICY,
  SET_R_EXACT_DOCUMENT_SCORE_POLICY,
  SET_R_RANK_WITHIN_ROOT_ROLE,
  SET_R_REQUIRED_TRACKS,
  SET_R_SIGNED_SCORE_POLICY,
  SET_R_TRACK_REDUCTION_POLICY,
} from '../harness/phase2b2d/a3prep/contracts.js';
import {
  A3_SET_R_DOCUMENT_SCORE_PREPARATION_KIND,
  A3SetRScoreRefusal,
  type A3SetRDocumentScoreInput,
  type A3SetRScoreRefusalCode,
  type A3SetRSourcePageScoreInput,
  canonicaliseNumeric84Decimal,
  compareNumeric84Decimal,
  prepareSetRDocumentScore,
} from '../harness/phase2b2d/a3prep/setRScore.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3PageEvidenceId,
  A3SelectionIndex,
  A3TrackCandidateObservation,
} from '../harness/phase2b2d/a3prep/types.js';

// ---------------------------------------------------------------------------
// Synthetic builders
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const SHA = 'a'.repeat(64) as A3DocumentSha256;
const OTHER_SHA = 'b'.repeat(64) as A3DocumentSha256;

const pid = (n: number): A3PageEvidenceId => `page-${n}` as A3PageEvidenceId;

function obs(
  page: A3PageEvidenceId,
  track: string,
  score: string,
  ruleVersion: string = SET_R_BOUND_SIGNAL_RULE_VERSION,
): A3TrackCandidateObservation {
  return { pageEvidenceId: page, track, candidateScoreDecimal: score, ruleVersion } as never;
}

function row(page: A3PageEvidenceId, a: string, b: string): A3SetRSourcePageScoreInput {
  return {
    pageEvidenceId: page,
    documentSha256: SHA,
    candidateObservations: [obs(page, 'INTERNATIONAL_OFFICE', a), obs(page, 'LANGUAGE_CENTRE', b)],
  };
}

function doc(ids: readonly A3PageEvidenceId[]): A3DistinctDocument {
  return {
    selectionIndex: 0 as A3SelectionIndex,
    split: 'DEV_TRAIN',
    documentSha256: SHA,
    sourcePageEvidenceIds: ids,
  };
}

/** Rows given as [trackA, trackB] per source page, pages numbered 1..N. */
function input(scores: readonly (readonly [string, string])[]): A3SetRDocumentScoreInput {
  const ids = scores.map((_, i) => pid(i + 1));
  return { document: doc(ids), sourceRows: scores.map(([a, b], i) => row(pid(i + 1), a, b)) };
}

function refusalOf(fn: () => unknown): A3SetRScoreRefusal {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(A3SetRScoreRefusal);
    return error as A3SetRScoreRefusal;
  }
  throw new Error('expected a refusal');
}

const scoreOf = (i: A3SetRDocumentScoreInput): string =>
  prepareSetRDocumentScore(i).resolvedScore.resolvedScoreDecimal;

// ---------------------------------------------------------------------------
// A float-free test-side reference: decimal text -> exact integer 0.0001 units.
// Deliberately written differently from the implementation (string surgery
// over a split on '.'), and used only for plain inputs the tests construct.
// ---------------------------------------------------------------------------

function referenceUnits(text: string): bigint {
  const negative = text.startsWith('-');
  const body = text.replace(/^[+-]/, '');
  const [whole = '0', fraction = ''] = body.split('.');
  const four = (fraction + '0000').slice(0, 4);
  const magnitude = BigInt(whole) * 10000n + BigInt(four);
  return negative ? -magnitude : magnitude;
}

function referenceMax(values: readonly string[]): bigint {
  return values.map(referenceUnits).reduce((m, v) => (v > m ? v : m));
}

// ---------------------------------------------------------------------------
// 0. Owner binding
// ---------------------------------------------------------------------------

describe('2D-A3 R10: bound to the current K1/K2 owner semantics', () => {
  it('K1 is MAX over exactly Track A and Track B under orgunit-signal-rules-v1, signed', () => {
    expect(SET_R_TRACK_REDUCTION_POLICY).toBe('MAX_TRACK_SCORE');
    expect(K1_OWNER_DECISION.reducer).toBe(SET_R_TRACK_REDUCTION_POLICY);
    expect([...SET_R_REQUIRED_TRACKS]).toEqual(['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE']);
    expect(K1_OWNER_DECISION.requiredTracks).toBe(SET_R_REQUIRED_TRACKS);
    expect(SET_R_BOUND_SIGNAL_RULE_VERSION).toBe('orgunit-signal-rules-v1');
    expect(SET_R_SIGNED_SCORE_POLICY).toBe('PRESERVE_SIGNED_PERSISTED_VALUE');
    expect(SET_R_RANK_WITHIN_ROOT_ROLE).toBe('NOT_A_SET_R_RANK_INPUT');
    expect(K1_OWNER_DECISION.decisionToken).toBe('K1_SET_R_TRACK_SCORE_MAX_V1');
  });

  it('K2 is MAX over source rows, no representative, idempotent, joint MAX semantics', () => {
    expect(SET_R_EXACT_DOCUMENT_SCORE_POLICY).toBe('MAX_K1_PAGE_SCORE_ACROSS_SOURCE_ROWS');
    expect(K2_OWNER_DECISION.reducer).toBe(SET_R_EXACT_DOCUMENT_SCORE_POLICY);
    expect(SET_R_EXACT_DOCUMENT_REPRESENTATIVE_POLICY).toBe(
      'NO_PAGE_EVIDENCE_REPRESENTATIVE_IS_CANONICAL_FOR_SET_R',
    );
    expect(K2_OWNER_DECISION.representativePolicy).toBe(SET_R_EXACT_DOCUMENT_REPRESENTATIVE_POLICY);
    expect(SET_R_DOCUMENT_SCORE_SEMANTICS).toBe(
      'SET_R_DOCUMENT_SCORE_MAX_PERSISTED_SIGNAL_EVIDENCE_V1',
    );
    expect(K2_OWNER_DECISION.jointSemantics).toBe(SET_R_DOCUMENT_SCORE_SEMANTICS);
    expect(SET_R_DUPLICATE_MULTIPLICITY_POLICY).toBe('IDEMPOTENT_NO_MULTIPLICITY_WEIGHT');
    expect(K2_OWNER_DECISION.duplicateMultiplicity).toBe(SET_R_DUPLICATE_MULTIPLICITY_POLICY);
    expect(K2_OWNER_DECISION.boundK1DecisionRecordSha256).toBe(
      K1_OWNER_DECISION.decisionRecordSha256,
    );
  });
});

// ---------------------------------------------------------------------------
// 1. Decimals
// ---------------------------------------------------------------------------

describe('2D-A3 R10: numeric(8,4) decimal validation and canonical form', () => {
  it.each([
    ['0', '0.0000'],
    ['-0', '0.0000'],
    ['+0', '0.0000'],
    ['0.0', '0.0000'],
    ['0.0000', '0.0000'],
    ['-0.0000', '0.0000'],
    ['1', '1.0000'],
    ['+1', '1.0000'],
    ['001.2', '1.2000'],
    ['1.2300', '1.2300'],
    ['1.23000', '1.2300'],
    ['-12.34', '-12.3400'],
    ['-0.0001', '-0.0001'],
    ['9999.9999', '9999.9999'],
    ['-9999.9999', '-9999.9999'],
    ['09999.99990000', '9999.9999'],
  ])('accepts %j as %j', (text, canonical) => {
    expect(canonicaliseNumeric84Decimal(text)).toBe(canonical);
  });

  it('treats 1.2, 1.20, 1.2000 and 01.20000 as one value', () => {
    const spellings = ['1.2', '1.20', '1.2000', '01.20000'];
    for (const s of spellings) expect(canonicaliseNumeric84Decimal(s)).toBe('1.2000');
    for (const l of spellings)
      for (const r of spellings) expect(compareNumeric84Decimal(l, r)).toBe(0);
  });

  it.each([
    ['', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    [' ', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    [' 1', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['1 ', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['1 .5', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['.5', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['1.', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['1e3', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['1E3', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['NaN', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['Infinity', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['-Infinity', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['1,2', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['1_000', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['--1', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['+-1', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['-', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['+', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['0x10', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['１', 'MALFORMED_PERSISTED_SCORE_VALUE'],
    ['1.23451', 'PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN'],
    ['0.00001', 'PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN'],
    ['10000', 'PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN'],
    ['-10000', 'PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN'],
    ['10000.0000', 'PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN'],
    ['99999999999999999999', 'PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN'],
  ])('refuses %j with %s and never echoes it', (text, code) => {
    const refusal = refusalOf(() => canonicaliseNumeric84Decimal(text));
    expect(refusal.code).toBe(code);
    if (text.trim().length > 0) expect(refusal.message).not.toContain(text.trim());
  });

  it('refuses non-string values', () => {
    for (const value of [1, 1.5, null, undefined, 10n, {}, []]) {
      expect(refusalOf(() => canonicaliseNumeric84Decimal(value as never)).code).toBe(
        'MALFORMED_PERSISTED_SCORE_VALUE',
      );
    }
  });

  it('orders negative < zero < positive, including adjacent resolution steps', () => {
    const ascending = [
      '-9999.9999',
      '-2',
      '-0.0001',
      '0',
      '0.0001',
      '1.0000',
      '1.0001',
      '9999.9999',
    ];
    for (let i = 0; i < ascending.length; i += 1) {
      for (let j = 0; j < ascending.length; j += 1) {
        const expected = i < j ? -1 : i > j ? 1 : 0;
        expect(compareNumeric84Decimal(ascending[i]!, ascending[j]!), `${i} ${j}`).toBe(expected);
      }
    }
    expect(compareNumeric84Decimal('-0', '0.0000')).toBe(0);
  });

  it('parse -> canonicalise -> parse preserves the exact value over a bounded exhaustive matrix', () => {
    const wholes = ['0', '1', '9', '10', '99', '100', '999', '1000', '9998', '9999'];
    const fractions = ['', '0', '5', '05', '50', '0001', '1234', '9999', '99990', '10000000'];
    const zeroPads = ['', '0', '000'];
    for (const sign of ['', '+', '-']) {
      for (const pad of zeroPads) {
        for (const whole of wholes) {
          for (const fraction of fractions) {
            const text = `${sign}${pad}${whole}${fraction === '' ? '' : `.${fraction}`}`;
            const canonical = canonicaliseNumeric84Decimal(text);
            expect(referenceUnits(canonical), text).toBe(referenceUnits(text));
            expect(canonicaliseNumeric84Decimal(canonical), text).toBe(canonical);
            expect(canonical).toMatch(/^-?(0|[1-9][0-9]{0,3})\.[0-9]{4}$/);
            expect(canonical === '-0.0000').toBe(false);
          }
        }
      }
    }
  });

  it('compare agrees with the float-free reference across that matrix', () => {
    const values = [
      '-9999.9999',
      '-10',
      '-1.5',
      '-0.0001',
      '-0',
      '0',
      '0.0001',
      '1.2',
      '1.2001',
      '9999.9999',
    ];
    for (const l of values) {
      for (const r of values) {
        const a = referenceUnits(l);
        const b = referenceUnits(r);
        expect(compareNumeric84Decimal(l, r)).toBe(a < b ? -1 : a > b ? 1 : 0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. K1 / K2 reduction
// ---------------------------------------------------------------------------

describe('2D-A3 R10: K1 MAX across tracks, signed, no clamp', () => {
  it.each([
    ['-2', '-4', '-2.0000'],
    ['8', '-4', '8.0000'],
    ['-4', '8', '8.0000'],
    ['0', '-0.0000', '0.0000'],
    ['-0', '0', '0.0000'],
    ['3.5', '3.50', '3.5000'],
    ['-3', '-3', '-3.0000'],
  ])('A=%s B=%s -> %s', (a, b, expected) => {
    const prep = prepareSetRDocumentScore(input([[a, b]]));
    expect(prep.sourceRowScores[0]!.pageSetRScoreDecimal).toBe(expected);
    expect(prep.resolvedScore.resolvedScoreDecimal).toBe(expected);
  });

  it('an all-negative document stays negative', () => {
    expect(
      scoreOf(
        input([
          ['-3', '-3'],
          ['-2', '-4'],
          ['-9999.9999', '-5.5'],
        ]),
      ),
    ).toBe('-2.0000');
  });

  it('the pages from the migration-0008 table keep their negative scores', () => {
    // title "MSc International Marketing": A -2, B -4; /login/: -3, -3.
    expect(scoreOf(input([['-2', '-4']]))).toBe('-2.0000');
    expect(scoreOf(input([['-3', '-3']]))).toBe('-3.0000');
  });
});

describe('2D-A3 R10: K2 MAX across source rows equals the joint MAX', () => {
  const CASES: readonly (readonly (readonly [string, string])[])[] = [
    [['1', '2']],
    [
      ['5', '-1'],
      ['-1', '7'],
    ],
    [
      ['9.0001', '0'],
      ['0', '9.0002'],
      ['9.0002', '-9999.9999'],
    ],
    [
      ['-2', '-4'],
      ['-7', '-3'],
      ['-2.0001', '-1.9999'],
    ],
    [
      ['0', '0'],
      ['-0', '0.0'],
    ],
    [
      ['9999.9999', '-9999.9999'],
      ['-9999.9999', '9999.9999'],
    ],
  ];

  it.each(CASES.map((c, i) => [i, c] as const))(
    'case %i equals max_rows(max_tracks) and max over all observations',
    (_, scores) => {
      const result = referenceUnits(scoreOf(input(scores)));
      const rowsThenTracks = scores
        .map(([a, b]) => referenceMax([a, b]))
        .reduce((m, v) => (v > m ? v : m));
      const allObservations = referenceMax(scores.flat());
      expect(result).toBe(rowsThenTracks);
      expect(result).toBe(allObservations);
    },
  );

  it('the strongest Track A and the strongest Track B on different aliases', () => {
    const prep = prepareSetRDocumentScore(
      input([
        ['12.5', '1'],
        ['1', '12.4999'],
        ['3', '3'],
      ]),
    );
    expect(prep.resolvedScore.resolvedScoreDecimal).toBe('12.5000');
    expect(prep.sourceRowScores.map((r) => r.pageSetRScoreDecimal)).toEqual([
      '12.5000',
      '12.4999',
      '3.0000',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3. Multiplicity, permutation, provenance, no representative
// ---------------------------------------------------------------------------

describe('2D-A3 R10: duplicate multiplicity is idempotent', () => {
  it('one row, two identical rows and many rows repeating the max give the same score', () => {
    const one = scoreOf(input([['4', '2']]));
    const two = scoreOf(
      input([
        ['4', '2'],
        ['4', '2'],
      ]),
    );
    const many = scoreOf(
      input([
        ['4', '2'],
        ['2', '4'],
        ['4.0000', '4'],
        ['-1', '4.0'],
      ]),
    );
    expect(one).toBe('4.0000');
    expect(two).toBe(one);
    expect(many).toBe(one);
  });

  it('a weaker alias never lowers the score; a stronger one may raise it', () => {
    const base = scoreOf(input([['4', '2']]));
    expect(
      scoreOf(
        input([
          ['4', '2'],
          ['-9', '-9'],
        ]),
      ),
    ).toBe(base);
    expect(
      scoreOf(
        input([
          ['4', '2'],
          ['0', '6'],
        ]),
      ),
    ).toBe('6.0000');
  });
});

describe('2D-A3 R10: input order does not change the result', () => {
  const ids = [pid(1), pid(2), pid(3)];
  const rows = [row(pid(1), '1', '-2'), row(pid(2), '7', '7'), row(pid(3), '-0.5', '7.0000')];
  const reference = JSON.stringify(
    prepareSetRDocumentScore({ document: doc(ids), sourceRows: rows }),
  );

  function permutations<T>(items: readonly T[]): T[][] {
    if (items.length <= 1) return [[...items]];
    return items.flatMap((item, i) =>
      permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
    );
  }

  it('every permutation of sourceRows and of each row’s observations is byte-equivalent', () => {
    for (const ordering of permutations(rows)) {
      for (const flip of [false, true]) {
        const sourceRows = ordering.map((r) => ({
          ...r,
          candidateObservations: flip
            ? [...r.candidateObservations].reverse()
            : r.candidateObservations,
        }));
        expect(JSON.stringify(prepareSetRDocumentScore({ document: doc(ids), sourceRows }))).toBe(
          reference,
        );
      }
    }
  });

  it('provenance follows document.sourcePageEvidenceIds, not caller or score order', () => {
    const reordered = [pid(3), pid(1), pid(2)];
    const prep = prepareSetRDocumentScore({ document: doc(reordered), sourceRows: rows });
    expect(prep.sourceRowScores.map((r) => r.pageEvidenceId)).toEqual(reordered);
    expect(prep.sourcePageEvidenceIds).toEqual(reordered);
    expect(prep.resolvedScore.resolvedScoreDecimal).toBe('7.0000');
  });
});

describe('2D-A3 R10: provenance is complete and minimal', () => {
  it('N source rows yield exactly N rows and N*2 track observations, fixed track order', () => {
    for (const n of [1, 2, 5]) {
      const scores = Array.from({ length: n }, (_, i) => [`${i}`, `-${i}`] as const);
      const prep = prepareSetRDocumentScore(input(scores));
      expect(prep.kind).toBe(A3_SET_R_DOCUMENT_SCORE_PREPARATION_KIND);
      expect(prep.kind).toBe('A3_SET_R_DOCUMENT_SCORE_PREPARATION_NOT_RANKED_NOT_PUBLIC_MANIFEST');
      expect(prep.documentSha256).toBe(SHA);
      expect(prep.sourceRowScores).toHaveLength(n);
      expect(prep.sourceRowScores.flatMap((r) => r.trackScores)).toHaveLength(n * 2);
      expect(new Set(prep.sourceRowScores.map((r) => r.pageEvidenceId)).size).toBe(n);
      for (const [i, r] of prep.sourceRowScores.entries()) {
        expect(r.pageEvidenceId).toBe(pid(i + 1));
        expect(r.trackScores.map((t) => t.track)).toEqual([...SET_R_REQUIRED_TRACKS]);
        expect(r.trackScores.map((t) => t.ruleVersion)).toEqual([
          SET_R_BOUND_SIGNAL_RULE_VERSION,
          SET_R_BOUND_SIGNAL_RULE_VERSION,
        ]);
        expect(r.trackScores.map((t) => t.candidateScoreDecimal)).toEqual([
          canonicaliseNumeric84Decimal(`${i}`),
          canonicaliseNumeric84Decimal(`-${i}`),
        ]);
      }
    }
  });

  it('carries exactly the minimal keys at every level', () => {
    const prep = prepareSetRDocumentScore(input([['1', '2']]));
    expect(Object.keys(prep).sort()).toEqual(
      [
        'documentSha256',
        'kind',
        'resolvedScore',
        'sourcePageEvidenceIds',
        'sourceRowScores',
      ].sort(),
    );
    expect(Object.keys(prep.sourceRowScores[0]!).sort()).toEqual(
      ['pageEvidenceId', 'pageSetRScoreDecimal', 'trackScores'].sort(),
    );
    expect(Object.keys(prep.sourceRowScores[0]!.trackScores[0]!).sort()).toEqual(
      ['candidateScoreDecimal', 'ruleVersion', 'track'].sort(),
    );
    expect(Object.keys(prep.resolvedScore).sort()).toEqual(
      [
        'documentSha256',
        'k1TrackReductionDecisionRecordSha256',
        'k2ExactDuplicateDecisionRecordSha256',
        'resolvedScoreDecimal',
      ].sort(),
    );
  });

  it('drops caller-supplied extra fields (URL, text, root rank) instead of carrying them', () => {
    const polluted = {
      document: { ...doc([pid(1)]), url: 'https://example.invalid/', title: 'T' },
      sourceRows: [
        {
          ...row(pid(1), '1', '2'),
          url: 'https://example.invalid/x',
          rankWithinRoot: 1,
          candidateObservations: row(pid(1), '1', '2').candidateObservations.map((o) => ({
            ...o,
            rank_within_root: 3,
            signals: ['x'],
          })),
        },
      ],
    };
    const serialised = JSON.stringify(prepareSetRDocumentScore(polluted as never));
    expect(serialised).not.toMatch(
      /example\.invalid|rank_within_root|rankWithinRoot|"title"|signals|"url"/,
    );
  });
});

describe('2D-A3 R10: a tie never creates a representative', () => {
  it('names no winning page or track, and a tie reads identically whichever alias ties', () => {
    const tieFirst = prepareSetRDocumentScore(
      input([
        ['5', '1'],
        ['1', '5'],
      ]),
    );
    const serialised = JSON.stringify(tieFirst);
    expect(serialised).not.toMatch(/representative|winner|winning|canonicalPage|selected/i);
    expect(tieFirst.resolvedScore.resolvedScoreDecimal).toBe('5.0000');
    // The resolved score object is identical to that of a document whose only
    // row supplies the value from the other track.
    const other = prepareSetRDocumentScore(input([['0', '5']]));
    expect(other.resolvedScore).toEqual(tieFirst.resolvedScore);
  });
});

// ---------------------------------------------------------------------------
// 4. Decision-hash binding and immutability
// ---------------------------------------------------------------------------

describe('2D-A3 R10: the resolved score is an A3ExternallyResolvedSetRScore bound to K1/K2', () => {
  it('carries the document SHA, the canonical score and both canonical record hashes', () => {
    const { resolvedScore } = prepareSetRDocumentScore(input([['1.5', '-1']]));
    expect(resolvedScore).toEqual({
      documentSha256: SHA,
      resolvedScoreDecimal: '1.5000',
      k1TrackReductionDecisionRecordSha256: K1_OWNER_DECISION.decisionRecordSha256,
      k2ExactDuplicateDecisionRecordSha256: K2_OWNER_DECISION.decisionRecordSha256,
    });
    expect(resolvedScore.k1TrackReductionDecisionRecordSha256).toBe(
      '2437ef4b0bcabc816432c338e02da3b6eaa80fedb561b805232ad906fbbc94be',
    );
    expect(resolvedScore.k2ExactDuplicateDecisionRecordSha256).toBe(
      '5fb280c9aae264e59ca80383922d324c1118aa9192e7d9f5fe6e79ca09b75668',
    );
  });
});

describe('2D-A3 R10: immutability', () => {
  it('freezes every returned level and leaves caller input untouched and unfrozen', () => {
    const i = input([
      ['1', '2'],
      ['3', '-4'],
    ]);
    const before = JSON.stringify(i);
    const prep = prepareSetRDocumentScore(i);
    expect(JSON.stringify(i)).toBe(before);
    expect(Object.isFrozen(i)).toBe(false);
    expect(Object.isFrozen(i.document.sourcePageEvidenceIds)).toBe(false);
    expect(Object.isFrozen(i.sourceRows[0]!.candidateObservations)).toBe(false);
    expect(Object.isFrozen(prep)).toBe(true);
    expect(Object.isFrozen(prep.sourcePageEvidenceIds)).toBe(true);
    expect(prep.sourcePageEvidenceIds).not.toBe(i.document.sourcePageEvidenceIds);
    expect(Object.isFrozen(prep.sourceRowScores)).toBe(true);
    expect(Object.isFrozen(prep.resolvedScore)).toBe(true);
    for (const r of prep.sourceRowScores) {
      expect(Object.isFrozen(r)).toBe(true);
      expect(Object.isFrozen(r.trackScores)).toBe(true);
      for (const t of r.trackScores) expect(Object.isFrozen(t)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Integrity refusals
// ---------------------------------------------------------------------------

describe('2D-A3 R10: integrity defects refuse, never repair', () => {
  const base = (): A3SetRDocumentScoreInput =>
    input([
      ['1', '2'],
      ['3', '4'],
    ]);

  function expectRefusal(value: unknown, code: A3SetRScoreRefusalCode): A3SetRScoreRefusal {
    const refusal = refusalOf(() => prepareSetRDocumentScore(value as never));
    expect(refusal.code).toBe(code);
    expect(refusal.message).not.toMatch(/page-\d|aaaa|bbbb/);
    return refusal;
  }

  it('malformed collections', () => {
    for (const bad of [null, undefined, 1, 'x', []])
      expectRefusal(bad, 'MALFORMED_DOCUMENT_SCORE_INPUT');
    expectRefusal({ sourceRows: [] }, 'MALFORMED_DOCUMENT_SCORE_INPUT');
    expectRefusal(
      { ...base(), document: { ...doc([pid(1)]), documentSha256: '' } },
      'MALFORMED_DOCUMENT_SCORE_INPUT',
    );
    expectRefusal(
      { ...base(), document: { ...doc([]), sourcePageEvidenceIds: 'p' } },
      'MALFORMED_DOCUMENT_SCORE_INPUT',
    );
    expectRefusal(
      { document: doc([pid(1)]), sourceRows: 'rows' },
      'MALFORMED_DOCUMENT_SCORE_INPUT',
    );
    expectRefusal(
      { document: doc([pid(1), 7 as never]), sourceRows: [] },
      'MALFORMED_DOCUMENT_SCORE_INPUT',
    );
  });

  it('empty and duplicate document source ids', () => {
    expectRefusal({ document: doc([]), sourceRows: [] }, 'DOCUMENT_SOURCE_PAGE_EVIDENCE_IDS_EMPTY');
    const r = expectRefusal(
      { document: doc([pid(1), pid(2), pid(1)]), sourceRows: base().sourceRows },
      'DUPLICATE_DOCUMENT_SOURCE_PAGE_EVIDENCE_ID',
    );
    expect(r.location.documentSourcePosition).toBe(2);
  });

  it('missing, duplicate and extra source rows', () => {
    const b = base();
    expect(
      expectRefusal({ ...b, sourceRows: [b.sourceRows[0]] }, 'MISSING_SOURCE_ROW').location
        .documentSourcePosition,
    ).toBe(1);
    expect(
      expectRefusal(
        { ...b, sourceRows: [...b.sourceRows, b.sourceRows[0]] },
        'DUPLICATE_SOURCE_ROW',
      ).location.sourceRowPosition,
    ).toBe(2);
    expectRefusal(
      { ...b, sourceRows: [...b.sourceRows, row(pid(9), '1', '1')] },
      'EXTRA_SOURCE_ROW',
    );
    for (const bad of [
      null,
      1,
      { pageEvidenceId: pid(1) },
      { ...row(pid(1), '1', '1'), candidateObservations: {} },
    ]) {
      expectRefusal({ ...b, sourceRows: [bad, b.sourceRows[1]] }, 'MALFORMED_SOURCE_ROW');
    }
  });

  it('a source row whose joined fetch hash differs from the document', () => {
    const b = base();
    const r = expectRefusal(
      { ...b, sourceRows: [b.sourceRows[0], { ...b.sourceRows[1]!, documentSha256: OTHER_SHA }] },
      'FETCH_DOCUMENT_SHA_MISMATCH',
    );
    expect(r.location).toMatchObject({ sourceRowPosition: 1, documentSourcePosition: 1 });
  });

  function withObservations(observations: readonly unknown[]): unknown {
    const b = base();
    return {
      ...b,
      sourceRows: [{ ...b.sourceRows[0]!, candidateObservations: observations }, b.sourceRows[1]],
    };
  }
  const A = (score = '1', page = pid(1), version?: string) =>
    obs(page, 'INTERNATIONAL_OFFICE', score, version);
  const B = (score = '2', page = pid(1), version?: string) =>
    obs(page, 'LANGUAGE_CENTRE', score, version);

  it('missing, duplicate and unexpected tracks', () => {
    expectRefusal(withObservations([B()]), 'MISSING_TRACK_A');
    expectRefusal(withObservations([A()]), 'MISSING_TRACK_B');
    expectRefusal(withObservations([]), 'MISSING_TRACK_A');
    expectRefusal(withObservations([A(), B(), A('9')]), 'DUPLICATE_REQUIRED_TRACK_OBSERVATION');
    expectRefusal(withObservations([A(), B(), B('2')]), 'DUPLICATE_REQUIRED_TRACK_OBSERVATION');
    for (const track of ['STUDENT_ASSOCIATION', 'international_office', '', 7, null]) {
      expectRefusal(
        withObservations([A(), B(), obs(pid(1), track as never, '1')]),
        'UNEXPECTED_CANDIDATE_TRACK',
      );
    }
  });

  it('wrong or mixed rule versions', () => {
    expectRefusal(
      withObservations([A('1', pid(1), 'orgunit-signal-rules-v2'), B()]),
      'UNEXPECTED_OR_MIXED_SIGNAL_RULE_VERSION',
    );
    expectRefusal(
      withObservations([A(), B('2', pid(1), 'orgunit-signal-rules-v0')]),
      'UNEXPECTED_OR_MIXED_SIGNAL_RULE_VERSION',
    );
    expectRefusal(
      withObservations([A(), { ...B(), ruleVersion: undefined }]),
      'UNEXPECTED_OR_MIXED_SIGNAL_RULE_VERSION',
    );
  });

  it('an observation belonging to another page, including a sibling source row', () => {
    const r = expectRefusal(
      withObservations([A('1', pid(2)), B()]),
      'CANDIDATE_OBSERVATION_FOR_PAGE_OUTSIDE_DOCUMENT_SOURCE_GROUP',
    );
    expect(r.location).toMatchObject({ sourceRowPosition: 0, observationPosition: 0 });
    expectRefusal(
      withObservations([A(), B('2', pid(99))]),
      'CANDIDATE_OBSERVATION_FOR_PAGE_OUTSIDE_DOCUMENT_SOURCE_GROUP',
    );
  });

  it('malformed observations and malformed or out-of-domain scores, with no zero substitution', () => {
    expectRefusal(withObservations([A(), null]), 'MALFORMED_CANDIDATE_OBSERVATION');
    expectRefusal(withObservations([A(), 'LANGUAGE_CENTRE']), 'MALFORMED_CANDIDATE_OBSERVATION');
    for (const score of ['', 'NaN', '1e1', ' 2', 2 as never, null as never]) {
      const r = expectRefusal(withObservations([A(), B(score)]), 'MALFORMED_PERSISTED_SCORE_VALUE');
      expect(r.location).toMatchObject({
        field: 'candidateScoreDecimal',
        sourceRowPosition: 0,
        observationPosition: 1,
      });
    }
    expectRefusal(
      withObservations([A('10000'), B()]),
      'PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN',
    );
    expectRefusal(
      withObservations([A('1.00001'), B()]),
      'PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN',
    );
  });

  it('covers every integrity token the K2 owner record requires refusing', () => {
    const k2Tokens = [
      'MISSING_TRACK_A',
      'MISSING_TRACK_B',
      'DUPLICATE_REQUIRED_TRACK_OBSERVATION',
      'UNEXPECTED_OR_MIXED_SIGNAL_RULE_VERSION',
      'MALFORMED_PERSISTED_SCORE_VALUE',
      'CANDIDATE_OBSERVATION_FOR_PAGE_OUTSIDE_DOCUMENT_SOURCE_GROUP',
      'FETCH_DOCUMENT_SHA_MISMATCH',
      'UNEXPECTED_CANDIDATE_TRACK',
    ] satisfies A3SetRScoreRefusalCode[];
    const record = JSON.parse(
      readFileSync(join(REPO_ROOT, K2_OWNER_DECISION.decisionRecordPath), 'utf8'),
    ) as { ownerDecision: { integrityPolicy: { refuseRatherThanRepair: string[] } } };
    expect(record.ownerDecision.integrityPolicy.refuseRatherThanRepair).toEqual(k2Tokens);
  });

  it('refusal location carries positions and a field name only', () => {
    const r = expectRefusal(
      withObservations([A(), B('bogus-secret')]),
      'MALFORMED_PERSISTED_SCORE_VALUE',
    );
    expect(Object.keys(r.location).sort()).toEqual(
      ['documentSourcePosition', 'field', 'observationPosition', 'sourceRowPosition'].sort(),
    );
    expect(r.message).not.toContain('bogus-secret');
    expect(Object.isFrozen(r.location)).toBe(true);
  });
});

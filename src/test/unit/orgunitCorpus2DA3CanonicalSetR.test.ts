/**
 * PHASE 2B-2D A3 R11 — PURE SET_R TOTAL RANK OVER R10 RESOLVED DOCUMENT SCORES.
 *
 * Synthetic data only. Proves, against the real `a3prep/setR.ts`:
 *
 *   - resolved score DESCENDING by exact numeric value, then
 *     sha256("SET_R_V2_R2:" + documentSha256) ASCENDING, and nothing else;
 *   - the primary key dominates the tie-break, and the tie-break is used
 *     only on a numeric score tie;
 *   - input order never breaks a tie: every permutation is byte-identical;
 *   - every R10 preparation is re-bound to its exact document (kind, SHA,
 *     source provenance, provenance rows, K1/K2 hashes, canonical spelling),
 *     so a score cannot be transplanted between organisations that share a SHA;
 *   - rank-helper integrity (identity shape, uniqueness, slot/split scope,
 *     digest collision) is R2's, unchanged;
 *   - the output is R1's identity-and-position shape pinned to SET_R, full
 *     and uncapped, frozen, and carries no score or provenance;
 *   - genuine R10 `prepareSetRDocumentScore` output feeds R11 end to end.
 *
 * The test-side SHA-256 reference uses `node:crypto` directly; the
 * implementation reuses R2's `prefixedDocumentRankHash`.
 */
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  K1_OWNER_DECISION,
  K2_OWNER_DECISION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
  SET_R_PRIMARY_ORDER,
  SET_R_TIE_BREAK_KEY_PREFIX,
  SET_R_TIE_BREAK_ORDER,
} from '../harness/phase2b2d/a3prep/contracts.js';
import { A3RankStop } from '../harness/phase2b2d/a3prep/rank.js';
import type * as RankModule from '../harness/phase2b2d/a3prep/rank.js';
import {
  A3SetRRankRefusal,
  type A3SetRRankInput,
  type A3SetRRankRefusalCode,
  rankSetRFull,
} from '../harness/phase2b2d/a3prep/setR.js';
import {
  prepareSetRDocumentScore,
  type A3SetRDocumentScorePreparation,
} from '../harness/phase2b2d/a3prep/setRScore.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3PageEvidenceId,
  A3SelectionIndex,
  A3TrackCandidateObservation,
} from '../harness/phase2b2d/a3prep/types.js';
import type { Split } from '../harness/phase2b2d/a3prep/contracts.js';

// ---------------------------------------------------------------------------
// Synthetic builders — every preparation is GENUINE R10 output
// ---------------------------------------------------------------------------

const sha = (label: string): A3DocumentSha256 =>
  createHash('sha256')
    .update(`r11-synthetic-document:${label}`, 'utf8')
    .digest('hex') as A3DocumentSha256;

const pid = (label: string): A3PageEvidenceId => `page-${label}` as A3PageEvidenceId;

/** The test-side reference for the frozen tie-break bytes. */
const referenceTieBreak = (documentSha256: string): string =>
  createHash('sha256').update(`SET_R_V2_R2:${documentSha256}`, 'utf8').digest('hex');

function obs(page: A3PageEvidenceId, track: string, score: string): A3TrackCandidateObservation {
  return {
    pageEvidenceId: page,
    track,
    candidateScoreDecimal: score,
    ruleVersion: 'orgunit-signal-rules-v1',
  } as never;
}

interface EntryOptions {
  readonly selectionIndex?: number;
  readonly split?: Split;
  /** Per source page: [trackA, trackB]. Defaults to [score, a far lower value]. */
  readonly rowScores?: readonly (readonly [string, string])[];
}

/**
 * One exact document and the R10 preparation genuinely produced for it. The
 * resolved score is `score` unless `rowScores` says otherwise.
 */
function entry(
  documentSha256: string,
  sourceIds: readonly A3PageEvidenceId[],
  score: string,
  options: EntryOptions = {},
): A3SetRRankInput {
  const document: A3DistinctDocument = {
    selectionIndex: (options.selectionIndex ?? 0) as A3SelectionIndex,
    split: options.split ?? 'DEV_TRAIN',
    documentSha256: documentSha256 as A3DocumentSha256,
    sourcePageEvidenceIds: sourceIds,
  };
  const scorePreparation = prepareSetRDocumentScore({
    document,
    sourceRows: sourceIds.map((id, i) => {
      const [a, b] = options.rowScores?.[i] ?? [score, '-9999.9999'];
      return {
        pageEvidenceId: id,
        documentSha256: documentSha256 as A3DocumentSha256,
        candidateObservations: [obs(id, 'INTERNATIONAL_OFFICE', a), obs(id, 'LANGUAGE_CENTRE', b)],
      };
    }),
  });
  return { document, scorePreparation };
}

/** A simple one-source entry, labelled for readability. */
const simple = (label: string, score: string, options: EntryOptions = {}): A3SetRRankInput =>
  entry(sha(label), [pid(label)], score, options);

/** Replace fields of a genuine preparation, leaving the rest untouched. */
function withPreparation(
  base: A3SetRRankInput,
  patch: (p: A3SetRDocumentScorePreparation) => Record<string, unknown>,
): A3SetRRankInput {
  return { document: base.document, scorePreparation: patch(base.scorePreparation) as never };
}

function withResolvedScore(base: A3SetRRankInput, patch: Record<string, unknown>): A3SetRRankInput {
  return withPreparation(base, (p) => ({
    ...p,
    resolvedScore: { ...p.resolvedScore, ...patch },
  }));
}

function refusalOf(fn: () => unknown): A3SetRRankRefusal {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(A3SetRRankRefusal);
    return error as A3SetRRankRefusal;
  }
  throw new Error('expected an A3SetRRankRefusal');
}

function expectRefusal(fn: () => unknown, code: A3SetRRankRefusalCode): A3SetRRankRefusal {
  const refusal = refusalOf(fn);
  expect(refusal.code).toBe(code);
  return refusal;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

const shas = (rank: readonly { documentSha256: string }[]): string[] =>
  rank.map((r) => r.documentSha256);

afterEach(() => {
  vi.doUnmock('../harness/phase2b2d/a3prep/rank.js');
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Frozen authority
// ---------------------------------------------------------------------------

describe('2D-A3 R11: frozen SET_R ordering authority', () => {
  it('is score descending, then the salted SET_R_V2_R2: digest ascending', () => {
    expect(SET_R_PRIMARY_ORDER).toBe('RESOLVED_FROZEN_TRACK_A_B_SIGNAL_SCORE_DESCENDING');
    expect(SET_R_TIE_BREAK_ORDER).toBe('SALTED_SHA256_LOWER_HEX_ASCENDING');
    expect(SET_R_TIE_BREAK_KEY_PREFIX).toBe('SET_R_V2_R2:');
  });
});

// ---------------------------------------------------------------------------
// Basic ordering
// ---------------------------------------------------------------------------

describe('2D-A3 R11: primary order is exact resolved score descending', () => {
  it('orders three different scores descending', () => {
    const rank = rankSetRFull([simple('low', '1'), simple('high', '3'), simple('mid', '2')]);
    expect(shas(rank)).toEqual([sha('high'), sha('mid'), sha('low')]);
  });

  it('puts positive before zero before negative', () => {
    const rank = rankSetRFull([
      simple('neg', '-0.0001'),
      simple('pos', '0.0001'),
      simple('zero', '0'),
    ]);
    expect(shas(rank)).toEqual([sha('pos'), sha('zero'), sha('neg')]);
  });

  it('ranks the less-negative score first when every score is negative', () => {
    const rank = rankSetRFull([simple('m2', '-2'), simple('m1', '-1'), simple('m3', '-3.5')]);
    expect(shas(rank)).toEqual([sha('m1'), sha('m2'), sha('m3')]);
  });

  it('compares by numeric value, not by text', () => {
    // Text order would put "9.9999" above "10.0000" and "-2.0000" above "-10.0000" wrongly.
    const rank = rankSetRFull([
      simple('nine', '9.9999'),
      simple('ten', '10'),
      simple('mTen', '-10'),
      simple('mTwo', '-2'),
      simple('eightMinus', '7.9999'),
      simple('eight', '8'),
    ]);
    expect(shas(rank)).toEqual([
      sha('ten'),
      sha('nine'),
      sha('eight'),
      sha('eightMinus'),
      sha('mTwo'),
      sha('mTen'),
    ]);
  });

  it('assigns contiguous rank positions 0..n-1, every entry SET_R', () => {
    const rank = rankSetRFull(['a', 'b', 'c', 'd', 'e'].map((l, i) => simple(l, String(i))));
    expect(rank.map((r) => r.rankPosition)).toEqual([0, 1, 2, 3, 4]);
    for (const r of rank) expect(r.sample).toBe('SET_R');
  });
});

describe('2D-A3 R11: the salted tie-break', () => {
  it('matches an independently computed sha256("SET_R_V2_R2:" + documentSha256)', () => {
    const labels = ['t1', 't2', 't3', 't4'];
    const rank = rankSetRFull(labels.map((l) => simple(l, '5')));
    for (const r of rank) {
      expect(r.saltedRankSha256).toBe(referenceTieBreak(r.documentSha256));
      expect(r.saltedRankSha256).not.toBe(
        createHash('sha256').update(`SET_R_V2_R2::${r.documentSha256}`).digest('hex'),
      );
    }
  });

  it('breaks an equal-score tie by plain lower-hex ascending, and by nothing else', () => {
    const labels = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'];
    const rank = rankSetRFull(labels.map((l) => simple(l, '2.5')));
    const expected = labels
      .map((l) => sha(l))
      .sort((a, b) => (referenceTieBreak(a) < referenceTieBreak(b) ? -1 : 1));
    expect(shas(rank)).toEqual(expected);
  });

  it('treats numerically equal scores as a tie (canonical R10 spellings of 3, 3.0, 03.00)', () => {
    const rank = rankSetRFull([simple('x', '3'), simple('y', '3.0'), simple('z', '03.00')]);
    const expected = [sha('x'), sha('y'), sha('z')].sort((a, b) =>
      referenceTieBreak(a) < referenceTieBreak(b) ? -1 : 1,
    );
    expect(shas(rank)).toEqual(expected);
  });

  it('never lets the tie-break override a score difference', () => {
    // Find a pair where "worse" has the lexicographically LATER digest.
    const [first, second] = [sha('dom-a'), sha('dom-b')];
    const [better, worse] =
      referenceTieBreak(first) < referenceTieBreak(second) ? [first, second] : [second, first];
    expect(referenceTieBreak(worse) > referenceTieBreak(better)).toBe(true);
    const rank = rankSetRFull([entry(better, [pid('b')], '7.9999'), entry(worse, [pid('w')], '8')]);
    expect(shas(rank)).toEqual([worse, better]);
  });
});

describe('2D-A3 R11: no tertiary key — input order never breaks a tie', () => {
  it('every permutation of a mixed score/tie pool yields byte-identical output', () => {
    const pool = [
      simple('p1', '4'),
      simple('p2', '4'),
      simple('p3', '-1'),
      simple('p4', '4'),
      simple('p5', '0'),
    ];
    const reference = JSON.stringify(rankSetRFull(pool));
    const all = permutations(pool);
    expect(all).toHaveLength(120);
    for (const order of all) expect(JSON.stringify(rankSetRFull(order))).toBe(reference);
  });

  it('source-ID order inside a document never matters to the rank', () => {
    const forward = entry(sha('multi'), [pid('m1'), pid('m2')], '6');
    const backward = entry(sha('multi'), [pid('m2'), pid('m1')], '6');
    const other = simple('solo', '6');
    expect(JSON.stringify(rankSetRFull([forward, other]))).toBe(
      JSON.stringify(rankSetRFull([backward, other])),
    );
  });

  it('a score tie whose salted digests collide is refused, never ordered by input position', async () => {
    vi.resetModules();
    vi.doMock('../harness/phase2b2d/a3prep/rank.js', async (importOriginal) => ({
      ...(await importOriginal<typeof RankModule>()),
      prefixedDocumentRankHash: () => 'f'.repeat(64),
    }));
    const mocked = await import('../harness/phase2b2d/a3prep/setR.js');
    const rankModule = await import('../harness/phase2b2d/a3prep/rank.js');
    const pool = [simple('c1', '1'), simple('c2', '1')];
    expect(() => mocked.rankSetRFull(pool)).toThrow(rankModule.A3RankStop);
    expect(() => mocked.rankSetRFull(pool)).toThrow(/same salted rank digest/);
    // Even with DIFFERENT scores the collision is an integrity refusal, not a free pass.
    expect(() => mocked.rankSetRFull([simple('c1', '2'), simple('c2', '1')])).toThrow(
      /same salted rank digest/,
    );
  });
});

// ---------------------------------------------------------------------------
// Binding
// ---------------------------------------------------------------------------

describe('2D-A3 R11: score-transplant protection', () => {
  const X = sha('shared-x');
  // Organisation/slot A and organisation/slot B hold the same exact document X.
  const slotA = entry(X, [pid('A1'), pid('A2')], '8', { selectionIndex: 0 });
  const slotB = entry(X, [pid('B1')], '2', { selectionIndex: 1 });

  it('accepts each genuine pairing', () => {
    expect(rankSetRFull([slotA])).toHaveLength(1);
    expect(rankSetRFull([slotB])).toHaveLength(1);
  });

  it("refuses A's document paired with B's preparation, although the SHA matches", () => {
    const transplanted = { document: slotA.document, scorePreparation: slotB.scorePreparation };
    expectRefusal(
      () => rankSetRFull([transplanted]),
      'SCORE_PREPARATION_SOURCE_PROVENANCE_MISMATCH',
    );
  });

  it('refuses a same-length transplant at the first differing provenance position', () => {
    const a = entry(X, [pid('A1'), pid('A2')], '8');
    const b = entry(X, [pid('A1'), pid('B2')], '2');
    const refusal = expectRefusal(
      () => rankSetRFull([{ document: a.document, scorePreparation: b.scorePreparation }]),
      'SCORE_PREPARATION_SOURCE_PROVENANCE_MISMATCH',
    );
    expect(refusal.location).toEqual({
      field: 'scorePreparation.sourcePageEvidenceIds',
      inputPosition: 0,
      provenancePosition: 1,
    });
  });

  it('refuses a reordered provenance list (positional equality, not set equality)', () => {
    const a = entry(X, [pid('A1'), pid('A2')], '8');
    const b = entry(X, [pid('A2'), pid('A1')], '8');
    expectRefusal(
      () => rankSetRFull([{ document: a.document, scorePreparation: b.scorePreparation }]),
      'SCORE_PREPARATION_SOURCE_PROVENANCE_MISMATCH',
    );
  });

  it('refuses a preparation for a different document SHA', () => {
    const other = simple('other', '8');
    const d = simple('this', '8');
    expectRefusal(
      () => rankSetRFull([{ document: d.document, scorePreparation: other.scorePreparation }]),
      'SCORE_PREPARATION_DOCUMENT_SHA_MISMATCH',
    );
  });

  it('refuses a resolved score naming a different SHA than its preparation', () => {
    const base = simple('rs', '1');
    expectRefusal(
      () => rankSetRFull([withResolvedScore(base, { documentSha256: sha('elsewhere') })]),
      'SCORE_PREPARATION_DOCUMENT_SHA_MISMATCH',
    );
  });

  it('refuses matching source ids whose provenance rows do not match', () => {
    const base = entry(X, [pid('A1'), pid('A2')], '8');
    const swapped = withPreparation(base, (p) => ({
      ...p,
      sourceRowScores: [p.sourceRowScores[1], p.sourceRowScores[0]],
    }));
    expectRefusal(
      () => rankSetRFull([swapped]),
      'SCORE_PREPARATION_SOURCE_ROW_PROVENANCE_MISMATCH',
    );
    const short = withPreparation(base, (p) => ({
      ...p,
      sourceRowScores: [p.sourceRowScores[0]],
    }));
    expectRefusal(() => rankSetRFull([short]), 'SCORE_PREPARATION_SOURCE_ROW_PROVENANCE_MISMATCH');
    const foreignRow = withPreparation(base, (p) => ({
      ...p,
      sourceRowScores: [
        p.sourceRowScores[0],
        { ...p.sourceRowScores[1], pageEvidenceId: pid('B1') },
      ],
    }));
    const refusal = expectRefusal(
      () => rankSetRFull([foreignRow]),
      'SCORE_PREPARATION_SOURCE_ROW_PROVENANCE_MISMATCH',
    );
    expect(refusal.location.provenancePosition).toBe(1);
  });

  it('refuses a foreign preparation kind', () => {
    const base = simple('k', '1');
    expectRefusal(
      () => rankSetRFull([withPreparation(base, (p) => ({ ...p, kind: 'SOMETHING_ELSE' }))]),
      'SCORE_PREPARATION_KIND_MISMATCH',
    );
  });
});

describe('2D-A3 R11: K1/K2 decision-hash binding', () => {
  const base = simple('dh', '1');

  it('the genuine R10 preparation carries the canonical K1/K2 hashes', () => {
    expect(base.scorePreparation.resolvedScore.k1TrackReductionDecisionRecordSha256).toBe(
      K1_OWNER_DECISION.decisionRecordSha256,
    );
    expect(base.scorePreparation.resolvedScore.k2ExactDuplicateDecisionRecordSha256).toBe(
      K2_OWNER_DECISION.decisionRecordSha256,
    );
  });

  it('refuses a stale K1 hash', () => {
    expectRefusal(
      () =>
        rankSetRFull([
          withResolvedScore(base, { k1TrackReductionDecisionRecordSha256: '0'.repeat(64) }),
        ]),
      'K1_DECISION_BINDING_MISMATCH',
    );
  });

  it('refuses a stale K2 hash', () => {
    expectRefusal(
      () =>
        rankSetRFull([
          withResolvedScore(base, { k2ExactDuplicateDecisionRecordSha256: '0'.repeat(64) }),
        ]),
      'K2_DECISION_BINDING_MISMATCH',
    );
  });

  it('refuses swapped K1/K2 hashes', () => {
    expectRefusal(
      () =>
        rankSetRFull([
          withResolvedScore(base, {
            k1TrackReductionDecisionRecordSha256: K2_OWNER_DECISION.decisionRecordSha256,
            k2ExactDuplicateDecisionRecordSha256: K1_OWNER_DECISION.decisionRecordSha256,
          }),
        ]),
      'K1_DECISION_BINDING_MISMATCH',
    );
  });
});

describe('2D-A3 R11: the score must already be canonical R10 output', () => {
  const base = simple('cs', '1.2');

  it('R10 itself emits the canonical spelling', () => {
    expect(base.scorePreparation.resolvedScore.resolvedScoreDecimal).toBe('1.2000');
    expect(rankSetRFull([base])).toHaveLength(1);
  });

  for (const spelling of ['1.2', '01.2000', '+1.2000', '1.20000', '-0.0000', '1.2000 ']) {
    it(`refuses the hand-built spelling ${JSON.stringify(spelling)}`, () => {
      expectRefusal(
        () => rankSetRFull([withResolvedScore(base, { resolvedScoreDecimal: spelling })]),
        'RESOLVED_SCORE_NOT_CANONICAL_NUMERIC_8_4',
      );
    });
  }

  it('refuses a value that is not a numeric(8,4) value at all', () => {
    for (const bad of ['abc', '1.23456', '10000.0000', '1e3', '']) {
      expectRefusal(
        () => rankSetRFull([withResolvedScore(base, { resolvedScoreDecimal: bad })]),
        'RESOLVED_SCORE_NOT_CANONICAL_NUMERIC_8_4',
      );
    }
  });

  it('refuses a non-string score as malformed input', () => {
    expectRefusal(
      () => rankSetRFull([withResolvedScore(base, { resolvedScoreDecimal: 1.2 })]),
      'MALFORMED_SET_R_RANK_INPUT',
    );
  });
});

describe('2D-A3 R11: malformed input', () => {
  const base = simple('mi', '1');

  it('refuses a non-array, a non-record entry, or a missing half', () => {
    expectRefusal(() => rankSetRFull(null as never), 'MALFORMED_SET_R_RANK_INPUT');
    expectRefusal(() => rankSetRFull([null as never]), 'MALFORMED_SET_R_RANK_INPUT');
    expectRefusal(
      () => rankSetRFull([{ document: base.document } as never]),
      'MALFORMED_SET_R_RANK_INPUT',
    );
    expectRefusal(
      () => rankSetRFull([{ scorePreparation: base.scorePreparation } as never]),
      'MALFORMED_SET_R_RANK_INPUT',
    );
  });

  it('refuses missing provenance arrays or resolved score', () => {
    expectRefusal(
      () =>
        rankSetRFull([withPreparation(base, (p) => ({ ...p, sourcePageEvidenceIds: undefined }))]),
      'MALFORMED_SET_R_RANK_INPUT',
    );
    expectRefusal(
      () => rankSetRFull([withPreparation(base, (p) => ({ ...p, sourceRowScores: undefined }))]),
      'MALFORMED_SET_R_RANK_INPUT',
    );
    expectRefusal(
      () => rankSetRFull([withPreparation(base, (p) => ({ ...p, resolvedScore: undefined }))]),
      'MALFORMED_SET_R_RANK_INPUT',
    );
  });

  it('names the failing input position', () => {
    const refusal = expectRefusal(
      () => rankSetRFull([simple('ok', '1'), withPreparation(base, (p) => ({ ...p, kind: 'X' }))]),
      'SCORE_PREPARATION_KIND_MISMATCH',
    );
    expect(refusal.location.inputPosition).toBe(1);
  });
});

describe('2D-A3 R11: refusals leak no identity, id or score', () => {
  it('messages carry codes, field names and positions only', () => {
    const X = sha('leak');
    const a = entry(X, [pid('secret-A1'), pid('secret-A2')], '8.1234');
    const b = entry(X, [pid('secret-B1')], '2.4321');
    const cases: unknown[] = [];
    const capture = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        cases.push(error);
      }
    };
    capture(() => rankSetRFull([{ document: a.document, scorePreparation: b.scorePreparation }]));
    capture(() => rankSetRFull([withResolvedScore(a, { resolvedScoreDecimal: '8.1234000' })]));
    capture(() =>
      rankSetRFull([withResolvedScore(a, { k1TrackReductionDecisionRecordSha256: 'deadbeef' })]),
    );
    capture(() =>
      rankSetRFull([{ document: a.document, scorePreparation: simple('o', '1').scorePreparation }]),
    );
    expect(cases).toHaveLength(4);
    for (const error of cases) {
      const text = `${(error as Error).message} ${JSON.stringify(error)}`;
      for (const secret of [
        X,
        sha('o'),
        'secret-A1',
        'secret-A2',
        'secret-B1',
        '8.1234',
        '2.4321',
        'deadbeef',
      ]) {
        expect(text).not.toContain(secret);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Rank-helper integrity (R2's primitives, unchanged)
// ---------------------------------------------------------------------------

describe('2D-A3 R11: rank integrity through the canonical R2 helpers', () => {
  it('refuses mixed selection slots and mixed splits', () => {
    expect(() =>
      rankSetRFull([
        simple('s0', '1', { selectionIndex: 0 }),
        simple('s1', '1', { selectionIndex: 1 }),
      ]),
    ).toThrow(A3RankStop);
    expect(() =>
      rankSetRFull([
        simple('d0', '1', { split: 'DEV_TRAIN' }),
        simple('d1', '1', { split: 'DEV_CONFIRM' }),
      ]),
    ).toThrow(A3RankStop);
  });

  it('refuses a document identity that is not exactly 64 lower-case hex, without repairing it', () => {
    for (const bad of [sha('u').toUpperCase(), `${sha('u')} `, sha('u').slice(1), 'not-a-sha']) {
      expect(() => rankSetRFull([entry(bad, [pid('u')], '1')])).toThrow(A3RankStop);
    }
  });

  it('refuses a repeated document identity within one rank', () => {
    const X = sha('dup');
    expect(() => rankSetRFull([entry(X, [pid('d1')], '1'), entry(X, [pid('d2')], '2')])).toThrow(
      /exact duplicates must be resolved before ranking/,
    );
  });

  it('keeps R2 A3RankStop for helper failures (not rebranded)', () => {
    expect.assertions(2);
    try {
      rankSetRFull([
        simple('s0', '1', { selectionIndex: 0 }),
        simple('s1', '1', { selectionIndex: 1 }),
      ]);
    } catch (error) {
      expect(error).toBeInstanceOf(A3RankStop);
      expect(error).not.toBeInstanceOf(A3SetRRankRefusal);
    }
  });

  it('returns a frozen empty rank for empty input, as R2 SET_P does', () => {
    const rank = rankSetRFull([]);
    expect(rank).toEqual([]);
    expect(Object.isFrozen(rank)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

describe('2D-A3 R11: full, uncapped, identity-and-position output', () => {
  it('returns every input document — more than the SET_R cap — with no truncation', () => {
    const count = SET_R_MAX_PAGES_PER_ORGANISATION * 3 + 1;
    const pool = Array.from({ length: count }, (_, i) => simple(`full-${i}`, String(i % 3)));
    const rank = rankSetRFull(pool);
    expect(rank).toHaveLength(count);
    expect(new Set(shas(rank))).toEqual(new Set(pool.map((p) => p.document.documentSha256)));
  });

  it('exposes exactly the R1 ranked-document keys: no score, no provenance, no decision hashes', () => {
    const rank = rankSetRFull([entry(sha('keys'), [pid('k1'), pid('k2')], '3')]);
    const [only] = rank;
    expect(Object.keys(only!).sort()).toEqual(
      [
        'documentSha256',
        'rankPosition',
        'saltedRankSha256',
        'sample',
        'selectionIndex',
        'split',
      ].sort(),
    );
    const serialised = JSON.stringify(rank);
    for (const leak of [
      'resolvedScoreDecimal',
      'sourcePageEvidenceIds',
      'sourceRowScores',
      'trackScores',
      'candidateScoreDecimal',
      'pageSetRScoreDecimal',
      K1_OWNER_DECISION.decisionRecordSha256,
      K2_OWNER_DECISION.decisionRecordSha256,
      'page-k1',
      '3.0000',
    ]) {
      expect(serialised).not.toContain(leak);
    }
  });

  it('carries the document slot and split through unchanged', () => {
    const rank = rankSetRFull([simple('slot', '1', { selectionIndex: 7, split: 'FINAL_HOLDOUT' })]);
    expect(rank[0]).toMatchObject({ selectionIndex: 7, split: 'FINAL_HOLDOUT', sample: 'SET_R' });
  });
});

describe('2D-A3 R11: immutability', () => {
  it('mutates no input and freezes the rank and every entry', () => {
    const documents: A3DistinctDocument[] = ['i1', 'i2', 'i3'].map((l) => ({
      selectionIndex: 0 as A3SelectionIndex,
      split: 'DEV_TRAIN',
      documentSha256: sha(l),
      sourcePageEvidenceIds: [pid(l)],
    }));
    const pool: A3SetRRankInput[] = documents.map((document, i) => ({
      document,
      scorePreparation: entry(document.documentSha256, document.sourcePageEvidenceIds, String(i))
        .scorePreparation,
    }));
    const snapshot = JSON.stringify(pool);
    const order = pool.map((p) => p.document.documentSha256);
    const rank = rankSetRFull(pool);
    expect(JSON.stringify(pool)).toBe(snapshot);
    expect(pool.map((p) => p.document.documentSha256)).toEqual(order);
    expect(Object.isFrozen(rank)).toBe(true);
    for (const r of rank) expect(Object.isFrozen(r)).toBe(true);
    // Caller-owned objects are not deep-frozen on the caller's behalf.
    expect(Object.isFrozen(pool)).toBe(false);
    for (const d of documents) expect(Object.isFrozen(d)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R10 -> R11 end to end
// ---------------------------------------------------------------------------

describe('2D-A3 R11: genuine R10 -> R11 integration', () => {
  it('ranks by the score R10 reduced (K1 max across tracks, K2 max across rows), never re-reducing', () => {
    // multi: rows reduce to max(max(1, 4.5), max(-2, 0)) = 4.5000
    const multi = entry(sha('int-multi'), [pid('im1'), pid('im2')], 'unused', {
      rowScores: [
        ['1', '4.5'],
        ['-2', '0'],
      ],
    });
    // trackB: the Track-B score wins K1: max(-3, 4.5) = 4.5000 -> ties with multi.
    const trackB = entry(sha('int-trackb'), [pid('ib1')], 'unused', { rowScores: [['-3', '4.5']] });
    // single: 5.0000, above both.
    const single = entry(sha('int-single'), [pid('is1')], 'unused', { rowScores: [['5', '-1']] });
    // negative: every observation negative -> -0.5000, last.
    const negative = entry(sha('int-neg'), [pid('in1'), pid('in2')], 'unused', {
      rowScores: [
        ['-1', '-0.5'],
        ['-7', '-9'],
      ],
    });
    expect(multi.scorePreparation.resolvedScore.resolvedScoreDecimal).toBe('4.5000');
    expect(trackB.scorePreparation.resolvedScore.resolvedScoreDecimal).toBe('4.5000');
    expect(single.scorePreparation.resolvedScore.resolvedScoreDecimal).toBe('5.0000');
    expect(negative.scorePreparation.resolvedScore.resolvedScoreDecimal).toBe('-0.5000');

    const tie = [sha('int-multi'), sha('int-trackb')].sort((a, b) =>
      referenceTieBreak(a) < referenceTieBreak(b) ? -1 : 1,
    );
    const rank = rankSetRFull([negative, trackB, single, multi]);
    expect(shas(rank)).toEqual([sha('int-single'), ...tie, sha('int-neg')]);
    expect(rank.map((r) => r.rankPosition)).toEqual([0, 1, 2, 3]);
  });
});

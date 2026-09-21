/**
 * PHASE 2B-2D A3 R2 — DETERMINISTIC SET_P RANKING OVER A CALLER-SUPPLIED POOL.
 *
 * Every identity here is INVENTED: document SHA-256s are either repeated hex
 * digits or the SHA-256 of a synthetic label. No real organisation, host, URL,
 * page or sealed-split value is read or named.
 *
 * The known vectors were computed OUTSIDE the function under test, with
 * `printf '%s' "SET_P_V2_R2:<sha>" | shasum -a 256`, so they catch a missing
 * or doubled colon, an encoding change or any normalisation.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_P_RANK_KEY_PREFIX,
} from '../harness/phase2b2d/a3prep/contracts.js';
import {
  A3RankStop,
  assertUniqueRankDigests,
  comparePlainLexicographic,
  prefixedDocumentRankHash,
  sha256Utf8Exact,
} from '../harness/phase2b2d/a3prep/rank.js';
import {
  rankSetPFull,
  selectSetPOrganisationCap,
  type A3SetPRankedDocument,
} from '../harness/phase2b2d/a3prep/setP.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3PageEvidenceId,
  A3SelectionIndex,
} from '../harness/phase2b2d/a3prep/types.js';
import type { Split } from '../harness/phase2b2d/sd7/sd7Contract.js';

// ---------------------------------------------------------------------------
// Synthetic fixtures (invented only)
// ---------------------------------------------------------------------------

const VECTOR_DOC = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
/** shasum of "SET_P_V2_R2:" + VECTOR_DOC. */
const VECTOR_EXPECTED = '06e62ccb914754c801dc7b67e1a7736eeb0a4cdaba43f4ac57b7de8b1654b880';
/** shasum of "SET_P_V2_R2::" + VECTOR_DOC - the double-colon mistake. */
const VECTOR_DOUBLE_COLON = '87ef80955740af21827716e96c7d98b3783d999d1e6fadd9e355df1430e2fff0';
/** shasum of "SET_P_V2_R2" + VECTOR_DOC - the missing-colon mistake. */
const VECTOR_NO_COLON = 'f2581790418b8d316f432cd4dae5ca1c47d32b78b31ca1a3dba4af14ff8bcf42';

/** shasum of "SET_P_V2_R2:" + 64 x digit, in expected ascending order. */
const REPEATED_DIGIT_EXPECTED = [
  ['1', '387a5c687b112816e5f2f6cec4e6056114ac612ccf8a3f16c3f7967061d0b6d3'],
  ['3', '3f96aaf4199755a16c289e1feb8acf2a4e298fe01cc8e5f713e5cc27731672d1'],
  ['2', '5d25829ed498f390ab4f799829ffa0da01870aab1fbd2a473d68e4457da42087'],
  ['4', '6037c8e1677c435ee475c1b31984025f4ee27b83d551f4b5aa9a569efb36ed91'],
] as const;

function syntheticSha(label: string): string {
  return createHash('sha256').update(`synthetic-a3-r2:${label}`, 'utf8').digest('hex');
}

function doc(
  documentSha256: string,
  selectionIndex = 7,
  split: Split = 'DEV_TRAIN',
): A3DistinctDocument {
  return {
    selectionIndex: selectionIndex as A3SelectionIndex,
    split,
    documentSha256: documentSha256 as A3DocumentSha256,
    sourcePageEvidenceIds: [`synthetic-page-${documentSha256.slice(0, 8)}` as A3PageEvidenceId],
  };
}

function pool(count: number): A3DistinctDocument[] {
  return Array.from({ length: count }, (_, i) => doc(syntheticSha(`doc-${i}`)));
}

/** Every permutation of a small array, in a fixed order. */
function allPermutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  items.forEach((head, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of allPermutations(rest)) out.push([head, ...tail]);
  });
  return out;
}

/** Explicit, non-random reorderings of a larger array. */
function fixedReorderings<T>(items: readonly T[]): T[][] {
  const n = items.length;
  const out: T[][] = [[...items], [...items].reverse()];
  for (let k = 1; k < n; k += 1) out.push([...items.slice(k), ...items.slice(0, k)]);
  out.push([...items.filter((_, i) => i % 2 === 1), ...items.filter((_, i) => i % 2 === 0)]);
  out.push(
    [...items].sort((a, b) => comparePlainLexicographic(JSON.stringify(b), JSON.stringify(a))),
  );
  return out;
}

function expectStop(fn: () => unknown, pattern: RegExp): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(A3RankStop);
  expect((caught as Error).message).toMatch(/^STOP: /);
  expect((caught as Error).message).toMatch(pattern);
}

// ---------------------------------------------------------------------------
// 1. Key bytes
// ---------------------------------------------------------------------------

describe('2D-A3 R2: the SET_P key bytes are exactly "SET_P_V2_R2:" + documentSha256', () => {
  it('the canonical prefix already ends in one colon', () => {
    expect(SET_P_RANK_KEY_PREFIX).toBe('SET_P_V2_R2:');
  });

  it('matches the independently computed vector, and neither the double- nor the missing-colon variant', () => {
    const digest = prefixedDocumentRankHash(SET_P_RANK_KEY_PREFIX, VECTOR_DOC);
    expect(digest).toBe(VECTOR_EXPECTED);
    expect(digest).not.toBe(VECTOR_DOUBLE_COLON);
    expect(digest).not.toBe(VECTOR_NO_COLON);
    expect(rankSetPFull([doc(VECTOR_DOC)])[0]!.saltedRankSha256).toBe(VECTOR_EXPECTED);
  });

  it('sha256Utf8Exact hashes the exact string, with no trim or case change', () => {
    expect(sha256Utf8Exact(`SET_P_V2_R2:${VECTOR_DOC}`)).toBe(VECTOR_EXPECTED);
    expect(sha256Utf8Exact(`SET_P_V2_R2::${VECTOR_DOC}`)).toBe(VECTOR_DOUBLE_COLON);
    expect(sha256Utf8Exact(` SET_P_V2_R2:${VECTOR_DOC}`)).not.toBe(VECTOR_EXPECTED);
    expect(sha256Utf8Exact('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('refuses a prefix with no trailing colon, a doubled colon, or no body', () => {
    for (const bad of ['SET_P_V2_R2', 'SET_P_V2_R2::', ':', '']) {
      expectStop(() => prefixedDocumentRankHash(bad, VECTOR_DOC), /exactly one colon/);
    }
  });

  it('the comparator is plain code-unit order', () => {
    expect(comparePlainLexicographic('a', 'b')).toBe(-1);
    expect(comparePlainLexicographic('b', 'a')).toBe(1);
    expect(comparePlainLexicographic('a', 'a')).toBe(0);
    // Locale collation would put 'a' before 'B'; code units put 'B' (0x42) first.
    expect(comparePlainLexicographic('B', 'a')).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// 2. Full rank: order and determinism
// ---------------------------------------------------------------------------

describe('2D-A3 R2: rankSetPFull is a complete, deterministic, input-order-independent rank', () => {
  it('orders the known repeated-digit set exactly as the independent vectors say', () => {
    const inputs = ['1', '2', '3', '4'].map((d) => doc(d.repeat(64)));
    const ranked = rankSetPFull(inputs);
    expect(ranked.map((r) => [r.documentSha256[0], r.saltedRankSha256])).toEqual(
      REPEATED_DIGIT_EXPECTED.map(([d, h]) => [d, h]),
    );
    expect(ranked.map((r) => r.rankPosition)).toEqual([0, 1, 2, 3]);
  });

  it('every one of the 24 input orders of that set gives byte-identical output', () => {
    const inputs = ['1', '2', '3', '4'].map((d) => doc(d.repeat(64)));
    const reference = JSON.stringify(rankSetPFull(inputs));
    const permutations = allPermutations(inputs);
    expect(permutations).toHaveLength(24);
    for (const permutation of permutations) {
      expect(JSON.stringify(rankSetPFull(permutation))).toBe(reference);
    }
  });

  it('explicit reorderings of a 12-document pool give identical full ranks and cap views', () => {
    const base = pool(12);
    const reference = rankSetPFull(base);
    const referenceCap = selectSetPOrganisationCap(reference);
    const reorderings = fixedReorderings(base);
    expect(reorderings.length).toBeGreaterThanOrEqual(14);
    for (const reordering of reorderings) {
      const full = rankSetPFull(reordering);
      expect(JSON.stringify(full)).toBe(JSON.stringify(reference));
      expect(JSON.stringify(selectSetPOrganisationCap(full))).toBe(JSON.stringify(referenceCap));
    }
  });

  it('returns every input document exactly once, in ascending salted-digest order', () => {
    const base = pool(20);
    const ranked = rankSetPFull(base);
    expect(ranked).toHaveLength(20);
    expect(new Set(ranked.map((r) => r.documentSha256))).toEqual(
      new Set(base.map((d) => d.documentSha256)),
    );
    for (let i = 1; i < ranked.length; i += 1) {
      expect(
        comparePlainLexicographic(ranked[i - 1]!.saltedRankSha256, ranked[i]!.saltedRankSha256),
      ).toBe(-1);
    }
    for (const entry of ranked) {
      expect(entry.saltedRankSha256).toBe(
        createHash('sha256').update(`SET_P_V2_R2:${entry.documentSha256}`, 'utf8').digest('hex'),
      );
    }
  });

  it('carries the slot and split through, pins sample to SET_P, and nothing else', () => {
    const ranked = rankSetPFull([doc(syntheticSha('x'), 42, 'DEV_CONFIRM')]);
    expect(Object.keys(ranked[0]!).sort()).toEqual(
      [
        'documentSha256',
        'rankPosition',
        'sample',
        'saltedRankSha256',
        'selectionIndex',
        'split',
      ].sort(),
    );
    expect(ranked[0]).toMatchObject({ sample: 'SET_P', selectionIndex: 42, split: 'DEV_CONFIRM' });
    // Source page-evidence ids are input provenance, not part of the rank output.
    expect(JSON.stringify(ranked)).not.toMatch(/synthetic-page-|sourcePageEvidenceIds/);
  });

  it('does not mutate its input and returns frozen output', () => {
    const base = pool(9);
    const snapshot = JSON.stringify(base);
    const ranked = rankSetPFull(base);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(Object.isFrozen(ranked)).toBe(true);
    expect(ranked.every((r) => Object.isFrozen(r))).toBe(true);
  });

  it('empty input gives an empty rank and an empty cap', () => {
    expect(rankSetPFull([])).toEqual([]);
    expect(selectSetPOrganisationCap(rankSetPFull([]))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. The cap-8 view
// ---------------------------------------------------------------------------

describe('2D-A3 R2: the cap-8 view is exactly a prefix of the full rank', () => {
  it('the cap is the frozen 8', () => {
    expect(SET_P_MAX_PAGES_PER_ORGANISATION).toBe(8);
  });

  for (const count of [0, 1, 7, 8, 9, 16, 30]) {
    it(`${count} documents: cap === fullRank.slice(0, 8)`, () => {
      const full = rankSetPFull(pool(count));
      const capped = selectSetPOrganisationCap(full);
      expect(full).toHaveLength(count);
      expect(capped).toHaveLength(Math.min(count, 8));
      expect(capped).toEqual(full.slice(0, 8));
      capped.forEach((entry, i) => expect(entry).toBe(full[i]));
    });
  }

  it('refuses a list that is not a complete SET_P rank', () => {
    const full = rankSetPFull(pool(10));
    // Already cut from the middle: positions do not start at 0.
    expectStop(() => selectSetPOrganisationCap(full.slice(2)), /full SET_P rank/);
    // Reordered: positions out of sequence.
    expectStop(() => selectSetPOrganisationCap([...full].reverse()), /full SET_P rank/);
    // Wrong sample.
    const relabelled = full.map((r) => ({
      ...r,
      sample: 'SET_R',
    })) as unknown as A3SetPRankedDocument[];
    expectStop(() => selectSetPOrganisationCap(relabelled), /full SET_P rank/);
  });
});

// ---------------------------------------------------------------------------
// 4. Full-rank provenance
// ---------------------------------------------------------------------------

describe('2D-A3 R2: documents beyond the cap stay in the full rank', () => {
  it('positions 8+ remain in fullRank, are absent only from the cap, and never move', () => {
    const base = pool(13);
    const full = rankSetPFull(base);
    const capped = selectSetPOrganisationCap(full);
    const beyond = full.slice(8);
    expect(beyond.map((r) => r.rankPosition)).toEqual([8, 9, 10, 11, 12]);
    const cappedShas = new Set(capped.map((r) => r.documentSha256));
    for (const entry of beyond) expect(cappedShas.has(entry.documentSha256)).toBe(false);
    // The cap view touches no position: every full-rank position is what the rank assigned.
    expect(full.map((r) => r.rankPosition)).toEqual([...Array(13).keys()]);
  });

  it('a later extension reads positions 8+ from the SAME rank, never a recomputation', () => {
    const base = pool(13);
    const full = rankSetPFull(base);
    // Ranking the pool again, or ranking only the pages beyond the cap, agrees with
    // the positions already held: extension is a read of fullRank, not a re-rank.
    expect(rankSetPFull(base)).toEqual(full);
    const beyondOnly = rankSetPFull(
      base.filter((d) => full.slice(8).some((r) => r.documentSha256 === d.documentSha256)),
    );
    expect(beyondOnly.map((r) => r.documentSha256)).toEqual(
      full.slice(8).map((r) => r.documentSha256),
    );
  });

  it('a document keeps its full-rank position whether or not the cap view is taken', () => {
    const full = rankSetPFull(pool(11));
    const before = JSON.stringify(full);
    selectSetPOrganisationCap(full);
    expect(JSON.stringify(full)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 5. Fail closed
// ---------------------------------------------------------------------------

describe('2D-A3 R2: rankSetPFull fails closed and never canonicalises', () => {
  const good = syntheticSha('good');
  const MALFORMED: readonly [string, string][] = [
    ['length 63', good.slice(0, 63)],
    ['length 65', `${good}0`],
    ['upper-case hex', good.toUpperCase()],
    ['one upper-case char', `A${good.slice(1)}`],
    ['non-hex', `g${good.slice(1)}`],
    ['leading whitespace', ` ${good.slice(1)}`],
    ['trailing whitespace', `${good.slice(0, 63)} `],
    ['padded 64+2', ` ${good} `],
    ['empty', ''],
  ];

  for (const [name, value] of MALFORMED) {
    it(`refuses a malformed document identity: ${name}`, () => {
      expectStop(() => rankSetPFull([doc(syntheticSha('other')), doc(value)]), /64 lower-case hex/);
      expectStop(() => prefixedDocumentRankHash(SET_P_RANK_KEY_PREFIX, value), /64 lower-case hex/);
    });
  }

  it('refuses a repeated document identity rather than choosing a representative (K2)', () => {
    const a = syntheticSha('a');
    expectStop(
      () => rankSetPFull([doc(a), doc(syntheticSha('b')), doc(a)]),
      /positions 0 and 2 carry the same document identity/,
    );
  });

  it('refuses a pool spanning two selection slots', () => {
    expectStop(
      () => rankSetPFull([doc(syntheticSha('a'), 3), doc(syntheticSha('b'), 4)]),
      /different selection slot/,
    );
  });

  it('refuses a pool spanning two splits', () => {
    expectStop(
      () =>
        rankSetPFull([
          doc(syntheticSha('a'), 3, 'DEV_CONFIRM'),
          doc(syntheticSha('b'), 3, 'FINAL_HOLDOUT'),
        ]),
      /different split/,
    );
  });

  it('the collision guard refuses two distinct documents sharing one digest, with no fallback', () => {
    const digest = 'f'.repeat(64);
    expectStop(
      () =>
        assertUniqueRankDigests([
          { documentSha256: syntheticSha('a'), saltedRankSha256: digest },
          { documentSha256: syntheticSha('b'), saltedRankSha256: '0'.repeat(64) },
          { documentSha256: syntheticSha('c'), saltedRankSha256: digest },
        ]),
      /positions 0 and 2 are different documents with the same salted rank digest/,
    );
    // Distinct digests pass.
    expect(() =>
      assertUniqueRankDigests([
        { documentSha256: syntheticSha('a'), saltedRankSha256: '1'.repeat(64) },
        { documentSha256: syntheticSha('b'), saltedRankSha256: '2'.repeat(64) },
      ]),
    ).not.toThrow();
  });

  it('no refusal message carries a document identity', () => {
    const a = syntheticSha('secret-looking');
    for (const fn of [
      () => rankSetPFull([doc(a), doc(a)]),
      () => rankSetPFull([doc(a, 1), doc(syntheticSha('z'), 2)]),
      () =>
        assertUniqueRankDigests([
          { documentSha256: a, saltedRankSha256: 'e'.repeat(64) },
          { documentSha256: syntheticSha('y'), saltedRankSha256: 'e'.repeat(64) },
        ]),
    ]) {
      let thrown = false;
      try {
        fn();
      } catch (error) {
        thrown = true;
        expect((error as Error).message).not.toContain(a);
        expect((error as Error).message).not.toMatch(/[0-9a-f]{64}/);
      }
      expect(thrown).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Class blindness (compile time + runtime)
// ---------------------------------------------------------------------------

type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;
type AssertFalse<T extends false> = T;
type SemanticKey =
  | 'unitType'
  | 'predictedClass'
  | 'goldLabel'
  | 'hardNegative'
  | 'needsReview'
  | 'classifierOutput'
  | 'track'
  | 'candidateScore'
  | 'candidateScoreDecimal';
// If any of these ever becomes a field of the rank input or output, typecheck fails.
export type _R2InputIsClassBlind = AssertFalse<HasKey<A3DistinctDocument, SemanticKey>>;
export type _R2OutputIsClassBlind = AssertFalse<HasKey<A3SetPRankedDocument, SemanticKey>>;

describe('2D-A3 R2: SET_P ranking is structurally class-blind', () => {
  it('a pool with no semantic, gold or score field ranks fully', () => {
    const ranked = rankSetPFull(pool(10));
    expect(ranked).toHaveLength(10);
    for (const entry of ranked) {
      for (const key of ['unitType', 'predictedClass', 'goldLabel', 'hardNegative', 'track']) {
        expect(key in entry, key).toBe(false);
      }
    }
  });
});

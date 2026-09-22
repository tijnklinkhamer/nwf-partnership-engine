/**
 * PHASE 2B-2D A3 R13 — THE SET_R CAP-4 DOCUMENT MEMBERSHIP, SET_R FULL-RANK
 * READINESS AND THE SET_R EXTENSION BOUNDARY. BEHAVIOUR.
 *
 * Every identity, score, graph and text here is INVENTED. No real corpus, no
 * sealed file, no database, no network. Every preparation is GENUINE R12
 * `prepareSetRSd7` output over GENUINE R10 score preparations.
 *
 * Scenarios are written in SET_R RANK positions: documents get distinct,
 * descending scores in input order, so R11's rank is input order; the
 * synthetic graph is stored REVERSED so any accidental use of graph order
 * shows up as a wrong answer.
 *
 * This file proves:
 *
 *   - the cap is EXACT in exactly the two proved cases and BLOCKED otherwise,
 *     over the full test matrix;
 *   - against an INDEPENDENT reference that enumerates every PRESENT/ABSENT
 *     subset of the unresolved short-text documents, R13 says EXACT iff the
 *     cap-4 membership is identical under every admissible treatment, returns
 *     that invariant membership, and - when BLOCKED - two treatments really
 *     do give different cap memberships;
 *   - the complete rank is blocked by ANY unresolved short text, including
 *     the key case where the cap is exact;
 *   - the invariant prefix and the extension boundary agree with the same
 *     reference at every position;
 *   - the cap proof is bound to the K3 GREEDY procedure;
 *   - results are frozen, R12's preparation is not mutated, and no blocked
 *     result, readiness summary or refusal carries a document identity.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  K3_SD7_SURVIVOR_PROCEDURE,
  SET_R_MAX_PAGES_PER_ORGANISATION,
  SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY,
  type Split,
} from '../harness/phase2b2d/a3prep/contracts.js';
import { SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED } from '../harness/phase2b2d/a3prep/sd7.js';
import type { A3SetRRankInput } from '../harness/phase2b2d/a3prep/setR.js';
import { prepareSetRDocumentScore } from '../harness/phase2b2d/a3prep/setRScore.js';
import { prepareSetRSd7, type A3SetRSd7Preparation } from '../harness/phase2b2d/a3prep/setRSd7.js';
import {
  A3SetRSd7ReadinessRefusal,
  checkSetRExtensionCursorAgainstShortTextBoundary,
  deriveSetRFreezeSlotReadiness,
  determineSetRDocumentCap,
  SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
  SET_R_DOCUMENT_CAP_EXACT,
  SET_R_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE,
  SET_R_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
  SET_R_EXTENSION_POSITION_EXACT,
  SET_R_EXTENSION_RANK_EXHAUSTED_EXACT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
  SET_R_INITIAL_CAP_EXACT,
  structuralIssueOfSetRFreezeSlotReadiness,
  type A3SetRDocumentCap,
  type A3SetRFreezeSlotReadiness,
  type A3SetRSd7ReadinessRefusalCode,
} from '../harness/phase2b2d/a3prep/setRSd7Readiness.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3PageEvidenceId,
  A3SelectionIndex,
  A3TrackCandidateObservation,
} from '../harness/phase2b2d/a3prep/types.js';
import type { NearDuplicateGraphMeasurement } from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';

// ---------------------------------------------------------------------------
// Synthetic builders (R12's pattern).
// ---------------------------------------------------------------------------

const SLOT = 11 as A3SelectionIndex;
const SLOT_SPLIT: Split = 'FINAL_HOLDOUT';

const sha = (label: string): A3DocumentSha256 =>
  createHash('sha256')
    .update(`synthetic-a3-r13:${label}`, 'utf8')
    .digest('hex') as A3DocumentSha256;

function obs(page: A3PageEvidenceId, track: string, score: string): A3TrackCandidateObservation {
  return {
    pageEvidenceId: page,
    track,
    candidateScoreDecimal: score,
    ruleVersion: 'orgunit-signal-rules-v1',
  } as never;
}

function entry(label: string, score: string): A3SetRRankInput {
  const documentSha256 = sha(label);
  const id = `pe-${label}-0` as A3PageEvidenceId;
  const document: A3DistinctDocument = {
    selectionIndex: SLOT,
    split: SLOT_SPLIT,
    documentSha256,
    sourcePageEvidenceIds: [id],
  };
  const scorePreparation = prepareSetRDocumentScore({
    document,
    sourceRows: [
      {
        pageEvidenceId: id,
        documentSha256,
        candidateObservations: [
          obs(id, 'INTERNATIONAL_OFFICE', score),
          obs(id, 'LANGUAGE_CENTRE', '-9999.9999'),
        ],
      },
    ],
  });
  return { document, scorePreparation };
}

const EDGE_MEASUREMENT = Object.freeze({
  intersectionSize: 9,
  unionSize: 10,
  similarity: 0.9,
  atOrAboveThreshold: true,
});

interface Scenario {
  readonly n: number;
  readonly short: readonly number[];
  readonly edges: readonly (readonly [number, number])[];
  readonly preparation: A3SetRSd7Preparation;
  readonly shaAtRank: readonly string[];
}

/**
 * n documents with distinct descending scores, so the SET_R rank is input
 * order. `short` and `edges` are rank positions; edges touching a short-text
 * position are dropped (the canonical graph has none).
 */
function scenario(
  n: number,
  short: readonly number[] = [],
  edges: readonly (readonly [number, number])[] = [],
  tag = 'd',
): Scenario {
  const rankInputs = Array.from({ length: n }, (_, i) => entry(`${tag}${i}`, String(100 - i)));
  const shaAtRank = rankInputs.map((r) => r.document.documentSha256 as string);
  const shortSet = new Set(short);
  const measurableEdges = edges.filter(
    ([a, b]) => a < n && b < n && a !== b && !shortSet.has(a) && !shortSet.has(b),
  );
  const graphRankOrder = Array.from({ length: n }, (_, i) => n - 1 - i);
  const graphIndexOfRank = new Map(graphRankOrder.map((rank, gi) => [rank, gi]));
  const documents = graphRankOrder.map((rank) => ({
    documentSha256: shaAtRank[rank]!,
    tokenCount: shortSet.has(rank) ? 2 : 50,
    shingleCount: shortSet.has(rank) ? 0 : 46,
    measurable: !shortSet.has(rank),
  }));
  const measurableIndices = documents.flatMap((d, i) => (d.measurable ? [i] : []));
  const graph: NearDuplicateGraphMeasurement = {
    documents,
    measurableIndices,
    shortTextUnresolvedCount: documents.length - measurableIndices.length,
    comparedPairCount: (measurableIndices.length * (measurableIndices.length - 1)) / 2,
    edges: measurableEdges.map(([a, b]) => {
      const x = graphIndexOfRank.get(a)!;
      const y = graphIndexOfRank.get(b)!;
      return { aIndex: Math.min(x, y), bIndex: Math.max(x, y), measurement: EDGE_MEASUREMENT };
    }),
  };
  const preparation = prepareSetRSd7({ rankInputs, graph });
  // Guard the fixture itself: R11 rank really is input order.
  expect(preparation.preSd7FullRank.map((r) => r.documentSha256)).toEqual(shaAtRank);
  return {
    n,
    short: [...short].sort((a, b) => a - b),
    edges: measurableEdges,
    preparation,
    shaAtRank,
  };
}

const capOf = (s: Scenario): A3SetRDocumentCap => determineSetRDocumentCap(s.preparation);

function readinessOf(s: Scenario): A3SetRFreezeSlotReadiness {
  return deriveSetRFreezeSlotReadiness({
    selectionIndex: SLOT,
    split: SLOT_SPLIT,
    preparation: s.preparation,
  });
}

const capSources = (cap: A3SetRDocumentCap): number[] =>
  cap.status === SET_R_DOCUMENT_CAP_EXACT ? cap.documents.map((d) => d.sourceRankPosition) : [];

// ---------------------------------------------------------------------------
// INDEPENDENT REFERENCE over SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1.
// Test logic only: every unresolved document independently ABSENT or PRESENT
// at its frozen rank position, measurable survivors never evicted. No SD7 edge
// is ever created for a short-text document. Written from the policy wording,
// not from the module under test.
// ---------------------------------------------------------------------------

function referenceGreedyMeasurableSurvivors(s: Scenario): number[] {
  const kept: number[] = [];
  for (let p = 0; p < s.n; p += 1) {
    if (s.short.includes(p)) continue;
    const blocked = kept.some((k) =>
      s.edges.some(([a, b]) => (a === p && b === k) || (a === k && b === p)),
    );
    if (!blocked) kept.push(p);
  }
  return kept;
}

/** Every admissible complete membership, one per PRESENT/ABSENT subset. */
function referenceCompleteMemberships(s: Scenario): number[][] {
  const survivors = referenceGreedyMeasurableSurvivors(s);
  const out: number[][] = [];
  for (let mask = 0; mask < 1 << s.short.length; mask += 1) {
    const present = s.short.filter((_, i) => (mask & (1 << i)) !== 0);
    out.push([...survivors, ...present].sort((a, b) => a - b));
  }
  return out;
}

const referenceCapOf = (membership: readonly number[]): number[] =>
  membership.slice(0, SET_R_MAX_PAGES_PER_ORGANISATION);

const sameList = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

function referenceInvariantPrefixLength(memberships: readonly number[][]): number {
  let length = 0;
  for (;;) {
    const first = memberships[0]![length];
    if (first === undefined) return length;
    if (!memberships.every((m) => m[length] === first)) return length;
    length += 1;
  }
}

// ---------------------------------------------------------------------------
// 35. CAP-4 TEST MATRIX
// ---------------------------------------------------------------------------

describe('2D-A3 R13: the SET_R cap-4 test matrix', () => {
  it('the frozen SET_R cap is 4', () => {
    expect(SET_R_MAX_PAGES_PER_ORGANISATION).toBe(4);
  });

  describe('no unresolved short text: EXACT, the first min(4, n) survivors', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 9]) {
      it(`${n} measurable survivors -> exact ${Math.min(4, n)}`, () => {
        const cap = capOf(scenario(n));
        expect(cap.status).toBe(SET_R_DOCUMENT_CAP_EXACT);
        if (cap.status !== SET_R_DOCUMENT_CAP_EXACT) return;
        expect(cap.reason).toBe('NO_UNRESOLVED_SHORT_TEXT');
        expect(capSources(cap)).toEqual(Array.from({ length: Math.min(4, n) }, (_, i) => i));
      });
    }

    it('exclusions shift the cap to the first four SURVIVORS, not the first four ranks', () => {
      const cap = capOf(scenario(7, [], [[0, 1]]));
      expect(capSources(cap)).toEqual([0, 2, 3, 4]);
      if (cap.status === SET_R_DOCUMENT_CAP_EXACT) {
        expect(cap.documents.map((d) => d.survivorRankPosition)).toEqual([0, 1, 2, 3]);
      }
    });
  });

  interface MatrixCase {
    readonly name: string;
    readonly n: number;
    readonly short: readonly number[];
    readonly edges?: readonly (readonly [number, number])[];
    readonly exact: readonly number[] | null;
  }
  const withShort: readonly MatrixCase[] = [
    { name: '0 measurable + unresolved (all short text)', n: 3, short: [0, 1, 2], exact: null },
    { name: '1 measurable + unresolved', n: 2, short: [1], exact: null },
    { name: '2 measurable + unresolved', n: 3, short: [2], exact: null },
    { name: '3 measurable + unresolved (after all three)', n: 4, short: [3], exact: null },
    { name: '4 measurable, unresolved after the fourth', n: 5, short: [4], exact: [0, 1, 2, 3] },
    { name: '5+ measurable, unresolved after the fourth', n: 8, short: [5], exact: [0, 1, 2, 3] },
    { name: 'unresolved immediately before the fourth', n: 6, short: [3], exact: null },
    { name: 'unresolved at the beginning', n: 8, short: [0], exact: null },
    { name: 'unresolved between #1 and #4', n: 8, short: [2], exact: null },
    {
      name: 'multiple unresolved, all after the fourth',
      n: 9,
      short: [4, 6, 8],
      exact: [0, 1, 2, 3],
    },
    { name: 'one before the fourth, others after', n: 9, short: [1, 6, 8], exact: null },
    {
      name: 'exclusions push the fourth survivor after an unresolved position',
      n: 8,
      short: [5],
      edges: [
        [0, 1],
        [2, 3],
      ],
      exact: null,
    },
    {
      name: 'exclusions before the fourth, unresolved still after it',
      n: 9,
      short: [7],
      edges: [
        [0, 1],
        [2, 3],
      ],
      exact: [0, 2, 4, 5],
    },
    { name: 'all short text, long rank', n: 6, short: [0, 1, 2, 3, 4, 5], exact: null },
  ];

  describe('with unresolved short text', () => {
    for (const c of withShort) {
      it(`${c.name} -> ${c.exact === null ? 'BLOCKED' : 'EXACT'}`, () => {
        const s = scenario(c.n, c.short, c.edges ?? []);
        const cap = capOf(s);
        if (c.exact === null) {
          expect(cap.status).toBe(SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP);
          if (cap.status !== SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP) return;
          const survivors = s.preparation.measurableSurvivorAwareFullRank;
          expect(cap).toEqual({
            status: SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
            openIssue: SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
            measurableSurvivorCount: survivors.length,
            shortTextUnresolvedCount: c.short.length,
            earliestUnresolvedShortTextSourceRankPosition: Math.min(...c.short),
            capBoundaryMeasurableSurvivorSourceRankPosition:
              survivors[3]?.sourceRankPosition ?? null,
          });
        } else {
          expect(cap.status).toBe(SET_R_DOCUMENT_CAP_EXACT);
          if (cap.status !== SET_R_DOCUMENT_CAP_EXACT) return;
          expect(cap.reason).toBe('FOUR_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT');
          expect(capSources(cap)).toEqual(c.exact);
        }
      });
    }
  });

  it('the exact documents ARE R12’s survivor objects: no new identity, no score, no provenance', () => {
    const s = scenario(8, [6]);
    const cap = capOf(s);
    expect(cap.status).toBe(SET_R_DOCUMENT_CAP_EXACT);
    if (cap.status !== SET_R_DOCUMENT_CAP_EXACT) return;
    cap.documents.forEach((d, i) => {
      expect(d).toBe(s.preparation.measurableSurvivorAwareFullRank[i]);
      expect(Object.keys(d).sort()).toEqual([
        'documentSha256',
        'saltedRankSha256',
        'sample',
        'selectionIndex',
        'sourceRankPosition',
        'split',
        'survivorRankPosition',
      ]);
    });
  });

  it('the blocked result carries no document list, identity or digest under any name', () => {
    const s = scenario(8, [2]);
    const cap = capOf(s);
    expect(Object.keys(cap).sort()).toEqual([
      'capBoundaryMeasurableSurvivorSourceRankPosition',
      'earliestUnresolvedShortTextSourceRankPosition',
      'measurableSurvivorCount',
      'openIssue',
      'shortTextUnresolvedCount',
      'status',
    ]);
    const serialised = JSON.stringify(cap);
    for (const digest of s.shaAtRank) expect(serialised).not.toContain(digest);
    expect(serialised).not.toMatch(/[0-9a-f]{64}|documents|selectionIndex|score/i);
  });
});

// ---------------------------------------------------------------------------
// 19. TREATMENT-SPACE REFERENCE: EXACT IFF INVARIANT
// ---------------------------------------------------------------------------

function allFixtures(): Scenario[] {
  const edgePatterns: readonly (readonly (readonly [number, number])[])[] = [
    [],
    [[0, 1]],
    [
      [1, 3],
      [2, 4],
    ],
    [
      [0, 5],
      [3, 6],
    ],
  ];
  const out: Scenario[] = [];
  for (let n = 0; n <= 7; n += 1) {
    for (let mask = 0; mask < 1 << n; mask += 1) {
      const short = Array.from({ length: n }, (_, i) => i).filter((i) => (mask & (1 << i)) !== 0);
      edgePatterns.forEach((edges, e) => {
        if (e > 0 && n < 2) return;
        out.push(scenario(n, short, edges, `f${n}-${mask}-${e}-`));
      });
    }
  }
  return out;
}

describe('2D-A3 R13: EXACT iff the cap-4 membership is invariant under every admissible treatment', () => {
  const fixtures = allFixtures();

  it('covers every short-text subset of ranks up to 7, under four edge patterns', () => {
    expect(fixtures.length).toBeGreaterThan(900);
    expect(fixtures.some((s) => s.short.length === s.n && s.n > 0)).toBe(true);
    expect(
      fixtures.some((s) => capOf(s).status === SET_R_DOCUMENT_CAP_EXACT && s.short.length > 0),
    ).toBe(true);
  });

  it('the reference survivors are R12’s survivors (the fixtures are faithful)', () => {
    for (const s of fixtures) {
      expect(
        s.preparation.measurableSurvivorAwareFullRank.map((d) => d.sourceRankPosition),
      ).toEqual(referenceGreedyMeasurableSurvivors(s));
    }
  });

  it('EXACT iff invariant; EXACT documents equal the invariant cap; BLOCKED has a two-treatment witness', () => {
    let exactCount = 0;
    let exactWithShortTextCount = 0;
    let blockedCount = 0;
    for (const s of fixtures) {
      const caps = referenceCompleteMemberships(s).map(referenceCapOf);
      const invariant = caps.every((c) => sameList(c, caps[0]!));
      const cap = capOf(s);
      expect(cap.status === SET_R_DOCUMENT_CAP_EXACT, JSON.stringify(s.short)).toBe(invariant);
      if (cap.status === SET_R_DOCUMENT_CAP_EXACT) {
        exactCount += 1;
        if (s.short.length > 0) exactWithShortTextCount += 1;
        expect(capSources(cap)).toEqual(caps[0]);
      } else {
        blockedCount += 1;
        const witness = caps.find((c) => !sameList(c, caps[0]!));
        expect(witness, 'two admissible treatments must differ').toBeDefined();
      }
    }
    expect(exactCount).toBeGreaterThan(40);
    expect(exactWithShortTextCount).toBeGreaterThan(10);
    expect(blockedCount).toBeGreaterThan(500);
  });

  it('the canonical ABSENT-for-all and PRESENT-for-all treatments already witness every BLOCKED case', () => {
    for (const s of fixtures) {
      if (capOf(s).status === SET_R_DOCUMENT_CAP_EXACT) continue;
      const memberships = referenceCompleteMemberships(s);
      const allAbsent = referenceCapOf(memberships[0]!);
      const allPresent = referenceCapOf(memberships[memberships.length - 1]!);
      expect(sameList(allAbsent, allPresent)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 13 / 18 / 36. FULL-RANK READINESS, AND THE CAP-EXACT / RANK-BLOCKED CASE
// ---------------------------------------------------------------------------

describe('2D-A3 R13: initial cap versus complete rank', () => {
  it('CRITICAL REGRESSION: 4+ survivors all before the unresolved short text -> cap EXACT, full rank BLOCKED', () => {
    const s = scenario(7, [6]);
    expect(capOf(s).status).toBe(SET_R_DOCUMENT_CAP_EXACT);
    const r = readinessOf(s);
    expect(r.initialCapReadiness).toBe(SET_R_INITIAL_CAP_EXACT);
    expect(r.fullRankReadiness).toBe(SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT);
    // The reference agrees: the complete memberships really do differ.
    const memberships = referenceCompleteMemberships(s);
    expect(memberships.map((m) => m.join(','))).toEqual(['0,1,2,3,4,5', '0,1,2,3,4,5,6']);
  });

  it('full rank is EXACT iff there is no unresolved short text, for any survivor count', () => {
    for (const s of allFixtures().filter((_, i) => i % 7 === 0)) {
      const r = readinessOf(s);
      expect(r.fullRankReadiness).toBe(
        s.short.length === 0
          ? SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT
          : SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
      );
      const memberships = referenceCompleteMemberships(s);
      const referenceExact = memberships.every((m) => sameList(m, memberships[0]!));
      expect(r.fullRankReadiness === SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT).toBe(referenceExact);
    }
  });

  it('initial-cap readiness restates the cap status exactly', () => {
    for (const s of allFixtures().filter((_, i) => i % 5 === 0)) {
      expect(readinessOf(s).initialCapReadiness).toBe(
        capOf(s).status === SET_R_DOCUMENT_CAP_EXACT
          ? SET_R_INITIAL_CAP_EXACT
          : SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 16 / 37. INVARIANT PREFIX AND EXTENSION BOUNDARY
// ---------------------------------------------------------------------------

describe('2D-A3 R13: the invariant prefix and the SET_R extension boundary', () => {
  const cases: readonly {
    name: string;
    s: () => Scenario;
    prefix: number;
    first: number | null;
  }[] = [
    { name: 'unresolved at source position 0', s: () => scenario(6, [0]), prefix: 0, first: 0 },
    { name: 'unresolved in the middle', s: () => scenario(8, [3]), prefix: 3, first: 3 },
    { name: 'unresolved after four', s: () => scenario(8, [5]), prefix: 5, first: 5 },
    { name: 'unresolved at the tail', s: () => scenario(8, [7]), prefix: 7, first: 7 },
    {
      name: 'multiple unresolved: the earliest controls',
      s: () => scenario(9, [6, 2, 8]),
      prefix: 2,
      first: 2,
    },
    {
      name: 'exclusions before the boundary shrink the prefix',
      s: () => scenario(9, [6], [[0, 1]]),
      prefix: 5,
      first: 6,
    },
    { name: 'no unresolved: whole rank', s: () => scenario(6), prefix: 6, first: null },
  ];
  for (const c of cases) {
    it(`${c.name}: prefix ${c.prefix}, boundary ${String(c.first)}, agreeing with the reference`, () => {
      const s = c.s();
      const r = readinessOf(s);
      expect(r.exactMeasurableSurvivorPrefixCount).toBe(c.prefix);
      expect(r.firstBlockedSourceRankPosition).toBe(c.first);
      expect(r.exactMeasurableSurvivorPrefixCount).toBe(
        s.short.length === 0
          ? referenceGreedyMeasurableSurvivors(s).length
          : referenceInvariantPrefixLength(referenceCompleteMemberships(s)),
      );
    });
  }

  it('blocked rank: EXACT strictly inside the prefix, BLOCKED at and beyond it', () => {
    const r = readinessOf(scenario(8, [5]));
    for (let p = 0; p < 12; p += 1) {
      expect(checkSetRExtensionCursorAgainstShortTextBoundary(r, p)).toBe(
        p < 5
          ? SET_R_EXTENSION_POSITION_EXACT
          : SET_R_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
      );
    }
  });

  it('boundary at 0: even the first position is blocked', () => {
    const r = readinessOf(scenario(6, [0]));
    expect(checkSetRExtensionCursorAgainstShortTextBoundary(r, 0)).toBe(
      SET_R_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
    );
  });

  it('exact rank: EXACT inside, RANK_EXHAUSTED_EXACT beyond - never blocked', () => {
    const r = readinessOf(scenario(5));
    expect(
      [0, 1, 2, 3, 4, 5, 6, 40].map((p) => checkSetRExtensionCursorAgainstShortTextBoundary(r, p)),
    ).toEqual([
      ...Array(5).fill(SET_R_EXTENSION_POSITION_EXACT),
      SET_R_EXTENSION_RANK_EXHAUSTED_EXACT,
      SET_R_EXTENSION_RANK_EXHAUSTED_EXACT,
      SET_R_EXTENSION_RANK_EXHAUSTED_EXACT,
    ]);
  });

  it('agrees with the reference at every position over the fixture space', () => {
    for (const s of allFixtures().filter((_, i) => i % 3 === 0)) {
      const r = readinessOf(s);
      const memberships = referenceCompleteMemberships(s);
      for (let p = 0; p <= s.n + 1; p += 1) {
        const values = new Set(memberships.map((m) => m[p] ?? -1));
        const invariantPresent = values.size === 1 && !values.has(-1);
        const invariantAbsent = values.size === 1 && values.has(-1);
        const token = checkSetRExtensionCursorAgainstShortTextBoundary(r, p);
        if (token === SET_R_EXTENSION_POSITION_EXACT) expect(invariantPresent).toBe(true);
        if (token === SET_R_EXTENSION_RANK_EXHAUSTED_EXACT) expect(invariantAbsent).toBe(true);
        if (token === SET_R_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED) {
          // Every blocked position is at or past the earliest variable one.
          expect(p).toBeGreaterThanOrEqual(referenceInvariantPrefixLength(memberships));
        }
      }
    }
  });

  it('refuses an invalid cursor and a malformed summary, naming no value', () => {
    const r = readinessOf(scenario(8, [5]));
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => checkSetRExtensionCursorAgainstShortTextBoundary(r, bad)).toThrow(
        /EXTENSION_CURSOR_INVALID/,
      );
    }
    const malformed = { ...r, exactMeasurableSurvivorPrefixCount: 99 };
    expect(() => checkSetRExtensionCursorAgainstShortTextBoundary(malformed, 0)).toThrow(
      /READINESS_INVALID/,
    );
    const foreign = { ...r, kind: 'A3_SET_P_FREEZE_SLOT_READINESS_SANITISED' } as never;
    expect(() => checkSetRExtensionCursorAgainstShortTextBoundary(foreign, 0)).toThrow(
      /READINESS_INVALID/,
    );
  });
});

// ---------------------------------------------------------------------------
// 14. SANITISED SET_R SLOT READINESS
// ---------------------------------------------------------------------------

describe('2D-A3 R13: sanitised SET_R slot readiness', () => {
  it('has exactly the sanitised fields and no identity, digest, score or URL', () => {
    const s = scenario(9, [6, 8], [[0, 1]]);
    const r = readinessOf(s);
    expect(r).toEqual({
      kind: 'A3_SET_R_FREEZE_SLOT_READINESS_SANITISED',
      selectionIndex: SLOT,
      split: SLOT_SPLIT,
      initialCapReadiness: SET_R_INITIAL_CAP_EXACT,
      fullRankReadiness: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
      measurableSurvivorCount: 6,
      shortTextUnresolvedCount: 2,
      firstBlockedSourceRankPosition: 6,
      exactMeasurableSurvivorPrefixCount: 5,
    });
    const serialised = JSON.stringify(r);
    for (const digest of s.shaAtRank) expect(serialised).not.toContain(digest);
    expect(serialised).not.toMatch(/[0-9a-f]{64}|score|pageEvidence|url|documentSha/i);
  });

  it('every derived summary passes its own structural check', () => {
    for (const s of allFixtures().filter((_, i) => i % 4 === 0)) {
      expect(structuralIssueOfSetRFreezeSlotReadiness(readinessOf(s))).toBeNull();
    }
  });

  it('an empty rank is a valid, exact, empty slot', () => {
    expect(readinessOf(scenario(0))).toEqual({
      kind: 'A3_SET_R_FREEZE_SLOT_READINESS_SANITISED',
      selectionIndex: SLOT,
      split: SLOT_SPLIT,
      initialCapReadiness: SET_R_INITIAL_CAP_EXACT,
      fullRankReadiness: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
      measurableSurvivorCount: 0,
      shortTextUnresolvedCount: 0,
      firstBlockedSourceRankPosition: null,
      exactMeasurableSurvivorPrefixCount: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// 10. K3 PROOF BINDING
// ---------------------------------------------------------------------------

describe('2D-A3 R13: the cap proof is bound to the K3 GREEDY procedure', () => {
  it('the required procedure is the contract’s and the owner policy’s', () => {
    expect(SET_R_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE).toBe(
      'GREEDY_SAMPLE_RANK_SURVIVOR_WALK',
    );
    expect(K3_SD7_SURVIVOR_PROCEDURE).toBe(SET_R_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE);
    expect(SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.boundK3Procedure).toBe(
      SET_R_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE,
    );
  });

  it('a preparation naming another procedure is refused, by cap and by readiness', () => {
    const s = scenario(6, [5]);
    const tampered = {
      ...s.preparation,
      sd7Preparation: { ...s.preparation.sd7Preparation, survivorProcedure: 'OTHER_WALK' },
    } as never as A3SetRSd7Preparation;
    expect(() => determineSetRDocumentCap(tampered)).toThrow(/K3_PROCEDURE_NOT_PROVED/);
    expect(() =>
      deriveSetRFreezeSlotReadiness({
        selectionIndex: SLOT,
        split: SLOT_SPLIT,
        preparation: tampered,
      }),
    ).toThrow(/K3_PROCEDURE_NOT_PROVED/);
  });
});

// ---------------------------------------------------------------------------
// 15 / 41. VALIDATION, IMMUTABILITY, LEAKAGE-SAFE REFUSALS
// ---------------------------------------------------------------------------

function refusalCode(fn: () => unknown): A3SetRSd7ReadinessRefusalCode | null {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(A3SetRSd7ReadinessRefusal);
    return (error as A3SetRSd7ReadinessRefusal).code;
  }
}

describe('2D-A3 R13: validation and immutability', () => {
  it('freezes the cap, its documents and the readiness, and mutates no R12 preparation', () => {
    const s = scenario(8, [6]);
    const before = JSON.stringify(s.preparation);
    const cap = capOf(s);
    const r = readinessOf(s);
    expect(Object.isFrozen(cap)).toBe(true);
    if (cap.status === SET_R_DOCUMENT_CAP_EXACT) expect(Object.isFrozen(cap.documents)).toBe(true);
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(capOf(scenario(5, [0])))).toBe(true);
    expect(JSON.stringify(s.preparation)).toBe(before);
    expect(s.preparation).not.toHaveProperty('documentCap');
  });

  it('refuses a slot mismatch, an invalid slot and a foreign preparation, naming no identity', () => {
    const s = scenario(6, [4]);
    const cases: [() => unknown, A3SetRSd7ReadinessRefusalCode][] = [
      [
        () =>
          deriveSetRFreezeSlotReadiness({
            selectionIndex: 12 as A3SelectionIndex,
            split: SLOT_SPLIT,
            preparation: s.preparation,
          }),
        'PREPARATION_SLOT_MISMATCH',
      ],
      [
        () =>
          deriveSetRFreezeSlotReadiness({
            selectionIndex: SLOT,
            split: 'DEV_TRAIN',
            preparation: s.preparation,
          }),
        'PREPARATION_SLOT_MISMATCH',
      ],
      [
        () =>
          deriveSetRFreezeSlotReadiness({
            selectionIndex: -1 as A3SelectionIndex,
            split: SLOT_SPLIT,
            preparation: s.preparation,
          }),
        'SLOT_IDENTITY_INVALID',
      ],
      [
        () =>
          deriveSetRFreezeSlotReadiness({
            selectionIndex: SLOT,
            split: 'nope' as Split,
            preparation: s.preparation,
          }),
        'SLOT_IDENTITY_INVALID',
      ],
      [
        () =>
          determineSetRDocumentCap({
            ...s.preparation,
            kind: 'A3_SET_P_SD7_PREPARATION_NOT_REAL_CORPUS',
          } as never),
        'PREPARATION_KIND_INVALID',
      ],
    ];
    for (const [fn, code] of cases) {
      expect(refusalCode(fn)).toBe(code);
      try {
        fn();
      } catch (error) {
        for (const digest of s.shaAtRank) expect((error as Error).message).not.toContain(digest);
        expect((error as Error).message).toMatch(/^STOP: /);
      }
    }
  });

  it('refuses an internally inconsistent preparation', () => {
    const s = scenario(7, [5], [[0, 1]]);
    const p = s.preparation;
    const survivors = p.measurableSurvivorAwareFullRank;
    const unresolved = p.sd7Preparation.shortTextUnresolvedInSampleOrder;
    const withSurvivors = (list: unknown[]): A3SetRSd7Preparation =>
      ({ ...p, measurableSurvivorAwareFullRank: list }) as never;
    const withUnresolved = (list: unknown[]): A3SetRSd7Preparation =>
      ({
        ...p,
        sd7Preparation: { ...p.sd7Preparation, shortTextUnresolvedInSampleOrder: list },
      }) as never;

    expect(
      refusalCode(() => determineSetRDocumentCap(withSurvivors([...survivors].reverse()))),
    ).toBe('PREPARATION_ORDER_INVALID');
    expect(
      refusalCode(() =>
        determineSetRDocumentCap(
          withSurvivors([...survivors, { ...survivors[0]!, sourceRankPosition: 99 }]),
        ),
      ),
    ).toBe('PREPARATION_ORDER_INVALID');
    expect(refusalCode(() => determineSetRDocumentCap(withSurvivors(survivors.slice(1))))).toBe(
      'PREPARATION_INCONSISTENT',
    );
    expect(
      refusalCode(() =>
        determineSetRDocumentCap(
          withUnresolved([
            { ...unresolved[0]!, sourceRankPosition: survivors[2]!.sourceRankPosition },
          ]),
        ),
      ),
    ).toBe('PREPARATION_INCONSISTENT');
    expect(
      refusalCode(() => determineSetRDocumentCap(withUnresolved([unresolved[0]!, unresolved[0]!]))),
    ).toBe('PREPARATION_ORDER_INVALID');
  });
});

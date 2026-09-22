/**
 * PHASE 2B-2D A3 R9 — SHORT-TEXT AMBIGUITY PROPAGATION AND THE CURRENT
 * CORPUS-FREEZE PREFLIGHT CONTRACT. BEHAVIOUR.
 *
 * Every identity, graph and summary here is INVENTED. No real corpus, no A2
 * evidence, no sealed file, no database, no network.
 *
 * Per-slot scenarios are built as in R8's test: a synthetic pool ranked by the
 * real R2 `rankSetPFull`, a synthetic graph written over SET_P rank positions
 * (stored in reversed order), and the real R8 `prepareSetPSd7`.
 * Collection-level scenarios use sanitised summaries directly.
 *
 * This file proves:
 *
 *   - initial-cap readiness is R8's answer, restated; full-rank readiness is a
 *     SEPARATE answer, blocked by any unresolved short text - including the key
 *     regression where the initial cap is exact and the full rank is not;
 *   - the invariant prefix and the extension boundary agree with an
 *     INDEPENDENT reference that enumerates every admissible treatment;
 *   - the short-text corpus gate refuses with the owner token, carries no
 *     acquisition or replacement effect, and reveals no slot;
 *   - the owner blocker ledger is exactly K4, from contracts alone (it was K1,
 *     K2, K4 at R9; K1 and K2 were later resolved, with no runtime change);
 *   - the overall preflight is necessarily REFUSED today, orders its blockers
 *     deterministically, and even with every R9 blocker cleared is still not
 *     freeze authority;
 *   - the SD9 helper builds the owner envelope and delegates to R3.
 *
 * R13 EXTENDED THIS FILE to both frozen samples: the SET_P gate is now named
 * `checkSetPShortTextCorpusFreezeGate`, a SET_R gate reads R13's sanitised
 * SET_R readiness, and the overall preflight requires BOTH complete
 * collections, agreeing slot-for-slot and split-for-split. It proves the
 * blocker order (SET_P structural, SET_R structural, cross-sample, SET_P short
 * text, SET_R short text, K4), that a SET_R slot with an EXACT initial cap-4
 * but a blocked complete rank still refuses the freeze, and that the old
 * SET_P-only call pattern is refused.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  A3_PREP_OWNER_DECISIONS_REQUIRED,
  GENERATION_1_SELECTED_ORGANISATIONS,
  GENERATION_1_SPLIT_ORGANISATION_COUNTS,
  K1_SET_R_TRACK_REDUCTION,
  K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE,
  K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR,
  K4_SD4_G3_FREEZE_TIME_TRUNCATION,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY,
  SPLITS,
  type Split,
} from '../harness/phase2b2d/a3prep/contracts.js';
import {
  A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY,
  A3_CORPUS_FREEZE_PREFLIGHT_KIND,
  A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP,
  A3_CORPUS_FREEZE_PREFLIGHT_REFUSED,
  A3CorpusFreezePreflightRefusal,
  checkCurrentA3CorpusFreezePreflight,
  checkSetPExtensionCursorAgainstShortTextBoundary,
  checkSetPShortTextCorpusFreezeGate,
  checkSetRShortTextCorpusFreezeGate,
  deriveCurrentOwnerDecisionBlockers,
  deriveSd9BoundsUnderShortTextPolicy,
  deriveSetPFreezeSlotReadiness,
  SET_P_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
  SET_P_EXTENSION_POSITION_EXACT,
  SET_P_EXTENSION_RANK_EXHAUSTED_EXACT,
  SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
  SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
  SET_P_INITIAL_CAP_EXACT,
  SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR,
  SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED,
  SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL,
  type A3CorpusFreezePreflightResult,
  type A3CurrentCorpusFreezePreflightInput,
  type A3SetPFreezeSlotReadiness,
} from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';
import { evaluateSd9FromAdmissiblePostSd7Bounds } from '../harness/phase2b2d/a3prep/sd9.js';
import { rankSetPFull } from '../harness/phase2b2d/a3prep/setP.js';
import {
  prepareSetPSd7,
  SET_P_DOCUMENT_CAP_EXACT,
  type A3SetPSd7Preparation,
} from '../harness/phase2b2d/a3prep/setPSd7.js';
import {
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
  SET_R_INITIAL_CAP_EXACT,
  type A3SetRFreezeSlotReadiness,
} from '../harness/phase2b2d/a3prep/setRSd7Readiness.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3PageEvidenceId,
  A3SelectionIndex,
} from '../harness/phase2b2d/a3prep/types.js';
import type { NearDuplicateGraphMeasurement } from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';

// ---------------------------------------------------------------------------
// Synthetic per-slot builders (R8's pattern).
// ---------------------------------------------------------------------------

const SLOT = 7 as A3SelectionIndex;
const SLOT_SPLIT: Split = 'DEV_CONFIRM';

function sha(label: string): A3DocumentSha256 {
  return createHash('sha256')
    .update(`synthetic-a3-r9:${label}`, 'utf8')
    .digest('hex') as A3DocumentSha256;
}

const EDGE_MEASUREMENT = Object.freeze({
  intersectionSize: 9,
  unionSize: 10,
  similarity: 0.9,
  atOrAboveThreshold: true,
});

interface Scenario {
  readonly pool: A3DistinctDocument[];
  readonly shaAtRank: readonly string[];
  readonly short: readonly number[];
  readonly edges: readonly (readonly [number, number])[];
  readonly preparation: A3SetPSd7Preparation;
}

/** `short` and `edges` are SET_P rank positions; edges join measurable documents only. */
function scenario(
  n: number,
  short: readonly number[] = [],
  edges: readonly (readonly [number, number])[] = [],
  tag = 'd',
): Scenario {
  const pool: A3DistinctDocument[] = Array.from({ length: n }, (_, i) => ({
    selectionIndex: SLOT,
    split: SLOT_SPLIT,
    documentSha256: sha(`${tag}${i}`),
    sourcePageEvidenceIds: [`pe-${tag}${i}` as A3PageEvidenceId],
  }));
  const shaAtRank = rankSetPFull(pool).map((r) => r.documentSha256 as string);
  const shortSet = new Set(short);
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
    edges: edges.map(([a, b]) => {
      const x = graphIndexOfRank.get(a)!;
      const y = graphIndexOfRank.get(b)!;
      return { aIndex: Math.min(x, y), bIndex: Math.max(x, y), measurement: EDGE_MEASUREMENT };
    }),
  };
  return { pool, shaAtRank, short, edges, preparation: prepareSetPSd7({ pool, graph }) };
}

function readinessOf(s: Scenario): A3SetPFreezeSlotReadiness {
  return deriveSetPFreezeSlotReadiness({
    selectionIndex: SLOT,
    split: SLOT_SPLIT,
    preparation: s.preparation,
  });
}

// ---------------------------------------------------------------------------
// INDEPENDENT reference: enumerate every admissible short-text treatment
// (each unresolved document independently out of the sample, or in it at its
// frozen rank position; measurable survivors unchanged), and compare the
// complete-sample membership lists they produce. Written from the policy
// wording, not from the module under test.
// ---------------------------------------------------------------------------

function referenceGreedyMeasurableSurvivors(
  n: number,
  short: readonly number[],
  edges: readonly (readonly [number, number])[],
): number[] {
  const kept: number[] = [];
  for (let p = 0; p < n; p += 1) {
    if (short.includes(p)) continue;
    const blocked = kept.some((k) =>
      edges.some(([a, b]) => (a === p && b === k) || (a === k && b === p)),
    );
    if (!blocked) kept.push(p);
  }
  return kept;
}

function referenceCompleteMemberships(
  n: number,
  short: readonly number[],
  edges: readonly (readonly [number, number])[],
): number[][] {
  const survivors = referenceGreedyMeasurableSurvivors(n, short, edges);
  const out: number[][] = [];
  for (let mask = 0; mask < 1 << short.length; mask += 1) {
    const present = short.filter((_, i) => (mask & (1 << i)) !== 0);
    out.push([...survivors, ...present].sort((a, b) => a - b));
  }
  return out;
}

function referenceInvariantPrefixLength(memberships: readonly number[][]): number {
  let length = 0;
  for (;;) {
    const first = memberships[0]![length];
    if (first === undefined) return length;
    if (!memberships.every((m) => m[length] === first)) return length;
    length += 1;
  }
}

function referenceFullRankExact(memberships: readonly number[][]): boolean {
  const first = JSON.stringify(memberships[0]);
  return memberships.every((m) => JSON.stringify(m) === first);
}

// ---------------------------------------------------------------------------
// Synthetic sanitised summaries for collection-level tests.
// ---------------------------------------------------------------------------

function exactSummary(selectionIndex: number, split: Split): A3SetPFreezeSlotReadiness {
  return {
    kind: 'A3_SET_P_FREEZE_SLOT_READINESS_SANITISED',
    selectionIndex: selectionIndex as A3SelectionIndex,
    split,
    initialCapReadiness: SET_P_INITIAL_CAP_EXACT,
    fullRankReadiness: SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    measurableSurvivorCount: 12,
    shortTextUnresolvedCount: 0,
    firstBlockedSourceRankPosition: null,
    exactMeasurableSurvivorPrefixCount: 12,
  };
}

/** Initial cap EXACT, complete rank BLOCKED: the key R9 case. */
function capExactRankBlockedSummary(
  selectionIndex: number,
  split: Split,
): A3SetPFreezeSlotReadiness {
  return {
    kind: 'A3_SET_P_FREEZE_SLOT_READINESS_SANITISED',
    selectionIndex: selectionIndex as A3SelectionIndex,
    split,
    initialCapReadiness: SET_P_INITIAL_CAP_EXACT,
    fullRankReadiness: SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    measurableSurvivorCount: 10,
    shortTextUnresolvedCount: 2,
    firstBlockedSourceRankPosition: 9,
    exactMeasurableSurvivorPrefixCount: 9,
  };
}

/**
 * A complete Generation-1 collection with NON-contiguous selection indices,
 * split counts from the canonical contract.
 */
function fullCollection(
  blockedPositions: ReadonlySet<number> = new Set(),
): A3SetPFreezeSlotReadiness[] {
  const out: A3SetPFreezeSlotReadiness[] = [];
  for (const split of SPLITS) {
    for (let i = 0; i < GENERATION_1_SPLIT_ORGANISATION_COUNTS[split]; i += 1) {
      const position = out.length;
      const selectionIndex = position * 3 + 1;
      out.push(
        blockedPositions.has(position)
          ? capExactRankBlockedSummary(selectionIndex, split)
          : exactSummary(selectionIndex, split),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// R13: synthetic sanitised SET_R summaries, on the SAME slot/split assignment
// as `fullCollection` (index = position * 3 + 1), so the two agree by default.
// ---------------------------------------------------------------------------

function exactRSummary(selectionIndex: number, split: Split): A3SetRFreezeSlotReadiness {
  return {
    kind: 'A3_SET_R_FREEZE_SLOT_READINESS_SANITISED',
    selectionIndex: selectionIndex as A3SelectionIndex,
    split,
    initialCapReadiness: SET_R_INITIAL_CAP_EXACT,
    fullRankReadiness: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    measurableSurvivorCount: 6,
    shortTextUnresolvedCount: 0,
    firstBlockedSourceRankPosition: null,
    exactMeasurableSurvivorPrefixCount: 6,
  };
}

/** SET_R initial cap-4 EXACT, complete rank BLOCKED: the key R13 case. */
function capExactRankBlockedRSummary(
  selectionIndex: number,
  split: Split,
): A3SetRFreezeSlotReadiness {
  return {
    kind: 'A3_SET_R_FREEZE_SLOT_READINESS_SANITISED',
    selectionIndex: selectionIndex as A3SelectionIndex,
    split,
    initialCapReadiness: SET_R_INITIAL_CAP_EXACT,
    fullRankReadiness: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    measurableSurvivorCount: 6,
    shortTextUnresolvedCount: 1,
    firstBlockedSourceRankPosition: 5,
    exactMeasurableSurvivorPrefixCount: 5,
  };
}

/** SET_R initial cap BLOCKED and complete rank BLOCKED. */
function capBlockedRSummary(selectionIndex: number, split: Split): A3SetRFreezeSlotReadiness {
  return {
    kind: 'A3_SET_R_FREEZE_SLOT_READINESS_SANITISED',
    selectionIndex: selectionIndex as A3SelectionIndex,
    split,
    initialCapReadiness: SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
    fullRankReadiness: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    measurableSurvivorCount: 5,
    shortTextUnresolvedCount: 2,
    firstBlockedSourceRankPosition: 1,
    exactMeasurableSurvivorPrefixCount: 1,
  };
}

function fullRCollection(
  capExactRankBlocked: ReadonlySet<number> = new Set(),
  capBlocked: ReadonlySet<number> = new Set(),
): A3SetRFreezeSlotReadiness[] {
  const out: A3SetRFreezeSlotReadiness[] = [];
  for (const split of SPLITS) {
    for (let i = 0; i < GENERATION_1_SPLIT_ORGANISATION_COUNTS[split]; i += 1) {
      const position = out.length;
      const selectionIndex = position * 3 + 1;
      out.push(
        capBlocked.has(position)
          ? capBlockedRSummary(selectionIndex, split)
          : capExactRankBlocked.has(position)
            ? capExactRankBlockedRSummary(selectionIndex, split)
            : exactRSummary(selectionIndex, split),
      );
    }
  }
  return out;
}

/** Both samples, clear unless told otherwise. */
function bothSamples(
  setP: A3SetPFreezeSlotReadiness[] = fullCollection(),
  setR: A3SetRFreezeSlotReadiness[] = fullRCollection(),
): A3CurrentCorpusFreezePreflightInput {
  return { setP, setR };
}

const classesOf = (result: A3CorpusFreezePreflightResult): string[] =>
  result.blockers.map((b) =>
    b.blockerClass === 'OWNER_DECISION_UNRESOLVED'
      ? b.id
      : b.blockerClass === 'SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED_AT_FREEZE'
        ? `SHORT_TEXT:${b.sample}`
        : `STRUCTURAL:${b.sample ?? 'CROSS'}:${b.code}`,
  );

// ---------------------------------------------------------------------------
// 28. INITIAL CAP vs FULL-RANK READINESS
// ---------------------------------------------------------------------------

describe('2D-A3 R9: initial-cap readiness versus full-rank readiness', () => {
  it('no short text: initial cap exact, full rank exact', () => {
    const r = readinessOf(scenario(12));
    expect(r.initialCapReadiness).toBe(SET_P_INITIAL_CAP_EXACT);
    expect(r.fullRankReadiness).toBe(SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT);
    expect(r.firstBlockedSourceRankPosition).toBeNull();
    expect(r.exactMeasurableSurvivorPrefixCount).toBe(12);
  });

  it('no short text and fewer survivors than the cap: both exact', () => {
    const r = readinessOf(scenario(3));
    expect(r.initialCapReadiness).toBe(SET_P_INITIAL_CAP_EXACT);
    expect(r.fullRankReadiness).toBe(SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT);
  });

  it('fewer than the cap + short text: both blocked', () => {
    const r = readinessOf(scenario(6, [4]));
    expect(r.initialCapReadiness).toBe(SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP);
    expect(r.fullRankReadiness).toBe(SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT);
  });

  it('KEY R9 REGRESSION: 8+ measurable survivors, every short text after survivor 8 -> cap EXACT, full rank BLOCKED', () => {
    const s = scenario(12, [9, 11]);
    expect(s.preparation.documentCap.status).toBe(SET_P_DOCUMENT_CAP_EXACT);
    const r = readinessOf(s);
    expect(r.initialCapReadiness).toBe(SET_P_INITIAL_CAP_EXACT);
    expect(r.fullRankReadiness).toBe(SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT);
    expect(r.firstBlockedSourceRankPosition).toBe(9);
    expect(r.exactMeasurableSurvivorPrefixCount).toBe(9);
    expect(r.exactMeasurableSurvivorPrefixCount).toBeGreaterThanOrEqual(
      SET_P_MAX_PAGES_PER_ORGANISATION,
    );
  });

  it('short text before the cap boundary: both blocked', () => {
    const r = readinessOf(scenario(12, [3]));
    expect(r.initialCapReadiness).toBe(SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP);
    expect(r.fullRankReadiness).toBe(SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT);
  });

  it('short text ranked after EVERY measurable survivor: cap exact, full rank still blocked', () => {
    const r = readinessOf(scenario(12, [11]));
    expect(r.initialCapReadiness).toBe(SET_P_INITIAL_CAP_EXACT);
    expect(r.fullRankReadiness).toBe(SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT);
    expect(r.exactMeasurableSurvivorPrefixCount).toBe(r.measurableSurvivorCount);
    expect(r.exactMeasurableSurvivorPrefixCount).toBe(11);
  });

  it('initial-cap readiness is exactly R8’s status, never recomputed, over many scenarios', () => {
    const cases: [number, number[], [number, number][]][] = [
      [0, [], []],
      [1, [0], []],
      [12, [8], []],
      [12, [7], []],
      [14, [10, 12], [[0, 1]]],
      [14, [9], [[0, 1]]],
      [
        20,
        [2, 15],
        [
          [3, 4],
          [5, 6],
        ],
      ],
    ];
    for (const [n, short, edges] of cases) {
      const s = scenario(n, short, edges);
      const r = readinessOf(s);
      expect(r.initialCapReadiness === SET_P_INITIAL_CAP_EXACT, `${n}/${short.join()}`).toBe(
        s.preparation.documentCap.status === SET_P_DOCUMENT_CAP_EXACT,
      );
      expect(r.fullRankReadiness === SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT).toBe(
        short.length === 0,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 29. INVARIANT PREFIX — against the independent treatment enumeration.
// ---------------------------------------------------------------------------

describe('2D-A3 R9: the invariant prefix', () => {
  const cases: { name: string; n: number; short: number[]; edges: [number, number][] }[] = [
    { name: 'boundary at position 0', n: 10, short: [0], edges: [] },
    { name: 'boundary in the middle', n: 12, short: [5], edges: [] },
    { name: 'boundary at the tail', n: 12, short: [11], edges: [] },
    { name: 'multiple short-text documents', n: 14, short: [4, 7, 10], edges: [] },
    {
      name: 'exclusions before the boundary',
      n: 12,
      short: [6],
      edges: [
        [0, 1],
        [2, 3],
      ],
    },
    {
      name: 'exclusions on both sides of the boundary',
      n: 16,
      short: [5, 13],
      edges: [
        [1, 2],
        [6, 7],
        [8, 14],
      ],
    },
    { name: 'every document short text', n: 3, short: [0, 1, 2], edges: [] },
    { name: 'no short text', n: 9, short: [], edges: [[0, 8]] },
  ];

  for (const c of cases) {
    it(`${c.name}: prefix count, boundary and full-rank exactness match the reference`, () => {
      const s = scenario(c.n, c.short, c.edges);
      const r = readinessOf(s);
      const memberships = referenceCompleteMemberships(c.n, c.short, c.edges);

      // The survivors the module counts are exactly those before the boundary.
      const expectedPrefix = s.preparation.measurableSurvivorAwareFullRank.filter(
        (x) =>
          r.firstBlockedSourceRankPosition === null ||
          x.sourceRankPosition < r.firstBlockedSourceRankPosition,
      ).length;
      expect(r.exactMeasurableSurvivorPrefixCount).toBe(expectedPrefix);
      expect(r.firstBlockedSourceRankPosition).toBe(c.short.length === 0 ? null : c.short[0]);

      // Independent: the longest membership prefix common to every treatment.
      expect(r.exactMeasurableSurvivorPrefixCount).toBe(
        referenceInvariantPrefixLength(memberships),
      );
      expect(r.fullRankReadiness === SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT).toBe(
        referenceFullRankExact(memberships),
      );
      expect(r.measurableSurvivorCount).toBe(
        referenceGreedyMeasurableSurvivors(c.n, c.short, c.edges).length,
      );
      expect(r.shortTextUnresolvedCount).toBe(c.short.length);
    });
  }

  it('the summary carries no document identity, page id or rank digest', () => {
    const s = scenario(14, [4, 7, 10], [[0, 1]]);
    const serialised = JSON.stringify(readinessOf(s));
    for (const digest of s.shaAtRank) expect(serialised).not.toContain(digest);
    for (const entry of s.preparation.preSd7FullRank) {
      expect(serialised).not.toContain(entry.saltedRankSha256);
    }
    expect(serialised).not.toMatch(/pe-|documentSha256|saltedRank|pageEvidence|"url|"text|"title/i);
    expect(Object.keys(readinessOf(s)).sort()).toEqual([
      'exactMeasurableSurvivorPrefixCount',
      'firstBlockedSourceRankPosition',
      'fullRankReadiness',
      'initialCapReadiness',
      'kind',
      'measurableSurvivorCount',
      'selectionIndex',
      'shortTextUnresolvedCount',
      'split',
    ]);
  });

  it('is frozen and mutates no input', () => {
    const s = scenario(12, [9]);
    const before = JSON.stringify(s.preparation);
    const r = readinessOf(s);
    expect(Object.isFrozen(r)).toBe(true);
    expect(JSON.stringify(s.preparation)).toBe(before);
  });

  it('refuses a slot mismatch, an invalid slot, a foreign preparation and a bad cap status - naming no identity', () => {
    const s = scenario(6, [], [], 'm');
    const refuse = (fn: () => unknown, code: string): void => {
      try {
        fn();
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(A3CorpusFreezePreflightRefusal);
        expect((error as A3CorpusFreezePreflightRefusal).code).toBe(code);
        const message = (error as Error).message;
        expect(message).toMatch(/^STOP: /);
        for (const digest of s.shaAtRank) expect(message).not.toContain(digest);
      }
    };
    refuse(
      () =>
        deriveSetPFreezeSlotReadiness({
          selectionIndex: 8 as A3SelectionIndex,
          split: SLOT_SPLIT,
          preparation: s.preparation,
        }),
      'PREPARATION_SLOT_MISMATCH',
    );
    refuse(
      () =>
        deriveSetPFreezeSlotReadiness({
          selectionIndex: SLOT,
          split: 'DEV_TRAIN',
          preparation: s.preparation,
        }),
      'PREPARATION_SLOT_MISMATCH',
    );
    refuse(
      () =>
        deriveSetPFreezeSlotReadiness({
          selectionIndex: -1 as A3SelectionIndex,
          split: SLOT_SPLIT,
          preparation: s.preparation,
        }),
      'SLOT_IDENTITY_INVALID',
    );
    refuse(
      () =>
        deriveSetPFreezeSlotReadiness({
          selectionIndex: SLOT,
          split: 'TRAIN' as Split,
          preparation: s.preparation,
        }),
      'SLOT_IDENTITY_INVALID',
    );
    refuse(
      () =>
        deriveSetPFreezeSlotReadiness({
          selectionIndex: SLOT,
          split: SLOT_SPLIT,
          preparation: { ...s.preparation, kind: 'OTHER' } as unknown as A3SetPSd7Preparation,
        }),
      'PREPARATION_KIND_INVALID',
    );
    refuse(
      () =>
        deriveSetPFreezeSlotReadiness({
          selectionIndex: SLOT,
          split: SLOT_SPLIT,
          preparation: {
            ...s.preparation,
            documentCap: { status: 'MAYBE' },
          } as unknown as A3SetPSd7Preparation,
        }),
      'DOCUMENT_CAP_STATUS_INVALID',
    );
  });

  it('an empty pool is a valid, exact, empty slot', () => {
    const r = readinessOf(scenario(0));
    expect(r.measurableSurvivorCount).toBe(0);
    expect(r.fullRankReadiness).toBe(SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT);
  });
});

// ---------------------------------------------------------------------------
// 30. EXTENSION BOUNDARY
// ---------------------------------------------------------------------------

describe('2D-A3 R9: the extension boundary', () => {
  it('blocked rank: exact strictly before the prefix end, blocked at and after it', () => {
    const r = readinessOf(scenario(12, [9, 11]));
    expect(r.exactMeasurableSurvivorPrefixCount).toBe(9);
    expect(checkSetPExtensionCursorAgainstShortTextBoundary(r, 0)).toBe(
      SET_P_EXTENSION_POSITION_EXACT,
    );
    expect(checkSetPExtensionCursorAgainstShortTextBoundary(r, 8)).toBe(
      SET_P_EXTENSION_POSITION_EXACT,
    );
    expect(checkSetPExtensionCursorAgainstShortTextBoundary(r, 9)).toBe(
      SET_P_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
    );
    expect(checkSetPExtensionCursorAgainstShortTextBoundary(r, 10)).toBe(
      SET_P_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
    );
    expect(checkSetPExtensionCursorAgainstShortTextBoundary(r, 500)).toBe(
      SET_P_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
    );
  });

  it('boundary at position 0: even the first position is blocked', () => {
    const r = readinessOf(scenario(10, [0]));
    expect(checkSetPExtensionCursorAgainstShortTextBoundary(r, 0)).toBe(
      SET_P_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
    );
  });

  it('exact rank: exact inside, exactly exhausted beyond - never blocked', () => {
    const r = readinessOf(scenario(10));
    expect(checkSetPExtensionCursorAgainstShortTextBoundary(r, 9)).toBe(
      SET_P_EXTENSION_POSITION_EXACT,
    );
    expect(checkSetPExtensionCursorAgainstShortTextBoundary(r, 10)).toBe(
      SET_P_EXTENSION_RANK_EXHAUSTED_EXACT,
    );
  });

  it('agrees with the reference at every position', () => {
    const c = {
      n: 16,
      short: [5, 13],
      edges: [[1, 2] as [number, number], [6, 7] as [number, number]],
    };
    const r = readinessOf(scenario(c.n, c.short, c.edges));
    const memberships = referenceCompleteMemberships(c.n, c.short, c.edges);
    for (let position = 0; position < 20; position += 1) {
      const values = new Set(memberships.map((m) => m[position]));
      const referenceExact = values.size === 1;
      const got = checkSetPExtensionCursorAgainstShortTextBoundary(r, position);
      expect(got === SET_P_EXTENSION_POSITION_EXACT, `position ${position}`).toBe(
        referenceExact && [...values][0] !== undefined,
      );
    }
  });

  it('refuses an invalid cursor or a malformed summary, and mutates nothing', () => {
    const r = readinessOf(scenario(12, [9]));
    const before = JSON.stringify(r);
    for (const bad of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => checkSetPExtensionCursorAgainstShortTextBoundary(r, bad)).toThrow(
        A3CorpusFreezePreflightRefusal,
      );
    }
    expect(() =>
      checkSetPExtensionCursorAgainstShortTextBoundary(
        { ...r, exactMeasurableSurvivorPrefixCount: 99 },
        0,
      ),
    ).toThrow(/READINESS_INVALID/);
    expect(JSON.stringify(r)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 12 / 31 / 36. SHORT-TEXT CORPUS FREEZE GATE
// ---------------------------------------------------------------------------

describe('2D-A3 R9 (SET_P, renamed in R13): the short-text corpus freeze gate', () => {
  it('the synthetic full collection is canonical in size and split counts', () => {
    const c = fullCollection();
    expect(c).toHaveLength(GENERATION_1_SELECTED_ORGANISATIONS);
    for (const split of SPLITS) {
      expect(c.filter((x) => x.split === split)).toHaveLength(
        GENERATION_1_SPLIT_ORGANISATION_COUNTS[split],
      );
    }
  });

  it('zero blocked slots: gate clear', () => {
    expect(checkSetPShortTextCorpusFreezeGate(fullCollection())).toEqual({
      status: SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR,
      sample: 'SET_P',
      totalSlotCount: GENERATION_1_SELECTED_ORGANISATIONS,
      blockedSlotCount: 0,
    });
  });

  it('KEY: one slot with the initial cap EXACT but a later unresolved short text refuses the freeze', () => {
    const collection = fullCollection(new Set([37]));
    expect(collection[37]!.initialCapReadiness).toBe(SET_P_INITIAL_CAP_EXACT);
    const gate = checkSetPShortTextCorpusFreezeGate(collection);
    expect(gate.status).toBe(SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED);
    if (gate.status !== SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED) return;
    expect(gate.blocker).toEqual({
      blockerClass: 'SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED_AT_FREEZE',
      sample: 'SET_P',
      refusal: 'CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED',
      policyDecisionToken: SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.decisionToken,
      treatmentSpace: 'SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1',
      acquisitionEffect: 'NO_ACQUISITION_STATUS_CHANGE',
      replacementEffect: 'NO_REPLACEMENT_REASON',
      totalSlotCount: GENERATION_1_SELECTED_ORGANISATIONS,
      blockedSlotCount: 1,
    });
  });

  it('a real R8-derived cap-exact/rank-blocked slot refuses the freeze too', () => {
    const derived = readinessOf(scenario(12, [10]));
    expect(derived.initialCapReadiness).toBe(SET_P_INITIAL_CAP_EXACT);
    const collection = fullCollection();
    // Free the synthetic slot's index elsewhere, then put the derived slot in a DEV_CONFIRM place.
    const holder = collection.findIndex((x) => x.selectionIndex === SLOT);
    collection[holder] = { ...collection[holder]!, selectionIndex: 100_000 as A3SelectionIndex };
    const position = collection.findIndex((x) => x.split === SLOT_SPLIT);
    collection[position] = derived;
    expect(checkSetPShortTextCorpusFreezeGate(collection).status).toBe(
      SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED,
    );
  });

  it('many blocked slots: ONE aggregate refusal carrying the count and no slot identity', () => {
    const blocked = new Set([0, 5, 21, 22, 64, 109]);
    const collection = fullCollection(blocked);
    const gate = checkSetPShortTextCorpusFreezeGate(collection);
    expect(gate.status).toBe(SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED);
    if (gate.status !== SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED) return;
    expect(gate.blocker.blockedSlotCount).toBe(6);
    expect(Object.keys(gate.blocker).sort()).toEqual([
      'acquisitionEffect',
      'blockedSlotCount',
      'blockerClass',
      'policyDecisionToken',
      'refusal',
      'replacementEffect',
      'sample',
      'totalSlotCount',
      'treatmentSpace',
    ]);
    // The only numbers are the two aggregates; no slot index, split or per-slot count.
    const numbers = Object.values(gate.blocker).filter((v) => typeof v === 'number');
    expect(numbers).toEqual([GENERATION_1_SELECTED_ORGANISATIONS, 6]);
    expect(JSON.stringify(gate)).not.toMatch(
      /selectionIndex|DEV_TRAIN|DEV_CONFIRM|FINAL_HOLDOUT|split|Position|prefix/i,
    );
  });

  it('carries no acquisition status, reserve action or replacement recommendation', () => {
    const serialised = JSON.stringify(
      checkSetPShortTextCorpusFreezeGate(fullCollection(new Set([3]))),
    );
    expect(serialised).toContain('NO_ACQUISITION_STATUS_CHANGE');
    expect(serialised).toContain('NO_REPLACEMENT_REASON');
    expect(serialised).not.toMatch(
      /ACQUISITION_UNSUCCESSFUL|ACQUISITION_SUCCESSFUL|FAILURE|RESERVE|REPLACE_|REPLACEMENT_(?!REASON")|RECOMMEND|reserve|recommend/,
    );
  });

  it('duplicate selection index: structural refusal naming array positions only', () => {
    const c = fullCollection();
    c[50] = { ...c[50]!, selectionIndex: c[12]!.selectionIndex };
    const gate = checkSetPShortTextCorpusFreezeGate(c);
    expect(gate).toEqual({
      status: SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL,
      blocker: {
        blockerClass: 'STRUCTURAL_PREFLIGHT_INPUT_INVALID',
        code: 'SELECTION_INDEX_DUPLICATE',
        sample: 'SET_P',
        arrayPosition: 50,
        firstArrayPosition: 12,
        split: null,
        expectedCount: null,
        receivedCount: null,
      },
    });
  });

  it('malformed split: structural refusal that does not echo the value', () => {
    const c = fullCollection();
    c[4] = { ...c[4]!, split: 'secret-split-value' as Split };
    const gate = checkSetPShortTextCorpusFreezeGate(c);
    expect(gate.status).toBe(SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL);
    expect(JSON.stringify(gate)).not.toContain('secret-split-value');
    if (gate.status === SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL) {
      expect(gate.blocker.code).toBe('SPLIT_NOT_CANONICAL');
      expect(gate.blocker.arrayPosition).toBe(4);
    }
  });

  it('every other structural defect is refused, never counted', () => {
    const cases: [unknown, string][] = [
      [null, 'SLOT_COLLECTION_NOT_AN_ARRAY'],
      [{ length: 110 }, 'SLOT_COLLECTION_NOT_AN_ARRAY'],
      [fullCollection().slice(1), 'SLOT_COUNT_MISMATCH'],
      [[...fullCollection(), exactSummary(9999, 'DEV_TRAIN')], 'SLOT_COUNT_MISMATCH'],
    ];
    const moved = fullCollection();
    moved[0] = { ...moved[0]!, split: 'FINAL_HOLDOUT' };
    cases.push([moved, 'SPLIT_SLOT_COUNT_MISMATCH']);
    const mutate = (patch: Record<string, unknown>): unknown => {
      const c: unknown[] = fullCollection();
      c[2] = { ...(c[2] as object), ...patch };
      return c;
    };
    cases.push([mutate({ kind: 'OTHER' }), 'ENTRY_NOT_A_READINESS_SUMMARY']);
    cases.push([mutate({ selectionIndex: -3 }), 'SELECTION_INDEX_INVALID']);
    cases.push([mutate({ selectionIndex: 2.5 }), 'SELECTION_INDEX_INVALID']);
    cases.push([mutate({ fullRankReadiness: 'MAYBE' }), 'READINESS_TOKEN_NOT_CANONICAL']);
    cases.push([mutate({ initialCapReadiness: 'READY' }), 'READINESS_TOKEN_NOT_CANONICAL']);
    cases.push([mutate({ measurableSurvivorCount: -1 }), 'COUNT_INVALID']);
    cases.push([
      mutate({ shortTextUnresolvedCount: 1 }),
      'READINESS_INCONSISTENT', // EXACT full rank with short text
    ]);
    cases.push([
      mutate({ initialCapReadiness: SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP }),
      'READINESS_INCONSISTENT', // blocked cap with an exact full rank
    ]);
    const inconsistentBlocked: unknown[] = fullCollection();
    inconsistentBlocked[2] = {
      ...capExactRankBlockedSummary(7, 'DEV_TRAIN'),
      firstBlockedSourceRankPosition: null,
    };
    cases.push([inconsistentBlocked, 'READINESS_INCONSISTENT']);
    const c2: unknown[] = fullCollection();
    c2[3] = 'not an object';
    cases.push([c2, 'ENTRY_NOT_A_READINESS_SUMMARY']);

    for (const [input, code] of cases) {
      const gate = checkSetPShortTextCorpusFreezeGate(input as A3SetPFreezeSlotReadiness[]);
      expect(gate.status, code).toBe(SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL);
      if (gate.status === SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL) {
        expect(gate.blocker.code).toBe(code);
      }
    }
  });

  it('does not assume contiguous selection indices', () => {
    const c = fullCollection();
    expect(c.some((x, i) => x.selectionIndex !== i)).toBe(true);
    expect(checkSetPShortTextCorpusFreezeGate(c).status).toBe(SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR);
  });

  it('is order-independent in its verdict and mutates no input', () => {
    const c = fullCollection(new Set([9, 90]));
    const before = JSON.stringify(c);
    const forward = checkSetPShortTextCorpusFreezeGate(c);
    const reversed = checkSetPShortTextCorpusFreezeGate([...c].reverse());
    expect(reversed).toEqual(forward);
    expect(JSON.stringify(c)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 18 / 32. OWNER BLOCKER LEDGER
// ---------------------------------------------------------------------------

describe('2D-A3 R9: the owner-decision blocker ledger', () => {
  it('is exactly K4 - derived from the contract, in contract order', () => {
    const ledger = deriveCurrentOwnerDecisionBlockers();
    expect(ledger.map((b) => b.id)).toEqual(['K4']);
    expect(ledger).toHaveLength(1);
    expect(ledger).toEqual(
      A3_PREP_OWNER_DECISIONS_REQUIRED.map((r) => ({
        blockerClass: 'OWNER_DECISION_UNRESOLVED',
        id: r.id,
        marker: r.marker,
      })),
    );
    expect(Object.isFrozen(ledger)).toBe(true);
  });

  it('K3 never appears as unresolved', () => {
    const serialised = JSON.stringify(deriveCurrentOwnerDecisionBlockers());
    expect(serialised).not.toContain('"K3"');
    expect(serialised).not.toContain(K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR);
  });

  it('K1 and K2 never appear as unresolved once their owner records are bound', () => {
    const serialised = JSON.stringify(deriveCurrentOwnerDecisionBlockers());
    expect(serialised).not.toContain('"K1"');
    expect(serialised).not.toContain('"K2"');
    expect(serialised).not.toContain(K1_SET_R_TRACK_REDUCTION);
    expect(serialised).not.toContain(K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE);
  });

  it('takes no argument: a caller cannot pass approval booleans to hide an entry', () => {
    expect(deriveCurrentOwnerDecisionBlockers.length).toBe(0);
    const withJunk = (
      deriveCurrentOwnerDecisionBlockers as unknown as (x: unknown) => readonly unknown[]
    )({
      setRScoreReductionApproved: true,
      organisationShareTruncationApproved: true,
      k1: true,
      k4: true,
    });
    expect(withJunk).toHaveLength(1);
  });

  it('carries no free-form question text', () => {
    for (const blocker of deriveCurrentOwnerDecisionBlockers()) {
      expect(Object.keys(blocker).sort()).toEqual(['blockerClass', 'id', 'marker']);
    }
  });
});

// ---------------------------------------------------------------------------
// R13. THE SET_R SHORT-TEXT CORPUS FREEZE GATE
// ---------------------------------------------------------------------------

describe('2D-A3 R13: the SET_R short-text corpus freeze gate', () => {
  it('zero blocked SET_R slots: gate clear, labelled SET_R', () => {
    expect(checkSetRShortTextCorpusFreezeGate(fullRCollection())).toEqual({
      status: SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR,
      sample: 'SET_R',
      totalSlotCount: GENERATION_1_SELECTED_ORGANISATIONS,
      blockedSlotCount: 0,
    });
  });

  it('KEY: a SET_R slot with initial cap-4 EXACT but a blocked complete rank refuses the freeze', () => {
    const collection = fullRCollection(new Set([40]));
    expect(collection[40]!.initialCapReadiness).toBe(SET_R_INITIAL_CAP_EXACT);
    const gate = checkSetRShortTextCorpusFreezeGate(collection);
    expect(gate).toEqual({
      status: SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED,
      blocker: {
        blockerClass: 'SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED_AT_FREEZE',
        sample: 'SET_R',
        refusal: 'CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED',
        policyDecisionToken: SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.decisionToken,
        treatmentSpace: 'SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1',
        acquisitionEffect: 'NO_ACQUISITION_STATUS_CHANGE',
        replacementEffect: 'NO_REPLACEMENT_REASON',
        totalSlotCount: GENERATION_1_SELECTED_ORGANISATIONS,
        blockedSlotCount: 1,
      },
    });
  });

  it('the gate reads fullRankReadiness, never initialCapReadiness: seven blocked slots, one aggregate count', () => {
    const gate = checkSetRShortTextCorpusFreezeGate(
      fullRCollection(new Set([0, 1, 2, 70]), new Set([3, 50, 109])),
    );
    expect(gate.status).toBe(SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED);
    if (gate.status !== SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED) return;
    expect(gate.blocker.blockedSlotCount).toBe(7);
    expect(Object.values(gate.blocker).filter((v) => typeof v === 'number')).toEqual([
      GENERATION_1_SELECTED_ORGANISATIONS,
      7,
    ]);
    expect(JSON.stringify(gate)).not.toMatch(
      /selectionIndex|DEV_TRAIN|DEV_CONFIRM|FINAL_HOLDOUT|split|Position|prefix/i,
    );
  });

  it('refuses a SET_P summary in a SET_R collection, and the reverse', () => {
    const mixedR: unknown[] = fullRCollection();
    mixedR[6] = fullCollection()[6];
    const r = checkSetRShortTextCorpusFreezeGate(mixedR as A3SetRFreezeSlotReadiness[]);
    expect(r).toMatchObject({
      status: SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL,
      blocker: { code: 'ENTRY_NOT_A_READINESS_SUMMARY', sample: 'SET_R', arrayPosition: 6 },
    });
    const mixedP: unknown[] = fullCollection();
    mixedP[6] = fullRCollection()[6];
    const p = checkSetPShortTextCorpusFreezeGate(mixedP as A3SetPFreezeSlotReadiness[]);
    expect(p).toMatchObject({
      status: SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL,
      blocker: { code: 'ENTRY_NOT_A_READINESS_SUMMARY', sample: 'SET_P', arrayPosition: 6 },
    });
  });

  it('every SET_R structural defect is refused, attributed to SET_R, never counted', () => {
    const cases: [unknown, string][] = [
      [undefined, 'SLOT_COLLECTION_NOT_AN_ARRAY'],
      [fullRCollection().slice(1), 'SLOT_COUNT_MISMATCH'],
    ];
    const moved = fullRCollection();
    moved[0] = { ...moved[0]!, split: 'FINAL_HOLDOUT' };
    cases.push([moved, 'SPLIT_SLOT_COUNT_MISMATCH']);
    const dup = fullRCollection();
    dup[9] = { ...dup[9]!, selectionIndex: dup[8]!.selectionIndex };
    cases.push([dup, 'SELECTION_INDEX_DUPLICATE']);
    const mutate = (patch: Record<string, unknown>, base = exactRSummary(4, 'DEV_TRAIN')) => {
      const c: unknown[] = fullRCollection();
      c[2] = { ...base, selectionIndex: 7, ...patch };
      return c;
    };
    cases.push([mutate({ split: 'secret-split' }), 'SPLIT_NOT_CANONICAL']);
    cases.push([
      mutate({ initialCapReadiness: SET_P_INITIAL_CAP_EXACT }),
      'READINESS_TOKEN_NOT_CANONICAL',
    ]);
    cases.push([
      mutate({ fullRankReadiness: SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT }),
      'READINESS_TOKEN_NOT_CANONICAL',
    ]);
    cases.push([mutate({ exactMeasurableSurvivorPrefixCount: 1.5 }), 'COUNT_INVALID']);
    cases.push([mutate({ shortTextUnresolvedCount: 1 }), 'READINESS_INCONSISTENT']);
    cases.push([
      mutate({ initialCapReadiness: SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP }),
      'READINESS_INCONSISTENT',
    ]);
    // Blocked rank: the cap is exact iff at least four survivors precede the boundary.
    cases.push([
      mutate(
        { exactMeasurableSurvivorPrefixCount: 3 },
        capExactRankBlockedRSummary(4, 'DEV_TRAIN'),
      ),
      'READINESS_INCONSISTENT',
    ]);
    cases.push([
      mutate(
        { exactMeasurableSurvivorPrefixCount: 4, firstBlockedSourceRankPosition: 4 },
        capBlockedRSummary(4, 'DEV_TRAIN'),
      ),
      'READINESS_INCONSISTENT',
    ]);
    cases.push([
      mutate({ firstBlockedSourceRankPosition: 2 }, capExactRankBlockedRSummary(4, 'DEV_TRAIN')),
      'READINESS_INCONSISTENT', // five survivors cannot all precede position 2
    ]);
    for (const [input, code] of cases) {
      const gate = checkSetRShortTextCorpusFreezeGate(input as A3SetRFreezeSlotReadiness[]);
      expect(gate.status, code).toBe(SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL);
      if (gate.status === SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL) {
        expect(gate.blocker.code, code).toBe(code);
        expect(gate.blocker.sample, code).toBe('SET_R');
      }
      expect(JSON.stringify(gate)).not.toContain('secret-split');
    }
  });
});

// ---------------------------------------------------------------------------
// 19 / 33, EXTENDED IN R13. OVERALL PREFLIGHT OVER BOTH SAMPLES
// ---------------------------------------------------------------------------

const OWNER_TAIL = ['K4'];

describe('2D-A3 R13: the overall current preflight requires both samples', () => {
  it('both clear -> no short-text blocker, still REFUSED on K4 alone', () => {
    const result = checkCurrentA3CorpusFreezePreflight(bothSamples());
    expect(result.kind).toBe(A3_CORPUS_FREEZE_PREFLIGHT_KIND);
    expect(result.kind).toBe('A3_CORPUS_FREEZE_PREFLIGHT_NOT_EXECUTION_AUTHORITY');
    expect(result.status).toBe(A3_CORPUS_FREEZE_PREFLIGHT_REFUSED);
    expect(result.status).not.toBe(
      A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY,
    );
    expect(classesOf(result)).toEqual(OWNER_TAIL);
    expect(result.blockers.map((b) => ('marker' in b ? b.marker : null))).toEqual([
      K4_SD4_G3_FREEZE_TIME_TRUNCATION,
    ]);
    expect(JSON.stringify(result)).not.toMatch(/READY/);
  });

  it('SET_P blocked only -> SET_P short-text blocker, then K4', () => {
    const result = checkCurrentA3CorpusFreezePreflight(
      bothSamples(fullCollection(new Set([1, 2]))),
    );
    expect(result.status).toBe(A3_CORPUS_FREEZE_PREFLIGHT_REFUSED);
    expect(classesOf(result)).toEqual(['SHORT_TEXT:SET_P', 'K4']);
    const first = result.blockers[0]!;
    expect(
      first.blockerClass === 'SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED_AT_FREEZE' && first.refusal,
    ).toBe('CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED');
  });

  it('SET_R blocked only -> SET_R short-text blocker, then K4', () => {
    const result = checkCurrentA3CorpusFreezePreflight(
      bothSamples(fullCollection(), fullRCollection(new Set(), new Set([9]))),
    );
    expect(classesOf(result)).toEqual(['SHORT_TEXT:SET_R', 'K4']);
  });

  it('both blocked -> SET_P blocker, then SET_R blocker, then K4, each with its own aggregate count', () => {
    const result = checkCurrentA3CorpusFreezePreflight(
      bothSamples(fullCollection(new Set([5])), fullRCollection(new Set([1, 2]), new Set([3]))),
    );
    expect(classesOf(result)).toEqual(['SHORT_TEXT:SET_P', 'SHORT_TEXT:SET_R', 'K4']);
    const counts = result.blockers.flatMap((b) =>
      b.blockerClass === 'SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED_AT_FREEZE'
        ? [[b.sample, b.totalSlotCount, b.blockedSlotCount]]
        : [],
    );
    expect(counts).toEqual([
      ['SET_P', 110, 1],
      ['SET_R', 110, 3],
    ]);
  });

  it('KEY: every SET_R initial cap EXACT but one complete SET_R rank blocked -> SET_R blocker still present', () => {
    const setR = fullRCollection(new Set([77]));
    expect(setR.every((r) => r.initialCapReadiness === SET_R_INITIAL_CAP_EXACT)).toBe(true);
    const result = checkCurrentA3CorpusFreezePreflight(bothSamples(fullCollection(), setR));
    expect(classesOf(result)).toEqual(['SHORT_TEXT:SET_R', 'K4']);
  });

  it('a split mismatch between the samples is a structural refusal before any short-text interpretation', () => {
    const setP = fullCollection(new Set([4]));
    const setR = fullRCollection(new Set([4]));
    // Swap the splits of one DEV_TRAIN and one FINAL_HOLDOUT SET_R slot: each
    // collection stays valid on its own (20/45/45), but they now disagree.
    const a = setR.findIndex((r) => r.split === 'DEV_TRAIN');
    const b = setR.findIndex((r) => r.split === 'FINAL_HOLDOUT');
    setR[a] = { ...setR[a]!, split: 'FINAL_HOLDOUT' };
    setR[b] = { ...setR[b]!, split: 'DEV_TRAIN' };
    expect(checkSetRShortTextCorpusFreezeGate(setR).status).toBe(
      SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED,
    );
    const result = checkCurrentA3CorpusFreezePreflight(bothSamples(setP, setR));
    expect(classesOf(result)).toEqual(['STRUCTURAL:CROSS:CROSS_SAMPLE_SLOT_SPLIT_MISMATCH', 'K4']);
    expect(result.blockers[0]).toEqual({
      blockerClass: 'STRUCTURAL_PREFLIGHT_INPUT_INVALID',
      code: 'CROSS_SAMPLE_SLOT_SPLIT_MISMATCH',
      sample: null,
      arrayPosition: a,
      firstArrayPosition: null,
      split: 'DEV_TRAIN',
      expectedCount: null,
      receivedCount: null,
    });
  });

  it('a slot covered by one sample only is a structural coverage refusal, naming a SET_P array position', () => {
    const setR = fullRCollection();
    setR[30] = { ...setR[30]!, selectionIndex: 999_999 as A3SelectionIndex };
    const result = checkCurrentA3CorpusFreezePreflight(bothSamples(fullCollection(), setR));
    expect(classesOf(result)).toEqual([
      'STRUCTURAL:CROSS:CROSS_SAMPLE_SLOT_COVERAGE_MISMATCH',
      'K4',
    ]);
    const first = result.blockers[0]!;
    expect(first.blockerClass === 'STRUCTURAL_PREFLIGHT_INPUT_INVALID' && first.arrayPosition).toBe(
      30,
    );
    expect(JSON.stringify(result)).not.toContain('999999');
    expect(JSON.stringify(result)).not.toMatch(/selectionIndex/);
  });

  it('SET_R order may differ from SET_P order: the join is by slot, not by array position', () => {
    const result = checkCurrentA3CorpusFreezePreflight(
      bothSamples(fullCollection(), [...fullRCollection()].reverse()),
    );
    expect(classesOf(result)).toEqual(OWNER_TAIL);
  });

  it('structural ordering: SET_P structural, then SET_R structural; a malformed sample emits no short-text blocker', () => {
    const setP = fullCollection(new Set([3]));
    setP.pop();
    const setR = fullRCollection(new Set([3]));
    setR[0] = { ...setR[0]!, kind: 'OTHER' as never };
    expect(classesOf(checkCurrentA3CorpusFreezePreflight(bothSamples(setP, setR)))).toEqual([
      'STRUCTURAL:SET_P:SLOT_COUNT_MISMATCH',
      'STRUCTURAL:SET_R:ENTRY_NOT_A_READINESS_SUMMARY',
      'K4',
    ]);
    // Only SET_R malformed: SET_P's short-text verdict is still evaluable; no cross-sample check.
    expect(
      classesOf(
        checkCurrentA3CorpusFreezePreflight(bothSamples(fullCollection(new Set([3])), setR)),
      ),
    ).toEqual(['STRUCTURAL:SET_R:ENTRY_NOT_A_READINESS_SUMMARY', 'SHORT_TEXT:SET_P', 'K4']);
    // Only SET_P malformed: SET_R's short-text verdict is still evaluable.
    expect(
      classesOf(
        checkCurrentA3CorpusFreezePreflight(bothSamples(setP, fullRCollection(new Set([3])))),
      ),
    ).toEqual(['STRUCTURAL:SET_P:SLOT_COUNT_MISMATCH', 'SHORT_TEXT:SET_R', 'K4']);
  });

  it('REGRESSION: the old SET_P-only call pattern is refused, never silently evaluated', () => {
    const call = checkCurrentA3CorpusFreezePreflight as unknown as (
      a: unknown,
    ) => A3CorpusFreezePreflightResult;
    // A bare SET_P array (the R9 signature): refused as a malformed input shape.
    expect(classesOf(call(fullCollection()))).toEqual([
      'STRUCTURAL:CROSS:PREFLIGHT_INPUT_NOT_TWO_SAMPLE_COLLECTIONS',
      'K4',
    ]);
    // SET_P supplied, SET_R omitted: SET_R is structurally missing.
    expect(classesOf(call({ setP: fullCollection() }))).toEqual([
      'STRUCTURAL:SET_R:SLOT_COLLECTION_NOT_AN_ARRAY',
      'K4',
    ]);
    expect(classesOf(call(null))).toEqual([
      'STRUCTURAL:CROSS:PREFLIGHT_INPUT_NOT_TWO_SAMPLE_COLLECTIONS',
      'K4',
    ]);
    // The type system refuses it too.
    // @ts-expect-error - the overall preflight needs BOTH collections.
    checkCurrentA3CorpusFreezePreflight(fullCollection());
  });

  it('is deterministic and mutates neither collection', () => {
    const input = bothSamples(fullCollection(new Set([4])), fullRCollection(new Set([8])));
    const before = JSON.stringify(input);
    expect(JSON.stringify(checkCurrentA3CorpusFreezePreflight(input))).toBe(
      JSON.stringify(
        checkCurrentA3CorpusFreezePreflight({ setP: [...input.setP], setR: [...input.setR] }),
      ),
    );
    expect(JSON.stringify(input)).toBe(before);
  });

  it('accepts the two collections only: extra caller flags change nothing', () => {
    expect(checkCurrentA3CorpusFreezePreflight.length).toBe(1);
    const call = checkCurrentA3CorpusFreezePreflight as unknown as (
      a: unknown,
      b: unknown,
    ) => A3CorpusFreezePreflightResult;
    const withFlags = {
      ...bothSamples(),
      setRScoreReductionApproved: true,
      organisationShareTruncationApproved: true,
      k4: true,
    };
    const result = call(withFlags, { sd7SampleRankSemanticsApproved: true });
    expect(result.status).toBe(A3_CORPUS_FREEZE_PREFLIGHT_REFUSED);
    expect(classesOf(result)).toEqual(OWNER_TAIL);
  });

  it('aggregate output never surfaces a selection index, a document identity or a score', () => {
    const result = checkCurrentA3CorpusFreezePreflight(
      bothSamples(fullCollection(new Set([10, 20])), fullRCollection(new Set([30]), new Set([40]))),
    );
    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(
      /selectionIndex|documentSha256|saltedRankSha256|[0-9a-f]{64}|score|pageEvidence|url|prefix/i,
    );
    for (const b of result.blockers) {
      if (b.blockerClass === 'SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED_AT_FREEZE') {
        expect(Object.values(b).filter((v) => typeof v === 'number')).toHaveLength(2);
      }
    }
  });

  it('every result names what the current preparation does not check, and never says READY', () => {
    const result = checkCurrentA3CorpusFreezePreflight(bothSamples());
    expect(result.notCheckedByCurrentPrep).toBe(
      A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP,
    );
    expect(result.notCheckedByCurrentPrep).toEqual([
      'REAL_ACQUISITION_COMPLETION',
      'REAL_GENERATION_1_SLOT_MATERIALISATION',
      'REPLACEMENT_LEDGER_FINALITY',
      'REAL_SET_P_AND_SET_R_PREPARATION_MATERIALISATION',
      'FINAL_ITEM_AND_GOLD_IDENTIFIERS',
      'A4_LABELS',
      'AGREEMENT_AND_KAPPA',
      'FINAL_MANIFEST_HASHES',
      'K4_ENFORCEMENT',
      'FINAL_GATE_DENOMINATORS',
    ]);
    expect(result.notCheckedByCurrentPrep).not.toContain('SET_R_RANKING');
    expect(Object.keys(result).sort()).toEqual([
      'blockers',
      'kind',
      'notCheckedByCurrentPrep',
      'status',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/\bREADY\b|READY_TO_FREEZE/);
  });

  it('with K4 artificially cleared and both samples clear, the result is still NOT freeze authority', async () => {
    vi.resetModules();
    vi.doMock('../harness/phase2b2d/a3prep/contracts.js', async (importOriginal) => {
      const original = await importOriginal<Record<string, unknown>>();
      return { ...original, A3_PREP_OWNER_DECISIONS_REQUIRED: Object.freeze([]) };
    });
    try {
      const mocked = await import('../harness/phase2b2d/a3prep/corpusFreezePreflight.js');
      const result = mocked.checkCurrentA3CorpusFreezePreflight(bothSamples());
      expect(result.blockers).toEqual([]);
      expect(result.status).toBe(
        'A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY',
      );
      expect(result.kind).toBe('A3_CORPUS_FREEZE_PREFLIGHT_NOT_EXECUTION_AUTHORITY');
      expect(result.notCheckedByCurrentPrep.length).toBeGreaterThan(0);
      expect(JSON.stringify(result)).not.toMatch(/\bREADY\b|READY_TO_FREEZE/);
      // Clearing K4 does not clear a blocked SET_R rank.
      const blocked = mocked.checkCurrentA3CorpusFreezePreflight(
        bothSamples(fullCollection(), fullRCollection(new Set([2]))),
      );
      expect(blocked.status).toBe('A3_CORPUS_FREEZE_PREFLIGHT_REFUSED');
      expect(classesOf(blocked)).toEqual(['SHORT_TEXT:SET_R']);
    } finally {
      vi.doUnmock('../harness/phase2b2d/a3prep/contracts.js');
      vi.resetModules();
    }
  });

  it('a contract that lists a resolved decision as required is refused, not silently dropped', async () => {
    vi.resetModules();
    vi.doMock('../harness/phase2b2d/a3prep/contracts.js', async (importOriginal) => {
      const original = await importOriginal<Record<string, unknown>>();
      const required = original.A3_PREP_OWNER_DECISIONS_REQUIRED as readonly object[];
      return {
        ...original,
        A3_PREP_OWNER_DECISIONS_REQUIRED: [{ ...required[0], resolved: true }],
      };
    });
    try {
      const mocked = await import('../harness/phase2b2d/a3prep/corpusFreezePreflight.js');
      expect(() => mocked.deriveCurrentOwnerDecisionBlockers()).toThrow(
        /OWNER_DECISION_CONTRACT_INCONSISTENT/,
      );
    } finally {
      vi.doUnmock('../harness/phase2b2d/a3prep/contracts.js');
      vi.resetModules();
    }
  });
});

// ---------------------------------------------------------------------------
// 16 / 34. SD9 ENVELOPE
// ---------------------------------------------------------------------------

describe('2D-A3 R9: SD9 bounds under the short-text treatment space', () => {
  const cases: [number, number, number, number, number, string][] = [
    [0, 0, 0, 0, 0, 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'],
    [3, 3, 0, 3, 3, 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'],
    [3, 3, 1, 3, 4, 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL'],
    [4, 4, 23, 4, 27, 'ACQUISITION_SUCCESSFUL'],
    [1, 2, 1, 1, 3, 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'],
    [2, 5, 3, 2, 8, 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL'],
    [6, 9, 2, 6, 11, 'ACQUISITION_SUCCESSFUL'],
  ];
  for (const [min, max, k, lo, hi, status] of cases) {
    it(`(${min}, ${max}, ${k}) -> [${lo}, ${hi}] ${status}, exactly R3's classification`, () => {
      const result = deriveSd9BoundsUnderShortTextPolicy({
        measurableSurvivorMin: min,
        measurableSurvivorMax: max,
        shortTextUnresolvedCount: k,
      });
      expect(result).toEqual({
        treatmentSpace: 'SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1',
        bounds: 'ADMISSIBLE_ENVELOPE_ENDPOINTS_NOT_REAL_COUNTS',
        minCount: lo,
        maxCount: hi,
        status,
      });
      expect(result.status).toBe(evaluateSd9FromAdmissiblePostSd7Bounds(lo, hi));
    });
  }

  it('the lower endpoint never moves with short text; the upper moves by exactly k', () => {
    for (let k = 0; k < 10; k += 1) {
      const r = deriveSd9BoundsUnderShortTextPolicy({
        measurableSurvivorMin: 2,
        measurableSurvivorMax: 3,
        shortTextUnresolvedCount: k,
      });
      expect(r.minCount).toBe(2);
      expect(r.maxCount).toBe(3 + k);
    }
  });

  it('refuses malformed input and overflow, without echoing values', () => {
    const bad: [number, number, number][] = [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
      [1.5, 2, 0],
      [Number.NaN, 0, 0],
      [3, 2, 0],
    ];
    for (const [a, b, c] of bad) {
      expect(() =>
        deriveSd9BoundsUnderShortTextPolicy({
          measurableSurvivorMin: a,
          measurableSurvivorMax: b,
          shortTextUnresolvedCount: c,
        }),
      ).toThrow(/SD9_BOUND_INVALID/);
    }
    try {
      deriveSd9BoundsUnderShortTextPolicy({
        measurableSurvivorMin: 0,
        measurableSurvivorMax: Number.MAX_SAFE_INTEGER,
        shortTextUnresolvedCount: 1,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as A3CorpusFreezePreflightRefusal).code).toBe('SD9_BOUND_OVERFLOW');
      expect((error as Error).message).not.toContain(String(Number.MAX_SAFE_INTEGER));
    }
  });
});

// ---------------------------------------------------------------------------
// 35. NO SEMANTIC SHORT-TEXT VERDICT (runtime)
// ---------------------------------------------------------------------------

describe('2D-A3 R9: no semantic short-text verdict at run time', () => {
  it('no output of any R9 function carries a verdict token', () => {
    const outputs: unknown[] = [
      readinessOf(scenario(12, [9, 11])),
      readinessOf(scenario(12)),
      checkSetPExtensionCursorAgainstShortTextBoundary(readinessOf(scenario(12, [9])), 10),
      checkSetPShortTextCorpusFreezeGate(fullCollection(new Set([2]))),
      checkSetPShortTextCorpusFreezeGate(fullCollection()),
      checkCurrentA3CorpusFreezePreflight(bothSamples(fullCollection(new Set([2])))),
      checkSetRShortTextCorpusFreezeGate(fullRCollection(new Set([2]), new Set([3]))),
      deriveCurrentOwnerDecisionBlockers(),
      deriveSd9BoundsUnderShortTextPolicy({
        measurableSurvivorMin: 3,
        measurableSurvivorMax: 3,
        shortTextUnresolvedCount: 2,
      }),
    ];
    const serialised = JSON.stringify(outputs);
    expect(serialised).not.toMatch(
      /UNIQUE|NEAR_DUPLICATE|ALWAYS_INCLUDE|ALWAYS_EXCLUDE|KEEP_SHORT_TEXT|DROP_SHORT_TEXT|\bPRESENT\b|\bABSENT\b/,
    );
  });
});

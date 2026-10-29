/**
 * PHASE 2B-2D A3 R8 — THE FROZEN SET_P RANK BOUND TO THE GREEDY SD7 SURVIVOR
 * PREPARATION, AND THE FAIL-CLOSED DOCUMENT CAP. BEHAVIOUR.
 *
 * Every identity, graph and text here is INVENTED. No real corpus, no sealed
 * file, no database, no network.
 *
 * Scenarios are written in SET_P RANK positions: the pool is ranked by the
 * real R2 `rankSetPFull` first, and the synthetic graph is then built over
 * those positions - stored in a DIFFERENT (reversed) document order, so any
 * accidental use of graph order shows up as a wrong answer.
 *
 * This file proves `prepareSetPSd7`:
 *
 *   - composes exactly R2 -> R7, driven by the SET_P rank, never graph order;
 *   - copies each survivor's salted digest from its R2 entry;
 *   - is input-permutation invariant;
 *   - returns an EXACT cap in exactly the two proved cases and BLOCKED in every
 *     other case with unresolved short text;
 *   - EXACT is invariant under every enumerated short-text treatment, and every
 *     BLOCKED result is genuinely ambiguous (two treatments disagree) - checked
 *     against an independent reference model of the greedy walk;
 *   - exposes no document list when blocked, at run time or at compile time;
 *   - keeps both full ranks complete, freezes its output, mutates no input;
 *   - is bound to the K3 GREEDY procedure, and refuses if it changes.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  K3_OWNER_DECISION,
  K3_SD7_SURVIVOR_PROCEDURE,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  type Split,
} from '../harness/phase2b2d/a3prep/contracts.js';
import { SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED } from '../harness/phase2b2d/a3prep/sd7.js';
import { rankSetPFull, selectSetPOrganisationCap } from '../harness/phase2b2d/a3prep/setP.js';
import {
  A3SetPSd7CompositionRefusal,
  prepareSetPSd7,
  SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
  SET_P_DOCUMENT_CAP_EXACT,
  SET_P_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE,
  type A3SetPDocumentCap,
  type A3SetPSd7Preparation,
} from '../harness/phase2b2d/a3prep/setPSd7.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3PageEvidenceId,
  A3SelectionIndex,
} from '../harness/phase2b2d/a3prep/types.js';
import {
  exactDuplicatePass,
  measureNearDuplicateGraph,
  type NearDuplicateGraphMeasurement,
} from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';

// ---------------------------------------------------------------------------
// Synthetic builders
// ---------------------------------------------------------------------------

function sha(label: string): A3DocumentSha256 {
  return createHash('sha256')
    .update(`synthetic-a3-r8:${label}`, 'utf8')
    .digest('hex') as A3DocumentSha256;
}

const EDGE_MEASUREMENT = Object.freeze({
  intersectionSize: 9,
  unionSize: 10,
  similarity: 0.9,
  atOrAboveThreshold: true,
});

function poolOf(
  labels: readonly string[],
  selectionIndex = 5,
  split: Split = 'DEV_TRAIN',
): A3DistinctDocument[] {
  return labels.map((label) => ({
    selectionIndex: selectionIndex as A3SelectionIndex,
    split,
    documentSha256: sha(label),
    sourcePageEvidenceIds: [`pe-${label}` as A3PageEvidenceId],
  }));
}

interface ScenarioSpec {
  /** SET_P rank positions whose documents are SD7_SHORT_TEXT_UNRESOLVED. */
  readonly short?: readonly number[];
  /** Edges between SET_P rank positions (measurable documents only). */
  readonly edges?: readonly (readonly [number, number])[];
  /** Graph document order, as SET_P rank positions. Default: reversed. */
  readonly graphRankOrder?: readonly number[];
}

interface Scenario {
  readonly n: number;
  readonly pool: A3DistinctDocument[];
  readonly graph: NearDuplicateGraphMeasurement;
  /** documentSha256 at each SET_P rank position. */
  readonly shaAtRank: readonly string[];
  readonly short: ReadonlySet<number>;
  readonly edges: readonly (readonly [number, number])[];
}

function scenario(n: number, spec: ScenarioSpec = {}, tag = 'd'): Scenario {
  const pool = poolOf(Array.from({ length: n }, (_, i) => `${tag}${i}`));
  const shaAtRank = rankSetPFull(pool).map((r) => r.documentSha256 as string);
  const short = new Set(spec.short ?? []);
  const graphRankOrder = spec.graphRankOrder ?? Array.from({ length: n }, (_, i) => n - 1 - i);
  const graphIndexOfRank = new Map(graphRankOrder.map((rank, gi) => [rank, gi]));
  const documents = graphRankOrder.map((rank) => ({
    documentSha256: shaAtRank[rank]!,
    tokenCount: short.has(rank) ? 2 : 50,
    shingleCount: short.has(rank) ? 0 : 46,
    measurable: !short.has(rank),
  }));
  const measurableIndices = documents.flatMap((d, i) => (d.measurable ? [i] : []));
  const edges = spec.edges ?? [];
  return {
    n,
    pool,
    shaAtRank,
    short,
    edges,
    graph: {
      documents,
      measurableIndices,
      shortTextUnresolvedCount: documents.length - measurableIndices.length,
      comparedPairCount: (measurableIndices.length * (measurableIndices.length - 1)) / 2,
      edges: edges.map(([a, b]) => {
        const x = graphIndexOfRank.get(a)!;
        const y = graphIndexOfRank.get(b)!;
        return { aIndex: Math.min(x, y), bIndex: Math.max(x, y), measurement: EDGE_MEASUREMENT };
      }),
    },
  };
}

function run(s: Scenario): A3SetPSd7Preparation {
  return prepareSetPSd7({ pool: s.pool, graph: s.graph });
}

function survivorPositions(p: A3SetPSd7Preparation): number[] {
  return p.measurableSurvivorAwareFullRank.map((s) => s.sourceRankPosition);
}

function capPositions(cap: A3SetPDocumentCap): number[] {
  if (cap.status !== SET_P_DOCUMENT_CAP_EXACT) throw new Error('expected an exact cap');
  return cap.documents.map((d) => d.sourceRankPosition);
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from }, (_, i) => from + i);

// ---------------------------------------------------------------------------
// An INDEPENDENT reference model of the greedy walk, extended over short text.
//
// A "treatment" is any conceivable future answer to
// SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP for one short-text document: either it is
// not a sample member at all, or it is a member with some set of edges to
// other documents. The model walks the SET_P rank greedily and returns the
// first-cap source positions of the resulting sample.
// ---------------------------------------------------------------------------

type ShortTreatment =
  { readonly member: false } | { readonly member: true; readonly neighbours: ReadonlySet<number> };

function referenceFirstCap(s: Scenario, treatment: ReadonlyMap<number, ShortTreatment>): number[] {
  const adjacency = new Map<number, Set<number>>(range(0, s.n).map((p) => [p, new Set()]));
  const link = (a: number, b: number): void => {
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };
  for (const [a, b] of s.edges) link(a, b);
  for (const [p, t] of treatment) if (t.member) for (const q of t.neighbours) link(p, q);

  const kept = new Set<number>();
  const sample: number[] = [];
  for (let p = 0; p < s.n; p += 1) {
    const t = treatment.get(p);
    if (s.short.has(p) && (t === undefined || !t.member)) continue;
    const q = [...adjacency.get(p)!].find((x) => kept.has(x));
    if (q !== undefined) continue;
    kept.add(p);
    sample.push(p);
  }
  return sample.slice(0, SET_P_MAX_PAGES_PER_ORGANISATION);
}

const DROP: ShortTreatment = { member: false };
const KEEP_ISOLATED: ShortTreatment = { member: true, neighbours: new Set() };

function uniform(s: Scenario, t: ShortTreatment): Map<number, ShortTreatment> {
  return new Map([...s.short].map((p) => [p, t]));
}

/** A broad family: drop, keep isolated, keep adjacent to everything, adjacent to each one doc. */
function treatmentFamily(s: Scenario, p: number): ShortTreatment[] {
  const others = range(0, s.n).filter((q) => q !== p);
  return [
    DROP,
    KEEP_ISOLATED,
    { member: true, neighbours: new Set(others) },
    ...others.map((q) => ({ member: true as const, neighbours: new Set([q]) })),
  ];
}

function* familyProduct(s: Scenario): Generator<Map<number, ShortTreatment>> {
  const shorts = [...s.short];
  const options = shorts.map((p) => treatmentFamily(s, p));
  const pick = new Array<number>(shorts.length).fill(0);
  for (;;) {
    yield new Map(shorts.map((p, i) => [p, options[i]![pick[i]!]!]));
    let i = 0;
    while (i < shorts.length && pick[i] === options[i]!.length - 1) pick[i++] = 0;
    if (i === shorts.length) return;
    pick[i]! += 1;
  }
}

/** Deterministic PRNG for the property sweep; never Math.random. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// ---------------------------------------------------------------------------

describe('2D-A3 R8: K3 binding', () => {
  it('the exact-cap rule is proved for the K3 GREEDY procedure, which the contracts still name', () => {
    expect(SET_P_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE).toBe(
      'GREEDY_SAMPLE_RANK_SURVIVOR_WALK',
    );
    expect(K3_SD7_SURVIVOR_PROCEDURE).toBe(SET_P_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE);
    expect(K3_OWNER_DECISION.survivorProcedure).toBe(
      SET_P_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE,
    );
    expect(K3_OWNER_DECISION.survivorScope).toBe('SAMPLE_SPECIFIC');
    expect(K3_OWNER_DECISION.atMostOneScope).toBe('PER_SAMPLE');
    expect(K3_OWNER_DECISION.graphScope).toBe('ONE_CANONICAL_GRAPH_PER_ORGANISATION');
    expect(K3_OWNER_DECISION.decisionRecordSha256).toBe(
      '987b88a0848a5020605619f24a9accd73a04e886c80f72ab81608fbade765eab',
    );
  });

  it('the composition walks SET_P, per sample, with the GREEDY procedure', () => {
    const p = run(scenario(3));
    expect(p.sd7Preparation.sample).toBe('SET_P');
    expect(p.sd7Preparation.survivorProcedure).toBe('GREEDY_SAMPLE_RANK_SURVIVOR_WALK');
    expect(p.sd7Preparation.survivorScope).toBe('SAMPLE_SPECIFIC');
    expect(p.measurableSurvivorAwareFullRank.every((s) => s.sample === 'SET_P')).toBe(true);
  });

  it('refuses when the K3 contract names any other procedure', async () => {
    vi.resetModules();
    vi.doMock('../harness/phase2b2d/a3prep/contracts.js', async (importOriginal) => ({
      ...(await importOriginal<object>()),
      K3_SD7_SURVIVOR_PROCEDURE: 'SOME_OTHER_SURVIVOR_PROCEDURE',
    }));
    try {
      const mocked = await import('../harness/phase2b2d/a3prep/setPSd7.js');
      const s = scenario(9, { short: [8] });
      expect(() => mocked.prepareSetPSd7({ pool: s.pool, graph: s.graph })).toThrow(
        /^STOP: K3_PROCEDURE_NOT_PROVED:/,
      );
    } finally {
      vi.doUnmock('../harness/phase2b2d/a3prep/contracts.js');
      vi.resetModules();
    }
  });
});

describe('2D-A3 R8: composition order R2 -> R7, driven by the SET_P rank', () => {
  it('returns R2’s rank unchanged as preSd7FullRank', () => {
    const s = scenario(6, { edges: [[0, 1]] });
    expect(run(s).preSd7FullRank).toEqual(rankSetPFull(s.pool));
  });

  it('passes that exact rank to R7 as the sample order', () => {
    const s = scenario(6, { short: [2] });
    const p = run(s);
    expect(p.sd7Preparation.counts.sampleOrderLength).toBe(6);
    expect(p.sd7Preparation.shortTextUnresolvedInSampleOrder.map((u) => u.documentSha256)).toEqual([
      s.shaAtRank[2],
    ]);
  });

  it('no edges: survivor-aware rank == R2 rank', () => {
    const s = scenario(11);
    const p = run(s);
    expect(survivorPositions(p)).toEqual(range(0, 11));
    expect(p.measurableSurvivorAwareFullRank.map((d) => d.documentSha256)).toEqual(
      p.preSd7FullRank.map((d) => d.documentSha256),
    );
    expect(p.sd7Preparation.measurableExclusions).toEqual([]);
  });

  it('edges exclude the LATER-ranked document, by SET_P rank', () => {
    const p = run(
      scenario(6, {
        edges: [
          [1, 4],
          [2, 3],
        ],
      }),
    );
    expect(survivorPositions(p)).toEqual([0, 1, 2, 5]);
    expect(p.sd7Preparation.measurableExclusions.map((e) => e.sourceRankPosition)).toEqual([3, 4]);
  });

  it('non-transitive P3 (r0 - r1 - r2): GREEDY keeps r0 and r2, even with r1 first in graph order', () => {
    const p = run(
      scenario(3, {
        edges: [
          [0, 1],
          [1, 2],
        ],
        graphRankOrder: [1, 0, 2],
      }),
    );
    expect(survivorPositions(p)).toEqual([0, 2]);
    expect(p.sd7Preparation.measurableExclusions.map((e) => e.sourceRankPosition)).toEqual([1]);
  });

  it('graph order that disagrees with SET_P rank is ignored', () => {
    const s = (order: number[]): number[] =>
      survivorPositions(
        run(
          scenario(5, {
            edges: [
              [0, 3],
              [1, 2],
            ],
            graphRankOrder: order,
          }),
        ),
      );
    const expected = [0, 1, 4];
    expect(s([0, 1, 2, 3, 4])).toEqual(expected);
    expect(s([4, 3, 2, 1, 0])).toEqual(expected);
    expect(s([3, 2, 4, 0, 1])).toEqual(expected);
  });

  it('permuting the pool changes nothing', () => {
    const base = scenario(12, {
      short: [9, 11],
      edges: [
        [0, 5],
        [3, 4],
      ],
    });
    const reference = run(base);
    const random = lcg(7);
    for (let k = 0; k < 20; k += 1) {
      const permuted = [...base.pool];
      for (let i = permuted.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [permuted[i], permuted[j]] = [permuted[j]!, permuted[i]!];
      }
      const p = prepareSetPSd7({ pool: permuted, graph: base.graph });
      expect(p.preSd7FullRank).toEqual(reference.preSd7FullRank);
      expect(p.measurableSurvivorAwareFullRank).toEqual(reference.measurableSurvivorAwareFullRank);
      expect(p.documentCap).toEqual(reference.documentCap);
    }
  });

  it('never calls R2’s pre-survivor cap view as the post-SD7 cap', () => {
    const s = scenario(10, { edges: [[0, 1]] });
    const p = run(s);
    const preSurvivorPrefix = selectSetPOrganisationCap(p.preSd7FullRank).map(
      (r) => r.rankPosition,
    );
    expect(preSurvivorPrefix).toEqual(range(0, 8));
    expect(capPositions(p.documentCap)).toEqual([0, 2, 3, 4, 5, 6, 7, 8]);
    expect(capPositions(p.documentCap)).not.toEqual(preSurvivorPrefix);
  });
});

describe('2D-A3 R8: survivor-aware rank carries R2’s digest and both positions', () => {
  it('every survivor’s salted digest is the one already at preSd7FullRank[sourceRankPosition]', () => {
    const p = run(
      scenario(14, {
        short: [3, 12],
        edges: [
          [0, 4],
          [5, 6],
          [6, 7],
        ],
      }),
    );
    for (const s of p.measurableSurvivorAwareFullRank) {
      const r = p.preSd7FullRank[s.sourceRankPosition]!;
      expect(s.saltedRankSha256).toBe(r.saltedRankSha256);
      expect(s.documentSha256).toBe(r.documentSha256);
      expect(s.selectionIndex).toBe(r.selectionIndex);
      expect(s.split).toBe(r.split);
    }
  });

  it('survivorRankPosition is contiguous and sourceRankPosition strictly ascending', () => {
    const p = run(
      scenario(14, {
        short: [3, 12],
        edges: [
          [0, 4],
          [5, 6],
        ],
      }),
    );
    p.measurableSurvivorAwareFullRank.forEach((s, i) => expect(s.survivorRankPosition).toBe(i));
    const src = survivorPositions(p);
    expect([...src].sort((a, b) => a - b)).toEqual(src);
    expect(new Set(src).size).toBe(src.length);
  });

  it('carries exactly the named fields and no bare rankPosition', () => {
    const p = run(scenario(2));
    expect(Object.keys(p.measurableSurvivorAwareFullRank[0]!).sort()).toEqual([
      'documentSha256',
      'saltedRankSha256',
      'sample',
      'selectionIndex',
      'sourceRankPosition',
      'split',
      'survivorRankPosition',
    ]);
  });

  it('carries the slot and split of the pool', () => {
    const pool = poolOf(['a', 'b', 'c'], 17, 'FINAL_HOLDOUT');
    const graph = scenario(0).graph;
    const g: NearDuplicateGraphMeasurement = {
      ...graph,
      documents: pool.map((d) => ({
        documentSha256: d.documentSha256,
        tokenCount: 50,
        shingleCount: 46,
        measurable: true,
      })),
      measurableIndices: [0, 1, 2],
      comparedPairCount: 3,
    };
    const p = prepareSetPSd7({ pool, graph: g });
    for (const s of p.measurableSurvivorAwareFullRank) {
      expect(s.selectionIndex).toBe(17);
      expect(s.split).toBe('FINAL_HOLDOUT');
    }
  });
});

describe('2D-A3 R8: exact cap, case A (no unresolved short text)', () => {
  for (const n of [0, 1, 7, 8, 9, 15]) {
    it(`${n} measurable survivors -> the first min(${n}, 8)`, () => {
      const p = run(scenario(n));
      expect(p.documentCap.status).toBe(SET_P_DOCUMENT_CAP_EXACT);
      if (p.documentCap.status !== SET_P_DOCUMENT_CAP_EXACT) return;
      expect(p.documentCap.reason).toBe('NO_UNRESOLVED_SHORT_TEXT');
      expect(capPositions(p.documentCap)).toEqual(range(0, Math.min(n, 8)));
      expect(p.documentCap.documents).toEqual(
        p.measurableSurvivorAwareFullRank.slice(0, SET_P_MAX_PAGES_PER_ORGANISATION),
      );
    });
  }

  it('exclusions shift the cap past excluded positions, still a prefix of the survivor rank', () => {
    const p = run(
      scenario(12, {
        edges: [
          [0, 1],
          [0, 2],
          [3, 9],
        ],
      }),
    );
    expect(capPositions(p.documentCap)).toEqual([0, 3, 4, 5, 6, 7, 8, 10]);
  });

  it('the cap constant is 8', () => {
    expect(SET_P_MAX_PAGES_PER_ORGANISATION).toBe(8);
  });
});

describe('2D-A3 R8: exact cap, case B (eight survivors precede every unresolved short text)', () => {
  const REASON = 'EIGHT_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT';

  it('exactly 8 measurable survivors, unresolved after the eighth', () => {
    const p = run(scenario(9, { short: [8] }));
    expect(p.documentCap).toMatchObject({ status: SET_P_DOCUMENT_CAP_EXACT, reason: REASON });
    expect(capPositions(p.documentCap)).toEqual(range(0, 8));
  });

  it('9+ measurable survivors, unresolved after the eighth', () => {
    const p = run(scenario(12, { short: [10] }));
    expect(p.documentCap).toMatchObject({ status: SET_P_DOCUMENT_CAP_EXACT, reason: REASON });
    expect(capPositions(p.documentCap)).toEqual(range(0, 8));
  });

  it('several unresolved, all after the eighth', () => {
    const p = run(scenario(14, { short: [8, 11, 13] }));
    expect(p.documentCap).toMatchObject({ status: SET_P_DOCUMENT_CAP_EXACT, reason: REASON });
    expect(capPositions(p.documentCap)).toEqual(range(0, 8));
  });

  it('exclusions before the boundary move it, and the rule reads SOURCE positions', () => {
    // Survivors 0,2,3,4,5,6,7,8 -> eighth survivor at source 8; short at 9.
    const p = run(scenario(11, { short: [9], edges: [[0, 1]] }));
    expect(p.documentCap).toMatchObject({ status: SET_P_DOCUMENT_CAP_EXACT, reason: REASON });
    expect(capPositions(p.documentCap)).toEqual([0, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('2D-A3 R8: blocked cap', () => {
  const blocked = (s: Scenario): A3SetPDocumentCap => run(s).documentCap;

  const CASES: readonly (readonly [string, Scenario, number, number | null])[] = [
    ['0 measurable survivors + short text', scenario(2, { short: [0, 1] }), 0, null],
    ['7 measurable survivors + short text after them', scenario(8, { short: [7] }), 7, null],
    ['7 measurable survivors + short text before them', scenario(8, { short: [0] }), 0, null],
    ['unresolved immediately before the eighth survivor', scenario(9, { short: [7] }), 7, 8],
    ['unresolved at the very beginning', scenario(10, { short: [0] }), 0, 8],
    ['unresolved interleaved among the first eight', scenario(12, { short: [2, 5] }), 2, 9],
    ['one before the eighth, others after', scenario(14, { short: [4, 10, 12] }), 4, 8],
    ['all short text', scenario(5, { short: [0, 1, 2, 3, 4] }), 0, null],
    [
      'exclusions pushing the eighth survivor past a short text',
      scenario(11, { short: [8], edges: [[0, 1]] }),
      8,
      9,
    ],
  ];

  for (const [name, s, earliest, boundary] of CASES) {
    it(name, () => {
      const cap = blocked(s);
      expect(cap).toEqual({
        status: SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
        openIssue: SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
        measurableSurvivorCount: run(s).measurableSurvivorAwareFullRank.length,
        shortTextUnresolvedCount: s.short.size,
        earliestUnresolvedShortTextSourceRankPosition: earliest,
        capBoundaryMeasurableSurvivorSourceRankPosition: boundary,
      });
    });
  }

  it('the open-issue token is K3’s residual token', () => {
    expect(SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED).toBe('SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP');
  });
});

describe('2D-A3 R8: no false finality when blocked', () => {
  const cap = run(scenario(9, { short: [7] })).documentCap;

  it('the blocked variant carries counts and positions only - no list of any kind', () => {
    expect(cap.status).toBe(SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP);
    expect(Object.keys(cap).sort()).toEqual([
      'capBoundaryMeasurableSurvivorSourceRankPosition',
      'earliestUnresolvedShortTextSourceRankPosition',
      'measurableSurvivorCount',
      'openIssue',
      'shortTextUnresolvedCount',
      'status',
    ]);
    for (const value of Object.values(cap)) {
      expect(['string', 'number'].includes(typeof value) || value === null).toBe(true);
    }
    expect('documents' in cap).toBe(false);
    expect(JSON.stringify(cap)).not.toMatch(/[0-9a-f]{64}|selected|preview|keep|drop/i);
  });

  it('at compile time, the blocked variant has no document list', () => {
    if (cap.status === SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP) {
      // @ts-expect-error - the blocked variant deliberately has no `documents`.
      expect(cap.documents).toBeUndefined();
    }
    // A consumer must branch on status before any document list exists.
    // @ts-expect-error - `documents` is not on the un-narrowed union.
    expect(cap.documents).toBeUndefined();
  });

  it('the preparation still exposes the unresolved positions as R7 partitioned them, undecided', () => {
    const p = run(scenario(9, { short: [7] }));
    const u = p.sd7Preparation.shortTextUnresolvedInSampleOrder;
    expect(u.map((x) => x.sourceRankPosition)).toEqual([7]);
    expect(Object.keys(u[0]!)).not.toContain('member');
    expect(Object.keys(u[0]!)).not.toContain('kept');
  });
});

describe('2D-A3 R8: the GREEDY tail proof, against an independent reference model', () => {
  it('the reference model agrees with R7 when every short text is dropped', () => {
    for (const s of [
      scenario(12, {
        short: [9, 11],
        edges: [
          [0, 5],
          [3, 4],
        ],
      }),
      scenario(9, { short: [7] }),
      scenario(10, {
        edges: [
          [0, 1],
          [1, 2],
        ],
      }),
    ]) {
      const p = run(s);
      expect(referenceFirstCap(s, uniform(s, DROP))).toEqual(
        survivorPositions(p).slice(0, SET_P_MAX_PAGES_PER_ORGANISATION),
      );
    }
  });

  it('EXACT (one short text after the eighth): invariant under ALL 2^n edge sets and non-membership', () => {
    const s = scenario(10, { short: [9], edges: [[2, 3]] });
    const exact = capPositions(run(s).documentCap);
    expect(exact).toEqual([0, 1, 2, 4, 5, 6, 7, 8]);
    const others = range(0, 9);
    let treatments = 0;
    expect(referenceFirstCap(s, new Map([[9, DROP]]))).toEqual(exact);
    for (let mask = 0; mask < 1 << others.length; mask += 1) {
      const neighbours = new Set(others.filter((_, i) => (mask >> i) & 1));
      expect(referenceFirstCap(s, new Map([[9, { member: true, neighbours }]]))).toEqual(exact);
      treatments += 1;
    }
    expect(treatments).toBe(512);
  });

  it('EXACT (several short texts after the eighth): invariant under the whole treatment family product', () => {
    const s = scenario(13, {
      short: [9, 11, 12],
      edges: [
        [0, 10],
        [4, 5],
      ],
    });
    const exact = capPositions(run(s).documentCap);
    let treatments = 0;
    for (const t of familyProduct(s)) {
      expect(referenceFirstCap(s, t)).toEqual(exact);
      treatments += 1;
    }
    expect(treatments).toBeGreaterThan(1000);
  });

  it('every BLOCKED example is genuinely ambiguous: drop-all and keep-isolated disagree', () => {
    for (const s of [
      scenario(2, { short: [0, 1] }),
      scenario(8, { short: [7] }),
      scenario(9, { short: [7] }),
      scenario(10, { short: [0] }),
      scenario(14, { short: [4, 10, 12] }),
      scenario(11, { short: [8], edges: [[0, 1]] }),
    ]) {
      expect(run(s).documentCap.status).toBe(
        SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
      );
      expect(referenceFirstCap(s, uniform(s, DROP))).not.toEqual(
        referenceFirstCap(s, uniform(s, KEEP_ISOLATED)),
      );
    }
  });

  it('property sweep: EXACT <=> invariant across treatments; BLOCKED <=> two treatments disagree', () => {
    const random = lcg(20260921);
    let exactSeen = 0;
    let blockedSeen = 0;
    for (let k = 0; k < 400; k += 1) {
      const n = Math.floor(random() * 15);
      const short = range(0, n).filter(() => random() < 0.15);
      const measurable = range(0, n).filter((p) => !short.includes(p));
      const edges: [number, number][] = [];
      for (let i = 0; i < measurable.length; i += 1) {
        for (let j = i + 1; j < measurable.length; j += 1) {
          if (random() < 0.08) edges.push([measurable[i]!, measurable[j]!]);
        }
      }
      const s = scenario(n, { short, edges }, `k${k}-`);
      const cap = run(s).documentCap;
      const dropAll = referenceFirstCap(s, uniform(s, DROP));
      const keepAll = referenceFirstCap(s, uniform(s, KEEP_ISOLATED));
      if (cap.status === SET_P_DOCUMENT_CAP_EXACT) {
        exactSeen += 1;
        const expected = capPositions(cap);
        expect(dropAll).toEqual(expected);
        expect(keepAll).toEqual(expected);
        for (const p of s.short) {
          for (const t of treatmentFamily(s, p)) {
            const m = uniform(s, DROP);
            m.set(p, t);
            expect(referenceFirstCap(s, m)).toEqual(expected);
          }
        }
      } else {
        blockedSeen += 1;
        expect(s.short.size).toBeGreaterThan(0);
        expect(dropAll).not.toEqual(keepAll);
      }
    }
    expect(exactSeen).toBeGreaterThan(50);
    expect(blockedSeen).toBeGreaterThan(50);
  });
});

describe('2D-A3 R8: both full ranks are retained', () => {
  const s = scenario(14, { short: [12], edges: [[1, 2]] });
  const p = run(s);

  it('the pre-SD7 rank holds every pool document', () => {
    expect(p.preSd7FullRank.length).toBe(14);
    expect(p.preSd7FullRank.map((r) => r.rankPosition)).toEqual(range(0, 14));
  });

  it('the survivor-aware rank holds every measurable survivor, beyond the cap too', () => {
    expect(survivorPositions(p)).toEqual([0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13]);
    expect(p.measurableSurvivorAwareFullRank.length).toBe(
      p.sd7Preparation.counts.measurableSurvivorCount,
    );
    expect(p.measurableSurvivorAwareFullRank.slice(8).map((d) => d.survivorRankPosition)).toEqual([
      8, 9, 10, 11,
    ]);
  });

  it('the exact cap is a prefix; the next cursor position needs no re-rank', () => {
    expect(p.documentCap.status).toBe(SET_P_DOCUMENT_CAP_EXACT);
    if (p.documentCap.status !== SET_P_DOCUMENT_CAP_EXACT) return;
    expect(p.documentCap.documents).toEqual(p.measurableSurvivorAwareFullRank.slice(0, 8));
    const next = p.measurableSurvivorAwareFullRank[p.documentCap.documents.length]!;
    expect(next.survivorRankPosition).toBe(8);
    expect(next.sourceRankPosition).toBe(9);
  });

  it('positions beyond the cap are stable across runs', () => {
    expect(run(s).measurableSurvivorAwareFullRank).toEqual(p.measurableSurvivorAwareFullRank);
  });
});

describe('2D-A3 R8: immutability', () => {
  it('freezes the preparation, both ranks, the cap and its documents', () => {
    const p = run(scenario(10, { short: [9] }));
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.preSd7FullRank)).toBe(true);
    expect(Object.isFrozen(p.measurableSurvivorAwareFullRank)).toBe(true);
    for (const s of p.measurableSurvivorAwareFullRank) expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(p.sd7Preparation)).toBe(true);
    expect(Object.isFrozen(p.documentCap)).toBe(true);
    if (p.documentCap.status === SET_P_DOCUMENT_CAP_EXACT) {
      expect(Object.isFrozen(p.documentCap.documents)).toBe(true);
    }
    expect(Object.isFrozen(run(scenario(9, { short: [0] })).documentCap)).toBe(true);
  });

  it('mutates neither pool nor graph', () => {
    const s = scenario(12, {
      short: [3, 10],
      edges: [
        [0, 1],
        [4, 5],
      ],
    });
    const before = JSON.stringify([s.pool, s.graph]);
    run(s);
    expect(JSON.stringify([s.pool, s.graph])).toBe(before);
  });
});

describe('2D-A3 R8: failures pass through or fail closed, naming no identity', () => {
  it('an R2 refusal (repeated identity) passes through unchanged', () => {
    const s = scenario(3);
    expect(() => prepareSetPSd7({ pool: [...s.pool, s.pool[0]!], graph: s.graph })).toThrow(
      /^STOP: input positions 0 and 3 carry the same document identity/,
    );
  });

  it('an R7 refusal (pool and graph disagree) passes through unchanged', () => {
    const s = scenario(4);
    const other = scenario(4, {}, 'e');
    expect(() => prepareSetPSd7({ pool: s.pool, graph: other.graph })).toThrow(
      /^STOP: ORDER_GRAPH_COVERAGE_MISMATCH:/,
    );
  });

  it('no refusal message carries a document identity', () => {
    const s = scenario(4);
    const other = scenario(4, {}, 'e');
    for (const attempt of [
      () => prepareSetPSd7({ pool: s.pool, graph: other.graph }),
      () => prepareSetPSd7({ pool: [...s.pool, s.pool[1]!], graph: s.graph }),
    ]) {
      try {
        attempt();
        expect.unreachable();
      } catch (error) {
        expect(String((error as Error).message)).not.toMatch(/[0-9a-f]{64}/);
      }
    }
  });

  it('the composition refusal is a STOP with a code', () => {
    const e = new A3SetPSd7CompositionRefusal('SOURCE_IDENTITY_MISMATCH', 'x.');
    expect(e.message).toBe('STOP: SOURCE_IDENTITY_MISMATCH: x.');
    expect(e.code).toBe('SOURCE_IDENTITY_MISMATCH');
  });
});

describe('2D-A3 R8: consumes a graph from the real R6 measureNearDuplicateGraph', () => {
  const words = (prefix: string, count: number): string[] =>
    Array.from({ length: count }, (_, i) => `${prefix}${i}`);

  it('composes over a real R6 graph and blocks on its real short-text document', () => {
    const labels = range(0, 10).map((i) => `real${i}`);
    const pool = poolOf(labels);
    const rank = rankSetPFull(pool);
    const labelAtRank = rank.map((r) => labels.find((l) => sha(l) === r.documentSha256)!);
    const texts = new Map<string, string>();
    // Rank 1 is a near-duplicate of rank 0 (last ten words edited); rank 5 is short.
    labelAtRank.forEach((label, rp) => {
      const t =
        rp === 1
          ? [...words(`w${labelAtRank[0]}-`, 190), ...words('edit', 10)].join(' ')
          : rp === 5
            ? 'too short'
            : words(`w${label}-`, 200).join(' ');
      texts.set(sha(label), t);
    });
    const pages = labels.map((l) => ({
      pageId: `pe-${l}`,
      documentSha256: sha(l),
      mainText: texts.get(sha(l))!,
    }));
    const graph = measureNearDuplicateGraph(exactDuplicatePass(pages).groups, (x) => texts.get(x)!);
    expect(graph.edges.length).toBe(1);
    expect(graph.shortTextUnresolvedCount).toBe(1);

    const p = prepareSetPSd7({ pool, graph });
    expect(survivorPositions(p)).toEqual([0, 2, 3, 4, 6, 7, 8, 9]);
    expect(p.sd7Preparation.measurableExclusions.map((e) => e.sourceRankPosition)).toEqual([1]);
    expect(p.documentCap).toMatchObject({
      status: SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
      earliestUnresolvedShortTextSourceRankPosition: 5,
      capBoundaryMeasurableSurvivorSourceRankPosition: 9,
    });
  });
});

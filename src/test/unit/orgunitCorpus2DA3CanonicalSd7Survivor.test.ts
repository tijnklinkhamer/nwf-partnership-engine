/**
 * PHASE 2B-2D A3 R7 — THE GREEDY SD7 SURVIVOR WALK, BEHAVIOUR.
 *
 * Every graph, identity and text here is INVENTED. No real corpus, no sealed
 * file, no database, no network.
 *
 * This file proves `prepareSd7SampleSurvivors`:
 *
 *   - is bound to the landed K3 owner semantics, and a change to them breaks it;
 *   - is GREEDY over KEPT documents (P3 is the canonical proof), on isolated
 *     nodes, one edge, a clique, P3, P4, a star and disconnected components;
 *   - follows the caller's sample order, never `graph.documents` order;
 *   - partitions SD7_SHORT_TEXT_UNRESOLVED documents out, in sample order,
 *     without keeping or dropping them;
 *   - is prefix-stable as a PROCESS, and not as a slice of its output;
 *   - refuses every incomplete order and every structurally impossible graph;
 *   - mutates no input and freezes its output;
 *   - walks a synthetic SET_P order and a synthetic SET_R order by the same
 *     algorithm (a synthetic SET_R order is NOT a truthful production one:
 *     K1 and K2 are still open);
 *   - consumes a graph produced by the real R6 `measureNearDuplicateGraph`.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contracts from '../harness/phase2b2d/a3prep/contracts.js';
import {
  A3_SD7_SURVIVOR_ADAPTER_K3_BINDING,
  A3Sd7SurvivorRefusal,
  prepareSd7SampleSurvivors,
  SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
  type A3Sd7SampleOrderEntry,
  type A3Sd7SampleSurvivorPreparation,
  type A3Sd7SurvivorRefusalCode,
} from '../harness/phase2b2d/a3prep/sd7.js';
import type { Split } from '../harness/phase2b2d/a3prep/contracts.js';
import type {
  A3DocumentSha256,
  A3Sample,
  A3SelectionIndex,
} from '../harness/phase2b2d/a3prep/types.js';
import {
  exactDuplicatePass,
  measureNearDuplicateGraph,
  type NearDuplicateGraphMeasurement,
} from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

// ---------------------------------------------------------------------------
// Synthetic builders
// ---------------------------------------------------------------------------

function sha(label: string): A3DocumentSha256 {
  return createHash('sha256')
    .update(`synthetic-a3-r7:${label}`, 'utf8')
    .digest('hex') as A3DocumentSha256;
}

const EDGE_MEASUREMENT = Object.freeze({
  intersectionSize: 9,
  unionSize: 10,
  similarity: 0.9,
  atOrAboveThreshold: true,
});

interface NodeSpec {
  readonly label: string;
  readonly measurable?: boolean;
}

/** A synthetic graph in the exact R6 shape. Edges name labels, not indices. */
function graphOf(
  nodes: readonly (string | NodeSpec)[],
  edges: readonly (readonly [string, string])[] = [],
): NearDuplicateGraphMeasurement {
  const specs = nodes.map((n) => (typeof n === 'string' ? { label: n, measurable: true } : n));
  const index = new Map(specs.map((s, i) => [s.label, i]));
  const documents = specs.map((s) => ({
    documentSha256: sha(s.label),
    tokenCount: s.measurable === false ? 2 : 50,
    shingleCount: s.measurable === false ? 0 : 46,
    measurable: s.measurable !== false,
  }));
  const measurableIndices = documents.flatMap((d, i) => (d.measurable ? [i] : []));
  return {
    documents,
    measurableIndices,
    shortTextUnresolvedCount: documents.length - measurableIndices.length,
    comparedPairCount: (measurableIndices.length * (measurableIndices.length - 1)) / 2,
    edges: edges.map(([a, b]) => {
      const x = index.get(a)!;
      const y = index.get(b)!;
      return { aIndex: Math.min(x, y), bIndex: Math.max(x, y), measurement: EDGE_MEASUREMENT };
    }),
  };
}

function orderOf(
  labels: readonly string[],
  sample: A3Sample = 'SET_P',
  selectionIndex = 3,
  split: Split = 'DEV_TRAIN',
): A3Sd7SampleOrderEntry[] {
  return labels.map((label, rankPosition) => ({
    sample,
    selectionIndex: selectionIndex as A3SelectionIndex,
    split,
    documentSha256: sha(label),
    rankPosition,
  }));
}

const LABEL_BY_SHA = new Map<string, string>();
for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) LABEL_BY_SHA.set(sha(l), l);
for (const l of ['s1', 's2', 's3', 'x', 'y', 'z']) LABEL_BY_SHA.set(sha(l), l);

function labelsOf(entries: readonly { readonly documentSha256: string }[]): string[] {
  return entries.map((e) => LABEL_BY_SHA.get(e.documentSha256) ?? '?');
}

function walk(
  graph: NearDuplicateGraphMeasurement,
  labels: readonly string[],
  sample: A3Sample = 'SET_P',
): A3Sd7SampleSurvivorPreparation {
  return prepareSd7SampleSurvivors({ sample, graph, order: orderOf(labels, sample) });
}

function kept(graph: NearDuplicateGraphMeasurement, labels: readonly string[]): string[] {
  return labelsOf(walk(graph, labels).measurableSurvivors);
}

function refusalCode(run: () => unknown): A3Sd7SurvivorRefusalCode | 'NO_REFUSAL' {
  try {
    run();
    return 'NO_REFUSAL';
  } catch (error) {
    expect(error).toBeInstanceOf(A3Sd7SurvivorRefusal);
    return (error as A3Sd7SurvivorRefusal).code;
  }
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

// ---------------------------------------------------------------------------
// K3 binding
// ---------------------------------------------------------------------------

describe('2D-A3 R7: bound to the landed K3 owner semantics', () => {
  it('the K3 owner record on disk hashes to the contract binding, which R7 carries', () => {
    const bytes = readFileSync(join(REPO_ROOT, contracts.K3_OWNER_DECISION.decisionRecordPath));
    const digest = createHash('sha256').update(bytes).digest('hex');
    expect(digest).toBe('987b88a0848a5020605619f24a9accd73a04e886c80f72ab81608fbade765eab');
    expect(A3_SD7_SURVIVOR_ADAPTER_K3_BINDING.decisionRecordSha256).toBe(digest);
    expect(A3_SD7_SURVIVOR_ADAPTER_K3_BINDING.decisionToken).toBe(
      'K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_CLARIFICATION_V1',
    );
  });

  it('pins the four owner-bound tokens by literal value', () => {
    expect(A3_SD7_SURVIVOR_ADAPTER_K3_BINDING).toEqual({
      decisionToken: 'K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_CLARIFICATION_V1',
      decisionRecordPath:
        'docs/evaluation/PHASE_2B_2D_A3_K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_OWNER_CLARIFICATION_V1.json',
      decisionRecordSha256: '987b88a0848a5020605619f24a9accd73a04e886c80f72ab81608fbade765eab',
      survivorProcedure: 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK',
      survivorScope: 'SAMPLE_SPECIFIC',
      graphScope: 'ONE_CANONICAL_GRAPH_PER_ORGANISATION',
      atMostOneScope: 'PER_SAMPLE',
    });
    expect(Object.isFrozen(A3_SD7_SURVIVOR_ADAPTER_K3_BINDING)).toBe(true);
  });

  it('every result names the greedy procedure and the sample-specific scope', () => {
    const result = walk(graphOf(['A']), ['A']);
    expect(result.survivorProcedure).toBe('GREEDY_SAMPLE_RANK_SURVIVOR_WALK');
    expect(result.survivorScope).toBe('SAMPLE_SPECIFIC');
    expect(result.kind).toBe('A3_SD7_SAMPLE_SURVIVOR_PREPARATION_NOT_A_FINAL_SAMPLE');
  });

  it('no decision stays unresolved (K1, K2 and then K4 were later resolved by owner records)', () => {
    expect(contracts.A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS).toEqual([]);
    expect(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED.map((d) => d.id)).toEqual([]);
    expect(contracts.A3_PREP_RESOLVED_OWNER_DECISION_MARKERS).toContain(
      contracts.K4_SD4_G3_FREEZE_TIME_TRUNCATION,
    );
  });

  it('SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP remains unresolved in the K3 record, and R7 only names it', () => {
    const record = JSON.parse(
      readFileSync(join(REPO_ROOT, contracts.K3_OWNER_DECISION.decisionRecordPath), 'utf8'),
    ) as {
      ownerDecision: {
        clause12_whatK3DoesNotDecide: {
          residualAdjacentIssue: { token: string; resolved: boolean };
        };
      };
    };
    const residual = record.ownerDecision.clause12_whatK3DoesNotDecide.residualAdjacentIssue;
    expect(residual.token).toBe(SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED);
    expect(residual.resolved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Graph-theoretic fixtures
// ---------------------------------------------------------------------------

describe('2D-A3 R7: greedy walk over graph shapes', () => {
  it('isolated nodes: every measurable document survives, in sample order', () => {
    const graph = graphOf(['A', 'B', 'C', 'D']);
    expect(kept(graph, ['C', 'A', 'D', 'B'])).toEqual(['C', 'A', 'D', 'B']);
    expect(walk(graph, ['C', 'A', 'D', 'B']).measurableExclusions).toEqual([]);
  });

  it('one edge: the earlier-ranked endpoint survives, in either direction', () => {
    const graph = graphOf(['A', 'B'], [['A', 'B']]);
    expect(kept(graph, ['A', 'B'])).toEqual(['A']);
    expect(labelsOf(walk(graph, ['A', 'B']).measurableExclusions)).toEqual(['B']);
    expect(kept(graph, ['B', 'A'])).toEqual(['B']);
    expect(labelsOf(walk(graph, ['B', 'A']).measurableExclusions)).toEqual(['A']);
  });

  it('clique: only the first-ranked member survives, under every order', () => {
    const labels = ['A', 'B', 'C', 'D'];
    const edges = labels.flatMap((a, i) => labels.slice(i + 1).map((b) => [a, b] as const));
    const graph = graphOf(labels, edges);
    for (const order of permutations(labels)) expect(kept(graph, order)).toEqual([order[0]]);
  });

  it('P3 A-B-C: order B,A,C keeps only B; order A,B,C keeps A and C (GREEDY, not any-earlier-neighbour)', () => {
    const graph = graphOf(
      ['A', 'B', 'C'],
      [
        ['A', 'B'],
        ['B', 'C'],
      ],
    );
    expect(kept(graph, ['B', 'A', 'C'])).toEqual(['B']);
    expect(kept(graph, ['A', 'B', 'C'])).toEqual(['A', 'C']);
    // C has an EARLIER neighbour (B) in A,B,C, yet survives: B was never kept.
    const result = walk(graph, ['A', 'B', 'C']);
    expect(labelsOf(result.measurableExclusions)).toEqual(['B']);
    expect(result.measurableExclusions[0]!.blockingSurvivorRankPosition).toBe(0);
  });

  it('P4 A-B-C-D: several orders', () => {
    const graph = graphOf(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
      ],
    );
    expect(kept(graph, ['A', 'B', 'C', 'D'])).toEqual(['A', 'C']);
    expect(kept(graph, ['D', 'C', 'B', 'A'])).toEqual(['D', 'B']);
    expect(kept(graph, ['B', 'C', 'A', 'D'])).toEqual(['B', 'D']);
    expect(kept(graph, ['A', 'D', 'B', 'C'])).toEqual(['A', 'D']);
    expect(kept(graph, ['C', 'A', 'B', 'D'])).toEqual(['C', 'A']);
  });

  it('star: centre first keeps the centre only; leaves first keep every leaf', () => {
    const graph = graphOf(
      ['H', 'L', 'M', 'N'],
      [
        ['H', 'L'],
        ['H', 'M'],
        ['H', 'N'],
      ],
    );
    expect(kept(graph, ['H', 'L', 'M', 'N'])).toEqual(['H']);
    expect(kept(graph, ['L', 'M', 'N', 'H'])).toEqual(['L', 'M', 'N']);
    expect(kept(graph, ['L', 'H', 'M', 'N'])).toEqual(['L', 'M', 'N']);
  });

  it('disconnected components are walked independently under one global sample order', () => {
    const graph = graphOf(
      ['A', 'B', 'C', 'X', 'Y', 'Z'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['X', 'Y'],
      ],
    );
    const order = ['Y', 'B', 'Z', 'A', 'X', 'C'];
    expect(kept(graph, order)).toEqual(['Y', 'B', 'Z']);
    const result = walk(graph, order);
    expect(result.measurableSurvivors.map((s) => s.sourceRankPosition)).toEqual([0, 1, 2]);
    expect(labelsOf(result.measurableExclusions)).toEqual(['A', 'X', 'C']);
    expect(result.measurableExclusions.map((e) => e.blockingSurvivorRankPosition)).toEqual([
      1, 0, 1,
    ]);
  });

  it('exclusion audit names the EARLIEST kept neighbour when several are kept', () => {
    const graph = graphOf(
      ['L', 'M', 'H'],
      [
        ['H', 'L'],
        ['H', 'M'],
      ],
    );
    const result = walk(graph, ['M', 'L', 'H']);
    expect(labelsOf(result.measurableSurvivors)).toEqual(['M', 'L']);
    expect(result.measurableExclusions[0]!.blockingSurvivorRankPosition).toBe(0);
  });

  it('property: over every order of small graphs, survivors form a MAXIMAL independent set, each exclusion blocked by an earlier survivor', () => {
    const graphs = [
      graphOf(
        ['A', 'B', 'C', 'D', 'E'],
        [
          ['A', 'B'],
          ['B', 'C'],
          ['C', 'D'],
          ['D', 'E'],
          ['E', 'A'],
        ],
      ),
      graphOf(
        ['A', 'B', 'C', 'D', 'E'],
        [
          ['A', 'B'],
          ['A', 'C'],
          ['B', 'C'],
          ['C', 'D'],
        ],
      ),
    ];
    for (const graph of graphs) {
      const adjacent = new Set(graph.edges.map((e) => `${e.aIndex}:${e.bIndex}`));
      const idx = new Map(graph.documents.map((d, i) => [d.documentSha256, i]));
      const edge = (a: string, b: string): boolean => {
        const x = idx.get(a)!;
        const y = idx.get(b)!;
        return adjacent.has(`${Math.min(x, y)}:${Math.max(x, y)}`);
      };
      for (const order of permutations(['A', 'B', 'C', 'D', 'E'])) {
        const result = walk(graph, order);
        const survivors = result.measurableSurvivors.map((s) => s.documentSha256 as string);
        for (const a of survivors)
          for (const b of survivors) expect(a !== b && edge(a, b)).toBe(false);
        for (const excluded of result.measurableExclusions) {
          const blocker = result.measurableSurvivors[excluded.blockingSurvivorRankPosition]!;
          expect(edge(blocker.documentSha256, excluded.documentSha256)).toBe(true);
          expect(blocker.sourceRankPosition).toBeLessThan(excluded.sourceRankPosition);
        }
        expect(result.counts.measurableSurvivorCount + result.counts.measurableExclusionCount).toBe(
          5,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Sample order, never graph order
// ---------------------------------------------------------------------------

describe('2D-A3 R7: the sample order controls the walk, never graph.documents order', () => {
  it('graph order A,B,C with sample order C,B,A follows the sample', () => {
    const graph = graphOf(
      ['A', 'B', 'C'],
      [
        ['A', 'B'],
        ['B', 'C'],
      ],
    );
    expect(graph.documents.map((d) => LABEL_BY_SHA.get(d.documentSha256))).toEqual(['A', 'B', 'C']);
    expect(kept(graph, ['B', 'C', 'A'])).toEqual(['B']);
    expect(kept(graph, ['C', 'B', 'A'])).toEqual(['C', 'A']);
  });

  it('permuting graph.documents (same relation) never changes the result for a fixed sample order', () => {
    const one = graphOf(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
      ],
    );
    const two = graphOf(
      ['D', 'C', 'B', 'A'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
      ],
    );
    for (const order of permutations(['A', 'B', 'C', 'D'])) {
      expect(walk(one, order)).toEqual(walk(two, order));
    }
  });
});

// ---------------------------------------------------------------------------
// Short-text boundary
// ---------------------------------------------------------------------------

describe('2D-A3 R7: SD7_SHORT_TEXT_UNRESOLVED documents are neither kept nor dropped', () => {
  const nodes = [
    'A',
    { label: 's1', measurable: false },
    'B',
    'C',
    { label: 's2', measurable: false },
    { label: 's3', measurable: false },
  ];
  const edges = [
    ['A', 'B'],
    ['B', 'C'],
  ] as const;
  const graph = graphOf(nodes, edges);
  const order = ['s3', 'A', 's1', 'B', 'C', 's2'];
  const result = walk(graph, order);

  it('never appear among survivors or exclusions', () => {
    const measurable = [...result.measurableSurvivors, ...result.measurableExclusions];
    expect(labelsOf(measurable).filter((l) => l.startsWith('s'))).toEqual([]);
  });

  it('never appear in an edge of the graph they came from', () => {
    for (const e of graph.edges) {
      expect(graph.documents[e.aIndex]!.measurable).toBe(true);
      expect(graph.documents[e.bIndex]!.measurable).toBe(true);
    }
  });

  it('are partitioned into shortTextUnresolvedInSampleOrder, in the sample order, at their source positions', () => {
    expect(labelsOf(result.shortTextUnresolvedInSampleOrder)).toEqual(['s3', 's1', 's2']);
    expect(result.shortTextUnresolvedInSampleOrder.map((s) => s.sourceRankPosition)).toEqual([
      0, 2, 5,
    ]);
    expect(result.shortTextUnresolvedInSampleOrder.map((s) => s.unresolvedOrdinal)).toEqual([
      0, 1, 2,
    ]);
    for (const s of result.shortTextUnresolvedInSampleOrder) {
      expect(s.openIssue).toBe('SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP');
    }
  });

  it('do not change any measurable greedy decision', () => {
    const measurableOnly = graphOf(['A', 'B', 'C'], edges);
    expect(labelsOf(result.measurableSurvivors)).toEqual(kept(measurableOnly, ['A', 'B', 'C']));
    expect(labelsOf(result.measurableSurvivors)).toEqual(['A', 'C']);
    // Survivor positions skip no number because a short-text document preceded them.
    expect(result.measurableSurvivors.map((s) => s.survivorRankPosition)).toEqual([0, 1]);
    expect(result.measurableSurvivors.map((s) => s.sourceRankPosition)).toEqual([1, 4]);
  });

  it('carry no field that could imply a final keep/drop', () => {
    for (const entry of result.shortTextUnresolvedInSampleOrder) {
      expect(Object.keys(entry).sort()).toEqual([
        'documentSha256',
        'openIssue',
        'sample',
        'selectionIndex',
        'sourceRankPosition',
        'split',
        'unresolvedOrdinal',
      ]);
      for (const key of Object.keys(entry)) {
        expect(key).not.toMatch(/kept|keep|excluded|exclusion|survivor|dropped|member|selected/i);
      }
    }
  });

  it('counts account for every order entry exactly once', () => {
    expect(result.counts).toEqual({
      sampleOrderLength: 6,
      measurableDocumentCount: 3,
      measurableSurvivorCount: 2,
      measurableExclusionCount: 1,
      shortTextUnresolvedCount: 3,
    });
  });

  it('a graph of short text only yields no survivor and no exclusion', () => {
    const only = graphOf([
      { label: 's1', measurable: false },
      { label: 's2', measurable: false },
    ]);
    const r = walk(only, ['s2', 's1']);
    expect(r.measurableSurvivors).toEqual([]);
    expect(r.measurableExclusions).toEqual([]);
    expect(labelsOf(r.shortTextUnresolvedInSampleOrder)).toEqual(['s2', 's1']);
  });
});

// ---------------------------------------------------------------------------
// Full measurable survivor-aware rank
// ---------------------------------------------------------------------------

describe('2D-A3 R7: the full survivor-aware measurable rank', () => {
  it('keeps source and survivor positions separate, and applies no cap', () => {
    const labels = 'ABCDEFGHIJKL'.split('');
    const edges = [
      ['A', 'B'],
      ['C', 'D'],
      ['E', 'F'],
    ] as const;
    const result = walk(graphOf(labels, edges), labels);
    expect(result.measurableSurvivors).toHaveLength(9);
    expect(labelsOf(result.measurableSurvivors)).toEqual([
      'A',
      'C',
      'E',
      'G',
      'H',
      'I',
      'J',
      'K',
      'L',
    ]);
    expect(result.measurableSurvivors.map((s) => s.sourceRankPosition)).toEqual([
      0, 2, 4, 6, 7, 8, 9, 10, 11,
    ]);
    expect(result.measurableSurvivors.map((s) => s.survivorRankPosition)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('each survivor carries exactly sample, slot, split, identity and both positions', () => {
    const entry = walk(graphOf(['A']), ['A']).measurableSurvivors[0]!;
    expect(entry).toEqual({
      sample: 'SET_P',
      selectionIndex: 3,
      split: 'DEV_TRAIN',
      documentSha256: sha('A'),
      sourceRankPosition: 0,
      survivorRankPosition: 0,
    });
  });

  it('copies no extra caller field (a salted digest on the order entry is not carried onward)', () => {
    const graph = graphOf(['A', 'B']);
    const order = orderOf(['B', 'A']).map((e) => ({ ...e, saltedRankSha256: 'f'.repeat(64) }));
    const result = prepareSd7SampleSurvivors({ sample: 'SET_P', graph, order });
    for (const s of result.measurableSurvivors) expect(s).not.toHaveProperty('saltedRankSha256');
  });
});

// ---------------------------------------------------------------------------
// Generic sample handling
// ---------------------------------------------------------------------------

describe('2D-A3 R7: one algorithm, one sample per call', () => {
  const graph = graphOf(
    ['A', 'B', 'C'],
    [
      ['A', 'B'],
      ['B', 'C'],
    ],
  );

  it('a synthetic SET_P order and a synthetic SET_R order walk the same way', () => {
    const p = walk(graph, ['A', 'B', 'C'], 'SET_P');
    const r = walk(graph, ['A', 'B', 'C'], 'SET_R');
    expect(p.sample).toBe('SET_P');
    expect(r.sample).toBe('SET_R');
    expect(labelsOf(p.measurableSurvivors)).toEqual(labelsOf(r.measurableSurvivors));
    for (const s of r.measurableSurvivors) expect(s.sample).toBe('SET_R');
  });

  it('two samples over ONE graph may keep different members of one component (PER_SAMPLE)', () => {
    expect(labelsOf(walk(graph, ['B', 'A', 'C'], 'SET_P').measurableSurvivors)).toEqual(['B']);
    expect(labelsOf(walk(graph, ['A', 'B', 'C'], 'SET_R').measurableSurvivors)).toEqual(['A', 'C']);
  });

  it('refuses a mixed-sample order', () => {
    const order = [...orderOf(['A', 'B'], 'SET_P'), ...orderOf(['C'], 'SET_R')].map((e, i) => ({
      ...e,
      rankPosition: i,
    }));
    expect(refusalCode(() => prepareSd7SampleSurvivors({ sample: 'SET_P', graph, order }))).toBe(
      'MIXED_SAMPLE',
    );
  });

  it('refuses an order whose entries disagree with the requested sample', () => {
    expect(
      refusalCode(() =>
        prepareSd7SampleSurvivors({ sample: 'SET_R', graph, order: orderOf(['A', 'B', 'C']) }),
      ),
    ).toBe('MIXED_SAMPLE');
  });

  it('refuses an unknown sample token', () => {
    expect(
      refusalCode(() =>
        prepareSd7SampleSurvivors({
          sample: 'SET_X' as A3Sample,
          graph,
          order: orderOf(['A', 'B', 'C']),
        }),
      ),
    ).toBe('MALFORMED_SAMPLE');
  });
});

// ---------------------------------------------------------------------------
// Prefix stability
// ---------------------------------------------------------------------------

describe('2D-A3 R7: prefix stability of the greedy PROCESS', () => {
  /** The induced sub-graph on a subset of labels, in R6 shape. */
  function induced(
    all: readonly string[],
    edges: readonly (readonly [string, string])[],
    subset: readonly string[],
  ): NearDuplicateGraphMeasurement {
    const within = new Set(subset);
    return graphOf(
      all.filter((l) => within.has(l)),
      edges.filter(([a, b]) => within.has(a) && within.has(b)),
    );
  }

  it('walking the first k order entries keeps exactly the full walk’s survivors among those k', () => {
    const all = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const edges = [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['B', 'E'],
      ['E', 'F'],
      ['F', 'G'],
      ['A', 'G'],
    ] as const;
    const order = ['C', 'A', 'F', 'B', 'D', 'G', 'E'];
    const full = walk(graphOf(all, edges), order);
    for (let k = 0; k <= order.length; k += 1) {
      const prefix = order.slice(0, k);
      const partial = walk(induced(all, edges, prefix), prefix);
      const fullState = full.measurableSurvivors.filter((s) => s.sourceRankPosition < k);
      expect(labelsOf(partial.measurableSurvivors), `k=${k}`).toEqual(labelsOf(fullState));
      expect(
        partial.measurableSurvivors.map((s) => s.survivorRankPosition),
        `k=${k}`,
      ).toEqual(fullState.map((s) => s.survivorRankPosition));
    }
  });

  it('the process prefix is NOT a slice of the survivor output', () => {
    const graph = graphOf(['A', 'B', 'C'], [['A', 'B']]);
    const full = walk(graph, ['A', 'B', 'C']);
    const k = 2;
    const processState = full.measurableSurvivors.filter((s) => s.sourceRankPosition < k);
    expect(labelsOf(processState)).toEqual(['A']);
    expect(labelsOf(full.measurableSurvivors.slice(0, k))).toEqual(['A', 'C']);
  });
});

// ---------------------------------------------------------------------------
// Order completeness
// ---------------------------------------------------------------------------

describe('2D-A3 R7: the order must cover the graph exactly', () => {
  const graph = graphOf(['A', 'B', { label: 's1', measurable: false }], [['A', 'B']]);

  it('accepts the exact cover', () => {
    expect(refusalCode(() => walk(graph, ['s1', 'B', 'A']))).toBe('NO_REFUSAL');
  });

  it('refuses a missing graph document, including a missing short-text document', () => {
    expect(refusalCode(() => walk(graph, ['A', 'B']))).toBe('ORDER_GRAPH_COVERAGE_MISMATCH');
    expect(refusalCode(() => walk(graph, ['A', 's1']))).toBe('ORDER_GRAPH_COVERAGE_MISMATCH');
  });

  it('refuses an unknown extra document', () => {
    expect(refusalCode(() => walk(graph, ['A', 'B', 's1', 'x']))).toBe(
      'ORDER_GRAPH_COVERAGE_MISMATCH',
    );
  });

  it('refuses a duplicated document', () => {
    expect(refusalCode(() => walk(graph, ['A', 'B', 'A']))).toBe('DUPLICATE_ORDER_DOCUMENT');
  });

  it('refuses positions that are not exactly 0..n-1 in array order', () => {
    const shifted = orderOf(['A', 'B', 's1']).map((e) => ({
      ...e,
      rankPosition: e.rankPosition + 1,
    }));
    const swapped = orderOf(['A', 'B', 's1']);
    swapped[0] = { ...swapped[0]!, rankPosition: 1 };
    swapped[1] = { ...swapped[1]!, rankPosition: 0 };
    const fractional = orderOf(['A', 'B', 's1']);
    fractional[2] = { ...fractional[2]!, rankPosition: 2.5 };
    for (const order of [shifted, swapped, fractional]) {
      expect(refusalCode(() => prepareSd7SampleSurvivors({ sample: 'SET_P', graph, order }))).toBe(
        'ORDER_POSITION_MISMATCH',
      );
    }
  });

  it('refuses an order spanning two slots or two splits', () => {
    const slots = [...orderOf(['A', 'B'], 'SET_P', 3), ...orderOf(['s1'], 'SET_P', 4)].map(
      (e, i) => ({ ...e, rankPosition: i }),
    );
    const splits = [
      ...orderOf(['A', 'B'], 'SET_P', 3, 'DEV_TRAIN'),
      ...orderOf(['s1'], 'SET_P', 3, 'DEV_CONFIRM'),
    ].map((e, i) => ({ ...e, rankPosition: i }));
    for (const order of [slots, splits]) {
      expect(refusalCode(() => prepareSd7SampleSurvivors({ sample: 'SET_P', graph, order }))).toBe(
        'MIXED_SLOT_OR_SPLIT',
      );
    }
  });

  it('refuses a malformed entry', () => {
    const bad = orderOf(['A', 'B', 's1']);
    bad[1] = { ...bad[1]!, split: 'NOT_A_SPLIT' as Split };
    expect(
      refusalCode(() => prepareSd7SampleSurvivors({ sample: 'SET_P', graph, order: bad })),
    ).toBe('MALFORMED_ORDER_ENTRY');
    const noSha = orderOf(['A', 'B', 's1']);
    noSha[0] = { ...noSha[0]!, documentSha256: 7 as unknown as A3DocumentSha256 };
    expect(
      refusalCode(() => prepareSd7SampleSurvivors({ sample: 'SET_P', graph, order: noSha })),
    ).toBe('MALFORMED_ORDER_ENTRY');
  });

  it('an empty graph with an empty order is a valid, empty preparation', () => {
    const r = prepareSd7SampleSurvivors({ sample: 'SET_R', graph: graphOf([]), order: [] });
    expect(r.counts.sampleOrderLength).toBe(0);
    expect(r.measurableSurvivors).toEqual([]);
  });

  it('refusal messages carry positions, never a document identity', () => {
    try {
      walk(graph, ['A', 'B', 'A']);
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/^STOP: DUPLICATE_ORDER_DOCUMENT:/);
      expect(message).not.toMatch(/[0-9a-f]{64}/);
    }
  });
});

// ---------------------------------------------------------------------------
// Graph structural integrity
// ---------------------------------------------------------------------------

describe('2D-A3 R7: structurally impossible graphs are refused', () => {
  const base = graphOf(['A', 'B', { label: 's1', measurable: false }, 'C'], [['A', 'B']]);
  const labels = ['A', 'B', 's1', 'C'];
  const run = (graph: NearDuplicateGraphMeasurement) => () => walk(graph, labels);

  it('duplicate document identities', () => {
    const graph = { ...base, documents: [...base.documents.slice(0, 3), base.documents[0]!] };
    expect(
      refusalCode(() =>
        prepareSd7SampleSurvivors({ sample: 'SET_P', graph, order: orderOf(['A', 'B', 's1']) }),
      ),
    ).toBe('DUPLICATE_GRAPH_DOCUMENT');
  });

  it('a measurable index out of range, non-integer, repeated or pointing at short text', () => {
    for (const measurableIndices of [
      [0, 1, 3, 4],
      [0, 1, 1.5],
      [0, 1, -1],
      [0, 1, 3, 1],
    ]) {
      expect(refusalCode(run({ ...base, measurableIndices }))).toBe('MALFORMED_MEASURABLE_INDEX');
    }
    expect(refusalCode(run({ ...base, measurableIndices: [0, 1, 2, 3] }))).toBe(
      'MEASURABLE_INDEX_MISMATCH',
    );
  });

  it('a measurable document missing from measurableIndices', () => {
    expect(
      refusalCode(run({ ...base, measurableIndices: [0, 1], shortTextUnresolvedCount: 2 })),
    ).toBe('MEASURABLE_INDEX_MISMATCH');
  });

  it('a short-text count that disagrees with the documents', () => {
    expect(refusalCode(run({ ...base, shortTextUnresolvedCount: 0 }))).toBe(
      'SHORT_TEXT_COUNT_MISMATCH',
    );
    expect(refusalCode(run({ ...base, shortTextUnresolvedCount: 2 }))).toBe(
      'SHORT_TEXT_COUNT_MISMATCH',
    );
  });

  it('malformed edges: out of range, reversed, self-loop, non-integer, touching short text', () => {
    const m = EDGE_MEASUREMENT;
    for (const edge of [
      { aIndex: 0, bIndex: 9, measurement: m },
      { aIndex: 1, bIndex: 0, measurement: m },
      { aIndex: 1, bIndex: 1, measurement: m },
      { aIndex: 0, bIndex: 1.5, measurement: m },
      { aIndex: 0, bIndex: 2, measurement: m },
    ]) {
      expect(refusalCode(run({ ...base, edges: [edge] }))).toBe('MALFORMED_EDGE');
    }
  });

  it('a duplicate edge', () => {
    expect(refusalCode(run({ ...base, edges: [base.edges[0]!, base.edges[0]!] }))).toBe(
      'DUPLICATE_EDGE',
    );
  });

  it('a document with a non-boolean measurable flag', () => {
    const documents = base.documents.map((d, i) =>
      i === 3 ? { ...d, measurable: 1 as unknown as boolean } : d,
    );
    expect(refusalCode(run({ ...base, documents }))).toBe('MALFORMED_GRAPH_DOCUMENT');
  });

  it('never recomputes or questions an edge: a structurally valid edge is honoured as given', () => {
    // A and C are "far apart" in any text sense we might imagine; R7 does not care.
    const graph = { ...base, edges: [{ aIndex: 0, bIndex: 3, measurement: EDGE_MEASUREMENT }] };
    expect(labelsOf(walk(graph, labels).measurableSurvivors)).toEqual(['A', 'B']);
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('2D-A3 R7: inputs untouched, output frozen', () => {
  it('mutates neither the graph nor the order, and does not freeze them', () => {
    const graph = graphOf(
      ['A', 'B', { label: 's1', measurable: false }, 'C'],
      [
        ['A', 'B'],
        ['B', 'C'],
      ],
    );
    const order = orderOf(['C', 's1', 'B', 'A']);
    const graphBefore = JSON.stringify(graph);
    const orderBefore = JSON.stringify(order);
    prepareSd7SampleSurvivors({ sample: 'SET_P', graph, order });
    expect(JSON.stringify(graph)).toBe(graphBefore);
    expect(JSON.stringify(order)).toBe(orderBefore);
    expect(Object.isFrozen(graph)).toBe(false);
    expect(Object.isFrozen(graph.edges)).toBe(false);
    expect(Object.isFrozen(order)).toBe(false);
    expect(Object.isFrozen(order[0])).toBe(false);
  });

  it('freezes the result, its lists, its counts and every entry', () => {
    const r = walk(graphOf(['A', 'B', { label: 's1', measurable: false }], [['A', 'B']]), [
      'A',
      's1',
      'B',
    ]);
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.counts)).toBe(true);
    for (const list of [
      r.measurableSurvivors,
      r.measurableExclusions,
      r.shortTextUnresolvedInSampleOrder,
    ]) {
      expect(Object.isFrozen(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      for (const entry of list) expect(Object.isFrozen(entry)).toBe(true);
    }
  });

  it('is deterministic: two calls on equal inputs give equal results', () => {
    const graph = graphOf(['A', 'B', 'C'], [['A', 'C']]);
    expect(walk(graph, ['C', 'B', 'A'])).toEqual(walk(graph, ['C', 'B', 'A']));
  });
});

// ---------------------------------------------------------------------------
// R6 integration, synthetic text only
// ---------------------------------------------------------------------------

describe('2D-A3 R7: consumes a graph from the real R6 measureNearDuplicateGraph', () => {
  const words = (prefix: string, count: number): string[] =>
    Array.from({ length: count }, (_, i) => `${prefix}${i}`);
  const baseText = words('alpha', 200).join(' ');
  // B edits A's LAST ten words, C its FIRST ten: each is ~0.903 from A, and
  // B and C are ~0.815 from each other - a non-clique path B ~ A ~ C.
  const nearOne = [...words('alpha', 190), ...words('bomega', 10)].join(' ');
  const nearTwo = [...words('comega', 10), ...words('alpha', 200).slice(10)].join(' ');
  const distinct = words('beta', 200).join(' ');
  const shortText = 'too short';

  const pages = [
    { pageId: 'p1', documentSha256: sha('A'), mainText: baseText },
    { pageId: 'p2', documentSha256: sha('B'), mainText: nearOne },
    { pageId: 'p3', documentSha256: sha('C'), mainText: nearTwo },
    { pageId: 'p4', documentSha256: sha('D'), mainText: distinct },
    { pageId: 'p5', documentSha256: sha('s1'), mainText: shortText },
    { pageId: 'p6', documentSha256: sha('A'), mainText: baseText },
  ];
  const text = new Map<string, string>(pages.map((p) => [p.documentSha256, p.mainText]));
  const exact = exactDuplicatePass(pages);
  const graph = measureNearDuplicateGraph(exact.groups, (s) => text.get(s)!);

  it('the R6 graph has the expected synthetic shape (A~B, A~C, B!~C; s1 short text)', () => {
    expect(exact.distinctDocumentCount).toBe(5);
    expect(graph.documents.map((d) => LABEL_BY_SHA.get(d.documentSha256))).toEqual([
      'A',
      'B',
      'C',
      'D',
      's1',
    ]);
    expect(graph.shortTextUnresolvedCount).toBe(1);
    expect(graph.edges.map((e) => [e.aIndex, e.bIndex])).toEqual([
      [0, 1],
      [0, 2],
    ]);
  });

  it('a sample order different from graph order drives a greedy walk over it', () => {
    const r = walk(graph, ['s1', 'B', 'D', 'A', 'C']);
    expect(labelsOf(r.measurableSurvivors)).toEqual(['B', 'D', 'C']);
    expect(labelsOf(r.measurableExclusions)).toEqual(['A']);
    expect(labelsOf(r.shortTextUnresolvedInSampleOrder)).toEqual(['s1']);
    const other = walk(graph, ['A', 'B', 'C', 'D', 's1'], 'SET_R');
    expect(labelsOf(other.measurableSurvivors)).toEqual(['A', 'D']);
  });
});

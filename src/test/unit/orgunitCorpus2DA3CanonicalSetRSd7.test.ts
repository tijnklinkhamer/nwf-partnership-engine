/**
 * PHASE 2B-2D A3 R12 — THE COMPLETE SET_R RANK BOUND TO THE GREEDY SD7
 * SURVIVOR PREPARATION. BEHAVIOUR.
 *
 * Every identity, score, graph and text here is INVENTED. No real corpus, no
 * sealed file, no database, no network. Every score preparation is GENUINE R10
 * `prepareSetRDocumentScore` output.
 *
 * Scenarios are mostly written in SET_R RANK positions: the inputs are ranked
 * by the real R11 `rankSetRFull` first, and the synthetic graph is then built
 * over those positions - stored in a DIFFERENT (reversed) document order, so
 * any accidental use of graph order shows up as a wrong answer.
 *
 * This file proves `prepareSetRSd7`:
 *
 *   - composes exactly R11 -> R7, driven by the SET_R rank, never graph order
 *     and never input order;
 *   - returns R11's rank and R7's preparation unchanged;
 *   - joins survivors by source position and copies each salted digest from
 *     its R11 entry;
 *   - lets a change of SCORE ORDER change greedy survivor IDENTITY (P3);
 *   - follows R11's salted tie-break on tied scores;
 *   - leaves every short-text document unresolved, with no survivor position;
 *   - returns EVERY measurable survivor - no cap, no readiness;
 *   - is input-permutation invariant, freezes its output, mutates no input;
 *   - lets R11 and R7 refusals pass through, fails closed on a broken
 *     composition invariant, and names no identity in any refusal;
 *   - is bound to the K3 GREEDY procedure, and refuses if it changes.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  K3_OWNER_DECISION,
  K3_SD7_SURVIVOR_PROCEDURE,
  SET_R_MAX_PAGES_PER_ORGANISATION,
  type Split,
} from '../harness/phase2b2d/a3prep/contracts.js';
import { A3RankStop } from '../harness/phase2b2d/a3prep/rank.js';
import {
  prepareSd7SampleSurvivors,
  SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
  type A3Sd7SampleSurvivorPreparation,
} from '../harness/phase2b2d/a3prep/sd7.js';
import {
  A3SetRRankRefusal,
  rankSetRFull,
  type A3SetRRankInput,
} from '../harness/phase2b2d/a3prep/setR.js';
import { prepareSetRDocumentScore } from '../harness/phase2b2d/a3prep/setRScore.js';
import {
  A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS,
  A3SetRSd7CompositionRefusal,
  prepareSetRSd7,
  SET_R_SD7_COMPOSITION_REQUIRES_PROCEDURE,
  type A3SetRSd7CompositionRefusalCode,
  type A3SetRSd7Preparation,
} from '../harness/phase2b2d/a3prep/setRSd7.js';
import type * as Sd7Module from '../harness/phase2b2d/a3prep/sd7.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3PageEvidenceId,
  A3SelectionIndex,
  A3TrackCandidateObservation,
} from '../harness/phase2b2d/a3prep/types.js';
import {
  exactDuplicatePass,
  measureNearDuplicateGraph,
  type NearDuplicateGraphMeasurement,
} from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';

// ---------------------------------------------------------------------------
// Synthetic builders
// ---------------------------------------------------------------------------

const sha = (label: string): A3DocumentSha256 =>
  createHash('sha256')
    .update(`synthetic-a3-r12:${label}`, 'utf8')
    .digest('hex') as A3DocumentSha256;

const pid = (label: string, i = 0): A3PageEvidenceId => `pe-${label}-${i}` as A3PageEvidenceId;

/** The test-side reference for the frozen SET_R tie-break bytes. */
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
  /** Per source page: [Track A, Track B]. Default: one page, [score, far lower]. */
  readonly rowScores?: readonly (readonly [string, string])[];
}

/** One exact document and the R10 preparation genuinely produced for it. */
function entry(label: string, score: string, options: EntryOptions = {}): A3SetRRankInput {
  const rows = options.rowScores ?? [[score, '-9999.9999'] as const];
  const documentSha256 = sha(label);
  const sourceIds = rows.map((_, i) => pid(label, i));
  const document: A3DistinctDocument = {
    selectionIndex: (options.selectionIndex ?? 3) as A3SelectionIndex,
    split: options.split ?? 'DEV_TRAIN',
    documentSha256,
    sourcePageEvidenceIds: sourceIds,
  };
  const scorePreparation = prepareSetRDocumentScore({
    document,
    sourceRows: sourceIds.map((id, i) => ({
      pageEvidenceId: id,
      documentSha256,
      candidateObservations: [
        obs(id, 'INTERNATIONAL_OFFICE', rows[i]![0]),
        obs(id, 'LANGUAGE_CENTRE', rows[i]![1]),
      ],
    })),
  });
  return { document, scorePreparation };
}

const EDGE_MEASUREMENT = Object.freeze({
  intersectionSize: 9,
  unionSize: 10,
  similarity: 0.9,
  atOrAboveThreshold: true,
});

/**
 * A canonical-shaped R6 graph over document SHAs, stored in `order`, with
 * `short` documents unmeasurable and `edges` between measurable documents.
 */
function graphOver(
  order: readonly string[],
  short: ReadonlySet<string>,
  edges: readonly (readonly [string, string])[],
): NearDuplicateGraphMeasurement {
  const indexOf = new Map(order.map((s, i) => [s, i]));
  const documents = order.map((s) => ({
    documentSha256: s,
    tokenCount: short.has(s) ? 2 : 50,
    shingleCount: short.has(s) ? 0 : 46,
    measurable: !short.has(s),
  }));
  const measurableIndices = documents.flatMap((d, i) => (d.measurable ? [i] : []));
  return {
    documents,
    measurableIndices,
    shortTextUnresolvedCount: documents.length - measurableIndices.length,
    comparedPairCount: (measurableIndices.length * (measurableIndices.length - 1)) / 2,
    edges: edges.map(([a, b]) => {
      const x = indexOf.get(a)!;
      const y = indexOf.get(b)!;
      return { aIndex: Math.min(x, y), bIndex: Math.max(x, y), measurement: EDGE_MEASUREMENT };
    }),
  };
}

interface ScenarioSpec {
  /** SET_R rank positions whose documents are SD7_SHORT_TEXT_UNRESOLVED. */
  readonly short?: readonly number[];
  /** Edges between SET_R rank positions (measurable documents only). */
  readonly edges?: readonly (readonly [number, number])[];
  /** Graph document order, as SET_R rank positions. Default: reversed. */
  readonly graphRankOrder?: readonly number[];
}

interface Scenario {
  readonly rankInputs: A3SetRRankInput[];
  readonly graph: NearDuplicateGraphMeasurement;
  readonly shaAtRank: readonly string[];
}

/**
 * n documents with DISTINCT descending scores in input order, so the SET_R
 * rank is input order here; the reversed graph order still disagrees with it.
 */
function scenario(n: number, spec: ScenarioSpec = {}, tag = 'd'): Scenario {
  const rankInputs = Array.from({ length: n }, (_, i) => entry(`${tag}${i}`, String(100 - i)));
  const shaAtRank = rankSetRFull(rankInputs).map((r) => r.documentSha256 as string);
  const graphRankOrder = spec.graphRankOrder ?? Array.from({ length: n }, (_, i) => n - 1 - i);
  const graph = graphOver(
    graphRankOrder.map((r) => shaAtRank[r]!),
    new Set((spec.short ?? []).map((r) => shaAtRank[r]!)),
    (spec.edges ?? []).map(([a, b]) => [shaAtRank[a]!, shaAtRank[b]!] as const),
  );
  return { rankInputs, graph, shaAtRank };
}

function run(s: Scenario): A3SetRSd7Preparation {
  return prepareSetRSd7({ rankInputs: s.rankInputs, graph: s.graph });
}

const survivorSources = (p: A3SetRSd7Preparation): number[] =>
  p.measurableSurvivorAwareFullRank.map((s) => s.sourceRankPosition);

const survivorShas = (p: A3SetRSd7Preparation): string[] =>
  p.measurableSurvivorAwareFullRank.map((s) => s.documentSha256);

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from }, (_, i) => from + i);

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

// ---------------------------------------------------------------------------

describe('2D-A3 R12: K3 binding', () => {
  it('the composition is written for the K3 GREEDY procedure, which the contracts still name', () => {
    expect(SET_R_SD7_COMPOSITION_REQUIRES_PROCEDURE).toBe('GREEDY_SAMPLE_RANK_SURVIVOR_WALK');
    expect(K3_SD7_SURVIVOR_PROCEDURE).toBe(SET_R_SD7_COMPOSITION_REQUIRES_PROCEDURE);
    expect(K3_OWNER_DECISION.survivorProcedure).toBe(SET_R_SD7_COMPOSITION_REQUIRES_PROCEDURE);
    expect(K3_OWNER_DECISION.survivorScope).toBe('SAMPLE_SPECIFIC');
    expect(K3_OWNER_DECISION.atMostOneScope).toBe('PER_SAMPLE');
    expect(K3_OWNER_DECISION.graphScope).toBe('ONE_CANONICAL_GRAPH_PER_ORGANISATION');
    expect(K3_OWNER_DECISION.decisionRecordSha256).toBe(
      '987b88a0848a5020605619f24a9accd73a04e886c80f72ab81608fbade765eab',
    );
  });

  it('walks SET_R, per sample, with the GREEDY procedure', () => {
    const p = run(scenario(3));
    expect(p.kind).toBe(A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS);
    expect(p.kind).toBe('A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS');
    expect(p.sd7Preparation.sample).toBe('SET_R');
    expect(p.sd7Preparation.survivorProcedure).toBe('GREEDY_SAMPLE_RANK_SURVIVOR_WALK');
    expect(p.sd7Preparation.survivorScope).toBe('SAMPLE_SPECIFIC');
    expect(p.measurableSurvivorAwareFullRank.every((s) => s.sample === 'SET_R')).toBe(true);
  });

  it('refuses when the K3 contract names any other procedure', async () => {
    vi.resetModules();
    vi.doMock('../harness/phase2b2d/a3prep/contracts.js', async (importOriginal) => ({
      ...(await importOriginal<object>()),
      K3_SD7_SURVIVOR_PROCEDURE: 'SOME_OTHER_SURVIVOR_PROCEDURE',
    }));
    try {
      const mocked = await import('../harness/phase2b2d/a3prep/setRSd7.js');
      const s = scenario(3);
      expect(() => mocked.prepareSetRSd7({ rankInputs: s.rankInputs, graph: s.graph })).toThrow(
        /^STOP: K3_PROCEDURE_NOT_PROVED:/,
      );
    } finally {
      vi.doUnmock('../harness/phase2b2d/a3prep/contracts.js');
      vi.resetModules();
    }
  });
});

describe('2D-A3 R12: composition R11 -> R7, with both results returned unchanged', () => {
  it('preSd7FullRank is byte-equivalent to a direct R11 call', () => {
    const s = scenario(6, { edges: [[0, 1]], short: [3] });
    const p = run(s);
    expect(JSON.stringify(p.preSd7FullRank)).toBe(JSON.stringify(rankSetRFull(s.rankInputs)));
  });

  it('sd7Preparation is byte-equivalent to a direct R7 call over that R11 rank', () => {
    const s = scenario(7, {
      edges: [
        [0, 2],
        [1, 4],
      ],
      short: [3, 6],
    });
    const direct = prepareSd7SampleSurvivors({
      sample: 'SET_R',
      graph: s.graph,
      order: rankSetRFull(s.rankInputs),
    });
    expect(JSON.stringify(run(s).sd7Preparation)).toBe(JSON.stringify(direct));
  });

  it('adds exactly one field beside them, and nothing capped or ready', () => {
    const p = run(scenario(5));
    expect(Object.keys(p).sort()).toEqual([
      'kind',
      'measurableSurvivorAwareFullRank',
      'preSd7FullRank',
      'sd7Preparation',
    ]);
  });
});

describe('2D-A3 R12: survivor walks over the SET_R rank', () => {
  it('no edges: the survivor-aware rank is the R11 rank', () => {
    const p = run(scenario(9));
    expect(survivorSources(p)).toEqual(range(0, 9));
    expect(survivorShas(p)).toEqual(p.preSd7FullRank.map((d) => d.documentSha256));
    expect(p.sd7Preparation.measurableExclusions).toEqual([]);
  });

  it('one edge excludes the LATER-ranked document', () => {
    const p = run(scenario(5, { edges: [[1, 3]] }));
    expect(survivorSources(p)).toEqual([0, 1, 2, 4]);
    expect(p.sd7Preparation.measurableExclusions.map((e) => e.sourceRankPosition)).toEqual([3]);
  });

  it('a clique keeps only its earliest-ranked member', () => {
    const p = run(
      scenario(5, {
        edges: [
          [1, 2],
          [1, 4],
          [2, 4],
        ],
      }),
    );
    expect(survivorSources(p)).toEqual([0, 1, 3]);
  });

  it('non-transitive P3 over rank positions (r0 - r1 - r2): r0 and r2 survive', () => {
    const p = run(
      scenario(3, {
        edges: [
          [0, 1],
          [1, 2],
        ],
        graphRankOrder: [1, 0, 2],
      }),
    );
    expect(survivorSources(p)).toEqual([0, 2]);
  });

  it('star centred late (r0, r1, r2 - r3): the centre is excluded, every leaf survives', () => {
    const p = run(
      scenario(5, {
        edges: [
          [0, 3],
          [1, 3],
          [2, 3],
        ],
      }),
    );
    expect(survivorSources(p)).toEqual([0, 1, 2, 4]);
  });

  it('P4 (r0 - r1 - r2 - r3): r0 and r2 survive', () => {
    const p = run(
      scenario(4, {
        edges: [
          [0, 1],
          [1, 2],
          [2, 3],
        ],
      }),
    );
    expect(survivorSources(p)).toEqual([0, 2]);
  });

  it('graph document order that disagrees with SET_R rank is ignored', () => {
    const edges = [
      [0, 1],
      [1, 2],
      [3, 4],
    ] as const;
    const outcomes = [
      [0, 1, 2, 3, 4, 5],
      [5, 4, 3, 2, 1, 0],
      [2, 4, 0, 5, 1, 3],
      [1, 3, 5, 0, 2, 4],
    ].map((graphRankOrder) => survivorSources(run(scenario(6, { edges, graphRankOrder }))));
    for (const o of outcomes) expect(o).toEqual([0, 2, 3, 5]);
  });
});

describe('2D-A3 R12: score order changes greedy survivor identity (P3 A - B - C)', () => {
  const edgesByLabel = [
    [sha('A'), sha('B')],
    [sha('B'), sha('C')],
  ] as const;
  const graph = graphOver([sha('C'), sha('A'), sha('B')], new Set(), edgesByLabel);

  it('scores ranking B, A, C keep only B', () => {
    const p = prepareSetRSd7({
      rankInputs: [entry('A', '2'), entry('B', '3'), entry('C', '1')],
      graph,
    });
    expect(p.preSd7FullRank.map((r) => r.documentSha256)).toEqual([sha('B'), sha('A'), sha('C')]);
    expect(survivorShas(p)).toEqual([sha('B')]);
  });

  it('changing ONLY the scores to rank A, B, C keeps A and C', () => {
    const p = prepareSetRSd7({
      rankInputs: [entry('A', '3'), entry('B', '2'), entry('C', '1')],
      graph,
    });
    expect(p.preSd7FullRank.map((r) => r.documentSha256)).toEqual([sha('A'), sha('B'), sha('C')]);
    expect(survivorShas(p)).toEqual([sha('A'), sha('C')]);
  });
});

describe('2D-A3 R12: tied R10 scores follow R11’s salted tie-break into R7', () => {
  const labels = ['t0', 't1', 't2', 't3'];
  const tieOrder = [...labels].sort((a, b) =>
    referenceTieBreak(sha(a)) < referenceTieBreak(sha(b)) ? -1 : 1,
  );

  it('every tied document resolves to the same R10 score', () => {
    const scores = labels.map(
      (l) => entry(l, '7.5').scorePreparation.resolvedScore.resolvedScoreDecimal,
    );
    expect(new Set(scores).size).toBe(1);
  });

  it('the pre-SD7 order is the salted-digest order, whatever the input order', () => {
    for (const perm of permutations(labels)) {
      const p = prepareSetRSd7({
        rankInputs: perm.map((l) => entry(l, '7.5')),
        graph: graphOver(labels.map(sha), new Set(), []),
      });
      expect(p.preSd7FullRank.map((r) => r.documentSha256)).toEqual(tieOrder.map(sha));
    }
  });

  it('an edge between two tied documents keeps the one with the LOWER salted digest', () => {
    const [first, second] = [tieOrder[0]!, tieOrder[1]!];
    const graph = graphOver(labels.map(sha).reverse(), new Set(), [[sha(second), sha(first)]]);
    for (const perm of permutations(labels)) {
      const p = prepareSetRSd7({ rankInputs: perm.map((l) => entry(l, '7.5')), graph });
      expect(survivorShas(p)).toEqual([sha(first), sha(tieOrder[2]!), sha(tieOrder[3]!)]);
      expect(p.sd7Preparation.measurableExclusions.map((e) => e.documentSha256)).toEqual([
        sha(second),
      ]);
    }
  });

  it('the primary score still dominates a tie: a strictly higher score comes first', () => {
    const last = tieOrder[3]!;
    const p = prepareSetRSd7({
      rankInputs: labels.map((l) => entry(l, l === last ? '7.5001' : '7.5')),
      graph: graphOver(labels.map(sha), new Set(), [[sha(last), sha(tieOrder[0]!)]]),
    });
    expect(p.preSd7FullRank[0]!.documentSha256).toBe(sha(last));
    expect(survivorShas(p)).toEqual([sha(last), sha(tieOrder[1]!), sha(tieOrder[2]!)]);
  });
});

describe('2D-A3 R12: genuine R10 -> R11 -> R12 pipeline', () => {
  it('K1 MAX track and K2 MAX source row set the rank that drives the walk', () => {
    // X: rows (1, 5) and (2, 0)          -> MAX over tracks and rows = 5
    // Y: one row (4, 4)                  -> 4
    // Z: rows (-1, 6) and (0.5, 0.5)     -> 6
    // W: one row (-3, -2)                -> -2
    const inputs = [
      entry('X', '', {
        rowScores: [
          ['1', '5'],
          ['2', '0'],
        ],
      }),
      entry('Y', '', { rowScores: [['4', '4']] }),
      entry('Z', '', {
        rowScores: [
          ['-1', '6'],
          ['0.5', '0.5'],
        ],
      }),
      entry('W', '', { rowScores: [['-3', '-2']] }),
    ];
    const graph = graphOver(['W', 'Y', 'X', 'Z'].map(sha), new Set(), [
      [sha('Z'), sha('X')],
      [sha('X'), sha('W')],
    ]);
    const p = prepareSetRSd7({ rankInputs: inputs, graph });
    expect(p.preSd7FullRank.map((r) => r.documentSha256)).toEqual(['Z', 'X', 'Y', 'W'].map(sha));
    // Z kept; X excluded by Z; Y kept; W survives because its only neighbour X was never kept.
    expect(survivorShas(p)).toEqual(['Z', 'Y', 'W'].map(sha));
    expect(survivorSources(p)).toEqual([0, 2, 3]);
    expect(p.sd7Preparation.measurableExclusions).toEqual([
      expect.objectContaining({
        documentSha256: sha('X'),
        sourceRankPosition: 1,
        blockingSurvivorRankPosition: 0,
      }),
    ]);
  });

  it('composes over a graph from the real R6 measureNearDuplicateGraph', () => {
    const words = (prefix: string, count: number): string[] =>
      Array.from({ length: count }, (_, i) => `${prefix}${i}`);
    const labels = range(0, 6).map((i) => `real${i}`);
    const inputs = labels.map((l, i) => entry(l, String(10 - i)));
    // Rank 2 near-duplicates rank 0 (last ten words edited); rank 4 is short.
    const texts = new Map<string, string>(
      labels.map((l, i) => [
        sha(l),
        i === 2
          ? [...words('wreal0-', 190), ...words('edit', 10)].join(' ')
          : i === 4
            ? 'too short'
            : words(`w${l}-`, 200).join(' '),
      ]),
    );
    const pages = labels.map((l) => ({
      pageId: `pe-${l}`,
      documentSha256: sha(l),
      mainText: texts.get(sha(l))!,
    }));
    const graph = measureNearDuplicateGraph(exactDuplicatePass(pages).groups, (x) => texts.get(x)!);
    expect(graph.edges.length).toBe(1);
    expect(graph.shortTextUnresolvedCount).toBe(1);

    const p = prepareSetRSd7({ rankInputs: inputs, graph });
    expect(survivorSources(p)).toEqual([0, 1, 3, 5]);
    expect(p.sd7Preparation.measurableExclusions.map((e) => e.sourceRankPosition)).toEqual([2]);
    expect(
      p.sd7Preparation.shortTextUnresolvedInSampleOrder.map((u) => u.sourceRankPosition),
    ).toEqual([4]);
  });
});

describe('2D-A3 R12: survivor join by source position, digest copied from R11', () => {
  const s = scenario(10, {
    edges: [
      [0, 3],
      [2, 5],
      [5, 8],
    ],
    short: [1, 6],
  });
  const p = run(s);

  it('every survivor’s identity and salted digest are R11’s entry at its source position', () => {
    for (const survivor of p.measurableSurvivorAwareFullRank) {
      const ranked = p.preSd7FullRank[survivor.sourceRankPosition]!;
      expect(ranked.rankPosition).toBe(survivor.sourceRankPosition);
      expect(survivor.documentSha256).toBe(ranked.documentSha256);
      expect(survivor.selectionIndex).toBe(ranked.selectionIndex);
      expect(survivor.split).toBe(ranked.split);
      expect(survivor.saltedRankSha256).toBe(ranked.saltedRankSha256);
      expect(survivor.saltedRankSha256).toBe(referenceTieBreak(survivor.documentSha256));
    }
  });

  it('survivorRankPosition is contiguous; sourceRankPosition skips exclusions and short text', () => {
    expect(p.measurableSurvivorAwareFullRank.map((d) => d.survivorRankPosition)).toEqual(
      range(0, p.measurableSurvivorAwareFullRank.length),
    );
    expect(survivorSources(p)).toEqual([0, 2, 4, 7, 8, 9]);
  });

  it('carries exactly the named fields, no bare rankPosition and no score provenance', () => {
    for (const survivor of p.measurableSurvivorAwareFullRank) {
      expect(Object.keys(survivor).sort()).toEqual([
        'documentSha256',
        'saltedRankSha256',
        'sample',
        'selectionIndex',
        'sourceRankPosition',
        'split',
        'survivorRankPosition',
      ]);
    }
    const text = JSON.stringify(p.measurableSurvivorAwareFullRank);
    expect(text).not.toMatch(
      /rankPosition"|resolvedScore|sourcePageEvidenceIds|sourceRowScores|trackScores|DecisionRecordSha256|pe-/,
    );
  });

  it('carries the slot and split of the inputs', () => {
    const inputs = [0, 1, 2].map((i) =>
      entry(`hold${i}`, String(5 - i), { selectionIndex: 41, split: 'FINAL_HOLDOUT' }),
    );
    const q = prepareSetRSd7({
      rankInputs: inputs,
      graph: graphOver(['hold2', 'hold0', 'hold1'].map(sha), new Set(), []),
    });
    for (const d of q.measurableSurvivorAwareFullRank) {
      expect(d.selectionIndex).toBe(41);
      expect(d.split).toBe('FINAL_HOLDOUT');
    }
  });
});

describe('2D-A3 R12: short text stays unresolved', () => {
  const unresolvedSources = (p: A3SetRSd7Preparation): number[] =>
    p.sd7Preparation.shortTextUnresolvedInSampleOrder.map((u) => u.sourceRankPosition);

  it('short text BEFORE every measurable document gets no survivor position', () => {
    const s = scenario(5, { short: [0] });
    const p = run(s);
    expect(unresolvedSources(p)).toEqual([0]);
    expect(survivorSources(p)).toEqual([1, 2, 3, 4]);
    expect(survivorShas(p)).not.toContain(s.shaAtRank[0]);
    expect(p.sd7Preparation.shortTextUnresolvedInSampleOrder[0]).toMatchObject({
      sample: 'SET_R',
      unresolvedOrdinal: 0,
      openIssue: SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
    });
  });

  it('short text in the MIDDLE leaves survivors at their original R11 positions', () => {
    const p = run(scenario(6, { short: [2], edges: [[0, 4]] }));
    expect(unresolvedSources(p)).toEqual([2]);
    expect(survivorSources(p)).toEqual([0, 1, 3, 5]);
    expect(p.measurableSurvivorAwareFullRank.map((d) => d.survivorRankPosition)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('short text at the END is still unresolved', () => {
    const p = run(scenario(5, { short: [4] }));
    expect(unresolvedSources(p)).toEqual([4]);
    expect(survivorSources(p)).toEqual([0, 1, 2, 3]);
  });

  it('several short-text documents keep R7’s ordinals and source order', () => {
    const p = run(scenario(9, { short: [7, 1, 4, 8] }));
    expect(
      p.sd7Preparation.shortTextUnresolvedInSampleOrder.map((u) => u.unresolvedOrdinal),
    ).toEqual([0, 1, 2, 3]);
    expect(unresolvedSources(p)).toEqual([1, 4, 7, 8]);
    expect(survivorSources(p)).toEqual([0, 2, 3, 5, 6]);
    expect(p.sd7Preparation.counts.shortTextUnresolvedCount).toBe(4);
  });

  it('no short-text document is placed, excluded or given any membership field', () => {
    const p = run(scenario(6, { short: [1, 3] }));
    const shortShas = new Set(
      p.sd7Preparation.shortTextUnresolvedInSampleOrder.map((u) => u.documentSha256),
    );
    for (const d of p.measurableSurvivorAwareFullRank)
      expect(shortShas.has(d.documentSha256)).toBe(false);
    for (const e of p.sd7Preparation.measurableExclusions)
      expect(shortShas.has(e.documentSha256)).toBe(false);
    for (const u of p.sd7Preparation.shortTextUnresolvedInSampleOrder) {
      expect(Object.keys(u)).not.toContain('survivorRankPosition');
      expect(Object.keys(u).join(' ')).not.toMatch(/member|kept|included|excluded/i);
    }
  });
});

describe('2D-A3 R12: the full measurable survivor-aware rank - no cap, no readiness', () => {
  it('ten measurable survivors come back as ten, past SET_R’s cap of 4', () => {
    expect(SET_R_MAX_PAGES_PER_ORGANISATION).toBe(4);
    const p = run(scenario(10));
    expect(p.measurableSurvivorAwareFullRank).toHaveLength(10);
    expect(p.preSd7FullRank).toHaveLength(10);
  });

  it('with exclusions and short text, every measurable survivor is still returned', () => {
    const p = run(scenario(14, { edges: [[0, 1]], short: [2, 3] }));
    expect(p.measurableSurvivorAwareFullRank).toHaveLength(11);
    expect(p.sd7Preparation.counts.measurableSurvivorCount).toBe(11);
  });

  it('carries no cap, selection, readiness, SD9 or freeze field anywhere', () => {
    const p = run(scenario(9, { short: [5] }));
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (typeof value === 'object' && value !== null) {
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          walk(v);
        }
      }
    };
    walk(p);
    for (const key of keys) {
      expect(key).not.toMatch(
        /^(documentCap|cap|cappedDocuments|selectedDocuments|documents)$|readiness|ready|freeze|extension|sd9|status$/i,
      );
    }
  });

  it('at compile time, the preparation has no cap or readiness property', () => {
    type Keys = keyof A3SetRSd7Preparation;
    const forbidden: Extract<
      Keys,
      | 'documentCap'
      | 'cap'
      | 'cappedDocuments'
      | 'selectedDocuments'
      | 'initialCapReadiness'
      | 'fullRankReadiness'
      | 'freezeReady'
      | 'extensionBoundary'
    >[] = [];
    expect(forbidden).toEqual([]);
  });
});

describe('2D-A3 R12: input-order invariance', () => {
  it('every permutation of rankInputs is byte-identical', () => {
    const s = scenario(5, {
      edges: [
        [0, 2],
        [2, 4],
      ],
      short: [3],
    });
    const expected = JSON.stringify(run(s));
    for (const perm of permutations(s.rankInputs)) {
      expect(JSON.stringify(prepareSetRSd7({ rankInputs: perm, graph: s.graph }))).toBe(expected);
    }
  });

  it('a consistently rebuilt graph in any document order is byte-identical too', () => {
    const edges = [
      [0, 2],
      [2, 4],
    ] as const;
    const base = scenario(5, { edges, short: [3], graphRankOrder: [0, 1, 2, 3, 4] });
    const expected = JSON.stringify(run(base));
    for (const graphRankOrder of permutations([0, 1, 2, 3, 4])) {
      const s = scenario(5, { edges, short: [3], graphRankOrder });
      for (const perm of [s.rankInputs, [...s.rankInputs].reverse()]) {
        expect(JSON.stringify(prepareSetRSd7({ rankInputs: perm, graph: s.graph }))).toBe(expected);
      }
    }
  });
});

describe('2D-A3 R12: empty input', () => {
  it('an empty rank over an empty graph is an empty preparation, not a failure', () => {
    const p = prepareSetRSd7({
      rankInputs: [],
      graph: graphOver([], new Set(), []),
    });
    expect(p.preSd7FullRank).toEqual([]);
    expect(p.measurableSurvivorAwareFullRank).toEqual([]);
    expect(p.sd7Preparation.measurableSurvivors).toEqual([]);
    expect(p.sd7Preparation.shortTextUnresolvedInSampleOrder).toEqual([]);
    expect(p.sd7Preparation.counts.sampleOrderLength).toBe(0);
  });
});

describe('2D-A3 R12: immutability', () => {
  it('freezes the preparation and the survivor-aware rank and its entries', () => {
    const p = run(scenario(4, { edges: [[0, 1]] }));
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.preSd7FullRank)).toBe(true);
    expect(Object.isFrozen(p.sd7Preparation)).toBe(true);
    expect(Object.isFrozen(p.measurableSurvivorAwareFullRank)).toBe(true);
    for (const d of p.measurableSurvivorAwareFullRank) expect(Object.isFrozen(d)).toBe(true);
  });

  it('mutates neither the rank inputs nor the graph', () => {
    const s = scenario(6, { edges: [[1, 2]], short: [4] });
    const before = JSON.stringify({ rankInputs: s.rankInputs, graph: s.graph });
    const inputsRef = [...s.rankInputs];
    run(s);
    expect(JSON.stringify({ rankInputs: s.rankInputs, graph: s.graph })).toBe(before);
    s.rankInputs.forEach((e, i) => expect(e).toBe(inputsRef[i]));
  });
});

describe('2D-A3 R12: R11 and R7 refusals pass through unchanged', () => {
  it('an R11 binding refusal (K1 hash mismatch) passes through as R11’s own', () => {
    const s = scenario(3);
    const tampered = {
      document: s.rankInputs[1]!.document,
      scorePreparation: {
        ...s.rankInputs[1]!.scorePreparation,
        resolvedScore: {
          ...s.rankInputs[1]!.scorePreparation.resolvedScore,
          k1TrackReductionDecisionRecordSha256: '0'.repeat(64),
        },
      },
    } as A3SetRRankInput;
    const attempt = () =>
      prepareSetRSd7({
        rankInputs: [s.rankInputs[0]!, tampered, s.rankInputs[2]!],
        graph: s.graph,
      });
    expect(attempt).toThrow(A3SetRRankRefusal);
    expect(attempt).toThrow(/^SET_R rank refused: K1_DECISION_BINDING_MISMATCH/);
  });

  it('an R2 rank-helper refusal (repeated identity) passes through as A3RankStop', () => {
    const s = scenario(3);
    const attempt = () =>
      prepareSetRSd7({ rankInputs: [...s.rankInputs, s.rankInputs[0]!], graph: s.graph });
    expect(attempt).toThrow(A3RankStop);
  });

  it('an R7 refusal (rank and graph disagree) passes through unchanged', () => {
    const s = scenario(4);
    const other = scenario(4, {}, 'e');
    expect(() => prepareSetRSd7({ rankInputs: s.rankInputs, graph: other.graph })).toThrow(
      /^STOP: ORDER_GRAPH_COVERAGE_MISMATCH:/,
    );
    const fewer = scenario(3);
    expect(() => prepareSetRSd7({ rankInputs: fewer.rankInputs, graph: s.graph })).toThrow(
      /^STOP: ORDER_GRAPH_COVERAGE_MISMATCH:/,
    );
  });
});

describe('2D-A3 R12: composition invariants fail closed, naming no identity', () => {
  /** Run R12 against an R7 whose output is tampered after the genuine walk. */
  async function withTamperedSd7(
    tamper: (p: A3Sd7SampleSurvivorPreparation) => A3Sd7SampleSurvivorPreparation,
  ): Promise<A3SetRSd7CompositionRefusal> {
    vi.resetModules();
    vi.doMock('../harness/phase2b2d/a3prep/sd7.js', async (importOriginal) => {
      const original = await importOriginal<typeof Sd7Module>();
      return {
        ...original,
        prepareSd7SampleSurvivors: (
          input: Parameters<typeof original.prepareSd7SampleSurvivors>[0],
        ) => tamper(original.prepareSd7SampleSurvivors(input)),
      };
    });
    try {
      const mocked = await import('../harness/phase2b2d/a3prep/setRSd7.js');
      const s = scenario(5, { edges: [[0, 1]], short: [2, 4] });
      try {
        mocked.prepareSetRSd7({ rankInputs: s.rankInputs, graph: s.graph });
      } catch (error) {
        expect((error as Error).name).toBe('A3SetRSd7CompositionRefusal');
        expect((error as Error).message).not.toMatch(/[0-9a-f]{64}/);
        return error as A3SetRSd7CompositionRefusal;
      }
      throw new Error('expected a composition refusal');
    } finally {
      vi.doUnmock('../harness/phase2b2d/a3prep/sd7.js');
      vi.resetModules();
    }
  }

  const cases: readonly [
    A3SetRSd7CompositionRefusalCode,
    (p: A3Sd7SampleSurvivorPreparation) => A3Sd7SampleSurvivorPreparation,
  ][] = [
    ['K3_PROCEDURE_NOT_PROVED', (p) => ({ ...p, survivorProcedure: 'OTHER' as never })],
    [
      'SURVIVOR_SAMPLE_MISMATCH',
      (p) => ({
        ...p,
        measurableSurvivors: p.measurableSurvivors.map((x, i) =>
          i === 1 ? { ...x, sample: 'SET_P' as const } : x,
        ),
      }),
    ],
    [
      'SURVIVOR_POSITION_NOT_CONTIGUOUS',
      (p) => ({
        ...p,
        measurableSurvivors: p.measurableSurvivors.map((x, i) =>
          i === 1 ? { ...x, survivorRankPosition: 2 } : x,
        ),
      }),
    ],
    [
      'SOURCE_POSITION_OUT_OF_RANGE',
      (p) => ({
        ...p,
        measurableSurvivors: p.measurableSurvivors.map((x, i) =>
          i === 1 ? { ...x, sourceRankPosition: 99 } : x,
        ),
      }),
    ],
    [
      'SOURCE_POSITION_OUT_OF_RANGE',
      (p) => ({
        ...p,
        measurableSurvivors: p.measurableSurvivors.map((x, i) =>
          i === 1 ? { ...x, sourceRankPosition: 1.5 } : x,
        ),
      }),
    ],
    [
      'SOURCE_IDENTITY_MISMATCH',
      (p) => ({
        ...p,
        measurableSurvivors: p.measurableSurvivors.map((x, i) =>
          i === 1 ? { ...x, sourceRankPosition: 1 } : x,
        ),
      }),
    ],
    [
      'SHORT_TEXT_ORDER_MISMATCH',
      (p) => ({
        ...p,
        shortTextUnresolvedInSampleOrder: [...p.shortTextUnresolvedInSampleOrder].reverse(),
      }),
    ],
    [
      'SOURCE_IDENTITY_MISMATCH',
      (p) => ({
        ...p,
        shortTextUnresolvedInSampleOrder: p.shortTextUnresolvedInSampleOrder.map((x, i) =>
          i === 0 ? { ...x, sourceRankPosition: 3 } : x,
        ),
      }),
    ],
  ];

  for (const [code, tamper] of cases) {
    it(`refuses ${code}`, async () => {
      const refusal = await withTamperedSd7(tamper);
      expect(refusal.code).toBe(code);
      expect(refusal.message).toMatch(new RegExp(`^STOP: ${code}:`));
    });
  }

  it('no pass-through refusal message carries a document identity either', () => {
    const s = scenario(4);
    const other = scenario(4, {}, 'e');
    for (const attempt of [
      () => prepareSetRSd7({ rankInputs: s.rankInputs, graph: other.graph }),
      () => prepareSetRSd7({ rankInputs: [...s.rankInputs, s.rankInputs[1]!], graph: s.graph }),
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
    const e = new A3SetRSd7CompositionRefusal('SOURCE_IDENTITY_MISMATCH', 'x.');
    expect(e.message).toBe('STOP: SOURCE_IDENTITY_MISMATCH: x.');
    expect(e.code).toBe('SOURCE_IDENTITY_MISMATCH');
    expect(e.name).toBe('A3SetRSd7CompositionRefusal');
  });
});

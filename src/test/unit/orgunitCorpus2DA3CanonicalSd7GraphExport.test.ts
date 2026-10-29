/**
 * PHASE 2B-2D A3 R6 — THE CANONICAL SD7 GRAPH EXPORT, AND PROOF THAT
 * `nearDuplicatePass` DID NOT MOVE.
 *
 * R6 split the pair-measurement phase of `nearDuplicatePass` out into
 * `measureNearDuplicateGraph`. `nearDuplicatePass` produced the A3a and
 * Option-B SD7 measurements of record, so this file does two things:
 *
 *   1. pins the new lower-level graph export against known structural
 *      outputs, and
 *   2. pins the observable `nearDuplicatePass` result over the same fixture
 *      families, with every expected value copied from the PRE-R6 baseline
 *      (the canonical module at blob d0591c3a, before any edit).
 *
 * It reimplements no normalisation, shingling, Jaccard or component audit.
 * Every expected value is a hard-coded literal.
 *
 * No test here contains real page content. The fixtures are invented tokens
 * (`w1 w2 ...`) about nothing.
 */
import { describe, expect, it } from 'vitest';
import { Sd7PilotStop } from '../harness/phase2b2d/sd7/sd7Contract.js';
import {
  exactDuplicatePass,
  measureNearDuplicateGraph,
  nearDuplicatePass,
  type ComponentAudit,
  type ExactDuplicateGroup,
  type NearDuplicateGraphMeasurement,
  type NearDuplicatePass,
  type PageForSd7,
} from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';

// ---------------------------------------------------------------------------
// Invented fixtures. The same families as the temporary pre/post-R6 baseline.
// ---------------------------------------------------------------------------

function page(pageId: string, documentSha256: string, mainText: string): PageForSd7 {
  return { pageId, documentSha256, mainText };
}

/** `count` distinct invented tokens starting at `w<from>`. */
function filler(from: number, count: number): string {
  return Array.from({ length: count }, (_, index) => `w${from + index}`).join(' ');
}

const STREAM = filler(1, 400).split(' ');

/**
 * A sliding window over one invented stream. Two windows of `length` tokens
 * shifted by `s` share `length - 4 - s` of their `length - 4` shingles, so
 * their Jaccard is `(n - s) / (n + s)` with `n = length - 4` - arithmetic,
 * not hope.
 */
function window(from: number, length: number): string {
  return STREAM.slice(from, from + length).join(' ');
}

const FIXTURES = {
  empty: [] as PageForSd7[],
  oneMeasurable: [page('a', 'sha-a', filler(1, 60))],
  isolatedThree: [
    page('a', 'sha-a', filler(1, 60)),
    page('b', 'sha-b', filler(100, 60)),
    page('c', 'sha-c', filler(200, 60)),
  ],
  oneExactGroup: [
    page('a1', 'sha-a', filler(1, 60)),
    page('a2', 'sha-a', filler(1, 60)),
    page('a3', 'sha-a', filler(1, 60)),
    page('b', 'sha-b', filler(100, 60)),
  ],
  multipleExactGroups: [
    page('a1', 'sha-a', filler(1, 60)),
    page('b1', 'sha-b', filler(100, 60)),
    page('a2', 'sha-a', filler(1, 60)),
    page('b2', 'sha-b', filler(100, 60)),
    page('c', 'sha-c', filler(200, 60)),
    page('b3', 'sha-b', filler(100, 60)),
  ],
  simpleEdge: [
    page('a', 'sha-a', filler(1, 200)),
    page('b', 'sha-b', `${filler(1, 200)} ${filler(1000, 2)}`),
  ],
  cliqueThree: [
    page('a', 'sha-a', filler(1, 400)),
    page('b', 'sha-b', `${filler(1, 400)} ${filler(1000, 2)}`),
    page('c', 'sha-c', `${filler(1, 400)} ${filler(2000, 3)}`),
  ],
  /** a ~ b ~ c with a !~ c: 95/105 twice, 90/110 once. */
  pathAbc: [
    page('a', 'sha-a', window(0, 104)),
    page('b', 'sha-b', window(5, 104)),
    page('c', 'sha-c', window(10, 104)),
  ],
  pathBac: [
    page('b', 'sha-b', window(5, 104)),
    page('a', 'sha-a', window(0, 104)),
    page('c', 'sha-c', window(10, 104)),
  ],
  pathCba: [
    page('c', 'sha-c', window(10, 104)),
    page('b', 'sha-b', window(5, 104)),
    page('a', 'sha-a', window(0, 104)),
  ],
  pathAcb: [
    page('a', 'sha-a', window(0, 104)),
    page('c', 'sha-c', window(10, 104)),
    page('b', 'sha-b', window(5, 104)),
  ],
  disconnected: [
    page('a', 'sha-a', filler(1, 200)),
    page('x', 'sha-x', filler(5000, 60)),
    page('b', 'sha-b', `${filler(1, 200)} ${filler(1000, 2)}`),
    page('c', 'sha-c', window(0, 104).replace(/w/g, 'v')),
    page('d', 'sha-d', window(5, 104).replace(/w/g, 'v')),
    page('e', 'sha-e', window(10, 104).replace(/w/g, 'v')),
    page('y', 'sha-y', filler(6000, 60)),
  ],
  measurablePlusShort: [
    page('a', 'sha-a', filler(1, 60)),
    page('s1', 'sha-s1', 'too short'),
    page('b', 'sha-b', filler(100, 60)),
    page('s2', 'sha-s2', ''),
    page('s3', 'sha-s3', 'w1 w2 w3 w4'),
    page('c', 'sha-c', `${filler(100, 60)} w9999`),
  ],
  allShort: [
    page('s1', 'sha-s1', 'short'),
    page('s2', 'sha-s2', ''),
    page('s3', 'sha-s3', 'a b c d'),
  ],
  /** 95 shingles each, shift 6: 89/101, just below 0.90. */
  belowThreshold: [page('a', 'sha-a', window(0, 99)), page('b', 'sha-b', window(6, 99))],
  /** 95 shingles each, shift 5: EXACTLY 90/100. */
  exactThreshold: [page('a', 'sha-a', window(0, 99)), page('b', 'sha-b', window(5, 99))],
  caseAndWhitespace: [
    page('a', 'sha-a', filler(1, 60)),
    page('b', 'sha-b', `  ${filler(1, 60).toUpperCase().replace(/ /g, '\n\t ')}  `),
  ],
  auditableClique20: Array.from({ length: 20 }, (_, i) =>
    page(`u${i}`, `sha-u${String(i).padStart(2, '0')}`, filler(1, 60)),
  ),
  unauditableClique21: Array.from({ length: 21 }, (_, i) =>
    page(`u${i}`, `sha-u${String(i).padStart(2, '0')}`, filler(1, 60)),
  ),
  starPlusIsolated: [
    page('hub', 'sha-hub', window(0, 104)),
    page('l1', 'sha-l1', window(5, 104)),
    page('x', 'sha-x', filler(7000, 60)),
  ],
} as const satisfies Record<string, readonly PageForSd7[]>;

type FixtureName = keyof typeof FIXTURES;

/** Runs the real exact pass first, as `pilotAnalysis.ts` does. */
function prepared(pages: readonly PageForSd7[]): {
  readonly groups: readonly ExactDuplicateGroup[];
  readonly textOf: (hash: string) => string;
} {
  const texts = new Map(pages.map((p) => [p.documentSha256, p.mainText]));
  return { groups: exactDuplicatePass(pages).groups, textOf: (hash) => texts.get(hash)! };
}

function graphOf(name: FixtureName): NearDuplicateGraphMeasurement {
  const { groups, textOf } = prepared(FIXTURES[name]);
  return measureNearDuplicateGraph(groups, textOf);
}

function passOf(name: FixtureName): NearDuplicatePass {
  const { groups, textOf } = prepared(FIXTURES[name]);
  return nearDuplicatePass(groups, textOf);
}

const ALL_FIXTURES = Object.keys(FIXTURES) as FixtureName[];

// ---------------------------------------------------------------------------
// 1. The graph export
// ---------------------------------------------------------------------------

describe('2D-A3 R6: the graph export carries exactly the pre-audit measurement', () => {
  it('returns exactly the five R6 fields', () => {
    expect(Object.keys(graphOf('pathAbc'))).toEqual([
      'documents',
      'measurableIndices',
      'shortTextUnresolvedCount',
      'comparedPairCount',
      'edges',
    ]);
  });

  it('pins a non-transitive path: documents, indices, pair count and edges', () => {
    expect(graphOf('pathAbc')).toEqual({
      documents: [
        { documentSha256: 'sha-a', tokenCount: 104, shingleCount: 100, measurable: true },
        { documentSha256: 'sha-b', tokenCount: 104, shingleCount: 100, measurable: true },
        { documentSha256: 'sha-c', tokenCount: 104, shingleCount: 100, measurable: true },
      ],
      measurableIndices: [0, 1, 2],
      shortTextUnresolvedCount: 0,
      comparedPairCount: 3,
      edges: [
        {
          aIndex: 0,
          bIndex: 1,
          measurement: {
            intersectionSize: 95,
            unionSize: 105,
            similarity: 95 / 105,
            atOrAboveThreshold: true,
          },
        },
        {
          aIndex: 1,
          bIndex: 2,
          measurement: {
            intersectionSize: 95,
            unionSize: 105,
            similarity: 95 / 105,
            atOrAboveThreshold: true,
          },
        },
      ],
    });
  });

  it('pins a measurable + short-text mixture, with short documents kept in place', () => {
    expect(graphOf('measurablePlusShort')).toEqual({
      documents: [
        { documentSha256: 'sha-a', tokenCount: 60, shingleCount: 56, measurable: true },
        { documentSha256: 'sha-s1', tokenCount: 2, shingleCount: 0, measurable: false },
        { documentSha256: 'sha-b', tokenCount: 60, shingleCount: 56, measurable: true },
        { documentSha256: 'sha-s2', tokenCount: 0, shingleCount: 0, measurable: false },
        { documentSha256: 'sha-s3', tokenCount: 4, shingleCount: 0, measurable: false },
        { documentSha256: 'sha-c', tokenCount: 61, shingleCount: 57, measurable: true },
      ],
      measurableIndices: [0, 2, 5],
      shortTextUnresolvedCount: 3,
      comparedPairCount: 3,
      edges: [
        {
          aIndex: 2,
          bIndex: 5,
          measurement: {
            intersectionSize: 56,
            unionSize: 57,
            similarity: 56 / 57,
            atOrAboveThreshold: true,
          },
        },
      ],
    });
  });

  it('pins the empty organisation', () => {
    expect(graphOf('empty')).toEqual({
      documents: [],
      measurableIndices: [],
      shortTextUnresolvedCount: 0,
      comparedPairCount: 0,
      edges: [],
    });
  });

  it('compares every measurable pair exactly once: n(n-1)/2', () => {
    expect(graphOf('isolatedThree').comparedPairCount).toBe(3);
    expect(graphOf('disconnected').comparedPairCount).toBe(21);
    expect(graphOf('auditableClique20').comparedPairCount).toBe(190);
    expect(graphOf('unauditableClique21').comparedPairCount).toBe(210);
    for (const name of ALL_FIXTURES) {
      const graph = graphOf(name);
      const pairs = graph.edges.map((e) => `${e.aIndex}:${e.bIndex}`);
      expect(new Set(pairs).size, name).toBe(pairs.length);
    }
  });
});

describe('2D-A3 R6: edge indices refer to the exported documents array', () => {
  it('resolves every edge endpoint to a measurable exported document', () => {
    const graph = graphOf('measurablePlusShort');
    const [edge] = graph.edges;
    expect(graph.documents[edge!.aIndex]!.documentSha256).toBe('sha-b');
    expect(graph.documents[edge!.bIndex]!.documentSha256).toBe('sha-c');
    for (const name of ALL_FIXTURES) {
      const g = graphOf(name);
      for (const e of g.edges) {
        expect(e.aIndex, name).toBeLessThan(e.bIndex);
        expect(g.measurableIndices, name).toContain(e.aIndex);
        expect(g.measurableIndices, name).toContain(e.bIndex);
        expect(g.documents[e.aIndex]!.measurable, name).toBe(true);
        expect(g.documents[e.bIndex]!.measurable, name).toBe(true);
      }
    }
  });

  it('measurableIndices are exactly the measurable documents, ascending', () => {
    for (const name of ALL_FIXTURES) {
      const g = graphOf(name);
      const expected = g.documents.flatMap((d, i) => (d.measurable ? [i] : []));
      expect(g.measurableIndices, name).toEqual(expected);
    }
  });
});

describe('2D-A3 R6: the frozen 0.90 threshold, at the graph level', () => {
  it('emits no edge for a pair just below it, but still counts the comparison', () => {
    const graph = graphOf('belowThreshold');
    expect(graph.comparedPairCount).toBe(1);
    expect(graph.edges).toEqual([]);
  });

  it('emits an edge for a pair EXACTLY on it', () => {
    expect(graphOf('exactThreshold').edges).toEqual([
      {
        aIndex: 0,
        bIndex: 1,
        measurement: {
          intersectionSize: 90,
          unionSize: 100,
          similarity: 0.9,
          atOrAboveThreshold: true,
        },
      },
    ]);
  });

  it('emits an edge for a pair above it', () => {
    const [edge] = graphOf('simpleEdge').edges;
    expect(edge!.measurement.intersectionSize).toBe(196);
    expect(edge!.measurement.unionSize).toBe(198);
    expect(edge!.measurement.atOrAboveThreshold).toBe(true);
  });

  it('never emits an edge whose measurement is below the threshold', () => {
    for (const name of ALL_FIXTURES) {
      for (const e of graphOf(name).edges) {
        expect(e.measurement.atOrAboveThreshold, name).toBe(true);
      }
    }
  });

  it('applies the existing case and whitespace normalisation', () => {
    expect(graphOf('caseAndWhitespace').edges).toHaveLength(1);
    expect(graphOf('caseAndWhitespace').edges[0]!.measurement.similarity).toBe(1);
  });
});

describe('2D-A3 R6: short text is never compared', () => {
  it('forms no edge and no comparison involving an unmeasurable document', () => {
    const graph = graphOf('allShort');
    expect(graph.measurableIndices).toEqual([]);
    expect(graph.shortTextUnresolvedCount).toBe(3);
    expect(graph.comparedPairCount).toBe(0);
    expect(graph.edges).toEqual([]);
  });

  it('does not reach Jaccard(empty, empty) for two identical short texts', () => {
    const graph = measureNearDuplicateGraph(
      [
        { documentSha256: 'sha-s1', pageIds: ['s1'], extractedTextDiverged: false },
        { documentSha256: 'sha-s2', pageIds: ['s2'], extractedTextDiverged: false },
      ],
      () => 'a b c',
    );
    expect(graph.comparedPairCount).toBe(0);
    expect(graph.edges).toEqual([]);
  });
});

describe('2D-A3 R6: exact duplicates are collapsed before the graph sees them', () => {
  it('turns repeated exact rows into one document with no self or duplicate edge', () => {
    const pages = [
      page('a1', 'sha-a', filler(1, 200)),
      page('b', 'sha-b', `${filler(1, 200)} ${filler(1000, 2)}`),
      page('a2', 'sha-a', filler(1, 200)),
    ];
    const { groups, textOf } = prepared(pages);
    const graph = measureNearDuplicateGraph(groups, textOf);
    expect(graph.documents.map((d) => d.documentSha256)).toEqual(['sha-a', 'sha-b']);
    expect(graph.comparedPairCount).toBe(1);
    expect(graph.edges.map((e) => [e.aIndex, e.bIndex])).toEqual([[0, 1]]);
  });

  it('a group of byte-identical rows alone yields one document and no pair', () => {
    const graph = graphOf('oneExactGroup');
    expect(graph.documents.map((d) => d.documentSha256)).toEqual(['sha-a', 'sha-b']);
    expect(graph.comparedPairCount).toBe(1);
    expect(graph.edges).toEqual([]);
  });
});

describe('2D-A3 R6: the graph refuses exactly where the pass refuses', () => {
  it('refuses a group whose byte-identical rows extracted to different text', () => {
    const groups = exactDuplicatePass([
      page('b', 'sha-b', filler(1, 60)),
      page('a1', 'sha-a', 'one text'),
      page('a2', 'sha-a', 'other text'),
    ]).groups;
    const textOf = (): string => filler(1, 60);
    expect(() => measureNearDuplicateGraph(groups, textOf)).toThrow(Sd7PilotStop);
    expect(() => measureNearDuplicateGraph(groups, textOf)).toThrow(/survivor choice/);
    expect(() => nearDuplicatePass(groups, textOf)).toThrow(Sd7PilotStop);
  });

  it('propagates a failing text lookup unchanged', () => {
    const groups = [{ documentSha256: 'sha-m', pageIds: ['m'], extractedTextDiverged: false }];
    const textOf = (hash: string): string => {
      throw new RangeError(`no text for ${hash}`);
    };
    expect(() => measureNearDuplicateGraph(groups, textOf)).toThrow(RangeError);
    expect(() => nearDuplicatePass(groups, textOf)).toThrow('no text for sha-m');
  });
});

describe('2D-A3 R6: the graph carries no text and no survivor semantics', () => {
  const ALLOWED_KEYS = [
    'aIndex',
    'atOrAboveThreshold',
    'bIndex',
    'comparedPairCount',
    'documentSha256',
    'documents',
    'edges',
    'intersectionSize',
    'measurable',
    'measurableIndices',
    'measurement',
    'shingleCount',
    'shortTextUnresolvedCount',
    'similarity',
    'tokenCount',
    'unionSize',
  ];

  function keysOf(value: unknown, into: Set<string>): Set<string> {
    if (Array.isArray(value)) for (const v of value) keysOf(v, into);
    else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        into.add(k);
        keysOf(v, into);
      }
    }
    return into;
  }

  it('uses no key outside the reviewed set, across every fixture', () => {
    for (const name of ALL_FIXTURES) {
      for (const key of keysOf(graphOf(name), new Set())) {
        expect(ALLOWED_KEYS, `${name}: ${key}`).toContain(key);
      }
    }
  });

  it('serialises no page text, token or shingle', () => {
    const secret = 'zebracanary';
    const pages = [
      page('a', 'sha-a', `${secret} ${filler(1, 200)}`),
      page('b', 'sha-b', `${secret} ${filler(1, 200)} ${filler(1000, 2)}`),
      page('s', 'sha-s', `${secret} two`),
    ];
    const { groups, textOf } = prepared(pages);
    const serialised = JSON.stringify(measureNearDuplicateGraph(groups, textOf));
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toMatch(/"w\d+|\[\\"|mainText|"text"|tokens"|shingles"/);
  });

  it('names no survivor, selection, rank or sample', () => {
    for (const name of ALL_FIXTURES) {
      expect(JSON.stringify(graphOf(name)), name).not.toMatch(
        /selected|survivor|rank|SET_P|SET_R|sample|component|clique/i,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The pre-R6 `nearDuplicatePass` contract, pinned from the baseline
// ---------------------------------------------------------------------------

/** Every value below was captured from the PRE-R6 module, blob d0591c3a. */
interface PassCounts {
  readonly measurableDocumentCount: number;
  readonly shortTextUnresolvedCount: number;
  readonly comparedPairCount: number;
  readonly edgeCount: number;
  readonly documentsInAtLeastOneEdge: number;
  readonly nonTransitiveComponentCount: number;
  readonly unauditableComponentCount: number;
  readonly measurableSurvivorsMin: number;
  readonly measurableSurvivorsMax: number;
  readonly survivorCountIsOrderInvariant: boolean;
  readonly survivorIdentityIsOrderDependent: boolean;
}

type Row = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  boolean,
  boolean,
];

function counts(row: Row): PassCounts {
  return {
    measurableDocumentCount: row[0],
    shortTextUnresolvedCount: row[1],
    comparedPairCount: row[2],
    edgeCount: row[3],
    documentsInAtLeastOneEdge: row[4],
    nonTransitiveComponentCount: row[5],
    unauditableComponentCount: row[6],
    measurableSurvivorsMin: row[7],
    measurableSurvivorsMax: row[8],
    survivorCountIsOrderInvariant: row[9],
    survivorIdentityIsOrderDependent: row[10],
  };
}

function component(
  size: number,
  edgeCount: number,
  minSurvivors: number,
  maxSurvivors: number,
  unauditable = false,
): ComponentAudit {
  const isClique = edgeCount === (size * (size - 1)) / 2;
  return {
    size,
    edgeCount,
    isClique,
    isNonTransitive: !isClique,
    maxSurvivors,
    minSurvivors,
    unauditable,
  };
}

const BASELINE: Record<FixtureName, { row: Row; components: ComponentAudit[] }> = {
  empty: { row: [0, 0, 0, 0, 0, 0, 0, 0, 0, true, false], components: [] },
  oneMeasurable: { row: [1, 0, 0, 0, 0, 0, 0, 1, 1, true, false], components: [] },
  isolatedThree: { row: [3, 0, 3, 0, 0, 0, 0, 3, 3, true, false], components: [] },
  oneExactGroup: { row: [2, 0, 1, 0, 0, 0, 0, 2, 2, true, false], components: [] },
  multipleExactGroups: { row: [3, 0, 3, 0, 0, 0, 0, 3, 3, true, false], components: [] },
  simpleEdge: { row: [2, 0, 1, 1, 2, 0, 0, 1, 1, true, true], components: [component(2, 1, 1, 1)] },
  cliqueThree: {
    row: [3, 0, 3, 3, 3, 0, 0, 1, 1, true, true],
    components: [component(3, 3, 1, 1)],
  },
  pathAbc: { row: [3, 0, 3, 2, 3, 1, 0, 1, 2, false, true], components: [component(3, 2, 1, 2)] },
  pathBac: { row: [3, 0, 3, 2, 3, 1, 0, 1, 2, false, true], components: [component(3, 2, 1, 2)] },
  pathCba: { row: [3, 0, 3, 2, 3, 1, 0, 1, 2, false, true], components: [component(3, 2, 1, 2)] },
  pathAcb: { row: [3, 0, 3, 2, 3, 1, 0, 1, 2, false, true], components: [component(3, 2, 1, 2)] },
  disconnected: {
    row: [7, 0, 21, 3, 5, 1, 0, 4, 5, false, true],
    components: [component(2, 1, 1, 1), component(3, 2, 1, 2)],
  },
  measurablePlusShort: {
    row: [3, 3, 3, 1, 2, 0, 0, 2, 2, true, true],
    components: [component(2, 1, 1, 1)],
  },
  allShort: { row: [0, 3, 0, 0, 0, 0, 0, 0, 0, true, false], components: [] },
  belowThreshold: { row: [2, 0, 1, 0, 0, 0, 0, 2, 2, true, false], components: [] },
  exactThreshold: {
    row: [2, 0, 1, 1, 2, 0, 0, 1, 1, true, true],
    components: [component(2, 1, 1, 1)],
  },
  caseAndWhitespace: {
    row: [2, 0, 1, 1, 2, 0, 0, 1, 1, true, true],
    components: [component(2, 1, 1, 1)],
  },
  auditableClique20: {
    row: [20, 0, 190, 190, 20, 0, 0, 1, 1, true, true],
    components: [component(20, 190, 1, 1)],
  },
  unauditableClique21: {
    row: [21, 0, 210, 210, 21, 0, 1, Number.NaN, Number.NaN, false, true],
    components: [component(21, 210, Number.NaN, Number.NaN, true)],
  },
  starPlusIsolated: {
    row: [3, 0, 3, 1, 2, 0, 0, 2, 2, true, true],
    components: [component(2, 1, 1, 1)],
  },
};

const PASS_KEYS = [
  'documents',
  'measurableDocumentCount',
  'shortTextUnresolvedCount',
  'comparedPairCount',
  'edgeCount',
  'documentsInAtLeastOneEdge',
  'components',
  'nonTransitiveComponentCount',
  'unauditableComponentCount',
  'measurableSurvivorsMin',
  'measurableSurvivorsMax',
  'survivorCountIsOrderInvariant',
  'survivorIdentityIsOrderDependent',
];

describe('2D-A3 R6: nearDuplicatePass is exactly the pre-R6 contract', () => {
  it('returns exactly the pre-R6 key set, in the pre-R6 order, and no graph edges', () => {
    for (const name of ALL_FIXTURES) {
      expect(Object.keys(passOf(name)), name).toEqual(PASS_KEYS);
      expect(passOf(name), name).not.toHaveProperty('edges');
      expect(passOf(name), name).not.toHaveProperty('measurableIndices');
    }
  });

  it.each(ALL_FIXTURES)('%s matches the pre-R6 baseline', (name) => {
    const pass = passOf(name);
    const { documents, components, ...rest } = pass;
    expect(rest).toEqual(counts(BASELINE[name].row));
    expect(components).toEqual(BASELINE[name].components);
    expect(documents.length).toBe(BASELINE[name].row[0] + BASELINE[name].row[1]);
  });

  it('pins the documents of the short-text mixture exactly', () => {
    expect(passOf('measurablePlusShort').documents).toEqual([
      { documentSha256: 'sha-a', tokenCount: 60, shingleCount: 56, measurable: true },
      { documentSha256: 'sha-s1', tokenCount: 2, shingleCount: 0, measurable: false },
      { documentSha256: 'sha-b', tokenCount: 60, shingleCount: 56, measurable: true },
      { documentSha256: 'sha-s2', tokenCount: 0, shingleCount: 0, measurable: false },
      { documentSha256: 'sha-s3', tokenCount: 4, shingleCount: 0, measurable: false },
      { documentSha256: 'sha-c', tokenCount: 61, shingleCount: 57, measurable: true },
    ]);
  });

  it('refuses divergent exact-group text with the pre-R6 message', () => {
    const groups = exactDuplicatePass([
      page('a1', 'sha-a', 'one text'),
      page('a2', 'sha-a', 'other text'),
    ]).groups;
    expect(() => nearDuplicatePass(groups, () => filler(1, 60))).toThrow(
      new Sd7PilotStop(
        'STOP: byte-identical documents extracted to different text. Choosing ' +
          'which extraction represents the group would be a survivor choice by ' +
          'semantic content, which A3a is forbidden to make.',
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Graph <-> pass consistency
// ---------------------------------------------------------------------------

describe('2D-A3 R6: the pass is built on the graph', () => {
  it.each(ALL_FIXTURES)('%s: the shared fields agree', (name) => {
    const graph = graphOf(name);
    const pass = passOf(name);
    expect(pass.documents).toEqual(graph.documents);
    expect(pass.measurableDocumentCount).toBe(graph.measurableIndices.length);
    expect(pass.shortTextUnresolvedCount).toBe(graph.shortTextUnresolvedCount);
    expect(pass.comparedPairCount).toBe(graph.comparedPairCount);
    expect(pass.edgeCount).toBe(graph.edges.length);
  });
});

// ---------------------------------------------------------------------------
// 4. Input order and determinism
// ---------------------------------------------------------------------------

describe('2D-A3 R6: input order and determinism are exactly as before', () => {
  it('gives identical output for identical input', () => {
    for (const name of ALL_FIXTURES) expect(graphOf(name), name).toEqual(graphOf(name));
  });

  it('keeps the exact-group order as the document order, with no canonicalising sort', () => {
    // The same three documents in two orders: indices follow input order, so
    // the SAME relation is reported under DIFFERENT index pairs. R6 does not
    // sort documents by hash, rank or anything else.
    const abc = graphOf('pathAbc');
    const bac = graphOf('pathBac');
    expect(abc.documents.map((d) => d.documentSha256)).toEqual(['sha-a', 'sha-b', 'sha-c']);
    expect(bac.documents.map((d) => d.documentSha256)).toEqual(['sha-b', 'sha-a', 'sha-c']);
    expect(abc.edges.map((e) => [e.aIndex, e.bIndex])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(bac.edges.map((e) => [e.aIndex, e.bIndex])).toEqual([
      [0, 1],
      [0, 2],
    ]);
  });

  it('reports the same relation over document hashes whatever the input order', () => {
    const relation = (g: NearDuplicateGraphMeasurement): string[] =>
      g.edges
        .map((e) =>
          [g.documents[e.aIndex]!.documentSha256, g.documents[e.bIndex]!.documentSha256]
            .sort()
            .join('~'),
        )
        .sort();
    const expected = ['sha-a~sha-b', 'sha-b~sha-c'];
    for (const name of ['pathAbc', 'pathBac', 'pathCba', 'pathAcb'] as const) {
      expect(relation(graphOf(name)), name).toEqual(expected);
    }
  });

  it('looks up each distinct document once, in group order', () => {
    const { groups, textOf } = prepared(FIXTURES.multipleExactGroups);
    const calls: string[] = [];
    measureNearDuplicateGraph(groups, (hash) => {
      calls.push(hash);
      return textOf(hash);
    });
    expect(calls).toEqual(['sha-a', 'sha-b', 'sha-c']);
  });
});

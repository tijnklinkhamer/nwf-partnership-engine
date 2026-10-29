/**
 * PHASE 2B-2D A3 R47 — THE METHODOLOGY V2 R4 SD7 RELATION, PROVED ON INVENTED TEXT.
 *
 * Invented text only; no corpus, no database, no network. Proves:
 *
 *   §51  every approved R4 consequence: empty / empty, empty / non-empty,
 *        identical and different 1-4 token sequences, order, length, short vs
 *        >= 5 tokens, case / whitespace, punctuation and accents;
 *   §52  no Jaccard on the short branch: `jaccard` is called exactly once per
 *        long-long pair and never on an empty set; a short edge carries no
 *        measurement; no special union / intersection value exists;
 *   §53  on an all-long organisation the R4 relation IS canonical R3: same
 *        documents, counts, compared pairs, edge endpoints and measurements;
 *   §54  a short equivalence class larger than the exact-audit guard
 *        contributes exactly one survivor, analytically: it is never handed to
 *        the exponential R3 audit; K3 keeps exactly its earliest member;
 *   §15  a LONG component above the guard still STOPS, unchanged;
 *   §55  a short clique and a long component stay disconnected and their
 *        envelope contributions add;
 *   §29  the R4 K3 walk equals canonical R7 on every all-long input;
 *   §34  the R4 SET_P / SET_R compositions equal canonical R8 / R12 + R13 on
 *        all-long input: ranks, survivors, exclusions, positions, cap members.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type * as JaccardModule from '../harness/phase2b2d/sd7/jaccard.js';
import type * as PairsModule from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';

const spy = vi.hoisted(() => ({
  jaccardCalls: 0,
  jaccardEmptyOperands: 0,
  passGroupDigests: [] as string[][],
}));

vi.mock('../harness/phase2b2d/sd7/jaccard.js', async (importOriginal) => {
  const actual = await importOriginal<typeof JaccardModule>();
  return {
    ...actual,
    jaccard: (a: ReadonlySet<string>, b: ReadonlySet<string>) => {
      spy.jaccardCalls += 1;
      if (a.size === 0 || b.size === 0) spy.jaccardEmptyOperands += 1;
      return actual.jaccard(a, b);
    },
  };
});

vi.mock('../harness/phase2b2d/sd7/nearDuplicatePairs.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PairsModule>();
  return {
    ...actual,
    nearDuplicatePass: (...args: Parameters<typeof actual.nearDuplicatePass>) => {
      spy.passGroupDigests.push(args[0].map((group) => group.documentSha256));
      return actual.nearDuplicatePass(...args);
    },
  };
});

import { jaccard } from '../harness/phase2b2d/sd7/jaccard.js';
import {
  measureNearDuplicateGraph,
  nearDuplicatePass,
  type ExactDuplicateGroup,
} from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';
import { tokenise } from '../harness/phase2b2d/sd7/normaliseText.js';
import { shingleSet } from '../harness/phase2b2d/sd7/tokenShingles.js';
import { MAX_COMPONENT_SIZE_FOR_EXACT_ORDER_AUDIT } from '../harness/phase2b2d/sd7/sd7Contract.js';
import {
  isExactNormalisedTokenSequenceMatch,
  measureR4NearDuplicateGraph,
  requireR4GraphStructure,
} from '../harness/phase2b2d/sd7R4/measure.js';
import {
  deriveR4SurvivorEnvelope,
  shortEquivalenceClassCount,
} from '../harness/phase2b2d/sd7R4/envelope.js';
import {
  R3_FIVE_GRAM_JACCARD,
  R4_EXACT_NORMALISED_TOKEN_SEQUENCE,
  type R4NearDuplicateGraphMeasurement,
} from '../harness/phase2b2d/sd7R4/types.js';
import { Sd7R4Refusal } from '../harness/phase2b2d/sd7R4/refusal.js';
import {
  prepareSd7SampleSurvivors,
  type A3Sd7SampleOrderEntry,
} from '../harness/phase2b2d/a3prep/sd7.js';
import { prepareSetPSd7 } from '../harness/phase2b2d/a3prep/setPSd7.js';
import { prepareSetRSd7 } from '../harness/phase2b2d/a3prep/setRSd7.js';
import { determineSetRDocumentCap } from '../harness/phase2b2d/a3prep/setRSd7Readiness.js';
import {
  assembleUnboundSlotDocumentSources,
  documentTextLookupForUnboundSlotAssembly,
} from '../harness/phase2b2d/a3documents/assemble.js';
import {
  prepareR4SampleSurvivors,
  prepareR4SetP,
  prepareR4SetR,
  prepareUnboundR4SlotSamples,
} from '../harness/phase2b2d/a3replayR4/survivors.js';
import type { A3DocumentSha256, A3SelectionIndex } from '../harness/phase2b2d/a3prep/types.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const words = (prefix: string, count: number): string =>
  Array.from({ length: count }, (_, i) => `${prefix}${String(i)}`).join(' ');

/** One exact group per text; digests are invented and stable. */
function organisation(texts: readonly string[], tag = 'org') {
  const groups: ExactDuplicateGroup[] = texts.map((_, i) => ({
    documentSha256: sha(`${tag}:${String(i)}`),
    pageIds: [`${tag}-page-${String(i)}`],
    extractedTextDiverged: false,
  }));
  const byDigest = new Map(groups.map((group, i) => [group.documentSha256, texts[i]!] as const));
  const textOf = (digest: string): string => {
    const text = byDigest.get(digest);
    if (text === undefined) throw new Error('unknown document');
    return text;
  };
  return { groups, textOf };
}

function r4(texts: readonly string[]): R4NearDuplicateGraphMeasurement {
  const { groups, textOf } = organisation(texts);
  const graph = measureR4NearDuplicateGraph(groups, textOf);
  requireR4GraphStructure(
    graph,
    groups.map((group) => group.documentSha256),
  );
  return graph;
}

const pairEdges = (graph: R4NearDuplicateGraphMeasurement) =>
  graph.edges.map((edge) => [edge.basis, edge.aIndex, edge.bIndex]);

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return String((error as { code?: unknown }).code);
  }
  throw new Error('expected a refusal');
}

// Near-duplicate building blocks on the >= 5-token branch.
const base = (k: number): string[] => words(`w${String(k)}x`, 100).split(' ');
const tail = (k: number): string => [...base(k).slice(0, 96), 'ta', 'tb', 'tc', 'td'].join(' ');
const head = (k: number): string => ['ha', 'hb', 'hc', 'hd', ...base(k).slice(4)].join(' ');

// ---------------------------------------------------------------------------
// §51 THE R4 RELATION, CLAUSE BY CLAUSE.
// ---------------------------------------------------------------------------

describe('2D-A3 R47 §51: the approved short-text branch, on invented text', () => {
  it.each([
    ['empty vs empty', '', '', true],
    ['whitespace-only vs empty (both normalise to the empty sequence)', '   \n\t ', '', true],
    ['empty vs non-empty', '', 'office', false],
    ['identical one token', 'office', 'office', true],
    ['different one token', 'office', 'bureau', false],
    ['identical two tokens', 'language centre', 'language centre', true],
    ['identical three tokens', 'a b c', 'a b c', true],
    ['identical four tokens', 'a b c d', 'a b c d', true],
    ['different order', 'language centre', 'centre language', false],
    ['different length', 'language centre', 'language centre office', false],
    ['short vs >= 5 tokens (prefix)', 'a b c d', 'a b c d e', false],
    ['case and whitespace variants', '  Language   CENTRE ', 'language centre', true],
    ['punctuation preserved', 'office.', 'office', false],
    ['accent preserved', 'université', 'universite', false],
    ['composed vs decomposed accent stays different', 'café', 'café', false],
  ])('%s', (_, a, b, edge) => {
    const graph = r4([a, b]);
    expect(graph.totalPairCount).toBe(1);
    expect(graph.unresolvedDocumentCount).toBe(0);
    expect(graph.documents.every((d) => d.relationResolved)).toBe(true);
    if (edge) {
      expect(pairEdges(graph)).toEqual([[R4_EXACT_NORMALISED_TOKEN_SEQUENCE, 0, 1]]);
    } else {
      expect(graph.edges).toEqual([]);
    }
  });

  it('the exact-sequence predicate is equal length and element-wise equality, nothing else', () => {
    expect(isExactNormalisedTokenSequenceMatch([], [])).toBe(true);
    expect(isExactNormalisedTokenSequenceMatch(['a'], [])).toBe(false);
    expect(isExactNormalisedTokenSequenceMatch(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(isExactNormalisedTokenSequenceMatch(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(isExactNormalisedTokenSequenceMatch(['a b'], ['a', 'b'])).toBe(false);
  });

  it('a short vs >= 5-token pair is on the R4 branch and can never be an edge', () => {
    const graph = r4(['a b c d', 'a b c d e f', '', 'x']);
    expect(graph.longIndices).toEqual([1]);
    expect(graph.shortIndices).toEqual([0, 2, 3]);
    expect(graph.r3FiveGramPairCount).toBe(0);
    expect(graph.r4ExactSequenceBranchPairCount).toBe(6);
    expect(graph.edges).toEqual([]);
  });

  it('>= 5-token pairs produce exactly the canonical R3 Jaccard result', () => {
    const texts = [base(0).join(' '), tail(0), head(0), words('other', 40)];
    const graph = r4(texts);
    for (const edge of graph.edges) {
      expect(edge.basis).toBe(R3_FIVE_GRAM_JACCARD);
      if (edge.basis !== R3_FIVE_GRAM_JACCARD) continue;
      expect(edge.measurement).toEqual(
        jaccard(
          shingleSet(tokenise(texts[edge.aIndex]!)),
          shingleSet(tokenise(texts[edge.bIndex]!)),
        ),
      );
    }
    expect(pairEdges(graph)).toEqual([
      [R3_FIVE_GRAM_JACCARD, 0, 1],
      [R3_FIVE_GRAM_JACCARD, 0, 2],
    ]);
  });

  it('pair accounting closes: total = r3 + r4 = n(n-1)/2', () => {
    const graph = r4(['', 'a', 'a', base(1).join(' '), tail(1), 'b c', words('z', 12)]);
    expect(graph.totalPairCount).toBe(21);
    expect(graph.r3FiveGramPairCount).toBe(3);
    expect(graph.r4ExactSequenceBranchPairCount).toBe(18);
    expect(graph.r3FiveGramPairCount + graph.r4ExactSequenceBranchPairCount).toBe(21);
  });

  it('serialises no text, token or equality key onto the graph', () => {
    const graph = r4(['secret-token-alpha', 'secret-token-alpha', base(2).join(' ')]);
    const json = JSON.stringify(graph);
    expect(json).not.toMatch(/secret-token-alpha|w2x/);
    expect(Object.keys(graph.documents[0]!).sort()).toEqual(
      [
        'documentSha256',
        'relationResolved',
        'shingleCount',
        'shortTextBranch',
        'tokenCount',
      ].sort(),
    );
  });

  it('refuses divergent extracted text and a repeated document', () => {
    const { groups, textOf } = organisation(['a', 'b']);
    expect(
      codeOf(() =>
        measureR4NearDuplicateGraph([{ ...groups[0]!, extractedTextDiverged: true }], textOf),
      ),
    ).toBe('SD7_R4_EXTRACTED_TEXT_DIVERGED');
    expect(codeOf(() => measureR4NearDuplicateGraph([groups[0]!, groups[0]!], textOf))).toBe(
      'SD7_R4_DUPLICATE_DOCUMENT',
    );
  });
});

// ---------------------------------------------------------------------------
// §52 NO FAKE JACCARD.
// ---------------------------------------------------------------------------

describe('2D-A3 R47 §52: the short branch never touches Jaccard', () => {
  it('calls jaccard exactly once per long-long pair, never on an empty set', () => {
    spy.jaccardCalls = 0;
    spy.jaccardEmptyOperands = 0;
    const graph = r4(['', '', 'a', 'a', 'a b c d', base(3).join(' '), tail(3), words('q', 9)]);
    expect(graph.r3FiveGramPairCount).toBe(3);
    expect(spy.jaccardCalls).toBe(3);
    expect(spy.jaccardEmptyOperands).toBe(0);
    for (const edge of graph.edges) {
      if (edge.basis === R4_EXACT_NORMALISED_TOKEN_SEQUENCE) {
        expect(Object.prototype.hasOwnProperty.call(edge, 'measurement')).toBe(false);
        expect(Object.keys(edge).sort()).toEqual(['aIndex', 'bIndex', 'basis']);
      }
    }
  });

  it('statically: one jaccard call site, inside the both-long branch, and no invented union', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'src/test/harness/phase2b2d/sd7R4/measure.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const calls = [...source.matchAll(/\bjaccard\(/g)];
    expect(calls).toHaveLength(1);
    const before = source.slice(0, calls[0]!.index);
    expect(before.lastIndexOf('if (sa !== null && sb !== null)')).toBeGreaterThan(
      before.lastIndexOf('} else {'),
    );
    expect(source).not.toMatch(/intersectionSize\s*:|unionSize\s*:|similarity\s*:/);
    expect(source).not.toMatch(/\bas unknown as\b/);
  });

  it('the R3 empty-union throw is unchanged', () => {
    expect(() => jaccard(new Set(), new Set())).toThrow(/empty union/);
  });
});

// ---------------------------------------------------------------------------
// §53 R3 EQUIVALENCE ON AN ALL-LONG ORGANISATION.
// ---------------------------------------------------------------------------

describe('2D-A3 R47 §53: on an all-long organisation R4 is canonical R3', () => {
  it('same documents, counts, pairs, edge endpoints and measurement objects', () => {
    const texts = [
      base(4).join(' '),
      tail(4),
      head(4),
      words('solo', 30),
      base(5).join(' '),
      tail(5),
      words('alone', 7),
    ];
    const { groups, textOf } = organisation(texts);
    const r3 = measureNearDuplicateGraph(groups, textOf);
    const graph = measureR4NearDuplicateGraph(groups, textOf);
    expect(graph.shortIndices).toEqual([]);
    expect(graph.longIndices).toEqual(r3.measurableIndices);
    expect(graph.documents.map((d) => [d.documentSha256, d.tokenCount, d.shingleCount])).toEqual(
      r3.documents.map((d) => [d.documentSha256, d.tokenCount, d.shingleCount]),
    );
    expect(graph.r3FiveGramPairCount).toBe(r3.comparedPairCount);
    expect(graph.r4ExactSequenceBranchPairCount).toBe(0);
    expect(
      graph.edges.map((e) => ({
        aIndex: e.aIndex,
        bIndex: e.bIndex,
        measurement: e.basis === R3_FIVE_GRAM_JACCARD ? e.measurement : null,
      })),
    ).toEqual(
      r3.edges.map((e) => ({ aIndex: e.aIndex, bIndex: e.bIndex, measurement: e.measurement })),
    );
    expect(graph.edges.every((e) => e.basis === R3_FIVE_GRAM_JACCARD)).toBe(true);
    const envelope = deriveR4SurvivorEnvelope(graph, groups, textOf);
    const pass = nearDuplicatePass(groups, textOf);
    expect([envelope.survivorsMin, envelope.survivorsMax]).toEqual([
      pass.measurableSurvivorsMin,
      pass.measurableSurvivorsMax,
    ]);
  });
});

// ---------------------------------------------------------------------------
// §54 / §15 / §55 THE ENVELOPE.
// ---------------------------------------------------------------------------

describe('2D-A3 R47 §54: a short clique larger than the audit guard is analytic', () => {
  const size = MAX_COMPONENT_SIZE_FOR_EXACT_ORDER_AUDIT + 5;
  const texts = [...Array.from({ length: size }, () => 'contact'), base(6).join(' '), tail(6)];

  it('contributes exactly one survivor (1 / 1), and the R3 audit never sees it', () => {
    const { groups, textOf } = organisation(texts);
    const graph = measureR4NearDuplicateGraph(groups, textOf);
    expect(graph.edges.filter((e) => e.basis === R4_EXACT_NORMALISED_TOKEN_SEQUENCE)).toHaveLength(
      (size * (size - 1)) / 2,
    );
    expect(shortEquivalenceClassCount(graph)).toBe(1);
    spy.passGroupDigests.length = 0;
    const envelope = deriveR4SurvivorEnvelope(graph, groups, textOf);
    expect(envelope).toEqual({
      longDocumentCount: 2,
      longSurvivorsMin: 1,
      longSurvivorsMax: 1,
      shortDocumentCount: size,
      shortEquivalenceClassCount: 1,
      survivorsMin: 2,
      survivorsMax: 2,
    });
    // The canonical audit received ONLY the two long groups.
    expect(spy.passGroupDigests).toEqual([
      [groups[size]!.documentSha256, groups[size + 1]!.documentSha256],
    ]);
  });

  it('K3 keeps exactly one clique member, chosen solely by sample order', () => {
    const { groups, textOf } = organisation(texts);
    const graph = measureR4NearDuplicateGraph(groups, textOf);
    const orderOf = (digests: readonly string[]): A3Sd7SampleOrderEntry[] =>
      digests.map((documentSha256, rankPosition) => ({
        sample: 'SET_P',
        selectionIndex: 900 as A3SelectionIndex,
        split: 'DEV_TRAIN',
        documentSha256: documentSha256 as A3DocumentSha256,
        rankPosition,
      }));
    const digests = groups.map((g) => g.documentSha256);
    for (const order of [
      digests,
      [...digests].reverse(),
      [...digests.slice(7), ...digests.slice(0, 7)],
    ]) {
      const walk = prepareR4SampleSurvivors({ sample: 'SET_P', graph, order: orderOf(order) });
      const shortSurvivors = walk.survivors.filter((s) => digests.indexOf(s.documentSha256) < size);
      expect(shortSurvivors).toHaveLength(1);
      const firstShortInOrder = order.find((d) => digests.indexOf(d) < size);
      expect(shortSurvivors[0]!.documentSha256).toBe(firstShortInOrder);
      expect(walk.counts.survivorCount + walk.counts.exclusionCount).toBe(texts.length);
      expect(walk.counts.unresolvedCount).toBe(0);
    }
  });
});

describe('2D-A3 R47 §15: a LONG component above the guard still STOPS', () => {
  it('is never approximated or special-cased', () => {
    const size = MAX_COMPONENT_SIZE_FOR_EXACT_ORDER_AUDIT + 1;
    const { groups, textOf } = organisation(
      Array.from({ length: size }, (_, i) => (i % 2 === 0 ? base(7).join(' ') : tail(7))),
    );
    const graph = measureR4NearDuplicateGraph(groups, textOf);
    expect(() => deriveR4SurvivorEnvelope(graph, groups, textOf)).toThrow(Sd7R4Refusal);
    expect(codeOf(() => deriveR4SurvivorEnvelope(graph, groups, textOf))).toBe(
      'STOP_SD7_R4_LONG_COMPONENT_NOT_EXACTLY_AUDITABLE',
    );
  });
});

describe('2D-A3 R47 §55: a short clique and a long component stay disconnected', () => {
  it('overall min / max is the sum of the independent contributions', () => {
    // Long path x ~ y ~ z with x !~ z: survivors range [1, 2]. Plus one isolated
    // long document, a 3-clique of short text and a singleton short class.
    const texts = [tail(8), 'x y', base(8).join(' '), 'x y', head(8), words('iso', 20), 'x y', 'z'];
    const { groups, textOf } = organisation(texts);
    const graph = measureR4NearDuplicateGraph(groups, textOf);
    for (const edge of graph.edges) {
      const aShort = graph.documents[edge.aIndex]!.shortTextBranch;
      const bShort = graph.documents[edge.bIndex]!.shortTextBranch;
      expect(aShort).toBe(bShort);
    }
    const longOnly = nearDuplicatePass(
      graph.longIndices.map((i) => groups[i]!),
      textOf,
    );
    expect([longOnly.measurableSurvivorsMin, longOnly.measurableSurvivorsMax]).toEqual([2, 3]);
    expect(shortEquivalenceClassCount(graph)).toBe(2);
    const envelope = deriveR4SurvivorEnvelope(graph, groups, textOf);
    expect([envelope.survivorsMin, envelope.survivorsMax]).toEqual([4, 5]);
  });

  it('refuses a short-text component that is not a clique', () => {
    const graph = r4(['a', 'a', 'a']);
    const broken = { ...graph, edges: graph.edges.slice(0, 2) };
    expect(codeOf(() => shortEquivalenceClassCount(broken))).toBe(
      'SD7_R4_SHORT_BRANCH_NOT_AN_EQUIVALENCE',
    );
  });
});

// ---------------------------------------------------------------------------
// §29 / §34 K3 AND COMPOSITION EQUIVALENCE ON ALL-LONG FIXTURES.
// ---------------------------------------------------------------------------

/** A genuine (unbound) R21 slot assembly from invented rows; all documents long. */
function allLongSlot(seed: string, texts: readonly string[], scores: readonly string[]) {
  const digests = texts.map((_, i) => sha(`${seed}:${String(i)}`));
  const unbound = assembleUnboundSlotDocumentSources({
    selectionIndex: 900,
    split: 'DEV_TRAIN',
    pageEvidence: texts.map((mainText, i) => ({
      pageEvidenceId: `${seed}-p${String(i)}`,
      documentSha256: digests[i]!,
      extractionRuleVersion: 'orgunit-extraction-v2',
      mainText,
    })),
    candidates: texts.flatMap((_, i) =>
      (['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE'] as const).map((track) => ({
        pageEvidenceId: `${seed}-p${String(i)}`,
        documentSha256: digests[i]!,
        track,
        candidateScore: track === 'INTERNATIONAL_OFFICE' ? scores[i]! : '-1.0000',
        ruleVersion: 'orgunit-signal-rules-v1',
      })),
    ),
  });
  const textOf = documentTextLookupForUnboundSlotAssembly(unbound);
  const groups: ExactDuplicateGroup[] = unbound.documents.map((entry) => ({
    documentSha256: entry.document.documentSha256,
    pageIds: entry.document.sourcePageEvidenceIds,
    extractedTextDiverged: false,
  }));
  return {
    unbound,
    r3: measureNearDuplicateGraph(groups, textOf),
    r4: measureR4NearDuplicateGraph(groups, textOf),
  };
}

const LONG_FIXTURES = [
  {
    name: 'two pairs, a path and isolates',
    texts: [
      base(10).join(' '),
      tail(10),
      words('i', 30),
      base(11).join(' '),
      head(11),
      tail(11),
      words('j', 25),
      base(12).join(' '),
      tail(12),
      words('k', 11),
      words('l', 50),
    ],
    scores: [
      '5.0000',
      '4.0000',
      '3.0000',
      '2.0000',
      '9.0000',
      '1.0000',
      '0.5000',
      '-2.0000',
      '6.0000',
      '7.0000',
      '8.0000',
    ],
  },
  {
    name: 'a triangle and a long tail of isolates',
    texts: [
      base(13).join(' '),
      tail(13),
      [...base(13).slice(0, 97), 'za', 'zb', 'zc'].join(' '),
      ...Array.from({ length: 12 }, (_, i) => words(`m${String(i)}`, 20)),
    ],
    scores: Array.from({ length: 15 }, (_, i) => `${String(15 - i)}.0000`),
  },
];

describe('2D-A3 R47 §29: the R4 K3 walk equals canonical R7 on all-long input', () => {
  it.each(LONG_FIXTURES)('$name, over several orders', ({ texts, scores }) => {
    const slot = allLongSlot('k3', texts, scores);
    const digests = slot.unbound.documents.map((e) => e.document.documentSha256);
    const orders = [
      digests,
      [...digests].reverse(),
      [...digests].sort(),
      [...digests].sort().reverse(),
    ];
    for (const sample of ['SET_P', 'SET_R'] as const) {
      for (const order of orders) {
        const entries: A3Sd7SampleOrderEntry[] = order.map((documentSha256, rankPosition) => ({
          sample,
          selectionIndex: 900 as A3SelectionIndex,
          split: 'DEV_TRAIN',
          documentSha256,
          rankPosition,
        }));
        const r3 = prepareSd7SampleSurvivors({ sample, graph: slot.r3, order: entries });
        const r4walk = prepareR4SampleSurvivors({ sample, graph: slot.r4, order: entries });
        expect(r3.shortTextUnresolvedInSampleOrder).toEqual([]);
        expect(r4walk.survivors).toEqual(r3.measurableSurvivors);
        expect(r4walk.exclusions).toEqual(r3.measurableExclusions);
        expect(r4walk.counts.survivorCount).toBe(r3.counts.measurableSurvivorCount);
        expect(r4walk.counts.exclusionCount).toBe(r3.counts.measurableExclusionCount);
      }
    }
  });
});

describe('2D-A3 R47 §34: the R4 compositions equal canonical R8 / R12 + R13 on all-long input', () => {
  it.each(LONG_FIXTURES)('$name', ({ texts, scores }) => {
    const slot = allLongSlot('cmp', texts, scores);
    const pool = slot.unbound.documents.map((e) => e.document);
    const rankInputs = slot.unbound.documents.map((e) => ({
      document: e.document,
      scorePreparation: e.scorePreparation,
    }));

    const p3 = prepareSetPSd7({ pool, graph: slot.r3 });
    const p4 = prepareR4SetP({ pool, graph: slot.r4 });
    expect(p4.preSd7FullRank).toEqual(p3.preSd7FullRank);
    expect(p4.sd7Preparation.survivors).toEqual(p3.sd7Preparation.measurableSurvivors);
    expect(p4.sd7Preparation.exclusions).toEqual(p3.sd7Preparation.measurableExclusions);
    expect(p4.survivorAwareFullRank).toEqual(p3.measurableSurvivorAwareFullRank);
    expect(p3.documentCap.status).toBe('SET_P_DOCUMENT_CAP_EXACT');
    expect(p4.documentCap.documents).toEqual(
      p3.documentCap.status === 'SET_P_DOCUMENT_CAP_EXACT' ? p3.documentCap.documents : null,
    );

    const r3 = prepareSetRSd7({ rankInputs, graph: slot.r3 });
    const r3Cap = determineSetRDocumentCap(r3);
    const r4set = prepareR4SetR({ rankInputs, graph: slot.r4 });
    expect(r4set.preSd7FullRank).toEqual(r3.preSd7FullRank);
    expect(r4set.sd7Preparation.survivors).toEqual(r3.sd7Preparation.measurableSurvivors);
    expect(r4set.sd7Preparation.exclusions).toEqual(r3.sd7Preparation.measurableExclusions);
    expect(r4set.survivorAwareFullRank).toEqual(r3.measurableSurvivorAwareFullRank);
    expect(r3Cap.status).toBe('SET_R_DOCUMENT_CAP_EXACT');
    expect(r4set.documentCap.documents).toEqual(
      r3Cap.status === 'SET_R_DOCUMENT_CAP_EXACT' ? r3Cap.documents : null,
    );

    // The per-slot composition calls the same two compositions, once each.
    const both = prepareUnboundR4SlotSamples(slot.unbound, slot.r4);
    expect(both.setP.survivorAwareFullRank).toEqual(p4.survivorAwareFullRank);
    expect(both.setR.survivorAwareFullRank).toEqual(r4set.survivorAwareFullRank);
  });

  it('with short text present every document is still a survivor or an exclusion', () => {
    const slot = allLongSlot(
      'mix',
      ['a', 'a', base(14).join(' '), tail(14), ''],
      ['1.0000', '2.0000', '3.0000', '4.0000', '5.0000'],
    );
    const both = prepareUnboundR4SlotSamples(slot.unbound, slot.r4);
    for (const prep of [both.setP, both.setR]) {
      expect(
        prep.sd7Preparation.counts.survivorCount + prep.sd7Preparation.counts.exclusionCount,
      ).toBe(5);
      expect(prep.sd7Preparation.counts.survivorCount).toBe(3);
      expect(prep.documentCap.documents).toBe(prep.documentCap.documents);
      expect(prep.documentCap.documents).toEqual(
        prep.survivorAwareFullRank.slice(0, prep.documentCap.capSize),
      );
    }
  });
});

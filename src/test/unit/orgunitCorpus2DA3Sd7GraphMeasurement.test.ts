/**
 * PHASE 2B-2D A3 R22 — THE CANONICAL SD7 GRAPH MEASUREMENT, OVER SYNTHETIC SLOTS.
 *
 * Every test here exercises the UNBOUND layer, over slots built by R21's own
 * UNBOUND assembler. Synthetic documents prove nothing about which
 * acquisition A2 adjudicated, so none of them can be minted - the binder's
 * refusals are tested below, and its successful route is exercised only by
 * the real R19 -> R20 -> R21 -> R22 chain.
 *
 * Threshold and normalisation behaviour is tested THROUGH canonical
 * `measureNearDuplicateGraph` - never by re-implementing its predicate here.
 */
import { describe, expect, it } from 'vitest';
import {
  assembleUnboundSlotDocumentSources,
  documentTextLookupForUnboundSlotAssembly,
} from '../harness/phase2b2d/a3documents/assemble.js';
import type {
  UnboundA3SlotDocumentSourceAssembly,
  UnboundSlotCandidateSourceRow,
  UnboundSlotPageSourceRow,
} from '../harness/phase2b2d/a3documents/types.js';
import type { R21PublicDocumentSourceCensus } from '../harness/phase2b2d/a3documents/census.js';
import {
  exactGroupsForSlotDocuments,
  measureUnboundSlotSd7Graph,
  requireCanonicalGraphStructure,
} from '../harness/phase2b2d/a3graphs/measure.js';
import {
  bindDevTrainSd7GraphBatch,
  documentSourceAssemblyForSlotGraph,
  governanceSnapshotForGraphBatch,
  isA3DevTrainSd7GraphBatch,
  isA3DevTrainSlotSd7GraphMeasurement,
  slotGraphForDocumentSourceAssembly,
} from '../harness/phase2b2d/a3graphs/devTrain.js';
import { deriveR22PublicGraphMeasurementCensus } from '../harness/phase2b2d/a3graphs/census.js';
import { A3GraphRefusal } from '../harness/phase2b2d/a3graphs/refusal.js';
import { r21AggregateDriftPaths } from '../harness/phase2b2d/a3graphs/r21Drift.js';
import type { UnboundSlotSd7GraphInput } from '../harness/phase2b2d/a3graphs/types.js';
import type { NearDuplicateGraphMeasurement } from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';

const V2 = 'orgunit-extraction-v2';
const SIGNAL = 'orgunit-signal-rules-v1';

function sha(n: number): string {
  return n.toString(16).padStart(64, '0');
}

function words(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i)}`).join(' ');
}

/** One R21 unbound slot whose documents carry exactly these texts, in order. */
function r21Slot(
  texts: readonly string[],
  selectionIndex = 3,
  idPrefix = 'p',
): UnboundA3SlotDocumentSourceAssembly {
  const pages: UnboundSlotPageSourceRow[] = texts.map((mainText, i) => ({
    pageEvidenceId: `${idPrefix}-${String(i)}`,
    documentSha256: sha(i + 1),
    extractionRuleVersion: V2,
    mainText,
  }));
  const candidates: UnboundSlotCandidateSourceRow[] = pages.flatMap((p) => [
    {
      pageEvidenceId: p.pageEvidenceId,
      documentSha256: p.documentSha256,
      track: 'INTERNATIONAL_OFFICE',
      candidateScore: '0.0000',
      ruleVersion: SIGNAL,
    },
    {
      pageEvidenceId: p.pageEvidenceId,
      documentSha256: p.documentSha256,
      track: 'LANGUAGE_CENTRE',
      candidateScore: '0.0000',
      ruleVersion: SIGNAL,
    },
  ]);
  return assembleUnboundSlotDocumentSources({
    selectionIndex,
    split: 'DEV_TRAIN',
    pageEvidence: pages,
    candidates,
  });
}

function measure(texts: readonly string[]): NearDuplicateGraphMeasurement {
  const slot = r21Slot(texts);
  return measureUnboundSlotSd7Graph(slot, documentTextLookupForUnboundSlotAssembly(slot)).graph;
}

function edgePairs(graph: NearDuplicateGraphMeasurement): string[] {
  return graph.edges.map((edge) => `${String(edge.aIndex)}-${String(edge.bIndex)}`);
}

function refusalCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof A3GraphRefusal) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

// ---------------------------------------------------------------------------

describe('2D-A3 R22 §9/§10: exact documents become canonical groups bijectively', () => {
  it('translates each R21 document to one group, same digest, same rows, same order', () => {
    const slot = r21Slot([words('a', 6), words('b', 6), words('c', 6)]);
    const groups = exactGroupsForSlotDocuments(slot);
    expect(groups).toHaveLength(slot.documents.length);
    groups.forEach((group, i) => {
      const entry = slot.documents[i]!;
      expect(group.documentSha256).toBe(entry.document.documentSha256);
      expect(group.pageIds).toBe(entry.document.sourcePageEvidenceIds);
      expect(group.extractedTextDiverged).toBe(false);
    });
  });

  it('keeps an exact-duplicate group as ONE group carrying every source row', () => {
    const pages: UnboundSlotPageSourceRow[] = [
      { pageEvidenceId: 'x-1', documentSha256: sha(9), extractionRuleVersion: V2, mainText: 't' },
      { pageEvidenceId: 'x-2', documentSha256: sha(9), extractionRuleVersion: V2, mainText: 't' },
    ];
    const slot = assembleUnboundSlotDocumentSources({
      selectionIndex: 1,
      split: 'DEV_TRAIN',
      pageEvidence: pages,
      candidates: pages.flatMap((p) =>
        ['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE'].map((track) => ({
          pageEvidenceId: p.pageEvidenceId,
          documentSha256: p.documentSha256,
          track,
          candidateScore: '0.0000',
          ruleVersion: SIGNAL,
        })),
      ),
    });
    const groups = exactGroupsForSlotDocuments(slot);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.pageIds).toEqual(['x-1', 'x-2']);
  });

  const base = r21Slot([words('a', 6), words('b', 6)]);
  const entries = base.documents;

  it('refuses an empty slot', () => {
    expect(refusalCode(() => exactGroupsForSlotDocuments({ ...base, documents: [] }))).toBe(
      'R22_SLOT_HAS_NO_DOCUMENTS',
    );
  });

  it('refuses a repeated document digest', () => {
    const input = { ...base, documents: [entries[0]!, entries[0]!] };
    expect(refusalCode(() => exactGroupsForSlotDocuments(input))).toBe(
      'R22_DUPLICATE_DOCUMENT_IN_SLOT',
    );
  });

  it('refuses a document with no source row', () => {
    const empty = {
      ...entries[1]!,
      document: { ...entries[1]!.document, sourcePageEvidenceIds: [] },
    };
    expect(
      refusalCode(() => exactGroupsForSlotDocuments({ ...base, documents: [entries[0]!, empty] })),
    ).toBe('R22_DOCUMENT_HAS_NO_SOURCE_ROW');
  });

  it('refuses a source row claimed by two documents', () => {
    const stolen = {
      ...entries[1]!,
      document: {
        ...entries[1]!.document,
        sourcePageEvidenceIds: entries[0]!.document.sourcePageEvidenceIds,
      },
    };
    expect(
      refusalCode(() => exactGroupsForSlotDocuments({ ...base, documents: [entries[0]!, stolen] })),
    ).toBe('R22_SOURCE_ROW_IN_TWO_DOCUMENTS');
  });

  it('refuses a non-DEV_TRAIN split and a malformed slot', () => {
    const lookup = documentTextLookupForUnboundSlotAssembly(base);
    expect(
      refusalCode(() => measureUnboundSlotSd7Graph({ ...base, split: 'DEV_CONFIRM' }, lookup)),
    ).toBe('R22_SPLIT_NOT_SUPPORTED');
    expect(
      refusalCode(() =>
        measureUnboundSlotSd7Graph({ ...base, documents: 'x' } as unknown as typeof base, lookup),
      ),
    ).toBe('R22_SLOT_INPUT_SHAPE_INVALID');
    expect(
      refusalCode(() => measureUnboundSlotSd7Graph({ ...base, selectionIndex: -1 }, lookup)),
    ).toBe('R22_SLOT_INPUT_SHAPE_INVALID');
  });
});

describe('2D-A3 R22 §11/§12: one canonical call per slot, text only through the lookup', () => {
  it('asks the lookup for each document exactly once, and for nothing else', () => {
    const slot = r21Slot([words('a', 7), words('b', 3), words('c', 9)]);
    const inner = documentTextLookupForUnboundSlotAssembly(slot);
    const asked: string[] = [];
    const prepared = measureUnboundSlotSd7Graph(slot, (digest) => {
      asked.push(digest);
      return inner(digest);
    });
    expect(asked).toEqual(slot.documents.map((entry) => entry.document.documentSha256));
    expect(prepared.kind).toBe('UNBOUND_A3_SLOT_SD7_GRAPH_PREPARATION');
  });

  it('puts no text on the result', () => {
    const texts = [words('alpha', 8), words('beta', 8)];
    const slot = r21Slot(texts);
    const serialised = JSON.stringify(
      measureUnboundSlotSd7Graph(slot, documentTextLookupForUnboundSlotAssembly(slot)),
    );
    expect(serialised).not.toContain('alpha0');
    expect(serialised).not.toContain('beta0');
    expect(serialised).not.toMatch(/mainText|"text"/);
  });

  it('refuses when the canonical measurement stops, carrying no digest or text', () => {
    const slot = r21Slot([words('a', 6)]);
    let caught: unknown;
    try {
      measureUnboundSlotSd7Graph(slot, () => {
        throw new Error('lookup unavailable');
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(A3GraphRefusal);
    expect((caught as A3GraphRefusal).code).toBe('R22_CANONICAL_MEASUREMENT_STOPPED');
    expect((caught as A3GraphRefusal).message).not.toMatch(/[0-9a-f]{64}|a0 a1/);
  });

  it('returns the canonical graph frozen, and never re-measures it', () => {
    const graph = measure([words('a', 6), words('a', 6).toUpperCase()]);
    expect(Object.isFrozen(graph)).toBe(true);
    expect(Object.isFrozen(graph.documents)).toBe(true);
    expect(Object.isFrozen(graph.edges)).toBe(true);
    expect(Object.isFrozen(graph.edges[0]!.measurement)).toBe(true);
  });
});

describe('2D-A3 R22 §13: within one organisation only', () => {
  it('measures two slots with identical texts independently, with no cross-slot pair', () => {
    const shared = words('same', 10);
    const slotA = r21Slot([shared, words('onlyA', 10)], 1, 'a');
    const slotB = r21Slot([shared, words('onlyB', 10)], 2, 'b');
    const graphA = measureUnboundSlotSd7Graph(
      slotA,
      documentTextLookupForUnboundSlotAssembly(slotA),
    ).graph;
    const graphB = measureUnboundSlotSd7Graph(
      slotB,
      documentTextLookupForUnboundSlotAssembly(slotB),
    ).graph;
    for (const graph of [graphA, graphB]) {
      expect(graph.documents).toHaveLength(2);
      expect(graph.comparedPairCount).toBe(1);
      expect(graph.edges).toEqual([]);
    }
    // The shared text is not an edge anywhere: no pair spans two slots.
  });

  it('exposes no multi-slot entry point', () => {
    const slot = r21Slot([words('a', 6)]);
    expect(measureUnboundSlotSd7Graph.length).toBe(2);
    expect(
      refusalCode(() =>
        measureUnboundSlotSd7Graph(
          [slot, slot] as unknown as UnboundSlotSd7GraphInput,
          documentTextLookupForUnboundSlotAssembly(slot),
        ),
      ),
    ).toBe('R22_SLOT_INPUT_SHAPE_INVALID');
  });
});

describe('2D-A3 R22 §19/§20: the exact 9/10 threshold, through the canonical path', () => {
  // A: 14 tokens -> 10 shingles. Prefixes of A share every one of their shingles.
  const a = words('t', 14);

  it('below threshold: 8 of 10 shingles shared is not an edge', () => {
    const graph = measure([a, words('t', 12)]);
    expect(graph.comparedPairCount).toBe(1);
    expect(graph.edges).toEqual([]);
  });

  it('exactly at threshold: 9 of 10 shingles shared IS an edge', () => {
    const graph = measure([a, words('t', 13)]);
    expect(edgePairs(graph)).toEqual(['0-1']);
    expect(graph.edges[0]!.measurement.intersectionSize).toBe(9);
    expect(graph.edges[0]!.measurement.unionSize).toBe(10);
    expect(graph.edges[0]!.measurement.atOrAboveThreshold).toBe(true);
  });

  it('above threshold: 15 of 16 shingles shared is an edge', () => {
    const graph = measure([words('u', 20), words('u', 19)]);
    expect(edgePairs(graph)).toEqual(['0-1']);
  });

  it('edges connect only the pairs canonical SD7 accepts', () => {
    const graph = measure([a, words('t', 13), words('t', 12), words('z', 14)]);
    // 13 vs 12: 8/9 >= 0.9 is false -> no edge; 14 vs 12: 8/10 -> no edge.
    expect(edgePairs(graph)).toEqual(['0-1']);
    expect(graph.comparedPairCount).toBe(6);
  });
});

describe('2D-A3 R22 §21: canonical SD7 normalisation semantics', () => {
  const five = 'the international office of paris';

  it('case-only differences normalise', () => {
    expect(edgePairs(measure([five, five.toUpperCase()]))).toEqual(['0-1']);
  });

  it('whitespace-run differences normalise', () => {
    expect(edgePairs(measure([five, `  the\t international\n\noffice   of paris `]))).toEqual([
      '0-1',
    ]);
  });

  it('punctuation remains significant', () => {
    expect(measure([five, 'the international office of paris.']).edges).toEqual([]);
  });

  it('accents remain', () => {
    expect(
      measure([
        'le bureau des relations internationales',
        'le bureau dés relations internationales',
      ]).edges,
    ).toEqual([]);
  });

  it('no stemming', () => {
    expect(measure([five, 'the international offices of paris']).edges).toEqual([]);
  });

  it('no Unicode NFC/NFD canonicalisation', () => {
    const composed = 'le centre de langues université';
    const decomposed = 'le centre de langues université';
    expect(measure([composed, decomposed]).edges).toEqual([]);
  });
});

describe('2D-A3 R22 §16/§22: the five-token boundary and short text', () => {
  it('4 tokens are short-text unresolved and never compared', () => {
    const graph = measure(['one two three four', 'one two three four']);
    expect(graph.measurableIndices).toEqual([]);
    expect(graph.shortTextUnresolvedCount).toBe(2);
    expect(graph.comparedPairCount).toBe(0);
    expect(graph.edges).toEqual([]);
    for (const document of graph.documents) {
      expect(document.measurable).toBe(false);
      expect(document.tokenCount).toBe(4);
      expect(document.shingleCount).toBe(0);
    }
  });

  it('5 tokens are measurable with exactly one shingle', () => {
    const graph = measure(['one two three four five']);
    expect(graph.measurableIndices).toEqual([0]);
    expect(graph.documents[0]).toMatchObject({ tokenCount: 5, shingleCount: 1, measurable: true });
  });

  it('a short-text document takes part in no edge, even beside identical measurable text', () => {
    const graph = measure(['one two three four', words('m', 8), words('m', 8).toUpperCase()]);
    expect(graph.shortTextUnresolvedCount).toBe(1);
    expect(graph.measurableIndices).toEqual([1, 2]);
    expect(edgePairs(graph)).toEqual(['1-2']);
    expect(graph.measurableIndices.length + graph.shortTextUnresolvedCount).toBe(3);
  });
});

describe('2D-A3 R22 §15-§18: structural proof refuses a malformed graph', () => {
  const slot = r21Slot([words('a', 8), words('a', 8).toUpperCase(), 'x y', words('c', 8)]);
  const graph = measureUnboundSlotSd7Graph(
    slot,
    documentTextLookupForUnboundSlotAssembly(slot),
  ).graph;

  function mutated(change: Partial<NearDuplicateGraphMeasurement>): NearDuplicateGraphMeasurement {
    return { ...graph, ...change };
  }

  it('accepts the canonical graph itself', () => {
    expect(() => requireCanonicalGraphStructure(slot, graph)).not.toThrow();
    expect(graph.comparedPairCount).toBe(3);
  });

  it('refuses a missing, extra or reordered document', () => {
    const [d0, d1, d2, d3] = graph.documents;
    for (const documents of [
      [d0!, d1!, d2!],
      [d0!, d1!, d2!, d3!, d3!],
      [d1!, d0!, d2!, d3!],
    ]) {
      expect(refusalCode(() => requireCanonicalGraphStructure(slot, mutated({ documents })))).toBe(
        'R22_GRAPH_COVERAGE_MISMATCH',
      );
    }
  });

  it('refuses a broken measurable / short-text partition', () => {
    const lying = graph.documents.map((d, i) => (i === 2 ? { ...d, measurable: true } : d));
    expect(
      refusalCode(() => requireCanonicalGraphStructure(slot, mutated({ documents: lying }))),
    ).toBe('R22_GRAPH_PARTITION_INVALID');
    expect(
      refusalCode(() =>
        requireCanonicalGraphStructure(slot, mutated({ shortTextUnresolvedCount: 0 })),
      ),
    ).toBe('R22_GRAPH_PARTITION_INVALID');
  });

  it('refuses a compared-pair count other than m(m-1)/2', () => {
    expect(
      refusalCode(() => requireCanonicalGraphStructure(slot, mutated({ comparedPairCount: 2 }))),
    ).toBe('R22_COMPARED_PAIR_COUNT_INVALID');
  });

  it('refuses reversed, duplicate, short-text or below-threshold edges', () => {
    const edge = graph.edges[0]!;
    const bad = [
      [{ ...edge, aIndex: edge.bIndex, bIndex: edge.aIndex }],
      [edge, edge],
      [{ ...edge, bIndex: 2 }],
      [{ ...edge, measurement: { ...edge.measurement, atOrAboveThreshold: false } }],
      [{ ...edge, measurement: { ...edge.measurement, unionSize: 0 } }],
      [{ ...edge, aIndex: 0.5 }],
    ];
    for (const edges of bad) {
      expect(refusalCode(() => requireCanonicalGraphStructure(slot, mutated({ edges })))).toBe(
        'R22_GRAPH_EDGE_STRUCTURE_INVALID',
      );
    }
  });
});

describe('2D-A3 R22 §7/§28: nothing but an actual R21 mint can mint', () => {
  const slot = r21Slot([words('a', 6)]);
  const unbound = measureUnboundSlotSd7Graph(slot, documentTextLookupForUnboundSlotAssembly(slot));

  it('refuses a literal, a clone-shaped batch, an unbound R21 slot and undefined', () => {
    const literal = {
      kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_BATCH_V1',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      split: 'DEV_TRAIN',
      governanceSnapshot: {},
      items: [slot],
    };
    for (const value of [
      literal,
      { ...literal },
      JSON.parse(JSON.stringify(literal)),
      slot,
      undefined,
    ]) {
      expect(refusalCode(() => bindDevTrainSd7GraphBatch(value))).toBe(
        'R22_DOCUMENT_SOURCE_AUTHORITY_NOT_MINTED_BY_R21',
      );
    }
  });

  it('never treats an unbound graph preparation as minted', () => {
    expect(isA3DevTrainSlotSd7GraphMeasurement(unbound)).toBe(false);
    const relabelled = { ...unbound, kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_V1' };
    expect(isA3DevTrainSlotSd7GraphMeasurement(relabelled)).toBe(false);
    expect(isA3DevTrainSd7GraphBatch({ items: [unbound] })).toBe(false);
    expect(documentSourceAssemblyForSlotGraph(unbound)).toBeUndefined();
    expect(slotGraphForDocumentSourceAssembly(slot)).toBeUndefined();
    expect(governanceSnapshotForGraphBatch({ items: [unbound] })).toBeUndefined();
  });

  it('derives no census from an unminted batch', () => {
    expect(
      refusalCode(() =>
        deriveR22PublicGraphMeasurementCensus({ items: [unbound] } as never, {
          r21Tip: 'x',
          implementationCommit: 'y',
        }),
      ),
    ).toBe('R22_BATCH_COMPOSITION_INVALID');
  });
});

describe('2D-A3 R22 §37: the R21 drift cross-check compares aggregates only', () => {
  const fresh = {
    assembly: { slotLocalDistinctDocumentCount: 156, exactDuplicateGroupCount: 3 },
    extractionSupport: { textDivergenceGroupCount: 0 },
    scorePreparation: { r10ScorePreparationCount: 156 },
    semantics: { nearDuplicateGraphMeasured: false },
    access: { r21SqlStatements: 0 },
    implementationCommit: 'fresh',
  } as unknown as R21PublicDocumentSourceCensus;

  it('reports no drift for equal aggregates, whatever the provenance commits', () => {
    expect(r21AggregateDriftPaths(fresh, { ...fresh, implementationCommit: 'historical' })).toEqual(
      [],
    );
  });

  it('names the differing field path, never its value', () => {
    const paths = r21AggregateDriftPaths(fresh, {
      ...fresh,
      assembly: { slotLocalDistinctDocumentCount: 155, exactDuplicateGroupCount: 3 },
      semantics: { nearDuplicateGraphMeasured: true },
    });
    expect(paths).toEqual([
      'assembly.slotLocalDistinctDocumentCount',
      'semantics.nearDuplicateGraphMeasured',
    ]);
  });

  it('treats a missing committed section as drift of that whole section', () => {
    expect(r21AggregateDriftPaths(fresh, {})).toEqual([
      'assembly',
      'extractionSupport',
      'scorePreparation',
      'semantics',
      'access',
    ]);
  });
});

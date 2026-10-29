/**
 * PHASE 2B-2D A3 R28 — THE INCREMENTAL DELTA PATH AROUND R22'S PURE GRAPH MEASUREMENT.
 *
 * Proves, without a database:
 *
 *   - every delta request reaches R22's real `measureUnboundSlotSd7Graph`
 *     exactly once, all-or-nothing, and the graph it returns is kept by
 *     reference;
 *   - threshold, normalisation and short-text behaviour hold THROUGH the
 *     delta path - never by re-implementing SD7 here;
 *   - nothing but an actual R27 mint can mint, and neither R22 V1 minting nor
 *     R21's historical text accessor is ever reached;
 *   - the R27 drift, R22 historical-baseline and committed-A2 aggregate
 *     cross-checks;
 *   - the stated SD7 constants equal the canonical SD7 contract.
 *
 * Synthetic slots are NOT minted and cannot be: an R27 slot exists only
 * behind a real R26 mint of a real run. The minted route is exercised by the
 * real V1 -> V2 -> R26 -> R27 -> R28 chain, whose results the audit records.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type * as R22MeasureModule from '../harness/phase2b2d/a3graphs/measure.js';
import type * as R22DevTrainModule from '../harness/phase2b2d/a3graphs/devTrain.js';
import type * as R21DevTrainModule from '../harness/phase2b2d/a3documents/devTrain.js';

const calls = vi.hoisted(() => ({ measure: 0, r22Mint: 0, r21Lookup: 0 }));

vi.mock('../harness/phase2b2d/a3graphs/measure.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R22MeasureModule>();
  return {
    ...actual,
    measureUnboundSlotSd7Graph: (...args: Parameters<typeof actual.measureUnboundSlotSd7Graph>) => {
      calls.measure += 1;
      return actual.measureUnboundSlotSd7Graph(...args);
    },
  };
});

vi.mock('../harness/phase2b2d/a3graphs/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R22DevTrainModule>();
  return {
    ...actual,
    bindDevTrainSd7GraphBatch: (...args: Parameters<typeof actual.bindDevTrainSd7GraphBatch>) => {
      calls.r22Mint += 1;
      return actual.bindDevTrainSd7GraphBatch(...args);
    },
  };
});

vi.mock('../harness/phase2b2d/a3documents/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R21DevTrainModule>();
  return {
    ...actual,
    documentTextLookupForSlotAssembly: (
      ...args: Parameters<typeof actual.documentTextLookupForSlotAssembly>
    ) => {
      calls.r21Lookup += 1;
      return actual.documentTextLookupForSlotAssembly(...args);
    },
  };
});

const { assembleUnboundSlotDocumentSources, documentTextLookupForUnboundSlotAssembly } =
  await import('../harness/phase2b2d/a3documents/assemble.js');
const { A3GraphRefusal } = await import('../harness/phase2b2d/a3graphs/refusal.js');
const { measureDeltaSlotGraphsAllOrNothing } =
  await import('../harness/phase2b2d/a3graphsV2/measureDelta.js');
const {
  bindDevTrainSd7GraphDeltaBatchV2,
  deltaGraphForDocumentSourceDeltaSlot,
  documentSourceDeltaBatchForGraphDeltaBatch,
  documentSourceDeltaSlotForDeltaGraph,
  graphDeltaBatchForDocumentSourceDeltaBatch,
  isA3DevTrainSd7GraphDeltaBatchV2,
  isA3DevTrainSlotSd7GraphMeasurementDeltaV2,
} = await import('../harness/phase2b2d/a3graphsV2/devTrain.js');
const {
  R28_EXPECTED_R22_HISTORICAL_BASELINE,
  requireNoR27DeltaDrift,
  requireR22HistoricalBaseline,
  r27DeltaDriftPaths,
} = await import('../harness/phase2b2d/a3graphsV2/r27Drift.js');
const { a2AggregateConsistencyProofForGraphDeltaBatch, requireA2Sd7AggregateConsistency } =
  await import('../harness/phase2b2d/a3graphsV2/a2Consistency.js');
const {
  R28_STATED_CANONICAL_SD7,
  deriveCanonicalSd7GraphCoverageExpansionV2,
  deriveR28PublicIncrementalSd7GraphCensus,
} = await import('../harness/phase2b2d/a3graphsV2/census.js');
const { A3GraphV2Refusal } = await import('../harness/phase2b2d/a3graphsV2/refusal.js');
const sd7 = await import('../harness/phase2b2d/sd7/sd7Contract.js');

import type {
  UnboundA3SlotDocumentSourceAssembly,
  UnboundSlotCandidateSourceRow,
  UnboundSlotPageSourceRow,
} from '../harness/phase2b2d/a3documents/types.js';
import type { NearDuplicateGraphMeasurement } from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';
import type { R27PublicIncrementalDocumentSourceCensus } from '../harness/phase2b2d/a3documentsV2/census.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const R22_CENSUS =
  'docs/evaluation/PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_CENSUS_V1.json';
const R27_CENSUS =
  'docs/evaluation/PHASE_2B_2D_A3_R27_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json';
const V2 = 'orgunit-extraction-v2';
const SIGNAL = 'orgunit-signal-rules-v1';

function sha(n: number): string {
  return n.toString(16).padStart(64, '0');
}

function words(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i)}`).join(' ');
}

/** One plain (unminted) slot whose exact documents carry exactly these texts, in order. */
function plainSlot(
  texts: readonly string[],
  selectionIndex = 7,
): UnboundA3SlotDocumentSourceAssembly {
  const pages: UnboundSlotPageSourceRow[] = texts.map((mainText, i) => ({
    pageEvidenceId: `d-${String(i)}`,
    documentSha256: sha(i + 1),
    extractionRuleVersion: V2,
    mainText,
  }));
  const candidates: UnboundSlotCandidateSourceRow[] = pages.flatMap((p) =>
    (['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE'] as const).map((track) => ({
      pageEvidenceId: p.pageEvidenceId,
      documentSha256: p.documentSha256,
      track,
      candidateScore: '0.0000',
      ruleVersion: SIGNAL,
    })),
  );
  return assembleUnboundSlotDocumentSources({
    selectionIndex,
    split: 'DEV_TRAIN',
    pageEvidence: pages,
    candidates,
  });
}

function requestFor(slot: UnboundA3SlotDocumentSourceAssembly) {
  return { slot, textLookup: documentTextLookupForUnboundSlotAssembly(slot) };
}

/** Through the R28 delta path, one slot. */
function measure(texts: readonly string[]): NearDuplicateGraphMeasurement {
  const [unbound] = measureDeltaSlotGraphsAllOrNothing([requestFor(plainSlot(texts))]);
  return unbound!.graph;
}

function edgePairs(graph: NearDuplicateGraphMeasurement): string[] {
  return graph.edges.map((edge) => `${String(edge.aIndex)}-${String(edge.bIndex)}`);
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof A3GraphV2Refusal || error instanceof A3GraphRefusal) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

// ---------------------------------------------------------------------------
// A. THE DELTA PATH.
// ---------------------------------------------------------------------------

describe('2D-A3 R28 §15 / §36: one R22 call per delta request, graph kept by reference', () => {
  it('measures an all-measurable slot with one canonical edge', () => {
    const texts = [words('t', 14), words('t', 13), words('z', 9), words('y', 6)];
    const before = calls.measure;
    const [unbound] = measureDeltaSlotGraphsAllOrNothing([requestFor(plainSlot(texts))]);
    expect(calls.measure).toBe(before + 1);
    const graph = unbound!.graph;
    expect(graph.documents).toHaveLength(4);
    expect(graph.measurableIndices).toEqual([0, 1, 2, 3]);
    expect(graph.shortTextUnresolvedCount).toBe(0);
    expect(graph.comparedPairCount).toBe(6);
    expect(edgePairs(graph)).toEqual(['0-1']);
    expect(Object.isFrozen(graph)).toBe(true);
    expect(unbound!.kind).toBe('UNBOUND_A3_SLOT_SD7_GRAPH_PREPARATION');
  });

  it('covers every document of its slot, in order, with no extra and no reorder', () => {
    const slot = plainSlot([words('a', 6), words('b', 6), words('c', 6)]);
    const [unbound] = measureDeltaSlotGraphsAllOrNothing([requestFor(slot)]);
    expect(unbound!.graph.documents.map((d) => d.documentSha256)).toEqual(
      slot.documents.map((entry) => entry.document.documentSha256),
    );
    expect(unbound!.selectionIndex).toBe(slot.selectionIndex);
  });

  it('asks the lookup once per document and places no text on the result', () => {
    const slot = plainSlot([words('q', 30), words('r', 30)]);
    const lookup = documentTextLookupForUnboundSlotAssembly(slot);
    const asked: string[] = [];
    const [unbound] = measureDeltaSlotGraphsAllOrNothing([
      {
        slot,
        textLookup: (digest: string) => {
          asked.push(digest);
          return lookup(digest);
        },
      },
    ]);
    expect(asked).toEqual([sha(1), sha(2)]);
    expect(JSON.stringify(unbound)).not.toContain(words('q', 30));
  });

  it('is all-or-nothing: a refusal on the second request returns nothing for the first', () => {
    const good = requestFor(plainSlot([words('g', 8)]));
    const before = calls.measure;
    expect(codeOf(() => measureDeltaSlotGraphsAllOrNothing([good, { slot: {} } as never]))).toBe(
      'R28_DELTA_REQUEST_SHAPE_INVALID',
    );
    expect(calls.measure).toBe(before + 1);
    expect(
      codeOf(() =>
        measureDeltaSlotGraphsAllOrNothing([
          good,
          {
            slot: { selectionIndex: 1, split: 'DEV_CONFIRM', documents: [] },
            textLookup: () => '',
          },
        ] as never),
      ),
    ).toBe('R22_SPLIT_NOT_SUPPORTED');
  });

  it("propagates R22's own refusals unchanged", () => {
    expect(
      codeOf(() =>
        measureDeltaSlotGraphsAllOrNothing([
          { slot: { selectionIndex: 1, split: 'DEV_TRAIN', documents: [] }, textLookup: () => '' },
        ]),
      ),
    ).toBe('R22_SLOT_HAS_NO_DOCUMENTS');
  });

  it('measures two organisations with identical texts independently: no cross-slot pair', () => {
    const texts = [words('s', 10), words('s', 10).toUpperCase()];
    const graphs = measureDeltaSlotGraphsAllOrNothing([
      requestFor(plainSlot(texts, 1)),
      requestFor(plainSlot(texts, 2)),
    ]);
    for (const unbound of graphs) {
      expect(unbound.graph.documents).toHaveLength(2);
      expect(unbound.graph.comparedPairCount).toBe(1);
      expect(edgePairs(unbound.graph)).toEqual(['0-1']);
    }
  });
});

describe('2D-A3 R28 §38: the 9/10 threshold, through the canonical path', () => {
  const a = words('t', 14); // 10 shingles

  it('below: 8 of 10 shingles shared is not an edge', () => {
    expect(measure([a, words('t', 12)]).edges).toEqual([]);
  });

  it('exactly 9/10 IS an edge', () => {
    const graph = measure([a, words('t', 13)]);
    expect(edgePairs(graph)).toEqual(['0-1']);
    expect(graph.edges[0]!.measurement.atOrAboveThreshold).toBe(true);
  });

  it('above: 15 of 16 shingles shared is an edge', () => {
    expect(edgePairs(measure([words('u', 20), words('u', 19)]))).toEqual(['0-1']);
  });
});

describe('2D-A3 R28 §39: canonical normalisation, owned by SD7 not R28', () => {
  const five = 'the international office of paris';
  it('case normalises', () =>
    expect(edgePairs(measure([five, five.toUpperCase()]))).toEqual(['0-1']));
  it('whitespace normalises', () =>
    expect(edgePairs(measure([five, ` the\t international\n office   of paris `]))).toEqual([
      '0-1',
    ]));
  it('punctuation remains', () =>
    expect(measure([five, 'the international office of paris.']).edges).toEqual([]));
  it('accents remain', () =>
    expect(
      measure([
        'le bureau des relations internationales',
        'le bureau dés relations internationales',
      ]).edges,
    ).toEqual([]));
  it('no Unicode normalisation', () =>
    expect(
      measure(['le centre de langues université', 'le centre de langues université']).edges,
    ).toEqual([]));
  it('no stemming', () =>
    expect(measure([five, 'the international offices of paris']).edges).toEqual([]));
});

describe('2D-A3 R28 §37: short text stays unresolved', () => {
  it('a 4-token document is unmeasurable and unresolved; a 5-token document is measurable', () => {
    const graph = measure(['one two three four', 'one two three four five']);
    expect(graph.documents[0]).toMatchObject({ measurable: false, tokenCount: 4, shingleCount: 0 });
    expect(graph.documents[1]).toMatchObject({ measurable: true, tokenCount: 5, shingleCount: 1 });
    expect(graph.shortTextUnresolvedCount).toBe(1);
    expect(graph.measurableIndices).toEqual([1]);
    expect(graph.comparedPairCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// B. MINTING AUTHORITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R28 §10 / §40: nothing but an actual R27 mint can mint', () => {
  const unbound = plainSlot([words('m', 8)], 0);
  const r27SlotLiteral = {
    kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V2',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    selectionIndex: 0,
    split: 'DEV_TRAIN',
    exactDuplicate: unbound.exactDuplicate,
    documents: unbound.documents,
    candidateObservationCount: unbound.candidateObservationCount,
  };
  const r26Batch = {
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V2',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV2: {},
    items: [],
    coverage: {
      changedExistingCount: 0,
      removedCount: 0,
      legacyAuthorityEvidenceRequests: 0,
      unchangedCanonicalCoverageCount: 5,
      newlyBoundDeltaCount: 1,
      v2ReadyAuthorityCount: 6,
    },
  };
  const fabricatedR27Batch = {
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V2',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV2: {},
    evidenceDeltaBatch: r26Batch,
    items: [r27SlotLiteral],
  };
  const historicalR21Slot = {
    ...r27SlotLiteral,
    kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_V1',
  };
  const historicalR21Batch = {
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_BATCH_V1',
    split: 'DEV_TRAIN',
    governanceSnapshot: {},
    items: [historicalR21Slot],
  };
  const cases: Record<string, unknown> = {
    'a literal R27 slot': r27SlotLiteral,
    'a spread clone of the slot': { ...r27SlotLiteral },
    'a structuredClone of the slot': structuredClone(r27SlotLiteral),
    'a JSON round-trip of the slot': JSON.parse(JSON.stringify(r27SlotLiteral)),
    'a fabricated R27 delta batch': fabricatedR27Batch,
    'a spread clone of the fabricated batch': { ...fabricatedR27Batch },
    'a structuredClone of the fabricated batch': structuredClone(fabricatedR27Batch),
    'a JSON round-trip of the fabricated batch': JSON.parse(JSON.stringify(fabricatedR27Batch)),
    'a historical R21 slot': historicalR21Slot,
    'a historical R21 batch': historicalR21Batch,
    'an R26 evidence batch': r26Batch,
    'an unbound R21 assembly': unbound,
    undefined: undefined,
  };
  for (const [name, value] of Object.entries(cases)) {
    it(`refuses ${name}, before any measurement`, () => {
      const before = calls.measure;
      expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV2(value))).toBe(
        'R28_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R27',
      );
      expect(calls.measure).toBe(before);
    });
  }

  it('resolves no provenance for anything it did not mint', () => {
    expect(isA3DevTrainSlotSd7GraphMeasurementDeltaV2({ ...r27SlotLiteral, graph: {} })).toBe(
      false,
    );
    expect(isA3DevTrainSd7GraphDeltaBatchV2(fabricatedR27Batch)).toBe(false);
    expect(documentSourceDeltaSlotForDeltaGraph(r27SlotLiteral)).toBeUndefined();
    expect(deltaGraphForDocumentSourceDeltaSlot(r27SlotLiteral)).toBeUndefined();
    expect(documentSourceDeltaBatchForGraphDeltaBatch(fabricatedR27Batch)).toBeUndefined();
    expect(graphDeltaBatchForDocumentSourceDeltaBatch(fabricatedR27Batch)).toBeUndefined();
    expect(a2AggregateConsistencyProofForGraphDeltaBatch(fabricatedR27Batch)).toBeUndefined();
  });

  it('derives no coverage, census or A2 proof from an unminted batch', () => {
    const baseline = requireR22HistoricalBaseline(
      JSON.parse(readFileSync(join(REPO_ROOT, R22_CENSUS), 'utf8')),
    );
    expect(
      codeOf(() =>
        deriveCanonicalSd7GraphCoverageExpansionV2(fabricatedR27Batch as never, baseline),
      ),
    ).toBe('R28_NOT_A_MINTED_DELTA_GRAPH_BATCH');
    expect(
      codeOf(() =>
        deriveR28PublicIncrementalSd7GraphCensus(fabricatedR27Batch as never, baseline, {
          r27Tip: 'x',
          implementationCommit: 'y',
        }),
      ),
    ).toBe('R28_NOT_A_MINTED_DELTA_GRAPH_BATCH');
    expect(
      codeOf(() =>
        requireA2Sd7AggregateConsistency(fabricatedR27Batch as never, {
          binding: { path: 'p', sha256: 's', commit: 'c' },
          record: { items: [] },
        }),
      ),
    ).toBe('R28_NOT_A_MINTED_DELTA_GRAPH_BATCH');
  });
});

// ---------------------------------------------------------------------------
// C. CROSS-CHECKS.
// ---------------------------------------------------------------------------

describe('2D-A3 R28 §44: the R27 delta drift cross-check', () => {
  const committed = JSON.parse(readFileSync(join(REPO_ROOT, R27_CENSUS), 'utf8')) as Record<
    string,
    unknown
  >;
  const asFresh = (value: unknown) => value as R27PublicIncrementalDocumentSourceCensus;

  it('reports no drift for the committed aggregates, whatever the provenance commits', () => {
    const fresh = { ...structuredClone(committed), implementationCommit: 'f'.repeat(40) };
    expect(r27DeltaDriftPaths(asFresh(fresh), committed)).toEqual([]);
    expect(() => requireNoR27DeltaDrift(asFresh(fresh), committed)).not.toThrow();
  });

  it('names the differing path and STOPS on aggregate drift', () => {
    const fresh = structuredClone(committed);
    (fresh['deltaAssembly'] as Record<string, number>)['deltaSlotLocalDistinctDocuments'] = 34;
    expect(r27DeltaDriftPaths(asFresh(fresh), committed)).toEqual([
      'deltaAssembly.deltaSlotLocalDistinctDocuments',
    ]);
    expect(codeOf(() => requireNoR27DeltaDrift(asFresh(fresh), committed))).toBe(
      'STOP_R28_CANONICAL_R27_DOCUMENT_DELTA_DRIFT_REQUIRES_REVIEW',
    );
  });

  it('STOPS when fresh and committed agree but leave the R27 checkpoint', () => {
    const moved = structuredClone(committed);
    (moved['coverage'] as Record<string, number>)['coverageSlotLocalDocuments'] = 190;
    expect(codeOf(() => requireNoR27DeltaDrift(asFresh(moved), moved))).toBe(
      'STOP_R28_CANONICAL_R27_DOCUMENT_DELTA_DRIFT_REQUIRES_REVIEW',
    );
  });
});

describe('2D-A3 R28 §30: the historical R22 baseline is read as aggregates only', () => {
  const committed = JSON.parse(readFileSync(join(REPO_ROOT, R22_CENSUS), 'utf8')) as Record<
    string,
    unknown
  >;

  it('states 5 graphs / 156 docs / 155 measurable / 1 short / 2338 pairs / 41 edges / 19', () => {
    expect(requireR22HistoricalBaseline(committed)).toEqual({
      slotGraphs: 5,
      documents: 156,
      measurableDocuments: 155,
      shortTextUnresolved: 1,
      comparedPairs: 2338,
      nearDuplicateEdges: 41,
      documentsInAtLeastOneEdge: 19,
    });
  });

  it('STOPS when the committed baseline no longer states the canonical history', () => {
    const moved = structuredClone(committed);
    (moved['measurement'] as Record<string, number>)['comparedPairCount'] = 2339;
    expect(codeOf(() => requireR22HistoricalBaseline(moved))).toBe(
      'STOP_R28_HISTORICAL_R22_BASELINE_DRIFT_REQUIRES_REVIEW',
    );
  });

  it('§32: the combined pair count is a per-slot sum, never a global n(n-1)/2', () => {
    const combined =
      R28_EXPECTED_R22_HISTORICAL_BASELINE['measurement.comparedPairCount'] + (35 * 34) / 2;
    expect(combined).toBe(2933);
    expect(combined).not.toBe((190 * 189) / 2);
  });
});

describe('2D-A3 R28: the stated SD7 constants are the canonical contract', () => {
  it('equals sd7Contract and the committed R22 census', () => {
    expect(R28_STATED_CANONICAL_SD7.shingleSizeTokens).toBe(sd7.NEAR_DUPLICATE_SHINGLE_SIZE);
    expect(R28_STATED_CANONICAL_SD7.jaccardThresholdNumerator).toBe(
      sd7.NEAR_DUPLICATE_JACCARD_THRESHOLD_NUMERATOR,
    );
    expect(R28_STATED_CANONICAL_SD7.jaccardThresholdDenominator).toBe(
      sd7.NEAR_DUPLICATE_JACCARD_THRESHOLD_DENOMINATOR,
    );
    expect(R28_STATED_CANONICAL_SD7.comparisonScope).toBe(sd7.NEAR_DUPLICATE_COMPARISON_SCOPE);
    expect(R28_STATED_CANONICAL_SD7.shortTextStatus).toBe(sd7.SD7_SHORT_TEXT_UNRESOLVED);
    const r22 = JSON.parse(readFileSync(join(REPO_ROOT, R22_CENSUS), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(r22['canonicalSd7']).toEqual({ ...R28_STATED_CANONICAL_SD7 });
  });
});

// ---------------------------------------------------------------------------
// D. §41 / §51: NO HISTORICAL REMEASUREMENT, AT RUNTIME.
// ---------------------------------------------------------------------------

describe("2D-A3 R28: R22 V1 minting and R21's historical text accessor were never reached", () => {
  it('counted zero calls across every test in this file', () => {
    expect(calls.r22Mint).toBe(0);
    expect(calls.r21Lookup).toBe(0);
    expect(calls.measure).toBeGreaterThan(0);
  });
});

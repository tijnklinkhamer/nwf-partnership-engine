/**
 * PHASE 2B-2D A3 R35 — THE V4 INCREMENTAL DELTA PATH AROUND R22'S PURE GRAPH MEASUREMENT.
 *
 * Proves, without a database:
 *
 *   - the V4 delta R35 measures is exactly R33 / R34's seven new DEV_TRAIN
 *     authorities (internally 34, 39, 44, 49, 56, 61, 71), derived purely from
 *     the committed V3 / V4 snapshots;
 *   - every delta request reaches R22's real `measureUnboundSlotSd7Graph`
 *     exactly once, one slot per call, all-or-nothing, and the graph it
 *     returns is kept by reference;
 *   - empty / short text, the 9/10 threshold and canonical normalisation hold
 *     THROUGH the delta path - never by re-implementing SD7 here;
 *   - two organisations with identical text stay two graphs with zero
 *     cross-slot pairs, and the aggregate pair count is a per-slot sum;
 *   - nothing but an actual R34 mint can mint - with zero R22 calls for any
 *     rejected input - and R22 V1 / R28 V2 minting and the R21 / R27 text
 *     accessors are never reached;
 *   - the fresh-R34 reproduction comparison, the committed R22 + R28 six-slot
 *     graph baseline and the stated SD7 constants.
 *
 * Synthetic slots are NOT minted and cannot be here: an R34 slot exists only
 * behind a real R33 mint of a real run. The minted route is exercised by the
 * binder suite (against stand-in R34 brands) and by the real
 * V3/V4 -> R33 -> R34 -> R35 chain, whose results the audit records.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type * as R22MeasureModule from '../harness/phase2b2d/a3graphs/measure.js';
import type * as R22DevTrainModule from '../harness/phase2b2d/a3graphs/devTrain.js';
import type * as R28DevTrainModule from '../harness/phase2b2d/a3graphsV2/devTrain.js';
import type * as R21DevTrainModule from '../harness/phase2b2d/a3documents/devTrain.js';
import type * as R27DevTrainModule from '../harness/phase2b2d/a3documentsV2/devTrain.js';

const calls = vi.hoisted(() => ({
  measure: 0,
  r22Mint: 0,
  r28Mint: 0,
  r21Lookup: 0,
  r27Lookup: 0,
}));

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

vi.mock('../harness/phase2b2d/a3graphsV2/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R28DevTrainModule>();
  return {
    ...actual,
    bindDevTrainSd7GraphDeltaBatchV2: (
      ...args: Parameters<typeof actual.bindDevTrainSd7GraphDeltaBatchV2>
    ) => {
      calls.r28Mint += 1;
      return actual.bindDevTrainSd7GraphDeltaBatchV2(...args);
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

vi.mock('../harness/phase2b2d/a3documentsV2/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R27DevTrainModule>();
  return {
    ...actual,
    documentTextLookupForDeltaSlotAssembly: (
      ...args: Parameters<typeof actual.documentTextLookupForDeltaSlotAssembly>
    ) => {
      calls.r27Lookup += 1;
      return actual.documentTextLookupForDeltaSlotAssembly(...args);
    },
  };
});

const { assembleUnboundSlotDocumentSources, documentTextLookupForUnboundSlotAssembly } =
  await import('../harness/phase2b2d/a3documents/assemble.js');
const { A3GraphRefusal } = await import('../harness/phase2b2d/a3graphs/refusal.js');
const { loadCommittedA2GovernanceV3 } =
  await import('../harness/phase2b2d/a3governanceV3/snapshotV3.js');
const { loadCommittedA2GovernanceV4 } =
  await import('../harness/phase2b2d/a3governanceV4/snapshotV4.js');
const { deriveDevTrainEvidenceDeltaV4 } =
  await import('../harness/phase2b2d/a3evidenceV4/authorityDelta.js');
const { measureDeltaSlotGraphsAllOrNothingV4 } =
  await import('../harness/phase2b2d/a3graphsV4/measureDelta.js');
const {
  bindDevTrainSd7GraphDeltaBatchV4,
  deltaGraphForDocumentSourceDeltaSlotV4,
  documentSourceDeltaBatchForGraphDeltaBatchV4,
  documentSourceDeltaSlotForDeltaGraphV4,
  graphDeltaBatchForDocumentSourceDeltaBatchV4,
  isA3DevTrainSd7GraphDeltaBatchV4,
  isA3DevTrainSlotSd7GraphMeasurementDeltaV4,
} = await import('../harness/phase2b2d/a3graphsV4/devTrain.js');
const {
  R35_EXPECTED_R34_CHECKPOINT,
  r34ReproductionDriftPaths,
  r34ReproductionProofForBatch,
  requireFreshR34Reproduction,
  requireHistoricalGraphBaseline,
  requireHistoricalGraphBaselineProof,
} = await import('../harness/phase2b2d/a3graphsV4/r34Drift.js');
const {
  R35_STATED_CANONICAL_SD7,
  deriveCanonicalSd7GraphCoverageExpansionV4,
  deriveR35PublicIncrementalSd7GraphCensus,
} = await import('../harness/phase2b2d/a3graphsV4/census.js');
const { A3GraphV4Refusal } = await import('../harness/phase2b2d/a3graphsV4/refusal.js');
const sd7 = await import('../harness/phase2b2d/sd7/sd7Contract.js');

import type {
  UnboundA3SlotDocumentSourceAssembly,
  UnboundSlotCandidateSourceRow,
  UnboundSlotPageSourceRow,
} from '../harness/phase2b2d/a3documents/types.js';
import type { NearDuplicateGraphMeasurement } from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';
import type { R34PublicIncrementalDocumentSourceCensus } from '../harness/phase2b2d/a3documentsV4/census.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const E = 'docs/evaluation';
const R22_CENSUS = `${E}/PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_CENSUS_V1.json`;
const R28_CENSUS = `${E}/PHASE_2B_2D_A3_R28_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1.json`;
const R33_CENSUS = `${E}/PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json`;
const R34_CENSUS = `${E}/PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json`;
const V2 = 'orgunit-extraction-v2';
const SIGNAL = 'orgunit-signal-rules-v1';

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as Record<string, unknown>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

/** Through the R35 delta path, one slot. */
function measure(texts: readonly string[]): NearDuplicateGraphMeasurement {
  const [unbound] = measureDeltaSlotGraphsAllOrNothingV4([requestFor(plainSlot(texts))]);
  return unbound!.graph;
}

function edgePairs(graph: NearDuplicateGraphMeasurement): string[] {
  return graph.edges.map((edge) => `${String(edge.aIndex)}-${String(edge.bIndex)}`);
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof A3GraphV4Refusal || error instanceof A3GraphRefusal) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

// ---------------------------------------------------------------------------
// 0. THE DELTA R35 MEASURES.
// ---------------------------------------------------------------------------

describe('2D-A3 R35: the V4 delta is exactly the seven new DEV_TRAIN authorities', () => {
  const delta = deriveDevTrainEvidenceDeltaV4(
    loadCommittedA2GovernanceV3(REPO_ROOT),
    loadCommittedA2GovernanceV4(REPO_ROOT),
  );

  it('is 6 unchanged (history) + 7 new = 13', () => {
    expect(delta.unchanged).toHaveLength(6);
    expect(delta.newAuthorities).toHaveLength(7);
    expect(delta.v2ReadyCount).toBe(13);
  });

  it('internally, the new selection indices are 34, 39, 44, 49, 56, 61, 71', () => {
    expect(delta.newAuthorities.map((entry) => entry.v2.selectionIndex)).toEqual([
      34, 39, 44, 49, 56, 61, 71,
    ]);
    expect(delta.unchanged.map((entry) => entry.v2.selectionIndex)).toEqual([0, 5, 12, 17, 22, 27]);
  });
});

// ---------------------------------------------------------------------------
// A. THE DELTA PATH.
// ---------------------------------------------------------------------------

describe('2D-A3 R35 §14: one R22 call per delta request, graph kept by reference', () => {
  it('measures an all-measurable slot with one canonical edge', () => {
    const texts = [words('t', 14), words('t', 13), words('z', 9), words('y', 6)];
    const before = calls.measure;
    const [unbound] = measureDeltaSlotGraphsAllOrNothingV4([requestFor(plainSlot(texts))]);
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

  it('seven requests -> exactly seven R22 calls, in order, one slot each', () => {
    const before = calls.measure;
    const indices = [900, 901, 902, 903, 904, 905, 906];
    const result = measureDeltaSlotGraphsAllOrNothingV4(
      indices.map((index) => requestFor(plainSlot([words('w', 8), words('v', 8)], index))),
    );
    expect(calls.measure - before).toBe(7);
    expect(result.map((unbound) => unbound.selectionIndex)).toEqual(indices);
    expect(result.every((unbound) => unbound.graph.documents.length === 2)).toBe(true);
  });

  it('covers every document of its slot exactly once, in order, with no extra and no reorder', () => {
    const slot = plainSlot([words('a', 6), words('b', 6), words('c', 6)]);
    const [unbound] = measureDeltaSlotGraphsAllOrNothingV4([requestFor(slot)]);
    expect(unbound!.graph.documents.map((d) => d.documentSha256)).toEqual(
      slot.documents.map((entry) => entry.document.documentSha256),
    );
    expect(unbound!.selectionIndex).toBe(slot.selectionIndex);
  });

  it('asks the lookup once per document and places no text on the result', () => {
    const slot = plainSlot([words('q', 30), words('r', 30)]);
    const lookup = documentTextLookupForUnboundSlotAssembly(slot);
    const asked: string[] = [];
    const [unbound] = measureDeltaSlotGraphsAllOrNothingV4([
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

  it('a malformed LAST request refuses before R22 is called for ANY request', () => {
    const good = requestFor(plainSlot([words('g', 8)]));
    const before = calls.measure;
    expect(
      codeOf(() => measureDeltaSlotGraphsAllOrNothingV4([good, good, good, { slot: {} } as never])),
    ).toBe('R35_DELTA_REQUEST_SHAPE_INVALID');
    expect(calls.measure).toBe(before);
  });

  it("is all-or-nothing: R22's refusal on the last request returns nothing for the first", () => {
    const good = requestFor(plainSlot([words('g', 8)]));
    let result: unknown = 'untouched';
    const before = calls.measure;
    expect(
      codeOf(() => {
        result = measureDeltaSlotGraphsAllOrNothingV4([
          good,
          {
            slot: { selectionIndex: 1, split: 'DEV_CONFIRM', documents: [] },
            textLookup: () => '',
          },
        ]);
      }),
    ).toBe('R22_SPLIT_NOT_SUPPORTED');
    expect(result).toBe('untouched');
    expect(calls.measure).toBe(before + 2);
  });

  it("propagates R22's own refusals unchanged", () => {
    expect(
      codeOf(() =>
        measureDeltaSlotGraphsAllOrNothingV4([
          { slot: { selectionIndex: 1, split: 'DEV_TRAIN', documents: [] }, textLookup: () => '' },
        ]),
      ),
    ).toBe('R22_SLOT_HAS_NO_DOCUMENTS');
    const slot = plainSlot([words('k', 8), words('l', 8)]);
    expect(
      codeOf(() =>
        measureDeltaSlotGraphsAllOrNothingV4([
          {
            slot,
            textLookup: () => {
              throw new Error('lookup refused');
            },
          },
        ]),
      ),
    ).toBe('R22_CANONICAL_MEASUREMENT_STOPPED');
  });

  it('measures two organisations with identical texts independently: no cross-slot pair', () => {
    const texts = [words('s', 10), words('s', 10).toUpperCase()];
    const graphs = measureDeltaSlotGraphsAllOrNothingV4([
      requestFor(plainSlot(texts, 1)),
      requestFor(plainSlot(texts, 2)),
    ]);
    expect(graphs).toHaveLength(2);
    expect(graphs[0]!.graph).not.toBe(graphs[1]!.graph);
    for (const unbound of graphs) {
      expect(unbound.graph.documents).toHaveLength(2);
      expect(unbound.graph.comparedPairCount).toBe(1);
      expect(edgePairs(unbound.graph)).toEqual(['0-1']);
    }
    // Two within-slot pairs; a pooled graph would have compared 4 * 3 / 2 = 6.
    expect(graphs.reduce((sum, unbound) => sum + unbound.graph.comparedPairCount, 0)).toBe(2);
  });

  it('§16: per-slot m(m-1)/2, summed - never M(M-1)/2 over every slot', () => {
    const graphs = measureDeltaSlotGraphsAllOrNothingV4([
      requestFor(plainSlot([words('a', 6), words('b', 6), words('c', 6), 'x y'], 1)),
      requestFor(plainSlot([words('d', 6), words('e', 6)], 2)),
    ]);
    const perSlot = graphs.map((unbound) => {
      const m = unbound.graph.measurableIndices.length;
      expect(unbound.graph.comparedPairCount).toBe((m * (m - 1)) / 2);
      expect(m + unbound.graph.shortTextUnresolvedCount).toBe(unbound.graph.documents.length);
      return unbound.graph.comparedPairCount;
    });
    expect(perSlot).toEqual([3, 1]);
    const total = graphs.reduce((sum, unbound) => sum + unbound.graph.measurableIndices.length, 0);
    expect(perSlot[0]! + perSlot[1]!).toBe(4);
    expect((total * (total - 1)) / 2).toBe(10);
  });

  it('§16: every emitted edge is ordered, measurable-to-measurable, unique and threshold-positive', () => {
    const graph = measure([
      words('p', 14),
      'one two',
      words('p', 13),
      words('p', 14).toUpperCase(),
      words('r', 9),
    ]);
    const measurable = new Set(graph.measurableIndices);
    const seen = new Set<string>();
    expect(graph.edges.length).toBeGreaterThan(0);
    for (const edge of graph.edges) {
      expect(edge.aIndex).toBeLessThan(edge.bIndex);
      expect(measurable.has(edge.aIndex) && measurable.has(edge.bIndex)).toBe(true);
      expect(seen.has(`${edge.aIndex}:${edge.bIndex}`)).toBe(false);
      seen.add(`${edge.aIndex}:${edge.bIndex}`);
      expect(edge.measurement.atOrAboveThreshold).toBe(true);
      expect(edge.measurement.unionSize).toBeGreaterThan(0);
    }
  });
});

describe('2D-A3 R35 §11 / §28: empty and short text stay unresolved, owned by canonical SD7', () => {
  it('an EMPTY text is unmeasurable SD7_SHORT_TEXT_UNRESOLVED - not removed, not failed', () => {
    const graph = measure(['', words('e', 8)]);
    expect(graph.documents).toHaveLength(2);
    expect(graph.documents[0]).toMatchObject({ measurable: false, tokenCount: 0, shingleCount: 0 });
    expect(graph.shortTextUnresolvedCount).toBe(1);
    expect(graph.measurableIndices).toEqual([1]);
    expect(graph.comparedPairCount).toBe(0);
    expect(graph.edges).toEqual([]);
  });

  it('whitespace-only text is also short, by canonical normalisation - not by R35', () => {
    const graph = measure([' \n\t ', words('e', 8)]);
    expect(graph.documents[0]).toMatchObject({ measurable: false, tokenCount: 0 });
  });

  it('a 4-token document is unresolved; a 5-token document is measurable', () => {
    const graph = measure(['one two three four', 'one two three four five']);
    expect(graph.documents[0]).toMatchObject({ measurable: false, tokenCount: 4, shingleCount: 0 });
    expect(graph.documents[1]).toMatchObject({ measurable: true, tokenCount: 5, shingleCount: 1 });
    expect(graph.shortTextUnresolvedCount).toBe(1);
    expect(graph.measurableIndices).toEqual([1]);
    expect(graph.comparedPairCount).toBe(0);
  });

  it('two empty texts in one slot are two unresolved documents with no pair between them', () => {
    const graph = measure(['', '', words('f', 9), words('g', 9)]);
    expect(graph.shortTextUnresolvedCount).toBe(2);
    expect(graph.measurableIndices).toEqual([2, 3]);
    expect(graph.comparedPairCount).toBe(1);
  });
});

describe('2D-A3 R35 §28: the 9/10 threshold, through the canonical path', () => {
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

describe('2D-A3 R35 §28: canonical normalisation, owned by SD7 not R35', () => {
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
  it('no Unicode normalisation (composed vs decomposed accent)', () =>
    expect(
      measure(['le centre de langues universit\u00e9', 'le centre de langues universite\u0301'])
        .edges,
    ).toEqual([]));
  it('no stemming', () =>
    expect(measure([five, 'the international offices of paris']).edges).toEqual([]));
});

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R35 §9 / §26: nothing but an actual R34 mint can mint', () => {
  const unbound = plainSlot([words('m', 8)], 34);
  const r34SlotLiteral = {
    kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V4',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    selectionIndex: 34,
    split: 'DEV_TRAIN',
    exactDuplicate: unbound.exactDuplicate,
    documents: unbound.documents,
    candidateObservationCount: unbound.candidateObservationCount,
  };
  const r33Batch = {
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V4',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV4: {},
    continuityBaseV3: {},
    items: [{ kind: 'A3_DURABLE_ACQUISITION_EVIDENCE_DELTA_V4', split: 'DEV_TRAIN' }],
    coverage: {
      historicalCanonicalCoverageCount: 6,
      v4DevTrainReadyCount: 7,
      unchangedCanonicalCoverageCount: 6,
      newlyBoundDeltaCount: 1,
      changedExistingCount: 0,
      removedCount: 0,
      legacyAuthorityEvidenceRequests: 0,
      deltaAuthorityEvidenceRequests: 1,
    },
  };
  const fabricatedR34Batch = {
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V4',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV4: {},
    evidenceDeltaBatch: r33Batch,
    items: [r34SlotLiteral],
  };
  const r27Batch = {
    ...fabricatedR34Batch,
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V2',
    items: [{ ...r34SlotLiteral, kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V2' }],
  };
  const r21Slot = { ...r34SlotLiteral, kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_V1' };
  const r21Batch = {
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_BATCH_V1',
    split: 'DEV_TRAIN',
    governanceSnapshot: {},
    items: [r21Slot],
  };
  const cases: Record<string, unknown> = {
    'a literal R34 slot passed as a batch': r34SlotLiteral,
    'a spread clone of the slot': { ...r34SlotLiteral },
    'a structuredClone of the slot': structuredClone(r34SlotLiteral),
    'a fabricated R34 delta batch': fabricatedR34Batch,
    'a spread clone of the fabricated batch': { ...fabricatedR34Batch },
    'a structuredClone of the fabricated batch': structuredClone(fabricatedR34Batch),
    'a JSON round-trip of the fabricated batch': clone(fabricatedR34Batch),
    'a batch holding a cloned slot': { ...fabricatedR34Batch, items: [{ ...r34SlotLiteral }] },
    'an R33 evidence delta batch': r33Batch,
    'an R27 V2 document-source delta batch': r27Batch,
    'an R21 V1 document-source slot': r21Slot,
    'an R21 V1 document-source batch': r21Batch,
    'an unbound R21 assembly': unbound,
    'the committed R34 census': readJson(R34_CENSUS),
    undefined: undefined,
  };
  for (const [name, value] of Object.entries(cases)) {
    it(`refuses ${name}, with zero R22 calls`, () => {
      const before = calls.measure;
      expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV4(value, undefined))).toBe(
        'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
      );
      expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV4(value, { kind: 'x' }))).toBe(
        'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
      );
      expect(calls.measure).toBe(before);
    });
  }

  it('resolves no provenance and no proof for anything it did not mint', () => {
    expect(isA3DevTrainSlotSd7GraphMeasurementDeltaV4({ ...r34SlotLiteral, graph: {} })).toBe(
      false,
    );
    expect(isA3DevTrainSd7GraphDeltaBatchV4(fabricatedR34Batch)).toBe(false);
    expect(documentSourceDeltaSlotForDeltaGraphV4(r34SlotLiteral)).toBeUndefined();
    expect(deltaGraphForDocumentSourceDeltaSlotV4(r34SlotLiteral)).toBeUndefined();
    expect(documentSourceDeltaBatchForGraphDeltaBatchV4(fabricatedR34Batch)).toBeUndefined();
    expect(graphDeltaBatchForDocumentSourceDeltaBatchV4(fabricatedR34Batch)).toBeUndefined();
    expect(r34ReproductionProofForBatch(fabricatedR34Batch)).toBeUndefined();
  });

  it('proves no fresh R34 reproduction for an unminted batch', () => {
    expect(
      codeOf(() =>
        requireFreshR34Reproduction(
          fabricatedR34Batch as never,
          {} as never,
          { r33Tip: '', r33ScopePinCommit: '', implementationCommit: '' },
          readJson(R34_CENSUS),
        ),
      ),
    ).toBe('R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34');
  });

  it('derives no coverage expansion or census from an unminted batch', () => {
    const baseline = requireHistoricalGraphBaseline(
      readJson(R22_CENSUS),
      readJson(R28_CENSUS),
      readJson(R34_CENSUS),
    );
    expect(
      codeOf(() =>
        deriveCanonicalSd7GraphCoverageExpansionV4(fabricatedR34Batch as never, baseline),
      ),
    ).toBe('R35_NOT_A_MINTED_DELTA_GRAPH_BATCH');
    expect(
      codeOf(() =>
        deriveR35PublicIncrementalSd7GraphCensus(fabricatedR34Batch as never, baseline, {
          r34Tip: '',
          r34ScopePinCommit: '',
          implementationCommit: '',
        }),
      ),
    ).toBe('R35_NOT_A_MINTED_DELTA_GRAPH_BATCH');
  });
});

// ---------------------------------------------------------------------------
// C. THE FRESH R34 REPRODUCTION COMPARISON.
// ---------------------------------------------------------------------------

describe('2D-A3 R35 §7: the fresh R34 census must equal the committed one', () => {
  const committed = readJson(R34_CENSUS) as unknown as R34PublicIncrementalDocumentSourceCensus;

  it('the committed census states the pinned R34 checkpoint', () => {
    expect(r34ReproductionDriftPaths(committed, committed)).toEqual([]);
    const at = (path: string): unknown => {
      let cursor: unknown = committed;
      let rest = path;
      while (rest.length > 0) {
        const object = cursor as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(object, rest)) return object[rest];
        const dot = rest.indexOf('.');
        cursor = object[rest.slice(0, dot)];
        rest = rest.slice(dot + 1);
      }
      return cursor;
    };
    for (const [path, expected] of Object.entries(R35_EXPECTED_R34_CHECKPOINT)) {
      expect(at(path), path).toBe(expected);
    }
  });

  it('only the execution-provenance commit may differ', () => {
    const moved = { ...committed, implementationCommit: 'f'.repeat(40) };
    expect(r34ReproductionDriftPaths(moved as never, committed)).toEqual([]);
  });

  it('reports any other difference by path, never by value', () => {
    const copy = clone(committed) as unknown as Record<string, Record<string, unknown>>;
    copy['deltaAssembly']!['deltaSlotLocalDistinctDocuments'] = 196;
    copy['coverage']!['coverageSlotLocalDocuments'] = 387;
    copy['r33ScopePinCommit'] = 'e'.repeat(40) as never;
    const paths = r34ReproductionDriftPaths(copy as never, committed);
    expect(paths).toEqual([
      'coverage.coverageSlotLocalDocuments',
      'deltaAssembly.deltaSlotLocalDistinctDocuments',
      'r33ScopePinCommit',
    ]);
    expect(paths.join(' ')).not.toMatch(/196|387|eeee/);
  });

  it('a missing committed census differs everywhere', () => {
    expect(r34ReproductionDriftPaths(committed, undefined).length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// D. THE COMMITTED R22 + R28 HISTORICAL GRAPH BASELINE.
// ---------------------------------------------------------------------------

describe('2D-A3 R35 §8: the committed R22 + R28 graph history closes to six slots', () => {
  const r22 = readJson(R22_CENSUS);
  const r28 = readJson(R28_CENSUS);
  const r34 = readJson(R34_CENSUS);

  it('5 + 1 = 6 graphs / 191 docs / 190 measurable / 1 short / 2933 pairs / 42 edges / 21', () => {
    const baseline = requireHistoricalGraphBaseline(r22, r28, r34);
    expect({ ...baseline }).toEqual({
      r22GraphSlots: 5,
      r28NewGraphSlots: 1,
      slotGraphs: 6,
      documents: 191,
      measurableDocuments: 190,
      shortTextUnresolved: 1,
      comparedPairs: 2933,
      nearDuplicateEdges: 42,
      documentsInAtLeastOneEdge: 21,
    });
    expect(requireHistoricalGraphBaselineProof(baseline)).toBe(baseline);
  });

  it('equals R34 historical document-source coverage: 6 slots, 191 slot-local documents', () => {
    const coverage = r34['coverage'] as Record<string, number>;
    const baseline = requireHistoricalGraphBaseline(r22, r28, r34);
    expect(baseline.slotGraphs).toBe(coverage['historicalCanonicalSlots']);
    expect(baseline.documents).toBe(coverage['historicalSlotLocalDocuments']);
  });

  it('a baseline copy is not a proved baseline', () => {
    const baseline = requireHistoricalGraphBaseline(r22, r28, r34);
    expect(codeOf(() => requireHistoricalGraphBaselineProof({ ...baseline }))).toBe(
      'R35_HISTORICAL_GRAPH_BASELINE_NOT_PROVED',
    );
    expect(codeOf(() => requireHistoricalGraphBaselineProof(undefined))).toBe(
      'R35_HISTORICAL_GRAPH_BASELINE_NOT_PROVED',
    );
  });

  it('a drifted R22, R28 or R34 record, or broken arithmetic, STOPS', () => {
    const r22Moved = clone(r22) as Record<string, Record<string, unknown>>;
    r22Moved['measurement']!['comparedPairCount'] = 2339;
    const r28Moved = clone(r28) as Record<string, Record<string, unknown>>;
    r28Moved['coverage']!['coverageDocuments'] = 192;
    const r28Broken = clone(r28) as Record<string, Record<string, unknown>>;
    r28Broken['coverage']!['historicalNearDuplicateEdges'] = 40;
    const r34Moved = clone(r34) as Record<string, Record<string, unknown>>;
    r34Moved['coverage']!['historicalSlotLocalDocuments'] = 190;
    for (const [a, b, c] of [
      [r22Moved, r28, r34],
      [r22, r28Moved, r34],
      [r22, r28Broken, r34],
      [r22, r28, r34Moved],
      [undefined, r28, r34],
      [r22, undefined, r34],
      [r22, r28, undefined],
    ] as const) {
      expect(codeOf(() => requireHistoricalGraphBaseline(a, b, c))).toBe(
        'STOP_R35_HISTORICAL_R22_R28_GRAPH_BASELINE_DRIFT_REQUIRES_REVIEW',
      );
    }
  });

  it('§18: the combined pair count is a per-slot sum, never a global n(n-1)/2', () => {
    const baseline = requireHistoricalGraphBaseline(r22, r28, r34);
    expect(baseline.comparedPairs).toBe(2338 + 595);
    expect(baseline.comparedPairs).not.toBe((190 * 189) / 2);
  });
});

describe('2D-A3 R35 §22: the stated SD7 constants are the canonical contract', () => {
  it('equals sd7Contract and the committed R22 and R28 censuses', () => {
    expect(R35_STATED_CANONICAL_SD7.shingleSizeTokens).toBe(sd7.NEAR_DUPLICATE_SHINGLE_SIZE);
    expect(R35_STATED_CANONICAL_SD7.jaccardThresholdNumerator).toBe(
      sd7.NEAR_DUPLICATE_JACCARD_THRESHOLD_NUMERATOR,
    );
    expect(R35_STATED_CANONICAL_SD7.jaccardThresholdDenominator).toBe(
      sd7.NEAR_DUPLICATE_JACCARD_THRESHOLD_DENOMINATOR,
    );
    expect(R35_STATED_CANONICAL_SD7.comparisonScope).toBe(sd7.NEAR_DUPLICATE_COMPARISON_SCOPE);
    expect(R35_STATED_CANONICAL_SD7.shortTextStatus).toBe(sd7.SD7_SHORT_TEXT_UNRESOLVED);
    expect(readJson(R22_CENSUS)['canonicalSd7']).toEqual({ ...R35_STATED_CANONICAL_SD7 });
    expect(readJson(R28_CENSUS)['canonicalSd7']).toEqual({ ...R35_STATED_CANONICAL_SD7 });
  });

  it('the committed R33 census still states 7 delta authority queries and 0 legacy', () => {
    const access = readJson(R33_CENSUS)['databaseAccess'] as Record<string, unknown>;
    expect(access['deltaAuthorityEvidenceQueries']).toBe(7);
    expect(access['legacyAuthorityEvidenceQueries']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// E. NO HISTORICAL REMEASUREMENT, AT RUNTIME.
// ---------------------------------------------------------------------------

describe('2D-A3 R35: R22 V1 / R28 V2 minting and the R21 / R27 text accessors were never reached', () => {
  it('counted zero calls across every test in this file', () => {
    expect(calls.r22Mint).toBe(0);
    expect(calls.r28Mint).toBe(0);
    expect(calls.r21Lookup).toBe(0);
    expect(calls.r27Lookup).toBe(0);
    expect(calls.measure).toBeGreaterThan(0);
  });
});

/**
 * PHASE 2B-2D A3 R29 — THE INCREMENTAL DELTA PATH AROUND R23'S PURE SAMPLE PREPARATION.
 *
 * Every identity, score and graph here is INVENTED. No real corpus, no sealed
 * file, no database, no network. Proves, without a database:
 *
 *   - every delta request reaches R23's real `prepareUnboundSlotSampleSurvivors`
 *     exactly once, all-or-nothing, and its canonical objects are kept by
 *     reference;
 *   - on a single-edge graph both canonical samples keep all but one endpoint,
 *     and the two samples diverge in exactly one of two shapes - same endpoint
 *     excluded (m-1/0/0/1) or opposite endpoints (m-2/1/1/0) - found by
 *     R23's own `sampleSurvivorDivergence`, never a survivor walk here;
 *   - a zero-edge graph excludes nothing, and a multi-edge graph returns
 *     exactly R23's own result (no "one exclusion" rule is general);
 *   - nothing but an actual R28 mint can mint, and R23 V1 minting is never
 *     reached;
 *   - the R28 drift and R23 historical-baseline cross-checks;
 *   - the stated canonical constants equal the canonical contracts.
 *
 * Synthetic slots are NOT minted and cannot be: an R28 graph exists only
 * behind a real R26 mint of a real run. The minted route is exercised by the
 * real V1 -> V2 -> R26 -> R27 -> R28 -> R29 chain, whose results the audit
 * records.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type * as R23PrepareModule from '../harness/phase2b2d/a3samples/prepare.js';
import type * as R23DevTrainModule from '../harness/phase2b2d/a3samples/devTrain.js';
import {
  K3_SD7_GRAPH_SCOPE,
  K3_SD7_SURVIVOR_PROCEDURE,
  K3_SD7_SURVIVOR_SCOPE,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
} from '../harness/phase2b2d/a3prep/contracts.js';
import { SET_P_DOCUMENT_CAP_EXACT } from '../harness/phase2b2d/a3prep/setPSd7.js';
import {
  SET_R_DOCUMENT_CAP_EXACT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_R_INITIAL_CAP_EXACT,
} from '../harness/phase2b2d/a3prep/setRSd7Readiness.js';
import { prepareSetRDocumentScore } from '../harness/phase2b2d/a3prep/setRScore.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3PageEvidenceId,
  A3SelectionIndex,
  A3TrackCandidateObservation,
} from '../harness/phase2b2d/a3prep/types.js';
import type { A3DocumentSourceEntry } from '../harness/phase2b2d/a3documents/types.js';
import {
  prepareUnboundSlotSampleSurvivors,
  sampleSurvivorDivergence,
} from '../harness/phase2b2d/a3samples/prepare.js';
import { A3SampleRefusal } from '../harness/phase2b2d/a3samples/refusal.js';
import type { UnboundSlotSampleSurvivorInput } from '../harness/phase2b2d/a3samples/types.js';
import type { NearDuplicateGraphMeasurement } from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';
import type { R28PublicIncrementalSd7GraphCensus } from '../harness/phase2b2d/a3graphsV2/census.js';
import {
  deriveCanonicalSampleSurvivorCoverageExpansionV2,
  deriveDeltaSampleAggregates,
  deriveR29PublicIncrementalSampleSurvivorCensus,
  R29_STATED_CANONICAL_SAMPLE_CONSTANTS,
} from '../harness/phase2b2d/a3samplesV2/census.js';
import {
  bindDevTrainSampleSurvivorDeltaBatchV2,
  deltaGraphForSamplePreparation,
  graphDeltaBatchForSampleDeltaBatch,
  isA3DevTrainSampleSurvivorDeltaBatchV2,
  isA3DevTrainSlotSampleSurvivorPreparationDeltaV2,
  sampleDeltaBatchForGraphDeltaBatch,
  samplePreparationForDeltaGraph,
} from '../harness/phase2b2d/a3samplesV2/devTrain.js';
import { prepareDeltaSlotSamplesAllOrNothing } from '../harness/phase2b2d/a3samplesV2/prepareDelta.js';
import {
  R29_EXPECTED_R28_CHECKPOINT,
  requireNoR28GraphDeltaDrift,
  requireR23HistoricalBaseline,
  r28DeltaDriftPaths,
} from '../harness/phase2b2d/a3samplesV2/r28Drift.js';
import {
  A3SampleV2Refusal,
  type A3SampleV2RefusalCode,
} from '../harness/phase2b2d/a3samplesV2/refusal.js';

const calls = vi.hoisted(() => ({ prepare: 0, divergence: 0, r23Mint: 0 }));

vi.mock('../harness/phase2b2d/a3samples/prepare.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R23PrepareModule>();
  return {
    ...actual,
    prepareUnboundSlotSampleSurvivors: (
      ...args: Parameters<typeof actual.prepareUnboundSlotSampleSurvivors>
    ) => {
      calls.prepare += 1;
      return actual.prepareUnboundSlotSampleSurvivors(...args);
    },
    sampleSurvivorDivergence: (...args: Parameters<typeof actual.sampleSurvivorDivergence>) => {
      calls.divergence += 1;
      return actual.sampleSurvivorDivergence(...args);
    },
  };
});

vi.mock('../harness/phase2b2d/a3samples/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R23DevTrainModule>();
  return {
    ...actual,
    bindDevTrainSampleSurvivorBatch: (
      ...args: Parameters<typeof actual.bindDevTrainSampleSurvivorBatch>
    ) => {
      calls.r23Mint += 1;
      return actual.bindDevTrainSampleSurvivorBatch(...args);
    },
  };
});

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(join(REPO_ROOT, 'docs/evaluation', name), 'utf8'));

// ---------------------------------------------------------------------------
// Synthetic builders (the same shapes R23's own unit suite uses).
// ---------------------------------------------------------------------------

const SLOT = 7 as A3SelectionIndex;

const sha = (label: string): A3DocumentSha256 =>
  createHash('sha256')
    .update(`synthetic-a3-r29:${label}`, 'utf8')
    .digest('hex') as A3DocumentSha256;

function obs(page: A3PageEvidenceId, track: string, score: string): A3TrackCandidateObservation {
  return {
    pageEvidenceId: page,
    track,
    candidateScoreDecimal: score,
    ruleVersion: 'orgunit-signal-rules-v1',
  } as never;
}

/** One R21/R27-shaped document entry with a genuine canonical R10 preparation. */
function entry(label: string, score: string): A3DocumentSourceEntry {
  const documentSha256 = sha(label);
  const id = `pe-${label}-0` as A3PageEvidenceId;
  const document = {
    selectionIndex: SLOT,
    split: 'DEV_TRAIN',
    documentSha256,
    sourcePageEvidenceIds: [id],
  } as A3DistinctDocument;
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
  return {
    document,
    extractionRuleVersion: 'orgunit-extraction-v2',
    scorePreparation,
    sourceRowCount: 1,
  };
}

const EDGE_MEASUREMENT = Object.freeze({
  intersectionSize: 9,
  unionSize: 10,
  similarity: 0.9,
  atOrAboveThreshold: true,
});

/** A canonical-shaped graph in SLOT order. `short` and `edges` are slot positions. */
function graphFor(
  documents: readonly A3DocumentSourceEntry[],
  short: readonly number[] = [],
  edges: readonly (readonly [number, number])[] = [],
): NearDuplicateGraphMeasurement {
  const shortSet = new Set(short);
  const graphDocuments = documents.map((e, i) => ({
    documentSha256: e.document.documentSha256 as string,
    tokenCount: shortSet.has(i) ? 2 : 50,
    shingleCount: shortSet.has(i) ? 0 : 46,
    measurable: !shortSet.has(i),
  }));
  const measurableIndices = graphDocuments.flatMap((d, i) => (d.measurable ? [i] : []));
  return {
    documents: graphDocuments,
    measurableIndices,
    shortTextUnresolvedCount: graphDocuments.length - measurableIndices.length,
    comparedPairCount: (measurableIndices.length * (measurableIndices.length - 1)) / 2,
    edges: edges.map(([a, b]) => ({
      aIndex: Math.min(a, b),
      bIndex: Math.max(a, b),
      measurement: EDGE_MEASUREMENT,
    })),
  };
}

function slotOf(documents: readonly A3DocumentSourceEntry[]): UnboundSlotSampleSurvivorInput {
  return { selectionIndex: SLOT, split: 'DEV_TRAIN', documents };
}

function codeOf(run: () => unknown): A3SampleV2RefusalCode | 'NO_REFUSAL' {
  try {
    run();
  } catch (error) {
    if (error instanceof A3SampleV2Refusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}

/** 35 documents, descending scores, one canonical edge between slot positions 0 and 1. */
function singleEdgeSlot(seed: number, size = 35) {
  const documents = Array.from({ length: size }, (_, i) =>
    entry(`s${seed}-d${i}`, String(1000 - i)),
  );
  return { slot: slotOf(documents), graph: graphFor(documents, [], [[0, 1]]) };
}

/**
 * Finds a deterministic seed whose canonical SET_P order agrees (or disagrees)
 * with SET_R about which endpoint of the one edge comes first. The outcome is
 * READ from R23's canonical preparation and R23's divergence helper; this test
 * implements no rank and no walk.
 */
function singleEdgeScenario(want: 'SAME' | 'OPPOSITE') {
  for (let seed = 0; seed < 200; seed += 1) {
    const { slot, graph } = singleEdgeSlot(seed);
    const [prepared] = prepareDeltaSlotSamplesAllOrNothing([{ slot, graph }]);
    const d = sampleSurvivorDivergence(prepared!, graph);
    if ((want === 'SAME') === (d.excludedInBothSamples === 1))
      return { slot, graph, prepared: prepared! };
  }
  throw new Error(`no ${want} scenario found`);
}

// ---------------------------------------------------------------------------

describe('2D-A3 R29: the delta path reaches R23 exactly once per slot', () => {
  it('calls prepareUnboundSlotSampleSurvivors once per request and keeps its objects', () => {
    const { slot, graph } = singleEdgeSlot(1000);
    const before = calls.prepare;
    const [prepared] = prepareDeltaSlotSamplesAllOrNothing([{ slot, graph }]);
    expect(calls.prepare).toBe(before + 1);
    // Same inputs, same canonical result: R29 adds nothing and changes nothing.
    const direct = prepareUnboundSlotSampleSurvivors(slot, graph);
    expect(prepared).toEqual(direct);
    expect(Object.isFrozen(prepared)).toBe(true);
  });

  it('is all-or-nothing: a bad second request returns nothing for the first', () => {
    const { slot, graph } = singleEdgeSlot(1001);
    expect(
      codeOf(() => prepareDeltaSlotSamplesAllOrNothing([{ slot, graph }, { slot } as never])),
    ).toBe('R29_DELTA_REQUEST_SHAPE_INVALID');
  });

  it("propagates R23's own refusal unchanged", () => {
    const { slot } = singleEdgeSlot(1002);
    const other = singleEdgeSlot(1003).graph;
    let caught: unknown;
    try {
      prepareDeltaSlotSamplesAllOrNothing([{ slot, graph: other }]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(A3SampleRefusal);
    expect((caught as A3SampleRefusal).code).toBe('R23_GRAPH_DOCUMENT_COVERAGE_MISMATCH');
  });
});

describe('2D-A3 R29 §24 / §47-§51: what one edge, zero edges and many edges produce', () => {
  it('§49: 35 measurable documents and one edge give 34 survivors / 1 exclusion per sample', () => {
    const { prepared } = singleEdgeScenario('SAME');
    for (const sample of [prepared.setP, prepared.setR]) {
      expect(sample.preSd7FullRank).toHaveLength(35);
      expect(sample.sd7Preparation.counts.measurableSurvivorCount).toBe(34);
      expect(sample.sd7Preparation.counts.measurableExclusionCount).toBe(1);
      expect(sample.sd7Preparation.counts.shortTextUnresolvedCount).toBe(0);
    }
    expect(prepared.setP.documentCap.status).toBe(SET_P_DOCUMENT_CAP_EXACT);
    expect(prepared.setRDocumentCap.status).toBe(SET_R_DOCUMENT_CAP_EXACT);
    expect(prepared.setRFreezeSlotReadiness.initialCapReadiness).toBe(SET_R_INITIAL_CAP_EXACT);
    expect(prepared.setRFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
  });

  it('§47: same-endpoint case gives 34 / 0 / 0 / 1', () => {
    const { prepared, graph } = singleEdgeScenario('SAME');
    expect(sampleSurvivorDivergence(prepared, graph)).toEqual({
      measurableDocumentCount: 35,
      survivingBothSamples: 34,
      survivingSetPOnly: 0,
      survivingSetROnly: 0,
      excludedInBothSamples: 1,
    });
  });

  it('§48: opposite-endpoint case gives 33 / 1 / 1 / 0', () => {
    const { prepared, graph } = singleEdgeScenario('OPPOSITE');
    expect(sampleSurvivorDivergence(prepared, graph)).toEqual({
      measurableDocumentCount: 35,
      survivingBothSamples: 33,
      survivingSetPOnly: 1,
      survivingSetROnly: 1,
      excludedInBothSamples: 0,
    });
  });

  it('the single-edge invariant holds at a smaller population too', () => {
    const { slot, graph } = singleEdgeSlot(2000, 6);
    const [prepared] = prepareDeltaSlotSamplesAllOrNothing([{ slot, graph }]);
    expect(prepared!.setP.sd7Preparation.counts.measurableSurvivorCount).toBe(5);
    expect(prepared!.setR.sd7Preparation.counts.measurableSurvivorCount).toBe(5);
  });

  it('§50: a zero-edge graph excludes nothing in either sample', () => {
    const documents = Array.from({ length: 12 }, (_, i) => entry(`z-d${i}`, String(50 - i)));
    const graph = graphFor(documents);
    const [prepared] = prepareDeltaSlotSamplesAllOrNothing([{ slot: slotOf(documents), graph }]);
    expect(prepared!.setP.sd7Preparation.counts.measurableExclusionCount).toBe(0);
    expect(prepared!.setR.sd7Preparation.counts.measurableExclusionCount).toBe(0);
    expect(sampleSurvivorDivergence(prepared!, graph)).toEqual({
      measurableDocumentCount: 12,
      survivingBothSamples: 12,
      survivingSetPOnly: 0,
      survivingSetROnly: 0,
      excludedInBothSamples: 0,
    });
  });

  it("§51: a multi-edge graph returns exactly R23's own result, whatever it is", () => {
    const documents = Array.from({ length: 14 }, (_, i) => entry(`m-d${i}`, String(70 - i)));
    const graph = graphFor(
      documents,
      [],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [5, 9],
        [9, 13],
        [6, 7],
      ],
    );
    const [prepared] = prepareDeltaSlotSamplesAllOrNothing([{ slot: slotOf(documents), graph }]);
    expect(prepared).toEqual(prepareUnboundSlotSampleSurvivors(slotOf(documents), graph));
    expect(prepared!.setP.sd7Preparation.counts.measurableExclusionCount).toBeGreaterThan(1);
  });

  it('a short text is carried, never examined by the single-edge rule, and a blocked cap is not a STOP', () => {
    const documents = Array.from({ length: 10 }, (_, i) => entry(`b-d${i}`, String(40 - i)));
    // A short text at slot 0 carries the HIGHEST score, so SET_R ranks it first.
    const graph = graphFor(documents, [0], [[3, 4]]);
    const [prepared] = prepareDeltaSlotSamplesAllOrNothing([{ slot: slotOf(documents), graph }]);
    expect(prepared!.setR.sd7Preparation.counts.shortTextUnresolvedCount).toBe(1);
    expect(prepared!.setRDocumentCap.status).not.toBe(SET_R_DOCUMENT_CAP_EXACT);
  });
});

describe('2D-A3 R29 §10 / §13 / §52: nothing but an actual R28 mint can mint', () => {
  const { slot, graph } = singleEdgeSlot(3000);
  const fakeGraph = {
    kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_DELTA_V2',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    selectionIndex: SLOT,
    split: 'DEV_TRAIN',
    graph,
  };
  const fakeR27Batch = {
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V2',
    split: 'DEV_TRAIN',
    items: [slot],
  };
  const fakeBatch = {
    kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V2',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV2: {},
    documentSourceDeltaBatch: fakeR27Batch,
    items: [fakeGraph],
  };
  const historicalR22Graph = {
    kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_V1',
    selectionIndex: SLOT,
    split: 'DEV_TRAIN',
    graph,
  };
  const historicalR22Batch = {
    kind: 'A3_DEV_TRAIN_SD7_GRAPH_BATCH_V1',
    split: 'DEV_TRAIN',
    items: [historicalR22Graph],
  };
  const r26Batch = {
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V2',
    split: 'DEV_TRAIN',
    items: [],
  };

  it.each([
    ['a graph-batch literal', fakeBatch],
    ['a spread clone', { ...fakeBatch }],
    ['a structuredClone', structuredClone(fakeBatch)],
    ['a JSON round-trip', JSON.parse(JSON.stringify(fakeBatch))],
    ['a batch containing a cloned graph', { ...fakeBatch, items: [{ ...fakeGraph }] }],
    ['a historical R22 graph batch', historicalR22Batch],
    ['a historical R22 graph', historicalR22Graph],
    ['an R27 document batch', fakeR27Batch],
    ['an R26 evidence batch', r26Batch],
    ['an unbound graph object', graph],
    ['undefined', undefined],
  ])('refuses %s before any preparation', (_label, input) => {
    const before = calls.prepare;
    expect(codeOf(() => bindDevTrainSampleSurvivorDeltaBatchV2(input))).toBe(
      'R29_SD7_GRAPH_DELTA_NOT_MINTED_BY_R28',
    );
    expect(calls.prepare).toBe(before);
  });

  it('brands nothing it did not mint, and provenance of a literal is undefined', () => {
    expect(isA3DevTrainSampleSurvivorDeltaBatchV2(fakeBatch)).toBe(false);
    expect(isA3DevTrainSlotSampleSurvivorPreparationDeltaV2(fakeGraph)).toBe(false);
    expect(deltaGraphForSamplePreparation(fakeGraph)).toBeUndefined();
    expect(samplePreparationForDeltaGraph(fakeGraph)).toBeUndefined();
    expect(graphDeltaBatchForSampleDeltaBatch(fakeBatch)).toBeUndefined();
    expect(sampleDeltaBatchForGraphDeltaBatch(fakeBatch)).toBeUndefined();
  });

  it('the census and coverage expansion refuse anything not minted by R29', () => {
    expect(codeOf(() => deriveDeltaSampleAggregates(fakeBatch as never))).toBe(
      'R29_NOT_A_MINTED_DELTA_SAMPLE_BATCH',
    );
    expect(
      codeOf(() =>
        deriveCanonicalSampleSurvivorCoverageExpansionV2(fakeBatch as never, {} as never),
      ),
    ).toBe('R29_NOT_A_MINTED_DELTA_SAMPLE_BATCH');
    expect(
      codeOf(() =>
        deriveR29PublicIncrementalSampleSurvivorCensus(fakeBatch as never, {} as never, {
          r28Tip: 'x',
          implementationCommit: 'y',
        }),
      ),
    ).toBe('R29_NOT_A_MINTED_DELTA_SAMPLE_BATCH');
  });
});

describe('2D-A3 R29 §38 / §55: R28 drift and the R23 historical baseline', () => {
  const committedR28 = readJson(
    'PHASE_2B_2D_A3_R28_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1.json',
  ) as R28PublicIncrementalSd7GraphCensus;
  const committedR23 = readJson(
    'PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json',
  ) as Record<string, unknown>;

  it('the committed R28 census has no drift against itself and states the checkpoint', () => {
    expect(r28DeltaDriftPaths(committedR28, committedR28)).toEqual([]);
    expect(() => requireNoR28GraphDeltaDrift(committedR28, committedR28)).not.toThrow();
    expect(Object.keys(R29_EXPECTED_R28_CHECKPOINT)).toContain(
      'deltaGraph.deltaNearDuplicateEdges',
    );
  });

  it('reports a moved aggregate by path and stops', () => {
    const moved = structuredClone(committedR28) as unknown as Record<
      string,
      Record<string, number>
    >;
    moved['deltaGraph']!['deltaNearDuplicateEdges'] = 2;
    expect(r28DeltaDriftPaths(moved as never, committedR28)).toEqual([
      'deltaGraph.deltaNearDuplicateEdges',
    ]);
    expect(codeOf(() => requireNoR28GraphDeltaDrift(moved as never, committedR28))).toBe(
      'STOP_R29_CANONICAL_R28_GRAPH_DELTA_DRIFT_REQUIRES_REVIEW',
    );
  });

  it('a fresh census whose checkpoint moved with the committed one still stops', () => {
    const moved = structuredClone(committedR28) as unknown as Record<
      string,
      Record<string, number>
    >;
    moved['coverage']!['coverageNearDuplicateEdges'] = 43;
    expect(codeOf(() => requireNoR28GraphDeltaDrift(moved as never, moved))).toBe(
      'STOP_R29_CANONICAL_R28_GRAPH_DELTA_DRIFT_REQUIRES_REVIEW',
    );
  });

  it('reads the R23 baseline as aggregates: 5 slots, 156/155/142/13/1, 137/5/5/8', () => {
    const baseline = requireR23HistoricalBaseline(committedR23);
    expect(baseline.slotPreparations).toBe(5);
    expect(baseline.setP).toEqual({
      preSd7RankEntryCount: 156,
      measurableDocumentCount: 155,
      measurableSurvivorCount: 142,
      measurableExclusionCount: 13,
      unresolvedShortTextOccurrenceCount: 1,
      initialCapExactSlotCount: 5,
      initialCapBlockedSlotCount: 0,
      exactCapDocumentCountAcrossExactSlots: 40,
    });
    expect(baseline.setR.exactCapDocumentCountAcrossExactSlots).toBe(20);
    expect(baseline.setR.fullRankExactSlotCount).toBe(4);
    expect(baseline.setR.fullRankShortTextBlockedSlotCount).toBe(1);
    expect(baseline.divergence).toEqual({
      measurableDocumentCount: 155,
      survivingBothSamples: 137,
      survivingSetPOnly: 5,
      survivingSetROnly: 5,
      excludedInBothSamples: 8,
    });
  });

  it('refuses an R23 baseline that no longer states the canonical history', () => {
    const moved = structuredClone(committedR23) as Record<string, Record<string, number>>;
    moved['setP']!['measurableSurvivorCount'] = 141;
    expect(codeOf(() => requireR23HistoricalBaseline(moved))).toBe(
      'R29_R23_HISTORICAL_BASELINE_INPUT_INVALID',
    );
  });
});

describe('2D-A3 R29: stated constants and counters', () => {
  it('the stated canonical constants equal the canonical contracts', () => {
    expect(R29_STATED_CANONICAL_SAMPLE_CONSTANTS).toEqual({
      setPMaxPagesPerOrganisation: SET_P_MAX_PAGES_PER_ORGANISATION,
      setRMaxPagesPerOrganisation: SET_R_MAX_PAGES_PER_ORGANISATION,
      k3SurvivorProcedure: K3_SD7_SURVIVOR_PROCEDURE,
      k3SurvivorScope: K3_SD7_SURVIVOR_SCOPE,
      k3GraphScope: K3_SD7_GRAPH_SCOPE,
      setPDocumentCapExact: SET_P_DOCUMENT_CAP_EXACT,
      setRDocumentCapExact: SET_R_DOCUMENT_CAP_EXACT,
      setRInitialCapExact: SET_R_INITIAL_CAP_EXACT,
      setRFullSampleRankMembershipExact: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    });
  });

  it('counted zero R23 V1 mints across every test in this file', () => {
    expect(calls.r23Mint).toBe(0);
    expect(calls.prepare).toBeGreaterThan(0);
    expect(calls.divergence).toBeGreaterThan(0);
  });
});

/**
 * PHASE 2B-2D A3 R36 — THE V4 SAMPLE BINDER AGAINST STAND-IN R35 BRANDS.
 *
 * A genuine R35 batch exists only behind a real R33 mint of real runs, which
 * needs the database a unit test must not open. To exercise the R36 binder's
 * ACCEPTANCE path anyway, this file replaces R35's brand / provenance
 * accessors - and R35's census derivation - with test-only stand-ins backed
 * by a test-owned registry (`vi.mock`, this file only). Everything R36 owns
 * runs unchanged: the binder, the reproduction gate, R23's real preparation
 * (counted, delegating), the real committed V4 snapshot and the real
 * committed R23 / R29 / R35 records. The real chain, recorded in the audit,
 * repeats the key checks on genuine R35 objects.
 *
 * Proves:
 *
 *   - a registered batch plus the proof minted for exactly it is accepted,
 *     prepared with exactly one R23 call per slot over the exact R34 slot and
 *     the exact R35 graph object, and each minted preparation holds R23's
 *     objects by reference;
 *   - without a proof, with a copied proof, with another batch's proof, as a
 *     spread / structuredClone / JSON copy, with a cloned graph, with a
 *     repeated graph or after a first preparation, the binder refuses with
 *     zero R23 calls;
 *   - a refusal on the SEVENTH slot leaves no earlier preparation minted;
 *   - coverage and census are sums of per-slot counts and disclose nothing.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type * as R23PrepareModule from '../harness/phase2b2d/a3samples/prepare.js';
import type * as R35DevTrainModule from '../harness/phase2b2d/a3graphsV4/devTrain.js';
import type * as R35CensusModule from '../harness/phase2b2d/a3graphsV4/census.js';
import { prepareSetRDocumentScore } from '../harness/phase2b2d/a3prep/setRScore.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3PageEvidenceId,
  A3SelectionIndex,
  A3TrackCandidateObservation,
} from '../harness/phase2b2d/a3prep/types.js';
import type { A3DocumentSourceEntry } from '../harness/phase2b2d/a3documents/types.js';
import type { NearDuplicateGraphMeasurement } from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';

const stand = vi.hoisted(() => ({
  prepare: 0,
  prepareInputs: [] as { slot: unknown; graph: unknown }[],
  divergence: 0,
  r35Derive: 0,
  batches: new WeakSet<object>(),
  graphs: new WeakSet<object>(),
  slotByGraph: new WeakMap<object, object>(),
  graphBySlot: new WeakMap<object, object>(),
  documentBatchByBatch: new WeakMap<object, object>(),
  batchByDocumentBatch: new WeakMap<object, object>(),
  census: undefined as unknown,
}));

vi.mock('../harness/phase2b2d/a3samples/prepare.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R23PrepareModule>();
  return {
    ...actual,
    prepareUnboundSlotSampleSurvivors: (
      ...args: Parameters<typeof actual.prepareUnboundSlotSampleSurvivors>
    ) => {
      stand.prepare += 1;
      stand.prepareInputs.push({ slot: args[0], graph: args[1] });
      return actual.prepareUnboundSlotSampleSurvivors(...args);
    },
    sampleSurvivorDivergence: (...args: Parameters<typeof actual.sampleSurvivorDivergence>) => {
      stand.divergence += 1;
      return actual.sampleSurvivorDivergence(...args);
    },
  };
});

vi.mock('../harness/phase2b2d/a3graphsV4/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R35DevTrainModule>();
  const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;
  return {
    ...actual,
    isA3DevTrainSd7GraphDeltaBatchV4: (value: unknown) =>
      isObject(value) && stand.batches.has(value),
    isA3DevTrainSlotSd7GraphMeasurementDeltaV4: (value: unknown) =>
      isObject(value) && stand.graphs.has(value),
    documentSourceDeltaSlotForDeltaGraphV4: (graph: unknown) =>
      isObject(graph) ? stand.slotByGraph.get(graph) : undefined,
    deltaGraphForDocumentSourceDeltaSlotV4: (slot: unknown) =>
      isObject(slot) ? stand.graphBySlot.get(slot) : undefined,
    documentSourceDeltaBatchForGraphDeltaBatchV4: (batch: unknown) =>
      isObject(batch) ? stand.documentBatchByBatch.get(batch) : undefined,
    graphDeltaBatchForDocumentSourceDeltaBatchV4: (batch: unknown) =>
      isObject(batch) ? stand.batchByDocumentBatch.get(batch) : undefined,
  };
});

vi.mock('../harness/phase2b2d/a3graphsV4/census.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R35CensusModule>();
  return {
    ...actual,
    deriveR35PublicIncrementalSd7GraphCensus: () => {
      stand.r35Derive += 1;
      return JSON.parse(JSON.stringify(stand.census)) as unknown;
    },
  };
});

const { sampleSurvivorDivergence } = await import('../harness/phase2b2d/a3samples/prepare.js');
const { A3SampleRefusal } = await import('../harness/phase2b2d/a3samples/refusal.js');
const { loadCommittedA2GovernanceV4 } =
  await import('../harness/phase2b2d/a3governanceV4/snapshotV4.js');
const {
  bindDevTrainSampleSurvivorDeltaBatchV4,
  deltaGraphForSamplePreparationV4,
  graphDeltaBatchForSampleDeltaBatchV4,
  isA3DevTrainSampleSurvivorDeltaBatchV4,
  isA3DevTrainSlotSampleSurvivorPreparationDeltaV4,
  sampleDeltaBatchForGraphDeltaBatchV4,
  samplePreparationForDeltaGraphV4,
} = await import('../harness/phase2b2d/a3samplesV4/devTrain.js');
const {
  r35ReproductionProofForBatch,
  requireFreshR35Reproduction,
  requireHistoricalSamplePreparationBaseline,
} = await import('../harness/phase2b2d/a3samplesV4/r35Drift.js');
const {
  deriveCanonicalSampleSurvivorCoverageExpansionV4,
  deriveDeltaSampleAggregatesV4,
  deriveR36PublicIncrementalSampleSurvivorCensus,
} = await import('../harness/phase2b2d/a3samplesV4/census.js');
const { A3SampleV4Refusal } = await import('../harness/phase2b2d/a3samplesV4/refusal.js');
import type { A3DevTrainSd7GraphDeltaBatchV4 } from '../harness/phase2b2d/a3graphsV4/types.js';
import type { HistoricalGraphCoverageBaseline } from '../harness/phase2b2d/a3graphsV4/types.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const E = 'docs/evaluation';
const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(join(REPO_ROOT, E, name), 'utf8')) as unknown;
const R23_CENSUS = 'PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json';
const R29_CENSUS =
  'PHASE_2B_2D_A3_R29_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json';
const R35_CENSUS = 'PHASE_2B_2D_A3_R35_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1.json';

const COMMITTED_R35 = readJson(R35_CENSUS);
stand.census = { ...(COMMITTED_R35 as object), implementationCommit: 'f'.repeat(40) };

const V4 = loadCommittedA2GovernanceV4(REPO_ROOT);
const HISTORICAL = requireHistoricalSamplePreparationBaseline(
  readJson(R23_CENSUS),
  readJson(R29_CENSUS),
  COMMITTED_R35,
);
const R35_PROVENANCE = {
  r34Tip: '6075ec8b79dd35b820a5086da89f18ca975eb039',
  r34ScopePinCommit: '4f2c10f9e53b53804024eb7a2ebd70c9a6906158',
  implementationCommit: 'f'.repeat(40),
};
const R36_PROVENANCE = {
  r35Tip: 'e1428c35dad2e74313b58391386e65d54330d3b2',
  r35ScopePinCommit: 'e'.repeat(40),
  implementationCommit: 'd'.repeat(40),
};
const NO_GRAPH_BASELINE = {} as HistoricalGraphCoverageBaseline;

// ---------------------------------------------------------------------------
// Seven synthetic organisations: 197 exact documents, 190 measurable and 7
// short texts in total - the R35 checkpoint's own aggregate shape - with a
// mix of zero-edge, single-edge and multi-edge graphs.
// ---------------------------------------------------------------------------

const SELECTION_INDICES = [900, 901, 902, 903, 904, 905, 906] as const;
const DOCUMENTS_PER_SLOT = [30, 30, 30, 30, 30, 30, 17] as const;
/** Slot positions of short texts (0 scores highest under SET_R). */
const SHORT_PER_SLOT: readonly (readonly number[])[] = [
  [],
  [29],
  [0, 15],
  [],
  [10],
  [5, 20, 25],
  [],
];
const EDGES_PER_SLOT: readonly (readonly (readonly [number, number])[])[] = [
  [[1, 2]],
  [],
  [
    [3, 4],
    [4, 5],
    [7, 9],
  ],
  [
    [0, 1],
    [1, 2],
    [2, 3],
    [10, 11],
  ],
  [[2, 3]],
  [],
  [
    [0, 5],
    [5, 6],
  ],
];

const sha = (label: string): A3DocumentSha256 =>
  createHash('sha256')
    .update(`synthetic-a3-r36-binder:${label}`, 'utf8')
    .digest('hex') as A3DocumentSha256;

function obs(page: A3PageEvidenceId, track: string, score: string): A3TrackCandidateObservation {
  return {
    pageEvidenceId: page,
    track,
    candidateScoreDecimal: score,
    ruleVersion: 'orgunit-signal-rules-v1',
  } as never;
}

function entry(selectionIndex: number, label: string, score: string): A3DocumentSourceEntry {
  const documentSha256 = sha(label);
  const id = `pe-${label}-0` as A3PageEvidenceId;
  const document = {
    selectionIndex: selectionIndex as A3SelectionIndex,
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

function graphFor(
  documents: readonly A3DocumentSourceEntry[],
  short: readonly number[],
  edges: readonly (readonly [number, number])[],
): NearDuplicateGraphMeasurement {
  const shortSet = new Set(short);
  const graphDocuments = documents.map((e, i) => ({
    documentSha256: e.document.documentSha256 as string,
    tokenCount: shortSet.has(i) ? 2 : 50,
    shingleCount: shortSet.has(i) ? 0 : 46,
    measurable: !shortSet.has(i),
  }));
  const measurableIndices = graphDocuments.flatMap((d, i) => (d.measurable ? [i] : []));
  return Object.freeze({
    documents: graphDocuments,
    measurableIndices,
    shortTextUnresolvedCount: graphDocuments.length - measurableIndices.length,
    comparedPairCount: (measurableIndices.length * (measurableIndices.length - 1)) / 2,
    edges: edges.map(([a, b]) => ({
      aIndex: Math.min(a, b),
      bIndex: Math.max(a, b),
      measurement: {
        intersectionSize: 9,
        unionSize: 10,
        similarity: 0.9,
        atOrAboveThreshold: true,
      },
    })),
  });
}

interface StandIn {
  readonly batch: A3DevTrainSd7GraphDeltaBatchV4;
  readonly graphs: readonly object[];
  readonly slots: readonly object[];
}

let batchCounter = 0;

/** Registers one stand-in R35 batch (and its stand-in R34 batch) in the test-owned registry. */
function standInBatch(options: { poisonLastGraph?: boolean } = {}): StandIn {
  batchCounter += 1;
  const slots: object[] = [];
  const graphs: object[] = [];
  DOCUMENTS_PER_SLOT.forEach((count, position) => {
    const selectionIndex = SELECTION_INDICES[position]!;
    const documents = Array.from({ length: count }, (_, i) =>
      entry(selectionIndex, `b${batchCounter}-s${position}-d${i}`, String(1000 - i)),
    );
    const slot = Object.freeze({
      kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V4',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      selectionIndex,
      split: 'DEV_TRAIN',
      exactDuplicate: {},
      documents: Object.freeze(documents),
      candidateObservationCount: count * 2,
    });
    // The poisoned 7th graph measures a DIFFERENT population (same counts).
    const graphDocuments =
      options.poisonLastGraph === true && position === DOCUMENTS_PER_SLOT.length - 1
        ? Array.from({ length: count }, (_, i) =>
            entry(selectionIndex, `b${batchCounter}-poison-d${i}`, String(1000 - i)),
          )
        : documents;
    const graph = Object.freeze({
      kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_DELTA_V4',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      selectionIndex,
      split: 'DEV_TRAIN',
      graph: graphFor(graphDocuments, SHORT_PER_SLOT[position]!, EDGES_PER_SLOT[position]!),
    });
    stand.graphs.add(graph);
    stand.slotByGraph.set(graph, slot);
    stand.graphBySlot.set(slot, graph);
    slots.push(slot);
    graphs.push(graph);
  });
  const evidenceDeltaBatch = Object.freeze({
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V4',
    split: 'DEV_TRAIN',
    governanceSnapshotV4: V4,
    items: Object.freeze([]),
    coverage: Object.freeze({
      changedExistingCount: 0,
      removedCount: 0,
      legacyAuthorityEvidenceRequests: 0,
      deltaAuthorityEvidenceRequests: 7,
      newlyBoundDeltaCount: 7,
      unchangedCanonicalCoverageCount: 6,
      historicalCanonicalCoverageCount: 6,
      v4DevTrainReadyCount: 13,
    }),
  });
  const documentBatch = Object.freeze({
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V4',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV4: V4,
    evidenceDeltaBatch,
    items: Object.freeze(slots),
  });
  const batch = Object.freeze({
    kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V4',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV4: V4,
    documentSourceDeltaBatch: documentBatch,
    items: Object.freeze(graphs),
  }) as unknown as A3DevTrainSd7GraphDeltaBatchV4;
  stand.batches.add(batch);
  stand.documentBatchByBatch.set(batch, documentBatch);
  stand.batchByDocumentBatch.set(documentBatch, batch);
  return { batch, graphs, slots };
}

function prove(batch: A3DevTrainSd7GraphDeltaBatchV4) {
  return requireFreshR35Reproduction(batch, NO_GRAPH_BASELINE, R35_PROVENANCE, COMMITTED_R35);
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof A3SampleV4Refusal || error instanceof A3SampleRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}

// ---------------------------------------------------------------------------

describe('2D-A3 R36: a stand-in R35 batch with its own proof is prepared exactly once', () => {
  const { batch, graphs, slots } = standInBatch();
  const proof = prove(batch);
  const before = stand.prepare;
  const inputsBefore = stand.prepareInputs.length;
  const prepared = bindDevTrainSampleSurvivorDeltaBatchV4(batch, proof);
  const r23Calls = stand.prepare - before;
  const inputs = stand.prepareInputs.slice(inputsBefore);

  it('brands the batch and every preparation, both ways', () => {
    expect(isA3DevTrainSampleSurvivorDeltaBatchV4(prepared)).toBe(true);
    expect(graphDeltaBatchForSampleDeltaBatchV4(prepared)).toBe(batch);
    expect(sampleDeltaBatchForGraphDeltaBatchV4(batch)).toBe(prepared);
    expect(prepared.graphDeltaBatch).toBe(batch);
    expect(prepared.governanceSnapshotV4).toBe(V4);
    expect(prepared.items).toHaveLength(7);
    prepared.items.forEach((item, position) => {
      expect(isA3DevTrainSlotSampleSurvivorPreparationDeltaV4(item)).toBe(true);
      expect(deltaGraphForSamplePreparationV4(item)).toBe(graphs[position]);
      expect(samplePreparationForDeltaGraphV4(graphs[position])).toBe(item);
      expect(item.selectionIndex).toBe(SELECTION_INDICES[position]);
      expect(Object.isFrozen(item)).toBe(true);
    });
  });

  it('§32: seven R23 calls, each with the exact R34 slot and the exact R35 graph object', () => {
    expect(r23Calls).toBe(7);
    expect(inputs).toHaveLength(7);
    inputs.forEach((input, position) => {
      expect(input.slot).toBe(slots[position]);
      expect(input.graph).toBe((graphs[position] as { graph: unknown }).graph);
    });
  });

  it("§21 / §36: holds R23's canonical objects by reference, with the same graph for both samples", () => {
    prepared.items.forEach((item, position) => {
      const graph = (graphs[position] as { graph: NearDuplicateGraphMeasurement }).graph;
      // Both samples ranked exactly the graph's population.
      const population = new Set(graph.documents.map((d) => d.documentSha256));
      for (const sample of [item.setP, item.setR]) {
        expect(new Set(sample.preSd7FullRank.map((e) => e.documentSha256 as string))).toEqual(
          population,
        );
        expect(sample.sd7Preparation.counts.shortTextUnresolvedCount).toBe(
          graph.shortTextUnresolvedCount,
        );
      }
      expect(item.setRFreezeSlotReadiness.shortTextUnresolvedCount).toBe(
        graph.shortTextUnresolvedCount,
      );
    });
  });

  it('§23: full-rank readiness is short-text-blocked exactly on the slots with short text', () => {
    prepared.items.forEach((item, position) => {
      expect(item.setRFreezeSlotReadiness.fullRankReadiness).toBe(
        SHORT_PER_SLOT[position]!.length === 0
          ? 'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT'
          : 'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT',
      );
    });
  });

  it('§22: the delta aggregates are per-slot sums that close at 197 / 190 / 7', () => {
    const aggregates = deriveDeltaSampleAggregatesV4(prepared);
    for (const sample of [aggregates.setP, aggregates.setR]) {
      expect(sample.preSd7RankEntryCount).toBe(197);
      expect(sample.measurableDocumentCount).toBe(190);
      expect(sample.unresolvedShortTextOccurrenceCount).toBe(7);
      expect(sample.measurableSurvivorCount + sample.measurableExclusionCount).toBe(190);
      expect(sample.initialCapExactSlotCount + sample.initialCapBlockedSlotCount).toBe(7);
    }
    expect(aggregates.setR.fullRankExactSlotCount).toBe(3);
    expect(aggregates.setR.fullRankShortTextBlockedSlotCount).toBe(4);
    const d = aggregates.divergence;
    expect(
      d.survivingBothSamples + d.survivingSetPOnly + d.survivingSetROnly + d.excludedInBothSamples,
    ).toBe(190);
    // Exactly one slot (position 0) is single-edge and short-text-free.
    expect(aggregates.singleEdgeNoShortTextSlots).toBe(1);
    expect(
      aggregates.singleEdgeSlotsSameExcludedEndpoint +
        aggregates.singleEdgeSlotsOppositeExcludedEndpoints,
    ).toBe(1);
    // The divergence total is R23's own helper summed, nothing else.
    let both = 0;
    prepared.items.forEach((item, position) => {
      both += sampleSurvivorDivergence(
        item,
        (graphs[position] as { graph: NearDuplicateGraphMeasurement }).graph,
      ).survivingBothSamples;
    });
    expect(d.survivingBothSamples).toBe(both);
  });

  it('§39: coverage is historical six + delta seven, as counts only', () => {
    const expansion = deriveCanonicalSampleSurvivorCoverageExpansionV4(prepared, HISTORICAL);
    expect(expansion.historicalSlotPreparations).toBe(6);
    expect(expansion.deltaSlotPreparations).toBe(7);
    expect(expansion.coverageSlotPreparations).toBe(13);
    for (const sample of [expansion.coverage.setP, expansion.coverage.setR]) {
      expect(sample.preSd7RankEntryCount).toBe(388);
      expect(sample.measurableDocumentCount).toBe(380);
      expect(sample.unresolvedShortTextOccurrenceCount).toBe(8);
      expect(sample.initialCapExactSlotCount + sample.initialCapBlockedSlotCount).toBe(13);
    }
    expect(expansion.coverage.divergence.measurableDocumentCount).toBe(380);
    expect(expansion.coverage.setP.measurableSurvivorCount).toBe(
      176 + expansion.delta.setP.measurableSurvivorCount,
    );
    expect(expansion.coverage.setR.fullRankExactSlotCount).toBe(5 + 3);
  });

  it('the census authorises nothing and carries no identity, per-slot value or array of numbers', () => {
    const census = deriveR36PublicIncrementalSampleSurvivorCensus(
      prepared,
      HISTORICAL,
      R36_PROVENANCE,
    );
    expect(census.thisFileAuthorises).toEqual([]);
    expect(census.coverage.thirteenSlotSampleBatchMinted).toBe(false);
    expect(census.r35Reproduction.freshR35CensusEqualsCommitted).toBe(true);
    expect(census.access.r36SqlStatements).toBe(0);
    expect(census.access.upstreamReproducedR33OldAuthorityQueries).toBe(0);
    expect(census.access.upstreamReproducedR33DeltaAuthorityQueries).toBe(7);
    const text = JSON.stringify(census);
    for (const index of SELECTION_INDICES) expect(text).not.toMatch(new RegExp(`\\b${index}\\b`));
    expect(text).not.toMatch(/\[\s*\d/);
    expect(text).not.toMatch(/\b[0-9a-f]{64}\b/);
    expect(text).not.toMatch(
      /sampleDeltaHash|survivorCoverageHash|rankExpansionHash|capExpansionHash/,
    );
    for (const item of prepared.items) {
      for (const entry of item.setP.preSd7FullRank) {
        expect(text.includes(entry.documentSha256)).toBe(false);
      }
    }
  });

  it('§31: a second preparation of the same batch refuses with zero R23 calls', () => {
    const again = stand.prepare;
    expect(codeOf(() => bindDevTrainSampleSurvivorDeltaBatchV4(batch, proof))).toBe(
      'R36_SD7_GRAPH_DELTA_ALREADY_PREPARED',
    );
    expect(stand.prepare).toBe(again);
  });

  it('a second reproduction proof for the same batch refuses', () => {
    expect(codeOf(() => prove(batch))).toBe('R36_R35_REPRODUCTION_ALREADY_PROVED');
    expect(r35ReproductionProofForBatch(batch)).toBe(proof);
  });
});

describe('2D-A3 R36 §9 / §31: the binder refuses everything but the exact batch and its proof', () => {
  it('a genuine batch without its proof, or with a copied / foreign proof, refuses', () => {
    const { batch } = standInBatch();
    const other = standInBatch();
    const proof = prove(batch);
    const otherProof = prove(other.batch);
    const before = stand.prepare;
    for (const candidate of [
      undefined,
      {},
      { ...proof },
      structuredClone(proof),
      JSON.parse(JSON.stringify(proof)) as unknown,
      otherProof,
    ]) {
      expect(codeOf(() => bindDevTrainSampleSurvivorDeltaBatchV4(batch, candidate))).toBe(
        'R36_R35_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      );
    }
    expect(stand.prepare).toBe(before);
    // The genuine pair still works afterwards: nothing was consumed.
    expect(
      isA3DevTrainSampleSurvivorDeltaBatchV4(bindDevTrainSampleSurvivorDeltaBatchV4(batch, proof)),
    ).toBe(true);
  });

  it('a spread, structured clone, JSON copy or literal of a proved batch refuses', () => {
    const { batch, graphs } = standInBatch();
    const proof = prove(batch);
    const before = stand.prepare;
    for (const candidate of [
      { ...batch },
      structuredClone(batch),
      JSON.parse(JSON.stringify(batch)) as unknown,
      { ...batch, items: [...batch.items] },
      graphs[0],
    ]) {
      expect(codeOf(() => bindDevTrainSampleSurvivorDeltaBatchV4(candidate, proof))).toBe(
        'R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35',
      );
    }
    expect(stand.prepare).toBe(before);
  });

  it('a registered batch holding a cloned graph refuses before any R23 call', () => {
    const { batch } = standInBatch();
    const cloned = { ...batch.items[0]! };
    const tampered = Object.freeze({
      ...batch,
      items: Object.freeze([cloned, ...batch.items.slice(1)]),
    });
    stand.batches.add(tampered);
    stand.documentBatchByBatch.set(tampered, batch.documentSourceDeltaBatch);
    stand.census = { ...(COMMITTED_R35 as object), implementationCommit: 'f'.repeat(40) };
    const proof = prove(tampered as unknown as A3DevTrainSd7GraphDeltaBatchV4);
    const before = stand.prepare;
    expect(codeOf(() => bindDevTrainSampleSurvivorDeltaBatchV4(tampered, proof))).toBe(
      'R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35',
    );
    expect(stand.prepare).toBe(before);
  });

  it('a registered batch repeating a graph refuses before any R23 call', () => {
    const { batch } = standInBatch();
    const documentBatch = Object.freeze({
      ...batch.documentSourceDeltaBatch,
      items: Object.freeze([
        batch.documentSourceDeltaBatch.items[0]!,
        batch.documentSourceDeltaBatch.items[0]!,
        ...batch.documentSourceDeltaBatch.items.slice(2),
      ]),
    });
    const repeated = Object.freeze({
      ...batch,
      documentSourceDeltaBatch: documentBatch,
      items: Object.freeze([batch.items[0]!, batch.items[0]!, ...batch.items.slice(2)]),
    });
    stand.batches.add(repeated);
    stand.documentBatchByBatch.set(repeated, documentBatch);
    stand.batchByDocumentBatch.set(documentBatch, repeated);
    const proof = prove(repeated as unknown as A3DevTrainSd7GraphDeltaBatchV4);
    const before = stand.prepare;
    expect(codeOf(() => bindDevTrainSampleSurvivorDeltaBatchV4(repeated, proof))).toBe(
      'R36_DELTA_BATCH_COMPOSITION_INVALID',
    );
    expect(stand.prepare).toBe(before);
  });

  it('a registered batch whose R34 batch does not map back refuses', () => {
    const { batch } = standInBatch();
    stand.batchByDocumentBatch.delete(batch.documentSourceDeltaBatch);
    const proof = prove(batch);
    const before = stand.prepare;
    expect(codeOf(() => bindDevTrainSampleSurvivorDeltaBatchV4(batch, proof))).toBe(
      'R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35',
    );
    expect(stand.prepare).toBe(before);
  });

  it('a registered batch whose graph-to-slot provenance is broken refuses', () => {
    const { batch, slots } = standInBatch();
    stand.graphBySlot.delete(slots[3]!);
    const proof = prove(batch);
    const before = stand.prepare;
    expect(codeOf(() => bindDevTrainSampleSurvivorDeltaBatchV4(batch, proof))).toBe(
      'R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35',
    );
    expect(stand.prepare).toBe(before);
  });

  it('a reproduction whose counts disagree with the actual batch refuses as not additive', () => {
    const { batch } = standInBatch();
    const drifted = JSON.parse(JSON.stringify(COMMITTED_R35)) as Record<
      string,
      Record<string, unknown>
    >;
    // A census that EQUALS a moved committed record still trips the checkpoint.
    drifted['deltaGraph']!['deltaDocuments'] = 198;
    stand.census = drifted;
    expect(
      codeOf(() => requireFreshR35Reproduction(batch, NO_GRAPH_BASELINE, R35_PROVENANCE, drifted)),
    ).toBe('STOP_R36_FRESH_R35_REPRODUCTION_DRIFT_REQUIRES_REVIEW');
    expect(
      codeOf(() =>
        requireFreshR35Reproduction(batch, NO_GRAPH_BASELINE, R35_PROVENANCE, COMMITTED_R35),
      ),
    ).toBe('STOP_R36_FRESH_R35_REPRODUCTION_DRIFT_REQUIRES_REVIEW');
    stand.census = { ...(COMMITTED_R35 as object), implementationCommit: 'f'.repeat(40) };
  });
});

describe('2D-A3 R36 §18 / §36: all or nothing across the seven delta slots', () => {
  it('an R23 refusal on the SEVENTH slot leaves no earlier preparation minted', () => {
    const { batch, graphs } = standInBatch({ poisonLastGraph: true });
    const proof = prove(batch);
    const before = stand.prepare;
    expect(codeOf(() => bindDevTrainSampleSurvivorDeltaBatchV4(batch, proof))).toBe(
      'R23_GRAPH_DOCUMENT_COVERAGE_MISMATCH',
    );
    // Seven R23 calls were made; the seventh refused; nothing was minted.
    expect(stand.prepare).toBe(before + 7);
    for (const graph of graphs) expect(samplePreparationForDeltaGraphV4(graph)).toBeUndefined();
    expect(sampleDeltaBatchForGraphDeltaBatchV4(batch)).toBeUndefined();
  });
});

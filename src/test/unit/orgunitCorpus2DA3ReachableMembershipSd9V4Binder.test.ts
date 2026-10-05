/**
 * PHASE 2B-2D A3 R37 — THE V4 READINESS BINDER AGAINST STAND-IN R36 BRANDS.
 *
 * A genuine R36 batch exists only behind a real R33 mint of real runs, which
 * needs the database a unit test must not open. To exercise the R37 binder's
 * ACCEPTANCE path anyway, this file replaces R36's brand / provenance
 * accessors - and R36's census derivation - with test-only stand-ins backed
 * by a test-owned registry (`vi.mock`, this file only). Everything R37 owns
 * runs unchanged: the binder, the reproduction gate, the historical baseline,
 * R24's real readiness helper (counted, delegating), R36's real delta
 * aggregation, R23's real preparation, the real committed V4 snapshot and the
 * real committed R24 / R30 / R36 records. The real chain, recorded in the
 * audit, repeats the key checks on genuine R36 objects.
 *
 * Proves:
 *
 *   - a registered batch plus the proof minted for exactly it is accepted,
 *     derived with exactly one R24 call per preparation - the preparation
 *     object itself - and each minted readiness holds R24's objects by
 *     reference;
 *   - without a proof, with a copied / foreign / R35-shaped proof, as a
 *     spread / structuredClone / JSON copy / literal, with a cloned or
 *     repeated preparation, as any upstream or V2 batch, as a historical R23
 *     shape, as the committed R36 census, as undefined, or after a first bind,
 *     the binder refuses with zero R24 calls;
 *   - a refusal on the SEVENTH preparation leaves no earlier readiness minted;
 *   - coverage and census are sums of per-slot counts and disclose nothing.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type * as R24MembershipModule from '../harness/phase2b2d/a3readiness/membership.js';
import type * as R36DevTrainModule from '../harness/phase2b2d/a3samplesV4/devTrain.js';
import type * as R36CensusModule from '../harness/phase2b2d/a3samplesV4/census.js';
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
  helper: 0,
  helperInputs: [] as unknown[],
  r36Derive: 0,
  tamperR36Aggregate: false,
  batches: new WeakSet<object>(),
  preparations: new WeakSet<object>(),
  graphByPreparation: new WeakMap<object, object>(),
  preparationByGraph: new WeakMap<object, object>(),
  graphBatchBySampleBatch: new WeakMap<object, object>(),
  sampleBatchByGraphBatch: new WeakMap<object, object>(),
  census: undefined as unknown,
}));

vi.mock('../harness/phase2b2d/a3readiness/membership.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R24MembershipModule>();
  return {
    ...actual,
    deriveUnboundSlotReachableMembershipReadiness: (
      ...args: Parameters<typeof actual.deriveUnboundSlotReachableMembershipReadiness>
    ) => {
      stand.helper += 1;
      stand.helperInputs.push(args[0]);
      return actual.deriveUnboundSlotReachableMembershipReadiness(...args);
    },
  };
});

vi.mock('../harness/phase2b2d/a3samplesV4/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R36DevTrainModule>();
  const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;
  return {
    ...actual,
    isA3DevTrainSampleSurvivorDeltaBatchV4: (value: unknown) =>
      isObject(value) && stand.batches.has(value),
    isA3DevTrainSlotSampleSurvivorPreparationDeltaV4: (value: unknown) =>
      isObject(value) && stand.preparations.has(value),
    deltaGraphForSamplePreparationV4: (value: unknown) =>
      isObject(value) ? stand.graphByPreparation.get(value) : undefined,
    samplePreparationForDeltaGraphV4: (value: unknown) =>
      isObject(value) ? stand.preparationByGraph.get(value) : undefined,
    graphDeltaBatchForSampleDeltaBatchV4: (value: unknown) =>
      isObject(value) ? stand.graphBatchBySampleBatch.get(value) : undefined,
    sampleDeltaBatchForGraphDeltaBatchV4: (value: unknown) =>
      isObject(value) ? stand.sampleBatchByGraphBatch.get(value) : undefined,
  };
});

vi.mock('../harness/phase2b2d/a3samplesV4/census.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R36CensusModule>();
  return {
    ...actual,
    deriveR36PublicIncrementalSampleSurvivorCensus: () => {
      stand.r36Derive += 1;
      return JSON.parse(JSON.stringify(stand.census)) as unknown;
    },
    deriveDeltaSampleAggregatesV4: (
      ...args: Parameters<typeof actual.deriveDeltaSampleAggregatesV4>
    ) => {
      const real = actual.deriveDeltaSampleAggregatesV4(...args);
      if (!stand.tamperR36Aggregate) return real;
      return {
        ...real,
        setP: { ...real.setP, initialCapExactSlotCount: real.setP.initialCapExactSlotCount + 1 },
      };
    },
  };
});

const { prepareUnboundSlotSampleSurvivors } =
  await import('../harness/phase2b2d/a3samples/prepare.js');
const { A3ReadinessRefusal } = await import('../harness/phase2b2d/a3readiness/refusal.js');
const { REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT } =
  await import('../harness/phase2b2d/a3readiness/types.js');
const { loadCommittedA2GovernanceV4 } =
  await import('../harness/phase2b2d/a3governanceV4/snapshotV4.js');
const {
  bindDevTrainReachableMembershipSd9DeltaBatchV4,
  deltaReadinessForSamplePreparationV4,
  isA3DevTrainReachableMembershipSd9DeltaBatchV4,
  isA3DevTrainSlotReachableMembershipSd9DeltaV4,
  readinessDeltaBatchForSampleDeltaBatchV4,
  sampleDeltaBatchForReadinessDeltaBatchV4,
  samplePreparationForDeltaReadinessV4,
} = await import('../harness/phase2b2d/a3readinessV4/devTrain.js');
const {
  r36ReproductionProofForBatch,
  requireFreshR36Reproduction,
  requireHistoricalReadinessBaselineV4,
} = await import('../harness/phase2b2d/a3readinessV4/r36Drift.js');
const {
  deriveCanonicalReachableMembershipSd9CoverageExpansionV4,
  deriveDeltaReadinessAggregatesV4,
  deriveR37PublicIncrementalReachableMembershipSd9Census,
} = await import('../harness/phase2b2d/a3readinessV4/census.js');
const { A3ReadinessV4Refusal } = await import('../harness/phase2b2d/a3readinessV4/refusal.js');
import type { A3DevTrainSampleSurvivorDeltaBatchV4 } from '../harness/phase2b2d/a3samplesV4/types.js';
import type { HistoricalSamplePreparationBaselineV4 } from '../harness/phase2b2d/a3samplesV4/types.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(join(REPO_ROOT, 'docs/evaluation', name), 'utf8')) as unknown;
const COMMITTED_R24 = readJson(
  'PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS_V1.json',
);
const COMMITTED_R30 = readJson(
  'PHASE_2B_2D_A3_R30_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1.json',
);
const COMMITTED_R36 = readJson(
  'PHASE_2B_2D_A3_R36_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json',
);
const freshCensus = (): unknown => ({
  ...(COMMITTED_R36 as object),
  implementationCommit: 'f'.repeat(40),
});
stand.census = freshCensus();

const V4 = loadCommittedA2GovernanceV4(REPO_ROOT);
const HISTORICAL = requireHistoricalReadinessBaselineV4(
  COMMITTED_R24,
  COMMITTED_R30,
  COMMITTED_R36,
);
const NO_SAMPLE_BASELINE = {} as HistoricalSamplePreparationBaselineV4;
const R36_PROVENANCE = {
  r35Tip: 'e1428c35dad2e74313b58391386e65d54330d3b2',
  r35ScopePinCommit: '8c090a6ef28b40d26c72b8cb5ac090f4474af23a',
  implementationCommit: 'f'.repeat(40),
};
const R37_PROVENANCE = {
  r36Tip: '20bfa9082f406587bb401e85edfc4ea6fe33acc3',
  r36ScopePinCommit: 'e'.repeat(40),
  implementationCommit: 'd'.repeat(40),
};

// ---------------------------------------------------------------------------
// Seven synthetic organisations, prepared by R23's REAL helper: a mix of
// short-text-free, tail-short-text and head-short-text slots, with and
// without near-duplicate edges.
// ---------------------------------------------------------------------------

const SELECTION_INDICES = [920, 921, 922, 923, 924, 925, 926] as const;
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
    .update(`synthetic-a3-r37-binder:${label}`, 'utf8')
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
  readonly batch: A3DevTrainSampleSurvivorDeltaBatchV4;
  readonly preparations: readonly Record<string, unknown>[];
  readonly graphs: readonly object[];
  readonly graphBatch: Record<string, unknown>;
}

let batchCounter = 0;

function evidenceCoverage(overrides: Record<string, number> = {}) {
  return Object.freeze({
    changedExistingCount: 0,
    removedCount: 0,
    legacyAuthorityEvidenceRequests: 0,
    deltaAuthorityEvidenceRequests: 7,
    newlyBoundDeltaCount: 7,
    unchangedCanonicalCoverageCount: 6,
    historicalCanonicalCoverageCount: 6,
    v4DevTrainReadyCount: 13,
    ...overrides,
  });
}

/** Registers one stand-in R36 batch (and its stand-in R35 / R34 / R33 batches). */
function standInBatch(
  options: {
    poisonLastPreparation?: boolean;
    split?: string;
    coverage?: Record<string, number>;
    graphSnapshot?: object;
  } = {},
): StandIn {
  batchCounter += 1;
  const split = options.split ?? 'DEV_TRAIN';
  const unbound = DOCUMENTS_PER_SLOT.map((count, position) => {
    const selectionIndex = SELECTION_INDICES[position]!;
    const documents = Array.from({ length: count }, (_, i) =>
      entry(selectionIndex, `b${batchCounter}-s${position}-d${i}`, String(1000 - i)),
    );
    const graph = graphFor(documents, SHORT_PER_SLOT[position]!, EDGES_PER_SLOT[position]!);
    return {
      graph,
      prepared: prepareUnboundSlotSampleSurvivors(
        { selectionIndex: selectionIndex as A3SelectionIndex, split: 'DEV_TRAIN', documents },
        graph,
      ),
    };
  });
  const preparations: Record<string, unknown>[] = [];
  const graphs: object[] = [];
  unbound.forEach(({ graph, prepared }, position) => {
    const last = position === unbound.length - 1;
    const preparation = Object.freeze({
      kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_DELTA_V4',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      selectionIndex: prepared.selectionIndex,
      split,
      setP: prepared.setP,
      setR: prepared.setR,
      setRDocumentCap: prepared.setRDocumentCap,
      // The poisoned 7th preparation carries ANOTHER slot's SET_R readiness:
      // R24's own consistency check refuses it.
      setRFreezeSlotReadiness:
        options.poisonLastPreparation === true && last
          ? unbound[0]!.prepared.setRFreezeSlotReadiness
          : prepared.setRFreezeSlotReadiness,
    });
    const graphWrapper = Object.freeze({
      kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_DELTA_V4',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      selectionIndex: prepared.selectionIndex,
      split,
      graph,
    });
    stand.preparations.add(preparation);
    stand.graphByPreparation.set(preparation, graphWrapper);
    stand.preparationByGraph.set(graphWrapper, preparation);
    preparations.push(preparation);
    graphs.push(graphWrapper);
  });
  const placeholders = Object.freeze(SELECTION_INDICES.map((index) => Object.freeze({ index })));
  const evidenceDeltaBatch = Object.freeze({
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V4',
    split,
    governanceSnapshotV4: V4,
    items: placeholders,
    coverage: evidenceCoverage(options.coverage),
  });
  const documentBatch = Object.freeze({
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V4',
    split,
    governanceSnapshotV4: V4,
    evidenceDeltaBatch,
    items: placeholders,
  });
  const graphBatch = Object.freeze({
    kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V4',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split,
    governanceSnapshotV4: options.graphSnapshot ?? V4,
    documentSourceDeltaBatch: documentBatch,
    items: Object.freeze(graphs),
  });
  const batch = Object.freeze({
    kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V4',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split,
    governanceSnapshotV4: V4,
    graphDeltaBatch: graphBatch,
    items: Object.freeze(preparations),
  }) as unknown as A3DevTrainSampleSurvivorDeltaBatchV4;
  stand.batches.add(batch);
  stand.graphBatchBySampleBatch.set(batch, graphBatch);
  stand.sampleBatchByGraphBatch.set(graphBatch, batch);
  return { batch, preparations, graphs, graphBatch };
}

function prove(batch: A3DevTrainSampleSurvivorDeltaBatchV4) {
  stand.census = freshCensus();
  return requireFreshR36Reproduction(batch, NO_SAMPLE_BASELINE, R36_PROVENANCE, COMMITTED_R36);
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof A3ReadinessV4Refusal || error instanceof A3ReadinessRefusal) {
      return error.code;
    }
    throw error;
  }
  return 'NO_REFUSAL';
}

function documentsOf(cap: unknown): unknown {
  return (cap as { readonly documents?: unknown }).documents;
}

// ---------------------------------------------------------------------------

describe('2D-A3 R37: a stand-in R36 batch with its own proof is derived exactly once', () => {
  const { batch, preparations } = standInBatch();
  const proof = prove(batch);
  const before = stand.helper;
  const inputsBefore = stand.helperInputs.length;
  const readiness = bindDevTrainReachableMembershipSd9DeltaBatchV4(batch, proof);
  const r24Calls = stand.helper - before;
  const inputs = stand.helperInputs.slice(inputsBefore);

  it('brands the batch and every readiness, both ways', () => {
    expect(isA3DevTrainReachableMembershipSd9DeltaBatchV4(readiness)).toBe(true);
    expect(sampleDeltaBatchForReadinessDeltaBatchV4(readiness)).toBe(batch);
    expect(readinessDeltaBatchForSampleDeltaBatchV4(batch)).toBe(readiness);
    expect(readiness.sampleDeltaBatch).toBe(batch);
    expect(readiness.governanceSnapshotV4).toBe(V4);
    expect(readiness.items).toHaveLength(7);
    readiness.items.forEach((item, position) => {
      expect(isA3DevTrainSlotReachableMembershipSd9DeltaV4(item)).toBe(true);
      expect(samplePreparationForDeltaReadinessV4(item)).toBe(preparations[position]);
      expect(deltaReadinessForSamplePreparationV4(preparations[position])).toBe(item);
      expect(item.selectionIndex).toBe(SELECTION_INDICES[position]);
      expect(Object.isFrozen(item)).toBe(true);
    });
  });

  it('§35: seven R24 calls, each with the R36 preparation object itself', () => {
    expect(r24Calls).toBe(7);
    expect(inputs).toHaveLength(7);
    inputs.forEach((input, position) => expect(input).toBe(preparations[position]));
  });

  it("§13 / §15 / §22: holds R24's objects by reference; exact = cap array, blocked = none", () => {
    readiness.items.forEach((item, position) => {
      const preparation = preparations[position] as Record<string, Record<string, unknown>>;
      expect(item.setRFreezeSlotReadiness).toBe(preparation['setRFreezeSlotReadiness']);
      for (const [membership, cap] of [
        [item.setPReachableMembership, preparation['setP']!['documentCap']],
        [item.setRReachableMembership, preparation['setRDocumentCap']],
      ] as const) {
        if (membership.status === REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT) {
          expect(membership.documents).toBe(documentsOf(cap));
        } else {
          expect(Object.prototype.hasOwnProperty.call(membership, 'documents')).toBe(false);
          expect(Object.prototype.hasOwnProperty.call(cap, 'documents')).toBe(false);
        }
      }
    });
  });

  it('§16 / §18: delta aggregates close over seven slots and keep short text unresolved', () => {
    const aggregates = deriveDeltaReadinessAggregatesV4(readiness);
    expect(aggregates.slotReadinessCount).toBe(7);
    for (const sample of [aggregates.setP, aggregates.setR]) {
      expect(sample.unresolvedShortTextOccurrenceCount).toBe(7);
      expect(sample.measurableSurvivorCount + 0).toBe(sample.sd9MinEnvelopeTotal);
      expect(sample.sd9MaxEnvelopeTotal).toBe(sample.sd9MinEnvelopeTotal + 7);
      expect(
        sample.sd9MechanicalSuccessfulSlotCount +
          sample.sd9MechanicalUnsuccessfulSlotCount +
          sample.sd9MechanicalPendingSlotCount,
      ).toBe(7);
      expect(
        sample.reachableMembershipExactSlotCount + sample.reachableMembershipBlockedSlotCount,
      ).toBe(7);
      // Four slots carry short text: their full rank is blocked, whatever the cap did.
      expect(sample.fullRankShortTextBlockedSlotCount).toBe(4);
      expect(sample.fullRankExactSlotCount).toBe(3);
    }
  });

  it('§25: coverage is historical six + delta seven, as counts only', () => {
    const expansion = deriveCanonicalReachableMembershipSd9CoverageExpansionV4(
      readiness,
      HISTORICAL,
    );
    expect(expansion.historicalReadinessSlotCount).toBe(6);
    expect(expansion.deltaReadinessSlotCount).toBe(7);
    expect(expansion.coverageReadinessSlotCount).toBe(13);
    for (const name of ['setP', 'setR'] as const) {
      const h = expansion.historical[name];
      const d = expansion.delta[name];
      const c = expansion.coverage[name];
      for (const key of Object.keys(c) as (keyof typeof c)[]) expect(c[key]).toBe(h[key] + d[key]);
      expect(c.reachableMembershipExactSlotCount + c.reachableMembershipBlockedSlotCount).toBe(13);
    }
    expect(expansion.historical.setP.measurableSurvivorCount).toBe(176);
    expect(expansion.historical.setR.reachableMembershipDocumentCountAcrossExactSlots).toBe(24);
  });

  it('the census authorises nothing and carries no identity, per-slot value or array of numbers', () => {
    const census = deriveR37PublicIncrementalReachableMembershipSd9Census(
      readiness,
      HISTORICAL,
      R37_PROVENANCE,
    );
    expect(census.thisFileAuthorises).toEqual([]);
    expect(census.coverage.thirteenSlotReadinessBatchMinted).toBe(false);
    expect(census.r36Reproduction.freshR36CensusEqualsCommitted).toBe(true);
    expect(census.access.r37SqlStatements).toBe(0);
    expect(census.access.upstreamReproducedR33OldAuthorityQueries).toBe(0);
    expect(census.access.upstreamReproducedR33DeltaAuthorityQueries).toBe(7);
    expect(census.sd9AuthorityBoundary.rewritesA2AcquisitionStatus).toBe(false);
    const text = JSON.stringify(census);
    for (const index of SELECTION_INDICES) expect(text).not.toMatch(new RegExp(`\\b${index}\\b`));
    expect(text).not.toMatch(/\[\s*\d/);
    expect(text).not.toMatch(/\b[0-9a-f]{64}\b/);
    expect(text).not.toMatch(
      /readinessDeltaHash|membershipCoverageHash|sd9ExpansionHash|reachableCorpusHash/,
    );
    for (const preparation of preparations) {
      const setP = preparation['setP'] as { preSd7FullRank: { documentSha256: string }[] };
      for (const rankEntry of setP.preSd7FullRank) {
        expect(text.includes(rankEntry.documentSha256)).toBe(false);
      }
    }
  });

  it('§22: a second bind of the same R36 batch refuses with zero R24 calls', () => {
    const again = stand.helper;
    expect(codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV4(batch, proof))).toBe(
      'R37_SAMPLE_DELTA_ALREADY_BOUND',
    );
    expect(stand.helper).toBe(again);
  });

  it('§34: a second reproduction proof for the same batch refuses (one-shot, as upstream)', () => {
    expect(codeOf(() => prove(batch))).toBe('R37_R36_REPRODUCTION_ALREADY_PROVED');
    expect(r36ReproductionProofForBatch(batch)).toBe(proof);
  });

  it('the coverage and census refuse an unproved historical baseline', () => {
    expect(
      codeOf(() =>
        deriveCanonicalReachableMembershipSd9CoverageExpansionV4(readiness, { ...HISTORICAL }),
      ),
    ).toBe('R37_HISTORICAL_READINESS_BASELINE_NOT_PROVED');
    expect(
      codeOf(() =>
        deriveR37PublicIncrementalReachableMembershipSd9Census(
          readiness,
          structuredClone(HISTORICAL),
          R37_PROVENANCE,
        ),
      ),
    ).toBe('R37_HISTORICAL_READINESS_BASELINE_NOT_PROVED');
  });
});

describe('2D-A3 R37 §9 / §34: the binder refuses everything but the exact batch and its proof', () => {
  it('a genuine batch without its proof, or with a copied / foreign / R35 proof, refuses', () => {
    const { batch } = standInBatch();
    const other = standInBatch();
    const proof = prove(batch);
    const otherProof = prove(other.batch);
    const r35Proof = Object.freeze({
      kind: 'R36_FRESH_R35_REPRODUCTION_PROOF',
      comparedTopLevelFieldCount: 17,
      excludedFields: ['implementationCommit'],
      differingPaths: [],
    });
    const before = stand.helper;
    for (const candidate of [
      undefined,
      {},
      { ...proof },
      structuredClone(proof),
      JSON.parse(JSON.stringify(proof)) as unknown,
      otherProof,
      r35Proof,
    ]) {
      expect(codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV4(batch, candidate))).toBe(
        'R37_R36_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      );
    }
    expect(stand.helper).toBe(before);
    // The genuine pair still works afterwards: nothing was consumed.
    expect(
      isA3DevTrainReachableMembershipSd9DeltaBatchV4(
        bindDevTrainReachableMembershipSd9DeltaBatchV4(batch, proof),
      ),
    ).toBe(true);
  });

  it('every non-R36 input refuses as not minted, with zero R24 calls', () => {
    const { batch, preparations, graphBatch } = standInBatch();
    const proof = prove(batch);
    const unboundR23 = prepareUnboundSlotSampleSurvivors(
      {
        selectionIndex: 930 as A3SelectionIndex,
        split: 'DEV_TRAIN',
        documents: [entry(930, 'lonely-0', '10'), entry(930, 'lonely-1', '9')],
      },
      graphFor([entry(930, 'lonely-0', '10'), entry(930, 'lonely-1', '9')], [], []),
    );
    const literal = {
      kind: batch.kind,
      authorityVisibility: batch.authorityVisibility,
      split: batch.split,
      governanceSnapshotV4: batch.governanceSnapshotV4,
      graphDeltaBatch: batch.graphDeltaBatch,
      items: batch.items,
    };
    const historicalR23Preparation = {
      ...unboundR23,
      kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_V1',
    };
    const candidates: [string, unknown][] = [
      ['a spread batch', { ...batch }],
      ['a structuredClone', structuredClone(batch)],
      ['a JSON round trip', JSON.parse(JSON.stringify(batch)) as unknown],
      ['a literal batch with the genuine parts', literal],
      ['a batch holding a cloned preparation', { ...batch, items: [{ ...preparations[0] }] }],
      ['a preparation passed as a batch', preparations[0]],
      ['the R35 graph batch', graphBatch],
      ['the R34 document batch', graphBatch['documentSourceDeltaBatch']],
      [
        'the R33 evidence batch',
        (graphBatch['documentSourceDeltaBatch'] as Record<string, unknown>)['evidenceDeltaBatch'],
      ],
      [
        'an R30 V2 readiness batch',
        { kind: 'A3_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_DELTA_BATCH_V2', split: 'DEV_TRAIN' },
      ],
      [
        'an R29 V2 sample batch',
        { kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V2', split: 'DEV_TRAIN', items: [] },
      ],
      [
        'a historical R23 sample batch',
        {
          kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_BATCH_V1',
          split: 'DEV_TRAIN',
          items: [historicalR23Preparation],
        },
      ],
      ['a historical R23 slot preparation', historicalR23Preparation],
      ['an unbound R23 preparation', unboundR23],
      ['the committed R36 census', COMMITTED_R36],
      ['undefined', undefined],
    ];
    const before = stand.helper;
    for (const [label, candidate] of candidates) {
      expect(
        codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV4(candidate, proof)),
        label,
      ).toBe('R37_SAMPLE_DELTA_NOT_MINTED_BY_R36');
    }
    expect(stand.helper).toBe(before);
  });

  it('a registered batch holding a cloned preparation refuses before any R24 call', () => {
    const { batch, graphBatch } = standInBatch();
    const tampered = Object.freeze({
      ...batch,
      items: Object.freeze([{ ...batch.items[0]! }, ...batch.items.slice(1)]),
    });
    stand.batches.add(tampered);
    stand.graphBatchBySampleBatch.set(tampered, graphBatch);
    const proof = prove(tampered as unknown as A3DevTrainSampleSurvivorDeltaBatchV4);
    const before = stand.helper;
    expect(codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV4(tampered, proof))).toBe(
      'R37_SAMPLE_DELTA_NOT_MINTED_BY_R36',
    );
    expect(stand.helper).toBe(before);
  });

  it('a registered batch repeating a preparation refuses before any R24 call', () => {
    const { batch, graphBatch } = standInBatch();
    const graphItems = graphBatch['items'] as readonly object[];
    const repeatedGraphBatch = Object.freeze({
      ...graphBatch,
      items: Object.freeze([graphItems[0]!, graphItems[0]!, ...graphItems.slice(2)]),
    });
    const repeated = Object.freeze({
      ...batch,
      graphDeltaBatch: repeatedGraphBatch,
      items: Object.freeze([batch.items[0]!, batch.items[0]!, ...batch.items.slice(2)]),
    });
    stand.batches.add(repeated);
    stand.graphBatchBySampleBatch.set(repeated, repeatedGraphBatch);
    stand.sampleBatchByGraphBatch.set(repeatedGraphBatch, repeated);
    const proof = prove(repeated as unknown as A3DevTrainSampleSurvivorDeltaBatchV4);
    const before = stand.helper;
    expect(codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV4(repeated, proof))).toBe(
      'R37_DELTA_BATCH_COMPOSITION_INVALID',
    );
    expect(stand.helper).toBe(before);
  });

  it('a registered batch whose R35 batch does not map back refuses', () => {
    const { batch, graphBatch } = standInBatch();
    stand.sampleBatchByGraphBatch.delete(graphBatch);
    const proof = prove(batch);
    const before = stand.helper;
    expect(codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV4(batch, proof))).toBe(
      'R37_SAMPLE_DELTA_NOT_MINTED_BY_R36',
    );
    expect(stand.helper).toBe(before);
  });

  it('a registered batch whose preparation-to-graph provenance is broken refuses', () => {
    const { batch, graphs } = standInBatch();
    stand.preparationByGraph.delete(graphs[3]!);
    const proof = prove(batch);
    const before = stand.helper;
    expect(codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV4(batch, proof))).toBe(
      'R37_SAMPLE_DELTA_NOT_MINTED_BY_R36',
    );
    expect(stand.helper).toBe(before);
  });

  it('a chain holding a second V4 snapshot object refuses', () => {
    const { batch } = standInBatch({ graphSnapshot: { ...V4 } });
    const proof = prove(batch);
    const before = stand.helper;
    expect(codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV4(batch, proof))).toBe(
      'R37_SAMPLE_DELTA_NOT_MINTED_BY_R36',
    );
    expect(stand.helper).toBe(before);
  });

  it('a batch outside DEV_TRAIN refuses before any R24 call', () => {
    const { batch } = standInBatch({ split: 'DEV_CONFIRM' });
    const proof = prove(batch);
    const before = stand.helper;
    expect(codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV4(batch, proof))).toBe(
      'R37_SPLIT_NOT_SUPPORTED',
    );
    expect(stand.helper).toBe(before);
  });

  it.each([
    ['a legacy evidence request', { legacyAuthorityEvidenceRequests: 1 }],
    ['a changed existing authority', { changedExistingCount: 1 }],
    ['a V4 coverage of fourteen', { v4DevTrainReadyCount: 14 }],
    ['a historical coverage of five', { historicalCanonicalCoverageCount: 5 }],
  ])('upstream coverage with %s refuses as not additive', (_label, coverage) => {
    const { batch } = standInBatch({ coverage });
    const proof = prove(batch);
    const before = stand.helper;
    expect(codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV4(batch, proof))).toBe(
      'R37_SAMPLE_DELTA_COVERAGE_NOT_ADDITIVE',
    );
    expect(stand.helper).toBe(before);
  });

  it('a fresh R36 census that drifted, or a moved checkpoint, stops and mints no proof', () => {
    const { batch } = standInBatch();
    const drifted = JSON.parse(JSON.stringify(COMMITTED_R36)) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    drifted['delta']!['setP']!['initialCapBlockedSlotCount'] = 3;
    stand.census = drifted;
    expect(
      codeOf(() =>
        requireFreshR36Reproduction(batch, NO_SAMPLE_BASELINE, R36_PROVENANCE, COMMITTED_R36),
      ),
    ).toBe('STOP_R37_FRESH_R36_REPRODUCTION_DRIFT_REQUIRES_REVIEW');
    // A census that EQUALS a moved committed record still trips the checkpoint.
    expect(
      codeOf(() => requireFreshR36Reproduction(batch, NO_SAMPLE_BASELINE, R36_PROVENANCE, drifted)),
    ).toBe('STOP_R37_FRESH_R36_REPRODUCTION_DRIFT_REQUIRES_REVIEW');
    expect(r36ReproductionProofForBatch(batch)).toBeUndefined();
    stand.census = freshCensus();
  });

  it('the reproduction gate refuses a batch R36 did not mint', () => {
    const { batch } = standInBatch();
    expect(
      codeOf(() =>
        requireFreshR36Reproduction(
          { ...batch } as never,
          NO_SAMPLE_BASELINE,
          R36_PROVENANCE,
          COMMITTED_R36,
        ),
      ),
    ).toBe('R37_SAMPLE_DELTA_NOT_MINTED_BY_R36');
  });

  it('the census and coverage expansion refuse anything not minted by R37', () => {
    const { batch } = standInBatch();
    for (const candidate of [batch, { ...batch }, undefined]) {
      expect(codeOf(() => deriveDeltaReadinessAggregatesV4(candidate as never))).toBe(
        'R37_NOT_A_MINTED_DELTA_READINESS_BATCH',
      );
      expect(
        codeOf(() =>
          deriveCanonicalReachableMembershipSd9CoverageExpansionV4(candidate as never, HISTORICAL),
        ),
      ).toBe('R37_NOT_A_MINTED_DELTA_READINESS_BATCH');
      expect(
        codeOf(() =>
          deriveR37PublicIncrementalReachableMembershipSd9Census(
            candidate as never,
            HISTORICAL,
            R37_PROVENANCE,
          ),
        ),
      ).toBe('R37_NOT_A_MINTED_DELTA_READINESS_BATCH');
    }
  });
});

describe('2D-A3 R37 §21 / §39: all or nothing across the seven delta preparations', () => {
  it('an R24 refusal on the SEVENTH preparation leaves no earlier readiness minted', () => {
    const { batch, preparations } = standInBatch({ poisonLastPreparation: true });
    const proof = prove(batch);
    const before = stand.helper;
    expect(codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV4(batch, proof))).toBe(
      'R24_SET_R_READINESS_INCONSISTENT',
    );
    // Seven R24 calls were made; the seventh refused; nothing was minted.
    expect(stand.helper).toBe(before + 7);
    for (const preparation of preparations) {
      expect(deltaReadinessForSamplePreparationV4(preparation)).toBeUndefined();
    }
    expect(readinessDeltaBatchForSampleDeltaBatchV4(batch)).toBeUndefined();
  });

  it('§14: R24 readiness that disagrees with R36 caps stops before any mint', () => {
    const { batch, preparations } = standInBatch();
    const proof = prove(batch);
    stand.tamperR36Aggregate = true;
    try {
      expect(codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV4(batch, proof))).toBe(
        'STOP_R37_READINESS_DISAGREES_WITH_R36_PREPARATIONS',
      );
    } finally {
      stand.tamperR36Aggregate = false;
    }
    for (const preparation of preparations) {
      expect(deltaReadinessForSamplePreparationV4(preparation)).toBeUndefined();
    }
    expect(readinessDeltaBatchForSampleDeltaBatchV4(batch)).toBeUndefined();
  });
});

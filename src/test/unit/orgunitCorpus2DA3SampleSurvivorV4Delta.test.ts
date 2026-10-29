/**
 * PHASE 2B-2D A3 R36 — THE V4 INCREMENTAL DELTA PATH AROUND R23'S PURE SAMPLE PREPARATION.
 *
 * Every identity, score and graph here is INVENTED. No real corpus, no sealed
 * file, no database, no network. Proves, without a database:
 *
 *   - every delta request reaches R23's real `prepareUnboundSlotSampleSurvivors`
 *     exactly once, all-or-nothing, and its canonical objects are kept by
 *     reference;
 *   - the K3 postconditions hold for both samples THROUGH R23: survivor
 *     independence, an earlier adjacent witness for every exclusion, short
 *     text only in the unresolved list, and an exact partition;
 *   - zero edges exclude nothing; one edge with no short text excludes exactly
 *     one endpoint per sample, and the samples diverge in exactly one of two
 *     shapes (m-1/0/0/1 or m-2/1/1/0); a multi-edge graph returns exactly
 *     R23's own result, with no "edges == exclusions" rule;
 *   - SET_P / SET_R caps and SET_R's two readiness tokens are carried, never
 *     re-decided: a high-ranked short text can block a cap; a low-ranked one
 *     need not; full-rank blocking is never initial-cap blocking;
 *   - nothing but an actual R35 mint (with its reproduction proof) can mint,
 *     with zero R23 calls for a rejected input, and R23 V1 / R29 V2 minting is
 *     never reached;
 *   - the R35 reproduction comparison, the committed R23 + R29 six-slot
 *     baseline and the stated canonical constants.
 *
 * Synthetic slots are NOT minted here. The minted route is exercised by the
 * binder suite (against stand-in R35 brands) and by the real
 * V3/V4 -> R33 -> R34 -> R35 -> R36 chain, whose results the audit records.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type * as R23PrepareModule from '../harness/phase2b2d/a3samples/prepare.js';
import type * as R23DevTrainModule from '../harness/phase2b2d/a3samples/devTrain.js';
import type * as R29DevTrainModule from '../harness/phase2b2d/a3samplesV2/devTrain.js';
import {
  K3_SD7_GRAPH_SCOPE,
  K3_SD7_SURVIVOR_PROCEDURE,
  K3_SD7_SURVIVOR_SCOPE,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
} from '../harness/phase2b2d/a3prep/contracts.js';
import { SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED } from '../harness/phase2b2d/a3prep/sd7.js';
import {
  SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
  SET_P_DOCUMENT_CAP_EXACT,
} from '../harness/phase2b2d/a3prep/setPSd7.js';
import {
  SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
  SET_R_DOCUMENT_CAP_EXACT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
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
import type { UnboundSlotSampleSurvivorInput } from '../harness/phase2b2d/a3samples/types.js';
import type { NearDuplicateGraphMeasurement } from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';
import type { R35PublicIncrementalSd7GraphCensus } from '../harness/phase2b2d/a3graphsV4/census.js';

const calls = vi.hoisted(() => ({ prepare: 0, divergence: 0, r23Mint: 0, r29Mint: 0 }));

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

vi.mock('../harness/phase2b2d/a3samplesV2/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R29DevTrainModule>();
  return {
    ...actual,
    bindDevTrainSampleSurvivorDeltaBatchV2: (
      ...args: Parameters<typeof actual.bindDevTrainSampleSurvivorDeltaBatchV2>
    ) => {
      calls.r29Mint += 1;
      return actual.bindDevTrainSampleSurvivorDeltaBatchV2(...args);
    },
  };
});

const { prepareUnboundSlotSampleSurvivors, sampleSurvivorDivergence } =
  await import('../harness/phase2b2d/a3samples/prepare.js');
const { A3SampleRefusal } = await import('../harness/phase2b2d/a3samples/refusal.js');
const { prepareDeltaSlotSamplesAllOrNothingV4 } =
  await import('../harness/phase2b2d/a3samplesV4/prepareDelta.js');
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
  R35_REPRODUCTION_EXCLUDED_FIELDS,
  R36_EXPECTED_R35_CHECKPOINT,
  r35ReproductionDriftPaths,
  r35ReproductionProofForBatch,
  requireFreshR35Reproduction,
  requireHistoricalSamplePreparationBaseline,
  requireHistoricalSamplePreparationBaselineProof,
} = await import('../harness/phase2b2d/a3samplesV4/r35Drift.js');
const {
  deriveCanonicalSampleSurvivorCoverageExpansionV4,
  deriveDeltaSampleAggregatesV4,
  deriveR36PublicIncrementalSampleSurvivorCensus,
} = await import('../harness/phase2b2d/a3samplesV4/census.js');
const { A3SampleV4Refusal } = await import('../harness/phase2b2d/a3samplesV4/refusal.js');
const { R36_STATED_CANONICAL_SAMPLE_CONSTANTS } =
  await import('../harness/phase2b2d/a3samplesV4/types.js');
import type { A3SampleV4RefusalCode } from '../harness/phase2b2d/a3samplesV4/refusal.js';
import type { UnboundDeltaSlotSamplePreparationV4 } from '../harness/phase2b2d/a3samplesV4/types.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(join(REPO_ROOT, 'docs/evaluation', name), 'utf8'));
const R23_CENSUS = 'PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json';
const R29_CENSUS =
  'PHASE_2B_2D_A3_R29_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json';
const R35_CENSUS = 'PHASE_2B_2D_A3_R35_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1.json';

// ---------------------------------------------------------------------------
// Synthetic builders (the same shapes R23's and R29's unit suites use).
// ---------------------------------------------------------------------------

const SLOT = 7 as A3SelectionIndex;

const sha = (label: string): A3DocumentSha256 =>
  createHash('sha256')
    .update(`synthetic-a3-r36:${label}`, 'utf8')
    .digest('hex') as A3DocumentSha256;

function obs(page: A3PageEvidenceId, track: string, score: string): A3TrackCandidateObservation {
  return {
    pageEvidenceId: page,
    track,
    candidateScoreDecimal: score,
    ruleVersion: 'orgunit-signal-rules-v1',
  } as never;
}

/** One R21/R34-shaped document entry with a genuine canonical R10 preparation. */
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

/** `size` documents with strictly descending SET_R scores (slot position 0 scores highest). */
function documentsOf(prefix: string, size: number): A3DocumentSourceEntry[] {
  return Array.from({ length: size }, (_, i) => entry(`${prefix}-d${i}`, String(1000 - i)));
}

function codeOf(run: () => unknown): A3SampleV4RefusalCode | 'NO_REFUSAL' {
  try {
    run();
  } catch (error) {
    if (error instanceof A3SampleV4Refusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}

function prepareOne(
  slot: UnboundSlotSampleSurvivorInput,
  graph: NearDuplicateGraphMeasurement,
): UnboundDeltaSlotSamplePreparationV4 {
  const [prepared] = prepareDeltaSlotSamplesAllOrNothingV4([{ slot, graph }]);
  return prepared!;
}

/**
 * Finds a deterministic seed whose canonical SET_P order agrees (or disagrees)
 * with SET_R about which endpoint of the one edge comes first. The outcome is
 * READ from R23's canonical preparation and R23's divergence helper; this test
 * implements no rank and no walk.
 */
function singleEdgeScenario(want: 'SAME' | 'OPPOSITE', size = 30) {
  for (let seed = 0; seed < 200; seed += 1) {
    const documents = documentsOf(`se${seed}`, size);
    const slot = slotOf(documents);
    const graph = graphFor(documents, [], [[0, 1]]);
    const prepared = prepareOne(slot, graph);
    const d = sampleSurvivorDivergence(prepared, graph);
    if ((want === 'SAME') === (d.excludedInBothSamples === 1)) return { slot, graph, prepared };
  }
  throw new Error(`no ${want} scenario found`);
}

/**
 * §17 / §33. The K3 postconditions, checked over R23's OUTPUT for one sample:
 * this reads survivors, exclusions and witnesses; it never walks a rank.
 */
function expectK3Postconditions(
  sample: UnboundDeltaSlotSamplePreparationV4['setP'] | UnboundDeltaSlotSamplePreparationV4['setR'],
  slot: UnboundSlotSampleSurvivorInput,
  graph: NearDuplicateGraphMeasurement,
): void {
  const sd7 = sample.sd7Preparation;
  const indexOf = new Map(graph.documents.map((d, i) => [d.documentSha256, i]));
  // Pre-SD7 rank: every exact slot document once, contiguous positions.
  expect(sample.preSd7FullRank.map((e) => e.rankPosition)).toEqual(slot.documents.map((_, i) => i));
  expect(new Set(sample.preSd7FullRank.map((e) => e.documentSha256)).size).toBe(
    slot.documents.length,
  );
  const survivors = sd7.measurableSurvivors.map((s) => indexOf.get(s.documentSha256)!);
  const exclusions = sd7.measurableExclusions.map((x) => indexOf.get(x.documentSha256)!);
  const shorts = sd7.shortTextUnresolvedInSampleOrder.map((u) => indexOf.get(u.documentSha256)!);
  // Partition: every graph document in exactly one class, by measurability.
  expect([...survivors, ...exclusions, ...shorts].sort((a, b) => a - b)).toEqual(
    graph.documents.map((_, i) => i),
  );
  for (const i of [...survivors, ...exclusions]) expect(graph.documents[i]!.measurable).toBe(true);
  for (const i of shorts) expect(graph.documents[i]!.measurable).toBe(false);
  for (const unresolved of sd7.shortTextUnresolvedInSampleOrder) {
    expect(unresolved.openIssue).toBe(SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED);
  }
  // Independence: no edge joins two survivors.
  const survivorSet = new Set(survivors);
  for (const edge of graph.edges) {
    expect(survivorSet.has(edge.aIndex) && survivorSet.has(edge.bIndex)).toBe(false);
  }
  // Witness: each exclusion's recorded blocker is an earlier, adjacent survivor.
  const edgeKeys = new Set(graph.edges.map((e) => `${e.aIndex}:${e.bIndex}`));
  sd7.measurableExclusions.forEach((exclusion, position) => {
    const blocker = sd7.measurableSurvivors[exclusion.blockingSurvivorRankPosition]!;
    expect(blocker.sourceRankPosition).toBeLessThan(exclusion.sourceRankPosition);
    const a = indexOf.get(blocker.documentSha256)!;
    const b = exclusions[position]!;
    expect(edgeKeys.has(`${Math.min(a, b)}:${Math.max(a, b)}`)).toBe(true);
  });
}

// ---------------------------------------------------------------------------

describe('2D-A3 R36 §11 / §32: the delta path reaches R23 exactly once per slot', () => {
  it('calls prepareUnboundSlotSampleSurvivors once per request and keeps its objects', () => {
    const documents = documentsOf('once', 20);
    const slot = slotOf(documents);
    const graph = graphFor(documents, [], [[2, 3]]);
    const before = calls.prepare;
    const prepared = prepareOne(slot, graph);
    expect(calls.prepare).toBe(before + 1);
    // Same inputs, same canonical result: R36 adds nothing and changes nothing.
    expect(prepared).toEqual(prepareUnboundSlotSampleSurvivors(slot, graph));
    expect(Object.isFrozen(prepared)).toBe(true);
  });

  it('seven requests make exactly seven R23 calls', () => {
    const requests = Array.from({ length: 7 }, (_, s) => {
      const documents = documentsOf(`seven${s}`, 8);
      return { slot: slotOf(documents), graph: graphFor(documents) };
    });
    const before = calls.prepare;
    expect(prepareDeltaSlotSamplesAllOrNothingV4(requests)).toHaveLength(7);
    expect(calls.prepare).toBe(before + 7);
  });

  it('accepts no rank, survivor set or cap membership alongside a slot and its graph', () => {
    const documents = documentsOf('extra', 6);
    const base = { slot: slotOf(documents), graph: graphFor(documents) };
    const before = calls.prepare;
    for (const extra of [
      { rank: [] },
      { survivors: [] },
      { capDocuments: [] },
      { scores: [] },
      { setPOrder: [] },
    ]) {
      expect(codeOf(() => prepareDeltaSlotSamplesAllOrNothingV4([{ ...base, ...extra }]))).toBe(
        'R36_DELTA_REQUEST_SHAPE_INVALID',
      );
    }
    expect(calls.prepare).toBe(before);
  });

  it('§18 / §36: is all-or-nothing - a bad 7th request returns nothing and makes no R23 call', () => {
    const good = Array.from({ length: 6 }, (_, s) => {
      const documents = documentsOf(`aon${s}`, 8);
      return { slot: slotOf(documents), graph: graphFor(documents) };
    });
    const before = calls.prepare;
    expect(
      codeOf(() =>
        prepareDeltaSlotSamplesAllOrNothingV4([...good, { slot: good[0]!.slot } as never]),
      ),
    ).toBe('R36_DELTA_REQUEST_SHAPE_INVALID');
    expect(calls.prepare).toBe(before);
  });

  it('§36: an R23 refusal on the 7th request propagates unchanged and returns nothing', () => {
    const good = Array.from({ length: 6 }, (_, s) => {
      const documents = documentsOf(`aonr${s}`, 8);
      return { slot: slotOf(documents), graph: graphFor(documents) };
    });
    const foreign = graphFor(documentsOf('foreign', 8));
    let caught: unknown;
    let result: unknown = 'untouched';
    try {
      result = prepareDeltaSlotSamplesAllOrNothingV4([
        ...good,
        { slot: good[0]!.slot, graph: foreign },
      ]);
    } catch (error) {
      caught = error;
    }
    expect(result).toBe('untouched');
    expect(caught).toBeInstanceOf(A3SampleRefusal);
    expect((caught as InstanceType<typeof A3SampleRefusal>).code).toBe(
      'R23_GRAPH_DOCUMENT_COVERAGE_MISMATCH',
    );
  });

  it('both samples receive the SAME graph and the SAME full, unsorted population', () => {
    const documents = documentsOf('pop', 15);
    const slot = slotOf(documents);
    const graph = graphFor(documents, [4], [[0, 1]]);
    const prepared = prepareOne(slot, graph);
    const population = new Set(documents.map((e) => e.document.documentSha256 as string));
    for (const sample of [prepared.setP, prepared.setR]) {
      expect(sample.preSd7FullRank).toHaveLength(15);
      expect(new Set(sample.preSd7FullRank.map((e) => e.documentSha256 as string))).toEqual(
        population,
      );
      expect(sample.sd7Preparation.counts.shortTextUnresolvedCount).toBe(
        graph.shortTextUnresolvedCount,
      );
    }
    // The samples' orders are their own (SET_R is score-descending here; SET_P salted).
    expect(prepared.setR.preSd7FullRank.map((e) => e.documentSha256)).toEqual(
      documents.map((e) => e.document.documentSha256),
    );
  });
});

describe('2D-A3 R36 §33: K3 postconditions through R23 itself', () => {
  it('§33: zero edges -> no measurable exclusions in either sample', () => {
    const documents = documentsOf('zero', 12);
    const graph = graphFor(documents);
    const prepared = prepareOne(slotOf(documents), graph);
    for (const sample of [prepared.setP, prepared.setR]) {
      expect(sample.sd7Preparation.counts.measurableExclusionCount).toBe(0);
      expectK3Postconditions(sample, slotOf(documents), graph);
    }
  });

  it('§33: single edge, no short text -> exactly one exclusion per sample', () => {
    const { prepared, slot, graph } = singleEdgeScenario('SAME');
    for (const sample of [prepared.setP, prepared.setR]) {
      expect(sample.sd7Preparation.counts.measurableSurvivorCount).toBe(29);
      expect(sample.sd7Preparation.counts.measurableExclusionCount).toBe(1);
      expectK3Postconditions(sample, slot, graph);
    }
  });

  it('§33: a multi-edge graph returns exactly R23 output, with no edges == exclusions rule', () => {
    const documents = documentsOf('multi', 14);
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
    const slot = slotOf(documents);
    const prepared = prepareOne(slot, graph);
    expect(prepared).toEqual(prepareUnboundSlotSampleSurvivors(slot, graph));
    for (const sample of [prepared.setP, prepared.setR]) {
      expectK3Postconditions(sample, slot, graph);
      // A path 0-1-2-3 under score order keeps 0 and 2: exclusions != edges.
      expect(sample.sd7Preparation.counts.measurableExclusionCount).not.toBe(graph.edges.length);
    }
  });

  it('§33: short text stays unresolved, never a survivor or an exclusion', () => {
    const documents = documentsOf('short', 16);
    const graph = graphFor(documents, [3, 9, 15], [[0, 1]]);
    const slot = slotOf(documents);
    const prepared = prepareOne(slot, graph);
    for (const sample of [prepared.setP, prepared.setR]) {
      expect(sample.sd7Preparation.shortTextUnresolvedInSampleOrder).toHaveLength(3);
      expect(sample.sd7Preparation.counts.measurableSurvivorCount).toBe(12);
      expect(sample.sd7Preparation.counts.measurableExclusionCount).toBe(1);
      expectK3Postconditions(sample, slot, graph);
    }
  });
});

describe('2D-A3 R36 §15 / §16 / §23 / §34: caps and readiness are carried, never re-decided', () => {
  it('§34: exact caps hold the canonical survivor prefix, up to 8 (SET_P) and 4 (SET_R)', () => {
    const documents = documentsOf('cap', 20);
    const graph = graphFor(documents, [], [[0, 1]]);
    const prepared = prepareOne(slotOf(documents), graph);
    expect(prepared.setP.documentCap.status).toBe(SET_P_DOCUMENT_CAP_EXACT);
    expect(prepared.setRDocumentCap.status).toBe(SET_R_DOCUMENT_CAP_EXACT);
    if (prepared.setP.documentCap.status !== SET_P_DOCUMENT_CAP_EXACT) throw new Error('blocked');
    if (prepared.setRDocumentCap.status !== SET_R_DOCUMENT_CAP_EXACT) throw new Error('blocked');
    expect(prepared.setP.documentCap.documents).toEqual(
      prepared.setP.measurableSurvivorAwareFullRank.slice(0, SET_P_MAX_PAGES_PER_ORGANISATION),
    );
    expect(prepared.setRDocumentCap.documents).toEqual(
      prepared.setR.measurableSurvivorAwareFullRank.slice(0, SET_R_MAX_PAGES_PER_ORGANISATION),
    );
    expect(prepared.setRFreezeSlotReadiness.initialCapReadiness).toBe(SET_R_INITIAL_CAP_EXACT);
    expect(prepared.setRFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
  });

  it('§34: a short text ranked first in SET_R blocks the SET_R cap, with no documents', () => {
    const documents = documentsOf('block', 10);
    const graph = graphFor(documents, [0], [[3, 4]]);
    const prepared = prepareOne(slotOf(documents), graph);
    const cap = prepared.setRDocumentCap;
    expect(cap.status).toBe(SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP);
    expect(Object.prototype.hasOwnProperty.call(cap, 'documents')).toBe(false);
    expect((cap as { openIssue?: string }).openIssue).toBe(
      SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
    );
    expect(prepared.setRFreezeSlotReadiness.initialCapReadiness).toBe(
      SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
    );
    expect(prepared.setRFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    );
  });

  it('§34: a short text ranked last in SET_R leaves the initial cap exact but full rank blocked', () => {
    const documents = documentsOf('late', 12);
    const graph = graphFor(documents, [11]);
    const prepared = prepareOne(slotOf(documents), graph);
    expect(prepared.setRDocumentCap.status).toBe(SET_R_DOCUMENT_CAP_EXACT);
    expect(prepared.setRFreezeSlotReadiness.initialCapReadiness).toBe(SET_R_INITIAL_CAP_EXACT);
    // Full-rank blocking is NOT initial-cap blocking.
    expect(prepared.setRFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    );
  });

  it('§34: SET_P blocked caps carry no documents and the unresolved-short-text issue', () => {
    // SET_P's salted order is canonical and unpredictable here: search seeds
    // until R23 itself returns a blocked SET_P cap, then read it.
    for (let seed = 0; seed < 200; seed += 1) {
      const documents = documentsOf(`pblock${seed}`, 6);
      const graph = graphFor(documents, [0, 1, 2]);
      const prepared = prepareOne(slotOf(documents), graph);
      const cap = prepared.setP.documentCap;
      if (cap.status === SET_P_DOCUMENT_CAP_EXACT) continue;
      expect(cap.status).toBe(SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP);
      expect(Object.prototype.hasOwnProperty.call(cap, 'documents')).toBe(false);
      expect((cap as { openIssue?: string }).openIssue).toBe(
        SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
      );
      return;
    }
    throw new Error('no blocked SET_P cap found');
  });

  it('§23: full-rank readiness is exact exactly where the graph has no short text', () => {
    for (const short of [[], [5], [2, 7]] as const) {
      const documents = documentsOf(`fr${short.length}`, 10);
      const graph = graphFor(documents, short);
      const prepared = prepareOne(slotOf(documents), graph);
      expect(prepared.setRFreezeSlotReadiness.fullRankReadiness).toBe(
        short.length === 0
          ? SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT
          : SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
      );
    }
  });
});

describe('2D-A3 R36 §19 / §20 / §35: sample-specific divergence comes only from R23', () => {
  it('§35: same excluded endpoint gives m-1 / 0 / 0 / 1', () => {
    const { prepared, graph } = singleEdgeScenario('SAME');
    expect(sampleSurvivorDivergence(prepared, graph)).toEqual({
      measurableDocumentCount: 30,
      survivingBothSamples: 29,
      survivingSetPOnly: 0,
      survivingSetROnly: 0,
      excludedInBothSamples: 1,
    });
  });

  it('§35: opposite excluded endpoints give m-2 / 1 / 1 / 0', () => {
    const { prepared, graph } = singleEdgeScenario('OPPOSITE');
    expect(sampleSurvivorDivergence(prepared, graph)).toEqual({
      measurableDocumentCount: 30,
      survivingBothSamples: 28,
      survivingSetPOnly: 1,
      survivingSetROnly: 1,
      excludedInBothSamples: 0,
    });
  });

  it('§35: for any graph, both + P-only + R-only + neither = measurable', () => {
    const documents = documentsOf('div', 18);
    const graph = graphFor(
      documents,
      [4, 12],
      [
        [0, 1],
        [1, 2],
        [5, 6],
        [6, 7],
        [7, 5],
      ],
    );
    const d = sampleSurvivorDivergence(prepareOne(slotOf(documents), graph), graph);
    expect(
      d.survivingBothSamples + d.survivingSetPOnly + d.survivingSetROnly + d.excludedInBothSamples,
    ).toBe(16);
    expect(d.measurableDocumentCount).toBe(16);
  });
});

describe('2D-A3 R36 §9 / §31: nothing but an actual R35 mint with its proof can mint', () => {
  const documents = documentsOf('lit', 6);
  const graph = graphFor(documents);
  const literalGraph = {
    kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_DELTA_V4',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    selectionIndex: 7,
    split: 'DEV_TRAIN',
    graph,
  };
  const literalBatch = {
    kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V4',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV4: {},
    documentSourceDeltaBatch: { items: [slotOf(documents)] },
    items: [literalGraph],
  };
  const inputs: Record<string, unknown> = {
    'a literal R35 batch': literalBatch,
    'a spread literal batch': { ...literalBatch },
    'a JSON round trip': JSON.parse(JSON.stringify(literalBatch)) as unknown,
    'a structured clone': structuredClone(literalBatch),
    'a graph passed as a batch': literalGraph,
    'an R34 document batch shape': {
      kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V4',
      split: 'DEV_TRAIN',
      items: [slotOf(documents)],
    },
    'an R33 evidence batch shape': {
      kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V4',
      split: 'DEV_TRAIN',
      items: [],
    },
    'an R28 V2 graph batch shape': {
      kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V2',
      split: 'DEV_TRAIN',
      items: [{ ...literalGraph, kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_DELTA_V2' }],
    },
    'an R29 V2 sample batch shape': {
      kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V2',
      split: 'DEV_TRAIN',
      items: [],
    },
    'a historical R22 graph shape': {
      kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_V1',
      selectionIndex: 7,
      split: 'DEV_TRAIN',
      graph,
    },
    'an unbound R22 graph': graph,
    'the committed R35 census': readJson(R35_CENSUS),
    undefined: undefined,
  };

  for (const [name, input] of Object.entries(inputs)) {
    it(`refuses ${name} with zero R23 calls`, () => {
      const before = calls.prepare;
      expect(codeOf(() => bindDevTrainSampleSurvivorDeltaBatchV4(input, undefined))).toBe(
        'R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35',
      );
      expect(codeOf(() => bindDevTrainSampleSurvivorDeltaBatchV4(input, {}))).toBe(
        'R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35',
      );
      expect(calls.prepare).toBe(before);
    });
  }

  it('a literal cannot be proved, and brands nothing it did not mint', () => {
    expect(r35ReproductionProofForBatch(literalBatch)).toBeUndefined();
    expect(r35ReproductionProofForBatch(undefined)).toBeUndefined();
    expect(isA3DevTrainSampleSurvivorDeltaBatchV4(literalBatch)).toBe(false);
    expect(isA3DevTrainSlotSampleSurvivorPreparationDeltaV4(literalGraph)).toBe(false);
    expect(deltaGraphForSamplePreparationV4(literalGraph)).toBeUndefined();
    expect(samplePreparationForDeltaGraphV4(literalGraph)).toBeUndefined();
    expect(graphDeltaBatchForSampleDeltaBatchV4(literalBatch)).toBeUndefined();
    expect(sampleDeltaBatchForGraphDeltaBatchV4(literalBatch)).toBeUndefined();
  });

  it('the reproduction gate refuses a batch R35 did not mint', () => {
    expect(
      codeOf(() =>
        requireFreshR35Reproduction(
          literalBatch as never,
          {} as never,
          { r34Tip: '', r34ScopePinCommit: '', implementationCommit: '' },
          readJson(R35_CENSUS),
        ),
      ),
    ).toBe('R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35');
  });

  it('the census and coverage expansion refuse anything not minted by R36', () => {
    const baseline = requireHistoricalSamplePreparationBaseline(
      readJson(R23_CENSUS),
      readJson(R29_CENSUS),
      readJson(R35_CENSUS),
    );
    for (const batch of [literalBatch, { ...literalBatch, kind: 'X' }, undefined]) {
      expect(codeOf(() => deriveDeltaSampleAggregatesV4(batch as never))).toBe(
        'R36_NOT_A_MINTED_DELTA_SAMPLE_BATCH',
      );
      expect(
        codeOf(() => deriveCanonicalSampleSurvivorCoverageExpansionV4(batch as never, baseline)),
      ).toBe('R36_NOT_A_MINTED_DELTA_SAMPLE_BATCH');
      expect(
        codeOf(() =>
          deriveR36PublicIncrementalSampleSurvivorCensus(batch as never, baseline, {
            r35Tip: '',
            r35ScopePinCommit: '',
            implementationCommit: '',
          }),
        ),
      ).toBe('R36_NOT_A_MINTED_DELTA_SAMPLE_BATCH');
    }
  });
});

describe('2D-A3 R36 §8 / §25: R35 reproduction and the R23 + R29 historical baseline', () => {
  const committedR35 = readJson(R35_CENSUS) as Record<string, unknown>;
  const freshLike = (): R35PublicIncrementalSd7GraphCensus =>
    JSON.parse(JSON.stringify(committedR35)) as R35PublicIncrementalSd7GraphCensus;

  it('excludes exactly one execution-provenance field', () => {
    expect([...R35_REPRODUCTION_EXCLUDED_FIELDS]).toEqual(['implementationCommit']);
  });

  it('the committed R35 census has no drift against itself, ignoring implementationCommit', () => {
    const fresh = { ...freshLike(), implementationCommit: 'a'.repeat(40) };
    expect(r35ReproductionDriftPaths(fresh, committedR35)).toEqual([]);
  });

  it('reports any other moved field by path', () => {
    const fresh = freshLike() as unknown as Record<string, Record<string, unknown>>;
    fresh['deltaGraph']!['deltaNearDuplicateEdges'] = 17;
    fresh['r34Tip'] = 'b'.repeat(40) as never;
    expect(r35ReproductionDriftPaths(fresh as never, committedR35)).toEqual([
      'deltaGraph.deltaNearDuplicateEdges',
      'r34Tip',
    ]);
  });

  it('the committed R35 census states the pinned checkpoint (§6 / §25)', () => {
    const at = (path: string): unknown =>
      path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], committedR35);
    for (const [path, expected] of Object.entries(R36_EXPECTED_R35_CHECKPOINT)) {
      expect(at(path), path).toBe(expected);
    }
  });

  it('closes the R23 + R29 baseline to six slots and the canonical aggregates (§8)', () => {
    const baseline = requireHistoricalSamplePreparationBaseline(
      readJson(R23_CENSUS),
      readJson(R29_CENSUS),
      committedR35,
    );
    expect(requireHistoricalSamplePreparationBaselineProof(baseline)).toBe(baseline);
    expect(baseline.r23SlotPreparations).toBe(5);
    expect(baseline.r29NewSlotPreparations).toBe(1);
    expect(baseline.slotPreparations).toBe(6);
    expect(baseline.setP).toEqual({
      preSd7RankEntryCount: 191,
      measurableDocumentCount: 190,
      measurableSurvivorCount: 176,
      measurableExclusionCount: 14,
      unresolvedShortTextOccurrenceCount: 1,
      initialCapExactSlotCount: 6,
      initialCapBlockedSlotCount: 0,
      exactCapDocumentCountAcrossExactSlots: 48,
    });
    expect(baseline.setR).toEqual({
      preSd7RankEntryCount: 191,
      measurableDocumentCount: 190,
      measurableSurvivorCount: 176,
      measurableExclusionCount: 14,
      unresolvedShortTextOccurrenceCount: 1,
      initialCapExactSlotCount: 6,
      initialCapBlockedSlotCount: 0,
      exactCapDocumentCountAcrossExactSlots: 24,
      fullRankExactSlotCount: 5,
      fullRankShortTextBlockedSlotCount: 1,
    });
    expect(baseline.divergence).toEqual({
      measurableDocumentCount: 190,
      survivingBothSamples: 171,
      survivingSetPOnly: 5,
      survivingSetROnly: 5,
      excludedInBothSamples: 9,
    });
  });

  it('refuses a historical record whose arithmetic no longer closes', () => {
    const r29 = readJson(R29_CENSUS) as Record<string, Record<string, Record<string, unknown>>>;
    r29['delta']!['setP']!['measurableExclusionCount'] = 2;
    expect(
      codeOf(() =>
        requireHistoricalSamplePreparationBaseline(readJson(R23_CENSUS), r29, committedR35),
      ),
    ).toBe('STOP_R36_HISTORICAL_R23_R29_SAMPLE_BASELINE_DRIFT_REQUIRES_REVIEW');
    const r23 = readJson(R23_CENSUS) as Record<string, Record<string, unknown>>;
    r23['setR']!['fullRankExactSlotCount'] = 5;
    expect(
      codeOf(() =>
        requireHistoricalSamplePreparationBaseline(r23, readJson(R29_CENSUS), committedR35),
      ),
    ).toBe('STOP_R36_HISTORICAL_R23_R29_SAMPLE_BASELINE_DRIFT_REQUIRES_REVIEW');
    const r35 = JSON.parse(JSON.stringify(committedR35)) as Record<string, Record<string, unknown>>;
    r35['coverage']!['historicalDocuments'] = 192;
    expect(
      codeOf(() =>
        requireHistoricalSamplePreparationBaseline(readJson(R23_CENSUS), readJson(R29_CENSUS), r35),
      ),
    ).toBe('STOP_R36_HISTORICAL_R23_R29_SAMPLE_BASELINE_DRIFT_REQUIRES_REVIEW');
  });

  it('a copied baseline is not a proved baseline', () => {
    const baseline = requireHistoricalSamplePreparationBaseline(
      readJson(R23_CENSUS),
      readJson(R29_CENSUS),
      committedR35,
    );
    expect(codeOf(() => requireHistoricalSamplePreparationBaselineProof({ ...baseline }))).toBe(
      'R36_HISTORICAL_SAMPLE_BASELINE_NOT_PROVED',
    );
  });
});

describe('2D-A3 R36 §27: stated constants and counters', () => {
  it('the stated canonical constants equal the frozen canonical contracts', () => {
    expect(R36_STATED_CANONICAL_SAMPLE_CONSTANTS).toEqual({
      setPMaxPagesPerOrganisation: SET_P_MAX_PAGES_PER_ORGANISATION,
      setRMaxPagesPerOrganisation: SET_R_MAX_PAGES_PER_ORGANISATION,
      k3SurvivorProcedure: K3_SD7_SURVIVOR_PROCEDURE,
      k3SurvivorScope: K3_SD7_SURVIVOR_SCOPE,
      k3GraphScope: K3_SD7_GRAPH_SCOPE,
      setPDocumentCapExact: SET_P_DOCUMENT_CAP_EXACT,
      setPDocumentCapBlockedShortTextSampleMembership:
        SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
      setRDocumentCapExact: SET_R_DOCUMENT_CAP_EXACT,
      setRDocumentCapBlockedShortTextSampleMembership:
        SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
      setRInitialCapExact: SET_R_INITIAL_CAP_EXACT,
      setRInitialCapBlockedShortTextMembership: SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
      setRFullSampleRankMembershipExact: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
      setRFullSampleRankMembershipBlockedShortText:
        SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
      sd7ShortTextSampleMembershipOpenIssue: SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
    });
    // The R23 / R29 committed records state the same K3 constants.
    const r29 = readJson(R29_CENSUS) as Record<string, Record<string, unknown>>;
    for (const [key, value] of Object.entries(r29['canonicalConstants']!)) {
      expect((R36_STATED_CANONICAL_SAMPLE_CONSTANTS as Record<string, unknown>)[key], key).toBe(
        value,
      );
    }
  });

  it('counted zero R23 V1 and zero R29 V2 mints across every test in this file', () => {
    expect(calls.r23Mint).toBe(0);
    expect(calls.r29Mint).toBe(0);
  });
});

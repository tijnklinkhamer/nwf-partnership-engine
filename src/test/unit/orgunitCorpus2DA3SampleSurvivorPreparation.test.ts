/**
 * PHASE 2B-2D A3 R23 — SAMPLE-SPECIFIC SET_P / SET_R SURVIVOR PREPARATION,
 * OVER SYNTHETIC SLOTS.
 *
 * Every identity, score and graph here is INVENTED. No real corpus, no sealed
 * file, no database, no network. The minted route is exercised only by the
 * real R19 -> R20 -> R21 -> R22 -> R23 chain; here the UNBOUND helper is
 * driven through the canonical `prepareSetPSd7` / `prepareSetRSd7` /
 * `determineSetRDocumentCap` / `deriveSetRFreezeSlotReadiness` compositions,
 * and no test implements its own survivor walk or cap.
 *
 * This file proves:
 *
 *   - K3 is sample-specific: one graph, two orders, two survivor sets (§39);
 *   - a tail short text does not over-block either cap (§40);
 *   - a short text before the cap boundary blocks it, with no invented list (§41);
 *   - SET_R full-rank and initial-cap readiness stay independent tokens (§42);
 *   - signed scores and the salted tie-break order SET_R canonically (§43, §44);
 *   - short text is never a survivor or an exclusion (§27);
 *   - the partition, independence and witness postconditions hold (§23-§25);
 *   - nothing unbound, cloned or literal is minted, and the census refuses it.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
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
import { deriveR23PublicSampleSurvivorCensus } from '../harness/phase2b2d/a3samples/census.js';
import {
  bindDevTrainSampleSurvivorBatch,
  isA3DevTrainSampleSurvivorBatch,
  isA3DevTrainSlotSampleSurvivorPreparation,
} from '../harness/phase2b2d/a3samples/devTrain.js';
import {
  prepareUnboundSlotSampleSurvivors,
  sampleSurvivorDivergence,
} from '../harness/phase2b2d/a3samples/prepare.js';
import { r22AggregateDriftPaths } from '../harness/phase2b2d/a3samples/r22Drift.js';
import {
  A3SampleRefusal,
  type A3SampleRefusalCode,
} from '../harness/phase2b2d/a3samples/refusal.js';
import type {
  A3DevTrainSampleSurvivorBatchV1,
  UnboundA3SlotSampleSurvivorPreparation,
  UnboundSlotSampleSurvivorInput,
} from '../harness/phase2b2d/a3samples/types.js';
import type { R22PublicGraphMeasurementCensus } from '../harness/phase2b2d/a3graphs/census.js';
import type { NearDuplicateGraphMeasurement } from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';

// ---------------------------------------------------------------------------
// Synthetic builders.
// ---------------------------------------------------------------------------

const SLOT = 3 as A3SelectionIndex;

const sha = (label: string): A3DocumentSha256 =>
  createHash('sha256')
    .update(`synthetic-a3-r23:${label}`, 'utf8')
    .digest('hex') as A3DocumentSha256;

function obs(page: A3PageEvidenceId, track: string, score: string): A3TrackCandidateObservation {
  return {
    pageEvidenceId: page,
    track,
    candidateScoreDecimal: score,
    ruleVersion: 'orgunit-signal-rules-v1',
  } as never;
}

/** One R21-shaped document entry with a genuine canonical R10 preparation. */
function entry(label: string, score: string, split = 'DEV_TRAIN'): A3DocumentSourceEntry {
  const documentSha256 = sha(label);
  const id = `pe-${label}-0` as A3PageEvidenceId;
  const document = {
    selectionIndex: SLOT,
    split,
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

function codeOf(run: () => unknown): A3SampleRefusalCode | 'NO_REFUSAL' {
  try {
    run();
  } catch (error) {
    if (error instanceof A3SampleRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}

const survivorShas = (prep: UnboundA3SlotSampleSurvivorPreparation, sample: 'setP' | 'setR') =>
  prep[sample].sd7Preparation.measurableSurvivors.map((s) => s.documentSha256 as string);

/**
 * 10 measurable + 1 short-text document with no edges, found by trying
 * deterministic label seeds until the canonical SET_P rank places the short
 * text where `wantTail` asks. The rank is read, never computed here.
 */
function setPShortTextScenario(wantTail: boolean): {
  readonly documents: readonly A3DocumentSourceEntry[];
  readonly shortSlotPosition: number;
  readonly prep: UnboundA3SlotSampleSurvivorPreparation;
} {
  for (let seed = 0; seed < 200; seed += 1) {
    // Short text last in SLOT order and lowest in score: SET_R puts it at the tail.
    const documents = Array.from({ length: 11 }, (_, i) =>
      entry(`s${seed}-d${i}`, String(100 - i)),
    );
    const shortSlotPosition = 10;
    const prep = prepareUnboundSlotSampleSurvivors(
      slotOf(documents),
      graphFor(documents, [shortSlotPosition]),
    );
    const position =
      prep.setP.sd7Preparation.shortTextUnresolvedInSampleOrder[0]!.sourceRankPosition;
    if (wantTail ? position >= SET_P_MAX_PAGES_PER_ORGANISATION : position < 4) {
      return { documents, shortSlotPosition, prep };
    }
  }
  throw new Error('no deterministic seed produced the requested SET_P placement');
}

// ---------------------------------------------------------------------------

describe('2D-A3 R23 §28: canonical cap constants', () => {
  it('SET_P caps at 8 and SET_R at 4, from the canonical contracts', () => {
    expect(SET_P_MAX_PAGES_PER_ORGANISATION).toBe(8);
    expect(SET_R_MAX_PAGES_PER_ORGANISATION).toBe(4);
  });
});

describe('2D-A3 R23 §39: K3 is sample-specific - one graph, two survivor sets', () => {
  it('the same edge keeps a different document in each sample', () => {
    const probe = [entry('k3-a', '1'), entry('k3-b', '1')];
    const probePrep = prepareUnboundSlotSampleSurvivors(
      slotOf(probe),
      graphFor(probe, [], [[0, 1]]),
    );
    const setPFirst = probePrep.setP.preSd7FullRank[0]!.documentSha256 as string;
    const setPFirstIsA = setPFirst === (probe[0]!.document.documentSha256 as string);

    // Give the document SET_P ranks SECOND the higher SET_R score.
    const documents = [
      entry('k3-a', setPFirstIsA ? '1.0000' : '5.0000'),
      entry('k3-b', setPFirstIsA ? '5.0000' : '1.0000'),
    ];
    const graph = graphFor(documents, [], [[0, 1]]);
    const prep = prepareUnboundSlotSampleSurvivors(slotOf(documents), graph);

    const setRFirst = prep.setR.preSd7FullRank[0]!.documentSha256 as string;
    expect(setRFirst).not.toBe(setPFirst);
    expect(survivorShas(prep, 'setP')).toEqual([setPFirst]);
    expect(survivorShas(prep, 'setR')).toEqual([setRFirst]);
    expect(sampleSurvivorDivergence(prep, graph)).toEqual({
      measurableDocumentCount: 2,
      survivingBothSamples: 0,
      survivingSetPOnly: 1,
      survivingSetROnly: 1,
      excludedInBothSamples: 0,
    });
  });

  it('records each exclusion against an earlier, adjacent survivor of ITS sample', () => {
    const documents = [entry('w-a', '3'), entry('w-b', '2'), entry('w-c', '1')];
    // Path a - b - c: whichever end comes first, the greedy walk is canonical.
    const prep = prepareUnboundSlotSampleSurvivors(
      slotOf(documents),
      graphFor(
        documents,
        [],
        [
          [0, 1],
          [1, 2],
        ],
      ),
    );
    for (const sample of ['setP', 'setR'] as const) {
      const sd7 = prep[sample].sd7Preparation;
      for (const exclusion of sd7.measurableExclusions) {
        const blocker = sd7.measurableSurvivors[exclusion.blockingSurvivorRankPosition]!;
        expect(blocker.sourceRankPosition).toBeLessThan(exclusion.sourceRankPosition);
      }
      expect(sd7.counts.measurableSurvivorCount + sd7.counts.measurableExclusionCount).toBe(3);
    }
    // SET_R order is a, b, c: b is excluded by a, and c survives.
    expect(survivorShas(prep, 'setR')).toEqual([sha('w-a'), sha('w-c')]);
  });
});

describe('2D-A3 R23 §40/§42: a tail short text does not over-block', () => {
  it('SET_P cap is EXACT when eight measurable survivors precede the short text', () => {
    const { prep } = setPShortTextScenario(true);
    expect(prep.setP.documentCap.status).toBe(SET_P_DOCUMENT_CAP_EXACT);
    if (prep.setP.documentCap.status !== SET_P_DOCUMENT_CAP_EXACT) return;
    expect(prep.setP.documentCap.reason).toBe(
      'EIGHT_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT',
    );
    expect(prep.setP.documentCap.documents).toHaveLength(8);
    expect(prep.setP.sd7Preparation.counts.shortTextUnresolvedCount).toBe(1);
  });

  it('SET_R initial cap is EXACT while its full rank stays blocked by the tail short text', () => {
    const { prep } = setPShortTextScenario(true);
    expect(prep.setRDocumentCap.status).toBe(SET_R_DOCUMENT_CAP_EXACT);
    if (prep.setRDocumentCap.status !== SET_R_DOCUMENT_CAP_EXACT) return;
    expect(prep.setRDocumentCap.reason).toBe(
      'FOUR_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT',
    );
    expect(prep.setRDocumentCap.documents).toHaveLength(4);
    expect(prep.setRFreezeSlotReadiness.initialCapReadiness).toBe(SET_R_INITIAL_CAP_EXACT);
    expect(prep.setRFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    );
  });

  it('no short text at all gives exact caps and an exact full rank', () => {
    const documents = Array.from({ length: 6 }, (_, i) => entry(`n${i}`, String(10 - i)));
    const prep = prepareUnboundSlotSampleSurvivors(slotOf(documents), graphFor(documents));
    expect(prep.setP.documentCap.status).toBe(SET_P_DOCUMENT_CAP_EXACT);
    expect(prep.setRDocumentCap.status).toBe(SET_R_DOCUMENT_CAP_EXACT);
    expect(prep.setRFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
    if (prep.setP.documentCap.status === SET_P_DOCUMENT_CAP_EXACT) {
      // Fewer than eight survivors: the exact cap is every survivor, never padded.
      expect(prep.setP.documentCap.documents).toHaveLength(6);
    }
  });
});

describe('2D-A3 R23 §41/§42: a short text before the boundary blocks, with no invented list', () => {
  it('SET_P cap is BLOCKED and carries no documents', () => {
    const { prep } = setPShortTextScenario(false);
    expect(prep.setP.documentCap.status).toBe(
      SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
    );
    expect(Object.prototype.hasOwnProperty.call(prep.setP.documentCap, 'documents')).toBe(false);
    expect(prep.setP.documentCap).toMatchObject({
      openIssue: SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
    });
  });

  it('SET_R cap is BLOCKED when the short text ranks first, and both readiness tokens block', () => {
    const documents = [
      entry('r-short', '99'),
      ...Array.from({ length: 6 }, (_, i) => entry(`r${i}`, String(10 - i))),
    ];
    const prep = prepareUnboundSlotSampleSurvivors(slotOf(documents), graphFor(documents, [0]));
    expect(prep.setRDocumentCap.status).toBe(
      SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
    );
    expect(Object.prototype.hasOwnProperty.call(prep.setRDocumentCap, 'documents')).toBe(false);
    expect(prep.setRFreezeSlotReadiness.initialCapReadiness).toBe(
      SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
    );
    expect(prep.setRFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    );
  });
});

describe('2D-A3 R23 §27: short text is neither survivor nor exclusion', () => {
  it('appears only in the unresolved sequence of both samples', () => {
    const { prep, documents, shortSlotPosition } = setPShortTextScenario(true);
    const shortSha = documents[shortSlotPosition]!.document.documentSha256 as string;
    for (const sample of ['setP', 'setR'] as const) {
      const sd7 = prep[sample].sd7Preparation;
      expect(sd7.measurableSurvivors.map((s) => s.documentSha256)).not.toContain(shortSha);
      expect(sd7.measurableExclusions.map((s) => s.documentSha256)).not.toContain(shortSha);
      expect(sd7.shortTextUnresolvedInSampleOrder.map((s) => s.documentSha256)).toEqual([shortSha]);
      expect(sd7.counts).toMatchObject({
        sampleOrderLength: 11,
        measurableDocumentCount: 10,
        shortTextUnresolvedCount: 1,
      });
    }
  });
});

describe('2D-A3 R23 §43/§44: SET_R order comes only from the canonical composition', () => {
  it('orders signed scores descending through prepareSetRSd7', () => {
    const documents = [
      entry('neg-a', '-3.5000'),
      entry('neg-b', '-0.2500'),
      entry('neg-c', '2.0000'),
      entry('neg-d', '-10.0000'),
    ];
    const prep = prepareUnboundSlotSampleSurvivors(slotOf(documents), graphFor(documents));
    expect(prep.setR.preSd7FullRank.map((r) => r.documentSha256)).toEqual([
      sha('neg-c'),
      sha('neg-b'),
      sha('neg-a'),
      sha('neg-d'),
    ]);
  });

  it('breaks equal scores only by the frozen SET_R_V2_R2: salted digest', () => {
    const documents = Array.from({ length: 5 }, (_, i) => entry(`tie-${i}`, '-1.0000'));
    const prep = prepareUnboundSlotSampleSurvivors(slotOf(documents), graphFor(documents));
    // Independent reference (test logic only): ascending sha256('SET_R_V2_R2:' + digest).
    const expected = documents
      .map((e) => e.document.documentSha256 as string)
      .map((d) => ({
        d,
        key: createHash('sha256').update(`SET_R_V2_R2:${d}`, 'utf8').digest('hex'),
      }))
      .sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
      .map((x) => x.d);
    expect(prep.setR.preSd7FullRank.map((r) => r.documentSha256)).toEqual(expected);
  });
});

describe('2D-A3 R23 §11-§13: the same population and the same graph for both samples', () => {
  it('both full ranks hold exactly the slot documents, unfiltered', () => {
    const { prep, documents } = setPShortTextScenario(true);
    const slotShas = documents.map((e) => e.document.documentSha256 as string).sort();
    expect(prep.setP.preSd7FullRank.map((r) => r.documentSha256 as string).sort()).toEqual(
      slotShas,
    );
    expect(prep.setR.preSd7FullRank.map((r) => r.documentSha256 as string).sort()).toEqual(
      slotShas,
    );
  });

  it('freezes its result and mutates neither the slot nor the graph', () => {
    const documents = [entry('m-a', '2'), entry('m-b', '1')];
    const graph = graphFor(documents, [], [[0, 1]]);
    const before = JSON.stringify({ documents, graph });
    const prep = prepareUnboundSlotSampleSurvivors(slotOf(documents), graph);
    expect(JSON.stringify({ documents, graph })).toBe(before);
    expect(Object.isFrozen(prep)).toBe(true);
  });
});

describe('2D-A3 R23: the unbound helper refuses malformed input', () => {
  const documents = [entry('x-a', '2'), entry('x-b', '1')];

  it('refuses a split other than DEV_TRAIN', () => {
    expect(
      codeOf(() =>
        prepareUnboundSlotSampleSurvivors(
          { selectionIndex: SLOT, split: 'DEV_CONFIRM', documents },
          graphFor(documents),
        ),
      ),
    ).toBe('R23_SPLIT_NOT_SUPPORTED');
  });

  it('refuses an empty slot and a malformed one', () => {
    expect(codeOf(() => prepareUnboundSlotSampleSurvivors(slotOf([]), graphFor([])))).toBe(
      'R23_SLOT_HAS_NO_DOCUMENTS',
    );
    expect(
      codeOf(() =>
        prepareUnboundSlotSampleSurvivors({ selectionIndex: -1 } as never, graphFor(documents)),
      ),
    ).toBe('R23_SLOT_INPUT_SHAPE_INVALID');
  });

  it('refuses a graph that does not cover the slot documents in order', () => {
    const reversed = graphFor([...documents].reverse());
    expect(codeOf(() => prepareUnboundSlotSampleSurvivors(slotOf(documents), reversed))).toBe(
      'R23_GRAPH_DOCUMENT_COVERAGE_MISMATCH',
    );
    const other = [entry('x-a', '2'), entry('x-z', '1')];
    expect(
      codeOf(() => prepareUnboundSlotSampleSurvivors(slotOf(documents), graphFor(other))),
    ).toBe('R23_GRAPH_DOCUMENT_COVERAGE_MISMATCH');
  });

  it('refuses a score preparation from another document, via canonical SET_R', () => {
    const swapped: A3DocumentSourceEntry[] = [
      { ...documents[0]!, scorePreparation: documents[1]!.scorePreparation },
      { ...documents[1]!, scorePreparation: documents[0]!.scorePreparation },
    ];
    expect(
      codeOf(() => prepareUnboundSlotSampleSurvivors(slotOf(swapped), graphFor(swapped))),
    ).toBe('R23_CANONICAL_SET_R_PREPARATION_STOPPED');
  });

  it('refuses documents from another slot, via canonical SET_P', () => {
    const foreign: A3DocumentSourceEntry = {
      ...documents[1]!,
      document: { ...documents[1]!.document, selectionIndex: 99 as A3SelectionIndex },
    };
    const mixed = [documents[0]!, foreign];
    expect(codeOf(() => prepareUnboundSlotSampleSurvivors(slotOf(mixed), graphFor(mixed)))).toBe(
      'R23_CANONICAL_SET_P_PREPARATION_STOPPED',
    );
  });

  it('refuses a short-text edge through the canonical walk, never a repaired graph', () => {
    const three = [entry('e-a', '3'), entry('e-b', '2'), entry('e-c', '1')];
    const graph = graphFor(three, [2], [[0, 2]]);
    expect(codeOf(() => prepareUnboundSlotSampleSurvivors(slotOf(three), graph))).toBe(
      'R23_CANONICAL_SET_P_PREPARATION_STOPPED',
    );
  });
});

describe('2D-A3 R23 §9/§36/§38: nothing unbound, cloned or literal is minted', () => {
  it('the unbound preparation is not a minted one', () => {
    const documents = [entry('u-a', '1')];
    const prep = prepareUnboundSlotSampleSurvivors(slotOf(documents), graphFor(documents));
    expect(isA3DevTrainSlotSampleSurvivorPreparation(prep)).toBe(false);
    expect(isA3DevTrainSlotSampleSurvivorPreparation({ ...prep })).toBe(false);
  });

  it('the binder refuses anything that is not an R22 mint', () => {
    const documents = [entry('b-a', '1')];
    const graph = graphFor(documents);
    const literal = {
      kind: 'A3_DEV_TRAIN_SD7_GRAPH_BATCH_V1',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      split: 'DEV_TRAIN',
      governanceSnapshot: {},
      items: [
        {
          kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_V1',
          authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
          selectionIndex: SLOT,
          split: 'DEV_TRAIN',
          graph,
        },
      ],
    };
    for (const candidate of [
      literal,
      { ...literal },
      JSON.parse(JSON.stringify(literal)) as unknown,
      null,
      undefined,
      [],
    ]) {
      expect(codeOf(() => bindDevTrainSampleSurvivorBatch(candidate))).toBe(
        'R23_SD7_GRAPH_AUTHORITY_NOT_MINTED_BY_R22',
      );
    }
  });

  it('the census refuses an unminted batch', () => {
    const fake = {
      kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_BATCH_V1',
      items: [],
    } as unknown as A3DevTrainSampleSurvivorBatchV1;
    expect(isA3DevTrainSampleSurvivorBatch(fake)).toBe(false);
    expect(
      codeOf(() =>
        deriveR23PublicSampleSurvivorCensus(fake, { r22Tip: 'x', implementationCommit: 'y' }),
      ),
    ).toBe('R23_BATCH_COMPOSITION_INVALID');
  });
});

describe('2D-A3 R23 §55: the R22 drift cross-check compares aggregates only', () => {
  const fresh = {
    r21Tip: 'a',
    implementationCommit: 'b',
    measurement: { slotGraphCount: 5, nearDuplicateEdgeCount: 41 },
    canonicalSd7: { shingleSizeTokens: 5 },
    semantics: { sd9Evaluated: false },
    access: { r22SqlStatements: 0 },
  } as unknown as R22PublicGraphMeasurementCensus;

  it('ignores provenance commits and reports differing aggregate paths', () => {
    expect(
      r22AggregateDriftPaths(fresh, { ...fresh, r21Tip: 'z', implementationCommit: 'z' }),
    ).toEqual([]);
    expect(
      r22AggregateDriftPaths(fresh, {
        ...fresh,
        measurement: { slotGraphCount: 5, nearDuplicateEdgeCount: 40 },
      }),
    ).toEqual(['measurement.nearDuplicateEdgeCount']);
    expect(r22AggregateDriftPaths(fresh, null).length).toBeGreaterThan(0);
  });
});

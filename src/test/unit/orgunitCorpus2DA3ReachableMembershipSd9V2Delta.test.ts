/**
 * PHASE 2B-2D A3 R30 — THE INCREMENTAL DELTA PATH AROUND R24'S PURE READINESS HELPER.
 *
 * Every identity, score and graph here is INVENTED. No real corpus, no sealed
 * file, no database, no network. Proves, without a database:
 *
 *   - every delta preparation reaches R24's real
 *     `deriveUnboundSlotReachableMembershipReadiness` exactly once,
 *     all-or-nothing, and its canonical objects are kept by reference - an
 *     exact membership IS the canonical cap array, SET_R readiness IS the
 *     stored R29 object;
 *   - a BLOCKED canonical cap gives a BLOCKED membership with no document
 *     list, and a full-rank-blocked slot keeps an EXACT reachable cap;
 *   - SD9 is the canonical survivor envelope: [34,34] and [4,5] successful,
 *     [3,4] pending, [3,3] unsuccessful - never a cap count;
 *   - an R24 result that is not by reference is refused;
 *   - nothing but an actual R29 mint can mint, and neither R24 V1 nor R23 V1
 *     minting, nor any complete-corpus preflight, is reached;
 *   - the R29 drift and R24 historical-baseline cross-checks;
 *   - the stated canonical constants equal the canonical contracts.
 *
 * Synthetic preparations are NOT minted and cannot be: an R29 preparation
 * exists only behind a real R26 mint of a real run. The minted route is
 * exercised by the real V1 -> V2 -> R26 -> R27 -> R28 -> R29 -> R30 chain,
 * whose results the audit records.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as R24MembershipModule from '../harness/phase2b2d/a3readiness/membership.js';
import type * as R24DevTrainModule from '../harness/phase2b2d/a3readiness/devTrain.js';
import type * as R23DevTrainModule from '../harness/phase2b2d/a3samples/devTrain.js';
import type * as PreflightModule from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';
import {
  MIN_PAGES_PER_ORGANISATION,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
  SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY,
} from '../harness/phase2b2d/a3prep/contracts.js';
import { SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT } from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';
import { SET_P_DOCUMENT_CAP_EXACT } from '../harness/phase2b2d/a3prep/setPSd7.js';
import {
  SET_R_DOCUMENT_CAP_EXACT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
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
import { A3ReadinessRefusal } from '../harness/phase2b2d/a3readiness/refusal.js';
import {
  REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED,
  REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT,
  R24_SD9_SEMANTICS,
} from '../harness/phase2b2d/a3readiness/types.js';
import { prepareUnboundSlotSampleSurvivors } from '../harness/phase2b2d/a3samples/prepare.js';
import type { UnboundA3SlotSampleSurvivorPreparation } from '../harness/phase2b2d/a3samples/types.js';
import type { NearDuplicateGraphMeasurement } from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';
import type { R29PublicIncrementalSampleSurvivorCensus } from '../harness/phase2b2d/a3samplesV2/census.js';
import {
  deriveCanonicalReachableMembershipSd9CoverageExpansionV2,
  deriveDeltaReadinessAggregates,
  deriveR30PublicIncrementalReachableMembershipSd9Census,
  R30_STATED_CANONICAL_READINESS_CONSTANTS,
} from '../harness/phase2b2d/a3readinessV2/census.js';
import {
  deriveDeltaSlotReadinessAllOrNothing,
  R30_STATED_REACHABLE_MEMBERSHIP_POLICY,
} from '../harness/phase2b2d/a3readinessV2/deriveDelta.js';
import {
  bindDevTrainReachableMembershipSd9DeltaBatchV2,
  deltaReadinessForSamplePreparation,
  isA3DevTrainReachableMembershipSd9DeltaBatchV2,
  isA3DevTrainSlotReachableMembershipSd9DeltaV2,
  readinessDeltaBatchForSampleDeltaBatch,
  sampleDeltaBatchForReadinessDeltaBatch,
  samplePreparationForDeltaReadiness,
} from '../harness/phase2b2d/a3readinessV2/devTrain.js';
import {
  R30_EXPECTED_R29_CHECKPOINT,
  requireNoR29SampleDeltaDrift,
  requireR24HistoricalBaseline,
  r29DeltaDriftPaths,
} from '../harness/phase2b2d/a3readinessV2/r29Drift.js';
import {
  A3ReadinessV2Refusal,
  type A3ReadinessV2RefusalCode,
} from '../harness/phase2b2d/a3readinessV2/refusal.js';

const calls = vi.hoisted(() => ({
  helper: 0,
  r24Mint: 0,
  r23Mint: 0,
  preflight: 0,
  tamper: 'NONE' as 'NONE' | 'COPY_P_DOCUMENTS' | 'COPY_SET_R_READINESS' | 'SEMANTICS',
}));

vi.mock('../harness/phase2b2d/a3readiness/membership.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R24MembershipModule>();
  return {
    ...actual,
    deriveUnboundSlotReachableMembershipReadiness: (
      ...args: Parameters<typeof actual.deriveUnboundSlotReachableMembershipReadiness>
    ) => {
      calls.helper += 1;
      const result = actual.deriveUnboundSlotReachableMembershipReadiness(...args);
      if (calls.tamper === 'COPY_P_DOCUMENTS') {
        const membership = result.setPReachableMembership as unknown as Record<string, unknown>;
        return {
          ...result,
          setPReachableMembership: {
            ...membership,
            documents: [...(membership['documents'] as unknown[])],
          },
        };
      }
      if (calls.tamper === 'COPY_SET_R_READINESS') {
        return { ...result, setRFreezeSlotReadiness: { ...result.setRFreezeSlotReadiness } };
      }
      if (calls.tamper === 'SEMANTICS') {
        return { ...result, setRSd9: { ...result.setRSd9, semantics: 'A2_ACQUISITION_STATUS' } };
      }
      return result;
    },
  };
});

vi.mock('../harness/phase2b2d/a3readiness/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R24DevTrainModule>();
  return {
    ...actual,
    bindDevTrainReachableMembershipSd9Batch: (
      ...args: Parameters<typeof actual.bindDevTrainReachableMembershipSd9Batch>
    ) => {
      calls.r24Mint += 1;
      return actual.bindDevTrainReachableMembershipSd9Batch(...args);
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

vi.mock('../harness/phase2b2d/a3prep/corpusFreezePreflight.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PreflightModule>();
  return {
    ...actual,
    checkCurrentA3CorpusFreezePreflight: (
      ...args: Parameters<typeof actual.checkCurrentA3CorpusFreezePreflight>
    ) => {
      calls.preflight += 1;
      return actual.checkCurrentA3CorpusFreezePreflight(...args);
    },
    checkSetPShortTextCorpusFreezeGate: (
      ...args: Parameters<typeof actual.checkSetPShortTextCorpusFreezeGate>
    ) => {
      calls.preflight += 1;
      return actual.checkSetPShortTextCorpusFreezeGate(...args);
    },
    checkSetRShortTextCorpusFreezeGate: (
      ...args: Parameters<typeof actual.checkSetRShortTextCorpusFreezeGate>
    ) => {
      calls.preflight += 1;
      return actual.checkSetRShortTextCorpusFreezeGate(...args);
    },
  };
});

beforeEach(() => {
  calls.tamper = 'NONE';
});

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(join(REPO_ROOT, 'docs/evaluation', name), 'utf8'));

// ---------------------------------------------------------------------------
// Synthetic builders (the same shapes R23's and R29's unit suites use).
// ---------------------------------------------------------------------------

const SLOT = 7 as A3SelectionIndex;

const sha = (label: string): A3DocumentSha256 =>
  createHash('sha256')
    .update(`synthetic-a3-r30:${label}`, 'utf8')
    .digest('hex') as A3DocumentSha256;

function obs(page: A3PageEvidenceId, track: string, score: string): A3TrackCandidateObservation {
  return {
    pageEvidenceId: page,
    track,
    candidateScoreDecimal: score,
    ruleVersion: 'orgunit-signal-rules-v1',
  } as never;
}

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

/**
 * An R29-shaped preparation: R23's own canonical preparation of `size`
 * descending-score documents. `short` positions are unresolved short text;
 * scores descend by slot position, so SET_R ranks slot 0 first and the last
 * slot last.
 */
function preparation(
  seed: string,
  size: number,
  short: readonly number[] = [],
  edges: readonly (readonly [number, number])[] = [],
): UnboundA3SlotSampleSurvivorPreparation {
  const documents = Array.from({ length: size }, (_, i) =>
    entry(`${seed}-d${i}`, String(1000 - i)),
  );
  return prepareUnboundSlotSampleSurvivors(
    { selectionIndex: SLOT, split: 'DEV_TRAIN', documents },
    graphFor(documents, short, edges),
  );
}

function codeOf(run: () => unknown): A3ReadinessV2RefusalCode | 'NO_REFUSAL' {
  try {
    run();
  } catch (error) {
    if (error instanceof A3ReadinessV2Refusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}

function derive(prep: UnboundA3SlotSampleSurvivorPreparation) {
  const [readiness] = deriveDeltaSlotReadinessAllOrNothing([prep]);
  return readiness!;
}

function documentsOf(cap: object): unknown {
  return (cap as { readonly documents?: unknown }).documents;
}

/** Finds a seed whose canonical SET_P cap has the wanted exactness; READ from R23, never computed. */
function seedWhereSetPCap(
  want: 'EXACT' | 'BLOCKED',
  size: number,
  short: readonly number[],
): UnboundA3SlotSampleSurvivorPreparation {
  for (let seed = 0; seed < 400; seed += 1) {
    const prep = preparation(`p${want}${seed}`, size, short);
    if ((prep.setP.documentCap.status === SET_P_DOCUMENT_CAP_EXACT) === (want === 'EXACT'))
      return prep;
  }
  throw new Error(`no SET_P ${want} seed`);
}

// ---------------------------------------------------------------------------

describe('2D-A3 R30 §16 / §43: the delta path reaches R24 exactly once per preparation', () => {
  it('calls the R24 helper once per preparation and returns its result unchanged', () => {
    const prep = preparation('once', 35, [], [[0, 1]]);
    const before = calls.helper;
    const [readiness] = deriveDeltaSlotReadinessAllOrNothing([prep]);
    expect(calls.helper).toBe(before + 1);
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(readiness!.kind).toBe('UNBOUND_A3_SLOT_REACHABLE_MEMBERSHIP_READINESS');
  });

  it('§30: is all-or-nothing - a bad second preparation returns nothing for the first', () => {
    const prep = preparation('aon', 35, [], [[0, 1]]);
    let caught: unknown;
    let returned: unknown;
    try {
      returned = deriveDeltaSlotReadinessAllOrNothing([prep, { ...prep, split: 'X' } as never]);
    } catch (error) {
      caught = error;
    }
    expect(returned).toBeUndefined();
    expect(caught).toBeInstanceOf(A3ReadinessRefusal);
    expect((caught as A3ReadinessRefusal).code).toBe('R24_SPLIT_NOT_SUPPORTED');
  });

  it("propagates R24's own refusal unchanged", () => {
    let caught: unknown;
    try {
      deriveDeltaSlotReadinessAllOrNothing([{} as never]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(A3ReadinessRefusal);
    expect((caught as A3ReadinessRefusal).code).toBe('R24_SLOT_PREPARATION_SHAPE_INVALID');
  });
});

describe('2D-A3 R30 §17-§25 / §43-§44: exact caps, by reference, and [34,34] successful', () => {
  const prep = preparation('exact', 35, [], [[0, 1]]);
  const readiness = derive(prep);

  it('§18 / §19: SET_P readiness is derived EXACT/EXACT; SET_R readiness is the stored object', () => {
    expect(readiness.setPFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
    expect(readiness.setPFreezeSlotReadiness.measurableSurvivorCount).toBe(34);
    expect(readiness.setPFreezeSlotReadiness.shortTextUnresolvedCount).toBe(0);
    expect(readiness.setRFreezeSlotReadiness).toBe(prep.setRFreezeSlotReadiness);
    expect(readiness.setRFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
  });

  it('§20 / §21 / §44: memberships are EXACT at 8 / 4 and ARE the canonical cap arrays', () => {
    const p = readiness.setPReachableMembership;
    const r = readiness.setRReachableMembership;
    expect(p.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);
    expect(r.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);
    if (p.status !== REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT) throw new Error('unreachable');
    if (r.status !== REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT) throw new Error('unreachable');
    expect(p.documentCount).toBe(8);
    expect(r.documentCount).toBe(4);
    // Object identity, not deep equality.
    expect(p.documents).toBe(documentsOf(prep.setP.documentCap));
    expect(r.documents).toBe(documentsOf(prep.setRDocumentCap));
  });

  it('§22: both memberships carry the one canonical owner policy and its Generation-1 tokens', () => {
    for (const membership of [
      readiness.setPReachableMembership,
      readiness.setRReachableMembership,
    ]) {
      expect(membership.ownerPolicy.policy).toBe(SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY);
      expect({
        decisionToken: membership.ownerPolicy.decisionToken,
        generation: membership.ownerPolicy.generation,
        requiredMembershipScope: membership.ownerPolicy.requiredMembershipScope,
        zeroExtensionHeadroomScope: membership.ownerPolicy.zeroExtensionHeadroomScope,
        unreachableTailFreezeEffect: membership.ownerPolicy.unreachableTailFreezeEffect,
      }).toEqual(R30_STATED_REACHABLE_MEMBERSHIP_POLICY);
    }
  });

  it('§23-§25: both SD9 envelopes are [34,34], ACQUISITION_SUCCESSFUL, with the exact semantics token', () => {
    for (const sd9 of [readiness.setPSd9, readiness.setRSd9]) {
      expect(sd9.semantics).toBe(
        'A3_MECHANICAL_SD9_OF_CANONICAL_SURVIVOR_ENVELOPE_ONLY_NOT_A2_ACQUISITION_STATUS',
      );
      expect(sd9.canonical.minCount).toBe(34);
      expect(sd9.canonical.maxCount).toBe(34);
      expect(sd9.canonical.status).toBe('ACQUISITION_SUCCESSFUL');
    }
  });
});

describe('2D-A3 R30 §26-§29 / §45-§49: blocked, pending and unsuccessful remain supported', () => {
  it('§27 / §45: a BLOCKED canonical cap gives a BLOCKED membership with no documents field', () => {
    // Slot 0 is short text with the highest score, so SET_R ranks it first.
    const prep = preparation('blockedR', 10, [0]);
    expect(prep.setRDocumentCap.status).not.toBe(SET_R_DOCUMENT_CAP_EXACT);
    const readiness = derive(prep);
    const r = readiness.setRReachableMembership;
    expect(r.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED);
    expect(Object.prototype.hasOwnProperty.call(r, 'documents')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(r, 'documentCount')).toBe(false);
    // BLOCKED is a result: SD9 is still evaluated from the survivor envelope.
    expect(readiness.setRSd9.canonical.minCount).toBe(9);
    expect(readiness.setRSd9.canonical.maxCount).toBe(10);
  });

  it('§45: a BLOCKED SET_P cap likewise, never a guessed prefix', () => {
    const prep = seedWhereSetPCap('BLOCKED', 10, [0]);
    const p = derive(prep).setPReachableMembership;
    expect(p.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED);
    expect(Object.prototype.hasOwnProperty.call(p, 'documents')).toBe(false);
  });

  it('§46: full rank short-text BLOCKED while the initial cap is EXACT', () => {
    // The short text is the LOWEST score, so SET_R ranks it last: cap-4 exact.
    const r = preparation('tailR', 12, [11]);
    const rReadiness = derive(r);
    expect(rReadiness.setRFreezeSlotReadiness.fullRankReadiness).not.toBe(
      SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
    expect(rReadiness.setRReachableMembership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);

    const p = seedWhereSetPCap('EXACT', 20, [19]);
    const pReadiness = derive(p);
    expect(pReadiness.setPFreezeSlotReadiness.fullRankReadiness).not.toBe(
      SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
    expect(pReadiness.setPReachableMembership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);
  });

  it('§47: 4 survivors + 1 unresolved short text -> [4,5] -> ACQUISITION_SUCCESSFUL', () => {
    const readiness = derive(preparation('four', 5, [4]));
    for (const sd9 of [readiness.setPSd9, readiness.setRSd9]) {
      expect([sd9.canonical.minCount, sd9.canonical.maxCount]).toEqual([4, 5]);
      expect(sd9.canonical.status).toBe('ACQUISITION_SUCCESSFUL');
    }
  });

  it('§28 / §48: 3 survivors + 1 unresolved short text -> [3,4] -> PENDING', () => {
    const readiness = derive(preparation('pending', 4, [3]));
    for (const sd9 of [readiness.setPSd9, readiness.setRSd9]) {
      expect([sd9.canonical.minCount, sd9.canonical.maxCount]).toEqual([3, 4]);
      expect(sd9.canonical.status).toBe('ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL');
    }
  });

  it('§29 / §49: 3 survivors + 0 unresolved -> [3,3] -> UNSUCCESSFUL, caps still EXACT', () => {
    const readiness = derive(preparation('three', 3));
    for (const sd9 of [readiness.setPSd9, readiness.setRSd9]) {
      expect([sd9.canonical.minCount, sd9.canonical.maxCount]).toEqual([3, 3]);
      expect(sd9.canonical.status).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
    }
    // SD9 reads survivors, never the cap: an exact 3-document cap is not a page count.
    expect(readiness.setPReachableMembership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);
  });
});

describe('2D-A3 R30 §17 / §20 / §25: an R24 result that is not by reference is refused', () => {
  const prep = preparation('tamper', 35, [], [[0, 1]]);

  it.each([
    ['a copied SET_P membership array', 'COPY_P_DOCUMENTS', 'R30_DELTA_READINESS_NOT_BY_REFERENCE'],
    ['a copied SET_R readiness', 'COPY_SET_R_READINESS', 'R30_DELTA_READINESS_NOT_BY_REFERENCE'],
    ['a reinterpreted SD9 semantics token', 'SEMANTICS', 'R30_SD9_SEMANTICS_MISMATCH'],
  ] as const)('refuses %s', (_label, tamper, code) => {
    calls.tamper = tamper;
    expect(codeOf(() => deriveDeltaSlotReadinessAllOrNothing([prep]))).toBe(code);
  });
});

describe('2D-A3 R30 §10 / §13: nothing but an actual R29 mint can mint', () => {
  const prep = preparation('negative', 35, [], [[0, 1]]);
  const fakePreparation = {
    kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_DELTA_V2',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    selectionIndex: SLOT,
    split: 'DEV_TRAIN',
    setP: prep.setP,
    setR: prep.setR,
    setRDocumentCap: prep.setRDocumentCap,
    setRFreezeSlotReadiness: prep.setRFreezeSlotReadiness,
  };
  const fakeBatch = {
    kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V2',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV2: {},
    graphDeltaBatch: { kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V2', items: [] },
    items: [fakePreparation],
  };
  const historicalR23Preparation = {
    ...prep,
    kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_V1',
  };
  const historicalR23Batch = {
    kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_BATCH_V1',
    split: 'DEV_TRAIN',
    items: [historicalR23Preparation],
  };
  const r28Batch = { kind: 'A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V2', split: 'DEV_TRAIN', items: [] };
  const r27Batch = {
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V2',
    split: 'DEV_TRAIN',
    items: [],
  };
  const r26Batch = {
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V2',
    split: 'DEV_TRAIN',
    items: [],
  };

  it.each([
    ['a sample-batch literal', fakeBatch],
    ['a spread clone', { ...fakeBatch }],
    ['a structuredClone', structuredClone(fakeBatch)],
    ['a JSON round-trip', JSON.parse(JSON.stringify(fakeBatch))],
    ['a batch holding a cloned preparation', { ...fakeBatch, items: [{ ...fakePreparation }] }],
    ['a preparation passed as a batch', fakePreparation],
    ['an unbound R23 preparation', prep],
    ['a historical R23 sample batch', historicalR23Batch],
    ['a historical R23 slot preparation', historicalR23Preparation],
    ['an R28 graph batch', r28Batch],
    ['an R27 document batch', r27Batch],
    ['an R26 evidence batch', r26Batch],
    ['undefined', undefined],
  ])('refuses %s before any R24 helper call', (_label, input) => {
    const before = calls.helper;
    expect(codeOf(() => bindDevTrainReachableMembershipSd9DeltaBatchV2(input))).toBe(
      'R30_SAMPLE_DELTA_NOT_MINTED_BY_R29',
    );
    expect(calls.helper).toBe(before);
  });

  it('brands nothing it did not mint, and provenance of a literal is undefined', () => {
    expect(isA3DevTrainReachableMembershipSd9DeltaBatchV2(fakeBatch)).toBe(false);
    expect(isA3DevTrainSlotReachableMembershipSd9DeltaV2(derive(prep))).toBe(false);
    expect(samplePreparationForDeltaReadiness(fakePreparation)).toBeUndefined();
    expect(deltaReadinessForSamplePreparation(fakePreparation)).toBeUndefined();
    expect(sampleDeltaBatchForReadinessDeltaBatch(fakeBatch)).toBeUndefined();
    expect(readinessDeltaBatchForSampleDeltaBatch(fakeBatch)).toBeUndefined();
  });

  it('the census and coverage expansion refuse anything not minted by R30', () => {
    expect(codeOf(() => deriveDeltaReadinessAggregates(fakeBatch as never))).toBe(
      'R30_NOT_A_MINTED_DELTA_READINESS_BATCH',
    );
    expect(
      codeOf(() =>
        deriveCanonicalReachableMembershipSd9CoverageExpansionV2(fakeBatch as never, {} as never),
      ),
    ).toBe('R30_NOT_A_MINTED_DELTA_READINESS_BATCH');
    expect(
      codeOf(() =>
        deriveR30PublicIncrementalReachableMembershipSd9Census(fakeBatch as never, {} as never, {
          r29Tip: 'x',
          implementationCommit: 'y',
        }),
      ),
    ).toBe('R30_NOT_A_MINTED_DELTA_READINESS_BATCH');
  });
});

describe('2D-A3 R30 §36 / §52: R29 drift and the R24 historical baseline', () => {
  const committedR29 = readJson(
    'PHASE_2B_2D_A3_R29_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json',
  ) as R29PublicIncrementalSampleSurvivorCensus;
  const committedR24 = readJson(
    'PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS_V1.json',
  ) as Record<string, unknown>;

  it('the committed R29 census has no drift against itself and states the checkpoint', () => {
    expect(r29DeltaDriftPaths(committedR29, committedR29)).toEqual([]);
    expect(() => requireNoR29SampleDeltaDrift(committedR29, committedR29)).not.toThrow();
    expect(Object.keys(R30_EXPECTED_R29_CHECKPOINT)).toContain(
      'delta.singleEdgeSlotsSameExcludedEndpoint',
    );
  });

  it('reports a moved aggregate by path and stops', () => {
    const moved = structuredClone(committedR29) as unknown as Record<
      string,
      Record<string, Record<string, number>>
    >;
    moved['delta']!['setP']!['measurableSurvivorCount'] = 33;
    expect(r29DeltaDriftPaths(moved as never, committedR29)).toEqual([
      'delta.setP.measurableSurvivorCount',
    ]);
    expect(codeOf(() => requireNoR29SampleDeltaDrift(moved as never, committedR29))).toBe(
      'STOP_R30_CANONICAL_R29_SAMPLE_DELTA_DRIFT_REQUIRES_REVIEW',
    );
  });

  it('a fresh census whose checkpoint moved with the committed one still stops', () => {
    const moved = structuredClone(committedR29) as unknown as Record<
      string,
      Record<string, Record<string, number>>
    >;
    moved['delta']!['setR']!['exactCapDocumentCountAcrossExactSlots'] = 3;
    expect(codeOf(() => requireNoR29SampleDeltaDrift(moved as never, moved))).toBe(
      'STOP_R30_CANONICAL_R29_SAMPLE_DELTA_DRIFT_REQUIRES_REVIEW',
    );
  });

  it('reads the R24 baseline as aggregates: 5 slots, 40 / 20 docs, 142 survivors, [142,143], 5 successful', () => {
    const baseline = requireR24HistoricalBaseline(committedR24);
    expect(baseline.slotReadinessCount).toBe(5);
    const common = {
      reachableMembershipExactSlotCount: 5,
      reachableMembershipBlockedSlotCount: 0,
      fullRankExactSlotCount: 4,
      fullRankShortTextBlockedSlotCount: 1,
      fullRankBlockedWhileReachableMembershipExactSlotCount: 1,
      measurableSurvivorCount: 142,
      unresolvedShortTextOccurrenceCount: 1,
      sd9MinEnvelopeTotal: 142,
      sd9MaxEnvelopeTotal: 143,
      sd9MechanicalSuccessfulSlotCount: 5,
      sd9MechanicalUnsuccessfulSlotCount: 0,
      sd9MechanicalPendingSlotCount: 0,
    };
    expect(baseline.setP).toEqual({
      ...common,
      reachableMembershipDocumentCountAcrossExactSlots: 40,
    });
    expect(baseline.setR).toEqual({
      ...common,
      reachableMembershipDocumentCountAcrossExactSlots: 20,
    });
    expect(baseline.crossSample).toEqual({
      bothSamplesMechanicallySuccessfulSlotCount: 5,
      sd9StatusDisagreementSlotCount: 0,
    });
  });

  it('refuses an R24 baseline that no longer states the canonical history', () => {
    const moved = structuredClone(committedR24) as Record<string, Record<string, number>>;
    moved['setR']!['sd9MaxEnvelopeTotal'] = 142;
    expect(codeOf(() => requireR24HistoricalBaseline(moved))).toBe(
      'R30_R24_HISTORICAL_BASELINE_INPUT_INVALID',
    );
  });
});

describe('2D-A3 R30: stated constants and counters', () => {
  it('the stated canonical constants and owner tokens equal the canonical contracts', () => {
    const policy = SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY;
    expect(R30_STATED_REACHABLE_MEMBERSHIP_POLICY).toEqual({
      decisionToken: policy.decisionToken,
      generation: policy.generation,
      requiredMembershipScope: policy.requiredMembershipScope,
      zeroExtensionHeadroomScope: policy.zeroExtensionHeadroomScope,
      unreachableTailFreezeEffect: policy.unreachableTailFreezeEffect,
    });
    const C = R30_STATED_CANONICAL_READINESS_CONSTANTS;
    expect(C.setPMaxPagesPerOrganisation).toBe(SET_P_MAX_PAGES_PER_ORGANISATION);
    expect(C.setRMaxPagesPerOrganisation).toBe(SET_R_MAX_PAGES_PER_ORGANISATION);
    expect(C.sd9MinPagesPerOrganisation).toBe(MIN_PAGES_PER_ORGANISATION);
    expect(C.sd9Semantics).toBe(R24_SD9_SEMANTICS);
    expect(C.setPFullSampleRankMembershipExact).toBe(SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT);
    expect(C.setRFullSampleRankMembershipExact).toBe(SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT);
  });

  it('counted zero R24 V1 mints, R23 V1 mints and complete-corpus preflights in this file', () => {
    expect(calls.r24Mint).toBe(0);
    expect(calls.r23Mint).toBe(0);
    expect(calls.preflight).toBe(0);
    expect(calls.helper).toBeGreaterThan(0);
  });
});

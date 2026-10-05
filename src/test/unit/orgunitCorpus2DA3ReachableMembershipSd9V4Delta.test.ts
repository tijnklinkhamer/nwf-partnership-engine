/**
 * PHASE 2B-2D A3 R37 — THE V4 DELTA PATH AROUND R24'S PURE READINESS HELPER.
 *
 * Every identity, score and graph here is INVENTED. No real corpus, no sealed
 * file, no database, no network. Proves, without a database:
 *
 *   - every delta preparation reaches R24's real
 *     `deriveUnboundSlotReachableMembershipReadiness` exactly once, with the
 *     preparation object itself, all-or-nothing, and its canonical objects
 *     are kept by reference - an exact membership IS the canonical cap array,
 *     SET_R readiness IS the stored preparation object;
 *   - a BLOCKED canonical cap gives a BLOCKED membership with no document
 *     list, and a full-rank-blocked slot keeps an EXACT reachable cap;
 *   - SD9 is the canonical survivor envelope: [4,5] successful, [3,4]
 *     pending, [3,3] unsuccessful, [34,34] successful - never a cap count -
 *     and a blocked membership is still evaluated;
 *   - SET_P and SET_R statuses are carried independently, and can disagree;
 *   - an R24 result that is not by reference is refused;
 *   - the fresh-R36 drift gate and the R24 + R30 historical baseline;
 *   - the stated canonical constants equal the canonical contracts;
 *   - neither R24 V1, R30 nor any complete-corpus preflight is reached.
 *
 * Synthetic preparations are NOT minted here and cannot be: the minted route
 * is exercised by the stand-in binder suite and by the real chain.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as R24MembershipModule from '../harness/phase2b2d/a3readiness/membership.js';
import type * as R24DevTrainModule from '../harness/phase2b2d/a3readiness/devTrain.js';
import type * as R30DevTrainModule from '../harness/phase2b2d/a3readinessV2/devTrain.js';
import type * as PreflightModule from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';
import {
  MIN_PAGES_PER_ORGANISATION,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
  SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY,
} from '../harness/phase2b2d/a3prep/contracts.js';
import { SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT } from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';
import { evaluateSd9FromAdmissiblePostSd7Bounds } from '../harness/phase2b2d/a3prep/sd9.js';
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
import type { R36PublicIncrementalSampleSurvivorCensus } from '../harness/phase2b2d/a3samplesV4/census.js';
import {
  aggregateDeltaReadinessV4,
  deriveDeltaSlotReadinessAllOrNothingV4,
} from '../harness/phase2b2d/a3readinessV4/deriveDelta.js';
import {
  R37_EXPECTED_R36_CHECKPOINT,
  r36ReproductionDriftPaths,
  requireHistoricalReadinessBaselineProofV4,
  requireHistoricalReadinessBaselineV4,
} from '../harness/phase2b2d/a3readinessV4/r36Drift.js';
import {
  A3ReadinessV4Refusal,
  type A3ReadinessV4RefusalCode,
} from '../harness/phase2b2d/a3readinessV4/refusal.js';
import {
  R37_STATED_CANONICAL_READINESS_CONSTANTS,
  R37_STATED_REACHABLE_MEMBERSHIP_POLICY,
} from '../harness/phase2b2d/a3readinessV4/types.js';

const calls = vi.hoisted(() => ({
  helper: 0,
  helperInputs: [] as unknown[],
  r24Mint: 0,
  r30Mint: 0,
  preflight: 0,
  tamper: 'NONE' as
    | 'NONE'
    | 'COPY_P_DOCUMENTS'
    | 'COPY_R_DOCUMENTS'
    | 'COPY_SET_R_READINESS'
    | 'SEMANTICS'
    | 'UNKNOWN_STATUS'
    | 'CAP_AS_ENVELOPE'
    | 'FOREIGN_POLICY',
}));

vi.mock('../harness/phase2b2d/a3readiness/membership.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R24MembershipModule>();
  return {
    ...actual,
    deriveUnboundSlotReachableMembershipReadiness: (
      ...args: Parameters<typeof actual.deriveUnboundSlotReachableMembershipReadiness>
    ) => {
      calls.helper += 1;
      calls.helperInputs.push(args[0]);
      const result = actual.deriveUnboundSlotReachableMembershipReadiness(...args);
      const copyDocuments = (key: 'setPReachableMembership' | 'setRReachableMembership') => {
        const membership = result[key] as unknown as Record<string, unknown>;
        return {
          ...result,
          [key]: { ...membership, documents: [...(membership['documents'] as unknown[])] },
        };
      };
      switch (calls.tamper) {
        case 'COPY_P_DOCUMENTS':
          return copyDocuments('setPReachableMembership');
        case 'COPY_R_DOCUMENTS':
          return copyDocuments('setRReachableMembership');
        case 'COPY_SET_R_READINESS':
          return { ...result, setRFreezeSlotReadiness: { ...result.setRFreezeSlotReadiness } };
        case 'SEMANTICS':
          return { ...result, setRSd9: { ...result.setRSd9, semantics: 'A2_ACQUISITION_STATUS' } };
        case 'UNKNOWN_STATUS':
          return {
            ...result,
            setPSd9: {
              ...result.setPSd9,
              canonical: { ...result.setPSd9.canonical, status: 'ACQUISITION_REPLACEMENT_DUE' },
            },
          };
        case 'CAP_AS_ENVELOPE':
          return {
            ...result,
            setPSd9: {
              ...result.setPSd9,
              canonical: { ...result.setPSd9.canonical, minCount: 8, maxCount: 8 },
            },
          };
        case 'FOREIGN_POLICY':
          return {
            ...result,
            setRReachableMembership: {
              ...result.setRReachableMembership,
              ownerPolicy: {
                ...result.setRReachableMembership.ownerPolicy,
                policy: { ...result.setRReachableMembership.ownerPolicy.policy },
              },
            },
          };
        default:
          return result;
      }
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

vi.mock('../harness/phase2b2d/a3readinessV2/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R30DevTrainModule>();
  return {
    ...actual,
    bindDevTrainReachableMembershipSd9DeltaBatchV2: (
      ...args: Parameters<typeof actual.bindDevTrainReachableMembershipSd9DeltaBatchV2>
    ) => {
      calls.r30Mint += 1;
      return actual.bindDevTrainReachableMembershipSd9DeltaBatchV2(...args);
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

// The three frozen SD9 tokens, READ from the canonical evaluator (test-side only).
const ACQUISITION_SUCCESSFUL = evaluateSd9FromAdmissiblePostSd7Bounds(4, 4);
const ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET = evaluateSd9FromAdmissiblePostSd7Bounds(3, 3);
const ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL = evaluateSd9FromAdmissiblePostSd7Bounds(3, 4);

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(join(REPO_ROOT, 'docs/evaluation', name), 'utf8'));
const R24_CENSUS = 'PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS_V1.json';
const R30_CENSUS =
  'PHASE_2B_2D_A3_R30_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1.json';
const R36_CENSUS =
  'PHASE_2B_2D_A3_R36_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json';

// ---------------------------------------------------------------------------
// Synthetic builders (the same shapes R23's, R30's and R36's unit suites use).
// ---------------------------------------------------------------------------

const SLOT = 911 as A3SelectionIndex;

const sha = (label: string): A3DocumentSha256 =>
  createHash('sha256')
    .update(`synthetic-a3-r37:${label}`, 'utf8')
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
 * An R36-shaped preparation: R23's own canonical preparation of `size`
 * descending-score documents. `short` positions are unresolved short text;
 * scores descend by slot position, so SET_R ranks slot 0 first.
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

function codeOf(run: () => unknown): A3ReadinessV4RefusalCode | string {
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

function derive(prep: UnboundA3SlotSampleSurvivorPreparation) {
  const [readiness] = deriveDeltaSlotReadinessAllOrNothingV4([prep]);
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

describe('2D-A3 R37 §11 / §35: the delta path reaches R24 exactly once per preparation', () => {
  it('calls the R24 helper once per preparation, with the preparation object itself', () => {
    const preps = [preparation('once-a', 35, [], [[0, 1]]), preparation('once-b', 12, [11])];
    const before = calls.helper;
    const inputsBefore = calls.helperInputs.length;
    const readiness = deriveDeltaSlotReadinessAllOrNothingV4(preps);
    expect(calls.helper).toBe(before + 2);
    const inputs = calls.helperInputs.slice(inputsBefore);
    expect(inputs[0]).toBe(preps[0]);
    expect(inputs[1]).toBe(preps[1]);
    expect(Object.isFrozen(readiness)).toBe(true);
    for (const item of readiness) {
      expect(item.kind).toBe('UNBOUND_A3_SLOT_REACHABLE_MEMBERSHIP_READINESS');
    }
  });

  it('§21: is all-or-nothing - a bad LAST preparation returns nothing for the earlier ones', () => {
    const good = Array.from({ length: 6 }, (_, i) => preparation(`aon${i}`, 20, [], [[0, 1]]));
    const bad = { ...good[0]!, split: 'X' } as never;
    let caught: unknown;
    let returned: unknown;
    const before = calls.helper;
    try {
      returned = deriveDeltaSlotReadinessAllOrNothingV4([...good, bad]);
    } catch (error) {
      caught = error;
    }
    expect(returned).toBeUndefined();
    expect(calls.helper).toBe(before + 7);
    expect(caught).toBeInstanceOf(A3ReadinessRefusal);
    expect((caught as A3ReadinessRefusal).code).toBe('R24_SPLIT_NOT_SUPPORTED');
  });

  it("propagates R24's own refusal unchanged", () => {
    expect(codeOf(() => deriveDeltaSlotReadinessAllOrNothingV4([{} as never]))).toBe(
      'R24_SLOT_PREPARATION_SHAPE_INVALID',
    );
  });
});

describe('2D-A3 R37 §13 / §15 / §35: exact caps, by reference, and [34,34] successful', () => {
  const prep = preparation('exact', 35, [], [[0, 1]]);
  const readiness = derive(prep);

  it('SET_P readiness is derived EXACT; SET_R readiness IS the stored preparation object', () => {
    expect(readiness.setPFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
    expect(readiness.setPFreezeSlotReadiness.measurableSurvivorCount).toBe(34);
    expect(readiness.setRFreezeSlotReadiness).toBe(prep.setRFreezeSlotReadiness);
  });

  it('memberships are EXACT at 8 / 4 and ARE the canonical cap arrays (identity)', () => {
    const p = readiness.setPReachableMembership;
    const r = readiness.setRReachableMembership;
    if (p.status !== REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT) throw new Error('unreachable');
    if (r.status !== REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT) throw new Error('unreachable');
    expect(p.documentCount).toBe(8);
    expect(r.documentCount).toBe(4);
    expect(p.documents).toBe(documentsOf(prep.setP.documentCap));
    expect(r.documents).toBe(documentsOf(prep.setRDocumentCap));
    expect(p.documentCount).toBe(p.documents.length);
  });

  it('§12: both memberships carry the one canonical owner policy and its Generation-1 tokens', () => {
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
      }).toEqual(R37_STATED_REACHABLE_MEMBERSHIP_POLICY);
    }
  });

  it('§17 / §37: SD9 is [34,34] from survivors - the exact cap of 8 / 4 is NOT the SD9 count', () => {
    for (const sd9 of [readiness.setPSd9, readiness.setRSd9]) {
      expect(sd9.semantics).toBe(R24_SD9_SEMANTICS);
      expect([sd9.canonical.minCount, sd9.canonical.maxCount]).toEqual([34, 34]);
      expect(sd9.canonical.status).toBe(ACQUISITION_SUCCESSFUL);
    }
    expect(readiness.setPSd9.canonical.minCount).not.toBe(SET_P_MAX_PAGES_PER_ORGANISATION);
    expect(readiness.setRSd9.canonical.minCount).not.toBe(SET_R_MAX_PAGES_PER_ORGANISATION);
  });
});

describe('2D-A3 R37 §36: the three reachable-membership cases through R23 + R24', () => {
  it('exact cap, no short text -> EXACT reachable membership', () => {
    const prep = preparation('noshort', 20, [], [[2, 3]]);
    expect(prep.setP.sd7Preparation.counts.shortTextUnresolvedCount).toBe(0);
    const readiness = derive(prep);
    expect(readiness.setPReachableMembership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);
    expect(readiness.setRReachableMembership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);
  });

  it('blocked cap caused by unresolved short-text membership -> BLOCKED, with no document list', () => {
    // Slot 0 is short text with the highest score, so SET_R ranks it first.
    const prep = preparation('blockedR', 10, [0]);
    expect(prep.setRDocumentCap.status).not.toBe(SET_R_DOCUMENT_CAP_EXACT);
    const r = derive(prep).setRReachableMembership;
    expect(r.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED);
    expect(Object.prototype.hasOwnProperty.call(r, 'documents')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(r, 'documentCount')).toBe(false);

    const p = derive(seedWhereSetPCap('BLOCKED', 10, [0])).setPReachableMembership;
    expect(p.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED);
    expect(Object.prototype.hasOwnProperty.call(p, 'documents')).toBe(false);
  });

  it('full rank BLOCKED but initial cap EXACT -> reachable membership stays EXACT', () => {
    // The short text is the LOWEST score, so SET_R ranks it last: cap-4 exact.
    const r = preparation('tailR', 12, [11]);
    const rReadiness = derive(r);
    expect(rReadiness.setRFreezeSlotReadiness.fullRankReadiness).not.toBe(
      SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
    expect(rReadiness.setRReachableMembership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);
    // The unreachable tail is still unresolved, still counted, not resolved.
    expect(rReadiness.setRSd9.canonical.maxCount - rReadiness.setRSd9.canonical.minCount).toBe(1);

    const p = seedWhereSetPCap('EXACT', 20, [19]);
    const pReadiness = derive(p);
    expect(pReadiness.setPFreezeSlotReadiness.fullRankReadiness).not.toBe(
      SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
    expect(pReadiness.setPReachableMembership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);

    const aggregate = aggregateDeltaReadinessV4([rReadiness]);
    expect(aggregate.setR.fullRankShortTextBlockedSlotCount).toBe(1);
    expect(aggregate.setR.fullRankBlockedWhileReachableMembershipExactSlotCount).toBe(1);
    expect(aggregate.setR.reachableMembershipExactSlotCount).toBe(1);
  });
});

describe('2D-A3 R37 §17 / §37: SD9 through R24, from the survivor envelope', () => {
  it('4 survivors + 1 unresolved -> [4,5] -> ACQUISITION_SUCCESSFUL', () => {
    const readiness = derive(preparation('four', 5, [4]));
    for (const sd9 of [readiness.setPSd9, readiness.setRSd9]) {
      expect([sd9.canonical.minCount, sd9.canonical.maxCount]).toEqual([4, 5]);
      expect(sd9.canonical.status).toBe(ACQUISITION_SUCCESSFUL);
    }
  });

  it('3 survivors + 1 unresolved -> [3,4] -> PENDING', () => {
    const readiness = derive(preparation('pending', 4, [3]));
    for (const sd9 of [readiness.setPSd9, readiness.setRSd9]) {
      expect([sd9.canonical.minCount, sd9.canonical.maxCount]).toEqual([3, 4]);
      expect(sd9.canonical.status).toBe(ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL);
    }
  });

  it('3 survivors + 0 unresolved -> [3,3] -> UNSUCCESSFUL, although the caps are EXACT', () => {
    const readiness = derive(preparation('three', 3));
    for (const sd9 of [readiness.setPSd9, readiness.setRSd9]) {
      expect([sd9.canonical.minCount, sd9.canonical.maxCount]).toEqual([3, 3]);
      expect(sd9.canonical.status).toBe(ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET);
    }
    expect(readiness.setPReachableMembership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);
    expect(readiness.setRReachableMembership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);
  });

  it('a BLOCKED reachable membership does not prevent mechanical SD9 evaluation', () => {
    const readiness = derive(preparation('blockedSd9', 10, [0]));
    expect(readiness.setRReachableMembership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED);
    expect([readiness.setRSd9.canonical.minCount, readiness.setRSd9.canonical.maxCount]).toEqual([
      9, 10,
    ]);
    expect(readiness.setRSd9.canonical.status).toBe(ACQUISITION_SUCCESSFUL);
  });
});

describe('2D-A3 R37 §19 / §38: SET_P and SET_R statuses are carried independently', () => {
  // A star: document 0 (highest SET_R score) is near-duplicate to 1..4, and
  // 5..6 are isolated. SET_R keeps 0 and excludes 1..4 -> 3 survivors. A SET_P
  // salted order that reaches a leaf before 0 keeps more. Which seed does so
  // is READ from R23 - nothing here ranks or walks.
  const STAR: readonly (readonly [number, number])[] = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
  ];
  const prep = (() => {
    for (let seed = 0; seed < 400; seed += 1) {
      const candidate = preparation(`star${seed}`, 7, [], STAR);
      if (
        candidate.setP.sd7Preparation.counts.measurableSurvivorCount >= 4 &&
        candidate.setR.sd7Preparation.counts.measurableSurvivorCount === 3
      ) {
        return candidate;
      }
    }
    throw new Error('no divergent star seed');
  })();
  const readiness = derive(prep);

  it('the two samples get different canonical statuses, and R37 does not equalise them', () => {
    expect(readiness.setPSd9.canonical.status).toBe(ACQUISITION_SUCCESSFUL);
    expect(readiness.setRSd9.canonical.status).toBe(ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET);
    const aggregate = aggregateDeltaReadinessV4([readiness]);
    expect(aggregate.crossSample).toEqual({
      bothSamplesMechanicallySuccessfulSlotCount: 0,
      sd9StatusDisagreementSlotCount: 1,
    });
    expect(aggregate.setP.sd9MechanicalSuccessfulSlotCount).toBe(1);
    expect(aggregate.setR.sd9MechanicalUnsuccessfulSlotCount).toBe(1);
  });

  it('agreeing slots count as both-successful and add no disagreement', () => {
    const agreeing = derive(preparation('agree', 35, [], [[0, 1]]));
    const aggregate = aggregateDeltaReadinessV4([readiness, agreeing]);
    expect(aggregate.crossSample).toEqual({
      bothSamplesMechanicallySuccessfulSlotCount: 1,
      sd9StatusDisagreementSlotCount: 1,
    });
    expect(aggregate.slotReadinessCount).toBe(2);
  });
});

describe('2D-A3 R37 §13 / §15 / §17: an R24 result that is not by reference is refused', () => {
  const prep = preparation('tamper', 35, [], [[0, 1]]);

  it.each([
    ['a copied SET_P membership array', 'COPY_P_DOCUMENTS', 'R37_DELTA_READINESS_NOT_BY_REFERENCE'],
    ['a copied SET_R membership array', 'COPY_R_DOCUMENTS', 'R37_DELTA_READINESS_NOT_BY_REFERENCE'],
    ['a copied SET_R readiness', 'COPY_SET_R_READINESS', 'R37_DELTA_READINESS_NOT_BY_REFERENCE'],
    ['a reinterpreted SD9 semantics token', 'SEMANTICS', 'R37_SD9_SEMANTICS_MISMATCH'],
    ['a status outside the frozen three', 'UNKNOWN_STATUS', 'R37_SD9_SEMANTICS_MISMATCH'],
    ['a cap size as the SD9 envelope', 'CAP_AS_ENVELOPE', 'R37_DELTA_READINESS_NOT_BY_REFERENCE'],
    ['a second owner-policy object', 'FOREIGN_POLICY', 'R37_OWNER_POLICY_BINDING_MISMATCH'],
  ] as const)('refuses %s', (_label, tamper, code) => {
    calls.tamper = tamper;
    expect(codeOf(() => deriveDeltaSlotReadinessAllOrNothingV4([prep]))).toBe(code);
  });
});

describe('2D-A3 R37 §7 / §8: the fresh-R36 drift gate and the R24 + R30 historical baseline', () => {
  const committedR36 = readJson(R36_CENSUS) as R36PublicIncrementalSampleSurvivorCensus;
  const committedR24 = readJson(R24_CENSUS) as Record<string, unknown>;
  const committedR30 = readJson(R30_CENSUS) as Record<string, unknown>;

  it('the committed R36 census has no drift against itself, except the excluded commit', () => {
    expect(r36ReproductionDriftPaths(committedR36, committedR36)).toEqual([]);
    const otherCommit = { ...committedR36, implementationCommit: 'f'.repeat(40) };
    expect(r36ReproductionDriftPaths(otherCommit as never, committedR36)).toEqual([]);
    const otherTip = { ...committedR36, r35Tip: 'f'.repeat(40) };
    expect(r36ReproductionDriftPaths(otherTip as never, committedR36)).toEqual(['r35Tip']);
  });

  it('reports a moved aggregate by path, recursively', () => {
    const moved = structuredClone(committedR36) as unknown as Record<
      string,
      Record<string, Record<string, number>>
    >;
    moved['delta']!['setR']!['initialCapBlockedSlotCount'] = 3;
    expect(r36ReproductionDriftPaths(moved as never, committedR36)).toEqual([
      'delta.setR.initialCapBlockedSlotCount',
    ]);
  });

  it('the committed R36 census states every value of the R36 checkpoint', () => {
    const at = (path: string): unknown =>
      path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], committedR36);
    for (const [path, expected] of Object.entries(R37_EXPECTED_R36_CHECKPOINT)) {
      expect(at(path), path).toBe(expected);
    }
  });

  it('closes R24 + R30 to the six-slot historical readiness baseline', () => {
    const baseline = requireHistoricalReadinessBaselineV4(committedR24, committedR30, committedR36);
    expect(requireHistoricalReadinessBaselineProofV4(baseline)).toBe(baseline);
    expect(baseline.r24SlotReadinessCount).toBe(5);
    expect(baseline.r30NewSlotReadinessCount).toBe(1);
    expect(baseline.slotReadinessCount).toBe(6);
    const common = {
      reachableMembershipExactSlotCount: 6,
      reachableMembershipBlockedSlotCount: 0,
      fullRankExactSlotCount: 5,
      fullRankShortTextBlockedSlotCount: 1,
      fullRankBlockedWhileReachableMembershipExactSlotCount: 1,
      measurableSurvivorCount: 176,
      unresolvedShortTextOccurrenceCount: 1,
      sd9MinEnvelopeTotal: 176,
      sd9MaxEnvelopeTotal: 177,
      sd9MechanicalSuccessfulSlotCount: 6,
      sd9MechanicalUnsuccessfulSlotCount: 0,
      sd9MechanicalPendingSlotCount: 0,
    };
    expect(baseline.setP).toEqual({
      ...common,
      reachableMembershipDocumentCountAcrossExactSlots: 48,
    });
    expect(baseline.setR).toEqual({
      ...common,
      reachableMembershipDocumentCountAcrossExactSlots: 24,
    });
    expect(baseline.crossSample).toEqual({
      bothSamplesMechanicallySuccessfulSlotCount: 6,
      sd9StatusDisagreementSlotCount: 0,
    });
  });

  it.each([
    ['an R24 total', 'r24', ['setR', 'sd9MaxEnvelopeTotal'], 142],
    ['an R30 delta', 'r30', ['delta', 'setP', 'measurableSurvivorCount'], 33],
    [
      'an R30 historical copy',
      'r30',
      ['coverage', 'historical', 'setP', 'fullRankExactSlotCount'],
      5,
    ],
    ['the R30 slot count', 'r30', ['coverage', 'coverageReadinessSlots'], 7],
    [
      'R36 historical caps',
      'r36',
      ['coverage', 'historical', 'setP', 'initialCapExactSlotCount'],
      5,
    ],
  ] as const)('stops when %s no longer closes', (_label, which, path, value) => {
    const records = {
      r24: structuredClone(committedR24),
      r30: structuredClone(committedR30),
      r36: structuredClone(committedR36) as unknown as Record<string, unknown>,
    };
    let cursor = records[which] as Record<string, unknown>;
    for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
    cursor[path[path.length - 1]!] = value;
    expect(
      codeOf(() => requireHistoricalReadinessBaselineV4(records.r24, records.r30, records.r36)),
    ).toBe('STOP_R37_HISTORICAL_R24_R30_READINESS_BASELINE_DRIFT_REQUIRES_REVIEW');
  });

  it('a baseline not proved by the gate is not a baseline', () => {
    const real = requireHistoricalReadinessBaselineV4(committedR24, committedR30, committedR36);
    for (const candidate of [undefined, {}, { ...real }, structuredClone(real)]) {
      expect(codeOf(() => requireHistoricalReadinessBaselineProofV4(candidate))).toBe(
        'R37_HISTORICAL_READINESS_BASELINE_NOT_PROVED',
      );
    }
  });
});

describe('2D-A3 R37 §27: stated constants and counters', () => {
  it('the stated canonical constants and owner tokens equal the canonical contracts', () => {
    const policy = SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY;
    expect(R37_STATED_REACHABLE_MEMBERSHIP_POLICY).toEqual({
      decisionToken: policy.decisionToken,
      generation: policy.generation,
      requiredMembershipScope: policy.requiredMembershipScope,
      zeroExtensionHeadroomScope: policy.zeroExtensionHeadroomScope,
      unreachableTailFreezeEffect: policy.unreachableTailFreezeEffect,
    });
    const C = R37_STATED_CANONICAL_READINESS_CONSTANTS;
    expect(C.setPMaxPagesPerOrganisation).toBe(SET_P_MAX_PAGES_PER_ORGANISATION);
    expect(C.setRMaxPagesPerOrganisation).toBe(SET_R_MAX_PAGES_PER_ORGANISATION);
    expect(C.sd9MinPagesPerOrganisation).toBe(MIN_PAGES_PER_ORGANISATION);
    expect(C.sd9Semantics).toBe(R24_SD9_SEMANTICS);
    expect(C.setPFullSampleRankMembershipExact).toBe(SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT);
    expect(C.setRFullSampleRankMembershipExact).toBe(SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT);
    expect(C.sd9Successful).toBe(ACQUISITION_SUCCESSFUL);
    expect(C.sd9Unsuccessful).toBe(ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET);
    expect(C.sd9Pending).toBe(ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL);
    // The R30 record states the same envelope formula and tokens.
    const r30 = readJson(R30_CENSUS) as { canonicalConstants: Record<string, unknown> };
    expect(C).toEqual(r30.canonicalConstants);
  });

  it('counted zero R24 V1 mints, R30 mints and complete-corpus preflights in this file', () => {
    expect(calls.r24Mint).toBe(0);
    expect(calls.r30Mint).toBe(0);
    expect(calls.preflight).toBe(0);
    expect(calls.helper).toBeGreaterThan(0);
  });
});

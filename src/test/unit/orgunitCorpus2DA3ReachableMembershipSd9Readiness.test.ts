/**
 * PHASE 2B-2D A3 R24 — REACHABLE INITIAL-CAP MEMBERSHIP AND MECHANICAL SD9
 * READINESS, OVER SYNTHETIC SLOTS.
 *
 * Every identity, score and graph here is INVENTED. No real corpus, no sealed
 * file, no database, no network. Each synthetic slot is prepared through R23's
 * UNBOUND helper (itself driven by the canonical SET_P / SET_R compositions),
 * then handed to R24's UNBOUND helper. The minted route is exercised only by
 * the real R19 -> R20 -> R21 -> R22 -> R23 -> R24 chain.
 *
 * This file proves:
 *
 *   - an exact cap with a blocked full rank yields EXACT reachable membership,
 *     by reference, and leaves the short-text tail unresolved (§16, §43);
 *   - a blocked cap yields BLOCKED membership with no documents field, while
 *     SD9 is still evaluated from the survivor envelope (§17, §44);
 *   - the four canonical SD9 envelope cases (§45-§48);
 *   - SET_P and SET_R may disagree mechanically without a refusal (§23, §49);
 *   - R23's stored SET_R readiness is kept by reference, never re-derived (§12);
 *   - inconsistent or unminted input is refused (§10, §29-§31).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
  SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY,
} from '../harness/phase2b2d/a3prep/contracts.js';
import {
  SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
  SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
  SET_P_INITIAL_CAP_EXACT,
} from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';
import { SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED } from '../harness/phase2b2d/a3prep/sd7.js';
import {
  SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
  SET_P_DOCUMENT_CAP_EXACT,
} from '../harness/phase2b2d/a3prep/setPSd7.js';
import {
  SET_R_DOCUMENT_CAP_EXACT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
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
import { prepareUnboundSlotSampleSurvivors } from '../harness/phase2b2d/a3samples/prepare.js';
import type { UnboundA3SlotSampleSurvivorPreparation } from '../harness/phase2b2d/a3samples/types.js';
import type { R23PublicSampleSurvivorCensus } from '../harness/phase2b2d/a3samples/census.js';
import { deriveR24PublicReachableMembershipSd9Census } from '../harness/phase2b2d/a3readiness/census.js';
import {
  bindDevTrainReachableMembershipSd9Batch,
  isA3DevTrainReachableMembershipSd9Batch,
  isA3DevTrainSlotReachableMembershipReadiness,
} from '../harness/phase2b2d/a3readiness/devTrain.js';
import { deriveUnboundSlotReachableMembershipReadiness } from '../harness/phase2b2d/a3readiness/membership.js';
import { r23AggregateDriftPaths } from '../harness/phase2b2d/a3readiness/r23Drift.js';
import {
  A3ReadinessRefusal,
  type A3ReadinessRefusalCode,
} from '../harness/phase2b2d/a3readiness/refusal.js';
import {
  REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED,
  REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT,
  R24_SD9_SEMANTICS,
  type A3DevTrainReachableMembershipSd9BatchV1,
} from '../harness/phase2b2d/a3readiness/types.js';
import type { NearDuplicateGraphMeasurement } from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';

// ---------------------------------------------------------------------------
// Synthetic builders (the R23 pattern).
// ---------------------------------------------------------------------------

const SLOT = 7 as A3SelectionIndex;

const sha = (label: string): A3DocumentSha256 =>
  createHash('sha256')
    .update(`synthetic-a3-r24:${label}`, 'utf8')
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

function r23Of(
  documents: readonly A3DocumentSourceEntry[],
  short: readonly number[] = [],
  edges: readonly (readonly [number, number])[] = [],
): UnboundA3SlotSampleSurvivorPreparation {
  return prepareUnboundSlotSampleSurvivors(
    { selectionIndex: SLOT, split: 'DEV_TRAIN', documents },
    graphFor(documents, short, edges),
  );
}

function codeOf(run: () => unknown): A3ReadinessRefusalCode | 'NO_REFUSAL' {
  try {
    run();
  } catch (error) {
    if (error instanceof A3ReadinessRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}

/** 10 measurable + 1 short text; the seed search READS the canonical SET_P rank. */
function shortTextScenario(wantTail: boolean): UnboundA3SlotSampleSurvivorPreparation {
  for (let seed = 0; seed < 200; seed += 1) {
    const documents = Array.from({ length: 11 }, (_, i) =>
      entry(`s${seed}-d${i}`, String(100 - i)),
    );
    const prep = r23Of(documents, [10]);
    const position =
      prep.setP.sd7Preparation.shortTextUnresolvedInSampleOrder[0]!.sourceRankPosition;
    if (wantTail ? position >= SET_P_MAX_PAGES_PER_ORGANISATION : position < 4) return prep;
  }
  throw new Error('no deterministic seed produced the requested SET_P placement');
}

/** `measurable` isolated measurable documents plus `short` short-text documents. */
function countScenario(measurable: number, short: number): UnboundA3SlotSampleSurvivorPreparation {
  const documents = Array.from({ length: measurable + short }, (_, i) =>
    entry(`c${measurable}-${short}-d${i}`, String(50 - i)),
  );
  return r23Of(
    documents,
    Array.from({ length: short }, (_, i) => measurable + i),
  );
}

// ---------------------------------------------------------------------------

describe('2D-A3 R24 §18: the owner-bound reachable-membership policy', () => {
  it('binds the Generation-1 tokens exactly, by reference', () => {
    const readiness = deriveUnboundSlotReachableMembershipReadiness(countScenario(5, 0));
    const binding = readiness.setPReachableMembership.ownerPolicy;
    expect(binding.policy).toBe(SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY);
    expect(binding).toMatchObject({
      decisionToken:
        'SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1',
      generation: 'METHODOLOGY_V2_GEN1',
      requiredMembershipScope: 'REACHABLE_SELECTED_CAPPED_MEMBERSHIP',
      zeroExtensionHeadroomScope:
        'ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP',
      unreachableTailFreezeEffect: 'DOES_NOT_REFUSE_FREEZE_BY_ITSELF',
    });
  });
});

describe('2D-A3 R24 §16/§43: exact cap + blocked full rank', () => {
  const r23 = shortTextScenario(true);
  const readiness = deriveUnboundSlotReachableMembershipReadiness(r23);

  it('SET_P: materialises the exact cap by reference while full rank stays blocked', () => {
    expect(r23.setP.documentCap.status).toBe(SET_P_DOCUMENT_CAP_EXACT);
    if (r23.setP.documentCap.status !== SET_P_DOCUMENT_CAP_EXACT) return;
    const membership = readiness.setPReachableMembership;
    expect(membership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);
    if (membership.status !== REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT) return;
    expect(membership.documents).toBe(r23.setP.documentCap.documents);
    expect(membership.documentCount).toBe(8);
    expect(membership.canonicalCapSize).toBe(SET_P_MAX_PAGES_PER_ORGANISATION);
    expect(readiness.setPFreezeSlotReadiness.initialCapReadiness).toBe(SET_P_INITIAL_CAP_EXACT);
    expect(readiness.setPFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    );
  });

  it('SET_R: materialises the exact cap by reference while full rank stays blocked', () => {
    expect(r23.setRDocumentCap.status).toBe(SET_R_DOCUMENT_CAP_EXACT);
    if (r23.setRDocumentCap.status !== SET_R_DOCUMENT_CAP_EXACT) return;
    const membership = readiness.setRReachableMembership;
    expect(membership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT);
    if (membership.status !== REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT) return;
    expect(membership.documents).toBe(r23.setRDocumentCap.documents);
    expect(membership.documentCount).toBe(4);
    expect(membership.canonicalCapSize).toBe(SET_R_MAX_PAGES_PER_ORGANISATION);
    expect(readiness.setRFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    );
  });

  it('does not resolve the unreachable short-text tail', () => {
    for (const [sample, membership] of [
      ['setP', readiness.setPReachableMembership],
      ['setR', readiness.setRReachableMembership],
    ] as const) {
      const unresolved = r23[sample].sd7Preparation.shortTextUnresolvedInSampleOrder;
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0]!.openIssue).toBe(SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED);
      if (membership.status !== REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT) throw new Error();
      const members = new Set(membership.documents.map((d) => d.documentSha256 as string));
      expect(members.has(unresolved[0]!.documentSha256 as string)).toBe(false);
    }
  });

  it("keeps R23's stored SET_R readiness object, never a re-derived one", () => {
    expect(readiness.setRFreezeSlotReadiness).toBe(r23.setRFreezeSlotReadiness);
  });

  it('a no-short-text slot smaller than cap is still an exact, unpadded membership', () => {
    const small = deriveUnboundSlotReachableMembershipReadiness(countScenario(3, 0));
    expect(small.setPReachableMembership).toMatchObject({
      status: REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT,
      documentCount: 3,
    });
    expect(small.setRReachableMembership).toMatchObject({
      status: REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT,
      documentCount: 3,
    });
    expect(small.setPFreezeSlotReadiness.fullRankReadiness).toBe(
      SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
  });
});

describe('2D-A3 R24 §17/§44: a blocked cap is a result, not a failure', () => {
  it('SET_P: BLOCKED membership with no documents field, SD9 still evaluated', () => {
    const r23 = shortTextScenario(false);
    expect(r23.setP.documentCap.status).toBe(
      SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
    );
    const readiness = deriveUnboundSlotReachableMembershipReadiness(r23);
    const membership = readiness.setPReachableMembership;
    expect(membership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED);
    expect(Object.prototype.hasOwnProperty.call(membership, 'documents')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(membership, 'documentCount')).toBe(false);
    expect(membership).toMatchObject({ openIssue: SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED });
    expect(readiness.setPFreezeSlotReadiness.initialCapReadiness).toBe(
      SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
    );
    // 10 measurable survivors, 1 unresolved: SD9 is independent of the blocked cap.
    expect(readiness.setPSd9.canonical).toMatchObject({
      minCount: 10,
      maxCount: 11,
      status: 'ACQUISITION_SUCCESSFUL',
    });
  });

  it('SET_R: BLOCKED membership when short text ranks first, SD9 still evaluated', () => {
    const documents = [
      entry('r-short', '99'),
      ...Array.from({ length: 6 }, (_, i) => entry(`r${i}`, String(10 - i))),
    ];
    const readiness = deriveUnboundSlotReachableMembershipReadiness(r23Of(documents, [0]));
    expect(readiness.setRReachableMembership.status).toBe(REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED);
    expect(
      Object.prototype.hasOwnProperty.call(readiness.setRReachableMembership, 'documents'),
    ).toBe(false);
    expect(readiness.setRSd9.canonical).toMatchObject({
      minCount: 6,
      maxCount: 7,
      status: 'ACQUISITION_SUCCESSFUL',
    });
  });
});

describe('2D-A3 R24 §45-§48: the canonical SD9 survivor envelope', () => {
  const cases = [
    { measurable: 4, short: 0, min: 4, max: 4, status: 'ACQUISITION_SUCCESSFUL' },
    {
      measurable: 3,
      short: 0,
      min: 3,
      max: 3,
      status: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
    },
    {
      measurable: 3,
      short: 1,
      min: 3,
      max: 4,
      status: 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL',
    },
    { measurable: 4, short: 1, min: 4, max: 5, status: 'ACQUISITION_SUCCESSFUL' },
  ] as const;

  for (const c of cases) {
    it(`survivors ${c.measurable}, short text ${c.short} -> [${c.min},${c.max}] ${c.status}`, () => {
      const readiness = deriveUnboundSlotReachableMembershipReadiness(
        countScenario(c.measurable, c.short),
      );
      for (const sd9 of [readiness.setPSd9, readiness.setRSd9]) {
        expect(sd9.semantics).toBe(R24_SD9_SEMANTICS);
        expect(sd9.canonical).toMatchObject({
          treatmentSpace: 'SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1',
          bounds: 'ADMISSIBLE_ENVELOPE_ENDPOINTS_NOT_REAL_COUNTS',
          minCount: c.min,
          maxCount: c.max,
          status: c.status,
        });
      }
    });
  }

  it('the envelope never reads a cap size: 20 survivors give [20,20], not [8,8] or [4,4]', () => {
    const readiness = deriveUnboundSlotReachableMembershipReadiness(countScenario(20, 0));
    expect(readiness.setPReachableMembership).toMatchObject({ documentCount: 8 });
    expect(readiness.setRReachableMembership).toMatchObject({ documentCount: 4 });
    expect(readiness.setPSd9.canonical).toMatchObject({ minCount: 20, maxCount: 20 });
    expect(readiness.setRSd9.canonical).toMatchObject({ minCount: 20, maxCount: 20 });
  });
});

describe('2D-A3 R24 §23/§49: SET_P and SET_R SD9 are independent', () => {
  /**
   * Path a - b - c plus two isolated documents. If b comes first among the
   * three, only b survives of them (3 survivors); otherwise a and c survive
   * (4). SET_R puts b first by score; the seed search READS the canonical
   * SET_P rank until SET_P does not.
   */
  it('one slot may be SET_P successful and SET_R unsuccessful without refusal', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const documents = [
        entry(`p${seed}-a`, '5'),
        entry(`p${seed}-b`, '9'),
        entry(`p${seed}-c`, '4'),
        entry(`p${seed}-d`, '3'),
        entry(`p${seed}-e`, '2'),
      ];
      const r23 = r23Of(
        documents,
        [],
        [
          [0, 1],
          [1, 2],
        ],
      );
      if (r23.setP.sd7Preparation.counts.measurableSurvivorCount !== 4) continue;
      expect(r23.setR.sd7Preparation.counts.measurableSurvivorCount).toBe(3);
      const readiness = deriveUnboundSlotReachableMembershipReadiness(r23);
      expect(readiness.setPSd9.canonical.status).toBe('ACQUISITION_SUCCESSFUL');
      expect(readiness.setRSd9.canonical.status).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
      return;
    }
    throw new Error('no deterministic seed produced the requested SET_P order');
  });
});

describe('2D-A3 R24 §29-§31: inconsistent R23-shaped input is refused, never repaired', () => {
  const r23 = countScenario(6, 0);

  it('refuses a split other than DEV_TRAIN', () => {
    expect(
      codeOf(() => deriveUnboundSlotReachableMembershipReadiness({ ...r23, split: 'DEV_CONFIRM' })),
    ).toBe('R24_SPLIT_NOT_SUPPORTED');
  });

  it('refuses a malformed preparation', () => {
    expect(codeOf(() => deriveUnboundSlotReachableMembershipReadiness({} as never))).toBe(
      'R24_SLOT_PREPARATION_SHAPE_INVALID',
    );
  });

  it('refuses a SET_R readiness that contradicts its cap', () => {
    const tampered = {
      ...r23,
      setRFreezeSlotReadiness: {
        ...r23.setRFreezeSlotReadiness,
        measurableSurvivorCount: r23.setRFreezeSlotReadiness.measurableSurvivorCount + 1,
        exactMeasurableSurvivorPrefixCount:
          r23.setRFreezeSlotReadiness.exactMeasurableSurvivorPrefixCount + 1,
      },
    };
    expect(codeOf(() => deriveUnboundSlotReachableMembershipReadiness(tampered))).toBe(
      'R24_SET_R_READINESS_INCONSISTENT',
    );
  });

  it('refuses a cap status that contradicts the stored SET_R readiness', () => {
    const tampered = {
      ...r23,
      setRDocumentCap: {
        ...r23.setRDocumentCap,
        status: 'SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP',
      },
    } as never;
    expect(codeOf(() => deriveUnboundSlotReachableMembershipReadiness(tampered))).toBe(
      'R24_SET_R_READINESS_INCONSISTENT',
    );
  });

  it('refuses an exact cap that is not the canonical survivor prefix', () => {
    if (r23.setRDocumentCap.status !== SET_R_DOCUMENT_CAP_EXACT) throw new Error();
    const tampered = {
      ...r23,
      setRDocumentCap: {
        ...r23.setRDocumentCap,
        documents: [...r23.setRDocumentCap.documents].reverse(),
      },
    };
    expect(codeOf(() => deriveUnboundSlotReachableMembershipReadiness(tampered))).toBe(
      'R24_REACHABLE_MEMBERSHIP_INCONSISTENT',
    );
  });

  it('refuses a SET_P preparation from another slot, via canonical SET_P readiness', () => {
    expect(
      codeOf(() => deriveUnboundSlotReachableMembershipReadiness({ ...r23, selectionIndex: 99 })),
    ).toBe('R24_CANONICAL_SET_P_READINESS_STOPPED');
  });

  it('freezes its result and mutates no input', () => {
    const before = JSON.stringify(r23);
    const readiness = deriveUnboundSlotReachableMembershipReadiness(r23);
    expect(JSON.stringify(r23)).toBe(before);
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.setPReachableMembership)).toBe(true);
  });
});

describe('2D-A3 R24 §9/§10/§42: nothing unbound, cloned or literal is minted', () => {
  it('the unbound readiness is not a minted one', () => {
    const readiness = deriveUnboundSlotReachableMembershipReadiness(countScenario(4, 0));
    expect(isA3DevTrainSlotReachableMembershipReadiness(readiness)).toBe(false);
    expect(isA3DevTrainSlotReachableMembershipReadiness({ ...readiness })).toBe(false);
  });

  it('the binder refuses anything that is not an R23 mint', () => {
    const prep = countScenario(4, 0);
    const literal = {
      kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_BATCH_V1',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      split: 'DEV_TRAIN',
      governanceSnapshot: {},
      items: [{ ...prep, kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_V1' }],
    };
    const graphBatchLike = {
      kind: 'A3_DEV_TRAIN_SD7_GRAPH_BATCH_V1',
      split: 'DEV_TRAIN',
      items: [],
    };
    for (const candidate of [
      literal,
      { ...literal },
      JSON.parse(JSON.stringify(literal)) as unknown,
      graphBatchLike,
      prep,
      null,
      undefined,
      [],
    ]) {
      expect(codeOf(() => bindDevTrainReachableMembershipSd9Batch(candidate))).toBe(
        'R24_SAMPLE_PREPARATION_AUTHORITY_NOT_MINTED_BY_R23',
      );
    }
  });

  it('the census refuses an unminted batch', () => {
    const fake = {
      kind: 'A3_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_BATCH_V1',
      items: [],
    } as unknown as A3DevTrainReachableMembershipSd9BatchV1;
    expect(isA3DevTrainReachableMembershipSd9Batch(fake)).toBe(false);
    expect(
      codeOf(() =>
        deriveR24PublicReachableMembershipSd9Census(fake, {
          r23Tip: 'x',
          implementationCommit: 'y',
        }),
      ),
    ).toBe('R24_BATCH_COMPOSITION_INVALID');
  });
});

describe('2D-A3 R24 §63: the R23 drift cross-check compares aggregates only', () => {
  const fresh = {
    r22Tip: 'a',
    implementationCommit: 'b',
    preparation: { slotPreparationCount: 5 },
    setP: { measurableSurvivorCount: 142 },
    setR: { fullRankShortTextBlockedSlotCount: 1 },
    sampleSpecificDivergence: { survivingBothSamples: 137 },
    canonicalConstants: { setPMaxPagesPerOrganisation: 8 },
    semantics: { sd9Evaluated: false },
    access: { r23SqlStatements: 0 },
  } as unknown as R23PublicSampleSurvivorCensus;

  it('ignores provenance commits and reports differing aggregate paths', () => {
    expect(
      r23AggregateDriftPaths(fresh, { ...fresh, r22Tip: 'z', implementationCommit: 'z' }),
    ).toEqual([]);
    expect(
      r23AggregateDriftPaths(fresh, { ...fresh, setR: { fullRankShortTextBlockedSlotCount: 2 } }),
    ).toEqual(['setR.fullRankShortTextBlockedSlotCount']);
    expect(r23AggregateDriftPaths(fresh, null).length).toBeGreaterThan(0);
  });
});

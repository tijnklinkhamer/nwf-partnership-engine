/**
 * PHASE 2B-2D — A3 R29: THE SAMPLE COVERAGE EXPANSION AND THE PUBLIC, DERIVED CENSUS.
 *
 * THE COVERAGE EXPANSION IS COUNTS, NOT A SIX-SLOT BATCH
 *
 *   Historical R23 coverage enters as the committed aggregate baseline (see
 *   `r28Drift.ts`); delta coverage is derived from the MINTED R29 batch. The
 *   sum is an aggregate statement only - nothing is minted for it, and no
 *   historical preparation is re-prepared, wrapped or copied.
 *
 * DIVERGENCE COMES ONLY FROM R23
 *
 *   Each delta slot's SET_P / SET_R divergence is R23's own
 *   `sampleSurvivorDivergence` over the exact R28 graph that preparation
 *   consumed, reached through R29 -> R28 provenance. Nothing here compares
 *   survivor sets itself.
 *
 * THE CENSUS IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Counts, stated canonical constants, commits and
 *   booleans. No selection index, organisation, run, document digest, rank
 *   digest, rank / survivor / exclusion / blocking position, edge endpoint,
 *   score, URL, host, text, label or per-slot identity. And no
 *   `sampleDeltaHash`, `survivorCoverageHash`, `rankExpansionHash` or
 *   `capExpansionHash`: authority is in-process R28 -> R29 provenance.
 *
 * The canonical cap and readiness tokens below are STATED, not imported:
 * this namespace imports nothing from `a3prep/`. The unit suite asserts they
 * equal the canonical constants.
 */
import { sampleSurvivorDivergence } from '../a3samples/prepare.js';
import {
  deltaGraphForSamplePreparation,
  isA3DevTrainSampleSurvivorDeltaBatchV2,
} from './devTrain.js';
import { refuseV2Sample } from './refusal.js';
import {
  R29_SAMPLE_SPLIT,
  type A3DevTrainCanonicalSampleSurvivorCoverageExpansionV2,
  type A3DevTrainSampleSurvivorDeltaBatchV2,
  type DivergenceAggregateCounts,
  type R23HistoricalSampleBaseline,
  type R29DeltaSampleAggregates,
  type SampleAggregateCounts,
  type SetRAggregateCounts,
} from './types.js';

export const R29_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R29_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1';

/** The canonical constants and tokens R23 prepared under, stated for the record. */
export const R29_STATED_CANONICAL_SAMPLE_CONSTANTS = Object.freeze({
  setPMaxPagesPerOrganisation: 8,
  setRMaxPagesPerOrganisation: 4,
  k3SurvivorProcedure: 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK',
  k3SurvivorScope: 'SAMPLE_SPECIFIC',
  k3GraphScope: 'ONE_CANONICAL_GRAPH_PER_ORGANISATION',
  setPDocumentCapExact: 'SET_P_DOCUMENT_CAP_EXACT',
  setRDocumentCapExact: 'SET_R_DOCUMENT_CAP_EXACT',
  setRInitialCapExact: 'SET_R_INITIAL_CAP_EXACT',
  setRFullSampleRankMembershipExact: 'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
} as const);

const C = R29_STATED_CANONICAL_SAMPLE_CONSTANTS;

function requireMintedSampleBatch(batch: unknown): A3DevTrainSampleSurvivorDeltaBatchV2 {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV2(batch)) {
    refuseV2Sample(
      'R29_NOT_A_MINTED_DELTA_SAMPLE_BATCH',
      'the input was not a DEV_TRAIN sample survivor delta batch minted by R29',
    );
  }
  return batch;
}

function zeroSample(): {
  -readonly [K in keyof SampleAggregateCounts]: number;
} {
  return {
    preSd7RankEntryCount: 0,
    measurableDocumentCount: 0,
    measurableSurvivorCount: 0,
    measurableExclusionCount: 0,
    unresolvedShortTextOccurrenceCount: 0,
    initialCapExactSlotCount: 0,
    initialCapBlockedSlotCount: 0,
    exactCapDocumentCountAcrossExactSlots: 0,
  };
}

/** Delta aggregates, derived per slot from the minted preparations. Identities never leave memory. */
export function deriveDeltaSampleAggregates(
  sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV2,
): R29DeltaSampleAggregates {
  const batch = requireMintedSampleBatch(sampleDeltaBatch);
  const p = zeroSample();
  const r = { ...zeroSample(), fullRankExactSlotCount: 0, fullRankShortTextBlockedSlotCount: 0 };
  const divergence = {
    measurableDocumentCount: 0,
    survivingBothSamples: 0,
    survivingSetPOnly: 0,
    survivingSetROnly: 0,
    excludedInBothSamples: 0,
  };
  let singleEdgeSlotsSameExcludedEndpoint = 0;
  let singleEdgeSlotsOppositeExcludedEndpoints = 0;

  for (const item of batch.items) {
    const deltaGraph = deltaGraphForSamplePreparation(item);
    if (deltaGraph === undefined) {
      refuseV2Sample(
        'R29_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta preparation does not trace to an R28 graph',
      );
    }

    const setP = item.setP;
    p.preSd7RankEntryCount += setP.preSd7FullRank.length;
    p.measurableDocumentCount += setP.sd7Preparation.counts.measurableDocumentCount;
    p.measurableSurvivorCount += setP.sd7Preparation.counts.measurableSurvivorCount;
    p.measurableExclusionCount += setP.sd7Preparation.counts.measurableExclusionCount;
    p.unresolvedShortTextOccurrenceCount += setP.sd7Preparation.counts.shortTextUnresolvedCount;
    if (setP.documentCap.status === C.setPDocumentCapExact) {
      p.initialCapExactSlotCount += 1;
      p.exactCapDocumentCountAcrossExactSlots += setP.documentCap.documents.length;
    } else {
      p.initialCapBlockedSlotCount += 1;
    }

    const setR = item.setR;
    r.preSd7RankEntryCount += setR.preSd7FullRank.length;
    r.measurableDocumentCount += setR.sd7Preparation.counts.measurableDocumentCount;
    r.measurableSurvivorCount += setR.sd7Preparation.counts.measurableSurvivorCount;
    r.measurableExclusionCount += setR.sd7Preparation.counts.measurableExclusionCount;
    r.unresolvedShortTextOccurrenceCount += setR.sd7Preparation.counts.shortTextUnresolvedCount;
    if (item.setRDocumentCap.status === C.setRDocumentCapExact) {
      r.initialCapExactSlotCount += 1;
      r.exactCapDocumentCountAcrossExactSlots += item.setRDocumentCap.documents.length;
    } else {
      r.initialCapBlockedSlotCount += 1;
    }
    if (item.setRFreezeSlotReadiness.fullRankReadiness === C.setRFullSampleRankMembershipExact) {
      r.fullRankExactSlotCount += 1;
    } else {
      r.fullRankShortTextBlockedSlotCount += 1;
    }

    // §29: R23's own comparison, over the exact graph this preparation consumed.
    const graph = deltaGraph.graph;
    const slotDivergence = sampleSurvivorDivergence(item, graph);
    divergence.measurableDocumentCount += slotDivergence.measurableDocumentCount;
    divergence.survivingBothSamples += slotDivergence.survivingBothSamples;
    divergence.survivingSetPOnly += slotDivergence.survivingSetPOnly;
    divergence.survivingSetROnly += slotDivergence.survivingSetROnly;
    divergence.excludedInBothSamples += slotDivergence.excludedInBothSamples;
    if (graph.edges.length === 1 && graph.shortTextUnresolvedCount === 0) {
      // The binder already proved this is one of exactly two shapes.
      if (slotDivergence.excludedInBothSamples === 1) singleEdgeSlotsSameExcludedEndpoint += 1;
      else singleEdgeSlotsOppositeExcludedEndpoints += 1;
    }
  }

  return Object.freeze({
    slotPreparations: batch.items.length,
    setP: Object.freeze(p),
    setR: Object.freeze(r),
    divergence: Object.freeze(divergence),
    singleEdgeSlotsSameExcludedEndpoint,
    singleEdgeSlotsOppositeExcludedEndpoints,
  });
}

function sumSample(a: SampleAggregateCounts, b: SampleAggregateCounts): SampleAggregateCounts {
  return Object.freeze({
    preSd7RankEntryCount: a.preSd7RankEntryCount + b.preSd7RankEntryCount,
    measurableDocumentCount: a.measurableDocumentCount + b.measurableDocumentCount,
    measurableSurvivorCount: a.measurableSurvivorCount + b.measurableSurvivorCount,
    measurableExclusionCount: a.measurableExclusionCount + b.measurableExclusionCount,
    unresolvedShortTextOccurrenceCount:
      a.unresolvedShortTextOccurrenceCount + b.unresolvedShortTextOccurrenceCount,
    initialCapExactSlotCount: a.initialCapExactSlotCount + b.initialCapExactSlotCount,
    initialCapBlockedSlotCount: a.initialCapBlockedSlotCount + b.initialCapBlockedSlotCount,
    exactCapDocumentCountAcrossExactSlots:
      a.exactCapDocumentCountAcrossExactSlots + b.exactCapDocumentCountAcrossExactSlots,
  });
}

function sumSetR(a: SetRAggregateCounts, b: SetRAggregateCounts): SetRAggregateCounts {
  return Object.freeze({
    ...sumSample(a, b),
    fullRankExactSlotCount: a.fullRankExactSlotCount + b.fullRankExactSlotCount,
    fullRankShortTextBlockedSlotCount:
      a.fullRankShortTextBlockedSlotCount + b.fullRankShortTextBlockedSlotCount,
  });
}

function sumDivergence(
  a: DivergenceAggregateCounts,
  b: DivergenceAggregateCounts,
): DivergenceAggregateCounts {
  return Object.freeze({
    measurableDocumentCount: a.measurableDocumentCount + b.measurableDocumentCount,
    survivingBothSamples: a.survivingBothSamples + b.survivingBothSamples,
    survivingSetPOnly: a.survivingSetPOnly + b.survivingSetPOnly,
    survivingSetROnly: a.survivingSetROnly + b.survivingSetROnly,
    excludedInBothSamples: a.excludedInBothSamples + b.excludedInBothSamples,
  });
}

/**
 * §46. Historical R23 baseline + minted delta = coverage. The historical slot
 * count must be exactly R26's unchanged canonical coverage, and the combined
 * count exactly the V2 DEV_TRAIN coverage.
 */
export function deriveCanonicalSampleSurvivorCoverageExpansionV2(
  sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV2,
  historical: R23HistoricalSampleBaseline,
): A3DevTrainCanonicalSampleSurvivorCoverageExpansionV2 {
  const batch = requireMintedSampleBatch(sampleDeltaBatch);
  const delta = deriveDeltaSampleAggregates(batch);
  const evidenceCoverage =
    batch.graphDeltaBatch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;
  if (
    historical.slotPreparations !== evidenceCoverage.unchangedCanonicalCoverageCount ||
    delta.slotPreparations !== evidenceCoverage.newlyBoundDeltaCount ||
    historical.slotPreparations + delta.slotPreparations !== evidenceCoverage.v2ReadyAuthorityCount
  ) {
    refuseV2Sample(
      'R29_GRAPH_DELTA_COVERAGE_NOT_ADDITIVE',
      'historical R23 preparations plus delta preparations do not equal the V2 DEV_TRAIN coverage',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_SAMPLE_SURVIVOR_COVERAGE_EXPANSION_V2' as const,
    historicalSlotPreparations: historical.slotPreparations,
    deltaSlotPreparations: delta.slotPreparations,
    coverageSlotPreparations: historical.slotPreparations + delta.slotPreparations,
    historical: Object.freeze({
      setP: historical.setP,
      setR: historical.setR,
      divergence: historical.divergence,
    }),
    delta: Object.freeze({ setP: delta.setP, setR: delta.setR, divergence: delta.divergence }),
    coverage: Object.freeze({
      setP: sumSample(historical.setP, delta.setP),
      setR: sumSetR(historical.setR, delta.setR),
      divergence: sumDivergence(historical.divergence, delta.divergence),
    }),
  });
}

export interface R29CensusProvenance {
  /** The exact R28 tip R29 was cut from. */
  readonly r28Tip: string;
  /** The R29 implementation commit the real delta preparation executed at. */
  readonly implementationCommit: string;
}

/** Derives the public census from a MINTED sample delta batch; anything else refuses. */
export function deriveR29PublicIncrementalSampleSurvivorCensus(
  sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV2,
  historical: R23HistoricalSampleBaseline,
  provenance: R29CensusProvenance,
) {
  const batch = requireMintedSampleBatch(sampleDeltaBatch);
  const delta = deriveDeltaSampleAggregates(batch);
  const expansion = deriveCanonicalSampleSurvivorCoverageExpansionV2(batch, historical);
  const access = batch.graphDeltaBatch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;

  return Object.freeze({
    record: R29_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS' as const,
    generationId: batch.governanceSnapshotV2.resolution.summary.generationId,
    split: R29_SAMPLE_SPLIT,
    r28Tip: provenance.r28Tip,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    delta: Object.freeze({
      deltaSlotPreparations: delta.slotPreparations,
      setP: delta.setP,
      setR: delta.setR,
      divergence: delta.divergence,
      singleEdgeSlotsSameExcludedEndpoint: delta.singleEdgeSlotsSameExcludedEndpoint,
      singleEdgeSlotsOppositeExcludedEndpoints: delta.singleEdgeSlotsOppositeExcludedEndpoints,
    }),
    canonicalConstants: C,
    coverage: Object.freeze({
      historicalCanonicalR23SlotPreparations: expansion.historicalSlotPreparations,
      newR29SlotPreparations: expansion.deltaSlotPreparations,
      coverageSlotPreparations: expansion.coverageSlotPreparations,
      historical: expansion.historical,
      coverage: expansion.coverage,
      coverageIsSumOfPerSlotCounts: true as const,
      sixSlotBatchMinted: false as const,
    }),
    semantics: Object.freeze({
      historicalR23PreparationsRecomputed: false as const,
      historicalR23ObjectsReminted: false as const,
      deltaOnlySamplePreparation: true as const,
      canonicalR23PurePreparationUsed: true as const,
      canonicalR23CallsPerDeltaSlot: 1 as const,
      canonicalR23DivergenceHelperUsed: true as const,
      sameCanonicalR28GraphUsedForBothSamples: true as const,
      sampleSpecificOrdersPreserved: true as const,
      rankReimplemented: false as const,
      survivorWalkReimplemented: false as const,
      capAlgorithmReimplemented: false as const,
      scoresCopied: false as const,
      edgesCopied: false as const,
      shortTextResolved: false as const,
      r24ReachableMembershipBound: false as const,
      extensionPerformed: false as const,
      sd9Evaluated: false as const,
      sd4Applied: false as const,
      k4Applied: false as const,
      labelsRead: false as const,
      classifierCalled: false as const,
      finalDevTrainCorpusMaterialised: false as const,
    }),
    access: Object.freeze({
      r29SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalR26: true as const,
      legacyAuthorityEvidenceQueries: access.legacyAuthorityEvidenceRequests,
      deltaAuthorityEvidenceQueries: access.deltaAuthorityEvidenceRequests,
      oldFiveDocumentReassembly: 0 as const,
      oldFiveGraphRemeasurement: 0 as const,
      oldFiveSamplePreparation: 0 as const,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      devConfirmEvidenceReads: 0 as const,
      finalHoldoutEvidenceReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_SIX_SLOT_SAMPLE_BATCH',
      'NOT_A_REPREPARATION_OF_R23_CANONICAL_HISTORY',
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_DATABASE_EVIDENCE_AUTHORITY',
      'NOT_R24_REACHABLE_MEMBERSHIP',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_AN_EXTENSION',
      'NOT_SD4_OR_K4',
      'NOT_SD9',
      'NOT_A_FINAL_SET_P',
      'NOT_A_FINAL_SET_R',
      'NOT_A_LABEL_OR_CLASSIFICATION',
      'NOT_R30_AUTHORITY',
      'NOT_AN_A5_CORPUS_FREEZE',
    ]),
    identityDisclosure: Object.freeze({
      selectionIndices: false as const,
      organisationIds: false as const,
      echeRowKeys: false as const,
      runIdentifiers: false as const,
      runReferenceDigests: false as const,
      documentDigests: false as const,
      saltedRankDigests: false as const,
      rankPositions: false as const,
      survivorPositions: false as const,
      exclusionPositions: false as const,
      blockingSurvivorPositions: false as const,
      edgeEndpoints: false as const,
      excludedDocumentIdentities: false as const,
      scoresOrScoreDistributions: false as const,
      urlsOrHosts: false as const,
      titlesHeadingsOrText: false as const,
      labels: false as const,
      perSlotIdentities: false as const,
    }),
  });
}

export type R29PublicIncrementalSampleSurvivorCensus = ReturnType<
  typeof deriveR29PublicIncrementalSampleSurvivorCensus
>;

/**
 * PHASE 2B-2D — A3 R36: THE SAMPLE COVERAGE EXPANSION AND THE PUBLIC, DERIVED CENSUS.
 *
 * THE COVERAGE EXPANSION IS COUNTS, NOT A THIRTEEN-SLOT BATCH
 *
 *   Historical R23 + R29 coverage enters as the committed aggregate baseline
 *   (see `r35Drift.ts`); delta coverage is derived from the MINTED R36 batch.
 *   The sum is an aggregate statement only - nothing is minted for it, and no
 *   historical preparation is re-prepared, wrapped or copied.
 *
 * DIVERGENCE COMES ONLY FROM R23
 *
 *   Each delta slot's SET_P / SET_R divergence is R23's own
 *   `sampleSurvivorDivergence` over the exact R35 graph that preparation
 *   consumed, reached through R36 -> R35 provenance. Nothing here compares
 *   survivor sets itself.
 *
 * THE CENSUS IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Counts, stated canonical constants, commits and
 *   booleans. No selection index, organisation, run, document digest, rank
 *   digest, rank / survivor / exclusion / blocking position, edge endpoint,
 *   score, URL, host, text, label, per-slot count or per-slot cap status. And
 *   no `sampleDeltaHash`, `survivorCoverageHash`, `rankExpansionHash` or
 *   `capExpansionHash`: authority is in-process R35 -> R36 provenance.
 *
 * The canonical cap and readiness tokens are STATED in `types.ts`, not
 * imported: this namespace imports nothing from `a3prep/` or `sd7/`. The unit
 * suite asserts they equal the canonical constants.
 */
import { sampleSurvivorDivergence } from '../a3samples/prepare.js';
import {
  deltaGraphForSamplePreparationV4,
  isA3DevTrainSampleSurvivorDeltaBatchV4,
} from './devTrain.js';
import {
  r35ReproductionProofForBatch,
  requireHistoricalSamplePreparationBaselineProof,
} from './r35Drift.js';
import { refuseV4Sample } from './refusal.js';
import {
  R36_SAMPLE_SPLIT,
  R36_STATED_CANONICAL_SAMPLE_CONSTANTS as C,
  type A3DevTrainCanonicalSampleSurvivorCoverageExpansionV4,
  type A3DevTrainSampleSurvivorDeltaBatchV4,
  type DivergenceAggregateCountsV4,
  type HistoricalSamplePreparationBaselineV4,
  type R36DeltaSampleAggregates,
  type SampleAggregateCountsV4,
  type SetRAggregateCountsV4,
} from './types.js';

export const R36_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R36_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1';

function requireMintedSampleBatch(batch: unknown): A3DevTrainSampleSurvivorDeltaBatchV4 {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV4(batch)) {
    refuseV4Sample(
      'R36_NOT_A_MINTED_DELTA_SAMPLE_BATCH',
      'the input was not a DEV_TRAIN sample survivor delta batch minted by R36',
    );
  }
  return batch;
}

function zeroSample(): {
  -readonly [K in keyof SampleAggregateCountsV4]: number;
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
export function deriveDeltaSampleAggregatesV4(
  sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV4,
): R36DeltaSampleAggregates {
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
  let singleEdgeNoShortTextSlots = 0;
  let singleEdgeSlotsSameExcludedEndpoint = 0;
  let singleEdgeSlotsOppositeExcludedEndpoints = 0;

  for (const item of batch.items) {
    const deltaGraph = deltaGraphForSamplePreparationV4(item);
    if (deltaGraph === undefined) {
      refuseV4Sample(
        'R36_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta preparation does not trace to an R35 graph',
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

    // §19: R23's own comparison, over the exact graph this preparation consumed.
    const graph = deltaGraph.graph;
    const slotDivergence = sampleSurvivorDivergence(item, graph);
    divergence.measurableDocumentCount += slotDivergence.measurableDocumentCount;
    divergence.survivingBothSamples += slotDivergence.survivingBothSamples;
    divergence.survivingSetPOnly += slotDivergence.survivingSetPOnly;
    divergence.survivingSetROnly += slotDivergence.survivingSetROnly;
    divergence.excludedInBothSamples += slotDivergence.excludedInBothSamples;
    // §20: ONLY a single-edge, short-text-free slot; the binder already
    // proved it is one of exactly two shapes.
    if (graph.edges.length === 1 && graph.shortTextUnresolvedCount === 0) {
      singleEdgeNoShortTextSlots += 1;
      if (slotDivergence.excludedInBothSamples === 1) singleEdgeSlotsSameExcludedEndpoint += 1;
      else singleEdgeSlotsOppositeExcludedEndpoints += 1;
    }
  }

  // §22: every partition closes over the delta, whatever the split.
  const slots = batch.items.length;
  if (
    p.measurableSurvivorCount + p.measurableExclusionCount !== p.measurableDocumentCount ||
    r.measurableSurvivorCount + r.measurableExclusionCount !== r.measurableDocumentCount ||
    p.measurableDocumentCount + p.unresolvedShortTextOccurrenceCount !== p.preSd7RankEntryCount ||
    r.measurableDocumentCount + r.unresolvedShortTextOccurrenceCount !== r.preSd7RankEntryCount ||
    p.initialCapExactSlotCount + p.initialCapBlockedSlotCount !== slots ||
    r.initialCapExactSlotCount + r.initialCapBlockedSlotCount !== slots ||
    r.fullRankExactSlotCount + r.fullRankShortTextBlockedSlotCount !== slots ||
    divergence.measurableDocumentCount !== p.measurableDocumentCount ||
    divergence.survivingBothSamples +
      divergence.survivingSetPOnly +
      divergence.survivingSetROnly +
      divergence.excludedInBothSamples !==
      divergence.measurableDocumentCount
  ) {
    refuseV4Sample(
      'R36_DELTA_BATCH_COMPOSITION_INVALID',
      'the delta sample aggregates do not partition the delta population',
    );
  }

  return Object.freeze({
    slotPreparations: slots,
    setP: Object.freeze(p),
    setR: Object.freeze(r),
    divergence: Object.freeze(divergence),
    singleEdgeNoShortTextSlots,
    singleEdgeSlotsSameExcludedEndpoint,
    singleEdgeSlotsOppositeExcludedEndpoints,
  });
}

function sumSample(
  a: SampleAggregateCountsV4,
  b: SampleAggregateCountsV4,
): SampleAggregateCountsV4 {
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

function sumSetR(a: SetRAggregateCountsV4, b: SetRAggregateCountsV4): SetRAggregateCountsV4 {
  return Object.freeze({
    ...sumSample(a, b),
    fullRankExactSlotCount: a.fullRankExactSlotCount + b.fullRankExactSlotCount,
    fullRankShortTextBlockedSlotCount:
      a.fullRankShortTextBlockedSlotCount + b.fullRankShortTextBlockedSlotCount,
  });
}

function sumDivergence(
  a: DivergenceAggregateCountsV4,
  b: DivergenceAggregateCountsV4,
): DivergenceAggregateCountsV4 {
  return Object.freeze({
    measurableDocumentCount: a.measurableDocumentCount + b.measurableDocumentCount,
    survivingBothSamples: a.survivingBothSamples + b.survivingBothSamples,
    survivingSetPOnly: a.survivingSetPOnly + b.survivingSetPOnly,
    survivingSetROnly: a.survivingSetROnly + b.survivingSetROnly,
    excludedInBothSamples: a.excludedInBothSamples + b.excludedInBothSamples,
  });
}

/**
 * §22 / §39. Historical R23 + R29 baseline + minted delta = coverage. The
 * historical slot count must be exactly R33's historical canonical coverage
 * and R35's proved historical graph slots; the historical ranked / measurable
 * / short populations exactly R35's proved historical graph documents; the
 * delta ranked / measurable / short populations exactly R35's proved delta;
 * and the combined slot count exactly the V4 DEV_TRAIN coverage.
 */
export function deriveCanonicalSampleSurvivorCoverageExpansionV4(
  sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV4,
  historicalBaseline: HistoricalSamplePreparationBaselineV4,
): A3DevTrainCanonicalSampleSurvivorCoverageExpansionV4 {
  const batch = requireMintedSampleBatch(sampleDeltaBatch);
  const historical = requireHistoricalSamplePreparationBaselineProof(historicalBaseline);
  const proof = r35ReproductionProofForBatch(batch.graphDeltaBatch);
  if (proof === undefined) {
    refuseV4Sample(
      'R36_R35_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the R35 batch behind this R36 batch was not proved to reproduce the committed census',
    );
  }
  const delta = deriveDeltaSampleAggregatesV4(batch);
  const evidenceCoverage =
    batch.graphDeltaBatch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;
  const samplesAgreeWithProof = [delta.setP, delta.setR].every(
    (sample) =>
      sample.preSd7RankEntryCount === proof.deltaDocuments &&
      sample.measurableDocumentCount === proof.deltaMeasurableDocuments &&
      sample.unresolvedShortTextOccurrenceCount === proof.deltaShortTextUnresolved,
  );
  const historyAgreesWithProof = [historical.setP, historical.setR].every(
    (sample) =>
      sample.preSd7RankEntryCount === proof.historicalDocuments &&
      sample.measurableDocumentCount === proof.historicalMeasurableDocuments &&
      sample.unresolvedShortTextOccurrenceCount === proof.historicalShortTextUnresolved,
  );
  if (
    historical.slotPreparations !== evidenceCoverage.historicalCanonicalCoverageCount ||
    historical.slotPreparations !== proof.historicalGraphSlots ||
    delta.slotPreparations !== evidenceCoverage.newlyBoundDeltaCount ||
    delta.slotPreparations !== proof.deltaGraphSlots ||
    !samplesAgreeWithProof ||
    !historyAgreesWithProof ||
    historical.slotPreparations + delta.slotPreparations !== evidenceCoverage.v4DevTrainReadyCount
  ) {
    refuseV4Sample(
      'R36_GRAPH_DELTA_COVERAGE_NOT_ADDITIVE',
      'historical R23 + R29 preparations plus delta preparations do not equal the V4 DEV_TRAIN coverage',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_SAMPLE_SURVIVOR_COVERAGE_EXPANSION_V4' as const,
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

export interface R36CensusProvenance {
  /** The exact R35 tip R36 was cut from. */
  readonly r35Tip: string;
  /** The one commit that pinned R35's isolation test to its own range. */
  readonly r35ScopePinCommit: string;
  /** The R36 commit the real reproduction and delta preparation executed at. */
  readonly implementationCommit: string;
}

/** Derives the public census from a MINTED sample delta batch; anything else refuses. */
export function deriveR36PublicIncrementalSampleSurvivorCensus(
  sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV4,
  historicalBaseline: HistoricalSamplePreparationBaselineV4,
  provenance: R36CensusProvenance,
) {
  const batch = requireMintedSampleBatch(sampleDeltaBatch);
  const historical = requireHistoricalSamplePreparationBaselineProof(historicalBaseline);
  const delta = deriveDeltaSampleAggregatesV4(batch);
  const expansion = deriveCanonicalSampleSurvivorCoverageExpansionV4(batch, historical);
  const reproduction = r35ReproductionProofForBatch(batch.graphDeltaBatch);
  if (reproduction === undefined) {
    refuseV4Sample(
      'R36_R35_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the R35 batch behind this R36 batch was not proved to reproduce the committed census',
    );
  }

  return Object.freeze({
    record: R36_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS' as const,
    generationId: batch.governanceSnapshotV4.resolution.summary.generationId,
    split: R36_SAMPLE_SPLIT,
    r35Tip: provenance.r35Tip,
    r35ScopePinCommit: provenance.r35ScopePinCommit,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    r35Reproduction: Object.freeze({
      freshInProcessR33R34R35MintConsumed: true as const,
      freshR35CensusEqualsCommitted: reproduction.differingPaths.length === 0,
      comparedTopLevelFieldCount: reproduction.comparedTopLevelFieldCount,
      excludedExecutionProvenanceFields: reproduction.excludedFields,
      reproductionProofBoundToExactR35BatchByIdentity: true as const,
      reproducedDeltaGraphSlots: reproduction.deltaGraphSlots,
      reproducedDeltaDocuments: reproduction.deltaDocuments,
      reproducedDeltaMeasurableDocuments: reproduction.deltaMeasurableDocuments,
      reproducedDeltaShortTextUnresolved: reproduction.deltaShortTextUnresolved,
    }),
    delta: Object.freeze({
      deltaSlotPreparations: delta.slotPreparations,
      setP: delta.setP,
      setR: delta.setR,
      divergence: delta.divergence,
      singleEdgeNoShortTextSlots: delta.singleEdgeNoShortTextSlots,
      singleEdgeSlotsSameExcludedEndpoint: delta.singleEdgeSlotsSameExcludedEndpoint,
      singleEdgeSlotsOppositeExcludedEndpoints: delta.singleEdgeSlotsOppositeExcludedEndpoints,
      singleEdgeDiagnosticRestrictedToSingleEdgeShortTextFreeSlots: true as const,
    }),
    canonicalConstants: C,
    historicalPreparationCoverage: Object.freeze({
      r23HistoricalSlotPreparations: historical.r23SlotPreparations,
      r29NewSlotPreparations: historical.r29NewSlotPreparations,
      historicalSlotPreparations: historical.slotPreparations,
      readFromCommittedAggregateRecordsOnly: true as const,
      r23PlusR29ArithmeticClosed: true as const,
      historicalPreparationSlotsEqualR35HistoricalGraphSlots: true as const,
      historicalRankedPopulationEqualsR35HistoricalGraphDocuments: true as const,
    }),
    coverage: Object.freeze({
      historicalCanonicalSlotPreparations: expansion.historicalSlotPreparations,
      newR36SlotPreparations: expansion.deltaSlotPreparations,
      coverageSlotPreparations: expansion.coverageSlotPreparations,
      historical: expansion.historical,
      new: expansion.delta,
      coverage: expansion.coverage,
      coverageIsSumOfPerSlotCounts: true as const,
      thirteenSlotSampleBatchMinted: false as const,
    }),
    semantics: Object.freeze({
      historicalR23R29PreparationsRecomputed: false as const,
      historicalPreparationObjectsReminted: false as const,
      deltaOnlySamplePreparation: true as const,
      canonicalR23PurePreparationUsed: true as const,
      canonicalR23CallsPerDeltaSlot: 1 as const,
      canonicalR23DivergenceHelperUsed: true as const,
      sameCanonicalR35GraphUsedForBothSamples: true as const,
      sampleSpecificOrdersPreserved: true as const,
      rankReimplemented: false as const,
      survivorWalkReimplemented: false as const,
      capAlgorithmReimplemented: false as const,
      scoresRecomputed: false as const,
      scoresCopied: false as const,
      edgesCopied: false as const,
      shortTextResolved: false as const,
      initialCapAndFullRankReadinessKeptSeparate: true as const,
      reachableMembershipBound: false as const,
      extensionPerformed: false as const,
      sd9Evaluated: false as const,
      sd4Applied: false as const,
      k4Applied: false as const,
      labelsRead: false as const,
      classifierCalled: false as const,
      finalDevTrainCorpusMaterialised: false as const,
    }),
    access: Object.freeze({
      r36SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalUpstreamR33Reproduction: true as const,
      upstreamReproducedR33OldAuthorityQueries: reproduction.upstreamOldAuthorityQueries,
      upstreamReproducedR33DeltaAuthorityQueries: reproduction.upstreamDeltaAuthorityQueries,
      historicalDocumentReassembly: 0 as const,
      historicalGraphRemeasurement: 0 as const,
      historicalSampleRepreparation: 0 as const,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      devConfirmEvidenceReads: 0 as const,
      finalHoldoutEvidenceReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_THIRTEEN_SLOT_SAMPLE_BATCH',
      'NOT_A_REPREPARATION_OF_R23_OR_R29_CANONICAL_HISTORY',
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_DATABASE_EVIDENCE_AUTHORITY',
      'NOT_REACHABLE_CAPPED_MEMBERSHIP',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_AN_EXTENSION',
      'NOT_SD4_OR_K4',
      'NOT_SD9',
      'NOT_A_FINAL_SET_P',
      'NOT_A_FINAL_SET_R',
      'NOT_A_LABEL_OR_CLASSIFICATION',
      'NOT_R37_AUTHORITY',
      'NOT_AN_A5_CORPUS_FREEZE',
    ]),
    identityDisclosure: Object.freeze({
      selectionIndices: false as const,
      reservePositions: false as const,
      organisationIds: false as const,
      echeRowKeys: false as const,
      runIdentifiers: false as const,
      runReferenceDigests: false as const,
      rowIdentifiers: false as const,
      documentDigests: false as const,
      saltedRankDigests: false as const,
      rankPositions: false as const,
      sourceRankPositions: false as const,
      survivorPositions: false as const,
      exclusionPositions: false as const,
      blockingSurvivorPositions: false as const,
      edgeEndpoints: false as const,
      excludedDocumentIdentities: false as const,
      scoresOrScoreDistributions: false as const,
      urlsOrHosts: false as const,
      titlesHeadingsOrText: false as const,
      labels: false as const,
      sealedFilenames: false as const,
      perSlotIdentities: false as const,
      perSlotSampleCounts: false as const,
      perSlotCapStatus: false as const,
    }),
  });
}

export type R36PublicIncrementalSampleSurvivorCensus = ReturnType<
  typeof deriveR36PublicIncrementalSampleSurvivorCensus
>;

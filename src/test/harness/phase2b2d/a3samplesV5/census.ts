/**
 * PHASE 2B-2D — A3 R42: THE SAMPLE COVERAGE EXPANSION AND THE PUBLIC, DERIVED CENSUS.
 *
 * THE COVERAGE EXPANSION IS COUNTS, NOT A TWENTY-SLOT BATCH
 *
 *   Historical R36 coverage enters as the committed aggregate baseline (see
 *   `history.ts`); delta coverage is derived from the MINTED R42 batch. The
 *   sum is an aggregate statement only - nothing is minted for it, and no
 *   historical preparation is re-prepared, wrapped or copied. Readiness
 *   coverage stays at the historical thirteen: R42 does none of that work.
 *
 * DIVERGENCE COMES ONLY FROM R23
 *
 *   Each delta slot's SET_P / SET_R divergence is R23's own
 *   `sampleSurvivorDivergence` over the exact R41 graph that preparation
 *   consumed, reached through R42 -> R41 provenance. Nothing here compares
 *   survivor sets itself.
 *
 * THE CENSUS IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Counts, stated canonical constants, commits and
 *   booleans. No selection index, organisation, run, document digest, rank
 *   digest, rank / survivor / exclusion / blocking position, edge endpoint,
 *   score, URL, host, text, label, per-slot count or per-slot cap status. And
 *   no sample, survivor, rank or cap hash: authority is in-process
 *   R39 -> R40 -> R41 -> R42 provenance, never a token.
 *
 * The canonical cap and readiness tokens are STATED in `types.ts`, not
 * imported: this namespace imports nothing from `a3prep/` or `sd7/`. The unit
 * suite asserts they equal the canonical constants.
 */
import { sampleSurvivorDivergence } from '../a3samples/prepare.js';
import {
  deltaGraphForSamplePreparationV5,
  graphDeltaBatchForSampleDeltaBatchV5,
  isA3DevTrainSampleSurvivorDeltaBatchV5,
  r23CallsForSampleDeltaBatchV5,
} from './devTrain.js';
import { historicalSampleCoverageProofForBatch } from './history.js';
import { r41ReproductionProofForBatch, type R41ReproductionProof } from './r41Drift.js';
import { refuseV5Sample } from './refusal.js';
import {
  R42_SAMPLE_SPLIT,
  R42_STATED_CANONICAL_SAMPLE_CONSTANTS as C,
  type A3DevTrainCanonicalSampleSurvivorCoverageExpansionV5,
  type A3DevTrainSampleSurvivorDeltaBatchV5,
  type DivergenceAggregateCountsV5,
  type HistoricalV5SamplePreparationCoverageProof,
  type R42DeltaSampleAggregates,
  type SampleAggregateCountsV5,
  type SetRAggregateCountsV5,
} from './types.js';

export const R42_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R42_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1';
export const R42_CENSUS_PATH = `docs/evaluation/${R42_PUBLIC_CENSUS_RECORD_KIND}.json`;
export const R42_SUCCESS_TERMINAL =
  'R42_INCREMENTAL_DEV_TRAIN_SAMPLE_SURVIVOR_V5_COMPLETE_READY_FOR_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9';
export const R42_NEXT_OWNER_QUESTION =
  'Should R43 derive canonical reachable initial-cap membership and mechanical SD9 readiness for ONLY the seven new R42 Governance-V5 sample preparations, preserving the thirteen historical R37 readiness slots untouched?';

function requireMintedSampleBatch(batch: unknown): A3DevTrainSampleSurvivorDeltaBatchV5 {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV5(batch)) {
    refuseV5Sample(
      'R42_NOT_A_MINTED_DELTA_SAMPLE_BATCH',
      'the input was not a DEV_TRAIN sample survivor delta batch minted by R42',
    );
  }
  return batch;
}

function zeroSample(): {
  -readonly [K in keyof SampleAggregateCountsV5]: number;
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
export function deriveDeltaSampleAggregatesV5(
  sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV5,
): R42DeltaSampleAggregates {
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
    const deltaGraph = deltaGraphForSamplePreparationV5(item);
    if (deltaGraph === undefined) {
      refuseV5Sample(
        'R42_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta preparation does not trace to an R41 graph',
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

    // §17: R23's own comparison, over the exact graph this preparation consumed.
    const graph = deltaGraph.graph;
    const slotDivergence = sampleSurvivorDivergence(item, graph);
    divergence.measurableDocumentCount += slotDivergence.measurableDocumentCount;
    divergence.survivingBothSamples += slotDivergence.survivingBothSamples;
    divergence.survivingSetPOnly += slotDivergence.survivingSetPOnly;
    divergence.survivingSetROnly += slotDivergence.survivingSetROnly;
    divergence.excludedInBothSamples += slotDivergence.excludedInBothSamples;
    // §27: ONLY a single-edge, short-text-free slot; the binder already
    // proved it is one of exactly two shapes.
    if (graph.edges.length === 1 && graph.shortTextUnresolvedCount === 0) {
      singleEdgeNoShortTextSlots += 1;
      if (slotDivergence.excludedInBothSamples === 1) singleEdgeSlotsSameExcludedEndpoint += 1;
      else singleEdgeSlotsOppositeExcludedEndpoints += 1;
    }
  }

  // §37 - §39: every partition closes over the delta, whatever the split.
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
    refuseV5Sample(
      'R42_DELTA_BATCH_COMPOSITION_INVALID',
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
  a: SampleAggregateCountsV5,
  b: SampleAggregateCountsV5,
): SampleAggregateCountsV5 {
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

function sumSetR(a: SetRAggregateCountsV5, b: SetRAggregateCountsV5): SetRAggregateCountsV5 {
  return Object.freeze({
    ...sumSample(a, b),
    fullRankExactSlotCount: a.fullRankExactSlotCount + b.fullRankExactSlotCount,
    fullRankShortTextBlockedSlotCount:
      a.fullRankShortTextBlockedSlotCount + b.fullRankShortTextBlockedSlotCount,
  });
}

function sumDivergence(
  a: DivergenceAggregateCountsV5,
  b: DivergenceAggregateCountsV5,
): DivergenceAggregateCountsV5 {
  return Object.freeze({
    measurableDocumentCount: a.measurableDocumentCount + b.measurableDocumentCount,
    survivingBothSamples: a.survivingBothSamples + b.survivingBothSamples,
    survivingSetPOnly: a.survivingSetPOnly + b.survivingSetPOnly,
    survivingSetROnly: a.survivingSetROnly + b.survivingSetROnly,
    excludedInBothSamples: a.excludedInBothSamples + b.excludedInBothSamples,
  });
}

function requireProofsFor(batch: A3DevTrainSampleSurvivorDeltaBatchV5): {
  readonly reproduction: R41ReproductionProof;
  readonly historical: HistoricalV5SamplePreparationCoverageProof;
  readonly r23Calls: number;
} {
  const graphBatch = graphDeltaBatchForSampleDeltaBatchV5(batch);
  const reproduction = r41ReproductionProofForBatch(graphBatch);
  const historical = historicalSampleCoverageProofForBatch(graphBatch);
  const r23Calls = r23CallsForSampleDeltaBatchV5(batch);
  if (reproduction === undefined || r23Calls === undefined) {
    refuseV5Sample(
      'R42_R41_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the R41 batch behind this R42 batch was not proved to reproduce the committed census',
    );
  }
  if (historical === undefined) {
    refuseV5Sample(
      'R42_HISTORICAL_SAMPLE_COVERAGE_NOT_PROVED_FOR_BATCH',
      'the historical sample coverage was not proved against the R41 batch behind this R42 batch',
    );
  }
  return { reproduction, historical, r23Calls };
}

/**
 * §33 / §34 / §58. Historical R36 baseline + minted delta = coverage. The
 * historical slot count must be exactly R41's proved historical graph slots;
 * the historical ranked / measurable / short populations exactly R41's proved
 * historical graph documents; the delta ranked / measurable / short
 * populations exactly R41's proved delta; and the combined slot count and
 * populations exactly R41's combined graph coverage.
 */
export function deriveCanonicalSampleSurvivorCoverageExpansionV5(
  sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV5,
): A3DevTrainCanonicalSampleSurvivorCoverageExpansionV5 {
  const batch = requireMintedSampleBatch(sampleDeltaBatch);
  const { reproduction: proof, historical } = requireProofsFor(batch);
  const delta = deriveDeltaSampleAggregatesV5(batch);
  const agrees = (
    sample: SampleAggregateCountsV5,
    ranked: number,
    measurable: number,
    shortText: number,
  ): boolean =>
    sample.preSd7RankEntryCount === ranked &&
    sample.measurableDocumentCount === measurable &&
    sample.unresolvedShortTextOccurrenceCount === shortText;
  const coverageSetP = sumSample(historical.setP, delta.setP);
  const coverageSetR = sumSetR(historical.setR, delta.setR);
  if (
    historical.slotPreparations !== proof.historicalGraphSlots ||
    delta.slotPreparations !== proof.deltaGraphSlots ||
    historical.slotPreparations + delta.slotPreparations !== proof.coverageGraphSlots ||
    ![historical.setP, historical.setR].every((s) =>
      agrees(
        s,
        proof.historicalDocuments,
        proof.historicalMeasurableDocuments,
        proof.historicalShortTextUnresolved,
      ),
    ) ||
    ![delta.setP, delta.setR].every((s) =>
      agrees(
        s,
        proof.deltaDocuments,
        proof.deltaMeasurableDocuments,
        proof.deltaShortTextUnresolved,
      ),
    ) ||
    ![coverageSetP, coverageSetR].every((s) =>
      agrees(
        s,
        proof.coverageDocuments,
        proof.coverageMeasurableDocuments,
        proof.coverageShortTextUnresolved,
      ),
    )
  ) {
    refuseV5Sample(
      'R42_GRAPH_DELTA_COVERAGE_NOT_ADDITIVE',
      'historical R36 preparations plus delta preparations do not equal the R41 graph coverage',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_SAMPLE_SURVIVOR_COVERAGE_EXPANSION_V5' as const,
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
      setP: coverageSetP,
      setR: coverageSetR,
      divergence: sumDivergence(historical.divergence, delta.divergence),
    }),
    graphCoverageAfterR42: proof.coverageGraphSlots,
    sampleCoverageAfterR42: historical.slotPreparations + delta.slotPreparations,
    readinessCoverageAfterR42: historical.r37ReadinessSlots,
  });
}

export interface R42CensusProvenance {
  /** The exact R41 tip R42 was cut from. */
  readonly r41Tip: string;
  /** The one commit that pinned R41's isolation test to its own range. */
  readonly r41ScopePinCommit: string;
  /** The R42 commit the real reproduction and delta preparation executed at. */
  readonly implementationCommit: string;
}

/** Derives the public census from a MINTED sample delta batch; anything else refuses. */
export function deriveR42PublicIncrementalSampleSurvivorCensus(
  sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV5,
  provenance: R42CensusProvenance,
) {
  const batch = requireMintedSampleBatch(sampleDeltaBatch);
  const { reproduction, historical, r23Calls } = requireProofsFor(batch);
  const delta = deriveDeltaSampleAggregatesV5(batch);
  const expansion = deriveCanonicalSampleSurvivorCoverageExpansionV5(batch);

  return Object.freeze({
    record: R42_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS' as const,
    task: 'A3_R42_INCREMENTAL_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_V5' as const,
    ownerDecision: 'AUTHORISE_A3_R42_INCREMENTAL_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_V5' as const,
    split: R42_SAMPLE_SPLIT,
    r41Tip: provenance.r41Tip,
    r41ScopePinCommit: provenance.r41ScopePinCommit,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    r41Reproduction: Object.freeze({
      committedRecord: reproduction.committedRecord,
      freshInProcessUpstreamChainConsumed: true as const,
      freshR41CensusEqualsCommitted: reproduction.differingSemanticPathCount === 0,
      comparedTopLevelFieldCount: reproduction.comparedTopLevelFieldCount,
      excludedExecutionProvenanceFields: reproduction.excludedFields,
      differingSemanticPathCount: reproduction.differingSemanticPathCount,
      reproductionProofBoundToExactR41BatchByIdentity: true as const,
      reproducedGraphSlots: reproduction.deltaGraphSlots,
      reproducedDocuments: reproduction.deltaDocuments,
      reproducedMeasurableDocuments: reproduction.deltaMeasurableDocuments,
      reproducedShortTextUnresolved: reproduction.deltaShortTextUnresolved,
      reproducedComparedPairs: reproduction.deltaComparedPairs,
      reproducedNearDuplicateEdges: reproduction.deltaNearDuplicateEdges,
      reproducedDocumentsInAtLeastOneNearDuplicateEdge: reproduction.deltaDocumentsInAtLeastOneEdge,
      reproducedCombinedGraphSlots: reproduction.coverageGraphSlots,
      reproducedCombinedDocuments: reproduction.coverageDocuments,
      reproducedCombinedMeasurableDocuments: reproduction.coverageMeasurableDocuments,
      reproducedCombinedShortTextUnresolved: reproduction.coverageShortTextUnresolved,
      reproducedCombinedComparedPairs: reproduction.coverageComparedPairs,
      reproducedCombinedNearDuplicateEdges: reproduction.coverageNearDuplicateEdges,
      reproducedCombinedDocumentsInAtLeastOneNearDuplicateEdge:
        reproduction.coverageDocumentsInAtLeastOneEdge,
      historicalGraphsRemeasured: false as const,
      shortTextResolvedByR41: false as const,
      survivorSelectionPerformedByR41: false as const,
      setPSetRRankedByR41: false as const,
      sd9EvaluatedByR41: false as const,
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
      r36Record:
        'PHASE_2B_2D_A3_R36_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1' as const,
      r37Record:
        'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1' as const,
      r41Record: 'PHASE_2B_2D_A3_R41_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1' as const,
      r36HistoricalSlotPreparationsBeforeR36: historical.r36HistoricalSlotPreparationsBeforeR36,
      r36NewSlotPreparations: historical.r36NewSlotPreparations,
      r36SampleSlots: historical.slotPreparations,
      r37ReadinessSlots: historical.r37ReadinessSlots,
      r41HistoricalSampleCoverage: historical.r41HistoricalSampleCoverage,
      r41HistoricalReadinessCoverage: historical.r41HistoricalReadinessCoverage,
      readFromCommittedAggregateRecordsOnly: true as const,
      r36ArithmeticClosed: true as const,
      historicalSampleSlotsEqualR37ReadinessSlotsAndR41HistoricalSampleCoverage: true as const,
      historicalRankedPopulationEqualsR41HistoricalGraphDocuments: true as const,
      historicalPreparationObjectsReconstructed: false as const,
      historicalReadinessObjectsReconstructed: false as const,
    }),
    coverage: Object.freeze({
      historicalCanonicalSlotPreparations: expansion.historicalSlotPreparations,
      newR42SlotPreparations: expansion.deltaSlotPreparations,
      coverageSlotPreparations: expansion.coverageSlotPreparations,
      historical: expansion.historical,
      new: expansion.delta,
      coverage: expansion.coverage,
      authorityCoverage: reproduction.authorityCoverage,
      evidenceCoverage: reproduction.evidenceCoverage,
      documentCoverage: reproduction.documentCoverage,
      graphCoverageAfterR42: expansion.graphCoverageAfterR42,
      sampleCoverageAfterR42: expansion.sampleCoverageAfterR42,
      readinessCoverageAfterR42: expansion.readinessCoverageAfterR42,
      coverageIsSumOfPerSlotCounts: true as const,
      twentySlotSampleBatchMinted: false as const,
    }),
    semantics: Object.freeze({
      historicalPreparationsRecomputed: false as const,
      historicalPreparationObjectsReminted: false as const,
      deltaOnlySamplePreparation: true as const,
      canonicalR23PurePreparationUsed: true as const,
      canonicalR23CallsPerDeltaSlot: r23Calls / delta.slotPreparations,
      canonicalR23CallCount: r23Calls,
      historicalR23Calls: 0 as const,
      canonicalR23DivergenceHelperUsed: true as const,
      sameCanonicalR41GraphUsedForBothSamples: true as const,
      exactR40SlotPassedToR23: true as const,
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
      completeCorpusPreflightRun: false as const,
      allOrNothingMinting: true as const,
    }),
    access: Object.freeze({
      r42SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalUpstreamR39Reproduction: true as const,
      upstreamRole: reproduction.upstreamRole,
      upstreamDatabase: reproduction.upstreamDatabase,
      upstreamTransactionReadOnly: reproduction.upstreamTransactionReadOnly,
      upstreamTransactionIsolation: reproduction.upstreamTransactionIsolation,
      upstreamPoolConnections: reproduction.upstreamPoolConnections,
      upstreamSnapshotTransactions: reproduction.upstreamSnapshotTransactions,
      upstreamSqlStatements: reproduction.upstreamSqlStatements,
      upstreamNewAuthorityEvidenceLoads: reproduction.upstreamNewAuthorityEvidenceLoads,
      upstreamOldAuthorityEvidenceLoads: reproduction.upstreamOldAuthorityEvidenceLoads,
      upstreamDevConfirmEvidenceReads: reproduction.upstreamDevConfirmEvidenceReads,
      upstreamFinalHoldoutEvidenceReads: reproduction.upstreamFinalHoldoutEvidenceReads,
      upstreamWrites: reproduction.upstreamWrites,
      upstreamPoolClosedBeforeR40Assembly: reproduction.upstreamPoolClosedBeforeR40Assembly,
      r21DocumentCalls: reproduction.r21CallsDuringR40,
      r22GraphCalls: reproduction.r22Calls,
      r23SampleCalls: r23Calls,
      historicalR23SampleCalls: 0 as const,
      sqlAfterUpstreamPoolClose: 0 as const,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_TWENTY_SLOT_SAMPLE_BATCH',
      'NOT_A_REPREPARATION_OF_THE_THIRTEEN_HISTORICAL_SAMPLE_SLOTS',
      'NOT_REACHABLE_CAPPED_MEMBERSHIP',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_AN_EXTENSION',
      'NOT_SD4_OR_K4',
      'NOT_SD9',
      'NOT_A_FINAL_SET_P',
      'NOT_A_FINAL_SET_R',
      'NOT_A_COMPLETE_CORPUS_PREFLIGHT',
      'NOT_A_LABEL_OR_CLASSIFICATION',
      'NOT_GOVERNANCE_V6',
      'NOT_AN_A5_FREEZE',
    ]),
    identityDisclosure: Object.freeze({
      selectionIndices: false as const,
      reservePositions: false as const,
      organisationIds: false as const,
      echeRowKeys: false as const,
      runIdentifiers: false as const,
      runReferenceDigests: false as const,
      pageIdentifiers: false as const,
      documentDigests: false as const,
      edgeEndpoints: false as const,
      saltedRankDigests: false as const,
      rankPositions: false as const,
      sourceRankPositions: false as const,
      survivorPositions: false as const,
      exclusionPositions: false as const,
      blockingPositions: false as const,
      capMemberIdentities: false as const,
      scoresOrScoreDistributions: false as const,
      urlsOrHosts: false as const,
      titlesHeadingsOrText: false as const,
      labels: false as const,
      sealedFilenames: false as const,
      perSlotSampleCounts: false as const,
      perSlotCapStatus: false as const,
      whichSlotsContainShortText: false as const,
      whichDeltaSlotsAreGeneration2Reserves: false as const,
      aggregateCountsOnly: true as const,
    }),
    terminalState: R42_SUCCESS_TERMINAL,
    nextOwnerQuestion: R42_NEXT_OWNER_QUESTION,
    immutability: 'append-only. This record is never edited; a correction is a new record',
  });
}

export type R42PublicIncrementalSampleSurvivorCensus = ReturnType<
  typeof deriveR42PublicIncrementalSampleSurvivorCensus
>;

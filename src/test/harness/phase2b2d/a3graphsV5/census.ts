/**
 * PHASE 2B-2D — A3 R41: THE GRAPH COVERAGE EXPANSION AND THE PUBLIC, DERIVED CENSUS.
 *
 * THE COVERAGE EXPANSION IS COUNTS, NOT A TWENTY-GRAPH BATCH
 *
 *   Historical R35 coverage enters as the committed aggregate baseline (see
 *   `history.ts`); delta coverage is derived from the MINTED R41 batch. The
 *   sum is an aggregate statement only - nothing is minted for it, and no
 *   historical graph is re-measured, wrapped or copied. Sample and readiness
 *   coverage stay at the historical thirteen: R41 does none of that work.
 *
 * EVERY TOTAL IS A SUM OF PER-SLOT COUNTS
 *
 *   Graph comparison is within ONE organisation. The delta compared-pair
 *   count is therefore the SUM of each slot's own m(m-1)/2 - never M(M-1)/2
 *   over every measurable document of every organisation - and the combined
 *   count is historical plus that sum. Edges are within-slot only. Documents in
 *   edges are counted per slot (edge endpoint positions of that slot's graph,
 *   a count - not a component) and never deduplicated across organisations.
 *
 * THE CENSUS IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Counts, frozen SD7 constants, commits and
 *   booleans. No selection index, reserve position, organisation, eche row
 *   key, run, run reference, row id, document digest, edge endpoint, per-edge
 *   measurement, similarity, per-document token or shingle count, URL, host,
 *   title, text, score, rank, sealed filename or per-slot graph count. No
 *   graph, coverage or batch hash: authority is in-process R39 -> R40 -> R41
 *   provenance, never a token.
 *
 * The SD7 constants below are STATED, not imported: this namespace imports
 * nothing from `sd7/`. The unit suite asserts they equal the canonical SD7
 * contract and the committed R35 record.
 */
import {
  documentSourceDeltaBatchForGraphDeltaBatchV5,
  documentSourceDeltaSlotForDeltaGraphV5,
  isA3DevTrainSd7GraphDeltaBatchV5,
  r22GraphCallsForGraphDeltaBatchV5,
} from './devTrain.js';
import { historicalGraphCoverageProofForBatch } from './history.js';
import { r40ReproductionProofForBatch, type R40ReproductionProof } from './r40Drift.js';
import { refuseV5Graph } from './refusal.js';
import {
  R41_GRAPH_SPLIT,
  type A3DevTrainCanonicalSd7GraphCoverageExpansionV5,
  type A3DevTrainSd7GraphDeltaBatchV5,
  type HistoricalV5GraphCoverageProof,
} from './types.js';

export const R41_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R41_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1';
export const R41_CENSUS_PATH = `docs/evaluation/${R41_PUBLIC_CENSUS_RECORD_KIND}.json`;
export const R41_SUCCESS_TERMINAL =
  'R41_INCREMENTAL_DEV_TRAIN_SD7_GRAPH_V5_COMPLETE_READY_FOR_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION';
export const R41_NEXT_OWNER_QUESTION =
  'Should R42 prepare canonical SET_P / SET_R sample-specific SD7 survivors for ONLY the seven new R41 Governance-V5 graphs, preserving the thirteen historical R36/R37 sample-and-readiness slots untouched?';

/** The canonical SD7 constants R22 measured under, stated for the record. */
export const R41_STATED_CANONICAL_SD7 = Object.freeze({
  shingleSizeTokens: 5,
  jaccardThresholdNumerator: 9,
  jaccardThresholdDenominator: 10,
  thresholdComparison: 'AT_OR_ABOVE',
  thresholdPredicate: 'INTEGER_INTERSECTION_TIMES_DENOMINATOR_GE_UNION_TIMES_NUMERATOR',
  comparisonScope: 'WITHIN_ONE_ORGANISATION_ONLY',
  shortTextStatus: 'SD7_SHORT_TEXT_UNRESOLVED',
} as const);

interface DeltaGraphAggregates {
  readonly slots: number;
  readonly documents: number;
  readonly measurableDocuments: number;
  readonly shortTextUnresolved: number;
  readonly comparedPairs: number;
  readonly nearDuplicateEdges: number;
  readonly documentsInAtLeastOneEdge: number;
}

function requireMintedGraphBatch(batch: unknown): A3DevTrainSd7GraphDeltaBatchV5 {
  if (!isA3DevTrainSd7GraphDeltaBatchV5(batch)) {
    refuseV5Graph(
      'R41_NOT_A_MINTED_DELTA_GRAPH_BATCH',
      'the input was not a DEV_TRAIN SD7 graph delta batch minted by R41',
    );
  }
  return batch;
}

/**
 * Delta aggregates, derived per slot from the minted graphs and summed.
 * Identities never leave memory, and no per-slot value is returned.
 */
function deltaAggregatesOf(batch: A3DevTrainSd7GraphDeltaBatchV5): DeltaGraphAggregates {
  const totals = {
    slots: batch.items.length,
    documents: 0,
    measurableDocuments: 0,
    shortTextUnresolved: 0,
    comparedPairs: 0,
    nearDuplicateEdges: 0,
    documentsInAtLeastOneEdge: 0,
  };
  for (const deltaGraph of batch.items) {
    const slot = documentSourceDeltaSlotForDeltaGraphV5(deltaGraph);
    if (slot === undefined) {
      refuseV5Graph(
        'R41_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta graph does not trace to an R40 slot',
      );
    }
    const { graph } = deltaGraph;
    const m = graph.measurableIndices.length;
    if (
      graph.documents.length !== slot.documents.length ||
      m + graph.shortTextUnresolvedCount !== graph.documents.length ||
      graph.comparedPairCount !== (m * (m - 1)) / 2
    ) {
      refuseV5Graph(
        'R41_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta graph does not partition its own slot',
      );
    }
    totals.documents += graph.documents.length;
    totals.measurableDocuments += m;
    totals.shortTextUnresolved += graph.shortTextUnresolvedCount;
    // THIS slot's own m(m-1)/2 - summed, never recomputed over the delta.
    totals.comparedPairs += graph.comparedPairCount;
    totals.nearDuplicateEdges += graph.edges.length;
    // Endpoint positions of THIS slot's graph only; the set never outlives the slot.
    const endpoints = new Set<number>();
    for (const edge of graph.edges) {
      endpoints.add(edge.aIndex);
      endpoints.add(edge.bIndex);
    }
    totals.documentsInAtLeastOneEdge += endpoints.size;
  }
  return Object.freeze(totals);
}

function requireProofsFor(batch: A3DevTrainSd7GraphDeltaBatchV5): {
  readonly reproduction: R40ReproductionProof;
  readonly historical: HistoricalV5GraphCoverageProof;
  readonly r22Calls: number;
} {
  const documentBatch = documentSourceDeltaBatchForGraphDeltaBatchV5(batch);
  const reproduction = r40ReproductionProofForBatch(documentBatch);
  const historical = historicalGraphCoverageProofForBatch(documentBatch);
  const r22Calls = r22GraphCallsForGraphDeltaBatchV5(batch);
  if (reproduction === undefined || r22Calls === undefined) {
    refuseV5Graph(
      'R41_R40_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the R40 batch behind this R41 batch was not proved to reproduce the committed census',
    );
  }
  if (historical === undefined) {
    refuseV5Graph(
      'R41_HISTORICAL_GRAPH_COVERAGE_NOT_PROVED_FOR_BATCH',
      'the historical graph coverage was not proved against the R40 batch behind this R41 batch',
    );
  }
  return { reproduction, historical, r22Calls };
}

/**
 * §31 / §32. Historical R35 baseline + minted delta = coverage. Historical
 * graph slots must equal R40's historical document slots; delta graph
 * documents R40's delta documents; combined graph documents R40's combined
 * slot-local documents; combined graph slots R40's combined document slots.
 */
export function deriveCanonicalSd7GraphCoverageExpansionV5(
  graphDeltaBatch: A3DevTrainSd7GraphDeltaBatchV5,
): A3DevTrainCanonicalSd7GraphCoverageExpansionV5 {
  const batch = requireMintedGraphBatch(graphDeltaBatch);
  const { reproduction, historical } = requireProofsFor(batch);
  const delta = deltaAggregatesOf(batch);
  if (
    historical.graphSlots !== reproduction.historicalDocumentSlots ||
    historical.documents !== reproduction.historicalSlotLocalDocuments ||
    delta.slots !== reproduction.deltaSlots ||
    delta.documents !== reproduction.deltaSlotLocalDocuments ||
    delta.measurableDocuments + delta.shortTextUnresolved !== delta.documents ||
    historical.graphSlots + delta.slots !== reproduction.coverageDocumentSlots ||
    historical.documents + delta.documents !== reproduction.coverageSlotLocalDocuments
  ) {
    refuseV5Graph(
      'R41_DOCUMENT_SOURCE_COVERAGE_NOT_ADDITIVE',
      'historical R35 graphs plus delta graphs do not equal the R40 document coverage',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_SD7_GRAPH_COVERAGE_EXPANSION_V5' as const,
    historicalGraphSlots: historical.graphSlots,
    deltaGraphSlots: delta.slots,
    coverageGraphSlots: historical.graphSlots + delta.slots,
    historicalDocuments: historical.documents,
    deltaDocuments: delta.documents,
    coverageDocuments: historical.documents + delta.documents,
    historicalMeasurableDocuments: historical.measurableDocuments,
    deltaMeasurableDocuments: delta.measurableDocuments,
    coverageMeasurableDocuments: historical.measurableDocuments + delta.measurableDocuments,
    historicalShortTextUnresolved: historical.shortTextUnresolved,
    deltaShortTextUnresolved: delta.shortTextUnresolved,
    coverageShortTextUnresolved: historical.shortTextUnresolved + delta.shortTextUnresolved,
    historicalComparedPairs: historical.comparedPairs,
    deltaComparedPairs: delta.comparedPairs,
    coverageComparedPairs: historical.comparedPairs + delta.comparedPairs,
    historicalNearDuplicateEdges: historical.nearDuplicateEdges,
    deltaNearDuplicateEdges: delta.nearDuplicateEdges,
    coverageNearDuplicateEdges: historical.nearDuplicateEdges + delta.nearDuplicateEdges,
    historicalDocumentsInAtLeastOneEdge: historical.documentsInAtLeastOneEdge,
    deltaDocumentsInAtLeastOneEdge: delta.documentsInAtLeastOneEdge,
    coverageDocumentsInAtLeastOneEdge:
      historical.documentsInAtLeastOneEdge + delta.documentsInAtLeastOneEdge,
    documentSlotCoverage: reproduction.coverageDocumentSlots,
    sampleCoverageAfterR41: historical.r40HistoricalSampleCoverage,
    readinessCoverageAfterR41: historical.r40HistoricalReadinessCoverage,
  });
}

export interface R41CensusProvenance {
  /** The exact R40 tip R41 was cut from. */
  readonly r40Tip: string;
  /** The one commit that pinned R40's isolation test to its own range. */
  readonly r40ScopePinCommit: string;
  /** The R41 commit the real reproduction and delta measurement executed at. */
  readonly implementationCommit: string;
}

/** Derives the public census from a MINTED graph delta batch; anything else refuses. */
export function deriveR41PublicIncrementalSd7GraphCensus(
  graphDeltaBatch: A3DevTrainSd7GraphDeltaBatchV5,
  provenance: R41CensusProvenance,
) {
  const batch = requireMintedGraphBatch(graphDeltaBatch);
  const { reproduction, historical, r22Calls } = requireProofsFor(batch);
  const coverage = deriveCanonicalSd7GraphCoverageExpansionV5(batch);

  return Object.freeze({
    record: R41_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SD7_GRAPH_CENSUS' as const,
    task: 'A3_R41_INCREMENTAL_DEV_TRAIN_SD7_GRAPH_V5' as const,
    ownerDecision: 'AUTHORISE_A3_R41_INCREMENTAL_DEV_TRAIN_SD7_GRAPH_V5' as const,
    split: R41_GRAPH_SPLIT,
    r40Tip: provenance.r40Tip,
    r40ScopePinCommit: provenance.r40ScopePinCommit,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    r40Reproduction: Object.freeze({
      committedRecord: reproduction.committedRecord,
      freshInProcessR39R40ChainConsumed: true as const,
      freshR40CensusEqualsCommitted: reproduction.differingSemanticPathCount === 0,
      comparedTopLevelFieldCount: reproduction.comparedTopLevelFieldCount,
      excludedExecutionProvenanceFields: reproduction.excludedFields,
      differingSemanticPathCount: reproduction.differingSemanticPathCount,
      reproductionProofBoundToExactR40BatchByIdentity: true as const,
      freshR40DeltaSlots: reproduction.deltaSlots,
      freshR40SourceRows: reproduction.deltaSourceRows,
      freshR40Documents: reproduction.deltaSlotLocalDocuments,
      freshR40CandidateObservations: reproduction.deltaCandidateObservations,
      freshR40R21Calls: reproduction.r21AssemblyCalls,
      freshHistoricalR21Calls: reproduction.historicalR21AssemblyCalls,
    }),
    deltaGraph: Object.freeze({
      deltaGraphSlots: coverage.deltaGraphSlots,
      deltaDocuments: coverage.deltaDocuments,
      deltaMeasurableDocuments: coverage.deltaMeasurableDocuments,
      deltaShortTextUnresolved: coverage.deltaShortTextUnresolved,
      deltaComparedPairs: coverage.deltaComparedPairs,
      deltaNearDuplicateEdges: coverage.deltaNearDuplicateEdges,
      deltaDocumentsInAtLeastOneNearDuplicateEdge: coverage.deltaDocumentsInAtLeastOneEdge,
      measurablePlusShortTextEqualsDocuments:
        coverage.deltaMeasurableDocuments + coverage.deltaShortTextUnresolved ===
        coverage.deltaDocuments,
    }),
    canonicalSd7: R41_STATED_CANONICAL_SD7,
    historicalGraphCoverage: Object.freeze({
      r35Record: 'PHASE_2B_2D_A3_R35_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1' as const,
      r37Record:
        'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1' as const,
      r40Record:
        'PHASE_2B_2D_A3_R40_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1' as const,
      r35HistoricalGraphSlotsBeforeR35: historical.r35HistoricalGraphSlotsBeforeR35,
      r35NewGraphSlots: historical.r35NewGraphSlots,
      r35GraphSlots: historical.graphSlots,
      r35GraphDocuments: historical.documents,
      r37ReadinessSlots: historical.r37ReadinessSlots,
      r40HistoricalDocumentSlots: historical.r40HistoricalDocumentSlots,
      r40HistoricalGraphCoverage: historical.r40HistoricalGraphCoverage,
      r40HistoricalSampleCoverage: historical.r40HistoricalSampleCoverage,
      r40HistoricalReadinessCoverage: historical.r40HistoricalReadinessCoverage,
      readFromCommittedAggregateRecordsOnly: true as const,
      historicalGraphObjectsReconstructed: false as const,
      historicalSampleOrReadinessObjectsReconstructed: false as const,
    }),
    coverage: Object.freeze({
      historicalCanonicalGraphSlots: coverage.historicalGraphSlots,
      newR41GraphSlots: coverage.deltaGraphSlots,
      coverageGraphSlots: coverage.coverageGraphSlots,
      historicalDocuments: coverage.historicalDocuments,
      newDocuments: coverage.deltaDocuments,
      coverageDocuments: coverage.coverageDocuments,
      historicalMeasurableDocuments: coverage.historicalMeasurableDocuments,
      newMeasurableDocuments: coverage.deltaMeasurableDocuments,
      coverageMeasurableDocuments: coverage.coverageMeasurableDocuments,
      historicalShortTextUnresolved: coverage.historicalShortTextUnresolved,
      newShortTextUnresolved: coverage.deltaShortTextUnresolved,
      coverageShortTextUnresolved: coverage.coverageShortTextUnresolved,
      historicalComparedPairs: coverage.historicalComparedPairs,
      newComparedPairs: coverage.deltaComparedPairs,
      coverageComparedPairs: coverage.coverageComparedPairs,
      historicalNearDuplicateEdges: coverage.historicalNearDuplicateEdges,
      newNearDuplicateEdges: coverage.deltaNearDuplicateEdges,
      coverageNearDuplicateEdges: coverage.coverageNearDuplicateEdges,
      historicalDocumentsInAtLeastOneNearDuplicateEdge:
        coverage.historicalDocumentsInAtLeastOneEdge,
      newDocumentsInAtLeastOneNearDuplicateEdge: coverage.deltaDocumentsInAtLeastOneEdge,
      coverageDocumentsInAtLeastOneNearDuplicateEdge: coverage.coverageDocumentsInAtLeastOneEdge,
      authorityCoverage: coverage.documentSlotCoverage,
      evidenceCoverage: coverage.documentSlotCoverage,
      documentCoverage: coverage.documentSlotCoverage,
      graphCoverageAfterR41: coverage.coverageGraphSlots,
      sampleCoverageAfterR41: coverage.sampleCoverageAfterR41,
      readinessCoverageAfterR41: coverage.readinessCoverageAfterR41,
      coverageGraphDocumentsEqualR40CoverageDocuments:
        coverage.coverageDocuments === reproduction.coverageSlotLocalDocuments,
      coverageIsSumOfPerSlotCounts: true as const,
      combinedPairCountIsSumOfPerSlotPairs: true as const,
      combinedEdgeCountIsSumOfWithinSlotEdges: true as const,
      documentsInEdgesDedupedAcrossOrganisations: false as const,
      twentySlotGraphBatchMinted: false as const,
    }),
    semantics: Object.freeze({
      historicalGraphsRemeasured: false as const,
      historicalGraphObjectsReminted: false as const,
      deltaOnlyGraphMeasurement: true as const,
      canonicalR22PureMeasurementUsed: true as const,
      canonicalR22CallsPerDeltaSlot: r22Calls / coverage.deltaGraphSlots,
      canonicalR22CallCount: r22Calls,
      historicalR22Calls: 0 as const,
      r35V4AdapterUsed: false as const,
      textReadOnlyThroughR40Capability: true as const,
      textPersistedByR41: false as const,
      textLoggedByR41: false as const,
      emptyOrShortTextSpecialCasedByR41: false as const,
      crossOrganisationPairsMeasured: false as const,
      combinedPairCountIsSumOfPerSlotPairs: true as const,
      shortTextResolved: false as const,
      componentsComputed: false as const,
      survivorSelectionPerformed: false as const,
      setPRanked: false as const,
      setRRanked: false as const,
      setPMembershipSelected: false as const,
      setRMembershipSelected: false as const,
      reachableMembershipPerformed: false as const,
      sd9Evaluated: false as const,
      completeCorpusPreflightRun: false as const,
      allOrNothingMinting: true as const,
    }),
    access: Object.freeze({
      r41SqlStatements: 0 as const,
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
      r21DocumentCallsDuringR40Reproduction: reproduction.r21AssemblyCalls,
      r22GraphCalls: r22Calls,
      historicalR22GraphCalls: 0 as const,
      r22CallsWhileUpstreamPoolOpen: 0 as const,
      sqlAfterUpstreamPoolClose: 0 as const,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_TWENTY_SLOT_GRAPH_BATCH',
      'NOT_A_REMEASUREMENT_OF_THE_THIRTEEN_HISTORICAL_GRAPHS',
      'NOT_AN_SD7_SURVIVOR_DECISION',
      'NOT_A_COMPONENT_ANALYSIS',
      'NOT_A_POST_SD7_SAMPLE_COUNT',
      'NOT_SET_P',
      'NOT_SET_R',
      'NOT_A_RANK',
      'NOT_A_CAP',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_REACHABLE_MEMBERSHIP',
      'NOT_SD9',
      'NOT_A_COMPLETE_CORPUS_PREFLIGHT',
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
      drawScheduleOrFrameEntryDigests: false as const,
      pageIdentifiers: false as const,
      documentDigests: false as const,
      edgeEndpoints: false as const,
      perEdgeMeasurementsOrSimilarities: false as const,
      perDocumentTokenOrShingleCounts: false as const,
      urlsOrHosts: false as const,
      titlesHeadingsOrText: false as const,
      scoresRanksOrSignals: false as const,
      sealedFilenames: false as const,
      perSlotGraphCounts: false as const,
      whichDeltaSlotsAreGeneration2Reserves: false as const,
      aggregateCountsOnly: true as const,
    }),
    terminalState: R41_SUCCESS_TERMINAL,
    nextOwnerQuestion: R41_NEXT_OWNER_QUESTION,
    immutability: 'append-only. This record is never edited; a correction is a new record',
  });
}

export type R41PublicIncrementalSd7GraphCensus = ReturnType<
  typeof deriveR41PublicIncrementalSd7GraphCensus
>;

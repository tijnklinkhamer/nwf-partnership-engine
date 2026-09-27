/**
 * PHASE 2B-2D — A3 R35: THE GRAPH COVERAGE EXPANSION AND THE PUBLIC, DERIVED CENSUS.
 *
 * THE COVERAGE EXPANSION IS COUNTS, NOT A THIRTEEN-GRAPH BATCH
 *
 *   Historical R22 + R28 coverage enters as the committed aggregate baseline
 *   (see `r34Drift.ts`); delta coverage is derived from the MINTED R35 batch.
 *   The sum is an aggregate statement only - nothing is minted for it, and no
 *   historical graph is re-measured, wrapped or copied.
 *
 * EVERY TOTAL IS A SUM OF PER-SLOT COUNTS
 *
 *   Graph comparison is within ONE organisation. The delta compared-pair
 *   count is therefore the SUM of each slot's own m(m-1)/2 - never
 *   M(M-1)/2 over every measurable document of every organisation - and the
 *   combined count is historical plus that sum. Edges are within-slot only;
 *   no historical document was ever compared with a new one, and no new slot
 *   with another. Documents in edges are counted per slot (edge endpoint
 *   positions of that slot's graph, a count - not a component) and never
 *   deduplicated across organisations by digest.
 *
 * THE CENSUS IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Counts, frozen SD7 constants, commits and
 *   booleans. No selection index, reserve position, organisation, eche row
 *   key, run, run reference, row id, document digest, edge endpoint, per-edge
 *   measurement, per-document token or shingle count, URL, host, title, text,
 *   score, rank, sealed filename, per-slot identity or per-slot graph count.
 *   And no `graphDeltaHash`, `graphCoverageHash` or `sd7ExpansionHash`:
 *   authority is in-process R33 -> R34 -> R35 provenance, never a token.
 *
 * The SD7 constants below are STATED, not imported: this namespace imports
 * nothing from `sd7/`. The unit suite asserts they equal the canonical SD7
 * contract and the committed R22 / R28 records.
 */
import {
  documentSourceDeltaSlotForDeltaGraphV4,
  isA3DevTrainSd7GraphDeltaBatchV4,
} from './devTrain.js';
import { r34ReproductionProofForBatch, requireHistoricalGraphBaselineProof } from './r34Drift.js';
import { refuseV4Graph } from './refusal.js';
import {
  R35_GRAPH_SPLIT,
  type A3DevTrainCanonicalSd7GraphCoverageExpansionV4,
  type A3DevTrainSd7GraphDeltaBatchV4,
  type HistoricalGraphCoverageBaseline,
} from './types.js';

export const R35_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R35_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1';

/** The canonical SD7 constants R22 measured under, stated for the record. */
export const R35_STATED_CANONICAL_SD7 = Object.freeze({
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

function requireMintedGraphBatch(batch: unknown): A3DevTrainSd7GraphDeltaBatchV4 {
  if (!isA3DevTrainSd7GraphDeltaBatchV4(batch)) {
    refuseV4Graph(
      'R35_NOT_A_MINTED_DELTA_GRAPH_BATCH',
      'the input was not a DEV_TRAIN SD7 graph delta batch minted by R35',
    );
  }
  return batch;
}

/**
 * Delta aggregates, derived per slot from the minted graphs and summed.
 * Identities never leave memory, and no per-slot value is returned.
 */
function deltaAggregatesOf(batch: A3DevTrainSd7GraphDeltaBatchV4): DeltaGraphAggregates {
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
    const slot = documentSourceDeltaSlotForDeltaGraphV4(deltaGraph);
    if (slot === undefined) {
      refuseV4Graph(
        'R35_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta graph does not trace to an R34 slot',
      );
    }
    const { graph } = deltaGraph;
    const m = graph.measurableIndices.length;
    if (
      graph.documents.length !== slot.documents.length ||
      m + graph.shortTextUnresolvedCount !== graph.documents.length ||
      graph.comparedPairCount !== (m * (m - 1)) / 2
    ) {
      refuseV4Graph(
        'R35_DELTA_BATCH_COMPOSITION_INVALID',
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

/**
 * §18. Historical R22 + R28 baseline + minted delta = coverage. The
 * historical graph slots must be exactly R33's historical canonical coverage
 * and R34's historical document-source slots; historical graph documents
 * exactly R34's historical slot-local documents; delta graph documents
 * exactly R34's delta documents; and the combined slot count exactly the V4
 * DEV_TRAIN coverage.
 */
export function deriveCanonicalSd7GraphCoverageExpansionV4(
  graphDeltaBatch: A3DevTrainSd7GraphDeltaBatchV4,
  historicalBaseline: HistoricalGraphCoverageBaseline,
): A3DevTrainCanonicalSd7GraphCoverageExpansionV4 {
  const batch = requireMintedGraphBatch(graphDeltaBatch);
  const historical = requireHistoricalGraphBaselineProof(historicalBaseline);
  const proof = r34ReproductionProofForBatch(batch.documentSourceDeltaBatch);
  if (proof === undefined) {
    refuseV4Graph(
      'R35_R34_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the R34 batch behind this R35 batch was not proved to reproduce the committed census',
    );
  }
  const delta = deltaAggregatesOf(batch);
  const evidenceCoverage = batch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;
  if (
    historical.slotGraphs !== evidenceCoverage.historicalCanonicalCoverageCount ||
    historical.slotGraphs !== proof.historicalDocumentSourceSlots ||
    historical.documents !== proof.historicalSlotLocalDocuments ||
    delta.slots !== evidenceCoverage.newlyBoundDeltaCount ||
    delta.slots !== proof.deltaSlots ||
    delta.documents !== proof.deltaSlotLocalDocuments ||
    delta.measurableDocuments + delta.shortTextUnresolved !== delta.documents ||
    historical.slotGraphs + delta.slots !== evidenceCoverage.v4DevTrainReadyCount
  ) {
    refuseV4Graph(
      'R35_DOCUMENT_SOURCE_COVERAGE_NOT_ADDITIVE',
      'historical R22 + R28 graphs plus delta graphs do not equal the V4 DEV_TRAIN coverage',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_SD7_GRAPH_COVERAGE_EXPANSION_V4' as const,
    historicalGraphSlots: historical.slotGraphs,
    deltaGraphSlots: delta.slots,
    coverageGraphSlots: historical.slotGraphs + delta.slots,
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
  });
}

export interface R35CensusProvenance {
  /** The exact R34 tip R35 was cut from. */
  readonly r34Tip: string;
  /** The one commit that pinned R34's isolation test to its own range. */
  readonly r34ScopePinCommit: string;
  /** The R35 commit the real reproduction and delta measurement executed at. */
  readonly implementationCommit: string;
}

/** Derives the public census from a MINTED graph delta batch; anything else refuses. */
export function deriveR35PublicIncrementalSd7GraphCensus(
  graphDeltaBatch: A3DevTrainSd7GraphDeltaBatchV4,
  historicalBaseline: HistoricalGraphCoverageBaseline,
  provenance: R35CensusProvenance,
) {
  const batch = requireMintedGraphBatch(graphDeltaBatch);
  const historical = requireHistoricalGraphBaselineProof(historicalBaseline);
  const coverage = deriveCanonicalSd7GraphCoverageExpansionV4(batch, historical);
  const reproduction = r34ReproductionProofForBatch(batch.documentSourceDeltaBatch);
  if (reproduction === undefined) {
    refuseV4Graph(
      'R35_R34_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the R34 batch behind this R35 batch was not proved to reproduce the committed census',
    );
  }

  return Object.freeze({
    record: R35_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SD7_GRAPH_CENSUS' as const,
    generationId: batch.governanceSnapshotV4.resolution.summary.generationId,
    split: R35_GRAPH_SPLIT,
    r34Tip: provenance.r34Tip,
    r34ScopePinCommit: provenance.r34ScopePinCommit,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    r34Reproduction: Object.freeze({
      freshInProcessR33R34MintConsumed: true as const,
      freshR34CensusEqualsCommitted: reproduction.differingPaths.length === 0,
      comparedTopLevelFieldCount: reproduction.comparedTopLevelFieldCount,
      excludedExecutionProvenanceFields: reproduction.excludedFields,
      reproductionProofBoundToExactR34BatchByIdentity: true as const,
    }),
    deltaGraph: Object.freeze({
      deltaGraphSlots: coverage.deltaGraphSlots,
      deltaDocuments: coverage.deltaDocuments,
      deltaMeasurableDocuments: coverage.deltaMeasurableDocuments,
      deltaShortTextUnresolved: coverage.deltaShortTextUnresolved,
      deltaComparedPairs: coverage.deltaComparedPairs,
      deltaNearDuplicateEdges: coverage.deltaNearDuplicateEdges,
      deltaDocumentsInAtLeastOneNearDuplicateEdge: coverage.deltaDocumentsInAtLeastOneEdge,
    }),
    canonicalSd7: R35_STATED_CANONICAL_SD7,
    historicalGraphCoverage: Object.freeze({
      r22HistoricalGraphSlots: historical.r22GraphSlots,
      r28NewGraphSlots: historical.r28NewGraphSlots,
      historicalGraphSlots: historical.slotGraphs,
      readFromCommittedAggregateRecordsOnly: true as const,
      historicalGraphSlotsEqualR34HistoricalDocumentSourceSlots: true as const,
      historicalGraphDocumentsEqualR34HistoricalSlotLocalDocuments: true as const,
    }),
    coverage: Object.freeze({
      historicalCanonicalGraphSlots: coverage.historicalGraphSlots,
      newR35GraphSlots: coverage.deltaGraphSlots,
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
      coverageIsSumOfPerSlotCounts: true as const,
      combinedPairCountIsSumOfPerSlotPairs: true as const,
      combinedEdgeCountIsSumOfWithinSlotEdges: true as const,
      documentsInEdgesDedupedAcrossOrganisations: false as const,
      thirteenSlotGraphBatchMinted: false as const,
    }),
    a2Sd7Consistency: Object.freeze({
      a2Sd7AggregateConsistencyCheckUsedAsGraphAuthority: false as const,
      a2Sd7AggregateConsistencyCheckPerformed: false as const,
      sealedDetailOpened: false as const,
      a2EdgeIdentitiesRead: false as const,
      a2DocumentDigestsRead: false as const,
      a2SurvivorCountUsedAsAuthority: false as const,
    }),
    semantics: Object.freeze({
      historicalR22R28GraphsRemeasured: false as const,
      historicalGraphObjectsReminted: false as const,
      deltaOnlyGraphMeasurement: true as const,
      canonicalR22PureMeasurementUsed: true as const,
      canonicalR22CallsPerDeltaSlot: 1 as const,
      textReadOnlyThroughR34Capability: true as const,
      textPersistedByR35: false as const,
      textLoggedByR35: false as const,
      emptyOrShortTextSpecialCasedByR35: false as const,
      crossOrganisationPairsMeasured: false as const,
      combinedPairCountIsSumOfPerSlotPairs: true as const,
      shortTextResolved: false as const,
      componentsComputed: false as const,
      survivorSelectionPerformed: false as const,
      setPRanked: false as const,
      setRRanked: false as const,
      setPMembershipSelected: false as const,
      setRMembershipSelected: false as const,
      sd9Evaluated: false as const,
    }),
    access: Object.freeze({
      r35SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalUpstreamR33Reproduction: true as const,
      upstreamReproducedR33OldAuthorityQueries: reproduction.upstreamOldAuthorityQueries,
      upstreamReproducedR33DeltaAuthorityQueries: reproduction.upstreamDeltaAuthorityQueries,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      devConfirmEvidenceReads: 0 as const,
      finalHoldoutEvidenceReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_THIRTEEN_SLOT_GRAPH_BATCH',
      'NOT_A_REMEASUREMENT_OF_R22_OR_R28_CANONICAL_HISTORY',
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_DATABASE_EVIDENCE_AUTHORITY',
      'NOT_AN_SD7_SURVIVOR_DECISION',
      'NOT_A_POST_SD7_COUNT',
      'NOT_A_COMPONENT_COUNT',
      'NOT_SET_P',
      'NOT_SET_R_MEMBERSHIP',
      'NOT_A_RANK',
      'NOT_A_CAP',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_SD9',
      'NOT_R36_AUTHORITY',
      'NOT_AN_A5_CORPUS_FREEZE',
    ]),
    identityDisclosure: Object.freeze({
      selectionIndices: false as const,
      reservePositions: false as const,
      organisationIds: false as const,
      echeRowKeys: false as const,
      runIdentifiers: false as const,
      runReferenceDigests: false as const,
      drawEntryDigests: false as const,
      rowIdentifiers: false as const,
      documentDigests: false as const,
      edgeEndpoints: false as const,
      perEdgeMeasurements: false as const,
      perDocumentTokenOrShingleCounts: false as const,
      urlsOrHosts: false as const,
      titlesHeadingsOrText: false as const,
      scoresRanksOrSignals: false as const,
      sealedFilenames: false as const,
      perSlotIdentities: false as const,
      perSlotGraphCounts: false as const,
    }),
  });
}

export type R35PublicIncrementalSd7GraphCensus = ReturnType<
  typeof deriveR35PublicIncrementalSd7GraphCensus
>;

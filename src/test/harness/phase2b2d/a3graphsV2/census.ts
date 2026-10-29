/**
 * PHASE 2B-2D — A3 R28: THE GRAPH COVERAGE EXPANSION AND THE PUBLIC, DERIVED CENSUS.
 *
 * THE COVERAGE EXPANSION IS COUNTS, NOT A SIX-GRAPH BATCH
 *
 *   Historical R22 coverage enters as the committed aggregate baseline (see
 *   `r27Drift.ts`); delta coverage is derived from the MINTED R28 batch. The
 *   sum is an aggregate statement only - nothing is minted for it, and no
 *   historical graph is re-measured, wrapped or copied.
 *
 * EVERY TOTAL IS A SUM OF PER-SLOT COUNTS
 *
 *   Graph comparison is within ONE organisation. The combined compared-pair
 *   count is therefore the SUM of each slot's own m(m-1)/2 - never
 *   n(n-1)/2 over every measurable document of every organisation. The
 *   combined edge count is historical within-organisation edges plus new
 *   within-organisation edges; no historical document was ever compared with
 *   a new one. Documents in edges are summed per slot and never deduplicated
 *   across organisations by digest.
 *
 * THE CENSUS IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Counts, frozen SD7 constants, commits and
 *   booleans. No selection index, organisation, run, row id, document digest,
 *   edge endpoint, per-edge measurement, per-document token or shingle count,
 *   URL, host, title, text, score, rank, sealed filename or per-slot identity.
 *   And no `graphDeltaHash`, `graphCoverageHash` or `sd7ExpansionHash`:
 *   authority is in-process R27 -> R28 provenance, never a token.
 *
 * The SD7 constants below are STATED, not imported: this namespace imports
 * nothing from `sd7/`. The unit suite asserts they equal the canonical SD7
 * contract, and the R22 baseline reader asserts the committed R22 census
 * states the same values.
 */
import { a2AggregateConsistencyProofForGraphDeltaBatch } from './a2Consistency.js';
import {
  documentSourceDeltaSlotForDeltaGraph,
  isA3DevTrainSd7GraphDeltaBatchV2,
} from './devTrain.js';
import { refuseV2Graph } from './refusal.js';
import {
  R28_GRAPH_SPLIT,
  type A3DevTrainCanonicalSd7GraphCoverageExpansionV2,
  type A3DevTrainSd7GraphDeltaBatchV2,
  type R22HistoricalGraphBaseline,
} from './types.js';

export const R28_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R28_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1';

/** The canonical SD7 constants R22 measured under, stated for the record. */
export const R28_STATED_CANONICAL_SD7 = Object.freeze({
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

function requireMintedGraphBatch(batch: unknown): A3DevTrainSd7GraphDeltaBatchV2 {
  if (!isA3DevTrainSd7GraphDeltaBatchV2(batch)) {
    refuseV2Graph(
      'R28_NOT_A_MINTED_DELTA_GRAPH_BATCH',
      'the input was not a DEV_TRAIN SD7 graph delta batch minted by R28',
    );
  }
  return batch;
}

/** Delta aggregates, derived per slot from the minted graphs. Identities never leave memory. */
function deltaAggregatesOf(batch: A3DevTrainSd7GraphDeltaBatchV2): DeltaGraphAggregates {
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
    if (documentSourceDeltaSlotForDeltaGraph(deltaGraph) === undefined) {
      refuseV2Graph(
        'R28_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta graph does not trace to an R27 slot',
      );
    }
    const { graph } = deltaGraph;
    totals.documents += graph.documents.length;
    totals.measurableDocuments += graph.measurableIndices.length;
    totals.shortTextUnresolved += graph.shortTextUnresolvedCount;
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
 * §31. Historical R22 baseline + minted delta = coverage. The historical graph
 * count must be exactly R26's unchanged canonical coverage, and the combined
 * count exactly the V2 DEV_TRAIN coverage.
 */
export function deriveCanonicalSd7GraphCoverageExpansionV2(
  graphDeltaBatch: A3DevTrainSd7GraphDeltaBatchV2,
  historical: R22HistoricalGraphBaseline,
): A3DevTrainCanonicalSd7GraphCoverageExpansionV2 {
  const batch = requireMintedGraphBatch(graphDeltaBatch);
  const delta = deltaAggregatesOf(batch);
  const evidenceCoverage = batch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;
  if (
    historical.slotGraphs !== evidenceCoverage.unchangedCanonicalCoverageCount ||
    delta.slots !== evidenceCoverage.newlyBoundDeltaCount ||
    historical.slotGraphs + delta.slots !== evidenceCoverage.v2ReadyAuthorityCount
  ) {
    refuseV2Graph(
      'R28_DOCUMENT_SOURCE_COVERAGE_NOT_ADDITIVE',
      'historical R22 graphs plus delta graphs do not equal the V2 DEV_TRAIN authority coverage',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_SD7_GRAPH_COVERAGE_EXPANSION_V2' as const,
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

export interface R28CensusProvenance {
  /** The exact R27 tip R28 was cut from. */
  readonly r27Tip: string;
  /** The R28 implementation commit the real delta measurement executed at. */
  readonly implementationCommit: string;
}

/**
 * Derives the public census from a MINTED graph delta batch whose A2
 * aggregate consistency has already been proved in this process; anything
 * else refuses.
 */
export function deriveR28PublicIncrementalSd7GraphCensus(
  graphDeltaBatch: A3DevTrainSd7GraphDeltaBatchV2,
  historical: R22HistoricalGraphBaseline,
  provenance: R28CensusProvenance,
) {
  const batch = requireMintedGraphBatch(graphDeltaBatch);
  const delta = deltaAggregatesOf(batch);
  const coverage = deriveCanonicalSd7GraphCoverageExpansionV2(batch, historical);
  const a2 = a2AggregateConsistencyProofForGraphDeltaBatch(batch);
  if (a2 === undefined) {
    refuseV2Graph(
      'R28_A2_ADJUDICATION_INPUT_INVALID',
      'the committed A2 SD7 aggregate consistency was not proved for this batch',
    );
  }
  const access = batch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;

  return Object.freeze({
    record: R28_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SD7_GRAPH_CENSUS' as const,
    generationId: batch.governanceSnapshotV2.resolution.summary.generationId,
    split: R28_GRAPH_SPLIT,
    r27Tip: provenance.r27Tip,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    deltaGraph: Object.freeze({
      deltaGraphSlots: delta.slots,
      deltaDocuments: delta.documents,
      deltaMeasurableDocuments: delta.measurableDocuments,
      deltaShortTextUnresolved: delta.shortTextUnresolved,
      deltaComparedPairs: delta.comparedPairs,
      deltaNearDuplicateEdges: delta.nearDuplicateEdges,
      deltaDocumentsInAtLeastOneNearDuplicateEdge: delta.documentsInAtLeastOneEdge,
    }),
    canonicalSd7: R28_STATED_CANONICAL_SD7,
    coverage: Object.freeze({
      historicalCanonicalR22GraphSlots: coverage.historicalGraphSlots,
      newR28GraphSlots: coverage.deltaGraphSlots,
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
    }),
    a2AggregateConsistency: Object.freeze({
      checkedAfterIndependentMeasurement: true as const,
      nearDuplicateEdgesAgree: a2.nearDuplicateEdgesAgree,
      shortTextUnresolvedAgree: a2.shortTextUnresolvedAgree,
      sealedDetailOpened: a2.sealedDetailOpened,
      a2EdgeIdentitiesRead: a2.a2EdgeIdentitiesRead,
      a2DocumentDigestsRead: a2.a2DocumentDigestsRead,
      a2SurvivorCountUsedAsAuthority: a2.a2SurvivorCountUsedAsAuthority,
    }),
    semantics: Object.freeze({
      historicalR22GraphsRemeasured: false as const,
      historicalR22GraphObjectsReminted: false as const,
      deltaOnlyGraphMeasurement: true as const,
      canonicalR22PureMeasurementUsed: true as const,
      canonicalR22CallsPerDeltaSlot: 1 as const,
      textReadOnlyThroughR27Capability: true as const,
      textPersistedByR28: false as const,
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
      r28SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalR26: true as const,
      legacyAuthorityEvidenceQueries: access.legacyAuthorityEvidenceRequests,
      deltaAuthorityEvidenceQueries: access.deltaAuthorityEvidenceRequests,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      devConfirmEvidenceReads: 0 as const,
      finalHoldoutEvidenceReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_SIX_SLOT_GRAPH_BATCH',
      'NOT_A_REMEASUREMENT_OF_R22_CANONICAL_HISTORY',
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_DATABASE_EVIDENCE_AUTHORITY',
      'NOT_AN_SD7_SURVIVOR_DECISION',
      'NOT_A_POST_SD7_COUNT',
      'NOT_SET_P',
      'NOT_SET_R_MEMBERSHIP',
      'NOT_A_RANK',
      'NOT_A_CAP',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_SD9',
      'NOT_R29_AUTHORITY',
      'NOT_AN_A5_CORPUS_FREEZE',
    ]),
    identityDisclosure: Object.freeze({
      selectionIndices: false as const,
      organisationIds: false as const,
      echeRowKeys: false as const,
      runIdentifiers: false as const,
      runReferenceDigests: false as const,
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
    }),
  });
}

export type R28PublicIncrementalSd7GraphCensus = ReturnType<
  typeof deriveR28PublicIncrementalSd7GraphCensus
>;

/**
 * PHASE 2B-2D — A3 R22: THE PUBLIC, DERIVED SD7 GRAPH MEASUREMENT CENSUS.
 *
 * IT IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Not acquisition authority, not database-evidence
 *   authority, not SET_P, not SET_R, not a survivor decision, not short-text
 *   authority, not a final corpus and not a freeze. It counts what one
 *   in-process R19 -> R20 -> R21 -> R22 chain measured, so the graphs are
 *   reviewable without anyone needing the documents.
 *
 * AGGREGATES ONLY, AND NO NEW DIGEST
 *
 *   Every field is a count, a frozen SD7 constant, a commit or a boolean. No
 *   selection index, organisation, run, row id, document digest, edge
 *   endpoint, per-edge intersection / union / similarity, per-document token
 *   or shingle count, URL, host, root, title, text or score. No per-slot
 *   breakdown. And no `sd7GraphBatchHash`, `graphAuthorityHash`,
 *   `nearDuplicateCorpusHash` or `graphSnapshotHash`: a digest would be a
 *   reusable token a later slice could accept INSTEAD of re-minting.
 *
 * NO COMPONENT, NO SURVIVOR
 *
 *   `documentsInAtLeastOneNearDuplicateEdge` is the summed size of each
 *   slot's set of edge endpoints. It is not a component count, a clique
 *   count or a survivor bound; none of those is computed in R22.
 */
import {
  NEAR_DUPLICATE_COMPARISON_SCOPE,
  NEAR_DUPLICATE_JACCARD_THRESHOLD_DENOMINATOR,
  NEAR_DUPLICATE_JACCARD_THRESHOLD_NUMERATOR,
  NEAR_DUPLICATE_SHINGLE_SIZE,
  SD7_SHORT_TEXT_UNRESOLVED,
} from '../sd7/sd7Contract.js';
import { R20_EVIDENCE_SPLIT_V1 } from '../a3evidence/types.js';
import { documentSourceAssemblyForSlotGraph, isA3DevTrainSd7GraphBatch } from './devTrain.js';
import { refuse } from './refusal.js';
import type { A3DevTrainSd7GraphBatchV1 } from './types.js';

export const R22_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_CENSUS_V1';

export interface R22CensusProvenance {
  readonly r21Tip: string;
  readonly implementationCommit: string;
}

export interface R22PublicGraphMeasurementCensus {
  readonly record: typeof R22_PUBLIC_CENSUS_RECORD_KIND;
  readonly recordKind: 'PUBLIC_AGGREGATE_ONLY_SD7_GRAPH_MEASUREMENT_CENSUS';
  readonly generationId: string;
  readonly split: typeof R20_EVIDENCE_SPLIT_V1;
  readonly registryVersion: string;
  readonly governanceSnapshotCommit: string;
  readonly r21Tip: string;
  readonly implementationCommit: string;
  readonly thisFileAuthorises: readonly [];
  readonly measurement: {
    readonly r21SlotAssemblyCount: number;
    readonly slotGraphCount: number;
    readonly exactDocumentCount: number;
    readonly measurableDocumentCount: number;
    readonly shortTextUnresolvedCount: number;
    readonly comparedPairCount: number;
    readonly nearDuplicateEdgeCount: number;
    readonly documentsInAtLeastOneNearDuplicateEdge: number;
    readonly zeroEdgeSlotCount: number;
    readonly slotsWithShortTextCount: number;
  };
  readonly canonicalSd7: {
    readonly shingleSizeTokens: typeof NEAR_DUPLICATE_SHINGLE_SIZE;
    readonly jaccardThresholdNumerator: typeof NEAR_DUPLICATE_JACCARD_THRESHOLD_NUMERATOR;
    readonly jaccardThresholdDenominator: typeof NEAR_DUPLICATE_JACCARD_THRESHOLD_DENOMINATOR;
    readonly thresholdComparison: 'AT_OR_ABOVE';
    readonly thresholdPredicate: 'INTEGER_INTERSECTION_TIMES_DENOMINATOR_GE_UNION_TIMES_NUMERATOR';
    readonly comparisonScope: typeof NEAR_DUPLICATE_COMPARISON_SCOPE;
    readonly shortTextStatus: typeof SD7_SHORT_TEXT_UNRESOLVED;
  };
  readonly semantics: {
    readonly canonicalMeasureNearDuplicateGraphUsed: true;
    readonly canonicalGraphCallsPerSlot: 1;
    readonly exactDedupeRecomputed: false;
    readonly graphScopePerSlotOnly: true;
    readonly crossOrganisationPairsMeasured: false;
    readonly textReadOnlyThroughR21Lookup: true;
    readonly textTransformedOutsideCanonicalSd7: false;
    readonly textPersistedByR22: false;
    readonly textLoggedByR22: false;
    readonly floatingPointThresholdDecision: false;
    readonly componentsComputed: false;
    readonly sampleSpecificRankingUsed: false;
    readonly survivorSelectionPerformed: false;
    readonly shortTextMembershipResolved: false;
    readonly setPRanked: false;
    readonly setRRanked: false;
    readonly setPMembershipSelected: false;
    readonly setRMembershipSelected: false;
    readonly sd9Evaluated: false;
  };
  readonly access: {
    readonly r22SqlStatements: 0;
    readonly databaseAccessOnlyThroughCanonicalR20: true;
    readonly databaseWrites: 0;
    readonly institutionNetworkRequests: 0;
    readonly sealedRootReads: 0;
    readonly nonDevTrainEvidenceReads: 0;
  };
  readonly whatThisIsNot: readonly string[];
  readonly identityDisclosure: {
    readonly selectionIndices: false;
    readonly reservePositions: false;
    readonly organisationIds: false;
    readonly echeRowKeys: false;
    readonly runIdentifiers: false;
    readonly runReferenceDigests: false;
    readonly rowIdentifiers: false;
    readonly documentDigests: false;
    readonly edgeEndpoints: false;
    readonly perEdgeMeasurements: false;
    readonly perDocumentTokenOrShingleCounts: false;
    readonly perSlotBreakdown: false;
    readonly urlsOrHosts: false;
    readonly rootIdentifiers: false;
    readonly titlesHeadingsOrText: false;
    readonly individualScores: false;
    readonly candidateSignals: false;
    readonly sealedFilenames: false;
    readonly gatedSplitData: false;
  };
}

/**
 * Derives the census from a MINTED graph batch. Anything else refuses: a
 * census over hand-measured graphs would report numbers nothing proved.
 */
export function deriveR22PublicGraphMeasurementCensus(
  batch: A3DevTrainSd7GraphBatchV1,
  provenance: R22CensusProvenance,
): R22PublicGraphMeasurementCensus {
  if (!isA3DevTrainSd7GraphBatch(batch)) {
    refuse(
      'R22_BATCH_COMPOSITION_INVALID',
      'the census input was not a minted DEV_TRAIN SD7 graph batch',
    );
  }

  let exactDocumentCount = 0;
  let measurableDocumentCount = 0;
  let shortTextUnresolvedCount = 0;
  let comparedPairCount = 0;
  let nearDuplicateEdgeCount = 0;
  let documentsInAtLeastOneNearDuplicateEdge = 0;
  let zeroEdgeSlotCount = 0;
  let slotsWithShortTextCount = 0;

  for (const slotGraph of batch.items) {
    if (documentSourceAssemblyForSlotGraph(slotGraph) === undefined) {
      refuse('R22_BATCH_COMPOSITION_INVALID', 'a slot graph does not trace to an R21 slot');
    }
    const { graph } = slotGraph;
    exactDocumentCount += graph.documents.length;
    measurableDocumentCount += graph.measurableIndices.length;
    shortTextUnresolvedCount += graph.shortTextUnresolvedCount;
    comparedPairCount += graph.comparedPairCount;
    nearDuplicateEdgeCount += graph.edges.length;
    const endpoints = new Set<number>();
    for (const edge of graph.edges) {
      endpoints.add(edge.aIndex);
      endpoints.add(edge.bIndex);
    }
    documentsInAtLeastOneNearDuplicateEdge += endpoints.size;
    if (graph.edges.length === 0) zeroEdgeSlotCount += 1;
    if (graph.shortTextUnresolvedCount > 0) slotsWithShortTextCount += 1;
  }

  const resolution = batch.governanceSnapshot.resolution;

  return Object.freeze({
    record: R22_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_SD7_GRAPH_MEASUREMENT_CENSUS' as const,
    generationId: resolution.summary.generationId,
    split: R20_EVIDENCE_SPLIT_V1,
    registryVersion: resolution.registryVersion,
    governanceSnapshotCommit: resolution.governanceBaseCommit,
    r21Tip: provenance.r21Tip,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    measurement: Object.freeze({
      r21SlotAssemblyCount: batch.items.length,
      slotGraphCount: batch.items.length,
      exactDocumentCount,
      measurableDocumentCount,
      shortTextUnresolvedCount,
      comparedPairCount,
      nearDuplicateEdgeCount,
      documentsInAtLeastOneNearDuplicateEdge,
      zeroEdgeSlotCount,
      slotsWithShortTextCount,
    }),
    canonicalSd7: Object.freeze({
      shingleSizeTokens: NEAR_DUPLICATE_SHINGLE_SIZE,
      jaccardThresholdNumerator: NEAR_DUPLICATE_JACCARD_THRESHOLD_NUMERATOR,
      jaccardThresholdDenominator: NEAR_DUPLICATE_JACCARD_THRESHOLD_DENOMINATOR,
      thresholdComparison: 'AT_OR_ABOVE' as const,
      thresholdPredicate:
        'INTEGER_INTERSECTION_TIMES_DENOMINATOR_GE_UNION_TIMES_NUMERATOR' as const,
      comparisonScope: NEAR_DUPLICATE_COMPARISON_SCOPE,
      shortTextStatus: SD7_SHORT_TEXT_UNRESOLVED,
    }),
    semantics: Object.freeze({
      canonicalMeasureNearDuplicateGraphUsed: true as const,
      canonicalGraphCallsPerSlot: 1 as const,
      exactDedupeRecomputed: false as const,
      graphScopePerSlotOnly: true as const,
      crossOrganisationPairsMeasured: false as const,
      textReadOnlyThroughR21Lookup: true as const,
      textTransformedOutsideCanonicalSd7: false as const,
      textPersistedByR22: false as const,
      textLoggedByR22: false as const,
      floatingPointThresholdDecision: false as const,
      componentsComputed: false as const,
      sampleSpecificRankingUsed: false as const,
      survivorSelectionPerformed: false as const,
      shortTextMembershipResolved: false as const,
      setPRanked: false as const,
      setRRanked: false as const,
      setPMembershipSelected: false as const,
      setRMembershipSelected: false as const,
      sd9Evaluated: false as const,
    }),
    access: Object.freeze({
      r22SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalR20: true as const,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      nonDevTrainEvidenceReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_DATABASE_EVIDENCE_AUTHORITY',
      'NOT_EXACT_DEDUPLICATION',
      'NOT_SET_P',
      'NOT_SET_R_MEMBERSHIP',
      'NOT_A_RANK',
      'NOT_AN_SD7_SURVIVOR_DECISION',
      'NOT_A_CAP',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_SD9',
      'NOT_A_FINAL_CORPUS',
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
      edgeEndpoints: false as const,
      perEdgeMeasurements: false as const,
      perDocumentTokenOrShingleCounts: false as const,
      perSlotBreakdown: false as const,
      urlsOrHosts: false as const,
      rootIdentifiers: false as const,
      titlesHeadingsOrText: false as const,
      individualScores: false as const,
      candidateSignals: false as const,
      sealedFilenames: false as const,
      gatedSplitData: false as const,
    }),
  });
}

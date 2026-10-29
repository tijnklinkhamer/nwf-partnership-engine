/**
 * PHASE 2B-2D — A3 R40: THE COVERAGE EXPANSION AND THE PUBLIC, DERIVED CENSUS.
 *
 * THE COVERAGE EXPANSION IS COUNTS, NOT A TWENTY-SLOT BATCH
 *
 *   Historical document coverage enters as the committed R34 aggregate
 *   baseline (see `history.ts`); delta coverage is derived from the MINTED R40
 *   batch. The sum is an aggregate statement only - nothing is minted for it,
 *   and no historical slot, document, R10 preparation or text lookup is
 *   manufactured. "Slot-local documents" is a SUM of per-slot distinct counts,
 *   never a count of globally unique digests. Graph, sample and readiness
 *   coverage stay at the historical thirteen: R40 does none of that work.
 *
 * THE CENSUS IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Counts, version labels, commits and booleans.
 *   No selection index, reserve position, organisation, eche row key, run,
 *   run reference, row id, document digest, URL, host, root, title, heading,
 *   text, score, rank, signal, sealed filename or per-slot breakdown - and not
 *   which delta slots are Generation-2 reserves. No document, coverage or
 *   text-lookup hash: authority is in-process provenance, never a token a
 *   later slice could accept instead of re-minting.
 */
import { R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1 } from '../a3documents/types.js';
import {
  evidenceDeltaBatchForDocumentSourceDeltaBatchV5,
  evidenceDeltaForDeltaSlotAssemblyV5,
  isA3DevTrainDocumentSourceDeltaBatchV5,
  r21AssemblyCallsForDocumentSourceDeltaBatchV5,
} from './devTrain.js';
import { historicalDocumentCoverageProofForBatch } from './history.js';
import { r39ReproductionProofForBatch } from './r39Drift.js';
import { refuseV5Document } from './refusal.js';
import {
  R40_DOCUMENT_SPLIT,
  type A3DevTrainCanonicalDocumentSourceCoverageExpansionV5,
  type A3DevTrainDocumentSourceDeltaBatchV5,
  type HistoricalV5DocumentCoverageProof,
} from './types.js';

export const R40_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R40_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1';
export const R40_CENSUS_PATH = `docs/evaluation/${R40_PUBLIC_CENSUS_RECORD_KIND}.json`;
export const R40_SUCCESS_TERMINAL =
  'R40_INCREMENTAL_DEV_TRAIN_DOCUMENT_SOURCE_V5_COMPLETE_READY_FOR_INCREMENTAL_SD7_GRAPH_MEASUREMENT';
export const R40_NEXT_OWNER_QUESTION =
  'Should R41 measure canonical SD7 graphs for ONLY the seven new R40 V5 document slots, preserving the thirteen historical R35/R37 graph-and-downstream slots untouched?';

interface DeltaAggregates {
  readonly slots: number;
  readonly sourceRows: number;
  readonly slotLocalDocuments: number;
  readonly exactDuplicateGroups: number;
  readonly exactDuplicateRowsRemoved: number;
  readonly multiSourceDocuments: number;
  readonly textDivergenceGroups: number;
  readonly supportedExtractionRows: number;
  readonly unsupportedExtractionRows: number;
  readonly mixedVersionDocuments: number;
  readonly candidateObservations: number;
  readonly r10Preparations: number;
  readonly r10SourceRows: number;
  readonly r10CandidateObservations: number;
}

function requireMintedBatch(batch: unknown): A3DevTrainDocumentSourceDeltaBatchV5 {
  if (!isA3DevTrainDocumentSourceDeltaBatchV5(batch)) {
    refuseV5Document(
      'R40_NOT_A_MINTED_DELTA_DOCUMENT_SOURCE_BATCH',
      'the input was not a document-source delta batch minted by R40',
    );
  }
  return batch;
}

/** Delta aggregates, derived from the minted batch and its R39 source rows. */
function deltaAggregatesOf(batch: A3DevTrainDocumentSourceDeltaBatchV5): DeltaAggregates {
  const totals = {
    slots: batch.items.length,
    sourceRows: 0,
    slotLocalDocuments: 0,
    exactDuplicateGroups: 0,
    exactDuplicateRowsRemoved: 0,
    multiSourceDocuments: 0,
    textDivergenceGroups: 0,
    supportedExtractionRows: 0,
    unsupportedExtractionRows: 0,
    mixedVersionDocuments: 0,
    candidateObservations: 0,
    r10Preparations: 0,
    r10SourceRows: 0,
    r10CandidateObservations: 0,
  };
  for (const slot of batch.items) {
    totals.sourceRows += slot.exactDuplicate.rowCount;
    totals.slotLocalDocuments += slot.exactDuplicate.distinctDocumentCount;
    totals.exactDuplicateGroups += slot.exactDuplicate.duplicateGroupCount;
    totals.exactDuplicateRowsRemoved += slot.exactDuplicate.duplicateRowsRemoved;
    totals.textDivergenceGroups += slot.exactDuplicate.divergentGroupCount;
    totals.candidateObservations += slot.candidateObservationCount;
    // Extraction support re-derived from the R39 SOURCE ROWS, independently
    // of R21's own refusal gate. The map is created per slot: no digest is
    // compared across slots.
    const evidence = evidenceDeltaForDeltaSlotAssemblyV5(slot);
    if (evidence === undefined) {
      refuseV5Document(
        'R40_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta slot assembly does not trace to an R39 item',
      );
    }
    const versionsByDocument = new Map<string, Set<string>>();
    for (const row of evidence.evidence.pageEvidence) {
      if (row.page.ruleVersion === R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1) {
        totals.supportedExtractionRows += 1;
      } else {
        totals.unsupportedExtractionRows += 1;
      }
      const versions = versionsByDocument.get(row.responseSha256) ?? new Set<string>();
      versions.add(row.page.ruleVersion);
      versionsByDocument.set(row.responseSha256, versions);
    }
    for (const versions of versionsByDocument.values()) {
      if (versions.size > 1) totals.mixedVersionDocuments += 1;
    }
    for (const entry of slot.documents) {
      if (entry.sourceRowCount > 1) totals.multiSourceDocuments += 1;
      totals.r10Preparations += 1;
      totals.r10SourceRows += entry.scorePreparation.sourceRowScores.length;
      for (const row of entry.scorePreparation.sourceRowScores) {
        totals.r10CandidateObservations += row.trackScores.length;
      }
    }
  }
  return Object.freeze(totals);
}

function requireProvedHistory(
  batch: A3DevTrainDocumentSourceDeltaBatchV5,
  historicalProof: unknown,
): HistoricalV5DocumentCoverageProof {
  const evidenceBatch = evidenceDeltaBatchForDocumentSourceDeltaBatchV5(batch);
  const history = historicalDocumentCoverageProofForBatch(evidenceBatch);
  if (evidenceBatch === undefined || history === undefined || history !== historicalProof) {
    refuseV5Document(
      'R40_HISTORICAL_DOCUMENT_COVERAGE_NOT_PROVED_FOR_BATCH',
      'the historical document coverage was not proved against the R39 batch behind this R40 batch',
    );
  }
  return history;
}

/**
 * §31 / §32. Historical R34 baseline + minted delta = coverage. The
 * historical slot count must be exactly R39's unchanged coverage, and the
 * combined slot count exactly the V5 DEV_TRAIN READY coverage.
 */
export function deriveCanonicalDocumentSourceCoverageExpansionV5(
  deltaBatch: A3DevTrainDocumentSourceDeltaBatchV5,
  historicalProof: HistoricalV5DocumentCoverageProof,
): A3DevTrainCanonicalDocumentSourceCoverageExpansionV5 {
  const batch = requireMintedBatch(deltaBatch);
  const historical = requireProvedHistory(batch, historicalProof);
  const evidenceBatch = evidenceDeltaBatchForDocumentSourceDeltaBatchV5(batch)!;
  const evidenceCoverage = evidenceBatch.coverage;
  const delta = deltaAggregatesOf(batch);
  if (
    historical.documentSlotCount !== evidenceCoverage.unchangedCanonicalCoverageCount ||
    delta.slots !== evidenceCoverage.newlyBoundDeltaCount ||
    historical.documentSlotCount + delta.slots !== evidenceCoverage.v5DevTrainReadyCount ||
    historical.r37ReadinessSlotCount !== historical.documentSlotCount
  ) {
    refuseV5Document(
      'R40_EVIDENCE_COVERAGE_NOT_ADDITIVE',
      'historical document slots plus delta slots do not equal the V5 DEV_TRAIN authority coverage',
    );
  }
  const downstream = historical.r37ReadinessSlotCount;
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_DOCUMENT_SOURCE_COVERAGE_EXPANSION_V5' as const,
    historicalDocumentSlotCount: historical.documentSlotCount,
    deltaSlotCount: delta.slots,
    coverageDocumentSlotCount: historical.documentSlotCount + delta.slots,
    v5DevTrainAuthorityCoverageCount: evidenceCoverage.v5DevTrainReadyCount,
    historicalSourceRows: historical.sourceRows,
    deltaSourceRows: delta.sourceRows,
    coverageSourceRows: historical.sourceRows + delta.sourceRows,
    historicalSlotLocalDocuments: historical.slotLocalDocuments,
    deltaSlotLocalDocuments: delta.slotLocalDocuments,
    coverageSlotLocalDocuments: historical.slotLocalDocuments + delta.slotLocalDocuments,
    historicalExactDuplicateGroups: historical.exactDuplicateGroups,
    deltaExactDuplicateGroups: delta.exactDuplicateGroups,
    coverageExactDuplicateGroups: historical.exactDuplicateGroups + delta.exactDuplicateGroups,
    historicalExactDuplicateRowsRemoved: historical.exactDuplicateRowsRemoved,
    deltaExactDuplicateRowsRemoved: delta.exactDuplicateRowsRemoved,
    coverageExactDuplicateRowsRemoved:
      historical.exactDuplicateRowsRemoved + delta.exactDuplicateRowsRemoved,
    historicalMultiSourceDocuments: historical.multiSourceDocuments,
    deltaMultiSourceDocuments: delta.multiSourceDocuments,
    coverageMultiSourceDocuments: historical.multiSourceDocuments + delta.multiSourceDocuments,
    historicalCandidateObservations: historical.candidateObservations,
    deltaCandidateObservations: delta.candidateObservations,
    coverageCandidateObservations: historical.candidateObservations + delta.candidateObservations,
    historicalR10Preparations: historical.r10Preparations,
    deltaR10Preparations: delta.r10Preparations,
    coverageR10Preparations: historical.r10Preparations + delta.r10Preparations,
    historicalR10SourceRows: historical.r10SourceRows,
    deltaR10SourceRows: delta.r10SourceRows,
    coverageR10SourceRows: historical.r10SourceRows + delta.r10SourceRows,
    historicalR10CandidateObservations: historical.r10CandidateObservations,
    deltaR10CandidateObservations: delta.r10CandidateObservations,
    coverageR10CandidateObservations:
      historical.r10CandidateObservations + delta.r10CandidateObservations,
    historicalGraphCoverageCount: downstream,
    historicalSampleCoverageCount: downstream,
    historicalReadinessCoverageCount: downstream,
    graphCoverageAfterR40: downstream,
    sampleCoverageAfterR40: downstream,
    readinessCoverageAfterR40: downstream,
  });
}

export interface R40CensusProvenance {
  /** The exact R39 tip R40 was cut from. */
  readonly r39Tip: string;
  /** The one commit that pinned R39's isolation test to its own range. */
  readonly r39ScopePinCommit: string;
  /** The R40 commit the real reproduction and delta assembly executed at. */
  readonly implementationCommit: string;
}

/** Derives the public census from a MINTED delta batch; anything else refuses. */
export function deriveR40PublicIncrementalDocumentSourceCensus(
  deltaBatch: A3DevTrainDocumentSourceDeltaBatchV5,
  historicalProof: HistoricalV5DocumentCoverageProof,
  provenance: R40CensusProvenance,
) {
  const batch = requireMintedBatch(deltaBatch);
  const historical = requireProvedHistory(batch, historicalProof);
  const evidenceBatch = evidenceDeltaBatchForDocumentSourceDeltaBatchV5(batch)!;
  const reproduction = r39ReproductionProofForBatch(evidenceBatch);
  const r21Calls = r21AssemblyCallsForDocumentSourceDeltaBatchV5(batch);
  if (reproduction === undefined || r21Calls === undefined) {
    refuseV5Document(
      'R40_R39_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the R39 batch behind this R40 batch was not proved to reproduce the committed census',
    );
  }
  const delta = deltaAggregatesOf(batch);
  const coverage = deriveCanonicalDocumentSourceCoverageExpansionV5(batch, historical);
  const evidenceCoverage = evidenceBatch.coverage;

  return Object.freeze({
    record: R40_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS' as const,
    task: 'A3_R40_INCREMENTAL_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_V5' as const,
    ownerDecision: 'AUTHORISE_A3_R40_INCREMENTAL_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_V5' as const,
    split: R40_DOCUMENT_SPLIT,
    r39Tip: provenance.r39Tip,
    r39ScopePinCommit: provenance.r39ScopePinCommit,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    r39Reproduction: Object.freeze({
      committedRecord: reproduction.committedRecord,
      freshInProcessR39BatchConsumed: true as const,
      freshR39CensusEqualsCommitted: reproduction.differingSemanticPathCount === 0,
      comparedTopLevelFieldCount: reproduction.comparedTopLevelFieldCount,
      excludedExecutionProvenanceFields: reproduction.excludedFields,
      differingSemanticPathCount: reproduction.differingSemanticPathCount,
      reproductionProofBoundToExactR39BatchByIdentity: true as const,
      freshR39MatchedRuns: reproduction.matchedRuns,
      freshR39PageEvidenceSourceRows: reproduction.pageEvidenceSourceRows,
      freshR39DistinctResponseDocuments: reproduction.distinctResponseSha256Documents,
      freshR39CandidateRows: reproduction.candidateRows,
      freshR39OldAuthorityQueries: reproduction.legacyAuthorityEvidenceQueries,
      freshR39NewAuthorityQueries: reproduction.deltaAuthorityEvidenceQueries,
      freshGovernance: Object.freeze({
        v4DevTrainReady: evidenceCoverage.v4DevTrainReadyCount,
        v5DevTrainReady: evidenceCoverage.v5DevTrainReadyCount,
        unchanged: evidenceCoverage.unchangedCanonicalCoverageCount,
        new: evidenceCoverage.newlyBoundDeltaCount,
        changed: evidenceCoverage.changedExistingCount,
        retracted: evidenceCoverage.removedCount,
      }),
    }),
    deltaAssembly: Object.freeze({
      deltaSlotAssemblyCount: delta.slots,
      deltaSourceRows: delta.sourceRows,
      deltaSlotLocalDistinctDocuments: delta.slotLocalDocuments,
      deltaExactDuplicateGroups: delta.exactDuplicateGroups,
      deltaExactDuplicateRowsRemoved: delta.exactDuplicateRowsRemoved,
      deltaMultiSourceDocuments: delta.multiSourceDocuments,
      deltaCandidateObservations: delta.candidateObservations,
      agreesWithR39PageRows: delta.sourceRows === reproduction.pageEvidenceSourceRows,
      agreesWithR39DistinctResponseDocuments:
        delta.slotLocalDocuments === reproduction.distinctResponseSha256Documents,
      agreesWithR39CandidateRows: delta.candidateObservations === reproduction.candidateRows,
    }),
    deltaExtractionSupport: Object.freeze({
      supportedExtractionRuleVersion: R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1,
      deltaSupportedExtractionRows: delta.supportedExtractionRows,
      deltaUnsupportedExtractionRows: delta.unsupportedExtractionRows,
      deltaMixedVersionDocuments: delta.mixedVersionDocuments,
      deltaTextDivergenceGroups: delta.textDivergenceGroups,
    }),
    deltaScorePreparation: Object.freeze({
      deltaR10Preparations: delta.r10Preparations,
      deltaR10SourceRowCoverage: delta.r10SourceRows,
      deltaR10CandidateObservationCoverage: delta.r10CandidateObservations,
    }),
    historicalDocumentCoverage: Object.freeze({
      r34Record:
        'PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1' as const,
      r37Record:
        'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1' as const,
      r34HistoricalSlotsBeforeR34: historical.r34HistoricalSlotsBeforeR34,
      r34NewSlots: historical.r34NewSlots,
      r34DocumentSlots: historical.documentSlotCount,
      r37ReadinessSlots: historical.r37ReadinessSlotCount,
      freshR39UnchangedAuthorities: historical.freshR39UnchangedCount,
      historicalDocumentSlotsEqualR37ReadinessEqualFreshR39Unchanged:
        historical.documentSlotCount === historical.r37ReadinessSlotCount &&
        historical.documentSlotCount === historical.freshR39UnchangedCount,
      readFromCommittedAggregateRecordsOnly: true as const,
    }),
    coverage: Object.freeze({
      historicalDocumentSlots: coverage.historicalDocumentSlotCount,
      newR40DocumentSlots: coverage.deltaSlotCount,
      coverageDocumentSlots: coverage.coverageDocumentSlotCount,
      v5DevTrainAuthorityCoverage: coverage.v5DevTrainAuthorityCoverageCount,
      historicalSourceRows: coverage.historicalSourceRows,
      newSourceRows: coverage.deltaSourceRows,
      coverageSourceRows: coverage.coverageSourceRows,
      historicalSlotLocalDocuments: coverage.historicalSlotLocalDocuments,
      newSlotLocalDocuments: coverage.deltaSlotLocalDocuments,
      coverageSlotLocalDocuments: coverage.coverageSlotLocalDocuments,
      historicalExactDuplicateGroups: coverage.historicalExactDuplicateGroups,
      newExactDuplicateGroups: coverage.deltaExactDuplicateGroups,
      coverageExactDuplicateGroups: coverage.coverageExactDuplicateGroups,
      historicalExactDuplicateRowsRemoved: coverage.historicalExactDuplicateRowsRemoved,
      newExactDuplicateRowsRemoved: coverage.deltaExactDuplicateRowsRemoved,
      coverageExactDuplicateRowsRemoved: coverage.coverageExactDuplicateRowsRemoved,
      historicalMultiSourceDocuments: coverage.historicalMultiSourceDocuments,
      newMultiSourceDocuments: coverage.deltaMultiSourceDocuments,
      coverageMultiSourceDocuments: coverage.coverageMultiSourceDocuments,
      historicalCandidateObservations: coverage.historicalCandidateObservations,
      newCandidateObservations: coverage.deltaCandidateObservations,
      coverageCandidateObservations: coverage.coverageCandidateObservations,
      historicalR10Preparations: coverage.historicalR10Preparations,
      newR10Preparations: coverage.deltaR10Preparations,
      coverageR10Preparations: coverage.coverageR10Preparations,
      historicalR10SourceRows: coverage.historicalR10SourceRows,
      newR10SourceRows: coverage.deltaR10SourceRows,
      coverageR10SourceRows: coverage.coverageR10SourceRows,
      historicalR10CandidateObservations: coverage.historicalR10CandidateObservations,
      newR10CandidateObservations: coverage.deltaR10CandidateObservations,
      coverageR10CandidateObservations: coverage.coverageR10CandidateObservations,
      historicalGraphCoverage: coverage.historicalGraphCoverageCount,
      historicalSampleCoverage: coverage.historicalSampleCoverageCount,
      historicalReadinessCoverage: coverage.historicalReadinessCoverageCount,
      graphCoverageAfterR40: coverage.graphCoverageAfterR40,
      sampleCoverageAfterR40: coverage.sampleCoverageAfterR40,
      readinessCoverageAfterR40: coverage.readinessCoverageAfterR40,
      slotLocalDocumentCoverageIsSumOfPerSlotCounts: true as const,
      twentySlotDocumentBatchMinted: false as const,
    }),
    semantics: Object.freeze({
      historicalDocumentSlotsReassembled: false as const,
      historicalDocumentObjectsReminted: false as const,
      deltaOnlyAssembly: true as const,
      canonicalR21PureAssemblerUsed: true as const,
      canonicalR21CallsPerNewSlot: r21Calls / delta.slots,
      canonicalR21AssemblyCalls: r21Calls,
      historicalR21AssemblyCalls: 0 as const,
      r34V4AdapterUsed: false as const,
      generationSpecificDocumentSemantics: false as const,
      crossOrganisationExactDedupePerformed: false as const,
      preGroupingPerformed: false as const,
      textStoredOnDocumentObjects: false as const,
      textTransformedByR40: false as const,
      shortTextClassified: false as const,
      representativeSourceRowSelected: false as const,
      canonicalR10PreparationUsed: true as const,
      privateDocumentTextCapabilityPerNewSlot: true as const,
      allOrNothingMinting: true as const,
      nearDuplicateGraphMeasured: false as const,
      setPRanked: false as const,
      setRRanked: false as const,
      reachableMembershipPerformed: false as const,
      sd9Performed: false as const,
      readinessPerformed: false as const,
      completeCorpusPreflightRun: false as const,
    }),
    access: Object.freeze({
      r40SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalR39Reproduction: true as const,
      upstreamRole: reproduction.transaction.role,
      upstreamDatabase: reproduction.transaction.databaseName,
      upstreamTransactionReadOnly: reproduction.transaction.readOnly,
      upstreamTransactionIsolation: reproduction.transaction.isolationLevel,
      upstreamPoolConnections: reproduction.access.poolConnections,
      upstreamSnapshotTransactions: reproduction.access.snapshotTransactions,
      upstreamSqlStatements: reproduction.access.sqlStatements,
      upstreamNewAuthorityEvidenceLoads: reproduction.access.lowerEvidenceLoads,
      upstreamOldAuthorityEvidenceLoads: reproduction.legacyAuthorityEvidenceQueries,
      upstreamDevConfirmEvidenceReads: reproduction.access.devConfirmIdentityParameterHits,
      upstreamFinalHoldoutEvidenceReads: reproduction.access.finalHoldoutIdentityParameterHits,
      upstreamWrites: reproduction.access.writeStatements,
      upstreamPoolClosedBeforeFirstR21Call: reproduction.upstreamPoolClosedBeforeProof,
      r21CallsWhileUpstreamPoolOpen: 0 as const,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_TWENTY_SLOT_DOCUMENT_BATCH',
      'NOT_A_REASSEMBLY_OF_THE_THIRTEEN_HISTORICAL_DOCUMENT_SLOTS',
      'NOT_DATABASE_EVIDENCE_AUTHORITY',
      'NOT_AN_SD7_NEAR_DUPLICATE_GRAPH',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_SET_P',
      'NOT_SET_R',
      'NOT_REACHABLE_MEMBERSHIP',
      'NOT_READINESS',
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
      rowIdentifiers: false as const,
      pageIdentifiers: false as const,
      documentDigests: false as const,
      urlsOrHosts: false as const,
      rootIdentifiers: false as const,
      titlesHeadingsOrText: false as const,
      scoresRanksOrSignals: false as const,
      sealedFilenames: false as const,
      whichDeltaSlotsAreGeneration2Reserves: false as const,
      perSlotRowOrDocumentCounts: false as const,
      aggregateCountsAndVersionLabelsOnly: true as const,
    }),
    terminalState: R40_SUCCESS_TERMINAL,
    nextOwnerQuestion: R40_NEXT_OWNER_QUESTION,
    immutability: 'append-only. This record is never edited; a correction is a new record',
  });
}

export type R40PublicIncrementalDocumentSourceCensus = ReturnType<
  typeof deriveR40PublicIncrementalDocumentSourceCensus
>;

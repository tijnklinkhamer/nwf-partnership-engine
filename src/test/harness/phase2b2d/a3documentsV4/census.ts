/**
 * PHASE 2B-2D — A3 R34: THE COVERAGE EXPANSION AND THE PUBLIC, DERIVED CENSUS.
 *
 * THE COVERAGE EXPANSION IS COUNTS, NOT A THIRTEEN-SLOT BATCH
 *
 *   Historical R21 + R27 coverage enters as the committed aggregate baseline
 *   (see `r33Drift.ts`); delta coverage is derived from the MINTED R34 batch.
 *   The sum is an aggregate statement only - nothing is minted for it, and no
 *   historical slot, document, R10 preparation or text lookup is
 *   manufactured. "Slot-local documents" is a SUM of per-slot distinct
 *   counts, never a count of globally unique digests: no delta digest is
 *   compared with any other slot's digest, delta or historical.
 *
 * THE CENSUS IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Counts, version labels, commits and booleans.
 *   No selection index, reserve position, organisation, eche row key, run,
 *   run reference, row id, document digest, URL, host, root, title, heading,
 *   text, score, rank, signal, sealed filename or per-slot breakdown. And no
 *   `documentDeltaHash`, `documentCoverageHash`, `assemblyExpansionHash` or
 *   `textLookupHash`: authority is in-process provenance, never a token a
 *   later slice could accept instead of re-minting.
 */
import { R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1 } from '../a3documents/types.js';
import {
  evidenceDeltaForDeltaSlotAssemblyV4,
  isA3DevTrainDocumentSourceDeltaBatchV4,
} from './devTrain.js';
import { r33ReproductionProofForBatch, requireHistoricalBaselineProof } from './r33Drift.js';
import { refuseV4Document } from './refusal.js';
import {
  R34_DOCUMENT_SPLIT,
  type A3DevTrainCanonicalDocumentSourceCoverageExpansionV4,
  type A3DevTrainDocumentSourceDeltaBatchV4,
  type HistoricalDocumentSourceCoverageBaseline,
} from './types.js';

export const R34_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1';

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

function requireMintedBatch(batch: unknown): A3DevTrainDocumentSourceDeltaBatchV4 {
  if (!isA3DevTrainDocumentSourceDeltaBatchV4(batch)) {
    refuseV4Document(
      'R34_NOT_A_MINTED_DELTA_DOCUMENT_SOURCE_BATCH',
      'the input was not a document-source delta batch minted by R34',
    );
  }
  return batch;
}

/** Delta aggregates, derived from the minted batch and its R33 source rows. */
function deltaAggregatesOf(batch: A3DevTrainDocumentSourceDeltaBatchV4): DeltaAggregates {
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
    // Extraction support re-derived from the R33 SOURCE ROWS, independently
    // of the R21 assembler's own refusal gate. The map is created per slot:
    // no digest is compared across slots.
    const evidence = evidenceDeltaForDeltaSlotAssemblyV4(slot);
    if (evidence === undefined) {
      refuseV4Document(
        'R34_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta slot assembly does not trace to an R33 item',
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

/**
 * §14. Historical R21 + R27 baseline + minted delta = coverage. The
 * historical slot count must be exactly R33's historical canonical evidence
 * coverage, and the combined slot count exactly the V4 DEV_TRAIN READY
 * coverage.
 */
export function deriveCanonicalDocumentSourceCoverageExpansionV4(
  deltaBatch: A3DevTrainDocumentSourceDeltaBatchV4,
  historicalBaseline: HistoricalDocumentSourceCoverageBaseline,
): A3DevTrainCanonicalDocumentSourceCoverageExpansionV4 {
  const batch = requireMintedBatch(deltaBatch);
  const historical = requireHistoricalBaselineProof(historicalBaseline);
  const delta = deltaAggregatesOf(batch);
  const evidenceCoverage = batch.evidenceDeltaBatch.coverage;
  if (
    historical.slotCount !== evidenceCoverage.historicalCanonicalCoverageCount ||
    historical.slotCount !== evidenceCoverage.unchangedCanonicalCoverageCount ||
    historical.slotCount !== evidenceCoverage.v3DevTrainReadyCount ||
    delta.slots !== evidenceCoverage.newlyBoundDeltaCount ||
    historical.slotCount + delta.slots !== evidenceCoverage.v4DevTrainReadyCount
  ) {
    refuseV4Document(
      'R34_EVIDENCE_COVERAGE_NOT_ADDITIVE',
      'historical R21 + R27 slots plus delta slots do not equal the V4 DEV_TRAIN authority coverage',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_DOCUMENT_SOURCE_COVERAGE_EXPANSION_V4' as const,
    historicalSlotCount: historical.slotCount,
    deltaSlotCount: delta.slots,
    v4AuthorityCoverageCount: evidenceCoverage.v4DevTrainReadyCount,
    coverageSlotCount: historical.slotCount + delta.slots,
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
  });
}

export interface R34CensusProvenance {
  /** The exact R33 tip R34 was cut from. */
  readonly r33Tip: string;
  /** The one commit that pinned R33's isolation test to its own range. */
  readonly r33ScopePinCommit: string;
  /** The R34 commit the real reproduction and delta assembly executed at. */
  readonly implementationCommit: string;
}

/** Derives the public census from a MINTED delta batch; anything else refuses. */
export function deriveR34PublicIncrementalDocumentSourceCensus(
  deltaBatch: A3DevTrainDocumentSourceDeltaBatchV4,
  historicalBaseline: HistoricalDocumentSourceCoverageBaseline,
  provenance: R34CensusProvenance,
) {
  const batch = requireMintedBatch(deltaBatch);
  const historical = requireHistoricalBaselineProof(historicalBaseline);
  const reproduction = r33ReproductionProofForBatch(batch.evidenceDeltaBatch);
  if (reproduction === undefined) {
    refuseV4Document(
      'R34_R33_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the R33 batch behind this R34 batch was not proved to reproduce the committed census',
    );
  }
  const delta = deltaAggregatesOf(batch);
  const coverage = deriveCanonicalDocumentSourceCoverageExpansionV4(batch, historical);

  return Object.freeze({
    record: R34_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS' as const,
    generationId: batch.governanceSnapshotV4.resolution.summary.generationId,
    split: R34_DOCUMENT_SPLIT,
    r33Tip: provenance.r33Tip,
    r33ScopePinCommit: provenance.r33ScopePinCommit,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    r33Reproduction: Object.freeze({
      freshInProcessR33MintConsumed: true as const,
      freshR33CensusEqualsCommitted: reproduction.differingPaths.length === 0,
      comparedTopLevelFieldCount: reproduction.comparedTopLevelFieldCount,
      excludedExecutionProvenanceFields: reproduction.excludedFields,
    }),
    deltaAssembly: Object.freeze({
      deltaSlotAssemblyCount: delta.slots,
      deltaSourceRows: delta.sourceRows,
      deltaSlotLocalDistinctDocuments: delta.slotLocalDocuments,
      deltaExactDuplicateGroups: delta.exactDuplicateGroups,
      deltaExactDuplicateRowsRemoved: delta.exactDuplicateRowsRemoved,
      deltaMultiSourceDocuments: delta.multiSourceDocuments,
      deltaCandidateObservations: delta.candidateObservations,
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
      r21HistoricalSlots: historical.r21SlotCount,
      r27NewSlots: historical.r27NewSlotCount,
      historicalSlots: historical.slotCount,
      readFromCommittedAggregateRecordsOnly: true as const,
    }),
    coverage: Object.freeze({
      historicalCanonicalSlots: coverage.historicalSlotCount,
      newR34Slots: coverage.deltaSlotCount,
      coverageSlots: coverage.coverageSlotCount,
      v4DevTrainAuthorityCoverage: coverage.v4AuthorityCoverageCount,
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
      slotLocalDocumentCoverageIsSumOfPerSlotCounts: true as const,
      thirteenSlotDocumentBatchMinted: false as const,
    }),
    semantics: Object.freeze({
      historicalSlotsReassembled: false as const,
      historicalDocumentObjectsReminted: false as const,
      deltaOnlyAssembly: true as const,
      canonicalR21PureAssemblerUsed: true as const,
      oneCanonicalR21CallPerNewSlot: true as const,
      crossOrganisationExactDedupePerformed: false as const,
      textStoredOnDocumentObjects: false as const,
      textTransformationPerformedByR34: false as const,
      representativeSourceRowSelected: false as const,
      canonicalR10PreparationUsed: true as const,
      nearDuplicateGraphMeasured: false as const,
      setPRanked: false as const,
      setRRanked: false as const,
    }),
    access: Object.freeze({
      r34SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalR33Reproduction: true as const,
      upstreamReproducedR33OldAuthorityQueries: reproduction.legacyAuthorityEvidenceQueries,
      upstreamReproducedR33DeltaAuthorityQueries: reproduction.deltaAuthorityEvidenceQueries,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      devConfirmEvidenceReads: 0 as const,
      finalHoldoutEvidenceReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_THIRTEEN_SLOT_DOCUMENT_SOURCE_BATCH',
      'NOT_A_REASSEMBLY_OF_R21_OR_R27_CANONICAL_HISTORY',
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_DATABASE_EVIDENCE_AUTHORITY',
      'NOT_AN_SD7_NEAR_DUPLICATE_GRAPH',
      'NOT_SET_P',
      'NOT_SET_R_MEMBERSHIP',
      'NOT_A_RANK',
      'NOT_A_CAP',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_R35_AUTHORITY',
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
      urlsOrHosts: false as const,
      rootIdentifiers: false as const,
      titlesHeadingsOrText: false as const,
      scoresRanksOrSignals: false as const,
      sealedFilenames: false as const,
      perSlotBreakdown: false as const,
    }),
  });
}

export type R34PublicIncrementalDocumentSourceCensus = ReturnType<
  typeof deriveR34PublicIncrementalDocumentSourceCensus
>;

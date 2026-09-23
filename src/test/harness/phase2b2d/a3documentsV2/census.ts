/**
 * PHASE 2B-2D — A3 R27: THE COVERAGE EXPANSION AND THE PUBLIC, DERIVED CENSUS.
 *
 * THE COVERAGE EXPANSION IS COUNTS, NOT A SIX-SLOT BATCH
 *
 *   Historical R21 coverage enters as the committed aggregate baseline (see
 *   `r26Drift.ts`); delta coverage is derived from the MINTED R27 batch. The
 *   sum is an aggregate statement only - nothing is minted for it, and no
 *   historical R21 slot, document, R10 preparation or text lookup is
 *   manufactured. "Slot-local documents" is a SUM of per-slot distinct
 *   counts, never a count of globally unique digests: no delta digest is
 *   compared with any historical one.
 *
 * THE CENSUS IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Counts, version labels, commits and booleans.
 *   No selection index, organisation, eche row key, run, run reference, row
 *   id, document digest, URL, host, root, title, heading, text, score, rank,
 *   signal, sealed filename or per-slot breakdown. And no
 *   `documentDeltaHash`, `documentCoverageHash`, `assemblyExpansionHash` or
 *   `textLookupHash`: authority is in-process provenance, never a token a
 *   later slice could accept instead of re-minting.
 */
import { R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1 } from '../a3documents/types.js';
import {
  evidenceDeltaForDeltaSlotAssembly,
  isA3DevTrainDocumentSourceDeltaBatchV2,
} from './devTrain.js';
import type { R21HistoricalCoverageBaseline } from './r26Drift.js';
import { refuseV2Document } from './refusal.js';
import {
  R27_DOCUMENT_SPLIT,
  type A3DevTrainCanonicalDocumentSourceCoverageExpansionV2,
  type A3DevTrainDocumentSourceDeltaBatchV2,
} from './types.js';

export const R27_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R27_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1';

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

function requireMintedBatch(batch: unknown): A3DevTrainDocumentSourceDeltaBatchV2 {
  if (!isA3DevTrainDocumentSourceDeltaBatchV2(batch)) {
    refuseV2Document(
      'R27_NOT_A_MINTED_DELTA_DOCUMENT_SOURCE_BATCH',
      'the input was not a document-source delta batch minted by R27',
    );
  }
  return batch;
}

/** Delta aggregates, derived from the minted batch and its R26 source rows. */
function deltaAggregatesOf(batch: A3DevTrainDocumentSourceDeltaBatchV2): DeltaAggregates {
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
    // Extraction support re-derived from the R26 SOURCE ROWS, independently
    // of the R21 assembler's own refusal gate.
    const evidence = evidenceDeltaForDeltaSlotAssembly(slot);
    if (evidence === undefined) {
      refuseV2Document(
        'R27_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta slot assembly does not trace to an R26 item',
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
 * §26 / §38-§40. Historical R21 baseline + minted delta = coverage. The
 * historical slot count must be exactly R26's unchanged canonical coverage,
 * and the combined slot count exactly the V2 DEV_TRAIN READY coverage.
 */
export function deriveCanonicalDocumentSourceCoverageExpansionV2(
  deltaBatch: A3DevTrainDocumentSourceDeltaBatchV2,
  historical: R21HistoricalCoverageBaseline,
): A3DevTrainCanonicalDocumentSourceCoverageExpansionV2 {
  const batch = requireMintedBatch(deltaBatch);
  const delta = deltaAggregatesOf(batch);
  const evidenceCoverage = batch.evidenceDeltaBatch.coverage;
  if (
    historical.slotCount !== evidenceCoverage.unchangedCanonicalCoverageCount ||
    delta.slots !== evidenceCoverage.newlyBoundDeltaCount ||
    historical.slotCount + delta.slots !== evidenceCoverage.v2ReadyAuthorityCount
  ) {
    refuseV2Document(
      'R27_EVIDENCE_COVERAGE_NOT_ADDITIVE',
      'historical R21 slots plus delta slots do not equal the V2 DEV_TRAIN authority coverage',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_DOCUMENT_SOURCE_COVERAGE_EXPANSION_V2' as const,
    historicalR21SlotCount: historical.slotCount,
    deltaSlotCount: delta.slots,
    v2AuthorityCoverageCount: evidenceCoverage.v2ReadyAuthorityCount,
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

export interface R27CensusProvenance {
  /** The exact R26 tip R27 was cut from. */
  readonly r26Tip: string;
  /** The R27 implementation commit the real delta assembly executed at. */
  readonly implementationCommit: string;
}

/** Derives the public census from a MINTED delta batch; anything else refuses. */
export function deriveR27PublicIncrementalDocumentSourceCensus(
  deltaBatch: A3DevTrainDocumentSourceDeltaBatchV2,
  historical: R21HistoricalCoverageBaseline,
  provenance: R27CensusProvenance,
) {
  const batch = requireMintedBatch(deltaBatch);
  const delta = deltaAggregatesOf(batch);
  const coverage = deriveCanonicalDocumentSourceCoverageExpansionV2(batch, historical);

  return Object.freeze({
    record: R27_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS' as const,
    generationId: batch.governanceSnapshotV2.resolution.summary.generationId,
    split: R27_DOCUMENT_SPLIT,
    r26Tip: provenance.r26Tip,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
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
    coverage: Object.freeze({
      historicalCanonicalR21Slots: coverage.historicalR21SlotCount,
      newR27Slots: coverage.deltaSlotCount,
      coverageSlots: coverage.coverageSlotCount,
      v2DevTrainAuthorityCoverage: coverage.v2AuthorityCoverageCount,
      historicalSourceRows: coverage.historicalSourceRows,
      newSourceRows: coverage.deltaSourceRows,
      coverageSourceRows: coverage.coverageSourceRows,
      historicalSlotLocalDocuments: coverage.historicalSlotLocalDocuments,
      newSlotLocalDocuments: coverage.deltaSlotLocalDocuments,
      coverageSlotLocalDocuments: coverage.coverageSlotLocalDocuments,
      historicalExactDuplicateGroups: coverage.historicalExactDuplicateGroups,
      coverageExactDuplicateGroups: coverage.coverageExactDuplicateGroups,
      historicalExactDuplicateRowsRemoved: coverage.historicalExactDuplicateRowsRemoved,
      coverageExactDuplicateRowsRemoved: coverage.coverageExactDuplicateRowsRemoved,
      historicalMultiSourceDocuments: coverage.historicalMultiSourceDocuments,
      coverageMultiSourceDocuments: coverage.coverageMultiSourceDocuments,
      historicalCandidateObservations: coverage.historicalCandidateObservations,
      newCandidateObservations: coverage.deltaCandidateObservations,
      coverageCandidateObservations: coverage.coverageCandidateObservations,
      historicalR10Preparations: coverage.historicalR10Preparations,
      newR10Preparations: coverage.deltaR10Preparations,
      coverageR10Preparations: coverage.coverageR10Preparations,
      historicalR10SourceRows: coverage.historicalR10SourceRows,
      coverageR10SourceRows: coverage.coverageR10SourceRows,
      historicalR10CandidateObservations: coverage.historicalR10CandidateObservations,
      coverageR10CandidateObservations: coverage.coverageR10CandidateObservations,
      slotLocalDocumentCoverageIsSumOfPerSlotCounts: true as const,
    }),
    semantics: Object.freeze({
      historicalR21SlotsReassembled: false as const,
      historicalR21DocumentObjectsReminted: false as const,
      deltaOnlyAssembly: true as const,
      canonicalR21PureAssemblerUsed: true as const,
      crossOrganisationExactDedupePerformed: false as const,
      textStoredOnDocumentObjects: false as const,
      textTransformationPerformedByR27: false as const,
      representativeSourceRowSelected: false as const,
      canonicalR10PreparationUsed: true as const,
      nearDuplicateGraphMeasured: false as const,
      setPRanked: false as const,
      setRRanked: false as const,
    }),
    access: Object.freeze({
      r27SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalR26: true as const,
      legacyAuthorityEvidenceQueries:
        batch.evidenceDeltaBatch.coverage.legacyAuthorityEvidenceRequests,
      deltaAuthorityEvidenceQueries:
        batch.evidenceDeltaBatch.coverage.deltaAuthorityEvidenceRequests,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      devConfirmEvidenceReads: 0 as const,
      finalHoldoutEvidenceReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_SIX_SLOT_DOCUMENT_SOURCE_BATCH',
      'NOT_A_REASSEMBLY_OF_R21_CANONICAL_HISTORY',
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_DATABASE_EVIDENCE_AUTHORITY',
      'NOT_AN_SD7_NEAR_DUPLICATE_GRAPH',
      'NOT_SET_P',
      'NOT_SET_R_MEMBERSHIP',
      'NOT_A_RANK',
      'NOT_A_CAP',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_R28_AUTHORITY',
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
      urlsOrHosts: false as const,
      rootIdentifiers: false as const,
      titlesHeadingsOrText: false as const,
      scoresRanksOrSignals: false as const,
      sealedFilenames: false as const,
      perSlotBreakdown: false as const,
    }),
  });
}

export type R27PublicIncrementalDocumentSourceCensus = ReturnType<
  typeof deriveR27PublicIncrementalDocumentSourceCensus
>;

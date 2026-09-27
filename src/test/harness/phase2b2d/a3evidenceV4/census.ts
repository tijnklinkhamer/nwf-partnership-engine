/**
 * PHASE 2B-2D — A3 R33: THE PUBLIC, DERIVED V4 INCREMENTAL-EVIDENCE CENSUS.
 *
 * DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. It counts what one in-process V4 delta binding
 *   proved, plus the pre-read drift and canonical-history proofs, so the
 *   expansion is reviewable without access to the rows.
 *
 * AGGREGATES ONLY, AND NO NEW DIGEST
 *
 *   Counts, version labels, commits and booleans. No selection index, reserve
 *   position, organisation, eche row key, run id, run reference, draw digest,
 *   row id, response digest, URL, host, title, text, score, signal, sealed
 *   filename or per-authority breakdown.
 *
 *   There is deliberately no `evidenceDeltaHash`, `coverageExpansionHash`,
 *   `authorityContinuityHash` or batch hash: authority comes from the R17 V4
 *   mint, R32's continuity proof and the R33 in-process mint, never from a
 *   token a later slice could accept instead of re-minting.
 */
import type { ReadOnlyTransactionProof } from '../a3evidence/database.js';
import { R20_REQUIRED_DATABASE_ROLE } from '../a3evidence/types.js';
import { isA3DevTrainDurableEvidenceDeltaBatchV4 } from './devTrain.js';
import {
  requireDriftProofFor,
  requireHistoricalCoverageProof,
  type GovernanceDriftProofV4,
} from './r32Drift.js';
import { refuseV4Evidence } from './refusal.js';
import {
  R33_EVIDENCE_SPLIT,
  type A3DevTrainDurableEvidenceDeltaBatchV4,
  type CanonicalHistoricalEvidenceCoverage,
} from './types.js';

export const R33_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1';

export interface R33CensusProvenance {
  /** The exact R32 tip R33 was cut from. */
  readonly r32Tip: string;
  /** The one commit that pinned R32's isolation test to its own range. */
  readonly r32ScopePinCommit: string;
  /** The R33 implementation commit the real delta binding executed at. */
  readonly implementationCommit: string;
}

function add(into: Record<string, number>, from: Readonly<Record<string, number>>): void {
  for (const [key, value] of Object.entries(from)) into[key] = (into[key] ?? 0) + value;
}

function sorted(record: Record<string, number>): Readonly<Record<string, number>> {
  return Object.freeze(
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  );
}

/** Derives the census from a MINTED delta batch; anything else refuses. */
export function deriveR33PublicIncrementalEvidenceCensus(
  batch: A3DevTrainDurableEvidenceDeltaBatchV4,
  transactionProof: ReadOnlyTransactionProof,
  driftProof: GovernanceDriftProofV4,
  historyProof: CanonicalHistoricalEvidenceCoverage,
  provenance: R33CensusProvenance,
) {
  if (!isA3DevTrainDurableEvidenceDeltaBatchV4(batch)) {
    refuseV4Evidence(
      'R33_NOT_A_MINTED_DELTA_BATCH',
      'the census input was not a minted delta batch',
    );
  }
  const v4 = batch.governanceSnapshotV4;
  const v3 = batch.continuityBaseV3;
  const drift = requireDriftProofFor(driftProof, v3, v4);
  const history = requireHistoricalCoverageProof(historyProof);

  const acquisitionPolicyVersionCounts: Record<string, number> = {};
  const pageExtractionRuleVersionCounts: Record<string, number> = {};
  const candidateSignalRuleVersionCounts: Record<string, number> = {};
  const candidateTrackCounts: Record<string, number> = {};
  const totals = {
    fetchObservationRows: 0,
    pageEvidenceSourceRows: 0,
    distinctResponseSha256Documents: 0,
    candidateRows: 0,
    duplicateDocumentSourceRows: 0,
    multipleExtractionVersionDocuments: 0,
    identityContaminationCount: 0,
    fetchPolicyMismatchCount: 0,
    relationalOrphanCount: 0,
    sameDocumentSameExtractionConflictCount: 0,
    candidateTrackPairViolationCount: 0,
  };
  let candidateRowsEqualTwicePagesRuns = 0;
  for (const item of batch.items) {
    const { integrity, run } = item.evidence;
    acquisitionPolicyVersionCounts[run.fetchPolicyVersion] =
      (acquisitionPolicyVersionCounts[run.fetchPolicyVersion] ?? 0) + 1;
    add(pageExtractionRuleVersionCounts, integrity.extractionRuleVersionCounts);
    add(candidateSignalRuleVersionCounts, integrity.signalRuleVersionCounts);
    add(candidateTrackCounts, integrity.candidateTrackCounts);
    totals.fetchObservationRows += integrity.fetchObservationCount;
    totals.pageEvidenceSourceRows += integrity.pageEvidenceSourceRowCount;
    totals.distinctResponseSha256Documents += integrity.distinctResponseSha256Count;
    totals.candidateRows += integrity.candidateRowCount;
    totals.duplicateDocumentSourceRows += integrity.duplicateDocumentSourceRowCount;
    totals.multipleExtractionVersionDocuments += integrity.multipleExtractionVersionDocumentCount;
    totals.identityContaminationCount += integrity.identityContaminationCount;
    totals.fetchPolicyMismatchCount += integrity.fetchPolicyMismatchCount;
    totals.relationalOrphanCount += integrity.relationalOrphanCount;
    totals.sameDocumentSameExtractionConflictCount +=
      integrity.sameDocumentSameExtractionConflictCount;
    totals.candidateTrackPairViolationCount += integrity.candidateTrackPairViolationCount;
    if (integrity.candidateRowCount === 2 * integrity.pageEvidenceSourceRowCount) {
      candidateRowsEqualTwicePagesRuns += 1;
    }
  }

  const coverage = batch.coverage;

  return Object.freeze({
    record: R33_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_EVIDENCE_CENSUS' as const,
    generationId: v4.resolution.summary.generationId,
    split: R33_EVIDENCE_SPLIT,
    r32Tip: provenance.r32Tip,
    r32ScopePinCommit: provenance.r32ScopePinCommit,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    governanceDelta: Object.freeze({
      registryV3Version: v3.registryVersion,
      registryV3CheckpointCommit: v3.checkpointCommit,
      registryV4Version: v4.registryVersion,
      registryV4CheckpointCommit: v4.checkpointCommit,
      v3ReadyTotal: drift.v3ReadyTotal,
      v4ReadyTotal: drift.v4ReadyTotal,
      v4UnsuccessfulCurrentOccupants: drift.v4UnsuccessfulCurrentOccupants,
      v4PendingAdjudication: drift.v4PendingAdjudication,
      v4NoTerminalEvidence: drift.v4NoTerminalEvidence,
      v4ReservesConsumed: drift.v4ReservesConsumed,
      v4ReservesUnused: drift.v4ReservesUnused,
      v3DevTrainReadyCount: coverage.v3DevTrainReadyCount,
      v4DevTrainReadyCount: coverage.v4DevTrainReadyCount,
      unchangedAuthorityCount: coverage.unchangedCanonicalCoverageCount,
      newAuthorityCount: coverage.newlyBoundDeltaCount,
      changedExistingAuthorityCount: coverage.changedExistingCount,
      removedAuthorityCount: coverage.removedCount,
      derivedBy: 'R32_deriveDevTrainAuthorityContinuityV3ToV4' as const,
      r32CensusSemanticsUnchanged: drift.r32CensusSemanticsUnchanged,
    }),
    canonicalHistory: Object.freeze({
      r20BoundAuthorityCount: history.r20BoundAuthorityCount,
      r26NewlyBoundAuthorityCount: history.r26NewlyBoundAuthorityCount,
      r26CoverageAfterExpansionCount: history.r26CoverageAfterExpansionCount,
      r30CoverageReadinessSlotCount: history.r30CoverageReadinessSlotCount,
      r31UnchangedV2ToV3DevTrainAuthorityCount: history.r31UnchangedV2ToV3DevTrainAuthorityCount,
      historicalCanonicalCoverageCount: history.historicalCanonicalCoverageCount,
      readFromCommittedAggregateRecordsOnly: true as const,
      historicalAuthoritiesReReadFromDatabase: false as const,
    }),
    coverage: Object.freeze({
      historicalCanonicalCoverageCount: coverage.historicalCanonicalCoverageCount,
      r33NewlyBoundEvidenceCount: coverage.newlyBoundDeltaCount,
      totalAuthorityCoverageAfterExpansion: coverage.coverageAfterExpansionCount,
      v4DevTrainReadyCount: coverage.v4DevTrainReadyCount,
      coverageEqualsV4DevTrainReady:
        coverage.coverageAfterExpansionCount === coverage.v4DevTrainReadyCount,
      thirteenItemEvidenceBatchMinted: false as const,
    }),
    deltaEvidence: Object.freeze({
      matchedRuns: batch.items.length,
      validCompletions: batch.items.length,
      fetchObservationRows: totals.fetchObservationRows,
      pageEvidenceSourceRows: totals.pageEvidenceSourceRows,
      distinctResponseSha256Documents: totals.distinctResponseSha256Documents,
      candidateRows: totals.candidateRows,
      runsWithCandidateRowsEqualToTwicePages: candidateRowsEqualTwicePagesRuns,
      duplicateDocumentSourceRows: totals.duplicateDocumentSourceRows,
      multipleExtractionVersionDocuments: totals.multipleExtractionVersionDocuments,
    }),
    versionBreakdown: Object.freeze({
      acquisitionPolicyVersionCounts: sorted(acquisitionPolicyVersionCounts),
      pageExtractionRuleVersionCounts: sorted(pageExtractionRuleVersionCounts),
      candidateSignalRuleVersionCounts: sorted(candidateSignalRuleVersionCounts),
      candidateTrackCounts: sorted(candidateTrackCounts),
    }),
    integrity: Object.freeze({
      identityContaminationCount: totals.identityContaminationCount,
      fetchPolicyMismatchCount: totals.fetchPolicyMismatchCount,
      relationalOrphanCount: totals.relationalOrphanCount,
      sameDocumentSameExtractionConflictCount: totals.sameDocumentSameExtractionConflictCount,
      candidateTrackPairViolationCount: totals.candidateTrackPairViolationCount,
    }),
    databaseAccess: Object.freeze({
      role: R20_REQUIRED_DATABASE_ROLE,
      database: transactionProof.databaseName,
      transactionReadOnly: transactionProof.readOnly,
      transactionIsolation: transactionProof.isolationLevel,
      readOnlySnapshotTransactions: 1 as const,
      legacyAuthorityEvidenceQueries: coverage.legacyAuthorityEvidenceRequests,
      deltaAuthorityEvidenceQueries: coverage.deltaAuthorityEvidenceRequests,
      devConfirmEvidenceReads: 0 as const,
      finalHoldoutEvidenceReads: 0 as const,
      writes: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
    }),
    semantics: Object.freeze({
      canonicalHistoryReRead: false as const,
      unchangedAuthoritiesRebound: false as const,
      deltaDerivedFromMintedGovernanceSnapshots: true as const,
      deltaProvedAdditiveBeforeDatabaseConnection: true as const,
      newEvidenceMintedOnlyForV4Delta: true as const,
      runReferenceConvention: 'A3_CANONICAL_RUN_REF_V1' as const,
      r20RunMatcherModified: false as const,
      r20LowerEvidenceLayerModified: false as const,
      newerA2GovernanceConsumed: false as const,
      adjudicatedCountCrossCheckPerformed: false as const,
      corpusSelectionPerformed: false as const,
      documentAssemblyPerformed: false as const,
      sd7Performed: false as const,
      sealedEvidenceOpened: false as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_THIRTEEN_ITEM_EVIDENCE_BATCH',
      'NOT_A_REREAD_OF_R20_OR_R26_CANONICAL_EVIDENCE',
      'NOT_A_GOVERNANCE_V5',
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_CORPUS_SAMPLING_AUTHORITY',
      'NOT_A_DOCUMENT_ASSEMBLY_DECISION',
      'NOT_AN_SD7_CORPUS_GRAPH',
      'NOT_SET_P_OR_SET_R_AUTHORITY',
      'NOT_HOLDOUT_SCORING_AUTHORITY',
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
      titlesOrText: false as const,
      scoresOrSignals: false as const,
      sealedFilenames: false as const,
      perAuthorityBreakdown: false as const,
    }),
  });
}

export type R33PublicIncrementalEvidenceCensus = ReturnType<
  typeof deriveR33PublicIncrementalEvidenceCensus
>;

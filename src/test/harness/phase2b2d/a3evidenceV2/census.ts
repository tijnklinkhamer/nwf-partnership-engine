/**
 * PHASE 2B-2D — A3 R26: THE PUBLIC, DERIVED INCREMENTAL-EVIDENCE CENSUS.
 *
 * DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. It counts what one in-process delta binding
 *   proved, so the expansion is reviewable without access to the rows.
 *
 * AGGREGATES ONLY, AND NO NEW DIGEST
 *
 *   Counts, version labels, commits and booleans. No selection index, reserve
 *   position, organisation, eche row key, run id, run reference, draw digest,
 *   row id, response digest, URL, host, title, text, score, signal, sealed
 *   filename or per-authority breakdown. The delta holds ONE authority, so
 *   its counts describe one run - which is exactly why nothing here may name
 *   it.
 *
 *   There is deliberately no `evidenceDeltaHash`, `coverageExpansionHash`,
 *   `authorityContinuityHash` or batch hash: authority comes from the R17 V2
 *   mint, the exact continuity proof and the R26 in-process mint, never from
 *   a token a later slice could accept instead of re-minting.
 */
import type { ReadOnlyTransactionProof } from '../a3evidence/database.js';
import { R20_REQUIRED_DATABASE_ROLE } from '../a3evidence/types.js';
import { isA3DevTrainDurableEvidenceDeltaBatchV2 } from './devTrain.js';
import type { GovernanceDriftProof } from './r25Drift.js';
import { refuseV2Evidence } from './refusal.js';
import { R26_EVIDENCE_SPLIT, type A3DevTrainDurableEvidenceDeltaBatchV2 } from './types.js';

export const R26_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R26_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1';

export interface R26CensusProvenance {
  /** The exact R25 tip R26 was cut from. */
  readonly r25Tip: string;
  /** The R26 implementation commit the real delta binding executed at. */
  readonly implementationCommit: string;
}

function add(into: Record<string, number>, from: Readonly<Record<string, number>>): void {
  for (const [key, value] of Object.entries(from)) into[key] = (into[key] ?? 0) + value;
}

/** Derives the census from a MINTED delta batch; anything else refuses. */
export function deriveR26PublicIncrementalEvidenceCensus(
  batch: A3DevTrainDurableEvidenceDeltaBatchV2,
  transactionProof: ReadOnlyTransactionProof,
  driftProof: GovernanceDriftProof,
  provenance: R26CensusProvenance,
) {
  if (!isA3DevTrainDurableEvidenceDeltaBatchV2(batch)) {
    refuseV2Evidence(
      'R26_NOT_A_MINTED_DELTA_BATCH',
      'the census input was not a minted delta batch',
    );
  }

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
  }

  const coverage = batch.coverage;
  const v2 = batch.governanceSnapshotV2;
  const v1 = batch.continuityBaseV1;

  return Object.freeze({
    record: R26_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_EVIDENCE_CENSUS' as const,
    generationId: v2.resolution.summary.generationId,
    split: R26_EVIDENCE_SPLIT,
    r25Tip: provenance.r25Tip,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    governanceDelta: Object.freeze({
      registryV1Version: v1.registryVersion,
      registryV1GovernanceBaseCommit: v1.governanceBaseCommit,
      registryV2Version: v2.registryVersion,
      registryV2CheckpointCommit: v2.checkpointCommit,
      v1ReadyTotal: driftProof.v1ReadyTotal,
      v2ReadyTotal: driftProof.v2ReadyTotal,
      v1DevTrainReadyCount: coverage.v1CanonicalCoveredAuthorityCount,
      v2DevTrainReadyCount: coverage.v2ReadyAuthorityCount,
      unchangedAuthorityCount: coverage.unchangedCanonicalCoverageCount,
      newAuthorityCount: coverage.newlyBoundDeltaCount,
      changedExistingAuthorityCount: coverage.changedExistingCount,
      removedAuthorityCount: coverage.removedCount,
      r20CanonicalEvidenceCoverageCount: coverage.unchangedCanonicalCoverageCount,
      r26NewlyBoundEvidenceCount: coverage.newlyBoundDeltaCount,
      totalAuthorityCoverageAfterExpansion: coverage.coverageAfterExpansionCount,
      r25CensusSemanticsUnchanged: driftProof.r25CensusSemanticsUnchanged,
    }),
    deltaEvidence: Object.freeze({
      matchedRuns: batch.items.length,
      validCompletions: batch.items.length,
      fetchObservationRows: totals.fetchObservationRows,
      pageEvidenceSourceRows: totals.pageEvidenceSourceRows,
      distinctResponseSha256Documents: totals.distinctResponseSha256Documents,
      candidateRows: totals.candidateRows,
      duplicateDocumentSourceRows: totals.duplicateDocumentSourceRows,
      multipleExtractionVersionDocuments: totals.multipleExtractionVersionDocuments,
    }),
    versionBreakdown: Object.freeze({
      acquisitionPolicyVersionCounts: Object.freeze(acquisitionPolicyVersionCounts),
      pageExtractionRuleVersionCounts: Object.freeze(pageExtractionRuleVersionCounts),
      candidateSignalRuleVersionCounts: Object.freeze(candidateSignalRuleVersionCounts),
      candidateTrackCounts: Object.freeze(candidateTrackCounts),
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
      legacyAuthorityEvidenceQueries: coverage.legacyAuthorityEvidenceRequests,
      deltaAuthorityEvidenceQueries: coverage.deltaAuthorityEvidenceRequests,
      devConfirmEvidenceReads: 0 as const,
      finalHoldoutEvidenceReads: 0 as const,
      writes: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
    }),
    semantics: Object.freeze({
      v1CanonicalEvidenceReRead: false as const,
      existingV1AuthoritiesRebound: false as const,
      globalLedgerRevisionAloneTriggersRebind: false as const,
      slotLocalAuthorityChangeTriggersReview: true as const,
      deltaDerivedFromMintedGovernanceSnapshots: true as const,
      newEvidenceMintedOnlyForV2Delta: true as const,
      corpusSelectionPerformed: false as const,
      sealedEvidenceOpened: false as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_SIX_ITEM_EVIDENCE_BATCH',
      'NOT_A_REREAD_OF_R20_CANONICAL_EVIDENCE',
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

export type R26PublicIncrementalEvidenceCensus = ReturnType<
  typeof deriveR26PublicIncrementalEvidenceCensus
>;

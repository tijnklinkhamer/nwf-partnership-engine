/**
 * PHASE 2B-2D — A3 R39: THE PUBLIC, DERIVED V5 INCREMENTAL-EVIDENCE CENSUS.
 *
 * DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. It counts what one in-process V5 delta binding
 *   proved, plus the pre-read R38B drift and canonical-history proofs, so the
 *   expansion is reviewable without access to the rows. It is derivable ONLY
 *   from a batch the real-run entry point minted, because only that path
 *   observed its own database access; no access count is accepted from a
 *   caller.
 *
 * THE LOWER LAYER'S STATEMENT SHAPE IS CHECKED, NOT ASSUMED
 *
 *   R20's lower reader issues BEGIN, the preflight, six statements per
 *   request and COMMIT. With seven requests that is 45. A different count
 *   means the lower layer did something this slice did not authorise, so the
 *   census refuses rather than recording it as canonical.
 *
 * AGGREGATES ONLY, AND NO NEW DIGEST
 *
 *   Counts, version labels, commits and booleans. No selection index, reserve
 *   position, organisation, eche row key, run id, run reference, draw /
 *   schedule / frame digest, ledger hash, row id, response digest, URL, host,
 *   title, heading, text, score, signal, sealed filename or per-authority
 *   breakdown - and not which new authorities are Generation-2 reserves.
 */
import type { ReadOnlyTransactionProof } from '../a3evidence/database.js';
import { CENSUS_V5_PATH } from '../a3governanceV5/census.js';
import {
  databaseAccessObservationForBatch,
  isA3DevTrainDurableEvidenceDeltaBatchV5,
} from './devTrain.js';
import { requireHistoricalCoverageProofFor } from './history.js';
import { requireDriftProofFor, type GovernanceV5DriftProof } from './r38bDrift.js';
import { refuseV5Evidence } from './refusal.js';
import {
  R39_EVIDENCE_SPLIT,
  type A3DevTrainDurableEvidenceDeltaBatchV5,
  type CanonicalHistoricalV5EvidenceCoverageProof,
} from './types.js';

export const R39_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R39_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1';
export const R39_CENSUS_PATH = `docs/evaluation/${R39_PUBLIC_CENSUS_RECORD_KIND}.json`;
export const R39_SUCCESS_TERMINAL =
  'R39_INCREMENTAL_DEV_TRAIN_DURABLE_EVIDENCE_V5_COMPLETE_READY_FOR_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY';
export const R39_NEXT_OWNER_QUESTION =
  'Should R40 assemble canonical document sources for ONLY the seven new R39 V5 evidence items, preserving the thirteen historical R34/R37 document-and-downstream slots untouched?';

/** R20's lower statement shape: BEGIN + preflight, six per request, COMMIT. */
const R20_FRAME_STATEMENTS = 3;
const R20_STATEMENTS_PER_REQUEST = 6;

export interface R39CensusProvenance {
  /** The exact R38B tip R39 was cut from. */
  readonly r38bTip: string;
  /** The one commit that pinned R38B's isolation test to its own range. */
  readonly r38bScopePinCommit: string;
  /** The R39 implementation commit the real delta binding executed at. */
  readonly implementationCommit: string;
}

function add(into: Record<string, number>, from: Readonly<Record<string, number>>): void {
  for (const [key, value] of Object.entries(from)) into[key] = (into[key] ?? 0) + value;
}

function bump(into: Record<string, number>, key: string): void {
  into[key] = (into[key] ?? 0) + 1;
}

function sorted(record: Record<string, number>): Readonly<Record<string, number>> {
  return Object.freeze(
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  );
}

/** Derives the census from a MINTED, real-run delta batch; anything else refuses. */
export function deriveR39PublicIncrementalEvidenceCensus(
  batch: A3DevTrainDurableEvidenceDeltaBatchV5,
  transactionProof: ReadOnlyTransactionProof,
  driftProof: GovernanceV5DriftProof,
  historyProof: CanonicalHistoricalV5EvidenceCoverageProof,
  provenance: R39CensusProvenance,
) {
  if (!isA3DevTrainDurableEvidenceDeltaBatchV5(batch)) {
    refuseV5Evidence(
      'R39_NOT_A_MINTED_DELTA_BATCH',
      'the census input was not a minted delta batch',
    );
  }
  const access = databaseAccessObservationForBatch(batch);
  if (access === undefined) {
    refuseV5Evidence(
      'R39_DATABASE_ACCESS_UNEXPECTED',
      'the batch was not produced by the real-run entry point, so its access was not observed',
    );
  }
  const v5 = batch.governanceSnapshotV5;
  const v4 = batch.continuityBaseV4;
  const delta = requireDriftProofFor(driftProof, v4, v5);
  const history = requireHistoricalCoverageProofFor(historyProof, v4, delta);
  const coverage = batch.coverage;
  const requests = coverage.deltaAuthorityEvidenceRequests;

  const expectedStatements = R20_FRAME_STATEMENTS + R20_STATEMENTS_PER_REQUEST * requests;
  if (access.sqlStatements !== expectedStatements) {
    refuseV5Evidence(
      'R39_SQL_STATEMENT_COUNT_UNEXPECTED',
      `the run issued ${String(access.sqlStatements)} statements, not the ${String(expectedStatements)} R20's unchanged lower layer issues for ${String(requests)} requests`,
    );
  }
  const accessChecks: [string, number, number][] = [
    ['pool connections', access.poolConnections, 1],
    ['snapshot transactions', access.snapshotTransactions, 1],
    ['lower evidence loads', access.lowerEvidenceLoads, requests],
    ['candidate run lookups', access.candidateRunLookups, requests],
    ['new-authority lookups', access.candidateRunLookupsForNewAuthorities, requests],
    ['unchanged identity parameters', access.unchangedAuthorityIdentityParameterHits, 0],
    ['DEV_CONFIRM identity parameters', access.devConfirmIdentityParameterHits, 0],
    ['FINAL_HOLDOUT identity parameters', access.finalHoldoutIdentityParameterHits, 0],
    ['write statements', access.writeStatements, 0],
  ];
  for (const [name, observed, wanted] of accessChecks) {
    if (observed !== wanted) {
      refuseV5Evidence('R39_DATABASE_ACCESS_UNEXPECTED', `${name}: observed ${String(observed)}`);
    }
  }

  const acquisitionPolicyVersionCounts: Record<string, number> = {};
  const pageExtractionRuleVersionCounts: Record<string, number> = {};
  const candidateSignalRuleVersionCounts: Record<string, number> = {};
  const candidateTrackCounts: Record<string, number> = {};
  const occupantSourceKindCounts: Record<string, number> = {};
  const acquisitionGenerationCounts: Record<string, number> = {};
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
    bump(acquisitionPolicyVersionCounts, run.fetchPolicyVersion);
    bump(occupantSourceKindCounts, item.authority.occupant.source.sourceKind);
    bump(acquisitionGenerationCounts, item.authority.acquisitionGenerationId);
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
  const distinctRuns = new Set(batch.items.map((item) => item.evidence.run.id)).size;
  const observed = driftProof.observed;

  return Object.freeze({
    record: R39_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_EVIDENCE_CENSUS' as const,
    task: 'A3_R39_INCREMENTAL_DEV_TRAIN_DURABLE_EVIDENCE_V5' as const,
    ownerDecision: 'AUTHORISE_A3_R39_INCREMENTAL_DEV_TRAIN_DURABLE_EVIDENCE_V5' as const,
    split: R39_EVIDENCE_SPLIT,
    r38bTip: provenance.r38bTip,
    r38bScopePinCommit: provenance.r38bScopePinCommit,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    r38bReproduction: Object.freeze({
      committedRecord: CENSUS_V5_PATH,
      reproducedBeforeDatabase: true as const,
      freshR38bCensusEqualsCommitted: driftProof.freshR38bCensusEqualsCommitted,
      comparedTopLevelFieldCount: driftProof.comparedTopLevelFieldCount,
      differingSemanticPathCount: driftProof.differingSemanticPathCount,
      excludedFields: driftProof.excludedFields,
      overallContinuity: Object.freeze({
        v4Ready: observed.overallV4Ready,
        v5Ready: observed.overallV5Ready,
        unchanged: observed.overallUnchanged,
        new: observed.overallNew,
        changed: observed.overallChanged,
        retracted: observed.overallRetracted,
      }),
      driftProofBoundToExactSnapshotsAndContinuityByIdentity: true as const,
    }),
    governanceDelta: Object.freeze({
      registryV4Version: observed.v4RegistryVersion,
      registryV4CheckpointCommit: observed.v4CheckpointCommit,
      registryV5Version: observed.v5RegistryVersion,
      registryV5CheckpointCommit: observed.v5CheckpointCommit,
      v4DevTrainReadyCount: coverage.v4DevTrainReadyCount,
      v5DevTrainReadyCount: coverage.v5DevTrainReadyCount,
      unchangedAuthorityCount: coverage.unchangedCanonicalCoverageCount,
      newAuthorityCount: coverage.newlyBoundDeltaCount,
      changedExistingAuthorityCount: coverage.changedExistingCount,
      removedAuthorityCount: coverage.removedCount,
      freshR38bCensusEquality: driftProof.freshR38bCensusEqualsCommitted,
      derivedBy: 'R38B_deriveDevTrainAuthorityContinuityV4ToV5' as const,
      continuityBridge: 'R38A_compareR17WithCrossGenerationAuthorities' as const,
      deltaDerivedFromMintedGovernanceSnapshots: true as const,
      r38aContinuityBridgeModified: false as const,
      r20LowerEvidenceLayerModified: false as const,
      newAuthoritiesByOccupantSourceKind: sorted(occupantSourceKindCounts),
      newAuthoritiesByAcquisitionGeneration: sorted(acquisitionGenerationCounts),
    }),
    canonicalHistory: Object.freeze({
      r33Record: 'PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1' as const,
      r37Record:
        'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1' as const,
      r33HistoricalPriorEvidenceCount: history.r33HistoricalPriorEvidenceCount,
      r33NewlyBoundEvidenceCount: history.r33NewlyBoundEvidenceCount,
      r33EvidenceCoverageCount: history.r33EvidenceCoverageCount,
      r33V4DevTrainReadyCount: history.r33V4DevTrainReadyCount,
      r37ReadinessCoverageCount: history.r37ReadinessCoverageCount,
      freshV4DevTrainReadyCount: history.freshV4DevTrainReadyCount,
      freshV4ToV5UnchangedCount: history.freshV4ToV5UnchangedCount,
      historicalCoverageEqualsFreshV4DevTrainReady:
        history.r33EvidenceCoverageCount === history.freshV4DevTrainReadyCount,
      everyHistoricalAuthorityClassifiedUnchanged:
        history.freshV4ToV5UnchangedCount === history.r33EvidenceCoverageCount,
      readFromCommittedAggregateRecordsOnly: true as const,
      historicalAuthoritiesReRead: false as const,
      historicalEvidenceReminted: false as const,
      historicalDownstreamArtifactsReproduced: false as const,
    }),
    coverage: Object.freeze({
      historicalCanonicalEvidenceCoverageCount: coverage.historicalCanonicalEvidenceCoverageCount,
      historicalCanonicalReadinessCoverageCount: coverage.historicalCanonicalReadinessCoverageCount,
      v4DevTrainReadyCount: coverage.v4DevTrainReadyCount,
      v5DevTrainReadyCount: coverage.v5DevTrainReadyCount,
      unchangedCanonicalCoverageCount: coverage.unchangedCanonicalCoverageCount,
      newlyBoundDeltaCount: coverage.newlyBoundDeltaCount,
      changedExistingCount: coverage.changedExistingCount,
      removedCount: coverage.removedCount,
      evidenceCoverageAfterR39: coverage.coverageAfterExpansionCount,
      evidenceCoverageEqualsV5DevTrainReady:
        coverage.coverageAfterExpansionCount === coverage.v5DevTrainReadyCount,
      downstreamReadinessCoverageAfterR39: coverage.downstreamReadinessCoverageCountAfterR39,
      legacyAuthorityEvidenceRequests: coverage.legacyAuthorityEvidenceRequests,
      deltaAuthorityEvidenceRequests: coverage.deltaAuthorityEvidenceRequests,
      twentyItemEvidenceBatchMinted: false as const,
      newDeltaItemsPassedDocumentDedupeSd7K3SetPSetRReachableMembershipOrSd9: false as const,
    }),
    deltaEvidence: Object.freeze({
      matchedRuns: batch.items.length,
      distinctDurableRuns: distinctRuns,
      allRunsDistinct: distinctRuns === batch.items.length,
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
      scope: 'THE_SEVEN_NEW_V5_DELTA_RUNS_ONLY' as const,
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
      multipleExtractionVersionDocuments: totals.multipleExtractionVersionDocuments,
      everyR20LowerInvariantSatisfiedForEveryMintedItem: true as const,
    }),
    databaseAccess: Object.freeze({
      role: transactionProof.role,
      database: transactionProof.databaseName,
      transactionReadOnly: transactionProof.readOnly,
      transactionIsolation: transactionProof.isolationLevel,
      poolConnections: access.poolConnections,
      readOnlySnapshotTransactions: access.snapshotTransactions,
      sqlStatements: access.sqlStatements,
      expectedSqlStatementsForUnchangedR20LowerLayer: expectedStatements,
      lowerEvidenceLoads: access.lowerEvidenceLoads,
      legacyAuthorityEvidenceQueries: coverage.legacyAuthorityEvidenceRequests,
      deltaAuthorityEvidenceQueries: access.candidateRunLookupsForNewAuthorities,
      unchangedAuthorityIdentityParameterHits: access.unchangedAuthorityIdentityParameterHits,
      devConfirmEvidenceReads: access.devConfirmIdentityParameterHits,
      finalHoldoutEvidenceReads: access.finalHoldoutIdentityParameterHits,
      writes: access.writeStatements,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
    }),
    semantics: Object.freeze({
      governanceReproducedBeforeDatabase: true as const,
      deltaDerivedFromMintedGovernanceSnapshots: true as const,
      deltaProvedAdditiveBeforeDatabase: true as const,
      historicalCoverageProvedBeforeDatabase: true as const,
      unchangedAuthoritiesRebound: false as const,
      newEvidenceMintedOnlyForV5Delta: true as const,
      r20AuthorityAdapterModified: false as const,
      r20AuthorityAdapterUsed: false as const,
      r20LowerEvidenceLayerModified: false as const,
      v5SpecificRequestAdapterUsed: true as const,
      requestAdapterRunsOnlyAfterV5BrandAndDeltaVerification: true as const,
      allSevenLowerReadsCompletedBeforeAnyMint: true as const,
      mintedOnlyAfterSnapshotClosedCleanly: true as const,
      oneShotBindingPerV5SnapshotPerProcess: true as const,
      runReferenceConvention: 'A3_CANONICAL_RUN_REF_V1' as const,
      documentAssemblyPerformed: false as const,
      sd7Performed: false as const,
      samplePreparationPerformed: false as const,
      readinessPerformed: false as const,
      completeCorpusPreflightRun: false as const,
      sealedEvidenceOpened: false as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_TWENTY_ITEM_EVIDENCE_BATCH',
      'NOT_A_REREAD_OF_THE_THIRTEEN_CANONICAL_AUTHORITIES',
      'NOT_A_DOCUMENT_SOURCE_ASSEMBLY',
      'NOT_AN_SD7_GRAPH',
      'NOT_SET_P_OR_SET_R',
      'NOT_REACHABLE_MEMBERSHIP',
      'NOT_A_COMPLETE_CORPUS_PREFLIGHT',
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_A_GOVERNANCE_V6',
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
      perSlotLedgerHashes: false as const,
      rowIdentifiers: false as const,
      documentDigests: false as const,
      urlsOrHosts: false as const,
      titlesHeadingsOrText: false as const,
      scoresOrSignals: false as const,
      sealedFilenames: false as const,
      perAuthorityRowCounts: false as const,
      whichNewAuthoritiesAreGeneration2Reserves: false as const,
      aggregateCountsAndVersionLabelsOnly: true as const,
    }),
    terminalState: R39_SUCCESS_TERMINAL,
    nextOwnerQuestion: R39_NEXT_OWNER_QUESTION,
    immutability: 'append-only. This record is never edited; a correction is a new record',
  });
}

export type R39PublicIncrementalEvidenceCensus = ReturnType<
  typeof deriveR39PublicIncrementalEvidenceCensus
>;

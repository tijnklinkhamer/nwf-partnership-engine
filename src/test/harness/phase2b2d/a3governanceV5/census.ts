/**
 * PHASE 2B-2D — A3 R38B: THE PUBLIC GOVERNANCE AUTHORITY CENSUS, VERSION 5.
 *
 * A PROJECTION, NEVER AN INPUT. It is built from a MINTED V5 snapshot and the
 * real V4 -> V5 continuity, and holds AGGREGATE COUNTS ONLY. It authorises
 * nothing, it is never deserialised into authority, and it publishes no
 * selection index, reserve position, organisation id, eche row key, run id,
 * run-reference digest, schedule / frame / draw digest, ledger entry hash,
 * document identity, host, URL, sealed filename, per-slot generation
 * provenance, per-slot authority result, nor which DEV_TRAIN slots are
 * Generation-2 reserves.
 *
 * Deterministic: no clock, no randomness, no environment. The committed JSON
 * must equal `buildPublicGovernanceCensusV5(...)` of a fresh derivation.
 */
import type { CrossGenerationContinuityDelta } from '../a3crossGenerationSlotAuthority/continuity.js';
import { refuseV5 } from './refusal.js';
import {
  isCommittedGovernanceSnapshotV5,
  type A3CommittedGovernanceSnapshotV5,
} from './snapshotV5.js';
import { TERMINAL_A2_CHECKPOINT_RECORD_V5 } from './registryV5.js';

export const CENSUS_V5_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R38B_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V5.json';
export const R38B_SUCCESS_TERMINAL =
  'R38B_COMMITTED_GOVERNANCE_V5_COMPLETE_NEW_DEV_TRAIN_DELTA_REQUIRES_INCREMENTAL_EVIDENCE_BINDING';
export const R38B_NEXT_OWNER_QUESTION =
  'Should R39 be authorised to perform incremental durable-evidence binding for ONLY the seven genuinely NEW Governance V5 DEV_TRAIN authorities, preserving R37’s thirteen unchanged authorities and all their downstream coverage untouched?';

function continuityAggregate(
  delta: CrossGenerationContinuityDelta,
  v4Ready: number,
  v5Ready: number,
): Readonly<Record<string, number>> {
  return Object.freeze({
    v4Ready,
    v5Ready,
    unchanged: delta.unchanged.length,
    new: delta.newSelectionIndices.length,
    changed: delta.changed.length,
    retracted: delta.retractedSelectionIndices.length,
  });
}

export interface CensusContinuityInputV5 {
  readonly overall: CrossGenerationContinuityDelta;
  readonly overallV4Ready: number;
  readonly devTrain: CrossGenerationContinuityDelta;
  readonly devTrainV4Ready: number;
}

export function buildPublicGovernanceCensusV5(
  snapshot: A3CommittedGovernanceSnapshotV5,
  continuity: CensusContinuityInputV5,
): Readonly<Record<string, unknown>> {
  if (!isCommittedGovernanceSnapshotV5(snapshot)) {
    refuseV5('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V5', 'a census needs a minted V5 snapshot');
  }
  const r = snapshot.resolution;
  const summary = r.summary;
  const devTrainV5Ready = summary.readyBySplit.DEV_TRAIN;
  return Object.freeze({
    record: 'PHASE_2B_2D_A3_R38B_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V5',
    recordKind: 'PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CENSUS',
    task: 'A3_R38B_COMMITTED_GOVERNANCE_V5_RETRY_USING_CROSS_GENERATION_CONTRACT_V1',
    ownerDecision:
      'AUTHORISE_A3_R38B_COMMITTED_GOVERNANCE_V5_RETRY_USING_CROSS_GENERATION_CONTRACT_V1',
    publicSafe: true,
    appendOnly: true,
    isLiveAuthority: false,
    thisFileAuthorises: [],
    thisFileAuthorisesNote:
      'a census is a projection of an in-process minted snapshot; it is never authority and is never deserialised into authority',
    lineage: {
      r38aBase: '80f792de8117c3c91ddb56bbb4dbe6518fde7d8a',
      r38Terminal: '960856bb4e503fcc6961843f88761f66ebffcd27',
      branch: 'feat/phase2b-2d-a3-r38b-committed-governance-v5-retry',
      r38aScopePinTouchedFiles: 1,
      ownerAuthorisedR38RefusalTestScopePin: {
        touchedFiles: 1,
        change:
          'the one working-tree "no Governance V5 namespace" assertion of the R38 refusal test now reads the tree at R38_TERMINAL; nothing widened or weakened',
        authorisedBy:
          'owner decision during R38B, after the conflict between creating a3governanceV5/ and that assertion was reported',
      },
      mergesIntroduced: 0,
      a2MergedRebasedOrCherryPicked: false,
      a2CheckpointIsAncestorOfA3: false,
      a2ReadOnlyThroughCommitAddressedBytes: true,
    },
    preconditions: {
      r38Refusal: {
        path: 'docs/evaluation/PHASE_2B_2D_A3_R38_CROSS_GENERATION_AUTHORITY_ADAPTER_REFUSAL_V1.json',
        commit: '960856bb4e503fcc6961843f88761f66ebffcd27',
        sha256: '7cf59593d06ba77cf29206120496c3e642acccd28a580b1b13b7d5181fc9dec0',
        terminalState: r.preconditions.r38TerminalState,
      },
      r38aContract: {
        path: snapshot.r38aContract.recordPath,
        commit: snapshot.r38aContract.recordCommit,
        terminalState: r.preconditions.r38aTerminalState,
        r17Modified: false,
        governanceV5MintedBefore: false,
        realDevTrainDeltaDerivedBefore: false,
        r39StartedBefore: false,
      },
    },
    contracts: {
      r17: { path: 'src/test/harness/phase2b2d/a3prep/slotAuthority.ts', modified: false },
      r38a: {
        contractVersion: snapshot.r38aContract.contractVersion,
        namespace: snapshot.r38aContract.namespace,
        modified: false,
        resolverCalledUnchanged: 'resolveCrossGenerationSlotAuthorities',
        continuityBridgeCalledUnchanged: 'compareR17WithCrossGenerationAuthorities',
      },
      r26ComparatorUsedForCrossGenerationContinuity: false,
    },
    terminalA2Checkpoint: {
      commit: r.checkpointCommit,
      path: TERMINAL_A2_CHECKPOINT_RECORD_V5.path,
      sha256: TERMINAL_A2_CHECKPOINT_RECORD_V5.sha256,
      bytes: TERMINAL_A2_CHECKPOINT_RECORD_V5.bytes,
      corpusState: 'GENERATION2_ACQUISITION_CORPUS_FROZEN',
      terminalState: 'PHASE_2B_2D_A2_GENERATION2_CORPUS_FREEZE_APPROVED_TERMINAL',
      designation: 'TERMINAL_A2_GOVERNANCE_CHECKPOINT_ELIGIBLE_FOR_SEPARATELY_AUTHORISED_A3_REVIEW',
      freezeBindingClosure: r.freezeBindingClosure,
    },
    registryV5: {
      registryVersion: r.registryVersion,
      checkpointCommit: r.checkpointCommit,
      ownEntryCount: r.composition.ownEntryCount,
      reusedV4EntriesByReference: r.composition.reusedV4EntryCount,
      ownEntriesByParserFamily: r.composition.ownEntriesByParserFamily,
      ownEntriesBySemanticRole: r.composition.ownEntriesBySemanticRole,
      reusedV4EntriesBySemanticRole: r.composition.reusedV4EntriesBySemanticRole,
      commitAddressedLoading: 'one git cat-file --batch over exact <commit>:<path> object names',
      branchTipHeadOrLatestUsed: false,
      directoryEnumerationOrGlobUsed: false,
      workingTreeGovernanceBytesUsed: false,
    },
    structure: {
      totalSlots: r.structure.totalSlots,
      primaryOccupants: r.structure.primaryOccupants,
      generation1ReserveOccupants: r.structure.generation1ReserveOccupants,
      generation2ReserveOccupants: r.structure.generation2ReserveOccupants,
      devTrainSlots: r.structure.devTrainSlots,
      devTrainGeneration2ReserveOccupants: r.structure.devTrainGeneration2ReserveOccupants,
      generation1TerminalLedgerEntries: r.structure.generation1LedgerEntryCount,
      generation2LedgerEntries: r.structure.generation2LedgerEntryCount,
      generation2ReserveScheduleEntries: r.structure.generation2ScheduleEntryCount,
      reserveNamespacesKeptDistinct: true,
      syntheticCombinedLedgerCreated: false,
      derivedBeforeComparison: true,
      matchesAcceptedR38StructuralAudit: r.structure.matchesAcceptedR38StructuralAudit,
    },
    history: {
      generation2WindowsReplayedInExplicitOrder: r.generation2WindowsReplayed.length,
      generation2CadenceAuthorityWindows: r.generation2CadenceWindows,
      generation2AdjudicatedItemsReplayed: r.generation2ItemsReplayed,
      generation1PostClosureWindows: r.generation1PostClosureWindows,
      currentTerminalFacts: r.currentTerminalFactCount,
      historicalTerminalFacts: r.historicalTerminalFactCount,
    },
    carryForward: {
      admissionsGenuinelyAccepted: r.carryForwardAdmissionsAccepted,
      admissionRecordIsTheOwnerApprovedBaseline: true,
      everyAdmissionEqualsItsGeneration1AcquisitionOfRecord: true,
    },
    runReferenceIntegrity: r.runReferenceIntegrity,
    replacementHistoryAudit: r.replacementHistoryAudit,
    provenanceClosure: r.provenanceClosure,
    terminalAuthority: {
      resolvedBy: 'R38A resolveCrossGenerationSlotAuthorities (unchanged), exactly once',
      totalSlots: summary.totalSlots,
      ready: summary.readySlotCount,
      notReady: summary.notReadySlotCount,
      currentUnsuccessful: summary.unsuccessfulCurrentOccupantCount,
      pendingAdjudication: summary.pendingAdjudicationCount,
      noTerminalEvidence: summary.noTerminalEvidenceCount,
      openReplacementObligations: summary.openReplacementObligationCount,
      reserveExhaustedObligations: summary.reserveExhaustedObligationCount,
      readyBySplit: summary.readyBySplit,
      readyByAcquisitionGeneration: summary.readyByAcquisitionGeneration,
      readyByOccupantAndAcquisitionGeneration: summary.readyByOccupantAndAcquisitionGeneration,
      readyByAcquisitionOfRecordKind: summary.readyByAcquisitionOfRecordKind,
      readyCarriedThroughAdmission: summary.readyCarriedThroughAdmission,
      overallState: summary.status,
    },
    freezeCrossCheck: r.freezeCrossCheck,
    generation1TerminalStateCrossCheck: r.generation1TerminalStateCrossCheck,
    snapshot: {
      kind: snapshot.kind,
      minted: true,
      branding:
        'private WeakSet (snapshot) + private WeakMap (cross-generation READY -> V5 snapshot)',
      mintedOnlyAfterTheWholePipelinePassed: true,
      serialisedForm: false,
    },
    continuity: {
      bridge: 'compareR17WithCrossGenerationAuthorities',
      oldSide: 'genuine Governance V4 READY authorities via readyAuthoritiesOfV4',
      newSide: 'genuine Governance V5 READY authorities via readyAuthoritiesOfV5',
      overall: continuityAggregate(
        continuity.overall,
        continuity.overallV4Ready,
        summary.readySlotCount,
      ),
      devTrain: continuityAggregate(
        continuity.devTrain,
        continuity.devTrainV4Ready,
        devTrainV5Ready,
      ),
      resolutionGenerationChangeAloneIsNotAnEvidenceChange: true,
      everyUnchangedDevTrainAuthorityCarriedThroughVerifiedAdmission:
        continuity.devTrain.unchanged.every((result) => result.carriedThroughVerifiedAdmission),
    },
    a3Consequence: {
      r37CoveragePreservedForUnchangedDevTrainAuthorities: continuity.devTrain.unchanged.length,
      r33ToR37Reproduced: false,
      newDevTrainAuthorities: continuity.devTrain.newSelectionIndices.length,
      newDevTrainAuthoritiesWithA3EvidenceCoverage: 0,
      evidenceRequestsCreated: 0,
    },
    noSideEffects: {
      workingDatabaseConnections: 0,
      sqlStatements: 0,
      databaseReads: 0,
      databaseWrites: 0,
      institutionNetworkRequests: 0,
      sealedRootReads: 0,
      devTrainEvidenceLookups: 0,
      devConfirmEvidenceReads: 0,
      finalHoldoutEvidenceReads: 0,
      documentAssembly: 0,
      graphMeasurement: 0,
      samplePreparation: 0,
      a3Sd9OrReadinessDerivation: 0,
      labels: 0,
      classifierOrProviderCalls: 0,
      gitUse: 'commit-addressed object reads only, as governance transport',
    },
    notStarted: {
      r39: true,
      completeCorpusPreflight: true,
      finalSetPOrSetR: true,
      governanceV6: true,
      a5Freeze: true,
    },
    identityDisclosure: {
      selectionIndicesPublished: 0,
      reservePositionsPublished: 0,
      organisationIdsPublished: 0,
      echeRowKeysPublished: 0,
      runIdsOrRunReferenceDigestsPublished: 0,
      scheduleFrameOrDrawEntryDigestsPublished: 0,
      ledgerEntryHashesPublished: 0,
      perSlotProvenanceOrAuthorityPublished: 0,
      aggregateCountsOnly: true,
    },
    terminalState: R38B_SUCCESS_TERMINAL,
    nextOwnerQuestion: R38B_NEXT_OWNER_QUESTION,
    immutability: 'append-only. This record is never edited; a correction is a new record',
  });
}

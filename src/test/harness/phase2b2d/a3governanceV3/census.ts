/**
 * PHASE 2B-2D — A3 R31: THE PUBLIC GOVERNANCE AUTHORITY CENSUS, VERSION 3.
 *
 * Derived only, from two MINTED snapshots - the unchanged Registry V2 snapshot
 * (R25) and the committed Registry V3 snapshot - and from R26's pure DEV_TRAIN
 * comparator over their own READY lists. Every count comes from R17's own
 * summary, from R17's own resolved slots, from the adapter's verified
 * provenance totals, or from that comparator.
 *
 * It carries counts, flags and provenance identity only - no selection index,
 * reserve position, organisation id, eche row key, run reference, draw-entry
 * digest, document hash, URL, domain, sealed filename, label, gold,
 * classifier data or per-slot status. The only split-scoped figures it
 * carries are DEV_TRAIN's, because DEV_TRAIN continuity is the one question
 * R31 answers for the next A3 step. It authorises nothing.
 */
import { readyCountForSplit } from '../a3governanceV2/census.js';
import {
  isCommittedGovernanceSnapshotV2,
  type A3CommittedGovernanceSnapshotV2,
} from '../a3governanceV2/snapshotV2.js';
import type { A3GenerationSlotAuthoritySummary } from '../a3prep/slotAuthority.js';
import {
  deriveDevTrainAuthorityContinuityV2ToV3,
  R31_CONTINUITY_SPLIT,
  requireZeroDevTrainAuthorityDelta,
} from './devTrainContinuity.js';
import { refuseV3 } from './refusal.js';
import {
  isCommittedGovernanceSnapshotV3,
  type A3CommittedGovernanceSnapshotV3,
} from './snapshotV3.js';

export const R31_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R31_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V3';

interface Pair {
  readonly v2: number;
  readonly v3: number;
}

function pair(v2: number, v3: number): Pair {
  return Object.freeze({ v2, v3 });
}

export interface PublicGovernanceAuthorityCensusV3 {
  readonly record: typeof R31_PUBLIC_CENSUS_RECORD_KIND;
  readonly recordKind: 'PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CENSUS';
  readonly generationId: string;
  readonly registryVersion: string;
  readonly pinnedA2GovernanceCheckpointCommit: string;
  readonly thisFileAuthorises: readonly [];
  readonly derivation: {
    readonly derivedNotAsserted: true;
    readonly publicGovernanceOnly: true;
    readonly commitAddressedGovernanceBytes: true;
    readonly workingDatabaseReads: 0;
    readonly sealedRootReads: 0;
    readonly institutionNetworkRequests: 0;
    readonly registryEntryCount: number;
    readonly registryEntriesUnchangedFromV2: number;
    readonly registryEntriesReplacedFromV2: number;
    readonly registryEntriesAddedInV3: number;
    readonly registryBindingsVerified: number;
    readonly v2CompatibleParserSubviewEntryCount: number;
    readonly legacyV1ParserSubviewEntryCount: number;
    readonly replacementLedgerEntryCount: number;
    readonly replacementLedgerEntriesAudited: number;
    readonly transitionLedgerVersionsValidated: number;
    readonly normalisedTransitionEdgeCount: number;
    readonly scopedSupersessionChainCount: number;
    readonly newRecordPlannedWorkItemCount: number;
    readonly newRecordAdjudicatedWorkItemCount: number;
    readonly newRecordNeverStartedWorkItemCount: number;
    readonly currentTerminalFactCount: number;
    readonly currentPendingEvidenceFactCount: number;
    readonly currentFactsWithTransitionBindingCount: number;
    readonly supersededTerminalItemsExcluded: number;
  };
  readonly slotAuthoritySummary: A3GenerationSlotAuthoritySummary;
  readonly v2ToV3Delta: {
    readonly v2RegistryVersion: string;
    readonly v2PinnedA2GovernanceCheckpointCommit: string;
    readonly readyTotal: { readonly v2: number; readonly v3: number; readonly delta: number };
    readonly unsuccessfulCurrentOccupants: Pair;
    readonly pendingAdjudication: Pair;
    readonly noTerminalEvidence: Pair;
    readonly openReplacementObligations: Pair;
    readonly reserveExhaustedObligations: Pair;
    readonly replacementCurrentOccupants: Pair;
    readonly primaryCurrentOccupants: Pair;
    readonly reservesConsumed: Pair;
    readonly reservesUnused: Pair;
  };
  readonly devTrainAuthorityDelta: {
    readonly split: typeof R31_CONTINUITY_SPLIT;
    readonly v2ReadyCount: number;
    readonly v3ReadyCount: number;
    readonly unchangedCount: number;
    readonly newCount: number;
    readonly changedExistingCount: number;
    readonly removedCount: number;
    readonly unchangedWithGlobalLedgerRevisionDifferenceCount: number;
    readonly comparedBy: 'R26_PURE_compareDevTrainReadyAuthorities';
    readonly existingCanonicalCoverageStillComplete: boolean;
  };
  readonly semantics: {
    readonly registryV2Mutated: false;
    readonly registryV3CommitAddressed: true;
    readonly a2MergedIntoA3: false;
    readonly a2ActionPerformed: false;
    readonly r17Reimplemented: false;
    readonly replacementHistoryAuditComplete: boolean;
    readonly unstartedPlanItemPromotedToTerminalFact: false;
    readonly formalSd9ConflatedWithReplacementDisposition: false;
    readonly devTrainAuthorityCountChanged: boolean;
    readonly devTrainAuthoritySemanticsChanged: boolean;
    readonly devTrainEvidenceDeltaExists: boolean;
    readonly databaseReadPerformed: false;
    readonly sealedRootReadPerformed: false;
    readonly r20ToR30Recomputed: false;
  };
  readonly temporalTruth: {
    readonly describesGovernanceCheckpointCommit: string;
    readonly registryV2StillDescribes: string;
    readonly automaticallyUpdatesWhenA2Advances: false;
    readonly laterGovernanceRequiresALaterRegistryAndCensusVersion: true;
  };
  readonly whatThisIsNot: readonly string[];
  readonly identityDisclosure: {
    readonly selectionIndices: false;
    readonly reservePositions: false;
    readonly organisationIds: false;
    readonly echeRowKeys: false;
    readonly runReferences: false;
    readonly drawEntryDigests: false;
    readonly documentHashes: false;
    readonly urlsOrDomains: false;
    readonly sealedFilenames: false;
    readonly perSlotStatus: false;
    readonly labelsGoldOrClassifierData: false;
  };
}

/**
 * Derives the R31 census. It refuses - with R31's own stop markers - unless
 * the V2 -> V3 DEV_TRAIN delta is exactly zero: a census claiming continuity
 * can only be written when continuity holds.
 */
export function derivePublicGovernanceAuthorityCensusV3(
  v3: A3CommittedGovernanceSnapshotV3,
  v2: A3CommittedGovernanceSnapshotV2,
): PublicGovernanceAuthorityCensusV3 {
  if (!isCommittedGovernanceSnapshotV3(v3)) {
    refuseV3('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3', 'the V3 census input was not minted');
  }
  if (!isCommittedGovernanceSnapshotV2(v2)) {
    refuseV3('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3', 'the V2 comparison input was not minted');
  }
  const r3 = v3.resolution;
  const r2 = v2.resolution;
  const s3 = r3.summary;
  const s2 = r2.summary;
  const delta = requireZeroDevTrainAuthorityDelta(deriveDevTrainAuthorityContinuityV2ToV3(v2, v3));
  const dev2 = readyCountForSplit(r2.resolution, R31_CONTINUITY_SPLIT);
  const dev3 = readyCountForSplit(r3.resolution, R31_CONTINUITY_SPLIT);
  const zeroDelta =
    delta.newAuthorities.length === 0 &&
    delta.changedExisting.length === 0 &&
    delta.removed.length === 0;
  return Object.freeze({
    record: R31_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CENSUS' as const,
    generationId: s3.generationId,
    registryVersion: r3.registryVersion,
    pinnedA2GovernanceCheckpointCommit: r3.checkpointCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    derivation: Object.freeze({
      derivedNotAsserted: true as const,
      publicGovernanceOnly: true as const,
      commitAddressedGovernanceBytes: true as const,
      workingDatabaseReads: 0 as const,
      sealedRootReads: 0 as const,
      institutionNetworkRequests: 0 as const,
      registryEntryCount: r3.registryEntryCount,
      registryEntriesUnchangedFromV2: v3.composition.unchangedIds.length,
      registryEntriesReplacedFromV2: v3.composition.replacedIds.length,
      registryEntriesAddedInV3: v3.composition.addedIds.length,
      registryBindingsVerified: r3.verifiedRegistryBindings.length,
      v2CompatibleParserSubviewEntryCount: r3.v2SubviewEntryCount,
      legacyV1ParserSubviewEntryCount: r3.legacySubviewEntryCount,
      replacementLedgerEntryCount: r3.replacementLedgerEntryCount,
      replacementLedgerEntriesAudited: r3.replacementHistoryAudit.auditedEntryCount,
      transitionLedgerVersionsValidated: r3.transitionChain.versions.length,
      normalisedTransitionEdgeCount: r3.transitionChain.edges.length,
      scopedSupersessionChainCount: r3.scopedSupersessions.length,
      newRecordPlannedWorkItemCount: r3.v3FamilyStructure.plannedWorkItemCount,
      newRecordAdjudicatedWorkItemCount: r3.v3FamilyStructure.executedWorkItemCount,
      newRecordNeverStartedWorkItemCount: r3.v3FamilyStructure.unstartedWorkItemCount,
      currentTerminalFactCount: r3.currentTerminalFactCount,
      currentPendingEvidenceFactCount: r3.currentPendingEvidenceFactCount,
      currentFactsWithTransitionBindingCount: r3.currentFactsWithTransitionBindingCount,
      supersededTerminalItemsExcluded: r3.supersededTerminalItemCount,
    }),
    slotAuthoritySummary: s3,
    v2ToV3Delta: Object.freeze({
      v2RegistryVersion: r2.registryVersion,
      v2PinnedA2GovernanceCheckpointCommit: r2.checkpointCommit,
      readyTotal: Object.freeze({
        v2: s2.readySlotCount,
        v3: s3.readySlotCount,
        delta: s3.readySlotCount - s2.readySlotCount,
      }),
      unsuccessfulCurrentOccupants: pair(
        s2.unsuccessfulCurrentOccupantCount,
        s3.unsuccessfulCurrentOccupantCount,
      ),
      pendingAdjudication: pair(s2.pendingAdjudicationCount, s3.pendingAdjudicationCount),
      noTerminalEvidence: pair(s2.noTerminalEvidenceCount, s3.noTerminalEvidenceCount),
      openReplacementObligations: pair(
        s2.openReplacementObligationCount,
        s3.openReplacementObligationCount,
      ),
      reserveExhaustedObligations: pair(
        s2.reserveExhaustedObligationCount,
        s3.reserveExhaustedObligationCount,
      ),
      replacementCurrentOccupants: pair(s2.replacementOccupantCount, s3.replacementOccupantCount),
      primaryCurrentOccupants: pair(s2.primaryOccupantCount, s3.primaryOccupantCount),
      reservesConsumed: pair(s2.reserveConsumedCount, s3.reserveConsumedCount),
      reservesUnused: pair(s2.reserveUnusedCount, s3.reserveUnusedCount),
    }),
    devTrainAuthorityDelta: Object.freeze({
      split: R31_CONTINUITY_SPLIT,
      v2ReadyCount: dev2,
      v3ReadyCount: dev3,
      unchangedCount: delta.unchanged.length,
      newCount: delta.newAuthorities.length,
      changedExistingCount: delta.changedExisting.length,
      removedCount: delta.removed.length,
      unchangedWithGlobalLedgerRevisionDifferenceCount: delta.unchanged.filter(
        (entry) => entry.globalLedgerRevisionDiffers,
      ).length,
      comparedBy: 'R26_PURE_compareDevTrainReadyAuthorities' as const,
      existingCanonicalCoverageStillComplete: zeroDelta && delta.unchanged.length === dev3,
    }),
    semantics: Object.freeze({
      registryV2Mutated: false as const,
      registryV3CommitAddressed: true as const,
      a2MergedIntoA3: false as const,
      a2ActionPerformed: false as const,
      r17Reimplemented: false as const,
      replacementHistoryAuditComplete:
        r3.replacementHistoryAudit.auditedEntryCount === r3.replacementLedgerEntryCount,
      unstartedPlanItemPromotedToTerminalFact: false as const,
      formalSd9ConflatedWithReplacementDisposition: false as const,
      devTrainAuthorityCountChanged: dev2 !== dev3,
      devTrainAuthoritySemanticsChanged: !zeroDelta,
      devTrainEvidenceDeltaExists: !zeroDelta,
      databaseReadPerformed: false as const,
      sealedRootReadPerformed: false as const,
      r20ToR30Recomputed: false as const,
    }),
    temporalTruth: Object.freeze({
      describesGovernanceCheckpointCommit: r3.checkpointCommit,
      registryV2StillDescribes: r2.checkpointCommit,
      automaticallyUpdatesWhenA2Advances: false as const,
      laterGovernanceRequiresALaterRegistryAndCensusVersion: true as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_A_MERGE_OF_A2_INTO_A3',
      'NOT_AN_A2_REPLACEMENT_OR_RESERVE_DECISION',
      'NOT_AN_A2_CONTINUATION_GATE_DECISION',
      'NOT_A3_EVIDENCE_LOADING_AUTHORITY',
      'NOT_SET_P_OR_SET_R_AUTHORITY',
      'NOT_AN_A5_CORPUS_FREEZE',
      'NOT_HOLDOUT_SCORING_AUTHORITY',
    ]),
    identityDisclosure: Object.freeze({
      selectionIndices: false as const,
      reservePositions: false as const,
      organisationIds: false as const,
      echeRowKeys: false as const,
      runReferences: false as const,
      drawEntryDigests: false as const,
      documentHashes: false as const,
      urlsOrDomains: false as const,
      sealedFilenames: false as const,
      perSlotStatus: false as const,
      labelsGoldOrClassifierData: false as const,
    }),
  });
}

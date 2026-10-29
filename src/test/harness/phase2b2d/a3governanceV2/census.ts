/**
 * PHASE 2B-2D — A3 R25: THE PUBLIC GOVERNANCE AUTHORITY CENSUS, VERSION 2.
 *
 * Derived only, from two MINTED snapshots: the unchanged Registry V1 snapshot
 * (R19, loaded from this A3 worktree exactly as before) and the committed
 * Registry V2 snapshot. Every count comes from R17's own summary, from R17's
 * own resolved slots, or from the adapter's verified provenance totals.
 *
 * It carries counts and provenance identity only - no selection index,
 * reserve position, organisation id, eche row key, run reference, draw-entry
 * digest, document hash, URL, domain, sealed filename, label, gold,
 * classifier data or per-slot status. The only split-scoped READY count it
 * carries is DEV_TRAIN's, because that is the delta the next slice consumes.
 * It authorises nothing.
 */
import type { Split } from '../a3prep/contracts.js';
import {
  isA3SlotAcquisitionAuthorityReady,
  type A3GenerationSlotAuthorityResolution,
  type A3GenerationSlotAuthoritySummary,
} from '../a3prep/slotAuthority.js';
import {
  isCommittedGovernanceSnapshot,
  type A3CommittedGovernanceSnapshot,
} from '../a3governance/snapshot.js';
import { refuseV2 } from './refusal.js';
import {
  isCommittedGovernanceSnapshotV2,
  type A3CommittedGovernanceSnapshotV2,
} from './snapshotV2.js';

export const R25_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R25_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V2';

/** READY count for one split, read from R17's own resolved slots. */
export function readyCountForSplit(
  resolution: A3GenerationSlotAuthorityResolution,
  split: Split,
): number {
  return resolution.slots.filter(
    (slot) => slot.split === split && isA3SlotAcquisitionAuthorityReady(slot),
  ).length;
}

export interface PublicGovernanceAuthorityCensusV2 {
  readonly record: typeof R25_PUBLIC_CENSUS_RECORD_KIND;
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
    readonly registryEntriesUnchangedFromV1: number;
    readonly registryEntriesReplacedFromV1: number;
    readonly registryEntriesAddedInV2: number;
    readonly registryBindingsVerified: number;
    readonly legacyV1ParserSubviewEntryCount: number;
    readonly replacementLedgerEntryCount: number;
    readonly transitionLedgerVersionsValidated: number;
    readonly normalisedTransitionEdgeCount: number;
    readonly scopedSupersessionChainCount: number;
    readonly replacementLedgerEntriesAudited: number;
    readonly currentTerminalFactCount: number;
    readonly currentPendingEvidenceFactCount: number;
    readonly currentFactsWithTransitionBindingCount: number;
    readonly supersededTerminalItemsExcluded: number;
  };
  readonly slotAuthoritySummary: A3GenerationSlotAuthoritySummary;
  readonly devTrainReadySlotCount: number;
  readonly v1ToV2Delta: {
    readonly v1RegistryVersion: string;
    readonly v1GovernanceBaseCommit: string;
    readonly readyTotal: { readonly v1: number; readonly v2: number; readonly delta: number };
    readonly devTrainReady: { readonly v1: number; readonly v2: number; readonly delta: number };
    readonly unsuccessfulCurrentOccupants: { readonly v1: number; readonly v2: number };
    readonly noTerminalEvidence: { readonly v1: number; readonly v2: number };
    readonly reservesConsumed: { readonly v1: number; readonly v2: number };
    readonly reservesUnused: { readonly v1: number; readonly v2: number };
  };
  readonly temporalTruth: {
    readonly describesGovernanceCheckpointCommit: string;
    readonly registryV1StillDescribes: string;
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

export function derivePublicGovernanceAuthorityCensusV2(
  v2: A3CommittedGovernanceSnapshotV2,
  v1: A3CommittedGovernanceSnapshot,
): PublicGovernanceAuthorityCensusV2 {
  if (!isCommittedGovernanceSnapshotV2(v2)) {
    refuseV2('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V2', 'the V2 census input was not minted');
  }
  if (!isCommittedGovernanceSnapshot(v1)) {
    refuseV2('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V2', 'the V1 comparison input was not minted');
  }
  const r2 = v2.resolution;
  const r1 = v1.resolution;
  const s2 = r2.summary;
  const s1 = r1.summary;
  const dev2 = readyCountForSplit(r2.resolution, 'DEV_TRAIN');
  const dev1 = readyCountForSplit(r1.resolution, 'DEV_TRAIN');
  return Object.freeze({
    record: R25_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CENSUS' as const,
    generationId: s2.generationId,
    registryVersion: r2.registryVersion,
    pinnedA2GovernanceCheckpointCommit: r2.checkpointCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    derivation: Object.freeze({
      derivedNotAsserted: true as const,
      publicGovernanceOnly: true as const,
      commitAddressedGovernanceBytes: true as const,
      workingDatabaseReads: 0 as const,
      sealedRootReads: 0 as const,
      institutionNetworkRequests: 0 as const,
      registryEntryCount: r2.registryEntryCount,
      registryEntriesUnchangedFromV1: v2.composition.unchangedIds.length,
      registryEntriesReplacedFromV1: v2.composition.replacedIds.length,
      registryEntriesAddedInV2: v2.composition.addedIds.length,
      registryBindingsVerified: r2.verifiedRegistryBindings.length,
      legacyV1ParserSubviewEntryCount: r2.legacySubviewEntryCount,
      replacementLedgerEntryCount: r2.replacementLedgerEntryCount,
      transitionLedgerVersionsValidated: r2.transitionChain.versions.length,
      normalisedTransitionEdgeCount: r2.transitionChain.edges.length,
      scopedSupersessionChainCount: r2.scopedSupersessions.length,
      replacementLedgerEntriesAudited: r2.replacementHistoryAudit.auditedEntryCount,
      currentTerminalFactCount: r2.currentTerminalFactCount,
      currentPendingEvidenceFactCount: r2.currentPendingEvidenceFactCount,
      currentFactsWithTransitionBindingCount: r2.currentFactsWithTransitionBindingCount,
      supersededTerminalItemsExcluded: r2.supersededTerminalItemCount,
    }),
    slotAuthoritySummary: s2,
    devTrainReadySlotCount: dev2,
    v1ToV2Delta: Object.freeze({
      v1RegistryVersion: r1.registryVersion,
      v1GovernanceBaseCommit: r1.governanceBaseCommit,
      readyTotal: Object.freeze({
        v1: s1.readySlotCount,
        v2: s2.readySlotCount,
        delta: s2.readySlotCount - s1.readySlotCount,
      }),
      devTrainReady: Object.freeze({ v1: dev1, v2: dev2, delta: dev2 - dev1 }),
      unsuccessfulCurrentOccupants: Object.freeze({
        v1: s1.unsuccessfulCurrentOccupantCount,
        v2: s2.unsuccessfulCurrentOccupantCount,
      }),
      noTerminalEvidence: Object.freeze({
        v1: s1.noTerminalEvidenceCount,
        v2: s2.noTerminalEvidenceCount,
      }),
      reservesConsumed: Object.freeze({ v1: s1.reserveConsumedCount, v2: s2.reserveConsumedCount }),
      reservesUnused: Object.freeze({ v1: s1.reserveUnusedCount, v2: s2.reserveUnusedCount }),
    }),
    temporalTruth: Object.freeze({
      describesGovernanceCheckpointCommit: r2.checkpointCommit,
      registryV1StillDescribes: r1.governanceBaseCommit,
      automaticallyUpdatesWhenA2Advances: false as const,
      laterGovernanceRequiresALaterRegistryAndCensusVersion: true as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_A_MERGE_OF_A2_INTO_A3',
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

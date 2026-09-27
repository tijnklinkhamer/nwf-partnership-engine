/**
 * PHASE 2B-2D — A3 R32: THE PUBLIC GOVERNANCE AUTHORITY CENSUS, VERSION 4.
 *
 * Derived only, from two MINTED snapshots - the unchanged Registry V3 snapshot
 * (R31) and the committed Registry V4 snapshot - and from R26's pure DEV_TRAIN
 * comparator over their own READY lists. Every count comes from R17's own
 * summary, from R17's own resolved slots, from the adapter's verified
 * provenance totals, or from that comparator.
 *
 * It carries counts, flags and governance-commit identity only - no selection
 * index, reserve position, organisation id, eche row key, run reference,
 * draw-entry digest, document hash, URL, domain, sealed filename, label,
 * gold, classifier data or per-slot status. The only split-scoped figures it
 * carries are DEV_TRAIN's, because the DEV_TRAIN authority delta is the one
 * question R32 answers for the next A3 step. It authorises nothing.
 */
import { readyCountForSplit } from '../a3governanceV2/census.js';
import {
  isCommittedGovernanceSnapshotV3,
  type A3CommittedGovernanceSnapshotV3,
} from '../a3governanceV3/snapshotV3.js';
import type { A3GenerationSlotAuthoritySummary } from '../a3prep/slotAuthority.js';
import {
  deriveDevTrainAuthorityContinuityV3ToV4,
  R32_CONTINUITY_SPLIT,
  requireNoChangedOrRetractedDevTrainAuthority,
} from './devTrainContinuity.js';
import {
  A3_CANONICAL_RUN_REF_V1,
  A3_CANONICAL_RUN_REF_V1_DERIVATION,
  FULL_RUN_REFERENCE_SOURCE,
  MIXED_CONVENTION_BRIDGE,
  PROVENANCE_CLOSURE_BRIDGE,
  RECONCILIATION_CORRECTION,
} from './provenanceClosure.js';
import { refuseV4 } from './refusal.js';
import {
  isCommittedGovernanceSnapshotV4,
  type A3CommittedGovernanceSnapshotV4,
} from './snapshotV4.js';

export const R32_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R32_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V4';

interface Pair {
  readonly v3: number;
  readonly v4: number;
}

function pair(v3: number, v4: number): Pair {
  return Object.freeze({ v3, v4 });
}

export interface PublicGovernanceAuthorityCensusV4 {
  readonly record: typeof R32_PUBLIC_CENSUS_RECORD_KIND;
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
    readonly registryEntriesUnchangedFromV3: number;
    readonly registryEntriesReplacedFromV3: number;
    readonly registryEntriesAddedInV4: number;
    readonly registryBindingsVerified: number;
    readonly v3CompatibleParserSubviewEntryCount: number;
    readonly v2CompatibleParserSubviewEntryCount: number;
    readonly legacyV1ParserSubviewEntryCount: number;
    readonly replacementLedgerEntryCount: number;
    readonly replacementLedgerEntriesAudited: number;
    readonly transitionLedgerVersionsValidated: number;
    readonly normalisedTransitionEdgeCount: number;
    readonly scopedSupersessionChainCount: number;
    readonly currentTerminalFactCount: number;
    readonly currentPendingEvidenceFactCount: number;
    readonly currentFactsWithTransitionBindingCount: number;
    readonly supersededTerminalItemsExcluded: number;
  };
  readonly runReferenceProvenance: {
    readonly canonicalA3RunReference: typeof A3_CANONICAL_RUN_REF_V1;
    readonly canonicalA3RunReferenceDerivation: typeof A3_CANONICAL_RUN_REF_V1_DERIVATION;
    readonly sameAsR20DurableEvidenceMatcher: true;
    readonly r17Modified: false;
    readonly r20RunMatchingModified: false;
    readonly provenanceClosureConsumed: true;
    readonly closureCurrentSlotsExamined: number;
    readonly closureCurrentTerminalEpisodes: number;
    readonly closureAlreadyFullProvenanceCount: number;
    readonly closurePrefixOnlyProvenanceCount: number;
    readonly closureMissingRunReferenceCount: number;
    readonly closureEntryCount: number;
    readonly closureUnresolvedEntryCount: number;
    readonly closureEntriesConsumed: number;
    readonly mixedConventionSlotsListedByClosure: number;
    readonly mixedConventionSlotsConsumed: number;
    readonly prefixEraTerminalFactsParsed: number;
    readonly prefixEraTerminalFactsLeftAsAuditHistoryOnly: number;
    readonly closureAloneMintedAuthority: false;
    readonly prefixCompletedByInference: false;
    readonly currentFactsByProvenance: {
      readonly fullRunReferenceSource: number;
      readonly provenanceClosureBridge: number;
      readonly mixedConventionBridge: number;
      readonly reconciliationCorrection: number;
    };
  };
  readonly nonTerminalItems: {
    readonly executedItemsLeftPendingOrHeldByTheirOwnRecord: number;
    readonly resolvedByOwnerCapabilityReviewResolution: number;
    readonly resolvedBySd9ReconciliationCorrection: number;
    readonly resolvedByCompliantVantageSupersession: number;
    readonly unresolved: 0;
    readonly reconciliationAggregateUsedAsTerminalFact: false;
  };
  readonly slotAuthoritySummary: A3GenerationSlotAuthoritySummary;
  readonly v3ToV4Delta: {
    readonly v3RegistryVersion: string;
    readonly v3PinnedA2GovernanceCheckpointCommit: string;
    readonly readyTotal: { readonly v3: number; readonly v4: number; readonly delta: number };
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
    readonly split: typeof R32_CONTINUITY_SPLIT;
    readonly v3ReadyCount: number;
    readonly v4ReadyCount: number;
    readonly unchangedCount: number;
    readonly newCount: number;
    readonly changedExistingCount: number;
    readonly removedCount: number;
    readonly unchangedWithGlobalLedgerRevisionDifferenceCount: number;
    readonly comparedBy: 'R26_PURE_compareDevTrainReadyAuthorities';
    readonly existingCanonicalCoverageStillCoversEveryUnchangedAuthority: boolean;
    readonly newAuthoritiesRequiringIncrementalEvidenceBinding: number;
  };
  readonly semantics: {
    readonly registryV3Mutated: false;
    readonly registryV4CommitAddressed: true;
    readonly a2MergedIntoA3: false;
    readonly a2ActionPerformed: false;
    readonly r17Reimplemented: false;
    readonly replacementHistoryAuditComplete: boolean;
    readonly unusedAcquisitionAuthorityRegistered: false;
    readonly devTrainAuthorityCountChanged: boolean;
    readonly existingDevTrainAuthoritySemanticsChanged: boolean;
    readonly devTrainEvidenceDeltaExists: boolean;
    readonly databaseReadPerformed: false;
    readonly sealedRootReadPerformed: false;
    readonly r20ToR30Recomputed: false;
  };
  readonly temporalTruth: {
    readonly describesGovernanceCheckpointCommit: string;
    readonly registryV3StillDescribes: string;
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
 * Derives the R32 census. It refuses - with R32's own stop markers - on a
 * changed or retracted existing DEV_TRAIN authority: a census claiming the
 * existing coverage still holds can only be written when it does.
 */
export function derivePublicGovernanceAuthorityCensusV4(
  v4: A3CommittedGovernanceSnapshotV4,
  v3: A3CommittedGovernanceSnapshotV3,
): PublicGovernanceAuthorityCensusV4 {
  if (!isCommittedGovernanceSnapshotV4(v4)) {
    refuseV4('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4', 'the V4 census input was not minted');
  }
  if (!isCommittedGovernanceSnapshotV3(v3)) {
    refuseV4('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4', 'the V3 comparison input was not minted');
  }
  const r4 = v4.resolution;
  const r3 = v3.resolution;
  const s4 = r4.summary;
  const s3 = r3.summary;
  const delta = requireNoChangedOrRetractedDevTrainAuthority(
    deriveDevTrainAuthorityContinuityV3ToV4(v3, v4),
  );
  const dev3 = readyCountForSplit(r3.resolution, R32_CONTINUITY_SPLIT);
  const dev4 = readyCountForSplit(r4.resolution, R32_CONTINUITY_SPLIT);
  const provenanceCount = (kind: string): number =>
    r4.currentFactProvenance.filter((fact) => fact.kind === kind).length;
  const closure = r4.closure;
  return Object.freeze({
    record: R32_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CENSUS' as const,
    generationId: s4.generationId,
    registryVersion: r4.registryVersion,
    pinnedA2GovernanceCheckpointCommit: r4.checkpointCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    derivation: Object.freeze({
      derivedNotAsserted: true as const,
      publicGovernanceOnly: true as const,
      commitAddressedGovernanceBytes: true as const,
      workingDatabaseReads: 0 as const,
      sealedRootReads: 0 as const,
      institutionNetworkRequests: 0 as const,
      registryEntryCount: r4.registryEntryCount,
      registryEntriesUnchangedFromV3: v4.composition.unchangedIds.length,
      registryEntriesReplacedFromV3: v4.composition.replacedIds.length,
      registryEntriesAddedInV4: v4.composition.addedIds.length,
      registryBindingsVerified: r4.verifiedRegistryBindings.length,
      v3CompatibleParserSubviewEntryCount: r4.v3SubviewEntryCount,
      v2CompatibleParserSubviewEntryCount: r4.v2SubviewEntryCount,
      legacyV1ParserSubviewEntryCount: r4.legacySubviewEntryCount,
      replacementLedgerEntryCount: r4.replacementLedgerEntryCount,
      replacementLedgerEntriesAudited: r4.replacementHistoryAudit.auditedEntryCount,
      transitionLedgerVersionsValidated: r4.transitionChain.versions.length,
      normalisedTransitionEdgeCount: r4.transitionChain.edges.length,
      scopedSupersessionChainCount: r4.scopedSupersessions.length,
      currentTerminalFactCount: r4.currentTerminalFactCount,
      currentPendingEvidenceFactCount: r4.currentPendingEvidenceFactCount,
      currentFactsWithTransitionBindingCount: r4.currentFactsWithTransitionBindingCount,
      supersededTerminalItemsExcluded: r4.supersededTerminalItemCount,
    }),
    runReferenceProvenance: Object.freeze({
      canonicalA3RunReference: A3_CANONICAL_RUN_REF_V1,
      canonicalA3RunReferenceDerivation: A3_CANONICAL_RUN_REF_V1_DERIVATION,
      sameAsR20DurableEvidenceMatcher: true as const,
      r17Modified: false as const,
      r20RunMatchingModified: false as const,
      provenanceClosureConsumed: true as const,
      closureCurrentSlotsExamined: closure.census.currentSlotsExamined,
      closureCurrentTerminalEpisodes: closure.census.currentTerminalEpisodes,
      closureAlreadyFullProvenanceCount: closure.census.alreadyFullCommittedProvenanceCount,
      closurePrefixOnlyProvenanceCount: closure.census.prefixOnlyProvenanceCount,
      closureMissingRunReferenceCount: closure.census.missingRunRefProvenanceCount,
      closureEntryCount: closure.entries.length,
      closureUnresolvedEntryCount: closure.census.unresolvedOrRefusedCount,
      closureEntriesConsumed: r4.closureBridgedCount,
      mixedConventionSlotsListedByClosure: closure.mixedConventionSlots.length,
      mixedConventionSlotsConsumed: r4.mixedConventionBridgedCount,
      prefixEraTerminalFactsParsed: r4.prefixEraTerminalItemCount,
      prefixEraTerminalFactsLeftAsAuditHistoryOnly: r4.unbridgedPrefixEraItemCount,
      closureAloneMintedAuthority: false as const,
      prefixCompletedByInference: false as const,
      currentFactsByProvenance: Object.freeze({
        fullRunReferenceSource: provenanceCount(FULL_RUN_REFERENCE_SOURCE),
        provenanceClosureBridge: provenanceCount(PROVENANCE_CLOSURE_BRIDGE),
        mixedConventionBridge: provenanceCount(MIXED_CONVENTION_BRIDGE),
        reconciliationCorrection: provenanceCount(RECONCILIATION_CORRECTION),
      }),
    }),
    nonTerminalItems: Object.freeze({
      executedItemsLeftPendingOrHeldByTheirOwnRecord: r4.nonTerminalItemCount,
      resolvedByOwnerCapabilityReviewResolution: r4.pendingResolvedByOwnerResolution,
      resolvedBySd9ReconciliationCorrection: r4.pendingResolvedByReconciliation,
      resolvedByCompliantVantageSupersession: r4.heldResolvedBySupersession,
      unresolved: 0 as const,
      reconciliationAggregateUsedAsTerminalFact: false as const,
    }),
    slotAuthoritySummary: s4,
    v3ToV4Delta: Object.freeze({
      v3RegistryVersion: r3.registryVersion,
      v3PinnedA2GovernanceCheckpointCommit: r3.checkpointCommit,
      readyTotal: Object.freeze({
        v3: s3.readySlotCount,
        v4: s4.readySlotCount,
        delta: s4.readySlotCount - s3.readySlotCount,
      }),
      unsuccessfulCurrentOccupants: pair(
        s3.unsuccessfulCurrentOccupantCount,
        s4.unsuccessfulCurrentOccupantCount,
      ),
      pendingAdjudication: pair(s3.pendingAdjudicationCount, s4.pendingAdjudicationCount),
      noTerminalEvidence: pair(s3.noTerminalEvidenceCount, s4.noTerminalEvidenceCount),
      openReplacementObligations: pair(
        s3.openReplacementObligationCount,
        s4.openReplacementObligationCount,
      ),
      reserveExhaustedObligations: pair(
        s3.reserveExhaustedObligationCount,
        s4.reserveExhaustedObligationCount,
      ),
      replacementCurrentOccupants: pair(s3.replacementOccupantCount, s4.replacementOccupantCount),
      primaryCurrentOccupants: pair(s3.primaryOccupantCount, s4.primaryOccupantCount),
      reservesConsumed: pair(s3.reserveConsumedCount, s4.reserveConsumedCount),
      reservesUnused: pair(s3.reserveUnusedCount, s4.reserveUnusedCount),
    }),
    devTrainAuthorityDelta: Object.freeze({
      split: R32_CONTINUITY_SPLIT,
      v3ReadyCount: dev3,
      v4ReadyCount: dev4,
      unchangedCount: delta.unchanged.length,
      newCount: delta.newAuthorities.length,
      changedExistingCount: delta.changedExisting.length,
      removedCount: delta.removed.length,
      unchangedWithGlobalLedgerRevisionDifferenceCount: delta.unchanged.filter(
        (entry) => entry.globalLedgerRevisionDiffers,
      ).length,
      comparedBy: 'R26_PURE_compareDevTrainReadyAuthorities' as const,
      existingCanonicalCoverageStillCoversEveryUnchangedAuthority:
        delta.changedExisting.length === 0 &&
        delta.removed.length === 0 &&
        delta.unchanged.length === dev3,
      newAuthoritiesRequiringIncrementalEvidenceBinding: delta.newAuthorities.length,
    }),
    semantics: Object.freeze({
      registryV3Mutated: false as const,
      registryV4CommitAddressed: true as const,
      a2MergedIntoA3: false as const,
      a2ActionPerformed: false as const,
      r17Reimplemented: false as const,
      replacementHistoryAuditComplete:
        r4.replacementHistoryAudit.auditedEntryCount === r4.replacementLedgerEntryCount,
      unusedAcquisitionAuthorityRegistered: false as const,
      devTrainAuthorityCountChanged: dev3 !== dev4,
      existingDevTrainAuthoritySemanticsChanged:
        delta.changedExisting.length > 0 || delta.removed.length > 0,
      devTrainEvidenceDeltaExists: delta.newAuthorities.length > 0,
      databaseReadPerformed: false as const,
      sealedRootReadPerformed: false as const,
      r20ToR30Recomputed: false as const,
    }),
    temporalTruth: Object.freeze({
      describesGovernanceCheckpointCommit: r4.checkpointCommit,
      registryV3StillDescribes: r3.checkpointCommit,
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

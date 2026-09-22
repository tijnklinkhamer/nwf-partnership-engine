/**
 * PHASE 2B-2D — A3 R19: THE MINTED COMMITTED-GOVERNANCE SNAPSHOT AND THE
 * PUBLIC-GOVERNANCE-ONLY CENSUS.
 *
 * WHY A SNAPSHOT IS MINTED, NOT SERIALISED
 *
 *   A snapshot says "these exact committed bytes, verified in THIS process,
 *   produced these exact R17 authorities". A serialised one would be a
 *   reusable authority token: something a later step could accept without
 *   re-reading a single governance file. So there is no serialised form and no
 *   new authority digest. Identity is the set of exact constituent bindings
 *   plus IN-PROCESS MINTING, proved by a private `WeakSet`.
 *
 *   A `WeakMap` additionally maps every READY authority R17 minted during this
 *   resolution back to the snapshot that produced it. That is what a later
 *   R20 split-scoped database adapter will use to prove the governance state
 *   it was handed is the one it is about to read against - the TOCTOU boundary
 *   this slice prepares and does not cross.
 *
 *   A clone, a spread, a literal or a deserialised copy is not a minted
 *   snapshot and is not a minted READY, for the same reason R17's own brand
 *   exists. R17's `WeakSet` is NOT touched here.
 *
 * THE CENSUS IS DERIVED, AND PUBLIC-SAFE
 *
 *   It carries counts and provenance identity only: no selection index, no
 *   organisation id, no eche row key, no run reference, no document hash, no
 *   URL, no domain, no sealed filename, no label, no gold and no classifier
 *   data. It authorises nothing. `A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE`
 *   means only that not every one of the 110 slots yet has an
 *   acquisition-of-record organisation allowed to feed A3.
 */
import {
  isA3SlotAcquisitionAuthorityReady,
  type A3SlotAcquisitionAuthorityReady,
  type A3GenerationSlotAuthoritySummary,
} from '../a3prep/slotAuthority.js';
import { refuse } from './refusal.js';
import { CANONICAL_A2_GOVERNANCE_REGISTRY_V1, type GovernanceRegistryEntry } from './registryV1.js';
import { resolveCanonicalA2GovernanceV1, type CanonicalGovernanceResolution } from './resolve.js';

// ---------------------------------------------------------------------------
// A. THE SNAPSHOT.
// ---------------------------------------------------------------------------

export interface A3CommittedGovernanceSnapshot {
  readonly kind: 'A3_COMMITTED_GOVERNANCE_SNAPSHOT';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly registryVersion: string;
  readonly governanceBaseCommit: string;
  readonly resolution: CanonicalGovernanceResolution;
}

const MINTED_SNAPSHOTS = new WeakSet<object>();
const SNAPSHOT_BY_READY = new WeakMap<object, A3CommittedGovernanceSnapshot>();

/** True ONLY for a snapshot this module minted in THIS process. */
export function isCommittedGovernanceSnapshot(
  value: unknown,
): value is A3CommittedGovernanceSnapshot {
  return typeof value === 'object' && value !== null && MINTED_SNAPSHOTS.has(value);
}

/**
 * The producing snapshot of a READY authority, or `undefined`. It answers only
 * for a READY object R17 minted during THAT resolution: a clone, a spread or a
 * deserialised copy resolves to nothing, and so does a READY minted by some
 * other resolution.
 */
export function governanceSnapshotForReadyAuthority(
  ready: unknown,
): A3CommittedGovernanceSnapshot | undefined {
  if (!isA3SlotAcquisitionAuthorityReady(ready)) return undefined;
  return SNAPSHOT_BY_READY.get(ready as unknown as object);
}

/**
 * Resolves Registry V1 over the committed tree and mints the snapshot. The
 * registry is a parameter so a test can prove a mutated registry refuses;
 * every production caller passes Registry V1.
 */
export function loadCanonicalA2GovernanceV1(
  repositoryRoot: string,
  registry: readonly GovernanceRegistryEntry[] = CANONICAL_A2_GOVERNANCE_REGISTRY_V1,
): A3CommittedGovernanceSnapshot {
  const resolution = resolveCanonicalA2GovernanceV1(repositoryRoot, registry);
  const snapshot: A3CommittedGovernanceSnapshot = Object.freeze({
    kind: 'A3_COMMITTED_GOVERNANCE_SNAPSHOT' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    registryVersion: resolution.registryVersion,
    governanceBaseCommit: resolution.governanceBaseCommit,
    resolution,
  });
  MINTED_SNAPSHOTS.add(snapshot);
  for (const slot of resolution.resolution.slots) {
    if (isA3SlotAcquisitionAuthorityReady(slot)) {
      SNAPSHOT_BY_READY.set(slot as unknown as object, snapshot);
    }
  }
  return snapshot;
}

/** Every READY authority this snapshot's resolution minted, in slot order. */
export function readyAuthoritiesOf(
  snapshot: A3CommittedGovernanceSnapshot,
): readonly A3SlotAcquisitionAuthorityReady[] {
  if (!isCommittedGovernanceSnapshot(snapshot)) {
    refuse('NOT_A_MINTED_GOVERNANCE_SNAPSHOT', 'the value was not minted by this resolution');
  }
  return Object.freeze(
    snapshot.resolution.resolution.slots.filter((slot): slot is A3SlotAcquisitionAuthorityReady =>
      isA3SlotAcquisitionAuthorityReady(slot),
    ),
  );
}

// ---------------------------------------------------------------------------
// B. THE PUBLIC CENSUS.
// ---------------------------------------------------------------------------

export const R19_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R19_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V1';

export interface PublicGovernanceAuthorityCensus {
  readonly record: typeof R19_PUBLIC_CENSUS_RECORD_KIND;
  readonly recordKind: 'PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CENSUS';
  readonly generationId: string;
  readonly registryVersion: string;
  readonly governanceBaseCommit: string;
  readonly thisFileAuthorises: readonly [];
  readonly derivation: {
    readonly derivedNotAsserted: true;
    readonly publicGovernanceOnly: true;
    readonly workingDatabaseReads: 0;
    readonly sealedRootReads: 0;
    readonly institutionNetworkRequests: 0;
    readonly registryEntryCount: number;
    readonly registryBindingsVerified: number;
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
  readonly temporalTruth: {
    readonly describesGovernanceSnapshotCommit: string;
    readonly automaticallyUpdatesWhenA2Advances: false;
    readonly laterGovernanceRequiresALaterRegistryAndCensusVersion: true;
  };
  readonly whatThisIsNot: readonly string[];
  readonly identityDisclosure: {
    readonly selectionIndices: false;
    readonly organisationIds: false;
    readonly echeRowKeys: false;
    readonly runReferences: false;
    readonly documentHashes: false;
    readonly urlsOrDomains: false;
    readonly sealedFilenames: false;
    readonly labelsGoldOrClassifierData: false;
  };
}

/**
 * The public census. Every count comes from the R17 summary or from the
 * adapter's own verified provenance totals; none is hand-entered, and none of
 * them is an input to the derivation that produced them.
 */
export function derivePublicGovernanceAuthorityCensus(
  snapshot: A3CommittedGovernanceSnapshot,
): PublicGovernanceAuthorityCensus {
  if (!isCommittedGovernanceSnapshot(snapshot)) {
    refuse(
      'NOT_A_MINTED_GOVERNANCE_SNAPSHOT',
      'the census input was not minted by this resolution',
    );
  }
  const { resolution } = snapshot;
  return Object.freeze({
    record: R19_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CENSUS' as const,
    generationId: resolution.summary.generationId,
    registryVersion: resolution.registryVersion,
    governanceBaseCommit: resolution.governanceBaseCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    derivation: Object.freeze({
      derivedNotAsserted: true as const,
      publicGovernanceOnly: true as const,
      workingDatabaseReads: 0 as const,
      sealedRootReads: 0 as const,
      institutionNetworkRequests: 0 as const,
      registryEntryCount: resolution.registryEntryCount,
      registryBindingsVerified: resolution.verifiedRegistryBindings.length,
      transitionLedgerVersionsValidated: resolution.transitionChain.versions.length,
      normalisedTransitionEdgeCount: resolution.transitionChain.edges.length,
      scopedSupersessionChainCount: resolution.scopedSupersessions.length,
      replacementLedgerEntriesAudited: resolution.replacementHistoryAudit.auditedEntryCount,
      currentTerminalFactCount: resolution.currentTerminalFactCount,
      currentPendingEvidenceFactCount: resolution.currentPendingEvidenceFactCount,
      currentFactsWithTransitionBindingCount: resolution.currentFactsWithTransitionBindingCount,
      supersededTerminalItemsExcluded: resolution.supersededTerminalItemCount,
    }),
    slotAuthoritySummary: resolution.summary,
    temporalTruth: Object.freeze({
      describesGovernanceSnapshotCommit: resolution.governanceBaseCommit,
      automaticallyUpdatesWhenA2Advances: false as const,
      laterGovernanceRequiresALaterRegistryAndCensusVersion: true as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_A3_EVIDENCE_LOADING_AUTHORITY',
      'NOT_SET_P_OR_SET_R_AUTHORITY',
      'NOT_AN_A5_CORPUS_FREEZE',
      'NOT_HOLDOUT_SCORING_AUTHORITY',
    ]),
    identityDisclosure: Object.freeze({
      selectionIndices: false as const,
      organisationIds: false as const,
      echeRowKeys: false as const,
      runReferences: false as const,
      documentHashes: false as const,
      urlsOrDomains: false as const,
      sealedFilenames: false as const,
      labelsGoldOrClassifierData: false as const,
    }),
  });
}

/**
 * PHASE 2B-2D — A3 R25: THE MINTED COMMITTED-GOVERNANCE SNAPSHOT, VERSION 2.
 *
 * A V2 snapshot says "these exact committed bytes, read from their pinned
 * commits and verified in THIS process, produced these exact R17
 * authorities". It has its OWN private `WeakSet` brand and its OWN
 * READY -> snapshot `WeakMap`: a V1 snapshot is not a V2 snapshot, a V1 READY
 * does not resolve through the V2 map, and a clone, spread or deserialised copy
 * of either is nothing at all. V1's brand and R17's brand are not touched.
 *
 * There is no serialised form and no new authority digest: identity is the
 * set of exact per-source commit/path/hash bindings plus in-process minting.
 *
 * The minting entry point takes NO registry: it proves Registry V2's
 * composition and resolves exactly Registry V2. Only `resolveV2.ts` accepts a
 * registry, and it mints nothing.
 */
import {
  isA3SlotAcquisitionAuthorityReady,
  type A3SlotAcquisitionAuthorityReady,
} from '../a3prep/slotAuthority.js';
import { refuseV2 } from './refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES,
  proveRegistryV2Composition,
  type RegistryV2Composition,
} from './registryV2.js';
import {
  resolveCommittedA2GovernanceV2,
  type CommittedGovernanceResolutionV2,
} from './resolveV2.js';

export interface A3CommittedGovernanceSnapshotV2 {
  readonly kind: 'A3_COMMITTED_GOVERNANCE_SNAPSHOT_V2';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly registryVersion: string;
  readonly checkpointCommit: string;
  readonly composition: RegistryV2Composition;
  readonly resolution: CommittedGovernanceResolutionV2;
}

const MINTED_V2_SNAPSHOTS = new WeakSet<object>();
const V2_SNAPSHOT_BY_READY = new WeakMap<object, A3CommittedGovernanceSnapshotV2>();

/** True ONLY for a V2 snapshot this module minted in THIS process. */
export function isCommittedGovernanceSnapshotV2(
  value: unknown,
): value is A3CommittedGovernanceSnapshotV2 {
  return typeof value === 'object' && value !== null && MINTED_V2_SNAPSHOTS.has(value);
}

/**
 * The producing V2 snapshot of a READY authority, or `undefined`. It answers
 * only for a READY R17 minted during a V2 snapshot's own resolution.
 */
export function governanceSnapshotV2ForReadyAuthority(
  ready: unknown,
): A3CommittedGovernanceSnapshotV2 | undefined {
  if (!isA3SlotAcquisitionAuthorityReady(ready)) return undefined;
  return V2_SNAPSHOT_BY_READY.get(ready as unknown as object);
}

/** Proves, resolves and mints the committed governance snapshot V2. */
export function loadCommittedA2GovernanceV2(
  repositoryRoot: string,
): A3CommittedGovernanceSnapshotV2 {
  const composition = proveRegistryV2Composition(COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES);
  const resolution = resolveCommittedA2GovernanceV2(
    repositoryRoot,
    COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES,
  );
  const snapshot: A3CommittedGovernanceSnapshotV2 = Object.freeze({
    kind: 'A3_COMMITTED_GOVERNANCE_SNAPSHOT_V2' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    registryVersion: resolution.registryVersion,
    checkpointCommit: resolution.checkpointCommit,
    composition,
    resolution,
  });
  MINTED_V2_SNAPSHOTS.add(snapshot);
  for (const slot of resolution.resolution.slots) {
    if (isA3SlotAcquisitionAuthorityReady(slot)) {
      V2_SNAPSHOT_BY_READY.set(slot as unknown as object, snapshot);
    }
  }
  return snapshot;
}

/** Every READY authority a minted V2 snapshot's resolution produced, in slot order. */
export function readyAuthoritiesOfV2(
  snapshot: A3CommittedGovernanceSnapshotV2,
): readonly A3SlotAcquisitionAuthorityReady[] {
  if (!isCommittedGovernanceSnapshotV2(snapshot)) {
    refuseV2('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V2', 'the value was not minted as a V2 snapshot');
  }
  return Object.freeze(
    snapshot.resolution.resolution.slots.filter((slot): slot is A3SlotAcquisitionAuthorityReady =>
      isA3SlotAcquisitionAuthorityReady(slot),
    ),
  );
}

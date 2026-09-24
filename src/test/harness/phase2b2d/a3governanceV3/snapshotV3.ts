/**
 * PHASE 2B-2D — A3 R31: THE MINTED COMMITTED-GOVERNANCE SNAPSHOT, VERSION 3.
 *
 * A V3 snapshot says "these exact committed bytes, read from their pinned
 * commits and verified in THIS process, produced these exact R17
 * authorities". It has its OWN private `WeakSet` brand and its OWN
 * READY -> snapshot `WeakMap`: a V1 or V2 snapshot is not a V3 snapshot, a V1
 * or V2 READY does not resolve through the V3 map, a V3 READY does not resolve
 * through theirs, and a clone, spread or deserialised copy of any of them is
 * nothing at all. The V1, V2 and R17 brands are not touched.
 *
 * There is no serialised form and no new authority digest: identity is the
 * set of exact per-source commit/path/hash bindings plus in-process minting.
 *
 * The minting entry point takes NO registry: it proves Registry V3's
 * composition and resolves exactly Registry V3. Only `resolveV3.ts` accepts a
 * registry, and it mints nothing.
 */
import {
  isA3SlotAcquisitionAuthorityReady,
  type A3SlotAcquisitionAuthorityReady,
} from '../a3prep/slotAuthority.js';
import { refuseV3 } from './refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
  proveRegistryV3Composition,
  type RegistryV3Composition,
} from './registryV3.js';
import {
  resolveCommittedA2GovernanceV3,
  type CommittedGovernanceResolutionV3,
} from './resolveV3.js';

export interface A3CommittedGovernanceSnapshotV3 {
  readonly kind: 'A3_COMMITTED_GOVERNANCE_SNAPSHOT_V3';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly registryVersion: string;
  readonly checkpointCommit: string;
  readonly composition: RegistryV3Composition;
  readonly resolution: CommittedGovernanceResolutionV3;
}

const MINTED_V3_SNAPSHOTS = new WeakSet<object>();
const V3_SNAPSHOT_BY_READY = new WeakMap<object, A3CommittedGovernanceSnapshotV3>();

/** True ONLY for a V3 snapshot this module minted in THIS process. */
export function isCommittedGovernanceSnapshotV3(
  value: unknown,
): value is A3CommittedGovernanceSnapshotV3 {
  return typeof value === 'object' && value !== null && MINTED_V3_SNAPSHOTS.has(value);
}

/**
 * The producing V3 snapshot of a READY authority, or `undefined`. It answers
 * only for a READY R17 minted during a V3 snapshot's own resolution.
 */
export function governanceSnapshotV3ForReadyAuthority(
  ready: unknown,
): A3CommittedGovernanceSnapshotV3 | undefined {
  if (!isA3SlotAcquisitionAuthorityReady(ready)) return undefined;
  return V3_SNAPSHOT_BY_READY.get(ready as unknown as object);
}

/** Proves, resolves and mints the committed governance snapshot V3. */
export function loadCommittedA2GovernanceV3(
  repositoryRoot: string,
): A3CommittedGovernanceSnapshotV3 {
  const composition = proveRegistryV3Composition(COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES);
  const resolution = resolveCommittedA2GovernanceV3(
    repositoryRoot,
    COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
  );
  const snapshot: A3CommittedGovernanceSnapshotV3 = Object.freeze({
    kind: 'A3_COMMITTED_GOVERNANCE_SNAPSHOT_V3' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    registryVersion: resolution.registryVersion,
    checkpointCommit: resolution.checkpointCommit,
    composition,
    resolution,
  });
  MINTED_V3_SNAPSHOTS.add(snapshot);
  for (const slot of resolution.resolution.slots) {
    if (isA3SlotAcquisitionAuthorityReady(slot)) {
      V3_SNAPSHOT_BY_READY.set(slot as unknown as object, snapshot);
    }
  }
  return snapshot;
}

/** Every READY authority a minted V3 snapshot's resolution produced, in slot order. */
export function readyAuthoritiesOfV3(
  snapshot: A3CommittedGovernanceSnapshotV3,
): readonly A3SlotAcquisitionAuthorityReady[] {
  if (!isCommittedGovernanceSnapshotV3(snapshot)) {
    refuseV3('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3', 'the value was not minted as a V3 snapshot');
  }
  return Object.freeze(
    snapshot.resolution.resolution.slots.filter((slot): slot is A3SlotAcquisitionAuthorityReady =>
      isA3SlotAcquisitionAuthorityReady(slot),
    ),
  );
}

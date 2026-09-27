/**
 * PHASE 2B-2D — A3 R32: THE MINTED COMMITTED-GOVERNANCE SNAPSHOT, VERSION 4.
 *
 * A V4 snapshot says "these exact committed bytes, read from their pinned
 * commits and verified in THIS process, produced these exact R17
 * authorities". It has its OWN private `WeakSet` brand and its OWN
 * READY -> snapshot `WeakMap`: a V1, V2 or V3 snapshot is not a V4 snapshot, a
 * V1 / V2 / V3 READY does not resolve through the V4 map, a V4 READY does not
 * resolve through theirs, and a clone, spread or deserialised copy of any of
 * them is nothing at all. The V1, V2, V3 and R17 brands are not touched.
 *
 * There is no serialised form and no new authority digest: identity is the
 * set of exact per-source commit/path/hash bindings plus in-process minting.
 *
 * The minting entry point takes NO registry: it proves Registry V4's
 * composition and resolves exactly Registry V4. Only `resolveV4.ts` accepts a
 * registry, and it mints nothing.
 */
import {
  isA3SlotAcquisitionAuthorityReady,
  type A3SlotAcquisitionAuthorityReady,
} from '../a3prep/slotAuthority.js';
import { refuseV4 } from './refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
  proveRegistryV4Composition,
  type RegistryV4Composition,
} from './registryV4.js';
import {
  resolveCommittedA2GovernanceV4,
  type CommittedGovernanceResolutionV4,
} from './resolveV4.js';

export interface A3CommittedGovernanceSnapshotV4 {
  readonly kind: 'A3_COMMITTED_GOVERNANCE_SNAPSHOT_V4';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly registryVersion: string;
  readonly checkpointCommit: string;
  readonly composition: RegistryV4Composition;
  readonly resolution: CommittedGovernanceResolutionV4;
}

const MINTED_V4_SNAPSHOTS = new WeakSet<object>();
const V4_SNAPSHOT_BY_READY = new WeakMap<object, A3CommittedGovernanceSnapshotV4>();

/** True ONLY for a V4 snapshot this module minted in THIS process. */
export function isCommittedGovernanceSnapshotV4(
  value: unknown,
): value is A3CommittedGovernanceSnapshotV4 {
  return typeof value === 'object' && value !== null && MINTED_V4_SNAPSHOTS.has(value);
}

/**
 * The producing V4 snapshot of a READY authority, or `undefined`. It answers
 * only for a READY R17 minted during a V4 snapshot's own resolution.
 */
export function governanceSnapshotV4ForReadyAuthority(
  ready: unknown,
): A3CommittedGovernanceSnapshotV4 | undefined {
  if (!isA3SlotAcquisitionAuthorityReady(ready)) return undefined;
  return V4_SNAPSHOT_BY_READY.get(ready as unknown as object);
}

/** Proves, resolves and mints the committed governance snapshot V4. */
export function loadCommittedA2GovernanceV4(
  repositoryRoot: string,
): A3CommittedGovernanceSnapshotV4 {
  const composition = proveRegistryV4Composition(COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES);
  const resolution = resolveCommittedA2GovernanceV4(
    repositoryRoot,
    COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
  );
  const snapshot: A3CommittedGovernanceSnapshotV4 = Object.freeze({
    kind: 'A3_COMMITTED_GOVERNANCE_SNAPSHOT_V4' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    registryVersion: resolution.registryVersion,
    checkpointCommit: resolution.checkpointCommit,
    composition,
    resolution,
  });
  MINTED_V4_SNAPSHOTS.add(snapshot);
  for (const slot of resolution.resolution.slots) {
    if (isA3SlotAcquisitionAuthorityReady(slot)) {
      V4_SNAPSHOT_BY_READY.set(slot as unknown as object, snapshot);
    }
  }
  return snapshot;
}

/** Every READY authority a minted V4 snapshot's resolution produced, in slot order. */
export function readyAuthoritiesOfV4(
  snapshot: A3CommittedGovernanceSnapshotV4,
): readonly A3SlotAcquisitionAuthorityReady[] {
  if (!isCommittedGovernanceSnapshotV4(snapshot)) {
    refuseV4('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4', 'the value was not minted as a V4 snapshot');
  }
  return Object.freeze(
    snapshot.resolution.resolution.slots.filter((slot): slot is A3SlotAcquisitionAuthorityReady =>
      isA3SlotAcquisitionAuthorityReady(slot),
    ),
  );
}

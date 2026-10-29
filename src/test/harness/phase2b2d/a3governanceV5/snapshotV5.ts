/**
 * PHASE 2B-2D — A3 R38B: THE MINTED COMMITTED-GOVERNANCE SNAPSHOT, VERSION 5.
 *
 * A V5 snapshot says "these exact committed bytes, read from their pinned
 * commits and verified in THIS process, produced these exact R38A
 * cross-generation authorities". It has its OWN private `WeakSet` brand and
 * its OWN cross-generation-READY -> snapshot `WeakMap`:
 *
 *   - a V1, V2, V3 or V4 snapshot is not a V5 snapshot;
 *   - a clone, spread, JSON round trip or literal of a V5 snapshot is nothing;
 *   - an R38A READY minted by a standalone R38A resolution (a synthetic or a
 *     test input) is not a V5 authority: it never enters the V5 map.
 *
 * ALL OR NOTHING
 *
 *   `resolveCommittedA2GovernanceV5` either completes every step - registry,
 *   every family, the terminal Generation-1 state, the schedule, both ledgers,
 *   carry-forward, the explicit history, the facts, the R38A resolution, the
 *   complete-terminal requirement, the declared-state and freeze cross-checks -
 *   or throws. Only after it returns is a snapshot built, branded, and its READY
 *   authorities mapped to it. If slot 110 fails, no V5 snapshot exists.
 *
 * The minting entry point takes the repository root ONLY: it proves Registry
 * V5's composition and resolves exactly Registry V5. No alternative registry,
 * no working-tree fallback.
 */
import { isA3CrossGenerationSlotAcquisitionAuthorityReady } from '../a3crossGenerationSlotAuthority/resolve.js';
import type { A3CrossGenerationSlotAcquisitionAuthorityReady } from '../a3crossGenerationSlotAuthority/types.js';
import { refuseV5 } from './refusal.js';
import { proveRegistryV5Composition, type RegistryV5Composition } from './registryV5.js';
import {
  resolveCommittedA2GovernanceV5,
  type CommittedGovernanceResolutionV5,
} from './resolveV5.js';

/** The R38A contract this snapshot resolved through, by its accepted record. */
export const R38A_CONTRACT_BINDING_V5 = Object.freeze({
  contractVersion: 'A3_R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1',
  namespace: 'src/test/harness/phase2b2d/a3crossGenerationSlotAuthority/',
  recordPath:
    'docs/evaluation/PHASE_2B_2D_A3_R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1.json',
  recordCommit: '80f792de8117c3c91ddb56bbb4dbe6518fde7d8a',
});

export interface A3CommittedGovernanceSnapshotV5 {
  readonly kind: 'A3_COMMITTED_GOVERNANCE_SNAPSHOT_V5';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly registryVersion: string;
  readonly checkpointCommit: string;
  readonly composition: RegistryV5Composition;
  readonly r38aContract: typeof R38A_CONTRACT_BINDING_V5;
  readonly resolution: CommittedGovernanceResolutionV5;
}

const MINTED_V5_SNAPSHOTS = new WeakSet<object>();
const V5_SNAPSHOT_BY_READY = new WeakMap<object, A3CommittedGovernanceSnapshotV5>();

/** True ONLY for a V5 snapshot this module minted in THIS process. */
export function isCommittedGovernanceSnapshotV5(
  value: unknown,
): value is A3CommittedGovernanceSnapshotV5 {
  return typeof value === 'object' && value !== null && MINTED_V5_SNAPSHOTS.has(value);
}

/**
 * The producing V5 snapshot of a cross-generation READY authority, or
 * `undefined`. It answers only for a READY minted during a V5 snapshot's own
 * resolution - never for an R17 READY, never for a standalone R38A READY.
 */
export function governanceSnapshotV5ForReadyAuthority(
  ready: unknown,
): A3CommittedGovernanceSnapshotV5 | undefined {
  if (!isA3CrossGenerationSlotAcquisitionAuthorityReady(ready)) return undefined;
  return V5_SNAPSHOT_BY_READY.get(ready as unknown as object);
}

/** Proves, resolves and mints the committed governance snapshot V5. */
export function loadCommittedA2GovernanceV5(
  repositoryRoot: string,
): A3CommittedGovernanceSnapshotV5 {
  const composition = proveRegistryV5Composition();
  const resolution = resolveCommittedA2GovernanceV5(repositoryRoot);
  const snapshot: A3CommittedGovernanceSnapshotV5 = Object.freeze({
    kind: 'A3_COMMITTED_GOVERNANCE_SNAPSHOT_V5' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    registryVersion: resolution.registryVersion,
    checkpointCommit: resolution.checkpointCommit,
    composition,
    r38aContract: R38A_CONTRACT_BINDING_V5,
    resolution,
  });
  MINTED_V5_SNAPSHOTS.add(snapshot);
  for (const slot of resolution.resolution.slots) {
    if (isA3CrossGenerationSlotAcquisitionAuthorityReady(slot)) {
      V5_SNAPSHOT_BY_READY.set(slot as unknown as object, snapshot);
    }
  }
  return snapshot;
}

/** Every READY authority a minted V5 snapshot's resolution produced, in slot order. */
export function readyAuthoritiesOfV5(
  snapshot: A3CommittedGovernanceSnapshotV5,
): readonly A3CrossGenerationSlotAcquisitionAuthorityReady[] {
  if (!isCommittedGovernanceSnapshotV5(snapshot)) {
    refuseV5('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V5', 'the value was not minted as a V5 snapshot');
  }
  return Object.freeze(
    snapshot.resolution.resolution.slots.filter(
      (slot): slot is A3CrossGenerationSlotAcquisitionAuthorityReady =>
        isA3CrossGenerationSlotAcquisitionAuthorityReady(slot) &&
        V5_SNAPSHOT_BY_READY.get(slot) === snapshot,
    ),
  );
}

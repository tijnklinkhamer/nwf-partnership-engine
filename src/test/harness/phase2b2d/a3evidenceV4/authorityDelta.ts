/**
 * PHASE 2B-2D — A3 R33: THE V3 -> V4 DEV_TRAIN EVIDENCE DELTA.
 *
 * NOTHING IS RE-COMPARED HERE
 *
 *   The continuity semantics are R32's `deriveDevTrainAuthorityContinuityV3ToV4`,
 *   which itself is R26's unchanged pure `compareDevTrainReadyAuthorities` over
 *   each snapshot's OWN minted READY list. R33 reuses both and restates
 *   neither. A changed or retracted existing authority is stopped by R32's own
 *   gate, `requireNoChangedOrRetractedDevTrainAuthority`, with R32's own
 *   marker - never re-read alongside the additive delta.
 *
 * WHY THE DELTA IS BRANDED
 *
 *   `DevTrainReadyAuthorityDelta` is a plain frozen value, so a hand-built one
 *   could list an unchanged authority as "new". The request planner therefore
 *   accepts only a delta THIS module derived, from two minted snapshots, in
 *   this process, and remembers which V4 snapshot it was derived for.
 *
 * PURE. No database, no filesystem, no clock, no environment, and no literal
 * list of expected selection indices or counts.
 */
import { isCommittedGovernanceSnapshotV3 } from '../a3governanceV3/snapshotV3.js';
import type { A3CommittedGovernanceSnapshotV3 } from '../a3governanceV3/snapshotV3.js';
import {
  deriveDevTrainAuthorityContinuityV3ToV4,
  requireNoChangedOrRetractedDevTrainAuthority,
} from '../a3governanceV4/devTrainContinuity.js';
import {
  isCommittedGovernanceSnapshotV4,
  type A3CommittedGovernanceSnapshotV4,
} from '../a3governanceV4/snapshotV4.js';
import type { DevTrainReadyAuthorityDelta } from '../a3evidenceV2/types.js';
import type { A3SlotAcquisitionAuthorityReady } from '../a3prep/slotAuthority.js';
import { refuseV4Evidence } from './refusal.js';

const DERIVED_DELTA_V4_SNAPSHOT = new WeakMap<object, A3CommittedGovernanceSnapshotV4>();
const DERIVED_DELTA_V3_SNAPSHOT = new WeakMap<object, A3CommittedGovernanceSnapshotV3>();

export function requireMintedSnapshotV3(snapshot: unknown): A3CommittedGovernanceSnapshotV3 {
  if (!isCommittedGovernanceSnapshotV3(snapshot)) {
    refuseV4Evidence(
      'R33_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3',
      'the V3 continuity base was not minted by the committed V3 loader',
    );
  }
  return snapshot;
}

export function requireMintedSnapshotV4(snapshot: unknown): A3CommittedGovernanceSnapshotV4 {
  if (!isCommittedGovernanceSnapshotV4(snapshot)) {
    refuseV4Evidence(
      'R33_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4',
      'the V4 snapshot was not minted by the committed V4 loader',
    );
  }
  return snapshot;
}

/**
 * The authorities R33 may read, and ONLY those: the new ones, after R32's gate
 * proved the delta additive. Pure over the delta value; there is no path by
 * which an unchanged, changed or retracted authority enters this list.
 */
export function deltaAuthoritiesToBindV4(
  delta: DevTrainReadyAuthorityDelta,
): readonly A3SlotAcquisitionAuthorityReady[] {
  requireNoChangedOrRetractedDevTrainAuthority(delta);
  return Object.freeze(delta.newAuthorities.map((entry) => entry.v2));
}

/**
 * §4. The V3 -> V4 DEV_TRAIN delta between two MINTED snapshots, proved
 * additive, then branded as derived for exactly this V4 snapshot. No census
 * JSON is parsed as authority and no expected count is supplied.
 */
export function deriveDevTrainEvidenceDeltaV4(
  v3Snapshot: A3CommittedGovernanceSnapshotV3,
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
): DevTrainReadyAuthorityDelta {
  const v3 = requireMintedSnapshotV3(v3Snapshot);
  const v4 = requireMintedSnapshotV4(v4Snapshot);
  const delta = requireNoChangedOrRetractedDevTrainAuthority(
    deriveDevTrainAuthorityContinuityV3ToV4(v3, v4),
  );
  DERIVED_DELTA_V4_SNAPSHOT.set(delta, v4);
  DERIVED_DELTA_V3_SNAPSHOT.set(delta, v3);
  return delta;
}

/** The V4 snapshot a derived delta belongs to, or `undefined` for anything else. */
export function governanceSnapshotV4ForDerivedDelta(
  delta: unknown,
): A3CommittedGovernanceSnapshotV4 | undefined {
  if (typeof delta !== 'object' || delta === null) return undefined;
  return DERIVED_DELTA_V4_SNAPSHOT.get(delta);
}

/** The V3 continuity base a derived delta was compared against, or `undefined`. */
export function governanceSnapshotV3ForDerivedDelta(
  delta: unknown,
): A3CommittedGovernanceSnapshotV3 | undefined {
  if (typeof delta !== 'object' || delta === null) return undefined;
  return DERIVED_DELTA_V3_SNAPSHOT.get(delta);
}

/** A delta THIS module derived for exactly this V4 snapshot, or a refusal. */
export function requireDerivedDeltaFor(
  delta: unknown,
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
): DevTrainReadyAuthorityDelta {
  const v4 = requireMintedSnapshotV4(v4Snapshot);
  if (governanceSnapshotV4ForDerivedDelta(delta) !== v4) {
    refuseV4Evidence(
      'R33_NOT_A_DERIVED_V4_EVIDENCE_DELTA',
      'the delta was not derived from minted V3/V4 snapshots for the V4 snapshot supplied',
    );
  }
  return delta as DevTrainReadyAuthorityDelta;
}

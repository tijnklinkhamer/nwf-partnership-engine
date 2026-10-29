/**
 * PHASE 2B-2D — A3 R39: THE V4 -> V5 DEV_TRAIN EVIDENCE DELTA.
 *
 * NOTHING IS RE-COMPARED HERE
 *
 *   The continuity semantics are R38B's `deriveDevTrainAuthorityContinuityV4ToV5`,
 *   which is R38A's unchanged bridge `compareR17WithCrossGenerationAuthorities`
 *   over each snapshot's OWN minted READY list. R39 reuses both and restates
 *   neither. A changed or retracted existing authority is stopped by R38B's
 *   own gate, `requireAdditiveDevTrainContinuity`, with R38B's own marker.
 *
 * THE BRIDGE CLASSIFIES; THE SNAPSHOT SUPPLIES THE AUTHORITY
 *
 *   R38A's list comparator reports NEW slots as selection indices only. Those
 *   indices are used as the classification result and nothing else: each new
 *   authority object is then located through `readyAuthoritiesOfV5` on the
 *   very V5 snapshot the comparison read, and proved genuine, V5-minted,
 *   DEV_TRAIN, new, not unchanged, present exactly once - with no new index
 *   left unmatched. No index list, count or authority array is accepted from a
 *   caller, and none is hardcoded.
 *
 * WHY THE DELTA IS BRANDED
 *
 *   `CrossGenerationContinuityDelta` is a plain frozen value, so a hand-built
 *   one could list an unchanged slot as "new". Every later step therefore
 *   accepts only a delta THIS module derived, from two minted snapshots, in
 *   this process, and remembers which snapshots and which materialised
 *   authorities it was derived with.
 *
 * PURE. No database, no filesystem, no clock, no environment.
 */
import type { CrossGenerationContinuityDelta } from '../a3crossGenerationSlotAuthority/continuity.js';
import { isA3CrossGenerationSlotAcquisitionAuthorityReady } from '../a3crossGenerationSlotAuthority/resolve.js';
import type { A3CrossGenerationSlotAcquisitionAuthorityReady } from '../a3crossGenerationSlotAuthority/types.js';
import {
  isCommittedGovernanceSnapshotV4,
  type A3CommittedGovernanceSnapshotV4,
} from '../a3governanceV4/snapshotV4.js';
import {
  deriveDevTrainAuthorityContinuityV4ToV5,
  requireAdditiveDevTrainContinuity,
} from '../a3governanceV5/devTrainContinuity.js';
import {
  governanceSnapshotV5ForReadyAuthority,
  isCommittedGovernanceSnapshotV5,
  readyAuthoritiesOfV5,
  type A3CommittedGovernanceSnapshotV5,
} from '../a3governanceV5/snapshotV5.js';
import { refuseV5Evidence } from './refusal.js';
import { R39_EVIDENCE_SPLIT } from './types.js';

interface DerivedDeltaRecord {
  readonly v4: A3CommittedGovernanceSnapshotV4;
  readonly v5: A3CommittedGovernanceSnapshotV5;
  readonly newAuthorities: readonly A3CrossGenerationSlotAcquisitionAuthorityReady[];
  readonly unchangedSelectionIndices: ReadonlySet<number>;
}

const DERIVED_DELTAS = new WeakMap<object, DerivedDeltaRecord>();

export function requireMintedSnapshotV4(snapshot: unknown): A3CommittedGovernanceSnapshotV4 {
  if (!isCommittedGovernanceSnapshotV4(snapshot)) {
    refuseV5Evidence(
      'R39_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4',
      'the V4 continuity base was not minted by the committed V4 loader',
    );
  }
  return snapshot;
}

export function requireMintedSnapshotV5(snapshot: unknown): A3CommittedGovernanceSnapshotV5 {
  if (!isCommittedGovernanceSnapshotV5(snapshot)) {
    refuseV5Evidence(
      'R39_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V5',
      'the V5 snapshot was not minted by the committed V5 loader',
    );
  }
  return snapshot;
}

/**
 * §17. A genuine R38A cross-generation READY, minted during THIS V5
 * snapshot's resolution, in DEV_TRAIN. An R17 (V4) READY, a standalone R38A
 * READY, a clone / spread / literal and a READY from another V5 snapshot all
 * refuse - by identity, never by equal fields.
 */
export function requireV5DevTrainReadyMintedBy(
  ready: unknown,
  v5Snapshot: A3CommittedGovernanceSnapshotV5,
): A3CrossGenerationSlotAcquisitionAuthorityReady {
  const snapshot = requireMintedSnapshotV5(v5Snapshot);
  if (!isA3CrossGenerationSlotAcquisitionAuthorityReady(ready)) {
    refuseV5Evidence(
      'R39_READY_NOT_MINTED_BY_GOVERNANCE_V5_SNAPSHOT',
      'the value is not a READY authority minted by the cross-generation contract',
    );
  }
  if (governanceSnapshotV5ForReadyAuthority(ready) !== snapshot) {
    refuseV5Evidence(
      'R39_READY_NOT_MINTED_BY_GOVERNANCE_V5_SNAPSHOT',
      'the READY authority was not minted by the Governance V5 snapshot supplied',
    );
  }
  if (ready.split !== R39_EVIDENCE_SPLIT) {
    refuseV5Evidence(
      'R39_AUTHORITY_SPLIT_NOT_SUPPORTED',
      `R39 binds ${R39_EVIDENCE_SPLIT} only; no request is built for any other split`,
    );
  }
  return ready;
}

function notDerivable(message: string): never {
  refuseV5Evidence('R39_NEW_DELTA_AUTHORITIES_NOT_DERIVABLE', message);
}

/**
 * §9. The NEW V5 DEV_TRAIN authorities, located on the V5 snapshot itself and
 * proved one by one. The continuity's indices classify; they never become
 * authority on their own.
 */
function materialiseNewAuthorities(
  continuity: CrossGenerationContinuityDelta,
  v5: A3CommittedGovernanceSnapshotV5,
): {
  readonly newAuthorities: readonly A3CrossGenerationSlotAcquisitionAuthorityReady[];
  readonly unchangedSelectionIndices: ReadonlySet<number>;
} {
  const newIndices = new Set(continuity.newSelectionIndices);
  const unchangedIndices = new Set(continuity.unchanged.map((result) => result.selectionIndex));
  if (
    newIndices.size !== continuity.newSelectionIndices.length ||
    unchangedIndices.size !== continuity.unchanged.length
  ) {
    notDerivable('the continuity lists a selection index more than once');
  }
  for (const index of newIndices) {
    if (unchangedIndices.has(index)) notDerivable('a slot is classified both new and unchanged');
  }
  const devTrainV5 = readyAuthoritiesOfV5(v5).filter((ready) => ready.split === R39_EVIDENCE_SPLIT);
  if (devTrainV5.length !== newIndices.size + unchangedIndices.size) {
    notDerivable('a V5 DEV_TRAIN authority is neither new nor unchanged');
  }
  const selected = devTrainV5.filter((ready) => newIndices.has(ready.selectionIndex));
  const seen = new Set<number>();
  for (const ready of selected) {
    requireV5DevTrainReadyMintedBy(ready, v5);
    if (unchangedIndices.has(ready.selectionIndex)) {
      notDerivable('an unchanged authority entered the new-delta selection');
    }
    if (seen.has(ready.selectionIndex)) notDerivable('a new authority occurs more than once');
    seen.add(ready.selectionIndex);
  }
  for (const index of newIndices) {
    if (!seen.has(index)) notDerivable('a new selection index has no V5 DEV_TRAIN authority');
  }
  return Object.freeze({
    newAuthorities: Object.freeze(selected),
    unchangedSelectionIndices: unchangedIndices,
  });
}

/**
 * §7 / §8. The V4 -> V5 DEV_TRAIN continuity between two MINTED snapshots,
 * proved additive by R38B's own gate, its new authorities materialised from
 * the V5 snapshot, then branded as derived for exactly these snapshots. No
 * census JSON is parsed as authority and no expected count is supplied.
 */
export function deriveDevTrainEvidenceDeltaV5(
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
  v5Snapshot: A3CommittedGovernanceSnapshotV5,
): CrossGenerationContinuityDelta {
  const v4 = requireMintedSnapshotV4(v4Snapshot);
  const v5 = requireMintedSnapshotV5(v5Snapshot);
  const continuity = requireAdditiveDevTrainContinuity(
    deriveDevTrainAuthorityContinuityV4ToV5(v4, v5),
  );
  const { newAuthorities, unchangedSelectionIndices } = materialiseNewAuthorities(continuity, v5);
  DERIVED_DELTAS.set(
    continuity,
    Object.freeze({ v4, v5, newAuthorities, unchangedSelectionIndices }),
  );
  return continuity;
}

function recordOf(delta: unknown): DerivedDeltaRecord | undefined {
  if (typeof delta !== 'object' || delta === null) return undefined;
  return DERIVED_DELTAS.get(delta);
}

/** The V5 snapshot a derived delta belongs to, or `undefined` for anything else. */
export function governanceSnapshotV5ForDerivedDelta(
  delta: unknown,
): A3CommittedGovernanceSnapshotV5 | undefined {
  return recordOf(delta)?.v5;
}

/** The V4 continuity base a derived delta was compared against, or `undefined`. */
export function governanceSnapshotV4ForDerivedDelta(
  delta: unknown,
): A3CommittedGovernanceSnapshotV4 | undefined {
  return recordOf(delta)?.v4;
}

/** A delta THIS module derived for exactly this V5 snapshot, or a refusal. */
export function requireDerivedDeltaFor(
  delta: unknown,
  v5Snapshot: A3CommittedGovernanceSnapshotV5,
): CrossGenerationContinuityDelta {
  const v5 = requireMintedSnapshotV5(v5Snapshot);
  if (recordOf(delta)?.v5 !== v5) {
    refuseV5Evidence(
      'R39_NOT_A_DERIVED_V5_EVIDENCE_DELTA',
      'the delta was not derived from minted V4/V5 snapshots for the V5 snapshot supplied',
    );
  }
  return delta as CrossGenerationContinuityDelta;
}

/**
 * The materialised NEW authorities of a derived delta, in slot order. The only
 * path by which an authority reaches request planning; an unchanged, changed
 * or retracted authority cannot appear in it.
 */
export function newDeltaAuthoritiesOf(
  delta: CrossGenerationContinuityDelta,
  v5Snapshot: A3CommittedGovernanceSnapshotV5,
): readonly A3CrossGenerationSlotAcquisitionAuthorityReady[] {
  return recordOf(requireDerivedDeltaFor(delta, v5Snapshot))!.newAuthorities;
}

/**
 * §18. A genuine V5 DEV_TRAIN READY that is one of the NEW authorities of a
 * delta derived for this V5 snapshot - by object identity. An UNCHANGED V5
 * authority is a genuine V5 DEV_TRAIN READY too, and it refuses here.
 */
export function requireNewV5DeltaAuthority(
  candidate: unknown,
  delta: CrossGenerationContinuityDelta,
  v5Snapshot: A3CommittedGovernanceSnapshotV5,
): A3CrossGenerationSlotAcquisitionAuthorityReady {
  const record = recordOf(requireDerivedDeltaFor(delta, v5Snapshot))!;
  const ready = requireV5DevTrainReadyMintedBy(candidate, v5Snapshot);
  if (
    !record.newAuthorities.includes(ready) ||
    record.unchangedSelectionIndices.has(ready.selectionIndex)
  ) {
    refuseV5Evidence(
      'R39_AUTHORITY_NOT_A_NEW_V5_DELTA_AUTHORITY',
      'the READY authority is not one of the new authorities of the derived V4 -> V5 delta',
    );
  }
  return ready;
}

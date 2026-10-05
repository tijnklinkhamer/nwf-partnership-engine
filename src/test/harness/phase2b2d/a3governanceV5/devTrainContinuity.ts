/**
 * PHASE 2B-2D — A3 R38B: V4 -> V5 DEV_TRAIN AUTHORITY CONTINUITY.
 *
 * The actual authorities are compared by R38A's UNCHANGED continuity bridge,
 * `compareR17WithCrossGenerationAuthorities` - not R26's comparator, which
 * stays untouched and is never fed a cross-generation authority. The bridge
 * owns the owner-defined rule: resolution context (Generation 1 -> Generation
 * 2) is not acquisition authority, and every evidence-relevant field must be
 * identical for an authority to be UNCHANGED, with a genuine carry-forward
 * admission verified behind each carried one.
 *
 * Each side comes ONLY through its own minting path:
 *
 *   old  genuine Governance V4 READYs, via `readyAuthoritiesOfV4`, from a
 *        snapshot minted by the unchanged `loadCommittedA2GovernanceV4`;
 *   new  genuine Governance V5 READYs, via `readyAuthoritiesOfV5`.
 *
 * Both filtered to DEV_TRAIN here. Nothing is deserialised, reconstructed or
 * synthesised.
 *
 * THE STOP CONDITIONS ARE R38B'S
 *
 *   New DEV_TRAIN authorities are the expected delta: counted and handed to a
 *   separately authorised later slice, never evidence-read here. A CHANGED
 *   existing authority or a RETRACTED one each STOPS R38B with its own marker.
 *
 * PURE over minted objects. No database, no filesystem, no clock.
 */
import {
  compareR17WithCrossGenerationAuthorities,
  type CrossGenerationContinuityDelta,
} from '../a3crossGenerationSlotAuthority/continuity.js';
import {
  isCommittedGovernanceSnapshotV4,
  readyAuthoritiesOfV4,
  type A3CommittedGovernanceSnapshotV4,
} from '../a3governanceV4/snapshotV4.js';
import { refuseV5 } from './refusal.js';
import {
  isCommittedGovernanceSnapshotV5,
  readyAuthoritiesOfV5,
  type A3CommittedGovernanceSnapshotV5,
} from './snapshotV5.js';

export const R38B_CONTINUITY_SPLIT = 'DEV_TRAIN';

/** The real V4 -> V5 DEV_TRAIN comparison between two MINTED snapshots. */
export function deriveDevTrainAuthorityContinuityV4ToV5(
  v4: A3CommittedGovernanceSnapshotV4,
  v5: A3CommittedGovernanceSnapshotV5,
): CrossGenerationContinuityDelta {
  if (!isCommittedGovernanceSnapshotV4(v4)) {
    refuseV5('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V5', 'the V4 continuity base was not minted');
  }
  if (!isCommittedGovernanceSnapshotV5(v5)) {
    refuseV5('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V5', 'the V5 snapshot was not minted');
  }
  return compareR17WithCrossGenerationAuthorities(
    readyAuthoritiesOfV4(v4).filter((ready) => ready.split === R38B_CONTINUITY_SPLIT),
    readyAuthoritiesOfV5(v5).filter((ready) => ready.split === R38B_CONTINUITY_SPLIT),
  );
}

/**
 * R38B's stop gate. New authorities pass through - they are the delta a later
 * slice may bind - but any changed or retracted existing DEV_TRAIN authority
 * stops the slice with its own marker, naming the changed fields.
 */
export function requireAdditiveDevTrainContinuity(
  delta: CrossGenerationContinuityDelta,
): CrossGenerationContinuityDelta {
  if (delta.changed.length > 0) {
    const fields = [...new Set(delta.changed.flatMap((result) => result.changedFields))].join(', ');
    refuseV5(
      'STOP_R38B_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
      `${String(delta.changed.length)} existing DEV_TRAIN authority(ies) changed: ${fields}`,
    );
  }
  if (delta.retractedSelectionIndices.length > 0) {
    refuseV5(
      'STOP_R38B_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
      `${String(delta.retractedSelectionIndices.length)} existing DEV_TRAIN authority(ies) are no longer READY`,
    );
  }
  return delta;
}

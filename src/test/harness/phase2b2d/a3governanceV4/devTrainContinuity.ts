/**
 * PHASE 2B-2D — A3 R32: V3 -> V4 DEV_TRAIN AUTHORITY CONTINUITY.
 *
 * The actual authorities are compared, by R26's PURE comparator
 * `compareDevTrainReadyAuthorities` - reused, not restated - which owns the
 * continuity projection (every evidence-relevant field: generation, slot,
 * split, occupant kind, reserve position, organisation, eche row key, draw
 * identity, current occupant, the slot's own ledger chain, disposition,
 * adjudication binding, LIVE_RESULT binding, run reference, policy,
 * transition binding and sealed SD7 commitment) and the exact global-ledger
 * exception (`replacementLedger.{fileSha256, ledgerHash, entryCount}` only).
 * Nothing else gets a free pass - in particular, NOT "the provenance format
 * changed": an unchanged authority's run reference must be byte-identical.
 *
 * R26's snapshot-typed entry point is V1 -> V2 only, so it is NOT used. Each
 * side's READY list is taken through its OWN minting path - V3's through
 * `readyAuthoritiesOfV3`, V4's through `readyAuthoritiesOfV4` - and filtered to
 * DEV_TRAIN here.
 *
 * THE STOP CONDITIONS ARE R32'S
 *
 *   New DEV_TRAIN authorities are R32's EXPECTED finding: they are counted and
 *   handed to a later slice, never evidence-read here. A CHANGED existing
 *   authority or a RETRACTED one each STOPS R32 with its own marker - it is
 *   never papered over as a new provenance format.
 *
 * PURE. No database, no filesystem, no clock, no environment.
 */
import { compareDevTrainReadyAuthorities } from '../a3evidenceV2/authorityDelta.js';
import type { DevTrainReadyAuthorityDelta } from '../a3evidenceV2/types.js';
import {
  isCommittedGovernanceSnapshotV3,
  readyAuthoritiesOfV3,
  type A3CommittedGovernanceSnapshotV3,
} from '../a3governanceV3/snapshotV3.js';
import { refuseV4 } from './refusal.js';
import {
  isCommittedGovernanceSnapshotV4,
  readyAuthoritiesOfV4,
  type A3CommittedGovernanceSnapshotV4,
} from './snapshotV4.js';

export const R32_CONTINUITY_SPLIT = 'DEV_TRAIN';

/** The semantic V3 -> V4 DEV_TRAIN comparison between two MINTED snapshots. */
export function deriveDevTrainAuthorityContinuityV3ToV4(
  v3: A3CommittedGovernanceSnapshotV3,
  v4: A3CommittedGovernanceSnapshotV4,
): DevTrainReadyAuthorityDelta {
  if (!isCommittedGovernanceSnapshotV3(v3)) {
    refuseV4('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4', 'the V3 continuity base was not minted');
  }
  if (!isCommittedGovernanceSnapshotV4(v4)) {
    refuseV4('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4', 'the V4 snapshot was not minted');
  }
  return compareDevTrainReadyAuthorities(
    readyAuthoritiesOfV3(v3).filter((ready) => ready.split === R32_CONTINUITY_SPLIT),
    readyAuthoritiesOfV4(v4).filter((ready) => ready.split === R32_CONTINUITY_SPLIT),
  );
}

/**
 * R32's stop gate. New authorities pass through - they are the delta a later
 * slice binds - but any changed or retracted existing DEV_TRAIN authority
 * stops the slice with its own marker.
 */
export function requireNoChangedOrRetractedDevTrainAuthority(
  delta: DevTrainReadyAuthorityDelta,
): DevTrainReadyAuthorityDelta {
  if (delta.changedExisting.length > 0) {
    refuseV4(
      'STOP_R32_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
      `${delta.changedExisting.length} existing DEV_TRAIN authority(ies) changed an evidence-relevant field`,
    );
  }
  if (delta.removed.length > 0) {
    refuseV4(
      'STOP_R32_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
      `${delta.removed.length} existing DEV_TRAIN authority(ies) are no longer READY`,
    );
  }
  return delta;
}

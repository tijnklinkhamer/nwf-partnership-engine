/**
 * PHASE 2B-2D — A3 R31: V2 -> V3 DEV_TRAIN AUTHORITY CONTINUITY.
 *
 * A DEV_TRAIN READY COUNT IS NOT ENOUGH. Six before and six after could hide
 * one retracted authority and one new one, a changed run of record, a changed
 * occupant or changed provenance. So the actual authorities are compared, by
 * R26's PURE comparator `compareDevTrainReadyAuthorities` - reused, not
 * restated - which owns the continuity projection (every evidence-relevant
 * field) and the exact global-ledger exception
 * (`replacementLedger.{fileSha256, ledgerHash, entryCount}` only).
 *
 * R26's snapshot-typed entry point is V1 -> V2 only, so it is NOT used. Each
 * side's READY list is taken through its OWN minting path - V2's through
 * `readyAuthoritiesOfV2`, V3's through `readyAuthoritiesOfV3` - and filtered to
 * DEV_TRAIN here.
 *
 * THE STOP CONDITIONS ARE R31'S
 *
 *   A new DEV_TRAIN authority, a changed existing one or a retracted one each
 *   STOPS R31 with its own marker. Nothing here reads evidence, calls R26's
 *   binder, opens a database, or re-runs R27-R30: when the delta is zero, the
 *   existing R20 -> R30 coverage already covers every V3 DEV_TRAIN READY
 *   authority, and that is the whole finding.
 *
 * PURE. No database, no filesystem, no clock, no environment.
 */
import { compareDevTrainReadyAuthorities } from '../a3evidenceV2/authorityDelta.js';
import type { DevTrainReadyAuthorityDelta } from '../a3evidenceV2/types.js';
import {
  isCommittedGovernanceSnapshotV2,
  readyAuthoritiesOfV2,
  type A3CommittedGovernanceSnapshotV2,
} from '../a3governanceV2/snapshotV2.js';
import { refuseV3 } from './refusal.js';
import {
  isCommittedGovernanceSnapshotV3,
  readyAuthoritiesOfV3,
  type A3CommittedGovernanceSnapshotV3,
} from './snapshotV3.js';

export const R31_CONTINUITY_SPLIT = 'DEV_TRAIN';

/** The semantic V2 -> V3 DEV_TRAIN comparison between two MINTED snapshots. */
export function deriveDevTrainAuthorityContinuityV2ToV3(
  v2: A3CommittedGovernanceSnapshotV2,
  v3: A3CommittedGovernanceSnapshotV3,
): DevTrainReadyAuthorityDelta {
  if (!isCommittedGovernanceSnapshotV2(v2)) {
    refuseV3('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3', 'the V2 continuity base was not minted');
  }
  if (!isCommittedGovernanceSnapshotV3(v3)) {
    refuseV3('NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3', 'the V3 snapshot was not minted');
  }
  return compareDevTrainReadyAuthorities(
    readyAuthoritiesOfV2(v2).filter((ready) => ready.split === R31_CONTINUITY_SPLIT),
    readyAuthoritiesOfV3(v3).filter((ready) => ready.split === R31_CONTINUITY_SPLIT),
  );
}

/**
 * R31's stop gate. Any new, changed or retracted DEV_TRAIN authority stops the
 * slice with its own marker - never an automatic evidence expansion.
 */
export function requireZeroDevTrainAuthorityDelta(
  delta: DevTrainReadyAuthorityDelta,
): DevTrainReadyAuthorityDelta {
  if (delta.newAuthorities.length > 0) {
    refuseV3(
      'STOP_R31_UNEXPECTED_NEW_DEV_TRAIN_AUTHORITY_REQUIRES_EVIDENCE_DELTA_PLANNING',
      `${delta.newAuthorities.length} new DEV_TRAIN READY authority(ies) appeared in V3`,
    );
  }
  if (delta.changedExisting.length > 0) {
    refuseV3(
      'STOP_R31_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
      `${delta.changedExisting.length} existing DEV_TRAIN authority(ies) changed an evidence-relevant field`,
    );
  }
  if (delta.removed.length > 0) {
    refuseV3(
      'STOP_R31_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
      `${delta.removed.length} existing DEV_TRAIN authority(ies) are no longer READY`,
    );
  }
  return delta;
}

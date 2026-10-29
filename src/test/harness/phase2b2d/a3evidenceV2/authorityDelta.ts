/**
 * PHASE 2B-2D — A3 R26: THE PURE DEV_TRAIN AUTHORITY DELTA.
 *
 * WHAT IS COMPARED, AND WHAT IS NOT
 *
 *   A V1 authority and a V2 authority are continuous ONLY if every
 *   evidence-relevant field of `DevTrainAuthorityContinuityProjection` is
 *   semantically equal. Matching `selectionIndex` is NOT enough: a slot can
 *   keep its index while changing occupant, reserve position, organisation,
 *   run of record, adjudication, policy or transition binding, and every one
 *   of those requires a rebind.
 *
 *   Object identity is never compared across V1 and V2 - each resolution
 *   mints its own objects - so the comparison is over a canonical,
 *   key-sorted rendering of plain values.
 *
 * THE GLOBAL-LEDGER EXCEPTION, EXACTLY
 *
 *   `replacementLedger.{fileSha256, ledgerHash, entryCount}` is the revision
 *   of the WHOLE ledger. V1 bound 8 entries and V2 binds 9, and the ninth
 *   belongs to another slot. Those three fields are therefore excluded from
 *   the projection - and ONLY those. The slot's own ledger semantics (its
 *   current occupant's `ledgerSequence` / `ledgerEntryHash`, its full chain,
 *   `slotChainLedgerEntryHashes`) are compared, so an append that DOES touch
 *   this slot is still a change.
 *
 * PURE
 *
 *   No database, no filesystem, no clock, no environment. The list comparison
 *   takes plain structural values so its semantics are testable on synthetic
 *   authorities; the snapshot entry point additionally proves both snapshots
 *   were minted and takes the READYs only through their own minting paths.
 */
import {
  isCommittedGovernanceSnapshot,
  readyAuthoritiesOf,
  type A3CommittedGovernanceSnapshot,
} from '../a3governance/snapshot.js';
import {
  isCommittedGovernanceSnapshotV2,
  readyAuthoritiesOfV2,
  type A3CommittedGovernanceSnapshotV2,
} from '../a3governanceV2/snapshotV2.js';
import type { A3SlotAcquisitionAuthorityReady } from '../a3prep/slotAuthority.js';
import { refuseV2Evidence } from './refusal.js';
import {
  CHANGED_EXISTING_AUTHORITY,
  DEV_TRAIN_AUTHORITY_CONTINUITY_FIELDS,
  NEW_DEV_TRAIN_READY_AUTHORITY,
  R26_EVIDENCE_SPLIT,
  RETRACTED_EXISTING_AUTHORITY,
  UNCHANGED_CANONICAL_R20_COVERAGE,
  type ChangedExistingAuthority,
  type DevTrainAuthorityContinuityField,
  type DevTrainAuthorityContinuityProjection,
  type DevTrainReadyAuthorityDelta,
  type NewDevTrainReadyAuthority,
  type RetractedExistingAuthority,
  type UnchangedCanonicalCoverage,
} from './types.js';

// ---------------------------------------------------------------------------
// A. CANONICAL RENDERING.
// ---------------------------------------------------------------------------

/**
 * A key-sorted JSON rendering. Two values render equal iff they are equal as
 * plain data, independent of property insertion order. `undefined` is
 * rendered distinctly from `null`, so a field that disappeared is a change.
 */
export function canonicalRender(value: unknown): string {
  if (value === undefined) return '"<undefined>"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalRender).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalRender(record[key])}`).join(',')}}`;
}

// ---------------------------------------------------------------------------
// B. THE PROJECTION.
// ---------------------------------------------------------------------------

/** Every §3 field of one authority, and nothing else. */
export function continuityProjectionOf(
  ready: A3SlotAcquisitionAuthorityReady,
): DevTrainAuthorityContinuityProjection {
  return Object.freeze({
    generationId: ready.generationId,
    selectionIndex: ready.selectionIndex,
    split: ready.split,
    occupantKind: ready.occupantKind,
    reserveRankPosition: ready.reserveRankPosition,
    organisationId: ready.organisationId,
    echeRowKey: ready.echeRowKey,
    drawEntrySha256: ready.drawEntrySha256,
    draw: ready.draw,
    occupant: ready.occupant,
    slotChainLedgerEntryHashes: ready.slotChainLedgerEntryHashes,
    disposition: ready.disposition,
    adjudication: ready.adjudication,
    liveResult: ready.liveResult,
    runRefSha256: ready.runRefSha256,
    acquisitionPolicyVersion: ready.acquisitionPolicyVersion,
    acquisitionPolicyTransitionLedger: ready.acquisitionPolicyTransitionLedger,
    sealedSd7Detail: ready.sealedSd7Detail,
  });
}

/** The §3 field NAMES on which two authorities differ, in the fixed field order. */
export function changedContinuityFields(
  v1: A3SlotAcquisitionAuthorityReady,
  v2: A3SlotAcquisitionAuthorityReady,
): readonly DevTrainAuthorityContinuityField[] {
  const a = continuityProjectionOf(v1);
  const b = continuityProjectionOf(v2);
  return Object.freeze(
    DEV_TRAIN_AUTHORITY_CONTINUITY_FIELDS.filter(
      (field) => canonicalRender(a[field]) !== canonicalRender(b[field]),
    ),
  );
}

function globalLedgerRevisionDiffers(
  v1: A3SlotAcquisitionAuthorityReady,
  v2: A3SlotAcquisitionAuthorityReady,
): boolean {
  return canonicalRender(v1.replacementLedger) !== canonicalRender(v2.replacementLedger);
}

// ---------------------------------------------------------------------------
// C. THE LIST COMPARISON.
// ---------------------------------------------------------------------------

function indexBySelection(
  readies: readonly A3SlotAcquisitionAuthorityReady[],
  side: 'V1' | 'V2',
): Map<number, A3SlotAcquisitionAuthorityReady> {
  const bySelection = new Map<number, A3SlotAcquisitionAuthorityReady>();
  for (const ready of readies) {
    if (ready.split !== R26_EVIDENCE_SPLIT) {
      refuseV2Evidence(
        'R26_AUTHORITY_SPLIT_NOT_SUPPORTED',
        `a ${side} authority outside ${R26_EVIDENCE_SPLIT} reached the delta comparison`,
      );
    }
    if (bySelection.has(ready.selectionIndex)) {
      refuseV2Evidence(
        'R26_DUPLICATE_SELECTION_INDEX',
        `two ${side} READY authorities share one selection index`,
      );
    }
    bySelection.set(ready.selectionIndex, ready);
  }
  return bySelection;
}

/**
 * The pure delta over two DEV_TRAIN READY lists. Analysis only: it classifies,
 * it mints nothing, and it hardcodes no expected count.
 */
export function compareDevTrainReadyAuthorities(
  v1Readies: readonly A3SlotAcquisitionAuthorityReady[],
  v2Readies: readonly A3SlotAcquisitionAuthorityReady[],
): DevTrainReadyAuthorityDelta {
  const v1 = indexBySelection(v1Readies, 'V1');
  const v2 = indexBySelection(v2Readies, 'V2');

  const unchanged: UnchangedCanonicalCoverage[] = [];
  const changedExisting: ChangedExistingAuthority[] = [];
  const removed: RetractedExistingAuthority[] = [];
  const newAuthorities: NewDevTrainReadyAuthority[] = [];

  for (const [selectionIndex, old] of [...v1.entries()].sort((a, b) => a[0] - b[0])) {
    const current = v2.get(selectionIndex);
    if (current === undefined) {
      removed.push(Object.freeze({ classification: RETRACTED_EXISTING_AUTHORITY, v1: old }));
      continue;
    }
    const changedFields = changedContinuityFields(old, current);
    if (changedFields.length > 0) {
      changedExisting.push(
        Object.freeze({
          classification: CHANGED_EXISTING_AUTHORITY,
          v1: old,
          v2: current,
          changedFields,
        }),
      );
      continue;
    }
    unchanged.push(
      Object.freeze({
        classification: UNCHANGED_CANONICAL_R20_COVERAGE,
        v1: old,
        v2: current,
        globalLedgerRevisionDiffers: globalLedgerRevisionDiffers(old, current),
      }),
    );
  }
  for (const [selectionIndex, current] of [...v2.entries()].sort((a, b) => a[0] - b[0])) {
    if (!v1.has(selectionIndex)) {
      newAuthorities.push(
        Object.freeze({ classification: NEW_DEV_TRAIN_READY_AUTHORITY, v2: current }),
      );
    }
  }

  // §17: the unchanged pairs' runs of record form the same ordered set on both sides.
  const v1Runs = unchanged.map((entry) => entry.v1.runRefSha256);
  const v2Runs = unchanged.map((entry) => entry.v2.runRefSha256);
  if (canonicalRender(v1Runs) !== canonicalRender(v2Runs)) {
    refuseV2Evidence(
      'STOP_R26_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
      'the unchanged authorities do not carry the same ordered runs of record in V1 and V2',
    );
  }

  return Object.freeze({
    kind: 'DEV_TRAIN_READY_AUTHORITY_DELTA_ANALYSIS' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    v1ReadyCount: v1.size,
    v2ReadyCount: v2.size,
    unchanged: Object.freeze(unchanged),
    newAuthorities: Object.freeze(newAuthorities),
    changedExisting: Object.freeze(changedExisting),
    removed: Object.freeze(removed),
  });
}

// ---------------------------------------------------------------------------
// D. THE SNAPSHOT ENTRY POINT.
// ---------------------------------------------------------------------------

export function requireMintedSnapshotV1(snapshot: unknown): A3CommittedGovernanceSnapshot {
  if (!isCommittedGovernanceSnapshot(snapshot)) {
    refuseV2Evidence(
      'R26_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V1',
      'the V1 continuity base was not minted by the canonical V1 loader',
    );
  }
  return snapshot;
}

export function requireMintedSnapshotV2(snapshot: unknown): A3CommittedGovernanceSnapshotV2 {
  if (!isCommittedGovernanceSnapshotV2(snapshot)) {
    refuseV2Evidence(
      'R26_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V2',
      'the V2 snapshot was not minted by the committed V2 loader',
    );
  }
  return snapshot;
}

/**
 * §15. The delta between two MINTED snapshots, each read only through its own
 * minting path and filtered to DEV_TRAIN internally. No census JSON is parsed
 * as authority.
 */
export function deriveDevTrainReadyAuthorityDelta(
  v1Snapshot: A3CommittedGovernanceSnapshot,
  v2Snapshot: A3CommittedGovernanceSnapshotV2,
): DevTrainReadyAuthorityDelta {
  const v1 = requireMintedSnapshotV1(v1Snapshot);
  const v2 = requireMintedSnapshotV2(v2Snapshot);
  return compareDevTrainReadyAuthorities(
    readyAuthoritiesOf(v1).filter((ready) => ready.split === R26_EVIDENCE_SPLIT),
    readyAuthoritiesOfV2(v2).filter((ready) => ready.split === R26_EVIDENCE_SPLIT),
  );
}

/**
 * §4 / §5. R26 is an APPEND-ONLY expansion: a changed or retracted old
 * authority stops the slice before any request exists, rather than being
 * quietly re-read alongside the additive delta.
 */
export function requireAdditiveOnlyDelta(
  delta: DevTrainReadyAuthorityDelta,
): DevTrainReadyAuthorityDelta {
  if (delta.changedExisting.length > 0) {
    refuseV2Evidence(
      'STOP_R26_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
      `${delta.changedExisting.length} existing DEV_TRAIN authority(ies) changed an evidence-relevant field`,
    );
  }
  if (delta.removed.length > 0) {
    refuseV2Evidence(
      'STOP_R26_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
      `${delta.removed.length} existing DEV_TRAIN authority(ies) are no longer READY`,
    );
  }
  return delta;
}

/**
 * The authorities R26 may read, and ONLY those: the new ones, after the delta
 * proved additive. There is no path by which an unchanged authority enters
 * this list.
 */
export function deltaAuthoritiesToBind(
  delta: DevTrainReadyAuthorityDelta,
): readonly A3SlotAcquisitionAuthorityReady[] {
  requireAdditiveOnlyDelta(delta);
  return Object.freeze(delta.newAuthorities.map((entry) => entry.v2));
}

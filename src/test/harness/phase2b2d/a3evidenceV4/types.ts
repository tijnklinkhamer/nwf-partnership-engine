/**
 * PHASE 2B-2D — A3 R33: THE GOVERNANCE V4 INCREMENTAL DURABLE-EVIDENCE TYPES.
 *
 * ONE QUESTION R33 ANSWERS
 *
 *   Can the NEW Governance V4 DEV_TRAIN READY authorities - and only those -
 *   be bound to their exact durable working-database runs under R20's
 *   unchanged read-only evidence semantics, while every DEV_TRAIN authority
 *   that was already READY in Governance V3 stays covered solely by the
 *   canonical R20 -> R30 history?
 *
 * TWO KINDS OF COVERAGE, AND WHY THEY ARE DIFFERENT
 *
 *   An UNCHANGED V3 -> V4 authority is covered by canonical history (R20 bound
 *   five, R26 added one, R27-R30 prepared that sixth downstream, R31 and R32
 *   proved all six continuous). R33 does not re-read it, so it carries NO
 *   evidence object here - only a count inside the coverage proof.
 *
 *   A NEW V4 authority is read here, through R20's UNBOUND lower layer, and
 *   only then minted as `A3DurableAcquisitionEvidenceDeltaV4`. That is the
 *   only object in this namespace that means "these rows were bound under
 *   Governance V4".
 *
 * WHAT THESE TYPES DELIBERATELY DO NOT CARRY
 *
 *   No relevance, verdict, label, gold, classifier or threshold field; no
 *   SET_P, SET_R, SD7 or SD9 value; no document assembly; no new digest. R33
 *   stops at raw durable evidence exactly as R20 and R26 did.
 */
import type { A3SlotAcquisitionAuthorityReady } from '../a3prep/slotAuthority.js';
import type { A3CommittedGovernanceSnapshotV3 } from '../a3governanceV3/snapshotV3.js';
import type { A3CommittedGovernanceSnapshotV4 } from '../a3governanceV4/snapshotV4.js';
import type { UnboundDurableRunEvidence } from '../a3evidence/types.js';

/**
 * R33 supports EXACTLY ONE split, as R20 and R26 do. A constant, never a
 * parameter: reading any other split must not be a one-argument change.
 */
export const R33_EVIDENCE_SPLIT = 'DEV_TRAIN' as const;
export type R33EvidenceSplit = typeof R33_EVIDENCE_SPLIT;

/**
 * Durable evidence NEWLY bound under Governance V4, for ONE delta authority.
 * Minted only by `devTrain.ts`, branded by a private `WeakSet`.
 */
export interface A3DurableAcquisitionEvidenceDeltaV4 {
  readonly kind: 'A3_DURABLE_ACQUISITION_EVIDENCE_DELTA_V4';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R33EvidenceSplit;
  /** The ACTUAL V4-minted READY authority, by reference. */
  readonly authority: A3SlotAcquisitionAuthorityReady;
  /** The ACTUAL V4 snapshot that minted it, by reference. */
  readonly governanceSnapshotV4: A3CommittedGovernanceSnapshotV4;
  readonly evidence: UnboundDurableRunEvidence;
}

/**
 * The canonical evidence coverage R20 -> R30 already established, as the
 * committed aggregate records state it. Read, never re-derived: re-deriving it
 * would need exactly the database read R33 exists to avoid.
 */
export interface CanonicalHistoricalEvidenceCoverage {
  readonly r20BoundAuthorityCount: number;
  readonly r26NewlyBoundAuthorityCount: number;
  readonly r26CoverageAfterExpansionCount: number;
  readonly r30CoverageReadinessSlotCount: number;
  readonly r31UnchangedV2ToV3DevTrainAuthorityCount: number;
  readonly historicalCanonicalCoverageCount: number;
}

/**
 * The aggregate coverage proof. It is NOT a thirteen-item evidence batch: the
 * unchanged authorities are covered by canonical history, which this slice
 * neither re-read nor re-minted.
 */
export interface A3DevTrainCanonicalEvidenceCoverageExpansionV4 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_EVIDENCE_COVERAGE_EXPANSION_V4';
  readonly historicalCanonicalCoverageCount: number;
  readonly v3DevTrainReadyCount: number;
  readonly v4DevTrainReadyCount: number;
  readonly unchangedCanonicalCoverageCount: number;
  readonly newlyBoundDeltaCount: number;
  readonly changedExistingCount: 0;
  readonly removedCount: 0;
  readonly coverageAfterExpansionCount: number;
  /** Evidence requests built for unchanged authorities. Always zero. */
  readonly legacyAuthorityEvidenceRequests: 0;
  readonly deltaAuthorityEvidenceRequests: number;
}

/** The delta batch. Branded; never serialised; holds ONLY delta items. */
export interface A3DevTrainDurableEvidenceDeltaBatchV4 {
  readonly kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V4';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R33EvidenceSplit;
  readonly governanceSnapshotV4: A3CommittedGovernanceSnapshotV4;
  /** The V3 snapshot the continuity proof compared against. Never read for evidence. */
  readonly continuityBaseV3: A3CommittedGovernanceSnapshotV3;
  readonly items: readonly A3DurableAcquisitionEvidenceDeltaV4[];
  readonly coverage: A3DevTrainCanonicalEvidenceCoverageExpansionV4;
}

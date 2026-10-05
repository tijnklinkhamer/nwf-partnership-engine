/**
 * PHASE 2B-2D — A3 R39: THE GOVERNANCE V5 INCREMENTAL DURABLE-EVIDENCE TYPES.
 *
 * ONE QUESTION R39 ANSWERS
 *
 *   Can the seven genuinely NEW Governance V5 DEV_TRAIN authorities - and only
 *   those seven - be bound to their exact durable working-database acquisition
 *   runs under unchanged R20 lower evidence semantics, while the thirteen
 *   V4 -> V5 UNCHANGED authorities retain their canonical R33 -> R37 evidence
 *   and downstream coverage without being re-read or reminted?
 *
 * WHY A SIBLING OF R33 AND NOT A REUSE OF IT
 *
 *   Governance V5's READY authorities are R38A CROSS-GENERATION authorities,
 *   not R17 READYs. R20's `evidenceRequestForAuthority` belongs to the R17
 *   shape and stays exactly that: it is neither called nor broadened here.
 *   R39 owns its own V5 verification, its own four-field request adapter and
 *   its own mint; from R20 it takes only the authority-free lower reader.
 *
 * TWO KINDS OF COVERAGE, AND WHY THEY ARE DIFFERENT
 *
 *   An UNCHANGED V4 -> V5 authority is covered by canonical history (R33 bound
 *   its evidence, R34 -> R37 carried it downstream). R39 does not re-read it,
 *   so it carries NO evidence object here - only a count inside the coverage
 *   proof. A NEW V5 authority is read here and only then minted as
 *   `A3DurableAcquisitionEvidenceDeltaV5`.
 *
 * WHAT THESE TYPES DELIBERATELY DO NOT CARRY
 *
 *   No relevance, verdict, label, gold, classifier or threshold field; no
 *   SET_P, SET_R, SD7 or SD9 value; no document assembly; no new digest. R39
 *   stops at raw durable evidence exactly as R20, R26 and R33 did.
 */
import type { A3CrossGenerationSlotAcquisitionAuthorityReady } from '../a3crossGenerationSlotAuthority/types.js';
import type { A3CommittedGovernanceSnapshotV4 } from '../a3governanceV4/snapshotV4.js';
import type { A3CommittedGovernanceSnapshotV5 } from '../a3governanceV5/snapshotV5.js';
import type { UnboundDurableRunEvidence } from '../a3evidence/types.js';

/**
 * R39 supports EXACTLY ONE split, as R20, R26 and R33 do. A constant, never a
 * parameter: reading any other split must not be a one-argument change.
 */
export const R39_EVIDENCE_SPLIT = 'DEV_TRAIN' as const;
export type R39EvidenceSplit = typeof R39_EVIDENCE_SPLIT;

/**
 * Durable evidence NEWLY bound under Governance V5, for ONE delta authority.
 * Minted only by `devTrain.ts`, branded by a private `WeakSet`.
 */
export interface A3DurableAcquisitionEvidenceDeltaV5 {
  readonly kind: 'A3_DURABLE_ACQUISITION_EVIDENCE_DELTA_V5';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R39EvidenceSplit;
  /** The ACTUAL V5-minted cross-generation READY authority, by reference. */
  readonly authority: A3CrossGenerationSlotAcquisitionAuthorityReady;
  /** The ACTUAL V5 snapshot that minted it, by reference. */
  readonly governanceSnapshotV5: A3CommittedGovernanceSnapshotV5;
  readonly evidence: UnboundDurableRunEvidence;
}

/**
 * The canonical evidence and readiness coverage R33 -> R37 already
 * established, as the committed aggregate records state it, closed against a
 * FRESH V4 snapshot and a FRESH V4 -> V5 continuity. Read, never re-derived:
 * re-deriving it would need exactly the database read R39 exists to avoid.
 */
export interface CanonicalHistoricalV5EvidenceCoverageProof {
  readonly kind: 'CANONICAL_HISTORICAL_V5_EVIDENCE_COVERAGE_PROOF';
  readonly r33HistoricalPriorEvidenceCount: number;
  readonly r33NewlyBoundEvidenceCount: number;
  readonly r33EvidenceCoverageCount: number;
  readonly r33V4DevTrainReadyCount: number;
  readonly r37HistoricalReadinessSlotCount: number;
  readonly r37NewReadinessSlotCount: number;
  readonly r37ReadinessCoverageCount: number;
  readonly freshV4DevTrainReadyCount: number;
  readonly freshV4ToV5UnchangedCount: number;
  readonly historicalCanonicalEvidenceCoverageCount: number;
  readonly historicalCanonicalReadinessCoverageCount: number;
}

/**
 * The aggregate coverage proof. It is NOT a twenty-item evidence batch: the
 * unchanged authorities are covered by canonical history, which this slice
 * neither re-read nor re-minted. Downstream readiness coverage stays at the
 * historical count: R39 performs no document, graph, sample or readiness work.
 */
export interface A3DevTrainCanonicalEvidenceCoverageExpansionV5 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_EVIDENCE_COVERAGE_EXPANSION_V5';
  readonly historicalCanonicalEvidenceCoverageCount: number;
  readonly historicalCanonicalReadinessCoverageCount: number;
  readonly v4DevTrainReadyCount: number;
  readonly v5DevTrainReadyCount: number;
  readonly unchangedCanonicalCoverageCount: number;
  readonly newlyBoundDeltaCount: number;
  readonly changedExistingCount: 0;
  readonly removedCount: 0;
  readonly coverageAfterExpansionCount: number;
  /** Evidence requests built for unchanged authorities. Always zero. */
  readonly legacyAuthorityEvidenceRequests: 0;
  readonly deltaAuthorityEvidenceRequests: number;
  readonly downstreamReadinessCoverageCountAfterR39: number;
}

/** The delta batch. Branded; never serialised; holds ONLY delta items. */
export interface A3DevTrainDurableEvidenceDeltaBatchV5 {
  readonly kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V5';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R39EvidenceSplit;
  readonly governanceSnapshotV5: A3CommittedGovernanceSnapshotV5;
  /** The V4 snapshot the continuity proof compared against. Never read for evidence. */
  readonly continuityBaseV4: A3CommittedGovernanceSnapshotV4;
  readonly items: readonly A3DurableAcquisitionEvidenceDeltaV5[];
  readonly coverage: A3DevTrainCanonicalEvidenceCoverageExpansionV5;
}

/**
 * What the real-run entry point OBSERVED about its own database access,
 * counted in-process by wrapping the caller's pool - never supplied by a
 * caller. Counts only: no parameter value survives into this object.
 */
export interface R39DatabaseAccessObservation {
  readonly poolConnections: number;
  readonly snapshotTransactions: number;
  readonly sqlStatements: number;
  readonly lowerEvidenceLoads: number;
  readonly candidateRunLookups: number;
  readonly candidateRunLookupsForNewAuthorities: number;
  readonly unchangedAuthorityIdentityParameterHits: number;
  readonly devConfirmIdentityParameterHits: number;
  readonly finalHoldoutIdentityParameterHits: number;
  readonly writeStatements: number;
}

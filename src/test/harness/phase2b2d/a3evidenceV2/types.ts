/**
 * PHASE 2B-2D — A3 R26: THE INCREMENTAL DURABLE-EVIDENCE TYPES.
 *
 * ONE QUESTION R26 ANSWERS
 *
 *   Which Governance V2 DEV_TRAIN READY authorities are genuinely NEW or
 *   CHANGED relative to the canonical Governance V1 authority set, and can
 *   ONLY that delta be bound to durable working-database evidence without
 *   re-reading or redefining the authorities R20 already bound?
 *
 * TWO KINDS OF COVERAGE, AND WHY THEY ARE DIFFERENT TYPES
 *
 *   An UNCHANGED authority is covered by R20's canonical history. R26 did not
 *   re-read it, so it carries no evidence here - only a continuity proof that
 *   its V1 and V2 authorities are semantically the same slot, occupant, run
 *   of record and provenance. Wrapping R20's rows (which this process never
 *   loaded) in a V2 evidence object would manufacture evidence R26 does not
 *   hold.
 *
 *   A NEW authority is read here, through R20's UNBOUND lower layer, and only
 *   then minted as `A3DurableAcquisitionEvidenceDeltaV2`. That is the only
 *   object in this namespace that means "these rows were bound under
 *   Governance V2".
 *
 * WHAT THESE TYPES DELIBERATELY DO NOT CARRY
 *
 *   No relevance, verdict, label, gold, classifier or threshold field; no
 *   SET_P, SET_R, SD7 or SD9 value; no document assembly. R26 stops at raw
 *   durable evidence exactly as R20 did.
 */
import type { A3SlotAcquisitionAuthorityReady } from '../a3prep/slotAuthority.js';
import type { A3CommittedGovernanceSnapshot } from '../a3governance/snapshot.js';
import type { A3CommittedGovernanceSnapshotV2 } from '../a3governanceV2/snapshotV2.js';
import type { UnboundDurableRunEvidence } from '../a3evidence/types.js';

/**
 * R26 supports EXACTLY ONE split, as R20 V1 does. A constant, never a
 * parameter: reading DEV_CONFIRM or FINAL_HOLDOUT must not be a one-argument
 * change.
 */
export const R26_EVIDENCE_SPLIT = 'DEV_TRAIN' as const;
export type R26EvidenceSplit = typeof R26_EVIDENCE_SPLIT;

// ---------------------------------------------------------------------------
// A. THE CONTINUITY COMPARISON.
// ---------------------------------------------------------------------------

/**
 * The evidence-relevant semantics of ONE READY authority, projected onto
 * plain values so that two authorities minted by DIFFERENT resolutions can be
 * compared field by field. Object identity is never compared across V1 and
 * V2: each resolution mints its own objects.
 *
 * THE ONE DELIBERATE OMISSION: the GLOBAL replacement-ledger revision
 * (`replacementLedger.fileSha256` / `ledgerHash` / `entryCount`). V1 bound the
 * 8-entry ledger and V2 binds the 9-entry ledger, and an entry appended for a
 * DIFFERENT slot must not make every old authority look changed. This
 * authority's OWN slot-local ledger semantics - its current occupant's
 * ledger sequence and entry hash, its full chain, and
 * `slotChainLedgerEntryHashes` - ARE compared, so a ledger change that
 * touches this slot is still detected.
 */
export interface DevTrainAuthorityContinuityProjection {
  readonly generationId: string;
  readonly selectionIndex: number;
  readonly split: string;
  readonly occupantKind: string;
  readonly reserveRankPosition: number | null;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly drawEntrySha256: string;
  readonly draw: unknown;
  readonly occupant: unknown;
  readonly slotChainLedgerEntryHashes: readonly string[];
  readonly disposition: string;
  readonly adjudication: unknown;
  readonly liveResult: unknown;
  readonly runRefSha256: string;
  readonly acquisitionPolicyVersion: string;
  readonly acquisitionPolicyTransitionLedger: unknown;
  readonly sealedSd7Detail: unknown;
}

/** The names of every compared field, in a fixed order. */
export const DEV_TRAIN_AUTHORITY_CONTINUITY_FIELDS = Object.freeze([
  'generationId',
  'selectionIndex',
  'split',
  'occupantKind',
  'reserveRankPosition',
  'organisationId',
  'echeRowKey',
  'drawEntrySha256',
  'draw',
  'occupant',
  'slotChainLedgerEntryHashes',
  'disposition',
  'adjudication',
  'liveResult',
  'runRefSha256',
  'acquisitionPolicyVersion',
  'acquisitionPolicyTransitionLedger',
  'sealedSd7Detail',
] as const satisfies readonly (keyof DevTrainAuthorityContinuityProjection)[]);

export type DevTrainAuthorityContinuityField =
  (typeof DEV_TRAIN_AUTHORITY_CONTINUITY_FIELDS)[number];

/**
 * The global fields that MAY differ between V1 and V2 for an unchanged
 * authority - and nothing else may.
 */
export const GLOBAL_LEDGER_REVISION_FIELDS = Object.freeze([
  'replacementLedger.fileSha256',
  'replacementLedger.ledgerHash',
  'replacementLedger.entryCount',
] as const);

export const UNCHANGED_CANONICAL_R20_COVERAGE = 'UNCHANGED_CANONICAL_R20_COVERAGE' as const;
export const NEW_DEV_TRAIN_READY_AUTHORITY = 'NEW_DEV_TRAIN_READY_AUTHORITY' as const;
export const CHANGED_EXISTING_AUTHORITY = 'CHANGED_EXISTING_AUTHORITY' as const;
export const RETRACTED_EXISTING_AUTHORITY = 'RETRACTED_EXISTING_AUTHORITY' as const;

/** An old authority whose continuity was proved. Carries NO evidence. */
export interface UnchangedCanonicalCoverage {
  readonly classification: typeof UNCHANGED_CANONICAL_R20_COVERAGE;
  readonly v1: A3SlotAcquisitionAuthorityReady;
  readonly v2: A3SlotAcquisitionAuthorityReady;
  /** True when ONLY the global ledger revision differs; false when it is identical too. */
  readonly globalLedgerRevisionDiffers: boolean;
}

export interface NewDevTrainReadyAuthority {
  readonly classification: typeof NEW_DEV_TRAIN_READY_AUTHORITY;
  readonly v2: A3SlotAcquisitionAuthorityReady;
}

export interface ChangedExistingAuthority {
  readonly classification: typeof CHANGED_EXISTING_AUTHORITY;
  readonly v1: A3SlotAcquisitionAuthorityReady;
  readonly v2: A3SlotAcquisitionAuthorityReady;
  /** Field NAMES only - never values. */
  readonly changedFields: readonly DevTrainAuthorityContinuityField[];
}

export interface RetractedExistingAuthority {
  readonly classification: typeof RETRACTED_EXISTING_AUTHORITY;
  readonly v1: A3SlotAcquisitionAuthorityReady;
}

/**
 * The pure analysis result. It mints nothing and authorises nothing: it says
 * only how two authority sets relate.
 */
export interface DevTrainReadyAuthorityDelta {
  readonly kind: 'DEV_TRAIN_READY_AUTHORITY_DELTA_ANALYSIS';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly v1ReadyCount: number;
  readonly v2ReadyCount: number;
  readonly unchanged: readonly UnchangedCanonicalCoverage[];
  readonly newAuthorities: readonly NewDevTrainReadyAuthority[];
  readonly changedExisting: readonly ChangedExistingAuthority[];
  readonly removed: readonly RetractedExistingAuthority[];
}

// ---------------------------------------------------------------------------
// B. THE MINTED DELTA EVIDENCE.
// ---------------------------------------------------------------------------

/**
 * Durable evidence NEWLY bound under Governance V2, for ONE delta authority.
 * Minted only by `devTrain.ts`, branded by a private `WeakSet`.
 */
export interface A3DurableAcquisitionEvidenceDeltaV2 {
  readonly kind: 'A3_DURABLE_ACQUISITION_EVIDENCE_DELTA_V2';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R26EvidenceSplit;
  /** The ACTUAL V2-minted READY authority, by reference. */
  readonly authority: A3SlotAcquisitionAuthorityReady;
  /** The ACTUAL V2 snapshot that minted it, by reference. */
  readonly governanceSnapshotV2: A3CommittedGovernanceSnapshotV2;
  readonly evidence: UnboundDurableRunEvidence;
}

/**
 * The aggregate coverage proof. It is NOT a six-item evidence batch: the
 * unchanged authorities are covered by R20's canonical history, which this
 * slice neither re-read nor re-minted.
 */
export interface A3DevTrainCanonicalEvidenceCoverageExpansionV2 {
  readonly kind: 'A3_DEV_TRAIN_CANONICAL_EVIDENCE_COVERAGE_EXPANSION_V2';
  readonly v1CanonicalCoveredAuthorityCount: number;
  readonly v2ReadyAuthorityCount: number;
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
export interface A3DevTrainDurableEvidenceDeltaBatchV2 {
  readonly kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V2';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R26EvidenceSplit;
  readonly governanceSnapshotV2: A3CommittedGovernanceSnapshotV2;
  /** The V1 snapshot the continuity proof compared against. Never read for evidence. */
  readonly continuityBaseV1: A3CommittedGovernanceSnapshot;
  readonly items: readonly A3DurableAcquisitionEvidenceDeltaV2[];
  readonly coverage: A3DevTrainCanonicalEvidenceCoverageExpansionV2;
}

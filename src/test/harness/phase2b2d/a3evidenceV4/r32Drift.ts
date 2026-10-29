/**
 * PHASE 2B-2D — A3 R33: THE PRE-READ DRIFT AND HISTORY CHECKS.
 *
 * Two cross-checks run BEFORE any database connection, and neither is
 * authority for the delta - the delta comes only from the minted snapshots:
 *
 *   1. §5 GOVERNANCE DRIFT. Freshly derived V3 and V4 governance must still be
 *      the R32 checkpoint, and the freshly derived R32 public census must equal
 *      the committed one under canonical structural comparison. The checkpoint
 *      numbers are pinned HERE, as the checkpoint R33 was cut against - never
 *      inside the generic delta or binder.
 *
 *   2. §5 CANONICAL HISTORY. The committed R20, R26, R30 and R31 aggregate
 *      records are read as history only and must still say: R20 bound five
 *      DEV_TRAIN authorities, R26 added one (six), R27-R30 carried that sixth
 *      through downstream preparation (six readiness slots), and R31 found all
 *      six continuous from V2 to V3. None of them is re-derived: that would
 *      need exactly the database read R33 exists to avoid.
 *
 * Both proofs are branded in this process. The binder accepts only a proof
 * minted here, for the very snapshots it is binding.
 *
 * All inputs arrive as already-parsed values: this module reads no file.
 */
import { readyAuthoritiesOfV3 } from '../a3governanceV3/snapshotV3.js';
import type { A3CommittedGovernanceSnapshotV3 } from '../a3governanceV3/snapshotV3.js';
import { derivePublicGovernanceAuthorityCensusV4 } from '../a3governanceV4/census.js';
import {
  readyAuthoritiesOfV4,
  type A3CommittedGovernanceSnapshotV4,
} from '../a3governanceV4/snapshotV4.js';
import { canonicalRender } from '../a3evidenceV2/authorityDelta.js';
import {
  deriveDevTrainEvidenceDeltaV4,
  requireMintedSnapshotV3,
  requireMintedSnapshotV4,
} from './authorityDelta.js';
import { refuseV4Evidence } from './refusal.js';
import { R33_EVIDENCE_SPLIT, type CanonicalHistoricalEvidenceCoverage } from './types.js';

/** The R32 checkpoint R33 was cut against. */
export const R33_EXPECTED_GOVERNANCE_CHECKPOINT = Object.freeze({
  v3ReadyTotal: 29,
  v4ReadyTotal: 69,
  v4UnsuccessfulCurrentOccupants: 3,
  v4PendingAdjudication: 0,
  v4NoTerminalEvidence: 38,
  v4ReservesConsumed: 30,
  v4ReservesUnused: 10,
  v3DevTrainReady: 6,
  v4DevTrainReady: 13,
  unchangedDevTrain: 6,
  newDevTrain: 7,
  changedExistingDevTrain: 0,
  removedDevTrain: 0,
});

/** The canonical R20 -> R31 history, as the committed aggregate records state it. */
export const R33_EXPECTED_CANONICAL_HISTORY = Object.freeze({
  r20Record: 'PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1',
  r26Record: 'PHASE_2B_2D_A3_R26_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1',
  r30Record: 'PHASE_2B_2D_A3_R30_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1',
  r31Record: 'PHASE_2B_2D_A3_R31_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V3',
  r20BoundAuthorityCount: 5,
  r26NewlyBoundAuthorityCount: 1,
  historicalCanonicalCoverageCount: 6,
});

export interface GovernanceDriftProofV4 {
  readonly v3ReadyTotal: number;
  readonly v4ReadyTotal: number;
  readonly v4UnsuccessfulCurrentOccupants: number;
  readonly v4PendingAdjudication: number;
  readonly v4NoTerminalEvidence: number;
  readonly v4ReservesConsumed: number;
  readonly v4ReservesUnused: number;
  readonly v3DevTrainReady: number;
  readonly v4DevTrainReady: number;
  readonly unchangedDevTrain: number;
  readonly newDevTrain: number;
  readonly changedExistingDevTrain: number;
  readonly removedDevTrain: number;
  readonly r32CensusSemanticsUnchanged: true;
}

const DRIFT_PROOF_SNAPSHOTS = new WeakMap<
  object,
  { readonly v3: A3CommittedGovernanceSnapshotV3; readonly v4: A3CommittedGovernanceSnapshotV4 }
>();
const HISTORY_PROOFS = new WeakSet<object>();

function drift(message: string): never {
  refuseV4Evidence('STOP_R33_GOVERNANCE_SNAPSHOT_DRIFT_REQUIRES_REVIEW', message);
}

function historyDrift(message: string): never {
  refuseV4Evidence('STOP_R33_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW', message);
}

/** §5. Fresh V3/V4 governance still equals the R32 checkpoint and its committed census. */
export function requireNoGovernanceDriftV4(
  v3Snapshot: A3CommittedGovernanceSnapshotV3,
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
  committedR32Census: unknown,
): GovernanceDriftProofV4 {
  const v3 = requireMintedSnapshotV3(v3Snapshot);
  const v4 = requireMintedSnapshotV4(v4Snapshot);
  const r3 = readyAuthoritiesOfV3(v3);
  const r4 = readyAuthoritiesOfV4(v4);
  const summary = v4.resolution.summary;
  const delta = deriveDevTrainEvidenceDeltaV4(v3, v4);
  const observed = {
    v3ReadyTotal: r3.length,
    v4ReadyTotal: r4.length,
    v4UnsuccessfulCurrentOccupants: summary.unsuccessfulCurrentOccupantCount,
    v4PendingAdjudication: summary.pendingAdjudicationCount,
    v4NoTerminalEvidence: summary.noTerminalEvidenceCount,
    v4ReservesConsumed: summary.reserveConsumedCount,
    v4ReservesUnused: summary.reserveUnusedCount,
    v3DevTrainReady: r3.filter((ready) => ready.split === R33_EVIDENCE_SPLIT).length,
    v4DevTrainReady: r4.filter((ready) => ready.split === R33_EVIDENCE_SPLIT).length,
    unchangedDevTrain: delta.unchanged.length,
    newDevTrain: delta.newAuthorities.length,
    changedExistingDevTrain: delta.changedExisting.length,
    removedDevTrain: delta.removed.length,
  };
  for (const [key, expected] of Object.entries(R33_EXPECTED_GOVERNANCE_CHECKPOINT)) {
    if (observed[key as keyof typeof observed] !== expected) {
      drift(`${key} no longer equals the R32 checkpoint`);
    }
  }
  const derived = JSON.parse(
    JSON.stringify(derivePublicGovernanceAuthorityCensusV4(v4, v3)),
  ) as unknown;
  if (canonicalRender(derived) !== canonicalRender(committedR32Census)) {
    drift('the freshly derived R32 public census differs from the committed one');
  }
  const proof: GovernanceDriftProofV4 = Object.freeze({
    ...observed,
    r32CensusSemanticsUnchanged: true as const,
  });
  DRIFT_PROOF_SNAPSHOTS.set(proof, Object.freeze({ v3, v4 }));
  return proof;
}

/** A drift proof THIS module minted for exactly these snapshots, or a refusal. */
export function requireDriftProofFor(
  proof: unknown,
  v3: A3CommittedGovernanceSnapshotV3,
  v4: A3CommittedGovernanceSnapshotV4,
): GovernanceDriftProofV4 {
  const bound =
    typeof proof === 'object' && proof !== null ? DRIFT_PROOF_SNAPSHOTS.get(proof) : undefined;
  if (bound === undefined || bound.v3 !== v3 || bound.v4 !== v4) {
    drift('no governance drift proof was minted for the snapshots supplied');
  }
  return proof as GovernanceDriftProofV4;
}

function field(record: unknown, ...path: readonly string[]): unknown {
  let value: unknown = record;
  for (const key of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/**
 * §5. The committed R20, R26, R30 and R31 records still state the canonical
 * six-authority history, and its own arithmetic still closes:
 * R20 5 + R26 1 = 6 = R30 readiness coverage = R31 V2 -> V3 unchanged.
 */
export function requireCanonicalHistoricalCoverage(records: {
  readonly r20: unknown;
  readonly r26: unknown;
  readonly r30: unknown;
  readonly r31: unknown;
}): CanonicalHistoricalEvidenceCoverage {
  const expected = R33_EXPECTED_CANONICAL_HISTORY;
  const { r20, r26, r30, r31 } = records;
  const checks: [string, unknown, unknown][] = [
    ['R20 record', field(r20, 'record'), expected.r20Record],
    ['R20 split', field(r20, 'split'), R33_EVIDENCE_SPLIT],
    [
      'R20 bound authorities',
      field(r20, 'binding', 'readyAuthoritiesForSplit'),
      expected.r20BoundAuthorityCount,
    ],
    ['R20 matched runs', field(r20, 'binding', 'matchedRuns'), expected.r20BoundAuthorityCount],
    ['R26 record', field(r26, 'record'), expected.r26Record],
    ['R26 split', field(r26, 'split'), R33_EVIDENCE_SPLIT],
    [
      'R26 canonical R20 coverage',
      field(r26, 'governanceDelta', 'r20CanonicalEvidenceCoverageCount'),
      expected.r20BoundAuthorityCount,
    ],
    [
      'R26 newly bound',
      field(r26, 'governanceDelta', 'r26NewlyBoundEvidenceCount'),
      expected.r26NewlyBoundAuthorityCount,
    ],
    [
      'R26 coverage after expansion',
      field(r26, 'governanceDelta', 'totalAuthorityCoverageAfterExpansion'),
      expected.historicalCanonicalCoverageCount,
    ],
    ['R26 changed existing', field(r26, 'governanceDelta', 'changedExistingAuthorityCount'), 0],
    ['R26 removed', field(r26, 'governanceDelta', 'removedAuthorityCount'), 0],
    ['R26 legacy queries', field(r26, 'databaseAccess', 'legacyAuthorityEvidenceQueries'), 0],
    ['R30 record', field(r30, 'record'), expected.r30Record],
    ['R30 split', field(r30, 'split'), R33_EVIDENCE_SPLIT],
    [
      'R30 historical readiness slots',
      field(r30, 'coverage', 'historicalCanonicalR24ReadinessSlots'),
      expected.r20BoundAuthorityCount,
    ],
    [
      'R30 new readiness slots',
      field(r30, 'coverage', 'newR30ReadinessSlots'),
      expected.r26NewlyBoundAuthorityCount,
    ],
    [
      'R30 coverage readiness slots',
      field(r30, 'coverage', 'coverageReadinessSlots'),
      expected.historicalCanonicalCoverageCount,
    ],
    ['R31 record', field(r31, 'record'), expected.r31Record],
    [
      'R31 V2 DEV_TRAIN READY',
      field(r31, 'devTrainAuthorityDelta', 'v2ReadyCount'),
      expected.historicalCanonicalCoverageCount,
    ],
    [
      'R31 V3 DEV_TRAIN READY',
      field(r31, 'devTrainAuthorityDelta', 'v3ReadyCount'),
      expected.historicalCanonicalCoverageCount,
    ],
    [
      'R31 unchanged',
      field(r31, 'devTrainAuthorityDelta', 'unchangedCount'),
      expected.historicalCanonicalCoverageCount,
    ],
    ['R31 new', field(r31, 'devTrainAuthorityDelta', 'newCount'), 0],
    ['R31 changed existing', field(r31, 'devTrainAuthorityDelta', 'changedExistingCount'), 0],
    ['R31 removed', field(r31, 'devTrainAuthorityDelta', 'removedCount'), 0],
  ];
  for (const [name, observed, wanted] of checks) {
    if (observed !== wanted) historyDrift(`${name} differs from the canonical history`);
  }
  const r20Bound = field(r20, 'binding', 'readyAuthoritiesForSplit') as number;
  const r26New = field(r26, 'governanceDelta', 'r26NewlyBoundEvidenceCount') as number;
  const r26Total = field(r26, 'governanceDelta', 'totalAuthorityCoverageAfterExpansion') as number;
  const r30Total = field(r30, 'coverage', 'coverageReadinessSlots') as number;
  const r31Unchanged = field(r31, 'devTrainAuthorityDelta', 'unchangedCount') as number;
  if (r20Bound + r26New !== r26Total || r26Total !== r30Total || r30Total !== r31Unchanged) {
    historyDrift('the canonical history arithmetic does not close');
  }
  const proof: CanonicalHistoricalEvidenceCoverage = Object.freeze({
    r20BoundAuthorityCount: r20Bound,
    r26NewlyBoundAuthorityCount: r26New,
    r26CoverageAfterExpansionCount: r26Total,
    r30CoverageReadinessSlotCount: r30Total,
    r31UnchangedV2ToV3DevTrainAuthorityCount: r31Unchanged,
    historicalCanonicalCoverageCount: r26Total,
  });
  HISTORY_PROOFS.add(proof);
  return proof;
}

/** A history proof THIS module minted, or a refusal. */
export function requireHistoricalCoverageProof(
  proof: unknown,
): CanonicalHistoricalEvidenceCoverage {
  if (typeof proof !== 'object' || proof === null || !HISTORY_PROOFS.has(proof)) {
    historyDrift('the canonical history coverage was not proved from the committed records');
  }
  return proof as CanonicalHistoricalEvidenceCoverage;
}

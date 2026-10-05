/**
 * PHASE 2B-2D — A3 R39: THE CANONICAL R33 -> R37 HISTORICAL COVERAGE PROOF.
 *
 * The thirteen V4 -> V5 UNCHANGED DEV_TRAIN authorities generate ZERO
 * evidence requests. That is safe only if canonical history already covers
 * exactly them, so before any connection R39 proves it from the committed
 * aggregate records - read as HISTORY ONLY, never as authority:
 *
 *   R33  DEV_TRAIN; Governance V4 DEV_TRAIN READY = 13; historical prior
 *        evidence 6 + R33 newly bound 7 = 13 = coverage, coverage equal to V4
 *        READY, and no unchanged authority rebound;
 *   R37  DEV_TRAIN; historical readiness 6 + new 7 = 13 readiness coverage
 *        slots, the historical states neither recomputed nor reminted.
 *
 * and then closes them against FRESH governance:
 *
 *   R33 evidence coverage = R37 readiness coverage = fresh V4 DEV_TRAIN READY
 *   = fresh V4 -> V5 unchanged count, and the unchanged slots ARE the V4
 *   DEV_TRAIN READY slots (set equality, not just equal counts). R33 is also
 *   pinned to the very V4 registry and checkpoint the fresh snapshot carries.
 *
 * No database row is derived. The proof is branded in this process and bound
 * by identity to the exact V4 snapshot and derived continuity it was closed
 * against; a copy is not one.
 *
 * All inputs arrive as already-parsed values: this module reads no file.
 */
import type { CrossGenerationContinuityDelta } from '../a3crossGenerationSlotAuthority/continuity.js';
import {
  readyAuthoritiesOfV4,
  type A3CommittedGovernanceSnapshotV4,
} from '../a3governanceV4/snapshotV4.js';
import { governanceSnapshotV4ForDerivedDelta, requireMintedSnapshotV4 } from './authorityDelta.js';
import { refuseV5Evidence } from './refusal.js';
import { R39_EVIDENCE_SPLIT, type CanonicalHistoricalV5EvidenceCoverageProof } from './types.js';

/** The canonical R33 -> R37 history, as the committed aggregate records state it. */
export const R39_EXPECTED_CANONICAL_HISTORY = Object.freeze({
  r33Record: 'PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1',
  r33RecordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_EVIDENCE_CENSUS',
  r37Record: 'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1',
  r37RecordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS',
  historicalPriorCount: 6,
  r33NewlyBoundCount: 7,
  canonicalCoverageCount: 13,
});

interface HistoryBinding {
  readonly v4: A3CommittedGovernanceSnapshotV4;
  readonly delta: CrossGenerationContinuityDelta;
}

const HISTORY_PROOFS = new WeakMap<object, HistoryBinding>();

function historyDrift(message: string): never {
  refuseV5Evidence('STOP_R39_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW', message);
}

function field(record: unknown, ...path: readonly string[]): unknown {
  let value: unknown = record;
  for (const key of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function count(record: unknown, ...path: readonly string[]): number {
  const value = field(record, ...path);
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    historyDrift(`${path.join('.')} is not an integer count in the committed record`);
  }
  return value;
}

/**
 * §11. Proves the committed R33 and R37 records still state the canonical
 * thirteen-authority history, and that it closes against the fresh V4
 * snapshot and the fresh V4 -> V5 DEV_TRAIN continuity derived from it.
 */
export function requireCanonicalHistoricalCoverageV5(
  records: { readonly r33: unknown; readonly r37: unknown },
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
  delta: CrossGenerationContinuityDelta,
): CanonicalHistoricalV5EvidenceCoverageProof {
  const v4 = requireMintedSnapshotV4(v4Snapshot);
  if (governanceSnapshotV4ForDerivedDelta(delta) !== v4) {
    historyDrift('the continuity was not derived against the V4 snapshot supplied');
  }
  const expected = R39_EXPECTED_CANONICAL_HISTORY;
  const { r33, r37 } = records;
  const checks: [string, unknown, unknown][] = [
    ['R33 record', field(r33, 'record'), expected.r33Record],
    ['R33 record kind', field(r33, 'recordKind'), expected.r33RecordKind],
    ['R33 split', field(r33, 'split'), R39_EVIDENCE_SPLIT],
    ['R33 V4 registry', field(r33, 'governanceDelta', 'registryV4Version'), v4.registryVersion],
    [
      'R33 V4 checkpoint',
      field(r33, 'governanceDelta', 'registryV4CheckpointCommit'),
      v4.checkpointCommit,
    ],
    [
      'R33 V4 DEV_TRAIN READY',
      field(r33, 'governanceDelta', 'v4DevTrainReadyCount'),
      expected.canonicalCoverageCount,
    ],
    ['R33 changed existing', field(r33, 'governanceDelta', 'changedExistingAuthorityCount'), 0],
    ['R33 removed', field(r33, 'governanceDelta', 'removedAuthorityCount'), 0],
    [
      'R33 historical prior evidence',
      field(r33, 'canonicalHistory', 'historicalCanonicalCoverageCount'),
      expected.historicalPriorCount,
    ],
    [
      'R33 newly bound evidence',
      field(r33, 'coverage', 'r33NewlyBoundEvidenceCount'),
      expected.r33NewlyBoundCount,
    ],
    [
      'R33 coverage after expansion',
      field(r33, 'coverage', 'totalAuthorityCoverageAfterExpansion'),
      expected.canonicalCoverageCount,
    ],
    ['R33 coverage equals V4 READY', field(r33, 'coverage', 'coverageEqualsV4DevTrainReady'), true],
    ['R33 thirteen-item batch', field(r33, 'coverage', 'thirteenItemEvidenceBatchMinted'), false],
    ['R33 unchanged rebound', field(r33, 'semantics', 'unchangedAuthoritiesRebound'), false],
    ['R33 legacy queries', field(r33, 'databaseAccess', 'legacyAuthorityEvidenceQueries'), 0],
    ['R37 record', field(r37, 'record'), expected.r37Record],
    ['R37 record kind', field(r37, 'recordKind'), expected.r37RecordKind],
    ['R37 split', field(r37, 'split'), R39_EVIDENCE_SPLIT],
    [
      'R37 historical readiness slots',
      field(r37, 'coverage', 'historicalCanonicalReadinessSlots'),
      expected.historicalPriorCount,
    ],
    [
      'R37 new readiness slots',
      field(r37, 'coverage', 'newR37ReadinessSlots'),
      expected.r33NewlyBoundCount,
    ],
    [
      'R37 readiness coverage slots',
      field(r37, 'coverage', 'coverageReadinessSlots'),
      expected.canonicalCoverageCount,
    ],
    [
      'R37 delta readiness slots',
      field(r37, 'delta', 'deltaReadinessSlots'),
      expected.r33NewlyBoundCount,
    ],
    [
      'R37 historical recomputed',
      field(r37, 'semantics', 'historicalR24R30StatesRecomputed'),
      false,
    ],
    [
      'R37 historical reminted',
      field(r37, 'semantics', 'historicalReadinessObjectsReminted'),
      false,
    ],
  ];
  for (const [name, observed, wanted] of checks) {
    if (observed !== wanted) historyDrift(`${name} differs from the canonical history`);
  }

  const r33Prior = count(r33, 'canonicalHistory', 'historicalCanonicalCoverageCount');
  const r33New = count(r33, 'coverage', 'r33NewlyBoundEvidenceCount');
  const r33Coverage = count(r33, 'coverage', 'totalAuthorityCoverageAfterExpansion');
  const r33V4Ready = count(r33, 'governanceDelta', 'v4DevTrainReadyCount');
  const r37Historical = count(r37, 'coverage', 'historicalCanonicalReadinessSlots');
  const r37New = count(r37, 'coverage', 'newR37ReadinessSlots');
  const r37Coverage = count(r37, 'coverage', 'coverageReadinessSlots');

  const v4DevTrain = readyAuthoritiesOfV4(v4).filter((ready) => ready.split === R39_EVIDENCE_SPLIT);
  const unchangedIndices = new Set(delta.unchanged.map((result) => result.selectionIndex));
  if (
    r33Prior + r33New !== r33Coverage ||
    r37Historical + r37New !== r37Coverage ||
    r33Coverage !== r33V4Ready ||
    r33Coverage !== r37Coverage
  ) {
    historyDrift('the canonical R33 / R37 history arithmetic does not close');
  }
  if (r33Coverage !== v4DevTrain.length) {
    historyDrift('the fresh V4 DEV_TRAIN READY count differs from the historical coverage');
  }
  if (delta.unchanged.length !== r33Coverage || unchangedIndices.size !== r33Coverage) {
    historyDrift('the fresh V4 -> V5 unchanged count differs from the historical coverage');
  }
  if (!v4DevTrain.every((ready) => unchangedIndices.has(ready.selectionIndex))) {
    historyDrift('a historically covered V4 DEV_TRAIN authority is not unchanged in V5');
  }

  const proof: CanonicalHistoricalV5EvidenceCoverageProof = Object.freeze({
    kind: 'CANONICAL_HISTORICAL_V5_EVIDENCE_COVERAGE_PROOF' as const,
    r33HistoricalPriorEvidenceCount: r33Prior,
    r33NewlyBoundEvidenceCount: r33New,
    r33EvidenceCoverageCount: r33Coverage,
    r33V4DevTrainReadyCount: r33V4Ready,
    r37HistoricalReadinessSlotCount: r37Historical,
    r37NewReadinessSlotCount: r37New,
    r37ReadinessCoverageCount: r37Coverage,
    freshV4DevTrainReadyCount: v4DevTrain.length,
    freshV4ToV5UnchangedCount: delta.unchanged.length,
    historicalCanonicalEvidenceCoverageCount: r33Coverage,
    historicalCanonicalReadinessCoverageCount: r37Coverage,
  });
  HISTORY_PROOFS.set(proof, Object.freeze({ v4, delta }));
  return proof;
}

/** A history proof THIS module minted for exactly this V4 snapshot and continuity. */
export function requireHistoricalCoverageProofFor(
  proof: unknown,
  v4: A3CommittedGovernanceSnapshotV4,
  delta: CrossGenerationContinuityDelta,
): CanonicalHistoricalV5EvidenceCoverageProof {
  const bound = typeof proof === 'object' && proof !== null ? HISTORY_PROOFS.get(proof) : undefined;
  if (bound === undefined || bound.v4 !== v4 || bound.delta !== delta) {
    historyDrift('the canonical history coverage was not proved for the snapshot supplied');
  }
  return proof as CanonicalHistoricalV5EvidenceCoverageProof;
}

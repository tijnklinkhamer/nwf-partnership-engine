/**
 * PHASE 2B-2D — A3 R39: THE FRESH R38B GOVERNANCE CHECKPOINT, BEFORE DATABASE.
 *
 * Before any evidence request exists, R38B's Governance V5 checkpoint is
 * reproduced FRESH from two minted snapshots:
 *
 *   1. overall V4 -> V5 continuity through R38A's unchanged bridge
 *      `compareR17WithCrossGenerationAuthorities`, exactly as R38B derived it;
 *   2. DEV_TRAIN continuity through R38B's unchanged
 *      `deriveDevTrainAuthorityContinuityV4ToV5` + `requireAdditiveDevTrainContinuity`
 *      (via `deriveDevTrainEvidenceDeltaV5`, which also materialises the new
 *      authorities and brands the delta);
 *   3. R38B's public census rebuilt with R38B's unchanged
 *      `buildPublicGovernanceCensusV5` and compared RECURSIVELY with the
 *      committed one - every differing semantic path is counted, and the count
 *      must be zero. R38B's census carries no execution-only field, so nothing
 *      is excluded from the comparison.
 *
 * The checkpoint numbers are pinned HERE, as the checkpoint R39 was cut
 * against - never inside the generic delta or binder. The proof is branded in
 * this process and bound by identity to the exact V4 snapshot, V5 snapshot and
 * derived DEV_TRAIN continuity; a copy, a spread or a literal is not one.
 *
 * All inputs arrive as already-parsed values: this module reads no file.
 */
import {
  compareR17WithCrossGenerationAuthorities,
  type CrossGenerationContinuityDelta,
} from '../a3crossGenerationSlotAuthority/continuity.js';
import {
  readyAuthoritiesOfV4,
  type A3CommittedGovernanceSnapshotV4,
} from '../a3governanceV4/snapshotV4.js';
import { buildPublicGovernanceCensusV5 } from '../a3governanceV5/census.js';
import {
  readyAuthoritiesOfV5,
  type A3CommittedGovernanceSnapshotV5,
} from '../a3governanceV5/snapshotV5.js';
import {
  deriveDevTrainEvidenceDeltaV5,
  requireMintedSnapshotV4,
  requireMintedSnapshotV5,
} from './authorityDelta.js';
import { refuseV5Evidence } from './refusal.js';
import { R39_EVIDENCE_SPLIT } from './types.js';

/** The R38B checkpoint R39 was cut against. */
export const R39_EXPECTED_GOVERNANCE_CHECKPOINT = Object.freeze({
  v4RegistryVersion: 'COMMITTED_A2_GOVERNANCE_REGISTRY_V4',
  v4CheckpointCommit: '67ae047fb7de079bcba0eec83ca4f4baee77cc3e',
  v5RegistryVersion: 'COMMITTED_A2_GOVERNANCE_REGISTRY_V5',
  v5CheckpointCommit: '29d0d486cb268b5431a0fc23eabb064682ec47d9',
  overallV4Ready: 69,
  overallV5Ready: 110,
  overallUnchanged: 69,
  overallNew: 41,
  overallChanged: 0,
  overallRetracted: 0,
  devTrainV4Ready: 13,
  devTrainV5Ready: 20,
  devTrainUnchanged: 13,
  devTrainNew: 7,
  devTrainChanged: 0,
  devTrainRetracted: 0,
});

export type R39GovernanceCheckpoint = typeof R39_EXPECTED_GOVERNANCE_CHECKPOINT;

export interface GovernanceV5DriftProof {
  readonly kind: 'GOVERNANCE_V5_DRIFT_PROOF';
  readonly observed: { readonly [K in keyof R39GovernanceCheckpoint]: R39GovernanceCheckpoint[K] };
  readonly comparedTopLevelFieldCount: number;
  readonly differingSemanticPathCount: 0;
  readonly excludedFields: readonly [];
  readonly freshR38bCensusEqualsCommitted: true;
}

interface DriftBinding {
  readonly v4: A3CommittedGovernanceSnapshotV4;
  readonly v5: A3CommittedGovernanceSnapshotV5;
  readonly delta: CrossGenerationContinuityDelta;
}

const DRIFT_PROOFS = new WeakMap<object, DriftBinding>();

function drift(message: string): never {
  refuseV5Evidence('STOP_R39_GOVERNANCE_V5_DRIFT_REQUIRES_REVIEW', message);
}

/**
 * Every path at which two parsed JSON values differ. Objects are compared over
 * the union of their keys (order-insensitive), arrays index by index and by
 * length, scalars by strict equality. Paths name structure only, never a value.
 */
export function differingJsonPaths(a: unknown, b: unknown, path = '$'): readonly string[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: string[] = [];
    if (a.length !== b.length) out.push(`${path}.length`);
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
      out.push(...differingJsonPaths(a[i], b[i], `${path}[${String(i)}]`));
    }
    return out;
  }
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (isRecord(a) && isRecord(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((key) =>
      Object.hasOwn(a, key) && Object.hasOwn(b, key)
        ? differingJsonPaths(a[key], b[key], `${path}.${key}`)
        : [`${path}.${key}`],
    );
  }
  return a === b ? [] : [path];
}

function devTrainCount<T extends { readonly split: string }>(readies: readonly T[]): number {
  return readies.filter((ready) => ready.split === R39_EVIDENCE_SPLIT).length;
}

/**
 * §7. Fresh V4/V5 governance still equals the R38B checkpoint, and R38B's
 * freshly rebuilt public census equals the committed one at every path.
 */
export function requireNoGovernanceDriftV5(
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
  v5Snapshot: A3CommittedGovernanceSnapshotV5,
  committedR38bCensus: unknown,
): GovernanceV5DriftProof {
  const v4 = requireMintedSnapshotV4(v4Snapshot);
  const v5 = requireMintedSnapshotV5(v5Snapshot);
  const r4 = readyAuthoritiesOfV4(v4);
  const r5 = readyAuthoritiesOfV5(v5);
  const overall = compareR17WithCrossGenerationAuthorities(r4, r5);
  const delta = deriveDevTrainEvidenceDeltaV5(v4, v5);
  if (v5.resolution.summary.readyBySplit.DEV_TRAIN !== devTrainCount(r5)) {
    drift('the V5 summary DEV_TRAIN count disagrees with the minted READY list');
  }
  const observed = {
    v4RegistryVersion: v4.registryVersion,
    v4CheckpointCommit: v4.checkpointCommit,
    v5RegistryVersion: v5.registryVersion,
    v5CheckpointCommit: v5.checkpointCommit,
    overallV4Ready: r4.length,
    overallV5Ready: r5.length,
    overallUnchanged: overall.unchanged.length,
    overallNew: overall.newSelectionIndices.length,
    overallChanged: overall.changed.length,
    overallRetracted: overall.retractedSelectionIndices.length,
    devTrainV4Ready: devTrainCount(r4),
    devTrainV5Ready: devTrainCount(r5),
    devTrainUnchanged: delta.unchanged.length,
    devTrainNew: delta.newSelectionIndices.length,
    devTrainChanged: delta.changed.length,
    devTrainRetracted: delta.retractedSelectionIndices.length,
  };
  for (const [key, expected] of Object.entries(R39_EXPECTED_GOVERNANCE_CHECKPOINT)) {
    if (observed[key as keyof typeof observed] !== expected) {
      drift(`${key} no longer equals the R38B checkpoint`);
    }
  }
  const fresh = JSON.parse(
    JSON.stringify(
      buildPublicGovernanceCensusV5(v5, {
        overall,
        overallV4Ready: r4.length,
        devTrain: delta,
        devTrainV4Ready: devTrainCount(r4),
      }),
    ),
  ) as unknown;
  const differing = differingJsonPaths(fresh, committedR38bCensus);
  if (differing.length > 0) {
    drift(
      `the freshly derived R38B public census differs from the committed one at ${String(differing.length)} path(s)`,
    );
  }
  const proof: GovernanceV5DriftProof = Object.freeze({
    kind: 'GOVERNANCE_V5_DRIFT_PROOF' as const,
    observed: Object.freeze(observed) as GovernanceV5DriftProof['observed'],
    comparedTopLevelFieldCount: Object.keys(fresh as Record<string, unknown>).length,
    differingSemanticPathCount: 0 as const,
    excludedFields: Object.freeze([]) as readonly [],
    freshR38bCensusEqualsCommitted: true as const,
  });
  DRIFT_PROOFS.set(proof, Object.freeze({ v4, v5, delta }));
  return proof;
}

/**
 * A drift proof THIS module minted for exactly these snapshots, or a refusal.
 * Returns the exact derived DEV_TRAIN continuity the proof is bound to: the
 * binder plans from that object, never from a second derivation.
 */
export function requireDriftProofFor(
  proof: unknown,
  v4: A3CommittedGovernanceSnapshotV4,
  v5: A3CommittedGovernanceSnapshotV5,
): CrossGenerationContinuityDelta {
  const bound = typeof proof === 'object' && proof !== null ? DRIFT_PROOFS.get(proof) : undefined;
  if (bound === undefined || bound.v4 !== v4 || bound.v5 !== v5) {
    drift('no Governance V5 drift proof was minted for the snapshots supplied');
  }
  return bound.delta;
}

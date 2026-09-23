/**
 * PHASE 2B-2D — A3 R26: THE PRE-READ DRIFT CHECKS.
 *
 * Two cross-checks run BEFORE the real database read, and neither is
 * authority for the delta:
 *
 *   1. §52 GOVERNANCE DRIFT. Freshly derived V1 and V2 governance must still
 *      be the R25 checkpoint: V1 23 READY / 5 DEV_TRAIN, V2 27 READY / 6
 *      DEV_TRAIN, and the freshly derived R25 public census must equal the
 *      committed one exactly. These numbers are pinned HERE, as the
 *      checkpoint R26 was cut against - never inside the generic comparison.
 *
 *   2. §53 R20 BASELINE. The committed public R20 census is read as an
 *      aggregate historical record only, and must still state the canonical
 *      five-authority baseline. It is NOT re-derived (that would need the
 *      database read R26 exists to avoid), and it does not authorise anything
 *      about the delta.
 *
 * Both inputs arrive as already-parsed values: this module reads no file.
 */
import {
  readyAuthoritiesOf,
  type A3CommittedGovernanceSnapshot,
} from '../a3governance/snapshot.js';
import { derivePublicGovernanceAuthorityCensusV2 } from '../a3governanceV2/census.js';
import {
  readyAuthoritiesOfV2,
  type A3CommittedGovernanceSnapshotV2,
} from '../a3governanceV2/snapshotV2.js';
import {
  canonicalRender,
  requireMintedSnapshotV1,
  requireMintedSnapshotV2,
} from './authorityDelta.js';
import { refuseV2Evidence } from './refusal.js';
import { R26_EVIDENCE_SPLIT } from './types.js';

/** The R25 checkpoint R26 was cut against. */
export const R26_EXPECTED_GOVERNANCE_CHECKPOINT = Object.freeze({
  v1ReadyTotal: 23,
  v1DevTrainReady: 5,
  v2ReadyTotal: 27,
  v2DevTrainReady: 6,
});

/** The canonical R20 aggregate baseline, as its committed census states it. */
export const R26_EXPECTED_R20_BASELINE = Object.freeze({
  record: 'PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1',
  split: 'DEV_TRAIN',
  readyAuthoritiesForSplit: 5,
  matchedRuns: 5,
  fetchObservationRows: 203,
  pageEvidenceSourceRows: 160,
  distinctResponseSha256Documents: 156,
  candidateRows: 320,
});

export interface GovernanceDriftProof {
  readonly v1ReadyTotal: number;
  readonly v1DevTrainReady: number;
  readonly v2ReadyTotal: number;
  readonly v2DevTrainReady: number;
  readonly r25CensusSemanticsUnchanged: true;
}

function drift(message: string): never {
  refuseV2Evidence('STOP_R26_GOVERNANCE_SNAPSHOT_DRIFT_REQUIRES_REVIEW', message);
}

/** §52. Fresh V1/V2 governance still equals the R25 checkpoint. */
export function requireNoGovernanceDrift(
  v1Snapshot: A3CommittedGovernanceSnapshot,
  v2Snapshot: A3CommittedGovernanceSnapshotV2,
  committedR25Census: unknown,
): GovernanceDriftProof {
  const v1 = requireMintedSnapshotV1(v1Snapshot);
  const v2 = requireMintedSnapshotV2(v2Snapshot);
  const r1 = readyAuthoritiesOf(v1);
  const r2 = readyAuthoritiesOfV2(v2);
  const observed = {
    v1ReadyTotal: r1.length,
    v1DevTrainReady: r1.filter((ready) => ready.split === R26_EVIDENCE_SPLIT).length,
    v2ReadyTotal: r2.length,
    v2DevTrainReady: r2.filter((ready) => ready.split === R26_EVIDENCE_SPLIT).length,
  };
  for (const [key, expected] of Object.entries(R26_EXPECTED_GOVERNANCE_CHECKPOINT)) {
    if (observed[key as keyof typeof observed] !== expected) {
      drift(`${key} no longer equals the R25 checkpoint`);
    }
  }
  const derived = JSON.parse(
    JSON.stringify(derivePublicGovernanceAuthorityCensusV2(v2, v1)),
  ) as unknown;
  if (canonicalRender(derived) !== canonicalRender(committedR25Census)) {
    drift('the freshly derived R25 public census differs from the committed one');
  }
  return Object.freeze({ ...observed, r25CensusSemanticsUnchanged: true as const });
}

/** §53. The committed R20 census still states the canonical baseline. */
export function requireR20CanonicalBaseline(
  committedR20Census: unknown,
): typeof R26_EXPECTED_R20_BASELINE {
  if (typeof committedR20Census !== 'object' || committedR20Census === null) {
    drift('the committed R20 census is not an object');
  }
  const record = committedR20Census as Record<string, unknown>;
  const binding = (record['binding'] ?? {}) as Record<string, unknown>;
  const observed: Record<string, unknown> = {
    record: record['record'],
    split: record['split'],
    readyAuthoritiesForSplit: binding['readyAuthoritiesForSplit'],
    matchedRuns: binding['matchedRuns'],
    fetchObservationRows: binding['fetchObservationRows'],
    pageEvidenceSourceRows: binding['pageEvidenceSourceRows'],
    distinctResponseSha256Documents: binding['distinctResponseSha256Documents'],
    candidateRows: binding['candidateRows'],
  };
  for (const [key, expected] of Object.entries(R26_EXPECTED_R20_BASELINE)) {
    if (observed[key] !== expected) drift(`the R20 canonical baseline ${key} differs`);
  }
  return R26_EXPECTED_R20_BASELINE;
}

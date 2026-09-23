/**
 * PHASE 2B-2D — A3 R26: THE INCREMENTAL DEV_TRAIN BINDER, AND THE ONLY PLACE
 * THAT MINTS V2 DELTA EVIDENCE.
 *
 * THE ORDER OF WORK IS THE DESIGN
 *
 *   1. both snapshots are proved minted, and the DEV_TRAIN delta between them
 *      is derived PURELY - before any transaction is opened;
 *   2. a changed or retracted old authority STOPS the slice;
 *   3. each NEW authority is proved to be a genuine R17 READY minted by the
 *      very V2 snapshot supplied, in DEV_TRAIN;
 *   4. only then is a request built - one per new authority, none for any
 *      unchanged authority - and read through R20's UNBOUND lower layer,
 *      inside R20's own read-only repeatable-read snapshot;
 *   5. only then is `A3DurableAcquisitionEvidenceDeltaV2` minted.
 *
 * WHAT IS REUSED, AND WHAT IS DELIBERATELY NOT
 *
 *   Reused unchanged from R20: `withReadOnlyEvidenceSnapshot` (the one
 *   transaction and its preflight), `loadUnboundDurableRunEvidence` (every
 *   relational proof) and `evidenceRequestForAuthority` (the four request
 *   fields). NOT reused: R20's V1 minting and batch binders. They require an
 *   R19/V1 snapshot by brand, correctly, and are not broadened here.
 *
 * THE UNCHANGED AUTHORITIES ARE NOT RE-READ AND NOT RE-MINTED
 *
 *   Their durable evidence is R20's canonical history. The batch records them
 *   only as a COUNT inside the coverage proof; it holds no evidence object for
 *   them, because this process never loaded their rows.
 */
import type pg from 'pg';
import { isA3SlotAcquisitionAuthorityReady } from '../a3prep/slotAuthority.js';
import type { A3SlotAcquisitionAuthorityReady } from '../a3prep/slotAuthority.js';
import type { A3CommittedGovernanceSnapshot } from '../a3governance/snapshot.js';
import {
  governanceSnapshotV2ForReadyAuthority,
  type A3CommittedGovernanceSnapshotV2,
} from '../a3governanceV2/snapshotV2.js';
import {
  loadUnboundDurableRunEvidence,
  withReadOnlyEvidenceSnapshot,
  type ReadOnlyQueryCapability,
  type ReadOnlySnapshotSession,
  type ReadOnlyTransactionProof,
} from '../a3evidence/database.js';
import { evidenceRequestForAuthority } from '../a3evidence/devTrain.js';
import {
  R20_REAL_WORKING_DATABASE_NAME,
  type UnboundDurableEvidenceRequest,
  type UnboundDurableRunEvidence,
} from '../a3evidence/types.js';
import {
  deltaAuthoritiesToBind,
  deriveDevTrainReadyAuthorityDelta,
  requireAdditiveOnlyDelta,
  requireMintedSnapshotV1,
  requireMintedSnapshotV2,
} from './authorityDelta.js';
import { refuseV2Evidence } from './refusal.js';
import {
  R26_EVIDENCE_SPLIT,
  type A3DevTrainCanonicalEvidenceCoverageExpansionV2,
  type A3DevTrainDurableEvidenceDeltaBatchV2,
  type A3DurableAcquisitionEvidenceDeltaV2,
  type DevTrainReadyAuthorityDelta,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_EVIDENCE = new WeakSet<object>();
const MINTED_DELTA_BATCHES = new WeakSet<object>();
const DELTA_EVIDENCE_BY_V2_READY = new WeakMap<object, A3DurableAcquisitionEvidenceDeltaV2>();
const V2_SNAPSHOT_BY_DELTA_EVIDENCE = new WeakMap<object, A3CommittedGovernanceSnapshotV2>();

/** True ONLY for V2 delta evidence this module minted in THIS process. */
export function isA3DurableAcquisitionEvidenceDeltaV2(
  value: unknown,
): value is A3DurableAcquisitionEvidenceDeltaV2 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_EVIDENCE.has(value);
}

export function isA3DevTrainDurableEvidenceDeltaBatchV2(
  value: unknown,
): value is A3DevTrainDurableEvidenceDeltaBatchV2 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_BATCHES.has(value);
}

/**
 * The delta evidence newly bound for one V2 READY authority, or `undefined`.
 * A V1 READY never resolves here: it was never a key.
 */
export function durableEvidenceDeltaV2ForReadyAuthority(
  ready: unknown,
): A3DurableAcquisitionEvidenceDeltaV2 | undefined {
  if (!isA3SlotAcquisitionAuthorityReady(ready)) return undefined;
  return DELTA_EVIDENCE_BY_V2_READY.get(ready as unknown as object);
}

/** The V2 snapshot that produced this delta evidence, or `undefined`. */
export function governanceSnapshotV2ForDurableEvidenceDelta(
  evidence: unknown,
): A3CommittedGovernanceSnapshotV2 | undefined {
  if (!isA3DurableAcquisitionEvidenceDeltaV2(evidence)) return undefined;
  return V2_SNAPSHOT_BY_DELTA_EVIDENCE.get(evidence as unknown as object);
}

// ---------------------------------------------------------------------------
// B. V2 READY MINT VERIFICATION.
// ---------------------------------------------------------------------------

/**
 * §20. A genuine R17 READY, minted during THIS V2 snapshot's resolution, in
 * DEV_TRAIN. A V1 READY, a clone of a V2 READY and a READY from another V2
 * snapshot all refuse - by identity, never by equal fields.
 */
export function requireV2DevTrainReadyMintedBy(
  ready: unknown,
  v2Snapshot: A3CommittedGovernanceSnapshotV2,
): A3SlotAcquisitionAuthorityReady {
  const snapshot = requireMintedSnapshotV2(v2Snapshot);
  if (!isA3SlotAcquisitionAuthorityReady(ready)) {
    refuseV2Evidence(
      'R26_READY_NOT_MINTED_BY_GOVERNANCE_V2_SNAPSHOT',
      'the value is not a READY authority minted by R17',
    );
  }
  if (governanceSnapshotV2ForReadyAuthority(ready) !== snapshot) {
    refuseV2Evidence(
      'R26_READY_NOT_MINTED_BY_GOVERNANCE_V2_SNAPSHOT',
      'the READY authority was not minted by the Governance V2 snapshot supplied',
    );
  }
  if (ready.split !== R26_EVIDENCE_SPLIT) {
    refuseV2Evidence(
      'R26_AUTHORITY_SPLIT_NOT_SUPPORTED',
      `R26 binds ${R26_EVIDENCE_SPLIT} only; no request is built for any other split`,
    );
  }
  return ready;
}

/**
 * The requests for the delta, and ONLY the delta, each built after its
 * authority passed V2 mint verification. The unchanged authorities never
 * reach this function's output: `deltaAuthoritiesToBind` returns the new
 * authorities alone, after the delta proved additive.
 */
export function deltaEvidenceRequests(
  delta: DevTrainReadyAuthorityDelta,
  v2Snapshot: A3CommittedGovernanceSnapshotV2,
): readonly {
  readonly authority: A3SlotAcquisitionAuthorityReady;
  readonly request: UnboundDurableEvidenceRequest;
}[] {
  return Object.freeze(
    deltaAuthoritiesToBind(delta).map((candidate) => {
      const authority = requireV2DevTrainReadyMintedBy(candidate, v2Snapshot);
      return Object.freeze({ authority, request: evidenceRequestForAuthority(authority) });
    }),
  );
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaEvidence(
  ready: A3SlotAcquisitionAuthorityReady,
  v2Snapshot: A3CommittedGovernanceSnapshotV2,
  evidence: UnboundDurableRunEvidence,
): A3DurableAcquisitionEvidenceDeltaV2 {
  const minted: A3DurableAcquisitionEvidenceDeltaV2 = Object.freeze({
    kind: 'A3_DURABLE_ACQUISITION_EVIDENCE_DELTA_V2' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R26_EVIDENCE_SPLIT,
    authority: ready,
    governanceSnapshotV2: v2Snapshot,
    evidence,
  });
  MINTED_DELTA_EVIDENCE.add(minted);
  DELTA_EVIDENCE_BY_V2_READY.set(ready as unknown as object, minted);
  V2_SNAPSHOT_BY_DELTA_EVIDENCE.set(minted, v2Snapshot);
  return minted;
}

/** §28 / §29. The aggregate coverage proof, with its arithmetic enforced. */
function coverageOf(
  delta: DevTrainReadyAuthorityDelta,
  requestCount: number,
  itemCount: number,
): A3DevTrainCanonicalEvidenceCoverageExpansionV2 {
  requireAdditiveOnlyDelta(delta);
  const unchangedCount = delta.unchanged.length;
  if (
    unchangedCount + itemCount !== delta.v2ReadyCount ||
    unchangedCount !== delta.v1ReadyCount ||
    requestCount !== itemCount ||
    itemCount !== delta.newAuthorities.length
  ) {
    refuseV2Evidence(
      'R26_COVERAGE_ARITHMETIC_INVALID',
      'unchanged canonical coverage plus newly bound delta does not equal the V2 READY count',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_EVIDENCE_COVERAGE_EXPANSION_V2' as const,
    v1CanonicalCoveredAuthorityCount: delta.v1ReadyCount,
    v2ReadyAuthorityCount: delta.v2ReadyCount,
    unchangedCanonicalCoverageCount: unchangedCount,
    newlyBoundDeltaCount: itemCount,
    changedExistingCount: 0 as const,
    removedCount: 0 as const,
    coverageAfterExpansionCount: unchangedCount + itemCount,
    legacyAuthorityEvidenceRequests: 0 as const,
    deltaAuthorityEvidenceRequests: requestCount,
  });
}

// ---------------------------------------------------------------------------
// D. THE DELTA BATCH.
// ---------------------------------------------------------------------------

async function bindPreparedDelta(
  client: ReadOnlyQueryCapability,
  v1Snapshot: A3CommittedGovernanceSnapshot,
  v2Snapshot: A3CommittedGovernanceSnapshotV2,
  delta: DevTrainReadyAuthorityDelta,
): Promise<A3DevTrainDurableEvidenceDeltaBatchV2> {
  const planned = deltaEvidenceRequests(delta, v2Snapshot);

  const items: A3DurableAcquisitionEvidenceDeltaV2[] = [];
  for (const { authority, request } of planned) {
    const evidence = await loadUnboundDurableRunEvidence(client, request);
    items.push(mintDeltaEvidence(authority, v2Snapshot, evidence));
  }

  for (const item of items) {
    if (governanceSnapshotV2ForDurableEvidenceDelta(item) !== v2Snapshot) {
      refuseV2Evidence(
        'R26_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta item was produced by another snapshot',
      );
    }
  }
  if (new Set(items.map((item) => item.evidence.run.id)).size !== items.length) {
    refuseV2Evidence(
      'R26_DELTA_BATCH_COMPOSITION_INVALID',
      'two delta items bound the same durable run',
    );
  }

  const batch: A3DevTrainDurableEvidenceDeltaBatchV2 = Object.freeze({
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V2' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R26_EVIDENCE_SPLIT,
    governanceSnapshotV2: v2Snapshot,
    continuityBaseV1: v1Snapshot,
    items: Object.freeze(items),
    coverage: coverageOf(delta, planned.length, items.length),
  });
  MINTED_DELTA_BATCHES.add(batch);
  return batch;
}

/**
 * Binds the DEV_TRAIN delta inside a caller-supplied session. The delta is
 * derived from the two minted snapshots here; there is no caller-supplied
 * delta, expected count or authority list.
 */
export async function bindDevTrainEvidenceDeltaV2(
  client: ReadOnlyQueryCapability,
  v1Snapshot: A3CommittedGovernanceSnapshot,
  v2Snapshot: A3CommittedGovernanceSnapshotV2,
): Promise<A3DevTrainDurableEvidenceDeltaBatchV2> {
  const v1 = requireMintedSnapshotV1(v1Snapshot);
  const v2 = requireMintedSnapshotV2(v2Snapshot);
  const delta = requireAdditiveOnlyDelta(deriveDevTrainReadyAuthorityDelta(v1, v2));
  return bindPreparedDelta(client, v1, v2, delta);
}

// ---------------------------------------------------------------------------
// E. THE REAL WORKING-DATABASE RUN.
// ---------------------------------------------------------------------------

export interface DevTrainEvidenceDeltaRunV2 {
  readonly batch: A3DevTrainDurableEvidenceDeltaBatchV2;
  readonly transactionProof: ReadOnlyTransactionProof;
}

/**
 * The one entry point for a real read. §19: the delta is derived and proved
 * additive BEFORE the pool is touched, so a changed or retracted authority
 * never opens a transaction. The pool is the caller's; the expected database
 * name is R20's own constant, a parameter only so an integration test can
 * aim it at the test database.
 */
export async function runDevTrainEvidenceDeltaBindingV2(
  pool: pg.Pool,
  v1Snapshot: A3CommittedGovernanceSnapshot,
  v2Snapshot: A3CommittedGovernanceSnapshotV2,
  expectedDatabaseName: string = R20_REAL_WORKING_DATABASE_NAME,
): Promise<DevTrainEvidenceDeltaRunV2> {
  const v1 = requireMintedSnapshotV1(v1Snapshot);
  const v2 = requireMintedSnapshotV2(v2Snapshot);
  const delta = requireAdditiveOnlyDelta(deriveDevTrainReadyAuthorityDelta(v1, v2));
  deltaEvidenceRequests(delta, v2);
  return withReadOnlyEvidenceSnapshot(
    pool,
    expectedDatabaseName,
    async (session: ReadOnlySnapshotSession) => ({
      batch: await bindPreparedDelta(session.client, v1, v2, delta),
      transactionProof: session.proof,
    }),
  );
}

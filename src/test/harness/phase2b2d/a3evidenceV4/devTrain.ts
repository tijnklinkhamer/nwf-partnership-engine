/**
 * PHASE 2B-2D — A3 R33: THE V4 INCREMENTAL DEV_TRAIN BINDER, AND THE ONLY
 * PLACE THAT MINTS V4 DELTA EVIDENCE.
 *
 * THE ORDER OF WORK IS THE DESIGN
 *
 *   1. both snapshots are proved minted, and the V3 -> V4 DEV_TRAIN delta
 *      between them is derived PURELY through R32's continuity path and proved
 *      additive by R32's own gate - before any connection is opened;
 *   2. the governance-drift proof and the canonical-history proof must both
 *      have been minted for these very snapshots / records;
 *   3. each NEW authority is proved to be a genuine R17 READY minted by the
 *      very V4 snapshot supplied, in DEV_TRAIN, and to be on the NEW side of
 *      that delta by identity - an unchanged V4 authority refuses;
 *   4. only then is a request built - one per new authority, none for any
 *      unchanged authority - and read through R20's UNBOUND lower layer,
 *      inside R20's own read-only repeatable-read snapshot;
 *   5. only then is `A3DurableAcquisitionEvidenceDeltaV4` minted.
 *
 * WHAT IS REUSED, AND WHAT IS DELIBERATELY NOT
 *
 *   Reused unchanged from R20: `withReadOnlyEvidenceSnapshot` (the one
 *   transaction and its preflight), `loadUnboundDurableRunEvidence` (the run
 *   matcher and every relational proof) and `evidenceRequestForAuthority`
 *   (the four request fields). NOT reused: R20's V1 minting and batch binders,
 *   or R26's V2 ones. They require their own snapshot brands, correctly, and
 *   are not broadened here.
 *
 * THE UNCHANGED AUTHORITIES ARE NOT RE-READ AND NOT RE-MINTED
 *
 *   Their durable evidence is canonical R20 / R26 history. The batch records
 *   them only as a COUNT inside the coverage proof; it holds no evidence
 *   object for them, because this process never loaded their rows.
 */
import type pg from 'pg';
import { isA3SlotAcquisitionAuthorityReady } from '../a3prep/slotAuthority.js';
import type { A3SlotAcquisitionAuthorityReady } from '../a3prep/slotAuthority.js';
import type { A3CommittedGovernanceSnapshotV3 } from '../a3governanceV3/snapshotV3.js';
import {
  governanceSnapshotV4ForReadyAuthority,
  type A3CommittedGovernanceSnapshotV4,
} from '../a3governanceV4/snapshotV4.js';
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
import type { DevTrainReadyAuthorityDelta } from '../a3evidenceV2/types.js';
import {
  deltaAuthoritiesToBindV4,
  deriveDevTrainEvidenceDeltaV4,
  requireDerivedDeltaFor,
  requireMintedSnapshotV3,
  requireMintedSnapshotV4,
} from './authorityDelta.js';
import {
  requireDriftProofFor,
  requireHistoricalCoverageProof,
  type GovernanceDriftProofV4,
} from './r32Drift.js';
import { refuseV4Evidence } from './refusal.js';
import {
  R33_EVIDENCE_SPLIT,
  type A3DevTrainCanonicalEvidenceCoverageExpansionV4,
  type A3DevTrainDurableEvidenceDeltaBatchV4,
  type A3DurableAcquisitionEvidenceDeltaV4,
  type CanonicalHistoricalEvidenceCoverage,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_EVIDENCE = new WeakSet<object>();
const MINTED_DELTA_BATCHES = new WeakSet<object>();
const DELTA_EVIDENCE_BY_V4_READY = new WeakMap<object, A3DurableAcquisitionEvidenceDeltaV4>();
const V4_SNAPSHOT_BY_DELTA_EVIDENCE = new WeakMap<object, A3CommittedGovernanceSnapshotV4>();

/** True ONLY for V4 delta evidence this module minted in THIS process. */
export function isA3DurableAcquisitionEvidenceDeltaV4(
  value: unknown,
): value is A3DurableAcquisitionEvidenceDeltaV4 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_EVIDENCE.has(value);
}

export function isA3DevTrainDurableEvidenceDeltaBatchV4(
  value: unknown,
): value is A3DevTrainDurableEvidenceDeltaBatchV4 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_BATCHES.has(value);
}

/**
 * The delta evidence newly bound for one V4 READY authority, or `undefined`.
 * An unchanged authority - V3 or V4 object - never resolves here: it was
 * never a key.
 */
export function durableEvidenceDeltaV4ForReadyAuthority(
  ready: unknown,
): A3DurableAcquisitionEvidenceDeltaV4 | undefined {
  if (!isA3SlotAcquisitionAuthorityReady(ready)) return undefined;
  return DELTA_EVIDENCE_BY_V4_READY.get(ready as unknown as object);
}

/** The V4 snapshot that produced this delta evidence, or `undefined`. */
export function governanceSnapshotV4ForDurableEvidenceDelta(
  evidence: unknown,
): A3CommittedGovernanceSnapshotV4 | undefined {
  if (!isA3DurableAcquisitionEvidenceDeltaV4(evidence)) return undefined;
  return V4_SNAPSHOT_BY_DELTA_EVIDENCE.get(evidence as unknown as object);
}

// ---------------------------------------------------------------------------
// B. V4 READY MINT VERIFICATION.
// ---------------------------------------------------------------------------

/**
 * §6. A genuine R17 READY, minted during THIS V4 snapshot's resolution, in
 * DEV_TRAIN. A V1 / V2 / V3 READY, a clone of a V4 READY and a READY from
 * another V4 snapshot all refuse - by identity, never by equal fields.
 */
export function requireV4DevTrainReadyMintedBy(
  ready: unknown,
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
): A3SlotAcquisitionAuthorityReady {
  const snapshot = requireMintedSnapshotV4(v4Snapshot);
  if (!isA3SlotAcquisitionAuthorityReady(ready)) {
    refuseV4Evidence(
      'R33_READY_NOT_MINTED_BY_GOVERNANCE_V4_SNAPSHOT',
      'the value is not a READY authority minted by R17',
    );
  }
  if (governanceSnapshotV4ForReadyAuthority(ready) !== snapshot) {
    refuseV4Evidence(
      'R33_READY_NOT_MINTED_BY_GOVERNANCE_V4_SNAPSHOT',
      'the READY authority was not minted by the Governance V4 snapshot supplied',
    );
  }
  if (ready.split !== R33_EVIDENCE_SPLIT) {
    refuseV4Evidence(
      'R33_AUTHORITY_SPLIT_NOT_SUPPORTED',
      `R33 binds ${R33_EVIDENCE_SPLIT} only; no request is built for any other split`,
    );
  }
  return ready;
}

/**
 * §6 / §9. A genuine V4 DEV_TRAIN READY that is on the NEW side of a delta
 * derived for this V4 snapshot - by object identity. An unchanged V4 authority
 * is a genuine V4 DEV_TRAIN READY too, and it refuses here.
 */
export function requireNewV4DeltaAuthority(
  candidate: unknown,
  delta: DevTrainReadyAuthorityDelta,
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
): A3SlotAcquisitionAuthorityReady {
  const derived = requireDerivedDeltaFor(delta, v4Snapshot);
  const ready = requireV4DevTrainReadyMintedBy(candidate, v4Snapshot);
  const isNew = derived.newAuthorities.some((entry) => entry.v2 === ready);
  const isUnchanged = derived.unchanged.some((entry) => entry.v2 === ready);
  if (!isNew || isUnchanged) {
    refuseV4Evidence(
      'R33_AUTHORITY_NOT_A_NEW_V4_DELTA_AUTHORITY',
      'the READY authority is not on the new side of the derived V3 -> V4 delta',
    );
  }
  return ready;
}

/**
 * The requests for the delta, and ONLY the delta, each built after its
 * authority passed V4 mint verification and delta membership. The unchanged
 * authorities never reach this function's output.
 */
export function planDevTrainEvidenceDeltaRequestsV4(
  delta: DevTrainReadyAuthorityDelta,
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
): readonly {
  readonly authority: A3SlotAcquisitionAuthorityReady;
  readonly request: UnboundDurableEvidenceRequest;
}[] {
  const derived = requireDerivedDeltaFor(delta, v4Snapshot);
  return Object.freeze(
    deltaAuthoritiesToBindV4(derived).map((candidate) => {
      const authority = requireNewV4DeltaAuthority(candidate, derived, v4Snapshot);
      return Object.freeze({ authority, request: evidenceRequestForAuthority(authority) });
    }),
  );
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaEvidence(
  ready: A3SlotAcquisitionAuthorityReady,
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
  evidence: UnboundDurableRunEvidence,
): A3DurableAcquisitionEvidenceDeltaV4 {
  const minted: A3DurableAcquisitionEvidenceDeltaV4 = Object.freeze({
    kind: 'A3_DURABLE_ACQUISITION_EVIDENCE_DELTA_V4' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R33_EVIDENCE_SPLIT,
    authority: ready,
    governanceSnapshotV4: v4Snapshot,
    evidence,
  });
  MINTED_DELTA_EVIDENCE.add(minted);
  DELTA_EVIDENCE_BY_V4_READY.set(ready as unknown as object, minted);
  V4_SNAPSHOT_BY_DELTA_EVIDENCE.set(minted, v4Snapshot);
  return minted;
}

/** §14. The aggregate coverage proof, with its arithmetic enforced. */
function coverageOf(
  delta: DevTrainReadyAuthorityDelta,
  history: CanonicalHistoricalEvidenceCoverage,
  requestCount: number,
  itemCount: number,
): A3DevTrainCanonicalEvidenceCoverageExpansionV4 {
  deltaAuthoritiesToBindV4(delta);
  const unchangedCount = delta.unchanged.length;
  if (
    history.historicalCanonicalCoverageCount !== unchangedCount ||
    unchangedCount !== delta.v1ReadyCount ||
    unchangedCount + itemCount !== delta.v2ReadyCount ||
    requestCount !== itemCount ||
    itemCount !== delta.newAuthorities.length
  ) {
    refuseV4Evidence(
      'R33_COVERAGE_ARITHMETIC_INVALID',
      'historical canonical coverage plus newly bound delta does not equal the V4 DEV_TRAIN READY count',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_EVIDENCE_COVERAGE_EXPANSION_V4' as const,
    historicalCanonicalCoverageCount: history.historicalCanonicalCoverageCount,
    v3DevTrainReadyCount: delta.v1ReadyCount,
    v4DevTrainReadyCount: delta.v2ReadyCount,
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

interface PreparedDelta {
  readonly v3: A3CommittedGovernanceSnapshotV3;
  readonly v4: A3CommittedGovernanceSnapshotV4;
  readonly delta: DevTrainReadyAuthorityDelta;
  readonly history: CanonicalHistoricalEvidenceCoverage;
  readonly planned: ReturnType<typeof planDevTrainEvidenceDeltaRequestsV4>;
}

/** Everything that must hold before a connection may be opened. Pure. */
function prepareDelta(
  v3Snapshot: A3CommittedGovernanceSnapshotV3,
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
  historyProof: CanonicalHistoricalEvidenceCoverage,
): PreparedDelta {
  const v3 = requireMintedSnapshotV3(v3Snapshot);
  const v4 = requireMintedSnapshotV4(v4Snapshot);
  const history = requireHistoricalCoverageProof(historyProof);
  const delta = deriveDevTrainEvidenceDeltaV4(v3, v4);
  const planned = planDevTrainEvidenceDeltaRequestsV4(delta, v4);
  // The arithmetic is checked here too, so a history that does not close
  // refuses before any connection rather than after the reads.
  coverageOf(delta, history, planned.length, planned.length);
  return Object.freeze({ v3, v4, delta, history, planned });
}

async function bindPreparedDelta(
  client: ReadOnlyQueryCapability,
  prepared: PreparedDelta,
): Promise<A3DevTrainDurableEvidenceDeltaBatchV4> {
  const { v3, v4, delta, history, planned } = prepared;

  const items: A3DurableAcquisitionEvidenceDeltaV4[] = [];
  for (const { authority, request } of planned) {
    const evidence = await loadUnboundDurableRunEvidence(client, request);
    items.push(mintDeltaEvidence(authority, v4, evidence));
  }

  for (const item of items) {
    if (governanceSnapshotV4ForDurableEvidenceDelta(item) !== v4) {
      refuseV4Evidence(
        'R33_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta item was produced by another snapshot',
      );
    }
  }
  if (new Set(items.map((item) => item.evidence.run.id)).size !== items.length) {
    refuseV4Evidence(
      'R33_DELTA_BATCH_COMPOSITION_INVALID',
      'two delta items bound the same durable run',
    );
  }
  if (new Set(items.map((item) => item.authority)).size !== items.length) {
    refuseV4Evidence(
      'R33_DELTA_BATCH_COMPOSITION_INVALID',
      'one authority was bound more than once',
    );
  }

  const batch: A3DevTrainDurableEvidenceDeltaBatchV4 = Object.freeze({
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V4' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R33_EVIDENCE_SPLIT,
    governanceSnapshotV4: v4,
    continuityBaseV3: v3,
    items: Object.freeze(items),
    coverage: coverageOf(delta, history, planned.length, items.length),
  });
  MINTED_DELTA_BATCHES.add(batch);
  return batch;
}

/**
 * Binds the V4 DEV_TRAIN delta inside a caller-supplied session. The delta is
 * derived from the two minted snapshots here; there is no caller-supplied
 * delta, expected count or authority list.
 */
export async function bindDevTrainEvidenceDeltaV4(
  client: ReadOnlyQueryCapability,
  v3Snapshot: A3CommittedGovernanceSnapshotV3,
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
  historyProof: CanonicalHistoricalEvidenceCoverage,
): Promise<A3DevTrainDurableEvidenceDeltaBatchV4> {
  return bindPreparedDelta(client, prepareDelta(v3Snapshot, v4Snapshot, historyProof));
}

// ---------------------------------------------------------------------------
// E. THE REAL WORKING-DATABASE RUN.
// ---------------------------------------------------------------------------

export interface DevTrainEvidenceDeltaRunV4 {
  readonly batch: A3DevTrainDurableEvidenceDeltaBatchV4;
  readonly transactionProof: ReadOnlyTransactionProof;
}

/**
 * The one entry point for a real read. §8: the delta is derived, proved
 * additive, drift-checked and fully planned BEFORE the pool is touched, so a
 * wrong snapshot, a changed or retracted authority, a drifted checkpoint or a
 * foreign authority never opens a transaction. The pool is the caller's; the
 * expected database name is R20's own constant, a parameter only so an
 * integration test can aim it at the test database.
 */
export async function runDevTrainEvidenceDeltaBindingV4(
  pool: pg.Pool,
  v3Snapshot: A3CommittedGovernanceSnapshotV3,
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
  driftProof: GovernanceDriftProofV4,
  historyProof: CanonicalHistoricalEvidenceCoverage,
  expectedDatabaseName: string = R20_REAL_WORKING_DATABASE_NAME,
): Promise<DevTrainEvidenceDeltaRunV4> {
  const prepared = prepareDelta(v3Snapshot, v4Snapshot, historyProof);
  requireDriftProofFor(driftProof, prepared.v3, prepared.v4);
  return withReadOnlyEvidenceSnapshot(
    pool,
    expectedDatabaseName,
    async (session: ReadOnlySnapshotSession) => ({
      batch: await bindPreparedDelta(session.client, prepared),
      transactionProof: session.proof,
    }),
  );
}

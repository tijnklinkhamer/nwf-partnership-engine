/**
 * PHASE 2B-2D — A3 R39: THE V5 INCREMENTAL DEV_TRAIN BINDER, AND THE ONLY
 * PLACE THAT MINTS V5 DELTA EVIDENCE.
 *
 * THE ORDER OF WORK IS THE DESIGN
 *
 *   1. both snapshots are proved minted; the R38B drift proof must have been
 *      minted for exactly these snapshots, and it hands back the exact
 *      DEV_TRAIN continuity it was derived with (additive, by R38B's gate);
 *   2. the canonical-history proof must have been minted for exactly that V4
 *      snapshot and that continuity;
 *   3. each NEW authority - materialised from the V5 snapshot itself - is
 *      proved a genuine R38A READY, minted by this very V5 snapshot, in
 *      DEV_TRAIN, and one of the delta's new authorities by identity; an
 *      UNCHANGED V5 authority refuses;
 *   4. only THEN does the V5 request adapter translate that authority into
 *      R20's plain four-field `UnboundDurableEvidenceRequest`; the coverage
 *      arithmetic must already close and this snapshot must not already have
 *      been bound in this process - all before any connection;
 *   5. inside ONE R20 read-only repeatable-read snapshot, ALL seven unbound
 *      results are loaded through R20's unchanged lower reader, then validated
 *      together (count, position, distinct runs, distinct authorities);
 *   6. only after the whole read phase passed - and the snapshot closed
 *      cleanly - is ANY `A3DurableAcquisitionEvidenceDeltaV5` minted. If the
 *      seventh read refuses, nothing for the first six was ever minted.
 *
 * WHAT IS REUSED, AND WHAT IS DELIBERATELY NOT
 *
 *   Reused unchanged from R20: `withReadOnlyEvidenceSnapshot` (the one
 *   transaction and its preflight) and `loadUnboundDurableRunEvidence` (the
 *   run matcher and every relational proof). Neither takes an A3 authority.
 *   NOT reused: R20's `evidenceRequestForAuthority`, `bindDurableEvidenceForReadyAuthority`
 *   and `bindDevTrainDurableEvidenceBatch`. They belong to the R17 READY shape,
 *   correctly, and are neither called nor broadened for a cross-generation
 *   authority.
 *
 * WHY THE FOUR REQUEST FIELDS ARE SAFE
 *
 *   R38A and Governance V5 already proved the current occupant identity, the
 *   acquisition-of-record result, its run reference and its actual
 *   acquisition policy. The adapter only translates those already-proven
 *   fields; it reinterprets no acquisition governance. Organisation and eche
 *   row identity come from the discriminated `authority.occupant.source`, so a
 *   Generation-1-sourced occupant and a Generation-2 reserve occupant map
 *   identically - no branch on reserve namespace, no manufactured draw digest.
 *   For an accepted recovery, `authority.runRefSha256` already IS the
 *   adjudicated recovery run; the original run is never substituted.
 *
 * THE UNCHANGED AUTHORITIES ARE NOT RE-READ AND NOT RE-MINTED
 *
 *   Their durable evidence is canonical R33 history and their downstream state
 *   is canonical R34 -> R37 history. The batch records them only as a COUNT
 *   inside the coverage proof.
 */
import type pg from 'pg';
import type { CrossGenerationContinuityDelta } from '../a3crossGenerationSlotAuthority/continuity.js';
import { isA3CrossGenerationSlotAcquisitionAuthorityReady } from '../a3crossGenerationSlotAuthority/resolve.js';
import type { A3CrossGenerationSlotAcquisitionAuthorityReady } from '../a3crossGenerationSlotAuthority/types.js';
import {
  readyAuthoritiesOfV4,
  type A3CommittedGovernanceSnapshotV4,
} from '../a3governanceV4/snapshotV4.js';
import {
  readyAuthoritiesOfV5,
  type A3CommittedGovernanceSnapshotV5,
} from '../a3governanceV5/snapshotV5.js';
import {
  R20_SQL_STATEMENTS,
  loadUnboundDurableRunEvidence,
  withReadOnlyEvidenceSnapshot,
  type ReadOnlyQueryCapability,
  type ReadOnlySnapshotSession,
  type ReadOnlyTransactionProof,
} from '../a3evidence/database.js';
import {
  R20_REAL_WORKING_DATABASE_NAME,
  type UnboundDurableEvidenceRequest,
  type UnboundDurableRunEvidence,
} from '../a3evidence/types.js';
import {
  newDeltaAuthoritiesOf,
  requireDerivedDeltaFor,
  requireMintedSnapshotV4,
  requireMintedSnapshotV5,
  requireNewV5DeltaAuthority,
} from './authorityDelta.js';
import { requireHistoricalCoverageProofFor } from './history.js';
import { requireDriftProofFor, type GovernanceV5DriftProof } from './r38bDrift.js';
import { refuseV5Evidence } from './refusal.js';
import {
  R39_EVIDENCE_SPLIT,
  type A3DevTrainCanonicalEvidenceCoverageExpansionV5,
  type A3DevTrainDurableEvidenceDeltaBatchV5,
  type A3DurableAcquisitionEvidenceDeltaV5,
  type CanonicalHistoricalV5EvidenceCoverageProof,
  type R39DatabaseAccessObservation,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS, PROVENANCE AND ONE-SHOT STATE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_EVIDENCE = new WeakSet<object>();
const MINTED_DELTA_BATCHES = new WeakSet<object>();
const DELTA_EVIDENCE_BY_V5_READY = new WeakMap<object, A3DurableAcquisitionEvidenceDeltaV5>();
const V5_SNAPSHOT_BY_DELTA_EVIDENCE = new WeakMap<object, A3CommittedGovernanceSnapshotV5>();
const ACCESS_BY_BATCH = new WeakMap<object, R39DatabaseAccessObservation>();
/** §22. V5 snapshots that already produced an R39 batch in THIS process. */
const BOUND_V5_SNAPSHOTS = new WeakSet<object>();
/** V5 snapshots with a binding attempt currently in progress. */
const IN_FLIGHT_V5_SNAPSHOTS = new WeakSet<object>();

/** True ONLY for V5 delta evidence this module minted in THIS process. */
export function isA3DurableAcquisitionEvidenceDeltaV5(
  value: unknown,
): value is A3DurableAcquisitionEvidenceDeltaV5 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_EVIDENCE.has(value);
}

export function isA3DevTrainDurableEvidenceDeltaBatchV5(
  value: unknown,
): value is A3DevTrainDurableEvidenceDeltaBatchV5 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_BATCHES.has(value);
}

/**
 * The delta evidence newly bound for one V5 READY authority, or `undefined`.
 * An unchanged authority - V4 or V5 object - never resolves here: it was
 * never a key.
 */
export function durableEvidenceDeltaV5ForReadyAuthority(
  ready: unknown,
): A3DurableAcquisitionEvidenceDeltaV5 | undefined {
  if (!isA3CrossGenerationSlotAcquisitionAuthorityReady(ready)) return undefined;
  return DELTA_EVIDENCE_BY_V5_READY.get(ready as unknown as object);
}

/** The V5 snapshot that produced this delta evidence, or `undefined`. */
export function governanceSnapshotV5ForDurableEvidenceDelta(
  evidence: unknown,
): A3CommittedGovernanceSnapshotV5 | undefined {
  if (!isA3DurableAcquisitionEvidenceDeltaV5(evidence)) return undefined;
  return V5_SNAPSHOT_BY_DELTA_EVIDENCE.get(evidence as unknown as object);
}

/**
 * The database access the real-run entry point observed while producing this
 * batch, or `undefined` (a batch bound through a caller-supplied session has
 * no pool-level observation, and nothing else is a batch).
 */
export function databaseAccessObservationForBatch(
  batch: unknown,
): R39DatabaseAccessObservation | undefined {
  if (!isA3DevTrainDurableEvidenceDeltaBatchV5(batch)) return undefined;
  return ACCESS_BY_BATCH.get(batch as unknown as object);
}

/** Whether this exact V5 snapshot already produced an R39 batch in this process. */
export function hasV5SnapshotBeenBound(v5Snapshot: unknown): boolean {
  return (
    typeof v5Snapshot === 'object' && v5Snapshot !== null && BOUND_V5_SNAPSHOTS.has(v5Snapshot)
  );
}

function requireNotYetBound(v5: A3CommittedGovernanceSnapshotV5): void {
  if (BOUND_V5_SNAPSHOTS.has(v5) || IN_FLIGHT_V5_SNAPSHOTS.has(v5)) {
    refuseV5Evidence(
      'R39_V5_SNAPSHOT_ALREADY_BOUND_IN_THIS_PROCESS',
      'this Governance V5 snapshot already has an R39 binding in this process; it is never re-read',
    );
  }
}

// ---------------------------------------------------------------------------
// B. THE V5-SPECIFIC REQUEST ADAPTER.
// ---------------------------------------------------------------------------

/**
 * §14. The plain R20 request for ONE new V5 delta authority. It verifies the
 * candidate FIRST - genuine V5 snapshot, genuine cross-generation READY of that
 * snapshot, DEV_TRAIN, new-delta membership - and only then reads exactly the
 * four already-proven fields. Nothing else of the authority reaches SQL.
 */
export function evidenceRequestForNewV5DeltaAuthority(
  candidate: unknown,
  delta: CrossGenerationContinuityDelta,
  v5Snapshot: A3CommittedGovernanceSnapshotV5,
): UnboundDurableEvidenceRequest {
  const authority = requireNewV5DeltaAuthority(candidate, delta, v5Snapshot);
  return Object.freeze({
    organisationId: authority.occupant.source.organisationId,
    echeRowKey: authority.occupant.source.echeRowKey,
    expectedRunRefSha256: authority.runRefSha256,
    expectedAcquisitionPolicyVersion: authority.acquisitionPolicyVersion,
  });
}

export interface PlannedV5EvidenceRequest {
  readonly authority: A3CrossGenerationSlotAcquisitionAuthorityReady;
  readonly request: UnboundDurableEvidenceRequest;
}

/**
 * The requests for the new delta, and ONLY the new delta, each built after its
 * authority passed V5 mint verification and delta membership. The unchanged
 * authorities never reach this function's output.
 */
export function planDevTrainEvidenceDeltaRequestsV5(
  delta: CrossGenerationContinuityDelta,
  v5Snapshot: A3CommittedGovernanceSnapshotV5,
): readonly PlannedV5EvidenceRequest[] {
  const derived = requireDerivedDeltaFor(delta, v5Snapshot);
  return Object.freeze(
    newDeltaAuthoritiesOf(derived, v5Snapshot).map((candidate) => {
      const authority = requireNewV5DeltaAuthority(candidate, derived, v5Snapshot);
      return Object.freeze({
        authority,
        request: evidenceRequestForNewV5DeltaAuthority(authority, derived, v5Snapshot),
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// C. COVERAGE.
// ---------------------------------------------------------------------------

/** §12 / §29. The aggregate coverage proof, with its arithmetic enforced. */
function coverageOf(
  delta: CrossGenerationContinuityDelta,
  v4: A3CommittedGovernanceSnapshotV4,
  v5: A3CommittedGovernanceSnapshotV5,
  history: CanonicalHistoricalV5EvidenceCoverageProof,
  requestCount: number,
  itemCount: number,
): A3DevTrainCanonicalEvidenceCoverageExpansionV5 {
  const v4Ready = readyAuthoritiesOfV4(v4).filter(
    (ready) => ready.split === R39_EVIDENCE_SPLIT,
  ).length;
  const v5Ready = readyAuthoritiesOfV5(v5).filter(
    (ready) => ready.split === R39_EVIDENCE_SPLIT,
  ).length;
  const unchanged = delta.unchanged.length;
  const fresh = delta.newSelectionIndices.length;
  if (
    delta.changed.length !== 0 ||
    delta.retractedSelectionIndices.length !== 0 ||
    history.historicalCanonicalEvidenceCoverageCount !== unchanged ||
    history.historicalCanonicalReadinessCoverageCount !== unchanged ||
    unchanged !== v4Ready ||
    unchanged + fresh !== v5Ready ||
    requestCount !== fresh ||
    itemCount !== fresh
  ) {
    refuseV5Evidence(
      'R39_COVERAGE_ARITHMETIC_INVALID',
      'historical canonical coverage plus the new delta does not equal the V5 DEV_TRAIN READY count',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_EVIDENCE_COVERAGE_EXPANSION_V5' as const,
    historicalCanonicalEvidenceCoverageCount: history.historicalCanonicalEvidenceCoverageCount,
    historicalCanonicalReadinessCoverageCount: history.historicalCanonicalReadinessCoverageCount,
    v4DevTrainReadyCount: v4Ready,
    v5DevTrainReadyCount: v5Ready,
    unchangedCanonicalCoverageCount: unchanged,
    newlyBoundDeltaCount: itemCount,
    changedExistingCount: 0 as const,
    removedCount: 0 as const,
    coverageAfterExpansionCount: unchanged + itemCount,
    legacyAuthorityEvidenceRequests: 0 as const,
    deltaAuthorityEvidenceRequests: requestCount,
    downstreamReadinessCoverageCountAfterR39: history.historicalCanonicalReadinessCoverageCount,
  });
}

// ---------------------------------------------------------------------------
// D. PREPARATION (PURE, BEFORE ANY CONNECTION).
// ---------------------------------------------------------------------------

interface PreparedDelta {
  readonly v4: A3CommittedGovernanceSnapshotV4;
  readonly v5: A3CommittedGovernanceSnapshotV5;
  readonly delta: CrossGenerationContinuityDelta;
  readonly history: CanonicalHistoricalV5EvidenceCoverageProof;
  readonly planned: readonly PlannedV5EvidenceRequest[];
}

/** §25. Everything that must hold before a connection may be opened. Pure. */
function prepareDelta(
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
  v5Snapshot: A3CommittedGovernanceSnapshotV5,
  driftProof: GovernanceV5DriftProof,
  historyProof: CanonicalHistoricalV5EvidenceCoverageProof,
): PreparedDelta {
  const v4 = requireMintedSnapshotV4(v4Snapshot);
  const v5 = requireMintedSnapshotV5(v5Snapshot);
  const delta = requireDriftProofFor(driftProof, v4, v5);
  const history = requireHistoricalCoverageProofFor(historyProof, v4, delta);
  const planned = planDevTrainEvidenceDeltaRequestsV5(delta, v5);
  coverageOf(delta, v4, v5, history, planned.length, planned.length);
  requireNotYetBound(v5);
  return Object.freeze({ v4, v5, delta, history, planned });
}

// ---------------------------------------------------------------------------
// E. THE READ PHASE: ALL SEVEN UNBOUND, THEN VALIDATED TOGETHER.
// ---------------------------------------------------------------------------

function composition(message: string): never {
  refuseV5Evidence('R39_DELTA_READ_COMPOSITION_INVALID', message);
}

/**
 * §21 / §28. Validates the whole read phase before anything is minted: one
 * result per planned request, each at its own planned position and carrying
 * that exact request object, each run on its authority's acquisition policy,
 * no authority twice and no durable run bound by two authorities.
 */
export function requireValidDeltaReadComposition(
  planned: readonly PlannedV5EvidenceRequest[],
  reads: readonly UnboundDurableRunEvidence[],
): readonly UnboundDurableRunEvidence[] {
  if (reads.length !== planned.length) {
    composition('the number of lower reads differs from the number of planned requests');
  }
  if (new Set(planned.map((entry) => entry.authority)).size !== planned.length) {
    composition('one authority was planned more than once');
  }
  for (const [position, read] of reads.entries()) {
    const entry = planned[position]!;
    if (read.request !== entry.request) {
      composition('a lower read does not answer the request planned at its position');
    }
    if (read.run.fetchPolicyVersion !== entry.authority.acquisitionPolicyVersion) {
      composition('a bound run is not on its authority acquisition policy');
    }
  }
  if (new Set(reads.map((read) => read.run.id)).size !== reads.length) {
    composition('two new authorities resolved to the same durable run');
  }
  return Object.freeze([...reads]);
}

async function readDelta(
  client: ReadOnlyQueryCapability,
  prepared: PreparedDelta,
  onLowerLoad: () => void,
): Promise<readonly UnboundDurableRunEvidence[]> {
  const reads: UnboundDurableRunEvidence[] = [];
  for (const { request } of prepared.planned) {
    onLowerLoad();
    reads.push(await loadUnboundDurableRunEvidence(client, request));
  }
  return requireValidDeltaReadComposition(prepared.planned, reads);
}

// ---------------------------------------------------------------------------
// F. MINTING - ONLY AFTER THE WHOLE READ PHASE PASSED.
// ---------------------------------------------------------------------------

function mintValidatedDelta(
  prepared: PreparedDelta,
  reads: readonly UnboundDurableRunEvidence[],
): A3DevTrainDurableEvidenceDeltaBatchV5 {
  const { v4, v5, delta, history, planned } = prepared;
  requireNotYetBound(v5);
  requireValidDeltaReadComposition(planned, reads);
  // Every check that can refuse runs BEFORE the first brand is added.
  const coverage = coverageOf(delta, v4, v5, history, planned.length, reads.length);

  const items = planned.map(({ authority }, position) =>
    Object.freeze({
      kind: 'A3_DURABLE_ACQUISITION_EVIDENCE_DELTA_V5' as const,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
      split: R39_EVIDENCE_SPLIT,
      authority,
      governanceSnapshotV5: v5,
      evidence: reads[position]!,
    }),
  );
  const batch: A3DevTrainDurableEvidenceDeltaBatchV5 = Object.freeze({
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V5' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R39_EVIDENCE_SPLIT,
    governanceSnapshotV5: v5,
    continuityBaseV4: v4,
    items: Object.freeze(items),
    coverage,
  });

  for (const item of items) {
    MINTED_DELTA_EVIDENCE.add(item);
    DELTA_EVIDENCE_BY_V5_READY.set(item.authority as unknown as object, item);
    V5_SNAPSHOT_BY_DELTA_EVIDENCE.set(item, v5);
  }
  MINTED_DELTA_BATCHES.add(batch);
  BOUND_V5_SNAPSHOTS.add(v5);
  return batch;
}

/**
 * Binds the V5 DEV_TRAIN delta inside a caller-supplied session. The delta is
 * the one the drift proof was minted with; there is no caller-supplied delta,
 * expected count, index list or authority list.
 */
export async function bindDevTrainEvidenceDeltaV5(
  client: ReadOnlyQueryCapability,
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
  v5Snapshot: A3CommittedGovernanceSnapshotV5,
  driftProof: GovernanceV5DriftProof,
  historyProof: CanonicalHistoricalV5EvidenceCoverageProof,
): Promise<A3DevTrainDurableEvidenceDeltaBatchV5> {
  const prepared = prepareDelta(v4Snapshot, v5Snapshot, driftProof, historyProof);
  IN_FLIGHT_V5_SNAPSHOTS.add(prepared.v5);
  try {
    const reads = await readDelta(client, prepared, () => undefined);
    IN_FLIGHT_V5_SNAPSHOTS.delete(prepared.v5);
    return mintValidatedDelta(prepared, reads);
  } finally {
    IN_FLIGHT_V5_SNAPSHOTS.delete(prepared.v5);
  }
}

// ---------------------------------------------------------------------------
// G. THE REAL WORKING-DATABASE RUN.
// ---------------------------------------------------------------------------

const CANDIDATE_RUN_IDS_SQL = R20_SQL_STATEMENTS[2]!;
const WRITE_STATEMENT = /^\s*(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|CREATE|ALTER|DROP|GRANT|COPY)\b/i;

function identitiesOf(
  readies: readonly {
    readonly organisationId: string;
    readonly echeRowKey: string;
    readonly runRefSha256: string;
  }[],
): ReadonlySet<string> {
  return new Set(
    readies.flatMap((ready) => [ready.organisationId, ready.echeRowKey, ready.runRefSha256]),
  );
}

function crossIdentity(ready: A3CrossGenerationSlotAcquisitionAuthorityReady): {
  organisationId: string;
  echeRowKey: string;
  runRefSha256: string;
} {
  return {
    organisationId: ready.occupant.source.organisationId,
    echeRowKey: ready.occupant.source.echeRowKey,
    runRefSha256: ready.runRefSha256,
  };
}

/**
 * Wraps the caller's pool so the run can COUNT what it did - connections,
 * transactions, statements, writes and which identities any parameter carried
 * - without creating a pool, opening an extra connection or changing a single
 * statement R20 issues. Parameter values are compared in memory and dropped;
 * only counts leave this function.
 */
function observingPool(
  pool: pg.Pool,
  prepared: PreparedDelta,
): {
  readonly pool: pg.Pool;
  readonly observe: () => Omit<R39DatabaseAccessObservation, 'lowerEvidenceLoads'>;
} {
  const { v4, v5, delta, planned } = prepared;
  const unchangedIndices = new Set(delta.unchanged.map((result) => result.selectionIndex));
  const unchanged = new Set([
    ...identitiesOf(
      readyAuthoritiesOfV4(v4).filter((ready) => unchangedIndices.has(ready.selectionIndex)),
    ),
    ...identitiesOf(
      readyAuthoritiesOfV5(v5)
        .filter((ready) => unchangedIndices.has(ready.selectionIndex))
        .map(crossIdentity),
    ),
  ]);
  const splitIdentities = (split: string): ReadonlySet<string> =>
    new Set([
      ...identitiesOf(readyAuthoritiesOfV4(v4).filter((ready) => ready.split === split)),
      ...identitiesOf(
        readyAuthoritiesOfV5(v5)
          .filter((ready) => ready.split === split)
          .map(crossIdentity),
      ),
    ]);
  const devConfirm = splitIdentities('DEV_CONFIRM');
  const finalHoldout = splitIdentities('FINAL_HOLDOUT');
  const newLookups = new Set(
    planned.map(({ request }) => `${request.echeRowKey}\u0000${request.organisationId}`),
  );
  const counts = {
    poolConnections: 0,
    snapshotTransactions: 0,
    sqlStatements: 0,
    candidateRunLookups: 0,
    candidateRunLookupsForNewAuthorities: 0,
    unchangedAuthorityIdentityParameterHits: 0,
    devConfirmIdentityParameterHits: 0,
    finalHoldoutIdentityParameterHits: 0,
    writeStatements: 0,
  };
  const wrapped = {
    async connect() {
      const client = await pool.connect();
      counts.poolConnections += 1;
      return {
        query(text: string, values: readonly unknown[] = []) {
          counts.sqlStatements += 1;
          if (text.startsWith('BEGIN TRANSACTION')) counts.snapshotTransactions += 1;
          if (WRITE_STATEMENT.test(text)) counts.writeStatements += 1;
          if (text === CANDIDATE_RUN_IDS_SQL) {
            counts.candidateRunLookups += 1;
            if (newLookups.has(`${String(values[0])}\u0000${String(values[1])}`)) {
              counts.candidateRunLookupsForNewAuthorities += 1;
            }
          }
          for (const value of values) {
            const key = String(value);
            if (unchanged.has(key)) counts.unchangedAuthorityIdentityParameterHits += 1;
            if (devConfirm.has(key)) counts.devConfirmIdentityParameterHits += 1;
            if (finalHoldout.has(key)) counts.finalHoldoutIdentityParameterHits += 1;
          }
          return client.query(text, values as unknown[]);
        },
        release() {
          client.release();
        },
      };
    },
  } as unknown as pg.Pool;
  return { pool: wrapped, observe: () => Object.freeze({ ...counts }) };
}

export interface DevTrainEvidenceDeltaRunV5 {
  readonly batch: A3DevTrainDurableEvidenceDeltaBatchV5;
  readonly transactionProof: ReadOnlyTransactionProof;
  readonly access: R39DatabaseAccessObservation;
}

/**
 * The one entry point for a real read. §25: authority first, database second.
 * The snapshots are proved minted, the drift and history proofs are bound,
 * the seven requests are planned and the coverage arithmetic closes BEFORE the
 * pool is touched, so a wrong snapshot, a drifted checkpoint, a forged proof,
 * an unchanged authority or a repeated binding never opens a transaction. The
 * pool is the caller's; the expected database name is R20's own constant, a
 * parameter only so an integration test can aim it at the test database.
 */
export async function runDevTrainEvidenceDeltaBindingV5(
  pool: pg.Pool,
  v4Snapshot: A3CommittedGovernanceSnapshotV4,
  v5Snapshot: A3CommittedGovernanceSnapshotV5,
  driftProof: GovernanceV5DriftProof,
  historyProof: CanonicalHistoricalV5EvidenceCoverageProof,
  expectedDatabaseName: string = R20_REAL_WORKING_DATABASE_NAME,
): Promise<DevTrainEvidenceDeltaRunV5> {
  const prepared = prepareDelta(v4Snapshot, v5Snapshot, driftProof, historyProof);
  IN_FLIGHT_V5_SNAPSHOTS.add(prepared.v5);
  try {
    const observed = observingPool(pool, prepared);
    let lowerEvidenceLoads = 0;
    const { reads, transactionProof } = await withReadOnlyEvidenceSnapshot(
      observed.pool,
      expectedDatabaseName,
      async (session: ReadOnlySnapshotSession) => ({
        reads: await readDelta(session.client, prepared, () => {
          lowerEvidenceLoads += 1;
        }),
        transactionProof: session.proof,
      }),
    );
    // The snapshot closed cleanly: only now does any V5 authority exist.
    IN_FLIGHT_V5_SNAPSHOTS.delete(prepared.v5);
    const batch = mintValidatedDelta(prepared, reads);
    const access: R39DatabaseAccessObservation = Object.freeze({
      ...observed.observe(),
      lowerEvidenceLoads,
    });
    ACCESS_BY_BATCH.set(batch, access);
    return Object.freeze({ batch, transactionProof, access });
  } finally {
    IN_FLIGHT_V5_SNAPSHOTS.delete(prepared.v5);
  }
}

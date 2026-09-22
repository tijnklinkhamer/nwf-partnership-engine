/**
 * PHASE 2B-2D — A3 R20: THE DEV_TRAIN BINDER, AND THE ONLY PLACE THAT MINTS.
 *
 * THE BOUNDARY THIS FILE IS
 *
 *   Below it, `database.ts` turns four strings into rows. Those rows are not
 *   authority, and a test may obtain them freely. Here, and only here, a real
 *   R17-minted READY authority and the real R19 snapshot that minted it are
 *   verified BY BRAND, and only then is durable evidence minted.
 *
 *   There is consequently no `unsafeMint`, no `skipAuthorityCheck`, no
 *   `testOnlyReady` and no environment-controlled bypass anywhere in this
 *   namespace. A test that wants to exercise a relational refusal calls the
 *   pure layer; a test that wants minted evidence must produce genuine
 *   governance, because that is what minted evidence MEANS.
 *
 * DEV_TRAIN ONLY, AND NOT BY CONVENTION
 *
 *   `R20_EVIDENCE_SPLIT_V1` is a constant, not a parameter. The split is
 *   filtered from the R19-minted authorities INTERNALLY, so there is no
 *   argument a caller could pass to reach DEV_CONFIRM or FINAL_HOLDOUT, and
 *   no query is issued for either: an authority outside DEV_TRAIN is dropped
 *   before any request is built, never after rows come back.
 *
 * WHAT MINTING DOES NOT MEAN
 *
 *   It does not mean the acquisition should have succeeded - R17 decided
 *   that. It does not mean these documents enter a corpus - SET_P and SET_R
 *   do not exist yet. It means exactly: "these rows are the durable evidence
 *   of the run this authority names".
 */
import type pg from 'pg';
import {
  isCommittedGovernanceSnapshot,
  governanceSnapshotForReadyAuthority,
  readyAuthoritiesOf,
  type A3CommittedGovernanceSnapshot,
} from '../a3governance/snapshot.js';
import { isA3SlotAcquisitionAuthorityReady } from '../a3prep/slotAuthority.js';
import type { A3SlotAcquisitionAuthorityReady } from '../a3prep/slotAuthority.js';
import { refuse } from './refusal.js';
import {
  loadUnboundDurableRunEvidence,
  withReadOnlyEvidenceSnapshot,
  type ReadOnlyQueryCapability,
  type ReadOnlySnapshotSession,
  type ReadOnlyTransactionProof,
} from './database.js';
import {
  R20_EVIDENCE_SPLIT_V1,
  R20_REAL_WORKING_DATABASE_NAME,
  type A3DevTrainDurableEvidenceBatchV1,
  type A3DurableAcquisitionEvidence,
  type UnboundDurableEvidenceRequest,
  type UnboundDurableRunEvidence,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS.
// ---------------------------------------------------------------------------

const MINTED_EVIDENCE = new WeakSet<object>();
const MINTED_BATCHES = new WeakSet<object>();
const EVIDENCE_BY_READY = new WeakMap<object, A3DurableAcquisitionEvidence>();
const SNAPSHOT_BY_EVIDENCE = new WeakMap<object, A3CommittedGovernanceSnapshot>();

/** True ONLY for evidence this module minted in THIS process. */
export function isA3DurableAcquisitionEvidence(
  value: unknown,
): value is A3DurableAcquisitionEvidence {
  return typeof value === 'object' && value !== null && MINTED_EVIDENCE.has(value);
}

export function isA3DevTrainDurableEvidenceBatch(
  value: unknown,
): value is A3DevTrainDurableEvidenceBatchV1 {
  return typeof value === 'object' && value !== null && MINTED_BATCHES.has(value);
}

/** The durable evidence minted for one READY authority, or `undefined`. */
export function durableEvidenceForReadyAuthority(
  ready: unknown,
): A3DurableAcquisitionEvidence | undefined {
  if (!isA3SlotAcquisitionAuthorityReady(ready)) return undefined;
  return EVIDENCE_BY_READY.get(ready as unknown as object);
}

/** The governance snapshot that produced this durable evidence, or `undefined`. */
export function governanceSnapshotForDurableEvidence(
  evidence: unknown,
): A3CommittedGovernanceSnapshot | undefined {
  if (!isA3DurableAcquisitionEvidence(evidence)) return undefined;
  return SNAPSHOT_BY_EVIDENCE.get(evidence as unknown as object);
}

// ---------------------------------------------------------------------------
// B. AUTHORITY VERIFICATION.
// ---------------------------------------------------------------------------

/**
 * §12. The READY must be one R17 minted, AND the snapshot that minted it must
 * be the very snapshot handed in - by identity, not by equal fields. A clone,
 * a spread, a deserialised copy or a READY from another resolution all fail
 * here, which is what makes the governance state R20 read against provably
 * the one it was given.
 */
function requireReadyMintedBySnapshot(
  ready: unknown,
  snapshot: A3CommittedGovernanceSnapshot,
): A3SlotAcquisitionAuthorityReady {
  if (!isA3SlotAcquisitionAuthorityReady(ready)) {
    refuse(
      'READY_AUTHORITY_NOT_MINTED_BY_GOVERNANCE_SNAPSHOT',
      'the value is not a READY authority minted by R17',
    );
  }
  if (governanceSnapshotForReadyAuthority(ready) !== snapshot) {
    refuse(
      'READY_AUTHORITY_NOT_MINTED_BY_GOVERNANCE_SNAPSHOT',
      'the READY authority was not minted by the governance snapshot supplied',
    );
  }
  return ready;
}

function requireMintedSnapshot(snapshot: unknown): A3CommittedGovernanceSnapshot {
  if (!isCommittedGovernanceSnapshot(snapshot)) {
    refuse(
      'NOT_A_MINTED_GOVERNANCE_SNAPSHOT',
      'the governance snapshot was not minted by this resolution',
    );
  }
  return snapshot;
}

/**
 * §10. The DEV_TRAIN authorities, taken ONLY through R19's own minting path.
 * The census JSON is never parsed as authority and READY is never
 * reconstructed from counts.
 */
export function devTrainReadyAuthoritiesOf(
  snapshot: A3CommittedGovernanceSnapshot,
): readonly A3SlotAcquisitionAuthorityReady[] {
  const minted = requireMintedSnapshot(snapshot);
  const selected = readyAuthoritiesOf(minted).filter(
    (ready) => ready.split === R20_EVIDENCE_SPLIT_V1,
  );
  const seen = new Set<object>();
  for (const ready of selected) {
    if (seen.has(ready as unknown as object)) {
      refuse('DUPLICATE_READY_AUTHORITY', 'one READY authority appeared twice in the split');
    }
    seen.add(ready as unknown as object);
  }
  return Object.freeze(selected);
}

/** The plain request the lower reader takes, derived from a verified authority. */
export function evidenceRequestForAuthority(
  ready: A3SlotAcquisitionAuthorityReady,
): UnboundDurableEvidenceRequest {
  return Object.freeze({
    organisationId: ready.organisationId,
    echeRowKey: ready.echeRowKey,
    expectedRunRefSha256: ready.runRefSha256,
    expectedAcquisitionPolicyVersion: ready.acquisitionPolicyVersion,
  });
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDurableEvidence(
  ready: A3SlotAcquisitionAuthorityReady,
  snapshot: A3CommittedGovernanceSnapshot,
  evidence: UnboundDurableRunEvidence,
): A3DurableAcquisitionEvidence {
  const minted: A3DurableAcquisitionEvidence = Object.freeze({
    kind: 'A3_DURABLE_ACQUISITION_EVIDENCE' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R20_EVIDENCE_SPLIT_V1,
    authority: ready,
    governanceSnapshot: snapshot,
    evidence,
  });
  MINTED_EVIDENCE.add(minted);
  EVIDENCE_BY_READY.set(ready as unknown as object, minted);
  SNAPSHOT_BY_EVIDENCE.set(minted, snapshot);
  return minted;
}

/**
 * Binds ONE verified DEV_TRAIN READY authority to its durable evidence. The
 * authority check happens FIRST: a value that is not a genuine R17 READY
 * minted by this snapshot never reaches a query.
 */
export async function bindDurableEvidenceForReadyAuthority(
  client: ReadOnlyQueryCapability,
  snapshot: A3CommittedGovernanceSnapshot,
  ready: unknown,
): Promise<A3DurableAcquisitionEvidence> {
  const mintedSnapshot = requireMintedSnapshot(snapshot);
  const authority = requireReadyMintedBySnapshot(ready, mintedSnapshot);
  if (authority.split !== R20_EVIDENCE_SPLIT_V1) {
    refuse(
      'AUTHORITY_SPLIT_NOT_SUPPORTED',
      `R20 V1 binds ${R20_EVIDENCE_SPLIT_V1} only; no evidence query is issued for any other split`,
    );
  }
  const evidence = await loadUnboundDurableRunEvidence(
    client,
    evidenceRequestForAuthority(authority),
  );
  return mintDurableEvidence(authority, mintedSnapshot, evidence);
}

// ---------------------------------------------------------------------------
// D. THE BATCH.
// ---------------------------------------------------------------------------

/**
 * §43. The whole split, bound inside ONE caller-supplied snapshot session.
 * The item count is DERIVED from the snapshot's own DEV_TRAIN authorities -
 * there is no caller-supplied expected count, because a caller who could
 * assert "5" could also assert "4" and make a missing binding look intended.
 */
export async function bindDevTrainDurableEvidenceBatch(
  client: ReadOnlyQueryCapability,
  snapshot: A3CommittedGovernanceSnapshot,
): Promise<A3DevTrainDurableEvidenceBatchV1> {
  const mintedSnapshot = requireMintedSnapshot(snapshot);
  const authorities = devTrainReadyAuthoritiesOf(mintedSnapshot);

  const items: A3DurableAcquisitionEvidence[] = [];
  for (const authority of authorities) {
    items.push(await bindDurableEvidenceForReadyAuthority(client, mintedSnapshot, authority));
  }

  if (items.length !== authorities.length) {
    refuse(
      'BATCH_COMPOSITION_INVALID',
      'the batch item count does not equal the split’s READY authority count',
    );
  }
  for (const item of items) {
    if (!isA3DurableAcquisitionEvidence(item)) {
      refuse('NOT_A_MINTED_DURABLE_EVIDENCE', 'a batch item was not minted durable evidence');
    }
    if (item.split !== R20_EVIDENCE_SPLIT_V1) {
      refuse('AUTHORITY_SPLIT_NOT_SUPPORTED', 'a batch item is outside the supported split');
    }
    if (governanceSnapshotForDurableEvidence(item) !== mintedSnapshot) {
      refuse('BATCH_COMPOSITION_INVALID', 'a batch item was produced by another snapshot');
    }
  }
  const distinctRuns = new Set(items.map((item) => item.evidence.run.id));
  if (distinctRuns.size !== items.length) {
    refuse('BATCH_COMPOSITION_INVALID', 'two batch items bound the same durable run');
  }

  const batch: A3DevTrainDurableEvidenceBatchV1 = Object.freeze({
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_BATCH_V1' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R20_EVIDENCE_SPLIT_V1,
    governanceSnapshot: mintedSnapshot,
    items: Object.freeze(items),
  });
  MINTED_BATCHES.add(batch);
  return batch;
}

// ---------------------------------------------------------------------------
// E. THE REAL WORKING-DATABASE RUN.
// ---------------------------------------------------------------------------

export interface DevTrainDurableEvidenceRun {
  readonly batch: A3DevTrainDurableEvidenceBatchV1;
  readonly transactionProof: ReadOnlyTransactionProof;
}

/**
 * The one entry point for a real read. The POOL is the caller's - this module
 * neither builds nor discovers a connection - but the expected DATABASE NAME
 * is this adapter's own, so a pool pointed at anything other than the working
 * database refuses in the preflight, before a single evidence query.
 *
 * `expectedDatabaseName` is a parameter only so an integration test can prove
 * the check by pointing it at the test database; production passes nothing
 * and gets `nwf_pe`.
 */
export async function runDevTrainDurableEvidenceBinding(
  pool: pg.Pool,
  snapshot: A3CommittedGovernanceSnapshot,
  expectedDatabaseName: string = R20_REAL_WORKING_DATABASE_NAME,
): Promise<DevTrainDurableEvidenceRun> {
  const mintedSnapshot = requireMintedSnapshot(snapshot);
  return withReadOnlyEvidenceSnapshot(
    pool,
    expectedDatabaseName,
    async (session: ReadOnlySnapshotSession) => ({
      batch: await bindDevTrainDurableEvidenceBatch(session.client, mintedSnapshot),
      transactionProof: session.proof,
    }),
  );
}

/**
 * PHASE 2B-2D — A3 R40: THE FRESH R39 REPRODUCTION GATE.
 *
 * R39's evidence batch is private in-process authority (WeakSet / WeakMap
 * provenance) and cannot be loaded from the committed census. A real R40 run
 * therefore re-mints R39 in-process: the census canonical R39 derives from
 * THAT batch - with R39's own unchanged `deriveR39PublicIncrementalEvidenceCensus`
 * - must equal the committed R39 census at every path except the one
 * execution-provenance commit, and must state the R39 checkpoint pinned below.
 *
 * THE UPSTREAM POOL MUST ALREADY BE CLOSED
 *
 *   The proof is minted only for a caller-owned pool that reports itself
 *   ended with zero clients. The R40 binder requires the proof, so no R21
 *   assembly can begin while R39's database pool is open. This module reads
 *   two properties of that pool; it never connects, queries or ends it.
 *
 * The proof is bound by object identity to the exact R39 batch it was minted
 * for. A spread, a structured clone, a JSON copy or a literal is not one, and
 * a proof for one batch never answers for another.
 *
 * THIS MODULE IS PURE. Its inputs arrive already parsed; it reads no file.
 * Differences are reported as field PATHS, never values.
 */
import type { ReadOnlyTransactionProof } from '../a3evidence/database.js';
import {
  R39_CENSUS_PATH,
  deriveR39PublicIncrementalEvidenceCensus,
  type R39CensusProvenance,
} from '../a3evidenceV5/census.js';
import {
  databaseAccessObservationForBatch,
  isA3DevTrainDurableEvidenceDeltaBatchV5,
  type DevTrainEvidenceDeltaRunV5,
} from '../a3evidenceV5/devTrain.js';
import type { GovernanceV5DriftProof } from '../a3evidenceV5/r38bDrift.js';
import { differingJsonPaths } from '../a3evidenceV5/r38bDrift.js';
import type {
  A3DevTrainDurableEvidenceDeltaBatchV5,
  CanonicalHistoricalV5EvidenceCoverageProof,
  R39DatabaseAccessObservation,
} from '../a3evidenceV5/types.js';
import { refuseV5Document } from './refusal.js';

/**
 * The ONE committed R39 field a fresh reproduction may legitimately differ
 * on: the commit the reproducing process executed at. Every other field must
 * match.
 */
export const R39_REPRODUCTION_EXCLUDED_FIELDS = Object.freeze(['implementationCommit'] as const);

/** The R39 checkpoint R40 was cut against, as [path, value] pairs. */
export const R40_EXPECTED_R39_CHECKPOINT: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], 'PHASE_2B_2D_A3_R39_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1'],
    [['split'], 'DEV_TRAIN'],
    [['governanceDelta', 'v4DevTrainReadyCount'], 13],
    [['governanceDelta', 'v5DevTrainReadyCount'], 20],
    [['governanceDelta', 'unchangedAuthorityCount'], 13],
    [['governanceDelta', 'newAuthorityCount'], 7],
    [['governanceDelta', 'changedExistingAuthorityCount'], 0],
    [['governanceDelta', 'removedAuthorityCount'], 0],
    [['coverage', 'historicalCanonicalEvidenceCoverageCount'], 13],
    [['coverage', 'newlyBoundDeltaCount'], 7],
    [['coverage', 'evidenceCoverageAfterR39'], 20],
    [['coverage', 'downstreamReadinessCoverageAfterR39'], 13],
    [['coverage', 'legacyAuthorityEvidenceRequests'], 0],
    [['coverage', 'deltaAuthorityEvidenceRequests'], 7],
    [['deltaEvidence', 'matchedRuns'], 7],
    [['deltaEvidence', 'distinctDurableRuns'], 7],
    [['deltaEvidence', 'pageEvidenceSourceRows'], 224],
    [['deltaEvidence', 'distinctResponseSha256Documents'], 223],
    [['deltaEvidence', 'candidateRows'], 448],
    [['deltaEvidence', 'fetchObservationRows'], 280],
    [['deltaEvidence', 'duplicateDocumentSourceRows'], 2],
    [['deltaEvidence', 'multipleExtractionVersionDocuments'], 0],
    [['databaseAccess', 'role'], 'nwf_readonly'],
    [['databaseAccess', 'database'], 'nwf_pe'],
    [['databaseAccess', 'transactionReadOnly'], true],
    [['databaseAccess', 'transactionIsolation'], 'repeatable read'],
    [['databaseAccess', 'poolConnections'], 1],
    [['databaseAccess', 'readOnlySnapshotTransactions'], 1],
    [['databaseAccess', 'sqlStatements'], 45],
    [['databaseAccess', 'legacyAuthorityEvidenceQueries'], 0],
    [['databaseAccess', 'deltaAuthorityEvidenceQueries'], 7],
    [['databaseAccess', 'devConfirmEvidenceReads'], 0],
    [['databaseAccess', 'finalHoldoutEvidenceReads'], 0],
    [['databaseAccess', 'writes'], 0],
  ] as const);

/** The two pool properties the gate reads. pg's `Pool` satisfies this shape. */
export interface ClosedUpstreamPoolObservation {
  readonly ended: boolean;
  readonly totalCount: number;
}

/** A proof that ONE minted R39 batch reproduced the committed R39 census. */
export interface R39ReproductionProof {
  readonly kind: 'R40_FRESH_R39_REPRODUCTION_PROOF';
  readonly committedRecord: string;
  readonly comparedTopLevelFieldCount: number;
  readonly excludedFields: readonly string[];
  readonly differingSemanticPathCount: 0;
  readonly matchedRuns: number;
  readonly pageEvidenceSourceRows: number;
  readonly distinctResponseSha256Documents: number;
  readonly candidateRows: number;
  readonly legacyAuthorityEvidenceQueries: number;
  readonly deltaAuthorityEvidenceQueries: number;
  readonly transaction: ReadOnlyTransactionProof;
  readonly access: R39DatabaseAccessObservation;
  readonly upstreamPoolClosedBeforeProof: true;
}

const REPRODUCTION_PROOF_BY_BATCH = new WeakMap<object, R39ReproductionProof>();

function drift(message: string): never {
  refuseV5Document('STOP_R40_FRESH_R39_REPRODUCTION_DRIFT_REQUIRES_REVIEW', message);
}

function at(record: unknown, path: readonly string[]): unknown {
  let value: unknown = record;
  for (const key of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function withoutExcluded(record: unknown): Record<string, unknown> {
  const copy =
    typeof record === 'object' && record !== null && !Array.isArray(record)
      ? (JSON.parse(JSON.stringify(record)) as Record<string, unknown>)
      : {};
  for (const field of R39_REPRODUCTION_EXCLUDED_FIELDS) delete copy[field];
  return copy;
}

/**
 * Field paths at which the fresh R39 census differs from the committed one,
 * over every field except the excluded execution-provenance commit. Empty
 * means the fresh reproduction equals the committed record.
 */
export function r39ReproductionDriftPaths(fresh: unknown, committed: unknown): readonly string[] {
  return Object.freeze([...differingJsonPaths(withoutExcluded(fresh), withoutExcluded(committed))]);
}

/**
 * §7 - §9. Derives the R39 census from the ACTUAL minted R39 batch with R39's
 * own derivation, requires it to equal the committed R39 census and the pinned
 * checkpoint, requires the caller-owned pool to be closed, and only then mints
 * a reproduction proof bound to exactly that batch.
 */
export function requireFreshR39Reproduction(
  run: DevTrainEvidenceDeltaRunV5,
  driftProof: GovernanceV5DriftProof,
  historyProof: CanonicalHistoricalV5EvidenceCoverageProof,
  provenance: R39CensusProvenance,
  committedR39Census: unknown,
  upstreamPool: ClosedUpstreamPoolObservation,
): R39ReproductionProof {
  const batch: unknown = typeof run === 'object' && run !== null ? run.batch : undefined;
  if (!isA3DevTrainDurableEvidenceDeltaBatchV5(batch)) {
    refuseV5Document(
      'R40_EVIDENCE_DELTA_NOT_MINTED_BY_R39',
      'the reproduction input is not a delta batch minted by R39 in this process',
    );
  }
  const access = databaseAccessObservationForBatch(batch);
  if (access === undefined || access !== run.access) {
    drift('the R39 batch carries no observation from the real-run entry point');
  }
  const fresh = deriveR39PublicIncrementalEvidenceCensus(
    batch,
    run.transactionProof,
    driftProof,
    historyProof,
    provenance,
  );
  const differing = r39ReproductionDriftPaths(fresh, committedR39Census);
  if (differing.length > 0) {
    drift(
      `the fresh R39 census differs from the committed one at ${String(differing.length)} path(s): ${differing.join(', ')}`,
    );
  }
  for (const [path, expected] of R40_EXPECTED_R39_CHECKPOINT) {
    if (at(fresh, path) !== expected)
      drift(`${path.join('.')} no longer equals the R39 checkpoint`);
  }
  if (
    typeof upstreamPool !== 'object' ||
    upstreamPool === null ||
    upstreamPool.ended !== true ||
    upstreamPool.totalCount !== 0
  ) {
    refuseV5Document(
      'R40_UPSTREAM_POOL_NOT_CLOSED',
      'the caller-owned R39 pool must be ended, with no client, before any R40 work',
    );
  }
  const proof: R39ReproductionProof = Object.freeze({
    kind: 'R40_FRESH_R39_REPRODUCTION_PROOF' as const,
    committedRecord: R39_CENSUS_PATH,
    comparedTopLevelFieldCount: Object.keys(fresh).length - R39_REPRODUCTION_EXCLUDED_FIELDS.length,
    excludedFields: R39_REPRODUCTION_EXCLUDED_FIELDS,
    differingSemanticPathCount: 0 as const,
    matchedRuns: fresh.deltaEvidence.matchedRuns,
    pageEvidenceSourceRows: fresh.deltaEvidence.pageEvidenceSourceRows,
    distinctResponseSha256Documents: fresh.deltaEvidence.distinctResponseSha256Documents,
    candidateRows: fresh.deltaEvidence.candidateRows,
    legacyAuthorityEvidenceQueries: fresh.databaseAccess.legacyAuthorityEvidenceQueries,
    deltaAuthorityEvidenceQueries: fresh.databaseAccess.deltaAuthorityEvidenceQueries,
    transaction: run.transactionProof,
    access,
    upstreamPoolClosedBeforeProof: true as const,
  });
  REPRODUCTION_PROOF_BY_BATCH.set(batch, proof);
  return proof;
}

/** The reproduction proof minted for exactly this R39 batch, or `undefined`. */
export function r39ReproductionProofForBatch(batch: unknown): R39ReproductionProof | undefined {
  if (typeof batch !== 'object' || batch === null) return undefined;
  return REPRODUCTION_PROOF_BY_BATCH.get(batch);
}

/** Re-exported so the binder names the R39 batch type through this gate. */
export type { A3DevTrainDurableEvidenceDeltaBatchV5 };

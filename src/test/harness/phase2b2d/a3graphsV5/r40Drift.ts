/**
 * PHASE 2B-2D — A3 R41: THE FRESH R40 REPRODUCTION GATE.
 *
 * R40's document-source batch is private in-process authority (WeakSet /
 * WeakMap provenance) and cannot be loaded from the committed census. A real
 * R41 run therefore re-mints R39 and R40 in-process. The census canonical R40
 * derives from THAT batch - with R40's own unchanged
 * `deriveR40PublicIncrementalDocumentSourceCensus` - must equal the committed
 * R40 census at every path except the one execution-provenance commit, and
 * must state the R40 checkpoint pinned below. Key order is not drift.
 *
 * THE UPSTREAM POOL WAS ALREADY CLOSED
 *
 *   R40 could only mint its batch from an R39 batch whose reproduction proof
 *   was minted for a caller-owned pool that reported itself ended with zero
 *   clients. This gate reads that R39 proof back - through R40's own
 *   provenance, never from the caller - and refuses unless it records the pool
 *   closed before the proof, so the R41 proof itself embodies "the upstream
 *   pool was closed before R40 assembly began, and therefore before any R22
 *   call".
 *
 * The proof is bound by object identity to the exact R40 batch it was minted
 * for. A spread, a structured clone, a JSON copy, a literal or a proof minted
 * for another batch is not one.
 *
 * THIS MODULE IS PURE apart from R40's pure census derivation. Its inputs
 * arrive already parsed; it reads no file. Differences are reported as field
 * PATHS, never values.
 */
import {
  R40_CENSUS_PATH,
  deriveR40PublicIncrementalDocumentSourceCensus,
  type R40CensusProvenance,
} from '../a3documentsV5/census.js';
import {
  evidenceDeltaBatchForDocumentSourceDeltaBatchV5,
  isA3DevTrainDocumentSourceDeltaBatchV5,
} from '../a3documentsV5/devTrain.js';
import { r39ReproductionProofForBatch } from '../a3documentsV5/r39Drift.js';
import type {
  A3DevTrainDocumentSourceDeltaBatchV5,
  HistoricalV5DocumentCoverageProof,
} from '../a3documentsV5/types.js';
import { refuseV5Graph } from './refusal.js';

/**
 * The ONE committed R40 field a fresh reproduction may legitimately differ
 * on: the commit the reproducing process executed at. Every other field must
 * match.
 */
export const R40_REPRODUCTION_EXCLUDED_FIELDS = Object.freeze(['implementationCommit'] as const);

/** The R40 checkpoint R41 was cut against, as [path, value] pairs. */
export const R41_EXPECTED_R40_CHECKPOINT: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], 'PHASE_2B_2D_A3_R40_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1'],
    [['split'], 'DEV_TRAIN'],
    [['r39Reproduction', 'freshR39CensusEqualsCommitted'], true],
    [['r39Reproduction', 'freshGovernance', 'v4DevTrainReady'], 13],
    [['r39Reproduction', 'freshGovernance', 'v5DevTrainReady'], 20],
    [['r39Reproduction', 'freshGovernance', 'unchanged'], 13],
    [['r39Reproduction', 'freshGovernance', 'new'], 7],
    [['r39Reproduction', 'freshGovernance', 'changed'], 0],
    [['r39Reproduction', 'freshGovernance', 'retracted'], 0],
    [['r39Reproduction', 'freshR39MatchedRuns'], 7],
    [['r39Reproduction', 'freshR39PageEvidenceSourceRows'], 224],
    [['r39Reproduction', 'freshR39DistinctResponseDocuments'], 223],
    [['r39Reproduction', 'freshR39CandidateRows'], 448],
    [['r39Reproduction', 'freshR39OldAuthorityQueries'], 0],
    [['r39Reproduction', 'freshR39NewAuthorityQueries'], 7],
    [['deltaAssembly', 'deltaSlotAssemblyCount'], 7],
    [['deltaAssembly', 'deltaSourceRows'], 224],
    [['deltaAssembly', 'deltaSlotLocalDistinctDocuments'], 223],
    [['deltaAssembly', 'deltaExactDuplicateGroups'], 1],
    [['deltaAssembly', 'deltaExactDuplicateRowsRemoved'], 1],
    [['deltaAssembly', 'deltaMultiSourceDocuments'], 1],
    [['deltaAssembly', 'deltaCandidateObservations'], 448],
    [['deltaExtractionSupport', 'deltaSupportedExtractionRows'], 224],
    [['deltaExtractionSupport', 'deltaUnsupportedExtractionRows'], 0],
    [['deltaExtractionSupport', 'deltaMixedVersionDocuments'], 0],
    [['deltaExtractionSupport', 'deltaTextDivergenceGroups'], 0],
    [['deltaScorePreparation', 'deltaR10Preparations'], 223],
    [['deltaScorePreparation', 'deltaR10SourceRowCoverage'], 224],
    [['deltaScorePreparation', 'deltaR10CandidateObservationCoverage'], 448],
    [['coverage', 'historicalDocumentSlots'], 13],
    [['coverage', 'newR40DocumentSlots'], 7],
    [['coverage', 'coverageDocumentSlots'], 20],
    [['coverage', 'coverageSourceRows'], 617],
    [['coverage', 'historicalSlotLocalDocuments'], 388],
    [['coverage', 'coverageSlotLocalDocuments'], 611],
    [['coverage', 'coverageCandidateObservations'], 1234],
    [['coverage', 'graphCoverageAfterR40'], 13],
    [['coverage', 'sampleCoverageAfterR40'], 13],
    [['coverage', 'readinessCoverageAfterR40'], 13],
    [['coverage', 'twentySlotDocumentBatchMinted'], false],
    [['semantics', 'canonicalR21AssemblyCalls'], 7],
    [['semantics', 'historicalR21AssemblyCalls'], 0],
    [['semantics', 'nearDuplicateGraphMeasured'], false],
    [['access', 'r40SqlStatements'], 0],
    [['access', 'upstreamRole'], 'nwf_readonly'],
    [['access', 'upstreamDatabase'], 'nwf_pe'],
    [['access', 'upstreamTransactionReadOnly'], true],
    [['access', 'upstreamTransactionIsolation'], 'repeatable read'],
    [['access', 'upstreamPoolConnections'], 1],
    [['access', 'upstreamSnapshotTransactions'], 1],
    [['access', 'upstreamSqlStatements'], 45],
    [['access', 'upstreamNewAuthorityEvidenceLoads'], 7],
    [['access', 'upstreamOldAuthorityEvidenceLoads'], 0],
    [['access', 'upstreamDevConfirmEvidenceReads'], 0],
    [['access', 'upstreamFinalHoldoutEvidenceReads'], 0],
    [['access', 'upstreamWrites'], 0],
    [['access', 'upstreamPoolClosedBeforeFirstR21Call'], true],
    [['access', 'r21CallsWhileUpstreamPoolOpen'], 0],
  ] as const);

/** A proof that ONE minted R40 batch reproduced the committed R40 census. */
export interface R40ReproductionProof {
  readonly kind: 'R41_FRESH_R40_REPRODUCTION_PROOF';
  readonly committedRecord: string;
  readonly comparedTopLevelFieldCount: number;
  readonly excludedFields: readonly string[];
  readonly differingSemanticPathCount: 0;
  readonly deltaSlots: number;
  readonly deltaSourceRows: number;
  readonly deltaSlotLocalDocuments: number;
  readonly deltaCandidateObservations: number;
  readonly r21AssemblyCalls: number;
  readonly historicalR21AssemblyCalls: number;
  readonly historicalDocumentSlots: number;
  readonly historicalSlotLocalDocuments: number;
  readonly coverageDocumentSlots: number;
  readonly coverageSlotLocalDocuments: number;
  readonly upstreamRole: string;
  readonly upstreamDatabase: string;
  readonly upstreamTransactionReadOnly: boolean;
  readonly upstreamTransactionIsolation: string;
  readonly upstreamPoolConnections: number;
  readonly upstreamSnapshotTransactions: number;
  readonly upstreamSqlStatements: number;
  readonly upstreamNewAuthorityEvidenceLoads: number;
  readonly upstreamOldAuthorityEvidenceLoads: number;
  readonly upstreamDevConfirmEvidenceReads: number;
  readonly upstreamFinalHoldoutEvidenceReads: number;
  readonly upstreamWrites: number;
  readonly upstreamPoolClosedBeforeR40Assembly: true;
}

const REPRODUCTION_PROOF_BY_BATCH = new WeakMap<object, R40ReproductionProof>();

function drift(message: string): never {
  refuseV5Graph('STOP_R41_FRESH_R40_REPRODUCTION_DRIFT_REQUIRES_REVIEW', message);
}

function at(record: unknown, path: readonly string[]): unknown {
  let value: unknown = record;
  for (const key of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Key-order-independent serialisation: reordering keys is not drift. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function differingPaths(fresh: unknown, committed: unknown, path: string, into: string[]): void {
  if (isPlainObject(fresh) && isPlainObject(committed)) {
    const keys = new Set([...Object.keys(fresh), ...Object.keys(committed)]);
    for (const key of [...keys].sort()) {
      differingPaths(fresh[key], committed[key], path === '' ? key : `${path}.${key}`, into);
    }
    return;
  }
  if (canonical(fresh) !== canonical(committed)) into.push(path);
}

function withoutExcluded(record: unknown): Record<string, unknown> {
  const copy = isPlainObject(record)
    ? (JSON.parse(JSON.stringify(record)) as Record<string, unknown>)
    : {};
  for (const field of R40_REPRODUCTION_EXCLUDED_FIELDS) delete copy[field];
  return copy;
}

/**
 * Field paths at which the fresh R40 census differs from the committed one,
 * over every field except the excluded execution-provenance commit. Empty
 * means the fresh reproduction equals the committed record.
 */
export function r40ReproductionDriftPaths(fresh: unknown, committed: unknown): readonly string[] {
  const differing: string[] = [];
  differingPaths(withoutExcluded(fresh), withoutExcluded(committed), '', differing);
  return Object.freeze(differing);
}

/**
 * §7 - §10. Derives the R40 census from the ACTUAL minted R40 batch with R40's
 * own derivation, requires it to equal the committed R40 census and the
 * pinned checkpoint, requires R40's own R39 proof to record the upstream pool
 * closed, and only then mints a reproduction proof bound to exactly that batch.
 * A batch is proved at most once.
 */
export function requireFreshR40Reproduction(
  documentDeltaBatch: A3DevTrainDocumentSourceDeltaBatchV5,
  r40HistoricalProof: HistoricalV5DocumentCoverageProof,
  provenance: R40CensusProvenance,
  committedR40Census: unknown,
): R40ReproductionProof {
  const batch: unknown = documentDeltaBatch;
  if (!isA3DevTrainDocumentSourceDeltaBatchV5(batch)) {
    refuseV5Graph(
      'R41_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R40',
      'the reproduction input is not a document-source delta batch minted by R40 in this process',
    );
  }
  if (REPRODUCTION_PROOF_BY_BATCH.has(batch)) {
    refuseV5Graph(
      'R41_R40_REPRODUCTION_ALREADY_PROVED',
      'this R40 batch already carries a reproduction proof',
    );
  }
  const r39Proof = r39ReproductionProofForBatch(
    evidenceDeltaBatchForDocumentSourceDeltaBatchV5(batch),
  );
  if (r39Proof === undefined || r39Proof.upstreamPoolClosedBeforeProof !== true) {
    refuseV5Graph(
      'R41_UPSTREAM_POOL_NOT_CLOSED_BEFORE_R40',
      'the R39 batch behind this R40 batch carries no proof that the upstream pool was closed',
    );
  }
  const fresh = deriveR40PublicIncrementalDocumentSourceCensus(
    batch,
    r40HistoricalProof,
    provenance,
  );
  const differing = r40ReproductionDriftPaths(fresh, committedR40Census);
  if (differing.length > 0) {
    drift(
      `the fresh R40 census differs from the committed one at ${String(differing.length)} path(s): ${differing.join(', ')}`,
    );
  }
  for (const [path, expected] of R41_EXPECTED_R40_CHECKPOINT) {
    if (at(fresh, path) !== expected)
      drift(`${path.join('.')} no longer equals the R40 checkpoint`);
  }
  const proof: R40ReproductionProof = Object.freeze({
    kind: 'R41_FRESH_R40_REPRODUCTION_PROOF' as const,
    committedRecord: R40_CENSUS_PATH,
    comparedTopLevelFieldCount: Object.keys(fresh).length - R40_REPRODUCTION_EXCLUDED_FIELDS.length,
    excludedFields: R40_REPRODUCTION_EXCLUDED_FIELDS,
    differingSemanticPathCount: 0 as const,
    deltaSlots: fresh.deltaAssembly.deltaSlotAssemblyCount,
    deltaSourceRows: fresh.deltaAssembly.deltaSourceRows,
    deltaSlotLocalDocuments: fresh.deltaAssembly.deltaSlotLocalDistinctDocuments,
    deltaCandidateObservations: fresh.deltaAssembly.deltaCandidateObservations,
    r21AssemblyCalls: fresh.semantics.canonicalR21AssemblyCalls,
    historicalR21AssemblyCalls: fresh.semantics.historicalR21AssemblyCalls,
    historicalDocumentSlots: fresh.coverage.historicalDocumentSlots,
    historicalSlotLocalDocuments: fresh.coverage.historicalSlotLocalDocuments,
    coverageDocumentSlots: fresh.coverage.coverageDocumentSlots,
    coverageSlotLocalDocuments: fresh.coverage.coverageSlotLocalDocuments,
    upstreamRole: fresh.access.upstreamRole,
    upstreamDatabase: fresh.access.upstreamDatabase,
    upstreamTransactionReadOnly: fresh.access.upstreamTransactionReadOnly,
    upstreamTransactionIsolation: fresh.access.upstreamTransactionIsolation,
    upstreamPoolConnections: fresh.access.upstreamPoolConnections,
    upstreamSnapshotTransactions: fresh.access.upstreamSnapshotTransactions,
    upstreamSqlStatements: fresh.access.upstreamSqlStatements,
    upstreamNewAuthorityEvidenceLoads: fresh.access.upstreamNewAuthorityEvidenceLoads,
    upstreamOldAuthorityEvidenceLoads: fresh.access.upstreamOldAuthorityEvidenceLoads,
    upstreamDevConfirmEvidenceReads: fresh.access.upstreamDevConfirmEvidenceReads,
    upstreamFinalHoldoutEvidenceReads: fresh.access.upstreamFinalHoldoutEvidenceReads,
    upstreamWrites: fresh.access.upstreamWrites,
    upstreamPoolClosedBeforeR40Assembly: true as const,
  });
  REPRODUCTION_PROOF_BY_BATCH.set(batch, proof);
  return proof;
}

/** The reproduction proof minted for exactly this R40 batch, or `undefined`. */
export function r40ReproductionProofForBatch(batch: unknown): R40ReproductionProof | undefined {
  if (typeof batch !== 'object' || batch === null) return undefined;
  return REPRODUCTION_PROOF_BY_BATCH.get(batch);
}

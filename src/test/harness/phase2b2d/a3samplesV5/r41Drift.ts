/**
 * PHASE 2B-2D — A3 R42: THE FRESH R41 REPRODUCTION GATE.
 *
 * R41's graph batch is private in-process authority (WeakSet / WeakMap
 * provenance) and cannot be loaded from the committed census. A real R42 run
 * therefore re-mints R39, R40 and R41 in-process. The census canonical R41
 * derives from THAT batch - with R41's own unchanged
 * `deriveR41PublicIncrementalSd7GraphCensus` - must equal the committed R41
 * census at every path except the one execution-provenance commit, and must
 * state the R41 checkpoint pinned below. Key order is not drift.
 *
 * THE UPSTREAM POOL WAS ALREADY CLOSED
 *
 *   R41 could only mint its batch from an R40 batch whose reproduction proof
 *   records the upstream pool closed before R40 assembly. This gate reads that
 *   R40 proof back - through R41's own provenance, never from the caller - and
 *   refuses unless it says so, so the R42 proof embodies "the upstream pool
 *   was closed before R40, R41 and therefore before any R23 call".
 *
 * The proof is bound by object identity to the exact R41 batch it was minted
 * for. A spread, a structured clone, a JSON copy, a literal or a proof minted
 * for another batch is not one.
 *
 * THIS MODULE IS PURE apart from R41's pure census derivation. Its inputs
 * arrive already parsed; it reads no file. Differences are reported as field
 * PATHS, never values.
 */
import {
  R41_PUBLIC_CENSUS_RECORD_KIND,
  deriveR41PublicIncrementalSd7GraphCensus,
  type R41CensusProvenance,
} from '../a3graphsV5/census.js';
import {
  documentSourceDeltaBatchForGraphDeltaBatchV5,
  isA3DevTrainSd7GraphDeltaBatchV5,
} from '../a3graphsV5/devTrain.js';
import { r40ReproductionProofForBatch } from '../a3graphsV5/r40Drift.js';
import type { A3DevTrainSd7GraphDeltaBatchV5 } from '../a3graphsV5/types.js';
import { refuseV5Sample } from './refusal.js';

/**
 * The ONE committed R41 field a fresh reproduction may legitimately differ
 * on: the commit the reproducing process executed at. Every other field must
 * match.
 */
export const R41_REPRODUCTION_EXCLUDED_FIELDS = Object.freeze(['implementationCommit'] as const);

/** The R41 checkpoint R42 was cut against, as [path, value] pairs. */
export const R42_EXPECTED_R41_CHECKPOINT: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], 'PHASE_2B_2D_A3_R41_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1'],
    [['split'], 'DEV_TRAIN'],
    [['r40Reproduction', 'freshR40CensusEqualsCommitted'], true],
    [['r40Reproduction', 'differingSemanticPathCount'], 0],
    [['deltaGraph', 'deltaGraphSlots'], 7],
    [['deltaGraph', 'deltaDocuments'], 223],
    [['deltaGraph', 'deltaMeasurableDocuments'], 200],
    [['deltaGraph', 'deltaShortTextUnresolved'], 23],
    [['deltaGraph', 'deltaComparedPairs'], 2920],
    [['deltaGraph', 'deltaNearDuplicateEdges'], 7],
    [['deltaGraph', 'deltaDocumentsInAtLeastOneNearDuplicateEdge'], 13],
    [['coverage', 'historicalCanonicalGraphSlots'], 13],
    [['coverage', 'newR41GraphSlots'], 7],
    [['coverage', 'coverageGraphSlots'], 20],
    [['coverage', 'historicalDocuments'], 388],
    [['coverage', 'historicalMeasurableDocuments'], 380],
    [['coverage', 'historicalShortTextUnresolved'], 8],
    [['coverage', 'coverageDocuments'], 611],
    [['coverage', 'coverageMeasurableDocuments'], 580],
    [['coverage', 'coverageShortTextUnresolved'], 31],
    [['coverage', 'coverageComparedPairs'], 8502],
    [['coverage', 'coverageNearDuplicateEdges'], 65],
    [['coverage', 'coverageDocumentsInAtLeastOneNearDuplicateEdge'], 54],
    [['coverage', 'authorityCoverage'], 20],
    [['coverage', 'evidenceCoverage'], 20],
    [['coverage', 'documentCoverage'], 20],
    [['coverage', 'graphCoverageAfterR41'], 20],
    [['coverage', 'sampleCoverageAfterR41'], 13],
    [['coverage', 'readinessCoverageAfterR41'], 13],
    [['coverage', 'twentySlotGraphBatchMinted'], false],
    [['semantics', 'historicalGraphsRemeasured'], false],
    [['semantics', 'historicalGraphObjectsReminted'], false],
    [['semantics', 'canonicalR22CallCount'], 7],
    [['semantics', 'historicalR22Calls'], 0],
    [['semantics', 'shortTextResolved'], false],
    [['semantics', 'componentsComputed'], false],
    [['semantics', 'survivorSelectionPerformed'], false],
    [['semantics', 'setPRanked'], false],
    [['semantics', 'setRRanked'], false],
    [['semantics', 'reachableMembershipPerformed'], false],
    [['semantics', 'sd9Evaluated'], false],
    [['access', 'r41SqlStatements'], 0],
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
    [['access', 'upstreamPoolClosedBeforeR40Assembly'], true],
    [['access', 'r21DocumentCallsDuringR40Reproduction'], 7],
    [['access', 'r22GraphCalls'], 7],
    [['access', 'historicalR22GraphCalls'], 0],
    [['access', 'sqlAfterUpstreamPoolClose'], 0],
  ] as const);

/** A proof that ONE minted R41 batch reproduced the committed R41 census. */
export interface R41ReproductionProof {
  readonly kind: 'R42_FRESH_R41_REPRODUCTION_PROOF';
  readonly committedRecord: string;
  readonly comparedTopLevelFieldCount: number;
  readonly excludedFields: readonly string[];
  readonly differingSemanticPathCount: 0;
  readonly deltaGraphSlots: number;
  readonly deltaDocuments: number;
  readonly deltaMeasurableDocuments: number;
  readonly deltaShortTextUnresolved: number;
  readonly deltaComparedPairs: number;
  readonly deltaNearDuplicateEdges: number;
  readonly deltaDocumentsInAtLeastOneEdge: number;
  readonly historicalGraphSlots: number;
  readonly historicalDocuments: number;
  readonly historicalMeasurableDocuments: number;
  readonly historicalShortTextUnresolved: number;
  readonly coverageGraphSlots: number;
  readonly coverageDocuments: number;
  readonly coverageMeasurableDocuments: number;
  readonly coverageShortTextUnresolved: number;
  readonly coverageComparedPairs: number;
  readonly coverageNearDuplicateEdges: number;
  readonly coverageDocumentsInAtLeastOneEdge: number;
  readonly authorityCoverage: number;
  readonly evidenceCoverage: number;
  readonly documentCoverage: number;
  readonly sampleCoverageBeforeR42: number;
  readonly readinessCoverageBeforeR42: number;
  readonly r21CallsDuringR40: number;
  readonly r22Calls: number;
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

const REPRODUCTION_PROOF_BY_BATCH = new WeakMap<object, R41ReproductionProof>();

function drift(message: string): never {
  refuseV5Sample('STOP_R42_FRESH_R41_REPRODUCTION_DRIFT_REQUIRES_REVIEW', message);
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
  for (const field of R41_REPRODUCTION_EXCLUDED_FIELDS) delete copy[field];
  return copy;
}

/**
 * Field paths at which the fresh R41 census differs from the committed one,
 * over every field except the excluded execution-provenance commit. Empty
 * means the fresh reproduction equals the committed record.
 */
export function r41ReproductionDriftPaths(fresh: unknown, committed: unknown): readonly string[] {
  const differing: string[] = [];
  differingPaths(withoutExcluded(fresh), withoutExcluded(committed), '', differing);
  return Object.freeze(differing);
}

function num(record: unknown, path: readonly string[]): number {
  const value = at(record, path);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    drift(`${path.join('.')} is not a count in the fresh R41 census`);
  }
  return value;
}

/**
 * §7 - §10. Derives the R41 census from the ACTUAL minted R41 batch with R41's
 * own derivation, requires it to equal the committed R41 census and the
 * pinned checkpoint, requires R41's own R40 proof to record the upstream pool
 * closed, and only then mints a reproduction proof bound to exactly that batch.
 * A batch is proved at most once.
 */
export function requireFreshR41Reproduction(
  graphDeltaBatch: A3DevTrainSd7GraphDeltaBatchV5,
  provenance: R41CensusProvenance,
  committedR41Census: unknown,
): R41ReproductionProof {
  const batch: unknown = graphDeltaBatch;
  if (!isA3DevTrainSd7GraphDeltaBatchV5(batch)) {
    refuseV5Sample(
      'R42_SD7_GRAPH_DELTA_NOT_MINTED_BY_R41',
      'the reproduction input is not an SD7 graph delta batch minted by R41 in this process',
    );
  }
  if (REPRODUCTION_PROOF_BY_BATCH.has(batch)) {
    refuseV5Sample(
      'R42_R41_REPRODUCTION_ALREADY_PROVED',
      'this R41 batch already carries a reproduction proof',
    );
  }
  const r40Proof = r40ReproductionProofForBatch(
    documentSourceDeltaBatchForGraphDeltaBatchV5(batch),
  );
  if (r40Proof === undefined || r40Proof.upstreamPoolClosedBeforeR40Assembly !== true) {
    refuseV5Sample(
      'R42_UPSTREAM_POOL_NOT_CLOSED_BEFORE_R40',
      'the R40 batch behind this R41 batch carries no proof that the upstream pool was closed',
    );
  }
  const fresh = deriveR41PublicIncrementalSd7GraphCensus(batch, provenance);
  const differing = r41ReproductionDriftPaths(fresh, committedR41Census);
  if (differing.length > 0) {
    drift(
      `the fresh R41 census differs from the committed one at ${String(differing.length)} path(s): ${differing.join(', ')}`,
    );
  }
  for (const [path, expected] of R42_EXPECTED_R41_CHECKPOINT) {
    if (at(fresh, path) !== expected)
      drift(`${path.join('.')} no longer equals the R41 checkpoint`);
  }
  const proof: R41ReproductionProof = Object.freeze({
    kind: 'R42_FRESH_R41_REPRODUCTION_PROOF' as const,
    committedRecord: R41_PUBLIC_CENSUS_RECORD_KIND,
    comparedTopLevelFieldCount: Object.keys(fresh).length - R41_REPRODUCTION_EXCLUDED_FIELDS.length,
    excludedFields: R41_REPRODUCTION_EXCLUDED_FIELDS,
    differingSemanticPathCount: 0 as const,
    deltaGraphSlots: num(fresh, ['deltaGraph', 'deltaGraphSlots']),
    deltaDocuments: num(fresh, ['deltaGraph', 'deltaDocuments']),
    deltaMeasurableDocuments: num(fresh, ['deltaGraph', 'deltaMeasurableDocuments']),
    deltaShortTextUnresolved: num(fresh, ['deltaGraph', 'deltaShortTextUnresolved']),
    deltaComparedPairs: num(fresh, ['deltaGraph', 'deltaComparedPairs']),
    deltaNearDuplicateEdges: num(fresh, ['deltaGraph', 'deltaNearDuplicateEdges']),
    deltaDocumentsInAtLeastOneEdge: num(fresh, [
      'deltaGraph',
      'deltaDocumentsInAtLeastOneNearDuplicateEdge',
    ]),
    historicalGraphSlots: num(fresh, ['coverage', 'historicalCanonicalGraphSlots']),
    historicalDocuments: num(fresh, ['coverage', 'historicalDocuments']),
    historicalMeasurableDocuments: num(fresh, ['coverage', 'historicalMeasurableDocuments']),
    historicalShortTextUnresolved: num(fresh, ['coverage', 'historicalShortTextUnresolved']),
    coverageGraphSlots: num(fresh, ['coverage', 'coverageGraphSlots']),
    coverageDocuments: num(fresh, ['coverage', 'coverageDocuments']),
    coverageMeasurableDocuments: num(fresh, ['coverage', 'coverageMeasurableDocuments']),
    coverageShortTextUnresolved: num(fresh, ['coverage', 'coverageShortTextUnresolved']),
    coverageComparedPairs: num(fresh, ['coverage', 'coverageComparedPairs']),
    coverageNearDuplicateEdges: num(fresh, ['coverage', 'coverageNearDuplicateEdges']),
    coverageDocumentsInAtLeastOneEdge: num(fresh, [
      'coverage',
      'coverageDocumentsInAtLeastOneNearDuplicateEdge',
    ]),
    authorityCoverage: num(fresh, ['coverage', 'authorityCoverage']),
    evidenceCoverage: num(fresh, ['coverage', 'evidenceCoverage']),
    documentCoverage: num(fresh, ['coverage', 'documentCoverage']),
    sampleCoverageBeforeR42: num(fresh, ['coverage', 'sampleCoverageAfterR41']),
    readinessCoverageBeforeR42: num(fresh, ['coverage', 'readinessCoverageAfterR41']),
    r21CallsDuringR40: num(fresh, ['access', 'r21DocumentCallsDuringR40Reproduction']),
    r22Calls: num(fresh, ['access', 'r22GraphCalls']),
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

/** The reproduction proof minted for exactly this R41 batch, or `undefined`. */
export function r41ReproductionProofForBatch(batch: unknown): R41ReproductionProof | undefined {
  if (typeof batch !== 'object' || batch === null) return undefined;
  return REPRODUCTION_PROOF_BY_BATCH.get(batch);
}

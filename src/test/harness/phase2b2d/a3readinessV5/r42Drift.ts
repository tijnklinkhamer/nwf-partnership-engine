/**
 * PHASE 2B-2D — A3 R43: THE FRESH R42 REPRODUCTION GATE.
 *
 * R42's sample batch is private in-process authority (WeakSet / WeakMap
 * provenance) and cannot be loaded from the committed census. A real R43 run
 * therefore re-mints R39, R40, R41 and R42 in-process. The census canonical
 * R42 derives from THAT batch - with R42's own unchanged
 * `deriveR42PublicIncrementalSampleSurvivorCensus` - must equal the committed
 * R42 census at every path except the one execution-provenance commit, and
 * must state the R42 checkpoint pinned below. Key order is not drift.
 *
 * THE UPSTREAM POOL WAS ALREADY CLOSED
 *
 *   R42 could only mint its batch from an R41 batch whose R42-side
 *   reproduction proof records the upstream pool closed before R40 assembly.
 *   This gate reads that proof back - through R42's own provenance, never
 *   from the caller - and refuses unless it says so, so the R43 proof embodies
 *   "the upstream pool was closed before R40, R41, R42 and therefore before
 *   any R24 call".
 *
 * The proof is bound by object identity to the exact R42 batch it was minted
 * for. A spread, a structured clone, a JSON copy, a literal or a proof minted
 * for another batch is not one.
 *
 * THIS MODULE IS PURE apart from R42's pure census derivation. Its inputs
 * arrive already parsed; it reads no file. Differences are reported as field
 * PATHS, never values.
 */
import {
  R42_PUBLIC_CENSUS_RECORD_KIND,
  deriveR42PublicIncrementalSampleSurvivorCensus,
  type R42CensusProvenance,
} from '../a3samplesV5/census.js';
import {
  graphDeltaBatchForSampleDeltaBatchV5,
  isA3DevTrainSampleSurvivorDeltaBatchV5,
} from '../a3samplesV5/devTrain.js';
import { r41ReproductionProofForBatch } from '../a3samplesV5/r41Drift.js';
import type { A3DevTrainSampleSurvivorDeltaBatchV5 } from '../a3samplesV5/types.js';
import { refuseV5Readiness } from './refusal.js';

/**
 * The ONE committed R42 field a fresh reproduction may legitimately differ
 * on: the commit the reproducing process executed at. Every other field must
 * match.
 */
export const R42_REPRODUCTION_EXCLUDED_FIELDS = Object.freeze(['implementationCommit'] as const);

/** The R42 checkpoint R43 was cut against, as [path, value] pairs. */
export const R43_EXPECTED_R42_CHECKPOINT: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], 'PHASE_2B_2D_A3_R42_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1'],
    [['split'], 'DEV_TRAIN'],
    [['r41Reproduction', 'freshR41CensusEqualsCommitted'], true],
    [['r41Reproduction', 'differingSemanticPathCount'], 0],
    [['delta', 'deltaSlotPreparations'], 7],
    [['delta', 'setP', 'preSd7RankEntryCount'], 223],
    [['delta', 'setP', 'measurableDocumentCount'], 200],
    [['delta', 'setP', 'measurableSurvivorCount'], 194],
    [['delta', 'setP', 'measurableExclusionCount'], 6],
    [['delta', 'setP', 'unresolvedShortTextOccurrenceCount'], 23],
    [['delta', 'setP', 'initialCapExactSlotCount'], 3],
    [['delta', 'setP', 'initialCapBlockedSlotCount'], 4],
    [['delta', 'setP', 'exactCapDocumentCountAcrossExactSlots'], 24],
    [['delta', 'setR', 'preSd7RankEntryCount'], 223],
    [['delta', 'setR', 'measurableDocumentCount'], 200],
    [['delta', 'setR', 'measurableSurvivorCount'], 194],
    [['delta', 'setR', 'measurableExclusionCount'], 6],
    [['delta', 'setR', 'unresolvedShortTextOccurrenceCount'], 23],
    [['delta', 'setR', 'initialCapExactSlotCount'], 5],
    [['delta', 'setR', 'initialCapBlockedSlotCount'], 2],
    [['delta', 'setR', 'exactCapDocumentCountAcrossExactSlots'], 20],
    [['delta', 'setR', 'fullRankExactSlotCount'], 3],
    [['delta', 'setR', 'fullRankShortTextBlockedSlotCount'], 4],
    [['delta', 'divergence', 'measurableDocumentCount'], 200],
    [['delta', 'divergence', 'survivingBothSamples'], 192],
    [['delta', 'divergence', 'survivingSetPOnly'], 2],
    [['delta', 'divergence', 'survivingSetROnly'], 2],
    [['delta', 'divergence', 'excludedInBothSamples'], 4],
    [['coverage', 'historicalCanonicalSlotPreparations'], 13],
    [['coverage', 'newR42SlotPreparations'], 7],
    [['coverage', 'coverageSlotPreparations'], 20],
    [['coverage', 'authorityCoverage'], 20],
    [['coverage', 'evidenceCoverage'], 20],
    [['coverage', 'documentCoverage'], 20],
    [['coverage', 'graphCoverageAfterR42'], 20],
    [['coverage', 'sampleCoverageAfterR42'], 20],
    [['coverage', 'readinessCoverageAfterR42'], 13],
    [['coverage', 'twentySlotSampleBatchMinted'], false],
    [['historicalPreparationCoverage', 'r37ReadinessSlots'], 13],
    [['historicalPreparationCoverage', 'r41HistoricalSampleCoverage'], 13],
    [['historicalPreparationCoverage', 'r41HistoricalReadinessCoverage'], 13],
    [['semantics', 'historicalPreparationsRecomputed'], false],
    [['semantics', 'historicalPreparationObjectsReminted'], false],
    [['semantics', 'canonicalR23CallCount'], 7],
    [['semantics', 'historicalR23Calls'], 0],
    [['semantics', 'shortTextResolved'], false],
    [['semantics', 'initialCapAndFullRankReadinessKeptSeparate'], true],
    [['semantics', 'reachableMembershipBound'], false],
    [['semantics', 'sd9Evaluated'], false],
    [['semantics', 'extensionPerformed'], false],
    [['semantics', 'completeCorpusPreflightRun'], false],
    [['access', 'r42SqlStatements'], 0],
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
    [['access', 'r21DocumentCalls'], 7],
    [['access', 'r22GraphCalls'], 7],
    [['access', 'r23SampleCalls'], 7],
    [['access', 'historicalR23SampleCalls'], 0],
    [['access', 'sqlAfterUpstreamPoolClose'], 0],
  ] as const);

/** One sample's reproduced R42 delta counts. */
export interface R42ReproducedSampleCounts {
  readonly measurableDocumentCount: number;
  readonly measurableSurvivorCount: number;
  readonly unresolvedShortTextOccurrenceCount: number;
  readonly initialCapExactSlotCount: number;
  readonly initialCapBlockedSlotCount: number;
  readonly exactCapDocumentCountAcrossExactSlots: number;
}

/** A proof that ONE minted R42 batch reproduced the committed R42 census. */
export interface R42ReproductionProof {
  readonly kind: 'R43_FRESH_R42_REPRODUCTION_PROOF';
  readonly committedRecord: string;
  readonly comparedTopLevelFieldCount: number;
  readonly excludedFields: readonly string[];
  readonly differingSemanticPathCount: 0;
  readonly deltaSlotPreparations: number;
  readonly deltaSetP: R42ReproducedSampleCounts;
  readonly deltaSetR: R42ReproducedSampleCounts;
  readonly deltaSetRFullRankExactSlotCount: number;
  readonly deltaSetRFullRankShortTextBlockedSlotCount: number;
  readonly deltaDivergence: {
    readonly survivingBothSamples: number;
    readonly survivingSetPOnly: number;
    readonly survivingSetROnly: number;
    readonly excludedInBothSamples: number;
  };
  readonly historicalSlotPreparations: number;
  readonly historicalSetP: R42ReproducedSampleCounts;
  readonly historicalSetR: R42ReproducedSampleCounts;
  readonly historicalSetRFullRankExactSlotCount: number;
  readonly historicalSetRFullRankShortTextBlockedSlotCount: number;
  readonly coverageSlotPreparations: number;
  readonly authorityCoverage: number;
  readonly evidenceCoverage: number;
  readonly documentCoverage: number;
  readonly graphCoverage: number;
  readonly sampleCoverageBeforeR43: number;
  readonly readinessCoverageBeforeR43: number;
  readonly r21Calls: number;
  readonly r22Calls: number;
  readonly r23Calls: number;
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

const REPRODUCTION_PROOF_BY_BATCH = new WeakMap<object, R42ReproductionProof>();

function drift(message: string): never {
  refuseV5Readiness('STOP_R43_FRESH_R42_REPRODUCTION_DRIFT_REQUIRES_REVIEW', message);
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
  for (const field of R42_REPRODUCTION_EXCLUDED_FIELDS) delete copy[field];
  return copy;
}

/**
 * Field paths at which the fresh R42 census differs from the committed one,
 * over every field except the excluded execution-provenance commit. Empty
 * means the fresh reproduction equals the committed record.
 */
export function r42ReproductionDriftPaths(fresh: unknown, committed: unknown): readonly string[] {
  const differing: string[] = [];
  differingPaths(withoutExcluded(fresh), withoutExcluded(committed), '', differing);
  return Object.freeze(differing);
}

function num(record: unknown, path: readonly string[]): number {
  const value = at(record, path);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    drift(`${path.join('.')} is not a count in the fresh R42 census`);
  }
  return value;
}

function sampleCounts(record: unknown, prefix: readonly string[]): R42ReproducedSampleCounts {
  return Object.freeze({
    measurableDocumentCount: num(record, [...prefix, 'measurableDocumentCount']),
    measurableSurvivorCount: num(record, [...prefix, 'measurableSurvivorCount']),
    unresolvedShortTextOccurrenceCount: num(record, [
      ...prefix,
      'unresolvedShortTextOccurrenceCount',
    ]),
    initialCapExactSlotCount: num(record, [...prefix, 'initialCapExactSlotCount']),
    initialCapBlockedSlotCount: num(record, [...prefix, 'initialCapBlockedSlotCount']),
    exactCapDocumentCountAcrossExactSlots: num(record, [
      ...prefix,
      'exactCapDocumentCountAcrossExactSlots',
    ]),
  });
}

/**
 * §8 - §11. Derives the R42 census from the ACTUAL minted R42 batch with R42's
 * own derivation, requires it to equal the committed R42 census and the
 * pinned checkpoint, requires R42's own R41 proof to record the upstream pool
 * closed, and only then mints a reproduction proof bound to exactly that
 * batch. A batch is proved at most once.
 */
export function requireFreshR42Reproduction(
  sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV5,
  provenance: R42CensusProvenance,
  committedR42Census: unknown,
): R42ReproductionProof {
  const batch: unknown = sampleDeltaBatch;
  if (!isA3DevTrainSampleSurvivorDeltaBatchV5(batch)) {
    refuseV5Readiness(
      'R43_SAMPLE_DELTA_NOT_MINTED_BY_R42',
      'the reproduction input is not a sample survivor delta batch minted by R42 in this process',
    );
  }
  if (REPRODUCTION_PROOF_BY_BATCH.has(batch)) {
    refuseV5Readiness(
      'R43_R42_REPRODUCTION_ALREADY_PROVED',
      'this R42 batch already carries a reproduction proof',
    );
  }
  const r41Proof = r41ReproductionProofForBatch(graphDeltaBatchForSampleDeltaBatchV5(batch));
  if (r41Proof === undefined || r41Proof.upstreamPoolClosedBeforeR40Assembly !== true) {
    refuseV5Readiness(
      'R43_UPSTREAM_POOL_NOT_CLOSED_BEFORE_R40',
      'the R41 batch behind this R42 batch carries no proof that the upstream pool was closed',
    );
  }
  const fresh = deriveR42PublicIncrementalSampleSurvivorCensus(batch, provenance);
  const differing = r42ReproductionDriftPaths(fresh, committedR42Census);
  if (differing.length > 0) {
    drift(
      `the fresh R42 census differs from the committed one at ${String(differing.length)} path(s): ${differing.join(', ')}`,
    );
  }
  for (const [path, expected] of R43_EXPECTED_R42_CHECKPOINT) {
    if (at(fresh, path) !== expected)
      drift(`${path.join('.')} no longer equals the R42 checkpoint`);
  }
  const proof: R42ReproductionProof = Object.freeze({
    kind: 'R43_FRESH_R42_REPRODUCTION_PROOF' as const,
    committedRecord: R42_PUBLIC_CENSUS_RECORD_KIND,
    comparedTopLevelFieldCount: Object.keys(fresh).length - R42_REPRODUCTION_EXCLUDED_FIELDS.length,
    excludedFields: R42_REPRODUCTION_EXCLUDED_FIELDS,
    differingSemanticPathCount: 0 as const,
    deltaSlotPreparations: num(fresh, ['delta', 'deltaSlotPreparations']),
    deltaSetP: sampleCounts(fresh, ['delta', 'setP']),
    deltaSetR: sampleCounts(fresh, ['delta', 'setR']),
    deltaSetRFullRankExactSlotCount: num(fresh, ['delta', 'setR', 'fullRankExactSlotCount']),
    deltaSetRFullRankShortTextBlockedSlotCount: num(fresh, [
      'delta',
      'setR',
      'fullRankShortTextBlockedSlotCount',
    ]),
    deltaDivergence: Object.freeze({
      survivingBothSamples: num(fresh, ['delta', 'divergence', 'survivingBothSamples']),
      survivingSetPOnly: num(fresh, ['delta', 'divergence', 'survivingSetPOnly']),
      survivingSetROnly: num(fresh, ['delta', 'divergence', 'survivingSetROnly']),
      excludedInBothSamples: num(fresh, ['delta', 'divergence', 'excludedInBothSamples']),
    }),
    historicalSlotPreparations: num(fresh, ['coverage', 'historicalCanonicalSlotPreparations']),
    historicalSetP: sampleCounts(fresh, ['coverage', 'historical', 'setP']),
    historicalSetR: sampleCounts(fresh, ['coverage', 'historical', 'setR']),
    historicalSetRFullRankExactSlotCount: num(fresh, [
      'coverage',
      'historical',
      'setR',
      'fullRankExactSlotCount',
    ]),
    historicalSetRFullRankShortTextBlockedSlotCount: num(fresh, [
      'coverage',
      'historical',
      'setR',
      'fullRankShortTextBlockedSlotCount',
    ]),
    coverageSlotPreparations: num(fresh, ['coverage', 'coverageSlotPreparations']),
    authorityCoverage: num(fresh, ['coverage', 'authorityCoverage']),
    evidenceCoverage: num(fresh, ['coverage', 'evidenceCoverage']),
    documentCoverage: num(fresh, ['coverage', 'documentCoverage']),
    graphCoverage: num(fresh, ['coverage', 'graphCoverageAfterR42']),
    sampleCoverageBeforeR43: num(fresh, ['coverage', 'sampleCoverageAfterR42']),
    readinessCoverageBeforeR43: num(fresh, ['coverage', 'readinessCoverageAfterR42']),
    r21Calls: num(fresh, ['access', 'r21DocumentCalls']),
    r22Calls: num(fresh, ['access', 'r22GraphCalls']),
    r23Calls: num(fresh, ['access', 'r23SampleCalls']),
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

/** The reproduction proof minted for exactly this R42 batch, or `undefined`. */
export function r42ReproductionProofForBatch(batch: unknown): R42ReproductionProof | undefined {
  if (typeof batch !== 'object' || batch === null) return undefined;
  return REPRODUCTION_PROOF_BY_BATCH.get(batch);
}

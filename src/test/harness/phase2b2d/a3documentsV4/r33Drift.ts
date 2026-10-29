/**
 * PHASE 2B-2D — A3 R34: THE FRESH R33 REPRODUCTION GATE AND THE COMMITTED
 * R21 + R27 HISTORICAL BASELINE.
 *
 * Neither is authority for the delta. The authority is the fresh, in-process
 * R33 mint; these only stop the slice when something moved under it.
 *
 *   1. FRESH R33 REPRODUCTION. R33's evidence batch is private in-process
 *      authority (WeakSet / WeakMap provenance) and cannot be loaded from the
 *      committed census. A real R34 run therefore re-mints R33 in-process.
 *      The census canonical R33 derives from THAT batch must equal the
 *      committed R33 census on every field except the one execution-
 *      provenance commit, and must state the R33 checkpoint pinned below.
 *      Only then is a reproduction proof minted - for that exact batch.
 *
 *   2. HISTORICAL R21 + R27 BASELINE. The committed R21 and R27 public
 *      censuses are read as aggregate historical records only. They are NOT
 *      re-derived (that would need the old-six evidence read R33 exists to
 *      avoid, and the old-six reassembly R34 exists to avoid), and they say
 *      nothing about the delta. Their arithmetic must close to six slots.
 *
 * THIS MODULE IS PURE. Its inputs arrive already parsed; it reads no file.
 * Differences are reported as field PATHS, never values.
 */
import type { ReadOnlyTransactionProof } from '../a3evidence/database.js';
import {
  deriveR33PublicIncrementalEvidenceCensus,
  type R33CensusProvenance,
  type R33PublicIncrementalEvidenceCensus,
} from '../a3evidenceV4/census.js';
import { isA3DevTrainDurableEvidenceDeltaBatchV4 } from '../a3evidenceV4/devTrain.js';
import type { GovernanceDriftProofV4 } from '../a3evidenceV4/r32Drift.js';
import type {
  A3DevTrainDurableEvidenceDeltaBatchV4,
  CanonicalHistoricalEvidenceCoverage,
} from '../a3evidenceV4/types.js';
import { refuseV4Document } from './refusal.js';
import type { HistoricalDocumentSourceCoverageBaseline } from './types.js';

// ---------------------------------------------------------------------------
// A. THE FRESH R33 REPRODUCTION.
// ---------------------------------------------------------------------------

/**
 * The ONE committed R33 field a fresh reproduction may legitimately differ
 * on: the commit the reproducing process executed at. Every other field -
 * record, split, R32 provenance, governance delta, history, coverage, delta
 * evidence, versions, integrity, access, semantics, disclosure - must match.
 */
export const R33_REPRODUCTION_EXCLUDED_FIELDS = Object.freeze(['implementationCommit'] as const);

/** The R33 checkpoint R34 was cut against. */
export const R34_EXPECTED_R33_CHECKPOINT = Object.freeze({
  record: 'PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1',
  split: 'DEV_TRAIN',
  'governanceDelta.registryV4CheckpointCommit': '67ae047fb7de079bcba0eec83ca4f4baee77cc3e',
  'governanceDelta.v3DevTrainReadyCount': 6,
  'governanceDelta.v4DevTrainReadyCount': 13,
  'governanceDelta.unchangedAuthorityCount': 6,
  'governanceDelta.newAuthorityCount': 7,
  'governanceDelta.changedExistingAuthorityCount': 0,
  'governanceDelta.removedAuthorityCount': 0,
  'canonicalHistory.historicalCanonicalCoverageCount': 6,
  'coverage.totalAuthorityCoverageAfterExpansion': 13,
  'deltaEvidence.matchedRuns': 7,
  'deltaEvidence.validCompletions': 7,
  'deltaEvidence.fetchObservationRows': 279,
  'deltaEvidence.pageEvidenceSourceRows': 198,
  'deltaEvidence.distinctResponseSha256Documents': 197,
  'deltaEvidence.candidateRows': 396,
  'deltaEvidence.multipleExtractionVersionDocuments': 0,
  'versionBreakdown.acquisitionPolicyVersionCounts.orgunit-fetch-policy-v6': 6,
  'versionBreakdown.acquisitionPolicyVersionCounts.orgunit-fetch-policy-v7': 1,
  'versionBreakdown.pageExtractionRuleVersionCounts.orgunit-extraction-v2': 198,
  'versionBreakdown.candidateSignalRuleVersionCounts.orgunit-signal-rules-v1': 396,
  'versionBreakdown.candidateTrackCounts.INTERNATIONAL_OFFICE': 198,
  'versionBreakdown.candidateTrackCounts.LANGUAGE_CENTRE': 198,
  'integrity.identityContaminationCount': 0,
  'integrity.fetchPolicyMismatchCount': 0,
  'integrity.relationalOrphanCount': 0,
  'integrity.sameDocumentSameExtractionConflictCount': 0,
  'integrity.candidateTrackPairViolationCount': 0,
  'databaseAccess.legacyAuthorityEvidenceQueries': 0,
  'databaseAccess.deltaAuthorityEvidenceQueries': 7,
  'databaseAccess.writes': 0,
});

/** A proof that ONE minted R33 batch reproduced the committed R33 census. */
export interface R33ReproductionProof {
  readonly kind: 'R34_FRESH_R33_REPRODUCTION_PROOF';
  readonly comparedTopLevelFieldCount: number;
  readonly excludedFields: readonly string[];
  readonly differingPaths: readonly [];
  readonly legacyAuthorityEvidenceQueries: number;
  readonly deltaAuthorityEvidenceQueries: number;
}

const REPRODUCTION_PROOF_BY_BATCH = new WeakMap<object, R33ReproductionProof>();

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function differingPaths(fresh: unknown, committed: unknown, path: string, into: string[]): void {
  const freshIsObject = typeof fresh === 'object' && fresh !== null && !Array.isArray(fresh);
  const committedIsObject =
    typeof committed === 'object' && committed !== null && !Array.isArray(committed);
  if (freshIsObject && committedIsObject) {
    const keys = new Set([...Object.keys(fresh as object), ...Object.keys(committed as object)]);
    for (const key of [...keys].sort()) {
      differingPaths(
        (fresh as Record<string, unknown>)[key],
        (committed as Record<string, unknown>)[key],
        path === '' ? key : `${path}.${key}`,
        into,
      );
    }
    return;
  }
  if (canonical(fresh) !== canonical(committed)) into.push(path);
}

/** Resolves a dotted path whose LAST segment may itself contain dots or dashes. */
function at(record: unknown, path: string): unknown {
  let cursor: unknown = record;
  let rest = path;
  while (rest.length > 0) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    const object = cursor as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(object, rest)) return object[rest];
    const dot = rest.indexOf('.');
    if (dot < 0) return undefined;
    cursor = object[rest.slice(0, dot)];
    rest = rest.slice(dot + 1);
  }
  return cursor;
}

/**
 * Field paths whose fresh value differs from the committed R33 census, over
 * every field except the excluded execution-provenance commit. Empty means
 * the fresh reproduction equals the committed record.
 */
export function r33ReproductionDriftPaths(
  fresh: R33PublicIncrementalEvidenceCensus,
  committed: unknown,
): readonly string[] {
  const freshRecord = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown>;
  const committedRecord =
    typeof committed === 'object' && committed !== null && !Array.isArray(committed)
      ? (JSON.parse(JSON.stringify(committed)) as Record<string, unknown>)
      : {};
  for (const field of R33_REPRODUCTION_EXCLUDED_FIELDS) {
    delete freshRecord[field];
    delete committedRecord[field];
  }
  const differing: string[] = [];
  differingPaths(freshRecord, committedRecord, '', differing);
  return Object.freeze(differing);
}

/**
 * §5. Derives the R33 census from the ACTUAL minted R33 batch (with R33's own
 * derivation function), requires it to equal the committed R33 census and the
 * pinned checkpoint, and only then mints a reproduction proof for that batch.
 */
export function requireFreshR33Reproduction(
  batch: A3DevTrainDurableEvidenceDeltaBatchV4,
  transactionProof: ReadOnlyTransactionProof,
  driftProof: GovernanceDriftProofV4,
  historyProof: CanonicalHistoricalEvidenceCoverage,
  provenance: R33CensusProvenance,
  committedR33Census: unknown,
): R33ReproductionProof {
  if (!isA3DevTrainDurableEvidenceDeltaBatchV4(batch)) {
    refuseV4Document(
      'R34_EVIDENCE_DELTA_NOT_MINTED_BY_R33',
      'the reproduction input is not a delta batch minted by R33 in this process',
    );
  }
  const fresh = deriveR33PublicIncrementalEvidenceCensus(
    batch,
    transactionProof,
    driftProof,
    historyProof,
    provenance,
  );
  const differing = r33ReproductionDriftPaths(fresh, committedR33Census);
  if (differing.length > 0) {
    refuseV4Document(
      'STOP_R34_FRESH_R33_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
      `the fresh R33 census differs from the committed one at ${differing.join(', ')}`,
    );
  }
  for (const [path, expected] of Object.entries(R34_EXPECTED_R33_CHECKPOINT)) {
    if (at(fresh, path) !== expected) {
      refuseV4Document(
        'STOP_R34_FRESH_R33_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
        `${path} no longer equals the R33 checkpoint`,
      );
    }
  }
  const proof: R33ReproductionProof = Object.freeze({
    kind: 'R34_FRESH_R33_REPRODUCTION_PROOF' as const,
    comparedTopLevelFieldCount: Object.keys(fresh).length - R33_REPRODUCTION_EXCLUDED_FIELDS.length,
    excludedFields: R33_REPRODUCTION_EXCLUDED_FIELDS,
    differingPaths: Object.freeze([]) as readonly [],
    legacyAuthorityEvidenceQueries: batch.coverage.legacyAuthorityEvidenceRequests,
    deltaAuthorityEvidenceQueries: batch.coverage.deltaAuthorityEvidenceRequests,
  });
  REPRODUCTION_PROOF_BY_BATCH.set(batch, proof);
  return proof;
}

/** The reproduction proof minted for exactly this R33 batch, or `undefined`. */
export function r33ReproductionProofForBatch(batch: unknown): R33ReproductionProof | undefined {
  if (typeof batch !== 'object' || batch === null) return undefined;
  return REPRODUCTION_PROOF_BY_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. THE COMMITTED R21 + R27 HISTORICAL BASELINE.
// ---------------------------------------------------------------------------

/** The canonical historical R21 aggregate baseline, as its committed census states it. */
export const R34_EXPECTED_R21_HISTORY = Object.freeze({
  record: 'PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
  split: 'DEV_TRAIN',
  'assembly.mintedSlotAssemblyCount': 5,
  'assembly.pageEvidenceSourceRowCount': 160,
  'assembly.slotLocalDistinctDocumentCount': 156,
  'assembly.exactDuplicateGroupCount': 3,
  'assembly.exactDuplicateRowsRemoved': 4,
  'assembly.documentsWithMultipleSourceRows': 3,
  'extractionSupport.unsupportedExtractionSourceRowCount': 0,
  'extractionSupport.multiExtractionVersionDocumentCount': 0,
  'extractionSupport.textDivergenceGroupCount': 0,
  'scorePreparation.r10ScorePreparationCount': 156,
  'scorePreparation.r10SourceRowCoverageCount': 160,
  'scorePreparation.r10CandidateObservationCoverageCount': 320,
  'scorePreparation.candidateObservationsAssembled': 320,
});

/** The canonical historical R27 aggregate record, as its committed census states it. */
export const R34_EXPECTED_R27_HISTORY = Object.freeze({
  record: 'PHASE_2B_2D_A3_R27_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
  split: 'DEV_TRAIN',
  'deltaAssembly.deltaSlotAssemblyCount': 1,
  'deltaExtractionSupport.deltaUnsupportedExtractionRows': 0,
  'deltaExtractionSupport.deltaMixedVersionDocuments': 0,
  'deltaExtractionSupport.deltaTextDivergenceGroups': 0,
  'coverage.historicalCanonicalR21Slots': 5,
  'coverage.newR27Slots': 1,
  'coverage.coverageSlots': 6,
  'coverage.v2DevTrainAuthorityCoverage': 6,
  'coverage.coverageSourceRows': 195,
  'coverage.coverageSlotLocalDocuments': 191,
  'coverage.coverageExactDuplicateGroups': 3,
  'coverage.coverageExactDuplicateRowsRemoved': 4,
  'coverage.coverageMultiSourceDocuments': 3,
  'coverage.coverageCandidateObservations': 390,
  'coverage.coverageR10Preparations': 191,
  'coverage.coverageR10SourceRows': 195,
  'coverage.coverageR10CandidateObservations': 390,
  'semantics.historicalR21SlotsReassembled': false,
  'semantics.deltaOnlyAssembly': true,
  'semantics.crossOrganisationExactDedupePerformed': false,
});

const HISTORICAL_BASELINES = new WeakSet<object>();

function historyDrift(message: string): never {
  refuseV4Document('STOP_R34_HISTORICAL_R21_R27_BASELINE_DRIFT_REQUIRES_REVIEW', message);
}

/**
 * §6. The committed R21 and R27 records still state the canonical history,
 * and it closes: R27's historical = R21's totals, R27's coverage = R21 + R27
 * delta on every aggregate, and the slot count is exactly six.
 */
export function requireHistoricalDocumentSourceBaseline(
  committedR21Census: unknown,
  committedR27Census: unknown,
): HistoricalDocumentSourceCoverageBaseline {
  for (const [path, expected] of Object.entries(R34_EXPECTED_R21_HISTORY)) {
    if (at(committedR21Census, path) !== expected) {
      historyDrift(`the committed R21 historical record ${path} differs`);
    }
  }
  for (const [path, expected] of Object.entries(R34_EXPECTED_R27_HISTORY)) {
    if (at(committedR27Census, path) !== expected) {
      historyDrift(`the committed R27 historical record ${path} differs`);
    }
  }
  const r21 = (path: string): number => at(committedR21Census, `assembly.${path}`) as number;
  const r21Score = (path: string): number =>
    at(committedR21Census, `scorePreparation.${path}`) as number;
  const r27 = (path: string): number => at(committedR27Census, `coverage.${path}`) as number;
  const r27Delta = (path: string): number =>
    at(committedR27Census, `deltaAssembly.${path}`) as number;
  const r27Score = (path: string): number =>
    at(committedR27Census, `deltaScorePreparation.${path}`) as number;

  const closes: [string, number, number, number][] = [
    [
      'slots',
      r21('mintedSlotAssemblyCount'),
      r27Delta('deltaSlotAssemblyCount'),
      r27('coverageSlots'),
    ],
    [
      'source rows',
      r21('pageEvidenceSourceRowCount'),
      r27Delta('deltaSourceRows'),
      r27('coverageSourceRows'),
    ],
    [
      'slot-local documents',
      r21('slotLocalDistinctDocumentCount'),
      r27Delta('deltaSlotLocalDistinctDocuments'),
      r27('coverageSlotLocalDocuments'),
    ],
    [
      'exact-duplicate groups',
      r21('exactDuplicateGroupCount'),
      r27Delta('deltaExactDuplicateGroups'),
      r27('coverageExactDuplicateGroups'),
    ],
    [
      'exact-duplicate rows removed',
      r21('exactDuplicateRowsRemoved'),
      r27Delta('deltaExactDuplicateRowsRemoved'),
      r27('coverageExactDuplicateRowsRemoved'),
    ],
    [
      'multi-source documents',
      r21('documentsWithMultipleSourceRows'),
      r27Delta('deltaMultiSourceDocuments'),
      r27('coverageMultiSourceDocuments'),
    ],
    [
      'candidate observations',
      r21Score('candidateObservationsAssembled'),
      r27Delta('deltaCandidateObservations'),
      r27('coverageCandidateObservations'),
    ],
    [
      'R10 preparations',
      r21Score('r10ScorePreparationCount'),
      r27Score('deltaR10Preparations'),
      r27('coverageR10Preparations'),
    ],
    [
      'R10 source rows',
      r21Score('r10SourceRowCoverageCount'),
      r27Score('deltaR10SourceRowCoverage'),
      r27('coverageR10SourceRows'),
    ],
    [
      'R10 candidate observations',
      r21Score('r10CandidateObservationCoverageCount'),
      r27Score('deltaR10CandidateObservationCoverage'),
      r27('coverageR10CandidateObservations'),
    ],
  ];
  for (const [name, historical, delta, coverage] of closes) {
    if (
      !Number.isInteger(historical) ||
      !Number.isInteger(delta) ||
      historical + delta !== coverage
    ) {
      historyDrift(`the R21 + R27 ${name} arithmetic does not close`);
    }
  }
  if (
    r27('historicalCanonicalR21Slots') !== r21('mintedSlotAssemblyCount') ||
    r27('historicalSourceRows') !== r21('pageEvidenceSourceRowCount') ||
    r27('historicalSlotLocalDocuments') !== r21('slotLocalDistinctDocumentCount')
  ) {
    historyDrift("R27's historical baseline is not R21's committed totals");
  }

  const baseline: HistoricalDocumentSourceCoverageBaseline = Object.freeze({
    r21SlotCount: r21('mintedSlotAssemblyCount'),
    r27NewSlotCount: r27Delta('deltaSlotAssemblyCount'),
    slotCount: r27('coverageSlots'),
    sourceRows: r27('coverageSourceRows'),
    slotLocalDocuments: r27('coverageSlotLocalDocuments'),
    exactDuplicateGroups: r27('coverageExactDuplicateGroups'),
    exactDuplicateRowsRemoved: r27('coverageExactDuplicateRowsRemoved'),
    multiSourceDocuments: r27('coverageMultiSourceDocuments'),
    candidateObservations: r27('coverageCandidateObservations'),
    r10Preparations: r27('coverageR10Preparations'),
    r10SourceRows: r27('coverageR10SourceRows'),
    r10CandidateObservations: r27('coverageR10CandidateObservations'),
  });
  HISTORICAL_BASELINES.add(baseline);
  return baseline;
}

/** A baseline THIS module proved from the committed records, or a refusal. */
export function requireHistoricalBaselineProof(
  baseline: unknown,
): HistoricalDocumentSourceCoverageBaseline {
  if (typeof baseline !== 'object' || baseline === null || !HISTORICAL_BASELINES.has(baseline)) {
    refuseV4Document(
      'R34_HISTORICAL_BASELINE_NOT_PROVED',
      'the historical baseline was not proved from the committed R21 and R27 records',
    );
  }
  return baseline as HistoricalDocumentSourceCoverageBaseline;
}

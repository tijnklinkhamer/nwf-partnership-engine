/**
 * PHASE 2B-2D — A3 R27: THE TWO AGGREGATE CROSS-CHECKS.
 *
 * Neither is authority for the delta. The authority is the fresh, in-process
 * R26 mint; these only stop the slice when something moved under it.
 *
 *   1. §31 R26 DELTA DRIFT. A real R27 run re-mints R26 in-process (its
 *      objects cannot be loaded from disk). The census canonical R26 derives
 *      from that fresh run must equal the committed R26 census on every
 *      aggregate section, and must state the R26 checkpoint pinned below.
 *      Provenance commits are excluded: they legitimately differ.
 *
 *   2. §28 HISTORICAL R21 BASELINE. The committed R21 public census is read
 *      as an aggregate historical record only. It is NOT re-derived (that
 *      would need the old-five evidence read R26 exists to avoid, and the
 *      old-five reassembly R27 exists to avoid), and it says nothing about
 *      the delta.
 *
 * THIS MODULE IS PURE. Its inputs arrive already parsed; it reads no file.
 * Differences are reported as field PATHS, never values.
 */
import type { R26PublicIncrementalEvidenceCensus } from '../a3evidenceV2/census.js';
import { refuseV2Document } from './refusal.js';

/** The aggregate sections of the R26 census compared for drift. */
export const R26_DRIFT_CROSS_CHECK_SECTIONS = Object.freeze([
  'governanceDelta',
  'deltaEvidence',
  'versionBreakdown',
  'integrity',
  'databaseAccess',
  'semantics',
] as const);

/** The R26 checkpoint R27 was cut against. */
export const R27_EXPECTED_R26_CHECKPOINT = Object.freeze({
  'governanceDelta.v1DevTrainReadyCount': 5,
  'governanceDelta.v2DevTrainReadyCount': 6,
  'governanceDelta.unchangedAuthorityCount': 5,
  'governanceDelta.newAuthorityCount': 1,
  'governanceDelta.changedExistingAuthorityCount': 0,
  'governanceDelta.removedAuthorityCount': 0,
  'databaseAccess.legacyAuthorityEvidenceQueries': 0,
  'databaseAccess.deltaAuthorityEvidenceQueries': 1,
  'deltaEvidence.matchedRuns': 1,
  'deltaEvidence.fetchObservationRows': 41,
  'deltaEvidence.pageEvidenceSourceRows': 35,
  'deltaEvidence.distinctResponseSha256Documents': 35,
  'deltaEvidence.candidateRows': 70,
  'deltaEvidence.duplicateDocumentSourceRows': 0,
  'integrity.identityContaminationCount': 0,
  'integrity.fetchPolicyMismatchCount': 0,
  'integrity.relationalOrphanCount': 0,
  'integrity.sameDocumentSameExtractionConflictCount': 0,
  'integrity.candidateTrackPairViolationCount': 0,
});

/** The canonical historical R21 aggregate baseline, as its committed census states it. */
export const R27_EXPECTED_R21_HISTORICAL_BASELINE = Object.freeze({
  record: 'PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
  split: 'DEV_TRAIN',
  'assembly.mintedSlotAssemblyCount': 5,
  'assembly.pageEvidenceSourceRowCount': 160,
  'assembly.slotLocalDistinctDocumentCount': 156,
  'assembly.exactDuplicateGroupCount': 3,
  'assembly.exactDuplicateRowsRemoved': 4,
  'assembly.documentsWithMultipleSourceRows': 3,
  'extractionSupport.supportedExtractionSourceRowCount': 160,
  'extractionSupport.unsupportedExtractionSourceRowCount': 0,
  'extractionSupport.multiExtractionVersionDocumentCount': 0,
  'extractionSupport.textDivergenceGroupCount': 0,
  'scorePreparation.r10ScorePreparationCount': 156,
  'scorePreparation.r10SourceRowCoverageCount': 160,
  'scorePreparation.r10CandidateObservationCoverageCount': 320,
  'scorePreparation.candidateObservationsAssembled': 320,
});

/** The historical R21 aggregates the coverage expansion consumes. Counts only. */
export interface R21HistoricalCoverageBaseline {
  readonly slotCount: number;
  readonly sourceRows: number;
  readonly slotLocalDocuments: number;
  readonly exactDuplicateGroups: number;
  readonly exactDuplicateRowsRemoved: number;
  readonly multiSourceDocuments: number;
  readonly candidateObservations: number;
  readonly r10Preparations: number;
  readonly r10SourceRows: number;
  readonly r10CandidateObservations: number;
}

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
        `${path}.${key}`,
        into,
      );
    }
    return;
  }
  if (canonical(fresh) !== canonical(committed)) into.push(path);
}

function at(record: unknown, path: string): unknown {
  let cursor: unknown = record;
  for (const key of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

/**
 * Field paths whose fresh value differs from the committed R26 census, over
 * the aggregate sections only. Empty means no aggregate drift.
 */
export function r26DeltaDriftPaths(
  fresh: R26PublicIncrementalEvidenceCensus,
  committed: unknown,
): readonly string[] {
  const differing: string[] = [];
  const committedRecord =
    typeof committed === 'object' && committed !== null
      ? (committed as Record<string, unknown>)
      : {};
  const freshRecord = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown>;
  for (const section of R26_DRIFT_CROSS_CHECK_SECTIONS) {
    differingPaths(freshRecord[section], committedRecord[section], section, differing);
  }
  return Object.freeze(differing);
}

/** §31. No aggregate drift, and the fresh run still states the R26 checkpoint. */
export function requireNoR26DeltaDrift(
  fresh: R26PublicIncrementalEvidenceCensus,
  committed: unknown,
): void {
  const differing = r26DeltaDriftPaths(fresh, committed);
  if (differing.length > 0) {
    refuseV2Document(
      'STOP_R27_CANONICAL_R26_DELTA_DRIFT_REQUIRES_REVIEW',
      `the fresh R26 census differs from the committed one at ${differing.join(', ')}`,
    );
  }
  for (const [path, expected] of Object.entries(R27_EXPECTED_R26_CHECKPOINT)) {
    if (at(fresh, path) !== expected) {
      refuseV2Document(
        'STOP_R27_CANONICAL_R26_DELTA_DRIFT_REQUIRES_REVIEW',
        `${path} no longer equals the R26 checkpoint`,
      );
    }
  }
}

/** §28. The committed R21 census still states the canonical historical baseline. */
export function requireR21HistoricalBaseline(
  committedR21Census: unknown,
): R21HistoricalCoverageBaseline {
  for (const [path, expected] of Object.entries(R27_EXPECTED_R21_HISTORICAL_BASELINE)) {
    if (at(committedR21Census, path) !== expected) {
      refuseV2Document(
        'STOP_R27_HISTORICAL_R21_BASELINE_DRIFT_REQUIRES_REVIEW',
        `the committed R21 historical baseline ${path} differs`,
      );
    }
  }
  const count = (path: string): number => at(committedR21Census, path) as number;
  return Object.freeze({
    slotCount: count('assembly.mintedSlotAssemblyCount'),
    sourceRows: count('assembly.pageEvidenceSourceRowCount'),
    slotLocalDocuments: count('assembly.slotLocalDistinctDocumentCount'),
    exactDuplicateGroups: count('assembly.exactDuplicateGroupCount'),
    exactDuplicateRowsRemoved: count('assembly.exactDuplicateRowsRemoved'),
    multiSourceDocuments: count('assembly.documentsWithMultipleSourceRows'),
    candidateObservations: count('scorePreparation.candidateObservationsAssembled'),
    r10Preparations: count('scorePreparation.r10ScorePreparationCount'),
    r10SourceRows: count('scorePreparation.r10SourceRowCoverageCount'),
    r10CandidateObservations: count('scorePreparation.r10CandidateObservationCoverageCount'),
  });
}

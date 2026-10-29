/**
 * PHASE 2B-2D — A3 R28: THE TWO AGGREGATE CROSS-CHECKS.
 *
 * Neither is authority for the delta graph. The authority is the fresh,
 * in-process R26 -> R27 mint; these only stop the slice when something moved
 * under it.
 *
 *   1. §44 R27 DELTA DRIFT. A real R28 run re-mints R26 and R27 in-process
 *      (their objects cannot be loaded from disk). The census canonical R27
 *      derives from that fresh run must equal the committed R27 census on
 *      every aggregate section, and must still state the R27 checkpoint
 *      pinned below. Provenance commits are excluded: they legitimately differ.
 *
 *   2. §30 HISTORICAL R22 BASELINE. The committed R22 public census is read as
 *      an immutable aggregate record only. It is NOT re-derived: that would
 *      need the old-five evidence read R26 avoids, the old-five reassembly R27
 *      avoids and the old-five re-measurement R28 exists to avoid. It says
 *      nothing about the delta.
 *
 * THIS MODULE IS PURE. Its inputs arrive already parsed; it reads no file.
 * Differences are reported as field PATHS, never values.
 */
import type { R27PublicIncrementalDocumentSourceCensus } from '../a3documentsV2/census.js';
import { refuseV2Graph } from './refusal.js';
import type { R22HistoricalGraphBaseline } from './types.js';

/** The aggregate sections of the R27 census compared for drift. */
export const R27_DRIFT_CROSS_CHECK_SECTIONS = Object.freeze([
  'deltaAssembly',
  'deltaExtractionSupport',
  'deltaScorePreparation',
  'coverage',
  'semantics',
  'access',
] as const);

/** The R27 checkpoint R28 was cut against (§44). */
export const R28_EXPECTED_R27_CHECKPOINT = Object.freeze({
  'deltaAssembly.deltaSlotAssemblyCount': 1,
  'deltaAssembly.deltaSourceRows': 35,
  'deltaAssembly.deltaSlotLocalDistinctDocuments': 35,
  'deltaAssembly.deltaExactDuplicateGroups': 0,
  'deltaAssembly.deltaExactDuplicateRowsRemoved': 0,
  'deltaAssembly.deltaMultiSourceDocuments': 0,
  'deltaExtractionSupport.deltaSupportedExtractionRows': 35,
  'deltaExtractionSupport.deltaUnsupportedExtractionRows': 0,
  'deltaExtractionSupport.deltaMixedVersionDocuments': 0,
  'deltaExtractionSupport.deltaTextDivergenceGroups': 0,
  'deltaScorePreparation.deltaR10Preparations': 35,
  'deltaScorePreparation.deltaR10SourceRowCoverage': 35,
  'deltaScorePreparation.deltaR10CandidateObservationCoverage': 70,
  'coverage.coverageSlots': 6,
  'coverage.coverageSlotLocalDocuments': 191,
  'access.legacyAuthorityEvidenceQueries': 0,
  'access.deltaAuthorityEvidenceQueries': 1,
});

/** The canonical historical R22 aggregate baseline, as its committed census states it. */
export const R28_EXPECTED_R22_HISTORICAL_BASELINE = Object.freeze({
  record: 'PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_CENSUS_V1',
  split: 'DEV_TRAIN',
  'measurement.slotGraphCount': 5,
  'measurement.exactDocumentCount': 156,
  'measurement.measurableDocumentCount': 155,
  'measurement.shortTextUnresolvedCount': 1,
  'measurement.comparedPairCount': 2338,
  'measurement.nearDuplicateEdgeCount': 41,
  'measurement.documentsInAtLeastOneNearDuplicateEdge': 19,
  'canonicalSd7.shingleSizeTokens': 5,
  'canonicalSd7.jaccardThresholdNumerator': 9,
  'canonicalSd7.jaccardThresholdDenominator': 10,
  'canonicalSd7.comparisonScope': 'WITHIN_ONE_ORGANISATION_ONLY',
  'semantics.crossOrganisationPairsMeasured': false,
  'semantics.survivorSelectionPerformed': false,
});

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function differingPaths(fresh: unknown, committed: unknown, path: string, into: string[]): void {
  if (isPlainObject(fresh) && isPlainObject(committed)) {
    const keys = new Set([...Object.keys(fresh), ...Object.keys(committed)]);
    for (const key of [...keys].sort()) {
      differingPaths(fresh[key], committed[key], `${path}.${key}`, into);
    }
    return;
  }
  if (canonical(fresh) !== canonical(committed)) into.push(path);
}

function at(record: unknown, path: string): unknown {
  let cursor: unknown = record;
  for (const key of path.split('.')) {
    if (!isPlainObject(cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

/**
 * Field paths whose fresh value differs from the committed R27 census, over
 * the aggregate sections only. Empty means no aggregate drift.
 */
export function r27DeltaDriftPaths(
  fresh: R27PublicIncrementalDocumentSourceCensus,
  committed: unknown,
): readonly string[] {
  const differing: string[] = [];
  const committedRecord = isPlainObject(committed) ? committed : {};
  const freshRecord = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown>;
  for (const section of R27_DRIFT_CROSS_CHECK_SECTIONS) {
    differingPaths(freshRecord[section], committedRecord[section], section, differing);
  }
  return Object.freeze(differing);
}

/** §44. No aggregate drift, and the fresh run still states the R27 checkpoint. */
export function requireNoR27DeltaDrift(
  fresh: R27PublicIncrementalDocumentSourceCensus,
  committed: unknown,
): void {
  const differing = r27DeltaDriftPaths(fresh, committed);
  if (differing.length > 0) {
    refuseV2Graph(
      'STOP_R28_CANONICAL_R27_DOCUMENT_DELTA_DRIFT_REQUIRES_REVIEW',
      `the fresh R27 census differs from the committed one at ${differing.join(', ')}`,
    );
  }
  for (const [path, expected] of Object.entries(R28_EXPECTED_R27_CHECKPOINT)) {
    if (at(fresh, path) !== expected) {
      refuseV2Graph(
        'STOP_R28_CANONICAL_R27_DOCUMENT_DELTA_DRIFT_REQUIRES_REVIEW',
        `${path} no longer equals the R27 checkpoint`,
      );
    }
  }
}

/** §30. The committed R22 census still states the canonical historical baseline. */
export function requireR22HistoricalBaseline(
  committedR22Census: unknown,
): R22HistoricalGraphBaseline {
  for (const [path, expected] of Object.entries(R28_EXPECTED_R22_HISTORICAL_BASELINE)) {
    if (at(committedR22Census, path) !== expected) {
      refuseV2Graph(
        'STOP_R28_HISTORICAL_R22_BASELINE_DRIFT_REQUIRES_REVIEW',
        `the committed R22 historical baseline ${path} differs`,
      );
    }
  }
  const count = (path: string): number => at(committedR22Census, path) as number;
  return Object.freeze({
    slotGraphs: count('measurement.slotGraphCount'),
    documents: count('measurement.exactDocumentCount'),
    measurableDocuments: count('measurement.measurableDocumentCount'),
    shortTextUnresolved: count('measurement.shortTextUnresolvedCount'),
    comparedPairs: count('measurement.comparedPairCount'),
    nearDuplicateEdges: count('measurement.nearDuplicateEdgeCount'),
    documentsInAtLeastOneEdge: count('measurement.documentsInAtLeastOneNearDuplicateEdge'),
  });
}

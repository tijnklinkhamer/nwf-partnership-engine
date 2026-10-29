/**
 * PHASE 2B-2D — A3 R29: THE TWO AGGREGATE CROSS-CHECKS.
 *
 * Neither is authority for the delta preparation. The authority is the
 * fresh, in-process R26 -> R27 -> R28 mint; these only stop the slice when
 * something moved under it.
 *
 *   1. §55 R28 GRAPH DELTA DRIFT. A real R29 run re-mints R26, R27 and R28
 *      in-process (their objects cannot be loaded from disk). The census
 *      canonical R28 derives from that fresh run must equal the committed R28
 *      census on every aggregate section, and must still state the R28
 *      checkpoint pinned below. Provenance commits are excluded: they
 *      legitimately differ.
 *
 *   2. §38 HISTORICAL R23 BASELINE. The committed R23 public census is read
 *      as an immutable aggregate record only. It is NOT re-derived: that would
 *      need the old-five evidence read R26 avoids, the old-five reassembly R27
 *      avoids, the old-five graph re-measurement R28 avoids and the old-five
 *      sample re-preparation R29 exists to avoid. It says nothing about the
 *      delta.
 *
 * THIS MODULE IS PURE. Its inputs arrive already parsed; it reads no file.
 * Differences are reported as field PATHS, never values.
 */
import type { R28PublicIncrementalSd7GraphCensus } from '../a3graphsV2/census.js';
import { refuseV2Sample } from './refusal.js';
import type { R23HistoricalSampleBaseline } from './types.js';

/** The aggregate sections of the R28 census compared for drift. */
export const R28_DRIFT_CROSS_CHECK_SECTIONS = Object.freeze([
  'deltaGraph',
  'canonicalSd7',
  'coverage',
  'a2AggregateConsistency',
  'semantics',
  'access',
] as const);

/** The R28 checkpoint R29 was cut against (§55). */
export const R29_EXPECTED_R28_CHECKPOINT = Object.freeze({
  'deltaGraph.deltaGraphSlots': 1,
  'deltaGraph.deltaDocuments': 35,
  'deltaGraph.deltaMeasurableDocuments': 35,
  'deltaGraph.deltaShortTextUnresolved': 0,
  'deltaGraph.deltaComparedPairs': 595,
  'deltaGraph.deltaNearDuplicateEdges': 1,
  'deltaGraph.deltaDocumentsInAtLeastOneNearDuplicateEdge': 2,
  'coverage.historicalCanonicalR22GraphSlots': 5,
  'coverage.coverageGraphSlots': 6,
  'coverage.coverageDocuments': 191,
  'coverage.coverageMeasurableDocuments': 190,
  'coverage.coverageShortTextUnresolved': 1,
  'coverage.coverageComparedPairs': 2933,
  'coverage.coverageNearDuplicateEdges': 42,
  'coverage.coverageDocumentsInAtLeastOneNearDuplicateEdge': 21,
  'access.r28SqlStatements': 0,
  'access.legacyAuthorityEvidenceQueries': 0,
  'access.deltaAuthorityEvidenceQueries': 1,
});

/** The canonical historical R23 aggregate baseline, as its committed census states it. */
export const R29_EXPECTED_R23_HISTORICAL_BASELINE = Object.freeze({
  record: 'PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1',
  split: 'DEV_TRAIN',
  'preparation.r22SlotGraphCount': 5,
  'preparation.slotPreparationCount': 5,
  'preparation.sharedExactDocumentPopulationCount': 156,
  'setP.preSd7RankEntryCount': 156,
  'setP.measurableDocumentCount': 155,
  'setP.measurableSurvivorCount': 142,
  'setP.measurableExclusionCount': 13,
  'setP.unresolvedShortTextOccurrenceCount': 1,
  'setP.initialCapExactSlotCount': 5,
  'setP.initialCapBlockedSlotCount': 0,
  'setP.exactCapDocumentCountAcrossExactSlots': 40,
  'setR.preSd7RankEntryCount': 156,
  'setR.measurableDocumentCount': 155,
  'setR.measurableSurvivorCount': 142,
  'setR.measurableExclusionCount': 13,
  'setR.unresolvedShortTextOccurrenceCount': 1,
  'setR.initialCapExactSlotCount': 5,
  'setR.initialCapBlockedSlotCount': 0,
  'setR.exactCapDocumentCountAcrossExactSlots': 20,
  'setR.fullRankExactSlotCount': 4,
  'setR.fullRankShortTextBlockedSlotCount': 1,
  'sampleSpecificDivergence.measurableDocumentCount': 155,
  'sampleSpecificDivergence.survivingBothSamples': 137,
  'sampleSpecificDivergence.survivingSetPOnly': 5,
  'sampleSpecificDivergence.survivingSetROnly': 5,
  'sampleSpecificDivergence.excludedInBothSamples': 8,
  'canonicalConstants.setPMaxPagesPerOrganisation': 8,
  'canonicalConstants.setRMaxPagesPerOrganisation': 4,
  'canonicalConstants.k3SurvivorProcedure': 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK',
  'canonicalConstants.k3SurvivorScope': 'SAMPLE_SPECIFIC',
  'canonicalConstants.k3GraphScope': 'ONE_CANONICAL_GRAPH_PER_ORGANISATION',
  'semantics.survivorWalkReimplemented': false,
  'semantics.shortTextResolved': false,
  'semantics.sd9Evaluated': false,
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
 * Field paths whose fresh value differs from the committed R28 census, over
 * the aggregate sections only. Empty means no aggregate drift.
 */
export function r28DeltaDriftPaths(
  fresh: R28PublicIncrementalSd7GraphCensus,
  committed: unknown,
): readonly string[] {
  const differing: string[] = [];
  const committedRecord = isPlainObject(committed) ? committed : {};
  const freshRecord = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown>;
  for (const section of R28_DRIFT_CROSS_CHECK_SECTIONS) {
    differingPaths(freshRecord[section], committedRecord[section], section, differing);
  }
  return Object.freeze(differing);
}

/** §55. No aggregate drift, and the fresh run still states the R28 checkpoint. */
export function requireNoR28GraphDeltaDrift(
  fresh: R28PublicIncrementalSd7GraphCensus,
  committed: unknown,
): void {
  const differing = r28DeltaDriftPaths(fresh, committed);
  if (differing.length > 0) {
    refuseV2Sample(
      'STOP_R29_CANONICAL_R28_GRAPH_DELTA_DRIFT_REQUIRES_REVIEW',
      `the fresh R28 census differs from the committed one at ${differing.join(', ')}`,
    );
  }
  for (const [path, expected] of Object.entries(R29_EXPECTED_R28_CHECKPOINT)) {
    if (at(fresh, path) !== expected) {
      refuseV2Sample(
        'STOP_R29_CANONICAL_R28_GRAPH_DELTA_DRIFT_REQUIRES_REVIEW',
        `${path} no longer equals the R28 checkpoint`,
      );
    }
  }
}

/** §38. The committed R23 census still states the canonical historical baseline. */
export function requireR23HistoricalBaseline(
  committedR23Census: unknown,
): R23HistoricalSampleBaseline {
  for (const [path, expected] of Object.entries(R29_EXPECTED_R23_HISTORICAL_BASELINE)) {
    if (at(committedR23Census, path) !== expected) {
      refuseV2Sample(
        'R29_R23_HISTORICAL_BASELINE_INPUT_INVALID',
        `the committed R23 historical baseline ${path} differs`,
      );
    }
  }
  const count = (path: string): number => at(committedR23Census, path) as number;
  const sample = (name: 'setP' | 'setR') => ({
    preSd7RankEntryCount: count(`${name}.preSd7RankEntryCount`),
    measurableDocumentCount: count(`${name}.measurableDocumentCount`),
    measurableSurvivorCount: count(`${name}.measurableSurvivorCount`),
    measurableExclusionCount: count(`${name}.measurableExclusionCount`),
    unresolvedShortTextOccurrenceCount: count(`${name}.unresolvedShortTextOccurrenceCount`),
    initialCapExactSlotCount: count(`${name}.initialCapExactSlotCount`),
    initialCapBlockedSlotCount: count(`${name}.initialCapBlockedSlotCount`),
    exactCapDocumentCountAcrossExactSlots: count(`${name}.exactCapDocumentCountAcrossExactSlots`),
  });
  return Object.freeze({
    slotPreparations: count('preparation.slotPreparationCount'),
    setP: Object.freeze(sample('setP')),
    setR: Object.freeze({
      ...sample('setR'),
      fullRankExactSlotCount: count('setR.fullRankExactSlotCount'),
      fullRankShortTextBlockedSlotCount: count('setR.fullRankShortTextBlockedSlotCount'),
    }),
    divergence: Object.freeze({
      measurableDocumentCount: count('sampleSpecificDivergence.measurableDocumentCount'),
      survivingBothSamples: count('sampleSpecificDivergence.survivingBothSamples'),
      survivingSetPOnly: count('sampleSpecificDivergence.survivingSetPOnly'),
      survivingSetROnly: count('sampleSpecificDivergence.survivingSetROnly'),
      excludedInBothSamples: count('sampleSpecificDivergence.excludedInBothSamples'),
    }),
  });
}

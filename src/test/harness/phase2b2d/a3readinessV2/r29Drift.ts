/**
 * PHASE 2B-2D — A3 R30: THE TWO AGGREGATE CROSS-CHECKS.
 *
 * Neither is authority for the delta readiness. The authority is the fresh,
 * in-process R26 -> R27 -> R28 -> R29 mint; these only stop the slice when
 * something moved under it.
 *
 *   1. §52 R29 SAMPLE DELTA DRIFT. A real R30 run re-mints R26, R27, R28 and
 *      R29 in-process (their objects cannot be loaded from disk). The census
 *      canonical R29 derives from that fresh run must equal the committed R29
 *      census on every aggregate section, and must still state the R29
 *      checkpoint pinned below. Provenance commits are excluded: they
 *      legitimately differ.
 *
 *   2. §36 HISTORICAL R24 BASELINE. The committed R24 public census is read
 *      as an immutable aggregate record only. It is NOT re-derived: that would
 *      need the old-five evidence read R26 avoids, the old-five reassembly R27
 *      avoids, the old-five graph re-measurement R28 avoids, the old-five
 *      sample re-preparation R29 avoids and the old-five readiness
 *      re-derivation R30 exists to avoid. It says nothing about the delta.
 *
 * THIS MODULE IS PURE. Its inputs arrive already parsed; it reads no file.
 * Differences are reported as field PATHS, never values.
 */
import type { R29PublicIncrementalSampleSurvivorCensus } from '../a3samplesV2/census.js';
import { refuseV2Readiness } from './refusal.js';
import type { R24HistoricalReadinessBaseline, ReadinessSampleAggregate } from './types.js';

/** The aggregate sections of the R29 census compared for drift. */
export const R29_DRIFT_CROSS_CHECK_SECTIONS = Object.freeze([
  'delta',
  'canonicalConstants',
  'coverage',
  'semantics',
  'access',
] as const);

/** The R29 checkpoint R30 was cut against (§52). */
export const R30_EXPECTED_R29_CHECKPOINT = Object.freeze({
  'delta.deltaSlotPreparations': 1,
  'delta.setP.preSd7RankEntryCount': 35,
  'delta.setP.measurableDocumentCount': 35,
  'delta.setP.measurableSurvivorCount': 34,
  'delta.setP.measurableExclusionCount': 1,
  'delta.setP.unresolvedShortTextOccurrenceCount': 0,
  'delta.setP.initialCapExactSlotCount': 1,
  'delta.setP.exactCapDocumentCountAcrossExactSlots': 8,
  'delta.setR.preSd7RankEntryCount': 35,
  'delta.setR.measurableDocumentCount': 35,
  'delta.setR.measurableSurvivorCount': 34,
  'delta.setR.measurableExclusionCount': 1,
  'delta.setR.unresolvedShortTextOccurrenceCount': 0,
  'delta.setR.initialCapExactSlotCount': 1,
  'delta.setR.exactCapDocumentCountAcrossExactSlots': 4,
  'delta.setR.fullRankExactSlotCount': 1,
  'delta.divergence.survivingBothSamples': 34,
  'delta.divergence.survivingSetPOnly': 0,
  'delta.divergence.survivingSetROnly': 0,
  'delta.divergence.excludedInBothSamples': 1,
  'delta.singleEdgeSlotsSameExcludedEndpoint': 1,
  'coverage.coverageSlotPreparations': 6,
  'coverage.coverage.setP.preSd7RankEntryCount': 191,
  'coverage.coverage.setP.measurableDocumentCount': 190,
  'coverage.coverage.setP.measurableSurvivorCount': 176,
  'coverage.coverage.setP.measurableExclusionCount': 14,
  'coverage.coverage.setP.unresolvedShortTextOccurrenceCount': 1,
  'coverage.coverage.setP.exactCapDocumentCountAcrossExactSlots': 48,
  'coverage.coverage.setR.preSd7RankEntryCount': 191,
  'coverage.coverage.setR.measurableDocumentCount': 190,
  'coverage.coverage.setR.measurableSurvivorCount': 176,
  'coverage.coverage.setR.measurableExclusionCount': 14,
  'coverage.coverage.setR.unresolvedShortTextOccurrenceCount': 1,
  'coverage.coverage.setR.exactCapDocumentCountAcrossExactSlots': 24,
  'access.r29SqlStatements': 0,
  'access.legacyAuthorityEvidenceQueries': 0,
  'access.oldFiveSamplePreparation': 0,
});

const HISTORICAL_SAMPLE_AGGREGATE_KEYS = [
  'reachableMembershipExactSlotCount',
  'reachableMembershipBlockedSlotCount',
  'reachableMembershipDocumentCountAcrossExactSlots',
  'fullRankExactSlotCount',
  'fullRankShortTextBlockedSlotCount',
  'fullRankBlockedWhileReachableMembershipExactSlotCount',
  'measurableSurvivorCount',
  'unresolvedShortTextOccurrenceCount',
  'sd9MinEnvelopeTotal',
  'sd9MaxEnvelopeTotal',
  'sd9MechanicalSuccessfulSlotCount',
  'sd9MechanicalUnsuccessfulSlotCount',
  'sd9MechanicalPendingSlotCount',
] as const satisfies readonly (keyof ReadinessSampleAggregate)[];

const HISTORICAL_SAMPLE_EXPECTED = Object.freeze({
  reachableMembershipExactSlotCount: 5,
  reachableMembershipBlockedSlotCount: 0,
  fullRankExactSlotCount: 4,
  fullRankShortTextBlockedSlotCount: 1,
  fullRankBlockedWhileReachableMembershipExactSlotCount: 1,
  measurableSurvivorCount: 142,
  unresolvedShortTextOccurrenceCount: 1,
  sd9MinEnvelopeTotal: 142,
  sd9MaxEnvelopeTotal: 143,
  sd9MechanicalSuccessfulSlotCount: 5,
  sd9MechanicalUnsuccessfulSlotCount: 0,
  sd9MechanicalPendingSlotCount: 0,
});

/** The canonical historical R24 aggregate baseline, as its committed census states it (§36). */
export const R30_EXPECTED_R24_HISTORICAL_BASELINE = Object.freeze({
  record: 'PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS_V1',
  split: 'DEV_TRAIN',
  'readiness.r23SlotPreparationCount': 5,
  'readiness.slotReadinessCount': 5,
  ...Object.fromEntries(
    Object.entries(HISTORICAL_SAMPLE_EXPECTED).map(([key, value]) => [`setP.${key}`, value]),
  ),
  'setP.reachableMembershipDocumentCountAcrossExactSlots': 40,
  ...Object.fromEntries(
    Object.entries(HISTORICAL_SAMPLE_EXPECTED).map(([key, value]) => [`setR.${key}`, value]),
  ),
  'setR.reachableMembershipDocumentCountAcrossExactSlots': 20,
  'crossSample.bothSamplesMechanicallySuccessfulSlotCount': 5,
  'crossSample.sd9StatusDisagreementSlotCount': 0,
  'canonicalConstants.setPMaxPagesPerOrganisation': 8,
  'canonicalConstants.setRMaxPagesPerOrganisation': 4,
  'canonicalConstants.sd9MinPagesPerOrganisation': 4,
  'canonicalConstants.reachableMembershipDecisionToken':
    'SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1',
  'canonicalConstants.sd9Semantics':
    'A3_MECHANICAL_SD9_OF_CANONICAL_SURVIVOR_ENVELOPE_ONLY_NOT_A2_ACQUISITION_STATUS',
  'semantics.setRReadinessRederived': false,
  'semantics.capSliced': false,
  'semantics.sd9MechanicalOnly': true,
  'semantics.completeCorpusPreflightRun': false,
}) as Readonly<Record<string, string | number | boolean>>;

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
 * Field paths whose fresh value differs from the committed R29 census, over
 * the aggregate sections only. Empty means no aggregate drift.
 */
export function r29DeltaDriftPaths(
  fresh: R29PublicIncrementalSampleSurvivorCensus,
  committed: unknown,
): readonly string[] {
  const differing: string[] = [];
  const committedRecord = isPlainObject(committed) ? committed : {};
  const freshRecord = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown>;
  for (const section of R29_DRIFT_CROSS_CHECK_SECTIONS) {
    differingPaths(freshRecord[section], committedRecord[section], section, differing);
  }
  return Object.freeze(differing);
}

/** §52. No aggregate drift, and the fresh run still states the R29 checkpoint. */
export function requireNoR29SampleDeltaDrift(
  fresh: R29PublicIncrementalSampleSurvivorCensus,
  committed: unknown,
): void {
  const differing = r29DeltaDriftPaths(fresh, committed);
  if (differing.length > 0) {
    refuseV2Readiness(
      'STOP_R30_CANONICAL_R29_SAMPLE_DELTA_DRIFT_REQUIRES_REVIEW',
      `the fresh R29 census differs from the committed one at ${differing.join(', ')}`,
    );
  }
  for (const [path, expected] of Object.entries(R30_EXPECTED_R29_CHECKPOINT)) {
    if (at(fresh, path) !== expected) {
      refuseV2Readiness(
        'STOP_R30_CANONICAL_R29_SAMPLE_DELTA_DRIFT_REQUIRES_REVIEW',
        `${path} no longer equals the R29 checkpoint`,
      );
    }
  }
}

/** §36. The committed R24 census still states the canonical historical baseline. */
export function requireR24HistoricalBaseline(
  committedR24Census: unknown,
): R24HistoricalReadinessBaseline {
  for (const [path, expected] of Object.entries(R30_EXPECTED_R24_HISTORICAL_BASELINE)) {
    if (at(committedR24Census, path) !== expected) {
      refuseV2Readiness(
        'R30_R24_HISTORICAL_BASELINE_INPUT_INVALID',
        `the committed R24 historical baseline ${path} differs`,
      );
    }
  }
  const count = (path: string): number => at(committedR24Census, path) as number;
  const sample = (name: 'setP' | 'setR'): ReadinessSampleAggregate =>
    Object.freeze(
      Object.fromEntries(
        HISTORICAL_SAMPLE_AGGREGATE_KEYS.map((key) => [key, count(`${name}.${key}`)]),
      ) as unknown as ReadinessSampleAggregate,
    );
  return Object.freeze({
    slotReadinessCount: count('readiness.slotReadinessCount'),
    setP: sample('setP'),
    setR: sample('setR'),
    crossSample: Object.freeze({
      bothSamplesMechanicallySuccessfulSlotCount: count(
        'crossSample.bothSamplesMechanicallySuccessfulSlotCount',
      ),
      sd9StatusDisagreementSlotCount: count('crossSample.sd9StatusDisagreementSlotCount'),
    }),
  });
}

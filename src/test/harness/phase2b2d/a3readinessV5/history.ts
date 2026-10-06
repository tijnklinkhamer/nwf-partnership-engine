/**
 * PHASE 2B-2D — A3 R43: THE COMMITTED R37 + R42 HISTORICAL READINESS BASELINE.
 *
 * The thirteen V4 -> V5 UNCHANGED DEV_TRAIN authorities already have canonical
 * readiness coverage (R24 5 + R30 1 + R37 7, as R37's committed census states
 * it). R43 re-derives none of them. Before any R24 call it proves, from the
 * committed aggregate records read as HISTORY ONLY:
 *
 *   R37  6 historical + 7 new = 13 readiness slots, and every SET_P, SET_R and
 *        cross-sample aggregate closes historical + new = coverage, at the
 *        exact canonical thirteen-slot values; reachable exact + blocked =
 *        slots, full-rank exact + blocked = slots, the three mechanical SD9
 *        statuses partition the slots, and the SD9 envelope totals are
 *        [survivors, survivors + unresolved]; no historical readiness
 *        recomputed or reminted, no short text resolved, no direct SD9 call,
 *        no preflight;
 *   R42  13 historical sample slots, readiness coverage still 13;
 *
 * and closes them against the FRESH R42 batch:
 *
 *   R37 readiness slots = R42's fresh historical sample coverage = R42's
 *   fresh readiness coverage before R43; and R37's historical reachable
 *   membership, survivors, short text and SET_R full-rank readiness describe
 *   R42's fresh historical caps, survivors, short text and SET_R readiness.
 *
 * No historical R37 readiness object is reconstructed. The proof is branded
 * in this process and bound by identity to the exact R42 batch it was closed
 * against; a copy is not one.
 *
 * THIS MODULE IS PURE. Its inputs arrive already parsed; it reads no file.
 */
import { isA3DevTrainSampleSurvivorDeltaBatchV5 } from '../a3samplesV5/devTrain.js';
import type { A3DevTrainSampleSurvivorDeltaBatchV5 } from '../a3samplesV5/types.js';
import { r42ReproductionProofForBatch, type R42ReproducedSampleCounts } from './r42Drift.js';
import { refuseV5Readiness } from './refusal.js';
import {
  R43_READINESS_SPLIT,
  type CrossSampleSd9AggregateV5,
  type HistoricalV5ReadinessCoverageProof,
  type ReadinessSampleAggregateV5,
} from './types.js';

export const R37_CENSUS_RECORD =
  'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1';
export const R42_CENSUS_RECORD =
  'PHASE_2B_2D_A3_R42_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1';

/** The canonical thirteen-slot R37 readiness history, as its committed census states it. */
export const R43_EXPECTED_R37_HISTORY: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], R37_CENSUS_RECORD],
    [['recordKind'], 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS'],
    [['split'], 'DEV_TRAIN'],
    [['coverage', 'historicalCanonicalReadinessSlots'], 6],
    [['coverage', 'newR37ReadinessSlots'], 7],
    [['coverage', 'coverageReadinessSlots'], 13],
    [['coverage', 'coverage', 'setP', 'reachableMembershipExactSlotCount'], 11],
    [['coverage', 'coverage', 'setP', 'reachableMembershipBlockedSlotCount'], 2],
    [['coverage', 'coverage', 'setP', 'reachableMembershipDocumentCountAcrossExactSlots'], 88],
    [['coverage', 'coverage', 'setP', 'fullRankExactSlotCount'], 9],
    [['coverage', 'coverage', 'setP', 'fullRankShortTextBlockedSlotCount'], 4],
    [['coverage', 'coverage', 'setP', 'fullRankBlockedWhileReachableMembershipExactSlotCount'], 2],
    [['coverage', 'coverage', 'setP', 'measurableSurvivorCount'], 354],
    [['coverage', 'coverage', 'setP', 'unresolvedShortTextOccurrenceCount'], 8],
    [['coverage', 'coverage', 'setP', 'sd9MinEnvelopeTotal'], 354],
    [['coverage', 'coverage', 'setP', 'sd9MaxEnvelopeTotal'], 362],
    [['coverage', 'coverage', 'setP', 'sd9MechanicalSuccessfulSlotCount'], 13],
    [['coverage', 'coverage', 'setP', 'sd9MechanicalUnsuccessfulSlotCount'], 0],
    [['coverage', 'coverage', 'setP', 'sd9MechanicalPendingSlotCount'], 0],
    [['coverage', 'coverage', 'setR', 'reachableMembershipExactSlotCount'], 11],
    [['coverage', 'coverage', 'setR', 'reachableMembershipBlockedSlotCount'], 2],
    [['coverage', 'coverage', 'setR', 'reachableMembershipDocumentCountAcrossExactSlots'], 44],
    [['coverage', 'coverage', 'setR', 'fullRankExactSlotCount'], 9],
    [['coverage', 'coverage', 'setR', 'fullRankShortTextBlockedSlotCount'], 4],
    [['coverage', 'coverage', 'setR', 'fullRankBlockedWhileReachableMembershipExactSlotCount'], 2],
    [['coverage', 'coverage', 'setR', 'measurableSurvivorCount'], 354],
    [['coverage', 'coverage', 'setR', 'unresolvedShortTextOccurrenceCount'], 8],
    [['coverage', 'coverage', 'setR', 'sd9MinEnvelopeTotal'], 354],
    [['coverage', 'coverage', 'setR', 'sd9MaxEnvelopeTotal'], 362],
    [['coverage', 'coverage', 'setR', 'sd9MechanicalSuccessfulSlotCount'], 13],
    [['coverage', 'coverage', 'setR', 'sd9MechanicalUnsuccessfulSlotCount'], 0],
    [['coverage', 'coverage', 'setR', 'sd9MechanicalPendingSlotCount'], 0],
    [['coverage', 'coverage', 'crossSample', 'bothSamplesMechanicallySuccessfulSlotCount'], 13],
    [['coverage', 'coverage', 'crossSample', 'sd9StatusDisagreementSlotCount'], 0],
    [['coverage', 'coverageIsSumOfPerSlotCounts'], true],
    [['coverage', 'thirteenSlotReadinessBatchMinted'], false],
    [['semantics', 'historicalReadinessObjectsReminted'], false],
    [['semantics', 'deltaOnlyReadinessDerivation'], true],
    [['semantics', 'canonicalR24PureHelperUsed'], true],
    [['semantics', 'setRReadinessRederived'], false],
    [['semantics', 'capSliced'], false],
    [['semantics', 'blockedCapMembershipInvented'], false],
    [['semantics', 'shortTextResolved'], false],
    [['semantics', 'directSd9Call'], false],
    [['semantics', 'completeCorpusPreflightRun'], false],
    [['canonicalConstants', 'generation'], 'METHODOLOGY_V2_GEN1'],
  ] as const);

/** The committed R42 historical coverage the readiness history must equal. */
export const R43_EXPECTED_R42_HISTORY: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], R42_CENSUS_RECORD],
    [['split'], 'DEV_TRAIN'],
    [['coverage', 'historicalCanonicalSlotPreparations'], 13],
    [['coverage', 'readinessCoverageAfterR42'], 13],
    [['historicalPreparationCoverage', 'r37ReadinessSlots'], 13],
    [['historicalPreparationCoverage', 'r41HistoricalReadinessCoverage'], 13],
    [['historicalPreparationCoverage', 'historicalReadinessObjectsReconstructed'], false],
    [['semantics', 'reachableMembershipBound'], false],
    [['semantics', 'sd9Evaluated'], false],
  ] as const);

const READINESS_FIELDS = [
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
] as const;
const CROSS_SAMPLE_FIELDS = [
  'bothSamplesMechanicallySuccessfulSlotCount',
  'sd9StatusDisagreementSlotCount',
] as const;

const HISTORY_PROOF_BY_BATCH = new WeakMap<object, HistoricalV5ReadinessCoverageProof>();

function historyDrift(message: string): never {
  refuseV5Readiness('STOP_R43_HISTORICAL_R37_READINESS_BASELINE_DRIFT_REQUIRES_REVIEW', message);
}

function at(record: unknown, path: readonly string[]): unknown {
  let value: unknown = record;
  for (const key of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function count(record: unknown, ...path: readonly string[]): number {
  const value = at(record, path);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    historyDrift(`${path.join('.')} is not a non-negative integer count in the committed record`);
  }
  return value;
}

function describesSampleHistory(
  readiness: ReadinessSampleAggregateV5,
  sample: R42ReproducedSampleCounts,
): boolean {
  return (
    readiness.reachableMembershipExactSlotCount === sample.initialCapExactSlotCount &&
    readiness.reachableMembershipBlockedSlotCount === sample.initialCapBlockedSlotCount &&
    readiness.reachableMembershipDocumentCountAcrossExactSlots ===
      sample.exactCapDocumentCountAcrossExactSlots &&
    readiness.measurableSurvivorCount === sample.measurableSurvivorCount &&
    readiness.unresolvedShortTextOccurrenceCount === sample.unresolvedShortTextOccurrenceCount
  );
}

/**
 * §12 / §13 / §59. Proves the committed R37 and R42 records still state the
 * canonical thirteen-slot readiness history, and that it closes against the
 * fresh R42 batch. Mints the proof only after every equality closes.
 */
export function requireHistoricalV5ReadinessCoverage(
  records: { readonly r37: unknown; readonly r42: unknown },
  sampleDeltaBatch: A3DevTrainSampleSurvivorDeltaBatchV5,
): HistoricalV5ReadinessCoverageProof {
  const batch: unknown = sampleDeltaBatch;
  if (!isA3DevTrainSampleSurvivorDeltaBatchV5(batch)) {
    refuseV5Readiness(
      'R43_SAMPLE_DELTA_NOT_MINTED_BY_R42',
      'the historical readiness baseline must be closed against a batch minted by R42',
    );
  }
  const reproduction = r42ReproductionProofForBatch(batch);
  if (reproduction === undefined) {
    refuseV5Readiness(
      'R43_R42_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the historical readiness baseline is closed only against a reproduced R42 batch',
    );
  }
  const { r37, r42 } = records;
  for (const [path, expected] of R43_EXPECTED_R37_HISTORY) {
    if (at(r37, path) !== expected) historyDrift(`R37 ${path.join('.')} differs`);
  }
  for (const [path, expected] of R43_EXPECTED_R42_HISTORY) {
    if (at(r42, path) !== expected) historyDrift(`R42 ${path.join('.')} differs`);
  }

  // R37: historical + new = coverage on every aggregate.
  const groups: readonly (readonly [string, readonly string[]])[] = [
    ['setP', READINESS_FIELDS],
    ['setR', READINESS_FIELDS],
    ['crossSample', CROSS_SAMPLE_FIELDS],
  ];
  for (const [section, fields] of groups) {
    for (const field of fields) {
      if (
        count(r37, 'coverage', 'historical', section, field) +
          count(r37, 'coverage', 'new', section, field) !==
        count(r37, 'coverage', 'coverage', section, field)
      ) {
        historyDrift(`R37 ${section}.${field} historical + new arithmetic does not close`);
      }
    }
  }
  const slots = count(r37, 'coverage', 'coverageReadinessSlots');
  if (
    count(r37, 'coverage', 'historicalCanonicalReadinessSlots') +
      count(r37, 'coverage', 'newR37ReadinessSlots') !==
    slots
  ) {
    historyDrift('R37 readiness-slot arithmetic does not close');
  }

  const sample = (section: string): ReadinessSampleAggregateV5 =>
    Object.freeze(
      Object.fromEntries(
        READINESS_FIELDS.map((field) => [
          field,
          count(r37, 'coverage', 'coverage', section, field),
        ]),
      ) as unknown as ReadinessSampleAggregateV5,
    );
  const setP = sample('setP');
  const setR = sample('setR');
  const crossSample: CrossSampleSd9AggregateV5 = Object.freeze({
    bothSamplesMechanicallySuccessfulSlotCount: count(
      r37,
      'coverage',
      'coverage',
      'crossSample',
      'bothSamplesMechanicallySuccessfulSlotCount',
    ),
    sd9StatusDisagreementSlotCount: count(
      r37,
      'coverage',
      'coverage',
      'crossSample',
      'sd9StatusDisagreementSlotCount',
    ),
  });
  for (const counts of [setP, setR]) {
    if (
      counts.reachableMembershipExactSlotCount + counts.reachableMembershipBlockedSlotCount !==
        slots ||
      counts.fullRankExactSlotCount + counts.fullRankShortTextBlockedSlotCount !== slots ||
      counts.fullRankBlockedWhileReachableMembershipExactSlotCount >
        counts.fullRankShortTextBlockedSlotCount ||
      counts.sd9MechanicalSuccessfulSlotCount +
        counts.sd9MechanicalUnsuccessfulSlotCount +
        counts.sd9MechanicalPendingSlotCount !==
        slots ||
      counts.sd9MinEnvelopeTotal !== counts.measurableSurvivorCount ||
      counts.sd9MaxEnvelopeTotal !==
        counts.measurableSurvivorCount + counts.unresolvedShortTextOccurrenceCount
    ) {
      historyDrift('the thirteen-slot readiness partition does not close');
    }
  }
  if (
    crossSample.bothSamplesMechanicallySuccessfulSlotCount >
      Math.min(setP.sd9MechanicalSuccessfulSlotCount, setR.sd9MechanicalSuccessfulSlotCount) ||
    crossSample.sd9StatusDisagreementSlotCount > slots
  ) {
    historyDrift('the thirteen-slot cross-sample SD9 counts do not close');
  }

  // R37 = committed R42 = fresh R42.
  const r42Sample = count(r42, 'coverage', 'historicalCanonicalSlotPreparations');
  const r42Readiness = count(r42, 'coverage', 'readinessCoverageAfterR42');
  if (slots !== r42Sample || slots !== r42Readiness) {
    historyDrift('R37 readiness coverage and committed R42 history disagree');
  }
  if (
    sampleDeltaBatch.split !== R43_READINESS_SPLIT ||
    reproduction.historicalSlotPreparations !== slots ||
    reproduction.readinessCoverageBeforeR43 !== slots ||
    !describesSampleHistory(setP, reproduction.historicalSetP) ||
    !describesSampleHistory(setR, reproduction.historicalSetR) ||
    setR.fullRankExactSlotCount !== reproduction.historicalSetRFullRankExactSlotCount ||
    setR.fullRankShortTextBlockedSlotCount !==
      reproduction.historicalSetRFullRankShortTextBlockedSlotCount
  ) {
    historyDrift('the committed readiness history does not close against the fresh R42 batch');
  }

  const proof: HistoricalV5ReadinessCoverageProof = Object.freeze({
    kind: 'HISTORICAL_V5_READINESS_COVERAGE_PROOF' as const,
    r37HistoricalReadinessSlotsBeforeR37: count(
      r37,
      'coverage',
      'historicalCanonicalReadinessSlots',
    ),
    r37NewReadinessSlots: count(r37, 'coverage', 'newR37ReadinessSlots'),
    slotReadinessCount: slots,
    r42HistoricalSampleCoverage: reproduction.historicalSlotPreparations,
    r42HistoricalReadinessCoverage: reproduction.readinessCoverageBeforeR43,
    setP,
    setR,
    crossSample,
  });
  HISTORY_PROOF_BY_BATCH.set(batch, proof);
  return proof;
}

/** The historical readiness proof closed against exactly this R42 batch, or `undefined`. */
export function historicalReadinessCoverageProofForBatch(
  batch: unknown,
): HistoricalV5ReadinessCoverageProof | undefined {
  if (typeof batch !== 'object' || batch === null) return undefined;
  return HISTORY_PROOF_BY_BATCH.get(batch);
}

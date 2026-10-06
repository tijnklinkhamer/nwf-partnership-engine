/**
 * PHASE 2B-2D — A3 R42: THE COMMITTED R36 + R37 + R41 HISTORICAL SAMPLE BASELINE.
 *
 * The thirteen V4 -> V5 UNCHANGED DEV_TRAIN authorities already have canonical
 * sample-preparation coverage (R23 5 + R29 1 + R36 7, as R36's committed
 * census states) and canonical readiness coverage (R37's thirteen). R42
 * re-prepares none of them. Before any preparation it proves, from the
 * committed aggregate records read as HISTORY ONLY:
 *
 *   R36  6 historical + 7 new = 13 slot preparations, and every SET_P, SET_R
 *        and divergence aggregate closes historical + new = coverage, at the
 *        exact canonical thirteen-slot values; survivors + exclusions =
 *        measurable, measurable + short = ranked, exact + blocked caps =
 *        slots, full-rank exact + blocked = slots, and the divergence
 *        partition closes; no historical preparation recomputed or reminted,
 *        no short text resolved, no reachable membership, no SD9;
 *   R37  6 historical + 7 new = 13 readiness slots;
 *   R41  13 historical graph slots over 388 / 380 / 8 documents, and sample
 *        and readiness coverage both still 13;
 *
 * and closes them against the FRESH R41 batch:
 *
 *   R36 sample slots = R37 readiness slots = R41 historical sample coverage =
 *   the fresh R41 reproduction's sample and readiness coverage = R41's own
 *   fresh historical graph proof; and R36's ranked / measurable / short
 *   population = the fresh R41 historical graph documents.
 *
 * No historical R36 preparation or R37 readiness object is reconstructed. The
 * proof is branded in this process and bound by identity to the exact R41
 * batch it was closed against; a copy is not one.
 *
 * THIS MODULE IS PURE. Its inputs arrive already parsed; it reads no file.
 */
import {
  documentSourceDeltaBatchForGraphDeltaBatchV5,
  isA3DevTrainSd7GraphDeltaBatchV5,
} from '../a3graphsV5/devTrain.js';
import { historicalGraphCoverageProofForBatch } from '../a3graphsV5/history.js';
import type { A3DevTrainSd7GraphDeltaBatchV5 } from '../a3graphsV5/types.js';
import { r41ReproductionProofForBatch } from './r41Drift.js';
import { refuseV5Sample } from './refusal.js';
import {
  R42_SAMPLE_SPLIT,
  type DivergenceAggregateCountsV5,
  type HistoricalV5SamplePreparationCoverageProof,
  type SampleAggregateCountsV5,
  type SetRAggregateCountsV5,
} from './types.js';

export const R36_CENSUS_RECORD =
  'PHASE_2B_2D_A3_R36_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1';
export const R37_CENSUS_RECORD =
  'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1';
export const R41_CENSUS_RECORD = 'PHASE_2B_2D_A3_R41_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1';

/** The canonical thirteen-slot R36 sample history, as its committed census states it. */
export const R42_EXPECTED_R36_HISTORY: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], R36_CENSUS_RECORD],
    [['recordKind'], 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS'],
    [['split'], 'DEV_TRAIN'],
    [['coverage', 'historicalCanonicalSlotPreparations'], 6],
    [['coverage', 'newR36SlotPreparations'], 7],
    [['coverage', 'coverageSlotPreparations'], 13],
    [['coverage', 'coverage', 'setP', 'preSd7RankEntryCount'], 388],
    [['coverage', 'coverage', 'setP', 'measurableDocumentCount'], 380],
    [['coverage', 'coverage', 'setP', 'measurableSurvivorCount'], 354],
    [['coverage', 'coverage', 'setP', 'measurableExclusionCount'], 26],
    [['coverage', 'coverage', 'setP', 'unresolvedShortTextOccurrenceCount'], 8],
    [['coverage', 'coverage', 'setP', 'initialCapExactSlotCount'], 11],
    [['coverage', 'coverage', 'setP', 'initialCapBlockedSlotCount'], 2],
    [['coverage', 'coverage', 'setP', 'exactCapDocumentCountAcrossExactSlots'], 88],
    [['coverage', 'coverage', 'setR', 'preSd7RankEntryCount'], 388],
    [['coverage', 'coverage', 'setR', 'measurableDocumentCount'], 380],
    [['coverage', 'coverage', 'setR', 'measurableSurvivorCount'], 354],
    [['coverage', 'coverage', 'setR', 'measurableExclusionCount'], 26],
    [['coverage', 'coverage', 'setR', 'unresolvedShortTextOccurrenceCount'], 8],
    [['coverage', 'coverage', 'setR', 'initialCapExactSlotCount'], 11],
    [['coverage', 'coverage', 'setR', 'initialCapBlockedSlotCount'], 2],
    [['coverage', 'coverage', 'setR', 'exactCapDocumentCountAcrossExactSlots'], 44],
    [['coverage', 'coverage', 'setR', 'fullRankExactSlotCount'], 9],
    [['coverage', 'coverage', 'setR', 'fullRankShortTextBlockedSlotCount'], 4],
    [['coverage', 'coverage', 'divergence', 'measurableDocumentCount'], 380],
    [['coverage', 'coverage', 'divergence', 'survivingBothSamples'], 342],
    [['coverage', 'coverage', 'divergence', 'survivingSetPOnly'], 12],
    [['coverage', 'coverage', 'divergence', 'survivingSetROnly'], 12],
    [['coverage', 'coverage', 'divergence', 'excludedInBothSamples'], 14],
    [['coverage', 'coverageIsSumOfPerSlotCounts'], true],
    [['coverage', 'thirteenSlotSampleBatchMinted'], false],
    [['semantics', 'historicalR23R29PreparationsRecomputed'], false],
    [['semantics', 'historicalPreparationObjectsReminted'], false],
    [['semantics', 'deltaOnlySamplePreparation'], true],
    [['semantics', 'canonicalR23PurePreparationUsed'], true],
    [['semantics', 'survivorWalkReimplemented'], false],
    [['semantics', 'shortTextResolved'], false],
    [['semantics', 'reachableMembershipBound'], false],
    [['semantics', 'sd9Evaluated'], false],
  ] as const);

/** The canonical thirteen-slot R37 readiness history, as its committed census states it. */
export const R42_EXPECTED_R37_HISTORY: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], R37_CENSUS_RECORD],
    [['recordKind'], 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS'],
    [['split'], 'DEV_TRAIN'],
    [['coverage', 'historicalCanonicalReadinessSlots'], 6],
    [['coverage', 'newR37ReadinessSlots'], 7],
    [['coverage', 'coverageReadinessSlots'], 13],
    [['coverage', 'thirteenSlotReadinessBatchMinted'], false],
  ] as const);

/** The committed R41 historical coverage the sample history must equal. */
export const R42_EXPECTED_R41_HISTORY: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], R41_CENSUS_RECORD],
    [['split'], 'DEV_TRAIN'],
    [['coverage', 'historicalCanonicalGraphSlots'], 13],
    [['coverage', 'historicalDocuments'], 388],
    [['coverage', 'historicalMeasurableDocuments'], 380],
    [['coverage', 'historicalShortTextUnresolved'], 8],
    [['coverage', 'sampleCoverageAfterR41'], 13],
    [['coverage', 'readinessCoverageAfterR41'], 13],
    [['historicalGraphCoverage', 'r40HistoricalSampleCoverage'], 13],
    [['historicalGraphCoverage', 'r40HistoricalReadinessCoverage'], 13],
    [['historicalGraphCoverage', 'r37ReadinessSlots'], 13],
    [['semantics', 'survivorSelectionPerformed'], false],
    [['semantics', 'setPRanked'], false],
    [['semantics', 'setRRanked'], false],
  ] as const);

const SAMPLE_FIELDS = [
  'preSd7RankEntryCount',
  'measurableDocumentCount',
  'measurableSurvivorCount',
  'measurableExclusionCount',
  'unresolvedShortTextOccurrenceCount',
  'initialCapExactSlotCount',
  'initialCapBlockedSlotCount',
  'exactCapDocumentCountAcrossExactSlots',
] as const;
const SET_R_EXTRA_FIELDS = ['fullRankExactSlotCount', 'fullRankShortTextBlockedSlotCount'] as const;
const DIVERGENCE_FIELDS = [
  'measurableDocumentCount',
  'survivingBothSamples',
  'survivingSetPOnly',
  'survivingSetROnly',
  'excludedInBothSamples',
] as const;

const HISTORY_PROOF_BY_BATCH = new WeakMap<object, HistoricalV5SamplePreparationCoverageProof>();

function historyDrift(message: string): never {
  refuseV5Sample('STOP_R42_HISTORICAL_R36_R37_SAMPLE_BASELINE_DRIFT_REQUIRES_REVIEW', message);
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

/**
 * §11 / §12 / §54. Proves the committed R36, R37 and R41 records still state
 * the canonical thirteen-slot sample and readiness history, and that it
 * closes against the fresh R41 batch. Mints the proof only after every
 * equality closes.
 */
export function requireHistoricalV5SamplePreparationCoverage(
  records: { readonly r36: unknown; readonly r37: unknown; readonly r41: unknown },
  graphDeltaBatch: A3DevTrainSd7GraphDeltaBatchV5,
): HistoricalV5SamplePreparationCoverageProof {
  const batch: unknown = graphDeltaBatch;
  if (!isA3DevTrainSd7GraphDeltaBatchV5(batch)) {
    refuseV5Sample(
      'R42_SD7_GRAPH_DELTA_NOT_MINTED_BY_R41',
      'the historical sample baseline must be closed against a batch minted by R41',
    );
  }
  const reproduction = r41ReproductionProofForBatch(batch);
  if (reproduction === undefined) {
    refuseV5Sample(
      'R42_R41_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the historical sample baseline is closed only against a reproduced R41 batch',
    );
  }
  const { r36, r37, r41 } = records;
  for (const [path, expected] of R42_EXPECTED_R36_HISTORY) {
    if (at(r36, path) !== expected) historyDrift(`R36 ${path.join('.')} differs`);
  }
  for (const [path, expected] of R42_EXPECTED_R37_HISTORY) {
    if (at(r37, path) !== expected) historyDrift(`R37 ${path.join('.')} differs`);
  }
  for (const [path, expected] of R42_EXPECTED_R41_HISTORY) {
    if (at(r41, path) !== expected) historyDrift(`R41 ${path.join('.')} differs`);
  }

  // R36: historical + new = coverage on every aggregate.
  const groups: readonly (readonly [string, readonly string[]])[] = [
    ['setP', SAMPLE_FIELDS],
    ['setR', [...SAMPLE_FIELDS, ...SET_R_EXTRA_FIELDS]],
    ['divergence', DIVERGENCE_FIELDS],
  ];
  for (const [section, fields] of groups) {
    for (const field of fields) {
      if (
        count(r36, 'coverage', 'historical', section, field) +
          count(r36, 'coverage', 'new', section, field) !==
        count(r36, 'coverage', 'coverage', section, field)
      ) {
        historyDrift(`R36 ${section}.${field} historical + new arithmetic does not close`);
      }
    }
  }
  const slots = count(r36, 'coverage', 'coverageSlotPreparations');
  if (
    count(r36, 'coverage', 'historicalCanonicalSlotPreparations') +
      count(r36, 'coverage', 'newR36SlotPreparations') !==
    slots
  ) {
    historyDrift('R36 slot-preparation arithmetic does not close');
  }

  const sample = (section: string): SampleAggregateCountsV5 =>
    Object.freeze(
      Object.fromEntries(
        SAMPLE_FIELDS.map((field) => [field, count(r36, 'coverage', 'coverage', section, field)]),
      ) as unknown as SampleAggregateCountsV5,
    );
  const setP = sample('setP');
  const setR: SetRAggregateCountsV5 = Object.freeze({
    ...sample('setR'),
    fullRankExactSlotCount: count(r36, 'coverage', 'coverage', 'setR', 'fullRankExactSlotCount'),
    fullRankShortTextBlockedSlotCount: count(
      r36,
      'coverage',
      'coverage',
      'setR',
      'fullRankShortTextBlockedSlotCount',
    ),
  });
  const divergence = Object.freeze(
    Object.fromEntries(
      DIVERGENCE_FIELDS.map((field) => [
        field,
        count(r36, 'coverage', 'coverage', 'divergence', field),
      ]),
    ) as unknown as DivergenceAggregateCountsV5,
  );
  for (const counts of [setP, setR]) {
    if (
      counts.measurableSurvivorCount + counts.measurableExclusionCount !==
        counts.measurableDocumentCount ||
      counts.measurableDocumentCount + counts.unresolvedShortTextOccurrenceCount !==
        counts.preSd7RankEntryCount ||
      counts.initialCapExactSlotCount + counts.initialCapBlockedSlotCount !== slots
    ) {
      historyDrift('the thirteen-slot sample partition does not close');
    }
  }
  if (
    setR.fullRankExactSlotCount + setR.fullRankShortTextBlockedSlotCount !== slots ||
    setP.preSd7RankEntryCount !== setR.preSd7RankEntryCount ||
    setP.measurableDocumentCount !== setR.measurableDocumentCount ||
    divergence.measurableDocumentCount !== setP.measurableDocumentCount ||
    divergence.survivingBothSamples +
      divergence.survivingSetPOnly +
      divergence.survivingSetROnly +
      divergence.excludedInBothSamples !==
      divergence.measurableDocumentCount ||
    divergence.survivingBothSamples + divergence.survivingSetPOnly !==
      setP.measurableSurvivorCount ||
    divergence.survivingBothSamples + divergence.survivingSetROnly !== setR.measurableSurvivorCount
  ) {
    historyDrift('the thirteen-slot SET_R readiness or divergence partition does not close');
  }

  // R37: historical + new = coverage readiness slots.
  const readinessSlots = count(r37, 'coverage', 'coverageReadinessSlots');
  if (
    count(r37, 'coverage', 'historicalCanonicalReadinessSlots') +
      count(r37, 'coverage', 'newR37ReadinessSlots') !==
    readinessSlots
  ) {
    historyDrift('R37 readiness-slot arithmetic does not close');
  }

  // R36 = R37 = committed R41 = fresh R41.
  const r41Sample = count(r41, 'coverage', 'sampleCoverageAfterR41');
  const r41Readiness = count(r41, 'coverage', 'readinessCoverageAfterR41');
  const freshGraphHistory = historicalGraphCoverageProofForBatch(
    documentSourceDeltaBatchForGraphDeltaBatchV5(batch),
  );
  if (
    slots !== readinessSlots ||
    slots !== r41Sample ||
    slots !== r41Readiness ||
    slots !== count(r41, 'coverage', 'historicalCanonicalGraphSlots') ||
    setP.preSd7RankEntryCount !== count(r41, 'coverage', 'historicalDocuments') ||
    setP.measurableDocumentCount !== count(r41, 'coverage', 'historicalMeasurableDocuments') ||
    setP.unresolvedShortTextOccurrenceCount !==
      count(r41, 'coverage', 'historicalShortTextUnresolved') ||
    setR.unresolvedShortTextOccurrenceCount !==
      count(r41, 'coverage', 'historicalShortTextUnresolved')
  ) {
    historyDrift('R36 sample coverage, R37 readiness coverage and R41 history disagree');
  }
  if (
    freshGraphHistory === undefined ||
    batch.split !== R42_SAMPLE_SPLIT ||
    reproduction.sampleCoverageBeforeR42 !== slots ||
    reproduction.readinessCoverageBeforeR42 !== slots ||
    reproduction.historicalGraphSlots !== slots ||
    reproduction.historicalDocuments !== setP.preSd7RankEntryCount ||
    reproduction.historicalMeasurableDocuments !== setP.measurableDocumentCount ||
    reproduction.historicalShortTextUnresolved !== setP.unresolvedShortTextOccurrenceCount ||
    freshGraphHistory.graphSlots !== slots ||
    freshGraphHistory.r40HistoricalSampleCoverage !== slots ||
    freshGraphHistory.r40HistoricalReadinessCoverage !== slots ||
    freshGraphHistory.r37ReadinessSlots !== slots ||
    freshGraphHistory.documents !== setP.preSd7RankEntryCount ||
    freshGraphHistory.measurableDocuments !== setP.measurableDocumentCount ||
    freshGraphHistory.shortTextUnresolved !== setP.unresolvedShortTextOccurrenceCount
  ) {
    historyDrift('the committed sample history does not close against the fresh R41 batch');
  }

  const proof: HistoricalV5SamplePreparationCoverageProof = Object.freeze({
    kind: 'HISTORICAL_V5_SAMPLE_PREPARATION_COVERAGE_PROOF' as const,
    r36HistoricalSlotPreparationsBeforeR36: count(
      r36,
      'coverage',
      'historicalCanonicalSlotPreparations',
    ),
    r36NewSlotPreparations: count(r36, 'coverage', 'newR36SlotPreparations'),
    slotPreparations: slots,
    r37ReadinessSlots: readinessSlots,
    r41HistoricalSampleCoverage: r41Sample,
    r41HistoricalReadinessCoverage: r41Readiness,
    setP,
    setR,
    divergence,
  });
  HISTORY_PROOF_BY_BATCH.set(batch, proof);
  return proof;
}

/** The historical sample proof closed against exactly this R41 batch, or `undefined`. */
export function historicalSampleCoverageProofForBatch(
  batch: unknown,
): HistoricalV5SamplePreparationCoverageProof | undefined {
  if (typeof batch !== 'object' || batch === null) return undefined;
  return HISTORY_PROOF_BY_BATCH.get(batch);
}

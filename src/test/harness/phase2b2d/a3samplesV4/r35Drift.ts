/**
 * PHASE 2B-2D — A3 R36: THE FRESH R35 REPRODUCTION GATE AND THE COMMITTED
 * R23 + R29 HISTORICAL SAMPLE-PREPARATION BASELINE.
 *
 * Neither is authority for the delta preparations. The authority is the
 * fresh, in-process R33 -> R34 -> R35 mint; these only stop the slice when
 * something moved under it.
 *
 *   1. FRESH R35 REPRODUCTION. R35's graph batch is private in-process
 *      authority (WeakSet / WeakMap provenance) and cannot be loaded from the
 *      committed census. A real R36 run therefore re-mints R33, R34 and R35
 *      in-process. The census canonical R35 derives from THAT batch (with
 *      R35's own derivation function) must equal the committed R35 census on
 *      every field except the one execution-provenance commit, and must state
 *      the R35 checkpoint pinned below. Only then is a reproduction proof
 *      minted - associated by object identity with that exact batch, so a
 *      copied, spread or deserialised proof is not one.
 *
 *   2. HISTORICAL R23 + R29 SAMPLE BASELINE. The committed R23 and R29 public
 *      censuses are read as aggregate historical records only. They are NOT
 *      re-derived (that would need the old-six evidence read R33 avoids, the
 *      old-six reassembly R34 avoids, the old-six re-measurement R35 avoids
 *      and the old-six re-preparation R36 exists to avoid), and they say
 *      nothing about the delta. Their arithmetic must close to six slot
 *      preparations / 191 ranked / 190 measurable documents, and those must
 *      equal R35's committed historical graph coverage.
 *
 * THIS MODULE IS PURE apart from R35's pure census derivation. Its inputs
 * arrive already parsed; it reads no file. Differences are reported as field
 * PATHS, never values.
 */
import {
  deriveR35PublicIncrementalSd7GraphCensus,
  type R35CensusProvenance,
  type R35PublicIncrementalSd7GraphCensus,
} from '../a3graphsV4/census.js';
import { isA3DevTrainSd7GraphDeltaBatchV4 } from '../a3graphsV4/devTrain.js';
import type {
  A3DevTrainSd7GraphDeltaBatchV4,
  HistoricalGraphCoverageBaseline,
} from '../a3graphsV4/types.js';
import { refuseV4Sample } from './refusal.js';
import type {
  DivergenceAggregateCountsV4,
  HistoricalSamplePreparationBaselineV4,
  SampleAggregateCountsV4,
  SetRAggregateCountsV4,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE FRESH R35 REPRODUCTION.
// ---------------------------------------------------------------------------

/**
 * The ONE committed R35 field a fresh reproduction may legitimately differ
 * on: the commit the reproducing process executed at. Every other field -
 * record, split, R34 provenance, R34 reproduction, delta graph, canonical
 * SD7, history, coverage, A2 consistency, semantics, access, disclosure -
 * must match.
 */
export const R35_REPRODUCTION_EXCLUDED_FIELDS = Object.freeze(['implementationCommit'] as const);

/** The R35 checkpoint R36 was cut against. */
export const R36_EXPECTED_R35_CHECKPOINT = Object.freeze({
  record: 'PHASE_2B_2D_A3_R35_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1',
  split: 'DEV_TRAIN',
  'r34Reproduction.freshR34CensusEqualsCommitted': true,
  'deltaGraph.deltaGraphSlots': 7,
  'deltaGraph.deltaDocuments': 197,
  'deltaGraph.deltaMeasurableDocuments': 190,
  'deltaGraph.deltaShortTextUnresolved': 7,
  'deltaGraph.deltaComparedPairs': 2649,
  'deltaGraph.deltaNearDuplicateEdges': 16,
  'deltaGraph.deltaDocumentsInAtLeastOneNearDuplicateEdge': 20,
  'historicalGraphCoverage.historicalGraphSlots': 6,
  'coverage.historicalCanonicalGraphSlots': 6,
  'coverage.historicalDocuments': 191,
  'coverage.historicalMeasurableDocuments': 190,
  'coverage.historicalShortTextUnresolved': 1,
  'coverage.historicalComparedPairs': 2933,
  'coverage.historicalNearDuplicateEdges': 42,
  'coverage.historicalDocumentsInAtLeastOneNearDuplicateEdge': 21,
  'coverage.coverageGraphSlots': 13,
  'coverage.coverageDocuments': 388,
  'coverage.coverageMeasurableDocuments': 380,
  'coverage.coverageShortTextUnresolved': 8,
  'coverage.coverageComparedPairs': 5582,
  'coverage.coverageNearDuplicateEdges': 58,
  'coverage.coverageDocumentsInAtLeastOneNearDuplicateEdge': 41,
  'coverage.thirteenSlotGraphBatchMinted': false,
  'a2Sd7Consistency.a2Sd7AggregateConsistencyCheckUsedAsGraphAuthority': false,
  'a2Sd7Consistency.a2SurvivorCountUsedAsAuthority': false,
  'semantics.componentsComputed': false,
  'semantics.survivorSelectionPerformed': false,
  'semantics.setPRanked': false,
  'semantics.setRRanked': false,
  'semantics.setPMembershipSelected': false,
  'semantics.setRMembershipSelected': false,
  'semantics.shortTextResolved': false,
  'semantics.sd9Evaluated': false,
  'access.r35SqlStatements': 0,
  'access.upstreamReproducedR33OldAuthorityQueries': 0,
  'access.upstreamReproducedR33DeltaAuthorityQueries': 7,
  'access.databaseWrites': 0,
});

/** A proof that ONE minted R35 batch reproduced the committed R35 census. */
export interface R35ReproductionProof {
  readonly kind: 'R36_FRESH_R35_REPRODUCTION_PROOF';
  readonly comparedTopLevelFieldCount: number;
  readonly excludedFields: readonly string[];
  readonly differingPaths: readonly [];
  readonly deltaGraphSlots: number;
  readonly deltaDocuments: number;
  readonly deltaMeasurableDocuments: number;
  readonly deltaShortTextUnresolved: number;
  readonly historicalGraphSlots: number;
  readonly historicalDocuments: number;
  readonly historicalMeasurableDocuments: number;
  readonly historicalShortTextUnresolved: number;
  readonly upstreamOldAuthorityQueries: number;
  readonly upstreamDeltaAuthorityQueries: number;
}

const REPRODUCTION_PROOF_BY_BATCH = new WeakMap<object, R35ReproductionProof>();

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
      differingPaths(fresh[key], committed[key], path === '' ? key : `${path}.${key}`, into);
    }
    return;
  }
  if (canonical(fresh) !== canonical(committed)) into.push(path);
}

/** Resolves a dotted path whose LAST segment may itself contain dots. */
function at(record: unknown, path: string): unknown {
  let cursor: unknown = record;
  let rest = path;
  while (rest.length > 0) {
    if (!isPlainObject(cursor)) return undefined;
    if (Object.prototype.hasOwnProperty.call(cursor, rest)) return cursor[rest];
    const dot = rest.indexOf('.');
    if (dot < 0) return undefined;
    cursor = cursor[rest.slice(0, dot)];
    rest = rest.slice(dot + 1);
  }
  return cursor;
}

/**
 * Field paths whose fresh value differs from the committed R35 census, over
 * every field except the excluded execution-provenance commit. Empty means
 * the fresh reproduction equals the committed record.
 */
export function r35ReproductionDriftPaths(
  fresh: R35PublicIncrementalSd7GraphCensus,
  committed: unknown,
): readonly string[] {
  const freshRecord = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown>;
  const committedRecord = isPlainObject(committed)
    ? (JSON.parse(JSON.stringify(committed)) as Record<string, unknown>)
    : {};
  for (const field of R35_REPRODUCTION_EXCLUDED_FIELDS) {
    delete freshRecord[field];
    delete committedRecord[field];
  }
  const differing: string[] = [];
  differingPaths(freshRecord, committedRecord, '', differing);
  return Object.freeze(differing);
}

/**
 * §5 / §25. Derives the R35 census from the ACTUAL minted R35 batch (with
 * R35's own derivation function), requires it to equal the committed R35
 * census and the pinned checkpoint, and only then mints a reproduction proof
 * for that batch. A batch is proved at most once.
 */
export function requireFreshR35Reproduction(
  batch: A3DevTrainSd7GraphDeltaBatchV4,
  historicalGraphBaseline: HistoricalGraphCoverageBaseline,
  provenance: R35CensusProvenance,
  committedR35Census: unknown,
): R35ReproductionProof {
  if (!isA3DevTrainSd7GraphDeltaBatchV4(batch)) {
    refuseV4Sample(
      'R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35',
      'the reproduction input is not an SD7 graph delta batch minted by R35 in this process',
    );
  }
  if (REPRODUCTION_PROOF_BY_BATCH.has(batch)) {
    refuseV4Sample(
      'R36_R35_REPRODUCTION_ALREADY_PROVED',
      'this R35 batch already carries a reproduction proof',
    );
  }
  const fresh = deriveR35PublicIncrementalSd7GraphCensus(
    batch,
    historicalGraphBaseline,
    provenance,
  );
  const differing = r35ReproductionDriftPaths(fresh, committedR35Census);
  if (differing.length > 0) {
    refuseV4Sample(
      'STOP_R36_FRESH_R35_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
      `the fresh R35 census differs from the committed one at ${differing.join(', ')}`,
    );
  }
  for (const [path, expected] of Object.entries(R36_EXPECTED_R35_CHECKPOINT)) {
    if (at(fresh, path) !== expected) {
      refuseV4Sample(
        'STOP_R36_FRESH_R35_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
        `${path} no longer equals the R35 checkpoint`,
      );
    }
  }
  const proof: R35ReproductionProof = Object.freeze({
    kind: 'R36_FRESH_R35_REPRODUCTION_PROOF' as const,
    comparedTopLevelFieldCount: Object.keys(fresh).length - R35_REPRODUCTION_EXCLUDED_FIELDS.length,
    excludedFields: R35_REPRODUCTION_EXCLUDED_FIELDS,
    differingPaths: Object.freeze([]) as readonly [],
    deltaGraphSlots: fresh.deltaGraph.deltaGraphSlots,
    deltaDocuments: fresh.deltaGraph.deltaDocuments,
    deltaMeasurableDocuments: fresh.deltaGraph.deltaMeasurableDocuments,
    deltaShortTextUnresolved: fresh.deltaGraph.deltaShortTextUnresolved,
    historicalGraphSlots: fresh.coverage.historicalCanonicalGraphSlots,
    historicalDocuments: fresh.coverage.historicalDocuments,
    historicalMeasurableDocuments: fresh.coverage.historicalMeasurableDocuments,
    historicalShortTextUnresolved: fresh.coverage.historicalShortTextUnresolved,
    upstreamOldAuthorityQueries: fresh.access.upstreamReproducedR33OldAuthorityQueries,
    upstreamDeltaAuthorityQueries: fresh.access.upstreamReproducedR33DeltaAuthorityQueries,
  });
  REPRODUCTION_PROOF_BY_BATCH.set(batch, proof);
  return proof;
}

/** The reproduction proof minted for exactly this R35 batch, or `undefined`. */
export function r35ReproductionProofForBatch(batch: unknown): R35ReproductionProof | undefined {
  if (typeof batch !== 'object' || batch === null) return undefined;
  return REPRODUCTION_PROOF_BY_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. THE COMMITTED R23 + R29 HISTORICAL SAMPLE BASELINE.
// ---------------------------------------------------------------------------

/** The canonical historical R23 aggregate baseline, as its committed census states it. */
export const R36_EXPECTED_R23_HISTORY = Object.freeze({
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

/** The canonical historical R29 aggregate record, as its committed census states it. */
export const R36_EXPECTED_R29_HISTORY = Object.freeze({
  record: 'PHASE_2B_2D_A3_R29_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1',
  split: 'DEV_TRAIN',
  'delta.deltaSlotPreparations': 1,
  'coverage.historicalCanonicalR23SlotPreparations': 5,
  'coverage.newR29SlotPreparations': 1,
  'coverage.coverageSlotPreparations': 6,
  'coverage.coverage.setP.preSd7RankEntryCount': 191,
  'coverage.coverage.setP.measurableDocumentCount': 190,
  'coverage.coverage.setP.measurableSurvivorCount': 176,
  'coverage.coverage.setP.measurableExclusionCount': 14,
  'coverage.coverage.setP.unresolvedShortTextOccurrenceCount': 1,
  'coverage.coverage.setP.initialCapExactSlotCount': 6,
  'coverage.coverage.setP.initialCapBlockedSlotCount': 0,
  'coverage.coverage.setP.exactCapDocumentCountAcrossExactSlots': 48,
  'coverage.coverage.setR.preSd7RankEntryCount': 191,
  'coverage.coverage.setR.measurableDocumentCount': 190,
  'coverage.coverage.setR.measurableSurvivorCount': 176,
  'coverage.coverage.setR.measurableExclusionCount': 14,
  'coverage.coverage.setR.unresolvedShortTextOccurrenceCount': 1,
  'coverage.coverage.setR.initialCapExactSlotCount': 6,
  'coverage.coverage.setR.initialCapBlockedSlotCount': 0,
  'coverage.coverage.setR.exactCapDocumentCountAcrossExactSlots': 24,
  'coverage.coverage.setR.fullRankExactSlotCount': 5,
  'coverage.coverage.setR.fullRankShortTextBlockedSlotCount': 1,
  'coverage.coverage.divergence.measurableDocumentCount': 190,
  'coverage.coverage.divergence.survivingBothSamples': 171,
  'coverage.coverage.divergence.survivingSetPOnly': 5,
  'coverage.coverage.divergence.survivingSetROnly': 5,
  'coverage.coverage.divergence.excludedInBothSamples': 9,
  'coverage.sixSlotBatchMinted': false,
  'semantics.historicalR23PreparationsRecomputed': false,
  'semantics.survivorWalkReimplemented': false,
  'semantics.shortTextResolved': false,
  'semantics.sd9Evaluated': false,
});

/** The committed R35 historical graph coverage the sample history must equal. */
export const R36_EXPECTED_R35_HISTORICAL_GRAPH_COVERAGE = Object.freeze({
  record: 'PHASE_2B_2D_A3_R35_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1',
  'coverage.historicalCanonicalGraphSlots': 6,
  'coverage.historicalDocuments': 191,
  'coverage.historicalMeasurableDocuments': 190,
  'coverage.historicalShortTextUnresolved': 1,
});

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

const HISTORICAL_SAMPLE_BASELINES = new WeakSet<object>();

function historyDrift(message: string): never {
  refuseV4Sample('STOP_R36_HISTORICAL_R23_R29_SAMPLE_BASELINE_DRIFT_REQUIRES_REVIEW', message);
}

/**
 * §8. The committed R23 and R29 records still state the canonical sample
 * history, and it closes: R29's historical = R23's totals and R23 + R29 delta
 * = R29 coverage on every SET_P, SET_R and divergence aggregate; six slot
 * preparations; survivors + exclusions = measurable; measurable + short =
 * ranked; exact + blocked caps = slots; full-rank exact + blocked = slots;
 * the divergence partition closes - and the six-slot population equals R35's
 * committed historical graph coverage (6 slots / 191 documents / 190
 * measurable / 1 short).
 */
export function requireHistoricalSamplePreparationBaseline(
  committedR23Census: unknown,
  committedR29Census: unknown,
  committedR35Census: unknown,
): HistoricalSamplePreparationBaselineV4 {
  for (const [path, expected] of Object.entries(R36_EXPECTED_R23_HISTORY)) {
    if (at(committedR23Census, path) !== expected) {
      historyDrift(`the committed R23 historical record ${path} differs`);
    }
  }
  for (const [path, expected] of Object.entries(R36_EXPECTED_R29_HISTORY)) {
    if (at(committedR29Census, path) !== expected) {
      historyDrift(`the committed R29 historical record ${path} differs`);
    }
  }
  for (const [path, expected] of Object.entries(R36_EXPECTED_R35_HISTORICAL_GRAPH_COVERAGE)) {
    if (at(committedR35Census, path) !== expected) {
      historyDrift(`the committed R35 historical graph record ${path} differs`);
    }
  }
  const num = (record: unknown, path: string): number => {
    const value = at(record, path);
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      historyDrift(`the historical record ${path} is not a count`);
    }
    return value;
  };

  // [R23 section, R29 historical section, R29 delta section, R29 coverage section, fields]
  const groups: [string, string, string, string, readonly string[]][] = [
    ['setP', 'coverage.historical.setP', 'delta.setP', 'coverage.coverage.setP', SAMPLE_FIELDS],
    [
      'setR',
      'coverage.historical.setR',
      'delta.setR',
      'coverage.coverage.setR',
      [...SAMPLE_FIELDS, ...SET_R_EXTRA_FIELDS],
    ],
    [
      'sampleSpecificDivergence',
      'coverage.historical.divergence',
      'delta.divergence',
      'coverage.coverage.divergence',
      DIVERGENCE_FIELDS,
    ],
  ];
  for (const [r23Section, r29Historical, r29Delta, r29Coverage, fields] of groups) {
    for (const field of fields) {
      const total = num(committedR23Census, `${r23Section}.${field}`);
      const historical = num(committedR29Census, `${r29Historical}.${field}`);
      const delta = num(committedR29Census, `${r29Delta}.${field}`);
      const coverage = num(committedR29Census, `${r29Coverage}.${field}`);
      if (historical !== total || total + delta !== coverage) {
        historyDrift(`the R23 + R29 ${r23Section}.${field} arithmetic does not close`);
      }
    }
  }
  const r23Slots = num(committedR23Census, 'preparation.slotPreparationCount');
  const r29Delta = num(committedR29Census, 'delta.deltaSlotPreparations');
  const slots = num(committedR29Census, 'coverage.coverageSlotPreparations');
  if (
    num(committedR29Census, 'coverage.historicalCanonicalR23SlotPreparations') !== r23Slots ||
    num(committedR29Census, 'coverage.newR29SlotPreparations') !== r29Delta ||
    r23Slots + r29Delta !== slots
  ) {
    historyDrift('the R23 + R29 slot-preparation arithmetic does not close');
  }

  const sample = (section: string): SampleAggregateCountsV4 =>
    Object.freeze(
      Object.fromEntries(
        SAMPLE_FIELDS.map((field) => [field, num(committedR29Census, `${section}.${field}`)]),
      ) as unknown as SampleAggregateCountsV4,
    );
  const setP = sample('coverage.coverage.setP');
  const setR: SetRAggregateCountsV4 = Object.freeze({
    ...sample('coverage.coverage.setR'),
    fullRankExactSlotCount: num(
      committedR29Census,
      'coverage.coverage.setR.fullRankExactSlotCount',
    ),
    fullRankShortTextBlockedSlotCount: num(
      committedR29Census,
      'coverage.coverage.setR.fullRankShortTextBlockedSlotCount',
    ),
  });
  const divergence = Object.freeze(
    Object.fromEntries(
      DIVERGENCE_FIELDS.map((field) => [
        field,
        num(committedR29Census, `coverage.coverage.divergence.${field}`),
      ]),
    ) as unknown as DivergenceAggregateCountsV4,
  );

  for (const counts of [setP, setR]) {
    if (
      counts.measurableSurvivorCount + counts.measurableExclusionCount !==
        counts.measurableDocumentCount ||
      counts.measurableDocumentCount + counts.unresolvedShortTextOccurrenceCount !==
        counts.preSd7RankEntryCount ||
      counts.initialCapExactSlotCount + counts.initialCapBlockedSlotCount !== slots
    ) {
      historyDrift('the six-slot sample partition does not close');
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
    historyDrift('the six-slot SET_R readiness or divergence partition does not close');
  }
  if (
    slots !== at(committedR35Census, 'coverage.historicalCanonicalGraphSlots') ||
    setP.preSd7RankEntryCount !== at(committedR35Census, 'coverage.historicalDocuments') ||
    setP.measurableDocumentCount !==
      at(committedR35Census, 'coverage.historicalMeasurableDocuments') ||
    setP.unresolvedShortTextOccurrenceCount !==
      at(committedR35Census, 'coverage.historicalShortTextUnresolved') ||
    setR.unresolvedShortTextOccurrenceCount !==
      at(committedR35Census, 'coverage.historicalShortTextUnresolved')
  ) {
    historyDrift('the historical sample population is not R35 historical graph coverage');
  }

  const baseline: HistoricalSamplePreparationBaselineV4 = Object.freeze({
    r23SlotPreparations: r23Slots,
    r29NewSlotPreparations: r29Delta,
    slotPreparations: slots,
    setP,
    setR,
    divergence,
  });
  HISTORICAL_SAMPLE_BASELINES.add(baseline);
  return baseline;
}

/** A baseline THIS module proved from the committed records, or a refusal. */
export function requireHistoricalSamplePreparationBaselineProof(
  baseline: unknown,
): HistoricalSamplePreparationBaselineV4 {
  if (
    typeof baseline !== 'object' ||
    baseline === null ||
    !HISTORICAL_SAMPLE_BASELINES.has(baseline)
  ) {
    refuseV4Sample(
      'R36_HISTORICAL_SAMPLE_BASELINE_NOT_PROVED',
      'the historical sample baseline was not proved from the committed R23 and R29 records',
    );
  }
  return baseline as HistoricalSamplePreparationBaselineV4;
}

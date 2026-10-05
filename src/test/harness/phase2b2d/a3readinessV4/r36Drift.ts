/**
 * PHASE 2B-2D — A3 R37: THE FRESH R36 REPRODUCTION GATE AND THE COMMITTED
 * R24 + R30 HISTORICAL READINESS BASELINE.
 *
 * Neither is authority for the delta readiness. The authority is the fresh,
 * in-process R33 -> R34 -> R35 -> R36 mint; these only stop the slice when
 * something moved under it.
 *
 *   1. FRESH R36 REPRODUCTION. R36's sample batch is private in-process
 *      authority (WeakSet / WeakMap provenance) and cannot be loaded from the
 *      committed census. A real R37 run therefore re-mints R33, R34, R35 and
 *      R36 in-process. The census canonical R36 derives from THAT batch (with
 *      R36's own derivation function) must equal the committed R36 census on
 *      every field except the one execution-provenance commit, and must state
 *      the R36 checkpoint pinned below. Only then is a reproduction proof
 *      minted - associated by object identity with that exact batch, so a
 *      copied, spread or deserialised proof is not one. A batch is proved at
 *      most once.
 *
 *   2. HISTORICAL R24 + R30 READINESS BASELINE. The committed R24 and R30
 *      public censuses are read as aggregate historical records only. They
 *      are NOT re-derived (that would need the old-six evidence read R33
 *      avoids, the old-six reassembly R34 avoids, the old-six re-measurement
 *      R35 avoids, the old-six re-preparation R36 avoids and the old-six
 *      readiness re-derivation R37 exists to avoid), and they say nothing
 *      about the delta. Their arithmetic must close to six slot readiness
 *      states, and those must agree with R36's committed historical
 *      sample-preparation coverage.
 *
 * THIS MODULE IS PURE apart from R36's pure census derivation. Its inputs
 * arrive already parsed; it reads no file. Differences are reported as field
 * PATHS, never values.
 */
import {
  deriveR36PublicIncrementalSampleSurvivorCensus,
  type R36CensusProvenance,
  type R36PublicIncrementalSampleSurvivorCensus,
} from '../a3samplesV4/census.js';
import { isA3DevTrainSampleSurvivorDeltaBatchV4 } from '../a3samplesV4/devTrain.js';
import type {
  A3DevTrainSampleSurvivorDeltaBatchV4,
  HistoricalSamplePreparationBaselineV4,
} from '../a3samplesV4/types.js';
import { refuseV4Readiness } from './refusal.js';
import type {
  CrossSampleSd9AggregateV4,
  HistoricalReadinessBaselineV4,
  ReadinessSampleAggregateV4,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE FRESH R36 REPRODUCTION.
// ---------------------------------------------------------------------------

/**
 * The ONE committed R36 field a fresh reproduction may legitimately differ
 * on: the commit the reproducing process executed at. Every other field -
 * record, split, R35 provenance, R35 reproduction, delta, canonical
 * constants, history, coverage, semantics, access, disclosure - must match.
 */
export const R36_REPRODUCTION_EXCLUDED_FIELDS = Object.freeze(['implementationCommit'] as const);

/** The R36 checkpoint R37 was cut against. */
export const R37_EXPECTED_R36_CHECKPOINT = Object.freeze({
  record: 'PHASE_2B_2D_A3_R36_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1',
  split: 'DEV_TRAIN',
  'r35Reproduction.freshR35CensusEqualsCommitted': true,
  'delta.deltaSlotPreparations': 7,
  'delta.setP.preSd7RankEntryCount': 197,
  'delta.setP.measurableDocumentCount': 190,
  'delta.setP.measurableSurvivorCount': 178,
  'delta.setP.measurableExclusionCount': 12,
  'delta.setP.unresolvedShortTextOccurrenceCount': 7,
  'delta.setP.initialCapExactSlotCount': 5,
  'delta.setP.initialCapBlockedSlotCount': 2,
  'delta.setP.exactCapDocumentCountAcrossExactSlots': 40,
  'delta.setR.preSd7RankEntryCount': 197,
  'delta.setR.measurableDocumentCount': 190,
  'delta.setR.measurableSurvivorCount': 178,
  'delta.setR.measurableExclusionCount': 12,
  'delta.setR.unresolvedShortTextOccurrenceCount': 7,
  'delta.setR.initialCapExactSlotCount': 5,
  'delta.setR.initialCapBlockedSlotCount': 2,
  'delta.setR.exactCapDocumentCountAcrossExactSlots': 20,
  'delta.setR.fullRankExactSlotCount': 4,
  'delta.setR.fullRankShortTextBlockedSlotCount': 3,
  'delta.divergence.measurableDocumentCount': 190,
  'delta.divergence.survivingBothSamples': 171,
  'delta.divergence.survivingSetPOnly': 7,
  'delta.divergence.survivingSetROnly': 7,
  'delta.divergence.excludedInBothSamples': 5,
  'coverage.historicalCanonicalSlotPreparations': 6,
  'coverage.newR36SlotPreparations': 7,
  'coverage.coverageSlotPreparations': 13,
  'coverage.coverage.setP.preSd7RankEntryCount': 388,
  'coverage.coverage.setP.measurableDocumentCount': 380,
  'coverage.coverage.setP.measurableSurvivorCount': 354,
  'coverage.coverage.setP.measurableExclusionCount': 26,
  'coverage.coverage.setP.unresolvedShortTextOccurrenceCount': 8,
  'coverage.coverage.setP.initialCapExactSlotCount': 11,
  'coverage.coverage.setP.initialCapBlockedSlotCount': 2,
  'coverage.coverage.setP.exactCapDocumentCountAcrossExactSlots': 88,
  'coverage.coverage.setR.preSd7RankEntryCount': 388,
  'coverage.coverage.setR.measurableDocumentCount': 380,
  'coverage.coverage.setR.measurableSurvivorCount': 354,
  'coverage.coverage.setR.measurableExclusionCount': 26,
  'coverage.coverage.setR.unresolvedShortTextOccurrenceCount': 8,
  'coverage.coverage.setR.initialCapExactSlotCount': 11,
  'coverage.coverage.setR.initialCapBlockedSlotCount': 2,
  'coverage.coverage.setR.exactCapDocumentCountAcrossExactSlots': 44,
  'coverage.coverage.setR.fullRankExactSlotCount': 9,
  'coverage.coverage.setR.fullRankShortTextBlockedSlotCount': 4,
  'coverage.thirteenSlotSampleBatchMinted': false,
  'semantics.shortTextResolved': false,
  'semantics.reachableMembershipBound': false,
  'semantics.sd9Evaluated': false,
  'semantics.finalDevTrainCorpusMaterialised': false,
  'access.r36SqlStatements': 0,
  'access.upstreamReproducedR33OldAuthorityQueries': 0,
  'access.upstreamReproducedR33DeltaAuthorityQueries': 7,
  'access.databaseWrites': 0,
});

/** One sample's R36 counts, as the fresh census stated them. */
export interface R36ReproducedSampleCounts {
  readonly measurableSurvivorCount: number;
  readonly unresolvedShortTextOccurrenceCount: number;
  readonly initialCapExactSlotCount: number;
  readonly initialCapBlockedSlotCount: number;
  readonly exactCapDocumentCountAcrossExactSlots: number;
}

/** A proof that ONE minted R36 batch reproduced the committed R36 census. */
export interface R36ReproductionProof {
  readonly kind: 'R37_FRESH_R36_REPRODUCTION_PROOF';
  readonly comparedTopLevelFieldCount: number;
  readonly excludedFields: readonly string[];
  readonly differingPaths: readonly [];
  readonly deltaSlotPreparations: number;
  readonly deltaSetP: R36ReproducedSampleCounts;
  readonly deltaSetR: R36ReproducedSampleCounts;
  readonly deltaSetRFullRankExactSlotCount: number;
  readonly deltaSetRFullRankShortTextBlockedSlotCount: number;
  readonly historicalSlotPreparations: number;
  readonly historicalSetP: R36ReproducedSampleCounts;
  readonly historicalSetR: R36ReproducedSampleCounts;
  readonly historicalSetRFullRankExactSlotCount: number;
  readonly historicalSetRFullRankShortTextBlockedSlotCount: number;
  readonly coverageSlotPreparations: number;
  readonly upstreamOldAuthorityQueries: number;
  readonly upstreamDeltaAuthorityQueries: number;
}

const REPRODUCTION_PROOF_BY_BATCH = new WeakMap<object, R36ReproductionProof>();

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

/** Resolves a dotted path. No checkpoint or record key here contains a dot. */
function at(record: unknown, path: string): unknown {
  let node: unknown = record;
  for (const key of path.split('.')) {
    if (!isPlainObject(node)) return undefined;
    node = node[key];
  }
  return node;
}

/**
 * Field paths whose fresh value differs from the committed R36 census, over
 * every field except the excluded execution-provenance commit. Empty means
 * the fresh reproduction equals the committed record.
 */
export function r36ReproductionDriftPaths(
  fresh: R36PublicIncrementalSampleSurvivorCensus,
  committed: unknown,
): readonly string[] {
  const freshRecord = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown>;
  const committedRecord = isPlainObject(committed)
    ? (JSON.parse(JSON.stringify(committed)) as Record<string, unknown>)
    : {};
  for (const field of R36_REPRODUCTION_EXCLUDED_FIELDS) {
    delete freshRecord[field];
    delete committedRecord[field];
  }
  const differing: string[] = [];
  differingPaths(freshRecord, committedRecord, '', differing);
  return Object.freeze(differing);
}

function reproducedSample(
  fresh: R36PublicIncrementalSampleSurvivorCensus,
  section: string,
): R36ReproducedSampleCounts {
  const count = (field: string): number => at(fresh, `${section}.${field}`) as number;
  return Object.freeze({
    measurableSurvivorCount: count('measurableSurvivorCount'),
    unresolvedShortTextOccurrenceCount: count('unresolvedShortTextOccurrenceCount'),
    initialCapExactSlotCount: count('initialCapExactSlotCount'),
    initialCapBlockedSlotCount: count('initialCapBlockedSlotCount'),
    exactCapDocumentCountAcrossExactSlots: count('exactCapDocumentCountAcrossExactSlots'),
  });
}

/**
 * §5 / §7 / §24. Derives the R36 census from the ACTUAL minted R36 batch
 * (with R36's own derivation function), requires it to equal the committed
 * R36 census and the pinned checkpoint, and only then mints a reproduction
 * proof for that batch. A batch is proved at most once.
 */
export function requireFreshR36Reproduction(
  batch: A3DevTrainSampleSurvivorDeltaBatchV4,
  historicalSampleBaseline: HistoricalSamplePreparationBaselineV4,
  provenance: R36CensusProvenance,
  committedR36Census: unknown,
): R36ReproductionProof {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV4(batch)) {
    refuseV4Readiness(
      'R37_SAMPLE_DELTA_NOT_MINTED_BY_R36',
      'the reproduction input is not a sample survivor delta batch minted by R36 in this process',
    );
  }
  if (REPRODUCTION_PROOF_BY_BATCH.has(batch)) {
    refuseV4Readiness(
      'R37_R36_REPRODUCTION_ALREADY_PROVED',
      'this R36 batch already carries a reproduction proof',
    );
  }
  const fresh = deriveR36PublicIncrementalSampleSurvivorCensus(
    batch,
    historicalSampleBaseline,
    provenance,
  );
  const differing = r36ReproductionDriftPaths(fresh, committedR36Census);
  if (differing.length > 0) {
    refuseV4Readiness(
      'STOP_R37_FRESH_R36_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
      `the fresh R36 census differs from the committed one at ${differing.join(', ')}`,
    );
  }
  for (const [path, expected] of Object.entries(R37_EXPECTED_R36_CHECKPOINT)) {
    if (at(fresh, path) !== expected) {
      refuseV4Readiness(
        'STOP_R37_FRESH_R36_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
        `${path} no longer equals the R36 checkpoint`,
      );
    }
  }
  const proof: R36ReproductionProof = Object.freeze({
    kind: 'R37_FRESH_R36_REPRODUCTION_PROOF' as const,
    comparedTopLevelFieldCount: Object.keys(fresh).length - R36_REPRODUCTION_EXCLUDED_FIELDS.length,
    excludedFields: R36_REPRODUCTION_EXCLUDED_FIELDS,
    differingPaths: Object.freeze([]) as readonly [],
    deltaSlotPreparations: fresh.delta.deltaSlotPreparations,
    deltaSetP: reproducedSample(fresh, 'delta.setP'),
    deltaSetR: reproducedSample(fresh, 'delta.setR'),
    deltaSetRFullRankExactSlotCount: fresh.delta.setR.fullRankExactSlotCount,
    deltaSetRFullRankShortTextBlockedSlotCount: fresh.delta.setR.fullRankShortTextBlockedSlotCount,
    historicalSlotPreparations: fresh.coverage.historicalCanonicalSlotPreparations,
    historicalSetP: reproducedSample(fresh, 'coverage.historical.setP'),
    historicalSetR: reproducedSample(fresh, 'coverage.historical.setR'),
    historicalSetRFullRankExactSlotCount: fresh.coverage.historical.setR.fullRankExactSlotCount,
    historicalSetRFullRankShortTextBlockedSlotCount:
      fresh.coverage.historical.setR.fullRankShortTextBlockedSlotCount,
    coverageSlotPreparations: fresh.coverage.coverageSlotPreparations,
    upstreamOldAuthorityQueries: fresh.access.upstreamReproducedR33OldAuthorityQueries,
    upstreamDeltaAuthorityQueries: fresh.access.upstreamReproducedR33DeltaAuthorityQueries,
  });
  REPRODUCTION_PROOF_BY_BATCH.set(batch, proof);
  return proof;
}

/** The reproduction proof minted for exactly this R36 batch, or `undefined`. */
export function r36ReproductionProofForBatch(batch: unknown): R36ReproductionProof | undefined {
  if (typeof batch !== 'object' || batch === null) return undefined;
  return REPRODUCTION_PROOF_BY_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. THE COMMITTED R24 + R30 HISTORICAL READINESS BASELINE.
// ---------------------------------------------------------------------------

/** The canonical historical R24 aggregate record, as its committed census states it. */
export const R37_EXPECTED_R24_HISTORY = Object.freeze({
  record: 'PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS_V1',
  split: 'DEV_TRAIN',
  'readiness.r23SlotPreparationCount': 5,
  'readiness.slotReadinessCount': 5,
  'canonicalConstants.sd9Semantics':
    'A3_MECHANICAL_SD9_OF_CANONICAL_SURVIVOR_ENVELOPE_ONLY_NOT_A2_ACQUISITION_STATUS',
  'semantics.setRReadinessRederived': false,
  'semantics.capSliced': false,
  'semantics.blockedCapMembershipInvented': false,
  'semantics.fullRankExactnessRequiredForExactReachableCap': false,
  'semantics.unreachableShortTextTailResolved': false,
  'semantics.sd9MechanicalOnly': true,
  'semantics.completeCorpusPreflightRun': false,
});

/** The canonical historical R30 aggregate record, as its committed census states it. */
export const R37_EXPECTED_R30_HISTORY = Object.freeze({
  record: 'PHASE_2B_2D_A3_R30_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1',
  split: 'DEV_TRAIN',
  'delta.deltaReadinessSlots': 1,
  'coverage.historicalCanonicalR24ReadinessSlots': 5,
  'coverage.newR30ReadinessSlots': 1,
  'coverage.coverageReadinessSlots': 6,
  'coverage.sixSlotReadinessBatchMinted': false,
  'semantics.historicalR24StatesRecomputed': false,
  'semantics.setRReadinessRederived': false,
  'semantics.capSliced': false,
  'semantics.shortTextResolved': false,
  'semantics.sd9MechanicalOnly': true,
  'semantics.completeCorpusPreflightRun': false,
  'sd9AuthorityBoundary.rewritesA2AcquisitionStatus': false,
});

const HISTORICAL_SAMPLE_EXPECTED = Object.freeze({
  reachableMembershipExactSlotCount: 6,
  reachableMembershipBlockedSlotCount: 0,
  fullRankExactSlotCount: 5,
  fullRankShortTextBlockedSlotCount: 1,
  fullRankBlockedWhileReachableMembershipExactSlotCount: 1,
  measurableSurvivorCount: 176,
  unresolvedShortTextOccurrenceCount: 1,
  sd9MinEnvelopeTotal: 176,
  sd9MaxEnvelopeTotal: 177,
  sd9MechanicalSuccessfulSlotCount: 6,
  sd9MechanicalUnsuccessfulSlotCount: 0,
  sd9MechanicalPendingSlotCount: 0,
});

/** The six-slot historical readiness baseline the R24 + R30 arithmetic must close to (§8). */
export const R37_EXPECTED_SIX_SLOT_HISTORICAL_READINESS = Object.freeze({
  slotReadinessCount: 6,
  ...Object.fromEntries(
    Object.entries(HISTORICAL_SAMPLE_EXPECTED).map(([key, value]) => [`setP.${key}`, value]),
  ),
  'setP.reachableMembershipDocumentCountAcrossExactSlots': 48,
  ...Object.fromEntries(
    Object.entries(HISTORICAL_SAMPLE_EXPECTED).map(([key, value]) => [`setR.${key}`, value]),
  ),
  'setR.reachableMembershipDocumentCountAcrossExactSlots': 24,
  'crossSample.bothSamplesMechanicallySuccessfulSlotCount': 6,
  'crossSample.sd9StatusDisagreementSlotCount': 0,
}) as Readonly<Record<string, number>>;

const SAMPLE_FIELDS = [
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
] as const satisfies readonly (keyof ReadinessSampleAggregateV4)[];
const CROSS_FIELDS = [
  'bothSamplesMechanicallySuccessfulSlotCount',
  'sd9StatusDisagreementSlotCount',
] as const satisfies readonly (keyof CrossSampleSd9AggregateV4)[];

const HISTORICAL_READINESS_BASELINES = new WeakSet<object>();

function historyDrift(message: string): never {
  refuseV4Readiness(
    'STOP_R37_HISTORICAL_R24_R30_READINESS_BASELINE_DRIFT_REQUIRES_REVIEW',
    message,
  );
}

/**
 * §8 / §25. The committed R24 and R30 records still state the canonical
 * readiness history, and it closes: R30's historical = R24's totals and R24 +
 * R30 delta = R30 coverage on every SET_P, SET_R and cross-sample aggregate;
 * five + one = six slot readiness states; every partition closes; the result
 * equals the pinned six-slot baseline; and the six readiness states describe
 * exactly R36's committed six historical sample preparations (slots,
 * survivors, short text, exact / blocked caps, exact-cap documents, SET_R
 * full-rank exactness).
 */
export function requireHistoricalReadinessBaselineV4(
  committedR24Census: unknown,
  committedR30Census: unknown,
  committedR36Census: unknown,
): HistoricalReadinessBaselineV4 {
  for (const [path, expected] of Object.entries(R37_EXPECTED_R24_HISTORY)) {
    if (at(committedR24Census, path) !== expected) {
      historyDrift(`the committed R24 historical record ${path} differs`);
    }
  }
  for (const [path, expected] of Object.entries(R37_EXPECTED_R30_HISTORY)) {
    if (at(committedR30Census, path) !== expected) {
      historyDrift(`the committed R30 historical record ${path} differs`);
    }
  }
  const num = (record: unknown, path: string): number => {
    const value = at(record, path);
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      historyDrift(`the historical record ${path} is not a count`);
    }
    return value;
  };

  // [R24 section, R30 historical section, R30 delta section, R30 coverage section, fields]
  const groups: [string, string, string, string, readonly string[]][] = [
    ['setP', 'coverage.historical.setP', 'delta.setP', 'coverage.coverage.setP', SAMPLE_FIELDS],
    ['setR', 'coverage.historical.setR', 'delta.setR', 'coverage.coverage.setR', SAMPLE_FIELDS],
    [
      'crossSample',
      'coverage.historical.crossSample',
      'delta.crossSample',
      'coverage.coverage.crossSample',
      CROSS_FIELDS,
    ],
  ];
  for (const [r24Section, r30Historical, r30Delta, r30Coverage, fields] of groups) {
    for (const field of fields) {
      const total = num(committedR24Census, `${r24Section}.${field}`);
      const historical = num(committedR30Census, `${r30Historical}.${field}`);
      const delta = num(committedR30Census, `${r30Delta}.${field}`);
      const coverage = num(committedR30Census, `${r30Coverage}.${field}`);
      if (historical !== total || total + delta !== coverage) {
        historyDrift(`the R24 + R30 ${r24Section}.${field} arithmetic does not close`);
      }
    }
  }
  const r24Slots = num(committedR24Census, 'readiness.slotReadinessCount');
  const r30Delta = num(committedR30Census, 'delta.deltaReadinessSlots');
  const slots = num(committedR30Census, 'coverage.coverageReadinessSlots');
  if (
    num(committedR30Census, 'coverage.historicalCanonicalR24ReadinessSlots') !== r24Slots ||
    num(committedR30Census, 'coverage.newR30ReadinessSlots') !== r30Delta ||
    r24Slots + r30Delta !== slots
  ) {
    historyDrift('the R24 + R30 slot-readiness arithmetic does not close');
  }

  const sample = (section: string): ReadinessSampleAggregateV4 =>
    Object.freeze(
      Object.fromEntries(
        SAMPLE_FIELDS.map((field) => [field, num(committedR30Census, `${section}.${field}`)]),
      ) as unknown as ReadinessSampleAggregateV4,
    );
  const setP = sample('coverage.coverage.setP');
  const setR = sample('coverage.coverage.setR');
  const crossSample = Object.freeze(
    Object.fromEntries(
      CROSS_FIELDS.map((field) => [
        field,
        num(committedR30Census, `coverage.coverage.crossSample.${field}`),
      ]),
    ) as unknown as CrossSampleSd9AggregateV4,
  );

  const closed = { slotReadinessCount: slots, setP, setR, crossSample };
  for (const [path, expected] of Object.entries(R37_EXPECTED_SIX_SLOT_HISTORICAL_READINESS)) {
    if (at(closed, path) !== expected) {
      historyDrift(`the six-slot historical readiness ${path} differs`);
    }
  }
  for (const counts of [setP, setR]) {
    if (
      counts.reachableMembershipExactSlotCount + counts.reachableMembershipBlockedSlotCount !==
        slots ||
      counts.fullRankExactSlotCount + counts.fullRankShortTextBlockedSlotCount !== slots ||
      counts.sd9MechanicalSuccessfulSlotCount +
        counts.sd9MechanicalUnsuccessfulSlotCount +
        counts.sd9MechanicalPendingSlotCount !==
        slots ||
      counts.sd9MinEnvelopeTotal !== counts.measurableSurvivorCount ||
      counts.sd9MaxEnvelopeTotal !==
        counts.measurableSurvivorCount + counts.unresolvedShortTextOccurrenceCount
    ) {
      historyDrift('the six-slot readiness partition does not close');
    }
  }

  // §8: historical readiness slots = historical R36 preparation slots, and the
  // reachable memberships describe exactly R36's historical caps.
  const r36 = (path: string): number => num(committedR36Census, path);
  const sampleAgrees = (counts: ReadinessSampleAggregateV4, section: string): boolean =>
    counts.measurableSurvivorCount === r36(`${section}.measurableSurvivorCount`) &&
    counts.unresolvedShortTextOccurrenceCount ===
      r36(`${section}.unresolvedShortTextOccurrenceCount`) &&
    counts.reachableMembershipExactSlotCount === r36(`${section}.initialCapExactSlotCount`) &&
    counts.reachableMembershipBlockedSlotCount === r36(`${section}.initialCapBlockedSlotCount`) &&
    counts.reachableMembershipDocumentCountAcrossExactSlots ===
      r36(`${section}.exactCapDocumentCountAcrossExactSlots`);
  if (
    slots !== r36('coverage.historicalCanonicalSlotPreparations') ||
    !sampleAgrees(setP, 'coverage.historical.setP') ||
    !sampleAgrees(setR, 'coverage.historical.setR') ||
    setR.fullRankExactSlotCount !== r36('coverage.historical.setR.fullRankExactSlotCount') ||
    setR.fullRankShortTextBlockedSlotCount !==
      r36('coverage.historical.setR.fullRankShortTextBlockedSlotCount')
  ) {
    historyDrift('the historical readiness does not describe R36 historical sample coverage');
  }

  const baseline: HistoricalReadinessBaselineV4 = Object.freeze({
    r24SlotReadinessCount: r24Slots,
    r30NewSlotReadinessCount: r30Delta,
    slotReadinessCount: slots,
    setP,
    setR,
    crossSample,
  });
  HISTORICAL_READINESS_BASELINES.add(baseline);
  return baseline;
}

/** A baseline THIS module proved from the committed records, or a refusal. */
export function requireHistoricalReadinessBaselineProofV4(
  baseline: unknown,
): HistoricalReadinessBaselineV4 {
  if (
    typeof baseline !== 'object' ||
    baseline === null ||
    !HISTORICAL_READINESS_BASELINES.has(baseline)
  ) {
    refuseV4Readiness(
      'R37_HISTORICAL_READINESS_BASELINE_NOT_PROVED',
      'the historical readiness baseline was not proved from the committed R24 and R30 records',
    );
  }
  return baseline as HistoricalReadinessBaselineV4;
}

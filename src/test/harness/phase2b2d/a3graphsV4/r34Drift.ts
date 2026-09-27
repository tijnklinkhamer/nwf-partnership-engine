/**
 * PHASE 2B-2D — A3 R35: THE FRESH R34 REPRODUCTION GATE AND THE COMMITTED
 * R22 + R28 HISTORICAL GRAPH BASELINE.
 *
 * Neither is authority for the delta graphs. The authority is the fresh,
 * in-process R33 -> R34 mint; these only stop the slice when something moved
 * under it.
 *
 *   1. FRESH R34 REPRODUCTION. R34's document-source batch is private
 *      in-process authority (WeakSet / WeakMap provenance) and cannot be
 *      loaded from the committed census. A real R35 run therefore re-mints
 *      R33 and R34 in-process. The census canonical R34 derives from THAT
 *      batch (with R34's own derivation function) must equal the committed
 *      R34 census on every field except the one execution-provenance commit,
 *      and must state the R34 checkpoint pinned below. Only then is a
 *      reproduction proof minted - associated by object identity with that
 *      exact batch, so a copied, spread or deserialised proof is not one.
 *
 *   2. HISTORICAL R22 + R28 GRAPH BASELINE. The committed R22 and R28 public
 *      censuses are read as aggregate historical records only. They are NOT
 *      re-derived (that would need the old-six evidence read R33 avoids, the
 *      old-six reassembly R34 avoids and the old-six re-measurement R35
 *      exists to avoid), and they say nothing about the delta. Their
 *      arithmetic must close to six graph slots / 191 documents, and those
 *      must equal R34's own historical document-source coverage.
 *
 * THIS MODULE IS PURE apart from R34's pure census derivation. Its inputs
 * arrive already parsed; it reads no file. Differences are reported as field
 * PATHS, never values.
 */
import {
  deriveR34PublicIncrementalDocumentSourceCensus,
  type R34CensusProvenance,
  type R34PublicIncrementalDocumentSourceCensus,
} from '../a3documentsV4/census.js';
import { isA3DevTrainDocumentSourceDeltaBatchV4 } from '../a3documentsV4/devTrain.js';
import type {
  A3DevTrainDocumentSourceDeltaBatchV4,
  HistoricalDocumentSourceCoverageBaseline,
} from '../a3documentsV4/types.js';
import { refuseV4Graph } from './refusal.js';
import type { HistoricalGraphCoverageBaseline } from './types.js';

// ---------------------------------------------------------------------------
// A. THE FRESH R34 REPRODUCTION.
// ---------------------------------------------------------------------------

/**
 * The ONE committed R34 field a fresh reproduction may legitimately differ
 * on: the commit the reproducing process executed at. Every other field -
 * record, split, R33 provenance, R33 reproduction, delta assembly, extraction
 * support, R10 preparation, history, coverage, semantics, access, disclosure -
 * must match.
 */
export const R34_REPRODUCTION_EXCLUDED_FIELDS = Object.freeze(['implementationCommit'] as const);

/** The R34 checkpoint R35 was cut against. */
export const R35_EXPECTED_R34_CHECKPOINT = Object.freeze({
  record: 'PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
  split: 'DEV_TRAIN',
  'r33Reproduction.freshR33CensusEqualsCommitted': true,
  'deltaAssembly.deltaSlotAssemblyCount': 7,
  'deltaAssembly.deltaSourceRows': 198,
  'deltaAssembly.deltaSlotLocalDistinctDocuments': 197,
  'deltaAssembly.deltaExactDuplicateGroups': 1,
  'deltaAssembly.deltaExactDuplicateRowsRemoved': 1,
  'deltaAssembly.deltaMultiSourceDocuments': 1,
  'deltaAssembly.deltaCandidateObservations': 396,
  'deltaExtractionSupport.deltaSupportedExtractionRows': 198,
  'deltaExtractionSupport.deltaUnsupportedExtractionRows': 0,
  'deltaExtractionSupport.deltaMixedVersionDocuments': 0,
  'deltaExtractionSupport.deltaTextDivergenceGroups': 0,
  'deltaScorePreparation.deltaR10Preparations': 197,
  'deltaScorePreparation.deltaR10SourceRowCoverage': 198,
  'deltaScorePreparation.deltaR10CandidateObservationCoverage': 396,
  'historicalDocumentCoverage.historicalSlots': 6,
  'coverage.historicalCanonicalSlots': 6,
  'coverage.newR34Slots': 7,
  'coverage.coverageSlots': 13,
  'coverage.v4DevTrainAuthorityCoverage': 13,
  'coverage.historicalSlotLocalDocuments': 191,
  'coverage.coverageSourceRows': 393,
  'coverage.coverageSlotLocalDocuments': 388,
  'semantics.nearDuplicateGraphMeasured': false,
  'access.r34SqlStatements': 0,
  'access.upstreamReproducedR33OldAuthorityQueries': 0,
  'access.upstreamReproducedR33DeltaAuthorityQueries': 7,
  'access.databaseWrites': 0,
});

/** A proof that ONE minted R34 batch reproduced the committed R34 census. */
export interface R34ReproductionProof {
  readonly kind: 'R35_FRESH_R34_REPRODUCTION_PROOF';
  readonly comparedTopLevelFieldCount: number;
  readonly excludedFields: readonly string[];
  readonly differingPaths: readonly [];
  readonly deltaSlots: number;
  readonly deltaSlotLocalDocuments: number;
  readonly historicalDocumentSourceSlots: number;
  readonly historicalSlotLocalDocuments: number;
  readonly upstreamOldAuthorityQueries: number;
  readonly upstreamDeltaAuthorityQueries: number;
}

const REPRODUCTION_PROOF_BY_BATCH = new WeakMap<object, R34ReproductionProof>();

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

/** Resolves a dotted path whose LAST segment may itself contain dots or dashes. */
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
 * Field paths whose fresh value differs from the committed R34 census, over
 * every field except the excluded execution-provenance commit. Empty means
 * the fresh reproduction equals the committed record.
 */
export function r34ReproductionDriftPaths(
  fresh: R34PublicIncrementalDocumentSourceCensus,
  committed: unknown,
): readonly string[] {
  const freshRecord = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown>;
  const committedRecord = isPlainObject(committed)
    ? (JSON.parse(JSON.stringify(committed)) as Record<string, unknown>)
    : {};
  for (const field of R34_REPRODUCTION_EXCLUDED_FIELDS) {
    delete freshRecord[field];
    delete committedRecord[field];
  }
  const differing: string[] = [];
  differingPaths(freshRecord, committedRecord, '', differing);
  return Object.freeze(differing);
}

/**
 * §7. Derives the R34 census from the ACTUAL minted R34 batch (with R34's own
 * derivation function), requires it to equal the committed R34 census and the
 * pinned checkpoint, and only then mints a reproduction proof for that batch.
 * A batch is proved at most once.
 */
export function requireFreshR34Reproduction(
  batch: A3DevTrainDocumentSourceDeltaBatchV4,
  historicalDocumentBaseline: HistoricalDocumentSourceCoverageBaseline,
  provenance: R34CensusProvenance,
  committedR34Census: unknown,
): R34ReproductionProof {
  if (!isA3DevTrainDocumentSourceDeltaBatchV4(batch)) {
    refuseV4Graph(
      'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
      'the reproduction input is not a document-source delta batch minted by R34 in this process',
    );
  }
  if (REPRODUCTION_PROOF_BY_BATCH.has(batch)) {
    refuseV4Graph(
      'R35_R34_REPRODUCTION_ALREADY_PROVED',
      'this R34 batch already carries a reproduction proof',
    );
  }
  const fresh = deriveR34PublicIncrementalDocumentSourceCensus(
    batch,
    historicalDocumentBaseline,
    provenance,
  );
  const differing = r34ReproductionDriftPaths(fresh, committedR34Census);
  if (differing.length > 0) {
    refuseV4Graph(
      'STOP_R35_FRESH_R34_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
      `the fresh R34 census differs from the committed one at ${differing.join(', ')}`,
    );
  }
  for (const [path, expected] of Object.entries(R35_EXPECTED_R34_CHECKPOINT)) {
    if (at(fresh, path) !== expected) {
      refuseV4Graph(
        'STOP_R35_FRESH_R34_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
        `${path} no longer equals the R34 checkpoint`,
      );
    }
  }
  const proof: R34ReproductionProof = Object.freeze({
    kind: 'R35_FRESH_R34_REPRODUCTION_PROOF' as const,
    comparedTopLevelFieldCount: Object.keys(fresh).length - R34_REPRODUCTION_EXCLUDED_FIELDS.length,
    excludedFields: R34_REPRODUCTION_EXCLUDED_FIELDS,
    differingPaths: Object.freeze([]) as readonly [],
    deltaSlots: fresh.deltaAssembly.deltaSlotAssemblyCount,
    deltaSlotLocalDocuments: fresh.deltaAssembly.deltaSlotLocalDistinctDocuments,
    historicalDocumentSourceSlots: fresh.coverage.historicalCanonicalSlots,
    historicalSlotLocalDocuments: fresh.coverage.historicalSlotLocalDocuments,
    upstreamOldAuthorityQueries: fresh.access.upstreamReproducedR33OldAuthorityQueries,
    upstreamDeltaAuthorityQueries: fresh.access.upstreamReproducedR33DeltaAuthorityQueries,
  });
  REPRODUCTION_PROOF_BY_BATCH.set(batch, proof);
  return proof;
}

/** The reproduction proof minted for exactly this R34 batch, or `undefined`. */
export function r34ReproductionProofForBatch(batch: unknown): R34ReproductionProof | undefined {
  if (typeof batch !== 'object' || batch === null) return undefined;
  return REPRODUCTION_PROOF_BY_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. THE COMMITTED R22 + R28 HISTORICAL GRAPH BASELINE.
// ---------------------------------------------------------------------------

/** The canonical historical R22 aggregate baseline, as its committed census states it. */
export const R35_EXPECTED_R22_HISTORY = Object.freeze({
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

/** The canonical historical R28 aggregate record, as its committed census states it. */
export const R35_EXPECTED_R28_HISTORY = Object.freeze({
  record: 'PHASE_2B_2D_A3_R28_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1',
  split: 'DEV_TRAIN',
  'deltaGraph.deltaGraphSlots': 1,
  'deltaGraph.deltaDocuments': 35,
  'deltaGraph.deltaMeasurableDocuments': 35,
  'deltaGraph.deltaShortTextUnresolved': 0,
  'deltaGraph.deltaComparedPairs': 595,
  'deltaGraph.deltaNearDuplicateEdges': 1,
  'deltaGraph.deltaDocumentsInAtLeastOneNearDuplicateEdge': 2,
  'coverage.coverageGraphSlots': 6,
  'coverage.coverageDocuments': 191,
  'coverage.coverageMeasurableDocuments': 190,
  'coverage.coverageShortTextUnresolved': 1,
  'coverage.coverageComparedPairs': 2933,
  'coverage.coverageNearDuplicateEdges': 42,
  'coverage.coverageDocumentsInAtLeastOneNearDuplicateEdge': 21,
  'coverage.combinedPairCountIsSumOfPerSlotPairs': true,
  'coverage.documentsInEdgesDedupedAcrossOrganisations': false,
  'semantics.crossOrganisationPairsMeasured': false,
  'semantics.survivorSelectionPerformed': false,
  'semantics.shortTextResolved': false,
});

/** The committed R34 historical document-source coverage the graph history must equal. */
export const R35_EXPECTED_R34_HISTORICAL_DOCUMENT_COVERAGE = Object.freeze({
  record: 'PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
  'coverage.historicalCanonicalSlots': 6,
  'coverage.historicalSlotLocalDocuments': 191,
});

const HISTORICAL_GRAPH_BASELINES = new WeakSet<object>();

function historyDrift(message: string): never {
  refuseV4Graph('STOP_R35_HISTORICAL_R22_R28_GRAPH_BASELINE_DRIFT_REQUIRES_REVIEW', message);
}

/**
 * §8. The committed R22 and R28 records still state the canonical graph
 * history, and it closes: R28's historical = R22's totals, R28's coverage =
 * R22 + R28 delta on every aggregate, six graph slots, 191 documents - equal
 * to R34's committed historical document-source slots and documents.
 */
export function requireHistoricalGraphBaseline(
  committedR22Census: unknown,
  committedR28Census: unknown,
  committedR34Census: unknown,
): HistoricalGraphCoverageBaseline {
  for (const [path, expected] of Object.entries(R35_EXPECTED_R22_HISTORY)) {
    if (at(committedR22Census, path) !== expected) {
      historyDrift(`the committed R22 historical record ${path} differs`);
    }
  }
  for (const [path, expected] of Object.entries(R35_EXPECTED_R28_HISTORY)) {
    if (at(committedR28Census, path) !== expected) {
      historyDrift(`the committed R28 historical record ${path} differs`);
    }
  }
  for (const [path, expected] of Object.entries(R35_EXPECTED_R34_HISTORICAL_DOCUMENT_COVERAGE)) {
    if (at(committedR34Census, path) !== expected) {
      historyDrift(`the committed R34 historical document-source record ${path} differs`);
    }
  }
  const r22 = (path: string): number => at(committedR22Census, `measurement.${path}`) as number;
  const r28Delta = (path: string): number => at(committedR28Census, `deltaGraph.${path}`) as number;
  const r28 = (path: string): number => at(committedR28Census, `coverage.${path}`) as number;

  // [name, R22 total, R28 historical, R28 delta, R28 coverage]
  const closes: [string, number, number, number, number][] = [
    [
      'graph slots',
      r22('slotGraphCount'),
      r28('historicalCanonicalR22GraphSlots'),
      r28Delta('deltaGraphSlots'),
      r28('coverageGraphSlots'),
    ],
    [
      'documents',
      r22('exactDocumentCount'),
      r28('historicalDocuments'),
      r28Delta('deltaDocuments'),
      r28('coverageDocuments'),
    ],
    [
      'measurable documents',
      r22('measurableDocumentCount'),
      r28('historicalMeasurableDocuments'),
      r28Delta('deltaMeasurableDocuments'),
      r28('coverageMeasurableDocuments'),
    ],
    [
      'short-text unresolved',
      r22('shortTextUnresolvedCount'),
      r28('historicalShortTextUnresolved'),
      r28Delta('deltaShortTextUnresolved'),
      r28('coverageShortTextUnresolved'),
    ],
    [
      'compared pairs',
      r22('comparedPairCount'),
      r28('historicalComparedPairs'),
      r28Delta('deltaComparedPairs'),
      r28('coverageComparedPairs'),
    ],
    [
      'near-duplicate edges',
      r22('nearDuplicateEdgeCount'),
      r28('historicalNearDuplicateEdges'),
      r28Delta('deltaNearDuplicateEdges'),
      r28('coverageNearDuplicateEdges'),
    ],
    [
      'documents in an edge',
      r22('documentsInAtLeastOneNearDuplicateEdge'),
      r28('historicalDocumentsInAtLeastOneNearDuplicateEdge'),
      r28Delta('deltaDocumentsInAtLeastOneNearDuplicateEdge'),
      r28('coverageDocumentsInAtLeastOneNearDuplicateEdge'),
    ],
  ];
  for (const [name, total, historical, delta, coverage] of closes) {
    if (
      ![total, historical, delta, coverage].every(Number.isSafeInteger) ||
      historical !== total ||
      total + delta !== coverage
    ) {
      historyDrift(`the R22 + R28 ${name} arithmetic does not close`);
    }
  }
  if (
    r28('coverageMeasurableDocuments') + r28('coverageShortTextUnresolved') !==
    r28('coverageDocuments')
  ) {
    historyDrift('the R22 + R28 measurable / short-text partition does not close');
  }
  if (
    r28('coverageGraphSlots') !== at(committedR34Census, 'coverage.historicalCanonicalSlots') ||
    r28('coverageDocuments') !== at(committedR34Census, 'coverage.historicalSlotLocalDocuments')
  ) {
    historyDrift('the historical graph coverage is not R34 historical document-source coverage');
  }

  const baseline: HistoricalGraphCoverageBaseline = Object.freeze({
    r22GraphSlots: r22('slotGraphCount'),
    r28NewGraphSlots: r28Delta('deltaGraphSlots'),
    slotGraphs: r28('coverageGraphSlots'),
    documents: r28('coverageDocuments'),
    measurableDocuments: r28('coverageMeasurableDocuments'),
    shortTextUnresolved: r28('coverageShortTextUnresolved'),
    comparedPairs: r28('coverageComparedPairs'),
    nearDuplicateEdges: r28('coverageNearDuplicateEdges'),
    documentsInAtLeastOneEdge: r28('coverageDocumentsInAtLeastOneNearDuplicateEdge'),
  });
  HISTORICAL_GRAPH_BASELINES.add(baseline);
  return baseline;
}

/** A baseline THIS module proved from the committed records, or a refusal. */
export function requireHistoricalGraphBaselineProof(
  baseline: unknown,
): HistoricalGraphCoverageBaseline {
  if (
    typeof baseline !== 'object' ||
    baseline === null ||
    !HISTORICAL_GRAPH_BASELINES.has(baseline)
  ) {
    refuseV4Graph(
      'R35_HISTORICAL_GRAPH_BASELINE_NOT_PROVED',
      'the historical graph baseline was not proved from the committed R22 and R28 records',
    );
  }
  return baseline as HistoricalGraphCoverageBaseline;
}

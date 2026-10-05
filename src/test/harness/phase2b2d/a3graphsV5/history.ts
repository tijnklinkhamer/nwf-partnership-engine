/**
 * PHASE 2B-2D — A3 R41: THE COMMITTED R35 + R37 + R40 HISTORICAL GRAPH BASELINE.
 *
 * The thirteen V4 -> V5 UNCHANGED DEV_TRAIN authorities already have canonical
 * graph coverage (R22 5 + R28 1 + R35 7, as R35's committed census states)
 * and canonical downstream coverage (R37's thirteen readiness slots). R41
 * re-measures none of them. Before any measurement it proves, from the
 * committed aggregate records read as HISTORY ONLY:
 *
 *   R35  6 historical + 7 new = 13 graph slots, and every aggregate
 *        (documents, measurable, short text, compared pairs, edges, documents
 *        in an edge) closes historical + new = coverage, with measurable +
 *        short = documents; no historical graph re-measured or reminted, no
 *        cross-organisation pair, no short text resolved, no component, no
 *        survivor, no rank, no SD9;
 *   R37  6 historical + 7 new = 13 readiness slots;
 *   R40  13 historical document slots / 388 slot-local documents, and graph,
 *        sample and readiness coverage all still 13;
 *
 * and closes them against the FRESH R40 batch:
 *
 *   R35 graph slots = R37 readiness slots = R40 historical document, graph,
 *   sample and readiness coverage = the fresh R40 batch's own historical
 *   document coverage = the fresh R39 unchanged count; and R35 graph
 *   documents = R40 historical slot-local documents.
 *
 * No historical R35 graph, R36 sample or R37 readiness object is
 * reconstructed. The proof is branded in this process and bound by identity
 * to the exact R40 batch it was closed against; a copy is not one.
 *
 * THIS MODULE IS PURE. Its inputs arrive already parsed; it reads no file.
 */
import {
  evidenceDeltaBatchForDocumentSourceDeltaBatchV5,
  isA3DevTrainDocumentSourceDeltaBatchV5,
} from '../a3documentsV5/devTrain.js';
import { historicalDocumentCoverageProofForBatch } from '../a3documentsV5/history.js';
import type { A3DevTrainDocumentSourceDeltaBatchV5 } from '../a3documentsV5/types.js';
import { refuseV5Graph } from './refusal.js';
import { R41_GRAPH_SPLIT, type HistoricalV5GraphCoverageProof } from './types.js';

export const R35_CENSUS_RECORD = 'PHASE_2B_2D_A3_R35_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1';
export const R37_CENSUS_RECORD =
  'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1';
export const R40_CENSUS_RECORD =
  'PHASE_2B_2D_A3_R40_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1';

/** The canonical R35 aggregate history, as its committed census states it. */
export const R41_EXPECTED_R35_HISTORY: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], R35_CENSUS_RECORD],
    [['recordKind'], 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SD7_GRAPH_CENSUS'],
    [['split'], 'DEV_TRAIN'],
    [['coverage', 'historicalCanonicalGraphSlots'], 6],
    [['coverage', 'newR35GraphSlots'], 7],
    [['coverage', 'coverageGraphSlots'], 13],
    [['coverage', 'coverageDocuments'], 388],
    [['coverage', 'coverageMeasurableDocuments'], 380],
    [['coverage', 'coverageShortTextUnresolved'], 8],
    [['coverage', 'coverageComparedPairs'], 5582],
    [['coverage', 'coverageNearDuplicateEdges'], 58],
    [['coverage', 'coverageDocumentsInAtLeastOneNearDuplicateEdge'], 41],
    [['coverage', 'combinedPairCountIsSumOfPerSlotPairs'], true],
    [['coverage', 'documentsInEdgesDedupedAcrossOrganisations'], false],
    [['coverage', 'thirteenSlotGraphBatchMinted'], false],
    [['semantics', 'historicalR22R28GraphsRemeasured'], false],
    [['semantics', 'historicalGraphObjectsReminted'], false],
    [['semantics', 'deltaOnlyGraphMeasurement'], true],
    [['semantics', 'canonicalR22PureMeasurementUsed'], true],
    [['semantics', 'crossOrganisationPairsMeasured'], false],
    [['semantics', 'shortTextResolved'], false],
    [['semantics', 'componentsComputed'], false],
    [['semantics', 'survivorSelectionPerformed'], false],
    [['semantics', 'setPRanked'], false],
    [['semantics', 'setRRanked'], false],
    [['semantics', 'sd9Evaluated'], false],
  ] as const);

/** The canonical R37 aggregate history, as its committed census states it. */
export const R41_EXPECTED_R37_HISTORY: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], R37_CENSUS_RECORD],
    [['recordKind'], 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS'],
    [['split'], 'DEV_TRAIN'],
    [['coverage', 'historicalCanonicalReadinessSlots'], 6],
    [['coverage', 'newR37ReadinessSlots'], 7],
    [['coverage', 'coverageReadinessSlots'], 13],
    [['coverage', 'thirteenSlotReadinessBatchMinted'], false],
  ] as const);

/** The committed R40 historical document / downstream coverage the graph history must equal. */
export const R41_EXPECTED_R40_HISTORY: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], R40_CENSUS_RECORD],
    [['split'], 'DEV_TRAIN'],
    [['coverage', 'historicalDocumentSlots'], 13],
    [['coverage', 'historicalSlotLocalDocuments'], 388],
    [['coverage', 'historicalGraphCoverage'], 13],
    [['coverage', 'historicalSampleCoverage'], 13],
    [['coverage', 'historicalReadinessCoverage'], 13],
    [['coverage', 'graphCoverageAfterR40'], 13],
    [['coverage', 'sampleCoverageAfterR40'], 13],
    [['coverage', 'readinessCoverageAfterR40'], 13],
    [['historicalDocumentCoverage', 'r34DocumentSlots'], 13],
    [['historicalDocumentCoverage', 'r37ReadinessSlots'], 13],
    [['historicalDocumentCoverage', 'freshR39UnchangedAuthorities'], 13],
    [['semantics', 'nearDuplicateGraphMeasured'], false],
  ] as const);

/** R35's historical + new = coverage triples, by committed field name. */
const R35_CLOSING_TRIPLES: readonly (readonly [string, string, string])[] = Object.freeze([
  ['historicalCanonicalGraphSlots', 'newR35GraphSlots', 'coverageGraphSlots'],
  ['historicalDocuments', 'newDocuments', 'coverageDocuments'],
  ['historicalMeasurableDocuments', 'newMeasurableDocuments', 'coverageMeasurableDocuments'],
  ['historicalShortTextUnresolved', 'newShortTextUnresolved', 'coverageShortTextUnresolved'],
  ['historicalComparedPairs', 'newComparedPairs', 'coverageComparedPairs'],
  ['historicalNearDuplicateEdges', 'newNearDuplicateEdges', 'coverageNearDuplicateEdges'],
  [
    'historicalDocumentsInAtLeastOneNearDuplicateEdge',
    'newDocumentsInAtLeastOneNearDuplicateEdge',
    'coverageDocumentsInAtLeastOneNearDuplicateEdge',
  ],
]);

const HISTORY_PROOF_BY_BATCH = new WeakMap<object, HistoricalV5GraphCoverageProof>();

function historyDrift(message: string): never {
  refuseV5Graph('STOP_R41_HISTORICAL_R35_R37_GRAPH_BASELINE_DRIFT_REQUIRES_REVIEW', message);
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
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    historyDrift(`${path.join('.')} is not a non-negative integer count in the committed record`);
  }
  return value;
}

/**
 * §11 / §12 / §33. Proves the committed R35, R37 and R40 records still state
 * the canonical thirteen-slot graph and downstream history, and that it
 * closes against the fresh R40 batch's own historical coverage. Mints the
 * proof only after every equality closes.
 */
export function requireHistoricalV5GraphCoverage(
  records: { readonly r35: unknown; readonly r37: unknown; readonly r40: unknown },
  documentDeltaBatch: A3DevTrainDocumentSourceDeltaBatchV5,
): HistoricalV5GraphCoverageProof {
  const batch: unknown = documentDeltaBatch;
  if (!isA3DevTrainDocumentSourceDeltaBatchV5(batch)) {
    refuseV5Graph(
      'R41_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R40',
      'the historical graph baseline must be closed against a batch minted by R40',
    );
  }
  const { r35, r37, r40 } = records;
  for (const [path, expected] of R41_EXPECTED_R35_HISTORY) {
    if (at(r35, path) !== expected) historyDrift(`R35 ${path.join('.')} differs`);
  }
  for (const [path, expected] of R41_EXPECTED_R37_HISTORY) {
    if (at(r37, path) !== expected) historyDrift(`R37 ${path.join('.')} differs`);
  }
  for (const [path, expected] of R41_EXPECTED_R40_HISTORY) {
    if (at(r40, path) !== expected) historyDrift(`R40 ${path.join('.')} differs`);
  }
  for (const [historical, added, coverage] of R35_CLOSING_TRIPLES) {
    if (
      count(r35, 'coverage', historical) + count(r35, 'coverage', added) !==
      count(r35, 'coverage', coverage)
    ) {
      historyDrift(`R35 ${coverage} arithmetic does not close`);
    }
  }
  const graphSlots = count(r35, 'coverage', 'coverageGraphSlots');
  const documents = count(r35, 'coverage', 'coverageDocuments');
  const measurable = count(r35, 'coverage', 'coverageMeasurableDocuments');
  const shortText = count(r35, 'coverage', 'coverageShortTextUnresolved');
  if (measurable + shortText !== documents) {
    historyDrift('R35 measurable / short-text partition does not close');
  }
  if (
    count(r37, 'coverage', 'historicalCanonicalReadinessSlots') +
      count(r37, 'coverage', 'newR37ReadinessSlots') !==
    count(r37, 'coverage', 'coverageReadinessSlots')
  ) {
    historyDrift('R37 readiness-slot arithmetic does not close');
  }

  const readinessSlots = count(r37, 'coverage', 'coverageReadinessSlots');
  const r40DocumentSlots = count(r40, 'coverage', 'historicalDocumentSlots');
  const r40Documents = count(r40, 'coverage', 'historicalSlotLocalDocuments');
  const r40Graph = count(r40, 'coverage', 'historicalGraphCoverage');
  const r40Sample = count(r40, 'coverage', 'historicalSampleCoverage');
  const r40Readiness = count(r40, 'coverage', 'historicalReadinessCoverage');
  if (
    graphSlots !== readinessSlots ||
    graphSlots !== r40DocumentSlots ||
    graphSlots !== r40Graph ||
    graphSlots !== r40Sample ||
    graphSlots !== r40Readiness ||
    documents !== r40Documents
  ) {
    historyDrift('R35 graph coverage, R37 readiness coverage and R40 historical coverage disagree');
  }

  // Closed against the FRESH R40 batch's own historical coverage, via R40 / R39 provenance.
  const evidenceBatch = evidenceDeltaBatchForDocumentSourceDeltaBatchV5(batch);
  const freshDocumentHistory = historicalDocumentCoverageProofForBatch(evidenceBatch);
  if (
    evidenceBatch === undefined ||
    freshDocumentHistory === undefined ||
    batch.split !== R41_GRAPH_SPLIT ||
    freshDocumentHistory.documentSlotCount !== graphSlots ||
    freshDocumentHistory.slotLocalDocuments !== documents ||
    freshDocumentHistory.r37ReadinessSlotCount !== readinessSlots ||
    evidenceBatch.coverage.unchangedCanonicalCoverageCount !== graphSlots ||
    evidenceBatch.coverage.historicalCanonicalReadinessCoverageCount !== graphSlots
  ) {
    historyDrift('the committed graph history does not close against the fresh R40 batch');
  }

  const proof: HistoricalV5GraphCoverageProof = Object.freeze({
    kind: 'HISTORICAL_V5_GRAPH_COVERAGE_PROOF' as const,
    r35HistoricalGraphSlotsBeforeR35: count(r35, 'coverage', 'historicalCanonicalGraphSlots'),
    r35NewGraphSlots: count(r35, 'coverage', 'newR35GraphSlots'),
    graphSlots,
    documents,
    measurableDocuments: measurable,
    shortTextUnresolved: shortText,
    comparedPairs: count(r35, 'coverage', 'coverageComparedPairs'),
    nearDuplicateEdges: count(r35, 'coverage', 'coverageNearDuplicateEdges'),
    documentsInAtLeastOneEdge: count(
      r35,
      'coverage',
      'coverageDocumentsInAtLeastOneNearDuplicateEdge',
    ),
    r37ReadinessSlots: readinessSlots,
    r40HistoricalDocumentSlots: r40DocumentSlots,
    r40HistoricalSlotLocalDocuments: r40Documents,
    r40HistoricalGraphCoverage: r40Graph,
    r40HistoricalSampleCoverage: r40Sample,
    r40HistoricalReadinessCoverage: r40Readiness,
  });
  HISTORY_PROOF_BY_BATCH.set(batch, proof);
  return proof;
}

/** The historical graph proof closed against exactly this R40 batch, or `undefined`. */
export function historicalGraphCoverageProofForBatch(
  batch: unknown,
): HistoricalV5GraphCoverageProof | undefined {
  if (typeof batch !== 'object' || batch === null) return undefined;
  return HISTORY_PROOF_BY_BATCH.get(batch);
}

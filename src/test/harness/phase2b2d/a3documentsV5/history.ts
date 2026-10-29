/**
 * PHASE 2B-2D — A3 R40: THE COMMITTED R34 + R37 HISTORICAL DOCUMENT BASELINE.
 *
 * The thirteen V4 -> V5 UNCHANGED DEV_TRAIN authorities already have canonical
 * document coverage (R21 5 + R27 1 + R34 7, as R34's committed census states)
 * and canonical downstream coverage (R37's thirteen readiness slots, each of
 * which consumed one canonical R35 graph and one R36 sample). R40 reassembles
 * none of them. Before any assembly it proves, from the committed aggregate
 * records read as HISTORY ONLY:
 *
 *   R34  6 historical + 7 new = 13 document slots, and every aggregate
 *        (rows, slot-local documents, exact-duplicate groups / rows removed,
 *        multi-source documents, candidate observations, R10 coverage) closes
 *        historical + new = coverage; no slot reassembled or reminted, no
 *        cross-organisation dedupe, no graph measured;
 *   R37  6 historical + 7 new = 13 readiness slots, nothing recomputed;
 *
 * and closes them against the FRESH R39 batch:
 *
 *   R34 document slots = R37 readiness slots = R39 unchanged count = R39
 *   historical evidence and readiness coverage = V4 DEV_TRAIN READY.
 *
 * No historical document object is reconstructed. The proof is branded in
 * this process and bound by identity to the exact R39 batch it was closed
 * against; a copy is not one.
 *
 * THIS MODULE IS PURE. Its inputs arrive already parsed; it reads no file.
 */
import { isA3DevTrainDurableEvidenceDeltaBatchV5 } from '../a3evidenceV5/devTrain.js';
import type { A3DevTrainDurableEvidenceDeltaBatchV5 } from '../a3evidenceV5/types.js';
import { refuseV5Document } from './refusal.js';
import { R40_DOCUMENT_SPLIT, type HistoricalV5DocumentCoverageProof } from './types.js';

export const R34_CENSUS_RECORD =
  'PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1';
export const R37_CENSUS_RECORD =
  'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1';

/** The canonical R34 aggregate history, as its committed census states it. */
export const R40_EXPECTED_R34_HISTORY: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], R34_CENSUS_RECORD],
    [['recordKind'], 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS'],
    [['split'], 'DEV_TRAIN'],
    [['coverage', 'historicalCanonicalSlots'], 6],
    [['coverage', 'newR34Slots'], 7],
    [['coverage', 'coverageSlots'], 13],
    [['coverage', 'v4DevTrainAuthorityCoverage'], 13],
    [['coverage', 'coverageSourceRows'], 393],
    [['coverage', 'coverageSlotLocalDocuments'], 388],
    [['coverage', 'coverageExactDuplicateGroups'], 4],
    [['coverage', 'coverageExactDuplicateRowsRemoved'], 5],
    [['coverage', 'coverageMultiSourceDocuments'], 4],
    [['coverage', 'coverageCandidateObservations'], 786],
    [['coverage', 'coverageR10Preparations'], 388],
    [['coverage', 'coverageR10SourceRows'], 393],
    [['coverage', 'coverageR10CandidateObservations'], 786],
    [['coverage', 'thirteenSlotDocumentBatchMinted'], false],
    [['deltaExtractionSupport', 'deltaUnsupportedExtractionRows'], 0],
    [['deltaExtractionSupport', 'deltaMixedVersionDocuments'], 0],
    [['deltaExtractionSupport', 'deltaTextDivergenceGroups'], 0],
    [['semantics', 'historicalSlotsReassembled'], false],
    [['semantics', 'historicalDocumentObjectsReminted'], false],
    [['semantics', 'crossOrganisationExactDedupePerformed'], false],
    [['semantics', 'nearDuplicateGraphMeasured'], false],
  ] as const);

/** The canonical R37 aggregate history, as its committed census states it. */
export const R40_EXPECTED_R37_HISTORY: readonly (readonly [readonly string[], unknown])[] =
  Object.freeze([
    [['record'], R37_CENSUS_RECORD],
    [['recordKind'], 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS'],
    [['split'], 'DEV_TRAIN'],
    [['coverage', 'historicalCanonicalReadinessSlots'], 6],
    [['coverage', 'newR37ReadinessSlots'], 7],
    [['coverage', 'coverageReadinessSlots'], 13],
    [['delta', 'deltaReadinessSlots'], 7],
    [['semantics', 'historicalR24R30StatesRecomputed'], false],
    [['semantics', 'historicalReadinessObjectsReminted'], false],
  ] as const);

/** R34's historical + new = coverage pairs, by committed field name. */
const R34_CLOSING_TRIPLES: readonly (readonly [string, string, string])[] = Object.freeze([
  ['historicalCanonicalSlots', 'newR34Slots', 'coverageSlots'],
  ['historicalSourceRows', 'newSourceRows', 'coverageSourceRows'],
  ['historicalSlotLocalDocuments', 'newSlotLocalDocuments', 'coverageSlotLocalDocuments'],
  ['historicalExactDuplicateGroups', 'newExactDuplicateGroups', 'coverageExactDuplicateGroups'],
  [
    'historicalExactDuplicateRowsRemoved',
    'newExactDuplicateRowsRemoved',
    'coverageExactDuplicateRowsRemoved',
  ],
  ['historicalMultiSourceDocuments', 'newMultiSourceDocuments', 'coverageMultiSourceDocuments'],
  ['historicalCandidateObservations', 'newCandidateObservations', 'coverageCandidateObservations'],
  ['historicalR10Preparations', 'newR10Preparations', 'coverageR10Preparations'],
  ['historicalR10SourceRows', 'newR10SourceRows', 'coverageR10SourceRows'],
  [
    'historicalR10CandidateObservations',
    'newR10CandidateObservations',
    'coverageR10CandidateObservations',
  ],
]);

const HISTORY_PROOF_BY_BATCH = new WeakMap<object, HistoricalV5DocumentCoverageProof>();

function historyDrift(message: string): never {
  refuseV5Document('STOP_R40_HISTORICAL_R34_R37_BASELINE_DRIFT_REQUIRES_REVIEW', message);
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
 * §10 / §11. Proves the committed R34 and R37 records still state the
 * canonical thirteen-slot document and downstream history, and that it closes
 * against the fresh R39 batch's own historical coverage.
 */
export function requireHistoricalV5DocumentCoverage(
  records: { readonly r34: unknown; readonly r37: unknown },
  evidenceDeltaBatch: A3DevTrainDurableEvidenceDeltaBatchV5,
): HistoricalV5DocumentCoverageProof {
  if (!isA3DevTrainDurableEvidenceDeltaBatchV5(evidenceDeltaBatch)) {
    refuseV5Document(
      'R40_EVIDENCE_DELTA_NOT_MINTED_BY_R39',
      'the historical baseline must be closed against a delta batch minted by R39',
    );
  }
  const { r34, r37 } = records;
  for (const [path, expected] of R40_EXPECTED_R34_HISTORY) {
    if (at(r34, path) !== expected) historyDrift(`R34 ${path.join('.')} differs`);
  }
  for (const [path, expected] of R40_EXPECTED_R37_HISTORY) {
    if (at(r37, path) !== expected) historyDrift(`R37 ${path.join('.')} differs`);
  }
  for (const [historical, added, coverage] of R34_CLOSING_TRIPLES) {
    if (
      count(r34, 'coverage', historical) + count(r34, 'coverage', added) !==
      count(r34, 'coverage', coverage)
    ) {
      historyDrift(`R34 ${coverage} arithmetic does not close`);
    }
  }
  if (
    count(r37, 'coverage', 'historicalCanonicalReadinessSlots') +
      count(r37, 'coverage', 'newR37ReadinessSlots') !==
    count(r37, 'coverage', 'coverageReadinessSlots')
  ) {
    historyDrift('R37 readiness-slot arithmetic does not close');
  }

  const documentSlots = count(r34, 'coverage', 'coverageSlots');
  const readinessSlots = count(r37, 'coverage', 'coverageReadinessSlots');
  const coverage = evidenceDeltaBatch.coverage;
  if (
    evidenceDeltaBatch.split !== R40_DOCUMENT_SPLIT ||
    documentSlots !== readinessSlots ||
    documentSlots !== coverage.unchangedCanonicalCoverageCount ||
    documentSlots !== coverage.historicalCanonicalEvidenceCoverageCount ||
    documentSlots !== coverage.historicalCanonicalReadinessCoverageCount ||
    documentSlots !== coverage.downstreamReadinessCoverageCountAfterR39 ||
    documentSlots !== coverage.v4DevTrainReadyCount ||
    count(r34, 'coverage', 'v4DevTrainAuthorityCoverage') !== documentSlots
  ) {
    historyDrift(
      'R34 document slots, R37 readiness slots and the fresh R39 unchanged coverage disagree',
    );
  }

  const proof: HistoricalV5DocumentCoverageProof = Object.freeze({
    kind: 'HISTORICAL_V5_DOCUMENT_COVERAGE_PROOF' as const,
    r34HistoricalSlotsBeforeR34: count(r34, 'coverage', 'historicalCanonicalSlots'),
    r34NewSlots: count(r34, 'coverage', 'newR34Slots'),
    documentSlotCount: documentSlots,
    sourceRows: count(r34, 'coverage', 'coverageSourceRows'),
    slotLocalDocuments: count(r34, 'coverage', 'coverageSlotLocalDocuments'),
    exactDuplicateGroups: count(r34, 'coverage', 'coverageExactDuplicateGroups'),
    exactDuplicateRowsRemoved: count(r34, 'coverage', 'coverageExactDuplicateRowsRemoved'),
    multiSourceDocuments: count(r34, 'coverage', 'coverageMultiSourceDocuments'),
    candidateObservations: count(r34, 'coverage', 'coverageCandidateObservations'),
    r10Preparations: count(r34, 'coverage', 'coverageR10Preparations'),
    r10SourceRows: count(r34, 'coverage', 'coverageR10SourceRows'),
    r10CandidateObservations: count(r34, 'coverage', 'coverageR10CandidateObservations'),
    r37ReadinessSlotCount: readinessSlots,
    freshR39UnchangedCount: coverage.unchangedCanonicalCoverageCount,
  });
  HISTORY_PROOF_BY_BATCH.set(evidenceDeltaBatch, proof);
  return proof;
}

/** The historical proof closed against exactly this R39 batch, or `undefined`. */
export function historicalDocumentCoverageProofForBatch(
  batch: unknown,
): HistoricalV5DocumentCoverageProof | undefined {
  if (typeof batch !== 'object' || batch === null) return undefined;
  return HISTORY_PROOF_BY_BATCH.get(batch);
}

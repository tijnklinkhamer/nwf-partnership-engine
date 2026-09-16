/**
 * PHASE 2B-2D2C-F0X — ONE SCORED REPLICATE, UNDER THE PARTIAL-REPLICATE
 * CLARIFICATION.
 *
 * Turns one loaded replicate into exactly 49 item results in corpus order:
 *
 *   - a VALIDATED evaluation's items are scored by the SAME
 *     `scoreEvaluation` the attempt-1..4 scorers use (post-repair);
 *   - an INVALID non-terminal evaluation's items become scored rows with no
 *     prediction and validator state REJECTED, through the SAME
 *     `goldFieldsOf` loop, so they are strict-incorrect exactly as a
 *     validator-rejected item is;
 *   - a terminal stopped or unstarted evaluation's items are
 *     `NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE` with no scored row at all.
 *
 * Only a COMPLETE replicate with 49 scored rows gets a gate vector, computed
 * by the unchanged `semanticMetricsOf`. A partial replicate's gate vector is
 * the NOT_AVAILABLE marker, and `gateVectorOf` refuses to compute one for it.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 */
import type { GoldAvailability } from './gold.js';
import {
  ITEMS_PER_REPLICATE,
  NOT_AVAILABLE_INCOMPLETE_REPLICATE,
  NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE,
  type ItemResult,
  type ReplicateDevGateOutcome,
  type ReplicateStatus,
} from './replicationContract.js';
import type {
  InvalidEvaluation,
  LoadedReplicate,
  ReplicateTerminalCondition,
} from './replicationSources.js';
import {
  corpusIndexOf,
  goldFieldsOf,
  scoreEvaluation,
  ScoringError,
  type CorpusIndex,
  type PreservedGold,
  type ScoredItem,
} from './score.js';
import type { GoldCorpusItem } from '../../../../orgunits/classify/evaluation/goldSchema.js';
import { semanticMetricsOf, type VariantSemanticMetrics } from './summarise.js';
import type { StudySlotIdentity } from '../f0v/studyPlanCore.js';

function fail(message: string): never {
  throw new ScoringError(message);
}

export const INVALID_REJECTION_CATEGORY = 'INVALID_NON_TERMINAL_PROVIDER_FAILURE';

export interface ReplicateItem {
  readonly goldId: string;
  readonly result: ItemResult;
  /** The UNIT_PAGE result's unit type; null for every other result. */
  readonly unitType: string | null;
  /** Null exactly when the item was not observed. */
  readonly scored: ScoredItem | null;
  readonly firstPassAccepted: boolean | null;
  readonly postRepairAccepted: boolean | null;
  readonly repairTriggered: boolean | null;
}

export type ReplicateGateVector =
  | {
      readonly kind: 'NUMERIC';
      readonly metrics: VariantSemanticMetrics;
      readonly devGateOutcome: Exclude<
        ReplicateDevGateOutcome,
        typeof NOT_AVAILABLE_INCOMPLETE_REPLICATE
      >;
    }
  | { readonly kind: typeof NOT_AVAILABLE_INCOMPLETE_REPLICATE };

export interface ScoredReplicate {
  readonly slot: StudySlotIdentity;
  readonly replicateStatus: ReplicateStatus;
  readonly terminalCondition: ReplicateTerminalCondition;
  /** Exactly 49, in corpus order. */
  readonly items: readonly ReplicateItem[];
  readonly gateVector: ReplicateGateVector;
}

/** One INVALID item: a scored row with no prediction, strict-incorrect on every gold field. */
export function scoreInvalidItem(
  invalid: InvalidEvaluation,
  position: number,
  corpusByGoldId: CorpusIndex,
  availability: GoldAvailability,
  preserved: PreservedGold,
): ScoredItem {
  const goldId = invalid.orderedGoldIds[position];
  const docIndex = invalid.orderedDocIndices[position];
  if (goldId === undefined || docIndex === undefined) {
    fail(`${invalid.attemptDirectory}: no item at position ${position}.`);
  }
  const corpusEntry = corpusByGoldId.get(goldId);
  if (corpusEntry === undefined)
    fail(`gold id ${goldId} is not a DEVELOPMENT canonical corpus row.`);
  if (corpusEntry.row.docIndex !== docIndex) {
    fail(
      `gold id ${goldId}: docIndex ${docIndex} differs from the corpus row's ${corpusEntry.row.docIndex}.`,
    );
  }
  return {
    goldId,
    corpusLineNumber: corpusEntry.line,
    docIndex,
    echeRowKey: invalid.echeRowKey,
    organisationId: invalid.organisationId,
    logicalBatchOrdinal: invalid.logicalBatchOrdinal,
    positionWithinBatch: position,
    sequence: invalid.sequence,
    variantName: invalid.variantName,
    promptVersion: invalid.promptVersion,
    promptSha256: invalid.promptSha256,
    variantGitCommit: invalid.variantGitCommit,
    finalInputSha256: invalid.finalInputSha256,
    rawOutputSha256: null,
    validationResultSha256: '',
    finalRecordSha256: invalid.artifactFileSha256['FINAL_RECORD'] ?? '',
    validatorState: 'REJECTED',
    rejectionCategory: INVALID_REJECTION_CATEGORY,
    rejectionReason: `${invalid.providerOutcome}: ${invalid.providerOutcomeDetail ?? '(no detail recorded)'}`,
    prediction: null,
    ...goldFieldsOf(goldId, null, availability, preserved),
  };
}

/** The item result a scored row carries. Never called for an unobserved item. */
export function itemResultOf(row: ScoredItem): ItemResult {
  if (row.prediction !== null) {
    if (row.validatorState !== 'ACCEPTED') fail(`${row.goldId}: a prediction on a rejected row.`);
    return row.prediction.verdict;
  }
  if (row.validatorState !== 'REJECTED') fail(`${row.goldId}: an accepted row with no prediction.`);
  return row.rejectionCategory === INVALID_REJECTION_CATEGORY
    ? 'INVALID_NON_TERMINAL_PROVIDER_FAILURE'
    : 'VALIDATOR_REJECTED_POST_REPAIR';
}

function observedItem(row: ScoredItem): ReplicateItem {
  const result = itemResultOf(row);
  const invalid = result === 'INVALID_NON_TERMINAL_PROVIDER_FAILURE';
  return {
    goldId: row.goldId,
    result,
    unitType: result === 'UNIT_PAGE' ? (row.prediction?.unit_type ?? null) : null,
    scored: row,
    firstPassAccepted: invalid
      ? false
      : row.firstPass === undefined
        ? row.validatorState === 'ACCEPTED'
        : false,
    postRepairAccepted: row.validatorState === 'ACCEPTED',
    repairTriggered: invalid ? false : row.firstPass !== undefined,
  };
}

/**
 * The frozen gate vector of a COMPLETE replicate. Refuses a partial replicate
 * and a complete one missing any of the 49 scored rows.
 */
export function gateVectorOf(
  status: ReplicateStatus,
  slot: StudySlotIdentity,
  rows: readonly ScoredItem[],
  corpusRows: readonly GoldCorpusItem[],
  gates: Readonly<Record<string, number>>,
): Extract<ReplicateGateVector, { kind: 'NUMERIC' }> {
  if (status !== 'COMPLETE') {
    fail(
      `${slot.slotId} is ${status}; a full-run gate vector exists only for a COMPLETE replicate.`,
    );
  }
  const ids = new Set(rows.map((row) => row.goldId));
  if (
    rows.length !== ITEMS_PER_REPLICATE ||
    ids.size !== ITEMS_PER_REPLICATE ||
    corpusRows.some((row) => !ids.has(row.goldId))
  ) {
    fail(
      `${slot.slotId}: a complete replicate needs all ${ITEMS_PER_REPLICATE} item verdicts; it has ${ids.size}.`,
    );
  }
  const metrics = semanticMetricsOf(slot.variantName, rows, gates);
  const failed = metrics.gates.filter((g) => g.met === false).length;
  const unmeasured = metrics.gates.filter((g) => g.met === null).length;
  return {
    kind: 'NUMERIC',
    metrics,
    devGateOutcome:
      failed === 0 && unmeasured === 0 && metrics.gates.length > 0
        ? 'FROZEN_GATES_PASSED_ON_DEV'
        : 'FROZEN_GATES_FAILED_ON_DEV',
  };
}

export function scoreReplicate(
  replicate: LoadedReplicate,
  corpusRows: readonly GoldCorpusItem[],
  availability: GoldAvailability,
  preserved: PreservedGold,
  gates: Readonly<Record<string, number>>,
): ScoredReplicate {
  const corpusByGoldId = corpusIndexOf(corpusRows);
  if (corpusByGoldId.size !== ITEMS_PER_REPLICATE)
    fail(`the corpus holds ${corpusByGoldId.size} items.`);
  const rowsByGoldId = new Map<string, ScoredItem>();
  const unobserved = new Set<string>();
  const claim = (goldId: string): void => {
    if (rowsByGoldId.has(goldId) || unobserved.has(goldId)) {
      fail(`${replicate.slot.slotId}: gold id ${goldId} appears in two evaluations.`);
    }
  };
  for (const entry of replicate.evaluations) {
    switch (entry.state) {
      case 'VALIDATED':
        for (const row of scoreEvaluation(
          entry.evaluation,
          corpusByGoldId,
          availability,
          preserved,
        )) {
          claim(row.goldId);
          rowsByGoldId.set(row.goldId, row);
        }
        break;
      case 'INVALID_NON_TERMINAL_PROVIDER_FAILURE':
        entry.invalid.orderedGoldIds.forEach((goldId, position) => {
          claim(goldId);
          rowsByGoldId.set(
            goldId,
            scoreInvalidItem(entry.invalid, position, corpusByGoldId, availability, preserved),
          );
        });
        break;
      case 'TERMINAL_STOPPED':
      case 'NOT_STARTED':
        if (replicate.replicateStatus !== 'TERMINAL_FAILURE_PARTIAL') {
          fail(
            `${replicate.slot.slotId}: a ${entry.state} evaluation inside a ${replicate.replicateStatus} replicate.`,
          );
        }
        for (const goldId of entry.planned.orderedGoldIds) {
          claim(goldId);
          unobserved.add(goldId);
        }
        break;
    }
  }
  const items: ReplicateItem[] = corpusRows.map((corpusRow) => {
    const row = rowsByGoldId.get(corpusRow.goldId);
    if (row !== undefined) return observedItem(row);
    if (!unobserved.has(corpusRow.goldId)) {
      fail(
        `${replicate.slot.slotId}: gold id ${corpusRow.goldId} has neither an observed result nor a terminal non-observation.`,
      );
    }
    return {
      goldId: corpusRow.goldId,
      result: NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE,
      unitType: null,
      scored: null,
      firstPassAccepted: null,
      postRepairAccepted: null,
      repairTriggered: null,
    };
  });
  if (rowsByGoldId.size + unobserved.size !== ITEMS_PER_REPLICATE) {
    fail(
      `${replicate.slot.slotId}: the replicate covers ${rowsByGoldId.size + unobserved.size} items, not ${ITEMS_PER_REPLICATE}.`,
    );
  }
  const gateVector: ReplicateGateVector =
    replicate.replicateStatus === 'COMPLETE'
      ? gateVectorOf('COMPLETE', replicate.slot, [...rowsByGoldId.values()], corpusRows, gates)
      : { kind: NOT_AVAILABLE_INCOMPLETE_REPLICATE };
  return {
    slot: replicate.slot,
    replicateStatus: replicate.replicateStatus,
    terminalCondition: replicate.terminalCondition,
    items,
    gateVector,
  };
}

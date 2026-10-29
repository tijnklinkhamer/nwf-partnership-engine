/**
 * PHASE 2B-2D2C-F2 — THE DETERMINISTIC SCORER FOR A RUN EXECUTED UNDER
 * `RELIABILITY_SEMANTICS_V2_TIMEOUT_CONTINUATION`.
 *
 * THIS IS A SEPARATE SCORER, NOT A WIDENING OF THE HISTORICAL ONE. The
 * Recovery-1 scorer (`scoring/replicationSources.ts` →
 * `scoring/replicationScore.ts`) is a v1 READER: it declares
 * `RELIABILITY_SEMANTICS_V1_HISTORICAL` to
 * `assertScorerReliabilitySemantics`, and therefore correctly REFUSES
 * evidence that names v2. That guard is not weakened here, and no v2
 * interpretation is retrofitted into it. The two readers cannot
 * cross-consume, by design: a v1 reader throws on a manifest naming v2, and
 * this reader throws on the absent field that MEANS v1.
 *
 * WHAT IS IDENTICAL TO THE HISTORICAL SCORER, AND MUST STAY IDENTICAL
 *
 *   the DEV gold; the six frozen gate definitions and their thresholds (read
 *   from the freeze, never hard-coded here); the item taxonomy for observed
 *   semantic verdicts; the hard-negative set; the NEEDS_REVIEW cap; and the
 *   validator interpretation — all of which arrive through the UNCHANGED
 *   `scoreEvaluation`, `goldFieldsOf` and `semanticMetricsOf`.
 *
 * WHAT DIFFERS, AND ONLY THIS
 *
 *   the already-approved reliability OBSERVATION semantics:
 *
 *     1. a validated semantic result            -> the normal observed verdict;
 *     2. STRUCTURED_OUTPUT_FAILED_NON_TERMINAL  -> observed
 *        INVALID_NON_TERMINAL_PROVIDER_FAILURE, exactly as historically;
 *     3. PROVIDER_TIMEOUT_NON_TERMINAL          -> observed
 *        INVALID_PROVIDER_TIMEOUT for EVERY item in that logical batch;
 *     4. a terminal liveness / control-plane stop -> later unattempted items
 *        stay NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE;
 *     5. a replicate may be COMPLETE while holding one or more observed
 *        provider-failure INVALID batches;
 *     6. scoring never silently shrinks the planned 49-item denominator;
 *     7. a semantics-version mismatch fails closed.
 *
 * THE DENOMINATOR IS THE POINT. Under v1 a confirmed TIMEOUT ended the
 * replicate, so its items and every later batch's items were UNOBSERVED.
 * Under v2 that evaluation closes durably and its own items become
 * observed-INVALID. The denominator's SIZE is unchanged at 49; its
 * COMPOSITION is not — which is exactly why the two readers must never pool.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 * Scores nothing by itself: it is handed already-loaded replicate structures.
 */
import type { GoldCorpusItem } from '../../../../orgunits/classify/evaluation/goldSchema.js';
import { MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE, RELIABILITY_SEMANTICS_V2 } from '../constants.js';
import type { GoldAvailability } from '../scoring/gold.js';
import {
  ITEMS_PER_REPLICATE,
  NOT_AVAILABLE_INCOMPLETE_REPLICATE,
  NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE,
  type ItemResult,
  type ReplicateDevGateOutcome,
  type ReplicateStatus,
} from '../scoring/replicationContract.js';
import {
  INVALID_REJECTION_CATEGORY,
  scoreInvalidItem,
  type ReplicateGateVector,
} from '../scoring/replicationScore.js';
import type {
  InvalidEvaluation,
  ReplicateTerminalCondition,
  TerminalEvaluation,
} from '../scoring/replicationSources.js';
import type {
  LoadedEvaluation,
  PlannedEvaluationIdentity,
  ScoredVariantName,
} from '../scoring/sources.js';
import { ReliabilitySemanticsMismatchError, V2_CONTRACT } from '../scoring/reliabilitySemantics.js';
import {
  corpusIndexOf,
  scoreEvaluation,
  ScoringError,
  type PreservedGold,
  type ScoredItem,
} from '../scoring/score.js';
import { semanticMetricsOf, type VariantSemanticMetrics } from '../scoring/summarise.js';

function fail(message: string): never {
  throw new ScoringError(message);
}

/**
 * The rejection category a timed-out batch's items carry. It is deliberately
 * NOT `INVALID_NON_TERMINAL_PROVIDER_FAILURE`: both are observed INVALIDs and
 * both count in the denominator, but conflating them would make a host stall
 * indistinguishable from a structured-output failure in every per-item
 * frequency the analysis contract reports.
 */
export const TIMEOUT_REJECTION_CATEGORY = 'INVALID_PROVIDER_TIMEOUT';

/** The item results this scorer can produce: the historical six, plus the v2-only timeout INVALID. */
export const ITEM_RESULTS_V2 = [
  'UNIT_PAGE',
  'NOT_A_UNIT',
  'NEEDS_REVIEW',
  'VALIDATOR_REJECTED_POST_REPAIR',
  'INVALID_NON_TERMINAL_PROVIDER_FAILURE',
  TIMEOUT_REJECTION_CATEGORY,
  NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE,
] as const;

export type ItemResultV2 = (typeof ITEM_RESULTS_V2)[number];

/**
 * The provider outcomes a v2 evaluation may carry without ending the
 * replicate. Restated from the v2 contract rather than written again, so the
 * declarative contract and the executable scorer cannot drift apart.
 */
export const ADMITTED_NON_TERMINAL_PROVIDER_OUTCOMES_V2 =
  V2_CONTRACT.admittedNonTerminalProviderOutcomes;

/**
 * THE FAIL-CLOSED VERSION GUARD, from this reader's side.
 *
 * Recovery-1 wrote no `reliabilitySemanticsVersion`, so its ABSENCE means v1
 * — and this reader must refuse it rather than read a v1 run under v2 rules.
 * An unknown string is refused too: a scorer that cannot name the semantics
 * it is reading has no business producing a gate outcome.
 */
export function assertV2ScorerSemantics(observed: unknown, where: string): void {
  if (observed === RELIABILITY_SEMANTICS_V2) return;
  throw new ReliabilitySemanticsMismatchError(
    observed === undefined || observed === null
      ? 'RELIABILITY_SEMANTICS_V1_RECOVERY_1'
      : String(observed),
    RELIABILITY_SEMANTICS_V2,
    where,
  );
}

/**
 * A v2 INVALID evaluation.
 *
 * Structurally the historical `InvalidEvaluation`, except that `variantName`
 * is a `ScoredVariantName` rather than the F0V study's V4-or-V5 union: this
 * study's variant is V6, and widening `StudyVariantName` itself would change
 * what the already-frozen V4/V5 replication study means.
 */
export type InvalidEvaluationV2 = Omit<InvalidEvaluation, 'variantName'> & {
  readonly variantName: ScoredVariantName;
};

/**
 * Builds one INVALID item through the UNCHANGED historical
 * `scoreInvalidItem`, so a v2 invalid row and a v1 invalid row are
 * constructed by exactly one implementation and cannot drift apart.
 *
 * The cast is sound and narrow: `scoreInvalidItem` reads `variantName` only
 * to copy it onto the scored row, whose own field is already the wider
 * `ScoredVariantName`. Nothing in it branches on the variant.
 */
function invalidItemOf(
  invalid: InvalidEvaluationV2,
  position: number,
  corpusByGoldId: ReturnType<typeof corpusIndexOf>,
  availability: GoldAvailability,
  preserved: PreservedGold,
): ScoredItem {
  return scoreInvalidItem(
    invalid as unknown as InvalidEvaluation,
    position,
    corpusByGoldId,
    availability,
    preserved,
  );
}

/**
 * One planned logical evaluation of a v2 replicate. Structurally the v1 union
 * plus the one new `INVALID_PROVIDER_TIMEOUT` state — a SEPARATE state, never
 * a flag on the existing invalid one, so no existing branch silently starts
 * admitting timeouts.
 */
export type ReplicateEvaluationV2 =
  | {
      readonly state: 'VALIDATED';
      readonly planned: PlannedEvaluationIdentity;
      readonly evaluation: LoadedEvaluation;
    }
  | {
      readonly state: 'INVALID_NON_TERMINAL_PROVIDER_FAILURE';
      readonly planned: PlannedEvaluationIdentity;
      readonly invalid: InvalidEvaluationV2;
    }
  | {
      readonly state: 'INVALID_PROVIDER_TIMEOUT';
      readonly planned: PlannedEvaluationIdentity;
      readonly invalid: InvalidEvaluationV2;
    }
  | {
      readonly state: 'TERMINAL_STOPPED';
      readonly planned: PlannedEvaluationIdentity;
      readonly terminal: TerminalEvaluation;
    }
  | { readonly state: 'NOT_STARTED'; readonly planned: PlannedEvaluationIdentity };

/** A replicate loaded from a run that declared v2 semantics. */
export interface LoadedReplicateV2 {
  readonly slotId: string;
  readonly variantName: ScoredVariantName;
  readonly outputRoot: string;
  readonly replicateStatus: ReplicateStatus;
  readonly terminalCondition: ReplicateTerminalCondition;
  /** The semantics version the run's own experiment manifest declared. */
  readonly reliabilitySemanticsVersion: string;
  readonly evaluations: readonly ReplicateEvaluationV2[];
}

export interface ReplicateItemV2 {
  readonly goldId: string;
  readonly result: ItemResultV2;
  /** The UNIT_PAGE result's unit type; null for every other result. */
  readonly unitType: string | null;
  /** Null exactly when the item was not observed. */
  readonly scored: ScoredItem | null;
  readonly firstPassAccepted: boolean | null;
  readonly postRepairAccepted: boolean | null;
  readonly repairTriggered: boolean | null;
}

export interface ScoredReplicateV2 {
  readonly slotId: string;
  readonly variantName: ScoredVariantName;
  readonly replicateStatus: ReplicateStatus;
  readonly terminalCondition: ReplicateTerminalCondition;
  /** Exactly 49, in corpus order, always. */
  readonly items: readonly ReplicateItemV2[];
  /** How many logical batches were observed INVALID for each reason. */
  readonly observedInvalidBatches: {
    readonly structuredOutputFailed: number;
    readonly providerTimeout: number;
  };
  readonly gateVector: ReplicateGateVector;
}

/** A timed-out batch's item: an observed INVALID, strict-incorrect, tagged as a TIMEOUT rather than a structured-output failure. */
export function scoreTimedOutItem(
  invalid: InvalidEvaluationV2,
  position: number,
  corpusByGoldId: ReturnType<typeof corpusIndexOf>,
  availability: GoldAvailability,
  preserved: PreservedGold,
): ScoredItem {
  const row = invalidItemOf(invalid, position, corpusByGoldId, availability, preserved);
  return { ...row, rejectionCategory: TIMEOUT_REJECTION_CATEGORY };
}

/** The v2 item result a scored row carries. Never called for an unobserved item. */
export function itemResultOfV2(row: ScoredItem): ItemResultV2 {
  if (row.prediction !== null) {
    if (row.validatorState !== 'ACCEPTED') fail(`${row.goldId}: a prediction on a rejected row.`);
    return row.prediction.verdict as ItemResultV2;
  }
  if (row.validatorState !== 'REJECTED') fail(`${row.goldId}: an accepted row with no prediction.`);
  if (row.rejectionCategory === TIMEOUT_REJECTION_CATEGORY) return TIMEOUT_REJECTION_CATEGORY;
  return row.rejectionCategory === INVALID_REJECTION_CATEGORY
    ? 'INVALID_NON_TERMINAL_PROVIDER_FAILURE'
    : 'VALIDATOR_REJECTED_POST_REPAIR';
}

function observedItemV2(row: ScoredItem): ReplicateItemV2 {
  const result = itemResultOfV2(row);
  const invalid =
    result === 'INVALID_NON_TERMINAL_PROVIDER_FAILURE' || result === TIMEOUT_REJECTION_CATEGORY;
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
 * The frozen gate vector of a COMPLETE v2 replicate.
 *
 * Unchanged from the historical rule in every respect that matters: the same
 * `semanticMetricsOf`, the same six gates, the same thresholds (injected from
 * the freeze), and an UNMEASURED gate is still never a passed gate. What v2
 * changes is only which replicates can reach this function — one holding an
 * observed timeout batch now can, because those 49 items are all present.
 */
export function gateVectorOfV2(
  status: ReplicateStatus,
  slotId: string,
  variantName: ScoredVariantName,
  rows: readonly ScoredItem[],
  corpusRows: readonly GoldCorpusItem[],
  gates: Readonly<Record<string, number>>,
): Extract<ReplicateGateVector, { kind: 'NUMERIC' }> {
  if (status !== 'COMPLETE') {
    fail(`${slotId} is ${status}; a full-run gate vector exists only for a COMPLETE replicate.`);
  }
  const ids = new Set(rows.map((row) => row.goldId));
  if (
    rows.length !== ITEMS_PER_REPLICATE ||
    ids.size !== ITEMS_PER_REPLICATE ||
    corpusRows.some((row) => !ids.has(row.goldId))
  ) {
    fail(
      `${slotId}: a complete replicate needs all ${ITEMS_PER_REPLICATE} item verdicts; it has ${ids.size}.`,
    );
  }
  const metrics: VariantSemanticMetrics = semanticMetricsOf(variantName, rows, gates);
  const failed = metrics.gates.filter((gate) => gate.met === false).length;
  const unmeasured = metrics.gates.filter((gate) => gate.met === null).length;
  return {
    kind: 'NUMERIC',
    metrics,
    devGateOutcome: (failed === 0 && unmeasured === 0 && metrics.gates.length > 0
      ? 'FROZEN_GATES_PASSED_ON_DEV'
      : 'FROZEN_GATES_FAILED_ON_DEV') as Exclude<
      ReplicateDevGateOutcome,
      typeof NOT_AVAILABLE_INCOMPLETE_REPLICATE
    >,
  };
}

/**
 * Scores ONE replicate executed under v2 into exactly 49 item results in
 * corpus order, plus its gate vector.
 *
 * Refuses, rather than guesses, when: the run did not declare v2; a gold id
 * appears in two evaluations; an item has neither an observed result nor a
 * terminal non-observation; the replicate does not cover all 49 items; a
 * terminal evaluation appears inside a replicate not marked
 * TERMINAL_FAILURE_PARTIAL; or the observed timeouts exceed the frozen
 * per-replicate ceiling.
 */
export function scoreReplicateV2(
  replicate: LoadedReplicateV2,
  corpusRows: readonly GoldCorpusItem[],
  availability: GoldAvailability,
  preserved: PreservedGold,
  gates: Readonly<Record<string, number>>,
): ScoredReplicateV2 {
  assertV2ScorerSemantics(
    replicate.reliabilitySemanticsVersion,
    `${replicate.outputRoot}: experiment manifest`,
  );

  const corpusByGoldId = corpusIndexOf(corpusRows);
  if (corpusByGoldId.size !== ITEMS_PER_REPLICATE)
    fail(`the corpus holds ${corpusByGoldId.size} items.`);

  const rowsByGoldId = new Map<string, ScoredItem>();
  const unobserved = new Set<string>();
  const claim = (goldId: string): void => {
    if (rowsByGoldId.has(goldId) || unobserved.has(goldId)) {
      fail(`${replicate.slotId}: gold id ${goldId} appears in two evaluations.`);
    }
  };
  let structuredOutputFailed = 0;
  let providerTimeout = 0;

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
        structuredOutputFailed += 1;
        entry.invalid.orderedGoldIds.forEach((goldId, position) => {
          claim(goldId);
          rowsByGoldId.set(
            goldId,
            invalidItemOf(entry.invalid, position, corpusByGoldId, availability, preserved),
          );
        });
        break;

      case 'INVALID_PROVIDER_TIMEOUT':
        // v2 rule 3: EVERY item in that logical batch is observed INVALID.
        // The batch closed durably; the replicate did not end here.
        providerTimeout += 1;
        entry.invalid.orderedGoldIds.forEach((goldId, position) => {
          claim(goldId);
          rowsByGoldId.set(
            goldId,
            scoreTimedOutItem(entry.invalid, position, corpusByGoldId, availability, preserved),
          );
        });
        break;

      case 'TERMINAL_STOPPED':
      case 'NOT_STARTED':
        // v2 rule 4: a terminal liveness/control-plane stop still produces
        // genuinely unobserved items, and still cannot occur in a COMPLETE
        // replicate. v2 widened what an INVALID is, never what COMPLETE is.
        if (replicate.replicateStatus !== 'TERMINAL_FAILURE_PARTIAL') {
          fail(
            `${replicate.slotId}: a ${entry.state} evaluation inside a ${replicate.replicateStatus} replicate.`,
          );
        }
        for (const goldId of entry.planned.orderedGoldIds) {
          claim(goldId);
          unobserved.add(goldId);
        }
        break;
    }
  }

  if (providerTimeout > MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE) {
    fail(
      `${replicate.slotId}: ${providerTimeout} observed non-terminal timeouts exceed the frozen ` +
        `ceiling of ${MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE}; the run should have stopped at the ceiling.`,
    );
  }

  const items: ReplicateItemV2[] = corpusRows.map((corpusRow) => {
    const row = rowsByGoldId.get(corpusRow.goldId);
    if (row !== undefined) return observedItemV2(row);
    if (!unobserved.has(corpusRow.goldId)) {
      fail(
        `${replicate.slotId}: gold id ${corpusRow.goldId} has neither an observed result nor a terminal non-observation.`,
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

  // v2 rule 6: the planned denominator is 49 and is never silently shrunk -
  // not to the observed items, and not to the complete replicates.
  if (rowsByGoldId.size + unobserved.size !== ITEMS_PER_REPLICATE) {
    fail(
      `${replicate.slotId}: the replicate covers ${rowsByGoldId.size + unobserved.size} items, not ${ITEMS_PER_REPLICATE}.`,
    );
  }
  if (items.length !== ITEMS_PER_REPLICATE) {
    fail(`${replicate.slotId}: produced ${items.length} item results, not ${ITEMS_PER_REPLICATE}.`);
  }

  const gateVector: ReplicateGateVector =
    replicate.replicateStatus === 'COMPLETE'
      ? gateVectorOfV2(
          replicate.replicateStatus,
          replicate.slotId,
          replicate.variantName,
          [...rowsByGoldId.values()],
          corpusRows,
          gates,
        )
      : { kind: NOT_AVAILABLE_INCOMPLETE_REPLICATE };

  return {
    slotId: replicate.slotId,
    variantName: replicate.variantName,
    replicateStatus: replicate.replicateStatus,
    terminalCondition: replicate.terminalCondition,
    items,
    observedInvalidBatches: { structuredOutputFailed, providerTimeout },
    gateVector,
  };
}

/** Every item result that COUNTS as observed under v2 — the denominator's composition. */
export function observedResultsV2(items: readonly ReplicateItemV2[]): readonly ItemResultV2[] {
  return items
    .map((item) => item.result)
    .filter((result): result is ItemResultV2 => result !== NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE);
}

/** Narrowing helper so a caller cannot accidentally treat a v1 `ItemResult` as a v2 one. */
export function isV2OnlyResult(result: ItemResult | ItemResultV2): boolean {
  return result === TIMEOUT_REJECTION_CATEGORY;
}

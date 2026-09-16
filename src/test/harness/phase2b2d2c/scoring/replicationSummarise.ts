/**
 * PHASE 2B-2D2C-F0X — THE N=5 REPLICATION ANALYSIS, UNDER THE PARTIAL-
 * REPLICATE CLARIFICATION.
 *
 * Everything here is a function of ten scored replicates. It reports the
 * F0U §8 / F0V `analysisContract` quantities and enforces the clarification:
 *
 *   - exactly five included replicates per prompt, in the frozen slot order;
 *     N is never reduced to the complete count;
 *   - a terminal-failure partial carries NOT_AVAILABLE for every full-run
 *     metric and is neither a pass nor a fail;
 *   - summary statistics are complete-case only, and always state includedN,
 *     completeN and numericN;
 *   - per-item frequencies use every observed result and state
 *     observedReplicates / 5; an unobserved item is never coerced;
 *   - paired gate deltas exist only for BOTH_COMPLETE pairs.
 *
 * It computes no F0U §10 prompt-effect label and interprets nothing.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 */
import { F0V_N_PER_PROMPT, F0V_SLOTS, type StudyVariantName } from '../f0v/studyPlanCore.js';
import {
  INCLUDED_N_PER_PROMPT,
  ITEM_RESULTS,
  ITEMS_PER_REPLICATE,
  NOT_AVAILABLE_INCOMPLETE_PAIR,
  NOT_AVAILABLE_INCOMPLETE_REPLICATE,
  NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE,
  OBSERVED_ITEM_RESULTS,
  PAIRED_DELTA_GATES,
  REPLICATION_CLARIFICATION_RAW_SHA256,
  SIX_FROZEN_DEV_GATES,
  SUMMARY_STATISTIC_GATES,
  type ItemResult,
  type ItemStabilityLabel,
  type PairStatus,
  type PairedLabelDeterminability,
} from './replicationContract.js';
import { itemResultOf, type ReplicateItem, type ScoredReplicate } from './replicationScore.js';
import { ScoringError } from './score.js';
import type { GateOutcome } from './summarise.js';

function fail(message: string): never {
  throw new ScoringError(message);
}

export const REPLICATION_SCORER_VERSION = 'phase2b-2d2c-f0x-replication-scorer-v1';
export const REPLICATION_OUTPUT_SCHEMA_VERSION = 'phase2b-2d2c-f0x-replication-summary-v1';

/** F0V `analysisContract.criticalAndControlItemFrequencyTables`, verbatim; the test compares it to the freeze. */
export const CRITICAL_AND_CONTROL_GOLD_IDS: readonly string[] = [
  'g04d170f4d3fda759',
  'g0ec0d43dad311a77',
  'g536c8b148048fcbc',
  'gdb5b7246327094ef',
  'g57607d4278d6dc23',
  'ge789b0f0aedc398c',
  'gf65026e32d9da8db',
  'g4454e841c09dd8d0',
  'ga435ea22d4b11cf4',
];

const VARIANTS: readonly StudyVariantName[] = ['PROMPT_V4_CANONICAL', 'PROMPT_V5_CANONICAL'];

type NotAvailableReplicate = typeof NOT_AVAILABLE_INCOMPLETE_REPLICATE;

export interface ReplicateReport {
  readonly slotId: string;
  readonly sequence: number;
  readonly pairNumber: number;
  readonly replicateStatus: ScoredReplicate['replicateStatus'];
  readonly terminalCondition: ScoredReplicate['terminalCondition'];
  readonly observedItems: number;
  readonly notObservedItems: number;
  readonly gates: Readonly<Record<string, GateOutcome>> | NotAvailableReplicate;
  readonly devGateOutcome: string;
  readonly verdictConfusion: unknown;
  readonly hardNegative: unknown;
}

export interface SummaryStatistic {
  readonly basis: 'COMPLETE_CASE_ONLY';
  readonly includedN: number;
  readonly completeN: number;
  readonly numericN: number;
  readonly mean: number | null;
  readonly median: number | null;
  readonly min: number | null;
  readonly max: number | null;
}

export interface ItemFrequencyRow {
  readonly goldId: string;
  readonly observedReplicates: number;
  readonly includedN: number;
  readonly denominator: string;
  readonly resultCounts: Readonly<Record<ItemResult, number>>;
  readonly unitTypeCountsAmongUnitPage: Readonly<Record<string, number>>;
  readonly firstPassAccepted: number;
  readonly postRepairAccepted: number;
  readonly repairTriggered: number;
  readonly perReplicate: readonly {
    readonly slotId: string;
    readonly result: ItemResult;
    readonly unitType: string | null;
  }[];
  readonly stability: ItemStabilityLabel;
}

export interface PromptReport {
  readonly variantName: StudyVariantName;
  readonly includedN: number;
  readonly replicates: readonly ReplicateReport[];
  readonly gateDistribution: Readonly<
    Record<string, readonly (number | null | NotAvailableReplicate)[]>
  >;
  readonly passCounts: {
    readonly includedN: number;
    readonly completeN: number;
    readonly frozenGatePassCountAmongComplete: number;
    readonly frozenGateFailCountAmongComplete: number;
    readonly terminalFailurePartialCount: number;
    readonly terminalFailurePartialsAreNeitherPassNorFail: true;
  };
  readonly summaryStatistics: Readonly<Record<string, SummaryStatistic>>;
  readonly itemFrequency: readonly ItemFrequencyRow[];
  readonly criticalAndControlItems: readonly ItemFrequencyRow[];
}

export interface PairReport {
  readonly pairNumber: number;
  readonly v4SlotId: string;
  readonly v5SlotId: string;
  readonly v4Status: string;
  readonly v5Status: string;
  readonly pairStatus: PairStatus;
  readonly gateDeltasV5MinusV4:
    Readonly<Record<string, number | null>> | typeof NOT_AVAILABLE_INCOMPLETE_PAIR;
  readonly itemLevel: {
    readonly basis: 'ALL_49_ITEMS' | 'PARTIAL_OVERLAP';
    readonly itemsObservedOnBothSides: number;
    readonly verdictDisagreements: number;
    readonly corrections: number;
    readonly regressions: number;
    readonly correctionGoldIds: readonly string[];
    readonly regressionGoldIds: readonly string[];
  };
}

export interface ReplicationSummary {
  readonly scorerVersion: string;
  readonly outputSchemaVersion: string;
  readonly clarificationRawSha256: string;
  readonly perPrompt: Readonly<Record<StudyVariantName, PromptReport>>;
  readonly paired: {
    readonly pairs: readonly PairReport[];
    readonly pooledOverBothCompletePairs: {
      readonly pairsCovered: number;
      readonly ofPairs: number;
      readonly verdictDisagreements: number;
      readonly corrections: number;
      readonly regressions: number;
    };
    readonly promptEffectLabelDeterminability: PairedLabelDeterminability;
  };
  readonly terminalFailures: readonly {
    readonly slotId: string;
    readonly variantName: StudyVariantName;
    readonly terminalCondition: ScoredReplicate['terminalCondition'];
    readonly observedItems: number;
    readonly notObservedItems: number;
  }[];
  readonly scope: string;
}

/** The fail-closed invariants of one scored replicate, checked before anything is reported. */
export function assertReplicateInvariants(
  replicate: ScoredReplicate,
  corpusGoldIds: readonly string[],
): void {
  const id = replicate.slot.slotId;
  if (
    replicate.items.length !== ITEMS_PER_REPLICATE ||
    corpusGoldIds.length !== ITEMS_PER_REPLICATE
  ) {
    fail(
      `${id}: ${replicate.items.length} item results; exactly ${ITEMS_PER_REPLICATE} are required.`,
    );
  }
  replicate.items.forEach((item, index) => {
    if (item.goldId !== corpusGoldIds[index])
      fail(`${id}: item ${index + 1} is not in corpus order.`);
    if (!(ITEM_RESULTS as readonly string[]).includes(item.result)) {
      fail(`${id}: ${item.goldId} carries an unknown result ${String(item.result)}.`);
    }
    if (item.scored === null) {
      if (item.result !== NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE) {
        fail(
          `${id}: ${item.goldId} has no observation but carries the result ${item.result}; a missing item is never coerced.`,
        );
      }
    } else if (item.result !== itemResultOf(item.scored)) {
      fail(
        `${id}: ${item.goldId} carries ${item.result} but its scored row says ${itemResultOf(item.scored)}.`,
      );
    }
  });
  const unobserved = replicate.items.filter((item) => item.scored === null).length;
  if (replicate.replicateStatus === 'COMPLETE') {
    if (unobserved > 0)
      fail(
        `${id}: a COMPLETE replicate is missing ${unobserved} of ${ITEMS_PER_REPLICATE} verdicts.`,
      );
    if (replicate.gateVector.kind !== 'NUMERIC')
      fail(`${id}: a COMPLETE replicate has no gate vector.`);
    if (replicate.terminalCondition.kind !== 'EXPERIMENT_COMPLETION')
      fail(`${id}: a COMPLETE replicate without a completion.`);
  } else if (replicate.replicateStatus === 'TERMINAL_FAILURE_PARTIAL') {
    if (replicate.gateVector.kind !== NOT_AVAILABLE_INCOMPLETE_REPLICATE) {
      fail(`${id}: a TERMINAL_FAILURE_PARTIAL replicate was assigned a full gate vector.`);
    }
    if (replicate.terminalCondition.kind !== 'EXPERIMENT_STOP')
      fail(`${id}: a partial replicate without an experiment stop.`);
    if (unobserved === 0) fail(`${id}: a TERMINAL_FAILURE_PARTIAL replicate observed every item.`);
  } else {
    fail(`${id}: unknown replicate status ${String(replicate.replicateStatus)}.`);
  }
}

/** Complete-case statistics over numeric values only; the three denominators travel together. */
export function summaryStatisticOf(
  values: readonly (number | null)[],
  completeN: number,
): SummaryStatistic {
  const numeric = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  const numericN = numeric.length;
  const mid = Math.floor(numericN / 2);
  return {
    basis: 'COMPLETE_CASE_ONLY',
    includedN: INCLUDED_N_PER_PROMPT,
    completeN,
    numericN,
    mean: numericN === 0 ? null : numeric.reduce((a, b) => a + b, 0) / numericN,
    median:
      numericN === 0
        ? null
        : numericN % 2 === 1
          ? numeric[mid]!
          : (numeric[mid - 1]! + numeric[mid]!) / 2,
    min: numericN === 0 ? null : numeric[0]!,
    max: numericN === 0 ? null : numeric[numericN - 1]!,
  };
}

function comparedValueOf(item: ReplicateItem): string {
  return item.result === 'UNIT_PAGE' ? `UNIT_PAGE/${item.unitType ?? 'NULL'}` : item.result;
}

export function itemStabilityOf(items: readonly ReplicateItem[]): ItemStabilityLabel {
  if (items.length !== INCLUDED_N_PER_PROMPT)
    fail(`stability needs ${INCLUDED_N_PER_PROMPT} replicates; got ${items.length}.`);
  const observed = items.filter((item) => item.scored !== null).map(comparedValueOf);
  if (new Set(observed).size > 1) return 'UNSTABLE_WITHIN_PROMPT';
  return observed.length === INCLUDED_N_PER_PROMPT
    ? 'STABLE_WITHIN_PROMPT'
    : 'STABILITY_NOT_DETERMINABLE_INCOMPLETE_OBSERVATION';
}

function itemFrequencyOf(
  goldId: string,
  replicates: readonly ScoredReplicate[],
  index: number,
): ItemFrequencyRow {
  const items = replicates.map((replicate) => {
    const item = replicate.items[index];
    if (item === undefined || item.goldId !== goldId)
      fail(`${replicate.slot.slotId}: item ${goldId} is misaligned.`);
    return item;
  });
  const observed = items.filter((item) => item.scored !== null);
  const resultCounts = Object.fromEntries(ITEM_RESULTS.map((result) => [result, 0])) as Record<
    ItemResult,
    number
  >;
  const unitTypeCounts: Record<string, number> = {};
  for (const item of items) {
    resultCounts[item.result] += 1;
    if (item.result === 'UNIT_PAGE') {
      const key = item.unitType ?? 'NULL';
      unitTypeCounts[key] = (unitTypeCounts[key] ?? 0) + 1;
    }
  }
  const observedTotal = OBSERVED_ITEM_RESULTS.reduce(
    (total, result) => total + resultCounts[result],
    0,
  );
  if (
    observedTotal !== observed.length ||
    observedTotal + resultCounts[NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE] !== INCLUDED_N_PER_PROMPT
  ) {
    fail(
      `${goldId}: result counts do not partition the ${INCLUDED_N_PER_PROMPT} included replicates.`,
    );
  }
  return {
    goldId,
    observedReplicates: observed.length,
    includedN: INCLUDED_N_PER_PROMPT,
    denominator: `${observed.length}/${INCLUDED_N_PER_PROMPT}`,
    resultCounts,
    unitTypeCountsAmongUnitPage: Object.fromEntries(
      Object.entries(unitTypeCounts).sort(([a], [b]) => a.localeCompare(b)),
    ),
    firstPassAccepted: observed.filter((item) => item.firstPassAccepted === true).length,
    postRepairAccepted: observed.filter((item) => item.postRepairAccepted === true).length,
    repairTriggered: observed.filter((item) => item.repairTriggered === true).length,
    perReplicate: replicates.map((replicate, i) => ({
      slotId: replicate.slot.slotId,
      result: items[i]!.result,
      unitType: items[i]!.unitType,
    })),
    stability: itemStabilityOf(items),
  };
}

function replicateReportOf(replicate: ScoredReplicate): ReplicateReport {
  const observedItems = replicate.items.filter((item) => item.scored !== null).length;
  const base = {
    slotId: replicate.slot.slotId,
    sequence: replicate.slot.sequence,
    pairNumber: replicate.slot.pairNumber,
    replicateStatus: replicate.replicateStatus,
    terminalCondition: replicate.terminalCondition,
    observedItems,
    notObservedItems: ITEMS_PER_REPLICATE - observedItems,
  };
  if (replicate.gateVector.kind !== 'NUMERIC') {
    return {
      ...base,
      gates: NOT_AVAILABLE_INCOMPLETE_REPLICATE,
      devGateOutcome: NOT_AVAILABLE_INCOMPLETE_REPLICATE,
      verdictConfusion: NOT_AVAILABLE_INCOMPLETE_REPLICATE,
      hardNegative: NOT_AVAILABLE_INCOMPLETE_REPLICATE,
    };
  }
  const { metrics, devGateOutcome } = replicate.gateVector;
  const gates = Object.fromEntries(
    SIX_FROZEN_DEV_GATES.map((name) => {
      const gate = metrics.gates.find((g) => g.gate === name);
      if (gate === undefined) fail(`${replicate.slot.slotId}: the gate vector lacks ${name}.`);
      return [name, gate];
    }),
  );
  return {
    ...base,
    gates,
    devGateOutcome,
    verdictConfusion:
      metrics.fields.find((field) => field.field === 'verdict')?.confusion ??
      fail('no verdict confusion.'),
    hardNegative: metrics.hardNegative,
  };
}

function numericGate(replicate: ScoredReplicate, gate: string): number | null {
  if (replicate.gateVector.kind !== 'NUMERIC') {
    fail(`${replicate.slot.slotId} is ${replicate.replicateStatus}; it has no numeric ${gate}.`);
  }
  const outcome = replicate.gateVector.metrics.gates.find((g) => g.gate === gate);
  if (outcome === undefined) fail(`${replicate.slot.slotId}: no gate ${gate}.`);
  return outcome.observed;
}

function promptReportOf(
  variantName: StudyVariantName,
  replicates: readonly ScoredReplicate[],
  corpusGoldIds: readonly string[],
): PromptReport {
  if (replicates.length !== F0V_N_PER_PROMPT) {
    fail(
      `${variantName} has ${replicates.length} included replicates; exactly ${F0V_N_PER_PROMPT} are frozen.`,
    );
  }
  const complete = replicates.filter((r) => r.replicateStatus === 'COMPLETE');
  const partial = replicates.filter((r) => r.replicateStatus === 'TERMINAL_FAILURE_PARTIAL');
  const passed = complete.filter(
    (r) =>
      r.gateVector.kind === 'NUMERIC' &&
      r.gateVector.devGateOutcome === 'FROZEN_GATES_PASSED_ON_DEV',
  );
  const itemFrequency = corpusGoldIds.map((goldId, index) =>
    itemFrequencyOf(goldId, replicates, index),
  );
  return {
    variantName,
    includedN: INCLUDED_N_PER_PROMPT,
    replicates: replicates.map(replicateReportOf),
    gateDistribution: Object.fromEntries(
      SIX_FROZEN_DEV_GATES.map((gate) => [
        gate,
        replicates.map((r) =>
          r.replicateStatus === 'COMPLETE'
            ? numericGate(r, gate)
            : NOT_AVAILABLE_INCOMPLETE_REPLICATE,
        ),
      ]),
    ),
    passCounts: {
      includedN: INCLUDED_N_PER_PROMPT,
      completeN: complete.length,
      frozenGatePassCountAmongComplete: passed.length,
      frozenGateFailCountAmongComplete: complete.length - passed.length,
      terminalFailurePartialCount: partial.length,
      terminalFailurePartialsAreNeitherPassNorFail: true,
    },
    summaryStatistics: Object.fromEntries(
      SUMMARY_STATISTIC_GATES.map((gate) => [
        gate,
        summaryStatisticOf(
          complete.map((r) => numericGate(r, gate)),
          complete.length,
        ),
      ]),
    ),
    itemFrequency,
    criticalAndControlItems: CRITICAL_AND_CONTROL_GOLD_IDS.map(
      (goldId) =>
        itemFrequency.find((row) => row.goldId === goldId) ??
        fail(`critical/control item ${goldId} is not a corpus item.`),
    ),
  };
}

/** Paired gate deltas, V5 minus V4. Refuses any pair with an incomplete side. */
export function pairedGateDeltasOf(
  v4: ScoredReplicate,
  v5: ScoredReplicate,
): Readonly<Record<string, number | null>> {
  if (v4.replicateStatus !== 'COMPLETE' || v5.replicateStatus !== 'COMPLETE') {
    fail(
      `pair ${v4.slot.pairNumber}: ${v4.slot.slotId} is ${v4.replicateStatus} and ${v5.slot.slotId} is ${v5.replicateStatus}; paired gate deltas exist only for two complete replicates.`,
    );
  }
  return Object.fromEntries(
    PAIRED_DELTA_GATES.map((gate) => {
      const a = numericGate(v4, gate);
      const b = numericGate(v5, gate);
      return [gate, a === null || b === null ? null : b - a];
    }),
  );
}

function verdictCorrect(item: ReplicateItem): boolean | null {
  const correctness = item.scored?.fieldCorrectness['verdict'];
  return correctness === 'CORRECT' ? true : correctness === 'INCORRECT' ? false : null;
}

function pairReportOf(pairNumber: number, v4: ScoredReplicate, v5: ScoredReplicate): PairReport {
  const bothComplete = v4.replicateStatus === 'COMPLETE' && v5.replicateStatus === 'COMPLETE';
  let itemsObservedOnBothSides = 0;
  let verdictDisagreements = 0;
  const correctionGoldIds: string[] = [];
  const regressionGoldIds: string[] = [];
  v4.items.forEach((a, index) => {
    const b = v5.items[index];
    if (b === undefined || b.goldId !== a.goldId)
      fail(`pair ${pairNumber}: items are misaligned at ${index + 1}.`);
    if (a.scored === null || b.scored === null) return;
    itemsObservedOnBothSides += 1;
    if (a.result !== b.result) verdictDisagreements += 1;
    const aCorrect = verdictCorrect(a);
    const bCorrect = verdictCorrect(b);
    if (aCorrect === false && bCorrect === true) correctionGoldIds.push(a.goldId);
    if (aCorrect === true && bCorrect === false) regressionGoldIds.push(a.goldId);
  });
  if (bothComplete && itemsObservedOnBothSides !== ITEMS_PER_REPLICATE) {
    fail(
      `pair ${pairNumber}: two complete replicates share only ${itemsObservedOnBothSides} observed items.`,
    );
  }
  return {
    pairNumber,
    v4SlotId: v4.slot.slotId,
    v5SlotId: v5.slot.slotId,
    v4Status: v4.replicateStatus,
    v5Status: v5.replicateStatus,
    pairStatus: bothComplete ? 'BOTH_COMPLETE' : 'ONE_OR_BOTH_SIDES_TERMINAL_FAILURE_PARTIAL',
    gateDeltasV5MinusV4: bothComplete ? pairedGateDeltasOf(v4, v5) : NOT_AVAILABLE_INCOMPLETE_PAIR,
    itemLevel: {
      basis: bothComplete ? 'ALL_49_ITEMS' : 'PARTIAL_OVERLAP',
      itemsObservedOnBothSides,
      verdictDisagreements,
      corrections: correctionGoldIds.length,
      regressions: regressionGoldIds.length,
      correctionGoldIds,
      regressionGoldIds,
    },
  };
}

/**
 * The whole N=5 analysis. `replicates` must be the ten scored replicates in
 * the frozen F0V slot order.
 */
export function buildReplicationSummary(
  replicates: readonly ScoredReplicate[],
  corpusGoldIds: readonly string[],
): ReplicationSummary {
  if (replicates.length !== F0V_SLOTS.length)
    fail(`${replicates.length} replicates; the frozen study has ${F0V_SLOTS.length}.`);
  replicates.forEach((replicate, index) => {
    const frozen = F0V_SLOTS[index]!;
    if (
      replicate.slot.slotId !== frozen.slotId ||
      replicate.slot.variantName !== frozen.variantName ||
      replicate.slot.pairNumber !== frozen.pairNumber
    ) {
      fail(
        `replicate ${index + 1} is ${replicate.slot.slotId}; the frozen order names ${frozen.slotId}.`,
      );
    }
    assertReplicateInvariants(replicate, corpusGoldIds);
  });
  const ofVariant = (variantName: StudyVariantName): readonly ScoredReplicate[] =>
    replicates.filter((r) => r.slot.variantName === variantName);
  const perPrompt = Object.fromEntries(
    VARIANTS.map((variantName) => [
      variantName,
      promptReportOf(variantName, ofVariant(variantName), corpusGoldIds),
    ]),
  ) as Record<StudyVariantName, PromptReport>;

  const pairNumbers = [...new Set(F0V_SLOTS.map((slot) => slot.pairNumber))].sort((a, b) => a - b);
  const pairs = pairNumbers.map((pairNumber) => {
    const side = (variantName: StudyVariantName): ScoredReplicate => {
      const matches = replicates.filter(
        (r) => r.slot.pairNumber === pairNumber && r.slot.variantName === variantName,
      );
      if (matches.length !== 1)
        fail(`pair ${pairNumber} has ${matches.length} ${variantName} replicates.`);
      return matches[0]!;
    };
    return pairReportOf(pairNumber, side('PROMPT_V4_CANONICAL'), side('PROMPT_V5_CANONICAL'));
  });
  const complete = pairs.filter((pair) => pair.pairStatus === 'BOTH_COMPLETE');
  const sum = (select: (pair: PairReport) => number): number =>
    complete.reduce((total, pair) => total + select(pair), 0);

  return {
    scorerVersion: REPLICATION_SCORER_VERSION,
    outputSchemaVersion: REPLICATION_OUTPUT_SCHEMA_VERSION,
    clarificationRawSha256: REPLICATION_CLARIFICATION_RAW_SHA256,
    perPrompt,
    paired: {
      pairs,
      pooledOverBothCompletePairs: {
        pairsCovered: complete.length,
        ofPairs: pairs.length,
        verdictDisagreements: sum((pair) => pair.itemLevel.verdictDisagreements),
        corrections: sum((pair) => pair.itemLevel.corrections),
        regressions: sum((pair) => pair.itemLevel.regressions),
      },
      promptEffectLabelDeterminability:
        complete.length === pairs.length
          ? 'DETERMINABLE_ALL_FIVE_PAIRS_BOTH_COMPLETE'
          : 'NOT_DETERMINABLE_INCOMPLETE_PAIRS',
    },
    terminalFailures: replicates
      .filter((r) => r.replicateStatus === 'TERMINAL_FAILURE_PARTIAL')
      .map((r) => {
        const observedItems = r.items.filter((item) => item.scored !== null).length;
        return {
          slotId: r.slot.slotId,
          variantName: r.slot.variantName,
          terminalCondition: r.terminalCondition,
          observedItems,
          notObservedItems: ITEMS_PER_REPLICATE - observedItems,
        };
      }),
    scope:
      'DEVELOPMENT split only. A diagnostic replication report under the frozen F0U/F0V analysis contract and ' +
      'the partial-replicate clarification. It is not an acceptance decision, applies no F0U §10 prompt-effect ' +
      'label, and authorises no HOLDOUT inference, V6, rerun or merge.',
  };
}

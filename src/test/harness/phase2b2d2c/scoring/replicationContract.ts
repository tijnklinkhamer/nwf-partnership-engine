/**
 * PHASE 2B-2D2C-F0X — THE ADDITIVE PARTIAL-REPLICATE ANALYSIS CLARIFICATION.
 *
 * The frozen methodology has a real edge case. F0U §7 (and F0V
 * `inclusionRule.classC`) includes a genuine terminal-failure run and forbids
 * replacing it. F0U §8 asks for the six DEV gate metrics for all five
 * replicates. Recovery-1 halted three slots before twelve batches, and a
 * halted run has no 49-item gate vector. Both requirements cannot hold at
 * once.
 *
 * The owner resolved this additively on 2026-09-16. This module is the single
 * source of the resolved rules. The scorer imports these constants, and
 * `buildPartialReplicateClarification()` generates the committed clarification
 * record from the same constants. The record and the machinery therefore
 * cannot say different things. F0U and F0V bytes are unchanged; their hashes
 * are cited, never rewritten.
 *
 * It changes no gate threshold, adds no V6, opens no holdout item and applies
 * no semantic interpretation.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 */
import { EXPECTED_CORPUS_ITEM_COUNT } from '../constants.js';
import {
  F0U_METHODOLOGY_RAW_SHA256,
  F0V_APPROVAL_RECORD_RAW_SHA256,
  PROPOSED_F0V_FREEZE_RAW_SHA256,
} from '../f0v/freezeF0V.js';
import { F0V_N_PER_PROMPT } from '../f0v/studyPlanCore.js';
import { PROPOSED_F0I_FREEZE_RAW_SHA256 } from '../f0i/freezeF0I.js';
import { PROPOSED_F0O_FREEZE_RAW_SHA256 } from '../f0o/freezeF0O.js';
import {
  RECOVERY_1_EXECUTION_INVENTORY_PATH,
  RECOVERY_1_EXECUTION_INVENTORY_RAW_SHA256,
} from '../f0x/recovery1ExecutionInventory.js';
import {
  RECOVERY_1_STRUCTURAL_CLOSURE_PATH,
  RECOVERY_1_STRUCTURAL_CLOSURE_RAW_SHA256,
} from '../f0x/recovery1StructuralClosure.js';

export const REPLICATION_CLARIFICATION_ID =
  'PHASE_2B_2D2C_F0X_PARTIAL_REPLICATE_ANALYSIS_CLARIFICATION_V1';
export const REPLICATION_CLARIFICATION_VERSION =
  'phase2b-2d2c-f0x-partial-replicate-analysis-clarification-v1';
export const REPLICATION_CLARIFICATION_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F0X_PARTIAL_REPLICATE_ANALYSIS_CLARIFICATION_V1.json';
export const REPLICATION_CLARIFICATION_RAW_SHA256 =
  'ab3ff24717f9a14f68fcb30e589715e0122e26f027af83d81949983446680b36';

/** The fixed included denominator per prompt. Never reduced to the complete count. */
export const INCLUDED_N_PER_PROMPT = F0V_N_PER_PROMPT;
export const ITEMS_PER_REPLICATE = EXPECTED_CORPUS_ITEM_COUNT;

export const REPLICATE_STATUSES = ['COMPLETE', 'TERMINAL_FAILURE_PARTIAL'] as const;
export type ReplicateStatus = (typeof REPLICATE_STATUSES)[number];

/** The value every full-run metric of an incomplete replicate takes. Never a number. */
export const NOT_AVAILABLE_INCOMPLETE_REPLICATE = 'NOT_AVAILABLE_INCOMPLETE_REPLICATE';
/** The value every paired delta of a pair with an incomplete side takes. Never a number. */
export const NOT_AVAILABLE_INCOMPLETE_PAIR = 'NOT_AVAILABLE_INCOMPLETE_PAIR';

/**
 * One item's result within one replicate. The first five are OBSERVED; the
 * sixth is not an observation and is never converted into one.
 */
export const ITEM_RESULTS = [
  'UNIT_PAGE',
  'NOT_A_UNIT',
  'NEEDS_REVIEW',
  'VALIDATOR_REJECTED_POST_REPAIR',
  'INVALID_NON_TERMINAL_PROVIDER_FAILURE',
  'NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE',
] as const;
export type ItemResult = (typeof ITEM_RESULTS)[number];
export const NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE: ItemResult =
  'NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE';
export const OBSERVED_ITEM_RESULTS: readonly ItemResult[] = ITEM_RESULTS.filter(
  (result) => result !== NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE,
);

/**
 * Provider outcomes that, on an evaluation that ended WITHOUT a stop, make
 * its items INVALID observations under the frozen acceptance protocol §5.
 * Any other non-OK outcome on a non-stopped evaluation is undefined here,
 * and the scorer refuses it.
 */
export const INVALID_NON_TERMINAL_PROVIDER_OUTCOMES: readonly string[] = [
  'STRUCTURED_OUTPUT_FAILED',
];

/** The F0V `analysisContract` vocabulary for one complete replicate, plus the incomplete marker. */
export const REPLICATE_DEV_GATE_OUTCOMES = [
  'FROZEN_GATES_PASSED_ON_DEV',
  'FROZEN_GATES_FAILED_ON_DEV',
  NOT_AVAILABLE_INCOMPLETE_REPLICATE,
] as const;
export type ReplicateDevGateOutcome = (typeof REPLICATE_DEV_GATE_OUTCOMES)[number];

export const PAIR_STATUSES = [
  'BOTH_COMPLETE',
  'ONE_OR_BOTH_SIDES_TERMINAL_FAILURE_PARTIAL',
] as const;
export type PairStatus = (typeof PAIR_STATUSES)[number];

export const ITEM_STABILITY_LABELS = [
  'STABLE_WITHIN_PROMPT',
  'UNSTABLE_WITHIN_PROMPT',
  'STABILITY_NOT_DETERMINABLE_INCOMPLETE_OBSERVATION',
] as const;
export type ItemStabilityLabel = (typeof ITEM_STABILITY_LABELS)[number];

export const PAIRED_LABEL_DETERMINABILITY = [
  'DETERMINABLE_ALL_FIVE_PAIRS_BOTH_COMPLETE',
  'NOT_DETERMINABLE_INCOMPLETE_PAIRS',
] as const;
export type PairedLabelDeterminability = (typeof PAIRED_LABEL_DETERMINABILITY)[number];

/** The six frozen DEV gates, in F0U §8 order. Thresholds come only from the frozen freezes. */
export const SIX_FROZEN_DEV_GATES = [
  'minSchemaValidSpanVerifiedRate',
  'minUnitPageRecall',
  'minUnitPagePrecision',
  'minUnitTypeAccuracy',
  'minHardNegativeRejection',
  'maxNeedsReviewRate',
] as const;

/** F0U §8 item 3 and F0V `analysisContract`: the metrics that get summary statistics. */
export const SUMMARY_STATISTIC_GATES = ['minUnitPagePrecision', 'minUnitPageRecall'] as const;

/** F0V `pairedV4V5Reporting`: the per-pair deltas. */
export const PAIRED_DELTA_GATES = [
  'minUnitPagePrecision',
  'minUnitPageRecall',
  'minHardNegativeRejection',
] as const;

export function buildPartialReplicateClarification() {
  return {
    clarificationId: REPLICATION_CLARIFICATION_ID,
    clarificationVersion: REPLICATION_CLARIFICATION_VERSION,
    status: 'FROZEN_ADDITIVE_CLARIFICATION_UNDER_OWNER_DIRECTION',
    scope: 'DEVELOPMENT_ONLY',
    studyId: 'REPLICATION_V4_V5_N5',
    ownerDirectionDate: '2026-09-16',
    authorises: [],
    doesNotAuthorise: [
      'scoring against DEV gold or the owner adjudication record',
      'any provider request, rerun, replacement or further recovery',
      'any holdout-split or mixed DEVELOPMENT/HOLDOUT file access',
      'any V6 or prompt change',
      'any gate threshold change',
      'any semantic interpretation of results',
    ],
    additivity: {
      historicalBytesEdited: false,
      f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
      f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
      f0vApprovalRecordRawSha256: F0V_APPROVAL_RECORD_RAW_SHA256,
      v4HistoricalFreezeF0IRawSha256: PROPOSED_F0I_FREEZE_RAW_SHA256,
      v5HistoricalFreezeF0ORawSha256: PROPOSED_F0O_FREEZE_RAW_SHA256,
      structuralClosure: {
        path: RECOVERY_1_STRUCTURAL_CLOSURE_PATH,
        rawSha256: RECOVERY_1_STRUCTURAL_CLOSURE_RAW_SHA256,
      },
      executionInventory: {
        path: RECOVERY_1_EXECUTION_INVENTORY_PATH,
        rawSha256: RECOVERY_1_EXECUTION_INVENTORY_RAW_SHA256,
      },
    },
    edgeCase: {
      f0uSection7:
        'A replication that reaches a genuine terminal failure/halt is included exactly as recorded and is never replaced.',
      f0uSection8:
        'The six frozen DEV gate metrics are reported as a distribution over all five replications of each prompt.',
      conflict:
        'A replicate that halted before all twelve batches has no 49-item gate vector, so both sections cannot be satisfied literally.',
    },
    inclusion: {
      includedNPerPrompt: INCLUDED_N_PER_PROMPT,
      rule: 'Every Recovery-1 slot is one of the five included replications of its prompt. A terminal-failure slot is never replaced, rerun or discarded, and N is never reduced to the number of complete replicates.',
      historicalAttempt3V4AndAttempt4V5: 'PILOT_ONLY_NOT_COUNTED_TOWARD_N5',
    },
    replicateStatus: {
      values: REPLICATE_STATUSES,
      COMPLETE:
        'The experiment recorded COMPLETED_ALL_PLANNED with all twelve planned evaluations ended without a stop, AND every one of the 49 DEVELOPMENT items has an observed item result. The scorer derives this from the evidence, never from the experiment status alone.',
      TERMINAL_FAILURE_PARTIAL:
        'The experiment recorded an experiment stop before all twelve planned evaluations ended. The actual terminal condition (stop kind, stop condition, provider outcome, Tier-2 outcome, sequence) is preserved verbatim with the replicate.',
      completeRunMissingAnItem:
        'A replicate whose experiment completed but which still lacks an observed result for any of the 49 items is neither status. The scorer refuses it; its treatment needs a separate owner decision.',
    },
    itemResults: {
      values: ITEM_RESULTS,
      observed: OBSERVED_ITEM_RESULTS,
      semanticVerdict:
        'UNIT_PAGE, NOT_A_UNIT or NEEDS_REVIEW: a validator-accepted result after the one bounded repair round (ADR 0011, F0I/F0O postRepairTreatment).',
      VALIDATOR_REJECTED_POST_REPAIR:
        'The validator rejected the item and no accepted repair exists. Scored exactly as the frozen strict scorer scores a rejected item.',
      INVALID_NON_TERMINAL_PROVIDER_FAILURE: {
        rule: 'An evaluation that ended WITHOUT a stop but produced no structured output (provider outcome in the admitted set). Each of its items is an INVALID observation, scored exactly as a validator-rejected item: no prediction, strict-incorrect, counted against schema-valid rate, recall and hard-negative rejection, and outside the precision denominator.',
        admittedProviderOutcomes: INVALID_NON_TERMINAL_PROVIDER_OUTCOMES,
        frozenBasis:
          'F0I/F0O scoring.providerFailureTreatment ("INVALID is never a missing observation") and docs/evaluation/PHASE_2B_2D_SONNET_ACCEPTANCE_PROTOCOL.md §5 ("any structured-output failure (all counted INVALID — never a missing observation)"). This restates an existing frozen rule; it is not a new one.',
        anyOtherNonOkOutcomeOnANonStoppedEvaluation: 'REFUSED_BY_THE_SCORER',
      },
      NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE:
        'Every item of the evaluation that carried the terminal stop, and every item of an evaluation that never started, in a TERMINAL_FAILURE_PARTIAL replicate. It is never converted into NOT_A_UNIT, NEEDS_REVIEW, VALIDATOR_REJECTED_POST_REPAIR, INVALID or any other result. A terminal evaluation that nevertheless holds a validation result is refused by the scorer.',
    },
    fullRunGateMetrics: {
      gates: SIX_FROZEN_DEV_GATES,
      COMPLETE:
        'The six frozen DEV gates are computed exactly as the attempt-3/attempt-4 scorers compute them (strict view, post-repair validity), with the unchanged F0I/F0O thresholds, over all 49 items.',
      TERMINAL_FAILURE_PARTIAL: {
        eachGateMetric: NOT_AVAILABLE_INCOMPLETE_REPLICATE,
        devGateOutcome: NOT_AVAILABLE_INCOMPLETE_REPLICATE,
        confusionCounts: NOT_AVAILABLE_INCOMPLETE_REPLICATE,
        forbidden: [
          'a denominator smaller than 49 presented as a gate metric',
          'imputation of any unobserved item',
          'substitution of a failure, a rejection or any verdict for an unobserved item',
          'extrapolation from the observed prefix',
        ],
      },
    },
    perPromptDistribution: {
      rule: 'Each prompt reports exactly five entries, in the frozen F0V slot order. A complete replicate shows its numeric gate values; a terminal-failure partial shows NOT_AVAILABLE_INCOMPLETE_REPLICATE with its replicate status and terminal condition.',
      entriesPerPrompt: INCLUDED_N_PER_PROMPT,
    },
    summaryStatistics: {
      metrics: SUMMARY_STATISTIC_GATES,
      statistics: ['mean', 'median', 'min', 'max'],
      basis: 'COMPLETE_CASE_ONLY',
      rule: 'Computed only over complete replicates whose metric is numeric. Each report states includedN = 5, completeN and numericN side by side, and is never described as based on all five.',
    },
    passCounts: {
      fields: [
        'includedN',
        'completeN',
        'frozenGatePassCountAmongComplete',
        'frozenGateFailCountAmongComplete',
        'terminalFailurePartialCount',
      ],
      rule: 'A terminal-failure partial is neither a DEV-gate pass nor a DEV-gate fail. A complete replicate passes only when every one of the six gates is measured and met, exactly as the attempt-4 scorer decides ALL_FROZEN_GATES_MET_ON_DEV.',
    },
    perItemFrequency: {
      scope: 'all 49 DEVELOPMENT items, per prompt',
      rule: 'Uses every observed item result. Every row exposes its own denominator as observedReplicates / 5, and lists NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE as its own count. Validator acceptance (first pass and post-repair) and repair-trigger frequencies use the same per-item observed denominator.',
    },
    itemStability: {
      labels: ITEM_STABILITY_LABELS,
      comparedValue:
        'The item result, and for UNIT_PAGE also unit_type. VALIDATOR_REJECTED_POST_REPAIR and INVALID_NON_TERMINAL_PROVIDER_FAILURE are distinct results.',
      STABLE_WITHIN_PROMPT: 'All five replicates observed, and all five compared values identical.',
      UNSTABLE_WITHIN_PROMPT:
        'At least two observed compared values differ. Determinable even when an item is unobserved in some replicate, because the disagreement is already observed.',
      STABILITY_NOT_DETERMINABLE_INCOMPLETE_OBSERVATION:
        'Every observed value agrees but fewer than five replicates observed the item. Never reported as stable.',
    },
    pairedComparison: {
      pairStatuses: PAIR_STATUSES,
      BOTH_COMPLETE:
        'Numeric paired deltas (V5 minus V4) for precision, recall and hard-negative rejection; verdict-disagreement count; corrections and regressions.',
      ONE_OR_BOTH_SIDES_TERMINAL_FAILURE_PARTIAL: {
        pairedGateDeltas: NOT_AVAILABLE_INCOMPLETE_PAIR,
        itemLevel:
          'Reported only over items observed on both sides, with itemsObservedOnBothSides as an explicit denominator and labelled PARTIAL_OVERLAP. Never pooled with complete pairs.',
      },
      pooled:
        'Pooled totals use BOTH_COMPLETE pairs only, and state how many of the five pairs they cover.',
      pairedDeltaGates: PAIRED_DELTA_GATES,
      interpretationLabelDeterminability: {
        values: PAIRED_LABEL_DETERMINABILITY,
        rule: 'F0U §10 V5_REPRODUCIBLY_BETTER and V5_REPRODUCIBLY_WORSE require every one of the five pairs. With any incomplete pair they are NOT_DETERMINABLE_INCOMPLETE_PAIRS; they are never evaluated over the complete pairs alone. This clarification does not compute the labels themselves and does not operationalise the F0U §10 noise-floor clause.',
      },
    },
    terminalFailuresAsOutcome:
      'Every terminal-failure replicate, with its actual terminal condition, is reported prominently as a reliability and liveness observation of the study, beside the gate results and never in a footnote.',
    unchanged: {
      gateThresholds: true,
      sixGateComputation: true,
      postRepairTreatment: true,
      holdoutForbidden: true,
      v6: false,
    },
  };
}

export type PartialReplicateClarification = ReturnType<typeof buildPartialReplicateClarification>;

/**
 * THE POST-V4 CONTINUATION-WINDOW CONTRACT.
 *
 * WHAT THIS NAMESPACE IS
 *
 *   The offline machinery a LATER, separately authorised live window will
 *   use: the Generation-1 reserve replacement ledger's append-only contract,
 *   the deterministic pending-obligation planner, the mechanical
 *   replacement-reason precedence, the precommitted five-item Window V1 plan,
 *   and a pure between-work-item gate implementing ALL EIGHT frozen Plan V1
 *   pause conditions under the PLAN'S numbering.
 *
 * WHAT IT IS NOT
 *
 *   It is not a batch runner and it is not live authority. It starts no
 *   process, opens no socket, reads no database and reads no clock. It never
 *   appends a row to the canonical replacement ledger: this implementation
 *   creates only the EMPTY genesis ledger. The historical Batch-02 gate in
 *   `../acquisitionGate/` is not touched, not generalised and not imported.
 *
 * GOVERNED BY
 *
 *   Corpus Acquisition Plan V1 (pause conditions P1-P8, replacement-ledger
 *   fields, reason vocabulary), the post-v4 continuation Strategy V1 and the
 *   reserve-assignment-order Owner Clarification V1 (Q1-Q4), read together.
 *
 * THIS MODULE IS PURE.
 */

import type { Split } from '../draw/drawContract.js';

// ---------------------------------------------------------------------------
// A. BOUND GOVERNANCE AND FROZEN ARTIFACTS.
// ---------------------------------------------------------------------------

export const GENERATION_ID = 'METHODOLOGY_V2_GEN1';

export const OWNER_CLARIFICATION_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_RESERVE_ASSIGNMENT_ORDER_OWNER_CLARIFICATION_V1.json';
export const OWNER_CLARIFICATION_SHA256 =
  'd999f9f3a54119b875717cb1b25f6b544e334eccb86cda0ebd67fd3f79fb3528';
export const OWNER_CLARIFICATION_BYTES = 18443;

export const STRATEGY_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_POST_V4_P5_ACQUISITION_CONTINUATION_STRATEGY_V1.json';
export const STRATEGY_SHA256 = '619f326184c4b91b09a57413a6288356850dad2270e9b0d01c0e288dc76b4097';
export const STRATEGY_BYTES = 60326;

export const METHODOLOGY_R3_PATH =
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json';
export const METHODOLOGY_R3_SHA256 =
  'fdc54873f4cdd47688d6d720229f0a0ea8426193711993a4f63a9f5000623f33';

export const CORPUS_PLAN_PATH =
  'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json';
export const CORPUS_PLAN_SHA256 =
  '54279f1b3e45fe1be8c24e5c81d56693ebb2cdf0a34f346b748d16b56847184e';

export const FRAME_PATH = 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json';
export const FRAME_HASH = '302dccd8250919213dc329d0b84093f04ff3cc68a1cafe07f844044f94cae650';
export const FRAME_FILE_SHA256 = 'c16b31c9c18e368bbf99e2d45fc2de1a284dd42c9a483ed34c30187e77b18878';

export const DRAW_PATH = 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json';
export const DRAW_HASH = '79c9eec906bc9d74f2213722b8addb61cd7c4acd02ce466ab0f8f97137542293';
export const DRAW_FILE_SHA256 = 'b7021416894b7547cfe53d0d5f5e34b4e9c35843f8be35f0d2844bc67683b7b3';

/**
 * THE ONE Generation-1 reserve replacement ledger. The path was already
 * pinned by the Option-B transition contract; no competing ledger exists.
 */
export const REPLACEMENT_LEDGER_PATH =
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json';
export const REPLACEMENT_LEDGER_RECORD = 'PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER';
export const REPLACEMENT_LEDGER_RECORD_KIND = 'RESERVE_REPLACEMENT_LEDGER_V2_GEN1';

export const WINDOW_PLAN_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_POST_V4_REPLACEMENT_AND_INDEX9_WINDOW_PLAN_V1.json';
export const WINDOW_PLAN_RECORD_KIND = 'OFFLINE_PRECOMMITTED_WINDOW_PLAN';

// ---------------------------------------------------------------------------
// B. FROZEN DRAW DIMENSIONS AND THE REPLACEMENT VOCABULARY.
// ---------------------------------------------------------------------------

export const SELECTION_COUNT = 110;
/** Reserve rank positions are 0..39. A 41st replacement is a refusal. */
export const RESERVE_COUNT = 40;
export const RESERVE_EXHAUSTION_REFUSAL = 'CORPUS_FREEZE_REFUSED';

/** Plan V1 SD2 `replacementLedgerFields`, verbatim and complete. */
export const FROZEN_REPLACEMENT_ENTRY_FIELDS = [
  'selectionIndex',
  'split',
  'replacedEcheRowKey',
  'replacementEcheRowKey',
  'reserveRankPosition',
  'reason',
  'recordedAtUtc',
] as const;

/** Plan V1 SD2 `replacementReasonTaxonomyIsMechanicalOnly`, in the plan's order. */
export const REPLACEMENT_REASONS = [
  'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
  'ACQUISITION_UNSUCCESSFUL_ROOT_AUTHORITY_FAILURE',
  'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED',
  'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
] as const;
export type ReplacementReason = (typeof REPLACEMENT_REASONS)[number];

/** Owner Clarification Q3 precedence, rank 1 first. */
export const REPLACEMENT_REASON_PRECEDENCE: readonly ReplacementReason[] = [
  'ACQUISITION_UNSUCCESSFUL_ROOT_AUTHORITY_FAILURE',
  'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED',
  'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
  'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
];

/**
 * The four current reasons, as the owner clarification recorded them from
 * durable evidence (b17503a). Governance facts: never recomputed from the
 * network, never reinterpreted.
 */
export const CURRENT_REPLACEMENT_REASONS: Readonly<Record<3 | 4 | 6 | 8, ReplacementReason>> = {
  3: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
  4: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
  6: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
  8: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
};

/** Whom a replacement entry replaced: derived, validated, never free-form. */
export type ReplacedOccupantKind = 'ORIGINAL_SELECTION' | 'RESERVE_REPLACEMENT';

// ---------------------------------------------------------------------------
// C. THE FROZEN ROOT TERMINAL REASONS (production `RootTerminalReason`).
// ---------------------------------------------------------------------------

/**
 * The eleven values `src/orgunits/orchestrator/rootRunner.ts` can produce,
 * copied rather than imported so this namespace names no production module.
 * A test reads the production union from source and requires equality.
 */
export const ROOT_TERMINAL_REASONS = [
  'INVALID_ROOT_AUTHORITY',
  'ROOT_REQUEST_REFUSED',
  'CROSS_DOMAIN_REDIRECT_REQUIRES_PROMOTION',
  'ROBOTS_BLOCKED_ROOT',
  'ROBOTS_UNREADABLE_ROOT',
  'PAGE_BUDGET_EXHAUSTED',
  'TOTAL_REQUEST_BUDGET_EXHAUSTED',
  'ALL_REMAINING_HOSTS_INADMISSIBLE',
  'NO_ELIGIBLE_HTML',
  'COMPLETED_WITH_CANDIDATES',
  'COMPLETED_WITH_NO_PROMISING_CANDIDATES',
] as const;
export type RootTerminalReason = (typeof ROOT_TERMINAL_REASONS)[number];

// ---------------------------------------------------------------------------
// D. THE WORK ITEM.
// ---------------------------------------------------------------------------

export type WorkItemKind = 'PRIMARY' | 'REPLACEMENT';

/**
 * One precommitted unit of live work. Its identity (`workItemId`) is built
 * from the selection index and reserve position ONLY - never an organisation
 * UUID, never an eche row key - so the gate can be reasoned about without
 * any institution identity in view.
 *
 *   PRIMARY      `P:<selectionIndex>`                 e.g. P:9
 *   REPLACEMENT  `R:<selectionIndex>:<reservePosition>` e.g. R:3:0
 */
export type ContinuationWorkItem =
  | {
      readonly kind: 'PRIMARY';
      readonly workItemId: string;
      readonly selectionIndex: number;
      readonly reserveRankPosition: null;
      readonly split: Split;
    }
  | {
      readonly kind: 'REPLACEMENT';
      readonly workItemId: string;
      readonly selectionIndex: number;
      readonly reserveRankPosition: number;
      readonly split: Split;
    };

export function primaryWorkItemId(selectionIndex: number): string {
  return `P:${String(selectionIndex)}`;
}

export function replacementWorkItemId(selectionIndex: number, reservePosition: number): string {
  return `R:${String(selectionIndex)}:${String(reservePosition)}`;
}

/**
 * WINDOW V1, in its frozen execution order. No sorting happens at run time:
 * the order was fixed before any network, by the owner clarification's
 * `nextWindowConceptDetail`.
 */
export const WINDOW_V1_WORK_ITEMS: readonly ContinuationWorkItem[] = [
  {
    kind: 'REPLACEMENT',
    workItemId: 'R:3:0',
    selectionIndex: 3,
    reserveRankPosition: 0,
    split: 'DEV_CONFIRM',
  },
  {
    kind: 'REPLACEMENT',
    workItemId: 'R:4:1',
    selectionIndex: 4,
    reserveRankPosition: 1,
    split: 'FINAL_HOLDOUT',
  },
  {
    kind: 'REPLACEMENT',
    workItemId: 'R:6:2',
    selectionIndex: 6,
    reserveRankPosition: 2,
    split: 'DEV_CONFIRM',
  },
  {
    kind: 'REPLACEMENT',
    workItemId: 'R:8:3',
    selectionIndex: 8,
    reserveRankPosition: 3,
    split: 'DEV_CONFIRM',
  },
  {
    kind: 'PRIMARY',
    workItemId: 'P:9',
    selectionIndex: 9,
    reserveRankPosition: null,
    split: 'FINAL_HOLDOUT',
  },
];

export const WINDOW_V1_SIZE = WINDOW_V1_WORK_ITEMS.length;

/** The failed slots Window V1 replaces, as the planner receives them. */
export const WINDOW_V1_PENDING_REPLACEMENT_SLOTS = [3, 4, 6, 8] as const;

// ---------------------------------------------------------------------------
// E. THE FROZEN PAUSE THRESHOLDS (Plan V1 `batchingPlan.pauseConditions`).
// ---------------------------------------------------------------------------

/** P1: INVALID_ROOT_AUTHORITY on >= 3 consecutive organisations. */
export const P1_CONSECUTIVE_ROOT_AUTHORITY_FAILURES = 3;
/** P2: ROBOTS_BLOCKED_ROOT or ROBOTS_UNREADABLE_ROOT on >= 3 consecutive organisations ... */
export const P2_CONSECUTIVE_ROBOTS_REFUSALS = 3;
/** ... or STRICTLY MORE THAN 40% of the planned window. */
export const P2_BATCH_PERCENT_STRICTLY_ABOVE = 40;
/** P3: runTerminalState FAILED on >= 2 consecutive organisations, or ANY ORCHESTRATION_ERROR. */
export const P3_CONSECUTIVE_FAILED_RUNS = 2;
/** P5: STRICTLY MORE THAN 30% of the planned window below the raw-page surrogate. */
export const P5_BATCH_PERCENT_STRICTLY_ABOVE = 30;
/**
 * The executable A2 P5 surrogate: a completed work item is LOW RAW YIELD when
 * its PRE-SD7 page-evidence count is below SD9's 4-page minimum. Formal SD7 /
 * SD9 still decide acquisition success later; >= 4 raw pages is NOT a success.
 */
export const P5_MIN_RAW_PAGE_EVIDENCE = 4 as const;
/** SD9's frozen minimum formal (post-SD7) page count per organisation. */
export const SD9_MIN_PAGES_PER_ORGANISATION = 4;

/** P6: > 10 replacements consumed before 50 successful organisations. Generation-global. */
export const P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR = 10;
export const P6_SUCCESS_FLOOR = 50;

/**
 * The smallest count that is STRICTLY MORE THAN `percent`% of `plannedSize`,
 * in integer arithmetic (count * 100 > plannedSize * percent), so no float
 * rounding can move a threshold. For a five-item window: P2 (40%) -> 3,
 * P5 (30%) -> 2.
 */
export function strictPercentThresholdCount(plannedSize: number, percent: number): number {
  if (!Number.isInteger(plannedSize) || plannedSize < 1) {
    throw new Error(`plannedSize must be a positive integer, got ${String(plannedSize)}`);
  }
  if (!Number.isInteger(percent) || percent < 0 || percent >= 100) {
    throw new Error(`percent must be an integer in 0..99, got ${String(percent)}`);
  }
  return Math.floor((plannedSize * percent) / 100) + 1;
}

export function exceedsStrictPercent(count: number, plannedSize: number, percent: number): boolean {
  return count * 100 > plannedSize * percent;
}

// ---------------------------------------------------------------------------
// F. PLAN NUMBERING vs THE HISTORICAL BATCH-01/02 HARNESS NAMES.
// ---------------------------------------------------------------------------

/**
 * The Batch-01/02 harness compressed and renumbered the plan's conditions
 * (it added P0 and shifted invariant -> P6, host -> P7). This gate uses the
 * PLAN'S numbering; this table is the only bridge between the two.
 */
export const PLAN_TO_HISTORICAL_HARNESS_NUMBERING = {
  P1: 'not executable in Batch 01/02',
  P2: 'not executable in Batch 01/02',
  P3: 'P3 (any FAILED)',
  P4: 'P4',
  P5: 'P5',
  P6: 'not executable in Batch 01/02 (no reserve usage was authorised)',
  P7: 'P0 input/root mismatch + historical P6 invariant/hash',
  P8: 'P7 host state',
} as const;

// ---------------------------------------------------------------------------
// G. THE GATE'S INPUT AND VERDICT TYPES.
// ---------------------------------------------------------------------------

/**
 * ONE completed work item, read back from its own durable run evidence.
 * Mechanical only: no page text, no semantic signal, no classifier output.
 */
export interface CompletedWorkObservation {
  readonly workItemId: string;
  readonly kind: WorkItemKind;
  readonly selectionIndex: number;
  readonly reserveRankPosition: number | null;
  /** RAW `orgunit_page_evidence` rows, pre-SD7, never deduplicated. */
  readonly rawPageEvidenceCount: number;
  readonly runTerminalState: 'COMPLETED' | 'FAILED';
  /** The root's terminal reason; null when the run failed before a root summary existed. */
  readonly rootTerminalReason: RootTerminalReason | null;
  /** The run's completion row carries error kind ORCHESTRATION_ERROR. */
  readonly orchestrationError: boolean;
  /** P4: any page-evidence / candidate INSERT failure, or a missing completion row. */
  readonly persistenceAnomaly: boolean;
  /** P8: host sleep/wake, or a wall-clock gap inconsistent with the pacing clock. */
  readonly hostStateAnomaly: boolean;
  /** P7: this item's frozen input, draw entry or root authority did not match. */
  readonly inputOrRootMismatch: boolean;
}

/**
 * The named P7 invariants the caller proves BEFORE the first work item, and
 * re-proves before every later one. Every value must be `true`.
 */
export interface WindowPreflightInvariants {
  readonly frameBindingValid: boolean;
  readonly drawBindingValid: boolean;
  readonly ownerClarificationBindingValid: boolean;
  readonly replacementLedgerValid: boolean;
  readonly replacementLedgerExtendsGenesis: boolean;
  readonly windowPlanValid: boolean;
  readonly workItemsMatchFrozenPlan: boolean;
  readonly workItemDrawEntriesMatch: boolean;
  readonly replacementAssignmentsRecorded: boolean;
  readonly currentOccupantsMatch: boolean;
}

export interface WindowPreflight {
  readonly invariants: WindowPreflightInvariants;
  /** The validated canonical ledger's entry count: reserveConsumedCount by definition. */
  readonly ledgerEntryCount: number;
}

/** Generation-global state P6 reads. Never reset at a window boundary. */
export interface GenerationState {
  /** Finalised (adjudicated SD9) successes BEFORE this window. */
  readonly successfulOrganisationCount: number;
  /** Number of VALID canonical replacement-ledger entries. */
  readonly reserveConsumedCount: number;
}

export interface ContinuationWindowGateInput {
  /** The precommitted work items, exactly as the frozen plan lists them. */
  readonly window: readonly ContinuationWorkItem[];
  /** The frozen planned window size - the P2/P5 percentage denominator. */
  readonly plannedWindowSize: number;
  readonly preflight: WindowPreflight;
  readonly generation: GenerationState;
  /** Completed items of THIS window only, append-only, in execution order. */
  readonly completed: readonly CompletedWorkObservation[];
}

export type PauseCondition = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8';

export type PauseDecision =
  | 'PAUSE_P7_INVARIANT_MISMATCH'
  | 'PAUSE_P4_PERSISTENCE_ANOMALY'
  | 'PAUSE_P8_HOST_STATE_ANOMALY'
  | 'PAUSE_P3_ORCHESTRATION_ERROR'
  | 'PAUSE_P1_REPEATED_ROOT_AUTHORITY_FAILURE'
  | 'PAUSE_P2_ROBOTS_REFUSAL'
  | 'PAUSE_P3_CONSECUTIVE_RUN_FAILURE'
  | 'PAUSE_P6_UNEXPECTED_RESERVE_USAGE'
  | 'PAUSE_P5_LOW_RAW_YIELD';

/**
 * REPORTING precedence for the single `decision` field. Every trigger stops
 * the window; the order changes only which one is named first.
 */
export const PAUSE_DECISION_PRECEDENCE: readonly PauseDecision[] = [
  'PAUSE_P7_INVARIANT_MISMATCH',
  'PAUSE_P4_PERSISTENCE_ANOMALY',
  'PAUSE_P8_HOST_STATE_ANOMALY',
  'PAUSE_P3_ORCHESTRATION_ERROR',
  'PAUSE_P1_REPEATED_ROOT_AUTHORITY_FAILURE',
  'PAUSE_P2_ROBOTS_REFUSAL',
  'PAUSE_P3_CONSECUTIVE_RUN_FAILURE',
  'PAUSE_P6_UNEXPECTED_RESERVE_USAGE',
  'PAUSE_P5_LOW_RAW_YIELD',
];

export type ContinuationWindowDecision =
  'CONTINUE_TO_NEXT_WORK_ITEM' | 'WINDOW_COMPLETE' | PauseDecision;

export interface TriggeredCondition {
  readonly condition: PauseCondition;
  readonly decision: PauseDecision;
  /** Which arm fired, in plain mechanical terms. */
  readonly arm: string;
}

export interface ContinuationWindowVerdict {
  readonly decision: ContinuationWindowDecision;
  /** True ONLY for CONTINUE_TO_NEXT_WORK_ITEM. */
  readonly mayStartNextWorkItem: boolean;
  /** Every trigger, in reporting precedence - none is hidden by another. */
  readonly triggeredConditions: readonly TriggeredCondition[];
  readonly nextWorkItemId: string | null;
  readonly completedCount: number;
  readonly remainingWorkItemIds: readonly string[];
  readonly plannedWindowSize: number;
  readonly p2PercentageThresholdCount: number;
  readonly p5LowYieldThresholdCount: number;
  readonly windowLowYieldCount: number;
  readonly windowRobotsRefusalCount: number;
  readonly maxConsecutiveRootAuthorityFailures: number;
  readonly maxConsecutiveRobotsRefusals: number;
  readonly maxConsecutiveFailedRuns: number;
  readonly trailingP1Count: number;
  readonly trailingP2Count: number;
  readonly trailingP3FailedCount: number;
  readonly generationSuccessfulCount: number;
  readonly generationReserveConsumedCount: number;
}

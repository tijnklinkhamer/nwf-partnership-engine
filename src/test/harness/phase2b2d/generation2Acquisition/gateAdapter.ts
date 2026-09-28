/**
 * THE GENERATION-2 GATE ADAPTER, AND THE OPERATIONAL CONCURRENCY-INTEGRITY
 * CHECKS. PURE.
 *
 * P1-P6 AND P8: THE LANDED GATE, UNCHANGED
 *
 *   The landed `evaluateContinuationWindowGate` is reused for P1-P6 and P8
 *   because those arms are genuinely generation-independent: they read only
 *   the window's own observations, the planned window size, and the
 *   generation's (success count, reserves consumed) pair. Nothing Generation-1
 *   specific leaks through:
 *
 *     - no generation id is read by the gate;
 *     - no 40-reserve bound: `reserveRankPosition` is compared for equality
 *       with the precommitted item only - here it carries the GENERATION-2
 *       position, which may exceed 39;
 *     - no `R:<slot>:<reserve>` assumption: ids are compared as opaque
 *       strings, and this adapter supplies `G2R:`/`G2P:` ids from the spec;
 *     - no Generation-1 replacement path and no
 *       `currentOccupantForSelectionIndex`: the gate calls neither.
 *
 *   P6 reads the Generation-2 ledger's entry count as reserves consumed and
 *   the INHERITED success count (75 at genesis) - never reset to zero.
 *
 * P7: GENERATION-2 SPECIFIC
 *
 *   The landed gate's P7 reads a Generation-1-shaped preflight. This adapter
 *   does not dress Generation-2 invariants up as Generation-1 ones. It hands
 *   the landed gate a preflight whose Generation-1 invariant slots are
 *   explicitly DELEGATED (every one true, by name, because Generation-1 P7 is
 *   not the authority here) while keeping the landed cross-check that
 *   reserves consumed equals the validated ledger entry count live. It then
 *   adds one P7 trigger per false Generation-2 invariant, plus a P7 trigger
 *   when the success count differs from the precommitted planning state.
 *   P7 is the gate's highest reporting precedence, so a Generation-2 P7
 *   trigger always names the decision and always stops.
 *
 * P8 IS FROZEN; CONCURRENCY IS A SEPARATE OUTER STOP
 *
 *   P8 means exactly what Plan V1 froze: host sleep/wake, or a wall-clock gap
 *   inconsistent with the pacing clock. A future live driver sets
 *   `CompletedWorkObservation.hostStateAnomaly` ONLY from that host / pacing
 *   evidence. `evaluatePreItemQuietPeriod`, `evaluateInItemMonitoring` and
 *   `evaluateFullValidationMonitoring` are OPERATIONAL CONCURRENCY-INTEGRITY
 *   checks over process-monitor samples: none returns `hostStateAnomaly`, and
 *   a competing process or a monitor gap never becomes P8 by itself
 *   (GENERATION2_CONCURRENCY_INTEGRITY_STOP_IS_DISTINCT_FROM_FROZEN_P8_V1).
 *   `decideAfterItem` combines the two: the frozen gate is evaluated on its
 *   own inputs, and a failed integrity check stops continuation regardless of
 *   an otherwise clean P1-P8 result. They perform no monitoring themselves.
 */

import type {
  CompletedWorkObservation,
  ContinuationWindowVerdict,
  ContinuationWorkItem,
  TriggeredCondition,
  WindowPreflightInvariants,
} from '../continuationWindow/windowContract.js';
import { evaluateContinuationWindowGate } from '../continuationWindow/windowGate.js';
import {
  CONCURRENCY_CLASSIFICATIONS,
  LIVE_CRITICAL_SECTION_POLICY,
  type ConcurrencyClassification,
} from './operationalContract.js';
import { GENERATION2_P7_INVARIANT_NAMES, type Generation2Preflight } from './preflight.js';
import type { Generation2WindowSpec } from './windowSpec.js';

/** Generation-1 P7 slots, delegated by name to the Generation-2 preflight. */
export const GENERATION1_P7_DELEGATED_TO_GENERATION2_PREFLIGHT: WindowPreflightInvariants = {
  frameBindingValid: true,
  drawBindingValid: true,
  ownerClarificationBindingValid: true,
  replacementLedgerValid: true,
  replacementLedgerExtendsGenesis: true,
  windowPlanValid: true,
  workItemsMatchFrozenPlan: true,
  workItemDrawEntriesMatch: true,
  replacementAssignmentsRecorded: true,
  currentOccupantsMatch: true,
};

export function windowOf(spec: Generation2WindowSpec): ContinuationWorkItem[] {
  return spec.workItems.map((item) =>
    item.kind === 'REPLACEMENT'
      ? {
          kind: 'REPLACEMENT',
          workItemId: item.workItemId,
          selectionIndex: item.selectionIndex,
          reserveRankPosition: item.generation2ReserveRankPosition as number,
          split: item.split,
        }
      : {
          kind: 'PRIMARY',
          workItemId: item.workItemId,
          selectionIndex: item.selectionIndex,
          reserveRankPosition: null,
          split: item.split,
        },
  );
}

export interface Generation2GateInput {
  readonly spec: Generation2WindowSpec;
  readonly preflight: Generation2Preflight;
  readonly generation: {
    /** Adjudicated successes BEFORE this window: inherited + Generation-2. */
    readonly successfulOrganisationCount: number;
    /** VALID Generation-2 ledger entries. */
    readonly reserveConsumedCount: number;
  };
  /** Completed items of THIS window only, in execution order. */
  readonly completed: readonly CompletedWorkObservation[];
}

export function evaluateGeneration2WindowGate(
  input: Generation2GateInput,
): ContinuationWindowVerdict {
  const { spec, preflight, generation, completed } = input;
  const generic = evaluateContinuationWindowGate({
    window: windowOf(spec),
    plannedWindowSize: spec.plannedWindowSize,
    preflight: {
      invariants: GENERATION1_P7_DELEGATED_TO_GENERATION2_PREFLIGHT,
      ledgerEntryCount: preflight.currentLedgerEntryCount,
    },
    generation,
    completed,
  });

  const generation2P7: TriggeredCondition[] = [];
  for (const name of GENERATION2_P7_INVARIANT_NAMES) {
    if (preflight.invariants[name] !== true) {
      generation2P7.push({
        condition: 'P7',
        decision: 'PAUSE_P7_INVARIANT_MISMATCH',
        arm: `Generation-2 preflight invariant ${name} does not hold`,
      });
    }
  }
  if (generation.successfulOrganisationCount !== spec.planningState.successfulOrganisationCount) {
    generation2P7.push({
      condition: 'P7',
      decision: 'PAUSE_P7_INVARIANT_MISMATCH',
      arm: 'successfulOrganisationCount is not the precommitted planning state',
    });
  }
  if (generation2P7.length === 0) return generic;
  return {
    ...generic,
    decision: 'PAUSE_P7_INVARIANT_MISMATCH',
    mayStartNextWorkItem: false,
    nextWorkItemId: null,
    triggeredConditions: [...generation2P7, ...generic.triggeredConditions],
  };
}

// ---------------------------------------------------------------------------
// Operational concurrency integrity, as pure checks over monitor samples.
// DISTINCT from P1-P8: nothing here reads or produces `hostStateAnomaly`.
// ---------------------------------------------------------------------------

export interface ProcessMonitorSample {
  /** Seconds since the epoch, as the live driver's monitor recorded them. */
  readonly atEpochSeconds: number;
  /** Competing validate / vitest / A3 execution-agent processes observed. */
  readonly competingProcessCount: number;
}

export interface QuietPeriodVerdict {
  readonly mayStartItem: boolean;
  readonly consecutiveCleanSeconds: number;
  /** Null when the item may start; never a P1-P8 condition. */
  readonly classification: typeof CONCURRENCY_CLASSIFICATIONS.preItem | null;
  readonly reasons: readonly string[];
}

/**
 * Before each live item: A3 execution agents quiesced, and the samples
 * immediately preceding the start show >= 120 consecutive clean seconds with
 * no gap above 5 seconds (and the last sample within 5 seconds of the start).
 * A failure means the item does not start - there is no completed
 * observation, so there is nothing P8 could be attached to.
 */
export function evaluatePreItemQuietPeriod(input: {
  readonly a3ExecutionAgentsQuiesced: boolean;
  readonly samples: readonly ProcessMonitorSample[];
  readonly itemStartEpochSeconds: number;
}): QuietPeriodVerdict {
  const policy = LIVE_CRITICAL_SECTION_POLICY;
  const reasons: string[] = [];
  if (!input.a3ExecutionAgentsQuiesced) reasons.push('A3 execution agents are not quiesced');
  const before = input.samples
    .filter((sample) => sample.atEpochSeconds <= input.itemStartEpochSeconds)
    .sort((a, b) => a.atEpochSeconds - b.atEpochSeconds);
  let clean = 0;
  let cursor = input.itemStartEpochSeconds;
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const sample = before[i]!;
    if (cursor - sample.atEpochSeconds > policy.maxProcessMonitoringIntervalSeconds) break;
    if (sample.competingProcessCount !== 0) break;
    clean = input.itemStartEpochSeconds - sample.atEpochSeconds;
    cursor = sample.atEpochSeconds;
  }
  if (clean < policy.consecutiveCleanSecondsBeforeEachItem) {
    reasons.push(
      `${String(clean)} consecutive clean seconds before the item, ${String(policy.consecutiveCleanSecondsBeforeEachItem)} required`,
    );
  }
  const mayStartItem = reasons.length === 0;
  return {
    mayStartItem,
    consecutiveCleanSeconds: clean,
    classification: mayStartItem ? null : CONCURRENCY_CLASSIFICATIONS.preItem,
    reasons,
  };
}

/**
 * The verdict of continuous process monitoring over one bounded interval.
 * Deliberately carries NO `hostStateAnomaly`: concurrency is not P8.
 */
export interface OperationalConcurrencyVerdict {
  /** No competing process AND sufficient monitor coverage. */
  readonly integritySatisfied: boolean;
  /** A competing correctness-critical process was observed. */
  readonly deviationDetected: boolean;
  /** Every monitor gap (including to the interval's ends) was <= 5 seconds. */
  readonly monitorCoverageSufficient: boolean;
  /** True whenever integrity is not satisfied: STOP operational continuation. */
  readonly operationalStop: boolean;
  readonly classifications: readonly ConcurrencyClassification[];
  readonly reasons: readonly string[];
}

function scanInterval(
  samples: readonly ProcessMonitorSample[],
  startEpochSeconds: number,
  endEpochSeconds: number,
): { competing: boolean; gap: boolean } {
  const limit = LIVE_CRITICAL_SECTION_POLICY.maxProcessMonitoringIntervalSeconds;
  const within = samples
    .filter(
      (sample) =>
        sample.atEpochSeconds >= startEpochSeconds && sample.atEpochSeconds <= endEpochSeconds,
    )
    .sort((a, b) => a.atEpochSeconds - b.atEpochSeconds);
  let competing = false;
  let gap = false;
  let previous = startEpochSeconds;
  for (const sample of within) {
    if (sample.atEpochSeconds - previous > limit) gap = true;
    if (sample.competingProcessCount !== 0) competing = true;
    previous = sample.atEpochSeconds;
  }
  if (endEpochSeconds - previous > limit) gap = true;
  return { competing, gap };
}

/**
 * During each live item: continuous <= 5 s monitoring, and no competing
 * process. A competing process is CONCURRENCY_INTEGRITY_DEVIATION_DETECTED_
 * DURING_ITEM; a monitor gap is CONCURRENCY_MONITOR_COVERAGE_INSUFFICIENT -
 * an absence of process samples is not evidence of sleep or of a clock
 * discontinuity. Either stops continuation for owner review; the running
 * invocation is allowed to finish and its evidence is preserved, never
 * automatically invalidated.
 */
export function evaluateInItemMonitoring(input: {
  readonly samples: readonly ProcessMonitorSample[];
  readonly itemStartEpochSeconds: number;
  readonly itemEndEpochSeconds: number;
}): OperationalConcurrencyVerdict {
  const { competing, gap } = scanInterval(
    input.samples,
    input.itemStartEpochSeconds,
    input.itemEndEpochSeconds,
  );
  const classifications: ConcurrencyClassification[] = [];
  const reasons: string[] = [];
  if (competing) {
    classifications.push(CONCURRENCY_CLASSIFICATIONS.midItem);
    reasons.push('a competing process ran mid-item');
  }
  if (gap) {
    classifications.push(CONCURRENCY_CLASSIFICATIONS.monitorGap);
    reasons.push('a process-monitor gap above 5 seconds');
  }
  return {
    integritySatisfied: !competing && !gap,
    deviationDetected: competing,
    monitorCoverageSufficient: !gap,
    operationalStop: competing || gap,
    classifications,
    reasons,
  };
}

/**
 * During a full validation: the same distinction. A competing process or a
 * monitor gap means VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED. The
 * already-running validate finishes and its exit code stays historical
 * evidence; no automatic rerun is authorised.
 */
export function evaluateFullValidationMonitoring(input: {
  readonly samples: readonly ProcessMonitorSample[];
  readonly validationStartEpochSeconds: number;
  readonly validationEndEpochSeconds: number;
}): OperationalConcurrencyVerdict {
  const { competing, gap } = scanInterval(
    input.samples,
    input.validationStartEpochSeconds,
    input.validationEndEpochSeconds,
  );
  const reasons: string[] = [];
  if (competing) reasons.push('a competing process ran during full validation');
  if (gap) reasons.push('a process-monitor gap above 5 seconds during full validation');
  return {
    integritySatisfied: !competing && !gap,
    deviationDetected: competing,
    monitorCoverageSufficient: !gap,
    operationalStop: competing || gap,
    classifications: competing || gap ? [CONCURRENCY_CLASSIFICATIONS.validation] : [],
    reasons,
  };
}

export interface AfterItemDecision {
  /** The frozen P1-P8 verdict, computed from its own inputs only. */
  readonly gate: ContinuationWindowVerdict;
  /** The outer operational concurrency verdict, reported separately. */
  readonly concurrency: OperationalConcurrencyVerdict;
  /** Both must allow it: an integrity failure stops even a clean P1-P8 result. */
  readonly mayStartNextWorkItem: boolean;
  readonly requiresOwnerReview: boolean;
}

/**
 * After an item: the frozen gate and the concurrency check are evaluated
 * independently and never mixed - the concurrency verdict does not reach
 * `hostStateAnomaly`, and the gate verdict is returned exactly as computed.
 */
export function decideAfterItem(input: {
  readonly gate: ContinuationWindowVerdict;
  readonly concurrency: OperationalConcurrencyVerdict;
}): AfterItemDecision {
  const mayStartNextWorkItem =
    input.gate.mayStartNextWorkItem && input.concurrency.integritySatisfied;
  return {
    gate: input.gate,
    concurrency: input.concurrency,
    mayStartNextWorkItem,
    requiresOwnerReview: input.concurrency.operationalStop,
  };
}

export interface BeforeItemDecision {
  readonly quietPeriod: QuietPeriodVerdict;
  /** Null when the concurrency precondition failed: the gate is not consulted. */
  readonly gate: ContinuationWindowVerdict | null;
  readonly mayStartItem: boolean;
}

/**
 * Before an item, in order: A3 quiescence and the 120-second clean gate
 * FIRST; only then the Generation-2 gate (P7, then the frozen P1-P8). A
 * failed precondition means the item never starts and no P1-P8 condition is
 * manufactured for it.
 */
export function decideBeforeItem(input: {
  readonly quietPeriod: QuietPeriodVerdict;
  readonly evaluateGate: () => ContinuationWindowVerdict;
}): BeforeItemDecision {
  if (!input.quietPeriod.mayStartItem) {
    return { quietPeriod: input.quietPeriod, gate: null, mayStartItem: false };
  }
  const gate = input.evaluateGate();
  return { quietPeriod: input.quietPeriod, gate, mayStartItem: gate.mayStartNextWorkItem };
}

/**
 * THE PURE CONTINUATION-WINDOW GATE - ALL EIGHT FROZEN PLAN V1 PAUSE
 * CONDITIONS, UNDER THE PLAN'S NUMBERING.
 *
 * Call it once before the first work item (zero completed: "may the window
 * start?") and again after EVERY completed work item. Start the next item
 * only on CONTINUE_TO_NEXT_WORK_ITEM. It decides; it never acts.
 *
 *   P1  INVALID_ROOT_AUTHORITY on >= 3 consecutive items            window
 *   P2  ROBOTS_BLOCKED_ROOT/ROBOTS_UNREADABLE_ROOT on >= 3
 *       consecutive items, OR > 40% of the PLANNED window size      window
 *   P3  FAILED on >= 2 consecutive items                            window
 *       OR any ORCHESTRATION_ERROR                                  immediate
 *   P4  any persistence anomaly                                     immediate
 *   P5  > 30% of the PLANNED window size with raw pages < 4         window
 *   P6  > 10 replacements consumed before 50 successes              generation
 *   P7  any frame/draw/ledger/plan/work-item invariant mismatch     immediate
 *   P8  any host-state anomaly during this live window              immediate
 *
 * WINDOW-LOCAL (Owner Clarification Q4). `completed` holds THIS window's
 * items only. There is no input through which a closed window, the Batch-02
 * history or the v4 targeted revalidations could reach the gate; an
 * observation that is not this window's next precommitted item is itself a
 * P7 invariant mismatch.
 *
 * PERCENTAGE DENOMINATOR. P2 and P5 divide by the frozen planned window
 * size, never by the completed count - otherwise one low-yield item after
 * one run would read as 100% of "the batch".
 *
 * STICKY WITHOUT STORED STATE. `completed` only grows and, within a window,
 * the generation inputs are fixed (P6 reads the pre-window adjudicated
 * success count and the ledger's entry count, which only grows). Every arm
 * is monotonic in those inputs, so once any condition fires, every later
 * call for the same window pauses too.
 *
 * REPORTING PRECEDENCE only chooses which trigger `decision` names first;
 * EVERY trigger is listed in `triggeredConditions` and every one stops.
 *
 * NOTE ON P3. The production orchestrator writes error kind
 * ORCHESTRATION_ERROR on every FAILED completion row, so in practice the
 * immediate arm fires on the first FAILED item. The two arms are still kept
 * mechanically distinct here because the observation carries them as two
 * separate facts.
 *
 * THIS MODULE IS PURE. No socket, database, filesystem, clock, randomness,
 * environment read or process.
 */

import {
  P1_CONSECUTIVE_ROOT_AUTHORITY_FAILURES,
  P2_BATCH_PERCENT_STRICTLY_ABOVE,
  P2_CONSECUTIVE_ROBOTS_REFUSALS,
  P3_CONSECUTIVE_FAILED_RUNS,
  P5_BATCH_PERCENT_STRICTLY_ABOVE,
  P5_MIN_RAW_PAGE_EVIDENCE,
  P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR,
  P6_SUCCESS_FLOOR,
  PAUSE_DECISION_PRECEDENCE,
  ROOT_TERMINAL_REASONS,
  exceedsStrictPercent,
  strictPercentThresholdCount,
  type CompletedWorkObservation,
  type ContinuationWindowGateInput,
  type ContinuationWindowVerdict,
  type TriggeredCondition,
} from './windowContract.js';

function maxConsecutive<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  let best = 0;
  let run = 0;
  for (const value of values) {
    run = predicate(value) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function trailing<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  let count = 0;
  for (let i = values.length - 1; i >= 0 && predicate(values[i]!); i -= 1) count += 1;
  return count;
}

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isRootAuthorityFailure = (o: CompletedWorkObservation): boolean =>
  o.rootTerminalReason === 'INVALID_ROOT_AUTHORITY';
const isRobotsRefusal = (o: CompletedWorkObservation): boolean =>
  o.rootTerminalReason === 'ROBOTS_BLOCKED_ROOT' ||
  o.rootTerminalReason === 'ROBOTS_UNREADABLE_ROOT';
const isFailedRun = (o: CompletedWorkObservation): boolean => o.runTerminalState === 'FAILED';
const isLowRawYield = (o: CompletedWorkObservation): boolean =>
  o.rawPageEvidenceCount < P5_MIN_RAW_PAGE_EVIDENCE;

export function evaluateContinuationWindowGate(
  input: ContinuationWindowGateInput,
): ContinuationWindowVerdict {
  const { window, completed, preflight, generation } = input;
  const triggers: TriggeredCondition[] = [];
  const p7 = (arm: string): void => {
    triggers.push({ condition: 'P7', decision: 'PAUSE_P7_INVARIANT_MISMATCH', arm });
  };

  // The planned size is the percentage denominator; it must be the window's own.
  const sizeValid =
    Number.isInteger(input.plannedWindowSize) &&
    input.plannedWindowSize >= 1 &&
    input.plannedWindowSize === window.length;
  const plannedWindowSize = sizeValid ? input.plannedWindowSize : Math.max(1, window.length);
  if (!sizeValid) p7('plannedWindowSize is not the precommitted window length');
  const ids = window.map((item) => item.workItemId);
  if (new Set(ids).size !== ids.length) p7('the precommitted window repeats a work item');

  // ---- P7: preflight invariants and cross-bindings -------------------------
  for (const [name, holds] of Object.entries(preflight.invariants)) {
    if (holds !== true) p7(`preflight invariant ${name} does not hold`);
  }
  if (
    !isNonNegativeInteger(generation.reserveConsumedCount) ||
    !isNonNegativeInteger(generation.successfulOrganisationCount)
  ) {
    p7('generation state is not a pair of non-negative integers');
  } else if (preflight.ledgerEntryCount !== generation.reserveConsumedCount) {
    p7('reserveConsumedCount is not the validated ledger entry count');
  }

  // ---- P7: every observation must be this window's next precommitted item --
  if (completed.length > window.length) {
    p7('an observation exists beyond the precommitted window; no further work item exists');
  }
  completed.forEach((observation, i) => {
    const expected = window[i];
    if (
      expected === undefined ||
      observation.workItemId !== expected.workItemId ||
      observation.kind !== expected.kind ||
      observation.selectionIndex !== expected.selectionIndex ||
      observation.reserveRankPosition !== expected.reserveRankPosition
    ) {
      p7(`observation ${String(i)} is not precommitted work item ${String(i)}`);
    }
    if (!isNonNegativeInteger(observation.rawPageEvidenceCount)) {
      p7(`observation ${String(i)} carries a malformed raw page count`);
    }
    if (
      observation.rootTerminalReason !== null &&
      !(ROOT_TERMINAL_REASONS as readonly string[]).includes(observation.rootTerminalReason)
    ) {
      p7(`observation ${String(i)} carries an unknown root terminal reason`);
    }
    if (observation.inputOrRootMismatch) {
      p7(`observation ${String(i)} reported an input, draw-entry or root mismatch`);
    }
  });

  // ---- P4 / P8 / P3-immediate ---------------------------------------------
  completed.forEach((observation, i) => {
    if (observation.persistenceAnomaly) {
      triggers.push({
        condition: 'P4',
        decision: 'PAUSE_P4_PERSISTENCE_ANOMALY',
        arm: `persistence anomaly on observation ${String(i)}`,
      });
    }
    if (observation.hostStateAnomaly) {
      triggers.push({
        condition: 'P8',
        decision: 'PAUSE_P8_HOST_STATE_ANOMALY',
        arm: `host-state anomaly on observation ${String(i)}`,
      });
    }
    if (observation.orchestrationError) {
      triggers.push({
        condition: 'P3',
        decision: 'PAUSE_P3_ORCHESTRATION_ERROR',
        arm: `ORCHESTRATION_ERROR on observation ${String(i)}`,
      });
    }
  });

  // ---- P1 ------------------------------------------------------------------
  const maxP1 = maxConsecutive(completed, isRootAuthorityFailure);
  if (maxP1 >= P1_CONSECUTIVE_ROOT_AUTHORITY_FAILURES) {
    triggers.push({
      condition: 'P1',
      decision: 'PAUSE_P1_REPEATED_ROOT_AUTHORITY_FAILURE',
      arm: `INVALID_ROOT_AUTHORITY on ${String(maxP1)} consecutive items (>= ${String(P1_CONSECUTIVE_ROOT_AUTHORITY_FAILURES)})`,
    });
  }

  // ---- P2 ------------------------------------------------------------------
  const maxP2 = maxConsecutive(completed, isRobotsRefusal);
  const robotsCount = completed.filter(isRobotsRefusal).length;
  const p2Threshold = strictPercentThresholdCount(
    plannedWindowSize,
    P2_BATCH_PERCENT_STRICTLY_ABOVE,
  );
  if (maxP2 >= P2_CONSECUTIVE_ROBOTS_REFUSALS) {
    triggers.push({
      condition: 'P2',
      decision: 'PAUSE_P2_ROBOTS_REFUSAL',
      arm: `robots refusal/unreadability on ${String(maxP2)} consecutive items (>= ${String(P2_CONSECUTIVE_ROBOTS_REFUSALS)})`,
    });
  }
  if (exceedsStrictPercent(robotsCount, plannedWindowSize, P2_BATCH_PERCENT_STRICTLY_ABOVE)) {
    triggers.push({
      condition: 'P2',
      decision: 'PAUSE_P2_ROBOTS_REFUSAL',
      arm: `robots refusal/unreadability on ${String(robotsCount)} of ${String(plannedWindowSize)} planned items (> ${String(P2_BATCH_PERCENT_STRICTLY_ABOVE)}%)`,
    });
  }

  // ---- P3 consecutive ------------------------------------------------------
  const maxP3 = maxConsecutive(completed, isFailedRun);
  if (maxP3 >= P3_CONSECUTIVE_FAILED_RUNS) {
    triggers.push({
      condition: 'P3',
      decision: 'PAUSE_P3_CONSECUTIVE_RUN_FAILURE',
      arm: `runTerminalState FAILED on ${String(maxP3)} consecutive items (>= ${String(P3_CONSECUTIVE_FAILED_RUNS)})`,
    });
  }

  // ---- P6 (generation-global) ----------------------------------------------
  if (
    isNonNegativeInteger(generation.reserveConsumedCount) &&
    isNonNegativeInteger(generation.successfulOrganisationCount) &&
    generation.reserveConsumedCount > P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR &&
    generation.successfulOrganisationCount < P6_SUCCESS_FLOOR
  ) {
    triggers.push({
      condition: 'P6',
      decision: 'PAUSE_P6_UNEXPECTED_RESERVE_USAGE',
      arm: `${String(generation.reserveConsumedCount)} replacements consumed with ${String(generation.successfulOrganisationCount)} successful organisations (> ${String(P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR)} before ${String(P6_SUCCESS_FLOOR)})`,
    });
  }

  // ---- P5 ------------------------------------------------------------------
  const lowYieldCount = completed.filter(isLowRawYield).length;
  const p5Threshold = strictPercentThresholdCount(
    plannedWindowSize,
    P5_BATCH_PERCENT_STRICTLY_ABOVE,
  );
  if (exceedsStrictPercent(lowYieldCount, plannedWindowSize, P5_BATCH_PERCENT_STRICTLY_ABOVE)) {
    triggers.push({
      condition: 'P5',
      decision: 'PAUSE_P5_LOW_RAW_YIELD',
      arm: `raw pages < ${String(P5_MIN_RAW_PAGE_EVIDENCE)} on ${String(lowYieldCount)} of ${String(plannedWindowSize)} planned items (> ${String(P5_BATCH_PERCENT_STRICTLY_ABOVE)}%)`,
    });
  }

  const ordered = triggers
    .map((trigger, i) => ({ trigger, i }))
    .sort(
      (a, b) =>
        PAUSE_DECISION_PRECEDENCE.indexOf(a.trigger.decision) -
          PAUSE_DECISION_PRECEDENCE.indexOf(b.trigger.decision) || a.i - b.i,
    )
    .map(({ trigger }) => trigger);

  const remaining = window.slice(Math.min(completed.length, window.length));
  const base = {
    triggeredConditions: ordered,
    completedCount: completed.length,
    remainingWorkItemIds: remaining.map((item) => item.workItemId),
    plannedWindowSize,
    p2PercentageThresholdCount: p2Threshold,
    p5LowYieldThresholdCount: p5Threshold,
    windowLowYieldCount: lowYieldCount,
    windowRobotsRefusalCount: robotsCount,
    maxConsecutiveRootAuthorityFailures: maxP1,
    maxConsecutiveRobotsRefusals: maxP2,
    maxConsecutiveFailedRuns: maxP3,
    trailingP1Count: trailing(completed, isRootAuthorityFailure),
    trailingP2Count: trailing(completed, isRobotsRefusal),
    trailingP3FailedCount: trailing(completed, isFailedRun),
    generationSuccessfulCount: generation.successfulOrganisationCount,
    generationReserveConsumedCount: generation.reserveConsumedCount,
  };

  const first = ordered[0];
  if (first !== undefined) {
    return { ...base, decision: first.decision, mayStartNextWorkItem: false, nextWorkItemId: null };
  }
  const next = remaining[0];
  if (next === undefined) {
    // Nothing paused and nothing is left: finished, which is not permission.
    return {
      ...base,
      decision: 'WINDOW_COMPLETE',
      mayStartNextWorkItem: false,
      nextWorkItemId: null,
    };
  }
  return {
    ...base,
    decision: 'CONTINUE_TO_NEXT_WORK_ITEM',
    mayStartNextWorkItem: true,
    nextWorkItemId: next.workItemId,
  };
}

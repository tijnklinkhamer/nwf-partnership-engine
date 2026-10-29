/**
 * THE PURE BETWEEN-RUN GATE.
 *
 * Call this after EVERY completed organisation, and start the next one only
 * when it returns `CONTINUE`. It decides; it never acts.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read, no process.
 */

import {
  BATCH_02_MAX_ORGANISATIONS,
  BATCH_02_SELECTION_INDICES,
  MIN_RAW_PAGE_EVIDENCE_PER_ORGANISATION,
  P5_LOW_RAW_YIELD_THRESHOLD,
  type BetweenRunGateVerdict,
  type CompletedRunObservation,
} from './gateContract.js';

export interface BetweenRunGateInput {
  /**
   * EVERY Batch-02 organisation that has completed so far, in execution order.
   * The caller appends one entry per completed run and never removes one.
   */
  readonly completedRuns: readonly CompletedRunObservation[];
}

/**
 * WHY PAUSE IS STICKY WITHOUT ANY STORED STATE.
 *
 *   `completedRuns` only ever grows: the operator appends the run that just
 *   finished and never removes an earlier one. Every condition below is
 *   MONOTONIC in that list - a fatal flag already present stays present, and
 *   `lowRawYieldCount` is a count over a growing list and so can never
 *   decrease. So once the gate has returned a PAUSE for a batch it returns a
 *   PAUSE for every later call in that batch, and a high-yield organisation
 *   afterwards cannot un-trigger it. Stickiness is a property of the data,
 *   not a flag someone has to remember to set - which is exactly the class of
 *   omission that produced the Batch-01 deviation.
 */
export function evaluateBetweenRunGate(input: BetweenRunGateInput): BetweenRunGateVerdict {
  const completed = input.completedRuns;

  const lowRawYield = completed.filter(
    (run) => run.rawPageEvidenceCount < MIN_RAW_PAGE_EVIDENCE_PER_ORGANISATION,
  );
  const executed = new Set(completed.map((run) => run.selectionIndex));
  const remaining = BATCH_02_SELECTION_INDICES.filter((index) => !executed.has(index));

  const base = {
    completedCount: completed.length,
    lowRawYieldCount: lowRawYield.length,
    lowRawYieldSelectionIndices: lowRawYield.map((run) => run.selectionIndex),
    remainingSelectionIndices: remaining,
  } as const;

  const pause = (decision: BetweenRunGateVerdict['decision']): BetweenRunGateVerdict => ({
    ...base,
    decision,
    mayStartNextOrganisation: false,
  });

  // PRECEDENCE. A serious incident is reported ahead of the yield gate, because
  // the two lead to DIFFERENT terminal states: a P5 stop is this batch working
  // as designed and still reaches COMPLETE_AWAITING_SD7_MEASUREMENT, whereas
  // P0/P3/P4/P7 reach PAUSED_AWAITING_OWNER_REVIEW. Reporting P5 first would
  // mislabel a real incident as an expected outcome. Every one of them stops
  // the batch, so the ORDER changes what is reported, never whether it stops.
  if (completed.some((run) => run.inputOrRootMismatch)) {
    return pause('PAUSE_P0_INPUT_OR_ROOT_MISMATCH');
  }
  if (completed.some((run) => run.runTerminalState === 'FAILED')) {
    return pause('PAUSE_P3_EXECUTION_FAILURE');
  }
  if (completed.some((run) => run.persistenceAnomaly)) {
    return pause('PAUSE_P4_PERSISTENCE_ANOMALY');
  }
  if (completed.some((run) => run.hostStateAnomaly)) {
    return pause('PAUSE_P7_HOST_STATE_ANOMALY');
  }

  // P5, the incremental low-raw-yield gate. `>=`, evaluated after EACH
  // completed organisation - never deferred to a post-batch assessment.
  if (lowRawYield.length >= P5_LOW_RAW_YIELD_THRESHOLD) {
    return pause('PAUSE_P5_LOW_RAW_YIELD');
  }

  return {
    ...base,
    decision: 'CONTINUE',
    // CONTINUE with nothing left to run is still not permission to start
    // something: the batch is simply finished.
    mayStartNextOrganisation: remaining.length > 0,
  };
}

/**
 * The gate expressed over RAW COUNTS ALONE, for the owner's worked examples.
 *
 * It exists so the P5 arithmetic can be pinned independently of the fatal
 * conditions, and it is deliberately NOT the function the operator calls -
 * a real between-run decision must also see P0, P3, P4 and P7. It assigns the
 * authorised selection indices positionally, which is what makes a bare count
 * sequence meaningful at all.
 */
export function evaluateP5OverRawCounts(
  rawPageEvidenceCounts: readonly number[],
): BetweenRunGateVerdict {
  if (rawPageEvidenceCounts.length > BATCH_02_MAX_ORGANISATIONS) {
    throw new Error(
      `Batch 02 authorises ${String(BATCH_02_MAX_ORGANISATIONS)} organisations; ` +
        `received ${String(rawPageEvidenceCounts.length)} counts`,
    );
  }
  return evaluateBetweenRunGate({
    completedRuns: rawPageEvidenceCounts.map((rawPageEvidenceCount, position) => ({
      selectionIndex: BATCH_02_SELECTION_INDICES[position] as number,
      rawPageEvidenceCount,
      runTerminalState: 'COMPLETED' as const,
      inputOrRootMismatch: false,
      persistenceAnomaly: false,
      hostStateAnomaly: false,
    })),
  });
}

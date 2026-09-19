/**
 * THE BETWEEN-RUN ACQUISITION GATE CONTRACT.
 *
 * WHY THIS EXISTS AT ALL
 *
 *   Batch 01 proved that prose alone is insufficient. Its between-run check
 *   evaluated P3, P4 and P7 but not P5, so selection index 4 started roughly
 *   two seconds after P5's condition had already become true. The owner
 *   adjudicated that as a process deviation within authorised scope
 *   (PHASE_2B_2D_METHOD_V2_A2_BATCH_01_DEVIATION_ADJUDICATION_V1.json) and
 *   required the INCREMENTAL reading of P5 to be restated in every future
 *   batch authority record. Batch 02 additionally makes it EXECUTABLE, so the
 *   gate cannot be accidentally skipped again.
 *
 * WHAT THIS IS NOT
 *
 *   It is NOT a batch runner. It starts no process, spawns no child, opens no
 *   socket, reads no database, touches no filesystem and reads no clock. It
 *   answers exactly one question - MAY THE OPERATOR START THE NEXT
 *   ORGANISATION? - and the operator still runs each organisation by hand,
 *   one `orgunits discover` invocation at a time.
 *
 * THIS MODULE IS PURE.
 */

/** The owner decision that permits the batch this gate governs. */
export const BATCH_02_OWNER_DECISION =
  'AUTHORISE_PHASE_2B_2D_A2_LIVE_INSTITUTION_ACQUISITION_BATCH_02_V1';

export const BATCH_02_AUTHORITY_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_02_AUTHORITY_RECORD_V1.json';

export const BATCH_02_EXECUTION_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_02_EXECUTION_RECORD_V1.json';

// ---------------------------------------------------------------------------
// A. THE FROZEN P5 NUMBERS.
// ---------------------------------------------------------------------------

/**
 * A completed organisation is LOW RAW YIELD when its PRE-SD7 page-evidence
 * count is strictly fewer than this. The number is SD9's
 * MIN_PAGES_PER_ORGANISATION, quoted here because P5 compares against the same
 * boundary - NOT because P5 is an SD9 decision. It is not: SD9 may only be
 * decided AFTER SD7 deduplication, and SD7 is not authorised in this batch.
 */
export const MIN_RAW_PAGE_EVIDENCE_PER_ORGANISATION = 4;

/**
 * The gate pauses when the cumulative low-raw-yield count REACHES this value.
 * The comparison is `>=`, evaluated after EACH completed organisation, never
 * after all five.
 */
export const P5_LOW_RAW_YIELD_THRESHOLD = 2;

/** The authorised primary selection indices for Batch 02, in execution order. */
export const BATCH_02_SELECTION_INDICES = [5, 6, 7, 8, 9] as const;

/** The most organisations that may START, before the gate is consulted at all. */
export const BATCH_02_MAX_ORGANISATIONS = BATCH_02_SELECTION_INDICES.length;

// ---------------------------------------------------------------------------
// B. WHAT THE OPERATOR OBSERVES ABOUT ONE COMPLETED ORGANISATION.
// ---------------------------------------------------------------------------

/**
 * ONE completed Batch-02 organisation, as read back from its OWN durable
 * records after its run finished.
 *
 * WHY THIS IS ONE ARRAY OF OBSERVATIONS AND NOT TWO PARALLEL ARRAYS.
 *
 *   The owner's instruction sketches the input as
 *   `{ completedRuns, rawPageEvidenceCounts }`. Taking a run list AND a
 *   separate count list would let the two desynchronise - a count could be
 *   appended for a run that never completed, or a run could be appended with
 *   no count - and the gate would then be measuring something other than what
 *   actually ran. The count is therefore carried ON the observation it belongs
 *   to, which makes that class of mistake unrepresentable. The gate's
 *   behaviour on the owner's worked examples is unchanged, and those exact
 *   sequences are pinned in the tests.
 */
export interface CompletedRunObservation {
  /** The authorised primary selection index this run executed. */
  readonly selectionIndex: number;
  /**
   * The RAW `orgunit_page_evidence` row count for this run. Pre-SD7, never
   * deduplicated - SD7 is not authorised in this batch and no deduplication
   * may be applied before this number is fed to the gate.
   */
  readonly rawPageEvidenceCount: number;
  /** The run's own durable terminal state. */
  readonly runTerminalState: 'COMPLETED' | 'FAILED';
  /** P0: a frozen input, draw entry or root authority did not match. */
  readonly inputOrRootMismatch: boolean;
  /** P4: a durability or persistence anomaly was observed for this run. */
  readonly persistenceAnomaly: boolean;
  /** P7: sleep, wake, pacing-clock discontinuity or an inconsistent stall. */
  readonly hostStateAnomaly: boolean;
}

// ---------------------------------------------------------------------------
// C. THE VERDICT.
// ---------------------------------------------------------------------------

/**
 * The gate's answer. `CONTINUE` is the ONLY value that permits the operator to
 * start another organisation; every other value is a stop.
 */
export type BetweenRunGateDecision =
  | 'CONTINUE'
  | 'PAUSE_P0_INPUT_OR_ROOT_MISMATCH'
  | 'PAUSE_P3_EXECUTION_FAILURE'
  | 'PAUSE_P4_PERSISTENCE_ANOMALY'
  | 'PAUSE_P5_LOW_RAW_YIELD'
  | 'PAUSE_P7_HOST_STATE_ANOMALY';

export interface BetweenRunGateVerdict {
  readonly decision: BetweenRunGateDecision;
  /**
   * The one thing the operator acts on. True ONLY when the decision is
   * `CONTINUE` and the batch has authorised indices left.
   */
  readonly mayStartNextOrganisation: boolean;
  readonly completedCount: number;
  /** Completed organisations whose raw page evidence fell below the minimum. */
  readonly lowRawYieldCount: number;
  /** The selection indices that contributed to `lowRawYieldCount`, in order. */
  readonly lowRawYieldSelectionIndices: readonly number[];
  /** Authorised indices not yet executed, in execution order. */
  readonly remainingSelectionIndices: readonly number[];
}

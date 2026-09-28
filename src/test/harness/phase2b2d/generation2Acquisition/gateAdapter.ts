/**
 * THE GENERATION-2 GATE ADAPTER, AND THE P8 LIVE-CRITICAL-SECTION CHECKS. PURE.
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
 * P8 / CONCURRENCY
 *
 *   `evaluatePreItemQuietPeriod` and `evaluateInItemMonitoring` represent the
 *   final Generation-1 operational learning as pure checks over process-
 *   monitor samples a future live driver would collect. They perform no
 *   monitoring themselves.
 */

import type {
  CompletedWorkObservation,
  ContinuationWindowVerdict,
  ContinuationWorkItem,
  TriggeredCondition,
  WindowPreflightInvariants,
} from '../continuationWindow/windowContract.js';
import { evaluateContinuationWindowGate } from '../continuationWindow/windowGate.js';
import { LIVE_CRITICAL_SECTION_POLICY } from './operationalContract.js';
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
// P8 / concurrency, as pure checks over monitor samples.
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
  readonly reasons: readonly string[];
}

/**
 * Before each live item: A3 execution agents quiesced, and the samples
 * immediately preceding the start show >= 120 consecutive clean seconds with
 * no gap above 5 seconds (and the last sample within 5 seconds of the start).
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
  return { mayStartItem: reasons.length === 0, consecutiveCleanSeconds: clean, reasons };
}

export interface InItemMonitoringVerdict {
  /** True means P8: the item's observation must carry hostStateAnomaly. */
  readonly hostStateAnomaly: boolean;
  readonly reasons: readonly string[];
}

/** During each live item: continuous <= 5 s monitoring, and no competing process at all. */
export function evaluateInItemMonitoring(input: {
  readonly samples: readonly ProcessMonitorSample[];
  readonly itemStartEpochSeconds: number;
  readonly itemEndEpochSeconds: number;
}): InItemMonitoringVerdict {
  const limit = LIVE_CRITICAL_SECTION_POLICY.maxProcessMonitoringIntervalSeconds;
  const reasons: string[] = [];
  const within = input.samples
    .filter(
      (sample) =>
        sample.atEpochSeconds >= input.itemStartEpochSeconds &&
        sample.atEpochSeconds <= input.itemEndEpochSeconds,
    )
    .sort((a, b) => a.atEpochSeconds - b.atEpochSeconds);
  let previous = input.itemStartEpochSeconds;
  for (const sample of within) {
    if (sample.atEpochSeconds - previous > limit) reasons.push('a monitoring gap above 5 seconds');
    if (sample.competingProcessCount !== 0) reasons.push('a competing process ran mid-item');
    previous = sample.atEpochSeconds;
  }
  if (input.itemEndEpochSeconds - previous > limit)
    reasons.push('a monitoring gap above 5 seconds');
  return { hostStateAnomaly: reasons.length > 0, reasons: [...new Set(reasons)] };
}

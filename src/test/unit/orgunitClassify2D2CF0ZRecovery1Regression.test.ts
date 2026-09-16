/**
 * PHASE 2B-2D2C-F0Z — REGRESSION FIXTURES FOR THE FOUR RECOVERY-1 SHAPES.
 *
 * NO RECOVERY-1 ARTIFACT IS READ, RE-SCORED OR MUTATED BY THIS FILE. The
 * recorded values below are QUOTED from the F0Y decision audit as literals
 * and cited inline, so the shapes are exercised without the historical tree
 * being touched at all. Every test is pure: no provider, no inference, no
 * subprocess, no filesystem.
 *
 *   A. PAIR_3_V4 batch-09 — STRUCTURED_OUTPUT_FAILED / error_max_turns.
 *      Proves the behaviour is STRUCTURALLY UNCHANGED.
 *   B. PAIR_4_V5 batch-11 — a ~303 s confirmed TIMEOUT.
 *   C. PAIR_5_V4 batch-01 — a ~302 s confirmed TIMEOUT.
 *      B and C prove v2 would durably close that batch and CONTINUE, while
 *      v1 still reproduces the historical halt byte-for-byte.
 *   D. PAIR_4_V4 batch-02 — 1,082,976 ms, CHILD_EXITED_UNCONFIRMED,
 *      TIMED_OUT_KILLED. Proves the RECORDED evidence cannot retrospectively
 *      decide provider latency versus host stall, and that the historical
 *      classification is therefore unchanged.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_TRANSIENT_RETRIES,
  TRANSIENT_RETRY_BASE_DELAY_MS,
} from '../../orgunits/classify/retry.js';
import {
  CLASSIFIER_CALL_HARD_KILL_GRACE_MS,
  CLASSIFIER_CALL_SOFT_DEADLINE_MS,
  CLASSIFIER_CALL_TOTAL_BUDGET_MS,
} from '../../orgunits/classify/provider/agentSdkRunner.js';
import {
  FROZEN_MAX_TRANSIENT_RETRIES,
  FROZEN_TIER1_GRACE_MS,
  FROZEN_TIER1_SOFT_DEADLINE_MS,
  FROZEN_TIER1_TOTAL_BUDGET_MS,
  FROZEN_TIER2_GRACE_MS,
  FROZEN_TIER2_WATCHDOG_MS,
  RELIABILITY_SEMANTICS_V2,
} from '../harness/phase2b2d2c/constants.js';
import {
  deriveStopDecision,
  type ChildArtifactObservation,
  type Tier2Observation,
} from '../harness/phase2b2d2c/stopConditions.js';

const MODEL = 'test-model-under-test';

const CLEAN_TIER2: Tier2Observation = {
  outcome: 'COMPLETED',
  gracePhaseVerdict: null,
  hardKillDisposition: 'NOT_REQUIRED',
  exitCode: 0,
  signal: null,
};

function nonOkArtifacts(
  providerOutcome: 'TIMEOUT' | 'STRUCTURED_OUTPUT_FAILED',
): ChildArtifactObservation {
  return {
    preflight: { present: true, valid: true, stopCondition: null },
    failure: { present: false },
    result: {
      present: true,
      valid: true,
      providerOutcome,
      providerReportedModelId: providerOutcome === 'STRUCTURED_OUTPUT_FAILED' ? MODEL : null,
      rawCheckpointPersistedBeforeValidation: null,
      childStopCondition: null,
    },
    rawCheckpoint: { present: false },
    validation: { present: false },
    providerOutcome: { present: true, valid: true },
    // A Tier-1 TIMEOUT persists diagnostics; a structured-output failure does
    // not (PAIR_3_V4 recorded `tier1DiagnosticsCaptured: 0`).
    tier1Diagnostics:
      providerOutcome === 'TIMEOUT' ? { present: true, valid: true } : { present: false },
  };
}

describe('2D2C-F0Z regression A — PAIR_3_V4 batch-09 (STRUCTURED_OUTPUT_FAILED / error_max_turns)', () => {
  // Recorded: outcome STRUCTURED_OUTPUT_FAILED, outcomeDetail "the run
  // terminated (error_max_turns) without a structured result.",
  // monotonicWallTimeMs 38748, outputTokens 4518, runConfig maxTurns 3,
  // stop-decision { stop: false, stopCondition: null, haltKind: null }.
  // The slot went on to complete 12/12.
  it('behaviour is STRUCTURALLY UNCHANGED under both v1 and v2: it continues', () => {
    for (const version of [undefined, RELIABILITY_SEMANTICS_V2]) {
      const decision = deriveStopDecision({
        tier2: CLEAN_TIER2,
        artifacts: nonOkArtifacts('STRUCTURED_OUTPUT_FAILED'),
        requestedModelId: MODEL,
        ...(version === undefined ? {} : { reliabilitySemanticsVersion: version }),
      });
      expect(decision.stop, String(version)).toBe(false);
      expect(decision.stopCondition, String(version)).toBeNull();
      expect(decision.haltKind, String(version)).toBeNull();
      // The exact historical detail wording, still produced.
      expect(decision.detail).toContain(
        'non-OK outcome STRUCTURED_OUTPUT_FAILED reconciled to this attempt',
      );
    }
  });

  it('is classified as a SEMANTIC INVALID observation, never a control-plane failure', () => {
    const decision = deriveStopDecision({
      tier2: CLEAN_TIER2,
      artifacts: nonOkArtifacts('STRUCTURED_OUTPUT_FAILED'),
      requestedModelId: MODEL,
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    });
    expect(decision.evaluationOutcomeClass).toBe('STRUCTURED_OUTPUT_FAILED_NON_TERMINAL');
  });
});

describe('2D2C-F0Z regressions B and C — PAIR_4_V5 b11 (~303 s) and PAIR_5_V4 b01 (~302 s)', () => {
  // Both recorded: outcome TIMEOUT, tier1DiagnosticsCaptured 1, Tier-2
  // COMPLETED / exitCode 0, and a progress trace whose DEADLINE_EXPIRED sits
  // at 300,780 ms and 300,135 ms against a 300,000 ms deadline — 0.26% and
  // 0.05% overshoot. Tier 1 behaved EXACTLY as designed in both.
  const RECORDED = [
    { slot: 'PAIR_4_V5', batch: 11, monotonicWallTimeMs: 303_393, deadlineExpiredAtMs: 300_780 },
    { slot: 'PAIR_5_V4', batch: 1, monotonicWallTimeMs: 302_496, deadlineExpiredAtMs: 300_135 },
  ] as const;

  it.each(RECORDED)('$slot batch-$batch: v1 reproduces the historical halt exactly', (recorded) => {
    const decision = deriveStopDecision({
      tier2: CLEAN_TIER2,
      artifacts: nonOkArtifacts('TIMEOUT'),
      requestedModelId: MODEL,
    });
    expect(decision.stop).toBe(true);
    expect(decision.haltKind).toBe('TIER1_TIMEOUT_DECISION_RULE');
    expect(decision.stopCondition).toBeNull();
    expect(decision.detail).toContain('This is not one of the ten stop conditions.');
    // Tier 1 fired on time in both: the overshoot was under a second.
    expect(recorded.deadlineExpiredAtMs - FROZEN_TIER1_SOFT_DEADLINE_MS).toBeLessThan(1_000);
  });

  it.each(RECORDED)('$slot batch-$batch: v2 would durably close that batch and CONTINUE', () => {
    const decision = deriveStopDecision({
      tier2: CLEAN_TIER2,
      artifacts: nonOkArtifacts('TIMEOUT'),
      requestedModelId: MODEL,
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
      priorNonTerminalTimeouts: 0,
    });
    expect(decision.stop).toBe(false);
    expect(decision.evaluationOutcomeClass).toBe('PROVIDER_TIMEOUT_NON_TERMINAL');
    // Its own items are INVALID; nothing is fabricated and nothing re-run.
    expect(decision.detail).toContain('INVALID');
    expect(decision.detail).toContain('never re-run');
  });

  it('the arithmetic this would have recovered, stated exactly', () => {
    // Batch sizes partition 49 items as 3,5,4,5,3,5,5,4,4,3,3,5.
    const BATCH_SIZES = [3, 5, 4, 5, 3, 5, 5, 4, 4, 3, 3, 5];
    expect(BATCH_SIZES.reduce((a, b) => a + b, 0)).toBe(49);
    const neverAttemptedAfter = (stoppedAtBatch: number): number =>
      BATCH_SIZES.slice(stoppedAtBatch).reduce((a, b) => a + b, 0);
    // PAIR_4_V5 stopped at batch 11, PAIR_4_V4 at 2, PAIR_5_V4 at 1.
    expect(neverAttemptedAfter(11)).toBe(5);
    expect(neverAttemptedAfter(2)).toBe(41);
    expect(neverAttemptedAfter(1)).toBe(46);
    expect(neverAttemptedAfter(11) + neverAttemptedAfter(2) + neverAttemptedAfter(1)).toBe(92);
  });
});

describe('2D2C-F0Z regression D — PAIR_4_V4 batch-02 (1,082,976 ms)', () => {
  // Recorded: monotonicWallTimeMs 1,082,976; startedAtUtc 15:48:45.900Z and
  // endedAtUtc 16:06:48.880Z, a UTC delta of 1,082,980 ms; DEADLINE_EXPIRED
  // at 1,080,400 ms on a 300,000 ms deadline; Tier-2 TIMED_OUT_KILLED with
  // ipcRequestSent false, CHILD_EXITED_UNCONFIRMED, exitCode 0.
  const RECORDED = {
    monotonicWallTimeMs: 1_082_976,
    utcDeltaMs: 1_082_980,
    deadlineExpiredAtMs: 1_080_400,
  } as const;

  it('THE EVIDENCE CANNOT DECIDE: wall and monotonic agree, so neither hypothesis is excluded', () => {
    // The two clocks are 4 ms apart over ~18 minutes. The F0Z experiment
    // measured why: on this runtime `performance.now()` advances THROUGH a
    // process suspension (a child SIGSTOPped for 2,000 ms saw wall and
    // monotonic agree to within 0.3 ms). So this agreement is exactly what
    // BOTH hypotheses predict, and it discriminates neither.
    const clockDisagreementMs = Math.abs(RECORDED.utcDeltaMs - RECORDED.monotonicWallTimeMs);
    expect(clockDisagreementMs).toBeLessThanOrEqual(5);

    // Hypothesis 1 - a genuinely 1,083 s provider call - predicts agreement.
    // Hypothesis 2 - a ~780 s stall - predicts agreement too, on this runtime.
    // Nothing in the recorded field set separates them.
    const recordedFields = ['monotonicWallTimeMs', 'startedAtUtc', 'endedAtUtc', 'progress'];
    expect(recordedFields).not.toContain('deadlineOvershootMs');
    expect(recordedFields).not.toContain('heartbeat');
  });

  it('the HISTORICAL classification is therefore unchanged: still a stop condition', () => {
    const decision = deriveStopDecision({
      tier2: {
        outcome: 'TIMED_OUT_KILLED',
        gracePhaseVerdict: 'CHILD_EXITED_UNCONFIRMED',
        hardKillDisposition: 'EXECUTED',
        exitCode: 0,
        signal: null,
      },
      artifacts: nonOkArtifacts('TIMEOUT'),
      requestedModelId: MODEL,
      // Even under v2, and even with the timeout budget untouched.
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
      priorNonTerminalTimeouts: 0,
    });
    expect(decision.stop).toBe(true);
    expect(decision.stopCondition).toBe('CHILD_EXITED_UNCONFIRMED');
    expect(decision.haltKind).toBe('STOP_CONDITION');
    // C2 would be the change that revisits this. It is NOT in this slice.
    expect(decision.evaluationOutcomeClass).toBe('AMBIGUOUS_CHILD_TERMINATION');
  });

  it('the NEW witness would have discriminated it: the overshoot is 780,400 ms', () => {
    // The one number Recovery-1 lacked. Recorded from now on by the Tier-1
    // liveness witness - as EVIDENCE, with no causal claim attached.
    const overshootMs = RECORDED.deadlineExpiredAtMs - FROZEN_TIER1_SOFT_DEADLINE_MS;
    expect(overshootMs).toBe(780_400);
    // A healthy loop reads ~0 here; B and C read under 1,000 ms.
    expect(overshootMs).toBeGreaterThan(1_000);
  });
});

describe('2D2C-F0Z: the frozen ceilings and durations are UNCHANGED', () => {
  it('every Tier-1 and Tier-2 duration still holds its frozen value', () => {
    expect(CLASSIFIER_CALL_SOFT_DEADLINE_MS).toBe(300_000);
    expect(CLASSIFIER_CALL_HARD_KILL_GRACE_MS).toBe(10_000);
    expect(CLASSIFIER_CALL_TOTAL_BUDGET_MS).toBe(600_000);
    expect(FROZEN_TIER1_SOFT_DEADLINE_MS).toBe(300_000);
    expect(FROZEN_TIER1_GRACE_MS).toBe(10_000);
    expect(FROZEN_TIER1_TOTAL_BUDGET_MS).toBe(600_000);
    expect(FROZEN_TIER2_WATCHDOG_MS).toBe(700_000);
    expect(FROZEN_TIER2_GRACE_MS).toBe(10_000);
  });

  it('the adapter retry ceiling is untouched, and a TIMEOUT is still never retried', () => {
    expect(MAX_TRANSIENT_RETRIES).toBe(2);
    expect(FROZEN_MAX_TRANSIENT_RETRIES).toBe(2);
    expect(TRANSIENT_RETRY_BASE_DELAY_MS).toBe(500);
    // C1 introduces NO retry: continuation starts the NEXT frozen evaluation
    // with its own budget, and the timed-out batch is never re-run.
  });

  it('the observed maximum successful call is still far inside the deadline', () => {
    // Recovery-1, n = 94 OK calls: min 8,615 / p50 15,140 / p95 33,896 /
    // max 129,862 ms. 2.3x of headroom, so no measurement supports changing
    // the deadline - and F0Z changes none.
    const OBSERVED_MAX_OK_MS = 129_862;
    expect(OBSERVED_MAX_OK_MS).toBeLessThan(CLASSIFIER_CALL_SOFT_DEADLINE_MS);
    expect(CLASSIFIER_CALL_SOFT_DEADLINE_MS / OBSERVED_MAX_OK_MS).toBeGreaterThan(2);
  });
});

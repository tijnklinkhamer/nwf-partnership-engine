/**
 * PHASE 2B-2D2C-F0Z — C1: CONFIRMED PROVIDER TIMEOUT CONTINUATION, and the
 * explicit evaluation-outcome taxonomy.
 *
 * `deriveStopDecision` is PURE, so every case below is exercised with zero
 * provider calls, zero inference, zero subprocesses and zero filesystem
 * access.
 *
 * WHAT THIS PROVES, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * Under v1 a confirmed Tier-1 TIMEOUT ended the whole 12-batch replicate.
 * Recovery-1 paid 92 never-attempted item-observations for that rule across
 * PAIR_4_V5, PAIR_4_V4 and PAIR_5_V4. Under v2 such an evaluation closes
 * durably, ITS OWN items become observed-INVALID, and the next frozen
 * evaluation proceeds — bounded by an explicitly uncalibrated ceiling.
 *
 * v1 BEHAVIOUR IS UNCHANGED AND IS PINNED HERE. Recovery-1 wrote no
 * semantics-version field, so its absence means v1, and every historical
 * observation re-derives exactly as it did.
 *
 * C2 IS NOT IMPLEMENTED. The watchdog/child-exit decision semantics are
 * asserted unchanged, by name, at the bottom of this file.
 */
import { describe, expect, it } from 'vitest';
import {
  EVALUATION_OUTCOME_CLASSES,
  MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
  NON_TERMINAL_PROVIDER_OUTCOMES,
  RELIABILITY_SEMANTICS_V1_HISTORICAL,
  RELIABILITY_SEMANTICS_V2,
  RELIABILITY_SEMANTICS_VERSION,
} from '../harness/phase2b2d2c/constants.js';
import {
  deriveStopDecision,
  type ChildArtifactObservation,
  type StopDecisionInput,
  type Tier2Observation,
} from '../harness/phase2b2d2c/stopConditions.js';

/** An opaque model id. A real Claude model id is forbidden in source (phase1a firewall). */
const MODEL = 'test-model-under-test';

const CLEAN_TIER2: Tier2Observation = {
  outcome: 'COMPLETED',
  gracePhaseVerdict: null,
  hardKillDisposition: 'NOT_REQUIRED',
  exitCode: 0,
  signal: null,
};

/** A child that ended cleanly and left a complete, hash-valid record set. */
function artifacts(
  providerOutcome:
    | 'OK'
    | 'TIMEOUT'
    | 'STRUCTURED_OUTPUT_FAILED'
    | 'AUTH_FAILURE'
    | 'PROVIDER_REFUSAL'
    | 'PROVIDER_TRANSIENT',
  overrides: Partial<ChildArtifactObservation> = {},
): ChildArtifactObservation {
  const ok = providerOutcome === 'OK';
  return {
    preflight: { present: true, valid: true, stopCondition: null },
    failure: { present: false },
    result: {
      present: true,
      valid: true,
      providerOutcome,
      providerReportedModelId: ok ? MODEL : null,
      rawCheckpointPersistedBeforeValidation: ok ? true : null,
      childStopCondition: null,
    },
    rawCheckpoint: { present: ok, valid: ok } as ChildArtifactObservation['rawCheckpoint'],
    validation: { present: ok, valid: ok } as ChildArtifactObservation['validation'],
    providerOutcome: { present: true, valid: true },
    tier1Diagnostics:
      providerOutcome === 'TIMEOUT' ? { present: true, valid: true } : { present: false },
    ...overrides,
  };
}

function decide(overrides: Partial<StopDecisionInput> = {}) {
  return deriveStopDecision({
    tier2: CLEAN_TIER2,
    artifacts: artifacts('TIMEOUT'),
    requestedModelId: MODEL,
    ...overrides,
  });
}

describe('2D2C-F0Z reliability semantics version', () => {
  it('names v2 as the version a new run executes under, and keeps v1 as a distinct value', () => {
    expect(RELIABILITY_SEMANTICS_VERSION).toBe(RELIABILITY_SEMANTICS_V2);
    expect(RELIABILITY_SEMANTICS_V1_HISTORICAL).not.toBe(RELIABILITY_SEMANTICS_V2);
  });

  it('the ceiling is the frozen, explicitly uncalibrated bound', () => {
    // Recovery-1 measured 3 timeouts in 98 started batches and no replicate
    // had more than 1. This is a bound above that, never a measurement.
    expect(MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE).toBe(2);
  });

  it('the continue-set is a closed allow-list of exactly the observable INVALID outcomes', () => {
    expect([...NON_TERMINAL_PROVIDER_OUTCOMES]).toEqual(['STRUCTURED_OUTPUT_FAILED', 'TIMEOUT']);
  });

  it('the evaluation-outcome taxonomy keeps all seven classes distinct', () => {
    expect([...EVALUATION_OUTCOME_CLASSES]).toEqual([
      'VALIDATED_SEMANTIC_RESULT',
      'VALIDATOR_REJECTED_POST_REPAIR',
      'STRUCTURED_OUTPUT_FAILED_NON_TERMINAL',
      'PROVIDER_TIMEOUT_NON_TERMINAL',
      'AUTH_OR_PRE_INFERENCE_FAILURE',
      'TIER2_LIVENESS_FAILURE',
      'AMBIGUOUS_CHILD_TERMINATION',
    ]);
    expect(new Set(EVALUATION_OUTCOME_CLASSES).size).toBe(EVALUATION_OUTCOME_CLASSES.length);
  });
});

describe('2D2C-F0Z C1: a confirmed provider TIMEOUT continues under v2', () => {
  it('closes the evaluation durably and lets the next logical evaluation proceed', () => {
    const decision = decide({ reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2 });
    expect(decision.stop).toBe(false);
    expect(decision.stopCondition).toBeNull();
    expect(decision.haltKind).toBeNull();
    expect(decision.evaluationOutcomeClass).toBe('PROVIDER_TIMEOUT_NON_TERMINAL');
    // No semantic verdict is fabricated for the timed-out batch's items.
    expect(decision.detail).toContain('INVALID');
    expect(decision.detail).toContain('never re-run');
  });

  it('still counts the batch: it is an INVALID observation, never a silent skip', () => {
    const decision = decide({ reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2 });
    // The class says "observed and invalid", which is what keeps the item in
    // the denominator instead of vanishing from it.
    expect(decision.evaluationOutcomeClass).toBe('PROVIDER_TIMEOUT_NON_TERMINAL');
    expect(NON_TERMINAL_PROVIDER_OUTCOMES).toContain('TIMEOUT');
  });

  it('FAILS CLOSED when the timeout evidence is incomplete: no diagnostics, no continuation', () => {
    for (const diagnostics of [
      { present: false } as const,
      { present: true, valid: false } as const,
    ]) {
      const decision = decide({
        reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
        artifacts: artifacts('TIMEOUT', { tier1Diagnostics: diagnostics }),
      });
      expect(decision.stop).toBe(true);
      expect(decision.stopCondition).toBe('BATCH_ARTIFACT_MISSING_OR_CORRUPT');
      expect(decision.evaluationOutcomeClass).toBe('AMBIGUOUS_CHILD_TERMINATION');
    }
  });

  it('FAILS CLOSED when the Tier-2 evidence is ambiguous, even with a valid TIMEOUT recorded', () => {
    // A timeout under a watchdog kill is a liveness failure, not an
    // observation, and C2 is not implemented, so this is unchanged.
    const decision = decide({
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
      tier2: { ...CLEAN_TIER2, outcome: 'TIMED_OUT_KILLED' },
    });
    expect(decision.stop).toBe(true);
    expect(decision.stopCondition).toBe('UNRECONCILED_PROVIDER_FAILURE');
    expect(decision.evaluationOutcomeClass).toBe('TIER2_LIVENESS_FAILURE');
  });
});

describe('2D2C-F0Z C1: the per-replicate timeout ceiling', () => {
  it('continues below the ceiling and stops at it', () => {
    for (let prior = 0; prior < MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE; prior += 1) {
      const decision = decide({
        reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
        priorNonTerminalTimeouts: prior,
      });
      expect(decision.stop, `prior=${prior}`).toBe(false);
    }
    const atCeiling = decide({
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
      priorNonTerminalTimeouts: MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
    });
    expect(atCeiling.stop).toBe(true);
    expect(atCeiling.haltKind).toBe('TIER1_TIMEOUT_CEILING_REACHED');
    // It is NOT one of the ten frozen stop conditions.
    expect(atCeiling.stopCondition).toBeNull();
    expect(atCeiling.detail).toContain('uncalibrated');
  });

  it('an absent prior count is treated as zero', () => {
    expect(decide({ reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2 }).stop).toBe(false);
  });
});

describe('2D2C-F0Z: v1 semantics are UNCHANGED (Recovery-1 must re-derive identically)', () => {
  it('an absent version reproduces the historical TIER1_TIMEOUT_DECISION_RULE halt', () => {
    const decision = decide();
    expect(decision.stop).toBe(true);
    expect(decision.haltKind).toBe('TIER1_TIMEOUT_DECISION_RULE');
    expect(decision.stopCondition).toBeNull();
    // The exact historical wording, still produced byte-for-byte.
    expect(decision.detail).toContain('Tier 1 returned TIMEOUT before Tier 2 fired');
    expect(decision.detail).toContain('This is not one of the ten stop conditions.');
  });

  it('an explicit v1 version reproduces it too', () => {
    // NOTE: an UNKNOWN version does NOT reproduce it. The stage-1 final
    // correction stopped coercing unknown versions to the historical
    // default; they now fail closed. See the unknown-version describe below.
    const decision = decide({
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V1_HISTORICAL,
    });
    expect(decision.stop).toBe(true);
    expect(decision.haltKind).toBe('TIER1_TIMEOUT_DECISION_RULE');
  });

  it('the ceiling never applies under v1: a prior count cannot change the historical rule', () => {
    const decision = decide({ priorNonTerminalTimeouts: 99 });
    expect(decision.haltKind).toBe('TIER1_TIMEOUT_DECISION_RULE');
  });
});

describe('2D2C-F0Z: STRUCTURED_OUTPUT_FAILED is UNCHANGED (PAIR_3_V4 must stay interpretable)', () => {
  it('continues under both v1 and v2, identically', () => {
    for (const version of [undefined, RELIABILITY_SEMANTICS_V2]) {
      const decision = deriveStopDecision({
        tier2: CLEAN_TIER2,
        artifacts: artifacts('STRUCTURED_OUTPUT_FAILED'),
        requestedModelId: MODEL,
        ...(version === undefined ? {} : { reliabilitySemanticsVersion: version }),
      });
      expect(decision.stop, String(version)).toBe(false);
      expect(decision.evaluationOutcomeClass).toBe('STRUCTURED_OUTPUT_FAILED_NON_TERMINAL');
      // The exact historical detail wording is preserved.
      expect(decision.detail).toContain(
        'non-OK outcome STRUCTURED_OUTPUT_FAILED reconciled to this attempt',
      );
    }
  });

  it('is never given a repair path by this slice', () => {
    const decision = deriveStopDecision({
      tier2: CLEAN_TIER2,
      artifacts: artifacts('STRUCTURED_OUTPUT_FAILED'),
      requestedModelId: MODEL,
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    });
    expect(decision.detail.toLowerCase()).not.toContain('repair');
  });
});

describe('2D2C-F0Z: control-plane failures are NEVER recorded as observations', () => {
  it.each(['AUTH_FAILURE', 'PROVIDER_REFUSAL', 'PROVIDER_TRANSIENT'] as const)(
    '%s now fails closed instead of continuing into an unscoreable run',
    (outcome) => {
      const decision = deriveStopDecision({
        tier2: CLEAN_TIER2,
        artifacts: artifacts(outcome),
        requestedModelId: MODEL,
        reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
      });
      // Before F0Z these continued, yet no scorer admits them as an observed
      // INVALID - so the run was silently unscoreable. They are control-plane
      // or ambiguous failures, never semantic observations.
      expect(decision.stop).toBe(true);
      expect(decision.stopCondition).toBe('UNRECONCILED_PROVIDER_FAILURE');
      expect(decision.evaluationOutcomeClass).toBe('AUTH_OR_PRE_INFERENCE_FAILURE');
      expect(decision.detail).toContain('not an admitted non-terminal observation');
    },
  );

  it('USAGE_LIMIT_EXHAUSTED still stops, under its own unchanged stop condition', () => {
    const decision = deriveStopDecision({
      tier2: CLEAN_TIER2,
      artifacts: artifacts('OK', {
        result: {
          present: true,
          valid: true,
          providerOutcome: 'USAGE_LIMIT_EXHAUSTED',
          providerReportedModelId: null,
          rawCheckpointPersistedBeforeValidation: null,
          childStopCondition: null,
        },
      }),
      requestedModelId: MODEL,
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    });
    expect(decision.stopCondition).toBe('USAGE_LIMIT_INTERRUPTION');
    expect(decision.evaluationOutcomeClass).toBe('AUTH_OR_PRE_INFERENCE_FAILURE');
  });
});

describe('2D2C-F0Z: an OK evaluation is unchanged', () => {
  it('reconciles and continues, classed as a validated semantic result', () => {
    const decision = deriveStopDecision({
      tier2: CLEAN_TIER2,
      artifacts: artifacts('OK'),
      requestedModelId: MODEL,
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    });
    expect(decision.stop).toBe(false);
    expect(decision.evaluationOutcomeClass).toBe('VALIDATED_SEMANTIC_RESULT');
  });
});

describe('2D2C-F0Z: C2 IS NOT IMPLEMENTED', () => {
  it('a child that exited unconfirmed still stops the replicate, under v2', () => {
    const decision = deriveStopDecision({
      tier2: {
        outcome: 'TIMED_OUT_KILLED',
        gracePhaseVerdict: 'CHILD_EXITED_UNCONFIRMED',
        hardKillDisposition: 'EXECUTED',
        exitCode: 0,
        signal: null,
      },
      artifacts: artifacts('TIMEOUT'),
      requestedModelId: MODEL,
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    });
    // This is Recovery-1 incident D exactly: a clean exit code, a complete
    // artifact set and a validly recorded Tier-1 TIMEOUT. C2 would downgrade
    // it; C2 is deliberately NOT in this slice, so the verdict is unchanged.
    expect(decision.stop).toBe(true);
    expect(decision.stopCondition).toBe('CHILD_EXITED_UNCONFIRMED');
    expect(decision.haltKind).toBe('STOP_CONDITION');
  });

  it('a suppressed hard kill still stops the replicate, under v2', () => {
    const decision = deriveStopDecision({
      tier2: { ...CLEAN_TIER2, hardKillDisposition: 'SUPPRESSED_EXPIRED_TARGET_IDENTITY' },
      artifacts: artifacts('OK'),
      requestedModelId: MODEL,
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    });
    expect(decision.stopCondition).toBe('SUPPRESSED_EXPIRED_TARGET_IDENTITY');
  });

  it('a watchdog fire with no Tier-1 TIMEOUT is still the liveness stop condition', () => {
    const decision = deriveStopDecision({
      tier2: { ...CLEAN_TIER2, outcome: 'TIMED_OUT_KILLED' },
      artifacts: artifacts('OK'),
      requestedModelId: MODEL,
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    });
    expect(decision.stopCondition).toBe('TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT');
    expect(decision.evaluationOutcomeClass).toBe('TIER2_LIVENESS_FAILURE');
  });
});

/**
 * 2D2C-F0Z STAGE-1 FINAL COMPATIBILITY CORRECTION.
 *
 * C6 (the closed non-terminal allow-list) is the correct FUTURE v2 rule and
 * is KEPT. The defect it carried was one of SCOPE: it applied regardless of
 * the declared semantics, so an ABSENT version — which the F0Z contract
 * defines as historical v1 — silently changed behaviour for AUTH_FAILURE,
 * PROVIDER_REFUSAL and PROVIDER_TRANSIENT.
 *
 * The invariant these tests pin is stronger than "TIMEOUT is unchanged":
 *
 *     ABSENT reliabilitySemanticsVersion == historical v1 behaviour,
 *     for EVERY outcome.
 *
 * v1's continuation on those three is NOT endorsed here. It is preserved
 * only because v1 is historical evidence semantics. Recovery-1 never hit any
 * of the three, so no historical result depends on it either way.
 */
describe('2D2C-F0Z final: C6 is SCOPED to v2; v1 keeps the exact pre-F0Z behaviour', () => {
  const HISTORICALLY_CONTINUING = [
    'AUTH_FAILURE',
    'PROVIDER_REFUSAL',
    'PROVIDER_TRANSIENT',
  ] as const;

  const decideFor = (
    outcome: (typeof HISTORICALLY_CONTINUING)[number] | 'STRUCTURED_OUTPUT_FAILED',
    version: string | undefined,
  ) =>
    deriveStopDecision({
      tier2: CLEAN_TIER2,
      artifacts: artifacts(outcome),
      requestedModelId: MODEL,
      ...(version === undefined ? {} : { reliabilitySemanticsVersion: version }),
    });

  it.each(HISTORICALLY_CONTINUING)(
    'an ABSENT version preserves historical continuation for %s',
    (outcome) => {
      const decision = decideFor(outcome, undefined);
      expect(decision.stop).toBe(false);
      expect(decision.stopCondition).toBeNull();
      expect(decision.haltKind).toBeNull();
      // The original pre-F0Z detail wording, byte-for-byte.
      expect(decision.detail).toBe(
        `non-OK outcome ${outcome} reconciled to this attempt with a persisted diagnostic record; ` +
          'the batch is not completed and the experiment continues.',
      );
    },
  );

  it.each(HISTORICALLY_CONTINUING)('an EXPLICIT v1 does the same for %s', (outcome) => {
    const decision = decideFor(outcome, RELIABILITY_SEMANTICS_V1_HISTORICAL);
    expect(decision.stop).toBe(false);
    expect(decision.stopCondition).toBeNull();
    expect(decision.haltKind).toBeNull();
  });

  it.each(HISTORICALLY_CONTINUING)('v2 STOPS %s, exactly as C6 requires', (outcome) => {
    const decision = decideFor(outcome, RELIABILITY_SEMANTICS_V2);
    expect(decision.stop).toBe(true);
    expect(decision.stopCondition).toBe('UNRECONCILED_PROVIDER_FAILURE');
    expect(decision.evaluationOutcomeClass).toBe('AUTH_OR_PRE_INFERENCE_FAILURE');
    expect(decision.detail).toContain('not an admitted non-terminal observation');
  });

  it.each(HISTORICALLY_CONTINUING)(
    'even where v1 CONTINUES on %s, the class still names it a control-plane failure',
    (outcome) => {
      // The behaviour is historical; the LABEL is honest. The record
      // documents the defect rather than repeating it.
      const decision = decideFor(outcome, undefined);
      expect(decision.stop).toBe(false);
      expect(decision.evaluationOutcomeClass).toBe('AUTH_OR_PRE_INFERENCE_FAILURE');
    },
  );

  it('STRUCTURED_OUTPUT_FAILED continues under BOTH versions, identically', () => {
    for (const version of [
      undefined,
      RELIABILITY_SEMANTICS_V1_HISTORICAL,
      RELIABILITY_SEMANTICS_V2,
    ]) {
      const decision = decideFor('STRUCTURED_OUTPUT_FAILED', version);
      expect(decision.stop, String(version)).toBe(false);
      expect(decision.evaluationOutcomeClass, String(version)).toBe(
        'STRUCTURED_OUTPUT_FAILED_NON_TERMINAL',
      );
    }
  });

  it('v1 TIMEOUT still produces the historical TIER1_TIMEOUT_DECISION_RULE', () => {
    for (const version of [undefined, RELIABILITY_SEMANTICS_V1_HISTORICAL]) {
      const decision = decide(
        version === undefined ? {} : { reliabilitySemanticsVersion: version },
      );
      expect(decision.stop, String(version)).toBe(true);
      expect(decision.haltKind, String(version)).toBe('TIER1_TIMEOUT_DECISION_RULE');
    }
  });

  it('v2 confirmed TIMEOUT still performs the C1 continuation', () => {
    const decision = decide({ reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2 });
    expect(decision.stop).toBe(false);
    expect(decision.evaluationOutcomeClass).toBe('PROVIDER_TIMEOUT_NON_TERMINAL');
  });
});

describe('2D2C-F0Z final: an UNKNOWN semantics version fails closed, never coerced to v1', () => {
  const UNKNOWN = ['RELIABILITY_SEMANTICS_V3_FUTURE', 'v1', '', ' ', 'RELIABILITY_SEMANTICS'];

  it.each(UNKNOWN)('refuses %j deterministically, before any other rule', (version) => {
    const decision = deriveStopDecision({
      tier2: CLEAN_TIER2,
      artifacts: artifacts('OK'),
      requestedModelId: MODEL,
      reliabilitySemanticsVersion: version,
    });
    expect(decision.stop).toBe(true);
    expect(decision.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect(decision.evaluationOutcomeClass).toBe('AUTH_OR_PRE_INFERENCE_FAILURE');
    expect(decision.detail).toContain('which this build does not implement');
    expect(decision.detail).toContain('never coerced to the historical default');
  });

  it('the refusal wins over every other rule, including a would-be OK and a would-be v1 continuation', () => {
    // A perfectly reconcilable OK is still refused: a runtime that cannot say
    // which rule set governs it cannot honestly apply one.
    for (const outcome of ['OK', 'AUTH_FAILURE', 'STRUCTURED_OUTPUT_FAILED', 'TIMEOUT'] as const) {
      const decision = deriveStopDecision({
        tier2: CLEAN_TIER2,
        artifacts: artifacts(outcome),
        requestedModelId: MODEL,
        reliabilitySemanticsVersion: 'SOMETHING_UNKNOWN',
      });
      expect(decision.stop, outcome).toBe(true);
      expect(decision.stopCondition, outcome).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    }
  });

  it('is deterministic: the same unknown version yields the identical decision every time', () => {
    const once = deriveStopDecision({
      tier2: CLEAN_TIER2,
      artifacts: artifacts('OK'),
      requestedModelId: MODEL,
      reliabilitySemanticsVersion: 'SOMETHING_UNKNOWN',
    });
    const twice = deriveStopDecision({
      tier2: CLEAN_TIER2,
      artifacts: artifacts('OK'),
      requestedModelId: MODEL,
      reliabilitySemanticsVersion: 'SOMETHING_UNKNOWN',
    });
    expect(once).toEqual(twice);
  });

  it('only the two KNOWN versions, and an absent one, are ever interpreted', () => {
    for (const known of [
      undefined,
      RELIABILITY_SEMANTICS_V1_HISTORICAL,
      RELIABILITY_SEMANTICS_V2,
    ]) {
      const decision = deriveStopDecision({
        tier2: CLEAN_TIER2,
        artifacts: artifacts('OK'),
        requestedModelId: MODEL,
        ...(known === undefined ? {} : { reliabilitySemanticsVersion: known }),
      });
      expect(decision.stop, String(known)).toBe(false);
      expect(decision.evaluationOutcomeClass, String(known)).toBe('VALIDATED_SEMANTIC_RESULT');
    }
  });
});

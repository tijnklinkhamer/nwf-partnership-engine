/**
 * THE 2D2B-2 TIMEOUT -> PERSISTED COMPLETION CHAIN, always executed, no
 * database. Follows the REAL functions end to end:
 *
 *   new AgentSdkTimeoutError(...)                 (what the liveness boundary throws)
 *     -> classifyThrownFailure                    (the one outcome mapping)
 *     -> buildProviderFailureCompletion           (the one completion translation)
 *     -> { terminalState: 'FAILED', errorKind: 'TIMEOUT' }
 *
 * The DB-gated integration test in `orgunitClassifyClaudeMaxRuntime.test.ts`
 * proves the same outcome reaches `orgunit_classifier_call_completions`
 * through the `nwf_classifier` role; this file proves the mapping even where
 * no database is configured.
 */
import { describe, expect, it } from 'vitest';
import { AgentSdkTimeoutError } from '../../orgunits/classify/provider/agentSdkRunner.js';
import {
  classifyThrownFailure,
  classifyTotalBudgetExhausted,
} from '../../orgunits/classify/provider/outcomeMapping.js';
import {
  buildProviderFailureCompletion,
  mapProviderOutcomeToErrorKind,
} from '../../orgunits/classify/orchestrate.js';
import type { ClassifierProviderOutcomeKind } from '../../orgunits/classify/providerContract.js';

const STDERR_MARKER = 'stderr-that-must-never-be-persisted';

function realTimeoutError(): AgentSdkTimeoutError {
  return new AgentSdkTimeoutError(300_000, {
    progress: [
      { stage: 'QUERY_STARTED', elapsedMs: 0 },
      { stage: 'DEADLINE_EXPIRED', elapsedMs: 300_000 },
    ],
    stderrTail: STDERR_MARKER,
    pid: null,
  });
}

describe('TIMEOUT persistence mapping (non-DB, always executed)', () => {
  it('a real AgentSdkTimeoutError -> real classifyThrownFailure -> real buildProviderFailureCompletion -> FAILED / TIMEOUT', () => {
    const classified = classifyThrownFailure(realTimeoutError());
    expect(classified.kind).toBe('TIMEOUT');
    if (classified.kind === 'OK') throw new Error('unreachable');
    expect(buildProviderFailureCompletion(classified.kind)).toEqual({
      terminalState: 'FAILED',
      errorKind: 'TIMEOUT',
    });
    // The detail - the only string that can reach error_summary - is fixed text.
    expect(classified.detail).not.toContain(STDERR_MARKER);
    expect(classified.detail).not.toContain('DEADLINE_EXPIRED');
  });

  it('a spent total budget maps to the same persisted FAILED / TIMEOUT', () => {
    const classified = classifyTotalBudgetExhausted();
    expect(classified.kind).toBe('TIMEOUT');
    if (classified.kind === 'OK') throw new Error('unreachable');
    expect(buildProviderFailureCompletion(classified.kind)).toEqual({
      terminalState: 'FAILED',
      errorKind: 'TIMEOUT',
    });
  });

  it('every one of the six non-OK provider outcomes persists FAILED, with the landed error_kind translation', () => {
    const expected: Record<Exclude<ClassifierProviderOutcomeKind, 'OK'>, string> = {
      USAGE_LIMIT_EXHAUSTED: 'USAGE_LIMIT_EXHAUSTED',
      AUTH_FAILURE: 'AUTH_FAILURE',
      PROVIDER_TRANSIENT: 'PROVIDER_TRANSIENT',
      PROVIDER_REFUSAL: 'PROVIDER_REFUSAL',
      STRUCTURED_OUTPUT_FAILED: 'SCHEMA_INVALID',
      TIMEOUT: 'TIMEOUT',
    };
    const outcomes = Object.keys(expected) as Exclude<ClassifierProviderOutcomeKind, 'OK'>[];
    expect(outcomes).toHaveLength(6);
    for (const outcome of outcomes) {
      expect(buildProviderFailureCompletion(outcome)).toEqual({
        terminalState: 'FAILED',
        errorKind: expected[outcome],
      });
      expect(mapProviderOutcomeToErrorKind(outcome)).toBe(expected[outcome]);
    }
  });

  it('OK is refused at runtime by both the failure helper and the mapping', () => {
    expect(() => buildProviderFailureCompletion('OK')).toThrow(/OK is not a failure outcome/);
    expect(() => mapProviderOutcomeToErrorKind('OK')).toThrow(/OK is not a failure outcome/);
  });

  it('the existing AbortError and textual-timeout recognition still map to TIMEOUT', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(classifyThrownFailure(abort).kind).toBe('TIMEOUT');
    expect(classifyThrownFailure(new Error('request timed out')).kind).toBe('TIMEOUT');
  });
});

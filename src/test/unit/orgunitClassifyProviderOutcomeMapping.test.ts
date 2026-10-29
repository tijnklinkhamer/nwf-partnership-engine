/**
 * The centralized SDK-failure → provider-neutral outcome mapping.
 * Usage-limit recognition is proven against the SDK's OWN exported prefix
 * vocabulary; unknown errors are proven NEVER to be labelled exhaustion.
 */
import { describe, expect, it } from 'vitest';
import {
  AgentSdkTimeoutError,
  USAGE_LIMIT_ERROR_PREFIXES,
  type AgentSdkRunResult,
} from '../../orgunits/classify/provider/agentSdkRunner.js';
import {
  PROVIDER_OUTCOME_REASON_CODES,
  classifyRunResult,
  classifyThrownFailure,
  classifyTotalBudgetExhausted,
} from '../../orgunits/classify/provider/outcomeMapping.js';

function runResult(overrides: Partial<AgentSdkRunResult> = {}): AgentSdkRunResult {
  return {
    subtype: 'success',
    isError: false,
    structuredOutput: undefined,
    resultText: null,
    stopReason: null,
    responseModelId: 'test-model-max',
    inputTokens: 100,
    outputTokens: 50,
    errors: [],
    ...overrides,
  };
}

describe('classifyRunResult', () => {
  it('maps a successful structured result to OK, carrying the raw value untouched', () => {
    const payload = [{ doc_index: 0 }];
    const classified = classifyRunResult(runResult({ structuredOutput: payload }));
    expect(classified.kind).toBe('OK');
    if (classified.kind !== 'OK') throw new Error('unreachable');
    expect(classified.structuredOutput).toBe(payload);
  });

  it('maps success WITHOUT structured output to STRUCTURED_OUTPUT_FAILED - never an empty success, never salvage', () => {
    const classified = classifyRunResult(
      runResult({ resultText: '[{"doc_index": 0}] here is my JSON as prose' }),
    );
    expect(classified.kind).toBe('STRUCTURED_OUTPUT_FAILED');
  });

  it('maps exhausted SDK structured-output retries to STRUCTURED_OUTPUT_FAILED', () => {
    const classified = classifyRunResult(
      runResult({
        subtype: 'error_max_structured_output_retries',
        isError: true,
        errors: ['structured output validation failed repeatedly'],
      }),
    );
    expect(classified.kind).toBe('STRUCTURED_OUTPUT_FAILED');
  });

  it('recognises EVERY SDK usage-limit prefix as USAGE_LIMIT_EXHAUSTED', () => {
    expect(USAGE_LIMIT_ERROR_PREFIXES.length).toBeGreaterThan(0);
    for (const prefix of USAGE_LIMIT_ERROR_PREFIXES) {
      const classified = classifyRunResult(
        runResult({ isError: true, resultText: `${prefix} limit details here` }),
      );
      expect(classified.kind, `prefix: ${prefix}`).toBe('USAGE_LIMIT_EXHAUSTED');
    }
  });

  it('recognises usage-limit text arriving through an error-subtype errors array too', () => {
    const classified = classifyRunResult(
      runResult({
        subtype: 'error_during_execution',
        isError: true,
        errors: [`${USAGE_LIMIT_ERROR_PREFIXES[0]!} weekly limit`],
      }),
    );
    expect(classified.kind).toBe('USAGE_LIMIT_EXHAUSTED');
  });

  it('maps auth-shaped provider errors to AUTH_FAILURE', () => {
    for (const text of [
      'API Error: 401 authentication_error',
      'OAuth token has expired. Please run /login',
      'Unauthorized',
    ]) {
      const classified = classifyRunResult(runResult({ isError: true, resultText: text }));
      expect(classified.kind, text).toBe('AUTH_FAILURE');
    }
  });

  it('maps a model refusal stop reason to PROVIDER_REFUSAL, never to semantic data', () => {
    const classified = classifyRunResult(runResult({ stopReason: 'refusal' }));
    expect(classified.kind).toBe('PROVIDER_REFUSAL');
  });

  it('maps timeout-shaped error text to TIMEOUT', () => {
    const classified = classifyRunResult(
      runResult({
        subtype: 'error_during_execution',
        isError: true,
        errors: ['Request timed out'],
      }),
    );
    expect(classified.kind).toBe('TIMEOUT');
  });

  it('maps max-turns / max-budget terminations to STRUCTURED_OUTPUT_FAILED (terminal, not retried)', () => {
    for (const subtype of ['error_max_turns', 'error_max_budget_usd'] as const) {
      const classified = classifyRunResult(runResult({ subtype, isError: true, errors: [] }));
      expect(classified.kind).toBe('STRUCTURED_OUTPUT_FAILED');
    }
  });

  it('maps an UNRECOGNISED provider error to PROVIDER_TRANSIENT - and NEVER to usage exhaustion', () => {
    const classified = classifyRunResult(
      runResult({
        subtype: 'error_during_execution',
        isError: true,
        errors: ['some entirely novel provider failure nobody has documented'],
      }),
    );
    expect(classified.kind).toBe('PROVIDER_TRANSIENT');
    expect(classified.kind).not.toBe('USAGE_LIMIT_EXHAUSTED');
  });

  it('maps the EXACT 2B-2C3B deterministic structured-output/request-schema 400 to STRUCTURED_OUTPUT_FAILED, never PROVIDER_TRANSIENT', () => {
    // The exact text the 2026-09-01 smoke observed: subtype 'success' with
    // is_error true (the SDK's own documented shape for this failure), and
    // the error text landing in resultText per this module's own contract.
    const classified = classifyRunResult(
      runResult({
        isError: true,
        resultText:
          'Claude Code returned an error result: API Error: 400\n' +
          "tools.0.custom.input_schema.type: Input should be 'object'",
      }),
    );
    expect(classified.kind).toBe('STRUCTURED_OUTPUT_FAILED');
    expect(classified.kind).not.toBe('PROVIDER_TRANSIENT');
  });

  it('does NOT classify an unrelated 4xx (no input_schema mention) as STRUCTURED_OUTPUT_FAILED - narrow, evidence-based recognition only', () => {
    const classified = classifyRunResult(
      runResult({
        subtype: 'error_during_execution',
        isError: true,
        errors: ['API Error: 429 rate limit exceeded'],
      }),
    );
    expect(classified.kind).toBe('PROVIDER_TRANSIENT');
  });
});

describe('classifyThrownFailure', () => {
  it('recognises the liveness boundary AgentSdkTimeoutError as TIMEOUT by class, with a fixed detail carrying none of its diagnostics', () => {
    const error = new AgentSdkTimeoutError(149_500, {
      progress: [{ stage: 'DEADLINE_EXPIRED', elapsedMs: 149_500 }],
      // Text that would otherwise look like usage exhaustion or auth failure:
      // class recognition comes FIRST, so neither heuristic can claim it.
      stderrTail: `${USAGE_LIMIT_ERROR_PREFIXES[0]!} 401 unauthorized`,
      pid: null,
    });
    const classified = classifyThrownFailure(error);
    expect(classified.kind).toBe('TIMEOUT');
    if (classified.kind === 'OK') throw new Error('unreachable');
    expect(classified.detail).toMatch(/liveness deadline/);
    expect(classified.detail).not.toContain('unauthorized');
    expect(classified.detail).not.toContain('149500');
  });

  it('maps a spent total budget to a terminal TIMEOUT with fixed text', () => {
    const classified = classifyTotalBudgetExhausted();
    expect(classified.kind).toBe('TIMEOUT');
    if (classified.kind === 'OK') throw new Error('unreachable');
    expect(classified.detail).toMatch(/total time budget was exhausted/);
  });

  it('maps an AbortError to TIMEOUT', () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    expect(classifyThrownFailure(abort).kind).toBe('TIMEOUT');
  });

  it('maps timeout-shaped thrown text to TIMEOUT', () => {
    expect(classifyThrownFailure(new Error('connect ETIMEDOUT: request timeout')).kind).toBe(
      'TIMEOUT',
    );
  });

  it('maps thrown usage-limit text to USAGE_LIMIT_EXHAUSTED', () => {
    expect(
      classifyThrownFailure(new Error(`${USAGE_LIMIT_ERROR_PREFIXES[0]!} 5-hour limit`)).kind,
    ).toBe('USAGE_LIMIT_EXHAUSTED');
  });

  it('maps thrown auth text to AUTH_FAILURE', () => {
    expect(classifyThrownFailure(new Error('401 authentication_error')).kind).toBe('AUTH_FAILURE');
  });

  it('maps a thrown deterministic structured-output/request-schema 400 to STRUCTURED_OUTPUT_FAILED, never PROVIDER_TRANSIENT', () => {
    // The exact shape a `query()` next() pull throws per the 2026-09-01
    // smoke, for the transport path (e.g. the very first pull throwing
    // before any message is yielded at all).
    const classified = classifyThrownFailure(
      new Error(
        'Claude Code returned an error result: API Error: 400\n' +
          "tools.0.custom.input_schema.type: Input should be 'object'",
      ),
    );
    expect(classified.kind).toBe('STRUCTURED_OUTPUT_FAILED');
    expect(classified.kind).not.toBe('PROVIDER_TRANSIENT');
  });

  it('maps transport resets and unknown throwables to PROVIDER_TRANSIENT - never exhaustion', () => {
    for (const thrown of [
      new Error('read ECONNRESET'),
      new Error('spawn failed'),
      'string-throw',
    ]) {
      const classified = classifyThrownFailure(thrown);
      expect(classified.kind).toBe('PROVIDER_TRANSIENT');
    }
  });

  it('never copies raw provider text or a credential into the fixed detail strings', () => {
    const secret = 'test-oauth-secret-do-not-log';
    const classified = classifyThrownFailure(new Error(`boom ${secret} boom`));
    if (classified.kind === 'OK') throw new Error('unreachable');
    expect(classified.detail).not.toContain(secret);
    expect(classified.detail).not.toContain('boom');
  });
});

/**
 * 2D2C-F0Z — REASON CODES, AND THE ORDERING CORRECTION.
 *
 * `STRUCTURED_OUTPUT_FAILED` covers five structurally different SDK
 * conditions. Recovery-1's PAIR_3_V4 batch-09 was `error_max_turns` under
 * `maxTurns: 3` with 4,518 output tokens — a turn-budget exhaustion, not a
 * schema failure — and the distinction survived only as English prose.
 *
 * These tests pin the machine-readable code, and pin the ordering fix: every
 * EXPLICIT SDK subtype is now tested before the `matchesTimeout` TEXT
 * heuristic, which matches the bare substring "timeout" anywhere.
 */
describe('2D2C-F0Z provider outcome reason codes', () => {
  it('every non-OK classification carries a code from the closed set', () => {
    const cases = [
      classifyRunResult(runResult({ subtype: 'error_max_turns', isError: true })),
      classifyRunResult(runResult({ subtype: 'error_max_budget_usd', isError: true })),
      classifyRunResult(
        runResult({ subtype: 'error_max_structured_output_retries', isError: true }),
      ),
      classifyRunResult(runResult({ structuredOutput: undefined })),
      classifyRunResult(runResult({ subtype: 'error_during_execution', isError: true })),
      classifyRunResult(runResult({ stopReason: 'refusal' })),
      classifyThrownFailure(
        new AgentSdkTimeoutError(300_000, { progress: [], stderrTail: '', pid: null }),
      ),
      classifyTotalBudgetExhausted(),
    ];
    for (const classified of cases) {
      expect(classified.kind).not.toBe('OK');
      if (classified.kind === 'OK') continue;
      expect(PROVIDER_OUTCOME_REASON_CODES).toContain(classified.reasonCode);
    }
  });

  it('disambiguates the five STRUCTURED_OUTPUT_FAILED conditions from one another', () => {
    const of = (r: AgentSdkRunResult) => {
      const c = classifyRunResult(r);
      return c.kind === 'OK' ? null : { kind: c.kind, reasonCode: c.reasonCode };
    };
    expect(of(runResult({ structuredOutput: undefined }))).toEqual({
      kind: 'STRUCTURED_OUTPUT_FAILED',
      reasonCode: 'SUCCESS_WITHOUT_STRUCTURED_OUTPUT',
    });
    expect(
      of(runResult({ subtype: 'error_max_structured_output_retries', isError: true })),
    ).toEqual({
      kind: 'STRUCTURED_OUTPUT_FAILED',
      reasonCode: 'SDK_STRUCTURED_OUTPUT_RETRIES_EXHAUSTED',
    });
    expect(of(runResult({ subtype: 'error_max_turns', isError: true }))).toEqual({
      kind: 'STRUCTURED_OUTPUT_FAILED',
      reasonCode: 'MAX_TURNS_EXHAUSTED',
    });
    expect(of(runResult({ subtype: 'error_max_budget_usd', isError: true }))).toEqual({
      kind: 'STRUCTURED_OUTPUT_FAILED',
      reasonCode: 'MAX_BUDGET_USD_EXHAUSTED',
    });
    expect(
      of(
        runResult({
          subtype: 'error_during_execution',
          isError: true,
          errors: ['API Error: 400 tools.0.custom.input_schema.type: Input should be object'],
        }),
      ),
    ).toEqual({
      kind: 'STRUCTURED_OUTPUT_FAILED',
      reasonCode: 'REQUEST_SCHEMA_REJECTED',
    });
  });

  it('ORDERING REGRESSION: an error_max_turns result whose text merely mentions a timeout is NOT a TIMEOUT', () => {
    // Before the F0Z ordering correction the text heuristic ran first, so
    // this was classified TIMEOUT. Under C1 a TIMEOUT and a
    // STRUCTURED_OUTPUT_FAILED travel different paths, so a structural fact
    // must never lose to a substring.
    const classified = classifyRunResult(
      runResult({
        subtype: 'error_max_turns',
        isError: true,
        errors: ['the tool call timed out after a timeout waiting on the sandbox'],
      }),
    );
    expect(classified.kind).toBe('STRUCTURED_OUTPUT_FAILED');
    if (classified.kind !== 'OK') expect(classified.reasonCode).toBe('MAX_TURNS_EXHAUSTED');
  });

  it('a genuine provider-reported timeout with no explicit subtype still maps to TIMEOUT', () => {
    const classified = classifyRunResult(
      runResult({
        subtype: 'error_during_execution',
        isError: true,
        errors: ['upstream request timed out'],
      }),
    );
    expect(classified.kind).toBe('TIMEOUT');
    if (classified.kind !== 'OK') expect(classified.reasonCode).toBe('PROVIDER_REPORTED_TIMEOUT');
  });

  it('tells the two TIMEOUT flavours apart: liveness deadline versus total budget', () => {
    const deadline = classifyThrownFailure(
      new AgentSdkTimeoutError(300_000, { progress: [], stderrTail: '', pid: null }),
    );
    const budget = classifyTotalBudgetExhausted();
    expect(deadline.kind).toBe('TIMEOUT');
    expect(budget.kind).toBe('TIMEOUT');
    if (deadline.kind !== 'OK') expect(deadline.reasonCode).toBe('LIVENESS_DEADLINE_EXCEEDED');
    if (budget.kind !== 'OK') expect(budget.reasonCode).toBe('TOTAL_BUDGET_EXHAUSTED');
  });
});

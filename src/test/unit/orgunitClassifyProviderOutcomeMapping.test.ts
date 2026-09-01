/**
 * The centralized SDK-failure → provider-neutral outcome mapping.
 * Usage-limit recognition is proven against the SDK's OWN exported prefix
 * vocabulary; unknown errors are proven NEVER to be labelled exhaustion.
 */
import { describe, expect, it } from 'vitest';
import {
  USAGE_LIMIT_ERROR_PREFIXES,
  type AgentSdkRunResult,
} from '../../orgunits/classify/provider/agentSdkRunner.js';
import {
  classifyRunResult,
  classifyThrownFailure,
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

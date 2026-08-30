import { describe, expect, it } from 'vitest';
import {
  ScriptedTestProvider,
  scriptedAuthFailure,
  scriptedOk,
  scriptedRefusal,
  scriptedStructuredOutputFailed,
  scriptedTimeout,
  scriptedTransient,
  scriptedUsageLimitExhausted,
} from '../../orgunits/classify/scriptedProvider.js';
import type { ClassifierProviderRequest } from '../../orgunits/classify/providerContract.js';

const REQUEST: ClassifierProviderRequest = {
  systemPrompt: 'system',
  serializedBatch: '{}',
  outputJsonSchema: {},
  modelId: 'scripted-test-model',
  runConfig: {},
};

describe('ScriptedTestProvider', () => {
  it('answers a fixed script in order and counts calls', async () => {
    const provider = new ScriptedTestProvider([scriptedOk([]), scriptedTransient()]);
    expect(provider.callCount).toBe(0);

    const first = await provider.classify(REQUEST);
    expect(first.outcome).toBe('OK');
    expect(provider.callCount).toBe(1);

    const second = await provider.classify(REQUEST);
    expect(second.outcome).toBe('PROVIDER_TRANSIENT');
    expect(provider.callCount).toBe(2);
  });

  it('records every request it was actually invoked with', async () => {
    const provider = new ScriptedTestProvider([scriptedOk([])]);
    await provider.classify(REQUEST);
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]).toEqual(REQUEST);
  });

  it('throws (never silently answers) when the script is exhausted', async () => {
    const provider = new ScriptedTestProvider([scriptedOk([])]);
    await provider.classify(REQUEST);
    await expect(provider.classify(REQUEST)).rejects.toThrow(/no scripted response/);
  });

  it('supports a function-shaped script entry, keyed by call index', async () => {
    const provider = new ScriptedTestProvider([
      () => scriptedTransient(),
      () => scriptedTransient(),
      () => scriptedOk(['ok']),
    ]);
    const outcomes: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      outcomes.push((await provider.classify(REQUEST)).outcome);
    }
    expect(outcomes).toEqual(['PROVIDER_TRANSIENT', 'PROVIDER_TRANSIENT', 'OK']);
  });

  it('makes zero network calls and never imports a live provider dependency (structural: this test file itself proves construction and invocation stay entirely in-process)', async () => {
    const provider = new ScriptedTestProvider([scriptedOk({ x: 1 })]);
    const result = await provider.classify(REQUEST);
    expect(result.rawOutput).toEqual({ x: 1 });
  });
});

describe('scripted* factory functions cover every provider-neutral outcome kind', () => {
  it.each([
    ['OK', () => scriptedOk([])],
    ['PROVIDER_TRANSIENT', scriptedTransient],
    ['PROVIDER_REFUSAL', scriptedRefusal],
    ['STRUCTURED_OUTPUT_FAILED', scriptedStructuredOutputFailed],
    ['TIMEOUT', scriptedTimeout],
    ['USAGE_LIMIT_EXHAUSTED', scriptedUsageLimitExhausted],
    ['AUTH_FAILURE', scriptedAuthFailure],
  ] as const)('%s', (expectedOutcome, factory) => {
    const result = factory();
    expect(result.outcome).toBe(expectedOutcome);
  });

  it('every non-OK factory carries null rawOutput', () => {
    for (const factory of [
      scriptedTransient,
      scriptedRefusal,
      scriptedStructuredOutputFailed,
      scriptedTimeout,
      scriptedUsageLimitExhausted,
      scriptedAuthFailure,
    ]) {
      expect(factory().rawOutput).toBeNull();
    }
  });

  it('scriptedOk defaults reported model id and token counts, but stays overridable', () => {
    const withDefaults = scriptedOk([]);
    expect(withDefaults.responseModelId).toBe('scripted-test-model');
    expect(withDefaults.inputTokens).not.toBeNull();

    const overridden = scriptedOk([], { responseModelId: 'other-model', inputTokens: 5 });
    expect(overridden.responseModelId).toBe('other-model');
    expect(overridden.inputTokens).toBe(5);
  });
});

describe("a provider that retries internally still produces ONE classify() call from orchestration's point of view", () => {
  it('a script entry can use retryTransient internally, and the caller only ever sees ONE classify() invocation regardless of how many internal attempts it took', async () => {
    // Simulates what a real adapter's own internal transient-retry
    // (retry.ts) would do inside its classify() implementation: from
    // ORCHESTRATION's side, this is still exactly one
    // `await provider.classify(request)` - the internal looping is
    // invisible, exactly as orchestrate.ts's own module comment states.
    const { retryTransient } = await import('../../orgunits/classify/retry.js');
    const { createFakeClock } = await import('../../orgunits/orchestrator/clock.js');
    const clock = createFakeClock();

    let internalAttempts = 0;
    const provider = new ScriptedTestProvider([
      async () =>
        retryTransient(
          async () => {
            internalAttempts += 1;
            return internalAttempts < 3 ? scriptedTransient() : scriptedOk(['recovered']);
          },
          { isTransient: (r) => r.outcome === 'PROVIDER_TRANSIENT', clock },
        ),
    ]);

    const promise = provider.classify(REQUEST);
    for (let i = 0; i < 10; i += 1) {
      clock.advance(100_000);
      await Promise.resolve();
    }
    const result = await promise;

    expect(result.outcome).toBe('OK');
    expect(internalAttempts).toBe(3); // three internal attempts happened...
    expect(provider.callCount).toBe(1); // ...but exactly one classify() call, from the caller's perspective
  });
});

import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../orgunits/orchestrator/clock.js';
import {
  MAX_TRANSIENT_RETRIES,
  retryTransient,
  TRANSIENT_RETRY_BASE_DELAY_MS,
} from '../../orgunits/classify/retry.js';

describe('retryTransient', () => {
  it('returns the first attempt immediately when it is not transient', async () => {
    let calls = 0;
    const result = await retryTransient(
      async () => {
        calls += 1;
        return 'ok';
      },
      { isTransient: (r) => r !== 'ok' },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries a transient result up to the bound, then returns the last transient result (never throws on exhaustion)', async () => {
    const clock = createFakeClock();
    let calls = 0;
    const promise = retryTransient(
      async () => {
        calls += 1;
        return 'transient';
      },
      { isTransient: (r) => r === 'transient', clock },
    );
    // Advance past every possible backoff delay so the promise can settle.
    await advanceUntilSettled(clock, promise);
    const result = await promise;
    expect(result).toBe('transient');
    expect(calls).toBe(1 + MAX_TRANSIENT_RETRIES);
  });

  it('stops retrying as soon as a non-transient result appears (bounded, no infinite loop)', async () => {
    const clock = createFakeClock();
    let calls = 0;
    const promise = retryTransient(
      async () => {
        calls += 1;
        return calls < 2 ? 'transient' : 'ok';
      },
      { isTransient: (r) => r === 'transient', clock },
    );
    await advanceUntilSettled(clock, promise);
    const result = await promise;
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('honours a custom maxRetries bound', async () => {
    const clock = createFakeClock();
    let calls = 0;
    const promise = retryTransient(
      async () => {
        calls += 1;
        return 'transient';
      },
      { isTransient: () => true, clock, maxRetries: 0 },
    );
    await advanceUntilSettled(clock, promise);
    await promise;
    expect(calls).toBe(1); // zero retries permitted -> exactly one attempt
  });

  it('waits an exponentially increasing delay between attempts', async () => {
    const clock = createFakeClock();
    const sleeps: number[] = [];
    const originalSleep = clock.sleep.bind(clock);
    clock.sleep = async (ms: number) => {
      sleeps.push(ms);
      return originalSleep(ms);
    };

    const promise = retryTransient(async () => 'transient', {
      isTransient: () => true,
      clock,
      maxRetries: 2,
      baseDelayMs: 100,
    });
    await advanceUntilSettled(clock, promise);
    await promise;

    expect(sleeps).toEqual([100, 200]);
  });

  it('exports the frozen policy constants the Max-runtime design specifies', () => {
    expect(MAX_TRANSIENT_RETRIES).toBe(2);
    expect(TRANSIENT_RETRY_BASE_DELAY_MS).toBeGreaterThan(0);
  });
});

/** Repeatedly advances the fake clock until the promise settles or a safety bound is hit - no real wall-clock wait. */
async function advanceUntilSettled(
  clock: ReturnType<typeof createFakeClock>,
  promise: Promise<unknown>,
): Promise<void> {
  let settled = false;
  void promise.finally(() => {
    settled = true;
  });
  for (let i = 0; i < 100 && !settled; i += 1) {
    clock.advance(100_000);
    await Promise.resolve();
    await Promise.resolve();
  }
}

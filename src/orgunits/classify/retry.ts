/**
 * A PROVIDER-NEUTRAL BOUNDED TRANSIENT-RETRY HELPER.
 *
 * The Max-runtime design's retry taxonomy (§21) places transient-failure
 * retry INSIDE the provider adapter, not in orchestration: "bounded, inside
 * the adapter: max 2, exponential backoff... same call row (retries
 * precede any completion)". `orchestrate.ts` therefore calls
 * `ClassifierProvider.classify()` exactly ONCE per classifier call row — it
 * never loops on a `PROVIDER_TRANSIENT` outcome itself. This module is the
 * reusable, provider-neutral MECHANISM an adapter's own `classify()`
 * implementation can call internally to honour that bound, so the policy
 * (`MAX_TRANSIENT_RETRIES` below) is defined once and shared rather than
 * reimplemented per adapter. `ScriptedTestProvider` uses it to prove the
 * end-to-end contract: a provider that retries internally still produces
 * exactly one classifier-call row and one completion (see its own tests).
 *
 * Bounded on purpose: `retryTransient` NEVER retries more than
 * `MAX_TRANSIENT_RETRIES` times, and never retries at all when `isTransient`
 * returns false for the thrown/returned failure — a non-transient failure
 * (schema-invalid, auth, usage-exhaustion, refusal) must reach the caller on
 * the first attempt, exactly as the taxonomy requires (§21: "never" for
 * every one of those classes).
 *
 * Uses the orchestrator's existing injectable `Clock` (`realClock` in
 * production; `createFakeClock()` in tests) rather than a bare
 * `setTimeout`, so backoff is provable without a real wall-clock wait —
 * the same discipline `orchestrator/clock.ts` already established for
 * per-host acquisition pacing.
 *
 * PURE aside from the injected clock's own timers; no network, no
 * database, no filesystem, no environment read, and no `Date.now()`/
 * `Math.random()` of its own — every source of non-determinism is an
 * explicit parameter.
 */
import { realClock, type Clock } from '../orchestrator/clock.js';

/** Two retries after the first attempt — three attempts total — matching the design's "max 2" exactly. */
export const MAX_TRANSIENT_RETRIES = 2;

/** Exponential backoff base, in milliseconds: attempt 1's retry waits this long, attempt 2's retry waits double. */
export const TRANSIENT_RETRY_BASE_DELAY_MS = 500;

export interface RetryTransientOptions<T> {
  readonly isTransient: (result: T) => boolean;
  readonly maxRetries?: number;
  readonly clock?: Clock;
  readonly baseDelayMs?: number;
}

/**
 * Calls `attempt()` up to `1 + maxRetries` times, waiting an exponentially
 * increasing delay between attempts, and returns the FIRST non-transient
 * result (as judged by `isTransient`) or, having exhausted every retry, the
 * LAST transient result — never throws on exhaustion, because "still
 * transient after retrying" is itself a legitimate, terminal outcome the
 * caller (an adapter, ultimately orchestration) must be able to observe and
 * map onto `PROVIDER_TRANSIENT`.
 */
export async function retryTransient<T>(
  attempt: () => Promise<T>,
  options: RetryTransientOptions<T>,
): Promise<T> {
  const maxRetries = options.maxRetries ?? MAX_TRANSIENT_RETRIES;
  const clock = options.clock ?? realClock;
  const baseDelayMs = options.baseDelayMs ?? TRANSIENT_RETRY_BASE_DELAY_MS;

  let lastResult: T = await attempt();
  let retries = 0;
  while (options.isTransient(lastResult) && retries < maxRetries) {
    await clock.sleep(baseDelayMs * 2 ** retries);
    retries += 1;
    lastResult = await attempt();
  }
  return lastResult;
}

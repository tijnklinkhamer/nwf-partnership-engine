/**
 * AN INJECTABLE MONOTONIC CLOCK/SLEEPER, so per-host pacing (ADR: "pacing")
 * is testable without a real wall-clock wait.
 *
 * Production uses real timers. Tests inject `createFakeClock()`, which
 * advances only when explicitly told to and resolves every pending sleep
 * whose deadline that advance reached - no `setTimeout` in the test process,
 * no flaky real-time sleep in CI.
 *
 * This is NOT part of `src/orgunits/signals/`: the signal-scoring core stays
 * pure and clock-free (phase2b.firewall.test.ts pins that separately). The
 * orchestrator is allowed a real clock; it is simply never allowed to let
 * that clock leak into a deterministic score.
 */

export interface Clock {
  /** Monotonic milliseconds. Not wall-clock time; only differences are meaningful. */
  now(): number;
  /** Resolves after at least `ms` milliseconds on this clock. */
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms))),
};

interface PendingSleep {
  readonly deadline: number;
  readonly resolve: () => void;
}

export interface FakeClock extends Clock {
  /** Advances the clock by `ms` and resolves every sleep whose deadline that reaches. */
  advance(ms: number): void;
  readonly pendingCount: number;
}

/** A clock a test fully controls. Never used in production. */
export function createFakeClock(startMs = 0): FakeClock {
  let current = startMs;
  const pending: PendingSleep[] = [];

  return {
    now: () => current,
    sleep(ms: number): Promise<void> {
      const deadline = current + Math.max(0, ms);
      if (deadline <= current) return Promise.resolve();
      return new Promise((resolve) => {
        pending.push({ deadline, resolve });
      });
    },
    advance(ms: number): void {
      current += Math.max(0, ms);
      // Resolve in deadline order so two sleeps armed at different times settle
      // in the order a real clock would have woken them.
      const ready = pending
        .filter((p) => p.deadline <= current)
        .sort((a, b) => a.deadline - b.deadline);
      for (const entry of ready) {
        const index = pending.indexOf(entry);
        if (index !== -1) pending.splice(index, 1);
        entry.resolve();
      }
    },
    get pendingCount(): number {
      return pending.length;
    },
  };
}

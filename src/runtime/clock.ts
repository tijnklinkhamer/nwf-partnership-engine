/**
 * WW E-M - THE MAC RUNTIME'S CLOCK.
 *
 * Wall-clock milliseconds (the runtime reports instants to the OWNER, so it
 * needs real time, not a monotonic counter) and an ABORTABLE sleep: the
 * supervisor waits a long time while a campaign is paused, and a `resume` or
 * a shutdown must wake it at once rather than after the wait.
 *
 * Production uses `realRuntimeClock`. Tests inject a fake that advances only
 * when told to, so no supervisor test sleeps in real time.
 */

export interface RuntimeClock {
  /** Wall-clock epoch milliseconds. */
  now(): number;
  /** Resolves after `ms`, or as soon as `signal` aborts - whichever is first. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const realRuntimeClock: RuntimeClock = {
  now: () => Date.now(),
  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, Math.max(0, ms));
      signal?.addEventListener('abort', done, { once: true });
    });
  },
};

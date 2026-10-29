/**
 * THE 2D2B-2 TIER 1 HARD LIVENESS BOUNDARY, driven with FAKE query objects
 * under vitest fake timers. `runQueryWithLivenessBoundary` is exercised
 * exactly as the production runner calls it — a stream-shaped object with
 * a synchronous `close()`, an owned abort controller, a diagnostics
 * collector — without constructing the production runner or importing the
 * SDK into this file (`phase2b.firewall.test.ts`).
 *
 * Every path asserts `vi.getTimerCount() === 0` once the boundary settles:
 * a leaked deadline or grace timer would hold a batch process open after a
 * perfectly good result.
 *
 * Zero SDK construction, zero network, zero subprocess.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_SDK_PROGRESS_STAGES,
  AGENT_SDK_PROGRESS_TRACE_MAX_ENTRIES,
  AGENT_SDK_STDERR_TAIL_MAX_CHARS,
  AgentSdkTimeoutError,
  CLASSIFIER_CALL_HARD_KILL_GRACE_MS,
  CLASSIFIER_CALL_SOFT_DEADLINE_MS,
  CLASSIFIER_CALL_TOTAL_BUDGET_MS,
  createAgentSdkDiagnosticsCollector,
  freezeAgentSdkDiagnostics,
  resolveAgentSdkAttemptDeadline,
  runQueryWithLivenessBoundary,
  type AgentSdkDiagnostics,
  type AgentSdkProgressStage,
  type LivenessBoundedQuery,
} from '../../orgunits/classify/provider/agentSdkRunner.js';

type Message = { type: string } & Record<string, unknown>;

function resultMessage(overrides: Record<string, unknown> = {}): Message {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'done',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
    modelUsage: { 'model-a': { outputTokens: 5 } },
    structured_output: { results: [] },
    ...overrides,
  };
}

/**
 * A query whose stream the test drives by hand. `next()` parks until the
 * test pushes, ends or fails it; `close()` behaves as configured, modelling
 * the three things a real close can do to a pending pull: end it (the
 * pinned SDK's documented behaviour), reject it, or — a wedged runtime —
 * nothing at all.
 */
class ControlledQuery implements LivenessBoundedQuery {
  nextCalls = 0;
  returnCalls = 0;
  closeCalls = 0;
  readonly #queued: Message[] = [];
  #pending: {
    resolve: (step: IteratorResult<Message>) => void;
    reject: (e: unknown) => void;
  } | null = null;
  readonly #onClose: 'end' | 'reject' | 'nothing';

  constructor(onClose: 'end' | 'reject' | 'nothing' = 'nothing') {
    this.#onClose = onClose;
  }

  [Symbol.asyncIterator](): AsyncIterator<Message> {
    return {
      next: () => {
        this.nextCalls += 1;
        const queued = this.#queued.shift();
        if (queued !== undefined) return Promise.resolve({ done: false, value: queued });
        return new Promise((resolve, reject) => {
          this.#pending = { resolve, reject };
        });
      },
      return: () => {
        this.returnCalls += 1;
        return Promise.resolve({ done: true, value: undefined });
      },
    };
  }

  push(message: Message): void {
    const pending = this.#pending;
    this.#pending = null;
    if (pending !== null) pending.resolve({ done: false, value: message });
    else this.#queued.push(message);
  }

  end(): void {
    const pending = this.#pending;
    this.#pending = null;
    pending?.resolve({ done: true, value: undefined });
  }

  fail(error: unknown): void {
    const pending = this.#pending;
    this.#pending = null;
    pending?.reject(error);
  }

  close(): void {
    this.closeCalls += 1;
    if (this.#onClose === 'end') this.end();
    if (this.#onClose === 'reject') this.fail(new Error('closed: pending pull rejected'));
  }
}

/** A real AbortController, plus a count of abort() calls. */
function observedAbortController(): { controller: AbortController; aborts: () => number } {
  const controller = new AbortController();
  let count = 0;
  const original = controller.abort.bind(controller);
  controller.abort = (reason?: unknown) => {
    count += 1;
    original(reason);
  };
  return { controller, aborts: () => count };
}

/** Settles a promise into a value the test can inspect without an unhandled rejection. */
function capture<T>(promise: Promise<T>): {
  readonly state: () => 'pending' | 'fulfilled' | 'rejected';
  readonly value: () => T | undefined;
  readonly error: () => unknown;
} {
  let state: 'pending' | 'fulfilled' | 'rejected' = 'pending';
  let value: T | undefined;
  let error: unknown;
  promise.then(
    (v) => {
      state = 'fulfilled';
      value = v;
    },
    (e: unknown) => {
      state = 'rejected';
      error = e;
    },
  );
  return { state: () => state, value: () => value, error: () => error };
}

function stages(diagnostics: AgentSdkDiagnostics): AgentSdkProgressStage[] {
  return diagnostics.progress.map((entry) => entry.stage);
}

const DEADLINE = 1_000;
const GRACE = 400;

let savedVerbose: string | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  savedVerbose = process.env.NWF_PE_VERBOSE;
  delete process.env.NWF_PE_VERBOSE;
});
afterEach(() => {
  vi.useRealTimers();
  if (savedVerbose !== undefined) process.env.NWF_PE_VERBOSE = savedVerbose;
});

function boundary(activeQuery: LivenessBoundedQuery, deadlineMs = DEADLINE) {
  const abort = observedAbortController();
  const diagnostics = createAgentSdkDiagnosticsCollector(() => Date.now());
  const run = capture(
    runQueryWithLivenessBoundary(activeQuery, {
      deadlineMs,
      graceMs: GRACE,
      abortController: abort.controller,
      diagnostics,
    }),
  );
  return { run, abort };
}

describe('frozen liveness policy', () => {
  it('exports the exact frozen production constants', () => {
    expect(CLASSIFIER_CALL_SOFT_DEADLINE_MS).toBe(300_000);
    expect(CLASSIFIER_CALL_HARD_KILL_GRACE_MS).toBe(10_000);
    expect(CLASSIFIER_CALL_TOTAL_BUDGET_MS).toBe(600_000);
    expect(AGENT_SDK_STDERR_TAIL_MAX_CHARS).toBe(2_048);
    expect(AGENT_SDK_PROGRESS_TRACE_MAX_ENTRIES).toBe(32);
  });

  it('the production attempt deadline defaults to the soft deadline and honours a smaller override, never a larger one', () => {
    expect(resolveAgentSdkAttemptDeadline()).toBe(300_000);
    expect(resolveAgentSdkAttemptDeadline({})).toBe(300_000);
    expect(resolveAgentSdkAttemptDeadline({ deadlineMs: 149_500 })).toBe(149_500);
    expect(resolveAgentSdkAttemptDeadline({ deadlineMs: 900_000 })).toBe(300_000);
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resolveAgentSdkAttemptDeadline({ deadlineMs: invalid })).toThrow(TypeError);
    }
  });
});

describe('runQueryWithLivenessBoundary - the deadline path', () => {
  it('a never-yielding stream reaches TIMEOUT: abort, then close, then a BOUNDED grace, then AgentSdkTimeoutError', async () => {
    const q = new ControlledQuery('nothing');
    const { run, abort } = boundary(q);

    await vi.advanceTimersByTimeAsync(DEADLINE - 1);
    expect(run.state()).toBe('pending');
    expect(abort.aborts()).toBe(0);
    expect(q.closeCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    // The decision is taken at the deadline: abort and close happen now.
    expect(abort.aborts()).toBe(1);
    expect(abort.controller.signal.aborted).toBe(true);
    expect(q.closeCalls).toBe(1);
    // ...but the helper still waits, boundedly, for the stream to settle.
    expect(run.state()).toBe('pending');

    await vi.advanceTimersByTimeAsync(GRACE - 1);
    expect(run.state()).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(run.state()).toBe('rejected');

    const error = run.error();
    expect(error).toBeInstanceOf(AgentSdkTimeoutError);
    const timeout = error as AgentSdkTimeoutError;
    expect(timeout.deadlineMs).toBe(DEADLINE);
    expect(timeout.message).toMatch(/timed out/);
    expect(stages(timeout.diagnostics)).toEqual([
      'QUERY_STARTED',
      'DEADLINE_EXPIRED',
      'ABORT_SIGNALLED',
      'CLOSE_CALLED',
      'GRACE_EXPIRED',
    ]);
    expect(timeout.diagnostics.progress.map((e) => e.elapsedMs)).toEqual([
      0,
      DEADLINE,
      DEADLINE,
      DEADLINE,
      DEADLINE + GRACE,
    ]);
    // Never interrupt(): the fake has none, and the boundary never needed one.
    expect(q.returnCalls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a close that ends the pending pull settles within grace and throws TIMEOUT at once, without waiting out the grace', async () => {
    const q = new ControlledQuery('end');
    const { run } = boundary(q);

    await vi.advanceTimersByTimeAsync(DEADLINE);
    expect(run.state()).toBe('rejected');
    const timeout = run.error() as AgentSdkTimeoutError;
    expect(timeout).toBeInstanceOf(AgentSdkTimeoutError);
    expect(stages(timeout.diagnostics)).toEqual([
      'QUERY_STARTED',
      'DEADLINE_EXPIRED',
      'ABORT_SIGNALLED',
      'CLOSE_CALLED',
      'STREAM_ENDED_WITHOUT_RESULT',
      'SETTLED_WITHIN_GRACE',
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a LATE SUCCESS after the deadline can never replace the TIMEOUT decision', async () => {
    const q = new ControlledQuery('nothing');
    const { run } = boundary(q);

    await vi.advanceTimersByTimeAsync(DEADLINE);
    q.push(resultMessage()); // a perfectly good result, one tick too late
    await vi.advanceTimersByTimeAsync(0);

    expect(run.state()).toBe('rejected');
    const timeout = run.error() as AgentSdkTimeoutError;
    expect(timeout).toBeInstanceOf(AgentSdkTimeoutError);
    expect(stages(timeout.diagnostics)).toContain('RESULT_RECEIVED');
    expect(stages(timeout.diagnostics).at(-1)).toBe('SETTLED_WITHIN_GRACE');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a LATE REJECTION - during grace, or after TIMEOUT was already thrown - is observed, never unhandled, and never replaces TIMEOUT', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      // (a) close() itself makes the pending pull reject, inside the grace.
      const rejecting = new ControlledQuery('reject');
      const a = boundary(rejecting);
      await vi.advanceTimersByTimeAsync(DEADLINE);
      expect(a.run.state()).toBe('rejected');
      expect(a.run.error()).toBeInstanceOf(AgentSdkTimeoutError);
      expect(stages((a.run.error() as AgentSdkTimeoutError).diagnostics)).toContain(
        'STREAM_FAILED',
      );

      // (b) the stream rejects only AFTER the grace expired and TIMEOUT was thrown.
      const wedged = new ControlledQuery('nothing');
      const b = boundary(wedged);
      await vi.advanceTimersByTimeAsync(DEADLINE + GRACE);
      expect(b.run.error()).toBeInstanceOf(AgentSdkTimeoutError);
      wedged.fail(new Error('a rejection from a runtime that finally woke up'));

      // Let Node's unhandled-rejection detection run on real macrotasks.
      vi.useRealTimers();
      await new Promise((resolveTick) => setTimeout(resolveTick, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('an abort() or close() that THROWS cannot overturn the decision', async () => {
    const q = new ControlledQuery('nothing');
    q.close = () => {
      q.closeCalls += 1;
      throw new Error('close exploded');
    };
    const diagnostics = createAgentSdkDiagnosticsCollector(() => Date.now());
    const run = capture(
      runQueryWithLivenessBoundary(q, {
        deadlineMs: DEADLINE,
        graceMs: GRACE,
        abortController: {
          abort() {
            throw new Error('abort listener exploded');
          },
        },
        diagnostics,
      }),
    );
    await vi.advanceTimersByTimeAsync(DEADLINE + GRACE);
    expect(run.error()).toBeInstanceOf(AgentSdkTimeoutError);
    expect(q.closeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honours a deadline override: a smaller deadline fires at exactly that time', async () => {
    const q = new ControlledQuery('end');
    const { run } = boundary(q, 50);
    await vi.advanceTimersByTimeAsync(49);
    expect(run.state()).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(run.state()).toBe('rejected');
    const timeout = run.error() as AgentSdkTimeoutError;
    expect(timeout.deadlineMs).toBe(50);
    expect(
      timeout.diagnostics.progress.find((e) => e.stage === 'DEADLINE_EXPIRED')!.elapsedMs,
    ).toBe(50);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refuses a non-positive or non-finite deadline or grace before doing anything', async () => {
    for (const [deadlineMs, graceMs] of [
      [0, GRACE],
      [-5, GRACE],
      [Number.NaN, GRACE],
      [DEADLINE, 0],
    ] as const) {
      const q = new ControlledQuery();
      await expect(
        runQueryWithLivenessBoundary(q, {
          deadlineMs,
          graceMs,
          abortController: new AbortController(),
          diagnostics: createAgentSdkDiagnosticsCollector(),
        }),
      ).rejects.toThrow(TypeError);
      expect(q.nextCalls).toBe(0);
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('runQueryWithLivenessBoundary - the ordinary paths are unchanged', () => {
  it('success before the deadline returns the real normalized result, never aborts or closes, and still reaches the iterator return()', async () => {
    const q = new ControlledQuery();
    const { run, abort } = boundary(q);

    q.push({ type: 'system', subtype: 'init' });
    q.push({ type: 'assistant' });
    q.push(
      resultMessage({
        modelUsage: { 'model-a': { outputTokens: 5 }, 'model-b': { outputTokens: 50 } },
        usage: { input_tokens: 900, output_tokens: 180 },
        structured_output: { results: [{ doc_index: 0 }] },
      }),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(run.state()).toBe('fulfilled');
    const result = run.value()!;
    expect(result.structuredOutput).toEqual({ results: [{ doc_index: 0 }] });
    expect(result.responseModelId).toBe('model-b');
    expect(result.inputTokens).toBe(900);
    expect(result.outputTokens).toBe(180);
    // Terminal means terminal: three pulls, then IteratorClose via return().
    expect(q.nextCalls).toBe(3);
    expect(q.returnCalls).toBe(1);
    // A success never triggers the kill path.
    expect(abort.aborts()).toBe(0);
    expect(abort.controller.signal.aborted).toBe(false);
    expect(q.closeCalls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('IteratorClose still finalizes a real async generator after the terminal result, and the post-terminal pull never happens', async () => {
    let reachedPostTerminalCode = false;
    let finalized = false;
    async function* generator() {
      try {
        yield { type: 'system', subtype: 'init' };
        yield resultMessage();
        reachedPostTerminalCode = true;
        throw new Error('post-terminal pull');
      } finally {
        finalized = true;
      }
    }
    const stream = generator();
    const q: LivenessBoundedQuery = {
      [Symbol.asyncIterator]: () => stream,
      close: () => {
        throw new Error('close must not be called on success');
      },
    };
    const { run } = boundary(q);
    await vi.advanceTimersByTimeAsync(0);
    expect(run.state()).toBe('fulfilled');
    expect(reachedPostTerminalCode).toBe(false);
    expect(finalized).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an ordinary stream failure before the deadline rethrows the ORIGINAL error - never relabelled a timeout', async () => {
    const q = new ControlledQuery();
    const { run, abort } = boundary(q);
    const original = new Error('read ECONNRESET');
    q.push({ type: 'system', subtype: 'init' });
    await vi.advanceTimersByTimeAsync(10);
    q.fail(original);
    await vi.advanceTimersByTimeAsync(0);

    expect(run.state()).toBe('rejected');
    expect(run.error()).toBe(original);
    expect(run.error()).not.toBeInstanceOf(AgentSdkTimeoutError);
    expect(abort.aborts()).toBe(0);
    expect(q.closeCalls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a stream that ends without a result before the deadline keeps its own explanatory error', async () => {
    const q = new ControlledQuery();
    const { run } = boundary(q);
    q.push({ type: 'system', subtype: 'init' });
    await vi.advanceTimersByTimeAsync(0);
    q.end();
    await vi.advanceTimersByTimeAsync(0);
    expect(run.state()).toBe('rejected');
    expect((run.error() as Error).message).toMatch(/ended without a result message/);
    expect(run.error()).not.toBeInstanceOf(AgentSdkTimeoutError);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('timeout diagnostics - bounded, closed, immutable, verbose-independent', () => {
  it('stderr keeps only its FINAL 2,048 characters, however it arrives', () => {
    const collector = createAgentSdkDiagnosticsCollector();
    collector.appendStderr('HEAD-MARKER\n');
    for (let i = 0; i < 100; i += 1) collector.appendStderr(`line ${i} ${'x'.repeat(40)}\n`);
    collector.appendStderr('TAIL-MARKER');
    const tail = collector.snapshot().stderrTail;
    expect(tail.length).toBe(AGENT_SDK_STDERR_TAIL_MAX_CHARS);
    expect(tail.endsWith('TAIL-MARKER')).toBe(true);
    expect(tail).not.toContain('HEAD-MARKER');

    // One chunk larger than the cap on its own.
    const big = createAgentSdkDiagnosticsCollector();
    big.appendStderr(`${'a'.repeat(5_000)}END`);
    expect(big.snapshot().stderrTail.length).toBe(AGENT_SDK_STDERR_TAIL_MAX_CHARS);
    expect(big.snapshot().stderrTail.endsWith('aEND')).toBe(true);

    // Short stderr is kept whole.
    const small = createAgentSdkDiagnosticsCollector();
    small.appendStderr('only this');
    expect(small.snapshot().stderrTail).toBe('only this');
  });

  it('the stderr tail never begins with half of a surrogate pair', () => {
    const collector = createAgentSdkDiagnosticsCollector();
    // 1,024 astral characters = 2,048 UTF-16 units, preceded by one ASCII
    // unit, so a naive slice would start on a low surrogate.
    collector.appendStderr(`!${'😀'.repeat(1_024)}z`);
    const tail = collector.snapshot().stderrTail;
    const first = tail.charCodeAt(0);
    expect(first >= 0xdc00 && first <= 0xdfff).toBe(false);
    expect(tail.length).toBeLessThanOrEqual(AGENT_SDK_STDERR_TAIL_MAX_CHARS);
    expect(tail.endsWith('z')).toBe(true);
  });

  it('progress stages are a CLOSED ten-value set; each records at most once; unknown stages are dropped; the trace is bounded', () => {
    expect(AGENT_SDK_PROGRESS_STAGES).toHaveLength(10);
    expect(new Set(AGENT_SDK_PROGRESS_STAGES).size).toBe(10);

    const collector = createAgentSdkDiagnosticsCollector();
    for (let round = 0; round < 50; round += 1) {
      for (const stage of AGENT_SDK_PROGRESS_STAGES) collector.record(stage);
      collector.record('SOMETHING_ARBITRARY' as AgentSdkProgressStage);
    }
    const snapshot = collector.snapshot();
    expect(snapshot.progress.length).toBe(10);
    expect(snapshot.progress.length).toBeLessThanOrEqual(AGENT_SDK_PROGRESS_TRACE_MAX_ENTRIES);
    for (const entry of snapshot.progress) {
      expect(AGENT_SDK_PROGRESS_STAGES).toContain(entry.stage);
      expect(typeof entry.elapsedMs).toBe('number');
    }

    // The freezer itself caps any input at 32 entries and drops unknown stages.
    const oversized = freezeAgentSdkDiagnostics({
      progress: [
        ...Array.from({ length: 100 }, () => ({
          stage: 'QUERY_STARTED' as const,
          elapsedMs: 1,
        })),
        { stage: 'NOT_A_STAGE' as AgentSdkProgressStage, elapsedMs: 2 },
      ],
      stderrTail: 'x'.repeat(10_000),
      pid: null,
    });
    expect(oversized.progress.length).toBe(AGENT_SDK_PROGRESS_TRACE_MAX_ENTRIES);
    expect(oversized.stderrTail.length).toBe(AGENT_SDK_STDERR_TAIL_MAX_CHARS);
  });

  it('FIRST_STREAM_ACTIVITY is recorded at most once, however many messages arrive', async () => {
    const q = new ControlledQuery('end');
    const { run } = boundary(q);
    for (let i = 0; i < 25; i += 1) q.push({ type: 'assistant' });
    await vi.advanceTimersByTimeAsync(DEADLINE);
    const timeout = run.error() as AgentSdkTimeoutError;
    expect(stages(timeout.diagnostics).filter((s) => s === 'FIRST_STREAM_ACTIVITY')).toHaveLength(
      1,
    );
    // No per-message event exists: 25 messages, still a handful of entries.
    expect(timeout.diagnostics.progress.length).toBeLessThanOrEqual(10);
  });

  it('the diagnostics shape is exactly { progress, stderrTail, pid, livenessWitness } and each entry exactly { stage, elapsedMs }, with pid null', async () => {
    const q = new ControlledQuery('end');
    const { run } = boundary(q);
    q.push({ type: 'system', subtype: 'init', cwd: '/secret/cwd', session_id: 'sess' });
    await vi.advanceTimersByTimeAsync(DEADLINE);
    const { diagnostics } = run.error() as AgentSdkTimeoutError;
    // 2D2C-F0Z widened this pin by exactly one key, deliberately and by
    // name. The witness is the field Recovery-1 lacked; the pin stays an
    // EXACT key set so a future addition is a reviewed edit, never a drift.
    expect(Object.keys(diagnostics).sort()).toEqual([
      'livenessWitness',
      'pid',
      'progress',
      'stderrTail',
    ]);
    for (const entry of diagnostics.progress) {
      expect(Object.keys(entry).sort()).toEqual(['elapsedMs', 'stage']);
    }
    expect(diagnostics.pid).toBeNull();
    // Message content never reaches the trace - witness included.
    expect(JSON.stringify(diagnostics)).not.toContain('/secret/cwd');
    expect(JSON.stringify(diagnostics)).not.toContain('sess');
  });

  it('the 2D2C-F0Z liveness witness is a closed key set carrying no content', async () => {
    const q = new ControlledQuery('end');
    const { run } = boundary(q);
    q.push({ type: 'system', subtype: 'init', cwd: '/secret/cwd', session_id: 'sess' });
    await vi.advanceTimersByTimeAsync(DEADLINE);
    const { diagnostics } = run.error() as AgentSdkTimeoutError;
    const witness = diagnostics.livenessWitness;
    expect(witness).not.toBeNull();
    expect(Object.keys(witness!).sort()).toEqual([
      'deadlineArmedAtMonotonicMs',
      'deadlineArmedAtUtc',
      'deadlineFiredAtMonotonicMs',
      'deadlineFiredAtUtc',
      'deadlineNominalMs',
      'deadlineOvershootMs',
      'heartbeat',
    ]);
    expect(Object.keys(witness!.heartbeat!).sort()).toEqual([
      'expectedBeats',
      'maxGapMonotonicMs',
      'maxGapWallMs',
      'nominalIntervalMs',
      'observedBeats',
    ]);
    expect(witness!.deadlineNominalMs).toBe(DEADLINE);
    expect(witness!.deadlineFiredAtUtc).not.toBeNull();
    // The whole witness, and its heartbeat, are frozen like everything else.
    expect(Object.isFrozen(witness)).toBe(true);
    expect(Object.isFrozen(witness!.heartbeat)).toBe(true);
  });

  it('records ZERO deadline overshoot when the timer callback runs on time', async () => {
    const q = new ControlledQuery('end');
    const { run } = boundary(q);
    await vi.advanceTimersByTimeAsync(DEADLINE);
    const { diagnostics } = run.error() as AgentSdkTimeoutError;
    // Fake timers fire exactly on schedule, so this is the control case: a
    // healthy loop reads 0. Any non-zero value in a real run is the signal.
    expect(diagnostics.livenessWitness?.deadlineOvershootMs).toBe(0);
  });

  it('diagnostics are DEEPLY immutable: object, trace array, every entry, and the error property itself', async () => {
    const q = new ControlledQuery('end');
    const { run } = boundary(q);
    await vi.advanceTimersByTimeAsync(DEADLINE);
    const error = run.error() as AgentSdkTimeoutError;
    const { diagnostics } = error;

    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.progress)).toBe(true);
    for (const entry of diagnostics.progress) expect(Object.isFrozen(entry)).toBe(true);

    // ES modules are strict: every mutation attempt throws.
    const mutable = diagnostics as unknown as Record<string, unknown>;
    expect(() => {
      mutable.stderrTail = 'rewritten';
    }).toThrow(TypeError);
    expect(() => {
      (diagnostics.progress as AgentSdkDiagnostics['progress'][number][]).push({
        stage: 'QUERY_STARTED',
        elapsedMs: 0,
      });
    }).toThrow(TypeError);
    expect(() => {
      (diagnostics.progress[0] as unknown as Record<string, unknown>).elapsedMs = 99;
    }).toThrow(TypeError);
    expect(() => {
      (error as unknown as Record<string, unknown>).diagnostics = { forged: true };
    }).toThrow(TypeError);
    expect(error.diagnostics).toBe(diagnostics);
  });

  it('a constructed AgentSdkTimeoutError also bounds and freezes whatever it is handed', () => {
    const mutableInput = {
      progress: [{ stage: 'DEADLINE_EXPIRED' as const, elapsedMs: 300_000 }],
      stderrTail: 'y'.repeat(3_000),
      pid: null,
    };
    const error = new AgentSdkTimeoutError(300_000, mutableInput);
    mutableInput.progress.push({ stage: 'DEADLINE_EXPIRED', elapsedMs: 1 });
    expect(error.diagnostics.progress).toHaveLength(1);
    expect(error.diagnostics.stderrTail.length).toBe(AGENT_SDK_STDERR_TAIL_MAX_CHARS);
    expect(Object.isFrozen(error.diagnostics)).toBe(true);
    expect(error.name).toBe('AgentSdkTimeoutError');
  });

  it('diagnostics are collected and attached with NWF_PE_VERBOSE ABSENT', async () => {
    expect(process.env.NWF_PE_VERBOSE).toBeUndefined();
    const q = new ControlledQuery('nothing');
    const abort = observedAbortController();
    const diagnostics = createAgentSdkDiagnosticsCollector(() => Date.now());
    diagnostics.appendStderr('stderr written before the stall');
    const run = capture(
      runQueryWithLivenessBoundary(q, {
        deadlineMs: DEADLINE,
        graceMs: GRACE,
        abortController: abort.controller,
        diagnostics,
      }),
    );
    await vi.advanceTimersByTimeAsync(DEADLINE + GRACE);
    const timeout = run.error() as AgentSdkTimeoutError;
    expect(timeout.diagnostics.progress.length).toBeGreaterThan(0);
    expect(timeout.diagnostics.stderrTail).toBe('stderr written before the stall');
  });
});

/**
 * 2D2C-F0Z — THE LIVENESS WITNESS UNDER A DELAYED TIMER CALLBACK.
 *
 * Recovery-1's PAIR_4_V4 recorded `DEADLINE_EXPIRED` at 1,080,400 ms on a
 * 300,000 ms deadline and left no field saying so. These tests drive the
 * boundary with a witness clock that JUMPS — the shape a stalled event loop
 * or a suspended process presents to an observer inside it — and prove the
 * overshoot and the missed heartbeats are both recorded.
 *
 * The clock is a WITNESS seam only: it feeds no deadline, abort, close or
 * grace decision, so a jumping clock cannot change control flow. That is
 * asserted here too.
 */
describe('2D2C-F0Z liveness witness: delayed timer callbacks are recorded, never acted on', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A monotonic clock that adds `jumpMs` from the moment `release()` is called. */
  function jumpingClock(jumpMs: number) {
    let jumped = false;
    return {
      release: () => {
        jumped = true;
      },
      clock: {
        monotonicMs: () => Date.now() + (jumped ? jumpMs : 0),
        nowUtc: () => new Date(Date.now() + (jumped ? jumpMs : 0)),
      },
    };
  }

  it('records the overshoot when the deadline callback runs far later than nominal', async () => {
    const STALL = 780_400; // the exact PAIR_4_V4 shortfall
    const { clock, release } = jumpingClock(STALL);
    const q = new ControlledQuery('end');
    const abort = observedAbortController();
    const diagnostics = createAgentSdkDiagnosticsCollector(() => Date.now());
    const run = capture(
      runQueryWithLivenessBoundary(q, {
        deadlineMs: DEADLINE,
        graceMs: GRACE,
        abortController: abort.controller,
        diagnostics,
        witnessClock: clock,
      }),
    );
    release();
    await vi.advanceTimersByTimeAsync(DEADLINE + GRACE);

    const { diagnostics: snapshot } = run.error() as AgentSdkTimeoutError;
    const witness = snapshot.livenessWitness!;
    expect(witness.deadlineNominalMs).toBe(DEADLINE);
    expect(witness.deadlineOvershootMs).toBe(STALL);
    expect(witness.deadlineFiredAtUtc).not.toBeNull();
    // The decision itself is unchanged: still exactly one abort, one close.
    expect(abort.aborts()).toBe(1);
    expect(q.closeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('records a heartbeat shortfall: beats DUE far exceed beats OBSERVED', async () => {
    const STALL = 60_000;
    const { clock, release } = jumpingClock(STALL);
    const q = new ControlledQuery('end');
    const abort = observedAbortController();
    const diagnostics = createAgentSdkDiagnosticsCollector(() => Date.now());
    const run = capture(
      runQueryWithLivenessBoundary(q, {
        deadlineMs: DEADLINE,
        graceMs: GRACE,
        abortController: abort.controller,
        diagnostics,
        witnessClock: clock,
        heartbeatIntervalMs: 1_000,
      }),
    );
    release();
    await vi.advanceTimersByTimeAsync(DEADLINE + GRACE);

    const heartbeat = (run.error() as AgentSdkTimeoutError).diagnostics.livenessWitness!.heartbeat!;
    expect(heartbeat.nominalIntervalMs).toBe(1_000);
    // The witness clock says (DEADLINE + STALL) elapsed; the loop only ever
    // ran DEADLINE/1000 beats. The shortfall IS the evidence.
    expect(heartbeat.expectedBeats).toBeGreaterThan(heartbeat.observedBeats);
    expect(heartbeat.expectedBeats - heartbeat.observedBeats).toBeGreaterThanOrEqual(
      STALL / 1_000 - 1,
    );
    // Wall and monotonic agree, as the F0Z experiment measured. The witness
    // records both so a reader can SEE that, rather than assume a divergence
    // this runtime does not produce.
    expect(Math.abs(heartbeat.maxGapWallMs - heartbeat.maxGapMonotonicMs)).toBeLessThanOrEqual(1);
  });

  it('a jumping witness clock changes NO control decision: a result before the deadline still wins', async () => {
    const { clock, release } = jumpingClock(999_999);
    const q = new ControlledQuery('end');
    const abort = observedAbortController();
    const diagnostics = createAgentSdkDiagnosticsCollector(() => Date.now());
    const run = capture(
      runQueryWithLivenessBoundary(q, {
        deadlineMs: DEADLINE,
        graceMs: GRACE,
        abortController: abort.controller,
        diagnostics,
        witnessClock: clock,
      }),
    );
    release();
    q.push(resultMessage());
    await vi.advanceTimersByTimeAsync(0);

    // The witness clock is far past the deadline, yet the RESULT still wins:
    // the deadline is a real timer, never a clock comparison.
    expect(run.state()).toBe('fulfilled');
    expect(run.value()).toMatchObject({ subtype: 'success' });
    expect(abort.aborts()).toBe(0);
    expect(q.closeCalls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

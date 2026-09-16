/**
 * THE AGENT SDK RUNNER SEAM — the ONLY production module in this repository
 * permitted to import `@anthropic-ai/claude-agent-sdk` (Phase 2B-2C
 * Max-runtime design §16 item 7; pinned by `phase2b.firewall.test.ts`).
 *
 * The seam is the smallest possible injectable boundary around the official
 * SDK entry point (`query()`): production code delegates to the SDK; every
 * automated test injects a fake `AgentSdkRunner` and NEVER constructs the
 * production runner, so CI stays deterministic and network-free with zero
 * OAuth tokens and zero Max usage. This mirrors the ScriptedTestProvider
 * discipline one layer down: no HTTP mocking of Anthropic endpoints
 * anywhere — the seam is the only test seam (design §24).
 *
 * WHAT A RUN RETURNS: the SDK emits a stream of messages ending in exactly
 * one result message per turn. The runner consumes the stream and returns a
 * NORMALIZED summary of that terminal result — subtype, structured output,
 * final/error text, token usage, reported model — and nothing else: no
 * transcript, no chain of thought, no session identifier, no config-dir
 * contents (design §41 equivalent: request metadata only). Transport-level
 * failures (spawn failure, connection reset, abort) THROW; the provider's
 * centralized outcome mapping interprets both shapes.
 *
 * TERMINAL MEANS TERMINAL (2B-2C3C hardening, from the 2026-09-01 2B-2C3B
 * smoke). The pinned SDK version's `query()` is documented to THROW on the
 * very next pull after yielding a `result` message that reports an error —
 * observed directly: `system/init` -> `assistant` -> `result` (`is_error:
 * true`, no `structured_output`) -> the next iterator pull threw
 * `API Error: 400 tools.0.custom.input_schema.type: Input should be
 * 'object'`. A naive `for await...of` loop that keeps iterating after
 * capturing the result message pulls that extra item anyway, so the SDK's
 * own throw replaces the terminal result this runner had ALREADY captured -
 * discarding real, actionable failure information. `consumeQueryStream`
 * below `break`s the instant it sees `type === 'result'`; `for await...of`'s
 * own `IteratorClose` semantics then call the stream's `return()` (never
 * `next()`) to unwind it, so the throw-on-next-pull path is structurally
 * never reached once a terminal result has arrived. Extracted as its own
 * function, independent of the real `query()` call, so a test can drive it
 * with a fake message stream without constructing the production runner
 * (`phase2b.firewall.test.ts` forbids any test from doing that).
 *
 * THE HARD LIVENESS BOUNDARY (2D2B-2, reconstructed on the 2D2B-R2 recovery
 * branch after the original was lost with its laptop). The 2D2B DEV run
 * observed five `classify()` calls that NEVER SETTLED; the mechanism is
 * unknown. A stream that never yields and never ends would hold the
 * provider — and every retry, completion row and scratch cleanup behind it —
 * forever, because the pinned SDK offers no per-query inference timeout.
 * `runQueryWithLivenessBoundary` below is that missing bound:
 *
 *   1. soft deadline (`CLASSIFIER_CALL_SOFT_DEADLINE_MS`, or the provider's
 *      smaller remaining total budget) — the ONLY duration an attempt may run;
 *   2. at the deadline the TIMEOUT decision is taken and is TERMINAL: the
 *      owned `AbortController` is aborted and the real query's synchronous
 *      `close()` is called (verified in the pinned bundle: close ends the CLI
 *      subprocess's stdin, then escalates SIGTERM -> SIGKILL within ~7 s);
 *   3. the helper waits at most `CLASSIFIER_CALL_HARD_KILL_GRACE_MS` for the
 *      stream to settle, then throws `AgentSdkTimeoutError` UNCONDITIONALLY —
 *      a late result, a late rejection or a close-triggered settlement can
 *      never overwrite the decision, and no late rejection goes unhandled.
 *
 * `Query.interrupt()` is deliberately NOT the boundary: it is a control
 * request the CLI must answer, and a wedged child cannot answer anything.
 * The abort controller, the stderr collector and the deadline are RUNTIME
 * controls owned by this seam alone — never part of `sdkOptions.ts`, the
 * provider-neutral request, or any input identity.
 *
 * Tier 1 bounds a live event loop. If the batch process itself wedges, only
 * something OUTSIDE it can intervene: that is the test-harness-only Tier 2
 * watchdog under `src/test/harness/`, which production never imports.
 *
 * `USAGE_LIMIT_ERROR_PREFIXES` is RE-EXPORTED here from the SDK itself —
 * the SDK's own list of "a usage limit was genuinely reached" message
 * prefixes — so the outcome-mapping module can recognise subscription
 * exhaustion against Anthropic's own vocabulary WITHOUT becoming a second
 * SDK import site. It is marked @alpha upstream; if a future SDK version
 * drops it, this re-export fails the build loudly rather than the mapping
 * silently drifting.
 */
import {
  query,
  USAGE_LIMIT_ERROR_PREFIXES,
  type Options,
  type SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { AgentSdkInvocation } from './sdkOptions.js';

export { USAGE_LIMIT_ERROR_PREFIXES };
export type { AgentSdkInvocation };

/** FROZEN: the maximum duration of ONE Agent SDK runner attempt. */
export const CLASSIFIER_CALL_SOFT_DEADLINE_MS = 300_000;

/** FROZEN: how long the inner query may take to settle after abort + close before TIMEOUT is thrown anyway. */
export const CLASSIFIER_CALL_HARD_KILL_GRACE_MS = 10_000;

/** FROZEN: the maximum cumulative provider-attempt window, retry backoff included (enforced by the provider). */
export const CLASSIFIER_CALL_TOTAL_BUDGET_MS = 600_000;

/** Timeout diagnostics retain only the LAST this-many characters of SDK subprocess stderr. */
export const AGENT_SDK_STDERR_TAIL_MAX_CHARS = 2_048;

/** Timeout diagnostics hold at most this many progress entries. */
export const AGENT_SDK_PROGRESS_TRACE_MAX_ENTRIES = 32;

/**
 * 2D2C-F0Z: the nominal period of the in-child liveness heartbeat armed
 * alongside the soft deadline. NOT a timeout and NOT a control: nothing is
 * aborted, retried or refused because of a missed beat. It exists so that a
 * future incident can be CLASSIFIED rather than guessed at.
 *
 * Why a heartbeat and not a clock comparison: the F0Z experiment measured,
 * on this runtime, that `performance.now()` advances through a process
 * suspension (a child SIGSTOPped for 2,000 ms saw wall and monotonic agree
 * to within 0.3 ms), and Recovery-1's own PAIR_4_V4 record corroborates it —
 * its `monotonicWallTimeMs` and its UTC delta are 4 ms apart over 18
 * minutes. **Wall-versus-monotonic drift therefore does NOT detect host
 * suspension here and is never presented as if it did.** A missed beat does:
 * the same suspended child produced 1 beat where ~5 were due, with an
 * inter-beat gap of 2,055 ms against a 100 ms nominal.
 */
export const AGENT_SDK_HEARTBEAT_INTERVAL_MS = 1_000;

/**
 * The CLOSED set of progress stages. Each is recorded at most once per
 * attempt and none is emitted per message, so a trace can say how far an
 * attempt got without ever carrying what it said.
 */
export const AGENT_SDK_PROGRESS_STAGES = [
  'QUERY_STARTED',
  'FIRST_STREAM_ACTIVITY',
  'RESULT_RECEIVED',
  'STREAM_ENDED_WITHOUT_RESULT',
  'STREAM_FAILED',
  'DEADLINE_EXPIRED',
  'ABORT_SIGNALLED',
  'CLOSE_CALLED',
  'SETTLED_WITHIN_GRACE',
  'GRACE_EXPIRED',
] as const;

export type AgentSdkProgressStage = (typeof AGENT_SDK_PROGRESS_STAGES)[number];

const PROGRESS_STAGE_SET: ReadonlySet<string> = new Set(AGENT_SDK_PROGRESS_STAGES);

/** One trace entry: a closed stage and a numeric offset from the attempt's start. Nothing else. */
export interface AgentSdkProgressEntry {
  readonly stage: AgentSdkProgressStage;
  readonly elapsedMs: number;
}

/**
 * 2D2C-F0Z: how many heartbeats were DUE versus how many were OBSERVED, and
 * the largest gap between consecutive observed beats. Pure measurement — it
 * states what the event loop did, never why.
 *
 * `maxGapWallMs` and `maxGapMonotonicMs` are recorded side by side precisely
 * so a reader can SEE that they agree under suspension rather than being
 * told to assume a difference that this runtime does not produce.
 */
export interface AgentSdkHeartbeatWitness {
  readonly nominalIntervalMs: number;
  readonly expectedBeats: number;
  readonly observedBeats: number;
  readonly maxGapWallMs: number;
  readonly maxGapMonotonicMs: number;
}

/**
 * 2D2C-F0Z: when the soft deadline was ARMED, when its callback actually
 * RAN, and the difference between the two minus the nominal duration.
 *
 * `deadlineOvershootMs` is the field Recovery-1 lacked. PAIR_4_V4 recorded
 * `DEADLINE_EXPIRED` at 1,080,400 ms on a 300,000 ms deadline; had this
 * field existed it would have read 780,400 and the event would have been
 * self-evident instead of reconstructed in prose.
 *
 * EVIDENCE, NOT CAUSE. A large overshoot proves the callback did not run on
 * time. It does NOT say whether the host suspended, the loop was starved, or
 * the process was descheduled, and nothing here claims otherwise.
 */
export interface AgentSdkLivenessWitness {
  readonly deadlineNominalMs: number;
  readonly deadlineArmedAtUtc: string;
  readonly deadlineArmedAtMonotonicMs: number;
  readonly deadlineFiredAtUtc: string | null;
  readonly deadlineFiredAtMonotonicMs: number | null;
  /** `fired − armed − nominal`, on the monotonic clock. Null when the deadline never fired. */
  readonly deadlineOvershootMs: number | null;
  readonly heartbeat: AgentSdkHeartbeatWitness | null;
}

/**
 * Bounded, deeply frozen timeout diagnostics. No prompt, document, model
 * response, request option, environment, credential, cwd or transcript
 * field exists here — by construction, not by filtering. Never persisted,
 * never placed in an outcome detail, never written to stdout.
 */
export interface AgentSdkDiagnostics {
  readonly progress: readonly AgentSdkProgressEntry[];
  readonly stderrTail: string;
  /**
   * Always null with the pinned SDK, which exposes no child PID on `Query`
   * or `Options`. Reserved for a future VERIFIED SDK surface; never obtained
   * by probing private fields, patching the SDK or enumerating processes.
   */
  readonly pid: number | null;
  /**
   * 2D2C-F0Z liveness witness. Null on any path that recorded none — an
   * older artifact, or a boundary that never armed its deadline.
   */
  readonly livenessWitness: AgentSdkLivenessWitness | null;
}

/** Accumulates one attempt's diagnostics while it runs; `snapshot()` freezes a bounded copy. */
export interface AgentSdkDiagnosticsCollector {
  record(stage: AgentSdkProgressStage): void;
  appendStderr(chunk: string): void;
  /** 2D2C-F0Z: records the one liveness witness for this attempt. Last write wins; never merged. */
  recordLivenessWitness(witness: AgentSdkLivenessWitness): void;
  snapshot(): AgentSdkDiagnostics;
}

/** The final `max` characters of `text`, never starting on an orphaned low surrogate. */
function tailOf(text: string, max: number): string {
  if (text.length <= max) return text;
  const tail = text.slice(text.length - max);
  const first = tail.charCodeAt(0);
  return first >= 0xdc00 && first <= 0xdfff ? tail.slice(1) : tail;
}

/**
 * Builds a bounded, deeply frozen diagnostics value: the object, the trace
 * array and every trace entry. Unknown stages are dropped, the trace is
 * capped, stderr keeps its tail, and `pid` is kept only if it is a positive
 * integer (the pinned SDK always yields null).
 */
/** A whole number of milliseconds, never negative, never NaN/Infinity. */
const boundedMs = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

/** Deeply freezes the 2D2C-F0Z witness, or returns null when none was recorded. */
function freezeLivenessWitness(
  witness: AgentSdkLivenessWitness | null | undefined,
): AgentSdkLivenessWitness | null {
  if (witness === null || witness === undefined) return null;
  const heartbeat = witness.heartbeat;
  return Object.freeze({
    deadlineNominalMs: boundedMs(witness.deadlineNominalMs),
    deadlineArmedAtUtc: String(witness.deadlineArmedAtUtc),
    deadlineArmedAtMonotonicMs: boundedMs(witness.deadlineArmedAtMonotonicMs),
    deadlineFiredAtUtc:
      witness.deadlineFiredAtUtc === null ? null : String(witness.deadlineFiredAtUtc),
    deadlineFiredAtMonotonicMs:
      witness.deadlineFiredAtMonotonicMs === null
        ? null
        : boundedMs(witness.deadlineFiredAtMonotonicMs),
    // Overshoot may legitimately be 0; it is never negative, because a timer
    // cannot fire early. It stays null when the deadline never fired.
    deadlineOvershootMs:
      witness.deadlineOvershootMs === null ? null : boundedMs(witness.deadlineOvershootMs),
    heartbeat:
      heartbeat === null || heartbeat === undefined
        ? null
        : Object.freeze({
            nominalIntervalMs: boundedMs(heartbeat.nominalIntervalMs),
            expectedBeats: boundedMs(heartbeat.expectedBeats),
            observedBeats: boundedMs(heartbeat.observedBeats),
            maxGapWallMs: boundedMs(heartbeat.maxGapWallMs),
            maxGapMonotonicMs: boundedMs(heartbeat.maxGapMonotonicMs),
          }),
  });
}

/**
 * What `freezeAgentSdkDiagnostics` accepts. `livenessWitness` is OPTIONAL so
 * that every pre-F0Z caller — and every test that builds a diagnostics value
 * by hand — stays valid unchanged; an absent witness freezes to null.
 */
export type AgentSdkDiagnosticsInput = Omit<AgentSdkDiagnostics, 'livenessWitness'> & {
  readonly livenessWitness?: AgentSdkLivenessWitness | null;
};

export function freezeAgentSdkDiagnostics(input: AgentSdkDiagnosticsInput): AgentSdkDiagnostics {
  const progress = input.progress
    .filter((entry) => PROGRESS_STAGE_SET.has(entry.stage))
    .slice(0, AGENT_SDK_PROGRESS_TRACE_MAX_ENTRIES)
    .map((entry) =>
      Object.freeze({
        stage: entry.stage,
        elapsedMs: boundedMs(entry.elapsedMs),
      }),
    );
  const pid =
    typeof input.pid === 'number' && Number.isSafeInteger(input.pid) && input.pid > 0
      ? input.pid
      : null;
  return Object.freeze({
    progress: Object.freeze(progress),
    stderrTail: tailOf(String(input.stderrTail), AGENT_SDK_STDERR_TAIL_MAX_CHARS),
    pid,
    livenessWitness: freezeLivenessWitness(input.livenessWitness),
  });
}

const monotonicNow = (): number => performance.now();

/**
 * A per-attempt collector. Collection is unconditional — it does not depend
 * on `NWF_PE_VERBOSE`; verbosity only gates optional emission further up.
 */
export function createAgentSdkDiagnosticsCollector(
  now: () => number = monotonicNow,
): AgentSdkDiagnosticsCollector {
  const startedAt = now();
  const progress: AgentSdkProgressEntry[] = [];
  const recorded = new Set<string>();
  let stderrTail = '';
  let livenessWitness: AgentSdkLivenessWitness | null = null;
  return {
    record(stage: AgentSdkProgressStage): void {
      if (!PROGRESS_STAGE_SET.has(stage) || recorded.has(stage)) return;
      if (progress.length >= AGENT_SDK_PROGRESS_TRACE_MAX_ENTRIES) return;
      recorded.add(stage);
      progress.push({ stage, elapsedMs: Math.max(0, Math.round(now() - startedAt)) });
    },
    appendStderr(chunk: string): void {
      if (typeof chunk !== 'string' || chunk.length === 0) return;
      // Never concatenate an unbounded chunk onto the tail first.
      const combined = chunk.length >= AGENT_SDK_STDERR_TAIL_MAX_CHARS ? chunk : stderrTail + chunk;
      stderrTail = tailOf(combined, AGENT_SDK_STDERR_TAIL_MAX_CHARS);
    },
    recordLivenessWitness(witness: AgentSdkLivenessWitness): void {
      livenessWitness = witness;
    },
    snapshot(): AgentSdkDiagnostics {
      return freezeAgentSdkDiagnostics({ progress, stderrTail, pid: null, livenessWitness });
    },
  };
}

/**
 * Thrown — always, once the soft deadline has passed — by
 * `runQueryWithLivenessBoundary`. The outcome mapping recognises it as
 * `TIMEOUT` by class, ahead of any text heuristic, and its message also
 * says "timed out" so the text path agrees.
 */
export class AgentSdkTimeoutError extends Error {
  override readonly name = 'AgentSdkTimeoutError';
  declare readonly deadlineMs: number;
  declare readonly diagnostics: AgentSdkDiagnostics;

  constructor(deadlineMs: number, diagnostics: AgentSdkDiagnosticsInput) {
    super(
      `Agent SDK query timed out: no terminal result within its ${deadlineMs} ms liveness ` +
        `deadline; the query was aborted and closed.`,
    );
    Object.defineProperty(this, 'deadlineMs', { value: deadlineMs, enumerable: true });
    Object.defineProperty(this, 'diagnostics', {
      value: freezeAgentSdkDiagnostics(diagnostics),
      enumerable: true,
    });
  }
}

/**
 * Runtime-only options for ONE runner attempt. Not semantic input: never
 * hashed, never persisted, never part of the invocation.
 */
export interface AgentSdkRunOptions {
  /** This attempt's soft deadline. Defaults to `CLASSIFIER_CALL_SOFT_DEADLINE_MS`; never exceeds it. */
  readonly deadlineMs?: number;
}

function assertPositiveDuration(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive, finite number of milliseconds.`);
  }
}

/** The deadline the production runner applies to one attempt: the override when given, capped at the frozen soft deadline. */
export function resolveAgentSdkAttemptDeadline(runOptions: AgentSdkRunOptions = {}): number {
  if (runOptions.deadlineMs === undefined) return CLASSIFIER_CALL_SOFT_DEADLINE_MS;
  assertPositiveDuration('deadlineMs', runOptions.deadlineMs);
  return Math.min(runOptions.deadlineMs, CLASSIFIER_CALL_SOFT_DEADLINE_MS);
}

/** The normalized terminal result of one SDK run. */
export interface AgentSdkRunResult {
  readonly subtype:
    | 'success'
    | 'error_during_execution'
    | 'error_max_turns'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries';
  readonly isError: boolean;
  /**
   * Present only when the SDK's structured-output channel delivered a value
   * on a GENUINE (non-error) success. Never populated when `isError` is
   * true, even if the underlying message happened to carry a
   * `structured_output` field — an error-flagged result is never pretended
   * to be successful structured output (2B-2C3C hardening).
   */
  readonly structuredOutput: unknown | undefined;
  /** Final assistant text on subtype `success` — or, with `isError`, the SDK's error text. */
  readonly resultText: string | null;
  readonly stopReason: string | null;
  /** The model the SDK reports actually served the call (from per-model usage), or null. */
  readonly responseModelId: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  /** Error strings the SDK attached to an error-subtype result. */
  readonly errors: readonly string[];
}

/**
 * The injectable seam. Production: `createProductionAgentSdkRunner()`. Tests: a fake.
 * `runOptions` is optional so a one-argument fake stays a valid runner.
 */
export interface AgentSdkRunner {
  run(invocation: AgentSdkInvocation, runOptions?: AgentSdkRunOptions): Promise<AgentSdkRunResult>;
}

function normalizeResult(message: SDKResultMessage): AgentSdkRunResult {
  const modelIds = Object.keys(message.modelUsage);
  const responseModelId =
    modelIds.length === 0
      ? null
      : modelIds.reduce((best, id) =>
          message.modelUsage[id]!.outputTokens > message.modelUsage[best]!.outputTokens ? id : best,
        );
  return {
    subtype: message.subtype,
    isError: message.is_error,
    structuredOutput:
      message.subtype === 'success' && !message.is_error ? message.structured_output : undefined,
    resultText: message.subtype === 'success' ? message.result : null,
    stopReason: message.stop_reason,
    responseModelId,
    inputTokens: message.usage.input_tokens ?? null,
    outputTokens: message.usage.output_tokens ?? null,
    errors: message.subtype === 'success' ? [] : message.errors,
  };
}

/**
 * Consumes an SDK message stream to its terminal `result` message and
 * returns the normalized summary — the seam `createProductionAgentSdkRunner`
 * calls with the real `query()` stream, and that a test can call directly
 * with a FAKE stream (see this file's module comment). Stops pulling the
 * instant a `result` message arrives: never calls `next()` again afterwards,
 * relying on `for await...of`'s `IteratorClose` (`return()`, not `next()`)
 * to unwind the stream on `break`.
 *
 * `record`, when given, receives closed progress stages only — the first
 * message of any kind (once), the terminal result, a stream that ended
 * without one, or a stream that threw. It never sees a message's content,
 * and it iterates the stream it was given directly, so `IteratorClose`
 * still reaches the real iterator's own `return()`.
 */
export async function consumeQueryStream(
  stream: AsyncIterable<{ type: string }>,
  record?: (stage: AgentSdkProgressStage) => void,
): Promise<AgentSdkRunResult> {
  let terminal: SDKResultMessage | undefined;
  let sawActivity = false;
  try {
    for await (const message of stream) {
      if (!sawActivity) {
        sawActivity = true;
        record?.('FIRST_STREAM_ACTIVITY');
      }
      if (message.type === 'result') {
        terminal = message as SDKResultMessage;
        record?.('RESULT_RECEIVED');
        break;
      }
    }
  } catch (error) {
    record?.('STREAM_FAILED');
    throw error;
  }
  if (terminal === undefined) {
    record?.('STREAM_ENDED_WITHOUT_RESULT');
    throw new Error('Agent SDK query ended without a result message.');
  }
  return normalizeResult(terminal);
}

/**
 * The structural slice of the SDK `Query` the boundary needs: the message
 * stream itself, and the synchronous `close()` that terminates it. Tests
 * pass a fake; production passes the real `Query` object, so `close()`
 * reaches the SDK's own teardown.
 */
export interface LivenessBoundedQuery extends AsyncIterable<{ type: string }> {
  close(): void;
}

export interface LivenessBoundaryOptions {
  /** This attempt's soft deadline. */
  readonly deadlineMs: number;
  /** Test seam only; production uses `CLASSIFIER_CALL_HARD_KILL_GRACE_MS`. */
  readonly graceMs?: number;
  /** The controller whose signal was handed to the query (production: the one passed as `Options.abortController`). */
  readonly abortController: { abort(): void };
  readonly diagnostics: AgentSdkDiagnosticsCollector;
  /**
   * 2D2C-F0Z test seam for the witness clocks only. Production passes
   * nothing and gets `performance.now()` / `Date`. These clocks feed
   * EVIDENCE fields exclusively — no deadline, abort, close or grace
   * decision reads them, so a fake clock cannot alter control flow.
   */
  readonly witnessClock?: {
    readonly monotonicMs: () => number;
    readonly nowUtc: () => Date;
  };
  /** 2D2C-F0Z test seam: the heartbeat period. Production uses `AGENT_SDK_HEARTBEAT_INTERVAL_MS`. */
  readonly heartbeatIntervalMs?: number;
}

type StreamSettlement =
  | { readonly kind: 'RESULT'; readonly result: AgentSdkRunResult }
  | { readonly kind: 'FAILED'; readonly error: unknown };

/**
 * Consumes `query` to its terminal result under a hard liveness boundary.
 *
 *   - Result before the deadline: returned unchanged; no abort; every timer
 *     cleared.
 *   - Stream failure before the deadline: that ORIGINAL error rethrown —
 *     never relabelled a timeout; every timer cleared.
 *   - Deadline first: TIMEOUT is decided and cannot be undone. Abort, then
 *     close, then wait at most `graceMs` for the stream to settle, then throw
 *     `AgentSdkTimeoutError` regardless of how (or whether) it settled.
 *
 * Both settlement handlers are attached synchronously, before any timer can
 * fire, so a rejection arriving after the decision is already observed and
 * can never surface as an unhandled rejection.
 */
export async function runQueryWithLivenessBoundary(
  activeQuery: LivenessBoundedQuery,
  options: LivenessBoundaryOptions,
): Promise<AgentSdkRunResult> {
  const graceMs = options.graceMs ?? CLASSIFIER_CALL_HARD_KILL_GRACE_MS;
  assertPositiveDuration('deadlineMs', options.deadlineMs);
  assertPositiveDuration('graceMs', graceMs);
  const { diagnostics } = options;

  // ---- 2D2C-F0Z liveness witness: observation only, no control ----
  const witnessClock = options.witnessClock ?? {
    monotonicMs: monotonicNow,
    nowUtc: () => new Date(),
  };
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? AGENT_SDK_HEARTBEAT_INTERVAL_MS;
  const armedAtMonotonicMs = witnessClock.monotonicMs();
  const armedAtUtc = witnessClock.nowUtc().toISOString();
  let observedBeats = 0;
  let maxGapWallMs = 0;
  let maxGapMonotonicMs = 0;
  let lastBeatMonotonicMs = armedAtMonotonicMs;
  let lastBeatWallMs = witnessClock.nowUtc().getTime();
  let firedAtMonotonicMs: number | null = null;
  let firedAtUtc: string | null = null;

  /**
   * Builds the witness from whatever was observed. `expectedBeats` is how
   * many beats the elapsed time was DUE; `observedBeats` is how many the
   * event loop actually ran. A shortfall is the stall signal.
   */
  const buildWitness = (): AgentSdkLivenessWitness => {
    const endedAtMonotonicMs = firedAtMonotonicMs ?? witnessClock.monotonicMs();
    const elapsedMs = Math.max(0, endedAtMonotonicMs - armedAtMonotonicMs);
    return {
      deadlineNominalMs: options.deadlineMs,
      deadlineArmedAtUtc: armedAtUtc,
      deadlineArmedAtMonotonicMs: armedAtMonotonicMs,
      deadlineFiredAtUtc: firedAtUtc,
      deadlineFiredAtMonotonicMs: firedAtMonotonicMs,
      deadlineOvershootMs:
        firedAtMonotonicMs === null
          ? null
          : Math.max(0, firedAtMonotonicMs - armedAtMonotonicMs - options.deadlineMs),
      heartbeat: {
        nominalIntervalMs: heartbeatIntervalMs,
        expectedBeats: Math.floor(elapsedMs / heartbeatIntervalMs),
        observedBeats,
        maxGapWallMs,
        maxGapMonotonicMs,
      },
    };
  };

  // `unref()` so a pending beat can never hold the batch process open, and
  // the `finally` below clears it on EVERY path — a leaked interval would
  // trip the existing `vi.getTimerCount() === 0` assertions.
  const heartbeat = setInterval(() => {
    observedBeats += 1;
    const beatMonotonicMs = witnessClock.monotonicMs();
    const beatWallMs = witnessClock.nowUtc().getTime();
    maxGapMonotonicMs = Math.max(maxGapMonotonicMs, beatMonotonicMs - lastBeatMonotonicMs);
    maxGapWallMs = Math.max(maxGapWallMs, beatWallMs - lastBeatWallMs);
    lastBeatMonotonicMs = beatMonotonicMs;
    lastBeatWallMs = beatWallMs;
  }, heartbeatIntervalMs);
  if (typeof (heartbeat as { unref?: () => void }).unref === 'function') {
    (heartbeat as { unref: () => void }).unref();
  }

  diagnostics.record('QUERY_STARTED');
  const settlement: Promise<StreamSettlement> = consumeQueryStream(activeQuery, (stage) =>
    diagnostics.record(stage),
  ).then(
    (result): StreamSettlement => ({ kind: 'RESULT', result }),
    (error: unknown): StreamSettlement => ({ kind: 'FAILED', error }),
  );

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const first = await Promise.race([
      settlement,
      new Promise<{ readonly kind: 'DEADLINE' }>((resolveDeadline) => {
        deadlineTimer = setTimeout(() => resolveDeadline({ kind: 'DEADLINE' }), options.deadlineMs);
      }),
    ]);
    if (first.kind === 'RESULT') return first.result;
    if (first.kind === 'FAILED') throw first.error;

    // From here on the outcome is TIMEOUT, whatever the stream does next.
    // The witness's fire instants are captured FIRST, before any teardown
    // work can add latency that would be mistaken for overshoot.
    firedAtMonotonicMs = witnessClock.monotonicMs();
    firedAtUtc = witnessClock.nowUtc().toISOString();
    diagnostics.record('DEADLINE_EXPIRED');
    try {
      options.abortController.abort();
    } catch {
      // An abort listener that throws cannot overturn the decision.
    }
    diagnostics.record('ABORT_SIGNALLED');
    try {
      activeQuery.close();
    } catch {
      // Nor can a close that throws.
    }
    diagnostics.record('CLOSE_CALLED');

    const afterClose = await Promise.race([
      settlement.then(() => 'SETTLED' as const),
      new Promise<'GRACE_EXPIRED'>((resolveGrace) => {
        graceTimer = setTimeout(() => resolveGrace('GRACE_EXPIRED'), graceMs);
      }),
    ]);
    diagnostics.record(afterClose === 'SETTLED' ? 'SETTLED_WITHIN_GRACE' : 'GRACE_EXPIRED');
    // Recorded before the snapshot, so the witness travels with the error.
    diagnostics.recordLivenessWitness(buildWitness());
    throw new AgentSdkTimeoutError(options.deadlineMs, diagnostics.snapshot());
  } finally {
    clearTimeout(deadlineTimer);
    clearTimeout(graceTimer);
    clearInterval(heartbeat);
  }
}

/**
 * The production runner: one `query()` per `run()`, streamed to its terminal
 * result message under the hard liveness boundary. One native
 * `AbortController` per run; SDK subprocess stderr feeds the bounded
 * collector and nothing else. Never retries, never falls back, never
 * persists anything — retry policy, the total budget and outcome mapping
 * belong to the provider above this seam.
 */
export function createProductionAgentSdkRunner(): AgentSdkRunner {
  return {
    async run(
      invocation: AgentSdkInvocation,
      runOptions: AgentSdkRunOptions = {},
    ): Promise<AgentSdkRunResult> {
      const deadlineMs = resolveAgentSdkAttemptDeadline(runOptions);
      const diagnostics = createAgentSdkDiagnosticsCollector();
      const abortController = new AbortController();

      // The structural invocation options are converted to the SDK's own
      // Options type HERE, at the single import site — this assignment is
      // what proves, at compile time, that the pure builder's surface
      // matches the pinned SDK version.
      const options: Options = {
        model: invocation.options.model,
        systemPrompt: invocation.options.systemPrompt,
        settingSources: [...invocation.options.settingSources],
        persistSession: invocation.options.persistSession,
        tools: [...invocation.options.tools],
        allowedTools: [...invocation.options.allowedTools],
        disallowedTools: [...invocation.options.disallowedTools],
        canUseTool: invocation.options.canUseTool,
        mcpServers: invocation.options.mcpServers,
        strictMcpConfig: invocation.options.strictMcpConfig,
        skills: [...invocation.options.skills],
        plugins: [...invocation.options.plugins],
        maxTurns: invocation.options.maxTurns,
        outputFormat: {
          type: invocation.options.outputFormat.type,
          schema: invocation.options.outputFormat.schema,
        },
        env: { ...invocation.options.env },
        cwd: invocation.options.cwd,
        thinking: invocation.options.thinking,
        ...(invocation.options.effort !== undefined ? { effort: invocation.options.effort } : {}),
        // The exact SDK-bundled native binary the auth-status preflight ran
        // (ADR 0010 Amendment A): passed through the SDK's documented option,
        // never left to the SDK's implicit default.
        pathToClaudeCodeExecutable: invocation.options.pathToClaudeCodeExecutable,
        // Runtime controls, added HERE and only here — never in the pure
        // invocation builder, never in any input identity.
        abortController,
        stderr: (data: string) => diagnostics.appendStderr(data),
      };

      // The real Query object is retained so the boundary's close() reaches it.
      const activeQuery = query({ prompt: invocation.prompt, options });
      return runQueryWithLivenessBoundary(activeQuery, {
        deadlineMs,
        abortController,
        diagnostics,
      });
    },
  };
}

/**
 * CLASSIFIER_PROVIDER_FAILURE_DIAGNOSTICS_V1 — deterministic, network-free
 * reproduction of every route that can produce the B4-4 persisted shape
 * (FAILED / PROVIDER_TRANSIENT / no model / zero classifications), and the
 * proofs that the new closed per-attempt witness:
 *
 *   - makes each route distinguishable (attempt by attempt),
 *   - never changes a classification, a retry decision or an invocation count,
 *   - never carries raw text: prompts, batches, environment values,
 *     credential-shaped strings, provider text, stderr, exception messages
 *     and stack traces all stay out of the durable/public detail.
 *
 * ZERO network, ZERO SDK construction (fake streams and fake runners only),
 * ZERO subprocess, ZERO Claude usage. The production runners are never
 * constructed (firewall-pinned).
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeClock, type FakeClock } from '../../orgunits/orchestrator/clock.js';
import type { ClassifierProviderRequest } from '../../orgunits/classify/providerContract.js';
import { ClaudeMaxAgentProvider } from '../../orgunits/classify/provider/claudeMaxAgentProvider.js';
import { CLASSIFIER_PROFILE_DIR_VARIABLE } from '../../orgunits/classify/provider/profile.js';
import type {
  AuthStatusInvocation,
  ClassifierAuthStatusRunner,
} from '../../orgunits/classify/provider/authStatusRunner.js';
import type { AuthStatusExecution } from '../../orgunits/classify/provider/authStatus.js';
import {
  AgentSdkAttemptError,
  AgentSdkTimeoutError,
  attachAttemptDiagnostics,
  consumeQueryStream,
  createAgentSdkDiagnosticsCollector,
  runQueryWithLivenessBoundary,
  startQueryWithDiagnostics,
  USAGE_LIMIT_ERROR_PREFIXES,
  type AgentSdkAttemptFailureStage,
  type AgentSdkDiagnostics,
  type AgentSdkRunResult,
  type AgentSdkRunner,
  type LivenessBoundedQuery,
} from '../../orgunits/classify/provider/agentSdkRunner.js';
import {
  classifyRunResult,
  classifyThrownFailure,
  renderProviderFailureDiagnostic,
  witnessNotStartedAttempt,
  witnessReturnedAttempt,
  witnessThrownAttempt,
  PROVIDER_FAILURE_DIAGNOSTIC_VERSION,
  type ProviderAttemptWitness,
} from '../../orgunits/classify/provider/outcomeMapping.js';
import type { ClaudeCodeExecutableResolver } from '../../orgunits/classify/provider/claudeCodeExecutable.js';

/** The sentinel the safety tests plant everywhere raw text could come from. */
const SENTINEL = 'SECRET_SENTINEL owner@example.org postgres://user:pw@db.internal:5432/nwf';
const SENTINEL_PARTS = [
  'SECRET_SENTINEL',
  'owner@example.org',
  'postgres://',
  'user:pw',
  'db.internal',
];

function expectNoSentinel(value: unknown, where: string): void {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const part of SENTINEL_PARTS) {
    expect(text, `${where} leaks ${part}`).not.toContain(part);
  }
}

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const FAKE_EXECUTABLE =
  process.platform === 'win32'
    ? 'C:\\synthetic-root\\node_modules\\synthetic-native\\claude.exe'
    : '/synthetic-root/node_modules/synthetic-native/claude';

const fakeExecutable: ClaudeCodeExecutableResolver = () => ({
  ok: true,
  provenance: {
    executablePath: FAKE_EXECUTABLE,
    packageRoot: '/synthetic-root',
    sdkPackageName: 'synthetic-sdk',
    sdkVersion: '0.0.0-synthetic',
    claudeCodeVersion: '0.0.0-synthetic',
    nativePackageName: 'synthetic-native',
    nativePackageVersion: '0.0.0-synthetic',
    platformKey: 'synthetic',
    binaryFileName: 'claude',
    binaryBytes: 1,
    binarySha256: '0'.repeat(64),
  },
});

const MODEL = 'test-model-max';
const REPO_ROOT = join(tmpdir(), 'nwf-pe-test-repo-root');
const GOOD_AUTH_REPORT = JSON.stringify({
  loggedIn: true,
  authMethod: 'claude.ai',
  apiProvider: 'firstParty',
  subscriptionType: 'max',
});

const cleanups: string[] = [];
afterEach(async () => {
  await Promise.all(
    cleanups.splice(0).map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 3 })),
  );
});

async function provisionedProfile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'nwf-pe-test-profile-'));
  cleanups.push(dir);
  await writeFile(join(dir, '.credentials.json'), '{"never":"read"}', 'utf8');
  return dir;
}

function request(overrides: Partial<ClassifierProviderRequest> = {}): ClassifierProviderRequest {
  return {
    systemPrompt: 'FROZEN PROMPT',
    serializedBatch: '{"context":{},"documents":[]}',
    outputJsonSchema: { type: 'array' },
    modelId: MODEL,
    runConfig: {},
    ...overrides,
  };
}

/** The B4-4 terminal shape as the CLI produces it for an API error before any response. */
function apiErrorResult(overrides: Partial<AgentSdkRunResult> = {}): AgentSdkRunResult {
  return {
    subtype: 'success',
    isError: true,
    structuredOutput: undefined,
    resultText:
      "There's an issue with the selected model. It may not exist or you may not have access to it.",
    stopReason: null,
    responseModelId: null,
    inputTokens: 0,
    outputTokens: 0,
    errors: [],
    apiErrorStatus: 404,
    terminalReason: 'api_error',
    assistantError: 'model_not_found',
    apiRetryCount: 0,
    lastApiRetryErrorStatus: null,
    ...overrides,
  };
}

function edeResult(): AgentSdkRunResult {
  return {
    subtype: 'error_during_execution',
    isError: true,
    structuredOutput: undefined,
    resultText: null,
    stopReason: null,
    responseModelId: null,
    inputTokens: 0,
    outputTokens: 0,
    errors: ['[ede_diagnostic] result_type=user last_content_type=text stop_reason=null'],
  };
}

function okResult(): AgentSdkRunResult {
  return {
    subtype: 'success',
    isError: false,
    structuredOutput: [{ doc_index: 0 }],
    resultText: 'done',
    stopReason: 'end_turn',
    responseModelId: 'test-model-max-reported',
    inputTokens: 10,
    outputTokens: 5,
    errors: [],
  };
}

function diagnosticsWith(stderrTail: string): AgentSdkDiagnostics {
  const collector = createAgentSdkDiagnosticsCollector(() => 0);
  collector.record('QUERY_STARTED');
  collector.record('FIRST_STREAM_ACTIVITY');
  collector.record('STREAM_FAILED');
  collector.appendStderr(stderrTail);
  return collector.snapshot();
}

/** The SDK transport's non-zero-exit error, own properties included (sdk.mjs 0.3.251). */
function processExitError(code: number, stderr: string): Error {
  const error = new Error(`Claude Code process exited with code ${code}. stderr: ${stderr}`);
  Object.assign(error, { exitCode: code, errorClass: 'process_exited_nonzero' });
  return error;
}

type ScriptEntry = AgentSdkRunResult | Error;

class FakeRunner implements AgentSdkRunner {
  calls = 0;
  readonly #script: readonly ScriptEntry[];
  constructor(script: readonly ScriptEntry[]) {
    this.#script = script;
  }
  async run(): Promise<AgentSdkRunResult> {
    const entry = this.#script[this.calls];
    this.calls += 1;
    if (entry === undefined) throw new Error('FakeRunner: script exhausted');
    if (entry instanceof Error) throw entry;
    return entry;
  }
}

class FakeAuthStatusRunner implements ClassifierAuthStatusRunner {
  async run(_invocation: AuthStatusInvocation): Promise<AuthStatusExecution> {
    return { exitCode: 0, stdout: GOOD_AUTH_REPORT };
  }
}

interface Capture {
  readonly witnesses: ProviderAttemptWitness[];
  readonly failureDiagnostics: {
    stage: AgentSdkAttemptFailureStage;
    diagnostics: AgentSdkDiagnostics;
  }[];
  readonly timeoutDiagnostics: AgentSdkDiagnostics[];
}

async function classifyWith(
  script: readonly ScriptEntry[],
  options: {
    readonly env?: Record<string, string>;
    readonly request?: Partial<ClassifierProviderRequest>;
    readonly throwingHooks?: boolean;
  } = {},
) {
  const runner = new FakeRunner(script);
  const clock = createFakeClock();
  const capture: Capture = { witnesses: [], failureDiagnostics: [], timeoutDiagnostics: [] };
  const profileDir = await provisionedProfile();
  const provider = new ClaudeMaxAgentProvider({
    runner,
    authStatusRunner: new FakeAuthStatusRunner(),
    claudeCodeExecutable: fakeExecutable,
    env: () => ({ [CLASSIFIER_PROFILE_DIR_VARIABLE]: profileDir, PATH: '/bin', ...options.env }),
    repoRoot: REPO_ROOT,
    allowedModels: [MODEL],
    clock,
    onAttemptWitness: (witness) => {
      capture.witnesses.push(witness);
      if (options.throwingHooks === true) throw new Error(SENTINEL);
    },
    onAttemptFailureDiagnostics: (stage, diagnostics) => {
      capture.failureDiagnostics.push({ stage, diagnostics });
      if (options.throwingHooks === true) throw new Error(SENTINEL);
    },
    onAttemptDiagnostics: (diagnostics) => {
      capture.timeoutDiagnostics.push(diagnostics);
      if (options.throwingHooks === true) throw new Error(SENTINEL);
    },
  });
  const result = await settle(clock, provider.classify(request(options.request)));
  return { result, runner, capture };
}

async function settle<T>(clock: FakeClock, promise: Promise<T>): Promise<T> {
  let settled = false;
  void promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  for (let i = 0; i < 10_000 && !settled; i += 1) {
    if (clock.pendingCount > 0) clock.advance(10);
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  }
  return promise;
}

/** A fake SDK message stream: yields `messages`, then ends, or throws `failure`. */
function fakeQuery(
  messages: readonly { type: string; [key: string]: unknown }[],
  failure?: unknown,
): LivenessBoundedQuery {
  return {
    close() {},
    async *[Symbol.asyncIterator]() {
      for (const message of messages) yield message;
      if (failure !== undefined) throw failure;
    },
  };
}

// ---------------------------------------------------------------------------
// runner layer: the snapshot that used to be lost now travels with the failure
// ---------------------------------------------------------------------------

describe('runner: a non-timeout failure carries its diagnostics snapshot (the primary observability defect)', () => {
  it('a stream that THROWS after activity -> AgentSdkAttemptError STREAM_FAILED, cause is the ORIGINAL error, stderr retained in memory', async () => {
    const collector = createAgentSdkDiagnosticsCollector();
    collector.appendStderr('child said something');
    const original = processExitError(1, 'boom');
    const attempt = attachAttemptDiagnostics(
      runQueryWithLivenessBoundary(fakeQuery([{ type: 'system', subtype: 'init' }], original), {
        deadlineMs: 60_000,
        abortController: new AbortController(),
        diagnostics: collector,
      }),
      collector,
    );
    const error = await attempt.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AgentSdkAttemptError);
    const typed = error as AgentSdkAttemptError;
    expect(typed.failureStage).toBe('STREAM_FAILED');
    expect(typed.cause).toBe(original);
    expect(typed.message).toBe('Agent SDK attempt failed (STREAM_FAILED).');
    expect(typed.diagnostics.progress.map((p) => p.stage)).toEqual([
      'QUERY_STARTED',
      'FIRST_STREAM_ACTIVITY',
      'STREAM_FAILED',
    ]);
    expect(typed.diagnostics.stderrTail).toBe('child said something');
    expect(Object.isFrozen(typed.diagnostics)).toBe(true);
  });

  it('a stream that ENDS without a result -> AgentSdkAttemptError STREAM_ENDED_WITHOUT_RESULT', async () => {
    const collector = createAgentSdkDiagnosticsCollector();
    const error = await attachAttemptDiagnostics(
      runQueryWithLivenessBoundary(fakeQuery([{ type: 'system', subtype: 'init' }]), {
        deadlineMs: 60_000,
        abortController: new AbortController(),
        diagnostics: collector,
      }),
      collector,
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AgentSdkAttemptError);
    expect((error as AgentSdkAttemptError).failureStage).toBe('STREAM_ENDED_WITHOUT_RESULT');
    expect(((error as AgentSdkAttemptError).cause as Error).message).toMatch(
      /ended without a result message/,
    );
  });

  it('a stream that throws BEFORE any message -> STREAM_FAILED with no stream activity', async () => {
    const collector = createAgentSdkDiagnosticsCollector();
    const error = await attachAttemptDiagnostics(
      runQueryWithLivenessBoundary(fakeQuery([], new Error('spawn failed')), {
        deadlineMs: 60_000,
        abortController: new AbortController(),
        diagnostics: collector,
      }),
      collector,
    ).then(
      () => null,
      (e: unknown) => e,
    );
    const typed = error as AgentSdkAttemptError;
    expect(typed.failureStage).toBe('STREAM_FAILED');
    expect(typed.diagnostics.progress.map((p) => p.stage)).toEqual([
      'QUERY_STARTED',
      'STREAM_FAILED',
    ]);
  });

  it('a returned result comes back unchanged plus its diagnostics', async () => {
    const collector = createAgentSdkDiagnosticsCollector();
    const result = await attachAttemptDiagnostics(Promise.resolve(okResult()), collector);
    expect({ ...result, diagnostics: undefined }).toEqual({
      ...okResult(),
      diagnostics: undefined,
    });
    expect(result.diagnostics).toBeDefined();
  });

  it('an AgentSdkTimeoutError passes through AS IS (it already carries its own diagnostics)', async () => {
    const timeout = new AgentSdkTimeoutError(1_000, { progress: [], stderrTail: '', pid: null });
    const collector = createAgentSdkDiagnosticsCollector();
    await expect(attachAttemptDiagnostics(Promise.reject(timeout), collector)).rejects.toBe(
      timeout,
    );
  });

  it('a synchronous query() throw -> QUERY_CONSTRUCTION_FAILED, cause preserved', () => {
    const original = new TypeError('bad option');
    const collector = createAgentSdkDiagnosticsCollector();
    let caught: unknown;
    try {
      startQueryWithDiagnostics(() => {
        throw original;
      }, collector);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AgentSdkAttemptError);
    expect((caught as AgentSdkAttemptError).failureStage).toBe('QUERY_CONSTRUCTION_FAILED');
    expect((caught as AgentSdkAttemptError).cause).toBe(original);
  });
});

describe('runner: the SDK-declared STRUCTURAL failure fields are no longer dropped', () => {
  it('captures api_error_status, terminal_reason, the last assistant error and api_retry counts - never content', async () => {
    const result = await consumeQueryStream(
      fakeQuery([
        { type: 'system', subtype: 'init' },
        { type: 'system', subtype: 'api_retry', error_status: 529, error: 'overloaded' },
        { type: 'system', subtype: 'api_retry', error_status: null, error: 'server_error' },
        {
          type: 'assistant',
          error: 'model_not_found',
          message: { content: [{ type: 'text', text: SENTINEL }] },
        },
        {
          type: 'result',
          subtype: 'success',
          is_error: true,
          result: SENTINEL,
          stop_reason: null,
          api_error_status: 404,
          terminal_reason: 'api_error',
          usage: { input_tokens: 0, output_tokens: 0 },
          modelUsage: {},
        },
      ]),
    );
    expect(result.apiErrorStatus).toBe(404);
    expect(result.terminalReason).toBe('api_error');
    expect(result.assistantError).toBe('model_not_found');
    expect(result.apiRetryCount).toBe(2);
    expect(result.lastApiRetryErrorStatus).toBeNull();
    expect(result.responseModelId).toBeNull();
    expect(result.inputTokens).toBe(0);
  });

  it('a result without the optional structural fields normalises them to null / zero', async () => {
    const result = await consumeQueryStream(
      fakeQuery([
        {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          errors: ['x'],
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
          modelUsage: {},
        },
      ]),
    );
    expect(result.apiErrorStatus).toBeNull();
    expect(result.terminalReason).toBeNull();
    expect(result.assistantError).toBeNull();
    expect(result.apiRetryCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mapping: one authority, unchanged classifications, closed witnesses
// ---------------------------------------------------------------------------

describe('mapping: the typed wrapper is TRANSPARENT to classification', () => {
  const causes: readonly unknown[] = [
    new Error(`${USAGE_LIMIT_ERROR_PREFIXES[0] ?? 'You'} limit`),
    new Error('authentication_error: Please run /login'),
    new Error('request timed out'),
    Object.assign(new Error('aborted'), { name: 'AbortError' }),
    new Error('API Error: 400 tools.0.custom.input_schema.type: bad'),
    processExitError(1, 'unrelated'),
    new Error('read ECONNRESET'),
    'a bare string',
  ];
  for (const cause of causes) {
    it(`wrapping ${cause instanceof Error ? cause.message.slice(0, 40) : String(cause)} changes nothing`, () => {
      for (const stage of [
        'STREAM_FAILED',
        'STREAM_ENDED_WITHOUT_RESULT',
        'QUERY_CONSTRUCTION_FAILED',
      ] as const) {
        const wrapped = new AgentSdkAttemptError(stage, cause, {
          progress: [],
          stderrTail: SENTINEL,
          pid: null,
        });
        expect(classifyThrownFailure(wrapped)).toEqual(classifyThrownFailure(cause));
      }
    });
  }
});

describe('mapping: every B4-4-compatible route yields a DISTINCT closed witness', () => {
  it('a returned API error (success + is_error, 404, model_not_found) -> PROVIDER_TRANSIENT, now self-describing', () => {
    const result = apiErrorResult();
    const classified = classifyRunResult(result);
    expect(classified.kind).toBe('PROVIDER_TRANSIENT');
    const witness = witnessReturnedAttempt({ ordinal: 1, elapsedMs: 900, result, classified });
    expect(witness).toMatchObject({
      shape: 'RESULT',
      reasonCode: 'UNRECOGNISED_ERROR',
      resultSubtype: 'success',
      resultIsError: true,
      terminalReason: 'api_error',
      assistantError: 'model_not_found',
      apiErrorStatus: 404,
      modelReported: false,
      inputTokens: 0,
      outputTokens: 0,
      thrownClass: null,
    });
  });

  it('an error_during_execution with the CLI ede_diagnostic -> marker, never the text', () => {
    const result = edeResult();
    const classified = classifyRunResult(result);
    expect(classified.kind).toBe('PROVIDER_TRANSIENT');
    const witness = witnessReturnedAttempt({ ordinal: 1, elapsedMs: 1, result, classified });
    expect(witness.resultSubtype).toBe('error_during_execution');
    expect(witness.resultErrorCount).toBe(1);
    expect(witness.resultMarkers).toEqual(['EDE_DIAGNOSTIC']);
    expect(JSON.stringify(witness)).not.toContain('result_type');
  });

  it('a non-zero process exit -> exit code and transport class from own properties; stderr text never copied', () => {
    const error = new AgentSdkAttemptError('STREAM_FAILED', processExitError(1, SENTINEL), {
      progress: [],
      stderrTail: SENTINEL,
      pid: null,
    });
    const classified = classifyThrownFailure(error);
    expect(classified.kind).toBe('PROVIDER_TRANSIENT');
    const witness = witnessThrownAttempt({ ordinal: 1, elapsedMs: 5, error, classified });
    expect(witness).toMatchObject({
      shape: 'THROWN',
      thrownClass: 'STREAM_FAILED',
      thrownName: 'Error',
      transportErrorClass: 'process_exited_nonzero',
      processExitCode: 1,
      thrownMarkers: ['PROCESS_EXIT'],
    });
    expectNoSentinel(witness, 'process-exit witness');
  });

  it('exit code falls back to the SDK wording when the own property is absent', () => {
    const cause = new Error('Claude Code process exited with code 137');
    const error = new AgentSdkAttemptError('STREAM_FAILED', cause, {
      progress: [],
      stderrTail: '',
      pid: null,
    });
    const witness = witnessThrownAttempt({
      ordinal: 1,
      elapsedMs: 0,
      error,
      classified: classifyThrownFailure(error),
    });
    expect(witness.processExitCode).toBe(137);
    expect(witness.transportErrorClass).toBeNull();
  });

  it('stream ended without result, untyped throw and budget exhaustion are each distinguishable', () => {
    const ended = new AgentSdkAttemptError('STREAM_ENDED_WITHOUT_RESULT', new Error('x'), {
      progress: [],
      stderrTail: '',
      pid: null,
    });
    const untyped = new Error('read ECONNRESET');
    const w1 = witnessThrownAttempt({
      ordinal: 1,
      elapsedMs: 0,
      error: ended,
      classified: classifyThrownFailure(ended),
    });
    const w2 = witnessThrownAttempt({
      ordinal: 2,
      elapsedMs: 0,
      error: untyped,
      classified: classifyThrownFailure(untyped),
    });
    expect(w1.thrownClass).toBe('STREAM_ENDED_WITHOUT_RESULT');
    expect(w2.thrownClass).toBe('UNTYPED_THROW');
    const timeoutExhausted = witnessNotStartedAttempt({
      ordinal: 3,
      classified: { kind: 'TIMEOUT', detail: 'x', reasonCode: 'TOTAL_BUDGET_EXHAUSTED' },
    });
    expect(timeoutExhausted.shape).toBe('NOT_STARTED');
  });

  it('values outside the SDK-declared unions are reduced to OTHER, never echoed', () => {
    const result = apiErrorResult({
      subtype: SENTINEL as AgentSdkRunResult['subtype'],
      stopReason: SENTINEL,
      terminalReason: SENTINEL,
      assistantError: SENTINEL,
      apiErrorStatus: 99_999,
      lastApiRetryErrorStatus: -1,
      apiRetryCount: -3,
    });
    const witness = witnessReturnedAttempt({
      ordinal: 1,
      elapsedMs: 0,
      result,
      classified: classifyRunResult(result),
    });
    expect(witness.resultSubtype).toBe('OTHER');
    expect(witness.stopReason).toBe('OTHER');
    expect(witness.terminalReason).toBe('OTHER');
    expect(witness.assistantError).toBe('OTHER');
    expect(witness.apiErrorStatus).toBeNull();
    expect(witness.lastApiRetryErrorStatus).toBeNull();
    expect(witness.apiRetryCount).toBeNull();
    expectNoSentinel(witness, 'OTHER witness');
  });

  it('an unrecognised thrown name is OTHER and a non-Error throw is NON_ERROR', () => {
    const weird = Object.assign(new Error('x'), { name: SENTINEL });
    expect(
      witnessThrownAttempt({
        ordinal: 1,
        elapsedMs: 0,
        error: weird,
        classified: classifyThrownFailure(weird),
      }).thrownName,
    ).toBe('OTHER');
    expect(
      witnessThrownAttempt({
        ordinal: 1,
        elapsedMs: 0,
        error: SENTINEL,
        classified: classifyThrownFailure(SENTINEL),
      }).thrownName,
    ).toBe('NON_ERROR');
  });

  it('a genuine success derives nothing from the model answer text', () => {
    const result = { ...okResult(), resultText: 'API Error: 500 timeout exited with code 1' };
    const witness = witnessReturnedAttempt({
      ordinal: 1,
      elapsedMs: 0,
      result,
      classified: classifyRunResult(result),
    });
    expect(witness.outcome).toBe('OK');
    expect(witness.resultMarkers).toEqual([]);
    expect(witness.apiErrorStatus).toBeNull();
    expect(witness.processExitCode).toBeNull();
  });
});

describe('mapping: the rendered diagnostic is bounded and printable', () => {
  it('a worst-case three-attempt rendering stays far inside the 2,000-character detail bound', () => {
    const noisy = apiErrorResult({
      subtype: 'error_max_structured_output_retries',
      stopReason: 'model_context_window_exceeded',
      terminalReason: 'structured_output_retry_exhausted',
      assistantError: 'authentication_failed',
      apiRetryCount: 999_999,
      lastApiRetryErrorStatus: 529,
      errors: [
        `${USAGE_LIMIT_ERROR_PREFIXES[0] ?? ''} unauthorized timeout API Error: 400 input_schema exited with code 255 [ede_diagnostic]`,
      ],
      responseModelId: 'm',
      inputTokens: 9_999_999,
      outputTokens: 9_999_999,
    });
    const witnesses = [1, 2, 3].map((ordinal) =>
      witnessReturnedAttempt({
        ordinal,
        elapsedMs: 300_000,
        result: noisy,
        classified: classifyRunResult(noisy),
      }),
    );
    const rendered = renderProviderFailureDiagnostic(witnesses);
    expect(rendered.length).toBeLessThan(1_700);
    expect(rendered).toMatch(/^[\x20-\x7e]+$/);
    expect(
      rendered.startsWith(
        `[${PROVIDER_FAILURE_DIAGNOSTIC_VERSION} attempts=3 sameShape=1 finalDiffers=0;`,
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// provider: attempt-by-attempt visibility, unchanged control flow
// ---------------------------------------------------------------------------

describe('provider: attempt-by-attempt visibility without any control-flow change', () => {
  it('B4-4 shape: three identical returned API errors -> 3 invocations, PROVIDER_TRANSIENT, sameShape=1, reason code persisted in the detail', async () => {
    const { result, runner, capture } = await classifyWith([
      apiErrorResult(),
      apiErrorResult(),
      apiErrorResult(),
    ]);
    expect(runner.calls).toBe(3);
    expect(result.outcome).toBe('PROVIDER_TRANSIENT');
    expect(result.outcomeReasonCode).toBe('UNRECOGNISED_ERROR');
    expect(result.responseModelId).toBeNull();
    expect(result.inputTokens).toBe(0);
    expect(result.outcomeDetail).toMatch(
      /^transient or unrecognised provider failure \(mapped PROVIDER_TRANSIENT; see outcomeMapping\.ts\)\. \[provider-diag-v1 attempts=3 sameShape=1 finalDiffers=0; #1 RESULT PROVIDER_TRANSIENT\/UNRECOGNISED_ERROR subtype=success isError=1 /,
    );
    expect(result.outcomeDetail).toContain('terminal=api_error assistantError=model_not_found');
    expect(result.outcomeDetail).toContain('api=404');
    expect(result.outcomeDetail).toContain('#3 RESULT');
    expect(capture.witnesses.map((w) => w.ordinal)).toEqual([1, 2, 3]);
    expect(Object.keys(result).sort()).toEqual(
      [
        'inputTokens',
        'outcome',
        'outcomeDetail',
        'outcomeReasonCode',
        'outputTokens',
        'rawOutput',
        'responseModelId',
      ].sort(),
    );
  });

  it('three stream-ended-without-result throws -> class per attempt, raw diagnostics ONLY in the local hook', async () => {
    const ended = () =>
      new AgentSdkAttemptError(
        'STREAM_ENDED_WITHOUT_RESULT',
        new Error('ended'),
        diagnosticsWith(SENTINEL),
      );
    const { result, runner, capture } = await classifyWith([ended(), ended(), ended()]);
    expect(runner.calls).toBe(3);
    expect(result.outcome).toBe('PROVIDER_TRANSIENT');
    expect(result.outcomeDetail).toContain('transient or unrecognised provider transport failure');
    expect(result.outcomeDetail).toContain('class=STREAM_ENDED_WITHOUT_RESULT');
    expect(result.outcomeDetail).toContain('sameShape=1');
    expect(result.inputTokens).toBeNull();
    expect(capture.failureDiagnostics).toHaveLength(3);
    expect(capture.failureDiagnostics[0]!.stage).toBe('STREAM_ENDED_WITHOUT_RESULT');
    expect(capture.failureDiagnostics[0]!.diagnostics.stderrTail).toContain('SECRET_SENTINEL');
    // The landed timeout-only hook is still timeout-only.
    expect(capture.timeoutDiagnostics).toHaveLength(0);
    expectNoSentinel(result, 'provider result');
  });

  it('transient -> transient -> terminal: finalDiffers=1, outcome is the terminal one, no extra invocation', async () => {
    const usage = apiErrorResult({
      resultText: `${USAGE_LIMIT_ERROR_PREFIXES[0] ?? "You've hit your"} limit`,
      apiErrorStatus: 429,
      assistantError: 'rate_limit',
    });
    const { result, runner } = await classifyWith([apiErrorResult(), edeResult(), usage]);
    expect(runner.calls).toBe(3);
    expect(result.outcome).toBe('USAGE_LIMIT_EXHAUSTED');
    expect(result.outcomeDetail).toContain('attempts=3 sameShape=0 finalDiffers=1');
    expect(result.outcomeDetail).toContain(
      '#2 RESULT PROVIDER_TRANSIENT/UNRECOGNISED_ERROR subtype=error_during_execution',
    );
    expect(result.outcomeDetail).toContain('#3 RESULT USAGE_LIMIT_EXHAUSTED/USAGE_LIMIT_REACHED');
  });

  it('mixed shapes: thrown process exit then returned API error then success -> OK, null detail, every witness still observed', async () => {
    const exit = new AgentSdkAttemptError(
      'STREAM_FAILED',
      processExitError(1, SENTINEL),
      diagnosticsWith(SENTINEL),
    );
    const { result, runner, capture } = await classifyWith([exit, apiErrorResult(), okResult()]);
    expect(runner.calls).toBe(3);
    expect(result.outcome).toBe('OK');
    expect(result.outcomeDetail).toBeNull();
    expect(capture.witnesses.map((w) => `${w.shape}:${w.outcome}`)).toEqual([
      'THROWN:PROVIDER_TRANSIENT',
      'RESULT:PROVIDER_TRANSIENT',
      'RESULT:OK',
    ]);
    expect(capture.witnesses[0]!.processExitCode).toBe(1);
  });

  it('a liveness TIMEOUT stays terminal and single-attempt, via the landed timeout path', async () => {
    const timeout = new AgentSdkTimeoutError(300_000, {
      progress: [{ stage: 'DEADLINE_EXPIRED', elapsedMs: 300_000 }],
      stderrTail: SENTINEL,
      pid: null,
    });
    const { result, runner, capture } = await classifyWith([timeout]);
    expect(runner.calls).toBe(1);
    expect(result.outcome).toBe('TIMEOUT');
    expect(result.outcomeReasonCode).toBe('LIVENESS_DEADLINE_EXCEEDED');
    expect(result.outcomeDetail).toContain('class=LIVENESS_TIMEOUT');
    expect(result.outcomeDetail).not.toContain('DEADLINE_EXPIRED');
    expect(capture.timeoutDiagnostics).toHaveLength(1);
    expect(capture.failureDiagnostics).toHaveLength(0);
    expectNoSentinel(result, 'timeout result');
  });

  const terminalCases: readonly [string, AgentSdkRunResult, string][] = [
    [
      'auth',
      apiErrorResult({ resultText: 'Please run /login · API Error: 401', apiErrorStatus: 401 }),
      'AUTH_FAILURE',
    ],
    [
      'usage',
      apiErrorResult({ resultText: `${USAGE_LIMIT_ERROR_PREFIXES[0] ?? ''} x` }),
      'USAGE_LIMIT_EXHAUSTED',
    ],
    [
      'schema',
      apiErrorResult({
        resultText: 'API Error: 400 tools.0.custom.input_schema.type',
        apiErrorStatus: 400,
      }),
      'STRUCTURED_OUTPUT_FAILED',
    ],
    ['refusal', { ...okResult(), stopReason: 'refusal' }, 'PROVIDER_REFUSAL'],
  ];
  for (const [label, entry, outcome] of terminalCases) {
    it(`${label} stays non-retried: one invocation, attempts=1, outcome ${outcome}`, async () => {
      const { result, runner } = await classifyWith([entry, okResult(), okResult()]);
      expect(runner.calls).toBe(1);
      expect(result.outcome).toBe(outcome);
      expect(result.outcomeDetail).toContain('attempts=1 ');
    });
  }

  it('throwing hooks cannot change the outcome, the invocation count or the detail', async () => {
    const script = () => [
      new AgentSdkAttemptError('STREAM_FAILED', new Error('x'), diagnosticsWith('')),
      apiErrorResult(),
      apiErrorResult(),
    ];
    const plain = await classifyWith(script());
    const throwing = await classifyWith(script(), { throwingHooks: true });
    expect(throwing.runner.calls).toBe(plain.runner.calls);
    expect(throwing.result.outcome).toBe(plain.result.outcome);
    expect(throwing.result.outcomeDetail?.replace(/ms=\d+/g, '')).toBe(
      plain.result.outcomeDetail?.replace(/ms=\d+/g, ''),
    );
  });
});

// ---------------------------------------------------------------------------
// disclosure: nothing raw reaches the durable/public detail or a witness
// ---------------------------------------------------------------------------

describe('disclosure: the sentinel planted in every raw source never reaches the detail or a witness', () => {
  it('prompt, batch, environment, result text, error strings, stderr, exception message and stack', async () => {
    const thrown = processExitError(1, SENTINEL);
    thrown.stack = `Error: ${SENTINEL}\n    at ${SENTINEL}`;
    const { result, capture } = await classifyWith(
      [
        new AgentSdkAttemptError('STREAM_FAILED', thrown, diagnosticsWith(SENTINEL)),
        apiErrorResult({ resultText: SENTINEL, errors: [SENTINEL, `API Error: 503 ${SENTINEL}`] }),
        { ...edeResult(), errors: [`[ede_diagnostic] ${SENTINEL}`] },
      ],
      {
        env: { NWF_PE_SENTINEL: SENTINEL },
        request: { systemPrompt: SENTINEL, serializedBatch: JSON.stringify({ secret: SENTINEL }) },
      },
    );
    expect(result.outcome).toBe('PROVIDER_TRANSIENT');
    expectNoSentinel(result, 'provider result');
    expectNoSentinel(result.outcomeDetail, 'outcome detail');
    expectNoSentinel(capture.witnesses, 'witnesses');
    // The STRUCTURAL api_error_status (404) wins over a status found in text (503).
    expect(result.outcomeDetail).toContain('api=404');
    expect(result.outcomeDetail).not.toContain('api=503');
    // The bounded raw diagnostics DID exist - they just stayed in the local hook.
    expect(capture.failureDiagnostics[0]!.diagnostics.stderrTail).toContain('SECRET_SENTINEL');
  });
});

// ---------------------------------------------------------------------------
// changed surface since the control-plane contract terminal
// ---------------------------------------------------------------------------

const GIT_ROOT = resolve(__dirname, '..', '..', '..');
const CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_TERMINAL =
  'e2d0a2bda4ebdf5d93bbddd2b751579a375bb0c0';
const C = CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_TERMINAL;
const CONTRACT_TEST = 'src/test/unit/classifierOperatorControlPlaneContractV1.test.ts';
const AUTHORISED_PRODUCTION_FILES = [
  'src/orgunits/classify/provider/agentSdkRunner.ts',
  'src/orgunits/classify/provider/claudeMaxAgentProvider.ts',
  'src/orgunits/classify/provider/outcomeMapping.ts',
].sort();
const PERMITTED = new Set([
  ...AUTHORISED_PRODUCTION_FILES,
  CONTRACT_TEST,
  'src/test/unit/orgunitClassifyProviderFailureDiagnostics.test.ts',
  'src/test/firewall/phase2b.firewall.test.ts',
  'docs/audits/PHASE_2B_2D_CLASSIFIER_PROVIDER_FAILURE_DIAGNOSTICS_V1.md',
]);

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: GIT_ROOT, encoding: 'utf8', maxBuffer: 256 << 20 });
}
const gitLines = (value: string): string[] => value.split('\n').filter((l) => l.length > 0);
function commitExists(commit: string): boolean {
  try {
    git('cat-file', '-e', `${commit}^{commit}`);
    return true;
  } catch {
    return false;
  }
}
/** Every path changed since the contract terminal, committed or not. */
function changedSinceContract(): string[] {
  return [
    ...new Set([
      ...gitLines(git('diff', '--name-only', C)),
      ...gitLines(git('ls-files', '--others', '--exclude-standard')),
    ]),
  ];
}

describe.skipIf(!commitExists(C))('provider failure diagnostics V1: changed surface', () => {
  it('descends from the contract terminal with single-parent commits, first freezing the contract test', () => {
    expect(() => git('merge-base', '--is-ancestor', C, 'HEAD')).not.toThrow();
    expect(gitLines(git('rev-list', '--merges', `${C}..HEAD`))).toEqual([]);
    const [first] = gitLines(git('rev-list', '--reverse', `${C}..HEAD`));
    if (first === undefined) return;
    expect(git('rev-parse', `${first}^`).trim()).toBe(C);
    expect(gitLines(git('diff', '--name-only', C, first))).toEqual([CONTRACT_TEST]);
    expect(gitLines(git('log', '-1', '--format=%s', first))[0]).toMatch(
      /freeze classifier operator control-plane contract scope/,
    );
  });

  it('changes production code exactly within the three provider modules', () => {
    const production = changedSinceContract().filter(
      (p) => p.startsWith('src/') && !p.startsWith('src/test/'),
    );
    expect(production.sort()).toEqual(AUTHORISED_PRODUCTION_FILES);
  });

  it('changes nothing else: no migration, orchestration, persistence, retry, contract, CLI, package or prior document', () => {
    expect(changedSinceContract().filter((p) => !PERMITTED.has(p))).toEqual([]);
    for (const path of [
      'src/orgunits/classify/retry.ts',
      'src/orgunits/classify/orchestrate.ts',
      'src/orgunits/classify/persist.ts',
      'src/orgunits/classify/providerContract.ts',
      'src/orgunits/classify/operatorContract.ts',
      'src/orgunits/classify/operatorReadModels.ts',
      'package.json',
      'package-lock.json',
      'CLAUDE.md',
    ]) {
      expect(gitLines(git('diff', '--name-only', C, '--', path)), path).toEqual([]);
    }
    expect(gitLines(git('diff', '--name-only', C, '--', 'migrations'))).toEqual([]);
  });

  it('the contract-test freeze only re-points its range; the firewall change only ADDS lines', () => {
    const firewall = gitLines(
      git('diff', '-U0', C, '--', 'src/test/firewall/phase2b.firewall.test.ts'),
    );
    expect(firewall.filter((l) => /^-[^-]/.test(l))).toEqual([]);
  });
});

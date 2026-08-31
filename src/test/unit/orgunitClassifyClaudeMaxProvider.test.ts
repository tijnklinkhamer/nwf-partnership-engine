/**
 * `ClaudeMaxAgentProvider` against a fake `AgentSdkRunner`: success mapping,
 * every failure mapping, pre-flight refusal with zero runner calls, bounded
 * transient retry (fake clock, no real sleeps), isolation lifecycle
 * (cleanup on success, failure and throw; parallel independence), and
 * secret-leak proofs with a distinctive fake token. ZERO network, ZERO SDK
 * construction, ZERO Claude usage.
 */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createFakeClock, type FakeClock } from '../../orgunits/orchestrator/clock.js';
import type { ClassifierProviderRequest } from '../../orgunits/classify/providerContract.js';
import { ClaudeMaxAgentProvider } from '../../orgunits/classify/provider/claudeMaxAgentProvider.js';
import { FORBIDDEN_AUTH_VARIABLES } from '../../orgunits/classify/provider/authConflicts.js';
import {
  USAGE_LIMIT_ERROR_PREFIXES,
  type AgentSdkRunResult,
  type AgentSdkRunner,
} from '../../orgunits/classify/provider/agentSdkRunner.js';
import type { AgentSdkInvocation } from '../../orgunits/classify/provider/sdkOptions.js';

const FAKE_TOKEN = 'test-oauth-secret-do-not-log';
const MODEL = 'test-model-max';
const ALLOWED = [MODEL];

function validEnv(extra: Record<string, string> = {}): Record<string, string | undefined> {
  return { CLAUDE_CODE_OAUTH_TOKEN: FAKE_TOKEN, PATH: 'C:\\bin', ...extra };
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

function okRunResult(structuredOutput: unknown): AgentSdkRunResult {
  return {
    subtype: 'success',
    isError: false,
    structuredOutput,
    resultText: 'done',
    stopReason: 'end_turn',
    responseModelId: 'test-model-max-reported',
    inputTokens: 1234,
    outputTokens: 567,
    errors: [],
  };
}

/** A fake runner that records invocations and answers from a script of results/throwables. */
class FakeRunner implements AgentSdkRunner {
  readonly invocations: AgentSdkInvocation[] = [];
  readonly #script: readonly (AgentSdkRunResult | Error | (() => Promise<AgentSdkRunResult>))[];

  constructor(script: readonly (AgentSdkRunResult | Error | (() => Promise<AgentSdkRunResult>))[]) {
    this.#script = script;
  }

  async run(invocation: AgentSdkInvocation): Promise<AgentSdkRunResult> {
    const index = this.invocations.length;
    this.invocations.push(invocation);
    const entry = this.#script[index];
    if (entry === undefined) throw new Error(`FakeRunner: no scripted entry for run #${index + 1}`);
    if (entry instanceof Error) throw entry;
    if (typeof entry === 'function') return entry();
    return entry;
  }
}

function provider(
  runner: AgentSdkRunner,
  env: Record<string, string | undefined> = validEnv(),
  clock?: FakeClock,
): ClaudeMaxAgentProvider {
  return new ClaudeMaxAgentProvider({
    runner,
    env: () => env,
    allowedModels: ALLOWED,
    ...(clock !== undefined ? { clock } : {}),
  });
}

/** Pumps a fake clock until the promise settles - no real sleeps anywhere. */
async function settle<T>(clock: FakeClock, promise: Promise<T>): Promise<T> {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  // Yield a MACROTASK per iteration: the provider performs real filesystem
  // work (isolation dirs) between clock sleeps, so a microtask-only pump
  // would spin to exhaustion before the first backoff sleep is even armed.
  // The advance is what lets pending sleeps resolve; the setTimeout(0) is a
  // scheduler yield, not a wall-clock wait.
  for (let i = 0; i < 10_000 && !settled; i += 1) {
    clock.advance(1_000_000);
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  }
  return promise;
}

describe('ClaudeMaxAgentProvider - success path', () => {
  it('maps a structured SDK result to a provider-neutral OK with usage metadata only', async () => {
    const payload = [{ doc_index: 0, verdict: 'NOT_A_UNIT' }];
    const runner = new FakeRunner([okRunResult(payload)]);
    const result = await provider(runner).classify(request());
    expect(result.outcome).toBe('OK');
    expect(result.rawOutput).toBe(payload);
    expect(result.responseModelId).toBe('test-model-max-reported');
    expect(result.inputTokens).toBe(1234);
    expect(result.outputTokens).toBe(567);
    expect(result.outcomeDetail).toBeNull();
    expect(runner.invocations).toHaveLength(1);
    // No raw provider response body, transcript or session id is exposed.
    expect(Object.keys(result).sort()).toEqual(
      [
        'inputTokens',
        'outcomeDetail',
        'outputTokens',
        'rawOutput',
        'responseModelId',
        'outcome',
      ].sort(),
    );
  });

  it('hands the runner a hermetic invocation: sanitized env, isolation dirs, frozen prompt, schema', async () => {
    const runner = new FakeRunner([okRunResult([])]);
    const parentEnv = validEnv({
      DATABASE_URL_CLASSIFIER: 'postgres://secret',
      GITHUB_TOKEN: 'ghp_secret',
    });
    let seenDuringRun: { config: boolean; cwd: boolean } | null = null;
    const observingRunner: AgentSdkRunner = {
      async run(invocation) {
        seenDuringRun = {
          config: existsSync(invocation.options.env.CLAUDE_CONFIG_DIR!),
          cwd: existsSync(invocation.options.cwd),
        };
        return runner.run(invocation);
      },
    };
    await provider(observingRunner, parentEnv).classify(request());
    const invocation = runner.invocations[0]!;
    // Sanitized: the child env holds the token + isolation + OS basics only.
    expect(invocation.options.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(FAKE_TOKEN);
    expect(JSON.stringify(invocation.options.env)).not.toContain('postgres://secret');
    expect(JSON.stringify(invocation.options.env)).not.toContain('ghp_secret');
    expect(invocation.options.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
    // The isolation directories genuinely existed while the runner ran...
    expect(seenDuringRun).toEqual({ config: true, cwd: true });
    // ...and are genuinely gone afterwards (cleanup on success).
    expect(existsSync(invocation.options.env.CLAUDE_CONFIG_DIR!)).toBe(false);
    expect(existsSync(invocation.options.cwd)).toBe(false);
    // Hermetic options and the one source of prompt truth.
    expect(invocation.options.settingSources).toEqual([]);
    expect(invocation.options.persistSession).toBe(false);
    expect(invocation.options.tools).toEqual([]);
    expect(invocation.options.mcpServers).toEqual({});
    expect(invocation.options.strictMcpConfig).toBe(true);
    expect(invocation.options.systemPrompt).toBe('FROZEN PROMPT');
    expect(invocation.prompt).toBe('{"context":{},"documents":[]}');
    expect(invocation.options.outputFormat).toEqual({
      type: 'json_schema',
      schema: { type: 'array' },
    });
  });
});

describe('ClaudeMaxAgentProvider - pre-flight refusals (zero runner calls)', () => {
  it('missing token -> AUTH_FAILURE, runner never invoked', async () => {
    const runner = new FakeRunner([]);
    const result = await provider(runner, { PATH: 'C:\\bin' }).classify(request());
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(result.outcomeDetail).toContain('MISSING_OAUTH_TOKEN');
    expect(runner.invocations).toHaveLength(0);
  });

  it('every one of the 14 conflicting-auth variables -> AUTH_FAILURE naming the variable, runner never invoked', async () => {
    for (const variable of FORBIDDEN_AUTH_VARIABLES) {
      const runner = new FakeRunner([]);
      const result = await provider(runner, validEnv({ [variable]: 'set' })).classify(request());
      expect(result.outcome).toBe('AUTH_FAILURE');
      expect(result.outcomeDetail).toContain(variable);
      expect(result.outcomeDetail).not.toContain(FAKE_TOKEN);
      expect(runner.invocations).toHaveLength(0);
    }
  });

  it('a model outside the allowlist -> AUTH_FAILURE, runner never invoked', async () => {
    const runner = new FakeRunner([]);
    const result = await provider(runner).classify(request({ modelId: 'not-allowed-model' }));
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(result.outcomeDetail).toContain('MODEL_NOT_ALLOWED');
    expect(runner.invocations).toHaveLength(0);
  });
});

describe('ClaudeMaxAgentProvider - failure mapping (no retry for terminal kinds)', () => {
  it('usage exhaustion -> USAGE_LIMIT_EXHAUSTED, exactly ONE runner invocation, no fallback', async () => {
    const runner = new FakeRunner([
      {
        ...okRunResult(undefined),
        isError: true,
        resultText: `${USAGE_LIMIT_ERROR_PREFIXES[0]!} 5-hour limit`,
        structuredOutput: undefined,
      },
    ]);
    const result = await provider(runner).classify(request());
    expect(result.outcome).toBe('USAGE_LIMIT_EXHAUSTED');
    expect(runner.invocations).toHaveLength(1);
  });

  it('auth failure after pre-flight -> AUTH_FAILURE, exactly ONE runner invocation', async () => {
    const runner = new FakeRunner([new Error('API Error: 401 authentication_error')]);
    const result = await provider(runner).classify(request());
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(runner.invocations).toHaveLength(1);
  });

  it('provider refusal -> PROVIDER_REFUSAL, exactly ONE runner invocation', async () => {
    const runner = new FakeRunner([{ ...okRunResult(undefined), stopReason: 'refusal' }]);
    const result = await provider(runner).classify(request());
    expect(result.outcome).toBe('PROVIDER_REFUSAL');
    expect(runner.invocations).toHaveLength(1);
  });

  it('structured-output failure -> STRUCTURED_OUTPUT_FAILED, ONE invocation, nothing salvaged', async () => {
    const runner = new FakeRunner([
      { ...okRunResult(undefined), resultText: '{"prose": "json"} as text' },
    ]);
    const result = await provider(runner).classify(request());
    expect(result.outcome).toBe('STRUCTURED_OUTPUT_FAILED');
    expect(result.rawOutput).toBeNull();
    expect(runner.invocations).toHaveLength(1);
  });

  it('timeout (AbortError) -> TIMEOUT, exactly ONE runner invocation', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const runner = new FakeRunner([abort]);
    const result = await provider(runner).classify(request());
    expect(result.outcome).toBe('TIMEOUT');
    expect(runner.invocations).toHaveLength(1);
  });
});

describe('ClaudeMaxAgentProvider - bounded transient retry (fake clock, no real sleeps)', () => {
  it('transient -> transient -> success: three invocations, OK', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([
      new Error('read ECONNRESET'),
      new Error('read ECONNRESET'),
      okRunResult([{ doc_index: 0 }]),
    ]);
    const result = await settle(clock, provider(runner, validEnv(), clock).classify(request()));
    expect(result.outcome).toBe('OK');
    expect(runner.invocations).toHaveLength(3);
  });

  it('always-transient: the invocation count is HARD-BOUNDED at 1 + 2 retries, then PROVIDER_TRANSIENT', async () => {
    const clock = createFakeClock();
    const script = Array.from({ length: 10 }, () => new Error('read ECONNRESET'));
    const runner = new FakeRunner(script);
    const result = await settle(clock, provider(runner, validEnv(), clock).classify(request()));
    expect(result.outcome).toBe('PROVIDER_TRANSIENT');
    expect(runner.invocations).toHaveLength(3); // proven maximum
  });

  it('a terminal outcome mid-retry stops the loop immediately (transient -> usage limit)', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([
      new Error('read ECONNRESET'),
      new Error(`${USAGE_LIMIT_ERROR_PREFIXES[0]!} weekly cap`),
    ]);
    const result = await settle(clock, provider(runner, validEnv(), clock).classify(request()));
    expect(result.outcome).toBe('USAGE_LIMIT_EXHAUSTED');
    expect(runner.invocations).toHaveLength(2);
  });
});

describe('ClaudeMaxAgentProvider - isolation lifecycle', () => {
  it('cleans both directories when the runner THROWS', async () => {
    const runner = new FakeRunner([
      new Error('spawn failure - not transient-shaped? still cleaned'),
    ]);
    let dirs: { config: string; cwd: string } | null = null;
    const observing: AgentSdkRunner = {
      async run(invocation) {
        dirs = { config: invocation.options.env.CLAUDE_CONFIG_DIR!, cwd: invocation.options.cwd };
        return runner.run(invocation);
      },
    };
    const clock = createFakeClock();
    const result = await settle(clock, provider(observing, validEnv(), clock).classify(request()));
    expect(result.outcome).toBe('PROVIDER_TRANSIENT'); // unknown throw, mapped - classify never throws
    expect(dirs).not.toBeNull();
    expect(existsSync(dirs!.config)).toBe(false);
    expect(existsSync(dirs!.cwd)).toBe(false);
  });

  it('two concurrent classify() calls use disjoint config/scratch dirs and both are cleaned', async () => {
    const seen: { config: string; cwd: string }[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    const blockingRunner: AgentSdkRunner = {
      async run(invocation) {
        seen.push({
          config: invocation.options.env.CLAUDE_CONFIG_DIR!,
          cwd: invocation.options.cwd,
        });
        if (seen.length < 2) await gate;
        else release();
        return okRunResult([]);
      },
    };
    const p = provider(blockingRunner);
    const [a, b] = await Promise.all([p.classify(request()), p.classify(request())]);
    expect(a.outcome).toBe('OK');
    expect(b.outcome).toBe('OK');
    expect(seen).toHaveLength(2);
    expect(seen[0]!.config).not.toBe(seen[1]!.config);
    expect(seen[0]!.cwd).not.toBe(seen[1]!.cwd);
    for (const d of seen) {
      expect(existsSync(d.config)).toBe(false);
      expect(existsSync(d.cwd)).toBe(false);
    }
  });
});

describe('ClaudeMaxAgentProvider - secret hygiene', () => {
  it('the fake token never appears in any serialized outcome, on any failure path', async () => {
    const clock = createFakeClock();
    const scripts: (AgentSdkRunResult | Error)[][] = [
      [new Error('read ECONNRESET'), new Error('read ECONNRESET'), new Error('read ECONNRESET')],
      [
        {
          ...okRunResult(undefined),
          isError: true,
          resultText: `${USAGE_LIMIT_ERROR_PREFIXES[0]!} cap`,
        },
      ],
      [new Error('401 authentication_error')],
      [{ ...okRunResult(undefined), resultText: 'no structured output' }],
      [Object.assign(new Error('aborted'), { name: 'AbortError' })],
    ];
    for (const script of scripts) {
      const runner = new FakeRunner(script);
      const result = await settle(clock, provider(runner, validEnv(), clock).classify(request()));
      expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
    }
    // Pre-flight failure path too.
    const refused = await provider(
      new FakeRunner([]),
      validEnv({ ANTHROPIC_PROFILE: 'x' }),
    ).classify(request());
    expect(JSON.stringify(refused)).not.toContain(FAKE_TOKEN);
  });

  it('scrubs the token to [REDACTED] even if a provider error somehow embeds it', async () => {
    const runner = new FakeRunner([new Error(`401 authentication_error for bearer ${FAKE_TOKEN}`)]);
    const result = await provider(runner).classify(request());
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
  });

  it('the token reaches the runner ONLY inside the child env variable, never the prompt or system prompt', async () => {
    const runner = new FakeRunner([okRunResult([])]);
    await provider(runner).classify(request());
    const invocation = runner.invocations[0]!;
    expect(invocation.prompt).not.toContain(FAKE_TOKEN);
    expect(invocation.options.systemPrompt).not.toContain(FAKE_TOKEN);
    expect(invocation.options.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(FAKE_TOKEN);
  });
});

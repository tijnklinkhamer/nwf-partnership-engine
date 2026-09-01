/**
 * `ClaudeMaxAgentProvider` against fake `AgentSdkRunner` and
 * `ClassifierAuthStatusRunner` seams: success mapping, every failure
 * mapping, pre-flight refusal with zero runner calls (conflicts, the
 * ADR 0010 setup-token prohibition, profile refusals, hygiene, stored
 * auth-status), bounded transient retry (fake clock, no real sleeps),
 * scratch lifecycle (cleanup on success, failure and throw; the dedicated
 * profile PERSISTS), and secret-leak proofs. ZERO network, ZERO SDK
 * construction, ZERO subprocess, ZERO Claude usage.
 */
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeClock, type FakeClock } from '../../orgunits/orchestrator/clock.js';
import type { ClassifierProviderRequest } from '../../orgunits/classify/providerContract.js';
import { ClaudeMaxAgentProvider } from '../../orgunits/classify/provider/claudeMaxAgentProvider.js';
import {
  FORBIDDEN_AUTH_VARIABLES,
  PROHIBITED_SETUP_TOKEN_VARIABLE,
} from '../../orgunits/classify/provider/authConflicts.js';
import { CLASSIFIER_PROFILE_DIR_VARIABLE } from '../../orgunits/classify/provider/profile.js';
import type {
  AuthStatusInvocation,
  ClassifierAuthStatusRunner,
} from '../../orgunits/classify/provider/authStatusRunner.js';
import type { AuthStatusExecution } from '../../orgunits/classify/provider/authStatus.js';
import {
  USAGE_LIMIT_ERROR_PREFIXES,
  type AgentSdkRunResult,
  type AgentSdkRunner,
} from '../../orgunits/classify/provider/agentSdkRunner.js';
import type { AgentSdkInvocation } from '../../orgunits/classify/provider/sdkOptions.js';

const FAKE_TOKEN = 'test-oauth-secret-do-not-log';
const MODEL = 'test-model-max';
const ALLOWED = [MODEL];
const REPO_ROOT = join(tmpdir(), 'nwf-pe-test-repo-root');

const GOOD_AUTH_REPORT = JSON.stringify({
  loggedIn: true,
  authMethod: 'claude.ai',
  apiProvider: 'firstParty',
  subscriptionType: 'max',
  email: 'owner-mailbox@example.org',
  orgId: 'org-identity-value',
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

function envFor(profileDir: string, extra: Record<string, string> = {}) {
  return {
    [CLASSIFIER_PROFILE_DIR_VARIABLE]: profileDir,
    PATH: 'C:\\bin',
    ...extra,
  } as Record<string, string | undefined>;
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

/** A fake SDK runner that records invocations and answers from a script. */
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

/** A fake auth-status runner: records invocations, answers a scripted report. */
class FakeAuthStatusRunner implements ClassifierAuthStatusRunner {
  readonly invocations: AuthStatusInvocation[] = [];
  readonly #execution: AuthStatusExecution | Error;

  constructor(execution: AuthStatusExecution | Error = { exitCode: 0, stdout: GOOD_AUTH_REPORT }) {
    this.#execution = execution;
  }

  async run(invocation: AuthStatusInvocation): Promise<AuthStatusExecution> {
    this.invocations.push(invocation);
    if (this.#execution instanceof Error) throw this.#execution;
    return this.#execution;
  }
}

function provider(options: {
  runner: AgentSdkRunner;
  env: Record<string, string | undefined>;
  authStatusRunner?: ClassifierAuthStatusRunner;
  clock?: FakeClock;
}): ClaudeMaxAgentProvider {
  return new ClaudeMaxAgentProvider({
    runner: options.runner,
    authStatusRunner: options.authStatusRunner ?? new FakeAuthStatusRunner(),
    env: () => options.env,
    repoRoot: REPO_ROOT,
    allowedModels: ALLOWED,
    ...(options.clock !== undefined ? { clock: options.clock } : {}),
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
  // work (scratch dirs) between clock sleeps, so a microtask-only pump
  // would spin to exhaustion before the first backoff sleep is even armed.
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
    const profileDir = await provisionedProfile();
    const result = await provider({ runner, env: envFor(profileDir) }).classify(request());
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

  it('hands the runner a hermetic invocation: sanitized env, dedicated profile, scratch cwd, frozen prompt, schema', async () => {
    const runner = new FakeRunner([okRunResult([])]);
    const profileDir = await provisionedProfile();
    const parentEnv = envFor(profileDir, {
      DATABASE_URL_CLASSIFIER: 'postgres://secret',
      GITHUB_TOKEN: 'ghp_secret',
    });
    let cwdExistedDuringRun: boolean | null = null;
    const observingRunner: AgentSdkRunner = {
      async run(invocation) {
        cwdExistedDuringRun = existsSync(invocation.options.cwd);
        return runner.run(invocation);
      },
    };
    const authStatusRunner = new FakeAuthStatusRunner();
    await provider({ runner: observingRunner, env: parentEnv, authStatusRunner }).classify(
      request(),
    );
    const invocation = runner.invocations[0]!;
    // Sanitized: the child env holds the profile pointer + isolation + OS basics only.
    expect(invocation.options.env.CLAUDE_CONFIG_DIR).toBe(profileDir);
    expect(Object.keys(invocation.options.env)).not.toContain(PROHIBITED_SETUP_TOKEN_VARIABLE);
    expect(JSON.stringify(invocation.options.env)).not.toContain('postgres://secret');
    expect(JSON.stringify(invocation.options.env)).not.toContain('ghp_secret');
    expect(invocation.options.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
    // The auth-status check ran FIRST, under the SAME child env.
    expect(authStatusRunner.invocations).toHaveLength(1);
    expect(authStatusRunner.invocations[0]!.env).toEqual(invocation.options.env);
    // The scratch cwd genuinely existed while the runner ran...
    expect(cwdExistedDuringRun).toBe(true);
    // ...and is genuinely gone afterwards (cleanup on success) - while the
    // dedicated PROFILE persists (Claude-owned auth state, never deleted).
    expect(existsSync(invocation.options.cwd)).toBe(false);
    expect(existsSync(profileDir)).toBe(true);
    expect(existsSync(join(profileDir, '.credentials.json'))).toBe(true);
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
  it('the prohibited setup-token variable -> AUTH_FAILURE, neither runner invoked, value never echoed', async () => {
    const runner = new FakeRunner([]);
    const authStatusRunner = new FakeAuthStatusRunner();
    const profileDir = await provisionedProfile();
    const result = await provider({
      runner,
      env: envFor(profileDir, { [PROHIBITED_SETUP_TOKEN_VARIABLE]: FAKE_TOKEN }),
      authStatusRunner,
    }).classify(request());
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(result.outcomeDetail).toContain('SETUP_TOKEN_PRESENT');
    expect(result.outcomeDetail).not.toContain(FAKE_TOKEN);
    expect(runner.invocations).toHaveLength(0);
    expect(authStatusRunner.invocations).toHaveLength(0);
  });

  it('every one of the 14 conflicting-auth variables -> AUTH_FAILURE naming the variable, neither runner invoked', async () => {
    const profileDir = await provisionedProfile();
    for (const variable of FORBIDDEN_AUTH_VARIABLES) {
      const runner = new FakeRunner([]);
      const authStatusRunner = new FakeAuthStatusRunner();
      const result = await provider({
        runner,
        env: envFor(profileDir, { [variable]: 'set' }),
        authStatusRunner,
      }).classify(request());
      expect(result.outcome).toBe('AUTH_FAILURE');
      expect(result.outcomeDetail).toContain(variable);
      expect(runner.invocations).toHaveLength(0);
      expect(authStatusRunner.invocations).toHaveLength(0);
    }
  });

  it('an unresolvable profile (no override, no home) -> AUTH_FAILURE, zero runner calls', async () => {
    const runner = new FakeRunner([]);
    const result = await provider({ runner, env: { PATH: 'C:\\bin' } }).classify(request());
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(result.outcomeDetail).toContain('PROFILE_DIR_UNRESOLVED');
    expect(runner.invocations).toHaveLength(0);
  });

  it('a profile inside the repository root -> AUTH_FAILURE, zero runner calls', async () => {
    const runner = new FakeRunner([]);
    const result = await provider({
      runner,
      env: envFor(join(REPO_ROOT, 'profile')),
    }).classify(request());
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(result.outcomeDetail).toContain('PROFILE_DIR_FORBIDDEN');
    expect(runner.invocations).toHaveLength(0);
  });

  it("the user's ordinary <home>/.claude profile -> AUTH_FAILURE, zero runner calls", async () => {
    const home = join(tmpdir(), 'nwf-pe-test-home');
    const runner = new FakeRunner([]);
    const result = await provider({
      runner,
      env: {
        USERPROFILE: home,
        [CLASSIFIER_PROFILE_DIR_VARIABLE]: join(home, '.claude'),
      },
    }).classify(request());
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(result.outcomeDetail).toContain('PROFILE_DIR_FORBIDDEN');
    expect(runner.invocations).toHaveLength(0);
  });

  it('an unprovisioned (missing) profile directory -> AUTH_FAILURE with the /login remedy, zero runner calls', async () => {
    const runner = new FakeRunner([]);
    const authStatusRunner = new FakeAuthStatusRunner();
    const result = await provider({
      runner,
      env: envFor(join(tmpdir(), 'nwf-pe-test-never-provisioned')),
      authStatusRunner,
    }).classify(request());
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(result.outcomeDetail).toContain('PROFILE_NOT_PROVISIONED');
    expect(result.outcomeDetail).toContain('/login');
    expect(runner.invocations).toHaveLength(0);
    expect(authStatusRunner.invocations).toHaveLength(0);
  });

  it('a profile carrying a semantic surface (CLAUDE.md) -> AUTH_FAILURE naming it, zero runner calls', async () => {
    const profileDir = await provisionedProfile();
    await writeFile(join(profileDir, 'CLAUDE.md'), '# injected context', 'utf8');
    const runner = new FakeRunner([]);
    const result = await provider({ runner, env: envFor(profileDir) }).classify(request());
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(result.outcomeDetail).toContain('PROFILE_HYGIENE_VIOLATION');
    expect(result.outcomeDetail).toContain('CLAUDE.md');
    expect(runner.invocations).toHaveLength(0);
  });

  it('a model outside the allowlist -> AUTH_FAILURE, zero runner calls', async () => {
    const runner = new FakeRunner([]);
    const profileDir = await provisionedProfile();
    const result = await provider({ runner, env: envFor(profileDir) }).classify(
      request({ modelId: 'not-allowed-model' }),
    );
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(result.outcomeDetail).toContain('MODEL_NOT_ALLOWED');
    expect(runner.invocations).toHaveLength(0);
  });
});

describe('ClaudeMaxAgentProvider - stored-login (auth-status) refusals', () => {
  async function refusedBy(
    authStatusRunner: ClassifierAuthStatusRunner,
  ): Promise<{ detail: string; sdkCalls: number }> {
    const runner = new FakeRunner([]);
    const profileDir = await provisionedProfile();
    const result = await provider({ runner, env: envFor(profileDir), authStatusRunner }).classify(
      request(),
    );
    expect(result.outcome).toBe('AUTH_FAILURE');
    return { detail: result.outcomeDetail ?? '', sdkCalls: runner.invocations.length };
  }

  it('a logged-out profile refuses with NOT_LOGGED_IN and zero SDK calls', async () => {
    const { detail, sdkCalls } = await refusedBy(
      new FakeAuthStatusRunner({
        exitCode: 0,
        stdout: JSON.stringify({ loggedIn: false }),
      }),
    );
    expect(detail).toContain('NOT_LOGGED_IN');
    expect(sdkCalls).toBe(0);
  });

  it('the setup-token auth method (oauth_token) refuses with WRONG_AUTH_METHOD', async () => {
    const { detail, sdkCalls } = await refusedBy(
      new FakeAuthStatusRunner({
        exitCode: 0,
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'oauth_token',
          apiProvider: 'firstParty',
        }),
      }),
    );
    expect(detail).toContain('WRONG_AUTH_METHOD');
    expect(sdkCalls).toBe(0);
  });

  it('a non-firstParty provider refuses with WRONG_API_PROVIDER', async () => {
    const { detail, sdkCalls } = await refusedBy(
      new FakeAuthStatusRunner({
        exitCode: 0,
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'claude.ai',
          apiProvider: 'elsewhere',
        }),
      }),
    );
    expect(detail).toContain('WRONG_API_PROVIDER');
    expect(sdkCalls).toBe(0);
  });

  it('a reported non-max subscription refuses with WRONG_SUBSCRIPTION_TYPE', async () => {
    const { detail, sdkCalls } = await refusedBy(
      new FakeAuthStatusRunner({
        exitCode: 0,
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'claude.ai',
          apiProvider: 'firstParty',
          subscriptionType: 'pro',
        }),
      }),
    );
    expect(detail).toContain('WRONG_SUBSCRIPTION_TYPE');
    expect(sdkCalls).toBe(0);
  });

  it('unparseable auth-status output refuses without echoing the output', async () => {
    const { detail, sdkCalls } = await refusedBy(
      new FakeAuthStatusRunner({ exitCode: 1, stdout: 'boom owner-mailbox@example.org' }),
    );
    expect(detail).toContain('AUTH_STATUS_UNPARSEABLE');
    expect(detail).not.toContain('owner-mailbox@example.org');
    expect(sdkCalls).toBe(0);
  });

  it('an auth-status runner failure refuses with AUTH_STATUS_UNAVAILABLE and zero SDK calls', async () => {
    const { detail, sdkCalls } = await refusedBy(
      new FakeAuthStatusRunner(new Error('auth-status execution failed before producing a report')),
    );
    expect(detail).toContain('AUTH_STATUS_UNAVAILABLE');
    expect(sdkCalls).toBe(0);
  });

  it('identity fields from the report never reach any outcome detail', async () => {
    const runner = new FakeRunner([okRunResult([])]);
    const profileDir = await provisionedProfile();
    const result = await provider({ runner, env: envFor(profileDir) }).classify(request());
    expect(JSON.stringify(result)).not.toContain('owner-mailbox@example.org');
    expect(JSON.stringify(result)).not.toContain('org-identity-value');
  });
});

describe('ClaudeMaxAgentProvider - failure mapping (no retry for terminal kinds)', () => {
  async function classifyWith(script: readonly (AgentSdkRunResult | Error)[]) {
    const runner = new FakeRunner(script);
    const profileDir = await provisionedProfile();
    const result = await provider({ runner, env: envFor(profileDir) }).classify(request());
    return { result, runner };
  }

  it('usage exhaustion -> USAGE_LIMIT_EXHAUSTED, exactly ONE runner invocation, no fallback', async () => {
    const { result, runner } = await classifyWith([
      {
        ...okRunResult(undefined),
        isError: true,
        resultText: `${USAGE_LIMIT_ERROR_PREFIXES[0]!} 5-hour limit`,
        structuredOutput: undefined,
      },
    ]);
    expect(result.outcome).toBe('USAGE_LIMIT_EXHAUSTED');
    expect(runner.invocations).toHaveLength(1);
  });

  it('auth failure after pre-flight -> AUTH_FAILURE, exactly ONE runner invocation', async () => {
    const { result, runner } = await classifyWith([
      new Error('API Error: 401 authentication_error'),
    ]);
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(runner.invocations).toHaveLength(1);
  });

  it('provider refusal -> PROVIDER_REFUSAL, exactly ONE runner invocation', async () => {
    const { result, runner } = await classifyWith([
      { ...okRunResult(undefined), stopReason: 'refusal' },
    ]);
    expect(result.outcome).toBe('PROVIDER_REFUSAL');
    expect(runner.invocations).toHaveLength(1);
  });

  it('structured-output failure -> STRUCTURED_OUTPUT_FAILED, ONE invocation, nothing salvaged', async () => {
    const { result, runner } = await classifyWith([
      { ...okRunResult(undefined), resultText: '{"prose": "json"} as text' },
    ]);
    expect(result.outcome).toBe('STRUCTURED_OUTPUT_FAILED');
    expect(result.rawOutput).toBeNull();
    expect(runner.invocations).toHaveLength(1);
  });

  it('timeout (AbortError) -> TIMEOUT, exactly ONE runner invocation', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const { result, runner } = await classifyWith([abort]);
    expect(result.outcome).toBe('TIMEOUT');
    expect(runner.invocations).toHaveLength(1);
  });

  it('the deterministic 2B-2C3B structured-output/request-schema 400 -> STRUCTURED_OUTPUT_FAILED, exactly ONE runner invocation, no transport retry', async () => {
    const { result, runner } = await classifyWith([
      {
        ...okRunResult(undefined),
        isError: true,
        structuredOutput: undefined,
        resultText:
          'Claude Code returned an error result: API Error: 400\n' +
          "tools.0.custom.input_schema.type: Input should be 'object'",
      },
    ]);
    expect(result.outcome).toBe('STRUCTURED_OUTPUT_FAILED');
    expect(result.rawOutput).toBeNull();
    expect(runner.invocations).toHaveLength(1); // never mistaken for transient, never retried
  });
});

describe('ClaudeMaxAgentProvider - bounded transient retry (fake clock, no real sleeps)', () => {
  it('transient -> transient -> success: three invocations, OK, auth status checked ONCE', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([
      new Error('read ECONNRESET'),
      new Error('read ECONNRESET'),
      okRunResult([{ doc_index: 0 }]),
    ]);
    const authStatusRunner = new FakeAuthStatusRunner();
    const profileDir = await provisionedProfile();
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), authStatusRunner, clock }).classify(request()),
    );
    expect(result.outcome).toBe('OK');
    expect(runner.invocations).toHaveLength(3);
    expect(authStatusRunner.invocations).toHaveLength(1);
  });

  it('always-transient: the invocation count is HARD-BOUNDED at 1 + 2 retries, then PROVIDER_TRANSIENT', async () => {
    const clock = createFakeClock();
    const script = Array.from({ length: 10 }, () => new Error('read ECONNRESET'));
    const runner = new FakeRunner(script);
    const profileDir = await provisionedProfile();
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock }).classify(request()),
    );
    expect(result.outcome).toBe('PROVIDER_TRANSIENT');
    expect(runner.invocations).toHaveLength(3); // proven maximum
  });

  it('a terminal outcome mid-retry stops the loop immediately (transient -> usage limit)', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([
      new Error('read ECONNRESET'),
      new Error(`${USAGE_LIMIT_ERROR_PREFIXES[0]!} weekly cap`),
    ]);
    const profileDir = await provisionedProfile();
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock }).classify(request()),
    );
    expect(result.outcome).toBe('USAGE_LIMIT_EXHAUSTED');
    expect(runner.invocations).toHaveLength(2);
  });
});

describe('ClaudeMaxAgentProvider - isolation lifecycle', () => {
  it('cleans the scratch cwd when the runner THROWS, and the profile persists', async () => {
    const runner = new FakeRunner([
      new Error('spawn failure - not transient-shaped? still cleaned'),
    ]);
    const profileDir = await provisionedProfile();
    let seenCwd: string | null = null;
    const observing: AgentSdkRunner = {
      async run(invocation) {
        seenCwd = invocation.options.cwd;
        return runner.run(invocation);
      },
    };
    const clock = createFakeClock();
    const result = await settle(
      clock,
      provider({ runner: observing, env: envFor(profileDir), clock }).classify(request()),
    );
    expect(result.outcome).toBe('PROVIDER_TRANSIENT'); // unknown throw, mapped - classify never throws
    expect(seenCwd).not.toBeNull();
    expect(existsSync(seenCwd!)).toBe(false);
    expect(existsSync(profileDir)).toBe(true);
  });

  it('the profile also persists across a stored-login refusal', async () => {
    const profileDir = await provisionedProfile();
    const result = await provider({
      runner: new FakeRunner([]),
      env: envFor(profileDir),
      authStatusRunner: new FakeAuthStatusRunner({
        exitCode: 0,
        stdout: JSON.stringify({ loggedIn: false }),
      }),
    }).classify(request());
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(existsSync(profileDir)).toBe(true);
    expect(existsSync(join(profileDir, '.credentials.json'))).toBe(true);
  });

  it('two concurrent classify() calls share the profile but use disjoint scratch dirs, both cleaned', async () => {
    const profileDir = await provisionedProfile();
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
    const p = provider({ runner: blockingRunner, env: envFor(profileDir) });
    const [a, b] = await Promise.all([p.classify(request()), p.classify(request())]);
    expect(a.outcome).toBe('OK');
    expect(b.outcome).toBe('OK');
    expect(seen).toHaveLength(2);
    expect(seen[0]!.config).toBe(profileDir);
    expect(seen[1]!.config).toBe(profileDir);
    expect(seen[0]!.cwd).not.toBe(seen[1]!.cwd);
    for (const d of seen) {
      expect(existsSync(d.cwd)).toBe(false);
    }
    expect(existsSync(profileDir)).toBe(true);
  });
});

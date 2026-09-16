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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakeClock, type FakeClock } from '../../orgunits/orchestrator/clock.js';
import type { ClassifierProviderRequest } from '../../orgunits/classify/providerContract.js';
import { ClaudeMaxAgentProvider } from '../../orgunits/classify/provider/claudeMaxAgentProvider.js';
import { decideRepairBudget, REPAIR_POLICY_ONE_ROUND } from '../../orgunits/classify/repair.js';
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
  AgentSdkTimeoutError,
  CLASSIFIER_CALL_HARD_KILL_GRACE_MS,
  CLASSIFIER_CALL_SOFT_DEADLINE_MS,
  CLASSIFIER_CALL_TOTAL_BUDGET_MS,
  createAgentSdkDiagnosticsCollector,
  runQueryWithLivenessBoundary,
  USAGE_LIMIT_ERROR_PREFIXES,
  type AgentSdkDiagnostics,
  type AgentSdkRunOptions,
  type AgentSdkRunResult,
  type AgentSdkRunner,
  type LivenessBoundedQuery,
} from '../../orgunits/classify/provider/agentSdkRunner.js';
import type { AgentSdkInvocation } from '../../orgunits/classify/provider/sdkOptions.js';
import type {
  ClaudeCodeExecutableResolution,
  ClaudeCodeExecutableResolver,
} from '../../orgunits/classify/provider/claudeCodeExecutable.js';

const FAKE_TOKEN = 'test-oauth-secret-do-not-log';
/** A synthetic ABSOLUTE path standing in for the resolved SDK-bundled native binary. Nothing here is ever spawned. */
const FAKE_EXECUTABLE =
  process.platform === 'win32'
    ? 'C:\\synthetic-root\\node_modules\\synthetic-native\\claude.exe'
    : '/synthetic-root/node_modules/synthetic-native/claude';

/** A fake resolver that answers a fixed resolution and counts its calls. */
function fakeExecutable(
  resolution: ClaudeCodeExecutableResolution = {
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
  },
): ClaudeCodeExecutableResolver & { readonly calls: () => number } {
  let calls = 0;
  const resolver = (): ClaudeCodeExecutableResolution => {
    calls += 1;
    return resolution;
  };
  return Object.assign(resolver, { calls: () => calls });
}
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

/** A fake SDK runner that records invocations (and their runtime options) and answers from a script. */
class FakeRunner implements AgentSdkRunner {
  readonly invocations: AgentSdkInvocation[] = [];
  readonly runOptions: (AgentSdkRunOptions | undefined)[] = [];
  readonly #script: readonly (AgentSdkRunResult | Error | (() => Promise<AgentSdkRunResult>))[];

  constructor(script: readonly (AgentSdkRunResult | Error | (() => Promise<AgentSdkRunResult>))[]) {
    this.#script = script;
  }

  async run(
    invocation: AgentSdkInvocation,
    runOptions?: AgentSdkRunOptions,
  ): Promise<AgentSdkRunResult> {
    const index = this.invocations.length;
    this.invocations.push(invocation);
    this.runOptions.push(runOptions);
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
  claudeCodeExecutable?: ClaudeCodeExecutableResolver;
  clock?: FakeClock;
  onAttemptDiagnostics?: (diagnostics: AgentSdkDiagnostics) => void;
}): ClaudeMaxAgentProvider {
  return new ClaudeMaxAgentProvider({
    runner: options.runner,
    authStatusRunner: options.authStatusRunner ?? new FakeAuthStatusRunner(),
    // Every test injects a fake resolver: no test ever resolves, hashes or
    // names the real SDK-bundled binary through the provider.
    claudeCodeExecutable: options.claudeCodeExecutable ?? fakeExecutable(),
    env: () => options.env,
    repoRoot: REPO_ROOT,
    allowedModels: ALLOWED,
    ...(options.clock !== undefined ? { clock: options.clock } : {}),
    ...(options.onAttemptDiagnostics !== undefined
      ? { onAttemptDiagnostics: options.onAttemptDiagnostics }
      : {}),
  });
}

const SETTLE_STEP_MS = 10;

/**
 * Pumps a fake clock until the promise settles - no real sleeps anywhere.
 *
 * The clock advances ONLY while the provider is actually sleeping, and only
 * in small steps, so fake elapsed time equals the backoff the provider
 * requested. (Before 2D2B-2 this jumped 1,000,000 ms per tick, which was
 * harmless while the clock only paced backoff; now that the provider
 * enforces a total time budget on the same clock, such a jump would read
 * as ~17 minutes elapsed and exhaust the budget mid-retry.)
 */
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
    if (clock.pendingCount > 0) clock.advance(SETTLE_STEP_MS);
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
        // 2D2C-F0Z: the machine-readable reason code. Still no raw provider
        // response body, transcript, stderr tail or session id.
        'outcomeReasonCode',
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
    // The auth-status check ran FIRST, under the SAME child env and the SAME executable.
    expect(authStatusRunner.invocations).toHaveLength(1);
    expect(authStatusRunner.invocations[0]!.env).toEqual(invocation.options.env);
    expect(authStatusRunner.invocations[0]!.executablePath).toBe(FAKE_EXECUTABLE);
    expect(invocation.options.pathToClaudeCodeExecutable).toBe(FAKE_EXECUTABLE);
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

describe('ClaudeMaxAgentProvider - the SDK-bundled executable (ADR 0010 Amendment A)', () => {
  it('resolves ONCE and hands the SAME absolute path to the auth-status preflight and the inference invocation', async () => {
    const runner = new FakeRunner([okRunResult([])]);
    const authStatusRunner = new FakeAuthStatusRunner();
    const claudeCodeExecutable = fakeExecutable();
    const profileDir = await provisionedProfile();
    const result = await provider({
      runner,
      env: envFor(profileDir),
      authStatusRunner,
      claudeCodeExecutable,
    }).classify(request());
    expect(result.outcome).toBe('OK');
    expect(claudeCodeExecutable.calls()).toBe(1);
    const auth = authStatusRunner.invocations[0]!.executablePath;
    const inference = runner.invocations[0]!.options.pathToClaudeCodeExecutable;
    expect(auth).toBe(FAKE_EXECUTABLE);
    expect(inference).toBe(auth);
    // Never a bare command name that PATH would resolve.
    expect(auth).not.toBe('claude');
    expect(auth.includes('/') || auth.includes('\\')).toBe(true);
  });

  it('a resolver refusal -> AUTH_FAILURE naming the kind, neither runner invoked, no scratch directory created', async () => {
    const runner = new FakeRunner([]);
    const authStatusRunner = new FakeAuthStatusRunner();
    const profileDir = await provisionedProfile();
    const result = await provider({
      runner,
      env: envFor(profileDir),
      authStatusRunner,
      claudeCodeExecutable: fakeExecutable({
        ok: false,
        kind: 'NATIVE_PACKAGE_MISSING',
        detail: 'refused: the optional native package is not installed.',
      }),
    }).classify(request());
    expect(result.outcome).toBe('AUTH_FAILURE');
    expect(result.outcomeDetail).toContain('CLAUDE_CODE_EXECUTABLE_NATIVE_PACKAGE_MISSING');
    expect(result.outcomeDetail).toContain('not installed');
    expect(runner.invocations).toHaveLength(0);
    expect(authStatusRunner.invocations).toHaveLength(0);
  });

  it('a resolver that answers a bare command name is refused before any inference: the builder throws, zero runner invocations', async () => {
    const runner = new FakeRunner([okRunResult([])]);
    const authStatusRunner = new FakeAuthStatusRunner();
    const profileDir = await provisionedProfile();
    const bare = fakeExecutable();
    const bareResolution = bare() as Extract<ClaudeCodeExecutableResolution, { ok: true }>;
    await expect(
      provider({
        runner,
        env: envFor(profileDir),
        authStatusRunner,
        claudeCodeExecutable: () => ({
          ok: true,
          provenance: { ...bareResolution.provenance, executablePath: 'claude' },
        }),
      }).classify(request()),
    ).rejects.toThrow(/absolute/);
    expect(runner.invocations).toHaveLength(0);
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

describe('ClaudeMaxAgentProvider - 2D2B-2 liveness boundary and total budget', () => {
  const STDERR_MARKER = 'stderr-diagnostic-marker-never-in-a-result';

  function timeoutError(deadlineMs = CLASSIFIER_CALL_SOFT_DEADLINE_MS): AgentSdkTimeoutError {
    return new AgentSdkTimeoutError(deadlineMs, {
      progress: [
        { stage: 'QUERY_STARTED', elapsedMs: 0 },
        { stage: 'FIRST_STREAM_ACTIVITY', elapsedMs: 1_200 },
        { stage: 'DEADLINE_EXPIRED', elapsedMs: deadlineMs },
        { stage: 'ABORT_SIGNALLED', elapsedMs: deadlineMs },
        { stage: 'CLOSE_CALLED', elapsedMs: deadlineMs },
        { stage: 'GRACE_EXPIRED', elapsedMs: deadlineMs + 10_000 },
      ],
      stderrTail: STDERR_MARKER,
      pid: null,
    });
  }

  let savedVerbose: string | undefined;
  beforeEach(() => {
    savedVerbose = process.env.NWF_PE_VERBOSE;
    delete process.env.NWF_PE_VERBOSE;
  });
  afterEach(() => {
    if (savedVerbose !== undefined) process.env.NWF_PE_VERBOSE = savedVerbose;
  });

  it('a liveness TIMEOUT is terminal: exactly ONE runner call, no retry, fixed detail with no diagnostics in it', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([timeoutError(), okRunResult([])]);
    const profileDir = await provisionedProfile();
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock }).classify(request()),
    );
    expect(result.outcome).toBe('TIMEOUT');
    expect(runner.invocations).toHaveLength(1);
    expect(result.rawOutput).toBeNull();
    expect(result.outcomeDetail).toMatch(/liveness deadline/);
    expect(result.outcomeDetail).not.toContain(STDERR_MARKER);
  });

  it('the first attempt receives the frozen soft deadline as its runtime deadline', async () => {
    const runner = new FakeRunner([okRunResult([])]);
    const profileDir = await provisionedProfile();
    await provider({ runner, env: envFor(profileDir) }).classify(request());
    expect(runner.runOptions).toEqual([{ deadlineMs: CLASSIFIER_CALL_SOFT_DEADLINE_MS }]);
    // The runtime deadline is never smuggled into the semantic invocation.
    expect(JSON.stringify(runner.invocations[0])).not.toContain('deadline');
  });

  it('transient failures still retry at most twice, and every attempt stays inside the budget', async () => {
    const clock = createFakeClock();
    const script = Array.from({ length: 10 }, () => new Error('read ECONNRESET'));
    const runner = new FakeRunner(script);
    const profileDir = await provisionedProfile();
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock }).classify(request()),
    );
    expect(result.outcome).toBe('PROVIDER_TRANSIENT');
    expect(runner.invocations).toHaveLength(3);
    for (const options of runner.runOptions) {
      expect(options!.deadlineMs).toBe(CLASSIFIER_CALL_SOFT_DEADLINE_MS);
    }
  });

  it('a smaller REMAINING budget becomes the next attempt deadline (the window is never reset per retry)', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([
      async () => {
        clock.advance(450_000); // attempt 1 ran for 450 s, then failed transiently
        throw new Error('read ECONNRESET');
      },
      okRunResult([]),
    ]);
    const profileDir = await provisionedProfile();
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock }).classify(request()),
    );
    expect(result.outcome).toBe('OK');
    expect(runner.runOptions.map((o) => o!.deadlineMs)).toEqual([
      CLASSIFIER_CALL_SOFT_DEADLINE_MS,
      // 600 s budget - 450 s attempt - 0.5 s backoff
      CLASSIFIER_CALL_TOTAL_BUDGET_MS - 450_000 - 500,
    ]);
  });

  it('an exhausted total budget yields TIMEOUT with ZERO further runner calls', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([
      async () => {
        clock.advance(CLASSIFIER_CALL_TOTAL_BUDGET_MS);
        throw new Error('read ECONNRESET');
      },
      okRunResult([]),
    ]);
    const profileDir = await provisionedProfile();
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock }).classify(request()),
    );
    expect(result.outcome).toBe('TIMEOUT');
    expect(result.outcomeDetail).toMatch(/total time budget was exhausted/);
    expect(runner.invocations).toHaveLength(1); // the retry never started
  });

  it('retry BACKOFF consumes the same budget, and no attempt starts once it is spent', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([
      async () => {
        clock.advance(599_000); // leaves 1,000 ms
        throw new Error('read ECONNRESET');
      },
      async () => {
        clock.advance(500); // the 500 ms backoff left exactly 500 ms; this spends it
        throw new Error('read ECONNRESET');
      },
      okRunResult([]),
    ]);
    const profileDir = await provisionedProfile();
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock }).classify(request()),
    );
    expect(result.outcome).toBe('TIMEOUT');
    // Attempt 2 got only what the first backoff left; attempt 3 (after the
    // 1,000 ms backoff) never began, although one retry was still allowed.
    expect(runner.runOptions.map((o) => o!.deadlineMs)).toEqual([
      CLASSIFIER_CALL_SOFT_DEADLINE_MS,
      500,
    ]);
    expect(runner.invocations).toHaveLength(2);
  });

  it('cleans the scratch cwd after a TIMEOUT, and the profile persists', async () => {
    const runner = new FakeRunner([timeoutError()]);
    const profileDir = await provisionedProfile();
    let seenCwd: string | null = null;
    const observing: AgentSdkRunner = {
      async run(invocation, runOptions) {
        seenCwd = invocation.options.cwd;
        expect(existsSync(seenCwd)).toBe(true);
        return runner.run(invocation, runOptions);
      },
    };
    const result = await provider({ runner: observing, env: envFor(profileDir) }).classify(
      request(),
    );
    expect(result.outcome).toBe('TIMEOUT');
    expect(existsSync(seenCwd!)).toBe(false);
    expect(existsSync(profileDir)).toBe(true);
  });

  it('onAttemptDiagnostics receives the EXACT immutable diagnostics object, with NWF_PE_VERBOSE unset', async () => {
    expect(process.env.NWF_PE_VERBOSE).toBeUndefined();
    const error = timeoutError();
    const received: AgentSdkDiagnostics[] = [];
    const runner = new FakeRunner([error]);
    const profileDir = await provisionedProfile();
    const result = await provider({
      runner,
      env: envFor(profileDir),
      onAttemptDiagnostics: (diagnostics) => received.push(diagnostics),
    }).classify(request());
    expect(result.outcome).toBe('TIMEOUT');
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(error.diagnostics);
    expect(Object.isFrozen(received[0])).toBe(true);
    expect(Object.isFrozen(received[0]!.progress)).toBe(true);
    expect(received[0]!.stderrTail).toBe(STDERR_MARKER);
  });

  it('the hook is not called for a non-timeout failure, and a THROWING hook cannot change the outcome', async () => {
    const quiet: AgentSdkDiagnostics[] = [];
    const profileDir = await provisionedProfile();
    const auth = await provider({
      runner: new FakeRunner([new Error('API Error: 401 authentication_error')]),
      env: envFor(profileDir),
      onAttemptDiagnostics: (diagnostics) => quiet.push(diagnostics),
    }).classify(request());
    expect(auth.outcome).toBe('AUTH_FAILURE');
    expect(quiet).toHaveLength(0);

    const runner = new FakeRunner([timeoutError()]);
    const result = await provider({
      runner,
      env: envFor(profileDir),
      onAttemptDiagnostics: () => {
        throw new Error('a broken capture hook');
      },
    }).classify(request());
    expect(result.outcome).toBe('TIMEOUT');
    expect(runner.invocations).toHaveLength(1);
  });

  it('the ordinary provider result carries NO diagnostics: same seven keys, no stderr, no trace', async () => {
    const runner = new FakeRunner([timeoutError()]);
    const profileDir = await provisionedProfile();
    const result = await provider({ runner, env: envFor(profileDir) }).classify(request());
    expect(Object.keys(result).sort()).toEqual(
      [
        'inputTokens',
        'outcomeDetail',
        // 2D2C-F0Z: the machine-readable reason code. Still no raw provider
        // response body, transcript, stderr tail or session id.
        'outcomeReasonCode',
        'outputTokens',
        'rawOutput',
        'responseModelId',
        'outcome',
      ].sort(),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(STDERR_MARKER);
    expect(serialized).not.toContain('DEADLINE_EXPIRED');
    expect(serialized).not.toContain('stderrTail');
    expect(result.inputTokens).toBeNull(); // no runner result ever supplied usage
    expect(result.outputTokens).toBeNull();
  });

  it('END TO END: the real liveness boundary over a never-yielding query -> provider TIMEOUT, abort + close observed, hook fed, scratch cleaned', async () => {
    let closeCalls = 0;
    let abortSeen = false;
    let seenCwd: string | null = null;
    const neverYielding: LivenessBoundedQuery = {
      [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
      close: () => {
        closeCalls += 1;
      },
    };
    // A test runner composing the REAL boundary with a short real-timer
    // deadline (the provider asks for up to 300 s; the fake shortens it so
    // the test does not wait). No SDK, no subprocess.
    const composedRunner: AgentSdkRunner = {
      async run(invocation, runOptions) {
        seenCwd = invocation.options.cwd;
        expect(runOptions?.deadlineMs).toBe(CLASSIFIER_CALL_SOFT_DEADLINE_MS);
        const abortController = new AbortController();
        abortController.signal.addEventListener('abort', () => {
          abortSeen = true;
        });
        return runQueryWithLivenessBoundary(neverYielding, {
          deadlineMs: Math.min(runOptions?.deadlineMs ?? Infinity, 25),
          graceMs: 25,
          abortController,
          diagnostics: createAgentSdkDiagnosticsCollector(),
        });
      },
    };
    const received: AgentSdkDiagnostics[] = [];
    const profileDir = await provisionedProfile();
    const result = await provider({
      runner: composedRunner,
      env: envFor(profileDir),
      onAttemptDiagnostics: (diagnostics) => received.push(diagnostics),
    }).classify(request());

    expect(result.outcome).toBe('TIMEOUT');
    expect(abortSeen).toBe(true);
    expect(closeCalls).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0]!.progress.map((e) => e.stage)).toEqual([
      'QUERY_STARTED',
      'DEADLINE_EXPIRED',
      'ABORT_SIGNALLED',
      'CLOSE_CALLED',
      'GRACE_EXPIRED',
    ]);
    expect(received[0]!.pid).toBeNull();
    expect(existsSync(seenCwd!)).toBe(false);
  });
});

describe('ClaudeMaxAgentProvider - ADR 0011 caller-supplied total window (a repair spends only what remains)', () => {
  it('absent: the frozen window applies, opened before the first runner attempt, exactly as before', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([okRunResult([])]);
    const profileDir = await provisionedProfile();
    // Pre-flight and auth-status work happens before the frozen window opens.
    const auth = new FakeAuthStatusRunner();
    const countingAuth: ClassifierAuthStatusRunner = {
      async run(invocation) {
        clock.advance(50_000);
        return auth.run(invocation);
      },
    };
    await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock, authStatusRunner: countingAuth }).classify(
        request(),
      ),
    );
    expect(runner.runOptions).toEqual([{ deadlineMs: CLASSIFIER_CALL_SOFT_DEADLINE_MS }]);
  });

  it('present: the window opens at classify() ENTRY, so auth-status time is spent from it', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([okRunResult([])]);
    const profileDir = await provisionedProfile();
    const auth = new FakeAuthStatusRunner();
    const countingAuth: ClassifierAuthStatusRunner = {
      async run(invocation) {
        clock.advance(50_000);
        return auth.run(invocation);
      },
    };
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock, authStatusRunner: countingAuth }).classify(
        request({ totalBudgetMs: 200_000 }),
      ),
    );
    expect(result.outcome).toBe('OK');
    // 200 s window - 50 s auth status = 150 s left, below the 300 s soft deadline.
    expect(runner.runOptions).toEqual([{ deadlineMs: 150_000 }]);
  });

  it('present: never wider than the frozen total, whatever the caller asks', async () => {
    const runner = new FakeRunner([okRunResult([])]);
    const profileDir = await provisionedProfile();
    await provider({ runner, env: envFor(profileDir) }).classify(
      request({ totalBudgetMs: CLASSIFIER_CALL_TOTAL_BUDGET_MS * 10 }),
    );
    expect(runner.runOptions).toEqual([{ deadlineMs: CLASSIFIER_CALL_SOFT_DEADLINE_MS }]);
  });

  it('present and spent before any attempt: terminal TIMEOUT with ZERO runner calls', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([okRunResult([])]);
    const profileDir = await provisionedProfile();
    const auth = new FakeAuthStatusRunner();
    const slowAuth: ClassifierAuthStatusRunner = {
      async run(invocation) {
        clock.advance(30_000);
        return auth.run(invocation);
      },
    };
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock, authStatusRunner: slowAuth }).classify(
        request({ totalBudgetMs: 20_000 }),
      ),
    );
    expect(result.outcome).toBe('TIMEOUT');
    expect(result.outcomeDetail).toMatch(/total time budget was exhausted/);
    expect(runner.invocations).toHaveLength(0);
  });

  it('a malformed window (negative, NaN) is treated as ZERO - a bound, never "no bound"', async () => {
    for (const totalBudgetMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const runner = new FakeRunner([okRunResult([])]);
      const profileDir = await provisionedProfile();
      const result = await provider({ runner, env: envFor(profileDir) }).classify(
        request({ totalBudgetMs }),
      );
      expect(result.outcome, String(totalBudgetMs)).toBe('TIMEOUT');
      expect(runner.invocations, String(totalBudgetMs)).toHaveLength(0);
    }
  });

  it('transient retries inside a caller window stay inside it', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([
      async () => {
        clock.advance(100_000);
        throw new Error('read ECONNRESET');
      },
      okRunResult([]),
    ]);
    const profileDir = await provisionedProfile();
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock }).classify(
        request({ totalBudgetMs: 250_000 }),
      ),
    );
    expect(result.outcome).toBe('OK');
    // 250 s - 100 s attempt - 0.5 s backoff = 149.5 s for the retry.
    expect(runner.runOptions.map((o) => o!.deadlineMs)).toEqual([250_000, 149_500]);
  });

  it('the window never reaches the semantic invocation', async () => {
    const runner = new FakeRunner([okRunResult([])]);
    const profileDir = await provisionedProfile();
    await provider({ runner, env: envFor(profileDir) }).classify(
      request({ totalBudgetMs: 123_456 }),
    );
    expect(JSON.stringify(runner.invocations[0])).not.toContain('123456');
    expect(JSON.stringify(runner.invocations[0])).not.toContain('totalBudget');
  });
});

describe('ClaudeMaxAgentProvider - a repair attempt can never receive more than the frozen soft deadline (F0C deadline formula, through the real adapter)', () => {
  it('a large repair window (remaining - grace = 590 s) still yields a 300 s first-attempt deadline', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([okRunResult([])]);
    const profileDir = await provisionedProfile();
    const budget = decideRepairBudget({ elapsedMs: 0, policy: REPAIR_POLICY_ONE_ROUND });
    if (budget.kind !== 'PROCEED') throw new Error('unreachable');
    expect(budget.windowMs).toBe(
      CLASSIFIER_CALL_TOTAL_BUDGET_MS - CLASSIFIER_CALL_HARD_KILL_GRACE_MS,
    );
    await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock }).classify(
        request({ totalBudgetMs: budget.windowMs }),
      ),
    );
    expect(runner.runOptions.map((o) => o!.deadlineMs)).toEqual([CLASSIFIER_CALL_SOFT_DEADLINE_MS]);
    expect(budget.firstAttemptDeadlineMs).toBe(CLASSIFIER_CALL_SOFT_DEADLINE_MS);
  });

  it('a small repair window yields exactly min(300 s, remaining - grace - auth-status time)', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([okRunResult([])]);
    const profileDir = await provisionedProfile();
    const auth = new FakeAuthStatusRunner();
    const slowAuth: ClassifierAuthStatusRunner = {
      async run(invocation) {
        clock.advance(20_000);
        return auth.run(invocation);
      },
    };
    // 460 s elapsed: remaining 140 s, usable (window) 130 s - above the 120 s floor.
    const budget = decideRepairBudget({ elapsedMs: 460_000, policy: REPAIR_POLICY_ONE_ROUND });
    if (budget.kind !== 'PROCEED') throw new Error('unreachable');
    expect(budget.windowMs).toBe(130_000);
    await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock, authStatusRunner: slowAuth }).classify(
        request({ totalBudgetMs: budget.windowMs }),
      ),
    );
    // 130 s window - 20 s auth status = 110 s, below the 300 s soft deadline.
    expect(runner.runOptions.map((o) => o!.deadlineMs)).toEqual([110_000]);
  });

  it('at the 120 s floor with an auth-status check at its 60 s upper bound, the runner still receives a 60 s deadline; one ms less usable is a SKIP before any request', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([okRunResult([])]);
    const profileDir = await provisionedProfile();
    const auth = new FakeAuthStatusRunner();
    const maxAuth: ClassifierAuthStatusRunner = {
      async run(invocation) {
        clock.advance(60_000);
        return auth.run(invocation);
      },
    };
    // 470 s elapsed: remaining 130 s, usable 120 s = exactly the floor -> PROCEED.
    const budget = decideRepairBudget({ elapsedMs: 470_000, policy: REPAIR_POLICY_ONE_ROUND });
    expect(budget.kind).toBe('PROCEED');
    if (budget.kind !== 'PROCEED') throw new Error('unreachable');
    expect(budget.windowMs).toBe(120_000);
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock, authStatusRunner: maxAuth }).classify(
        request({ totalBudgetMs: budget.windowMs }),
      ),
    );
    expect(result.outcome).toBe('OK');
    // 120 s window - 60 s worst-case auth status = 60 s of runner window remain.
    expect(runner.runOptions.map((o) => o!.deadlineMs)).toEqual([60_000]);
    // One millisecond less usable is a SKIP before any request is opened.
    expect(decideRepairBudget({ elapsedMs: 470_001, policy: REPAIR_POLICY_ONE_ROUND }).kind).toBe(
      'SKIP',
    );
  });

  it('the rejected 60 s floor, kept as a regression witness: a 60 s window fully spent by a worst-case auth-status check is a terminal TIMEOUT with ZERO runner calls', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([okRunResult([])]);
    const profileDir = await provisionedProfile();
    const auth = new FakeAuthStatusRunner();
    const maxAuth: ClassifierAuthStatusRunner = {
      async run(invocation) {
        clock.advance(60_000);
        return auth.run(invocation);
      },
    };
    // 60 s usable is now BELOW the 120 s floor: the budget decision itself skips.
    expect(decideRepairBudget({ elapsedMs: 530_000, policy: REPAIR_POLICY_ONE_ROUND }).kind).toBe(
      'SKIP',
    );
    // Had a 60 s window been opened anyway, the adapter would have had nothing left after auth status.
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock, authStatusRunner: maxAuth }).classify(
        request({ totalBudgetMs: 60_000 }),
      ),
    );
    expect(result.outcome).toBe('TIMEOUT');
    expect(runner.invocations).toHaveLength(0);
  });

  it('the general rule: auth-status time, an earlier runner attempt AND its retry backoff all reduce the deadline of the next attempt', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([
      async () => {
        clock.advance(100_000); // attempt 1 ran for 100 s, then failed transiently
        throw new Error('read ECONNRESET');
      },
      okRunResult([]),
    ]);
    const profileDir = await provisionedProfile();
    const auth = new FakeAuthStatusRunner();
    const slowAuth: ClassifierAuthStatusRunner = {
      async run(invocation) {
        clock.advance(20_000);
        return auth.run(invocation);
      },
    };
    // 340 s elapsed at the repair decision: remaining 260 s, usable window 250 s.
    const budget = decideRepairBudget({ elapsedMs: 340_000, policy: REPAIR_POLICY_ONE_ROUND });
    if (budget.kind !== 'PROCEED') throw new Error('unreachable');
    expect(budget.windowMs).toBe(250_000);
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock, authStatusRunner: slowAuth }).classify(
        request({ totalBudgetMs: budget.windowMs }),
      ),
    );
    expect(result.outcome).toBe('OK');
    expect(runner.invocations).toHaveLength(2);
    expect(runner.runOptions.map((o) => o!.deadlineMs)).toEqual([
      // attempt 1: min(300 s, 250 s window - 20 s auth status)
      230_000,
      // attempt 2: min(300 s, 250 s - 20 s auth - 100 s attempt 1 - 0.5 s backoff)
      129_500,
    ]);
  });

  it('the general rule, exhausted: an earlier attempt that spends the whole repair window leaves a non-positive remainder, and the retry never starts', async () => {
    const clock = createFakeClock();
    const runner = new FakeRunner([
      async () => {
        clock.advance(230_000); // attempt 1 spends everything the window had left after auth status
        throw new Error('read ECONNRESET');
      },
      okRunResult([]),
    ]);
    const profileDir = await provisionedProfile();
    const auth = new FakeAuthStatusRunner();
    const slowAuth: ClassifierAuthStatusRunner = {
      async run(invocation) {
        clock.advance(20_000);
        return auth.run(invocation);
      },
    };
    const budget = decideRepairBudget({ elapsedMs: 340_000, policy: REPAIR_POLICY_ONE_ROUND });
    if (budget.kind !== 'PROCEED') throw new Error('unreachable');
    const result = await settle(
      clock,
      provider({ runner, env: envFor(profileDir), clock, authStatusRunner: slowAuth }).classify(
        request({ totalBudgetMs: budget.windowMs }),
      ),
    );
    expect(result.outcome).toBe('TIMEOUT');
    expect(result.outcomeDetail).toMatch(/total time budget was exhausted/);
    expect(runner.invocations).toHaveLength(1); // the retry never started
  });
});

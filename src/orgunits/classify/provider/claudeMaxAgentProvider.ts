/**
 * `ClaudeMaxAgentProvider` — the Phase 2B-2C2 Claude Max Agent SDK runtime
 * adapter, implementing the LANDED provider-neutral `ClassifierProvider`
 * contract and nothing wider (ADR 0009 as corrected by ADR 0010).
 *
 * ONE `classify()` call is:
 *
 *   1. PURE PRE-FLIGHT (zero network, zero filesystem): NONE of the
 *      canonical 14 conflicting-auth variables present (conflicts REFUSE
 *      the run — they are never sanitised away); the prohibited
 *      setup-token variable absent (ADR 0010: fail closed, never prefer,
 *      never fall back); the dedicated classifier profile directory
 *      resolved and permitted (not the repo, not `<home>/.claude`, not
 *      home); model id inside the closed allowlist; run config internally
 *      valid.
 *   2. PROFILE HYGIENE (names-only readdir): the dedicated profile exists
 *      and holds no semantic/config surface (`profileHygiene.ts`). No file
 *      content — credentials above all — is ever read.
 *   3. SCRATCH ISOLATION: one fresh scratch `cwd`, unique per invocation,
 *      removed afterwards on success AND failure (`runtimeIsolation.ts`).
 *      The PROFILE directory persists: Claude Code owns and refreshes the
 *      stored login inside it, and this engine never writes or deletes it.
 *   4. STORED-LOGIN CHECK: the request-free `claude auth status --json`,
 *      executed through the injected `ClassifierAuthStatusRunner` seam
 *      under the SAME sanitized child environment and SAME dedicated
 *      profile the SDK subprocess will use, evaluated by the pure
 *      `authStatus.ts` (logged in, `claude.ai` method, `firstParty`
 *      provider, `max` subscription when reported). Any failure returns
 *      the provider-neutral `AUTH_FAILURE` outcome with ZERO SDK-runner
 *      invocations.
 *   5. INVOCATION: the hermetic invocation (sdkOptions.ts) over the
 *      allowlist-built child environment (environment.ts), executed
 *      through the injected `AgentSdkRunner` seam — the provider itself
 *      imports no SDK and opens no socket.
 *   6. BOUNDED TRANSIENT RETRY: the landed `retry.ts` helper, max 2
 *      retries, exponential backoff on the injected `Clock`. ONLY
 *      `PROVIDER_TRANSIENT` attempts retry; AUTH_FAILURE,
 *      USAGE_LIMIT_EXHAUSTED, PROVIDER_REFUSAL, STRUCTURED_OUTPUT_FAILED
 *      and TIMEOUT reach the caller on their first occurrence.
 *   7. MAPPING: outcomes translate through the ONE centralized mapping
 *      module (outcomeMapping.ts). Structured output is returned RAW
 *      (`unknown`) for the landed layer-2 validator — never re-validated,
 *      never salvaged, never fabricated here.
 *
 * WHAT THIS CLASS CAN NEVER DO, by construction: read a database (no `pg`
 * import anywhere in the provider namespace — firewall-pinned), receive a
 * credential as a request field or an environment value (no credential
 * value exists ANYWHERE in this design — the child receives a profile
 * DIRECTORY PATH and Claude Code owns what is inside it), read or copy the
 * credentials file, fall back to an API key or any cloud/paid path (no
 * such code path exists in this repository — firewall-pinned), buy
 * credits, or retry exhaustion.
 *
 * BOTH RUNNERS ARE REQUIRED constructor arguments — there is no implicit
 * default that could quietly construct a production runner inside a test.
 * Production wiring passes `createProductionAgentSdkRunner()` and
 * `createProductionAuthStatusRunner()` explicitly; every automated test
 * passes fakes.
 */
import type {
  ClassifierProvider,
  ClassifierProviderRequest,
  ClassifierProviderResult,
} from '../providerContract.js';
import { retryTransient } from '../retry.js';
import { realClock, type Clock } from '../../orchestrator/clock.js';
import { runClassifierPreflight } from './preflight.js';
import { checkProfileHygiene } from './profileHygiene.js';
import { evaluateAuthStatus, type AuthStatusExecution } from './authStatus.js';
import type { ClassifierAuthStatusRunner } from './authStatusRunner.js';
import { buildChildEnvironment } from './environment.js';
import { createScratchWorkspace } from './runtimeIsolation.js';
import { buildAgentSdkInvocation } from './sdkOptions.js';
import type { AgentSdkRunner, AgentSdkRunResult } from './agentSdkRunner.js';
import {
  classifyRunResult,
  classifyThrownFailure,
  type ClassifiedAttempt,
} from './outcomeMapping.js';

export interface ClaudeMaxAgentProviderOptions {
  /** REQUIRED. Production: `createProductionAgentSdkRunner()`. Tests: a fake. */
  readonly runner: AgentSdkRunner;
  /** REQUIRED. Production: `createProductionAuthStatusRunner()`. Tests: a fake. */
  readonly authStatusRunner: ClassifierAuthStatusRunner;
  /**
   * The orchestration-process environment. Defaults to reading
   * `process.env` at `classify()` time — the ONE sanctioned read point.
   * Tests inject plain maps.
   */
  readonly env?: () => Readonly<Record<string, string | undefined>>;
  /** The repository root, for the profile-scope refusal. Defaults to the process working directory. */
  readonly repoRoot?: string;
  /** Injectable clock for retry backoff. Defaults to real timers. */
  readonly clock?: Clock;
  /** Closed model allowlist override — for tests with fake model ids only. */
  readonly allowedModels?: readonly string[];
}

export class ClaudeMaxAgentProvider implements ClassifierProvider {
  readonly #runner: AgentSdkRunner;
  readonly #authStatusRunner: ClassifierAuthStatusRunner;
  readonly #env: () => Readonly<Record<string, string | undefined>>;
  readonly #repoRoot: string;
  readonly #clock: Clock;
  readonly #allowedModels: readonly string[] | undefined;

  constructor(options: ClaudeMaxAgentProviderOptions) {
    this.#runner = options.runner;
    this.#authStatusRunner = options.authStatusRunner;
    this.#env = options.env ?? (() => ({ ...process.env }));
    this.#repoRoot = options.repoRoot ?? process.cwd();
    this.#clock = options.clock ?? realClock;
    this.#allowedModels = options.allowedModels;
  }

  async classify(request: ClassifierProviderRequest): Promise<ClassifierProviderResult> {
    const parentEnv = this.#env();

    const preflight = runClassifierPreflight({
      env: parentEnv,
      repoRoot: this.#repoRoot,
      modelId: request.modelId,
      runConfig: request.runConfig,
      ...(this.#allowedModels !== undefined ? { allowedModels: this.#allowedModels } : {}),
    });
    if (!preflight.ok) {
      // Every pre-flight failure is a provider-neutral AUTH_FAILURE: the
      // runtime is not authorised to perform Max-subscription inference in
      // this environment. Zero runner invocations, zero subprocesses, zero
      // filesystem reads, zero sockets.
      return refusal(`pre-flight ${preflight.kind}: ${preflight.detail}`);
    }

    const hygiene = await checkProfileHygiene(preflight.profileDir);
    if (!hygiene.ok) {
      return refusal(`pre-flight ${hygiene.kind}: ${hygiene.detail}`);
    }

    const scratch = await createScratchWorkspace();
    try {
      const childEnv = buildChildEnvironment({
        parentEnv,
        configDir: preflight.profileDir,
      });

      // The request-free stored-login check runs under the SAME environment
      // and SAME profile the SDK subprocess will receive.
      let authStatusExecution: AuthStatusExecution;
      try {
        authStatusExecution = await this.#authStatusRunner.run({
          env: childEnv,
          cwd: scratch.scratchCwd,
        });
      } catch (error) {
        return refusal(
          `pre-flight AUTH_STATUS_UNAVAILABLE: the request-free auth-status check could ` +
            `not run (${error instanceof Error ? error.message : 'unknown failure'}). ` +
            `No inference was attempted.`,
        );
      }
      const authStatus = evaluateAuthStatus(authStatusExecution);
      if (!authStatus.ok) {
        return refusal(`pre-flight ${authStatus.kind}: ${authStatus.detail}`);
      }

      const invocation = buildAgentSdkInvocation({
        request,
        childEnv,
        scratchCwd: scratch.scratchCwd,
      });

      interface AttemptOutcome {
        readonly classified: ClassifiedAttempt;
        /** The normalized run result behind `classified`, when the runner returned one (null on a thrown transport failure). */
        readonly runResult: AgentSdkRunResult | null;
      }
      const attempt = async (): Promise<AttemptOutcome> => {
        try {
          const runResult = await this.#runner.run(invocation);
          return { classified: classifyRunResult(runResult), runResult };
        } catch (error) {
          return { classified: classifyThrownFailure(error), runResult: null };
        }
      };

      const finalAttempt = await retryTransient(attempt, {
        isTransient: (outcome) => outcome.classified.kind === 'PROVIDER_TRANSIENT',
        clock: this.#clock,
      });

      const usage = finalAttempt.runResult;
      if (finalAttempt.classified.kind === 'OK') {
        return {
          outcome: 'OK',
          rawOutput: finalAttempt.classified.structuredOutput,
          responseModelId: usage?.responseModelId ?? null,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          outcomeDetail: null,
        };
      }
      return {
        outcome: finalAttempt.classified.kind,
        rawOutput: null,
        responseModelId: usage?.responseModelId ?? null,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        outcomeDetail: boundDetail(finalAttempt.classified.detail),
      };
    } finally {
      // The SCRATCH directory only. The dedicated profile directory is
      // Claude-owned persistent state and is never engine-deleted.
      await scratch.cleanup();
    }
  }
}

/** An AUTH_FAILURE refusal with zero SDK-runner invocations. */
function refusal(detail: string): ClassifierProviderResult {
  return {
    outcome: 'AUTH_FAILURE',
    rawOutput: null,
    responseModelId: null,
    inputTokens: null,
    outputTokens: null,
    outcomeDetail: boundDetail(detail),
  };
}

/** Bounded to the contract's 2000-character limit at the source. */
function boundDetail(detail: string): string {
  return detail.length > 2000 ? `${detail.slice(0, 1997)}...` : detail;
}

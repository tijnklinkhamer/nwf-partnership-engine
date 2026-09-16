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
 *   2a. EXECUTABLE RESOLUTION (ADR 0010 Amendment A, 2026-09-13): the
 *      exact SDK-bundled native Claude Code binary is resolved and
 *      verified ONCE through the injected `ClaudeCodeExecutableResolver`
 *      seam (production: `claudeCodeExecutable.ts` against this
 *      namespace's own package root; tests: a fake). A refusal of any
 *      kind is a provider-neutral `AUTH_FAILURE` with zero subprocesses.
 *      The one resolved path is then handed to BOTH the auth-status
 *      runner and the SDK invocation, so the preflight oracle and the
 *      inference subprocess are the same file by construction — never an
 *      external `claude` found on `PATH`.
 *   3. SCRATCH ISOLATION: one fresh scratch `cwd`, unique per invocation,
 *      removed afterwards on success AND failure (`runtimeIsolation.ts`).
 *      The PROFILE directory persists: Claude Code owns and refreshes the
 *      stored login inside it, and this engine never writes or deletes it.
 *   4. STORED-LOGIN CHECK: the request-free `auth status --json` of the
 *      resolved binary, executed through the injected
 *      `ClassifierAuthStatusRunner` seam under the SAME sanitized child
 *      environment and SAME dedicated profile the SDK subprocess will
 *      use, evaluated by the pure `authStatus.ts` (logged in, `claude.ai`
 *      method, `firstParty` provider, `max` subscription when reported).
 *      Any failure returns the provider-neutral `AUTH_FAILURE` outcome
 *      with ZERO SDK-runner invocations.
 *   5. INVOCATION: the hermetic invocation (sdkOptions.ts) over the
 *      allowlist-built child environment (environment.ts) and the resolved
 *      executable, executed through the injected `AgentSdkRunner` seam —
 *      the provider itself imports no SDK and opens no socket.
 *   6. BOUNDED TRANSIENT RETRY: the landed `retry.ts` helper, max 2
 *      retries, exponential backoff on the injected `Clock`. ONLY
 *      `PROVIDER_TRANSIENT` attempts retry; AUTH_FAILURE,
 *      USAGE_LIMIT_EXHAUSTED, PROVIDER_REFUSAL, STRUCTURED_OUTPUT_FAILED
 *      and TIMEOUT reach the caller on their first occurrence.
 *   6a. TOTAL BUDGET (2D2B-2): ONE monotonic window of
 *      `CLASSIFIER_CALL_TOTAL_BUDGET_MS`, opened on the injected `Clock`
 *      immediately before the first runner attempt and never reset per
 *      retry. Before EVERY attempt: no budget left -> terminal TIMEOUT with
 *      zero further runner calls; otherwise the runner's deadline is
 *      `min(CLASSIFIER_CALL_SOFT_DEADLINE_MS, remaining)`. Backoff sleeps
 *      spend the same window. Worst case, a call ends within the budget
 *      plus one hard-kill grace. A deadline TIMEOUT's bounded diagnostics
 *      go to the optional `onAttemptDiagnostics` hook (and, only under
 *      `NWF_PE_VERBOSE`, to `debug()` on stderr) — never into the result.
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
import {
  resolveProductionClaudeCodeExecutable,
  type ClaudeCodeExecutableResolver,
} from './claudeCodeExecutable.js';
import { evaluateAuthStatus, type AuthStatusExecution } from './authStatus.js';
import type { ClassifierAuthStatusRunner } from './authStatusRunner.js';
import { buildChildEnvironment } from './environment.js';
import { createScratchWorkspace } from './runtimeIsolation.js';
import { buildAgentSdkInvocation } from './sdkOptions.js';
import {
  AgentSdkTimeoutError,
  CLASSIFIER_CALL_SOFT_DEADLINE_MS,
  CLASSIFIER_CALL_TOTAL_BUDGET_MS,
  type AgentSdkDiagnostics,
  type AgentSdkRunner,
  type AgentSdkRunResult,
} from './agentSdkRunner.js';
import {
  classifyRunResult,
  classifyThrownFailure,
  classifyTotalBudgetExhausted,
  type ClassifiedAttempt,
} from './outcomeMapping.js';
import { debug } from '../../../logging/log.js';

export interface ClaudeMaxAgentProviderOptions {
  /** REQUIRED. Production: `createProductionAgentSdkRunner()`. Tests: a fake. */
  readonly runner: AgentSdkRunner;
  /** REQUIRED. Production: `createProductionAuthStatusRunner()`. Tests: a fake. */
  readonly authStatusRunner: ClassifierAuthStatusRunner;
  /**
   * Resolves the SDK-bundled native Claude Code binary both subprocesses
   * run. Defaults to the production resolver over this namespace's own
   * package root (`claudeCodeExecutable.ts`); tests inject a fake that
   * names a synthetic absolute path. Never a PATH lookup.
   */
  readonly claudeCodeExecutable?: ClaudeCodeExecutableResolver;
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
  /**
   * Receives the EXACT, deeply frozen diagnostics of an attempt that hit the
   * liveness deadline, before the error is reduced to an outcome. The
   * capture point for a future bounded evaluation harness; independent of
   * `NWF_PE_VERBOSE`. A hook that throws cannot change the outcome.
   */
  readonly onAttemptDiagnostics?: (diagnostics: AgentSdkDiagnostics) => void;
}

export class ClaudeMaxAgentProvider implements ClassifierProvider {
  readonly #runner: AgentSdkRunner;
  readonly #authStatusRunner: ClassifierAuthStatusRunner;
  readonly #claudeCodeExecutable: ClaudeCodeExecutableResolver;
  readonly #env: () => Readonly<Record<string, string | undefined>>;
  readonly #repoRoot: string;
  readonly #clock: Clock;
  readonly #allowedModels: readonly string[] | undefined;
  readonly #onAttemptDiagnostics: ((diagnostics: AgentSdkDiagnostics) => void) | undefined;

  constructor(options: ClaudeMaxAgentProviderOptions) {
    this.#runner = options.runner;
    this.#authStatusRunner = options.authStatusRunner;
    this.#claudeCodeExecutable =
      options.claudeCodeExecutable ?? resolveProductionClaudeCodeExecutable;
    this.#env = options.env ?? (() => ({ ...process.env }));
    this.#repoRoot = options.repoRoot ?? process.cwd();
    this.#clock = options.clock ?? realClock;
    this.#allowedModels = options.allowedModels;
    this.#onAttemptDiagnostics = options.onAttemptDiagnostics;
  }

  async classify(request: ClassifierProviderRequest): Promise<ClassifierProviderResult> {
    // ADR 0011: a caller-supplied window is opened HERE, at entry, so that
    // pre-flight and the auth-status check spend it too - a caller composing
    // a bounded repair inside an outer window can then account exactly.
    // Without one, the frozen window opens immediately before the first
    // runner attempt, exactly as 2D2B-2 landed it.
    const callEnteredAt = this.#clock.now();
    const callerWindowMs = resolveCallerWindowMs(request.totalBudgetMs);
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

    // ONE resolution, ONE executable, for both subprocesses below. A
    // refusal here opens no scratch directory and spawns nothing.
    const executable = this.#claudeCodeExecutable();
    if (!executable.ok) {
      return refusal(`pre-flight CLAUDE_CODE_EXECUTABLE_${executable.kind}: ${executable.detail}`);
    }
    const executablePath = executable.provenance.executablePath;

    const scratch = await createScratchWorkspace();
    try {
      const childEnv = buildChildEnvironment({
        parentEnv,
        configDir: preflight.profileDir,
      });

      // The request-free stored-login check runs under the SAME environment,
      // SAME profile and SAME executable the SDK subprocess will receive.
      let authStatusExecution: AuthStatusExecution;
      try {
        authStatusExecution = await this.#authStatusRunner.run({
          executablePath,
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
        claudeCodeExecutablePath: executablePath,
      });

      interface AttemptOutcome {
        readonly classified: ClassifiedAttempt;
        /** The normalized run result behind `classified`, when the runner returned one (null on a thrown transport failure). */
        readonly runResult: AgentSdkRunResult | null;
      }
      // ONE window for the whole attempt sequence, opened once, never reset.
      // The frozen window opens here; a caller-supplied one was opened at
      // entry and is never wider than the frozen total.
      const totalBudgetMs =
        callerWindowMs === null
          ? CLASSIFIER_CALL_TOTAL_BUDGET_MS
          : Math.min(CLASSIFIER_CALL_TOTAL_BUDGET_MS, callerWindowMs);
      const budgetStartedAt = callerWindowMs === null ? this.#clock.now() : callEnteredAt;
      const attempt = async (): Promise<AttemptOutcome> => {
        const remainingMs = totalBudgetMs - (this.#clock.now() - budgetStartedAt);
        if (remainingMs <= 0) {
          return { classified: classifyTotalBudgetExhausted(), runResult: null };
        }
        const deadlineMs = Math.min(CLASSIFIER_CALL_SOFT_DEADLINE_MS, remainingMs);
        try {
          const runResult = await this.#runner.run(invocation, { deadlineMs });
          return { classified: classifyRunResult(runResult), runResult };
        } catch (error) {
          if (error instanceof AgentSdkTimeoutError) {
            this.#captureTimeoutDiagnostics(error.diagnostics);
          }
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
          outcomeReasonCode: null,
        };
      }
      return {
        outcome: finalAttempt.classified.kind,
        rawOutput: null,
        responseModelId: usage?.responseModelId ?? null,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        outcomeDetail: boundDetail(finalAttempt.classified.detail),
        outcomeReasonCode: finalAttempt.classified.reasonCode,
      };
    } finally {
      // The SCRATCH directory only. The dedicated profile directory is
      // Claude-owned persistent state and is never engine-deleted.
      await scratch.cleanup();
    }
  }

  /**
   * Hands a timed-out attempt's diagnostics to the capture hook (always,
   * when one is configured) and to `debug()` (which emits only under
   * `NWF_PE_VERBOSE`, on stderr). Neither path can reach the provider
   * result, and neither can alter the attempt's outcome.
   */
  #captureTimeoutDiagnostics(diagnostics: AgentSdkDiagnostics): void {
    if (this.#onAttemptDiagnostics !== undefined) {
      try {
        this.#onAttemptDiagnostics(diagnostics);
      } catch {
        debug('classifier provider: the onAttemptDiagnostics hook threw; ignored.');
      }
    }
    const trace = diagnostics.progress
      .map((entry) => `${entry.stage}(+${entry.elapsedMs}ms)`)
      .join(' ');
    debug(
      `classifier provider: attempt TIMEOUT; progress: ${trace}; ` +
        `stderr tail (${diagnostics.stderrTail.length} chars): ${JSON.stringify(diagnostics.stderrTail)}`,
    );
  }
}

/**
 * A caller-supplied window, normalised: `null` when absent (the frozen
 * window applies), otherwise a non-negative integer number of milliseconds.
 * A malformed value (non-finite, negative) is treated as ZERO, which yields
 * a terminal TIMEOUT before any runner attempt - never as "no bound".
 */
function resolveCallerWindowMs(totalBudgetMs: number | undefined): number | null {
  if (totalBudgetMs === undefined) return null;
  if (!Number.isFinite(totalBudgetMs) || totalBudgetMs < 0) return 0;
  return Math.floor(totalBudgetMs);
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
    // Every `refusal()` is a pre-inference control-plane refusal: the runner
    // was never invoked, so no SDK condition exists to name.
    outcomeReasonCode: 'PRE_FLIGHT_REFUSAL',
  };
}

/** Bounded to the contract's 2000-character limit at the source. */
function boundDetail(detail: string): string {
  return detail.length > 2000 ? `${detail.slice(0, 1997)}...` : detail;
}

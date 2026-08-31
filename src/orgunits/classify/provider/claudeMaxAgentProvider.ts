/**
 * `ClaudeMaxAgentProvider` — the Phase 2B-2C2 Claude Max Agent SDK runtime
 * adapter, implementing the LANDED provider-neutral `ClassifierProvider`
 * contract and nothing wider (Max-runtime design §§2, 5–8, 11–22).
 *
 * ONE `classify()` call is:
 *
 *   1. PRE-FLIGHT (pure, zero network, zero filesystem): required
 *      subscription token present and token-shaped; NONE of the canonical
 *      14 conflicting-auth variables present (conflicts REFUSE the run —
 *      they are never sanitised away); model id inside the closed
 *      allowlist; run config internally valid. Any failure returns the
 *      provider-neutral `AUTH_FAILURE` outcome with ZERO runner
 *      invocations — persisted honestly by the landed 2B-2C1 lifecycle.
 *      The pure `runClassifierPreflight` stays exported for a future
 *      orchestration/CLI layer that wants the design-§19 row-less refusal
 *      position as well.
 *   2. ISOLATION: one fresh `CLAUDE_CONFIG_DIR` and one fresh scratch
 *      `cwd`, unique per invocation, removed afterwards on success AND
 *      failure (runtimeIsolation.ts).
 *   3. INVOCATION: the hermetic invocation (sdkOptions.ts) over the
 *      allowlist-built child environment (environment.ts), executed
 *      through the injected `AgentSdkRunner` seam — the provider itself
 *      imports no SDK and opens no socket.
 *   4. BOUNDED TRANSIENT RETRY: the landed `retry.ts` helper, max 2
 *      retries, exponential backoff on the injected `Clock`. ONLY
 *      `PROVIDER_TRANSIENT` attempts retry; AUTH_FAILURE,
 *      USAGE_LIMIT_EXHAUSTED, PROVIDER_REFUSAL, STRUCTURED_OUTPUT_FAILED
 *      and TIMEOUT reach the caller on their first occurrence (design §21).
 *   5. MAPPING: outcomes translate through the ONE centralized mapping
 *      module (outcomeMapping.ts). Structured output is returned RAW
 *      (`unknown`) for the landed layer-2 validator — never re-validated,
 *      never salvaged, never fabricated here (design §20).
 *
 * WHAT THIS CLASS CAN NEVER DO, by construction: read a database (no `pg`
 * import anywhere in the provider namespace — firewall-pinned), receive an
 * OAuth token as a request field (the contract has no such field; the token
 * comes from the injected environment only), fall back to an API key /
 * Bedrock / Vertex / Foundry / any paid path (no such code path exists in
 * this repository — firewall-pinned), buy credits, or retry exhaustion.
 *
 * SECRET HYGIENE: no error message, outcome detail or thrown error ever
 * contains the token value. Detail strings are fixed descriptions from the
 * mapping module; as defense in depth every returned detail is scrubbed of
 * the token value (design §5: "[REDACTED]").
 *
 * The RUNNER IS A REQUIRED constructor argument — there is no implicit
 * default that could quietly construct the production SDK runner inside a
 * test. Production wiring passes `createProductionAgentSdkRunner()`
 * explicitly; every automated test passes a fake.
 */
import type {
  ClassifierProvider,
  ClassifierProviderRequest,
  ClassifierProviderResult,
} from '../providerContract.js';
import { retryTransient } from '../retry.js';
import { realClock, type Clock } from '../../orchestrator/clock.js';
import { CLAUDE_MAX_OAUTH_TOKEN_VARIABLE } from './authConflicts.js';
import { runClassifierPreflight } from './preflight.js';
import { buildChildEnvironment } from './environment.js';
import { createRuntimeIsolation } from './runtimeIsolation.js';
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
  /**
   * The orchestration-process environment. Defaults to reading
   * `process.env` at `classify()` time — the ONE sanctioned read point
   * (design §5: "read by exactly one module"). Tests inject plain maps.
   */
  readonly env?: () => Readonly<Record<string, string | undefined>>;
  /** Injectable clock for retry backoff. Defaults to real timers. */
  readonly clock?: Clock;
  /** Closed model allowlist override — for tests with fake model ids only. */
  readonly allowedModels?: readonly string[];
}

export class ClaudeMaxAgentProvider implements ClassifierProvider {
  readonly #runner: AgentSdkRunner;
  readonly #env: () => Readonly<Record<string, string | undefined>>;
  readonly #clock: Clock;
  readonly #allowedModels: readonly string[] | undefined;

  constructor(options: ClaudeMaxAgentProviderOptions) {
    this.#runner = options.runner;
    this.#env = options.env ?? (() => ({ ...process.env }));
    this.#clock = options.clock ?? realClock;
    this.#allowedModels = options.allowedModels;
  }

  async classify(request: ClassifierProviderRequest): Promise<ClassifierProviderResult> {
    const parentEnv = this.#env();
    const token = parentEnv[CLAUDE_MAX_OAUTH_TOKEN_VARIABLE];

    const preflight = runClassifierPreflight({
      env: parentEnv,
      modelId: request.modelId,
      runConfig: request.runConfig,
      ...(this.#allowedModels !== undefined ? { allowedModels: this.#allowedModels } : {}),
    });
    if (!preflight.ok) {
      // Every pre-flight failure is a provider-neutral AUTH_FAILURE: the
      // runtime is not authorised to perform Max-subscription inference in
      // this environment. Zero runner invocations, zero isolation dirs,
      // zero sockets.
      return {
        outcome: 'AUTH_FAILURE',
        rawOutput: null,
        responseModelId: null,
        inputTokens: null,
        outputTokens: null,
        outcomeDetail: scrubToken(`pre-flight ${preflight.kind}: ${preflight.detail}`, token),
      };
    }

    const isolation = await createRuntimeIsolation();
    try {
      const childEnv = buildChildEnvironment({
        parentEnv,
        configDir: isolation.configDir,
      });
      const invocation = buildAgentSdkInvocation({
        request,
        childEnv,
        scratchCwd: isolation.scratchCwd,
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
        outcomeDetail: scrubToken(finalAttempt.classified.detail, token),
      };
    } finally {
      await isolation.cleanup();
    }
  }
}

/**
 * Defense-in-depth secret scrubbing (design §5): if the token value ever
 * appears in a detail string — it should be impossible, since details are
 * fixed descriptions — it is replaced before the string leaves the
 * provider. Bounded to the contract's 2000-character limit at the source.
 */
function scrubToken(detail: string, token: string | undefined): string {
  const scrubbed =
    token !== undefined && token.length > 0 ? detail.split(token).join('[REDACTED]') : detail;
  return scrubbed.length > 2000 ? `${scrubbed.slice(0, 1997)}...` : scrubbed;
}

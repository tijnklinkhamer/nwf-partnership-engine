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

/** The injectable seam. Production: `createProductionAgentSdkRunner()`. Tests: a fake. */
export interface AgentSdkRunner {
  run(invocation: AgentSdkInvocation): Promise<AgentSdkRunResult>;
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
 */
export async function consumeQueryStream(
  stream: AsyncIterable<{ type: string }>,
): Promise<AgentSdkRunResult> {
  let terminal: SDKResultMessage | undefined;
  for await (const message of stream) {
    if (message.type === 'result') {
      terminal = message as SDKResultMessage;
      break;
    }
  }
  if (terminal === undefined) {
    throw new Error('Agent SDK query ended without a result message.');
  }
  return normalizeResult(terminal);
}

/**
 * The production runner: one `query()` per `run()`, streamed to its terminal
 * result message. Never retries, never falls back, never persists anything —
 * retry policy and outcome mapping belong to the provider above this seam.
 */
export function createProductionAgentSdkRunner(): AgentSdkRunner {
  return {
    async run(invocation: AgentSdkInvocation): Promise<AgentSdkRunResult> {
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
      };

      return consumeQueryStream(query({ prompt: invocation.prompt, options }));
    },
  };
}

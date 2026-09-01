/**
 * THE 2B-2C3C TERMINAL-RESULT HARDENING PROOF.
 *
 * `consumeQueryStream` (the message-stream half of `agentSdkRunner.ts`,
 * factored out precisely so it can be tested without constructing the
 * production runner — `phase2b.firewall.test.ts` forbids any test from
 * containing the string `createProductionAgentSdkRunner`) is driven here
 * with a FAKE async-generator stream reproducing the EXACT lifecycle the
 * 2026-09-01 2B-2C3B smoke captured against the real SDK:
 *
 *   system/init -> assistant -> result (is_error: true, no structured
 *   output) -> [a further pull would throw
 *   "API Error: 400 tools.0.custom.input_schema.type: Input should be
 *   'object'"]
 *
 * A generator's `.return()` (invoked by `for await...of`'s own
 * `IteratorClose` on `break`, never `.next()`) finalizes it at the
 * currently-suspended yield point without resuming the body — so any code
 * written AFTER the terminal `result` yield is proof positive that the
 * runner pulled again if it ever executes. These tests assert it never does.
 *
 * Zero SDK import, zero network, zero subprocess.
 */
import { describe, expect, it } from 'vitest';
import { consumeQueryStream } from '../../orgunits/classify/provider/agentSdkRunner.js';

function resultMessage(
  overrides: Record<string, unknown> = {},
): { type: string } & Record<string, unknown> {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'done',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
    modelUsage: {},
    structured_output: undefined,
    ...overrides,
  };
}

const OBSERVED_400_TEXT =
  'Claude Code returned an error result: API Error: 400\n' +
  "tools.0.custom.input_schema.type: Input should be 'object'";

describe('consumeQueryStream - terminal-result hardening (2B-2C3C)', () => {
  it('reproduces the exact 2B-2C3B lifecycle: system/init -> assistant -> error result, and the would-throw post-terminal pull is NEVER reached', async () => {
    let reachedPostTerminalCode = false;
    async function* fakeStream() {
      yield { type: 'system', subtype: 'init' };
      yield { type: 'assistant' };
      yield resultMessage({ is_error: true, result: OBSERVED_400_TEXT });
      // Only reached if the consumer pulls the stream again after the
      // terminal result - exactly the bug this hardening closes.
      reachedPostTerminalCode = true;
      throw new Error(OBSERVED_400_TEXT);
    }

    const result = await consumeQueryStream(fakeStream());

    expect(reachedPostTerminalCode).toBe(false);
    expect(result.subtype).toBe('success');
    expect(result.isError).toBe(true);
    // Never pretended successful structured output, even though the
    // terminal message is subtype 'success'.
    expect(result.structuredOutput).toBeUndefined();
    // The terminal result's own information survived - never replaced by a
    // generic "query ended" or a swallowed post-terminal throw.
    expect(result.resultText).toBe(OBSERVED_400_TEXT);
  });

  it('a genuinely successful terminal result likewise stops iteration immediately, even when a subsequent pull would throw', async () => {
    let reachedPostTerminalCode = false;
    async function* fakeStream() {
      yield { type: 'system', subtype: 'init' };
      yield { type: 'assistant' };
      yield resultMessage({ structured_output: { results: [{ doc_index: 0 }] } });
      reachedPostTerminalCode = true;
      throw new Error('post-terminal pull must never happen on a clean success either');
    }

    const result = await consumeQueryStream(fakeStream());

    expect(reachedPostTerminalCode).toBe(false);
    expect(result.isError).toBe(false);
    expect(result.structuredOutput).toEqual({ results: [{ doc_index: 0 }] });
  });

  it('throws its own explanatory error when the stream ends with no result message at all', async () => {
    async function* fakeStream() {
      yield { type: 'system', subtype: 'init' };
      yield { type: 'assistant' };
    }
    await expect(consumeQueryStream(fakeStream())).rejects.toThrow(
      /ended without a result message/,
    );
  });

  it('normalizes token usage and the reported model id from a well-formed terminal result', async () => {
    async function* fakeStream() {
      yield resultMessage({
        modelUsage: {
          'model-a': { outputTokens: 5 },
          'model-b': { outputTokens: 50 },
        },
        usage: { input_tokens: 900, output_tokens: 180 },
      });
    }
    const result = await consumeQueryStream(fakeStream());
    expect(result.responseModelId).toBe('model-b'); // the higher-output-token model wins
    expect(result.inputTokens).toBe(900);
    expect(result.outputTokens).toBe(180);
  });
});

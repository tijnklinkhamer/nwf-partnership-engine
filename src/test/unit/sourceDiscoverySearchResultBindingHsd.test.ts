/**
 * WW H-SD (second independent security review, ADR 0028 s9) - what ONE
 * approved WebSearch may keep, and how long it may run.
 *
 *   P1-3   The bundled executable's WebSearch tool runs a NESTED side query
 *          (`web_search_20250305`, `max_uses: 8`) whose searches never reach
 *          the outer stream. The SDK seam maps the user message's
 *          `tool_use_result` (the tool's WebSearchOutput); the adapter keeps
 *          a call's results only when its approved WebSearch reported
 *          EXACTLY ONE search for the planned query and every returned URL
 *          is one of that search's hits. The child environment caps the
 *          session at one outer WebSearch call.
 *   P2-15a A call is aborted at its deadline (a granted run passes the time
 *          its grant has left); an aborted call keeps nothing.
 *
 * A FAKE SDK `query` only: no network, no model, no database.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  SOURCE_DISCOVERY_CHILD_ENV_FIXED,
  SOURCE_DISCOVERY_QUERY_DEADLINE_MS,
  prepareLiveSearch,
  toAgentMessage,
  type LiveSearchDeps,
  type SdkQueryFn,
  type SdkStreamMessage,
} from '../../orgunits/sourceDiscovery/agentQuery.js';
import { SourceDiscoveryAuthorisation } from '../../orgunits/sourceDiscovery/authorisation.js';
import { NWF_DISCOVERY_BRIEF_V1, queriesFor } from '../../orgunits/sourceDiscovery/brief.js';
import {
  ClaudeMaxWebSearchProvider,
  WebSearchGate,
  buildWebSearchAgentOptions,
  buildWebSearchPrompt,
  type AgentMessage,
  type AgentQueryFn,
  type AgentToolResult,
} from '../../orgunits/sourceDiscovery/claudeMaxWebSearchProvider.js';
import { SOURCE_DISCOVERY_ALLOWED_MODELS } from '../../orgunits/sourceDiscovery/grant.js';
import type { SearchRequest } from '../../orgunits/sourceDiscovery/provider.js';

const request: SearchRequest = {
  briefKey: 'nwf-discovery-brief-v1',
  geography: 'JP',
  query: queriesFor(NWF_DISCOVERY_BRIEF_V1, 'JP').queries[0]!,
};
const PLANNED = request.query.text;
const HIT_A = 'https://gogaku-fict.jp/';
const HIT_B = 'https://tandem-fict.jp/events';
const output = (...urls: string[]) => ({
  results: urls.map((url) => ({ url, title: 'x', snippet: null })),
});

/** The tool's own report, as the SDK seam maps it. */
const report = (webSearch: AgentToolResult['webSearch'], toolUseId = 'a'): AgentMessage => ({
  type: 'user',
  toolResults: [{ toolUseId, webSearch }],
});

/**
 * A fake SDK: one WebSearch tool use (consulted through the hook and
 * `canUseTool`, as the SDK does), then the given messages, then the result.
 */
function fakeQuery(between: readonly AgentMessage[], structured: unknown): AgentQueryFn {
  return (args) => {
    return (async function* (): AsyncGenerator<AgentMessage> {
      const input = { query: PLANNED };
      yield {
        type: 'assistant',
        toolUses: [{ kind: 'tool_use', id: 'a', name: 'WebSearch', input }],
      };
      const hook = await args.options.preToolUse({
        toolName: 'WebSearch',
        toolInput: input,
        toolUseId: 'a',
      });
      if (hook.decision === 'pass') await args.options.canUseTool('WebSearch', input, 'a');
      yield* between;
      yield { type: 'result', subtype: 'success', structured_output: structured };
    })();
  };
}

const provider = (query: AgentQueryFn) =>
  new ClaudeMaxWebSearchProvider(SourceDiscoveryAuthorisation.sealedForVitest('unit'), {
    query,
    now: () => new Date('2026-10-27T00:00:00.000Z'),
  });

describe('WW H-SD P1-3 SDK seam: a WebSearch tool result crosses as count, query and hit URLs only', () => {
  const user = (toolUseResult: unknown, ids: readonly string[] = ['a']): SdkStreamMessage => ({
    type: 'user',
    message: {
      role: 'user',
      content: ids.map((id) => ({ type: 'tool_result', tool_use_id: id, content: 'prose' })),
    },
    tool_use_result: toolUseResult,
  });
  const webSearchOutput = {
    query: PLANNED,
    results: [
      'commentary that must never cross',
      { tool_use_id: 'srvtoolu_1', content: [{ title: 'Title A', url: HIT_A }] },
      { tool_use_id: 'srvtoolu_2', content: [{ title: 'Title B', url: HIT_B }] },
    ],
    durationSeconds: 2.5,
    searchCount: 2,
  };

  it('maps the WebSearchOutput to its query, searchCount and hit URLs, nothing else', () => {
    expect(toAgentMessage(user(webSearchOutput))).toEqual({
      type: 'user',
      toolResults: [
        {
          toolUseId: 'a',
          webSearch: { query: PLANNED, searchCount: 2, resultUrls: [HIT_A, HIT_B] },
        },
      ],
    });
    expect(JSON.stringify(toAgentMessage(user(webSearchOutput)))).not.toMatch(
      /commentary|Title A|durationSeconds/,
    );
  });

  it('carries no search for an unknown shape, a missing count, or a message answering two tool uses', () => {
    expect(toAgentMessage(user('Error: search failed'))).toEqual({
      type: 'user',
      toolResults: [{ toolUseId: 'a', webSearch: null }],
    });
    expect(toAgentMessage(user(undefined))).toEqual({
      type: 'user',
      toolResults: [{ toolUseId: 'a', webSearch: null }],
    });
    const { searchCount: _dropped, ...noCount } = webSearchOutput;
    expect(toAgentMessage(user(noCount)).toolResults![0]!.webSearch!.searchCount).toBeNull();
    // tool_use_result is ONE per message: never attributed when two tool uses are answered.
    expect(toAgentMessage(user(webSearchOutput, ['a', 'b']))).toEqual({
      type: 'user',
      toolResults: [
        { toolUseId: 'a', webSearch: null },
        { toolUseId: 'b', webSearch: null },
      ],
    });
    expect(toAgentMessage({ type: 'user', message: { content: 'a typed prompt' } })).toEqual({
      type: 'user',
    });
  });
});

describe('WW H-SD P1-3 adapter: exactly one reported search, and only its own hits', () => {
  const ONE = { query: PLANNED, searchCount: 1, resultUrls: [HIT_A, HIT_B] };

  it('keeps the results of one reported search whose hits include every returned URL', async () => {
    const response = await provider(fakeQuery([report(ONE)], output(HIT_A, HIT_B))).search(request);
    expect(response.results.map((r) => r.url)).toEqual([HIT_A, HIT_B]);
    expect(response.searchGate).toEqual({
      hookInvoked: true,
      permissionInvoked: true,
      searchCount: 1,
    });
    // A search that found nothing is still exactly one search.
    const empty = await provider(fakeQuery([report({ ...ONE, resultUrls: [] })], output())).search(
      request,
    );
    expect(empty.results).toEqual([]);
  });

  it.each([
    ['the nested side query searched 3 times', [report({ ...ONE, searchCount: 3 })], output(HIT_A)],
    ['the nested side query searched 8 times', [report({ ...ONE, searchCount: 8 })], output(HIT_A)],
    ['the tool reported no search count', [report({ ...ONE, searchCount: null })], output(HIT_A)],
    ['the tool did not search (cap reached)', [report({ ...ONE, searchCount: 0 })], output()],
    [
      'a returned URL is not among the hits',
      [report(ONE)],
      output(HIT_A, 'https://elsewhere-fict.jp/'),
    ],
    ['the reported query is not the plan', [report({ ...ONE, query: 'other' })], output(HIT_A)],
    ['no tool result at all', [], output(HIT_A)],
    ['an unreadable tool result', [report(null)], output(HIT_A)],
    ['a tool result for another tool use', [report(ONE, 'b')], output(HIT_A)],
    ['two tool results for the search', [report(ONE), report(ONE)], output(HIT_A)],
  ] as const)(
    '%s: PROVIDER_SEARCH_BINDING_REFUSED, nothing kept',
    async (_label, between, structured) => {
      await expect(provider(fakeQuery(between, structured)).search(request)).rejects.toMatchObject({
        code: 'PROVIDER_SEARCH_BINDING_REFUSED',
        searchGate: expect.objectContaining({ hookInvoked: true, permissionInvoked: true }),
      });
    },
  );

  it('a call that made no search at all is refused even with zero results', async () => {
    const noSearch: AgentQueryFn = () =>
      (async function* (): AsyncGenerator<AgentMessage> {
        yield { type: 'result', subtype: 'success', structured_output: output() };
      })();
    await expect(provider(noSearch).search(request)).rejects.toMatchObject({
      code: 'PROVIDER_SEARCH_BINDING_REFUSED',
      searchGate: { hookInvoked: false, permissionInvoked: false, searchCount: null },
    });
  });

  it('the gate records the reported count, and the stream check still runs first', () => {
    const gate = new WebSearchGate(PLANNED);
    gate.check('WebSearch', { query: PLANNED }, 'a', 'hook');
    gate.observeSearchResult([{ toolUseId: 'a', webSearch: { ...ONE, searchCount: 3 } }], []);
    expect(gate.observation.searchCount).toBe(3);
    expect(gate.bindingViolations).toEqual(['the WebSearch reported 3 searches, not exactly one']);
  });
});

describe('WW H-SD P2-15a adapter: the deadline travels to the SDK seam and ends the call', () => {
  it('passes the request deadline to the query function, and maps a deadline terminal', async () => {
    const seen: { deadlineMs?: number | undefined } = {};
    const deadline: AgentQueryFn = (args) => {
      seen.deadlineMs = args.deadlineMs;
      return (async function* (): AsyncGenerator<AgentMessage> {
        yield {
          type: 'result',
          subtype: 'error_deadline_exceeded',
          is_error: true,
          failure: 'DEADLINE_EXCEEDED',
        };
      })();
    };
    await expect(
      provider(deadline).search({ ...request, deadlineMs: 1_234 }),
    ).rejects.toMatchObject({ code: 'PROVIDER_DEADLINE_EXCEEDED' });
    expect(seen.deadlineMs).toBe(1_234);
  });
});

describe('WW H-SD agentQuery runtime: one search per session, aborted at the deadline', () => {
  let profileDir: string;
  let homeDir: string;
  const MODEL = SOURCE_DISCOVERY_ALLOWED_MODELS[2]!;

  beforeAll(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'nwf-ww-hsd-home-'));
    profileDir = await mkdtemp(join(tmpdir(), 'nwf-ww-hsd-profile-'));
  });
  afterAll(async () => {
    await rm(homeDir, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  });

  function deps(sdkQuery: SdkQueryFn): LiveSearchDeps {
    return {
      sdkQuery,
      authStatusRunner: {
        run: () =>
          Promise.resolve({
            exitCode: 0,
            stdout: JSON.stringify({
              loggedIn: true,
              authMethod: 'claude.ai',
              apiProvider: 'firstParty',
              subscriptionType: 'max',
            }),
          }),
      },
      env: () => ({
        HOME: homeDir,
        NWF_PE_CLASSIFIER_CONFIG_DIR: profileDir,
        PATH: '/usr/bin',
        // A parent value is never forwarded: the fixed cap wins.
        CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION: '200',
      }),
      repoRoot: process.cwd(),
      claudeCodeExecutable: () => ({
        ok: true,
        provenance: {
          executablePath: '/opt/fake-claude/claude',
          packageRoot: '/opt/fake-claude',
          sdkPackageName: '@fake/sdk',
          sdkVersion: '0.3.251',
          claudeCodeVersion: '2.1.251',
          nativePackageName: '@fake/native',
          nativePackageVersion: '0.3.251',
          platformKey: 'darwin-arm64',
          binaryFileName: 'claude',
          binaryBytes: 1,
          binarySha256: 'a'.repeat(64),
        },
      }),
    };
  }

  const options = () => buildWebSearchAgentOptions(new WebSearchGate(PLANNED));
  const drain = async (it: AsyncIterable<AgentMessage>) => {
    const out: AgentMessage[] = [];
    for await (const m of it) out.push(m);
    return out;
  };

  it('pins one outer WebSearch per session in the child environment', async () => {
    expect(SOURCE_DISCOVERY_CHILD_ENV_FIXED).toEqual({
      CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION: '1',
    });
    let env: Record<string, string | undefined> | undefined;
    const prepared = await prepareLiveSearch(
      deps((args) => {
        env = args.options.env;
        return (async function* (): AsyncGenerator<SdkStreamMessage> {
          yield { type: 'result', subtype: 'success', structured_output: output() };
        })();
      }),
      MODEL,
    );
    if (!prepared.ok) throw new Error(prepared.detail);
    try {
      await drain(
        prepared.runtime.query({ prompt: buildWebSearchPrompt(request), options: options() }),
      );
    } finally {
      await prepared.runtime.close();
    }
    expect(env!['CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION']).toBe('1');
  });

  it('never calls the SDK when no time is left, and aborts a call at its deadline', async () => {
    let called = 0;
    let signal: AbortSignal | undefined;
    const hanging: SdkQueryFn = (args) => {
      called += 1;
      signal = args.options.abortController!.signal;
      return (async function* (): AsyncGenerator<SdkStreamMessage> {
        yield { type: 'system', subtype: 'init' };
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 20_000);
          signal!.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
          });
        });
        if (signal!.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        yield { type: 'result', subtype: 'success', structured_output: output(HIT_A) };
      })();
    };
    const prepared = await prepareLiveSearch(deps(hanging), MODEL);
    if (!prepared.ok) throw new Error(prepared.detail);
    const deadlineTerminal = {
      type: 'result',
      subtype: 'error_deadline_exceeded',
      is_error: true,
      failure: 'DEADLINE_EXCEEDED',
    };
    try {
      const prompt = buildWebSearchPrompt(request);
      expect(
        await drain(prepared.runtime.query({ prompt, options: options(), deadlineMs: 0 })),
      ).toEqual([deadlineTerminal]);
      expect(called).toBe(0);

      const began = Date.now();
      const messages = await drain(
        prepared.runtime.query({ prompt, options: options(), deadlineMs: 100 }),
      );
      expect(Date.now() - began).toBeLessThan(5_000);
      expect(called).toBe(1);
      expect(signal!.aborted).toBe(true);
      expect(messages).toEqual([{ type: 'system' }, deadlineTerminal]);
    } finally {
      await prepared.runtime.close();
    }
    // The mechanical bound still caps a caller's longer deadline.
    expect(SOURCE_DISCOVERY_QUERY_DEADLINE_MS).toBe(300_000);
  });
});

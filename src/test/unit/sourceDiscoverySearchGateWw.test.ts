/**
 * WW E-SDFX (security review P1-3, ADR 0028 s9) - the WebSearch query
 * binding is ENFORCED, not prompted: the per-call gate, the options that make
 * the SDK consult it, the stream count, and the SDK seam's mapping of hooks,
 * `canUseTool` and tool-use blocks. A FAKE SDK `query` only: no network, no
 * model, no database.
 */
import { describe, expect, it } from 'vitest';

import {
  preToolUseHook,
  toAgentMessage,
  type SdkStreamMessage,
} from '../../orgunits/sourceDiscovery/agentQuery.js';
import { SourceDiscoveryAuthorisation } from '../../orgunits/sourceDiscovery/authorisation.js';
import { NWF_DISCOVERY_BRIEF_V1, queriesFor } from '../../orgunits/sourceDiscovery/brief.js';
import {
  ClaudeMaxWebSearchProvider,
  WebSearchGate,
  buildWebSearchAgentOptions,
  type AgentMessage,
  type AgentQueryFn,
  type AgentToolUse,
} from '../../orgunits/sourceDiscovery/claudeMaxWebSearchProvider.js';
import type { SearchRequest } from '../../orgunits/sourceDiscovery/provider.js';

const request: SearchRequest = {
  briefKey: 'nwf-discovery-brief-v1',
  geography: 'JP',
  query: queriesFor(NWF_DISCOVERY_BRIEF_V1, 'JP').queries[0]!,
};
const PLANNED = request.query.text;
const RESULTS = { results: [{ url: 'https://gogaku-fict.jp/', title: 'x', snippet: null }] };

const use = (id: string, input: unknown, name = 'WebSearch'): AgentToolUse => ({
  kind: 'tool_use',
  id,
  name,
  input,
});

describe('WW E-SDFX WebSearchGate: the one planned query, once', () => {
  it('allows exactly {query: planned} once, for the same tool use from both surfaces', () => {
    const gate = new WebSearchGate(PLANNED);
    expect(gate.check('WebSearch', { query: PLANNED }, 'a', 'hook')).toEqual({ allow: true });
    expect(gate.check('WebSearch', { query: PLANNED }, 'a', 'permission')).toEqual({
      allow: true,
    });
    // WW H-SD: no tool result observed yet, so no reported search count.
    expect(gate.observation).toEqual({
      hookInvoked: true,
      permissionInvoked: true,
      searchCount: null,
    });
    expect(gate.approvedToolUseId).toBe('a');
    expect(gate.bindingViolations).toEqual([]);
  });

  it.each([
    ['a different query', { query: 'Jane Fict-Person home address' }],
    ['a query with trailing space', { query: `${PLANNED} ` }],
    ['allowed_domains', { query: PLANNED, allowed_domains: ['people-fict.jp'] }],
    ['blocked_domains', { query: PLANNED, blocked_domains: [] }],
    ['another field', { query: PLANNED, max_uses: 5 }],
    ['a non-object', 'search this'],
    ['no query', {}],
  ])('denies %s and remembers it', (_label, input) => {
    const gate = new WebSearchGate(PLANNED);
    expect(gate.check('WebSearch', input, 'a', 'permission')).toMatchObject({ allow: false });
    expect(gate.bindingViolations).toHaveLength(1);
    expect(gate.approvedToolUseId).toBeNull();
  });

  it('denies a second search - sequential or parallel - and a search with no id', async () => {
    const gate = new WebSearchGate(PLANNED);
    expect(gate.check('WebSearch', { query: PLANNED }, 'a', 'permission')).toEqual({
      allow: true,
    });
    expect(gate.check('WebSearch', { query: PLANNED }, 'b', 'permission')).toMatchObject({
      allow: false,
    });
    const parallel = new WebSearchGate(PLANNED);
    const options = buildWebSearchAgentOptions(parallel);
    const decisions = await Promise.all([
      options.canUseTool('WebSearch', { query: PLANNED }, 'p1'),
      options.canUseTool('WebSearch', { query: PLANNED }, 'p2'),
    ]);
    expect(decisions.map((d) => d.behavior).sort()).toEqual(['allow', 'deny']);
    expect(new WebSearchGate(PLANNED).check('WebSearch', { query: PLANNED }, '', 'hook')).toEqual(
      expect.objectContaining({ allow: false }),
    );
  });

  it('refuses every other tool, and passes the structured-output carrier untouched', () => {
    const gate = new WebSearchGate(PLANNED);
    expect(gate.check('WebFetch', { url: 'https://x-fict.jp/' }, 'f', 'hook')).toMatchObject({
      allow: false,
    });
    expect(gate.check('StructuredOutput', RESULTS, 'o', 'hook')).toBe('carrier');
    expect(gate.refusedTools).toEqual(['WebFetch']);
    expect(gate.approvedToolUseId).toBeNull();
  });

  it('the options pre-approve nothing, run in default mode, and rewrite an allowed input to the plan', async () => {
    const options = buildWebSearchAgentOptions(new WebSearchGate(PLANNED));
    expect([...options.allowedTools]).toEqual([]);
    expect(options.permissionMode).toBe('default');
    expect(await options.canUseTool('WebSearch', { query: PLANNED }, 'a')).toEqual({
      behavior: 'allow',
      updatedInput: { query: PLANNED },
    });
    expect(await options.canUseTool('WebSearch', { query: 'other' }, 'b')).toMatchObject({
      behavior: 'deny',
      interrupt: true,
    });
    expect(
      await options.preToolUse({ toolName: 'Bash', toolInput: {}, toolUseId: 'c' }),
    ).toMatchObject({ decision: 'deny' });
  });

  it('the stream check counts tool-use blocks against the gate', () => {
    const counted = (approve: string | null, uses: AgentToolUse[]) => {
      const gate = new WebSearchGate(PLANNED);
      if (approve !== null) gate.check('WebSearch', { query: PLANNED }, approve, 'permission');
      gate.observeStream(uses);
      return { binding: gate.bindingViolations.length > 0, refused: gate.refusedTools };
    };
    const carrier = use('o', RESULTS, 'StructuredOutput');
    expect(counted('a', [use('a', { query: PLANNED }), carrier])).toEqual({
      binding: false,
      refused: [],
    });
    // A second search, a search never approved, an approved search the stream never showed.
    expect(counted('a', [use('a', { query: PLANNED }), use('b', { query: PLANNED })]).binding).toBe(
      true,
    );
    expect(counted(null, [use('a', { query: PLANNED })]).binding).toBe(true);
    expect(counted('a', [carrier]).binding).toBe(true);
    // Server-side or MCP tool uses are refused tools, whatever their name.
    expect(
      counted('a', [
        use('a', { query: PLANNED }),
        { kind: 'server_tool_use', id: 's', name: 'web_search', input: {} },
      ]).refused,
    ).toEqual(['web_search']);
  });
});

describe('WW E-SDFX adapter: fail closed with zero results kept', () => {
  /** A fake SDK that consults the gate as the SDK would, then IGNORES every denial. */
  function adversarial(
    uses: AgentToolUse[],
    consult: boolean,
    report?: AgentMessage,
  ): AgentQueryFn {
    return (args) =>
      (async function* (): AsyncGenerator<AgentMessage> {
        yield { type: 'assistant', toolUses: uses };
        // WW H-SD: the tool's own report (tool_use_result), when the fake gives one.
        if (report !== undefined) yield report;
        if (consult) {
          await Promise.all(
            uses.map(async (u) => {
              const hook = await args.options.preToolUse({
                toolName: u.name,
                toolInput: u.input,
                toolUseId: u.id,
              });
              if (hook.decision === 'pass') {
                await args.options.canUseTool(u.name, u.input as Record<string, unknown>, u.id);
              }
            }),
          );
        }
        yield { type: 'result', subtype: 'success', structured_output: RESULTS };
      })();
  }
  const search = (query: AgentQueryFn) =>
    new ClaudeMaxWebSearchProvider(SourceDiscoveryAuthorisation.sealedForVitest('unit'), {
      query,
      now: () => new Date('2026-10-27T00:00:00.000Z'),
    }).search(request);

  it.each([
    ['an extra search', [use('a', { query: PLANNED }), use('b', { query: PLANNED })], true],
    ['a different query', [use('a', { query: 'Jane Fict-Person' })], true],
    ['a domain override', [use('a', { query: PLANNED, blocked_domains: ['x-fict.jp'] })], true],
    ['an unchecked search', [use('a', { query: PLANNED })], false],
    ['results with no search at all', [], false],
  ] as const)('%s is PROVIDER_SEARCH_BINDING_REFUSED', async (_label, uses, consult) => {
    await expect(search(adversarial([...uses], consult))).rejects.toMatchObject({
      code: 'PROVIDER_SEARCH_BINDING_REFUSED',
    });
  });

  it('a refused tool outranks a binding violation', async () => {
    await expect(
      search(adversarial([use('a', { query: 'x' }), use('f', {}, 'WebFetch')], true)),
    ).rejects.toMatchObject({ code: 'PROVIDER_TOOL_REFUSED' });
  });

  it('the one planned search returns its results and what the gate observed', async () => {
    const report: AgentMessage = {
      type: 'user',
      toolResults: [
        {
          toolUseId: 'a',
          webSearch: {
            query: PLANNED,
            searchCount: 1,
            resultUrls: RESULTS.results.map((r) => r.url),
          },
        },
      ],
    };
    const response = await search(adversarial([use('a', { query: PLANNED })], true, report));
    expect(response.results).toEqual(RESULTS.results);
    expect(response.searchGate).toEqual({
      hookInvoked: true,
      permissionInvoked: true,
      searchCount: 1,
    });
  });
});

describe('WW E-SDFX SDK seam: hooks, canUseTool and tool-use blocks', () => {
  it('reads every tool-use block of an assistant message, and nothing else', () => {
    const message: SdkStreamMessage = {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'prose that never crosses' },
          { type: 'tool_use', id: 'a', name: 'WebSearch', input: { query: PLANNED } },
          { type: 'server_tool_use', id: 's', name: 'web_search', input: { query: 'q' } },
        ],
      },
    };
    expect(toAgentMessage(message)).toEqual({
      type: 'assistant',
      toolUses: [
        { kind: 'tool_use', id: 'a', name: 'WebSearch', input: { query: PLANNED } },
        { kind: 'server_tool_use', id: 's', name: 'web_search', input: { query: 'q' } },
      ],
    });
    expect(toAgentMessage({ type: 'assistant', message: { content: 'text' } })).toEqual({
      type: 'assistant',
    });
  });

  it('maps a gate denial to the SDK PreToolUse deny, and a pass to no decision', async () => {
    const hook = preToolUseHook(buildWebSearchAgentOptions(new WebSearchGate(PLANNED)));
    const input = (toolInput: unknown, id: string) =>
      ({
        hook_event_name: 'PreToolUse',
        tool_name: 'WebSearch',
        tool_input: toolInput,
        tool_use_id: id,
        session_id: 'fake',
        transcript_path: '',
        cwd: '',
      }) as never;
    const signal = new AbortController().signal;
    expect(await hook(input({ query: PLANNED }, 'a'), 'a', { signal })).toEqual({});
    expect(await hook(input({ query: PLANNED }, 'b'), 'b', { signal })).toEqual({
      continue: false,
      stopReason: 'a second WebSearch in one provider call',
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'a second WebSearch in one provider call',
      },
    });
    expect(await hook({ hook_event_name: 'PostToolUse' } as never, undefined, { signal })).toEqual(
      {},
    );
  });
});

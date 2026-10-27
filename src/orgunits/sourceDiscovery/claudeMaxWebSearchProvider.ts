/**
 * REL L2 / U1 - THE CLAUDE MAX WEB-SEARCH ADAPTER. SEALED BEHIND A STORED GRANT.
 *
 * WHAT IT WOULD DO. Ask the Agent SDK, on the owner's Claude Max subscription
 * (ADR 0009/0010), to run ONE brief query with the `WebSearch` tool and return
 * a bounded, schema-validated list of `{url, title, snippet}`. Nothing else:
 * `WebSearch` is the ONLY tool offered or permitted - no `WebFetch`, no
 * `Bash`, no `Read`, no file or MCP tool - and the gate below denies any other
 * name even if one were somehow offered. Search results are nominations, never
 * pages: nothing the adapter returns is fetched by anything.
 *
 * WHEN IT CAN RUN (WW E-SD, ADR 0027 D4 / ADR 0028). The constructor
 * requires a `SourceDiscoveryAuthorisation`, checked by its private BRAND,
 * whose only production constructor derives it from a STORED OWNER-PATH
 * GRANT row. A grant-derived authority covers exactly the grant's plan,
 * geography and queries: `search` refuses any other request before the SDK
 * is touched. The SDK's `query` function is INJECTED: this file does not
 * import the SDK package. In production `agentQuery.ts` - the one
 * source-discovery SDK import site, behind the ADR 0010 profile,
 * conflicting-auth and auth-status guards - supplies it, and only
 * `grantedRun.ts` constructs this adapter.
 *
 * THE QUERY BINDING IS ENFORCED, NOT PROMPTED (WW E-SDFX, ADR 0028 s9).
 * WebSearch is offered but NEVER pre-approved: `allowedTools` is empty,
 * because the SDK auto-allows a tool named there without consulting
 * `canUseTool`, and the permission mode is `default`, because under
 * `dontAsk` an "ask" is denied without consulting it either. Every tool use
 * passes ONE per-call `WebSearchGate`, consulted from BOTH the PreToolUse
 * hook and `canUseTool`: a WebSearch is allowed only when its input is
 * exactly `{query: <the planned text>}` - no domain override, no other field
 * - and only once per provider call. The gate is then checked against the
 * stream itself: every tool-use block the SDK reported is counted, and more
 * than one WebSearch, a mismatched query, a domain override, or a WebSearch
 * the gate never approved fails the call `PROVIDER_SEARCH_BINDING_REFUSED`.
 *
 * FAIL CLOSED. Any tool request other than `WebSearch` (and the SDK's own
 * structured-output carrier) is denied AND fails the query
 * (`PROVIDER_TOOL_REFUSED`); any binding violation fails it
 * `PROVIDER_SEARCH_BINDING_REFUSED`; both hold even if the stream then
 * returns results, and results returned without the one approved search are
 * refused too. A usage-limit or authentication failure the SDK seam
 * recognised is its own code; the adapter itself reads no free text.
 *
 * KEPT SEPARATE FROM THE CLASSIFIER. It reuses nothing from `classify/`: its
 * options, prompt, output schema and result handling are its own.
 *
 * THE NESTED SEARCHES ARE BOUNDED BY WHAT IS KEPT (WW H-SD, ADR 0028 s9).
 * The bundled executable's WebSearch tool does not search itself: it runs a
 * NESTED side query that may make up to 8 server-side searches whose texts
 * the side-query model chooses and this build cannot inspect - those
 * server_tool_use blocks never reach the outer stream, so the gate above
 * binds only the OUTER input. What the tool does report, in the user
 * message's `tool_use_result`, is how many searches it made (`searchCount`)
 * and every hit URL. So a call keeps results ONLY when the one approved
 * WebSearch reported exactly ONE search and every returned URL is one of
 * that search's own hit URLs; anything else - several searches, a URL the
 * search never returned, no tool result at all, or no search - fails the call
 * `PROVIDER_SEARCH_BINDING_REFUSED`. The SDK seam also caps the session at
 * ONE outer WebSearch call (`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION=1`,
 * agentQuery.ts), so at most one side query runs per provider call.
 *
 * OPEN (UNKNOWN, not tested live): whether the live SDK invokes the
 * PreToolUse hook and/or `canUseTool` for WebSearch under these options, and
 * how structured output behaves under the gate. The reading above comes from
 * the bundled executable's code, not a live call; the D8 smoke must confirm
 * the hook is invoked (the run result reports `searchGate`) before an OWNER
 * records a smoke verification (migration 0025) and anything relies on it.
 */
import { z } from 'zod';

import { SourceDiscoveryAuthorisation } from './authorisation.js';
import {
  MAX_RESULTS_PER_QUERY,
  SearchProviderError,
  type SearchGateObservation,
  type SearchProvider,
  type SearchRequest,
  type SearchResponse,
} from './provider.js';

/** The one tool this adapter may use. */
export const WEB_SEARCH_TOOL = 'WebSearch';

/** Built-in tools named explicitly as refused, on top of offering only WebSearch. */
export const REFUSED_TOOLS: readonly string[] = Object.freeze([
  'WebFetch',
  'Bash',
  'BashOutput',
  'KillShell',
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Glob',
  'Grep',
  'Task',
  'Agent',
  'TodoWrite',
  'Skill',
  'SlashCommand',
  'ExitPlanMode',
  'ListMcpResources',
  'ReadMcpResource',
]);

export const WEB_SEARCH_MAX_TURNS = 4;

/**
 * The SDK's own structured-output carrier (the `outputFormat` json_schema
 * mechanism ends the turn with a tool use of this name). It performs no
 * search and reaches no network; the gate passes it through untouched and
 * the stream check does not count it as a search. Static reading of the
 * bundled 0.3.251 executable, not a live observation (ADR 0028 s9).
 */
export const STRUCTURED_OUTPUT_CARRIER = 'StructuredOutput';

/**
 * How many searches the approved WebSearch may report (its NESTED side query
 * can make up to 8 - ADR 0028 s9). Anything else keeps nothing.
 */
export const WEB_SEARCH_REQUIRED_SEARCH_COUNT = 1;

/** The SDK's WebSearch input fields that would widen or narrow the search: never permitted. */
export const WEB_SEARCH_DOMAIN_OVERRIDES: readonly string[] = Object.freeze([
  'allowed_domains',
  'blocked_domains',
]);

export type ToolPermission =
  | { readonly behavior: 'allow'; readonly updatedInput: Record<string, unknown> }
  | { readonly behavior: 'deny'; readonly message: string; readonly interrupt?: boolean };

/** The PreToolUse hook's closed verdict. `pass` takes no decision: the permission flow continues. */
export type PreToolUseVerdict =
  { readonly decision: 'pass' } | { readonly decision: 'deny'; readonly reason: string };

/** One PreToolUse hook input, reduced to the three fields the gate reads. */
export interface PreToolUseCheck {
  readonly toolName: string;
  readonly toolInput: unknown;
  readonly toolUseId: string;
}

/** The exact option object this adapter hands the SDK. Hermetic and closed. */
export interface WebSearchAgentOptions {
  readonly tools: readonly string[];
  /**
   * EMPTY. A tool named here is auto-allowed WITHOUT consulting `canUseTool`
   * (sdk.d.ts `allowedTools`), so naming WebSearch here would leave the
   * query binding to the prompt alone.
   */
  readonly allowedTools: readonly string[];
  readonly disallowedTools: readonly string[];
  readonly canUseTool: (
    toolName: string,
    input: Record<string, unknown>,
    toolUseId: string,
  ) => Promise<ToolPermission>;
  /** Registered as the session's ONE PreToolUse hook (no matcher: every tool use). */
  readonly preToolUse: (check: PreToolUseCheck) => Promise<PreToolUseVerdict>;
  /**
   * `default`, NOT `dontAsk`: under `dontAsk` an "ask" is denied without
   * consulting `canUseTool`, and WebSearch's own permission check answers
   * "ask" - so `default` is the mode in which `canUseTool` is actually
   * invoked for it (static reading of the bundled executable; the live D8
   * smoke must confirm it).
   */
  readonly permissionMode: 'default';
  readonly settingSources: readonly string[];
  readonly mcpServers: Readonly<Record<string, never>>;
  readonly strictMcpConfig: true;
  readonly persistSession: false;
  readonly maxTurns: number;
  readonly outputFormat: { readonly type: 'json_schema'; readonly schema: Record<string, unknown> };
}

/**
 * One tool-use block the SDK seam saw in an assistant message. Held IN
 * MEMORY for the duration of one call, compared against the gate, and
 * dropped: never logged, never stored, never returned.
 */
export interface AgentToolUse {
  readonly kind: 'tool_use' | 'server_tool_use' | 'mcp_tool_use';
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

/**
 * One tool result the SDK seam saw in a user message (WW H-SD, P1-3): the
 * tool-use id it answers and - only when the message answered exactly one
 * tool use and its `tool_use_result` had the WebSearch output shape - the
 * search the tool REPORTED: its query, its `searchCount` and every hit URL.
 * Hit titles and the model's commentary never cross. Held IN MEMORY for one
 * call, compared and dropped: never logged, stored or returned.
 */
export interface AgentToolResult {
  readonly toolUseId: string;
  readonly webSearch: {
    readonly query: string | null;
    readonly searchCount: number | null;
    readonly resultUrls: readonly string[];
  } | null;
}

/** The subset of an SDK message this adapter reads. Everything else is ignored, never logged. */
export interface AgentMessage {
  readonly type: string;
  readonly subtype?: string;
  readonly is_error?: boolean;
  readonly structured_output?: unknown;
  /**
   * Set ONLY by the live SDK seam (agentQuery.ts) on a terminal result it
   * recognised, from the SDK's own usage-limit vocabulary or an
   * authentication marker. A closed value; never free text.
   */
  readonly failure?: 'USAGE_LIMIT_EXHAUSTED' | 'AUTH_FAILURE' | 'DEADLINE_EXCEEDED';
  /** On an assistant message: every tool-use block it carried. */
  readonly toolUses?: readonly AgentToolUse[];
  /** On a user message: every tool result it carried (WW H-SD, P1-3). */
  readonly toolResults?: readonly AgentToolResult[];
}

/** The shape of the SDK's `query` entry point, as injected. Tests pass a fake. */
export type AgentQueryFn = (args: {
  readonly prompt: string;
  readonly options: WebSearchAgentOptions;
  /** WW H-SD (P2-15a): abort the call after this many ms (the request's `deadlineMs`). */
  readonly deadlineMs?: number;
}) => AsyncIterable<AgentMessage>;

/**
 * THE WEBSEARCH GATE FOR ONE PROVIDER CALL (ADR 0028 s9). Consulted by BOTH
 * the PreToolUse hook and `canUseTool`, so the binding holds if either SDK
 * surface is invoked. It allows a WebSearch ONLY when:
 *
 *   - its input is exactly `{query}` - no `allowed_domains`, no
 *     `blocked_domains`, no other field - and `query` equals the planned
 *     query text byte for byte; and
 *   - it is the FIRST WebSearch tool use of the call (keyed by tool-use id,
 *     so the hook and `canUseTool` checking the same use agree): a second,
 *     sequential or parallel, is denied.
 *
 * Any other tool is denied (the structured-output carrier passes untouched).
 * Every denial is REMEMBERED, and the call fails closed on it even if the
 * stream then returns results.
 */
export class WebSearchGate {
  readonly #plannedQuery: string;
  #approvedToolUseId: string | null = null;
  #hookInvoked = false;
  #permissionInvoked = false;
  #searchCount: number | null = null;
  readonly #refusedTools: string[] = [];
  readonly #bindingViolations: string[] = [];

  constructor(plannedQuery: string) {
    this.#plannedQuery = plannedQuery;
  }

  get plannedQuery(): string {
    return this.#plannedQuery;
  }

  get approvedToolUseId(): string | null {
    return this.#approvedToolUseId;
  }

  get refusedTools(): readonly string[] {
    return [...new Set(this.#refusedTools)].sort();
  }

  get bindingViolations(): readonly string[] {
    return [...new Set(this.#bindingViolations)].sort();
  }

  get observation(): SearchGateObservation {
    return {
      hookInvoked: this.#hookInvoked,
      permissionInvoked: this.#permissionInvoked,
      searchCount: this.#searchCount,
    };
  }

  /** Why `input` is not exactly the planned search, or null when it is. */
  bindingProblem(input: unknown): string | null {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return 'WebSearch input is not an object';
    }
    const keys = Object.keys(input);
    if (keys.some((k) => WEB_SEARCH_DOMAIN_OVERRIDES.includes(k))) {
      return 'WebSearch input carries a domain override';
    }
    if (keys.length !== 1 || keys[0] !== 'query') {
      return 'WebSearch input carries a field other than query';
    }
    if ((input as { query: unknown }).query !== this.#plannedQuery) {
      return 'WebSearch query differs from the planned query';
    }
    return null;
  }

  /** One check, from either SDK surface. */
  check(
    toolName: string,
    input: unknown,
    toolUseId: string,
    via: 'hook' | 'permission',
  ): { readonly allow: true } | { readonly allow: false; readonly reason: string } | 'carrier' {
    if (toolName === STRUCTURED_OUTPUT_CARRIER) return 'carrier';
    if (toolName !== WEB_SEARCH_TOOL) {
      this.#refusedTools.push(toolName);
      return { allow: false, reason: `source discovery permits ${WEB_SEARCH_TOOL} only` };
    }
    const deny = (reason: string) => {
      this.#bindingViolations.push(reason);
      return { allow: false as const, reason };
    };
    if (typeof toolUseId !== 'string' || toolUseId.length === 0) {
      return deny('WebSearch tool use carries no id');
    }
    const problem = this.bindingProblem(input);
    if (problem !== null) return deny(problem);
    if (this.#approvedToolUseId === null) {
      this.#approvedToolUseId = toolUseId;
    } else if (this.#approvedToolUseId !== toolUseId) {
      return deny('a second WebSearch in one provider call');
    }
    if (via === 'hook') this.#hookInvoked = true;
    else this.#permissionInvoked = true;
    return { allow: true };
  }

  /**
   * The stream check, after the terminal result: every tool use the SDK
   * reported must be the structured-output carrier or the ONE approved
   * WebSearch, carrying exactly the planned input. A WebSearch the gate
   * never approved - more than one, a different query, a domain override,
   * or one no gate surface was consulted for - is a binding violation.
   */
  observeStream(toolUses: readonly AgentToolUse[]): void {
    const searches = new Map<string, unknown>();
    for (const use of toolUses) {
      if (use.kind === 'tool_use' && use.name === STRUCTURED_OUTPUT_CARRIER) continue;
      if (use.kind !== 'tool_use' || use.name !== WEB_SEARCH_TOOL) {
        this.#refusedTools.push(use.name);
        continue;
      }
      searches.set(use.id, use.input);
    }
    if (searches.size > 1) this.#bindingViolations.push('more than one WebSearch in the stream');
    for (const [id, input] of searches) {
      const problem = this.bindingProblem(input);
      if (problem !== null) this.#bindingViolations.push(problem);
      if (id !== this.#approvedToolUseId) {
        this.#bindingViolations.push('a WebSearch in the stream the gate never approved');
      }
    }
    if (this.#approvedToolUseId !== null && !searches.has(this.#approvedToolUseId)) {
      this.#bindingViolations.push('the approved WebSearch never appeared in the stream');
    }
  }

  /**
   * The search-result check (WW H-SD, P1-3), after a schema-valid terminal
   * result: the call made the ONE approved WebSearch; that tool use has
   * exactly one tool result carrying the WebSearch output shape; it reported
   * exactly ONE search (its nested side query may make up to 8, with texts
   * this build cannot inspect) for the planned query; and every URL the
   * call returns is one of that search's own hit URLs. Anything else is a
   * binding violation, so nothing from the call is kept.
   */
  observeSearchResult(
    toolResults: readonly AgentToolResult[],
    returnedUrls: readonly string[],
  ): void {
    if (this.#approvedToolUseId === null) {
      this.#bindingViolations.push('no WebSearch was made');
      return;
    }
    const answers = toolResults.filter((r) => r.toolUseId === this.#approvedToolUseId);
    if (answers.length !== 1 || answers[0]!.webSearch === null) {
      this.#bindingViolations.push('the approved WebSearch reported no single search result');
      return;
    }
    const reported = answers[0]!.webSearch;
    this.#searchCount = reported.searchCount;
    if (reported.searchCount !== WEB_SEARCH_REQUIRED_SEARCH_COUNT) {
      this.#bindingViolations.push(
        `the WebSearch reported ${reported.searchCount ?? 'no'} searches, not exactly one`,
      );
    }
    if (reported.query !== this.#plannedQuery) {
      this.#bindingViolations.push('the WebSearch reported a query other than the planned query');
    }
    const hits = new Set(reported.resultUrls);
    if (returnedUrls.some((url) => !hits.has(url))) {
      this.#bindingViolations.push("a returned URL is not one of the search's own results");
    }
  }
}

const OUTPUT_JSON_SCHEMA: Record<string, unknown> = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      maxItems: MAX_RESULTS_PER_QUERY,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['url', 'title', 'snippet'],
        properties: {
          url: { type: 'string', maxLength: 2048 },
          title: { type: ['string', 'null'], maxLength: 1000 },
          snippet: { type: ['string', 'null'], maxLength: 4000 },
        },
      },
    },
  },
});

const OutputSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            url: z.string().max(2048),
            title: z.string().max(1000).nullable(),
            snippet: z.string().max(4000).nullable(),
          })
          .strict(),
      )
      .max(MAX_RESULTS_PER_QUERY),
  })
  .strict();

/**
 * Builds this adapter's own options around ONE call's gate. Nothing here
 * comes from `classify/`. WebSearch is OFFERED (`tools`) but never
 * pre-approved (`allowedTools` is empty): every use passes the gate.
 */
export function buildWebSearchAgentOptions(gate: WebSearchGate): WebSearchAgentOptions {
  return Object.freeze({
    tools: Object.freeze([WEB_SEARCH_TOOL]),
    allowedTools: Object.freeze([]),
    disallowedTools: REFUSED_TOOLS,
    canUseTool: async (
      toolName: string,
      input: Record<string, unknown>,
      toolUseId: string,
    ): Promise<ToolPermission> => {
      const verdict = gate.check(toolName, input, toolUseId, 'permission');
      if (verdict === 'carrier') return { behavior: 'allow', updatedInput: input };
      if (verdict.allow) return { behavior: 'allow', updatedInput: { query: gate.plannedQuery } };
      return { behavior: 'deny', message: verdict.reason, interrupt: true };
    },
    preToolUse: async (check: PreToolUseCheck): Promise<PreToolUseVerdict> => {
      const verdict = gate.check(check.toolName, check.toolInput, check.toolUseId, 'hook');
      if (verdict === 'carrier' || verdict.allow) return { decision: 'pass' };
      return { decision: 'deny', reason: verdict.reason };
    },
    permissionMode: 'default' as const,
    settingSources: Object.freeze([]),
    mcpServers: Object.freeze({}),
    strictMcpConfig: true as const,
    persistSession: false as const,
    maxTurns: WEB_SEARCH_MAX_TURNS,
    outputFormat: Object.freeze({ type: 'json_schema' as const, schema: OUTPUT_JSON_SCHEMA }),
  });
}

/** The deterministic instruction for ONE query. Asks for nominations, never for page contents. */
export function buildWebSearchPrompt(request: SearchRequest): string {
  return [
    'You are helping an organisation directory find PUBLIC organisations for language learners.',
    `Run the ${WEB_SEARCH_TOOL} tool for exactly this query and nothing else:`,
    JSON.stringify(request.query.text),
    `Return at most ${MAX_RESULTS_PER_QUERY} results as {"results":[{"url","title","snippet"}]},`,
    'copying each url, title and snippet exactly as the search returned them.',
    'Do not open, fetch or summarise any page. Do not include personal profiles,',
    'social-media pages, people, email addresses or telephone numbers.',
  ].join('\n');
}

export interface ClaudeMaxWebSearchDeps {
  readonly query: AgentQueryFn;
  /** When results were retrieved. Injected so the adapter itself reads no clock. */
  readonly now: () => Date;
}

export class ClaudeMaxWebSearchProvider implements SearchProvider {
  readonly providerKey = 'claude-max-web-search' as const;
  readonly #deps: ClaudeMaxWebSearchDeps;
  readonly #authorisation: SourceDiscoveryAuthorisation;

  constructor(authorisation: SourceDiscoveryAuthorisation, deps: ClaudeMaxWebSearchDeps) {
    if (!SourceDiscoveryAuthorisation.isAuthorisation(authorisation)) {
      throw new SearchProviderError(
        'PROVIDER_NOT_AUTHORISED',
        'ClaudeMaxWebSearchProvider requires a SourceDiscoveryAuthorisation this build constructed.',
      );
    }
    this.#deps = deps;
    this.#authorisation = authorisation;
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    if (!this.#authorisation.covers(request)) {
      throw new SearchProviderError(
        'PROVIDER_NOT_AUTHORISED',
        `query ${request.query.queryId} (${request.geography}) is outside the stored grant.`,
      );
    }
    const gate = new WebSearchGate(request.query.text);
    const options = buildWebSearchAgentOptions(gate);
    const toolUses: AgentToolUse[] = [];
    const toolResults: AgentToolResult[] = [];
    let terminal: AgentMessage | null = null;
    for await (const message of this.#deps.query({
      prompt: buildWebSearchPrompt(request),
      options,
      ...(request.deadlineMs !== undefined ? { deadlineMs: request.deadlineMs } : {}),
    })) {
      if (message.toolUses !== undefined) toolUses.push(...message.toolUses);
      if (message.toolResults !== undefined) toolResults.push(...message.toolResults);
      if (message.type === 'result') {
        terminal = message;
        break; // terminal means terminal: never pull past the result
      }
    }
    gate.observeStream(toolUses);
    if (gate.refusedTools.length > 0) {
      throw new SearchProviderError(
        'PROVIDER_TOOL_REFUSED',
        `the provider requested a refused tool (${gate.refusedTools.join(', ')}).`,
        gate.observation,
      );
    }
    if (gate.bindingViolations.length > 0) {
      throw new SearchProviderError(
        'PROVIDER_SEARCH_BINDING_REFUSED',
        `the provider's search was not the one planned query (${gate.bindingViolations.join('; ')}).`,
        gate.observation,
      );
    }
    if (terminal === null) {
      throw new SearchProviderError(
        'PROVIDER_RESULT_MISSING',
        'the stream ended without a result.',
        gate.observation,
      );
    }
    if (terminal.failure === 'DEADLINE_EXCEEDED') {
      throw new SearchProviderError(
        'PROVIDER_DEADLINE_EXCEEDED',
        'the call reached its deadline before a result; the stream was aborted.',
        gate.observation,
      );
    }
    if (terminal.failure === 'USAGE_LIMIT_EXHAUSTED') {
      throw new SearchProviderError(
        'PROVIDER_USAGE_LIMIT_EXHAUSTED',
        'the subscription usage limit was reached; no retry, no fallback.',
        gate.observation,
      );
    }
    if (terminal.failure === 'AUTH_FAILURE') {
      throw new SearchProviderError(
        'PROVIDER_AUTH_FAILURE',
        'the provider runtime reported an authentication failure.',
        gate.observation,
      );
    }
    if (terminal.subtype !== 'success' || terminal.is_error === true) {
      throw new SearchProviderError(
        'PROVIDER_RESULT_ERROR',
        `the provider ended with ${terminal.subtype ?? 'no subtype'}.`,
        gate.observation,
      );
    }
    const parsed = OutputSchema.safeParse(terminal.structured_output);
    if (!parsed.success) {
      throw new SearchProviderError(
        'PROVIDER_OUTPUT_INVALID',
        'structured output failed its schema.',
        gate.observation,
      );
    }
    // WW H-SD (P1-3): exactly one reported search, and only its own hit URLs.
    gate.observeSearchResult(
      toolResults,
      parsed.data.results.map((r) => r.url),
    );
    if (gate.bindingViolations.length > 0) {
      throw new SearchProviderError(
        'PROVIDER_SEARCH_BINDING_REFUSED',
        `the provider's results are not the one planned search's own (${gate.bindingViolations.join('; ')}).`,
        gate.observation,
      );
    }
    return {
      results: parsed.data.results,
      retrievedAt: this.#deps.now().toISOString(),
      searchGate: gate.observation,
    };
  }
}

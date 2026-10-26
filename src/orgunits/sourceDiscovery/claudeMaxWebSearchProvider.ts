/**
 * REL L2 / U1 - THE CLAUDE MAX WEB-SEARCH ADAPTER. WRITTEN, AND SEALED.
 *
 * WHAT IT WOULD DO. Ask the Agent SDK, on the owner's Claude Max subscription
 * (ADR 0009/0010), to run ONE brief query with the `WebSearch` tool and return
 * a bounded, schema-validated list of `{url, title, snippet}`. Nothing else:
 * `WebSearch` is the ONLY tool offered, allowed or permitted - no `WebFetch`,
 * no `Bash`, no `Read`, no file or MCP tool - and `canUseTool` denies any other
 * name even if one were somehow offered. Search results are nominations, never
 * pages: nothing the adapter returns is fetched by anything.
 *
 * WHY IT CANNOT RUN. Live search is not authorised (OWNER directive
 * 2026-10-26). The constructor requires a `SourceDiscoveryAuthorisation`,
 * checked by its private BRAND, and that capability's only constructor throws
 * outside vitest. The SDK's `query` function is INJECTED: this file does not
 * import the SDK package at all, and no production module passes it the real
 * one - the single SDK import site stays `classify/provider/agentSdkRunner.ts`,
 * which this namespace may not import. Wiring a real `query` here, choosing
 * the subscription profile and applying the ADR 0010 auth-conflict guard are
 * all work for a separately authorised phase.
 *
 * KEPT SEPARATE FROM THE CLASSIFIER. It reuses nothing from `classify/`: its
 * options, prompt, output schema and result handling are its own.
 *
 * OPEN (UNKNOWN, not tested live): how the SDK's structured-output mechanism
 * interacts with a `canUseTool` that admits `WebSearch` only. A live phase
 * must verify it before any real call.
 */
import { z } from 'zod';

import { SourceDiscoveryAuthorisation } from './authorisation.js';
import {
  MAX_RESULTS_PER_QUERY,
  SearchProviderError,
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

export type ToolPermission =
  | { readonly behavior: 'allow'; readonly updatedInput: Record<string, unknown> }
  | { readonly behavior: 'deny'; readonly message: string };

/** The exact option object this adapter hands the SDK. Hermetic and closed. */
export interface WebSearchAgentOptions {
  readonly tools: readonly string[];
  readonly allowedTools: readonly string[];
  readonly disallowedTools: readonly string[];
  readonly canUseTool: (
    toolName: string,
    input: Record<string, unknown>,
  ) => Promise<ToolPermission>;
  readonly permissionMode: 'dontAsk';
  readonly settingSources: readonly string[];
  readonly mcpServers: Readonly<Record<string, never>>;
  readonly strictMcpConfig: true;
  readonly persistSession: false;
  readonly maxTurns: number;
  readonly outputFormat: { readonly type: 'json_schema'; readonly schema: Record<string, unknown> };
}

/** The subset of an SDK message this adapter reads. Everything else is ignored, never logged. */
export interface AgentMessage {
  readonly type: string;
  readonly subtype?: string;
  readonly is_error?: boolean;
  readonly structured_output?: unknown;
}

/** The shape of the SDK's `query` entry point, as injected. Tests pass a fake. */
export type AgentQueryFn = (args: {
  readonly prompt: string;
  readonly options: WebSearchAgentOptions;
}) => AsyncIterable<AgentMessage>;

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

async function onlyWebSearch(
  toolName: string,
  input: Record<string, unknown>,
): Promise<ToolPermission> {
  if (toolName === WEB_SEARCH_TOOL) return { behavior: 'allow', updatedInput: input };
  return { behavior: 'deny', message: `source discovery permits ${WEB_SEARCH_TOOL} only` };
}

/** Builds this adapter's own options. Nothing here comes from `classify/`. */
export function buildWebSearchAgentOptions(): WebSearchAgentOptions {
  return Object.freeze({
    tools: Object.freeze([WEB_SEARCH_TOOL]),
    allowedTools: Object.freeze([WEB_SEARCH_TOOL]),
    disallowedTools: REFUSED_TOOLS,
    canUseTool: onlyWebSearch,
    permissionMode: 'dontAsk' as const,
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

  constructor(authorisation: SourceDiscoveryAuthorisation, deps: ClaudeMaxWebSearchDeps) {
    if (!SourceDiscoveryAuthorisation.isAuthorisation(authorisation)) {
      throw new SearchProviderError(
        'PROVIDER_NOT_AUTHORISED',
        'ClaudeMaxWebSearchProvider requires a SourceDiscoveryAuthorisation this build constructed.',
      );
    }
    this.#deps = deps;
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const options = buildWebSearchAgentOptions();
    let terminal: AgentMessage | null = null;
    for await (const message of this.#deps.query({
      prompt: buildWebSearchPrompt(request),
      options,
    })) {
      if (message.type === 'result') {
        terminal = message;
        break; // terminal means terminal: never pull past the result
      }
    }
    if (terminal === null) {
      throw new SearchProviderError(
        'PROVIDER_RESULT_MISSING',
        'the stream ended without a result.',
      );
    }
    if (terminal.subtype !== 'success' || terminal.is_error === true) {
      throw new SearchProviderError(
        'PROVIDER_RESULT_ERROR',
        `the provider ended with ${terminal.subtype ?? 'no subtype'}.`,
      );
    }
    const parsed = OutputSchema.safeParse(terminal.structured_output);
    if (!parsed.success) {
      throw new SearchProviderError(
        'PROVIDER_OUTPUT_INVALID',
        'structured output failed its schema.',
      );
    }
    return { results: parsed.data.results, retrievedAt: this.#deps.now().toISOString() };
  }
}

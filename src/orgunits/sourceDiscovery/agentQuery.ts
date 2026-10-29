/**
 * WW E-SD / ADR 0027 D2-D3, ADR 0028 - THE ONE SOURCE-DISCOVERY AGENT SDK
 * IMPORT SITE.
 *
 * This module is the only file under `src/orgunits/sourceDiscovery/` that
 * imports `@anthropic-ai/claude-agent-sdk`, and the only one that reaches
 * `src/orgunits/classify/` - and there it imports EXACTLY the eight ADR 0010
 * authentication modules ADR 0027 D3 names, each by exact path (`profile`,
 * `profileHygiene`, `preflight`, `authConflicts`, `authStatus`,
 * `authStatusRunner`, `environment`, `claudeCodeExecutable`). Nothing else in
 * `classify/` - no prompt, schema, runner, provider or outcome mapping - is
 * reachable from here (`wwSourceDiscoveryLive.firewall.test.ts`).
 *
 * WHAT `prepareLiveSearch` DOES, IN ORDER, BEFORE ANY QUERY (each fatal):
 *
 *   1. the ADR 0010 pre-flight: the 14-name conflicting-auth refusal, the
 *      setup-token prohibition, the dedicated stored-login profile directory,
 *      the closed SOURCE-DISCOVERY model allowlist, the turn bound;
 *   2. profile hygiene (names-only readdir);
 *   3. the SDK-bundled Claude Code executable, verified;
 *   4. a fresh, empty scratch working directory;
 *   5. the sanitised child environment - re-checked here to carry no
 *      conflicting-auth variable and no setup token;
 *   6. the request-free `claude auth status --json` check (logged in,
 *      `claude.ai`, first party, Max).
 *
 * Only then does it return a `query` the adapter can call. Every call runs
 * with the adapter's WebSearch-only options (`buildWebSearchAgentOptions`:
 * WebSearch the only tool offered, NEVER pre-approved - `allowedTools` is
 * empty and the permission mode `default` - so every use reaches the
 * adapter's per-call gate through BOTH the PreToolUse hook registered here
 * and `canUseTool`; WebFetch refused by name, no MCP, no skills, no plugins,
 * no setting sources, no persisted session) plus the runtime fields this seam
 * owns: the granted model, the
 * child environment, the scratch cwd, the verified executable, thinking
 * disabled, and an abort deadline. No API key, PAYG, Bedrock, Vertex or other
 * provider is expressible: the conflicting variables are refused, never
 * forwarded.
 *
 * ONE OUTER WEBSEARCH PER SESSION (WW H-SD, ADR 0028 s9). The child
 * environment carries `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION=1`. Read
 * from the bundled 2.1.251 executable (static reading, not a live call): the
 * variable is parsed as an integer >= 1 (default 200) and caps the number of
 * WebSearch TOOL CALLS a session performs - a call past the cap returns "Web
 * search was not performed" with `searchCount: 0`. It does NOT cap the tool's
 * NESTED side query, which is sent with `web_search_20250305` and a
 * hard-coded `max_uses: 8` that no setting or variable reaches; that query's
 * server-side searches (and the texts its model chooses) never reach this
 * stream. What IS bounded, and how: one outer call per provider call (this
 * cap, plus the adapter's gate); and what is KEPT - the adapter keeps a
 * call's results only when its WebSearch reported `searchCount === 1` and
 * every returned URL is one of that search's own hits (`tool_use_result`,
 * mapped below). Each provider call is its own session (`persistSession:
 * false`, a fresh subprocess), so the cap is per call.
 *
 * MANAGED POLICY STILL APPLIES. `settingSources: []` skips the user,
 * project and local settings files only; the CLI still loads the
 * managed-settings policy tier (sdk.d.ts `resolveSettings`: "the
 * managed-settings policy tier is still read from disk"). A managed policy
 * could pre-approve WebSearch (so `canUseTool` is not consulted), restrict or
 * disable hooks (UNKNOWN whether that reaches an SDK callback hook), or set
 * this cap differently. The PreToolUse hook still gates the outer input
 * whenever the CLI runs it; the stream check refuses any WebSearch neither
 * surface approved; the search-result check above bounds what is kept; and
 * the database will not record an OWNER smoke verification for a smoke whose
 * hook was not invoked or that did not report exactly one search
 * (migration 0027).
 *
 * THE DEADLINE (WW H-SD, P2-15a). A call is aborted after the SMALLER of the
 * mechanical bound below and the caller's `deadlineMs` - a granted run passes
 * the time its grant has left by the DATABASE clock at the call's start - so
 * no search outlives its grant. An aborted call ends with a closed
 * `DEADLINE_EXCEEDED` terminal; nothing it streamed is kept.
 *
 * WHAT IT READS FROM A RESULT. The SDK stream is mapped to the adapter's
 * closed `AgentMessage` shape: type, subtype, is_error, structured_output,
 * - on a failed terminal result only - a CLOSED `failure` value recognised
 * from the SDK's own usage-limit vocabulary or an authentication marker, and
 * - on an assistant message - its tool-use blocks (kind, id, name, input),
 * which the adapter counts and compares against its gate IN MEMORY (ADR 0028
 * s9), and - on a user message - the tool-use ids its tool results answer
 * plus, for a WebSearch output, the reported query, `searchCount` and hit
 * URLs (never the hit titles or the model's commentary). No prompt, result text, transcript or session id leaves this
 * function, and nothing here logs or stores one.
 *
 * Nothing in CI calls the real SDK: every test injects `sdkQuery`, the
 * auth-status runner and the executable resolver.
 */
import {
  query as agentSdkQuery,
  USAGE_LIMIT_ERROR_PREFIXES,
  type Options,
} from '@anthropic-ai/claude-agent-sdk';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FORBIDDEN_AUTH_VARIABLES,
  PROHIBITED_SETUP_TOKEN_VARIABLE,
} from '../classify/provider/authConflicts.js';
import { evaluateAuthStatus, type AuthStatusExecution } from '../classify/provider/authStatus.js';
import {
  createProductionAuthStatusRunner,
  type ClassifierAuthStatusRunner,
} from '../classify/provider/authStatusRunner.js';
import {
  resolveProductionClaudeCodeExecutable,
  type ClaudeCodeExecutableResolver,
} from '../classify/provider/claudeCodeExecutable.js';
import { buildChildEnvironment } from '../classify/provider/environment.js';
import { runClassifierPreflight } from '../classify/provider/preflight.js';
import { CLASSIFIER_PROFILE_DIR_VARIABLE } from '../classify/provider/profile.js';
import { checkProfileHygiene } from '../classify/provider/profileHygiene.js';
import {
  WEB_SEARCH_MAX_TURNS,
  type AgentMessage,
  type AgentQueryFn,
  type AgentToolResult,
  type AgentToolUse,
  type WebSearchAgentOptions,
} from './claudeMaxWebSearchProvider.js';
import { SOURCE_DISCOVERY_ALLOWED_MODELS } from './grant.js';

/** Mechanical safety bound: one query's stream is aborted after this long. Not a calibrated value. */
export const SOURCE_DISCOVERY_QUERY_DEADLINE_MS = 300_000;

/**
 * Fixed, non-secret flags set on EVERY source-discovery subprocess on top of
 * the ADR 0010 child environment (WW H-SD, P1-3): at most ONE WebSearch tool
 * call per session. A named exported constant so the firewall can pin it.
 */
export const SOURCE_DISCOVERY_CHILD_ENV_FIXED: Readonly<Record<string, string>> = Object.freeze({
  CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION: '1',
});

/** The scratch-directory prefix, distinct from the classifier's own. */
export const SOURCE_DISCOVERY_SCRATCH_PREFIX = 'nwf-pe-source-discovery-';

/** The subset of an SDK stream message this seam reads. */
export interface SdkStreamMessage {
  readonly type: string;
  readonly subtype?: string;
  readonly is_error?: boolean;
  readonly structured_output?: unknown;
  readonly result?: unknown;
  readonly errors?: unknown;
  /** An assistant message's Messages-API body; only its tool-use blocks are read. */
  readonly message?: unknown;
  /** A user message's structured tool output; only a WebSearch output's count, query and URLs are read. */
  readonly tool_use_result?: unknown;
}

/** The SDK's `query` entry point, as injected. Production: the SDK's own `query`. */
export type SdkQueryFn = (args: {
  readonly prompt: string;
  readonly options: Options;
}) => AsyncIterable<SdkStreamMessage>;

/** The request-free auth-status runner (ADR 0010), re-exported as this namespace's type. */
export type LiveAuthStatusRunner = ClassifierAuthStatusRunner;
export type LiveExecutableResolver = ClaudeCodeExecutableResolver;

export interface LiveSearchDeps {
  readonly sdkQuery: SdkQueryFn;
  readonly authStatusRunner: LiveAuthStatusRunner;
  /** The orchestration-process environment. Default: a `process.env` snapshot. */
  readonly env?: () => Readonly<Record<string, string | undefined>>;
  /** The repository root (the profile may not live inside it). Default: `process.cwd()`. */
  readonly repoRoot?: string;
  /** Default: the SDK-bundled executable under this package root, verified. */
  readonly claudeCodeExecutable?: LiveExecutableResolver;
}

export interface LiveSearchRuntime {
  /** The adapter's injected `query`, bound to the granted model and this runtime. */
  readonly query: AgentQueryFn;
  /** The installed Agent SDK version, from the verified executable's provenance. */
  readonly sdkVersion: string;
  /** Removes the scratch directory. Idempotent. */
  close(): Promise<void>;
}

export type LiveSearchPreparation =
  | { readonly ok: true; readonly runtime: LiveSearchRuntime }
  | { readonly ok: false; readonly kind: string; readonly detail: string };

/** Lower-case markers of an authentication failure in a FAILED terminal result. */
const AUTH_FAILURE_MARKERS: readonly string[] = [
  'authentication_error',
  'authentication failed',
  'oauth token',
  'not logged in',
  'please run /login',
];

function failureOf(message: SdkStreamMessage): AgentMessage['failure'] {
  if (message.subtype === 'success' && message.is_error !== true) return undefined;
  const errors = Array.isArray(message.errors)
    ? message.errors.filter((e): e is string => typeof e === 'string')
    : [];
  const text = [typeof message.result === 'string' ? message.result : '', ...errors].join('\n');
  if (USAGE_LIMIT_ERROR_PREFIXES.some((prefix) => text.includes(prefix))) {
    return 'USAGE_LIMIT_EXHAUSTED';
  }
  const lower = text.toLowerCase();
  if (AUTH_FAILURE_MARKERS.some((m) => lower.includes(m)) || /\b401\b/.test(lower)) {
    return 'AUTH_FAILURE';
  }
  return undefined;
}

const TOOL_USE_KINDS: ReadonlySet<string> = new Set([
  'tool_use',
  'server_tool_use',
  'mcp_tool_use',
]);

/** Every tool-use block of an assistant message, for the adapter's stream count. */
function toolUsesOf(message: SdkStreamMessage): AgentToolUse[] {
  const content = (message.message as { content?: unknown } | null | undefined)?.content;
  if (!Array.isArray(content)) return [];
  const uses: AgentToolUse[] = [];
  for (const block of content as unknown[]) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as { type?: unknown; id?: unknown; name?: unknown; input?: unknown };
    if (typeof b.type !== 'string' || !TOOL_USE_KINDS.has(b.type)) continue;
    uses.push({
      kind: b.type as AgentToolUse['kind'],
      id: typeof b.id === 'string' ? b.id : '',
      name: typeof b.name === 'string' ? b.name : '',
      input: b.input,
    });
  }
  return uses;
}

/** The tool-use ids a user message's tool-result blocks answer. */
function toolResultIdsOf(message: SdkStreamMessage): string[] {
  const content = (message.message as { content?: unknown } | null | undefined)?.content;
  if (!Array.isArray(content)) return [];
  const ids: string[] = [];
  for (const block of content as unknown[]) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as { type?: unknown; tool_use_id?: unknown };
    if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') ids.push(b.tool_use_id);
  }
  return ids;
}

/**
 * The WebSearch output shape (sdk-tools.d.ts `WebSearchOutput`: `query`,
 * `results` of `{tool_use_id, content: {title, url}[]}` or commentary
 * strings, `durationSeconds`, optional `searchCount`), reduced to the query,
 * the count and the hit URLs. Anything else is null.
 */
function webSearchOutputOf(value: unknown): AgentToolResult['webSearch'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as { query?: unknown; results?: unknown; searchCount?: unknown };
  if (!Array.isArray(v.results)) return null;
  const resultUrls: string[] = [];
  for (const entry of v.results as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue; // commentary never crosses
    const hits = (entry as { content?: unknown }).content;
    if (!Array.isArray(hits)) continue;
    for (const hit of hits as unknown[]) {
      const url = (hit as { url?: unknown } | null)?.url;
      if (typeof url === 'string') resultUrls.push(url);
    }
  }
  return {
    query: typeof v.query === 'string' ? v.query : null,
    searchCount: Number.isInteger(v.searchCount) ? (v.searchCount as number) : null,
    resultUrls,
  };
}

/**
 * Every tool result of a user message. `tool_use_result` is ONE per
 * message, so it is attributed only when the message answers exactly one
 * tool use; otherwise no result carries a search (and the adapter refuses).
 */
function toolResultsOf(message: SdkStreamMessage): AgentToolResult[] {
  const ids = toolResultIdsOf(message);
  const webSearch = ids.length === 1 ? webSearchOutputOf(message.tool_use_result) : null;
  return ids.map((toolUseId) => ({ toolUseId, webSearch }));
}

/** Maps one SDK message to the adapter's closed shape. No prose crosses this line. */
export function toAgentMessage(message: SdkStreamMessage): AgentMessage {
  if (message.type === 'assistant') {
    const toolUses = toolUsesOf(message);
    return toolUses.length > 0 ? { type: message.type, toolUses } : { type: message.type };
  }
  if (message.type === 'user') {
    const toolResults = toolResultsOf(message);
    return toolResults.length > 0 ? { type: message.type, toolResults } : { type: message.type };
  }
  if (message.type !== 'result') return { type: message.type };
  const failure = failureOf(message);
  return {
    type: message.type,
    ...(message.subtype !== undefined ? { subtype: message.subtype } : {}),
    ...(message.is_error !== undefined ? { is_error: message.is_error } : {}),
    ...(message.structured_output !== undefined
      ? { structured_output: message.structured_output }
      : {}),
    ...(failure !== undefined ? { failure } : {}),
  };
}

/** The SDK's own hook-callback type, derived from `Options` (no further SDK import). */
type SdkHookCallback = NonNullable<
  NonNullable<Options['hooks']>['PreToolUse']
>[number]['hooks'][number];

/**
 * The session's ONE PreToolUse hook: every tool use is handed to the
 * adapter's gate. A deny is the SDK's own `permissionDecision: 'deny'` and
 * stops the session; a pass takes no decision, so the permission flow (and
 * `canUseTool`) still runs.
 */
export function preToolUseHook(o: WebSearchAgentOptions): SdkHookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    const verdict = await o.preToolUse({
      toolName: input.tool_name,
      toolInput: input.tool_input,
      toolUseId: input.tool_use_id,
    });
    if (verdict.decision === 'pass') return {};
    return {
      continue: false,
      stopReason: verdict.reason,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: verdict.reason,
      },
    };
  };
}

/** The closed terminal of an aborted call: no subtype the SDK uses, no prose. */
const DEADLINE_EXCEEDED_RESULT: AgentMessage = Object.freeze({
  type: 'result',
  subtype: 'error_deadline_exceeded',
  is_error: true,
  failure: 'DEADLINE_EXCEEDED' as const,
});

const refuse = (kind: string, detail: string): LiveSearchPreparation => ({
  ok: false,
  kind,
  detail,
});

/**
 * Runs every ADR 0010 guard, then returns a runtime whose `query` the
 * WebSearch-only adapter can call. Spawns ONE request-free auth-status
 * subprocess; makes no model call and no search.
 */
export async function prepareLiveSearch(
  deps: LiveSearchDeps,
  modelId: string,
): Promise<LiveSearchPreparation> {
  const parentEnv = (deps.env ?? (() => ({ ...process.env })))();
  const preflight = runClassifierPreflight({
    env: parentEnv,
    repoRoot: deps.repoRoot ?? process.cwd(),
    modelId,
    runConfig: { maxTurns: WEB_SEARCH_MAX_TURNS },
    allowedModels: SOURCE_DISCOVERY_ALLOWED_MODELS,
  });
  if (!preflight.ok) return refuse(preflight.kind, preflight.detail);

  const hygiene = await checkProfileHygiene(preflight.profileDir);
  if (!hygiene.ok) {
    return refuse(
      hygiene.kind,
      `${hygiene.detail} (the profile is the ADR 0010 dedicated profile; ` +
        `${CLASSIFIER_PROFILE_DIR_VARIABLE} selects it).`,
    );
  }

  const executable = (deps.claudeCodeExecutable ?? resolveProductionClaudeCodeExecutable)();
  if (!executable.ok) {
    return refuse(`CLAUDE_CODE_EXECUTABLE_${executable.kind}`, executable.detail);
  }
  const { executablePath, sdkVersion } = executable.provenance;

  const scratchDir = await mkdtemp(join(tmpdir(), SOURCE_DISCOVERY_SCRATCH_PREFIX));
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await rm(scratchDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  };
  try {
    if ((await readdir(scratchDir)).length > 0) {
      await close();
      return refuse('SCRATCH_NOT_EMPTY', 'the fresh scratch directory was not empty.');
    }
    const childEnv: Record<string, string> = {
      ...buildChildEnvironment({ parentEnv, configDir: preflight.profileDir }),
      ...SOURCE_DISCOVERY_CHILD_ENV_FIXED,
    };
    const leaked = [...FORBIDDEN_AUTH_VARIABLES, PROHIBITED_SETUP_TOKEN_VARIABLE].filter(
      (name) => childEnv[name] !== undefined,
    );
    if (leaked.length > 0) {
      await close();
      return refuse(
        'CHILD_ENVIRONMENT_CONFLICT',
        `the child environment carries ${leaked.join(', ')}; refused, never forwarded.`,
      );
    }

    let execution: AuthStatusExecution;
    try {
      execution = await deps.authStatusRunner.run({
        executablePath,
        env: childEnv,
        cwd: scratchDir,
      });
    } catch (error) {
      await close();
      return refuse(
        'AUTH_STATUS_UNAVAILABLE',
        `the request-free auth-status check could not run ` +
          `(${error instanceof Error ? error.message : 'unknown failure'}). No search was attempted.`,
      );
    }
    const status = evaluateAuthStatus(execution);
    if (!status.ok) {
      await close();
      return refuse(status.kind, status.detail);
    }

    const query: AgentQueryFn = (args) => {
      const o = args.options;
      return (async function* (): AsyncGenerator<AgentMessage> {
        // P2-15a: the smaller of the mechanical bound and the caller's deadline.
        const limitMs = Math.min(
          SOURCE_DISCOVERY_QUERY_DEADLINE_MS,
          args.deadlineMs ?? SOURCE_DISCOVERY_QUERY_DEADLINE_MS,
        );
        if (!(limitMs > 0)) {
          yield DEADLINE_EXCEEDED_RESULT; // no time left: the SDK is never called
          return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), limitMs);
        const options: Options = {
          model: modelId,
          tools: [...o.tools],
          allowedTools: [...o.allowedTools],
          disallowedTools: [...o.disallowedTools],
          canUseTool: (toolName, input, context) =>
            o.canUseTool(toolName, input, context.toolUseID),
          hooks: { PreToolUse: [{ hooks: [preToolUseHook(o)] }] },
          permissionMode: o.permissionMode,
          settingSources: [],
          mcpServers: {},
          strictMcpConfig: o.strictMcpConfig,
          persistSession: o.persistSession,
          skills: [],
          plugins: [],
          maxTurns: o.maxTurns,
          outputFormat: { type: 'json_schema', schema: { ...o.outputFormat.schema } },
          thinking: { type: 'disabled' },
          env: { ...childEnv },
          cwd: scratchDir,
          pathToClaudeCodeExecutable: executablePath,
          abortController: controller,
        };
        try {
          for await (const message of deps.sdkQuery({ prompt: args.prompt, options })) {
            if (controller.signal.aborted) break;
            yield toAgentMessage(message);
          }
        } catch (error) {
          if (!controller.signal.aborted) throw error;
        } finally {
          clearTimeout(timer);
        }
        if (controller.signal.aborted) yield DEADLINE_EXCEEDED_RESULT;
      })();
    };
    return { ok: true, runtime: { query, sdkVersion, close } };
  } catch (error) {
    await close();
    throw error;
  }
}

/** The production dependencies: the SDK's own `query` and the ADR 0010 auth-status runner. */
export function productionLiveSearchDeps(): LiveSearchDeps {
  return {
    sdkQuery: (args) => agentSdkQuery({ prompt: args.prompt, options: args.options }),
    authStatusRunner: createProductionAuthStatusRunner(),
  };
}

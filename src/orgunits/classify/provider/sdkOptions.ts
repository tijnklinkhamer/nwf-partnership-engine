/**
 * THE HERMETIC AGENT SDK INVOCATION BUILDER (Phase 2B-2C Max-runtime design
 * §§11, 14, 15, 20) — a PURE function from a provider-neutral request plus
 * the isolation context to the exact `{ prompt, options }` value handed to
 * the SDK-runner seam. Building the invocation in one pure module makes the
 * security-critical option surface STRUCTURALLY testable without any SDK
 * import: tests assert each field individually, never through a snapshot
 * that could silently admit a new tool.
 *
 * Every isolation control, and why it is set (all verified against the
 * pinned SDK's own typings):
 *
 *   - `settingSources: []`      — no user/project/local settings, no
 *                                 CLAUDE.md, no discovered skills/commands/
 *                                 subagents (design §11).
 *   - `persistSession: false`   — no session transcript survives; each
 *                                 batch is an independent observation
 *                                 (design §11; SDK default is true).
 *   - `tools: []`               — the pinned SDK version DOES expose a
 *                                 standalone `tools` option; the design
 *                                 (§14) said that when it exists it becomes
 *                                 the PRIMARY control, with the layers below
 *                                 retained as defense in depth.
 *   - `allowedTools: []`        — nothing auto-approved.
 *   - `disallowedTools`         — every built-in tool by exact bare name,
 *                                 removed from context.
 *   - `canUseTool`              — unconditional deny; a tool call that
 *                                 somehow survives every layer above is
 *                                 refused and interrupts the call.
 *   - `mcpServers: {}` +
 *     `strictMcpConfig: true`   — no MCP server, and no project/user/plugin
 *                                 MCP config honoured.
 *   - `skills: []`, `plugins: []`, no `agents`, no `hooks`, no
 *     `additionalDirectories`  — zero agent-extension surfaces (design §14
 *                                 item 5).
 *   - `systemPrompt`            — the frozen classifier prompt STRING from
 *                                 the request, verbatim; never the
 *                                 `claude_code` preset (design §15). One
 *                                 source of truth: `prompt.ts`, carried
 *                                 through the provider-neutral request.
 *   - `outputFormat`            — the SDK's strict JSON-schema structured
 *                                 output, fed the landed provider-facing
 *                                 schema from the request. No prose-JSON, no
 *                                 fence parsing, no salvage (design §20).
 *   - `maxTurns`                — small named default (3): headroom for the
 *                                 SDK's internal structured-output
 *                                 re-prompt, nothing agentic (design §15).
 *   - `env`                     — the allowlist-built child environment
 *                                 (environment.ts); REPLACES the subprocess
 *                                 environment entirely.
 *   - `cwd`                     — the per-invocation empty scratch directory
 *                                 (runtimeIsolation.ts).
 *   - `thinking`                — defaults to `{ type: 'disabled' }`
 *                                 (design §15); `'enabled'` maps to the
 *                                 SDK's adaptive mode, the only documented
 *                                 on-mode for current models. `effort` only
 *                                 when explicitly configured.
 *
 * DELIBERATELY ABSENT, asserted by the firewall: `fallbackModel` (a silent
 * provider-side model swap would contaminate 2B-2D cohorts), `resume` /
 * `forkSession` (no session may continue), `preset: 'claude_code'`, any
 * hook, any agent definition.
 *
 * PURE. No network, no database, no filesystem, no clock, no environment
 * read, no SDK import — the structural `AgentSdkInvocationOptions` type is
 * assignability-checked against the real SDK `Options` type inside the one
 * SDK-importing module (`agentSdkRunner.ts`).
 */
import type { ClassifierProviderRequest } from '../providerContract.js';

/** Small and named (design §15): one answer turn plus SDK-internal structured-output re-prompt headroom. */
export const CLASSIFIER_DEFAULT_MAX_TURNS = 3;

/**
 * Every built-in tool of the pinned SDK version, by exact bare name —
 * bare names remove the tool from the model's context entirely.
 */
export const CLASSIFIER_DISALLOWED_TOOLS: readonly string[] = [
  'Agent',
  'AskUserQuestion',
  'Bash',
  'BashOutput',
  'Edit',
  'ExitPlanMode',
  'Glob',
  'Grep',
  'KillShell',
  'ListMcpResources',
  'MultiEdit',
  'NotebookEdit',
  'Read',
  'ReadMcpResource',
  'Skill',
  'SlashCommand',
  'Task',
  'TodoWrite',
  'WebFetch',
  'WebSearch',
  'Write',
];

/** The SDK deny shape (structural subset of the SDK's PermissionResult). */
export interface ToolDenyResult {
  readonly behavior: 'deny';
  readonly message: string;
  readonly interrupt: boolean;
}

/**
 * Unconditional deny. With `tools: []` and every built-in disallowed this
 * should be unreachable; if it ever runs, the call is interrupted rather
 * than continued, because a tool-using classifier session is a
 * should-never-happen event (design §14 item 3).
 */
export function denyAllToolUse(): Promise<ToolDenyResult> {
  return Promise.resolve({
    behavior: 'deny',
    message: 'The classifier runtime has no tools. This tool call is refused.',
    interrupt: true,
  });
}

/**
 * The exact structural options surface this repository passes to the SDK.
 * Declared here (SDK-import-free) so tests assert it field by field;
 * `agentSdkRunner.ts` type-checks its assignability to the real SDK
 * `Options` once, at the single import site.
 */
export interface AgentSdkInvocationOptions {
  readonly model: string;
  readonly systemPrompt: string;
  readonly settingSources: readonly [];
  readonly persistSession: false;
  readonly tools: readonly [];
  readonly allowedTools: readonly [];
  readonly disallowedTools: readonly string[];
  readonly canUseTool: () => Promise<ToolDenyResult>;
  readonly mcpServers: Record<string, never>;
  readonly strictMcpConfig: true;
  readonly skills: readonly [];
  readonly plugins: readonly [];
  readonly maxTurns: number;
  readonly outputFormat: { readonly type: 'json_schema'; readonly schema: Record<string, unknown> };
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly thinking: { readonly type: 'disabled' } | { readonly type: 'adaptive' };
  readonly effort?: 'low' | 'medium' | 'high';
}

export interface AgentSdkInvocation {
  /** The user prompt: the 2B-2B canonical batch serialization, verbatim. */
  readonly prompt: string;
  readonly options: AgentSdkInvocationOptions;
}

export interface BuildInvocationInput {
  readonly request: ClassifierProviderRequest;
  readonly childEnv: Readonly<Record<string, string>>;
  readonly scratchCwd: string;
}

export function buildAgentSdkInvocation(input: BuildInvocationInput): AgentSdkInvocation {
  const { request } = input;
  const options: AgentSdkInvocationOptions = {
    model: request.modelId,
    systemPrompt: request.systemPrompt,
    settingSources: [],
    persistSession: false,
    tools: [],
    allowedTools: [],
    disallowedTools: CLASSIFIER_DISALLOWED_TOOLS,
    canUseTool: denyAllToolUse,
    mcpServers: {},
    strictMcpConfig: true,
    skills: [],
    plugins: [],
    maxTurns: request.runConfig.maxTurns ?? CLASSIFIER_DEFAULT_MAX_TURNS,
    outputFormat: {
      type: 'json_schema',
      schema: request.outputJsonSchema as Record<string, unknown>,
    },
    env: input.childEnv,
    cwd: input.scratchCwd,
    thinking:
      request.runConfig.thinking === 'enabled' ? { type: 'adaptive' } : { type: 'disabled' },
    ...(request.runConfig.effort !== undefined ? { effort: request.runConfig.effort } : {}),
  };
  return { prompt: request.serializedBatch, options };
}

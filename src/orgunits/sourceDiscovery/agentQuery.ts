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
 * WebSearch the only tool offered, allowed or permitted, WebFetch refused by
 * name, no MCP, no skills, no plugins, no setting sources, no persisted
 * session) plus the runtime fields this seam owns: the granted model, the
 * child environment, the scratch cwd, the verified executable, thinking
 * disabled, and an abort deadline. No API key, PAYG, Bedrock, Vertex or other
 * provider is expressible: the conflicting variables are refused, never
 * forwarded.
 *
 * WHAT IT READS FROM A RESULT. The SDK stream is mapped to the adapter's
 * closed `AgentMessage` shape: type, subtype, is_error, structured_output and
 * - on a failed terminal result only - a CLOSED `failure` value recognised
 * from the SDK's own usage-limit vocabulary or an authentication marker. No
 * prompt, result text, transcript or session id leaves this function, and
 * nothing here logs or stores one.
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
} from './claudeMaxWebSearchProvider.js';
import { SOURCE_DISCOVERY_ALLOWED_MODELS } from './grant.js';

/** Mechanical safety bound: one query's stream is aborted after this long. Not a calibrated value. */
export const SOURCE_DISCOVERY_QUERY_DEADLINE_MS = 300_000;

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

/** Maps one SDK message to the adapter's closed shape. No text crosses this line. */
export function toAgentMessage(message: SdkStreamMessage): AgentMessage {
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
    const childEnv = buildChildEnvironment({ parentEnv, configDir: preflight.profileDir });
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
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SOURCE_DISCOVERY_QUERY_DEADLINE_MS);
        const options: Options = {
          model: modelId,
          tools: [...o.tools],
          allowedTools: [...o.allowedTools],
          disallowedTools: [...o.disallowedTools],
          canUseTool: (toolName, input) => o.canUseTool(toolName, input),
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
            yield toAgentMessage(message);
          }
        } finally {
          clearTimeout(timer);
        }
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

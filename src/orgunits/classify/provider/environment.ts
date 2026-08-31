/**
 * THE SANITIZED CHILD-ENVIRONMENT ALLOWLIST (Phase 2B-2C Max-runtime design §13).
 *
 * The Agent SDK's `env` option REPLACES the subprocess environment rather
 * than merging with `process.env` (verified against the pinned SDK's own
 * typings, which say exactly that). This module therefore constructs the
 * ENTIRE child environment from an explicit allowlist — never a spread of
 * the parent environment, never a denylist.
 *
 * What the child receives, and nothing else:
 *
 *   - the one credential (`CLAUDE_CODE_OAUTH_TOKEN`), copied from the parent
 *     environment AFTER the pre-flight has already proven no conflicting
 *     credential exists;
 *   - the per-invocation isolated `CLAUDE_CONFIG_DIR` (design §12);
 *   - the fixed isolation/hermeticity flags (auto memory off, prompt history
 *     off, telemetry off, error reporting off, non-essential traffic off,
 *     claude.ai MCP connectors off);
 *   - the minimal OS necessities a Node/CLI subprocess needs to START on
 *     Windows and POSIX (PATH, TEMP/TMP, SystemRoot, ComSpec,
 *     USERPROFILE/HOME), looked up case-insensitively because Windows
 *     environment names are case-insensitive and `PATH` arrives as `Path`
 *     there. Config reads are already redirected by CLAUDE_CONFIG_DIR, so
 *     forwarding HOME/USERPROFILE forwards no Claude state.
 *
 * The child NEVER receives: any `DATABASE_URL*`, any `ANTHROPIC_*`, any
 * `CLAUDE_CODE_USE_*`, GitHub/AWS/Google/Azure credentials, or any other
 * secret the orchestration process holds. The orchestration process (which
 * holds the classifier database URL) and the model subprocess (which holds
 * the OAuth token) each hold exactly ONE kind of authority (design §13).
 *
 * PURE. No network, no database, no filesystem, no clock, no `process.env`
 * read of its own.
 */
import { CLAUDE_MAX_OAUTH_TOKEN_VARIABLE } from './authConflicts.js';

/**
 * Fixed, non-secret isolation flags set on EVERY classifier subprocess.
 * A named exported constant so the firewall can assert its exact contents.
 */
export const CLASSIFIER_CHILD_ENV_FIXED: Readonly<Record<string, string>> = {
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
  CLAUDE_CODE_SKIP_PROMPT_HISTORY: '1',
  DISABLE_TELEMETRY: '1',
  DISABLE_ERROR_REPORTING: '1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
};

/**
 * The ONLY parent-environment variables that may pass through, beyond the
 * OAuth token itself: OS necessities for process startup. Matched
 * case-insensitively; forwarded under their canonical names below.
 */
export const CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH: readonly string[] = [
  'PATH',
  'TEMP',
  'TMP',
  'SYSTEMROOT',
  'COMSPEC',
  'USERPROFILE',
  'HOME',
];

export interface ChildEnvironmentInput {
  /** The orchestration-process environment (already pre-flight-cleared). */
  readonly parentEnv: Readonly<Record<string, string | undefined>>;
  /** The per-invocation isolated Claude configuration directory (design §12). */
  readonly configDir: string;
}

/** Case-insensitive lookup preserving the PARENT's value but our canonical name. */
function lookupCaseInsensitive(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const direct = env[name];
  if (direct !== undefined) return direct;
  const lower = name.toLowerCase();
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === lower) return env[key];
  }
  return undefined;
}

/**
 * Builds the complete child environment. Throws if the token is absent —
 * callers must have run the pre-flight first; this builder is not a second,
 * softer gate.
 */
export function buildChildEnvironment(input: ChildEnvironmentInput): Record<string, string> {
  const token = input.parentEnv[CLAUDE_MAX_OAUTH_TOKEN_VARIABLE];
  if (token === undefined || token.length === 0) {
    throw new Error(
      `buildChildEnvironment: ${CLAUDE_MAX_OAUTH_TOKEN_VARIABLE} is absent. ` +
        `Run the pre-flight before building a child environment.`,
    );
  }

  const child: Record<string, string> = {
    [CLAUDE_MAX_OAUTH_TOKEN_VARIABLE]: token,
    CLAUDE_CONFIG_DIR: input.configDir,
    ...CLASSIFIER_CHILD_ENV_FIXED,
  };

  for (const name of CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH) {
    const value = lookupCaseInsensitive(input.parentEnv, name);
    if (value !== undefined) child[name] = value;
  }

  return child;
}

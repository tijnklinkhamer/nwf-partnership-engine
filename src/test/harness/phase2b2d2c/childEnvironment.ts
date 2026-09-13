/**
 * PHASE 2B-2D2C-F1 — the closed child-environment allowlist.
 *
 * The Tier-2 child never inherits the parent environment. It receives
 * exactly: the platform-appropriate subset of the operating-system
 * necessities below, looked up case-insensitively (Windows publishes `Path`
 * and `UserProfile`) and forwarded under their canonical names; the
 * explicitly supplied classifier configuration path as
 * `NWF_PE_CLASSIFIER_CONFIG_DIR` (from the CLI argument — never read from
 * the parent environment, so an operator's ambient value cannot leak in
 * unnamed); and, added by the harness itself, its scratch-directory
 * variable. Nothing else crosses: no database URL, no provider key, no
 * Claude token, no `NODE_OPTIONS`, no debug or transcript setting.
 *
 * F1A/F0B (ADR 0010 Amendment A, 2026-09-13): the POSIX allowlist gains
 * `USER`, the account NAME the macOS Keychain lookup of the stored
 * subscription login requires. The child needs it only so that the
 * production environment builder inside the variant root can forward it
 * on to the auth-status and SDK subprocesses; the child never records its
 * value. `LOGNAME` is NOT a substitute (measured) and never crosses. The
 * Windows allowlist is unchanged: no evidence of a Windows requirement
 * exists.
 *
 * The child re-checks its own environment on startup
 * (`childEnvironmentViolations`): a variable outside the allowlist is an
 * `ISOLATION_VIOLATION`, stopping the experiment before any provider is
 * constructed.
 *
 * PURE. No network, no database, no filesystem, no clock, no process.env
 * read of its own — callers supply the environment object.
 */
import { CLASSIFIER_PROFILE_DIR_VARIABLE } from '../../../orgunits/classify/provider/profile.js';
import { HARNESS_SCRATCH_DIR_VARIABLE } from '../processIsolatedBatch.js';

/** OS necessities, by platform. Canonical names; matched case-insensitively. */
export const RUNNER_CHILD_ENV_OS_ALLOWLIST: Readonly<Record<'posix' | 'win32', readonly string[]>> =
  {
    posix: ['PATH', 'TMPDIR', 'TMP', 'TEMP', 'HOME', 'USER'],
    win32: ['PATH', 'TMP', 'TEMP', 'USERPROFILE', 'SystemRoot', 'ComSpec'],
  };

/** Every variable the child may legitimately see, on either platform. */
export const RUNNER_CHILD_ENV_ALLOWLIST: readonly string[] = [
  ...new Set([...RUNNER_CHILD_ENV_OS_ALLOWLIST.posix, ...RUNNER_CHILD_ENV_OS_ALLOWLIST.win32]),
  CLASSIFIER_PROFILE_DIR_VARIABLE,
  HARNESS_SCRATCH_DIR_VARIABLE,
];

/**
 * Variables the operating system injects into EVERY process it starts,
 * outside any parent's control. Tolerated by the child's self-check, by
 * exact name, and never forwarded on purpose. Measured on macOS: launchd's
 * `__CF_USER_TEXT_ENCODING`.
 */
export const OS_INJECTED_VARIABLES: readonly string[] = ['__CF_USER_TEXT_ENCODING'];

/** Names that may never appear in a child environment — asserted by the negative controls. */
export const CHILD_ENV_FORBIDDEN_PREFIXES: readonly string[] = [
  'DATABASE_URL',
  'ANTHROPIC_',
  'CLAUDE_CODE_',
  'CLAUDE_',
  'NODE_OPTIONS',
  'NWF_PE_VERBOSE',
  'DEBUG',
  'PG',
];

export interface ChildEnvironmentInput {
  readonly parentEnv: Readonly<Record<string, string | undefined>>;
  readonly platform: 'posix' | 'win32';
  /** The explicit `--classifier-config-dir` argument. */
  readonly classifierConfigDir: string;
}

function lookupCaseInsensitive(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const direct = env[name];
  if (direct !== undefined) return direct;
  const lower = name.toLowerCase();
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === lower && env[key] !== undefined) return env[key];
  }
  return undefined;
}

/** Builds the complete child environment from the allowlist and the explicit argument. */
export function buildRunnerChildEnvironment(input: ChildEnvironmentInput): Record<string, string> {
  if (input.classifierConfigDir.trim().length === 0) {
    throw new Error(
      'buildRunnerChildEnvironment: the classifier configuration directory is blank.',
    );
  }
  const child: Record<string, string> = {};
  for (const name of RUNNER_CHILD_ENV_OS_ALLOWLIST[input.platform]) {
    const value = lookupCaseInsensitive(input.parentEnv, name);
    if (value !== undefined) child[name] = value;
  }
  child[CLASSIFIER_PROFILE_DIR_VARIABLE] = input.classifierConfigDir;
  return child;
}

/** The child's own startup self-check: every variable name outside the allowlist (OS-injected names tolerated). */
export function childEnvironmentViolations(
  env: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  const allowed = new Set(RUNNER_CHILD_ENV_ALLOWLIST.map((name) => name.toLowerCase()));
  const tolerated = new Set(OS_INJECTED_VARIABLES);
  return Object.keys(env)
    .filter((name) => !allowed.has(name.toLowerCase()) && !tolerated.has(name))
    .sort();
}

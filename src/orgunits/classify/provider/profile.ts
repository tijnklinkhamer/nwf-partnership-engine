/**
 * THE DEDICATED CLASSIFIER PROFILE DIRECTORY (ADR 0010 §§4, 9).
 *
 * The classifier runtime authenticates with a stored Claude subscription
 * OAuth login that the OWNER provisions ONCE, interactively, inside a
 * dedicated `CLAUDE_CONFIG_DIR` that belongs to the classifier runtime and
 * to nothing else. Claude Code owns and refreshes the credentials in that
 * directory; this engine only points the SDK subprocess at it and NEVER
 * reads, copies, parses or serialises anything inside it.
 *
 * Resolution, in order:
 *
 *   1. `NWF_PE_CLASSIFIER_CONFIG_DIR`, when set — an explicit operator
 *      choice, validated in its own right (non-blank, absolute).
 *   2. Otherwise `<home>/.claude-nwf-classifier`, where `<home>` is
 *      `USERPROFILE` (Windows) or `HOME` (POSIX), looked up
 *      case-insensitively because Windows environment names are.
 *
 * Refused outright, whatever the source (ADR 0010 §9):
 *
 *   - the repository root, or any path inside it — a profile committed to
 *     or discoverable from the repo would be a semantic surface;
 *   - the user's ordinary `<home>/.claude` profile — Project Claude /
 *     development Claude and Runtime Claude must remain contextually
 *     separate, and the ordinary profile carries the owner's real settings,
 *     memory and project state;
 *   - the home directory itself.
 *
 * Comparison is case-insensitive on every platform, deliberately: a
 * false refusal on a case-sensitive filesystem fails closed, while a
 * case-varied alias for a forbidden directory on Windows must not slip
 * through.
 *
 * PURE. No network, no database, no filesystem, no clock, and no
 * `process.env` read of its own — callers supply the environment object.
 */
import { isAbsolute, join, resolve, sep } from 'node:path';

/** Explicit operator override for the dedicated profile directory. */
export const CLASSIFIER_PROFILE_DIR_VARIABLE = 'NWF_PE_CLASSIFIER_CONFIG_DIR';

/** The default dedicated profile directory name under the owner's home. */
export const CLASSIFIER_PROFILE_DIR_BASENAME = '.claude-nwf-classifier';

export type ProfileDirFailureKind = 'PROFILE_DIR_UNRESOLVED' | 'PROFILE_DIR_FORBIDDEN';

export type ProfileDirResult =
  | { readonly ok: true; readonly profileDir: string }
  | {
      readonly ok: false;
      readonly kind: ProfileDirFailureKind;
      /** Bounded, operator-facing. Names paths and variables, never credentials. */
      readonly detail: string;
    };

export interface ProfileDirInput {
  /** The orchestration-process environment (a plain object in tests). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The repository root the orchestration process runs from. */
  readonly repoRoot: string;
}

/** Case-insensitive environment lookup (Windows publishes `Path`, `UserProfile`, …). */
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

/** Normalised comparison key: resolved, lower-cased, no trailing separator. */
function comparisonKey(path: string): string {
  const resolved = resolve(path).toLowerCase();
  return resolved.endsWith(sep) && resolved.length > 1 ? resolved.slice(0, -1) : resolved;
}

function isSameOrInside(candidateKey: string, containerKey: string): boolean {
  return candidateKey === containerKey || candidateKey.startsWith(containerKey + sep);
}

export function resolveClassifierProfileDir(input: ProfileDirInput): ProfileDirResult {
  const explicit = input.env[CLASSIFIER_PROFILE_DIR_VARIABLE];
  const home =
    lookupCaseInsensitive(input.env, 'USERPROFILE') ?? lookupCaseInsensitive(input.env, 'HOME');

  let candidate: string;
  if (explicit !== undefined) {
    if (explicit.trim().length === 0) {
      return {
        ok: false,
        kind: 'PROFILE_DIR_UNRESOLVED',
        detail:
          `refused: ${CLASSIFIER_PROFILE_DIR_VARIABLE} is set but blank. Set it to an ` +
          `absolute path for the dedicated classifier profile, or unset it to use the ` +
          `default <home>/${CLASSIFIER_PROFILE_DIR_BASENAME}.`,
      };
    }
    if (!isAbsolute(explicit)) {
      return {
        ok: false,
        kind: 'PROFILE_DIR_UNRESOLVED',
        detail:
          `refused: ${CLASSIFIER_PROFILE_DIR_VARIABLE} must be an absolute path; a ` +
          `relative value would silently depend on the process working directory.`,
      };
    }
    candidate = explicit;
  } else {
    if (home === undefined || home.trim().length === 0) {
      return {
        ok: false,
        kind: 'PROFILE_DIR_UNRESOLVED',
        detail:
          `refused: no ${CLASSIFIER_PROFILE_DIR_VARIABLE} is set and neither USERPROFILE ` +
          `nor HOME is available to derive the default ` +
          `<home>/${CLASSIFIER_PROFILE_DIR_BASENAME} profile directory.`,
      };
    }
    candidate = join(home, CLASSIFIER_PROFILE_DIR_BASENAME);
  }

  const candidateKey = comparisonKey(candidate);
  const repoKey = comparisonKey(input.repoRoot);
  if (isSameOrInside(candidateKey, repoKey)) {
    return {
      ok: false,
      kind: 'PROFILE_DIR_FORBIDDEN',
      detail:
        `refused: the classifier profile directory resolves to the repository root or a ` +
        `path inside it. The dedicated profile must live OUTSIDE the repository.`,
    };
  }
  if (home !== undefined && home.trim().length > 0) {
    const homeKey = comparisonKey(home);
    if (candidateKey === homeKey) {
      return {
        ok: false,
        kind: 'PROFILE_DIR_FORBIDDEN',
        detail:
          `refused: the classifier profile directory resolves to the home directory ` +
          `itself. Use a dedicated subdirectory such as ` +
          `<home>/${CLASSIFIER_PROFILE_DIR_BASENAME}.`,
      };
    }
    if (candidateKey === comparisonKey(join(home, '.claude'))) {
      return {
        ok: false,
        kind: 'PROFILE_DIR_FORBIDDEN',
        detail:
          `refused: the classifier profile directory resolves to the user's ordinary ` +
          `Claude profile (<home>/.claude). Runtime Claude must use its own dedicated ` +
          `profile, e.g. <home>/${CLASSIFIER_PROFILE_DIR_BASENAME}.`,
      };
    }
  }

  return { ok: true, profileDir: resolve(candidate) };
}

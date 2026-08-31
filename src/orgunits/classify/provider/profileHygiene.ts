/**
 * PROFILE HYGIENE — names-only screening of the dedicated classifier
 * profile directory (ADR 0010 §12).
 *
 * The dedicated profile exists to hold Claude-owned subscription
 * authentication and runtime state, and NOTHING semantic. Claude Code
 * legitimately creates internal files there (`.claude.json`, the
 * credentials file, session/statsig/cache metadata); those are none of
 * this engine's business and are deliberately NOT inspected. What must not
 * exist is any file or directory that could inject context, settings or
 * capability into the runtime if a future Claude version consulted the
 * profile: CLAUDE.md memory files, settings files (which can carry env
 * blocks, credential-helper scripts and lifecycle handlers), MCP
 * configuration, and the agent-extension directories.
 *
 * THE CHECK READS DIRECTORY ENTRY NAMES ONLY. It never opens, reads,
 * copies or parses any file — in particular it never touches the
 * credentials file, whose contents are Claude Code's alone (ADR 0010 §16).
 *
 * A missing directory is its own failure kind, because the operator remedy
 * differs: an unprovisioned profile needs the one-time interactive
 * `/login` flow, while a hygiene violation needs specific entries removed.
 *
 * Filesystem READDIR only. No network, no database, no environment read,
 * no file-content read, no write, no delete.
 */
import { readdir } from 'node:fs/promises';
import { CLASSIFIER_PROFILE_DIR_BASENAME, CLASSIFIER_PROFILE_DIR_VARIABLE } from './profile.js';

/**
 * Entry names (files or directories, matched case-insensitively) that must
 * not exist at the top level of the dedicated classifier profile. Each is a
 * context/config surface, not an auth artifact.
 */
export const FORBIDDEN_PROFILE_ENTRIES: readonly string[] = [
  'CLAUDE.md',
  'CLAUDE.local.md',
  'settings.json',
  'settings.local.json',
  'managed-settings.json',
  '.mcp.json',
  'mcp.json',
  'agents',
  'commands',
  'skills',
  'hooks',
  'rules',
  'output-styles',
];

export type ProfileHygieneFailureKind = 'PROFILE_NOT_PROVISIONED' | 'PROFILE_HYGIENE_VIOLATION';

export type ProfileHygieneResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly kind: ProfileHygieneFailureKind;
      /** Bounded, operator-facing. Names entries from the fixed list only. */
      readonly detail: string;
      /** Present only for PROFILE_HYGIENE_VIOLATION: the offending entry names. */
      readonly forbiddenEntries?: readonly string[];
    };

export async function checkProfileHygiene(profileDir: string): Promise<ProfileHygieneResult> {
  let entries: string[];
  try {
    entries = await readdir(profileDir);
  } catch {
    return {
      ok: false,
      kind: 'PROFILE_NOT_PROVISIONED',
      detail:
        `refused: the dedicated classifier profile directory does not exist or is not ` +
        `readable. Provision it once: set CLAUDE_CONFIG_DIR to the dedicated directory ` +
        `(default <home>/${CLASSIFIER_PROFILE_DIR_BASENAME}, or the value of ` +
        `${CLASSIFIER_PROFILE_DIR_VARIABLE}), run \`claude\`, complete /login with the ` +
        `owner's Claude Max subscription account, then exit.`,
    };
  }

  const lowered = new Set(FORBIDDEN_PROFILE_ENTRIES.map((name) => name.toLowerCase()));
  const found = entries.filter((entry) => lowered.has(entry.toLowerCase()));
  if (found.length > 0) {
    return {
      ok: false,
      kind: 'PROFILE_HYGIENE_VIOLATION',
      forbiddenEntries: found,
      detail:
        `refused: the dedicated classifier profile contains context/config surface(s) ` +
        `it must not hold: ${found.sort().join(', ')}. Remove them; the profile exists ` +
        `only for Claude-owned authentication and runtime state.`,
    };
  }

  return { ok: true };
}

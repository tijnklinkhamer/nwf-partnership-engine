/**
 * PER-INVOCATION SCRATCH ISOLATION (ADR 0010 §15): one fresh, empty
 * scratch WORKING directory per provider invocation, created under the OS
 * temporary location and removed afterwards — on success AND on failure.
 *
 * WHAT CHANGED FROM THE ADR 0009 SHAPE, and why: the original runtime made
 * the `CLAUDE_CONFIG_DIR` per-invocation and ephemeral too, because auth
 * was environment-injected and the empty config directory was assertable.
 * With the stored subscription login (ADR 0010), authentication STATE must
 * persist so Claude Code can refresh and rotate the credential it owns —
 * so the profile directory is a dedicated PERSISTENT directory resolved by
 * `profile.ts`, screened by `profileHygiene.ts`, and NEVER created,
 * written or deleted by this engine. Config/auth state and semantic
 * workspace are different things: only the WORKSPACE is ephemeral.
 *
 * The scratch cwd is what keeps every inference semantically stateless: a
 * fresh empty directory, never the repo root, never a home directory, no
 * project CLAUDE.md discoverable, deleted afterwards. Nothing semantic
 * survives between invocations.
 *
 * WINDOWS-SAFE by construction: `node:os.tmpdir()` + `node:path.join`,
 * never `/tmp`, never a hard-coded separator, and removal uses
 * `fs.rm(recursive, force, maxRetries)` so transient Windows file locks do
 * not leave residue.
 *
 * This module owns FILESYSTEM primitives only, and its removal capability
 * is scoped to the directory IT created under the OS temp location. No
 * network, no database, no environment read, no SDK import.
 */
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The scratch-directory name prefix, visible in any orphaned-temp audit. */
export const CLASSIFIER_RUNTIME_DIR_PREFIX = 'nwf-pe-classifier-';

export interface ScratchWorkspace {
  /** The per-invocation scratch `cwd`. Fresh, empty, never the repo root, never a home directory. */
  readonly scratchCwd: string;
  /** Removes the scratch directory. Idempotent; safe to call in a `finally`. */
  cleanup(): Promise<void>;
}

/**
 * Creates one unique empty scratch directory
 * (`nwf-pe-classifier-<random>`) under the OS temp location. Uniqueness
 * comes from `mkdtemp`, so two concurrent invocations can never share it.
 */
export async function createScratchWorkspace(): Promise<ScratchWorkspace> {
  const scratchCwd = await mkdtemp(join(tmpdir(), CLASSIFIER_RUNTIME_DIR_PREFIX));
  await assertDirEmpty(scratchCwd);

  let cleaned = false;
  return {
    scratchCwd,
    async cleanup(): Promise<void> {
      if (cleaned) return;
      cleaned = true;
      await rm(scratchCwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },
  };
}

/**
 * The freshness assertion: the scratch directory holds NOTHING. Trivially
 * true for a directory this module just created; asserted anyway so a
 * future refactor that reuses a directory fails loudly rather than
 * silently inheriting state.
 */
export async function assertDirEmpty(dir: string): Promise<void> {
  const entries = await readdir(dir);
  if (entries.length > 0) {
    throw new Error(
      `runtime isolation: directory is not empty (${entries.length} entr${
        entries.length === 1 ? 'y' : 'ies'
      }); refusing to use it as an isolated runtime directory.`,
    );
  }
}

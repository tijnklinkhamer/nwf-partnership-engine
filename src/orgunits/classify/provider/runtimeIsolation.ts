/**
 * PER-INVOCATION RUNTIME ISOLATION (Phase 2B-2C Max-runtime design §§12, 14
 * item 6): one fresh, empty Claude configuration directory and one fresh,
 * empty scratch working directory per provider invocation, both created
 * under the OS temporary location and both removed afterwards — on success
 * AND on failure.
 *
 * Why fresh-per-invocation rather than a persistent dedicated directory:
 * a persistent directory would ACCUMULATE state whose absence this design
 * wants to be able to ASSERT; asserting emptiness of a fresh directory is
 * trivial (design §12). Nothing survives between invocations: no
 * `.credentials.json` (auth is env-borne and never written to disk by
 * engine code), no `settings.json`, no `projects/` memory, no session
 * transcript, no hidden project context in the working directory.
 *
 * WINDOWS-SAFE by construction: `node:os.tmpdir()` + `node:path.join`,
 * never `/tmp`, never a hard-coded separator, and removal uses
 * `fs.rm(recursive, force, maxRetries)` so transient Windows file locks do
 * not leave residue.
 *
 * This module owns FILESYSTEM primitives only. No network, no database, no
 * environment read, no SDK import.
 */
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The design-§12 directory-name prefix, visible in any orphaned-temp audit. */
export const CLASSIFIER_RUNTIME_DIR_PREFIX = 'nwf-pe-classifier-';

export interface RuntimeIsolation {
  /** The per-invocation `CLAUDE_CONFIG_DIR`. Fresh, empty, never the repo root. */
  readonly configDir: string;
  /** The per-invocation scratch `cwd`. Fresh, empty, never the repo root, never a home directory. */
  readonly scratchCwd: string;
  /** Removes BOTH directories (their common parent). Idempotent; safe to call in a `finally`. */
  cleanup(): Promise<void>;
}

/**
 * Creates one unique parent directory (`nwf-pe-classifier-<random>`) under
 * the OS temp location, containing exactly two empty children: `config`
 * (the isolated CLAUDE_CONFIG_DIR) and `cwd` (the scratch working
 * directory). Uniqueness comes from `mkdtemp`, so two concurrent
 * invocations can never share either directory.
 */
export async function createRuntimeIsolation(): Promise<RuntimeIsolation> {
  const parent = await mkdtemp(join(tmpdir(), CLASSIFIER_RUNTIME_DIR_PREFIX));
  const configDir = join(parent, 'config');
  const scratchCwd = join(parent, 'cwd');
  await mkdir(configDir);
  await mkdir(scratchCwd);
  await assertDirEmpty(configDir);
  await assertDirEmpty(scratchCwd);

  let cleaned = false;
  return {
    configDir,
    scratchCwd,
    async cleanup(): Promise<void> {
      if (cleaned) return;
      cleaned = true;
      await rm(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },
  };
}

/**
 * The design-§7 step-3 assertion: the isolated directory holds NOTHING —
 * in particular no `settings.json`, no `.credentials.json`, no `projects/`.
 * Trivially true for a directory this module just created; asserted anyway
 * so a future refactor that reuses a directory fails loudly rather than
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

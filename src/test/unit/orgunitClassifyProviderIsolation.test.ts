/**
 * Per-invocation scratch isolation: a fresh empty scratch cwd under the OS
 * temp location, unique per invocation, removed afterwards. The dedicated
 * profile directory is NOT this module's business: it persists and is
 * never engine-deleted (ADR 0010 §15). Real filesystem, zero network.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertDirEmpty,
  CLASSIFIER_RUNTIME_DIR_PREFIX,
  createScratchWorkspace,
} from '../../orgunits/classify/provider/runtimeIsolation.js';

describe('createScratchWorkspace', () => {
  it('creates a fresh empty scratch cwd under the OS temp location', async () => {
    const workspace = await createScratchWorkspace();
    try {
      expect(existsSync(workspace.scratchCwd)).toBe(true);
      expect(basename(workspace.scratchCwd).startsWith(CLASSIFIER_RUNTIME_DIR_PREFIX)).toBe(true);
      expect(resolve(workspace.scratchCwd).startsWith(resolve(tmpdir()) + sep)).toBe(true);
      // Never the repository root, and empty.
      expect(resolve(workspace.scratchCwd)).not.toBe(resolve(process.cwd()));
      await expect(assertDirEmpty(workspace.scratchCwd)).resolves.toBeUndefined();
    } finally {
      await workspace.cleanup();
    }
  });

  it('cleanup removes the scratch directory, residue included, and is idempotent', async () => {
    const workspace = await createScratchWorkspace();
    // Even residue the RUNTIME wrote is removed.
    await writeFile(join(workspace.scratchCwd, 'residue.txt'), 'x', 'utf8');
    await mkdir(join(workspace.scratchCwd, 'nested'));
    await workspace.cleanup();
    expect(existsSync(workspace.scratchCwd)).toBe(false);
    await expect(workspace.cleanup()).resolves.toBeUndefined(); // idempotent
  });

  it('cleanup touches ONLY its own scratch directory, never a sibling profile-like directory', async () => {
    const bystander = join(tmpdir(), `nwf-pe-test-bystander-${Date.now()}`);
    await mkdir(bystander, { recursive: true });
    await writeFile(join(bystander, 'persists.txt'), 'kept', 'utf8');
    const workspace = await createScratchWorkspace();
    try {
      await workspace.cleanup();
      expect(existsSync(bystander)).toBe(true);
      expect(existsSync(join(bystander, 'persists.txt'))).toBe(true);
    } finally {
      const { rm } = await import('node:fs/promises');
      await rm(bystander, { recursive: true, force: true });
    }
  });

  it('two concurrent workspaces never share a directory and clean up independently', async () => {
    const [a, b] = await Promise.all([createScratchWorkspace(), createScratchWorkspace()]);
    try {
      expect(a.scratchCwd).not.toBe(b.scratchCwd);
      await a.cleanup();
      expect(existsSync(a.scratchCwd)).toBe(false);
      // b is untouched by a's cleanup.
      expect(existsSync(b.scratchCwd)).toBe(true);
    } finally {
      await Promise.all([a.cleanup(), b.cleanup()]);
    }
    expect(existsSync(b.scratchCwd)).toBe(false);
  });

  it('assertDirEmpty refuses a directory that holds anything', async () => {
    const workspace = await createScratchWorkspace();
    try {
      await writeFile(join(workspace.scratchCwd, 'anything.json'), '{}', 'utf8');
      await expect(assertDirEmpty(workspace.scratchCwd)).rejects.toThrow(/not empty/);
    } finally {
      await workspace.cleanup();
    }
  });
});

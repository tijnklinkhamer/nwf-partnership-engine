/**
 * Per-invocation runtime isolation: fresh empty config dir + scratch cwd
 * under the OS temp location, unique per invocation, removed afterwards.
 * Real filesystem, zero network.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertDirEmpty,
  CLASSIFIER_RUNTIME_DIR_PREFIX,
  createRuntimeIsolation,
} from '../../orgunits/classify/provider/runtimeIsolation.js';

describe('createRuntimeIsolation', () => {
  it('creates a fresh empty config dir and scratch cwd under the OS temp location', async () => {
    const isolation = await createRuntimeIsolation();
    try {
      expect(existsSync(isolation.configDir)).toBe(true);
      expect(existsSync(isolation.scratchCwd)).toBe(true);
      // Both live under one nwf-pe-classifier-* parent inside tmpdir().
      const parent = dirname(isolation.configDir);
      expect(dirname(isolation.scratchCwd)).toBe(parent);
      expect(basename(parent).startsWith(CLASSIFIER_RUNTIME_DIR_PREFIX)).toBe(true);
      expect(resolve(parent).startsWith(resolve(tmpdir()) + sep)).toBe(true);
      // Neither is the repository root, and neither contains any file.
      expect(resolve(isolation.configDir)).not.toBe(resolve(process.cwd()));
      expect(resolve(isolation.scratchCwd)).not.toBe(resolve(process.cwd()));
      await expect(assertDirEmpty(isolation.configDir)).resolves.toBeUndefined();
      await expect(assertDirEmpty(isolation.scratchCwd)).resolves.toBeUndefined();
    } finally {
      await isolation.cleanup();
    }
  });

  it('cleanup removes both directories and their parent, and is idempotent', async () => {
    const isolation = await createRuntimeIsolation();
    // Even residue the RUNTIME wrote is removed.
    await writeFile(join(isolation.configDir, 'settings.json'), '{}', 'utf8');
    await mkdir(join(isolation.scratchCwd, 'nested'));
    await isolation.cleanup();
    expect(existsSync(isolation.configDir)).toBe(false);
    expect(existsSync(isolation.scratchCwd)).toBe(false);
    expect(existsSync(dirname(isolation.configDir))).toBe(false);
    await expect(isolation.cleanup()).resolves.toBeUndefined(); // idempotent
  });

  it('two concurrent isolations never share a directory and clean up independently', async () => {
    const [a, b] = await Promise.all([createRuntimeIsolation(), createRuntimeIsolation()]);
    try {
      expect(a.configDir).not.toBe(b.configDir);
      expect(a.scratchCwd).not.toBe(b.scratchCwd);
      expect(dirname(a.configDir)).not.toBe(dirname(b.configDir));
      await a.cleanup();
      expect(existsSync(a.configDir)).toBe(false);
      // b is untouched by a's cleanup.
      expect(existsSync(b.configDir)).toBe(true);
      expect(existsSync(b.scratchCwd)).toBe(true);
    } finally {
      await Promise.all([a.cleanup(), b.cleanup()]);
    }
    expect(existsSync(b.configDir)).toBe(false);
  });

  it('assertDirEmpty refuses a directory that holds anything', async () => {
    const isolation = await createRuntimeIsolation();
    try {
      await writeFile(join(isolation.configDir, '.credentials.json'), '{}', 'utf8');
      await expect(assertDirEmpty(isolation.configDir)).rejects.toThrow(/not empty/);
    } finally {
      await isolation.cleanup();
    }
  });
});

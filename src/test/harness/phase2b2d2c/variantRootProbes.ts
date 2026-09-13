/**
 * PHASE 2B-2D2C-F1 — the REAL variant-root probes: Git, filesystem and the
 * runtime loader. Test-harness-only (this namespace lives under
 * `src/test/`); every automated test injects fakes over synthetic roots
 * and never runs these against the real predecessor worktrees.
 *
 * Git is invoked with a fixed argument vector per probe, no shell, with
 * `-C <root>`; no caller-supplied text reaches an argument.
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { loadVariantRuntime } from './runtimeLoader.js';
import type { VariantRootProbes } from './variantRoot.js';

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function createRealVariantRootProbes(): VariantRootProbes {
  return {
    realpath: (path) => realpathSync.native(path),
    isDirectory: (path) => {
      try {
        return lstatSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    readFile: (path) => readFileSync(path),
    mtimeMs: (path) => {
      try {
        return statSync(path).mtimeMs;
      } catch {
        return null;
      }
    },
    gitOriginUrl: (root) => git(root, ['remote', 'get-url', 'origin']),
    gitToplevel: (root) => git(root, ['rev-parse', '--show-toplevel']),
    gitHead: (root) => git(root, ['rev-parse', 'HEAD']),
    gitStatusPorcelain: (root) => git(root, ['status', '--porcelain']),
    loadRuntime: (root) => loadVariantRuntime(root),
  };
}

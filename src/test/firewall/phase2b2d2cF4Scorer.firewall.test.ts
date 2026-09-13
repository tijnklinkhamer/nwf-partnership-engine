/**
 * PHASE 2B-2D2C-F4 FIREWALL — THE SCORER IS READ-ONLY AND REQUEST-FREE.
 *
 * F4 scores preserved evidence. It must be structurally incapable of
 * producing any: no provider call, no SDK `query()`, no Claude executable,
 * no auth-status check, no database client, no execution-CLI invocation, no
 * institutional request, and no read of a file the freeze lists as
 * never-read.
 *
 * These assertions walk the scorer's TRANSITIVE import graph from its entry
 * points, so a forbidden capability cannot be reached indirectly through a
 * helper either. They assert real capabilities — module specifiers, exported
 * symbol names, file paths — never ordinary English words, so documentation
 * prose never trips them.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SCORING_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d2c/scoring');

const ENTRY_POINTS = ['generate.ts', 'run.ts', 'emit.ts'];

/** Modules that can reach inference, credentials, a database or a child process. */
const FORBIDDEN_MODULES = [
  'src/test/harness/phase2b2d2c/cli.ts',
  'src/test/harness/phase2b2d2c/coordinator.ts',
  'src/test/harness/phase2b2d2c/childMain.ts',
  'src/test/harness/phase2b2d2c/childEnvironment.ts',
  'src/test/harness/phase2b2d2c/runtimeLoader.ts',
  'src/test/harness/phase2b2d2c/variantRoot.ts',
  'src/test/harness/phase2b2d2c/variantRootProbes.ts',
  'src/test/harness/phase2b2d2c/authorisation.ts',
  'src/test/harness/processIsolatedBatch.ts',
  'src/orgunits/classify/provider',
  'src/orgunits/classify/loaders.ts',
  'src/orgunits/classify/persist.ts',
  'src/orgunits/classify/orchestrate.ts',
  'src/db/',
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/robots.ts',
  'src/orgunits/orchestrator/',
];

/** Node capabilities a read-only scorer has no business holding. */
const FORBIDDEN_NODE_MODULES = [
  'node:child_process',
  'node:http',
  'node:https',
  'node:net',
  'node:tls',
  'node:dns',
  'node:worker_threads',
  'node:cluster',
];

const FORBIDDEN_PACKAGES = ['pg', '@anthropic-ai/claude-agent-sdk', '@anthropic-ai/sdk'];

/** Capability identifiers that would mean inference, auth or a spawned process. */
const FORBIDDEN_IDENTIFIERS = [
  'AgentSdkRunner',
  'evaluateExecutionLock',
  'isAuthorisationConsumed',
  'runExperiment',
  'runProcessIsolatedBatch',
  'auth status',
  'authStatus',
  'createProvider',
  'query(',
  'spawn(',
  'execFile',
  'execSync',
  'fetch(',
  '--execute',
];

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

function importSpecifiersOf(source: string): readonly string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bimport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [
    base,
    base.replace(/\.js$/, '.ts'),
    `${base}.ts`,
    join(base, 'index.ts'),
  ]) {
    if (existsSync(candidate) && candidate.endsWith('.ts')) return candidate;
  }
  return null;
}

/** Every .ts file reachable from the scorer's entry points. */
function transitiveGraph(): { files: readonly string[]; externalSpecifiers: readonly string[] } {
  const visited = new Set<string>();
  const external = new Set<string>();
  const queue = ENTRY_POINTS.map((name) => join(SCORING_DIR, name));
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);
    for (const specifier of importSpecifiersOf(readSource(file))) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved === null) external.add(specifier);
      else if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  return { files: [...visited].sort(), externalSpecifiers: [...external].sort() };
}

describe('the F4 scorer cannot reach an execution, provider, auth or database path', () => {
  const graph = transitiveGraph();

  it('reaches a non-trivial import graph (so the walk is really walking)', () => {
    expect(graph.files.length).toBeGreaterThan(10);
    for (const entry of ENTRY_POINTS) expect(graph.files).toContain(join(SCORING_DIR, entry));
  });

  it('imports no execution, provider, loader, orchestrator or database module', () => {
    for (const file of graph.files) {
      const relative = file.slice(REPO_ROOT.length + 1);
      for (const forbidden of FORBIDDEN_MODULES) {
        const forbiddenFile = join(REPO_ROOT, forbidden);
        expect(
          file === forbiddenFile || file.startsWith(forbiddenFile),
          `${relative} is reachable from the scorer but is a forbidden module (${forbidden}).`,
        ).toBe(false);
      }
    }
  });

  it('imports no socket, child-process or provider package', () => {
    for (const specifier of graph.externalSpecifiers) {
      expect(FORBIDDEN_NODE_MODULES).not.toContain(specifier);
      expect(FORBIDDEN_PACKAGES).not.toContain(specifier);
      expect(specifier.startsWith('@anthropic-ai/')).toBe(false);
    }
  });

  it('names no inference, authentication or process-spawning capability in the scorer itself', () => {
    for (const name of readdirSync(SCORING_DIR).sort()) {
      const source = readSource(join(SCORING_DIR, name));
      // The comment block explaining what is NOT imported is stripped first:
      // a prohibition is allowed to be documented, never exercised.
      const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const identifier of FORBIDDEN_IDENTIFIERS) {
        expect(code.includes(identifier), `${name} names ${identifier}`).toBe(false);
      }
    }
  });

  it('opens no file the freeze lists as never-read', () => {
    const freeze: unknown = JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json'),
        'utf8',
      ),
    );
    const neverRead = (freeze as { corpus: { holdoutFilesNeverRead: string[] } }).corpus
      .holdoutFilesNeverRead;
    expect(neverRead.length).toBeGreaterThan(0);
    for (const file of graph.files) {
      const source = readSource(file);
      for (const path of neverRead) {
        // The path may be NAMED (the scorer explains what it refuses to open)
        // but never handed to a filesystem read.
        const readCalls = [...source.matchAll(/read(?:File|dir)Sync\s*\(([^)]*)\)/g)].map(
          (m) => m[1] ?? '',
        );
        for (const argument of readCalls) {
          expect(argument.includes(path), `${file} reads ${path}`).toBe(false);
        }
      }
    }
  });

  it('writes only through the one emitter, never into the preserved attempt', () => {
    for (const name of readdirSync(SCORING_DIR).sort()) {
      const source = readSource(join(SCORING_DIR, name));
      const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '');
      const writes =
        /\b(writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|renameSync|linkSync)\b/.test(
          code,
        );
      if (writes) expect(name).toBe('emit.ts');
    }
  });
});

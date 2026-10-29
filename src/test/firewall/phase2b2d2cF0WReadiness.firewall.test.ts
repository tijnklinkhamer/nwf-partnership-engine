/**
 * PHASE 2B-2D2C-F0W FIREWALL — THE READINESS/CONTROL-PLANE LAYER IS
 * REQUEST-FREE AND HAS NO EXECUTION ENTRY POINT.
 *
 * F0W adds request-free machinery only: a slot registry, a two-layer
 * identity bridge, a sequencing gate, a per-slot execution lock, a
 * study-level approval schema, output-root readiness inspection, and a
 * readiness CLI with NO `--execute` flag anywhere. This firewall proves
 * that structurally, by walking the TRANSITIVE import graph from every file
 * under `src/test/harness/phase2b2d2c/f0w/`: it must be unable to reach the
 * execution surface (`coordinator.ts`'s `runExperiment`, `childMain.ts`,
 * the child-process launcher, any provider/auth path, any database client),
 * unable to reach a scoring, gold-projection, DEV-label or HOLDOUT-adjacent
 * module, and must name no inference/authentication/process-spawning
 * capability anywhere in its own source. The readiness CLI itself is
 * additionally checked for the `--execute` flag literal by exact name — the
 * per-slot lock's refusal messages legitimately mention it (mirroring
 * `authorisationF0O.ts`'s own `EXECUTE_FLAG_ABSENT` message) without
 * granting anything, so that check is scoped to `cliF0W.ts` alone.
 *
 * These assertions walk real capabilities — module specifiers, exported
 * symbol names, file paths — never ordinary English words, so documentation
 * prose never trips them, following exactly the pattern
 * `phase2b2d2cF4Scorer.firewall.test.ts` already established for the F4
 * scorer.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const F0W_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d2c/f0w');

const ENTRY_POINTS = readdirSync(F0W_DIR)
  .filter((name) => name.endsWith('.ts'))
  .sort();

/** Modules that can reach inference, credentials, a database or a child process. */
const FORBIDDEN_MODULES = [
  'src/test/harness/phase2b2d2c/cli.ts',
  'src/test/harness/phase2b2d2c/coordinator.ts',
  'src/test/harness/phase2b2d2c/childMain.ts',
  'src/test/harness/phase2b2d2c/childEntry.mjs',
  'src/test/harness/phase2b2d2c/childEnvironment.ts',
  'src/test/harness/phase2b2d2c/runtimeLoader.ts',
  'src/test/harness/phase2b2d2c/variantRoot.ts',
  'src/test/harness/phase2b2d2c/variantRootProbes.ts',
  'src/test/harness/phase2b2d2c/authorisation.ts',
  'src/test/harness/phase2b2d2c/scoring/',
  'src/test/harness/phase2b2d2c/goldProjection/',
  'src/test/harness/phase2b2d2c/v3d1/',
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

/** Node/runtime capabilities a request-free readiness layer has no business holding. */
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

/** Capability identifiers that would mean inference, auth, a spawned process or an execution flag. */
const FORBIDDEN_IDENTIFIERS = [
  'AgentSdkRunner',
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

/** Every .ts file reachable from the f0w readiness entry points. */
function transitiveGraph(): { files: readonly string[]; externalSpecifiers: readonly string[] } {
  const visited = new Set<string>();
  const external = new Set<string>();
  const queue = ENTRY_POINTS.map((name) => join(F0W_DIR, name));
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

describe('2D2C-F0W: the readiness/control-plane layer has no execution entry point', () => {
  const graph = transitiveGraph();

  it('reaches a non-trivial import graph (so the walk is really walking)', () => {
    expect(graph.files.length).toBeGreaterThan(5);
    for (const entry of ENTRY_POINTS) expect(graph.files).toContain(join(F0W_DIR, entry));
  });

  it('every f0w/*.ts file is on the ENTRY_POINTS list this firewall walks', () => {
    // Guards against a new f0w file being added without this firewall
    // widening to cover it — the opposite failure mode from a forgotten
    // forbidden-module entry.
    const onDisk = readdirSync(F0W_DIR)
      .filter((name) => name.endsWith('.ts'))
      .sort();
    expect(onDisk).toEqual(ENTRY_POINTS);
  });

  it('imports no execution, provider, loader, orchestrator, scoring or database module', () => {
    for (const file of graph.files) {
      const relative = file.slice(REPO_ROOT.length + 1);
      for (const forbidden of FORBIDDEN_MODULES) {
        const forbiddenFile = join(REPO_ROOT, forbidden);
        expect(
          file === forbiddenFile || file.startsWith(forbiddenFile),
          `${relative} is reachable from the F0W readiness layer but is a forbidden module (${forbidden}).`,
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

  it('names no inference, authentication, process-spawning or --execute capability anywhere in f0w/', () => {
    for (const name of ENTRY_POINTS) {
      const source = readSource(join(F0W_DIR, name));
      // The comment block explaining what is NOT imported/named is stripped
      // first: a prohibition is allowed to be documented, never exercised.
      const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const identifier of FORBIDDEN_IDENTIFIERS) {
        expect(code.includes(identifier), `${name} names ${identifier}`).toBe(false);
      }
    }
  });

  it('opens no file the F0V freeze lists as HOLDOUT-forbidden', () => {
    const freeze: unknown = JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'docs/evaluation/PHASE_2B_2D2C_DEV_REPLICATION_STUDY_FREEZE_F0V_V1.json'),
        'utf8',
      ),
    );
    const forbiddenFiles = (freeze as { holdout: { forbiddenFiles: string[] } }).holdout
      .forbiddenFiles;
    expect(forbiddenFiles.length).toBeGreaterThan(0);
    for (const file of graph.files) {
      const source = readSource(file);
      const readCalls = [...source.matchAll(/read(?:File|dir)Sync\s*\(([^)]*)\)/g)].map(
        (m) => m[1] ?? '',
      );
      for (const path of forbiddenFiles) {
        for (const argument of readCalls) {
          expect(argument.includes(path), `${file} reads ${path}`).toBe(false);
        }
      }
    }
  });

  it('writes nothing to disk: no candidate, no output root, no consumption marker', () => {
    for (const name of ENTRY_POINTS) {
      const source = readSource(join(F0W_DIR, name));
      const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '');
      const writes =
        /\b(writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|renameSync|linkSync)\b/.test(
          code,
        );
      expect(writes, `${name} writes to disk`).toBe(false);
    }
  });

  it('the readiness CLI parser accepts no --execute flag', () => {
    const source = readSource(join(F0W_DIR, 'cliF0W.ts'));
    const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/--execute/);
  });
});

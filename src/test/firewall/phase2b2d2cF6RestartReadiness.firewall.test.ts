/**
 * PHASE 2B-2D2C-F6 FIREWALL — THE RESTART PREPARATION HAS NO EXECUTION,
 * SCORING, GOLD OR HOLDOUT CAPABILITY, AND DOES NOT READ F5 SEMANTICS.
 *
 * F6 prepares a fresh study; it does not run one. By walking the real import
 * graph of every `f6/` module (type-only imports included, so the check is
 * conservative) and its code, this file proves:
 *
 *   - f6/ holds exactly the reviewed modules, and none is an entry point: no
 *     CLI, no `process.argv`, no `--execute`, no spawn, no auth-status;
 *   - the graph never reaches the coordinator, the child, the Tier-2 harness,
 *     the classifier provider, the Agent SDK, scoring, the v2 scorer, gold
 *     projection, a database, the web gateway or the orchestrator, and opens
 *     no socket module;
 *   - no f6 source names a HOLDOUT, gold or adjudication fixture;
 *   - exactly one module (`rootInventoryF6.ts`) touches the filesystem, only
 *     read-only, and never decodes what it reads — so F6 preparation hashes
 *     the F5 evidence but never loads an F5 semantic output;
 *   - no f6 module creates a directory or names an F5 semantic artifact.
 *
 * The F3 and F4 firewalls are untouched.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d2c';
const F6_DIR = join(REPO_ROOT, HARNESS, 'f6');

const F6_FILES = [
  'f5ClosureF6.ts',
  'freezeF6.ts',
  'hostAwakePreflightF6.ts',
  'priorStudyIdentityF6.ts',
  'rootInventoryF6.ts',
  'studyPlanCoreF6.ts',
];

const FILESYSTEM_READER = 'rootInventoryF6.ts';

const FORBIDDEN_MODULES = [
  `${HARNESS}/coordinator.ts`,
  `${HARNESS}/childMain.ts`,
  `${HARNESS}/childEntry.mjs`,
  `${HARNESS}/cli.ts`,
  `${HARNESS}/variantRoot.ts`,
  `${HARNESS}/runtimeLoader.ts`,
  `${HARNESS}/corpus.ts`,
  `${HARNESS}/scoring/`,
  `${HARNESS}/f2/scoreV2.ts`,
  `${HARNESS}/goldProjection/`,
  `${HARNESS}/f3/`,
  `${HARNESS}/f4/`,
  `${HARNESS}/f0x/`,
  'src/test/harness/processIsolatedBatch.ts',
  'src/orgunits/classify/provider/',
  'src/orgunits/classify/providerContract.ts',
  'src/orgunits/classify/evaluation/',
  'src/db/',
  'migrations/',
  // As in the F4 firewall: the socket-bearing web modules. The pure extract/
  // redact helpers ARE reachable, type-only, through F2's existing import of
  // f0o/attempt4FreezeCore -> classify/repair; they open nothing.
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/robots.ts',
  'src/orgunits/orchestrator/',
];

const FORBIDDEN_EXTERNAL = [
  '@anthropic-ai/claude-agent-sdk',
  'node:child_process',
  'child_process',
  'node:http',
  'node:https',
  'node:net',
  'node:tls',
  'node:dns',
  'pg',
];

const FORBIDDEN_FIXTURE_NAMES = [
  'orgunit-classifier-sonnet-acceptance-v1.jsonl',
  'orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl',
  'orgunit-classifier-gold-v1.jsonl',
  'orgunit-classifier-adjudication-v1.jsonl',
  'orgunit-classifier-sonnet-acceptance-dev-labels-v1',
];

const F5_SEMANTIC_ARTIFACT_NAMES = [
  'child-result',
  'raw-output-checkpoint',
  'validation-result',
  'repair-round',
  'provider-outcome',
];

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

function codeOf(name: string): string {
  return readSource(join(F6_DIR, name))
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function importSpecifiersOf(source: string): readonly string[] {
  const specifiers: string[] = [];
  for (const pattern of [
    /\bimport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.push(match[1]);
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

function graphFrom(entries: readonly string[]): {
  readonly files: readonly string[];
  readonly external: readonly string[];
} {
  const visited = new Set<string>();
  const external = new Set<string>();
  const queue = entries.map((name) => join(F6_DIR, name));
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of importSpecifiersOf(readSource(file))) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved === null) external.add(specifier);
      else if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  return {
    files: [...visited].map((file) => file.slice(REPO_ROOT.length + 1)).sort(),
    external: [...external].sort(),
  };
}

describe('2D2C-F6: the restart preparation has no execution capability', () => {
  const graph = graphFrom(F6_FILES);

  it('f6/ holds exactly the reviewed modules', () => {
    expect(
      readdirSync(F6_DIR)
        .filter((name) => !name.startsWith('.'))
        .sort(),
    ).toEqual(F6_FILES);
  });

  it('no f6 module is an entry point, offers --execute, spawns, or invokes auth-status', () => {
    for (const name of F6_FILES) {
      const code = codeOf(name);
      for (const forbidden of [
        'process.argv',
        '--execute',
        'spawn(',
        'fork(',
        'execFile',
        'authStatusRunner',
        'runAuthStatus',
        'runExperiment',
        'query(',
      ]) {
        expect(code, `${name} must not contain ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('NEVER reaches the coordinator, child, Tier-2 harness, provider, scoring, gold, F3/F4 authority, database or web surface', () => {
    for (const file of graph.files) {
      for (const forbidden of FORBIDDEN_MODULES) {
        expect(
          file === forbidden || file.startsWith(forbidden),
          `${file} is reachable from f6/ but is forbidden (${forbidden}).`,
        ).toBe(false);
      }
    }
  });

  it('imports no SDK, child-process, socket module or database driver', () => {
    for (const specifier of graph.external) {
      expect(FORBIDDEN_EXTERNAL, specifier).not.toContain(specifier);
    }
  });

  it('no module in the f6 graph names a HOLDOUT, gold or adjudication fixture', () => {
    for (const file of graph.files) {
      const source = readSource(join(REPO_ROOT, file));
      for (const name of FORBIDDEN_FIXTURE_NAMES) {
        expect(source.includes(name), `${file} names ${name}`).toBe(false);
      }
    }
  });
});

describe('2D2C-F6: F5 evidence is hashed, never loaded', () => {
  it('exactly one f6 module touches the filesystem, and only with read-only calls', () => {
    for (const name of F6_FILES) {
      const specifiers = importSpecifiersOf(readSource(join(F6_DIR, name)));
      const usesFs = specifiers.some(
        (s) => s === 'node:fs' || s === 'fs' || s === 'node:fs/promises',
      );
      expect(usesFs, `${name} filesystem use`).toBe(name === FILESYSTEM_READER);
    }
    const reader = codeOf(FILESYSTEM_READER);
    for (const write of [
      'writeFile',
      'appendFile',
      'mkdir',
      'rmSync',
      'rm(',
      'unlink',
      'rename',
      'copyFile',
      'symlink',
      'openSync',
      'createWriteStream',
    ]) {
      expect(reader, `${FILESYSTEM_READER} must not call ${write}`).not.toContain(write);
    }
  });

  it('the inventory reader never decodes what it hashes', () => {
    const reader = codeOf(FILESYSTEM_READER);
    expect(reader).not.toContain('JSON.parse');
    expect(reader).not.toMatch(/readFileSync\([^)]*['"]utf-?8['"]/);
    expect(reader).not.toMatch(/\.toString\(/);
  });

  it('no f6 module names an F5 semantic artifact', () => {
    for (const name of F6_FILES) {
      const code = codeOf(name);
      for (const artifact of F5_SEMANTIC_ARTIFACT_NAMES) {
        expect(code, `${name} names ${artifact}`).not.toContain(artifact);
      }
    }
  });
});

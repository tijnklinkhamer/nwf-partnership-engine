/**
 * PHASE 2B-2D2C-F9 FIREWALL — THE F6 DEV SCORING ADAPTER IS SCORING-ONLY.
 *
 * By walking the real import graph from every f9/ module, this file proves
 * the adapter reaches the unchanged v2 scorer and the pinned DEVELOPMENT gold
 * loader, and NEVER reaches a coordinator, child, provider, auth, database,
 * migration, network or web surface; that f9/ source names no HOLDOUT or
 * adjudication fixture and no Claude model id; and that the v2 scorer is
 * unchanged from the F7 execution build.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d2c';
const F9_DIR = join(REPO_ROOT, HARNESS, 'f9');
const F9_FILES = ['cliF9.ts', 'resultF9.ts', 'scoreF6StudyF9.ts'];
const EXECUTION_BUILD = '911309ecce0621c2ea51b84eb68cf484d332dd4a';

const FORBIDDEN_MODULES = [
  `${HARNESS}/coordinator.ts`,
  `${HARNESS}/childMain.ts`,
  `${HARNESS}/childEnvironment.ts`,
  `${HARNESS}/f7/slotRunnerPlanF7.ts`,
  `${HARNESS}/f7/studyExecutorF7.ts`,
  `${HARNESS}/f7/cliF7.ts`,
  `${HARNESS}/goldProjection/`,
  'src/test/harness/processIsolatedBatch.ts',
  'src/orgunits/classify/provider/',
  'src/orgunits/classify/providerContract.ts',
  'src/db/',
  'migrations/',
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/robots.ts',
  'src/orgunits/orchestrator/',
];
const FORBIDDEN_EXTERNAL = [
  'node:http',
  'node:https',
  'node:net',
  'node:tls',
  'node:dns',
  'pg',
  '@anthropic-ai/claude-agent-sdk',
];

function importSpecifiersOf(source: string): readonly string[] {
  const specifiers: string[] = [];
  for (const pattern of [
    /\bimport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern))
      if (match[1] !== undefined) specifiers.push(match[1]);
  }
  return specifiers;
}

function graphFrom(entries: readonly string[]) {
  const visited = new Set<string>();
  const external = new Set<string>();
  const queue = entries.map((name) => join(F9_DIR, name));
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of importSpecifiersOf(readFileSync(file, 'utf8'))) {
      if (!specifier.startsWith('.')) {
        external.add(specifier);
        continue;
      }
      const base = resolve(dirname(file), specifier);
      const resolved = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`].find(
        (c) => existsSync(c) && c.endsWith('.ts'),
      );
      if (resolved !== undefined && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return {
    files: [...visited].map((f) => f.slice(REPO_ROOT.length + 1)).sort(),
    external: [...external].sort(),
  };
}

describe('2D2C-F9: the scoring adapter reaches exactly a scoring-only graph', () => {
  const graph = graphFrom(F9_FILES);

  it('f9/ holds exactly the reviewed modules', () => {
    expect(
      readdirSync(F9_DIR)
        .filter((n) => !n.startsWith('.'))
        .sort(),
    ).toEqual(F9_FILES);
  });

  it('DOES reach the unchanged v2 scorer, the gold supplement loader and the F7 study context', () => {
    for (const required of [
      `${HARNESS}/f2/scoreV2.ts`,
      `${HARNESS}/scoring/supplement.ts`,
      `${HARNESS}/scoring/sources.ts`,
      `${HARNESS}/f7/restartStudyContextF7.ts`,
    ]) {
      expect(graph.files).toContain(required);
    }
  });

  it('NEVER reaches a coordinator, child, provider, database, migration or web surface', () => {
    for (const file of graph.files) {
      for (const forbidden of FORBIDDEN_MODULES) {
        expect(file === forbidden || file.startsWith(forbidden), `${file} (${forbidden})`).toBe(
          false,
        );
      }
    }
    for (const forbidden of FORBIDDEN_EXTERNAL) expect(graph.external).not.toContain(forbidden);
  });

  it('names no HOLDOUT or adjudication fixture and no Claude model id in f9/ source', () => {
    for (const name of F9_FILES) {
      const source = readFileSync(join(F9_DIR, name), 'utf8');
      expect(source).not.toMatch(/sonnet-acceptance-v1\.jsonl/);
      expect(source).not.toMatch(/adjudication-v1\.jsonl/);
      expect(source).not.toMatch(/orgunit-classifier-gold-v1\.jsonl/);
      expect(source).not.toMatch(/claude-(sonnet|opus|haiku|fable)/);
    }
  });

  it('the v2 scorer is byte-identical to the F7 execution build', () => {
    let available = true;
    try {
      execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${EXECUTION_BUILD}^{commit}`], {
        stdio: 'ignore',
      });
    } catch {
      available = false;
    }
    if (!available) return;
    const diff = execFileSync(
      'git',
      [
        '-C',
        REPO_ROOT,
        'diff',
        '--name-only',
        EXECUTION_BUILD,
        '--',
        `${HARNESS}/f2/`,
        `${HARNESS}/scoring/`,
      ],
      { encoding: 'utf8' },
    ).trim();
    expect(diff).toBe('');
  });
});

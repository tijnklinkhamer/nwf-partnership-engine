/**
 * PHASE 2B-2D A3 R1 ISOLATION — CONTRACTS AND TYPES, AND NOTHING ELSE.
 *
 * By walking the real import graph and source text of
 * `src/test/harness/phase2b2d/a3prep/`, this file proves:
 *
 *   - R1 holds exactly `contracts.ts` and `types.ts`; every later-slice module
 *     (rank, SET_P, SET_R, caps, SD7, SD9, manifests, split scope, freeze
 *     preflight, synthetic fixtures) is absent;
 *   - the whole transitive import closure of R1 is pure: no socket, no
 *     fetch(), no database, no filesystem, no child process, no environment
 *     read, no clock, no randomness, no provider or AI SDK;
 *   - R1 reaches only the canonical pure contracts it reuses (the SD7 and A1b
 *     draw contracts) and nothing under src/orgunits/, src/cli/, migrations/,
 *     the classifier/provider runtime or the A2 continuation machinery;
 *   - nothing in R1 names a sealed root, so it cannot read sealed data.
 *
 * WHY THIS LIVES IN src/test/unit/ AND NOT src/test/firewall/
 *
 *   The same reason A1, A1b and A3a gave: an existing test asserts that no file
 *   under `src/test/firewall/` changes after the methodology branch point, and
 *   R1 does not move that baseline. It adds no firewall file and edits none.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d/a3prep');

const R1_FILES = ['contracts.ts', 'types.ts'];

/** Later slices. Their absence is part of what R1 is. */
const LATER_SLICE_FILES = [
  'rank.ts',
  'setP.ts',
  'setR.ts',
  'organisationCaps.ts',
  'sd7.ts',
  'sd9.ts',
  'manifestTypes.ts',
  'splitScope.ts',
  'corpusFreezePreflight.ts',
  'syntheticFixtures.ts',
];

/** The only modules outside a3prep/ that R1 may reach, transitively. */
const PERMITTED_EXTERNAL_MODULES = [
  'src/test/harness/phase2b2d/draw/drawContract.ts',
  'src/test/harness/phase2b2d/sd7/sd7Contract.ts',
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function specifiersOf(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  for (const m of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) found.push(m[1] ?? '');
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1] ?? '');
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1] ?? '');
  for (const m of code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) found.push(m[1] ?? '');
  return found;
}

/** Every module R1 reaches, transitively, as repo-relative paths. */
function importClosure(): { modules: string[]; bareSpecifiers: string[] } {
  const seen = new Set<string>();
  const bare = new Set<string>();
  const queue = R1_FILES.map((file) => join(A3PREP_DIR, file));
  while (queue.length > 0) {
    const absolute = queue.shift() as string;
    const rel = relative(REPO_ROOT, absolute);
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const specifier of specifiersOf(readFileSync(absolute, 'utf8'))) {
      if (specifier.startsWith('.')) {
        queue.push(resolve(dirname(absolute), specifier.replace(/\.js$/, '.ts')));
      } else {
        bare.add(specifier);
      }
    }
  }
  return { modules: [...seen].sort(), bareSpecifiers: [...bare].sort() };
}

describe('2D-A3 R1: the a3prep namespace holds exactly R1', () => {
  it('contains exactly contracts.ts and types.ts', () => {
    expect(readdirSync(A3PREP_DIR).sort()).toEqual(R1_FILES);
  });

  it('contains no later-slice module', () => {
    for (const file of LATER_SLICE_FILES) {
      expect(existsSync(join(A3PREP_DIR, file)), file).toBe(false);
    }
  });
});

describe('2D-A3 R1: the import closure is pure and bounded', () => {
  const closure = importClosure();

  it('reaches only a3prep and the two canonical pure contracts', () => {
    expect(closure.modules).toEqual(
      [
        ...R1_FILES.map((f) => `src/test/harness/phase2b2d/a3prep/${f}`),
        ...PERMITTED_EXTERNAL_MODULES,
      ].sort(),
    );
  });

  it('imports no package and no node built-in at all', () => {
    expect(closure.bareSpecifiers).toEqual([]);
  });

  it('never reaches src/orgunits, the CLI, migrations, the classifier/provider runtime or A2 machinery', () => {
    for (const module of closure.modules) {
      expect(module.startsWith('src/orgunits/'), module).toBe(false);
      expect(module.startsWith('src/cli/'), module).toBe(false);
      expect(module.startsWith('migrations/'), module).toBe(false);
      expect(module.startsWith('src/db/'), module).toBe(false);
      expect(module.startsWith('src/test/harness/phase2b2d2c/'), module).toBe(false);
      for (const a2 of ['acquisitionGate', 'continuationWindow', 'transition', 'v3transition']) {
        expect(module.startsWith(`src/test/harness/phase2b2d/${a2}/`), module).toBe(false);
      }
    }
  });

  it('no module in the closure performs IO, reads the environment, or uses a clock or randomness', () => {
    const FORBIDDEN: readonly RegExp[] = [
      /\bfetch\s*\(/,
      /process\.env/,
      /Date\.now\s*\(|new Date\s*\(/,
      /Math\.random\s*\(/,
      /readFile|writeFile|readdir|createReadStream|createWriteStream/,
      /\bPool\b|\bClient\b|\bquery\s*\(/,
      /anthropic|openai|apollo/i,
    ];
    for (const module of closure.modules) {
      const code = stripComments(readFileSync(join(REPO_ROOT, module), 'utf8'));
      for (const pattern of FORBIDDEN) expect(code, `${module} ${pattern}`).not.toMatch(pattern);
    }
  });

  it('R1 names no sealed root and no sealed-split path', () => {
    for (const file of R1_FILES) {
      const code = stripComments(readFileSync(join(A3PREP_DIR, file), 'utf8'));
      expect(code, file).not.toMatch(/SEALED_ROOT_BY_SPLIT/);
      expect(code, file).not.toMatch(/gen1-dev-confirm|gen1-final-holdout|-sealed/);
      expect(code, file).not.toMatch(/homedir|Developer\//);
    }
  });

  it('importing the R1 modules at runtime has no observable side effect', async () => {
    const envBefore = JSON.stringify(process.env);
    const contracts = await import('../harness/phase2b2d/a3prep/contracts.js');
    await import('../harness/phase2b2d/a3prep/types.js');
    expect(JSON.stringify(process.env)).toBe(envBefore);
    expect(Object.isFrozen(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED)).toBe(true);
  });
});

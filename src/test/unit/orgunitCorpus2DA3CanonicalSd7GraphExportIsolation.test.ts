/**
 * PHASE 2B-2D A3 R6 ISOLATION — THE ONLY IMPLEMENTATION FILE R6 TOUCHED IS
 * THE CANONICAL SD7 PAIR-MEASUREMENT MODULE, AND IT TOUCHED IT NARROWLY.
 *
 * This file proves:
 *
 *   - the pre-R6 provenance baseline: at R5's tip `nearDuplicatePairs.ts` was
 *     blob d0591c3a (the A3a pilot lineage's measurement implementation);
 *   - R6's changed surface, measured from R5's tip to R6's OWN code commit
 *     (found as the commit that added this file, so a later slice cannot widen
 *     the claim), is that module plus R6's two test files and nothing else -
 *     no other SD7 file, no a3prep file, no production file, no migration,
 *     no docs/evaluation record;
 *   - `nearDuplicatePass` delegates its pair measurement to
 *     `measureNearDuplicateGraph`, and the tokeniser, shingler and Jaccard are
 *     each called in exactly one place, inside that function;
 *   - the module's import graph is unchanged;
 *   - `a3prep/` did not grow;
 *   - none of K1-K4 is answered.
 *
 * It lives in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const MODULE_PATH = 'src/test/harness/phase2b2d/sd7/nearDuplicatePairs.ts';
const A3PREP_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d/a3prep');

/** R6's exact parent: the canonical R5 tip. */
const R5_TIP = '592da708108ecd47f1f744e82d066612fdaf33c0';
/** `nearDuplicatePairs.ts` at R5's tip - the provenance baseline, not a pin on HEAD. */
const PRE_R6_BLOB = 'd0591c3ab5e004ea78a7ea59bc1c52d600ebee88';
const PRE_R6_SHA256 = '86c4c56dc328d36ab09321cd03168007192618d0465b45cccb504a9668da0053';
const PRE_R6_BYTES = 15938;

const THIS_FILE = 'src/test/unit/orgunitCorpus2DA3CanonicalSd7GraphExportIsolation.test.ts';
const R6_TEST_FILES = ['src/test/unit/orgunitCorpus2DA3CanonicalSd7GraphExport.test.ts', THIS_FILE];
const R6_AUDIT_NOTE = 'docs/audits/PHASE_2B_2D_A3_CANONICAL_PREP_R6_SD7_GRAPH_EXPORT_V1.md';

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });
}

function commitExists(commit: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${commit}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * R6's own code commit: the commit that ADDED this file. Before it is
 * committed there is none, and the claim is checked against the working tree
 * instead. Either way the range never extends into a later slice.
 */
function r6CodeCommit(): string | null {
  const found = git('log', '--diff-filter=A', '--format=%H', '--', THIS_FILE)
    .split('\n')
    .filter(Boolean);
  return found.length === 1 ? found[0]! : null;
}

function lines(text: string): string[] {
  return text.split('\n').filter((line) => line.length > 0);
}

/** Every path R6 changed: R5's tip -> R6's code commit (or the working tree before it). */
function changedByR6(): { readonly paths: readonly string[]; readonly committed: boolean } {
  const commit = r6CodeCommit();
  if (commit !== null) {
    return { paths: lines(git('diff', '--name-only', R5_TIP, commit)).sort(), committed: true };
  }
  const tracked = lines(git('diff', '--name-only', R5_TIP));
  const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
  return { paths: [...new Set([...tracked, ...untracked])].sort(), committed: false };
}

const baseAvailable = commitExists(R5_TIP);

function code(): string {
  return readFileSync(join(REPO_ROOT, MODULE_PATH), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** The body of a top-level `function name(` up to the next top-level declaration. */
function bodyOf(name: string): string {
  const source = code();
  const start = source.search(new RegExp(`\\n(export )?function ${name}\\(`));
  expect(start, name).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n(export )?(function|interface|type|const) /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe.skipIf(!baseAvailable)('2D-A3 R6: the pre-R6 provenance baseline', () => {
  it('R5 tip carried the A3a-lineage measurement module, byte for byte', () => {
    expect(git('rev-parse', `${R5_TIP}:${MODULE_PATH}`).trim()).toBe(PRE_R6_BLOB);
    const bytes = execFileSync('git', ['-C', REPO_ROOT, 'show', `${R5_TIP}:${MODULE_PATH}`]);
    expect(bytes.length).toBe(PRE_R6_BYTES);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(PRE_R6_SHA256);
  });

  it('R6 descends from R5 tip', () => {
    expect(() => git('merge-base', '--is-ancestor', R5_TIP, 'HEAD')).not.toThrow();
  });
});

describe.skipIf(!baseAvailable)('2D-A3 R6: the changed surface', () => {
  it('is the SD7 pair-measurement module plus R6’s own tests (and, uncommitted, its note)', () => {
    const { paths, committed } = changedByR6();
    const allowed = new Set([MODULE_PATH, ...R6_TEST_FILES]);
    if (!committed) allowed.add(R6_AUDIT_NOTE);
    for (const path of paths) expect(allowed, path).toContain(path);
    expect(paths).toContain(MODULE_PATH);
    if (committed) expect(paths).toEqual([...allowed].sort());
  });

  it('changed no other SD7 file, no a3prep file, no production file and no migration', () => {
    const { paths } = changedByR6();
    const forbidden = paths.filter(
      (path) =>
        (path.startsWith('src/test/harness/phase2b2d/sd7/') && path !== MODULE_PATH) ||
        path.startsWith('src/test/harness/phase2b2d/a3prep/') ||
        path.startsWith('src/test/firewall/') ||
        path.startsWith('src/orgunits/') ||
        path.startsWith('src/cli/') ||
        path.startsWith('src/db/') ||
        path.startsWith('migrations/') ||
        path.startsWith('docs/evaluation/') ||
        path === 'package.json' ||
        path === 'package-lock.json',
    );
    expect(forbidden).toEqual([]);
  });
});

describe('2D-A3 R6: nearDuplicatePass delegates its pair measurement', () => {
  it('exports the graph measurement and its type', () => {
    const source = code();
    expect(source).toMatch(/export function measureNearDuplicateGraph\(/);
    expect(source).toMatch(/export interface NearDuplicateGraphMeasurement \{/);
  });

  it('the graph type has exactly the five reviewed fields', () => {
    const match = /export interface NearDuplicateGraphMeasurement \{([^}]*)\}/.exec(code());
    const fields = [...(match?.[1] ?? '').matchAll(/readonly (\w+):/g)].map((m) => m[1]);
    expect(fields).toEqual([
      'documents',
      'measurableIndices',
      'shortTextUnresolvedCount',
      'comparedPairCount',
      'edges',
    ]);
  });

  it('nearDuplicatePass calls measureNearDuplicateGraph and measures nothing itself', () => {
    const pass = bodyOf('nearDuplicatePass');
    expect(pass.match(/measureNearDuplicateGraph\(/g) ?? []).toHaveLength(1);
    expect(pass).not.toMatch(/\bjaccard\(|\bshingleSet\(|\btokenise\(|\bgroupText\(/);
    expect(pass).toMatch(/auditComponents\(measurableIndices, edges\)/);
  });

  it('tokenise, shingleSet, jaccard and groupText are each called once, in the graph function', () => {
    const graph = bodyOf('measureNearDuplicateGraph');
    const source = code();
    for (const call of [
      /\btokenise\(/g,
      /\bshingleSet\(/g,
      /\bjaccard\(/g,
      /\bgroupText\(group, textOf\)/g,
    ]) {
      expect(source.match(call) ?? [], String(call)).toHaveLength(1);
      expect(graph.match(call) ?? [], String(call)).toHaveLength(1);
    }
  });

  it('the graph function audits no component and chooses no survivor', () => {
    const graph = bodyOf('measureNearDuplicateGraph');
    expect(graph).not.toMatch(/auditComponents|Survivors|survivor|isClique|rank|sort\(/i);
  });

  it('keeps the pre-R6 import graph exactly', () => {
    const specifiers = [...code().matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(specifiers.sort()).toEqual([
      './jaccard.js',
      './normaliseText.js',
      './sd7Contract.js',
      './tokenShingles.js',
    ]);
  });
});

describe('2D-A3 R6: the a3prep namespace did not grow', () => {
  it('holds exactly the R5 set', () => {
    expect(readdirSync(A3PREP_DIR).sort()).toEqual([
      'contracts.ts',
      'manifestTypes.ts',
      'rank.ts',
      'sd9.ts',
      'setP.ts',
      'splitScope.ts',
      'types.ts',
    ]);
  });
});

describe('2D-A3 R6: K1-K4 stay open', () => {
  it('the SD7 module names no K decision, sample rank or SET_P/SET_R pool', () => {
    const source = code();
    expect(source).not.toMatch(/A3_PREP_OWNER_DECISION|\bK[1-4]\b/);
    expect(source).not.toMatch(/SET_P|SET_R|setP|setR|a3prep|rankPosition|selected/);
  });

  it('the K3 marker is still carried, unresolved, by the R1 contracts', () => {
    const contracts = readFileSync(join(A3PREP_DIR, 'contracts.ts'), 'utf8');
    expect(contracts).toContain(
      'A3_PREP_OWNER_DECISION_REQUIRED:SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR',
    );
  });
});

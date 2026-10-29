/**
 * GLOBAL R6 FIREWALL - a Discovery Subject can be PLANNED as a research root
 * without an ECHE row, and nothing can EXECUTE one.
 *
 * Pins, over R6_BASE_COMMIT..R6_TERMINAL_COMMIT (the working tree while the
 * terminal is open):
 *   - the change set is exactly the named additions: no migration, no grant,
 *     no docs/evaluation record, no ADR, and no edit to any existing file -
 *     so the ECHE research path (authority, gateway, robots, orchestrator,
 *     cohort guard), every classifier contract and model pin, every frozen
 *     cohort and release digest, and R4/R5 are byte-identical;
 *   - src/orgunits/subjectResearch/ imports only the gateway's PURE pre-DNS
 *     gates (url.ts, hostPolicy.ts) and itself - never the gateway, robots,
 *     the orchestrator, a database driver, the classifier, the cohort guard,
 *     or any closed Track B namespace (identity, subjectRegistry,
 *     subjectReview, subjectHandoff, subjectSnapshot*) or R4/R5's
 *     subjectJurisdiction;
 *   - it has no production importer, so no research run can reach it;
 *   - the admission capability has exactly ONE constructor and it throws
 *     outside vitest; every plan is the literal `executable: false`;
 *   - it carries no country, legal form, ECHE identifier, canonical id,
 *     qualification or permission.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** Global R5 pin commit (`0e9e943`): the R6 base. */
const R6_BASE_COMMIT = '0e9e9437cef1e97ff858d581cd7464d68a725f26';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const R6_TERMINAL_COMMIT: string | null = '9d6d1f12263f03df145dc42e2b616ff1a5b918bb';

const MODULE_DIR = 'src/orgunits/subjectResearch/';
const MODULE_FILES = [`${MODULE_DIR}admission.ts`, `${MODULE_DIR}plan.ts`];

const AUTHORISED_CHANGESET = [
  ...MODULE_FILES.map((f) => `A\t${f}`),
  'A\tsrc/test/firewall/globalResearchR6.firewall.test.ts',
  'A\tsrc/test/integration/subjectResearchR6.test.ts',
  'A\tsrc/test/unit/subjectResearchR6.test.ts',
].sort();

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

const rangeAvailable =
  commitExists(R6_BASE_COMMIT) && (R6_TERMINAL_COMMIT === null || commitExists(R6_TERMINAL_COMMIT));

const range = (): string[] =>
  R6_TERMINAL_COMMIT === null ? [R6_BASE_COMMIT] : [R6_BASE_COMMIT, R6_TERMINAL_COMMIT];

function changeset(): string[] {
  const tracked = git('diff', '--name-status', '--find-renames', ...range());
  const untracked =
    R6_TERMINAL_COMMIT === null
      ? git('ls-files', '--others', '--exclude-standard')
          .split('\n')
          // A worktree's `node_modules` symlink is not a source change.
          .filter((l) => l.length > 0 && l !== 'node_modules')
          .map((l) => `A\t${l}`)
          .join('\n')
      : '';
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0))].sort();
}

function sourceOf(path: string): string {
  if (R6_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return git('show', `${R6_TERMINAL_COMMIT}:${path}`);
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'test') walk(rel);
      } else if (rel.endsWith('.ts')) out.push(rel);
    }
  };
  walk('src');
  return out.sort();
}

describe.skipIf(!rangeAvailable)('R6: the change set over its own range', () => {
  it('is exactly the named files, all additions', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('edits no migration, docs record, research-path, classifier or R4/R5 file', () => {
    const touched = git(
      'diff',
      '--name-status',
      '--diff-filter=MDRT',
      ...range(),
      '--',
      'migrations',
      'docs',
      'src/orgunits/web',
      'src/orgunits/orchestrator',
      'src/orgunits/classify',
      'src/orgunits/subjectJurisdiction',
      'src/test/fixtures',
    )
      .split('\n')
      .filter((l) => l.length > 0);
    expect(touched).toEqual([]);
  });
});

describe('R6: subjectResearch is pure, unconnected and permission-free', () => {
  it('is exactly two production files', () => {
    expect(
      productionFiles()
        .filter((f) => f.startsWith(MODULE_DIR))
        .sort(),
    ).toEqual(MODULE_FILES);
  });

  it('imports only the pure pre-DNS gates and itself', () => {
    const imports = MODULE_FILES.flatMap((f) =>
      [...codeOf(sourceOf(f)).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]),
    ).sort();
    expect([...new Set(imports)]).toEqual([
      '../web/hostPolicy.js',
      '../web/url.js',
      './admission.js',
    ]);
  });

  it('opens no socket, database, file or clock; reads only the vitest marker', () => {
    for (const file of MODULE_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /node:|\bpg\b|fetch\(|Date\.now|new Date\(|Math\.random|require\(|import\(|executeWebAttempt|runRootAcquisition|runOrganisationDiscovery|robots\.txt/,
      );
      const envReads = [...code.matchAll(/process\.env\[?['".]?(\w+)/g)].map((m) => m[1]);
      expect(
        envReads.every((name) => name === 'VITEST'),
        file,
      ).toBe(true);
    }
  });

  it('has exactly one admission constructor, and it is the vitest seam', () => {
    const code = codeOf(sourceOf(`${MODULE_DIR}admission.ts`));
    expect([...code.matchAll(/new SubjectResearchAdmission\(/g)]).toHaveLength(1);
    expect(code).toMatch(/private constructor\(/);
    expect(code).toMatch(/if \(process\.env\['VITEST'\] !== 'true'\) \{\s*throw new Error\(/);
    expect([...code.matchAll(/static (\w+)\(/g)].map((m) => m[1]).sort()).toEqual([
      'forVitestSyntheticRehearsal',
      'isAdmission',
    ]);
  });

  it('never makes a plan executable and never carries jurisdiction, identity or permission', () => {
    const code = codeOf(sourceOf(`${MODULE_DIR}plan.ts`));
    expect(code).not.toMatch(/executable:\s*true/);
    expect([...code.matchAll(/executable: false,/g)].length).toBeGreaterThanOrEqual(2);
    expect(code).not.toMatch(
      /country|legalForm|legal_form|eche_?row_?key|echeRowKey\b|canonicalId\b|cand:|contact|consent|lawful|eligib/i,
    );
    expect(code).not.toMatch(/'(ALLOWED|GRANTED|PERMITTED|ELIGIBLE|VERIFIED)'/);
  });

  it('has no production importer, so no research run can reach it', () => {
    const importers = productionFiles().filter(
      (f) =>
        !f.startsWith(MODULE_DIR) &&
        /subjectResearch/.test(codeOf(readFileSync(join(REPO_ROOT, f), 'utf8'))),
    );
    expect(importers).toEqual([]);
  });
});

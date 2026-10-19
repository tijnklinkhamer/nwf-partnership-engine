/**
 * GLOBAL R5 FIREWALL - the Engine half of the first non-ECHE vertical slice
 * is one pure, permission-free evidence companion, and nothing else moves.
 *
 * Pins, over R5_BASE_COMMIT..R5_TERMINAL_COMMIT (the working tree while the
 * terminal is open):
 *   - the change set is exactly the named files: no migration, no
 *     docs/evaluation record, no ADR edit (ADR 0024 stays Proposed and is not
 *     amended), and no edit to any existing file - R4's module, migration,
 *     firewall, tests and every frozen cohort pin are byte-identical;
 *   - `evidence.ts` lives INSIDE src/orgunits/subjectJurisdiction/ so the
 *     closed R4 firewall ("no production importer outside its own
 *     directory") stays true unedited;
 *   - `evidence.ts` imports only its two R4 siblings and node:crypto - never
 *     the B2.1 identity, B2.3 review or B2.4 handoff namespaces, whose
 *     importer sets earlier firewalls freeze;
 *   - it opens no socket, database, file, environment, clock or randomness;
 *   - every permission it declares is the literal `NONE`, its review state is
 *     the literal UNREVIEWED with no authority, and it names no ECHE
 *     identifier field;
 *   - the synthetic fixture pack uses only reserved `.example` hosts.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** Global Foundation R4 pin commit (`6c793c5`): the R5 base. */
const R5_BASE_COMMIT = '6c793c53cb293c6fa9410b6d382673f337b59fee';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const R5_TERMINAL_COMMIT: string | null = null;

const MODULE = 'src/orgunits/subjectJurisdiction/evidence.ts';
const PACK = 'src/test/fixtures/globalR5/jurisdiction-pack.json';
const R4_FILES = [
  'migrations/0016_subject_jurisdiction_claims.sql',
  'src/orgunits/subjectJurisdiction/standing.ts',
  'src/orgunits/subjectJurisdiction/vocabulary.ts',
  'src/test/firewall/globalFoundationR4.firewall.test.ts',
  'docs/adr/0024-worldwide-subject-jurisdiction-claims.md',
];

const AUTHORISED_CHANGESET = [
  `A\t${MODULE}`,
  `A\t${PACK}`,
  'A\tsrc/test/firewall/globalIntegrationR5.firewall.test.ts',
  'A\tsrc/test/integration/subjectJurisdictionEvidenceR5.test.ts',
  'A\tsrc/test/unit/subjectJurisdictionEvidenceR5.test.ts',
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
  commitExists(R5_BASE_COMMIT) && (R5_TERMINAL_COMMIT === null || commitExists(R5_TERMINAL_COMMIT));

const range = (): string[] =>
  R5_TERMINAL_COMMIT === null ? [R5_BASE_COMMIT] : [R5_BASE_COMMIT, R5_TERMINAL_COMMIT];

function changeset(): string[] {
  const tracked = git('diff', '--name-status', '--find-renames', ...range());
  const untracked =
    R5_TERMINAL_COMMIT === null
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
  if (R5_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return git('show', `${R5_TERMINAL_COMMIT}:${path}`);
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

describe.skipIf(!rangeAvailable)('R5: the change set over its own range', () => {
  it('is exactly the named files, all additions', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('leaves every R4 file, migration and docs record byte-identical', () => {
    const touched = git(
      'diff',
      '--name-status',
      ...range(),
      '--',
      'migrations',
      'docs',
      ...R4_FILES,
    )
      .split('\n')
      .filter((l) => l.length > 0);
    expect(touched).toEqual([]);
  });
});

describe('R5: the jurisdiction evidence companion is pure and grants nothing', () => {
  const code = codeOf(sourceOf(MODULE));

  it('imports only its R4 siblings and node:crypto', () => {
    const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(['./standing.js', './vocabulary.js', 'node:crypto']);
  });

  it('opens no socket, database, file or environment, and reads no clock or randomness', () => {
    expect(code).not.toMatch(
      /process\.env|node:(?!crypto)|\bpg\b|fetch\(|Date\.now|new Date\(|Math\.random|require\(|import\(/,
    );
  });

  it('declares every permission as the literal NONE and no reviewed state', () => {
    const block = /export const PERMISSIONS = Object\.freeze\(\{([\s\S]*?)\}/.exec(code)?.[1] ?? '';
    const values = [...block.matchAll(/^\s*(\w+):\s*'([^']*)'/gm)].map((m) => [m[1], m[2]]);
    expect(values.length).toBeGreaterThanOrEqual(9);
    for (const [, value] of values) expect(value).toBe('NONE');
    expect(code).toContain("review: { state: 'UNREVIEWED', authority: 'NONE_ASSIGNED' }");
    expect(code).not.toMatch(/'(REVIEWED|CONFIRMED|ALLOWED|PERMITTED|ELIGIBLE|GRANTED)'/);
  });

  it('names no ECHE identifier field and issues no identifier', () => {
    expect(code).not.toMatch(/eche_?row_?key|echeRowKey|erasmus|\bpic\b|country_code|canonicalId/i);
  });

  it('has no production importer (so the R4 firewall stays true unedited)', () => {
    const importers = productionFiles().filter(
      (f) =>
        f !== MODULE &&
        /subjectJurisdiction\/evidence/.test(codeOf(readFileSync(join(REPO_ROOT, f), 'utf8'))),
    );
    expect(importers).toEqual([]);
  });
});

describe('R5: the synthetic fixture pack', () => {
  it('uses reserved .example hosts only and declares itself synthetic', () => {
    const pack = sourceOf(PACK);
    expect(pack).toContain('"syntheticOnly":true');
    const hosts = [...pack.matchAll(/https?:\/\/([^/"]+)/g)].map((m) => m[1]!);
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) expect(host).toMatch(/\.example$/);
  });
});

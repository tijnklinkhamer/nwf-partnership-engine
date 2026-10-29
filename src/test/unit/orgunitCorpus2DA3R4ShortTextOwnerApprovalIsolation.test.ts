/**
 * PHASE 2B-2D A3 R46 — ISOLATION OF THE R4 SHORT-TEXT OWNER APPROVAL.
 *
 * Static and lineage proofs that R46:
 *
 *   - descends from the exact R45 tip, pins R45's scope in one first commit
 *     touching exactly one file, and merges nothing;
 *   - changes NO runtime, harness, SD7, SD9, migration, CLI or src/orgunits
 *     file - the amendment is approved, never implemented;
 *   - changes nothing outside the R45 scope pin, its two tests, its owner
 *     approval record and its audit, and edits no earlier record or audit;
 *   - creates no R4 implementation namespace, no R47 execution artifact, and
 *     no corpus-freeze, Governance V6, A4 or A5 artifact;
 *   - imports nothing but node built-ins and vitest - no SQL, pool,
 *     environment, network, provider, classifier, label, gold or sealed-root
 *     capability.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';

/** The exact R45 tip R46 was cut from. */
const R45_TERMINAL = '65bde0c033ff89c2ee98aa44880b8600ab0da11f';
/** The one commit that pinned R45's own isolation test to its range. */
const R45_SCOPE_PIN_COMMIT = 'fb12dcde1df8460f527b00640da484d45b69341f';
const R45_ISOLATION_TEST =
  'src/test/unit/orgunitCorpus2DA3ShortTextAmendmentDesignIsolation.test.ts';
/**
 * R46'S OWN TERMINAL COMMIT.
 *
 * R46's lineage, changed-surface, no-R47, no-R4-implementation,
 * no-corpus-replay and no-A4/A5 assertions describe R46'S SLICE, so they range
 * over R46's own commits - `R45_TERMINAL..R46_TERMINAL` - and inspect the tree
 * at R46_TERMINAL, rather than HEAD and the working tree. Once a later slice
 * (R47's authorised R4 implementation and replay) lands on top, the working
 * tree is no longer R46's surface, and diffing to it would fail for the honest
 * reason that history moved on rather than because R46 changed.
 *
 * This is the same standing convention R19 through R45 apply, and it
 * WEAKENS NOTHING: R46's range is frozen, its permitted-path list is
 * unchanged, and each later slice pins the equivalent scope over its own range.
 */
const R46_TERMINAL = 'e0d1555c09afdc5f17cb3b6b62ac8682a248b2df';
/** The terminal A2 checkpoint; never an A3 ancestor. */
const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';

const R46_TESTS = [
  'src/test/unit/orgunitCorpus2DA3R4ShortTextOwnerApproval.test.ts',
  'src/test/unit/orgunitCorpus2DA3R4ShortTextOwnerApprovalIsolation.test.ts',
];
const R46_RECORD =
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_OWNER_APPROVAL_V1.json';
const R46_AUDIT =
  'docs/audits/PHASE_2B_2D_A3_R46_METHODOLOGY_V2_R4_SHORT_TEXT_OWNER_APPROVAL_V1.md';

/** The only specifiers an R46 test may import: no harness module at all. */
const PERMITTED_SPECIFIERS = new Set([
  'node:child_process',
  'node:crypto',
  'node:fs',
  'node:path',
  'vitest',
]);

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
}

function commitExists(commit: string): boolean {
  try {
    git('cat-file', '-e', `${commit}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

const lines = (value: string): string[] => value.split('\n').filter((l) => l.length > 0);
const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Code with string literals blanked: tokens and disclaimers are not capabilities. */
function codeWithoutStrings(source: string): string {
  return stripComments(source)
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
}

/** Import specifiers only: a statement ending `from '...';`. */
function specifiersOf(source: string): string[] {
  return [...stripComments(source).matchAll(/from '([^']+)';\s*$/gm)].map((match) => match[1]!);
}

const testSource = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');

const baseAvailable =
  commitExists(R45_TERMINAL) && commitExists(R45_SCOPE_PIN_COMMIT) && commitExists(R46_TERMINAL);

/** Every path R46's own commits changed (R45_TERMINAL..R46_TERMINAL). */
function changedSinceR45(): string[] {
  return lines(git('diff', '--name-only', R45_TERMINAL, R46_TERMINAL));
}

// ---------------------------------------------------------------------------
// A. NO CAPABILITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R46: governance inspection only, no capability', () => {
  it.each(R46_TESTS)('%s imports only node built-ins and vitest', (path) => {
    const outside = specifiersOf(testSource(path)).filter((s) => !PERMITTED_SPECIFIERS.has(s));
    expect(outside).toEqual([]);
  });

  it.each(R46_TESTS)(
    '%s has no SQL, pool, env, network, provider, write or sealed-root capability',
    (path) => {
      const source = codeWithoutStrings(testSource(path));
      for (const pattern of [
        /\bfetch\s*\(/,
        /process\.env/,
        /\bnew\s+Pool\b/,
        /\bconnect\s*\(/,
        /\.query\s*\(/,
        /\bwriteFile/,
        /\bmkdir/,
        /\bunlink/,
        /\brmSync\b/,
        /\bDate\.now\s*\(/,
        /\bMath\.random\s*\(/,
        /\bspawn\s*\(/,
        /\bimport\s*\(/,
        /\brequire\s*\(/,
      ]) {
        expect(pattern.test(source), `${path}: ${String(pattern)}`).toBe(false);
      }
    },
  );

  it('the approval test reads no real-corpus artefact: no corpus, sealed or sample path', () => {
    const literals = stripComments(testSource(R46_TESTS[0]!));
    expect(literals).not.toMatch(/generation2\/corpus|docs\/evaluation\/corpus\/|sealed\//);
    expect(literals).not.toMatch(/phase2b2d\/(?:a3|sd7|corpus)/);
  });
});

// ---------------------------------------------------------------------------
// B. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R46: lineage and changed surface', () => {
  it('descends from the exact R45 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R45_TERMINAL, R46_TERMINAL)).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R45_TERMINAL}..${R46_TERMINAL}`))).toEqual([]);
  });

  it('never makes the terminal A2 checkpoint an ancestor of A3', () => {
    if (commitExists(A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R45's scope in exactly one first commit that touched exactly one file", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R45_TERMINAL}..${R46_TERMINAL}`));
    expect(first).toBe(R45_SCOPE_PIN_COMMIT);
    expect(git('rev-parse', `${R45_SCOPE_PIN_COMMIT}^`).trim()).toBe(R45_TERMINAL);
    expect(lines(git('diff', '--name-only', R45_TERMINAL, R45_SCOPE_PIN_COMMIT))).toEqual([
      R45_ISOLATION_TEST,
    ]);
    expect(sha256(git('show', `${R46_TERMINAL}:${R45_ISOLATION_TEST}`))).toBe(
      sha256(git('show', `${R45_SCOPE_PIN_COMMIT}:${R45_ISOLATION_TEST}`)),
    );
  });

  it('implemented nothing: no harness, SD7, SD9, migration, CLI or src/orgunits change', () => {
    const touched = lines(
      git(
        'diff',
        '--name-only',
        R45_TERMINAL,
        R46_TERMINAL,
        '--',
        HARNESS,
        'migrations',
        'src/orgunits',
        'src/cli',
        'scripts',
        'package.json',
      ),
    );
    expect(touched).toEqual([]);
  });

  it('leaves every earlier public record and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R45_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R45_TERMINAL, R46_TERMINAL, '--', ...prior))).toEqual(
      [],
    );
  });

  it('changes nothing outside the R45 scope pin, its tests, its approval record and its audit', () => {
    const permitted = (path: string): boolean =>
      path === R45_ISOLATION_TEST ||
      R46_TESTS.includes(path) ||
      path === R46_RECORD ||
      path === R46_AUDIT;
    expect(changedSinceR45().filter((path) => !permitted(path))).toEqual([]);
  });

  it('created no R4 implementation, R47, corpus-freeze, Governance V6, A4 or A5 artifact (tree at R46_TERMINAL)', () => {
    const added = changedSinceR45();
    expect(
      added.filter((path) =>
        /R47|CORPUS_FREEZE|CORPUS_FROZEN|A4_|A5_|GOVERNANCE_AUTHORITY_CENSUS_V6|METHODOLOGY_V4|GEN3|REPLAY_RESULT/.test(
          path,
        ),
      ),
    ).toEqual([]);
    const tree = lines(git('ls-tree', '-r', '--name-only', R46_TERMINAL));
    for (const name of [
      'a3graphsR4',
      'a3samplesR4',
      'a3readinessR4',
      'a3graphsV6',
      'a3samplesV6',
      'a3readinessV6',
      'a3corpusFreeze',
      'a3governanceV6',
      'a4',
    ]) {
      expect(
        tree.filter((path) => path.startsWith(`${HARNESS}/${name}/`)),
        name,
      ).toEqual([]);
    }
  });
});

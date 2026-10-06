/**
 * PHASE 2B-2D A3 R45 — ISOLATION OF THE SHORT-TEXT AMENDMENT DESIGN.
 *
 * Static and lineage proofs that R45:
 *
 *   - descends from the exact R44 tip, pins R44's scope in one first commit
 *     touching exactly one file, and merges nothing;
 *   - adds NO runtime, harness, SD7, SD9, migration or src/orgunits change -
 *     the amendment is designed, never implemented;
 *   - changes nothing outside the R44 scope pin, its two tests, its options
 *     record, its draft proposal and its audit;
 *   - creates no owner approval, no frozen methodology, no new semantic
 *     namespace, and no corpus-freeze, A4 or A5 artifact;
 *   - imports only pure canonical SD7 / SD9 helpers - no SQL, pool,
 *     environment, network, provider, classifier, label, gold or sealed-root
 *     capability.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';

/** The exact R44 tip R45 was cut from. */
const R44_TERMINAL = '4fd9ffd469333ba181584d56018c61e9ae119c77';
/** The one commit that pinned R44's own isolation test to its range. */
const R44_SCOPE_PIN_COMMIT = 'f57d10350a46a4e960d2a6b8d2aaf26230e17790';
const R44_ISOLATION_TEST =
  'src/test/unit/orgunitCorpus2DA3DevTrainFreezeBlockerClosureIsolation.test.ts';
/** The terminal A2 checkpoint; never an A3 ancestor. */
const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';

const R45_TESTS = [
  'src/test/unit/orgunitCorpus2DA3ShortTextAmendmentDesign.test.ts',
  'src/test/unit/orgunitCorpus2DA3ShortTextAmendmentDesignIsolation.test.ts',
];
const R45_RECORDS = [
  'docs/evaluation/PHASE_2B_2D_A3_R45_SHORT_TEXT_METHODOLOGY_AMENDMENT_OPTIONS_V1.json',
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_PROPOSAL_V1.json',
];
const R45_AUDIT = 'docs/audits/PHASE_2B_2D_A3_R45_SHORT_TEXT_METHODOLOGY_AMENDMENT_DESIGN_V1.md';

/** The only specifiers an R45 test may import. */
const PERMITTED_SPECIFIERS = new Set([
  'node:child_process',
  'node:crypto',
  'node:fs',
  'node:path',
  'vitest',
  '../harness/phase2b2d/a3prep/sd9.js',
  '../harness/phase2b2d/sd7/jaccard.js',
  '../harness/phase2b2d/sd7/normaliseText.js',
  '../harness/phase2b2d/sd7/sd7Contract.js',
  '../harness/phase2b2d/sd7/tokenShingles.js',
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

const baseAvailable = commitExists(R44_TERMINAL) && commitExists(R44_SCOPE_PIN_COMMIT);

/** Every path changed since R44 - committed or not. */
function changedSinceR44(): string[] {
  return [
    ...new Set([
      ...lines(git('diff', '--name-only', R44_TERMINAL)),
      ...lines(git('ls-files', '--others', '--exclude-standard')),
    ]),
  ];
}

// ---------------------------------------------------------------------------
// A. NO CAPABILITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R45: design inspection only, no capability', () => {
  it.each(R45_TESTS)('%s imports only pure canonical SD7 / SD9 helpers', (path) => {
    const outside = specifiersOf(testSource(path)).filter((s) => !PERMITTED_SPECIFIERS.has(s));
    expect(outside).toEqual([]);
  });

  it.each(R45_TESTS)(
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
      ]) {
        expect(pattern.test(source), `${path}: ${String(pattern)}`).toBe(false);
      }
      for (const forbidden of [
        /^pg$|\/db\//,
        /a3evidence|a3documents|a3graphs|a3samples|a3readiness|a3governance|a3crossGeneration/,
        /classify|anthropic|claude-agent|provider|sealed|gold|label/i,
        /^node:(?:net|http|https|dns|tls)$/,
      ]) {
        expect(
          specifiersOf(testSource(path)).filter((s) => forbidden.test(s)),
          `${path}: ${String(forbidden)}`,
        ).toEqual([]);
      }
    },
  );

  it('the design test reads no real-corpus artefact: no corpus, sealed or sample path', () => {
    // Scans the DESIGN test only, with strings blanked: this file's own
    // patterns below would otherwise match themselves.
    const source = codeWithoutStrings(testSource(R45_TESTS[0]!));
    expect(source).not.toMatch(/generation2|evaluation\/corpus|sealed/i);
    const literals = stripComments(testSource(R45_TESTS[0]!));
    expect(literals).not.toMatch(/generation2\/corpus|docs\/evaluation\/corpus\//);
  });
});

// ---------------------------------------------------------------------------
// B. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R45: lineage and changed surface', () => {
  it('descends from the exact R44 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R44_TERMINAL, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R44_TERMINAL}..HEAD`))).toEqual([]);
  });

  it('never makes the terminal A2 checkpoint an ancestor of A3', () => {
    if (commitExists(A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R44's scope in exactly one first commit that touched exactly one file", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R44_TERMINAL}..HEAD`));
    expect(first).toBe(R44_SCOPE_PIN_COMMIT);
    expect(git('rev-parse', `${R44_SCOPE_PIN_COMMIT}^`).trim()).toBe(R44_TERMINAL);
    expect(lines(git('diff', '--name-only', R44_TERMINAL, R44_SCOPE_PIN_COMMIT))).toEqual([
      R44_ISOLATION_TEST,
    ]);
    expect(sha256(readFileSync(join(REPO_ROOT, R44_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R44_SCOPE_PIN_COMMIT}:${R44_ISOLATION_TEST}`)),
    );
  });

  it('implements nothing: no harness, SD7, SD9, migration or src/orgunits change', () => {
    const touched = [
      ...lines(
        git(
          'diff',
          '--name-only',
          R44_TERMINAL,
          '--',
          HARNESS,
          'migrations',
          'src/orgunits',
          'src/cli',
        ),
      ),
      ...lines(
        git(
          'ls-files',
          '--others',
          '--exclude-standard',
          '--',
          HARNESS,
          'migrations',
          'src/orgunits',
        ),
      ),
    ];
    expect(touched).toEqual([]);
  });

  it('leaves every earlier public record and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R44_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R44_TERMINAL, '--', ...prior))).toEqual([]);
  });

  it('changes nothing outside the R44 scope pin, its tests, its two records and its audit', () => {
    const permitted = (path: string): boolean =>
      path === R44_ISOLATION_TEST ||
      R45_TESTS.includes(path) ||
      R45_RECORDS.includes(path) ||
      path === R45_AUDIT;
    expect(changedSinceR44().filter((path) => !permitted(path))).toEqual([]);
  });

  it('creates no owner approval, frozen methodology, namespace, freeze, A4 or A5 artifact', () => {
    const added = changedSinceR44();
    expect(
      added.filter((path) =>
        /OWNER_APPROVAL|OWNER_FREEZE|FROZEN|CORPUS_FREEZE|A4_|A5_|GOVERNANCE_AUTHORITY_CENSUS_V6|METHODOLOGY_V4|GEN3/.test(
          path,
        ),
      ),
    ).toEqual([]);
    for (const name of [
      'a3graphsR4',
      'a3samplesR4',
      'a3readinessR4',
      'a3corpusFreeze',
      'a3governanceV6',
      'a4',
    ]) {
      expect(existsSync(join(REPO_ROOT, HARNESS, name)), name).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// C. THE AUDIT.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(REPO_ROOT, R45_AUDIT)))('2D-A3 R45: the audit', () => {
  const audit = existsSync(join(REPO_ROOT, R45_AUDIT))
    ? readFileSync(join(REPO_ROOT, R45_AUDIT), 'utf8')
    : '';

  it('states the terminal, the recommendation, the classification and the owner question', () => {
    expect(audit).toContain(
      'A3_SHORT_TEXT_METHODOLOGY_AMENDMENT_DESIGNED_AWAIT_OWNER_OPTION_APPROVAL',
    );
    expect(audit).toContain('SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK');
    expect(audit).toContain('METHODOLOGY_V2_R4');
    expect(audit).toContain('NOT_EXECUTION_AUTHORITY');
    expect(audit).toMatch(/Do you approve that exact methodology amendment/);
    expect(audit).toMatch(/does \*\*not\*\* claim that 6 \/ 4 becomes 0 \/ 0/);
  });
});

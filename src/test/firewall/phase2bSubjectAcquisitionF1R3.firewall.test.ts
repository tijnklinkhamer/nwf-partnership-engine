/**
 * TRACK B, B2.5-M1-R3 - THE ISOLATION TEST FOR THE F-1 FOCAL-COVERAGE
 * CORRECTION OF THE PROVISIONAL ACQUISITION COMPANION.
 *
 * F-1: over a TRUNCATED holder read, B's own S0 and M1 builders built a
 * companion stating focal-record coverage REPRESENTED, `verifyAcquisitionCompanion`
 * called it CONSISTENT and `reproduceAcquisitionCompanion` REPRODUCED it,
 * because the companion copied the assembler-reported coverage instead of
 * deriving it. R3 re-derives it in the builder (exactly) and in the
 * verification (from the companion and the manifest alone).
 *
 * Per the phase-isolation convention this correction is pinned by its OWN
 * file over its OWN range, REPAIR_BASE_COMMIT (the accepted B2.5-M1-R1
 * terminal pin) to REPAIR_TERMINAL_COMMIT. It proves, from the real git range
 * and the real source:
 *
 *   - the change set is EXACTLY the companion, the M1 unit test (added lines
 *     only) and this firewall: the M1 contract and every fixed statement it
 *     carries (so every digest-bound section), the assembler, S0, the loader,
 *     the validator, every migration, the CLI, every earlier test and firewall
 *     and every dependency are untouched;
 *   - the companion removes no code - only the comment lines it rewords - and
 *     keeps exactly its imports, exports and refusal codes;
 *   - its restated focal-rule dependencies are the assembler's own list;
 *   - the builder refuses a coverage or gap list the derivation does not
 *     give, and the verification re-derives coverage, each by a static rule
 *     that is run against MUTATED copies too, so a rule that could never fire
 *     is itself a failure.
 * What cannot be proven statically - the refusals, the honest builds, the
 * re-sealed forgeries - is proven by `M1-R3-*` in
 * src/test/unit/discoverySubjectAcquisitionB25M1.test.ts.
 *
 * THE RANGE IS OPEN to the working tree while the correction is uncommitted;
 * the terminal pin belongs to a separately authorised commit-closure phase.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as companion from '../../orgunits/subjectReadProvenance/companion.js';
import { COMPANION_REFUSAL_CODES } from '../../orgunits/subjectReadProvenance/contract.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B2.5-M1-R1 terminal (implementation 99b266e + firewall pin). */
const REPAIR_BASE_COMMIT = 'dbfccc43094aee4249c387358d617f64ed4d5b0d';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = null;

const COMPANION = 'src/orgunits/subjectReadProvenance/companion.ts';
const ASSEMBLER = 'src/orgunits/subjectSnapshotRead/assemble.ts';
const UNIT_TEST = 'src/test/unit/discoverySubjectAcquisitionB25M1.test.ts';
const FIREWALL = 'src/test/firewall/phase2bSubjectAcquisitionF1R3.firewall.test.ts';
const M1_FIREWALL = 'src/test/firewall/phase2bSubjectAcquisitionM1.firewall.test.ts';

const AUTHORISED_CHANGESET = [`M\t${COMPANION}`, `M\t${UNIT_TEST}`, `A\t${FIREWALL}`].sort();

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
  commitExists(REPAIR_BASE_COMMIT) &&
  (REPAIR_TERMINAL_COMMIT === null || commitExists(REPAIR_TERMINAL_COMMIT));

const range = (): string[] =>
  REPAIR_TERMINAL_COMMIT === null
    ? [REPAIR_BASE_COMMIT]
    : [REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT];

/** `--name-status` lines over the range, plus untracked files as `A` while the range is open. */
function changeset(): string[] {
  const tracked = execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '--name-status', '--find-renames', ...range()],
    { encoding: 'utf8' },
  );
  const untracked =
    REPAIR_TERMINAL_COMMIT === null
      ? execFileSync('git', ['-C', REPO_ROOT, 'ls-files', '--others', '--exclude-standard'], {
          encoding: 'utf8',
        })
          .split('\n')
          .filter((l) => l.length > 0)
          .map((l) => `A\t${l}`)
          .join('\n')
      : '';
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0))].sort();
}

/** The `-`/`+` content lines of one file's diff over the range. */
function diffLines(path: string): { removed: string[]; added: string[] } {
  const diff = execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '--unified=0', ...range(), '--', path],
    { encoding: 'utf8' },
  ).split('\n');
  return {
    removed: diff.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1)),
    added: diff.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)),
  };
}

const baseSourceOf = (path: string): string =>
  execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_BASE_COMMIT}:${path}`], {
    encoding: 'utf8',
  });

function sourceOf(path: string): string {
  if (REPAIR_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_TERMINAL_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

const codeOf = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const importsOf = (code: string): string[] =>
  [...code.matchAll(/^import\s[\s\S]*?\sfrom '[^']+';/gm)].map((m) => m[0].replace(/\s+/g, ' '));
const exportsOf = (code: string): string[] =>
  [...code.matchAll(/^export\s+(?:async\s+)?(?:function|const|interface|type|class)\s+(\w+)/gm)]
    .map((m) => m[1]!)
    .sort();

/** The string members of one `const NAME = [ ... ]` array literal in `source`. */
function arrayLiteral(source: string, name: string): string[] {
  const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`).exec(codeOf(source));
  if (m === null) throw new Error(`${name} not found`);
  return [...m[1]!.matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]!);
}

/** The body of the top-level function `name` in `code`, up to the next top-level declaration. */
function functionBody(code: string, name: string): string {
  const start = code.search(new RegExp(`^(export )?function ${name}\\(`, 'm'));
  if (start < 0) return '';
  const rest = code.slice(start + 1);
  const next = rest.search(/^(export )?(function|const|interface|type) /m);
  return next < 0 ? rest : rest.slice(0, next);
}

/** The static rules the correction must keep; each returns true when broken. */
const RULES: readonly (readonly [string, (code: string) => boolean])[] = [
  [
    'builder-derives-focal-coverage',
    (code) => {
      const build = functionBody(code, 'build');
      return !(
        /derivedFocalCoverage\(/.test(build) &&
        /ran\.focalCoverage !== derived\.coverage\) inconsistent\('validation\.focal_coverage'\)/.test(
          build,
        ) &&
        /sameList\(ran\.focalCoverageGaps, derived\.gaps\)/.test(build) &&
        /inconsistent\('validation\.focal_coverage_gaps'\)/.test(build)
      );
    },
  ],
  [
    'verification-derives-focal-coverage',
    (code) =>
      !/if \(!focalCoverageFollows\(c, manifest as SnapshotScopeManifest\)\) \{\s*inconsistencies\.push\('focalCoverage'\);/.test(
        functionBody(code, 'verifyAcquisitionCompanion'),
      ) || !/derivedFocalCoverage\(/.test(functionBody(code, 'focalCoverageFollows')),
  ],
  [
    'weakest-is-the-minimum',
    (code) => !/STRENGTH\[b\]! < STRENGTH\[a\]! \? b : a/.test(functionBody(code, 'weakest')),
  ],
  [
    'holder-statements-cap-the-holder-category',
    (code) =>
      !/weakest\(\[categories\[k\], \.\.\.holderStatements\]\)/.test(
        functionBody(code, 'derivedFocalCoverage'),
      ),
  ],
  [
    'unsupplied-reference-is-unknown',
    (code) =>
      !/coverage: referencesSupplied \? weakest\(values\) : 'UNKNOWN'/.test(
        functionBody(code, 'derivedFocalCoverage'),
      ),
  ],
  [
    'the-coverage-a-document-states-is-never-an-input',
    (code) => /focalCoverage|FOCAL_RECORD/.test(functionBody(code, 'derivedFocalCoverage')),
  ],
];
const violationsOf = (code: string): string[] =>
  RULES.filter(([, broken]) => broken(code)).map(([name]) => name);

describe.skipIf(!rangeAvailable)('B2.5-M1-R3: the change set over its own range', () => {
  it('is exactly the companion, the M1 unit test and this firewall', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('adds to the M1 unit test and removes nothing from it', () => {
    const { removed, added } = diffLines(UNIT_TEST);
    expect(removed).toEqual([]);
    expect(added.join('\n')).toMatch(/describe\('B2\.5-M1-R3: /);
  });

  it('removes no code from the companion - only the comment lines it rewords', () => {
    const { removed } = diffLines(COMPANION);
    expect(removed.length).toBeGreaterThan(0);
    for (const line of removed) expect(line, line).toMatch(/^ \*( |$)/);
  });

  it('keeps the M1 terminal pin and leaves the M1 firewall untouched', () => {
    expect(diffLines(M1_FIREWALL)).toEqual({ removed: [], added: [] });
    expect(sourceOf(M1_FIREWALL)).toContain(
      "const REPAIR_TERMINAL_COMMIT: string | null = '99b266e363fb801ee31e56c498a19fe40e4d6785';",
    );
  });
});

describe.skipIf(!rangeAvailable)('B2.5-M1-R3: the companion surface is unchanged', () => {
  const base = codeOf(baseSourceOf(COMPANION));
  const current = codeOf(sourceOf(COMPANION));

  it('keeps exactly its imports and exports', () => {
    expect(importsOf(current)).toEqual(importsOf(base));
    expect(exportsOf(current)).toEqual(exportsOf(base));
    expect(Object.keys(companion).sort()).toEqual(exportsOf(base).filter((n) => n in companion));
  });

  it('adds no refusal code and no fixed statement', () => {
    expect(COMPANION_REFUSAL_CODES).toContain('OBSERVATION_INCONSISTENT_WITH_MANIFEST');
    // Added CODE lines: a reworded comment may name a fixed statement.
    const added = diffLines(COMPANION)
      .added.filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l))
      .join('\n');
    expect(added).toMatch(/derivedFocalCoverage/);
    expect(added).not.toMatch(/refuse\('/);
    expect(added).not.toMatch(/\b(VALIDATION_POLICY|AUTHENTICITY|READ_PROTOCOL|PERMISSIONS)\b/);
  });
});

describe('B2.5-M1-R3: the focal-coverage rules', () => {
  const code = codeOf(sourceOf(COMPANION));

  it("restates exactly the assembler's focal-rule dependencies", () => {
    expect(arrayLiteral(sourceOf(COMPANION), 'FOCAL_RULE_DEPENDENCIES')).toEqual(
      arrayLiteral(sourceOf(ASSEMBLER), 'FOCAL_RULE_DEPENDENCIES'),
    );
    expect(arrayLiteral(sourceOf(ASSEMBLER), 'FOCAL_RULE_DEPENDENCIES')).toEqual([
      'FOCAL_SUBJECT',
      'FOCAL_IDENTITY_CLAIMS',
      'OUTGOING_RELATIONSHIP_CLAIMS',
      'SHARED_IDENTIFIER_HOLDERS',
    ]);
    expect(sourceOf(ASSEMBLER)).toContain("focalGaps.push('LOADER_GRAPH_REFERENCE_NOT_SUPPLIED')");
    expect(sourceOf(COMPANION)).toContain(
      "const REFERENCE_GAP = 'LOADER_GRAPH_REFERENCE_NOT_SUPPLIED';",
    );
  });

  it('keeps every rule on the current source', () => {
    expect(violationsOf(code)).toEqual([]);
  });

  it.each([
    [
      'builder-derives-focal-coverage',
      (c: string) => c.replace("inconsistent('validation.focal_coverage')", 'void 0'),
    ],
    [
      'builder-derives-focal-coverage',
      (c: string) => c.replace('sameList(ran.focalCoverageGaps, derived.gaps)', 'true'),
    ],
    [
      'verification-derives-focal-coverage',
      (c: string) => c.replace("inconsistencies.push('focalCoverage');", ''),
    ],
    [
      'weakest-is-the-minimum',
      (c: string) => c.replace('STRENGTH[b]! < STRENGTH[a]!', 'STRENGTH[b]! > STRENGTH[a]!'),
    ],
    [
      'holder-statements-cap-the-holder-category',
      (c: string) =>
        c.replace('weakest([categories[k], ...holderStatements])', 'weakest([categories[k]])'),
    ],
    [
      'unsupplied-reference-is-unknown',
      (c: string) =>
        c.replace("referencesSupplied ? weakest(values) : 'UNKNOWN'", 'weakest(values)'),
    ],
    [
      'the-coverage-a-document-states-is-never-an-input',
      (c: string) =>
        c.replace(
          'const gaps: string[] = [];',
          'const gaps: string[] = []; void categories.focalCoverage;',
        ),
    ],
  ] as const)('rule %s fires on a mutated copy', (rule, mutate) => {
    const mutated = mutate(code);
    expect(mutated).not.toBe(code);
    expect(violationsOf(mutated)).toContain(rule);
  });
});

/**
 * PHASE 2B-2D A3 R8 ISOLATION — `setPSd7.ts` IS A THIN COMPOSITION OF R2 AND
 * R7, AND NOTHING ELSE.
 *
 * By reading the real source of `a3prep/setPSd7.ts` and the git history, this
 * file proves:
 *
 *   - `setPSd7.ts` imports exactly `./contracts.js`, `./setP.js`, `./sd7.js`
 *     and (types only) `./types.js`; the composition path is exactly
 *     setPSd7 -> setP -> rank and setPSd7 -> sd7 -> (type) R6 graph;
 *   - it imports no rank primitive, hash, SD7 measurement module or R6 module
 *     directly, and owns no sort, hash, graph traversal, Jaccard or token logic;
 *   - it performs no IO, clock, randomness, environment or console use;
 *   - it evaluates no SD9, builds no SET_R, answers none of K1, K2 or K4, and
 *     names no page-evidence row, URL, representative or gold identity;
 *   - R8's changed surface, from R7's tip to R8's OWN code commit (the commit
 *     that added this file), is `setPSd7.ts`, R8's two tests, the R1 namespace
 *     widening and a COMMENT-ONLY edit to `setP.ts`.
 *
 * It lives in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as setPSd7 from '../harness/phase2b2d/a3prep/setPSd7.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';

/** R8's exact parent: R7's terminal commit. */
const R7_TERMINAL_COMMIT = '99f03ddec50852bb203739525773b9a9857607e4';

const THIS_FILE = 'src/test/unit/orgunitCorpus2DA3CanonicalSetPSd7Isolation.test.ts';
const R8_AUDIT_NOTE = 'docs/audits/PHASE_2B_2D_A3_CANONICAL_PREP_R8_SET_P_SD7_BINDING_V1.md';

const R8_ALLOWED_PATHS = [
  `${A3PREP_REL}/setP.ts`,
  `${A3PREP_REL}/setPSd7.ts`,
  'src/test/unit/orgunitCorpus2DA3CanonicalContractsIsolation.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalSetPSd7.test.ts',
  THIS_FILE,
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

function lines(text: string): string[] {
  return text.split('\n').filter((line) => line.length > 0);
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function codeOf(file: string): string {
  return stripComments(readFileSync(join(REPO_ROOT, A3PREP_REL, file), 'utf8'));
}

function code(): string {
  return codeOf('setPSd7.ts');
}

function specifiersOf(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) found.push(m[1] ?? '');
  for (const m of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1] ?? '');
  for (const m of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    found.push(m[1] ?? '');
  for (const m of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) found.push(m[1] ?? '');
  return found.sort();
}

function namedImportsFrom(source: string, specifier: string): string[] {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*'${escaped}'`).exec(
    source,
  );
  return (
    found?.[1]
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .sort() ?? []
  );
}

/** R8's own code commit: the commit that ADDED this file, or null before it exists. */
function r8CodeCommit(): string | null {
  const found = lines(git('log', '--diff-filter=A', '--format=%H', '--', THIS_FILE));
  return found.length === 1 ? found[0]! : null;
}

function changedByR8(): { readonly paths: readonly string[]; readonly committed: boolean } {
  const commit = r8CodeCommit();
  if (commit !== null) {
    return {
      paths: lines(git('diff', '--name-only', R7_TERMINAL_COMMIT, commit)).sort(),
      committed: true,
    };
  }
  const tracked = lines(git('diff', '--name-only', R7_TERMINAL_COMMIT));
  const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
  return { paths: [...new Set([...tracked, ...untracked])].sort(), committed: false };
}

/** A file's bytes at R8's code commit, or in the working tree before it exists. */
function atR8(path: string): string {
  const commit = r8CodeCommit();
  return commit === null
    ? readFileSync(join(REPO_ROOT, path), 'utf8')
    : git('show', `${commit}:${path}`);
}

const baseAvailable = commitExists(R7_TERMINAL_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R8: exact import graph and composition path', () => {
  it('imports exactly contracts, sd7, setP and types', () => {
    expect(specifiersOf(code())).toEqual(['./contracts.js', './sd7.js', './setP.js', './types.js']);
  });

  it('reads only the K3 procedure, the SET_P cap and the split type from contracts', () => {
    expect(namedImportsFrom(code(), './contracts.js')).toEqual([
      'K3_SD7_SURVIVOR_PROCEDURE',
      'SET_P_MAX_PAGES_PER_ORGANISATION',
      'type Split',
    ]);
  });

  it('takes rankSetPFull (and its type) from setP - never the pre-survivor cap view', () => {
    expect(namedImportsFrom(code(), './setP.js')).toEqual([
      'rankSetPFull',
      'type A3SetPRankedDocument',
    ]);
    expect(code()).not.toMatch(/selectSetPOrganisationCap/);
  });

  it('takes the walk, its residual token and its types from sd7', () => {
    expect(namedImportsFrom(code(), './sd7.js')).toEqual([
      'SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED',
      'prepareSd7SampleSurvivors',
      'type A3Sd7SampleSurvivorInput',
      'type A3Sd7SampleSurvivorPreparation',
    ]);
  });

  it('reaches types by TYPE import only', () => {
    expect(code()).toMatch(/^import type \{[^}]*\} from '\.\/types\.js';$/m);
  });

  it('the path continues setP -> rank and sd7 -> (type) R6 graph, unchanged', () => {
    expect(specifiersOf(codeOf('setP.ts'))).toEqual(['./contracts.js', './rank.js', './types.js']);
    expect(specifiersOf(codeOf('sd7.ts'))).toEqual([
      '../sd7/nearDuplicatePairs.js',
      './contracts.js',
      './types.js',
    ]);
  });

  it('imports no rank primitive, no R6 module and no SD7 measurement module directly', () => {
    const source = code();
    expect(source).not.toMatch(/\.\/rank\.js|\.\.\/sd7\//);
    expect(source).not.toMatch(/\.\/(sd9|splitScope|manifestTypes)\.js/);
    expect(source).not.toMatch(/normaliseText|tokenShingles|jaccard|nearDuplicatePairs/i);
  });
});

describe('2D-A3 R8: a thin composition - no logic of its own', () => {
  it('owns no sort', () => {
    expect(code()).not.toMatch(/\.sort\(|toSorted|localeCompare|comparePlainLexicographic/);
  });

  it('owns no hashing and no salted-key construction', () => {
    expect(code()).not.toMatch(
      /createHash|sha256Utf8Exact|prefixedDocumentRankHash|SET_P_RANK_KEY_PREFIX|digest\(/,
    );
  });

  it('owns no graph traversal', () => {
    expect(code()).not.toMatch(/\.edges\b|aIndex|bIndex|adjacen|neighbour|measurableIndices/);
    expect(code()).not.toMatch(/graph\.documents/);
  });

  it('owns no Jaccard, token, shingle, normalisation or threshold logic, and reads no text', () => {
    expect(code()).not.toMatch(
      /jaccard|similarity|shingle|token|normalis|THRESHOLD|intersection|union|mainText|textOf|\.text\b|\btext\s*[:=(]/i,
    );
  });
});

describe('2D-A3 R8: pure', () => {
  const FORBIDDEN: readonly RegExp[] = [
    /\bfetch\s*\(/,
    /node:/,
    /process\./,
    /Date\.now\s*\(|new Date\s*\(|performance\.now/,
    /Math\.random\s*\(|randomUUID|randomBytes|getRandomValues|crypto/,
    /readFile|writeFile|readdir|createReadStream|createWriteStream|mkdir/,
    /\bPool\b|\bClient\b|\bquery\s*\(/,
    /console\./,
    /anthropic|openai|apollo|classif|provider/i,
    /src\/orgunits|\/cli\/|\/db\/|migrations/,
  ];
  it('holds none of the forbidden capabilities', () => {
    const source = code();
    for (const pattern of FORBIDDEN) expect(source, String(pattern)).not.toMatch(pattern);
  });

  it('names no sealed root', () => {
    expect(code()).not.toMatch(/SEALED_ROOT_BY_SPLIT|gen1-dev-confirm|gen1-final-holdout|-sealed/);
  });
});

describe('2D-A3 R8: scope', () => {
  it('exports exactly the composition, its binding, its refusal, its status tokens and its shapes', () => {
    const exported = [
      ...code().matchAll(/export\s+(?:type|class|function|const|interface)\s+(\w+)/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual([
      'A3SetPDocumentCap',
      'A3SetPDocumentCapBlocked',
      'A3SetPDocumentCapExact',
      'A3SetPDocumentCapExactReason',
      'A3SetPMeasurableSurvivorRankedDocument',
      'A3SetPSd7CompositionRefusal',
      'A3SetPSd7CompositionRefusalCode',
      'A3SetPSd7Preparation',
      'A3SetPSd7PreparationInput',
      'SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP',
      'SET_P_DOCUMENT_CAP_EXACT',
      'SET_P_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE',
      'prepareSetPSd7',
    ]);
    const runtime = Object.entries(setPSd7)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
      .sort();
    expect(runtime).toEqual(['A3SetPSd7CompositionRefusal', 'prepareSetPSd7']);
  });

  it('walks SET_P only, and exactly once', () => {
    const source = code();
    expect(source.match(/prepareSd7SampleSurvivors\(/g)).toHaveLength(1);
    expect(source.match(/rankSetPFull\(/g)).toHaveLength(1);
    expect(source).toMatch(/sample: 'SET_P',\s*graph: input\.graph,\s*order: preSd7FullRank,/);
    expect(source).not.toMatch(/'SET_R'|SET_R_|setR|rankSetR/);
  });

  it('evaluates no SD9', () => {
    expect(code()).not.toMatch(
      /evaluateSd9|ACQUISITION_SUCCESSFUL|MIN_PAGES_NOT_MET|MIN_PAGES_PER_ORGANISATION|sd9/i,
    );
  });

  it('answers none of K1, K2 or K4', () => {
    expect(code()).not.toMatch(/\bK[124]\b|K1_|K2_|K4_|TRACK_REDUCTION|G3_FREEZE/);
  });

  it('works at document identity only: no page-evidence row, URL, representative or gold id', () => {
    expect(code()).not.toMatch(
      /pageEvidence|sourcePageEvidenceIds|\burl\b|representative|goldId|itemId|candidateScore|label/i,
    );
  });

  it('decides nothing about short text: no keep/drop/member field', () => {
    expect(code()).not.toMatch(/\b(kept|member|isMember|keepShort|dropShort|treatment)\b/i);
  });
});

// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R8: lineage and changed surface', () => {
  it('descends from R7’s terminal commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R7_TERMINAL_COMMIT, 'HEAD')).not.toThrow();
  });

  it('is setPSd7.ts, R8’s tests, the namespace widening and a comment-only setP.ts (and, uncommitted, its note)', () => {
    const { paths, committed } = changedByR8();
    const allowed = new Set(R8_ALLOWED_PATHS);
    if (!committed) allowed.add(R8_AUDIT_NOTE);
    for (const path of paths) expect(allowed, path).toContain(path);
    if (committed) expect(paths).toEqual(R8_ALLOWED_PATHS);
  });

  it('changes no contract, type, rank, SD7 walk, SD9, split, manifest, SD7 measurement, production file, migration or record', () => {
    const { paths } = changedByR8();
    const forbidden = paths.filter(
      (path) =>
        path === `${A3PREP_REL}/contracts.ts` ||
        path === `${A3PREP_REL}/types.ts` ||
        path === `${A3PREP_REL}/rank.ts` ||
        path === `${A3PREP_REL}/sd7.ts` ||
        path === `${A3PREP_REL}/sd9.ts` ||
        path === `${A3PREP_REL}/splitScope.ts` ||
        path === `${A3PREP_REL}/manifestTypes.ts` ||
        path.startsWith('src/test/harness/phase2b2d/sd7/') ||
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

  it('setP.ts changed in comments only, and now points at R8', () => {
    const path = `${A3PREP_REL}/setP.ts`;
    const before = git('show', `${R7_TERMINAL_COMMIT}:${path}`);
    const after = atR8(path);
    expect(after).not.toBe(before);
    expect(stripComments(after)).toBe(stripComments(before));
    expect(after).toMatch(/ORIGINAL R2 RANK-PREFIX PRIMITIVE, OVER THE PRE-SD7 RANK/);
    expect(after).toMatch(/R8's `prepareSetPSd7`/);
  });
});

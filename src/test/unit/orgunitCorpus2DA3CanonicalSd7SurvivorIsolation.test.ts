/**
 * PHASE 2B-2D A3 R7 ISOLATION — THE GREEDY SURVIVOR ADAPTER CONSUMES THE
 * CANONICAL R6 GRAPH AND NOTHING ELSE.
 *
 * By reading the real source of `a3prep/sd7.ts` and the git history, this
 * file proves:
 *
 *   - `sd7.ts` imports exactly `./contracts.js`, `./types.js` and - as a TYPE
 *     import only, erased at runtime - `../sd7/nearDuplicatePairs.js`;
 *   - it reproduces no SD7 measurement (no normalisation, tokenisation,
 *     shingling, Jaccard or threshold) and never reads an edge's measurement;
 *   - it performs no IO, hashing, clock, randomness, environment or console use;
 *   - it evaluates no SD9, ranks nothing, builds no SET_R, applies no cap and
 *     has no entry point that walks two samples at once;
 *   - R7's changed surface, from K3's terminal commit to R7's OWN code commit
 *     (the commit that added this file), is `sd7.ts`, R7's two tests, three
 *     historical test re-pins and COMMENT-ONLY edits to `setP.ts` and `sd9.ts`;
 *   - K1, K2 and K4 remain unanswered.
 *
 * It lives in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as sd7 from '../harness/phase2b2d/a3prep/sd7.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';
const SD7_PATH = join(REPO_ROOT, A3PREP_REL, 'sd7.ts');

/** R7's exact parent: K3's terminal commit. */
const K3_TERMINAL_COMMIT = '91850fb0eceda1d19ef959e952e1d1ce71a8010e';

const THIS_FILE = 'src/test/unit/orgunitCorpus2DA3CanonicalSd7SurvivorIsolation.test.ts';
const R7_AUDIT_NOTE = 'docs/audits/PHASE_2B_2D_A3_CANONICAL_PREP_R7_SD7_SURVIVOR_ADAPTER_V1.md';

const R7_ALLOWED_PATHS = [
  `${A3PREP_REL}/sd7.ts`,
  `${A3PREP_REL}/sd9.ts`,
  `${A3PREP_REL}/setP.ts`,
  'src/test/unit/orgunitCorpus2DA3CanonicalContractsIsolation.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalK3Binding.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalSd7GraphExportIsolation.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalSd7Survivor.test.ts',
  THIS_FILE,
].sort();

/** The two files R7 may edit in COMMENTS ONLY. */
const COMMENT_ONLY_FILES = [`${A3PREP_REL}/setP.ts`, `${A3PREP_REL}/sd9.ts`];

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

function code(): string {
  return stripComments(readFileSync(SD7_PATH, 'utf8'));
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

/** R7's own code commit: the commit that ADDED this file, or null before it exists. */
function r7CodeCommit(): string | null {
  const found = lines(git('log', '--diff-filter=A', '--format=%H', '--', THIS_FILE));
  return found.length === 1 ? found[0]! : null;
}

function changedByR7(): { readonly paths: readonly string[]; readonly committed: boolean } {
  const commit = r7CodeCommit();
  if (commit !== null) {
    return {
      paths: lines(git('diff', '--name-only', K3_TERMINAL_COMMIT, commit)).sort(),
      committed: true,
    };
  }
  const tracked = lines(git('diff', '--name-only', K3_TERMINAL_COMMIT));
  const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
  return { paths: [...new Set([...tracked, ...untracked])].sort(), committed: false };
}

/** A file's bytes at R7's code commit, or in the working tree before it exists. */
function atR7(path: string): string {
  const commit = r7CodeCommit();
  return commit === null
    ? readFileSync(join(REPO_ROOT, path), 'utf8')
    : git('show', `${commit}:${path}`);
}

const baseAvailable = commitExists(K3_TERMINAL_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R7: exact import graph', () => {
  it('imports exactly contracts, types and the R6 graph module', () => {
    expect(specifiersOf(code())).toEqual([
      '../sd7/nearDuplicatePairs.js',
      './contracts.js',
      './types.js',
    ]);
  });

  it('reaches types and the R6 graph by TYPE import only', () => {
    const source = code();
    expect(source).toMatch(/^import type \{[^}]*\} from '\.\/types\.js';$/m);
    expect(source).toMatch(
      /^import type \{ NearDuplicateGraphMeasurement \} from '\.\.\/sd7\/nearDuplicatePairs\.js';$/m,
    );
  });

  it('reads only the K3 binding and the split vocabulary from contracts', () => {
    const imported = /import\s*\{([^}]*)\}\s*from\s*'\.\/contracts\.js'/.exec(code());
    expect(
      imported?.[1]
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .sort(),
    ).toEqual([
      'K3_OWNER_DECISION',
      'K3_SD7_AT_MOST_ONE_SCOPE',
      'K3_SD7_GRAPH_SCOPE',
      'K3_SD7_SURVIVOR_PROCEDURE',
      'K3_SD7_SURVIVOR_SCOPE',
      'SPLITS',
      'type Split',
    ]);
  });

  it('does not import rank, setP, sd9, splitScope or manifestTypes', () => {
    expect(code()).not.toMatch(/\.\/(rank|setP|sd9|splitScope|manifestTypes)\.js/);
  });
});

describe('2D-A3 R7: reproduces no SD7 measurement', () => {
  it('names no normaliser, tokeniser, shingler, Jaccard or threshold', () => {
    expect(code()).not.toMatch(
      /normaliseText|normaliseForShingling|tokenShingles|tokenise|shingle|jaccard|THRESHOLD|similarity|intersectionSize|unionSize|atOrAboveThreshold/i,
    );
  });

  it('never calls the graph measurement and never reads an edge measurement', () => {
    const source = code();
    expect(source).not.toMatch(/measureNearDuplicateGraph|nearDuplicatePass|exactDuplicatePass/);
    expect(source).not.toMatch(/\.measurement\b/);
    expect(source).not.toMatch(/tokenCount|shingleCount|comparedPairCount/);
  });

  it('never reads text', () => {
    expect(code()).not.toMatch(/mainText|redactedMainText|textOf|\btext\b/i);
  });
});

describe('2D-A3 R7: pure', () => {
  const FORBIDDEN: readonly RegExp[] = [
    /\bfetch\s*\(/,
    /node:/,
    /process\./,
    /Date\.now\s*\(|new Date\s*\(|performance\.now/,
    /Math\.random\s*\(|randomUUID|randomBytes|getRandomValues|crypto|createHash/,
    /readFile|writeFile|readdir|createReadStream|createWriteStream|mkdir/,
    /\bPool\b|\bClient\b|\bquery\s*\(/,
    /console\./,
    /anthropic|openai|apollo|classif|provider/i,
    /src\/orgunits|\/cli\/|\/db\//,
  ];
  it('holds none of the forbidden capabilities', () => {
    const source = code();
    for (const pattern of FORBIDDEN) expect(source, String(pattern)).not.toMatch(pattern);
  });

  it('names no sealed root', () => {
    expect(code()).not.toMatch(/SEALED_ROOT_BY_SPLIT|gen1-dev-confirm|gen1-final-holdout|-sealed/);
  });
});

describe('2D-A3 R7: one generic walk, and nothing beyond it', () => {
  it('exports exactly the walk, its binding, its refusal and its shapes', () => {
    const exported = [
      ...code().matchAll(/export\s+(?:type|class|function|const|interface)\s+(\w+)/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual([
      'A3Sd7MeasurableExclusion',
      'A3Sd7MeasurableSurvivor',
      'A3Sd7SampleOrderEntry',
      'A3Sd7SampleSurvivorInput',
      'A3Sd7SampleSurvivorPreparation',
      'A3Sd7ShortTextUnresolvedPosition',
      'A3Sd7SurvivorRefusal',
      'A3Sd7SurvivorRefusalCode',
      'A3_SD7_SURVIVOR_ADAPTER_K3_BINDING',
      'SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED',
      'prepareSd7SampleSurvivors',
    ]);
    const runtime = Object.entries(sd7)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
      .sort();
    expect(runtime).toEqual(['A3Sd7SurvivorRefusal', 'prepareSd7SampleSurvivors']);
  });

  it('has no two-sample, SET_P-binding or SET_R-building entry point', () => {
    const source = code();
    expect(source).not.toMatch(
      /walkBothSamples|materialiseSetPAndSetR|bothSamples|sharedSurvivor/i,
    );
    expect(source).not.toMatch(/rankSetPFull|selectSetPOrganisationCap|setR\b|SET_R_|rankSetR/);
    expect(source).not.toMatch(/saltedRankSha256|candidateScore|resolvedScore|\btrack\b|gold/i);
  });

  it('evaluates no SD9 and applies no cap', () => {
    const source = code();
    expect(source).not.toMatch(
      /ACQUISITION_SUCCESSFUL|MIN_PAGES_NOT_MET|PENDING|MIN_PAGES_PER_ORGANISATION|evaluateSd9/,
    );
    expect(source).not.toMatch(/MAX_PAGES_PER_ORGANISATION|\.slice\(/);
  });

  it('never orders by graph.documents: it iterates only the caller order', () => {
    const source = code();
    expect(source).toMatch(/order\.forEach\(\(entry, sourceRankPosition\)/);
    expect(source).not.toMatch(/\.sort\(/);
  });

  it('answers none of K1, K2 or K4', () => {
    expect(code()).not.toMatch(/\bK[124]\b|K1_|K2_|K4_|TRACK_REDUCTION|G3_FREEZE/);
  });
});

// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R7: lineage and changed surface', () => {
  it('descends from K3’s terminal commit', () => {
    expect(() => git('merge-base', '--is-ancestor', K3_TERMINAL_COMMIT, 'HEAD')).not.toThrow();
  });

  it('is sd7.ts, R7’s tests, three historical re-pins and two comment-only edits (and, uncommitted, its note)', () => {
    const { paths, committed } = changedByR7();
    const allowed = new Set(R7_ALLOWED_PATHS);
    if (!committed) allowed.add(R7_AUDIT_NOTE);
    for (const path of paths) expect(allowed, path).toContain(path);
    if (committed) expect(paths).toEqual(R7_ALLOWED_PATHS);
  });

  it('changes no contract, type, rank, split, manifest, SD7 measurement, production file, migration or record', () => {
    const { paths } = changedByR7();
    const forbidden = paths.filter(
      (path) =>
        path === `${A3PREP_REL}/contracts.ts` ||
        path === `${A3PREP_REL}/types.ts` ||
        path === `${A3PREP_REL}/rank.ts` ||
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

  it('setP.ts and sd9.ts changed in comments only', () => {
    for (const path of COMMENT_ONLY_FILES) {
      const before = git('show', `${K3_TERMINAL_COMMIT}:${path}`);
      const after = atR7(path);
      expect(after, path).not.toBe(before);
      expect(stripComments(after), path).toBe(stripComments(before));
    }
  });

  it('the stale K3 wording is gone and the resolved wording is present', () => {
    const setP = atR7(`${A3PREP_REL}/setP.ts`);
    const sd9 = atR7(`${A3PREP_REL}/sd9.ts`);
    expect(setP).not.toMatch(/is K3, and nothing here chooses/);
    expect(setP).toMatch(/K3 is resolved to SAMPLE-SPECIFIC GREEDY survivors/);
    expect(setP).toMatch(/R8\s+\*?\s*will compose this full SET_P rank/);
    expect(sd9).not.toMatch(/K3 stays open/);
    expect(sd9).toMatch(/K3 is resolved/);
    expect(sd9).toMatch(/SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP/);
  });
});

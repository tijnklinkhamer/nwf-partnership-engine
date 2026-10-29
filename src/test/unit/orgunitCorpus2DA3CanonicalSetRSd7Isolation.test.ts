/**
 * PHASE 2B-2D A3 R12 ISOLATION — `setRSd7.ts` IS A THIN COMPOSITION OF R11 AND
 * R7, AND NOTHING ELSE.
 *
 * By reading the real source of `a3prep/setRSd7.ts` and the git history, this
 * file proves:
 *
 *   - `setRSd7.ts` imports exactly `./contracts.js`, `./setR.js`, `./sd7.js`
 *     and (types only) `./types.js`; the composition path is exactly
 *     setRSd7 -> setR -> (setRScore, rank) and setRSd7 -> sd7 -> (type) R6 graph;
 *   - it imports no R10 score module, no rank primitive, no hash, no SD7
 *     measurement module and no R6 module directly, and owns no sort, hash,
 *     score comparison, K1/K2 reduction, graph traversal or token logic;
 *   - it reads no R10 score provenance (`resolvedScoreDecimal`,
 *     `sourcePageEvidenceIds`, `sourceRowScores`, `trackScores`);
 *   - it applies no SET_R cap, reports no readiness, evaluates no SD9, answers
 *     no K4, and never composes with SET_P;
 *   - it performs no IO, clock, randomness, environment or console use;
 *   - R12's changed surface, from R11's tip to R12's OWN code commit (the
 *     commit that added this file), is `setRSd7.ts`, R12's two tests and the
 *     two exact-name widenings (namespace, K1/K2 export guard).
 *
 * It lives in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as setRSd7 from '../harness/phase2b2d/a3prep/setRSd7.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';

/** R12's exact parent: R11's terminal commit. */
const R11_TERMINAL_COMMIT = '8ccdda8d818b99a46f07f6c5088fc54ee2cb6ba3';

const THIS_FILE = 'src/test/unit/orgunitCorpus2DA3CanonicalSetRSd7Isolation.test.ts';
const R12_AUDIT_NOTE = 'docs/audits/PHASE_2B_2D_A3_CANONICAL_PREP_R12_SET_R_SD7_BINDING_V1.md';

const R12_ALLOWED_PATHS = [
  `${A3PREP_REL}/setRSd7.ts`,
  'src/test/unit/orgunitCorpus2DA3CanonicalContractsIsolation.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalK1K2Binding.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalSetRSd7.test.ts',
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
  return codeOf('setRSd7.ts');
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

/** R12's own code commit: the commit that ADDED this file, or null before it exists. */
function r12CodeCommit(): string | null {
  const found = lines(git('log', '--diff-filter=A', '--format=%H', '--', THIS_FILE));
  return found.length === 1 ? found[0]! : null;
}

function changedByR12(): { readonly paths: readonly string[]; readonly committed: boolean } {
  const commit = r12CodeCommit();
  if (commit !== null) {
    return {
      paths: lines(git('diff', '--name-only', R11_TERMINAL_COMMIT, commit)).sort(),
      committed: true,
    };
  }
  const tracked = lines(git('diff', '--name-only', R11_TERMINAL_COMMIT));
  const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
  return { paths: [...new Set([...tracked, ...untracked])].sort(), committed: false };
}

const baseAvailable = commitExists(R11_TERMINAL_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R12: exact import graph and composition path', () => {
  it('imports exactly contracts, sd7, setR and types', () => {
    expect(specifiersOf(code())).toEqual(['./contracts.js', './sd7.js', './setR.js', './types.js']);
  });

  it('reads only the K3 procedure and the split type from contracts', () => {
    expect(namedImportsFrom(code(), './contracts.js')).toEqual([
      'K3_SD7_SURVIVOR_PROCEDURE',
      'type Split',
    ]);
  });

  it('takes rankSetRFull (and its types) from setR, and nothing else', () => {
    expect(namedImportsFrom(code(), './setR.js')).toEqual([
      'rankSetRFull',
      'type A3SetRRankInput',
      'type A3SetRRankedDocument',
    ]);
  });

  it('takes the walk and its types from sd7', () => {
    expect(namedImportsFrom(code(), './sd7.js')).toEqual([
      'prepareSd7SampleSurvivors',
      'type A3Sd7SampleSurvivorInput',
      'type A3Sd7SampleSurvivorPreparation',
    ]);
  });

  it('reaches types by TYPE import only', () => {
    expect(code()).toMatch(/^import type \{[^}]*\} from '\.\/types\.js';$/m);
  });

  it('the path continues setR -> (rank, setRScore) and sd7 -> (type) R6 graph, unchanged', () => {
    expect(specifiersOf(codeOf('setR.ts'))).toEqual([
      './contracts.js',
      './rank.js',
      './setRScore.js',
      './types.js',
    ]);
    expect(specifiersOf(codeOf('sd7.ts'))).toEqual([
      '../sd7/nearDuplicatePairs.js',
      './contracts.js',
      './types.js',
    ]);
  });

  it('imports no R10 module, rank primitive, R6 module or SD7 measurement module directly', () => {
    const source = code();
    expect(source).not.toMatch(/\.\/setRScore\.js|\.\/rank\.js|\.\.\/sd7\//);
    expect(source).not.toMatch(/normaliseText|tokenShingles|jaccard|nearDuplicatePairs/i);
  });

  it('imports no SET_P module, SD9, split scope, manifest or freeze preflight', () => {
    expect(code()).not.toMatch(
      /\.\/(setP|setPSd7|sd9|splitScope|manifestTypes|corpusFreezePreflight)\.js/,
    );
    expect(code()).not.toMatch(/prepareSetPSd7|rankSetPFull|'SET_P'|SET_P_/);
  });
});

describe('2D-A3 R12: a thin composition - no logic of its own', () => {
  it('owns no sort and no search', () => {
    expect(code()).not.toMatch(
      /\.sort\(|toSorted|localeCompare|comparePlainLexicographic|\.find\(|\.findIndex\(|\.indexOf\(/,
    );
  });

  it('owns no hashing and no salted-key construction', () => {
    expect(code()).not.toMatch(
      /createHash|sha256Utf8Exact|prefixedDocumentRankHash|SET_R_TIE_BREAK_KEY_PREFIX|digest\(/,
    );
  });

  it('owns no score comparison and no K1/K2 reduction', () => {
    expect(code()).not.toMatch(
      /compareNumeric84Decimal|canonicaliseNumeric84Decimal|prepareSetRDocumentScore|Math\.max|reduce\(|maxTrack|K1_|K2_|TRACK_REDUCTION/,
    );
  });

  it('reads no R10 score provenance', () => {
    expect(code()).not.toMatch(
      /resolvedScoreDecimal|resolvedScore|sourcePageEvidenceIds|sourceRowScores|trackScores|scorePreparation|candidateScore/,
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

describe('2D-A3 R12: no cap, no readiness, no SD9, no K4', () => {
  it('names no SET_R cap constant and slices nothing', () => {
    expect(code()).not.toMatch(/SET_R_MAX_PAGES_PER_ORGANISATION|MAX_PAGES|\.slice\(|\.splice\(/);
  });

  it('declares no cap, selection or readiness shape', () => {
    expect(code()).not.toMatch(
      /documentCap|cappedDocuments|selectedDocuments|DOCUMENT_CAP|\b[Cc]ap\b|[Rr]eadiness|[Rr]eady|FREEZE_|[Ff]rozen|[Ee]xtension/,
    );
  });

  it('evaluates no SD9', () => {
    expect(code()).not.toMatch(
      /evaluateSd9|ACQUISITION_SUCCESSFUL|MIN_PAGES_NOT_MET|MIN_PAGES_PER_ORGANISATION|sd9/i,
    );
  });

  it('answers no K1, K2 or K4', () => {
    expect(code()).not.toMatch(/\bK[124]\b|K1_|K2_|K4_|G3_FREEZE/);
  });

  it('decides nothing about short text: no keep/drop/member field, no membership token', () => {
    expect(code()).not.toMatch(/\b(kept|member|isMember|keepShort|dropShort|treatment)\b/i);
    expect(code()).not.toMatch(/SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED|openIssue/);
  });

  it('works at document identity only: no page-evidence row, URL, representative or gold id', () => {
    expect(code()).not.toMatch(/pageEvidence|\burl\b|representative|goldId|itemId|label/i);
  });
});

describe('2D-A3 R12: pure', () => {
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

describe('2D-A3 R12: scope', () => {
  it('exports exactly the composition, its binding, its refusal, its kind and its shapes', () => {
    const exported = [
      ...code().matchAll(/export\s+(?:type|class|function|const|interface)\s+(\w+)/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual([
      'A3SetRMeasurableSurvivorRankedDocument',
      'A3SetRSd7CompositionRefusal',
      'A3SetRSd7CompositionRefusalCode',
      'A3SetRSd7Preparation',
      'A3SetRSd7PreparationInput',
      'A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS',
      'SET_R_SD7_COMPOSITION_REQUIRES_PROCEDURE',
      'prepareSetRSd7',
    ]);
    const runtime = Object.entries(setRSd7)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
      .sort();
    expect(runtime).toEqual(['A3SetRSd7CompositionRefusal', 'prepareSetRSd7']);
  });

  it('ranks once, walks SET_R once, in that order, with R11’s rank as the order', () => {
    const source = code();
    expect(source.match(/rankSetRFull\(/g)).toHaveLength(1);
    expect(source.match(/prepareSd7SampleSurvivors\(/g)).toHaveLength(1);
    expect(source).toMatch(
      /const preSd7FullRank = rankSetRFull\(input\.rankInputs\);\s*const sd7Preparation = prepareSd7SampleSurvivors\(\{\s*sample: 'SET_R',\s*graph: input\.graph,\s*order: preSd7FullRank,\s*\}\);/,
    );
  });

  it('accepts no caller-supplied rank: the input is rank inputs and a graph only', () => {
    expect(code()).toMatch(
      /export interface A3SetRSd7PreparationInput \{\s*readonly rankInputs: readonly A3SetRRankInput\[\];\s*readonly graph: A3Sd7SampleSurvivorInput\['graph'\];\s*\}/,
    );
  });

  it('joins survivors by their known sourceRankPosition, never by value', () => {
    const source = code();
    expect(source).toMatch(/preSd7FullRank\[sourceRankPosition\]/);
    expect(source).toMatch(/saltedRankSha256: ranked\.saltedRankSha256/);
  });

  it('the survivor-aware shape exposes no bare rankPosition', () => {
    const shape = /export interface A3SetRMeasurableSurvivorRankedDocument \{([\s\S]*?)\n\}/.exec(
      code(),
    )?.[1];
    expect(shape).toBeDefined();
    expect(shape).not.toMatch(/\breadonly rankPosition\b/);
    expect(shape).toMatch(/readonly sourceRankPosition: number;/);
    expect(shape).toMatch(/readonly survivorRankPosition: number;/);
  });
});

// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R12: lineage and changed surface', () => {
  it('descends from R11’s terminal commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R11_TERMINAL_COMMIT, 'HEAD')).not.toThrow();
  });

  it('is setRSd7.ts, R12’s tests and the two exact-name widenings (and, uncommitted, its note)', () => {
    const { paths, committed } = changedByR12();
    const allowed = new Set(R12_ALLOWED_PATHS);
    if (!committed) allowed.add(R12_AUDIT_NOTE);
    for (const path of paths) expect(allowed, path).toContain(path);
    if (committed) expect(paths).toEqual(R12_ALLOWED_PATHS);
  });

  it('changes no contract, type, rank, score, SET_R rank, SD7 walk, SET_P, SD9, split, manifest, preflight, production file, migration or record', () => {
    const { paths } = changedByR12();
    const unchanged = [
      'contracts.ts',
      'types.ts',
      'rank.ts',
      'setP.ts',
      'setPSd7.ts',
      'setRScore.ts',
      'setR.ts',
      'sd7.ts',
      'sd9.ts',
      'splitScope.ts',
      'manifestTypes.ts',
      'corpusFreezePreflight.ts',
    ].map((f) => `${A3PREP_REL}/${f}`);
    const forbidden = paths.filter(
      (path) =>
        unchanged.includes(path) ||
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

  it('the two widened tests changed by adding R12 by exact name only', () => {
    const commit = r12CodeCommit();
    const at = (path: string): string =>
      commit === null
        ? readFileSync(join(REPO_ROOT, path), 'utf8')
        : git('show', `${commit}:${path}`);
    const contractsIsolation = 'src/test/unit/orgunitCorpus2DA3CanonicalContractsIsolation.test.ts';
    const k1k2 = 'src/test/unit/orgunitCorpus2DA3CanonicalK1K2Binding.test.ts';
    const removed = (path: string): string[] =>
      git('diff', R11_TERMINAL_COMMIT, ...(commit === null ? [] : [commit]), '--', path)
        .split('\n')
        .filter((l) => l.startsWith('-') && !l.startsWith('---'));

    expect(at(contractsIsolation)).toMatch(/const R12_FILES = \['setRSd7\.ts'\];/);
    expect(at(contractsIsolation)).toMatch(
      /const LATER_SLICE_FILES = \['organisationCaps\.ts', 'syntheticFixtures\.ts'\];/,
    );
    for (const line of removed(contractsIsolation)) {
      expect(line).toMatch(/R11|setR\.ts|\]\.sort\(\);|R1, R2/);
    }

    expect(at(k1k2)).toMatch(/R12_AUTHORISED_SET_R_SD7_COMPOSITION_FILE = 'setRSd7\.ts'/);
    for (const line of removed(k1k2)) {
      expect(line).toMatch(/R11|R10|setR/);
    }
  });
});

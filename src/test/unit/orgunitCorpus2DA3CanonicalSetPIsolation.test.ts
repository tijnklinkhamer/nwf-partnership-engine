/**
 * PHASE 2B-2D A3 R2 ISOLATION — SET_P RANKING IS PURE, SMALL AND CLASS-BLIND.
 *
 * By reading the real source of `a3prep/rank.ts` and `a3prep/setP.ts`, this
 * file proves:
 *
 *   - `rank.ts` imports `node:crypto` and nothing else;
 *   - `setP.ts` imports only `contracts.ts`, `rank.ts` and `types.ts`;
 *   - neither reaches src/orgunits/web or /orchestrator, the database, the
 *     CLI, migrations, the classifier/provider runtime or A2 machinery;
 *   - neither performs IO, reads the environment, or uses a clock or randomness;
 *   - neither names a class, gold, classifier, candidate-track or score field;
 *   - neither performs SD7, SD9 or SET_R work, or claims to materialise a
 *     final Generation-1 SET_P.
 *
 * It sits in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d/a3prep');
const R2_FILES = ['rank.ts', 'setP.ts'] as const;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function code(file: string): string {
  return stripComments(readFileSync(join(A3PREP_DIR, file), 'utf8'));
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

describe('2D-A3 R2: exact import graph', () => {
  it('rank.ts imports node:crypto and nothing else', () => {
    expect(specifiersOf(code('rank.ts'))).toEqual(['node:crypto']);
  });

  it('setP.ts imports only contracts, rank and types', () => {
    expect(specifiersOf(code('setP.ts'))).toEqual(['./contracts.js', './rank.js', './types.js']);
  });

  it('neither file names a forbidden module path', () => {
    const FORBIDDEN_PATHS = [
      'orgunits/web',
      'orgunits/orchestrator',
      'src/db',
      '/db/',
      '/cli/',
      'migrations',
      'phase2b2d2c',
      'classif',
      'provider',
      'continuationWindow',
      'acquisitionGate',
      'transition',
      '/sd7/',
      'corpus-prep',
    ];
    for (const file of R2_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        for (const forbidden of FORBIDDEN_PATHS) {
          expect(specifier.includes(forbidden), `${file} -> ${specifier}`).toBe(false);
        }
      }
    }
  });
});

describe('2D-A3 R2: no IO, environment, clock or randomness', () => {
  const FORBIDDEN: readonly RegExp[] = [
    /\bfetch\s*\(/,
    /node:(fs|net|http|https|dns|tls|child_process|os|worker_threads)/,
    /process\.env|process\.argv/,
    /Date\.now\s*\(|new Date\s*\(|performance\.now/,
    /Math\.random\s*\(|randomUUID|randomBytes|getRandomValues/,
    /readFile|writeFile|readdir|createReadStream|createWriteStream|mkdir/,
    /\bPool\b|\bClient\b|\bquery\s*\(/,
    /console\./,
    /anthropic|openai|apollo/i,
  ];
  for (const file of R2_FILES) {
    it(`${file} holds none of them`, () => {
      const source = code(file);
      for (const pattern of FORBIDDEN) expect(source, `${file} ${pattern}`).not.toMatch(pattern);
    });
  }
});

describe('2D-A3 R2: class-blind and scope-bounded', () => {
  for (const file of R2_FILES) {
    it(`${file} refers to no class, gold, classifier, track or score field`, () => {
      expect(code(file)).not.toMatch(
        /unitType|predictedClass|goldLabel|\bgold\b|hardNegative|needsReview|classifierOutput|\btrack\b|candidateScore|INTERNATIONAL_OFFICE|LANGUAGE_CENTRE|typeHint|type_hint/i,
      );
    });

    it(`${file} performs no SD7, SD9 or SET_R work and names no sealed root`, () => {
      const source = code(file);
      expect(source).not.toMatch(/jaccard|shingle|nearDuplicate|MIN_PAGES_PER_ORGANISATION/i);
      expect(source).not.toMatch(/SET_R_|setR/);
      expect(source).not.toMatch(
        /SEALED_ROOT_BY_SPLIT|gen1-dev-confirm|gen1-final-holdout|-sealed/,
      );
      expect(source).not.toMatch(/materialise|Generation1|generation1|finalSetP/i);
    });

    it(`${file} carries no content-shaped field`, () => {
      expect(code(file)).not.toMatch(
        /\b(url|hostname|host|title|mainText|redactedMainText|organisationName)\b/,
      );
    });
  }

  it('setP.ts reads only the SET_P prefix and cap from contracts', () => {
    const imported = /import\s*\{([^}]*)\}\s*from\s*'\.\/contracts\.js'/.exec(code('setP.ts'));
    expect(
      imported?.[1]
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .sort(),
    ).toEqual(['SET_P_MAX_PAGES_PER_ORGANISATION', 'SET_P_RANK_KEY_PREFIX']);
  });

  it('rank.ts never inserts a separator between prefix and document identity', () => {
    const source = code('rank.ts');
    expect(source).toMatch(/sha256Utf8Exact\(keyPrefix \+ documentSha256\)/);
    expect(source).not.toMatch(/\$\{keyPrefix\}:|keyPrefix \+ ['"]:['"]/);
  });
});

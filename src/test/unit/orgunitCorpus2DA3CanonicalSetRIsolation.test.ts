/**
 * PHASE 2B-2D A3 R11 ISOLATION — THE SET_R TOTAL RANK IS PURE, REUSES R2 AND
 * R10, AND STOPS AT A FULL UNCAPPED ORDER.
 *
 * By reading the real source of `a3prep/setR.ts`, this file proves:
 *
 *   - it imports exactly `./contracts.js`, `./rank.js`, `./setRScore.js` and,
 *     TYPE-only, `./types.js` - no direct crypto, no SET_P/SD7/SD9/split/
 *     manifest/preflight module, no production scorer, database, filesystem,
 *     network, CLI or provider;
 *   - it builds its tie-break with R2's `prefixedDocumentRankHash` and the
 *     whole frozen prefix, and compares scores only through R10's
 *     `compareNumeric84Decimal` - it holds no decimal parser of its own;
 *   - it re-reduces nothing: no track score, per-row score or MAX;
 *   - it applies no cap and composes with no survivor, short-text, SD9 or K4
 *     machinery;
 *   - it names no representative/winner and no root-local rank.
 *
 * It sits in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d/a3prep');
const SET_R = join(A3PREP_DIR, 'setR.ts');

function raw(): string {
  return readFileSync(SET_R, 'utf8');
}

function code(): string {
  return raw()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
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
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const m = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*'${escaped}'`).exec(source);
  return (m?.[1] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

describe('2D-A3 R11: exact import graph', () => {
  it('imports ./contracts.js, ./rank.js, ./setRScore.js and ./types.js and nothing else', () => {
    expect(specifiersOf(code())).toEqual([
      './contracts.js',
      './rank.js',
      './setRScore.js',
      './types.js',
    ]);
  });

  it('reads exactly the K1/K2 bindings and the frozen tie-break prefix from contracts', () => {
    expect(namedImportsFrom(code(), './contracts.js')).toEqual([
      'K1_OWNER_DECISION',
      'K2_OWNER_DECISION',
      'SET_R_TIE_BREAK_KEY_PREFIX',
    ]);
  });

  it('reuses exactly the canonical R2 rank primitives', () => {
    expect(namedImportsFrom(code(), './rank.js')).toEqual([
      'assertLowerHexDocumentSha256s',
      'assertSingleSlotAndSplit',
      'assertUniqueDocumentSha256s',
      'assertUniqueRankDigests',
      'comparePlainLexicographic',
      'prefixedDocumentRankHash',
    ]);
  });

  it('reads from R10 only the preparation kind/type, its refusal class, and its decimal helpers', () => {
    expect(namedImportsFrom(code(), './setRScore.js')).toEqual([
      'A3SetRScoreRefusal',
      'A3_SET_R_DOCUMENT_SCORE_PREPARATION_KIND',
      'canonicaliseNumeric84Decimal',
      'compareNumeric84Decimal',
      'type A3SetRDocumentScorePreparation',
    ]);
    expect(code()).not.toMatch(/prepareSetRDocumentScore/);
  });

  it('imports types.ts by a type-only import', () => {
    expect(code()).toMatch(/^import type \{[^}]*\} from '\.\/types\.js';$/m);
  });

  it('reaches no crypto, SET_P, SD7, SD9, split, manifest or preflight module', () => {
    const source = code();
    expect(source).not.toMatch(/node:crypto|createHash|\bcrypto\b|sha256Utf8Exact/);
    expect(source).not.toMatch(
      /\.\/setP\.js|\.\/setPSd7\.js|\.\/sd7\.js|\.\/sd9\.js|\.\/splitScope\.js|\.\/manifestTypes\.js|\.\/corpusFreezePreflight\.js|\.\.\/sd7\//,
    );
  });

  it('never imports the production signal scorer, orgunits, db, CLI or a provider', () => {
    const source = code();
    expect(source).not.toMatch(
      /scoreFetchedPageCandidate|scoreFrontierUrl|ORGUNIT_SIGNAL_RULE_VERSION/,
    );
    expect(source).not.toMatch(/orgunits\/|signals\/|packs\/|\/db\/|\/cli\/|phase2b2d2c/);
    expect(source).not.toMatch(/anthropic|openai|apollo|classif|provider/i);
  });
});

describe('2D-A3 R11: no IO, environment, clock or randomness', () => {
  it('holds none of them', () => {
    const FORBIDDEN: readonly RegExp[] = [
      /\bfetch\s*\(/,
      /node:/,
      /process\./,
      /Date\.now\s*\(|new Date\s*\(|performance\.now/,
      /Math\.random\s*\(|randomUUID|randomBytes|getRandomValues/,
      /readFile|writeFile|readdir|createReadStream|createWriteStream|mkdir/,
      /\bPool\b|\bClient\b|\bquery\s*\(|\bSELECT\b|orgunit_page_candidates|orgunit_page_evidence|orgunit_fetch_observations/,
      /console\./,
    ];
    const source = code();
    for (const pattern of FORBIDDEN) expect(source, String(pattern)).not.toMatch(pattern);
  });
});

describe('2D-A3 R11: the frozen order, implemented by reuse', () => {
  it('builds the tie-break from the whole frozen prefix with nothing inserted', () => {
    const source = code();
    expect(source).toMatch(
      /prefixedDocumentRankHash\(SET_R_TIE_BREAK_KEY_PREFIX, document\.documentSha256\)/,
    );
    expect(source).not.toMatch(/SET_R_V2_R2/);
    expect(source).not.toMatch(/SET_R_TIE_BREAK_KEY_PREFIX\s*\+/);
  });

  it('compares scores only through compareNumeric84Decimal, descending, then the digest ascending', () => {
    const source = code();
    expect(source).toMatch(
      /compareNumeric84Decimal\(b\.resolvedScoreDecimal, a\.resolvedScoreDecimal\)\s*\|\|\s*comparePlainLexicographic\(a\.saltedRankSha256, b\.saltedRankSha256\)/,
    );
    // Exactly one sort, exactly one comparator of two keys.
    expect(source.match(/\.sort\s*\(/g)).toHaveLength(1);
    expect(source.match(/comparePlainLexicographic\(/g)).toHaveLength(1);
    expect(source.match(/compareNumeric84Decimal\(/g)).toHaveLength(1);
  });

  it('holds no decimal parser and never reads a score through a JS number', () => {
    const source = code();
    expect(source).not.toMatch(/\bNumber\s*\(|parseFloat|parseInt|Number\.EPSILON|toFixed|Math\./);
    expect(source).not.toMatch(/BigInt|\d+n\b|\[0-9\]|\\d/);
    expect(source).not.toMatch(/localeCompare|Intl\./);
  });

  it('breaks no tie by input position, URL, page id, track, root or run', () => {
    const source = code();
    expect(source).not.toMatch(
      /indexOf|findIndex|\bpageId\b|\bur[li]\b|\btrack\b|\broot\b|\brunId\b/i,
    );
  });
});

describe('2D-A3 R11: re-reduces nothing', () => {
  it('reads no track score, per-row score or candidate observation, and computes no MAX', () => {
    const source = code();
    expect(source).not.toMatch(
      /trackScores|candidateScoreDecimal|pageSetRScoreDecimal|candidateObservations/,
    );
    expect(source).not.toMatch(/\bmax\w*\s*\(|Math\.max|reduce\s*\(|maxUnits/i);
    expect(source).not.toMatch(/INTERNATIONAL_OFFICE|LANGUAGE_CENTRE|SET_R_REQUIRED_TRACKS/);
  });
});

describe('2D-A3 R11: hard boundaries', () => {
  it('applies no cap: the SET_R cap constant is neither imported nor named, and nothing is sliced', () => {
    expect(raw()).not.toMatch(/SET_R_MAX_PAGES_PER_ORGANISATION|SET_P_MAX_PAGES_PER_ORGANISATION/);
    expect(code()).not.toMatch(/\.slice\s*\(|\.splice\s*\(|selectSetROrganisationCap|\blength\s*=/);
  });

  it('composes with no survivor, SD7, short-text or SD9 machinery and decides no K4', () => {
    const source = code();
    expect(source).not.toMatch(
      /prepareSd7SampleSurvivors|measureNearDuplicateGraph|survivor|shingle|jaccard|nearDuplicate/i,
    );
    expect(source).not.toMatch(
      /SHORT_TEXT|shortText|evaluateSd9|MIN_PAGES|K4|K3_|corpusFreeze|freezeReadiness/,
    );
  });

  it('names no representative, winner or root-local rank anywhere in the file', () => {
    expect(raw()).not.toMatch(
      /representative|winnerPage|winningPage|winningTrack|winningSourceRow|winner|canonicalPage|selectedSourceRow/i,
    );
    expect(raw()).not.toMatch(/rank_within_root|rankWithinRoot/i);
  });

  it('exposes no content, host, label or model-output field', () => {
    expect(code()).not.toMatch(
      /\burl\b|hostname|\btitle\b|heading|mainText|redactedMainText|institution|rootUrl|\blabel\b|gold|unitType|modelOutput/i,
    );
  });

  it('copies no owner-record hash literal: both are read from the contract binding', () => {
    expect(raw()).not.toMatch(/[0-9a-f]{64}/);
  });

  it('names no sealed root and no home directory', () => {
    expect(raw()).not.toMatch(/SEALED_ROOT_BY_SPLIT|gen1-dev-confirm|gen1-final-holdout|-sealed/);
    expect(raw()).not.toMatch(/homedir|Developer\//);
  });
});

describe('2D-A3 R11: ranked output is identity and position only', () => {
  it('the output entry is built from exactly the six R1 ranked-document fields', () => {
    const source = code();
    const built = /Object\.freeze\(\{\s*sample: 'SET_R' as const,([\s\S]*?)\}\)/.exec(source);
    expect(built).not.toBeNull();
    const fields = (built?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().split(':')[0]?.trim())
      .filter(Boolean)
      .sort();
    expect(fields).toEqual(
      ['documentSha256', 'rankPosition', 'saltedRankSha256', 'selectionIndex', 'split'].sort(),
    );
  });

  it('the ranked type is R1 A3RankedDocument pinned to SET_R', () => {
    expect(code()).toMatch(
      /export type A3SetRRankedDocument = A3RankedDocument & \{ readonly sample: 'SET_R' \};/,
    );
  });
});

describe('2D-A3 R11: exports exactly the R11 API', () => {
  it('exports only the rank function, its input/output types and its refusal', () => {
    const exported = [
      ...code().matchAll(/export\s+(?:type|class|function|const|interface)\s+(\w+)/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual(
      [
        'A3SetRRankInput',
        'A3SetRRankRefusal',
        'A3SetRRankRefusalCode',
        'A3SetRRankRefusalLocation',
        'A3SetRRankedDocument',
        'rankSetRFull',
      ].sort(),
    );
  });
});

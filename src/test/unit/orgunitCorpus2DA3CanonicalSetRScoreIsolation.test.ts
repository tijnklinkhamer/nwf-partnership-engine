/**
 * PHASE 2B-2D A3 R10 ISOLATION — THE SET_R SCORE REDUCER IS PURE AND STOPS AT
 * ONE SCORE PER DOCUMENT.
 *
 * By reading the real source of `a3prep/setRScore.ts`, this file proves:
 *
 *   - it imports exactly `./contracts.js` (the K1/K2 bindings, the required
 *     tracks and the bound rule version) and, TYPE-only, `./types.js` - no
 *     crypto, no rank/setP/setPSd7/sd7/sd9 module, no production signal
 *     scorer, no database, filesystem, network, CLI or provider;
 *   - it performs no IO, reads no environment, uses no clock or randomness,
 *     and uses no binary floating point to read a score;
 *   - it ranks nothing: no SET_R tie-break prefix, no salted hash, no sort, no
 *     rank position, no cap, no survivor composition, no short-text handling;
 *   - it names no representative, winner or `rank_within_root`, and exposes
 *     no URL, title, text, host or label field.
 *
 * It sits in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d/a3prep');
const SET_R_SCORE = join(A3PREP_DIR, 'setRScore.ts');

function raw(): string {
  return readFileSync(SET_R_SCORE, 'utf8');
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

describe('2D-A3 R10: exact import graph', () => {
  it('imports ./contracts.js and ./types.js and nothing else', () => {
    expect(specifiersOf(code())).toEqual(['./contracts.js', './types.js']);
  });

  it('reads exactly the K1/K2 bindings, the required tracks and the bound rule version', () => {
    expect(namedImportsFrom(code(), './contracts.js')).toEqual([
      'K1_OWNER_DECISION',
      'K2_OWNER_DECISION',
      'SET_R_BOUND_SIGNAL_RULE_VERSION',
      'SET_R_REQUIRED_TRACKS',
    ]);
  });

  it('imports types.ts by a type-only import', () => {
    expect(code()).toMatch(/^import type \{[^}]*\} from '\.\/types\.js';$/m);
  });

  it('reaches no crypto, rank, SET_P, SD7, SD9, split, manifest or preflight module', () => {
    const source = code();
    expect(source).not.toMatch(/node:crypto|createHash|\bcrypto\b/);
    expect(source).not.toMatch(
      /\.\/rank\.js|\.\/setP\.js|\.\/setPSd7\.js|\.\/sd7\.js|\.\/sd9\.js|\.\/splitScope\.js|\.\/manifestTypes\.js|\.\/corpusFreezePreflight\.js|\.\.\/sd7\//,
    );
  });

  it('never imports the production signal scorer, signal packs, orgunits, db, CLI or a provider', () => {
    const source = code();
    expect(source).not.toMatch(
      /scoreFetchedPageCandidate|scoreFrontierUrl|ORGUNIT_SIGNAL_RULE_VERSION/,
    );
    expect(source).not.toMatch(/orgunits\/|signals\/|packs\/|\/db\/|\/cli\/|phase2b2d2c/);
    expect(source).not.toMatch(/anthropic|openai|apollo|classif|provider/i);
  });
});

describe('2D-A3 R10: no IO, environment, clock, randomness or binary float', () => {
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

  it('never reads a score through a JS number', () => {
    const source = code();
    expect(source).not.toMatch(/\bNumber\s*\(|parseFloat|parseInt|Number\.EPSILON|toFixed|Math\./);
    expect(source).not.toMatch(/\bepsilon\b/i);
  });
});

describe('2D-A3 R10: stops at one score per document', () => {
  it('ranks, hashes, sorts and caps nothing', () => {
    const source = code();
    expect(source).not.toMatch(/SET_R_V2_R2|SET_R_TIE_BREAK|SET_R_MAX_PAGES|SET_R_PRIMARY_ORDER/);
    expect(source).not.toMatch(/saltedRank|rankPosition|tieBreak|\.sort\s*\(|localeCompare/i);
    expect(source).not.toMatch(/SET_P|setP|organisationCap|GATE_SHARE|\bcap\b/i);
  });

  it('composes with no survivor, SD7, short-text or SD9 machinery and decides no K4', () => {
    const source = code();
    expect(source).not.toMatch(
      /prepareSd7SampleSurvivors|measureNearDuplicateGraph|survivor|shingle|jaccard|nearDuplicate/i,
    );
    expect(source).not.toMatch(/SHORT_TEXT|shortText|evaluateSd9|MIN_PAGES|K4|K3_/);
  });

  it('names no representative, winner or rank_within_root', () => {
    const source = code();
    expect(source).not.toMatch(
      /representative|winnerPage|winningPage|winningTrack|winner|canonicalPage|selectedSourceRow/i,
    );
    expect(source).not.toMatch(/rank_within_root|rankWithinRoot/i);
  });

  it('exposes no content, host, label or model-output field', () => {
    expect(code()).not.toMatch(
      /\burl\b|hostname|\btitle\b|heading|mainText|redactedMainText|institution|rootUrl|\blabel\b|gold|unitType|modelOutput/i,
    );
  });

  it('exports exactly the R10 API', () => {
    const exported = [
      ...code().matchAll(/export\s+(?:type|class|function|const|interface)\s+(\w+)/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual(
      [
        'A3_SET_R_DOCUMENT_SCORE_PREPARATION_KIND',
        'A3CanonicalNumeric84Decimal',
        'A3SetRDocumentScoreInput',
        'A3SetRDocumentScorePreparation',
        'A3SetRScoreRefusal',
        'A3SetRScoreRefusalCode',
        'A3SetRScoreRefusalLocation',
        'A3SetRSourcePageScoreInput',
        'A3SetRSourceRowScoreProvenance',
        'A3SetRTrackScoreProvenance',
        'canonicaliseNumeric84Decimal',
        'compareNumeric84Decimal',
        'prepareSetRDocumentScore',
      ].sort(),
    );
  });

  /**
   * R11 NARROWED THIS BY EXACT NAME: `setR.ts` (the SET_R total rank) now
   * exists, and ranking stays out of THIS module - proved above. The other
   * later slices are still absent.
   */
  it('the SET_R rank is R11 setR.ts, never this module; the other later slices still do not exist', () => {
    expect(existsSync(join(A3PREP_DIR, 'setR.ts'))).toBe(true);
    for (const file of ['organisationCaps.ts', 'syntheticFixtures.ts']) {
      expect(existsSync(join(A3PREP_DIR, file)), file).toBe(false);
    }
  });

  it('names no sealed root and no home directory', () => {
    expect(raw()).not.toMatch(/SEALED_ROOT_BY_SPLIT|gen1-dev-confirm|gen1-final-holdout|-sealed/);
    expect(raw()).not.toMatch(/homedir|Developer\//);
  });

  it('copies no owner-record hash literal: both are read from the contract binding', () => {
    expect(raw()).not.toMatch(/[0-9a-f]{64}/);
  });
});

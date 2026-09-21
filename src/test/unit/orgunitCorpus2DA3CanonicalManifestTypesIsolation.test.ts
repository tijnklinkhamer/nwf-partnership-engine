/**
 * PHASE 2B-2D A3 R5 ISOLATION — PRE-LABEL MANIFEST REPRESENTATIONS ARE PURE,
 * SPLIT-SPECIFIC AND COMPUTE NOTHING.
 *
 * This file reads the real source of `a3prep/manifestTypes.ts` and proves:
 *
 *   - it imports exactly R1's `contracts.ts` (type-only), R1's `types.ts`
 *     (type-only), R4's `splitScope.ts` and R2's `rank.ts`. From `rank.ts` it
 *     takes the document-identity format check `isLowerHexSha256` and nothing
 *     else;
 *   - it performs no IO, hashing, serialisation, path resolution,
 *     environment read, clock or randomness;
 *   - it has no multi-split or whole-corpus entry point and no union type
 *     over the three shapes;
 *   - it never spreads caller input into an output;
 *   - it names no sealed root and no final manifest file, and it has no gold,
 *     review, item-id or content field;
 *   - it answers none of K1-K4.
 *
 * It lives in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const MANIFEST_TYPES = join(REPO_ROOT, 'src/test/harness/phase2b2d/a3prep/manifestTypes.ts');

function code(): string {
  return readFileSync(MANIFEST_TYPES, 'utf8')
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

function importClause(specifier: string): string {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`import\\s+(type\\s+)?\\{([^}]*)\\}\\s*from\\s*'${escaped}'`).exec(
    code(),
  );
  const names = (match?.[2] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
  return `${match?.[1] ?? ''}${names.join(',')}`.trim();
}

describe('2D-A3 R5: exact import graph', () => {
  it('imports R1 contracts, R2 rank, R4 splitScope and R1 types, and nothing else', () => {
    expect(specifiersOf(code())).toEqual([
      './contracts.js',
      './rank.js',
      './splitScope.js',
      './types.js',
    ]);
  });

  it('takes only the Split type from contracts, type-only', () => {
    expect(importClause('./contracts.js')).toBe('type Split');
  });

  it('takes only the canonical document-identity check from rank.ts, and no hashing', () => {
    expect(importClause('./rank.js')).toBe('isLowerHexSha256');
  });

  it('takes the scope brand check and visibility map from splitScope.ts', () => {
    expect(importClause('./splitScope.js')).toBe(
      'A3_SPLIT_VISIBILITY_BY_SPLIT,isA3SplitScope,type A3SplitScope',
    );
  });

  it('takes only the document identity type from types.ts, type-only', () => {
    expect(importClause('./types.js')).toBe('type A3DocumentSha256');
  });
});

describe('2D-A3 R5: no IO, hashing, serialisation, environment, clock or randomness', () => {
  const FORBIDDEN: readonly RegExp[] = [
    /\bfetch\s*\(/,
    /node:/,
    /\bprocess\b/,
    /Date\.now\s*\(|new Date\s*\(|performance\.now/,
    /Math\.random\s*\(|randomUUID|randomBytes|getRandomValues|crypto/,
    /createHash|sha256Utf8Exact|prefixedDocumentRankHash|hashRecords|hashDocument|sha256OfCanonical/,
    /canonicalStringify|JSON\.|\.digest\s*\(|merkle/i,
    /readFile|writeFile|readdir|createReadStream|createWriteStream|mkdir|existsSync|\bstat\s*\(|realpath/,
    /homedir|\bos\b|\bpath\b\.|resolve\s*\(|(?<![.\w])join\s*\(|cwd\s*\(|HOME/,
    /\bPool\b|\bClient\b|\bquery\s*\(/,
    /console\./,
    /anthropic|openai|apollo|provider|classif/i,
  ];
  it('manifestTypes.ts holds none of them', () => {
    const source = code();
    for (const pattern of FORBIDDEN) expect(source, String(pattern)).not.toMatch(pattern);
  });
});

describe('2D-A3 R5: no generic or cross-split access', () => {
  it('names no whole-corpus, multi-split or loader entry point', () => {
    expect(code()).not.toMatch(
      /loadAllManifests|loadManifest|loadCorpus|readAllSplits|allSplits|anySplit|mixed|combined|wildcard|reader/i,
    );
  });

  it('never iterates the split list and takes no split list', () => {
    const source = code();
    expect(source).not.toMatch(/\bSPLITS\b|A3_GATED_SPLITS/);
    expect(source).not.toMatch(/:\s*(readonly\s+)?Split\[\]/);
  });

  it('declares no union type over the three representations', () => {
    expect(code()).not.toMatch(/export\s+type\s+\w+\s*=\s*\|?\s*A3\w*ManifestPrep\s*\|/);
    expect(code()).not.toMatch(/A3AnyManifestPrep|A3ManifestPrep\b(?!Stage|Refusal)/);
  });

  it('never spreads caller input into an output', () => {
    expect(code()).not.toMatch(/\.\.\.\s*(input|record)\b/);
    expect(code()).not.toMatch(
      /Object\.assign|structuredClone|Object\.entries|Object\.fromEntries/,
    );
  });

  it('names no sealed root and no final manifest file', () => {
    const source = code();
    expect(source).not.toMatch(/SEALED_ROOT_BY_SPLIT|canonicalStorageRootForScope/);
    expect(source).not.toMatch(/Developer\/|gen1-|-sealed|docs\/evaluation/);
    expect(source).not.toMatch(/MANIFEST_DEV_TRAIN|MANIFEST_DEV_CONFIRM|MANIFEST_FINAL_HOLDOUT/);
    expect(source).not.toMatch(/\.json\b/);
  });

  it('has no gold, review, item-id, content or model field', () => {
    const source = code();
    expect(source).not.toMatch(/\bgold\w*\s*:|goldId|goldLabel|unitType|hardNegative/i);
    expect(source).not.toMatch(/reviewer|adjudicat|verdict|agreement\s*:|kappa\s*:/i);
    expect(source).not.toMatch(/\bitemIds?\s*:|itemIdentit\w*\s*:/);
    expect(source).not.toMatch(/\burl\s*:|\btitle\s*:|\bhost\w*\s*:|\btext\s*:|mainText/i);
    expect(source).not.toMatch(/organisationBreakdown|perOrganisation|byOrganisation/i);
  });

  it('answers no K decision and implements no sample rule', () => {
    const source = code();
    expect(source).not.toMatch(/K[1-4]_|OWNER_DECISION|resolved\s*:/);
    expect(source).not.toMatch(
      /jaccard|shingle|nearDuplicate|dedup|rankSetP|SET_P_RANK|SET_R_TIE/i,
    );
  });

  it('exports exactly the representation API and nothing else', () => {
    const exported = [
      ...code().matchAll(/export\s+(?:type|class|function|const|interface)\s+(\w+)/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual([
      'A3DevConfirmPublicManifestPrep',
      'A3DevConfirmPublicManifestPrepInput',
      'A3DevTrainManifestPrep',
      'A3DevTrainManifestPrepInput',
      'A3FinalHoldoutPublicManifestPrep',
      'A3FinalHoldoutPublicManifestPrepInput',
      'A3ManifestPrepRefusal',
      'A3ManifestPrepRefusalCode',
      'A3ManifestPrepStage',
      'A3SplitContentHash',
      'A3_MANIFEST_PREP_STAGE',
      'asA3SplitContentHash',
      'createDevConfirmPublicManifestPrep',
      'createDevTrainManifestPrep',
      'createFinalHoldoutPublicManifestPrep',
    ]);
  });
});

/**
 * PHASE 2B-2D A3 R4 ISOLATION — SPLIT SCOPING IS PURE, SINGLE-SPLIT AND IO-FREE.
 *
 * By reading the real source of `a3prep/splitScope.ts`, this file proves:
 *
 *   - it imports exactly three modules - the canonical SD7 contract (for
 *     `SEALED_ROOT_BY_SPLIT` alone), R1's `contracts.ts` and R1's `types.ts`
 *     (type-only) - and nothing else;
 *   - it declares no split string and no root string of its own;
 *   - it performs no IO and no path resolution, reads no environment, and
 *     uses no clock, randomness or home directory;
 *   - it offers no generic cross-split access: no whole-corpus loader, no
 *     multi-split scope, no wildcard, no `Split[]` parameter and no parent
 *     root;
 *   - it builds no manifest, runs no SD7 and answers none of K1-K4.
 *
 * It sits in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SPLIT_SCOPE = join(REPO_ROOT, 'src/test/harness/phase2b2d/a3prep/splitScope.ts');

function code(): string {
  return readFileSync(SPLIT_SCOPE, 'utf8')
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

function importedNames(specifier: string): string[] {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`import\\s+(type\\s+)?\\{([^}]*)\\}\\s*from\\s*'${escaped}'`).exec(
    code(),
  );
  return (match?.[2] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

describe('2D-A3 R4: exact import graph', () => {
  it('splitScope.ts imports the SD7 contract, R1 contracts and R1 types, and nothing else', () => {
    expect(specifiersOf(code())).toEqual(['../sd7/sd7Contract.js', './contracts.js', './types.js']);
  });

  it('reads only SEALED_ROOT_BY_SPLIT from the SD7 contract', () => {
    expect(importedNames('../sd7/sd7Contract.js')).toEqual(['SEALED_ROOT_BY_SPLIT']);
  });

  it('reads the split vocabulary and gated list from R1 contracts', () => {
    expect(importedNames('./contracts.js')).toEqual([
      'A3_GATED_SPLITS',
      'SPLITS',
      'type A3GatedSplit',
      'type Split',
    ]);
  });

  it('imports R1 types for the gated public aggregate, type-only', () => {
    expect(code()).toMatch(
      /import\s+type\s*\{\s*A3GatedSplitPublicAggregate\s*\}\s*from\s*'\.\/types\.js'/,
    );
  });
});

describe('2D-A3 R4: no restated split or root', () => {
  it('declares no root path literal', () => {
    const source = code();
    expect(source).not.toMatch(/Developer\/|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout/);
    expect(source).not.toMatch(/phase2b-2d-methodology-v2/);
  });

  it('never builds a split list of its own', () => {
    expect(code()).not.toMatch(/\[\s*'DEV_TRAIN'|\[\s*'DEV_CONFIRM'|\[\s*'FINAL_HOLDOUT'/);
  });
});

describe('2D-A3 R4: no IO, path resolution, environment, clock or randomness', () => {
  const FORBIDDEN: readonly RegExp[] = [
    /\bfetch\s*\(/,
    /node:/,
    /\bprocess\b/,
    /Date\.now\s*\(|new Date\s*\(|performance\.now/,
    /Math\.random\s*\(|randomUUID|randomBytes|getRandomValues|crypto/,
    /readFile|writeFile|readdir|createReadStream|createWriteStream|mkdir|existsSync|\bstat\s*\(|realpath/,
    /homedir|\bos\b|\bpath\b\.|resolve\s*\(|(?<![.\w])join\s*\(|cwd\s*\(|HOME/,
    /\bPool\b|\bClient\b|\bquery\s*\(/,
    /console\./,
    /anthropic|openai|apollo/i,
  ];
  it('splitScope.ts holds none of them', () => {
    const source = code();
    for (const pattern of FORBIDDEN) expect(source, String(pattern)).not.toMatch(pattern);
  });
});

describe('2D-A3 R4: no generic cross-split access', () => {
  it('names no whole-corpus or mixed-split entry point', () => {
    expect(code()).not.toMatch(
      /loadEntireCorpus|loadCorpus|readAllSplits|allSplits|combinedCorpus|mixedCorpus|allSealed|canReadAll|anySplit|wildcard/i,
    );
  });

  it('takes no Split[] and no split list as a parameter', () => {
    const source = code();
    expect(source).not.toMatch(/:\s*(readonly\s+)?Split\[\]/);
    expect(source).not.toMatch(/:\s*(readonly\s+)?A3GatedSplit\[\]/);
    expect(source).not.toMatch(/Array<\s*Split\s*>|Set<\s*Split\s*>/);
  });

  it('never iterates the split lists and never returns a root map', () => {
    const source = code();
    expect(source).not.toMatch(/SPLITS\.(map|forEach|flatMap|reduce|filter)/);
    expect(source).not.toMatch(/^export\b[^\n]*SEALED_ROOT_BY_SPLIT/m);
    expect(source).not.toMatch(/export\s*\{[^}]*SEALED_ROOT_BY_SPLIT/);
    expect(source).not.toMatch(/return\s+SEALED_ROOT_BY_SPLIT\s*;/);
  });

  it('builds no manifest, runs no SD7, draws no sample and answers no K decision', () => {
    const source = code();
    expect(source).not.toMatch(/manifest|jaccard|shingle|nearDuplicate|dedup/i);
    expect(source).not.toMatch(/SET_P|SET_R|setP|setR|rank/);
    expect(source).not.toMatch(/K[1-4]_|OWNER_DECISION|corpusFreeze|freezeRecord|FREEZE/);
  });

  it('exports exactly the scope API and nothing else', () => {
    const exported = [
      ...code().matchAll(/export\s+(?:type|class|function|const|interface)\s+(\w+)/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual([
      'A3ReportedSplitToken',
      'A3SplitScope',
      'A3SplitScopeRefusal',
      'A3SplitScopeRefusalCode',
      'A3SplitTokenedRecord',
      'A3SplitVisibility',
      'A3SplitVisibilityOf',
      'A3_SPLIT_VISIBILITY_BY_SPLIT',
      'assertGatedAggregateMatchesScope',
      'assertGatedSplitScope',
      'assertRecordsMatchSplitScope',
      'assertSingleSplitCollection',
      'canonicalStorageRootForScope',
      'createA3SplitScope',
      'isA3GatedSplit',
      'isA3SplitScope',
    ]);
  });
});

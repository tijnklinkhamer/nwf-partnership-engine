/**
 * PHASE 2B-2D A3 R3 ISOLATION — SD9 EVALUATION IS PURE, TINY AND UNDERIVED.
 *
 * By reading the real source of `a3prep/sd9.ts`, this file proves:
 *
 *   - it imports exactly one module, `./contracts.js`, and from it exactly
 *     `MIN_PAGES_PER_ORGANISATION`;
 *   - it performs no IO, reads no environment, uses no clock or randomness;
 *   - it performs no SD7 work and names no survivor pool, sample, split,
 *     document, organisation or content field - so it cannot derive a count;
 *   - it names no ledger, reserve, sealed root or finalising verb.
 *
 * It sits in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SD9 = join(REPO_ROOT, 'src/test/harness/phase2b2d/a3prep/sd9.ts');

function code(): string {
  return readFileSync(SD9, 'utf8')
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

describe('2D-A3 R3: exact import graph', () => {
  it('sd9.ts imports ./contracts.js and nothing else', () => {
    expect(specifiersOf(code())).toEqual(['./contracts.js']);
  });

  it('sd9.ts reads only MIN_PAGES_PER_ORGANISATION from contracts', () => {
    const imported = /import\s*\{([^}]*)\}\s*from\s*'\.\/contracts\.js'/.exec(code());
    expect(
      imported?.[1]
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ).toEqual(['MIN_PAGES_PER_ORGANISATION']);
  });
});

describe('2D-A3 R3: no IO, environment, clock or randomness', () => {
  const FORBIDDEN: readonly RegExp[] = [
    /\bfetch\s*\(/,
    /node:/,
    /process\./,
    /Date\.now\s*\(|new Date\s*\(|performance\.now/,
    /Math\.random\s*\(|randomUUID|randomBytes|getRandomValues|crypto/,
    /readFile|writeFile|readdir|createReadStream|createWriteStream|mkdir/,
    /\bPool\b|\bClient\b|\bquery\s*\(/,
    /console\./,
    /anthropic|openai|apollo/i,
  ];
  it('sd9.ts holds none of them', () => {
    const source = code();
    for (const pattern of FORBIDDEN) expect(source, String(pattern)).not.toMatch(pattern);
  });
});

describe('2D-A3 R3: evaluates counts, never derives them', () => {
  it('performs no SD7 work and names no survivor pool or sample', () => {
    expect(code()).not.toMatch(
      /jaccard|shingle|nearDuplicate|survivor|dedup|SET_P|SET_R|setP|setR|pool|sample/i,
    );
  });

  it('takes no identity, split, document or content input', () => {
    expect(code()).not.toMatch(
      /organisationId|selectionIndex|\bsplit\b|Split|documentSha|sha256|candidateScore|\btrack\b|\burl\b|hostname|title|mainText|unitType|gold/i,
    );
  });

  it('names no ledger, reserve, sealed root or finalising verb', () => {
    const source = code();
    expect(source).not.toMatch(/ledger|reserve|replacement|acquisitionOfRecord|freeze/i);
    expect(source).not.toMatch(/SEALED_ROOT_BY_SPLIT|gen1-dev-confirm|gen1-final-holdout|-sealed/);
    expect(source).not.toMatch(
      /finalise|setAcquisitionStatus|adjudicate|materialise|persist|record[A-Z]/,
    );
  });

  it('exports exactly the two evaluators, the refusal and the status type', () => {
    const exported = [...code().matchAll(/export\s+(?:type|class|function|const)\s+(\w+)/g)]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual([
      'A3Sd9InputRefusal',
      'A3Sd9MechanicalStatus',
      'evaluateSd9FromAdmissiblePostSd7Bounds',
      'evaluateSd9FromExactPostSd7Count',
    ]);
  });
});

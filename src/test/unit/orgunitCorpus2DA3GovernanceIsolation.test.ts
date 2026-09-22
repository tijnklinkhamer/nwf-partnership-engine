/**
 * PHASE 2B-2D A3 R19 ISOLATION — `a3governance/` IS AN OFFLINE ADAPTER OVER
 * COMMITTED BYTES, AND NOTHING ELSE.
 *
 * R19 deliberately lives in a NEW SIBLING namespace. `a3prep/` stays the pure,
 * frozen R1-R17 methodology layer with no filesystem access at all;
 * `a3governance/` is the one place that turns heterogeneous COMMITTED A2
 * artifacts into R17's pure in-memory contract. That is why the two are not
 * merged: R17 must remain unable to learn about a registry, a JSON file, a
 * ledger version or a parser family.
 *
 * This file proves:
 *
 *   - `a3governance/` imports `node:fs`, `node:path` and `node:crypto`, the
 *     canonical A2 validators, the canonical draw digest and R17 - and nothing
 *     else: no `pg`, no pool, no gateway, no fetch, no socket, no provider, no
 *     classifier, no sealed reader, no environment-selected root and no
 *     child-process authority discovery;
 *   - `process.env` decides no governance;
 *   - `slotAuthority.ts` is byte-identical to the integration base, and every
 *     other pre-existing `a3prep/` file is untouched;
 *   - the `a3prep/` namespace still holds exactly its sixteen files, with
 *     `syntheticFixtures.ts` absent;
 *   - the corpus-freeze preflight is untouched and still lists real
 *     acquisition completion as not checked - 23 READY is not 110 READY.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP } from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';
const A3GOVERNANCE_REL = 'src/test/harness/phase2b2d/a3governance';

/** The integrated A2 + A3 governance tip R19 is pinned to. */
const GOVERNANCE_BASE = '907d726268ad07fe94fec93f4c6f3ff5ce5f93f9';

const A3GOVERNANCE_FILES = [
  'families.ts',
  'loader.ts',
  'refusal.ts',
  'registryV1.ts',
  'resolve.ts',
  'snapshot.ts',
  'transitionLedger.ts',
];

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

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function code(file: string): string {
  return stripComments(readFileSync(join(REPO_ROOT, A3GOVERNANCE_REL, file), 'utf8'));
}

function specifiersOf(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) found.push(m[1] ?? '');
  for (const m of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1] ?? '');
  for (const m of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    found.push(m[1] ?? '');
  for (const m of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) found.push(m[1] ?? '');
  return found;
}

const baseAvailable = commitExists(GOVERNANCE_BASE);

// ---------------------------------------------------------------------------

describe('2D-A3 R19: the new namespace is exactly these files', () => {
  it('holds the seven adapter modules and no synthetic fixture', () => {
    expect(readdirSync(join(REPO_ROOT, A3GOVERNANCE_REL)).sort()).toEqual(A3GOVERNANCE_FILES);
    expect(existsSync(join(REPO_ROOT, A3GOVERNANCE_REL, 'syntheticFixtures.ts'))).toBe(false);
  });

  it('leaves the a3prep namespace at exactly its sixteen files', () => {
    expect(readdirSync(join(REPO_ROOT, A3PREP_REL)).sort()).toEqual([
      'contracts.ts',
      'corpusFreezePreflight.ts',
      'manifestTypes.ts',
      'organisationCaps.ts',
      'rank.ts',
      'sd7.ts',
      'sd9.ts',
      'setP.ts',
      'setPSd7.ts',
      'setR.ts',
      'setRScore.ts',
      'setRSd7.ts',
      'setRSd7Readiness.ts',
      'slotAuthority.ts',
      'splitScope.ts',
      'types.ts',
    ]);
    expect(existsSync(join(REPO_ROOT, A3PREP_REL, 'syntheticFixtures.ts'))).toBe(false);
  });
});

describe('2D-A3 R19: the adapter reaches only what it is allowed to reach', () => {
  const ALLOWED_BARE = new Set(['node:fs', 'node:path', 'node:crypto']);
  const ALLOWED_RELATIVE = new Set([
    './families.js',
    './loader.js',
    './refusal.js',
    './registryV1.js',
    './resolve.js',
    './snapshot.js',
    './transitionLedger.js',
    '../a3prep/contracts.js',
    '../a3prep/slotAuthority.js',
    '../continuationWindow/replacementLedger.js',
    '../continuationWindow/windowPlan.js',
  ]);

  it('imports only fs / path / crypto, the canonical A2 validators and R17', () => {
    for (const file of A3GOVERNANCE_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        const allowed = specifier.startsWith('.')
          ? ALLOWED_RELATIVE.has(specifier)
          : ALLOWED_BARE.has(specifier);
        expect(allowed, `${file} imports ${specifier}`).toBe(true);
      }
    }
  });

  /**
   * These assert real CAPABILITIES - a module specifier, a client, a SQL verb,
   * a socket module, a sealed root, an environment read - never an ordinary
   * English word. The census DECLARES that it carries no classifier data and
   * is not SET_P/SET_R authority, so a bare word scan would trip on exactly
   * the promise it is meant to enforce.
   */
  it('holds no database, socket, provider, classifier or sealed-root capability', () => {
    const FORBIDDEN: readonly RegExp[] = [
      /\bfrom\s+['"]pg['"]|require\(['"]pg['"]\)/,
      /\bnew Pool\b|\bPoolClient\b|\.query\s*\(/,
      /src\/db\/|\.\.\/\.\.\/\.\.\/db\/|dbPool|withTransaction/,
      /node:net|node:tls|node:http|node:https|node:dgram|node:dns/,
      /\bfetch\s*\(|executeWebAttempt|\/gateway\.js/,
      /from\s+['"][^'"]*(?:anthropic|openai|apollo)/i,
      /\bnew Anthropic\b|\bnew OpenAI\b|messages\.create\(/,
      /orgunits\/classify\/(?!canonical)/,
      /SEALED_ROOT_BY_SPLIT|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout|-sealed/,
      /homedir|os\.homedir|~\/|Developer\//,
      /execFile|spawnSync|child_process/,
      /process\.env|dotenv/,
      /nwf_pe\b/,
      /a3prep\/setP|a3prep\/setR|a3prep\/sd7|a3prep\/manifestTypes|a3prep\/splitScope/,
    ];
    for (const file of A3GOVERNANCE_FILES) {
      const source = code(file);
      for (const pattern of FORBIDDEN) {
        expect(source, `${file} :: ${String(pattern)}`).not.toMatch(pattern);
      }
    }
  });

  it('writes nothing: the adapter reads committed bytes and returns values', () => {
    for (const file of A3GOVERNANCE_FILES) {
      expect(code(file), file).not.toMatch(
        /writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|createWriteStream/,
      );
    }
  });

  it('selects no "latest" anything, and sorts no record into authority', () => {
    for (const file of A3GOVERNANCE_FILES) {
      const source = code(file);
      expect(source, file).not.toMatch(/latest|newest|mostRecent|mtime|birthtime|lastModified/i);
    }
  });

  it('reads the canonical draw digest and the canonical ledger validator, not copies', () => {
    const resolveSource = code('resolve.ts');
    expect(resolveSource).toMatch(/drawEntrySha256/);
    expect(resolveSource).toMatch(/requireValidLedger/);
    expect(resolveSource).toMatch(/recomputeLedgerHash/);
    // The R17 resolver and summary are CALLED, never reimplemented.
    expect(resolveSource).toMatch(/resolveGenerationSlotAuthorities\(/);
    expect(code('snapshot.ts') + resolveSource).toMatch(/deriveGenerationSlotAuthoritySummary\(/);
  });

  it('touches R17’s own WeakSet not at all, and brands with its own', () => {
    expect(code('snapshot.ts')).toMatch(/new WeakSet<object>\(\)/);
    expect(code('snapshot.ts')).toMatch(/new WeakMap</);
    expect(code('snapshot.ts')).toMatch(/isA3SlotAcquisitionAuthorityReady/);
  });
});

describe('2D-A3 R19: R17 and a3prep are untouched', () => {
  it('slotAuthority.ts is byte-identical to its committed bytes', () => {
    const onDisk = readFileSync(join(REPO_ROOT, A3PREP_REL, 'slotAuthority.ts'));
    expect(createHash('sha256').update(onDisk).digest('hex')).toBe(
      'deee711b6eac66bccec51afee49615b71b94d0701b110a3abd50c1c12207f165',
    );
  });

  it('R17 still knows nothing about a registry, a file or a ledger version', () => {
    const r17 = readFileSync(join(REPO_ROOT, A3PREP_REL, 'slotAuthority.ts'), 'utf8');
    expect(r17).not.toMatch(/a3governance|registryV1|REGISTRY|node:fs|JSON\.parse/);
    expect(r17).not.toMatch(/TRANSITION_LEDGER_CHAIN|parserFamily|V6_GEN1/);
  });

  it('the corpus-freeze preflight is untouched and still refuses to be a freeze gate', () => {
    const preflight = readFileSync(join(REPO_ROOT, A3PREP_REL, 'corpusFreezePreflight.ts'), 'utf8');
    expect(preflight).not.toMatch(/slotAuthority|a3governance/);
    expect(A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP).toContain(
      'REAL_ACQUISITION_COMPLETION',
    );
  });
});

describe.skipIf(!baseAvailable)('2D-A3 R19: lineage and changed surface', () => {
  it('descends from the canonical A2 + A3 governance integration tip', () => {
    expect(() => git('merge-base', '--is-ancestor', GOVERNANCE_BASE, 'HEAD')).not.toThrow();
  });

  it('changes no a3prep file, no A2 record, no ledger, no draw and no production file', () => {
    const changed = git('diff', '--name-only', GOVERNANCE_BASE)
      .split('\n')
      .filter((line) => line.length > 0);
    const untracked = git('ls-files', '--others', '--exclude-standard')
      .split('\n')
      .filter((line) => line.length > 0);
    const paths = [...new Set([...changed, ...untracked])];
    const forbidden = paths.filter(
      (path) =>
        path.startsWith(`${A3PREP_REL}/`) ||
        (path.startsWith('src/test/harness/') && !path.startsWith(`${A3GOVERNANCE_REL}/`)) ||
        path.startsWith('src/test/firewall/') ||
        path.startsWith('src/orgunits/') ||
        path.startsWith('src/cli/') ||
        path.startsWith('src/db/') ||
        path.startsWith('migrations/') ||
        path === 'package.json' ||
        path === 'package-lock.json',
    );
    expect(forbidden).toEqual([]);
  });

  /**
   * R19 adds ONE file under `docs/evaluation/`: its own DERIVED census, which
   * authorises nothing. It changes no A2 governance record, and above all no
   * registered one - a registered file that moved would have refused at the
   * byte loader long before this test ran.
   */
  it('adds only its own derived census under docs/evaluation, and changes no A2 record', () => {
    const changed = git('diff', '--name-only', GOVERNANCE_BASE, '--', 'docs/evaluation')
      .split('\n')
      .filter((line) => line.length > 0);
    const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'docs/evaluation')
      .split('\n')
      .filter((line) => line.length > 0);
    for (const path of [...new Set([...changed, ...untracked])]) {
      expect(path).toBe(
        'docs/evaluation/PHASE_2B_2D_A3_R19_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V1.json',
      );
    }
  });
});

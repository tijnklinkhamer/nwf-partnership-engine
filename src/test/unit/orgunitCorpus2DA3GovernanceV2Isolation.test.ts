/**
 * PHASE 2B-2D A3 R25 — ISOLATION OF THE COMMITTED GOVERNANCE SNAPSHOT V2.
 *
 * By reading source text, the repository's own history and the committed
 * records, this file proves:
 *
 *   - R25 lives in the NEW sibling namespace `a3governanceV2/`, and `a3prep/`,
 *     the historical V1 `a3governance/` and every R20-R24 namespace are
 *     byte-identical to the canonical R24 tip;
 *   - every earlier public census and audit is unchanged;
 *   - the only pre-existing file R25 touched is R24's historical scope pin;
 *   - no DB, network, provider, classifier, sealed-root or filesystem-write
 *     capability exists in the namespace;
 *   - Git is reached from ONE module, by argument vector, as
 *     `git -C <root> cat-file --batch` only: no shell, no branch, no `HEAD`,
 *     no remote ref, no log, no listing, no "latest", no working-tree read;
 *   - nothing here can write to A2;
 *   - the committed R25 census discloses no identity.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R25_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3governanceV2/census.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';
const A3GOVERNANCE_V2_REL = `${HARNESS}/a3governanceV2`;

/** The exact canonical R24 tip R25 was cut from. */
const R24_TERMINAL = '3f5b85c0e9d7b30fc65bf77b822a143daabfebee';

/** The one commit that pinned R24's own changed-surface test to its range. */
const R24_SCOPE_PIN_COMMIT = '9e1214725a0602c8f0f9ad442f63ad4116afbd7c';
const R24_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3ReachableMembershipSd9Isolation.test.ts';

const R25_TESTS = [
  'src/test/unit/orgunitCorpus2DA3GovernanceV2CommitLoader.test.ts',
  'src/test/unit/orgunitCorpus2DA3GovernanceV2Resolution.test.ts',
  'src/test/unit/orgunitCorpus2DA3GovernanceV2Isolation.test.ts',
];
const R25_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R25_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V2.json';
const R25_AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A3_R25_COMMITTED_GOVERNANCE_SNAPSHOT_V2_V1.md';

const A3GOVERNANCE_V2_FILES = [
  'census.ts',
  'commitLoader.ts',
  'familiesV2.ts',
  'refusal.ts',
  'registryV2.ts',
  'resolveV2.ts',
  'snapshotV2.ts',
];

/** Every earlier namespace R25 must leave byte-identical, with its file count. */
const FROZEN_NAMESPACES: Readonly<Record<string, number>> = {
  a3prep: 16,
  a3governance: 7,
  a3evidence: 7,
  a3documents: 6,
  a3graphs: 6,
  a3samples: 6,
  a3readiness: 6,
  continuationWindow: -1,
  sd7: -1,
  draw: -1,
};

const PRIOR_RECORDS = [
  'docs/evaluation/PHASE_2B_2D_A3_R19_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V1.json',
  'docs/evaluation/PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1.json',
  'docs/evaluation/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json',
  'docs/evaluation/PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_CENSUS_V1.json',
  'docs/evaluation/PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json',
  'docs/evaluation/PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS_V1.json',
  'docs/audits/PHASE_2B_2D_A3_R19_COMMITTED_A2_GOVERNANCE_AUTHORITY_ADAPTER_V1.md',
  'docs/audits/PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_ADAPTER_V1.md',
  'docs/audits/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_V1.md',
  'docs/audits/PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_V1.md',
  'docs/audits/PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_V1.md',
  'docs/audits/PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_V1.md',
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
  return stripComments(readFileSync(join(REPO_ROOT, A3GOVERNANCE_V2_REL, file), 'utf8'));
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

function lines(value: string): string[] {
  return value.split('\n').filter((line) => line.length > 0);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function allCode(): string {
  return A3GOVERNANCE_V2_FILES.map(code).join('\n');
}

const baseAvailable = commitExists(R24_TERMINAL) && commitExists(R24_SCOPE_PIN_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R25: the new namespace is exactly these files', () => {
  it('holds the seven V2 governance modules', () => {
    expect(readdirSync(join(REPO_ROOT, A3GOVERNANCE_V2_REL)).sort()).toEqual(A3GOVERNANCE_V2_FILES);
  });

  it('leaves every earlier A3 namespace at its file count', () => {
    for (const [namespace, count] of Object.entries(FROZEN_NAMESPACES)) {
      if (count < 0) continue;
      expect(readdirSync(join(REPO_ROOT, HARNESS, namespace)), namespace).toHaveLength(count);
    }
  });
});

describe('2D-A3 R25: no DB, network, provider, classifier, sealed or write capability', () => {
  const PERMITTED_SPECIFIERS = new Set([
    'node:crypto',
    'node:child_process',
    '../a3prep/slotAuthority.js',
    '../a3prep/contracts.js',
    '../a3governance/registryV1.js',
    '../a3governance/loader.js',
    '../a3governance/families.js',
    '../a3governance/refusal.js',
    '../a3governance/snapshot.js',
    '../a3governance/transitionLedger.js',
    '../continuationWindow/replacementLedger.js',
    '../continuationWindow/windowPlan.js',
    './census.js',
    './commitLoader.js',
    './familiesV2.js',
    './refusal.js',
    './registryV2.js',
    './resolveV2.js',
    './snapshotV2.js',
  ]);

  it('imports nothing but crypto, the git transport and landed A3 / A2-ledger modules', () => {
    for (const file of A3GOVERNANCE_V2_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        expect(PERMITTED_SPECIFIERS.has(specifier), `${file}: ${specifier}`).toBe(true);
      }
    }
  });

  it('opens no database, socket, provider, classifier or sealed root, and writes nothing', () => {
    const source = allCode();
    for (const forbidden of [
      /\bpg\b['"]/,
      /nwf_pe\b/,
      /nwf_readonly/,
      /\bSELECT\b|\bINSERT\b/,
      /node:(net|tls|http|https|dns|fs)/,
      /\bfetch\s*\(/,
      /process\.env/,
      /anthropic|claude-agent-sdk|@anthropic-ai/i,
      /orgunits\/classify|phase2b2d2c/,
      /methodology-v2-sealed|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout/,
      /writeFile|appendFile|mkdir|rmSync|unlink|createWriteStream/,
      /a3evidence|a3documents|a3graphs|a3samples|a3readiness|\/sd7\/|setP|setR/,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('reaches git from exactly one module, by argument vector, and never through a shell', () => {
    for (const file of A3GOVERNANCE_V2_FILES) {
      const source = code(file);
      if (file === 'commitLoader.ts') {
        expect(source).toMatch(/import\s*\{\s*execFileSync\s*\}\s*from\s*'node:child_process'/);
        continue;
      }
      expect(source, file).not.toContain('child_process');
      expect(source, file).not.toContain('execFileSync');
    }
    const loader = code('commitLoader.ts');
    expect(loader).not.toMatch(/\bexecSync\b|\bexec\s*\(|\bspawn\b|\bfork\s*\(|shell\s*:/);
    // The ONE invocation: `git -C <root> cat-file --batch`.
    expect(loader.match(/execFileSync\(/g)).toHaveLength(1);
    expect(loader).toContain("['-C', repositoryRoot, 'cat-file', '--batch']");
  });

  it('names no branch, ref, revision walk, listing or "latest" anywhere in code', () => {
    const source = allCode();
    for (const forbidden of [
      /\bHEAD\b/,
      /origin\//,
      /refs\//,
      /feat\//,
      /'log'|'ls-files'|'ls-tree'|'rev-list'|'rev-parse'|'for-each-ref'|'show-ref'|'branch'/,
      // 'commit' is legitimately an OBJECT TYPE the reader checks for; as a
      // subcommand it is excluded by the exact argument vector asserted above.
      /'show'|'diff'|'fetch'|'push'|'checkout'|'merge'|'worktree'|'--all'/,
      /\blatest\b/i,
      /readdir|glob|mtime|statSync/,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });
});

describe.skipIf(!baseAvailable)('2D-A3 R25: lineage and changed surface', () => {
  it('descends from the exact canonical R24 tip, and merges no A2 commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R24_TERMINAL, 'HEAD')).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', R24_SCOPE_PIN_COMMIT, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R24_TERMINAL}..HEAD`))).toEqual([]);
    for (const a2 of [
      'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1',
      '117e1ea9367b0bc5608e4873f3460db79fa0dc31',
      'c82f488ab5ad1551f616f08506c57d13087dff3b',
    ]) {
      if (!commitExists(a2)) continue;
      expect(() => git('merge-base', '--is-ancestor', a2, 'HEAD'), a2).toThrow();
    }
  });

  it('pinned R24 scope in exactly one commit that touched exactly one file', () => {
    expect(lines(git('diff', '--name-only', R24_TERMINAL, R24_SCOPE_PIN_COMMIT))).toEqual([
      R24_ISOLATION_TEST,
    ]);
    expect(sha256(readFileSync(join(REPO_ROOT, R24_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R24_SCOPE_PIN_COMMIT}:${R24_ISOLATION_TEST}`)),
    );
  });

  it('leaves a3prep, V1 a3governance, every R20-R24 namespace and the A2 harness untouched', () => {
    for (const namespace of Object.keys(FROZEN_NAMESPACES)) {
      const path = `${HARNESS}/${namespace}`;
      expect(lines(git('diff', '--name-only', R24_TERMINAL, '--', path)), path).toEqual([]);
      expect(lines(git('ls-files', '--others', '--exclude-standard', '--', path)), path).toEqual(
        [],
      );
    }
  });

  it('leaves every earlier public census and audit byte-identical', () => {
    for (const record of PRIOR_RECORDS) {
      expect(sha256(readFileSync(join(REPO_ROOT, record))), record).toBe(
        sha256(git('show', `${R24_TERMINAL}:${record}`)),
      );
    }
  });

  it('writes no governance record: every docs/evaluation change is the R25 census', () => {
    const changed = [
      ...lines(git('diff', '--name-only', R24_TERMINAL, '--', 'docs/evaluation')),
      ...lines(git('ls-files', '--others', '--exclude-standard', '--', 'docs/evaluation')),
    ];
    expect(changed.filter((path) => path !== R25_CENSUS_PATH)).toEqual([]);
  });

  it('changes nothing outside its own namespace, tests and records', () => {
    const paths = [
      ...new Set([
        ...lines(git('diff', '--name-only', R24_TERMINAL)),
        ...lines(git('ls-files', '--others', '--exclude-standard')),
      ]),
    ];
    const permitted = (path: string): boolean =>
      path.startsWith(`${A3GOVERNANCE_V2_REL}/`) ||
      R25_TESTS.includes(path) ||
      path === R24_ISOLATION_TEST ||
      path === R25_CENSUS_PATH ||
      path === R25_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });
});

describe.skipIf(!existsSync(join(REPO_ROOT, R25_CENSUS_PATH)))(
  '2D-A3 R25: the public census discloses nothing',
  () => {
    const raw = existsSync(join(REPO_ROOT, R25_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R25_CENSUS_PATH), 'utf8')
      : '{}';
    const payload = (() => {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      delete parsed['identityDisclosure'];
      delete parsed['whatThisIsNot'];
      return JSON.stringify(parsed, null, 2);
    })();

    it('is the derived census record, and authorises nothing', () => {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed['record']).toBe(R25_PUBLIC_CENSUS_RECORD_KIND);
      expect(parsed['recordKind']).toBe('PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CENSUS');
      expect(parsed['thisFileAuthorises']).toEqual([]);
    });

    it('carries no identity-, position-, run-, digest- or per-slot-bearing key', () => {
      for (const key of [
        'selectionIndex',
        'selectionIndices',
        'reserveRankPosition',
        'organisationId',
        'echeRowKey',
        'runId',
        'runRef',
        'runRefSha256',
        'drawEntrySha256',
        'documentHash',
        'contentSha256',
        'url',
        'domain',
        'hostname',
        'sealedSd7Detail',
        'label',
        'gold',
        'classifier',
        'slots',
      ]) {
        expect(payload, key).not.toContain(`"${key}":`);
      }
    });

    it('names no URL, domain, sealed filename or run-shaped digest', () => {
      expect(payload).not.toMatch(/https?:\/\/|\.(fr|eu|org|com)\b|SD7_DETAIL|\.json"|sealed-/);
      const digests = [...new Set(payload.match(/\b[0-9a-f]{40,64}\b/g) ?? [])].sort();
      expect(digests).toEqual(
        [
          '907d726268ad07fe94fec93f4c6f3ff5ce5f93f9',
          'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1',
        ].sort(),
      );
    });
  },
);

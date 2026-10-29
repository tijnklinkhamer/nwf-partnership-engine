/**
 * PHASE 2B-2D A3 R38B — SCOPE, PURITY, NON-REGRESSION AND DISCLOSURE OF
 * GOVERNANCE V5.
 *
 * Proves, from the repository itself:
 *
 *   - R38B descends from the exact R38A tip, merges nothing, never makes the
 *     terminal A2 checkpoint an ancestor, and pinned R38A's scope in exactly
 *     one commit touching exactly one file;
 *   - R17, R26's comparator, the whole R38A contract (source, tests, record,
 *     audit), the R38 refusal and every other harness namespace (Governance
 *     V1-V4, R20-R37) are byte-identical; nothing outside the V5 namespace,
 *     its three tests, its census and its audit changed;
 *   - the V5 namespace is exactly its files, reaches git only through R25's
 *     frozen primitives, opens no database / socket / provider / sealed root,
 *     calls the unchanged R38A resolver at exactly one site, and mints V5
 *     authority only through a private brand;
 *   - nothing R39-, V6- or A5-shaped exists; and
 *   - the public census and audit disclose aggregates only.
 *
 * Reads git objects and repository files only. No database, no network.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';
const NAMESPACE = `${HARNESS}/a3governanceV5`;
const R38A_NAMESPACE = `${HARNESS}/a3crossGenerationSlotAuthority`;

/** The exact R38A tip R38B was cut from. */
const R38A_TERMINAL = '80f792de8117c3c91ddb56bbb4dbe6518fde7d8a';
const R38_TERMINAL = '960856bb4e503fcc6961843f88761f66ebffcd27';
/**
 * R38B'S OWN TERMINAL COMMIT.
 *
 * R38B's changed-surface and historical-scope assertions describe R38B'S
 * SLICE, so they range over R38B's own commits - `R38A_TERMINAL..R38B_TERMINAL`
 * - rather than over the working tree. Once a later slice lands on top, the
 * working tree is no longer R38B's surface, and diffing to it would fail for
 * the honest reason that history moved on rather than because R38B changed.
 *
 * This is the same standing convention R19 through R38A apply, and it
 * WEAKENS NOTHING: R38B's range is frozen, its permitted-path list is
 * unchanged, and each later slice pins the equivalent scope over its own range.
 */
const R38B_TERMINAL = '834b3d99e41044ec5c93ec8ec905b4c2887c6ae8';
const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';
const R38A_ISOLATION_TEST =
  'src/test/unit/orgunitCorpus2DA3CrossGenerationSlotAuthorityIsolation.test.ts';
/**
 * R38's refusal test, pinned in ONE owner-authorised one-file commit: its
 * single working-tree "no V5 namespace" assertion now reads R38's own tree
 * (`R38_TERMINAL`). It is the only other older file R38B changes.
 */
const R38_REFUSAL_TEST = 'src/test/unit/orgunitCorpus2DA3CrossGenerationAuthorityRefusal.test.ts';

const V5_TESTS = [
  'src/test/unit/orgunitCorpus2DA3GovernanceV5.test.ts',
  'src/test/unit/orgunitCorpus2DA3GovernanceV5Refusals.test.ts',
  'src/test/unit/orgunitCorpus2DA3GovernanceV5Isolation.test.ts',
];
const CENSUS = 'docs/evaluation/PHASE_2B_2D_A3_R38B_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V5.json';
const AUDIT = 'docs/audits/PHASE_2B_2D_A3_R38B_COMMITTED_GOVERNANCE_SNAPSHOT_V5_V1.md';

const NAMESPACE_FILES = [
  'census.ts',
  'commitLoaderV5.ts',
  'crossGenerationAdapter.ts',
  'devTrainContinuity.ts',
  'familiesV5.ts',
  'freezeCrossCheck.ts',
  'historyV5.ts',
  'refusal.ts',
  'registryV5.ts',
  'resolveV5.ts',
  'snapshotV5.ts',
  'structureV5.ts',
];

/** Byte pins of everything R38B must not change. */
const FROZEN = Object.freeze({
  [`${HARNESS}/a3prep/slotAuthority.ts`]:
    'deee711b6eac66bccec51afee49615b71b94d0701b110a3abd50c1c12207f165',
  [`${HARNESS}/a3evidenceV2/authorityDelta.ts`]:
    '26cb34fea6ceaea38a6328bf0ac3eb6a33e86702166871856dd91f1ed2c2c2f3',
  [`${R38A_NAMESPACE}/chain.ts`]:
    '537359737abba796f13849f0bb80e8f37f1778688b336a006df0af741ebdd1ef',
  [`${R38A_NAMESPACE}/continuity.ts`]:
    '9104db585a26b5ba167fad782263b355b65ea26d08c564123ac8301d56d0dea1',
  [`${R38A_NAMESPACE}/occupantIdentity.ts`]:
    '5deeab15d2bc712ec855274d32e8e85d3a2e44234d940cec583501c66b8dddcf',
  [`${R38A_NAMESPACE}/refusal.ts`]:
    '1160debf6e3c36e650f72b73eedb93eb0926dab7f7fe8f3d357802e395cd0a7b',
  [`${R38A_NAMESPACE}/resolve.ts`]:
    'd6645b109a83b4de98c108b0c18b18414192a68df68f9b86a66fc8f2a2faef7d',
  [`${R38A_NAMESPACE}/terminalFacts.ts`]:
    '4bd08680fe0376066f7694e3fdc39f84f3f4a39649bc36d893fec1714c4387d1',
  [`${R38A_NAMESPACE}/types.ts`]:
    '2092b929bdb7fcb1d5f1b38a5c7eae870ffe950558ff4067db2f74b9d104be19',
  'src/test/unit/orgunitCorpus2DA3CrossGenerationSlotAuthority.test.ts':
    '7cc407bc2489d04527fca5185c07e6c00df2a31bcd3b16c11e774aa2984c1854',
  'docs/evaluation/PHASE_2B_2D_A3_R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1.json':
    'ea2cac540d17aaf29b5e88b2f9a83b77617f783d6255a86a10f91de3b8b6641e',
  'docs/audits/PHASE_2B_2D_A3_R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1.md':
    'd349252fa6c31a5c45558da07d52438851130475f32ff5686bc1c3d7823caeff',
  'docs/evaluation/PHASE_2B_2D_A3_R38_CROSS_GENERATION_AUTHORITY_ADAPTER_REFUSAL_V1.json':
    '7cf59593d06ba77cf29206120496c3e642acccd28a580b1b13b7d5181fc9dec0',
});

function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function commitExists(commit: string): boolean {
  try {
    git('cat-file', '-e', `${commit}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

const lines = (value: string): string[] => value.split('\n').filter((l) => l.length > 0);
const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
const code = (file: string): string => readFileSync(join(REPO_ROOT, NAMESPACE, file), 'utf8');
const allCode = (): string => NAMESPACE_FILES.map(code).join('\n');

function specifiersOf(source: string): string[] {
  return [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]!);
}

const baseAvailable =
  commitExists(R38A_TERMINAL) && commitExists(R38_TERMINAL) && commitExists(R38B_TERMINAL);

// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R38B: lineage and changed surface', () => {
  it('descends from the exact R38A tip through two one-file scope pins, and merges nothing', () => {
    expect(() => git('merge-base', '--is-ancestor', R38A_TERMINAL, R38B_TERMINAL)).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R38A_TERMINAL}..${R38B_TERMINAL}`))).toEqual([]);
    const [first, second] = lines(
      git('rev-list', '--reverse', `${R38A_TERMINAL}..${R38B_TERMINAL}`),
    );
    if (first !== undefined) {
      expect(git('rev-parse', `${first}^`).trim()).toBe(R38A_TERMINAL);
      expect(lines(git('diff', '--name-only', R38A_TERMINAL, first))).toEqual([
        R38A_ISOLATION_TEST,
      ]);
    }
    if (second !== undefined) {
      expect(lines(git('diff', '--name-only', first!, second))).toEqual([R38_REFUSAL_TEST]);
    }
  });

  it('changes R38’s refusal test only by moving its one working-tree assertion onto R38’s tree', () => {
    const removed = lines(
      git('diff', '-U0', R38A_TERMINAL, R38B_TERMINAL, '--', R38_REFUSAL_TEST),
    ).filter((line) => line.startsWith('-') && !line.startsWith('---'));
    expect(removed).toEqual([
      "-import { existsSync, readFileSync } from 'node:fs';",
      "-  it('creates no Governance V5 namespace and no V5 census', () => {",
      "-    expect(existsSync(join(REPO_ROOT, HARNESS, 'a3governanceV5'))).toBe(false);",
      '-    expect(',
      '-      existsSync(',
      '-        join(',
      '-          REPO_ROOT,',
      "-          'docs/evaluation/PHASE_2B_2D_A3_R38_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V5.json',",
      '-        ),',
      '-      ),',
      '-    ).toBe(false);',
      '-  });',
    ]);
  });

  it('never makes the terminal A2 checkpoint an ancestor of A3', () => {
    if (commitExists(A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it('changes nothing but the two scope pins, the V5 namespace, its tests, census and audit', () => {
    const paths = lines(git('diff', '--name-only', R38A_TERMINAL, R38B_TERMINAL));
    const permitted = (path: string): boolean =>
      path === R38A_ISOLATION_TEST ||
      path === R38_REFUSAL_TEST ||
      path.startsWith(`${NAMESPACE}/`) ||
      V5_TESTS.includes(path) ||
      path === CENSUS ||
      path === AUDIT;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });

  it('leaves every other harness namespace untouched (Governance V1-V4, R17-R38A, R20-R37)', () => {
    const touched = lines(
      git('diff', '--name-only', R38A_TERMINAL, R38B_TERMINAL, '--', HARNESS),
    ).filter((path) => !path.startsWith(`${NAMESPACE}/`));
    expect(touched).toEqual([]);
  });

  it('leaves every earlier A3 record and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R38A_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R38A_TERMINAL, '--', ...prior))).toEqual([]);
  });
});

describe('2D-A3 R38B: R17, R26, R38 and the whole R38A contract are frozen', () => {
  it.each(Object.entries(FROZEN))('%s is byte-identical to its pin', (path, digest) => {
    expect(sha256(readFileSync(join(REPO_ROOT, path)))).toBe(digest);
  });
});

describe('2D-A3 R38B: the V5 namespace is exactly these pure files', () => {
  it('holds exactly the V5 modules', () => {
    expect(readdirSync(join(REPO_ROOT, NAMESPACE)).sort()).toEqual(NAMESPACE_FILES);
  });

  const PERMITTED_SPECIFIERS = new Set([
    'node:crypto',
    '../../../../orgunits/classify/canonical.js',
    '../a3prep/slotAuthority.js',
    '../a3prep/contracts.js',
    '../continuationWindow/replacementLedger.js',
    '../continuationWindow/windowPlan.js',
    '../draw/deterministicDraw.js',
    '../draw/readFrozenFrame.js',
    '../a3governanceV2/commitLoader.js',
    '../a3governanceV2/refusal.js',
    '../a3governanceV4/registryV4.js',
    '../a3governanceV4/resolveV4.js',
    '../a3governanceV4/snapshotV4.js',
    '../a3crossGenerationSlotAuthority/chain.js',
    '../a3crossGenerationSlotAuthority/continuity.js',
    '../a3crossGenerationSlotAuthority/occupantIdentity.js',
    '../a3crossGenerationSlotAuthority/resolve.js',
    '../a3crossGenerationSlotAuthority/types.js',
    ...NAMESPACE_FILES.map((file) => `./${file.replace(/\.ts$/, '.js')}`),
  ]);

  it('imports nothing but crypto, the canonicalizer, and landed A3 / ledger / R38A modules', () => {
    for (const file of NAMESPACE_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        expect(PERMITTED_SPECIFIERS.has(specifier), `${file}: ${specifier}`).toBe(true);
      }
    }
  });

  it('opens no database, socket, provider, classifier runtime or sealed root, and writes nothing', () => {
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
      /orgunits\/classify\/(?!canonical\.js)/,
      /phase2b2d2c/,
      /methodology-v2-sealed|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout/,
      /writeFile|appendFile|mkdir|rmSync|unlink|createWriteStream/,
      /a3documents|a3graphs|a3samples|a3readiness|a3evidence|\/sd7\//,
      /Date\.now|new Date\(|Math\.random/,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('owns no git layer: reaches git only through R25’s frozen byte transport', () => {
    for (const file of NAMESPACE_FILES) {
      const source = code(file);
      expect(source, file).not.toContain('child_process');
      expect(source, file).not.toMatch(/\bexecFileSync\b|\bexecSync\b|\bspawn\b/);
    }
    const transport = NAMESPACE_FILES.filter((file) => code(file).includes('readCommittedBlobs'));
    expect(transport).toEqual(['commitLoaderV5.ts', 'freezeCrossCheck.ts']);
  });

  it('never enumerates, globs or picks "latest"', () => {
    const source = allCode();
    expect(source).not.toMatch(/readdir|glob\(|\blatest\(|\bHEAD\b['"]|ls-tree|rev-parse|origin\//);
  });

  it('calls the unchanged R38A resolver at exactly one site and restates no READY rule', () => {
    const calls = NAMESPACE_FILES.flatMap((file) =>
      [...code(file).matchAll(/resolveCrossGenerationSlotAuthorities\(/g)].map(() => file),
    );
    expect(calls).toEqual(['resolveV5.ts']);
    const source = allCode();
    expect(source).not.toMatch(
      /ISSUED_READY|A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY,\s*authorityVisibility/,
    );
    expect(source).not.toMatch(/status:\s*A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY/);
  });

  it('mints V5 authority only through a private WeakSet / WeakMap, after the resolution', () => {
    const snapshot = code('snapshotV5.ts');
    expect(snapshot).toMatch(/const MINTED_V5_SNAPSHOTS = new WeakSet<object>\(\);/);
    expect(snapshot).toMatch(/const V5_SNAPSHOT_BY_READY = new WeakMap</);
    expect(allCode()).not.toMatch(
      /export const MINTED_V5_SNAPSHOTS|export const V5_SNAPSHOT_BY_READY/,
    );
    expect(snapshot).toMatch(
      /export function loadCommittedA2GovernanceV5\(\s*repositoryRoot: string,\s*\)/,
    );
    const mint = snapshot.indexOf('MINTED_V5_SNAPSHOTS.add(');
    expect(mint).toBeGreaterThan(
      snapshot.indexOf('resolveCommittedA2GovernanceV5(repositoryRoot)'),
    );
  });

  it('uses R38A’s continuity bridge, never R26’s comparator, for cross-generation continuity', () => {
    const continuity = code('devTrainContinuity.ts');
    expect(continuity).toContain('compareR17WithCrossGenerationAuthorities(');
    expect(allCode()).not.toMatch(/authorityDelta|compareDevTrainReadyAuthorities/);
  });
});

describe.skipIf(!baseAvailable)(
  '2D-A3 R38B: nothing R39-, Governance-V6- or A5-shaped exists',
  () => {
    it('created no R39 namespace or record, no V6 namespace, no A5 freeze (tree at R38B_TERMINAL)', () => {
      const tree = lines(git('ls-tree', '-r', '--name-only', R38B_TERMINAL));
      expect(tree.filter((path) => path.startsWith(`${HARNESS}/a3governanceV6/`))).toEqual([]);
      const harnessEntries = [
        ...new Set(
          tree
            .filter((path) => path.startsWith(`${HARNESS}/`))
            .map((path) => path.slice(HARNESS.length + 1).split('/')[0]!),
        ),
      ];
      expect(harnessEntries.filter((name) => /r39|V6/i.test(name))).toEqual([]);
      const docs = tree
        .filter((path) => path.startsWith('docs/evaluation/') || path.startsWith('docs/audits/'))
        .map((path) => path.slice(path.lastIndexOf('/') + 1));
      expect(
        docs.filter((name) => /A3_R39|GOVERNANCE_AUTHORITY_CENSUS_V6|A5_.*FREEZE/.test(name)),
      ).toEqual([]);
    });
  },
);

describe.skipIf(!existsSync(join(REPO_ROOT, CENSUS)))(
  '2D-A3 R38B: public disclosure firewall',
  () => {
    const census = existsSync(join(REPO_ROOT, CENSUS))
      ? readFileSync(join(REPO_ROOT, CENSUS), 'utf8')
      : '';
    const audit = existsSync(join(REPO_ROOT, AUDIT))
      ? readFileSync(join(REPO_ROOT, AUDIT), 'utf8')
      : '';
    /** Public governance-record file digests the census and audit may name. */
    const PUBLIC_RECORD_DIGESTS = new Set([
      '7cf59593d06ba77cf29206120496c3e642acccd28a580b1b13b7d5181fc9dec0',
      'dc3f96120edcc9f37fa4e26034d4df1bae576b7289e8d2ad93e26fdb414c7942',
      'ea2cac540d17aaf29b5e88b2f9a83b77617f783d6255a86a10f91de3b8b6641e',
      'deee711b6eac66bccec51afee49615b71b94d0701b110a3abd50c1c12207f165',
      'c02e37ac42515cb689512b12425c41560fffeb32592e4e15f864892f63208ec8',
    ]);

    it.each([
      ['census', census],
      ['audit', audit],
    ])('the %s publishes no identity, digest of an identity, or per-slot field', (_name, text) => {
      expect(text.length).toBeGreaterThan(0);
      for (const digest of text.match(/\b[0-9a-f]{64}\b/g) ?? []) {
        expect(PUBLIC_RECORD_DIGESTS.has(digest), digest).toBe(true);
      }
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
      expect(text).not.toMatch(/\b[A-Z]{1,3}\s+[A-Z][A-Z-]*\d{2}\|\d{6,}/);
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toMatch(/"selectionIndex"|"echeRowKey"|"organisationId"|"runRefSha256"/);
      expect(text).not.toMatch(/G2[PR]:\d|\bR:\d+:\d+|\bP:\d+\b/);
      expect(text).not.toMatch(/"file"\s*:|sd7[^\s"]*\.json|detail\.json/i);
    });

    it('the census authorises nothing and ends at the R38B success terminal', () => {
      const record = JSON.parse(census) as Record<string, unknown>;
      expect(record.thisFileAuthorises).toEqual([]);
      expect(record.isLiveAuthority).toBe(false);
      expect(record.recordKind).toBe('PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CENSUS');
      expect(record.terminalState).toBe(
        'R38B_COMMITTED_GOVERNANCE_V5_COMPLETE_NEW_DEV_TRAIN_DELTA_REQUIRES_INCREMENTAL_EVIDENCE_BINDING',
      );
    });
  },
);

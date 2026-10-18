/**
 * TRACK B, B2.5-S0 - THE ISOLATION TEST FOR THE PROVISIONAL SUBJECT
 * SNAPSHOT-SCOPE MANIFEST
 * (`nwf-pe.discovery-subject-snapshot-scope-manifest.s0-provisional`).
 *
 * Per the phase-isolation convention this slice is pinned by its OWN file over
 * its OWN range, REPAIR_BASE_COMMIT (the accepted B2.4-R2 tip) to
 * REPAIR_TERMINAL_COMMIT. It proves, from the real git range and the real
 * source:
 *
 *   - the change set is EXACTLY three new production files under
 *     `src/orgunits/subjectSnapshot/`, one unit test and this firewall; B2.1,
 *     B2.2, B2.3, B2.4, B2.4-R2, B3.0, every earlier firewall and its terminal
 *     pin, every migration, the CLI and the dependencies are untouched;
 *   - the module is pure and self-contained: it imports `node:crypto` and its
 *     own siblings only - no validator, registry, review protocol, evidence
 *     projection, protected-cohort guard, database, socket, file or clock;
 *   - nothing in production imports it, and it names no B2.4 contract;
 *   - it can state no completeness, freshness, authentication, protection
 *     clearance, permission or canonical identifier.
 * What cannot be proven statically (determinism, content binding, refusals,
 * omissions, forgeries, mutation detection) is proven by
 * discoverySubjectSnapshotScopeB25S0.test.ts.
 *
 * THE RANGE IS OPEN to the working tree while the slice is uncommitted; the
 * terminal pin belongs to a separately authorised commit-closure phase.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as snapshotContract from '../../orgunits/subjectSnapshot/contract.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B2.4-R2 tip (implementation 5813408 + firewall pin). */
const REPAIR_BASE_COMMIT = '4ff16975b0eb14a54d0289f14a42cfb061c81abd';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = 'f28382f92eb42f2b0114651b4b4cbad6637089cd';

const SNAPSHOT_DIR = 'src/orgunits/subjectSnapshot/';
const PRODUCTION_FILES = [
  'src/orgunits/subjectSnapshot/canonical.ts',
  'src/orgunits/subjectSnapshot/contract.ts',
  'src/orgunits/subjectSnapshot/manifest.ts',
];
const UNIT_TEST = 'src/test/unit/discoverySubjectSnapshotScopeB25S0.test.ts';
const FIREWALL = 'src/test/firewall/phase2bSubjectSnapshotScopeS0.firewall.test.ts';

/**
 * B2.5-P1a (OWNER-authorised exact-path exception, 2026-10-17): the ONE
 * production file that may import this module - the transaction-bound
 * snapshot assembler - by exactly these two imports (named, closed lists) and
 * ONE builder call. Never the reference comparison, and no other importer.
 */
const B25_P1A_ASSEMBLER = 'src/orgunits/subjectSnapshotRead/assemble.ts';
const B25_P1A_SNAPSHOT_FORMS = [
  /import \{\s*PROTECTION_CHECK,\s*SNAPSHOT_SCOPE_CONTRACT,\s*UUID,\s*type CategoryDeclaration,\s*type ScopeCategory,\s*type SnapshotScopeRefusalCode,\s*\} from '\.\.\/subjectSnapshot\/contract\.js';/,
  /import \{\s*buildSnapshotScopeManifest,\s*type SnapshotScopeInput,\s*type SnapshotScopeManifest,\s*\} from '\.\.\/subjectSnapshot\/manifest\.js';/,
  /\bconst built = buildSnapshotScopeManifest\(input\);/,
];

const AUTHORISED_CHANGESET = [
  ...PRODUCTION_FILES.map((f) => `A\t${f}`),
  `A\t${UNIT_TEST}`,
  `A\t${FIREWALL}`,
].sort();

/** Paths this slice may not touch at all. */
const PROTECTED_PATHS = [
  'src/orgunits/identity/',
  'src/orgunits/subjectRegistry/',
  'src/orgunits/subjectReview/',
  'src/orgunits/subjectHandoff/',
  'src/orgunits/orchestrator/',
  'src/orgunits/classify/',
  'src/orgunits/web/',
  'src/orgunits/signals/',
  'src/cli/',
  'src/db/',
  'src/config/',
  'src/test/helpers/',
  'migrations/',
  'scripts/',
  'docs/',
  'package.json',
  'package-lock.json',
];

/** Every earlier Track B firewall keeps its bytes and its terminal pin. */
const EARLIER_TERMINAL_PINS: Readonly<Record<string, string>> = {
  'src/test/firewall/phase2bResearchCohortGuard.firewall.test.ts': '9b3c4e7',
  'src/test/firewall/phase2bDiscoverySubjectIdentity.firewall.test.ts': 'ee39c7a',
  'src/test/firewall/phase2bDiscoverySubjectRegistry.firewall.test.ts': '4189d1e',
  'src/test/firewall/phase2bOwnerAttestedReview.firewall.test.ts': 'fe00ae0',
  'src/test/firewall/phase2bSubjectEvidenceProjection.firewall.test.ts': '766530c',
  'src/test/firewall/phase2bSubjectEvidenceInputFindingsR2.firewall.test.ts': '5813408',
};

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

const rangeAvailable =
  commitExists(REPAIR_BASE_COMMIT) &&
  (REPAIR_TERMINAL_COMMIT === null || commitExists(REPAIR_TERMINAL_COMMIT));

const range = (): string[] =>
  REPAIR_TERMINAL_COMMIT === null
    ? [REPAIR_BASE_COMMIT]
    : [REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT];

/** `--name-status` lines over the range, plus untracked files as `A` while the range is open. */
function changeset(...paths: string[]): string[] {
  const tracked = execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '--name-status', '--find-renames', ...range(), '--', ...paths],
    { encoding: 'utf8' },
  );
  const untracked =
    REPAIR_TERMINAL_COMMIT === null
      ? execFileSync(
          'git',
          ['-C', REPO_ROOT, 'ls-files', '--others', '--exclude-standard', '--', ...paths],
          { encoding: 'utf8' },
        )
          .split('\n')
          .filter((l) => l.length > 0)
          .map((l) => `A\t${l}`)
          .join('\n')
      : '';
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0))].sort();
}

const baseSourceOf = (path: string): string =>
  execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_BASE_COMMIT}:${path}`], {
    encoding: 'utf8',
  });

function sourceOf(path: string): string {
  if (REPAIR_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_TERMINAL_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

const codeOf = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const importsOf = (path: string): string[] =>
  [...codeOf(sourceOf(path)).matchAll(/from '([^']+)'/g)].map((m) => m[1]!).sort();

/** Every production TypeScript file (non-test) under `src/`, in the working tree. */
function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (full === join(REPO_ROOT, 'src', 'test')) continue;
        walk(full);
      } else if (name.endsWith('.ts')) {
        out.push(relative(REPO_ROOT, full).split('\\').join('/'));
      }
    }
  };
  walk(join(REPO_ROOT, 'src'));
  return out.sort();
}

/**
 * B2.5-P1a: the production files AS S0 LEFT THEM (the pinned terminal tree)
 * whose raw text matches `pattern` - a pre-filter only, one `git grep`, so
 * `codeOf` still decides exactly as the working-tree check does.
 */
function pinnedProductionFilesMatching(pattern: RegExp): string[] {
  if (REPAIR_TERMINAL_COMMIT === null) return productionFiles();
  const grep = spawnSync(
    'git',
    ['-C', REPO_ROOT, 'grep', '-l', '-E', pattern.source, REPAIR_TERMINAL_COMMIT, '--', 'src'],
    { encoding: 'utf8' },
  );
  if (grep.status !== 0 && grep.status !== 1) throw new Error(`git grep: ${grep.stderr}`);
  return grep.stdout
    .split('\n')
    .map((l) => l.slice(REPAIR_TERMINAL_COMMIT.length + 1))
    .filter((f) => f.endsWith('.ts') && !f.startsWith('src/test/'))
    .sort();
}

const describeRange = rangeAvailable ? describe : describe.skip;

describeRange('B2.5-S0 snapshot-scope manifest: the change stays inside its scope', () => {
  it('changes exactly the authorised files, by path and status', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('touches no earlier slice, migration, CLI, helper, governance record or dependency', () => {
    expect(changeset(...PROTECTED_PATHS)).toEqual([]);
  });

  it('adds exactly one firewall, and every earlier Track B firewall keeps its bytes and terminal pin', () => {
    expect(changeset('src/test/firewall/')).toEqual([`A\t${FIREWALL}`]);
    for (const [file, pin] of Object.entries(EARLIER_TERMINAL_PINS)) {
      expect(sourceOf(file), file).toBe(baseSourceOf(file));
      expect(sourceOf(file), file).toMatch(
        new RegExp(`const REPAIR_TERMINAL_COMMIT: string \\| null = '${pin}[0-9a-f]{33}';`),
      );
    }
  });

  it('edits no existing unit test: the B2.1-B2.4-R2 tests that pin document bytes stay as accepted', () => {
    expect(changeset('src/test/unit/')).toEqual([`A\t${UNIT_TEST}`]);
  });
});

describe('B2.5-S0 snapshot-scope manifest: pure, self-contained, unconnected', () => {
  it('consists of exactly the three approved production files, outside the B2.4 boundary', () => {
    expect(productionFiles().filter((f) => f.startsWith(SNAPSHOT_DIR))).toEqual(PRODUCTION_FILES);
    expect(productionFiles().filter((f) => f.startsWith('src/orgunits/subjectHandoff/'))).toEqual([
      'src/orgunits/subjectHandoff/contract.ts',
      'src/orgunits/subjectHandoff/findings.ts',
      'src/orgunits/subjectHandoff/project.ts',
    ]);
  });

  it('imports exactly its allow-list: node:crypto and its own siblings', () => {
    expect(importsOf('src/orgunits/subjectSnapshot/contract.ts')).toEqual([]);
    expect(importsOf('src/orgunits/subjectSnapshot/canonical.ts')).toEqual([
      './contract.js',
      'node:crypto',
    ]);
    expect(importsOf('src/orgunits/subjectSnapshot/manifest.ts')).toEqual([
      './canonical.js',
      './contract.js',
    ]);
  });

  it('opens no socket, database or file, reads no environment and no clock, draws no randomness', () => {
    for (const file of PRODUCTION_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/node:(net|tls|http|https|dns|fs|child_process|os)\b/);
      expect(code, file).not.toMatch(/\bfetch\s*\(|from 'pg'|\/db\/|\bPool\b|\.query\s*\(/);
      expect(code, file).not.toMatch(/process\.env|readFile|writeFile|createReadStream/);
      expect(code, file).not.toMatch(/Date\.now\(|new Date\(|Date\.parse|performance\.now/);
      expect(code, file).not.toMatch(/Math\.random|randomUUID|randomBytes|getRandomValues/);
      expect(code, file).not.toMatch(
        /\b(SELECT|INSERT|UPDATE|DELETE|TRUNCATE)\s+(INTO|FROM|\w+\s+SET)/,
      );
    }
  });

  it('holds no key, signs nothing, verifies no signature and establishes no reviewer trust', () => {
    for (const file of PRODUCTION_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /createPrivateKey|createPublicKey|generateKeyPair|\bsign\s*\(|\bverify\s*\(|ed25519|PRIVATE KEY/i,
      );
      expect(code, file).not.toMatch(
        /ReviewTrustSet|ephemeralForVitest|testSeam|TrustedReviewerContext|VerifiedReviewEnvelope/,
      );
    }
  });

  it('reuses no earlier slice: no validator, registry, review protocol, projection or cohort guard', () => {
    for (const file of PRODUCTION_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /subjectRegistry|subjectReview|subjectHandoff|discoverySubjects|\.\.\/identity\/|orgunits\/identity/,
      );
      expect(code, file).not.toMatch(
        /researchCohortGuard|evaluationCohortGuard|loadEvaluationCohort|enforceRootResearchEligibility|HOLDOUT|DEV_TRAIN|DEV_CONFIRM/,
      );
      expect(code, file).not.toMatch(
        /orgunits\/(classify|orchestrator|web|signals)|\.\.\/(classify|orchestrator|web|signals)\/|claude-agent-sdk|anthropic|executeWebAttempt|runOrganisationDiscovery/i,
      );
      // It names neither the B2.4 companion nor the I0 compatibility contract.
      expect(code, file).not.toMatch(
        /discovery-subject-evidence|discovery-identity-handoff|nwf-identity\./,
      );
    }
  });

  it('has no production importer and no CLI exposure', () => {
    const naming =
      /subjectSnapshot|snapshot-scope-manifest|buildSnapshotScopeManifest|compareSnapshotScopeWithReference/;
    // HISTORICAL (S0 as accepted, over its pinned tree): nothing outside the
    // module named it at all. The pre-filter must see the module itself.
    const pinned = pinnedProductionFilesMatching(naming);
    expect(pinned.filter((f) => f.startsWith(SNAPSHOT_DIR)).length).toBeGreaterThan(0);
    for (const file of pinned) {
      if (file.startsWith(SNAPSHOT_DIR)) continue;
      expect(codeOf(sourceOf(file)), file).not.toMatch(naming);
    }
    // CURRENT (working tree): the same, except that exactly the B2.5-P1a
    // assembler may use exactly the forms above. The original check then runs
    // on what remains, so any other import, call or importer still fails.
    for (const file of productionFiles()) {
      if (file.startsWith(SNAPSHOT_DIR)) continue;
      let code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));
      if (file === B25_P1A_ASSEMBLER) {
        for (const form of B25_P1A_SNAPSHOT_FORMS) code = code.replace(form, '');
      }
      expect(code, file).not.toMatch(naming);
    }
  });

  it('issues no canonical identifier and asserts no equivalence', () => {
    for (const file of PRODUCTION_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/[`'"](cand|chn|opp):/);
      expect(code, file).not.toMatch(
        /SAME_ACTOR|sameActor|mergedInto|MERGED_INTO|equivalentTo|EQUIVALENT_TO|identityRegister|nwf_identity/,
      );
    }
  });

  it('can state no completeness, freshness, authentication, protection clearance or grant', () => {
    for (const file of PRODUCTION_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /'COMPLETE'|'COMPLETED'|\bcomplete:|\bisComplete\b|'FRESH'|'CURRENT'|'AUTHENTICATED'|'VERIFIED'|'SIGNED'/,
      );
      expect(code, file).not.toMatch(
        /'CLEAR'|'CLEARED'|'NOT_PROTECTED'|'GRANTED'|'ALLOWED'|'ELIGIBLE'|'APPROVED'|granted:\s*true/,
      );
    }
    expect(snapshotContract.STATES.sourceCompleteness).toEqual(['NOT_PROVEN']);
    expect(snapshotContract.STATES.sourceFreshness).toEqual(['NOT_PROVEN']);
    expect(snapshotContract.STATES.sourceSnapshotVerification).toEqual(['NOT_VERIFIED']);
    expect(snapshotContract.STATES.exportAuthentication).toEqual(['UNAUTHENTICATED']);
    expect(snapshotContract.PROTECTION_CHECK).toBe('NOT_CONSULTED');
    expect(snapshotContract.PROTECTION_VERDICT).toBe('UNKNOWN');
    expect(Object.values(snapshotContract.PERMISSIONS)).toEqual(
      snapshotContract.PERMISSION_CAPABILITIES.map(() => 'NONE'),
    );
    expect(codeOf(sourceOf('src/orgunits/subjectSnapshot/contract.ts'))).toContain(
      "export type Permissions = { readonly [K in PermissionCapability]: 'NONE' };",
    );
  });

  it('adds a unit test with no skip, no focus, no timeout override and no trust seam', () => {
    const test = codeOf(sourceOf(UNIT_TEST));
    expect(test).not.toMatch(/\.(skip|only|todo)\(|describe\.skip|it\.skip|timeout/);
    expect(test).not.toMatch(
      /ReviewTrustSet\.ephemeralForVitest|OPERATIONAL_OWNER_REVIEW_KEYS\s*=|process\.env/,
    );
  });
});

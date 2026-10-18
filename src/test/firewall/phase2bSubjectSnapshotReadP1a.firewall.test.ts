/**
 * TRACK B, B2.5-P1a - THE ISOLATION TEST FOR THE TRANSACTION-BOUND
 * DISCOVERY-SUBJECT SNAPSHOT ASSEMBLER.
 *
 * Per the phase-isolation convention this slice is pinned by its OWN file over
 * its OWN range, REPAIR_BASE_COMMIT (the accepted B2.5-S0 terminal) to
 * REPAIR_TERMINAL_COMMIT. It proves, from the real git range and the real
 * source:
 *
 *   - the change set is EXACTLY one new production file, its unit and
 *     integration tests, this firewall, and three exact-path corrections to
 *     the B2.2, B2.3 and S0 firewalls' CURRENT-tree scans; S0's three files,
 *     B2.1-B2.4-R2, B3.0, every migration, the CLI and the dependencies are
 *     untouched, and every earlier terminal pin stands;
 *   - each correction admits exactly the one assembler file by exactly its
 *     import forms, keeps every historical (pinned-tree) assertion free of
 *     any exception, and adds or removes no test;
 *   - the assembler's runtime import closure is the SELECT-only store and the
 *     pure S0 module, nothing else; it creates no pool, reads no environment,
 *     issues only transaction-control and transaction-state SQL itself, holds
 *     no key, reads no protected cohort, runs no research or classifier, and
 *     can state no completeness, authentication, protection clearance,
 *     permission or canonical identifier;
 *   - nothing in production calls it.
 * Each static rule is also run against MUTATED copies of the source, so a
 * rule that could never fire is itself a failure (P1a-17). What cannot be
 * proven statically - one connection, one snapshot, concurrency, rollback -
 * is proven by the unit and integration tests named below.
 *
 * THE RANGE IS OPEN to the working tree while the slice is uncommitted; the
 * terminal pin belongs to a separately authorised commit-closure phase.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as assembler from '../../orgunits/subjectSnapshotRead/assemble.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B2.5-S0 terminal (implementation f28382f + firewall pin). */
const REPAIR_BASE_COMMIT = 'dee2d44767f58be00b7ea6e0c28979a4c249012f';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = '7d0e81db33b320ecef09ba622077b015f38270c7';

const ASSEMBLER_DIR = 'src/orgunits/subjectSnapshotRead/';
const ASSEMBLER = 'src/orgunits/subjectSnapshotRead/assemble.ts';
const UNIT_TEST = 'src/test/unit/discoverySubjectSnapshotReadB25P1a.test.ts';
const INTEGRATION_TEST = 'src/test/integration/discoverySubjectSnapshotReadB25P1a.test.ts';
const FIREWALL = 'src/test/firewall/phase2bSubjectSnapshotReadP1a.firewall.test.ts';
const B22_FIREWALL = 'src/test/firewall/phase2bDiscoverySubjectRegistry.firewall.test.ts';
const B23_FIREWALL = 'src/test/firewall/phase2bOwnerAttestedReview.firewall.test.ts';
const S0_FIREWALL = 'src/test/firewall/phase2bSubjectSnapshotScopeS0.firewall.test.ts';

const AUTHORISED_CHANGESET = [
  `A\t${ASSEMBLER}`,
  `A\t${UNIT_TEST}`,
  `A\t${INTEGRATION_TEST}`,
  `A\t${FIREWALL}`,
  `M\t${B22_FIREWALL}`,
  `M\t${B23_FIREWALL}`,
  `M\t${S0_FIREWALL}`,
].sort();

/** Paths this slice may not touch at all. */
const PROTECTED_PATHS = [
  'src/orgunits/identity/',
  'src/orgunits/subjectRegistry/',
  'src/orgunits/subjectReview/',
  'src/orgunits/subjectHandoff/',
  'src/orgunits/subjectSnapshot/',
  'src/orgunits/orchestrator/',
  'src/orgunits/classify/',
  'src/orgunits/web/',
  'src/orgunits/signals/',
  'src/orgunits/sitemap.ts',
  'src/cli/',
  'src/db/',
  'src/config/',
  'src/ingest/',
  'src/website/',
  'src/compare/',
  'src/test/helpers/',
  'src/test/integration/helpers.ts',
  'src/test/integration/cohortTestRegistry.ts',
  'migrations/',
  'scripts/',
  'docs/',
  'docker/',
  'docker-compose.yml',
  '.env.example',
  'package.json',
  'package-lock.json',
  'CLAUDE.md',
];

/** Every earlier Track B firewall keeps its terminal pin, by full SHA. */
const EARLIER_TERMINAL_PINS: Readonly<Record<string, string>> = {
  'src/test/firewall/phase2bResearchCohortGuard.firewall.test.ts':
    '9b3c4e71f19224e485c32c70dbf34b3c1a7fefdc',
  'src/test/firewall/phase2bDiscoverySubjectIdentity.firewall.test.ts':
    'ee39c7a9fee6a591e553c7db76a09eed7c391c90',
  [B22_FIREWALL]: '4189d1e0c160b6d1f89a61b89c5fc20477897d39',
  [B23_FIREWALL]: 'fe00ae0d4a096fda3c3f9386366ab9c82bb5fbfc',
  'src/test/firewall/phase2bSubjectEvidenceProjection.firewall.test.ts':
    '766530cce66ff61df2cf2dc8543f95e73f897ade',
  'src/test/firewall/phase2bSubjectEvidenceInputFindingsR2.firewall.test.ts':
    '5813408eaea4370e6854468b4bfeafd11a7966cf',
  [S0_FIREWALL]: 'f28382f92eb42f2b0114651b4b4cbad6637089cd',
};

/**
 * The EXACT edit to each corrected firewall: removed lines verbatim, added
 * lines by count and the SHA-256 of their `\n`-joined text, so any further
 * change to any of them fails here.
 */
const EARLIER_FIREWALL_EDITS: Readonly<
  Record<string, { removed: readonly string[]; added: number; addedSha256: string }>
> = {
  [B22_FIREWALL]: {
    removed: [],
    added: 12,
    addedSha256: '2b24653d8c2b097ef9501e746e5022bfa1a358b11a739d24a4207bee368e2cfc',
  },
  [B23_FIREWALL]: {
    removed: [],
    added: 12,
    addedSha256: 'a2b38209d8cc5147bdaf86d64090b3497edd7cf42265ab68df14b660b90a786a',
  },
  [S0_FIREWALL]: {
    removed: [
      "import { execFileSync } from 'node:child_process';",
      "      expect(codeOf(readFileSync(join(REPO_ROOT, file), 'utf8')), file).not.toMatch(",
      '        /subjectSnapshot|snapshot-scope-manifest|buildSnapshotScopeManifest|compareSnapshotScopeWithReference/,',
      '      );',
    ],
    added: 52,
    addedSha256: 'c3273ca9354377d64c7bfbb7b548e1466820a7bc4a3c124737d88f0381b05472',
  },
};

/** The exception forms each corrected firewall applies, restated here verbatim. */
const B22_B23_STORE_FORM =
  /import \{\s*databaseNow,\s*loadSubjectGraph,\s*MAX_SHARED_IDENTIFIER_HOLDERS,\s*\} from '\.\.\/subjectRegistry\/store\.js';/;
const S0_FORMS = [
  /import \{\s*PROTECTION_CHECK,\s*SNAPSHOT_SCOPE_CONTRACT,\s*UUID,\s*type CategoryDeclaration,\s*type ScopeCategory,\s*type SnapshotScopeRefusalCode,\s*\} from '\.\.\/subjectSnapshot\/contract\.js';/,
  /import \{\s*buildSnapshotScopeManifest,\s*type SnapshotScopeInput,\s*type SnapshotScopeManifest,\s*\} from '\.\.\/subjectSnapshot\/manifest\.js';/,
  /\bconst built = buildSnapshotScopeManifest\(input\);/,
];
const B22_FORBIDDEN = /subjectRegistry|discoverySubjects/;
const B23_FORBIDDEN =
  /subjectReview|subjectRegistry|appendAttestedReview|prepareReview|fromVerifiedEnvelope|VerifiedReviewEnvelope|ReviewTrustSet/;
const S0_FORBIDDEN =
  /subjectSnapshot|snapshot-scope-manifest|buildSnapshotScopeManifest|compareSnapshotScopeWithReference/;

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

/** The `-`/`+` content lines of one file's diff over the range. */
function diffLines(path: string): { removed: string[]; added: string[] } {
  const diff = execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '--unified=0', ...range(), '--', path],
    { encoding: 'utf8' },
  ).split('\n');
  return {
    removed: diff.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1)),
    added: diff.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)),
  };
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

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

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

/** Import statements, whitespace-collapsed, in source order. */
const importStatementsOf = (code: string): string[] =>
  [...code.matchAll(/^import[\s\S]*?from '[^']+';/gm)].map((m) => m[0].replace(/\s+/g, ' '));

/** The RUNTIME imports of one file: `import type` and all-`type` specifier lists are erased. */
function runtimeImportsOf(code: string): string[] {
  return [...code.matchAll(/^import\s+(type\s+)?([\s\S]*?)\s+from '([^']+)';/gm)]
    .filter((m) => {
      if (m[1] !== undefined) return false;
      const braces = /^\{([\s\S]*)\}$/.exec(m[2]!.trim());
      if (braces === null) return true;
      const names = braces[1]!
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n.length > 0);
      return !names.every((n) => n.startsWith('type '));
    })
    .map((m) => m[3]!);
}

/** The exact import statements the assembler may have. */
const ALLOWED_IMPORTS = [
  "import type pg from 'pg';",
  "import { databaseNow, loadSubjectGraph, MAX_SHARED_IDENTIFIER_HOLDERS, } from '../subjectRegistry/store.js';",
  "import { PROTECTION_CHECK, SNAPSHOT_SCOPE_CONTRACT, UUID, type CategoryDeclaration, type ScopeCategory, type SnapshotScopeRefusalCode, } from '../subjectSnapshot/contract.js';",
  "import { buildSnapshotScopeManifest, type SnapshotScopeInput, type SnapshotScopeManifest, } from '../subjectSnapshot/manifest.js';",
];

/** The four statements the assembler itself may send. Everything else is the loader's. */
const OWN_SQL = [
  "'SELECT transaction_timestamp() = statement_timestamp() AS no_open_block'",
  "'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'",
  "`SELECT current_setting('transaction_isolation') AS isolation,",
  "'ROLLBACK'",
];

/** Rules over the assembler's comment-stripped code; each returns its name when broken. */
const RULES: readonly (readonly [string, (code: string) => boolean])[] = [
  ['imports', (c) => JSON.stringify(importStatementsOf(c)) !== JSON.stringify(ALLOWED_IMPORTS)],
  ['dynamic-import', (c) => /\bimport\s*\(|\brequire\s*\(/.test(c)],
  [
    'own-pool-or-environment',
    (c) =>
      /new\s+(?:pg\.)?(?:Pool|Client)\b|createPool|connectionString|process\.env|DATABASE_URL|\benv\(\)|config\/env|db\/client/.test(
        c,
      ),
  ],
  [
    'socket-file-clock-randomness',
    (c) =>
      /node:(net|tls|http|https|dns|fs|child_process|os|worker_threads)\b|\bfetch\s*\(|Date\.now\(|new Date\(|performance\.now|Math\.random|randomUUID|randomBytes/.test(
        c,
      ),
  ],
  [
    'mutating-or-session-sql',
    (c) =>
      /\b(INSERT|UPDATE|DELETE|TRUNCATE|COPY|LOCK|GRANT|REVOKE|CREATE|ALTER|DROP|COMMIT|SAVEPOINT|PREPARE|LISTEN|NOTIFY|DISCARD|RESET)\b|\bSET\s+(TRANSACTION|SESSION|LOCAL|ROLE)\b|\bFROM\s+[a-z_]+/.test(
        c,
      ),
  ],
  [
    'own-table-access',
    (c) =>
      /discovery_subject|subject_review|organisations|orgunit_|website_claims|ewp_|schema_migrations|pg_stat/.test(
        c,
      ),
  ],
  ['own-sql-set', (c) => !OWN_SQL.every((s) => c.includes(s))],
  ['one-connect', (c) => (c.match(/\.connect\(/g) ?? []).length !== 1],
  ['rollback-end', (c) => !c.includes("const END_READ_SNAPSHOT = 'ROLLBACK';")],
  [
    'review-signing-trust-or-write',
    (c) =>
      /createPrivateKey|createPublicKey|generateKeyPair|\bsign\s*\(|\bverify\s*\(|ed25519|ReviewTrustSet|ephemeralForVitest|testSeam|TrustedReviewerContext|VerifiedReviewEnvelope|appendAttestedReview|prepareReview|recordReview|execute(?:Propose|Claim|Relate)|verifyReviewAttestations|effectiveReviewProjection|deriveSubjectReadModel|loadReviewAttestations|loadSubjectPage/.test(
        c,
      ),
  ],
  [
    'cohort-research-classifier',
    (c) =>
      /researchCohortGuard|evaluationCohortGuard|loadEvaluationCohort|loadCohortRegistry|enforceRootResearchEligibility|HOLDOUT|DEV_TRAIN|orgunits\/(classify|orchestrator|web|signals)|\.\.\/(classify|orchestrator|web|signals|identity|subjectReview|subjectHandoff)\/|claude-agent-sdk|anthropic|executeWebAttempt|runOrganisationDiscovery|runRootAcquisition|validateIdentityGraph/.test(
        c,
      ),
  ],
  [
    'canonical-identity-or-cross-track-contract',
    (c) =>
      /[`'"](cand|chn|opp):|SAME_ACTOR|sameActor|identityRegister|nwf_identity|discovery-identity-handoff|nwf-identity\.|discovery-subject-evidence|compareSnapshotScopeWithReference/.test(
        c,
      ),
  ],
  [
    'stronger-state',
    (c) =>
      /'COMPLETE'|'COMPLETED'|\bisComplete\b|'FRESH'|'CURRENT'|'AUTHENTICATED'|'VERIFIED'|'SIGNED'|'CLEAR'|'CLEARED'|'NOT_PROTECTED'|'GRANTED'|'ALLOWED'|'ELIGIBLE'|'APPROVED'|granted:\s*true|'EXHAUSTIVE_AS_DECLARED'|'TRUNCATED'|'INCOMING'|'SYNTHETIC_IN_MEMORY'|'CALLER_ASSERTED_RAN'/.test(
        c,
      ),
  ],
  [
    'gap-declared-represented',
    (c) =>
      /(INCOMING_RELATIONSHIP_CLAIMS|SHARED_IDENTIFIER_HOLDERS|RECORD_SCOPED_FINDINGS|INPUT_SCOPED_FINDINGS|NEIGHBOUR_RECORD_FINDINGS|VALIDATION_INPUTS|SOURCE_GLOBALS|PROTECTION_STATUS):\s*'REPRESENTED'/.test(
        c,
      ),
  ],
  [
    'fixed-input-shape',
    (c) =>
      ![
        "inputOrigin: 'CALLER_SUPPLIED_UNVERIFIED',",
        'findings: [],',
        "execution: 'NOT_RUN',",
        'ruleVersion: null,',
        "relationshipDirectionsExamined: ['OUTGOING'],",
        "enumeration: 'UNKNOWN',",
        'protectionCheck: PROTECTION_CHECK,',
      ].every((s) => c.includes(s)),
  ],
  [
    'exported-functions',
    (c) =>
      JSON.stringify([...c.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1])) !==
      JSON.stringify(['assembleSubjectSnapshotScope']),
  ],
];

const violationsOf = (source: string): string[] =>
  RULES.filter(([, broken]) => broken(codeOf(source))).map(([name]) => name);

/** The order the transaction protocol must keep inside `readGraphInOneSnapshot`. */
const PROTOCOL_ORDER = [
  'await source.connect();',
  'connection.query<{ no_open_block: boolean }>(NO_OPEN_TRANSACTION_BLOCK)',
  "'CONNECTION_IN_OPEN_TRANSACTION',",
  'await connection.query(BEGIN_READ_SNAPSHOT);',
  'const start = await readSnapshotState(connection);',
  'graph = await loadSubjectGraph(connection, focalSubjectId, {',
  'asOf: await databaseNow(connection),',
  'const end = await readSnapshotState(connection);',
  'end.started !== start.started || end.snapshot !== start.snapshot',
  'await connection.query(END_READ_SNAPSHOT);',
  'connection.release();',
];

const describeRange = rangeAvailable ? describe : describe.skip;

describeRange('B2.5-P1a snapshot assembler: the change stays inside its scope', () => {
  it('changes exactly the authorised files, by path and status', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('touches no S0 file, earlier slice, migration, CLI, helper, governance record or dependency', () => {
    expect(changeset(...PROTECTED_PATHS)).toEqual([]);
  });

  it('edits exactly three earlier firewalls, each by exactly its recorded lines', () => {
    expect(changeset('src/test/firewall/')).toEqual(
      [`A\t${FIREWALL}`, `M\t${B22_FIREWALL}`, `M\t${B23_FIREWALL}`, `M\t${S0_FIREWALL}`].sort(),
    );
    for (const [file, edit] of Object.entries(EARLIER_FIREWALL_EDITS)) {
      const { removed, added } = diffLines(file);
      expect(removed, file).toEqual(edit.removed);
      expect(added.length, file).toBe(edit.added);
      expect(sha256(added.join('\n')), file).toBe(edit.addedSha256);
      expect(added.join('\n'), file).not.toMatch(
        /\.(skip|only|todo|skipIf|runIf)\b|timeout|\bcatch\b|try\s*\{|expect\.soft|process\.env/i,
      );
    }
  });

  it('keeps every earlier terminal pin and base commit, and every unedited firewall byte-identical', () => {
    for (const [file, pin] of Object.entries(EARLIER_TERMINAL_PINS)) {
      const line = `const REPAIR_TERMINAL_COMMIT: string | null = '${pin}';`;
      expect(sourceOf(file), file).toContain(line);
      expect(baseSourceOf(file), file).toContain(line);
      const base = /const REPAIR_BASE_COMMIT = '[0-9a-f]{40}';/.exec(baseSourceOf(file))![0];
      expect(sourceOf(file), file).toContain(base);
      if (!(file in EARLIER_FIREWALL_EDITS)) {
        expect(sourceOf(file), file).toBe(baseSourceOf(file));
      }
    }
  });

  it('adds or removes no test in any corrected firewall', () => {
    const tests = (source: string) => (codeOf(source).match(/\bit\(/g) ?? []).length;
    for (const file of Object.keys(EARLIER_FIREWALL_EDITS)) {
      expect(tests(sourceOf(file)), file).toBe(tests(baseSourceOf(file)));
    }
  });

  it('edits no existing unit or integration test', () => {
    expect(changeset('src/test/unit/')).toEqual([`A\t${UNIT_TEST}`]);
    expect(changeset('src/test/integration/')).toEqual([`A\t${INTEGRATION_TEST}`]);
  });
});

describe('B2.5-P1a historical firewall corrections: one exact path, historical claims intact', () => {
  const b22 = codeOf(sourceOf(B22_FIREWALL));
  const b23 = codeOf(sourceOf(B23_FIREWALL));
  const s0 = codeOf(sourceOf(S0_FIREWALL));

  it('admits exactly the one assembler file, by name, in each corrected firewall', () => {
    for (const [name, code] of [
      ['B2.2', b22],
      ['B2.3', b23],
      ['S0', s0],
    ] as const) {
      expect(code, name).toContain(`const B25_P1A_ASSEMBLER = '${ASSEMBLER}';`);
      expect(code.match(/B25_P1A_ASSEMBLER/g), name).toHaveLength(2);
      expect(code.match(/subjectSnapshotRead/g), name).toHaveLength(1);
      expect(code, name).not.toMatch(/startsWith\([^)]*subjectSnapshotRead|subjectSnapshotRead\/'/);
    }
  });

  it('restates each exception form verbatim, and names no writer, reviewer, signer or comparison there', () => {
    for (const code of [b22, b23]) {
      expect(code).toContain(`const B25_P1A_STORE_IMPORT =\n  ${B22_B23_STORE_FORM.toString()};`);
      expect(code).toContain(
        "if (file === B25_P1A_ASSEMBLER) code = code.replace(B25_P1A_STORE_IMPORT, '');",
      );
    }
    for (const form of S0_FORMS) expect(s0).toContain(form.toString());
    for (const code of [b22, b23, s0]) {
      const start = code.indexOf('const B25_P1A_ASSEMBLER');
      const declarations = code.slice(start, code.indexOf('const AUTHORISED_CHANGESET', start));
      expect(declarations.length).toBeGreaterThan(0);
      expect(declarations).not.toMatch(
        /writer|readModel|reviewAuthority|reviewEvidence|reviewAttestation|requests\.js|subjectReview|signer|verify|compareSnapshotScopeWithReference|testSeam|ephemeralForVitest/,
      );
    }
  });

  it('keeps every historical (pinned-tree) loop free of any P1a exception', () => {
    for (const [file, code, historical] of [
      [B22_FIREWALL, b22, 'for (const file of productionFilesOfThisSlice()) {'],
      [B23_FIREWALL, b23, 'for (const file of productionFilesOfThisSlice()) {'],
      [S0_FIREWALL, s0, 'for (const file of pinned) {'],
    ] as const) {
      const at = code.indexOf(historical);
      const current = code.indexOf('for (const file of productionFiles()) {', at);
      expect(at, file).toBeGreaterThan(-1);
      expect(current, file).toBeGreaterThan(at);
      expect(code.slice(at, current), file).not.toMatch(/B25_|B24_|subjectSnapshotRead/);
      expect(code.slice(at, current), file).toContain('codeOf(sourceOf(file))');
    }
  });

  it('would still fail a widened assembler: each exception removes only its own forms (P1a-17)', () => {
    const real = codeOf(sourceOf(ASSEMBLER));
    const exempted = {
      b22: (c: string) => c.replace(B22_B23_STORE_FORM, ''),
      s0: (c: string) => S0_FORMS.reduce((acc, f) => acc.replace(f, ''), c),
    };
    // The real assembler passes all three, exactly as the corrected scans see it.
    expect(exempted.b22(real)).not.toMatch(B22_FORBIDDEN);
    expect(exempted.b22(real)).not.toMatch(B23_FORBIDDEN);
    expect(exempted.s0(real)).not.toMatch(S0_FORBIDDEN);
    const store =
      "import { databaseNow, loadSubjectGraph, MAX_SHARED_IDENTIFIER_HOLDERS } from '../subjectRegistry/store.js';";
    for (const added of [
      "import { executeClaim } from '../subjectRegistry/writer.js';",
      "import { deriveSubjectReadModel } from '../subjectRegistry/readModel.js';",
      "import { TrustedReviewerContext } from '../subjectRegistry/reviewAuthority.js';",
      "import { loadReviewAttestations } from '../subjectRegistry/store.js';",
    ]) {
      expect(exempted.b22(`${real}\n${added}`), added).toMatch(B22_FORBIDDEN);
      expect(exempted.b22(`${real}\n${added}`), added).toMatch(B23_FORBIDDEN);
    }
    for (const added of [
      "import { signRawPayload } from '../subjectReview/signer.js';",
      "import { ReviewTrustSet } from '../subjectReview/trust.js';",
    ]) {
      expect(exempted.b22(`${real}\n${added}`), added).toMatch(B23_FORBIDDEN);
    }
    // A widened store import (one more name) is no longer the admitted form.
    const widened = real.replace(
      B22_B23_STORE_FORM,
      store.replace('databaseNow,', 'databaseNow, subjectExists,'),
    );
    expect(exempted.b22(widened)).toMatch(B22_FORBIDDEN);
    for (const added of [
      "import { compareSnapshotScopeWithReference } from '../subjectSnapshot/manifest.js';",
      'const again = buildSnapshotScopeManifest(input);',
      "import { manifestCanonicalJson } from '../subjectSnapshot/canonical.js';",
    ]) {
      expect(exempted.s0(`${real}\n${added}`), added).toMatch(S0_FORBIDDEN);
    }
  });
});

describe('B2.5-P1a snapshot assembler: narrow, read-only, unconnected', () => {
  const source = sourceOf(ASSEMBLER);

  it('is exactly one production file', () => {
    expect(productionFiles().filter((f) => f.startsWith(ASSEMBLER_DIR))).toEqual([ASSEMBLER]);
  });

  it('breaks none of its static rules', () => {
    expect(violationsOf(source)).toEqual([]);
  });

  it('has exactly the reviewed runtime import closure: the SELECT-only store and pure S0', () => {
    const closure = new Set<string>();
    const external = new Set<string>();
    const stack = [ASSEMBLER];
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (closure.has(file)) continue;
      closure.add(file);
      for (const target of runtimeImportsOf(codeOf(readFileSync(join(REPO_ROOT, file), 'utf8')))) {
        if (!target.startsWith('.')) {
          external.add(target);
          continue;
        }
        stack.push(normalize(join(dirname(file), target)).replace(/\.js$/, '.ts'));
      }
    }
    expect([...closure].sort()).toEqual(
      [
        ASSEMBLER,
        'src/orgunits/subjectRegistry/store.ts',
        'src/orgunits/subjectSnapshot/canonical.ts',
        'src/orgunits/subjectSnapshot/contract.ts',
        'src/orgunits/subjectSnapshot/manifest.ts',
        // B2.5-V1 (current tree only): the pure, unmodified B2.1 validator.
        'src/orgunits/identity/admissibility.ts',
        'src/orgunits/identity/validate.ts',
        'src/orgunits/identity/vocabulary.ts',
        // B2.5-M1 (current tree only): the pure, provisional acquisition companion.
        'src/orgunits/subjectReadProvenance/companion.ts',
        'src/orgunits/subjectReadProvenance/contract.ts',
      ].sort(),
    );
    expect([...external]).toEqual(['node:crypto']);
    // The store it reaches is SELECT-only and imports nothing at run time.
    const store = codeOf(
      readFileSync(join(REPO_ROOT, 'src/orgunits/subjectRegistry/store.ts'), 'utf8'),
    );
    expect(runtimeImportsOf(store)).toEqual([]);
    expect(store).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|BEGIN|COMMIT)\b/);
  });

  it('keeps the transaction protocol in its enforced order', () => {
    const code = codeOf(source);
    const body = code.slice(code.indexOf('async function readGraphInOneSnapshot('));
    const at = PROTOCOL_ORDER.map((s) => body.indexOf(s));
    expect(
      at.every((i) => i >= 0),
      JSON.stringify(at),
    ).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(body).toContain("if (phase === 'OPEN') discard = !(await endAfterError(connection));");
    // R1: every failure outside the assembler's own open transaction discards, unended.
    expect(body).toContain('let discard = true;');
    expect(body).not.toContain("phase === 'ENDING') discard");
  });

  it('exports exactly its reviewed surface, and no graph-to-input mapping', () => {
    expect(Object.keys(assembler).sort()).toEqual(
      [
        'SCOPE_DECLARATIONS',
        'SCOPE_DECLARATION_BASIS',
        'SNAPSHOT_READ_FACTS',
        'SNAPSHOT_READ_REFUSAL_CODES',
        'SubjectSnapshotReadRefusal',
        'assembleSubjectSnapshotScope',
      ].sort(),
    );
    expect(assembler.SNAPSHOT_READ_FACTS.durableSourceRevision).toBe('NONE');
    expect(assembler.SNAPSHOT_READ_FACTS.manifestBinding).toBe(
      'THESE_FACTS_ARE_NOT_COMMITTED_BY_THE_MANIFEST_DIGEST',
    );
  });

  it('has no production importer and no CLI exposure', () => {
    for (const file of productionFiles()) {
      if (file === ASSEMBLER) continue;
      expect(codeOf(readFileSync(join(REPO_ROOT, file), 'utf8')), file).not.toMatch(
        /subjectSnapshotRead|assembleSubjectSnapshotScope|SubjectSnapshotReadRefusal|SNAPSHOT_READ_FACTS/,
      );
    }
  });

  it('adds tests with no focus, no timeout override, no trust seam and no environment read', () => {
    for (const file of [UNIT_TEST, INTEGRATION_TEST]) {
      const test = codeOf(sourceOf(file));
      expect(test, file).not.toMatch(/\.(only|todo)\(|it\.skip|timeout|process\.env/);
      expect(test, file).not.toMatch(
        /ReviewTrustSet\.ephemeralForVitest|testSeam|OPERATIONAL_OWNER_REVIEW_KEYS\s*=|signRawPayload|signIntent/,
      );
      expect(test, file).not.toMatch(/\bfetch\s*\(|node:(net|tls|http|https|dns)\b|anthropic/);
    }
    expect(codeOf(sourceOf(UNIT_TEST))).not.toMatch(/describe\.skip/);
    // The integration test skips only when no test database is configured.
    expect(codeOf(sourceOf(INTEGRATION_TEST)).match(/describe\.skip/g)).toEqual(['describe.skip']);
    expect(codeOf(sourceOf(INTEGRATION_TEST))).toContain(
      "const describeDb = databaseConfigured() && testDatabaseUrl('readonly') ? describe : describe.skip;",
    );
  });
});

describe('B2.5-P1a snapshot assembler: every static rule can fire (P1a-17 mutation oracles)', () => {
  const source = sourceOf(ASSEMBLER);
  const inject = (line: string) =>
    source.replace("import type pg from 'pg';", `import type pg from 'pg';\n${line}`);
  const swap = (from: string, to: string) => {
    expect(source, from).toContain(from);
    return source.replace(from, to);
  };

  it.each([
    ['imports', inject("import { executeClaim } from '../subjectRegistry/writer.js';")],
    ['imports', inject("import { signRawPayload } from '../subjectReview/signer.js';")],
    [
      'imports',
      inject(
        "import { enforceRootResearchEligibility } from '../orchestrator/researchCohortGuard.js';",
      ),
    ],
    ['imports', inject("import { classify } from '../classify/run.js';")],
    [
      'imports',
      inject("import { deriveSubjectReadModel } from '../subjectRegistry/readModel.js';"),
    ],
    ['imports', swap('  databaseNow,\n', '  databaseNow,\n  loadReviewAttestations,\n')],
    ['dynamic-import', `${source}\nconst later = () => import('../subjectRegistry/writer.js');`],
    ['own-pool-or-environment', `${source}\nconst p = new pg.Pool({ connectionString: 'x' });`],
    ['own-pool-or-environment', `${source}\nconst url = process.env['DATABASE_URL_READONLY'];`],
    ['socket-file-clock-randomness', `${source}\nconst t = Date.now();`],
    ['mutating-or-session-sql', `${source}\nconst q = 'INSERT INTO x VALUES (1)';`],
    [
      'mutating-or-session-sql',
      swap("const END_READ_SNAPSHOT = 'ROLLBACK';", "const END_READ_SNAPSHOT = 'COMMIT';"),
    ],
    ['mutating-or-session-sql', `${source}\nconst q = 'SET TRANSACTION READ WRITE';`],
    ['own-table-access', `${source}\nconst q = 'SELECT id FROM discovery_subjects';`],
    ['own-sql-set', swap("'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'", "'BEGIN'")],
    ['one-connect', `${source}\nconst second = () => source.connect();`],
    [
      'rollback-end',
      swap("const END_READ_SNAPSHOT = 'ROLLBACK';", "const END_READ_SNAPSHOT = 'END';"),
    ],
    ['review-signing-trust-or-write', `${source}\nconst trust = ReviewTrustSet.operational();`],
    ['cohort-research-classifier', `${source}\nconst g = enforceRootResearchEligibility;`],
    ['cohort-research-classifier', `${source}\nconst v = validateIdentityGraph;`],
    ['canonical-identity-or-cross-track-contract', `${source}\nconst id = 'cand:x';`],
    [
      'canonical-identity-or-cross-track-contract',
      `${source}\nconst c = compareSnapshotScopeWithReference;`,
    ],
    ['stronger-state', swap("enumeration: 'UNKNOWN',", "enumeration: 'EXHAUSTIVE_AS_DECLARED',")],
    [
      'stronger-state',
      swap(
        "relationshipDirectionsExamined: ['OUTGOING'],",
        "relationshipDirectionsExamined: ['OUTGOING', 'INCOMING'],",
      ),
    ],
    [
      'stronger-state',
      swap("inputOrigin: 'CALLER_SUPPLIED_UNVERIFIED',", "inputOrigin: 'SYNTHETIC_IN_MEMORY',"),
    ],
    ['stronger-state', swap("execution: 'NOT_RUN',", "execution: 'CALLER_ASSERTED_RAN',")],
    ['stronger-state', `${source}\nconst s = 'AUTHENTICATED';`],
    [
      'gap-declared-represented',
      swap(
        "INCOMING_RELATIONSHIP_CLAIMS: 'UNKNOWN',",
        "INCOMING_RELATIONSHIP_CLAIMS: 'REPRESENTED',",
      ),
    ],
    [
      'gap-declared-represented',
      swap("PROTECTION_STATUS: 'UNKNOWN',", "PROTECTION_STATUS: 'REPRESENTED',"),
    ],
    ['fixed-input-shape', swap('findings: [],', 'findings: callerFindings,')],
    [
      'exported-functions',
      swap('function snapshotScopeInputOf(', 'export function snapshotScopeInputOf('),
    ],
  ])('fires %s on a mutated source', (rule, mutated) => {
    expect(mutated).not.toBe(source);
    expect(violationsOf(mutated)).toContain(rule);
  });

  it('fires on a reordered protocol: the loader before the state check', () => {
    const mutated = source
      .replace('    const start = await readSnapshotState(connection);\n', '')
      .replace(
        '    const end = await readSnapshotState(connection);\n',
        '    const end = await readSnapshotState(connection);\n    const start = end;\n',
      );
    expect(mutated).not.toBe(source);
    const code = codeOf(mutated);
    const body = code.slice(code.indexOf('async function readGraphInOneSnapshot('));
    const at = PROTOCOL_ORDER.map((s) => body.indexOf(s));
    expect(at.every((i) => i >= 0) && [...at].sort((a, b) => a - b).join() === at.join()).toBe(
      false,
    );
  });
});

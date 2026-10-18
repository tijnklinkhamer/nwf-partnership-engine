/**
 * TRACK B, B2.5-P1b - THE ISOLATION TEST FOR SHARED-IDENTIFIER HOLDER
 * ENUMERATION INTEGRITY.
 *
 * Per the phase-isolation convention this slice is pinned by its OWN file over
 * its OWN range, REPAIR_BASE_COMMIT (the accepted B2.5-P1a terminal) to
 * REPAIR_TERMINAL_COMMIT. It proves, from the real git range and the real
 * source:
 *
 *   - the change set is EXACTLY the B2.2 store, the P1a assembler, the P1a
 *     unit and integration tests (assertions that encoded the old ambiguity),
 *     two new tests and this firewall; no other file - no firewall, S0 file,
 *     earlier slice, migration, CLI or dependency - changes, and every earlier
 *     terminal pin stands;
 *   - each edited file removes exactly its recorded lines, so nothing else in
 *     it was weakened, and the P1a tests gain or lose no test;
 *   - the store stays SELECT-only with no runtime import, every SQL statement
 *     it sends is byte-identical to the base, its runtime exports are the
 *     base's, and the holder query runs with exactly one sentinel row beyond
 *     an unchanged cap of 20, includes only the first 20, and reports
 *     EXHAUSTIVE only when the sentinel is absent;
 *   - the assembler keeps P1a's imports, exports, transaction protocol and
 *     fixed shape, takes its holder declaration ONLY from the loader's
 *     reported outcome through one fixed mapping, never reconstructs holders
 *     from claims, and states nothing stronger anywhere else;
 *   - nothing in production calls the assembler, and nothing else asks the
 *     loader for the holder report.
 * Each static rule is also run against MUTATED copies of the source, so a
 * rule that could never fire is itself a failure. What cannot be proven
 * statically - the sentinel's behaviour, DISTINCT before LIMIT, ordering,
 * one snapshot - is proven by the unit and integration tests named below.
 *
 * THE RANGE IS OPEN to the working tree while the slice is uncommitted; the
 * terminal pin belongs to a separately authorised commit-closure phase.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as assembler from '../../orgunits/subjectSnapshotRead/assemble.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B2.5-P1a terminal (implementation 7d0e81d + firewall pin). */
const REPAIR_BASE_COMMIT = '42513445439fea1c8e11d3671e952c16d96fd4f3';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = null;

const STORE = 'src/orgunits/subjectRegistry/store.ts';
const ASSEMBLER = 'src/orgunits/subjectSnapshotRead/assemble.ts';
const P1A_UNIT_TEST = 'src/test/unit/discoverySubjectSnapshotReadB25P1a.test.ts';
const P1A_INTEGRATION_TEST = 'src/test/integration/discoverySubjectSnapshotReadB25P1a.test.ts';
const UNIT_TEST = 'src/test/unit/discoverySubjectHolderEnumerationB25P1b.test.ts';
const INTEGRATION_TEST = 'src/test/integration/discoverySubjectHolderEnumerationB25P1b.test.ts';
const FIREWALL = 'src/test/firewall/phase2bSubjectHolderEnumerationP1b.firewall.test.ts';

const AUTHORISED_CHANGESET = [
  `M\t${STORE}`,
  `M\t${ASSEMBLER}`,
  `M\t${P1A_UNIT_TEST}`,
  `M\t${P1A_INTEGRATION_TEST}`,
  `A\t${UNIT_TEST}`,
  `A\t${INTEGRATION_TEST}`,
  `A\t${FIREWALL}`,
].sort();

/** Paths this slice may not touch at all. */
const PROTECTED_PATHS = [
  'src/orgunits/identity/',
  'src/orgunits/subjectRegistry/readModel.ts',
  'src/orgunits/subjectRegistry/requests.ts',
  'src/orgunits/subjectRegistry/reviewAttestation.ts',
  'src/orgunits/subjectRegistry/reviewAuthority.ts',
  'src/orgunits/subjectRegistry/reviewEvidence.ts',
  'src/orgunits/subjectRegistry/writer.ts',
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
  'src/test/firewall/phase2bDiscoverySubjectRegistry.firewall.test.ts':
    '4189d1e0c160b6d1f89a61b89c5fc20477897d39',
  'src/test/firewall/phase2bOwnerAttestedReview.firewall.test.ts':
    'fe00ae0d4a096fda3c3f9386366ab9c82bb5fbfc',
  'src/test/firewall/phase2bSubjectEvidenceProjection.firewall.test.ts':
    '766530cce66ff61df2cf2dc8543f95e73f897ade',
  'src/test/firewall/phase2bSubjectEvidenceInputFindingsR2.firewall.test.ts':
    '5813408eaea4370e6854468b4bfeafd11a7966cf',
  'src/test/firewall/phase2bSubjectSnapshotScopeS0.firewall.test.ts':
    'f28382f92eb42f2b0114651b4b4cbad6637089cd',
  'src/test/firewall/phase2bSubjectSnapshotReadP1a.firewall.test.ts':
    '7d0e81db33b320ecef09ba622077b015f38270c7',
};

/** The EXACT lines each edited file may remove, verbatim. Anything else removed fails. */
const REMOVED_LINES: Readonly<Record<string, readonly string[]>> = {
  [STORE]: [
    ' *     claims;',
    '): Promise<SubjectGraph | null> {',
    '        MAX_SHARED_IDENTIFIER_HOLDERS,',
    '    for (const holder of holders) subjectIds.add(holder.subject_id);',
  ],
  [ASSEMBLER]: [
    ' * the loader follows outgoing relationships only, samples shared-identifier',
    ' * holders under a LIMIT with no overflow sentinel, and the B2.1 validator is',
    ' * not run here. Every such gap is declared to S0 as INCOMPLETE or UNKNOWN,',
    ' * never as REPRESENTED. The transaction snapshot is compared, never exported:',
    ' * it is transaction-local, not a durable source revision.',
    "  SHARED_IDENTIFIER_HOLDERS: 'LOADER_HOLDER_QUERY_IS_LIMITED_WITHOUT_AN_OVERFLOW_SENTINEL',",
    "    'SHARED_IDENTIFIER_HOLDER_QUERY_LIMITED_WITHOUT_OVERFLOW_SENTINEL',",
    "const EXTERNAL_IDENTIFIER = 'EXTERNAL_IDENTIFIER';",
    '',
    " * set and answer, never a caller's.",
    '  const identifierOf = (c: (typeof input.identityClaims)[number]) =>',
    '    `${c.identifierScheme}\\u0000${c.identifierValue}`;',
    '  const focalIdentifiers = new Set(',
    '    input.identityClaims',
    '      .filter((c) => c.subjectId === focal && c.claimKind === EXTERNAL_IDENTIFIER)',
    '      .map(identifierOf),',
    '  );',
    '  // The holders the retrieved records SHOW. The loader does not report which',
    '  // subjects its LIMITed holder query returned, nor whether it stopped short.',
    '  const holderSubjectIds = [',
    '    ...new Set(',
    '      input.identityClaims',
    '        .filter(',
    '          (c) =>',
    '            c.subjectId !== focal &&',
    '            c.claimKind === EXTERNAL_IDENTIFIER &&',
    '            focalIdentifiers.has(identifierOf(c)),',
    '        )',
    '        .map((c) => c.subjectId),',
    '    ),',
    '  ].sort();',
    '      categories: { ...SCOPE_DECLARATIONS },',
    "        enumeration: 'UNKNOWN',",
    '        bound: MAX_SHARED_IDENTIFIER_HOLDERS,',
  ],
  [P1A_UNIT_TEST]: [
    '    expect(input.scope.categories).toEqual(SCOPE_DECLARATIONS);',
    "      enumeration: 'UNKNOWN',",
    '      bound: MAX_SHARED_IDENTIFIER_HOLDERS,',
    "  it('reconstructs holders from the retrieved claims only, and never calls them exhaustive', async () => {",
    "      enumeration: 'UNKNOWN',",
    '      bound: 20,',
    '    expect(m.omissions).toContainEqual({',
    "      code: 'SHARED_IDENTIFIER_HOLDER_ENUMERATION_UNKNOWN',",
    '      ref: focal,',
    '    });',
    "  it('fails closed (REFUSED) when the retrieved holders exceed the loader bound S0 is told', async () => {",
    "    // retrieved holders can exceed the holder query's own LIMIT.",
    "    expect(result.outcome).toBe('REFUSED');",
    "    expect(result).toMatchObject({ code: 'SCOPE_DECLARATION_INCONSISTENT' });",
    "    expect(result).not.toHaveProperty('manifest');",
  ],
  [P1A_INTEGRATION_TEST]: [
    "    it('P1a-11: at the loader limit of 20 holders, exhaustive coverage stays unproven and nothing claims truncation', async () => {",
    '      expect(m.scope.sharedIdentifierHolders.bound).toBe(20);',
    "      expect(m.scope.sharedIdentifierHolders.enumeration).toBe('UNKNOWN');",
    "      expect(m.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('UNKNOWN');",
    "        code: 'SHARED_IDENTIFIER_HOLDER_ENUMERATION_UNKNOWN',",
    '      expect(JSON.stringify(m)).not.toMatch(/TRUNCATED|EXHAUSTIVE/);',
    "    it('P1a-11: one holder, well below the limit, is still not called exhaustive', async () => {",
    "        enumeration: 'UNKNOWN',",
    '        bound: 20,',
    '      expect(m.scope.categories).toEqual(SCOPE_DECLARATIONS);',
  ],
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

/** Every template literal that is an SQL statement, in source order. */
const sqlOf = (code: string): string[] =>
  [...code.matchAll(/`(\s*(?:SELECT|WITH)\b[\s\S]*?)`/g)].map((m) => m[1]!);

/** Runtime export names (types and interfaces erased). */
const runtimeExportsOf = (code: string): string[] =>
  [...code.matchAll(/^export (?:const|let|class|(?:async )?function) (\w+)/gm)]
    .map((m) => m[1]!)
    .sort();

// ---------------------------------------------------------------- the store

const STORE_REQUIRED = [
  'export const MAX_SHARED_IDENTIFIER_HOLDERS = 20;',
  'const SHARED_IDENTIFIER_HOLDER_QUERY_LIMIT = MAX_SHARED_IDENTIFIER_HOLDERS + 1;',
  '        focalSubjectId,\n        SHARED_IDENTIFIER_HOLDER_QUERY_LIMIT,\n      ],',
  'for (const holder of holders.slice(0, MAX_SHARED_IDENTIFIER_HOLDERS)) {',
  'returned.length <= SHARED_IDENTIFIER_HOLDER_QUERY_LIMIT &&',
  "typeof id === 'string' &&",
  'id !== focalSubjectId &&',
  '(i === 0 || (returned[i - 1] as string) < id),',
  "  const outcome = !wellFormed\n    ? 'UNKNOWN'\n    : returned.length > MAX_SHARED_IDENTIFIER_HOLDERS\n      ? 'TRUNCATED'\n      : 'EXHAUSTIVE';",
  'holderSubjectIds: wellFormed ? included : [],',
  "...(options.sharedIdentifierHolders === 'REPORT'",
];

const STORE_RULES: readonly (readonly [string, (code: string, base: string) => boolean])[] = [
  ['store-runtime-import', (c) => /^import\s+(?!type\b)/m.test(c)],
  [
    'store-mutating-or-transaction-sql',
    (c) =>
      /\b(INSERT|UPDATE|DELETE|TRUNCATE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|LOCK|GRANT|REVOKE|CREATE|ALTER|DROP|COPY)\b|\bSET\s+(TRANSACTION|SESSION|LOCAL|ROLE)\b/.test(
        c,
      ),
  ],
  ['store-sql-changed', (c, b) => JSON.stringify(sqlOf(c)) !== JSON.stringify(sqlOf(b))],
  [
    'store-exports-changed',
    (c, b) => JSON.stringify(runtimeExportsOf(c)) !== JSON.stringify(runtimeExportsOf(b)),
  ],
  ['store-sentinel-and-guard', (c) => !STORE_REQUIRED.every((s) => c.includes(s))],
  [
    'store-limit-exported-or-widened',
    (c) =>
      /export const SHARED_IDENTIFIER_HOLDER_QUERY_LIMIT|MAX_SHARED_IDENTIFIER_HOLDERS \+ [02-9]/.test(
        c,
      ),
  ],
];

const storeViolationsOf = (source: string): string[] => {
  const base = codeOf(baseSourceOf(STORE));
  return STORE_RULES.filter(([, broken]) => broken(codeOf(source), base)).map(([n]) => n);
};

// ---------------------------------------------------------------- the assembler

/** P1a's exact import statements, unchanged: no new module, no new name. */
const ALLOWED_IMPORTS = [
  "import type pg from 'pg';",
  "import { databaseNow, loadSubjectGraph, MAX_SHARED_IDENTIFIER_HOLDERS, } from '../subjectRegistry/store.js';",
  "import { PROTECTION_CHECK, SNAPSHOT_SCOPE_CONTRACT, UUID, type CategoryDeclaration, type ScopeCategory, type SnapshotScopeRefusalCode, } from '../subjectSnapshot/contract.js';",
  "import { buildSnapshotScopeManifest, type SnapshotScopeInput, type SnapshotScopeManifest, } from '../subjectSnapshot/manifest.js';",
];

const OWN_SQL = [
  "'SELECT transaction_timestamp() = statement_timestamp() AS no_open_block'",
  "'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'",
  "`SELECT current_setting('transaction_isolation') AS isolation,",
  "'ROLLBACK'",
];

/** The one fixed mapping from a loader outcome to what S0 is told. */
const HOLDER_MAPPING = `} = Object.freeze({
  EXHAUSTIVE: { enumeration: 'EXHAUSTIVE_AS_DECLARED', declaration: 'REPRESENTED' },
  TRUNCATED: { enumeration: 'TRUNCATED', declaration: 'INCOMPLETE' },
  UNKNOWN: { enumeration: 'UNKNOWN', declaration: 'UNKNOWN' },
});`;

const HOLDER_DERIVATION = [
  'const reported = graph.sharedIdentifierHolderEnumeration;',
  "const holderScope = HOLDER_SCOPE_OF[reported?.outcome ?? 'UNKNOWN'];",
  'const holderSubjectIds = [...(reported?.holderSubjectIds ?? [])].sort();',
  'const holderBound = reported?.queryLimit ?? MAX_SHARED_IDENTIFIER_HOLDERS;',
  'categories: { ...SCOPE_DECLARATIONS, SHARED_IDENTIFIER_HOLDERS: holderScope.declaration },',
  'enumeration: holderScope.enumeration,',
  'bound: holderBound,',
];

const ASSEMBLER_RULES: readonly (readonly [string, (code: string) => boolean])[] = [
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
      /'COMPLETE'|'COMPLETED'|\bisComplete\b|'FRESH'|'CURRENT'|'AUTHENTICATED'|'VERIFIED'|'SIGNED'|'CLEAR'|'CLEARED'|'NOT_PROTECTED'|'GRANTED'|'ALLOWED'|'ELIGIBLE'|'APPROVED'|granted:\s*true|'INCOMING'|'SYNTHETIC_IN_MEMORY'|'CALLER_ASSERTED_RAN'/.test(
        c,
      ),
  ],
  [
    'enumeration-outside-the-mapping',
    (c) =>
      !c.includes(HOLDER_MAPPING) ||
      (c.match(/'EXHAUSTIVE_AS_DECLARED'/g) ?? []).length !== 1 ||
      (c.match(/'TRUNCATED'/g) ?? []).length !== 1 ||
      (c.match(/'INCOMPLETE'/g) ?? []).length !== 3,
  ],
  [
    'gap-declared-represented',
    (c) =>
      /(INCOMING_RELATIONSHIP_CLAIMS|SHARED_IDENTIFIER_HOLDERS|RECORD_SCOPED_FINDINGS|INPUT_SCOPED_FINDINGS|NEIGHBOUR_RECORD_FINDINGS|VALIDATION_INPUTS|SOURCE_GLOBALS|PROTECTION_STATUS):\s*'REPRESENTED'/.test(
        c,
      ) || (c.match(/'REPRESENTED'/g) ?? []).length !== 7,
  ],
  ['holder-derivation', (c) => !HOLDER_DERIVATION.every((s) => c.includes(s))],
  [
    'holders-reconstructed-from-claims',
    (c) => /identityClaims\s*\.filter|claimKind|identifierScheme|identifierValue/.test(c),
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
        'protectionCheck: PROTECTION_CHECK,',
        "sharedIdentifierHolders: 'REPORT',",
      ].every((s) => c.includes(s)),
  ],
  [
    'exported-functions',
    (c) =>
      JSON.stringify([...c.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1])) !==
      JSON.stringify(['assembleSubjectSnapshotScope']),
  ],
];

const assemblerViolationsOf = (source: string): string[] =>
  ASSEMBLER_RULES.filter(([, broken]) => broken(codeOf(source))).map(([name]) => name);

/** P1a's transaction protocol, with the holder report requested inside it. */
const PROTOCOL_ORDER = [
  'await source.connect();',
  'connection.query<{ no_open_block: boolean }>(NO_OPEN_TRANSACTION_BLOCK)',
  "'CONNECTION_IN_OPEN_TRANSACTION',",
  'await connection.query(BEGIN_READ_SNAPSHOT);',
  'const start = await readSnapshotState(connection);',
  'graph = await loadSubjectGraph(connection, focalSubjectId, {',
  'asOf: await databaseNow(connection),',
  "sharedIdentifierHolders: 'REPORT',",
  'const end = await readSnapshotState(connection);',
  'end.started !== start.started || end.snapshot !== start.snapshot',
  'await connection.query(END_READ_SNAPSHOT);',
  'connection.release();',
];

const protocolHolds = (source: string): boolean => {
  const code = codeOf(source);
  const body = code.slice(code.indexOf('async function readGraphInOneSnapshot('));
  const at = PROTOCOL_ORDER.map((s) => body.indexOf(s));
  return (
    at.every((i) => i >= 0) &&
    [...at].sort((a, b) => a - b).join() === at.join() &&
    body.includes("if (phase === 'OPEN') discard = !(await endAfterError(connection));") &&
    body.includes('let discard = true;')
  );
};

const describeRange = rangeAvailable ? describe : describe.skip;

describeRange('B2.5-P1b holder enumeration: the change stays inside its scope', () => {
  it('changes exactly the authorised files, by path and status', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('touches no S0 file, other registry module, earlier slice, migration, CLI, helper or dependency', () => {
    expect(changeset(...PROTECTED_PATHS)).toEqual([]);
  });

  it('adds exactly its own firewall and edits no earlier one', () => {
    expect(changeset('src/test/firewall/')).toEqual([`A\t${FIREWALL}`]);
  });

  it('keeps every earlier terminal pin, base commit and firewall byte-identical', () => {
    for (const [file, pin] of Object.entries(EARLIER_TERMINAL_PINS)) {
      const line = `const REPAIR_TERMINAL_COMMIT: string | null = '${pin}';`;
      expect(sourceOf(file), file).toBe(baseSourceOf(file));
      expect(sourceOf(file), file).toContain(line);
    }
  });

  it('removes exactly the recorded lines from each edited file, and nothing else', () => {
    for (const [file, removed] of Object.entries(REMOVED_LINES)) {
      expect(diffLines(file).removed, file).toEqual(removed);
    }
  });

  it('gains or loses no P1a test, and the P1a test edits add no skip, focus or timeout', () => {
    const tests = (source: string) => (codeOf(source).match(/\bit(\.each)?\(/g) ?? []).length;
    for (const file of [P1A_UNIT_TEST, P1A_INTEGRATION_TEST]) {
      expect(tests(sourceOf(file)), file).toBe(tests(baseSourceOf(file)));
      expect(diffLines(file).added.join('\n'), file).not.toMatch(
        /\.(skip|only|todo|skipIf|runIf)\b|timeout|\bcatch\b|try\s*\{|expect\.soft|process\.env/i,
      );
    }
  });
});

describe('B2.5-P1b holder enumeration: the store stays a SELECT-only loader with a sentinel', () => {
  it('breaks none of its static rules', () => {
    expect(storeViolationsOf(sourceOf(STORE))).toEqual([]);
  });

  it('sends exactly the base SQL: the holder statement is unchanged apart from its LIMIT value', () => {
    const holder = sqlOf(codeOf(sourceOf(STORE))).filter((s) =>
      s.includes('SELECT DISTINCT subject_id FROM discovery_subject_identity_claims'),
    );
    expect(holder).toHaveLength(1);
    expect(holder[0]).toMatch(/SELECT DISTINCT subject_id[\s\S]*ORDER BY subject_id\s+LIMIT \$4$/);
  });
});

describe('B2.5-P1b holder enumeration: the assembler consumes only the verified outcome', () => {
  const source = sourceOf(ASSEMBLER);

  it('breaks none of its static rules and keeps the P1a transaction protocol', () => {
    expect(assemblerViolationsOf(source)).toEqual([]);
    expect(protocolHolds(source)).toBe(true);
  });

  it('exports exactly the P1a surface', () => {
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
    // The static fallback still declares the holder category UNKNOWN.
    expect(assembler.SCOPE_DECLARATIONS.SHARED_IDENTIFIER_HOLDERS).toBe('UNKNOWN');
    expect(assembler.SCOPE_DECLARATIONS.INCOMING_RELATIONSHIP_CLAIMS).toBe('UNKNOWN');
    expect(assembler.SNAPSHOT_READ_FACTS.durableSourceRevision).toBe('NONE');
    expect(assembler.SNAPSHOT_READ_FACTS.claim).toBe(
      'RETRIEVED_RECORDS_READ_UNDER_ONE_TRANSACTION_SNAPSHOT_NOT_EVERY_RELEVANT_RECORD',
    );
  });

  it('has no production importer, and nothing else asks the loader for the holder report', () => {
    for (const file of productionFiles()) {
      const code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));
      if (file !== ASSEMBLER) {
        expect(code, file).not.toMatch(
          /subjectSnapshotRead|assembleSubjectSnapshotScope|SubjectSnapshotReadRefusal|SNAPSHOT_READ_FACTS/,
        );
      }
      if (file !== ASSEMBLER && file !== STORE) {
        expect(code, file).not.toMatch(
          /sharedIdentifierHolders:\s*'REPORT'|sharedIdentifierHolderEnumeration|SharedIdentifierHolderEnumeration/,
        );
      }
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
    expect(codeOf(sourceOf(INTEGRATION_TEST)).match(/describe\.skip/g)).toEqual(['describe.skip']);
    expect(codeOf(sourceOf(INTEGRATION_TEST))).toContain(
      "const describeDb = databaseConfigured() && testDatabaseUrl('readonly') ? describe : describe.skip;",
    );
  });
});

describe('B2.5-P1b holder enumeration: every static rule can fire (mutation oracles)', () => {
  const store = sourceOf(STORE);
  const source = sourceOf(ASSEMBLER);
  // A pattern missing from the source leaves it unchanged, and that oracle then fails on its own.
  const swapIn = (text: string, from: string, to: string) => text.replace(from, to);

  it.each([
    ['store-runtime-import', `import pg from 'pg';\n${store}`],
    ['store-mutating-or-transaction-sql', `${store}\nconst q = 'INSERT INTO x VALUES (1)';`],
    ['store-mutating-or-transaction-sql', `${store}\nconst q = 'BEGIN';`],
    [
      'store-sql-changed',
      swapIn(store, '        ORDER BY subject_id\n        LIMIT $4`,', '        LIMIT $4`,'),
    ],
    ['store-exports-changed', `${store}\nexport const HOLDER_QUERY_LIMIT = 21;`],
    [
      'store-sentinel-and-guard',
      swapIn(
        store,
        '        focalSubjectId,\n        SHARED_IDENTIFIER_HOLDER_QUERY_LIMIT,\n      ],',
        '        focalSubjectId,\n        MAX_SHARED_IDENTIFIER_HOLDERS,\n      ],',
      ),
    ],
    [
      'store-sentinel-and-guard',
      swapIn(
        store,
        "    : returned.length > MAX_SHARED_IDENTIFIER_HOLDERS\n      ? 'TRUNCATED'\n      : 'EXHAUSTIVE';",
        "    : 'EXHAUSTIVE';",
      ),
    ],
    [
      'store-sentinel-and-guard',
      swapIn(store, '(i === 0 || (returned[i - 1] as string) < id),', 'true,'),
    ],
    [
      'store-sentinel-and-guard',
      swapIn(
        store,
        'for (const holder of holders.slice(0, MAX_SHARED_IDENTIFIER_HOLDERS)) {',
        'for (const holder of holders) {',
      ),
    ],
    [
      'store-sentinel-and-guard',
      swapIn(
        store,
        'export const MAX_SHARED_IDENTIFIER_HOLDERS = 20;',
        'export const MAX_SHARED_IDENTIFIER_HOLDERS = 40;',
      ),
    ],
    [
      'store-limit-exported-or-widened',
      swapIn(
        store,
        'const SHARED_IDENTIFIER_HOLDER_QUERY_LIMIT = MAX_SHARED_IDENTIFIER_HOLDERS + 1;',
        'export const SHARED_IDENTIFIER_HOLDER_QUERY_LIMIT = MAX_SHARED_IDENTIFIER_HOLDERS + 1;',
      ),
    ],
  ])('fires %s on a mutated store', (rule, mutated) => {
    expect(mutated).not.toBe(store);
    expect(storeViolationsOf(mutated)).toContain(rule);
  });

  const inject = (line: string) =>
    source.replace("import type pg from 'pg';", `import type pg from 'pg';\n${line}`);
  const swap = (from: string, to: string) => swapIn(source, from, to);

  it.each([
    ['imports', inject("import { executeClaim } from '../subjectRegistry/writer.js';")],
    ['imports', swap('  databaseNow,\n', '  databaseNow,\n  subjectExists,\n')],
    ['imports', inject("import { ENUMERATIONS } from '../subjectSnapshot/contract.js';")],
    ['dynamic-import', `${source}\nconst later = () => import('../subjectRegistry/writer.js');`],
    ['own-pool-or-environment', `${source}\nconst url = process.env['DATABASE_URL_READONLY'];`],
    ['socket-file-clock-randomness', `${source}\nconst t = Date.now();`],
    ['mutating-or-session-sql', `${source}\nconst q = 'SET TRANSACTION READ WRITE';`],
    ['own-table-access', `${source}\nconst q = 'SELECT 1 FROM discovery_subjects';`],
    ['one-connect', `${source}\nconst second = () => source.connect();`],
    [
      'rollback-end',
      swap("const END_READ_SNAPSHOT = 'ROLLBACK';", "const END_READ_SNAPSHOT = 'END';"),
    ],
    ['review-signing-trust-or-write', `${source}\nconst l = loadReviewAttestations;`],
    ['cohort-research-classifier', `${source}\nconst v = validateIdentityGraph;`],
    ['canonical-identity-or-cross-track-contract', `${source}\nconst id = 'cand:x';`],
    ['stronger-state', `${source}\nconst s = 'COMPLETE';`],
    [
      'stronger-state',
      swap(
        "relationshipDirectionsExamined: ['OUTGOING'],",
        "relationshipDirectionsExamined: ['OUTGOING', 'INCOMING'],",
      ),
    ],
    [
      'enumeration-outside-the-mapping',
      swap(
        "TRUNCATED: { enumeration: 'TRUNCATED', declaration: 'INCOMPLETE' },",
        "TRUNCATED: { enumeration: 'EXHAUSTIVE_AS_DECLARED', declaration: 'REPRESENTED' },",
      ),
    ],
    [
      'enumeration-outside-the-mapping',
      swap(
        "UNKNOWN: { enumeration: 'UNKNOWN', declaration: 'UNKNOWN' },",
        "UNKNOWN: { enumeration: 'TRUNCATED', declaration: 'INCOMPLETE' },",
      ),
    ],
    [
      'gap-declared-represented',
      swap(
        "INCOMING_RELATIONSHIP_CLAIMS: 'UNKNOWN',",
        "INCOMING_RELATIONSHIP_CLAIMS: 'REPRESENTED',",
      ),
    ],
    [
      'gap-declared-represented',
      swap(
        'categories: { ...SCOPE_DECLARATIONS, SHARED_IDENTIFIER_HOLDERS: holderScope.declaration },',
        "categories: { ...SCOPE_DECLARATIONS, SHARED_IDENTIFIER_HOLDERS: 'REPRESENTED' },",
      ),
    ],
    [
      'holder-derivation',
      swap(
        "const holderScope = HOLDER_SCOPE_OF[reported?.outcome ?? 'UNKNOWN'];",
        "const holderScope = HOLDER_SCOPE_OF[reported?.outcome ?? 'EXHAUSTIVE'];",
      ),
    ],
    ['holder-derivation', swap('bound: holderBound,', 'bound: 1000,')],
    [
      'holders-reconstructed-from-claims',
      `${source}\nconst seen = (g: SubjectGraph) => g.input.identityClaims.filter((c) => c.claimKind);`,
    ],
    ['fixed-input-shape', swap('findings: [],', 'findings: callerFindings,')],
    ['fixed-input-shape', swap("      sharedIdentifierHolders: 'REPORT',\n", '')],
    [
      'exported-functions',
      swap('function snapshotScopeInputOf(', 'export function snapshotScopeInputOf('),
    ],
  ])('fires %s on a mutated assembler', (rule, mutated) => {
    expect(mutated).not.toBe(source);
    expect(assemblerViolationsOf(mutated)).toContain(rule);
  });

  it('fails a protocol that drops the holder report or reads it outside the transaction', () => {
    expect(protocolHolds(swap("      sharedIdentifierHolders: 'REPORT',\n", ''))).toBe(false);
    const reordered = source
      .replace('    const start = await readSnapshotState(connection);\n', '')
      .replace(
        '    const end = await readSnapshotState(connection);\n',
        '    const end = await readSnapshotState(connection);\n    const start = end;\n',
      );
    expect(reordered).not.toBe(source);
    expect(protocolHolds(reordered)).toBe(false);
  });
});

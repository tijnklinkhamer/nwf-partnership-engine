/**
 * TRACK B, B2.5-P1c - THE ISOLATION TEST FOR BOUNDED DIRECT INCOMING
 * RELATIONSHIP-CLAIM ENUMERATION.
 *
 * Per the phase-isolation convention this slice is pinned by its OWN file over
 * its OWN range, REPAIR_BASE_COMMIT (the accepted B2.5-P1b terminal) to
 * REPAIR_TERMINAL_COMMIT. It proves, from the real git range and the real
 * source:
 *
 *   - the change set is EXACTLY the B2.2 store, the P1a assembler, the P1a and
 *     P1b unit and integration tests (assertions that encoded "incoming is
 *     never enumerated"), two new tests and this firewall; no other file - no
 *     firewall, S0 file, earlier slice, migration, CLI or dependency - changes,
 *     and every earlier terminal pin stands;
 *   - each edited file removes exactly its recorded lines (the store none), so
 *     nothing else in it was weakened, and the P1a/P1b tests gain or lose no
 *     test;
 *   - the store stays SELECT-only with no runtime import, sends every base
 *     statement unchanged plus exactly ONE new read-only statement - the direct
 *     incoming predicate, ordered by the unique claim id, LIMIT one sentinel
 *     row beyond an unexported cap of 20 - runs it only on REPORT, after the
 *     graph is assembled, and never merges its rows into the graph;
 *   - the assembler keeps P1a's imports, exports, transaction protocol and
 *     fixed shape, takes the incoming claims and declaration ONLY from the
 *     loader's report through one fixed mapping, never selects incoming
 *     claims from the graph itself, never adds a subject or review, and states
 *     nothing stronger anywhere else;
 *   - nothing in production calls the assembler, and nothing else asks the
 *     loader for the incoming report.
 * Each static rule is also run against MUTATED copies of the source, so a
 * rule that could never fire is itself a failure. What cannot be proven
 * statically - the sentinel's behaviour, ordering, one snapshot, concurrent
 * inserts - is proven by the unit and integration tests named below.
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

/** The accepted B2.5-P1b terminal (implementation 9582cbe + firewall pin). */
const REPAIR_BASE_COMMIT = '07ce9de9fa04ce3b977957000abfb90dbde6a5e6';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = 'd3ce2cc4674393abcb244249fcabf705c24d7e98';

const STORE = 'src/orgunits/subjectRegistry/store.ts';
const ASSEMBLER = 'src/orgunits/subjectSnapshotRead/assemble.ts';
const P1A_UNIT_TEST = 'src/test/unit/discoverySubjectSnapshotReadB25P1a.test.ts';
const P1A_INTEGRATION_TEST = 'src/test/integration/discoverySubjectSnapshotReadB25P1a.test.ts';
const P1B_UNIT_TEST = 'src/test/unit/discoverySubjectHolderEnumerationB25P1b.test.ts';
const P1B_INTEGRATION_TEST = 'src/test/integration/discoverySubjectHolderEnumerationB25P1b.test.ts';
const UNIT_TEST = 'src/test/unit/discoverySubjectIncomingRelationsB25P1c.test.ts';
const INTEGRATION_TEST = 'src/test/integration/discoverySubjectIncomingRelationsB25P1c.test.ts';
const FIREWALL = 'src/test/firewall/phase2bSubjectIncomingRelationsP1c.firewall.test.ts';

const AUTHORISED_CHANGESET = [
  `M\t${STORE}`,
  `M\t${ASSEMBLER}`,
  `M\t${P1A_UNIT_TEST}`,
  `M\t${P1A_INTEGRATION_TEST}`,
  `M\t${P1B_UNIT_TEST}`,
  `M\t${P1B_INTEGRATION_TEST}`,
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
  'src/test/firewall/phase2bSubjectHolderEnumerationP1b.firewall.test.ts':
    '9582cbeeebcb053b20f95a55d627dc3c05dc2e3f',
};

/** The EXACT lines each edited file may remove, verbatim. Anything else removed fails. */
const REMOVED_LINES: Readonly<Record<string, readonly string[]>> = {
  [STORE]: [],
  [ASSEMBLER]: [
    ' * SHARED_IDENTIFIER_HOLDERS here is the fallback only: each read replaces it',
    " * with the declaration of the loader's verified holder enumeration (P1b).",
    "  INCOMING_RELATIONSHIP_CLAIMS: 'LOADER_DOES_NOT_ENUMERATE_INCOMING_RELATIONSHIPS',",
    "  REFERENCED_RECORDS: 'LOADER_READS_EVERY_TARGET_AND_REVIEW_CHAIN_IT_REFERENCES',",
    "  REVIEW_RECORDS: 'LOADER_READS_EVERY_REVIEW_OF_EVERY_LOADED_RECORD_BOUND_REFUSED',",
    "    'INCOMING_RELATIONSHIPS_NOT_ENUMERATED',",
    " * verified holder-query outcome (P1b), never a caller's.",
    '      relationshipClaims: input.relationshipClaims,',
    "      relationshipDirectionsExamined: ['OUTGOING'],",
    '      categories: { ...SCOPE_DECLARATIONS, SHARED_IDENTIFIER_HOLDERS: holderScope.declaration },',
  ],
  [P1A_UNIT_TEST]: [
    "    expect(input.scope.relationshipDirectionsExamined).toEqual(['OUTGOING']);",
  ],
  [P1A_INTEGRATION_TEST]: [
    "    it('P1a-10: an incoming relationship the loader does not follow never yields bidirectional coverage', async () => {",
    '      expect(ids).not.toContain(incomingClaim);',
    "      expect(m.scope.relationshipDirectionsExamined).toEqual(['OUTGOING']);",
    "      expect(m.scope.relationshipDirectionCoverage).toBe('OUTGOING_ONLY');",
    "      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('UNKNOWN');",
    "      expect(m.validation.unavailableInputs).toContain('INCOMING_RELATIONSHIP_CLAIMS');",
    "    it('P1a-10: an incoming claim retrieved incidentally (a PART_OF cycle) is shown, still not enumerated', async () => {",
    "      expect(m.scope.relationshipDirectionCoverage).toBe('OUTGOING_ONLY');",
    "      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('UNKNOWN');",
    '      // P1b: the fixture cites no identifier, so only the holder category is exhaustive.',
  ],
  [P1B_UNIT_TEST]: [
    "      'INCOMING_RELATIONSHIP_CLAIMS',",
    "    expect(m.scope.relationshipDirectionsExamined).toEqual(['OUTGOING']);",
  ],
  [P1B_INTEGRATION_TEST]: [
    "      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('UNKNOWN');",
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

/** The ONE statement P1c adds: the direct predicate, unique-id order, LIMIT $2. */
const INCOMING_STATEMENT =
  /^\s*SELECT id, subject_id, predicate, target_subject_id, target_eche_row_key, \$\{PROVENANCE_COLUMNS\}\s+FROM discovery_subject_relationship_claims\s+WHERE target_subject_id = \$1 AND subject_id <> \$1\s+ORDER BY id\s+LIMIT \$2$/;

const STORE_REQUIRED = [
  // P1b, unchanged.
  'export const MAX_SHARED_IDENTIFIER_HOLDERS = 20;',
  'const SHARED_IDENTIFIER_HOLDER_QUERY_LIMIT = MAX_SHARED_IDENTIFIER_HOLDERS + 1;',
  'for (const holder of holders.slice(0, MAX_SHARED_IDENTIFIER_HOLDERS)) {',
  'holderSubjectIds: wellFormed ? included : [],',
  // P1c.
  'const MAX_INCOMING_RELATIONSHIP_CLAIMS = 20;',
  'const INCOMING_RELATIONSHIP_CLAIM_QUERY_LIMIT = MAX_INCOMING_RELATIONSHIP_CLAIMS + 1;',
  '[focalSubjectId, INCOMING_RELATIONSHIP_CLAIM_QUERY_LIMIT],',
  'returned.length <= INCOMING_RELATIONSHIP_CLAIM_QUERY_LIMIT &&',
  "typeof row.id === 'string' &&",
  "typeof row.subject_id === 'string' &&",
  'row.subject_id !== focalSubjectId &&',
  'row.target_subject_id === focalSubjectId &&',
  'row.target_eche_row_key === null &&',
  '(i === 0 || returned[i - 1]!.id < row.id),',
  "  const outcome = !wellFormed\n    ? 'UNKNOWN'\n    : returned.length > MAX_INCOMING_RELATIONSHIP_CLAIMS\n      ? 'TRUNCATED'\n      : 'EXHAUSTIVE';",
  '? returned.slice(0, MAX_INCOMING_RELATIONSHIP_CLAIMS).map(relationshipClaimRecord)\n      : [],',
  "if (options.incomingRelationships === 'REPORT') {",
  'incomingEnumeration = incomingEnumerationOf(focalSubjectId, incoming);',
  '      relationshipClaims: [...relationshipRows]\n',
];

const GRAPH_STATE =
  /relationshipRows|subjectIds|claimRows|reviewRows|subjectRows|recordedAt|loadReviews|loadIdentityClaims|knownEcheRowKeys|echeKeys|frontier/;

const STORE_RULES: readonly (readonly [string, (code: string, base: string) => boolean])[] = [
  ['store-runtime-import', (c) => /^import\s+(?!type\b)/m.test(c)],
  [
    'store-mutating-or-transaction-sql',
    (c) =>
      /\b(INSERT|UPDATE|DELETE|TRUNCATE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|LOCK|GRANT|REVOKE|CREATE|ALTER|DROP|COPY)\b|\bSET\s+(TRANSACTION|SESSION|LOCAL|ROLE)\b|\bFOR\s+(UPDATE|SHARE)\b/.test(
        c,
      ),
  ],
  [
    'store-sql-not-base-plus-one-incoming-statement',
    (c, b) => {
      const current = sqlOf(c);
      const added = current.filter((s) => INCOMING_STATEMENT.test(s));
      return (
        added.length !== 1 ||
        JSON.stringify(current.filter((s) => !INCOMING_STATEMENT.test(s))) !==
          JSON.stringify(sqlOf(b))
      );
    },
  ],
  [
    'store-exports-changed',
    (c, b) => JSON.stringify(runtimeExportsOf(c)) !== JSON.stringify(runtimeExportsOf(b)),
  ],
  ['store-sentinel-guard-and-report-gate', (c) => !STORE_REQUIRED.every((s) => c.includes(s))],
  [
    'store-incoming-cap-exported-or-widened',
    (c) =>
      /export const (MAX_INCOMING_RELATIONSHIP_CLAIMS|INCOMING_RELATIONSHIP_CLAIM_QUERY_LIMIT)|MAX_INCOMING_RELATIONSHIP_CLAIMS \+ [02-9]/.test(
        c,
      ),
  ],
  [
    'store-incoming-merged-into-graph',
    (c) =>
      c
        .split('\n')
        .some((line) => /\bincoming(Enumeration)?\b/.test(line) && GRAPH_STATE.test(line)),
  ],
  [
    'store-incoming-read-before-the-graph-is-assembled',
    (c) => {
      const body = c.slice(c.indexOf('export async function loadSubjectGraph('));
      const report = body.indexOf("if (options.incomingRelationships === 'REPORT') {");
      return report < 0 || report < body.indexOf('const attestations =');
    },
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

/** P1b's fixed holder mapping, unchanged. */
const HOLDER_MAPPING = `} = Object.freeze({
  EXHAUSTIVE: { enumeration: 'EXHAUSTIVE_AS_DECLARED', declaration: 'REPRESENTED' },
  TRUNCATED: { enumeration: 'TRUNCATED', declaration: 'INCOMPLETE' },
  UNKNOWN: { enumeration: 'UNKNOWN', declaration: 'UNKNOWN' },
});`;

/** The one fixed mapping from an incoming-query outcome to what S0 is told. */
const INCOMING_MAPPING = `} = Object.freeze({
  EXHAUSTIVE: { declaration: 'REPRESENTED', directions: ['INCOMING', 'OUTGOING'] },
  TRUNCATED: { declaration: 'INCOMPLETE', directions: ['INCOMING', 'OUTGOING'] },
  UNKNOWN: { declaration: 'UNKNOWN', directions: ['OUTGOING'] },
});`;

const HOLDER_DERIVATION = [
  'const reported = graph.sharedIdentifierHolderEnumeration;',
  "const holderScope = HOLDER_SCOPE_OF[reported?.outcome ?? 'UNKNOWN'];",
  'const holderSubjectIds = [...(reported?.holderSubjectIds ?? [])].sort();',
  'const holderBound = reported?.queryLimit ?? MAX_SHARED_IDENTIFIER_HOLDERS;',
  'SHARED_IDENTIFIER_HOLDERS: holderScope.declaration,',
  'enumeration: holderScope.enumeration,',
  'bound: holderBound,',
];

const INCOMING_DERIVATION = [
  'const incoming = graph.incomingRelationshipClaimEnumeration;',
  "const incomingScope = INCOMING_SCOPE_OF[incoming?.outcome ?? 'UNKNOWN'];",
  "incomingScope.declaration === 'UNKNOWN' ? [] : (incoming?.relationshipClaims ?? []);",
  'const loadedClaims = new Map(input.relationshipClaims.map((r) => [r.id, JSON.stringify(r)]));',
  'const addedClaims = incomingClaims.filter((r) => loadedClaims.get(r.id) !== JSON.stringify(r));',
  'const loadedSubjects = new Set(input.subjects.map((s) => s.id));',
  'const sourceSubjectUnread = addedClaims.some((r) => !loadedSubjects.has(r.subjectId));',
  'const reviewChainUnread = addedClaims.some((r) => !loadedClaims.has(r.id));',
  'INCOMING_RELATIONSHIP_CLAIMS: incomingScope.declaration,',
  "...(sourceSubjectUnread ? { REFERENCED_RECORDS: 'INCOMPLETE' as const } : {}),",
  "...(reviewChainUnread ? { REVIEW_RECORDS: 'INCOMPLETE' as const } : {}),",
  'relationshipDirectionsExamined: [...incomingScope.directions],',
];

/** What S0 is given as records: the loader's, plus ONLY the reported incoming claims. */
const RECORDS_SHAPE = [
  'subjects: input.subjects,',
  'identityClaims: input.identityClaims,',
  'relationshipClaims: [...input.relationshipClaims, ...addedClaims],',
  'reviews: input.reviews,',
  'attestationReferences: attestations.records.map((a) => ({',
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
      /'COMPLETE'|'COMPLETED'|\bisComplete\b|'FRESH'|'CURRENT'|'AUTHENTICATED'|'VERIFIED'|'SIGNED'|'CLEAR'|'CLEARED'|'NOT_PROTECTED'|'GRANTED'|'ALLOWED'|'ELIGIBLE'|'APPROVED'|granted:\s*true|'SYNTHETIC_IN_MEMORY'|'CALLER_ASSERTED_RAN'|'INDEPENDENT'|'NO_PARENT'|'PARENT'/.test(
        c,
      ),
  ],
  [
    'enumeration-outside-the-mappings',
    (c) =>
      !c.includes(HOLDER_MAPPING) ||
      !c.includes(INCOMING_MAPPING) ||
      (c.match(/'EXHAUSTIVE_AS_DECLARED'/g) ?? []).length !== 1 ||
      (c.match(/'TRUNCATED'/g) ?? []).length !== 1 ||
      (c.match(/'INCOMING'/g) ?? []).length !== 2 ||
      (c.match(/'INCOMPLETE'/g) ?? []).length !== 6,
  ],
  [
    'gap-declared-represented',
    (c) =>
      /(INCOMING_RELATIONSHIP_CLAIMS|SHARED_IDENTIFIER_HOLDERS|RECORD_SCOPED_FINDINGS|INPUT_SCOPED_FINDINGS|NEIGHBOUR_RECORD_FINDINGS|VALIDATION_INPUTS|SOURCE_GLOBALS|PROTECTION_STATUS):\s*'REPRESENTED'/.test(
        c,
      ) || (c.match(/'REPRESENTED'/g) ?? []).length !== 8,
  ],
  ['holder-derivation', (c) => !HOLDER_DERIVATION.every((s) => c.includes(s))],
  ['incoming-derivation', (c) => !INCOMING_DERIVATION.every((s) => c.includes(s))],
  [
    'incoming-selected-from-the-graph',
    (c) => /targetSubjectId|\.predicate\b|predicate:|identityClaims\s*\.filter|claimKind/.test(c),
  ],
  [
    'records-beyond-the-loader-and-the-report',
    (c) =>
      !RECORDS_SHAPE.every((s) => c.includes(s)) ||
      (c.match(/\bsubjects:/g) ?? []).length !== 1 ||
      (c.match(/\breviews:/g) ?? []).length !== 1,
  ],
  [
    'fixed-input-shape',
    (c) =>
      ![
        "inputOrigin: 'CALLER_SUPPLIED_UNVERIFIED',",
        'findings: [],',
        "execution: 'NOT_RUN',",
        'ruleVersion: null,',
        'protectionCheck: PROTECTION_CHECK,',
        "sharedIdentifierHolders: 'REPORT',",
        "incomingRelationships: 'REPORT',",
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

/** P1a's transaction protocol, with both loader reports requested inside it. */
const PROTOCOL_ORDER = [
  'await source.connect();',
  'connection.query<{ no_open_block: boolean }>(NO_OPEN_TRANSACTION_BLOCK)',
  "'CONNECTION_IN_OPEN_TRANSACTION',",
  'await connection.query(BEGIN_READ_SNAPSHOT);',
  'const start = await readSnapshotState(connection);',
  'graph = await loadSubjectGraph(connection, focalSubjectId, {',
  'asOf: await databaseNow(connection),',
  "sharedIdentifierHolders: 'REPORT',",
  "incomingRelationships: 'REPORT',",
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

describeRange('B2.5-P1c incoming relations: the change stays inside its scope', () => {
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

  it('gains or loses no P1a/P1b test, and those edits add no skip, focus or timeout', () => {
    const tests = (source: string) => (codeOf(source).match(/\bit(\.each)?\(/g) ?? []).length;
    for (const file of [P1A_UNIT_TEST, P1A_INTEGRATION_TEST, P1B_UNIT_TEST, P1B_INTEGRATION_TEST]) {
      expect(tests(sourceOf(file)), file).toBe(tests(baseSourceOf(file)));
      expect(diffLines(file).added.join('\n'), file).not.toMatch(
        /\.(skip|only|todo|skipIf|runIf)\b|timeout|\bcatch\b|try\s*\{|expect\.soft|process\.env/i,
      );
    }
  });
});

describe('B2.5-P1c incoming relations: the store stays SELECT-only and never merges the report', () => {
  it('breaks none of its static rules', () => {
    expect(storeViolationsOf(sourceOf(STORE))).toEqual([]);
  });

  it('sends exactly one statement more than the base: the direct incoming predicate', () => {
    const current = sqlOf(codeOf(sourceOf(STORE)));
    const base = sqlOf(codeOf(baseSourceOf(STORE)));
    expect(current).toHaveLength(base.length + 1);
    expect(current.filter((s) => INCOMING_STATEMENT.test(s))).toHaveLength(1);
  });
});

describe('B2.5-P1c incoming relations: the assembler consumes only the verified report', () => {
  const source = sourceOf(ASSEMBLER);

  it('breaks none of its static rules and keeps the P1a transaction protocol', () => {
    expect(assemblerViolationsOf(source)).toEqual([]);
    expect(protocolHolds(source)).toBe(true);
  });

  it('exports exactly the P1a surface, with UNKNOWN as the static incoming fallback', () => {
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
    expect(assembler.SCOPE_DECLARATIONS.INCOMING_RELATIONSHIP_CLAIMS).toBe('UNKNOWN');
    expect(assembler.SCOPE_DECLARATIONS.SHARED_IDENTIFIER_HOLDERS).toBe('UNKNOWN');
    expect(assembler.SNAPSHOT_READ_FACTS.durableSourceRevision).toBe('NONE');
    // B2.5-P1d (current tree only): the source-subject ROWS are now read by exact
    // id; their claims, relationships and reviews are not. B2.5-P1e (current tree
    // only): the claims' stored reviews are read, never verified, trusted or latest.
    expect(assembler.SNAPSHOT_READ_FACTS.loaderLimitations).toContain(
      'INCOMING_RELATIONSHIP_SOURCE_SUBJECT_ROWS_ONLY_THEIR_CLAIMS_RELATIONSHIPS_REVIEWS_NOT_READ',
    );
    expect(assembler.SNAPSHOT_READ_FACTS.loaderLimitations).toContain(
      'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_STORED_RECORDS_ONLY_NOT_VERIFIED_NOT_TRUSTED_NOT_PROVEN_LATEST',
    );
    expect(assembler.SNAPSHOT_READ_FACTS.loaderLimitations).not.toContain(
      'INCOMING_RELATIONSHIPS_NOT_ENUMERATED',
    );
  });

  it('has no production importer, and nothing else asks the loader for the incoming report', () => {
    for (const file of productionFiles()) {
      const code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));
      if (file !== ASSEMBLER) {
        expect(code, file).not.toMatch(
          /subjectSnapshotRead|assembleSubjectSnapshotScope|SubjectSnapshotReadRefusal|SNAPSHOT_READ_FACTS/,
        );
      }
      if (file !== ASSEMBLER && file !== STORE) {
        expect(code, file).not.toMatch(
          /incomingRelationships:\s*'REPORT'|incomingRelationshipClaimEnumeration|IncomingRelationshipClaimEnumeration/,
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

describe('B2.5-P1c incoming relations: every static rule can fire (mutation oracles)', () => {
  const store = sourceOf(STORE);
  const source = sourceOf(ASSEMBLER);
  // A pattern missing from the source leaves it unchanged, and that oracle then fails on its own.
  const swapIn = (text: string, from: string, to: string) => text.replace(from, to);

  it.each([
    ['store-runtime-import', `import pg from 'pg';\n${store}`],
    ['store-mutating-or-transaction-sql', `${store}\nconst q = 'INSERT INTO x VALUES (1)';`],
    ['store-mutating-or-transaction-sql', `${store}\nconst q = 'SELECT 1 FOR UPDATE';`],
    // Removing the deterministic ordering.
    [
      'store-sql-not-base-plus-one-incoming-statement',
      swapIn(
        store,
        '        WHERE target_subject_id = $1 AND subject_id <> $1\n        ORDER BY id\n',
        '        WHERE target_subject_id = $1 AND subject_id <> $1\n',
      ),
    ],
    // Widening the predicate beyond direct subject targets.
    [
      'store-sql-not-base-plus-one-incoming-statement',
      swapIn(
        store,
        'WHERE target_subject_id = $1 AND subject_id <> $1',
        'WHERE (target_subject_id = $1 OR target_eche_row_key IS NOT NULL) AND subject_id <> $1',
      ),
    ],
    ['store-exports-changed', `${store}\nexport const INCOMING_QUERY_LIMIT = 21;`],
    // Removing the overflow sentinel.
    [
      'store-sentinel-guard-and-report-gate',
      swapIn(
        store,
        '[focalSubjectId, INCOMING_RELATIONSHIP_CLAIM_QUERY_LIMIT],',
        '[focalSubjectId, MAX_INCOMING_RELATIONSHIP_CLAIMS],',
      ),
    ],
    // Declaring a truncated result exhaustive in the loader.
    [
      'store-sentinel-guard-and-report-gate',
      swapIn(
        store,
        "    : returned.length > MAX_INCOMING_RELATIONSHIP_CLAIMS\n      ? 'TRUNCATED'\n      : 'EXHAUSTIVE';",
        "    : 'EXHAUSTIVE';",
      ),
    ],
    // Letting the sentinel row through as an included claim.
    [
      'store-sentinel-guard-and-report-gate',
      swapIn(
        store,
        '? returned.slice(0, MAX_INCOMING_RELATIONSHIP_CLAIMS).map(relationshipClaimRecord)',
        '? returned.map(relationshipClaimRecord)',
      ),
    ],
    [
      'store-sentinel-guard-and-report-gate',
      swapIn(store, 'row.target_subject_id === focalSubjectId &&', ''),
    ],
    [
      'store-sentinel-guard-and-report-gate',
      swapIn(store, '(i === 0 || returned[i - 1]!.id < row.id),', 'true,'),
    ],
    [
      'store-sentinel-guard-and-report-gate',
      swapIn(
        store,
        "if (options.incomingRelationships === 'REPORT') {",
        "if (options.incomingRelationships !== 'OMIT') {",
      ),
    ],
    [
      'store-incoming-cap-exported-or-widened',
      swapIn(
        store,
        'const INCOMING_RELATIONSHIP_CLAIM_QUERY_LIMIT = MAX_INCOMING_RELATIONSHIP_CLAIMS + 1;',
        'export const INCOMING_RELATIONSHIP_CLAIM_QUERY_LIMIT = MAX_INCOMING_RELATIONSHIP_CLAIMS + 1;',
      ),
    ],
    // Breaking the separation between the report and the graph.
    [
      'store-incoming-merged-into-graph',
      swapIn(
        store,
        '    incomingEnumeration = incomingEnumerationOf(focalSubjectId, incoming);\n',
        '    incomingEnumeration = incomingEnumerationOf(focalSubjectId, incoming);\n    relationshipRows.push(...incoming);\n',
      ),
    ],
    [
      'store-incoming-read-before-the-graph-is-assembled',
      swapIn(
        swapIn(
          store,
          '  const ids = [...subjectIds].sort();\n',
          "  if (options.incomingRelationships === 'REPORT') {\n  }\n  const ids = [...subjectIds].sort();\n",
        ),
        "  if (options.incomingRelationships === 'REPORT') {\n    const { rows: incoming }",
        '  if (false) {\n    const { rows: incoming }',
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
    // New forbidden runtime imports.
    ['imports', inject("import { executeClaim } from '../subjectRegistry/writer.js';")],
    ['imports', swap('  databaseNow,\n', '  databaseNow,\n  subjectExists,\n')],
    [
      'imports',
      inject("import { RELATIONSHIP_DIRECTIONS } from '../subjectSnapshot/contract.js';"),
    ],
    ['dynamic-import', `${source}\nconst later = () => import('../subjectRegistry/writer.js');`],
    ['own-pool-or-environment', `${source}\nconst url = process.env['DATABASE_URL_READONLY'];`],
    ['socket-file-clock-randomness', `${source}\nconst t = Date.now();`],
    ['mutating-or-session-sql', `${source}\nconst q = 'SET TRANSACTION READ WRITE';`],
    [
      'own-table-access',
      `${source}\nconst q = 'SELECT 1 FROM discovery_subject_relationship_claims';`,
    ],
    ['one-connect', `${source}\nconst second = () => source.connect();`],
    [
      'rollback-end',
      swap("const END_READ_SNAPSHOT = 'ROLLBACK';", "const END_READ_SNAPSHOT = 'END';"),
    ],
    ['review-signing-trust-or-write', `${source}\nconst l = loadReviewAttestations;`],
    ['cohort-research-classifier', `${source}\nconst v = validateIdentityGraph;`],
    ['canonical-identity-or-cross-track-contract', `${source}\nconst id = 'cand:x';`],
    ['stronger-state', `${source}\nconst s = 'INDEPENDENT';`],
    // Declaring a truncated incoming result exhaustive.
    [
      'enumeration-outside-the-mappings',
      swap(
        "TRUNCATED: { declaration: 'INCOMPLETE', directions: ['INCOMING', 'OUTGOING'] },",
        "TRUNCATED: { declaration: 'REPRESENTED', directions: ['INCOMING', 'OUTGOING'] },",
      ),
    ],
    [
      'enumeration-outside-the-mappings',
      swap(
        "UNKNOWN: { declaration: 'UNKNOWN', directions: ['OUTGOING'] },",
        "UNKNOWN: { declaration: 'UNKNOWN', directions: ['INCOMING', 'OUTGOING'] },",
      ),
    ],
    [
      'enumeration-outside-the-mappings',
      swap(
        "TRUNCATED: { enumeration: 'TRUNCATED', declaration: 'INCOMPLETE' },",
        "TRUNCATED: { enumeration: 'EXHAUSTIVE_AS_DECLARED', declaration: 'REPRESENTED' },",
      ),
    ],
    [
      'gap-declared-represented',
      swap(
        'INCOMING_RELATIONSHIP_CLAIMS: incomingScope.declaration,',
        "INCOMING_RELATIONSHIP_CLAIMS: 'REPRESENTED',",
      ),
    ],
    [
      'incoming-derivation',
      swap(
        "const incomingScope = INCOMING_SCOPE_OF[incoming?.outcome ?? 'UNKNOWN'];",
        "const incomingScope = INCOMING_SCOPE_OF[incoming?.outcome ?? 'EXHAUSTIVE'];",
      ),
    ],
    // Hiding an unread source subject or review chain.
    [
      'incoming-derivation',
      swap("...(sourceSubjectUnread ? { REFERENCED_RECORDS: 'INCOMPLETE' as const } : {}),", ''),
    ],
    [
      'incoming-derivation',
      swap("...(reviewChainUnread ? { REVIEW_RECORDS: 'INCOMPLETE' as const } : {}),", ''),
    ],
    // Selecting incoming claims from the graph instead of the loader's report.
    [
      'incoming-selected-from-the-graph',
      `${source}\nconst mine = (g: SubjectGraph) => g.input.relationshipClaims.filter((r) => r.targetSubjectId);`,
    ],
    // Silently dropping the incoming claims.
    [
      'records-beyond-the-loader-and-the-report',
      swap(
        'relationshipClaims: [...input.relationshipClaims, ...addedClaims],',
        'relationshipClaims: input.relationshipClaims,',
      ),
    ],
    // Fabricating or enlarging source-subject evidence.
    [
      'records-beyond-the-loader-and-the-report',
      swap('subjects: input.subjects,', 'subjects: [...input.subjects, ...placeholders],'),
    ],
    ['records-beyond-the-loader-and-the-report', `${source}\nconst extra = { reviews: [] };`],
    ['holder-derivation', swap('bound: holderBound,', 'bound: 1000,')],
    ['fixed-input-shape', swap("      incomingRelationships: 'REPORT',\n", '')],
    ['fixed-input-shape', swap('findings: [],', 'findings: callerFindings,')],
    [
      'exported-functions',
      swap('function snapshotScopeInputOf(', 'export function snapshotScopeInputOf('),
    ],
  ])('fires %s on a mutated assembler', (rule, mutated) => {
    expect(mutated).not.toBe(source);
    expect(assemblerViolationsOf(mutated)).toContain(rule);
  });

  it('fails a protocol that drops the incoming report or reads outside the transaction', () => {
    expect(protocolHolds(swap("      incomingRelationships: 'REPORT',\n", ''))).toBe(false);
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

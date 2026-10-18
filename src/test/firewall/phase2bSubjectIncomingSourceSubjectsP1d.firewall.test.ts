/**
 * TRACK B, B2.5-P1d - THE ISOLATION TEST FOR INCOMING SOURCE-SUBJECT
 * REFERENCE READING.
 *
 * Per the phase-isolation convention this slice is pinned by its OWN file over
 * its OWN range, REPAIR_BASE_COMMIT (the accepted B2.5-P1c terminal) to
 * REPAIR_TERMINAL_COMMIT. It proves, from the real git range and the real
 * source:
 *
 *   - the change set is EXACTLY the B2.2 store, the P1a assembler, the P1a,
 *     P1b and P1c tests whose assertions encoded "an incoming claim's source
 *     subject is never read", ONE recorded current-tree assertion of the P1c
 *     firewall, two new tests and this firewall; no S0 file, other registry
 *     module, migration, CLI, writer, reviewer, signer, evidence projection,
 *     cohort guard or dependency changes, and every earlier terminal pin
 *     stands;
 *   - each edited file removes exactly its recorded lines (the store none), the
 *     P1c firewall edit is exactly its recorded lines, and no edited test or
 *     firewall gains or loses a test;
 *   - the store stays SELECT-only with no runtime import and no new runtime
 *     export, sends every base statement unchanged plus exactly ONE new
 *     read-only statement - subject ROWS by an exact id array, ordered by id,
 *     LIMIT one beyond the request - runs it only on READ with an incoming
 *     report, after that report, over ids derived only from the report's
 *     included claims minus the subjects the graph holds, and never merges
 *     its rows into the graph or follows them anywhere;
 *   - the assembler keeps P1a's imports, exports, transaction protocol and
 *     fixed shape, adds ONLY rows the loader read for an added claim's source
 *     and not already held, keeps REFERENCED_RECORDS INCOMPLETE for any source
 *     neither held nor read, keeps REVIEW_RECORDS INCOMPLETE whenever a row is
 *     read, and states nothing stronger anywhere else;
 *   - nothing in production calls the assembler, and nothing else asks the
 *     loader for the source-subject read.
 * Each static rule is also run against MUTATED copies of the source, so a
 * rule that could never fire is itself a failure. What cannot be proven
 * statically - the read's behaviour, ordering, one snapshot, concurrent
 * commits - is proven by the unit and integration tests named below.
 *
 * THE RANGE IS OPEN to the working tree while the slice is uncommitted; the
 * terminal pin belongs to a separately authorised commit-closure phase.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as store from '../../orgunits/subjectRegistry/store.js';
import * as assembler from '../../orgunits/subjectSnapshotRead/assemble.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B2.5-P1c terminal (implementation d3ce2cc + firewall pin). */
const REPAIR_BASE_COMMIT = '8d9bca6a37c4362ff70abd07af83cca493cc518b';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = '889ac5ece912b5aa527db26856b94422c8062de2';

const STORE = 'src/orgunits/subjectRegistry/store.ts';
const ASSEMBLER = 'src/orgunits/subjectSnapshotRead/assemble.ts';
const P1A_INTEGRATION_TEST = 'src/test/integration/discoverySubjectSnapshotReadB25P1a.test.ts';
const P1B_INTEGRATION_TEST = 'src/test/integration/discoverySubjectHolderEnumerationB25P1b.test.ts';
const P1C_UNIT_TEST = 'src/test/unit/discoverySubjectIncomingRelationsB25P1c.test.ts';
const P1C_INTEGRATION_TEST = 'src/test/integration/discoverySubjectIncomingRelationsB25P1c.test.ts';
const P1C_FIREWALL = 'src/test/firewall/phase2bSubjectIncomingRelationsP1c.firewall.test.ts';
const UNIT_TEST = 'src/test/unit/discoverySubjectIncomingSourceSubjectsB25P1d.test.ts';
const INTEGRATION_TEST =
  'src/test/integration/discoverySubjectIncomingSourceSubjectsB25P1d.test.ts';
const FIREWALL = 'src/test/firewall/phase2bSubjectIncomingSourceSubjectsP1d.firewall.test.ts';

const AUTHORISED_CHANGESET = [
  `M\t${STORE}`,
  `M\t${ASSEMBLER}`,
  `M\t${P1A_INTEGRATION_TEST}`,
  `M\t${P1B_INTEGRATION_TEST}`,
  `M\t${P1C_UNIT_TEST}`,
  `M\t${P1C_INTEGRATION_TEST}`,
  `M\t${P1C_FIREWALL}`,
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
  'src/test/unit/discoverySubjectSnapshotReadB25P1a.test.ts',
  'src/test/unit/discoverySubjectHolderEnumerationB25P1b.test.ts',
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
  [P1C_FIREWALL]: 'd3ce2cc4674393abcb244249fcabf705c24d7e98',
};

/**
 * The EXACT edit to the P1c firewall: one CURRENT-TREE runtime assertion that
 * the loader limitations still say the source subjects are unread, which P1d
 * makes untrue for their ROWS. Removed verbatim; added by count and SHA-256.
 * Its pinned-tree checks, terminal pin and base commit are untouched.
 */
const P1C_FIREWALL_EDIT = {
  removed: ["      'INCOMING_RELATIONSHIP_SOURCE_SUBJECTS_AND_CLAIM_REVIEWS_NOT_READ',"],
  added: 6,
  addedSha256: '2e77cf2676d5c43aee44bb7019c7d6426c55cb02ff557479aaac935583d0f220',
};

/** The EXACT lines each edited file may remove, verbatim. Anything else removed fails. */
const REMOVED_LINES: Readonly<Record<string, readonly string[]>> = {
  [STORE]: [],
  [ASSEMBLER]: [
    ' * source subject or review chain the loader did not read (P1c).',
    "    'LOADER_READS_EVERY_TARGET_AND_REVIEW_CHAIN_IT_REFERENCES_INCOMING_SOURCE_SUBJECTS_UNREAD',",
    "    'LOADER_READS_EVERY_REVIEW_OF_EVERY_LOADED_RECORD_BOUND_REFUSED_INCOMING_CLAIM_REVIEWS_UNREAD',",
    "    'INCOMING_RELATIONSHIP_SOURCE_SUBJECTS_AND_CLAIM_REVIEWS_NOT_READ',",
    " * outcome (P1c), never a caller's.",
    '  // A source subject the loader did not read is identified, never retrieved;',
    '  // a claim it did not reach on its own came with no review chain.',
    '  const sourceSubjectUnread = addedClaims.some((r) => !loadedSubjects.has(r.subjectId));',
    '  const reviewChainUnread = addedClaims.some((r) => !loadedClaims.has(r.id));',
    '      subjects: input.subjects,',
  ],
  [P1A_INTEGRATION_TEST]: [
    "    it('P1a-10 (P1c): an enumerated incoming claim never brings its source subject or a parentage verdict', async () => {",
    "      await nameClaim(admin, incoming, 'Synthetic P1a Incoming');",
    '      expect(ids).not.toContain(incoming);',
    '      expect(m.omissions).toContainEqual({',
    "      expect(m.scope.categories.REFERENCED_RECORDS).toBe('INCOMPLETE');",
  ],
  [P1B_INTEGRATION_TEST]: [
    '      expect(m.membership.entries.map((e) => e.recordId)).not.toContain(incoming);',
    '      // P1c: the incoming claim is enumerated; its source subject is still not read.',
    "      expect(m.scope.categories.REFERENCED_RECORDS).toBe('INCOMPLETE');",
  ],
  [P1C_UNIT_TEST]: [
    '      return t.subjects.filter((s) => (v[0] as string[]).includes(s.id as string));',
    "      ...(unread ? { REFERENCED_RECORDS: 'INCOMPLETE', REVIEW_RECORDS: 'INCOMPLETE' } : {}),",
    '    // Each claim names a source subject the loader never read: an omission, never a placeholder.',
    "    expect(m.omissions.filter((o) => o.code === 'CLAIM_SUBJECT_NOT_SUPPLIED')).toEqual(",
    "      included.map((ref) => ({ code: 'CLAIM_SUBJECT_NOT_SUPPLIED', ref })),",
    "    expect(m.membership.entries.filter((e) => e.recordType === 'SUBJECT')).toHaveLength(1);",
    "  it('never represents a source subject unread: its own claims, relationships and reviews stay out', async () => {",
    '    for (const unread of [',
    '      source,',
    '      third,',
    '      sourceName.id,',
    '      sourceOther.id,',
    '      subjectReview.id,',
    '      claimReview.id,',
    '    ]) {',
    "    expect(m.omissions).toContainEqual({ code: 'CLAIM_SUBJECT_NOT_SUPPLIED', ref: claimIds[0] });",
    "    expect(m.scope.categories.REFERENCED_RECORDS).toBe('INCOMPLETE');",
    "    expect(m.states.unresolvedSourceOmissions).toBe('PRESENT');",
  ],
  [P1C_INTEGRATION_TEST]: [
    '      // No source subject was read: each included claim is an explicit omission.',
    "      expect(m.omissions.filter((o) => o.code === 'CLAIM_SUBJECT_NOT_SUPPLIED')).toEqual(",
    "        included.map((ref) => ({ code: 'CLAIM_SUBJECT_NOT_SUPPLIED', ref })),",
    '      );',
    '      expect(subjects.map((e) => e.recordId)).toEqual([focal]);',
    '      for (const s of sourceIds) expect(JSON.stringify(m)).not.toContain(s);',
    "      expect(m.scope.categories.REFERENCED_RECORDS).toBe(n > 0 ? 'INCOMPLETE' : 'REPRESENTED');",
    '      expect(m.membership.entries.map((e) => e.recordId)).not.toContain(sourceIds[0]);',
    "    it('P1c-12 / P1c-13: an unread source subject brings none of its claims, relationships or reviews', async () => {",
    '        source,',
    "      expect(m.omissions).toContainEqual({ code: 'CLAIM_SUBJECT_NOT_SUPPLIED', ref: claimIds[0] });",
    "      expect(m.scope.categories.REFERENCED_RECORDS).toBe('INCOMPLETE');",
    "      expect(m.states.unresolvedSourceOmissions).toBe('PRESENT');",
    "        'INCOMING_RELATIONSHIP_SOURCE_SUBJECTS_AND_CLAIM_REVIEWS_NOT_READ',",
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

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

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

/** The source between two markers (the first after `from`), or '' when either is missing. */
function sliceBetween(code: string, from: string, to: string): string {
  const start = code.indexOf(from);
  if (start < 0) return '';
  const end = code.indexOf(to, start + from.length);
  return end < 0 ? '' : code.slice(start, end);
}

// ---------------------------------------------------------------- the store

/** The ONE statement P1d adds: subject rows by an exact id array, id order, LIMIT $2. */
const SOURCE_STATEMENT =
  /^\s*SELECT id, registered_kind, registered_by_actor_key, registration_note,\s+\$\{iso\('created_at'\)\} AS created_at\s+FROM discovery_subjects WHERE id = ANY\(\$1::uuid\[\]\) ORDER BY id LIMIT \$2$/;

const SOURCE_BLOCK_START = '  let sourceSubjectRead: IncomingClaimSourceSubjectRead | undefined;';
const SOURCE_BLOCK_END = '  return {\n    ...(attestations !== undefined';

const STORE_REQUIRED = [
  // P1b and P1c, unchanged.
  'export const MAX_SHARED_IDENTIFIER_HOLDERS = 20;',
  'const SHARED_IDENTIFIER_HOLDER_QUERY_LIMIT = MAX_SHARED_IDENTIFIER_HOLDERS + 1;',
  'const MAX_INCOMING_RELATIONSHIP_CLAIMS = 20;',
  'const INCOMING_RELATIONSHIP_CLAIM_QUERY_LIMIT = MAX_INCOMING_RELATIONSHIP_CLAIMS + 1;',
  '[focalSubjectId, INCOMING_RELATIONSHIP_CLAIM_QUERY_LIMIT],',
  "if (options.incomingRelationships === 'REPORT') {",
  // P1d: the gate, the finite id set, the request bound and the result guard.
  "if (options.incomingClaimSourceSubjects === 'READ' && incomingEnumeration !== undefined) {",
  "  if (enumeration.outcome === 'UNKNOWN') return [];",
  'const named = [...new Set(enumeration.relationshipClaims.map((r) => r.subjectId))];',
  'if (named.length > MAX_INCOMING_RELATIONSHIP_CLAIMS) return null;',
  "if (!named.every((id) => typeof id === 'string' && SOURCE_SUBJECT_ID.test(id))) return null;",
  'return named.filter((id) => !heldSubjectIds.includes(id)).sort();',
  'subjectRows.map((s) => s.id),',
  'if (requested === null || requested.length === 0) {',
  '[requested, requested.length + 1],',
  'returned.length <= requested.length &&',
  "typeof row.id === 'string' &&",
  'requested.includes(row.id) &&',
  "(row.registration_note === null || typeof row.registration_note === 'string') &&\n        (i === 0 || returned[i - 1]!.id < row.id),",
  'subjects: wellFormed ? returned.map(subjectRecord) : [],',
  'unreadSubjectIds: requested.filter((id) => !read.includes(id)),',
];

/** Graph state the source-subject read may never write to, call or follow. */
const GRAPH_STATE =
  /relationshipRows|subjectIds|claimRows|reviewRows|recordedAt|loadReviews|loadIdentityClaims|loadReviewAttestations|knownEcheRowKeys|echeKeys|frontier|extraSubjectIds|holderEnumeration|discovery_subject_(identity|relationship)_claims|discovery_subject_reviews|subject_review_attestations|\.push\(|\.add\(/;

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
    'store-sql-not-base-plus-one-source-statement',
    (c, b) => {
      const current = sqlOf(c);
      const added = current.filter((s) => SOURCE_STATEMENT.test(s));
      return (
        added.length !== 1 ||
        JSON.stringify(current.filter((s) => !SOURCE_STATEMENT.test(s))) !==
          JSON.stringify(sqlOf(b))
      );
    },
  ],
  [
    'store-exports-changed',
    (c, b) => JSON.stringify(runtimeExportsOf(c)) !== JSON.stringify(runtimeExportsOf(b)),
  ],
  ['store-gate-id-set-and-result-guard', (c) => !STORE_REQUIRED.every((s) => c.includes(s))],
  [
    'store-source-read-expands-or-merges-into-the-graph',
    (c) => {
      const block = sliceBetween(c, SOURCE_BLOCK_START, SOURCE_BLOCK_END);
      return block.length === 0 || GRAPH_STATE.test(block);
    },
  ],
  [
    'store-source-read-before-the-incoming-report',
    (c) => {
      const body = c.slice(c.indexOf('export async function loadSubjectGraph('));
      const report = body.indexOf("if (options.incomingRelationships === 'REPORT') {");
      const read = body.indexOf(
        "if (options.incomingClaimSourceSubjects === 'READ' && incomingEnumeration !== undefined) {",
      );
      return report < 0 || read < 0 || read < report;
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

/** P1b's and P1c's fixed mappings, unchanged. */
const MAPPINGS = [
  `} = Object.freeze({
  EXHAUSTIVE: { enumeration: 'EXHAUSTIVE_AS_DECLARED', declaration: 'REPRESENTED' },
  TRUNCATED: { enumeration: 'TRUNCATED', declaration: 'INCOMPLETE' },
  UNKNOWN: { enumeration: 'UNKNOWN', declaration: 'UNKNOWN' },
});`,
  `} = Object.freeze({
  EXHAUSTIVE: { declaration: 'REPRESENTED', directions: ['INCOMING', 'OUTGOING'] },
  TRUNCATED: { declaration: 'INCOMPLETE', directions: ['INCOMING', 'OUTGOING'] },
  UNKNOWN: { declaration: 'UNKNOWN', directions: ['OUTGOING'] },
});`,
];

/** P1c's report derivation that P1d keeps verbatim. */
const INCOMING_DERIVATION = [
  'const incoming = graph.incomingRelationshipClaimEnumeration;',
  "const incomingScope = INCOMING_SCOPE_OF[incoming?.outcome ?? 'UNKNOWN'];",
  "incomingScope.declaration === 'UNKNOWN' ? [] : (incoming?.relationshipClaims ?? []);",
  'const loadedClaims = new Map(input.relationshipClaims.map((r) => [r.id, JSON.stringify(r)]));',
  'const addedClaims = incomingClaims.filter((r) => loadedClaims.get(r.id) !== JSON.stringify(r));',
  'const loadedSubjects = new Set(input.subjects.map((s) => s.id));',
  'INCOMING_RELATIONSHIP_CLAIMS: incomingScope.declaration,',
  'relationshipDirectionsExamined: [...incomingScope.directions],',
  'SHARED_IDENTIFIER_HOLDERS: holderScope.declaration,',
  'bound: holderBound,',
];

/** P1d: only rows read for an added claim's source and not held; gaps stay gaps. */
const SOURCE_DERIVATION = [
  'const addedSources = new Set(addedClaims.map((r) => r.subjectId));',
  "    incomingScope.declaration === 'UNKNOWN'\n      ? []\n      : (graph.incomingClaimSourceSubjectRead?.subjects ?? []).filter(\n          (s) => addedSources.has(s.id) && !loadedSubjects.has(s.id),\n        );",
  'const suppliedSubjects = new Set([...loadedSubjects, ...sourceSubjectsRead.map((s) => s.id)]);',
  'const sourceSubjectUnread = addedClaims.some((r) => !suppliedSubjects.has(r.subjectId));',
  '    addedClaims.some((r) => !loadedClaims.has(r.id)) || sourceSubjectsRead.length > 0;',
  "...(sourceSubjectUnread ? { REFERENCED_RECORDS: 'INCOMPLETE' as const } : {}),",
  "...(reviewChainUnread ? { REVIEW_RECORDS: 'INCOMPLETE' as const } : {}),",
];

/** What S0 is given as records: the loader's, the report's claims, the read rows - nothing else. */
const RECORDS_SHAPE = [
  'subjects: [...input.subjects, ...sourceSubjectsRead],',
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
      /createPrivateKey|createPublicKey|generateKeyPair|\bsign\s*\(|\bverify\s*\(|ed25519|ReviewTrustSet|ephemeralForVitest|testSeam|TrustedReviewerContext|VerifiedReviewEnvelope|appendAttestedReview|prepareReview|recordReview|execute(?:Propose|Claim|Relate)|verifyReviewAttestations|effectiveReviewProjection|deriveSubjectReadModel|loadReviewAttestations|loadSubjectPage|subjectExists|subjectOfClaim/.test(
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
      /[`'"](cand|chn|opp):|SAME_ACTOR|sameActor|INDEPENDENT_OF|identityRegister|nwf_identity|discovery-identity-handoff|nwf-identity\.|discovery-subject-evidence|compareSnapshotScopeWithReference/.test(
        c,
      ),
  ],
  [
    'stronger-state',
    (c) =>
      /'COMPLETE'|'COMPLETED'|\bisComplete\b|'FRESH'|'CURRENT'|'AUTHENTICATED'|'VERIFIED'|'SIGNED'|'CLEAR'|'CLEARED'|'NOT_PROTECTED'|'GRANTED'|'ALLOWED'|'ELIGIBLE'|'APPROVED'|granted:\s*true|'SYNTHETIC_IN_MEMORY'|'CALLER_ASSERTED_RAN'|'INDEPENDENT'|'NO_PARENT'|'PARENT'|'RESOLVED'|'EVERY_REFERENCE'/.test(
        c,
      ),
  ],
  [
    'enumeration-outside-the-mappings',
    (c) =>
      !MAPPINGS.every((m) => c.includes(m)) ||
      (c.match(/'EXHAUSTIVE_AS_DECLARED'/g) ?? []).length !== 1 ||
      (c.match(/'TRUNCATED'/g) ?? []).length !== 1 ||
      (c.match(/'INCOMING'/g) ?? []).length !== 2 ||
      (c.match(/'INCOMPLETE'/g) ?? []).length !== 6,
  ],
  [
    'gap-declared-represented',
    (c) =>
      /(INCOMING_RELATIONSHIP_CLAIMS|SHARED_IDENTIFIER_HOLDERS|REFERENCED_RECORDS|REVIEW_RECORDS|RECORD_SCOPED_FINDINGS|INPUT_SCOPED_FINDINGS|NEIGHBOUR_RECORD_FINDINGS|VALIDATION_INPUTS|SOURCE_GLOBALS|PROTECTION_STATUS):\s*'REPRESENTED'\s+as\s+const|(INCOMING_RELATIONSHIP_CLAIMS|SHARED_IDENTIFIER_HOLDERS|RECORD_SCOPED_FINDINGS|INPUT_SCOPED_FINDINGS|NEIGHBOUR_RECORD_FINDINGS|VALIDATION_INPUTS|SOURCE_GLOBALS|PROTECTION_STATUS):\s*'REPRESENTED'/.test(
        c,
      ) || (c.match(/'REPRESENTED'/g) ?? []).length !== 8,
  ],
  ['incoming-derivation', (c) => !INCOMING_DERIVATION.every((s) => c.includes(s))],
  ['source-derivation', (c) => !SOURCE_DERIVATION.every((s) => c.includes(s))],
  [
    'incoming-selected-from-the-graph',
    (c) => /targetSubjectId|\.predicate\b|predicate:|identityClaims\s*\.filter|claimKind/.test(c),
  ],
  [
    'records-beyond-the-loader-the-report-and-the-read',
    (c) =>
      !RECORDS_SHAPE.every((s) => c.includes(s)) ||
      (c.match(/\bsubjects:/g) ?? []).length !== 1 ||
      (c.match(/\breviews:/g) ?? []).length !== 1 ||
      (c.match(/\bidentityClaims:/g) ?? []).length !== 1 ||
      (c.match(/incomingClaimSourceSubjectRead\?\.subjects/g) ?? []).length !== 1,
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
        "incomingClaimSourceSubjects: 'READ',",
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

/** P1a's transaction protocol, with every loader read requested inside it. */
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
  "incomingClaimSourceSubjects: 'READ',",
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
    (body.match(/await loadSubjectGraph\(/g) ?? []).length === 1 &&
    body.includes("if (phase === 'OPEN') discard = !(await endAfterError(connection));") &&
    body.includes('let discard = true;')
  );
};

const describeRange = rangeAvailable ? describe : describe.skip;

describeRange('B2.5-P1d source-subject reading: the change stays inside its scope', () => {
  it('changes exactly the authorised files, by path and status', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('touches no S0 file, other registry module, earlier slice, migration, CLI, helper or dependency', () => {
    expect(changeset(...PROTECTED_PATHS)).toEqual([]);
  });

  it('adds its own firewall and edits exactly one earlier one, by exactly its recorded lines', () => {
    expect(changeset('src/test/firewall/')).toEqual([`A\t${FIREWALL}`, `M\t${P1C_FIREWALL}`]);
    const { removed, added } = diffLines(P1C_FIREWALL);
    expect(removed).toEqual(P1C_FIREWALL_EDIT.removed);
    expect(added).toHaveLength(P1C_FIREWALL_EDIT.added);
    expect(sha256(added.join('\n'))).toBe(P1C_FIREWALL_EDIT.addedSha256);
    expect(added.join('\n')).not.toMatch(
      /\.(skip|only|todo|skipIf|runIf)\b|timeout|\bcatch\b|try\s*\{|expect\.soft|process\.env|not\.toContain/i,
    );
  });

  it('keeps every earlier terminal pin and base commit, and every other firewall byte-identical', () => {
    for (const [file, pin] of Object.entries(EARLIER_TERMINAL_PINS)) {
      const line = `const REPAIR_TERMINAL_COMMIT: string | null = '${pin}';`;
      expect(sourceOf(file), file).toContain(line);
      expect(baseSourceOf(file), file).toContain(line);
      const base = /const REPAIR_BASE_COMMIT = '[0-9a-f]{40}';/.exec(baseSourceOf(file))![0];
      expect(sourceOf(file), file).toContain(base);
      if (file !== P1C_FIREWALL) expect(sourceOf(file), file).toBe(baseSourceOf(file));
    }
  });

  it('keeps every pinned-tree (historical) check of the P1c firewall untouched', () => {
    const before = baseSourceOf(P1C_FIREWALL);
    const after = sourceOf(P1C_FIREWALL);
    const at = (s: string) => s.indexOf("it('exports exactly the P1a surface, with UNKNOWN");
    expect(after.slice(0, at(after))).toBe(before.slice(0, at(before)));
    const tail = (s: string) =>
      s.slice(s.indexOf("it('has no production importer, and nothing else"));
    expect(tail(after)).toBe(tail(before));
  });

  it('removes exactly the recorded lines from each edited file, and nothing else', () => {
    for (const [file, removed] of Object.entries(REMOVED_LINES)) {
      expect(diffLines(file).removed, file).toEqual(removed);
    }
  });

  it('gains or loses no test in an edited test or firewall, and adds no skip, focus or timeout', () => {
    const tests = (source: string) => (codeOf(source).match(/\bit(\.each)?\(/g) ?? []).length;
    for (const file of [
      P1A_INTEGRATION_TEST,
      P1B_INTEGRATION_TEST,
      P1C_UNIT_TEST,
      P1C_INTEGRATION_TEST,
      P1C_FIREWALL,
    ]) {
      expect(tests(sourceOf(file)), file).toBe(tests(baseSourceOf(file)));
      expect(diffLines(file).added.join('\n'), file).not.toMatch(
        /\.(skip|only|todo|skipIf|runIf)\b|timeout|\bcatch\b|try\s*\{|expect\.soft|process\.env/i,
      );
    }
  });
});

describe('B2.5-P1d source-subject reading: the store reads rows by exact id, beside the graph', () => {
  it('breaks none of its static rules', () => {
    expect(storeViolationsOf(sourceOf(STORE))).toEqual([]);
  });

  it('sends exactly one statement more than the base: subject rows by an exact id array', () => {
    const current = sqlOf(codeOf(sourceOf(STORE)));
    const base = sqlOf(codeOf(baseSourceOf(STORE)));
    expect(current).toHaveLength(base.length + 1);
    expect(current.filter((s) => SOURCE_STATEMENT.test(s))).toHaveLength(1);
  });

  it('exports no new runtime name, and none that names a resolution, merge or link', () => {
    expect(Object.keys(store).sort()).toEqual(runtimeExportsOf(codeOf(baseSourceOf(STORE))));
    for (const name of Object.keys(store)) {
      expect(name).not.toMatch(
        /merge|split|unify|dedup|resolv|link|equivalen|sameActor|promot|canonical|issue|mint|handoff|adopt|candidate|channel|opportunit/i,
      );
    }
  });
});

describe('B2.5-P1d source-subject reading: the assembler adds only rows read for its claims', () => {
  const source = sourceOf(ASSEMBLER);

  it('breaks none of its static rules and keeps the P1a transaction protocol', () => {
    expect(assemblerViolationsOf(source)).toEqual([]);
    expect(protocolHolds(source)).toBe(true);
  });

  it('exports exactly the P1a surface and states the row-only limitation', () => {
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
    expect(assembler.SCOPE_DECLARATIONS.PROTECTION_STATUS).toBe('UNKNOWN');
    expect(assembler.SNAPSHOT_READ_FACTS.durableSourceRevision).toBe('NONE');
    expect(assembler.SNAPSHOT_READ_FACTS.loaderLimitations).toEqual(
      expect.arrayContaining([
        'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_NOT_READ',
        'INCOMING_RELATIONSHIP_SOURCE_SUBJECT_ROWS_ONLY_THEIR_CLAIMS_RELATIONSHIPS_REVIEWS_NOT_READ',
        'NEIGHBOUR_RELATIONSHIPS_LIMITED_TO_THE_PART_OF_CHAIN',
        'PROTECTED_REGISTRY_NOT_CONSULTED',
        'VALIDATOR_NOT_RUN',
      ]),
    );
  });

  it('has no production importer, and nothing else asks the loader for the source-subject read', () => {
    for (const file of productionFiles()) {
      const code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));
      if (file !== ASSEMBLER) {
        expect(code, file).not.toMatch(
          /subjectSnapshotRead|assembleSubjectSnapshotScope|SubjectSnapshotReadRefusal|SNAPSHOT_READ_FACTS/,
        );
      }
      if (file !== ASSEMBLER && file !== STORE) {
        expect(code, file).not.toMatch(
          /incomingClaimSourceSubjects|incomingClaimSourceSubjectRead|IncomingClaimSourceSubjectRead/,
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
      expect(test, file).not.toMatch(/subjectRegistry\/writer|subjectReview\/|researchCohortGuard/);
    }
    expect(codeOf(sourceOf(UNIT_TEST))).not.toMatch(/describe\.skip/);
    expect(codeOf(sourceOf(INTEGRATION_TEST)).match(/describe\.skip/g)).toEqual(['describe.skip']);
    expect(codeOf(sourceOf(INTEGRATION_TEST))).toContain(
      "const describeDb = databaseConfigured() && testDatabaseUrl('readonly') ? describe : describe.skip;",
    );
  });
});

describe('B2.5-P1d source-subject reading: every static rule can fire (mutation oracles)', () => {
  const storeSource = sourceOf(STORE);
  const source = sourceOf(ASSEMBLER);
  // A pattern missing from the source leaves it unchanged, and that oracle then fails on its own.
  const swapIn = (text: string, from: string, to: string) => text.replace(from, to);

  it.each([
    ['store-runtime-import', `import pg from 'pg';\n${storeSource}`],
    ['store-mutating-or-transaction-sql', `${storeSource}\nconst q = 'DELETE FROM x';`],
    // Dropping the deterministic order, or the request bound.
    [
      'store-sql-not-base-plus-one-source-statement',
      swapIn(
        storeSource,
        'WHERE id = ANY($1::uuid[]) ORDER BY id LIMIT $2',
        'WHERE id = ANY($1::uuid[]) LIMIT $2',
      ),
    ],
    [
      'store-sql-not-base-plus-one-source-statement',
      swapIn(
        storeSource,
        'WHERE id = ANY($1::uuid[]) ORDER BY id LIMIT $2',
        'WHERE id = ANY($1::uuid[]) ORDER BY id',
      ),
    ],
    // Widening the read to a source subject's own claims.
    [
      'store-sql-not-base-plus-one-source-statement',
      `${storeSource}\nconst wider = \`SELECT * FROM discovery_subject_identity_claims WHERE subject_id = ANY($1::uuid[])\`;`,
    ],
    ['store-exports-changed', `${storeSource}\nexport function readIncomingSources() {}`],
    // Silently omitting a known referenced subject from the request.
    [
      'store-gate-id-set-and-result-guard',
      swapIn(
        storeSource,
        'return named.filter((id) => !heldSubjectIds.includes(id)).sort();',
        'return named.filter((id) => !heldSubjectIds.includes(id)).sort().slice(1);',
      ),
    ],
    // Accepting duplicated, foreign or unordered rows.
    [
      'store-gate-id-set-and-result-guard',
      swapIn(
        storeSource,
        "(row.registration_note === null || typeof row.registration_note === 'string') &&\n        (i === 0 || returned[i - 1]!.id < row.id),",
        "(row.registration_note === null || typeof row.registration_note === 'string'),",
      ),
    ],
    [
      'store-gate-id-set-and-result-guard',
      swapIn(storeSource, 'requested.includes(row.id) &&', ''),
    ],
    [
      'store-gate-id-set-and-result-guard',
      swapIn(storeSource, 'returned.length <= requested.length &&', ''),
    ],
    // Using rows from a result the guard refused.
    [
      'store-gate-id-set-and-result-guard',
      swapIn(
        storeSource,
        'subjects: wellFormed ? returned.map(subjectRecord) : [],',
        'subjects: returned.map(subjectRecord),',
      ),
    ],
    // Reading without the incoming report, or past an UNKNOWN one.
    [
      'store-gate-id-set-and-result-guard',
      swapIn(
        storeSource,
        "if (options.incomingClaimSourceSubjects === 'READ' && incomingEnumeration !== undefined) {",
        "if (options.incomingClaimSourceSubjects !== 'OMIT' && incomingEnumeration !== undefined) {",
      ),
    ],
    [
      'store-gate-id-set-and-result-guard',
      swapIn(storeSource, "  if (enumeration.outcome === 'UNKNOWN') return [];\n", ''),
    ],
    // Unauthorised graph expansion: merging the rows, or following them.
    [
      'store-source-read-expands-or-merges-into-the-graph',
      swapIn(
        storeSource,
        '      sourceSubjectRead = sourceSubjectReadOf(requested, sources);\n',
        '      sourceSubjectRead = sourceSubjectReadOf(requested, sources);\n      subjectRows.push(...sources);\n',
      ),
    ],
    [
      'store-source-read-expands-or-merges-into-the-graph',
      swapIn(
        storeSource,
        '      sourceSubjectRead = sourceSubjectReadOf(requested, sources);\n',
        '      sourceSubjectRead = sourceSubjectReadOf(requested, sources);\n      await loadIdentityClaims(q, requested);\n',
      ),
    ],
    [
      'store-source-read-before-the-incoming-report',
      swapIn(
        storeSource,
        '  // Direct incoming claims, reported beside the graph and never merged into it.\n',
        "  // Direct incoming claims, reported beside the graph and never merged into it.\n  if (options.incomingClaimSourceSubjects === 'READ' && incomingEnumeration !== undefined) {\n  }\n",
      ),
    ],
  ])('fires %s on a mutated store (case %#)', (rule, mutated) => {
    expect(mutated).not.toBe(storeSource);
    expect(storeViolationsOf(mutated)).toContain(rule);
  });

  const inject = (line: string) =>
    source.replace("import type pg from 'pg';", `import type pg from 'pg';\n${line}`);
  const swap = (from: string, to: string) => swapIn(source, from, to);

  it.each([
    // Forbidden writer or signing imports.
    ['imports', inject("import { executeClaim } from '../subjectRegistry/writer.js';")],
    ['imports', inject("import { signIntent } from '../subjectReview/signer.js';")],
    ['imports', swap('  databaseNow,\n', '  databaseNow,\n  subjectExists,\n')],
    ['dynamic-import', `${source}\nconst later = () => import('../subjectReview/signer.js');`],
    ['review-signing-trust-or-write', `${source}\nconst s = (k: unknown) => sign(k);`],
    ['own-pool-or-environment', `${source}\nconst url = process.env['DATABASE_URL_READONLY'];`],
    [
      'mutating-or-session-sql',
      `${source}\nconst q = 'INSERT INTO discovery_subjects VALUES (1)';`,
    ],
    ['own-table-access', `${source}\nconst q = 'SELECT id FROM discovery_subjects';`],
    ['one-connect', `${source}\nconst second = () => source.connect();`],
    ['canonical-identity-or-cross-track-contract', `${source}\nconst id = 'chn:x';`],
    ['stronger-state', `${source}\nconst s = 'RESOLVED';`],
    // Incorrect promotion of reference completeness.
    [
      'source-derivation',
      swap("...(sourceSubjectUnread ? { REFERENCED_RECORDS: 'INCOMPLETE' as const } : {}),", ''),
    ],
    [
      'source-derivation',
      swap(
        'const suppliedSubjects = new Set([...loadedSubjects, ...sourceSubjectsRead.map((s) => s.id)]);',
        'const suppliedSubjects = new Set([...loadedSubjects, ...addedSources]);',
      ),
    ],
    [
      'gap-declared-represented',
      swap(
        "...(sourceSubjectUnread ? { REFERENCED_RECORDS: 'INCOMPLETE' as const } : {}),",
        "...(sourceSubjectUnread ? { REFERENCED_RECORDS: 'REPRESENTED' as const } : {}),",
      ),
    ],
    // Incorrect promotion of review completeness.
    [
      'source-derivation',
      swap(
        '    addedClaims.some((r) => !loadedClaims.has(r.id)) || sourceSubjectsRead.length > 0;',
        '    addedClaims.some((r) => !loadedClaims.has(r.id));',
      ),
    ],
    [
      'source-derivation',
      swap("...(reviewChainUnread ? { REVIEW_RECORDS: 'INCOMPLETE' as const } : {}),", ''),
    ],
    // Unauthorised graph expansion: rows nobody's claim names, or overwriting a loaded record.
    [
      'source-derivation',
      swap(
        '          (s) => addedSources.has(s.id) && !loadedSubjects.has(s.id),',
        '          (s) => !loadedSubjects.has(s.id),',
      ),
    ],
    [
      'source-derivation',
      swap(
        '          (s) => addedSources.has(s.id) && !loadedSubjects.has(s.id),',
        '          (s) => addedSources.has(s.id),',
      ),
    ],
    [
      'source-derivation',
      swap(
        "    incomingScope.declaration === 'UNKNOWN'\n      ? []\n",
        "    incomingScope.declaration === 'NEVER'\n      ? []\n",
      ),
    ],
    [
      'records-beyond-the-loader-the-report-and-the-read',
      swap(
        'subjects: [...input.subjects, ...sourceSubjectsRead],',
        'subjects: [...input.subjects, ...(graph.incomingClaimSourceSubjectRead?.subjects ?? [])],',
      ),
    ],
    // Silent omission of a known referenced subject.
    [
      'records-beyond-the-loader-the-report-and-the-read',
      swap('subjects: [...input.subjects, ...sourceSubjectsRead],', 'subjects: input.subjects,'),
    ],
    [
      'records-beyond-the-loader-the-report-and-the-read',
      `${source}\nconst more = { identityClaims: [] };`,
    ],
    ['fixed-input-shape', swap("      incomingClaimSourceSubjects: 'READ',\n", '')],
    [
      'exported-functions',
      swap('function snapshotScopeInputOf(', 'export function snapshotScopeInputOf('),
    ],
  ])('fires %s on a mutated assembler (case %#)', (rule, mutated) => {
    expect(mutated).not.toBe(source);
    expect(assemblerViolationsOf(mutated)).toContain(rule);
  });

  it('fails a protocol that drops the read, reads after the end check, or loads twice', () => {
    expect(protocolHolds(swap("      incomingClaimSourceSubjects: 'READ',\n", ''))).toBe(false);
    const late = source
      .replace("      incomingClaimSourceSubjects: 'READ',\n", '')
      .replace(
        '    const end = await readSnapshotState(connection);\n',
        "    const end = await readSnapshotState(connection);\n    void { incomingClaimSourceSubjects: 'READ', };\n",
      );
    expect(late).not.toBe(source);
    expect(protocolHolds(late)).toBe(false);
    const twice = source.replace(
      '    const end = await readSnapshotState(connection);\n',
      '    await loadSubjectGraph(connection, focalSubjectId, { asOf: "x" });\n    const end = await readSnapshotState(connection);\n',
    );
    expect(twice).not.toBe(source);
    expect(protocolHolds(twice)).toBe(false);
  });
});

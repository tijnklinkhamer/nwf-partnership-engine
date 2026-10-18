/**
 * TRACK B, B2.5-P1e - THE ISOLATION TEST FOR INCOMING RELATIONSHIP-CLAIM
 * REVIEW COVERAGE.
 *
 * Per the phase-isolation convention this slice is pinned by its OWN file over
 * its OWN range, REPAIR_BASE_COMMIT (the accepted B2.5-P1d terminal) to
 * REPAIR_TERMINAL_COMMIT. It proves, from the real git range and the real
 * source:
 *
 *   - the change set is EXACTLY the B2.2 store, the P1a assembler, the P1c and
 *     P1d tests whose assertions encoded "an incoming claim's reviews are never
 *     read", ONE recorded current-tree assertion each of the P1c and P1d
 *     firewalls, two new tests and this firewall; no S0 file, other registry
 *     module, review protocol, signer, trust set, migration, CLI, writer,
 *     evidence projection, cohort guard or dependency changes, and every
 *     earlier terminal pin stands;
 *   - each edited file removes exactly its recorded lines (the store none), the
 *     two firewall edits are exactly their recorded lines, outside them both
 *     firewalls are byte-identical, and no edited test or firewall gains or
 *     loses a test;
 *   - the store stays SELECT-only with no new import and no new runtime
 *     export, sends every base statement unchanged plus exactly ONE new
 *     read-only statement - attestation REFERENCES (never payloads,
 *     signatures or nonces) by an exact review-id array, id order, under the
 *     loader bound - reuses the loader's own review statement for the reviews,
 *     runs both only on READ with an incoming report and loaded attestations,
 *     after that report, over relationship-claim target keys derived only from
 *     the report's included claims minus the claims the graph holds, guards
 *     the result, and never merges its rows into the graph or follows them;
 *   - the assembler keeps P1a's imports, exports, transaction protocol and
 *     fixed shape, adds ONLY reviews and references the loader read in full
 *     for an added, unreached claim, keeps REVIEW_RECORDS INCOMPLETE for any
 *     such claim whose reviews were not read and for any added claim whose
 *     source subject the graph does not hold, never judges a chain or a
 *     review outcome, and states nothing stronger anywhere else;
 *   - nothing in production calls the assembler, and nothing else asks the
 *     loader for the claim-review read.
 * Each static rule is also run against MUTATED copies of the source, so a
 * rule that could never fire is itself a failure. What cannot be proven
 * statically - the read's behaviour, ordering, the bound, one snapshot,
 * concurrent commits - is proven by the unit and integration tests named
 * below.
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

/** The accepted B2.5-P1d terminal (implementation 889ac5e + firewall pin). */
const REPAIR_BASE_COMMIT = '20f9b3322c90eb740e2e21079eb5f43ce5d6620d';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = null;

const STORE = 'src/orgunits/subjectRegistry/store.ts';
const ASSEMBLER = 'src/orgunits/subjectSnapshotRead/assemble.ts';
const P1C_UNIT_TEST = 'src/test/unit/discoverySubjectIncomingRelationsB25P1c.test.ts';
const P1C_INTEGRATION_TEST = 'src/test/integration/discoverySubjectIncomingRelationsB25P1c.test.ts';
const P1D_UNIT_TEST = 'src/test/unit/discoverySubjectIncomingSourceSubjectsB25P1d.test.ts';
const P1D_INTEGRATION_TEST =
  'src/test/integration/discoverySubjectIncomingSourceSubjectsB25P1d.test.ts';
const P1C_FIREWALL = 'src/test/firewall/phase2bSubjectIncomingRelationsP1c.firewall.test.ts';
const P1D_FIREWALL = 'src/test/firewall/phase2bSubjectIncomingSourceSubjectsP1d.firewall.test.ts';
const UNIT_TEST = 'src/test/unit/discoverySubjectIncomingClaimReviewsB25P1e.test.ts';
const INTEGRATION_TEST = 'src/test/integration/discoverySubjectIncomingClaimReviewsB25P1e.test.ts';
const FIREWALL = 'src/test/firewall/phase2bSubjectIncomingClaimReviewsP1e.firewall.test.ts';

const AUTHORISED_CHANGESET = [
  `M\t${STORE}`,
  `M\t${ASSEMBLER}`,
  `M\t${P1C_UNIT_TEST}`,
  `M\t${P1C_INTEGRATION_TEST}`,
  `M\t${P1D_UNIT_TEST}`,
  `M\t${P1D_INTEGRATION_TEST}`,
  `M\t${P1C_FIREWALL}`,
  `M\t${P1D_FIREWALL}`,
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
  'src/test/integration/discoverySubjectSnapshotReadB25P1a.test.ts',
  'src/test/integration/discoverySubjectHolderEnumerationB25P1b.test.ts',
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
  [P1D_FIREWALL]: '889ac5ece912b5aa527db26856b94422c8062de2',
};

/**
 * The EXACT edits to the two earlier firewalls (OWNER sign-off required before
 * commit): in each, ONE CURRENT-TREE runtime assertion that the loader
 * limitations still say the incoming claims' reviews are unread, which P1e
 * makes untrue. Removed verbatim; added by count and SHA-256. Each lies inside
 * the named `it(` block and nothing outside that block changes; terminal pins
 * and base commits are untouched.
 */
const FIREWALL_EDITS: Readonly<
  Record<
    string,
    {
      readonly removed: readonly string[];
      readonly added: number;
      readonly addedSha256: string;
      readonly block: string;
      readonly next: string;
    }
  >
> = {
  [P1C_FIREWALL]: {
    removed: [
      "    // id; their claims, relationships and reviews, and the claims' reviews, are not.",
      "      'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_NOT_READ',",
    ],
    added: 3,
    addedSha256: '536d2a53c9feb84331a3349e162e31e2b876f6f626a10742154ece7af4ea5e88',
    block: "  it('exports exactly the P1a surface, with UNKNOWN as the static incoming fallback',",
    next: "  it('has no production importer, and nothing else asks the loader for the incoming report',",
  },
  [P1D_FIREWALL]: {
    removed: ["        'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_NOT_READ',"],
    added: 2,
    addedSha256: '592a7f6345df9c9e60f2c1b0cf79eb551216688bc967359de84ad628dd0052cb',
    block: "  it('exports exactly the P1a surface and states the row-only limitation',",
    next: "  it('has no production importer, and nothing else asks the loader for the source-subject read',",
  },
};

/** The EXACT lines each edited file may remove, verbatim. Anything else removed fails. */
const REMOVED_LINES: Readonly<Record<string, readonly string[]>> = {
  [STORE]: [],
  [ASSEMBLER]: [
    ' * reference, never its own review chain: REVIEW_RECORDS stays INCOMPLETE.',
    "    'LOADER_READS_EVERY_REVIEW_OF_EVERY_LOADED_RECORD_BOUND_REFUSED_INCOMING_CLAIM_AND_SOURCE_SUBJECT_REVIEWS_UNREAD',",
    "  REVIEW_ATTESTATION_REFERENCES: 'LOADER_READS_EVERY_ATTESTATION_OF_EVERY_LOADED_REVIEW',",
    "    'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_NOT_READ',",
    ' * source-subject rows the loader read for those claims (P1d).',
    '  // A claim the loader did not reach on its own came with no review chain, and',
    '  // a source-subject row read by id came with none of its own.',
    '    addedClaims.some((r) => !loadedClaims.has(r.id)) || sourceSubjectsRead.length > 0;',
    '      reviews: input.reviews,',
    '      attestationReferences: attestations.records.map((a) => ({',
    '        id: a.id,',
    '        reviewId: a.reviewId,',
    '        keyId: a.keyId,',
    '        payloadSha256: a.payloadSha256,',
    '      })),',
  ],
  [P1C_UNIT_TEST]: [
    '    for (const unread of [third, sourceName.id, sourceOther.id, subjectReview.id, claimReview.id]) {',
    '    expect(m.reviews.chains).toEqual([]);',
    "  it('keeps REFERENCED_RECORDS when the source subject was read for another reason, never its review chain', async () => {",
    "    expect(m.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');",
    '    expect(m.reviews.chains).toEqual([]);',
  ],
  [P1C_INTEGRATION_TEST]: [
    '        claimReview.reviewId,',
    '        claimReview.attestationId,',
    '      expect(m.reviews.chains).toEqual([]);',
  ],
  [P1D_UNIT_TEST]: [
    '      claimReview.id,',
    '      ...t.attestations.map((a) => a.id),',
    '    expect(m.reviews.chains).toEqual([]);',
    "        'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_NOT_READ',",
  ],
  [P1D_INTEGRATION_TEST]: [
    '        claimReview.reviewId,',
    '        claimReview.attestationId,',
    '      expect(m.reviews.chains).toEqual([]);',
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

/** The ONE statement P1e adds: attestation REFERENCES by an exact review-id array, id order, LIMIT $2. */
const REFERENCE_STATEMENT =
  /^\s*SELECT id, review_id, key_id, payload_sha256\s+FROM subject_review_attestations\s+WHERE review_id = ANY\(\$1::uuid\[\]\)\s+ORDER BY id\s+LIMIT \$2\s*$/;

const REVIEW_BLOCK_START = '  let claimReviewRead: IncomingClaimReviewRead | undefined;';
const REVIEW_BLOCK_END = '  return {\n    ...(attestations !== undefined';
const GUARD_START = 'function claimReviewReadOf(';
const GUARD_END = '\nexport type Queryable';
const IDS_START = 'function claimIdsToReview(';
const IDS_END = 'function claimReviewReadOf(';

const STORE_REQUIRED = [
  // P1b, P1c and P1d, unchanged.
  'export const MAX_SHARED_IDENTIFIER_HOLDERS = 20;',
  'const MAX_INCOMING_RELATIONSHIP_CLAIMS = 20;',
  'const INCOMING_RELATIONSHIP_CLAIM_QUERY_LIMIT = MAX_INCOMING_RELATIONSHIP_CLAIMS + 1;',
  '[focalSubjectId, INCOMING_RELATIONSHIP_CLAIM_QUERY_LIMIT],',
  "if (options.incomingRelationships === 'REPORT') {",
  "if (options.incomingClaimSourceSubjects === 'READ' && incomingEnumeration !== undefined) {",
  // P1e: the gate, the finite claim set, the reused review statement and the bound.
  "    options.incomingClaimReviews === 'READ' &&\n    incomingEnumeration !== undefined &&\n    attestations !== undefined\n  ) {",
  'relationshipRows.map((r) => r.id),',
  'if (requested === null || requested.length === 0) {',
  'const claimReviews = await loadReviews(\n        q,\n        requested.map((id) => `relationship_claim:${id}`),\n      );',
  'claimReviews.length === 0\n          ? []\n          : bounded(',
  '[claimReviews.map((r) => r.id), MAX_GRAPH_ROWS + 1],',
  "'incoming claim review attestations',",
  'claimReviewRead = claimReviewReadOf(requested, claimReviews, references);',
];

/** The claim-id derivation, exactly: the report's included claims, never the sentinel, minus held claims. */
const IDS_REQUIRED = [
  "  if (enumeration.outcome === 'UNKNOWN') return [];",
  'const included = [...new Set(enumeration.relationshipClaims.map((r) => r.id))];',
  'if (included.length > MAX_INCOMING_RELATIONSHIP_CLAIMS) return null;',
  "if (!included.every((id) => typeof id === 'string' && SOURCE_SUBJECT_ID.test(id))) return null;",
  'return included.filter((id) => !heldClaimIds.includes(id)).sort();',
];

/** The result guard, exactly: whole or UNKNOWN, never repaired, never partially used. */
const GUARD_REQUIRED = [
  'row.reviewed_subject_id === null &&',
  'row.reviewed_identity_claim_id === null &&',
  "typeof row.reviewed_relationship_claim_id === 'string' &&",
  'requested.includes(row.reviewed_relationship_claim_id) &&',
  'target.get(row.supersedes_review_id) === row.reviewed_relationship_claim_id) &&',
  '(i === 0 || returned[i - 1]!.id < row.id),',
  'new Set(references.map((row) => row.review_id)).size === references.length &&',
  'target.has(row.review_id) &&',
  '(i === 0 || references[i - 1]!.id < row.id),',
  'const whole = reviewsWhole && referencesWhole;',
  "outcome: whole ? 'EVERY_MATCHING_ROW_READ' : 'UNKNOWN',",
  'reviews: whole ? returned.map(reviewRecord) : [],',
  'attestationReferences: whole\n      ? references.map((row) => ({',
];

/** Graph state, other statements and other targets the claim-review read may never touch. */
const REVIEW_BLOCK_FORBIDDEN =
  /subjectRows|subjectIds|claimRows|reviewRows|recordedAt|loadIdentityClaims|loadReviewAttestations|reviewEnvironmentId|knownEcheRowKeys|echeKeys|frontier|extraSubjectIds|holderEnumeration|sourceSubjectRead\b|discovery_subject|signed_payload|signature|nonce|environment_id|`subject:|`identity_claim:|\.push\(|\.add\(|\.set\(/;

const STORE_RULES: readonly (readonly [string, (code: string, base: string) => boolean])[] = [
  ['store-runtime-import', (c) => /^import\s+(?!type\b)/m.test(c)],
  [
    'store-imports-changed',
    (c, b) => JSON.stringify(importStatementsOf(c)) !== JSON.stringify(importStatementsOf(b)),
  ],
  [
    'store-mutating-or-transaction-sql',
    (c) =>
      /\b(INSERT|UPDATE|DELETE|TRUNCATE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|LOCK|GRANT|REVOKE|CREATE|ALTER|DROP|COPY)\b|\bSET\s+(TRANSACTION|SESSION|LOCAL|ROLE)\b|\bFOR\s+(UPDATE|SHARE)\b/.test(
        c,
      ),
  ],
  [
    'store-sql-not-base-plus-one-reference-statement',
    (c, b) => {
      const current = sqlOf(c);
      const added = current.filter((s) => REFERENCE_STATEMENT.test(s));
      return (
        added.length !== 1 ||
        JSON.stringify(current.filter((s) => !REFERENCE_STATEMENT.test(s))) !==
          JSON.stringify(sqlOf(b))
      );
    },
  ],
  [
    'store-exports-changed',
    (c, b) => JSON.stringify(runtimeExportsOf(c)) !== JSON.stringify(runtimeExportsOf(b)),
  ],
  ['store-gate-and-bound', (c) => !STORE_REQUIRED.every((s) => c.includes(s))],
  [
    'store-claim-set-not-the-included-claims',
    (c) => !IDS_REQUIRED.every((s) => sliceBetween(c, IDS_START, IDS_END).includes(s)),
  ],
  [
    'store-result-guard',
    (c) => !GUARD_REQUIRED.every((s) => sliceBetween(c, GUARD_START, GUARD_END).includes(s)),
  ],
  [
    'store-review-read-expands-or-merges-into-the-graph',
    (c) => {
      const block = sliceBetween(c, REVIEW_BLOCK_START, REVIEW_BLOCK_END);
      return (
        block.length === 0 ||
        REVIEW_BLOCK_FORBIDDEN.test(block) ||
        (block.match(/await loadReviews\(/g) ?? []).length !== 1 ||
        (block.match(/await q\.query/g) ?? []).length !== 1
      );
    },
  ],
  [
    'store-review-read-before-the-incoming-report-or-attestations',
    (c) => {
      const body = c.slice(c.indexOf('export async function loadSubjectGraph('));
      const report = body.indexOf("if (options.incomingRelationships === 'REPORT') {");
      const loaded = body.indexOf('const attestations =');
      const read = body.indexOf(REVIEW_BLOCK_START);
      return report < 0 || loaded < 0 || read < 0 || read < report || read < loaded;
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

/** P1c's and P1d's derivations that P1e keeps verbatim. */
const EARLIER_DERIVATION = [
  'const incoming = graph.incomingRelationshipClaimEnumeration;',
  "const incomingScope = INCOMING_SCOPE_OF[incoming?.outcome ?? 'UNKNOWN'];",
  "incomingScope.declaration === 'UNKNOWN' ? [] : (incoming?.relationshipClaims ?? []);",
  'const loadedClaims = new Map(input.relationshipClaims.map((r) => [r.id, JSON.stringify(r)]));',
  'const addedClaims = incomingClaims.filter((r) => loadedClaims.get(r.id) !== JSON.stringify(r));',
  'const loadedSubjects = new Set(input.subjects.map((s) => s.id));',
  'const addedSources = new Set(addedClaims.map((r) => r.subjectId));',
  '          (s) => addedSources.has(s.id) && !loadedSubjects.has(s.id),',
  'const suppliedSubjects = new Set([...loadedSubjects, ...sourceSubjectsRead.map((s) => s.id)]);',
  'const sourceSubjectUnread = addedClaims.some((r) => !suppliedSubjects.has(r.subjectId));',
  "...(sourceSubjectUnread ? { REFERENCED_RECORDS: 'INCOMPLETE' as const } : {}),",
  'INCOMING_RELATIONSHIP_CLAIMS: incomingScope.declaration,',
  'relationshipDirectionsExamined: [...incomingScope.directions],',
  'SHARED_IDENTIFIER_HOLDERS: holderScope.declaration,',
  'bound: holderBound,',
];

/** P1e: only reviews the loader read in full for added, unreached claims; review gaps stay gaps. */
const REVIEW_DERIVATION = [
  "    incomingScope.declaration === 'UNKNOWN' ? undefined : graph.incomingClaimReviewRead;",
  "    claimReviewRead?.outcome === 'EVERY_MATCHING_ROW_READ' ? claimReviewRead.requestedClaimIds : [],",
  '    addedClaims.filter((r) => !loadedClaims.has(r.id)).map((r) => r.id),',
  'const claimReviews = (reviewedClaims.size === 0 ? [] : claimReviewRead!.reviews).filter(',
  '      v.reviewedRelationshipClaimId !== null &&\n      reviewedClaims.has(v.reviewedRelationshipClaimId) &&\n      unreachedClaims.has(v.reviewedRelationshipClaimId),',
  'const claimReviewIds = new Set(claimReviews.map((v) => v.id));',
  '    reviewedClaims.size === 0 ? [] : claimReviewRead!.attestationReferences\n  ).filter((a) => claimReviewIds.has(a.reviewId));',
  '  const reviewChainUnread =\n    [...unreachedClaims].some((id) => !reviewedClaims.has(id)) ||\n    addedClaims.some((r) => !loadedSubjects.has(r.subjectId));',
  "...(reviewChainUnread ? { REVIEW_RECORDS: 'INCOMPLETE' as const } : {}),",
];

/** What S0 is given as records: the loader's, the report's claims, the read rows and reviews - nothing else. */
const RECORDS_SHAPE = [
  'subjects: [...input.subjects, ...sourceSubjectsRead],',
  'identityClaims: input.identityClaims,',
  'relationshipClaims: [...input.relationshipClaims, ...addedClaims],',
  'reviews: [...input.reviews, ...claimReviews],',
  '        ...attestations.records.map((a) => ({',
  '        ...claimReviewAttestations,\n      ],',
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
      /createPrivateKey|createPublicKey|generateKeyPair|\bsign\s*\(|\bverify\s*\(|ed25519|ReviewTrustSet|OPERATIONAL_OWNER_REVIEW_KEYS|ephemeralForVitest|testSeam|TrustedReviewerContext|VerifiedReviewEnvelope|appendAttestedReview|prepareReview|recordReview|execute(?:Propose|Claim|Relate)|verifyReviewAttestations|effectiveReviewProjection|currentlyAuthoritative|deriveSubjectReadModel|loadReviewAttestations|loadSubjectPage|subjectExists|subjectOfClaim|signedPayload|\.signature\b|nonceUseCounts|environmentId/.test(
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
      /'COMPLETE'|'COMPLETED'|\bisComplete\b|'FRESH'|'CURRENT'|'LATEST'|'AUTHENTICATED'|'VERIFIED'|'SIGNED'|'TRUSTED'|'ADMITTED'|'CONFIRMED'|'CLEAR'|'CLEARED'|'NOT_PROTECTED'|'GRANTED'|'ALLOWED'|'ELIGIBLE'|'APPROVED'|granted:\s*true|'SYNTHETIC_IN_MEMORY'|'CALLER_ASSERTED_RAN'|'INDEPENDENT'|'NO_PARENT'|'PARENT'|'RESOLVED'|'EVERY_REFERENCE'/.test(
        c,
      ),
  ],
  [
    'review-judged-or-widened',
    (c) =>
      /reviewOutcome|supersedesReviewId|reviewedSubjectId|reviewedIdentityClaimId|actorKey|headReviewId|\.chains\b|sourceTail|latestReview/.test(
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
      (c.match(/'INCOMPLETE'/g) ?? []).length !== 6 ||
      (c.match(/'EVERY_MATCHING_ROW_READ'/g) ?? []).length !== 1,
  ],
  [
    'gap-declared-represented',
    (c) =>
      /(INCOMING_RELATIONSHIP_CLAIMS|SHARED_IDENTIFIER_HOLDERS|REFERENCED_RECORDS|REVIEW_RECORDS|REVIEW_ATTESTATION_REFERENCES|RECORD_SCOPED_FINDINGS|INPUT_SCOPED_FINDINGS|NEIGHBOUR_RECORD_FINDINGS|VALIDATION_INPUTS|SOURCE_GLOBALS|PROTECTION_STATUS):\s*'REPRESENTED'\s+as\s+const|(INCOMING_RELATIONSHIP_CLAIMS|SHARED_IDENTIFIER_HOLDERS|RECORD_SCOPED_FINDINGS|INPUT_SCOPED_FINDINGS|NEIGHBOUR_RECORD_FINDINGS|VALIDATION_INPUTS|SOURCE_GLOBALS|PROTECTION_STATUS):\s*'REPRESENTED'/.test(
        c,
      ) || (c.match(/'REPRESENTED'/g) ?? []).length !== 8,
  ],
  ['earlier-derivation', (c) => !EARLIER_DERIVATION.every((s) => c.includes(s))],
  ['review-derivation', (c) => !REVIEW_DERIVATION.every((s) => c.includes(s))],
  [
    'incoming-selected-from-the-graph',
    (c) => /targetSubjectId|\.predicate\b|predicate:|identityClaims\s*\.filter|claimKind/.test(c),
  ],
  [
    'records-beyond-the-loader-the-report-and-the-reads',
    (c) =>
      !RECORDS_SHAPE.every((s) => c.includes(s)) ||
      (c.match(/\bsubjects:/g) ?? []).length !== 1 ||
      (c.match(/\breviews:/g) ?? []).length !== 1 ||
      (c.match(/\bidentityClaims:/g) ?? []).length !== 1 ||
      (c.match(/\.attestationReferences\b/g) ?? []).length !== 1 ||
      (c.match(/claimReviewRead!?\.reviews\b/g) ?? []).length !== 1 ||
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
        "incomingClaimReviews: 'READ',",
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
  "incomingClaimReviews: 'READ',",
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

describeRange('B2.5-P1e claim-review coverage: the change stays inside its scope', () => {
  it('changes exactly the authorised files, by path and status', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('touches no S0 file, other registry module, review protocol, earlier slice, migration, CLI, helper or dependency', () => {
    expect(changeset(...PROTECTED_PATHS)).toEqual([]);
  });

  it('adds its own firewall and edits exactly two earlier ones, by exactly their recorded lines', () => {
    expect(changeset('src/test/firewall/')).toEqual(
      [`A\t${FIREWALL}`, `M\t${P1C_FIREWALL}`, `M\t${P1D_FIREWALL}`].sort(),
    );
    for (const [file, edit] of Object.entries(FIREWALL_EDITS)) {
      const { removed, added } = diffLines(file);
      expect(removed, file).toEqual(edit.removed);
      expect(added, file).toHaveLength(edit.added);
      expect(sha256(added.join('\n')), file).toBe(edit.addedSha256);
      expect(added.join('\n'), file).not.toMatch(
        /\.(skip|only|todo|skipIf|runIf)\b|timeout|\bcatch\b|try\s*\{|expect\.soft|process\.env|not\.toContain/i,
      );
    }
  });

  it('keeps each edited firewall byte-identical outside its one recorded assertion block', () => {
    for (const [file, edit] of Object.entries(FIREWALL_EDITS)) {
      const before = baseSourceOf(file);
      const after = sourceOf(file);
      const head = (s: string) => s.slice(0, s.indexOf(edit.block));
      const tail = (s: string) => s.slice(s.indexOf(edit.next));
      expect(before.indexOf(edit.block), file).toBeGreaterThan(0);
      expect(before.indexOf(edit.next), file).toBeGreaterThan(before.indexOf(edit.block));
      expect(head(after), file).toBe(head(before));
      expect(tail(after), file).toBe(tail(before));
    }
  });

  it('keeps every earlier terminal pin and base commit, and every other firewall byte-identical', () => {
    for (const [file, pin] of Object.entries(EARLIER_TERMINAL_PINS)) {
      const line = `const REPAIR_TERMINAL_COMMIT: string | null = '${pin}';`;
      expect(sourceOf(file), file).toContain(line);
      expect(baseSourceOf(file), file).toContain(line);
      const base = /const REPAIR_BASE_COMMIT = '[0-9a-f]{40}';/.exec(baseSourceOf(file))![0];
      expect(sourceOf(file), file).toContain(base);
      if (!(file in FIREWALL_EDITS)) expect(sourceOf(file), file).toBe(baseSourceOf(file));
    }
  });

  it('removes exactly the recorded lines from each edited file, and nothing else', () => {
    for (const [file, removed] of Object.entries(REMOVED_LINES)) {
      expect(diffLines(file).removed, file).toEqual(removed);
    }
  });

  it('gains or loses no test in an edited test or firewall, and adds no skip, focus or timeout', () => {
    const tests = (source: string) => (codeOf(source).match(/\bit(\.each)?\(/g) ?? []).length;
    for (const file of [
      P1C_UNIT_TEST,
      P1C_INTEGRATION_TEST,
      P1D_UNIT_TEST,
      P1D_INTEGRATION_TEST,
      P1C_FIREWALL,
      P1D_FIREWALL,
    ]) {
      expect(tests(sourceOf(file)), file).toBe(tests(baseSourceOf(file)));
      expect(diffLines(file).added.join('\n'), file).not.toMatch(
        /\.(skip|only|todo|skipIf|runIf)\b|timeout|\bcatch\b|try\s*\{|expect\.soft|process\.env/i,
      );
    }
  });
});

describe('B2.5-P1e claim-review coverage: the store reads the included claims’ reviews, beside the graph', () => {
  it('breaks none of its static rules', () => {
    expect(storeViolationsOf(sourceOf(STORE))).toEqual([]);
  });

  it('sends exactly one statement more than the base: attestation references by exact review id', () => {
    const current = sqlOf(codeOf(sourceOf(STORE)));
    const base = sqlOf(codeOf(baseSourceOf(STORE)));
    expect(current).toHaveLength(base.length + 1);
    expect(current.filter((s) => REFERENCE_STATEMENT.test(s))).toHaveLength(1);
  });

  it('exports no new runtime name, and none that names a resolution, merge, trust or link', () => {
    expect(Object.keys(store).sort()).toEqual(runtimeExportsOf(codeOf(baseSourceOf(STORE))));
    for (const name of Object.keys(store)) {
      expect(name).not.toMatch(
        /merge|split|unify|dedup|resolv|link|equivalen|sameActor|promot|canonical|issue|mint|handoff|adopt|candidate|channel|opportunit|trust|verif|approv|admit/i,
      );
    }
  });
});

describe('B2.5-P1e claim-review coverage: the assembler adds only reviews read in full for its claims', () => {
  const source = sourceOf(ASSEMBLER);

  it('breaks none of its static rules and keeps the P1a transaction protocol', () => {
    expect(assemblerViolationsOf(source)).toEqual([]);
    expect(protocolHolds(source)).toBe(true);
  });

  it('exports exactly the P1a surface and states the stored-records-only limitation', () => {
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
    expect(assembler.SCOPE_DECLARATIONS.SOURCE_GLOBALS).toBe('INCOMPLETE');
    expect(assembler.SNAPSHOT_READ_FACTS.durableSourceRevision).toBe('NONE');
    expect(assembler.SCOPE_DECLARATION_BASIS.REVIEW_RECORDS).toMatch(
      /SOURCE_SUBJECT_REVIEWS_UNREAD$/,
    );
    expect(assembler.SNAPSHOT_READ_FACTS.loaderLimitations).toEqual(
      expect.arrayContaining([
        'ATTESTATION_PAYLOADS_SIGNATURES_ENVIRONMENT_AND_NONCE_COUNTS_NOT_REPRESENTED',
        'INCOMING_RELATIONSHIP_CLAIMS_CAPPED_OVERFLOW_DETECTED_NEVER_ENUMERATED',
        'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_STORED_RECORDS_ONLY_NOT_VERIFIED_NOT_TRUSTED_NOT_PROVEN_LATEST',
        'INCOMING_RELATIONSHIP_SOURCE_SUBJECT_ROWS_ONLY_THEIR_CLAIMS_RELATIONSHIPS_REVIEWS_NOT_READ',
        'PROTECTED_REGISTRY_NOT_CONSULTED',
        'VALIDATOR_NOT_RUN',
      ]),
    );
    expect(assembler.SNAPSHOT_READ_FACTS.loaderLimitations).not.toContain(
      'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_NOT_READ',
    );
  });

  it('has no production importer, and nothing else asks the loader for the claim-review read', () => {
    for (const file of productionFiles()) {
      const code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));
      if (file !== ASSEMBLER) {
        expect(code, file).not.toMatch(
          /subjectSnapshotRead|assembleSubjectSnapshotScope|SubjectSnapshotReadRefusal|SNAPSHOT_READ_FACTS/,
        );
      }
      if (file !== ASSEMBLER && file !== STORE) {
        expect(code, file).not.toMatch(
          /incomingClaimReviews|incomingClaimReviewRead|IncomingClaimReviewRead|IncomingClaimReviewAttestationReference/,
        );
      }
    }
  });

  it('adds tests with no focus, no timeout override, no trust seam, no signer and no environment read', () => {
    for (const file of [UNIT_TEST, INTEGRATION_TEST]) {
      const test = codeOf(sourceOf(file));
      expect(test, file).not.toMatch(/\.(only|todo)\(|it\.skip|timeout|process\.env/);
      expect(test, file).not.toMatch(
        /ReviewTrustSet|ephemeralForVitest|testSeam|OPERATIONAL_OWNER_REVIEW_KEYS|signRawPayload|signIntent|verifyReviewAttestations|effectiveReviewProjection/,
      );
      expect(test, file).not.toMatch(/\bfetch\s*\(|node:(net|tls|http|https|dns)\b|anthropic/);
      expect(test, file).not.toMatch(
        /subjectRegistry\/writer|subjectReview\/|researchCohortGuard|identityRegister|subjectHandoff/,
      );
    }
    expect(codeOf(sourceOf(UNIT_TEST))).not.toMatch(/describe\.skip/);
    expect(codeOf(sourceOf(INTEGRATION_TEST)).match(/describe\.skip/g)).toEqual(['describe.skip']);
    expect(codeOf(sourceOf(INTEGRATION_TEST))).toContain(
      "const describeDb = databaseConfigured() && testDatabaseUrl('readonly') ? describe : describe.skip;",
    );
  });
});

describe('B2.5-P1e claim-review coverage: every static rule can fire (mutation oracles)', () => {
  const storeSource = sourceOf(STORE);
  const source = sourceOf(ASSEMBLER);
  // A pattern missing from the source leaves it unchanged, and that oracle then fails on its own.
  const swapIn = (text: string, from: string, to: string) => text.replace(from, to);
  const storeSwap = (from: string, to: string) => swapIn(storeSource, from, to);

  it.each([
    ['store-runtime-import', `import pg from 'pg';\n${storeSource}`],
    [
      'store-imports-changed',
      storeSwap(
        "import type pg from 'pg';",
        "import type pg from 'pg';\nimport type { ReviewTrustSet } from '../subjectReview/trust.js';",
      ),
    ],
    ['store-mutating-or-transaction-sql', `${storeSource}\nconst q = 'DELETE FROM x';`],
    // Reading payloads or signatures, dropping the order or the bound, or a second new statement.
    [
      'store-sql-not-base-plus-one-reference-statement',
      storeSwap(
        'SELECT id, review_id, key_id, payload_sha256\n',
        'SELECT id, review_id, key_id, payload_sha256, signed_payload, signature\n',
      ),
    ],
    [
      'store-sql-not-base-plus-one-reference-statement',
      storeSwap(
        '                    ORDER BY id\n                    LIMIT $2`,',
        '                    LIMIT $2`,',
      ),
    ],
    [
      'store-sql-not-base-plus-one-reference-statement',
      `${storeSource}\nconst wider = \`SELECT id FROM discovery_subject_reviews WHERE review_target_key LIKE 'subject:%'\`;`,
    ],
    ['store-exports-changed', `${storeSource}\nexport function readIncomingClaimReviews() {}`],
    // Reading without the report, or without loaded attestations.
    [
      'store-gate-and-bound',
      storeSwap(
        "    options.incomingClaimReviews === 'READ' &&\n    incomingEnumeration !== undefined &&\n    attestations !== undefined\n",
        "    options.incomingClaimReviews === 'READ' &&\n    incomingEnumeration !== undefined\n",
      ),
    ],
    // An arbitrary review cap, or truncation instead of refusal.
    [
      'store-gate-and-bound',
      storeSwap(
        '[claimReviews.map((r) => r.id), MAX_GRAPH_ROWS + 1],',
        '[claimReviews.map((r) => r.id), 50],',
      ),
    ],
    // Omitting a claim, re-requesting held claims, or requesting the sentinel.
    [
      'store-claim-set-not-the-included-claims',
      storeSwap(
        'return included.filter((id) => !heldClaimIds.includes(id)).sort();',
        'return included.filter((id) => !heldClaimIds.includes(id)).sort().slice(1);',
      ),
    ],
    [
      'store-claim-set-not-the-included-claims',
      storeSwap(
        'return included.filter((id) => !heldClaimIds.includes(id)).sort();',
        'return included.sort();',
      ),
    ],
    [
      'store-claim-set-not-the-included-claims',
      storeSwap(
        "  if (enumeration.outcome === 'UNKNOWN') return [];\n  const included",
        '  const included',
      ),
    ],
    // Accepting a foreign, unordered, predecessor-less or partial result.
    [
      'store-result-guard',
      storeSwap('      requested.includes(row.reviewed_relationship_claim_id) &&\n', ''),
    ],
    ['store-result-guard', storeSwap('      row.reviewed_subject_id === null &&\n', '')],
    [
      'store-result-guard',
      storeSwap(
        '        target.get(row.supersedes_review_id) === row.reviewed_relationship_claim_id) &&',
        '        true) &&',
      ),
    ],
    [
      'store-result-guard',
      storeSwap(
        'reviews: whole ? returned.map(reviewRecord) : [],',
        'reviews: returned.map(reviewRecord),',
      ),
    ],
    [
      'store-result-guard',
      storeSwap(
        '    new Set(references.map((row) => row.review_id)).size === references.length &&\n',
        '',
      ),
    ],
    // Unauthorised expansion: the sources' reviews, attestation payloads, or merging into the graph.
    [
      'store-review-read-expands-or-merges-into-the-graph',
      storeSwap(
        '      claimReviewRead = claimReviewReadOf(requested, claimReviews, references);\n',
        '      claimReviewRead = claimReviewReadOf(requested, claimReviews, references);\n      reviewRows.push(...claimReviews);\n',
      ),
    ],
    [
      'store-review-read-expands-or-merges-into-the-graph',
      storeSwap(
        '        requested.map((id) => `relationship_claim:${id}`),\n      );',
        '        [...requested.map((id) => `relationship_claim:${id}`), ...incomingEnumeration.relationshipClaims.map((r) => `subject:${r.subjectId}`)],\n      );',
      ),
    ],
    [
      'store-review-read-expands-or-merges-into-the-graph',
      storeSwap(
        '      claimReviewRead = claimReviewReadOf(requested, claimReviews, references);\n',
        '      claimReviewRead = claimReviewReadOf(requested, claimReviews, references);\n      await loadReviewAttestations(q, claimReviews.map((r) => r.id));\n',
      ),
    ],
    [
      'store-review-read-before-the-incoming-report-or-attestations',
      storeSwap(
        '  // Direct incoming claims, reported beside the graph and never merged into it.\n',
        '  let claimReviewRead: IncomingClaimReviewRead | undefined;\n  // Direct incoming claims, reported beside the graph and never merged into it.\n',
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
    // Forbidden writer, signing, trust, cohort, research and cross-track identity imports.
    ['imports', inject("import { recordReview } from '../subjectRegistry/writer.js';")],
    ['imports', inject("import { signIntent } from '../subjectReview/signer.js';")],
    ['imports', inject("import { ReviewTrustSet } from '../subjectReview/trust.js';")],
    ['imports', inject("import { loadCohortRegistry } from '../researchCohortGuard.js';")],
    ['imports', inject("import { register } from '../../identityRegister/register.js';")],
    ['dynamic-import', `${source}\nconst later = () => import('../subjectReview/verify.js');`],
    // Trusted-review promotion, or reading what only verification needs.
    [
      'review-signing-trust-or-write',
      `${source}\nconst trusted = (g: unknown) => effectiveReviewProjection(g);`,
    ],
    ['review-signing-trust-or-write', `${source}\nconst keys = OPERATIONAL_OWNER_REVIEW_KEYS;`],
    [
      'review-signing-trust-or-write',
      `${source}\nconst p = (a: { signedPayload: string }) => a.signedPayload;`,
    ],
    ['cohort-research-classifier', `${source}\nconst c = 'HOLDOUT';`],
    ['canonical-identity-or-cross-track-contract', `${source}\nconst id = 'chn:x';`],
    ['own-pool-or-environment', `${source}\nconst url = process.env['DATABASE_URL_READONLY'];`],
    [
      'mutating-or-session-sql',
      `${source}\nconst q = 'INSERT INTO discovery_subject_reviews VALUES (1)';`,
    ],
    ['own-table-access', `${source}\nconst q = 'SELECT id FROM subject_review_attestations';`],
    ['one-connect', `${source}\nconst second = () => source.connect();`],
    // A stored review read as approval, trust or currentness.
    ['stronger-state', `${source}\nconst s = 'APPROVED';`],
    ['stronger-state', `${source}\nconst s = 'LATEST';`],
    ['stronger-state', `${source}\nconst s = 'TRUSTED';`],
    [
      'review-judged-or-widened',
      `${source}\nconst ok = (v: { reviewOutcome: string }) => v.reviewOutcome;`,
    ],
    [
      'review-judged-or-widened',
      `${source}\nconst h = (m: { headReviewId: string }) => m.headReviewId;`,
    ],
    // Incorrect promotion of review completeness.
    [
      'review-derivation',
      swap(
        "    claimReviewRead?.outcome === 'EVERY_MATCHING_ROW_READ' ? claimReviewRead.requestedClaimIds : [],",
        '    claimReviewRead?.requestedClaimIds ?? [],',
      ),
    ],
    [
      'review-derivation',
      swap(
        '  const reviewChainUnread =\n    [...unreachedClaims].some((id) => !reviewedClaims.has(id)) ||\n    addedClaims.some((r) => !loadedSubjects.has(r.subjectId));',
        '  const reviewChainUnread = [...unreachedClaims].some((id) => !reviewedClaims.has(id));',
      ),
    ],
    [
      'review-derivation',
      swap(
        '  const reviewChainUnread =\n    [...unreachedClaims].some((id) => !reviewedClaims.has(id)) ||\n    addedClaims.some((r) => !loadedSubjects.has(r.subjectId));',
        '  const reviewChainUnread =\n    false ||\n    addedClaims.some((r) => !loadedSubjects.has(r.subjectId));',
      ),
    ],
    [
      'review-derivation',
      swap("...(reviewChainUnread ? { REVIEW_RECORDS: 'INCOMPLETE' as const } : {}),", ''),
    ],
    [
      'gap-declared-represented',
      swap(
        "...(reviewChainUnread ? { REVIEW_RECORDS: 'INCOMPLETE' as const } : {}),",
        "...(reviewChainUnread ? { REVIEW_RECORDS: 'INCOMPLETE' as const } : { REVIEW_RECORDS: 'REPRESENTED' as const }),",
      ),
    ],
    [
      'gap-declared-represented',
      `${source}\nconst c = { REVIEW_ATTESTATION_REFERENCES: 'REPRESENTED' as const };`,
    ],
    // Using reviews from a refused read, of a held claim, or of anything else.
    [
      'review-derivation',
      swap(
        "    incomingScope.declaration === 'UNKNOWN' ? undefined : graph.incomingClaimReviewRead;",
        '    graph.incomingClaimReviewRead;',
      ),
    ],
    [
      'review-derivation',
      swap(
        '      reviewedClaims.has(v.reviewedRelationshipClaimId) &&\n      unreachedClaims.has(v.reviewedRelationshipClaimId),',
        '      reviewedClaims.has(v.reviewedRelationshipClaimId),',
      ),
    ],
    [
      'review-derivation',
      swap(
        '  ).filter((a) => claimReviewIds.has(a.reviewId));',
        '  ).filter((a) => a.reviewId.length > 0);',
      ),
    ],
    [
      'records-beyond-the-loader-the-report-and-the-reads',
      swap(
        'reviews: [...input.reviews, ...claimReviews],',
        'reviews: [...input.reviews, ...(graph.incomingClaimReviewRead?.reviews ?? [])],',
      ),
    ],
    // Silent omission of the reviews, or of their attestation references.
    [
      'records-beyond-the-loader-the-report-and-the-reads',
      swap('reviews: [...input.reviews, ...claimReviews],', 'reviews: input.reviews,'),
    ],
    [
      'records-beyond-the-loader-the-report-and-the-reads',
      swap('        ...claimReviewAttestations,\n      ],', '      ],'),
    ],
    // Forbidden graph expansion: the source subjects' rows or claims beyond P1d.
    [
      'records-beyond-the-loader-the-report-and-the-reads',
      swap(
        'subjects: [...input.subjects, ...sourceSubjectsRead],',
        'subjects: [...input.subjects, ...(graph.incomingClaimSourceSubjectRead?.subjects ?? [])],',
      ),
    ],
    [
      'earlier-derivation',
      swap(
        '          (s) => addedSources.has(s.id) && !loadedSubjects.has(s.id),',
        '          (s) => !loadedSubjects.has(s.id),',
      ),
    ],
    ['fixed-input-shape', swap("      incomingClaimReviews: 'READ',\n", '')],
    ['enumeration-outside-the-mappings', `${source}\nconst also = 'EVERY_MATCHING_ROW_READ';`],
    [
      'exported-functions',
      swap('function snapshotScopeInputOf(', 'export function snapshotScopeInputOf('),
    ],
  ])('fires %s on a mutated assembler (case %#)', (rule, mutated) => {
    expect(mutated).not.toBe(source);
    expect(assemblerViolationsOf(mutated)).toContain(rule);
  });

  it('fails a protocol that drops the review read, reads after the end check, or loads twice', () => {
    expect(protocolHolds(swap("      incomingClaimReviews: 'READ',\n", ''))).toBe(false);
    const late = source
      .replace("      incomingClaimReviews: 'READ',\n", '')
      .replace(
        '    const end = await readSnapshotState(connection);\n',
        "    const end = await readSnapshotState(connection);\n    void { incomingClaimReviews: 'READ', };\n",
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

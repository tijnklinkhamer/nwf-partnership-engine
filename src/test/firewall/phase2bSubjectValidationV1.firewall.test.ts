/**
 * TRACK B, B2.5-V1 - THE ISOLATION TEST FOR PARTITION-SAFE VALIDATION
 * FINDINGS.
 *
 * Per the phase-isolation convention this slice is pinned by its OWN file over
 * its OWN range, REPAIR_BASE_COMMIT (the accepted B2.5-P1e terminal) to
 * REPAIR_TERMINAL_COMMIT. It proves, from the real git range and the real
 * source:
 *
 *   - the change set is EXACTLY the P1a assembler, two new tests, this
 *     firewall and ONE recorded current-tree assertion of the P1a firewall
 *     (its runtime import closure now also reaches the pure, unmodified B2.1
 *     validator); the B2.1 validator and vocabulary, the B2.2 store, S0, every
 *     review, handoff, cohort, classifier and research path, every migration,
 *     the CLI, every earlier test and every dependency are untouched, and
 *     every earlier terminal pin stands;
 *   - the assembler removes only its recorded lines, so the P1a-P1e
 *     graph-to-input mapping AND the P1a-P1e one-snapshot read are
 *     byte-identical: both reads send the same statements; it imports exactly
 *     `validateIdentityGraph` (and a type) from B2.1, calls it once, reads no
 *     validity verdict or assessment, binds exactly the accepted rule version,
 *     takes the as-of (V1-R1) from the P1a read's ONE clock reading after the
 *     snapshot-taking state check - never the transaction or statement
 *     instant, never a second reading - and hands that same value to the
 *     validator and to S0 unchanged, publishes only INPUT and FOCAL_RECORD
 *     findings, withholds NEIGHBOUR_RECORD and UNSUPPLIED_RECORD findings and
 *     nothing for timing, keeps NEIGHBOUR_RECORD_FINDINGS INCOMPLETE, derives
 *     RECORD_SCOPED_FINDINGS from the focal-rule dependencies, re-checks S0's
 *     own partitions, calls the as-of no source revision or freshness and
 *     states nothing stronger anywhere;
 *   - it keeps P1a's exports, one connection, read-only transaction and
 *     ROLLBACK, holds no key, reads no protected cohort and nothing in
 *     production calls it.
 * Each static rule is also run against MUTATED copies of the source, so a
 * rule that could never fire is itself a failure. What cannot be proven
 * statically - which findings each partition holds, that a commit racing the
 * snapshot is no false finding and one after it is invisible, one snapshot -
 * is proven by the unit and integration tests named below.
 *
 * THE RANGE IS OPEN to the working tree while the slice is uncommitted; the
 * terminal pin belongs to a separately authorised commit-closure phase.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as assembler from '../../orgunits/subjectSnapshotRead/assemble.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B2.5-P1e terminal (implementation 0b2fa4c + firewall pin). */
const REPAIR_BASE_COMMIT = '8276c44c71ab676d177dfdceb21da1c31e75b380';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = 'feafd2c555bea5482cfc9c640ed1ba350ddb11d0';

const ASSEMBLER = 'src/orgunits/subjectSnapshotRead/assemble.ts';
const P1A_FIREWALL = 'src/test/firewall/phase2bSubjectSnapshotReadP1a.firewall.test.ts';
const UNIT_TEST = 'src/test/unit/discoverySubjectValidationB25V1.test.ts';
const INTEGRATION_TEST = 'src/test/integration/discoverySubjectValidationB25V1.test.ts';
const FIREWALL = 'src/test/firewall/phase2bSubjectValidationV1.firewall.test.ts';

const AUTHORISED_CHANGESET = [
  `M\t${ASSEMBLER}`,
  `M\t${P1A_FIREWALL}`,
  `A\t${UNIT_TEST}`,
  `A\t${INTEGRATION_TEST}`,
  `A\t${FIREWALL}`,
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
  [P1A_FIREWALL]: '7d0e81db33b320ecef09ba622077b015f38270c7',
  'src/test/firewall/phase2bSubjectHolderEnumerationP1b.firewall.test.ts':
    '9582cbeeebcb053b20f95a55d627dc3c05dc2e3f',
  'src/test/firewall/phase2bSubjectIncomingRelationsP1c.firewall.test.ts':
    'd3ce2cc4674393abcb244249fcabf705c24d7e98',
  'src/test/firewall/phase2bSubjectIncomingSourceSubjectsP1d.firewall.test.ts':
    '889ac5ece912b5aa527db26856b94422c8062de2',
  'src/test/firewall/phase2bSubjectIncomingClaimReviewsP1e.firewall.test.ts':
    '0b2fa4c3afbd8c278af1cb647eb27e26f8f2ccac',
};

/**
 * THE EXACT EDIT to the P1a firewall (OWNER sign-off required before commit):
 * its CURRENT-TREE runtime import-closure assertion, which reads the working
 * tree even though the P1a range is pinned, now also lists the three pure
 * B2.1 files the validator brings. Added only, by count and SHA-256, inside
 * the named `it(` block; nothing outside it changes, and every P1a static
 * rule still runs over P1a's own pinned tree.
 */
const P1A_EDIT = {
  removed: [] as string[],
  added: 4,
  addedSha256: 'e3a399e966625ef3a5aa3f79dc31c24468b59647d6c10c5ca4891c06caaf1a12',
  block:
    "  it('has exactly the reviewed runtime import closure: the SELECT-only store and pure S0', () => {",
  next: "  it('keeps the transaction protocol in its enforced order', () => {",
};

/** The EXACT lines the assembler may remove, verbatim. Its P1a-P1e input mapping loses none. */
const ASSEMBLER_REMOVED_LINES = [
  '      readonly read: typeof SNAPSHOT_READ_FACTS;',
  '      readonly read: typeof SNAPSHOT_READ_FACTS;',
  '      readonly read: typeof SNAPSHOT_READ_FACTS;',
  "    return { outcome: 'SUBJECT_NOT_FOUND', focalSubjectId, read: SNAPSHOT_READ_FACTS };",
  '  const input = snapshotScopeInputOf(graph);',
  '      read: SNAPSHOT_READ_FACTS,',
  '    read: SNAPSHOT_READ_FACTS,',
];

/** V1-R1: the P1a-P1e one-snapshot read, from its doc comment to its closing brace. */
const SNAPSHOT_READ_START = '/**\n * Reads the graph of `focalSubjectId` under one REPEATABLE READ';
const snapshotReadOf = (s: string): string =>
  s.slice(
    s.indexOf(SNAPSHOT_READ_START),
    s.indexOf('\n}\n', s.indexOf('async function readGraphInOneSnapshot(')),
  );

/** V1-R1: the validated input keeps the base input's as-of; it states RAN and the rule version only. */
const VALIDATED_VALIDATION_BLOCK = `    validation: {
      ...base.validation,
      ruleVersion: result.ruleVersion,
      execution: 'CALLER_ASSERTED_RAN',
    },`;

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

/** Production files at the base commit. */
const baseProductionFiles = (): string[] =>
  execFileSync(
    'git',
    ['-C', REPO_ROOT, 'ls-tree', '-r', '--name-only', REPAIR_BASE_COMMIT, 'src'],
    {
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter((f) => f.endsWith('.ts') && !f.startsWith('src/test/'));

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
  "import { validateIdentityGraph, type IdentityFinding } from '../identity/validate.js';",
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

/** The focal-rule dependencies, verbatim. */
const FOCAL_DEPENDENCIES_BLOCK = `const FOCAL_RULE_DEPENDENCIES = [
  'FOCAL_SUBJECT',
  'FOCAL_IDENTITY_CLAIMS',
  'OUTGOING_RELATIONSHIP_CLAIMS',
  'SHARED_IDENTIFIER_HOLDERS',
] as const satisfies readonly ScopeCategory[];`;

const count = (code: string, text: string) => code.split(text).length - 1;

/** After S0 builds, its OWN derived partitions are re-checked; anything else throws. */
const PARTITION_RECHECK = `  if (
    validated !== undefined &&
    (built.manifest.validation.findings.length !== input.findings.length ||
      built.manifest.validation.findings.some(
        (f) => !(PUBLISHED_PARTITIONS as readonly string[]).includes(f.partition),
      ))
  ) {
    throw new Error('a published finding is not an INPUT or FOCAL_RECORD finding in the manifest');
  }`;

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
      /node:(net|tls|http|https|dns|fs|child_process|os|worker_threads)\b|\bfetch\s*\(|Date\.now\(|Date\.parse\(|new Date\(|performance\.now|Math\.random|randomUUID|randomBytes/.test(
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
      /discovery_subject|subject_review|organisations|orgunit_|website_claims|ewp_|schema_migrations|pg_stat|protected_|cohort/.test(
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
      /researchCohortGuard|evaluationCohortGuard|loadEvaluationCohort|loadCohortRegistry|enforceRootResearchEligibility|HOLDOUT|DEV_TRAIN|orgunits\/(classify|orchestrator|web|signals)|\.\.\/(classify|orchestrator|web|signals|subjectReview|subjectHandoff)\/|claude-agent-sdk|anthropic|executeWebAttempt|runOrganisationDiscovery|runRootAcquisition/.test(
        c,
      ),
  ],
  // Exactly one call of the validator, and nothing else of B2.1 at all.
  [
    'identity-surface',
    (c) =>
      count(c, 'validateIdentityGraph(') !== 1 ||
      /kindEvidenceOf|adjacency\(|reaches\(|provenanceKeyOf|valueKeyOf|relationshipTargetKeyOf|reviewTargetKeyOf|structuralParent|admissibility|identity\/vocabulary|DISCOVERY_IDENTITY_RULE_VERSION/.test(
        c,
      ),
  ],
  // The validator's own verdict and assessments are never read.
  [
    'validity-verdict-read',
    (c) =>
      /structurallyValid|result\.subjects|result\.relationships|identityReview|reviewedKind|factualVerification|SubjectAssessment|RelationshipAssessment/.test(
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
      /'COMPLETE'|'COMPLETED'|\bisComplete\b|'FRESH'|'CURRENT'|'AUTHENTICATED'|'VERIFIED'|'SIGNED'|'CLEAR'|'CLEARED'|'NOT_PROTECTED'|'GRANTED'|'ALLOWED'|'ELIGIBLE'|'APPROVED'|'VALID'|granted:\s*true|'SYNTHETIC_IN_MEMORY'/.test(
        c,
      ),
  ],
  // S0's own execution vocabulary: the validated read states RAN once, the default NOT_RUN once.
  [
    'execution-vocabulary',
    (c) =>
      count(c, "'CALLER_ASSERTED_RAN'") !== 1 ||
      count(c, "execution: 'CALLER_ASSERTED_RAN',") !== 1 ||
      count(c, "execution: 'NOT_RUN',") !== 1 ||
      count(c, "inputOrigin: 'CALLER_SUPPLIED_UNVERIFIED',") !== 1,
  ],
  [
    'rule-version',
    (c) =>
      count(c, "const ACCEPTED_RULE_VERSION = 'discovery-identity-rules-v1';") !== 1 ||
      !c.includes('if (result.ruleVersion !== ACCEPTED_RULE_VERSION) {') ||
      /discovery-identity-rules-v(?!1')/.test(c),
  ],
  // V1-R1: BEGIN, then the snapshot-taking state check, then ONE clock reading -
  // the loader's as-of - and that same value, unchanged, for S0 and the validator.
  [
    'post-snapshot-as-of',
    (c) => {
      const begin = c.indexOf('    await connection.query(BEGIN_READ_SNAPSHOT);');
      const snapshot = c.indexOf('    const start = await readSnapshotState(connection);');
      const clock = c.indexOf('      asOf: await databaseNow(connection),');
      return (
        !c.includes("const validate = options?.validation === 'RUN';") ||
        !(begin > 0 && begin < snapshot && snapshot < clock) ||
        count(c, 'databaseNow(') !== 1 ||
        count(c, 'readSnapshotState(connection)') !== 2 ||
        count(c, 'transaction_timestamp()') !== 2 ||
        count(c, 'statement_timestamp()') !== 1 ||
        count(c, 'readGraphInOneSnapshot(source, focalSubjectId);') !== 1 ||
        count(c, '  const asOf = base.validation.asOf;') !== 1 ||
        !c.includes('  if (asOf === null || asOf !== graph.input.asOf) {') ||
        !c.includes(VALIDATED_VALIDATION_BLOCK) ||
        // The report's field, the loader's argument and P1e's own mapping: never a fourth.
        count(c, 'asOf:') !== 3 ||
        /\bnow\(\)|current_timestamp|localtimestamp|snapshotClock|transactionAsOf|TRANSACTION_AS_OF/i.test(
          c.replace('databaseNow(', ''),
        )
      );
    },
  ],
  [
    'as-of-not-a-revision',
    (c) =>
      !c.includes(
        "  validationAsOfMeaning:\n    'VALIDATION_INPUT_CONTENT_BOUND_NOT_A_DURABLE_SOURCE_REVISION_NOT_A_FRESHNESS_GUARANTEE',",
      ) || !c.includes("  durableSourceRevision: 'NONE',"),
  ],
  [
    'published-partitions',
    (c) =>
      count(
        c,
        "const PUBLISHED_PARTITIONS = Object.freeze(['INPUT', 'FOCAL_RECORD'] as const);",
      ) !== 1 || !c.includes(PARTITION_RECHECK),
  ],
  [
    'neighbour-and-unsupplied-withheld',
    (c) =>
      !c.includes(
        "if (partition === 'NEIGHBOUR_RECORD') {\n      diagnostics.push({ finding, partition, reason: 'NEIGHBOUR_RECORD_PARTIAL_GRAPH' });",
      ) ||
      !c.includes(
        "} else if (partition === 'UNSUPPLIED_RECORD') {\n      diagnostics.push({ finding, partition, reason: 'UNSUPPLIED_RECORD' });",
      ) ||
      count(c, 'published.push(') !== 1,
  ],
  [
    'neighbour-coverage',
    (c) =>
      count(c, "NEIGHBOUR_RECORD_FINDINGS: 'INCOMPLETE',") !== 1 ||
      /NEIGHBOUR_RECORD_FINDINGS:\s*'REPRESENTED'/.test(c),
  ],
  [
    'focal-coverage',
    (c) =>
      count(c, FOCAL_DEPENDENCIES_BLOCK) !== 1 ||
      count(c, 'RECORD_SCOPED_FINDINGS: focalCoverage,') !== 1 ||
      /RECORD_SCOPED_FINDINGS:\s*'REPRESENTED'/.test(c) ||
      !c.includes("focalGaps.push('LOADER_GRAPH_REFERENCE_NOT_SUPPLIED');"),
  ],
  // V1-R1: nothing is withheld for timing; a published finding is never filtered by its code.
  [
    'no-timing-withholding',
    (c) =>
      count(c, 'diagnostics.push(') !== 2 ||
      !c.includes("  readonly reason: 'NEIGHBOUR_RECORD_PARTIAL_GRAPH' | 'UNSUPPLIED_RECORD';") ||
      /AS_OF_SNAPSHOT_RACE|asOfRace|raced|'TIMESTAMP_AFTER_AS_OF'|\.code\s*[!=]==/.test(c),
  ],
  [
    'protection-and-gaps',
    (c) =>
      !c.includes('protectionCheck: PROTECTION_CHECK,') ||
      /(PROTECTION_STATUS|SOURCE_GLOBALS|INCOMING_RELATIONSHIP_CLAIMS|SHARED_IDENTIFIER_HOLDERS):\s*'REPRESENTED'/.test(
        c,
      ),
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

const describeRange = rangeAvailable ? describe : describe.skip;

describeRange('B2.5-V1 validation findings: the change stays inside its scope', () => {
  it('changes exactly the authorised files, by path and status', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('touches no validator, store, S0, review, cohort, migration, CLI, helper or dependency', () => {
    expect(changeset(...PROTECTED_PATHS)).toEqual([]);
  });

  it('edits no existing unit or integration test', () => {
    expect(changeset('src/test/unit/')).toEqual([`A\t${UNIT_TEST}`]);
    expect(changeset('src/test/integration/')).toEqual([`A\t${INTEGRATION_TEST}`]);
  });

  it('adds its own firewall and edits exactly the P1a one, by exactly its recorded lines', () => {
    expect(changeset('src/test/firewall/')).toEqual(
      [`A\t${FIREWALL}`, `M\t${P1A_FIREWALL}`].sort(),
    );
    const { removed, added } = diffLines(P1A_FIREWALL);
    expect(removed).toEqual(P1A_EDIT.removed);
    expect(added).toHaveLength(P1A_EDIT.added);
    expect(sha256(added.join('\n'))).toBe(P1A_EDIT.addedSha256);
    expect(added.join('\n')).not.toMatch(
      /\.(skip|only|todo|skipIf|runIf)\b|timeout|\bcatch\b|try\s*\{|expect\.soft|process\.env/i,
    );
    expect(
      added.slice(1).every((l) => /^ {8}'src\/orgunits\/identity\/[a-z]+\.ts',$/i.test(l)),
    ).toBe(true);
  });

  it('keeps the P1a firewall byte-identical outside its one recorded assertion block, with as many tests', () => {
    const before = baseSourceOf(P1A_FIREWALL);
    const after = sourceOf(P1A_FIREWALL);
    const head = (s: string) => s.slice(0, s.indexOf(P1A_EDIT.block));
    const tail = (s: string) => s.slice(s.indexOf(P1A_EDIT.next));
    expect(before.indexOf(P1A_EDIT.block)).toBeGreaterThan(0);
    expect(before.indexOf(P1A_EDIT.next)).toBeGreaterThan(before.indexOf(P1A_EDIT.block));
    expect(head(after)).toBe(head(before));
    expect(tail(after)).toBe(tail(before));
    const tests = (s: string) => (codeOf(s).match(/\bit(?:\.each\([\s\S]*?\))?\(/g) ?? []).length;
    expect(tests(after)).toBe(tests(before));
  });

  it('keeps every earlier terminal pin and base commit, and every other firewall byte-identical', () => {
    for (const [file, pin] of Object.entries(EARLIER_TERMINAL_PINS)) {
      const line = `const REPAIR_TERMINAL_COMMIT: string | null = '${pin}';`;
      expect(sourceOf(file), file).toContain(line);
      expect(baseSourceOf(file), file).toContain(line);
      const base = /const REPAIR_BASE_COMMIT = '[0-9a-f]{40}';/.exec(baseSourceOf(file))![0];
      expect(sourceOf(file), file).toContain(base);
      if (file !== P1A_FIREWALL) expect(sourceOf(file), file).toBe(baseSourceOf(file));
    }
  });

  it('keeps the P1a-P1e one-snapshot read byte-identical: its one post-snapshot clock reading is the as-of', () => {
    expect(snapshotReadOf(sourceOf(ASSEMBLER)).length).toBeGreaterThan(1000);
    expect(snapshotReadOf(sourceOf(ASSEMBLER))).toBe(snapshotReadOf(baseSourceOf(ASSEMBLER)));
    const protocol = (s: string) =>
      s.slice(
        s.indexOf('const NO_OPEN_TRANSACTION_BLOCK ='),
        s.indexOf('interface TransactionState'),
      );
    expect(protocol(sourceOf(ASSEMBLER))).toBe(protocol(baseSourceOf(ASSEMBLER)));
    expect(snapshotReadOf(sourceOf(ASSEMBLER))).toContain(
      '    const start = await readSnapshotState(connection);\n    graph = await loadSubjectGraph(connection, focalSubjectId, {\n      asOf: await databaseNow(connection),',
    );
  });

  it('removes only its recorded assembler lines: the P1a-P1e input mapping is byte-identical', () => {
    expect(diffLines(ASSEMBLER).removed).toEqual(ASSEMBLER_REMOVED_LINES);
    const mapping = (s: string) =>
      s.slice(
        s.indexOf('function snapshotScopeInputOf(graph: SubjectGraph): SnapshotScopeInput {'),
        s.indexOf('\n}\n', s.indexOf('function snapshotScopeInputOf(')),
      );
    expect(mapping(sourceOf(ASSEMBLER)).length).toBeGreaterThan(1000);
    expect(mapping(sourceOf(ASSEMBLER))).toBe(mapping(baseSourceOf(ASSEMBLER)));
  });
});

describe('B2.5-V1 validation findings: narrow, read-only, unconnected', () => {
  const source = sourceOf(ASSEMBLER);

  it('breaks none of its static rules', () => {
    expect(violationsOf(source)).toEqual([]);
  });

  it('has exactly the reviewed runtime import closure: store, S0 and the pure B2.1 validator', () => {
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
        'src/orgunits/identity/admissibility.ts',
        'src/orgunits/identity/validate.ts',
        'src/orgunits/identity/vocabulary.ts',
        'src/orgunits/subjectRegistry/store.ts',
        'src/orgunits/subjectSnapshot/canonical.ts',
        'src/orgunits/subjectSnapshot/contract.ts',
        'src/orgunits/subjectSnapshot/manifest.ts',
        // B2.5-M1 (current tree only): the pure, provisional acquisition companion.
        'src/orgunits/subjectReadProvenance/companion.ts',
        'src/orgunits/subjectReadProvenance/contract.ts',
      ].sort(),
    );
    expect([...external]).toEqual(['node:crypto']);
    // The validator it reaches is the B2.1 one, byte for byte, and pure.
    for (const file of [...closure].filter((f) => f.startsWith('src/orgunits/identity/'))) {
      expect(readFileSync(join(REPO_ROOT, file), 'utf8'), file).toBe(baseSourceOf(file));
      expect(codeOf(readFileSync(join(REPO_ROOT, file), 'utf8')), file).not.toMatch(
        /from 'pg'|node:(net|tls|http|https|dns|fs)|process\.env|Math\.random|Date\.now\(/,
      );
    }
  });

  it('exports exactly the P1a surface, with the default read facts unchanged', () => {
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
    expect(assembler.SNAPSHOT_READ_FACTS.loaderLimitations).toContain('VALIDATOR_NOT_RUN');
    expect(assembler.SNAPSHOT_READ_FACTS.validationAsOf).toBe(
      'DATABASE_CLOCK_READ_INSIDE_THE_TRANSACTION_SESSION_DEPENDENT',
    );
    expect(assembler.SCOPE_DECLARATIONS.RECORD_SCOPED_FINDINGS).toBe('UNKNOWN');
    expect(assembler.SCOPE_DECLARATIONS.NEIGHBOUR_RECORD_FINDINGS).toBe('UNKNOWN');
    expect(assembler.SCOPE_DECLARATION_BASIS.NEIGHBOUR_RECORD_FINDINGS).toBe('VALIDATOR_NOT_RUN');
    expect([...assembler.SNAPSHOT_READ_REFUSAL_CODES]).toEqual([
      'FOCAL_SUBJECT_ID_MALFORMED',
      'CONNECTION_IN_OPEN_TRANSACTION',
      'TRANSACTION_NOT_REPEATABLE_READ',
      'TRANSACTION_NOT_READ_ONLY',
      'TRANSACTION_SNAPSHOT_CHANGED',
      'REVIEW_ATTESTATIONS_NOT_LOADED',
    ]);
  });

  it('has no production importer; the B2.1 validator gains exactly this one importer', () => {
    const importers = (files: string[], read: (f: string) => string) =>
      files.filter(
        (f) =>
          !f.startsWith('src/orgunits/identity/') &&
          /orgunits\/identity\/|\.\.\/identity\//.test(codeOf(read(f))),
      );
    const now = importers(productionFiles(), (f) => readFileSync(join(REPO_ROOT, f), 'utf8'));
    const before = importers(baseProductionFiles(), baseSourceOf);
    expect(now.sort()).toEqual([...before, ASSEMBLER].sort());
    for (const file of productionFiles()) {
      if (file === ASSEMBLER) continue;
      expect(codeOf(readFileSync(join(REPO_ROOT, file), 'utf8')), file).not.toMatch(
        /subjectSnapshotRead|assembleSubjectSnapshotScope|SubjectSnapshotReadRefusal|SNAPSHOT_READ_FACTS|validation:\s*'RUN'/,
      );
    }
  });

  it('adds tests with no focus, no timeout override, no trust seam, no signer, no writer and no cohort', () => {
    for (const file of [UNIT_TEST, INTEGRATION_TEST]) {
      const test = codeOf(sourceOf(file));
      expect(test, file).not.toMatch(/\.(only|todo)\(|it\.skip|timeout|process\.env/);
      expect(test, file).not.toMatch(
        /ReviewTrustSet|ephemeralForVitest|testSeam|OPERATIONAL_OWNER_REVIEW_KEYS|signRawPayload|signIntent|verifyReviewAttestations|effectiveReviewProjection/,
      );
      expect(test, file).not.toMatch(/\bfetch\s*\(|node:(net|tls|http|https|dns)\b|anthropic/);
      expect(test, file).not.toMatch(
        /subjectRegistry\/writer|subjectReview\/|researchCohortGuard|cohortTestRegistry|identityRegister|subjectHandoff/,
      );
    }
    expect(codeOf(sourceOf(UNIT_TEST))).not.toMatch(/describe\.skip/);
    expect(codeOf(sourceOf(INTEGRATION_TEST)).match(/describe\.skip/g)).toEqual(['describe.skip']);
    expect(codeOf(sourceOf(INTEGRATION_TEST))).toContain(
      "const describeDb = databaseConfigured() && testDatabaseUrl('readonly') ? describe : describe.skip;",
    );
  });
});

describe('B2.5-V1 validation findings: every static rule can fire (mutation oracles)', () => {
  const source = sourceOf(ASSEMBLER);
  const inject = (line: string) =>
    source.replace("import type pg from 'pg';", `import type pg from 'pg';\n${line}`);
  // A pattern missing from the source leaves it unchanged, and that oracle then fails on its own.
  const swap = (from: string, to: string) => source.replace(from, to);

  it.each([
    ['imports', inject("import { executeClaim } from '../subjectRegistry/writer.js';")],
    ['imports', inject("import { kindEvidenceOf } from '../identity/validate.js';")],
    ['imports', inject("import { signRawPayload } from '../subjectReview/signer.js';")],
    [
      'imports',
      inject(
        "import { enforceRootResearchEligibility } from '../orchestrator/researchCohortGuard.js';",
      ),
    ],
    ['dynamic-import', `${source}\nconst later = () => import('../subjectRegistry/writer.js');`],
    ['own-pool-or-environment', `${source}\nconst url = process.env['DATABASE_URL_READONLY'];`],
    ['socket-file-clock-randomness', `${source}\nconst t = Date.now();`],
    ['mutating-or-session-sql', `${source}\nconst q = 'INSERT INTO x VALUES (1)';`],
    ['own-table-access', `${source}\nconst q = 'SELECT 1 FROM discovery_subjects';`],
    ['own-table-access', `${source}\nconst c = 'protected_cohort';`],
    [
      'own-sql-set',
      swap(
        "`SELECT current_setting('transaction_isolation') AS isolation,",
        "`SELECT current_setting('transaction_isolation') AS iso,",
      ),
    ],
    ['one-connect', `${source}\nconst second = () => source.connect();`],
    [
      'rollback-end',
      swap("const END_READ_SNAPSHOT = 'ROLLBACK';", "const END_READ_SNAPSHOT = 'END';"),
    ],
    ['review-signing-trust-or-write', `${source}\nconst trust = ReviewTrustSet.operational();`],
    ['cohort-research-classifier', `${source}\nconst g = enforceRootResearchEligibility;`],
    ['identity-surface', `${source}\nconst again = validateIdentityGraph(records);`],
    ['identity-surface', `${source}\nconst k = kindEvidenceOf;`],
    ['validity-verdict-read', `${source}\nconst ok = result.structurallyValid;`],
    ['validity-verdict-read', `${source}\nconst s = result.subjects;`],
    ['canonical-identity-or-cross-track-contract', `${source}\nconst id = 'cand:x';`],
    ['stronger-state', `${source}\nconst s = 'VALID';`],
    ['stronger-state', `${source}\nconst s = 'AUTHENTICATED';`],
    ['execution-vocabulary', swap("execution: 'CALLER_ASSERTED_RAN',", "execution: 'UNKNOWN',")],
    ['execution-vocabulary', swap("execution: 'NOT_RUN',", "execution: 'CALLER_ASSERTED_RAN',")],
    [
      'rule-version',
      swap(
        "const ACCEPTED_RULE_VERSION = 'discovery-identity-rules-v1';",
        "const ACCEPTED_RULE_VERSION = 'discovery-identity-rules-v2';",
      ),
    ],
    ['rule-version', swap('if (result.ruleVersion !== ACCEPTED_RULE_VERSION) {', 'if (false) {')],
    // V1-R1: the clock read before the snapshot-taking state check ...
    [
      'post-snapshot-as-of',
      swap(
        '    const start = await readSnapshotState(connection);\n    graph = await loadSubjectGraph(connection, focalSubjectId, {\n      asOf: await databaseNow(connection),',
        '    const early = await databaseNow(connection);\n    const start = await readSnapshotState(connection);\n    graph = await loadSubjectGraph(connection, focalSubjectId, {\n      asOf: early,',
      ),
    ],
    // ... or before BEGIN, before any snapshot exists ...
    [
      'post-snapshot-as-of',
      swap(
        "    phase = 'OPEN';\n    await connection.query(BEGIN_READ_SNAPSHOT);",
        "    const early = await databaseNow(connection);\n    phase = 'OPEN';\n    await connection.query(BEGIN_READ_SNAPSHOT);",
      ),
    ],
    // ... or an instant fixed before the snapshot, or a second reading.
    [
      'post-snapshot-as-of',
      `${source}\nconst q = \`SELECT transaction_timestamp() AT TIME ZONE 'UTC' AS as_of\`;`,
    ],
    ['post-snapshot-as-of', `${source}\nconst q = 'SELECT statement_timestamp() AS as_of';`],
    ['post-snapshot-as-of', `${source}\nconst q = 'SELECT now() AS as_of';`],
    ['post-snapshot-as-of', `${source}\nconst again = (c: never) => databaseNow(c);`],
    [
      'post-snapshot-as-of',
      swap(
        "      execution: 'CALLER_ASSERTED_RAN',\n    },",
        "      execution: 'CALLER_ASSERTED_RAN',\n      asOf: graph.input.asOf,\n    },",
      ),
    ],
    [
      'post-snapshot-as-of',
      swap('  if (asOf === null || asOf !== graph.input.asOf) {', '  if (asOf === null) {'),
    ],
    [
      'post-snapshot-as-of',
      swap("const validate = options?.validation === 'RUN';", 'const validate = true;'),
    ],
    [
      'post-snapshot-as-of',
      swap(
        'await readGraphInOneSnapshot(source, focalSubjectId);',
        'await readGraphInOneSnapshot(source, focalSubjectId, validate);',
      ),
    ],
    [
      'as-of-not-a-revision',
      swap(
        "'VALIDATION_INPUT_CONTENT_BOUND_NOT_A_DURABLE_SOURCE_REVISION_NOT_A_FRESHNESS_GUARANTEE'",
        "'VALIDATION_INPUT_CONTENT_BOUND'",
      ),
    ],
    [
      'published-partitions',
      swap(
        "Object.freeze(['INPUT', 'FOCAL_RECORD'] as const)",
        "Object.freeze(['INPUT', 'FOCAL_RECORD', 'NEIGHBOUR_RECORD'] as const)",
      ),
    ],
    [
      'published-partitions',
      swap(
        '    validated !== undefined &&\n    (built.manifest',
        '    false &&\n    (built.manifest',
      ),
    ],
    [
      'neighbour-and-unsupplied-withheld',
      swap("if (partition === 'NEIGHBOUR_RECORD') {", "if (partition === ('NONE' as string)) {"),
    ],
    [
      'neighbour-and-unsupplied-withheld',
      swap(
        "} else if (partition === 'UNSUPPLIED_RECORD') {",
        "} else if (partition === ('NONE' as string)) {",
      ),
    ],
    [
      'neighbour-and-unsupplied-withheld',
      `${source}\nconst leak = (x: unknown) => published.push(x);`,
    ],
    [
      'neighbour-coverage',
      swap("NEIGHBOUR_RECORD_FINDINGS: 'INCOMPLETE',", "NEIGHBOUR_RECORD_FINDINGS: 'REPRESENTED',"),
    ],
    [
      'focal-coverage',
      swap("  'SHARED_IDENTIFIER_HOLDERS',\n] as const satisfies", '] as const satisfies'),
    ],
    [
      'focal-coverage',
      swap('RECORD_SCOPED_FINDINGS: focalCoverage,', "RECORD_SCOPED_FINDINGS: 'REPRESENTED',"),
    ],
    ['focal-coverage', swap("focalGaps.push('LOADER_GRAPH_REFERENCE_NOT_SUPPLIED');", '')],
    ['no-timing-withholding', `${source}\nconst r = 'AS_OF_SNAPSHOT_RACE_UNDECIDABLE';`],
    [
      'no-timing-withholding',
      swap(
        '    } else {\n      published.push(finding);',
        "    } else if (finding.code === 'TIMESTAMP_AFTER_AS_OF') {\n      diagnostics.push({ finding, partition, reason: 'UNSUPPLIED_RECORD' });\n    } else {\n      published.push(finding);",
      ),
    ],
    [
      'no-timing-withholding',
      swap(
        "  readonly reason: 'NEIGHBOUR_RECORD_PARTIAL_GRAPH' | 'UNSUPPLIED_RECORD';",
        "  readonly reason: 'NEIGHBOUR_RECORD_PARTIAL_GRAPH' | 'UNSUPPLIED_RECORD' | 'AS_OF';",
      ),
    ],
    [
      'protection-and-gaps',
      swap("PROTECTION_STATUS: 'UNKNOWN',", "PROTECTION_STATUS: 'REPRESENTED',"),
    ],
    ['exported-functions', `${source}\nexport function validatedInput() {}`],
  ] as const)('rule %s fires on a mutated assembler', (rule, mutated) => {
    expect(mutated).not.toBe(source);
    expect(violationsOf(mutated)).toContain(rule);
  });
});

/**
 * TRACK B, B2.5-M1 - THE ISOLATION TEST FOR THE STABLE RECORD-SET DIGEST AND
 * THE PROVISIONAL ACQUISITION COMPANION
 * (`nwf-pe.discovery-subject-acquisition-companion.m1-provisional`).
 *
 * Per the phase-isolation convention this slice is pinned by its OWN file over
 * its OWN range, REPAIR_BASE_COMMIT (the accepted B2.5-V1-R1 terminal) to
 * REPAIR_TERMINAL_COMMIT. It proves, from the real git range and the real
 * source:
 *
 *   - the change set is EXACTLY two new pure production files under
 *     `src/orgunits/subjectReadProvenance/`, the assembler (by ADDED lines
 *     only), two new tests, this firewall and ONE recorded current-tree
 *     assertion each of the S0, P1a and V1 firewalls; S0, the B2.1 validator,
 *     the B2.2 store, every review, handoff, cohort, classifier and research
 *     path, every migration, the CLI, every earlier test and every dependency
 *     are untouched, and every earlier terminal pin stands;
 *   - the assembler removes nothing: the P1a-P1e read, the graph-to-input
 *     mapping and the V1 validated input are byte-identical, it imports
 *     exactly the companion builder (and two types), calls it once and only
 *     under the exact opt-in, adds no statement, no export and no state;
 *   - the companion is pure: it imports node:crypto, its own contract and
 *     exactly the S0 digest check and reproduction check (and two types) -
 *     never the S0 builder, encoder or comparison - and no loader, review,
 *     handoff, identity, cohort or research module; it names no loader
 *     report, B2.4 or H1 contract, holds no key and states no completeness,
 *     freshness, authentication, trust, protection clearance or grant;
 *   - nothing but the assembler imports it, and nothing in production asks
 *     for it.
 * Each static rule is also run against MUTATED copies of the source, so a
 * rule that could never fire is itself a failure. What cannot be proven
 * statically - digest stability, refusals, forged observations, one snapshot -
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
import * as companionContract from '../../orgunits/subjectReadProvenance/contract.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B2.5-V1-R1 terminal (implementation feafd2c + firewall pin). */
const REPAIR_BASE_COMMIT = '012196b50564b70e108c57032436fd9320db0198';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = '99b266e363fb801ee31e56c498a19fe40e4d6785';

const ASSEMBLER = 'src/orgunits/subjectSnapshotRead/assemble.ts';
const COMPANION_DIR = 'src/orgunits/subjectReadProvenance/';
const COMPANION = 'src/orgunits/subjectReadProvenance/companion.ts';
const CONTRACT = 'src/orgunits/subjectReadProvenance/contract.ts';
const PRODUCTION_FILES = [COMPANION, CONTRACT];
const S0_FIREWALL = 'src/test/firewall/phase2bSubjectSnapshotScopeS0.firewall.test.ts';
const P1A_FIREWALL = 'src/test/firewall/phase2bSubjectSnapshotReadP1a.firewall.test.ts';
const V1_FIREWALL = 'src/test/firewall/phase2bSubjectValidationV1.firewall.test.ts';
const UNIT_TEST = 'src/test/unit/discoverySubjectAcquisitionB25M1.test.ts';
const INTEGRATION_TEST = 'src/test/integration/discoverySubjectAcquisitionB25M1.test.ts';
const FIREWALL = 'src/test/firewall/phase2bSubjectAcquisitionM1.firewall.test.ts';

const AUTHORISED_CHANGESET = [
  `A\t${COMPANION}`,
  `A\t${CONTRACT}`,
  `M\t${ASSEMBLER}`,
  `M\t${S0_FIREWALL}`,
  `M\t${P1A_FIREWALL}`,
  `M\t${V1_FIREWALL}`,
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
  [S0_FIREWALL]: 'f28382f92eb42f2b0114651b4b4cbad6637089cd',
  [P1A_FIREWALL]: '7d0e81db33b320ecef09ba622077b015f38270c7',
  'src/test/firewall/phase2bSubjectHolderEnumerationP1b.firewall.test.ts':
    '9582cbeeebcb053b20f95a55d627dc3c05dc2e3f',
  'src/test/firewall/phase2bSubjectIncomingRelationsP1c.firewall.test.ts':
    'd3ce2cc4674393abcb244249fcabf705c24d7e98',
  'src/test/firewall/phase2bSubjectIncomingSourceSubjectsP1d.firewall.test.ts':
    '889ac5ece912b5aa527db26856b94422c8062de2',
  'src/test/firewall/phase2bSubjectIncomingClaimReviewsP1e.firewall.test.ts':
    '0b2fa4c3afbd8c278af1cb647eb27e26f8f2ccac',
  [V1_FIREWALL]: 'feafd2c555bea5482cfc9c640ed1ba350ddb11d0',
};

/**
 * THE EXACT EDITS to three earlier firewalls (OWNER sign-off required before
 * commit). Each is added lines only, by count and SHA-256, inside the one
 * named `it(` block whose CURRENT-TREE assertion reads the working tree even
 * though that firewall's range is pinned:
 *   - S0: its "no production importer" scan now also removes, from exactly
 *     the companion file, exactly one S0 import form - after, and outside, its
 *     historical pinned-tree loop;
 *   - P1a and V1: the assembler's runtime import closure now also lists the
 *     two pure companion files.
 */
const EARLIER_FIREWALL_EDITS: Readonly<
  Record<string, { added: number; addedSha256: string; block: string; next: string | null }>
> = {
  [S0_FIREWALL]: {
    added: 12,
    addedSha256: 'da3e5efc209e7df4985649d078458da6d045b944a71a8a3f62644f9552f8eb00',
    block: '/** Paths this slice may not touch at all. */',
    next: null,
  },
  [P1A_FIREWALL]: {
    added: 3,
    addedSha256: '2e56d1910bfca37b2f5c3aefb4923321a46a320adba0f1b94ea05d4e59f98871',
    block:
      "  it('has exactly the reviewed runtime import closure: the SELECT-only store and pure S0', () => {",
    next: "  it('keeps the transaction protocol in its enforced order', () => {",
  },
  [V1_FIREWALL]: {
    added: 3,
    addedSha256: '2e56d1910bfca37b2f5c3aefb4923321a46a320adba0f1b94ea05d4e59f98871',
    block:
      "  it('has exactly the reviewed runtime import closure: store, S0 and the pure B2.1 validator', () => {",
    next: "  it('exports exactly the P1a surface, with the default read facts unchanged', () => {",
  },
};

/** The S0 firewall's two added pieces, verbatim: the declarations and the one exemption line. */
const S0_ADDED_IMPORT_FORM =
  "  /import \\{\\s*reproduceSnapshotScopeManifest,\\s*verifySnapshotScopeManifest,\\s*type SnapshotScopeInput,\\s*type SnapshotScopeManifest,\\s*\\} from '\\.\\.\\/subjectSnapshot\\/manifest\\.js';/;";
const S0_ADDED_EXEMPTION =
  "      if (file === B25_M1_COMPANION) code = code.replace(B25_M1_SNAPSHOT_IMPORT, '');";
const S0_IMPORT_FORM = new RegExp(
  "import \\{\\s*reproduceSnapshotScopeManifest,\\s*verifySnapshotScopeManifest,\\s*type SnapshotScopeInput,\\s*type SnapshotScopeManifest,\\s*\\} from '\\.\\.\\/subjectSnapshot\\/manifest\\.js';",
);
const S0_FORBIDDEN =
  /subjectSnapshot|snapshot-scope-manifest|buildSnapshotScopeManifest|compareSnapshotScopeWithReference/;

/** The assembler's runtime import closure on the current tree, and the files added to it. */
const ASSEMBLER_CLOSURE = [
  ASSEMBLER,
  'src/orgunits/identity/admissibility.ts',
  'src/orgunits/identity/validate.ts',
  'src/orgunits/identity/vocabulary.ts',
  'src/orgunits/subjectRegistry/store.ts',
  'src/orgunits/subjectSnapshot/canonical.ts',
  'src/orgunits/subjectSnapshot/contract.ts',
  'src/orgunits/subjectSnapshot/manifest.ts',
  COMPANION,
  CONTRACT,
].sort();

/** The exact import statements the assembler may have: V1's, plus the companion builder. */
const ASSEMBLER_IMPORTS = [
  "import type pg from 'pg';",
  "import { validateIdentityGraph, type IdentityFinding } from '../identity/validate.js';",
  "import { databaseNow, loadSubjectGraph, MAX_SHARED_IDENTIFIER_HOLDERS, } from '../subjectRegistry/store.js';",
  "import { PROTECTION_CHECK, SNAPSHOT_SCOPE_CONTRACT, UUID, type CategoryDeclaration, type ScopeCategory, type SnapshotScopeRefusalCode, } from '../subjectSnapshot/contract.js';",
  "import { buildSnapshotScopeManifest, type SnapshotScopeInput, type SnapshotScopeManifest, } from '../subjectSnapshot/manifest.js';",
  "import { buildAcquisitionCompanion, type AcquisitionCompanion, type AcquisitionObservations, } from '../subjectReadProvenance/companion.js';",
];

/** The exact import statements each companion file may have. */
const COMPANION_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  [CONTRACT]: [],
  [COMPANION]: [
    "import { createHash } from 'node:crypto';",
    "import { reproduceSnapshotScopeManifest, verifySnapshotScopeManifest, type SnapshotScopeInput, type SnapshotScopeManifest, } from '../subjectSnapshot/manifest.js';",
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

/** The loader-report names only the assembler and the store may use (P1b-P1e scans). */
const LOADER_REPORT_NAMES =
  /sharedIdentifierHolders:\s*'REPORT'|sharedIdentifierHolderEnumeration|SharedIdentifierHolderEnumeration|incomingRelationships:\s*'REPORT'|incomingRelationshipClaimEnumeration|IncomingRelationshipClaimEnumeration|incomingClaimSourceSubjects|incomingClaimSourceSubjectRead|IncomingClaimSourceSubjectRead|incomingClaimReviews|incomingClaimReviewRead|IncomingClaimReviewRead|IncomingClaimReviewAttestationReference/;

/** Rules over each companion file's comment-stripped code; each returns its name when broken. */
const COMPANION_RULES: readonly (readonly [string, (code: string, file: string) => boolean])[] = [
  [
    'imports',
    (c, f) =>
      JSON.stringify(importStatementsOf(c).filter((s) => !s.includes("from './contract.js'"))) !==
      JSON.stringify(COMPANION_IMPORTS[f]),
  ],
  ['dynamic-import', (c) => /\bimport\s*\(|\brequire\s*\(/.test(c)],
  [
    'socket-file-db-environment',
    (c) =>
      /node:(net|tls|http|https|dns|fs|child_process|os|worker_threads)\b|\bfetch\s*\(|from 'pg'|\/db\/|\bPool\b|\.query\s*\(|\.connect\s*\(|process\.env|readFile|writeFile|createReadStream/.test(
        c,
      ),
  ],
  [
    'clock-or-randomness',
    (c) =>
      /Date\.now\(|new Date\(|Date\.parse|performance\.now|Math\.random|randomUUID|randomBytes|getRandomValues/.test(
        c,
      ),
  ],
  [
    'sql',
    (c) =>
      /\b(SELECT|INSERT|UPDATE|DELETE|TRUNCATE)\s+(INTO|FROM|\w+\s+SET)|discovery_subject|subject_review_|organisations\b|orgunit_/.test(
        c,
      ),
  ],
  [
    'key-signing-or-trust',
    (c) =>
      /createPrivateKey|createPublicKey|generateKeyPair|\bsign\s*\(|\bverify\s*\(|ed25519|PRIVATE KEY|ReviewTrustSet|ephemeralForVitest|testSeam|TrustedReviewerContext|VerifiedReviewEnvelope|appendAttestedReview|prepareReview|\brecordReview\b/i.test(
        c,
      ),
  ],
  [
    'earlier-slice-or-research',
    (c) =>
      /subjectRegistry|subjectReview|subjectHandoff|subjectSnapshotRead|discoverySubjects|\.\.\/identity\/|orgunits\/identity|researchCohortGuard|evaluationCohortGuard|loadEvaluationCohort|HOLDOUT|DEV_TRAIN|orgunits\/(classify|orchestrator|web|signals)|\.\.\/(classify|orchestrator|web|signals)\/|claude-agent-sdk|anthropic|executeWebAttempt|runOrganisationDiscovery|assembleSubjectSnapshotScope|SNAPSHOT_READ_FACTS|validation:\s*'RUN'/i.test(
        c,
      ),
  ],
  ['loader-report-names', (c) => LOADER_REPORT_NAMES.test(c)],
  [
    's0-builder-encoder-or-comparison',
    (c) =>
      /buildSnapshotScopeManifest|compareSnapshotScopeWithReference|manifestCanonicalJson|manifestDigestOf\b|recordContentDigestOf|membershipDigestOf|snapshot-scope-manifest|subjectSnapshot\/(canonical|contract)/.test(
        c,
      ),
  ],
  [
    'canonical-identity-or-cross-track-contract',
    (c) =>
      /[`'"](cand|chn|opp):|SAME_ACTOR|sameActor|mergedInto|MERGED_INTO|equivalentTo|identityRegister|nwf_identity|discovery-identity-handoff|nwf-identity\.|discovery-subject-evidence|projectSubjectEvidence/.test(
        c,
      ),
  ],
  [
    'stronger-state',
    (c) =>
      /'(COMPLETE|COMPLETED|PROVEN|FRESH|CURRENT|LATEST|AUTHENTICATED|VERIFIED|SIGNED|TRUSTED|ESTABLISHED|ADMITTED|CONFIRMED_IDENTITY|CLEAR|CLEARED|NOT_PROTECTED|GRANTED|ALLOWED|ELIGIBLE|APPROVED|INDEPENDENT|NO_PARENT|EXHAUSTIVE_SOURCE|SOURCE_COMPLETE|VERIFIED_HEAD)'|\bisComplete\b|\bcomplete:\s*true|granted:\s*true|verified:\s*true/.test(
        c,
      ),
  ],
  [
    'exported-functions',
    (c, f) =>
      JSON.stringify([...c.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1])) !==
      JSON.stringify(
        f === COMPANION
          ? [
              'companionCanonicalJson',
              'recordSetDigestOf',
              'acquisitionDigestOfBody',
              'buildAcquisitionCompanion',
              'verifyAcquisitionCompanion',
              'reproduceAcquisitionCompanion',
            ]
          : [],
      ),
  ],
];

const companionViolationsOf = (source: string, file: string): string[] =>
  COMPANION_RULES.filter(([, broken]) => broken(codeOf(source), file)).map(([name]) => name);

/** The record-set filter: source globals never reach an entry, stored types by allow-list only. */
const recordSetFilterViolationsOf = (source: string): string[] => {
  const code = codeOf(source);
  const violations: string[] = [];
  if (
    !/if \(recordType === 'SOURCE_GLOBAL'\) \{(?:(?!\n {4}\}\n)[\s\S])*\n {6}continue;\n {4}\}\n {4}if \(!oneOf\(RECORD_SET_RULE\.includedRecordTypes, recordType\)\) \{/.test(
      code,
    )
  ) {
    violations.push('source-global-skip-then-allow-list');
  }
  if ((code.match(/entries\.push\(/g) ?? []).length !== 1) violations.push('one-entry-push');
  if (/excludedMembership|EXCLUDED/.test(code)) violations.push('deny-list-filter');
  return violations;
};

/** Rules over the assembler's ADDED code lines (comment lines dropped). */
const ADDED_RULES: readonly (readonly [string, (added: string) => boolean])[] = [
  [
    'statement-or-connection',
    (a) =>
      /\.query\s*[<(]|\.connect\s*\(|\.release\s*\(|\b(SELECT|BEGIN|ROLLBACK|COMMIT|INSERT|UPDATE|DELETE)\b|databaseNow|loadSubjectGraph\(|readGraphInOneSnapshot\(/.test(
        a,
      ),
  ],
  [
    'socket-file-clock-randomness-environment',
    (a) =>
      /node:|\bfetch\s*\(|Date\.now\(|new Date\(|Math\.random|randomUUID|process\.env|readFile|writeFile/.test(
        a,
      ),
  ],
  [
    'stronger-state',
    (a) =>
      /'(COMPLETE|COMPLETED|PROVEN|FRESH|CURRENT|LATEST|AUTHENTICATED|VERIFIED|SIGNED|TRUSTED|CLEAR|NOT_PROTECTED|GRANTED|ALLOWED|ELIGIBLE|APPROVED|INDEPENDENT|REPRESENTED|EXHAUSTIVE_AS_DECLARED|CALLER_ASSERTED_RAN)'/.test(
        a,
      ),
  ],
  [
    'review-signing-trust-or-write',
    (a) =>
      /subjectReview|subjectRegistry|subjectHandoff|ReviewTrustSet|testSeam|TrustedReviewerContext|VerifiedReviewEnvelope|\bsign\s*\(|\bverify\s*\(|writer|research|classif|cohort/i.test(
        a,
      ),
  ],
  [
    'a-second-builder-call-or-s0-call',
    (a) =>
      (a.match(/buildAcquisitionCompanion\(/g) ?? []).length !== 1 ||
      /buildSnapshotScopeManifest|verifySnapshotScopeManifest|reproduceSnapshotScopeManifest|recordSetDigestOf|verifyAcquisitionCompanion/.test(
        a,
      ),
  ],
  ['exact-opt-in', (a) => !a.includes("if (options?.acquisitionCompanion === 'BUILD') {")],
  [
    'refusal-returns-nothing',
    (a) =>
      !/if \(companion\.outcome === 'REFUSED'\) \{\s*throw new Error\(/.test(a) ||
      !a.includes('...(acquisition !== undefined ? { acquisition } : {}),'),
  ],
  ['export', (a) => /^export /m.test(a)],
];

const addedCodeOf = (lines: readonly string[]): string =>
  codeOf(lines.filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join('\n'));

const addedViolationsOf = (lines: readonly string[]): string[] =>
  ADDED_RULES.filter(([, broken]) => broken(addedCodeOf(lines))).map(([name]) => name);

/** One top-level function of a file, from its doc comment to its closing brace. */
const functionOf = (s: string, signature: string): string => {
  const at = s.indexOf(signature);
  const doc = s.lastIndexOf('/**', at);
  return at < 0 ? '' : s.slice(doc, s.indexOf('\n}\n', at) + 2);
};

const describeRange = rangeAvailable ? describe : describe.skip;

describeRange('B2.5-M1 acquisition companion: the change stays inside its scope', () => {
  it('changes exactly the authorised files, by path and status', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('touches no S0 file, earlier slice, migration, CLI, helper, governance record or dependency', () => {
    expect(changeset(...PROTECTED_PATHS)).toEqual([]);
  });

  it('edits exactly three earlier firewalls, each by exactly its recorded added lines', () => {
    expect(changeset('src/test/firewall/')).toEqual(
      [`A\t${FIREWALL}`, `M\t${S0_FIREWALL}`, `M\t${P1A_FIREWALL}`, `M\t${V1_FIREWALL}`].sort(),
    );
    for (const [file, edit] of Object.entries(EARLIER_FIREWALL_EDITS)) {
      const { removed, added } = diffLines(file);
      expect(removed, file).toEqual([]);
      expect(added.length, file).toBe(edit.added);
      expect(sha256(added.join('\n')), file).toBe(edit.addedSha256);
      expect(added.join('\n'), file).not.toMatch(
        /\.(skip|only|todo|skipIf|runIf)\b|timeout|\bcatch\b|try\s*\{|expect\.soft|process\.env|\bit\(|describe\(/i,
      );
    }
  });

  it('keeps every edit inside its named block, and every earlier pin, base and test count', () => {
    for (const [file, edit] of Object.entries(EARLIER_FIREWALL_EDITS)) {
      const now = sourceOf(file);
      const base = baseSourceOf(file);
      // Outside the named block (and, for S0, outside the declarations and the
      // current-tree loop), the file is byte-identical to the accepted one.
      if (edit.next !== null) {
        const cut = (s: string) => {
          const start = s.indexOf(edit.block);
          const end = s.indexOf(edit.next!, start);
          expect(start, file).toBeGreaterThan(-1);
          expect(end, file).toBeGreaterThan(start);
          return [s.slice(0, start), s.slice(end)];
        };
        expect(cut(now), file).toEqual(cut(base));
      }
      const tests = (s: string) => (codeOf(s).match(/\bit\(/g) ?? []).length;
      expect(tests(now), file).toBe(tests(base));
    }
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

  it('edits no existing unit or integration test', () => {
    expect(changeset('src/test/unit/')).toEqual([`A\t${UNIT_TEST}`]);
    expect(changeset('src/test/integration/')).toEqual([`A\t${INTEGRATION_TEST}`]);
  });
});

describeRange(
  'B2.5-M1 historical firewall corrections: one exact path, historical claims intact',
  () => {
    const s0 = sourceOf(S0_FIREWALL);
    const s0Base = baseSourceOf(S0_FIREWALL);

    it('S0 admits exactly the one companion file by exactly one import form, in its current loop only', () => {
      const { added } = diffLines(S0_FIREWALL);
      expect(added).toContain(
        "const B25_M1_COMPANION = 'src/orgunits/subjectReadProvenance/companion.ts';",
      );
      expect(added).toContain(S0_ADDED_IMPORT_FORM);
      expect(added.at(-1)).toBe(S0_ADDED_EXEMPTION);
      const code = codeOf(s0);
      expect(code.match(/B25_M1_COMPANION/g)).toHaveLength(2);
      expect(code.match(/B25_M1_SNAPSHOT_IMPORT/g)).toHaveLength(2);
      expect(code).not.toMatch(/startsWith\([^)]*subjectReadProvenance|subjectReadProvenance\/'/);
      // The historical (pinned-tree) loop is byte-identical and carries no exception.
      const historical = (s: string) => {
        const at = s.indexOf('for (const file of pinned) {');
        return s.slice(at, s.indexOf('for (const file of productionFiles()) {', at));
      };
      expect(historical(s0).length).toBeGreaterThan(100);
      expect(historical(s0)).toBe(historical(s0Base));
      expect(historical(s0)).not.toMatch(/B25_M1|subjectReadProvenance/);
      // The exemption sits in the current loop, after the P1a one and before the scan.
      const current = s0.slice(
        s0.indexOf(
          'for (const file of productionFiles()) {',
          s0.indexOf('for (const file of pinned) {'),
        ),
      );
      const exempt = current.indexOf(S0_ADDED_EXEMPTION.trim());
      expect(exempt).toBeGreaterThan(current.indexOf('B25_P1A_SNAPSHOT_FORMS'));
      expect(exempt).toBeLessThan(current.indexOf('expect(code, file).not.toMatch(naming);'));
      // Everything S0 says it asserts outside that block is unchanged.
      const declarations = (s: string) => s.slice(0, s.indexOf('/**\n * B2.5-M1'));
      expect(declarations(s0)).toBe(s0Base.slice(0, declarations(s0).length));
    });

    it('would still fail a widened companion: the S0 exception removes only its own form', () => {
      const real = codeOf(sourceOf(COMPANION));
      const exempted = (c: string) => c.replace(S0_IMPORT_FORM, '');
      expect(exempted(real)).not.toMatch(S0_FORBIDDEN);
      for (const added of [
        "import { buildSnapshotScopeManifest } from '../subjectSnapshot/manifest.js';",
        "import { manifestCanonicalJson } from '../subjectSnapshot/canonical.js';",
        "import { SNAPSHOT_SCOPE_CONTRACT } from '../subjectSnapshot/contract.js';",
        "import { compareSnapshotScopeWithReference } from '../subjectSnapshot/manifest.js';",
      ]) {
        expect(exempted(`${real}\n${added}`), added).toMatch(S0_FORBIDDEN);
      }
      // One more name in the admitted import is no longer the admitted form.
      const widened = real.replace(
        'verifySnapshotScopeManifest,',
        'verifySnapshotScopeManifest,\n  buildSnapshotScopeManifest,',
      );
      expect(exempted(widened)).toMatch(S0_FORBIDDEN);
    });

    it('P1a and V1 list exactly the two companion files in their closure, current tree only', () => {
      for (const file of [P1A_FIREWALL, V1_FIREWALL]) {
        const { added } = diffLines(file);
        expect(added, file).toEqual([
          '        // B2.5-M1 (current tree only): the pure, provisional acquisition companion.',
          `        '${COMPANION}',`,
          `        '${CONTRACT}',`,
        ]);
      }
    });
  },
);

describe('B2.5-M1 acquisition companion: pure, self-contained, unconnected', () => {
  it('consists of exactly the two approved production files, outside S0, P1a and B2.4', () => {
    expect(productionFiles().filter((f) => f.startsWith(COMPANION_DIR))).toEqual(PRODUCTION_FILES);
    expect(productionFiles().filter((f) => f.startsWith('src/orgunits/subjectSnapshot/'))).toEqual([
      'src/orgunits/subjectSnapshot/canonical.ts',
      'src/orgunits/subjectSnapshot/contract.ts',
      'src/orgunits/subjectSnapshot/manifest.ts',
    ]);
    expect(
      productionFiles().filter((f) => f.startsWith('src/orgunits/subjectSnapshotRead/')),
    ).toEqual([ASSEMBLER]);
  });

  it('breaks none of its static rules', () => {
    for (const file of PRODUCTION_FILES) {
      expect(companionViolationsOf(sourceOf(file), file), file).toEqual([]);
    }
  });

  it('imports exactly its allow-list: node:crypto, its contract and two S0 checks', () => {
    expect(runtimeImportsOf(codeOf(sourceOf(CONTRACT)))).toEqual([]);
    expect(runtimeImportsOf(codeOf(sourceOf(COMPANION))).sort()).toEqual(
      ['../subjectSnapshot/manifest.js', './contract.js', 'node:crypto'].sort(),
    );
  });

  it('can state no completeness, freshness, authentication, trust, protection clearance or grant', () => {
    expect(companionContract.AUTHENTICITY).toMatchObject({
      sourceCompleteness: 'NOT_PROVEN',
      sourceFreshness: 'NOT_PROVEN',
      exportAuthentication: 'UNAUTHENTICATED',
      reviewerTrust: 'NONE_ESTABLISHED',
      protectionCheck: 'NOT_CONSULTED',
      protectionVerdict: 'UNKNOWN',
      latestReview: 'NOT_PROVEN',
      reviewHeadAsOfSnapshot: 'NOT_STATED',
      durableSourceRevision: 'NONE',
    });
    expect(Object.values(companionContract.PERMISSIONS)).toEqual(
      companionContract.PERMISSION_CAPABILITIES.map(() => 'NONE'),
    );
    expect(codeOf(sourceOf(CONTRACT))).toContain(
      "export type Permissions = { readonly [K in PermissionCapability]: 'NONE' };",
    );
    expect(companionContract.CANONICAL_ISSUER).toEqual({
      producerMayIssue: 'NONE',
      identifiersIssuedHere: 'NONE',
    });
    // The one review status that names completeness is qualified by the snapshot.
    expect(companionContract.REVIEW_READ_STATUSES).toEqual([
      'NOT_REQUESTED',
      'ZERO_MATCHING_ROWS',
      'COMPLETE_AS_OF_SNAPSHOT',
      'UNKNOWN',
    ]);
    expect(companionContract.CLOCK_TREATMENT).toMatchObject({
      serverClock: 'WALL_CLOCK_NOT_MONOTONIC_MAY_STEP_BACKWARDS',
      commitOrder: 'NOT_A_COMMIT_ORDER_MARKER',
      freshness: 'NOT_A_FRESHNESS_GUARANTEE',
    });
  });

  it('digests stored evidence records only; every source global stays bound by the manifest', () => {
    expect(companionContract.RECORD_SET_RULE.includedRecordTypes).toEqual([
      'SUBJECT',
      'IDENTITY_CLAIM',
      'RELATIONSHIP_CLAIM',
      'REVIEW',
      'REVIEW_ATTESTATION_REFERENCE',
    ]);
    expect(companionContract.RECORD_SET_RULE.excludedRecordTypes).toEqual(['SOURCE_GLOBAL']);
    expect(companionContract.RECORD_SET_RULE.excludedMembership).toEqual([
      'SOURCE_GLOBAL:ECHE_ROW_KEY_EXISTENCE',
      'SOURCE_GLOBAL:VALIDATION_AS_OF',
    ]);
    // A source global is checked, then always skipped; a stored type is admitted by allow-list.
    expect(recordSetFilterViolationsOf(sourceOf(COMPANION))).toEqual([]);
  });

  it('has no production importer but the assembler, and nothing asks for it', () => {
    const naming =
      /subjectReadProvenance|buildAcquisitionCompanion|recordSetDigestOf|AcquisitionCompanion|acquisitionCompanion|acquisition-companion/;
    for (const file of productionFiles()) {
      if (file.startsWith(COMPANION_DIR)) continue;
      let code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));
      if (file === ASSEMBLER) {
        code = code
          .replace(
            /import \{\s*buildAcquisitionCompanion,\s*type AcquisitionCompanion,\s*type AcquisitionObservations,\s*\} from '\.\.\/subjectReadProvenance\/companion\.js';/,
            '',
          )
          .replace(/\b(build)?AcquisitionCompanion\b|\bacquisitionCompanion\b/g, '');
      }
      expect(code, file).not.toMatch(naming);
    }
    // The B2.4 projection and the CLI never name it.
    for (const file of productionFiles().filter(
      (f) => f.startsWith('src/orgunits/subjectHandoff/') || f.startsWith('src/cli/'),
    )) {
      expect(codeOf(readFileSync(join(REPO_ROOT, file), 'utf8')), file).not.toMatch(
        /subjectReadProvenance|AcquisitionCompanion|acquisitionCompanion|recordSetDigest/,
      );
    }
  });
});

describe('B2.5-M1 assembler: an additive, opt-in integration', () => {
  it('removes no line, and keeps the P1a-P1e read, input mapping and V1 validated input byte-identical', () => {
    if (rangeAvailable) {
      const { removed, added } = diffLines(ASSEMBLER);
      expect(removed).toEqual([]);
      expect(addedViolationsOf(added)).toEqual([]);
    }
    const now = sourceOf(ASSEMBLER);
    const base = baseSourceOf(ASSEMBLER);
    for (const signature of [
      'async function readGraphInOneSnapshot(',
      'function snapshotScopeInputOf(',
      'function partitionsOf(',
      'function validatedInputOf(',
    ]) {
      expect(functionOf(now, signature).length, signature).toBeGreaterThan(200);
      expect(functionOf(now, signature), signature).toBe(functionOf(base, signature));
    }
  });

  it('has exactly the reviewed imports and runtime import closure', () => {
    expect(importStatementsOf(codeOf(sourceOf(ASSEMBLER)))).toEqual(ASSEMBLER_IMPORTS);
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
    expect([...closure].sort()).toEqual(ASSEMBLER_CLOSURE);
    expect([...external]).toEqual(['node:crypto']);
  });

  it('exports exactly the P1a surface, with the default facts and declarations unchanged', () => {
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
    const base = baseSourceOf(ASSEMBLER);
    for (const declaration of [
      'export const SCOPE_DECLARATIONS',
      'export const SCOPE_DECLARATION_BASIS',
      'export const SNAPSHOT_READ_FACTS',
      'const VALIDATED_READ_FACTS',
    ]) {
      const slice = (s: string) =>
        s.slice(s.indexOf(declaration), s.indexOf('\n\n', s.indexOf(declaration)));
      expect(slice(sourceOf(ASSEMBLER)), declaration).toBe(slice(base));
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

describe('B2.5-M1: every static rule can fire (mutation oracles)', () => {
  const companion = sourceOf(COMPANION);
  const contract = sourceOf(CONTRACT);
  const inject = (source: string, line: string) =>
    source.replace(
      "import { createHash } from 'node:crypto';",
      `import { createHash } from 'node:crypto';\n${line}`,
    );
  const append = (source: string, line: string) => `${source}\n${line}\n`;

  it.each([
    [
      'imports',
      inject(
        companion,
        "import { buildSnapshotScopeManifest } from '../subjectSnapshot/manifest.js';",
      ),
    ],
    ['imports', inject(companion, "import type pg from 'pg';")],
    [
      'dynamic-import',
      append(companion, "const m = await import('../subjectSnapshot/canonical.js');"),
    ],
    ['socket-file-db-environment', append(companion, "const url = process.env['DATABASE_URL'];")],
    ['socket-file-db-environment', append(companion, 'await client.query(sql);')],
    ['clock-or-randomness', append(companion, 'const at = Date.now();')],
    ['clock-or-randomness', append(contract, 'export const NONCE = Math.random();')],
    ['sql', append(companion, "const sql = 'SELECT id FROM discovery_subjects';")],
    ['key-signing-or-trust', append(companion, 'const ok = verify(null, data, key, sig);')],
    ['key-signing-or-trust', append(companion, 'const set = ReviewTrustSet.operational();')],
    ['earlier-slice-or-research', append(companion, "const p = '../subjectRegistry/store.js';")],
    ['earlier-slice-or-research', append(companion, "const opts = { validation: 'RUN' };")],
    ['loader-report-names', append(companion, 'type X = IncomingClaimReviewRead;')],
    [
      'loader-report-names',
      append(companion, 'const h = graph.sharedIdentifierHolderEnumeration;'),
    ],
    [
      's0-builder-encoder-or-comparison',
      append(companion, 'const m = buildSnapshotScopeManifest(input);'),
    ],
    [
      's0-builder-encoder-or-comparison',
      append(contract, "export const S = 'snapshot-scope-manifest';"),
    ],
    ['canonical-identity-or-cross-track-contract', append(contract, "export const ID = 'cand:1';")],
    [
      'canonical-identity-or-cross-track-contract',
      append(contract, "export const C = 'discovery-subject-evidence';"),
    ],
    ['stronger-state', append(contract, "export const S = 'COMPLETE';")],
    ['stronger-state', append(contract, "export const S = 'VERIFIED';")],
    ['stronger-state', append(contract, "export const S = 'PROVEN';")],
    ['stronger-state', append(companion, 'const c = { granted: true };')],
    ['exported-functions', append(companion, 'export function grantResearch() {}')],
  ] as const)('the %s rule fires on a mutated companion', (rule, mutated) => {
    const file = mutated.includes('PERMISSION_CAPABILITIES = [') ? CONTRACT : COMPANION;
    expect(companionViolationsOf(mutated, file)).toContain(rule);
  });

  it.each([
    [
      'source-global-skip-then-allow-list',
      companion.replace(
        '      // A source-global status, not a stored record: the manifest digest binds it.\n      continue;\n',
        '',
      ),
    ],
    [
      'source-global-skip-then-allow-list',
      companion.replace(
        'if (!oneOf(RECORD_SET_RULE.includedRecordTypes, recordType)) {',
        'if (!oneOf(MEMBERSHIP_RECORD_TYPES, recordType)) {',
      ),
    ],
    [
      'one-entry-push',
      companion.replace(
        '      byGlobalKey.add(recordId);\n',
        '      byGlobalKey.add(recordId);\n      entries.push({ recordType, recordId, contentDigest } as never);\n',
      ),
    ],
    [
      'deny-list-filter',
      append(companion, 'const EXCLUDED = new Set<string>(RECORD_SET_RULE.excludedMembership);'),
    ],
  ] as const)(
    'the record-set %s rule fires when a source global is reintroduced',
    (rule, mutated) => {
      expect(mutated).not.toBe(companion);
      expect(recordSetFilterViolationsOf(mutated)).toContain(rule);
    },
  );

  const added = rangeAvailable ? diffLines(ASSEMBLER).added : [];
  const itAdded = rangeAvailable ? it : it.skip;
  itAdded.each([
    ['statement-or-connection', [...added, '  await connection.query(BEGIN_READ_SNAPSHOT);']],
    ['statement-or-connection', [...added, '  const now = await databaseNow(connection);']],
    ['socket-file-clock-randomness-environment', [...added, '  const t = Date.now();']],
    ['stronger-state', [...added, "  const s = 'COMPLETE';"]],
    ['stronger-state', [...added, "  const d = { SHARED_IDENTIFIER_HOLDERS: 'REPRESENTED' };"]],
    [
      'review-signing-trust-or-write',
      [...added, "  import { x } from '../subjectReview/signer.js';"],
    ],
    [
      'a-second-builder-call-or-s0-call',
      [...added, '  const again = buildAcquisitionCompanion(args);'],
    ],
    ['a-second-builder-call-or-s0-call', [...added, '  const v = verifySnapshotScopeManifest(m);']],
    [
      'exact-opt-in',
      added.map((l) =>
        l.replace("options?.acquisitionCompanion === 'BUILD'", 'options?.acquisitionCompanion'),
      ),
    ],
    ['refusal-returns-nothing', added.map((l) => l.replace('throw new Error(', 'console.warn('))],
    ['export', [...added, 'export function companionOf() {}']],
  ] as const)('the %s rule fires on mutated assembler additions', (rule, lines) => {
    expect(addedViolationsOf(lines)).toContain(rule);
  });
});
